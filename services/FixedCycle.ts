// Ciclo mensual de los gastos fijos (módulo PURO). Sin react-native ni AsyncStorage:
// de ./storage solo `import type`.
//
// El ciclo sigue siendo el mes calendario ('YYYY-MM'), pero cada movimiento se asigna al
// vencimiento MÁS CERCANO (mes anterior / mismo mes / mes siguiente). Así un SMS del 28 de
// octubre pertenece al vencimiento del 1 de noviembre, y uno del 1 de octubre a un gasto del
// día 30 pertenece al vencimiento de septiembre (pago atrasado).
import type { FixedExpense } from './storage';

/** Prefijo del id del movimiento manual que crea "marcar pagado": `fe_tx_<gastoId>_<YYYY-MM>`. */
export const FE_TX_PREFIX = 'fe_tx_';

const FE_TX_ID_RE = /^fe_tx_(.+?)(?:_\d{4}-\d{2}(?:_\d+)?)?$/;
const FE_TX_CYCLE_RE = /^fe_tx_.+?_(\d{4}-\d{2})(?:_\d+)?$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/;

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM' en hora local. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

/**
 * Fecha local de un valor guardado. Un valor solo-fecha (o medianoche UTC, como lo guardan algunas
 * pantallas) ya ES ese día: se devuelve ese día local a las 12:00. El resto es new Date(stored).
 * Misma regla que storedDateToDateOnly (storage.ts), copiada para no importar AsyncStorage.
 */
export function storedToLocalDate(stored: string): Date | null {
  if (DATE_ONLY_RE.test(stored)) {
    const y = Number(stored.slice(0, 4));
    const m = Number(stored.slice(5, 7));
    const d = Number(stored.slice(8, 10));
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const dt = new Date(stored);
  return isNaN(dt.getTime()) ? null : dt;
}

function daysInMonthOf(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Día de pago recortado al largo real del mes (copia de getEffectivePaymentDay de storage). */
export function effectiveDay(day: number, year: number, month: number): number {
  return Math.min(Math.max(1, Math.round(day)), daysInMonthOf(year, month));
}

/** Número de día calendario (sin horas) para restar días sin problemas de horario. */
function dayNum(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month, day) / 86400000);
}

/** Número de día calendario local de un valor guardado; null si es inválido. */
export function storedDayNumber(stored: string): number | null {
  const dt = storedToLocalDate(stored);
  return dt ? dayNum(dt.getFullYear(), dt.getMonth(), dt.getDate()) : null;
}

interface Occurrence { key: string; distance: number; }

/** Vencimiento más cercano (mes anterior / mismo / siguiente). Empate: el mes del propio movimiento. */
function nearestOccurrence(dayOfMonth: number, stored: string): Occurrence | null {
  const dt = storedToLocalDate(stored);
  if (!dt) return null;
  const y = dt.getFullYear();
  const m = dt.getMonth();
  const txNum = dayNum(y, m, dt.getDate());

  let best: Occurrence | null = null;
  // Primero el mes propio: con el `<` estricto, un empate se queda con él.
  for (const off of [0, -1, 1]) {
    const ref = new Date(y, m + off, 1);
    const yy = ref.getFullYear();
    const mm = ref.getMonth();
    const distance = txNum - dayNum(yy, mm, effectiveDay(dayOfMonth, yy, mm));
    if (!best || Math.abs(distance) < Math.abs(best.distance)) {
      best = { key: `${yy}-${pad2(mm + 1)}`, distance };
    }
  }
  return best;
}

/** monthKey del vencimiento más cercano al movimiento; null si la fecha es inválida. */
export function occurrenceKeyFor(dayOfMonth: number, stored: string): string | null {
  return nearestOccurrence(dayOfMonth, stored)?.key ?? null;
}

/** Días entre el vencimiento más cercano y el movimiento (positivo = después del vencimiento). */
export function dueDistanceDays(dayOfMonth: number, stored: string): number | null {
  return nearestOccurrence(dayOfMonth, stored)?.distance ?? null;
}

/** Id del movimiento manual de "marcar pagado". */
export function feTxId(expenseId: string, key: string): string {
  return `${FE_TX_PREFIX}${expenseId}_${key}`;
}

/** Id del gasto fijo dentro de un id `fe_tx_*` (con o sin sufijo de ciclo); null si no lo es. */
export function fixedIdFromFeTxId(id: string): string | null {
  const m = FE_TX_ID_RE.exec(id);
  return m ? m[1] : null;
}

/** Ciclo ('YYYY-MM') del sufijo de un id `fe_tx_*`; null si no lo trae. */
export function cycleKeyFromFeTxId(id: string): string | null {
  const m = FE_TX_CYCLE_RE.exec(id);
  return m ? m[1] : null;
}

/**
 * Reinicio mensual: un gasto se conserva pagado si su paidCycleKey cubre el mes actual (o uno
 * futuro); si no, se limpian los campos de pago (igual que resetFixedExpensesForNewMonth).
 */
export function planFixedMonthlyReset(
  expenses: FixedExpense[],
  now: Date,
): { next: FixedExpense[]; changed: boolean } {
  const cur = monthKey(now);
  let changed = false;
  const next = expenses.map(e => {
    if (e.paidCycleKey && e.paidCycleKey >= cur) return e;
    const dirty = e.isPaid || e.paidDate !== undefined || e.lastTxId !== undefined
      || e.paidTxId !== undefined || e.paidBy !== undefined || e.paidCycleKey !== undefined;
    if (!dirty) return e;
    changed = true;
    return {
      ...e, isPaid: false, paidDate: undefined, lastTxId: undefined, paidTxId: undefined,
      paidBy: undefined, paidCycleKey: undefined,
    };
  });
  return { next, changed };
}
