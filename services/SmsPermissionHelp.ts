// Ayuda cuando Android bloquea el permiso de SMS («No volver a preguntar» o «configuración
// restringida»). Módulo PURO: el texto es el mismo que mostraba el Dashboard (showSmsPermissionBlocked).
import type { SmsPermissionDetail } from './SmsService';

export interface SmsPermissionHelpInfo {
  message: string;
  steps: string[];
  footnote?: string;
}

export function smsPermissionHelp(
  perm: Pick<SmsPermissionDetail, 'apiLevel' | 'instantDenial' | 'manufacturer'>,
): SmsPermissionHelpInfo {
  const apiLevel = perm.apiLevel ?? 0;
  const restricted = apiLevel >= 33;
  const message = perm.instantDenial && restricted
    ? "Android bloqueó el permiso sin preguntarte. Es lo normal cuando la app se instaló desde un APK (fuera de Play Store): Android lo trata como «configuración restringida»."
    : "Android ya no muestra el aviso de permiso porque se rechazó antes con «No volver a preguntar».";
  const steps = restricted
    ? [
      "Toca «Abrir ajustes» (se abre la ficha de BudgetMaster).",
      "Toca el menú de tres puntos arriba a la derecha y elige «Permitir configuración restringida». Si no aparece, sigue al paso 3.",
      "Entra a Permisos → SMS → Permitir.",
      "Vuelve a BudgetMaster y toca sincronizar de nuevo.",
    ]
    : [
      "Toca «Abrir ajustes» (se abre la ficha de BudgetMaster).",
      "Entra a Permisos → SMS → Permitir.",
      "Vuelve a BudgetMaster y toca sincronizar de nuevo.",
    ];
  const maker = perm.manufacturer.toLowerCase();
  const footnote = maker.includes("honor") || maker.includes("huawei")
    ? "En Honor/MagicOS, si no ves la opción: Ajustes → Apps → Apps → BudgetMaster → Permisos. Algunos modelos también piden habilitarlo en Gestor del teléfono → Permisos."
    : undefined;
  return { message, steps, footnote };
}
