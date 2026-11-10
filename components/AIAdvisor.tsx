import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator, Animated, Easing, KeyboardAvoidingView,
    Platform, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View
} from "react-native";
import {
    Account, CategoryBudget, CreditInstallment, FixedExpense,
    SavingsGoal, Transaction, UserSettings,
    calcCreditCommitments, calcNetWorthFromAccounts, convertAmount, getAccountMonthlyInstallmentTotal,
    getCurrentFinancialPeriod, getDaysUntilNextPayment
} from "../services/storage";
import { buildLocalOpening, computeLocalMetrics, getLocalResponse, getQuickReplies } from "../services/LocalAdvisorEngine";
import { C } from "../theme";
import { useTutorialRef } from "../context/TutorialContext";
import { GlassBackground, GlassCard } from "./GlassCard";
import { HelpButton } from "./HelpButton";
import { InlineNotice } from "./InlineNotice";
import { ScreenHeader } from "./ScreenHeader";

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
interface Message {
    id: string;
    role: "user" | "ai";
    text: string;
    loading?: boolean;
}

interface GeminiMessage {
    role: "user" | "model";
    parts: { text: string }[];
}

// ─────────────────────────────────────────────────────────────
// CONSTRUIR CONTEXTO FINANCIERO
// ─────────────────────────────────────────────────────────────
function buildFinancialContext(
    transactions: Transaction[],
    settings: UserSettings,
    accounts: Account[] = [],
    fixedExpenses: FixedExpense[] = [],
    categoryBudgets: CategoryBudget[] = [],
    savingsGoals: SavingsGoal[] = [],
    creditInstallments: CreditInstallment[] = [],
): string {
    const now = new Date();
    const fp = getCurrentFinancialPeriod(settings);
    const daysLeft = getDaysUntilNextPayment(settings);

    // Transacciones del período financiero actual
    const periodTx = transactions.filter(t => { const d = new Date(t.date); return d >= fp.start && d <= fp.end; });
    const prevTx   = transactions.filter(t => { const d = new Date(t.date); return d >= fp.prevStart && d <= fp.prevEnd; });

    const incomeQ  = periodTx.filter(t => t.type === "income"  && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const expenseQ = periodTx.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const prevExpQ = prevTx.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const balance  = incomeQ - expenseQ;
    const pct      = settings.budgetLimit > 0 ? Math.round((expenseQ / settings.budgetLimit) * 100) : 0;
    const dailyRate   = expenseQ / Math.max(fp.daysPassed, 1);
    const projected   = dailyRate * fp.daysTotal;
    const vsLastPeriod = prevExpQ > 0 ? ((expenseQ - prevExpQ) / prevExpQ * 100).toFixed(1) : "N/A";

    // Top categorías
    const catMap: Record<string, number> = {};
    periodTx.filter(t => t.type === "expense").forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
    const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 5)
        .map(([cat, amt]) => `  · ${cat}: Q${amt.toFixed(0)}`).join("\n");

    // Historial últimos 3 períodos por mes calendario
    const m = now.getMonth(); const y = now.getFullYear();
    const history = Array.from({ length: 3 }, (_, i) => {
        const d = new Date(y, m - (2 - i), 1);
        const mo = d.getMonth(); const yr = d.getFullYear();
        const exp = transactions.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency) &&
            new Date(t.date).getMonth() === mo && new Date(t.date).getFullYear() === yr)
            .reduce((s, t) => s + t.amount, 0);
        const inc = transactions.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency) &&
            new Date(t.date).getMonth() === mo && new Date(t.date).getFullYear() === yr)
            .reduce((s, t) => s + t.amount, 0);
        return `  ${d.toLocaleDateString("es-GT", { month: "long" })}: gastos Q${exp.toFixed(0)} | ingresos Q${inc.toFixed(0)} | ahorro Q${(inc - exp).toFixed(0)}`;
    }).join("\n");

    // Cuentas bancarias
    const activeAccounts = accounts.filter(a => a.isActive);
    const accountsSummary = activeAccounts.length > 0
        ? activeAccounts.map(a => {
            if (a.type === 'credit') {
                const dayInfo = [
                    a.cutoffDay ? `corte día ${a.cutoffDay}` : null,
                    a.paymentDueDay ? `pago día ${a.paymentDueDay}` : null,
                ].filter(Boolean).join(", ");
                const accMonthly = getAccountMonthlyInstallmentTotal(creditInstallments, a.id, settings.exchangeRate, 'Q');
                return `  · ${a.name} (${a.type})${dayInfo ? `: ${dayInfo}` : ""} — cuota mensual: Q${accMonthly.toFixed(2)}`;
            }
            return `  · ${a.name} (${a.type}): Q${a.balance.toFixed(2)}`;
        }).join("\n")
        : "  · No hay cuentas configuradas";
    const { totalQ: netWorthQ, totalUSD: netWorthUSD, totalEUR: netWorthEUR, totalGBP: netWorthGBP } = calcNetWorthFromAccounts(activeAccounts, settings.exchangeRate);
    const totalBalance = netWorthQ + netWorthUSD * (settings.exchangeRate || 7.7) + netWorthEUR + netWorthGBP;

    // Compromisos de crédito (separados del patrimonio: pendiente de visacuotas)
    const { installmentsPendingQ } = calcCreditCommitments(creditInstallments, settings.exchangeRate);
    const creditCommitmentsSummary = activeAccounts.filter(a => a.type === 'credit').length > 0
        ? activeAccounts.filter(a => a.type === 'credit').map(a => {
            const accMonthly = getAccountMonthlyInstallmentTotal(creditInstallments, a.id, settings.exchangeRate, 'Q');
            return `  · ${a.name}: ${accMonthly > 0 ? `Q${accMonthly.toFixed(2)}/mes en cuotas` : "sin cuotas activas"}`;
        }).join("\n")
        : "  · Sin tarjetas de crédito registradas";

    // Gastos fijos
    const fixedTotal = fixedExpenses.filter(f => f.isActive).reduce((s, f) => s + f.amount, 0);
    const fixedPaid  = fixedExpenses.filter(f => f.isActive && f.isPaid).reduce((s, f) => s + f.amount, 0);
    const fixedPending = fixedTotal - fixedPaid;
    const fixedSummary = fixedExpenses.filter(f => f.isActive).slice(0, 5)
        .map(f => `  · ${f.name}: Q${f.amount.toFixed(0)} [${f.isPaid ? "PAGADO" : "PENDIENTE"}]`).join("\n") || "  · Sin gastos fijos";

    // Presupuestos por categoría
    const budgetsSummary = categoryBudgets.slice(0, 5)
        .map(b => { 
            const spent = transactions.filter(t => t.category === b.categoryId && t.type === "expense" && new Date(t.date) >= fp.start && new Date(t.date) <= fp.end).reduce((s,t)=>s+t.amount, 0);
            const pctB = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
            return `  · ${b.categoryId}: Q${spent.toFixed(0)} / Q${b.limit.toFixed(0)} (${pctB}%${pctB >= 100 ? " ⚠️ EXCEDIDO" : ""})`; 
        })
        .join("\n") || "  · Sin límites por categoría";

    // Metas de ahorro
    const goalsSummary = savingsGoals.filter(g => !g.isCompleted).slice(0, 3)
        .map(g => { const pctG = g.targetAmount > 0 ? Math.round((g.currentAmount / g.targetAmount) * 100) : 0; return `  · ${g.name}: Q${g.currentAmount.toFixed(0)} / Q${g.targetAmount.toFixed(0)} (${pctG}%)`; })
        .join("\n") || "  · Sin metas activas";

    // Visacuotas
    const installTotal = creditInstallments.filter(c => (c.totalInstallments - c.paidInstallments) > 0)
        .reduce((s, c) => s + convertAmount(c.monthlyPayment, c.currency, 'Q', settings.exchangeRate), 0);
    const installSummary = creditInstallments.filter(c => (c.totalInstallments - c.paidInstallments) > 0).slice(0, 3)
        .map(c => `  · ${c.name}: Q${c.monthlyPayment.toFixed(0)}/mes (${c.totalInstallments - c.paidInstallments} cuotas restantes)`)
        .join("\n") || "  · Sin cuotas activas";

    return `
=== CONTEXTO FINANCIERO COMPLETO DE ${settings.userName.toUpperCase()} ===
Fecha actual: ${now.toLocaleDateString("es-GT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
País: Guatemala | Moneda principal: ${settings.currency || "Q"}
Días hasta próximo pago: ${daysLeft}

── PERÍODO FINANCIERO ACTUAL ──
Rango: ${fp.label} (día ${fp.daysPassed} de ${fp.daysTotal})
Ingresos del período: Q${incomeQ.toFixed(2)}
Gastos del período:   Q${expenseQ.toFixed(2)}
Saldo libre:          Q${balance.toFixed(2)}
Presupuesto:          Q${settings.budgetLimit.toFixed(2)} → ${pct}% utilizado
Ritmo diario:         Q${dailyRate.toFixed(2)}/día | Proyección: Q${projected.toFixed(2)}
Vs período anterior:  ${vsLastPeriod}% (anterior: Q${prevExpQ.toFixed(0)})

── GASTOS POR CATEGORÍA (período actual) ──
${topCats || "  · Sin gastos registrados"}

── HISTORIAL ÚLTIMOS 3 MESES ──
${history}

── CUENTAS BANCARIAS ──
${accountsSummary}
Patrimonio total en cuentas (sin incluir tarjetas de crédito): Q${totalBalance.toFixed(2)}

── COMPROMISOS DE CRÉDITO (separados del patrimonio) ──
${creditCommitmentsSummary}
Pendiente total en visacuotas: Q${installmentsPendingQ.toFixed(2)}
Nota: las tarjetas de crédito ya NO tienen saldo propio (siempre sería Q0.00) — toda su deuda vive en las visacuotas asociadas. Estos compromisos NO se restan del patrimonio total. Se analizan aparte para no mezclar activos con deuda de tarjeta.

── GASTOS FIJOS MENSUALES ──
Total: Q${fixedTotal.toFixed(0)} | Pagado: Q${fixedPaid.toFixed(0)} | Pendiente: Q${fixedPending.toFixed(0)}
${fixedSummary}

── CUOTAS / VISACUOTAS ──
Carga mensual total: Q${installTotal.toFixed(0)}
${installSummary}

── PRESUPUESTOS POR CATEGORÍA ──
${budgetsSummary}

── METAS DE AHORRO ──
${goalsSummary}

── PERFIL DEL USUARIO ──
Ingreso mensual declarado: Q${settings.monthlyIncome || "No especificado"}
Ciclo de pago: ${settings.paymentCycle || "mensual"} (día ${settings.paymentDay})
Deudas activas: Q${settings.activeDebts || 0}
Meta de ahorro mensual: Q${settings.monthlySavingsGoal || 0}
Ahorros externos: Q${settings.externalSavings || 0}
======================================`.trim();
}

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT DEL CFO
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Sos el CFO personal del usuario — un asesor financiero experto con acceso COMPLETO a sus datos financieros reales. Contexto: Guatemala (moneda principal Quetzales).

REGLAS ABSOLUTAS:
1. SIEMPRE usá los números reales del contexto financiero en tus respuestas. Nunca inventes cifras.
2. Respondé DIRECTAMENTE a lo que pregunta el usuario. No des respuestas genéricas.
3. Si el usuario pregunta si puede comprar algo, calculá si tiene saldo disponible y decilo con Q exactos.
4. Si el usuario pregunta en qué gastó, listá las categorías reales con sus montos.
5. Hablás en español guatemalteco natural — sos un asesor de confianza, no un robot.
6. Cuando hay un problema financiero, dalo con la solución concreta y números específicos.
7. Respuestas concisas por defecto (máx 5 oraciones) salvo que pidan análisis detallado.
8. NUNCA digas "no tengo acceso a tus datos" — tenés acceso completo al contexto proporcionado.
9. ORIENTACIÓN A FINANZAS: Eres un asesor financiero. Si el usuario te pregunta sobre temas no financieros (como recetas de cocina, chistes, deportes, programación, etc.), debes redirigir la conversación con ingenio de vuelta al ámbito financiero y económico personal (ej. "Como tu CFO personal, no sé cocinar eso, pero sí sé cómo puedes ahorrar Q50 en los ingredientes en el supermercado..."). Nunca respondas temas ajenos a finanzas.

CONTEXTO GUATEMALTECO — RECONOCIMIENTO DE GASTOS:
- "Est. de Serv.", "Estación de Servicio", "Shell", "Texaco", "Puma", "Esso", "Redipsa", "gasolinera" = COMBUSTIBLE (categoría: fuel)
- "Pollo Campero" = comida guatemalteca icónica
- "Despensa Familiar", "Hiper Paiz", "Maxi Despensa" = supermercados GT
- "BANRURAL", "BAC", "GTC", "BANTRAB", "BI", "PROMERICA" = bancos guatemaltecos
- "Visacuota", "cuota", "cuotas" = compra a plazos en tarjeta de crédito
- "IRTRA" = parque de diversiones guatemalteco
- Canasta básica GT ≈ Q3,950/mes. Salario mínimo GT ≈ Q3,500/mes
- Tipo de cambio aproximado: Q7.70 por USD

SISTEMA DE DEUDAS Y CUOTAS:
- Las tarjetas de crédito YA NO tienen saldo propio (siempre es Q0.00): son fichas de referencia con nombre, banco, día de corte y día de pago. TODA su deuda vive en las visacuotas asociadas a esa tarjeta.
- La "cuota mensual total" de una tarjeta es la suma de las cuotas mensuales de sus visacuotas activas — así es como se mide su carga real.
- Las "visacuotas" son compras financiadas a través de la tarjeta de crédito en cuotas mensuales
- Si el usuario tiene visacuotas activas, incluílas en el análisis de flujo de caja mensual
- El patrimonio total y el pendiente en visacuotas se muestran SEPARADOS en el contexto: el patrimonio NO resta la deuda de visacuotas. Nunca digas que la deuda de tarjeta "reduce" el patrimonio neto — son cosas distintas que no deben mezclarse. Si el usuario pregunta por su situación completa, mencioná ambos por separado.
- Un ratio deuda/ingreso mayor al 30% es zona de alerta

CAPACIDADES:
- Analizar el período financiero actual (no solo el mes calendario)
- Evaluar compras contra el saldo real y días hasta el próximo pago
- Identificar categorías problemáticas y su impacto en el presupuesto
- Calcular proyecciones realistas basadas en el ritmo actual
- Analizar gastos fijos vs variables y optimizarlos
- Evaluar el avance en metas de ahorro con planes concretos
- Comparar períodos y detectar tendencias de mejora/deterioro
- Entender abreviaturas guatemaltecas de comercios (est. de serv. = gasolinera, etc.)

TONO: Directo, honesto, como un buen amigo que sabe de finanzas. Inspirado en Dave Ramsey para la disciplina, Kiyosaki para el activo/pasivo, y Buffett para el largo plazo.`;

// ─────────────────────────────────────────────────────────────
// LLAMADA A GEMINI CON HISTORIAL
// ─────────────────────────────────────────────────────────────
const GEMINI_MODEL = "gemini-2.5-flash";
// Holgado: en los modelos 2.5 el "thinking" comparte este presupuesto con la respuesta visible.
const GEMINI_MAX_OUTPUT_TOKENS = 2048;
// Continuaciones automáticas máximas cuando la respuesta se corta por MAX_TOKENS.
const GEMINI_MAX_CONTINUATIONS = 2;
const GEMINI_TIMEOUT_MS = 14000;
const CONTINUE_PROMPT = "Continúa exactamente donde quedaste, sin repetir lo anterior ni saludar.";

interface GeminiChunk {
    text: string;
    finishReason?: string;
}

/** thinkingBudget: 0 solo es válido en la familia flash (2.5-pro no permite desactivarlo). */
function supportsThinkingOff(model: string): boolean {
    return /^gemini-2\.5-flash/.test(model);
}

/** Una sola petición a Gemini con timeout propio. Devuelve texto (todas las parts) y finishReason. */
async function requestGemini(
    messages: GeminiMessage[],
    apiKey: string,
    disableThinking: boolean,
): Promise<GeminiChunk> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
        const generationConfig: Record<string, unknown> = {
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
            temperature: 0.7,
            topP: 0.9,
        };
        if (disableThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };

        const res = await fetch(
            `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`,
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: messages, generationConfig }),
                signal: controller.signal,
            }
        );
        if (!res.ok) throw new Error(`Gemini error: ${res.status}`);

        const data = await res.json();
        const candidate = data?.candidates?.[0];
        const parts: any[] = candidate?.content?.parts ?? [];
        // Concatenar TODAS las partes de texto (ignorando las de "thought" si vinieran)
        const text = parts
            .filter(p => typeof p?.text === "string" && !p?.thought)
            .map(p => p.text)
            .join("");
        return { text, finishReason: candidate?.finishReason };
    } finally {
        clearTimeout(timeoutId);
    }
}

/** Petición con thinking desactivado (si el modelo lo soporta); si la API responde 400, reintenta sin ese campo. */
async function requestGeminiSafe(messages: GeminiMessage[], apiKey: string): Promise<GeminiChunk> {
    if (supportsThinkingOff(GEMINI_MODEL)) {
        try {
            return await requestGemini(messages, apiKey, true);
        } catch (e: any) {
            if (!String(e?.message ?? "").includes("400")) throw e;
            // 400: posible campo no soportado -> reintento sin thinkingConfig
        }
    }
    return requestGemini(messages, apiKey, false);
}

async function callGemini(
    history: GeminiMessage[],
    apiKey: string,
    newMessage: string,
    context: string,
    onContinue?: () => void,
): Promise<string> {
    // Primer mensaje siempre incluye el contexto financiero
    const contextMessage: GeminiMessage = {
        role: "user",
        parts: [{ text: `${SYSTEM_PROMPT}\n\n${context}` }],
    };
    const contextAck: GeminiMessage = {
        role: "model",
        parts: [{ text: "Entendido. Tengo tu contexto financiero completo. ¿En qué te puedo ayudar?" }],
    };

    const messages: GeminiMessage[] = [
        contextMessage,
        contextAck,
        ...history,
        { role: "user", parts: [{ text: newMessage }] },
    ];

    const trimmedKey = apiKey.trim();

    const first = await requestGeminiSafe(messages, trimmedKey);
    let fullText = first.text;
    let finishReason = first.finishReason;

    // Continuación automática si se cortó por límite de tokens
    let continuations = 0;
    while (finishReason === "MAX_TOKENS" && fullText && continuations < GEMINI_MAX_CONTINUATIONS) {
        continuations++;
        onContinue?.();
        try {
            const next = await requestGeminiSafe(
                [
                    ...messages,
                    { role: "model", parts: [{ text: fullText }] },
                    { role: "user", parts: [{ text: CONTINUE_PROMPT }] },
                ],
                trimmedKey,
            );
            if (!next.text) break;
            fullText += next.text;
            finishReason = next.finishReason;
        } catch {
            // Si falla la continuación, se entrega lo que ya se tiene en vez de perder la respuesta
            break;
        }
    }

    const cleaned = fullText.replace(/\*\*/g, "").replace(/\*/g, "").trim();
    if (!cleaned) throw new Error("Respuesta vacía de Gemini");
    return cleaned;
}

// ─────────────────────────────────────────────────────────────
// BURBUJA DE MENSAJE
// ─────────────────────────────────────────────────────────────
function MessageBubble({ message }: { message: Message }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(message.role === "user" ? 20 : -20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, friction: 7, useNativeDriver: true }),
        ]).start();
    }, []);

    const isUser = message.role === "user";

    return (
        <Animated.View
            style={[
                bs.wrap,
                isUser ? bs.userWrap : bs.aiWrap,
                { opacity: fadeAnim, transform: [{ translateX: slideAnim }] },
            ]}
        >
            {!isUser && (
                <View style={bs.aiAvatar}>
                    <Ionicons name="sparkles" size={14} color={C.primaryLight} />
                </View>
            )}
            {isUser ? (
                <View style={[bs.bubble, bs.userBubble]}>
                    <Text style={[bs.text, bs.userText]}>{message.text}</Text>
                </View>
            ) : (
                <GlassCard radius={18} blur={false} style={bs.aiBubble} contentStyle={bs.aiBubbleContent}>
                    {message.loading ? (
                        <View style={bs.loadingRow}>
                            <ActivityIndicator size="small" color={C.primary} />
                            <Text style={bs.loadingTxt}>{message.text || "Analizando..."}</Text>
                        </View>
                    ) : (
                        <Text style={bs.text}>{message.text}</Text>
                    )}
                </GlassCard>
            )}
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props {
    transactions: Transaction[];
    settings: UserSettings;
    accounts?: Account[];
    fixedExpenses?: FixedExpense[];
    categoryBudgets?: CategoryBudget[];
    savingsGoals?: SavingsGoal[];
    creditInstallments?: CreditInstallment[];
}

export default function AIAdvisor({
    transactions, settings,
    accounts = [], fixedExpenses = [], categoryBudgets = [],
    savingsGoals = [], creditInstallments = [],
}: Props) {
    const hasApiKey = !!(settings.geminiApiKey && settings.geminiApiKey.length > 20);

    const metrics = useMemo(
        () => computeLocalMetrics(transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets),
        [transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets]
    );

    const getWelcomeText = (): string => hasApiKey
        ? `¡Hola ${settings.userName}! Soy tu CFO personal. Tengo acceso a tus datos financieros reales y puedo ayudarte con cualquier análisis o decisión. ¿En qué te puedo ayudar hoy?`
        : buildLocalOpening(transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets);

    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "ai",
            text: getWelcomeText(),
        }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [geminiHistory, setGeminiHistory] = useState<GeminiMessage[]>([]);
    const scrollRef = useRef<ScrollView>(null);
    const inputRef = useRef<TextInput>(null);
    const headerRef = useTutorialRef('advisor_header');
    const chatRef = useTutorialRef('advisor_chat');
    const suggestionsRef = useTutorialRef('advisor_suggestions');
    const inputBoxRef = useTutorialRef('advisor_input');
    const clearRef = useTutorialRef('advisor_clear');

    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages]);

    useEffect(() => {
        const text = getWelcomeText();
        setMessages(prev => {
            if (prev.length > 0 && (prev[0].id === "welcome" || prev[0].id === "welcome_new")) {
                if (prev[0].text === text) return prev;
                const updatedWelcome = { ...prev[0], text };
                return [updatedWelcome, ...prev.slice(1)];
            }
            return prev;
        });
    }, [hasApiKey, settings, transactions, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets]);

    const handleSend = async (text?: string) => {
        const userText = (text || input).trim();
        if (!userText || loading) return;
        setInput("");

        // Agregar mensaje del usuario
        const userMsg: Message = { id: `u_${Date.now()}`, role: "user", text: userText };
        const loadingMsg: Message = { id: `l_${Date.now()}`, role: "ai", text: "", loading: true };

        setMessages(prev => [...prev, userMsg, loadingMsg]);
        setLoading(true);

        let response = "";

        try {
            if (hasApiKey) {
                // Chat real con Gemini
                const context = buildFinancialContext(transactions, settings, accounts, fixedExpenses, categoryBudgets, savingsGoals, creditInstallments);

                // Limitar historial a los últimos 20 pares (40 mensajes) para no exceder tokens
                const MAX_HISTORY_PAIRS = 20;
                const trimmedHistory = geminiHistory.length > MAX_HISTORY_PAIRS * 2
                    ? geminiHistory.slice(-(MAX_HISTORY_PAIRS * 2))
                    : geminiHistory;

                response = await callGemini(trimmedHistory, settings.geminiApiKey!, userText, context, () => {
                    setMessages(prev => prev.map(m => m.loading ? { ...m, text: "Escribiendo..." } : m));
                });

                // Actualizar historial de Gemini
                setGeminiHistory(prev => {
                    const updated = [
                        ...prev,
                        { role: "user" as const, parts: [{ text: userText }] },
                        { role: "model" as const, parts: [{ text: response }] },
                    ];
                    // Mantener máximo 40 entradas en memoria
                    return updated.length > 40 ? updated.slice(-40) : updated;
                });
            } else {
                // Fallback local
                await new Promise(r => setTimeout(r, 600)); // Simular delay
                response = getLocalResponse(userText, transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets);
            }
        } catch (e: any) {
            const errStr = e.message || "";
            if (e.name === "AbortError" || errStr.toLowerCase().includes("abort")) {
                const offlineResp = getLocalResponse(userText, transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments);
                response = `Gemini tardó demasiado en responder (más de 14s). Te respondo en modo local mientras tanto: ${offlineResp}`;
            } else if (errStr.includes("429")) {
                response = "Límite de solicitudes alcanzado en Gemini. Espera unos segundos e intenta de nuevo.";
            } else if (errStr.includes("400")) {
                response = "Error 400 (Solicitud incorrecta): Verifica que tu API Key de Gemini en Ajustes esté bien escrita y no contenga espacios adicionales.";
            } else if (errStr.includes("403")) {
                response = "Error 403 (Acceso denegado): La API Key ingresada no es válida para Gemini. Por favor, asegúrate de haber copiado la clave completa en Ajustes.";
            } else if (errStr.includes("404")) {
                response = "Error 404 (Modelo no encontrado): El modelo de Gemini configurado no está disponible actualmente.";
            } else {
                const offlineResp = getLocalResponse(userText, transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments);
                response = `(Asistente local sin conexión) ${offlineResp}`;
            }
        }

        // Reemplazar mensaje de carga con respuesta real
        setMessages(prev => [
            ...prev.filter(m => !m.loading),
            { id: `a_${Date.now()}`, role: "ai", text: response },
        ]);
        setLoading(false);
    };

    const quickReplies = useMemo(() => getQuickReplies(metrics), [metrics]);
    const lastUserText = [...messages].reverse().find(m => m.role === "user")?.text ?? "";
    const visibleReplies = quickReplies.filter(q => q !== lastUserText);

    const handleClearChat = () => {
        if (loading) return;
        setMessages([{
            id: "welcome_new",
            role: "ai",
            text: hasApiKey
                ? `Chat reiniciado. ¿En qué te puedo ayudar, ${settings.userName}?`
                : buildLocalOpening(transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets),
        }]);
        setGeminiHistory([]);
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior="padding"
            keyboardVerticalOffset={0}
        >
            <View style={s.screen}>

                {/* HEADER */}
                <View style={s.headerWrap}>
                    <ScreenHeader
                        title="Asesor IA"
                        subtitle={hasApiKey ? "Gemini activo" : "Modo local"}
                        compact
                        headerRef={headerRef}
                        left={
                            <View style={s.iconBg}>
                                <GlassBackground radius={14} blur={false} />
                                <Ionicons name="sparkles" size={22} color={C.primaryLight} />
                            </View>
                        }
                        right={
                            <>
                                <HelpButton tutorialId="tutorial_ia" />
                                <View ref={clearRef} collapsable={false}>
                                    <TouchableOpacity
                                        onPress={handleClearChat}
                                        disabled={loading}
                                        activeOpacity={0.7}
                                        accessibilityRole="button"
                                        accessibilityLabel="Reiniciar el chat"
                                        style={[s.clearBtn, loading && { opacity: 0.4 }]}
                                    >
                                        <GlassBackground radius={18} blur={false} />
                                        <Ionicons name="refresh-outline" size={18} color={C.primaryLight} />
                                    </TouchableOpacity>
                                </View>
                            </>
                        }
                    />
                </View>

                {/* AVISO sin API Key */}
                {!hasApiKey && (
                    <InlineNotice
                        variant="info"
                        icon="shield-checkmark-outline"
                        text="Modo local: analizo tus datos en tu teléfono, sin internet. Gemini es opcional (Ajustes)."
                        style={s.banner}
                    />
                )}

                {/* MENSAJES */}
                <View ref={chatRef} collapsable={false} style={s.chatWrap}>
                    <ScrollView
                        ref={scrollRef}
                        style={s.chatList}
                        contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
                    </ScrollView>
                </View>

                {/* SUGERENCIAS RÁPIDAS */}
                <View ref={suggestionsRef} collapsable={false} style={s.suggestionsWrap}>
                    {!loading && input.trim() === "" && visibleReplies.length > 0 && (
                        <ScrollView
                            horizontal
                            showsHorizontalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            style={s.suggestionsRow}
                            contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}
                        >
                            {visibleReplies.map(q => (
                                <TouchableOpacity
                                    key={q}
                                    style={s.suggestionChip}
                                    onPress={() => handleSend(q)}
                                    disabled={loading}
                                >
                                    <Text style={s.suggestionTxt}>{q}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                </View>

                {/* INPUT */}
                <View ref={inputBoxRef} collapsable={false} style={s.inputContainer}>
                    <GlassBackground radius={0} blur={false} />
                    <TextInput
                        ref={inputRef}
                        style={s.input}
                        value={input}
                        onChangeText={setInput}
                        placeholder="Preguntame lo que necesitás..."
                        placeholderTextColor={C.textMuted}
                        onSubmitEditing={() => handleSend()}
                        returnKeyType="send"
                        multiline
                        maxLength={500}
                        editable={!loading}
                    />
                    <TouchableOpacity
                        style={[s.sendBtn, (!input.trim() || loading) && { opacity: 0.4 }]}
                        onPress={() => handleSend()}
                        disabled={!input.trim() || loading}
                    >
                        {loading
                            ? <ActivityIndicator size="small" color={C.onPrimary} />
                            : <Ionicons name="send" size={20} color={C.onPrimary} />
                        }
                    </TouchableOpacity>
                </View>

            </View>
        </KeyboardAvoidingView>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    headerWrap: { paddingHorizontal: 16 },
    iconBg: { width: 44, height: 44, borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    clearBtn: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    banner: { marginHorizontal: 16, marginBottom: 8 },
    chatWrap: { flex: 1, minHeight: 0 },
    chatList: { flex: 1, paddingHorizontal: 16 },
    suggestionsWrap: { flexShrink: 0 },
    suggestionsRow: { flexGrow: 0, height: 48, marginBottom: 8 },
    suggestionChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.primaryDark + "33", borderRadius: 20, borderWidth: 1, borderColor: C.primary + "44" },
    suggestionTxt: { color: C.primaryLight, fontSize: 13, fontWeight: "600" },
    // INPUT — el contenedor siempre visible, el input se contrae si el nombre es largo
    inputContainer: {
        flexDirection: "row",
        alignItems: "flex-end",
        padding: 12,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderTopColor: C.glassBorder,
        gap: 8,
        // Asegurar que el contenedor no desborde
        flexWrap: "nowrap",
        overflow: "hidden",
    },
    input: {
        flex: 1,
        // minWidth: 0 es clave para que el TextInput se contraiga cuando hay poco espacio
        minWidth: 0,
        backgroundColor: C.glassInput,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.glassInputBorder,
        paddingHorizontal: 16,
        paddingVertical: 10,
        color: C.text,
        fontSize: 15,
        maxHeight: 100,
    },
    // El botón siempre tiene tamaño fijo, NUNCA sale de pantalla
    sendBtn: {
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: 22,
        backgroundColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
    },
});

const bs = StyleSheet.create({
    wrap: { marginBottom: 16 },
    userWrap: { alignItems: "flex-end" },
    aiWrap: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
    aiAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primaryDark + "44", borderWidth: 1, borderColor: C.primary + "55", alignItems: "center", justifyContent: "center", marginTop: 4 },
    bubble: { maxWidth: "80%", padding: 14, borderRadius: 18 },
    userBubble: { backgroundColor: C.primary, borderBottomRightRadius: 4, borderWidth: 1, borderColor: C.primaryLight },
    aiBubble: { maxWidth: "80%", flexShrink: 1, borderBottomLeftRadius: 4 },
    aiBubbleContent: { padding: 14 },
    text: { color: C.text, fontSize: 14, lineHeight: 22 },
    userText: { color: C.onPrimary },
    loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    loadingTxt: { color: C.textSub, fontSize: 13 },
});