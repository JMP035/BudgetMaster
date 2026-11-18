import React, { useState } from "react";
import { StyleSheet, Text, TextInput, View } from "react-native";
import { C } from "../theme";
import { parseSignedAmount } from "../services/TransferForm";
import type { SmsBalanceMismatch } from "../services/TransferForm";
import type { Account } from "../services/storage";
import { formatMoney } from "../services/format";
import { GlassButton } from "./GlassButton";
import { GlassSheet } from "./GlassSheet";
import { InlineNotice } from "./InlineNotice";

/**
 * «Ajustar al saldo real»: la persona escribe el saldo que ve hoy en su banco y la app lo toma como punto de partida
 * (ancla) desde este momento. Sirve para cuentas con saldo automático (y manual) cuando no cuadran con el banco.
 */
export function BalanceAdjustSheet({ account, mismatch, onSave, onClose }: {
    account: Account;
    /** Último saldo que trajo un SMS del banco, si difiere de lo que la app calcula. */
    mismatch?: SmsBalanceMismatch | null;
    onSave: (amount: number, atIso: string) => void;
    onClose: () => void;
}) {
    const [text, setText] = useState("");
    const [error, setError] = useState("");

    const handleSave = () => {
        const n = parseSignedAmount(text);
        if (isNaN(n)) { setError("Escribe el saldo que ves en tu banco."); return; }
        onSave(n, new Date().toISOString());
        onClose();
    };

    return (
        <GlassSheet
            onClose={onClose}
            title="Ajustar al saldo real"
            icon="analytics-outline"
            footer={
                <View style={st.footer}>
                    {!!error && <InlineNotice variant="error" text={error} />}
                    <GlassButton label="Ajustar saldo" icon="checkmark" onPress={handleSave} />
                </View>
            }
        >
            <Text style={st.sub}>{account.name}</Text>
            <Text style={st.hint}>
                Escribe el saldo que ves hoy en tu banco. Desde este momento la app lo toma como punto de partida y sigue sumando y restando tus movimientos.
            </Text>
            <Text style={st.hint}>La app calcula ahora: {formatMoney(account.balance, account.currency)}</Text>
            {!!mismatch && (
                <InlineNotice
                    variant="info"
                    text={`Según tu banco (SMS): ${formatMoney(mismatch.amount, account.currency)}. La app calculaba ${formatMoney(mismatch.expected, account.currency)} para ese momento.`}
                    actionLabel="Usar este saldo"
                    onAction={() => { onSave(mismatch.amount, mismatch.at); onClose(); }}
                    style={st.notice}
                />
            )}
            <Text style={st.lbl}>SALDO REAL EN TU BANCO</Text>
            <View style={st.amtRow}>
                <Text style={st.cur}>{account.currency}</Text>
                <TextInput
                    style={st.amtInput}
                    value={text}
                    onChangeText={v => { setText(v); setError(""); }}
                    placeholder="0.00"
                    placeholderTextColor={C.textMuted}
                    keyboardType="numbers-and-punctuation"
                    autoFocus
                    accessibilityLabel="Saldo real en tu banco"
                />
            </View>
            <View style={{ height: 8 }} />
        </GlassSheet>
    );
}

const st = StyleSheet.create({
    footer: { gap: 10, paddingTop: 12 },
    sub: { color: C.textPrimary, fontSize: 15, fontWeight: "700", marginBottom: 6 },
    hint: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 6 },
    notice: { marginTop: 10 },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },
    amtRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, paddingHorizontal: 14, paddingVertical: 10 },
    amtInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: "700" },
    cur: { color: C.textSub, fontSize: 16, fontWeight: "700", marginRight: 8 },
});

export default BalanceAdjustSheet;
