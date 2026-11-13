import React from "react";
import { StyleSheet, Text } from "react-native";
import { formatNumber } from "../../services/format";
import { parseRate, validateRate } from "../../services/OnboardingPlan";
import { C } from "../../theme";
import { GlassCard } from "../GlassCard";
import { InlineNotice } from "../InlineNotice";
import { Chip, ChipRow, ps, RateInfo, StepHeader, StepProps, StyledInput } from "./OnbPrimitives";

type Mode = "auto" | "manual";

/** Dólares (solo si hay algo en USD): tipo de cambio automático (Banguat) o fijo. */
export default function StepUsd({ draft, onChange, rate }: StepProps & { rate: RateInfo }) {
    const usd = draft.usd ?? { mode: "auto" as Mode, rate: "" };
    const v = validateRate(usd.rate);
    const manualRate = parseRate(usd.rate);

    const setMode = (mode: Mode) => {
        // Al pasar a «Fijo» se sugiere el tipo de cambio de hoy para editarlo.
        const suggested = usd.rate.trim() ? usd.rate : formatNumber(rate.rate, 2);
        onChange({ usd: { mode, rate: mode === "manual" ? suggested : usd.rate } });
    };

    return (
        <>
            <StepHeader
                icon="logo-usd"
                iconColor={C.fx}
                title="Tus dólares"
                subtitle="Tus montos en dólares se muestran aparte y se convierten con este tipo de cambio cuando hace falta. El límite en dólares se calcula solo (modo automático)."
            />

            <GlassCard radius={16} blur={false} topAccentColor={C.fx} contentStyle={ps.cardContent}>
                <Text style={s.label}>TIPO DE CAMBIO ACTUAL</Text>
                <Text style={s.value}>{`Q ${formatNumber(rate.rate, 2)} por $ 1`}</Text>
                <Text style={s.source}>{`Fuente: ${rate.source}`}</Text>
            </GlassCard>
            {rate.offline && (
                <InlineNotice
                    variant="info"
                    style={ps.notice}
                    text="Sin conexión: mostramos el último tipo de cambio conocido. Se actualiza solo cuando vuelva la red."
                />
            )}

            <ChipRow style={{ marginTop: 16 }}>
                <Chip label="Automático (Banguat)" selected={usd.mode === "auto"} onPress={() => setMode("auto")} />
                <Chip label="Fijo" selected={usd.mode === "manual"} onPress={() => setMode("manual")} />
            </ChipRow>

            {usd.mode === "manual" && (
                <>
                    <Text style={ps.label}>Tipo de cambio fijo</Text>
                    <StyledInput
                        value={usd.rate}
                        onChangeText={r => onChange({ usd: { mode: "manual", rate: r } })}
                        placeholder="7.70"
                        keyboardType="decimal-pad"
                        prefix="Q"
                        suffix="por $ 1"
                        accessibilityLabel="Tipo de cambio fijo"
                    />
                    {!v.ok && usd.rate.trim().length > 0 && (
                        <InlineNotice variant="error" style={ps.notice} text={v.error ?? ""} />
                    )}
                    {v.ok && manualRate > 0 && (
                        <Text style={ps.hint}>{`Vamos a usar Q ${formatNumber(manualRate, 2)} hasta que lo cambies en Ajustes.`}</Text>
                    )}
                </>
            )}
        </>
    );
}

const s = StyleSheet.create({
    label: { color: C.textSub, fontSize: 10, fontWeight: "800", letterSpacing: 1, marginBottom: 6 },
    value: { color: C.text, fontSize: 22, fontWeight: "900" },
    source: { color: C.textSub, fontSize: 12, marginTop: 4, lineHeight: 17 },
});
