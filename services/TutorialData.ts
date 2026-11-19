// Datos de los tutoriales (tipos, pasos y textos). Módulo PURO: solo depende de theme.ts y de un tipo, sin
// AsyncStorage ni react-native, para poder probar los textos en Node (ver scripts/tutorial-*.test.ts).
// La persistencia de los vistos y el filtrado por SMS/plataforma viven en services/Tutorial.ts (TutorialService).
import { C } from '../theme';
import type { TutorialRequirement } from './TutorialRequirements';

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
// Debe coincidir con `Tab` de app/index.tsx, más 'advisor' (que se controla con showAI)
// y 'accounts' (que se controla con showAccounts).
export type TutorialScreen = 'dashboard' | 'transactions' | 'add' | 'budget' | 'stats' | 'settings' | 'advisor' | 'accounts';

export interface TutorialStep {
    id: string;
    elementId?: string;   // ID del elemento registrado en TutorialContext (measureInWindow)
    title: string;
    description: string;
    position: 'top' | 'bottom' | 'center';
    icon: string;
    padding?: number;
    // pantalla a la que se navega antes de medir/mostrar este paso; omitir para los tab_* de la barra inferior
    screen?: TutorialScreen;
    // acción registrada con useTutorialAction (p. ej. cambiar de pestaña interna) que se ejecuta antes de medir
    action?: { id: string; arg?: string | number };
    // clave del ScrollView registrado con useTutorialScroll; por defecto `screen`
    scrollKey?: string;
    // nota que se muestra si el elemento no existe o no queda visible (p. ej. aún sin datos)
    emptyHint?: string;
    // el paso se omite cuando la sincronización SMS está desactivada en Ajustes
    requiresSms?: boolean;
    // algo que debe existir antes de este paso (cuenta, tarjeta, fuente de ingreso, SMS activos): si falta,
    // el overlay lo avisa y ofrece crearlo en ese momento en vez de señalar una pantalla vacía
    requires?: TutorialRequirement;
    // descripción alternativa (sin mención a SMS) cuando la sincronización SMS está desactivada
    noSmsDescription?: string;
    // emptyHint alternativo (sin mención a SMS) cuando la sincronización SMS está desactivada
    noSmsEmptyHint?: string;
}

export interface Tutorial {
    id: string;
    title: string;
    description: string;
    icon: string;
    color: string;
    steps: TutorialStep[];
    // el tutorial completo se omite cuando la sincronización SMS está desactivada
    requiresSms?: boolean;
    // solo existe en Android: en otra plataforma el recorrido se reduce a un paso que explica que no está disponible
    androidOnly?: boolean;
}

// ─────────────────────────────────────────────────────────────
// TUTORIALES
// ─────────────────────────────────────────────────────────────
// Fuera de Android un tutorial `androidOnly` se reduce a un paso que dice que no está disponible (nunca señala nada).
export function androidOnlyNotice(t: Tutorial): Tutorial {
    if (!t.androidOnly) return t;
    return {
        ...t,
        steps: [{
            id: `${t.id}_na`, position: 'center', icon: 'information-circle-outline',
            title: 'Solo para Android',
            description: 'El widget de la pantalla de inicio está disponible solo en teléfonos Android. En iPhone y en la versión web no existe; la app funciona igual, sin él.',
        }],
    };
}

export const TUTORIALS: Tutorial[] = [

    // ── Tour inicial ──────────────────────────────────────────
    {
        id: 'tour_inicial', title: 'Tour Inicial',
        description: 'Conoce BudgetMaster paso a paso.',
        icon: 'rocket-outline', color: C.primary,
        steps: [
            {
                id: 'tour_1', elementId: 'briefing_card', screen: 'dashboard', position: 'bottom', icon: 'sparkles-outline', padding: 12,
                title: 'Tu CFO Personal',
                description: 'Esta tarjeta es tu briefing diario: analiza tus movimientos y te da un resumen cada vez que abres la app. Funciona sin configurar nada; si agregas tu API Key de Gemini en Ajustes, el análisis es más detallado.',
            },
            {
                id: 'tour_2', elementId: 'score_card', screen: 'dashboard', position: 'bottom', icon: 'shield-checkmark-outline', padding: 12,
                title: 'Score Financiero',
                description: 'Tu puntuación del 0 al 100, calculada con los movimientos que registras en tu período actual (el que empieza el día que cobras, no el mes calendario): cuánto ahorras, si te mantienes dentro del presupuesto y si pagaste tus gastos fijos. Si tu ingreso del período aún no está registrado, el ahorro no suma ni resta.',
            },
            {
                id: 'tour_3', elementId: 'sync_btn', screen: 'dashboard', position: 'bottom', icon: 'sync-circle-outline', padding: 16, requiresSms: true,
                title: 'Sync SMS',
                description: 'Este botón lee tus SMS bancarios (BAC, BANRURAL, GTC, BANTRAB, PROMERICA) y registra tus gastos automáticamente. La primera vez Android te pedirá permiso para leer SMS: sin ese permiso no se puede sincronizar. Solo funciona en Android.',
            },
            {
                id: 'tour_4', elementId: 'tab_add', position: 'top', icon: 'add-circle-outline', padding: 12,
                title: 'Agregar Transacción',
                description: 'El botón cobre central abre la pantalla para registrar gastos e ingresos a mano. Ahí también puedes pegar el texto de un SMS bancario (botón «Pegar SMS») para que la app complete los datos sola; no necesitas dar permiso de SMS.',
            },
            {
                id: 'tour_5', elementId: 'tab_budget', position: 'top', icon: 'wallet-outline', padding: 8,
                title: 'Presupuesto',
                description: 'Aquí planificas tu mes — gastos fijos, límites por categoría, metas de ahorro y tus fuentes de ingreso (de dónde y cuándo te pagan). Es donde conviertes tus intenciones en un plan real.',
            },
            {
                id: 'tour_6', elementId: 'tab_advisor', position: 'top', icon: 'sparkles-outline', padding: 8,
                title: 'Asesor IA',
                description: 'Tu CFO en modo chat. Pregúntale lo que quieras: ¿puedo comprarme X?, ¿cómo voy este mes?, ¿qué hago con este excedente? Responde con tus datos locales, y con Gemini lo hace en lenguaje natural.',
            },
            {
                id: 'tour_7', elementId: 'tab_settings', position: 'top', icon: 'settings-outline', padding: 8,
                title: 'Ajustes y Academia',
                description: 'Configura tu perfil, presupuesto, moneda, tipo de cambio y la API Key de Gemini. Cada módulo tiene un botón ? en su encabezado que abre su propio tutorial, y en Ajustes → Academia encuentras todos juntos.',
            },
        ],
    },

    // ── Inicio en detalle ─────────────────────────────────────
    {
        id: 'tutorial_inicio', title: 'Inicio en detalle',
        description: 'Cada tarjeta del Inicio, explicada.',
        icon: 'home-outline', color: C.primaryLight,
        steps: [
            {
                id: 'ini_1', elementId: 'dash_header', screen: 'dashboard', position: 'bottom', icon: 'calendar-outline', padding: 8,
                title: 'Tu período financiero',
                description: 'Arriba ves tu nombre, el período actual y en qué día del período estás. El período sigue el ciclo de pago que elegiste (mensual, quincenal, semanal o irregular), no el mes calendario, y empieza el día que cae tu sueldo: si tu día de pago cae en fin de semana o feriado, arranca el día hábil en que realmente te pagan. Toca el rango del período para ver de dónde sale su inicio y cambiarlo. Junto al día del período ves cuántos días faltan para tu próximo ingreso.',
            },
            {
                id: 'ini_guide', elementId: 'dash_guide', screen: 'dashboard', position: 'bottom', icon: 'compass-outline', padding: 8,
                title: 'Guía y primeros pasos',
                description: 'Lo que te falta configurar (por ejemplo «Enseñarle a la app tu pago», el SMS con el que te llega tu sueldo, o «Configurar corte y pago de tus tarjetas», que abre la tarjeta que aún no tiene esos días) y todos los tutoriales, a un toque.',
                emptyHint: 'Ábrela desde Ajustes → Academia.',
            },
            {
                id: 'ini_2', elementId: 'briefing_card', screen: 'dashboard', position: 'bottom', icon: 'sparkles-outline', padding: 8,
                title: 'Briefing del día',
                description: 'Un resumen escrito de cómo vas: gasto del período, alertas y una recomendación concreta. Se genera con tus datos locales; si agregas una API Key de Gemini en Ajustes, el texto es más conversacional.',
            },
            {
                id: 'ini_3', elementId: 'score_card', screen: 'dashboard', position: 'bottom', icon: 'shield-checkmark-outline', padding: 8,
                title: 'Score financiero',
                description: 'Puntaje de 0 a 100 con lo que registras en tu período actual (no el mes calendario): tasa de ahorro, presupuesto del período, gastos fijos pagados y cuentas activas. Si tu ingreso del período aún no está registrado, el ahorro no suma ni resta. Toca el ícono de información para ver cada punto.',
            },
            {
                id: 'ini_4', elementId: 'dash_networth', screen: 'dashboard', position: 'top', icon: 'diamond-outline', padding: 8,
                title: 'Patrimonio total',
                description: 'Suma solo las cuentas que llevan saldo (efectivo, bancos, ahorro e inversión); las cuentas «Sin seguimiento» y las tarjetas de crédito no suman. Los quetzales van arriba y los dólares (u otras monedas) debajo, sin convertirlos. Si ninguna cuenta lleva saldo, es un estimado: tus ahorros externos más tus ingresos menos tus gastos registrados. Lo que debes en visacuotas no se resta: aparece aparte como «Compromisos de crédito». Toca el ícono de información de la tarjeta para ver el detalle.',
            },
            {
                id: 'ini_5', elementId: 'dash_balance_q', screen: 'dashboard', position: 'top', icon: 'cash-outline', padding: 8,
                title: 'Balance por moneda',
                description: 'Ingresos, gastos y saldo del período en quetzales. Si registras movimientos en dólares aparece una segunda tarjeta en USD: las monedas nunca se mezclan.',
            },
            {
                id: 'ini_6', elementId: 'dash_budget', screen: 'dashboard', position: 'top', icon: 'speedometer-outline', padding: 8,
                title: 'Presupuesto del período',
                description: 'Cuánto llevas gastado frente a tu presupuesto del período (el mensual de Ajustes, repartido si cobras por quincena o semana). Cambia de color al acercarte al límite. Si tienes una tarjeta con corte y día de pago, justo debajo aparece el semáforo de capacidad de pago (verde, ámbar o rojo): te dice qué parte de lo que tendrás para pagarla ya está comprometida.',
            },
            {
                id: 'ini_capacity', elementId: 'dash_capacity', screen: 'dashboard', position: 'top', icon: 'speedometer-outline', padding: 8,
                title: 'Semáforo de capacidad de pago',
                description: 'Compara lo que vas a deber hasta el día de pago de tu tarjeta más próxima (el estado de la tarjeta, gastos fijos por pagar y otras deudas) con lo que tendrás: verde si usas menos del 70 %, ámbar desde el 70 %, rojo desde el 90 % y «no alcanza» al llegar al 100 %. Tócalo para ver el detalle: de dónde sale lo que tendrás (los saldos de tus cuentas más los ingresos que esperas antes del pago, o, si ninguna cuenta lleva saldo, la parte de tu ingreso declarado que toca a un período —mensual completo, la mitad en quincenal, 12/52 en semanal— menos lo que ya gastaste en él) y cuánto te sobra o te falta.',
                emptyHint: 'Aparece cuando tienes una tarjeta con día de corte y de pago, y algo por pagar. Configura el corte y el pago de tu tarjeta en Cuentas.',
            },
            {
                id: 'ini_7', elementId: 'accounts_widget', screen: 'dashboard', position: 'top', icon: 'business-outline', padding: 8,
                title: 'Tus cuentas',
                description: 'Resumen de tus cuentas, tarjetas y visacuotas. Toca este widget para abrir el módulo de Cuentas, donde registras saldos, transferencias y compras en cuotas.',
                emptyHint: 'Este widget aparece más abajo en el Inicio.',
            },
            {
                id: 'ini_8', elementId: 'dash_fixed', screen: 'dashboard', position: 'top', icon: 'calendar-outline', padding: 8,
                title: 'Gastos fijos y metas',
                description: 'Estos widgets muestran cuántos gastos fijos ya pagaste y cómo avanzan tus metas de ahorro. Al tocarlos te llevan a Presupuesto.',
            },
            {
                id: 'ini_9', elementId: 'dash_recent', screen: 'dashboard', position: 'top', icon: 'list-outline', padding: 8,
                title: 'Movimientos recientes',
                description: 'Tus últimos registros. Para buscar, filtrar o editar cualquier movimiento usa la pestaña Movimientos.',
            },
            {
                id: 'ini_10', elementId: 'sync_btn', screen: 'dashboard', position: 'bottom', icon: 'sync-circle-outline', padding: 16, requiresSms: true,
                title: 'Sincronizar SMS',
                description: 'Lee tus SMS bancarios y registra los movimientos detectados, sin duplicar los que ya importaste. Solo funciona en Android y necesita el permiso de SMS. Desliza hacia abajo en el Inicio para recargar los datos.',
            },
        ],
    },

    // ── Cómo se mide tu período (tutorial de proceso) ─────────
    {
        id: 'tutorial_periodo', title: 'Cómo se mide tu período',
        description: 'Tu día de pago, fines de semana, feriados y sueldo adelantado.',
        icon: 'calendar-outline', color: C.accent,
        steps: [
            {
                id: 'per_1', elementId: 'settings_period', screen: 'settings', position: 'bottom', icon: 'calendar-outline', padding: 8,
                title: 'Tu día de pago',
                description: 'Todo parte de tu día de pago (por ejemplo el 27): tu período va de un pago al siguiente, no del 1 al 30. Esta sección de Ajustes lo muestra junto con el período actual, y ahí mismo está el botón «Cuándo empieza mi período». Si cobras semanal, tu período empieza el día de la semana que elegiste (Ajustes → Ciclo de pago) y no se mueve por feriados. Si tus ingresos son irregulares, tu período es el mes calendario.',
            },
            {
                id: 'per_2', elementId: 'settings_period', screen: 'settings', position: 'bottom', icon: 'sunny-outline', padding: 8,
                title: 'Fin de semana y feriados',
                description: 'Si tu día de pago cae sábado, domingo o feriado de Guatemala, el sueldo llega otro día. Toca «Cuándo empieza mi período» y, en Reglas, elige qué hacer: Viernes antes, Lunes después o Día exacto. También decides si cuentan los feriados y cuántos días de tolerancia aceptas (de 1 a 7). El período arranca el día en que de verdad te pagan.',
            },
            {
                id: 'per_3', elementId: 'dash_header', screen: 'dashboard', position: 'bottom', icon: 'cash-outline', padding: 8,
                requires: 'income_source',
                title: 'El sueldo que llega antes',
                description: 'Con una fuente de ingreso creada en Presupuesto → Ingresos (con «Mueve mi período cuando llega» activado) y «Adelantar el período cuando llega el sueldo» activado, cuando la app reconoce tu depósito de sueldo por SMS y cae antes o después de lo esperado (dentro de la tolerancia), el período empieza ese día. Arriba ves el rango del período y, al tocarlo, de dónde sale su inicio: «Empezó con tu sueldo del vie 25», «Adelantado por fin de semana o feriado», «Fijado por ti» o «Es tu día de pago».',
                emptyHint: 'El rango del período aparece en el encabezado del Inicio.',
            },
            {
                id: 'per_4', elementId: 'dash_header', screen: 'dashboard', position: 'bottom', icon: 'hand-left-outline', padding: 8,
                title: 'Editarlo a mano siempre gana',
                description: 'Toca el rango del período para abrir «Cuándo empieza tu período»: elige la fecha en que de verdad te pagaron y toca Guardar. Lo que fijas a mano siempre gana: la app no lo cambia sola. «Volver a automático» le devuelve la decisión a tus reglas y a tu sueldo.',
                emptyHint: 'El rango del período aparece en el encabezado del Inicio.',
            },
        ],
    },

    // ── Tu sueldo (tutorial de proceso) ───────────────────────
    {
        id: 'tutorial_sueldo', title: 'Tu sueldo',
        description: 'Enséñale a la app tu pago: la cuenta, la fuente y el SMS con el que te llega.',
        icon: 'cash-outline', color: C.primary,
        steps: [
            {
                id: 'sue_1', elementId: 'accounts_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'wallet-outline', padding: 8,
                requires: 'bank_account',
                title: '1. La cuenta donde te pagan',
                description: 'Primero tiene que existir la cuenta donde cae tu pago (por ejemplo tu Monetaria). Si todavía no la tienes, créala en Cuentas con el botón +. Con ella la app sabe a qué cuenta llegó cada depósito.',
                emptyHint: 'Todavía no tienes cuentas. Crea la primera con el botón +.',
            },
            {
                id: 'sue_2', elementId: 'budget_income_fab', screen: 'budget', action: { id: 'budget:setTab', arg: 3 }, scrollKey: 'budget_income', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: '2. Tu fuente de ingreso',
                description: 'En Presupuesto → Ingresos está tu fuente de ingreso: al terminar la configuración inicial la app ya creó una con tu ingreso, tu ciclo y tus días de pago. Tócala para revisarla (nombre, categoría, cuánto te pagan, cada cuánto y qué día, y la cuenta donde te pagan) o usa el botón + para agregar otra (por ejemplo un pago extra como el aguinaldo o el bono 14, que marcas como Extra con su mes). Con «Mueve mi período cuando llega» tu período empieza el día que de verdad te pagan.',
            },
            {
                id: 'sue_3', screen: 'budget', position: 'center', icon: 'chatbubble-ellipses-outline',
                title: '3. El SMS de tu pago',
                description: 'La configuración inicial te pide el SMS con el que te llega tu pago (sueldo, quincena, ventas…). Si lo saltaste con «Lo hago después», quedó pendiente en la guía del Inicio como «Enseñarle a la app tu pago» y se hace aquí: abre tu fuente y, en «SMS de ejemplo», toca «Elegir de mis SMS» y escoge el depósito de tu último pago; también puedes pegar el texto del SMS en el cuadro. La app aprende de qué banco y cuenta llega, quién lo envía y cuánto, sin guardar ningún número de cuenta. Sin SMS de ejemplo la fuente se guarda igual, pero no detecta tu pago sola.',
                noSmsDescription: 'La configuración inicial te pide el SMS con el que te llega tu pago (sueldo, quincena, ventas…). Si lo saltaste con «Lo hago después», quedó pendiente en la guía del Inicio como «Enseñarle a la app tu pago» y se hace aquí: abre tu fuente y, en «SMS de ejemplo», pega el texto del SMS que te mandó el banco cuando te pagaron y toca «Analizar SMS». La app aprende de qué banco y cuenta llega, quién lo envía y cuánto, sin guardar ningún número de cuenta. Sin SMS de ejemplo la fuente se guarda igual, pero no detecta tu pago sola.',
            },
            {
                id: 'sue_4', screen: 'budget', position: 'center', icon: 'checkmark-circle-outline',
                title: '4. Confirma lo que entendió la app',
                description: 'Después de analizar el SMS ves una tarjeta «Entendimos»: el banco, la cuenta, quién envía el dinero y el monto aproximado. Si es correcto toca «Sí, es así»; si algo no cuadra toca «Corregir» y cambia quién envía o el monto. Recién entonces guarda la fuente.',
            },
            {
                id: 'sue_5', elementId: 'budget_income_list', screen: 'budget', action: { id: 'budget:setTab', arg: 3 }, scrollKey: 'budget_income', position: 'bottom', icon: 'cash-outline', padding: 8,
                requires: 'income_source',
                title: '5. Cuando llega el pago',
                description: 'Cuando entra tu depósito, la app lo reconoce, le pone la categoría de la fuente y la marca «Recibido»; si la fuente mueve tu período, tu período arranca ese día. Si no está segura, te pregunta «¿Es tu sueldo?» en el centro de revisión. También puedes vincular un depósito a mano desde su detalle en Movimientos.',
                emptyHint: 'Todavía no tienes fuentes de ingreso. Crea la primera con el botón +.',
            },
        ],
    },

    // ── Movimientos ───────────────────────────────────────────
    {
        id: 'tutorial_movimientos', title: 'Movimientos',
        description: 'Busca, filtra y edita tus registros.',
        icon: 'list-outline', color: C.accent,
        steps: [
            {
                id: 'mov_1', elementId: 'tx_header', screen: 'transactions', position: 'bottom', icon: 'list-outline', padding: 8,
                title: 'Tu historial completo',
                description: 'Aquí están todos tus gastos, ingresos y transferencias, del más reciente al más antiguo. El contador muestra cuántos registros coinciden con los filtros activos.',
            },
            {
                id: 'mov_2', elementId: 'tx_search', screen: 'transactions', position: 'bottom', icon: 'search-outline', padding: 8,
                title: 'Búsqueda',
                description: 'Escribe parte de la descripción, el nombre del banco o la categoría. La lista se filtra mientras escribes; toca la X para limpiar.',
            },
            {
                id: 'mov_3', elementId: 'tx_type_filter', screen: 'transactions', position: 'bottom', icon: 'funnel-outline', padding: 8,
                title: 'Filtrar por tipo',
                description: 'Muestra todos los movimientos, solo gastos o solo ingresos. Este filtro se combina con la búsqueda.',
            },
            {
                id: 'mov_4', elementId: 'tx_currency_filter', screen: 'transactions', position: 'bottom', icon: 'cash-outline', padding: 8,
                title: 'Filtrar por moneda',
                description: 'Si registraste movimientos en dólares o euros, este filtro te deja ver cada moneda por separado.',
                emptyHint: 'Este filtro aparece cuando tienes movimientos en más de una moneda.',
            },
            {
                id: 'mov_5', elementId: 'tx_first', screen: 'transactions', position: 'bottom', icon: 'receipt-outline', padding: 8,
                title: 'Cada movimiento',
                description: 'Cada tarjeta muestra la descripción, la fecha, el banco, si vino de un SMS, la moneda y la categoría. El monto va en verde pátina si es ingreso y en rojo si es gasto. La papelera lo elimina, siempre con confirmación.',
                noSmsDescription: 'Cada tarjeta muestra la descripción, la fecha, el banco, la moneda y la categoría. El monto va en verde pátina si es ingreso y en rojo si es gasto. La papelera lo elimina, siempre con confirmación.',
                emptyHint: 'Todavía no tienes movimientos: registra uno con el botón + de la barra inferior.',
            },
            {
                id: 'mov_6', screen: 'transactions', position: 'center', icon: 'create-outline',
                title: 'Editar un movimiento',
                description: 'Toca cualquier movimiento para abrir su detalle: puedes corregir la descripción, la moneda y la categoría, ver el SMS original si vino del banco, convertirlo en visacuota si fue una compra en cuotas o eliminarlo. En un ingreso, «Vincular a fuente de ingreso» lo asigna a una de tus fuentes (sueldo, quincena…) y «Quitar vínculo con la fuente» lo suelta.',
                noSmsDescription: 'Toca cualquier movimiento para abrir su detalle: puedes corregir la descripción, la moneda y la categoría, convertirlo en visacuota si fue una compra en cuotas o eliminarlo. En un ingreso, «Vincular a fuente de ingreso» lo asigna a una de tus fuentes (sueldo, quincena…) y «Quitar vínculo con la fuente» lo suelta.',
            },
            {
                id: 'mov_7', screen: 'transactions', position: 'center', icon: 'pricetag-outline',
                title: 'Clasifica bien tus movimientos',
                description: 'La app clasifica sola por el nombre del comercio: Restaurantes es la comida ya preparada (restaurantes, comida rápida, cafeterías y delivery), Supermercado es la despensa, y Comida es el resto (panaderías, mercados, tiendas de barrio). Combustible es la gasolina; Transporte, taxis, parqueos y peajes. Si una categoría no es la correcta, cámbiala en el detalle del movimiento y activa «Recordar»: la app aprende ese comercio y lo clasifica así la próxima vez. En ingresos por SMS, la app recuerda el origen del depósito (banco, cuenta y quién lo envía): corrige la categoría de un depósito, activa «Recordar» y los próximos del mismo origen llegan ya clasificados. Si no hay una que te sirva, crea una ahí mismo con «+ Nueva categoría» (la última casilla de la lista).',
                noSmsDescription: 'Elige la categoría según el tipo de gasto: Restaurantes es la comida ya preparada (restaurantes, comida rápida, cafeterías y delivery), Supermercado es la despensa, y Comida es el resto (panaderías, mercados, tiendas de barrio). Combustible es la gasolina; Transporte, taxis, parqueos y peajes. Si te equivocaste, cámbiala en el detalle del movimiento. Si no hay una que te sirva, crea una ahí mismo con «+ Nueva categoría» (la última casilla de la lista).',
            },
        ],
    },

    // ── Registrar un gasto o ingreso ──────────────────────────
    {
        id: 'tutorial_agregar', title: 'Registrar un Gasto o Ingreso',
        description: 'Aprende a agregar transacciones manualmente.',
        icon: 'add-circle-outline', color: C.accent,
        steps: [
            {
                id: 'add_1', elementId: 'add_header', screen: 'add', position: 'bottom', icon: 'add-outline', padding: 8,
                title: 'Registrar un movimiento',
                description: 'Aquí anotas a mano cualquier gasto o ingreso. También llegas tocando el botón cobre central de la barra inferior.',
            },
            {
                id: 'add_2', elementId: 'add_type_selector', screen: 'add', position: 'bottom', icon: 'swap-horizontal-outline', padding: 8,
                title: 'Gasto o Ingreso',
                description: 'Primero elige si es un Gasto (dinero que salió: compras, pagos, retiros) o un Ingreso (dinero que entró: salario, ventas, transferencias recibidas). Al cambiar el tipo se reinicia la categoría elegida.',
            },
            {
                id: 'add_3', elementId: 'add_currency', screen: 'add', position: 'bottom', icon: 'cash-outline', padding: 8,
                title: 'Selecciona la Moneda',
                description: 'Elige entre Q, USD, EUR o £. La app lleva balances separados por moneda, así un gasto en dólares no se mezcla con tus quetzales.',
            },
            {
                id: 'add_4', elementId: 'add_amount', screen: 'add', position: 'bottom', icon: 'calculator-outline', padding: 8,
                title: 'Ingresa el Monto',
                description: 'Escribe el monto, con decimales si hace falta (por ejemplo 150.50). El número toma el color del tipo elegido para que confirmes de un vistazo si es gasto o ingreso.',
            },
            {
                id: 'add_5', elementId: 'add_description', screen: 'add', position: 'bottom', icon: 'pencil-outline', padding: 8,
                title: 'Agrega una Descripción',
                description: 'Opcional pero recomendado: escribe en qué gastaste o de dónde viene el dinero. Te ayuda a identificar la transacción después.',
            },
            {
                id: 'add_6', elementId: 'add_category', screen: 'add', position: 'top', icon: 'pricetag-outline', padding: 8,
                title: 'Elige la Categoría',
                description: 'La categoría alimenta tus estadísticas y el presupuesto por categoría: elegirla bien te dice exactamente en qué se va tu dinero. Si no hay una que te sirva, crea una ahí mismo con «+ Nueva categoría» (la última casilla de la lista): queda elegida y disponible en toda la app. También puedes administrarlas en Ajustes → Mis Categorías.',
            },
            {
                id: 'add_7', elementId: 'add_sms_btn', screen: 'add', position: 'bottom', icon: 'clipboard-outline', padding: 8,
                title: 'Atajo: pegar un SMS',
                description: 'Si tienes un SMS del banco, toca «Pegar SMS», pega el texto y presiona «Analizar SMS»: la app completa monto, moneda y tipo por ti. Funciona en cualquier teléfono, aunque la lectura de SMS esté apagada, y no pide ningún permiso. Al final revisa los datos y toca «Guardar».',
            },
            {
                id: 'add_8', elementId: 'add_save_btn', screen: 'add', position: 'top', icon: 'save-outline', padding: 8,
                title: 'Guardar',
                description: 'Revisa los datos y toca Guardar: el movimiento aparece en Inicio y en Movimientos, y actualiza tus estadísticas y presupuestos.',
            },
        ],
    },

    // ── Sincronización SMS ────────────────────────────────────
    {
        id: 'tutorial_sms', title: 'Sincronización SMS',
        description: 'Registra gastos automáticamente desde tus SMS bancarios.',
        icon: 'chatbubble-outline', color: C.accentLight,
        requiresSms: true,
        steps: [
            {
                id: 'sms_1', elementId: 'sync_btn', screen: 'dashboard', position: 'bottom', icon: 'sync-outline', padding: 16,
                title: 'Botón de Sincronización',
                description: 'Este botón, arriba a la derecha en Inicio, revisa los SMS de los últimos 3 meses, detecta los bancarios y los registra como movimientos. Los mensajes que ya importaste antes no se duplican.',
            },
            {
                id: 'sms_2', position: 'center', icon: 'lock-closed-outline',
                title: 'Permiso de Android',
                description: 'La primera vez que sincronices, Android te preguntará si BudgetMaster puede leer tus SMS: elige "Permitir". Si lo rechazaste con "No volver a preguntar", actívalo en Ajustes del teléfono → Apps → BudgetMaster → Permisos → SMS.',
            },
            {
                id: 'sms_3', position: 'center', icon: 'shield-outline',
                title: 'Tu privacidad está protegida',
                description: 'La app SOLO lee mensajes con palabras bancarias (compra, débito, abono). Nunca lee mensajes personales. Todo queda en tu celular.',
            },
            {
                id: 'sms_4', position: 'center', icon: 'settings-outline',
                title: 'Configurar en Ajustes',
                description: 'En Ajustes → Sincronización SMS Automática puedes activarla o desactivarla. Bancos soportados: BAC, BANRURAL, GTC, BANTRAB y PROMERICA. Si un SMS no se detecta, pégalo a mano en Agregar → «Pegar SMS».',
            },
            {
                id: 'sms_5', position: 'center', icon: 'pricetag-outline',
                title: 'Clasificación automática',
                description: 'Cada movimiento se guarda con el nombre del comercio (sin la zona ni la sucursal, que quedan como ubicación) y una categoría: Restaurantes para comida preparada, Supermercado para la despensa y Comida para el resto. Si una categoría no es la correcta, cámbiala en el detalle del movimiento y activa «Recordar»: la app aprende ese comercio. En ingresos por SMS, la app recuerda el origen del depósito (banco, cuenta y quién lo envía), así que los próximos depósitos del mismo origen llegan ya clasificados. Si ya creaste una fuente de ingreso, un depósito que se le parece se vincula solo; si la app no está segura, el centro de revisión te pregunta «¿Es tu sueldo?» y tú confirmas con Sí o No.',
            },
            {
                id: 'sms_6', position: 'center', icon: 'shield-checkmark-outline',
                title: 'Centro de revisión',
                description: 'Si lo abres desde el aviso de una sincronización, ves lo que trajo esa sincronización; toca «Revisar también lo de antes» o usa Ajustes → «Revisar pendientes» para ver todo, también lo del período anterior. «Revisar» cuenta también las preguntas «¿A qué cuenta fue?».',
            },
        ],
    },

    // ── Presupuesto ───────────────────────────────────────────
    {
        id: 'tutorial_presupuesto', title: 'Presupuesto',
        description: 'Gastos fijos, límites por categoría y metas, paso a paso.',
        icon: 'wallet-outline', color: C.primaryLight,
        steps: [
            {
                id: 'budget_1', elementId: 'budget_tabs', screen: 'budget', position: 'bottom', icon: 'wallet-outline', padding: 8,
                title: 'Cuatro herramientas de planificación',
                description: 'Presupuesto tiene cuatro pestañas: Gastos Fijos (tus compromisos mensuales), Categorías (límites de gasto), Metas (ahorro con objetivo) e Ingresos (de dónde y cuándo te pagan). Vamos a recorrer cada una.',
            },
            {
                id: 'budget_2', elementId: 'budget_fixed_summary', screen: 'budget', action: { id: 'budget:setTab', arg: 0 }, scrollKey: 'budget_fixed', position: 'bottom', icon: 'calendar-outline', padding: 8,
                title: 'Resumen de gastos fijos',
                description: 'Cuántos gastos fijos pagaste este período, cuánto dinero ya cubriste, cuánto falta y en cuántos días es tu próximo ingreso. La barra muestra el porcentaje cubierto.',
            },
            {
                id: 'budget_3', elementId: 'budget_fixed_list', screen: 'budget', scrollKey: 'budget_fixed', position: 'top', icon: 'checkbox-outline', padding: 8,
                title: 'Marcar como pagado',
                description: 'Toca la casilla de un gasto para marcarlo como pagado; la app te pregunta en qué fecha se pagó (por defecto, su día de cobro si ya pasó). Si tiene la etiqueta AUTO, la app lo registra en Movimientos automáticamente y lo revierte si lo desmarcas. Mantén presionada la tarjeta para editarla. VENCIDO indica que pasó su día de pago sin marcarse. Si le pusiste cuenta o tarjeta, la ves en un chip junto al día de pago.',
                emptyHint: 'Todavía no tienes gastos fijos. Agrega el primero con el botón + de esta pestaña.',
            },
            {
                id: 'budget_4', elementId: 'budget_fixed_fab', screen: 'budget', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: 'Agregar un gasto fijo',
                description: 'Con este botón registras renta, internet, seguros o cuotas: nombre, monto, moneda, día de pago, categoría y, si quieres, la cuenta o tarjeta de donde sale el pago. La app te recuerda 3 días antes de cada vencimiento (a las 8:00, sin avisarte de noche) y las casillas se reinician al empezar un nuevo período.',
            },
            {
                id: 'budget_4b', elementId: 'budget_debt_list', screen: 'budget', action: { id: 'budget:setTab', arg: 0 }, scrollKey: 'budget_fixed', position: 'top', icon: 'card-outline', padding: 8,
                title: 'Deuda programada',
                description: 'Debajo de tus gastos fijos, «Deuda programada» lista lo que vence en este período: cada tarjeta con lo que falta pagar de su estado de cuenta (quetzales y dólares por separado) y cada préstamo sin tarjeta, con su fecha de vencimiento. «Estimado» quiere decir que el monto sale de los cargos de la tarjeta; si escribes el monto real del estado en Cuentas, deja de ser estimado. Se suma a lo «Comprometido» del período junto con tus gastos fijos pendientes, sin contar dos veces lo que ya tengas como gasto fijo. Pagar la tarjeta no es un gasto nuevo.',
                emptyHint: 'Aquí aparecen tus tarjetas y préstamos con su vencimiento. Todavía no hay nada por pagar en este período.',
            },
            {
                id: 'budget_5', elementId: 'budget_cat_summary', screen: 'budget', action: { id: 'budget:setTab', arg: 1 }, scrollKey: 'budget_categories', position: 'bottom', icon: 'bar-chart-outline', padding: 8,
                title: 'Planificado contra gastado',
                description: 'La suma de los límites de tus categorías (repartidos al período si cobras por quincena o semana), cuánto llevas gastado en esas categorías este período y cuánto te queda disponible o cuánto te excediste.',
            },
            {
                id: 'budget_5b', elementId: 'budget_cat_list', screen: 'budget', scrollKey: 'budget_categories', position: 'bottom', icon: 'list-outline', padding: 8,
                title: 'Movimientos de cada categoría',
                description: 'Toca una categoría para ver los movimientos del período. Los gastos en dólares u otra moneda se muestran aparte: no se convierten ni cuentan en el límite. Más abajo, «Gastos sin presupuesto» lista las categorías con gasto que todavía no tienen límite.',
                emptyHint: 'Aquí aparecen las categorías con límite y, debajo, las que tienen gasto este período pero aún no tienen límite.',
            },
            {
                id: 'budget_6', elementId: 'budget_cat_grid', screen: 'budget', scrollKey: 'budget_categories', position: 'top', icon: 'pricetag-outline', padding: 8,
                title: 'Asignar un límite',
                description: 'Toca una categoría, escribe el límite MENSUAL y confirma con el check. Si cobras por quincena o por semana, el límite también se reparte por período (cada tarjeta muestra cuánto toca por período y cuánto al mes). La app te avisa una vez cuando llegas al 80% del límite del período y otra si lo superas; no te manda un aviso por cada gasto. Para quitar un límite usa la papelera de su tarjeta.',
            },
            {
                id: 'budget_7', elementId: 'budget_goals_list', screen: 'budget', action: { id: 'budget:setTab', arg: 2 }, scrollKey: 'budget_goals', position: 'bottom', icon: 'trophy-outline', padding: 8,
                title: 'Metas de ahorro',
                description: 'Cada meta muestra el porcentaje alcanzado, cuánto falta, los días que quedan y cuánto deberías apartar por mes para llegar a tiempo. Toca Abonar cada vez que separes dinero para esa meta.',
                emptyHint: 'Todavía no tienes metas. Crea la primera con el botón +.',
            },
            {
                id: 'budget_8', elementId: 'budget_goals_fab', screen: 'budget', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: 'Crear una meta',
                description: 'Define el nombre, el monto objetivo, cuánto ya tienes ahorrado, la moneda y la fecha límite con el calendario. Al completarla pasa a la sección Metas completadas.',
            },
            {
                id: 'budget_9', elementId: 'budget_income_list', screen: 'budget', action: { id: 'budget:setTab', arg: 3 }, scrollKey: 'budget_income', position: 'bottom', icon: 'cash-outline', padding: 8,
                title: 'Tus fuentes de ingreso',
                description: 'Arriba ves tu ingreso base del período: lo que de verdad te pagan tus fuentes base en un mes (los extras como aguinaldo o bono 14 no cuentan). Debajo, cada fuente con su estado: Esperado (aún no llega), Recibido (ya llegó y la app lo reconoció) o Atrasado (pasó la tolerancia). Toca una fuente para editarla. Si tu ingreso real difiere en más de 5% del que declaraste, la app te lo sugiere y lo actualizas con un toque.',
                emptyHint: 'Todavía no tienes fuentes de ingreso. Crea la primera con el botón + de esta pestaña.',
            },
            {
                id: 'budget_10', elementId: 'budget_income_fab', screen: 'budget', scrollKey: 'budget_income', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: 'Crear una fuente de ingreso',
                description: 'Con este botón registras de dónde y cuándo te pagan: nombre, categoría, monto, moneda, cada cuánto (mensual, quincenal, semanal o irregular), el día, la cuenta donde te pagan y si es un ingreso base o un extra. Con un SMS de ejemplo la app aprende a reconocer tu pago sola. Mira el tutorial «Tu sueldo» para el proceso completo.',
            },
        ],
    },

    // ── Estadísticas ──────────────────────────────────────────
    {
        id: 'tutorial_stats', title: 'Estadísticas',
        description: 'Cada indicador de tu economía, explicado.',
        icon: 'bar-chart-outline', color: C.accent,
        steps: [
            {
                id: 'stats_1', elementId: 'stats_filter', screen: 'stats', position: 'bottom', icon: 'calendar-outline', padding: 8,
                title: 'Elige el período',
                description: 'Período Actual sigue tu ciclo de pago; también puedes ver el Período Anterior, Este Año o Todo el historial. Las tarjetas se recalculan con el período elegido, salvo la comparativa de 6 meses, que siempre muestra los últimos seis.',
            },
            {
                id: 'stats_currency', elementId: 'stats_currency', screen: 'stats', position: 'bottom', icon: 'cash-outline', padding: 8,
                title: 'Quetzales o dólares',
                description: 'Si en el período tienes movimientos en dólares, elige Q o $: los cuadros, las gráficas, el ahorro y el aviso de transferencias se calculan solo con esa moneda, sin convertir. Las tarjetas de más abajo siguen en quetzales.',
                emptyHint: 'Aparece cuando tienes movimientos en dólares en el período elegido.',
            },
            {
                id: 'stats_2', elementId: 'stats_quick', screen: 'stats', action: { id: 'stats:setView', arg: 'expense' }, position: 'bottom', icon: 'swap-vertical-outline', padding: 8,
                title: 'Resumen rápido',
                description: 'Ingresos, gastos y ahorro del período. Toca un cuadro para cambiar la gráfica de abajo: INGRESOS muestra de dónde vino tu dinero, GASTOS en qué se fue y AHORRO te explica la cuenta. El cuadro elegido queda resaltado.',
            },
            {
                id: 'stats_transfers', elementId: 'stats_transfers', screen: 'stats', position: 'bottom', icon: 'swap-horizontal-outline', padding: 8,
                title: 'Transferencias sin clasificar',
                description: 'Si hay movimientos con categoría Transferencia que cuentan como gasto o ingreso, la app te avisa: puede que sea dinero entre tus cuentas. El interruptor «Sin transferencias» los quita de esta pantalla mientras tanto, sin borrar nada. Funciona en cualquier período, también en el anterior. Con «Aclarar en el Centro de revisión» eliges a qué cuenta fue y deja de contar.',
                noSmsDescription: 'Si hay movimientos con categoría Transferencia que cuentan como gasto o ingreso, la app te avisa: puede que sea dinero entre tus cuentas. El interruptor «Sin transferencias» los quita de esta pantalla mientras tanto, sin borrar nada. Funciona en cualquier período, también en el anterior. Si fue dinero entre tus cuentas, cambia su categoría en Movimientos o regístralo con «Transferir» en Cuentas.',
                emptyHint: 'Aparece cuando hay movimientos con categoría Transferencia que cuentan como gasto o ingreso en el período elegido.',
            },
            {
                id: 'stats_3', elementId: 'stats_pie', screen: 'stats', action: { id: 'stats:setView', arg: 'expense' }, position: 'bottom', icon: 'pie-chart-outline', padding: 8,
                title: 'Desglose por categoría',
                description: 'Muestra en qué categorías se fue tu dinero (o, con INGRESOS, de dónde vino). Toca una porción o una fila de la leyenda para ver su monto y porcentaje.',
                emptyHint: 'La gráfica muestra un aviso cuando no hay movimientos en la moneda y el período elegidos.',
            },
            {
                id: 'stats_3b', elementId: 'stats_savings', screen: 'stats', action: { id: 'stats:setView', arg: 'savings' }, position: 'bottom', icon: 'wallet-outline', padding: 8,
                title: 'Tu ahorro explicado',
                description: 'Al tocar AHORRO ves la cuenta completa: ingresos menos gastos, tu tasa de ahorro (lo recomendado es al menos el 20 % de tus ingresos), las tres categorías que más pesan y, en palabras simples, por qué tu ahorro sale positivo o negativo.',
            },
            {
                id: 'stats_4', elementId: 'stats_projected', screen: 'stats', position: 'top', icon: 'trending-up-outline', padding: 8,
                title: 'Flujo de caja proyectado',
                description: 'Toma tu gasto promedio diario y lo proyecta hasta el final del período, para que sepas con tiempo si te va a sobrar o faltar dinero. En períodos pasados muestra lo que realmente gastaste.',
            },
            {
                id: 'stats_5', elementId: 'stats_compare', screen: 'stats', position: 'top', icon: 'stats-chart-outline', padding: 8,
                title: 'Comparativa de 6 meses',
                description: 'Barras de gastos e ingresos de los últimos seis meses; la más brillante es el mes actual. Si hay diferencia con el período anterior, ves cuánto subió o bajó tu gasto.',
            },
            {
                id: 'stats_6', elementId: 'stats_accumulated', screen: 'stats', position: 'top', icon: 'diamond-outline', padding: 8,
                title: 'Ahorro acumulado',
                description: 'Ingresos menos gastos registrados, acumulados mes a mes, más tus ahorros externos. No es el saldo de tus cuentas: es la tendencia de lo que vas registrando.',
            },
            {
                id: 'stats_7', elementId: 'stats_daily', screen: 'stats', position: 'top', icon: 'today-outline', padding: 8,
                title: 'Gasto promedio diario',
                description: 'Cuánto gastas por día en promedio frente a tu presupuesto diario ideal (presupuesto del período ÷ días del período; si cobras por quincena o semana, el mensual de Ajustes ya viene repartido). Por encima de 100% vas más rápido de lo planificado.',
            },
            {
                id: 'stats_8', elementId: 'stats_nospend', screen: 'stats', position: 'top', icon: 'shield-checkmark-outline', padding: 8,
                title: 'Días sin gastar',
                description: 'Cuántos días del período no registraste ningún gasto. Más días sin gastar suele significar menos compras impulsivas.',
            },
            {
                id: 'stats_9', elementId: 'stats_banks', screen: 'stats', position: 'top', icon: 'business-outline', padding: 8,
                title: 'Gasto por banco o tarjeta',
                description: 'Cuánto gastaste con cada banco y en cuántas transacciones, para que sepas qué tarjeta usas más.',
                emptyHint: 'Aparece cuando tus gastos tienen banco asignado, por ejemplo los importados por SMS.',
                noSmsEmptyHint: 'Aparece cuando tus gastos tienen banco asignado.',
            },
            {
                id: 'stats_debt', elementId: 'stats_debt', screen: 'stats', position: 'top', icon: 'alert-circle-outline', padding: 8,
                title: 'Ratio deuda / ingreso',
                description: 'Compara lo que pagas cada mes en cuotas de visacuotas y préstamos activos con tu ingreso mensual: el de tus fuentes de ingreso o, si no tienes, el que declaraste. No incluye el consumo de tarjeta que pagas completo cada mes. Verde por debajo del 20 %, ámbar entre 20 % y 40 %, rojo por encima del 40 %. Si venía de lo que declaraste al configurar la app (por ejemplo una deuda tipo tarjeta, que no se convierte en cuota porque sus compras ya son gasto), aparece avisado y puedes quitarlo con «Ya no la tengo».',
                emptyHint: 'Aparece cuando tienes visacuotas o préstamos activos. Agrégalos en Cuentas → Visacuotas.',
            },
            {
                id: 'stats_10', elementId: 'stats_velocity', screen: 'stats', position: 'top', icon: 'speedometer-outline', padding: 8,
                title: 'Velocidad de gasto',
                description: 'Compara lo que llevas gastado en este período con todo el período anterior. Si es positivo, estás gastando más rápido que antes.',
                emptyHint: 'Esta tarjeta solo aparece con el filtro Período Actual.',
            },
            {
                id: 'stats_11', elementId: 'stats_savings_projection', screen: 'stats', position: 'top', icon: 'rocket-outline', padding: 8,
                title: 'Proyección de ahorro',
                description: 'Al final de la pantalla: estima cuánto acumularías en 6 y 12 meses si sigues ahorrando al ritmo promedio de los últimos seis meses. Se basa en tus transacciones registradas, no en el saldo de tus cuentas.',
            },
        ],
    },

    // ── Asesor IA ─────────────────────────────────────────────
    {
        id: 'tutorial_ia', title: 'Asesor IA',
        description: 'Tu CFO personal en modo chat.',
        icon: 'sparkles-outline', color: C.primaryLight,
        steps: [
            {
                id: 'ia_1', elementId: 'advisor_header', screen: 'advisor', position: 'bottom', icon: 'sparkles-outline', padding: 8,
                title: 'Modo del asesor',
                description: 'Modo local entiende tus consultas y órdenes directamente en el teléfono, sin internet ni configuración. Si pegas tu API Key gratuita de aistudio.google.com en Ajustes → Inteligencia Artificial, verás Gemini activo y además podrás conversar de forma abierta.',
            },
            {
                id: 'ia_2', elementId: 'advisor_chat', screen: 'advisor', position: 'bottom', icon: 'chatbubbles-outline', padding: 8,
                title: 'La conversación',
                description: 'El primer mensaje es un diagnóstico de tu situación actual. Cada respuesta usa tus movimientos, cuentas, gastos fijos, presupuestos, metas y visacuotas reales.',
            },
            {
                id: 'ia_3', elementId: 'advisor_suggestions', screen: 'advisor', position: 'top', icon: 'flash-outline', padding: 8,
                title: 'Preguntas sugeridas',
                description: 'Atajos pensados para tu situación del momento. Toca uno para preguntarlo directamente.',
                emptyHint: 'Las sugerencias aparecen cuando el campo de texto está vacío y no hay una respuesta en curso.',
            },
            {
                id: 'ia_actions', elementId: 'advisor_actions', screen: 'advisor', position: 'top', icon: 'flash-outline', padding: 8,
                title: 'Acciones guiadas',
                description: 'Crear meta, Presupuesto, Gasto fijo, Registrar gasto y Consultar te piden los datos paso a paso. Antes de guardar ves una tarjeta para Confirmar, Editar o Cancelar.',
                emptyHint: 'Se ocultan mientras el teclado está abierto.',
            },
            {
                id: 'ia_4', elementId: 'advisor_input', screen: 'advisor', position: 'top', icon: 'chatbubble-ellipses-outline', padding: 8,
                title: 'Escribe una orden o una consulta',
                description: 'Órdenes: «Crea una meta de Q5,000 para una laptop en diciembre», «Ponle un límite de Q800 a Restaurantes», «Agrega Netflix de $15.99 el 5 de cada mes», «Gasté 85 en gasolina ayer». Consultas: «¿Cuánto gasté en Restaurantes este período?» o «¿Qué gastos fijos me faltan por pagar?». Toda escritura se confirma con la tarjeta y después se puede deshacer. También puedes pedir consejos, como ¿puedo comprarme un celular de Q3,000?',
            },
            {
                id: 'ia_5', elementId: 'advisor_clear', screen: 'advisor', position: 'bottom', icon: 'refresh-outline', padding: 8,
                title: 'Reiniciar el chat',
                description: 'Borra la conversación y genera un diagnóstico nuevo con tus datos actualizados. Tus datos financieros no se tocan.',
            },
        ],
    },

    // ── Cuentas y Visacuotas ──────────────────────────────────
    {
        id: 'tutorial_cuentas', title: 'Cuentas y Visacuotas',
        description: 'Saldos reales, transferencias y compras en cuotas.',
        icon: 'business-outline', color: C.primary,
        steps: [
            {
                id: 'acc_1', elementId: 'accounts_header', screen: 'accounts', position: 'bottom', icon: 'business-outline', padding: 8,
                title: 'Tu dinero real',
                description: 'Registra aquí efectivo, cuentas bancarias, tarjetas de crédito, ahorros e inversiones. El saldo es opcional: en las cuentas que lo llevan la app calcula tu patrimonio; si una cuenta no lleva saldo, solo registra tus gastos. Este módulo se abre desde el widget Cuentas del Inicio.',
            },
            {
                id: 'acc_2', elementId: 'accounts_summary', screen: 'accounts', position: 'bottom', icon: 'pie-chart-outline', padding: 8,
                title: 'Resumen de patrimonio',
                description: 'Tus activos en quetzales (los dólares se convierten con el tipo de cambio de Ajustes), lo que te falta pagar en visacuotas y tu saldo neto por moneda.',
            },
            {
                id: 'acc_3', elementId: 'accounts_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'wallet-outline', padding: 8,
                title: 'Tus cuentas',
                description: 'Cada cuenta muestra su tipo, banco y saldo si lo lleva: «Sin saldo» cuando no lo lleva y la etiqueta «Automático» cuando la app lo suma y resta sola con tus movimientos. En «Manual» el saldo solo cambia cuando lo editas o cuando haces una transferencia o un pago de tarjeta en la app; en las demás cuentas, asignar una cuenta a un gasto o ingreso solo organiza tus movimientos. Toca el lápiz (o mantén presionada la cuenta) para editarla y usa la papelera para eliminarla. En las tarjetas de crédito ves el día de corte, el de pago, la cuota mensual de sus visacuotas y, en su detalle, el «Estado al corte» (lo que debes pagar, en quetzales y dólares por separado, con la fecha límite de pago y si está pendiente, parcial, pagado o vencido) y el «Ciclo abierto»: lo que llevas gastado desde el último corte. El ciclo abierto se ve también sin SMS: la tarjeta funciona con gastos anotados a mano. Cada moneda se paga en su moneda.',
                emptyHint: 'Todavía no tienes cuentas. Crea la primera con el botón +.',
            },
            {
                id: 'acc_4', elementId: 'accounts_fab', screen: 'accounts', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: 'Agregar una cuenta',
                description: 'Elige el tipo, el nombre, el banco, la moneda y cómo llevar el saldo: «Sin seguimiento», «Manual» o «Automático» (mira «Saldos y transferencias» en la ayuda). En las tarjetas de crédito indica el día de corte, que es la fecha de «Saldo al corte» de tu estado de cuenta (ese día todavía entra en el estado y el ciclo nuevo empieza al día siguiente), y el día de pago. También puedes elegir la «Cuenta con la que pagas» de la tarjeta: de ahí sale el dinero cuando la pagas.',
            },
            {
                id: 'acc_5', elementId: 'accounts_transfer_btn', screen: 'accounts', position: 'bottom', icon: 'swap-horizontal-outline', padding: 8,
                title: 'Transferir entre mis cuentas',
                description: 'Mueve dinero entre tus cuentas, por ejemplo de BAC a efectivo: eliges origen y destino, el monto y la fecha. No cuenta como gasto ni ingreso, y no te pide saldo suficiente: si una cuenta lleva saldo se ajusta (en «Automático» se calcula sola) y si no lo lleva solo queda el registro. Si las monedas son distintas la app sugiere lo que recibe el destino con el tipo de cambio de Ajustes y lo puedes corregir. Si eliges una tarjeta como destino, te lleva a «Registrar pago». Si el SMS del banco ya llegó, la transferencia se une a él en vez de duplicarse. La transferencia queda registrada en Movimientos. Necesitas al menos dos cuentas que no sean tarjeta de crédito.',
                emptyHint: 'Necesitas al menos dos cuentas que no sean tarjeta de crédito para transferir. Crea la segunda con el botón +.',
            },
            {
                id: 'acc_6', elementId: 'accounts_tabs', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'installments' }, position: 'bottom', icon: 'layers-outline', padding: 8,
                title: 'Visacuotas',
                description: 'En esta pestaña registras compras a cuotas con tarjeta (o un préstamo sin tarjeta). En cada corte de la tarjeta la app carga UNA cuota como gasto en tu período; no la compra completa.',
            },
            {
                id: 'acc_7', elementId: 'accounts_inst_list', screen: 'accounts', position: 'top', icon: 'card-outline', padding: 8,
                title: 'Seguimiento de cuotas',
                description: 'Cada visacuota muestra la cuota mensual, cuántas se cargaron, cuántas faltan, la fecha de la «Próxima cuota» (el corte en que entra) y el mes en que terminas. Cada cuota se carga como gasto en el corte en que entra, no la compra completa. Con el lápiz la editas y con la papelera la eliminas (las cuotas que ya se cargaron como gasto se quedan en Movimientos). También puedes convertir un gasto existente en visacuota desde su detalle en Movimientos.',
                emptyHint: 'Todavía no tienes visacuotas. Agrega una con el botón +.',
            },
            {
                id: 'acc_8', elementId: 'accounts_fab', screen: 'accounts', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: 'Agregar una visacuota',
                description: 'Indica la tarjeta (o «Sin tarjeta (préstamo)» con su día de pago), el monto total, la cuota mensual, el número de cuotas, las que ya pagaste y la fecha de la compra: la primera cuota entra en el primer corte desde esa fecha. Un préstamo sin tarjeta carga su cuota en su día de pago; si el SMS del débito ya llegó (mismo monto, a menos de 3 días de ese día), ese SMS es la cuota y no se cuenta dos veces. Los préstamos y visacuotas que registraste al configurar la app empiezan en su próximo día de pago.',
            },
        ],
    },

    // ── Cómo funcionan las visacuotas (tutorial de proceso) ───
    {
        id: 'tutorial_visacuotas', title: 'Cómo funcionan las visacuotas',
        description: 'La tarjeta con su corte, la compra en cuotas y el cargo de cada cuota.',
        icon: 'layers-outline', color: C.primary,
        steps: [
            {
                id: 'vis_1', elementId: 'accounts_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'card-outline', padding: 8,
                requires: 'credit_card',
                title: '1. La tarjeta con su día de corte',
                description: 'Primero tiene que existir la tarjeta en Cuentas, con su día de corte (la fecha de «Saldo al corte» de tu estado de cuenta: ese día todavía entra en el estado y el ciclo nuevo empieza al día siguiente) y su día de pago. Si la agregaste al configurar la app, ahí pudiste poner el corte y el pago; si no, toca el lápiz de la tarjeta en Cuentas (o el aviso «Configurar» de la tarjeta, o el ítem «Configurar corte y pago de tus tarjetas» de la guía del Inicio). Con el corte la app sabe en qué ciclo cae cada cuota. Si tu estado trae dos saldos (quetzales y dólares), cada moneda se cuenta aparte.',
                emptyHint: 'Todavía no tienes tarjetas. Crea la primera con el botón +.',
            },
            {
                id: 'vis_2', elementId: 'accounts_fab', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'installments' }, position: 'top', icon: 'add-circle-outline', padding: 8,
                title: '2. La compra en cuotas',
                description: 'La compra en cuotas llega de dos formas: la app la detecta sola cuando el banco te manda el SMS de «compra a cuotas», o la registras tú con el botón +: tarjeta, monto total, cuota mensual, número de cuotas, las que ya pagaste y la fecha de la compra. Si es un préstamo sin tarjeta, elige «Sin tarjeta (préstamo)» y su día de pago.',
                noSmsDescription: 'La compra en cuotas la registras con el botón +: tarjeta, monto total, cuota mensual, número de cuotas, las que ya pagaste y la fecha de la compra. Si es un préstamo sin tarjeta, elige «Sin tarjeta (préstamo)» y su día de pago.',
            },
            {
                id: 'vis_3', elementId: 'accounts_inst_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'installments' }, position: 'top', icon: 'calendar-outline', padding: 8,
                title: '3. Cada corte carga una cuota',
                description: 'En cada corte de la tarjeta la app registra UNA cuota como gasto, fechado el día del corte y en la categoría de la visacuota: así tu período solo suma lo que de verdad te cargan cada mes, no la compra completa. Si la app estuvo cerrada varios cortes, al abrirla pone al día todas las cuotas de una vez. Si ya tenías ese gasto por SMS, se marca como la cuota en vez de duplicarse. Si borras una cuota de Movimientos, no se vuelve a crear.',
                emptyHint: 'Todavía no tienes visacuotas. Agrega una con el botón +.',
            },
            {
                id: 'vis_4', elementId: 'accounts_inst_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'installments' }, position: 'top', icon: 'checkmark-done-outline', padding: 8,
                title: '4. La última cuota',
                description: 'La visacuota muestra cuántas cuotas se cargaron y la «Próxima cuota». Al cargarse la última, la visacuota termina sola y deja de mostrarse en esta lista; las cuotas ya cargadas se quedan en Movimientos como historial. Si la eliminas antes, también se conservan.',
                emptyHint: 'Todavía no tienes visacuotas. Agrega una con el botón +.',
            },
        ],
    },

    // ── Registrar una compra con tarjeta (tutorial de proceso) ─
    {
        id: 'tutorial_compra_tarjeta', title: 'Registrar una compra con tarjeta',
        description: 'La tarjeta con su corte, el gasto y dónde aparece su cargo.',
        icon: 'card-outline', color: C.primary,
        steps: [
            {
                id: 'cc_1', elementId: 'accounts_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'card-outline', padding: 8,
                requires: 'credit_card',
                title: '1. Crea la tarjeta con su corte y su pago',
                description: 'Primero tiene que existir la tarjeta en Cuentas (botón +, tipo «Tarjeta Crédito»), con su día de corte (la fecha de «Saldo al corte» de tu estado de cuenta) y su día de pago. Si la agregaste al configurar la app, ahí pudiste poner el corte y el pago; si no, toca el lápiz de la tarjeta en Cuentas (o el aviso «Configurar» de la tarjeta, o el ítem «Configurar corte y pago de tus tarjetas» de la guía del Inicio). Sin la tarjeta no hay a dónde vincular la compra.',
                emptyHint: 'Todavía no tienes tarjetas. Crea la primera con el botón +.',
            },
            {
                id: 'cc_2', elementId: 'add_header', screen: 'add', position: 'bottom', icon: 'add-circle-outline', padding: 8,
                title: '2. Registra el gasto o deja que el SMS lo detecte',
                description: 'Anota la compra aquí como cualquier gasto. Para que cuente en la tarjeta, abre el movimiento en Movimientos y en «Cuenta» elige esa tarjeta. Si tienes los SMS activos y la tarjeta tiene su vínculo, el SMS de compra del banco se registra solo y se vincula a la tarjeta sin que hagas nada.',
                noSmsDescription: 'Anota la compra aquí como cualquier gasto. Para que cuente en la tarjeta, abre el movimiento en Movimientos y en «Cuenta» elige esa tarjeta.',
            },
            {
                id: 'cc_3', elementId: 'accounts_card_cycle', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'sync-outline', padding: 8,
                requires: 'card_dates',
                title: '3. El cargo aparece en «Ciclo abierto»',
                description: 'La compra se suma en «Ciclo abierto» de esa tarjeta: lo gastado desde el último corte, en quetzales y dólares por separado. Al llegar el corte pasa a ser el «Estado al corte» que tienes que pagar. Esto funciona también con gastos anotados a mano, no hace falta tener SMS.',
                emptyHint: 'Cuando una tarjeta tenga cargos verás aquí su «Ciclo abierto».',
            },
        ],
    },

    // ── Pagar la tarjeta (tutorial de proceso) ────────────────
    {
        id: 'tutorial_pago_tarjeta', title: 'Pagar la tarjeta',
        description: 'La cuenta pagadora, el monto del estado y el registro del pago.',
        icon: 'cash-outline', color: C.primary,
        steps: [
            {
                id: 'pt_1', elementId: 'accounts_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'wallet-outline', padding: 8,
                requires: 'credit_card',
                title: '1. La cuenta con la que pagas',
                description: 'Edita la tarjeta (lápiz) y elige «Cuenta con la que pagas»: de ahí sale el dinero. Por ejemplo: te pagan en un banco, transfieres a tu cuenta pagadora y pagas la tarjeta desde ahí. Con eso la app sabe de dónde sale cada pago.',
                emptyHint: 'Todavía no tienes tarjetas. Crea la primera con el botón +.',
            },
            {
                id: 'pt_2', elementId: 'accounts_card_statement', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'document-text-outline', padding: 8,
                requires: 'card_dates',
                title: '2. Lo que debes pagar',
                description: 'En el detalle de la tarjeta, «Estado al corte» muestra lo que debes en quetzales y en dólares (se pagan por separado), la fecha límite y si está pendiente, parcial, pagado o vencido. «Estimado» es la suma de los cargos de la tarjeta en ese ciclo: el banco no manda el total por SMS (llega por correo), así que el monto exacto lo escribes tú.',
                emptyHint: 'Cuando una tarjeta tenga estado verás aquí lo que debes pagar.',
            },
            {
                id: 'pt_3', elementId: 'accounts_card_actions', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'create-outline', padding: 8,
                requires: 'credit_card',
                title: '3. Monto real (opcional)',
                description: 'Con «Ingresar monto real» escribes lo que dice tu estado de cuenta, uno por cada moneda. Si lo dejas vacío se usa el estimado. Cuando lo escribes, la etiqueta cambia a «Del estado de cuenta».',
                emptyHint: 'Cuando una tarjeta tenga estado verás aquí sus botones.',
            },
            {
                id: 'pt_4', elementId: 'accounts_card_actions', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'card-outline', padding: 8,
                requires: 'credit_card',
                title: '4. Registra el pago o deja que el SMS lo detecte',
                description: '«Registrar pago» precarga lo que falta por moneda; puedes pagar solo una parte, cambiar la fecha y elegir la cuenta de origen. Si el banco manda el SMS del pago, la app lo empareja sola con la salida de tu cuenta pagadora (mismo monto, hasta 36 horas) o te pregunta «¿Es el pago de tu tarjeta?» en el Centro de revisión.',
                noSmsDescription: '«Registrar pago» precarga lo que falta por moneda; puedes pagar solo una parte, cambiar la fecha y elegir la cuenta de origen. Lo que falta sigue pendiente hasta que lo pagues.',
                emptyHint: 'Cuando una tarjeta tenga estado verás aquí sus botones.',
            },
            {
                id: 'pt_5', elementId: 'accounts_card_statement', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'shield-checkmark-outline', padding: 8,
                requires: 'credit_card',
                title: '5. No es un gasto nuevo',
                description: 'Pagar la tarjeta es una transferencia de tu cuenta a la tarjeta: no suma a tus gastos del período ni se cuenta dos veces, porque cada compra ya contó cuando la hiciste con la tarjeta. Al pagar todo, el estado queda «Pagado»; si pasa la fecha límite sin pagar, «Vencido».',
                emptyHint: 'Cuando una tarjeta tenga estado verás aquí si está pagado o vencido.',
            },
        ],
    },

    // ── Gasto fijo con cuenta o tarjeta (tutorial de proceso) ─
    {
        id: 'tutorial_fijo_cuenta', title: 'Gasto fijo con cuenta o tarjeta',
        description: 'La cuenta o tarjeta, el gasto fijo y a dónde va el pago.',
        icon: 'card-outline', color: C.primary,
        steps: [
            {
                id: 'fxa_1', elementId: 'accounts_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'wallet-outline', padding: 8,
                requires: 'any_account',
                title: '1. Crea la cuenta o la tarjeta',
                description: 'Primero tiene que existir en Cuentas la cuenta o tarjeta de donde sale el pago (si es tarjeta, con su día de corte y de pago).',
                emptyHint: 'Todavía no tienes cuentas ni tarjetas. Crea la primera con el botón +.',
            },
            {
                id: 'fxa_2', elementId: 'budget_fixed_fab', screen: 'budget', action: { id: 'budget:setTab', arg: 0 }, position: 'top', icon: 'add-circle-outline', padding: 8,
                title: '2. Elige la cuenta en el gasto fijo',
                description: 'Crea el gasto con el botón + (o mantén presionado uno que ya tengas) y en «Cuenta o tarjeta» elige de dónde sale el pago.',
            },
            {
                id: 'fxa_3', elementId: 'budget_fixed_list', screen: 'budget', scrollKey: 'budget_fixed', position: 'top', icon: 'checkbox-outline', padding: 8,
                title: '3. Márcalo pagado o deja que el SMS lo detecte',
                description: 'Con AUTO, al marcarlo pagado el movimiento queda en esa cuenta: si es tarjeta entra a su «Ciclo abierto»; si la cuenta lleva saldo automático, lo resta. Si llega el SMS del banco con el mismo nombre, cualquier día del mismo período, la app lo marca pagado sola; si viene de otra cuenta, te lo pregunta en el Centro de revisión. Si ya lo habías marcado a mano, el SMS se une a tu registro y no se cuenta dos veces.',
                noSmsDescription: 'Con AUTO, al marcarlo pagado el movimiento queda en esa cuenta: si es tarjeta entra a su «Ciclo abierto»; si la cuenta lleva saldo automático, lo resta.',
                emptyHint: 'Todavía no tienes gastos fijos. Agrega el primero con el botón + de esta pestaña.',
            },
        ],
    },

    // ── Llevar el saldo de tus cuentas (tutorial de proceso) ──
    {
        id: 'tutorial_saldos', title: 'Llevar el saldo de tus cuentas',
        description: 'El saldo es opcional: elige cómo llevarlo, cómo se mueve con tus transferencias y cómo ajustarlo.',
        icon: 'analytics-outline', color: C.primary,
        steps: [
            {
                id: 'sal_1', elementId: 'accounts_balance', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'options-outline', padding: 8,
                requires: 'bank_account',
                title: '1. Elige cómo llevar el saldo',
                description: 'El saldo es opcional. Al crear o editar una cuenta (lápiz), en «Saldo» eliges: «Sin seguimiento» (la app solo registra tus gastos e ingresos), «Manual» (tú escribes el saldo) o «Automático» (la app suma y resta sola cada movimiento). Sin saldos, la app es solo un registrador de gastos. Las tarjetas arrancan en «Sin seguimiento».',
                emptyHint: 'Todavía no tienes cuentas. Crea la primera con el botón +.',
            },
            {
                id: 'sal_2', elementId: 'accounts_balance', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'flag-outline', padding: 8,
                requires: 'bank_account',
                title: '2. El saldo de partida',
                description: 'En «Automático» escribes el «Saldo de partida»: lo que tiene la cuenta hoy, o en la fecha que elijas. Desde ahí la app suma tus ingresos y resta tus gastos. Si lo dejas vacío usa el saldo actual de la cuenta con la fecha de hoy. Los movimientos anteriores a esa fecha no cuentan: ya están dentro del saldo.',
                emptyHint: 'Todavía no tienes cuentas. Crea la primera con el botón +.',
            },
            {
                id: 'sal_3', elementId: 'accounts_transfer_btn', screen: 'accounts', position: 'bottom', icon: 'swap-horizontal-outline', padding: 8,
                requires: 'bank_account',
                title: '3. Los movimientos y las transferencias lo mueven solos',
                description: 'Ejemplo: te cae el sueldo en Banrural (suma en Banrural), transfieres a BAC (resta en Banrural y suma en BAC) y pagas la tarjeta desde BAC (resta en BAC; la tarjeta no lleva saldo). Ni la transferencia ni el pago de la tarjeta cuentan como gasto: solo cuentan las compras con la tarjeta, el día que las hiciste. Con «Transferir» puedes registrarla antes o después de que llegue el SMS del banco, y la app no la duplica.',
                noSmsDescription: 'Ejemplo: te cae el sueldo en Banrural (suma en Banrural), transfieres a BAC (resta en Banrural y suma en BAC) y pagas la tarjeta desde BAC (resta en BAC; la tarjeta no lleva saldo). Ni la transferencia ni el pago de la tarjeta cuentan como gasto: solo cuentan las compras con la tarjeta, el día que las hiciste. Cada transferencia la registras tú con «Transferir».',
                emptyHint: 'Necesitas al menos dos cuentas que no sean tarjeta de crédito para transferir. Crea la segunda con el botón +.',
            },
            {
                id: 'sal_4', elementId: 'accounts_adjust_btn', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'analytics-outline', padding: 8,
                requires: 'bank_account',
                title: '4. Ajustar al saldo real',
                description: 'Si el saldo de la app no coincide con tu banco, toca «Ajustar al saldo real» en la cuenta y escribe el saldo que ves en tu banco: desde ese momento la app sigue sumando y restando. Si tus SMS traen el saldo, al editar la cuenta ves «Según tu banco (SMS)» con el botón «Usar este saldo».',
                noSmsDescription: 'Si el saldo de la app no coincide con tu banco, toca «Ajustar al saldo real» en la cuenta y escribe el saldo que ves en tu banco: desde ese momento la app sigue sumando y restando.',
                emptyHint: 'El botón aparece en las cuentas con saldo «Automático». Cambia una cuenta a «Automático» desde su lápiz.',
            },
            {
                id: 'sal_5', elementId: 'accounts_transfer_btn', screen: 'accounts', position: 'bottom', icon: 'help-circle-outline', padding: 8,
                title: '5. ¿A qué cuenta fue?',
                description: 'Si el banco manda solo uno de los dos SMS de una transferencia, el Centro de revisión te pregunta «¿A qué cuenta fue?» con tus cuentas como opciones (o «A otra persona» / «Ingreso externo» si no es tuya). Elegida la cuenta, deja de contar como gasto o ingreso. Solo pregunta si tienes dos cuentas que no sean tarjeta. Las preguntas no caducan: también salen las del período anterior. Si el SMS nunca llega, regístrala tú con «Transferir».',
                noSmsDescription: 'Sin SMS, cada transferencia la registras tú con «Transferir»: eliges origen, destino, monto y fecha, y la app mueve los saldos de las cuentas que los llevan.',
                emptyHint: 'Necesitas al menos dos cuentas que no sean tarjeta de crédito para transferir. Crea la segunda con el botón +.',
            },
        ],
    },

    // ── Widget de la pantalla de inicio (solo Android) ────────
    {
        id: 'tutorial_widget', title: 'Widget en tu pantalla de inicio',
        description: 'Mira cómo vas sin abrir la app: agregarlo, qué muestra, el ojo y «+ gasto».',
        icon: 'apps-outline', color: C.accent, androidOnly: true,
        steps: [
            {
                id: 'wid_1', position: 'center', icon: 'add-circle-outline',
                title: '1. Agrégalo desde tu teléfono',
                description: 'Mantén presionado un espacio vacío de la pantalla de inicio de tu teléfono, toca «Widgets», busca «BudgetMaster», elige el tamaño (pequeño 2×2 o mediano 4×2) y arrástralo. Abre la app al menos una vez para que cargue tus cifras.',
            },
            {
                id: 'wid_2', position: 'center', icon: 'speedometer-outline',
                title: '2. Qué muestra',
                description: 'El pequeño: lo disponible del período y los días al cobro (con ingresos irregulares no hay cobro: dice cuántos días quedan del mes). El mediano: lo disponible por día, la barra del presupuesto, el próximo pago de tarjeta (fecha y monto, «estimado» si todavía no escribiste el estado de cuenta real), el próximo gasto fijo, el semáforo de capacidad de pago y los saldos de tus cuentas con seguimiento. Los montos grandes se abrevian (por ejemplo Q 12.4k) y en los saldos ves tu primera cuenta y cuántas más tienes. Son las mismas cifras del Inicio y se actualizan cuando abres la app o registras algo. Aunque no abras la app, los días al cobro bajan solos cada día; pero cuando llega tu día de cobro el widget deja de mostrar las cifras del período anterior y dice «Abre la app para actualizar» hasta que la abras.',
            },
            {
                id: 'wid_3', position: 'center', icon: 'eye-off-outline',
                title: '3. El ojo: ocultar o ver los montos',
                description: 'Por defecto los montos salen ocultos (••••) para que nadie los vea de reojo. Toca el ojo del widget para verlos y tócalo otra vez para ocultarlos. Los días, el porcentaje del presupuesto, las fechas y el semáforo se ven siempre. Ojo: Cualquiera con acceso a tu pantalla de inicio puede tocar el ojo y ver los montos; la huella no protege el widget. Si no quieres que nadie los vea, deja el ojo cerrado o quita el widget.',
            },
            {
                id: 'wid_4', position: 'center', icon: 'add-outline',
                title: '4. «+ gasto»',
                description: 'El botón «+ gasto» del widget abre BudgetMaster directo en la pestaña Agregar para anotar un gasto al instante, también si la app ya estaba abierta o en segundo plano (cada toque te lleva a Agregar sin abrir otra copia de la app). Si tienes la seguridad biométrica activada, la app te la pide primero. Si todavía no terminaste la configuración inicial, el toque se ignora: termínala primero.',
            },
        ],
    },

    // ── Ajustes ───────────────────────────────────────────────
    {
        id: 'tutorial_ajustes', title: 'Ajustes',
        description: 'Perfil, presupuesto, tipo de cambio, seguridad y más.',
        icon: 'settings-outline', color: C.primary,
        steps: [
            {
                id: 'set_1', elementId: 'settings_profile', screen: 'settings', position: 'bottom', icon: 'person-circle-outline', padding: 8,
                title: 'Tu perfil',
                description: 'El nombre con el que la app y el asesor te saludan.',
            },
            {
                id: 'set_7', elementId: 'settings_sms', screen: 'settings', position: 'bottom', icon: 'chatbubble-outline', padding: 8,
                title: 'Sincronización SMS',
                description: 'Este interruptor activa o desactiva la lectura de SMS bancarios de BAC, BANRURAL, GTC, BANTRAB y PROMERICA. Apagado, la app oculta la lectura de SMS (sincronización, «Elegir de mis SMS» y sus avisos), pero «Pegar SMS» en Agregar sigue disponible; tus movimientos ya importados se conservan. Con «Sincronizar al abrir la app» activado, la sincronización corre sola al abrir la app (como máximo cada 15 minutos) y solo lee los mensajes nuevos (nunca pide permisos por su cuenta). Abajo puedes sincronizar 3 meses completos, deshacer la última sincronización y revisar pendientes. Disponible solo en Android.',
                noSmsDescription: 'Activa este interruptor para mostrar la sincronización de SMS bancarios (BAC, BANRURAL, GTC, BANTRAB y PROMERICA). Mientras esté apagado, la app oculta la lectura de SMS (sincronización y «Elegir de mis SMS»), pero «Pegar SMS» en Agregar sigue disponible; tus movimientos ya importados se conservan.',
            },
            {
                id: 'set_2', elementId: 'settings_budget', screen: 'settings', position: 'bottom', icon: 'wallet-outline', padding: 8,
                title: 'Presupuesto mensual',
                description: 'Lo máximo que planeas gastar al mes, en quetzales. Si cobras por quincena o por semana, la app lo reparte por período (debajo del monto ves cuánto toca por período). Con ese presupuesto del período se calculan el anillo del Inicio, las alertas, el presupuesto diario ideal y parte de tu score. El equivalente en dólares se calcula solo con el tipo de cambio; si prefieres, puedes fijarlo a mano.',
            },
            {
                id: 'set_period', elementId: 'settings_period', screen: 'settings', position: 'bottom', icon: 'calendar-outline', padding: 8,
                title: 'Ingresos y período',
                description: 'Muestra tu día de pago y el período actual. «Mis fuentes de ingreso» te lleva a Presupuesto → Ingresos. En «Ciclo de pago» cambias el ciclo (mensual, quincenal, semanal o irregular) y el día (o los dos días) de pago; con ciclo semanal eliges el día de la semana en que te pagan y la semana arranca ese día. Se guardan con su propio botón; cambiar el día mueve tu período, y lo que fijaste a mano en un período anterior se conserva. «Cuándo empieza mi período» abre el detalle: de dónde sale el inicio (tu sueldo, un fin de semana o feriado, o lo que fijaste a mano), las fechas para elegir otro inicio y las reglas de fin de semana, feriados, tolerancia y sueldo adelantado. Esos cambios se guardan con los botones del propio detalle, no con Guardar Cambios.',
            },
            {
                id: 'set_3', elementId: 'settings_currency', screen: 'settings', position: 'bottom', icon: 'cash-outline', padding: 8,
                title: 'Moneda principal',
                description: 'La moneda que usas en tu día a día. Es la que aparece seleccionada por defecto al registrar un movimiento.',
            },
            {
                id: 'set_4', elementId: 'settings_rate', screen: 'settings', position: 'top', icon: 'swap-horizontal-outline', padding: 8,
                title: 'Tipo de cambio',
                description: 'Cuántos quetzales vale un dólar. Se actualiza solo desde el Banco de Guatemala, o desde un servicio de respaldo, cada 6 horas. Sin internet se usa el último valor guardado. Si lo editas a mano queda fijo hasta que toques Volver a automático.',
            },
            {
                id: 'set_5', elementId: 'settings_savings', screen: 'settings', position: 'top', icon: 'business-outline', padding: 8,
                title: 'Ahorros externos',
                description: 'Dinero que tienes fuera de la app, por ejemplo un plazo fijo. Cuenta en tu patrimonio solo cuando ninguna de tus cuentas lleva saldo (entonces el patrimonio es un estimado: estos ahorros más tus ingresos menos tus gastos); si alguna cuenta lleva saldo, el patrimonio sale solo de esas cuentas y estos ahorros no se suman. Los quetzales también cuentan en la proyección de ahorro de Estadísticas.',
            },
            {
                id: 'set_6', elementId: 'settings_biometric', screen: 'settings', position: 'top', icon: 'finger-print-outline', padding: 8,
                title: 'Seguridad biométrica',
                description: 'Pide huella o reconocimiento facial cada vez que se abre la app.',
                emptyHint: 'Esta opción aparece si tu teléfono tiene huella o reconocimiento facial configurado.',
            },
            {
                id: 'set_8', elementId: 'settings_gemini', screen: 'settings', position: 'top', icon: 'sparkles-outline', padding: 8,
                title: 'Gemini (opcional)',
                description: 'Pega tu API Key gratuita de aistudio.google.com para que el Asesor responda en lenguaje natural. Sin clave, el asesor funciona igual en modo local.',
            },
            {
                id: 'set_notif', elementId: 'settings_notifications', screen: 'settings', position: 'top', icon: 'notifications-outline', padding: 8,
                title: 'Notificaciones',
                description: 'Elige qué avisos recibir: gastos fijos, pago y corte de tarjeta, última visacuota, deudas, llegada del sueldo, capacidad de pago, fin de período, resumen diario y semanal, alertas de presupuesto y recordatorio del Asesor IA. Ya no hay un aviso por cada gasto: el resumen diario los junta en uno solo. También fijas la hora de los recordatorios, las horas silenciosas (dentro de ellas no suena nada y el aviso se mueve a cuando terminan) y el máximo de avisos por día. «Enviar aviso de prueba» te manda uno en unos segundos para comprobar que funcionan. Se guardan con el botón del propio detalle, no con Guardar Cambios. El permiso del sistema te lo pide la app al terminar la configuración inicial; si lo negaste, actívalo en los ajustes del teléfono.',
            },
            {
                id: 'set_9', elementId: 'settings_categories', screen: 'settings', position: 'top', icon: 'pricetag-outline', padding: 8,
                title: 'Mis categorías',
                description: 'Crea categorías propias con nombre, color, ícono y tipo (gastos, ingresos o ambos). Aparecen al registrar movimientos y en Presupuesto, y se guardan al crearlas. También puedes crearlas al vuelo con «+ Nueva categoría» al registrar o editar un movimiento. Para cambiar el nombre, el color, el ícono o el tipo de una categoría propia, tócala aquí en Ajustes; el basurero la elimina.',
            },
            {
                id: 'set_10', elementId: 'settings_academy', screen: 'settings', position: 'top', icon: 'school-outline', padding: 8,
                title: 'Academia',
                description: 'Abre cualquier tutorial o reinícialos todos. Recuerda que cada módulo tiene su botón ? en el encabezado.',
            },
            {
                id: 'set_11', elementId: 'settings_save', screen: 'settings', position: 'top', icon: 'save-outline', padding: 8,
                title: 'Guardar cambios',
                description: 'Los cambios de perfil, presupuesto, moneda, tipo de cambio, ahorros, SMS, biometría y Gemini se aplican al tocar Guardar Cambios.',
                noSmsDescription: 'Los cambios de perfil, presupuesto, moneda, tipo de cambio, ahorros, biometría y Gemini se aplican al tocar Guardar Cambios.',
            },
            {
                id: 'set_12', elementId: 'settings_danger', screen: 'settings', position: 'top', icon: 'warning-outline', padding: 8,
                title: 'Zona de peligro',
                description: 'Borra todos tus datos del teléfono de forma permanente. La app te pide confirmación antes de hacerlo. También reinicia tus tutoriales (el recorrido inicial vuelve a arrancar solo cuando termines la configuración inicial) y vacía el widget de la pantalla de inicio, que dice «Abre BudgetMaster…» hasta que vuelvas a configurar la app.',
            },
        ],
    },
];
