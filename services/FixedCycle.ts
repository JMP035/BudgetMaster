// Ciclo de los gastos fijos = PERÍODO DE PRESUPUESTO (módulo PURO). Sin react-native ni
// AsyncStorage: de ./storage solo `import type`.
//
// Un período es una ventana mensual anclada al día de pago (con paymentDay = 27: del 27 de octubre
// al 26 de noviembre). Cada gasto fijo vence UNA vez por período y cada movimiento pertenece al
// período de SU fecha. Así el SMS del 28 de octubre y el registro manual del 10 de noviembre de un
// gasto del día 28 caen en el mismo período y se fusionan.
//
// La clave de un período es la fecha de inicio ('YYYY-MM-DD', hora local). Los datos de formato
// viejo ('YYYY-MM', mes calendario) se toleran y se convierten con `normalizeCycleKey`.
import type { FixedExpense, UserSettings } from './storage';

/** Prefijo del id del movimiento manual que crea "marcar pagado": `fe_tx_<gastoId>_<clave del período>`. */
export const FE_TX_PREFIX = 'fe_tx_';

const FE_TX_ID_RE = /^fe_tx_(.+?)(?:_\d{4}-\d{2}(?:-\d{2})?(?:_\d+)?)?$/;
const FE_TX_CYCLE_RE = /^fe_tx_.+?_(\d{4}-\d{2}(?:-\d{2})?)(?:_\d+)?$/;
const DATE_ONLY_RE = /^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/;
const KEY_DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const KEY_MONTH_RE = /^\d{4}-\d{2}$/;

/** Configuración del período: día (1..31) en que arranca; se recorta al largo de cada mes. */
export interface FixedCycleConfig { anchorDay: number; }

/** Mes calendario (período que arranca el día 1). */
export const CALENDAR_CYCLE: FixedCycleConfig = { anchorDay: 1 };

/** De dónde sale el inicio efectivo de un período: ancla manual, sueldo real, fecha esperada por regla o el día nominal. */
export type StartSource = 'manual' | 'salary' | 'expected' | 'nominal';

/**
 * Inicio efectivo de un período dada su clave NOMINAL ('YYYY-MM-DD' del día de pago). null = sin ajuste
 * (el período arranca el día nominal). Lo arma services/PeriodAnchors.buildStartResolver.
 */
export type PeriodStartResolver = (nominalKey: string) => { date: Date; source: StartSource } | null;

/**
 * Período de presupuesto: `start` 00:00:00.000 local; `end` 23:59:59.999 del día anterior al próximo inicio.
 * `key` es SIEMPRE el inicio nominal (no cambia aunque el inicio real se mueva por fin de semana o sueldo
 * adelantado/atrasado); `start` es el inicio efectivo.
 */
export interface FixedPeriod {
  key: string; start: Date; end: Date;
  nominalStart?: Date; startSource?: StartSource; nextStart?: Date;
}

let startResolver: PeriodStartResolver | null = null;

/** Fija (o quita) el resolvedor global del inicio real del período. Sin resolvedor todo es nominal. */
export function setPeriodStartResolver(fn: PeriodStartResolver | null): void {
  startResolver = fn;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'YYYY-MM' en hora local. */
export function monthKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}`;
}

function ymdKey(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Fecha local de un valor guardado. Un valor solo-fecha (o medianoche UTC, como lo guardan algunas
 * pantallas) ya ES ese día: se devuelve ese día local a las 12:00. El resto es new Date(stored).
 * Misma regla que storedDateToDateOnly (storage.ts), copiada para no importar AsyncStorage.
 */
export function storedToLocalDate(stored: string): Date | null {
  if (DATE_ONLY_RE.test(stored)) {
    const y = Number(stored.slice(0, 4));
    const m = Number(stored.slice(5, 7));
    const d = Number(stored.slice(8, 10));
    return new Date(y, m - 1, d, 12, 0, 0, 0);
  }
  const dt = new Date(stored);
  return isNaN(dt.getTime()) ? null : dt;
}

function daysInMonthOf(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Día de pago recortado al largo real del mes (copia de getEffectivePaymentDay de storage). */
export function effectiveDay(day: number, year: number, month: number): number {
  return Math.min(Math.max(1, Math.round(day)), daysInMonthOf(year, month));
}

/** Número de día calendario (sin horas) para restar días sin problemas de horario. */
function dayNum(year: number, month: number, day: number): number {
  return Math.round(Date.UTC(year, month, day) / 86400000);
}

function dayNumOf(d: Date): number {
  return dayNum(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Número de día calendario local de un valor guardado; null si es inválido. */
export function storedDayNumber(stored: string): number | null {
  const dt = storedToLocalDate(stored);
  return dt ? dayNumOf(dt) : null;
}

// ─────────────────────────────────────────────────────────────
// Configuración y períodos
// ─────────────────────────────────────────────────────────────

/**
 * Ancla del período según los ajustes: mensual = día de pago; quincenal = primer día de pago;
 * semanal / irregular = mes calendario (ancla 1).
 */
export function fixedCycleConfig(
  s: Pick<UserSettings, 'paymentCycle' | 'paymentDay' | 'paymentDays'>,
): FixedCycleConfig {
  const clamp = (n: number): number => Math.min(31, Math.max(1, Math.round(n)));
  if (s.paymentCycle === 'monthly') {
    const n = Number(s.paymentDay);
    return { anchorDay: Number.isFinite(n) ? clamp(n) : 1 };
  }
  if (s.paymentCycle === 'biweekly') {
    const days = (Array.isArray(s.paymentDays) ? s.paymentDays : [])
      .map(Number).filter(n => Number.isFinite(n) && n >= 1 && n <= 31);
    return { anchorDay: days.length > 0 ? Math.round(Math.min(...days)) : 1 };
  }
  return { anchorDay: 1 };
}

/** Inicio (año, mes normalizados, día efectivo) del período que arranca en el mes `year`/`month`. */
function startIn(cfg: FixedCycleConfig, year: number, month: number): Date {
  const ref = new Date(year, month, 1);
  const y = ref.getFullYear();
  const m = ref.getMonth();
  return new Date(y, m, effectiveDay(cfg.anchorDay, y, m), 0, 0, 0, 0);
}

function effectiveStartOf(nominal: Date, resolve: PeriodStartResolver | null): { start: Date; source: StartSource } {
  if (resolve) {
    const r = resolve(ymdKey(nominal));
    if (r) return { start: new Date(r.date.getFullYear(), r.date.getMonth(), r.date.getDate(), 0, 0, 0, 0), source: r.source };
  }
  return { start: nominal, source: 'nominal' };
}

/**
 * Período de presupuesto que contiene a `date` con un resolvedor explícito (null = solo nominal).
 * Se miran el período nominal anterior, el actual y el siguiente, cada uno con su inicio efectivo, y se
 * elige el último cuyo inicio efectivo sea <= la fecha. `end` = día anterior al inicio efectivo del siguiente.
 */
export function periodForWith(cfg: FixedCycleConfig, date: Date, resolve: PeriodStartResolver | null): FixedPeriod {
  const y = date.getFullYear();
  const m = date.getMonth();
  const d = date.getDate();
  const curNom = d >= effectiveDay(cfg.anchorDay, y, m) ? startIn(cfg, y, m) : startIn(cfg, y, m - 1);
  const noms = [-1, 0, 1, 2].map(k => startIn(cfg, curNom.getFullYear(), curNom.getMonth() + k));
  const effs = noms.map(n => effectiveStartOf(n, resolve));
  const today = dayNumOf(date);
  let idx = 0;
  for (let i = 0; i <= 2; i++) if (dayNumOf(effs[i].start) <= today) idx = i;
  const start = effs[idx].start;
  let nextStart = effs[idx + 1].start;
  if (dayNumOf(nextStart) <= dayNumOf(start)) nextStart = noms[idx + 1];
  const end = new Date(nextStart.getFullYear(), nextStart.getMonth(), nextStart.getDate() - 1, 23, 59, 59, 999);
  return { key: ymdKey(noms[idx]), start, end, nominalStart: noms[idx], startSource: effs[idx].source, nextStart };
}

/** Período de presupuesto que contiene a `date` (con el inicio real si hay resolvedor global). */
export function periodFor(cfg: FixedCycleConfig, date: Date): FixedPeriod {
  return periodForWith(cfg, date, startResolver);
}

/** Período de un valor guardado (la fecha de un movimiento); null si es inválido. */
export function periodForStored(cfg: FixedCycleConfig, stored: string): FixedPeriod | null {
  const dt = storedToLocalDate(stored);
  return dt ? periodFor(cfg, dt) : null;
}

/** Período siguiente a `p`. */
export function nextPeriod(cfg: FixedCycleConfig, p: FixedPeriod): FixedPeriod {
  return periodFor(cfg, new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate() + 1, 12, 0, 0, 0));
}

/** Clave del período de un movimiento (depende SOLO de su fecha); null si la fecha es inválida. */
export function cycleKeyFor(cfg: FixedCycleConfig, stored: string): string | null {
  return periodForStored(cfg, stored)?.key ?? null;
}

/**
 * Vencimiento (12:00 locales) de un gasto fijo dentro del período `p`: exactamente uno por período.
 * Si el día de cobro es >= el ancla vence en el mes de inicio; si no, en el mes siguiente. Se recorta
 * a [p.start, p.end] (meses cortos).
 */
export function dueDateInPeriod(dayOfMonth: number, p: FixedPeriod, cfg: FixedCycleConfig): Date {
  // El mes de referencia es el del inicio NOMINAL (la clave): el inicio real puede caer en el mes anterior.
  const hasKey = KEY_DAY_RE.test(p.key);
  const M = hasKey ? Number(p.key.slice(5, 7)) - 1 : p.start.getMonth();
  const Y = hasKey ? Number(p.key.slice(0, 4)) : p.start.getFullYear();
  const day = Math.round(dayOfMonth);
  const ref = new Date(Y, day >= cfg.anchorDay ? M : M + 1, 1);
  const yy = ref.getFullYear();
  const mm = ref.getMonth();
  const dd = effectiveDay(dayOfMonth, yy, mm);
  const n = dayNum(yy, mm, dd);
  const lo = dayNumOf(p.start);
  const hi = dayNumOf(p.end);
  if (n < lo) return new Date(p.start.getFullYear(), p.start.getMonth(), p.start.getDate(), 12, 0, 0, 0);
  if (n > hi) return new Date(p.end.getFullYear(), p.end.getMonth(), p.end.getDate(), 12, 0, 0, 0);
  return new Date(yy, mm, dd, 12, 0, 0, 0);
}

/** Días entre el movimiento y el vencimiento de SU período (positivo = después); null si la fecha es inválida. */
export function dueDistanceInPeriod(dayOfMonth: number, cfg: FixedCycleConfig, stored: string): number | null {
  const dt = storedToLocalDate(stored);
  if (!dt) return null;
  const due = dueDateInPeriod(dayOfMonth, periodFor(cfg, dt), cfg);
  return dayNumOf(dt) - dayNumOf(due);
}

/**
 * Clave de período vigente para una clave guardada. Acepta 'YYYY-MM-DD' (si cambió el día de pago se
 * reubica por el vencimiento del pago) y 'YYYY-MM' (formato viejo: vencimiento de ese mes calendario).
 * Cualquier otro formato da null.
 */
export function normalizeCycleKey(key: string, dayOfMonth: number, cfg: FixedCycleConfig): string | null {
  if (KEY_DAY_RE.test(key)) {
    const y = Number(key.slice(0, 4));
    const m = Number(key.slice(5, 7));
    const d = Number(key.slice(8, 10));
    const at = new Date(y, m - 1, d, 12, 0, 0, 0);
    if (isNaN(at.getTime())) return null;
    // Las claves son nominales: la validación y el período viejo se calculan sin el inicio real.
    if (periodForWith(cfg, at, null).key === key) return key;
    const old: FixedCycleConfig = { anchorDay: d };
    const pOld = periodForWith(old, at, null);
    return periodFor(cfg, dueDateInPeriod(dayOfMonth, pOld, old)).key;
  }
  if (KEY_MONTH_RE.test(key)) {
    const y = Number(key.slice(0, 4));
    const m = Number(key.slice(5, 7));
    if (m < 1 || m > 12) return null;
    const due = new Date(y, m - 1, effectiveDay(dayOfMonth, y, m - 1), 12, 0, 0, 0);
    return periodFor(cfg, due).key;
  }
  return null;
}

/**
 * Fecha por defecto al marcar pagado a mano: el vencimiento del período actual si ya pasó o es hoy;
 * si todavía no llega, hoy. Siempre a las 12:00 locales (sin desfase de zona).
 */
export function defaultPaidDate(dayOfMonth: number, now: Date, cycle: FixedCycleConfig): Date {
  const due = dueDateInPeriod(dayOfMonth, periodFor(cycle, now), cycle);
  const base = dayNumOf(due) <= dayNumOf(now) ? due : now;
  return new Date(base.getFullYear(), base.getMonth(), base.getDate(), 12, 0, 0, 0);
}

/** ¿El gasto figura pagado para el período de `now` (o uno futuro)? */
export function isPaidForPeriod(fe: FixedExpense, cycle: FixedCycleConfig, now: Date): boolean {
  if (!fe.isPaid) return false;
  const eff = normalizeCycleKey(fe.paidCycleKey ?? '', fe.dayOfMonth, cycle) ?? '';
  return eff >= periodFor(cycle, now).key;
}

export interface FixedDueInfo { period: FixedPeriod; due: Date; nextDue: Date; overdue: boolean; }

/** Vencimiento del período actual, el del siguiente y si el gasto está atrasado (no pagado y ya pasó). */
export function fixedDueInfo(fe: FixedExpense, cycle: FixedCycleConfig, now: Date): FixedDueInfo {
  const period = periodFor(cycle, now);
  const due = dueDateInPeriod(fe.dayOfMonth, period, cycle);
  const nextDue = dueDateInPeriod(fe.dayOfMonth, nextPeriod(cycle, period), cycle);
  return { period, due, nextDue, overdue: !fe.isPaid && dayNumOf(now) > dayNumOf(due) };
}

/**
 * Próximo recordatorio (3 días antes del vencimiento, 9:00): del período actual, o del siguiente si ya
 * está pagado o el recordatorio ya pasó. `payDay` es el día del mes del vencimiento. null si no hay.
 */
export function nextFixedReminder(
  fe: FixedExpense,
  cycle: FixedCycleConfig,
  now: Date,
): { date: Date; payDay: number } | null {
  let p = periodFor(cycle, now);
  if (isPaidForPeriod(fe, cycle, now)) p = nextPeriod(cycle, p);
  for (let i = 0; i < 3; i++) {
    const due = dueDateInPeriod(fe.dayOfMonth, p, cycle);
    const date = new Date(due.getFullYear(), due.getMonth(), due.getDate() - 3, 9, 0, 0, 0);
    if (date.getTime() - now.getTime() > 60000) return { date, payDay: due.getDate() };
    p = nextPeriod(cycle, p);
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// Ids de los movimientos manuales de "marcar pagado"
// ─────────────────────────────────────────────────────────────

/** Id del movimiento manual de "marcar pagado". */
export function feTxId(expenseId: string, key: string): string {
  return `${FE_TX_PREFIX}${expenseId}_${key}`;
}

/** Id del gasto fijo dentro de un id `fe_tx_*` (con o sin sufijo de ciclo); null si no lo es. */
export function fixedIdFromFeTxId(id: string): string | null {
  const m = FE_TX_ID_RE.exec(id);
  return m ? m[1] : null;
}

/** Clave cruda ('YYYY-MM-DD' o 'YYYY-MM' viejo) del sufijo de un id `fe_tx_*`; null si no la trae. */
export function cycleKeyFromFeTxId(id: string): string | null {
  const m = FE_TX_CYCLE_RE.exec(id);
  return m ? m[1] : null;
}

/**
 * Reinicio por período: un gasto se conserva pagado si su clave de pago (normalizada) cubre el período
 * actual o uno futuro; si no, se limpian los campos de pago. Idempotente: un gasto que se conserva se
 * devuelve intacto (misma referencia).
 */
export function planFixedPeriodReset(
  expenses: FixedExpense[],
  now: Date,
  cycle: FixedCycleConfig,
): { next: FixedExpense[]; changed: boolean } {
  const cur = periodFor(cycle, now).key;
  let changed = false;
  const next = expenses.map(e => {
    let eff: string | null = null;
    if (e.paidCycleKey) eff = normalizeCycleKey(e.paidCycleKey, e.dayOfMonth, cycle);
    else if (e.paidDate) eff = cycleKeyFor(cycle, e.paidDate);
    if (eff && eff >= cur) return e;
    const dirty = e.isPaid || e.paidDate !== undefined || e.lastTxId !== undefined
      || e.paidTxId !== undefined || e.paidBy !== undefined || e.paidCycleKey !== undefined;
    if (!dirty) return e;
    changed = true;
    return {
      ...e, isPaid: false, paidDate: undefined, lastTxId: undefined, paidTxId: undefined,
      paidBy: undefined, paidCycleKey: undefined,
    };
  });
  return { next, changed };
}
