// Estado de cuenta de una tarjeta, pago de la tarjeta y deuda programada (módulo PURO: de ./storage solo
// `import type`, sin regex lookbehind, fechas locales a las 12:00).
//
// Un «estado» es el corte cerrado de la tarjeta (su fecha es la clave `cutKey`, 'AAAA-MM-DD'). Cada estado trae
// DOS saldos que se pagan por separado: quetzales (Q) y dólares (USD).
//  - El monto del estado es el REAL si la persona lo escribió (el banco no manda el total por SMS: llega por
//    correo) y, si no, el ESTIMADO: los cargos vinculados a la tarjeta en ese ciclo (las cuotas de visacuotas
//    ya son cargos con fecha de corte).
//  - Pagar la tarjeta es una transferencia NEUTRA (type 'transfer'): nunca un gasto nuevo. Lo pagado de un
//    estado se deriva de los movimientos con `cardPayment` (una sola mitad por pago: la de la tarjeta).
import type { Account, CreditInstallment, Currency, Transaction } from './storage';
import { storedToLocalDate } from './FixedCycle';
import {
  cutDate, cycleRange, dayNum, dueDateFor, effectiveCutoffDay, lastClosedCut, sumByCurrency,
} from './CardCycle';
import { cardOfInstallment, cutForInstallment, nextInstallmentCut } from './InstallmentSchedule';
import { applyTransferPair, transferPairIdFor } from './TransferPairs';

const WINDOW_MS = 36 * 60 * 60 * 1000;
const EPS = 0.005;
const PROPOSAL_TOLERANCE = 0.01;
const PROPOSAL_DUE_GRACE_DAYS = 5;

export type StatementStatus = 'pending' | 'partial' | 'paid' | 'overdue';

export interface MoneyPair { Q: number; USD: number }

export interface CardStatement {
  cardId: string;
  /** Fecha del corte 'AAAA-MM-DD' (clave estable del estado). */
  cutKey: string;
  cut: Date;
  /** Fecha límite de pago; null si la tarjeta no tiene día de pago. */
  due: Date | null;
  estimated: MoneyPair;
  /** Montos que la persona escribió del estado de cuenta (solo las monedas que escribió). */
  real?: { Q?: number; USD?: number };
  /** Lo que se debe pagar: el real si existe, si no el estimado (por moneda). */
  toPay: MoneyPair;
  paid: MoneyPair;
  remaining: MoneyPair;
  status: StatementStatus;
  /** true si algún monto a pagar sale de la estimación y no del estado de cuenta. */
  isEstimated: boolean;
  /** Ciclo abierto (después del último corte cerrado hasta hoy). */
  open: MoneyPair;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Clave 'AAAA-MM-DD' de un día local. */
export function cutKeyOf(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Fecha local (12:00) de una clave de corte; null si no es válida. */
export function cutFromKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

function pairOf(list: Array<{ currency: Currency; amount: number }>): MoneyPair {
  const out: MoneyPair = { Q: 0, USD: 0 };
  for (const c of list) {
    if (c.currency === 'Q') out.Q = Math.max(0, round2(c.amount));
    else if (c.currency === 'USD') out.USD = Math.max(0, round2(c.amount));
  }
  return out;
}

function isCreditCard(a: Account): boolean {
  return a.type === 'credit';
}

/** Corte anterior (un mes antes) de un corte dado. */
function previousCut(card: Account, cut: Date): Date {
  return cutDate(effectiveCutoffDay(card), cut.getFullYear(), cut.getMonth() - 1);
}

function nextCut(card: Account, cut: Date): Date {
  return cutDate(effectiveCutoffDay(card), cut.getFullYear(), cut.getMonth() + 1);
}

/** Cuotas de visacuotas activas de la tarjeta que caen en este corte y todavía no son un cargo (solo cortes futuros). */
function pendingInstallmentCharges(card: Account, insts: CreditInstallment[], txs: Transaction[], cut: Date, now: Date): MoneyPair {
  const out: MoneyPair = { Q: 0, USD: 0 };
  if (dayNum(cut) <= dayNum(now)) return out; // los cortes cumplidos ya generaron su cargo
  const cutN = dayNum(cut);
  for (const inst of insts) {
    if (!inst.isActive || inst.accountId !== card.id || !inst.trackSince) continue;
    const track = storedToLocalDate(inst.trackSince);
    if (!track || dayNum(track) > cutN) continue;
    const total = Math.min(Math.max(0, Math.floor(inst.totalInstallments) || 0), 1200);
    for (let n = 1; n <= total; n++) {
      const c = cutForInstallment(inst, card, n);
      if (!c) break;
      const cn = dayNum(c);
      if (cn > cutN) break;
      if (cn !== cutN) continue;
      const exists = txs.some(t => t.installmentId === inst.id && t.installmentNo === n);
      if (exists) continue;
      if (inst.currency === 'Q') out.Q = round2(out.Q + inst.monthlyPayment);
      else if (inst.currency === 'USD') out.USD = round2(out.USD + inst.monthlyPayment);
    }
  }
  return out;
}

/**
 * Estado de cuenta de una tarjeta: el del último corte cerrado (o el `cut` indicado, que puede ser también el
 * próximo corte para ver el estado que viene).
 */
export function statementFor(
  card: Account,
  txs: Transaction[],
  insts: CreditInstallment[],
  now: Date,
  cut?: Date,
): CardStatement {
  const cutD = cut ?? lastClosedCut(card, now);
  const cutKey = cutKeyOf(cutD);
  const range = cycleRange(card, cutD);

  const est = pairOf(sumByCurrency(txs, card.id, range.from, range.to));
  const pend = pendingInstallmentCharges(card, insts, txs, cutD, now);
  const estimated: MoneyPair = { Q: round2(est.Q + pend.Q), USD: round2(est.USD + pend.USD) };

  const override = (card.statementOverrides ?? []).find(o => o.cutKey === cutKey);
  let real: CardStatement['real'];
  if (override && (override.Q !== undefined || override.USD !== undefined)) {
    real = {};
    if (override.Q !== undefined) real.Q = override.Q;
    if (override.USD !== undefined) real.USD = override.USD;
  }
  const toPay: MoneyPair = {
    Q: round2(real?.Q ?? estimated.Q),
    USD: round2(real?.USD ?? estimated.USD),
  };
  const isEstimated = !real
    || (real.Q === undefined && estimated.Q > EPS)
    || (real.USD === undefined && estimated.USD > EPS);

  const paid: MoneyPair = { Q: 0, USD: 0 };
  for (const t of txs) {
    if (!t.cardPayment || t.cardPayment.cardId !== card.id || t.cardPayment.cutKey !== cutKey) continue;
    if (t.currency === 'Q') paid.Q = round2(paid.Q + t.amount);
    else if (t.currency === 'USD') paid.USD = round2(paid.USD + t.amount);
  }
  const remaining: MoneyPair = {
    Q: Math.max(0, round2(toPay.Q - paid.Q)),
    USD: Math.max(0, round2(toPay.USD - paid.USD)),
  };

  const due = dueDateFor(cutD, card.paymentDueDay);
  let status: StatementStatus;
  if (remaining.Q < EPS && remaining.USD < EPS) status = 'paid';
  else if (due && dayNum(now) > dayNum(due)) status = 'overdue';
  else if (paid.Q > EPS || paid.USD > EPS) status = 'partial';
  else status = 'pending';

  const closed = lastClosedCut(card, now);
  const openFrom = new Date(closed.getFullYear(), closed.getMonth(), closed.getDate() + 1, 12, 0, 0, 0);
  const open = pairOf(sumByCurrency(txs, card.id, openFrom, now));

  return { cardId: card.id, cutKey, cut: cutD, due, estimated, real, toPay, paid, remaining, status, isEstimated, open };
}

// ─────────────────────────────────────────────────────────────
// Deuda programada (pestaña «Fijos» de Presupuesto)
// ─────────────────────────────────────────────────────────────

export interface ScheduledDebt {
  id: string;
  kind: 'card' | 'loan';
  name: string;
  due: Date;
  amounts: Array<{ currency: Currency; amount: number }>;
  isEstimated: boolean;
  status?: StatementStatus;
  cardId?: string;
}

/**
 * Lo que hay que pagar hasta `until`: de cada tarjeta, el estado cerrado con saldo y el próximo estado (si ya
 * hay cargos o cuotas); de cada préstamo (visacuota sin tarjeta), su próxima cuota. Las cuotas de visacuotas de
 * una tarjeta ya están dentro del estado de su tarjeta (sin doble conteo). Ordenado por vencimiento.
 */
export function scheduledDebts(
  accounts: Account[],
  insts: CreditInstallment[],
  txs: Transaction[],
  now: Date,
  until: Date,
): ScheduledDebt[] {
  const out: ScheduledDebt[] = [];
  const untilN = dayNum(until);

  for (const card of accounts) {
    if (!card.isActive || !isCreditCard(card)) continue;
    const closed = lastClosedCut(card, now);
    for (const cut of [closed, nextCut(card, closed)]) {
      const st = statementFor(card, txs, insts, now, cut);
      if (!st.due || dayNum(st.due) > untilN) continue;
      const amounts: ScheduledDebt['amounts'] = [];
      if (st.remaining.Q > EPS) amounts.push({ currency: 'Q', amount: st.remaining.Q });
      if (st.remaining.USD > EPS) amounts.push({ currency: 'USD', amount: st.remaining.USD });
      if (amounts.length === 0) continue;
      out.push({
        id: `card_${card.id}_${st.cutKey}`, kind: 'card', name: card.name, due: st.due, amounts,
        isEstimated: st.isEstimated, status: st.status, cardId: card.id,
      });
    }
  }

  for (const inst of insts) {
    if (!inst.isActive || cardOfInstallment(inst, accounts)) continue;
    const due = nextInstallmentCut(inst, undefined, now);
    if (!due || dayNum(due) > untilN) continue;
    out.push({
      id: `loan_${inst.id}`, kind: 'loan', name: inst.name, due,
      amounts: [{ currency: inst.currency, amount: round2(inst.monthlyPayment) }], isEstimated: false,
    });
  }

  return out.sort((a, b) => a.due.getTime() - b.due.getTime() || (a.id < b.id ? -1 : 1));
}

function normName(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}

/** Quita de la lista los compromisos que ya figuran como gasto fijo activo (mismo nombre): sin doble conteo. */
export function debtsNotInFixed(debts: ScheduledDebt[], fixed: Array<{ name: string; isActive: boolean }>): ScheduledDebt[] {
  const names = fixed.filter(f => f.isActive).map(f => normName(f.name)).filter(n => n.length >= 3);
  if (names.length === 0) return debts;
  return debts.filter(d => {
    const n = normName(d.name);
    if (n.length < 3) return true;
    return !names.some(f => f.includes(n) || n.includes(f));
  });
}

/** Suma por moneda (Q y USD) de una lista de deudas. */
export function sumDebts(debts: ScheduledDebt[]): MoneyPair {
  const out: MoneyPair = { Q: 0, USD: 0 };
  for (const d of debts) {
    for (const a of d.amounts) {
      if (a.currency === 'Q') out.Q = round2(out.Q + a.amount);
      else if (a.currency === 'USD') out.USD = round2(out.USD + a.amount);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// SMS de pago de tarjeta
// ─────────────────────────────────────────────────────────────

export interface CardPaymentMatch {
  /** Movimiento de la tarjeta (el SMS «pago recibido» o un pago ya registrado) que cubre el estado. */
  txId: string;
  cardId: string;
  cutKey: string;
  /** Salida de la cuenta pagadora que era el mismo pago (se vuelve neutra). */
  outId?: string;
  /** true si `txId` ya era un pago de tarjeta y solo falta neutralizar la salida. */
  outOnly?: boolean;
}

function payCurrency(c: Currency): 'Q' | 'USD' | null {
  return c === 'Q' || c === 'USD' ? c : null;
}

function isPayOutflow(t: Transaction): boolean {
  return t.type === 'expense' && t.category === 'transfer' && !t.transferPairId && !t.cardPayment;
}

/** Salida de la cuenta pagadora de `card` con el mismo monto (±0.01) y moneda dentro de 36 h de `tms`. */
function findPayOutflow(card: Account, txs: Transaction[], cur: Currency, amount: number, tms: number, selfId: string): Transaction | null {
  if (!card.payFromAccountId) return null;
  let best: Transaction | null = null;
  let bestGap = Infinity;
  for (const t of txs) {
    if (t.id === selfId || !isPayOutflow(t) || t.accountId !== card.payFromAccountId || t.currency !== cur) continue;
    if (Math.abs(t.amount - amount) > PROPOSAL_TOLERANCE + 1e-9) continue;
    const gap = Math.abs(Date.parse(t.date) - tms);
    if (!isFinite(gap) || gap > WINDOW_MS) continue;
    if (gap < bestGap) { best = t; bestGap = gap; }
  }
  return best;
}

/**
 * Un SMS `card_payment` (movimiento neutro con la tarjeta como cuenta) va al estado cerrado más reciente que aún
 * debe esa moneda (visto desde la fecha del pago). Si hay una salida de la cuenta pagadora con el mismo monto
 * (±0.01) dentro de 36 h, es el mismo pago: se emparejan y no se crea ningún gasto nuevo.
 * Devuelve null si no aplica (no es de una tarjeta, ya está asignado o hay un pago manual igual registrado).
 */
export function matchCardPaymentSms(
  tx: Transaction,
  cards: Account[],
  txs: Transaction[],
  insts: CreditInstallment[],
  now: Date,
): CardPaymentMatch | null {
  if (tx.source !== 'sms' || tx.type !== 'transfer' || tx.transferPairId || tx.cardPayment || !tx.accountId) return null;
  const card = cards.find(c => c.id === tx.accountId && c.isActive && isCreditCard(c));
  if (!card) return null;
  const cur = payCurrency(tx.currency);
  const when = storedToLocalDate(tx.date);
  const tms = Date.parse(tx.date);
  if (!cur || !when || isNaN(tms)) return null;

  // Ya registraste ese pago a mano: el SMS no suma otro.
  for (const t of txs) {
    if (t.id === tx.id || !t.cardPayment || t.cardPayment.cardId !== card.id || t.source !== 'manual') continue;
    if (t.currency !== tx.currency || Math.abs(t.amount - tx.amount) > PROPOSAL_TOLERANCE + 1e-9) continue;
    if (Math.abs(Date.parse(t.date) - tms) <= WINDOW_MS) return null;
  }

  let cut = lastClosedCut(card, when);
  let chosen: Date | null = null;
  for (let i = 0; i < 3; i++) {
    const st = statementFor(card, txs, insts, now, cut);
    if (st.remaining[cur] > EPS) { chosen = cut; break; }
    cut = previousCut(card, cut);
  }
  const cutKey = cutKeyOf(chosen ?? lastClosedCut(card, when));
  const out = findPayOutflow(card, txs, tx.currency, tx.amount, tms, tx.id);
  return { txId: tx.id, cardId: card.id, cutKey, ...(out ? { outId: out.id } : {}) };
}

/**
 * La salida de la cuenta pagadora llegó DESPUÉS del SMS de la tarjeta: si ya hay un pago de esa tarjeta (SMS) con
 * el mismo monto dentro de 36 h, se empareja con él (la salida se vuelve neutra).
 */
export function matchOutflowToCardPayment(out: Transaction, cards: Account[], txs: Transaction[]): CardPaymentMatch | null {
  if (!isPayOutflow(out) || !out.accountId) return null;
  const tms = Date.parse(out.date);
  if (isNaN(tms)) return null;
  let best: { tx: Transaction; gap: number } | null = null;
  for (const t of txs) {
    if (t.id === out.id || !t.cardPayment || t.source !== 'sms' || t.type !== 'transfer' || t.transferPairId || t.transferPrev) continue;
    if (t.currency !== out.currency || Math.abs(t.amount - out.amount) > PROPOSAL_TOLERANCE + 1e-9) continue;
    const card = cards.find(c => c.id === t.cardPayment!.cardId);
    if (!card || card.payFromAccountId !== out.accountId) continue;
    const gap = Math.abs(Date.parse(t.date) - tms);
    if (!isFinite(gap) || gap > WINDOW_MS) continue;
    if (!best || gap < best.gap) best = { tx: t, gap };
  }
  if (!best) return null;
  return { txId: best.tx.id, cardId: best.tx.cardPayment!.cardId, cutKey: best.tx.cardPayment!.cutKey, outId: out.id, outOnly: true };
}

/**
 * Aplica el emparejamiento (puro): el movimiento de la tarjeta queda con `cardPayment` y la salida de la cuenta
 * pagadora se vuelve neutra (type 'transfer', transferPrev, mismo transferPairId, fromAccountId). `paired` dice
 * si la salida se pudo emparejar.
 */
export function applyCardPaymentMatch(txs: Transaction[], m: CardPaymentMatch): { txs: Transaction[]; paired: boolean } {
  const pay = txs.find(t => t.id === m.txId);
  if (!pay) return { txs, paired: false };
  let next = txs;
  let paired = false;
  if (m.outId) {
    const p = applyTransferPair(next, m.outId, m.txId);
    if (p !== next) { next = p; paired = true; }
  }
  const out = next.map(t => {
    if (t.id === m.txId && !t.cardPayment) return { ...t, cardPayment: { cardId: m.cardId, cutKey: m.cutKey } };
    if (paired && t.id === m.outId) {
      return { ...t, fromAccountId: t.accountId ?? t.fromAccountId, toAccountId: m.cardId };
    }
    return t;
  });
  return { txs: out, paired };
}

// ─────────────────────────────────────────────────────────────
// Propuestas: «¿Es el pago de tu tarjeta?»
// ─────────────────────────────────────────────────────────────

export interface CardPaymentProposal {
  outId: string;
  cardId: string;
  cutKey: string;
  currency: Currency;
  amount: number;
  /** Lo que faltaba por pagar de ese estado (en esa moneda). */
  remaining: number;
}

export function cardPaymentProposalKey(outId: string, cardId: string): string {
  return `cpay|${outId}|${cardId}`;
}

/**
 * Salida de la cuenta pagadora de una tarjeta cuyo monto es ≈ lo que falta del estado (±1%) y cae entre el corte
 * y el vencimiento + 5 días: se propone como pago de esa tarjeta.
 */
export function proposeCardPayment(
  out: Transaction,
  cards: Account[],
  txs: Transaction[],
  insts: CreditInstallment[],
  now: Date,
): CardPaymentProposal | null {
  if (!isPayOutflow(out) || !out.accountId) return null;
  const cur = payCurrency(out.currency);
  const when = storedToLocalDate(out.date);
  if (!cur || !when) return null;
  const whenN = dayNum(when);
  let best: CardPaymentProposal | null = null;
  let bestDiff = Infinity;
  for (const card of cards) {
    if (!card.isActive || !isCreditCard(card) || card.payFromAccountId !== out.accountId) continue;
    let cut = lastClosedCut(card, when);
    for (let i = 0; i < 2; i++) {
      const st = statementFor(card, txs, insts, now, cut);
      const limit = st.due
        ? new Date(st.due.getFullYear(), st.due.getMonth(), st.due.getDate() + PROPOSAL_DUE_GRACE_DAYS, 12, 0, 0, 0)
        : new Date(cut.getFullYear(), cut.getMonth(), cut.getDate() + 30, 12, 0, 0, 0);
      const rem = st.remaining[cur];
      if (rem > EPS && whenN >= dayNum(cut) && whenN <= dayNum(limit)) {
        const diff = Math.abs(out.amount - rem);
        if (diff <= rem * PROPOSAL_TOLERANCE + 1e-9 && diff < bestDiff) {
          best = { outId: out.id, cardId: card.id, cutKey: st.cutKey, currency: out.currency, amount: out.amount, remaining: rem };
          bestDiff = diff;
        }
      }
      cut = previousCut(card, cut);
    }
  }
  return best;
}

/**
 * Propuestas vigentes (puro). `onlyIds` limita a esas salidas (las de una sincronización); sin él se revisan
 * todas las de SMS. Las ignoradas por la persona no se repiten.
 */
export function liveCardPaymentProposals(
  txs: Transaction[],
  cards: Account[],
  insts: CreditInstallment[],
  ignored: Set<string>,
  onlyIds: Set<string> | null,
  now: Date,
): CardPaymentProposal[] {
  if (cards.length === 0) return [];
  const out: CardPaymentProposal[] = [];
  const used = new Set<string>();
  const sorted = txs
    .filter(t => (!onlyIds || onlyIds.has(t.id)) && t.source === 'sms' && isPayOutflow(t))
    .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  for (const t of sorted) {
    const p = proposeCardPayment(t, cards, txs, insts, now);
    if (!p || ignored.has(cardPaymentProposalKey(p.outId, p.cardId))) continue;
    const slot = `${p.cardId}|${p.cutKey}|${p.currency}`;
    if (used.has(slot)) continue; // un estado y moneda solo se propone una vez a la vez
    used.add(slot);
    out.push(p);
  }
  return out;
}

/**
 * La salida pasa a ser el pago de la tarjeta (puro): neutra, con su tipo previo guardado y `cardPayment`.
 * Sin cambios si ya no es una salida pura.
 */
export function applyCardPaymentProposal(txs: Transaction[], p: Pick<CardPaymentProposal, 'outId' | 'cardId' | 'cutKey'>): Transaction[] {
  const out = txs.find(t => t.id === p.outId);
  if (!out || !isPayOutflow(out)) return txs;
  return txs.map(t => t.id !== p.outId ? t : {
    ...t,
    type: 'transfer' as const,
    category: 'transfer',
    transferPrev: { type: t.type, category: t.category },
    fromAccountId: t.accountId ?? t.fromAccountId,
    toAccountId: p.cardId,
    cardPayment: { cardId: p.cardId, cutKey: p.cutKey },
  });
}

/** Reparte lo escrito por moneda en movimientos de pago (puro): uno por moneda con monto mayor que 0. */
export function buildCardPaymentTxs(opts: {
  card: Pick<Account, 'id' | 'name'>;
  cutKey: string;
  amounts: { Q?: number; USD?: number };
  fromAccountId?: string;
  date: Date;
  idSeed: string;
}): Transaction[] {
  const out: Transaction[] = [];
  const when = new Date(opts.date.getFullYear(), opts.date.getMonth(), opts.date.getDate(), 12, 0, 0, 0).toISOString();
  for (const cur of ['Q', 'USD'] as const) {
    const amount = opts.amounts[cur];
    if (amount === undefined || !isFinite(amount) || amount <= 0) continue;
    const tx: Transaction = {
      id: `cardpay_${opts.idSeed}_${cur}`,
      amount: round2(amount),
      description: `Pago de tarjeta · ${opts.card.name}`,
      category: 'transfer',
      date: when,
      type: 'transfer',
      source: 'manual',
      currency: cur,
      toAccountId: opts.card.id,
      cardPayment: { cardId: opts.card.id, cutKey: opts.cutKey },
    };
    if (opts.fromAccountId) tx.fromAccountId = opts.fromAccountId;
    out.push(tx);
  }
  return out;
}

/**
 * Deshacer lo que la sincronización hizo con pagos de tarjeta (puro): la salida vuelve a su tipo y categoría
 * (se suelta el par), y el movimiento de la tarjeta que se conserva (editado) pierde `cardPayment`.
 */
export function planCardPaymentsUndo(
  records: Array<{ txId: string; cardId: string; cutKey: string; outId?: string; outOnly?: boolean }> | undefined,
  txs: Transaction[],
): { txs: Transaction[]; changed: boolean; reverted: number } {
  if (!records || records.length === 0) return { txs, changed: false, reverted: 0 };
  let next = txs;
  let reverted = 0;
  for (const r of records) {
    let touched = false;
    if (r.outId) {
      const pairId = transferPairIdFor(r.outId);
      next = next.map(t => {
        if (t.transferPairId !== pairId) return t;
        touched = true;
        const copy: Transaction = { ...t };
        if (t.transferPrev) { copy.type = t.transferPrev.type; copy.category = t.transferPrev.category; }
        delete copy.transferPairId;
        delete copy.transferPrev;
        if (t.id === r.outId) { delete copy.fromAccountId; delete copy.toAccountId; }
        return copy;
      });
    }
    if (!r.outOnly) {
      next = next.map(t => {
        if (t.id !== r.txId || !t.cardPayment) return t;
        touched = true;
        const copy: Transaction = { ...t };
        delete copy.cardPayment;
        return copy;
      });
    }
    if (touched) reverted++;
  }
  return { txs: reverted > 0 ? next : txs, changed: reverted > 0, reverted };
}

