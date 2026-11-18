// ─────────────────────────────────────────────────────────────
// PRESUPUESTO POR PERÍODO (módulo PURO)
// ─────────────────────────────────────────────────────────────
// `settings.budgetLimit` y los límites por categoría (`CategoryBudget.limit`) son MENSUALES: el onboarding pone el
// 80 % del ingreso mensual y Ajustes dice «Presupuesto mensual». Pero la app mide el gasto de UN período de pago
// (una quincena o una semana). Compararlos tal cual haría que quien cobra por semana vea 25 % cuando ya gastó todo
// su presupuesto. Este módulo reparte el límite mensual entre los períodos del mes y es el ÚNICO lugar donde se hace.
//
//   mensual   → ×1        (el período es un mes)
//   irregular → ×1        (el período es el MES CALENDARIO: no hay quincenas ni semanas que repartir)
//   quincenal → ×0.5
//   semanal   → ×12/52    (52 semanas al año entre 12 meses: la misma conversión del ingreso, ver IncomeSources)
//
// Un usuario mensual o irregular NO cambia: con factor 1 se devuelve el valor tal cual (sin redondear).
// Sin react-native ni AsyncStorage: de ./storage solo `import type`.

import type { PaymentCycle, UserSettings } from './storage';

/** Ingreso (o presupuesto) de UNA semana → equivalente mensual (×52/12). Misma expresión que usa baseMonthlyIncome. */
export function weeklyToMonthly(perWeek: number): number {
  return perWeek * 52 / 12;
}

/** Monto mensual → lo que toca por semana (×12/52). Inversa de weeklyToMonthly. */
export function monthlyToWeekly(monthly: number): number {
  return monthly * 12 / 52;
}

/** Redondeo a centavos. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Qué parte del límite mensual toca a un período del ciclo dado (1 si no hay que repartir). */
export function periodBudgetFactor(cycle: PaymentCycle | undefined): number {
  if (cycle === 'biweekly') return 0.5;
  if (cycle === 'weekly') return monthlyToWeekly(1);
  return 1;
}

/** true si el período es más corto que un mes (quincena o semana): hay que repartir el límite mensual. */
export function isSplitCycle(cycle: PaymentCycle | undefined): boolean {
  return cycle === 'biweekly' || cycle === 'weekly';
}

/** Un límite mensual repartido al período del ciclo (centavos). Con ciclo mensual/irregular se devuelve tal cual. */
export function periodCategoryLimit(monthlyLimit: number, cycle: PaymentCycle | undefined): number {
  if (!(monthlyLimit > 0)) return 0;
  // Mínimo de un centavo: un límite positivo nunca se redondea a 0 (evita dividir entre cero y perder el límite).
  if (cycle === 'biweekly') return Math.max(0.01, round2(monthlyLimit * 0.5));
  if (cycle === 'weekly') return Math.max(0.01, round2(monthlyToWeekly(monthlyLimit)));
  return monthlyLimit;
}

/** El presupuesto general del período: `budgetLimit` mensual repartido según el ciclo de pago (0 si no hay presupuesto). */
export function periodBudgetLimit(settings: Pick<UserSettings, 'budgetLimit' | 'paymentCycle'>): number {
  return periodCategoryLimit(Number(settings.budgetLimit), settings.paymentCycle);
}

/** Nombre del período para los textos: «quincena», «semana» o «mes». */
export function periodUnitName(cycle: PaymentCycle | undefined): string {
  if (cycle === 'biweekly') return 'quincena';
  if (cycle === 'weekly') return 'semana';
  return 'mes';
}

/** Lo que muestra el sistema de umbrales de aviso: cifras del período contra el presupuesto repartido. */
export interface BudgetThresholdFigures {
  /** Presupuesto del período (0 si no hay). */
  budgetLimit: number;
  /** % del presupuesto del período ya gastado (0 sin presupuesto). */
  pct: number;
  /** Lo que queda del presupuesto del período (puede ser negativo). */
  remaining: number;
  /** Límite de la categoría repartido al período (0 si la categoría no tiene límite). */
  catLimit: number;
  /** % del límite de categoría ya gastado (0 sin límite). */
  catPct: number;
}

/**
 * Cifras de los avisos de umbral (50/80/100 % general; 80/100 % por categoría) contra el límite del PERÍODO, no el
 * mensual. `catMonthlyLimit` es el CategoryBudget.limit (mensual) de la categoría del gasto, si lo tiene.
 */
export function budgetThresholdFigures(input: {
  settings: Pick<UserSettings, 'budgetLimit' | 'paymentCycle'>;
  spent: number;
  catMonthlyLimit?: number;
  catSpent?: number;
}): BudgetThresholdFigures {
  const budgetLimit = periodBudgetLimit(input.settings);
  const catLimit = periodCategoryLimit(input.catMonthlyLimit ?? 0, input.settings.paymentCycle);
  return {
    budgetLimit,
    pct: budgetLimit > 0 ? (input.spent / budgetLimit) * 100 : 0,
    remaining: budgetLimit - input.spent,
    catLimit,
    catPct: catLimit > 0 ? ((input.catSpent ?? 0) / catLimit) * 100 : 0,
  };
}
