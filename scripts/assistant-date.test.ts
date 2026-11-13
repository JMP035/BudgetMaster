process.env.TZ = 'America/Guatemala';
// Pruebas de fechas y rangos de consulta del asistente (services/assistant/DateParser.ts). Sin dependencias:
//   npm run test:assistant-date   →   sucrase-node scripts/assistant-date.test.ts
// Fecha fija: jueves 12 de noviembre de 2026. Período mensual con día de pago 27: 27 oct – 26 nov.

import {
  currentPeriodRange, extractDate, extractDayOfMonth, extractRange, formatDateEs, prevPeriodRange,
} from '../services/assistant/DateParser';
import { normalizeWithMap } from '../services/assistant/Text';
import type { AssistantContext } from '../services/assistant/types';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const NOW = new Date(2026, 10, 12, 10, 0);
const CTX: Pick<AssistantContext, 'now' | 'period'> = {
  now: NOW,
  period: {
    start: new Date(2026, 9, 27, 0, 0, 0), end: new Date(2026, 10, 26, 23, 59, 59),
    prevStart: new Date(2026, 8, 27, 0, 0, 0), prevEnd: new Date(2026, 9, 26, 23, 59, 59),
    label: '27 oct – 26 nov',
  },
};

const norm = (raw: string) => normalizeWithMap(raw).norm;

function date(raw: string, dir: 'future' | 'past', now: Date = NOW): string {
  const r = extractDate(norm(raw), now, dir);
  return r ? `${r.date}|${r.precision}` : 'null';
}

function expectFuture(raw: string, expected: string): void {
  const got = date(raw, 'future');
  check(`futuro «${raw}»`, got === expected, `esperado ${expected}, obtenido ${got}`);
}
function expectPast(raw: string, expected: string): void {
  const got = date(raw, 'past');
  check(`pasado «${raw}»`, got === expected, `esperado ${expected}, obtenido ${got}`);
}

// ── Absolutas ──
expectFuture('15 de marzo', '2027-03-15|day');
expectFuture('15 marzo', '2027-03-15|day');
expectFuture('marzo 15', '2027-03-15|day');
expectFuture('15 DE MARZO', '2027-03-15|day');
expectFuture('15 de marzo de 2028', '2028-03-15|day');
expectFuture('15 de marzo del 2027', '2027-03-15|day');
expectFuture('15 de marzo 2027', '2027-03-15|day');
expectFuture('15/03', '2027-03-15|day');
expectFuture('15-03-2027', '2027-03-15|day');
expectFuture('15/3/27', '2027-03-15|day');
expectFuture('15/03/27', '2027-03-15|day');
expectFuture('15.03.2027', '2027-03-15|day');
expectFuture('2027-03-15', '2027-03-15|day');
expectFuture('12 de noviembre', '2026-11-12|day');       // hoy cuenta
expectFuture('11 de noviembre', '2027-11-11|day');       // ayer ya pasó → el próximo año
expectFuture('31 de enero', '2027-01-31|day');
expectFuture('15 mar', '2027-03-15|day');
expectFuture('15 de dic', '2026-12-15|day');
expectFuture('3 ene', '2027-01-03|day');
expectFuture('5 de setiembre', '2027-09-05|day');
expectFuture('5 de septiembre', '2027-09-05|day');
expectFuture('primero de enero', '2027-01-01|day');
expectFuture('1ro de enero', '2027-01-01|day');
expectFuture('quince de marzo', '2027-03-15|day');
expectFuture('veinte de mayo', '2027-05-20|day');
expectFuture('15 de dicimbre', '2026-12-15|day');          // errata
expectFuture('15 de novimbre', '2026-11-15|day');          // errata
expectFuture('para dic', '2026-12-31|month');
expectFuture('meta para dic', '2026-12-31|month');
expectFuture('en ene', '2027-01-31|month');
expectFuture('voy al mar 5 veces', 'null');
expectFuture('mar 15', '2027-03-15|day');
expectFuture('para mar', 'null');

// ── Bisiestos y fechas inexistentes ──
expectFuture('29 de febrero', '2028-02-29|day');
expectFuture('29 de febrero de 2028', '2028-02-29|day');
expectFuture('29 de febrero de 2027', 'null');
expectFuture('31 de abril', 'null');
expectFuture('30 de febrero', 'null');
expectFuture('31/02', 'null');
expectFuture('15/13', 'null');

// ── Mes y año ──
expectFuture('diciembre 2027', '2027-12-31|month');
expectFuture('diciembre de 2027', '2027-12-31|month');
expectFuture('febrero 2028', '2028-02-29|month');
expectFuture('para diciembre', '2026-12-31|month');
expectFuture('en diciembre', '2026-12-31|month');
expectFuture('para noviembre', '2026-11-30|month');        // mes en curso
expectFuture('para octubre', '2027-10-31|month');
expectFuture('para el mes de marzo', '2027-03-31|month');
expectFuture('para 2028', '2028-12-31|year');
expectFuture('en el 2028', '2028-12-31|year');

// ── Día suelto ──
expectFuture('el 30', '2026-11-30|day');
expectFuture('para el 5', '2026-12-05|day');
expectFuture('el 12', '2026-12-12|day');                   // hoy no cuenta como futuro
expectFuture('el 31', '2026-11-30|day');                   // se recorta al último día real
expectFuture('dia 15', '2026-11-15|day');
expectFuture('el dia 15', '2026-11-15|day');
expectFuture('el quince', '2026-11-15|day');
expectFuture('el 15 por ciento', 'null');

// ── Relativas ──
expectFuture('en 3 meses', '2027-02-12|day');
expectFuture('dentro de 6 meses', '2027-05-12|day');
expectFuture('en un año', '2027-11-12|day');
expectFuture('en dos semanas', '2026-11-26|day');
expectFuture('en 10 dias', '2026-11-22|day');
expectFuture('dentro de tres meses', '2027-02-12|day');
expectFuture('mañana', '2026-11-13|day');
expectFuture('pasado mañana', '2026-11-14|day');
expectFuture('hoy', '2026-11-12|day');
expectFuture('ayer', '2026-11-11|day');
expectFuture('anteayer', '2026-11-10|day');
expectFuture('antier', '2026-11-10|day');
expectFuture('antes de ayer', '2026-11-10|day');
expectFuture('esta mañana', 'null');
expectFuture('próximo mes', '2026-12-31|month');
expectFuture('el mes que viene', '2026-12-31|month');
expectFuture('próxima semana', '2026-11-19|day');
expectFuture('el año que viene', '2027-12-31|year');

// ── Nombradas ──
expectFuture('fin de mes', '2026-11-30|day');
expectFuture('a fin de mes', '2026-11-30|day');
expectFuture('fin de año', '2026-12-31|day');
expectFuture('final del año', '2026-12-31|day');
expectFuture('navidad', '2026-12-25|day');
expectFuture('nochebuena', '2026-12-24|day');
expectFuture('año nuevo', '2027-01-01|day');

// ── Días de la semana ──
expectFuture('próximo viernes', '2026-11-13|day');
expectFuture('el viernes', '2026-11-13|day');
expectFuture('el jueves', '2026-11-19|day');               // hoy es jueves: el siguiente
expectFuture('el miércoles', '2026-11-18|day');
expectFuture('el sabado', '2026-11-14|day');
expectFuture('el domingo', '2026-11-15|day');
expectFuture('viernes que viene', '2026-11-13|day');
expectFuture('el viernes pasado', '2026-11-06|day');

// ── Hacia el pasado ──
expectPast('el lunes', '2026-11-09|day');
expectPast('el jueves', '2026-11-05|day');
expectPast('el domingo', '2026-11-08|day');
expectPast('15 de marzo', '2026-03-15|day');
expectPast('15 de diciembre', '2025-12-15|day');
expectPast('12 de noviembre', '2026-11-12|day');
expectPast('el 30', '2026-10-30|day');
expectPast('el 5', '2026-11-05|day');
expectPast('el 12', '2026-11-12|day');
expectPast('en octubre', '2026-10-31|month');
expectPast('en noviembre', '2026-11-12|month');
expectPast('en diciembre', '2025-12-31|month');
expectPast('hace 3 dias', '2026-11-09|day');
expectPast('hace dos semanas', '2026-10-29|day');
expectPast('hace un mes', '2026-10-12|day');
expectPast('ayer', '2026-11-11|day');
expectPast('fin de mes', '2026-10-31|day');
expectPast('navidad', '2025-12-25|day');

// ── Cambios de mes y de año con otro «ahora» ──
check('31 ene + 1 mes = 28 feb', date('en un mes', 'future', new Date(2027, 0, 31, 9)) === '2027-02-28|day');
check('31 ene + 1 mes en bisiesto = 29 feb', date('en un mes', 'future', new Date(2028, 0, 31, 9)) === '2028-02-29|day');
check('fin de año el 31 dic → el del año siguiente', date('fin de año', 'future', new Date(2026, 11, 31, 9)) === '2027-12-31|day');
check('31 oct + 4 meses = 28 feb', date('en 4 meses', 'future', new Date(2026, 9, 31, 9)) === '2027-02-28|day');
check('el 30 el 31 de enero → 30 ene del mes siguiente', date('el 30', 'future', new Date(2027, 0, 30, 9)) === '2027-02-28|day');
check('"el 15" el 20 de diciembre → enero', date('el 15', 'future', new Date(2026, 11, 20, 9)) === '2027-01-15|day');
check('"el 25" el 5 de enero, pasado → diciembre', date('el 25', 'past', new Date(2027, 0, 5, 9)) === '2026-12-25|day');
check('hoy a medianoche no cambia el día', date('hoy', 'future', new Date(2026, 10, 12, 0, 0)) === '2026-11-12|day');
check('hoy a las 23:59 no cambia el día', date('hoy', 'future', new Date(2026, 10, 12, 23, 59)) === '2026-11-12|day');

// ── Sin fecha ──
expectFuture('hola', 'null');
expectFuture('ahorrar 5000', 'null');
expectFuture('quiero abrir una cuenta', 'null');            // «abrir» no es abril
expectFuture('', 'null');

// ── Tramos (start / end exclusivo, con las palabras de enlace) ──
{
  const n = norm('ahorrar 5000 para el 15 de marzo');
  const r = extractDate(n, NOW, 'future');
  check('tramo «para el 15 de marzo»', !!r && n.slice(r.start, r.end) === 'para el 15 de marzo', r ? n.slice(r.start, r.end) : 'null');
}
{
  const n = norm('meta laptop para diciembre');
  const r = extractDate(n, NOW, 'future');
  check('tramo «para diciembre»', !!r && n.slice(r.start, r.end) === 'para diciembre', r ? n.slice(r.start, r.end) : 'null');
}
{
  const n = norm('compra de 200 ayer en el super');
  const r = extractDate(n, NOW, 'past');
  check('tramo «ayer»', !!r && n.slice(r.start, r.end) === 'ayer', r ? n.slice(r.start, r.end) : 'null');
}
{
  const n = norm('dentro de 6 meses');
  const r = extractDate(n, NOW, 'future');
  check('tramo «dentro de 6 meses»', !!r && n.slice(r.start, r.end) === 'dentro de 6 meses');
}
{
  const n = norm('el proximo viernes');
  const r = extractDate(n, NOW, 'future');
  check('tramo «el proximo viernes»', !!r && n.slice(r.start, r.end) === 'el proximo viernes', r ? n.slice(r.start, r.end) : 'null');
}

// ── extractDayOfMonth (día de cobro / de pago) ──
function dom(raw: string): string {
  const n = norm(raw);
  const r = extractDayOfMonth(n);
  return r ? `${r.day}|${n.slice(r.start, r.end)}` : 'null';
}
function expectDom(raw: string, expected: string): void {
  const got = dom(raw);
  check(`día de cobro «${raw}»`, got === expected, `esperado ${expected}, obtenido ${got}`);
}
expectDom('el 15 de cada mes', '15|el 15 de cada mes');
expectDom('cada 15', '15|cada 15');
expectDom('dia 30', '30|dia 30');
expectDom('los 5', '5|los 5');
expectDom('todos los 20', '20|todos los 20');
expectDom('15 de cada mes', '15|15 de cada mes');
expectDom('a fin de mes', '31|a fin de mes');
expectDom('fin de mes', '31|fin de mes');
expectDom('netflix 150 el 5', '5|el 5');
expectDom('pago el quince', '15|el quince');
expectDom('el 31', '31|el 31');
expectDom('el dia 28 de cada mes', '28|el dia 28 de cada mes');
expectDom('el 15 de marzo', 'null');
expectDom('cada 15 dias', 'null');
expectDom('ahorrar 500', 'null');
expectDom('dia 32', 'null');
expectDom('el 0', 'null');
expectDom('el 15 por ciento', 'null');

// ── formatDateEs ──
check('formatDateEs 2027-03-15', formatDateEs('2027-03-15') === '15 de marzo de 2027');
check('formatDateEs sin cero inicial', formatDateEs('2026-01-05') === '5 de enero de 2026');
check('formatDateEs diciembre', formatDateEs('2026-12-31') === '31 de diciembre de 2026');
check('formatDateEs septiembre', formatDateEs('2026-09-01') === '1 de septiembre de 2026');
check('formatDateEs inválida', formatDateEs('hola') === 'hola' && formatDateEs('2026-13-01') === '2026-13-01');

// ── Período de presupuesto ──
{
  const cur = currentPeriodRange(CTX);
  check('período actual', cur.kind === 'period' && cur.start === '2026-10-27' && cur.end === '2026-11-26' && cur.label === '27 oct – 26 nov', JSON.stringify(cur));
  const prev = prevPeriodRange(CTX);
  check('período anterior', prev.kind === 'prev_period' && prev.start === '2026-09-27' && prev.end === '2026-10-26' && prev.label === '27 sep – 26 oct', JSON.stringify(prev));
}

// ── Rangos de consulta ──
function range(raw: string, ctx: Pick<AssistantContext, 'now' | 'period'> = CTX): string {
  const r = extractRange(norm(raw), ctx);
  return r ? `${r.kind}|${r.start}|${r.end}` : 'null';
}
function expectRange(raw: string, expected: string): void {
  const got = range(raw);
  check(`rango «${raw}»`, got === expected, `esperado ${expected}, obtenido ${got}`);
}

expectRange('este periodo', 'period|2026-10-27|2026-11-26');
expectRange('este período', 'period|2026-10-27|2026-11-26');
expectRange('esta quincena', 'period|2026-10-27|2026-11-26');
expectRange('este ciclo', 'period|2026-10-27|2026-11-26');
expectRange('el periodo actual', 'period|2026-10-27|2026-11-26');
expectRange('cuanto llevo en el periodo', 'period|2026-10-27|2026-11-26');
expectRange('este perido', 'period|2026-10-27|2026-11-26');      // errata
expectRange('periodo anterior', 'prev_period|2026-09-27|2026-10-26');
expectRange('periodo pasado', 'prev_period|2026-09-27|2026-10-26');
expectRange('la quincena pasada', 'prev_period|2026-09-27|2026-10-26');
expectRange('ciclo anterior', 'prev_period|2026-09-27|2026-10-26');
expectRange('hoy', 'custom|2026-11-12|2026-11-12');
expectRange('HOY', 'custom|2026-11-12|2026-11-12');
expectRange('ayer', 'custom|2026-11-11|2026-11-11');
expectRange('anteayer', 'custom|2026-11-10|2026-11-10');
expectRange('esta semana', 'custom|2026-11-09|2026-11-12');
expectRange('semana pasada', 'custom|2026-11-02|2026-11-08');
expectRange('la semana pasada', 'custom|2026-11-02|2026-11-08');
expectRange('este mes', 'custom|2026-11-01|2026-11-12');
expectRange('el mes pasado', 'custom|2026-10-01|2026-10-31');
expectRange('mes anterior', 'custom|2026-10-01|2026-10-31');
expectRange('este año', 'custom|2026-01-01|2026-11-12');
expectRange('el año pasado', 'custom|2025-01-01|2025-12-31');
expectRange('ultimos 30 dias', 'custom|2026-10-14|2026-11-12');
expectRange('los últimos 7 días', 'custom|2026-11-06|2026-11-12');
expectRange('ultimas 2 semanas', 'custom|2026-10-30|2026-11-12');
expectRange('ultimos 3 meses', 'custom|2026-08-13|2026-11-12');
expectRange('ultimos tres meses', 'custom|2026-08-13|2026-11-12');
expectRange('ultimo mes', 'custom|2026-10-13|2026-11-12');
expectRange('en octubre', 'custom|2026-10-01|2026-10-31');
expectRange('de octubre', 'custom|2026-10-01|2026-10-31');
expectRange('octubre', 'custom|2026-10-01|2026-10-31');
expectRange('en el mes de septiembre', 'custom|2026-09-01|2026-09-30');
expectRange('en noviembre', 'custom|2026-11-01|2026-11-30');
expectRange('en diciembre', 'custom|2025-12-01|2025-12-31');       // futuro → el del año anterior
expectRange('octubre 2025', 'custom|2025-10-01|2025-10-31');
expectRange('febrero de 2024', 'custom|2024-02-01|2024-02-29');
expectRange('en 2025', 'custom|2025-01-01|2025-12-31');
expectRange('desde el 1 de octubre', 'custom|2026-10-01|2026-11-12');
expectRange('desde octubre', 'custom|2026-10-01|2026-11-12');
expectRange('desde el 1 de octubre hasta hoy', 'custom|2026-10-01|2026-11-12');
expectRange('desde el 5', 'custom|2026-11-05|2026-11-12');
expectRange('desde el 20', 'custom|2026-10-20|2026-11-12');
expectRange('del 5 al 20 de octubre', 'custom|2026-10-05|2026-10-20');
expectRange('del 5 de octubre al 3 de noviembre', 'custom|2026-10-05|2026-11-03');
expectRange('entre el 5 y el 20 de octubre', 'custom|2026-10-05|2026-10-20');
expectRange('del 20 de diciembre al 5 de enero', 'custom|2025-12-20|2026-01-05');
expectRange('del 5 al 20', 'custom|2026-11-05|2026-11-20');
expectRange('desde el 5 hasta el 10 de octubre', 'custom|2026-10-05|2026-10-10');
expectRange('el 5 de octubre', 'custom|2026-10-05|2026-10-05');
expectRange('el 15', 'custom|2026-10-15|2026-10-15');
expectRange('el lunes', 'custom|2026-11-09|2026-11-09');
expectRange('hace 3 dias', 'custom|2026-11-09|2026-11-09');
expectRange('gaste en comida', 'null');
expectRange('mañana', 'null');
expectRange('cuanto gaste de 5 a 10 quetzales', 'null');
expectRange('', 'null');

// ── Etiquetas con fechas explícitas ──
function label(raw: string): string {
  const r = extractRange(norm(raw), CTX);
  return r ? r.label : 'null';
}
check('etiqueta período', label('este periodo') === '27 oct – 26 nov', label('este periodo'));
check('etiqueta período anterior', label('periodo anterior') === '27 sep – 26 oct', label('periodo anterior'));
check('etiqueta hoy', label('hoy') === '12 nov', label('hoy'));
check('etiqueta este mes', label('este mes') === '1 nov – 12 nov', label('este mes'));
check('etiqueta semana pasada', label('semana pasada') === '2 nov – 8 nov', label('semana pasada'));
check('etiqueta año pasado con año', label('año pasado') === '1 ene 2025 – 31 dic 2025', label('año pasado'));
check('etiqueta rango entre años', label('del 20 de diciembre al 5 de enero') === '20 dic 2025 – 5 ene 2026', label('del 20 de diciembre al 5 de enero'));

// ── Tramos de los rangos ──
function rangeSpan(raw: string): string {
  const n = norm(raw);
  const r = extractRange(n, CTX);
  return r ? n.slice(r.start_i, r.end_i) : 'null';
}
check('tramo «hoy»', rangeSpan('cuanto gaste en comida hoy') === 'hoy', rangeSpan('cuanto gaste en comida hoy'));
check('tramo «este mes»', rangeSpan('cuanto gaste este mes en comida') === 'este mes', rangeSpan('cuanto gaste este mes en comida'));
check('tramo «la semana pasada»', rangeSpan('gastos de la semana pasada') === 'la semana pasada', rangeSpan('gastos de la semana pasada'));
check('tramo «periodo anterior»', rangeSpan('compara con el periodo anterior') === 'el periodo anterior', rangeSpan('compara con el periodo anterior'));
check('tramo «de los ultimos 30 dias»', rangeSpan('gastos de los ultimos 30 dias') === 'de los ultimos 30 dias', rangeSpan('gastos de los ultimos 30 dias'));
check('tramo «del 5 al 20 de octubre»', rangeSpan('gastos del 5 al 20 de octubre en comida') === 'del 5 al 20 de octubre', rangeSpan('gastos del 5 al 20 de octubre en comida'));
check('tramo «desde el 1 de octubre hasta hoy»', rangeSpan('gastos desde el 1 de octubre hasta hoy') === 'desde el 1 de octubre hasta hoy', rangeSpan('gastos desde el 1 de octubre hasta hoy'));
check('tramo «en octubre»', rangeSpan('cuanto gaste en octubre en comida') === 'en octubre', rangeSpan('cuanto gaste en octubre en comida'));

// ── Otros ciclos de pago: «este período» sigue a ctx.period ──
{
  const weekly: Pick<AssistantContext, 'now' | 'period'> = {
    now: NOW,
    period: {
      start: new Date(2026, 10, 8, 0, 0, 0), end: new Date(2026, 10, 14, 23, 59, 59),
      prevStart: new Date(2026, 10, 1, 0, 0, 0), prevEnd: new Date(2026, 10, 7, 23, 59, 59), label: '8 nov – 14 nov',
    },
  };
  check('período semanal', range('este periodo', weekly) === 'period|2026-11-08|2026-11-14', range('este periodo', weekly));
  check('período semanal anterior', range('periodo anterior', weekly) === 'prev_period|2026-11-01|2026-11-07', range('periodo anterior', weekly));
  const irregular: Pick<AssistantContext, 'now' | 'period'> = {
    now: NOW,
    period: {
      start: new Date(2026, 10, 1, 0, 0, 0), end: new Date(2026, 10, 30, 23, 59, 59),
      prevStart: new Date(2026, 9, 1, 0, 0, 0), prevEnd: new Date(2026, 9, 31, 23, 59, 59), label: '1 nov – 30 nov',
    },
  };
  check('período calendario', range('esta quincena', irregular) === 'period|2026-11-01|2026-11-30', range('esta quincena', irregular));
  // un domingo: la semana va de lunes a hoy
  const sunday: Pick<AssistantContext, 'now' | 'period'> = { ...CTX, now: new Date(2026, 10, 15, 10, 0) };
  check('esta semana un domingo', range('esta semana', sunday) === 'custom|2026-11-09|2026-11-15', range('esta semana', sunday));
  const monday: Pick<AssistantContext, 'now' | 'period'> = { ...CTX, now: new Date(2026, 10, 9, 10, 0) };
  check('esta semana un lunes', range('esta semana', monday) === 'custom|2026-11-09|2026-11-09', range('esta semana', monday));
  check('semana pasada un lunes', range('semana pasada', monday) === 'custom|2026-11-02|2026-11-08', range('semana pasada', monday));
  const jan: Pick<AssistantContext, 'now' | 'period'> = { ...CTX, now: new Date(2027, 0, 10, 10, 0) };
  check('mes pasado en enero → diciembre', range('mes pasado', jan) === 'custom|2026-12-01|2026-12-31', range('mes pasado', jan));
  check('ultimos 3 meses cruzando año', range('ultimos 3 meses', jan) === 'custom|2026-10-11|2027-01-10', range('ultimos 3 meses', jan));
  check('en diciembre estando en enero → mismo diciembre', range('en diciembre', jan) === 'custom|2026-12-01|2026-12-31', range('en diciembre', jan));
}

console.log(`${checks} comprobaciones, ${failures} fallas`);
if (failures > 0) process.exit(1);
