import React from "react";
import { StyleSheet, Text, StyleProp, TextStyle, ViewStyle, View } from "react-native";
import { C } from "../theme";
import { formatMoney, SignMode } from "../services/format";
import GradientText from "./GradientText";

// Importe destacado. Regla de layout: si <Money> va dentro de una fila
// (flexDirection: "row") hay que pasar containerStyle={{ flex: 1 }} o un ancho
// explícito; si no, el contenedor no tiene ancho que medir para encoger el texto.
// El camino plano (sin gradiente) no usa onLayout: es el apto para FlatList.

export type MoneySize = "xl" | "lg" | "md" | "sm";
export type MoneyTone = "auto" | "income" | "expense" | "neutral" | "warning" | "muted";

export interface MoneyProps {
    amount: number;
    currency?: string;
    size?: MoneySize;
    tone?: MoneyTone;
    sign?: SignMode;
    decimals?: 0 | 2;
    gradient?: boolean;
    prefix?: string;
    suffix?: string;
    align?: "left" | "center" | "right";
    style?: StyleProp<TextStyle>;
    containerStyle?: StyleProp<ViewStyle>;
    minScale?: number;
    accessibilityLabel?: string;
}

const SIZE = StyleSheet.create({
    xl: { fontSize: 34, fontWeight: "900" },
    lg: { fontSize: 26, fontWeight: "900" },
    md: { fontSize: 20, fontWeight: "800" },
    sm: { fontSize: 15, fontWeight: "800" },
});

const FLAT_COLOR: Record<Exclude<MoneyTone, "auto">, string> = {
    income: C.income,
    expense: C.expense,
    neutral: C.primaryLight,
    warning: C.warning,
    muted: C.textSub,
};

const GRADIENT: Partial<Record<MoneyTone, string[]>> = {
    neutral: [C.primary, C.primaryLight, C.primaryGlow, C.primaryLight],
    income: [C.accent, C.accentLight, C.accent],
};

export function Money({
    amount,
    currency = "Q",
    size = "md",
    tone = "auto",
    sign = "auto",
    decimals = 2,
    gradient,
    prefix,
    suffix,
    align = "left",
    style,
    containerStyle,
    minScale = 0.6,
    accessibilityLabel,
}: MoneyProps) {
    const resolved: Exclude<MoneyTone, "auto"> = tone === "auto" ? (amount < 0 ? "expense" : "neutral") : tone;
    const useGradient = gradient ?? ((resolved === "neutral" || resolved === "income") && size !== "sm");
    // expense y warning nunca llevan degradado
    const gradientColors = useGradient ? GRADIENT[resolved] : undefined;

    const text = (prefix ?? "") + formatMoney(amount, currency, { decimals, sign }) + (suffix ?? "");
    const label = accessibilityLabel ?? text;

    if (gradientColors) {
        return (
            <View accessible accessibilityLabel={label} accessibilityRole="text" style={containerStyle}>
                <GradientText
                    fit
                    text={text}
                    style={StyleSheet.flatten([SIZE[size], style]) as TextStyle}
                    colors={gradientColors}
                    align={align}
                    minScale={minScale}
                />
            </View>
        );
    }

    return (
        <View style={containerStyle}>
            <Text
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={minScale}
                maxFontSizeMultiplier={1.4}
                accessibilityLabel={label}
                style={[SIZE[size], { color: FLAT_COLOR[resolved], textAlign: align }, style]}
            >
                {text}
            </Text>
        </View>
    );
}

const MemoMoney = React.memo(Money);
export default MemoMoney;
