// Módulo PURO (sin react-native ni AsyncStorage): saldos OPCIONALES de las cuentas.
// De ./storage solo `import type` (la circularidad con storage.ts se evita así).
//
// Cada cuenta elige cómo llevar su saldo (`balanceMode`):
//   'none'   → no lleva saldo (la app solo registra gastos). Es lo normal en las tarjetas.
//   'manual' → el saldo es el número guardado en la cuenta; solo cambia cuando la persona lo ajusta o cuando
//              una transferencia / pago de tarjeta hecha en la app lo mueve (StorageService lo suma a mano).
//   'auto'   → el saldo se DERIVA de los movimientos: ancla (balanceAnchorAmount a balanceAnchorAt) más el efecto
//              de cada movimiento posterior. Nunca se acumula en disco: withDerivedBalances lo recalcula siempre.
// Un saldo derivado se puede conciliar con el que trae el SMS del banco (smsBalance) re-anclando la cuenta.
import type { Account, Currency, Transaction } from './storage';

export type BalanceMode = 'none' | 'manual' | 'auto';

/** Un re-anclaje hecho por la sincronización de SMS (para poder deshacerlo con el lote). */
export interface BalanceAnchorRecord {
  accountId: string;
  /** Fecha del ancla que dejó el lote (la del SMS que traía el saldo). */
  at: string;
  prevAmount?: number;
  prevAt?: string;
  prevBalance: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Modo efectivo de la cuenta: lo guardado o, en cuentas viejas, 'none' para tarjetas y 'manual' para el resto. */
export function balanceModeOf(acc: Pick<Account, 'type' | 'balanceMode'>): BalanceMode {
  const m = acc.balanceMode;
  if (m === 'none' || m === 'manual' || m === 'auto') return m;
  return acc.type === 'credit' ? 'none' : 'manual';
}

/** ¿La cuenta lleva saldo? (entra al patrimonio y se muestra). Las tarjetas nunca suman al patrimonio. */
export function isBalanceTracked(acc: Pick<Account, 'type' | 'balanceMode'>): boolean {
  return balanceModeOf(acc) !== 'none';
}

interface EffectOpts {
  /** Moneda de la cuenta: un movimiento de otra moneda (sin toAmount) no la afecta. */
  currency?: Currency;
  /** La cuenta es una tarjeta: un pago de tarjeta no le suma nada (su deuda no es un saldo). */
  isCard?: boolean;
}

/**
 * Efecto de un movimiento en el saldo de la cuenta `accId` (positivo suma, negativo resta, 0 no afecta).
 * - income suma y expense resta en su `accountId`.
 * - Mitad de un par SMS (transferPairId): el signo lo da el tipo previo (`transferPrev.type`) sobre su `accountId`;
 *   cada mitad mueve la cuenta donde está aunque ambas sean neutras para las estadísticas.
 * - Transferencia manual o pago de tarjeta: `fromAccountId` resta el monto y `toAccountId` suma `toAmount ?? amount`.
 *   Un pago de tarjeta resta de la cuenta pagadora y no toca la tarjeta.
 */
export function accountEffect(tx: Transaction, accId: string, opts: EffectOpts = {}): number {
  const amount = tx.amount;
  if (!(amount > 0) || !isFinite(amount)) return 0;
  const sameCurrency = !opts.currency || tx.currency === opts.currency;

  if (tx.type === 'income') return tx.accountId === accId && sameCurrency ? amount : 0;
  if (tx.type === 'expense') return tx.accountId === accId && sameCurrency ? -amount : 0;

  // type 'transfer'
  const isPairHalf = !!tx.transferPairId || (!!tx.transferPrev && !tx.fromAccountId && !tx.toAccountId);
  if (isPairHalf) {
    if (tx.accountId !== accId || !sameCurrency) return 0;
    const prev = tx.transferPrev?.type;
    return prev === 'income' ? amount : prev === 'expense' ? -amount : 0;
  }

  let delta = 0;
  if (tx.fromAccountId === accId && sameCurrency) delta -= amount;
  if (tx.toAccountId === accId && !(opts.isCard && tx.cardPayment)) {
    const toAmount = tx.toAmount;
    if (typeof toAmount === 'number' && isFinite(toAmount) && toAmount > 0) delta += toAmount;
    else if (sameCurrency) delta += amount;
  }
  return round2(delta);
}

function anchorOf(acc: Account): { amount: number; ms: number } | null {
  const amount = acc.balanceAnchorAmount;
  if (typeof amount !== 'number' || !isFinite(amount) || !acc.balanceAnchorAt) return null;
  const ms = Date.parse(acc.balanceAnchorAt);
  return isNaN(ms) ? null : { amount, ms };
}

/**
 * Saldo derivado: ancla + efecto de los movimientos POSTERIORES al ancla (fecha estrictamente mayor).
 * Sin ancla: saldo inicial + todos los movimientos.
 */
export function deriveBalance(acc: Account, txs: Transaction[]): number {
  const anchor = anchorOf(acc);
  let sum = anchor ? anchor.amount : acc.initialBalance;
  if (typeof sum !== 'number' || !isFinite(sum)) sum = 0;
  const opts: EffectOpts = { currency: acc.currency, isCard: acc.type === 'credit' };
  for (const t of txs) {
    if (anchor && !(Date.parse(t.date) > anchor.ms)) continue;
    sum += accountEffect(t, acc.id, opts);
  }
  return round2(sum);
}

/**
 * Cuentas tal como se muestran: SOLO las de modo 'auto' reemplazan `balance` por el derivado; las demás quedan
 * igual (el valor guardado). Es un valor de vista: nunca se vuelve a guardar en disco.
 */
export function withDerivedBalances(accounts: Account[], txs: Transaction[]): Account[] {
  if (!accounts.some(a => balanceModeOf(a) === 'auto')) return accounts;
  return accounts.map(a => (balanceModeOf(a) === 'auto' ? { ...a, balance: deriveBalance(a, txs) } : a));
}

/**
 * Suma a mano, en el saldo guardado de las cuentas de modo 'manual', el efecto de movimientos nuevos
 * (transferencias y pagos hechos en la app). Las de modo 'auto' lo derivan solas y las 'none' no llevan saldo,
 * así que no se tocan: ningún movimiento se cuenta dos veces.
 */
export function applyManualEffects(accounts: Account[], newTxs: Transaction[]): Account[] {
  return accounts.map(a => {
    if (balanceModeOf(a) !== 'manual') return a;
    const opts: EffectOpts = { currency: a.currency, isCard: a.type === 'credit' };
    let delta = 0;
    for (const t of newTxs) delta += accountEffect(t, a.id, opts);
    return delta === 0 ? a : { ...a, balance: round2(a.balance + delta) };
  });
}

/** El saldo más reciente que trajo un SMS de esta cuenta (misma moneda). null si ninguno trae saldo. */
export function latestSmsBalance(acc: Account, txs: Transaction[]): { amount: number; at: string; txId: string } | null {
  let best: { amount: number; at: string; txId: string } | null = null;
  let bestMs = -Infinity;
  for (const t of txs) {
    const sb = t.smsBalance;
    if (!sb || t.accountId !== acc.id || sb.currency !== acc.currency) continue;
    if (typeof sb.amount !== 'number' || !isFinite(sb.amount)) continue;
    const ms = Date.parse(t.date);
    if (isNaN(ms) || ms <= bestMs) continue;
    best = { amount: sb.amount, at: t.date, txId: t.id };
    bestMs = ms;
  }
  return best;
}

/** «Ajustar al saldo real»: fija el ancla de la cuenta (y el saldo guardado). Para modo auto el saldo queda derivado. */
export function withBalanceAnchor(acc: Account, amount: number, atIso: string): Account {
  const clean = round2(amount);
  return { ...acc, balance: clean, balanceAnchorAmount: clean, balanceAnchorAt: atIso };
}

/**
 * Conciliación con el saldo del SMS: toda cuenta de modo 'auto' con `smsAutoBalance` se re-ancla con el SMS más
 * reciente que traiga saldo, siempre que sea POSTERIOR al ancla actual (un ajuste manual más nuevo no se pisa).
 * Devuelve las cuentas nuevas y un registro por cuenta cambiada (para deshacer el lote).
 */
export function planSmsBalanceAnchors(
  accounts: Account[],
  txs: Transaction[],
): { accounts: Account[]; records: BalanceAnchorRecord[] } {
  const records: BalanceAnchorRecord[] = [];
  const next = accounts.map(a => {
    if (balanceModeOf(a) !== 'auto' || !a.smsAutoBalance || !a.isActive) return a;
    const latest = latestSmsBalance(a, txs);
    if (!latest) return a;
    const anchor = anchorOf(a);
    if (anchor && !(Date.parse(latest.at) > anchor.ms)) return a;
    records.push({
      accountId: a.id, at: latest.at,
      ...(a.balanceAnchorAmount !== undefined ? { prevAmount: a.balanceAnchorAmount } : {}),
      ...(a.balanceAnchorAt !== undefined ? { prevAt: a.balanceAnchorAt } : {}),
      prevBalance: a.balance,
    });
    return withBalanceAnchor(a, latest.amount, latest.at);
  });
  return { accounts: records.length > 0 ? next : accounts, records };
}

/**
 * Deshacer los re-anclajes de un lote (puro): la cuenta vuelve al ancla de antes, salvo que ya tenga otro más nuevo
 * (la persona ajustó el saldo después: eso no se toca).
 */
export function planBalanceAnchorsUndo(
  records: BalanceAnchorRecord[] | undefined,
  accounts: Account[],
): { accounts: Account[]; changed: boolean } {
  if (!records || records.length === 0) return { accounts, changed: false };
  let changed = false;
  const next = accounts.map(a => {
    const rec = records.find(r => r.accountId === a.id);
    if (!rec || a.balanceAnchorAt !== rec.at) return a;
    changed = true;
    const copy: Account = { ...a, balance: rec.prevBalance };
    if (rec.prevAmount !== undefined) copy.balanceAnchorAmount = rec.prevAmount; else delete copy.balanceAnchorAmount;
    if (rec.prevAt !== undefined) copy.balanceAnchorAt = rec.prevAt; else delete copy.balanceAnchorAt;
    return copy;
  });
  return { accounts: changed ? next : accounts, changed };
}
