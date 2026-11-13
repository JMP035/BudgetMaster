import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { periodSentence, validateCycle } from "../../services/OnboardingPlan";
import type { PaymentCycle } from "../../services/storage";
import { C } from "../../theme";
import { GlassCard } from "../GlassCard";
import { GradientText } from "../GradientText";
import { InlineNotice } from "../InlineNotice";
import {
    Chip, ChipRow, OptionBtn, periodRanges, ps, StepHeader, StepProps, StyledInput,
} from "./OnbPrimitives";

const CYCLES: { value: PaymentCycle; label: string; desc: string; icon: "calendar-outline" | "git-branch-outline" | "refresh-outline" | "shuffle-outline" }[] = [
    { value: "monthly", label: "Mensual", desc: "Una vez al mes", icon: "calendar-outline" },
    { value: "biweekly", label: "Quincenal", desc: "Dos veces al mes", icon: "git-branch-outline" },
    { value: "weekly", label: "Semanal", desc: "Cada semana", icon: "refresh-outline" },
    { value: "irregular", label: "Irregular", desc: "Freelance o ingresos variables", icon: "shuffle-outline" },
];

const MONTHLY_CHIPS: { label: string; value: string }[] = [
    { label: "1", value: "1" },
    { label: "15", value: "15" },
    { label: "25", value: "25" },
    { label: "27", value: "27" },
    { label: "30", value: "30" },
    { label: "Último día", value: "31" },
];

const BIWEEKLY_CHIPS: [string, string][] = [["15", "30"], ["1", "15"], ["14", "29"]];

/** P3 · Ciclo de pago, con el recuadro en vivo «Así se va a medir tu dinero». */
export default function StepCycle({ draft, onChange }: StepProps) {
    const cycle = draft.paymentCycle;
    const valid = validateCycle(draft);

    const dayTyped = draft.paymentDay.trim().length > 0;
    const bothTyped = draft.payDay1.trim().length > 0 && draft.payDay2.trim().length > 0;
    const showError = !valid.ok && ((cycle === "monthly" && dayTyped) || (cycle === "biweekly" && bothTyped));

    const lateDay = cycle === "monthly"
        ? Number(draft.paymentDay) >= 29
        : cycle === "biweekly" && (Number(draft.payDay1) >= 29 || Number(draft.payDay2) >= 29);

    const ranges = valid.ok ? periodRanges(draft) : null;
    const sentence = ranges ? periodSentence(cycle, ranges.budget, ranges.fixed) : null;
    // El título trae la frase con el rango al final: el rango va aparte, con degradado bronce.
    const rangeText = ranges?.budget ?? "";
    const titleHead = sentence
        ? (sentence.title.endsWith(rangeText) ? sentence.title.slice(0, sentence.title.length - rangeText.length).trim() : sentence.title)
        : "";

    return (
        <>
            <StepHeader
                icon="calendar-outline"
                title="¿Cada cuándo te pagan?"
                subtitle="Con esto armo tus períodos de presupuesto y calculo cuántos días te quedan hasta tu próximo ingreso."
            />

            {CYCLES.map(cy => (
                <OptionBtn
                    key={cy.value}
                    label={cy.label}
                    desc={cy.desc}
                    icon={cy.icon}
                    selected={cycle === cy.value}
                    onPress={() => onChange({ paymentCycle: cy.value })}
                />
            ))}

            {cycle === "monthly" && (
                <>
                    <Text style={ps.label}>¿Qué día te pagan?</Text>
                    <StyledInput
                        value={draft.paymentDay}
                        onChangeText={paymentDay => onChange({ paymentDay })}
                        placeholder="27"
                        keyboardType="number-pad"
                        suffix="del mes"
                        accessibilityLabel="Día de pago"
                    />
                    <ChipRow>
                        {MONTHLY_CHIPS.map(ch => (
                            <Chip
                                key={ch.value}
                                label={ch.label}
                                selected={draft.paymentDay.trim() === ch.value}
                                onPress={() => onChange({ paymentDay: ch.value })}
                            />
                        ))}
                    </ChipRow>
                </>
            )}

            {cycle === "biweekly" && (
                <>
                    <View style={s.pair}>
                        <View style={s.pairCol}>
                            <Text style={ps.label}>Primer pago</Text>
                            <StyledInput
                                value={draft.payDay1}
                                onChangeText={payDay1 => onChange({ payDay1 })}
                                placeholder="15"
                                keyboardType="number-pad"
                                accessibilityLabel="Primer día de pago"
                            />
                        </View>
                        <View style={s.pairCol}>
                            <Text style={ps.label}>Segundo pago</Text>
                            <StyledInput
                                value={draft.payDay2}
                                onChangeText={payDay2 => onChange({ payDay2 })}
                                placeholder="30"
                                keyboardType="number-pad"
                                accessibilityLabel="Segundo día de pago"
                            />
                        </View>
                    </View>
                    <ChipRow>
                        {BIWEEKLY_CHIPS.map(([a, b]) => (
                            <Chip
                                key={`${a}-${b}`}
                                label={`${a} y ${b}`}
                                selected={draft.payDay1.trim() === a && draft.payDay2.trim() === b}
                                onPress={() => onChange({ payDay1: a, payDay2: b })}
                            />
                        ))}
                    </ChipRow>
                </>
            )}

            {showError && <InlineNotice variant="error" style={ps.notice} text={valid.error ?? ""} />}
            {valid.ok && lateDay && (
                <InlineNotice variant="info" style={ps.notice} text="En los meses más cortos se toma el último día del mes." />
            )}

            {sentence && (
                <GlassCard radius={16} blur={false} topAccentColor={C.primary} style={s.preview} contentStyle={s.previewContent}>
                    <Text style={s.previewLabel}>ASÍ SE VA A MEDIR TU DINERO</Text>
                    {!!titleHead && <Text style={s.previewHead}>{titleHead}</Text>}
                    <GradientText
                        fit
                        text={rangeText}
                        style={s.previewRange}
                        align="left"
                        minScale={0.7}
                    />
                    <Text style={s.previewBody}>{sentence.body}</Text>
                </GlassCard>
            )}
        </>
    );
}

const s = StyleSheet.create({
    pair: { flexDirection: "row", gap: 12 },
    pairCol: { flex: 1, minWidth: 0 },
    preview: { marginTop: 16 },
    previewContent: { padding: 16 },
    previewLabel: { color: C.textSub, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 8 },
    previewHead: { color: C.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
    previewRange: { fontSize: 24, fontWeight: "900" },
    previewBody: { color: C.textSub, fontSize: 13, lineHeight: 19, marginTop: 6 },
});
