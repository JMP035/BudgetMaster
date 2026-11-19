// Piezas que comparten el widget pequeño y el mediano (primitivas de react-native-android-widget).
import React from 'react';
import { FlexWidget, SvgWidget, TextWidget } from 'react-native-android-widget';
import { W } from './widget-style';
import type { HexColor } from 'react-native-android-widget';

export { WIDGET_ROOT_STYLE } from './widget-style';

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
      style={{
        padding: 5, borderRadius: 14, backgroundColor: W.chip, borderWidth: 1, borderColor: W.edge,
      }}
    >
      <SvgWidget svg={svg} style={{ width: 18, height: 18 }} />
    </FlexWidget>
  );
}

/** «+ gasto»: abre la app directo en Agregar (deep link budgetmaster://quick-add). Bronce con canto más claro. */
export function AddExpenseButton({ compact }: { compact?: boolean }) {
  return (
    <FlexWidget
      clickAction="OPEN_URI"
      clickActionData={{ uri: QUICK_ADD_URI }}
      style={{
        paddingHorizontal: compact ? 9 : 10, paddingVertical: compact ? 4 : 5, borderRadius: 14,
        backgroundColor: W.bronzeDeep, borderWidth: 1, borderColor: W.bronze,
        alignItems: 'center', justifyContent: 'center',
      }}
    >
      <TextWidget text={compact ? '+' : '+ gasto'} style={{ fontSize: compact ? 14 : 11, fontWeight: 'bold', color: W.onBronze }} />
    </FlexWidget>
  );
}

/** Barra del presupuesto gastado (SVG): verde hasta 69 %, ámbar desde 70 %, roja al llegar al 100 %. */
export function BudgetBar({ pct, width = 120 }: { pct: number; width?: number }) {
  const h = 8;
  const w = Math.max(20, Math.floor(width));
  const p = Math.max(0, Math.min(100, Math.round(pct)));
  const fillW = p === 0 ? 0 : Math.max(h, Math.round((w * p) / 100));
  const color: HexColor = pct >= 100 ? W.danger : pct >= 70 ? W.warn : W.ok;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<rect width="${w}" height="${h}" rx="4" fill="${W.track}"/>` +
    (fillW > 0 ? `<rect width="${fillW}" height="${h}" rx="4" fill="${color}"/>` : '') +
    `</svg>`;
  return <SvgWidget svg={svg} style={{ width: w, height: h }} />;
}

/**
 * Brillo del canto superior (el «reflejo» del vidrio): una franja de 2 dp con degradado horizontal que se desvanece
 * en los extremos. Es un rectángulo (no una línea) porque un degradado sobre una línea sin alto no se pinta.
 */
export function GlassSheen({ width }: { width: number }) {
  const w = Math.max(20, Math.round(width - 44));
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="2" viewBox="0 0 ${w} 2">` +
    `<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="0">` +
    `<stop offset="0" stop-color="${W.sheenSvg}" stop-opacity="0"/>` +
    `<stop offset="0.5" stop-color="${W.sheenSvg}" stop-opacity="0.55"/>` +
    `<stop offset="1" stop-color="${W.sheenSvg}" stop-opacity="0"/>` +
    `</linearGradient></defs>` +
    `<rect width="${w}" height="2" rx="1" fill="url(#s)"/></svg>`;
  return <SvgWidget svg={svg} style={{ width: w, height: 2, marginHorizontal: 22 }} />;
}
