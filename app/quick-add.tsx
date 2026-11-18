import { Redirect } from "expo-router";

// Deep link del widget de Android («+ gasto»): budgetmaster://quick-add. Lleva a la pantalla de entrada con
// la orden de abrir «Agregar»; app/index.tsx la atiende una sola vez, detrás del onboarding y de la biometría.
export default function QuickAdd() {
  return <Redirect href={{ pathname: "/", params: { open: "add" } }} />;
}
