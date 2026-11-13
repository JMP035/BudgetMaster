// Fechas y rangos de consulta del asistente. Módulo puro: sin react-native, sin AsyncStorage, sin regex
// lookbehind (Hermes), sin Intl ni toLocale*. Recibe texto YA normalizado (Text.normalizeWithMap) y un
// `now` fijo, así que es determinista. Toda fecha se calcula con `new Date(y, m, d, 12)` y se
// formatea con `formatDateOnly`; jamás se usa `new Date('YYYY-MM-DD')` (UTC).
//
// Los índices `start`/`end` son del texto normalizado y `end` es EXCLUSIVO. El tramo devuelto incluye las
// palabras de enlace de la izquierda («para el», «en», «hasta»…) para que el NLU las quite del nombre libre.
import type { AssistantContext, DateRange } from './types';
import { formatDateOnly } from '../DateAmount';
import { fuzzyEq } from './Text';
import { parseSpanishNumber } from './AmountParser';

export const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
/** Abreviaturas para mostrar fechas («27 oct»); fijas, no dependen del locale. */
export const MONTH_ABBR = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
/** Índice = Date.getDay() (0 = domingo). Sin tildes, como llega el texto normalizado. */
export const DAYS = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

const MONTH_ABBREVS: Record<string, number> = Object.assign(Object.create(null), {
  ene: 0, feb: 1, mar: 2, abr: 3, may: 4, jun: 5, jul: 6, ago: 7, sep: 8, sept: 8, set: 8, oct: 9, nov: 10, dic: 11,
});

export interface DateMatch {
  date: string;                              // YYYY-MM-DD
  precision: 'day' | 'month' | 'year';       // month/year → fecha = último día del mes/año
  start: number;
  end: number;                               // exclusivo
}

export type RangeMatch = DateRange & { start_i: number; end_i: number };

// ── Utilidades de calendario ────────────────────────────────────────────────────────────

function noon(y: number, m: number, d: number): Date {
  return new Date(y, m, d, 12);
}

function daysInMonth(y: number, m: number): number {
  return new Date(y, m + 1, 0).getDate();
}

/** Fecha válida al mediodía local, o null si el día no existe (31 de abril, 29 de febrero de 2027). */
function validDate(y: number, m: number, d: number): Date | null {
  if (m < 0 || m > 11 || d < 1) return null;
  const dt = noon(y, m, d);
  return dt.getFullYear() === y && dt.getMonth() === m && dt.getDate() === d ? dt : null;
}

function addDays(dt: Date, n: number): Date {
  return noon(dt.getFullYear(), dt.getMonth(), dt.getDate() + n);
}

/** Suma meses conservando el día y recortándolo al final del mes («31 ene» + 1 mes = «28 feb»). */
function addMonthsClamped(dt: Date, n: number): Date {
  const tm = dt.getMonth() + n;
  const ty = dt.getFullYear() + Math.floor(tm / 12);
  const m = ((tm % 12) + 12) % 12;
  return noon(ty, m, Math.min(dt.getDate(), daysInMonth(ty, m)));
}

function lastDayOf(y: number, m: number): Date {
  return noon(y, m, daysInMonth(y, m));
}

function todayOf(now: Date): Date {
  return noon(now.getFullYear(), now.getMonth(), now.getDate());
}

const ymd = formatDateOnly;

function parseYmd(s: string): Date {
  return noon(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
}

// ── Formato ─────────────────────────────────────────────────────────────────────────────

/** «2027-03-15» → «15 de marzo de 2027». Arreglo de meses fijo. Si no es YYYY-MM-DD devuelve la entrada. */
export function formatDateEs(s: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!m) return s;
  const mi = Number(m[2]) - 1;
  if (mi < 0 || mi > 11) return s;
  return `${Number(m[3])} de ${MONTHS[mi]} de ${m[1]}`;
}

function shortDay(dt: Date, withYear: boolean): string {
  return `${dt.getDate()} ${MONTH_ABBR[dt.getMonth()]}${withYear ? ' ' + dt.getFullYear() : ''}`;
}

/** «12 nov» / «27 oct – 26 nov»; agrega el año si algún extremo no es del año de `now`. */
function rangeLabel(a: Date, b: Date, now: Date): string {
  const ny = now.getFullYear();
  const withYear = a.getFullYear() !== ny || b.getFullYear() !== ny;
  if (a.getTime() === b.getTime()) return shortDay(a, withYear);
  return `${shortDay(a, withYear)} – ${shortDay(b, withYear)}`;
}

function makeRange(kind: DateRange['kind'], a: Date, b: Date, now: Date): DateRange {
  return { kind, start: ymd(a), end: ymd(b), label: rangeLabel(a, b, now) };
}

/** Período de presupuesto actual (`ctx.period`), con las fechas explícitas en la etiqueta. */
export function currentPeriodRange(ctx: Pick<AssistantContext, 'now' | 'period'>): DateRange {
  const a = noon(ctx.period.start.getFullYear(), ctx.period.start.getMonth(), ctx.period.start.getDate());
  const b = noon(ctx.period.end.getFullYear(), ctx.period.end.getMonth(), ctx.period.end.getDate());
  return makeRange('period', a, b, ctx.now);
}

/** Período de presupuesto anterior (`ctx.period.prevStart`–`prevEnd`). */
export function prevPeriodRange(ctx: Pick<AssistantContext, 'now' | 'period'>): DateRange {
  const a = noon(ctx.period.prevStart.getFullYear(), ctx.period.prevStart.getMonth(), ctx.period.prevStart.getDate());
  const b = noon(ctx.period.prevEnd.getFullYear(), ctx.period.prevEnd.getMonth(), ctx.period.prevEnd.getDate());
  return makeRange('prev_period', a, b, ctx.now);
}

// ── Tokens y léxico ─────────────────────────────────────────────────────────────────────

interface Tok { t: string; s: number; e: number }

function scan(norm: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < norm.length) {
    if (norm[i] === ' ') { i++; continue; }
    let j = i;
    while (j < norm.length && norm[j] !== ' ') j++;
    out.push({ t: norm.slice(i, j), s: i, e: j });
    i = j;
  }
  return out;
}

/**
 * Índice de mes (0-11) de una palabra, o -1. Los nombres completos siempre cuentan («setiembre»
 * también). Las abreviaturas solo con `allowAbbr` (hay un día o un año al lado: «mar» suelto es el
 * mar). El parecido ortográfico se limita a meses de 6+ letras y debe ser único (junio≠julio, y
 * «abrir» no es abril).
 */
function monthOf(w: string | undefined, allowAbbr: boolean): number {
  if (w === undefined || w === '') return -1;
  const idx = MONTHS.indexOf(w);
  if (idx >= 0) return idx;
  if (w === 'setiembre') return 8;
  if (allowAbbr && MONTH_ABBREVS[w] !== undefined) return MONTH_ABBREVS[w];
  if (w.length >= 6) {
    let found = -1;
    let count = 0;
    for (let k = 0; k < 12; k++) {
      if (MONTHS[k].length >= 6 && fuzzyEq(w, MONTHS[k])) { found = k; count++; }
    }
    if (count === 1) return found;
  }
  return -1;
}

const TIME_UNITS = [
  'dia', 'dias', 'semana', 'semanas', 'mes', 'meses', 'ano', 'anos', 'quincena', 'quincenas', 'hora', 'horas',
];
/** Detrás de un número que NO lo vuelven fecha: es otra cosa (porcentaje, monto…). */
const NOT_DATE_NEXT = [
  'por', 'quetzal', 'quetzales', 'q', 'qtz', 'vara', 'varas', 'peso', 'pesos', 'dolar', 'dolares', 'usd', 'dls',
  'euro', 'euros', 'libras', 'k', 'mil', 'millon', 'millones', '%',
];
/** Palabras de enlace que se absorben a la izquierda del tramo de fecha. */
const LEADS = ['para', 'el', 'la', 'en', 'hasta', 'dia', 'antes', 'del', 'al', 'este', 'esta', 'a'];

/** Abreviaturas de mes que no son otra palabra: valen solas detrás de «para», «en», «hasta», «de». */
const SAFE_ABBR = ['ene', 'feb', 'abr', 'jun', 'jul', 'oct', 'nov', 'dic', 'sept'];

function isYear(w: string | undefined): boolean {
  return w !== undefined && /^20\d\d$/.test(w);
}

function extendLeft(words: string[], idx: number, extra?: string[]): number {
  while (idx > 0 && (LEADS.indexOf(words[idx - 1]) >= 0 || (extra !== undefined && extra.indexOf(words[idx - 1]) >= 0))) idx--;
  return idx;
}

/** Día del mes en `words[i]`: «15», «1ro», «primero», «quince». */
function dayAt(words: string[], i: number): { day: number; consumed: number } | null {
  const w = words[i];
  if (w === undefined) return null;
  const m = /^(\d{1,2})(?:ro|ero|er|°|º)?$/.exec(w);
  if (m) {
    const d = Number(m[1]);
    return d >= 1 && d <= 31 ? { day: d, consumed: 1 } : null;
  }
  if (w === 'primero' || w === 'primer') return { day: 1, consumed: 1 };
  const r = parseSpanishNumber(words, i);
  if (r && r.value >= 1 && r.value <= 31) return { day: r.value, consumed: r.consumed };
  return null;
}

/** Cantidad «3», «tres», «un» en `words[i]` (1-999). */
function quantityAt(words: string[], i: number): { n: number; consumed: number } | null {
  const w = words[i];
  if (w === undefined) return null;
  if (/^\d{1,3}$/.test(w)) {
    const n = Number(w);
    return n >= 1 ? { n, consumed: 1 } : null;
  }
  const r = parseSpanishNumber(words, i);
  if (r && r.value >= 1 && r.value <= 999) return { n: r.value, consumed: r.consumed };
  return null;
}

type UnitKind = { days: number } | { months: number };

function unitOf(w: string | undefined): UnitKind | null {
  switch (w) {
    case 'dia': case 'dias': return { days: 1 };
    case 'semana': case 'semanas': return { days: 7 };
    case 'mes': case 'meses': return { months: 1 };
    case 'ano': case 'anos': return { months: 12 };
    default: return null;
  }
}

function findPhrase(words: string[], phrases: string[][]): { i: number; len: number } | null {
  for (const ph of phrases) {
    for (let i = 0; i + ph.length <= words.length; i++) {
      let ok = true;
      for (let k = 0; k < ph.length; k++) if (words[i + k] !== ph[k]) { ok = false; break; }
      if (ok) return { i, len: ph.length };
    }
  }
  return null;
}

// ── extractDate ─────────────────────────────────────────────────────────────────────────

interface Ctx {
  toks: Tok[];
  words: string[];
  today: Date;
  dir: 'future' | 'past';
  blocked: boolean[];
}

function mk(c: Ctx, first: number, last: number, dt: Date, precision: DateMatch['precision'], extra?: string[]): DateMatch {
  const f = extendLeft(c.words, first, extra);
  return { date: ymd(dt), precision, start: c.toks[f].s, end: c.toks[last].e };
}

/** Día y mes sin año: próxima ocurrencia (≥ hoy) en `future`, última (≤ hoy) en `past`. */
function resolveDayMonth(c: Ctx, day: number, month: number): Date | null {
  const ny = c.today.getFullYear();
  const t = c.today.getTime();
  if (c.dir === 'future') {
    for (let y = ny; y <= ny + 8; y++) {
      const dt = validDate(y, month, day);
      if (dt && dt.getTime() >= t) return dt;
    }
  } else {
    for (let y = ny; y >= ny - 8; y--) {
      const dt = validDate(y, month, day);
      if (dt && dt.getTime() <= t) return dt;
    }
  }
  return null;
}

/** Día suelto («el 30»): este mes si cae después de hoy (future) o hasta hoy (past); si no, el contiguo. */
function resolveBareDay(c: Ctx, day: number): Date {
  const y = c.today.getFullYear();
  const m = c.today.getMonth();
  const clampIn = (yy: number, mm: number): Date => noon(yy, mm, Math.min(day, daysInMonth(yy, mm)));
  if (c.dir === 'future') {
    const thisMonth = clampIn(y, m);
    if (thisMonth.getTime() > c.today.getTime()) return thisMonth;
    const nx = addMonthsClamped(noon(y, m, 1), 1);
    return clampIn(nx.getFullYear(), nx.getMonth());
  }
  const thisMonth = clampIn(y, m);
  if (thisMonth.getTime() <= c.today.getTime()) return thisMonth;
  const pv = addMonthsClamped(noon(y, m, 1), -1);
  return clampIn(pv.getFullYear(), pv.getMonth());
}

const ISO_RE = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;
const SEP3_RE = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})$/;
const SLASH2_RE = /^(\d{1,2})\/(\d{1,2})$/;

function mNumeric(c: Ctx): DateMatch | null {
  for (let i = 0; i < c.words.length; i++) {
    const w = c.words[i];
    let day = -1;
    let month = -1;
    let year = -1;
    let m = ISO_RE.exec(w);
    if (m) { year = Number(m[1]); month = Number(m[2]) - 1; day = Number(m[3]); }
    else if ((m = SEP3_RE.exec(w))) {
      day = Number(m[1]); month = Number(m[2]) - 1;
      year = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    } else if ((m = SLASH2_RE.exec(w))) { day = Number(m[1]); month = Number(m[2]) - 1; }
    else continue;
    const dt = year >= 0 ? validDate(year, month, day) : resolveDayMonth(c, day, month);
    if (dt) return mk(c, i, i, dt, 'day');
  }
  return null;
}

/** «15 de marzo [de 2027]», «15 marzo», «marzo 15», «quince de marzo», «1ro de mayo». */
function mDayMonth(c: Ctx): DateMatch | null {
  const w = c.words;
  const n = w.length;
  for (let i = 0; i < n; i++) {
    if (c.blocked[i]) continue;
    const yearAfter = (k: number): { year: number; last: number } | null => {
      if ((w[k] === 'de' || w[k] === 'del') && isYear(w[k + 1])) return { year: Number(w[k + 1]), last: k + 1 };
      if (isYear(w[k])) return { year: Number(w[k]), last: k };
      return null;
    };

    // día primero
    const d = dayAt(w, i);
    if (d) {
      let j = i + d.consumed;
      if (w[j] === 'de') j++;
      const mi = monthOf(w[j], true);
      if (mi >= 0) {
        const y = yearAfter(j + 1);
        const last = y ? y.last : j;
        const dt = y ? validDate(y.year, mi, d.day) : resolveDayMonth(c, d.day, mi);
        if (dt) return mk(c, i, last, dt, 'day');
        for (let k = i; k <= last; k++) c.blocked[k] = true;   // fecha inexistente: que no la reinterprete otro patrón
        continue;
      }
    }

    // mes primero («marzo 15»)
    const mi2 = monthOf(w[i], true);
    if (mi2 >= 0 && i + 1 < n) {
      const dn = /^(\d{1,2})(?:ro|ero|er|°|º)?$/.exec(w[i + 1]);
      if (dn) {
        const day = Number(dn[1]);
        const after = w[i + 2];
        const abbrevOnly = MONTHS.indexOf(w[i]) < 0 && w[i] !== 'setiembre' && monthOf(w[i], false) < 0;
        if (abbrevOnly && after !== undefined && (TIME_UNITS.indexOf(after) >= 0 || NOT_DATE_NEXT.indexOf(after) >= 0 || after === 'veces')) continue;
        if (day >= 1 && day <= 31) {
          const y = yearAfter(i + 2);
          const last = y ? y.last : i + 1;
          const dt = y ? validDate(y.year, mi2, day) : resolveDayMonth(c, day, mi2);
          if (dt) return mk(c, i, last, dt, 'day');
          for (let k = i; k <= last; k++) c.blocked[k] = true;
        }
      }
    }
  }
  return null;
}

/** «diciembre 2027», «marzo de 2028», «dic 2027» → último día de ese mes, precisión mes. */
function mMonthYear(c: Ctx): DateMatch | null {
  const w = c.words;
  for (let i = 0; i < w.length; i++) {
    if (c.blocked[i]) continue;
    let yk = -1;
    if (isYear(w[i + 1])) yk = i + 1;
    else if ((w[i + 1] === 'de' || w[i + 1] === 'del') && isYear(w[i + 2])) yk = i + 2;
    if (yk < 0) continue;
    const mi = monthOf(w[i], true);
    if (mi < 0) continue;
    return mk(c, i, yk, lastDayOf(Number(w[yk]), mi), 'month', ['mes']);
  }
  return null;
}

/** «en 3 meses», «dentro de 6 meses», «en un año», «en dos semanas», «hace 3 días». */
function mRelativeQty(c: Ctx): DateMatch | null {
  const w = c.words;
  for (let i = 0; i < w.length; i++) {
    let sign = 1;
    let numIdx = -1;
    if (w[i] === 'en') numIdx = i + 1;
    else if (w[i] === 'dentro' && w[i + 1] === 'de') numIdx = i + 2;
    else if (w[i] === 'hace') { sign = -1; numIdx = i + 1; }
    else continue;
    const q = quantityAt(w, numIdx);
    if (!q) continue;
    const u = unitOf(w[numIdx + q.consumed]);
    if (!u) continue;
    const dt = 'days' in u
      ? addDays(c.today, sign * q.n * u.days)
      : addMonthsClamped(c.today, sign * q.n * u.months);
    return mk(c, i, numIdx + q.consumed, dt, 'day');
  }
  return null;
}

const FIN_MES = [
  ['fin', 'de', 'mes'], ['fin', 'del', 'mes'], ['final', 'de', 'mes'], ['final', 'del', 'mes'],
  ['finales', 'de', 'mes'], ['finales', 'del', 'mes'], ['ultimo', 'dia', 'del', 'mes'], ['ultimo', 'dia', 'de', 'mes'],
];
const FIN_ANO = [
  ['fin', 'de', 'ano'], ['fin', 'del', 'ano'], ['final', 'de', 'ano'], ['final', 'del', 'ano'],
  ['finales', 'de', 'ano'], ['finales', 'del', 'ano'],
];

/** «fin de mes», «fin de año», «navidad», «nochebuena», «año nuevo». */
function mNamed(c: Ctx): DateMatch | null {
  const y = c.today.getFullYear();
  const m = c.today.getMonth();
  const t = c.today.getTime();

  const fm = findPhrase(c.words, FIN_MES);
  if (fm) {
    let dt = lastDayOf(y, m);
    if (c.dir === 'past' && dt.getTime() !== t) dt = lastDayOf(addMonthsClamped(noon(y, m, 1), -1).getFullYear(), addMonthsClamped(noon(y, m, 1), -1).getMonth());
    return mk(c, fm.i, fm.i + fm.len - 1, dt, 'day');
  }
  const fy = findPhrase(c.words, FIN_ANO);
  if (fy) {
    let dt = noon(y, 11, 31);
    if (c.dir === 'future' && dt.getTime() === t) dt = noon(y + 1, 11, 31);
    if (c.dir === 'past' && dt.getTime() !== t) dt = noon(y - 1, 11, 31);
    return mk(c, fy.i, fy.i + fy.len - 1, dt, 'day');
  }
  const nv = findPhrase(c.words, [['navidad']]);
  if (nv) {
    const dt = resolveDayMonth(c, 25, 11);
    if (dt) return mk(c, nv.i, nv.i, dt, 'day');
  }
  const nb = findPhrase(c.words, [['nochebuena']]);
  if (nb) {
    const dt = resolveDayMonth(c, 24, 11);
    if (dt) return mk(c, nb.i, nb.i, dt, 'day');
  }
  const an = findPhrase(c.words, [['ano', 'nuevo']]);
  if (an) {
    const dt = resolveDayMonth(c, 1, 0);
    if (dt) return mk(c, an.i, an.i + 1, dt, 'day');
  }
  return null;
}

/** «hoy», «ayer», «anteayer», «mañana», «pasado mañana», «próximo mes», «próxima semana», «año que viene». */
function mRelativeWords(c: Ctx): DateMatch | null {
  const w = c.words;
  const today = c.today;
  const y = today.getFullYear();
  const m = today.getMonth();

  const nextMonth = findPhrase(w, [['proximo', 'mes'], ['siguiente', 'mes'], ['mes', 'siguiente'], ['mes', 'que', 'viene'], ['mes', 'proximo']]);
  if (nextMonth) {
    const nm = addMonthsClamped(noon(y, m, 1), 1);
    return mk(c, nextMonth.i, nextMonth.i + nextMonth.len - 1, lastDayOf(nm.getFullYear(), nm.getMonth()), 'month');
  }
  const nextYear = findPhrase(w, [['proximo', 'ano'], ['siguiente', 'ano'], ['ano', 'siguiente'], ['ano', 'que', 'viene'], ['ano', 'proximo']]);
  if (nextYear) return mk(c, nextYear.i, nextYear.i + nextYear.len - 1, noon(y + 1, 11, 31), 'year');
  const nextWeek = findPhrase(w, [['proxima', 'semana'], ['siguiente', 'semana'], ['semana', 'siguiente'], ['semana', 'que', 'viene'], ['semana', 'proxima']]);
  if (nextWeek) return mk(c, nextWeek.i, nextWeek.i + nextWeek.len - 1, addDays(today, 7), 'day');

  const sets: { phrases: string[][]; delta: number }[] = [
    { phrases: [['antes', 'de', 'ayer'], ['anteayer'], ['antier']], delta: -2 },
    { phrases: [['pasado', 'manana']], delta: 2 },
    { phrases: [['hoy']], delta: 0 },
    { phrases: [['ayer']], delta: -1 },
  ];
  for (const s of sets) {
    const f = findPhrase(w, s.phrases);
    if (f) return mk(c, f.i, f.i + f.len - 1, addDays(today, s.delta), 'day');
  }
  // «mañana» = día siguiente, salvo «esta mañana» / «por la mañana»
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== 'manana') continue;
    const p = w[i - 1];
    if (p === 'la' || p === 'esta' || p === 'por') continue;
    return mk(c, i, i, addDays(today, 1), 'day');
  }
  return null;
}

/** «próximo viernes», «el viernes», «el lunes pasado», «viernes que viene». */
function mWeekday(c: Ctx): DateMatch | null {
  const w = c.words;
  for (let i = 0; i < w.length; i++) {
    const dow = DAYS.indexOf(w[i]);
    if (dow < 0) continue;
    let mode: 'f' | 'p' | null = null;
    let last = i;
    const prev = w[i - 1];
    const next = w[i + 1];
    if (next === 'pasado' || next === 'anterior') { mode = 'p'; last = i + 1; }
    else if (next === 'proximo') { mode = 'f'; last = i + 1; }
    else if (next === 'que' && w[i + 2] === 'viene') { mode = 'f'; last = i + 2; }
    if (prev === 'proximo') mode = 'f';
    else if (prev === 'pasado' || prev === 'ultimo' || prev === 'anterior') mode = 'p';
    if (mode === null) mode = c.dir === 'future' ? 'f' : 'p';
    const cur = c.today.getDay();
    const delta = mode === 'f' ? ((dow - cur + 7) % 7) || 7 : -(((cur - dow + 7) % 7) || 7);
    return mk(c, i, last, addDays(c.today, delta), 'day', ['proximo', 'pasado', 'ultimo', 'anterior']);
  }
  return null;
}

/** «para 2028», «en el 2028», «año 2028» → 31 de diciembre, precisión año. */
function mYearOnly(c: Ctx): DateMatch | null {
  const w = c.words;
  const ny = c.today.getFullYear();
  for (let i = 0; i < w.length; i++) {
    if (c.blocked[i] || !isYear(w[i])) continue;
    let lead = i - 1;
    if (w[lead] === 'el') lead--;
    if (lead < 0 || ['para', 'en', 'ano', 'hasta'].indexOf(w[lead]) < 0) continue;
    const next = w[i + 1];
    if (next !== undefined && (NOT_DATE_NEXT.indexOf(next) >= 0 || TIME_UNITS.indexOf(next) >= 0)) continue;
    const y = Number(w[i]);
    if (c.dir === 'future' ? y < ny : y > ny) continue;
    const dt = c.dir === 'past' && y === ny ? c.today : noon(y, 11, 31);
    return mk(c, i, i, dt, 'year', ['ano']);
  }
  return null;
}

/** «para diciembre», «en octubre», «el mes de marzo» → último día del mes, precisión mes. */
function mMonthOnly(c: Ctx): DateMatch | null {
  const w = c.words;
  const ny = c.today.getFullYear();
  const cm = c.today.getMonth();
  for (let i = 0; i < w.length; i++) {
    if (c.blocked[i]) continue;
    let mi = monthOf(w[i], false);
    if (mi < 0 && SAFE_ABBR.indexOf(w[i]) >= 0 && ['para', 'en', 'hasta', 'de'].indexOf(w[i - 1]) >= 0) mi = MONTH_ABBREVS[w[i]];
    if (mi < 0) continue;
    let dt: Date;
    if (c.dir === 'future') {
      dt = lastDayOf(ny, mi);
      if (dt.getTime() < c.today.getTime()) dt = lastDayOf(ny + 1, mi);
    } else {
      const y = mi > cm ? ny - 1 : ny;
      dt = y === ny && mi === cm ? c.today : lastDayOf(y, mi);
    }
    let first = i;
    if (w[i - 1] === 'de' && w[i - 2] === 'mes') first = i - 2;
    else if (w[i - 1] === 'mes') first = i - 1;
    return mk(c, first, i, dt, 'month');
  }
  return null;
}

/** «el 30», «para el 5», «el día 15» (con `el`/`día` delante) → según la dirección. */
function mDayOnly(c: Ctx): DateMatch | null {
  const w = c.words;
  for (let i = 1; i < w.length; i++) {
    if (c.blocked[i]) continue;
    if (w[i - 1] !== 'el' && w[i - 1] !== 'dia') continue;
    const d = dayAt(w, i);
    if (!d) continue;
    const next = w[i + d.consumed];
    if (next !== undefined && (TIME_UNITS.indexOf(next) >= 0 || NOT_DATE_NEXT.indexOf(next) >= 0)) continue;
    return mk(c, i, i + d.consumed - 1, resolveBareDay(c, d.day), 'day');
  }
  return null;
}

const DATE_MATCHERS: ((c: Ctx) => DateMatch | null)[] = [
  mNumeric, mDayMonth, mMonthYear, mRelativeQty, mNamed, mRelativeWords, mWeekday, mYearOnly, mMonthOnly, mDayOnly,
];

/**
 * Primera fecha del texto normalizado. `future` para metas («para diciembre»), `past` para movimientos
 * («ayer», «el lunes»). Con año explícito se respeta; sin él se toma la próxima (future) o la última
 * (past) ocurrencia. Devuelve null si no hay fecha o si es inexistente (31 de abril).
 */
export function extractDate(norm: string, now: Date, direction: 'future' | 'past'): DateMatch | null {
  const toks = scan(norm);
  if (toks.length === 0) return null;
  const c: Ctx = { toks, words: toks.map(x => x.t), today: todayOf(now), dir: direction, blocked: toks.map(() => false) };
  for (const f of DATE_MATCHERS) {
    const r = f(c);
    if (r) return r;
  }
  return null;
}

// ── extractDayOfMonth (día de cobro / de pago) ──────────────────────────────────────────

/**
 * Día del mes que se repite: «el 15 de cada mes», «cada 15», «día 30», «los 5», «a fin de mes» (= 31).
 * No toma fechas completas («el 15 de marzo») ni plazos («cada 15 días»).
 */
export function extractDayOfMonth(norm: string): { day: number; start: number; end: number } | null {
  const toks = scan(norm);
  const w = toks.map(x => x.t);

  for (let i = 0; i < w.length; i++) {
    const d = dayAt(w, i);
    if (!d) continue;
    const prev = w[i - 1];
    const next = w[i + d.consumed];
    const next2 = w[i + d.consumed + 1];
    const next3 = w[i + d.consumed + 2];
    const hasLead = prev === 'el' || prev === 'dia' || prev === 'los' || prev === 'cada';
    const everyMonth = (next === 'de' && next2 === 'cada' && next3 === 'mes') || (next === 'cada' && next2 === 'mes');
    if (!hasLead && !everyMonth) continue;
    if (next === 'de' && monthOf(next2, true) >= 0) continue;                  // «el 15 de marzo»: es una fecha
    if (next !== undefined && (TIME_UNITS.indexOf(next) >= 0 || NOT_DATE_NEXT.indexOf(next) >= 0)) continue;
    let first = hasLead ? i - 1 : i;
    while (first > 0 && ['el', 'dia', 'los', 'todos', 'cada', 'para', 'a', 'al'].indexOf(w[first - 1]) >= 0) first--;
    let last = i + d.consumed - 1;
    if (next === 'de' && next2 === 'cada' && next3 === 'mes') last += 3;
    else if (next === 'cada' && next2 === 'mes') last += 2;
    return { day: d.day, start: toks[first].s, end: toks[last].e };
  }

  const fm = findPhrase(w, FIN_MES);
  if (fm) {
    let first = fm.i;
    while (first > 0 && ['a', 'al', 'cada', 'el', 'para'].indexOf(w[first - 1]) >= 0) first--;
    return { day: 31, start: toks[first].s, end: toks[fm.i + fm.len - 1].e };
  }
  return null;
}

// ── extractRange (consultas) ────────────────────────────────────────────────────────────

interface Endpoint { day: number; month: number; year: number; hadEl: boolean; next: number }

function parseEndpoint(w: string[], k: number): Endpoint | null {
  let i = k;
  let hadEl = false;
  if (w[i] === 'el') { hadEl = true; i++; }
  if (w[i] === 'dia') i++;
  const d = dayAt(w, i);
  if (!d) return null;
  i += d.consumed;
  let month = -1;
  let year = -1;
  let j = i;
  if (w[j] === 'de') j++;
  const mi = monthOf(w[j], true);
  if (mi >= 0) {
    month = mi;
    i = j + 1;
    let y = i;
    if (w[y] === 'de' || w[y] === 'del') y++;
    if (isYear(w[y])) { year = Number(w[y]); i = y + 1; }
  }
  return { day: d.day, month, year, hadEl, next: i };
}

interface RCtx { toks: Tok[]; words: string[]; today: Date; now: Date }

function rk(r: RCtx, first: number, last: number, kind: DateRange['kind'], a: Date, b: Date, extra?: string[]): RangeMatch {
  const f = extendLeft(r.words, first, extra);
  return { ...makeRange(kind, a, b, r.now), start_i: r.toks[f].s, end_i: r.toks[last].e };
}

const RANGE_LEADS = ['durante', 'los', 'las', 'de', 'del', 'en', 'pasada', 'pasado', 'anterior'];

/** «del 5 al 20 de octubre», «del 5 de oct al 3 de nov», «entre el 5 y el 20 de octubre». */
function rExplicit(r: RCtx): RangeMatch | null {
  const w = r.words;
  const ny = r.today.getFullYear();
  const cm = r.today.getMonth();
  for (let i = 0; i < w.length; i++) {
    const lead = w[i];
    if (lead !== 'del' && lead !== 'de' && lead !== 'desde' && lead !== 'entre') continue;
    const e1 = parseEndpoint(w, i + 1);
    if (!e1) continue;
    const conn = w[e1.next];
    if (conn !== 'al' && conn !== 'a' && conn !== 'hasta' && conn !== 'y') continue;
    const e2 = parseEndpoint(w, e1.next + 1);
    if (!e2) continue;
    if (e1.month < 0 && e2.month < 0 && !e1.hadEl && !e2.hadEl && lead !== 'del' && lead !== 'desde') continue;   // «de 5 a 10» son montos

    let m2 = e2.month >= 0 ? e2.month : (e1.month >= 0 ? e1.month : cm);
    let m1 = e1.month >= 0 ? e1.month : (e1.day > e2.day ? m2 - 1 : m2);
    let y2 = e2.year >= 0 ? e2.year : (e1.year >= 0 ? e1.year : ny);
    let y1 = e1.year >= 0 ? e1.year : y2;
    if (e1.year < 0 && m1 > m2) y1 = y2 - 1;
    if (m1 < 0) { m1 += 12; y1--; }
    let a = validDate(y1, m1, e1.day);
    let b = validDate(y2, m2, e2.day);
    if (a && b && e1.year < 0 && e2.year < 0 && a.getTime() > r.today.getTime()) {
      // sin año y todavía en el futuro: es la ocurrencia del año anterior
      a = validDate(y1 - 1, m1, e1.day);
      b = validDate(y2 - 1, m2, e2.day);
    }
    if (!a || !b || a.getTime() > b.getTime()) continue;
    return rk(r, i, e2.next - 1, 'custom', a, b);
  }
  return null;
}

/** «desde el 1 de octubre», «desde octubre», «desde el 15 hasta hoy» → hasta hoy. */
function rSince(r: RCtx): RangeMatch | null {
  const w = r.words;
  const ny = r.today.getFullYear();
  const cm = r.today.getMonth();
  const t = r.today.getTime();
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== 'desde') continue;
    let k = i + 1;
    if (w[k] === 'el') k++;
    let a: Date | null = null;
    let last: number;
    const mi = monthOf(w[k], false);
    if (mi >= 0 && dayAt(w, k) === null) {
      // «desde octubre»
      let y = ny;
      last = k;
      if (isYear(w[k + 1])) { y = Number(w[k + 1]); last = k + 1; }
      else if (mi > cm) y = ny - 1;
      a = noon(y, mi, 1);
    } else {
      const e = parseEndpoint(w, i + 1);
      if (!e) continue;
      last = e.next - 1;
      if (e.month >= 0) {
        const y = e.year >= 0 ? e.year : ny;
        a = validDate(y, e.month, e.day);
        if (a && e.year < 0 && a.getTime() > t) a = validDate(y - 1, e.month, e.day);
      } else {
        a = validDate(ny, cm, Math.min(e.day, daysInMonth(ny, cm)));
        if (a && a.getTime() > t) {
          const pv = addMonthsClamped(noon(ny, cm, 1), -1);
          a = validDate(pv.getFullYear(), pv.getMonth(), Math.min(e.day, daysInMonth(pv.getFullYear(), pv.getMonth())));
        }
      }
    }
    if (!a || a.getTime() > t) continue;
    if (w[last + 1] === 'hasta' && w[last + 2] === 'hoy') last += 2;
    return rk(r, i, last, 'custom', a, r.today);
  }
  return null;
}

/** «últimos 30 días», «últimas 2 semanas», «últimos tres meses», «último mes»: N hacia atrás, hoy incluido. */
function rLast(r: RCtx): RangeMatch | null {
  const w = r.words;
  for (let i = 0; i < w.length; i++) {
    let n = -1;
    let unitIdx = -1;
    if (w[i] === 'ultimos' || w[i] === 'ultimas' || w[i] === 'pasados' || w[i] === 'pasadas') {
      const q = quantityAt(w, i + 1);
      if (!q) continue;
      n = q.n;
      unitIdx = i + 1 + q.consumed;
    } else if ((w[i] === 'ultimo' || w[i] === 'ultima') && (w[i + 1] === 'mes' || w[i + 1] === 'semana' || w[i + 1] === 'ano')) {
      n = 1;
      unitIdx = i + 1;
    } else continue;
    const u = unitOf(w[unitIdx]);
    if (!u) continue;
    const a = 'days' in u
      ? addDays(r.today, -(n * u.days - 1))
      : addDays(addMonthsClamped(r.today, -n * u.months), 1);
    return rk(r, i, unitIdx, 'custom', a, r.today, RANGE_LEADS);
  }
  return null;
}

const PREV_MODS = ['anterior', 'pasado', 'pasada', 'previo', 'previa'];

/** «este período», «esta quincena», «este ciclo», «período anterior», «quincena pasada». */
function rPeriod(r: RCtx, ctx: Pick<AssistantContext, 'now' | 'period'>): RangeMatch | null {
  const w = r.words;
  for (let i = 0; i < w.length; i++) {
    const t = w[i];
    const isNoun = t === 'ciclo' || (t.length >= 6 && (fuzzyEq(t, 'periodo') || fuzzyEq(t, 'quincena')));
    if (!isNoun) continue;
    const prev = w[i - 1];
    const next = w[i + 1];
    const isPrev = PREV_MODS.indexOf(next) >= 0 || PREV_MODS.indexOf(prev) >= 0;
    let last = i;
    if (next !== undefined && (PREV_MODS.indexOf(next) >= 0 || next === 'actual' || next === 'presente')) last = i + 1;
    const range = isPrev ? prevPeriodRange(ctx) : currentPeriodRange(ctx);
    const f = extendLeft(w, i, PREV_MODS);
    return { ...range, start_i: r.toks[f].s, end_i: r.toks[last].e };
  }
  return null;
}

function mondayOf(today: Date): Date {
  return addDays(today, -((today.getDay() + 6) % 7));
}

/** «esta semana» (lunes → hoy), «semana pasada» (lunes a domingo anteriores). */
function rWeek(r: RCtx): RangeMatch | null {
  const w = r.words;
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== 'semana') continue;
    const prev = w[i - 1];
    const next = w[i + 1];
    const monday = mondayOf(r.today);
    if (next === 'pasada' || next === 'anterior' || prev === 'pasada' || prev === 'anterior') {
      const last = next === 'pasada' || next === 'anterior' ? i + 1 : i;
      return rk(r, i, last, 'custom', addDays(monday, -7), addDays(monday, -1), PREV_MODS);
    }
    if (prev === 'esta' || next === 'actual') {
      return rk(r, i, next === 'actual' ? i + 1 : i, 'custom', monday, r.today);
    }
  }
  return null;
}

/** «este mes» (1 → hoy, calendario), «mes pasado» (mes calendario anterior, completo). */
function rMonth(r: RCtx): RangeMatch | null {
  const w = r.words;
  const y = r.today.getFullYear();
  const m = r.today.getMonth();
  for (let i = 0; i < w.length; i++) {
    if (w[i] !== 'mes') continue;
    const prev = w[i - 1];
    const next = w[i + 1];
    if (next === 'de') continue;
    if (next === 'pasado' || next === 'anterior' || prev === 'pasado' || prev === 'anterior') {
      const pv = addMonthsClamped(noon(y, m, 1), -1);
      const last = next === 'pasado' || next === 'anterior' ? i + 1 : i;
      return rk(r, i, last, 'custom', noon(pv.getFullYear(), pv.getMonth(), 1), lastDayOf(pv.getFullYear(), pv.getMonth()), PREV_MODS);
    }
    if (prev === 'este' || next === 'actual') {
      return rk(r, i, next === 'actual' ? i + 1 : i, 'custom', noon(y, m, 1), r.today);
    }
  }
  return null;
}

/** «este año», «año pasado», «en 2025». */
function rYear(r: RCtx): RangeMatch | null {
  const w = r.words;
  const y = r.today.getFullYear();
  for (let i = 0; i < w.length; i++) {
    if (w[i] === 'ano') {
      const prev = w[i - 1];
      const next = w[i + 1];
      if (next === 'pasado' || next === 'anterior' || prev === 'pasado' || prev === 'anterior') {
        const last = next === 'pasado' || next === 'anterior' ? i + 1 : i;
        return rk(r, i, last, 'custom', noon(y - 1, 0, 1), noon(y - 1, 11, 31), PREV_MODS);
      }
      if (prev === 'este' || next === 'actual') {
        return rk(r, i, next === 'actual' ? i + 1 : i, 'custom', noon(y, 0, 1), r.today);
      }
    }
    if (isYear(w[i]) && i > 0 && ['en', 'del', 'de', 'ano', 'durante'].indexOf(w[i - 1]) >= 0) {
      const yy = Number(w[i]);
      if (yy > y) continue;
      if (i > 1 && monthOf(w[i - 2], true) >= 0) continue;                   // «octubre de 2025» es un mes
      return rk(r, i, i, 'custom', noon(yy, 0, 1), yy === y ? r.today : noon(yy, 11, 31), ['ano']);
    }
  }
  return null;
}

/**
 * Rango de consulta dentro del texto normalizado, o null si no hay (el llamador usa entonces
 * `currentPeriodRange`). `start_i`/`end_i` (end exclusivo) marcan el tramo consumido. Etiquetas con
 * fechas explícitas («27 oct – 26 nov»). «Este mes» es el mes CALENDARIO, no el período.
 */
export function extractRange(norm: string, ctx: Pick<AssistantContext, 'now' | 'period'>): RangeMatch | null {
  const toks = scan(norm);
  if (toks.length === 0) return null;
  const today = todayOf(ctx.now);
  const r: RCtx = { toks, words: toks.map(x => x.t), today, now: ctx.now };

  const direct = rExplicit(r) || rSince(r) || rLast(r) || rPeriod(r, ctx) || rWeek(r) || rMonth(r) || rYear(r);
  if (direct) return direct;

  // Un día suelto o un mes con nombre: se apoya en extractDate (pasado).
  const d = extractDate(norm, ctx.now, 'past');
  if (!d) return null;
  const dt = parseYmd(d.date);
  if (d.precision === 'day') {
    if (dt.getTime() > today.getTime()) return null;
    return { ...makeRange('custom', dt, dt, ctx.now), start_i: d.start, end_i: d.end };
  }
  if (d.precision === 'month') {
    const a = noon(dt.getFullYear(), dt.getMonth(), 1);
    return { ...makeRange('custom', a, lastDayOf(dt.getFullYear(), dt.getMonth()), ctx.now), start_i: d.start, end_i: d.end };
  }
  return { ...makeRange('custom', noon(dt.getFullYear(), 0, 1), noon(dt.getFullYear(), 11, 31), ctx.now), start_i: d.start, end_i: d.end };
}
