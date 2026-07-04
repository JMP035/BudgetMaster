# BudgetMaster

App de finanzas personales hecha con Expo (SDK 54) / React Native 0.81 / React 19 / TypeScript.

## Estructura

- `app/` — rutas de expo-router (`_layout.tsx` raíz, `index.tsx` entrada).
- `components/` — pantallas y UI (Dashboard, Transactions, BudgetScreen, AIAdvisor, etc.).
- `context/` — contextos de React (TutorialContext).
- `services/` — lógica y persistencia (storage.ts sobre AsyncStorage, SmsService, Categorizer, NotificationService, ExchangeRateService).
- `ai.ts` — asesor financiero con IA basado en datos locales.
- `categories.ts`, `theme.ts` — catálogo de categorías y tema visual.

## Flujo de trabajo obligatorio

Para tareas no triviales se usa el flujo **plan → ejecución** descrito en
`.claude/WORKFLOW.md`:

1. El subagente `planner` (Fable 5) diseña el plan.
2. El subagente `ejecutor` (Sonnet 5) lo implementa.

## Comandos

- `npx tsc --noEmit` — chequeo de tipos (verificación mínima antes de terminar).
- `npx expo start` — arrancar la app en desarrollo.

## Reglas

- No usar AsyncStorage directamente en componentes: pasar por `services/storage.ts`.
- Las APIs de SMS solo existen en Android: proteger con `Platform.OS === 'android'`.
- No instalar dependencias nuevas sin aprobación explícita.
- Respetar el tema de `theme.ts` y `StyleSheet.create` para estilos.
