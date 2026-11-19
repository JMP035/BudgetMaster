# Contexto del proyecto: Manual de usuario de BudgetMaster

Actualizado el 18 de noviembre de 2026, para BudgetMaster 1.0.0.

## Qué es esto
BudgetMaster es una app móvil de finanzas personales para Guatemala (Android principal; iPhone sin lectura de SMS ni widget). Se está terminando de construir y probar. Este proyecto sirve para **escribir el manual de usuario** que acompañará a la app.

## Quién lee el manual
Personas comunes en Guatemala, **sin conocimientos técnicos ni financieros**: empleados con pago mensual, quincenal o semanal, y también emprendedores con ingresos irregulares. Muchos usan sus SMS bancarios (BAC, Banrural, G&T, Bantrab, Promerica). Escribir con claridad, sin jerga: si un término es técnico, se explica en una línea la primera vez.

## Tono y forma
- Español claro y cálido, instrucciones cortas, una acción por paso.
- **Siempre «tú».** Es una decisión tomada por el dueño de la app: el manual y la propia app tratan al lector de «tú» («toca», «elige», «puedes», «tienes») y nunca usan el voseo. No mezclar formas.
- Cada función se explica así: **para qué sirve → cómo se usa (pasos numerados) → qué debes ver → qué hacer si no funciona**.
- Montos en quetzales con el formato `Q 7,426.61`. Dólares con `$`.
- Los textos de pantalla se citan tal cual, entre «comillas» y en negrita (por ejemplo **«Guardar ciclo y día de pago»**). Si cambia un texto de la app, cambia también en el manual.
- Los ejemplos usan datos ficticios. Nunca números de cuenta completos.

## Fuentes de verdad (en este orden)
1. `MANUAL_USUARIO.md` (en la raíz del repositorio) — borrador técnico, 17 secciones, ya en «tú» y verificado contra el código el 18 de noviembre de 2026. Es el contenido más completo.
2. `docs/PRUEBAS_MANUALES.md` — instructivo de **123 pruebas manuales** (P-01 y T-01 a T-122); cada una dice qué debe verse. Sirve para saber qué **está verificado** y qué no.
3. Los resultados que el dueño de la app aporte tras probar (aciertos, fallos, capturas).

Además existen **38 pruebas automáticas** (`npm run test:*`) con **5,313 comprobaciones**, todas en verde a la fecha. Cubren la lógica (período, score, ratio de deuda, presupuesto repartido, tarjetas, notificaciones, tono «tú», etc.), no lo que se ve en el teléfono.

**Regla:** no inventar funciones ni describir pantallas que no estén en esas fuentes. Si algo no está claro, preguntar. Si algo aún no se ha probado en un teléfono (por ejemplo, el widget), marcarlo como pendiente de verificación en vez de afirmarlo.

## Qué hace la app (resumen para orientarse)
- Lleva gastos e ingresos, a mano o leyendo los SMS del banco (solo Android; también se puede **pegar** un SMS en Agregar → «Pegar SMS» en cualquier teléfono, aunque la lectura de SMS esté apagada: no usa ningún permiso).
- **Configuración inicial:** 4 datos obligatorios (nombre, ingreso, ciclo de pago con su día, meta de ahorro) y pasos opcionales (cuentas y tarjetas con su corte y pago, el SMS del pago, gastos fijos, deudas, dólares, SMS, huella, Gemini). Lo que se salta queda en la guía del Inicio.
- **Período de pago** (no mes calendario). Según el ciclo:
  - *Mensual:* de un día de pago al siguiente. Si cae en fin de semana o feriado de Guatemala, el período arranca el día hábil en que de verdad pagan (reglas editables). El usuario puede fijar el inicio a mano y la app no lo cambia sola.
  - *Quincenal:* una quincena entre dos días de pago.
  - *Semanal:* el día de la semana que el usuario elige (por ejemplo, de martes a lunes); sin ajustes por feriados.
  - *Irregular:* el **mes calendario** (no hay día de pago).
- **Presupuesto del período.** El presupuesto de Ajustes y los límites por categoría se escriben **siempre al mes**; la app los reparte según el ciclo: mensual e irregular ×1, quincenal ×½, semanal ×12/52. Con eso se miden el anillo del Inicio, los avisos, el presupuesto diario, el score, el widget y el asesor. Quien cobra por mes no ve ningún cambio.
- **Score financiero (0–100):** se calcula con lo registrado en el período actual (no con el mes calendario) con 4 factores (ahorro, presupuesto del período, gastos fijos pagados, cuentas activas). Si el ingreso del período aún no está registrado, el ahorro queda «pendiente»: no suma ni resta.
- **Una sola cifra de gasto:** anillo, score, avisos y widget cuentan el mismo gasto del período (solo quetzales; las transferencias y el pago de tarjeta nunca suman).
- **Ratio deuda/ingreso:** cuotas mensuales de visacuotas y préstamos activos frente al ingreso de las fuentes (o el declarado si no hay fuentes). No incluye el consumo de tarjeta. Verde menos de 20 %, ámbar de 20 % a 40 %, rojo más de 40 %. La deuda declarada en el onboarding viejo se puede quitar con «Ya no la tengo».
- **Fuentes de ingreso:** sueldo, quincena, ventas, bono 14, aguinaldo. La app aprende el SMS de cada persona a partir de un ejemplo.
- **Tarjetas de crédito:** día de corte y de pago por tarjeta (se piden al agregarla, incluso en la configuración inicial); sin esos días la tarjeta muestra «Sin corte ni pago · Configurar», la guía del Inicio trae «Configurar corte y pago de tus tarjetas» y llega un aviso único. Estado de cuenta en quetzales y dólares por separado (estimado, o el monto real que escribe el usuario); pago de tarjeta como transferencia (no es un gasto nuevo); **visacuotas** que se cargan como un gasto por cuota en cada corte.
- **Saldos opcionales** por cuenta (sin seguimiento, manual, automático) y **transferencias** entre cuentas propias (ejemplo: sueldo en Banrural → transferir a BAC → pagar la tarjeta desde BAC).
- Presupuesto: gastos fijos, límites por categoría, metas de ahorro, deuda programada, ingresos.
- **Gastos fijos con cuenta o tarjeta (opcional):** cada gasto fijo puede decir de qué cuenta o tarjeta sale; la fila muestra un chip y, con AUTO, el movimiento queda en esa cuenta (en una tarjeta, entra a su «Ciclo abierto»). Si el SMS del banco trae el mismo nombre en **cualquier día del mismo período** (con quincenal, semanal o irregular, el período de los gastos fijos es el mes), el gasto se marca solo; si el SMS viene de otra cuenta, o hay dos candidatos, se pregunta en el Centro de revisión; si ya estaba marcado a mano, el SMS se une al registro. El formulario avisa si la tarjeta ya carga una visacuota del mismo monto, para no contarla dos veces.
- **Estadísticas:** los tres cuadros (ingresos, gastos, ahorro) son tocables y cambian la gráfica; la vista de ahorro explica la cuenta y trae la tasa de ahorro. Quetzales y dólares van por separado (selector Q/$ cuando hay dólares en el período; nada se convierte). Las **transferencias sin clasificar** (categoría Transferencia que cuenta como gasto o ingreso) se avisan en cualquier período y un interruptor «Sin transferencias» las quita de la pantalla sin borrarlas; desde el aviso se abre el Centro de revisión para aclararlas.
- **Notificaciones** útiles y poco insistentes: recordatorios de pagos, resumen diario, resumen semanal (el domingo, o el último día de la semana de quien cobra semanal), aviso de fin de período, horas silenciosas, aviso de capacidad de pago y un aviso único de configuración pendiente.
- Asesor con IA: órdenes y consultas en lenguaje natural (funciona sin internet en «Modo local»; con clave de Gemini es más conversacional). Solo cuenta las cuotas de deuda vivas.
- Widget de Android con botón de ojo para ocultar los montos y un botón «+ gasto». Los días al cobro se recalculan solos cada día; llegado el cobro el widget dice «Abre la app para actualizar». El ojo muestra los montos sin pedir la huella (advertencia obligatoria en el manual).
- Seguridad: huella/rostro opcional; los datos viven solo en el teléfono.

## Glosario (usar siempre estos términos)
- **Período:** lo que dura tu presupuesto. Mensual: de un pago al siguiente. Quincenal: una quincena. Semanal: de tu día de cobro al día anterior de la semana siguiente. Irregular: el mes calendario.
- **Presupuesto del período:** la parte de tu presupuesto mensual que toca a un período (el mensual completo, la mitad si cobras por quincena, 12/52 si cobras por semana). Es contra lo que se mide el anillo del Inicio.
- **Score:** puntaje de 0 a 100 de tu disciplina financiera en el período actual; empieza en 50 y suma o resta por ahorro, presupuesto, gastos fijos y cuentas. Tiene un ícono de información con el detalle.
- **Ratio de cuotas (deuda / ingreso):** lo que pagas cada mes en cuotas de visacuotas y préstamos, como porcentaje de tu ingreso mensual.
- **Deuda declarada:** el monto de deuda mensual que se escribía en la configuración inicial antigua. Ya no se actualiza sola; se quita con «Ya no la tengo».
- **Día de corte:** el último día que entra en el estado de cuenta de la tarjeta (el ciclo nuevo empieza al día siguiente); es la fecha de «Saldo al corte» del estado.
- **Día de pago (de la tarjeta):** la fecha límite para pagar el estado de cuenta, después del corte.
- **Ciclo abierto:** lo que llevas gastado en la tarjeta desde el último corte.
- **Visacuota:** compra en cuotas con tarjeta (o préstamo sin tarjeta); cada corte se carga una cuota.
- **Fuente de ingreso:** de dónde y cuándo te pagan; sirve para que la app reconozca tu pago. Puede ser *base* (tu ingreso regular) o *extra* (aguinaldo, bono 14).
- **Saldo de partida / Ajustar al saldo real:** el saldo desde el que la app empieza a sumar y restar, y cómo corregirlo si no coincide con el banco.
- **Centro de revisión:** lista de cosas que la app no está segura de haber entendido (duplicados, transferencias, ¿es tu sueldo?, ¿a qué cuenta fue?…). Abierto desde el aviso de una sincronización muestra solo lo que trajo esa sincronización (con «Revisar también lo de antes» o desde Ajustes → «Revisar pendientes» muestra todo).
- **Transferencias sin clasificar:** movimientos con categoría Transferencia (un gasto o un ingreso «transfer_in») que cuentan como gasto o ingreso porque nadie dijo a qué cuenta fue. Estadísticas los avisa y se pueden aclarar con «¿A qué cuenta fue?».

## Limitaciones que el manual debe decir con honestidad
- Lectura de SMS, sincronización automática, widget y varias detecciones son **solo Android**. En iPhone se registra a mano o se pega un SMS (botón «Pegar SMS», siempre visible).
- El banco (BAC) no manda por SMS el total de la tarjeta: ese monto se escribe a mano.
- **Sin copia de seguridad en la nube:** si se borra la app, se pierden los datos.
- **Irregular = mes calendario:** sin día de pago y sin contador de días al pago (el widget pequeño dice «N días en el período», los que quedan del mes).
- **Semanal sin feriados ni anclas:** la semana arranca siempre el día elegido; no hay inicio editable ni aviso de fin de período (el resumen semanal lo reemplaza).
- **«¿A qué cuenta fue?» solo pregunta por transferencias que vienen de un SMS** y solo con al menos 2 cuentas que no sean tarjeta; las transferencias registradas a mano se corrigen cambiando su categoría en Movimientos o con «Transferir» en Cuentas.
- **Estadísticas no convierte dólares:** el selector Q/$ muestra cada moneda por separado, y las tarjetas de más abajo (proyección, 6 meses, bancos…) siguen en quetzales.
- **Euros y libras 1:1:** solo hay tipo de cambio Q↔USD; el EUR y la libra se toman 1:1 con el quetzal.
- La lectura de SMS depende de permisos de Android y de políticas de Google Play (para una versión pública puede cambiar).

## Estructura propuesta del manual
1. Empezar en 5 minutos (instalar, onboarding, el SMS de tu pago, tu tarjeta con su corte y pago).
2. Tu pantalla de Inicio (período, score con sus 4 factores, presupuesto del período, semáforo de capacidad).
3. Registrar gastos e ingresos (a mano, pegando un SMS, automático).
4. Tu período de pago y tu sueldo (mensual, quincenal, semanal con día elegido, irregular = mes calendario; fuentes de ingreso).
5. Presupuesto: gastos fijos, categorías (límite mensual repartido por período), metas.
6. Cuentas, saldos y transferencias.
7. Tarjetas de crédito y visacuotas (corte y pago, compra, estado de cuenta, pago).
8. Deudas: ratio deuda/ingreso y cómo se mide.
9. Notificaciones y capacidad de pago.
10. Asesor IA.
11. Widget.
12. Seguridad y privacidad.
13. Preguntas frecuentes y qué hacer si algo falla.
14. Limitaciones conocidas.

(El borrador `MANUAL_USUARIO.md` sigue el orden de las pantallas de la app: 1 Primeros pasos, 2 Inicio, 3 Registrar, 4 SMS, 5 Movimientos, 6 Presupuesto, 7 Cuentas y Visacuotas, 8 Estadísticas, 9 Asesor, 10 Ajustes, 11 Biometría, 12 Notificaciones, 13 Widget, 14 Academia, 15 Preguntas frecuentes, 16 Privacidad, 17 Limitaciones. El manual final puede reorganizarlo con la estructura de arriba.)

## Formato de entrega
Pendiente de decidir con el dueño de la app: documento Word/PDF para imprimir, página web de ayuda, o ambos. Capturas de pantalla: se agregarán al final, tomadas del teléfono real.
