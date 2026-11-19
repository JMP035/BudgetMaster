import { redirectQuickAdd } from "../services/QuickAdd";

// Atiende los enlaces del sistema ANTES de que expo-router navegue. El «+ gasto» del widget abre
// budgetmaster://quick-add: aquí se reescribe a «/?open=add&n=<marca>», que solo actualiza los parámetros de la pantalla de
// entrada que ya está abierta. Una ruta propia (la antigua quick-add) apilaba una segunda copia de la app en cada toque.
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string {
  try {
    return redirectQuickAdd(path, Date.now());
  } catch {
    return path;
  }
}
