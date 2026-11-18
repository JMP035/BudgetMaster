process.env.TZ = 'America/Guatemala';
// Pruebas del plan de notificaciones (services/NotificationPlan.ts, NotifPrefs.ts, NotificationTexts.ts).
//   npm run test:notification-plan   →   sucrase-node scripts/notification-plan.test.ts

import {
  HORIZON_DAYS, MAX_PLANNED, PLAN_ID_PREFIX, applyCaps, buildPlan, diffPlan, plannedCountOn, sigOf,
} from '../services/NotificationPlan';
import type { PlanData, PlannedNotif } from '../services/NotificationPlan';
import {
  DEFAULT_NOTIF_PREFS, NOTIF_KINDS, adjustForQuiet, isQuietHour, sanitizeNotifPrefs,
} from '../services/NotifPrefs';
import type { NotifPrefs } from '../services/NotifPrefs';
import {
  buildBriefingFallbackText, buildFinancialContextText, buildWeeklySummaryBodyText, fmtQ, periodSnapshot,
} from '../services/NotificationTexts';
import { computeFinancialPeriod } from '../services/FinancialPeriod';
import type { Account, CategoryBudget, CreditInstallment, FixedExpense, Transaction, UserSettings } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);
const ymd = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
const hm = (x: Date) => `${ymd(x)} ${String(x.getHours()).padStart(2, '0')}:${String(x.getMinutes()).padStart(2, '0')}`;

const settings = {
  userName: 'Ana', paymentCycle: 'monthly', paymentDay: 27, paymentDays: [15, 30], budgetLimit: 6000, monthlyIncome: 8000, exchangeRate: 7.7,
} as unknown as UserSettings;

function acct(extra: Partial<Account>): Account {
  return {
    id: 'a', name: 'Cuenta', type: 'bank', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'x',
    isActive: true, createdAt: '2026-01-01T12:00:00.000Z', ...extra,
  };
}
const visa = acct({ id: 'c1', name: 'Visa', type: 'credit', cutoffDay: 9, paymentDueDay: 2 });

function expense(id: string, amount: number, date: Date, extra: Partial<Transaction> = {}): Transaction {
  return { id, amount, description: id, category: 'food', date: date.toISOString(), type: 'expense', source: 'manual', currency: 'Q', ...extra };
}

function fixed(id: string, name: string, day: number, extra: Partial<FixedExpense> = {}): FixedExpense {
  return { id, name, amount: 300, currency: 'Q', category: 'bills', dayOfMonth: day, isPaid: false, autoRecord: false, isActive: true, ...extra };
}

const NOW = d(2026, 11, 18, 10, 0);   // miércoles

// Período de pago real: 27-oct..26-nov. Los movimientos del 28-oct y del 5-nov son DEL PERÍODO (el mes calendario solo vería el de noviembre).
const txs: Transaction[] = [
  expense('k1', 1500, d(2026, 10, 20), { accountId: 'c1', category: 'shopping' }),   // antes del período, pero dentro del estado de la tarjeta
  expense('f1', 100, d(2026, 10, 28)),                           // período (octubre)
  expense('k2', 700, d(2026, 11, 5), { accountId: 'c1', category: 'shopping' }),
  expense('f2', 50, d(2026, 11, 5)),
  expense('k3', 300, d(2026, 11, 12), { accountId: 'c1', category: 'shopping' }),
  expense('tr', 999, d(2026, 11, 6), { type: 'transfer' }),     // neutro: no cuenta
  expense('tp', 888, d(2026, 11, 7), { transferPairId: 'p1' }), // neutro: no cuenta
];

const catBudgets: CategoryBudget[] = [{ categoryId: 'food', limit: 200, currency: 'Q', alertAt: 80 }];

function dataOf(over: Partial<PlanData> = {}): PlanData {
  return {
    settings,
    transactions: txs,
    fixedExpenses: [fixed('luz', 'Luz', 22)],
    accounts: [visa],
    creditInstallments: [],
    categoryBudgets: catBudgets,
    daysLeft: 9,
    periodAt: (x: Date) => computeFinancialPeriod(settings, x, null) as never,
    ...over,
  };
}

function prefsOf(over: Partial<NotifPrefs> = {}): NotifPrefs {
  return { ...DEFAULT_NOTIF_PREFS, kinds: { ...DEFAULT_NOTIF_PREFS.kinds }, dailySummary: { ...DEFAULT_NOTIF_PREFS.dailySummary }, ...over };
}

const only = (plan: PlannedNotif[], kind: string) => plan.filter(p => p.kind === kind);

// ═════════ Preferencias ═════════
const def = sanitizeNotifPrefs(undefined);
check('prefs: defaults', def.reminderHour === 8 && def.dailySummary.hour === 20 && def.dailySummary.enabled && def.quietStart === 22 && def.quietEnd === 7 && def.maxPerDay === 4);
check('prefs: todos los tipos en true por defecto', NOTIF_KINDS.every(k => def.kinds[k] === true) && NOTIF_KINDS.length === 12);
const junk = sanitizeNotifPrefs({ kinds: { fixed: false, weird: true, daily: 'si' }, reminderHour: 99, quietStart: -3, maxPerDay: 'x', dailySummary: { enabled: false, hour: 21.4 } });
check('prefs: saneo de datos viejos o corruptos', junk.kinds.fixed === false && junk.kinds.daily === true && junk.reminderHour === 8 && junk.quietStart === 22 && junk.maxPerDay === 4 && junk.dailySummary.enabled === false && junk.dailySummary.hour === 21);
check('prefs: maxPerDay acotado', sanitizeNotifPrefs({ maxPerDay: 99 }).maxPerDay === 10 && sanitizeNotifPrefs({ maxPerDay: 0 }).maxPerDay === 1);
check('prefs: no comparte referencias con el default', sanitizeNotifPrefs(undefined).kinds !== DEF_KINDS());
function DEF_KINDS() { return DEFAULT_NOTIF_PREFS.kinds; }

// ═════════ Horas silenciosas (22:00-07:00) ═════════
const q = { quietStart: 22, quietEnd: 7 };
check('silencio: 22:00 y 23:30 y 03:00 y 06:59 son silenciosas', [22, 23, 0, 3, 6].every(h => isQuietHour(h, q)));
check('silencio: 07:00, 12:00 y 21:00 no', [7, 12, 21].every(h => !isQuietHour(h, q)));
check('silencio: 23:30 pasa al día siguiente 07:00', hm(adjustForQuiet(d(2026, 11, 18, 23, 30), q)) === '2026-11-19 07:00');
check('silencio: 03:00 pasa al mismo día 07:00', hm(adjustForQuiet(d(2026, 11, 18, 3, 0), q)) === '2026-11-18 07:00');
check('silencio: fuera de horas no cambia', hm(adjustForQuiet(d(2026, 11, 18, 12, 0), q)) === '2026-11-18 12:00');
check('silencio: sin rango (inicio = fin) no hay horas silenciosas', !isQuietHour(3, { quietStart: 5, quietEnd: 5 }));
check('silencio: rango que no cruza medianoche', isQuietHour(2, { quietStart: 1, quietEnd: 6 }) && !isQuietHour(7, { quietStart: 1, quietEnd: 6 }) && hm(adjustForQuiet(d(2026, 11, 18, 2, 0), { quietStart: 1, quietEnd: 6 })) === '2026-11-18 06:00');
const lateHour = buildPlan(dataOf(), prefsOf({ reminderHour: 23 }), NOW);
const lateFixed = only(lateHour, 'fixed');
check('silencio: un recordatorio a las 23:00 se mueve a las 07:00', lateFixed.length > 0 && lateFixed.every(p => p.fireAt.getHours() === 7), lateFixed.map(p => hm(p.fireAt)).join(','));
check('silencio: ningún aviso del plan cae en horas silenciosas',
  lateHour.every(p => !isQuietHour(p.fireAt.getHours(), q)) && buildPlan(dataOf(), prefsOf({ dailySummary: { enabled: true, hour: 2 } }), NOW).every(p => !isQuietHour(p.fireAt.getHours(), q)));

// ═════════ Gasto fijo: 3 ocurrencias (3 días antes, 08:00) ═════════
const plan = buildPlan(dataOf(), prefsOf(), NOW);
const luz = only(plan, 'fixed').map(p => hm(p.fireAt));
check('fijo: 3 ocurrencias en 62 días', luz.length === 3, luz.join(' | '));
check('fijo: 3 días antes del 22 a las 08:00', luz[0] === '2026-11-19 08:00' && luz[1] === '2026-12-19 08:00' && luz[2] === '2027-01-19 08:00', luz.join(' | '));
check('fijo: ids con prefijo y fecha', only(plan, 'fixed')[0].id === `${PLAN_ID_PREFIX}fixed_luz_20261119`, only(plan, 'fixed')[0].id);
check('fijo: el texto trae vencimiento y monto', only(plan, 'fixed')[0].body.indexOf('vence el 22/11') >= 0 && only(plan, 'fixed')[0].body.indexOf('Q300.00') >= 0, only(plan, 'fixed')[0].body);
const paid = buildPlan(dataOf({ fixedExpenses: [fixed('luz', 'Luz', 22, { isPaid: true, paidCycleKey: '2026-10-27' })] }), prefsOf(), NOW);
check('fijo: ya pagado en el período -> sin el de este período', only(paid, 'fixed').length === 2 && hm(only(paid, 'fixed')[0].fireAt) === '2026-12-19 08:00');
const inactive = buildPlan(dataOf({ fixedExpenses: [fixed('luz', 'Luz', 22, { isActive: false })] }), prefsOf(), NOW);
check('fijo: inactivo no avisa', only(inactive, 'fixed').length === 0);
const hour9 = buildPlan(dataOf(), prefsOf({ reminderHour: 9 }), NOW);
check('fijo: respeta reminderHour', only(hour9, 'fixed').every(p => p.fireAt.getHours() === 9));
const passed = buildPlan(dataOf({ fixedExpenses: [fixed('luz', 'Luz', 20)] }), prefsOf(), d(2026, 11, 17, 9, 0));
check('fijo: un recordatorio de hoy cuya hora ya pasó no se programa', hm(only(passed, 'fixed')[0].fireAt) === '2026-12-17 08:00', hm(only(passed, 'fixed')[0].fireAt));

// ═════════ Tarjeta: -5 / -1 / 0 con corte 9 y pago 2 (2 de diciembre) ═════════
const dues = only(plan, 'card_due').filter(p => p.ref.indexOf('c1-2026-11-09') === 0).map(p => hm(p.fireAt));
check('tarjeta: -5, -1 y 0 del pago del 2-dic', dues.length === 3 && dues[0] === '2026-11-27 08:00' && dues[1] === '2026-12-01 08:00' && dues[2] === '2026-12-02 08:00', dues.join(' | '));
const dueTexts = only(plan, 'card_due').filter(p => p.ref.indexOf('c1-2026-11-09') === 0);
check('tarjeta: texto con monto del estado (2200, estimado) y fecha', dueTexts[0].body.indexOf('Q2,200.00') >= 0 && dueTexts[0].body.indexOf('(estimado)') >= 0 && dueTexts[0].body.indexOf('02/12') >= 0, dueTexts[0].body);
check('tarjeta: el del mismo día tiene la prioridad más alta', dueTexts[2].priority === 5 && dueTexts[0].priority === 4);
const nextDue = only(plan, 'card_due').filter(p => p.ref.indexOf('c1-2026-12-09') === 0).map(p => hm(p.fireAt));
check('tarjeta: el estado que viene (corte 9-dic, pago 2-ene) también se planea', nextDue.length === 3 && nextDue[2] === '2027-01-02 08:00', nextDue.join(' | '));
const noRem = buildPlan(dataOf({ transactions: [] }), prefsOf(), NOW);
check('tarjeta: sin saldo por pagar no hay recordatorio de pago', only(noRem, 'card_due').length === 0);
const cuts = only(plan, 'card_cut').map(p => hm(p.fireAt));
check('corte: mañana corta (8-dic y 8-ene a las 08:00)', cuts[0] === '2026-12-08 08:00' && cuts[1] === '2027-01-08 08:00', cuts.join(' | '));
check('corte: no hay corte planeado ya pasado', cuts.every(c => c > '2026-11-18'));

// ═════════ Visacuota final, deuda con dueDay ═════════
const instCard: CreditInstallment = {
  id: 'i1', accountId: 'c1', name: 'Laptop', totalAmount: 300, monthlyPayment: 100, totalInstallments: 3, paidInstallments: 2,
  startDate: '2026-09-10T12:00:00.000Z', currency: 'Q', category: 'shopping', isActive: true, trackSince: '2026-09-10T12:00:00.000Z', paidOffset: 0,
};
const loan: CreditInstallment = {
  id: 'l1', accountId: '', name: 'Préstamo', totalAmount: 600, monthlyPayment: 100, totalInstallments: 6, paidInstallments: 2,
  startDate: '2026-10-15T12:00:00.000Z', currency: 'Q', category: 'debt', isActive: true, trackSince: '2026-10-15T12:00:00.000Z', paidOffset: 0, dueDay: 15,
};
const planI = buildPlan(dataOf({ creditInstallments: [instCard, loan] }), prefsOf(), NOW);
const last = only(planI, 'installment_last').map(p => `${hm(p.fireAt)} ${p.ref}`);
check('visacuota: aviso de la última cuota el día antes (corte 9-dic -> 8-dic)', last.length >= 1 && last[0] === '2026-12-08 08:00 i1', last.join(' | '));
check('visacuota: el texto dice última cuota 3/3', only(planI, 'installment_last')[0].body.indexOf('3/3') >= 0);
const debt = only(planI, 'debt_due').map(p => hm(p.fireAt));
check('deuda con dueDay: 2 días antes y el mismo día (13 y 15 de dic)', debt.indexOf('2026-12-13 08:00') >= 0 && debt.indexOf('2026-12-15 08:00') >= 0, debt.join(' | '));
check('deuda: la visacuota de tarjeta no es "deuda" sin tarjeta', only(planI, 'debt_due').every(p => p.ref.indexOf('l1') === 0));
check('deuda sin dueDay no avisa', only(buildPlan(dataOf({ creditInstallments: [{ ...loan, dueDay: undefined }] }), prefsOf(), NOW), 'debt_due').length === 0);

// ═════════ Fin de período (-1 día) ═════════
const pend = only(plan, 'period_end').map(p => hm(p.fireAt));
check('fin de período: 25-nov y 25-dic a las 08:00', pend[0] === '2026-11-25 08:00' && pend[1] === '2026-12-25 08:00', pend.join(' | '));
check('fin de período: el actual trae cifras del período real', only(plan, 'period_end')[0].body.indexOf('26/11') >= 0 && only(plan, 'period_end')[0].body.indexOf('según lo registrado') >= 0, only(plan, 'period_end')[0].body);
const weeklyCycle = buildPlan(dataOf({ settings: { ...settings, paymentCycle: 'weekly' } as UserSettings }), prefsOf(), NOW);
check('fin de período: ciclo semanal no lo usa', only(weeklyCycle, 'period_end').length === 0);

// ═════════ Resumen diario y semanal con el PERÍODO real (no el mes calendario) ═════════
const weekly = only(plan, 'weekly');
check('semanal: 2 domingos (22 y 29 nov) a las 20:00', weekly.length === 2 && hm(weekly[0].fireAt) === '2026-11-22 20:00' && hm(weekly[1].fireAt) === '2026-11-29 20:00', weekly.map(p => hm(p.fireAt)).join(','));
// Período 27-oct..26-nov: f1 100 + k2 700 + f2 50 + k3 300 = 1150 (k1 del 20-oct, transferencias y neutros no cuentan)
check('semanal: gasto del período (1150), no del mes calendario', weekly[0].body.indexOf('Q1,150.00') >= 0, weekly[0].body);
check('semanal: nombra el período real 27/10 – 26/11', weekly[0].body.indexOf('27/10 – 26/11') >= 0, weekly[0].body);
check('semanal: aclara «según lo registrado»', weekly[0].body.indexOf('según lo registrado') >= 0);
check('semanal: el calendario de noviembre habría dado 1150 - 100 = 1050 (no aparece)', weekly[0].body.indexOf('Q1,050.00') < 0);
check('semanal: nunca cuenta neutros (999 ni 888)', weekly[0].body.indexOf('999') < 0 && weekly[0].body.indexOf('888') < 0);
const daily = only(plan, 'daily');
check('diario: 6 días (7 menos el domingo del semanal), a las 20:00', daily.length === 6 && daily.every(p => p.fireAt.getHours() === 20), String(daily.length));
check('diario: hoy lleva cifras; los demás invitan a cerrar el día', daily[0].body.indexOf('Hoy no registraste gastos') >= 0 && daily[0].body.indexOf('1,150.00') >= 0 && daily[1].body.indexOf('Cierra tu día') >= 0, daily[0].body);
check('diario: no hay uno el domingo (el semanal lo reemplaza)', daily.every(p => p.fireAt.getDay() !== 0));
const withToday = buildPlan(dataOf({ transactions: [...txs, expense('hoy', 85, NOW)] }), prefsOf(), NOW);
check('diario: hoy suma lo gastado hoy', only(withToday, 'daily')[0].body.indexOf('Hoy registraste Q85.00') >= 0, only(withToday, 'daily')[0].body);
const noDaily = buildPlan(dataOf(), prefsOf({ dailySummary: { enabled: false, hour: 20 } }), NOW);
check('diario desactivable', only(noDaily, 'daily').length === 0 && only(noDaily, 'weekly').length === 2);
const hr21 = buildPlan(dataOf(), prefsOf({ dailySummary: { enabled: true, hour: 21 } }), NOW);
check('diario: respeta la hora configurada', only(hr21, 'daily').every(p => p.fireAt.getHours() === 21));

// Funciones puras de texto: período real
const snap = periodSnapshot({
  settings, txs, categoryBudgets: catBudgets, fixed: [fixed('luz', 'Luz', 22)], now: NOW,
  period: computeFinancialPeriod(settings, NOW, null) as never, daysLeft: 9, labelOfCategory: () => 'Comida',
});
check('snapshot: período 27/10 – 26/11', snap.label === '27/10 – 26/11', snap.label);
check('snapshot: gastado 1150 y 19% del presupuesto', snap.spentQ === 1150 && snap.pct === 19, `${snap.spentQ} ${snap.pct}`);
check('snapshot: días del período 31 y transcurridos 23', snap.daysTotal === 31 && snap.daysPassed === 23, `${snap.daysTotal} ${snap.daysPassed}`);
check('snapshot: categoría food 150/200... (100 + 50) al 75%', snap.catRows[0].spent === 150 && snap.catRows[0].pct === 75 && snap.catAlerts === 0, JSON.stringify(snap.catRows));
const body = buildWeeklySummaryBodyText(snap, NOW);
check('semanal (puro): usa el período', body.indexOf('27/10 – 26/11') >= 0 && body.indexOf('Q1,150.00') >= 0 && body.indexOf('Te quedan Q4,850.00') >= 0 && body.indexOf('Próximo ingreso en 9 día(s)') >= 0, body);
const brief = buildBriefingFallbackText('Ana', snap, 'Frase.');
check('briefing (puro): período y «según lo registrado»', brief.indexOf('Buenos días, Ana') === 0 && brief.indexOf('27/10 – 26/11') >= 0 && brief.indexOf('según lo registrado') >= 0 && brief.indexOf('19%') >= 0 && brief.indexOf('Frase.') >= 0, brief);
check('briefing (puro): no dice "mensual"', brief.indexOf('mensual') < 0);
const ctxText = buildFinancialContextText({ userName: 'Ana', monthlyIncome: 8000, budgetLimit: 6000, activeDebts: 0, monthlySavingsGoal: 0 }, snap);
check('contexto Gemini: del período, no del mes', ctxText.indexOf('Período de pago actual: 27/10 – 26/11') >= 0 && ctxText.indexOf('Gastado en este período en Q: 1150.00') >= 0 && ctxText.indexOf('Días transcurridos: 23 de 31') >= 0, ctxText);
const over = periodSnapshot({
  settings: { budgetLimit: 1000 }, txs, categoryBudgets: [], fixed: [], now: NOW,
  period: computeFinancialPeriod(settings, NOW, null) as never, daysLeft: 9, labelOfCategory: () => '',
});
check('briefing: presupuesto superado', buildBriefingFallbackText('Ana', over, 'F').indexOf('superado tu presupuesto en Q150.00') >= 0);
check('fmtQ', fmtQ(1234567.5) === 'Q1,234,567.50' && fmtQ(0) === 'Q0.00' && fmtQ(-12.3) === '-Q12.30');

// ═════════ Interruptores por tipo ═════════
for (const kind of NOTIF_KINDS) {
  const k = { ...DEFAULT_NOTIF_PREFS.kinds, [kind]: false };
  const p = buildPlan(dataOf({ creditInstallments: [instCard, loan] }), prefsOf({ kinds: k }), NOW);
  check(`interruptor ${kind}: apagado no genera avisos de ese tipo`, p.every(x => x.kind !== kind));
}
const allOn = buildPlan(dataOf({ creditInstallments: [instCard, loan] }), prefsOf(), NOW);
const kindsIn = new Set(allOn.map(x => x.kind));
check('con todo encendido aparecen todos los tipos del plan', ['fixed', 'card_due', 'card_cut', 'installment_last', 'debt_due', 'period_end', 'daily', 'weekly'].every(k => kindsIn.has(k as never)), Array.from(kindsIn).join(','));
check('salary, capacity, thresholds y ai son inmediatos (nunca están en el plan)', !kindsIn.has('salary') && !kindsIn.has('capacity') && !kindsIn.has('thresholds') && !kindsIn.has('ai'));
const none = { ...DEFAULT_NOTIF_PREFS.kinds };
for (const k of NOTIF_KINDS) none[k] = false;
check('todo apagado: plan vacío', buildPlan(dataOf({ creditInstallments: [instCard, loan] }), prefsOf({ kinds: none }), NOW).length === 0);

// ═════════ Tope diario ═════════
// 2-dic: pago de la tarjeta (5), Luz y Agua del día 5 (4 cada una, -3 = 2-dic) y el resumen diario no (solo 7 días).
const crowded = dataOf({ fixedExpenses: [fixed('luz', 'Luz', 5), fixed('agua', 'Agua', 5), fixed('tel', 'Teléfono', 5), fixed('net', 'Internet', 5)] });
const perDay = (p: PlannedNotif[]) => {
  const m = new Map<string, number>();
  for (const x of p) m.set(ymd(x.fireAt), (m.get(ymd(x.fireAt)) ?? 0) + 1);
  return m;
};
for (const max of [1, 2, 3, 4]) {
  const p = buildPlan(crowded, prefsOf({ maxPerDay: max }), NOW);
  check(`tope: ningún día pasa de ${max}`, Array.from(perDay(p).values()).every(n => n <= max), JSON.stringify(Array.from(perDay(p).entries()).filter(e => e[1] > max)));
}
const free = buildPlan(crowded, prefsOf({ maxPerDay: 10 }), NOW);
check('tope: sin tope el 2-dic hay 5 avisos (pago + 4 fijos)', (perDay(free).get('2026-12-02') ?? 0) === 5, String(perDay(free).get('2026-12-02')));
const one = buildPlan(crowded, prefsOf({ maxPerDay: 1 }), NOW).filter(p => ymd(p.fireAt) === '2026-12-02');
check('tope 1: sobrevive el pago de la tarjeta (prioridad más alta)', one.length === 1 && one[0].kind === 'card_due', one.map(p => p.kind).join(','));
const two = buildPlan(crowded, prefsOf({ maxPerDay: 2 }), NOW).filter(p => ymd(p.fireAt) === '2026-12-02');
check('tope 2: pago + un gasto fijo', two.length === 2 && two[0].kind === 'card_due' && two[1].kind === 'fixed');
const raw: PlannedNotif[] = [
  { id: 'a', fireAt: d(2026, 11, 20, 8), title: '', body: '', priority: 1, kind: 'daily', ref: 'a' },
  { id: 'b', fireAt: d(2026, 11, 20, 9), title: '', body: '', priority: 5, kind: 'card_due', ref: 'b' },
  { id: 'c', fireAt: d(2026, 11, 20, 10), title: '', body: '', priority: 3, kind: 'fixed', ref: 'c' },
];
check('applyCaps: gana la prioridad y queda ordenado por hora', applyCaps(raw, 2).map(p => p.id).join() === 'b,c');
check('plannedCountOn cuenta por el sufijo de fecha', plannedCountOn(['bm_p_fixed_x_20261120', 'bm_p_daily_d_20261120', 'bm_p_daily_d_20261121', 'otro_20261120'], d(2026, 11, 20)) === 2);

// ═════════ Máximo 60 programadas ═════════
const many: FixedExpense[] = [];
for (let i = 0; i < 40; i++) many.push(fixed(`m${i}`, `Gasto ${i}`, 1 + (i % 28)));
const big = buildPlan(dataOf({ fixedExpenses: many }), prefsOf({ maxPerDay: 10 }), NOW);
check('máximo: nunca más de 60', big.length === MAX_PLANNED && MAX_PLANNED === 60, String(big.length));
check('máximo: se conservan los más próximos (ordenado por hora)', big.every((p, i) => i === 0 || big[i - 1].fireAt.getTime() <= p.fireAt.getTime()));
const bigAll = buildPlan(dataOf({ fixedExpenses: many }), prefsOf({ maxPerDay: 10, kinds: { ...DEFAULT_NOTIF_PREFS.kinds, daily: false, weekly: false } }), NOW);
check('máximo: aun sin resúmenes sigue en 60', bigAll.length === 60);
check('máximo: todo dentro de los 62 días', big.every(p => p.fireAt.getTime() <= d(2026, 11, 18 + HORIZON_DAYS, 23, 59).getTime()));
check('plan: nada en el pasado', plan.every(p => p.fireAt.getTime() > NOW.getTime()));

// ═════════ Idempotencia: ids y firmas estables entre dos construcciones ═════════
const planA = buildPlan(dataOf({ creditInstallments: [instCard, loan] }), prefsOf(), NOW);
const planB = buildPlan(dataOf({ creditInstallments: [instCard, loan] }), prefsOf(), NOW);
check('idempotencia: mismos ids', planA.map(p => p.id).join() === planB.map(p => p.id).join());
check('idempotencia: ids únicos y con prefijo', new Set(planA.map(p => p.id)).size === planA.length && planA.every(p => p.id.indexOf('bm_p_') === 0 && /_\d{8}$/.test(p.id)));
check('idempotencia: mismas firmas', planA.every((p, i) => sigOf(p) === sigOf(planB[i])));
const existing = planA.map(p => ({ id: p.id, sig: sigOf(p) }));
const same = diffPlan(planB, existing);
check('diff: plan igual -> nada que agregar ni cancelar', same.add.length === 0 && same.cancel.length === 0);
const first = diffPlan(planB, []);
check('diff: sin nada programado -> agrega todo', first.add.length === planB.length && first.cancel.length === 0);
const stale = diffPlan(planB, [...existing, { id: 'bm_p_fixed_viejo_20260101', sig: 'x' }, { id: 'bm_ai_nudge' }]);
check('diff: cancela lo obsoleto con prefijo y no toca lo ajeno', stale.cancel.length === 1 && stale.cancel[0] === 'bm_p_fixed_viejo_20260101' && stale.add.length === 0);
const changed = diffPlan(planB, existing.map((e, i) => (i === 3 ? { ...e, sig: 'otro' } : e)));
check('diff: contenido distinto -> cancela y reprograma ese aviso', changed.cancel.length === 1 && changed.add.length === 1 && changed.add[0].id === planB[3].id && changed.cancel[0] === planB[3].id);
const noSig = diffPlan(planB, existing.map(e => ({ id: e.id })));
check('diff: sin firma (programado por una versión vieja) se reprograma', noSig.cancel.length === planB.length && noSig.add.length === planB.length);
const existingBase = plan.map(p => ({ id: p.id, sig: sigOf(p) }));
const grown = diffPlan(buildPlan(dataOf({ fixedExpenses: [fixed('luz', 'Luz', 22), fixed('nuevo', 'Agua', 24)] }), prefsOf(), NOW), existingBase);
// Agrega los avisos del gasto nuevo; el resumen semanal cambia de texto (ahora hay 2 gastos pendientes) y se reprograma.
check('diff: un gasto fijo nuevo agrega sus avisos y solo reprograma el semanal', grown.add.filter(p => p.ref === 'nuevo').length === 2 && grown.add.every(p => p.ref === 'nuevo' || p.kind === 'weekly') && grown.cancel.every(id => id.indexOf('bm_p_weekly_') === 0), grown.add.map(p => p.id).join() + ' / ' + grown.cancel.join());

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
