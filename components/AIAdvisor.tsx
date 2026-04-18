import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Transaction, UserSettings } from "../services/storage";
import { getAIResponse } from "../ai";
import { C, shadow } from "../theme";

interface Props { transactions: Transaction[]; settings: UserSettings; }

export default function AIAdvisor({ transactions, settings }: Props) {
    const [messages, setMessages] = useState<{ id: string; role: "user" | "ai"; text: string }[]>([
        { id: "1", role: "ai", text: `¡Hola ${settings.userName}! Soy tu asesor financiero. Pregúntame si puedes comprar algo o pide un resumen de tus finanzas. ${!settings.geminiApiKey ? '\n\n⚠️ TIP: Ingresa tu Google Gemini API Key en Ajustes para poder chatear conmigo con inteligencia natural y realista.' : ''}` }
    ]);
    const [input, setInput] = useState("");
    const [loading, setLoading] = useState(false);
    const scrollRef = useRef<ScrollView>(null);

    const handleSend = async () => {
        if (!input.trim()) return;
        const userMsg = input.trim();
        setInput("");

        setMessages(prev => [...prev, { id: Date.now().toString(), role: "user", text: userMsg }]);
        setLoading(true);

        // Call the async API or local logic
        const rep = await getAIResponse(userMsg, transactions, settings);

        setMessages(prev => [...prev, { id: (Date.now() + 1).toString(), role: "ai", text: rep }]);
        setLoading(false);
    };

    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages]);

    return (
        <View style={s.screen}>
            <View style={s.header}>
                <View style={s.iconBg}>
                    <Ionicons name="sparkles" size={24} color={C.primaryLight} />
                </View>
                <Text style={s.title}>Asesor IA</Text>
            </View>

            <ScrollView ref={scrollRef} style={s.chatList} showsVerticalScrollIndicator={false}>
                {messages.map(m => (
                    <View key={m.id} style={[s.bubble, m.role === "user" ? s.userBubble : s.aiBubble]}>
                        {m.role === "ai" && <Ionicons name="sparkles" size={14} color={C.primary} style={s.aiIcon} />}
                        <Text style={[s.text, m.role === "user" && { color: "#1A0E00" }]}>{m.text}</Text>
                    </View>
                ))}
                {loading && (
                    <View style={[s.bubble, s.aiBubble, { width: 60, alignItems: "center" }]}>
                        <ActivityIndicator color={C.primary} size="small" />
                    </View>
                )}
                <View style={{ height: 40 }} />
            </ScrollView>

            <View style={s.inputContainer}>
                <TextInput
                    style={s.input}
                    value={input}
                    onChangeText={setInput}
                    placeholder="Ej: Quiero comprar unos zapatos de Q500..."
                    placeholderTextColor={C.textMuted}
                    onSubmitEditing={handleSend}
                />
                <TouchableOpacity style={s.sendBtn} onPress={handleSend}>
                    <Ionicons name="send" size={20} color="#1A0E00" />
                </TouchableOpacity>
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, paddingTop: 52 },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, marginBottom: 16 },
    iconBg: { width: 44, height: 44, borderRadius: 22, backgroundColor: C.primaryDark + "33", borderWidth: 1, borderColor: C.primary + "55", alignItems: "center", justifyContent: "center", ...shadow(C.primaryGlow, 8, 0.4) },
    title: { color: C.textPrimary, fontSize: 24, fontWeight: "900", marginLeft: 12 },
    chatList: { flex: 1, paddingHorizontal: 16 },
    bubble: { maxWidth: "80%", padding: 14, borderRadius: 18, marginBottom: 16, ...shadow("#000", 4, 0.2) },
    userBubble: { alignSelf: "flex-end", backgroundColor: C.primary, borderBottomRightRadius: 4, borderWidth: 1, borderColor: C.primaryLight },
    aiBubble: { alignSelf: "flex-start", backgroundColor: C.card, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: C.cardBorder, flexDirection: "row" },
    text: { color: C.text, fontSize: 14, lineHeight: 22 },
    aiIcon: { marginRight: 8, marginTop: 2 },
    inputContainer: { flexDirection: "row", alignItems: "center", padding: 16, paddingBottom: 28, backgroundColor: C.card, borderTopWidth: 1, borderTopColor: C.shimmer, ...shadow("#000", 12, 0.3) },
    input: { flex: 1, backgroundColor: C.bgDeep, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 16, paddingVertical: 12, color: C.text, fontSize: 15 },
    sendBtn: { width: 48, height: 48, borderRadius: 24, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", marginLeft: 12, shadowColor: C.primaryGlow, shadowOpacity: 0.5, shadowRadius: 8, elevation: 6 },
});
