// Emparejamiento gasto fijo <-> movimiento SMS (módulo PURO, decisión D4).
// Sin react-native ni AsyncStorage: de ./storage solo `import type`.
//
// Puntaje (máximo 100):
//   nombre  50 = merchantKey igual a fe.smsMatchKey (aprendido)
//           40 = una palabra del nombre (>= 4 letras) aparece en el comercio o la descripción
//           30 = coincide un grupo de alias (luz, agua, internet, streaming)
//   monto   30 = diferencia <= 0.01 ; 20 = hasta 10 % ; 10 = hasta 35 % (solo utilities/internet)
//   ventana 20 = del día de pago -7 al +5 ; 5 = otro día del período (el movimiento debe caer en
//                el período de presupuesto actual: ver FixedCycle.periodFor / dueDistanceInPeriod)
// Solo se marca sola con puntaje >= 80 y único en ambos sentidos; entre 45 y 79
// (o con varios candidatos) es propuesta.
import type { FixedExpense, Transaction } from './storage';
import { flatText } from './Categorizer';
import { merchantKey, merchantOfTransaction } from './MerchantRules';
import { dupPairKey, mergeManualIntoSms } from './DuplicateDetector';
import {
  cycleKeyFor, cycleKeyFromFeTxId, dueDistanceInPeriod, fixedIdFromFeTxId, normalizeCycleKey, periodFor,
  storedDayNumber,
} from './FixedCycle';
import type { FixedCycleConfig } from './FixedCycle';

export interface FixedMatch { expenseId: string; txId: string; score: number; auto: boolean; reasons: string[]; manualId?: string; }

/** Clave de "No es este" (par gasto fijo + movimiento ignorado). Misma que usa FixedExpenseMatchModal. */
export function fixedRejectKey(feId: string, txId: string): string {
  return `fx|${feId}|${txId}`;
}

export const FIXED_AUTO_THRESHOLD = 80;
export const FIXED_PROPOSE_THRESHOLD = 45;

interface AliasGroup {
  /** Palabras genéricas que pueden aparecer en el nombre del gasto fijo. */
  labels: string[];
  /** Marcas / proveedores que pueden aparecer en el SMS. */
  aliases: string[];
}

const ALIAS_GROUPS: AliasGroup[] = [
  { labels: ['luz', 'electricidad', 'energia', 'electrica'], aliases: ['eegsa', 'energuate', 'deocsa', 'deorsa'] },
  { labels: ['agua'], aliases: ['empagua', 'agua', 'municipalidad'] },
  {
    labels: ['internet', 'cable', 'telefono', 'celular', 'plan', 'wifi', 'fibra'],
    aliases: ['tigo', 'claro', 'telgua', 'starlink', 'movistar'],
  },
  {
    labels: ['streaming', 'suscripcion', 'subscripcion'],
    // Mismos nombres que la regla `streaming` del Categorizer.
    aliases: [
      'netflix', 'spotify', 'disney', 'hbo', 'max.com', 'youtube', 'prime video', 'paramount', 'crunchyroll',
      'vix', 'star plus', 'apple tv',
    ],
  },
];

const RENT_RE = /\b(renta|alquiler)\b/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** ¿`word` aparece en `text` como palabra (o inicio de palabra)? Ambos ya en flatText. */
function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(word)}`).test(text);
}

/** Texto plano del movimiento: comercio + descripción. */
function txText(tx: Transaction): string {
  return flatText(`${merchantOfTransaction(tx) ?? ''} ${tx.description ?? ''}`);
}

function scoreName(fe: FixedExpense, tx: Transaction, text: string): { score: number; reason?: string } {
  const feKey = fe.smsMatchKey ? flatText(fe.smsMatchKey) : null;
  if (feKey && merchantKey(merchantOfTransaction(tx)) === feKey) {
    return { score: 50, reason: 'comercio aprendido' };
  }

  const name = flatText(fe.name).replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = name.split(' ').filter(w => w.length >= 4);
  if (words.some(w => hasWord(text, w))) return { score: 40, reason: 'nombre en el comercio' };

  for (const g of ALIAS_GROUPS) {
    const nameHasLabel = g.labels.some(l => hasWord(name, l));
    if (!nameHasLabel) continue;
    // Si el nombre ya nombra a un proveedor concreto que NO es el del SMS (ej. "Claro" vs TIGO), no hay crédito.
    const nameBrands = g.aliases.filter(a => hasWord(name, a));
    if (nameBrands.some(a => !hasWord(text, a))) continue;
    if (g.aliases.some(a => hasWord(text, a))) return { score: 30, reason: 'proveedor del mismo rubro' };
  }
  return { score: 0 };
}

/** Puntaje de monto de `amount` contra un monto base (el del gasto fijo o el del manual). */
function scoreAmountVs(base: number, category: string, amount: number): { score: number; reason?: string } {
  const diff = Math.abs(amount - base);
  if (diff <= 0.01) return { score: 30, reason: 'monto exacto' };
  const rel = base > 0 ? diff / base : Infinity;
  if (rel <= 0.10) return { score: 20, reason: 'monto similar (<=10%)' };
  if (rel <= 0.35 && (category === 'utilities' || category === 'internet')) {
    return { score: 10, reason: 'monto variable (<=35%)' };
  }
  return { score: 0 };
}

function scoreAmount(fe: FixedExpense, tx: Transaction): { score: number; reason?: string } {
  return scoreAmountVs(fe.amount, fe.category, tx.amount);
}

function scoreWindow(fe: FixedExpense, tx: Transaction, cycle: FixedCycleConfig): { score: number; reason: string } {
  const delta = dueDistanceInPeriod(fe.dayOfMonth, cycle, tx.date);
  if (delta !== null && delta >= -7 && delta <= 5) return { score: 20, reason: 'cerca del día de pago' };
  return { score: 5, reason: 'otro día del período' };
}

/**
 * Puntúa cada (gasto fijo, movimiento candidato). `auto` solo con puntaje >= FIXED_AUTO_THRESHOLD
 * y único en ambos sentidos; entre FIXED_PROPOSE_THRESHOLD y 79 es propuesta. Ordenado por puntaje.
 */
export function matchFixedExpenses(
  candidates: Transaction[],
  expenses: FixedExpense[],
  allTxs: Transaction[],
  now: Date,
  opts: { cycle: FixedCycleConfig; ignored?: Set<string> },
): FixedMatch[] {
  const cfg = opts.cycle;
  const cur = periodFor(cfg, now).key;
  const feById = new Map(expenses.map(fe => [fe.id, fe] as const));

  // Gastos fijos que ya tienen un movimiento (manual) en el período actual: no se consideran.
  const paidThisPeriod = new Set<string>();
  for (const t of allTxs) {
    const fid = t.fixedExpenseId ?? fixedIdFromFeTxId(t.id);
    if (!fid) continue;
    const fe = feById.get(fid);
    const cycle = normalizeCycleKey(cycleKeyFromFeTxId(t.id) ?? '', fe?.dayOfMonth ?? 1, cfg)
      ?? cycleKeyFor(cfg, t.date);
    if (cycle === cur) paidThisPeriod.add(fid);
  }

  const cands = candidates.filter(t =>
    t.type === 'expense' && !t.fixedExpenseId && !t.transferPairId && !t.mergedFrom);
  const active = expenses.filter(fe =>
    fe.isActive && !fe.isPaid && !paidThisPeriod.has(fe.id));

  const scored: FixedMatch[] = [];
  for (const fe of active) {
    for (const tx of cands) {
      if (tx.currency !== fe.currency) continue;
      if (cycleKeyFor(cfg, tx.date) !== cur) continue;
      if (opts.ignored?.has(fixedRejectKey(fe.id, tx.id))) continue;
      const text = txText(tx);
      const name = scoreName(fe, tx, text);
      const amount = scoreAmount(fe, tx);
      const win = scoreWindow(fe, tx, cfg);

      const rentFallback = name.score === 0 && RENT_RE.test(flatText(fe.name))
        && amount.score === 30 && tx.category === 'transfer';
      // Sin ninguna señal de nombre solo se admite la renta (transferencia con monto exacto).
      if (name.score === 0 && !rentFallback) continue;

      const score = name.score + amount.score + win.score;
      if (score < FIXED_PROPOSE_THRESHOLD) continue;

      const reasons = [name.reason, amount.reason, win.reason].filter((r): r is string => !!r);
      if (rentFallback) reasons.unshift('renta: transferencia con monto exacto');
      scored.push({ expenseId: fe.id, txId: tx.id, score, auto: false, reasons });
    }
  }

  const perExpense = new Map<string, number>();
  const perTx = new Map<string, number>();
  for (const m of scored) {
    perExpense.set(m.expenseId, (perExpense.get(m.expenseId) ?? 0) + 1);
    perTx.set(m.txId, (perTx.get(m.txId) ?? 0) + 1);
  }
  for (const m of scored) {
    m.auto = m.score >= FIXED_AUTO_THRESHOLD
      && perExpense.get(m.expenseId) === 1
      && perTx.get(m.txId) === 1;
  }
  return scored.sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────
// Ranking de gastos fijos para un movimiento (elegir a mano a cuál pertenece)
// ─────────────────────────────────────────────────────────────

export interface FixedRank { expense: FixedExpense; score: number; reasons: string[]; }

/** Todos los gastos fijos activos puntuados contra `tx` (nombre + monto + ventana), mejor primero. */
export function rankFixedForTx(tx: Transaction, expenses: FixedExpense[], cycle: FixedCycleConfig): FixedRank[] {
  const text = txText(tx);
  const out: FixedRank[] = [];
  for (const fe of expenses) {
    if (!fe.isActive) continue;
    if (fe.currency !== tx.currency) {
      out.push({ expense: fe, score: 0, reasons: ['otra moneda'] });
      continue;
    }
    const name = scoreName(fe, tx, text);
    const amount = scoreAmount(fe, tx);
    const win = scoreWindow(fe, tx, cycle);
    out.push({
      expense: fe,
      score: name.score + amount.score + win.score,
      reasons: [name.reason, amount.reason, win.reason].filter((r): r is string => !!r),
    });
  }
  return out.sort((a, b) => b.score - a.score || a.expense.name.localeCompare(b.expense.name));
}

// ─────────────────────────────────────────────────────────────
// Fusión: movimiento manual de "marcar pagado" + SMS del mismo pago
// ─────────────────────────────────────────────────────────────

export interface FixedFusion {
  expenseId: string; manualId: string; smsId: string; score: number; auto: boolean; reasons: string[];
}

const FUSION_PROPOSE_THRESHOLD = 60;
const FUSION_NEAR_DAYS = 10;

/** El manual de un gasto fijo: lleva fixedExpenseId o su id es `fe_tx_*`. */
function manualFixedId(t: Transaction): string | null {
  return t.fixedExpenseId ?? fixedIdFromFeTxId(t.id);
}

/**
 * Pares (manual de gasto fijo, SMS) que son el mismo pago. Auto con puntaje >= 80 y único por manual
 * y por SMS; se propone con >= 60. Cada movimiento queda en un solo par (desde el puntaje más alto).
 */
export function findFixedFusions(
  txs: Transaction[],
  expenses: FixedExpense[],
  opts: { cycle: FixedCycleConfig; ignored?: Set<string>; onlySmsIds?: Set<string> },
): FixedFusion[] {
  const cfg = opts.cycle;
  const feById = new Map(expenses.map(fe => [fe.id, fe] as const));
  const manuals: Array<{ tx: Transaction; fe: FixedExpense }> = [];
  const smsList: Transaction[] = [];
  for (const t of txs) {
    if (t.type !== 'expense' || t.mergedFrom) continue;
    if (t.source === 'manual') {
      const fid = manualFixedId(t);
      const fe = fid ? feById.get(fid) : undefined;
      if (fe) manuals.push({ tx: t, fe });
    } else if (t.source === 'sms') {
      if (t.transferPairId) continue;
      if (opts.onlySmsIds && !opts.onlySmsIds.has(t.id)) continue;
      smsList.push(t);
    }
  }

  interface Cand { manual: Transaction; sms: Transaction; fe: FixedExpense; score: number; gap: number; reasons: string[]; order: number; }
  const cands: Cand[] = [];
  let order = 0;
  for (const { tx: manual, fe } of manuals) {
    const manualCycle = normalizeCycleKey(cycleKeyFromFeTxId(manual.id) ?? '', fe.dayOfMonth, cfg)
      ?? cycleKeyFor(cfg, manual.date);
    const manualDay = storedDayNumber(manual.date);
    for (const sms of smsList) {
      if (sms.fixedExpenseId && sms.fixedExpenseId !== fe.id) continue;
      if (sms.currency !== fe.currency || sms.currency !== manual.currency) continue;

      const smsDay = storedDayNumber(sms.date);
      const gap = manualDay !== null && smsDay !== null ? Math.abs(manualDay - smsDay) : Infinity;
      const sameCycle = manualCycle !== null && cycleKeyFor(cfg, sms.date) === manualCycle;
      if (!sameCycle && gap > FUSION_NEAR_DAYS) continue;
      if (opts.ignored?.has(dupPairKey(manual.id, sms.id))) continue;

      const name = scoreName(fe, sms, txText(sms));
      if (name.score <= 0) continue;
      const amount = scoreAmountVs(manual.amount, fe.category, sms.amount);
      if (amount.score <= 0) continue;

      const score = name.score + amount.score + 20;
      if (score < FUSION_PROPOSE_THRESHOLD) continue;
      const reasons = [name.reason, amount.reason, 'mismo vencimiento'].filter((r): r is string => !!r);
      cands.push({ manual, sms, fe, score, gap, reasons, order: order++ });
    }
  }

  const perManual = new Map<string, number>();
  const perSms = new Map<string, number>();
  for (const c of cands) {
    perManual.set(c.manual.id, (perManual.get(c.manual.id) ?? 0) + 1);
    perSms.set(c.sms.id, (perSms.get(c.sms.id) ?? 0) + 1);
  }

  cands.sort((a, b) => b.score - a.score || a.gap - b.gap || a.order - b.order);
  const usedManual = new Set<string>();
  const usedSms = new Set<string>();
  const out: FixedFusion[] = [];
  for (const c of cands) {
    if (usedManual.has(c.manual.id) || usedSms.has(c.sms.id)) continue;
    usedManual.add(c.manual.id);
    usedSms.add(c.sms.id);
    out.push({
      expenseId: c.fe.id,
      manualId: c.manual.id,
      smsId: c.sms.id,
      score: c.score,
      auto: c.score >= FIXED_AUTO_THRESHOLD && perManual.get(c.manual.id) === 1 && perSms.get(c.sms.id) === 1,
      reasons: c.reasons,
    });
  }
  return out;
}

/**
 * Une el manual al SMS (sobrevive el SMS, con el gasto fijo vinculado) y devuelve el gasto fijo
 * actualizado: si el manual era el que lo marcaba pagado, pasa a pagado por el SMS (conservando
 * el período); un manual de un período pasado deja el gasto sin cambios. `learnKey` se aprende una vez.
 */
export function planFixedFusion(
  manual: Transaction,
  sms: Transaction,
  fe: FixedExpense,
  nowIso: string,
  cycle: FixedCycleConfig,
  learnKey?: string,
): { merged: Transaction; nextFe: FixedExpense } {
  const merged: Transaction = { ...mergeManualIntoSms(manual, sms, nowIso), fixedExpenseId: fe.id };

  let nextFe: FixedExpense = fe;
  if (fe.lastTxId === manual.id || fe.paidTxId === manual.id) {
    nextFe = {
      ...fe,
      isPaid: true,
      paidBy: 'sms',
      paidTxId: sms.id,
      paidDate: sms.date,
      lastTxId: undefined,
      paidCycleKey: fe.paidCycleKey ?? cycleKeyFor(cycle, sms.date) ?? undefined,
    };
  }
  if (learnKey && !nextFe.smsMatchKey) nextFe = { ...nextFe, smsMatchKey: learnKey };
  return { merged, nextFe };
}

/** Tras separar un SMS unido: el gasto fijo vuelve a figurar pagado a mano por el manual restaurado. */
export function relinkFixedAfterSplit(
  expenses: FixedExpense[],
  smsId: string,
  manual: Transaction,
): FixedExpense[] {
  const fid = manual.fixedExpenseId ?? fixedIdFromFeTxId(manual.id);
  if (!fid) return expenses;
  return expenses.map(e => (e.id === fid && e.paidTxId === smsId
    ? { ...e, paidTxId: undefined, lastTxId: manual.id, paidBy: 'manual' as const, paidDate: manual.date }
    : e));
}

// ─────────────────────────────────────────────────────────────
// SMS pasados de un gasto fijo (para vincular períodos anteriores)
// ─────────────────────────────────────────────────────────────

export interface PastSmsForFixed { tx: Transaction; cycleKey: string; manualId?: string; }

const PAST_SMS_LIMIT = 24;

/**
 * SMS de períodos anteriores (ciclo < beforeKey) del comercio `key` que pueden ser pagos pasados del
 * gasto fijo. Uno por período (monto más cercano al del gasto; empate, el más antiguo). `manualId` es el
 * registro manual de ese gasto en ese período, si existe. Más reciente primero, tope 24.
 */
export function findPastSmsForFixed(
  fe: FixedExpense,
  txs: Transaction[],
  opts: { key: string; excludeTxId?: string; beforeKey: string; cycle: FixedCycleConfig },
): PastSmsForFixed[] {
  const manualByCycle = new Map<string, string>();
  for (const t of txs) {
    if (t.source !== 'manual' || t.type !== 'expense' || t.mergedFrom) continue;
    if (manualFixedId(t) !== fe.id) continue;
    const cycle = normalizeCycleKey(cycleKeyFromFeTxId(t.id) ?? '', fe.dayOfMonth, opts.cycle)
      ?? cycleKeyFor(opts.cycle, t.date);
    if (cycle && !manualByCycle.has(cycle)) manualByCycle.set(cycle, t.id);
  }

  const bestByCycle = new Map<string, Transaction>();
  for (const t of txs) {
    if (t.source !== 'sms' || t.type !== 'expense') continue;
    if (t.currency !== fe.currency) continue;
    if (t.fixedExpenseId || t.transferPairId || t.mergedFrom) continue;
    if (t.id === opts.excludeTxId) continue;
    if (merchantKey(merchantOfTransaction(t)) !== opts.key) continue;
    const cycle = cycleKeyFor(opts.cycle, t.date);
    if (!cycle || cycle >= opts.beforeKey) continue;

    const prev = bestByCycle.get(cycle);
    if (!prev) { bestByCycle.set(cycle, t); continue; }
    const dNew = Math.abs(t.amount - fe.amount);
    const dPrev = Math.abs(prev.amount - fe.amount);
    if (dNew < dPrev || (dNew === dPrev && t.date < prev.date)) bestByCycle.set(cycle, t);
  }

  const out: PastSmsForFixed[] = [];
  for (const [cycleKey, tx] of bestByCycle) {
    const manualId = manualByCycle.get(cycleKey);
    out.push(manualId ? { tx, cycleKey, manualId } : { tx, cycleKey });
  }
  out.sort((a, b) => (a.tx.date < b.tx.date ? 1 : a.tx.date > b.tx.date ? -1 : 0));
  return out.slice(0, PAST_SMS_LIMIT);
}
