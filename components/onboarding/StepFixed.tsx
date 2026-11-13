import { Ionicons } from "@expo/vector-icons";
import React, { useContext, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { getAllExpenseCategories } from "../../categories";
import { fixedCycleConfig } from "../../services/FixedCycle";
import {
    dueLabel, DraftCurrency, DraftFixed, FIXED_SUGGESTIONS, newDraftId, normalizeName, validateDay, validateFixed,
} from "../../services/OnboardingPlan";
import { parseAmount } from "../../services/storage";
import { C } from "../../theme";
import { GlassButton, GlassButtonGroup } from "../GlassButton";
import { GlassCard } from "../GlassCard";
import { GlassSegmented } from "../GlassSegmented";
import { InlineNotice } from "../InlineNotice";
import Money from "../Money";
import { Chip, ChipRow, cycleSettingsOf, FieldContext, ps, StepHeader, StepProps, StyledInput } from "./OnbPrimitives";

/** Gastos fijos (opcional). Formulario EN LÍNEA con sugerencias de un toque. */
export default function StepFixed({ draft, onChange, onFormOpenChange }: StepProps & {
    onFormOpenChange: (open: boolean) => void;
}) {
    const ctx = useContext(FieldContext);
    const formRef = useRef<View>(null);
    const categories = getAllExpenseCategories();

    const [open, setOpen] = useState(false);
    const [name, setName] = useState("");
    const [amount, setAmount] = useState("");
    const [currency, setCurrency] = useState<DraftCurrency>("Q");
    const [day, setDay] = useState("");
    const [category, setCategory] = useState("other");
    const [error, setError] = useState<string | null>(null);

    useEffect(() => { onFormOpenChange(open); }, [open, onFormOpenChange]);
    useEffect(() => () => onFormOpenChange(false), [onFormOpenChange]);

    const openForm = (preName = "", preCategory = "other") => {
        setName(preName); setCategory(preCategory); setAmount(""); setDay(""); setError(null);
        setCurrency(draft.incomeCurrency);
        setOpen(true);
        setTimeout(() => ctx.reveal(formRef.current), 80);
    };

    const closeForm = () => { setOpen(false); setError(null); };

    const candidate = (): DraftFixed => ({
        id: newDraftId("onb_fx"), name: name.trim(), amount: amount.trim(), currency, dayOfMonth: day.trim(), category,
    });

    const duplicate = name.trim().length > 0
        && draft.fixed.some(f => normalizeName(f.name) === normalizeName(name));

    const add = () => {
        const f = candidate();
        const v = validateFixed(f, draft.fixed, parseAmount);
        if (!v.ok) { setError(v.error ?? "Revisá los datos del gasto."); return; }
        onChange({ fixed: [...draft.fixed, f] });
        closeForm();
    };

    const remove = (id: string) => onChange(d => ({ fixed: d.fixed.filter(f => f.id !== id) }));

    const dayValid = validateDay(day).ok;
    const due = dayValid ? dueLabel(Number(day), fixedCycleConfig(cycleSettingsOf(draft)), new Date()) : null;

    const taken = (n: string) => draft.fixed.some(f => normalizeName(f.name) === normalizeName(n));

    return (
        <>
            <StepHeader
                icon="repeat-outline"
                title="Gastos fijos"
                subtitle="Lo que pagás todos los meses: renta, servicios, suscripciones. Los recordamos por vos."
            />

            <Text style={[ps.label, { marginTop: 0 }]}>Sugerencias</Text>
            <ChipRow>
                {FIXED_SUGGESTIONS.map(sg => (
                    <Chip
                        key={sg.name}
                        label={sg.name}
                        icon={taken(sg.name) ? "checkmark" : "add"}
                        selected={taken(sg.name)}
                        disabled={taken(sg.name)}
                        onPress={() => openForm(sg.name, sg.category)}
                    />
                ))}
            </ChipRow>

            {draft.fixed.map(f => (
                <GlassCard key={f.id} radius={14} blur={false} leftAccentColor={C.primary} style={s.item} contentStyle={s.itemContent}>
                    <View style={s.itemMain}>
                        <Text style={ps.itemName} numberOfLines={2}>{f.name}</Text>
                        <Text style={ps.itemSub}>Se cobra el día {f.dayOfMonth}</Text>
                    </View>
                    <Money
                        amount={Number.isFinite(parseAmount(f.amount)) ? parseAmount(f.amount) : 0}
                        currency={f.currency}
                        size="sm"
                        tone="expense"
                        sign="never"
                        gradient={false}
                        align="right"
                        containerStyle={{ maxWidth: "40%", flexShrink: 0 }}
                    />
                    <TouchableOpacity
                        onPress={() => remove(f.id)}
                        style={ps.trash}
                        hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        accessibilityRole="button"
                        accessibilityLabel={`Quitar gasto fijo ${f.name}`}
                    >
                        <Ionicons name="trash-outline" size={18} color={C.danger} />
                    </TouchableOpacity>
                </GlassCard>
            ))}

            {!open ? (
                <GlassButton
                    label="Agregar gasto fijo"
                    icon="add-circle-outline"
                    kind="secondary"
                    onPress={() => openForm()}
                    style={{ marginTop: 14 }}
                />
            ) : (
                <View ref={formRef} collapsable={false} style={{ marginTop: 14 }}>
                    <GlassCard radius={16} blur={false} contentStyle={ps.cardContent}>
                        <Text style={s.formTitle}>Nuevo gasto fijo</Text>

                        <Text style={[ps.label, { marginTop: 4 }]}>Nombre</Text>
                        <StyledInput
                            value={name}
                            onChangeText={t => { setName(t); setError(null); }}
                            placeholder="Ej: Renta"
                            autoCapitalize="sentences"
                        />
                        {duplicate && <InlineNotice variant="error" style={ps.notice} text={`Ya agregaste ${name.trim()}`} />}

                        <Text style={ps.label}>Monto</Text>
                        <StyledInput
                            value={amount}
                            onChangeText={t => { setAmount(t); setError(null); }}
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            prefix={currency === "USD" ? "$" : "Q"}
                            accessibilityLabel="Monto del gasto fijo"
                        />

                        <Text style={ps.label}>Moneda</Text>
                        <GlassSegmented<DraftCurrency>
                            style={{ marginTop: 8 }}
                            value={currency}
                            onChange={setCurrency}
                            options={[{ value: "Q", label: "Q" }, { value: "USD", label: "USD" }]}
                        />

                        <Text style={ps.label}>Día de cobro</Text>
                        <StyledInput
                            value={day}
                            onChangeText={t => { setDay(t); setError(null); }}
                            placeholder="5"
                            keyboardType="number-pad"
                            suffix="del mes"
                            accessibilityLabel="Día de cobro"
                        />
                        {!!due && <Text style={ps.hint}>{due}</Text>}

                        <Text style={ps.label}>Categoría</Text>
                        <ChipRow>
                            {categories.map(cat => (
                                <Chip
                                    key={cat.id}
                                    label={cat.label}
                                    icon={cat.icon}
                                    selected={category === cat.id}
                                    onPress={() => setCategory(cat.id)}
                                />
                            ))}
                        </ChipRow>

                        {!!error && !duplicate && <InlineNotice variant="error" style={ps.notice} text={error} />}

                        <GlassButtonGroup style={{ marginTop: 16 }}>
                            <GlassButton label="Cancelar" kind="secondary" onPress={closeForm} />
                            <GlassButton label="Agregar" icon="checkmark" onPress={add} disabled={duplicate} />
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
});
