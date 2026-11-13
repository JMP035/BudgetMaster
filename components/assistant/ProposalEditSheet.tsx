import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useMemo, useState } from "react";
import { Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { formatDateOnly, parseAmount, parseDateOnly } from "../../services/DateAmount";
import { ACTIONS } from "../../services/assistant/Actions";
import { formatDateEs } from "../../services/assistant/DateParser";
import { CURRENCY_LIST, normCurrency, normTxType, resolveAccountId, resolveCategoryId } from "../../services/assistant/Queries";
import type { ActionProposal, AssistantContext, SlotMap, SlotSpec, SlotValue } from "../../services/assistant/types";
import { getAllExpenseCategories, getAllIncomeCategories } from "../../categories";
import { C } from "../../theme";
import { GlassButton } from "../GlassButton";
import { GlassBackground } from "../GlassCard";
import { GlassSegmented } from "../GlassSegmented";
import { GlassSheet } from "../GlassSheet";
import { InlineNotice } from "../InlineNotice";

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface ProposalEditSheetProps {
    proposal: ActionProposal;
    /** Contexto actual (categorías, cuentas, fecha de hoy): lo usa la validación en vivo. */
    ctx: AssistantContext;
    /** Recibe solo los slots que cambiaron. La tarjeta sigue pendiente; no se ejecuta nada. */
    onSave: (patch: SlotMap) => void;
    onClose: () => void;
}

const DAY_MS = 86400000;
const toNoon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);

function sameValue(a: SlotValue | undefined, b: SlotValue | undefined): boolean {
    const norm = (v: SlotValue | undefined) => (v === undefined || v === null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
    return norm(a) === norm(b);
}

function initialTexts(specs: SlotSpec[], slots: SlotMap): Record<string, string> {
    const out: Record<string, string> = {};
    for (const sp of specs) {
        if (sp.type !== "amount" && sp.type !== "day_of_month" && sp.type !== "text") continue;
        const v = slots[sp.key];
        out[sp.key] = typeof v === "string" || typeof v === "number" ? String(v) : "";
    }
    return out;
}

function Field({ label, invalid, children }: { label: string; invalid?: boolean; children: React.ReactNode }) {
    return (
        <View style={s.field}>
            <Text style={[s.lbl, invalid && { color: C.danger }]}>{label.toUpperCase()}</Text>
            {children}
        </View>
    );
}

function OptionChip({ label, icon, iconColor, selected, onPress }: {
    label: string; icon?: IoniconName; iconColor?: string; selected: boolean; onPress: () => void;
}) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected }}
            style={[s.chip, selected && s.chipOn]}
        >
            {!!icon && <Ionicons name={icon} size={14} color={iconColor ?? (selected ? C.primaryLight : C.textSub)} />}
            <Text style={[s.chipTxt, { color: selected ? C.primaryLight : C.text }]}>{label}</Text>
        </TouchableOpacity>
    );
}

export function ProposalEditSheet({ proposal, ctx, onSave, onClose }: ProposalEditSheetProps) {
    const spec = ACTIONS[proposal.actionId];
    const [draft, setDraft] = useState<SlotMap>(() => ({ ...proposal.slots }));
    const [texts, setTexts] = useState<Record<string, string>>(() => initialTexts(spec.slots, proposal.slots));
    const [pickerKey, setPickerKey] = useState<string | null>(null);

    const issues = useMemo(() => spec.validate(draft, ctx), [spec, draft, ctx]);
    const issueSlots = useMemo(() => new Set(issues.map(i => i.slot).filter(Boolean) as string[]), [issues]);

    const custom = ctx.settings.customCategories ?? [];
    const accounts = ctx.accounts.filter(a => a.isActive !== false);
    const nameMax = proposal.actionId === "create_goal" ? 40 : 60;

    const setSlot = (key: string, value: SlotValue) => setDraft(d => ({ ...d, [key]: value }));
    const setText = (key: string, t: string) => setTexts(p => ({ ...p, [key]: t }));

    const onAmount = (key: string, t: string) => {
        setText(key, t);
        const clean = t.trim();
        if (!clean) return setSlot(key, "");
        const n = parseAmount(clean);
        setSlot(key, Number.isFinite(n) ? n : clean);
    };
    const onDay = (key: string, t: string) => {
        setText(key, t);
        const clean = t.trim();
        if (!clean) return setSlot(key, "");
        setSlot(key, /^\d+$/.test(clean) ? Number(clean) : clean);
    };
    const onTxType = (v: "expense" | "income") => {
        setDraft(d => {
            const next: SlotMap = { ...d, tx_type: v };
            if (d.category && !resolveCategoryId(ctx, d.category, v)) next.category = "";
            return next;
        });
    };

    const save = () => {
        const patch: SlotMap = {};
        for (const sp of spec.slots) {
            const cur = draft[sp.key];
            if (!sameValue(cur, proposal.slots[sp.key])) patch[sp.key] = cur ?? "";
        }
        onSave(patch);
    };

    const renderPicker = (sp: SlotSpec) => {
        if (pickerKey !== sp.key) return null;
        const future = sp.type === "date_future";
        const current = parseDateOnly(typeof draft[sp.key] === "string" ? (draft[sp.key] as string) : "");
        const today = toNoon(ctx.now);
        const fallback = future ? new Date(today.getTime() + DAY_MS) : today;
        const value = current ?? fallback;
        const minimumDate = future ? new Date(today.getTime() + DAY_MS) : new Date(today.getTime() - 366 * DAY_MS);
        const maximumDate = future ? undefined : new Date(ctx.now.getFullYear(), ctx.now.getMonth(), ctx.now.getDate(), 23, 59, 59, 999);
        const apply = (picked: Date) => setSlot(sp.key, formatDateOnly(toNoon(picked)));
        if (Platform.OS === "android") {
            return (
                <DateTimePicker
                    value={value}
                    mode="date"
                    display="default"
                    minimumDate={minimumDate}
                    maximumDate={maximumDate}
                    onChange={(event, selected) => {
                        setPickerKey(null);
                        if (event.type === "set" && selected) apply(selected);
                    }}
                />
            );
        }
        return (
            <View style={s.iosPickerWrap}>
                <DateTimePicker
                    value={value}
                    mode="date"
                    display="inline"
                    themeVariant="dark"
                    minimumDate={minimumDate}
                    maximumDate={maximumDate}
                    accentColor={C.primary}
                    onChange={(_e, selected) => { if (selected) apply(selected); }}
                />
                <TouchableOpacity style={s.iosPickerDone} onPress={() => setPickerKey(null)} accessibilityRole="button">
                    <Text style={s.iosPickerDoneTxt}>Listo</Text>
                </TouchableOpacity>
            </View>
        );
    };

    const renderField = (sp: SlotSpec) => {
        const invalid = issueSlots.has(sp.key);
        switch (sp.type) {
            case "text": {
                const max = sp.key === "description" ? 100 : nameMax;
                return (
                    <Field key={sp.key} label={sp.label} invalid={invalid}>
                        <TextInput
                            style={[s.input, invalid && s.inputInvalid]}
                            value={texts[sp.key] ?? ""}
                            onChangeText={t => { setText(sp.key, t); setSlot(sp.key, t); }}
                            maxLength={max}
                            placeholder={sp.label}
                            placeholderTextColor={C.textMuted}
                            accessibilityLabel={sp.label}
                            returnKeyType="done"
                        />
                    </Field>
                );
            }
            case "amount":
                return (
                    <Field key={sp.key} label={sp.label} invalid={invalid}>
                        <TextInput
                            style={[s.input, invalid && s.inputInvalid]}
                            value={texts[sp.key] ?? ""}
                            onChangeText={t => onAmount(sp.key, t)}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor={C.textMuted}
                            accessibilityLabel={sp.label}
                        />
                    </Field>
                );
            case "day_of_month":
                return (
                    <Field key={sp.key} label={sp.label} invalid={invalid}>
                        <TextInput
                            style={[s.input, invalid && s.inputInvalid]}
                            value={texts[sp.key] ?? ""}
                            onChangeText={t => onDay(sp.key, t)}
                            keyboardType="number-pad"
                            maxLength={2}
                            placeholder="1 a 31"
                            placeholderTextColor={C.textMuted}
                            accessibilityLabel={sp.label}
                        />
                    </Field>
                );
            case "currency": {
                const cur = normCurrency(draft[sp.key]) ?? normCurrency(ctx.settings.currency) ?? "Q";
                return (
                    <Field key={sp.key} label={sp.label} invalid={invalid}>
                        <GlassSegmented
                            value={cur}
                            onChange={v => setSlot(sp.key, v)}
                            options={CURRENCY_LIST.map(c => ({ value: c, label: c === "USD" ? "$ USD" : c }))}
                        />
                    </Field>
                );
            }
            case "tx_type": {
                const t = normTxType(draft[sp.key]) ?? "expense";
                return (
                    <Field key={sp.key} label={sp.label} invalid={invalid}>
                        <GlassSegmented
                            value={t}
                            onChange={onTxType}
                            options={[
                                { value: "expense", label: "Gasto", icon: "remove-circle-outline" },
                                { value: "income", label: "Ingreso", icon: "add-circle-outline" },
                            ]}
                        />
                    </Field>
                );
            }
            case "date_future":
            case "date_past": {
                const ymd = typeof draft[sp.key] === "string" && parseDateOnly(draft[sp.key] as string) ? (draft[sp.key] as string) : "";
                const label = ymd ? formatDateEs(ymd) : "Elegir fecha";
                return (
                    <Field key={sp.key} label={sp.label} invalid={invalid}>
                        <TouchableOpacity
                            style={[s.dateField, invalid && s.inputInvalid]}
                            onPress={() => setPickerKey(k => (k === sp.key ? null : sp.key))}
                            activeOpacity={0.75}
                            accessibilityRole="button"
                            accessibilityLabel={`${sp.label}: ${label}. Toque para cambiarla`}
                        >
                            <GlassBackground radius={12} blur={false} />
                            <Ionicons name="calendar-outline" size={18} color={C.primaryLight} />
                            <Text style={s.dateTxt}>{label}</Text>
                            <Ionicons name="chevron-down" size={16} color={C.textSub} />
                        </TouchableOpacity>
                        {renderPicker(sp)}
                    </Field>
                );
            }
            case "category_expense":
            case "category_any": {
                const kind = sp.type === "category_expense" ? "expense" : (normTxType(draft.tx_type) ?? "expense");
                const list = (kind === "income" ? getAllIncomeCategories(custom) : getAllExpenseCategories(custom))
                    .filter(c => c.id !== "transfer" && c.id !== "transfer_in");
                const selectedId = resolveCategoryId(ctx, draft[sp.key], kind);
                return (
                    <Field key={sp.key} label={sp.label} invalid={invalid}>
                        <View style={s.chips}>
                            {list.map(c => (
                                <OptionChip
                                    key={c.id}
                                    label={c.label.replace(/\.$/, "")}
                                    icon={c.icon}
                                    iconColor={c.color}
                                    selected={selectedId === c.id}
                                    onPress={() => setSlot(sp.key, c.id)}
                                />
                            ))}
                        </View>
                    </Field>
                );
            }
            case "account": {
                if (accounts.length === 0) return null;
                const selectedId = resolveAccountId(ctx, draft[sp.key]);
                return (
                    <Field key={sp.key} label={sp.label} invalid={invalid}>
                        <View style={s.chips}>
                            <OptionChip label="Ninguna" selected={!selectedId} onPress={() => setSlot(sp.key, "")} />
                            {accounts.map(a => (
                                <OptionChip
                                    key={a.id}
                                    label={a.name}
                                    icon="wallet-outline"
                                    selected={selectedId === a.id}
                                    onPress={() => setSlot(sp.key, a.id)}
                                />
                            ))}
                        </View>
                    </Field>
                );
            }
            default:
                return null;
        }
    };

    return (
        <GlassSheet
            onClose={onClose}
            title={`Editar: ${spec.title}`}
            icon="create-outline"
            footer={
                <View style={s.footer}>
                    {issues.map((it, i) => (
                        <InlineNotice key={`${it.slot ?? "x"}-${i}`} variant="error" text={it.message} />
                    ))}
                    <GlassButton label="Guardar cambios" icon="checkmark" disabled={issues.length > 0} onPress={save} />
                </View>
            }
        >
            {spec.slots.map(renderField)}
            <View style={{ height: 8 }} />
        </GlassSheet>
    );
}

const s = StyleSheet.create({
    field: { marginBottom: 14 },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
    input: {
        minHeight: 48,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.glassInputBorder,
        backgroundColor: C.glassInput,
        color: C.text,
        fontSize: 15,
        paddingHorizontal: 14,
        paddingVertical: 10,
    },
    inputInvalid: { borderColor: C.danger },
    dateField: {
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: "transparent",
        paddingHorizontal: 14,
        paddingVertical: 12,
        overflow: "hidden",
    },
    dateTxt: { flex: 1, color: C.text, fontSize: 15, fontWeight: "700", flexShrink: 1 },
    iosPickerWrap: { marginTop: 8 },
    iosPickerDone: { alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 8 },
    iosPickerDoneTxt: { color: C.primaryLight, fontWeight: "800" },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
        minHeight: 38,
        maxWidth: "100%",
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        borderRadius: 19,
        borderWidth: 1,
        borderColor: C.glassInputBorder,
        backgroundColor: C.glassInput,
        paddingHorizontal: 12,
        paddingVertical: 6,
    },
    chipOn: { backgroundColor: C.glassActive, borderColor: C.glassActiveBorder },
    chipTxt: { fontSize: 13, fontWeight: "700", flexShrink: 1 },
    footer: { paddingTop: 12, gap: 8 },
});

export default ProposalEditSheet;
