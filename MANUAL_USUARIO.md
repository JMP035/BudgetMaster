# 📖 Manual de Usuario — BudgetMaster

**Versión del manual 1.1 · Noviembre 2026 · para BudgetMaster 1.0.0 (compilación del 18 de noviembre de 2026)**

BudgetMaster es tu asesor financiero personal: registra tus gastos e ingresos (manualmente o leyendo tus SMS bancarios), controla tu presupuesto por período de pago, administra tus cuentas, deudas y metas de ahorro, y te aconseja con inteligencia artificial. Todos tus datos se guardan **únicamente en tu teléfono**.

> Este manual habla siempre de «tú». Los nombres entre «comillas» y en **negrita** son textos que verás tal cual en la pantalla de la app.

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
13. [Widget (Android)](#13-widget-android)
14. [Academia (tutoriales)](#14-academia-tutoriales)
15. [Preguntas frecuentes](#15-preguntas-frecuentes)
16. [Privacidad](#16-privacidad)
17. [Limitaciones conocidas](#17-limitaciones-conocidas)

---

## 1. Primeros pasos (Onboarding)

La primera vez que abras la app, un asistente te pide primero **4 datos obligatorios** y después te ofrece **pasos opcionales** para configurar tu dinero. Si cierras la app a la mitad, al volver ves «Seguimos donde te quedaste».

### Fase 1 · Tu base (4 pasos obligatorios)

La barra superior marca «Paso N de 4».

| Paso | Qué te pregunta | Para qué sirve |
|------|-----------------|----------------|
| 1 | **«¿Cómo te llamas?»** | Personalizar la app y los consejos del asesor. |
| 2 | **«¿Cuánto ganas al mes?»**: moneda en que te pagan (Quetzales o Dólares), el monto (un aproximado basta) y el interruptor «También recibo o gasto en dólares» | Es la base de todos los análisis. Tu presupuesto mensual inicial se calcula como el **80 %** de este ingreso. Si te pagan en dólares, la app muestra su equivalente en quetzales con el tipo de cambio de hoy. |
| 3 | **«¿Cada cuándo te pagan?»**: Mensual, Quincenal, Semanal o Irregular, y según tu elección: el **día del mes** (mensual), los **dos días** (quincenal) o el **día de la semana** (semanal) | La app trabaja con tu *período financiero real* (de pago a pago), no con el mes calendario. Debajo ves el recuadro **«Así se va a medir tu dinero»**, que te dice cómo quedará tu período (ver abajo). |
| 4 | **«¿Cuánto quieres ahorrar al mes?»** (chip «Usar 20 %» o «Todavía no») | Tu meta mensual de ahorro. Se recomienda al menos el 20 % de tu ingreso. |

**Cómo se mide tu período según lo que elijas en el paso 3** (el recuadro «Así se va a medir tu dinero» lo muestra con tus fechas):

- **Mensual:** el período arranca el día que cobras y termina el día antes de tu siguiente pago. Los gastos fijos se cuentan una vez por período.
- **Quincenal:** tu presupuesto se mide por quincena. Los gastos fijos se cuentan una vez al mes.
- **Semanal:** eliges el día de la semana en que te pagan (Dom a Sáb). Tu semana va de ese día al anterior: si te pagan los martes, va de martes a lunes. Los gastos fijos se cuentan por mes calendario. La semana no se mueve por feriados ni fines de semana.
- **Irregular:** tu período es el **mes calendario** (del 1 al último día), porque tus ingresos no tienen fecha fija. Los gastos fijos también se cuentan por mes.

### Fase 2 · «Configura tu dinero» (pasos opcionales)

Al terminar la fase 1 ves la pantalla **«Configura tu dinero»** con la lista de lo que incluye. Toca **«Configurar ahora»** o **«Hacerlo después»**. Dentro de cada paso puedes usar **«Saltar»**, **«Seguir»**, **«Atrás»** o **«Terminar después»**. Lo que no hagas ahora te queda en el Inicio, en **«Guía y primeros pasos»**.

Los pasos, en este orden (algunos solo aparecen en ciertos casos):

| Paso | Qué hace |
|------|----------|
| **Cuentas y tarjetas** | Agrega tus cuentas (banco: Monetaria o Ahorro; Tarjeta de crédito; Efectivo). El saldo inicial es opcional. En una **tarjeta de crédito** te pide el **día de corte** y el **día de pago**: son opcionales, pero recomendados (están en tu estado de cuenta; corte = fecha de «Saldo al corte», pago = fecha límite). Con ellos la app te avisa antes de pagar y calcula si te alcanza. Cada tarjeta agregada muestra «Corte 9 · Pago 2» o, si no los pusiste, «Sin corte ni pago». |
| **SMS de tu pago** | Pega el SMS con el que te llega tu pago (o, en Android con el permiso ya dado, toca **«Elegir de mis SMS»**). La app te muestra lo que entendió y tú tocas **«Sí, es así»** o **«Corregir»** (ver abajo). Se puede saltar con **«Lo hago después»**. |
| **Gastos fijos** | Renta, servicios y suscripciones, con sugerencias rápidas (Renta, Luz, Agua, Internet…). Te recordamos antes de cada vencimiento. |
| **Deudas** | Registra cada deuda por separado (Tarjeta, Préstamo, Visacuota u Otra) con su cuota mensual. Si tienes tarjetas agregadas, eliges «¿De qué tarjeta?». El total mensual se compara con tu ingreso: «Entre 20 % y 40 % de tu ingreso en cuotas.» o «Más del 40 % de tu ingreso en cuotas. Zona de alerta.». Los préstamos, visacuotas y otras deudas piden además su **«Día de pago (opcional)»** (del 1 al 31; si lo dejas vacío se usa el día de hoy): cada cuota se registra como gasto en su día de pago, **empezando por el próximo** (nunca se carga una cuota el mismo día de la configuración); con una visacuota de una de tus tarjetas manda el corte de esa tarjeta. Esas deudas se convierten en una visacuota o préstamo de seguimiento (ver [sección 7](#visacuotas-compras-en-cuotas)). Una deuda tipo **Tarjeta** no se convierte en cuota (las compras de la tarjeta ya cuentan como gasto cuando las registras): solo queda como deuda declarada. El paso lo explica con un aviso arriba. |
| **Dólares** | Solo aparece si ingreso, cuentas, gastos o deudas están en dólares: el tipo de cambio («Automático (Banguat)» o «Fijo»). |
| **SMS** | Solo en Android: permiso para leer los SMS de tu banco, «Sincronizar al abrir la app» e «Importar mis movimientos de los últimos 3 meses al terminar». Puedes elegir «No quiero usar SMS». |
| **Huella o rostro** | Solo si tu teléfono tiene huella o rostro configurado. |
| **Asesor IA** | Pegar tu clave gratuita de Gemini (opcional). |

**El SMS de tu pago.** Cada persona cobra distinto: sueldo, quincena, venta semanal… Pega el texto del SMS con el que te llega tu pago y la app te muestra la tarjeta **«Entendimos»**: banco, cuenta (solo las últimas cifras), quién envía el dinero y el monto aproximado. Tocas **«Sí, es así»**, o **«Corregir»** para cambiar quién envía y el monto, o **«Usar otro SMS»**. No se guarda ningún número de cuenta completo. Con eso, al terminar la configuración queda creada tu primera **fuente de ingreso** (con tu ingreso, tu ciclo y tus días de pago) y la app reconoce tu pago sola cuando llega. Si saltas el paso, la fuente se crea igual, sin el patrón, y en el Inicio queda el pendiente **«Enseñarle a la app tu pago»** (te lleva a Presupuesto → Ingresos). El tutorial **«Tu sueldo»** cuenta el proceso en el mismo orden.

**Si cobras semanal:** el día de la semana que elegiste en el paso 3 gana sobre el día que traiga el SMS de ejemplo. Tu fuente de ingreso queda con ese día.

### Fase 3 · Recorrido guiado

La última pantalla pregunta **«¿Quieres un recorrido guiado?»**. **«Sí, mostrarme»** lanza el **Tour Inicial** de 7 pasos; **«Más tarde»** lo deja pendiente en la guía del Inicio como «Hacer el recorrido guiado».

> 💡 Todo lo que respondas se puede cambiar después en **Ajustes**.

> Si ya usabas BudgetMaster antes de que existieran las tarjetas con corte y pago y no tenías ninguna tarjeta registrada, la primera vez puede aparecer una pantalla extra, **«¿Usas tarjetas de crédito?»**, para agregarlas (es opcional: **«Omitir»**).

---

## 2. Pantalla de Inicio (Dashboard)

Es tu centro de mando. De arriba hacia abajo:

- **Encabezado** — tu nombre, el rango del período financiero actual (por ejemplo «27 oct 2026 – 26 nov 2026»), «Día N de M del período» y, a la derecha, un contador de días hasta tu próximo pago (por ejemplo «5d»; se pone rojo cuando faltan 3 o menos; no aparece si tus ingresos son irregulares). El período empieza el día que cae tu sueldo: si tu día de pago cae en fin de semana o feriado de Guatemala, arranca el día hábil en que de verdad te pagan. **Toca el rango del período** para abrir **«Cuándo empieza tu período»** y ver de dónde sale su inicio: «Empezó con tu sueldo del vie 25», «Adelantado por fin de semana o feriado», «Fijado por ti» o «Es tu día de pago»; también puedes elegir otra fecha de inicio con **«Guardar»**, volver a lo automático con **«Volver a automático»** y ajustar las reglas (ver [sección 10](#10-ajustes)). La primera vez que tu período empieza antes o después de tu día de pago, la app te lo avisa una sola vez. Con ciclo **semanal** o **irregular** ese detalle solo te explica que el inicio es fijo (cada semana en el día elegido, o el mes calendario).
- **Botón de sincronización SMS** (⟳, esquina superior derecha) — lee tus SMS bancarios e importa transacciones automáticamente. Ver [sección 4](#4-sincronización-automática-por-sms-android). Solo aparece si la lectura de SMS está activada en Ajustes.
- **Guía y primeros pasos** — lo que te falta configurar (cada pendiente tiene **«Hacer»** y **«No me interesa»**) y el **«Centro de ayuda»** con todos los tutoriales. Entre los pendientes puede aparecer **«Configurar corte y pago de tus tarjetas»** (ver [sección 7](#7-mis-cuentas-y-visacuotas)).
- **CFO Intelligence (briefing)** — resumen diario de tu situación: porcentaje de presupuesto usado, dinero restante, gastos fijos pendientes y una frase motivacional. Con API Key de Gemini el briefing es generado por IA con tus datos reales.
- **Score Financiero (0–100)** — tu termómetro de disciplina, calculado **con lo que registras en tu período actual** (no con el mes calendario ni con tu ingreso declarado). Empieza en 50 y se ajusta con cuatro factores. Toca el ícono de información (ⓘ) para ver cada uno con sus puntos:

  | Factor | Suma o resta |
  |--------|--------------|
  | **Tasa de ahorro** (ingreso del período menos gasto del período) | 20 % o más: **+20** · 10 % o más: **+10** · de 0 a menos de 10 %: 0 · gastaste más de lo que ingresó: **−15** |
  | **Presupuesto del período** | Gastaste igual o menos que el presupuesto del período: **+15** · más: **−10** |
  | **Gastos fijos** | Todos pagados: **+10** · si no, 0 |
  | **Cuentas activas** | Tienes al menos una cuenta activa: **+5** |

  80+ Excelente · 60+ Bueno · 40+ Regular · menos de 40 Crítico. **Si tu ingreso del período todavía no está registrado** (por ejemplo, el primer día del período, antes de que llegue tu sueldo), el ahorro queda **«pendiente»**: no suma ni resta, y el Inicio lo dice («Tu ingreso de este período aún no aparece: el ahorro todavía no suma»). Cuando registras o la app reconoce el ingreso, el ahorro se calcula. Las transferencias entre tus cuentas y los movimientos en otras monedas no cuentan.
- **Patrimonio Total** — con cuentas que llevan saldo, es la suma de esas cuentas de activos (efectivo, bancos, ahorro, inversión); las cuentas «Sin seguimiento» y las tarjetas de crédito no suman, y los ahorros externos tampoco. Los quetzales van arriba y los dólares (u otras monedas) debajo, sin convertirse. Si ninguna cuenta lleva saldo, es un estimado: tus ahorros externos más tus ingresos menos tus gastos registrados en quetzales (en dólares solo cuentan tus ahorros externos en dólares). Lo que todavía debes en visacuotas se muestra aparte como «Compromisos de crédito (aparte)», no se resta. Toca el ícono ⓘ para ver la explicación.
- **Balance por moneda** — ingresos, gastos y neto del período en Q (y en USD si tienes movimientos en dólares).
- **Comparativa con el período anterior** — cuánto más (rojo) o menos (verde) llevas gastado respecto al período pasado.
- **Presupuesto del período (anillo)** — porcentaje del presupuesto **del período** ya consumido («% USADO», «de Q …»). Tu presupuesto mensual de Ajustes se reparte según tu ciclo: con ciclo **mensual** o **irregular** el anillo mide el presupuesto completo; con **quincenal** la mitad; con **semanal** 12/52 del mensual. Cambia a amarillo al superar el 80 % y a rojo al excederlo.
- **Semáforo de capacidad de pago** — aparece debajo del anillo si tienes una tarjeta con día de corte y de pago y algo por pagar. Muestra, para la tarjeta con el pago más próximo, qué parte de lo que tendrás para pagarla ya está comprometida («Capacidad de pago: 62% comprometido»): **verde** («Te alcanza») por debajo del 70 %, **ámbar** («Ojo con este pago») desde el 70 %, **rojo** («Casi al límite») desde el 90 % y «No alcanza» al llegar al 100 %. Tócalo para ver el detalle: lo que tendrás (los saldos de tus cuentas más los ingresos que esperas antes de la fecha de pago, o, si ninguna cuenta lleva saldo, la parte de tu ingreso declarado que toca a un período —el ingreso mensual completo si cobras mensual, la mitad si cobras quincenal y 12/52 si cobras semanal— menos lo que ya gastaste en ese período; el detalle dice cuál se usó), lo que debes hasta esa fecha (estado de la tarjeta, gastos fijos por pagar y otras deudas) y cuánto te queda libre o te falta.
- **Widgets**: Mis Cuentas (patrimonio, deuda, cuotas del mes), Gastos Fijos (pagados/pendientes, vencidos), Metas de Ahorro (avance).
- **Gráfica de gastos de los últimos 6 meses** (meses calendario) y **transacciones recientes**.

Desliza hacia abajo (*pull to refresh*) para recargar todos los datos.

> El anillo, el score, los avisos de presupuesto, el resumen diario y el widget usan **la misma cifra de gasto del período**: solo cuentan gastos en quetzales, y los movimientos emparejados como transferencia (por ejemplo, el pago de tu tarjeta) nunca suman.

### Barra inferior de navegación

| Ícono | Pestaña | Función |
|-------|---------|---------|
| 🏠 | Inicio | Dashboard |
| ☰ | Movimientos | Historial de transacciones |
| 👛 | Presupuesto | Gastos fijos, categorías, metas e ingresos |
| ➕ (botón cobre central) | Agregar | Nueva transacción |
| 📊 | Estadísticas | Análisis y gráficas |
| ✦ | Asesor | Chat con tu CFO IA |
| ⚙️ | Ajustes | Configuración |

---

## 3. Registrar gastos e ingresos

Toca el **botón ➕** de la barra inferior (pantalla «Nueva Transacción»).

1. **Tipo** — elige *Gasto* (rojo) o *Ingreso* (verde).
2. **Moneda** — Q, USD, EUR o £. La app lleva balances separados por moneda.
3. **Monto** — obligatorio y mayor a 0.
4. **Descripción** (opcional) — por ejemplo «Almuerzo», «Uber», «Salario».
5. **Categoría** — 22 categorías de gasto (Comida, Restaurantes, Supermercado, Combustible, Streaming…) o 9 de ingreso (Salario, Freelance…), más las personalizadas. Si ninguna te sirve, toca **+ Nueva categoría** (la última casilla de la lista) y la creas ahí mismo: queda elegida para ese movimiento. Las propias se editan tocándolas en Ajustes → Mis Categorías.
6. Toca el botón de guardar (dice, por ejemplo, **«Guardar Gasto en Q»**).

Al guardar un gasto, la app NO te manda un aviso por cada uno: lo suma a tu **resumen del día** y solo te avisa si cruzas un umbral de tu presupuesto del período o de una categoría, o si es un cargo de tarjeta que complica tu pago (ver [sección 12](#12-notificaciones-y-alertas)).

### Pegar un SMS bancario

Arriba a la derecha, junto al «?», está el botón **«Pegar SMS»**. Está siempre visible: en iPhone, en la versión web y en Android aunque la lectura de SMS esté apagada en Ajustes, porque pegar un texto no pide permiso ni lee tu bandeja de mensajes. Tócalo, pega el texto del mensaje de tu banco y presiona **«Analizar SMS»**. La app detecta automáticamente el monto, la moneda, el tipo (gasto/ingreso) y el banco, y te deja el formulario listo para guardar. Si el mensaje es un pago de tarjeta o una compra en cuotas, te lo explica en un aviso (el pago de tarjeta es un movimiento neutro; la compra en cuotas se registra desde Cuentas → Visacuotas). Si el texto no es un movimiento bancario, te dice «No se registró» y por qué.

---

## 4. Sincronización automática por SMS (Android)

> ⚠️ Esta función **solo existe en Android** y requiere el permiso de lectura de SMS.

Toca el botón **⟳** del Dashboard. La app:

1. Lee tus SMS recibidos desde tu última sincronización (con 2 días de margen), hasta 1,000 mensajes y sin ir más atrás de unos 3 meses. La primera vez lee los últimos 3 meses. Para releer los 3 meses completos (hasta 5,000 mensajes), mantén presionado ⟳ o usa **Ajustes → «Sincronizar todo (3 meses)»**.
2. Filtra **solo los mensajes con palabras bancarias** (compra, débito, abono, retiro, transferencia, etc.). Nunca procesa mensajes personales. Omite promociones, códigos de seguridad y transacciones rechazadas.
3. Detecta monto, moneda, tipo, banco (BAC, BANRURAL, GTC, BANTRAB, PROMERICA…) y categoría (por ejemplo «SHELL» → Combustible, «WALMART» → Supermercado, «NETFLIX» → Streaming).
4. Genera una descripción limpia (por ejemplo «BAC · Compra en Walmart»).
5. **Ignora duplicados** (cada SMS genera un identificador único) y **transferencias entre tus propias cuentas**.

Al final te muestra un resumen: SMS revisados, mensajes bancarios, ya registrados, compras a cuotas, pagos de tarjeta y transferencias neutras, mensajes sin clasificar, y más. Si lo necesitas, **Deshacer** revierte esa sincronización. Si la sincronización juntó un SMS nuevo con un movimiento anterior como transferencia neutra, Deshacer deja ese movimiento anterior como estaba (gasto o ingreso normal) y no una transferencia sin pareja; si vinculó un depósito a tu fuente de ingreso, también devuelve el inicio del período y lo aprendido de ese origen a como estaban.

Con **Ajustes → «Sincronizar al abrir la app»** activado, la sincronización corre sola al abrir la app (como máximo cada 15 minutos) y solo lee los mensajes nuevos (nunca pide permisos por su cuenta). Si hay algo dudoso, el Inicio muestra un aviso con **«Ver»** o **«Revisar»**.

Las transacciones importadas llevan la etiqueta **SMS** y guardan el mensaje original: puedes verlo tocando la transacción en Movimientos → «Ver SMS original».

**La app aprende de tus correcciones.** En los gastos recuerda el comercio. En los **ingresos por SMS recuerda el origen del depósito** (banco, cuenta y quién lo envía, por ejemplo «SECCION DE OPERACIONES DE DEPOSITOS»): si cambias la categoría de un depósito y dejas activo **«Recordar para los depósitos de…»**, los próximos depósitos del mismo origen llegan ya clasificados. Si el SMS no dice de dónde viene el dinero, no se puede recordar.

**Tus fuentes de ingreso.** Si creaste una fuente de ingreso con un SMS de ejemplo (ver [6.4](#64-ingresos)), un depósito que se le parece se vincula solo. Cuando la app no está segura, el **Centro de revisión** (aviso «Revisar» del Inicio, o Ajustes → «Revisar pendientes») te muestra la fila **«¿Es tu Sueldo?»** (lleva el nombre de tu fuente): confirmas con **«Sí, es mi pago»** o la descartas con **«No»** (un «No» no vuelve a preguntarse).

El Centro de revisión agrupa, cuando aplica: «Movimientos dudosos», «Posibles duplicados», «Gastos fijos por confirmar», «Transferencias entre tus cuentas», «¿A qué cuenta fue?», «¿Es tu Sueldo?», «¿Es el pago de tu tarjeta?», «Compras sin cuenta» y «Sin clasificar».

En **Ajustes → Sincronización de SMS** también encuentras «Revisar pendientes», «Deshacer última sincronización», «Comercios aprendidos», «Mensajes sin clasificar» y «Compartir muestra de mis SMS».

---

## 5. Movimientos

Historial completo de transacciones, con:

- **Búsqueda** por descripción, banco o categoría.
- **Filtros** por tipo (Todos / Gastos / Ingresos) y por moneda (si tienes USD o EUR).
- Cada tarjeta muestra descripción, fecha, banco, insignias (SMS, moneda) y monto (verde = ingreso, rojo = gasto).

**Toca una transacción** para abrir el detalle, donde puedes:
- Editar la **descripción**, la **moneda** y la **categoría**. En SMS de gastos puedes activar **«Recordar»** para ese comercio; en SMS de ingresos, **«Recordar para los depósitos de…»** guarda el origen del depósito (banco, cuenta y quién lo envía). La opción **«Aplicar también a N movimientos anteriores de este comercio»** (o «depósitos anteriores de este origen») corrige también los movimientos parecidos que no editaste a mano.
- Ver el **SMS original** (si vino de un SMS).
- Si fue una compra en cuotas, **«Convertir a Visacuota»**.
- En un **ingreso**, **«Vincular a fuente de ingreso»** lo asigna a una de tus fuentes (toma su categoría y, si la fuente mueve tu período, el período empieza ese día); **«Quitar vínculo con la fuente»** lo suelta (la categoría se queda).
- **Eliminarla** (pide confirmación; no se puede deshacer).

También puedes eliminar rápido con el ícono 🗑 de cada tarjeta.

---

## 6. Presupuesto

La pestaña Presupuesto tiene **cuatro secciones**: Gastos Fijos, Categorías, Metas e Ingresos.

> **Presupuesto mensual, medido por período.** Tu presupuesto general (Ajustes → «Presupuesto Mensual») y los límites por categoría **se escriben siempre como montos mensuales**. La app mide tu gasto de **un período** (un mes, una quincena o una semana), así que reparte el monto mensual: con ciclo mensual o irregular, el período completo; con quincenal, la mitad; con semanal, 12/52 (52 semanas al año entre 12 meses). Un usuario mensual no ve ningún cambio.

### 6.1 Gastos Fijos

Tus compromisos recurrentes: renta, internet, seguros, cuota del gym…

- **Agregar**: botón ➕ flotante → nombre, monto, moneda (Q/USD), día del mes en que vence (1–31), categoría y notas.
- **Registrar automáticamente (AUTO)**: si está activado, al marcar el gasto como pagado ✓ se crea la transacción de gasto automáticamente. Activado por defecto.
- **Marcar como pagado**: toca la casilla a la izquierda; la app te pregunta en qué fecha se pagó. Se tacha y suma al progreso del período.
- **Editar**: mantén presionada la tarjeta. **Eliminar**: ícono 🗑.
- Si pasa el día de vencimiento sin pagar, aparece la insignia roja **VENCIDO**.
- El resumen superior muestra pagados/total, monto cubierto, pendiente y días hasta tu próximo pago (con ingresos irregulares no hay fecha de cobro y en su lugar aparece «—»).
- **Deuda programada**: debajo de tus gastos fijos lista las tarjetas (lo que falta de su estado) y los préstamos que vencen en el período, y se suma a lo «Comprometido este período» junto con tus gastos fijos pendientes, sin contar dos veces lo que ya tengas como gasto fijo.

> 🔄 **Al empezar un nuevo período de gastos fijos, las casillas se desmarcan automáticamente** (con ciclo mensual, el período va de pago a pago; con quincenal, semanal o irregular, los gastos fijos se cuentan por mes) para que empieces de nuevo.

### 6.2 Categorías (presupuesto por categoría)

Asigna un límite **mensual** en Q a cada categoría (por ejemplo Comida Q1,500):

- Toca una categoría de la lista «Agregar presupuesto», escribe el límite y confirma ✓. Para quitarlo, usa la papelera de su tarjeta.
- Cada categoría con presupuesto muestra su barra de avance contra el límite **del período**: color normal → **amarillo al 80 %** → **rojo si te excedes** (con el monto de exceso exacto). Si cobras por quincena o por semana, la tarjeta muestra «Q{x} por quincena (Q{y} al mes)» o «Q{x} por semana (Q{y} al mes)».
- Al registrar un gasto que lleva una categoría al 80 % o 100 % de su límite del período, recibes una notificación (una vez por umbral y período).
- El resumen superior compara lo **PLANIFICADO** (suma de los límites repartidos al período) contra lo **GASTADO** del período, y muestra **DISPONIBLE** o **EXCESO**.
- Toca una categoría para ver los movimientos del período. Los gastos en otras monedas se muestran aparte (no se convierten ni cuentan en el límite). Más abajo, **«Gastos sin presupuesto»** lista las categorías con gasto que todavía no tienen límite.

### 6.3 Metas de Ahorro

Objetivos con nombre, monto, fecha límite, color e ícono (por ejemplo «Laptop — Q8,000 — diciembre»):

- **Crear**: botón ➕ → nombre, monto objetivo, cuánto ya tienes ahorrado, moneda, fecha límite (formato AAAA-MM-DD; si no eliges una fecha se usan 6 meses desde hoy), color e ícono.
- **Abonar**: botón «Abonar» en la tarjeta de la meta → ingresa el monto. Al alcanzar el objetivo la meta pasa a **Completadas** 🏆.
- Cada meta muestra: % completado, restante, días de plazo y **cuánto necesitas ahorrar por mes** para llegar a tiempo.

### 6.4 Ingresos

De dónde y cuándo te pagan: sueldo, quincena, ventas semanales, aguinaldo, bono 14… Cada una es una **fuente de ingreso**. Con ellas la app reconoce tu pago cuando llega, sabe si ya llegó o se atrasó y puede mover el inicio de tu período al día real en que te pagan (solo en ciclo mensual o quincenal).

- **Resumen**: arriba ves el **«Ingreso base del período»** (lo que de verdad te pagan tus fuentes base en un mes; los extras no cuentan). Si ese ingreso real difiere en más de 5 % del que declaraste, aparece un aviso «Tu ingreso real es Q X, ¿actualizar el declarado?» con el botón **«Actualizar»**.
- **Lista**: cada fuente muestra su ciclo y su estado: **Esperado** (aún no llega), **Recibido** (ya llegó y la app lo reconoció) o **Atrasado** (pasó la tolerancia de días sin que llegara). Toca una fuente para editarla o eliminarla.
- **Tu primera fuente**: al terminar la configuración inicial la app ya crea una con tu ingreso, tu ciclo y tus días de pago (y el patrón del SMS si lo enseñaste). Se llama «Sueldo» (mensual), «Quincena», «Pago semanal» o «Mis ingresos» (irregular). Tócala para revisarla o completarle el SMS de ejemplo. Una fuente semanal guarda cuánto te pagan **por semana** (tu ingreso mensual ×12/52) y una quincenal, la mitad.
- **Crear una fuente**: botón ➕ flotante.
  - **Nombre**, **categoría de ingreso** (con **+ Nueva categoría**), **monto**, **moneda** (Q/USD).
  - **Cada cuánto**: Mensual (1 día), Quincenal (2 días), Semanal (día de la semana) o Irregular (sin día).
  - **Si cae en fin de semana o feriado**: «La global» (la de Ajustes) o una regla propia de esa fuente.
  - **Cuenta donde te pagan** y **tipo**: **Base** (tu ingreso regular) o **Extra** (llega solo en ciertos meses: *Bono 14 → julio*, *Aguinaldo → diciembre* o los meses que marques).
  - **Mueve mi período cuando llega** (solo base mensual o quincenal): el período empieza el día que de verdad te pagan, dentro de la tolerancia.
  - **SMS de ejemplo**: pega el SMS que te mandó el banco cuando te pagaron, o (en Android, con SMS activo) toca **«Elegir de mis SMS»**. La app muestra «Entendimos: banco · cuenta · de quién · monto aproximado» y tú tocas **«Sí, es así»** o **«Corregir»** (quién envía y monto). No se guarda ningún número de cuenta. Sin SMS de ejemplo la fuente se guarda igual, pero no detecta tu pago sola: vinculas cada depósito a mano desde su detalle en Movimientos.
- El tutorial **«Tu sueldo»** recorre el proceso en orden: la cuenta, la fuente, el SMS de ejemplo, confirmar y esperar el pago.

---

## 7. Mis Cuentas y Visacuotas

Se abre desde el widget **Mis Cuentas** del Dashboard.

### Cuentas

Registra dónde está tu dinero real:

| Tipo | Uso |
|------|-----|
| 💵 Efectivo | Dinero físico |
| 🏦 Banco | Cuenta monetaria o de ahorro |
| 💳 Tarjeta Crédito | Su deuda se ve en el **«Estado al corte»** y el **«Ciclo abierto»** (la tarjeta normalmente no lleva saldo) |
| 📈 Inversión | Acciones, cripto, fondos |
| 💰 Ahorro | Cuenta de ahorro separada |

- **Crear**: botón ➕ → tipo, nombre, banco (opcional), moneda (Q/USD), **cómo llevar el saldo** (ver «Saldo opcional» abajo), color y notas. Las tarjetas de crédito piden además el **día de corte** y el **día de pago** (opcionales, pero recomendados).
- **Día de corte de la tarjeta** = la fecha de **«Saldo al corte»** de tu estado de cuenta. Ese día todavía entra en el estado y el **ciclo nuevo empieza al día siguiente** (corte el 9 → el ciclo nuevo arranca el 10 a las 00:00). El pago cae en la primera aparición del día de pago después del corte (corte el 9 y pago el 2 → se paga el 2 del mes siguiente).
- **Tarjeta sin corte ni pago.** Sin esos días no hay fecha de pago, recordatorios, capacidad de pago ni ciclo para las cuotas. Por eso, la tarjeta que no los tiene muestra una insignia **«Sin corte ni pago · Configurar»** (o «Sin día de pago · Configurar» / «Sin día de corte · Configurar» si falta solo uno); al tocarla se abre su edición. Además:
  - en el Inicio, la guía muestra el pendiente **«Configurar corte y pago de tus tarjetas»** (con **«Hacer»**, que abre la primera tarjeta que lo necesita);
  - la app te manda **un solo aviso** («💳 Configura el corte y pago de tu tarjeta») unos 30 minutos después de abrirla, y no se repite (si hay varias configuraciones pendientes, se juntan en un aviso «Completa tu configuración»);
  - el tutorial «Registrar una compra con tarjeta» o «Pagar la tarjeta» te lo dice en el paso que lo necesita y ofrece **«Crearlo ahora»**.
- En cada tarjeta ves el **«Ciclo abierto»**: lo que llevas gastado desde el último corte, **separado por moneda** («Q 9,276.01 · $39.67»): las compras en dólares se pagan en dólares, no se mezclan. Las transferencias nunca suman.
- El «Ciclo abierto» se ve **también sin SMS**: la tarjeta funciona con gastos anotados a mano (en el detalle del movimiento eliges la tarjeta en «Cuenta»). Lo que depende de los SMS se oculta si apagas la lectura de SMS.
- **Cuenta con la que pagas**: al crear o editar la tarjeta puedes elegir de qué cuenta sale el dinero cuando la pagas (por ejemplo: te pagan en un banco, transfieres a tu cuenta de BAC y pagas la tarjeta desde ahí).
- **Editar**: mantén presionada la tarjeta (o toca el lápiz). **Eliminar**: ícono 🗑 (las visacuotas asociadas se desactivan).
- El resumen superior muestra **Activos, Visacuotas pendientes y Neto**: solo suman las cuentas que **llevan saldo** (las tarjetas de crédito no suman al patrimonio; su deuda se muestra aparte). Si ninguna cuenta lleva saldo, la app lo avisa y el patrimonio del Inicio es un estimado con tus ingresos y gastos.

### Estado de cuenta y pago de la tarjeta

En el detalle de cada tarjeta con corte y pago ves el bloque **«Estado al {corte}»**:

- **Cuánto debes**, en quetzales y en dólares **por separado** (cada saldo se paga por su cuenta), con la etiqueta **«Estimado»** (la suma de los cargos de la tarjeta en ese ciclo, cuotas de visacuotas incluidas) o **«Del estado de cuenta»** (el monto real que escribiste).
- **«Paga antes del {fecha}»** (el día de pago después del corte) y el estado: **Pendiente**, **Pago parcial**, **Pagado** o **Vencido** («Venció el {fecha}»).
- **Ciclo abierto**: lo que llevas gastado desde el último corte.
- **«Ingresar monto real»**: el banco (BAC) no manda el total de la tarjeta por SMS (el estado llega por correo), así que ahí escribes lo que dice tu estado de cuenta, un campo por moneda. Si lo dejas vacío se usa el estimado.
- **«Registrar pago»**: precarga lo que falta por moneda; puedes pagar solo una parte, elegir la fecha y la cuenta de origen. Lo que falta sigue pendiente.
- **Pagar la tarjeta es una transferencia entre tus cuentas, no un gasto nuevo**: no suma a tus gastos del período ni se cuenta dos veces (cada compra ya contó cuando la hiciste con la tarjeta).
- **Con SMS (Android)**: si el banco manda el SMS del pago, la app lo asigna al estado cerrado más reciente que aún deba esa moneda y, si hay una salida de tu cuenta pagadora con el mismo monto (±0.01) dentro de 36 horas, las junta en una sola transferencia neutra. Si solo hay una salida que se parece a lo que falta (±1 %) entre el corte y el vencimiento + 5 días, el Centro de revisión te pregunta **«¿Es el pago de tu tarjeta?»**. **Deshacer** una sincronización revierte esos emparejamientos.
- Dos tutoriales lo cuentan en orden (también en la guía del Inicio): **«Registrar una compra con tarjeta»** y **«Pagar la tarjeta»**.

### Saldo opcional

El saldo es **opcional**: sin saldos, la app es solo un registrador de tus gastos e ingresos. Al crear o editar una cuenta, en **«Saldo»** eliges cómo llevarlo:

| Modo | Qué hace |
|------|----------|
| **Sin seguimiento** | La cuenta solo organiza tus movimientos. No lleva saldo y no suma al patrimonio. Es lo normal en las tarjetas. |
| **Manual** | Tú escribes el saldo. Solo cambia cuando lo editas o cuando haces una transferencia o un pago de tarjeta en la app. |
| **Automático** | La app suma y resta sola cada ingreso, gasto, transferencia y pago de la cuenta, a partir del **saldo de partida** y su fecha. En la lista aparece con la etiqueta «Automático». |

- **Saldo de partida** (modo Automático): lo que tiene la cuenta en la fecha que elijas. Si lo dejas vacío, la app usa el saldo actual de la cuenta con la fecha de hoy. Los movimientos anteriores a esa fecha no cuentan: ya están dentro del saldo.
- **Ajustar al saldo real**: si el saldo de la app no coincide con tu banco, toca el botón en la cuenta (también está al editarla), escribe el saldo que ves en tu banco y la app sigue desde ahí.
- **Según tu banco (SMS)** (Android): si tus SMS traen el saldo y no coincide con el que calcula la app, al editar la cuenta ves esa línea con el botón **«Usar este saldo»**. Con **«Ajustar sola con el saldo de mis SMS»** la app lo hace en cada sincronización, y **Deshacer** la sincronización lo devuelve.
- Ejemplo: te cae el sueldo en Banrural, transfieres a BAC y pagas la tarjeta desde BAC. Banrural sube con el sueldo y baja con la transferencia; BAC sube con la transferencia y baja con el pago; la tarjeta no lleva saldo. Ni la transferencia ni el pago de la tarjeta son gasto: solo cuentan las compras hechas con la tarjeta.
- Un tutorial lo cuenta en orden: **«Llevar el saldo de tus cuentas»** (en la guía del Inicio como «Saldos y transferencias»).

### Transferencias entre cuentas

Botón **«Transferir»** («Transferir entre mis cuentas»; necesitas al menos 2 cuentas activas que no sean tarjeta): elige origen, destino, monto y fecha. Queda registrado como movimiento tipo *transferencia* — **no cuenta como gasto ni ingreso**.

- No te pide saldo suficiente: el saldo es opcional. Si las cuentas llevan saldo, se mueve entre ellas (en la de saldo manual se ajusta el número; en la automática se calcula sola); si no lo llevan, solo queda el registro.
- **Otra moneda** (Q↔USD): la app sugiere cuánto recibe la cuenta de destino con el tipo de cambio de Ajustes y lo puedes corregir con lo que realmente recibió. No hay conversión confiable entre USD y EUR/£ (se toman 1:1).
- **Si el destino es una tarjeta**, el botón te lleva a **«Registrar pago»** de esa tarjeta (con la cuenta de origen ya elegida): pagar la tarjeta no es un gasto nuevo y baja el saldo de la cuenta con la que pagas si lo lleva.
- **Antes o después del SMS (Android)**: la app reconoce las transferencias entre tus cuentas por pares de SMS (la salida y la entrada). Si registras la transferencia a mano y el SMS del banco **ya llegó** (mismo monto, hasta 36 horas), se une a él en vez de duplicarse (puedes elegir «No unir»). Si el SMS llega **después**, el Centro de revisión te ofrece **«Unirlas»**: se queda la tuya y se descarta el SMS repetido.
- Si falta uno de los dos SMS, el Centro de revisión te pregunta **«¿A qué cuenta fue?»** (o de cuál vino) con tus cuentas como opciones, o **«A otra persona» / «Ingreso externo»** si no es tuya. Solo pregunta si tienes al menos dos cuentas que no sean tarjeta.
- Si borras una transferencia hecha a mano, las cuentas de saldo manual recuperan lo que se les había movido.

### Visacuotas (compras en cuotas)

Para compras financiadas con tarjeta (por ejemplo «Laptop — Q6,000 en 12 cuotas de Q500») y para préstamos:

- **Crear**: pestaña Visacuotas → ➕ → tarjeta asociada, nombre de la compra, monto total, cuota mensual (el número de cuotas se calcula solo), cuotas ya pagadas, fecha de inicio y categoría. La moneda de la visacuota es la de la tarjeta elegida (para una visacuota en dólares, usa una tarjeta en USD).
- Si registras la visacuota con cuotas ya pagadas, la app solo carga las siguientes (no genera cargos del pasado).
- También puedes elegir **«Sin tarjeta (préstamo)»** con su **día de pago**. La app también las detecta sola desde el SMS de «compra a cuotas» del banco (Android).
- **Cada cuota se carga como gasto en el corte en que entra, no la compra completa**: en cada corte de la tarjeta la app registra UNA cuota (fechada el día del corte, con la categoría de la visacuota) y tu período solo suma esa cuota. La primera cuota entra en el primer corte desde la fecha de la compra. Si la app estuvo cerrada varios cortes, al abrirla pone al día todas las cuotas de una vez, sin duplicar ninguna.
- Si ya tenías ese cargo por SMS, se marca como la cuota en vez de contarse dos veces. En un préstamo sin tarjeta, un SMS de gasto de cualquier cuenta con el mismo monto (±0.01) y fecha a menos de 3 días del día de pago también se toma como la cuota. Si borras una cuota de Movimientos, no se vuelve a crear.
- Cada visacuota muestra la **«Próxima cuota»** (el corte en que entra), las cuotas cargadas y las restantes. Al cargarse la última, la visacuota **termina sola**. Si al actualizar la app ya habían pasado todos los cortes de una visacuota que tenías, queda terminada en lugar de seguir activa para siempre.
- **Las deudas que registraste al configurar la app** empiezan en su **próximo día de pago**: nunca cargan una cuota el mismo día de la configuración ni de golpe al actualizar la app. Si venías de la versión anterior y habías declarado una deuda de tipo tarjeta de crédito, esa deuda deja de cargar un gasto cada mes (queda inactiva, con sus cargos anteriores intactos).
- **Eliminar** una visacuota conserva los cargos que ya hizo (fueron gastos reales). **Deshacer** una sincronización de SMS sí borra los cargos de las visacuotas que deshace.
- El Dashboard te avisa cuánto debes este mes en visacuotas.
- El tutorial **«Cómo funcionan las visacuotas»** (también en la guía del Inicio como «Visacuotas») lo cuenta en orden: la tarjeta con su corte, la compra en cuotas, el cargo de cada corte y la última cuota.

---

## 8. Estadísticas

Análisis completo con filtros: **Per. Actual · Per. Anterior · Este Año · Todo**. «Período actual» sigue tu ciclo de pago.

- **Gráfica de pastel por categoría** — toca una porción (o la leyenda) para ver su detalle. El centro muestra el total.
- **Tasa de ahorro** — (ingresos − gastos) / ingresos. Meta recomendada: ≥ 20 %.
- **Flujo de caja proyectado** — a tu ritmo diario actual, cuánto gastarás al final del período y si te sobrará o faltará.
- **Comparativa de 6 meses** — barras de gastos e ingresos mes a mes, con la diferencia vs. el período anterior.
- **Ahorro acumulado** y **proyección a 6 y 12 meses** según tu ritmo de ahorro (se basa en tus movimientos registrados, no en el saldo de tus cuentas).
- **Gasto promedio diario** vs. tu **presupuesto diario ideal**: el presupuesto **del período** (tu mensual de Ajustes ya repartido si cobras por quincena o semana) dividido entre los días del período.
- **Días sin gastar** del período.
- **Gasto por banco/tarjeta** (aparece cuando tus gastos tienen banco, por ejemplo los importados por SMS).
- **Ratio deuda / ingreso** — compara lo que pagas **cada mes en cuotas de visacuotas y préstamos activos** con tu ingreso mensual: el de tus fuentes de ingreso o, si no tienes ninguna, el que declaraste («de tus fuentes» o «declarado»). **No incluye el consumo de tarjeta** que pagas completo cada mes. Verde por debajo del 20 %, amarillo de 20 % a 40 % (ambos incluidos), rojo por encima del 40 %. El ratio se redondea a un decimal antes de colorearlo: exactamente 20.0 % y 40.0 % son «moderado». Si agregas una visacuota o préstamo, aparece; si termina o la eliminas, baja. La tarjeta solo aparece si tienes cuotas activas (o deuda declarada). No depende del filtro de período.
  - **Deuda declarada al configurar la app (instalaciones con el onboarding viejo).** Antes, el onboarding guardaba un solo monto de deuda mensual que no se actualizaba. Si tu instalación viene de esa versión y no tienes cuotas creadas por la configuración nueva, ese monto sigue sumando y la app lo avisa («Incluye Q… que declaraste al configurar la app; no se actualiza solo»). Si ya no la tienes, toca **«Ya no la tengo»** y confirma: se quita del ratio, sin borrar ninguna visacuota ni préstamo.
  - **Tarjeta de crédito declarada al configurar la app.** Si en el paso de deudas declaraste una deuda tipo **Tarjeta**, no se convierte en cuota (sus compras ya cuentan como gasto); sigue sumando al ratio como deuda «declarada», una sola vez, junto con tus préstamos y visacuotas, hasta que toques **«Ya no la tengo»**.
- **Velocidad de gasto** — lo gastado en este período frente a todo el período anterior (solo con el filtro Período Actual).

---

## 9. Asesor IA

Toca **✦ Asesor** en la barra inferior. Es un chat con tu "CFO personal" que conoce **todos tus datos**: período actual, gastos por categoría, historial de 3 meses, cuentas, gastos fijos, visacuotas, presupuestos y metas. Para cuotas de deuda solo cuentan las **visacuotas y préstamos activos y con cuotas por cargar**: una cuota pausada o terminada (por ejemplo, la de una tarjeta eliminada) no se suma a «Cuotas mensuales» ni al ratio.

**Preguntas útiles:**
- «¿Cómo voy este mes?»
- «¿En qué gasté más?»
- «¿Puedo comprarme un celular de Q3,000?»
- «Hazme un plan de ahorro para Q15,000 en 6 meses»
- «¿Cuánto pago en suscripciones?»

**Dos modos** (el encabezado del chat dice cuál estás usando):

| Modo | Requisito | Qué hace |
|------|-----------|----------|
| **Modo local** (sin configurar nada) | — | Respuestas con lógica local sobre tus datos reales: resumen, capacidad de compra, deudas, cuentas, metas. Entiende órdenes y consultas sin internet. |
| **Gemini** («Gemini activo», recomendado) | API Key gratuita de Google | Conversación natural con memoria del chat, análisis profundos y consejos personalizados. |

**Para activar Gemini:** entra a [aistudio.google.com](https://aistudio.google.com) → *Get API Key* → copia la clave → pégala en **Ajustes → Inteligencia Artificial (Gemini)** → Guardar Cambios. El encabezado del chat cambia a «Gemini activo».

El botón ⟳ del chat reinicia la conversación. Si no hay internet, el asesor responde en modo local automáticamente.

### Órdenes y consultas

Además de aconsejarte, el Asesor entiende **órdenes** y **consultas**. Funciona en modo local (sin internet ni clave); con Gemini además entiende frases más libres.

**Órdenes** (crean algo; siempre te piden confirmación):

| Quieres... | Escribe por ejemplo |
|-----------|---------------------|
| Crear una meta de ahorro | «Crea una meta de Q5,000 para una laptop en diciembre» |
| Fijar un límite por categoría | «Ponle un límite de Q800 a Restaurantes» |
| Agregar un gasto fijo | «Agrega Netflix de $15.99 el 5 de cada mes» |
| Registrar un gasto | «Gasté 85 en gasolina ayer» |
| Registrar un ingreso | «Me pagaron Q6,000 de sueldo» |

Si falta algún dato (monto, fecha, categoría...), el Asesor te lo pregunta con botones de respuesta rápida. Los límites por categoría se manejan siempre en quetzales y siempre son **mensuales**.

**Consultas** (solo muestran información, no cambian nada):

- «¿Cuánto gasté en Restaurantes este período?» — total por moneda; los dólares se muestran aparte, nunca se suman a los quetzales.
- «Muéstrame los movimientos de Spotify» — últimos movimientos, filtrables por comercio, categoría o fechas.
- «¿Qué gastos fijos me faltan por pagar?» — pendientes del período, con insignia **Vencido** si corresponde.
- «¿Cómo van mis presupuestos?» — avance de cada límite por categoría (contra el límite del período).
- «¿Cómo van mis metas?» — avance de tus metas de ahorro.

Puedes acotar el rango con frases como «este período», «período anterior», «ayer», «esta semana», «este mes», «mes pasado» o «últimos 30 días». Sin rango se usa tu período de presupuesto actual.

**Acciones guiadas:** debajo del chat están los botones **Crear meta**, **Presupuesto**, **Gasto fijo**, **Registrar gasto** y **Consultar**. Te piden los datos paso a paso. Se ocultan mientras el teclado está abierto.

**Confirmar, Editar, Cancelar y Deshacer:**
- Antes de guardar, el Asesor muestra una **tarjeta** con el resumen y los avisos (por ejemplo, un posible movimiento duplicado). Escribir «sí» no guarda nada: tienes que tocar **Confirmar**.
- **Editar** abre un formulario para corregir cualquier dato; **Cancelar** descarta la propuesta. También puedes corregir escribiendo, por ejemplo, «no, eran 600».
- Después de guardar aparece un aviso con **Deshacer**. Solo deshace si el registro sigue igual (si cambió después, por ejemplo al unirse con un SMS, ya no se puede).
- La conversación se conserva al cambiar de pestaña. Las tarjetas que quedaron sin confirmar se marcan como vencidas al volver.

---

## 10. Ajustes

Las secciones, de arriba hacia abajo:

- **Tu Perfil** — tu nombre.
- **Sincronización de SMS** — activar/desactivar la lectura de SMS (apagada, la app oculta la lectura de SMS —la sincronización y «Elegir de mis SMS»— y conserva lo ya importado; «Pegar SMS» en Agregar sigue disponible), «Sincronizar al abrir la app» y las herramientas de la [sección 4](#4-sincronización-automática-por-sms-android).
- **Presupuesto Mensual** — límite de gasto **al mes** en Q (obligatorio, > 0) y opcional en USD. Si cobras por quincena o por semana, la app lo reparte por período: debajo del monto ves **«Por período: Q{x} por quincena»** (o «por semana») y con ese monto se miden el anillo del Inicio, los avisos, el presupuesto diario, el score y el asesor. Con ciclo mensual o irregular no aparece esa línea (el período es el mes completo). El valor sugerido al configurar la app es el 80 % de tu ingreso mensual.
- **Ingresos y período** — muestra tu día de pago («Tu día de pago: el 27 de cada mes», «Cobras cada martes»…) y el período actual. **Mis fuentes de ingreso** te lleva a Presupuesto → Ingresos. En **Ciclo de pago** cambias el ciclo (Mensual, Quincenal, Semanal o Irregular) y el día o los dos días de pago; con **Semanal** eliges el **día de la semana** en que te pagan (chips Dom a Sáb) y ves «Tu semana va de martes a lunes». Si tu fuente de ingreso semanal dice otro día, aparece «Tu fuente «{nombre}» dice que cobras el {día}.» con el botón «Usar el {día}». Con **Irregular** ves «Con ingresos irregulares tu período es el mes calendario (del 1 al último día): no hay un día que elegir.» Se guarda con **«Guardar ciclo y día de pago»** (no con *Guardar Cambios*). Cambiar el día mueve tu período; lo que fijaste a mano en un período anterior se conserva. El botón **«Cuándo empieza mi período»** abre el mismo detalle que se abre al tocar el encabezado del Inicio:
  - **Inicio del período** — chips con las fechas cercanas a tu día de pago (±la tolerancia); nunca se ofrece una fecha futura. **Guardar** fija a mano el inicio; **Volver a automático** quita lo fijado a mano. *Lo que fijas a mano siempre gana*: la app no lo cambia sola.
  - **Reglas** — qué hacer si el día de pago cae en fin de semana o feriado (**Viernes antes**, **Lunes después** o **Día exacto**; por defecto «Viernes antes»), si cuentan los **feriados de Guatemala** (por defecto sí), la **tolerancia** (de 1 a 7 días de diferencia máxima con el día de pago; por defecto 3) y **Adelantar el período cuando llega el sueldo** (cuando la app reconoce por SMS el depósito de tu sueldo y cae antes o después de lo esperado, dentro de la tolerancia, el período empieza ese día; activado por defecto). Se guardan con **Guardar reglas**, no con *Guardar Cambios*.
  - Solo aplica a ciclos **mensual** y **quincenal**. Con ciclo **semanal** el período empieza siempre el día de la semana que elegiste, sin ajustes por feriados. Con ciclo **irregular** el período es el **mes calendario** y no hay nada que ajustar.
- **Moneda Principal** — Q, $, € o £.
- **Tipo de Cambio USD → Q** — se actualiza solo cada 6 horas desde el **Banco de Guatemala (Banguat)**, con respaldo del mercado internacional. Puedes forzar la actualización con ⟳ o escribirlo manualmente.
- **Ahorros Externos** — dinero guardado fuera de la app (Q y USD). Solo se usa en el Patrimonio Total cuando ninguna de tus cuentas lleva saldo; también se suma a la proyección de ahorro de Estadísticas (solo los quetzales).
- **Seguridad Biométrica** — ver [sección 11](#11-seguridad-biométrica). Solo aparece si tu teléfono tiene huella/rostro configurado.
- **Inteligencia Artificial (Gemini)** — tu API Key.
- **Notificaciones** — resume tus avisos («Resumen diario 8:00 pm · Recordatorios 8:00 am · Silencio 10 pm–7 am») y **Configurar notificaciones** abre el detalle (ver [sección 12](#12-notificaciones-y-alertas)). Se guarda con su propio botón **Guardar**, no con *Guardar Cambios*.
- **Mis Categorías** — crea categorías personalizadas: nombre, si aplica a gastos/ingresos/ambos, color e ícono. Aparecen junto a las predefinidas al registrar transacciones. También puedes crearlas al vuelo con **+ Nueva categoría**, y para cambiar el nombre, color, ícono o tipo de una propia, tócala en esta lista.
- **Academia BudgetMaster** — reiniciar los tutoriales («Reiniciar todos los tutoriales»).
- **Guardar Cambios** — 💾 **los cambios de perfil, presupuesto, moneda, tipo de cambio, ahorros, biometría y Gemini no se aplican hasta tocar este botón.** El interruptor de SMS, el ciclo de pago, las reglas del período y las notificaciones se guardan con sus propios botones.
- **⚠️ Zona de Peligro — Borrar Todos los Datos** — elimina TODO permanentemente (transacciones, cuentas, configuración) y vuelve al onboarding. También **reinicia tus tutoriales** (el recorrido inicial vuelve a arrancar solo al terminar la configuración) y **vacía el widget** de la pantalla de inicio (dice «Abre BudgetMaster…» hasta que vuelvas a configurar la app). Pide confirmación y **no se puede deshacer**.

---

## 11. Seguridad biométrica

Con **Ajustes → Seguridad Biométrica** activada, la app pide tu **huella digital o Face ID** al abrirse, y de nuevo al volver a ella si estuvo en segundo plano más de 30 segundos.

- Si el sensor falla, toca el ícono para reintentar, o usa el **PIN/patrón del teléfono** cuando el sistema lo ofrezca.
- Si tu equipo no tiene biometría configurada, la opción no aparece y la app abre directamente.

---

## 12. Notificaciones y alertas

La app envía notificaciones locales (acepta el permiso la primera vez). Están pensadas para ayudarte sin molestar: **ya no hay un aviso por cada gasto**, y todo se mide en tu **período de pago** (desde el día que cae tu sueldo), según lo que tienes registrado. Las cifras de presupuesto se miden contra el **presupuesto del período** (tu mensual repartido si cobras por quincena o por semana).

**Reglas generales**

- **Horas silenciosas:** por defecto de 22:00 a 07:00 no suena nada; lo que caiga en ese rato se mueve a la hora en que termina el silencio.
- **Tope por día:** por defecto máximo 4 avisos por día (si hay más, quedan los más importantes: primero los pagos).
- **Recordatorios de pagos:** por defecto a las 08:00.
- **Interruptor por tipo:** cada tipo de aviso se puede encender o apagar.

**Dónde se cambia todo esto:** en **Ajustes → Notificaciones → Configurar notificaciones**. Ahí encuentras un interruptor con su explicación por cada tipo de aviso (gastos fijos, pago de tarjeta, corte de tarjeta, última visacuota, deudas, llegó tu sueldo, capacidad de pago, fin de período, resumen diario, resumen semanal, alertas de presupuesto y recordatorio del Asesor IA), la **hora de los recordatorios** (6 am a 12 pm), el **resumen diario** (interruptor y hora), las **horas silenciosas** (desde y hasta) y el **máximo de avisos por día** (de 1 a 8). Se guardan con **Guardar** y la app reajusta enseguida lo que tiene programado. **Enviar aviso de prueba** te manda uno en unos segundos (aunque estés en horas silenciosas) y, si el permiso de notificaciones está denegado, te lo dice y te lleva a los ajustes del teléfono. El **resumen diario** reemplaza al aviso por cada gasto.

**Avisos programados** (la app los prepara para los próximos ~2 meses y los reajusta cada vez que cambian tus datos)

| Aviso | Cuándo |
|-------|--------|
| Gasto fijo próximo | 3 días antes de su vencimiento, a las 08:00. |
| Pago de tarjeta | 5 días antes, 1 día antes y el mismo día del vencimiento, con lo que falta pagar del estado de cuenta (estimado si no escribiste el real). Solo para tarjetas con día de pago. |
| Corte de tarjeta | El día antes del corte: lo que compres después entra al siguiente estado. Solo para tarjetas con día de corte. |
| Última visacuota | El día antes de que se cargue la última cuota. |
| Deuda por vencer | Préstamos con día de pago: 2 días antes y el mismo día. |
| Fin de período | El día antes de que cierre tu período, con cuánto llevas gastado frente a tu presupuesto del período. Aplica a ciclo mensual, quincenal e irregular (en irregular, el día antes de que acabe el mes). **No se programa con ciclo semanal**: ahí el resumen semanal cumple ese papel. |
| Resumen del día | Cada día a las 20:00: lo que registraste hoy y cuánto te queda del período. Se puede apagar. |
| Resumen semanal | Los domingos a las 20:00, o **el último día de tu semana si cobras semanal** (si te pagan los martes, el lunes; ese día reemplaza al resumen del día). |

**Avisos inmediatos**

| Aviso | Cuándo |
|-------|--------|
| Llegó tu sueldo | Cuando la app reconoce solo el depósito de tu sueldo: «comprometido X, libre Y» hasta tu próximo pago. |
| Capacidad de pago | Si el pago de una tarjeta ya compromete el 70 % (aviso), el 90 % (alerta) o el 100 % (no alcanza) de lo que tendrás: tus saldos más los ingresos que esperas **antes de la fecha de pago**. Se avisa al registrar un cargo de la tarjeta, al llegar el sueldo y 5 días antes del pago, una sola vez por nivel. Si ninguna cuenta lleva saldo, usa tu ingreso declarado repartido al período (mensual completo, la mitad en quincenal, 12/52 en semanal) y el aviso lo dice. En el Inicio, el **semáforo de capacidad de pago** (ver [sección 2](#2-pantalla-de-inicio-dashboard)) muestra lo mismo en cualquier momento. |
| ⚠️ Umbrales de presupuesto | Al llegar al 50 %, 80 % y 100 % del **presupuesto del período**, y al 80 % y 100 % del límite (del período) de una categoría: una vez por umbral y período, con el gasto diario que te queda. Los montos van con formato de dinero (Q 4,800.00). Al agotar el presupuesto, el aviso dice cuántos días quedan «hasta tu próximo ingreso»; si tus ingresos son **irregulares** no hay fecha de cobro y dice «días del período». |
| 🎯 / 🏆 Metas | Al pasar el 50 % y al completar una meta. |

**Aviso único de configuración.** Unos 30 minutos después de abrir la app, si te falta configurar algo, llega **un solo aviso** y no se repite: tu presupuesto, tus gastos fijos, límites por categoría, una meta de ahorro, **el corte y pago de tus tarjetas** o la clave de Gemini. Si solo falta una cosa, el aviso habla de ella (para las tarjetas: «💳 Configura el corte y pago de tu tarjeta»); si faltan varias, se juntan en «Completa tu configuración». Aparte, el **recordatorio del Asesor IA** es un empujón ocasional (cada unos 12 días) y se puede apagar.

Las alertas de umbral incluyen una frase de disciplina financiera (Hill, Kiyosaki, Ramsey, Buffett…). Con Gemini activo, el texto lo redacta la IA usando tus números reales del período.

---

## 13. Widget (Android)

Un **widget en la pantalla de inicio de tu teléfono** para ver cómo vas sin abrir la app. Es **solo para Android**: en iPhone y en la versión web no existe.

**Cómo agregarlo:** mantén presionado un espacio vacío de la pantalla de inicio → **Widgets** → **BudgetMaster** → elige el tamaño y arrástralo. Abre la app al menos una vez para que cargue tus cifras.

| Tamaño | Qué muestra |
|--------|-------------|
| Pequeño (2×2) | Lo **disponible del período** y los **días al cobro** (con ingresos irregulares no hay cobro: dice «N días en el período», hasta fin de mes). |
| Mediano (4×2) | Lo **disponible por día**, la **barra del presupuesto** gastado, el **próximo pago de tarjeta** (fecha y monto; «estimado» si todavía no escribes el estado de cuenta real), el **próximo gasto fijo**, el **semáforo de capacidad de pago** y los **saldos** de las cuentas que llevan seguimiento. |

- **El ojo (ocultar los montos):** por defecto los montos salen ocultos (••••). Toca el **ojo** para verlos y tócalo otra vez para ocultarlos de nuevo; vale para los dos widgets. Los días, el porcentaje del presupuesto, las fechas y el semáforo se ven siempre.
- **«+ gasto»:** abre BudgetMaster directo en la pestaña **Agregar**, también si la app ya estaba abierta o en segundo plano (cada toque te lleva a Agregar sin abrir otra copia de la app). Si tienes la seguridad biométrica activada, te la pide primero. Si todavía no terminaste la configuración inicial, el toque se ignora: termínala primero.
- Tocar cualquier otra parte del widget abre la app.
- Las cifras son las mismas del Inicio (período de pago real, presupuesto del período, sin traslados ni pagos de tarjeta). Se actualizan cuando abres la app o registras algo, y el sistema los repinta cada ~30 minutos. Si no abres la app, los **días al cobro** se recalculan solos con la fecha de hoy; pero el **disponible** es el de la última vez que abriste la app, así que cuando llega tu día de cobro (empieza otro período) el widget deja de mostrar cifras viejas y dice **«Abre la app para actualizar»** hasta que la abras.
- Si tus ingresos son **irregulares** no hay un «próximo pago» que contar: el widget muestra «N días en el período» (los que quedan del mes calendario) y reparte lo disponible entre esos días; nunca dice «Hoy cobras».
- Un tutorial lo cuenta: **Widget** en la guía del Inicio.

---

## 14. Academia (tutoriales)

Tutoriales interactivos con "spotlight" sobre la pantalla real. Están en la guía del Inicio (**«Centro de ayuda»**, con **«Ver todos»**), en el botón **?** del encabezado de cada módulo y en **Ajustes → Academia**:

1. **Tour Inicial** (7 pasos) — se lanza solo la primera vez, si lo aceptas al terminar la configuración.
2. **Inicio en detalle** («Inicio») — cada tarjeta del Inicio, incluido el score con su ícono de información y el semáforo de capacidad de pago.
3. **Cómo se mide tu período** (en la guía como «Tu período») — tu día de pago, fin de semana y feriados, el sueldo que llega antes y la edición a mano; también cuenta el ciclo semanal (día elegido) y el irregular (mes calendario).
4. **Tu sueldo** — cómo enseñarle a la app tu pago: la cuenta donde te pagan, la fuente de ingreso, un SMS de ejemplo y qué pasa cuando llega el pago.
5. **Movimientos** — buscar, filtrar, editar y clasificar.
6. **Registrar un Gasto o Ingreso** («Agregar»).
7. **Sincronización SMS** («SMS», solo si la lectura de SMS está activada).
8. **Presupuesto** — gastos fijos, deuda programada, límites por categoría (repartidos por período), metas e ingresos.
9. **Estadísticas** — cada indicador, incluido el paso **«Ratio deuda / ingreso»** (cuotas de visacuotas y préstamos frente al ingreso, umbrales 20/40, qué no incluye y «Ya no la tengo»).
10. **Asesor IA** («Asesor»).
11. **Cuentas y Visacuotas** («Cuentas»).
12. **Cómo funcionan las visacuotas** («Visacuotas») — la tarjeta con su día de corte, la compra en cuotas, la cuota que se carga en cada corte y la última cuota.
13. **Registrar una compra con tarjeta** («Compra con tarjeta») — crear la tarjeta con su corte y su pago, registrar el gasto (o dejar que el SMS lo detecte) y verlo en el «Ciclo abierto».
14. **Pagar la tarjeta** — la cuenta con la que pagas, el monto real del estado, registrar el pago o dejar que el SMS lo detecte, y por qué no es un gasto nuevo.
15. **Llevar el saldo de tus cuentas** («Saldos y transferencias») — elegir el modo de saldo, el saldo de partida, cómo lo mueven los movimientos y las transferencias (sueldo → transferir → pagar la tarjeta), «Ajustar al saldo real» y «¿A qué cuenta fue?».
16. **Ajustes** — cada sección, incluido el presupuesto por período y el ciclo de pago.
17. **Widget en tu pantalla de inicio** («Widget», solo Android) — agregarlo desde el teléfono, qué muestra cada tamaño, el ojo para ocultar los montos (ocultos por defecto) y «+ gasto».

En cada paso: **Siguiente** para avanzar u **Omitir tutorial** para salir. Los vistos quedan marcados. Si un paso necesita algo que todavía no existe (una cuenta, una tarjeta con corte y pago, una fuente de ingreso, los SMS activos), el tutorial lo dice y ofrece **«Crearlo ahora»**: se cierra para que lo crees, y lo abres de nuevo después. Para repetirlos todos: **Ajustes → Academia → Reiniciar todos los tutoriales**.

---

## 15. Preguntas frecuentes

**¿Por qué el "período" no coincide con el mes calendario?**
Porque la app trabaja de pago a pago según tu ciclo (por ejemplo, si te pagan el 15, tu período va del 15 al 14 del mes siguiente). Así el presupuesto refleja tu realidad. El período empieza el día en que de verdad te pagan: si tu día de pago cae en fin de semana o feriado, arranca el día hábil anterior o siguiente según tus reglas, y siempre puedes fijarlo a mano (toca el rango del período en el Inicio).

**Cobro cada semana. ¿Cuándo empieza mi período?**
El día de la semana que elegiste. Si te pagan los martes, tu período va de martes a lunes y se renueva cada martes, sin ajustes por feriados. Lo cambias en Ajustes → Ciclo de pago (chips Dom a Sáb). El presupuesto y los límites por categoría que escribes son mensuales: cada semana mides una fracción (12/52 del mensual).

**Mis ingresos son irregulares. ¿Cómo se mide mi período?**
Con el **mes calendario**, del 1 al último día. No hay quincenas, semanas ni día de pago que elegir, porque tus ingresos no tienen fecha fija; el presupuesto del período es el mensual completo. Si más adelante empiezas a cobrar con un ritmo fijo, cambia el ciclo en Ajustes → Ciclo de pago.

**¿Por qué el score no usa el mes calendario?**
Porque tu dinero se mueve de pago a pago. Si el score usara el mes calendario, el día 1 de un mes que empezó con gastos y sin sueldo te marcaría un ahorro negativo aunque tu sueldo llegue al día siguiente. Ahora el score mide tu **período actual**, con las mismas cifras que el anillo, los avisos y el widget; y si tu ingreso del período todavía no está registrado, el ahorro queda «pendiente» y no resta. Toca el ícono ⓘ del score para ver cada factor.

**¿Por qué mi presupuesto semanal o quincenal es una fracción del mensual?**
Porque el presupuesto que escribes en Ajustes es **mensual**, pero la app mide un período a la vez. Si cobras por quincena se mide la mitad (el 50 %) y si cobras por semana 12/52 del mensual. Lo ves en Ajustes → Presupuesto Mensual («Por período: …») y en cada categoría («Q… por semana (Q… al mes)»). Si cobras por mes o tus ingresos son irregulares, no cambia nada.

**¿Cómo quito la deuda que declaré al configurar la app?**
En Estadísticas, en la tarjeta «Ratio Deuda / Ingreso», toca **«Ya no la tengo»** y confirma. Solo aparece si tu instalación guardó una deuda declarada con el onboarding viejo. Quita esa cifra del ratio, sin borrar ninguna visacuota ni préstamo registrado. Si todavía la tienes, regístrala como préstamo en Cuentas → Visacuotas («Sin tarjeta (préstamo)»). Si la declaraste como **Tarjeta** al configurar la app, ese monto también se quita con «Ya no la tengo».

**Mi tarjeta dice «Sin corte ni pago · Configurar».**
Faltan su día de corte y de pago. Tócala (o usa «Configurar corte y pago de tus tarjetas» en la guía del Inicio) y escribe ambos días; están en tu estado de cuenta. Sin ellos no hay recordatorio de pago, semáforo de capacidad ni ciclo para las cuotas.

**La sincronización SMS no importa nada.**
1) Verifica que diste el permiso de SMS a la app (Ajustes de Android → Apps → BudgetMaster → Permisos). 2) Solo funciona en Android. 3) Solo lee SMS de los últimos 3 meses con palabras bancarias. 4) Los ya importados se saltan (verás "Ya registrados" en el resumen). 5) Si hace falta, mantén presionado ⟳ para releer los 3 meses.

**El Asesor IA responde en «Modo local» aunque puse la API Key.**
Verifica que la clave esté completa y sin espacios, y que tocaste **Guardar Cambios** en Ajustes. Errores comunes: 403 = clave inválida; 429 = límite de solicitudes, espera unos segundos.

**¿Puedo usar dólares y quetzales a la vez?**
Sí. Cada transacción, cuenta, gasto fijo y meta tiene su propia moneda, y la app muestra balances separados. El tipo de cambio (Banguat) se usa para consolidar el patrimonio y medir tus cuotas en dólares contra tu ingreso.

**Marqué un gasto fijo como pagado por error.**
Toca la casilla otra vez para desmarcarlo. Si tenía AUTO activado, la transacción creada se revierte al desmarcarlo; confírmalo en Movimientos.

**¿Cómo respaldo mis datos?**
Los datos viven solo en el almacenamiento del teléfono. Si desinstalas la app o usas «Borrar Todos los Datos», se pierden. Aún no hay exportación integrada ni copia en la nube.

**El contador de días hasta el pago está mal.**
Revisa en Ajustes → Ingresos y período tu ciclo y día(s) de pago. Para quincenal deben ser dos días distintos (por ejemplo 15 y 30); para semanal, el día de la semana en que te pagan. Con ingresos irregulares el contador no aparece.

---

## 16. Privacidad

- **Todos tus datos se guardan localmente** en tu teléfono (AsyncStorage). No hay servidores de BudgetMaster ni cuentas en la nube.
- La lectura de SMS filtra por palabras bancarias y **nunca** procesa mensajes personales; el análisis ocurre en el dispositivo. De un SMS de ejemplo de tu pago se guarda un patrón (banco, terminación de cuenta, quién envía y monto aproximado), nunca un número de cuenta completo.
- Lo único que sale de tu teléfono: (1) la consulta del **tipo de cambio** a Banguat/API pública, y (2) si activas Gemini, el **contexto financiero resumido** que se envía a Google para generar las respuestas del asesor (incluye, entre otras cifras, el gasto del período, el presupuesto del período y la carga mensual de cuotas). Sin API Key, nada de tus finanzas sale del dispositivo.
- La opción «Compartir muestra de mis SMS» (Ajustes) solo arma un texto si tú la tocas y lo confirmas: oculta números de cuenta y de tarjeta, tu nombre y los enlaces personales (los montos y los nombres de comercios sí van), y lo compartes tú, con quien quieras, después de revisarlo.

---

## 17. Limitaciones conocidas

Lo que BudgetMaster todavía **no** hace, dicho con honestidad:

- **Solo Android** para la lectura de SMS, la sincronización automática, «Elegir de mis SMS» y el widget. En iPhone y en la versión web puedes registrar a mano y pegar un SMS en Agregar → «Pegar SMS» (siempre disponible, no necesita la lectura de SMS ni ningún permiso; la configuración inicial deja la lectura apagada fuera de Android), pero no hay lectura automática ni widget.
- **BAC no manda el total de la tarjeta por SMS**: el estado de cuenta llega por correo. La app estima el saldo con tus cargos y tú escribes el monto real con «Ingresar monto real».
- **Sin respaldo en la nube**: tus datos viven solo en el teléfono. Si lo pierdes o desinstalas la app, se pierden.
- **Período irregular = mes calendario.** Si tus ingresos no tienen fecha fija, no hay período de pago real: se usa el mes natural, el día de pago no se calcula y el contador de días al cobro no aparece (el widget y los avisos cuentan los días que quedan del mes).
- **Semanal sin feriados ni anclas.** Con ciclo semanal el período arranca siempre el día elegido: no se mueve por feriados, no hay «Cuándo empieza mi período» editable y el sueldo reconocido por SMS no mueve el inicio. Tampoco se programa el aviso de fin de período (el resumen semanal lo reemplaza).
- **Euros y libras 1:1.** La app solo tiene tipo de cambio Q↔USD. El EUR y la libra (£) se toman 1:1 con el quetzal al consolidar, así que sus totales son aproximados y no hay conversión confiable USD↔EUR/£.
- **El ratio deuda/ingreso solo mide cuotas** (visacuotas y préstamos activos), no el consumo de tarjeta que pagas completo cada mes.
- La lectura de SMS depende de permisos de Android y de las políticas de Google Play (para una versión pública puede cambiar). Cada banco manda sus mensajes distinto: si uno no se reconoce, llega a «Sin clasificar» o lo registras a mano.

---

*BudgetMaster — Planifica · Controla · Crece* 🪙
