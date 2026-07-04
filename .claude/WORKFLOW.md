# Flujo de trabajo: Plan (Fable 5) → Ejecución (Sonnet 5)

Este proyecto usa un flujo tipo **opusplan**, pero con Fable 5 como planificador
y Sonnet 5 como ejecutor, implementado con subagentes de Claude Code.

## Agentes

| Agente | Modelo | Rol | Archivo |
|--------|--------|-----|---------|
| `planner` | Fable 5 | Explora el código y produce un plan paso a paso. No edita archivos. | `.claude/agents/planner.md` |
| `ejecutor` | Sonnet 5 | Implementa el plan aprobado y verifica con `npx tsc --noEmit`. | `.claude/agents/ejecutor.md` |

## Cómo usarlo

Para cualquier tarea no trivial (nueva funcionalidad, refactor, bug complejo):

1. **Planificar** — pedir el plan al agente planificador:
   > Usa el subagente `planner` para diseñar cómo <tarea>.
2. **Revisar** — leer el plan devuelto y ajustarlo si hace falta.
3. **Ejecutar** — pasar el plan completo al agente ejecutor:
   > Usa el subagente `ejecutor` para implementar este plan: <plan>.
4. **Verificar** — confirmar que `npx tsc --noEmit` pasa y probar la app con `npx expo start`.

Para cambios triviales (un typo, un color, un texto) no hace falta el flujo:
se editan directamente.

## Alternativa nativa

Claude Code trae un modo integrado similar: `/model opusplan` hace que Opus
planifique en modo plan y Sonnet ejecute. Este proyecto usa la variante con
subagentes para poder elegir Fable 5 como planificador.

## Reglas del proyecto (resumen)

- Expo SDK 54 · React Native 0.81 · React 19 · TypeScript ~5.9.
- Persistencia: AsyncStorage vía `services/storage.ts` (no acceder a AsyncStorage directo desde componentes).
- Navegación: expo-router (`app/_layout.tsx` raíz, `app/index.tsx` entrada).
- SMS: solo Android (`react-native-get-sms-android`); siempre proteger con `Platform.OS === 'android'`.
- Tema centralizado en `theme.ts`; estilos con `StyleSheet.create`.
- Verificación mínima antes de dar algo por terminado: `npx tsc --noEmit`.
