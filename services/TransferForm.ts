// Módulo PURO (sin react-native ni AsyncStorage): lógica del formulario «Transferir entre mis cuentas» y de la
// pantalla de saldos opcionales (modo de saldo, saldo de partida, «Ajustar al saldo real»).
// De ./storage solo `import type`; de Balances / TransferQuestions / DateAmount solo funciones puras.
//
// Transferencia hecha a mano y SMS del banco: la persona puede registrar la transferencia ANTES de que llegue el
// SMS o DESPUÉS. Si el SMS ya llegó, se une a él (no se crea un movimiento repetido); si llega después de la
// transferencia a mano, el Centro de revisión ofrece unirlo (findManualTransferFor).
import type { Account, AccountType, Currency, Transaction } from './storage';
import { balanceModeOf, deriveBalance, latestSmsBalance } from './Balances';
import type { BalanceMode } from './Balances';
import { parseAmount } from './DateAmount';
import { movableAccounts } from './TransferQuestions';

const HOUR_MS = 60 * 60 * 1000;
/** Un SMS se considera «el mismo movimiento» si cae dentro de esta ventana (igual que los pares de SMS). */
export const SMS_MATCH_WINDOW_MS = 36 * HOUR_MS;
/** Diferencia máxima de monto entre la transferencia a mano y el SMS. */
export const SMS_MATCH_EPS = 0.01;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// Cuentas y monedas
// ─────────────────────────────────────────────────────────────

/** Misma regla que hasReliableConversion de storage: no hay tasa confiable USD ↔ EUR/£. */
export function reliableConversion(from: Currency, to: Currency): boolean {
  const isUsdEurOrGbpPair =
    (from === 'USD' && (to === 'EUR' || to === '£')) ||
    (to === 'USD' && (from === 'EUR' || from === '£'));
  return !isUsdEurOrGbpPair;
}

/** Cuentas de las que puede salir una transferencia: activas y que no sean tarjeta. */
export function transferFromChoices(accounts: Account[]): Account[] {
  return movableAccounts(accounts);
}

/** Destinos posibles: cualquier cuenta activa distinta del origen (las tarjetas llevan al pago de la tarjeta). */
export function transferToChoices(accounts: Account[], fromId: string): Account[] {
  return accounts.filter(a => a.isActive && a.id !== fromId);
}

/** ¿Hay dos cuentas que no sean tarjeta? Sin ellas no hay a dónde mover dinero. */
export function canTransfer(accounts: Account[]): boolean {
  return movableAccounts(accounts).length >= 2;
}

/** Lo que recibiría la cuenta destino de otra moneda con el tipo de cambio (Q por USD). null si no aplica. */
export function suggestToAmount(amount: number, from: Currency, to: Currency, rate: number): number | null {
  if (from === to || !reliableConversion(from, to)) return null;
  if (!(amount > 0) || !isFinite(amount) || !(rate > 0) || !isFinite(rate)) return null;
  const q = from === 'USD' ? amount * rate : amount;
  return round2(to === 'USD' ? q / rate : q);
}

export interface TransferFormInput {
  fromAcc?: Account;
  toAcc?: Account;
  /** Monto ya interpretado (NaN si el texto no es un número). */
  amount: number;
  /** Lo que recibe el destino cuando las monedas son distintas (NaN o undefined si falta). */
  toAmount?: number;
}

/**
 * Valida el formulario de transferencia. null = todo bien. Nunca valida «saldo insuficiente»: el saldo es
 * opcional y, aunque la cuenta lo lleve, la persona puede estar registrando algo que ya pasó.
 */
export function validateTransferForm(i: TransferFormInput): string | null {
  if (!i.fromAcc) return 'Elige la cuenta de origen.';
  if (!i.toAcc) return 'Elige la cuenta de destino.';
  if (i.fromAcc.id === i.toAcc.id) return 'Las cuentas deben ser diferentes.';
  if (!reliableConversion(i.fromAcc.currency, i.toAcc.currency)) {
    return `No hay tipo de cambio confiable entre ${i.fromAcc.currency} y ${i.toAcc.currency}. Solo se puede transferir USD↔Q, o entre cuentas de la misma moneda.`;
  }
  if (!(i.amount > 0) || !isFinite(i.amount)) return 'Ingresa un monto válido.';
  if (i.fromAcc.currency !== i.toAcc.currency) {
    const t = i.toAmount;
    if (typeof t !== 'number' || !(t > 0) || !isFinite(t)) return 'Escribe cuánto recibe la cuenta de destino.';
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// ¿Ya llegó el SMS de esta transferencia?
// ─────────────────────────────────────────────────────────────

export interface EquivalentSms {
  /** SMS de salida (type 'expense', categoría 'transfer') de la cuenta de origen. */
  out?: Transaction;
  /** SMS de entrada (type 'income', categoría 'transfer_in') de la cuenta de destino. */
  inn?: Transaction;
}

function amountClose(a: number, b: number): boolean {
  return Math.abs(a - b) <= SMS_MATCH_EPS + 1e-9;
}

/** El más cercano en el tiempo a `whenMs`. */
function closest(list: Transaction[], whenMs: number): Transaction | undefined {
  let best: Transaction | undefined;
  let bestDiff = Infinity;
  for (const t of list) {
    const diff = Math.abs(Date.parse(t.date) - whenMs);
    if (diff < bestDiff) { best = t; bestDiff = diff; }
  }
  return best;
}

/**
 * SMS de transferencia que ya llegaron y equivalen a la que la persona va a registrar: mismo monto (±0.01),
 * dentro de 36 h, sin par ni pregunta descartada, de la cuenta de origen (salida) o de la de destino (entrada).
 * Un SMS sin cuenta asignada también cuenta. Con una tarjeta de por medio no hay nada que unir.
 */
export function findEquivalentTransferSms(
  txs: Transaction[],
  p: { fromAcc: Account; toAcc: Account; amount: number; toAmount?: number; date: Date; ignored?: Set<string> },
): EquivalentSms {
  if (p.fromAcc.type === 'credit' || p.toAcc.type === 'credit' || p.fromAcc.id === p.toAcc.id) return {};
  if (!(p.amount > 0)) return {};
  const whenMs = p.date.getTime();
  if (isNaN(whenMs)) return {};
  const ignored = p.ignored ?? new Set<string>();
  const received = p.fromAcc.currency === p.toAcc.currency ? p.amount : p.toAmount;
  const inWindow = (t: Transaction) => {
    const ms = Date.parse(t.date);
    return !isNaN(ms) && Math.abs(ms - whenMs) <= SMS_MATCH_WINDOW_MS;
  };
  const base = (t: Transaction) =>
    t.source === 'sms' && !t.transferPairId && !t.cardPayment && !ignored.has(`tq|${t.id}`) && inWindow(t);

  const outs = txs.filter(t =>
    base(t) && t.type === 'expense' && t.category === 'transfer'
    && (!t.accountId || t.accountId === p.fromAcc.id)
    && t.currency === p.fromAcc.currency && amountClose(t.amount, p.amount));
  const ins = typeof received === 'number' && received > 0
    ? txs.filter(t =>
      base(t) && t.type === 'income' && t.category === 'transfer_in'
      && (!t.accountId || t.accountId === p.toAcc.id)
      && t.currency === p.toAcc.currency && amountClose(t.amount, received))
    : [];
  const res: EquivalentSms = {};
  const out = closest(outs, whenMs);
  const inn = closest(ins, whenMs);
  if (out) res.out = out;
  if (inn) res.inn = inn;
  return res;
}

export type SmsJoinPlan =
  | { kind: 'pair'; outId: string; inId: string }
  | { kind: 'out'; outId: string }
  | { kind: 'in'; inId: string }
  | { kind: 'none' };

/**
 * Qué hacer con los SMS equivalentes en lugar de crear un movimiento nuevo:
 * llegaron los dos → se emparejan; solo la salida → pasa a ser la transferencia hacia el destino;
 * solo la entrada → pasa a ser la transferencia desde el origen; ninguno → se crea la transferencia a mano.
 */
export function planSmsJoin(m: EquivalentSms): SmsJoinPlan {
  if (m.out && m.inn) return { kind: 'pair', outId: m.out.id, inId: m.inn.id };
  if (m.out) return { kind: 'out', outId: m.out.id };
  if (m.inn) return { kind: 'in', inId: m.inn.id };
  return { kind: 'none' };
}

/**
 * Al revés: llegó un SMS de transferencia (salida o entrada) y quizá la persona ya la había registrado a mano.
 * Devuelve esa transferencia a mano si coincide (misma cuenta del SMS, monto ±0.01, 36 h, sin par). El SMS repetido
 * se descarta y se queda la transferencia a mano.
 */
export function findManualTransferFor(sms: Transaction, txs: Transaction[]): Transaction | null {
  const outgoing = sms.type === 'expense' && sms.category === 'transfer';
  const incoming = sms.type === 'income' && sms.category === 'transfer_in';
  if (sms.source !== 'sms' || (!outgoing && !incoming)) return null;
  const smsMs = Date.parse(sms.date);
  if (isNaN(smsMs)) return null;
  const matches = txs.filter(t => {
    if (t.id === sms.id || t.source !== 'manual' || t.type !== 'transfer' || t.cardPayment || t.transferPairId) return false;
    if (!t.fromAccountId || !t.toAccountId) return false;
    const ms = Date.parse(t.date);
    if (isNaN(ms) || Math.abs(ms - smsMs) > SMS_MATCH_WINDOW_MS) return false;
    if (outgoing) {
      return (!sms.accountId || t.fromAccountId === sms.accountId)
        && t.currency === sms.currency && amountClose(t.amount, sms.amount);
    }
    const received = typeof t.toAmount === 'number' && t.toAmount > 0 ? t.toAmount : t.amount;
    return (!sms.accountId || t.toAccountId === sms.accountId) && amountClose(received, sms.amount);
  });
  return closest(matches, smsMs) ?? null;
}

// ─────────────────────────────────────────────────────────────
// Saldo opcional: modo, saldo de partida y «Ajustar al saldo real»
// ─────────────────────────────────────────────────────────────

/** Texto corto, en lenguaje simple, de lo que hace cada modo de saldo. */
export function balanceModeHelp(mode: BalanceMode, accountType?: AccountType): string {
  if (mode === 'none') {
    return accountType === 'credit'
      ? 'La tarjeta no lleva saldo: verás lo que has consumido en el ciclo y lo que toca pagar en cada estado de cuenta.'
      : 'La app solo registra tus gastos e ingresos de esta cuenta. No lleva su saldo ni la suma a tu patrimonio.';
  }
  if (mode === 'manual') {
    return 'Tú escribes el saldo y solo cambia cuando lo editas o cuando haces una transferencia o un pago de tarjeta en la app.';
  }
  return 'La app suma y resta sola cada ingreso, gasto, transferencia y pago de esta cuenta a partir del saldo de partida. Si no cuadra con tu banco, usa «Ajustar al saldo real».';
}

/** Etiqueta corta del modo para la lista de cuentas (null = no mostrar). */
export function balanceModeTag(acc: Pick<Account, 'type' | 'balanceMode'>): string | null {
  const m = balanceModeOf(acc);
  if (m === 'auto') return 'Automático';
  if (m === 'none') return 'Sin saldo';
  return null;
}

/** Interpreta un saldo escrito a mano, con signo opcional («-250»). NaN si no es un número. */
export function parseSignedAmount(text: string): number {
  const t = text.trim();
  const neg = t.startsWith('-');
  const abs = parseAmount(neg ? t.slice(1) : t);
  return neg ? -abs : abs;
}

/**
 * Fecha del ancla de un saldo: si el día elegido es hoy se usa el instante actual (los movimientos de hoy anteriores
 * a este momento ya están dentro del saldo que la persona ve); un día pasado cuenta a las 12:00 de ese día.
 */
export function anchorIsoFor(date: Date, now: Date = new Date()): string {
  const sameDay = date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate();
  if (sameDay) return now.toISOString();
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0).toISOString();
}

export interface BalanceFields {
  balance: number;
  initialBalance: number;
  balanceMode: BalanceMode;
  balanceAnchorAmount?: number;
  balanceAnchorAt?: string;
}

/**
 * Los campos de saldo de la cuenta al guardar el formulario.
 * - none: no lleva saldo (se conserva el número que ya tenía, sin usarlo).
 * - manual: el saldo que escribió la persona.
 * - auto: el saldo de partida y su fecha. Si la cuenta ya era automática y no se tocó nada, conserva su ancla; si no
 *   se escribió saldo de partida, usa el saldo actual de la cuenta como ancla con fecha de hoy.
 */
export function resolveBalanceFields(p: {
  mode: BalanceMode;
  existing?: Account;
  /** Texto de «Saldo actual» (modo manual). */
  manualText: string;
  /** Texto de «Saldo de partida» (modo automático). */
  startText: string;
  startDate: Date;
  /** La persona cambió el saldo de partida o su fecha. */
  startTouched: boolean;
  now?: Date;
}): BalanceFields | { error: string } {
  const ex = p.existing;
  const now = p.now ?? new Date();
  if (p.mode === 'none') {
    return { balance: ex?.balance ?? 0, initialBalance: ex?.initialBalance ?? 0, balanceMode: 'none' };
  }
  if (p.mode === 'manual') {
    const bal = parseSignedAmount(p.manualText);
    if (isNaN(bal)) return { error: 'Ingresa un saldo válido.' };
    const out: BalanceFields = { balance: bal, initialBalance: ex?.initialBalance ?? bal, balanceMode: 'manual' };
    if (ex?.balanceAnchorAt !== undefined) out.balanceAnchorAt = ex.balanceAnchorAt;
    if (ex?.balanceAnchorAmount !== undefined) out.balanceAnchorAmount = ex.balanceAnchorAmount;
    return out;
  }
  // auto
  const keepsAnchor = !!ex && balanceModeOf(ex) === 'auto' && !p.startTouched
    && typeof ex.balanceAnchorAmount === 'number' && !!ex.balanceAnchorAt;
  if (keepsAnchor && ex) {
    const amount = ex.balanceAnchorAmount as number;
    return {
      balance: amount, initialBalance: ex.initialBalance, balanceMode: 'auto',
      balanceAnchorAmount: amount, balanceAnchorAt: ex.balanceAnchorAt as string,
    };
  }
  let amount: number;
  if (p.startText.trim()) {
    amount = parseSignedAmount(p.startText);
    if (isNaN(amount)) return { error: 'Ingresa un saldo de partida válido.' };
  } else {
    amount = ex ? ex.balance : 0;
  }
  amount = round2(amount);
  return {
    balance: amount, initialBalance: ex?.initialBalance ?? amount, balanceMode: 'auto',
    balanceAnchorAmount: amount, balanceAnchorAt: anchorIsoFor(p.startDate, now),
  };
}

export interface SmsBalanceMismatch {
  /** Saldo que trajo el SMS del banco. */
  amount: number;
  /** Fecha del SMS (ISO): desde ahí se vuelve a anclar la cuenta. */
  at: string;
  /** Lo que la app calculaba para ese mismo momento. */
  expected: number;
  diff: number;
}

/**
 * «Según tu banco (SMS): X»: el último saldo que trajo un SMS de la cuenta automática, si no coincide con lo que la app
 * calculaba para ese momento. null si no hay saldo en los SMS, es más viejo que el ancla o coincide.
 */
export function smsBalanceMismatch(acc: Account, txs: Transaction[]): SmsBalanceMismatch | null {
  if (balanceModeOf(acc) !== 'auto') return null;
  const latest = latestSmsBalance(acc, txs);
  if (!latest) return null;
  const atMs = Date.parse(latest.at);
  if (acc.balanceAnchorAt) {
    const anchorMs = Date.parse(acc.balanceAnchorAt);
    if (!isNaN(anchorMs) && !(atMs > anchorMs)) return null;
  }
  const expected = deriveBalance(acc, txs.filter(t => {
    const ms = Date.parse(t.date);
    return !isNaN(ms) && ms <= atMs;
  }));
  const diff = round2(latest.amount - expected);
  if (Math.abs(diff) < 0.005) return null;
  return { amount: latest.amount, at: latest.at, expected, diff };
}
