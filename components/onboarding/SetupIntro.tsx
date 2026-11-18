import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import type { OptionalStepId } from "../../services/OnboardingPlan";
import { C } from "../../theme";
import { GlassCard } from "../GlassCard";
import { ps, StepHeader } from "./OnbPrimitives";

export const OPTIONAL_STEP_INFO: Record<OptionalStepId, { label: string; icon: keyof typeof Ionicons.glyphMap }> = {
    accounts: { label: "Cuentas y tarjetas", icon: "wallet-outline" },
    income: { label: "SMS de tu pago", icon: "cash-outline" },
    fixed: { label: "Gastos fijos", icon: "repeat-outline" },
    debts: { label: "Deudas", icon: "alert-circle-outline" },
    usd: { label: "Dólares", icon: "logo-usd" },
    sms: { label: "SMS", icon: "chatbubble-ellipses-outline" },
    security: { label: "Huella o rostro", icon: "finger-print-outline" },
    gemini: { label: "Asesor IA", icon: "sparkles-outline" },
};

/** Pantalla intermedia «Configura tu dinero». Los botones viven en el pie de OnboardingScreen. */
export default function SetupIntro({ steps }: { steps: OptionalStepId[] }) {
    return (
        <>
            <StepHeader
                icon="construct-outline"
                title="Configura tu dinero"
                subtitle={'Son opcionales y cada uno se puede saltar. Lo que no hagas ahora te queda en Inicio, en "Guía y primeros pasos".'}
            />
            <GlassCard radius={16} blur={false} topAccentColor={C.primary} contentStyle={ps.cardContent}>
                <Text style={s.cardLabel}>INCLUYE</Text>
                {steps.map(id => (
                    <View key={id} style={s.row}>
                        <Ionicons name={OPTIONAL_STEP_INFO[id].icon} size={18} color={C.primaryLight} />
                        <Text style={s.rowTxt}>{OPTIONAL_STEP_INFO[id].label}</Text>
                    </View>
                ))}
            </GlassCard>
        </>
    );
}

const s = StyleSheet.create({
    cardLabel: { color: C.textSub, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 6 },
    row: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8 },
    rowTxt: { color: C.text, fontSize: 15, fontWeight: "700", flexShrink: 1 },
});
