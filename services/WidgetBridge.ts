// Puente entre la app y los widgets de Android. SOLO Android: en iOS, web y Expo Go (donde el módulo nativo no
// existe) todo es un no-op y nunca rompe la app. La librería se carga con `require` dentro de un try.
import { Platform } from 'react-native';
import { StorageService } from './storage';
import type { WidgetSnapshot } from './WidgetSnapshot';

/** Guarda la foto y le pide al sistema que repinte los widgets (pequeño y mediano). */
export async function refreshWidgets(snapshot: WidgetSnapshot): Promise<void> {
  if (Platform.OS !== 'android') return;
  try {
    await StorageService.saveWidgetSnapshot(snapshot);
    // Sin build nativo (Expo Go) este require lanza: se ignora.
    const render = require('../widgets/widget-render') as typeof import('../widgets/widget-render');
    await render.redrawWidgets();
  } catch (e) {
    console.warn('[WidgetBridge] widget no disponible:', e);
  }
}
