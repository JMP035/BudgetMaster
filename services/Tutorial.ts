import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
export interface TutorialStep {
    id: string;
    elementId?: string;   // ID del elemento registrado en TutorialContext (measureInWindow)
    title: string;
    description: string;
    position: 'top' | 'bottom' | 'center';
    icon: string;
    padding?: number;
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
                id: 'tour_1', elementId: 'briefing_card', position: 'bottom', icon: 'sparkles-outline', padding: 12,
                title: 'Tu CFO Personal',
                description: 'Esta tarjeta es tu briefing diario. La IA analiza tus finanzas y te da un resumen cada vez que abrís la app. Con tu API Key de Gemini es mucho más detallado.',
            },
            {
                id: 'tour_2', elementId: 'score_card', position: 'bottom', icon: 'shield-checkmark-outline', padding: 12,
                title: 'Score Financiero',
                description: 'Tu puntuación del 0 al 100. Sube cuando ahorrás, pagás tus compromisos a tiempo y no superás tu presupuesto. Es tu termómetro de disciplina financiera.',
            },
            {
                id: 'tour_3', elementId: 'sync_btn', position: 'bottom', icon: 'sync-circle-outline', padding: 16,
                title: 'Sync SMS',
                description: 'Este botón lee tus SMS bancarios (BAC, BANRURAL, GTC, BANTRAB) y registra tus gastos automáticamente. Tocalo para sincronizar.',
            },
            {
                id: 'tour_4', elementId: 'tab_add', position: 'top', icon: 'add-circle-outline', padding: 12,
                title: 'Agregar Transacción',
                description: 'El botón cobre central es para registrar gastos e ingresos manualmente. También podés pegar un SMS bancario para que lo detecte solo.',
            },
            {
                id: 'tour_5', elementId: 'tab_budget', position: 'top', icon: 'wallet-outline', padding: 8,
                title: 'Presupuesto',
                description: 'Aquí planificás tu mes — gastos fijos, límites por categoría y metas de ahorro. Es donde convertís tus intenciones en un plan real.',
            },
            {
                id: 'tour_6', elementId: 'tab_advisor', position: 'top', icon: 'sparkles-outline', padding: 8,
                title: 'Asesor IA',
                description: 'Tu CFO en modo chat. Preguntale lo que quieras — ¿puedo comprarme X?, ¿cómo voy este mes?, ¿qué hago con este excedente?',
            },
            {
                id: 'tour_7', elementId: 'tab_settings', position: 'top', icon: 'settings-outline', padding: 8,
                title: 'Ajustes y Academia',
                description: 'Configurá tu perfil, presupuesto y ciclo de pago. También encontrás todos los tutoriales disponibles en la sección Academia.',
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
                description: 'El botón cobre en el centro de la barra inferior abre la pantalla para agregar una nueva transacción.',
            },
            {
                id: 'add_2', elementId: 'add_type_selector', position: 'bottom', icon: 'swap-horizontal-outline', padding: 8,
                title: 'Gasto o Ingreso',
                description: 'Primero elegí si es un gasto (algo que pagaste) o un ingreso (dinero que recibiste).',
            },
            {
                id: 'add_3', elementId: 'add_currency', position: 'bottom', icon: 'cash-outline', padding: 8,
                title: 'Selecciona la Moneda',
                description: 'Elegí entre Q, USD, EUR o £. La app lleva balances separados por moneda.',
            },
            {
                id: 'add_4', elementId: 'add_amount', position: 'bottom', icon: 'calculator-outline', padding: 8,
                title: 'Ingresa el Monto',
                description: 'Escribí el monto. Si tenés una cuenta asignada, ese saldo se actualizará automáticamente.',
            },
            {
                id: 'add_5', elementId: 'add_description', position: 'bottom', icon: 'pencil-outline', padding: 8,
                title: 'Agregá una Descripción',
                description: 'Opcional pero recomendado: escribí en qué gastaste o de dónde viene el dinero. Te ayuda a identificar la transacción después.',
            },
            {
                id: 'add_6', elementId: 'add_category', position: 'top', icon: 'pricetag-outline', padding: 8,
                title: 'Elegí la Categoría',
                description: 'La categoría alimenta tus estadísticas y el presupuesto por categoría.',
            },
        ],
    },

    {
        id: 'tutorial_sms', title: 'Sincronización SMS',
        description: 'Registra gastos automáticamente desde tus SMS bancarios.',
        icon: 'chatbubble-outline', color: '#4A9EE8',
        steps: [
            {
                id: 'sms_1', elementId: 'sync_btn', position: 'bottom', icon: 'sync-outline', padding: 16,
                title: 'Botón de Sincronización',
                description: 'Este botón lee los últimos 2000 SMS de tu bandeja, detecta los bancarios y los registra automáticamente.',
            },
            {
                id: 'sms_2', position: 'center', icon: 'shield-outline',
                title: 'Tu privacidad está protegida',
                description: 'La app SOLO lee mensajes con palabras bancarias (compra, débito, abono). Nunca lee mensajes personales. Todo queda en tu celular.',
            },
            {
                id: 'sms_3', position: 'center', icon: 'settings-outline',
                title: 'Configurar en Ajustes',
                description: 'En Ajustes podés activar o desactivar el SMS automático. Bancos soportados: BAC, BANRURAL, GTC, BANTRAB y PROMERICA.',
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
                description: 'Tocá la tab Presupuesto. Tiene 3 secciones: Gastos Fijos, Categorías y Metas.',
            },
            {
                id: 'budget_2', elementId: 'budget_tab_fixed', position: 'bottom', icon: 'calendar-outline', padding: 8,
                title: 'Gastos Fijos',
                description: 'Registrá tus compromisos mensuales: renta, internet, seguros. Al marcarlos como pagados se registra la transacción automáticamente.',
            },
            {
                id: 'budget_3', elementId: 'budget_tab_categories', position: 'bottom', icon: 'bar-chart-outline', padding: 8,
                title: 'Presupuesto por Categoría',
                description: 'Asigná un límite a cada categoría. La app te avisa cuando llegás al 80% y te alerta si lo superás.',
            },
            {
                id: 'budget_4', elementId: 'budget_tab_goals', position: 'bottom', icon: 'trophy-outline', padding: 8,
                title: 'Metas de Ahorro',
                description: 'Creá objetivos con monto y fecha límite. La app calcula cuánto debés ahorrar por mes.',
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
                description: 'Tocá el ícono ✦ Asesor en la barra inferior. Se abre el chat desde cualquier pantalla.',
            },
            {
                id: 'ia_2', position: 'center', icon: 'chatbubble-ellipses-outline',
                title: 'Qué preguntarle',
                description: '• "¿Puedo comprarme un celular de Q3,000?"\n• "¿Cómo voy este mes?"\n• "¿En qué gasté más?"\n• "Dame un plan de ahorro para Q15,000"',
            },
            {
                id: 'ia_3', position: 'center', icon: 'key-outline',
                title: 'Activar Gemini',
                description: 'Sin API Key el asesor usa lógica básica. Con tu API Key de Google Gemini (gratuita en aistudio.google.com) las respuestas son mucho más naturales.',
            },
        ],
    },

    {
        id: 'tutorial_cuentas', title: 'Módulo de Cuentas',
        description: 'Registrá tus cuentas bancarias y tarjetas.',
        icon: 'wallet-outline', color: '#4A9EE8',
        steps: [
            {
                id: 'acc_1', position: 'center', icon: 'business-outline',
                title: '¿Qué son las Cuentas?',
                description: 'Registrá tu dinero real — efectivo, cuentas bancarias, tarjetas de crédito e inversiones — para tener un patrimonio neto exacto.',
            },
            {
                id: 'acc_2', position: 'center', icon: 'card-outline',
                title: 'Cuentas conectadas',
                description: 'Cuando asignás una cuenta a un gasto, el saldo se actualiza automáticamente. Si pagás con BAC débito, el saldo de tu cuenta BAC baja al instante.',
            },
            {
                id: 'acc_3', position: 'center', icon: 'layers-outline',
                title: 'Visacuotas',
                description: 'Registrá compras en cuotas. La app descuenta una cuota cada mes automáticamente y te muestra cuándo terminás de pagar.',
            },
        ],
    },

    {
        id: 'tutorial_stats', title: 'Estadísticas',
        description: 'Tus indicadores financieros clave.',
        icon: 'bar-chart-outline', color: '#2ECC71',
        steps: [
            {
                id: 'stats_1', position: 'center', icon: 'pie-chart-outline',
                title: 'Gráfica de Pastel',
                description: 'Muestra en qué categorías gastás más. Tocá cualquier slice para ver el detalle. Filtrá por Este Mes, Este Año o todo el historial.',
            },
            {
                id: 'stats_2', position: 'center', icon: 'trending-up-outline',
                title: 'Flujo Proyectado',
                description: 'Basado en tu ritmo actual, calcula cuánto vas a gastar al fin del mes y si te va a sobrar o faltar dinero.',
            },
            {
                id: 'stats_3', position: 'center', icon: 'rocket-outline',
                title: 'Proyección de Patrimonio',
                description: 'Si seguís ahorrando al mismo ritmo, ¿cuánto tendrás en 6 y 12 meses? La gráfica proyecta tu patrimonio futuro.',
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