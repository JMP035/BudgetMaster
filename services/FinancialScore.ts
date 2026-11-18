// Score financiero 0-100 (módulo PURO: de ./storage solo `import type`, sin regex lookbehind, fechas locales).
// Se mide en el PERÍODO DE PAGO (no el mes calendario) y con las mismas cifras que el anillo del Inicio, los
// avisos y el widget: `txsInPeriod` / `spentQOf` / `incomeQOf` (transferencias y monedas distintas de Q fuera).
import type { FixedExpense, Transaction } from './storage';
import { fmtQ, incomeQOf, spentQOf, txsInPeriod } from './NotificationTexts';

/** Ventana del período (inicio y fin inclusive, por día local). */
export interface ScoreWindow { start: Date; end: Date }

export interface ScoreInput {
  transactions: Transaction[];
  window: ScoreWindow;
  /** Presupuesto del período en Q; con 0 o menos el factor de presupuesto es neutral. */
  budgetForPeriod: number;
  fixedExpenses: FixedExpense[];
  /** Cuentas ACTIVAS (las inactivas no cuentan). */
  activeAccountsCount: number;
}

export type ScoreFactorId = 'savings' | 'budget' | 'fixed' | 'accounts';

export interface ScoreFactor {
  id: ScoreFactorId;
  /** Puntos que suma (o resta) al puntaje base de 50. */
  points: number;
  state: 'good' | 'ok' | 'bad' | 'pending';
  text: string;
}

export interface ScoreResult {
  score: number;
  incomeQ: number;
  expenseQ: number;
  /** Tasa de ahorro en % (puede ser negativa); null si el período aún no tiene ingreso registrado. */
  savingsRate: number | null;
  /** Siempre los 4 factores, en este orden: ahorro, presupuesto, fijos, cuentas. */
  factors: ScoreFactor[];
}

export const SCORE_BASE = 50;
export const SAVINGS_PENDING_TEXT = 'Tu ingreso de este período todavía no está registrado: el ahorro no suma ni resta';

function pctText(n: number): string {
  return `${Math.round(n * 10) / 10}%`;
}

export function computeFinancialScore(i: ScoreInput): ScoreResult {
  const list = txsInPeriod(i.transactions, i.window.start, i.window.end);
  const incomeQ = incomeQOf(list);
  const expenseQ = spentQOf(list);

  // ── Ahorro ──
  let savings: ScoreFactor;
  let savingsRate: number | null = null;
  if (incomeQ > 0) {
    // Se redondea para que 20.000000000000004 / 19.999999999999996 no cambien de tramo.
    const rate = Math.round(((incomeQ - expenseQ) / incomeQ) * 100 * 1e6) / 1e6;
    savingsRate = rate;
    if (rate >= 20) {
      savings = { id: 'savings', points: 20, state: 'good', text: `Ahorrás ${pctText(rate)} de tu ingreso del período (20% o más suma 20)` };
    } else if (rate >= 10) {
      savings = { id: 'savings', points: 10, state: 'ok', text: `Ahorrás ${pctText(rate)} de tu ingreso del período (10% o más suma 10)` };
    } else if (rate < 0) {
      savings = { id: 'savings', points: -15, state: 'bad', text: 'Gastaste más de lo que ingresó en el período (resta 15)' };
    } else {
      savings = { id: 'savings', points: 0, state: 'ok', text: `Ahorrás ${pctText(rate)} de tu ingreso del período: con 10% o más empieza a sumar` };
    }
  } else {
    savings = { id: 'savings', points: 0, state: 'pending', text: SAVINGS_PENDING_TEXT };
  }

  // ── Presupuesto del período ──
  let budget: ScoreFactor;
  if (i.budgetForPeriod > 0) {
    if (expenseQ <= i.budgetForPeriod) {
      budget = { id: 'budget', points: 15, state: 'good', text: `Gastaste ${fmtQ(expenseQ)} de ${fmtQ(i.budgetForPeriod)} de presupuesto (suma 15)` };
    } else {
      budget = { id: 'budget', points: -10, state: 'bad', text: `Gastaste ${fmtQ(expenseQ)} y tu presupuesto era ${fmtQ(i.budgetForPeriod)} (resta 10)` };
    }
  } else {
    budget = { id: 'budget', points: 0, state: 'pending', text: 'Todavía no tenés un presupuesto definido: no suma ni resta' };
  }

  // ── Gastos fijos ──
  const activeFixed = i.fixedExpenses.filter(f => f.isActive);
  const paidFixed = activeFixed.filter(f => f.isPaid).length;
  let fixed: ScoreFactor;
  if (activeFixed.length === 0) {
    fixed = { id: 'fixed', points: 0, state: 'pending', text: 'No tenés gastos fijos activos: no suma ni resta' };
  } else if (paidFixed === activeFixed.length) {
    fixed = { id: 'fixed', points: 10, state: 'good', text: `Pagaste tus ${activeFixed.length} gastos fijos (suma 10)` };
  } else {
    fixed = { id: 'fixed', points: 0, state: 'ok', text: `Pagaste ${paidFixed} de ${activeFixed.length} gastos fijos: con todos pagados suma 10` };
  }

  // ── Cuentas ──
  const accounts: ScoreFactor = i.activeAccountsCount > 0
    ? { id: 'accounts', points: 5, state: 'good', text: 'Tenés cuentas activas registradas (suma 5)' }
    : { id: 'accounts', points: 0, state: 'pending', text: 'Registrá una cuenta activa para sumar 5' };

  const factors = [savings, budget, fixed, accounts];
  const raw = SCORE_BASE + factors.reduce((s, f) => s + f.points, 0);
  return { score: Math.max(0, Math.min(100, raw)), incomeQ, expenseQ, savingsRate, factors };
}
