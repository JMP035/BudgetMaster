# BudgetMaster

App de finanzas personales hecha con Expo (SDK 54) / React Native 0.81 / React 19 / TypeScript.

## Estructura

- `app/` — rutas de expo-router (`_layout.tsx` raíz, `index.tsx` entrada).
- `components/` — pantallas y UI (Dashboard, Transactions, BudgetScreen, AIAdvisor, etc.).
- `context/` — contextos de React (TutorialContext).
- `services/` — lógica y persistencia (storage.ts sobre AsyncStorage, SmsService, Categorizer, NotificationService, ExchangeRateService).
- `services/LocalAdvisorEngine.ts` y `services/assistant/` — asesor financiero (local primero; Gemini opcional).
- `categories.ts`, `theme.ts` — catálogo de categorías y tema visual.

## Flujo de trabajo obligatorio

Para tareas no triviales se usa el flujo **plan → ejecución** descrito en
`.claude/WORKFLOW.md`:

1. El subagente `planner` (Opus 5) diseña el plan.
2. El subagente `ejecutor` (Sonnet 5) lo implementa.

## Comandos

- `npx tsc --noEmit` — chequeo de tipos (verificación mínima antes de terminar; se corre automático via hook tras cada edit/write en `.ts`/`.tsx`, ver `.claude/settings.json`).
- `npx expo start` — arrancar la app en desarrollo.

## Reglas

- No instalar dependencias nuevas sin aprobación explícita.
- **Tutorial al día:** un cambio visible no está terminado hasta que el tutorial lo refleja
  (ver `.claude/rules/tutorial-al-dia.md`). Cada plan y cada reporte de ejecución incluye una línea "Tutorial".
- Respetar el tema de `theme.ts` y `StyleSheet.create` para estilos.
- Todo diseño nuevo (pantallas, componentes, modales) sigue el sistema visual
  Ónix Profundo × Bronce Metálico + Liquid Glass validado en el Dashboard —
  ver `.claude/rules/liquid-glass-design.md` para las reglas obligatorias.

Reglas adicionales, que solo entran en contexto al tocar los archivos donde aplican, están en `.claude/rules/`:
- `async-storage-via-services.md` — no usar AsyncStorage directo en `components/`, `context/`, `app/`.
- `sms-solo-android.md` — proteger las APIs de SMS con `Platform.OS === 'android'`.
- `liquid-glass-design.md` — todo diseño nuevo usa el sistema visual bronce/vidrio (GlassCard, GradientText, theme.ts), no estilos planos ni Alert.alert nativo.
- `tutorial-al-dia.md` — todo cambio visible se registra también en el tutorial (`services/Tutorial.ts`), y los flujos con pasos previos (primero la cuenta o tarjeta, luego el cargo) tienen su tutorial de proceso.
