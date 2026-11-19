// Colores y fondo de los widgets de Android (estilo Liquid Glass: ónix traslúcido, canto bronce y brillo superior).
// Sin imports de la librería de widgets (solo tipos): así se puede comprobar en Node que el fondo conserva su borde.
import { C } from '../theme';
import type { HexColor } from 'react-native-android-widget';

const hex = (c: string) => c as HexColor;

/** Colores del widget: todos salen de theme.ts (ónix + bronce). */
export const W = {
  bg: hex(C.bg),
  glass: hex(C.widgetGlass),
  glassDeep: hex(C.widgetGlassDeep),
  edge: hex(C.glassActiveBorder),
  sheen: hex(C.glassHighlightSoft),
  /** Brillo del canto en SVG: color sólido (el SVG no usa rgba) al que se le baja la opacidad con el degradado. */
  sheenSvg: C.primaryGlow as string,
  chip: hex(C.glassActive),
  divider: hex(C.glassBorder),
  onBronze: hex(C.onPrimary),
  textPrimary: hex(C.textPrimary),
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

/**
 * Fondo común de los widgets: ónix traslúcido con canto de bronce. SIN `backgroundGradient`: la librería reemplaza el
 * borde cuando hay degradado en la misma vista (así se perdía el borde antes).
 */
export const WIDGET_ROOT_STYLE = {
  width: 'match_parent',
  height: 'match_parent',
  flexDirection: 'column',
  backgroundColor: W.glass,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: W.edge,
} as const;
