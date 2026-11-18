import AsyncStorage from '@react-native-async-storage/async-storage';
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
}

// ─────────────────────────────────────────────────────────────
// TUTORIALES
// ─────────────────────────────────────────────────────────────
export const TUTORIALS: Tutorial[] = [

    // ── Tour inicial ──────────────────────────────────────────
    {
        id: 'tour_inicial', title: 'Tour Inicial',
        description: 'Conocé BudgetMaster paso a paso.',
        icon: 'rocket-outline', color: C.primary,
        steps: [
            {
                id: 'tour_1', elementId: 'briefing_card', screen: 'dashboard', position: 'bottom', icon: 'sparkles-outline', padding: 12,
                title: 'Tu CFO Personal',
                description: 'Esta tarjeta es tu briefing diario: analiza tus movimientos y te da un resumen cada vez que abrís la app. Funciona sin configurar nada; si agregás tu API Key de Gemini en Ajustes, el análisis es más detallado.',
            },
            {
                id: 'tour_2', elementId: 'score_card', screen: 'dashboard', position: 'bottom', icon: 'shield-checkmark-outline', padding: 12,
                title: 'Score Financiero',
                description: 'Tu puntuación del 0 al 100, calculada con los movimientos que registrás en el mes actual: cuánto ahorrás, si te mantenés dentro del presupuesto y si pagaste tus gastos fijos. Si todavía no registraste movimientos, el número aún no refleja tu situación real.',
            },
            {
                id: 'tour_3', elementId: 'sync_btn', screen: 'dashboard', position: 'bottom', icon: 'sync-circle-outline', padding: 16, requiresSms: true,
                title: 'Sync SMS',
                description: 'Este botón lee tus SMS bancarios (BAC, BANRURAL, GTC, BANTRAB, PROMERICA) y registra tus gastos automáticamente. La primera vez Android te pedirá permiso para leer SMS: sin ese permiso no se puede sincronizar. Solo funciona en Android.',
            },
            {
                id: 'tour_4', elementId: 'tab_add', position: 'top', icon: 'add-circle-outline', padding: 12,
                title: 'Agregar Transacción',
                description: 'El botón cobre central abre la pantalla para registrar gastos e ingresos a mano. Ahí también podés pegar el texto de un SMS bancario para que la app complete los datos sola.',
                noSmsDescription: 'El botón cobre central abre la pantalla para registrar gastos e ingresos a mano.',
            },
            {
                id: 'tour_5', elementId: 'tab_budget', position: 'top', icon: 'wallet-outline', padding: 8,
                title: 'Presupuesto',
                description: 'Aquí planificás tu mes — gastos fijos, límites por categoría, metas de ahorro y tus fuentes de ingreso (de dónde y cuándo te pagan). Es donde convertís tus intenciones en un plan real.',
            },
            {
                id: 'tour_6', elementId: 'tab_advisor', position: 'top', icon: 'sparkles-outline', padding: 8,
                title: 'Asesor IA',
                description: 'Tu CFO en modo chat. Preguntale lo que quieras: ¿puedo comprarme X?, ¿cómo voy este mes?, ¿qué hago con este excedente? Responde con tus datos locales, y con Gemini lo hace en lenguaje natural.',
            },
            {
                id: 'tour_7', elementId: 'tab_settings', position: 'top', icon: 'settings-outline', padding: 8,
                title: 'Ajustes y Academia',
                description: 'Configurá tu perfil, presupuesto, moneda, tipo de cambio y la API Key de Gemini. Cada módulo tiene un botón ? en su encabezado que abre su propio tutorial, y en Ajustes → Academia encontrás todos juntos.',
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
                description: 'Arriba ves tu nombre, el período actual y en qué día del período estás. El período sigue el ciclo de pago que elegiste (mensual, quincenal o irregular), no el mes calendario, y empieza el día que cae tu sueldo: si tu día de pago cae en fin de semana o feriado, arranca el día hábil en que realmente te pagan. Tocá el rango del período para ver de dónde sale su inicio y cambiarlo. La insignia con la letra d indica cuántos días faltan para tu próximo ingreso.',
            },
            {
                id: 'ini_guide', elementId: 'dash_guide', screen: 'dashboard', position: 'bottom', icon: 'compass-outline', padding: 8,
                title: 'Guía y primeros pasos',
                description: 'Lo que te falta configurar (por ejemplo «Enseñarle a la app tu pago», el SMS con el que te llega tu sueldo) y todos los tutoriales, a un toque.',
                emptyHint: 'Abrila desde Ajustes → Academia.',
            },
            {
                id: 'ini_2', elementId: 'briefing_card', screen: 'dashboard', position: 'bottom', icon: 'sparkles-outline', padding: 8,
                title: 'Briefing del día',
                description: 'Un resumen escrito de cómo vas: gasto del período, alertas y una recomendación concreta. Se genera con tus datos locales; si agregás una API Key de Gemini en Ajustes, el texto es más conversacional.',
            },
            {
                id: 'ini_3', elementId: 'score_card', screen: 'dashboard', position: 'bottom', icon: 'shield-checkmark-outline', padding: 8,
                title: 'Score financiero',
                description: 'Puntaje de 0 a 100 que combina tu tasa de ahorro, el respeto a tu presupuesto y el pago de tus gastos fijos del período. Sube cuando gastás menos de lo planificado y pagás a tiempo.',
            },
            {
                id: 'ini_4', elementId: 'dash_networth', screen: 'dashboard', position: 'top', icon: 'diamond-outline', padding: 8,
                title: 'Patrimonio total',
                description: 'Suma el saldo de tus cuentas y tus ahorros externos, y resta lo que todavía debés en visacuotas. Los dólares se convierten a quetzales con el tipo de cambio de Ajustes. Tocá el ícono de información de la tarjeta para ver el detalle del cálculo.',
            },
            {
                id: 'ini_5', elementId: 'dash_balance_q', screen: 'dashboard', position: 'top', icon: 'cash-outline', padding: 8,
                title: 'Balance por moneda',
                description: 'Ingresos, gastos y saldo del período en quetzales. Si registrás movimientos en dólares aparece una segunda tarjeta en USD: las monedas nunca se mezclan.',
            },
            {
                id: 'ini_6', elementId: 'dash_budget', screen: 'dashboard', position: 'top', icon: 'speedometer-outline', padding: 8,
                title: 'Presupuesto del período',
                description: 'Cuánto llevás gastado frente al presupuesto mensual que definiste en Ajustes. Cambia de color al acercarte al límite.',
            },
            {
                id: 'ini_7', elementId: 'accounts_widget', screen: 'dashboard', position: 'top', icon: 'business-outline', padding: 8,
                title: 'Tus cuentas',
                description: 'Resumen de tus cuentas, tarjetas y visacuotas. Tocá este widget para abrir el módulo de Cuentas, donde registrás saldos, transferencias y compras en cuotas.',
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
                description: 'Tus últimos registros. Para buscar, filtrar o editar cualquier movimiento usá la pestaña Movimientos.',
            },
            {
                id: 'ini_10', elementId: 'sync_btn', screen: 'dashboard', position: 'bottom', icon: 'sync-circle-outline', padding: 16, requiresSms: true,
                title: 'Sincronizar SMS',
                description: 'Lee tus SMS bancarios y registra los movimientos detectados, sin duplicar los que ya importaste. Solo funciona en Android y necesita el permiso de SMS. Deslizá hacia abajo en el Inicio para recargar los datos.',
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
                description: 'Todo parte de tu día de pago (por ejemplo el 27): tu período va de un pago al siguiente, no del 1 al 30. Esta sección de Ajustes lo muestra junto con el período actual, y ahí mismo está el botón «Cuándo empieza mi período». Si tu ciclo es semanal o irregular el inicio es fijo y no hay nada que ajustar.',
            },
            {
                id: 'per_2', elementId: 'settings_period', screen: 'settings', position: 'bottom', icon: 'sunny-outline', padding: 8,
                title: 'Fin de semana y feriados',
                description: 'Si tu día de pago cae sábado, domingo o feriado de Guatemala, el sueldo llega otro día. Tocá «Cuándo empieza mi período» y, en Reglas, elegí qué hacer: Viernes antes, Lunes después o Día exacto. También decidís si cuentan los feriados y cuántos días de tolerancia aceptás (de 1 a 7). El período arranca el día en que de verdad te pagan.',
            },
            {
                id: 'per_3', elementId: 'dash_header', screen: 'dashboard', position: 'bottom', icon: 'cash-outline', padding: 8,
                requires: 'income_source',
                title: 'El sueldo que llega antes',
                description: 'Con una fuente de ingreso creada en Presupuesto → Ingresos (con «Mueve mi período cuando llega» activado) y «Adelantar el período cuando llega el sueldo» activado, cuando la app reconoce tu depósito de sueldo por SMS y cae antes o después de lo esperado (dentro de la tolerancia), el período empieza ese día. Arriba ves el rango del período y, al tocarlo, de dónde sale su inicio: «Empezó con tu sueldo del vie 25», «Adelantado por fin de semana o feriado», «Fijado por vos» o «Es tu día de pago».',
                emptyHint: 'El rango del período aparece en el encabezado del Inicio.',
            },
            {
                id: 'per_4', elementId: 'dash_header', screen: 'dashboard', position: 'bottom', icon: 'hand-left-outline', padding: 8,
                title: 'Editarlo a mano siempre gana',
                description: 'Tocá el rango del período para abrir «Cuándo empieza tu período»: elegí la fecha en que de verdad te pagaron y tocá Guardar. Lo que fijás a mano siempre gana: la app no lo cambia sola. «Volver a automático» le devuelve la decisión a tus reglas y a tu sueldo.',
                emptyHint: 'El rango del período aparece en el encabezado del Inicio.',
            },
        ],
    },

    // ── Tu sueldo (tutorial de proceso) ───────────────────────
    {
        id: 'tutorial_sueldo', title: 'Tu sueldo',
        description: 'Enseñale a la app tu pago: la cuenta, la fuente y el SMS con el que te llega.',
        icon: 'cash-outline', color: C.primary,
        steps: [
            {
                id: 'sue_1', elementId: 'accounts_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'wallet-outline', padding: 8,
                requires: 'bank_account',
                title: '1. La cuenta donde te pagan',
                description: 'Primero tiene que existir la cuenta donde cae tu pago (por ejemplo tu Monetaria). Si todavía no la tenés, creala en Cuentas con el botón +. Con ella la app sabe a qué cuenta llegó cada depósito.',
                emptyHint: 'Todavía no tenés cuentas. Creá la primera con el botón +.',
            },
            {
                id: 'sue_2', elementId: 'budget_income_fab', screen: 'budget', action: { id: 'budget:setTab', arg: 3 }, scrollKey: 'budget_income', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: '2. Tu fuente de ingreso',
                description: 'En Presupuesto → Ingresos está tu fuente de ingreso: al terminar la configuración inicial la app ya creó una con tu ingreso, tu ciclo y tus días de pago. Tocala para revisarla (nombre, categoría, cuánto te pagan, cada cuánto y qué día, y la cuenta donde te pagan) o usá el botón + para agregar otra (por ejemplo un pago extra como el aguinaldo o el bono 14, que marcás como Extra con su mes). Con «Mueve mi período cuando llega» tu período empieza el día que de verdad te pagan.',
            },
            {
                id: 'sue_3', screen: 'budget', position: 'center', icon: 'chatbubble-ellipses-outline',
                title: '3. El SMS de tu pago',
                description: 'La configuración inicial te pide el SMS con el que te llega tu pago (sueldo, quincena, ventas…). Si lo saltaste con «Lo hago después», quedó pendiente en la guía del Inicio como «Enseñarle a la app tu pago» y se hace aquí: abrí tu fuente y, en «SMS de ejemplo», tocá «Elegir de mis SMS» y escogé el depósito de tu último pago; también podés pegar el texto del SMS en el cuadro. La app aprende de qué banco y cuenta llega, quién lo envía y cuánto, sin guardar ningún número de cuenta. Sin SMS de ejemplo la fuente se guarda igual, pero no detecta tu pago sola.',
                noSmsDescription: 'La configuración inicial te pide el SMS con el que te llega tu pago (sueldo, quincena, ventas…). Si lo saltaste con «Lo hago después», quedó pendiente en la guía del Inicio como «Enseñarle a la app tu pago» y se hace aquí: abrí tu fuente y, en «SMS de ejemplo», pegá el texto del SMS que te mandó el banco cuando te pagaron y tocá «Analizar SMS». La app aprende de qué banco y cuenta llega, quién lo envía y cuánto, sin guardar ningún número de cuenta. Sin SMS de ejemplo la fuente se guarda igual, pero no detecta tu pago sola.',
            },
            {
                id: 'sue_4', screen: 'budget', position: 'center', icon: 'checkmark-circle-outline',
                title: '4. Confirmá lo que entendió la app',
                description: 'Después de analizar el SMS ves una tarjeta «Entendimos»: el banco, la cuenta, quién envía el dinero y el monto aproximado. Si es correcto tocá «Sí, es así»; si algo no cuadra tocá «Corregir» y cambiá quién envía o el monto. Recién entonces guardá la fuente.',
            },
            {
                id: 'sue_5', elementId: 'budget_income_list', screen: 'budget', action: { id: 'budget:setTab', arg: 3 }, scrollKey: 'budget_income', position: 'bottom', icon: 'cash-outline', padding: 8,
                requires: 'income_source',
                title: '5. Cuando llega el pago',
                description: 'Cuando entra tu depósito, la app lo reconoce, le pone la categoría de la fuente y la marca «Recibido»; si la fuente mueve tu período, tu período arranca ese día. Si no está segura, te pregunta «¿Es tu sueldo?» en el centro de revisión. También podés vincular un depósito a mano desde su detalle en Movimientos.',
                emptyHint: 'Todavía no tenés fuentes de ingreso. Creá la primera con el botón +.',
            },
        ],
    },

    // ── Movimientos ───────────────────────────────────────────
    {
        id: 'tutorial_movimientos', title: 'Movimientos',
        description: 'Buscá, filtrá y editá tus registros.',
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
                description: 'Escribí parte de la descripción, el nombre del banco o la categoría. La lista se filtra mientras escribís; tocá la X para limpiar.',
            },
            {
                id: 'mov_3', elementId: 'tx_type_filter', screen: 'transactions', position: 'bottom', icon: 'funnel-outline', padding: 8,
                title: 'Filtrar por tipo',
                description: 'Mostrá todos los movimientos, solo gastos o solo ingresos. Este filtro se combina con la búsqueda.',
            },
            {
                id: 'mov_4', elementId: 'tx_currency_filter', screen: 'transactions', position: 'bottom', icon: 'cash-outline', padding: 8,
                title: 'Filtrar por moneda',
                description: 'Si registraste movimientos en dólares o euros, este filtro te deja ver cada moneda por separado.',
                emptyHint: 'Este filtro aparece cuando tenés movimientos en más de una moneda.',
            },
            {
                id: 'mov_5', elementId: 'tx_first', screen: 'transactions', position: 'bottom', icon: 'receipt-outline', padding: 8,
                title: 'Cada movimiento',
                description: 'Cada tarjeta muestra la descripción, la fecha, el banco, si vino de un SMS, la moneda y la categoría. El monto va en verde pátina si es ingreso y en rojo si es gasto. La papelera lo elimina, siempre con confirmación.',
                noSmsDescription: 'Cada tarjeta muestra la descripción, la fecha, el banco, la moneda y la categoría. El monto va en verde pátina si es ingreso y en rojo si es gasto. La papelera lo elimina, siempre con confirmación.',
                emptyHint: 'Todavía no tenés movimientos: registrá uno con el botón + de la barra inferior.',
            },
            {
                id: 'mov_6', screen: 'transactions', position: 'center', icon: 'create-outline',
                title: 'Editar un movimiento',
                description: 'Tocá cualquier movimiento para abrir su detalle: podés corregir la descripción, la moneda y la categoría, ver el SMS original si vino del banco, convertirlo en visacuota si fue una compra en cuotas o eliminarlo. En un ingreso, «Vincular a fuente de ingreso» lo asigna a una de tus fuentes (sueldo, quincena…) y «Quitar vínculo con la fuente» lo suelta.',
                noSmsDescription: 'Tocá cualquier movimiento para abrir su detalle: podés corregir la descripción, la moneda y la categoría, convertirlo en visacuota si fue una compra en cuotas o eliminarlo. En un ingreso, «Vincular a fuente de ingreso» lo asigna a una de tus fuentes (sueldo, quincena…) y «Quitar vínculo con la fuente» lo suelta.',
            },
            {
                id: 'mov_7', screen: 'transactions', position: 'center', icon: 'pricetag-outline',
                title: 'Clasificá bien tus movimientos',
                description: 'La app clasifica sola por el nombre del comercio: Restaurantes es la comida ya preparada (restaurantes, comida rápida, cafeterías y delivery), Supermercado es la despensa, y Comida es el resto (panaderías, mercados, tiendas de barrio). Combustible es la gasolina; Transporte, taxis, parqueos y peajes. Si una categoría no es la correcta, cambiala en el detalle del movimiento y activá «Recordar»: la app aprende ese comercio y lo clasifica así la próxima vez. En ingresos por SMS, la app recuerda el origen del depósito (banco, cuenta y quién lo envía): corregí la categoría de un depósito, activá «Recordar» y los próximos del mismo origen llegan ya clasificados. Si no hay una que te sirva, creá una ahí mismo con «+ Nueva categoría» (la última casilla de la lista).',
                noSmsDescription: 'Elegí la categoría según el tipo de gasto: Restaurantes es la comida ya preparada (restaurantes, comida rápida, cafeterías y delivery), Supermercado es la despensa, y Comida es el resto (panaderías, mercados, tiendas de barrio). Combustible es la gasolina; Transporte, taxis, parqueos y peajes. Si te equivocaste, cambiala en el detalle del movimiento. Si no hay una que te sirva, creá una ahí mismo con «+ Nueva categoría» (la última casilla de la lista).',
            },
        ],
    },

    // ── Registrar un gasto o ingreso ──────────────────────────
    {
        id: 'tutorial_agregar', title: 'Registrar un Gasto o Ingreso',
        description: 'Aprendé a agregar transacciones manualmente.',
        icon: 'add-circle-outline', color: C.accent,
        steps: [
            {
                id: 'add_1', elementId: 'add_header', screen: 'add', position: 'bottom', icon: 'add-outline', padding: 8,
                title: 'Registrar un movimiento',
                description: 'Aquí anotás a mano cualquier gasto o ingreso. También llegás tocando el botón cobre central de la barra inferior.',
            },
            {
                id: 'add_2', elementId: 'add_type_selector', screen: 'add', position: 'bottom', icon: 'swap-horizontal-outline', padding: 8,
                title: 'Gasto o Ingreso',
                description: 'Primero elegí si es un Gasto (dinero que salió: compras, pagos, retiros) o un Ingreso (dinero que entró: salario, ventas, transferencias recibidas). Al cambiar el tipo se reinicia la categoría elegida.',
            },
            {
                id: 'add_3', elementId: 'add_currency', screen: 'add', position: 'bottom', icon: 'cash-outline', padding: 8,
                title: 'Selecciona la Moneda',
                description: 'Elegí entre Q, USD, EUR o £. La app lleva balances separados por moneda, así un gasto en dólares no se mezcla con tus quetzales.',
            },
            {
                id: 'add_4', elementId: 'add_amount', screen: 'add', position: 'bottom', icon: 'calculator-outline', padding: 8,
                title: 'Ingresa el Monto',
                description: 'Escribí el monto, con decimales si hace falta (por ejemplo 150.50). El número toma el color del tipo elegido para que confirmes de un vistazo si es gasto o ingreso.',
            },
            {
                id: 'add_5', elementId: 'add_description', screen: 'add', position: 'bottom', icon: 'pencil-outline', padding: 8,
                title: 'Agregá una Descripción',
                description: 'Opcional pero recomendado: escribí en qué gastaste o de dónde viene el dinero. Te ayuda a identificar la transacción después.',
            },
            {
                id: 'add_6', elementId: 'add_category', screen: 'add', position: 'top', icon: 'pricetag-outline', padding: 8,
                title: 'Elegí la Categoría',
                description: 'La categoría alimenta tus estadísticas y el presupuesto por categoría: elegirla bien te dice exactamente en qué se va tu dinero. Si no hay una que te sirva, creá una ahí mismo con «+ Nueva categoría» (la última casilla de la lista): queda elegida y disponible en toda la app. También podés administrarlas en Ajustes → Mis Categorías.',
            },
            {
                id: 'add_7', elementId: 'add_sms_btn', screen: 'add', position: 'bottom', icon: 'scan-outline', padding: 8, requiresSms: true,
                title: 'Atajo: pegar un SMS',
                description: 'Si tenés un SMS del banco, tocá "Leer SMS", pegá el texto y presioná "Analizar SMS": la app completa monto, moneda y tipo por vos. Al final revisá los datos y tocá "Guardar".',
            },
            {
                id: 'add_8', elementId: 'add_save_btn', screen: 'add', position: 'top', icon: 'save-outline', padding: 8,
                title: 'Guardar',
                description: 'Revisá los datos y tocá Guardar: el movimiento aparece en Inicio y en Movimientos, y actualiza tus estadísticas y presupuestos.',
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
                description: 'La primera vez que sincronices, Android te preguntará si BudgetMaster puede leer tus SMS: elegí "Permitir". Si lo rechazaste con "No volver a preguntar", activalo en Ajustes del teléfono → Apps → BudgetMaster → Permisos → SMS.',
            },
            {
                id: 'sms_3', position: 'center', icon: 'shield-outline',
                title: 'Tu privacidad está protegida',
                description: 'La app SOLO lee mensajes con palabras bancarias (compra, débito, abono). Nunca lee mensajes personales. Todo queda en tu celular.',
            },
            {
                id: 'sms_4', position: 'center', icon: 'settings-outline',
                title: 'Configurar en Ajustes',
                description: 'En Ajustes → Sincronización SMS Automática podés activarla o desactivarla. Bancos soportados: BAC, BANRURAL, GTC, BANTRAB y PROMERICA. Si un SMS no se detecta, pegalo a mano en Agregar → "Leer SMS".',
            },
            {
                id: 'sms_5', position: 'center', icon: 'pricetag-outline',
                title: 'Clasificación automática',
                description: 'Cada movimiento se guarda con el nombre del comercio (sin la zona ni la sucursal, que quedan como ubicación) y una categoría: Restaurantes para comida preparada, Supermercado para la despensa y Comida para el resto. Si una categoría no es la correcta, cambiala en el detalle del movimiento y activá «Recordar»: la app aprende ese comercio. En ingresos por SMS, la app recuerda el origen del depósito (banco, cuenta y quién lo envía), así que los próximos depósitos del mismo origen llegan ya clasificados. Si ya creaste una fuente de ingreso, un depósito que se le parece se vincula solo; si la app no está segura, el centro de revisión te pregunta «¿Es tu sueldo?» y vos confirmás con Sí o No.',
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
                description: 'Tocá la casilla de un gasto para marcarlo como pagado; la app te pregunta en qué fecha se pagó (por defecto, su día de cobro si ya pasó). Si tiene la etiqueta AUTO, la app lo registra en Movimientos automáticamente y lo revierte si lo desmarcás. Mantené presionada la tarjeta para editarla. VENCIDO indica que pasó su día de pago sin marcarse.',
                emptyHint: 'Todavía no tenés gastos fijos. Agregá el primero con el botón + de esta pestaña.',
            },
            {
                id: 'budget_4', elementId: 'budget_fixed_fab', screen: 'budget', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: 'Agregar un gasto fijo',
                description: 'Con este botón registrás renta, internet, seguros o cuotas: nombre, monto, moneda, día de pago y categoría. La app te recuerda antes de cada vencimiento y las casillas se reinician al empezar un nuevo mes.',
            },
            {
                id: 'budget_5', elementId: 'budget_cat_summary', screen: 'budget', action: { id: 'budget:setTab', arg: 1 }, scrollKey: 'budget_categories', position: 'bottom', icon: 'bar-chart-outline', padding: 8,
                title: 'Planificado contra gastado',
                description: 'La suma de los límites que asignaste, cuánto llevás gastado en esas categorías este período y cuánto te queda disponible o cuánto te excediste.',
            },
            {
                id: 'budget_5b', elementId: 'budget_cat_list', screen: 'budget', scrollKey: 'budget_categories', position: 'bottom', icon: 'list-outline', padding: 8,
                title: 'Movimientos de cada categoría',
                description: 'Tocá una categoría para ver los movimientos del período. Los gastos en dólares u otra moneda se muestran aparte: no se convierten ni cuentan en el límite. Más abajo, «Gastos sin presupuesto» lista las categorías con gasto que todavía no tienen límite.',
                emptyHint: 'Aquí aparecen las categorías con límite y, debajo, las que tienen gasto este período pero aún no tienen límite.',
            },
            {
                id: 'budget_6', elementId: 'budget_cat_grid', screen: 'budget', scrollKey: 'budget_categories', position: 'top', icon: 'pricetag-outline', padding: 8,
                title: 'Asignar un límite',
                description: 'Tocá una categoría, escribí el monto máximo para el período y confirmá con el check. La app te avisa al llegar al 80% y te alerta si lo superás. Para quitar un límite usá la papelera de su tarjeta.',
            },
            {
                id: 'budget_7', elementId: 'budget_goals_list', screen: 'budget', action: { id: 'budget:setTab', arg: 2 }, scrollKey: 'budget_goals', position: 'bottom', icon: 'trophy-outline', padding: 8,
                title: 'Metas de ahorro',
                description: 'Cada meta muestra el porcentaje alcanzado, cuánto falta, los días que quedan y cuánto deberías apartar por mes para llegar a tiempo. Tocá Abonar cada vez que separes dinero para esa meta.',
                emptyHint: 'Todavía no tenés metas. Creá la primera con el botón +.',
            },
            {
                id: 'budget_8', elementId: 'budget_goals_fab', screen: 'budget', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: 'Crear una meta',
                description: 'Definí el nombre, el monto objetivo, cuánto ya tenés ahorrado, la moneda y la fecha límite con el calendario. Al completarla pasa a la sección Metas completadas.',
            },
            {
                id: 'budget_9', elementId: 'budget_income_list', screen: 'budget', action: { id: 'budget:setTab', arg: 3 }, scrollKey: 'budget_income', position: 'bottom', icon: 'cash-outline', padding: 8,
                title: 'Tus fuentes de ingreso',
                description: 'Arriba ves tu ingreso base del período: lo que de verdad te pagan tus fuentes base en un mes (los extras como aguinaldo o bono 14 no cuentan). Debajo, cada fuente con su estado: Esperado (aún no llega), Recibido (ya llegó y la app lo reconoció) o Atrasado (pasó la tolerancia). Tocá una fuente para editarla. Si tu ingreso real difiere en más de 5% del que declaraste, la app te lo sugiere y lo actualizás con un toque.',
                emptyHint: 'Todavía no tenés fuentes de ingreso. Creá la primera con el botón + de esta pestaña.',
            },
            {
                id: 'budget_10', elementId: 'budget_income_fab', screen: 'budget', scrollKey: 'budget_income', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: 'Crear una fuente de ingreso',
                description: 'Con este botón registrás de dónde y cuándo te pagan: nombre, categoría, monto, moneda, cada cuánto (mensual, quincenal, semanal o irregular), el día, la cuenta donde te pagan y si es un ingreso base o un extra. Con un SMS de ejemplo la app aprende a reconocer tu pago sola. Mirá el tutorial «Tu sueldo» para el proceso completo.',
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
                title: 'Elegí el período',
                description: 'Período Actual sigue tu ciclo de pago; también podés ver el Período Anterior, Este Año o Todo el historial. Las tarjetas se recalculan con el período elegido, salvo la comparativa de 6 meses, que siempre muestra los últimos seis.',
            },
            {
                id: 'stats_2', elementId: 'stats_quick', screen: 'stats', position: 'bottom', icon: 'swap-vertical-outline', padding: 8,
                title: 'Resumen rápido',
                description: 'Ingresos, gastos y ahorro del período en quetzales. El ahorro es ingresos menos gastos: si es negativo, gastaste más de lo que entró.',
            },
            {
                id: 'stats_3', elementId: 'stats_pie', screen: 'stats', position: 'bottom', icon: 'pie-chart-outline', padding: 8,
                title: 'Desglose por categoría',
                description: 'Muestra en qué categorías se fue tu dinero. Tocá una porción o una fila de la leyenda para ver su monto y porcentaje. Debajo está tu tasa de ahorro: lo recomendado es al menos el 20% de tus ingresos.',
                emptyHint: 'La gráfica aparece cuando registrás gastos en quetzales en el período elegido.',
            },
            {
                id: 'stats_4', elementId: 'stats_projected', screen: 'stats', position: 'top', icon: 'trending-up-outline', padding: 8,
                title: 'Flujo de caja proyectado',
                description: 'Toma tu gasto promedio diario y lo proyecta hasta el final del período, para que sepás con tiempo si te va a sobrar o faltar dinero. En períodos pasados muestra lo que realmente gastaste.',
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
                description: 'Cuánto gastás por día en promedio frente a tu presupuesto diario ideal (presupuesto mensual dividido entre los días del período). Por encima de 100% vas más rápido de lo planificado.',
            },
            {
                id: 'stats_8', elementId: 'stats_nospend', screen: 'stats', position: 'top', icon: 'shield-checkmark-outline', padding: 8,
                title: 'Días sin gastar',
                description: 'Cuántos días del período no registraste ningún gasto. Más días sin gastar suele significar menos compras impulsivas.',
            },
            {
                id: 'stats_9', elementId: 'stats_banks', screen: 'stats', position: 'top', icon: 'business-outline', padding: 8,
                title: 'Gasto por banco o tarjeta',
                description: 'Cuánto gastaste con cada banco y en cuántas transacciones, para que sepás qué tarjeta usás más.',
                emptyHint: 'Aparece cuando tus gastos tienen banco asignado, por ejemplo los importados por SMS.',
                noSmsEmptyHint: 'Aparece cuando tus gastos tienen banco asignado.',
            },
            {
                id: 'stats_10', elementId: 'stats_velocity', screen: 'stats', position: 'top', icon: 'speedometer-outline', padding: 8,
                title: 'Velocidad de gasto',
                description: 'Compara lo que llevás gastado en este período con todo el período anterior. Si es positivo, estás gastando más rápido que antes.',
                emptyHint: 'Esta tarjeta solo aparece con el filtro Período Actual.',
            },
            {
                id: 'stats_11', elementId: 'stats_savings_projection', screen: 'stats', position: 'top', icon: 'rocket-outline', padding: 8,
                title: 'Proyección de ahorro',
                description: 'Al final de la pantalla: estima cuánto acumularías en 6 y 12 meses si seguís ahorrando al ritmo promedio de los últimos seis meses. Se basa en tus transacciones registradas, no en el saldo de tus cuentas.',
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
                description: 'Modo local entiende tus consultas y órdenes directamente en el teléfono, sin internet ni configuración. Si pegás tu API Key gratuita de aistudio.google.com en Ajustes → Inteligencia Artificial, verás Gemini activo y además podrás conversar de forma abierta.',
            },
            {
                id: 'ia_2', elementId: 'advisor_chat', screen: 'advisor', position: 'bottom', icon: 'chatbubbles-outline', padding: 8,
                title: 'La conversación',
                description: 'El primer mensaje es un diagnóstico de tu situación actual. Cada respuesta usa tus movimientos, cuentas, gastos fijos, presupuestos, metas y visacuotas reales.',
            },
            {
                id: 'ia_3', elementId: 'advisor_suggestions', screen: 'advisor', position: 'top', icon: 'flash-outline', padding: 8,
                title: 'Preguntas sugeridas',
                description: 'Atajos pensados para tu situación del momento. Tocá uno para preguntarlo directamente.',
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
                title: 'Escribí una orden o una consulta',
                description: 'Órdenes: «Crea una meta de Q5,000 para una laptop en diciembre», «Ponle un límite de Q800 a Restaurantes», «Agrega Netflix de $15.99 el 5 de cada mes», «Gasté 85 en gasolina ayer». Consultas: «¿Cuánto gasté en Restaurantes este período?» o «¿Qué gastos fijos me faltan por pagar?». Toda escritura se confirma con la tarjeta y después se puede deshacer. También podés pedir consejos, como ¿puedo comprarme un celular de Q3,000?',
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
                description: 'Registrá aquí efectivo, cuentas bancarias, tarjetas de crédito, ahorros e inversiones. Con estos saldos la app calcula tu patrimonio exacto. Este módulo se abre desde el widget Cuentas del Inicio.',
            },
            {
                id: 'acc_2', elementId: 'accounts_summary', screen: 'accounts', position: 'bottom', icon: 'pie-chart-outline', padding: 8,
                title: 'Resumen de patrimonio',
                description: 'Tus activos en quetzales (los dólares se convierten con el tipo de cambio de Ajustes), lo que te falta pagar en visacuotas y tu saldo neto por moneda.',
            },
            {
                id: 'acc_3', elementId: 'accounts_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'accounts' }, position: 'top', icon: 'wallet-outline', padding: 8,
                title: 'Tus cuentas',
                description: 'Cada cuenta muestra su tipo, banco y saldo. Cuando asignás una cuenta a un gasto o ingreso, la cuenta organiza tus movimientos; el saldo no cambia solo. Tocá el lápiz (o mantené presionada la cuenta) para editarla y usá la papelera para eliminarla. En las tarjetas de crédito ves el día de corte, el de pago, la cuota mensual de sus visacuotas y el «Ciclo abierto»: lo que llevás gastado desde el último corte, separado en quetzales y dólares (cada moneda se paga en su moneda).',
                emptyHint: 'Todavía no tenés cuentas. Creá la primera con el botón +.',
            },
            {
                id: 'acc_4', elementId: 'accounts_fab', screen: 'accounts', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: 'Agregar una cuenta',
                description: 'Elegí el tipo, el nombre, el banco, la moneda y el saldo actual. En las tarjetas de crédito indicá el día de corte, que es la fecha de «Saldo al corte» de tu estado de cuenta (ese día todavía entra en el estado y el ciclo nuevo empieza al día siguiente), y el día de pago.',
            },
            {
                id: 'acc_5', elementId: 'accounts_transfer_btn', screen: 'accounts', position: 'bottom', icon: 'swap-horizontal-outline', padding: 8,
                title: 'Transferir entre cuentas',
                description: 'Mové dinero entre tus cuentas, por ejemplo de BAC a efectivo. Si las monedas son distintas se convierte con el tipo de cambio actual, y la transferencia queda registrada en Movimientos. Necesitás al menos dos cuentas que no sean tarjeta de crédito.',
            },
            {
                id: 'acc_6', elementId: 'accounts_tabs', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'installments' }, position: 'bottom', icon: 'layers-outline', padding: 8,
                title: 'Visacuotas',
                description: 'En esta pestaña registrás compras a cuotas con tarjeta (o un préstamo sin tarjeta). En cada corte de la tarjeta la app carga UNA cuota como gasto en tu período; no la compra completa.',
            },
            {
                id: 'acc_7', elementId: 'accounts_inst_list', screen: 'accounts', position: 'top', icon: 'card-outline', padding: 8,
                title: 'Seguimiento de cuotas',
                description: 'Cada visacuota muestra la cuota mensual, cuántas se cargaron, cuántas faltan, la fecha de la «Próxima cuota» (el corte en que entra) y el mes en que terminás. Cada cuota se carga como gasto en el corte en que entra, no la compra completa. Con el lápiz la editás y con la papelera la eliminás (las cuotas que ya se cargaron como gasto se quedan en Movimientos). También podés convertir un gasto existente en visacuota desde su detalle en Movimientos.',
                emptyHint: 'Todavía no tenés visacuotas. Agregá una con el botón +.',
            },
            {
                id: 'acc_8', elementId: 'accounts_fab', screen: 'accounts', position: 'top', icon: 'add-circle-outline', padding: 8,
                title: 'Agregar una visacuota',
                description: 'Indicá la tarjeta (o «Sin tarjeta (préstamo)» con su día de pago), el monto total, la cuota mensual, el número de cuotas, las que ya pagaste y la fecha de la compra: la primera cuota entra en el primer corte desde esa fecha.',
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
                description: 'Primero tiene que existir la tarjeta en Cuentas, con su día de corte (la fecha de «Saldo al corte» de tu estado de cuenta: ese día todavía entra en el estado y el ciclo nuevo empieza al día siguiente) y su día de pago. Con el corte la app sabe en qué ciclo cae cada cuota. Si tu estado trae dos saldos (quetzales y dólares), cada moneda se cuenta aparte.',
                emptyHint: 'Todavía no tenés tarjetas. Creá la primera con el botón +.',
            },
            {
                id: 'vis_2', elementId: 'accounts_fab', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'installments' }, position: 'top', icon: 'add-circle-outline', padding: 8,
                title: '2. La compra en cuotas',
                description: 'La compra en cuotas llega de dos formas: la app la detecta sola cuando el banco te manda el SMS de «compra a cuotas», o la registrás vos con el botón +: tarjeta, monto total, cuota mensual, número de cuotas, las que ya pagaste y la fecha de la compra. Si es un préstamo sin tarjeta, elegí «Sin tarjeta (préstamo)» y su día de pago.',
                noSmsDescription: 'La compra en cuotas la registrás con el botón +: tarjeta, monto total, cuota mensual, número de cuotas, las que ya pagaste y la fecha de la compra. Si es un préstamo sin tarjeta, elegí «Sin tarjeta (préstamo)» y su día de pago.',
            },
            {
                id: 'vis_3', elementId: 'accounts_inst_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'installments' }, position: 'top', icon: 'calendar-outline', padding: 8,
                title: '3. Cada corte carga una cuota',
                description: 'En cada corte de la tarjeta la app registra UNA cuota como gasto, fechado el día del corte y en la categoría de la visacuota: así tu período solo suma lo que de verdad te cargan cada mes, no la compra completa. Si la app estuvo cerrada varios cortes, al abrirla pone al día todas las cuotas de una vez. Si ya tenías ese gasto por SMS, se marca como la cuota en vez de duplicarse. Si borrás una cuota de Movimientos, no se vuelve a crear.',
                emptyHint: 'Todavía no tenés visacuotas. Agregá una con el botón +.',
            },
            {
                id: 'vis_4', elementId: 'accounts_inst_list', screen: 'accounts', action: { id: 'accounts:setTab', arg: 'installments' }, position: 'top', icon: 'checkmark-done-outline', padding: 8,
                title: '4. La última cuota',
                description: 'La visacuota muestra cuántas cuotas se cargaron y la «Próxima cuota». Al cargarse la última, la visacuota termina sola y deja de mostrarse en esta lista; las cuotas ya cargadas se quedan en Movimientos como historial. Si la eliminás antes, también se conservan.',
                emptyHint: 'Todavía no tenés visacuotas. Agregá una con el botón +.',
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
                description: 'Este interruptor activa o desactiva la lectura de SMS bancarios de BAC, BANRURAL, GTC, BANTRAB y PROMERICA. Apagado, la app oculta todo lo relacionado con SMS; tus movimientos ya importados se conservan. Con «Sincronizar al abrir la app» activado, la sincronización corre sola cada vez que abrís la app y solo lee los mensajes nuevos (nunca pide permisos por su cuenta). Abajo podés sincronizar 3 meses completos, deshacer la última sincronización y revisar pendientes. Disponible solo en Android.',
                noSmsDescription: 'Activá este interruptor para mostrar la sincronización de SMS bancarios (BAC, BANRURAL, GTC, BANTRAB y PROMERICA). Mientras esté apagado, la app oculta todo lo relacionado con SMS; tus movimientos ya importados se conservan.',
            },
            {
                id: 'set_2', elementId: 'settings_budget', screen: 'settings', position: 'bottom', icon: 'wallet-outline', padding: 8,
                title: 'Presupuesto mensual',
                description: 'Lo máximo que planeás gastar por período, en quetzales. Con este número se calculan las alertas, el presupuesto diario ideal y parte de tu score. El equivalente en dólares se calcula solo con el tipo de cambio; si preferís, podés fijarlo a mano.',
            },
            {
                id: 'set_period', elementId: 'settings_period', screen: 'settings', position: 'bottom', icon: 'calendar-outline', padding: 8,
                title: 'Ingresos y período',
                description: 'Muestra tu día de pago y el período actual. «Mis fuentes de ingreso» te lleva a Presupuesto → Ingresos. En «Ciclo de pago» cambiás el ciclo (mensual, quincenal, semanal o irregular) y el día o los dos días de pago, y se guardan con su propio botón; cambiar el día mueve tu período, y lo que fijaste a mano en un período anterior se conserva. «Cuándo empieza mi período» abre el detalle: de dónde sale el inicio (tu sueldo, un fin de semana o feriado, o lo que fijaste a mano), las fechas para elegir otro inicio y las reglas de fin de semana, feriados, tolerancia y sueldo adelantado. Esos cambios se guardan con los botones del propio detalle, no con Guardar Cambios.',
            },
            {
                id: 'set_3', elementId: 'settings_currency', screen: 'settings', position: 'bottom', icon: 'cash-outline', padding: 8,
                title: 'Moneda principal',
                description: 'La moneda que usás en tu día a día. Es la que aparece seleccionada por defecto al registrar un movimiento.',
            },
            {
                id: 'set_4', elementId: 'settings_rate', screen: 'settings', position: 'top', icon: 'swap-horizontal-outline', padding: 8,
                title: 'Tipo de cambio',
                description: 'Cuántos quetzales vale un dólar. Se actualiza solo desde el Banco de Guatemala, o desde un servicio de respaldo, cada 6 horas. Sin internet se usa el último valor guardado. Si lo editás a mano queda fijo hasta que toques Volver a automático.',
            },
            {
                id: 'set_5', elementId: 'settings_savings', screen: 'settings', position: 'top', icon: 'business-outline', padding: 8,
                title: 'Ahorros externos',
                description: 'Dinero que tenés fuera de la app, por ejemplo un plazo fijo. Se suma a tu patrimonio y a la proyección de ahorro.',
            },
            {
                id: 'set_6', elementId: 'settings_biometric', screen: 'settings', position: 'top', icon: 'finger-print-outline', padding: 8,
                title: 'Seguridad biométrica',
                description: 'Pedí huella o reconocimiento facial cada vez que se abre la app.',
                emptyHint: 'Esta opción aparece si tu teléfono tiene huella o reconocimiento facial configurado.',
            },
            {
                id: 'set_8', elementId: 'settings_gemini', screen: 'settings', position: 'top', icon: 'sparkles-outline', padding: 8,
                title: 'Gemini (opcional)',
                description: 'Pegá tu API Key gratuita de aistudio.google.com para que el Asesor responda en lenguaje natural. Sin clave, el asesor funciona igual en modo local.',
            },
            {
                id: 'set_9', elementId: 'settings_categories', screen: 'settings', position: 'top', icon: 'pricetag-outline', padding: 8,
                title: 'Mis categorías',
                description: 'Creá categorías propias con nombre, color, ícono y tipo (gastos, ingresos o ambos). Aparecen al registrar movimientos y en Presupuesto, y se guardan al crearlas. También podés crearlas al vuelo con «+ Nueva categoría» al registrar o editar un movimiento. Para cambiar el nombre, el color, el ícono o el tipo de una categoría propia, tocala aquí en Ajustes; el basurero la elimina.',
            },
            {
                id: 'set_10', elementId: 'settings_academy', screen: 'settings', position: 'top', icon: 'school-outline', padding: 8,
                title: 'Academia',
                description: 'Abrí cualquier tutorial o reinicialos todos. Recordá que cada módulo tiene su botón ? en el encabezado.',
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
                description: 'Borra todos tus datos del teléfono de forma permanente. La app te pide confirmación antes de hacerlo.',
            },
        ],
    },
];

// ─────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────
const KEY = '@bm_completed_tutorials';

export const TutorialService = {
    async getCompleted(): Promise<string[]> {
        try {
            const data = await AsyncStorage.getItem(KEY);
            return data ? JSON.parse(data) : [];
        } catch { return []; }
    },

    async markCompleted(tutorialId: string): Promise<void> {
        try {
            const all = await this.getCompleted();
            if (!all.includes(tutorialId)) {
                await AsyncStorage.setItem(KEY, JSON.stringify([...all, tutorialId]));
            }
        } catch { }
    },

    async isCompleted(tutorialId: string): Promise<boolean> {
        const all = await this.getCompleted();
        return all.includes(tutorialId);
    },

    async resetAll(): Promise<void> {
        try { await AsyncStorage.removeItem(KEY); } catch { }
    },

    // Con smsEnabled === false quita lo relacionado con SMS (tutoriales y pasos marcados con
    // requiresSms) y usa los textos alternativos; por defecto devuelve TUTORIALS sin cambios.
    getTutorials(opts?: { smsEnabled?: boolean }): Tutorial[] {
        if (opts?.smsEnabled !== false) return TUTORIALS;
        return TUTORIALS
            .filter(t => !t.requiresSms)
            .map(t => ({
                ...t,
                steps: t.steps
                    .filter(s => !s.requiresSms)
                    .map(s => ({
                        ...s,
                        description: s.noSmsDescription ?? s.description,
                        emptyHint: s.noSmsEmptyHint ?? s.emptyHint,
                    })),
            }));
    },

    getTutorial(id: string, opts?: { smsEnabled?: boolean }): Tutorial | undefined {
        return this.getTutorials(opts).find(t => t.id === id);
    },
};