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
6. [Presupuesto: gastos fijos, categorías y metas](#6-presupuesto)
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

---

## 2. Pantalla de Inicio (Dashboard)

Es tu centro de mando. De arriba hacia abajo:

- **Encabezado** — tu nombre, el rango del período financiero actual (ej. "30 Jun – 29 Jul 2026"), el día del período en que vas, y un contador de días hasta tu próximo pago (se pone rojo cuando faltan 3 o menos).
- **Botón de sincronización SMS** (⟳, esquina superior derecha) — lee tus SMS bancarios e importa transacciones automáticamente. Ver [sección 4](#4-sincronización-automática-por-sms-android).
- **CFO Intelligence (briefing)** — resumen diario de tu situación: porcentaje de presupuesto usado, dinero restante, gastos fijos pendientes y una frase motivacional. Con API Key de Gemini el briefing es generado por IA con tus datos reales.
- **Score Financiero (0–100)** — tu termómetro de disciplina. Sube si ahorrás (tasa ≥ 10–20 %), te mantenés dentro del presupuesto, pagás todos tus gastos fijos y tenés cuentas registradas. 80+ Excelente · 60+ Bueno · 40+ Regular · <40 Crítico.
- **Patrimonio Total** — activos menos deudas. Si registraste cuentas, se calcula con sus saldos reales; si no, se estima con tus ingresos/gastos + ahorros externos. Tocá el ícono ⓘ para ver la explicación.
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
5. **Categoría** — 20 categorías de gasto (Comida, Supermercado, Combustible, Streaming…) o 10 de ingreso (Salario, Pago Militar, Freelance…), más las personalizadas que crees en Ajustes.
6. Tocá **Guardar**.

Al guardar un gasto en Q, la app evalúa tu presupuesto y te envía una notificación con tu situación actualizada (ver [sección 12](#12-notificaciones-y-alertas)).

### Pegar un SMS bancario (funciona en cualquier teléfono)

Si no querés dar permiso de SMS (o usás iPhone), tocá **"Leer SMS"** arriba a la derecha, pegá el texto del mensaje de tu banco y presioná **Analizar SMS**. La app detecta automáticamente el monto, la moneda, el tipo (gasto/ingreso) y el banco, y te deja el formulario listo para guardar.

---

## 4. Sincronización automática por SMS (Android)

> ⚠️ Esta función **solo existe en Android** y requiere el permiso de lectura de SMS.

Tocá el botón **⟳** del Dashboard. La app:

1. Lee hasta los últimos **300 SMS** de tu bandeja de entrada (máximo 3 meses hacia atrás).
2. Filtra **solo los mensajes con palabras bancarias** (compra, débito, abono, retiro, transferencia, etc.). Nunca procesa mensajes personales.
3. Detecta monto, moneda, tipo, banco (BAC, BANRURAL, GTC, BANTRAB, PROMERICA…) y categoría (ej. "SHELL" → Combustible, "WALMART" → Supermercado, "NETFLIX" → Streaming).
4. Genera una descripción limpia (ej. "BAC · Compra en Walmart").
5. **Ignora duplicados** (cada SMS genera un identificador único) y **transferencias entre tus propias cuentas**.

Al final te muestra un resumen: SMS leídos, bancarios detectados, nuevos importados y ya registrados.

Las transacciones importadas llevan la etiqueta **SMS** y guardan el mensaje original: podés verlo tocando la transacción en Movimientos → "Ver SMS original".

---

## 5. Movimientos

Historial completo de transacciones, con:

- **Búsqueda** por descripción, banco o categoría.
- **Filtros** por tipo (Todos / Gastos / Ingresos) y por moneda (si tenés USD o EUR).
- Cada tarjeta muestra descripción, fecha, banco, insignias (SMS, moneda) y monto (verde = ingreso, rojo = gasto).

**Tocá una transacción** para abrir el detalle, donde podés:
- Editar la **descripción**, la **moneda** y la **categoría**.
- Ver el **SMS original** (si vino de un SMS).
- **Eliminarla** (pide confirmación; no se puede deshacer).

También podés eliminar rápido con el ícono 🗑 de cada tarjeta.

---

## 6. Presupuesto

La pestaña Presupuesto tiene **tres secciones**:

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

- **Crear**: botón ➕ → tipo, nombre, banco (opcional), moneda (Q/USD), saldo actual, color y notas. Las tarjetas de crédito piden además el **límite de crédito** y muestran una barra de uso (roja arriba del 80 %).
- **Editar**: mantené presionada la tarjeta. **Eliminar**: ícono 🗑.
- El resumen superior muestra **Activos, Deudas y Neto** (las tarjetas de crédito restan del patrimonio).

### Transferencias entre cuentas

Botón **"Transferir"** (necesitás al menos 2 cuentas activas): elegí origen, destino y monto. El saldo se mueve entre cuentas y queda registrado como movimiento tipo *transferencia* — **no cuenta como gasto ni ingreso**.

> ⚠️ Transferí entre cuentas de la **misma moneda**: la app no convierte Q↔USD automáticamente.

### Visacuotas (compras en cuotas)

Para compras financiadas con tarjeta (ej. "Laptop — Q6,000 en 12 cuotas de Q500"):

- **Crear**: pestaña Visacuotas → ➕ → tarjeta asociada, nombre, monto total, cuota mensual (el número de cuotas se calcula solo), categoría.
- Al crearla, el monto total **se suma al saldo deudor** de la tarjeta.
- **Cada mes la app descuenta una cuota automáticamente** y te muestra cuotas pagadas, restantes y la fecha en la que terminás de pagar.
- El Dashboard te avisa cuánto debés este mes en visacuotas.

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

---

## 10. Ajustes

- **Tu Perfil** — tu nombre.
- **Presupuesto mensual** — límite de gasto en Q (obligatorio, > 0) y opcional en USD.
- **Moneda principal** — Q, $, € o £.
- **Tipo de cambio USD → Q** — se actualiza solo cada 6 horas desde el **Banco de Guatemala (Banguat)**, con respaldo del mercado internacional. Podés forzar la actualización con ⟳ o escribirlo manualmente.
- **Ahorros externos** — dinero guardado fuera de la app (Q y USD); se suma al Patrimonio Total.
- **Seguridad biométrica** — ver [sección 11](#11-seguridad-biométrica). Solo aparece si tu teléfono tiene huella/rostro configurado.
- **Sincronización SMS** — activar/desactivar la lectura automática.
- **Inteligencia Artificial (Gemini)** — tu API Key.
- **Mis Categorías** — creá categorías personalizadas: nombre, si aplica a gastos/ingresos/ambos, color e ícono. Aparecen junto a las predefinidas al registrar transacciones.
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

7 tutoriales interactivos con "spotlight" sobre la pantalla real:

1. **Tour Inicial** (7 pasos) — se lanza solo la primera vez.
2. Registrar un gasto o ingreso.
3. Sincronización SMS.
4. Presupuesto.
5. Asesor IA.
6. Módulo de Cuentas.
7. Estadísticas.

En cada paso: **Siguiente** para avanzar u **Omitir tutorial** para salir. Los vistos quedan marcados. Para repetirlos: **Ajustes → Academia → Reiniciar todos los tutoriales**.

---

## 14. Preguntas frecuentes

**¿Por qué el "período" no coincide con el mes calendario?**
Porque la app trabaja de pago a pago según tu ciclo (ej. si te pagan el 15, tu período va del 15 al 14 del mes siguiente). Así el presupuesto refleja tu realidad. Si tu ciclo es "irregular", sí se usa el mes calendario.

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
