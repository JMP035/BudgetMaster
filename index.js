// Punto de entrada: arranca expo-router y, solo en Android, registra el atendedor de los widgets de la pantalla de inicio.
// El registro va en try/catch: sin el módulo nativo (Expo Go) la app arranca igual.
import 'expo-router/entry';
import { Platform } from 'react-native';

if (Platform.OS === 'android') {
  try {
    const { registerWidgetTaskHandler } = require('react-native-android-widget');
    const { widgetTaskHandler } = require('./widgets/widget-task-handler');
    registerWidgetTaskHandler(widgetTaskHandler);
  } catch (e) {
    console.warn('[widgets] atendedor no registrado:', e);
  }
}
