import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { parseAmount } from "../services/storage";
import { balanceModeOf } from "../services/Balances";
import type { Account } from "../services/storage";
import type { CardStatement } from "../services/CardStatement";
import { formatShortDay } from "../services/BudgetBreakdown";
import { formatMoney } from "../services/format";
import { GlassBackground } from "./GlassCard";
import { GlassButton } from "./GlassButton";
import { GlassSheet } from "./GlassSheet";
import { InlineNotice } from "./InlineNotice";

type Cur = "Q" | "USD";
const CURS: Cur[] = ["Q", "USD"];

/** Texto editable de un monto (sin separador de miles; 2 decimales). */
function inputText(n: number): string {
    return n > 0 ? String(Math.round(n * 100) / 100) : "";
}

// ─────────────────────────────────────────────────────────────
// HOJA — INGRESAR EL MONTO REAL DEL ESTADO DE CUENTA
// ─────────────────────────────────────────────────────────────
export function StatementAmountSheet({ card, statement, onSave, onClose }: {
    card: Account;
    statement: CardStatement;
    onSave: (amounts: { Q?: number; USD?: number }) => void;
    onClose: () => void;
}) {
    const [q, setQ] = useState(statement.real?.Q !== undefined ? String(statement.real.Q) : "");
    const [usd, setUsd] = useState(statement.real?.USD !== undefined ? String(statement.real.USD) : "");
    const [error, setError] = useState("");

    const handleSave = () => {
        const out: { Q?: number; USD?: number } = {};
        for (const [cur, text] of [["Q", q], ["USD", usd]] as Array<[Cur, string]>) {
            if (!text.trim()) continue;
            const n = parseAmount(text);
            if (isNaN(n) || n < 0) { setError(`Revisá el monto en ${cur}.`); return; }
            out[cur] = n;
        }
        onSave(out);
        onClose();
    };

    return (
        <GlassSheet
            onClose={onClose}
            title="Monto real del estado"
            icon="document-text-outline"
            footer={
                <View style={st.footer}>
                    {!!error && <InlineNotice variant="error" text={error} />}
                    <GlassButton label="Guardar" icon="save-outline" onPress={handleSave} />
                </View>
            }
        >
            <Text style={st.sub}>{card.name} · estado al {formatShortDay(statement.cut)}</Text>
            <Text style={st.hint}>
                Escribí lo que dice tu estado de cuenta (el banco lo manda por correo, no por SMS). Cada moneda se paga por separado. Si dejás un campo vacío, la app usa su estimado: los cargos de esa tarjeta en ese ciclo.
            </Text>
            {CURS.map(cur => (
                <View key={cur}>
                    <Text style={st.lbl}>{cur === "Q" ? "SALDO EN QUETZALES" : "SALDO EN DÓLARES"}</Text>
                    <View style={st.amtRow}>
                        <Text style={st.cur}>{cur === "Q" ? "Q" : "$"}</Text>
                        <TextInput
                            style={st.amtInput}
                            value={cur === "Q" ? q : usd}
                            onChangeText={v => { if (cur === "Q") setQ(v); else setUsd(v); setError(""); }}
                            placeholder="0.00"
                            placeholderTextColor={C.textMuted}
                            keyboardType="decimal-pad"
                            accessibilityLabel={`Monto real en ${cur}`}
                        />
                    </View>
                    <Text style={st.hint}>Estimado: {formatMoney(statement.estimated[cur], cur)}</Text>
                </View>
            ))}
            <View style={{ height: 8 }} />
        </GlassSheet>
    );
}

// ─────────────────────────────────────────────────────────────
// HOJA — REGISTRAR EL PAGO DE LA TARJETA
// ─────────────────────────────────────────────────────────────
export function CardPaymentSheet({ card, statement, fromChoices, initialFromId, onSave, onClose }: {
    card: Account;
    statement: CardStatement;
    /** Cuentas de las que puede salir el pago (no tarjetas). */
    fromChoices: Account[];
    /** Cuenta de origen ya elegida (por ejemplo, desde «Transferir»); si no, la «cuenta con la que pagas» de la tarjeta. */
    initialFromId?: string;
    onSave: (p: { amounts: { Q?: number; USD?: number }; fromAccountId?: string; date: Date }) => void;
    onClose: () => void;
}) {
    const [q, setQ] = useState(inputText(statement.remaining.Q));
    const [usd, setUsd] = useState(inputText(statement.remaining.USD));
    const [fromId, setFromId] = useState<string | null>(
        initialFromId && fromChoices.some(a => a.id === initialFromId) ? initialFromId
            : card.payFromAccountId && fromChoices.some(a => a.id === card.payFromAccountId) ? card.payFromAccountId : null,
    );
    const [date, setDate] = useState(() => {
        const n = new Date();
        return new Date(n.getFullYear(), n.getMonth(), n.getDate(), 12, 0, 0, 0);
    });
    const [showPicker, setShowPicker] = useState(false);
    const [error, setError] = useState("");
    const maxDate = new Date();
    maxDate.setHours(23, 59, 59, 999);
    const dateLabel = date.toLocaleDateString("es-GT", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });
    const toNoon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);

    const handleSave = () => {
        const amounts: { Q?: number; USD?: number } = {};
        for (const [cur, text] of [["Q", q], ["USD", usd]] as Array<[Cur, string]>) {
            if (!text.trim()) continue;
            const n = parseAmount(text);
            if (isNaN(n) || n < 0) { setError(`Revisá el monto en ${cur}.`); return; }
            if (n > 0) amounts[cur] = n;
        }
        if (amounts.Q === undefined && amounts.USD === undefined) { setError("Ingresá cuánto pagaste."); return; }
        onSave({ amounts, ...(fromId ? { fromAccountId: fromId } : {}), date });
        onClose();
    };

    // El aviso dice lo que de verdad pasa con la cuenta elegida según cómo lleva su saldo.
    const fromAcc = fromChoices.find(a => a.id === fromId);
    const fromMode = fromAcc ? balanceModeOf(fromAcc) : null;
    const fromHint = !fromAcc
        ? "Sin cuenta de origen, el pago solo queda registrado en la tarjeta y no baja el saldo de ninguna cuenta. Nunca es un gasto nuevo."
        : fromMode === "none"
            ? `${fromAcc.name} no lleva saldo, así que su saldo no cambia. El pago queda registrado como transferencia a la tarjeta: no es un gasto nuevo.`
            : fromMode === "auto"
                ? `El pago baja el saldo de ${fromAcc.name} (se calcula solo con tus movimientos) y queda registrado como transferencia a la tarjeta: no es un gasto nuevo.`
                : `El pago baja el saldo guardado de ${fromAcc.name} y queda registrado como transferencia a la tarjeta: no es un gasto nuevo.`;

    return (
        <GlassSheet
            onClose={onClose}
            title="Registrar pago"
            icon="card-outline"
            footer={
                <View style={st.footer}>
                    {!!error && <InlineNotice variant="error" text={error} />}
                    <GlassButton label="Registrar pago" icon="checkmark" onPress={handleSave} />
                </View>
            }
        >
            <Text style={st.sub}>{card.name} · estado al {formatShortDay(statement.cut)}</Text>
            <Text style={st.hint}>
                Pagar la tarjeta no es un gasto nuevo: es una transferencia de tu cuenta a la tarjeta, así que no suma a tus gastos del período. Podés pagar solo una parte; lo que falte sigue pendiente.
            </Text>
            {CURS.map(cur => (
                <View key={cur}>
                    <Text style={st.lbl}>{cur === "Q" ? "PAGO EN QUETZALES" : "PAGO EN DÓLARES"}</Text>
                    <View style={st.amtRow}>
                        <Text style={st.cur}>{cur === "Q" ? "Q" : "$"}</Text>
                        <TextInput
                            style={st.amtInput}
                            value={cur === "Q" ? q : usd}
                            onChangeText={v => { if (cur === "Q") setQ(v); else setUsd(v); setError(""); }}
                            placeholder="0.00"
                            placeholderTextColor={C.textMuted}
                            keyboardType="decimal-pad"
                            accessibilityLabel={`Pago en ${cur}`}
                        />
                    </View>
                    <Text style={st.hint}>Falta: {formatMoney(statement.remaining[cur], cur)}</Text>
                </View>
            ))}

            <Text style={st.lbl}>FECHA DEL PAGO</Text>
            <TouchableOpacity
                style={st.dateField}
                onPress={() => setShowPicker(v => !v)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Fecha del pago: ${dateLabel}. Toca para cambiarla`}
            >
                <GlassBackground radius={12} blur={false} />
                <Ionicons name="calendar-outline" size={18} color={C.primaryLight} style={{ marginRight: 10 }} />
                <Text style={[st.dateTxt, { textTransform: "capitalize" }]}>{dateLabel}</Text>
                <Ionicons name="chevron-down" size={16} color={C.textSub} />
            </TouchableOpacity>
            {showPicker && Platform.OS === "android" && (
                <DateTimePicker
                    value={date}
                    mode="date"
                    display="default"
                    maximumDate={maxDate}
                    onChange={(event, selected) => {
                        setShowPicker(false);
                        if (event.type === "set" && selected) setDate(toNoon(selected));
                    }}
                />
            )}
            {showPicker && Platform.OS === "ios" && (
                <View style={st.iosPickerWrap}>
                    <DateTimePicker
                        value={date}
                        mode="date"
                        display="inline"
                        themeVariant="dark"
                        maximumDate={maxDate}
                        accentColor={C.primary}
                        onChange={(_e, selected) => { if (selected) setDate(toNoon(selected)); }}
                    />
                    <TouchableOpacity style={st.iosPickerDone} onPress={() => setShowPicker(false)}>
                        <Text style={st.iosPickerDoneTxt}>Listo</Text>
                    </TouchableOpacity>
                </View>
            )}

            <Text style={st.lbl}>CUENTA DE ORIGEN</Text>
            <View style={st.chipWrap}>
                <TouchableOpacity
                    style={[st.chip, fromId === null && st.chipActive]}
                    onPress={() => setFromId(null)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: fromId === null }}
                >
                    <Text style={[st.chipTxt, fromId === null && { color: C.textPrimary }]} numberOfLines={1}>Sin cuenta</Text>
                </TouchableOpacity>
                {fromChoices.map(a => (
                    <TouchableOpacity
                        key={a.id}
                        style={[st.chip, fromId === a.id && st.chipActive]}
                        onPress={() => setFromId(a.id)}
                        accessibilityRole="button"
                        accessibilityLabel={a.name}
                        accessibilityState={{ selected: fromId === a.id }}
                    >
                        <View style={[st.dot, { backgroundColor: a.color }]} />
                        <Text style={[st.chipTxt, fromId === a.id && { color: C.textPrimary }]} numberOfLines={1}>{a.name}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <Text style={st.hint}>{fromHint}</Text>
            <View style={{ height: 8 }} />
        </GlassSheet>
    );
}

const st = StyleSheet.create({
    footer: { gap: 10, paddingTop: 12 },
    sub: { color: C.textPrimary, fontSize: 15, fontWeight: "700", marginBottom: 6 },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },
    hint: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 6 },
    amtRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, paddingHorizontal: 14, paddingVertical: 10 },
    amtInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: "700" },
    cur: { color: C.textSub, fontSize: 16, fontWeight: "700", marginRight: 8 },
    dateField: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, overflow: "hidden" },
    dateTxt: { flex: 1, color: C.text, fontSize: 15, fontWeight: "700" },
    iosPickerWrap: { marginTop: 8 },
    iosPickerDone: { alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 8 },
    iosPickerDoneTxt: { color: C.primaryLight, fontWeight: "800" },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    chipActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    chipTxt: { color: C.textSub, fontSize: 12, fontWeight: "700", flexShrink: 1 },
    dot: { width: 10, height: 10, borderRadius: 5 },
});
