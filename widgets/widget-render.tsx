// Dibujo de los widgets: elige el componente por nombre y vuelve a pintar todas las instancias con la foto guardada.
import React from 'react';
import { requestWidgetUpdate } from 'react-native-android-widget';
import { BudgetMediumWidget } from './BudgetMediumWidget';
import { BudgetSmallWidget } from './BudgetSmallWidget';
import { WIDGET_NAMES, loadWidgetView } from './widget-view';
import type { WidgetView } from './widget-view';

export function widgetElement(name: string, view: WidgetView): React.JSX.Element {
  return name === 'BudgetMedium' ? <BudgetMediumWidget view={view} /> : <BudgetSmallWidget view={view} />;
}

/** Repinta cada widget puesto en la pantalla de inicio (o solo los de `names`) con la foto y la privacidad actuales. */
export async function redrawWidgets(names: readonly string[] = WIDGET_NAMES): Promise<void> {
  const view = await loadWidgetView();
  for (const widgetName of names) {
    await requestWidgetUpdate({ widgetName, renderWidget: () => widgetElement(widgetName, view) });
  }
}
