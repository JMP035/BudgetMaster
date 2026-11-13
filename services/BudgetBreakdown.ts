// Desglose del período por categoría y moneda (pestaña «Categorías» de Presupuesto).
// Módulo puro: sin AsyncStorage ni react-native, para poder probarlo con sucrase-node.
//
// Reglas:
//  - Solo gastos (type === 'expense') con fecha dentro del período [start, end].
//  - Las transferencias (type 'transfer' o con transferPairId) no cuentan.
//  - El total «en Q» solo suma movimientos en quetzales (igual que el límite del presupuesto).
//    Los de otra moneda NO se convierten: van aparte, agrupados por su propia moneda.

import type { Transaction } from './storage';

export interface PeriodRange { start: Date; end: Date }

export interface ForeignBucket {
  currency: string;           // 'USD' | 'EUR' | '£' | ...
  total: number;
  txs: Transaction[];         // más recientes primero
}

export interface CategoryBreakdown {
  categoryId: string;
  qTotal: number;
  qTxs: Transaction[];        // en Q, más recientes primero
  foreign: ForeignBucket[];   // una casilla por moneda distinta de Q
}

const SHORT_MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** «28 oct» (mes abreviado fijo: no depende del locale del dispositivo). */
export function formatShortDay(d: Date): string {
  return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

/** «27 oct – 26 nov». */
export function formatPeriodRange(p: PeriodRange): string {
  return `${formatShortDay(p.start)} – ${formatShortDay(p.end)}`;
}

/** Moneda efectiva de un movimiento (los antiguos sin moneda son Q). */
export function currencyOf(t: Transaction): string {
  return t.currency || 'Q';
}

const CURRENCY_ORDER = ['USD', 'EUR', '£'];

function currencyRank(c: string): number {
  const i = CURRENCY_ORDER.indexOf(c);
  return i === -1 ? CURRENCY_ORDER.length : i;
}

/** Nombre en plural para frases («En dólares», «Además gastaste $ 5 en dólares»). */
export function currencyNoun(c: string): string {
  if (c === 'USD') return 'dólares';
  if (c === 'EUR') return 'euros';
  if (c === '£') return 'libras';
  return c;
}

export function isTransferLike(t: Transaction): boolean {
  return t.type === 'transfer' || !!t.transferPairId;
}

const byDateDesc = (a: Transaction, b: Transaction) => +new Date(b.date) - +new Date(a.date);

/** Movimientos del período agrupados por categoría y moneda. */
export function buildPeriodBreakdown(
  transactions: Transaction[],
  period: PeriodRange,
): Map<string, CategoryBreakdown> {
  const map = new Map<string, CategoryBreakdown>();
  for (const t of transactions) {
    if (t.type !== 'expense' || isTransferLike(t)) continue;
    const d = new Date(t.date);
    if (!(d >= period.start && d <= period.end)) continue;

    let entry = map.get(t.category);
    if (!entry) {
      entry = { categoryId: t.category, qTotal: 0, qTxs: [], foreign: [] };
      map.set(t.category, entry);
    }
    const cur = currencyOf(t);
    if (cur === 'Q') {
      entry.qTotal += t.amount;
      entry.qTxs.push(t);
    } else {
      let bucket = entry.foreign.find(b => b.currency === cur);
      if (!bucket) {
        bucket = { currency: cur, total: 0, txs: [] };
        entry.foreign.push(bucket);
      }
      bucket.total += t.amount;
      bucket.txs.push(t);
    }
  }
  for (const e of map.values()) {
    e.qTxs.sort(byDateDesc);
    e.foreign.sort((a, b) => currencyRank(a.currency) - currencyRank(b.currency) || a.currency.localeCompare(b.currency));
    for (const b of e.foreign) b.txs.sort(byDateDesc);
  }
  return map;
}

/** Suma por moneda extranjera de todas las categorías del período (para el resumen superior). */
export function foreignTotalsOf(map: Map<string, CategoryBreakdown>): { currency: string; total: number }[] {
  const acc = new Map<string, number>();
  for (const e of map.values()) {
    for (const b of e.foreign) acc.set(b.currency, (acc.get(b.currency) ?? 0) + b.total);
  }
  return [...acc.entries()]
    .map(([currency, total]) => ({ currency, total }))
    .sort((a, b) => currencyRank(a.currency) - currencyRank(b.currency) || a.currency.localeCompare(b.currency));
}

/**
 * Categorías con gasto en el período que NO tienen presupuesto, ordenadas por total en Q
 * (mayor primero). La categoría «transfer» (salidas por transferencia) no se lista.
 */
export function uncoveredCategories(
  map: Map<string, CategoryBreakdown>,
  budgetedIds: string[],
): CategoryBreakdown[] {
  const budgeted = new Set(budgetedIds);
  const firstForeign = (e: CategoryBreakdown) => (e.foreign.length ? e.foreign[0].total : 0);
  return [...map.values()]
    .filter(e => !budgeted.has(e.categoryId) && e.categoryId !== 'transfer')
    .sort((a, b) => b.qTotal - a.qTotal || firstForeign(b) - firstForeign(a) || a.categoryId.localeCompare(b.categoryId));
}
