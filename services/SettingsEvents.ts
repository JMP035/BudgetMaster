// ─────────────────────────────────────────────────────────────
// EVENTOS DE AJUSTES (módulo PURO)
// ─────────────────────────────────────────────────────────────
// Sin react-native ni AsyncStorage: solo `import type` de ./storage.
// StorageService.saveSettings emite aquí después de guardar, para que el estado
// de settings de la app se refresque aunque el guardado venga de un sheet suelto.

import type { UserSettings } from './storage';

type Listener = (s: UserSettings) => void;

const listeners = new Set<Listener>();

/** Se suscribe a los cambios de ajustes; devuelve la función para cancelar. */
export function onSettingsChanged(fn: Listener): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

/** Avisa a los suscriptores; un error en uno no afecta a los demás. */
export function emitSettingsChanged(s: UserSettings): void {
  for (const fn of Array.from(listeners)) {
    try { fn(s); } catch { }
  }
}
