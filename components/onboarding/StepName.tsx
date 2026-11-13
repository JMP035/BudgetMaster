import React from "react";
import { Text } from "react-native";
import { validateName } from "../../services/OnboardingPlan";
import { InlineNotice } from "../InlineNotice";
import { ps, StepHeader, StepProps, StyledInput } from "./OnbPrimitives";

/** P1 · Nombre. */
export default function StepName({ draft, onChange }: StepProps) {
    const v = validateName(draft.name);
    return (
        <>
            <StepHeader
                icon="person-outline"
                title="¡Bienvenido a BudgetMaster!"
                subtitle="Soy tu CFO personal. Con 4 datos rápidos armo tu presupuesto; lo demás lo podés configurar cuando quieras. Todo queda guardado solo en tu teléfono."
            />
            <Text style={ps.label}>¿Cómo te llamás?</Text>
            <StyledInput
                value={draft.name}
                onChangeText={name => onChange({ name })}
                placeholder="Tu nombre..."
                autoCapitalize="words"
                autoFocus
            />
            {!v.ok && draft.name.trim().length > 0 && (
                <InlineNotice variant="error" style={ps.notice} text={v.error ?? ""} />
            )}
        </>
    );
}
