import React from "react";
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { GlassBackground } from "./GlassCard";

type IoniconName = keyof typeof Ionicons.glyphMap;

export type GlassButtonKind = "primary" | "secondary" | "destructive" | "ghost";

export interface GlassButtonProps {
    label: string;
    onPress: () => void;
    kind?: GlassButtonKind;
    icon?: IoniconName;
    loading?: boolean;
    disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}

const TEXT_COLOR: Record<GlassButtonKind, string> = {
    primary: C.onPrimary,
    secondary: C.text,
    destructive: C.danger,
    ghost: C.textSub,
};

export function GlassButton({
    label,
    onPress,
    kind = "primary",
    icon,
    loading = false,
    disabled = false,
    style,
}: GlassButtonProps) {
    const color = TEXT_COLOR[kind];
    const inactive = disabled || loading;
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={inactive}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ disabled: inactive, busy: loading }}
            style={[
                s.btn,
                kind === "primary" && s.primary,
                kind === "destructive" && s.destructive,
                disabled && s.disabled,
                style,
            ]}
        >
            {kind === "secondary" && <GlassBackground radius={14} blur={false} />}
            {loading ? (
                <ActivityIndicator size="small" color={color} />
            ) : (
                <>
                    {!!icon && <Ionicons name={icon} size={18} color={color} />}
                    <Text style={[s.label, { color }]} numberOfLines={2}>{label}</Text>
                </>
            )}
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    btn: {
        minHeight: 50,
        borderRadius: 14,
        paddingHorizontal: 18,
        paddingVertical: 12,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        overflow: "hidden",
    },
    primary: {
        backgroundColor: C.primary,
        borderWidth: 1,
        borderColor: C.primaryLight,
        borderTopColor: C.primaryGlow,
    },
    destructive: {
        backgroundColor: C.danger + "11",
        borderWidth: 1,
        borderColor: C.danger + "66",
    },
    disabled: { opacity: 0.5 },
    label: { fontSize: 15, fontWeight: "900", textAlign: "center", flexShrink: 1 },
});

export default GlassButton;
