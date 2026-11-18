// Plan de notificaciones programadas (módulo PURO: de ./storage solo `import type`, sin regex lookbehind,
// fechas locales). `buildPlan` arma, para los próximos 62 días, TODOS los avisos que se pueden programar de
// antemano; NotificationService solo compara ese plan contra lo ya programado (diffPlan) y aplica la diferencia.
//
// Reglas: interruptor por tipo, horas silenciosas (lo que cae adentro pasa a la hora en que terminan), tope de
// avisos por día (gana la prioridad más alta) y máximo 60 programadas (límite de la plataforma: iOS 64).
// Los ids son estables (`bm_p_<tipo>_<ref>_<aaaammdd>`): dos construcciones iguales dan el mismo plan.
import type {
  Account, CategoryBudget, CreditInstallment, FixedExpense, IncomeSource, Transaction, UserSettings,
} from './storage';
import type { NotifKind, NotifPrefs } from './NotifPrefs';
import { adjustForQuiet } from './NotifPrefs';
import {
  dueDateInPeriod, fixedCycleConfig, isPaidForPeriod, nextPeriod, periodFor,
} from './FixedCycle';
import { normalizeWeekday } from './FinancialPeriod';
import { cutDate, dayNum, dueDateFor, effectiveCutoffDay, lastClosedCut } from './CardCycle';
import { statementFor } from './CardStatement';
import { cardOfInstallment, chargedCount, cutForInstallment } from './InstallmentSchedule';
import {
  DAILY_SUMMARY_GENERIC_BODY, buildDailySummaryBody, buildWeeklySummaryBodyText, fmtDM, fmtMoney, periodSnapshot,
  spentQOf, txsInPeriod,
} from './NotificationTexts';
import type { PeriodRange } from './NotificationTexts';

export const HORIZON_DAYS = 62;
export const MAX_PLANNED = 60;
const DAILY_DAYS = 7;
const WEEKLY_COUNT = 2;
const EPS = 0.005;
const MIN_LEAD_MS = 60 * 1000;

export const PLAN_ID_PREFIX = 'bm_p_';

export interface PlannedNotif {
  id: string;
  fireAt: Date;
  title: string;
  body: string;
  /** 1 (resumen diario) a 5 (pago de hoy): decide qué avisos sobreviven al tope diario. */
  priority: number;
  kind: NotifKind;
  ref: string;
}

export interface PlanData {
  settings: Pick<UserSettings, 'userName' | 'budgetLimit' | 'monthlyIncome' | 'exchangeRate' | 'paymentCycle' | 'paymentDay' | 'paymentDays'> & { paymentWeekday?: number };
  transactions: Transaction[];
  fixedExpenses: FixedExpense[];
  accounts: Account[];
  creditInstallments: CreditInstallment[];
  incomeSources?: IncomeSource[];
  categoryBudgets: CategoryBudget[];
  /** Días hasta el próximo pago (lo calcula el llamador con el ciclo y las anclas reales). */
  daysLeft: number;
  /** Período de pago REAL que contiene a esa fecha (en la app: getCurrentFinancialPeriod con el resolvedor). */
  periodAt: (d: Date) => PeriodRange & { nextStart: Date };
  labelOfCategory?: (id: string) => string;
}

// ── Utilidades de fecha ────────────────────────────────────────

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function atHour(d: Date, hour: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), hour, 0, 0, 0);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0, 0);
}

function ymdNum(d: Date): string {
  return `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}`;
}

function refSafe(s: string): string {
  return s.replace(/[^A-Za-z0-9-]/g, '-');
}

function validDay(n: number | undefined): number | null {
  return typeof n === 'number' && isFinite(n) && n >= 1 && n <= 31 ? Math.floor(n) : null;
}

/** 'Q120.00', 'Q120.00 y $15.00'. */
function amountsText(pair: { Q: number; USD: number }): string {
  const out: string[] = [];
  if (pair.Q > EPS) out.push(fmtMoney(pair.Q, 'Q'));
  if (pair.USD > EPS) out.push(fmtMoney(pair.USD, 'USD'));
  return out.join(' y ');
}

/**
 * Día de la semana (0=dom..6=sáb) en que llega el resumen semanal: el domingo, salvo con ciclo semanal, donde
 * es el último día de su semana (el día anterior al de pago). Ese día reemplaza al resumen diario.
 */
export function weeklySummaryWeekday(settings: Pick<PlanData['settings'], 'paymentCycle' | 'paymentWeekday'>): number {
  if (settings.paymentCycle !== 'weekly') return 0;
  return (normalizeWeekday(settings.paymentWeekday) + 6) % 7;
}

// ── Plan ───────────────────────────────────────────────────────

export function buildPlan(data: PlanData, prefs: NotifPrefs, now: Date): PlannedNotif[] {
  const out = new Map<string, PlannedNotif>();
  const horizon = addDays(now, HORIZON_DAYS);
  const horizonN = dayNum(horizon);
  const hour = prefs.reminderHour;
  const summaryHour = prefs.dailySummary.hour;
  const cycle = fixedCycleConfig(data.settings);
  const labelOf = data.labelOfCategory ?? ((id: string) => id);

  const push = (kind: NotifKind, ref: string, wanted: Date, title: string, body: string, priority: number): void => {
    if (!prefs.kinds[kind]) return;
    const fireAt = adjustForQuiet(wanted, prefs);
    if (fireAt.getTime() - now.getTime() <= MIN_LEAD_MS) return;
    if (dayNum(fireAt) > horizonN) return;
    const id = `${PLAN_ID_PREFIX}${kind}_${refSafe(ref)}_${ymdNum(fireAt)}`;
    if (out.has(id)) return;
    out.set(id, { id, fireAt, title, body, priority, kind, ref });
  };

  // Gastos fijos: 3 días antes del vencimiento (de este período y del siguiente; el del período ya pagado no).
  for (const f of data.fixedExpenses) {
    if (!f.isActive) continue;
    let p = periodFor(cycle, now);
    for (let i = 0; i < 4; i++) {
      if (dayNum(p.start) > horizonN) break;
      const due = dueDateInPeriod(f.dayOfMonth, p, cycle);
      const paid = i === 0 && isPaidForPeriod(f, cycle, now);
      if (!paid) {
        push(
          'fixed', f.id, atHour(addDays(due, -3), prefs.reminderHour),
          'Gasto fijo próximo',
          `${f.name} vence el ${fmtDM(due)} (en 3 días) — ${fmtMoney(f.amount, f.currency)}. Asegúrate de tener el dinero disponible.`,
          4,
        );
      }
      p = nextPeriod(cycle, p);
    }
  }

  // Tarjetas: pago (5 días, 1 día y el mismo día) y corte de mañana.
  for (const card of data.accounts) {
    if (!card.isActive || card.type !== 'credit') continue;
    const closed = lastClosedCut(card, now);
    if (validDay(card.paymentDueDay)) {
      for (let k = 0; k < 3; k++) {
        const cut = k === 0 ? closed : cutDate(effectiveCutoffDay(card), closed.getFullYear(), closed.getMonth() + k);
        const st = statementFor(card, data.transactions, data.creditInstallments, now, cut);
        if (!st.due) continue;
        if (st.remaining.Q <= EPS && st.remaining.USD <= EPS) continue;
        const amounts = `${amountsText(st.remaining)}${st.isEstimated ? ' (estimado)' : ''}`;
        const when = fmtDM(st.due);
        const refBase = `${card.id}-${st.cutKey}`;
        push('card_due', `${refBase}-5`, atHour(addDays(st.due, -5), hour),
          `Pago de ${card.name} en 5 días`, `Debes pagar ${amounts} a más tardar el ${when}.`, 4);
        push('card_due', `${refBase}-1`, atHour(addDays(st.due, -1), hour),
          `Pago de ${card.name} mañana`, `Mañana vence el pago de ${amounts} (${when}).`, 5);
        push('card_due', `${refBase}-0`, atHour(st.due, hour),
          `Hoy vence el pago de ${card.name}`, `Paga hoy ${amounts} para no generar intereses.`, 5);
      }
    }
    if (validDay(card.cutoffDay)) {
      for (let k = -1; k <= 3; k++) {
        const cut = cutDate(effectiveCutoffDay(card), now.getFullYear(), now.getMonth() + k);
        const due = dueDateFor(cut, card.paymentDueDay);
        push('card_cut', `${card.id}-${ymdNum(cut)}`, atHour(addDays(cut, -1), hour),
          `Mañana corta ${card.name}`,
          `Lo que compres después del corte entra al siguiente estado de cuenta${due ? ` (se paga el ${fmtDM(due)})` : ''}.`,
          3);
      }
    }
  }

  // Visacuotas y préstamos.
  for (const inst of data.creditInstallments) {
    if (!inst.isActive) continue;
    const card = cardOfInstallment(inst, data.accounts);
    const total = Math.min(Math.max(0, Math.floor(inst.totalInstallments) || 0), 1200);
    if (total < 1) continue;
    const money = fmtMoney(inst.monthlyPayment, inst.currency);

    const last = cutForInstallment(inst, card, total);
    if (last) {
      push('installment_last', inst.id, atHour(addDays(last, -1), hour),
        'Última cuota',
        card
          ? `Mañana se carga la última cuota (${total}/${total}) de "${inst.name}" en ${card.name}: ${money}. Después se libera ese pago mensual.`
          : `Mañana vence la última cuota (${total}/${total}) de "${inst.name}": ${money}. Después se libera ese pago mensual.`,
        3);
    }

    // Préstamo (sin tarjeta) con día de pago propio: aviso 2 días antes y el mismo día.
    if (!card && validDay(inst.dueDay)) {
      for (let n = Math.max(1, chargedCount(inst, undefined, now)); n <= total; n++) {
        const due = cutForInstallment(inst, undefined, n);
        if (!due) break;
        if (dayNum(due) > horizonN) break;
        const ref = `${inst.id}-${n}`;
        push('debt_due', `${ref}-2`, atHour(addDays(due, -2), hour),
          `Deuda por vencer: ${inst.name}`, `La cuota ${n}/${total} (${money}) vence el ${fmtDM(due)}.`, 4);
        push('debt_due', `${ref}-0`, atHour(due, hour),
          `Hoy vence: ${inst.name}`, `Cuota ${n}/${total}: ${money}. Págala hoy para no atrasarte.`, 5);
      }
    }
  }

  // Resumen del período (solo la parte del período vigente trae cifras) y fin de período.
  const snapNow = periodSnapshot({
    settings: data.settings, txs: data.transactions, categoryBudgets: data.categoryBudgets,
    fixed: data.fixedExpenses, now, period: data.periodAt(now), daysLeft: data.daysLeft, labelOfCategory: labelOf,
  });

  if (data.settings.paymentCycle !== 'weekly') {
    let p = data.periodAt(now);
    for (let i = 0; i < 4; i++) {
      if (dayNum(p.start) > horizonN) break;
      const endDay = new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate(), 12, 0, 0, 0);
      const current = dayNum(p.start) <= dayNum(now);
      push('period_end', `${p.start.getFullYear()}${pad2(p.start.getMonth() + 1)}${pad2(p.start.getDate())}`,
        atHour(addDays(endDay, -1), hour),
        'Mañana termina tu período',
        current && snapNow.hasBudget
          ? `Tu período cierra el ${fmtDM(endDay)}. Llevas ${fmtMoneyQ(snapNow.spentQ)} de ${fmtMoneyQ(snapNow.budgetLimit)} (${snapNow.pct}%), según lo registrado.`
          : `Tu período cierra el ${fmtDM(endDay)}. Registra lo que falte y revisa cómo te fue.`,
        3);
      p = data.periodAt(addDays(p.nextStart, 0));
    }
  }

  // Resumen semanal (domingo, o el último día de la semana de quien cobra semanal) y diario. Ese día el
  // semanal reemplaza al diario.
  const weeklyOn = prefs.kinds.weekly;
  const summaryWeekday = weeklySummaryWeekday(data.settings);
  const summaryDays: string[] = [];
  let weeklyCount = 0;
  for (let i = 0; i <= HORIZON_DAYS && weeklyCount < WEEKLY_COUNT; i++) {
    const d = addDays(now, i);
    if (d.getDay() !== summaryWeekday) continue;
    const fire = atHour(d, summaryHour);
    if (fire.getTime() - now.getTime() <= MIN_LEAD_MS) continue;
    weeklyCount++;
    summaryDays.push(ymdNum(d));
    push('weekly', 'w', fire, 'Resumen Semanal — BudgetMaster',
      weeklyCount === 1
        ? buildWeeklySummaryBodyText(snapNow, now)
        : 'Resumen de la semana: revisa tu período y registra lo que haya quedado pendiente.',
      2);
  }
  if (prefs.dailySummary.enabled) {
    for (let i = 0; i < DAILY_DAYS; i++) {
      const d = addDays(now, i);
      if (weeklyOn && d.getDay() === summaryWeekday && summaryDays.indexOf(ymdNum(d)) >= 0) continue;
      const body = i === 0
        ? buildDailySummaryBody(snapNow, spentQOf(txsInPeriod(data.transactions, d, d)))
        : DAILY_SUMMARY_GENERIC_BODY;
      push('daily', 'd', atHour(d, summaryHour), 'Resumen del día', body, 1);
    }
  }

  return applyCaps(Array.from(out.values()), prefs.maxPerDay);
}

function fmtMoneyQ(n: number): string {
  return fmtMoney(n, 'Q');
}

/** Tope por día (gana la prioridad más alta, luego la hora) y máximo global (los más próximos). */
export function applyCaps(list: PlannedNotif[], maxPerDay: number, maxTotal: number = MAX_PLANNED): PlannedNotif[] {
  const byDay = new Map<string, PlannedNotif[]>();
  for (const n of list) {
    const k = ymdNum(n.fireAt);
    const arr = byDay.get(k);
    if (arr) arr.push(n); else byDay.set(k, [n]);
  }
  const kept: PlannedNotif[] = [];
  byDay.forEach(arr => {
    arr.sort((a, b) => b.priority - a.priority || a.fireAt.getTime() - b.fireAt.getTime() || (a.id < b.id ? -1 : 1));
    for (const n of arr.slice(0, Math.max(1, maxPerDay))) kept.push(n);
  });
  kept.sort((a, b) => a.fireAt.getTime() - b.fireAt.getTime() || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  return kept.slice(0, maxTotal);
}

// ── Diff contra lo ya programado ───────────────────────────────

/** Firma del contenido de un aviso: si cambia (hora, título o cuerpo) hay que reprogramarlo. */
export function sigOf(p: Pick<PlannedNotif, 'fireAt' | 'title' | 'body'>): string {
  return `${p.fireAt.getTime()}|${p.title}|${p.body}`;
}

/** Qué agregar y qué cancelar para que lo programado coincida con el plan (idempotente: igual plan, nada que hacer). */
export function diffPlan(
  planned: PlannedNotif[],
  existing: Array<{ id: string; sig?: string }>,
): { add: PlannedNotif[]; cancel: string[] } {
  const want = new Map<string, string>();
  for (const p of planned) want.set(p.id, sigOf(p));
  const have = new Map<string, string | undefined>();
  const cancel: string[] = [];
  for (const e of existing) {
    if (e.id.indexOf(PLAN_ID_PREFIX) !== 0) continue;
    if (!want.has(e.id) || want.get(e.id) !== e.sig) cancel.push(e.id);
    else have.set(e.id, e.sig);
  }
  const add = planned.filter(p => !have.has(p.id));
  return { add, cancel };
}

/** Cantidad de avisos planeados para el día `day` (a partir del sufijo aaaammdd de sus ids). */
export function plannedCountOn(ids: string[], day: Date): number {
  const suffix = `_${ymdNum(day)}`;
  return ids.filter(id => id.indexOf(PLAN_ID_PREFIX) === 0 && id.length >= suffix.length && id.slice(id.length - suffix.length) === suffix).length;
}
