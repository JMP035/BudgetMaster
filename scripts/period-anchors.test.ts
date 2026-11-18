process.env.TZ = 'America/Guatemala';
// Pruebas del período con inicio real (PayCalendar, PeriodAnchors, FixedCycle con resolvedor y FinancialPeriod).
//   npm run test:period-anchors   →   sucrase-node scripts/period-anchors.test.ts

import {
  DEFAULT_PAY_RULES, adjustPayDate, easterSunday, gtHolidays, sanitizePayRules, ymd,
} from '../services/PayCalendar';
import type { PayRules } from '../services/PayCalendar';
import {
  buildStartResolver, clearManualAnchor, removeAnchorsForTx, setManualAnchor, upsertAutoAnchor,
} from '../services/PeriodAnchors';
import type { PeriodAnchor } from '../services/PeriodAnchors';
import {
  cycleKeyFor, dueDateInPeriod, fixedCycleConfig, isPaidForPeriod, periodFor, setPeriodStartResolver,
} from '../services/FixedCycle';
import { computeFinancialPeriod, daysUntilNextPay } from '../services/FinancialPeriod';
import type { FixedExpense } from '../services/storage';

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
const rules = (over: Partial<PayRules> = {}): PayRules => ({ ...DEFAULT_PAY_RULES, ...over });
const P27 = { paymentCycle: 'monthly' as const, paymentDay: 27, paymentDays: [15, 30] };
const BW = { paymentCycle: 'biweekly' as const, paymentDay: 30, paymentDays: [15, 30] };
const auto = (key: string, start: string): PeriodAnchor => ({ key, start, source: 'auto', at: '2026-09-25T12:00:00.000Z', txId: 't_' + key });
const manual = (key: string, start: string): PeriodAnchor => ({ key, start, source: 'manual', at: '2026-09-25T12:00:00.000Z' });
const withResolver = <T>(settings: Parameters<typeof buildStartResolver>[0], anchors: PeriodAnchor[], fn: () => T): T => {
  setPeriodStartResolver(buildStartResolver(settings, anchors));
  try { return fn(); } finally { setPeriodStartResolver(null); }
};

// ═════════════ Calendario: Pascua y feriados ═════════════
console.log('Calendario de pago');
{
  const e26 = easterSunday(2026);
  const e27 = easterSunday(2027);
  check('Pascua 2026 = 5 abril', e26.month === 4 && e26.day === 5, JSON.stringify(e26));
  check('Pascua 2027 = 28 marzo', e27.month === 3 && e27.day === 28, JSON.stringify(e27));
  const e24 = easterSunday(2024);
  check('Pascua 2024 = 31 marzo', e24.month === 3 && e24.day === 31);
  const h26 = gtHolidays(2026);
  const h27 = gtHolidays(2027);
  for (const md of ['01-01', '05-01', '06-30', '09-15', '10-20', '11-01', '12-25']) {
    check(`feriado fijo ${md}`, h26.indexOf(`2026-${md}`) >= 0);
  }
  check('Jueves y Viernes Santo 2026 (2 y 3 abril)', h26.indexOf('2026-04-02') >= 0 && h26.indexOf('2026-04-03') >= 0);
  check('Jueves y Viernes Santo 2027 (25 y 26 marzo)', h27.indexOf('2027-03-25') >= 0 && h27.indexOf('2027-03-26') >= 0);
  check('9 feriados por año', h26.length === 9 && h27.length === 9, String(h27.length));
}

// ═════════════ adjustPayDate ═════════════
console.log('adjustPayDate');
{
  const sun27 = d(2026, 9, 27);
  check('27 sep 2026 es domingo', sun27.getDay() === 0);
  check('prev_business: domingo -> viernes 25', ymd(adjustPayDate(sun27, rules())) === '2026-09-25');
  check('next_business: domingo -> lunes 28', ymd(adjustPayDate(sun27, rules({ weekendRule: 'next_business' }))) === '2026-09-28');
  check('exact no mueve', ymd(adjustPayDate(sun27, rules({ weekendRule: 'exact' }))) === '2026-09-27');
  check('día hábil no se mueve', ymd(adjustPayDate(d(2026, 10, 27), rules())) === '2026-10-27');
  check('sábado -> viernes', ymd(adjustPayDate(d(2026, 9, 26), rules())) === '2026-09-25');
  check('tolerancia 1 recorta el domingo a sábado 26', ymd(adjustPayDate(sun27, rules({ toleranceDays: 1 }))) === '2026-09-26');
  check('tolerancia 0 no mueve', ymd(adjustPayDate(sun27, rules({ toleranceDays: 0 }))) === '2026-09-27');
  check('tolerancia máxima 7', ymd(adjustPayDate(d(2027, 3, 28), rules({ toleranceDays: 30 }))) === '2027-03-24');
  check('feriado 15 sep (martes) -> lunes 14', ymd(adjustPayDate(d(2026, 9, 15), rules())) === '2026-09-14');
  check('feriados apagados: 15 sep se queda', ymd(adjustPayDate(d(2026, 9, 15), rules({ holidays: false }))) === '2026-09-15');
  check('Semana Santa 2027: domingo 28 mar, tolerancia 3 -> jueves 25', ymd(adjustPayDate(d(2027, 3, 28), rules())) === '2027-03-25');
  check('Viernes Santo 2027 (26 mar) -> miércoles 24', ymd(adjustPayDate(d(2027, 3, 26), rules())) === '2027-03-24');
  const s = sanitizePayRules({ weekendRule: 'x', toleranceDays: 99, holidays: 'si' });
  check('sanitizePayRules corrige valores raros', s.weekendRule === 'prev_business' && s.toleranceDays === 7 && s.holidays === true && s.autoAnchor === true);
  check('sanitizePayRules(undefined) = default', JSON.stringify(sanitizePayRules(undefined)) === JSON.stringify(DEFAULT_PAY_RULES));
}

// ═════════════ SIN resolvedor: idéntico a siempre ═════════════
console.log('Sin resolvedor (comportamiento previo)');
{
  setPeriodStartResolver(null);
  const eff = (a: number, y: number, m: number) => Math.min(Math.max(1, a), new Date(y, m + 1, 0).getDate());
  const startIn = (a: number, y: number, m: number) => {
    const r = new Date(y, m, 1);
    return new Date(r.getFullYear(), r.getMonth(), eff(a, r.getFullYear(), r.getMonth()));
  };
  let bad = 0;
  for (const a of [1, 5, 15, 27, 30, 31]) {
    for (let t = d(2026, 1, 1).getTime(); t < d(2028, 3, 1).getTime(); t += 86400000) {
      const date = new Date(t);
      const y = date.getFullYear();
      const m = date.getMonth();
      const st = date.getDate() >= eff(a, y, m) ? startIn(a, y, m) : startIn(a, y, m - 1);
      const nx = startIn(a, st.getFullYear(), st.getMonth() + 1);
      const en = new Date(nx.getFullYear(), nx.getMonth(), nx.getDate() - 1, 23, 59, 59, 999);
      const p = periodFor({ anchorDay: a }, date);
      if (p.key !== ymd(st) || p.start.getTime() !== st.getTime() || p.end.getTime() !== en.getTime()) bad++;
    }
  }
  check('periodFor sin resolvedor = algoritmo anterior (6 anclas x 2 años)', bad === 0, `${bad} diferencias`);
  const p = periodFor(fixedCycleConfig(P27), d(2026, 11, 10, 10));
  check('P27 clave 2026-10-27', p.key === '2026-10-27');
  check('P27 borde 26 oct -> 2026-09-27', periodFor(fixedCycleConfig(P27), d(2026, 10, 26, 23, 59)).key === '2026-09-27');
  check('P27 borde 27 oct -> 2026-10-27', periodFor(fixedCycleConfig(P27), d(2026, 10, 27, 0, 0)).key === '2026-10-27');
  // Con reglas 'exact' el resolvedor es transparente.
  const exact = buildStartResolver({ ...P27, payRules: rules({ weekendRule: 'exact' }) }, []);
  setPeriodStartResolver(exact);
  let bad2 = 0;
  for (let t = d(2026, 1, 1).getTime(); t < d(2027, 6, 1).getTime(); t += 86400000) {
    const date = new Date(t);
    setPeriodStartResolver(null);
    const a = periodFor({ anchorDay: 27 }, date);
    setPeriodStartResolver(exact);
    const b = periodFor({ anchorDay: 27 }, date);
    if (a.key !== b.key || a.start.getTime() !== b.start.getTime() || a.end.getTime() !== b.end.getTime()) bad2++;
  }
  setPeriodStartResolver(null);
  check("weekendRule 'exact' no cambia ningún período", bad2 === 0, `${bad2} diferencias`);
}

// ═════════════ Ejemplo real: pago día 27, 27/09/2026 domingo ═════════════
console.log('Mensual día 27 con el 27 en domingo');
{
  const cfg = fixedCycleConfig(P27);
  const S = { ...P27, payRules: rules() };
  withResolver(S, [], () => {
    const p25 = periodFor(cfg, d(2026, 9, 25));
    check('25 sep arranca el período nuevo (clave nominal 2026-09-27)', p25.key === '2026-09-27', p25.key);
    check('inicio efectivo vie 25 sep', ymd(p25.start) === '2026-09-25', ymd(p25.start));
    check('origen = expected', p25.startSource === 'expected', String(p25.startSource));
    check('el 26 sep también es del período nuevo', periodFor(cfg, d(2026, 9, 26)).key === '2026-09-27');
    check('el 27 sep (domingo) también', periodFor(cfg, d(2026, 9, 27)).key === '2026-09-27');
    const p24 = periodFor(cfg, d(2026, 9, 24, 23, 59));
    check('el 24 sep sigue en el anterior (2026-08-27)', p24.key === '2026-08-27', p24.key);
    check('el período anterior termina el 24 sep', ymd(p24.end) === '2026-09-24', ymd(p24.end));
    check('el período nuevo termina el 26 oct', ymd(p25.end) === '2026-10-26', ymd(p25.end));
    check('nextStart = 27 oct', ymd(p25.nextStart as Date) === '2026-10-27');

    const fp = computeFinancialPeriod(S, d(2026, 9, 26, 10), buildStartResolver(S, []));
    check('FinancialPeriod: start vie 25 sep', ymd(fp.start) === '2026-09-25');
    check('FinancialPeriod: end 26 oct', ymd(fp.end) === '2026-10-26');
    check('FinancialPeriod: clave nominal y fuente', fp.key === '2026-09-27' && fp.startSource === 'expected' && ymd(fp.nominalStart) === '2026-09-27');
    check('FinancialPeriod: daysTotal 32, daysPassed 2', fp.daysTotal === 32 && fp.daysPassed === 2, `${fp.daysTotal}/${fp.daysPassed}`);
    check('FinancialPeriod: previo 27 ago – 24 sep', ymd(fp.prevStart) === '2026-08-27' && ymd(fp.prevEnd) === '2026-09-24');
    check('días al próximo pago desde el 26 sep = 31', daysUntilNextPay(S, d(2026, 9, 26, 10), buildStartResolver(S, [])) === 31);
    const inNew = (day: Date) => day >= fp.start && day <= fp.end;
    check('un gasto del 25 y del 26 cuenta en el período nuevo', inNew(d(2026, 9, 25, 9)) && inNew(d(2026, 9, 26, 22)));
    check('un gasto del 24 no', !inNew(d(2026, 9, 24, 23, 59)));

    // Gasto fijo pagado el 25: queda en la clave …-27
    check('cycleKeyFor del 25 sep = 2026-09-27', cycleKeyFor(cfg, '2026-09-25') === '2026-09-27');
    const fe = {
      id: 'f1', name: 'Internet', amount: 100, currency: 'Q', category: 'bills', dayOfMonth: 5, isPaid: true,
      paidDate: '2026-09-25', autoRecord: false, isActive: true, paidCycleKey: cycleKeyFor(cfg, '2026-09-25') as string,
    } as FixedExpense;
    check('pagado el 25 vale para el período de 26 sep', isPaidForPeriod(fe, cfg, d(2026, 9, 26)));
    check('pagado el 25 vale para 1 oct', isPaidForPeriod(fe, cfg, d(2026, 10, 1)));
    check('pagado el 25 NO vale para el período que arranca el 27 oct', !isPaidForPeriod(fe, cfg, d(2026, 10, 27)));
  });

  // Mover el inicio real no cambia las claves: dueDateInPeriod usa el mes nominal
  const S1 = { paymentCycle: 'monthly' as const, paymentDay: 1, paymentDays: [15, 30], payRules: rules() };
  withResolver(S1, [], () => {
    const cfg1 = fixedCycleConfig(S1);
    const p = periodFor(cfg1, d(2026, 10, 31));
    check('día 1: 1 nov 2026 (domingo y feriado) -> el período arranca el vie 30 oct', ymd(p.start) === '2026-10-30' && p.key === '2026-11-01', `${ymd(p.start)} ${p.key}`);
    check('día 1: el vencimiento del día 1 sigue siendo 1 nov', ymd(dueDateInPeriod(1, p, cfg1)) === '2026-11-01', ymd(dueDateInPeriod(1, p, cfg1)));
  });
}

// ═════════════ Anclas: manual > auto > esperado > nominal ═════════════
console.log('Anclas del período');
{
  const cfg = fixedCycleConfig(P27);
  const S = { ...P27, payRules: rules() };
  const r = (anchors: PeriodAnchor[], key = '2026-09-27', settings = S) => buildStartResolver(settings, anchors)(key);

  check('sin anclas: esperado (vie 25)', ymd(r([])!.date) === '2026-09-25' && r([])!.source === 'expected');
  check('día hábil: nominal', r([], '2026-10-27')!.source === 'nominal' && ymd(r([], '2026-10-27')!.date) === '2026-10-27');
  check('auto temprano (24 sep) dentro de tolerancia -> salary', ymd(r([auto('2026-09-27', '2026-09-24')])!.date) === '2026-09-24' && r([auto('2026-09-27', '2026-09-24')])!.source === 'salary');
  check('auto tarde (28 sep) dentro de tolerancia -> inicio 28', ymd(r([auto('2026-09-27', '2026-09-28')])!.date) === '2026-09-28');
  check('auto fuera de tolerancia se ignora (cae en esperado)', ymd(r([auto('2026-09-27', '2026-10-05')])!.date) === '2026-09-25' && r([auto('2026-09-27', '2026-10-05')])!.source === 'expected');
  check('autoAnchor apagado ignora el sueldo real', r([auto('2026-09-27', '2026-09-28')], '2026-09-27', { ...P27, payRules: rules({ autoAnchor: false }) })!.source === 'expected');
  check('manual gana a la automática', ymd(r([auto('2026-09-27', '2026-09-24'), manual('2026-09-27', '2026-09-28')])!.date) === '2026-09-28' && r([auto('2026-09-27', '2026-09-24'), manual('2026-09-27', '2026-09-28')])!.source === 'manual');
  check('manual puede salirse de la tolerancia', ymd(r([manual('2026-09-27', '2026-10-08')])!.date) === '2026-10-08');
  check('manual gana aunque autoAnchor esté apagado', r([manual('2026-09-27', '2026-09-26')], '2026-09-27', { ...P27, payRules: rules({ autoAnchor: false }) })!.source === 'manual');
  check('clave que no es día de pago -> null', r([], '2026-09-20') === null);
  check('clave inválida -> null', r([], 'xx') === null);
  check('semanal -> null', buildStartResolver({ paymentCycle: 'weekly', paymentDay: 27, paymentDays: [] }, [])('2026-09-27') === null);
  check('irregular -> null', buildStartResolver({ paymentCycle: 'irregular', paymentDay: 27, paymentDays: [] }, [])('2026-09-27') === null);

  // Llegada tarde el 28 sep: el 27 sigue en el período anterior
  withResolver(S, [auto('2026-09-27', '2026-09-28')], () => {
    check('llegada tarde: el 27 sep aún es del período anterior', periodFor(cfg, d(2026, 9, 27)).key === '2026-08-27');
    check('llegada tarde: el 28 sep arranca el nuevo', periodFor(cfg, d(2026, 9, 28)).key === '2026-09-27' && ymd(periodFor(cfg, d(2026, 9, 28)).start) === '2026-09-28');
    check('llegada tarde: el anterior termina el 27', ymd(periodFor(cfg, d(2026, 9, 27)).end) === '2026-09-27');
    check('llegada tarde: origen salary', periodFor(cfg, d(2026, 9, 29)).startSource === 'salary');
  });
  // Manual fuera de tolerancia
  withResolver(S, [manual('2026-09-27', '2026-10-05')], () => {
    check('manual lejano: el 4 oct sigue en el anterior', periodFor(cfg, d(2026, 10, 4)).key === '2026-08-27');
    check('manual lejano: el 5 oct arranca el nuevo', periodFor(cfg, d(2026, 10, 5)).key === '2026-09-27');
  });

  // Helpers de lista
  let list: PeriodAnchor[] = [];
  list = upsertAutoAnchor(list, auto('2026-09-27', '2026-09-25'));
  list = setManualAnchor(list, '2026-09-27', '2026-09-28', '2026-09-26T00:00:00.000Z');
  check('manual y auto conviven', list.length === 2);
  const before = list.length;
  list = upsertAutoAnchor(list, auto('2026-09-27', '2026-09-24'));
  check('upsertAutoAnchor no toca la manual', list.length === before && list.find(a => a.source === 'manual')!.start === '2026-09-28' && list.find(a => a.source === 'auto')!.start === '2026-09-24');
  check('removeAnchorsForTx quita la automática de ese movimiento', removeAnchorsForTx(list, 't_2026-09-27').every(a => a.source === 'manual'));
  check('removeAnchorsForTx no quita la manual', removeAnchorsForTx(list, 't_2026-09-27').length === 1);
  const cleared = clearManualAnchor(list, '2026-09-27');
  check('clearManualAnchor deja la automática', cleared.length === 1 && cleared[0].source === 'auto');
  check('quitar la manual devuelve el control a la automática', ymd(buildStartResolver(S, cleared)('2026-09-27')!.date) === '2026-09-24');
  const replaced = setManualAnchor(list, '2026-09-27', '2026-09-29', 'x');
  check('setManualAnchor reemplaza la manual previa', replaced.filter(a => a.source === 'manual').length === 1 && replaced.find(a => a.source === 'manual')!.start === '2026-09-29');
  let many: PeriodAnchor[] = [];
  for (let i = 0; i < 40; i++) {
    const y = 2024 + Math.floor(i / 12);
    const m = (i % 12) + 1;
    many = upsertAutoAnchor(many, auto(`${y}-${String(m).padStart(2, '0')}-27`, `${y}-${String(m).padStart(2, '0')}-26`));
  }
  check('se recorta a 24 anclajes (los más recientes)', many.length === 24 && many[23].key === '2027-04-27' && many[0].key === '2025-05-27', `${many.length} ${many[0].key}`);
}

// ═════════════ Quincenal 15/30 y feriado 15 sep ═════════════
console.log('Quincenal 15/30');
{
  const S = { ...BW, payRules: rules() };
  const res = buildStartResolver(S, []);
  const fp = (now: Date) => computeFinancialPeriod(S, now, res);
  // Sin resolvedor: igual que siempre
  const base = computeFinancialPeriod(BW, d(2026, 11, 10, 10), null);
  check('sin resolvedor: 30 oct – 14 nov', ymd(base.start) === '2026-10-30' && ymd(base.end) === '2026-11-14', `${ymd(base.start)} ${ymd(base.end)}`);
  check('sin resolvedor: daysTotal 16, daysPassed 12', base.daysTotal === 16 && base.daysPassed === 12, `${base.daysTotal}/${base.daysPassed}`);
  check('sin resolvedor: previo 15 – 29 oct', ymd(base.prevStart) === '2026-10-15' && ymd(base.prevEnd) === '2026-10-29');
  check('sin resolvedor: 5 días al próximo pago', daysUntilNextPay(BW, d(2026, 11, 10, 10), null) === 5);

  const a = fp(d(2026, 9, 14));
  check('15 sep es feriado: la quincena arranca el lunes 14', ymd(a.start) === '2026-09-14' && a.key === '2026-09-15', `${ymd(a.start)} ${a.key}`);
  check('esa quincena termina el 29 sep', ymd(a.end) === '2026-09-29', ymd(a.end));
  check('el 13 sep sigue en la quincena anterior', ymd(fp(d(2026, 9, 13)).end) === '2026-09-13');
  check('la anterior arranca el vie 28 ago (30 ago es domingo)', ymd(fp(d(2026, 9, 13)).start) === '2026-08-28', ymd(fp(d(2026, 9, 13)).start));
  check('previo de la quincena del 14 sep = 28 ago – 13 sep', ymd(a.prevStart) === '2026-08-28' && ymd(a.prevEnd) === '2026-09-13');
  check('30 sep (miércoles) arranca el 30', ymd(fp(d(2026, 9, 30)).start) === '2026-09-30' && fp(d(2026, 9, 30)).startSource === 'nominal');
  check('días al próximo pago desde el 20 sep = 10', daysUntilNextPay(S, d(2026, 9, 20), res) === 10);
  check('días al próximo pago el 14 sep = 16 (hasta el 30)', daysUntilNextPay(S, d(2026, 9, 14), res) === 16);

  // FixedCycle (ancla d1 = 15) con el mismo resolvedor
  setPeriodStartResolver(res);
  const pf = periodFor(fixedCycleConfig(S), d(2026, 9, 14));
  setPeriodStartResolver(null);
  check('periodFor quincenal: clave 2026-09-15 y arranca el 14', pf.key === '2026-09-15' && ymd(pf.start) === '2026-09-14');

  // Ancla automática en la quincena
  const withAuto = buildStartResolver(S, [auto('2026-09-15', '2026-09-16')]);
  check('quincena: sueldo real el 16 sep (dentro de tolerancia)', ymd(computeFinancialPeriod(S, d(2026, 9, 16), withAuto).start) === '2026-09-16');
  check('quincena: el 15 sep todavía es la anterior', ymd(computeFinancialPeriod(S, d(2026, 9, 15), withAuto).end) === '2026-09-15');
}

console.log('Feriado 15 sep con pago mensual día 15');
{
  const S = { paymentCycle: 'monthly' as const, paymentDay: 15, paymentDays: [15, 30], payRules: rules() };
  const fp = computeFinancialPeriod(S, d(2026, 9, 14), buildStartResolver(S, []));
  check('mensual día 15: arranca el 14 sep', ymd(fp.start) === '2026-09-14' && fp.key === '2026-09-15');
  check('mensual día 15: el 13 sep sigue en el anterior', computeFinancialPeriod(S, d(2026, 9, 13), buildStartResolver(S, [])).key === '2026-08-15');
}

// ═════════════ Semanal / irregular ═════════════
console.log('Semanal e irregular');
{
  const wk = computeFinancialPeriod({ paymentCycle: 'weekly', paymentDay: 1, paymentDays: [] }, d(2026, 11, 11), buildStartResolver({ paymentCycle: 'weekly', paymentDay: 1, paymentDays: [] }, []));
  check('semanal: domingo 8 nov – sábado 14 nov', ymd(wk.start) === '2026-11-08' && ymd(wk.end) === '2026-11-14' && wk.daysTotal === 7);
  const ir = computeFinancialPeriod({ paymentCycle: 'irregular', paymentDay: 1, paymentDays: [] }, d(2026, 11, 11), null);
  check('irregular: mes calendario', ymd(ir.start) === '2026-11-01' && ymd(ir.end) === '2026-11-30' && ir.daysTotal === 30);
  check('días al próximo pago: semanal = 7 - día', daysUntilNextPay({ paymentCycle: 'weekly', paymentDay: 1, paymentDays: [] }, d(2026, 11, 11), null) === 7 - d(2026, 11, 11).getDay());
  check('días al próximo pago: irregular = 0', daysUntilNextPay({ paymentCycle: 'irregular', paymentDay: 1, paymentDays: [] }, d(2026, 11, 11), null) === 0);
}

// ═════════════ Mensual sin resolvedor (semántica previa) ═════════════
console.log('Mensual P27 sin resolvedor');
{
  const fp = computeFinancialPeriod(P27, d(2026, 11, 10, 10), null);
  check('27 oct – 26 nov', ymd(fp.start) === '2026-10-27' && ymd(fp.end) === '2026-11-26');
  check('daysTotal 31, daysPassed 15', fp.daysTotal === 31 && fp.daysPassed === 15, `${fp.daysTotal}/${fp.daysPassed}`);
  check('previo 27 sep – 26 oct', ymd(fp.prevStart) === '2026-09-27' && ymd(fp.prevEnd) === '2026-10-26');
  check('startSource nominal y nextStart 27 nov', fp.startSource === 'nominal' && ymd(fp.nextStart) === '2026-11-27');
  check('17 días al próximo pago', daysUntilNextPay(P27, d(2026, 11, 10, 10), null) === 17);
  check('el día de pago el contador salta al siguiente (31)', daysUntilNextPay(P27, d(2026, 10, 27, 8), null) === 31);
  const feb = computeFinancialPeriod({ paymentCycle: 'monthly', paymentDay: 31, paymentDays: [] }, d(2027, 2, 28), null);
  check('día 31 en febrero: arranca el 28 feb', ymd(feb.start) === '2027-02-28');
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
