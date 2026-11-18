// Textos y cifras de las notificaciones (módulo PURO: de ./storage solo `import type`, sin regex lookbehind,
// fechas locales). Todo se mide en el PERÍODO DE PAGO REAL (inicio = día que cae el sueldo), nunca en el mes
// calendario. El servicio (NotificationService) solo decide cuándo enviar; aquí se arma qué dice.
import type { CategoryBudget, FixedExpense, Transaction, UserSettings } from './storage';
import { storedToLocalDate } from './FixedCycle';
import type { DebtLoad } from './DebtLoad';
import { periodBudgetLimit, periodCategoryLimit } from './PeriodBudget';

/** Período (inicio y fin inclusive; `nextStart` = inicio del siguiente si se conoce). */
export interface PeriodRange { start: Date; end: Date; nextStart?: Date; }

// ── Formato ────────────────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'Q1,234.50' (miles con coma, 2 decimales). */
export function fmtQ(n: number): string {
  const v = isFinite(n) ? n : 0;
  const sign = v < 0 ? '-' : '';
  const s = Math.abs(v).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${sign}Q${s}`;
}

/** Monto con su moneda: Q y USD en forma corta, el resto con el código. */
export function fmtMoney(n: number, currency: string): string {
  if (currency === 'Q') return fmtQ(n);
  const sign = n < 0 ? '-' : '';
  const s = Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return currency === 'USD' ? `${sign}$${s}` : `${sign}${s} ${currency}`;
}

/** 'dd/mm' */
export function fmtDM(d: Date): string {
  return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}`;
}

function dayNumOf(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

// ── Cifras del período ─────────────────────────────────────────

/** Movimientos cuyo día local cae entre `start` y `end` (ambos incluidos). */
export function txsInPeriod(txs: Transaction[], start: Date, end: Date): Transaction[] {
  const lo = dayNumOf(start);
  const hi = dayNumOf(end);
  return txs.filter(t => {
    const d = storedToLocalDate(t.date);
    if (!d) return false;
    const n = dayNumOf(d);
    return n >= lo && n <= hi;
  });
}

/** Los traslados entre cuentas propias y los pagos de tarjeta NUNCA son gasto ni ingreso del período. */
function isNeutral(t: Transaction): boolean {
  return t.type === 'transfer' || !!t.transferPairId;
}

/** Gasto en Q (excluye neutros); con `categoryId` solo esa categoría. */
export function spentQOf(list: Transaction[], categoryId?: string): number {
  let s = 0;
  for (const t of list) {
    if (t.type !== 'expense' || isNeutral(t) || (t.currency ?? 'Q') !== 'Q') continue;
    if (categoryId !== undefined && t.category !== categoryId) continue;
    s += t.amount;
  }
  return Math.round(s * 100) / 100;
}

/** Ingreso en Q (excluye neutros). */
export function incomeQOf(list: Transaction[]): number {
  let s = 0;
  for (const t of list) {
    if (t.type !== 'income' || isNeutral(t) || (t.currency ?? 'Q') !== 'Q') continue;
    s += t.amount;
  }
  return Math.round(s * 100) / 100;
}

export interface CatRow { categoryId: string; label: string; spent: number; limit: number; pct: number; }

export interface PeriodSnapshot {
  period: PeriodRange;
  /** 'dd/mm – dd/mm' del período. */
  label: string;
  spentQ: number;
  incomeQ: number;
  /** Presupuesto del PERÍODO: el mensual de Ajustes repartido según el ciclo de pago (ver PeriodBudget). */
  budgetLimit: number;
  hasBudget: boolean;
  pct: number;
  remaining: number;
  daysPassed: number;
  daysTotal: number;
  /** Días que le quedan al período (lo da el llamador: depende del ciclo y de las anclas; con ciclo irregular, hasta fin de mes). */
  daysLeft: number;
  /** Días hasta el próximo pago; null con ciclo irregular, que no tiene fecha de cobro (no es 0: no hay «hoy cobras»). */
  daysToPay: number | null;
  unpaidFixedCount: number;
  unpaidFixedTotal: number;
  catRows: CatRow[];
  catAlerts: number;
}

/**
 * Cifras del período de pago actual con lo registrado (puro). El presupuesto y los límites por categoría son
 * mensuales: aquí se reparten al período (quincena o semana) para compararlos con el gasto de ese período.
 */
export function periodSnapshot(input: {
  settings: Pick<UserSettings, 'budgetLimit' | 'paymentCycle'>;
  txs: Transaction[];
  categoryBudgets: CategoryBudget[];
  fixed: FixedExpense[];
  now: Date;
  period: PeriodRange;
  daysLeft: number;
  labelOfCategory: (id: string) => string;
}): PeriodSnapshot {
  const { settings, categoryBudgets, fixed, now, period } = input;
  const list = txsInPeriod(input.txs, period.start, period.end);
  const spentQ = spentQOf(list);
  const incomeQ = incomeQOf(list);
  const budgetLimit = periodBudgetLimit(settings);
  const hasBudget = budgetLimit > 0;
  const pct = hasBudget ? Math.round((spentQ / budgetLimit) * 100) : 0;
  const nextStart = period.nextStart ?? new Date(period.end.getFullYear(), period.end.getMonth(), period.end.getDate() + 1, 12);
  const daysTotal = Math.max(1, dayNumOf(nextStart) - dayNumOf(period.start));
  const daysPassed = Math.min(daysTotal, Math.max(1, dayNumOf(now) - dayNumOf(period.start) + 1));
  const unpaid = fixed.filter(f => f.isActive && !f.isPaid);
  const catRows: CatRow[] = categoryBudgets.filter(cb => cb.limit > 0).map(cb => {
    const spent = spentQOf(list, cb.categoryId);
    const limit = periodCategoryLimit(cb.limit, settings.paymentCycle);
    return {
      categoryId: cb.categoryId, label: input.labelOfCategory(cb.categoryId),
      spent, limit, pct: Math.round((spent / limit) * 100),
    };
  });
  return {
    period, label: `${fmtDM(period.start)} – ${fmtDM(period.end)}`,
    spentQ, incomeQ, budgetLimit, hasBudget, pct, remaining: budgetLimit - spentQ,
    daysPassed, daysTotal, daysLeft: input.daysLeft,
    daysToPay: settings.paymentCycle === 'irregular' ? null : input.daysLeft,
    unpaidFixedCount: unpaid.length, unpaidFixedTotal: unpaid.reduce((s, f) => s + f.amount, 0),
    catRows, catAlerts: catRows.filter(r => r.pct >= 80).length,
  };
}

// ── Textos ─────────────────────────────────────────────────────

/** Contexto financiero para Gemini: todo del período de pago actual (según lo registrado). */
export function buildFinancialContextText(
  settings: Pick<UserSettings, 'userName' | 'monthlyIncome' | 'budgetLimit' | 'monthlySavingsGoal'>,
  snap: PeriodSnapshot,
  debt: DebtLoad,
): string {
  const dailyRate = snap.spentQ / Math.max(snap.daysPassed, 1);
  const projected = dailyRate * snap.daysTotal;
  const catSummary = snap.catRows
    .map(r => `${r.label}: gastado Q${r.spent.toFixed(0)} de Q${r.limit} (${r.pct}%)`)
    .join(', ');
  const debtLine = debt.totalQ > 0
    ? `Cuotas de deuda al mes: Q${debt.totalQ.toFixed(2)}${debt.ratioPct !== null ? ` (${debt.ratioPct.toFixed(1)}% del ingreso, base ${debt.incomeBasis === 'sources' ? 'fuentes' : 'declarado'})` : ' (sin ingreso para medir el ratio)'}`
    : 'Cuotas de deuda al mes: Q0 (sin visacuotas ni préstamos activos)';
  return `
Usuario: ${settings.userName}
Ingreso declarado: Q${settings.monthlyIncome}
Presupuesto del período: Q${snap.hasBudget ? snap.budgetLimit : settings.budgetLimit}
Período de pago actual: ${snap.label} (según lo registrado)
Gastado en este período en Q: ${snap.spentQ.toFixed(2)}
Ingresos registrados en este período: Q${snap.incomeQ.toFixed(2)}
Días transcurridos: ${snap.daysPassed} de ${snap.daysTotal}
${snap.daysToPay === null ? `Cobro: sin fecha fija (ingresos irregulares). Días que le quedan al período (mes calendario): ${snap.daysLeft}` : `Días hasta próximo pago: ${snap.daysToPay}`}
Tasa diaria de gasto: Q${dailyRate.toFixed(2)}/día
Proyección fin de período: Q${projected.toFixed(2)}
Gastos por categoría: ${catSummary || 'Sin presupuesto por categoría definido'}
Gastos fijos pendientes: ${snap.unpaidFixedCount} (total Q${snap.unpaidFixedTotal.toFixed(2)})
${debtLine}
Meta de ahorro mensual: Q${settings.monthlySavingsGoal}
  `.trim();
}

/** Cuerpo del resumen semanal: lo gastado en el PERÍODO de pago actual (no en el mes calendario). */
export function buildWeeklySummaryBodyText(snap: PeriodSnapshot, now: Date): string {
  const parts: string[] = [];
  parts.push(
    `Corte al ${fmtDM(now)}: llevas ${fmtQ(snap.spentQ)} gastados en tu período (${snap.label})` +
    (snap.hasBudget ? ` de ${fmtQ(snap.budgetLimit)} (${snap.pct}%), según lo registrado.` : ', según lo registrado.'),
  );
  if (snap.hasBudget) {
    parts.push(
      snap.remaining >= 0
        ? `Te quedan ${fmtQ(snap.remaining)}.`
        : `Superaste el presupuesto por ${fmtQ(Math.abs(snap.remaining))}.`,
    );
  }
  parts.push(snap.daysToPay === null
    ? `Al período le quedan ${snap.daysLeft} día(s).`
    : `Próximo ingreso en ${snap.daysToPay} día(s).`);
  if (snap.unpaidFixedCount) parts.push(`${snap.unpaidFixedCount} gasto(s) fijo(s) pendiente(s).`);
  if (snap.catAlerts) parts.push(`${snap.catAlerts} categoría(s) al 80% o más.`);
  return parts.join(' ');
}

/** Briefing del Dashboard sin IA: período de pago actual, según lo registrado. */
export function buildBriefingFallbackText(userName: string, snap: PeriodSnapshot, quote: string): string {
  const parts: string[] = [];
  parts.push(`Buenos días, ${userName}. Llevas el ${snap.pct}% de tu presupuesto de este período (${snap.label}), según lo registrado.`);
  if (snap.remaining > 0) parts.push(`Te quedan ${fmtQ(snap.remaining)} para ${snap.daysLeft} días.`);
  else parts.push(`Has superado tu presupuesto en ${fmtQ(Math.abs(snap.remaining))}.`);
  if (snap.unpaidFixedCount > 0) parts.push(`Tienes ${snap.unpaidFixedCount} gasto(s) fijo(s) pendiente(s) en este período.`);
  if (snap.catAlerts > 0) parts.push(`${snap.catAlerts} categoría(s) cerca del límite.`);
  parts.push(quote);
  return parts.join(' ');
}

/** Resumen del día (con las cifras de hoy). */
export function buildDailySummaryBody(snap: PeriodSnapshot, spentTodayQ: number): string {
  const parts: string[] = [];
  parts.push(spentTodayQ > 0 ? `Hoy registraste ${fmtQ(spentTodayQ)} en gastos.` : 'Hoy no registraste gastos.');
  if (snap.hasBudget) {
    parts.push(
      snap.remaining >= 0
        ? `En tu período llevas ${fmtQ(snap.spentQ)} de ${fmtQ(snap.budgetLimit)} (${snap.pct}%): te quedan ${fmtQ(snap.remaining)} para ${snap.daysLeft} día(s).`
        : `Superaste tu presupuesto del período por ${fmtQ(Math.abs(snap.remaining))}.`,
    );
  } else {
    parts.push(`En tu período llevas ${fmtQ(snap.spentQ)} gastados.`);
  }
  return parts.join(' ');
}

/** Resumen del día para fechas futuras (no se sabe aún cuánto se gastará): invita a cerrar el día. */
export const DAILY_SUMMARY_GENERIC_BODY =
  'Cierra tu día: registra lo que gastaste hoy y mira cuánto te queda en tu período.';
