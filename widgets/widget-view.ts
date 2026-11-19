// Lo que comparten los widgets de Android: leer la foto y la privacidad (por StorageService, nunca AsyncStorage
// directo) y dar formato a los textos. El widget no recalcula nada: pinta lo que la app guardó.
import { StorageService } from '../services/storage';
import { WIDGET_STALE_TEXT, freshenWidgetSnapshot, maskForPrivacy, widgetDaysText, widgetShortDate } from '../services/WidgetSnapshot';
import type { WidgetSnapshot } from '../services/WidgetSnapshot';
import { formatMoney } from '../services/format';
import { C } from '../theme';
import type { CapacityLevel } from '../services/Capacity';
import type { HexColor } from 'react-native-android-widget';

const hex = (c: string) => c as HexColor;

/** Colores del widget: todos salen de theme.ts (ónix + bronce). */
export const W = {
  bg: hex(C.bg),
  bgTop: hex(C.cardHigh),
  border: hex(C.cardBorder),
  text: hex(C.text),
  sub: hex(C.textSub),
  muted: hex(C.textMuted),
  bronze: hex(C.primaryLight),
  bronzeDeep: hex(C.primary),
  track: hex(C.shimmer),
  ok: hex(C.accent),
  warn: hex(C.warning),
  danger: hex(C.danger),
};

/** Color del semáforo: ok verde, warn ámbar, alert y red rojo (igual que el Dashboard). */
export function levelColor(level: CapacityLevel): HexColor {
  if (level === 'ok') return W.ok;
  if (level === 'warn') return W.warn;
  return W.danger;
}

/** Texto que ocupa el lugar de un monto cuando la privacidad está activa. */
export const HIDDEN_AMOUNT = '••••';

export const WIDGET_NAMES = ['BudgetSmall', 'BudgetMedium'] as const;
export type WidgetName = (typeof WIDGET_NAMES)[number];

export interface WidgetView {
  /** Foto lista para pintar (ya enmascarada si la privacidad lo pide); null si la app todavía no la guardó. */
  snap: WidgetSnapshot | null;
  /** true = los montos no se ven (el ojo está «cerrado»). */
  hidden: boolean;
  /** true = hay foto pero ya es de un período que terminó: no se pintan cifras viejas, solo «Abre la app para actualizar». */
  stale: boolean;
}

/** Texto del widget sin cifras: foto vieja (otro período) o app todavía sin abrir. */
export function emptyText(view: Pick<WidgetView, 'stale'>, fresh: string): string {
  return view.stale ? WIDGET_STALE_TEXT : fresh;
}

/**
 * Lee la foto y la privacidad. La foto se pone al día de HOY (los días al cobro se calculan con la fecha de hoy; si el
 * cobro ya llegó, `stale`); con privacidad 'hidden' (por defecto) enmascara todos los montos.
 */
export async function loadWidgetView(now: Date = new Date()): Promise<WidgetView> {
  const [saved, privacy] = await Promise.all([
    StorageService.getWidgetSnapshot(),
    StorageService.getWidgetPrivacy(),
  ]);
  const hidden = privacy !== 'shown';
  const fresh = saved ? freshenWidgetSnapshot(saved, now) : null;
  const snap = fresh && !fresh.stale ? fresh.snap : null;
  return { snap: snap && hidden ? maskForPrivacy(snap) : snap, hidden, stale: !!fresh && fresh.stale };
}

/** Alterna la privacidad guardada y devuelve el valor nuevo (true = ocultos). */
export async function togglePrivacy(): Promise<boolean> {
  const cur = await StorageService.getWidgetPrivacy();
  const next = cur === 'shown' ? 'hidden' : 'shown';
  await StorageService.saveWidgetPrivacy(next);
  return next === 'hidden';
}

/** Monto formateado o «••••» si está oculto. */
export function amountText(hidden: boolean, n: number, currency = 'Q'): string {
  return hidden ? HIDDEN_AMOUNT : formatMoney(n, currency, { decimals: 2 });
}

/** Línea del próximo pago de tarjeta: «BAC Visa · 02/12 · Q 9,276.01 + $ 39.67 (estimado)». */
export function nextCardText(snap: WidgetSnapshot, hidden: boolean): string | null {
  const c = snap.nextCard;
  if (!c) return null;
  const parts: string[] = [];
  if (c.Q > 0 || c.USD <= 0) parts.push(formatMoney(c.Q, 'Q'));
  if (c.USD > 0) parts.push(formatMoney(c.USD, 'USD'));
  const money = hidden ? HIDDEN_AMOUNT : parts.join(' + ');
  return `${widgetShortDate(c.due)} · ${money}${c.estimated ? ' (estimado)' : ''}`;
}

/** Línea del próximo gasto fijo: «02/12 · Luz · Q 300.00». */
export function nextFixedText(snap: WidgetSnapshot, hidden: boolean): string | null {
  const f = snap.nextFixed;
  if (!f) return null;
  return `${widgetShortDate(f.due)} · ${amountText(hidden, f.amount, f.currency)}`;
}

/** Texto de días de la foto: ver `widgetDaysText` (con ciclo irregular no dice «cobras»). */
export function daysText(snap: Pick<WidgetSnapshot, 'daysToPay' | 'daysLeftInPeriod'>): string {
  return widgetDaysText(snap);
}

/** «act. 14/11 18:05» a partir del ISO de la foto. */
export function updatedText(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '';
  const p = (n: number) => String(n).padStart(2, '0');
  return `act. ${p(d.getDate())}/${p(d.getMonth() + 1)} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
