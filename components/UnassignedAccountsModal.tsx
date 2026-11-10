import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { Account, StorageService, Transaction } from "../services/storage";
import { groupUnassigned, linkKeyLabel } from "../services/AccountLinking";
import { formatMoney } from "../services/format";
import { GlassCard } from "./GlassCard";
import { GlassSheet } from "./GlassSheet";
import { GlassButton } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";
import { useGlassDialog } from "./GlassDialogProvider";

export interface UnassignedAccountsModalProps {
    visible: boolean;
    transactions: Transaction[];
    accounts: Account[];
    onClose: () => void;
    onChanged: () => void;
}

type Group = ReturnType<typeof groupUnassigned>[number];

const flat = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/** 'BAC|prod:BAC VISA' → 'BAC VISA'; el resto usa la etiqueta legible de la clave. */
function keyName(key: string): string {
    const bar = key.indexOf("|");
    const tail = bar >= 0 ? key.slice(bar + 1) : key;
    if (tail.startsWith("prod:")) return tail.slice(5);
    return linkKeyLabel(key);
}

function keyBank(key: string): string {
    const bar = key.indexOf("|");
    return bar >= 0 ? key.slice(0, bar) : "";
}

function keyKind(key: string): string {
    const bar = key.indexOf("|");
    const tail = bar >= 0 ? key.slice(bar + 1) : "";
    const colon = tail.indexOf(":");
    return colon >= 0 ? tail.slice(0, colon) : tail;
}

function sameBank(acc: Account, bank: string): boolean {
    if (!bank) return false;
    const b = flat(bank);
    if (acc.bankName) {
        const n = flat(acc.bankName);
        if (n && (n.includes(b) || b.includes(n))) return true;
    }
    return (acc.smsLinks ?? []).some(k => k.startsWith(`${bank}|`));
}

/** Cuentas activas candidatas: mismo banco primero; para tarjeta/producto, las de crédito primero. */
function candidatesFor(key: string, accounts: Account[]): Array<{ acc: Account; bankMatch: boolean }> {
    const bank = keyBank(key);
    const kind = keyKind(key);
    const preferCredit = kind === "prod" || kind === "card";
    const rank = (a: Account) =>
        (sameBank(a, bank) ? 0 : 2) + (preferCredit ? (a.type === "credit" ? 0 : 1) : 0);
    return accounts
        .filter(a => a.isActive)
        .map(acc => ({ acc, bankMatch: sameBank(acc, bank) }))
        .sort((x, y) => rank(x.acc) - rank(y.acc));
}

export function UnassignedAccountsModal({ visible, transactions, accounts, onClose, onChanged }: UnassignedAccountsModalProps) {
    const dialog = useGlassDialog();
    const [done, setDone] = useState<Set<string>>(new Set());
    const [remember, setRemember] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<{ variant: "success" | "warning" | "error"; text: string; canRelax?: boolean } | null>(null);

    useEffect(() => {
        if (visible) {
            setDone(new Set());
            setRemember(true);
            setBusy(null);
            setNotice(null);
        }
    }, [visible]);

    const groups = useMemo(
        () => groupUnassigned(transactions).filter(g => !done.has(g.key)),
        [transactions, done],
    );

    const txById = useMemo(() => {
        const m = new Map<string, Transaction>();
        for (const t of transactions) m.set(t.id, t);
        return m;
    }, [transactions]);

    if (!visible) return null;

    const assign = async (group: Group, acc: Account) => {
        if (busy) return;
        const name = keyName(group.key);
        const n = group.txIds.length;
        const ok = await dialog.confirm({
            title: "Asignar a esta cuenta",
            message:
                `Vas a asignar ${n} movimiento${n === 1 ? "" : "s"} de ${name} a «${acc.name}». ` +
                (remember
                    ? `Los próximos SMS de ${name} también irán a esa cuenta.`
                    : "Los próximos SMS no se asignarán solos."),
            confirmLabel: "Asignar",
            destructive: false,
            variant: "info",
            icon: "card-outline",
        });
        if (!ok) return;

        setBusy(`${group.key}|${acc.id}`);
        setNotice(null);
        try {
            const res = await StorageService.assignUnassignedGroup(group.key, acc.id, remember);
            if (res.ok) {
                setDone(prev => new Set(prev).add(group.key));
                setNotice({
                    variant: "success",
                    text: `Listo: ${res.assigned} movimiento${res.assigned === 1 ? "" : "s"} asignado${res.assigned === 1 ? "" : "s"} a «${acc.name}».`,
                });
                onChanged();
            } else if (res.error === "conflict") {
                setNotice({
                    variant: "warning",
                    text: `Otra cuenta ya recibe los SMS de ${name}. Si tenés dos tarjetas ${name}, la app no puede distinguirlas por SMS: elegí una como principal y asigná las demás a mano.`,
                    canRelax: true,
                });
            } else {
                setNotice({ variant: "error", text: "No se encontró esa cuenta. Cerrá esta ventana y probá de nuevo." });
            }
        } catch (e) {
            console.warn("assignUnassignedGroup error:", e);
            setNotice({ variant: "error", text: "No se pudo asignar. No se modificó nada. Probá de nuevo." });
        } finally {
            setBusy(null);
        }
    };

    return (
        <GlassSheet onClose={onClose} title="Movimientos sin cuenta" icon="card-outline">
            <InlineNotice variant="info" text="Vincular no cambia saldos pasados." style={s.notice} />
            {!!notice && (
                <InlineNotice
                    variant={notice.variant}
                    text={notice.text}
                    style={s.notice}
                    actionLabel={notice.canRelax && remember ? "Asignar sin recordar" : undefined}
                    onAction={notice.canRelax && remember ? () => { setRemember(false); setNotice(null); } : undefined}
                />
            )}

            {groups.length === 0 ? (
                <View style={s.empty}>
                    <Ionicons name="checkmark-circle-outline" size={44} color={C.accent} />
                    <Text style={s.emptyTitle}>Todo resuelto</Text>
                    <Text style={s.emptySub}>No quedan movimientos sin cuenta.</Text>
                    <GlassButton label="Cerrar" kind="secondary" onPress={onClose} style={s.emptyBtn} />
                </View>
            ) : (
                <>
                    <Pressable
                        onPress={() => setRemember(r => !r)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: remember }}
                        accessibilityLabel="Recordar para los próximos SMS"
                        style={s.rememberRow}
                    >
                        <Ionicons
                            name={remember ? "checkbox" : "square-outline"}
                            size={24}
                            color={remember ? C.primary : C.textSub}
                        />
                        <View style={s.rememberBody}>
                            <Text style={s.rememberTitle}>Recordar para los próximos SMS</Text>
                            <Text style={s.rememberSub}>
                                Los SMS nuevos de ese banco o tarjeta irán solos a la cuenta que elijas.
                            </Text>
                        </View>
                    </Pressable>

                    {groups.map(group => {
                        const n = group.txIds.length;
                        const allExpense = group.txIds.every(id => txById.get(id)?.type === "expense");
                        const noun = allExpense ? (n === 1 ? "compra" : "compras") : (n === 1 ? "movimiento" : "movimientos");
                        const cands = candidatesFor(group.key, accounts);
                        return (
                            <GlassCard key={group.key} radius={16} blur={false} style={s.card} contentStyle={s.cardContent}>
                                <Text style={s.groupTitle}>
                                    {n} {noun} de {keyName(group.key)} sin cuenta
                                    {" · "}
                                    {formatMoney(Math.abs(group.total), group.currency, { decimals: 2 })}
                                </Text>
                                {cands.length === 0 ? (
                                    <Text style={s.hint}>
                                        No tenés cuentas activas. Creá una en la pantalla de cuentas para poder asignar estos movimientos.
                                    </Text>
                                ) : (
                                    <>
                                        <Text style={s.hint}>Elegí a qué cuenta pertenecen:</Text>
                                        <View style={s.chips}>
                                            {cands.map(({ acc, bankMatch }) => {
                                                const chipBusy = busy === `${group.key}|${acc.id}`;
                                                return (
                                                    <Pressable
                                                        key={acc.id}
                                                        onPress={() => { void assign(group, acc); }}
                                                        disabled={!!busy}
                                                        accessibilityRole="button"
                                                        accessibilityLabel={`Asignar a ${acc.name}`}
                                                        accessibilityState={{ disabled: !!busy, busy: chipBusy }}
                                                        style={[
                                                            s.chip,
                                                            bankMatch && s.chipMatch,
                                                            !!busy && !chipBusy && s.chipDim,
                                                        ]}
                                                    >
                                                        <Ionicons
                                                            name={acc.type === "credit" ? "card-outline" : "wallet-outline"}
                                                            size={14}
                                                            color={bankMatch ? C.primaryLight : C.textSub}
                                                        />
                                                        <Text style={s.chipTxt} numberOfLines={1}>{acc.name}</Text>
                                                    </Pressable>
                                                );
                                            })}
                                        </View>
                                    </>
                                )}
                            </GlassCard>
                        );
                    })}
                </>
            )}
        </GlassSheet>
    );
}

const s = StyleSheet.create({
    notice: { marginBottom: 12 },
    rememberRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 4, marginBottom: 12, minHeight: 44 },
    rememberBody: { flex: 1 },
    rememberTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
    rememberSub: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 2 },
    card: { marginBottom: 12 },
    cardContent: { padding: 14, gap: 10 },
    groupTitle: { color: C.text, fontSize: 14, fontWeight: "800", lineHeight: 20 },
    hint: { color: C.textSub, fontSize: 12, lineHeight: 17 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 6,
        minHeight: 40,
        maxWidth: "100%",
        paddingHorizontal: 12,
        borderRadius: 999,
        borderWidth: 1,
        borderColor: C.glassBorder,
        backgroundColor: C.glassInput,
    },
    chipMatch: { backgroundColor: C.glassActive, borderColor: C.glassActiveBorder },
    chipDim: { opacity: 0.5 },
    chipTxt: { color: C.text, fontSize: 13, fontWeight: "700", flexShrink: 1 },
    empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
    emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
    emptySub: { color: C.textSub, fontSize: 13, textAlign: "center" },
    emptyBtn: { alignSelf: "stretch", marginTop: 8 },
});

export default UnassignedAccountsModal;
