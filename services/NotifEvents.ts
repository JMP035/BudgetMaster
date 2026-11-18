// EVENTOS PARA NOTIFICACIONES (módulo PURO, sin react-native ni AsyncStorage).
// storage.ts y SmsService emiten aquí; NotificationService escucha. Así los módulos de datos no importan
// expo-notifications (y se evita la circularidad storage <-> NotificationService).

type Listener = () => void;
const inputListeners = new Set<Listener>();

/** Se suscribe a «cambió algo que alimenta el plan» (movimientos, cuentas, fijos, fuentes, visacuotas, anclas). */
export function onPlanInputsChanged(fn: Listener): () => void {
  inputListeners.add(fn);
  return () => { inputListeners.delete(fn); };
}

export function emitPlanInputsChanged(): void {
  for (const fn of Array.from(inputListeners)) {
    try { fn(); } catch { }
  }
}

export interface IncomeAutoLinkedInfo { txId: string; sourceId: string; occKey: string; }
type IncomeListener = (info: IncomeAutoLinkedInfo) => void;
const incomeListeners = new Set<IncomeListener>();

/** Un ingreso se vinculó SOLO (SMS) a una fuente de ingreso: avisa «llegó tu sueldo». */
export function onIncomeAutoLinked(fn: IncomeListener): () => void {
  incomeListeners.add(fn);
  return () => { incomeListeners.delete(fn); };
}

export function emitIncomeAutoLinked(info: IncomeAutoLinkedInfo): void {
  for (const fn of Array.from(incomeListeners)) {
    try { fn(info); } catch { }
  }
}
