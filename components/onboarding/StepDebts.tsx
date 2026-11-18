import { Ionicons } from "@expo/vector-icons";
import React, { useContext, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { debtLevelOf } from "../../services/DebtLoad";
import { DebtKind, DraftCurrency, DraftDebt, newDraftId } from "../../services/OnboardingPlan";
import { parseAmount } from "../../services/storage";
import { C } from "../../theme";
import { GlassButton, GlassButtonGroup } from "../GlassButton";
import { GlassCard } from "../GlassCard";
import { GlassSegmented } from "../GlassSegmented";
import { InlineNotice } from "../InlineNotice";
import Money from "../Money";
import { Chip, ChipRow, FieldContext, ps, RateInfo, StepHeader, StepProps, StyledInput } from "./OnbPrimitives";

const DEBT_TYPES: { type: DebtKind; icon: keyof typeof Ionicons.glyphMap; label: string; long: string }[] = [
    { type: "credit", icon: "card-outline", label: "Tarjeta", long: "Tarjeta de crédito" },
    { type: "loan", icon: "cash-outline", label: "Préstamo", long: "Préstamo bancario" },
    { type: "installment", icon: "receipt-outline", label: "Visacuota", long: "Visacuota / Cuotas" },
    { type: "other", icon: "help-circle-outline", label: "Otra", long: "Otra deuda" },
];

const num = (s: string): number => {
    const n = parseAmount(s || "0");
    return Number.isFinite(n) ? n : 0;
};

/** Deudas y préstamos (opcional). Conserva el formulario del onboarding anterior, ahora en línea. */
export default function StepDebts({ draft, onChange, rate, onFormOpenChange }: StepProps & {
    rate: RateInfo;
    onFormOpenChange: (open: boolean) => void;
}) {
    const ctx = useContext(FieldContext);
    const formRef = useRef<View>(null);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [type, setType] = useState<DebtKind>("credit");
    const [currency, setCurrency] = useState<DraftCurrency>("Q");
    const [monthly, setMonthly] = useState("");
    const [total, setTotal] = useState("");
    const [cardId, setCardId] = useState<string | undefined>(undefined);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { onFormOpenChange(open); }, [open, onFormOpenChange]);
    useEffect(() => () => onFormOpenChange(false), [onFormOpenChange]);

    const cards = draft.accounts.filter(a => a.kind === "credit");
    const askCard = (type === "credit" || type === "installment") && cards.length > 0;

    const openForm = () => {
        setName(""); setType("credit"); setCurrency(draft.incomeCurrency); setMonthly(""); setTotal("");
        setCardId(undefined); setError(null);
        setOpen(true);
        setTimeout(() => ctx.reveal(formRef.current), 80);
    };
    const closeForm = () => { setOpen(false); setError(null); };

    const add = () => {
        if (!name.trim()) { setError("Escribí el nombre de la deuda."); return; }
        if (num(monthly) <= 0) { setError("Ingresá una cuota mensual mayor a 0."); return; }
        if (total.trim() && (!Number.isFinite(parseAmount(total)) || parseAmount(total) < 0)) {
            setError("Ingresá un total válido."); return;
        }
        const debt: DraftDebt = {
            id: newDraftId("debt"),
            name: name.trim(),
            type,
            monthlyPayment: monthly.trim(),
            totalAmount: total.trim() || "0",
            currency,
        };
        if (askCard && cardId && cards.some(c => c.id === cardId)) debt.accountId = cardId;
        onChange({ debts: [...draft.debts, debt] });
        closeForm();
    };

    const remove = (id: string) => onChange(d => ({ debts: d.debts.filter(x => x.id !== id) }));

    // Total mensual en Q (las deudas en dólares se convierten) y su peso sobre el ingreso.
    const totalQ = draft.debts.reduce((sum, d) => sum + (d.currency === "USD" ? num(d.monthlyPayment) * rate.rate : num(d.monthlyPayment)), 0);
    const incomeQ = draft.incomeCurrency === "USD" ? num(draft.income) * rate.rate : num(draft.income);
    // Mismos umbrales que Estadísticas y el Asesor: 20 % moderado, 40 % alto (ver services/DebtLoad.ts).
    const debtLevel = incomeQ > 0 ? debtLevelOf((totalQ / incomeQ) * 100) : "none";

    return (
        <>
            <StepHeader
                icon="alert-circle-outline"
                iconColor={C.danger}
                title="¿Tenés deudas activas?"
                subtitle="Registrá cada deuda por separado: tarjetas de crédito, préstamos, visacuotas. Así puedo ayudarte a eliminarlas con un plan."
            />

            {draft.debts.length === 0 && !open && (
                <GlassCard radius={14} blur={false} leftAccentColor={C.income}>
                    <View style={ps.emptyBox}>
                        <Ionicons name="checkmark-circle-outline" size={24} color={C.income} />
                        <Text style={[ps.emptyTxt, { color: C.income, fontWeight: "700" }]}>Sin deudas registradas</Text>
                    </View>
                </GlassCard>
            )}

            {draft.debts.map(d => {
                const info = DEBT_TYPES.find(t => t.type === d.type) ?? DEBT_TYPES[3];
                const card = d.accountId ? draft.accounts.find(a => a.id === d.accountId) : undefined;
                return (
                    <GlassCard key={d.id} radius={14} blur={false} leftAccentColor={C.danger} style={s.item} contentStyle={s.itemContent}>
                        <Ionicons name={info.icon} size={20} color={C.danger} />
                        <View style={s.itemMain}>
                            <Text style={ps.itemName} numberOfLines={2}>{d.name}</Text>
                            <Text style={ps.itemSub} numberOfLines={2}>{card ? `${info.long} · ${card.name}` : info.long}</Text>
                        </View>
                        <Money
                            amount={num(d.monthlyPayment)}
                            currency={d.currency}
                            size="sm"
                            tone="expense"
                            sign="never"
                            gradient={false}
                            align="right"
                            suffix="/mes"
                            containerStyle={{ maxWidth: "42%", flexShrink: 0 }}
                        />
                        <TouchableOpacity
                            onPress={() => remove(d.id)}
                            style={ps.trash}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Quitar deuda ${d.name}`}
                        >
                            <Ionicons name="trash-outline" size={18} color={C.danger} />
                        </TouchableOpacity>
                    </GlassCard>
                );
            })}

            {draft.debts.length > 0 && (
                <GlassCard radius={14} blur={false} style={{ marginTop: 14 }} contentStyle={s.totalContent}>
                    <Text style={s.totalLbl}>TOTAL MENSUAL EN DEUDAS</Text>
                    <Money
                        amount={totalQ}
                        currency="Q"
                        size="md"
                        tone="expense"
                        sign="never"
                        align="center"
                        containerStyle={s.totalValWrap}
                    />
                    {debtLevel === "high" && (
                        <InlineNotice
                            variant="warning"
                            style={{ marginTop: 10, alignSelf: "stretch" }}
                            text="Más del 40 % de tu ingreso en cuotas. Zona de alerta."
                        />
                    )}
                    {debtLevel === "moderate" && (
                        <InlineNotice
                            variant="info"
                            style={{ marginTop: 10, alignSelf: "stretch" }}
                            text="Entre 20 % y 40 % de tu ingreso en cuotas."
                        />
                    )}
                </GlassCard>
            )}

            {!open ? (
                <GlassButton
                    label="Agregar deuda"
                    icon="add-circle-outline"
                    kind="secondary"
                    onPress={openForm}
                    style={{ marginTop: 14 }}
                />
            ) : (
                <View ref={formRef} collapsable={false} style={{ marginTop: 14 }}>
                    <GlassCard radius={16} blur={false} contentStyle={ps.cardContent}>
                        <Text style={s.formTitle}>Nueva deuda</Text>

                        <Text style={[ps.label, { marginTop: 4 }]}>Nombre de la deuda</Text>
                        <StyledInput
                            value={name}
                            onChangeText={t => { setName(t); setError(null); }}
                            placeholder="Ej: Visa BAC, Préstamo Banrural..."
                            autoCapitalize="sentences"
                        />

                        <Text style={ps.label}>Tipo de deuda</Text>
                        <ChipRow>
                            {DEBT_TYPES.map(t => (
                                <Chip key={t.type} label={t.label} icon={t.icon} selected={type === t.type} onPress={() => setType(t.type)} />
                            ))}
                        </ChipRow>

                        {askCard && (
                            <>
                                <Text style={ps.label}>¿De qué tarjeta?</Text>
                                <ChipRow>
                                    {cards.map(c => (
                                        <Chip
                                            key={c.id}
                                            label={c.name}
                                            icon="card-outline"
                                            selected={cardId === c.id}
                                            onPress={() => setCardId(cardId === c.id ? undefined : c.id)}
                                        />
                                    ))}
                                </ChipRow>
                            </>
                        )}

                        <Text style={ps.label}>Moneda</Text>
                        <GlassSegmented<DraftCurrency>
                            style={{ marginTop: 8 }}
                            value={currency}
                            onChange={setCurrency}
                            options={[{ value: "Q", label: "Q" }, { value: "USD", label: "USD" }]}
                        />

                        <Text style={ps.label}>Cuota mensual</Text>
                        <StyledInput
                            value={monthly}
                            onChangeText={t => { setMonthly(t); setError(null); }}
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            prefix={currency === "USD" ? "$" : "Q"}
                            accessibilityLabel="Cuota mensual"
                        />

                        <Text style={ps.label}>Total de la deuda (opcional)</Text>
                        <StyledInput
                            value={total}
                            onChangeText={t => { setTotal(t); setError(null); }}
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            prefix={currency === "USD" ? "$" : "Q"}
                            accessibilityLabel="Total de la deuda"
                        />

                        {!!error && <InlineNotice variant="error" style={ps.notice} text={error} />}

                        <GlassButtonGroup style={{ marginTop: 16 }}>
                            <GlassButton label="Cancelar" kind="secondary" onPress={closeForm} />
                            <GlassButton label="Agregar" icon="checkmark" onPress={add} />
                        </GlassButtonGroup>
                    </GlassCard>
                </View>
            )}
        </>
    );
}

const s = StyleSheet.create({
    item: { marginTop: 10 },
    itemContent: { flexDirection: "row", alignItems: "center", paddingVertical: 12, paddingLeft: 16, paddingRight: 8, gap: 10 },
    itemMain: { flex: 1, flexShrink: 1, minWidth: 0 },
    formTitle: { color: C.textPrimary, fontSize: 16, fontWeight: "900" },
    totalContent: { padding: 14, alignItems: "center" },
    totalLbl: { color: C.textSub, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
    totalValWrap: { alignSelf: "stretch", marginTop: 4 },
});
