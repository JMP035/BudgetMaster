// Período financiero (módulo PURO, sin react-native ni AsyncStorage): el período de presupuesto según el
// ciclo de pago, con el INICIO REAL del período (día en que cae el sueldo) cuando hay un resolvedor.
// storage.ts delega aquí (getCurrentFinancialPeriod / getDaysUntilNextPayment).
import { effectiveDay, fixedCycleConfig, periodForWith } from './FixedCycle';
import type { PeriodStartResolver, StartSource } from './FixedCycle';
import type { UserSettings } from './storage';

export interface FinancialPeriod {
  start: Date;
  end: Date;
  label: string;        // Ej: "15 May – 14 Jun 2026"
  prevStart: Date;
  prevEnd: Date;
  prevLabel: string;    // Ej: "15 Abr – 14 May 2026"
  daysPassed: number;   // Días transcurridos en el período actual
  daysTotal: number;    // Duración total del período en días
  /** Clave del período = inicio NOMINAL ('YYYY-MM-DD'); no cambia aunque el inicio real se mueva. */
  key: string;
  /** Día de pago nominal con el que arranca el período. */
  nominalStart: Date;
  /** De dónde sale `start`: ancla manual, sueldo real, fecha esperada por regla o el día nominal. */
  startSource: StartSource;
  /** Inicio (efectivo) del período siguiente. */
  nextStart: Date;
}

/** `paymentWeekday` (0=dom..6=sáb) solo lo usa el ciclo semanal; si falta se toma domingo. */
type CycleSettings = Pick<UserSettings, 'paymentCycle' | 'paymentDay' | 'paymentDays'> & { paymentWeekday?: number };

/** Día de la semana válido (entero 0..6, 0 = domingo); cualquier otro valor cae a 0. */
export function normalizeWeekday(n: unknown): number {
  return typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 6 ? n : 0;
}

/** Días transcurridos desde el último día de pago semanal (0 = hoy es el día de pago). */
function weeklyOffset(settings: CycleSettings, now: Date): number {
  return (now.getDay() - normalizeWeekday(settings.paymentWeekday) + 7) % 7;
}

const fmt_d = (d: Date) =>
  d.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function dayNumOf(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** Último instante (23:59:59) del día anterior a la fecha dada */
function dayBefore(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 23, 59, 59);
}

/** Calcula el período financiero actual y el anterior según el ciclo de pago. */
export function computeFinancialPeriod(
  settings: CycleSettings,
  now: Date,
  resolve: PeriodStartResolver | null,
): FinancialPeriod {
  const today = now.getDate();
  const m = now.getMonth();
  const y = now.getFullYear();
  // Medianoche de "hoy" en hora local — se usa para contar días transcurridos
  // sin que el resultado cambie según la hora del día en que se consulte.
  const todayMidnight = new Date(y, m, today);

  // ── Ciclo irregular → usa mes calendario ────────────────────
  if (settings.paymentCycle === 'irregular') {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0, 23, 59, 59);
    const prevStart = new Date(y, m - 1, 1);
    const prevEnd = new Date(y, m, 0, 23, 59, 59);
    return {
      start, end, label: fmt_d(start) + ' – ' + fmt_d(end),
      prevStart, prevEnd, prevLabel: fmt_d(prevStart) + ' – ' + fmt_d(prevEnd),
      daysPassed: today, daysTotal: new Date(y, m + 1, 0).getDate(),
      key: ymdKey(start), nominalStart: start, startSource: 'nominal', nextStart: new Date(y, m + 1, 1),
    };
  }

  // ── Ciclo semanal ────────────────────────────────────────────
  // La semana arranca el día de la semana en que le pagan (`paymentWeekday`, domingo por defecto). El motor
  // de anclas (PeriodAnchors) NO cubre este ciclo a propósito: el pago semanal casi nunca depende de
  // feriados ni de tolerancia, y anclar 52 períodos al año complicaría las claves. La clave es el inicio.
  if (settings.paymentCycle === 'weekly') {
    const dayOfWeek = weeklyOffset(settings, now); // días desde el último día de pago
    const start = new Date(now); start.setDate(today - dayOfWeek); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59);
    const prevStart = new Date(start); prevStart.setDate(start.getDate() - 7);
    const prevEnd = new Date(start); prevEnd.setDate(start.getDate() - 1); prevEnd.setHours(23, 59, 59);
    const nextStart = new Date(start); nextStart.setDate(start.getDate() + 7);
    return {
      start, end, label: fmt_d(start) + ' – ' + fmt_d(end),
      prevStart, prevEnd, prevLabel: fmt_d(prevStart) + ' – ' + fmt_d(prevEnd),
      daysPassed: dayOfWeek + 1, daysTotal: 7,
      key: ymdKey(start), nominalStart: start, startSource: 'nominal', nextStart,
    };
  }

  let start: Date, end: Date, prevStart: Date, prevEnd: Date, nextStart: Date;
  let key: string, nominalStart: Date, startSource: StartSource;

  if (settings.paymentCycle === 'biweekly') {
    // ── Ciclo quincenal: fronteras d1/d2 de cada mes, cada una con su inicio efectivo ──
    const days = [...settings.paymentDays].sort((a, b) => a - b); // Ej: [15, 30]
    const d1 = days[0] ?? 15;
    const d2 = days[1] ?? 30;
    const nominals: Date[] = [];
    for (let mo = m - 2; mo <= m + 2; mo++) {
      const ref = new Date(y, mo, 1);
      for (const d of [d1, d2]) {
        const dt = new Date(ref.getFullYear(), ref.getMonth(), effectiveDay(d, ref.getFullYear(), ref.getMonth()));
        if (!nominals.some(n => dayNumOf(n) === dayNumOf(dt))) nominals.push(dt);
      }
    }
    nominals.sort((a, b) => a.getTime() - b.getTime());
    const effs = nominals.map(n => {
      const r = resolve ? resolve(ymdKey(n)) : null;
      return r
        ? { start: new Date(r.date.getFullYear(), r.date.getMonth(), r.date.getDate()), source: r.source }
        : { start: n, source: 'nominal' as StartSource };
    });
    const todayNum = dayNumOf(todayMidnight);
    let idx = 1;
    for (let i = 1; i < nominals.length - 1; i++) if (dayNumOf(effs[i].start) <= todayNum) idx = i;
    start = effs[idx].start;
    nextStart = effs[idx + 1].start;
    if (dayNumOf(nextStart) <= dayNumOf(start)) nextStart = nominals[idx + 1];
    prevStart = effs[idx - 1].start;
    key = ymdKey(nominals[idx]);
    nominalStart = nominals[idx];
    startSource = effs[idx].source;
  } else {
    // ── Ciclo mensual (default) ──────────────────────────────────
    const cfg = fixedCycleConfig(settings);
    const p = periodForWith(cfg, now, resolve);
    start = p.start;
    nextStart = p.nextStart ?? new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate() + 1);
    const prev = periodForWith(cfg, new Date(start.getFullYear(), start.getMonth(), start.getDate() - 1, 12), resolve);
    prevStart = prev.start;
    key = p.key;
    nominalStart = p.nominalStart ?? start;
    startSource = p.startSource ?? 'nominal';
  }
  end = dayBefore(nextStart);
  prevEnd = dayBefore(start);

  // `end` ya incluye el día completo (23:59:59), y `daysPassed` usa la medianoche de hoy para no
  // saltar un día de más pasado el mediodía.
  const daysTotal = Math.round((end.getTime() - start.getTime()) / 86400000);
  const daysPassed = Math.min(Math.floor((todayMidnight.getTime() - start.getTime()) / 86400000) + 1, daysTotal);

  return {
    start, end, label: fmt_d(start) + ' – ' + fmt_d(end),
    prevStart, prevEnd, prevLabel: fmt_d(prevStart) + ' – ' + fmt_d(prevEnd),
    daysPassed, daysTotal, key, nominalStart, startSource, nextStart,
  };
}

/**
 * Días hasta el próximo pago. Con ciclo irregular no hay fecha de cobro: devuelve 0 (no significa «hoy cobras»;
 * para mostrarlo usa `hasPayDate` y, en su lugar, `daysLeftInPeriod`).
 */
export function daysUntilNextPay(
  settings: CycleSettings,
  now: Date,
  resolve: PeriodStartResolver | null,
): number {
  if (settings.paymentCycle === 'weekly') return 7 - weeklyOffset(settings, now);
  if (settings.paymentCycle === 'monthly' || settings.paymentCycle === 'biweekly') {
    const fp = computeFinancialPeriod(settings, now, resolve);
    return dayNumOf(fp.nextStart) - dayNumOf(now);
  }
  return 0;
}

/** true si el ciclo tiene una fecha de cobro que contar (mensual, quincenal o semanal); el irregular no la tiene. */
export function hasPayDate(settings: Pick<CycleSettings, 'paymentCycle'>): boolean {
  return settings.paymentCycle !== 'irregular';
}

/**
 * Días que le quedan al período actual. Con ciclo mensual, quincenal o semanal es lo mismo que los días al próximo pago;
 * con ciclo irregular (mes calendario) son los días hasta el primero del mes siguiente. Nunca es menor que 1.
 */
export function daysLeftInPeriod(
  settings: CycleSettings,
  now: Date,
  resolve: PeriodStartResolver | null,
): number {
  if (hasPayDate(settings)) return Math.max(1, daysUntilNextPay(settings, now, resolve));
  const fp = computeFinancialPeriod(settings, now, resolve);
  return Math.max(1, dayNumOf(fp.nextStart) - dayNumOf(now));
}
