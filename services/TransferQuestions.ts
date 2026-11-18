// Módulo PURO (sin react-native ni AsyncStorage): las preguntas «¿a dónde fue esta transferencia?» /
// «¿de dónde vino este ingreso?» para los SMS de transferencia que no tienen su otra mitad (par). La app
// reconoce las transferencias entre cuentas propias por pares de SMS (TransferPairs); si falta un mensaje,
// la persona completa a mano la cuenta que falta. De ./storage solo `import type`.
//
// Se pregunta solo si hay al menos 2 cuentas que no sean tarjeta (sin dos cuentas no hay a dónde mover dinero).
import type { Account, Transaction } from './storage';
import { findTransferPairs } from './TransferPairs';

const HOUR_MS = 60 * 60 * 1000;
/** Pasada la ventana de emparejado (36 h) la otra mitad ya no va a llegar. */
export const QUESTION_OLD_MS = 36 * HOUR_MS;
/** Un SMS recién llegado todavía puede traer su otra mitad: sin contraparte posible se espera esta gracia. */
export const QUESTION_GRACE_MS = HOUR_MS;

export interface UnpairedTransfer {
  txId: string;
  /** 'out' = salida de dinero (type expense, category transfer); 'in' = entrada (type income, category transfer_in). */
  direction: 'out' | 'in';
  amount: number;
  currency: Transaction['currency'];
  date: string;
  bank: string;
  /** 'old' = pasaron más de 36 h; 'no_counterpart' = no hay mensaje contrario posible. */
  reason: 'old' | 'no_counterpart';
}

/** Clave de «ya respondí / descarté esta pregunta» (va en la lista de ignorados, junto a las de los duplicados). */
export function transferQuestionKey(txId: string): string {
  return `tq|${txId}`;
}

function isOut(t: Transaction): boolean {
  return t.source === 'sms' && t.type === 'expense' && t.category === 'transfer' && !t.transferPairId && !t.cardPayment;
}

function isIn(t: Transaction): boolean {
  return t.source === 'sms' && t.type === 'income' && t.category === 'transfer_in' && !t.transferPairId;
}

/** Cuentas entre las que se puede mover dinero: activas y que no sean tarjeta. */
export function movableAccounts(accounts: Account[]): Account[] {
  return accounts.filter(a => a.isActive && a.type !== 'credit');
}

/**
 * Salidas `transfer` y entradas `transfer_in` de SMS sin par: se preguntan si tienen más de 36 h o si no existe
 * una contraparte posible (ni siquiera un mensaje contrario que pudiera emparejarlas) pasada la gracia.
 * Más antiguas primero. Vacío si hay menos de 2 cuentas que no sean tarjeta.
 */
export function findUnpairedTransfers(
  txs: Transaction[],
  accounts: Account[],
  ignored: Set<string>,
  now: Date = new Date(),
): UnpairedTransfer[] {
  if (movableAccounts(accounts).length < 2) return [];
  const candidates = txs.filter(t => (isOut(t) || isIn(t)) && !ignored.has(transferQuestionKey(t.id)));
  if (candidates.length === 0) return [];

  // Con contraparte posible = el motor de pares los emparejaría (o los propondría).
  const withCounterpart = new Set<string>();
  for (const p of findTransferPairs(txs, ignored, { accounts })) {
    withCounterpart.add(p.outId);
    withCounterpart.add(p.inId);
  }

  const out: UnpairedTransfer[] = [];
  const nowMs = now.getTime();
  for (const t of candidates) {
    const ms = Date.parse(t.date);
    if (isNaN(ms)) continue;
    const age = nowMs - ms;
    let reason: UnpairedTransfer['reason'] | null = null;
    if (age > QUESTION_OLD_MS) reason = 'old';
    else if (age > QUESTION_GRACE_MS && !withCounterpart.has(t.id)) reason = 'no_counterpart';
    if (!reason) continue;
    out.push({
      txId: t.id, direction: isOut(t) ? 'out' : 'in', amount: t.amount, currency: t.currency,
      date: t.date, bank: t.bank ?? '', reason,
    });
  }
  return out.sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
}

/**
 * La persona dice a qué cuenta fue la salida (o de cuál vino la entrada): el movimiento pasa a ser una
 * transferencia (type 'transfer', neutra para las estadísticas) con su tipo previo en `transferPrev` y
 * fromAccountId/toAccountId. `toAmount` (solo en salidas) = lo que recibió la cuenta destino si es de otra moneda.
 * null si no se puede: no es un candidato, la cuenta no existe, es tarjeta o es la misma cuenta del movimiento.
 */
export function planAssignTransferDestination(
  tx: Transaction,
  accountId: string,
  accounts: Account[],
  opts?: { toAmount?: number },
): Transaction | null {
  const outgoing = isOut(tx);
  if (!outgoing && !isIn(tx)) return null;
  const other = movableAccounts(accounts).find(a => a.id === accountId);
  if (!other || other.id === tx.accountId) return null;
  const next: Transaction = {
    ...tx,
    type: 'transfer',
    category: 'transfer',
    transferPrev: { type: tx.type, category: tx.category },
  };
  const toAmount = opts?.toAmount;
  if (outgoing) {
    if (tx.accountId) next.fromAccountId = tx.accountId;
    next.toAccountId = other.id;
    if (typeof toAmount === 'number' && isFinite(toAmount) && toAmount > 0) next.toAmount = toAmount;
  } else {
    if (tx.accountId) next.toAccountId = tx.accountId;
    next.fromAccountId = other.id;
  }
  return next;
}

/** «A otra persona» / «Ingreso externo»: el movimiento no cambia y la pregunta no vuelve; devuelve la clave a ignorar. */
export function planDismissTransferQuestion(txId: string): string {
  return transferQuestionKey(txId);
}
