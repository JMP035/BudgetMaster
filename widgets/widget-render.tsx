// Dibujo de los widgets: elige el componente por nombre y vuelve a pintar todas las instancias con la foto guardada.
import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { BudgetMediumWidget } from './BudgetMediumWidget';
import { BudgetSmallWidget } from './BudgetSmallWidget';
import { WIDGET_NAMES, loadWidgetView } from './widget-view';
import type { WidgetSize, WidgetView } from './widget-view';

/** Tamaño de respaldo (dp) cuando el lanzador no informa el real. */
const DEFAULT_SIZE: Record<string, WidgetSize> = {
  BudgetSmall: { width: 150, height: 150 },
  BudgetMedium: { width: 320, height: 150 },
};

export function widgetElement(name: string, view: WidgetView, size?: WidgetSize): React.JSX.Element {
  const fallback = DEFAULT_SIZE[name] ?? DEFAULT_SIZE.BudgetSmall;
  const sz = size && size.width > 0 && size.height > 0 ? size : fallback;
  return name === 'BudgetMedium' ? <BudgetMediumWidget view={view} size={sz} /> : <BudgetSmallWidget view={view} size={sz} />;
}

/** Repinta cada widget puesto en la pantalla de inicio (o solo los de `names`) con la foto y la privacidad actuales. */
export async function redrawWidgets(names: readonly string[] = WIDGET_NAMES): Promise<void> {
  const view = await loadWidgetView();
  for (const widgetName of names) {
    await requestWidgetUpdate({
      widgetName,
      renderWidget: info => widgetElement(widgetName, view, { width: info.width, height: info.height }),
    });
  }
}
