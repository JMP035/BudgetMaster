process.env.TZ = 'America/Guatemala';
// Pruebas del ciclo semanal con día de pago (B4): services/FinancialPeriod.ts (período y días hasta el pago),
// PeriodAnchors.ts (sanitizePaymentSchedule), IncomeSourceView.ts (weeklySourceMismatch) y
// NotificationPlan.ts (weeklySummaryWeekday). Sin dependencias:
//   npm run test:weekly-period   →   sucrase-node scripts/weekly-period.test.ts

import { computeFinancialPeriod, daysUntilNextPay, normalizeWeekday } from '../services/FinancialPeriod';
import type { FinancialPeriod } from '../services/FinancialPeriod';
import { sanitizePaymentSchedule } from '../services/PeriodAnchors';
import type { PaymentSchedule } from '../services/PeriodAnchors';
import { weeklySourceMismatch } from '../services/IncomeSourceView';
import { buildPlan, weeklySummaryWeekday } from '../services/NotificationPlan';
import type { PlanData } from '../services/NotificationPlan';
import { DEFAULT_NOTIF_PREFS } from '../services/NotifPrefs';
import type { IncomeSource, UserSettings } from '../services/storage';

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
const fmt_d = (x: Date) => x.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });

type Cycle = Pick<UserSettings, 'paymentCycle' | 'paymentDay' | 'paymentDays'> & { paymentWeekday?: number };
const weekly = (wd?: number): Cycle => ({ paymentCycle: 'weekly', paymentDay: 30, paymentDays: [15, 30], paymentWeekday: wd });

// ─────────────────────────────────────────────────────────────
// Referencia: el cálculo semanal ANTERIOR (domingo fijo), copiado tal cual del código viejo.
// ─────────────────────────────────────────────────────────────
function oldWeekly(now: Date): FinancialPeriod {
  const today = now.getDate();
  const dayOfWeek = now.getDay(); // 0=dom
  const start = new Date(now); start.setDate(today - dayOfWeek); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59);
  const prevStart = new Date(start); prevStart.setDate(start.getDate() - 7);
  const prevEnd = new Date(start); prevEnd.setDate(start.getDate() - 1); prevEnd.setHours(23, 59, 59);
  const nextStart = new Date(start); nextStart.setDate(start.getDate() + 7);
  return {
    start, end, label: fmt_d(start) + ' – ' + fmt_d(end),
    prevStart, prevEnd, prevLabel: fmt_d(prevStart) + ' – ' + fmt_d(prevEnd),
    daysPassed: dayOfWeek + 1, daysTotal: 7,
    key: ymd(start), nominalStart: start, startSource: 'nominal', nextStart,
  };
}
const oldDaysUntil = (now: Date) => 7 - now.getDay();

function sameAsOld(a: FinancialPeriod, b: FinancialPeriod): boolean {
  return a.start.getTime() === b.start.getTime() && a.end.getTime() === b.end.getTime()
    && a.label === b.label && a.prevStart.getTime() === b.prevStart.getTime() && a.prevEnd.getTime() === b.prevEnd.getTime()
    && a.prevLabel === b.prevLabel && a.daysPassed === b.daysPassed && a.daysTotal === b.daysTotal
    && a.key === b.key && a.nominalStart.getTime() === b.nominalStart.getTime() && a.startSource === b.startSource
    && a.nextStart.getTime() === b.nextStart.getTime();
}

// ═════════ Regresión: con domingo (0 o sin definir) el resultado es EXACTAMENTE el de antes ═════════
console.log('Regresión con wd = 0');
{
  // 7 fechas consecutivas (dom 8 nov – sáb 14 nov de 2026), a varias horas del día.
  for (const hour of [0, 9, 23]) {
    for (let day = 8; day <= 14; day++) {
      const now = d(2026, 11, day, hour, hour === 23 ? 59 : 0);
      const ref = oldWeekly(now);
      for (const wd of [0, undefined]) {
        const got = computeFinancialPeriod(weekly(wd), now, null);
        check(`wd=${wd} ${ymd(now)} ${hour}h: igual que antes`, sameAsOld(got, ref), `${got.label} vs ${ref.label}; pasados ${got.daysPassed} vs ${ref.daysPassed}`);
        check(`wd=${wd} ${ymd(now)} ${hour}h: días hasta el pago igual que antes`, daysUntilNextPay(weekly(wd), now, null) === oldDaysUntil(now));
      }
    }
  }
  // Cruce de mes y de año con la implementación vieja como referencia.
  for (const [y, m, day] of [[2025, 12, 28], [2025, 12, 31], [2026, 1, 1], [2026, 1, 3], [2026, 2, 28], [2026, 3, 1], [2024, 2, 29]]) {
    const now = d(y, m, day);
    check(`regresión ${ymd(now)}`, sameAsOld(computeFinancialPeriod(weekly(0), now, null), oldWeekly(now)));
  }
  // El domingo cuenta 1 día y faltan 7; el sábado cuenta 7 y falta 1 (comportamiento de siempre).
  const dom = computeFinancialPeriod(weekly(0), d(2026, 11, 8), null);
  const sab = computeFinancialPeriod(weekly(0), d(2026, 11, 14), null);
  check('domingo: pasados 1 y faltan 7', dom.daysPassed === 1 && daysUntilNextPay(weekly(0), d(2026, 11, 8), null) === 7);
  check('sábado: pasados 7 y falta 1', sab.daysPassed === 7 && daysUntilNextPay(weekly(0), d(2026, 11, 14), null) === 1);
}

// ═════════ Con día de pago distinto de domingo ═════════
console.log('Semana con día de pago martes');
{
  // 10 nov 2026 es martes.
  const tue = computeFinancialPeriod(weekly(2), d(2026, 11, 10), null);
  check('martes (día de pago): daysPassed 1', tue.daysPassed === 1, String(tue.daysPassed));
  check('martes: faltan 7 días', daysUntilNextPay(weekly(2), d(2026, 11, 10), null) === 7);
  check('martes: período 10 nov – 16 nov, clave 2026-11-10', ymd(tue.start) === '2026-11-10' && ymd(tue.end) === '2026-11-16' && tue.key === '2026-11-10', `${ymd(tue.start)} ${ymd(tue.end)} ${tue.key}`);
  check('martes: inicio 00:00 y fin 23:59:59', tue.start.getHours() === 0 && tue.start.getMinutes() === 0 && tue.end.getHours() === 23 && tue.end.getSeconds() === 59);
  check('martes: daysTotal 7', tue.daysTotal === 7);
  check('martes: anterior 3 nov – 9 nov', ymd(tue.prevStart) === '2026-11-03' && ymd(tue.prevEnd) === '2026-11-09', `${ymd(tue.prevStart)} ${ymd(tue.prevEnd)}`);
  check('martes: siguiente empieza el 17 nov', ymd(tue.nextStart) === '2026-11-17');
  check('martes: inicio nominal = inicio y sin ancla', ymd(tue.nominalStart) === '2026-11-10' && tue.startSource === 'nominal');

  // 16 nov 2026 es lunes: último día de la semana que arrancó el martes 10.
  const mon = computeFinancialPeriod(weekly(2), d(2026, 11, 16), null);
  check('lunes (último día): daysPassed 7', mon.daysPassed === 7, String(mon.daysPassed));
  check('lunes: el período termina ese día', ymd(mon.end) === '2026-11-16' && ymd(mon.start) === '2026-11-10');
  check('lunes: falta 1 día', daysUntilNextPay(weekly(2), d(2026, 11, 16), null) === 1);

  // El miércoles 11 pertenece a la misma semana (daysPassed 2); el domingo 8 todavía a la anterior (3 nov – 9 nov).
  check('miércoles: daysPassed 2, mismo período', computeFinancialPeriod(weekly(2), d(2026, 11, 11), null).key === '2026-11-10'
    && computeFinancialPeriod(weekly(2), d(2026, 11, 11), null).daysPassed === 2);
  const dom = computeFinancialPeriod(weekly(2), d(2026, 11, 8), null);
  check('domingo antes del martes: semana anterior (clave 2026-11-03, daysPassed 6)', dom.key === '2026-11-03' && dom.daysPassed === 6, `${dom.key} ${dom.daysPassed}`);

  // Recorrido de 14 días: cada día cae en un período de 7 días, daysPassed + faltan = 8.
  let ok = true; let detail = '';
  for (let i = 0; i < 14; i++) {
    const now = d(2026, 11, 3 + i);
    const p = computeFinancialPeriod(weekly(2), now, null);
    const rest = daysUntilNextPay(weekly(2), now, null);
    const spanDays = Math.round((p.end.getTime() - p.start.getTime()) / 86400000); // fin 23:59:59 → 7
    if (p.daysPassed + rest !== 8 || spanDays !== 7 || p.start.getDay() !== 2 || p.end.getDay() !== 1) { ok = false; detail = ymd(now); }
  }
  check('14 días seguidos: siempre martes→lunes, 7 días, pasados + faltan = 8', ok, detail);
}

console.log('Cruces de mes y de año');
{
  // 30/12/2025 es martes: la semana va del 30/12/2025 al 05/01/2026.
  for (let i = 0; i < 7; i++) {
    const real = i <= 1 ? d(2025, 12, 30 + i) : d(2026, 1, i - 1);
    const p = computeFinancialPeriod(weekly(2), real, null);
    check(`cruce de año ${ymd(real)}: período 30/12/2025 – 05/01/2026, día ${i + 1}`,
      p.key === '2025-12-30' && ymd(p.start) === '2025-12-30' && ymd(p.end) === '2026-01-05' && p.daysPassed === i + 1,
      `${p.key} ${ymd(p.end)} ${p.daysPassed}`);
  }
  const next = computeFinancialPeriod(weekly(2), d(2026, 1, 6), null);
  check('6/1/2026 empieza una semana nueva', next.key === '2026-01-06' && next.daysPassed === 1 && ymd(next.prevEnd) === '2026-01-05');
  // Cruce de mes: jueves 29/10/2026 → miércoles 04/11/2026.
  const oct = computeFinancialPeriod(weekly(4), d(2026, 10, 29), null);
  const nov = computeFinancialPeriod(weekly(4), d(2026, 11, 4), null);
  check('cruce de mes: jueves 29 oct – miércoles 4 nov', oct.key === '2026-10-29' && nov.key === '2026-10-29'
    && ymd(nov.end) === '2026-11-04' && oct.daysPassed === 1 && nov.daysPassed === 7);
  // 29 de febrero (bisiesto).
  const leap = computeFinancialPeriod(weekly(6), d(2024, 3, 1), null); // viernes 1 mar 2024; sábado de pago = 24 feb
  check('año bisiesto: semana sábado 24 feb – viernes 1 mar', ymd(leap.start) === '2024-02-24' && ymd(leap.end) === '2024-03-01', `${ymd(leap.start)} ${ymd(leap.end)}`);
}

console.log('Otros ciclos no dependen del día de la semana');
{
  const now = d(2026, 11, 18);
  const mBase: Cycle = { paymentCycle: 'monthly', paymentDay: 27, paymentDays: [15, 30] };
  const a = computeFinancialPeriod(mBase, now, null);
  const b = computeFinancialPeriod({ ...mBase, paymentWeekday: 4 }, now, null);
  check('mensual: igual con o sin paymentWeekday', sameAsOld(a, b));
  const iBase: Cycle = { paymentCycle: 'irregular', paymentDay: 27, paymentDays: [15, 30] };
  const i1 = computeFinancialPeriod(iBase, now, null);
  const i2 = computeFinancialPeriod({ ...iBase, paymentWeekday: 5 }, now, null);
  check('irregular: mes calendario, sin importar el día', sameAsOld(i1, i2) && ymd(i1.start) === '2026-11-01' && ymd(i1.end) === '2026-11-30');
  check('irregular: daysUntilNextPay sigue en 0', daysUntilNextPay(iBase, now, null) === 0);
}

// ═════════ normalizeWeekday ═════════
console.log('normalizeWeekday');
{
  check('undefined → 0', normalizeWeekday(undefined) === 0);
  check('null → 0', normalizeWeekday(null) === 0);
  check('7 → 0', normalizeWeekday(7) === 0);
  check('-1 → 0', normalizeWeekday(-1) === 0);
  check('2.5 → 0', normalizeWeekday(2.5) === 0);
  check("'3' (texto) → 0", normalizeWeekday('3') === 0);
  check('NaN → 0', normalizeWeekday(NaN) === 0);
  check('0..6 se conservan', [0, 1, 2, 3, 4, 5, 6].every(n => normalizeWeekday(n) === n));
}

// ═════════ sanitizePaymentSchedule ═════════
console.log('sanitizePaymentSchedule');
{
  const cur: PaymentSchedule = { paymentCycle: 'monthly', paymentDay: 27, paymentDays: [15, 30] };
  const w5 = sanitizePaymentSchedule(cur, { paymentCycle: 'weekly', paymentWeekday: 5 });
  check('semanal con viernes', w5.paymentCycle === 'weekly' && w5.paymentWeekday === 5);
  check('el día del mes y los días no cambian', w5.paymentDay === 27 && w5.paymentDays.join() === '15,30');
  check('sin día en el parche y sin actual: 0', sanitizePaymentSchedule(cur, { paymentCycle: 'weekly' }).paymentWeekday === 0);
  const curW: PaymentSchedule = { ...cur, paymentCycle: 'weekly', paymentWeekday: 3 };
  check('parche sin día conserva el actual (3)', sanitizePaymentSchedule(curW, { paymentDay: 20 }).paymentWeekday === 3);
  check('día inválido (7) conserva el actual', sanitizePaymentSchedule(curW, { paymentWeekday: 7 }).paymentWeekday === 3);
  check('día inválido (-1) conserva el actual', sanitizePaymentSchedule(curW, { paymentWeekday: -1 }).paymentWeekday === 3);
  check('día inválido (2.5) conserva el actual', sanitizePaymentSchedule(curW, { paymentWeekday: 2.5 }).paymentWeekday === 3);
  check("día inválido ('4' texto) conserva el actual", sanitizePaymentSchedule(curW, { paymentWeekday: '4' as unknown as number }).paymentWeekday === 3);
  check('día 0 (domingo) es válido', sanitizePaymentSchedule(curW, { paymentWeekday: 0 }).paymentWeekday === 0);
  check('actual inválido y parche inválido: 0', sanitizePaymentSchedule({ ...cur, paymentWeekday: 9 }, { paymentWeekday: 12 }).paymentWeekday === 0);
  check('cambiar a mensual no pierde el día de la semana guardado', sanitizePaymentSchedule(curW, { paymentCycle: 'monthly' }).paymentWeekday === 3);
}

// ═════════ weeklySourceMismatch ═════════
console.log('weeklySourceMismatch');
{
  const src = (extra: Partial<IncomeSource>): IncomeSource => ({
    id: 's1', name: 'Pago semanal', category: 'salary', amount: 1000, currency: 'Q', frequency: 'weekly', days: [5],
    role: 'base', anchorsPeriod: false, isActive: true, createdAt: '2026-11-01T12:00:00.000Z', ...extra,
  });
  check('mismo día: sin diferencia', weeklySourceMismatch([src({})], 5) === null);
  const m = weeklySourceMismatch([src({})], 2);
  check('día distinto: devuelve la fuente', m !== null && m.id === 's1');
  check('fuente inactiva no cuenta', weeklySourceMismatch([src({ isActive: false })], 2) === null);
  check('fuente extra no cuenta', weeklySourceMismatch([src({ role: 'extra' })], 2) === null);
  check('fuente mensual no cuenta', weeklySourceMismatch([src({ frequency: 'monthly', days: [27] })], 2) === null);
  check('fuente semanal sin día (días vacíos) no cuenta', weeklySourceMismatch([src({ days: [] })], 2) === null);
  check('fuente semanal con día fuera de rango no cuenta', weeklySourceMismatch([src({ days: [9] })], 2) === null);
  check('sin fuentes: null', weeklySourceMismatch([], 2) === null);
  const second = weeklySourceMismatch([src({ id: 'a', days: [2] }), src({ id: 'b', days: [4] })], 2);
  check('devuelve la primera que discrepa, saltando las que coinciden', second !== null && second.id === 'b');
  check('día 0 (domingo) también se compara', weeklySourceMismatch([src({ days: [0] })], 1) !== null && weeklySourceMismatch([src({ days: [0] })], 0) === null);
}

// ═════════ weeklySummaryWeekday ═════════
console.log('weeklySummaryWeekday');
{
  check('semanal martes → lunes (1)', weeklySummaryWeekday({ paymentCycle: 'weekly', paymentWeekday: 2 }) === 1);
  check('semanal domingo (0) → sábado (6)', weeklySummaryWeekday({ paymentCycle: 'weekly', paymentWeekday: 0 }) === 6);
  check('semanal sin día → sábado (6)', weeklySummaryWeekday({ paymentCycle: 'weekly' }) === 6);
  check('semanal lunes (1) → domingo (0)', weeklySummaryWeekday({ paymentCycle: 'weekly', paymentWeekday: 1 }) === 0);
  check('mensual → domingo (0)', weeklySummaryWeekday({ paymentCycle: 'monthly', paymentWeekday: 2 }) === 0);
  check('quincenal → domingo (0)', weeklySummaryWeekday({ paymentCycle: 'biweekly' }) === 0);
  check('irregular → domingo (0)', weeklySummaryWeekday({ paymentCycle: 'irregular', paymentWeekday: 4 }) === 0);

  // En el plan: ciclo semanal con pago los martes → el resumen semanal cae los lunes y reemplaza al diario ese día.
  const NOW = d(2026, 11, 18, 10, 0); // miércoles
  const settings = {
    userName: 'Ana', paymentCycle: 'weekly', paymentDay: 27, paymentDays: [15, 30], paymentWeekday: 2,
    budgetLimit: 6000, monthlyIncome: 8000, exchangeRate: 7.7,
  } as unknown as UserSettings;
  const data: PlanData = {
    settings, transactions: [], fixedExpenses: [], accounts: [], creditInstallments: [], categoryBudgets: [],
    daysLeft: daysUntilNextPay(settings, NOW, null),
    periodAt: (x: Date) => {
      const p = computeFinancialPeriod(settings, x, null);
      return { start: p.start, end: p.end, nextStart: p.nextStart };
    },
  };
  const plan = buildPlan(data, DEFAULT_NOTIF_PREFS, NOW);
  const weeklies = plan.filter(p => p.kind === 'weekly');
  check('plan semanal-martes: resúmenes los lunes (23 y 30 nov)',
    weeklies.length === 2 && weeklies.every(p => p.fireAt.getDay() === 1) && ymd(weeklies[0].fireAt) === '2026-11-23' && ymd(weeklies[1].fireAt) === '2026-11-30',
    weeklies.map(p => ymd(p.fireAt)).join(','));
  const dailies = plan.filter(p => p.kind === 'daily');
  check('plan semanal-martes: el lunes del resumen semanal no hay diario', dailies.every(p => p.fireAt.getDay() !== 1 || ymd(p.fireAt) < '2026-11-23'));
  check('plan semanal: no hay aviso de fin de período', plan.filter(p => p.kind === 'period_end').length === 0);

  // Con domingo (0) llega el sábado (un día antes que antes).
  const sundaySettings = { ...settings, paymentWeekday: 0 } as unknown as UserSettings;
  const planSun = buildPlan({ ...data, settings: sundaySettings }, DEFAULT_NOTIF_PREFS, NOW);
  const wSun = planSun.filter(p => p.kind === 'weekly');
  check('plan semanal-domingo: resúmenes los sábados (21 y 28 nov)',
    wSun.length === 2 && wSun.every(p => p.fireAt.getDay() === 6) && ymd(wSun[0].fireAt) === '2026-11-21', wSun.map(p => ymd(p.fireAt)).join(','));

  // Ciclo mensual: sigue en domingo.
  const planM = buildPlan({ ...data, settings: { ...settings, paymentCycle: 'monthly' } as unknown as UserSettings }, DEFAULT_NOTIF_PREFS, NOW);
  const wM = planM.filter(p => p.kind === 'weekly');
  check('plan mensual: resúmenes los domingos (22 y 29 nov)', wM.length === 2 && wM.every(p => p.fireAt.getDay() === 0) && ymd(wM[0].fireAt) === '2026-11-22', wM.map(p => ymd(p.fireAt)).join(','));
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
