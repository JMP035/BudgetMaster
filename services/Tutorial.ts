import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
// Debe coincidir con `Tab` de app/index.tsx, más 'advisor' (que se controla con showAI)
export type TutorialScreen = 'dashboard' | 'transactions' | 'add' | 'budget' | 'stats' | 'settings' | 'advisor';

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
}

export interface Tutorial {
    id: string;
    title: string;
    description: string;
    icon: string;
    color: string;
    steps: TutorialStep[];
}

// ─────────────────────────────────────────────────────────────
// TUTORIALES
// ─────────────────────────────────────────────────────────────
export const TUTORIALS: Tutorial[] = [

    {
        id: 'tour_inicial', title: 'Tour Inicial',
        description: 'Conoce BudgetMaster en 7 pasos.',
        icon: 'rocket-outline', color: '#B87333',
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
                id: 'tour_3', elementId: 'sync_btn', screen: 'dashboard', position: 'bottom', icon: 'sync-circle-outline', padding: 16,
                title: 'Sync SMS',
                description: 'Este botón lee tus SMS bancarios (BAC, BANRURAL, GTC, BANTRAB, PROMERICA) y registra tus gastos automáticamente. La primera vez Android te pedirá permiso para leer SMS: sin ese permiso no se puede sincronizar. Solo funciona en Android.',
            },
            {
                id: 'tour_4', elementId: 'tab_add', position: 'top', icon: 'add-circle-outline', padding: 12,
                title: 'Agregar Transacción',
                description: 'El botón cobre central abre la pantalla para registrar gastos e ingresos a mano. Ahí también podés pegar el texto de un SMS bancario para que la app complete los datos sola.',
            },
            {
                id: 'tour_5', elementId: 'tab_budget', position: 'top', icon: 'wallet-outline', padding: 8,
                title: 'Presupuesto',
                description: 'Aquí planificás tu mes — gastos fijos, límites por categoría y metas de ahorro. Es donde convertís tus intenciones en un plan real.',
            },
            {
                id: 'tour_6', elementId: 'tab_advisor', position: 'top', icon: 'sparkles-outline', padding: 8,
                title: 'Asesor IA',
                description: 'Tu CFO en modo chat. Preguntale lo que quieras: ¿puedo comprarme X?, ¿cómo voy este mes?, ¿qué hago con este excedente? Responde con tus datos locales, y con Gemini lo hace en lenguaje natural.',
            },
            {
                id: 'tour_7', elementId: 'tab_settings', position: 'top', icon: 'settings-outline', padding: 8,
                title: 'Ajustes y Academia',
                description: 'Configurá tu perfil, presupuesto, moneda y la API Key de Gemini. En la sección Academia (o con el ícono "?" de Inicio) encontrás todos los tutoriales para repasarlos cuando quieras.',
            },
        ],
    },

    {
        id: 'tutorial_agregar', title: 'Registrar un Gasto o Ingreso',
        description: 'Aprende a agregar transacciones manualmente.',
        icon: 'add-circle-outline', color: '#4CB19F',
        steps: [
            {
                id: 'add_1', elementId: 'tab_add', position: 'top', icon: 'add-outline', padding: 12,
                title: 'Toca el botón "+"',
                description: 'El botón cobre en el centro de la barra inferior abre la pantalla para agregar una transacción. Al tocar "Siguiente" te llevamos ahí automáticamente.',
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
                description: 'La categoría alimenta tus estadísticas y el presupuesto por categoría: elegirla bien te dice exactamente en qué se va tu dinero. Podés crear categorías propias en Ajustes → Mis Categorías.',
            },
            {
                id: 'add_7', elementId: 'add_sms_btn', screen: 'add', position: 'bottom', icon: 'scan-outline', padding: 8,
                title: 'Atajo: pegar un SMS',
                description: 'Si tenés un SMS del banco, tocá "Leer SMS", pegá el texto y presioná "Analizar SMS": la app completa monto, moneda y tipo por vos. Al final revisá los datos y tocá "Guardar".',
            },
        ],
    },

    {
        id: 'tutorial_sms', title: 'Sincronización SMS',
        description: 'Registra gastos automáticamente desde tus SMS bancarios.',
        icon: 'chatbubble-outline', color: '#4A9EE8',
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
        ],
    },

    {
        id: 'tutorial_presupuesto', title: 'Presupuesto',
        description: 'Gastos fijos, límites por categoría y metas.',
        icon: 'wallet-outline', color: '#E8943A',
        steps: [
            {
                id: 'budget_1', elementId: 'tab_budget', position: 'top', icon: 'wallet-outline', padding: 8,
                title: 'Tab Presupuesto',
                description: 'Tocá Presupuesto en la barra inferior: ahí planificás tu mes en 3 secciones: Gastos Fijos, Categorías y Metas. Al tocar "Siguiente" te llevamos ahí.',
            },
            {
                id: 'budget_2', elementId: 'budget_tab_fixed', screen: 'budget', position: 'bottom', icon: 'calendar-outline', padding: 8,
                title: 'Gastos Fijos',
                description: 'Registrá tus compromisos mensuales (renta, internet, seguros) con su día de pago. La app te recuerda antes de que venzan y, al marcarlos como pagados, registra la transacción automáticamente.',
            },
            {
                id: 'budget_3', elementId: 'budget_tab_categories', screen: 'budget', position: 'bottom', icon: 'bar-chart-outline', padding: 8,
                title: 'Presupuesto por Categoría',
                description: 'Asigná un límite a cada categoría. La app te avisa cuando llegás al 80% y te alerta si lo superás.',
            },
            {
                id: 'budget_4', elementId: 'budget_tab_goals', screen: 'budget', position: 'bottom', icon: 'trophy-outline', padding: 8,
                title: 'Metas de Ahorro',
                description: 'Creá objetivos con monto y fecha límite (un viaje, un fondo de emergencia). La app calcula cuánto debés apartar por mes para llegar a tiempo.',
            },
        ],
    },

    {
        id: 'tutorial_ia', title: 'Asesor IA',
        description: 'Tu CFO personal en modo chat.',
        icon: 'sparkles-outline', color: '#9B59B6',
        steps: [
            {
                id: 'ia_1', elementId: 'tab_advisor', position: 'top', icon: 'sparkles-outline', padding: 8,
                title: 'Abrí el Asesor IA',
                description: 'Tocá ✦ Asesor en la barra inferior; el chat se abre desde cualquier pantalla. Al tocar "Siguiente" lo abrimos por vos.',
            },
            {
                id: 'ia_2', elementId: 'advisor_input', screen: 'advisor', position: 'top', icon: 'chatbubble-ellipses-outline', padding: 8,
                title: 'Qué preguntarle',
                description: 'Escribí aquí tu pregunta. Por ejemplo:\n• "¿Puedo comprarme un celular de Q3,000?"\n• "¿Cómo voy este mes?"\n• "¿En qué gasté más?"\n• "Dame un plan de ahorro para Q15,000"',
            },
            {
                id: 'ia_3', elementId: 'advisor_header', screen: 'advisor', position: 'bottom', icon: 'key-outline', padding: 8,
                title: 'Modo del asesor',
                description: 'Aquí ves el modo del asesor: "○ Modo local" analiza tus datos directamente en tu teléfono, sin internet ni configuración. Si querés respuestas abiertas, podés activar opcionalmente "● Gemini activo" pegando tu API Key gratuita de aistudio.google.com en Ajustes → Inteligencia Artificial (Gemini).',
            },
        ],
    },

    {
        id: 'tutorial_cuentas', title: 'Módulo de Cuentas',
        description: 'Registrá tus cuentas bancarias y tarjetas.',
        icon: 'wallet-outline', color: '#4A9EE8',
        steps: [
            {
                id: 'acc_1', elementId: 'accounts_widget', screen: 'dashboard', position: 'top', icon: 'business-outline', padding: 8,
                title: '¿Qué son las Cuentas?',
                description: 'Registrá tu dinero real (efectivo, cuentas bancarias, tarjetas de crédito e inversiones) para tener un patrimonio exacto. Para abrir el módulo tocá el widget de Cuentas en Inicio (deslizá hacia abajo si no lo ves).',
            },
            {
                id: 'acc_2', screen: 'dashboard', position: 'center', icon: 'card-outline',
                title: 'Cuentas conectadas',
                description: 'Cuando asignás una cuenta a un gasto, el saldo se actualiza automáticamente. Si pagás con BAC débito, el saldo de tu cuenta BAC baja al instante.',
            },
            {
                id: 'acc_3', screen: 'dashboard', position: 'center', icon: 'layers-outline',
                title: 'Visacuotas',
                description: 'Registrá compras en cuotas en la pestaña Visacuotas dentro de Cuentas. La app descuenta una cuota cada mes automáticamente y te muestra cuándo terminás de pagar.',
            },
        ],
    },

    {
        id: 'tutorial_stats', title: 'Estadísticas',
        description: 'Tus indicadores financieros clave.',
        icon: 'bar-chart-outline', color: '#2ECC71',
        steps: [
            {
                id: 'stats_1', elementId: 'tab_stats', position: 'top', icon: 'bar-chart-outline', padding: 8,
                title: 'Abrí Estadísticas',
                description: 'Tocá Estadísticas en la barra inferior para ver el análisis completo de tus movimientos. Al tocar "Siguiente" te llevamos ahí.',
            },
            {
                id: 'stats_2', elementId: 'stats_filter', screen: 'stats', position: 'bottom', icon: 'calendar-outline', padding: 8,
                title: 'Elegí el período',
                description: 'Filtrá por Período Actual, Período Anterior, Este Año o Todo. Todas las gráficas y tarjetas de abajo se recalculan según el período elegido.',
            },
            {
                id: 'stats_3', elementId: 'stats_pie', screen: 'stats', position: 'bottom', icon: 'pie-chart-outline', padding: 8,
                title: 'Gráfica de Pastel',
                description: 'Muestra en qué categorías gastás más. Tocá una porción o una fila de la leyenda para ver su monto y porcentaje. Si aún no hay gastos en el período, esta gráfica no aparece.',
            },
            {
                id: 'stats_4', elementId: 'stats_projected', screen: 'stats', position: 'top', icon: 'trending-up-outline', padding: 8,
                title: 'Flujo Proyectado',
                description: 'Basado en tu ritmo actual, calcula cuánto vas a gastar al final del período y si te va a sobrar o faltar dinero.',
            },
            {
                id: 'stats_5', screen: 'stats', position: 'center', icon: 'rocket-outline',
                title: 'Proyección de Ahorro',
                description: 'Al final de la pantalla, la Proyección de Ahorro estima cuánto acumularías en 6 y 12 meses si seguís ahorrando al mismo ritmo. Se basa en tus transacciones registradas, no en el saldo de tus cuentas.',
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

    getTutorial(id: string): Tutorial | undefined {
        return TUTORIALS.find(t => t.id === id);
    },
};