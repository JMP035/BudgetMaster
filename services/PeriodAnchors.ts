// Anclas del inicio real del período (módulo PURO, sin react-native ni AsyncStorage).
//
// El período arranca el día que cae el sueldo: el día nominal de pago (p. ej. 27) se corrige por
// fines de semana y feriados (fecha ESPERADA), por el sueldo REAL detectado (ancla 'auto') o por lo que
// el usuario fije a mano (ancla 'manual', que gana siempre y la automatización nunca revierte).
// Las claves de los períodos siguen siendo el inicio NOMINAL ('YYYY-MM-DD').
import { adjustPayDate, DEFAULT_PAY_RULES, parseYmd, sanitizePayRules } from './PayCalendar';
import type { PayRules } from './PayCalendar';
import { effectiveDay } from './FixedCycle';
import type { PeriodStartResolver } from './FixedCycle';
import type { UserSettings } from './storage';

export interface PeriodAnchor {
  /** Inicio NOMINAL del período ('YYYY-MM-DD'), la misma clave que usa FixedCycle. */
  key: string;
  /** Inicio real elegido ('YYYY-MM-DD'). */
  start: string;
  source: 'auto' | 'manual';
  /** Movimiento de sueldo que originó el ancla automática. */
  txId?: string;
  /** Origen del depósito (clave de IncomeRules) que originó el ancla automática. */
  sourceId?: string;
  /** ISO de cuándo se creó o actualizó. */
  at: string;
}

const MAX_ANCHORS = 24;

type ResolverSettings = Pick<UserSettings, 'paymentCycle' | 'paymentDay' | 'paymentDays'> & { payRules?: PayRules };

function dayNum(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

/** Días de pago (1..31) configurados según el ciclo; [] si el ciclo no admite anclas (semanal / irregular). */
function configuredPayDays(s: ResolverSettings): number[] {
  if (s.paymentCycle === 'monthly') {
    const n = Number(s.paymentDay);
    return Number.isFinite(n) ? [Math.min(31, Math.max(1, Math.round(n)))] : [];
  }
  if (s.paymentCycle === 'biweekly') {
    return (Array.isArray(s.paymentDays) ? s.paymentDays : [])
      .map(Number).filter(n => Number.isFinite(n) && n >= 1 && n <= 31).map(n => Math.round(n));
  }
  return [];
}

/**
 * Resolvedor del inicio real: dada la clave nominal devuelve el inicio efectivo y su origen.
 * Solo aplica a ciclos mensual y quincenal y a claves cuyo día es un día de pago efectivo de ese mes.
 * Prioridad: manual > auto (sueldo real, solo si payRules.autoAnchor) > esperado por regla > nominal.
 * Todo dentro de ±tolerancia salvo la manual, que puede salirse.
 */
export function buildStartResolver(settings: ResolverSettings, anchors: PeriodAnchor[]): PeriodStartResolver {
  const rules = settings.payRules ? sanitizePayRules(settings.payRules) : DEFAULT_PAY_RULES;
  const payDays = configuredPayDays(settings);
  const tol = Math.min(7, Math.max(0, rules.toleranceDays));
  const list = Array.isArray(anchors) ? anchors : [];
  return (nominalKey: string) => {
    if (payDays.length === 0) return null;
    const nominal = parseYmd(nominalKey);
    if (!nominal) return null;
    const y = nominal.getFullYear();
    const m = nominal.getMonth();
    const isPayDay = payDays.some(d => effectiveDay(d, y, m) === nominal.getDate());
    if (!isPayDay) return null;

    const manual = list.find(a => a.key === nominalKey && a.source === 'manual');
    const manualDate = manual ? parseYmd(manual.start) : null;
    if (manualDate) return { date: manualDate, source: 'manual' };

    if (rules.autoAnchor) {
      const auto = list.find(a => a.key === nominalKey && a.source === 'auto');
      const autoDate = auto ? parseYmd(auto.start) : null;
      if (autoDate && Math.abs(dayNum(autoDate) - dayNum(nominal)) <= tol) {
        return { date: autoDate, source: 'salary' };
      }
    }

    const expected = adjustPayDate(nominal, rules);
    if (dayNum(expected) !== dayNum(nominal)) return { date: expected, source: 'expected' };
    return { date: nominal, source: 'nominal' };
  };
}

function sortAndTrim(list: PeriodAnchor[]): PeriodAnchor[] {
  const sorted = [...list].sort((a, b) => {
    if (a.key !== b.key) return a.key < b.key ? -1 : 1;
    return a.source === b.source ? 0 : (a.source === 'auto' ? -1 : 1);
  });
  return sorted.length > MAX_ANCHORS ? sorted.slice(sorted.length - MAX_ANCHORS) : sorted;
}

/**
 * Agrega o actualiza el ancla automática de `anchor.key`. Nunca toca la manual de esa clave (la manual
 * puede coexistir y gana al resolver; si el usuario la quita, la automática vuelve a regir).
 */
export function upsertAutoAnchor(list: PeriodAnchor[], anchor: PeriodAnchor): PeriodAnchor[] {
  const rest = list.filter(a => !(a.key === anchor.key && a.source === 'auto'));
  return sortAndTrim([...rest, { ...anchor, source: 'auto' }]);
}

/** Quita las anclas automáticas nacidas del movimiento `txId` (p. ej. al borrar o editar ese sueldo). */
export function removeAnchorsForTx(list: PeriodAnchor[], txId: string): PeriodAnchor[] {
  return list.filter(a => !(a.source === 'auto' && a.txId === txId));
}

/** Fija a mano el inicio real del período `key` (reemplaza una manual previa de esa clave). */
export function setManualAnchor(list: PeriodAnchor[], key: string, start: string, nowIso: string): PeriodAnchor[] {
  const rest = list.filter(a => !(a.key === key && a.source === 'manual'));
  return sortAndTrim([...rest, { key, start, source: 'manual', at: nowIso }]);
}

/** Quita el ancla manual de `key` (vuelve a regir la automática o la esperada). */
export function clearManualAnchor(list: PeriodAnchor[], key: string): PeriodAnchor[] {
  return list.filter(a => !(a.key === key && a.source === 'manual'));
}

/** Lista válida a partir de lo guardado (descarta entradas mal formadas). */
export function sanitizeAnchors(raw: unknown): PeriodAnchor[] {
  if (!Array.isArray(raw)) return [];
  const out: PeriodAnchor[] = [];
  for (const a of raw) {
    if (!a || typeof a !== 'object') continue;
    const x = a as Partial<PeriodAnchor>;
    if (typeof x.key !== 'string' || !parseYmd(x.key)) continue;
    if (typeof x.start !== 'string' || !parseYmd(x.start)) continue;
    if (x.source !== 'auto' && x.source !== 'manual') continue;
    out.push({
      key: x.key, start: x.start, source: x.source,
      txId: typeof x.txId === 'string' ? x.txId : undefined,
      sourceId: typeof x.sourceId === 'string' ? x.sourceId : undefined,
      at: typeof x.at === 'string' ? x.at : '',
    });
  }
  return sortAndTrim(out);
}
