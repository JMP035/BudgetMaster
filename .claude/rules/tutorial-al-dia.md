# Tutorial siempre al día

El tutorial (`services/Tutorial.ts`) es parte de la app, no un extra: **todo cambio visible
se registra también en el tutorial, en el mismo cambio**. Un cambio sin su tutorial no está terminado.

## Qué hay que actualizar según el cambio

- **Pantalla, módulo, botón o función nueva:** pasos nuevos en `services/Tutorial.ts` con su `useTutorialRef`
  (`elementId`), su `emptyHint` y, si usa SMS, `requiresSms`. Si es un módulo nuevo, un tutorial nuevo y su
  entrada en `HELP_MODULES` (`services/GettingStarted.ts`) para que aparezca en el centro de ayuda del Inicio.
- **Cambio de texto, de flujo o de regla** (por ejemplo, cómo se cuenta un período o qué hace un botón):
  corregir la frase del paso que lo explica. Un tutorial que dice algo distinto a la app es un bug.
- **Elemento quitado, movido o renombrado:** actualizar o eliminar el paso que lo señalaba. Un paso apuntando a
  un elemento que ya no existe rompe el recorrido.
- **Textos de ayuda relacionados:** el botón "?" del módulo, `MANUAL_USUARIO.md` y la guía del Inicio
  (`components/GettingStartedCard.tsx`) deben decir lo mismo que el tutorial.

## Tutoriales de proceso (flujos con pasos previos)

Cuando una función depende de algo que debe existir antes, hay un tutorial que cuenta el proceso **en orden**.
Ejemplos: «Registrar una compra con tarjeta» (1. crea la tarjeta en Cuentas con su día de corte y de pago;
2. registra el gasto o deja que el SMS lo detecte y vincúlalo a esa tarjeta; 3. el cargo se ve en esa cuenta),
«Pagar la tarjeta» (la transferencia a la tarjeta no es un gasto nuevo), «Cómo funcionan las visacuotas» y
«Cómo se mide tu período».

- Cada paso que necesite algo (una cuenta, una tarjeta, SMS activo) lo declara como requisito.
- Si el requisito falta, el tutorial lo dice y ofrece crearlo en ese momento; nunca debe quedarse señalando
  una pantalla vacía.

## Cómo se comprueba

- Cada plan del `planner` incluye una línea **Tutorial** con lo que se actualiza o por qué no aplica.
- Cada reporte del `ejecutor` incluye lo mismo: qué pasos del tutorial tocó, o la razón de que no hiciera falta.
- Revisar con `rg "elementId"` en `services/Tutorial.ts` que cada elemento señalado sigue existiendo en la pantalla.
