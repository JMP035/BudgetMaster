# Instructivo de pruebas manuales — BudgetMaster

Para: quien prueba la app en su teléfono Android (sin conocimientos técnicos).
Objetivo: comprobar, función por función, que todo sirve antes de escribir el manual de usuario.

Revisado contra el código de BudgetMaster 1.0.0 el 18 de noviembre de 2026. Contiene **P-01 y las pruebas T-01 a T-123** (124 en total). Las pruebas T-77 a T-111 comprueban las correcciones más recientes (score por período, deuda viva, tarjetas con corte y pago, ciclo semanal e irregular, presupuesto repartido por período, asesor local, tono «tú», «Pegar SMS» sin permiso, widget con ingresos irregulares, la regla exacta del patrimonio y las correcciones de la auditoría final: deudas del onboarding, reinicio de gastos fijos, deshacer sincronización, capacidad con ingreso declarado y visacuotas terminadas) y las del bloque G2 de la auditoría final (el «+ gasto» del widget con la app abierta, el widget con la foto al día, borrar todos los datos, los avisos de presupuesto, el permiso de notificaciones y la advertencia de la huella en el widget) y las del bloque de Estadísticas y gastos fijos con cuenta (T-112 a T-122: cuadros tocables y vista de ahorro explicada, aviso de transferencias sin clasificar con su interruptor, selector Q/$, «Revisar» con las preguntas «¿A qué cuenta fue?», «PENDIENTE» en una línea, y el gasto fijo con cuenta o tarjeta con su emparejamiento por SMS) y T-123 (el formato de los tutoriales: pasos cortos con frase clave, viñetas y resaltes).

Cómo usarlo: sigue cada prueba en orden. Marca **✅ pasó**, **❌ falló** o **⚠️ raro** y anota qué viste.
Si algo falla, no sigas adivinando: anota los pasos y toma una captura (ver "Cómo reportar un problema" al final).

---

## 0. Antes de empezar

### Qué necesitas
- Un teléfono **Android** con el APK del build más reciente instalado (el del enlace de EAS).
- Si ya tenías la app instalada con datos, **no la desinstales todavía**: la prueba P-01 comprueba que tus datos viejos se conservan después de actualizar. Después de esa prueba puedes borrar todo para probar el onboarding desde cero.
- Tu banco real y un SMS de tu pago (sueldo) a mano.
- Permisos del teléfono: SMS y Notificaciones (la app los pide al usar cada función; acepta para poder probarla).
- Para ver los números exactos de los avisos, **no** pegues una clave de Gemini mientras pruebas notificaciones (con clave, el texto lo redacta la IA).

### Datos de ejemplo para pegar (no necesitan SMS reales)
Úsalos en **Agregar → Pegar SMS → pegar → Analizar SMS** (el botón «Pegar SMS» está siempre visible, aunque la lectura de SMS esté apagada en Ajustes). Cambia la fecha `dd/mm/aa` por una reciente. Todos se comprobaron con el motor de lectura de la app el 18 de noviembre de 2026.

| Para probar | Texto a pegar | Debe detectar |
|---|---|---|
| Compra con tarjeta | `PRF protege tu BAC VISA: compra Aprobada por Q 220.00 en CASTOR'S PIZZA KALU    GUATE el 04/10/26 20:54 +Info:https://g.bac.gt/SMS` | Mensaje «Detectado» y formulario listo: gasto Q 220, banco BAC, descripción «BAC · Compra en Castor's Pizza Kalu», categoría Restaurantes |
| Compra en cuotas | `PRF protege tu BAC VISA: compra Aprobada por Q 2,550.00 en OPTICA ALPI STORE PERI 10 PAG el 24/07/26 21:22 +Info:https://g.bac.gt/SMS` | Aviso «Compra a cuotas detectada»: Óptica Alpi, Total Q 2,550.00, Cuotas 10, Pago mensual Q 255.00 (no es un gasto de Q 2,550; no llena el formulario) |
| Pago de tarjeta | `BAC: Hemos recibido tu pago de Q 1,500.00 a tu tarjeta VISA ****1234. Gracias` | Aviso «Pago de tarjeta detectado» por Q 1,500.00: movimiento neutro, **no** es gasto y no llena el formulario |
| Sueldo, formato 1 | `BANRURAL: Recibiste Q7,426.61 en tu cuenta Monetaria *** ****5051 de SECCION DE OPERACIONES DE DEPOSITOS, el 27/10/2026 a las 10:31.` | Ingreso Q 7,426.61, banco BANRURAL, descripción «BANRURAL · Transferencia recibida», categoría Transferencia (por eso la prueba T-20 la cambia a Salario); origen «SECCION DE OPERACIONES DE DEPOSITOS» |
| Sueldo, formato 2 | `BANRURAL: Amigo, se acredito a tu Cuenta Monetaria ****5051  Q. 7,426.60  en: SECCION DE OPERACIONES DE DEPOSITOS` | Ingreso Q 7,426.60 con el mismo origen y cuenta que el anterior (este SMS no trae fecha: toma la de hoy) |
| Débito Banrural | `Banrural: Se debito Q.200.00 de tu Cuenta ****5678` | Gasto Q 200, banco BANRURAL, descripción «BANRURAL · Transferencia enviada», categoría Transferencia |
| Texto que no es del banco | `Hola, nos vemos mañana a las 5 para cenar` | Aviso «No se registró» con el motivo; no inventa un monto |

> Los dos SMS de sueldo son del formato real de Banrural. Si tu banco o tu pago son distintos, usa **tu propio** SMS: la app está hecha para aprender el de cada persona. El SMS de sueldo formato 1 trae la fecha 27/10/2026, que cayó **martes**: sirve de ejemplo para la prueba semanal con pago en martes (T-83).

### Calendario de referencia (comprobado)
- **Septiembre de 2026:** el 25 es viernes, el 26 sábado y el **27 domingo**. Con la regla «Viernes antes», un pago del 27 empieza su período el viernes 25.
- **Noviembre de 2026:** el 10 es martes, el 17 martes y el 18 miércoles; el 27 es viernes y el 28 sábado.
- Si pruebas en otra fecha, busca un mes en que tu día de pago caiga sábado o domingo, o usa la variante «día de pago = hoy / el sábado siguiente» que explican T-77 y T-83.

### Datos para las pruebas T-77 a T-90
- Una cuenta de banco activa y, para la mayoría, **un presupuesto mensual de Q 4,000** (Ajustes → Presupuesto Mensual) y **un límite de Q 1,500 para Comida** (Presupuesto → Categorías). Con esos números, cada ciclo da lo siguiente:

| Ciclo | Presupuesto del período | Límite de Comida (Q 1,500 al mes) |
|---|---|---|
| Mensual | Q 4,000.00 | Q 1,500.00 |
| Irregular (mes calendario) | Q 4,000.00 | Q 1,500.00 |
| Quincenal (×0.5) | Q 2,000.00 por quincena | Q 750.00 por quincena |
| Semanal (×12/52) | Q 923.08 por semana | Q 346.15 por semana |

- Una fuente de ingreso **base mensual** de Q 5,000 (Presupuesto → Ingresos), para que los porcentajes del ratio de deuda salgan redondos. Si la tuya tiene otro monto, usa los mismos porcentajes sobre tu «Ingreso base del período». Ojo: si la fuente ya tiene un depósito vinculado, el ratio usa el monto de ese último depósito.
- Tipo de cambio de Ajustes conocido (por ejemplo Q 7.70 por dólar).
- Anota tu configuración real (ciclo, día de pago, presupuesto, monto de la fuente) para **restaurarla** al terminar.

### Cómo apuntar resultados
Al final hay una tabla resumen. Mientras pruebas, anota el código de la prueba (por ejemplo **T-12**) y el resultado.

---

## 1. Actualización y datos viejos

**P-01 — Migración de datos (solo si ya tenías la app con datos)**
1. Antes de instalar el build nuevo, anota: cuántos movimientos tienes, tus cuentas, tus gastos fijos y tus visacuotas.
2. Instala el APK nuevo **encima** (sin desinstalar).
3. Abre la app.
- Esperado: no pide onboarding de nuevo; tus movimientos, cuentas, gastos fijos y metas siguen ahí.
- Esperado: los movimientos que tenían categoría "Pago Militar" ahora dicen **Salario** (Movimientos → abrir uno).
- Esperado: tus visacuotas siguen; no aparecen cuotas de meses pasados cargadas de golpe.
- Esperado: tus cuentas muestran "Sin saldo" (tarjetas) o conservan su saldo (las demás).
- Esperado: si tu ciclo era semanal, sigue siendo semanal con período de domingo a sábado (ver T-84).

---

## 2. Primer uso (onboarding)

> Para probar esto desde cero: **Ajustes → Zona de peligro → Borrar todos los datos** (pierdes todo; hazlo solo cuando termines la P-01).

**T-01 — Recorrido inicial (4 pasos obligatorios)**
1. Abre la app limpia.
2. Completa los 4 pasos: nombre; ingreso y moneda; ciclo y día(s) de pago; meta de ahorro. La barra dice «Paso N de 4».
- Esperado: cada pantalla avanza sin trabarse; el teclado no tapa el campo ni deja un hueco grande; «Continuar» está apagado mientras falte un dato.
- Esperado: si eliges quincenal, te pide dos días (ej. 15 y 30); si eliges semanal, te pide el día de la semana (chips Dom a Sáb); si eliges irregular, no pide ningún día.
- Esperado: en el paso del ciclo aparece el recuadro **«Así se va a medir tu dinero»** con tus fechas.
- Esperado: al cerrar la app a la mitad y volver a abrirla, ves «Seguimos donde te quedaste».

**T-02 — Paso "SMS de tu pago"**
1. Toca «Configurar ahora». En el paso opcional «El SMS de tu pago» (viene después de «Cuentas y tarjetas»), pega el SMS de sueldo (formato 1 o el tuyo).
2. Toca «Analizar SMS» y revisa la tarjeta «Entendimos».
- Esperado: muestra banco, cuenta (solo terminación, por ejemplo «***5051», no el número completo), quién envía y monto aproximado.
- Esperado: **Sí, es así** y **Corregir** funcionan; **Usar otro SMS** vuelve al cuadro; **Lo hago después** salta el paso.
- En Android con el permiso de SMS ya dado, **Elegir de mis SMS** lista tus últimos depósitos para tocar el de tu pago.

**T-03 — Qué queda al terminar**
- Esperado: la última pantalla pregunta «¿Quieres un recorrido guiado?» con **Sí, mostrarme** y **Más tarde**.
- Esperado: en el Inicio aparece la **Guía y primeros pasos**; si saltaste el paso del SMS, sigue el pendiente **"Enseñarle a la app tu pago"**; si elegiste «Más tarde», queda «Hacer el recorrido guiado».
- Esperado: en **Presupuesto → Ingresos** ya existe tu primera fuente de ingreso («Sueldo», «Quincena», «Pago semanal» o «Mis ingresos», según tu ciclo).

---

## 3. Pantalla de Inicio

**T-04 — Encabezado y período**
- Esperado: nombre, rango del período, «Día N de M del período» y, a la derecha, los días al próximo pago (por ejemplo «5d»; rojo si faltan ≤3; no aparece si tu ciclo es irregular). En Presupuesto → Gastos fijos, el resumen «PRÓX. PAGO» muestra «—» con ciclo irregular.
- Toca el rango del período: se abre «Cuándo empieza tu período» con **de dónde sale el inicio** ("Empezó con tu sueldo del…", "Adelantado por fin de semana o feriado", "Fijado por ti" o "Es tu día de pago").

**T-05 — Tarjetas del Inicio**
- Esperado: guía, briefing, Score (con su ícono de información ⓘ), Patrimonio, balance por moneda, presupuesto del período (anillo), widgets de Cuentas/Gastos fijos/Metas, gráfica de 6 meses y transacciones recientes cargan sin errores.
- Toca el ⓘ del Score: se abre «Tu score financiero» con 4 factores (Tasa de ahorro, Presupuesto del período, Gastos fijos, Cuentas activas), cada uno con sus puntos. Toca «Entendido».
- Desliza hacia abajo para recargar: debe refrescar sin cerrarse.

**T-06 — Encabezado sin texto partido**
- Con un nombre largo, el saludo no debe partirse letra por letra; el aviso "N sin clasificar" va en su propia fila.

---

## 4. Registrar gastos e ingresos

**T-07 — Gasto manual**
1. Agregar (botón ➕) → Gasto → monto 50 → descripción "Prueba" → categoría Comida → Guardar.
- Esperado: aparece en Movimientos y en las recientes; el anillo del presupuesto del Inicio sube.
- Esperado: **no** llega una notificación por ese gasto.

**T-08 — Ingreso manual y moneda**
1. Agregar → Ingreso → Q 100 → categoría Salario.
2. Repite en USD.
- Esperado: los totales por moneda quedan separados (Q y USD no se mezclan).

**T-09 — Validación**
- Monto vacío o 0 → debe mostrar «Monto inválido» y no guardar.

**T-10 — Categoría nueva al vuelo**
1. En Agregar, al final de la lista toca **+ Nueva categoría**.
2. Escribe un nombre, elige "Gastos" (o "Ingresos"), color e ícono → Crear categoría.
- Esperado: queda **seleccionada** para ese movimiento. El tipo ya viene elegido según la pestaña.
- Repite desde el **detalle de un movimiento** y desde el **buzón de SMS sin clasificar**.

**T-11 — Pegar un SMS**
1. Agregar → **Pegar SMS** → pega "Compra con tarjeta" → Analizar SMS.
- Esperado: monto, banco y comercio rellenados; puedes guardar.
2. Pega "Compra en cuotas" y "Pago de tarjeta".
- Esperado: cada uno muestra su aviso (ver la tabla de la sección 0) y no llena el formulario.
3. Pega un SMS que no sea bancario (cualquier texto).
- Esperado: avisa «No se registró» y no inventa un monto.

---

## 5. Categorías y "Pago Militar"

**T-12 — "Pago Militar" ya no existe**
- Agregar → Ingreso: la lista **no** muestra "Pago Militar" (debe haber 9 predefinidas + las tuyas). En Gasto hay 22 predefinidas.

**T-13 — Editar una categoría propia**
1. Ajustes → Mis Categorías → toca una propia.
- Esperado: se abre "Editar categoría" con sus datos; cambiar nombre/color/ícono guarda y se refleja en Movimientos.

---

## 6. Sincronización por SMS (Android)

**T-14 — Permiso y primera sincronización**
1. Ajustes → Sincronización de SMS: verifica que esté «Activado».
2. En el Inicio toca el botón ⟳.
- Esperado: pide permiso (acepta). Muestra «Sincronización completa» con «N movimientos importados» y, debajo, líneas como «SMS revisados», «Mensajes bancarios» y «Ya registrados» (o «Todo al día» si no había nada nuevo).
- Esperado: no importa mensajes personales; los importados llevan la etiqueta **SMS**.
- Mantener presionado ⟳ pide confirmación y relee los últimos 3 meses («SMS revisados (últimos 3 meses)»).

**T-15 — Sin duplicados**
- Vuelve a tocar ⟳: no debe duplicar nada (verás «Todo al día» o "ya registrados").

**T-16 — Deshacer una sincronización**
- Si el resumen ofrece **Deshacer**, tócalo (también está en Ajustes → «Deshacer última sincronización»).
- Esperado: se quitan los movimientos de ese lote (y los cargos de cuotas / vínculos de ingreso que generó).

**T-17 — Ver el SMS original**
- Movimientos → toca un movimiento por SMS → "Ver SMS original": muestra el texto completo.

---

## 7. Movimientos

**T-18 — Buscar y filtrar**
- Busca por una palabra; filtra por Gastos / Ingresos / moneda. Esperado: la lista responde bien.

**T-19 — Editar y eliminar**
- Abre un movimiento, cambia descripción/categoría → Guardar: se refleja.
- Elimínalo (pide confirmación): desaparece y los totales se ajustan.

**T-20 — "Recordar" comercio e ingresos**
1. Toma un **gasto por SMS**, cambia su categoría, deja activo "Recordar" → Guardar.
2. Toma un **ingreso por SMS** (el sueldo), cambia su categoría a **Salario**, deja activo **"Recordar para los depósitos de…"** → Guardar.
- Esperado: los próximos movimientos del mismo comercio / del mismo origen de depósito llegan ya con esa categoría.
- Esperado: la opción «Aplicar también a N movimientos anteriores…» corrige los parecidos que no editaste a mano.
- Esperado: en un ingreso sin remitente en el SMS, avisa «Este SMS no dice de dónde viene el dinero; no se puede recordar.».

---

## 8. Centro de revisión

**T-21 — No insiste con lo que ya editaste**
- Si cambiaste a mano un ingreso a **Salario**, el Centro de revisión **no** debe proponer devolverlo a "Transferencia".

**T-22 — Botón "Dejar así"**
1. Abre el Centro de revisión (aviso "Revisar" o Ajustes → Revisar pendientes) → Movimientos dudosos.
2. En un movimiento toca **Dejar así**.
- Esperado: desaparece al instante y **no** vuelve a sugerirse después. Si dejas el último, regresa solo al Centro de revisión.

**T-23 — Secciones del Centro de revisión**
- Esperado (cuando aplique): "Movimientos dudosos", "Posibles duplicados", "Gastos fijos por confirmar", "Transferencias entre tus cuentas", "¿A qué cuenta fue?", "¿Es tu Sueldo?" (lleva el nombre de tu fuente; botones «Sí, es mi pago» y «No»), "¿Es el pago de tu tarjeta?", "Compras sin cuenta" y "Sin clasificar".
- Solo una ventana abierta a la vez; no se traban ni se superponen.

---

## 9. Presupuesto

**T-24 — Gastos fijos**
1. Presupuesto → Gastos Fijos → ➕ → nombre "Internet", monto, día de vencimiento, categoría.
2. Márcalo pagado (casilla; la app pregunta la fecha de pago).
- Esperado: se tacha, suma al progreso y (con AUTO activado) crea el gasto en Movimientos.
3. Desmárcalo: vuelve a pendiente.
- Esperado: si pasa su día sin pagar, muestra **VENCIDO**.

**T-25 — Fijo ligado a un SMS**
- Con un SMS de ese pago, el Centro de revisión (o el sync) debe ofrecer vincularlo; confirmarlo marca el fijo como pagado con la fecha del mensaje.

**T-26 — Presupuesto por categoría**
- Categorías → asigna un límite **mensual** (ej. Comida Q 1,500) → barra de avance; amarillo al 80 %, rojo al pasarte. Con ciclo mensual la tarjeta muestra «de Q 1,500.00»; con quincenal o semanal, ver T-86 y T-87.
- Toca una categoría con gasto: se abre el desglose con sus movimientos. «Gastos sin presupuesto» lista las categorías con gasto sin límite.

**T-27 — Metas de ahorro**
- Crea una meta (nombre, monto, fecha límite AAAA-MM-DD). Abona. Esperado: % completado, restante y "cuánto ahorrar por mes". Al llegar al 100 % pasa a Completadas.

**T-28 — Pestaña Ingresos (fuentes)**
1. Presupuesto → **Ingresos**. Esperado: ves tu primera fuente y el **Ingreso base del período**.
2. ➕ → crea una fuente: nombre "Sueldo", monto, ciclo (mensual), día, **Base**, cuenta donde te pagan.
3. En "SMS de ejemplo" pega el sueldo (formato 1) → **Analizar SMS**.
- Esperado: "Entendimos: banco · cuenta · de quién · monto aproximado" con **Sí, es así / Corregir**.
- Esperado: sin SMS de ejemplo la fuente se guarda igual y avisa que no se detectará sola.

**T-29 — Estados de la fuente**
- Esperado: chip **Esperado** (aún no llega), **Recibido** (ya llegó) o **Atrasado**.
- Si tu ingreso real difiere de lo declarado en más de 5 %, aparece "¿actualizar el declarado?" con **Actualizar**.

**T-30 — Extras**
- Crea una fuente tipo **Extra** (ej. Bono 14 → julio). Esperado: **no** suma al ingreso base del período.

**T-31 — Vincular un depósito**
- En Movimientos abre un ingreso → **Vincular a fuente de ingreso** → elige la fuente. Esperado: toma su categoría. **Quitar vínculo con la fuente** lo suelta.

---

## 10. Período de pago (el caso del 27 que cae en domingo)

> Ejemplo de referencia: **septiembre de 2026**. El 27 cae domingo; con la regla «Viernes antes» el período arranca el **viernes 25**. Si pruebas en otro mes, busca uno en que tu día de pago caiga sábado o domingo.

**T-32 — Reglas de fin de semana y feriados**
1. Ajustes → Ingresos y período → **Cuándo empieza mi período** (o toca el rango en el Inicio).
2. Cambia **Viernes antes / Lunes después / Día exacto**, feriados de Guatemala, tolerancia (1–7) y "Adelantar el período cuando llega el sueldo" → **Guardar reglas**.
- Esperado: el período y los días al cobro se recalculan. Por defecto: «Viernes antes», feriados encendidos, tolerancia 3 y adelantar encendido.

**T-33 — Fijar el inicio a mano**
- En ese detalle elige otra fecha cercana → **Guardar**. Esperado: el período empieza ahí, el origen dice «Fijado por ti» y la app **no lo cambia sola**.
- **Volver a automático** lo devuelve. Los chips **no** ofrecen fechas futuras.

**T-34 — El sueldo que llega antes**
1. Con una fuente base mensual configurada para el día 27 (septiembre de 2026: domingo), sincroniza (o vincula) un depósito que llegó el viernes 25.
- Esperado: el período empieza el 25 («Empezó con tu sueldo del vie 25»); los gastos del 25 y 26 cuentan en el período nuevo; los gastos fijos pagados no se reinician.

**T-35 — Cambiar el ciclo o el día de pago**
- Ajustes → Ciclo de pago: cambia el día (o a quincenal con dos días, o a semanal con un día de la semana) → **Guardar ciclo y día de pago**. Esperado: valida (días 1–31, dos distintos si es quincenal, día de la semana si es semanal) y el período cambia. Se guarda con su propio botón, no con «Guardar Cambios».

**T-36 — Aviso único**
- La primera vez que tu período empieza antes/después de tu día de pago, aparece un aviso **una sola vez**: «Ahora tu período puede empezar antes si tu día de pago cae en fin de semana o feriado…» con **Ver**.

---

## 11. Cuentas y tarjetas

**T-37 — Crear cuentas**
- Cuentas → ➕: una de banco (Banrural), una de banco (BAC) y una **tarjeta de crédito** con **día de corte** y **día de pago**.
- Esperado: la ayuda dice "Día de corte = la fecha de «Saldo al corte» de tu estado de cuenta…". Si dejas vacío el corte o el pago, ves «Sin estos días no hay fecha de pago, recordatorios ni semáforo de capacidad.» (ver T-81).
- Esperado: la tarjeta con ambos días muestra «Corte: día N · Pago: día N» y no tiene insignia de configuración.

**T-38 — Modos de saldo**
1. Edita una cuenta de banco: **Saldo → Sin seguimiento / Manual / Automático**.
2. En **Automático** escribe un **saldo de partida** y su fecha.
- Esperado: sin seguimiento no suma al patrimonio; manual solo cambia cuando lo editas; automático sube/baja solo con ingresos, gastos y transferencias de esa cuenta.

**T-39 — Ajustar al saldo real**
- En una cuenta automática toca **Ajustar al saldo real** → escribe el saldo del banco. Esperado: la app sigue desde ahí.

**T-40 — Ciclo abierto de la tarjeta (con y sin SMS)**
1. Registra 2 gastos a mano eligiendo esa tarjeta en "Cuenta" (uno en Q y uno en USD).
- Esperado: "Ciclo abierto: Q … · $ …" separados por moneda. Funciona también con la lectura de SMS apagada.

**T-41 — Estado de la tarjeta**
- Para que el estado tenga saldo, registra una compra con esa tarjeta con una **fecha anterior al último corte** (Agregar permite elegir la fecha; después, en el detalle del movimiento, elige la tarjeta en «Cuenta»). Sin cargos en el ciclo cerrado, el estado dice «Sin saldo en este estado» y «Pagado».
- En el detalle: **Estado al {corte}** con la etiqueta **Estimado**, "Paga antes del {fecha}" y el estado (Pendiente/Pago parcial/Pagado/Vencido).
- Con corte el 9 y pago el 2, la fecha límite debe ser **el 2 del mes siguiente**. Una compra hecha el día del corte entra en ese estado; la del día siguiente, en el próximo.

**T-42 — Monto real del estado**
- **Ingresar monto real**: escribe Q 9,276.01 y USD 39.67 (o los tuyos). Esperado: la etiqueta pasa a **Del estado de cuenta** y usa esos montos; vacío = vuelve al estimado.

**T-43 — Registrar un pago**
1. **Registrar pago**: paga solo una parte en Q.
- Esperado: estado **Pago parcial**; lo que falta sigue pendiente; el USD sigue pendiente aparte.
2. Verifica en Estadísticas/Inicio que el pago **no** se suma a tus gastos.
- Esperado: si la cuenta con la que pagas lleva saldo, baja ese saldo.

**T-44 — Deuda programada**
- Presupuesto → Gastos Fijos → **Deuda programada**: lista la tarjeta con vencimiento y monto, sin duplicar lo que ya sea un gasto fijo.

---

## 12. Visacuotas

**T-45 — Crear una visacuota**
- Cuentas → Visacuotas → ➕: tarjeta, nombre "Laptop", total 6,000, cuota 500 → el número de cuotas debe salir **12** (no 13).
- Esperado: el formulario muestra **tus** categorías personalizadas, no solo las predefinidas.

**T-46 — Compra en cuotas por SMS**
- Pega o sincroniza el SMS de "Compra en cuotas" (Q 2,550 en 10 pagos). Esperado: se crea la visacuota (no un gasto de Q 2,550).

**T-47 — Una cuota por corte**
- Esperado: cada corte de la tarjeta carga **una** cuota como gasto, fechada el día del corte, con la categoría de la visacuota. La lista muestra **Próxima cuota**. Si dejas la app cerrada varios cortes, al abrirla pone al día todas sin duplicar.

**T-48 — Casos especiales**
- Visacuota con cuotas ya pagadas: solo carga las siguientes (nada del pasado).
- **Sin tarjeta (préstamo)** con día de pago.
- Borra una visacuota: los cargos ya hechos **se conservan**. Borra a mano un cargo de cuota: **no** se vuelve a crear.
- La última cuota cargada: la visacuota termina sola.

---

## 13. Transferencias entre cuentas (Banrural → BAC → tarjeta)

**T-49 — Transferir a mano**
- Cuentas → **Transferir** (necesitas ≥2 cuentas que no sean tarjeta): origen, destino, monto, fecha.
- Esperado: queda como movimiento **transferencia** (ni gasto ni ingreso); con saldos activos, uno baja y el otro sube.
- Otra moneda: sugiere el monto de destino con el tipo de cambio y lo puedes corregir.

**T-50 — Transferir a una tarjeta**
- Elige una tarjeta como destino: te lleva a **Registrar pago** con la cuenta de origen ya elegida.

**T-51 — Borrar una transferencia**
- Borra una transferencia manual: las cuentas de saldo **manual** recuperan lo que se movió.

**T-52 — Pares de SMS**
- Con el SMS de salida (Banrural) y el de entrada (BAC) del mismo monto, la app los junta como una sola transferencia neutra (se ve en el Centro de revisión, con «Sí, es mi transferencia», o automáticamente si reconoce tu cuenta).

**T-53 — ¿A qué cuenta fue?**
- Con solo una de las dos mitades, el Centro de revisión pregunta **¿A qué cuenta fue?** con chips de tus cuentas, o "A otra persona / Ingreso externo".

**T-54 — Flujo completo**
1. Sueldo entra a Banrural (modo Automático).
2. Transfieres a BAC.
3. Pagas la tarjeta desde BAC.
- Esperado: Banrural sube y luego baja; BAC sube y luego baja; la tarjeta no lleva saldo; **el gasto del período solo cuenta las compras**, no la transferencia ni el pago.

---

## 14. Estadísticas

**T-55 — Pantalla de estadísticas**
- Cambia entre Per. Actual / Per. Anterior / Este Año / Todo. Esperado: cuadros de ingresos, gastos y ahorro tocables con el pastel por categoría (tocable) o la vista de ahorro con la tasa de ahorro (ver T-112 a T-116), flujo proyectado, comparativa de 6 meses, ahorro acumulado, gasto promedio diario (con tu presupuesto diario ideal = presupuesto **del período** ÷ días del período), días sin gastar, gasto por banco (si hay gastos con banco), **Ratio Deuda / Ingreso** (solo si hay cuotas activas), velocidad de gasto (solo en Per. Actual) y proyección de ahorro, sin errores ni valores absurdos.
- El ratio no cambia al cambiar el filtro de período.

---

## 15. Asesor IA

**T-56 — Modo local (sin clave)**
- El encabezado dice «Modo local». Pregunta "¿Cómo voy este mes?" Esperado: responde con tus datos reales.

**T-57 — Órdenes**
- Escribe "Gasté 85 en gasolina ayer". Esperado: muestra una tarjeta con el resumen y **Confirmar / Editar / Cancelar**; escribir "sí" **no** guarda; solo **Confirmar** guarda. Prueba **Deshacer** después.
- Prueba también: crear una meta, un límite por categoría, un gasto fijo y "Me pagaron Q6,000 de sueldo".

**T-58 — Consultas**
- "¿Cuánto gasté en Restaurantes este período?", "¿Qué gastos fijos me faltan por pagar?", "¿Cómo van mis presupuestos?". Esperado: responden sin cambiar nada; los dólares no se suman a los quetzales.

**T-59 — Con Gemini (opcional)**
- Pega tu clave en Ajustes → Inteligencia Artificial → Guardar Cambios. El encabezado del chat debe decir "Gemini activo". Sin internet, debe volver al modo local.

---

## 16. Notificaciones

**T-60 — Aviso de prueba**
- Ajustes → Notificaciones → Configurar notificaciones → **Enviar aviso de prueba**. Esperado: llega en pocos segundos; si el permiso está denegado, te lo dice y te lleva a los ajustes del teléfono.

**T-61 — Configuración**
- Cambia hora de recordatorios (6 am a 12 pm), resumen diario, horas silenciosas y máximo por día (1 a 8) → **Guardar**. Esperado: se guardan (con su propio botón) y el resumen de la sección cambia («Resumen diario 8:00 pm · Recordatorios 8:00 am · Silencio 10 pm–7 am»).

**T-62 — Avisos programados**
- Con un gasto fijo, una tarjeta con corte/pago y una visacuota: esperado recibir, en su momento, recordatorio de fijo (3 días antes, 8:00), pago de tarjeta (5 días, 1 día y el mismo día), corte de tarjeta (el día antes), última cuota, fin de período (el día antes de que cierre; no se programa si tu ciclo es semanal) y el **resumen del día** (20:00). El resumen semanal llega los domingos a las 20:00 (o el último día de tu semana si cobras semanal, ver T-83). **Nada** entre las 22:00 y las 7:00.

**T-63 — Sin aviso por cada gasto**
- Registra varios gastos pequeños: **no** debe llegar una notificación por cada uno; solo avisos de umbral (50/80/100 % del presupuesto **del período**, y 80/100 % de una categoría) una vez por período.

**T-64 — Llegó tu sueldo**
- Al reconocerse tu depósito de sueldo debe llegar "Llegó tu sueldo… comprometido X, libre Y".

**T-65 — Capacidad de pago**
- Con una tarjeta con corte y pago configurados: aparece el **semáforo** bajo el anillo del Inicio con el texto «Capacidad de pago: N% comprometido»; verde («Te alcanza») <70 %, ámbar («Ojo con este pago») ≥70 %, rojo desde el 90 % («Casi al límite») y «No alcanza» al llegar al 100 %. Tócalo: muestra «Lo que tendrás», «Lo que debes hasta esa fecha», el resultado («Te quedarían Q… libres» o «Te faltarían Q…») y de dónde salen los recursos (saldos o ingreso declarado).
- Se oculta si no hay tarjetas con corte/pago.

---

## 17. Widget (Android) — lo más riesgoso, probar con calma

**T-66 — Agregarlo**
- Mantén presionado un espacio vacío del inicio → **Widgets** → **BudgetMaster** → elige **Pequeño** y luego **Mediano** → arrástralos. Abre la app una vez antes.
- Esperado: aparecen sin cerrar la app ni el launcher.

**T-67 — Contenido**
- Pequeño: disponible del período y días al cobro. Mediano: disponible por día, barra de presupuesto, próximo pago de tarjeta, próximo fijo, semáforo y saldos.
- Anota si el mediano se ve **apretado o cortado** en tu pantalla.
- Si tu ciclo es irregular, el pequeño dice «N días en el período» (los que quedan del mes; no hay próximo pago que contar) y nunca «Hoy cobras» (ver T-92).

**T-68 — El ojo**
- Por defecto los montos salen ocultos (••••). Toca el **ojo**: se ven; vuelve a tocarlo: se ocultan. Vale para los dos widgets. Días, % y semáforo se ven siempre.

**T-69 — "+ gasto"**
- Toca **+ gasto**: abre la app en la pestaña **Agregar**. Con biometría activada, pide la huella primero.

**T-70 — Actualización**
- Registra un gasto y vuelve al inicio del teléfono: el widget debe reflejar el cambio (puede tardar unos minutos).

---

## 18. Seguridad y ajustes

**T-71 — Biometría**
- Ajustes → Seguridad biométrica (solo aparece si tienes huella/rostro configurado). Activa y minimiza la app: pide huella **solo si pasaron más de 30 segundos**; menos que eso no debe reiniciarla ni bloquearla. Al cerrar y abrir la app de cero, siempre la pide.

**T-72 — Tipo de cambio**
- Ajustes → Tipo de cambio: ⟳ actualiza (Banguat) o puedes escribirlo a mano.

**T-73 — Guardar Cambios**
- Cambia el presupuesto o el nombre y **no** toques Guardar Cambios: no debe aplicarse. Con el botón, sí. (Las secciones de ciclo, reglas, notificaciones y el interruptor de SMS tienen su **propio** guardado.)

**T-74 — Zona de peligro**
- Borrar todos los datos (solo al final): pide confirmación, borra todo y vuelve al onboarding.

---

## 19. Tutoriales (Academia)

**T-75 — Tutoriales de proceso**
Recorre cada uno desde la guía del Inicio (Centro de ayuda): **Tu período**, **Tu sueldo**, **Visacuotas**, **Compra con tarjeta**, **Pagar la tarjeta**, **Saldos y transferencias**, **Widget**.
- Esperado: cada paso señala algo que **existe** en pantalla; nunca queda apuntando a una pantalla vacía.
- Si falta una cuenta/tarjeta/fuente, el paso lo dice y ofrece **Crearlo ahora**.
- Los tutoriales de SMS se ocultan si apagas la lectura de SMS; el del widget dice "solo Android" en otras plataformas.

**T-76 — Reiniciar**
- Ajustes → Academia → **Reiniciar todos los tutoriales**: los vistos vuelven a estar sin marcar.

---

## 20. Correcciones recientes (T-77 a T-123)

Estas pruebas comprueban lo corregido en los últimos cambios. Varias cambian tu ciclo o tu presupuesto **temporalmente**: al terminar, vuelve a poner tu configuración real (anótala antes, ver la sección 0).

### Score y cifras del período

**T-77 — Score del período: el ahorro queda «pendiente» el día 1 (sueldo del 25 y del 27)**
Antes: una cuenta activa, un presupuesto mensual mayor a 0 y **ningún ingreso registrado en el período actual** (si hoy ya registraste un ingreso, usa otro día de pago o elimina ese ingreso para esta prueba).

*Caso A: sueldo del 25 (día hábil).*
1. Ajustes → Ingresos y período → Ciclo de pago → **Mensual** → escribe como día de pago el **día de hoy** (hazlo en un día hábil que no sea feriado: así hoy es el día 1 del período) → **Guardar ciclo y día de pago**.
2. Inicio. Esperado: el encabezado dice «Día 1 de N del período». Bajo la barra del Score ves «Se calcula con lo que registras en tu período actual (…), no con tu ingreso declarado.» y «Tu ingreso de este período aún no aparece: el ahorro todavía no suma.».
3. Toca el ícono ⓘ del Score. Esperado: «Tu score financiero», «Empieza en 50 y se ajusta con lo que registras en tu período actual (…), no con el mes calendario.» y 4 filas: **TASA DE AHORRO** (ícono de reloj, «0», «Tu ingreso de este período todavía no está registrado: el ahorro no suma ni resta»), **PRESUPUESTO DEL PERÍODO** («+15» si lo gastado cabe en el presupuesto), **GASTOS FIJOS** y **CUENTAS ACTIVAS** («+5»). Al pie: «El resultado va de 0 a 100. Las transferencias entre tus cuentas y los movimientos en otras monedas no cuentan.».
4. Agrega un gasto de Q 100 (Comida). Esperado: el ahorro **no resta**: TASA DE AHORRO sigue en «0» y «pendiente»; no aparece «−15» ni «Gastaste más de lo que ingresó en el período».
5. Agrega un ingreso de Q 5,000 (Salario) con fecha de hoy. Esperado: TASA DE AHORRO pasa a **«+20»** con «Ahorras 98% de tu ingreso del período (20% o más suma 20)» (98 % si Q 100 es todo lo que gastaste en el período) y desaparece la línea «Tu ingreso de este período aún no aparece…».

*Caso B: sueldo del 27 que cae domingo.* En septiembre de 2026 el período del 27 arranca el viernes 25 (día 1). Si pruebas otro mes, hazlo **un viernes**: pon como día de pago el del sábado siguiente (por ejemplo, el viernes 27 de noviembre de 2026 → día de pago 28) y guarda.
6. Esperado: «Día 1 de N del período»; al tocar el rango, el origen dice «Adelantado por fin de semana o feriado».
7. Repite 2 a 5. Esperado: el mismo comportamiento: sin ingreso, el ahorro es «pendiente» y no resta; al registrar el ingreso, suma.
- Esperado en ambos casos: el primer día del período, con gastos y sin sueldo, el score **no** se castiga por el ahorro.

**T-78 — Una sola cifra de gasto: anillo, score, avisos y widget**
Antes: sin clave de Gemini, ciclo mensual, presupuesto mensual temporal de **Q 200**, dos cuentas de banco (A y B) y una tarjeta de crédito. Apunta el gasto en Q que ya llevas en el período (G0; si empiezas en un período vacío, G0 = 0).
1. Agrega un gasto de Q 100 (Comida).
2. Agrega un gasto de $ 20 (USD).
3. Cuentas → **Transferir** Q 500 de A a B.
4. Registra un pago de Q 50 a la tarjeta (en la tarjeta, que debe tener corte y pago: «Registrar pago»).
- Esperado: el gasto en Q del período es **G0 + Q 100** (solo el primer gasto). La transferencia, el pago de tarjeta y el gasto en dólares **no** suman a la cifra en quetzales.
- Esperado, con G0 = 0, la **misma cifra Q 100** en todos lados: Balance por moneda (GASTOS Q 100.00; el USD aparece aparte); anillo «50%» «USADO», «Q 100.00» «de Q 200.00»; Score ⓘ «Gastaste Q100.00 de Q200.00 de presupuesto (suma 15)»; barra del presupuesto del widget mediano al 50 % (monto con el ojo abierto); y el aviso de umbral al registrar el gasto de Q 100: «📊 Vas en la mitad de tu presupuesto» / «Llevas el 50% de tu presupuesto. Te quedan Q100.00 para N días…» (si no estás en horas silenciosas).
- Esperado en Estadísticas (Per. Actual): los gastos en Q coinciden con los de arriba.
5. (Android con SMS) Con el par de SMS de T-52, antes de emparejarlos la salida cuenta como un gasto de ese monto. En el Centro de revisión, «Transferencias entre tus cuentas» → **Sí, es mi transferencia**. Esperado: ese gasto sale **de todas las cifras a la vez** (balance, anillo, score, avisos y widget) y ninguna sigue contándolo.
- Al terminar, restaura tu presupuesto mensual.

### Deuda: ratio deuda / ingreso

**T-79 — Ratio deuda/ingreso: se mide desde las cuotas reales**
Antes: tu fuente base mensual en Q 5,000 y un tipo de cambio conocido (aquí Q 7.70). Si tu app viene del onboarding nuevo y declaraste deudas con cuota, ya verás cuotas «onb_» en el ratio: anota tu punto de partida.
1. Cuentas → ➕: **Tarjeta Crédito**, nombre «BAC USD», moneda **USD**, corte 9, pago 2.
2. Cuentas → Visacuotas → ➕: tarjeta «BAC USD», nombre «Laptop USD», monto total 300, cuota mensual 50 (cuotas: 6) → Guardar Visacuota.
- Esperado: Estadísticas muestra la tarjeta **«Ratio Deuda / Ingreso (cuotas mensuales)»** con **7.7%** en verde y «Q 385/mes en cuotas (1) frente a tu ingreso de Q 5,000/mes (de tus fuentes). Tus cuotas están bajo control.» (la cuota en dólares se convierte: 50 × tipo de cambio).
3. Agrega una segunda visacuota en Q de 500 al mes (otra tarjeta, o «Sin tarjeta (préstamo)»).
- Esperado: sube a **17.7%** (Q 885/mes, 2 cuotas), todavía verde.
4. Elimina («🗑») la visacuota en USD.
- Esperado: baja a **10.0%** (Q 500/mes, 1 cuota). Una visacuota que termina sola tras cargarse su última cuota deja de contar igual. Si eliminas la última, la tarjeta del ratio desaparece.
5. *Fuentes contra declarado.* Con una cuota activa, elimina tu fuente de ingreso base (Presupuesto → Ingresos).
- Esperado: el ratio sigue, pero ahora dice «(declarado)» y se mide contra el ingreso que declaraste al configurar la app. Vuelve a crear tu fuente después.
6. *Fronteras 20 y 40.* Elimina antes las demás visacuotas. Con tu ingreso en Q 5,000 y un solo préstamo («Sin tarjeta (préstamo)», total 100,000), cambia su cuota mensual y revisa en cada caso:

| Cuota mensual | Ratio | Color | Texto |
|---|---|---|---|
| Q 995 | 19.9% | verde | «Tus cuotas están bajo control.» |
| Q 1,000 | **20.0%** | ámbar | «Entre 20 % y 40 %: conviene no sumar cuotas nuevas.» |
| Q 2,000 | **40.0%** | ámbar | «Entre 20 % y 40 %: conviene no sumar cuotas nuevas.» |
| Q 2,005 | 40.1% | rojo | «Más del 40 % de tu ingreso se va en cuotas.» |

- Esperado: exactamente 20.0 % y 40.0 % siguen siendo «moderado» (ámbar); el color siempre coincide con el número que ves.
- Esperado en el onboarding: al agregar deudas, el total mensual muestra «Entre 20 % y 40 % de tu ingreso en cuotas.» o «Más del 40 % de tu ingreso en cuotas. Zona de alerta.» con los mismos cortes.

**T-80 — Deuda declarada del onboarding viejo y «Ya no la tengo»**
*(Solo si tu instalación viene del onboarding anterior, con una deuda mensual declarada y sin cuotas creadas por la configuración nueva. En una instalación nueva esta tarjeta de aviso no aparece nunca.)*
1. Abre Estadísticas.
- Esperado: en «Ratio Deuda / Ingreso» ves «Incluye Q… que declaraste al configurar la app; no se actualiza solo. Regístralo como préstamo en Cuentas → Visacuotas.» y el botón **Ya no la tengo**.
2. Toca **Ya no la tengo** → «Quitar deuda declarada» («Se quitará de tu ratio la deuda que declaraste al configurar la app. No borra ninguna visacuota ni préstamo registrado.») → **Ya no la tengo**.
- Esperado: la deuda declarada sale del ratio; tus visacuotas y préstamos siguen intactos. Si no queda ninguna cuota activa, la tarjeta desaparece. No vuelve a aparecer al reabrir la app.
3. *Usuario nuevo.* Con datos borrados, en el onboarding agrega una deuda («Visa BAC», tipo Tarjeta, cuota Q 600) y termina.
- Esperado: Estadísticas muestra el ratio con 1 cuota y **sin** el aviso de deuda declarada (la deuda ya está en las cuotas y no se suma dos veces).

### Tarjetas: corte y pago

**T-81 — Tarjeta sin fechas: guía, insignia, aviso y tutorial**
1. Cuentas → ➕ → **Tarjeta Crédito** → nombre «Visa prueba» → deja vacíos el corte y el pago → guardar.
- Esperado: al crearla, el formulario decía «Sin estos días no hay fecha de pago, recordatorios ni semáforo de capacidad.».
2. Mira la lista de Cuentas.
- Esperado: la tarjeta muestra la insignia **«Sin corte ni pago · Configurar»**. Si le pones solo el corte, dice «Sin día de pago · Configurar»; si pones solo el pago, «Sin día de corte · Configurar». Al tocar la insignia se abre la edición de esa tarjeta.
3. Inicio → Guía y primeros pasos.
- Esperado: un pendiente **«Configurar corte y pago de tus tarjetas»** con «Con el día de corte y el de pago recibes el recordatorio de pago y ves tu capacidad de pago.». Toca **Hacer**: abre Cuentas con la edición de esa tarjeta. Al guardar ambos días, el pendiente queda hecho y la insignia desaparece; ahora aparecen «Estado al {corte}» y «Ciclo abierto».
4. Crea otra tarjeta sin fechas, cierra la app por completo y ábrela de nuevo; espera unos 30 minutos (con permiso de notificaciones).
- Esperado: llega **un solo aviso** «💳 Configura el corte y pago de tu tarjeta» / «Tu tarjeta «…» no tiene día de corte o de pago. Agrégalos en Cuentas para recibir el recordatorio de pago y ver tu capacidad de pago.». Si además faltaban otras configuraciones (gastos fijos, metas…), el aviso es «Completa tu configuración» y nombra «el corte y pago de tus tarjetas». No se repite: si ya te llegó antes, no vuelve.
5. Con una tarjeta sin fechas, abre el tutorial **Compra con tarjeta** (Inicio → Guía → Centro de ayuda) y avanza hasta el paso 4.
- Esperado: el paso «4. El cargo aparece en «Ciclo abierto»» dice «Para este paso necesitas una tarjeta con su día de corte y de pago. El tutorial se cierra para que lo crees; ábrelo de nuevo después.» y ofrece **Crearlo ahora**, que abre la edición de la tarjeta sin fechas. Sin ninguna tarjeta, el paso 1 ofrece crearla.

**T-82 — Tarjeta agregada en el onboarding con corte 9 y pago 2**
1. Con datos borrados, en el onboarding llega a «Cuentas y tarjetas» → **Agregar cuenta** → banco BAC Credomatic → tipo **Tarjeta de crédito** → moneda Q.
- Esperado: en lugar del saldo inicial pide **Día de corte** y **Día de pago**, con «Opcional, pero recomendado: están en tu estado de cuenta (corte = fecha de «Saldo al corte»; pago = fecha límite)…».
2. Escribe corte **9** y pago **2** → **Agregar**.
- Esperado: la tarjeta aparece en la lista con «Corte 9 · Pago 2». Con un día inválido (por ejemplo 40) ves «El día de corte debe ser un número entre 1 y 31.» y no se agrega. Una tarjeta sin días muestra «Sin corte ni pago».
3. Termina el onboarding.
- Esperado: en Cuentas la tarjeta dice «Corte: día 9 · Pago: día 2», **sin** la insignia «Sin corte ni pago · Configurar»; en el Inicio **no** aparece «Configurar corte y pago de tus tarjetas»; en el detalle ves «Estado al {corte}» y «Ciclo abierto». Si además registras una compra con fecha anterior al último corte, el estado muestra «Paga antes del 2 …» (el 2 del mes siguiente al corte).

### Ciclo semanal e irregular

**T-83 — Semanal con pago en martes**
1. Con datos borrados, en el onboarding: paso del ciclo → **Semanal**.
- Esperado: pregunta «¿Qué día de la semana te pagan?» con chips Dom, Lun, Mar, Mié, Jue, Vie, Sáb; sin elegir uno, «Continuar» está apagado.
2. Elige **Mar**.
- Esperado: el recuadro «ASÍ SE VA A MEDIR TU DINERO» dice «Tu semana de presupuesto va de martes a lunes: {rango}» (por ejemplo, si hoy es miércoles 18 de noviembre de 2026: «17 nov – 23 nov») y «Los gastos fijos se cuentan por mes calendario (…)».
3. Termina el onboarding. Inicio.
- Esperado: período martes–lunes («Día 2 de 7 del período» si hoy es miércoles) y contador de días al pago de 6 («6d»). Toca el rango: «Tu ciclo es semanal: tu período empieza cada martes. Cámbialo en Ajustes → Ciclo de pago.» (sin chips de fechas).
4. Ajustes → Ingresos y período.
- Esperado: «Cobras cada martes», «Período actual: …», ciclo **Semanal** con el chip **Mar** elegido y «Tu semana va de martes a lunes.».
5. Presupuesto → Ingresos.
- Esperado: la fuente «Pago semanal», cada martes, con lo que te pagan por semana (tu ingreso mensual × 12/52).
6. *Aviso de discrepancia.* En Ajustes toca el chip **Mié**.
- Esperado: aparece «Tu fuente «Pago semanal» dice que cobras el martes.» con el botón **Usar el martes**; al tocarlo vuelve a «Mar» y el aviso desaparece. (Sin guardar, no cambia nada.)
7. *Resumen semanal.* Con notificaciones permitidas, espera al lunes.
- Esperado: el **lunes a las 20:00** (la hora de tu resumen diario) llega «Resumen Semanal — BudgetMaster»; ese lunes no llega además el «Resumen del día». No se programa «Mañana termina tu período» (con ciclo semanal el resumen semanal lo reemplaza).
- Opcional: con el SMS «Sueldo, formato 1» (27/10/2026, martes) como SMS de ejemplo, el día **elegido en el paso del ciclo** gana sobre el del SMS.

**T-84 — Semanal sin cambiar (domingo por defecto): igual que antes**
1. *Usuario nuevo:* en el onboarding elige Semanal y el chip **Dom**.
- Esperado: «Tu semana de presupuesto va de domingo a sábado: {rango}».
2. *Usuario que ya tenía ciclo semanal antes de este build* (después de P-01): Ajustes → Ingresos y período.
- Esperado: sin que cambies nada, el ciclo semanal muestra el chip **Dom** elegido y «Tu semana va de domingo a sábado.»; el período sigue siendo de domingo a sábado, igual que antes; los días al pago cuentan hasta el siguiente domingo (por ejemplo, sábado: «1d»).
- Esperado: el resumen semanal llega el **último día de tu semana**: con semana de domingo a sábado, el **sábado a las 20:00** (el día antes de tu pago); ese sábado reemplaza al «Resumen del día». Es el único cambio frente a la versión anterior, que lo mandaba siempre el domingo.

**T-85 — Irregular = mes calendario**
1. Con datos borrados, en el onboarding: ciclo → **Irregular**.
- Esperado: no pide ningún día; «Continuar» está encendido. El recuadro dice «Usamos el mes calendario: {1 al último día}» y «Tus ingresos no tienen fecha fija, así que tu período es el mes calendario (del 1 al último día). Tus gastos fijos también se cuentan por mes.».
2. Termina el onboarding. Inicio.
- Esperado: el rango es el mes completo (algo como «01 nov 2026 – 30 nov 2026»), «Día N de 30 del período», y **no** aparece el contador «Nd» de días al pago. Toca el rango: «Tus ingresos son irregulares: el período es el mes calendario, así que su inicio es fijo y no hay nada que ajustar aquí.».
3. Ajustes → Ingresos y período.
- Esperado: «Tus ingresos son irregulares», ciclo **Irregular** y «Con ingresos irregulares tu período es el mes calendario (del 1 al último día): no hay un día que elegir.». En Presupuesto Mensual **no** aparece la línea «Por período» (el presupuesto del período es el mensual completo).
4. Fin de período: el aviso «Mañana termina tu período» llega el día antes del último día del mes.

### Presupuesto repartido por período

**T-86 — Presupuesto quincenal: la mitad**
1. Ajustes → Ciclo de pago → **Quincenal** (días 15 y 30) → Guardar ciclo y día de pago. Presupuesto Mensual **Q 4,000** → Guardar Cambios.
- Esperado: debajo del monto, «Por período: Q 2,000.00 por quincena. Con eso se miden el anillo del Inicio, los avisos y el asesor.».
2. Inicio.
- Esperado: el anillo mide contra «de Q 2,000.00» (un gasto de Q 1,000 en la quincena marca 50 %).
3. Presupuesto → Categorías: asigna a Comida el límite **Q 1,500**.
- Esperado: la ayuda dice «Toca una categoría para asignarle un límite mensual; la app lo reparte por quincena.»; la tarjeta de Comida muestra «de Q 750.00» y «Q 750.00 por quincena (Q 1,500.00 al mes)»; el resumen PLANIFICADO suma lo repartido (Q 750).
4. Estadísticas: el presupuesto diario ideal es Q 2,000 ÷ los días de la quincena (15 o 16).

**T-87 — Presupuesto semanal: 12/52**
1. Ajustes → Ciclo de pago → **Semanal** (el día que prefieras) → guardar. Presupuesto Mensual **Q 4,000** → Guardar Cambios.
- Esperado: «Por período: Q 923.08 por semana. Con eso se miden el anillo del Inicio, los avisos y el asesor.».
2. Inicio. Esperado: el anillo mide contra «de Q 923.08».
3. Presupuesto → Categorías, Comida Q 1,500.
- Esperado: «Q 346.15 por semana (Q 1,500.00 al mes)» y «de Q 346.15»; la ayuda dice «…la app lo reparte por semana.».
4. Estadísticas. Esperado: «Tu presupuesto diario ideal es Q 131.87/día.» (923.08 ÷ 7).
5. Avisos: el 50 %, 80 % y 100 % se miden contra Q 923.08, no contra Q 4,000; un límite de categoría avisa al 80 % y 100 % de su límite semanal.

**T-88 — Un usuario mensual (o irregular) no cambia**
1. Ajustes → Ciclo de pago → **Mensual** (o Irregular) y presupuesto Q 4,000.
- Esperado: **no** aparece la línea «Por período»; el anillo dice «de Q 4,000.00»; Comida muestra «de Q 1,500.00» y **sin** línea «por quincena / por semana»; la ayuda de Categorías dice «Toca una categoría para asignarle un límite mensual.»; los avisos usan Q 4,000.
- Al terminar T-86 a T-88, restaura tu ciclo, tu día de pago y tu presupuesto reales.

### Asesor local, tono

**T-89 — Asesor local: una cuota pausada no cuenta**
Antes: sin clave de Gemini (modo local), ingreso declarado o fuente en Q 5,000.
1. Crea una tarjeta (BAC, con corte y pago) y una visacuota «Laptop» de total Q 6,000, cuota Q 500, 2 cuotas ya pagadas.
2. Asesor → escribe «Hazme un resumen».
- Esperado: incluye «Cuotas mensuales: Q500.».
3. Escribe «¿Cómo van mis deudas?».
- Esperado: «Tienes Q500 en cuotas mensuales activas.», «Visacuotas activas: "Laptop" (10 cuotas restantes).» y «Tu carga de deuda mensual (Q500) equivale al 10.0% de tu ingreso …». Ese Q 500 coincide con el monto del ratio de Estadísticas.
4. Cuentas → elimina la tarjeta («Las visacuotas asociadas se desactivarán.»). Vuelve al Asesor (reinicia el chat con ⟳) y repite los pasos 2 y 3.
- Esperado: «Hazme un resumen» **ya no** incluye «Cuotas mensuales»; «¿Cómo van mis deudas?» dice «No tienes visacuotas activas en este momento.» y ya no menciona ratio; la tarjeta «Ratio Deuda / Ingreso» de Estadísticas también desaparece (si no hay otras cuotas). El asesor y Estadísticas dan siempre el mismo total.

**T-90 — Tono «tú»: ningún texto en voseo**
La app habla de «tú». Recorre rápido estas pantallas y fíjate en cada instrucción:
1. **Inicio:** la guía («Hacer», «No me interesa»), el aviso del período, los avisos de sincronización.
2. **Presupuesto → Categorías:** la ayuda de «Agregar presupuesto» y el aviso al guardar un límite.
3. **Cuentas:** el formulario de tarjeta, el estado de cuenta («Paga antes del…»), «Registrar pago».
4. **Ajustes:** Presupuesto Mensual, Ingresos y período, Notificaciones.
5. **Agregar → Pegar SMS:** pega un texto que no sea del banco y lee el aviso «No se registró» (termina en «ingrésalo manualmente»).
6. **Asesor:** el mensaje de bienvenida, las acciones guiadas y las respuestas.
7. **Un tutorial** (por ejemplo «Movimientos», o el «?» de Cuentas) y el Centro de revisión (si tienes pendientes).
- Esperado: todas las instrucciones usan «tú»: **toca, elige, escribe, puedes, tienes, revisa, agrega, registra**.
- Esperado: **ninguna** usa el voseo. Se reconoce por dos señales: el pronombre propio del voseo, y verbos cuya última sílaba lleva tilde (terminados en -á, -é o -í al dar una instrucción, o en -ás, -és, -ís al hablarte), a veces pegados a «lo», «la», «las» o «los». Si lees «toca» o «tienes» está bien; si la tilde cae al final del verbo, no.
- Si ves una, anota la pantalla y el texto exacto (captura): es un ❌ de tono.

### Pegar SMS sin permiso, widget irregular, patrimonio y voseo residual

**T-91 — «Pegar SMS» sin lectura de SMS (iPhone, web o Android con SMS apagado)**
Prepara una de estas dos situaciones: un iPhone (o la versión web), o un Android con Ajustes → Sincronización de SMS en **Desactivado**.
1. Abre **Agregar**. Esperado: arriba a la derecha, junto al «?», está el botón **«Pegar SMS»** (con ícono de portapapeles). No dice «Leer SMS».
2. Tócalo, pega "Compra con tarjeta" (sección 0) y presiona **Analizar SMS**. Esperado: aviso «Detectado» y el formulario con monto, banco y comercio. Android **no** pide ningún permiso.
3. Pega "Pago de tarjeta". Esperado: el aviso termina en «…por eso no se carga en el formulario.» (con SMS apagado **no** dice nada de la sincronización de SMS en Inicio; con SMS activo sí dice «La sincronización de SMS en Inicio lo registra como neutro.»).
4. Con SMS apagado, comprueba que sigue oculto lo que lee la bandeja: en Inicio no aparece el botón de sincronizar, y en una fuente de ingreso el cuadro «SMS de ejemplo» solo trae **Analizar SMS** (sin «Elegir de mis SMS»). Esperado: pegar funciona; leer la bandeja no se ofrece.
5. Abre el «?» de **Agregar**. Esperado: el paso «Atajo: pegar un SMS» aparece también con SMS apagado y dice «Pegar SMS».
6. Ajustes → Sincronización de SMS (apagado). Esperado: el texto dice que la lectura queda oculta y que «Pegar SMS» en Agregar sigue disponible.

**T-92 — Widget con ingresos irregulares (solo Android)**
1. Ajustes → Ciclo de pago → **Irregular**; abre la app una vez (el widget se rehace 1 s después del último cambio).
2. Mira el widget **pequeño**. Esperado: «N días en el período», donde N son los días que faltan para el primero del mes siguiente (el 12 de noviembre: «19 días en el período»; el último día del mes: «1 día en el período»). **Nunca** «Hoy cobras» ni «al cobro».
3. Mira el **mediano**. Esperado: «Q… · N días en el período» y «Disponible por día» = lo disponible entre esos N días.
4. Vuelve a **Mensual** y abre la app. Esperado: «N días al cobro» como siempre.
5. (Si ya tenías el widget puesto antes de actualizar la app, con ciclo irregular y sin abrir la app todavía) Esperado: con la foto vieja el widget no dice «Hoy cobras»; muestra «Sin fecha de cobro» hasta que abras la app.

**T-93 — Ingresos irregulares: ningún contador dice «0 días»**
Con el ciclo en **Irregular**:
1. Presupuesto → Gastos fijos. Esperado: el resumen superior muestra «—» bajo «PRÓX. PAGO» (no «0d» en rojo).
2. Estadísticas, primera tarjeta (flujo de caja proyectado). Esperado: termina en «Días que le quedan al período: N.» (no «Días hasta próximo ingreso: 0»).
3. Con el ciclo en Mensual, las mismas pantallas muestran «Nd» y «Días hasta próximo ingreso: N».
4. Notificaciones (si puedes forzar el resumen semanal o el resumen del día): con irregular dicen «Al período le quedan N día(s).» o «te quedan Q… para N día(s)», nunca «Próximo ingreso en 0 día(s)».

**T-94 — Patrimonio total: con y sin cuentas que llevan saldo**
Anota tu patrimonio actual antes de empezar y al final restaura tus datos.
1. Sin ninguna cuenta que lleve saldo (todas «Sin seguimiento», o ninguna cuenta): Ajustes → **Ahorros externos** Q 5,000 y USD 100. Esperado en Inicio: el patrimonio es Q 5,000 + (todos tus ingresos − todos tus gastos registrados en quetzales) y debajo «+$ 100.00»; la leyenda dice «Estimado por ingresos y gastos • ninguna cuenta lleva saldo».
2. Crea una cuenta de banco en **Manual** con Q 1,000. Esperado: el patrimonio pasa a **Q 1,000** (los ahorros externos de Q 5,000 y USD 100 **dejan de sumarse**); la leyenda dice «Solo cuentas que llevan saldo (sin tarjetas de crédito)».
3. Crea otra cuenta «Sin seguimiento» y una tarjeta de crédito. Esperado: no cambian el patrimonio.
4. Crea una cuenta en dólares con $ 200 (Manual). Esperado: el Q 1,000 se queda arriba y aparece «+$ 200.00» **debajo**, sin convertirse a quetzales.
5. Registra una visacuota. Esperado: el patrimonio **no baja**; la deuda aparece aparte en «Compromisos de crédito (aparte)».
6. Toca el ícono ⓘ del patrimonio. Esperado: dice que suma lo de las cuentas que llevan saldo, que si ninguna lo lleva es un estimado (ahorros externos más ingresos menos gastos) y que NO incluye cuentas «Sin seguimiento», tarjetas, visacuotas ni ahorros externos mientras alguna cuenta lleve saldo.
7. Ajustes → **Ahorros externos**. Esperado: la descripción dice «Solo cuenta en tu patrimonio cuando ninguna de tus cuentas lleva saldo.».
8. Tutoriales: los pasos «Patrimonio total» y «Cuando ninguna cuenta lleva saldo» del Inicio, y los pasos «Ahorros externos» y «Cómo cuentan en tu patrimonio» de Ajustes, dicen lo mismo.

**T-95 — Voseo residual corregido**
Cada frase debe estar en «tú»:
1. Agregar → Pegar SMS → pega un texto que no sea del banco: el pie dice «Si es un movimiento real, **ingrésalo** manualmente.».
2. Inicio → sincroniza un SMS que sea una compra en cuotas: el pie del resumen dice «**Revísalas** en Cuentas → Visacuotas.».
3. Centro de revisión (con compras sin cuenta): la fila «Compras sin cuenta» dice «**Asígnalas** a una cuenta para organizarlas por cuenta».
4. Tutorial «Movimientos» → pasos «Cómo clasifica la app», «Corrige y la app aprende» y «Tus depósitos por SMS» (este último solo con SMS activo): dice «**corrige** la categoría de un depósito».
5. Presupuesto → Ingresos → una fuente → «SMS de ejemplo» (Android con SMS activo): dice «o **elígelo** de tus mensajes».
- Esperado: las formas con «lo/la/las» llevan la tilde en la penúltima sílaba («ingrésalo», «revísalas», «asígnalas», «elígelo») y «corrige» no lleva tilde. Si la tilde cae en la última sílaba del verbo, es un ❌ de tono (ver T-90).


**T-96 — Deudas al configurar la app: ninguna cuota se carga el mismo día**
Usa una instalación nueva (o «Borrar todos los datos» en un teléfono de prueba; anota antes tus datos). Anota la fecha de hoy.
1. En la configuración llega al paso «¿Tienes deudas activas?». Esperado: arriba un aviso que dice «Cada cuota de un préstamo o visacuota se registrará como gasto en su día de pago, empezando por el próximo. La tarjeta de crédito no se convierte en cuota: sus compras ya cuentan como gasto cuando las registras.»
2. Toca **Agregar deuda**. Con el tipo **Préstamo** aparece el campo **«Día de pago (opcional)»** y debajo «Del 1 al 31. Si lo dejas vacío usamos el día de hoy; la primera cuota se registra en el próximo día de pago.». Cambia a **Tarjeta**: el campo desaparece. Cambia a **Visacuota**, elige una de tus tarjetas en «¿De qué tarjeta?»: el campo también desaparece (manda el corte de la tarjeta).
3. Con el tipo Préstamo escribe nombre «Préstamo prueba», cuota Q 1,000, total Q 12,000 y en el día de pago escribe **99** → **Agregar**. Esperado: «El día de pago debe estar entre 1 y 31.» y no se agrega. Déjalo vacío y agrégalo. Esperado: la fila muestra «Préstamo bancario» sin «paga el día».
4. Agrega otro préstamo con día **25**. Esperado: la fila dice «Préstamo bancario · paga el día 25».
5. Termina la configuración y abre Movimientos. Esperado: **ningún** gasto «Cuota 1/12 · Préstamo prueba» con fecha de hoy (ni de ninguna fecha pasada).
6. Cuentas → **Visacuotas**. Esperado: «Préstamo prueba» muestra **Próxima cuota** = hoy + 1 mes (mismo día del mes siguiente; en un mes más corto, el último día) y el préstamo del día 25 muestra el próximo 25. El Presupuesto de este período **no** baja por ellos.
7. (Opcional, cambiando la fecha del teléfono) Llega al día de pago. Esperado: al abrir la app aparece UNA cuota «Cuota 1/12 · …» como gasto fechada ese día.

**T-97 — Deuda tipo «Tarjeta de crédito» declarada: sin cuota, sin doble conteo**
1. En la configuración, paso de deudas: agrega **Visa BAC**, tipo **Tarjeta**, cuota Q 600; y un **Préstamo** de Q 1,000 al mes. Termina la configuración.
2. Cuentas → Visacuotas. Esperado: solo aparece el préstamo; **no** hay ninguna visacuota «Visa BAC» ni gasto mensual de Q 600 en Movimientos en los meses siguientes.
3. Estadísticas → «Ratio Deuda / Ingreso». Esperado: suma Q 1,000 (préstamo) + Q 600 (declarada) = Q 1,600 al mes, y avisa «Incluye Q 600… que declaraste al configurar la app; no se actualiza solo».
4. Toca **Ya no la tengo** y confirma. Esperado: queda solo el préstamo (Q 1,000); el préstamo no se borra.
5. Registra una compra con esa tarjeta en Cuentas. Esperado: cuenta como gasto una sola vez (la deuda declarada no la suma otra vez).

**T-98 — Préstamo sin tarjeta: el SMS del débito es la cuota (solo Android con SMS activo)**
1. Crea un préstamo «Sin tarjeta (préstamo)» de Q 1,000 al mes con día de pago **25** (o el que alcances a probar).
2. Haz que llegue un SMS de gasto de **cualquier cuenta tuya** por **Q 1,000.00** con fecha hasta 3 días antes o después del día de pago (si no tienes uno, pega uno de prueba en «Pegar SMS» o sincroniza).
3. Sincroniza y abre la app el día de pago. Esperado: en Movimientos hay **un solo** gasto de Q 1,000 (el del SMS) y en la visacuota las cuotas cargadas suben en 1; no hay un segundo «Cuota n/12 · …» manual.
4. Prueba con un SMS de Q 1,200 (otro monto) o a más de 3 días: esperado, SÍ se crea la cuota aparte.
5. Prueba con una transferencia entre tus cuentas por Q 1,000: esperado, no se toma como la cuota.

**T-99 — Actualizar con deudas del configurador anterior: nada se carga de golpe**
Solo si tu teléfono ya tenía deudas creadas al configurar la app con la versión anterior.
1. Antes de actualizar anota tus gastos del período y las deudas de Cuentas → Visacuotas.
2. Instala el build nuevo y abre la app. Esperado: **no** aparece ningún gasto nuevo «Cuota n/… · …» con fecha de hoy por esas deudas; tus gastos anteriores no cambian.
3. Cuentas → Visacuotas. Esperado: «Próxima cuota» de cada préstamo o visacuota apunta al próximo día de pago (no a hoy). Las deudas que habías declarado como **Tarjeta de crédito** quedan **inactivas** (dejan de cargar un gasto cada mes); sus cargos anteriores se conservan.
4. Llega el día de pago de un préstamo. Esperado: al abrir la app aparece su cuota, una sola vez.

**T-100 — Gastos fijos pagados no se reinician el sábado con «siguiente día hábil»**
Se prueba mejor con el día de pago a la vuelta de un fin de semana.
1. Ajustes → Ciclo de pago: mensual, día de pago = el **sábado** que viene (por ejemplo 15) y en las reglas del período (Ajustes → Ciclo de pago → Reglas) elige **«Lunes después»** (si el día de pago cae en fin de semana, el período arranca el lunes).
2. Marca un gasto fijo como pagado dentro del período que está corriendo (por ejemplo «Luz»).
3. Cierra la app del todo (deslízala fuera de las recientes) y ábrela **el sábado**. Esperado: «Luz» **sigue pagada** (no pasa a «Vencida»): el período real sigue siendo el anterior hasta el lunes.
4. Ábrela de nuevo el lunes. Esperado: ahora sí empieza el período nuevo y «Luz» vuelve a quedar pendiente.
5. Repite con la regla **«Viernes antes»** (la predeterminada): el período arranca el viernes. Esperado: «Luz» se reinicia el viernes, no antes ni después.

**T-101 — Deshacer sincronización con un par de transferencia (solo Android con SMS activo)**
1. Registra a mano (o por una sincronización anterior) una salida de Q 500 de una cuenta por transferencia (categoría Transferencia, tipo gasto).
2. Haz que llegue por SMS la entrada de Q 500 en otro banco, con fecha de menos de 36 horas de diferencia, y sincroniza. Esperado: la sincronización junta las dos como una transferencia neutra (ya no suman al gasto del período).
3. Ajustes → Sincronización de SMS → **Deshacer última sincronización** → confirma. Esperado: la entrada nueva se elimina y la salida de Q 500 **vuelve a ser un gasto normal** (suma al gasto del período, a las estadísticas y al presupuesto); no queda como «transferencia» sin pareja.
4. Comprueba en Movimientos que esa salida ya no muestra la etiqueta «Transferencia entre tus cuentas».

**T-102 — Capacidad de pago con ingreso declarado y período corto**
Sin ninguna cuenta con saldo (todas «Sin seguimiento») y con una tarjeta con corte, pago y algo por pagar.
1. Ingreso declarado Q 8,000 al mes y ciclo **Semanal**. Gasta unos Q 1,500 esta semana (sin usar la tarjeta) y deja en la tarjeta un estado de unos Q 3,000 que venza en pocos días.
2. Toca el semáforo de capacidad de pago del Inicio. Esperado: «Lo que tendrás» ≈ Q 1,846 − lo gastado esta semana (el ingreso mensual repartido a una semana, ×12/52), no Q 6,500; el semáforo sale en **rojo** («No alcanza»).
3. Cambia a **Quincenal**: «lo que tendrás» = Q 4,000 − lo gastado en la quincena. Cambia a **Mensual**: Q 8,000 − lo gastado en el mes (sin cambio respecto a antes).
4. La frase del detalle sigue diciendo «Calculado con tu ingreso declarado, porque aún no llevas saldos en tus cuentas.».

**T-103 — Visacuota con todos los cortes cumplidos al actualizar queda terminada**
Solo si tu teléfono tenía una visacuota o préstamo antiguo cuya fecha de inicio ya quedó muy atrás (todos sus cortes ya pasaron) y no marcaba todas las cuotas como pagadas.
1. Antes de actualizar anota esa visacuota (por ejemplo «2/6» pagadas y activa).
2. Actualiza y abre la app. Esperado: esa visacuota aparece **terminada** (6/6) y deja de contar en el ratio deuda/ingreso, «Cuotas mensuales» y «Visacuotas pendientes»; ya no se queda activa para siempre.
3. Una visacuota a la que todavía le quedan cortes sigue activa y con las cuotas que llevaba.

**T-104 — Deshacer un ingreso vinculado solo restaura el inicio del período y lo aprendido (solo Android con SMS activo)**
1. Ten una fuente de ingreso base que ancla el período (por ejemplo «Sueldo», día 27) y un depósito de ese sueldo ya vinculado a ella (el período arrancó ese día).
2. Sincroniza otro depósito del mismo origen que la app reconozca sola como ese sueldo en el mismo ciclo. Esperado: el período arranca el día de ese depósito.
3. **Deshacer última sincronización** → confirma. Esperado: el inicio del período **vuelve al día del primer depósito** (no a la fecha esperada por la regla) y lo que la app había aprendido de ese origen (la categoría con la que reconoce depósitos de ese remitente) vuelve a como estaba antes del lote; si no existía antes, se olvida.
4. Con un lote donde el vínculo fue el primero de su ciclo: Deshacer quita el inicio automático y el período vuelve a la fecha esperada, como siempre.

**T-105 — «+ gasto» del widget con la app abierta, en segundo plano y cerrada (solo Android, con el widget puesto)**
Esta prueba solo se puede comprobar en el teléfono. Pon el widget en la pantalla de inicio y ten la configuración inicial terminada.
1. Con la app **cerrada** (quítala de las recientes): toca **«+ gasto»**. Esperado: se abre la app, pasa la pantalla de bienvenida (y la huella, si la tienes activada) y queda en la pestaña **Agregar**.
2. Con la app **abierta** en el Inicio: sal con el botón de inicio, toca **«+ gasto»** otra vez. Esperado: vuelves a la app **sin** pantalla de bienvenida ni huella nueva (si no se había bloqueado sola) y quedas en **Agregar**. Cámbiate a otra pestaña, sal y toca **«+ gasto»** de nuevo: otra vez cae en Agregar.
3. Repite el paso 2 cinco veces. Esperado: el botón atrás cierra la app de una vez (no hay copias apiladas que te hagan volver a «otra app» cinco veces) y la app no se pone lenta ni repite avisos de sincronización de SMS.
4. Con la huella activada y la app en segundo plano: toca **«+ gasto»**. Esperado: la huella se pide una sola vez y después Agregar.
5. En un teléfono con la configuración inicial a medias (por ejemplo, borra los datos y toca **«+ gasto»** antes de terminarla). Esperado: se ignora el toque; al terminar la configuración y arrancar el recorrido **no** te salta a Agregar solo.

**T-106 — El widget no se queda con las cifras de otro día (solo Android, con el widget puesto)**
1. Abre la app (el widget toma su foto) y anota los **días al cobro** del widget pequeño.
2. Sin abrir la app, espera a que cambie el día (o adelanta la fecha del teléfono un día) y mira el widget. Esperado: los **días al cobro bajan en 1** aunque no abras la app; el disponible por día en el mediano se reparte entre los días que quedan.
3. Adelanta la fecha del teléfono hasta el **día de tu cobro** (o pasado). Esperado: el widget deja de mostrar cifras y dice **«Abre la app para actualizar»**.
4. Abre la app. Esperado: el widget vuelve a mostrar las cifras del período nuevo.
5. Con ciclo **irregular**: los días del widget dicen «N días en el período», bajan cada día y el día 1 del mes siguiente dice «Abre la app para actualizar».

**T-107 — Borrar todos los datos reinicia los tutoriales y vacía el widget**
1. Completa el recorrido inicial (o ábrelo y termínalo) y, en Android, ten el widget con cifras.
2. **Ajustes → Zona de peligro → Borrar Todos los Datos**. Esperado: el diálogo lista también «Tus tutoriales completados (el recorrido inicial vuelve a empezar) y las cifras del widget».
3. Confirma. Esperado: la app vuelve a la configuración inicial y el widget pasa enseguida a **«Abre BudgetMaster…»**, sin las cifras borradas (no tarda 30 minutos).
4. Termina la configuración inicial pidiendo el recorrido. Esperado: el recorrido inicial **arranca solo** (antes no volvía a arrancar).

**T-108 — La sincronización de SMS dice «como máximo cada 15 minutos» (solo Android con SMS activo)**
1. Lee **Ajustes → SMS → Sincronizar al abrir la app** y la opción equivalente de la configuración inicial. Esperado: dicen «como máximo cada 15 minutos».
2. Abre el tutorial de **Ajustes → SMS** y el manual. Esperado: dicen «al abrir la app (como máximo cada 15 minutos)», no «cada vez que abres la app».
3. Abre la app, ciérrala y ábrela de nuevo antes de 15 minutos. Esperado: la segunda vez no sincroniza otra vez (no sale aviso de importación nuevo); pasados 15 minutos, sí.

**T-109 — Avisos de presupuesto con ciclo irregular y montos con formato**
1. Con ciclo **Mensual**: gasta hasta pasar tu presupuesto del período. Esperado: el aviso dice «Has gastado Q 5,200.00 — superaste tu límite de Q 4,800.00 en Q 400.00. Quedan N días hasta tu próximo ingreso.» (con miles y dos decimales, no «Q4800»).
2. Cambia a ciclo **Irregular** y repite en otro período. Esperado: el aviso dice «Quedan N días del período.», **no** «hasta tu próximo ingreso» (no hay fecha de cobro).
3. Los avisos de 50 % y 80 % y los de categoría también muestran los montos con formato de dinero. El aviso de una meta de ahorro a medio camino muestra «Te faltan Q 600.00» (o «$ 600.00» si la meta es en dólares).

**T-110 — El permiso de notificaciones se pide al terminar la configuración inicial (solo Android 13 o más)**
1. Instala la app desde cero (o borra todos los datos) y ábrela. Esperado: durante la pantalla de bienvenida y la configuración inicial **no** sale el diálogo del sistema de notificaciones.
2. Termina la configuración inicial. Esperado: sale el diálogo de permiso de notificaciones **antes** de que arranque el recorrido; al aceptar, los avisos se programan al momento (**Ajustes → Notificaciones → Enviar aviso de prueba** llega y en los días siguientes llega el resumen diario).
3. Si ya habías terminado la configuración antes y no habías aceptado el permiso: al abrir la app, apenas pasa la pantalla de bienvenida, sale el diálogo (no encima de la pantalla de bienvenida).
4. «Enviar aviso de prueba» en Ajustes sigue pidiendo el permiso si no lo has dado.

**T-111 — La huella no protege el widget (advertencia)**
1. Activa la seguridad biométrica y pon el widget. Toca el **ojo** del widget. Esperado: muestra los montos **sin pedir la huella** (es así a propósito).
2. Lee la sección **Widget** y **Limitaciones conocidas** del manual y el paso «7. Seguridad del ojo» del tutorial «Widget». Esperado: todos dicen que cualquiera con acceso a tu pantalla de inicio puede tocar el ojo y ver los montos, y que la huella no protege el widget.

### Estadísticas y gastos fijos con cuenta

Estas pruebas usan la pestaña **Estadísticas** y **Presupuesto → Gastos Fijos**. Las que dicen «Android con SMS» necesitan el permiso de SMS y al menos dos cuentas que no sean tarjeta (por ejemplo Banrural y BAC).

**T-112 — Cuadros tocables y vistas de la gráfica**
1. Abre **Estadísticas** con **Per. Actual** y varios gastos e ingresos registrados. Esperado: arriba, tres cuadros (INGRESOS, GASTOS, AHORRO) y debajo la pista «Toca un cuadro para cambiar la gráfica.». El cuadro de GASTOS aparece resaltado (borde bronce más marcado).
2. Toca **INGRESOS**. Esperado: el cuadro de ingresos queda resaltado y la tarjeta de abajo se llama «Ingresos por categoría — …», con el pastel de tus ingresos.
3. Toca **GASTOS**. Esperado: «Gastos por categoría — …». Toca una porción o una fila de la leyenda: el centro y el detalle muestran su monto y porcentaje.
4. Toca **AHORRO**. Esperado: la tarjeta «Tu ahorro explicado» (ver T-113). Vuelve a tocar GASTOS: la porción que habías elegido ya no está elegida.
5. Cambia a **Per. Anterior**. Esperado: la vista se mantiene y se reinicia la porción elegida. Si ese período no tiene gastos, la tarjeta dice «No hay gastos en quetzales en este período.» y **no desaparece**.

**T-113 — Vista AHORRO: ahorro negativo y sin ingresos**
1. Elige un período donde gastaste más de lo que ingresó y toca **AHORRO**. Esperado: filas Ingresos y Gastos, la línea «Ahorro = Ingresos − Gastos» con el monto en rojo, la tasa de ahorro negativa, el comentario «Negativo: gastas más de lo que ingresas» y la frase «Gastaste Q … más de lo que entró: Q … de ingresos contra Q … de gastos.».
2. Elige un período con gastos pero **sin ingresos**. Esperado: la tasa dice «—», el comentario es «Sin ingresos registrados en este período: no se puede calcular la tasa.» y la frase «Todavía no registras ingresos en quetzales en este período, así que tu ahorro es igual a tus gastos, en negativo.».
3. Elige un período donde ahorraste el 20 % o más. Esperado: «Excelente: superas el 20% recomendado» y la frase «Te quedó Q …: entró Q … y gastaste Q ….».
4. En todos los casos, «LO QUE MÁS PESA» lista hasta tres categorías de gasto con su monto y porcentaje, y una frase dice «Lo que más pesó fue …».

**T-114 — Aviso de transferencias sin clasificar en el período actual y en el anterior (Android con SMS)**
Preparación: ten en el **período anterior** una transferencia que vino de un SMS del banco, sin su otra mitad, y otra parecida en el período actual. Si no las tienes, pega un SMS de transferencia de otro banco de tu lista de datos de ejemplo.
1. En **Estadísticas → Per. Actual**. Esperado: una tarjeta con el aviso «Q … en transferencias sin clasificar: puede que sea dinero entre tus cuentas. Por ahora se cuentan como gasto o ingreso.» y el interruptor «Sin transferencias».
2. Cambia a **Per. Anterior**. Esperado: el aviso también aparece, con el monto de ese período.
3. Toca **«Aclarar en el Centro de revisión»**. Esperado: se abre el Centro de revisión **sin filtro**: «¿A qué cuenta fue?» muestra también la transferencia del período anterior. Elige una cuenta. Esperado: al volver, el aviso baja o desaparece (esa transferencia ya no cuenta como gasto o ingreso).
4. Registra a mano un gasto con categoría **Transferencia**. Esperado: el aviso dice «1 la registraste a mano: si fue dinero entre tus cuentas, cambia su categoría en Movimientos o regístralo con «Transferir» en Cuentas.» y esa transferencia no genera botón.
5. Apaga los SMS en Ajustes. Esperado: para las transferencias que vinieron de SMS, el aviso dice «Activa los SMS en Ajustes para aclararlas en el Centro de revisión.» y el botón no aparece. Con una sola cuenta que no sea tarjeta dice «Para aclararlas necesitas al menos dos cuentas que no sean tarjeta.».
6. Si ya respondiste «A otra persona» o «Ingreso externo» a esa pregunta, el aviso dice «Ya respondiste estas preguntas antes («A otra persona» o «Ingreso externo»); si fue dinero entre tus cuentas, cambia su categoría en Movimientos.».

**T-115 — Interruptor «Sin transferencias»**
1. Con el aviso de T-114 visible, anota los totales de INGRESOS y GASTOS y activa **«Sin transferencias»**. Esperado: los totales bajan o suben según esas transferencias, el pastel y la vista AHORRO cambian, y el aviso dice «… No se cuentan en esta pantalla.».
2. Mira las tarjetas de más abajo (comparativa de 6 meses, gasto promedio diario, gasto por banco). Esperado: también dejan de contar esas transferencias.
3. Desactiva el interruptor. Esperado: todo vuelve a como estaba. El interruptor **no borra nada**: abre Movimientos y comprueba que los movimientos siguen ahí.
4. En la vista AHORRO, con el interruptor activo, la última frase dice «No se cuentan Q … en transferencias sin clasificar (interruptor «Sin transferencias»).».

**T-116 — Selector Q / $**
1. En un período **sin** movimientos en dólares. Esperado: **no** aparece el selector de moneda.
2. Registra un gasto y un ingreso en dólares dentro del período y vuelve a Estadísticas. Esperado: aparece el selector **«Quetzales (Q)» / «Dólares ($)»** debajo del período.
3. Toca **Dólares ($)**. Esperado: los cuadros, la gráfica, el ahorro y el aviso muestran solo los dólares, con «$»; el centro del pastel dice «$ …»; debajo aparece «Las tarjetas de más abajo siguen en quetzales.». No se convierte nada.
4. Con la moneda en dólares, cambia a un período sin dólares. Esperado: el selector desaparece y la pantalla vuelve sola a quetzales.

**T-117 — «Revisar (N)» cuenta «¿A qué cuenta fue?» y «Revisar también lo de antes» (Android con SMS)**
1. Ten una transferencia de SMS sin su otra mitad (más de 36 horas) y nada más por revisar. Sincroniza. Esperado: el diálogo del resultado ofrece **«Revisar (N)»** con la pregunta contada en N.
2. Abre el Centro desde ese botón y mira el final de la hoja. Esperado: el botón **«Revisar también lo de antes»** y la pista «Incluye movimientos de sincronizaciones anteriores, también del período anterior.».
3. Tócalo. Esperado: el Centro se recalcula con todo lo guardado (también «Gastos fijos por confirmar», «Movimientos dudosos», etc. de sincronizaciones anteriores) y el botón desaparece.
4. Cierra y abre el Centro desde **Ajustes → «Revisar pendientes»**. Esperado: ya muestra todo y **no** trae el botón. Si lo abres otra vez desde una sincronización, vuelve a traerlo.

**T-118 — «PENDIENTE» en una línea y el botón flotante sin tapar montos**
1. En un teléfono angosto (360 dp) o con la letra grande del sistema, abre **Presupuesto → Gastos Fijos**. Esperado: las etiquetas PAGADOS, CUBIERTO, PENDIENTE y PRÓX. PAGO quedan en **una sola línea** (si hace falta, la letra se achica un poco); «PENDIENTE» no se parte.
2. Repite en **Categorías** (PLANIFICADO, GASTADO, DISPONIBLE o EXCESO).
3. Baja hasta el final de la lista de **Gastos Fijos**, de **Metas** y de **Ingresos**. Esperado: el botón **+** flotante no tapa el monto de la última fila; sobra espacio debajo.

**T-119 — Gasto fijo con cuenta o tarjeta**
1. Ten una tarjeta con su corte y pago, y una cuenta con saldo **automático**. Crea un gasto fijo de Q 300 con **AUTO** activado. Esperado: el formulario trae «CUENTA O TARJETA (Opcional)» con «Sin cuenta» y tus cuentas (cada una con su punto de color y su ícono de tarjeta o billetera).
2. Elige la tarjeta. Esperado: la pista «Al marcarlo pagado con AUTO, el cargo entra al «Ciclo abierto» de esta tarjeta.». Guarda. Esperado: la fila muestra un chip con el nombre de la tarjeta junto al día de pago.
3. Márcalo pagado. Esperado: en **Cuentas**, el «Ciclo abierto» de esa tarjeta suma Q 300 y en Movimientos el gasto trae esa tarjeta como cuenta.
4. Edita otro gasto fijo y elígele la cuenta con saldo automático. Esperado: la pista «Esta cuenta lleva su saldo automático: el pago lo resta solo.» y, al marcarlo pagado, el saldo de la cuenta baja.
5. Con una cuenta sin saldo automático, la pista dice «Este gasto no cambia el saldo guardado de la cuenta: aquí la cuenta organiza tus pagos.». Con SMS activos y una cuenta elegida, aparece también «Si el SMS del banco viene de esta cuenta, la app lo reconoce con más seguridad.».
6. Crea una visacuota de Q 500 en la tarjeta y luego un gasto fijo de Q 500 con esa tarjeta. Esperado: un aviso amarillo «Esta tarjeta ya carga la visacuota «…» de Q 500.00 cada corte. Si este gasto fijo es esa cuota, no lo agregues: se contaría dos veces.»; aun así se puede guardar.
7. Elimina la cuenta de un gasto fijo que la usaba. Esperado: el gasto fijo sigue ahí, sin chip y sin cuenta.

**T-120 — SMS con el mismo nombre en cualquier día del mismo período (Android con SMS)**
1. Crea un gasto fijo «EEGSA» de Q 687.20 con vencimiento el día 28. Pega (o recibe) un SMS de EEGSA por Q 687.20 con fecha del **día 3** del mismo período. Esperado: el gasto se marca **pagado solo** (antes solo lo proponía, por estar lejos del vencimiento).
2. Repite con un SMS de EEGSA con fecha del **período anterior**. Esperado: **no** se marca ni se propone: solo cuentan los SMS del período actual.
3. Con un monto distinto hasta un 10 %, el nombre igual: se marca solo si el resto coincide; con una diferencia mayor la app no lo marca sola: lo propone en «Gastos fijos por confirmar».
4. Si cobras por quincena, por semana o con ingresos irregulares, «el período» de los gastos fijos es el **mes**: un SMS de cualquier día de ese mes cuenta.

**T-121 — SMS de otra cuenta o con dos candidatos: queda como propuesta (Android con SMS)**
1. Crea el gasto fijo «EEGSA» con la cuenta **BAC**. Recibe o pega un SMS de EEGSA que venga de una cuenta **distinta** (por ejemplo, otra tarjeta). Esperado: **no** se marca solo; aparece en **Centro de revisión → Gastos fijos por confirmar**, con la razón «otra cuenta o tarjeta».
2. Con el mismo gasto fijo, recibe **dos** SMS de EEGSA por el mismo monto en el mismo período. Esperado: ninguno se marca solo; los dos quedan como propuesta y tú eliges cuál es.
3. Con un gasto fijo **sin** cuenta y un SMS con cuenta, o con cuenta y un SMS sin ella, el emparejamiento funciona como siempre (sin penalización).

**T-122 — Marcado a mano y luego llega el SMS; tutorial «Gasto fijo con cuenta o tarjeta»**
1. Crea el gasto «EEGSA» con la tarjeta BAC y márcalo pagado a mano con AUTO. Después recibe el SMS de EEGSA de esa misma tarjeta. Esperado: queda **una sola fila** en Movimientos (el SMS se une a tu registro, no se cuenta dos veces) y el gasto conserva su cuenta. Si el SMS venía de otra cuenta, el Centro te propone unirlos y, si los unes, se queda la cuenta de tu registro; al separarlos vuelve la del SMS.
2. Abre **Inicio → Ayuda → «Gasto fijo con cuenta»**. Con **al menos una cuenta o tarjeta**: el paso 1 te muestra Cuentas, el paso 2 el botón + de Gastos Fijos y el paso 3 la lista de gastos fijos (con SMS activos hay un paso 4, «Deja que el SMS lo detecte»).
3. Repite **sin ninguna cuenta ni tarjeta** (en una instalación nueva). Esperado: el paso 1 dice «Para este paso necesitas una cuenta o tarjeta…» y ofrece crearla en ese momento; no se queda señalando una pantalla vacía.

**T-123 — Formato de los tutoriales (Android)**
Los tutoriales pasaron de 128 a 173 pasos: los pasos largos se repartieron en varios cortos, sin quitar información, y los textos tienen frase clave, viñetas y resaltes.
1. Abre el tutorial de **Cuentas** (botón **?** de Cuentas) y avanza por «Tus cuentas y su saldo», «Tus tarjetas de crédito» y «Editar y otros detalles» (antes eran un solo paso largo).
- Esperado: arriba, fijos, ves el progreso con el contador «n/N» a la derecha, el ícono pequeño y el título; debajo, la frase clave en **negrita**, viñetas con punto bronce y los nombres entre «…» en bronce. Abajo, siempre visibles, «Omitir» y «Siguiente».
2. Recorre varios tutoriales (Inicio, Presupuesto, Ajustes, Widget, Saldos).
- Esperado: con la letra normal del teléfono ningún paso necesita desplazarse y la tarjeta nunca pasa de la mitad de la pantalla cuando señala algo; los textos van alineados a la izquierda, sin huecos entre palabras.
3. Pon la letra del teléfono en **grande** (Ajustes del teléfono → Pantalla → Tamaño de fuente) y abre un paso con viñetas.
- Esperado: solo el texto se desplaza; el título y los botones siguen a la vista, con el aviso «Desliza para leer más» mientras falte texto, que desaparece al llegar al final.
4. Abre el tutorial **Widget** (solo Android) hasta «7. Seguridad del ojo», y el de **Ajustes** hasta «Cuándo empieza mi período».
- Esperado: el texto que empieza con «Ojo:» se ve como una nota con barra bronce a la izquierda.
5. Apaga la lectura de SMS (Ajustes → Sincronización SMS) y abre el tutorial **Movimientos**.
- Esperado: «Cómo clasifica la app» dice «Elige la categoría según el tipo de gasto:» y el paso «Tus depósitos por SMS» no aparece; el contador «n/N» se ajusta. Lo mismo en **Saldos** (sin «7. Cuándo pregunta») y en **Gasto fijo con cuenta** (sin «4. Deja que el SMS lo detecte»).
6. Abre el tutorial **Registrar una compra con tarjeta**, **Cómo funcionan las visacuotas**, **Tu sueldo** y **Widget**.
- Esperado: los títulos van numerados seguidos (1, 2, 3…) sin saltos, aunque un paso largo se haya repartido.

---

## 21. Resumen de resultados

| Código | ✅ / ❌ / ⚠️ | Qué viste |
|---|---|---|
| P-01 | | |
| T-01 a T-06 (onboarding e Inicio) | | |
| T-07 a T-13 (registrar y categorías) | | |
| T-14 a T-23 (SMS, movimientos y revisión) | | |
| T-24 a T-31 (presupuesto e ingresos) | | |
| T-32 a T-36 (período de pago) | | |
| T-37 a T-48 (cuentas, tarjetas, cuotas) | | |
| T-49 a T-54 (transferencias) | | |
| T-55 a T-59 (estadísticas y asesor) | | |
| T-60 a T-65 (notificaciones y capacidad) | | |
| T-66 a T-70 (widget) | | |
| T-71 a T-76 (seguridad, ajustes, tutoriales) | | |
| T-77 (score: ahorro pendiente el día 1) | | |
| T-78 (misma cifra de gasto en anillo, score, avisos y widget) | | |
| T-79 (ratio deuda/ingreso desde las cuotas reales; fronteras 20 y 40) | | |
| T-80 (deuda declarada vieja y «Ya no la tengo») | | |
| T-81 (tarjeta sin fechas: guía, insignia, aviso, tutorial) | | |
| T-82 (tarjeta del onboarding con corte 9 y pago 2) | | |
| T-83 (semanal con pago en martes) | | |
| T-84 (semanal sin cambiar: domingo) | | |
| T-85 (irregular = mes calendario) | | |
| T-86 (presupuesto quincenal: la mitad) | | |
| T-87 (presupuesto semanal: 12/52) | | |
| T-88 (mensual e irregular no cambian) | | |
| T-89 (asesor local: cuota pausada no cuenta) | | |
| T-90 (tono «tú», sin voseo) | | |
| T-91 («Pegar SMS» sin lectura de SMS) | | |
| T-92 (widget con ingresos irregulares) | | |
| T-93 (irregular: ningún contador dice «0 días») | | |
| T-94 (patrimonio con y sin cuentas que llevan saldo) | | |
| T-95 (voseo residual corregido) | | |
| T-96 (deudas al configurar: ninguna cuota el mismo día) | | |
| T-97 (deuda tipo tarjeta declarada, sin doble conteo) | | |
| T-98 (préstamo: el SMS del débito es la cuota) | | |
| T-99 (actualizar con deudas del configurador anterior) | | |
| T-100 (gastos fijos pagados no se reinician el sábado) | | |
| T-101 (deshacer sincronización con par de transferencia) | | |
| T-102 (capacidad con ingreso declarado y período corto) | | |
| T-103 (visacuota con todos los cortes cumplidos queda terminada) | | |
| T-104 (deshacer ingreso vinculado restaura período y lo aprendido) | | |
| T-105 («+ gasto» del widget con la app abierta, en segundo plano y cerrada) | | |
| T-106 (widget con las cifras al día y «Abre la app para actualizar») | | |
| T-107 (borrar todos los datos: tutoriales y widget) | | |
| T-108 (sincronización de SMS «como máximo cada 15 minutos») | | |
| T-109 (avisos de presupuesto: ciclo irregular y montos con formato) | | |
| T-110 (permiso de notificaciones al terminar la configuración inicial) | | |
| T-111 (la huella no protege el widget) | | |
| T-112 (cuadros tocables y vistas de la gráfica) | | |
| T-113 (vista AHORRO: ahorro negativo y sin ingresos) | | |
| T-114 (aviso de transferencias sin clasificar, período actual y anterior) | | |
| T-115 (interruptor «Sin transferencias») | | |
| T-116 (selector Q / $) | | |
| T-117 («Revisar (N)» cuenta «¿A qué cuenta fue?» y «Revisar también lo de antes») | | |
| T-118 («PENDIENTE» en una línea y el botón flotante sin tapar montos) | | |
| T-119 (gasto fijo con cuenta o tarjeta, chip y aviso de visacuota) | | |
| T-120 (SMS con el mismo nombre en cualquier día del mismo período) | | |
| T-121 (SMS de otra cuenta o con dos candidatos: propuesta) | | |
| T-122 (marcado a mano y luego el SMS; tutorial «Gasto fijo con cuenta o tarjeta») | | |
| T-123 (formato de los tutoriales: pasos cortos, frase clave, viñetas y resaltes) | | |

## Cómo reportar un problema

Anota, para cada ❌:
1. **Código de la prueba** (por ejemplo T-43).
2. **Qué hiciste**, paso por paso.
3. **Qué esperabas** y **qué pasó** (copia el texto del error si lo hay).
4. **Una captura de pantalla**.
5. Si fue con un SMS, el texto **con los números de cuenta tapados**.

> Importante: el **widget** (T-66 a T-70, T-92 y la parte del widget de T-78) y la apertura de la app tras el cambio de punto de entrada solo pueden validarse en un teléfono real con este build. Si la app no abre al instalarla, repórtalo primero.
