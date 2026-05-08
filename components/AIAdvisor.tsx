import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator, Animated, Easing, KeyboardAvoidingView,
    Platform, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View
} from "react-native";
import { Transaction, UserSettings } from "../services/storage";
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
function buildFinancialContext(transactions: Transaction[], settings: UserSettings): string {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();

    const monthTx = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
    });

    const incomeQ = monthTx.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const expenseQ = monthTx.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const balance = incomeQ - expenseQ;
    const pct = settings.budgetLimit > 0 ? Math.round((expenseQ / settings.budgetLimit) * 100) : 0;

    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysPassed = now.getDate();
    const dailyRate = expenseQ / Math.max(daysPassed, 1);
    const projected = dailyRate * daysInMonth;

    // Top categorías del mes
    const catMap: Record<string, number> = {};
    monthTx.filter(t => t.type === "expense").forEach(t => {
        catMap[t.category] = (catMap[t.category] || 0) + t.amount;
    });
    const topCats = Object.entries(catMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([cat, amt]) => `${cat}: Q${amt.toFixed(0)}`)
        .join(", ");

    // Historial últimos 3 meses
    const history = Array.from({ length: 3 }, (_, i) => {
        const d = new Date(y, m - (2 - i), 1);
        const mo = d.getMonth();
        const yr = d.getFullYear();
        const exp = transactions
            .filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency) &&
                new Date(t.date).getMonth() === mo && new Date(t.date).getFullYear() === yr)
            .reduce((s, t) => s + t.amount, 0);
        return `${d.toLocaleDateString("es-GT", { month: "short" })}: Q${exp.toFixed(0)}`;
    }).join(" | ");

    return `
=== CONTEXTO FINANCIERO DE ${settings.userName.toUpperCase()} ===
Fecha: ${now.toLocaleDateString("es-GT", { day: "2-digit", month: "long", year: "numeric" })}
País: Guatemala

ESTE MES:
- Ingresos registrados: Q${incomeQ.toFixed(2)}
- Gastos registrados: Q${expenseQ.toFixed(2)}
- Saldo neto: Q${balance.toFixed(2)}
- Presupuesto mensual: Q${settings.budgetLimit.toFixed(2)}
- Presupuesto utilizado: ${pct}%
- Ritmo diario de gasto: Q${dailyRate.toFixed(2)}/día
- Proyección fin de mes: Q${projected.toFixed(2)}

TOP CATEGORÍAS DE GASTO:
${topCats || "Sin gastos registrados este mes"}

HISTORIAL (últimos 3 meses):
${history}

PERFIL:
- Ingreso mensual declarado: Q${settings.monthlyIncome || "No especificado"}
- Ciclo de pago: ${settings.paymentCycle || "mensual"}
- Deudas activas: Q${settings.activeDebts || 0}
- Meta de ahorro mensual: Q${settings.monthlySavingsGoal || 0}
- Ahorros externos: Q${settings.externalSavings || 0}
================================`.trim();
}

// ─────────────────────────────────────────────────────────────
// SYSTEM PROMPT DEL CFO
// ─────────────────────────────────────────────────────────────
const SYSTEM_PROMPT = `Eres el CFO personal del usuario — un asesor financiero experto, directo y honesto. 

PERSONALIDAD:
- Hablás en español latinoamericano de forma natural y conversacional
- Sos directo y no complaciente — si algo está mal lo decís claramente
- Usás los datos financieros reales del usuario en cada respuesta
- Inspiración en Napoleon Hill, Kiyosaki, Dave Ramsey y Warren Buffett
- Nunca usás emojis en exceso — máximo 1 por mensaje
- Respuestas concisas — máximo 4 oraciones a menos que el usuario pida más detalle
- NUNCA inventás datos — si no tenés info, lo decís

CAPACIDADES:
- Analizar gastos e ingresos del mes actual
- Evaluar si una compra es viable según el presupuesto real
- Dar planes de ahorro concretos con números reales
- Proyectar patrimonio futuro
- Identificar patrones de gasto problemáticos
- Dar consejos accionables y específicos

FORMATO:
- Cuando des números, usá el contexto financiero real del usuario
- Cuando evalués una compra, considerá el saldo actual y los días hasta el próximo pago
- Cuando detectés un problema financiero, dalo con la solución concreta`;

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

    const res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`,
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
function getLocalResponse(message: string, transactions: Transaction[], settings: UserSettings): string {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const monthTx = transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === m && d.getFullYear() === y; });
    const expenseQ = monthTx.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const incomeQ = monthTx.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const remaining = settings.budgetLimit - expenseQ;
    const pct = Math.round((expenseQ / settings.budgetLimit) * 100);

    const msg = message.toLowerCase();

    if (msg.match(/hola|buenos|buenas|hey/)) {
        return `Hola ${settings.userName}. Llevás el ${pct}% de tu presupuesto este mes — Q${expenseQ.toFixed(2)} gastados de Q${settings.budgetLimit.toFixed(2)}. ¿En qué te puedo ayudar?`;
    }
    if (msg.match(/como voy|resumen|situacion|estado|analisis/)) {
        return `Este mes llevás Q${expenseQ.toFixed(2)} en gastos y Q${incomeQ.toFixed(2)} en ingresos. Tu saldo libre es Q${remaining.toFixed(2)} — ${pct}% del presupuesto utilizado. ${pct > 80 ? "Estás en zona de alerta." : pct > 50 ? "Vas en la mitad, controlá el ritmo." : "Buen ritmo por ahora."}`;
    }
    if (msg.match(/puedo comprar|puedo gastar|tengo para|alcanza/)) {
        const numMatch = message.match(/[\d,]+(?:\.\d+)?/);
        if (numMatch) {
            const amount = parseFloat(numMatch[0].replace(",", "."));
            if (amount <= remaining) return `Con Q${remaining.toFixed(2)} disponibles, sí podés hacer esa compra de Q${amount.toFixed(2)}. Te quedarán Q${(remaining - amount).toFixed(2)} hasta fin de mes.`;
            return `No es recomendable. Tenés Q${remaining.toFixed(2)} disponibles y la compra es Q${amount.toFixed(2)}. Excede tu saldo en Q${(amount - remaining).toFixed(2)}.`;
        }
        return `Actualmente tenés Q${remaining.toFixed(2)} disponibles en tu presupuesto. Decime cuánto cuesta lo que querés comprar.`;
    }
    if (msg.match(/ahorro|ahorrar|meta|objetivo/)) {
        return `Tu meta de ahorro mensual es Q${settings.monthlySavingsGoal || 0}. Este mes tu balance neto es Q${(incomeQ - expenseQ).toFixed(2)}. ${(incomeQ - expenseQ) >= (settings.monthlySavingsGoal || 0) ? "Estás en camino de cumplir tu meta." : "Necesitás ajustar tus gastos para alcanzar la meta."}`;
    }
    if (msg.match(/deuda|tarjeta|credito/)) {
        return `Tenés registradas deudas por Q${settings.activeDebts || 0}. Kiyosaki lo dice claro: la deuda sin estrategia es una cadena. ¿Querés que analicemos un plan para pagarla?`;
    }

    return `Tenés Q${remaining.toFixed(2)} disponibles este mes (${100 - pct}% del presupuesto). Para respuestas más detalladas y personalizadas, configurá tu API Key de Gemini en Ajustes — es gratuita en aistudio.google.com.`;
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
}

export default function AIAdvisor({ transactions, settings }: Props) {
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
                const context = buildFinancialContext(transactions, settings);
                response = await callGemini(geminiHistory, settings.geminiApiKey!, userText, context);

                // Actualizar historial de Gemini
                setGeminiHistory(prev => [
                    ...prev,
                    { role: "user", parts: [{ text: userText }] },
                    { role: "model", parts: [{ text: response }] },
                ]);
            } else {
                // Fallback local
                await new Promise(r => setTimeout(r, 600)); // Simular delay
                response = getLocalResponse(userText, transactions, settings);
            }
        } catch (e: any) {
            if (e.message?.includes("429")) {
                response = "Límite de requests de Gemini alcanzado. Esperá unos segundos e intentá de nuevo.";
            } else if (e.message?.includes("400")) {
                response = "Hubo un error con la API Key. Verificá que sea válida en Ajustes.";
            } else {
                response = getLocalResponse(userText, transactions, settings);
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
    inputContainer: { flexDirection: "row", alignItems: "flex-end", padding: 12, paddingBottom: 16, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.shimmer, gap: 10, ...shadow("#000", 8, 0.3) },
    input: { flex: 1, backgroundColor: C.bgDeep, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 16, paddingVertical: 10, color: C.text, fontSize: 15, maxHeight: 100 },
    sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", ...shadow(C.primaryGlow, 8, 0.5) },
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