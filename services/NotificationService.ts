import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
    CategoryBudget, FixedExpense, SavingsGoal,
    Transaction, UserSettings,
    getDaysUntilNextPayment
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
        const pct = (totalSpent / settings.budgetLimit) * 100;
        const remaining = settings.budgetLimit - totalSpent;
        const daysLeft = getDaysUntilNextPayment(settings);
        const dailyLeft = daysLeft > 0 ? remaining / daysLeft : remaining;

        // ── Alerta por categoría ─────────────────────────────
        const catBudget = categoryBudgets.find(cb => cb.categoryId === tx.category);
        if (catBudget) {
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

    // ── Recordatorio de gasto fijo — trigger corregido ───────
    async scheduleFixedExpenseReminder(expense: FixedExpense): Promise<void> {
        const now = new Date();
        const reminderDay = expense.dayOfMonth - 3;
        const year = now.getFullYear();
        const month = now.getMonth();

        const reminderDate = new Date(year, month, reminderDay, 9, 0, 0);
        if (reminderDate <= now) return;

        const secondsUntil = Math.floor((reminderDate.getTime() - now.getTime()) / 1000);
        if (secondsUntil <= 0) return;

        try {
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📅 Gasto fijo próximo',
                    body: `${expense.name} vence en 3 días — Q${expense.amount.toFixed(2)}. Asegúrate de tener el dinero disponible.`,
                    sound: true,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: secondsUntil,
                },
            });
        } catch (e) {
            console.warn('scheduleFixedExpenseReminder error:', e);
        }
    },

    // ── Resumen semanal — trigger corregido ──────────────────
    async scheduleWeeklySummary(): Promise<void> {
        try {
            // Si ya hay un resumen semanal programado, no reprogramar:
            // reprogramarlo reiniciaría el temporizador de 7 días en cada
            // apertura y cancelar TODO borraría los recordatorios de gastos fijos.
            const scheduled = await Notifications.getAllScheduledNotificationsAsync();
            const exists = scheduled.some(n => n.content?.title?.includes('Resumen Semanal'));
            if (exists) return;

            await Notifications.scheduleNotificationAsync({
                content: {
                    title: '📊 Resumen Semanal — BudgetMaster',
                    body: 'Abre la app para ver cómo vas con tu presupuesto esta semana.',
                    sound: true,
                },
                trigger: {
                    type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL,
                    seconds: 60 * 60 * 24 * 7, // 7 días
                    repeats: true,
                },
            });
        } catch (e) {
            console.warn('scheduleWeeklySummary error:', e);
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
            await sendNotification(
                `🎯 ${Math.round(pct)}% de tu meta "${goal.name}"`,
                `Te faltan ${goal.currency} ${remaining.toFixed(2)}. Ahorrando ${goal.currency} ${monthly}/mes llegas en ${Math.ceil(daysLeft / 30)} meses.`,
            );
        }
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

    // ── Cancelar todas las notificaciones ────────────────────
    async cancelAll(): Promise<void> {
        try {
            await Notifications.cancelAllScheduledNotificationsAsync();
        } catch { }
    },
};