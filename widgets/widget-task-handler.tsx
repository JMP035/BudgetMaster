// Atiende al sistema cuando el widget se agrega, se actualiza, cambia de tamaño o recibe un toque.
// Lee la foto y la privacidad por StorageService; no recalcula nada.
import type { WidgetTaskHandlerProps } from 'react-native-android-widget';
import { ACTION_TOGGLE_PRIVACY } from './widget-parts';
import { redrawWidgets, widgetElement } from './widget-render';
import { WIDGET_NAMES, loadWidgetView, togglePrivacy } from './widget-view';

export async function widgetTaskHandler(props: WidgetTaskHandlerProps): Promise<void> {
  const name = props.widgetInfo.widgetName;
  const size = { width: props.widgetInfo.width, height: props.widgetInfo.height };
  switch (props.widgetAction) {
    case 'WIDGET_ADDED':
    case 'WIDGET_UPDATE':
    case 'WIDGET_RESIZED':
      props.renderWidget(widgetElement(name, await loadWidgetView(), size));
      break;
    case 'WIDGET_CLICK':
      if (props.clickAction === ACTION_TOGGLE_PRIVACY) {
        await togglePrivacy();
        // El que se tocó se pinta ya; el otro (si está puesto) se repinta aparte para que ambos coincidan.
        props.renderWidget(widgetElement(name, await loadWidgetView(), size));
        await redrawWidgets(WIDGET_NAMES.filter(n => n !== name)).catch(() => { });
      }
      break;
    default:
      break;
  }
}
