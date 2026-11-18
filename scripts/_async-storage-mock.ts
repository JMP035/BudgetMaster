// Ayuda para las pruebas: AsyncStorage en memoria. Debe importarse ANTES que services/storage:
//   import './_async-storage-mock';
// (reemplaza el módulo en la caché de require, así StorageService corre en Node sin tocar disco).
const store = new Map<string, string>();

const mock = {
  getItem: async (k: string): Promise<string | null> => (store.has(k) ? (store.get(k) as string) : null),
  setItem: async (k: string, v: string): Promise<void> => { store.set(k, v); },
  removeItem: async (k: string): Promise<void> => { store.delete(k); },
  multiGet: async (keys: string[]): Promise<Array<[string, string | null]>> =>
    keys.map(k => [k, store.has(k) ? (store.get(k) as string) : null]),
  multiSet: async (pairs: Array<[string, string]>): Promise<void> => { for (const [k, v] of pairs) store.set(k, v); },
  multiRemove: async (keys: string[]): Promise<void> => { for (const k of keys) store.delete(k); },
  getAllKeys: async (): Promise<string[]> => Array.from(store.keys()),
  clear: async (): Promise<void> => { store.clear(); },
};

const id = require.resolve('@react-native-async-storage/async-storage');
require.cache[id] = { id, filename: id, loaded: true, exports: { __esModule: true, default: mock, ...mock } } as unknown as NodeJS.Module;

/** Vacía la memoria entre escenarios. */
export function resetMemoryStorage(): void { store.clear(); }
