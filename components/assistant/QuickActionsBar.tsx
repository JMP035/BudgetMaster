import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTutorialRef } from "../../context/TutorialContext";
import { C } from "../../theme";
import { GlassBackground } from "../GlassCard";

type IoniconName = keyof typeof Ionicons.glyphMap;

export type QuickActionId = "goal" | "budget" | "fixed" | "expense" | "query";

export const QUICK_ACTIONS: { id: QuickActionId; label: string; icon: IoniconName }[] = [
    { id: "goal", label: "Crear meta", icon: "trophy-outline" },
    { id: "budget", label: "Presupuesto", icon: "pie-chart-outline" },
    { id: "fixed", label: "Gasto fijo", icon: "calendar-outline" },
    { id: "expense", label: "Registrar gasto", icon: "remove-circle-outline" },
    { id: "query", label: "Consultar", icon: "search-outline" },
];

export const QUICK_BAR_HEIGHT = 40;

export interface QuickActionsBarProps {
    onAction: (id: QuickActionId) => void;
    disabled?: boolean;
}

export function QuickActionsBar({ onAction, disabled = false }: QuickActionsBarProps) {
    const actionsRef = useTutorialRef("advisor_actions");
    return (
        <View ref={actionsRef} collapsable={false} style={s.wrap}>
            <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                style={s.scroll}
                contentContainerStyle={s.content}
            >
                {QUICK_ACTIONS.map(a => (
                    <TouchableOpacity
                        key={a.id}
                        onPress={() => onAction(a.id)}
                        disabled={disabled}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={a.label}
                        accessibilityState={{ disabled }}
                        style={[s.chip, disabled && s.chipDisabled]}
                    >
                        <GlassBackground radius={QUICK_BAR_HEIGHT / 2} blur={false} />
                        <Ionicons name={a.icon} size={16} color={C.primaryLight} />
                        <Text style={s.label} numberOfLines={1} maxFontSizeMultiplier={1.3}>{a.label}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { height: QUICK_BAR_HEIGHT },
    scroll: { height: QUICK_BAR_HEIGHT, flexGrow: 0 },
    content: { paddingHorizontal: 16, gap: 8, alignItems: "center" },
    chip: {
        height: QUICK_BAR_HEIGHT,
        borderRadius: QUICK_BAR_HEIGHT / 2,
        paddingHorizontal: 14,
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        overflow: "hidden",
    },
    chipDisabled: { opacity: 0.5 },
    label: { color: C.text, fontSize: 13, fontWeight: "800" },
});

export default QuickActionsBar;
