import React, { useState } from "react";
import { Text } from "react-native";
import { formatMoney, formatNumber } from "../../services/format";
import { validateIncome } from "../../services/OnboardingPlan";
import { parseAmount } from "../../services/storage";
import { C } from "../../theme";
import { GlassSegmented } from "../GlassSegmented";
import { InlineNotice } from "../InlineNotice";
import { ps, RateInfo, StepHeader, StepProps, StyledInput, ToggleRow } from "./OnbPrimitives";

type IncomeCurrency = "Q" | "USD";

/** P2 · Ingreso mensual y moneda en que te pagan. */
export default function StepIncome({ draft, onChange, rate }: StepProps & { rate: RateInfo }) {
    const [touched, setTouched] = useState(false);
    const isUsd = draft.incomeCurrency === "USD";
    const v = validateIncome(draft.income, parseAmount);
    const showError = !v.ok && (touched || draft.income.trim().length > 0);

    const amount = parseAmount(draft.income);
    const approx = isUsd && Number.isFinite(amount) && amount > 0 ? Math.round(amount * rate.rate) : 0;

    return (
        <>
            <StepHeader
                icon="cash-outline"
                iconColor={C.income}
                title="¿Cuánto ganás al mes?"
                subtitle="Esta es la base de todo análisis. Un aproximado es suficiente."
            />

            <Text style={ps.label}>Me pagan en</Text>
            <GlassSegmented<IncomeCurrency>
                style={{ marginTop: 8 }}
                value={draft.incomeCurrency}
                onChange={incomeCurrency => onChange({ incomeCurrency })}
                options={[
                    { value: "Q", label: "Quetzales (Q)" },
                    { value: "USD", label: "Dólares ($)" },
                ]}
            />

            <StyledInput
                value={draft.income}
                onChangeText={income => { setTouched(true); onChange({ income }); }}
                placeholder="0.00"
                keyboardType="decimal-pad"
                prefix={isUsd ? "$" : "Q"}
                accessibilityLabel="Ingreso mensual"
                autoFocus
            />

            {showError && <InlineNotice variant="error" style={ps.notice} text={v.error ?? ""} />}

            {isUsd && approx > 0 && (
                <Text style={ps.hint}>
                    {`≈ ${formatMoney(approx, "Q", { decimals: 0 })} al tipo de cambio de hoy (${formatNumber(rate.rate, 2)})`}
                </Text>
            )}
            {isUsd && rate.offline && (
                <InlineNotice
                    variant="info"
                    style={ps.notice}
                    text={`Sin conexión: usamos el último tipo de cambio conocido (${formatNumber(rate.rate, 2)}). Después lo podés ajustar.`}
                />
            )}

            <ToggleRow
                label="También recibo o gasto en dólares"
                value={draft.usesUsd || isUsd}
                disabled={isUsd}
                onValueChange={usesUsd => onChange({ usesUsd })}
            />
        </>
    );
}
