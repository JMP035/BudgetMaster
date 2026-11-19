// ─────────────────────────────────────────────────────────────
// CARGA DE DEUDA MENSUAL (módulo PURO)
// ─────────────────────────────────────────────────────────────
// Sin react-native ni AsyncStorage: de ./storage solo `import type`.
//
// «Deuda» = SOLO la cuota mensual de las visacuotas y préstamos ACTIVOS (con cuotas por pagar). El consumo de
// la tarjeta NO es deuda aquí: se paga completo cada mes y ya lo mide Capacidad. Se calcula siempre desde las
// cuotas reales, así que cambia cuando el usuario agrega o termina una (antes se leía `settings.activeDebts`,
// una foto del onboarding que nunca se actualizaba).
//
// Umbrales únicos en toda la app: menos de 20 % saludable, de 20 a 40 % moderado, más de 40 % alto.
// El ratio se redondea a 1 decimal (lo que ve el usuario) ANTES de clasificarlo, así 20.0 % y 40.0 % nunca
// muestran un color distinto al número: exactamente 20 % es «moderado» y exactamente 40 % sigue «moderado».
//
// `settings.activeDebts` quedó como legado: solo cuenta (como «declarada») si el onboarding era el viejo, que
// no creaba cuotas. Si existe alguna cuota `onb_*`, esa misma deuda ya está en las cuotas y no se suma dos veces.

import type { CreditInstallment, IncomeSource, Transaction, UserSettings } from './storage';
import { baseMonthlyIncome } from './IncomeSources';
import { formatMoney } from './format';

export const DEBT_RATIO_MODERATE = 20;
export const DEBT_RATIO_HIGH = 40;

export type DebtLevel = 'none' | 'healthy' | 'moderate' | 'high';

export interface DebtLoad {
  /** Cuotas mensuales (Q) de visacuotas ligadas a una tarjeta. */
  cardInstallmentsQ: number;
  /** Cuotas mensuales (Q) de préstamos sin tarjeta. */
  loansQ: number;
  /** Deuda declarada en el onboarding viejo (Q/mes), 0 si ya está en las cuotas o no hay. */
  legacyQ: number;
  /** Suma de las tres anteriores. */
  totalQ: number;
  /** Cuotas reales activas (no cuenta la deuda declarada). */
  activeCount: number;
  /** Ingreso mensual (Q) con el que se mide el ratio; 0 si no hay. */
  incomeQ: number;
  incomeBasis: 'sources' | 'declared' | 'none';
  /** totalQ / incomeQ × 100 a 1 decimal; null si no hay ingreso. */
  ratioPct: number | null;
  level: DebtLevel;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;

/** Igual que `convertAmount(…, 'Q', rate)`: USD multiplica por la tasa; las demás monedas van 1:1. */
function toQ(amount: number, currency: string, rate: number): number {
  return currency === 'USD' ? amount * rate : amount;
}

/** Cuota que todavía se está pagando: activa y con cuotas por cargar. Única definición de «cuota viva» (Stats, asesor, notificaciones). */
export function isLiveInstallment(i: CreditInstallment): boolean {
  return !!i.isActive && i.paidInstallments < i.totalInstallments;
}

/**
 * Deuda DECLARADA en el onboarding (Q/mes), sin cuota que la siga:
 * - Onboarding actual: las deudas tipo «Tarjeta de crédito» no se convierten en cuota (el consumo de la tarjeta ya es
 *   gasto); quedan marcadas `declaredOnly` en `activeDebtsList` con su `monthlyQ` y solo ellas cuentan aquí. Los
 *   préstamos y visacuotas ya están en las cuotas, así que no se suman otra vez.
 * - Onboarding viejo: `activeDebts` completo, solo si no hay ninguna cuota `onb_*` (si la hay, esa misma deuda ya
 *   está en las cuotas y sumarla contaría dos veces).
 * `activeDebts` en 0 («Ya no la tengo») la quita en ambos casos.
 */
export function legacyDeclaredDebtQ(
  s: Pick<UserSettings, 'activeDebts'> & { activeDebtsList?: unknown[] },
  insts: CreditInstallment[],
): number {
  const declared = Number(s.activeDebts);
  if (!(declared > 0)) return 0;
  const list = Array.isArray(s.activeDebtsList) ? s.activeDebtsList : [];
  let declaredOnly = 0;
  let hasDeclaredOnly = false;
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    const x = e as { declaredOnly?: unknown; monthlyQ?: unknown };
    if (x.declaredOnly !== true) continue;
    hasDeclaredOnly = true;
    const q = Number(x.monthlyQ);
    if (q > 0) declaredOnly += q;
  }
  if (hasDeclaredOnly) return round2(Math.min(declared, declaredOnly));
  for (const i of insts) {
    if (typeof i.id === 'string' && i.id.indexOf('onb_') === 0) return 0;
  }
  return round2(declared);
}

/** Nivel de un ratio (%): <20 saludable, 20–40 (ambos incluidos) moderado, >40 alto; null = sin ratio. */
export function debtLevelOf(pct: number | null): DebtLevel {
  if (pct === null || !isFinite(pct)) return 'none';
  const r = Math.round(pct * 10) / 10;
  if (r > DEBT_RATIO_HIGH) return 'high';
  if (r >= DEBT_RATIO_MODERATE) return 'moderate';
  return 'healthy';
}

export function monthlyDebtLoad(i: {
  installments: CreditInstallment[];
  settings: Pick<UserSettings, 'monthlyIncome' | 'exchangeRate' | 'activeDebts'> & { activeDebtsList?: unknown[] };
  sources: IncomeSource[];
  txs: Transaction[];
}): DebtLoad {
  const rate = i.settings.exchangeRate;
  let cardQ = 0;
  let loansQ = 0;
  let count = 0;
  for (const inst of i.installments) {
    if (!isLiveInstallment(inst)) continue;
    const q = toQ(inst.monthlyPayment, inst.currency, rate);
    if (inst.accountId) cardQ += q;
    else loansQ += q;
    count++;
  }
  const cardInstallmentsQ = round2(cardQ);
  const loansQ2 = round2(loansQ);
  const legacyQ = legacyDeclaredDebtQ(i.settings, i.installments);
  const totalQ = round2(cardInstallmentsQ + loansQ2 + legacyQ);

  const fromSources = baseMonthlyIncome(i.sources, i.txs, rate);
  const declared = Number(i.settings.monthlyIncome);
  let incomeQ = 0;
  let incomeBasis: DebtLoad['incomeBasis'] = 'none';
  if (fromSources > 0) { incomeQ = fromSources; incomeBasis = 'sources'; }
  else if (declared > 0) { incomeQ = declared; incomeBasis = 'declared'; }

  const ratioPct = incomeQ > 0 ? Math.round((totalQ / incomeQ) * 1000) / 10 : null;
  const level: DebtLevel = totalQ <= 0 ? 'none' : ratioPct === null ? 'none' : debtLevelOf(ratioPct);

  return {
    cardInstallmentsQ, loansQ: loansQ2, legacyQ, totalQ, activeCount: count,
    incomeQ, incomeBasis, ratioPct, level,
  };
}

/** Una línea para el asistente y los textos de IA: «Q1,200.00 al mes (30.0 % del ingreso de tus fuentes)». */
export function debtSummaryText(d: DebtLoad): string {
  if (!(d.totalQ > 0)) return 'Sin cuotas de deuda activas';
  const amount = formatMoney(d.totalQ, 'Q', { sign: 'never' }).replace('Q ', 'Q');
  if (d.ratioPct === null) return `${amount} al mes (sin ingreso registrado para medir el ratio)`;
  const base = d.incomeBasis === 'sources' ? 'de tus fuentes' : 'declarado';
  return `${amount} al mes (${d.ratioPct.toFixed(1)}% del ingreso ${base})`;
}
