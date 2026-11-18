import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { parseAmount } from "../services/storage";
import type { IncomePattern } from "../services/storage";
import type { IncomePatternPreview as PatternPreview } from "../services/IncomeSources";
import { applyPatternCorrection, patternSummary } from "../services/IncomeSourceView";
import { C } from "../theme";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { InlineNotice } from "./InlineNotice";

interface Props {
    /** Lo que la app entendió del SMS de ejemplo. */
    pattern: IncomePattern;
    preview: PatternPreview;
    /** El usuario confirma («Sí, es así») con el patrón tal cual o ya corregido. */
    onConfirm: (pattern: IncomePattern) => void;
    /** Opcional: descartar el ejemplo y elegir otro. */
    onDiscard?: () => void;
    busy?: boolean;
}

/**
 * Tarjeta de confirmación del patrón aprendido de un SMS de ejemplo: «Entendimos: BANRURAL · cuenta ***5051 ·
 * de «…» · ≈Q 7,426.61 (±1.5%)» con «Sí, es así» / «Corregir» (origen y monto editables). La reutiliza el
 * formulario de la fuente de ingreso y, más adelante, el onboarding.
 */
export function IncomePatternPreview({ pattern, preview, onConfirm, onDiscard, busy }: Props) {
    const [editing, setEditing] = useState(false);
    const [origin, setOrigin] = useState(pattern.originLabel ?? "");
    const [amount, setAmount] = useState(pattern.amount > 0 ? String(pattern.amount) : "");
    const [error, setError] = useState<string | null>(null);

    const confirmEdited = () => {
        const n = parseAmount(amount);
        if (isNaN(n) || n <= 0) { setError("Escribí un monto válido (mayor a 0)."); return; }
        setError(null);
        onConfirm(applyPatternCorrection(pattern, { originText: origin, amount: n }));
    };

    return (
        <GlassCard radius={16} blur={false} leftAccentColor={C.primaryLight} contentStyle={s.card}>
            <View style={s.titleRow}>
                <Ionicons name="sparkles-outline" size={16} color={C.primaryLight} />
                <Text style={s.title}>Entendimos</Text>
            </View>
            <Text style={s.summary}>{patternSummary(pattern, preview.currency)}</Text>
            <Text style={s.hint}>
                Así vamos a reconocer tu pago: del mismo banco y cuenta, de quien lo envía y por un monto parecido (los centavos pueden variar).
            </Text>

            {editing ? (
                <View style={s.editBox}>
                    <Text style={s.lbl}>QUIÉN ENVÍA EL DINERO</Text>
                    <TextInput
                        style={s.input}
                        value={origin}
                        onChangeText={v => { setOrigin(v); setError(null); }}
                        placeholder="Ej: SECCION DE OPERACIONES DE DEPOSITOS"
                        placeholderTextColor={C.textMuted}
                        autoCapitalize="characters"
                    />
                    <Text style={s.lbl}>MONTO APROXIMADO</Text>
                    <View style={s.amtRow}>
                        <Text style={s.cur}>{preview.currency}</Text>
                        <TextInput
                            style={s.amtInput}
                            value={amount}
                            onChangeText={v => { setAmount(v); setError(null); }}
                            placeholder="0.00"
                            placeholderTextColor={C.textMuted}
                            keyboardType="decimal-pad"
                        />
                    </View>
                    {!!error && <InlineNotice variant="error" text={error} style={s.notice} />}
                    <View style={s.actions}>
                        <GlassButton kind="primary" icon="checkmark-circle-outline" label="Guardar corrección" loading={busy} onPress={confirmEdited} />
                        <GlassButton kind="ghost" label="Cancelar" onPress={() => { setEditing(false); setError(null); }} />
                    </View>
                </View>
            ) : (
                <View style={s.actions}>
                    <GlassButton kind="primary" icon="checkmark-circle-outline" label="Sí, es así" loading={busy} onPress={() => onConfirm(pattern)} />
                    <GlassButton kind="secondary" icon="create-outline" label="Corregir" disabled={busy} onPress={() => setEditing(true)} />
                    {!!onDiscard && <GlassButton kind="ghost" label="Usar otro SMS" disabled={busy} onPress={onDiscard} />}
                </View>
            )}
        </GlassCard>
    );
}

export default IncomePatternPreview;

const s = StyleSheet.create({
    card: { padding: 14 },
    titleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    title: { color: C.primaryLight, fontSize: 12, fontWeight: "800", letterSpacing: 1 },
    summary: { color: C.textPrimary, fontSize: 15, fontWeight: "800", lineHeight: 21 },
    hint: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 6 },
    actions: { gap: 8, marginTop: 12 },
    editBox: { marginTop: 4 },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 12 },
    input: { backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, padding: 12, color: C.text, fontSize: 14 },
    amtRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, paddingHorizontal: 14, paddingVertical: 8 },
    amtInput: { flex: 1, color: C.text, fontSize: 16, fontWeight: "700" },
    cur: { color: C.textSub, fontSize: 15, fontWeight: "700", marginRight: 8 },
    notice: { marginTop: 10 },
});
