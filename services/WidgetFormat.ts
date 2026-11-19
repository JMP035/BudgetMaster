// Formato de los textos de los widgets de Android (2x2 y 4x2). Módulo puro: sin react-native, sin la librería de
// widgets y sin AsyncStorage, para poder probarlo en Node. El widget se dibuja como una imagen de ancho fijo: lo que no
// cabe se pierde, así que los montos grandes se abrevian y los textos largos se acortan ANTES de pintarlos.
import { CURRENCY_DISPLAY, formatNumber } from './format';
import { widgetShortDate } from './WidgetSnapshot';

/** Espacio que no se parte: Android no puede separar «-Q» de la cifra en dos líneas. */
export const NBSP = ' ';

/** Texto que ocupa el lugar de un monto cuando la privacidad está activa. */
export const HIDDEN_AMOUNT = '••••';

export type WidgetMoneyMode = 'full' | 'compact';

/**
 * Monto para el widget, siempre con espacio duro entre el símbolo y la cifra.
 *  - full:    «Q 4,158.45» (2 decimales).
 *  - compact: <1 000 con 2 decimales («Q 462.05»); 1 000–9 999 sin decimales («Q 4,158»);
 *             10 000–999 999 en miles («Q 12.4k»); desde un millón en millones («Q 1.2M»).
 */
export function widgetMoney(n: number, currency = 'Q', mode: WidgetMoneyMode = 'compact'): string {
  const symbol = CURRENCY_DISPLAY[currency] ?? currency;
  const safe = isFinite(n) ? n : 0;
  if (mode === 'full') {
    const r = Number(safe.toFixed(2));
    return `${r < 0 ? '-' : ''}${symbol}${NBSP}${formatNumber(r, 2)}`;
  }
  const abs = Math.abs(safe);
  if (abs < 1000) {
    const r = Number(safe.toFixed(2)); // evita «-0.00»
    return `${r < 0 ? '-' : ''}${symbol}${NBSP}${formatNumber(r, 2)}`;
  }
  const sign = safe < 0 ? '-' : '';
  if (abs < 10000) return `${sign}${symbol}${NBSP}${formatNumber(Math.round(abs), 0)}`;
  const thousands = Math.round(abs / 100) / 10; // un decimal
  if (abs < 1e6 && thousands < 1000) return `${sign}${symbol}${NBSP}${thousands.toFixed(1)}k`;
  return `${sign}${symbol}${NBSP}${(abs / 1e6).toFixed(1)}M`;
}

const HERO_SIZES = [22, 20, 18, 16, 14];
/** Ancho aproximado de un carácter en negrita, como fracción del tamaño de letra. */
const CHAR_WIDTH_RATIO = 0.62;

/**
 * Tamaño de letra de la cifra principal: el mayor (de 22 a 14) cuyo ancho estimado cabe en `availDp`.
 * Es una estimación; el widget además trunca y encoge la letra como respaldo.
 */
export function heroFontSize(text: string, availDp: number, base = 22): number {
  const sizes = HERO_SIZES.filter(s => s <= base);
  for (const size of sizes) {
    if (text.length * CHAR_WIDTH_RATIO * size <= availDp) return size;
  }
  return Math.min(14, base);
}

/** Línea del próximo pago de tarjeta: «02/01 · Q 3,807 + $ 172.91» (+ « (est.)»); oculto: «02/01 · ••••». */
export function cardLine(c: { due: string; Q: number; USD: number; estimated?: boolean }, hidden: boolean): string {
  const parts: string[] = [];
  if (c.Q > 0 || c.USD <= 0) parts.push(widgetMoney(c.Q, 'Q', 'compact'));
  if (c.USD > 0) parts.push(widgetMoney(c.USD, 'USD', 'compact'));
  const money = hidden ? HIDDEN_AMOUNT : parts.join(' + ');
  return `${widgetShortDate(c.due)} · ${money}${c.estimated ? ' (est.)' : ''}`;
}

/** Saldos del pie del 4x2: primera cuenta y cuántas más hay («BAC Ahorros Q 157.00 · +4 más»); sin cuentas, ''. */
export function balancesLine(b: { name: string; amount: number; currency: string }[], hidden: boolean): string {
  if (b.length === 0) return '';
  const first = b[0];
  const head = `${first.name} ${hidden ? HIDDEN_AMOUNT : widgetMoney(first.amount, first.currency, 'compact')}`;
  return b.length > 1 ? `${head} · +${b.length - 1} más` : head;
}

/** Ancho (dp) desde el que el 2x2 tiene sitio para la marca «BUDGETMASTER» junto al «+» y el ojo. */
export const SMALL_BRAND_MIN_WIDTH = 150;

/** Cabecera del 2x2: la marca solo se pinta si cabe; si no, se omite para no empujar el ojo fuera del widget. */
export function headerLayout(widthDp: number): { showBrand: boolean } {
  return { showBrand: widthDp >= SMALL_BRAND_MIN_WIDTH };
}
