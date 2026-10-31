import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
    CategoryBudget, FixedExpense, SavingsGoal,
    Transaction, UserSettings,
    getDaysUntilNextPayment, getEffectivePaymentDay,
    StorageService,
} from './storage';

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN — tipos correctos para SDK 54
// ─────────────────────────────────────────────────────────────
Notifications.setNotificationHandler({
    handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
        shouldShowBanner: true,
        shouldShowList: true,
    }),
});

// ─────────────────────────────────────────────────────────────
// FRASES DE PENSADORES
// ─────────────────────────────────────────────────────────────
const QUOTES = {
    discipline: [
        '"La autodisciplina es el puente entre las metas y los logros." — Napoleon Hill',
        '"Págate a ti mismo primero." — El Hombre Más Rico de Babilonia',
        '"Un presupuesto no te dice que no puedes gastar. Te dice dónde gastar." — Dave Ramsey',
        '"La libertad financiera no es un sueño. Es una decisión." — Napoleon Hill',
    ],
    warning: [
        '"Los pobres gastan primero y ahorran lo que sobra. Los ricos ahorran primero." — Kiyosaki',
        '"No es cuánto ganas, sino cuánto guardas." — Warren Buffett',
        '"El precio de todo es la cantidad de vida que das a cambio." — Thoreau',
        '"Una deuda sin plan es una cadena invisible." — Dave Ramsey',
    ],
    critical: [
        '"Si no encuentras la manera de ganar dinero mientras duermes, trabajarás hasta que mueras." — Kiyosaki',
        '"El que no controla su dinero, es controlado por su falta de él." — Ramsey',
        '"No es el salario lo que hace rico a un hombre, son sus hábitos de gasto." — Keyes',
        '"Tu futuro se crea por lo que haces hoy, no mañana." — Robert Kiyosaki',
    ],
    positive: [
        '"El éxito es la suma de pequeños esfuerzos repetidos día tras día." — Robert Collier',
        '"La riqueza no es un accidente. Es el resultado de decisiones correctas." — Napoleon Hill',
        '"Cada peso que ahorras hoy es un soldado trabajando para tu libertad mañana." — Kiyosaki',
    ],
};

function randomQuote(type: keyof typeof QUOTES): string {
    const arr = QUOTES[type];
    return arr[Math.floor(Math.random() * arr.length)];
}

// ─────────────────────────────────────────────────────────────
// IDENTIFICADORES FIJOS Y CONSTANTES DE NOTIFICACIONES NUEVAS
// ─────────────────────────────────────────────────────────────
const ID_FIXED_PREFIX = 'bm_fixed_';
const ID_WEEKLY = 'bm_weekly_summary';
const ID_AI_NUDGE = 'bm_ai_nudge';
const ID_SETUP = 'bm_setup_nudge';
const DAY_S = 86400;
const AI_NUDGE_INTERVAL_S = 12 * DAY_S;
const SETUP_NUDGE_DELAY_S = 30 * 60;

const AI_NUDGE_VARIANTS: { title: string; body: string }[] = [
    {
        title: '🤖 Tu Asesor IA te espera',
        body: '¿Querés saber en qué gastaste más estas semanas? Preguntale al Asesor IA desde la pestaña Asesor.',
    },
    {
        title: '💡 ¿Dudas con tu presupuesto?',
        body: 'El Asesor IA analiza tus movimientos y te dice dónde podés recortar. Abrilo desde la pestaña Asesor.',
    },
    {
        title: '📈 Revisá tus hábitos',
        body: 'Pedile al Asesor IA un análisis de tus gastos del mes y un plan para llegar a tu meta de ahorro.',
    },
];

const SETUP_NUDGES: Record<'budget' | 'fixed_expense' | 'category_budget' | 'savings_goal' | 'gemini_key', { label: string; title: string; body: string }> = {
    budget: {
        label: 'tu ingreso y presupuesto mensual',
        title: '⚙️ Configurá tu presupuesto',
        body: 'Todavía no definiste tu ingreso mensual. Configuralo en Ajustes para que las alertas de presupuesto sean precisas.',
    },
    fixed_expense: {
        label: 'tus gastos fijos',
        title: '📅 Registrá tus gastos fijos',
        body: 'Agregá tus gastos fijos (alquiler, servicios, etc.) en Presupuesto → Gastos Fijos y te recordamos 3 días antes de cada pago.',
    },
    category_budget: {
        label: 'límites por categoría',
        title: '📊 Poné límites por categoría',
        body: 'Definí límites en Presupuesto → Categorías y te avisamos cuando estés cerca del tope.',
    },
    savings_goal: {
        label: 'una meta de ahorro',
        title: '🎯 Creá una meta de ahorro',
        body: 'Creá una meta en Presupuesto → Metas y seguí tu avance con cada abono.',
    },
    gemini_key: {
        label: 'tu clave de Gemini',
        title: '✨ Activá el Asesor IA avanzado',
        body: 'Agregá tu API Key de Gemini en Ajustes → Inteligencia Artificial para recibir consejos personalizados.',
    },
};

// ─────────────────────────────────────────────────────────────
// CONTEXTO FINANCIERO PARA GEMINI
// ─────────────────────────────────────────────────────────────
function buildFinancialContext(
    settings: UserSettings,
    transactions: Transaction[],
    categoryBudgets: CategoryBudget[],
    fixedExpenses: FixedExpense[],
): string {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();

    const monthTx = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
    });

    const incomeQ = monthTx.filter(t => t.type === 'income' && t.currency === 'Q').reduce((s, t) => s + t.amount, 0);
    const expenseQ = monthTx.filter(t => t.type === 'expense' && t.currency === 'Q').reduce((s, t) => s + t.amount, 0);
    const daysLeft = getDaysUntilNextPayment(settings);
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysPassed = now.getDate();
    const dailyRate = expenseQ / Math.max(daysPassed, 1);
    const projected = dailyRate * daysInMonth;

    const catSummary = categoryBudgets.map(cb => {
        const spent = monthTx
            .filter(t => t.type === 'expense' && t.category === cb.categoryId && t.currency === 'Q')
            .reduce((s, t) => s + t.amount, 0);
        return `${cb.categoryId}: gastado Q${spent.toFixed(0)} de Q${cb.limit} (${Math.round((spent / cb.limit) * 100)}%)`;
    }).join(', ');

    const unpaidFixed = fixedExpenses.filter(f => f.isActive && !f.isPaid);

    return `
Usuario: ${settings.userName}
Ingreso declarado: Q${settings.monthlyIncome}
Presupuesto mensual: Q${settings.budgetLimit}
Gastado este mes en Q: ${expenseQ.toFixed(2)}
Ingresos registrados este mes: Q${incomeQ.toFixed(2)}
Días transcurridos: ${daysPassed} de ${daysInMonth}
Días hasta próximo pago: ${daysLeft}
Tasa diaria de gasto: Q${dailyRate.toFixed(2)}/día
Proyección fin de mes: Q${projected.toFixed(2)}
Gastos por categoría: ${catSummary || 'Sin presupuesto por categoría definido'}
Gastos fijos pendientes: ${unpaidFixed.length} (total Q${unpaidFixed.reduce((s, f) => s + f.amount, 0).toFixed(2)})
Deudas activas: Q${settings.activeDebts}
Meta de ahorro mensual: Q${settings.monthlySavingsGoal}
    `.trim();
}

// ─────────────────────────────────────────────────────────────
// LLAMADA A GEMINI
// ─────────────────────────────────────────────────────────────
async function getGeminiMessage(prompt: string, apiKey: string): Promise<string | null> {
    try {
        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    contents: [{ parts: [{ text: prompt }] }],
                    generationConfig: { maxOutputTokens: 200, temperature: 0.7 },
                }),
            }
        );
        const data = await res.json();
        if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
            return data.candidates[0].content.parts[0].text
                .replace(/\*\*/g, '')
                .replace(/\*/g, '')
                .trim();
        }
        return null;
    } catch {
        return null;
    }
}

// ─────────────────────────────────────────────────────────────
// ENVIAR NOTIFICACIÓN LOCAL — trigger corregido para SDK 54
// ─────────────────────────────────────────────────────────────
async function sendNotification(title: string, body: string, delaySeconds = 1): Promise<void> {
    try {
        await Notifications.scheduleNotificationAsync({
            content: { title, body, sound: true },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: Math.max(delaySeconds, 1),
            },
        });
    } catch (e) {
        console.warn('Notification error:', e);
    }
}

// ─────────────────────────────────────────────────────────────
// HELPERS DE NOTIFICACIONES CON IDENTIFICADOR FIJO
// ─────────────────────────────────────────────────────────────

/** Cancela una notificación programada por identificador, sin fallar si no existe */
async function safeCancel(identifier: string): Promise<void> {
    try {
        await Notifications.cancelScheduledNotificationAsync(identifier);
    } catch { }
}

/** Programa una notificación con identificador fijo, cancelando cualquier instancia previa con el mismo id */
async function scheduleWithId(
    identifier: string,
    title: string,
    body: string,
    seconds: number,
    data: Record<string, string>,
    repeats = false,
): Promise<boolean> {
    await safeCancel(identifier);
    try {
        await Notifications.scheduleNotificationAsync({
            identifier,
            content: { title, body, sound: true, data },
            trigger: {
                type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                seconds: Math.max(Math.floor(seconds), repeats ? 60 : 1),
                repeats,
            },
        });
        return true;
    } catch (e) {
        console.warn('scheduleWithId error:', e);
        return false;
    }
}

/** Calcula la próxima fecha de recordatorio (3 días antes del pago) de un gasto fijo, probando hasta 3 meses hacia adelante */
function computeFixedExpenseReminder(expense: FixedExpense, now: Date): { date: Date; payDay: number } | null {
    const startOffset = expense.isPaid ? 1 : 0;
    for (let offset = startOffset; offset <= startOffset + 2; offset++) {
        const y = now.getFullYear();
        const m = now.getMonth() + offset;
        const payDay = getEffectivePaymentDay(expense.dayOfMonth, y, m);
        const date = new Date(y, m, payDay - 3, 9, 0, 0);
        if (date.getTime() - now.getTime() > 60_000) {
            return { date, payDay: new Date(y, m, payDay).getDate() };
        }
    }
    return null;
}

/** Une una lista de strings en español: "a", "a y b", "a, b y c" */
function joinEs(items: string[]): string {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
}

/** Construye el cuerpo del resumen semanal con datos reales del mes calendario actual */
function buildWeeklySummaryBody(
    settings: UserSettings,
    transactions: Transaction[],
    categoryBudgets: CategoryBudget[],
    fixedExpenses: FixedExpense[],
    now: Date,
): string {
    const m = now.getMonth();
    const y = now.getFullYear();

    const monthTx = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
    });

    const spentQ = monthTx.filter(t => t.type === 'expense' && t.currency === 'Q').reduce((s, t) => s + t.amount, 0);
    const budgetLimit = settings.budgetLimit;
    const hasBudget = budgetLimit > 0;
    const pct = hasBudget ? Math.round((spentQ / budgetLimit) * 100) : 0;
    const remaining = budgetLimit - spentQ;
    const daysLeft = getDaysUntilNextPayment(settings);
    const unpaid = fixedExpenses.filter(f => f.isActive && !f.isPaid);
    const catAlerts = categoryBudgets.filter(cb => {
        if (cb.limit <= 0) return false;
        const spent = monthTx
            .filter(t => t.type === 'expense' && t.category === cb.categoryId && t.currency === 'Q')
            .reduce((s, t) => s + t.amount, 0);
        return (spent / cb.limit) >= 0.8;
    });

    const dd = String(now.getDate()).padStart(2, '0');
    const mm = String(now.getMonth() + 1).padStart(2, '0');

    const parts: string[] = [];
    parts.push(
        `Corte al ${dd}/${mm}: llevás Q${spentQ.toFixed(2)} gastados este mes` +
        (hasBudget ? ` de Q${budgetLimit.toFixed(2)} (${pct}%).` : '.')
    );
    if (hasBudget) {
        parts.push(
            remaining >= 0
                ? `Te quedan Q${remaining.toFixed(2)}.`
                : `Superaste el presupuesto por Q${Math.abs(remaining).toFixed(2)}.`
        );
    }
    parts.push(`Próximo ingreso en ${daysLeft} día(s).`);
    if (unpaid.length) parts.push(`${unpaid.length} gasto(s) fijo(s) pendiente(s).`);
    if (catAlerts.length) parts.push(`${catAlerts.length} categoría(s) al 80% o más.`);

    return parts.join(' ');
}

// ─────────────────────────────────────────────────────────────
// SERVICIO PRINCIPAL
// ─────────────────────────────────────────────────────────────
export const NotificationService = {

    // ── Pedir permisos ───────────────────────────────────────
    async requestPermissions(): Promise<boolean> {
        if (Platform.OS === 'web') return false;
        try {
            const { status } = await Notifications.requestPermissionsAsync();
            return status === 'granted';
        } catch {
            return false;
        }
    },

    // ── Alerta al agregar transacción ────────────────────────
    async onTransactionAdded(
        tx: Transaction,
        transactions: Transaction[],
        settings: UserSettings,
        categoryBudgets: CategoryBudget[],
        fixedExpenses: FixedExpense[],
    ): Promise<void> {
        if (tx.type !== 'expense' || tx.currency !== 'Q') return;

        const now = new Date();
        const m = now.getMonth();
        const y = now.getFullYear();
        const monthTx = transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === m && d.getFullYear() === y &&
                t.type === 'expense' && t.currency === 'Q';
        });

        // "transactions" ya incluye la transacción recién agregada (tx)
        const totalSpent = monthTx.reduce((s, t) => s + t.amount, 0);
        const pct = settings.budgetLimit > 0 ? (totalSpent / settings.budgetLimit) * 100 : 0;
        const remaining = settings.budgetLimit - totalSpent;
        const daysLeft = getDaysUntilNextPayment(settings);
        const dailyLeft = daysLeft > 0 ? remaining / daysLeft : remaining;

        // ── Alerta por categoría ─────────────────────────────
        const catBudget = categoryBudgets.find(cb => cb.categoryId === tx.category);
        if (catBudget && catBudget.limit > 0) {
            const catSpent = monthTx
                .filter(t => t.category === tx.category)
                .reduce((s, t) => s + t.amount, 0);
            const catPct = (catSpent / catBudget.limit) * 100;

            if (catPct >= 100) {
                await this.sendSmartAlert(
                    '🔴 Límite de categoría superado',
                    'critical',
                    `Superaste el presupuesto de ${tx.category}. Gastado: Q${catSpent.toFixed(2)} de Q${catBudget.limit}. Exceso: Q${(catSpent - catBudget.limit).toFixed(2)}.`,
                    settings, transactions, categoryBudgets, fixedExpenses,
                );
                return;
            }
            if (catPct >= 80) {
                await this.sendSmartAlert(
                    `⚠️ Categoría al ${Math.round(catPct)}%`,
                    'warning',
                    `Vas en el ${Math.round(catPct)}% de tu presupuesto de ${tx.category}. Te quedan Q${(catBudget.limit - catSpent).toFixed(2)}.`,
                    settings, transactions, categoryBudgets, fixedExpenses,
                );
                return;
            }
        }

        // ── Alertas por presupuesto general ──────────────────
        if (pct >= 100) {
            await this.sendSmartAlert(
                '🚨 Presupuesto agotado',
                'critical',
                `Has gastado Q${totalSpent.toFixed(2)} — superaste tu límite de Q${settings.budgetLimit} en Q${(totalSpent - settings.budgetLimit).toFixed(2)}. Quedan ${daysLeft} días hasta tu próximo ingreso.`,
                settings, transactions, categoryBudgets, fixedExpenses,
            );
        } else if (pct >= 80) {
            await this.sendSmartAlert(
                `⚠️ Vas en el ${Math.round(pct)}% de tu presupuesto`,
                'warning',
                `Gastaste Q${totalSpent.toFixed(2)} de Q${settings.budgetLimit}. Te quedan Q${remaining.toFixed(2)} para ${daysLeft} días — Q${dailyLeft.toFixed(2)}/día disponibles.`,
                settings, transactions, categoryBudgets, fixedExpenses,
            );
        } else if (pct >= 50) {
            await this.sendSmartAlert(
                '📊 Vas en la mitad de tu presupuesto',
                'discipline',
                `Llevas el ${Math.round(pct)}% de tu presupuesto. Te quedan Q${remaining.toFixed(2)} para ${daysLeft} días — aproximadamente Q${dailyLeft.toFixed(2)} por día.`,
                settings, transactions, categoryBudgets, fixedExpenses,
            );
        } else {
            await sendNotification(
                '💰 Gasto registrado',
                `Q${tx.amount.toFixed(2)} registrado. Llevas Q${totalSpent.toFixed(2)} de Q${settings.budgetLimit} este mes (${Math.round(pct)}%). Te quedan Q${remaining.toFixed(2)}.`,
            );
        }
    },

    // ── Alerta inteligente Gemini + fallback ─────────────────
    async sendSmartAlert(
        title: string,
        quoteType: keyof typeof QUOTES,
        context: string,
        settings: UserSettings,
        transactions: Transaction[],
        categoryBudgets: CategoryBudget[],
        fixedExpenses: FixedExpense[],
    ): Promise<void> {
        const financialCtx = buildFinancialContext(settings, transactions, categoryBudgets, fixedExpenses);
        const quote = randomQuote(quoteType);
        let body = '';

        if (settings.geminiApiKey && settings.geminiApiKey.length > 20) {
            const prompt = `
Eres el CFO personal de ${settings.userName}. Tono directo, profesional y motivador. Sin emojis en exceso.
Contexto financiero:
${financialCtx}

Situación: ${context}

Genera una notificación corta (máximo 3 oraciones) que:
1. Describa la situación con datos reales
2. Dé UN consejo concreto y accionable
3. Termine con esta frase: ${quote}

Responde SOLO el texto, sin encabezados ni formato.
            `.trim();

            const aiMsg = await getGeminiMessage(prompt, settings.geminiApiKey);
            if (aiMsg) body = aiMsg;
        }

        if (!body) body = `${context}\n\n${quote}`;
        await sendNotification(title, body);
    },

    // ── Recordatorio de gasto fijo — identificador fijo por gasto ───
    async scheduleFixedExpenseReminder(expense: FixedExpense, now: Date = new Date()): Promise<void> {
        const id = ID_FIXED_PREFIX + expense.id;
        await safeCancel(id);
        if (!expense.isActive) return;

        const r = computeFixedExpenseReminder(expense, now);
        if (!r) return;

        await scheduleWithId(
            id,
            '📅 Gasto fijo próximo',
            `${expense.name} vence en 3 días (día ${r.payDay}) — ${expense.currency} ${expense.amount.toFixed(2)}. Asegurate de tener el dinero disponible.`,
            (r.date.getTime() - now.getTime()) / 1000,
            { kind: 'fixed_expense', refId: expense.id },
        );
    },

    /** Cancela el recordatorio de un gasto fijo específico (ej. al eliminarlo) */
    async cancelFixedExpenseReminder(expenseId: string): Promise<void> {
        await safeCancel(ID_FIXED_PREFIX + expenseId);
    },

    /** Reprograma los recordatorios de todos los gastos fijos activos y limpia los huérfanos/legado. Idempotente. */
    async syncFixedExpenseReminders(expenses: FixedExpense[]): Promise<void> {
        try {
            const scheduled = await Notifications.getAllScheduledNotificationsAsync();
            const ids = new Set(expenses.map(e => ID_FIXED_PREFIX + e.id));

            for (const n of scheduled) {
                const isOrphan = n.identifier.startsWith(ID_FIXED_PREFIX) && !ids.has(n.identifier);
                const isLegacy = !n.identifier.startsWith(ID_FIXED_PREFIX) && n.content?.title === '📅 Gasto fijo próximo';
                if (isOrphan || isLegacy) await safeCancel(n.identifier);
            }

            for (const e of expenses) await this.scheduleFixedExpenseReminder(e);
        } catch (e) {
            console.warn('syncFixedExpenseReminders error:', e);
        }
    },

    // ── Resumen semanal — fecha de disparo estable, contenido fresco ──
    // D4: se guarda weeklySummaryFireAt y se conserva mientras no haya pasado
    // ni falten ≤60s; el texto siempre se recalcula al momento de programar.
    async scheduleWeeklySummary(
        settings: UserSettings,
        transactions: Transaction[],
        categoryBudgets: CategoryBudget[],
        fixedExpenses: FixedExpense[],
    ): Promise<void> {
        try {
            // Migración del resumen legado (repeats: true, sin identifier fijo)
            const scheduled = await Notifications.getAllScheduledNotificationsAsync();
            for (const n of scheduled) {
                if (n.identifier !== ID_WEEKLY && n.content?.title?.includes('Resumen Semanal')) {
                    await safeCancel(n.identifier);
                }
            }

            const now = new Date();
            const state = await StorageService.getNotificationState();
            let fireAt = state.weeklySummaryFireAt ? new Date(state.weeklySummaryFireAt) : null;
            if (!fireAt || isNaN(fireAt.getTime()) || fireAt.getTime() - now.getTime() <= 60_000) {
                fireAt = new Date(now.getTime() + 7 * DAY_S * 1000);
            }

            const body = buildWeeklySummaryBody(settings, transactions, categoryBudgets, fixedExpenses, now);
            const ok = await scheduleWithId(
                ID_WEEKLY,
                '📊 Resumen Semanal — BudgetMaster',
                body,
                (fireAt.getTime() - now.getTime()) / 1000,
                { kind: 'weekly_summary' },
            );
            if (ok) await StorageService.setWeeklySummaryFireAt(fireAt.toISOString());
        } catch (e) {
            console.warn('scheduleWeeklySummary error:', e);
        }
    },

    // ── Aviso periódico al Asesor IA ──────────────────────────
    // La variante elegida queda fija mientras siga programada; es aceptable.
    async scheduleAIAdvisorNudge(): Promise<void> {
        try {
            const scheduled = await Notifications.getAllScheduledNotificationsAsync();
            if (scheduled.some(n => n.identifier === ID_AI_NUDGE)) return;

            const v = AI_NUDGE_VARIANTS[Math.floor(Math.random() * AI_NUDGE_VARIANTS.length)];
            await scheduleWithId(ID_AI_NUDGE, v.title, v.body, AI_NUDGE_INTERVAL_S, { kind: 'ai_nudge' }, true);
        } catch (e) {
            console.warn('scheduleAIAdvisorNudge error:', e);
        }
    },

    // ── Aviso único de configuración pendiente ────────────────
    async checkSetupNudges(
        settings: UserSettings,
        fixedExpenses: FixedExpense[],
        categoryBudgets: CategoryBudget[],
        savingsGoals: SavingsGoal[],
    ): Promise<void> {
        try {
            const missing: (keyof typeof SETUP_NUDGES)[] = [];
            if (settings.monthlyIncome <= 0 || settings.budgetLimit <= 0) missing.push('budget');
            if (fixedExpenses.length === 0) missing.push('fixed_expense');
            if (categoryBudgets.length === 0) missing.push('category_budget');
            if (savingsGoals.length === 0) missing.push('savings_goal');
            if (!settings.geminiApiKey || settings.geminiApiKey.length <= 20) missing.push('gemini_key');

            const state = await StorageService.getNotificationState();
            const pending = missing.filter(id => !state.setupNudgesShown.includes(id));
            if (!pending.length) return;

            let title: string;
            let body: string;
            if (pending.length === 1) {
                title = SETUP_NUDGES[pending[0]].title;
                body = SETUP_NUDGES[pending[0]].body;
            } else {
                title = '⚙️ Completá tu configuración';
                body = `Te falta configurar ${joinEs(pending.map(id => SETUP_NUDGES[id].label))}. Hacelo desde Presupuesto y Ajustes para sacarle el máximo a BudgetMaster.`;
            }

            const ok = await scheduleWithId(ID_SETUP, title, body, SETUP_NUDGE_DELAY_S, { kind: 'setup_nudge', refId: pending.join(',') });
            if (ok) await StorageService.markSetupNudgesShown(pending);
        } catch (e) {
            console.warn('checkSetupNudges error:', e);
        }
    },

    // ── Alerta de meta de ahorro ──────────────────────────────
    async notifyGoalProgress(goal: SavingsGoal, settings: UserSettings): Promise<void> {
        const pct = (goal.currentAmount / goal.targetAmount) * 100;
        const remaining = goal.targetAmount - goal.currentAmount;
        const deadline = new Date(goal.deadline);
        const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
        const monthly = daysLeft > 0 ? (remaining / (daysLeft / 30)).toFixed(2) : '0';

        if (pct >= 100) {
            await sendNotification(
                '🏆 ¡Meta alcanzada!',
                `Lograste tu meta "${goal.name}" de ${goal.currency} ${goal.targetAmount.toFixed(2)}. ${randomQuote('positive')}`,
            );
        } else if (pct >= 50) {
            const body = daysLeft <= 0
                ? `Te faltan ${goal.currency} ${remaining.toFixed(2)}. La fecha límite ya pasó; considerá ajustarla.`
                : `Te faltan ${goal.currency} ${remaining.toFixed(2)}. Ahorrando ${goal.currency} ${monthly}/mes llegas en ${Math.ceil(daysLeft / 30)} meses.`;
            await sendNotification(
                `🎯 ${Math.round(pct)}% de tu meta "${goal.name}"`,
                body,
            );
        }
    },

    /** Notifica avance de meta solo si el abono cruzó el umbral del 50% o del 100% */
    async notifyGoalProgressIfCrossed(prev: SavingsGoal, updated: SavingsGoal, settings: UserSettings): Promise<void> {
        if (updated.targetAmount <= 0) return;
        const before = (prev.currentAmount / prev.targetAmount) * 100;
        const after = (updated.currentAmount / updated.targetAmount) * 100;
        const crossed = (before < 100 && after >= 100) || (before < 50 && after >= 50);
        if (crossed) await this.notifyGoalProgress(updated, settings);
    },

    // ── Briefing diario para el Dashboard ────────────────────
    async getDailyBriefing(
        settings: UserSettings,
        transactions: Transaction[],
        categoryBudgets: CategoryBudget[],
        fixedExpenses: FixedExpense[],
    ): Promise<string> {
        const now = new Date();
        const m = now.getMonth();
        const y = now.getFullYear();
        const daysLeft = getDaysUntilNextPayment(settings);

        const monthTx = transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === m && d.getFullYear() === y;
        });

        const expenseQ = monthTx.filter(t => t.type === 'expense' && t.currency === 'Q').reduce((s, t) => s + t.amount, 0);
        const remaining = settings.budgetLimit - expenseQ;
        const pct = Math.round((expenseQ / Math.max(settings.budgetLimit, 1)) * 100);
        const unpaid = fixedExpenses.filter(f => f.isActive && !f.isPaid);

        const catAlerts = categoryBudgets.filter(cb => {
            const spent = monthTx
                .filter(t => t.type === 'expense' && t.category === cb.categoryId && t.currency === 'Q')
                .reduce((s, t) => s + t.amount, 0);
            return (spent / cb.limit) >= 0.8;
        });

        if (settings.geminiApiKey && settings.geminiApiKey.length > 20) {
            const ctx = buildFinancialContext(settings, transactions, categoryBudgets, fixedExpenses);
            const prompt = `
Eres el CFO personal de ${settings.userName}. Genera un briefing financiero breve (máximo 4 oraciones).
Menciona: presupuesto actual (${pct}%), días hasta próximo pago (${daysLeft}), gastos fijos pendientes (${unpaid.length}), categorías en alerta (${catAlerts.length}).
Sé directo, usa datos reales, termina con una frase motivacional corta.
Contexto: ${ctx}
Responde SOLO el texto del briefing.
            `.trim();

            const aiMsg = await getGeminiMessage(prompt, settings.geminiApiKey);
            if (aiMsg) return aiMsg;
        }

        // Fallback sin IA
        const parts: string[] = [];
        parts.push(`Buenos días, ${settings.userName}. Llevas el ${pct}% de tu presupuesto mensual.`);
        if (remaining > 0) {
            parts.push(`Te quedan Q${remaining.toFixed(2)} para ${daysLeft} días.`);
        } else {
            parts.push(`Has superado tu presupuesto en Q${Math.abs(remaining).toFixed(2)}.`);
        }
        if (unpaid.length > 0) parts.push(`Tienes ${unpaid.length} gasto(s) fijo(s) pendiente(s) este mes.`);
        if (catAlerts.length > 0) parts.push(`${catAlerts.length} categoría(s) cerca del límite.`);
        parts.push(randomQuote('discipline'));

        return parts.join(' ');
    },

    // ── Avisos de arranque (resumen semanal, nudge IA, config pendiente) ──
    async runStartupNotifications(data: {
        settings: UserSettings;
        transactions: Transaction[];
        fixedExpenses: FixedExpense[];
        categoryBudgets: CategoryBudget[];
        savingsGoals: SavingsGoal[];
    }): Promise<void> {
        if (Platform.OS === 'web') return;
        if (!data.settings.onboardingComplete || !data.settings.cardsOnboardingComplete) return;

        try {
            await this.scheduleWeeklySummary(data.settings, data.transactions, data.categoryBudgets, data.fixedExpenses);
        } catch (e) { console.warn('runStartupNotifications weeklySummary:', e); }

        try {
            await this.scheduleAIAdvisorNudge();
        } catch (e) { console.warn('runStartupNotifications aiNudge:', e); }

        try {
            await this.checkSetupNudges(data.settings, data.fixedExpenses, data.categoryBudgets, data.savingsGoals);
        } catch (e) { console.warn('runStartupNotifications setupNudges:', e); }
    },

    // ── Cancelar todas las notificaciones ────────────────────
    async cancelAll(): Promise<void> {
        try {
            await Notifications.cancelAllScheduledNotificationsAsync();
        } catch { }
    },
};