// Calendario de pago (módulo PURO, sin react-native ni AsyncStorage): reglas de fin de semana y
// feriados de Guatemala para saber qué día cae de verdad un sueldo cuyo día nominal es sábado,
// domingo o feriado. Fechas locales a las 12:00 (sin desfase de zona).

/** Qué hacer cuando el día de pago cae en fin de semana o feriado. */
export type WeekendRule = 'prev_business' | 'next_business' | 'exact';

export interface PayRules {
  /** 'prev_business': el día hábil anterior; 'next_business': el siguiente; 'exact': no se mueve. */
  weekendRule: WeekendRule;
  /** Contar los feriados de Guatemala como días no hábiles. */
  holidays: boolean;
  /** Máximo de días (0..7) que el pago esperado puede alejarse del día nominal. */
  toleranceDays: number;
  /** Anclar el inicio del período al sueldo real detectado (el manual siempre gana). */
  autoAnchor: boolean;
}

export const DEFAULT_PAY_RULES: PayRules = {
  weekendRule: 'prev_business',
  holidays: true,
  toleranceDays: 3,
  autoAnchor: true,
};

/** Reglas válidas a partir de un valor guardado (tolera datos viejos o incompletos). */
export function sanitizePayRules(raw: unknown): PayRules {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<PayRules>;
  const weekendRule: WeekendRule =
    r.weekendRule === 'next_business' || r.weekendRule === 'exact' || r.weekendRule === 'prev_business'
      ? r.weekendRule : DEFAULT_PAY_RULES.weekendRule;
  const tol = Number(r.toleranceDays);
  return {
    weekendRule,
    holidays: typeof r.holidays === 'boolean' ? r.holidays : DEFAULT_PAY_RULES.holidays,
    toleranceDays: Number.isFinite(tol) ? Math.min(7, Math.max(0, Math.round(tol))) : DEFAULT_PAY_RULES.toleranceDays,
    autoAnchor: typeof r.autoAnchor === 'boolean' ? r.autoAnchor : DEFAULT_PAY_RULES.autoAnchor,
  };
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM-DD' en hora local. */
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** Date local a las 12:00 de una 'YYYY-MM-DD'; null si no es válida. */
export function parseYmd(s: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const y = Number(s.slice(0, 4));
  const m = Number(s.slice(5, 7));
  const d = Number(s.slice(8, 10));
  const dt = new Date(y, m - 1, d, 12, 0, 0, 0);
  if (dt.getFullYear() !== y || dt.getMonth() !== m - 1 || dt.getDate() !== d) return null;
  return dt;
}

/** Domingo de Pascua (algoritmo anónimo gregoriano / Gauss): mes 1..12 y día. */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** Feriados de Guatemala del año como 'YYYY-MM-DD' (fijos más Jueves y Viernes Santo). */
export function gtHolidays(year: number): string[] {
  const fixed = ['01-01', '05-01', '06-30', '09-15', '10-20', '11-01', '12-25'].map(md => `${year}-${md}`);
  const e = easterSunday(year);
  const thursday = new Date(year, e.month - 1, e.day - 3, 12, 0, 0, 0);
  const friday = new Date(year, e.month - 1, e.day - 2, 12, 0, 0, 0);
  return [...fixed, ymd(thursday), ymd(friday)].sort();
}

const holidayCache: Record<number, string[]> = {};

function isHoliday(d: Date): boolean {
  const y = d.getFullYear();
  if (!holidayCache[y]) holidayCache[y] = gtHolidays(y);
  return holidayCache[y].indexOf(ymd(d)) >= 0;
}

/** ¿Es un día no hábil (sábado, domingo o, si `holidays`, feriado)? */
export function isNonBusinessDay(d: Date, holidays: boolean): boolean {
  const wd = d.getDay();
  if (wd === 0 || wd === 6) return true;
  return holidays && isHoliday(d);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0, 0);
}

function dayNum(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/**
 * Día en que se espera de verdad el pago nominal `date`: si cae en fin de semana o feriado se mueve al
 * día hábil anterior/siguiente según la regla, y el resultado se recorta a ±toleranceDays (máx. 7) del
 * día nominal. 'exact' no mueve nada. Devuelve un Date local a las 12:00.
 */
export function adjustPayDate(date: Date, rules: PayRules): Date {
  const nominal = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 12, 0, 0, 0);
  if (rules.weekendRule === 'exact') return nominal;
  const step = rules.weekendRule === 'next_business' ? 1 : -1;
  const tol = Math.min(7, Math.max(0, Math.round(Number.isFinite(rules.toleranceDays) ? rules.toleranceDays : 0)));
  let cur = nominal;
  for (let i = 0; i < 15 && isNonBusinessDay(cur, rules.holidays); i++) cur = addDays(cur, step);
  const delta = dayNum(cur) - dayNum(nominal);
  if (delta > tol) return addDays(nominal, tol);
  if (delta < -tol) return addDays(nominal, -tol);
  return cur;
}
