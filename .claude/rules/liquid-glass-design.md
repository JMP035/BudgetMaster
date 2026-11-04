---
paths:
  - "components/**"
  - "app/**"
  - "theme.ts"
---

# Sistema visual: Ónix Profundo × Bronce Metálico + Liquid Glass

Este es el diseño definitivo de la app (piloto validado en el Dashboard). **Toda
pantalla o componente nuevo, y cualquier rediseño de uno existente, debe usar
este sistema** — no estilos planos ni `Alert.alert` nativo ni grises genéricos.

## Reglas obligatorias

- Usar siempre los colores de `theme.ts` (`C.bg`, `C.primary`, `C.glassFill`,
  etc.). No definir colores nuevos sueltos en un componente; si falta un tono,
  agregarlo a `theme.ts` primero.
- Las tarjetas, modales, barras y cualquier superficie elevada van envueltas en
  `GlassCard` o `GlassBackground` (`components/GlassCard.tsx`), no en `View`
  con `backgroundColor` plano ni con `shadow()` de estilo viejo.
- Nunca usar `Alert.alert` nativo para mensajes informativos o de confirmación
  dentro de la UI de la app — construir un modal propio con `GlassCard` (ver
  `NetWorthInfoModal` en `Dashboard.tsx` como referencia). `Alert.alert` queda
  bien solo para diálogos del sistema que no tiene sentido re-diseñar (permisos
  del OS, por ejemplo).
- Texto destacado (montos grandes, puntajes, títulos con énfasis) usa
  `GradientText` (`components/GradientText.tsx`) con los tonos bronce, no
  color plano, cuando el valor es positivo/destacable. Mantener el fallback a
  color plano para estados neutros/negativos como ya está en `ScoreWidget`.
- Blur de Android: usar siempre `GLASS_ANDROID_BLUR_METHOD` exportado desde
  `GlassCard.tsx` (actualmente `'none'`: el blur real de Android re-blurea en
  cada frame y trababa el scroll del Dashboard; sin blur se usa
  `C.glassFillNoBlur` como relleno). Solo activar `'dimezisBlurView'` si se
  prueba fluido en un dispositivo real. Evitar muchas tarjetas con blur real
  dentro de un mismo ScrollView.
- Mantener accesibilidad: los textos sobre vidrio deben usar `C.text` /
  `C.textPrimary` / `C.textSub` según jerarquía — nunca bajar el contraste por
  debajo de lo que ya usa `Dashboard.tsx` (fue un bug real reportado: texto
  inactivo casi invisible en las pestañas de Presupuesto).
- Diseño responsive siempre: usar `useWindowDimensions` / `useSafeAreaInsets`
  y `flexWrap`/`flexShrink` en filas con texto + badges, en vez de anchos fijos
  — otro bug real reportado (badge de tutorial cortado en pantallas chicas).

## Componentes base (usar siempre antes de crear estilos propios)

- `GlassDialogProvider` / `useGlassDialog()` — `dialog.confirm(...)` y `dialog.alert(...)`
  reemplazan a `Alert.alert` y `window.confirm`. Nunca usar alertas nativas.
- `InlineNotice` — mensajes de validación/estado dentro de formularios y pantallas.
- `GlassSheet` — todo bottom sheet con formulario (ya trae teclado, scroll y safe area).
- `GlassSegmented` — pestañas/filtros (alto explícito; nunca `flex:1` en el tocable interno).
- `GlassButton` — botones primario/secundario/destructivo/ghost.
- `ScreenHeader` + `HelpButton` — encabezado de cada módulo con el "?" que abre su tutorial.
- Tokens extra de `theme.ts`: `C.onPrimary` (texto sobre bronce), `C.fx` (moneda extranjera),
  `C.glassInput`/`C.glassInputBorder`, `C.glassActive`/`C.glassActiveBorder`.
- Pantalla o módulo nuevo: registrar sus elementos con `useTutorialRef`, su ScrollView con
  `useTutorialScroll(key)` y agregar su tutorial en `services/Tutorial.ts`.
- Montos con `parseAmount` (nunca `parseFloat`); fechas con `formatDateOnly`/`parseDateOnly`
  (nunca `new Date("YYYY-MM-DD")`); inputs en formularios con KeyboardAvoidingView
  `behavior="padding"` + `keyboardShouldPersistTaps="handled"`.

## Referencia

Ver `components/Dashboard.tsx` (ScoreWidget, CurrencyCard, AccountsWidget,
BriefingCard, NetWorthInfoModal) y la barra de pestañas en `app/index.tsx`
(`tb.wrap`/`tb.bar`) como la implementación canónica de este sistema.
