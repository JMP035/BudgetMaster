import React from "react";
import { ActivityIndicator, StyleProp, StyleSheet, Text, TouchableOpacity, useWindowDimensions, View, ViewStyle } from "react-native";
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
    ghost: C.textPrimary,
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
                    <Text style={[s.label, { color }]}>{label}</Text>
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
    groupRow: { flexDirection: "row", alignItems: "stretch" },
    groupColumn: { flexDirection: "column", alignItems: "stretch" },
    groupItemRow: { flex: 1 },
});

export interface GlassButtonGroupProps {
    children: React.ReactNode;
    /** "auto": fila en pantallas anchas, columna en pantallas angostas o con texto grande. */
    direction?: "auto" | "row" | "column";
    breakpoint?: number;
    gap?: number;
    /** En columna, el botón primario (o sin kind) va primero. */
    primaryFirstWhenStacked?: boolean;
    style?: StyleProp<ViewStyle>;
}

type GlassButtonElement = React.ReactElement<GlassButtonProps>;

export function GlassButtonGroup({
    children,
    direction = "auto",
    breakpoint = 400,
    gap = 8,
    primaryFirstWhenStacked = true,
    style,
}: GlassButtonGroupProps) {
    const { width, fontScale } = useWindowDimensions();
    const stacked = direction === "column" || (direction === "auto" && (width < breakpoint || fontScale > 1.2));
    let items = React.Children.toArray(children).filter(React.isValidElement) as GlassButtonElement[];
    if (stacked && primaryFirstWhenStacked) {
        const isPrimary = (el: GlassButtonElement) => !el.props.kind || el.props.kind === "primary";
        items = [...items.filter(isPrimary), ...items.filter(el => !isPrimary(el))];
    }
    return (
        <View style={[stacked ? s.groupColumn : s.groupRow, { gap }, style]}>
            {items.map(child => (stacked
                ? child
                : React.cloneElement(child, { style: [child.props.style, s.groupItemRow] })))}
        </View>
    );
}

export default GlassButton;
