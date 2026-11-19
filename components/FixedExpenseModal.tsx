import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Account, CreditInstallment, CustomCategory, Currency, FixedExpense, parseAmount, StorageService } from "../services/storage";
import { merchantKey } from "../services/MerchantRules";
import { balanceModeOf } from "../services/Balances";
import { findInstallmentOverlap } from "../services/FixedExpenseMatcher";
import { formatMoney } from "../services/format";
import { getAllExpenseCategories } from "../categories";
import { C } from "../theme";
import { GlassButton } from "./GlassButton";
import { GlassSheet } from "./GlassSheet";
import { InlineNotice } from "./InlineNotice";

// Monedas ofrecidas en los formularios (se agrega la actual si es otra, p. ej. EUR)
const FORM_CURRENCIES: Currency[] = ["Q", "USD"];

export interface FixedExpenseModalProps {
    onSave: (e: FixedExpense) => void;
    onClose: () => void;
    existing?: FixedExpense;
    /** Valores iniciales cuando no hay `existing` (p. ej. al crear un gasto fijo desde un SMS). */
    prefill?: Partial<FixedExpense>;
    customCategories?: CustomCategory[];
    defaultCurrency: Currency;
    /** Muestra el campo «Nombre en el SMS». Apagado = oculto. */
    smsOn?: boolean;
    /** Cuentas para elegir de dónde sale el pago. Sin esto, el modal las carga solo. */
    accounts?: Account[];
    /** Visacuotas activas, para avisar si el gasto fijo ya está contado como cuota. Sin esto, el modal las carga solo. */
    installments?: CreditInstallment[];
}

// ─────────────────────────────────────────────────────────────
// MODAL — NUEVO GASTO FIJO
// ─────────────────────────────────────────────────────────────
export function FixedExpenseModal({ onSave, onClose, existing, prefill, customCategories, defaultCurrency, smsOn = false, accounts: accountsProp, installments: installmentsProp }: FixedExpenseModalProps) {
    const allCats = getAllExpenseCategories(customCategories);
    // `prefill` solo aplica a un gasto nuevo; al editar manda `existing`.
    const init = existing ?? prefill;
    const [name, setName] = useState(init?.name || "");
    const [amount, setAmount] = useState(init?.amount !== undefined ? init.amount.toString() : "");
    const [currency, setCurrency] = useState<Currency>(init?.currency || defaultCurrency || "Q");
    const [category, setCategory] = useState(init?.category || "other");
    const [day, setDay] = useState(init?.dayOfMonth !== undefined ? init.dayOfMonth.toString() : "1");
    const [autoRecord, setAutoRecord] = useState(init?.autoRecord ?? true);
    const [notes, setNotes] = useState(init?.notes || "");
    const [matchKey, setMatchKey] = useState(init?.smsMatchKey || "");
    const [accountId, setAccountId] = useState<string | null>(init?.accountId ?? null);
    const [loadedAccounts, setLoadedAccounts] = useState<Account[]>([]);
    const [loadedInsts, setLoadedInsts] = useState<CreditInstallment[]>([]);
    const [error, setError] = useState("");
    const accounts = accountsProp ?? loadedAccounts;
    const installments = installmentsProp ?? loadedInsts;
    useEffect(() => {
        if (accountsProp && installmentsProp) return;
        let alive = true;
        Promise.all([StorageService.getAccounts(), StorageService.getCreditInstallments()])
            .then(([a, i]) => { if (alive) { setLoadedAccounts(a); setLoadedInsts(i); } })
            .catch(() => { });
        return () => { alive = false; };
    }, [accountsProp, installmentsProp]);
    const accountChoices = accounts.filter(a => a.isActive || a.id === init?.accountId);
    const chosenAccount = accountId ? accounts.find(a => a.id === accountId) : undefined;
    const amountNum = parseAmount(amount);
    const overlap = chosenAccount && !isNaN(amountNum) && amountNum > 0
        ? findInstallmentOverlap({ amount: amountNum, currency, accountId: chosenAccount.id }, installments.filter(i => i.accountId === chosenAccount.id))
        : null;
    const accountHint = !chosenAccount ? ""
        : chosenAccount.type === "credit"
            ? "Al marcarlo pagado con AUTO, el cargo entra al «Ciclo abierto» de esta tarjeta."
            : balanceModeOf(chosenAccount) === "auto"
                ? "Esta cuenta lleva su saldo automático: el pago lo resta solo."
                : "Este gasto no cambia el saldo guardado de la cuenta: aquí la cuenta organiza tus pagos.";
    const currencyOptions = FORM_CURRENCIES.includes(currency) ? FORM_CURRENCIES : [...FORM_CURRENCIES, currency];
    const learned = !!existing?.smsMatchKey && matchKey === existing.smsMatchKey;

    const handleSave = () => {
        if (!name.trim()) { setError("Ingresa el nombre del gasto."); return; }
        const amt = parseAmount(amount);
        if (isNaN(amt) || amt <= 0) { setError("Ingresa un monto válido."); return; }
        const dayNum = parseInt(day);
        if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) { setError("Día inválido (1-31)."); return; }
        // «Nombre en el SMS»: se guarda normalizado igual que el aprendizaje por comercio
        let smsMatchKey = existing?.smsMatchKey ?? prefill?.smsMatchKey;
        if (smsOn) {
            if (matchKey.trim()) {
                const k = merchantKey(matchKey);
                if (!k) { setError("El nombre en el SMS es muy corto o genérico. Prueba con el nombre del comercio."); return; }
                smsMatchKey = k;
            } else {
                // Campo vacío: al editar se borra; en un gasto nuevo se conserva el del prefill (si lo hay)
                smsMatchKey = existing ? undefined : prefill?.smsMatchKey;
            }
        }

        const expense: FixedExpense = {
            id: existing?.id || `fe_${Date.now()}`,
            name: name.trim(),
            amount: amt,
            currency,
            category,
            dayOfMonth: dayNum,
            isPaid: existing?.isPaid || false,
            paidDate: existing?.paidDate,
            lastTxId: existing?.lastTxId,
            paidTxId: existing?.paidTxId,
            paidBy: existing?.paidBy,
            paidCycleKey: existing?.paidCycleKey,
            smsMatchKey,
            accountId: accountId ?? undefined,
            autoRecord,
            notes: notes.trim(),
            isActive: true,
        };
        onSave(expense);
        onClose();
    };

    return (
        <GlassSheet
            onClose={onClose}
            title={`${existing ? "Editar" : "Nuevo"} Gasto Fijo`}
            icon="calendar-outline"
            footer={
                <View style={md.footer}>
                    {!!error && <InlineNotice variant="error" text={error} style={md.notice} />}
                    <GlassButton label="Guardar Gasto Fijo" icon="save-outline" onPress={handleSave} />
                </View>
            }
        >
            <Text style={md.lbl}>NOMBRE</Text>
            <TextInput style={md.input} value={name} onChangeText={v => { setName(v); setError(""); }} placeholder="Ej: Renta, Internet, Gym..." placeholderTextColor={C.textMuted} autoFocus />

            <View style={md.row}>
                <View style={{ flex: 2, marginRight: 8 }}>
                    <Text style={md.lbl}>MONTO</Text>
                    <View style={md.amtRow}>
                        <Text style={md.cur}>{currency}</Text>
                        <TextInput style={md.amtInput} value={amount} onChangeText={v => { setAmount(v); setError(""); }} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
                    </View>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={md.lbl}>MONEDA</Text>
                    <View style={{ gap: 6 }}>
                        {currencyOptions.map(c => (
                            <TouchableOpacity key={c} style={[md.miniBtn, currency === c && md.miniBtnActive]} onPress={() => setCurrency(c)}>
                                <Text style={[md.miniTxt, currency === c && { color: C.primaryLight }]}>{c}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </View>

            <Text style={md.lbl}>DÍA DEL MES QUE VENCE</Text>
            <TextInput style={md.input} value={day} onChangeText={v => { setDay(v); setError(""); }} placeholder="1-31" placeholderTextColor={C.textMuted} keyboardType="numeric" />
            <Text style={md.hint}>El día del mes en que debes pagar este gasto. Ej: 1, 15, 30.</Text>

            <Text style={md.lbl}>CATEGORÍA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                    {allCats.map(cat => (
                        <TouchableOpacity key={cat.id} style={[md.catChip, category === cat.id && md.catChipActive]} onPress={() => setCategory(cat.id)}>
                            <Ionicons name={cat.icon} size={16} color={category === cat.id ? cat.color : C.textSub} />
                            <Text style={[md.catChipTxt, category === cat.id && { color: C.primaryLight }]}>{cat.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            <Text style={md.lbl}>CUENTA O TARJETA (Opcional)</Text>
            <View style={md.accWrap}>
                <TouchableOpacity
                    style={[md.accChip, accountId === null && md.accChipActive]}
                    onPress={() => setAccountId(null)}
                    accessibilityRole="button"
                    accessibilityLabel="Sin cuenta"
                    accessibilityState={{ selected: accountId === null }}
                >
                    <Text style={[md.accChipTxt, accountId === null && { color: C.textPrimary }]} numberOfLines={1}>Sin cuenta</Text>
                </TouchableOpacity>
                {accountChoices.map(a => (
                    <TouchableOpacity
                        key={a.id}
                        style={[md.accChip, accountId === a.id && md.accChipActive]}
                        onPress={() => setAccountId(a.id)}
                        accessibilityRole="button"
                        accessibilityLabel={a.name}
                        accessibilityState={{ selected: accountId === a.id }}
                    >
                        <View style={[md.accDot, { backgroundColor: a.color }]} />
                        <Ionicons name={a.type === "credit" ? "card-outline" : "wallet-outline"} size={14} color={accountId === a.id ? C.textPrimary : C.textSub} />
                        <Text style={[md.accChipTxt, accountId === a.id && { color: C.textPrimary }]} numberOfLines={1}>{a.name}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            {!!accountHint && <Text style={md.hint}>{accountHint}</Text>}
            {smsOn && !!chosenAccount && (
                <Text style={md.hint}>Si el SMS del banco viene de esta cuenta, la app lo reconoce con más seguridad.</Text>
            )}
            {!!overlap && chosenAccount && (
                <InlineNotice
                    variant="warning"
                    style={md.overlapNotice}
                    text={`Esta tarjeta ya carga la visacuota «${overlap.name}» de ${formatMoney(overlap.monthlyPayment, overlap.currency)} cada corte. Si este gasto fijo es esa cuota, no lo agregues: se contaría dos veces.`}
                />
            )}

            <View style={md.switchRow}>
                <View style={{ flex: 1 }}>
                    <Text style={md.lbl}>REGISTRAR AUTOMÁTICAMENTE</Text>
                    <Text style={md.hint}>Al marcarlo como pagado, se crea una transacción automáticamente.</Text>
                </View>
                <TouchableOpacity
                    style={[md.toggle, autoRecord && md.toggleActive]}
                    onPress={() => setAutoRecord(!autoRecord)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: autoRecord }}
                >
                    <Text style={{ color: autoRecord ? C.onPrimary : C.textSub, fontSize: 11, fontWeight: "800" }}>
                        {autoRecord ? "SÍ" : "NO"}
                    </Text>
                </TouchableOpacity>
            </View>

            {smsOn && (
                <View>
                    <View style={md.matchLblRow}>
                        <Text style={[md.lbl, { marginTop: 0, marginBottom: 0 }]}>NOMBRE EN EL SMS (Opcional)</Text>
                        {learned && (
                            <View style={md.learnedChip}>
                                <Ionicons name="sparkles-outline" size={11} color={C.accent} />
                                <Text style={md.learnedTxt}>Aprendido</Text>
                            </View>
                        )}
                    </View>
                    <View style={md.matchRow}>
                        <TextInput
                            style={[md.input, { flex: 1 }]}
                            value={matchKey}
                            onChangeText={v => { setMatchKey(v); setError(""); }}
                            placeholder="Ej: EEGSA, Tigo, Netflix..."
                            placeholderTextColor={C.textMuted}
                            autoCapitalize="none"
                        />
                        {!!matchKey && (
                            <TouchableOpacity
                                style={md.matchClear}
                                onPress={() => { setMatchKey(""); setError(""); }}
                                accessibilityRole="button"
                                accessibilityLabel="Borrar el nombre en el SMS"
                            >
                                <Ionicons name="trash-outline" size={18} color={C.danger} />
                            </TouchableOpacity>
                        )}
                    </View>
                    <Text style={md.hint}>Cómo aparece este pago en el mensaje del banco. Sirve para marcarlo como pagado solo.</Text>
                </View>
            )}

            <Text style={md.lbl}>NOTAS (Opcional)</Text>
            <TextInput style={md.input} value={notes} onChangeText={setNotes} placeholder="Ej: Tarjeta BAC cuota mínima..." placeholderTextColor={C.textMuted} />
            <View style={{ height: 16 }} />
        </GlassSheet>
    );
}

// ESTILOS (contenido del GlassSheet)
const md = StyleSheet.create({
    footer: { paddingTop: 12 },
    notice: { marginBottom: 10 },
    matchLblRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 16, marginBottom: 8 },
    matchRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    matchClear: { width: 46, height: 46, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: C.danger + "11", borderWidth: 1, borderColor: C.danger + "44" },
    learnedChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, backgroundColor: C.accent + "22", borderWidth: 1, borderColor: C.accent + "55" },
    learnedTxt: { color: C.accent, fontSize: 9, fontWeight: "900" },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },
    hint: { color: C.textSub, fontSize: 12, marginTop: 4, lineHeight: 17 },
    input: { backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, padding: 14, color: C.text, fontSize: 15 },
    row: { flexDirection: "row", alignItems: "flex-start" },
    amtRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, paddingHorizontal: 14, paddingVertical: 10 },
    amtInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: "700" },
    cur: { color: C.textSub, fontSize: 16, fontWeight: "700", marginRight: 8 },
    miniBtn: { paddingVertical: 10, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    miniBtnActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    miniTxt: { color: C.textSub, fontSize: 13, fontWeight: "800" },
    catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    catChipActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    catChipTxt: { color: C.textSub, fontSize: 11, fontWeight: "700" },
    accWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 4 },
    accChip: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%", paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    accChipActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    accChipTxt: { color: C.textSub, fontSize: 12, fontWeight: "700", flexShrink: 1 },
    accDot: { width: 10, height: 10, borderRadius: 5 },
    overlapNotice: { marginTop: 10 },
    switchRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
    toggle: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput, marginLeft: 12 },
    toggleActive: { backgroundColor: C.primary, borderColor: C.primaryLight },
});

export default FixedExpenseModal;
