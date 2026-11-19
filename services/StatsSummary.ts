// Resumen de Estadísticas (módulo PURO): ingresos, gastos y ahorro por moneda, con las transferencias
// «sin clasificar» (categoría Transferencia que cuenta como gasto o ingreso) separadas para avisarlas.
// Sin react-native ni AsyncStorage: de ./storage solo `import type`.
//
// Reglas:
//  - Q incluye los movimientos sin moneda; USD va aparte; no se convierte nada.
//  - Los movimientos neutros (type 'transfer' o con transferPairId) nunca suman.
//  - `unclassified` se calcula SIEMPRE, aunque se excluyan de los totales, para que el aviso no desaparezca
//    al activar el interruptor «Sin transferencias».
import type { Currency, Transaction } from './storage';
import { storedToLocalDate } from './FixedCycle';
import { formatMoney } from './format';

export type StatsPeriod = 'current' | 'prev' | 'year' | 'all';
export type StatsCurrency = 'Q' | 'USD';
export type StatsView = 'income' | 'expense' | 'savings';

export interface StatsRange { start: Date | null; end: Date | null; }

/** Período de presupuesto actual y anterior, tal como los calcula `getCurrentFinancialPeriod`. */
export interface StatsPeriodDates { start: Date; end: Date; prevStart: Date; prevEnd: Date; }

/** Rango de fechas de cada filtro. 'all' no tiene límites (null). */
export function statsRange(p: StatsPeriod, fp: StatsPeriodDates, now: Date): StatsRange {
  switch (p) {
    case 'current': return { start: fp.start, end: fp.end };
    case 'prev': return { start: fp.prevStart, end: fp.prevEnd };
    case 'year': return { start: new Date(now.getFullYear(), 0, 1), end: new Date(now.getFullYear(), 11, 31) };
    default: return { start: null, end: null };
  }
}

function dayNum(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** Movimientos cuyo día local cae dentro del rango (ambos extremos incluidos). 'all' devuelve `txs`. */
export function txsInRange(txs: Transaction[], r: StatsRange): Transaction[] {
  if (!r.start || !r.end) return txs;
  const lo = dayNum(r.start);
  const hi = dayNum(r.end);
  return txs.filter(t => {
    const d = storedToLocalDate(t.date);
    if (!d) return false;
    const n = dayNum(d);
    return n >= lo && n <= hi;
  });
}

/** Moneda de un movimiento; sin moneda guardada cuenta como quetzales. */
export function txCurrency(t: Transaction): Currency {
  return t.currency ?? 'Q';
}

/** Traslado entre cuentas propias o pago de tarjeta: no es gasto ni ingreso. */
export function isNeutralTx(t: Transaction): boolean {
  return t.type === 'transfer' || !!t.transferPairId || !!t.cardPayment;
}

/**
 * Transferencia que hoy cuenta como gasto o ingreso porque nadie dijo a qué cuenta fue: un gasto con categoría
 * «Transferencia» o un ingreso con categoría «transfer_in». Los pagos de tarjeta y los pares no entran.
 */
export function isUnclassifiedTransfer(t: Transaction): boolean {
  if (isNeutralTx(t)) return false;
  return (t.type === 'expense' && t.category === 'transfer') || (t.type === 'income' && t.category === 'transfer_in');
}

function inCurrency(t: Transaction, c: StatsCurrency): boolean {
  return txCurrency(t) === c;
}

/** ¿Hay gastos o ingresos (no neutros) en esa moneda? */
export function hasCurrencyActivity(txs: Transaction[], c: StatsCurrency): boolean {
  return txs.some(t => (t.type === 'expense' || t.type === 'income') && !isNeutralTx(t) && inCurrency(t, c));
}

export interface CategoryTotal { id: string; value: number; pct: number; count: number; }

export interface UnclassifiedTransfers {
  count: number; expense: number; income: number; total: number;
  txIds: string[]; smsIds: string[]; manualIds: string[];
}

export interface StatsSummary {
  currency: StatsCurrency;
  income: number; expense: number; savings: number;
  /** Ahorro / ingresos en %; null si no hay ingresos. */
  savingsRate: number | null;
  expenseByCategory: CategoryTotal[];
  incomeByCategory: CategoryTotal[];
  unclassified: UnclassifiedTransfers;
  /** Se pidió excluir las transferencias sin clasificar y había alguna que excluir. */
  excluded: boolean;
}

function round2(n: number): number {
  return Math.round((isFinite(n) ? n : 0) * 100) / 100;
}

function byCategory(map: Map<string, { value: number; count: number }>, total: number): CategoryTotal[] {
  const out: CategoryTotal[] = [];
  for (const [id, v] of map) {
    out.push({ id, value: round2(v.value), count: v.count, pct: total > 0 ? round2((v.value / total) * 100) : 0 });
  }
  return out.sort((a, b) => b.value - a.value || a.id.localeCompare(b.id));
}

export function summarizeStats(
  txs: Transaction[],
  o: { currency: StatsCurrency; excludeUnclassified: boolean },
): StatsSummary {
  let income = 0;
  let expense = 0;
  const expCat = new Map<string, { value: number; count: number }>();
  const incCat = new Map<string, { value: number; count: number }>();
  const un: UnclassifiedTransfers = { count: 0, expense: 0, income: 0, total: 0, txIds: [], smsIds: [], manualIds: [] };

  for (const t of txs) {
    if (t.type !== 'expense' && t.type !== 'income') continue;
    if (isNeutralTx(t) || !inCurrency(t, o.currency)) continue;
    const unclassified = isUnclassifiedTransfer(t);
    if (unclassified) {
      un.count++;
      if (t.type === 'expense') un.expense += t.amount; else un.income += t.amount;
      un.txIds.push(t.id);
      if (t.source === 'sms') un.smsIds.push(t.id); else un.manualIds.push(t.id);
      if (o.excludeUnclassified) continue;
    }
    const map = t.type === 'expense' ? expCat : incCat;
    const cur = map.get(t.category) ?? { value: 0, count: 0 };
    cur.value += t.amount;
    cur.count++;
    map.set(t.category, cur);
    if (t.type === 'expense') expense += t.amount; else income += t.amount;
  }

  income = round2(income);
  expense = round2(expense);
  un.expense = round2(un.expense);
  un.income = round2(un.income);
  un.total = round2(un.expense + un.income);
  const savings = round2(income - expense);
  return {
    currency: o.currency,
    income, expense, savings,
    savingsRate: income > 0 ? (savings / income) * 100 : null,
    expenseByCategory: byCategory(expCat, expense),
    incomeByCategory: byCategory(incCat, income),
    unclassified: un,
    excluded: o.excludeUnclassified && un.count > 0,
  };
}

export type SavingsLevel = 'great' | 'low' | 'negative' | 'no_income';

/** Nivel de la tasa de ahorro: desde 20 % es excelente, desde 0 % es bajo, por debajo de 0 es negativo. */
export function savingsLevel(s: StatsSummary): SavingsLevel {
  if (s.savingsRate === null) return 'no_income';
  if (s.savingsRate >= 20) return 'great';
  if (s.savingsRate >= 0) return 'low';
  return 'negative';
}

export function savingsComment(l: SavingsLevel): string {
  switch (l) {
    case 'great': return 'Excelente: superas el 20% recomendado';
    case 'low': return 'Bajo: apunta al 20% mínimo';
    case 'negative': return 'Negativo: gastas más de lo que ingresas';
    default: return 'Sin ingresos registrados en este período: no se puede calcular la tasa.';
  }
}

/** Las `n` categorías que más pesan (mayor primero). */
export function topCategories(list: CategoryTotal[], n = 3): CategoryTotal[] {
  return [...list].sort((a, b) => b.value - a.value || a.id.localeCompare(b.id)).slice(0, Math.max(0, n));
}

/** Frases simples (en «tú») que explican por qué el ahorro sale como sale. */
export function explainSavings(s: StatsSummary, labelOf: (id: string) => string): string[] {
  const money = (n: number) => formatMoney(n, s.currency, { decimals: 0 });
  const moneyAbs = (n: number) => formatMoney(n, s.currency, { decimals: 0, sign: 'never' });
  const moneda = s.currency === 'USD' ? 'dólares' : 'quetzales';
  const out: string[] = [];

  if (s.income <= 0 && s.expense <= 0) {
    out.push(`No hay ingresos ni gastos en ${moneda} en este período.`);
  } else if (s.income <= 0) {
    out.push(`Todavía no registras ingresos en ${moneda} en este período, así que tu ahorro es igual a tus gastos, en negativo.`);
  } else if (s.savings < 0) {
    out.push(`Gastaste ${moneyAbs(s.savings)} más de lo que entró: ${moneyAbs(s.income)} de ingresos contra ${moneyAbs(s.expense)} de gastos.`);
  } else {
    out.push(`Te quedó ${moneyAbs(s.savings)}: entró ${moneyAbs(s.income)} y gastaste ${moneyAbs(s.expense)}.`);
  }

  const top = topCategories(s.expenseByCategory, 1)[0];
  if (top && s.expense > 0) {
    out.push(`Lo que más pesó fue ${labelOf(top.id)}: ${moneyAbs(top.value)} (${Math.round(top.pct)} % de tus gastos).`);
  }

  const u = s.unclassified;
  if (u.count > 0 && !s.excluded) {
    const sinEllas = money((s.income - u.income) - (s.expense - u.expense));
    if (u.expense > 0) {
      out.push(`${moneyAbs(u.expense)} de tus gastos son transferencias sin clasificar. Si fue dinero entre tus cuentas, al aclararlo tu ahorro quedaría en ${sinEllas}.`);
    }
    if (u.income > 0) {
      out.push(`${moneyAbs(u.income)} de tus ingresos son transferencias sin clasificar. Si fue dinero entre tus cuentas, al aclararlo tu ahorro quedaría en ${sinEllas}.`);
    }
  }
  if (s.excluded) {
    out.push(`No se cuentan ${moneyAbs(u.total)} en transferencias sin clasificar (interruptor «Sin transferencias»).`);
  }
  return out;
}
