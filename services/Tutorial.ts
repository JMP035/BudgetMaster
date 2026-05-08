import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
export interface TutorialStep {
    id: string;
    title: string;
    description: string;
    targetRef?: string;      // Key del ref a iluminar
    position: 'top' | 'bottom' | 'center';
    icon: string;
    action?: string;      // Texto del botón de acción
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
// DEFINICIÓN DE TUTORIALES
// ─────────────────────────────────────────────────────────────
export const TUTORIALS: Tutorial[] = [

    // ── 1. Tour Inicial ───────────────────────────────────────
    {
        id: 'tour_inicial',
        title: 'Tour Inicial',
        description: 'Conoce las funciones principales de BudgetMaster en 5 minutos.',
        icon: 'rocket-outline',
        color: '#B87333',
        steps: [
            {
                id: 'tour_1', icon: 'home-outline', position: 'center',
                title: 'Bienvenido al Dashboard',
                description: 'Este es tu centro de control financiero. Aquí verás tu patrimonio, balance por moneda, presupuesto mensual y tus últimas transacciones. Tira hacia abajo para refrescar los datos.',
            },
            {
                id: 'tour_2', icon: 'sparkles-outline', position: 'center',
                title: 'CFO Intelligence',
                description: 'La tarjeta dorada en la parte superior es tu briefing diario. Tu asesor IA analiza tu situación financiera cada vez que abres la app y te da un resumen personalizado.',
            },
            {
                id: 'tour_3', icon: 'shield-checkmark-outline', position: 'center',
                title: 'Score Financiero',
                description: 'Tu puntuación del 0 al 100 refleja tu disciplina financiera real. Sube cuando ahorrás, pagás tus gastos fijos a tiempo y no superás tu presupuesto.',
            },
            {
                id: 'tour_4', icon: 'add-circle-outline', position: 'bottom',
                title: 'Botón "+" — Agregar',
                description: 'El botón cobre en el centro de la barra inferior es para agregar nuevas transacciones manualmente. También podés pegar un SMS bancario para que lo detecte automáticamente.',
            },
            {
                id: 'tour_5', icon: 'list-outline', position: 'bottom',
                title: 'Movimientos',
                description: 'Aquí ves todas tus transacciones. Podés filtrar por tipo (gastos/ingresos), moneda (Q/USD), y buscar por descripción o banco. Tocá cualquier transacción para ver el detalle completo.',
            },
            {
                id: 'tour_6', icon: 'wallet-outline', position: 'bottom',
                title: 'Presupuesto',
                description: 'Tu centro de planificación. Tiene 3 secciones: Gastos Fijos (compromisos mensuales), Categorías (límites por tipo de gasto) y Metas de ahorro.',
            },
            {
                id: 'tour_7', icon: 'sparkles-outline', position: 'bottom',
                title: 'Asesor IA',
                description: 'Tu CFO personal. Pregúntale lo que querás: si podés comprarte algo, cómo mejorar tus finanzas, qué hacer con un excedente. Responde con contexto real de tus datos.',
            },
        ],
    },

    // ── 2. Registrar un Gasto ─────────────────────────────────
    {
        id: 'tutorial_agregar',
        title: 'Registrar un Gasto o Ingreso',
        description: 'Aprende a agregar transacciones manualmente o desde SMS.',
        icon: 'add-circle-outline',
        color: '#4CB19F',
        steps: [
            {
                id: 'add_1', icon: 'add-outline', position: 'bottom',
                title: 'Toca el botón "+"',
                description: 'El botón cobre en el centro de la barra inferior abre la pantalla para agregar una nueva transacción. Tocalo para comenzar.',
                action: 'Entendido',
            },
            {
                id: 'add_2', icon: 'swap-horizontal-outline', position: 'top',
                title: 'Selecciona Gasto o Ingreso',
                description: 'Primero elige si es un gasto (algo que pagaste) o un ingreso (dinero que recibiste). El color de la pantalla cambia para diferenciarlo visualmente.',
            },
            {
                id: 'add_3', icon: 'cash-outline', position: 'center',
                title: 'Selecciona la Moneda',
                description: 'Elige entre Q (Quetzales), USD, EUR o £. Esto es importante — la app lleva balances separados por moneda para que tus reportes sean exactos.',
            },
            {
                id: 'add_4', icon: 'calculator-outline', position: 'center',
                title: 'Ingresa el Monto',
                description: 'Escribe el monto de la transacción. Usa punto para decimales (ej: 150.50). El campo acepta cualquier cantidad mayor a 0.',
            },
            {
                id: 'add_5', icon: 'pricetag-outline', position: 'center',
                title: 'Elige la Categoría',
                description: 'Selecciona la categoría que mejor describe este gasto o ingreso. Esto alimenta tus estadísticas y el presupuesto por categoría. Podés crear categorías propias en Ajustes.',
            },
            {
                id: 'add_6', icon: 'scan-outline', position: 'top',
                title: 'Leer SMS automáticamente',
                description: 'Si recibiste un SMS de tu banco, tocá "Leer SMS" en la esquina superior derecha. Copiá el mensaje de tu banco y pegalo ahí — la app detecta el monto, moneda y comercio automáticamente.',
            },
        ],
    },

    // ── 3. SMS Automático ─────────────────────────────────────
    {
        id: 'tutorial_sms',
        title: 'Sincronización SMS Automática',
        description: 'Aprende a conectar tus SMS bancarios para registro automático.',
        icon: 'chatbubble-outline',
        color: '#4A9EE8',
        steps: [
            {
                id: 'sms_1', icon: 'chatbubble-ellipses-outline', position: 'center',
                title: '¿Qué es la Sincronización SMS?',
                description: 'BudgetMaster puede leer los mensajes de texto de tus bancos (BAC, BANRURAL, GTC, BANTRAB, PROMERICA) y registrar tus gastos automáticamente, sin que tengas que escribir nada.',
            },
            {
                id: 'sms_2', icon: 'shield-outline', position: 'center',
                title: 'Privacidad garantizada',
                description: 'La app SOLO lee mensajes que contienen palabras bancarias (compra, débito, abono, etc.). Nunca lee mensajes de tus contactos personales. Todos los datos quedan en tu celular.',
            },
            {
                id: 'sms_3', icon: 'sync-circle-outline', position: 'top',
                title: 'Botón de Sync en el Dashboard',
                description: 'El ícono circular en la esquina superior derecha del Dashboard es el botón de sincronización. Tocalo para leer los últimos 300 SMS bancarios y registrar los que no estén aún en la app.',
            },
            {
                id: 'sms_4', icon: 'settings-outline', position: 'center',
                title: 'Activar o desactivar',
                description: 'En Ajustes podés activar o desactivar la sincronización SMS en cualquier momento. También verás qué bancos están soportados.',
            },
            {
                id: 'sms_5', icon: 'pencil-outline', position: 'center',
                title: 'Editar transacciones detectadas',
                description: 'Si una transacción detectada tiene la categoría o moneda incorrecta, tocala en Movimientos para editarla. También podés ver el SMS original completo.',
            },
        ],
    },

    // ── 4. Presupuesto ────────────────────────────────────────
    {
        id: 'tutorial_presupuesto',
        title: 'Cómo usar el Presupuesto',
        description: 'Gastos fijos, límites por categoría y metas de ahorro.',
        icon: 'wallet-outline',
        color: '#E8943A',
        steps: [
            {
                id: 'budget_1', icon: 'wallet-outline', position: 'bottom',
                title: 'La pantalla de Presupuesto',
                description: 'Tocá la tab "Presupuesto" en la barra inferior. Tiene 3 secciones: Gastos Fijos, Categorías y Metas. Deslizá entre ellas con los tabs de arriba.',
            },
            {
                id: 'budget_2', icon: 'calendar-outline', position: 'center',
                title: 'Gastos Fijos',
                description: 'Acá registrás tus compromisos mensuales fijos: renta, tarjetas, seguros, servicios. Cada mes aparecen con un checkbox. Cuando los pagás, los marcás como pagados ✅.',
            },
            {
                id: 'budget_3', icon: 'checkmark-circle-outline', position: 'center',
                title: 'Marcar como pagado',
                description: 'Al marcar un gasto fijo como pagado, si tenés activado "Registrar automáticamente", se crea una transacción en Movimientos. Si no querés que aparezca en el historial, desactivá esa opción al crearlo.',
            },
            {
                id: 'budget_4', icon: 'bar-chart-outline', position: 'center',
                title: 'Presupuesto por Categoría',
                description: 'En la tab "Categorías" podés asignar un límite mensual a cada categoría (ej: Comida Q1,500). La app te muestra una barra de progreso y te alerta cuando te acercás al límite.',
            },
            {
                id: 'budget_5', icon: 'trophy-outline', position: 'center',
                title: 'Metas de Ahorro',
                description: 'En "Metas" creás objetivos: una laptop, un viaje, un fondo de emergencia. La app calcula cuánto debés ahorrar por mes y te muestra tu progreso. Podés abonar manualmente cuando quieras.',
            },
        ],
    },

    // ── 5. Asesor IA ──────────────────────────────────────────
    {
        id: 'tutorial_ia',
        title: 'Cómo usar el Asesor IA',
        description: 'Tu CFO personal — pregúntale lo que necesitás saber.',
        icon: 'sparkles-outline',
        color: '#9B59B6',
        steps: [
            {
                id: 'ia_1', icon: 'sparkles-outline', position: 'bottom',
                title: '¿Qué es el Asesor IA?',
                description: 'Es tu CFO personal — un asesor financiero que conoce tus datos reales (gastos, ingresos, presupuesto, metas) y te responde con contexto específico de tu situación.',
            },
            {
                id: 'ia_2', icon: 'chatbubble-ellipses-outline', position: 'center',
                title: 'Cómo abrirlo',
                description: 'Tocá el ícono ✦ "Asesor" en la barra inferior. Se abre el chat desde cualquier pantalla sin perder lo que estabas viendo.',
            },
            {
                id: 'ia_3', icon: 'help-circle-outline', position: 'center',
                title: 'Qué preguntarle',
                description: 'Ejemplos:\n• "¿Puedo comprarme un celular de Q3,000?"\n• "¿Cómo voy este mes?"\n• "¿Cuánto debo ahorrar para mi meta de la laptop?"\n• "¿En qué categoría gasté más?"',
            },
            {
                id: 'ia_4', icon: 'key-outline', position: 'center',
                title: 'Activar Gemini para respuestas avanzadas',
                description: 'Sin API Key, el asesor usa lógica local básica. Con tu API Key de Google Gemini (gratuita en aistudio.google.com), las respuestas son mucho más naturales y detalladas. Configúrala en Ajustes.',
            },
        ],
    },

    // ── 6. Estadísticas ───────────────────────────────────────
    {
        id: 'tutorial_stats',
        title: 'Cómo leer las Estadísticas',
        description: 'Entiende tus 10 indicadores financieros clave.',
        icon: 'bar-chart-outline',
        color: '#2ECC71',
        steps: [
            {
                id: 'stats_1', icon: 'trending-up-outline', position: 'center',
                title: 'Flujo de Caja Proyectado',
                description: 'Basado en tu ritmo de gasto actual, la app calcula cuánto vas a gastar al final del mes. Si vas muy rápido, te lo avisa antes de que sea tarde.',
            },
            {
                id: 'stats_2', icon: 'bar-chart-outline', position: 'center',
                title: 'Comparativa mes a mes',
                description: 'Compara tus gastos e ingresos de los últimos 6 meses. Te muestra si estás mejorando o empeorando con el tiempo.',
            },
            {
                id: 'stats_3', icon: 'today-outline', position: 'center',
                title: 'Gasto Promedio Diario',
                description: 'Cuánto gastás en promedio cada día vs. cuánto deberías gastar para no superar tu presupuesto mensual. Una barra te muestra qué tan bien vas.',
            },
            {
                id: 'stats_4', icon: 'shield-checkmark-outline', position: 'center',
                title: 'Días Sin Gastar',
                description: 'Cuenta los días que no registraste ningún gasto. Si tenés una racha de 3+ días aparece un badge especial. Es un indicador de disciplina financiera.',
            },
            {
                id: 'stats_5', icon: 'rocket-outline', position: 'center',
                title: 'Proyección de Patrimonio',
                description: 'Si seguís ahorrando al mismo ritmo, ¿cuánto tendrás en 6 y 12 meses? La gráfica de línea proyecta tu patrimonio futuro basado en tu promedio actual.',
            },
        ],
    },
];

// ─────────────────────────────────────────────────────────────
// STORAGE — cuáles tutoriales ya completó el usuario
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