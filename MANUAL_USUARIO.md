# 📖 Manual de Usuario — BudgetMaster

**Versión 1.0 · Julio 2026**

BudgetMaster es tu asesor financiero personal: registra tus gastos e ingresos (manualmente o leyendo tus SMS bancarios), controla tu presupuesto por período de pago, administra tus cuentas, deudas y metas de ahorro, y te aconseja con inteligencia artificial. Todos tus datos se guardan **únicamente en tu teléfono**.

---

## Índice

1. [Primeros pasos (Onboarding)](#1-primeros-pasos-onboarding)
2. [Pantalla de Inicio (Dashboard)](#2-pantalla-de-inicio-dashboard)
3. [Registrar gastos e ingresos](#3-registrar-gastos-e-ingresos)
4. [Sincronización automática por SMS (Android)](#4-sincronización-automática-por-sms-android)
5. [Movimientos](#5-movimientos)
6. [Presupuesto: gastos fijos, categorías, metas e ingresos](#6-presupuesto)
7. [Mis Cuentas y Visacuotas](#7-mis-cuentas-y-visacuotas)
8. [Estadísticas](#8-estadísticas)
9. [Asesor IA (tu CFO personal)](#9-asesor-ia)
10. [Ajustes](#10-ajustes)
11. [Seguridad biométrica](#11-seguridad-biométrica)
12. [Notificaciones y alertas](#12-notificaciones-y-alertas)
13. [Academia (tutoriales)](#13-academia-tutoriales)
14. [Preguntas frecuentes](#14-preguntas-frecuentes)
15. [Privacidad](#15-privacidad)

---

## 1. Primeros pasos (Onboarding)

La primera vez que abras la app, un asistente de 8 pasos configura tu perfil financiero:

| Paso | Qué te pregunta | Para qué sirve |
|------|-----------------|----------------|
| 1 | **Tu nombre** | Personalizar la app y los consejos del asesor. |
| 2 | **Ingreso mensual y moneda** (Q o USD) | Base de todos los análisis. Tu presupuesto inicial se calcula como el 80 % de este ingreso. |
| 3 | **Ciclo de pago**: mensual, quincenal, semanal o irregular | La app trabaja con tu *período financiero real* (de pago a pago), no con el mes calendario. |
| 4 | **Día(s) de pago** (ej. 30, o 15,30 si es quincenal) | Calcular cuántos días faltan para tu próximo ingreso. |
| 5 | **Tu mayor gasto fijo** | Referencia inicial (luego podés detallar todos en Presupuesto). |
| 6 | **Tus deudas activas** (tarjetas, préstamos, visacuotas) | Cada deuda que registres con cuota mensual se convierte automáticamente en una *visacuota* para seguimiento. Si superás el 30 % de tu ingreso en deudas, la app te lo advierte. |
| 7 | **Meta de ahorro mensual** | Se recomienda mínimo el 20 % de tu ingreso. |
| 8 | **Bancos que usás y ahorros actuales** | Los bancos ayudan a la detección de SMS; los ahorros se suman a tu patrimonio. |

Al terminar, se lanza el **Tour Inicial** de 7 pasos que te muestra las funciones principales.

> 💡 Todo lo que respondas se puede cambiar después en **Ajustes**.

**El SMS de tu pago.** Entre los pasos opcionales de «Configura tu dinero» (justo después de tus cuentas) la app te pide **un ejemplo del SMS con el que te llega tu pago**: sueldo, quincena, venta semanal… cada persona cobra distinto. Pegás el texto del SMS (o, en Android con el permiso de SMS ya dado, tocás **Elegir de mis SMS**) y la app te muestra lo que entendió: banco, cuenta, quién envía el dinero y el monto aproximado. Tocás **Sí, es así** o **Corregir**. No se guarda ningún número de cuenta. Con eso, al terminar la configuración queda creada tu primera **fuente de ingreso** con tu ingreso, tu ciclo y tus días de pago, y la app reconoce tu pago sola cuando llega.

Es un paso que se puede saltar con **Lo hago después**: la fuente se crea igual, sin el patrón, y en el Inicio, en **Guía y primeros pasos**, queda el pendiente **«Enseñarle a la app tu pago»** hasta que lo completes (te lleva a Presupuesto → Ingresos). El tutorial **«Tu sueldo»** cuenta el proceso en el mismo orden.

---

## 2. Pantalla de Inicio (Dashboard)

Es tu centro de mando. De arriba hacia abajo:

- **Encabezado** — tu nombre, el rango del período financiero actual (ej. "30 Jun – 29 Jul 2026"), el día del período en que vas, y un contador de días hasta tu próximo pago (se pone rojo cuando faltan 3 o menos). El período empieza el día que cae tu sueldo: si tu día de pago cae en fin de semana o feriado de Guatemala, arranca el día hábil en que de verdad te pagan. **Tocá el rango del período** para ver de dónde sale su inicio («Empezó con tu sueldo del vie 25», «Adelantado por fin de semana o feriado», «Fijado por vos» o «Es tu día de pago»), elegir otra fecha de inicio con **Guardar**, volver a lo automático con **Volver a automático** y ajustar las reglas (ver [sección 10](#10-ajustes)). La primera vez que tu período empieza antes o después de tu día de pago, la app te lo avisa una sola vez.
- **Botón de sincronización SMS** (⟳, esquina superior derecha) — lee tus SMS bancarios e importa transacciones automáticamente. Ver [sección 4](#4-sincronización-automática-por-sms-android).
- **CFO Intelligence (briefing)** — resumen diario de tu situación: porcentaje de presupuesto usado, dinero restante, gastos fijos pendientes y una frase motivacional. Con API Key de Gemini el briefing es generado por IA con tus datos reales.
- **Score Financiero (0–100)** — tu termómetro de disciplina. Sube si ahorrás (tasa ≥ 10–20 %), te mantenés dentro del presupuesto, pagás todos tus gastos fijos y tenés cuentas registradas. 80+ Excelente · 60+ Bueno · 40+ Regular · <40 Crítico.
- **Patrimonio Total** — activos menos deudas. El saldo es opcional: si tus cuentas llevan saldo, se calcula con esos saldos (una cuenta sin saldo no suma); si no hay ninguna que lo lleve, se estima con tus ingresos/gastos + ahorros externos. Tocá el ícono ⓘ para ver la explicación.
- **Balance por moneda** — ingresos, gastos y neto del período en Q (y en USD si tenés movimientos en dólares).
- **Comparativa con el período anterior** — cuánto más (rojo) o menos (verde) llevás gastado respecto al período pasado.
- **Anillo de presupuesto** — porcentaje del presupuesto del período ya consumido. Cambia a amarillo al superar el 80 % y a rojo al excederlo.
- **Widgets**: Mis Cuentas (patrimonio, deuda, cuotas del mes), Gastos Fijos (pagados/pendientes, vencidos), Metas de Ahorro (avance).
- **Gráfica de gastos de los últimos 6 meses** y **transacciones recientes**.

Deslizá hacia abajo (*pull to refresh*) para recargar todos los datos.

### Barra inferior de navegación

| Ícono | Pestaña | Función |
|-------|---------|---------|
| 🏠 | Inicio | Dashboard |
| ☰ | Movimientos | Historial de transacciones |
| 👛 | Presupuesto | Gastos fijos, categorías y metas |
| ➕ (botón cobre central) | Agregar | Nueva transacción |
| 📊 | Estadísticas | Análisis y gráficas |
| ✦ | Asesor | Chat con tu CFO IA |
| ⚙️ | Ajustes | Configuración |

---

## 3. Registrar gastos e ingresos

Tocá el **botón ➕** de la barra inferior.

1. **Tipo** — elegí *Gasto* (rojo) o *Ingreso* (verde).
2. **Moneda** — Q, USD, EUR o £. La app lleva balances separados por moneda.
3. **Monto** — obligatorio y mayor a 0.
4. **Descripción** (opcional) — ej. "Almuerzo", "Uber", "Salario".
5. **Categoría** — 20 categorías de gasto (Comida, Supermercado, Combustible, Streaming…) o 9 de ingreso (Salario, Freelance…), más las personalizadas. Si ninguna te sirve, toca **+ Nueva categoría** (la última casilla de la lista) y la creas ahí mismo: queda elegida para ese movimiento. Las propias se editan tocándolas en Ajustes → Mis Categorías.
6. Tocá **Guardar**.

Al guardar un gasto en Q, la app evalúa tu presupuesto y te envía una notificación con tu situación actualizada (ver [sección 12](#12-notificaciones-y-alertas)).

### Pegar un SMS bancario (funciona en cualquier teléfono)

Si no querés dar permiso de SMS (o usás iPhone), tocá **"Leer SMS"** arriba a la derecha, pegá el texto del mensaje de tu banco y presioná **Analizar SMS**. La app detecta automáticamente el monto, la moneda, el tipo (gasto/ingreso) y el banco, y te deja el formulario listo para guardar.

---

## 4. Sincronización automática por SMS (Android)

> ⚠️ Esta función **solo existe en Android** y requiere el permiso de lectura de SMS.

Tocá el botón **⟳** del Dashboard. La app:

1. Lee hasta los últimos **2000 SMS** de tu bandeja de entrada (máximo 3 meses hacia atrás).
2. Filtra **solo los mensajes con palabras bancarias** (compra, débito, abono, retiro, transferencia, etc.). Nunca procesa mensajes personales.
3. Detecta monto, moneda, tipo, banco (BAC, BANRURAL, GTC, BANTRAB, PROMERICA…) y categoría (ej. "SHELL" → Combustible, "WALMART" → Supermercado, "NETFLIX" → Streaming).
4. Genera una descripción limpia (ej. "BAC · Compra en Walmart").
5. **Ignora duplicados** (cada SMS genera un identificador único) y **transferencias entre tus propias cuentas**.

Al final te muestra un resumen: SMS leídos, bancarios detectados, nuevos importados y ya registrados.

Las transacciones importadas llevan la etiqueta **SMS** y guardan el mensaje original: podés verlo tocando la transacción en Movimientos → "Ver SMS original".

**La app aprende de tus correcciones.** En los gastos recuerda el comercio. En los **ingresos por SMS recuerda el origen del depósito** (banco, cuenta y quién lo envía, por ejemplo «SECCIÓN DE OPERACIONES DE DEPÓSITOS»): si cambiás la categoría de un depósito y dejás activo **«Recordar para los depósitos de…»**, los próximos depósitos del mismo origen llegan ya clasificados. Si el SMS no dice de dónde viene el dinero, no se puede recordar.

**Tus fuentes de ingreso.** Si creaste una fuente de ingreso con un SMS de ejemplo (ver [6.4](#64-ingresos)), un depósito que se le parece se vincula solo. Cuando la app no está segura, el **Centro de revisión** (aviso «Revisar» del Inicio, o Ajustes → «Revisar pendientes») te muestra la fila **«¿Es tu sueldo?»**: confirmás con **Sí** o la descartás con **No** (un «No» no vuelve a preguntarse).

---

## 5. Movimientos

Historial completo de transacciones, con:

- **Búsqueda** por descripción, banco o categoría.
- **Filtros** por tipo (Todos / Gastos / Ingresos) y por moneda (si tenés USD o EUR).
- Cada tarjeta muestra descripción, fecha, banco, insignias (SMS, moneda) y monto (verde = ingreso, rojo = gasto).

**Tocá una transacción** para abrir el detalle, donde podés:
- Editar la **descripción**, la **moneda** y la **categoría**. En SMS de gastos podés activar **«Recordar»** para ese comercio; en SMS de ingresos, **«Recordar para los depósitos de…»** guarda el origen del depósito (banco, cuenta y quién lo envía). Con **«Aplicar a anteriores»** se corrigen también los movimientos parecidos que no editaste a mano.
- Ver el **SMS original** (si vino de un SMS).
- En un **ingreso**, **«Vincular a fuente de ingreso»** lo asigna a una de tus fuentes (toma su categoría y, si la fuente mueve tu período, el período empieza ese día); **«Quitar vínculo con la fuente»** lo suelta (la categoría se queda).
- **Eliminarla** (pide confirmación; no se puede deshacer).

También podés eliminar rápido con el ícono 🗑 de cada tarjeta.

---

## 6. Presupuesto

La pestaña Presupuesto tiene **cuatro secciones**:

### 6.1 Gastos Fijos

Tus compromisos recurrentes del mes: renta, internet, seguros, cuota del gym…

- **Agregar**: botón ➕ flotante → nombre, monto, moneda (Q/USD), día del mes en que vence (1–31), categoría y notas.
- **Registrar automáticamente (AUTO)**: si está activado, al marcar el gasto como pagado ✓ se crea la transacción de gasto automáticamente. Activado por defecto.
- **Marcar como pagado**: tocá el círculo a la izquierda. Se tacha y suma al progreso del mes.
- **Editar**: mantené presionada la tarjeta. **Eliminar**: ícono 🗑.
- Si pasa el día de vencimiento sin pagar, aparece la insignia roja **VENCIDO**.
- El resumen superior muestra pagados/total, monto cubierto, pendiente y días hasta tu próximo pago.

> 🔄 **Cada mes, los gastos fijos se desmarcan automáticamente** para que empieces el ciclo de nuevo.

### 6.2 Categorías (presupuesto por categoría)

Asigná un límite mensual en Q a cada categoría (ej. Comida Q1,500):

- Tocá una categoría de la lista "Agregar presupuesto", escribí el límite y confirmá ✓.
- Cada categoría con presupuesto muestra su barra de avance: color normal → **amarillo al 80 %** → **rojo si te excedés** (con el monto de exceso exacto).
- Al registrar un gasto que lleva una categoría al 80 % o 100 %, recibís una notificación inmediata.
- El resumen superior compara lo planificado vs. lo gastado del mes.

### 6.3 Metas de Ahorro

Objetivos con nombre, monto, fecha límite, color e ícono (ej. "Laptop — Q8,000 — diciembre"):

- **Crear**: botón ➕ → nombre, monto objetivo, cuánto ya tenés ahorrado, moneda, fecha límite (formato AAAA-MM-DD; si la dejás vacía se asumen 6 meses), color e ícono.
- **Abonar**: botón "Abonar" en la tarjeta de la meta → ingresá el monto. Al alcanzar el objetivo la meta pasa a **Completadas** 🏆.
- Cada meta muestra: % completado, restante, días de plazo y **cuánto necesitás ahorrar por mes** para llegar a tiempo.

### 6.4 Ingresos

De dónde y cuándo te pagan: sueldo, quincena, ventas semanales, aguinaldo, bono 14… Cada una es una **fuente de ingreso**. Con ellas la app reconoce tu pago cuando llega, sabe si ya llegó o se atrasó y puede mover el inicio de tu período al día real en que te pagan.

- **Resumen**: arriba ves el **Ingreso base del período** (lo que de verdad te pagan tus fuentes base en un mes; los extras no cuentan). Si ese ingreso real difiere en más de 5 % del que declaraste, aparece un aviso «Tu ingreso real es Q X, ¿actualizar el declarado?» con el botón **Actualizar**.
- **Lista**: cada fuente muestra su ciclo y su estado: **Esperado** (aún no llega), **Recibido** (ya llegó y la app lo reconoció) o **Atrasado** (pasó la tolerancia de días sin que llegara). Tocá una fuente para editarla o eliminarla.
- **Tu primera fuente**: al terminar la configuración inicial la app ya crea una con tu ingreso, tu ciclo y tus días de pago (y el patrón del SMS si lo enseñaste). Tocala para revisarla o completarle el SMS de ejemplo.
- **Crear una fuente**: botón ➕ flotante.
  - **Nombre**, **categoría de ingreso** (con **+ Nueva categoría**), **monto**, **moneda** (Q/USD).
  - **Cada cuánto**: Mensual (1 día), Quincenal (2 días), Semanal (día de la semana) o Irregular (sin día).
  - **Si cae en fin de semana o feriado**: «La global» (la de Ajustes) o una regla propia de esa fuente.
  - **Cuenta donde te pagan** y **tipo**: **Base** (tu ingreso regular) o **Extra** (llega solo en ciertos meses: *Bono 14 → julio*, *Aguinaldo → diciembre* o los meses que marques).
  - **Mueve mi período cuando llega** (solo base mensual o quincenal): el período empieza el día que de verdad te pagan, dentro de la tolerancia.
  - **SMS de ejemplo**: pegá el SMS que te mandó el banco cuando te pagaron, o (en Android, con SMS activo) tocá **Elegir de mis SMS**. La app muestra «Entendimos: banco · cuenta · de quién · monto aproximado» y vos tocás **Sí, es así** o **Corregir** (quién envía y monto). No se guarda ningún número de cuenta. Sin SMS de ejemplo la fuente se guarda igual, pero no detecta tu pago sola: vinculás cada depósito a mano desde su detalle en Movimientos.
- El tutorial **«Tu sueldo»** recorre el proceso en orden: la cuenta, la fuente, el SMS de ejemplo, confirmar y esperar el pago.

---

## 7. Mis Cuentas y Visacuotas

Se abre desde el widget **Mis Cuentas** del Dashboard.

### Cuentas

Registrá dónde está tu dinero real:

| Tipo | Uso |
|------|-----|
| 💵 Efectivo | Dinero físico |
| 🏦 Banco | Cuenta monetaria o de ahorro |
| 💳 Tarjeta de Crédito | **Saldo deudor** (lo que debés) y límite de crédito |
| 📈 Inversión | Acciones, cripto, fondos |
| 💰 Ahorro | Cuenta de ahorro separada |

- **Crear**: botón ➕ → tipo, nombre, banco (opcional), moneda (Q/USD), saldo actual, color y notas. Las tarjetas de crédito piden además el **día de corte** y el **día de pago**.
- **Día de corte de la tarjeta** = la fecha de **«Saldo al corte»** de tu estado de cuenta. Ese día todavía entra en el estado y el **ciclo nuevo empieza al día siguiente** (corte el 9 → el ciclo nuevo arranca el 10 a las 00:00). El pago cae en la primera aparición del día de pago después del corte (corte el 9 y pago el 2 → se paga el 2 del mes siguiente).
- En cada tarjeta ves el **«Ciclo abierto»**: lo que llevás gastado desde el último corte, **separado por moneda** («Q 9,276.01 · $39.67»): las compras en dólares se pagan en dólares, no se mezclan. Las transferencias nunca suman.
- El «Ciclo abierto» se ve **también sin SMS**: la tarjeta funciona con gastos anotados a mano (en el detalle del movimiento elegís la tarjeta en «Cuenta»). Lo que depende de los SMS se oculta si apagás la lectura de SMS.
- **Cuenta con la que pagás**: al crear o editar la tarjeta podés elegir de qué cuenta sale el dinero cuando la pagás (por ejemplo: te pagan en un banco, transferís a tu cuenta de BAC y pagás la tarjeta desde ahí).
- **Editar**: mantené presionada la tarjeta. **Eliminar**: ícono 🗑.
- El resumen superior muestra **Activos, Deudas y Neto** (las tarjetas de crédito restan del patrimonio).

### Estado de cuenta y pago de la tarjeta

En el detalle de cada tarjeta ves el bloque **«Estado al {corte}»**:

- **Cuánto debés**, en quetzales y en dólares **por separado** (cada saldo se paga por su cuenta), con la etiqueta **«Estimado»** (la suma de los cargos de la tarjeta en ese ciclo, cuotas de visacuotas incluidas) o **«Del estado de cuenta»** (el monto real que escribiste).
- **«Pagá antes del {fecha}»** (el día de pago después del corte) y el estado: **Pendiente**, **Pago parcial**, **Pagado** o **Vencido**.
- **Ciclo abierto**: lo que llevás gastado desde el último corte.
- **Ingresar monto real**: el banco no manda el total de la tarjeta por SMS (el estado llega por correo), así que ahí escribís lo que dice tu estado de cuenta, un campo por moneda. Si lo dejás vacío se usa el estimado.
- **Registrar pago**: precarga lo que falta por moneda; podés pagar solo una parte, elegir la fecha y la cuenta de origen. Lo que falta sigue pendiente.
- **Pagar la tarjeta es una transferencia entre tus cuentas, no un gasto nuevo**: no suma a tus gastos del período ni se cuenta dos veces (cada compra ya contó cuando la hiciste con la tarjeta).
- **Con SMS (Android)**: si el banco manda el SMS del pago, la app lo asigna al estado cerrado más reciente que aún deba esa moneda y, si hay una salida de tu cuenta pagadora con el mismo monto (±0.01) dentro de 36 horas, las junta en una sola transferencia neutra. Si solo hay una salida que se parece a lo que falta (±1 %) entre el corte y el vencimiento + 5 días, el Centro de revisión te pregunta **«¿Es el pago de tu tarjeta?»**. **Deshacer** una sincronización revierte esos emparejamientos.
- En **Presupuesto → Gastos Fijos**, la sección **«Deuda programada»** lista las tarjetas (lo que falta de su estado) y los préstamos que vencen en el período, y se suma a lo «Comprometido» junto con tus gastos fijos pendientes, sin contar dos veces lo que ya tengas como gasto fijo.
- Dos tutoriales lo cuentan en orden (también en la guía del Inicio): **«Registrar una compra con tarjeta»** y **«Pagar la tarjeta»**.

### Transferencias entre cuentas

Botón **"Transferir"** (necesitás al menos 2 cuentas activas): elegí origen, destino y monto. Si las cuentas llevan saldo, se mueve entre ellas (en la de saldo manual se ajusta el número) y queda registrado como movimiento tipo *transferencia* — **no cuenta como gasto ni ingreso**.

> ⚠️ Transferí entre cuentas de la **misma moneda**: la app no convierte Q↔USD automáticamente.

### Visacuotas (compras en cuotas)

Para compras financiadas con tarjeta (ej. "Laptop — Q6,000 en 12 cuotas de Q500"):

- **Crear**: pestaña Visacuotas → ➕ → tarjeta asociada, nombre, monto total, cuota mensual (el número de cuotas se calcula solo), categoría.
- Si registrás la visacuota con cuotas ya pagadas, la app solo carga las siguientes (no genera cargos del pasado).
- Ahora también podés elegir **«Sin tarjeta (préstamo)»** con su **día de pago**, indicar las cuotas ya pagadas y la fecha de la compra. La app también las detecta sola desde el SMS de «compra a cuotas» del banco (Android).
- **Cada cuota se carga como gasto en el corte en que entra, no la compra completa**: en cada corte de la tarjeta la app registra UNA cuota (fechada el día del corte, con la categoría de la visacuota) y tu período solo suma esa cuota. La primera cuota entra en el primer corte desde la fecha de la compra. Si la app estuvo cerrada varios cortes, al abrirla pone al día todas las cuotas de una vez, sin duplicar ninguna.
- Si ya tenías ese cargo por SMS, se marca como la cuota en vez de contarse dos veces. Si borrás una cuota de Movimientos, no se vuelve a crear.
- Cada visacuota muestra la **«Próxima cuota»** (el corte en que entra), las cuotas cargadas y las restantes. Al cargarse la última, la visacuota **termina sola**.
- **Eliminar** una visacuota conserva los cargos que ya hizo (fueron gastos reales). **Deshacer** una sincronización de SMS sí borra los cargos de las visacuotas que deshace.
- El Dashboard te avisa cuánto debés este mes en visacuotas.
- El tutorial **«Cómo funcionan las visacuotas»** (también en la guía del Inicio como «Visacuotas») lo cuenta en orden: la tarjeta con su corte, la compra en cuotas, el cargo de cada corte y la última cuota.

---

## 8. Estadísticas

Análisis completo con filtros: **Período actual · Período anterior · Este año · Todo**.

- **Gráfica de pastel por categoría** — tocá una porción (o la leyenda) para ver su detalle. El centro muestra el total.
- **Tasa de ahorro** — (ingresos − gastos) / ingresos. Meta recomendada: ≥ 20 %.
- **Flujo de caja proyectado** — a tu ritmo diario actual, cuánto gastarás a fin de mes y si te sobrará o faltará.
- **Comparativa de 6 meses** — barras de gastos e ingresos mes a mes, con la diferencia vs. el mes anterior.
- **Patrimonio neto histórico** y **proyección a 6 y 12 meses** según tu ritmo de ahorro.
- **Gasto promedio diario** vs. tu presupuesto diario ideal.
- **Días sin gastar** del mes.
- **Gasto por banco/tarjeta** (si usás sync SMS).
- **Ratio deuda/ingreso** — verde < 20 %, amarillo 20–40 %, rojo > 40 %.

---

## 9. Asesor IA

Tocá **✦ Asesor** en la barra inferior. Es un chat con tu "CFO personal" que conoce **todos tus datos**: período actual, gastos por categoría, historial de 3 meses, cuentas, gastos fijos, visacuotas, presupuestos y metas.

**Preguntas útiles:**
- "¿Cómo voy este mes?"
- "¿En qué gasté más?"
- "¿Puedo comprarme un celular de Q3,000?"
- "Dame un plan de ahorro para Q15,000 en 6 meses"
- "¿Cuánto pago en suscripciones?"

**Dos modos:**

| Modo | Requisito | Qué hace |
|------|-----------|----------|
| **Básico** (sin configurar nada) | — | Respuestas con lógica local sobre tus datos reales: resumen, capacidad de compra, deudas, cuentas, metas. |
| **Gemini** (recomendado) | API Key gratuita de Google | Conversación natural con memoria del chat, análisis profundos y consejos personalizados. |

**Para activar Gemini:** entrá a [aistudio.google.com](https://aistudio.google.com) → *Get API Key* → copiá la clave → pegala en **Ajustes → Inteligencia Artificial (Gemini)** → Guardar. El indicador del chat cambia a "● Gemini activo".

El botón ⟳ del chat reinicia la conversación. Si no hay internet, el asesor responde en modo local automáticamente.

### Órdenes y consultas

Además de aconsejarte, el Asesor entiende **órdenes** y **consultas**. Funciona en modo local (sin internet ni clave); con Gemini además entiende frases más libres.

**Órdenes** (crean algo; siempre te piden confirmación):

| Querés... | Escribí por ejemplo |
|-----------|---------------------|
| Crear una meta de ahorro | "Crea una meta de Q5,000 para una laptop en diciembre" |
| Fijar un límite por categoría | "Ponle un límite de Q800 a Restaurantes" |
| Agregar un gasto fijo | "Agrega Netflix de $15.99 el 5 de cada mes" |
| Registrar un gasto | "Gasté 85 en gasolina ayer" |
| Registrar un ingreso | "Me pagaron Q6,000 de sueldo" |

Si falta algún dato (monto, fecha, categoría...), el Asesor te lo pregunta con botones de respuesta rápida. Los límites por categoría se manejan siempre en quetzales.

**Consultas** (solo muestran información, no cambian nada):

- "¿Cuánto gasté en Restaurantes este período?" — total por moneda; los dólares se muestran aparte, nunca se suman a los quetzales.
- "Muéstrame los movimientos de Spotify" — últimos movimientos, filtrables por comercio, categoría o fechas.
- "¿Qué gastos fijos me faltan por pagar?" — pendientes del período, con insignia **Vencido** si corresponde.
- "¿Cómo van mis presupuestos?" — avance de cada límite por categoría.
- "¿Cómo van mis metas?" — avance de tus metas de ahorro.

Podés acotar el rango con frases como "este período", "período anterior", "ayer", "esta semana", "este mes", "mes pasado" o "últimos 30 días". Sin rango se usa tu período de presupuesto actual.

**Acciones guiadas:** debajo del chat están los botones **Crear meta**, **Presupuesto**, **Gasto fijo**, **Registrar gasto** y **Consultar**. Te piden los datos paso a paso. Se ocultan mientras el teclado está abierto.

**Confirmar, Editar, Cancelar y Deshacer:**
- Antes de guardar, el Asesor muestra una **tarjeta** con el resumen y los avisos (por ejemplo, un posible movimiento duplicado). Escribir "sí" no guarda nada: tenés que tocar **Confirmar**.
- **Editar** abre un formulario para corregir cualquier dato; **Cancelar** descarta la propuesta. También podés corregir escribiendo, por ejemplo, "no, eran 600".
- Después de guardar aparece un aviso con **Deshacer**. Solo deshace si el registro sigue igual (si cambió después, por ejemplo al unirse con un SMS, ya no se puede).
- La conversación se conserva al cambiar de pestaña. Las tarjetas que quedaron sin confirmar se marcan como vencidas al volver.

---

## 10. Ajustes

- **Tu Perfil** — tu nombre.
- **Presupuesto mensual** — límite de gasto en Q (obligatorio, > 0) y opcional en USD.
- **Ingresos y período** — muestra tu día de pago y el período actual. **Mis fuentes de ingreso** te lleva a Presupuesto → Ingresos. En **Ciclo de pago** cambiás el ciclo (mensual, quincenal, semanal o irregular) y el día o los dos días de pago; se guarda con **Guardar ciclo y día de pago** (no con *Guardar Cambios*). Cambiar el día mueve tu período; lo que fijaste a mano en un período anterior se conserva. El botón **Cuándo empieza mi período** abre el mismo detalle que se abre al tocar el encabezado del Inicio:
  - **Inicio del período** — chips con las fechas cercanas a tu día de pago (±la tolerancia); nunca se ofrece una fecha futura. **Guardar** fija a mano el inicio; **Volver a automático** quita lo fijado a mano. *Lo que fijás a mano siempre gana*: la app no lo cambia sola.
  - **Reglas** — qué hacer si el día de pago cae en fin de semana o feriado (**Viernes antes**, **Lunes después** o **Día exacto**), si cuentan los **feriados de Guatemala**, la **tolerancia** (de 1 a 7 días de diferencia máxima con el día de pago) y **Adelantar el período cuando llega el sueldo** (cuando la app reconoce por SMS el depósito de tu sueldo y cae antes o después de lo esperado, dentro de la tolerancia, el período empieza ese día). Se guardan con **Guardar reglas**, no con *Guardar Cambios*.
  - Solo aplica a ciclos **mensual** y **quincenal**; con ciclo semanal o irregular el inicio del período es fijo.
- **Moneda principal** — Q, $, € o £.
- **Tipo de cambio USD → Q** — se actualiza solo cada 6 horas desde el **Banco de Guatemala (Banguat)**, con respaldo del mercado internacional. Podés forzar la actualización con ⟳ o escribirlo manualmente.
- **Ahorros externos** — dinero guardado fuera de la app (Q y USD); se suma al Patrimonio Total.
- **Seguridad biométrica** — ver [sección 11](#11-seguridad-biométrica). Solo aparece si tu teléfono tiene huella/rostro configurado.
- **Sincronización SMS** — activar/desactivar la lectura automática.
- **Inteligencia Artificial (Gemini)** — tu API Key.
- **Mis Categorías** — creá categorías personalizadas: nombre, si aplica a gastos/ingresos/ambos, color e ícono. Aparecen junto a las predefinidas al registrar transacciones. También puedes crearlas al vuelo con **+ Nueva categoría**, y para cambiar el nombre, color, ícono o tipo de una propia, tócala en esta lista.
- **Academia** — reiniciar los tutoriales.
- **Guardar Cambios** — 💾 **los cambios no se aplican hasta tocar este botón.**
- **⚠️ Zona de Peligro — Borrar Todos los Datos** — elimina TODO permanentemente (transacciones, cuentas, configuración) y vuelve al onboarding. Pide confirmación y **no se puede deshacer**.

---

## 11. Seguridad biométrica

Con **Ajustes → Seguridad Biométrica** activada, la app pide tu **huella digital o Face ID** cada vez que se abre.

- Si el sensor falla, tocá el ícono para reintentar, o usá el **PIN/patrón del teléfono** cuando el sistema lo ofrezca.
- Si tu equipo no tiene biometría configurada, la opción no aparece y la app abre directamente.

---

## 12. Notificaciones y alertas

La app envía notificaciones locales (acepta el permiso la primera vez):

| Alerta | Cuándo |
|--------|--------|
| 💰 Gasto registrado | Cada gasto en Q: cuánto llevás y cuánto te queda. |
| 📊 Mitad del presupuesto | Al llegar al 50 %. |
| ⚠️ Zona de alerta | Al llegar al 80 % (general o por categoría), con el gasto diario que te queda disponible. |
| 🚨 Presupuesto agotado | Al superar el 100 %, con el exceso exacto. |
| 🎯 / 🏆 Metas | Al pasar el 50 % y al completar una meta. |
| 📊 Resumen semanal | Recordatorio cada 7 días. |

Las alertas incluyen una frase de disciplina financiera (Hill, Kiyosaki, Ramsey, Buffett…). Con Gemini activo, el texto lo redacta la IA usando tus números reales.

---

## 13. Academia (tutoriales)

Tutoriales interactivos con "spotlight" sobre la pantalla real:

1. **Tour Inicial** (7 pasos) — se lanza solo la primera vez.
2. Registrar un gasto o ingreso.
3. Sincronización SMS.
4. Presupuesto.
5. Asesor IA.
6. Módulo de Cuentas.
7. Estadísticas.
8. **Cómo se mide tu período** (también en la guía del Inicio como «Tu período») — tu día de pago, fin de semana y feriados, el sueldo que llega antes y la edición a mano.
9. **Tu sueldo** (también en la guía del Inicio) — cómo enseñarle a la app tu pago: la cuenta donde te pagan, la fuente de ingreso, un SMS de ejemplo y qué pasa cuando llega el pago.
10. **Cómo funcionan las visacuotas** (también en la guía del Inicio como «Visacuotas») — la tarjeta con su día de corte, la compra en cuotas, la cuota que se carga en cada corte y la última cuota.
11. **Registrar una compra con tarjeta** (también en la guía del Inicio como «Compra con tarjeta») — crear la tarjeta con su corte y su pago, registrar el gasto (o dejar que el SMS lo detecte) y verlo en el «Ciclo abierto».
12. **Pagar la tarjeta** (también en la guía del Inicio) — la cuenta con la que pagás, el monto real del estado, registrar el pago o dejar que el SMS lo detecte, y por qué no es un gasto nuevo.

En cada paso: **Siguiente** para avanzar u **Omitir tutorial** para salir. Los vistos quedan marcados. Para repetirlos: **Ajustes → Academia → Reiniciar todos los tutoriales**.

---

## 14. Preguntas frecuentes

**¿Por qué el "período" no coincide con el mes calendario?**
Porque la app trabaja de pago a pago según tu ciclo (ej. si te pagan el 15, tu período va del 15 al 14 del mes siguiente). Así el presupuesto refleja tu realidad. Si tu ciclo es "irregular", sí se usa el mes calendario. Además, el período empieza el día en que de verdad te pagan: si tu día de pago cae en fin de semana o feriado, arranca el día hábil anterior o siguiente según tus reglas, y siempre podés fijarlo a mano (tocá el rango del período en el Inicio).

**La sincronización SMS no importa nada.**
1) Verificá que diste el permiso de SMS a la app (Ajustes de Android → Apps → BudgetMaster → Permisos). 2) Solo funciona en Android. 3) Solo lee SMS de los últimos 3 meses con palabras bancarias. 4) Los ya importados se saltan (verás "Ya registrados" en el resumen).

**El Asesor IA responde "modo básico" aunque puse la API Key.**
Verificá que la clave esté completa y sin espacios, y que tocaste **Guardar Cambios** en Ajustes. Errores comunes: 403 = clave inválida; 429 = límite de solicitudes, esperá unos segundos.

**¿Puedo usar dólares y quetzales a la vez?**
Sí. Cada transacción, cuenta, gasto fijo y meta tiene su propia moneda, y la app muestra balances separados. El tipo de cambio (Banguat) se usa para consolidar el patrimonio.

**Marqué un gasto fijo como pagado por error.**
Tocá el círculo otra vez para desmarcarlo. Ojo: si tenía AUTO activado, la transacción creada hay que borrarla manualmente en Movimientos.

**¿Cómo respaldo mis datos?**
Los datos viven solo en el almacenamiento del teléfono. Si desinstalás la app o usás "Borrar Todos los Datos", se pierden. Aún no hay exportación integrada.

**El contador de días hasta el pago está mal.**
Revisá en Ajustes/onboarding tu ciclo y día(s) de pago. Para quincenal deben ser dos días separados por coma (ej. 15,30).

---

## 15. Privacidad

- **Todos tus datos se guardan localmente** en tu teléfono (AsyncStorage). No hay servidores de BudgetMaster ni cuentas en la nube.
- La lectura de SMS filtra por palabras bancarias y **nunca** procesa mensajes personales; el análisis ocurre en el dispositivo.
- Lo único que sale de tu teléfono: (1) la consulta del **tipo de cambio** a Banguat/API pública, y (2) si activás Gemini, el **contexto financiero resumido** que se envía a Google para generar las respuestas del asesor. Sin API Key, nada de tus finanzas sale del dispositivo.

---

*BudgetMaster — Planifica · Controla · Crece* 🪙
