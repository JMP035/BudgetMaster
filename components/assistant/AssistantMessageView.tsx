import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { Chip, ChatMessage } from "../../services/assistant/types";
import type { UserSettings } from "../../services/storage";
import { C } from "../../theme";
import { GlassBackground, GlassCard } from "../GlassCard";
import { InlineNotice } from "../InlineNotice";
import { ProposalCard } from "./ProposalCard";
import { QueryResultCard } from "./QueryResultCard";

export interface AssistantMessageViewProps {
    message: ChatMessage;
    /** Solo el último mensaje tiene chips activos. */
    isLast: boolean;
    onChip: (chip: Chip) => void;
    onConfirm: (proposalId: string) => void;
    onEdit: (proposalId: string) => void;
    onCancel: (proposalId: string) => void;
    /** Recibe el id del mensaje de tipo notice. */
    onUndo: (messageId: string) => void;
    settings: UserSettings;
    /** Opcional: y del mensaje dentro del contenedor, para hacer scroll hasta una tarjeta. */
    onLayoutMessage?: (messageId: string, y: number) => void;
}

const CANCEL_CHIP: Chip = { label: "Cancelar", value: "cancelar" };

function ChoiceChip({ chip, disabled, onPress, muted }: {
    chip: Chip; disabled: boolean; onPress: () => void; muted?: boolean;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={chip.label}
            accessibilityState={{ disabled }}
            style={[bs.chip, disabled && bs.chipOff]}
        >
            <GlassBackground radius={18} blur={false} />
            <Text style={[bs.chipTxt, muted && { color: C.textSub }]}>{chip.label}</Text>
        </TouchableOpacity>
    );
}

export function AssistantMessageView({
    message, isLast, onChip, onConfirm, onEdit, onCancel, onUndo, onLayoutMessage,
}: AssistantMessageViewProps) {
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(message.role === "user" ? 20 : -20)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 250, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, friction: 7, useNativeDriver: true }),
        ]).start();
    }, []);

    const isUser = message.role === "user";

    let body: React.ReactNode = null;
    switch (message.kind) {
        case "text":
            body = isUser ? (
                <View style={[bs.bubble, bs.userBubble]}>
                    <Text style={[bs.text, bs.userText]}>{message.text}</Text>
                </View>
            ) : (
                <GlassCard radius={18} blur={false} style={bs.aiBubble} contentStyle={bs.aiBubbleContent}>
                    <Text style={bs.text}>{message.text}</Text>
                </GlassCard>
            );
            break;

        case "question":
            body = (
                <GlassCard radius={18} blur={false} style={bs.questionBubble} contentStyle={bs.aiBubbleContent}>
                    <Text style={bs.text}>{message.text}</Text>
                    <View style={bs.chips}>
                        {message.chips.map(c => (
                            <ChoiceChip key={c.label + c.value} chip={c} disabled={!isLast} onPress={() => onChip(c)} />
                        ))}
                        <ChoiceChip chip={CANCEL_CHIP} muted disabled={!isLast} onPress={() => onChip(CANCEL_CHIP)} />
                    </View>
                </GlassCard>
            );
            break;

        case "proposal":
            body = (
                <ProposalCard
                    proposal={message.proposal}
                    onConfirm={onConfirm}
                    onEdit={onEdit}
                    onCancel={onCancel}
                />
            );
            break;

        case "query":
            body = <QueryResultCard result={message.result} />;
            break;

        case "notice": {
            const canUndo = message.undoState === "available" && !!message.undo;
            const undone = message.undoState === "done";
            body = (
                <View style={bs.noticeWrap}>
                    <InlineNotice
                        variant={undone ? "info" : message.variant}
                        icon={undone ? "arrow-undo-outline" : undefined}
                        text={undone ? `Deshecho: ${message.text}` : message.text}
                        actionLabel={canUndo ? "Deshacer" : undefined}
                        onAction={canUndo ? () => onUndo(message.id) : undefined}
                    />
                </View>
            );
            break;
        }
    }

    return (
        <Animated.View
            onLayout={onLayoutMessage ? e => onLayoutMessage(message.id, e.nativeEvent.layout.y) : undefined}
            accessibilityLiveRegion={isUser ? undefined : "polite"}
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
            {body}
        </Animated.View>
    );
}

/** Fila «Analizando…» del asistente (no es un mensaje; no se persiste). */
export function AssistantTypingRow({ text }: { text?: string }) {
    return (
        <View style={[bs.wrap, bs.aiWrap]} accessibilityLiveRegion="polite">
            <View style={bs.aiAvatar}>
                <Ionicons name="sparkles" size={14} color={C.primaryLight} />
            </View>
            <GlassCard radius={18} blur={false} style={bs.aiBubble} contentStyle={bs.aiBubbleContent}>
                <View style={bs.loadingRow}>
                    <ActivityIndicator size="small" color={C.primary} />
                    <Text style={bs.loadingTxt}>{text || "Analizando…"}</Text>
                </View>
            </GlassCard>
        </View>
    );
}

// Estilos `bs` copiados de AIAdvisor.tsx (MessageBubble) + los de los tipos nuevos.
const bs = StyleSheet.create({
    wrap: { marginBottom: 16 },
    userWrap: { alignItems: "flex-end" },
    aiWrap: { alignItems: "flex-start", flexDirection: "row", gap: 8 },
    aiAvatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: C.primaryDark + "44", borderWidth: 1, borderColor: C.primary + "55", alignItems: "center", justifyContent: "center", marginTop: 4, flexShrink: 0 },
    bubble: { maxWidth: "80%", padding: 14, borderRadius: 18 },
    userBubble: { backgroundColor: C.primary, borderBottomRightRadius: 4, borderWidth: 1, borderColor: C.primaryLight },
    aiBubble: { maxWidth: "80%", flexShrink: 1, borderBottomLeftRadius: 4 },
    aiBubbleContent: { padding: 14 },
    text: { color: C.text, fontSize: 14, lineHeight: 22 },
    userText: { color: C.onPrimary },
    loadingRow: { flexDirection: "row", alignItems: "center", gap: 10 },
    loadingTxt: { color: C.textSub, fontSize: 13 },
    questionBubble: { flex: 1, flexShrink: 1, minWidth: 0, borderBottomLeftRadius: 4 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12 },
    chip: { minHeight: 36, maxWidth: "100%", borderRadius: 18, paddingHorizontal: 14, paddingVertical: 6, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    chipOff: { opacity: 0.45 },
    chipTxt: { color: C.textPrimary, fontSize: 13, fontWeight: "800", flexShrink: 1, textAlign: "center" },
    noticeWrap: { flex: 1, flexShrink: 1, minWidth: 0 },
});

export default AssistantMessageView;
