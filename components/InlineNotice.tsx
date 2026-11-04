import React from "react";
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { GlassCard } from "./GlassCard";

type IoniconName = keyof typeof Ionicons.glyphMap;

export type InlineNoticeVariant = "info" | "success" | "warning" | "error";

export interface InlineNoticeProps {
    variant: InlineNoticeVariant;
    text: string;
    icon?: IoniconName;
    actionLabel?: string;
    onAction?: () => void;
    style?: StyleProp<ViewStyle>;
}

const VARIANT_COLOR: Record<InlineNoticeVariant, string> = {
    info: C.primaryLight,
    success: C.success,
    warning: C.warning,
    error: C.danger,
};

const VARIANT_ICON: Record<InlineNoticeVariant, IoniconName> = {
    info: "information-circle-outline",
    success: "checkmark-circle-outline",
    warning: "alert-circle-outline",
    error: "close-circle-outline",
};

export function InlineNotice({ variant, text, icon, actionLabel, onAction, style }: InlineNoticeProps) {
    if (!text) return null;
    const color = VARIANT_COLOR[variant];
    return (
        <GlassCard radius={12} blur={false} leftAccentColor={color} style={style} contentStyle={s.content}>
            <View style={s.row} accessibilityRole="alert">
                <Ionicons name={icon ?? VARIANT_ICON[variant]} size={16} color={color} />
                <Text style={s.text}>{text}</Text>
                {!!actionLabel && !!onAction && (
                    <TouchableOpacity
                        onPress={onAction}
                        accessibilityRole="button"
                        accessibilityLabel={actionLabel}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={s.action}
                    >
                        <Text style={[s.actionTxt, { color }]} numberOfLines={1}>{actionLabel}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </GlassCard>
    );
}

const s = StyleSheet.create({
    content: { padding: 12 },
    row: { flexDirection: "row", alignItems: "center", gap: 8 },
    text: { color: C.text, fontSize: 13, lineHeight: 18, flexShrink: 1, flexGrow: 1 },
    action: { flexShrink: 0, paddingHorizontal: 4, paddingVertical: 2 },
    actionTxt: { fontSize: 13, fontWeight: "800" },
});

export default InlineNotice;
