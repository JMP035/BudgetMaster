// Piezas que comparten el widget pequeño y el mediano (primitivas de react-native-android-widget).
import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { W } from './widget-view';
import type { HexColor } from 'react-native-android-widget';

/** Acciones de click del widget. OPEN_APP y OPEN_URI las resuelve el sistema; TOGGLE_PRIVACY la atiende el handler. */
export const ACTION_TOGGLE_PRIVACY = 'TOGGLE_PRIVACY';
export const QUICK_ADD_URI = 'budgetmaster://quick-add';

/** Ojo para mostrar u ocultar los montos: tachado = ocultos (el estado por defecto). */
export function EyeButton({ hidden }: { hidden: boolean }) {
  const c = W.bronze;
  const slash = hidden ? `<line x1="3" y1="21" x2="21" y2="3" stroke="${c}" stroke-width="2.4" stroke-linecap="round"/>` : '';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24">` +
    `<path d="M1 12C3.5 7 7.5 4.5 12 4.5S20.5 7 23 12c-2.5 5-6.5 7.5-11 7.5S3.5 17 1 12z" fill="none" stroke="${c}" stroke-width="2"/>` +
    `<circle cx="12" cy="12" r="3.2" fill="${c}"/>${slash}</svg>`;
  return (
    <FlexWidget
      clickAction={ACTION_TOGGLE_PRIVACY}
      style={{ padding: 6, borderRadius: 14, backgroundColor: W.track }}
    >
      <SvgWidget svg={svg} style={{ width: 18, height: 18 }} />
    </FlexWidget>
  );
}

/** «+ gasto»: abre la app directo en Agregar (deep link budgetmaster://quick-add). */
export function AddExpenseButton({ compact }: { compact?: boolean }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: QUICK_ADD_URI }}
      style={{
        paddingHorizontal: compact ? 9 : 10, paddingVertical: 4, borderRadius: 14,
        backgroundColor: W.bronzeDeep,
      }}
    >
      <TextWidget text={compact ? '+' : '+ gasto'} style={{ fontSize: compact ? 14 : 11, fontWeight: 'bold', color: W.bg }} />
    </FlexWidget>
  );
}

/** Barra del presupuesto gastado (SVG): verde hasta 69 %, ámbar desde 70 %, roja al llegar al 100 %. */
export function BudgetBar({ pct, width = 150 }: { pct: number; width?: number }) {
  const h = 8;
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const fillW = p === 0 ? 0 : Math.max(h, Math.round((width * p) / 100));
  const color: HexColor = pct >= 100 ? W.danger : pct >= 70 ? W.warn : W.ok;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${h}" viewBox="0 0 ${width} ${h}">` +
    `<rect width="${width}" height="${h}" rx="4" fill="${W.track}"/>` +
    (fillW > 0 ? `<rect width="${fillW}" height="${h}" rx="4" fill="${color}"/>` : '') +
    `</svg>`;
  return <SvgWidget svg={svg} style={{ width, height: h }} />;
}

/** Fondo común de los widgets: ónix con borde sutil. */
export const WIDGET_ROOT_STYLE = {
  width: 'match_parent',
  height: 'match_parent',
  borderRadius: 20,
  borderWidth: 1,
  borderColor: W.border,
  backgroundGradient: { from: W.bgTop, to: W.bg, orientation: 'TOP_BOTTOM' },
} as const;
