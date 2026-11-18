process.env.TZ = 'America/Guatemala';
// Pruebas del presupuesto repartido por período (services/PeriodBudget.ts) y de sus consumidores puros:
// periodSnapshot (widget, fin de período, resumen), umbrales de aviso, foto del widget, plan de notificaciones,
// contexto de Gemini y estado de presupuestos del asistente. Sin dependencias:
//   npm run test:period-budget   →   sucrase-node scripts/period-budget.test.ts

import './_async-storage-mock';
import {
  budgetThresholdFigures, isSplitCycle, monthlyToWeekly, periodBudgetFactor, periodBudgetLimit, periodCategoryLimit,
  periodUnitName, weeklyToMonthly,
} from '../services/PeriodBudget';
import { baseMonthlyIncome } from '../services/IncomeSources';
import { buildBriefingFallbackText, buildDailySummaryBody, buildFinancialContextText, periodSnapshot } from '../services/NotificationTexts';
import { buildWidgetSnapshot } from '../services/WidgetSnapshot';
import type { WidgetSnapshotData } from '../services/WidgetSnapshot';
import { computeFinancialPeriod, daysUntilNextPay } from '../services/FinancialPeriod';
import { buildPlan } from '../services/NotificationPlan';
import type { PlanData } from '../services/NotificationPlan';
import { DEFAULT_NOTIF_PREFS } from '../services/NotifPrefs';
import { buildCompactContext } from '../services/assistant/GeminiContext';
import { QUERIES } from '../services/assistant/Queries';
import { ACTIONS } from '../services/assistant/Actions';
import { computeLocalMetrics, getLocalResponse } from '../services/LocalAdvisorEngine';
import type { AssistantContext } from '../services/assistant/types';
import type { CategoryBudget, IncomeSource, PaymentCycle, Transaction, UserSettings } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const near = (a: number, b: number, eps = 0.005) => Math.abs(a - b) < eps;
const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);

function tx(id: string, date: Date, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return { id, amount, description: id, category: 'other', date: date.toISOString(), type: 'expense', source: 'manual', currency: 'Q', ...extra };
}

// ─────────────────────────────────────────────────────────────
// 1. Factores por ciclo
// ─────────────────────────────────────────────────────────────
check('factor mensual = 1', periodBudgetFactor('monthly') === 1);
check('factor irregular = 1 (mes calendario)', periodBudgetFactor('irregular') === 1);
check('factor quincenal = 0.5', periodBudgetFactor('biweekly') === 0.5);
check('factor semanal = 12/52', near(periodBudgetFactor('weekly'), 12 / 52, 1e-12));
check('factor sin ciclo = 1', periodBudgetFactor(undefined) === 1);
check('isSplitCycle: solo quincenal y semanal', isSplitCycle('biweekly') && isSplitCycle('weekly') && !isSplitCycle('monthly') && !isSplitCycle('irregular') && !isSplitCycle(undefined));
check('periodUnitName', periodUnitName('biweekly') === 'quincena' && periodUnitName('weekly') === 'semana' && periodUnitName('monthly') === 'mes' && periodUnitName('irregular') === 'mes');
// La conversión semanal es la MISMA que usa el ingreso (IncomeSources.baseMonthlyIncome).
check('weeklyToMonthly y monthlyToWeekly son inversas', near(weeklyToMonthly(monthlyToWeekly(6000)), 6000, 1e-9));
{
  const src: IncomeSource = {
    id: 's1', name: 'Pago semanal', category: 'salary', amount: 1500, currency: 'Q', frequency: 'weekly', days: [5], isActive: true,
    role: 'base', createdAt: '2026-01-01T12:00:00.000Z',
  } as unknown as IncomeSource;
  check('ingreso semanal ×52/12 comparte la conversión', baseMonthlyIncome([src], [], 7.7) === Math.round(weeklyToMonthly(1500) * 100) / 100);
}

// ─────────────────────────────────────────────────────────────
// 2. Límite general del período
// ─────────────────────────────────────────────────────────────
const lim = (budgetLimit: number, paymentCycle: PaymentCycle) => periodBudgetLimit({ budgetLimit, paymentCycle });
check('semanal con 6,000 mensuales → Q1,384.62 por semana', lim(6000, 'weekly') === 1384.62, String(lim(6000, 'weekly')));
check('quincenal con 5,000 mensuales → 2,500 por quincena', lim(5000, 'biweekly') === 2500);
check('mensual sin cambio', lim(6000, 'monthly') === 6000);
check('irregular sin cambio (mes calendario)', lim(6000, 'irregular') === 6000);
check('mensual no redondea (usuario mensual no cambia)', lim(5920.555, 'monthly') === 5920.555 && lim(5920.555, 'irregular') === 5920.555);
check('sin presupuesto → 0 en todos los ciclos', (['monthly', 'biweekly', 'weekly', 'irregular'] as PaymentCycle[]).every(c => lim(0, c) === 0 && lim(-5, c) === 0 && lim(NaN, c) === 0));
check('quincenal con centavos: 5,921 → 2,960.50', lim(5921, 'biweekly') === 2960.5);

// ─────────────────────────────────────────────────────────────
// 3. Límites por categoría
// ─────────────────────────────────────────────────────────────
check('categoría semanal: 600 → 138.46', periodCategoryLimit(600, 'weekly') === 138.46, String(periodCategoryLimit(600, 'weekly')));
check('categoría quincenal: 800 → 400', periodCategoryLimit(800, 'biweekly') === 400);
check('categoría mensual/irregular sin cambio', periodCategoryLimit(800, 'monthly') === 800 && periodCategoryLimit(800, 'irregular') === 800);
check('categoría sin límite → 0', periodCategoryLimit(0, 'weekly') === 0 && periodCategoryLimit(-1, 'biweekly') === 0);
check('un límite positivo nunca se redondea a 0', periodCategoryLimit(0.01, 'weekly') === 0.01);

// ─────────────────────────────────────────────────────────────
// 4. periodSnapshot: widget, fin de período, resumen y briefing
// ─────────────────────────────────────────────────────────────
const NOW = d(2026, 11, 18, 10); // miércoles
const base = { userName: 'Ana', paymentDay: 27, paymentDays: [15, 30], monthlyIncome: 8000, exchangeRate: 7.7 };
const weeklySettings = { ...base, paymentCycle: 'weekly', paymentWeekday: 2, budgetLimit: 6000 } as unknown as UserSettings; // paga los martes
const biweeklySettings = { ...base, paymentCycle: 'biweekly', budgetLimit: 5000 } as unknown as UserSettings;
const monthlySettings = { ...base, paymentCycle: 'monthly', budgetLimit: 6000 } as unknown as UserSettings;
const irregularSettings = { ...base, paymentCycle: 'irregular', budgetLimit: 6000 } as unknown as UserSettings;

const periodOf = (s: UserSettings, now = NOW) => {
  const p = computeFinancialPeriod(s as never, now, null);
  return { start: p.start, end: p.end, nextStart: p.nextStart };
};
const budgets: CategoryBudget[] = [{ categoryId: 'food', limit: 600, currency: 'Q', alertAt: 80 }];

{
  // Semana del martes 17 al lunes 23 de nov: gasto igual al límite semanal.
  const wp = periodOf(weeklySettings);
  const spent = 1384.62;
  const txs = [tx('w1', d(2026, 11, 17), spent - 138.46, { category: 'other' }), tx('w2', d(2026, 11, 18), 138.46, { category: 'food' })];
  const snap = periodSnapshot({
    settings: weeklySettings, txs, categoryBudgets: budgets, fixed: [], now: NOW, period: wp, daysLeft: 5, labelOfCategory: id => id,
  });
  check('semanal: el gasto igual al límite semanal da 100 %, no 23 %', snap.pct === 100 && snap.budgetLimit === 1384.62 && snap.hasBudget, `${snap.pct} / ${snap.budgetLimit}`);
  check('semanal: restante 0', near(snap.remaining, 0));
  check('semanal: la categoría usa su límite semanal (138.46 → 100 %)', snap.catRows[0].limit === 138.46 && snap.catRows[0].pct === 100 && snap.catAlerts === 1, JSON.stringify(snap.catRows));
  const oldPct = Math.round((spent / 6000) * 100);
  check('semanal: antes marcaba 23 %', oldPct === 23);

  // El texto del resumen diario y del briefing usan el límite del período.
  const body = buildDailySummaryBody(snap, 0);
  check('semanal: el resumen diario dice «de Q1,384.62 (100%)»', body.indexOf('de Q1,384.62 (100%)') >= 0, body);
  const brief = buildBriefingFallbackText('Ana', snap, 'F');
  check('semanal: el briefing dice 100 %', brief.indexOf('Llevas el 100% de tu presupuesto') >= 0, brief);
  const ctxText = buildFinancialContextText({ userName: 'Ana', monthlyIncome: 8000, budgetLimit: 6000, monthlySavingsGoal: 0 }, snap, {
    totalQ: 0, ratioPct: null, incomeBasis: 'declared', items: [],
  } as never);
  check('semanal: el contexto de Gemini trae el presupuesto del período y el de la categoría repartido',
    ctxText.indexOf('Presupuesto del período: Q1384.62') >= 0 && ctxText.indexOf('de Q138.46 (100%)') >= 0, ctxText);

  // Quincenal: 5,000 → 2,500 por quincena; 2,500 gastados = 100 %.
  const bp = periodOf(biweeklySettings);
  const snapB = periodSnapshot({
    settings: biweeklySettings, txs: [tx('b1', d(2026, 11, 16), 2500)], categoryBudgets: [], fixed: [], now: NOW, period: bp, daysLeft: 12, labelOfCategory: id => id,
  });
  check('quincenal: 2,500 gastados de 2,500 = 100 %', snapB.budgetLimit === 2500 && snapB.pct === 100, `${snapB.pct} / ${snapB.budgetLimit}`);
}

// Regresión: mensual e irregular dan lo mismo que antes (límite guardado tal cual, porcentaje sobre el mensual).
for (const [name, s] of [['mensual', monthlySettings], ['irregular', irregularSettings]] as const) {
  const p = periodOf(s);
  const txs = [tx('m1', d(2026, 11, 12), 3000, { category: 'food' })];
  const snap = periodSnapshot({
    settings: s, txs, categoryBudgets: budgets, fixed: [], now: NOW, period: p, daysLeft: 9, labelOfCategory: id => id,
  });
  check(`${name}: límite = budgetLimit, pct sobre el mensual (50 %)`, snap.budgetLimit === 6000 && snap.pct === 50, `${snap.pct}/${snap.budgetLimit}`);
  check(`${name}: la categoría conserva su límite mensual`, snap.catRows[0].limit === 600 && snap.catRows[0].pct === 500, JSON.stringify(snap.catRows));
}

// ─────────────────────────────────────────────────────────────
// 5. Umbrales de aviso (50/80/100 %): mismas cifras que usa NotificationService.onTransactionAdded
// ─────────────────────────────────────────────────────────────
{
  const fw = (spent: number, cat?: { limit: number; spent: number }) =>
    budgetThresholdFigures({ settings: weeklySettings, spent, catMonthlyLimit: cat?.limit, catSpent: cat?.spent });
  check('umbral semanal: 692.31 gastados = 50 %', Math.round(fw(692.31).pct) === 50, String(fw(692.31).pct));
  check('umbral semanal: 1,384.62 gastados = 100 % (antes 23 %)', fw(1384.62).pct >= 100 && fw(1384.62).budgetLimit === 1384.62);
  check('umbral semanal: restante', near(fw(1000).remaining, 384.62));
  const c = fw(0, { limit: 600, spent: 138.46 });
  check('umbral por categoría semanal: 138.46 de 138.46 = 100 %', c.catLimit === 138.46 && c.catPct >= 100, JSON.stringify(c));
  const fb = budgetThresholdFigures({ settings: biweeklySettings, spent: 2000 });
  check('umbral quincenal: 2,000 de 2,500 = 80 %', fb.budgetLimit === 2500 && Math.round(fb.pct) === 80);
  // Mensual / irregular: idéntico al cálculo anterior (spent / budgetLimit).
  for (const s of [monthlySettings, irregularSettings]) {
    const f = budgetThresholdFigures({ settings: s, spent: 3000, catMonthlyLimit: 600, catSpent: 480 });
    check(`umbral ${s.paymentCycle}: sin cambio (50 % general, 80 % categoría)`,
      f.budgetLimit === 6000 && f.pct === 50 && f.remaining === 3000 && f.catLimit === 600 && f.catPct === 80, JSON.stringify(f));
  }
  const none = budgetThresholdFigures({ settings: { budgetLimit: 0, paymentCycle: 'weekly' }, spent: 500 });
  check('sin presupuesto: pct 0 y sin límite', none.pct === 0 && none.budgetLimit === 0 && none.catLimit === 0);
}

// ─────────────────────────────────────────────────────────────
// 6. Foto del widget
// ─────────────────────────────────────────────────────────────
function widgetData(s: UserSettings, txs: Transaction[]): WidgetSnapshotData {
  return {
    settings: s, transactions: txs, fixedExpenses: [], accounts: [], creditInstallments: [], incomeSources: [],
    daysLeft: daysUntilNextPay(s as never, NOW, null),
    periodAt: (x: Date) => computeFinancialPeriod(s as never, x, null) as never,
  };
}
{
  const wTx = [tx('w1', d(2026, 11, 18), 100)];
  const sw = buildWidgetSnapshot(widgetData(weeklySettings, wTx), NOW);
  check('widget semanal: disponible = 1,384.62 − 100', near(sw.availablePeriod, 1284.62), String(sw.availablePeriod));
  check('widget semanal: porcentaje sobre el límite semanal (7 %)', sw.budgetPct === 7, String(sw.budgetPct));
  const sw0 = buildWidgetSnapshot(widgetData({ ...weeklySettings, budgetLimit: 0 } as UserSettings, wTx), NOW);
  check('widget semanal sin presupuesto: ingreso mensual × 12/52', near(sw0.availablePeriod, 8000 * 12 / 52 - 100), String(sw0.availablePeriod));
  const sb0 = buildWidgetSnapshot(widgetData({ ...biweeklySettings, budgetLimit: 0 } as UserSettings, wTx), NOW);
  check('widget quincenal sin presupuesto: ingreso mensual × 0.5', near(sb0.availablePeriod, 4000 - 100), String(sb0.availablePeriod));
  const sm = buildWidgetSnapshot(widgetData(monthlySettings, wTx), NOW);
  check('widget mensual: sin cambio (6,000 − 100, 2 %)', near(sm.availablePeriod, 5900) && sm.budgetPct === 2, `${sm.availablePeriod}/${sm.budgetPct}`);
  const sm0 = buildWidgetSnapshot(widgetData({ ...monthlySettings, budgetLimit: 0 } as UserSettings, wTx), NOW);
  check('widget mensual sin presupuesto: ingreso declarado completo', near(sm0.availablePeriod, 7900), String(sm0.availablePeriod));
}

// ─────────────────────────────────────────────────────────────
// 7. Plan de notificaciones: «Mañana termina tu período» (quincenal) con el límite del período
// ─────────────────────────────────────────────────────────────
function planFor(s: UserSettings, txs: Transaction[]): PlanData {
  return {
    settings: s, transactions: txs, fixedExpenses: [], accounts: [], creditInstallments: [], categoryBudgets: [],
    daysLeft: daysUntilNextPay(s as never, NOW, null),
    periodAt: (x: Date) => computeFinancialPeriod(s as never, x, null) as never,
  } as unknown as PlanData;
}
{
  const bTx = [tx('b1', d(2026, 11, 16), 2500)];
  const planB = buildPlan(planFor(biweeklySettings, bTx), DEFAULT_NOTIF_PREFS, NOW);
  const endB = planB.filter(p => p.kind === 'period_end')[0];
  check('plan quincenal: fin de período dice 2,500 (100 %)', !!endB && endB.body.indexOf('de Q2,500.00 (100%)') >= 0, endB ? endB.body : 'sin aviso');
  const planM = buildPlan(planFor(monthlySettings, [tx('m1', d(2026, 11, 12), 3000)]), DEFAULT_NOTIF_PREFS, NOW);
  const endM = planM.filter(p => p.kind === 'period_end')[0];
  check('plan mensual: fin de período sin cambio (3,000 de 6,000, 50 %)', !!endM && endM.body.indexOf('de Q6,000.00 (50%)') >= 0, endM ? endM.body : 'sin aviso');
}

// ─────────────────────────────────────────────────────────────
// 8. Asistente: contexto de Gemini y estado de presupuestos
// ─────────────────────────────────────────────────────────────
function assistantCtx(cycle: PaymentCycle, txs: Transaction[], cbs: CategoryBudget[]): AssistantContext {
  const p = computeFinancialPeriod({ ...base, paymentCycle: cycle, paymentWeekday: 2 } as never, NOW, null);
  return {
    now: NOW,
    period: { start: p.start, end: p.end, prevStart: p.prevStart, prevEnd: p.prevEnd, label: p.label },
    settings: { currency: 'Q', customCategories: [], paymentCycle: cycle, paymentDay: 27, paymentDays: [15, 30], exchangeRate: 7.7, smsEnabled: false, paymentWeekday: 2 },
    transactions: txs, accounts: [], fixedExpenses: [], categoryBudgets: cbs, savingsGoals: [], merchantRules: [], smsOn: false,
  };
}
{
  const aTx = [tx('a1', d(2026, 11, 18), 1384.62)];
  const cw = buildCompactContext(assistantCtx('weekly', aTx, []), 'Ana', { budgetLimit: 6000 });
  check('Gemini semanal: Presupuesto del período Q 1,385 (1,384.62), usado 100 %', cw.indexOf('Presupuesto del período: Q 1,385, usado 100%.') >= 0, cw);
  const cm = buildCompactContext(assistantCtx('monthly', [tx('a2', d(2026, 11, 12), 1384.62)], []), 'Ana', { budgetLimit: 6000 });
  check('Gemini mensual: sin cambio (Q 6,000, 23 %)', cm.indexOf('Presupuesto del período: Q 6,000, usado 23%.') >= 0, cm);
  const catTx = [tx('a3', d(2026, 11, 18), 138.46, { category: 'food' })];
  const cc = buildCompactContext(assistantCtx('weekly', catTx, budgets), 'Ana');
  check('Gemini semanal: límite por categoría repartido', cc.indexOf('Comida Q 138 de Q 138 (100%') >= 0, cc);

  const run = (cycle: PaymentCycle, txs: Transaction[]) => QUERIES.budget_status.run({}, assistantCtx(cycle, txs, budgets));
  const rw = run('weekly', catTx);
  check('asistente semanal: estado de presupuestos 100 % contra 138.46', rw.rows.length === 1 && rw.rows[0].badge === '100%', JSON.stringify(rw.rows));
  const rm = run('monthly', [tx('a4', d(2026, 11, 12), 300, { category: 'food' })]);
  check('asistente mensual: sin cambio (300 de 600 = 50 %)', rm.rows[0].badge === '50%', JSON.stringify(rm.rows));

  // Fijar un límite: se pide MENSUAL y el aviso de «ya van» compara contra el límite del período.
  const spec = ACTIONS.set_category_budget;
  const wWarn = spec.warnings({ category: 'food', amount: 600 } as never, assistantCtx('weekly', catTx.map(t => ({ ...t, amount: 200 })), []));
  check('asistente semanal: avisa si el período ya superó el límite repartido', wWarn.some(w => w.indexOf('En el período ya van') >= 0), JSON.stringify(wWarn));
  const mWarn = spec.warnings({ category: 'food', amount: 600 } as never, assistantCtx('monthly', catTx.map(t => ({ ...t, amount: 200 })), []));
  check('asistente mensual: 200 de 600 no avisa', !mWarn.some(w => w.indexOf('En el período ya van') >= 0), JSON.stringify(mWarn));
  const rows = spec.summarize({ category: 'food', amount: 600 } as never, assistantCtx('weekly', [], []));
  check('asistente: la fila del monto dice «Límite mensual»', rows.some(r => r.label === 'Límite mensual'));
}

// ─────────────────────────────────────────────────────────────
// 9. Asesor local (LocalAdvisorEngine): usa el período real de hoy
// ─────────────────────────────────────────────────────────────
{
  const today = new Date();
  const adv = (cycle: PaymentCycle, spent: number, cat: string) => {
    const s = { ...base, paymentCycle: cycle, paymentWeekday: today.getDay(), budgetLimit: 6000, customCategories: [], currency: 'Q' } as unknown as UserSettings;
    const txs = [tx('adv1', today, spent, { category: cat })];
    return { s, txs, m: computeLocalMetrics(txs, s, [], [], [], [], budgets) };
  };
  const aw = adv('weekly', 1384.62, 'food');
  check('asesor semanal: presupuesto de la semana y 100 %', aw.m.budgetLimit === 1384.62 && aw.m.pct === 100, `${aw.m.pct}/${aw.m.budgetLimit}`);
  check('asesor semanal: restante 0 y tono crítico', near(aw.m.remaining, 0) && aw.m.tone === 'critical', `${aw.m.remaining}/${aw.m.tone}`);
  check('asesor semanal: la categoría usa su límite semanal', aw.m.budgetAlerts.length === 1 && aw.m.budgetAlerts[0].limit === 138.46, JSON.stringify(aw.m.budgetAlerts));
  const am = adv('monthly', 1384.62, 'food');
  check('asesor mensual: sin cambio (6,000 mensuales, 23 %)', am.m.budgetLimit === 6000 && am.m.pct === 23, `${am.m.pct}/${am.m.budgetLimit}`);
  check('asesor mensual: la categoría conserva su límite mensual (600)', am.m.budgetAlerts.length === 1 && am.m.budgetAlerts[0].limit === 600, JSON.stringify(am.m.budgetAlerts));
  const ai = adv('irregular', 1384.62, 'food');
  check('asesor irregular: sin cambio (6,000, 23 %)', ai.m.budgetLimit === 6000 && ai.m.pct === 23, `${ai.m.pct}/${ai.m.budgetLimit}`);
  const reply = getLocalResponse('cuanto llevo en comida', aw.txs, aw.s, [], [], [], [], budgets);
  check('asesor semanal: el límite de la categoría se muestra repartido', reply.indexOf('Tu límite ahí es Q138 en este período') >= 0, reply);
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
