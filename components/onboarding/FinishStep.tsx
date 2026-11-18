import React from "react";
import { StyleSheet, Text } from "react-native";
import { formatMoney } from "../../services/format";
import { parseAmount } from "../../services/storage";
import { C } from "../../theme";
import { GlassCard } from "../GlassCard";
import { periodRanges, ps, StepHeader, StepProps } from "./OnbPrimitives";

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`;

/** Resumen corto del setup en una línea: «Período: … · Ingreso … · Meta … · 2 cuentas · 3 gastos fijos». */
export function buildSummary(draft: StepProps["draft"]): string {
    const income = parseAmount(draft.income);
    const savings = parseAmount(draft.savings);
    const parts: string[] = [];
    const ranges = periodRanges(draft);
    parts.push(`Período: ${ranges.budget}`);
    if (Number.isFinite(income) && income > 0) {
        parts.push(`Ingreso ${formatMoney(income, draft.incomeCurrency, { decimals: 0 })}`);
    }
    if (Number.isFinite(savings) && savings > 0) {
        parts.push(`Meta ${formatMoney(savings, draft.incomeCurrency, { decimals: 0 })}`);
    }
    if (draft.accounts.length > 0) parts.push(plural(draft.accounts.length, "cuenta", "cuentas"));
    if (draft.fixed.length > 0) parts.push(plural(draft.fixed.length, "gasto fijo", "gastos fijos"));
    if (draft.debts.length > 0) parts.push(plural(draft.debts.length, "deuda", "deudas"));
    return parts.join(" · ");
}

/** Cierre «¿Quieres un recorrido guiado?». Los botones viven en el pie de OnboardingScreen. */
export default function FinishStep({ draft }: Pick<StepProps, "draft">) {
    return (
        <>
            <StepHeader
                icon="compass-outline"
                title="¿Quieres un recorrido guiado?"
                subtitle={'Te muestro en 1 minuto dónde está cada cosa. Si tienes dudas después, lo encuentras en Inicio → Guía y primeros pasos, o en el "?" de cada módulo.'}
            />
            <GlassCard radius={16} blur={false} topAccentColor={C.primary} contentStyle={ps.cardContent}>
                <Text style={s.label}>TU CONFIGURACIÓN</Text>
                <Text style={s.summary}>{buildSummary(draft)}</Text>
            </GlassCard>
        </>
    );
}

const s = StyleSheet.create({
    label: { color: C.textSub, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 6 },
    summary: { color: C.text, fontSize: 14, lineHeight: 21, fontWeight: "600" },
});
