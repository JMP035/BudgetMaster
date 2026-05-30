import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator, Animated, Easing, KeyboardAvoidingView,
    Platform, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View
} from "react-native";
import {
    Account, CategoryBudget, CreditInstallment, FixedExpense,
    SavingsGoal, Transaction, UserSettings,
    getCurrentFinancialPeriod, getDaysUntilNextPayment
} from "../services/storage";
import { C, shadow } from "../theme";

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
        ? activeAccounts.map(a => `  · ${a.name} (${a.type}): Q${a.balance.toFixed(2)}`).join("\n")
        : "  · No hay cuentas configuradas";
    const totalBalance = activeAccounts.reduce((s, a) => s + (a.currency === "USD" ? a.balance * (settings.exchangeRate || 7.7) : a.balance), 0);

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
            const pctB = Math.round((spent / b.limit) * 100); 
            return `  · ${b.categoryId}: Q${spent.toFixed(0)} / Q${b.limit.toFixed(0)} (${pctB}%${pctB >= 100 ? " ⚠️ EXCEDIDO" : ""})`; 
        })
        .join("\n") || "  · Sin límites por categoría";

    // Metas de ahorro
    const goalsSummary = savingsGoals.filter(g => !g.isCompleted).slice(0, 3)
        .map(g => { const pctG = Math.round((g.currentAmount / g.targetAmount) * 100); return `  · ${g.name}: Q${g.currentAmount.toFixed(0)} / Q${g.targetAmount.toFixed(0)} (${pctG}%)`; })
        .join("\n") || "  · Sin metas activas";

    // Visacuotas
    const installTotal = creditInstallments.filter(c => (c.totalInstallments - c.paidInstallments) > 0)
        .reduce((s, c) => s + c.monthlyPayment, 0);
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
Patrimonio total en cuentas: Q${totalBalance.toFixed(2)}

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
- Las "visacuotas" son compras financiadas a través de la tarjeta de crédito en cuotas mensuales
- Si el usuario tiene visacuotas activas, incluílas en el análisis de flujo de caja mensual
- La deuda de tarjeta de crédito reduce el patrimonio neto
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
async function callGemini(
    history: GeminiMessage[],
    apiKey: string,
    newMessage: string,
    context: string,
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
    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${trimmedKey}`,
        {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                contents: messages,
                generationConfig: {
                    maxOutputTokens: 400,
                    temperature: 0.7,
                    topP: 0.9,
                },
            }),
        }
    );

    if (!res.ok) throw new Error(`Gemini error: ${res.status}`);

    const data = await res.json();
    if (data?.candidates?.[0]?.content?.parts?.[0]?.text) {
        return data.candidates[0].content.parts[0].text
            .replace(/\*\*/g, "")
            .replace(/\*/g, "")
            .trim();
    }
    throw new Error("Respuesta vacía de Gemini");
}

// ─────────────────────────────────────────────────────────────
// RESPUESTA LOCAL (fallback sin API Key)
// ─────────────────────────────────────────────────────────────
function getLocalResponse(
    message: string, transactions: Transaction[], settings: UserSettings,
    accounts: Account[] = [], fixedExpenses: FixedExpense[] = [],
    savingsGoals: SavingsGoal[] = [], creditInstallments: CreditInstallment[] = [],
): string {
    const fp = getCurrentFinancialPeriod(settings);
    const daysLeft = getDaysUntilNextPayment(settings);

    const periodTx  = transactions.filter(t => { const d = new Date(t.date); return d >= fp.start && d <= fp.end; });
    const expenseQ  = periodTx.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const incomeQ   = periodTx.filter(t => t.type === "income"  && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const remaining = settings.budgetLimit - expenseQ;
    const pct       = Math.round((expenseQ / settings.budgetLimit) * 100);

    // Top categorías del período
    const catMap: Record<string, number> = {};
    periodTx.filter(t => t.type === "expense").forEach(t => { catMap[t.category] = (catMap[t.category] || 0) + t.amount; });
    const topCats = Object.entries(catMap).sort((a, b) => b[1] - a[1]).slice(0, 3)
        .map(([cat, amt]) => `${cat} Q${amt.toFixed(0)}`).join(", ");

    const fixedPending = fixedExpenses.filter(f => f.isActive && !f.isPaid).reduce((s, f) => s + f.amount, 0);
    const installTotal = creditInstallments.filter(c => (c.totalInstallments - c.paidInstallments) > 0).reduce((s, c) => s + c.monthlyPayment, 0);
    const totalBalance = accounts.filter(a => a.isActive).reduce((s, a) => s + a.balance, 0);

    const msg = message.toLowerCase();

    if (msg.match(/hola|buenos|buenas|hey|inicio/)) {
        return `Hola ${settings.userName}. Período ${fp.label}: llevás Q${expenseQ.toFixed(0)} gastados de Q${settings.budgetLimit.toFixed(0)} (${pct}%). Te quedan Q${remaining.toFixed(0)} y ${daysLeft} días hasta tu próximo ingreso. ¿En qué te ayudo?`;
    }
    if (msg.match(/como voy|resumen|situacion|estado|analisis|summary/)) {
        return `Período ${fp.label} — Gastos: Q${expenseQ.toFixed(0)} (${pct}% del presupuesto), Ingresos: Q${incomeQ.toFixed(0)}, Libre: Q${remaining.toFixed(0)}. Gastos fijos pendientes: Q${fixedPending.toFixed(0)}. Cuotas mensuales: Q${installTotal.toFixed(0)}. ${pct > 80 ? "Estás en zona de alerta." : "Vas bien."}`;
    }
    if (msg.match(/gaste|gaste mas|categor|donde|en que/)) {
        return topCats
            ? `Tus mayores gastos del período son: ${topCats}. En total llevás Q${expenseQ.toFixed(0)} gastados.`
            : `Aún no tenés gastos registrados en este período (${fp.label}).`;
    }
    if (msg.match(/puedo comprar|puedo gastar|tengo para|alcanza|cuesta/)) {
        const numMatch = message.match(/[\d,]+(?:\.\d+)?/);
        if (numMatch) {
            const amount = parseFloat(numMatch[0].replace(",", "."));
            if (amount <= remaining) return `Con Q${remaining.toFixed(0)} disponibles sí podés comprarlo (Q${amount.toFixed(0)}). Te quedarán Q${(remaining - amount).toFixed(0)} y aún faltan ${daysLeft} días hasta tu pago.`;
            return `No es recomendable. Tenés Q${remaining.toFixed(0)} disponibles pero la compra es Q${amount.toFixed(0)} — excede en Q${(amount - remaining).toFixed(0)}.`;
        }
        return `Disponés de Q${remaining.toFixed(0)} en tu presupuesto (${100 - pct}% restante). ¿Cuánto cuesta lo que querés comprar?`;
    }
    if (msg.match(/ahorro|ahorrar|meta|objetivo|guardar/)) {
        const activeGoals = savingsGoals.filter(g => !g.isCompleted);
        const goal = activeGoals[0];
        if (goal) return `Tu meta "${goal.name}" lleva Q${goal.currentAmount.toFixed(0)} de Q${goal.targetAmount.toFixed(0)} (${Math.round(goal.currentAmount / goal.targetAmount * 100)}%). Tu balance neto este período es Q${(incomeQ - expenseQ).toFixed(0)}.`;
        return `Tu balance neto este período es Q${(incomeQ - expenseQ).toFixed(0)}. Para mejores consejos de ahorro, configurá una meta en la sección de Presupuesto.`;
    }
    if (msg.match(/deuda|tarjeta|credito|cuota|visa/)) {
        return `Tenés Q${installTotal.toFixed(0)} en cuotas mensuales activas y Q${settings.activeDebts || 0} en deudas declaradas. Eso representa Q${(installTotal / Math.max(settings.monthlyIncome, 1) * 100).toFixed(0)}% de tu ingreso mensual.`;
    }
    if (msg.match(/cuenta|banco|saldo|billetera/)) {
        if (accounts.filter(a => a.isActive).length > 0)
            return `Tus cuentas suman Q${totalBalance.toFixed(2)} en total. ${accounts.filter(a => a.isActive).map(a => `${a.name}: Q${a.balance.toFixed(0)}`).join(", ")}.`;
        return `No tenés cuentas bancarias configuradas. Podés agregarlas en la sección de Cuentas.`;
    }
    if (msg.match(/fijo|recurrente|servicios|pagos fijos/)) {
        return `Gastos fijos activos: Q${fixedExpenses.filter(f => f.isActive).reduce((s, f) => s + f.amount, 0).toFixed(0)}/período. Pendientes de pago: Q${fixedPending.toFixed(0)}.`;
    }

    if (settings.geminiApiKey && settings.geminiApiKey.length > 20) {
        return `Disponés de Q${remaining.toFixed(0)} en tu presupuesto para este período (${100 - pct}% restante) y quedan ${daysLeft} días para tu próximo pago. ¿Deseas que analicemos algún movimiento o meta de ahorro específica?`;
    }
    return `Tenés Q${remaining.toFixed(0)} disponibles este período (${100 - pct}% del presupuesto, ${daysLeft} días hasta tu pago). Para análisis avanzados con IA real, configurá tu API Key de Gemini en Ajustes — es gratuita en aistudio.google.com.`;
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
            <View style={[bs.bubble, isUser ? bs.userBubble : bs.aiBubble]}>
                {message.loading ? (
                    <View style={bs.loadingRow}>
                        <ActivityIndicator size="small" color={C.primary} />
                        <Text style={bs.loadingTxt}>Analizando...</Text>
                    </View>
                ) : (
                    <Text style={[bs.text, isUser && bs.userText]}>{message.text}</Text>
                )}
            </View>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────
// SUGERENCIAS RÁPIDAS
// ─────────────────────────────────────────────────────────────
const QUICK_SUGGESTIONS = [
    "¿Cómo voy este mes?",
    "¿En qué gasté más?",
    "¿Puedo ahorrar más?",
    "Dame un consejo",
];

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

    const [messages, setMessages] = useState<Message[]>([
        {
            id: "welcome",
            role: "ai",
            text: hasApiKey
                ? `¡Hola ${settings.userName}! Soy tu CFO personal. Tengo acceso a tus datos financieros reales y puedo ayudarte con cualquier análisis o decisión. ¿En qué te puedo ayudar hoy?`
                : `¡Hola ${settings.userName}! Soy tu asesor financiero. Para respuestas avanzadas con IA real, configurá tu API Key de Gemini en Ajustes (es gratuita). Por ahora puedo responderte con análisis básico de tus datos.`,
        }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const [geminiHistory, setGeminiHistory] = useState<GeminiMessage[]>([]);
    const scrollRef = useRef<ScrollView>(null);
    const inputRef = useRef<TextInput>(null);

    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages]);

    useEffect(() => {
        setMessages(prev => {
            if (prev.length > 0 && (prev[0].id === "welcome" || prev[0].id === "welcome_new")) {
                const updatedWelcome = {
                    ...prev[0],
                    text: hasApiKey
                        ? `¡Hola ${settings.userName}! Soy tu CFO personal. Tengo acceso a tus datos financieros reales y puedo ayudarte con cualquier análisis o decisión. ¿En qué te puedo ayudar hoy?`
                        : `¡Hola ${settings.userName}! Soy tu asesor financiero. Para respuestas avanzadas con IA real, configurá tu API Key de Gemini en Ajustes (es gratuita). Por ahora puedo responderte con análisis básico de tus datos.`,
                };
                return [updatedWelcome, ...prev.slice(1)];
            }
            return prev;
        });
    }, [hasApiKey, settings.userName]);

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

                response = await callGemini(trimmedHistory, settings.geminiApiKey!, userText, context);

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
                response = getLocalResponse(userText, transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments);
            }
        } catch (e: any) {
            const errStr = e.message || "";
            if (errStr.includes("429")) {
                response = "⚠️ Límite de solicitudes alcanzado en Gemini. Espera unos segundos e intenta de nuevo.";
            } else if (errStr.includes("400")) {
                response = "⚠️ Error 400 (Solicitud incorrecta): Verifica que tu API Key de Gemini en Ajustes esté bien escrita y no contenga espacios adicionales.";
            } else if (errStr.includes("403")) {
                response = "⚠️ Error 403 (Acceso denegado): La API Key ingresada no es válida para Gemini. Por favor, asegúrate de haber copiado la clave completa en Ajustes.";
            } else if (errStr.includes("404")) {
                response = "⚠️ Error 404 (Modelo no encontrado): El modelo de Gemini configurado no está disponible actualmente.";
            } else {
                const offlineResp = getLocalResponse(userText, transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments);
                response = `🔌 (Asistente local sin conexión) ${offlineResp}`;
            }
        }

        // Reemplazar mensaje de carga con respuesta real
        setMessages(prev => [
            ...prev.filter(m => !m.loading),
            { id: `a_${Date.now()}`, role: "ai", text: response },
        ]);
        setLoading(false);
    };

    const handleClearChat = () => {
        setMessages([{
            id: "welcome_new",
            role: "ai",
            text: `Chat reiniciado. ¿En qué te puedo ayudar, ${settings.userName}?`,
        }]);
        setGeminiHistory([]);
    };

    return (
        <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            keyboardVerticalOffset={Platform.OS === "android" ? 20 : 90}
        >
            <View style={s.screen}>

                {/* HEADER */}
                <View style={s.header}>
                    <View style={s.headerLeft}>
                        <View style={s.iconBg}>
                            <Ionicons name="sparkles" size={22} color={C.primaryLight} />
                        </View>
                        <View>
                            <Text style={s.title}>Asesor IA</Text>
                            <Text style={s.subtitle}>
                                {hasApiKey ? "● Gemini activo" : "○ Modo básico"}
                            </Text>
                        </View>
                    </View>
                    <TouchableOpacity onPress={handleClearChat} style={s.clearBtn}>
                        <Ionicons name="refresh-outline" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                </View>

                {/* BADGE sin API Key */}
                {!hasApiKey && (
                    <View style={s.apiKeyBanner}>
                        <Ionicons name="key-outline" size={14} color={C.warning} />
                        <Text style={s.apiKeyTxt}>
                            Configurá tu API Key de Gemini en Ajustes para respuestas avanzadas (gratuita)
                        </Text>
                    </View>
                )}

                {/* MENSAJES */}
                <ScrollView
                    ref={scrollRef}
                    style={s.chatList}
                    contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                >
                    {messages.map(msg => <MessageBubble key={msg.id} message={msg} />)}
                </ScrollView>

                {/* SUGERENCIAS RÁPIDAS */}
                {messages.length <= 2 && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        style={s.suggestionsRow}
                        contentContainerStyle={{ paddingHorizontal: 16, gap: 8 }}
                    >
                        {QUICK_SUGGESTIONS.map(q => (
                            <TouchableOpacity
                                key={q}
                                style={s.suggestionChip}
                                onPress={() => handleSend(q)}
                            >
                                <Text style={s.suggestionTxt}>{q}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}

                {/* INPUT */}
                <View style={s.inputContainer}>
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
                            ? <ActivityIndicator size="small" color="#1A0E00" />
                            : <Ionicons name="send" size={20} color="#1A0E00" />
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
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingTop: 52, paddingBottom: 16 },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 12 },
    iconBg: { width: 44, height: 44, borderRadius: 14, backgroundColor: C.primaryDark + "44", borderWidth: 1, borderColor: C.primary + "55", alignItems: "center", justifyContent: "center", ...shadow(C.primaryGlow, 8, 0.4) },
    title: { color: C.textPrimary, fontSize: 20, fontWeight: "900" },
    subtitle: { color: C.textMuted, fontSize: 11, marginTop: 2 },
    clearBtn: { padding: 10, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
    apiKeyBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.warning + "11", borderWidth: 1, borderColor: C.warning + "33", marginHorizontal: 16, marginBottom: 8, padding: 10, borderRadius: 10 },
    apiKeyTxt: { color: C.warning, fontSize: 12, flex: 1 },
    chatList: { flex: 1, paddingHorizontal: 16 },
    suggestionsRow: { maxHeight: 48, marginBottom: 8 },
    suggestionChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.primaryDark + "33", borderRadius: 20, borderWidth: 1, borderColor: C.primary + "44" },
    suggestionTxt: { color: C.primaryLight, fontSize: 13, fontWeight: "600" },
    // INPUT — el contenedor siempre visible, el input se contrae si el nombre es largo
    inputContainer: {
        flexDirection: "row",
        alignItems: "flex-end",
        padding: 12,
        paddingBottom: 16,
        backgroundColor: C.card,
        borderTopWidth: 1,
        borderTopColor: C.shimmer,
        gap: 8,
        ...shadow("#000", 8, 0.3),
        // Asegurar que el contenedor no desborde
        flexWrap: "nowrap",
        overflow: "hidden",
    },
    input: {
        flex: 1,
        // minWidth: 0 es clave para que el TextInput se contraiga cuando hay poco espacio
        minWidth: 0,
        backgroundColor: C.bgDeep,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.cardBorder,
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
        ...shadow(C.primaryGlow, 8, 0.5),
    },
});

const bs = StyleSheet.create({
    wrap: { marginBottom: 16 },
    userWrap: { alignItems: "flex-end" },
    aiWrap: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
    aiAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primaryDark + "44", borderWidth: 1, borderColor: C.primary + "55", alignItems: "center", justifyContent: "center", marginTop: 4 },
    bubble: { maxWidth: "80%", padding: 14, borderRadius: 18 },
    userBubble: { backgroundColor: C.primary, borderBottomRightRadius: 4, borderWidth: 1, borderColor: C.primaryLight },
    aiBubble: { backgroundColor: C.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.cardBorder },
    text: { color: C.text, fontSize: 14, lineHeight: 22 },
    userText: { color: "#1A0E00" },
    loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    loadingTxt: { color: C.textMuted, fontSize: 13 },
});