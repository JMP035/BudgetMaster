import React from "react";
import { Text } from "react-native";
import { formatMoney } from "../../services/format";
import { validateSavings } from "../../services/OnboardingPlan";
import { parseAmount } from "../../services/storage";
import { C } from "../../theme";
import { InlineNotice } from "../InlineNotice";
import { Chip, ChipRow, ps, StepHeader, StepProps, StyledInput } from "./OnbPrimitives";

/** P4 · Meta de ahorro mensual (en la misma moneda en que cobra). */
export default function StepSavings({ draft, onChange }: StepProps) {
    const currency = draft.incomeCurrency;
    const income = parseAmount(draft.income);
    const incomeNum = Number.isFinite(income) ? income : 0;
    const v = validateSavings(draft.savings, incomeNum, parseAmount);

    const twenty = Math.round(incomeNum * 0.2 * 100) / 100;
    const noneYet = draft.savings.trim() === "0";
    const usingTwenty = twenty > 0 && draft.savings.trim() !== "" && parseAmount(draft.savings) === twenty;

    return (
        <>
            <StepHeader
                icon="trending-up-outline"
                iconColor={C.accent}
                title="¿Cuánto querés ahorrar al mes?"
                subtitle="Lo recomendado es al menos el 20 % de tu ingreso."
            />

            <ChipRow style={{ marginTop: 0 }}>
                {twenty > 0 && (
                    <Chip
                        label={`Usar 20 % (${formatMoney(twenty, currency, { decimals: 0 })})`}
                        selected={usingTwenty}
                        onPress={() => onChange({ savings: String(twenty) })}
                    />
                )}
                <Chip label="Todavía no" selected={noneYet} onPress={() => onChange({ savings: "0" })} />
            </ChipRow>

            <Text style={ps.label}>Meta mensual</Text>
            <StyledInput
                value={draft.savings}
                onChangeText={savings => onChange({ savings })}
                placeholder="0.00"
                keyboardType="decimal-pad"
                prefix={currency === "USD" ? "$" : "Q"}
                accessibilityLabel="Meta de ahorro mensual"
                autoFocus
            />

            {!v.ok && <InlineNotice variant="error" style={ps.notice} text={v.error ?? ""} />}
            {v.ok && !!v.warning && <InlineNotice variant="warning" style={ps.notice} text={v.warning} />}
        </>
    );
}
