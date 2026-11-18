// ─────────────────────────────────────────────────────────────
// VISTA DE LAS FUENTES DE INGRESO (módulo PURO)
// ─────────────────────────────────────────────────────────────
// Sin react-native ni AsyncStorage: de ./storage solo `import type`. Arma lo que muestran las pantallas de
// fuentes de ingreso (pestaña Presupuesto → Ingresos, el formulario de la fuente, el centro de revisión de SMS):
// la lista con su estado, los textos, la validación del formulario y las propuestas «¿Es tu sueldo?».
//
// Regex sin lookbehind ni flags s/v (Hermes). Fechas locales a las 12:00.

import type { IncomePattern, IncomeSource, Transaction } from './storage';
import { formatShortDay } from './BudgetBreakdown';
import { formatMoney } from './format';
import { storedToLocalDate } from './FixedCycle';
import { originKey } from './IncomeOrigin';
import { matchIncome, sourceStatus } from './IncomeSources';
import type { IncomePatternPreview, IncomeProposal, IncomeSourceStatus } from './IncomeSources';
import { DEFAULT_PAY_RULES } from './PayCalendar';
import type { PayRules, WeekendRule } from './PayCalendar';

export const MONTH_NAMES = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
export const MONTH_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
export const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const WEEKDAY_SHORT = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'];

export type IncomeFrequency = IncomeSource['frequency'];

export const FREQUENCY_LABELS: Record<IncomeFrequency, string> = {
  monthly: 'Mensual',
  biweekly: 'Quincenal',
  weekly: 'Semanal',
  irregular: 'Irregular',
};

/** Atajos de meses para las fuentes «extra» (el usuario también puede marcar los que quiera). */
export const EXTRA_MONTH_PRESETS: Array<{ label: string; months: number[] }> = [
  { label: 'Bono 14 → julio', months: [7] },
  { label: 'Aguinaldo → diciembre', months: [12] },
];

// ═════════════════════════════════════════════════════════════
// Textos de la fuente
// ═════════════════════════════════════════════════════════════

/** «Mensual · día 27», «Quincenal · días 15 y 30», «Semanal · cada viernes», «Irregular» (+ meses de un extra). */
export function scheduleText(source: Pick<IncomeSource, 'frequency' | 'days' | 'role' | 'months'>): string {
  const days = Array.isArray(source.days) ? source.days : [];
  let base: string = FREQUENCY_LABELS[source.frequency];
  if (source.frequency === 'monthly' && days.length > 0) base += ` · día ${days[0]}`;
  else if (source.frequency === 'biweekly' && days.length >= 2) base += ` · días ${days[0]} y ${days[1]}`;
  else if (source.frequency === 'weekly' && days.length > 0 && days[0] >= 0 && days[0] <= 6) {
    base += ` · cada ${WEEKDAY_NAMES[Math.round(days[0])]}`;
  }
  const months = Array.isArray(source.months) ? source.months.filter(m => m >= 1 && m <= 12) : [];
  if (source.role === 'extra' && months.length > 0) {
    base += ` · ${months.map(m => MONTH_NAMES[m - 1]).join(', ')}`;
  }
  return base;
}

/**
 * Coherencia entre el día de pago semanal de Ajustes y las fuentes de ingreso: la primera fuente BASE, activa
 * y semanal cuyo día (`days[0]`, 0=dom..6=sáb) no coincide con `weekday`, o null si todas coinciden. Las que
 * no traen un día válido no cuentan como contradicción.
 */
export function weeklySourceMismatch(sources: IncomeSource[], weekday: number): IncomeSource | null {
  const list = Array.isArray(sources) ? sources : [];
  for (const s of list) {
    if (!s || s.role !== 'base' || !s.isActive || s.frequency !== 'weekly') continue;
    const d = Array.isArray(s.days) ? s.days[0] : undefined;
    if (typeof d !== 'number' || !Number.isInteger(d) || d < 0 || d > 6) continue;
    if (d !== weekday) return s;
  }
  return null;
}

export type StatusTone = 'success' | 'info' | 'danger' | 'muted';

export interface StatusView {
  tone: StatusTone;
  /** Texto del chip: «Recibido», «Esperado», «Atrasado», «Sin pago». */
  label: string;
  /** Frase corta bajo el nombre: «Llegó el 27 oct», «Se espera el 27 oct». */
  detail: string;
}

/** Cómo se muestra el estado de una fuente (chip esperado / recibido / atrasado). */
export function statusView(st: IncomeSourceStatus, source: Pick<IncomeSource, 'frequency' | 'role'>): StatusView {
  switch (st.status) {
    case 'received': {
      const when = st.tx ? storedToLocalDate(st.tx.date) : null;
      return { tone: 'success', label: 'Recibido', detail: when ? `Llegó el ${formatShortDay(when)}` : 'Ya llegó' };
    }
    case 'expected':
      return {
        tone: 'info', label: 'Esperado',
        detail: st.occurrence ? `Se espera el ${formatShortDay(st.occurrence.date)}` : 'Se espera pronto',
      };
    case 'late':
      return {
        tone: 'danger', label: 'Atrasado',
        detail: st.occurrence ? `Debió llegar el ${formatShortDay(st.occurrence.date)}` : 'Todavía no llegó',
      };
    default:
      if (source.frequency === 'irregular') return { tone: 'muted', label: 'Sin pago', detail: 'Sin pagos este mes' };
      if (source.role === 'extra') return { tone: 'muted', label: 'Fuera de temporada', detail: 'Aún no es su mes' };
      return { tone: 'muted', label: 'Sin pago', detail: 'Sin pago por vigilar' };
  }
}

export interface IncomeListItem {
  source: IncomeSource;
  status: IncomeSourceStatus;
  view: StatusView;
  schedule: string;
}

/** Fuentes listas para pintar: activas primero, base antes que extra, luego por nombre. */
export function buildIncomeList(
  sources: IncomeSource[], txs: Transaction[], now: Date, rules: PayRules = DEFAULT_PAY_RULES,
): IncomeListItem[] {
  const items = sources.map(source => {
    const status = sourceStatus(source, txs, now, rules);
    return { source, status, view: statusView(status, source), schedule: scheduleText(source) };
  });
  const rank = (s: IncomeSource) => (s.isActive ? 0 : 2) + (s.role === 'base' ? 0 : 1);
  return items.sort((a, b) => {
    const r = rank(a.source) - rank(b.source);
    if (r !== 0) return r;
    const an = a.source.name.toLowerCase();
    const bn = b.source.name.toLowerCase();
    return an < bn ? -1 : an > bn ? 1 : 0;
  });
}

/** «Tu ingreso real es Q 7,426.61, ¿actualizar el declarado?» (el declarado actual va entre paréntesis si hay). */
export function suggestionText(s: { suggested: number; current: number }): string {
  const tail = s.current > 0 ? ` (hoy tienes declarado ${formatMoney(s.current, 'Q')})` : '';
  return `Tu ingreso real es ${formatMoney(s.suggested, 'Q')}, ¿actualizar el declarado?${tail}`;
}

// ═════════════════════════════════════════════════════════════
// Patrón aprendido
// ═════════════════════════════════════════════════════════════

/** «BANRURAL · cuenta ***5051 · de «SECCION…» · ≈Q7,426.61 (±1.5%)». */
export function patternSummary(p: IncomePattern, currency: string = 'Q'): string {
  const parts: string[] = [p.bank];
  if (p.acctKey) parts.push(`cuenta ***${p.acctKey}`);
  if (p.originLabel) parts.push(`de «${p.originLabel}»`);
  const tol = Math.round((p.tolerancePct > 0 ? p.tolerancePct : 0) * 10) / 10;
  parts.push(`≈${formatMoney(p.amount, currency)}${tol > 0 ? ` (±${tol}%)` : ''}`);
  return parts.join(' · ');
}

/** Aplica la corrección del usuario (quién envía y monto) al patrón aprendido. */
export function applyPatternCorrection(
  p: IncomePattern, edit: { originText: string; amount: number },
): IncomePattern {
  const { originKey: _k, originLabel: _l, ...rest } = p;
  const label = edit.originText.replace(/\s+/g, ' ').trim();
  const key = originKey(label);
  return {
    ...rest,
    ...(key ? { originKey: key, originLabel: label } : {}),
    amount: edit.amount > 0 ? edit.amount : p.amount,
  };
}

/** Motivo (en español) por el que un SMS no sirvió de ejemplo. */
export function patternFailText(reason: 'not_income' | 'no_amount' | 'not_bank'): string {
  switch (reason) {
    case 'not_income': return 'Ese SMS no parece un depósito ni un ingreso. Elige el mensaje en que el banco te avisa que te llegó el pago.';
    case 'no_amount': return 'No encontré el monto en ese SMS. Pégalo completo, tal como lo mandó el banco.';
    case 'not_bank': return 'Ese texto no parece un SMS de tu banco. Pégalo completo, tal como lo mandó el banco.';
  }
}

/** Valores sugeridos para el formulario a partir del SMS de ejemplo (día del mes o de la semana). */
export function suggestScheduleFromPreview(
  preview: Pick<IncomePatternPreview, 'day' | 'weekday'>, frequency: IncomeFrequency,
): number[] {
  if (frequency === 'monthly' || frequency === 'biweekly') return [preview.day];
  if (frequency === 'weekly') return [preview.weekday];
  return [];
}

// ═════════════════════════════════════════════════════════════
// Formulario de la fuente
// ═════════════════════════════════════════════════════════════

export interface IncomeFormInput {
  id: string;
  name: string;
  category: string;
  /** Ya interpretado con parseAmount (NaN si el campo está vacío o mal escrito). */
  amount: number;
  currency: IncomeSource['currency'];
  frequency: IncomeFrequency;
  /** Días tal como los escribió el usuario (pueden venir NaN). */
  days: number[];
  weekendRule?: WeekendRule | null;
  accountId?: string | null;
  role: IncomeSource['role'];
  months: number[];
  anchorsPeriod: boolean;
  pattern?: IncomePattern | null;
  isActive?: boolean;
  createdAt: string;
}

export type IncomeFormResult = { ok: true; source: IncomeSource } | { ok: false; error: string };

function wholeInRange(n: number, lo: number, hi: number): boolean {
  return Number.isFinite(n) && Math.round(n) === n && n >= lo && n <= hi;
}

/** Valida el formulario y arma la fuente lista para guardar (o el mensaje de error en español). */
export function validateIncomeForm(f: IncomeFormInput): IncomeFormResult {
  const name = f.name.replace(/\s+/g, ' ').trim();
  if (!name) return { ok: false, error: 'Ponle un nombre a la fuente (por ejemplo: Sueldo).' };
  if (!f.category) return { ok: false, error: 'Elige la categoría de ingreso.' };
  if (!Number.isFinite(f.amount) || !(f.amount > 0)) return { ok: false, error: 'Escribe cuánto te pagan (mayor a 0).' };

  let days: number[] = [];
  if (f.frequency === 'monthly') {
    if (!wholeInRange(f.days[0], 1, 31)) return { ok: false, error: 'Escribe el día del mes en que te pagan (de 1 a 31).' };
    days = [f.days[0]];
  } else if (f.frequency === 'biweekly') {
    const a = f.days[0];
    const b = f.days[1];
    if (!wholeInRange(a, 1, 31) || !wholeInRange(b, 1, 31)) {
      return { ok: false, error: 'Escribe los dos días del mes en que te pagan (de 1 a 31).' };
    }
    if (a === b) return { ok: false, error: 'Los dos días de pago deben ser distintos.' };
    days = [a, b].sort((x, y) => x - y);
  } else if (f.frequency === 'weekly') {
    if (!wholeInRange(f.days[0], 0, 6)) return { ok: false, error: 'Elige el día de la semana en que te pagan.' };
    days = [f.days[0]];
  }

  const months = Array.from(new Set(f.months.filter(m => wholeInRange(m, 1, 12)))).sort((x, y) => x - y);
  if (f.role === 'extra' && f.frequency !== 'irregular' && months.length === 0) {
    return { ok: false, error: 'Marca en qué mes llega este pago extra (por ejemplo julio o diciembre).' };
  }

  const anchors = f.role === 'base' && (f.frequency === 'monthly' || f.frequency === 'biweekly') && f.anchorsPeriod;
  const source: IncomeSource = {
    id: f.id,
    name,
    category: f.category,
    amount: Math.round(f.amount * 100) / 100,
    currency: f.currency,
    frequency: f.frequency,
    days,
    ...(f.weekendRule ? { weekendRule: f.weekendRule } : {}),
    ...(f.accountId ? { accountId: f.accountId } : {}),
    role: f.role,
    ...(f.role === 'extra' && months.length > 0 ? { months } : {}),
    anchorsPeriod: anchors,
    ...(f.pattern ? { pattern: f.pattern } : {}),
    isActive: f.isActive !== false,
    createdAt: f.createdAt,
  };
  return { ok: true, source };
}

// ═════════════════════════════════════════════════════════════
// «¿Es tu sueldo?» en el centro de revisión de SMS
// ═════════════════════════════════════════════════════════════

/** Clave con que se recuerda un «No» (se guarda con las demás decisiones ignoradas). */
export function incomeProposalKey(txId: string, sourceId: string): string {
  return `inc|${txId}|${sourceId}`;
}

/**
 * Propuestas vigentes de vincular un ingreso a una fuente. Con `onlyTxIds` (las del resultado de la
 * sincronización) solo se miran esos movimientos; sin él, todos los ingresos de SMS sin fuente. Se vuelve a
 * correr matchIncome, así que si la fuente cambió o el ciclo ya quedó cubierto, la propuesta desaparece.
 * Lo que el usuario ya rechazó (clave `inc|tx|src`) no vuelve.
 */
export function liveIncomeProposals(
  txs: Transaction[], sources: IncomeSource[], rules: PayRules, ignored: Set<string>, onlyTxIds?: string[] | null,
): IncomeProposal[] {
  const active = sources.filter(s => s.isActive);
  if (active.length === 0) return [];
  const taken = new Set<string>();
  for (const t of txs) if (t.incomeSourceId && t.incomeCycleKey) taken.add(`${t.incomeSourceId}|${t.incomeCycleKey}`);
  const only = onlyTxIds ? new Set(onlyTxIds) : null;
  const out: IncomeProposal[] = [];
  const sorted = txs
    .filter(t => t.source === 'sms' && t.type === 'income' && !t.incomeSourceId && !t.transferPairId)
    .filter(t => !only || only.has(t.id))
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date));
  for (const t of sorted) {
    const m = matchIncome(t, active, rules);
    if (!m) continue;
    if (ignored.has(incomeProposalKey(t.id, m.sourceId))) continue;
    if (taken.has(`${m.sourceId}|${m.occKey}`)) continue;
    out.push({ ...m, auto: false, txId: t.id });
  }
  return out;
}

/** Título de la fila del centro de revisión: «¿Es tu Sueldo?» o uno genérico si hay varias fuentes. */
export function incomeProposalsTitle(list: Array<{ sourceName: string }>): string {
  const names = Array.from(new Set(list.map(p => p.sourceName)));
  return names.length === 1 ? `¿Es tu ${names[0]}?` : '¿Es de alguna de tus fuentes de ingreso?';
}
