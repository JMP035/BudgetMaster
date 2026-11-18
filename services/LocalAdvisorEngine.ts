import {
    Account, CategoryBudget, CreditInstallment, FixedExpense, SavingsGoal,
    Transaction, UserSettings, FinancialPeriod,
    calcCreditCommitments, calcNetWorthFromAccounts, convertAmount,
    getAccountMonthlyInstallmentTotal, getCurrentFinancialPeriod,
    getDaysUntilNextPayment, parseAmount, parseDateOnly, storedDateToDateOnly,
} from './storage';
import { isBalanceTracked } from './Balances';
import { categoryLabelOf, EXPENSE_CATEGORIES } from '../categories';
import { QuoteTone, randomQuote, dailyQuote } from './FinancialQuotes';
import { fixedCycleConfig, fixedDueInfo } from './FixedCycle';

const MONTHS_SHORT_ES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

/** "28 oct" */
function fmtShortDate(d: Date): string {
    return `${d.getDate()} ${MONTHS_SHORT_ES[d.getMonth()]}`;
}

// ─────────────────────────────────────────────────────────────
// 4a. HELPERS DE TEXTO
// ─────────────────────────────────────────────────────────────

/** Minúsculas y sin tildes/ñ, sin signos de puntuación, espacios colapsados. No usa String.prototype.normalize. */
function normalizeText(s: string): string {
    return s
        .toLowerCase()
        .replace(/[áàäâ]/g, 'a')
        .replace(/[éèëê]/g, 'e')
        .replace(/[íìïî]/g, 'i')
        .replace(/[óòöô]/g, 'o')
        .replace(/[úùüû]/g, 'u')
        .replace(/ñ/g, 'n')
        .replace(/[¿?¡!.,;:"()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

/** "Q" + monto con separador de miles (coma). Sin toLocaleString. */
function fmtQ(n: number): string {
    const sign = n < 0 ? '-' : '';
    const rounded = Math.round(Math.abs(n));
    const withCommas = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}Q${withCommas}`;
}

/** Igual que fmtQ si currency === 'Q'; si no, "{currency} {miles}". */
function fmtMoney(n: number, currency: string): string {
    if (currency === 'Q') return fmtQ(n);
    const sign = n < 0 ? '-' : '';
    const rounded = Math.round(Math.abs(n));
    const withCommas = String(rounded).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    return `${sign}${currency} ${withCommas}`;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function hasWord(msgNorm: string, alias: string): boolean {
    return new RegExp('\\b' + escapeRegExp(alias) + '(s|es)?\\b').test(msgNorm);
}

// ─────────────────────────────────────────────────────────────
// 4b. SELECTOR DE VARIANTES
// ─────────────────────────────────────────────────────────────
const lastVariant: Record<string, number> = {};

function pickVariant(key: string, count: number, mode: 'random' | 'daily'): number {
    if (count <= 1) return 0;
    if (mode === 'daily') {
        return new Date().getDate() % count;
    }
    let idx = Math.floor(Math.random() * count);
    if (count > 1 && idx === lastVariant[key]) {
        idx = (idx + 1) % count;
    }
    lastVariant[key] = idx;
    return idx;
}

// ─────────────────────────────────────────────────────────────
// 4c. CATEGORY_ALIASES
// ─────────────────────────────────────────────────────────────
const CATEGORY_ALIASES: Record<string, string[]> = {
    food: ['comida', 'almuerzo', 'desayuno', 'cena', 'campero'],
    groceries: ['supermercado', 'super', 'despensa', 'paiz', 'walmart', 'mercado'],
    transport: ['transporte', 'uber', 'taxi', 'bus', 'camioneta', 'pasaje'],
    fuel: ['gasolina', 'combustible', 'gasolinera', 'diesel'],
    entertainment: ['entretenimiento', 'diversion', 'cine', 'salidas'],
    streaming: ['streaming', 'netflix', 'spotify', 'disney'],
    shopping: ['compras'],
    clothes: ['ropa', 'zapatos'],
    health: ['salud', 'medico', 'doctor', 'hospital'],
    pharmacy: ['farmacia', 'medicina', 'medicinas'],
    education: ['educacion', 'colegio', 'universidad', 'estudios'],
    utilities: ['luz', 'agua', 'energia', 'servicios'],
    internet: ['internet', 'telefono', 'celular'],
    rent: ['renta', 'alquiler', 'casa'],
    travel: ['viaje', 'viajes'],
    restaurant: ['restaurante', 'restaurantes'],
    atm: ['retiro', 'cajero', 'atm'],
    transfer: ['transferencia', 'transferencias'],
    subscriptions: ['suscripcion', 'suscripciones'],
    other: [],
};

function findCategoryInMessage(msgNorm: string, settings: UserSettings): string | null {
    const customCategories = settings.customCategories ?? [];
    // Custom primero (expense/both)
    for (const c of customCategories) {
        if (c.type !== 'expense' && c.type !== 'both') continue;
        const alias = normalizeText(c.label);
        if (alias && hasWord(msgNorm, alias)) return c.id;
    }
    // Predefinidas
    for (const cat of EXPENSE_CATEGORIES) {
        if (cat.id === 'other') continue;
        const aliases = CATEGORY_ALIASES[cat.id] ?? [];
        const labelAlias = normalizeText(cat.label).replace(/\.$/, '');
        const allAliases = [...aliases, labelAlias];
        for (const alias of allAliases) {
            if (alias && hasWord(msgNorm, alias)) return cat.id;
        }
    }
    return null;
}

// ─────────────────────────────────────────────────────────────
// 4d. LocalMetrics
// ─────────────────────────────────────────────────────────────
export interface LocalMetrics {
    fp: FinancialPeriod;
    now: Date;
    daysLeft: number;
    nextPayDate: Date;
    periodTx: Transaction[];
    expenseQ: number;
    incomeQ: number;
    net: number;
    hasBudget: boolean;
    remaining: number;
    pct: number;
    daysLeftInPeriod: number;
    dailyRate: number;
    projected: number;
    prevExpQ: number;
    prevIncomeQ: number;
    prevSamePointExpQ: number;
    catTotals: { id: string; label: string; amount: number }[];
    prevCatSamePoint: Record<string, number>;
    fixedActive: FixedExpense[];
    fixedPendingList: FixedExpense[];
    fixedTotalQ: number;
    fixedPendingQ: number;
    installTotal: number;
    installmentsPendingQ: number;
    activeInstallments: CreditInstallment[];
    totalBalance: number;
    activeAccounts: Account[];
    activeGoals: SavingsGoal[];
    completedGoalsCount: number;
    budgetAlerts: { id: string; label: string; spent: number; limit: number; pctB: number }[];
    tone: QuoteTone;
    hasAnyData: boolean;
    settings: UserSettings;
}

export function computeLocalMetrics(
    transactions: Transaction[],
    settings: UserSettings,
    accounts: Account[] = [],
    fixedExpenses: FixedExpense[] = [],
    savingsGoals: SavingsGoal[] = [],
    creditInstallments: CreditInstallment[] = [],
    categoryBudgets: CategoryBudget[] = [],
): LocalMetrics {
    const fp = getCurrentFinancialPeriod(settings);
    const now = new Date();

    const daysLeft = settings.paymentCycle === 'irregular'
        ? Math.max(Math.ceil((fp.end.getTime() - now.getTime()) / 86400000), 1)
        : Math.max(getDaysUntilNextPayment(settings), 1);
    const nextPayDate = new Date(now.getTime() + daysLeft * 86400000);

    const isQ = (t: Transaction) => t.currency === 'Q' || !t.currency;

    const periodTx = transactions.filter(t => { const d = new Date(t.date); return d >= fp.start && d <= fp.end; });
    const expenseQ = periodTx.filter(t => t.type === 'expense' && isQ(t)).reduce((s, t) => s + t.amount, 0);
    const incomeQ = periodTx.filter(t => t.type === 'income' && isQ(t)).reduce((s, t) => s + t.amount, 0);
    const net = incomeQ - expenseQ;

    const hasBudget = settings.budgetLimit > 0;
    const remaining = settings.budgetLimit - expenseQ;
    const pct = hasBudget ? Math.round((expenseQ / settings.budgetLimit) * 100) : 0;

    const daysLeftInPeriod = Math.max(fp.daysTotal - fp.daysPassed, 1);
    const dailyRate = expenseQ / Math.max(fp.daysPassed, 1);
    const projected = dailyRate * fp.daysTotal;

    const prevTx = transactions.filter(t => { const d = new Date(t.date); return d >= fp.prevStart && d <= fp.prevEnd; });
    const prevExpQ = prevTx.filter(t => t.type === 'expense' && isQ(t)).reduce((s, t) => s + t.amount, 0);
    const prevIncomeQ = prevTx.filter(t => t.type === 'income' && isQ(t)).reduce((s, t) => s + t.amount, 0);

    const samePointEnd = new Date(fp.prevStart.getTime() + fp.daysPassed * 86400000);
    const prevSamePointExpQ = prevTx
        .filter(t => t.type === 'expense' && isQ(t) && new Date(t.date) <= samePointEnd)
        .reduce((s, t) => s + t.amount, 0);

    // Categorías del período actual
    const catMap: Record<string, number> = {};
    periodTx.filter(t => t.type === 'expense' && isQ(t)).forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    });
    const catTotals = Object.entries(catMap)
        .map(([id, amount]) => ({
            id,
            label: categoryLabelOf(id, settings.customCategories, 'expense'),
            amount,
        }))
        .sort((a, b) => b.amount - a.amount);

    // Categorías del período anterior, a la misma altura
    const prevCatMap: Record<string, number> = {};
    prevTx
        .filter(t => t.type === 'expense' && isQ(t) && new Date(t.date) <= samePointEnd)
        .forEach(t => { prevCatMap[t.category] = (prevCatMap[t.category] || 0) + t.amount; });
    const prevCatSamePoint = prevCatMap;

    const fixedActive = fixedExpenses.filter(f => f.isActive);
    const fixedCycle = fixedCycleConfig(settings);
    const fixedPendingList = fixedActive
        .filter(f => !f.isPaid)
        .map(f => ({ f, due: fixedDueInfo(f, fixedCycle, now).due.getTime() }))
        .sort((a, b) => a.due - b.due)
        .map(x => x.f);
    const fixedTotalQ = fixedActive.reduce((s, f) => s + convertAmount(f.amount, f.currency, 'Q', settings.exchangeRate), 0);
    const fixedPendingQ = fixedPendingList.reduce((s, f) => s + convertAmount(f.amount, f.currency, 'Q', settings.exchangeRate), 0);

    const installTotal = creditInstallments
        .filter(c => (c.totalInstallments - c.paidInstallments) > 0)
        .reduce((s, c) => s + convertAmount(c.monthlyPayment, c.currency, 'Q', settings.exchangeRate), 0);
    const { installmentsPendingQ } = calcCreditCommitments(creditInstallments, settings.exchangeRate);
    const activeInstallments = creditInstallments.filter(c => (c.totalInstallments - c.paidInstallments) > 0);

    const activeAccountsAll = accounts.filter(a => a.isActive);
    const { totalQ: netWorthQ, totalUSD: netWorthUSD, totalEUR: netWorthEUR, totalGBP: netWorthGBP } = calcNetWorthFromAccounts(activeAccountsAll, settings.exchangeRate);
    const totalBalance = netWorthQ + netWorthUSD * (settings.exchangeRate || 7.7) + netWorthEUR + netWorthGBP;

    const activeGoals = savingsGoals.filter(g => !g.isCompleted);
    const completedGoalsCount = savingsGoals.filter(g => g.isCompleted).length;

    const budgetAlerts = categoryBudgets
        .filter(cb => cb.limit > 0)
        .map(cb => {
            const spent = periodTx.filter(t => t.type === 'expense' && t.category === cb.categoryId && isQ(t)).reduce((s, t) => s + t.amount, 0);
            const pctB = Math.round((spent / cb.limit) * 100);
            return { id: cb.categoryId, label: categoryLabelOf(cb.categoryId, settings.customCategories, 'expense'), spent, limit: cb.limit, pctB };
        })
        .filter(b => b.pctB >= 80)
        .sort((a, b) => b.pctB - a.pctB);

    let tone: QuoteTone;
    if (pct >= 100 || (hasBudget && projected > settings.budgetLimit * 1.1)) {
        tone = 'critical';
    } else if (pct >= 80 || budgetAlerts.some(b => b.pctB >= 100)) {
        tone = 'warning';
    } else if (pct >= 50) {
        tone = 'discipline';
    } else {
        tone = 'positive';
    }

    const hasAnyData = periodTx.length > 0 || hasBudget;

    return {
        fp, now, daysLeft, nextPayDate, periodTx, expenseQ, incomeQ, net,
        hasBudget, remaining, pct, daysLeftInPeriod, dailyRate, projected,
        prevExpQ, prevIncomeQ, prevSamePointExpQ, catTotals, prevCatSamePoint,
        fixedActive, fixedPendingList, fixedTotalQ, fixedPendingQ,
        installTotal, installmentsPendingQ, activeInstallments, totalBalance,
        activeAccounts: activeAccountsAll, activeGoals, completedGoalsCount,
        budgetAlerts, tone, hasAnyData, settings,
    };
}

// ─────────────────────────────────────────────────────────────
// 4e. FRASES DE ESTADO REUTILIZABLES (privadas)
// ─────────────────────────────────────────────────────────────
function budgetLine(m: LocalMetrics): string {
    if (!m.hasBudget) {
        return `Todavía no definiste un presupuesto; llevás ${fmtQ(m.expenseQ)} gastados en ${m.fp.label}.`;
    }
    if (m.remaining < 0) {
        return `Te pasaste del presupuesto por ${fmtQ(-m.remaining)}.`;
    }
    return `Llevás ${fmtQ(m.expenseQ)} de ${fmtQ(m.settings.budgetLimit)} (${m.pct}%) y te quedan ${fmtQ(m.remaining)}.`;
}

function perDayLine(m: LocalMetrics): string {
    if (!m.hasBudget) return '';
    const available = Math.max(m.remaining - m.fixedPendingQ, 0) / m.daysLeft;
    return `≈${fmtQ(available)}/día hasta tu próximo ingreso (${m.daysLeft} días).`;
}

function withQuote(text: string, m: LocalMetrics, mode: 'random' | 'daily'): string {
    return `${text}\n\n${mode === 'daily' ? dailyQuote(m.tone) : randomQuote(m.tone)}`;
}

// ─────────────────────────────────────────────────────────────
// 4f. getLocalResponse
// ─────────────────────────────────────────────────────────────

const HELP_EXAMPLES = [
    '¿Cómo voy este mes?',
    '¿En qué gasté más?',
    '¿Puedo ahorrar más?',
    'Dame un consejo',
    '¿Cuánto gasté en comida?',
    '¿Cuándo me pagan?',
];

function extractAmountFromMessage(msg: string, message: string): number | null {
    const milMatch = msg.match(/(\d+(?:[.,]\d+)?)\s*mil\b/);
    if (milMatch) {
        const n = parseFloat(milMatch[1].replace(',', '.'));
        if (!isNaN(n)) return n * 1000;
    }
    const numMatch = message.match(/[\d,]+(?:\.\d+)?/);
    if (numMatch) {
        const amount = parseAmount(numMatch[0]);
        if (!isNaN(amount)) return amount;
    }
    return null;
}

export function getLocalResponse(
    message: string,
    transactions: Transaction[],
    settings: UserSettings,
    accounts: Account[] = [],
    fixedExpenses: FixedExpense[] = [],
    savingsGoals: SavingsGoal[] = [],
    creditInstallments: CreditInstallment[] = [],
    categoryBudgets: CategoryBudget[] = [],
): string {
    const m = computeLocalMetrics(transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets);
    const msg = normalizeText(message);

    // 1. AYUDA
    if (/que (puedes|podes|sabes) (hacer|responder)|que te (puedo )?pregunt|como funcion|^ayuda$/.test(msg)) {
        const lines = HELP_EXAMPLES.map(e => `• ${e}`).join('\n');
        return `Puedo analizar tus datos financieros reales en tu teléfono. Preguntame cosas como:\n${lines}`;
    }

    // 2. COMPRA
    if (/puedo comprar|puedo gastar|me (compro|alcanza)|tengo para|alcanza|cuesta|vale la pena comprar/.test(msg)) {
        const amount = extractAmountFromMessage(msg, message);
        const variants2a = [
            (amt: number, left: number, perDay: number) => `Sí, podés comprarlo. Te quedarían ${fmtQ(left)} y el disponible diario bajaría a ${fmtQ(perDay)}/día.`,
            (amt: number, left: number, perDay: number) => `Sí, te alcanza. Después de los ${fmtQ(amt)} te quedan ${fmtQ(left)} (≈${fmtQ(perDay)}/día hasta tu próximo pago).`,
        ];
        const variants2b = [
            (amt: number, left: number) => `Alcanza contra tu presupuesto (quedan ${fmtQ(left)}), pero ojo: todavía tenés ${fmtQ(m.fixedPendingQ)} en gastos fijos pendientes, así que te deja corto para cubrirlos.`,
            (amt: number, left: number) => `Sí te alcanza hoy (${fmtQ(left)} disponibles), aunque te quedarías ajustado porque faltan ${fmtQ(m.fixedPendingQ)} de gastos fijos por pagar.`,
        ];
        const variants2c = [
            (amt: number, over: number) => `No te lo recomiendo. La compra de ${fmtQ(amt)} excede tu disponible por ${fmtQ(over)}.`,
            (amt: number, over: number) => `Mejor esperá. Te faltarían ${fmtQ(over)} para cubrir los ${fmtQ(amt)} sin pasarte del presupuesto.`,
        ];

        if (amount !== null) {
            if (!m.hasBudget) {
                const safe = m.net;
                if (amount <= safe) {
                    return `No tenés presupuesto definido, pero tu balance neto este período es ${fmtQ(m.net)}. Con ${fmtQ(amount)} sí te alcanza; quedarías con ${fmtQ(safe - amount)}.`;
                }
                const over = safe <= 0 ? amount : amount - safe;
                return `No tenés presupuesto definido. Tu balance neto es ${fmtQ(m.net)}, así que ${fmtQ(amount)} excede lo disponible por ${fmtQ(over)}. Te conviene definir un presupuesto en Ajustes.`;
            }

            const safe = m.remaining - m.fixedPendingQ;
            if (amount <= safe) {
                const left = m.remaining - amount;
                const perDay = Math.max(left - m.fixedPendingQ, 0) / m.daysLeft;
                const v = variants2a[pickVariant('compra_a', variants2a.length, 'random')];
                return v(amount, left, perDay);
            }
            if (amount <= m.remaining) {
                const left = m.remaining - amount;
                const v = variants2b[pickVariant('compra_b', variants2b.length, 'random')];
                return v(amount, left);
            }
            const over = m.remaining <= 0 ? amount : amount - m.remaining;
            const v = variants2c[pickVariant('compra_c', variants2c.length, 'random')];
            return v(amount, over);
        }

        // Sin monto
        const noAmountVariants = m.remaining > 0
            ? [
                () => `Disponés de ${fmtQ(m.remaining)} en tu presupuesto. ¿Cuánto cuesta lo que querés comprar?`,
                () => `Te quedan ${fmtQ(m.remaining)} este período. Decime el monto y te digo si alcanza.`,
            ]
            : [
                () => `Ya superaste tu presupuesto por ${fmtQ(-m.remaining)}, así que cualquier compra nueva lo empeora. ¿Cuánto cuesta lo que querés comprar?`,
                () => `Estás sobre el presupuesto (${fmtQ(-m.remaining)} de exceso). Decime el monto para ver qué tan grave sería.`,
            ];
        return noAmountVariants[pickVariant('compra_sin_monto', noAmountVariants.length, 'random')]();
    }

    // 3. CONSEJO
    if (/consejo|recomiend|recomendacion|que (debo|deberia|hago|me recomiendas)|ayudame|tip|ahorrar mas|como (puedo )?ahorr|en que (puedo )?ahorr|donde (puedo )?(recortar|ahorrar)|recortar|mejorar mis finanzas/.test(msg)) {
        const tips: string[] = [];

        if (m.hasBudget && m.pct >= 100) {
            tips.push(`Ya superaste tu presupuesto por ${fmtQ(-m.remaining)}. Congelá gastos no esenciales el resto de ${m.fp.label}.`);
        }
        if (m.hasBudget && m.pct < 100 && m.projected > m.settings.budgetLimit) {
            const exceso = m.projected - m.settings.budgetLimit;
            tips.push(`A tu ritmo actual (${fmtQ(m.dailyRate)}/día) vas a proyectar ${fmtQ(m.projected)}, ${fmtQ(exceso)} por encima del presupuesto. Bajá el ritmo diario para no pasarte.`);
        }
        if (m.budgetAlerts[0]) {
            const b = m.budgetAlerts[0];
            tips.push(`Tu categoría "${b.label}" está al ${b.pctB}% de su límite (${fmtQ(b.spent)} de ${fmtQ(b.limit)}). Es la primera donde conviene frenar.`);
        }
        if (m.catTotals[0] && m.expenseQ > 0 && m.catTotals[0].amount / m.expenseQ > 0.35) {
            const c = m.catTotals[0];
            tips.push(`"${c.label}" representa más de un tercio de tu gasto (${fmtQ(c.amount)}). Recortar un 15% ahí te liberaría ${fmtQ(c.amount * 0.15)}.`);
        }
        if (m.settings.monthlyIncome > 0 && m.installTotal / m.settings.monthlyIncome > 0.3) {
            const sorted = [...m.activeInstallments].sort((a, b) => (a.totalInstallments - a.paidInstallments) - (b.totalInstallments - b.paidInstallments));
            const target = sorted[0];
            tips.push(`Tus cuotas (${fmtQ(m.installTotal)}/mes) representan más del 30% de tu ingreso.${target ? ` Considerá liquidar primero "${target.name}", le quedan ${target.totalInstallments - target.paidInstallments} cuotas.` : ''}`);
        }
        if (m.fixedPendingQ > Math.max(m.remaining, 0) && m.hasBudget) {
            tips.push(`Tus gastos fijos pendientes (${fmtQ(m.fixedPendingQ)}) superan lo que te queda de presupuesto (${fmtQ(Math.max(m.remaining, 0))}). Priorizalos antes de cualquier gasto variable.`);
        }
        if (m.activeGoals.length === 0 && m.settings.monthlyIncome > 0) {
            tips.push(`No tenés ninguna meta de ahorro activa. Págate primero: separá un 10% de tu ingreso (${fmtQ(m.settings.monthlyIncome * 0.1)}) antes de gastar.`);
        }
        if (m.settings.monthlySavingsGoal > 0 && m.net < m.settings.monthlySavingsGoal) {
            tips.push(`Vas por debajo de tu meta mensual de ahorro (${fmtQ(m.settings.monthlySavingsGoal)}); tu balance neto actual es ${fmtQ(m.net)}.`);
        }

        const introVariants = [
            'Estos son los puntos donde más podés mejorar:',
            'Mirando tus números, acá tenés en qué enfocarte:',
            'Con tus datos reales, esto es lo que te recomiendo:',
        ];
        const intro = introVariants[pickVariant('consejo_intro', introVariants.length, 'random')];

        if (tips.length > 0) {
            const top3 = tips.slice(0, 3).map((t, i) => `${i + 1}. ${t}`).join('\n');
            return withQuote(`${intro}\n${top3}`, m, 'random');
        }

        if (m.hasAnyData) {
            let positive = `Vas bien: tu balance neto este período es ${fmtQ(m.net)}.`;
            if (m.activeGoals[0] && m.net > 0) {
                positive += ` Podrías mover ${fmtQ(m.net * 0.5)} (50%) a tu meta "${m.activeGoals[0].name}".`;
            }
            return withQuote(positive, m, 'random');
        }

        return withQuote('Todavía no tengo movimientos ni presupuesto registrados. Empezá por registrar tus gastos y definir un presupuesto mensual en Ajustes para que pueda darte consejos con datos reales.', m, 'random');
    }

    // 4. COMPARATIVA
    if (/anterior|pasado|compar|versus|\bvs\b|mejor que|peor que|la vez pasada/.test(msg)) {
        if (m.prevExpQ === 0 && m.prevIncomeQ === 0) {
            return withQuote(`Todavía no tengo movimientos del período anterior (${m.fp.prevLabel}) para comparar.`, m, 'random');
        }

        const diff = m.expenseQ - m.prevSamePointExpQ;
        const diffPct = m.prevSamePointExpQ > 0 ? Math.round((diff / m.prevSamePointExpQ) * 100) : null;
        const diffTxt = diff >= 0
            ? `gastaste ${fmtQ(diff)} más${diffPct !== null ? ` (${diffPct}%)` : ''}`
            : `gastaste ${fmtQ(-diff)} menos${diffPct !== null ? ` (${Math.abs(diffPct)}%)` : ''}`;

        const parts: string[] = [];
        parts.push(`A esta misma altura (día ${m.fp.daysPassed}), ${diffTxt} que en ${m.fp.prevLabel}, donde llevabas ${fmtQ(m.prevSamePointExpQ)}.`);
        parts.push(`El período anterior cerró con ${fmtQ(m.prevExpQ)} en total.`);
        parts.push(m.incomeQ >= m.prevIncomeQ
            ? `Tus ingresos de este período (${fmtQ(m.incomeQ)}) son iguales o mayores a los del anterior (${fmtQ(m.prevIncomeQ)}).`
            : `Tus ingresos de este período (${fmtQ(m.incomeQ)}) son menores a los del anterior (${fmtQ(m.prevIncomeQ)}).`);

        // Categoría con mayor alza / baja
        let maxRise: { label: string; diff: number } | null = null;
        let maxDrop: { label: string; diff: number } | null = null;
        for (const c of m.catTotals) {
            const prevAmt = m.prevCatSamePoint[c.id] || 0;
            const d = c.amount - prevAmt;
            if (d > 0 && (!maxRise || d > maxRise.diff)) maxRise = { label: c.label, diff: d };
            if (d < 0 && (!maxDrop || d < maxDrop.diff)) maxDrop = { label: c.label, diff: d };
        }
        if (maxRise) parts.push(`La categoría que más subió es "${maxRise.label}" (+${fmtQ(maxRise.diff)}).`);
        if (maxDrop) parts.push(`La que más bajó es "${maxDrop.label}" (${fmtQ(maxDrop.diff)}).`);

        return withQuote(parts.join(' '), m, 'random');
    }

    // 5. CATEGORÍA ESPECÍFICA
    if (/gast|cuanto llevo|cuanto va|cuanto he/.test(msg)) {
        const catId = findCategoryInMessage(msg, settings);
        if (catId) {
            const cat = m.catTotals.find(c => c.id === catId);
            const amount = cat?.amount ?? 0;
            const label = cat?.label ?? categoryLabelOf(catId, settings.customCategories, 'expense');
            const pctOfTotal = m.expenseQ > 0 ? Math.round((amount / m.expenseQ) * 100) : 0;
            const prevAmt = m.prevCatSamePoint[catId] || 0;

            const catTx = m.periodTx.filter(t => t.type === 'expense' && t.category === catId && (t.currency === 'Q' || !t.currency));
            const biggest = [...catTx].sort((a, b) => b.amount - a.amount)[0];

            const parts: string[] = [];
            parts.push(`En "${label}" llevás ${fmtQ(amount)} este período${m.expenseQ > 0 ? ` (${pctOfTotal}% de tu gasto total)` : ''}.`);
            parts.push(`En ${m.fp.prevLabel}, a esta misma altura, llevabas ${fmtQ(prevAmt)}.`);

            const budget = categoryBudgets.find(cb => cb.categoryId === catId);
            if (budget && budget.limit > 0) {
                const pctB = Math.round((amount / budget.limit) * 100);
                parts.push(`Tu límite ahí es ${fmtQ(budget.limit)} (${pctB}%), te quedan ${fmtQ(budget.limit - amount)}.`);
            }

            parts.push(`Tenés ${catTx.length} transacción(es) registrada(s)${biggest ? `; la mayor fue "${biggest.description}" por ${fmtQ(biggest.amount)}` : ''}.`);

            const variants5 = [
                () => parts.join(' '),
                () => [parts[0], parts[parts.length - 1], ...parts.slice(1, -1)].join(' '),
            ];
            return variants5[pickVariant('categoria_especifica', variants5.length, 'random')]();
        }
    }

    // 6. AHORRO/META
    const activeGoalByName = m.activeGoals.find(g => {
        const nameNorm = normalizeText(g.name);
        if (nameNorm && msg.includes(nameNorm)) return true;
        return nameNorm.split(' ').some(tok => tok.length >= 4 && hasWord(msg, tok));
    });
    if (/ahorr|meta|objetivo|guardar|plan de ahorro/.test(msg) || activeGoalByName) {
        // (a) meta por nombre
        if (activeGoalByName) {
            const g = activeGoalByName;
            const pctG = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
            const falta = g.targetAmount - g.currentAmount;
            const variantsA = [
                () => `Tu meta "${g.name}" lleva ${fmtMoney(g.currentAmount, g.currency)} de ${fmtMoney(g.targetAmount, g.currency)} (${pctG}%). Te falta ${fmtMoney(falta, g.currency)}.`,
                () => `En "${g.name}" vas al ${pctG}%: ${fmtMoney(g.currentAmount, g.currency)} de ${fmtMoney(g.targetAmount, g.currency)}, faltan ${fmtMoney(falta, g.currency)}.`,
            ];
            let text = variantsA[pickVariant('meta_nombre', variantsA.length, 'random')]();

            const deadline = parseDateOnly(storedDateToDateOnly(g.deadline)) ?? new Date(g.deadline);
            if (g.deadline && !isNaN(deadline.getTime())) {
                const daysLeftGoal = Math.ceil((deadline.getTime() - m.now.getTime()) / 86400000);
                if (daysLeftGoal > 0 && falta > 0) {
                    const monthlyNeeded = falta / Math.max(daysLeftGoal / 30, 1);
                    const compareBase = m.settings.monthlySavingsGoal > 0 ? m.settings.monthlySavingsGoal : m.net;
                    text += ` Te quedan ${daysLeftGoal} día(s); necesitás aportar ≈${fmtMoney(monthlyNeeded, g.currency)}/mes${compareBase > 0 ? ` (tu aporte de referencia actual es ${fmtQ(compareBase)}/mes)` : ''}.`;
                } else if (daysLeftGoal <= 0 && falta > 0) {
                    text += ` La fecha límite ya pasó; te conviene ajustarla.`;
                }
            }
            return withQuote(text, m, 'random');
        }

        // (b) plan con monto
        if (/plan|juntar|reunir|llegar a|para q?\d/.test(msg)) {
            const amount = extractAmountFromMessage(msg, message);
            if (amount !== null && amount > 0) {
                const lines: string[] = [];
                if (m.settings.monthlySavingsGoal > 0) {
                    lines.push(`A tu meta mensual actual (${fmtQ(m.settings.monthlySavingsGoal)}/mes), te tomaría ≈${Math.ceil(amount / m.settings.monthlySavingsGoal)} mes(es).`);
                }
                if (m.net > 0) {
                    lines.push(`A tu ritmo de ahorro neto actual (${fmtQ(m.net)} este período), te tomaría ≈${Math.ceil(amount / m.net)} período(s) similares.`);
                }
                if (m.settings.monthlyIncome > 0) {
                    const p10 = m.settings.monthlyIncome * 0.1;
                    const p20 = m.settings.monthlyIncome * 0.2;
                    lines.push(`Ahorrando el 10% de tu ingreso (${fmtQ(p10)}/mes) tardarías ≈${Math.ceil(amount / p10)} mes(es); al 20% (${fmtQ(p20)}/mes) serían ≈${Math.ceil(amount / p20)} mes(es).`);
                }
                if (lines.length === 0) {
                    return withQuote(`Para calcular un plan hacia ${fmtQ(amount)} necesito que definas tu ingreso mensual en Ajustes.`, m, 'random');
                }
                return withQuote(`Para llegar a ${fmtQ(amount)}: ${lines.join(' ')}`, m, 'random');
            }
        }

        // (c) varias metas sin nombre
        if (m.activeGoals.length > 0) {
            const list = m.activeGoals.slice(0, 3).map(g => {
                const pctG = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
                return `"${g.name}" (${pctG}%)`;
            }).join(', ');
            let text = `Tenés ${m.activeGoals.length} meta(s) activa(s): ${list}.`;
            if (m.completedGoalsCount > 0) text += ` Ya completaste ${m.completedGoalsCount} meta(s) antes.`;
            text += ' Preguntame por el nombre de alguna para más detalle.';
            return withQuote(text, m, 'random');
        }

        // (d) sin metas
        const variantsD = [
            () => {
                let t = `Tu balance neto este período es ${fmtQ(m.net)} y no tenés metas de ahorro activas.`;
                if (m.settings.monthlyIncome > 0) t += ` Probá separar un 10% de tu ingreso (${fmtQ(m.settings.monthlyIncome * 0.1)}) y creá una meta en Presupuesto → Metas.`;
                return t;
            },
            () => {
                let t = `No tenés metas de ahorro activas. Tu balance neto actual es ${fmtQ(m.net)}.`;
                if (m.settings.monthlyIncome > 0) t += ` Te recomiendo crear una meta y apartar un 10% (${fmtQ(m.settings.monthlyIncome * 0.1)}) de tu ingreso.`;
                return t;
            },
        ];
        return withQuote(variantsD[pickVariant('meta_sin_metas', variantsD.length, 'random')](), m, 'random');
    }

    // 7. DÍA DE PAGO/PROYECCIÓN
    if (/cuando (me )?(pagan|cae|depositan|cobro)|dia de pago|proximo (pago|ingreso)|cuanto falta|faltan? .*dias|quincena|sueldo|salario|fin de mes|llego|proyecc|ritmo/.test(msg)) {
        const dateStr = m.nextPayDate.toLocaleDateString('es-GT', { weekday: 'long', day: 'numeric', month: 'long' });
        const irregularNote = m.settings.paymentCycle === 'irregular'
            ? ' Como tu ciclo es irregular, tomo el cierre de tu período financiero como referencia.'
            : '';
        const perDay = perDayLine(m);
        const projectionNote = m.hasBudget
            ? (m.projected > m.settings.budgetLimit
                ? ` A tu ritmo actual proyectás ${fmtQ(m.projected)}, por encima de tu presupuesto de ${fmtQ(m.settings.budgetLimit)}.`
                : ` A tu ritmo actual proyectás ${fmtQ(m.projected)}, dentro de tu presupuesto de ${fmtQ(m.settings.budgetLimit)}.`)
            : '';

        const variants7 = [
            () => `Tu próximo pago es en ${m.daysLeft} día(s), aproximadamente el ${dateStr}.${irregularNote} ${perDay}${projectionNote}`,
            () => `Faltan ${m.daysLeft} día(s) para tu próximo ingreso (${dateStr}).${irregularNote} ${perDay}${projectionNote}`,
            () => `El ${dateStr} te quedan ${m.daysLeft} día(s) por delante.${irregularNote} ${perDay}${projectionNote}`,
        ];
        return variants7[pickVariant('dia_pago', variants7.length, 'random')]();
    }

    // 8. DEUDA
    if (/deuda|tarjeta|credito|cuota|visa/.test(msg)) {
        const parts: string[] = [];
        parts.push(`Compromisos de crédito (separados de tu patrimonio): ${fmtQ(m.installmentsPendingQ)} pendientes en visacuotas.`);
        if (m.activeInstallments.length === 0) {
            parts.push('No tenés visacuotas activas en este momento.');
        } else {
            parts.push(`Tenés ${fmtQ(m.installTotal)} en cuotas mensuales activas${m.settings.monthlyIncome > 0 ? `, lo que representa ${Math.round((m.installTotal / m.settings.monthlyIncome) * 100)}% de tu ingreso mensual` : ''}.`);
            const list = m.activeInstallments.slice(0, 3).map(c => `"${c.name}" (${c.totalInstallments - c.paidInstallments} cuotas restantes)`).join(', ');
            parts.push(`Visacuotas activas: ${list}.`);
        }
        if (m.settings.activeDebts > 0) {
            parts.push(`Además tenés ${fmtQ(m.settings.activeDebts)} declarados como deuda activa.`);
        }
        parts.push('Esto va separado de tu patrimonio neto, que no se ve afectado por estas cuotas directamente.');

        const variants8 = [
            () => parts.join(' '),
            () => [parts[0], ...parts.slice(1).reverse()].join(' '),
        ];
        return variants8[pickVariant('deuda', variants8.length, 'random')]();
    }

    // 9. CUENTAS
    if (/cuenta|banco|saldo|billetera|efectivo|patrimonio/.test(msg)) {
        if (m.activeAccounts.length > 0) {
            const nonCredit = m.activeAccounts.filter(a => a.type !== 'credit');
            const creditPart = m.activeAccounts.filter(a => a.type === 'credit').map(a => {
                const accMonthly = getAccountMonthlyInstallmentTotal(creditInstallments, a.id, m.settings.exchangeRate, 'Q');
                return `${a.name}: ${accMonthly > 0 ? `${fmtQ(accMonthly)}/mes en cuotas` : 'sin cuotas activas'}`;
            });
            const parts = [
                ...nonCredit.map(a => (isBalanceTracked(a) ? `${a.name}: ${fmtQ(a.balance)}` : `${a.name}: sin saldo registrado`)),
                ...creditPart,
            ];
            const variants9 = [
                () => `Tus cuentas suman ${fmtQ(m.totalBalance)} en total (sin incluir tarjetas de crédito, que no tienen saldo propio). ${parts.join(', ')}.`,
                () => `Patrimonio total en cuentas: ${fmtQ(m.totalBalance)}. Detalle: ${parts.join(', ')}.`,
            ];
            return variants9[pickVariant('cuentas', variants9.length, 'random')]();
        }
        const variants9b = [
            () => 'No tenés cuentas bancarias configuradas. Podés agregarlas en la sección de Cuentas.',
            () => 'Todavía no registraste ninguna cuenta. Agregalas desde la sección de Cuentas para que pueda darte tu patrimonio real.',
        ];
        return variants9b[pickVariant('cuentas_vacio', variants9b.length, 'random')]();
    }

    // 10. FIJOS
    if (/fijo|recurrente|servicios|pagos fijos/.test(msg)) {
        if (m.fixedActive.length === 0) {
            return 'No tenés gastos fijos registrados. Agregalos en Presupuesto → Gastos Fijos para que te avise antes de cada pago.';
        }
        const fixedCycle = fixedCycleConfig(m.settings);
        const nowFixed = new Date();
        const next3 = m.fixedPendingList.slice(0, 3).map(f => {
            const due = fixedDueInfo(f, fixedCycle, nowFixed).due;
            return `${f.name} vence ${fmtShortDate(due)} — ${fmtMoney(f.amount, f.currency)}`;
        }).join(', ');
        const variants10 = [
            () => `Gastos fijos activos: ${fmtQ(m.fixedTotalQ)}/período. Pendientes: ${fmtQ(m.fixedPendingQ)}.${next3 ? ` Próximos: ${next3}.` : ''}`,
            () => `Tenés ${fmtQ(m.fixedTotalQ)} en gastos fijos este período, de los cuales ${fmtQ(m.fixedPendingQ)} siguen pendientes.${next3 ? ` Los próximos son: ${next3}.` : ''}`,
        ];
        return variants10[pickVariant('fijos', variants10.length, 'random')]();
    }

    // 11. CATEGORÍAS (genérico)
    if (/gaste|gasto mas|mayor gasto|gastos por|categor|donde|en que/.test(msg)) {
        if (m.catTotals.length === 0) {
            return `Aún no tenés gastos registrados en este período (${m.fp.label}).`;
        }
        const top3 = m.catTotals.slice(0, 3).map(c => {
            const pctOfTotal = m.expenseQ > 0 ? Math.round((c.amount / m.expenseQ) * 100) : 0;
            return `${c.label} ${fmtQ(c.amount)} (${pctOfTotal}%)`;
        }).join(', ');
        const variants11 = [
            () => `Tus mayores gastos del período son: ${top3}. En total llevás ${fmtQ(m.expenseQ)} gastados.`,
            () => `En total llevás ${fmtQ(m.expenseQ)} gastados; el top de categorías es: ${top3}.`,
        ];
        return variants11[pickVariant('categorias_generico', variants11.length, 'random')]();
    }

    // 12. RESUMEN
    if (/como voy|como estoy|resumen|situacion|estado|analisis|summary|como van/.test(msg)) {
        const parts: string[] = [];
        parts.push(budgetLine(m));
        parts.push(`Ingresos del período: ${fmtQ(m.incomeQ)}.`);
        const perDay = perDayLine(m);
        if (perDay) parts.push(perDay);
        if (m.fixedPendingQ > 0) parts.push(`Gastos fijos pendientes: ${fmtQ(m.fixedPendingQ)}.`);
        if (m.installTotal > 0) parts.push(`Cuotas mensuales: ${fmtQ(m.installTotal)}.`);
        if (m.hasBudget) parts.push(`Proyección a fin de período: ${fmtQ(m.projected)}.`);
        if (m.prevSamePointExpQ > 0) {
            const diff = m.expenseQ - m.prevSamePointExpQ;
            parts.push(diff >= 0
                ? `Vas ${fmtQ(diff)} por encima del período anterior a esta misma altura.`
                : `Vas ${fmtQ(-diff)} por debajo del período anterior a esta misma altura.`);
        }

        const orderVariants = [
            () => parts.join(' '),
            () => [parts[0], ...parts.slice(1)].reverse().join(' '),
        ];
        return withQuote(orderVariants[pickVariant('resumen', orderVariants.length, 'random')](), m, 'random');
    }

    // 13. SALUDO
    if (/\b(hola|buenos|buenas|hey|saludos|que tal)\b/.test(msg)) {
        const variants13 = [
            () => `Hola ${settings.userName}. ${budgetLine(m)} ¿En qué te ayudo?`,
            () => `Hola ${settings.userName}, ¿qué tal? ${budgetLine(m)} ¿En qué te ayudo?`,
            () => `¡Hola ${settings.userName}! ${budgetLine(m)} ¿En qué te ayudo?`,
        ];
        return variants13[pickVariant('saludo', variants13.length, 'random')]();
    }

    // 14. FALLBACK
    const perDayFallback = perDayLine(m);
    const examples = HELP_EXAMPLES.slice(0, 4).map(e => `• ${e}`).join('\n');
    return `${budgetLine(m)}${perDayFallback ? ` ${perDayFallback}` : ''}\n\nNo reconocí esa pregunta todavía. Probá con:\n${examples}`;
}

// ─────────────────────────────────────────────────────────────
// 4g. buildLocalOpening
// ─────────────────────────────────────────────────────────────
export function buildLocalOpening(
    transactions: Transaction[],
    settings: UserSettings,
    accounts: Account[] = [],
    fixedExpenses: FixedExpense[] = [],
    savingsGoals: SavingsGoal[] = [],
    creditInstallments: CreditInstallment[] = [],
    categoryBudgets: CategoryBudget[] = [],
): string {
    const m = computeLocalMetrics(transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets);
    const hour = m.now.getHours();
    const saludo = hour < 12 ? 'Buenos días' : hour < 19 ? 'Buenas tardes' : 'Buenas noches';

    const line1Variants = [
        () => `${saludo}, ${settings.userName}. Soy tu CFO personal y ya revisé tus números.`,
        () => `${saludo}, ${settings.userName}. Soy tu CFO personal; ya le eché un vistazo a tus finanzas.`,
    ];
    const line1 = line1Variants[pickVariant('apertura_saludo', line1Variants.length, 'daily')]();

    if (!m.hasAnyData) {
        return `${line1}\n\nTodavía no tengo movimientos en ${m.fp.label}. Registrá un gasto o definí tu presupuesto en Ajustes y te doy el análisis completo.`;
    }

    const line2 = `${budgetLine(m)} ${perDayLine(m)}`.trim();

    let line3 = '';
    const budgetAlert100 = m.budgetAlerts.find(b => b.pctB >= 100);
    if (budgetAlert100) {
        line3 = `Tu categoría "${budgetAlert100.label}" ya superó su límite (${budgetAlert100.pctB}%).`;
    } else if (m.hasBudget && m.projected > m.settings.budgetLimit) {
        line3 = `A tu ritmo actual proyectás ${fmtQ(m.projected)}, por encima de tu presupuesto.`;
    } else if (m.fixedPendingList.length > 0) {
        line3 = `Tenés ${m.fixedPendingList.length} gasto(s) fijo(s) pendiente(s) por ${fmtQ(m.fixedPendingQ)}.`;
    } else if (m.catTotals[0]) {
        line3 = `Tu mayor categoría es "${m.catTotals[0].label}" con ${fmtQ(m.catTotals[0].amount)}.`;
    } else if (m.activeGoals[0]) {
        const g = m.activeGoals[0];
        const pctG = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0;
        line3 = `Tu meta "${g.name}" va al ${pctG}%.`;
    }

    const line4 = 'Tocá una sugerencia de abajo o escribime tu pregunta.';

    const body = [line1, line2, line3, line4].filter(Boolean).join('\n\n');
    return `${body}\n\n${dailyQuote(m.tone)}`;
}

// ─────────────────────────────────────────────────────────────
// 4h. getQuickReplies
// ─────────────────────────────────────────────────────────────
export function getQuickReplies(m: LocalMetrics): string[] {
    const replies: string[] = [];

    replies.push('¿Cómo voy este mes?');

    if (m.catTotals.length > 0) replies.push('¿En qué gasté más?');

    const useDefault = !m.hasBudget || m.remaining <= 0;
    const baseAmount = useDefault ? 500 : Math.max(Math.round((m.remaining * 0.25 / 50)) * 50, 100);
    const amountStr = String(baseAmount).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    replies.push(`¿Puedo comprar algo de Q${amountStr}?`);

    if (m.catTotals.length > 0 && m.catTotals[0].id !== 'other') {
        replies.push(`¿Cuánto gasté en ${m.catTotals[0].label}?`);
    }

    if (m.activeGoals.length > 0) {
        replies.push(`¿Cómo va mi meta ${m.activeGoals[0].name}?`);
    }

    replies.push('Dame un consejo');
    replies.push('¿Cuándo me pagan?');

    if (m.prevExpQ > 0) {
        replies.push('¿Cómo voy vs el período anterior?');
    }

    return replies.slice(0, 6);
}
