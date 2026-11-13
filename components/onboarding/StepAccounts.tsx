import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import {
    DraftAccount, DraftAccountKind, DraftCurrency, newDraftId, ONB_TYPE_STYLE, ONBOARDING_BANKS, validateAccount,
} from "../../services/OnboardingPlan";
import { parseAmount } from "../../services/storage";
import { C } from "../../theme";
import { GlassButton, GlassButtonGroup } from "../GlassButton";
import { GlassCard } from "../GlassCard";
import { GlassSegmented } from "../GlassSegmented";
import { InlineNotice } from "../InlineNotice";
import Money from "../Money";
import { Chip, ChipRow, FieldContext, ps, StepHeader, StepProps, StyledInput } from "./OnbPrimitives";

type CardKind = Exclude<DraftAccountKind, "cash">;

const KIND_LABEL: Record<DraftAccountKind, string> = {
    bank: "Monetaria", savings: "Ahorro", credit: "Tarjeta de crédito", cash: "Efectivo",
};
const KIND_SHORT: Record<CardKind, string> = { bank: "Monetaria", savings: "Ahorro", credit: "Tarjeta" };
const BANK_SHORT: Record<string, string> = {
    BAC: "BAC", GYT: "G&T", BANRURAL: "Banrural", BI: "BI", BAM: "BAM",
    PROMERICA: "Promerica", BANTRAB: "Bantrab", INTERBANCO: "Interbanco",
};
const KINDS: CardKind[] = ["bank", "savings", "credit"];

const CASH = "CASH";
const OTHER = "OTHER";

function suggestedName(bankKey: string | null, otherLabel: string, kind: CardKind, currency: DraftCurrency): string {
    if (!bankKey) return "";
    const usd = currency === "USD" ? " $" : "";
    if (bankKey === CASH) return `Efectivo${usd}`;
    const base = bankKey === OTHER ? otherLabel.trim() : (BANK_SHORT[bankKey] ?? bankKey);
    return `${base ? base + " " : ""}${KIND_SHORT[kind]}${usd}`.trim();
}

/** Cuentas y tarjetas (opcional). Formulario EN LÍNEA: sin modales anidados. */
export default function StepAccounts({ draft, onChange, onFormOpenChange }: StepProps & {
    onFormOpenChange: (open: boolean) => void;
}) {
    const ctx = React.useContext(FieldContext);
    const formRef = useRef<View>(null);
    const [open, setOpen] = useState(false);
    const [bankKey, setBankKey] = useState<string | null>(null);
    const [otherLabel, setOtherLabel] = useState("");
    const [kind, setKind] = useState<CardKind>("bank");
    const [currency, setCurrency] = useState<DraftCurrency>("Q");
    const [nameTouched, setNameTouched] = useState(false);
    const [nameText, setNameText] = useState("");
    const [balance, setBalance] = useState("");
    const [error, setError] = useState<string | null>(null);

    const isCash = bankKey === CASH;
    const isCredit = !isCash && kind === "credit";
    const name = nameTouched ? nameText : suggestedName(bankKey, otherLabel, kind, currency);

    useEffect(() => { onFormOpenChange(open); }, [open, onFormOpenChange]);
    useEffect(() => () => onFormOpenChange(false), [onFormOpenChange]);

    const openForm = () => {
        setBankKey(null); setOtherLabel(""); setKind("bank"); setCurrency("Q");
        setNameTouched(false); setNameText(""); setBalance(""); setError(null);
        setOpen(true);
        setTimeout(() => ctx.reveal(formRef.current), 80);
    };

    const closeForm = () => { setOpen(false); setError(null); };

    const add = () => {
        if (!bankKey) { setError("Elegí un banco o «Efectivo»."); return; }
        const finalKind: DraftAccountKind = isCash ? "cash" : kind;
        const bank = ONBOARDING_BANKS.find(b => b.code === bankKey);
        const acc: DraftAccount = {
            id: newDraftId("onb_acc"),
            bankCode: bank ? bank.code : null,
            bankLabel: bank ? bank.label : (isCash ? "Efectivo" : otherLabel.trim()),
            kind: finalKind,
            currency,
            name: name.trim(),
            balance: finalKind === "credit" ? "" : balance.trim(),
        };
        const v = validateAccount(acc, parseAmount);
        if (!v.ok) { setError(v.error ?? "Revisá los datos de la cuenta."); return; }
        onChange({ accounts: [...draft.accounts, acc] });
        closeForm();
    };

    const remove = (id: string) => {
        onChange(d => ({
            accounts: d.accounts.filter(a => a.id !== id),
            // una deuda ligada a esa tarjeta queda sin tarjeta
            debts: d.debts.map(x => (x.accountId === id ? { ...x, accountId: undefined } : x)),
        }));
    };

    return (
        <>
            <StepHeader
                icon="wallet-outline"
                title="Cuentas y tarjetas"
                subtitle={'Tu saldo inicial reemplaza a los "ahorros externos": así el patrimonio del Inicio sale de tus cuentas.'}
            />

            {draft.accounts.length === 0 && !open && (
                <GlassCard radius={14} blur={false}>
                    <View style={ps.emptyBox}>
                        <Ionicons name="wallet-outline" size={22} color={C.textSub} />
                        <Text style={ps.emptyTxt}>Todavía no agregaste cuentas. Podés hacerlo ahora o más tarde desde Cuentas.</Text>
                    </View>
                </GlassCard>
            )}

            {draft.accounts.map(a => {
                const st = ONB_TYPE_STYLE[a.kind];
                const sub = [a.kind === "cash" ? "Efectivo" : (a.bankLabel || "Otro banco"), a.kind === "cash" ? null : KIND_LABEL[a.kind], a.currency === "USD" ? "USD" : "Q"]
                    .filter(Boolean).join(" · ");
                return (
                    <GlassCard key={a.id} radius={14} blur={false} leftAccentColor={st.color} style={s.item} contentStyle={s.itemContent}>
                        <Ionicons name={st.icon as keyof typeof Ionicons.glyphMap} size={20} color={st.color} />
                        <View style={s.itemMain}>
                            <Text style={ps.itemName} numberOfLines={2}>{a.name}</Text>
                            <Text style={ps.itemSub} numberOfLines={2}>{sub}</Text>
                        </View>
                        {a.kind !== "credit" && (
                            <Money
                                amount={Number.isFinite(parseAmount(a.balance)) ? parseAmount(a.balance) : 0}
                                currency={a.currency}
                                size="sm"
                                tone="neutral"
                                gradient={false}
                                align="right"
                                containerStyle={{ maxWidth: "40%", flexShrink: 0 }}
                            />
                        )}
                        <TouchableOpacity
                            onPress={() => remove(a.id)}
                            style={ps.trash}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Quitar cuenta ${a.name}`}
                        >
                            <Ionicons name="trash-outline" size={18} color={C.danger} />
                        </TouchableOpacity>
                    </GlassCard>
                );
            })}

            {Platform.OS === "android" && !draft.sms.optOut && draft.accounts.length > 0 && !open && (
                <Text style={ps.hint}>
                    Si tenés una sola cuenta de un banco, le asignamos sus SMS automáticamente; con varias, las asignás al revisar.
                </Text>
            )}

            {!open ? (
                <GlassButton
                    label="Agregar cuenta"
                    icon="add-circle-outline"
                    kind="secondary"
                    onPress={openForm}
                    style={{ marginTop: 14 }}
                />
            ) : (
                <View ref={formRef} collapsable={false} style={{ marginTop: 14 }}>
                    <GlassCard radius={16} blur={false} contentStyle={ps.cardContent}>
                        <Text style={s.formTitle}>Nueva cuenta</Text>

                        <Text style={[ps.label, { marginTop: 4 }]}>Banco</Text>
                        <ChipRow>
                            {ONBOARDING_BANKS.map(b => (
                                <Chip key={b.code} label={b.label} selected={bankKey === b.code} onPress={() => setBankKey(b.code)} />
                            ))}
                            <Chip label="Efectivo" icon="cash-outline" selected={bankKey === CASH} onPress={() => setBankKey(CASH)} />
                            <Chip label="Otro" selected={bankKey === OTHER} onPress={() => setBankKey(OTHER)} />
                        </ChipRow>
                        {bankKey === OTHER && (
                            <StyledInput
                                value={otherLabel}
                                onChangeText={setOtherLabel}
                                placeholder="Nombre del banco"
                                autoCapitalize="words"
                            />
                        )}

                        {!isCash && (
                            <>
                                <Text style={ps.label}>Tipo</Text>
                                <ChipRow>
                                    {KINDS.map(k => (
                                        <Chip key={k} label={KIND_LABEL[k]} selected={kind === k} onPress={() => setKind(k)} />
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

                        <Text style={ps.label}>Nombre</Text>
                        <StyledInput
                            value={name}
                            onChangeText={t => { setNameTouched(true); setNameText(t); setError(null); }}
                            placeholder="Ej: BAC Monetaria"
                            autoCapitalize="words"
                        />

                        {isCredit ? (
                            <Text style={ps.hint}>La fecha de corte, el pago y las visacuotas se configuran en Cuentas.</Text>
                        ) : (
                            <>
                                <Text style={ps.label}>Saldo inicial</Text>
                                <StyledInput
                                    value={balance}
                                    onChangeText={t => { setBalance(t); setError(null); }}
                                    placeholder="0.00"
                                    keyboardType="decimal-pad"
                                    prefix={currency === "USD" ? "$" : "Q"}
                                    accessibilityLabel="Saldo inicial"
                                />
                            </>
                        )}

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
});
