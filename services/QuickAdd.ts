// «+ gasto» del widget de Android (módulo PURO: sin react-native ni storage). El enlace budgetmaster://quick-add NO
// es una ruta: app/+native-intent.tsx lo convierte en «/?open=add&n=<marca>» ANTES de navegar. Así el sistema solo
// actualiza los parámetros de la pantalla de entrada que ya existe (no apila otra copia de la app con su splash, su
// biometría, su carga de datos y su sincronización de SMS). La marca `n` distingue un toque de otro mientras la app
// sigue abierta.

/** Parámetros de la pantalla de entrada para abrir «Agregar». */
export const QUICK_ADD_PARAM = 'add';

const QUICK_ADD_URL = /^(?:budgetmaster:\/\/\/?|\/)quick-add\/?(?:[?#].*)?$/i;

/** true si `path` es el enlace del widget (budgetmaster://quick-add, con o sin barra final o parámetros). */
export function isQuickAddUrl(path: string): boolean {
  return typeof path === 'string' && QUICK_ADD_URL.test(path.trim());
}

/** Ruta interna que abre «Agregar» en la pantalla de entrada; `nonce` cambia en cada toque. */
export function quickAddPath(nonce: number): string {
  return `/?open=${QUICK_ADD_PARAM}&n=${Math.floor(nonce)}`;
}

/** Lo que devuelve redirectSystemPath: el enlace del widget se reescribe; cualquier otro llega intacto. */
export function redirectQuickAdd(path: string, nonce: number): string {
  return isQuickAddUrl(path) ? quickAddPath(nonce) : path;
}

export type QuickAddAction = 'none' | 'wait' | 'discard' | 'open';

export interface QuickAddInput {
  /** Parámetro `open` de la ruta (expo-router puede dar una lista). */
  open?: string | string[];
  /** Parámetro `n` (marca del toque). */
  nonce?: string | string[];
  /** Marca del último toque ya atendido en esta instancia (null si ninguno). */
  handled: string | null;
  splashDone: boolean;
  /** true cuando loadData ya leyó los ajustes (antes, «onboardingComplete» es solo el valor por defecto). */
  settingsLoaded: boolean;
  /** Onboarding y onboarding de tarjetas terminados. */
  onboardingDone: boolean;
}

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

/**
 * Qué hacer con el pedido de «+ gasto»:
 *  - 'none': no hay pedido o ya se atendió esa marca;
 *  - 'wait': todavía no (splash o ajustes sin cargar): no se consume;
 *  - 'discard': el onboarding no terminó: se descarta (no se salta a Agregar cuando arranca el recorrido);
 *  - 'open': abrir «Agregar».
 * `key` es la marca a recordar como atendida (null con 'none' y 'wait').
 */
export function decideQuickAdd(i: QuickAddInput): { action: QuickAddAction; key: string | null } {
  if (first(i.open) !== QUICK_ADD_PARAM) return { action: 'none', key: null };
  const key = first(i.nonce) ?? 'sin-marca';
  if (key === i.handled) return { action: 'none', key: null };
  if (!i.splashDone || !i.settingsLoaded) return { action: 'wait', key: null };
  return { action: i.onboardingDone ? 'open' : 'discard', key };
}
