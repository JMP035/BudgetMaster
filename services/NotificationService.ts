import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import {
    CategoryBudget, FixedExpense, SavingsGoal,
    Transaction, UserSettings,
    getCurrentFinancialPeriod, getDaysUntilNextPayment, refreshPeriodResolver,
    parseDateOnly, storedDateToDateOnly,
    StorageService,
} from './storage';
import type { Account, CreditInstallment, IncomeSource, NotificationState } from './storage';
import { fixedCycleConfig } from './FixedCycle';
import { monthlyDebtLoad } from './DebtLoad';
import type { DebtLoad } from './DebtLoad';
import { QUOTES, randomQuote } from './FinancialQuotes';
import { categoryLabelOf } from '../categories';
import { sanitizePayRules } from './PayCalendar';
import { balanceModeOf } from './Balances';
import { adjustForQuiet, sanitizeNotifPrefs } from './NotifPrefs';
import type { NotifPrefs } from './NotifPrefs';
import { PLAN_ID_PREFIX, buildPlan, diffPlan, plannedCountOn, sigOf } from './NotificationPlan';
import type { PlanData } from './NotificationPlan';
import {
    buildBriefingFallbackText, buildFinancialContextText, periodSnapshot, spentQOf, txsInPeriod,
} from './NotificationTexts';
import type { PeriodSnapshot } from './NotificationTexts';
import { LEVEL_RANK, capacityFor, capacityMessage, salaryFigures, salaryMessage } from './Capacity';
import type { CapacityContext } from './Capacity';
import { onIncomeAutoLinked, onPlanInputsChanged } from './NotifEvents';
import type { IncomeAutoLinkedInfo } from './NotifEvents';
import { onSettingsChanged } from './SettingsEvents';

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
// IDENTIFICADORES FIJOS Y CONSTANTES
// ─────────────────────────────────────────────────────────────
// Legado (B9a lo reemplaza por el plan `bm_p_*`): se cancela al sincronizar.
const ID_FIXED_PREFIX = 'bm_fixed_';
const ID_WEEKLY = 'bm_weekly_summary';
const LEGACY_FIXED_TITLE = '📅 Gasto fijo próximo';
const ID_AI_NUDGE = 'bm_ai_nudge';
const ID_SETUP = 'bm_setup_nudge';
const ID_IMMEDIATE_PREFIX = 'bm_i_';
const DAY_S = 86400;
const AI_NUDGE_INTERVAL_S = 12 * DAY_S;
const SETUP_NUDGE_DELAY_S = 30 * 60;
const SYNC_DEBOUNCE_MS = 1500;
const FIRED_KEEP = 120;
const CAPACITY_NEAR_DAYS = 5;

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
// DATOS DE ENTRADA Y CONTEXTOS (período de pago REAL, no mes calendario)
// ─────────────────────────────────────────────────────────────
interface Inputs {
    settings: UserSettings;
    transactions: Transaction[];
    fixedExpenses: FixedExpense[];
    categoryBudgets: CategoryBudget[];
    accounts: Account[];
    creditInstallments: CreditInstallment[];
    incomeSources: IncomeSource[];
}

/** Lee lo que falte desde el almacenamiento (lo recibido en `over` manda) y deja listo el resolvedor del período. */
async function loadInputs(over?: Partial<Inputs>): Promise<Inputs> {
    const [settings, transactions, fixedExpenses, categoryBudgets, accounts, creditInstallments, incomeSources] = await Promise.all([
        over?.settings ?? StorageService.getSettings(),
        over?.transactions ?? StorageService.getTransactions(),
        over?.fixedExpenses ?? StorageService.getFixedExpenses(),
        over?.categoryBudgets ?? StorageService.getCategoryBudgets(),
        over?.accounts ?? StorageService.getAccounts(),
        over?.creditInstallments ?? StorageService.getCreditInstallments(),
        over?.incomeSources ?? StorageService.getIncomeSources(),
    ]);
    await StorageService.getPeriodAnchors();
    refreshPeriodResolver(settings);
    return { settings, transactions, fixedExpenses, categoryBudgets, accounts, creditInstallments, incomeSources };
}

function prefsOf(settings: UserSettings): NotifPrefs {
    return sanitizeNotifPrefs(settings.notif);
}

function periodAtFor(settings: UserSettings) {
    return (d: Date) => {
        const fp = getCurrentFinancialPeriod(settings, d);
        return { start: fp.start, end: fp.end, nextStart: fp.nextStart };
    };
}

function toPlanData(i: Inputs, now: Date): PlanData {
    return {
        settings: i.settings,
        transactions: i.transactions,
        fixedExpenses: i.fixedExpenses,
        accounts: i.accounts,
        creditInstallments: i.creditInstallments,
        incomeSources: i.incomeSources,
        categoryBudgets: i.categoryBudgets,
        daysLeft: getDaysUntilNextPayment(i.settings, now),
        periodAt: periodAtFor(i.settings),
        labelOfCategory: id => categoryLabelOf(id, i.settings.customCategories, 'expense'),
    };
}

function toCapacityCtx(i: Inputs, now: Date): CapacityContext {
    return {
        now,
        accounts: i.accounts,
        txs: i.transactions,
        insts: i.creditInstallments,
        fixed: i.fixedExpenses,
        sources: i.incomeSources,
        exchangeRate: i.settings.exchangeRate,
        monthlyIncome: i.settings.monthlyIncome,
        payRules: sanitizePayRules(i.settings.payRules),
        cycle: fixedCycleConfig(i.settings),
        periodAt: periodAtFor(i.settings),
    };
}

/** Cifras del período de pago ACTUAL (según lo registrado). */
function snapshotOf(
    i: Pick<Inputs, 'settings' | 'transactions' | 'categoryBudgets' | 'fixedExpenses'>, now: Date,
): PeriodSnapshot {
    const fp = getCurrentFinancialPeriod(i.settings, now);
    return periodSnapshot({
        settings: i.settings, txs: i.transactions, categoryBudgets: i.categoryBudgets, fixed: i.fixedExpenses, now,
        period: { start: fp.start, end: fp.end, nextStart: fp.nextStart },
        daysLeft: getDaysUntilNextPayment(i.settings, now),
        labelOfCategory: id => categoryLabelOf(id, i.settings.customCategories, 'expense'),
    });
}

/** Carga de deuda real (cuotas activas frente al ingreso) para el contexto de Gemini; lee cuotas y fuentes del almacenamiento. */
async function debtLoadOf(settings: UserSettings, transactions: Transaction[]): Promise<DebtLoad> {
    const [installments, sources] = await Promise.all([
        StorageService.getCreditInstallments(),
        StorageService.getIncomeSources(),
    ]);
    return monthlyDebtLoad({ installments, settings, sources, txs: transactions });
}

function dayKeyOf(d: Date): string {
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function refSafe(s: string): string {
    return s.replace(/[^A-Za-z0-9-]/g, '-');
}

// Las lecturas-modificaciones de NotificationState van en fila para no pisarse (plan, avisos inmediatos).
let stateChain: Promise<unknown> = Promise.resolve();
function withStateLock<T>(fn: () => Promise<T>): Promise<T> {
    const run = stateChain.then(fn, fn);
    stateChain = run.then(() => undefined, () => undefined);
    return run;
}

interface ImmediateOpts {
    /** Clave única: el mismo aviso no se repite mientras la clave siga en `state.fired`. */
    key: string;
    title: string;
    body: string;
    /** true = ignora el tope diario (p. ej. «no alcanza para pagar»). Nunca ignora las horas silenciosas. */
    bypassCap?: boolean;
    data?: Record<string, string>;
}

/**
 * Aviso inmediato con las reglas del usuario: respeta las horas silenciosas (si cae adentro, queda programado para
 * cuando terminan) y el tope diario (avisos planeados de hoy + inmediatos de hoy). El interruptor del tipo lo valida
 * quien llama. Devuelve true si quedó enviado o programado.
 */
async function deliverImmediate(prefs: NotifPrefs, o: ImmediateOpts): Promise<boolean> {
    if (Platform.OS === 'web') return false;
    return withStateLock(async () => {
        try {
            const state = await StorageService.getNotificationState();
            const fired = state.fired ?? [];
            if (fired.indexOf(o.key) >= 0) return false;
            const now = new Date();
            const today = dayKeyOf(now);
            const sentToday = state.dayCount && state.dayCount.day === today ? state.dayCount.count : 0;
            if (!o.bypassCap && sentToday + plannedCountOn(state.planned ?? [], now) >= prefs.maxPerDay) return false;

            const wanted = new Date(now.getTime() + 1000);
            const fireAt = adjustForQuiet(wanted, prefs);
            const content = { title: o.title, body: o.body, sound: true, data: { kind: 'immediate', key: o.key, ...(o.data ?? {}) } };
            if (fireAt.getTime() === wanted.getTime()) {
                await Notifications.scheduleNotificationAsync({
                    content,
                    trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 1 },
                });
            } else {
                await Notifications.scheduleNotificationAsync({
                    identifier: ID_IMMEDIATE_PREFIX + refSafe(o.key),
                    content,
                    trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fireAt },
                });
            }
            const next: NotificationState = {
                ...state,
                fired: [...fired, o.key].slice(-FIRED_KEEP),
                dayCount: dayKeyOf(fireAt) === today ? { day: today, count: sentToday + 1 } : state.dayCount,
            };
            await StorageService.saveNotificationState(next);
            return true;
        } catch (e) {
            console.warn('deliverImmediate error:', e);
            return false;
        }
    });
}

function capLevelFromKey(key: string): number {
    const lvl = key.slice(key.lastIndexOf('_') + 1) as keyof typeof LEVEL_RANK;
    return LEVEL_RANK[lvl] ?? 0;
}

let syncChain: Promise<unknown> = Promise.resolve();
let syncTimer: ReturnType<typeof setTimeout> | null = null;

// ─────────────────────────────────────────────────────────────
// LLAMADA A GEMINI
// ─────────────────────────────────────────────────────────────
const GEMINI_MODEL = 'gemini-2.5-flash';
// Textos cortos: con thinkingBudget 0 alcanza; sin él el "thinking" consumiría este presupuesto.
const GEMINI_MAX_OUTPUT_TOKENS = 256;

interface GeminiChunk {
    text: string;
    finishReason?: string;
}

/** thinkingBudget: 0 solo es válido en la familia flash (2.5-pro no permite desactivarlo). */
function supportsThinkingOff(model: string): boolean {
    return /^gemini-2\.5-flash/.test(model);
}

async function requestGemini(prompt: string, apiKey: string, disableThinking: boolean): Promise<GeminiChunk> {
    const generationConfig: Record<string, unknown> = {
        maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
        temperature: 0.7,
    };
    if (disableThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                contents: [{ parts: [{ text: prompt }] }],
                generationConfig,
            }),
        }
    );
    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);

    const data = await res.json();
    const candidate = data?.candidates?.[0];
    const parts: any[] = candidate?.content?.parts ?? [];
    // Concatenar TODAS las partes de texto, ignorando las marcadas "thought"
    const text = parts
        .filter(p => typeof p?.text === 'string' && !p?.thought)
        .map(p => p.text)
        .join('');
    return { text, finishReason: candidate?.finishReason };
}

/** Con thinking desactivado si el modelo lo soporta; si la API responde 400, reintenta sin ese campo. */
async function requestGeminiSafe(prompt: string, apiKey: string): Promise<GeminiChunk> {
    if (supportsThinkingOff(GEMINI_MODEL)) {
        try {
            return await requestGemini(prompt, apiKey, true);
        } catch (e: any) {
            if (!String(e?.message ?? '').includes('400')) throw e;
        }
    }
    return requestGemini(prompt, apiKey, false);
}

/** Devuelve el texto de la IA o null (vacío, cortado por MAX_TOKENS o error) para usar el fallback local. */
async function getGeminiMessage(prompt: string, apiKey: string): Promise<string | null> {
    try {
        const { text, finishReason } = await requestGeminiSafe(prompt, apiKey.trim());
        if (finishReason === 'MAX_TOKENS') return null;
        const cleaned = text.replace(/\*\*/g, '').replace(/\*/g, '').trim();
        return cleaned || null;
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

/** Une una lista de strings en español: "a", "a y b", "a, b y c" */
function joinEs(items: string[]): string {
    if (items.length <= 1) return items.join('');
    return `${items.slice(0, -1).join(', ')} y ${items[items.length - 1]}`;
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

    // ── Aviso de prueba ──────────────────────────────────────
    /**
     * Envía un aviso de prueba en un par de segundos (ignora horas silenciosas y tope: es a pedido de la persona).
     * Si falta el permiso lo pide. 'sent' = programado; 'denied' = permiso denegado; 'unavailable' = web o error.
     */
    async sendTestNotification(): Promise<'sent' | 'denied' | 'unavailable'> {
        if (Platform.OS === 'web') return 'unavailable';
        try {
            let granted = (await Notifications.getPermissionsAsync()).status === 'granted';
            if (!granted) granted = await NotificationService.requestPermissions();
            if (!granted) return 'denied';
            await Notifications.scheduleNotificationAsync({
                content: {
                    title: 'Aviso de prueba',
                    body: 'Así te llegarán los avisos de BudgetMaster. Si lo ves, las notificaciones funcionan.',
                    sound: true,
                    data: { kind: 'test' },
                },
                trigger: { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: 2 },
            });
            // Con el permiso recién concedido, deja el plan programado al día.
            NotificationService.requestSync();
            return 'sent';
        } catch (e) {
            console.warn('sendTestNotification error:', e);
            return 'unavailable';
        }
    },

    // ── Plan programado (B9a) ────────────────────────────────
    /** Pide sincronizar el plan (con espera para juntar varios cambios seguidos en una sola corrida). */
    requestSync(delayMs: number = SYNC_DEBOUNCE_MS): void {
        if (Platform.OS === 'web') return;
        if (syncTimer) clearTimeout(syncTimer);
        syncTimer = setTimeout(() => {
            syncTimer = null;
            void NotificationService.syncPlanned().catch(e => console.warn('syncPlanned:', e));
        }, delayMs);
    },

    /**
     * Pone lo programado (`bm_p_*`) igual al plan de los próximos 62 días: agrega lo que falta, reprograma lo que
     * cambió de hora o de texto y cancela lo que ya no aplica. Idempotente y en fila (nunca duplica). Cancela
     * de paso los avisos de legado (`bm_fixed_*`, `bm_weekly_summary`). Sin permiso, o en web, no hace nada.
     */
    async syncPlanned(data?: Partial<Inputs>): Promise<void> {
        if (Platform.OS === 'web') return;
        const run = syncChain.then(() => NotificationService.runSync(data), () => NotificationService.runSync(data));
        syncChain = run.then(() => undefined, () => undefined);
        return run;
    },

    async runSync(data?: Partial<Inputs>): Promise<void> {
        try {
            const perm = await Notifications.getPermissionsAsync();
            if (perm.status !== 'granted') return;

            const now = new Date();
            const inputs = await loadInputs(data);
            if (!inputs.settings.onboardingComplete || !inputs.settings.cardsOnboardingComplete) return;
            const prefs = prefsOf(inputs.settings);

            const scheduled = await Notifications.getAllScheduledNotificationsAsync();
            // Legado: un solo plan reemplaza los recordatorios por gasto y el resumen semanal anteriores.
            for (const n of scheduled) {
                const id = n.identifier;
                const title = n.content?.title ?? '';
                const isPlan = id.indexOf(PLAN_ID_PREFIX) === 0;
                const isLegacy = id.indexOf(ID_FIXED_PREFIX) === 0 || id === ID_WEEKLY
                    || (!isPlan && (title === LEGACY_FIXED_TITLE || title.indexOf('Resumen Semanal') >= 0));
                if (isLegacy) await safeCancel(id);
            }
            if (!prefs.kinds.ai) await safeCancel(ID_AI_NUDGE);

            const plan = buildPlan(toPlanData(inputs, now), prefs, now);
            const existing = scheduled
                .filter(n => n.identifier.indexOf(PLAN_ID_PREFIX) === 0)
                .map(n => {
                    const sig = n.content?.data?.sig;
                    return { id: n.identifier, sig: typeof sig === 'string' ? sig : undefined };
                });
            const { add, cancel } = diffPlan(plan, existing);

            for (const id of cancel) await safeCancel(id);
            for (const p of add) {
                try {
                    await Notifications.scheduleNotificationAsync({
                        identifier: p.id,
                        content: { title: p.title, body: p.body, sound: true, data: { kind: p.kind, refId: p.ref, sig: sigOf(p) } },
                        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: p.fireAt },
                    });
                } catch (e) {
                    console.warn('syncPlanned schedule error:', e);
                }
            }

            await withStateLock(async () => {
                const state = await StorageService.getNotificationState();
                await StorageService.saveNotificationState({ ...state, planned: plan.map(p => p.id) });
            });

            // 5 días antes del pago (o menos): ¿alcanza lo que tendrás? (una vez por estado y nivel)
            await NotificationService.evaluateCapacity('daily', inputs);
        } catch (e) {
            console.warn('syncPlanned error:', e);
        }
    },

    // ── Capacidad de pago ────────────────────────────────────
    /**
     * Evalúa la capacidad de pago de las tarjetas y avisa de nivel aviso/alerta/rojo. Una sola vez por estado y nivel:
     * no repite un nivel ya avisado (ni uno menor). `trigger`: 'charge' (se registró un cargo; evalúa solo esa
     * tarjeta), 'salary' (llegó el sueldo) o 'daily' (solo si el pago vence en 5 días o menos).
     */
    async evaluateCapacity(trigger: 'charge' | 'salary' | 'daily', over?: Partial<Inputs>, cardId?: string): Promise<void> {
        if (Platform.OS === 'web') return;
        try {
            const inputs = await loadInputs(over);
            const prefs = prefsOf(inputs.settings);
            if (!prefs.kinds.capacity) return;
            const now = new Date();
            const ctx = toCapacityCtx(inputs, now);
            for (const card of inputs.accounts) {
                if (card.type !== 'credit' || !card.isActive || (cardId && card.id !== cardId)) continue;
                const cap = capacityFor(card, ctx);
                if (!cap || cap.level === 'ok') continue;
                if (trigger === 'daily' && cap.daysToDue > CAPACITY_NEAR_DAYS) continue;

                const prefix = `cap_${card.id}_${cap.cutKey}_`;
                const state = await StorageService.getNotificationState();
                const seen = (state.fired ?? []).filter(k => k.indexOf(prefix) === 0).reduce((m, k) => Math.max(m, capLevelFromKey(k)), 0);
                if (seen >= LEVEL_RANK[cap.level]) continue;

                const msg = capacityMessage(cap);
                await deliverImmediate(prefs, {
                    key: `${prefix}${cap.level}`, title: msg.title, body: msg.body,
                    bypassCap: cap.level === 'red', data: { kind: 'capacity', refId: card.id },
                });
            }
        } catch (e) {
            console.warn('evaluateCapacity error:', e);
        }
    },

    // ── «Llegó tu sueldo» ────────────────────────────────────
    /** Un ingreso base se vinculó solo a su fuente: comprometido y libre hasta el próximo pago; luego, capacidad. */
    async onSalaryArrived(info: IncomeAutoLinkedInfo): Promise<void> {
        if (Platform.OS === 'web') return;
        try {
            const inputs = await loadInputs();
            if (!inputs.settings.onboardingComplete) return;
            const prefs = prefsOf(inputs.settings);
            const tx = inputs.transactions.find(t => t.id === info.txId);
            const source = inputs.incomeSources.find(s => s.id === info.sourceId);
            if (!tx || !source || source.role !== 'base') return;

            if (prefs.kinds.salary) {
                const acc = inputs.accounts.find(a => a.id === tx.accountId);
                // Una cuenta de saldo automático ya lo incluye; en manual o sin saldo hay que sumarlo aparte.
                const included = !!acc && balanceModeOf(acc) === 'auto';
                const rate = inputs.settings.exchangeRate > 0 ? inputs.settings.exchangeRate : 7.7;
                const extra = included ? 0 : tx.currency === 'Q' ? tx.amount : tx.currency === 'USD' ? tx.amount * rate : 0;
                const ctx = toCapacityCtx(inputs, new Date());
                const msg = salaryMessage(salaryFigures(ctx, extra));
                await deliverImmediate(prefs, {
                    key: `salary_${tx.id}`, title: msg.title, body: msg.body, bypassCap: true,
                    data: { kind: 'salary', refId: tx.id },
                });
            }
            await NotificationService.evaluateCapacity('salary', inputs);
        } catch (e) {
            console.warn('onSalaryArrived error:', e);
        }
    },

    // ── Avisos al agregar una transacción ────────────────────
    // Ya NO hay un push por cada gasto: los gastos se resumen en el aviso diario. Aquí solo quedan los umbrales
    // (categoría 80/100 %, presupuesto 50/80/100 %), una vez por umbral y período, y la capacidad de pago si el
    // gasto es de una tarjeta.
    async onTransactionAdded(
        tx: Transaction,
        transactions: Transaction[],
        settings: UserSettings,
        categoryBudgets: CategoryBudget[],
        fixedExpenses: FixedExpense[],
    ): Promise<void> {
        if (Platform.OS === 'web') return;
        const prefs = prefsOf(settings);
        // Reprograma el resumen de hoy con datos frescos (y el resto del plan).
        NotificationService.requestSync();

        if (tx.type === 'expense' && tx.accountId) {
            await NotificationService.evaluateCapacity(
                'charge', { settings, transactions, fixedExpenses, categoryBudgets }, tx.accountId,
            );
        }

        if (!prefs.kinds.thresholds) return;
        if (tx.type !== 'expense' || tx.currency !== 'Q' || tx.transferPairId) return;

        const now = new Date();
        const fp = getCurrentFinancialPeriod(settings, now);
        const list = txsInPeriod(transactions, fp.start, fp.end);

        // "transactions" ya incluye la transacción recién agregada (tx)
        const totalSpent = spentQOf(list);
        const pct = settings.budgetLimit > 0 ? (totalSpent / settings.budgetLimit) * 100 : 0;
        const remaining = settings.budgetLimit - totalSpent;
        const daysLeft = getDaysUntilNextPayment(settings, now);
        const dailyLeft = daysLeft > 0 ? remaining / daysLeft : remaining;
        const ctx = { settings, transactions, categoryBudgets, fixedExpenses };

        // ── Alerta por categoría ─────────────────────────────
        const catBudget = categoryBudgets.find(cb => cb.categoryId === tx.category);
        if (catBudget && catBudget.limit > 0) {
            const catSpent = spentQOf(list, tx.category);
            const catPct = (catSpent / catBudget.limit) * 100;
            const catLabel = categoryLabelOf(tx.category, settings.customCategories, 'expense');

            if (catPct >= 100) {
                const sent = await this.sendSmartAlert(
                    '🔴 Límite de categoría superado', 'critical',
                    `Superaste el presupuesto de ${catLabel}. Gastado: Q${catSpent.toFixed(2)} de Q${catBudget.limit}. Exceso: Q${(catSpent - catBudget.limit).toFixed(2)}.`,
                    ctx, `thr_cat_${tx.category}_100_${fp.key}`,
                );
                if (sent) return;
            } else if (catPct >= 80) {
                const sent = await this.sendSmartAlert(
                    `⚠️ Categoría al ${Math.round(catPct)}%`, 'warning',
                    `Vas en el ${Math.round(catPct)}% de tu presupuesto de ${catLabel}. Te quedan Q${(catBudget.limit - catSpent).toFixed(2)}.`,
                    ctx, `thr_cat_${tx.category}_80_${fp.key}`,
                );
                if (sent) return;
            }
        }

        // ── Alertas por presupuesto general ──────────────────
        if (pct >= 100) {
            await this.sendSmartAlert(
                '🚨 Presupuesto agotado', 'critical',
                `Has gastado Q${totalSpent.toFixed(2)} — superaste tu límite de Q${settings.budgetLimit} en Q${(totalSpent - settings.budgetLimit).toFixed(2)}. Quedan ${daysLeft} días hasta tu próximo ingreso.`,
                ctx, `thr_budget_100_${fp.key}`,
            );
        } else if (pct >= 80) {
            await this.sendSmartAlert(
                `⚠️ Vas en el ${Math.round(pct)}% de tu presupuesto`, 'warning',
                `Gastaste Q${totalSpent.toFixed(2)} de Q${settings.budgetLimit}. Te quedan Q${remaining.toFixed(2)} para ${daysLeft} días — Q${dailyLeft.toFixed(2)}/día disponibles.`,
                ctx, `thr_budget_80_${fp.key}`,
            );
        } else if (pct >= 50) {
            await this.sendSmartAlert(
                '📊 Vas en la mitad de tu presupuesto', 'discipline',
                `Llevas el ${Math.round(pct)}% de tu presupuesto. Te quedan Q${remaining.toFixed(2)} para ${daysLeft} días — aproximadamente Q${dailyLeft.toFixed(2)} por día.`,
                ctx, `thr_budget_50_${fp.key}`,
            );
        }
    },

    // ── Alerta inteligente Gemini + fallback ─────────────────
    /** Envía el aviso (con IA si hay clave) respetando horas silenciosas y tope diario. true = se envió o programó. */
    async sendSmartAlert(
        title: string,
        quoteType: keyof typeof QUOTES,
        context: string,
        data: Pick<Inputs, 'settings' | 'transactions' | 'categoryBudgets' | 'fixedExpenses'>,
        key: string,
    ): Promise<boolean> {
        const { settings } = data;
        const prefs = prefsOf(settings);
        const quote = randomQuote(quoteType);
        let body = '';

        if (settings.geminiApiKey && settings.geminiApiKey.length > 20) {
            const financialCtx = buildFinancialContextText(
                settings, snapshotOf(data, new Date()), await debtLoadOf(settings, data.transactions),
            );
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
        return deliverImmediate(prefs, { key, title, body, data: { kind: 'threshold' } });
    },

    // ── Recordatorios de gastos fijos: ahora los arma el plan (B9a) ───
    // Se conservan los métodos (los usan Presupuesto, Transacciones y el asistente) pero solo piden sincronizar.
    async scheduleFixedExpenseReminder(_expense?: FixedExpense, _now?: Date, _cycle?: unknown): Promise<void> {
        NotificationService.requestSync();
    },

    /** Al eliminar un gasto fijo su recordatorio sale del plan en la siguiente sincronización. */
    async cancelFixedExpenseReminder(_expenseId?: string): Promise<void> {
        NotificationService.requestSync();
    },

    async syncFixedExpenseReminders(_expenses?: FixedExpense[]): Promise<void> {
        NotificationService.requestSync();
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
        const deadline = parseDateOnly(storedDateToDateOnly(goal.deadline)) ?? new Date(goal.deadline);
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
    // Todo del PERÍODO de pago actual (no del mes calendario), según lo registrado.
    async getDailyBriefing(
        settings: UserSettings,
        transactions: Transaction[],
        categoryBudgets: CategoryBudget[],
        fixedExpenses: FixedExpense[],
    ): Promise<string> {
        const now = new Date();
        const snap = snapshotOf({ settings, transactions, categoryBudgets, fixedExpenses }, now);

        if (settings.geminiApiKey && settings.geminiApiKey.length > 20) {
            const ctx = buildFinancialContextText(settings, snap, await debtLoadOf(settings, transactions));
            const prompt = `
Eres el CFO personal de ${settings.userName}. Genera un briefing financiero breve (máximo 4 oraciones).
Menciona: presupuesto actual (${snap.pct}% del período ${snap.label}), días hasta próximo pago (${snap.daysLeft}), gastos fijos pendientes (${snap.unpaidFixedCount}), categorías en alerta (${snap.catAlerts}).
Sé directo, usa datos reales, aclara que es según lo registrado y termina con una frase motivacional corta.
Contexto: ${ctx}
Responde SOLO el texto del briefing.
            `.trim();

            const aiMsg = await getGeminiMessage(prompt, settings.geminiApiKey);
            if (aiMsg) return aiMsg;
        }

        return buildBriefingFallbackText(settings.userName, snap, randomQuote('discipline'));
    },

    // ── Avisos de arranque (plan, nudge IA, config pendiente) ──
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
            await this.syncPlanned();
        } catch (e) { console.warn('runStartupNotifications plan:', e); }

        try {
            if (prefsOf(data.settings).kinds.ai) await this.scheduleAIAdvisorNudge();
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

// Cualquier cambio de datos o ajustes que alimenta el plan lo reprograma (con espera, sin duplicar).
if (Platform.OS !== 'web') {
    onPlanInputsChanged(() => NotificationService.requestSync());
    onSettingsChanged(() => NotificationService.requestSync());
    onIncomeAutoLinked(info => { void NotificationService.onSalaryArrived(info).catch(e => console.warn('onSalaryArrived:', e)); });
}
