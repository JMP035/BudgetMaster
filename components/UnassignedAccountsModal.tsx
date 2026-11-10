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
import { Money } from "./Money";
import { useGlassDialog } from "./GlassDialogProvider";

export interface UnassignedAccountsModalProps {
    visible: boolean;
    transactions: Transaction[];
    accounts: Account[];
    onClose: () => void;
    onChanged: () => void;
}

type Group = ReturnType<typeof groupUnassigned>[number];
type NoticeState = { variant: "success" | "warning" | "error"; text: string; canRelax?: boolean };

const PAGE = 50;
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

const flat = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

function shortDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

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

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export function UnassignedAccountsModal({ visible, transactions, accounts, onClose, onChanged }: UnassignedAccountsModalProps) {
    const dialog = useGlassDialog();
    // Ids ya resueltos en esta ventana (asignados o descartados): se ocultan al instante,
    // sin depender de que el padre recargue las transacciones.
    const [resolved, setResolved] = useState<Set<string>>(new Set());
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [limits, setLimits] = useState<Record<string, number>>({});
    const [remember, setRemember] = useState(true);
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<NoticeState | null>(null);

    useEffect(() => {
        if (visible) {
            setResolved(new Set());
            setExpanded(new Set());
            setSelected(new Set());
            setLimits({});
            setRemember(true);
            setBusy(null);
            setNotice(null);
        }
    }, [visible]);

    const groups = useMemo(
        () => groupUnassigned(transactions.filter(t => !resolved.has(t.id))),
        [transactions, resolved],
    );

    const txById = useMemo(() => {
        const m = new Map<string, Transaction>();
        for (const t of transactions) m.set(t.id, t);
        return m;
    }, [transactions]);

    if (!visible) return null;

    const markResolved = (ids: string[]) => {
        setResolved(prev => {
            const next = new Set(prev);
            ids.forEach(id => next.add(id));
            return next;
        });
        setSelected(prev => {
            if (!ids.some(id => prev.has(id))) return prev;
            const next = new Set(prev);
            ids.forEach(id => next.delete(id));
            return next;
        });
    };

    const toggleExpanded = (key: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key); else next.add(key);
            return next;
        });
    };

    const toggleSelected = (id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    const setGroupSelection = (group: Group, on: boolean) => {
        setSelected(prev => {
            const next = new Set(prev);
            group.txIds.forEach(id => { if (on) next.add(id); else next.delete(id); });
            return next;
        });
    };

    /** Asigna (acc) o descarta (null) movimientos concretos, sin crear reglas de vínculo. */
    const applyToTxs = async (ids: string[], acc: Account | null, busyKey: string) => {
        if (busy || ids.length === 0) return;
        setBusy(busyKey);
        setNotice(null);
        try {
            await StorageService.setTransactionsAccount(ids, acc ? acc.id : null);
            markResolved(ids);
            const n = ids.length;
            setNotice({
                variant: "success",
                text: acc
                    ? `${n} ${plural(n, "movimiento asignado", "movimientos asignados")} a «${acc.name}».`
                    : `${n} ${plural(n, "descartado", "descartados")}.`,
            });
            onChanged();
        } catch (e) {
            console.warn("setTransactionsAccount error:", e);
            setNotice({ variant: "error", text: "No se pudo guardar. No se modificó nada. Probá de nuevo." });
        } finally {
            setBusy(null);
        }
    };

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
                markResolved(group.txIds);
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

    const discardGroup = async (group: Group) => {
        if (busy) return;
        const n = group.txIds.length;
        const ok = await dialog.confirm({
            title: "Descartar todo el grupo",
            message:
                `Vas a marcar ${n} movimiento${n === 1 ? "" : "s"} de ${keyName(group.key)} como «sin cuenta a propósito». ` +
                "Dejarán de aparecer como pendientes y no se asignarán solos. El saldo de tus cuentas no cambia.",
            confirmLabel: "Descartar",
            destructive: true,
            variant: "warning",
            icon: "trash-outline",
        });
        if (!ok) return;
        await applyToTxs(group.txIds, null, `${group.key}|discard`);
    };

    const renderChips = (cands: Array<{ acc: Account; bankMatch: boolean }>, onPick: (acc: Account) => void, busyPrefix: string, labelPrefix: string, extra?: React.ReactNode) => (
        <View style={s.chips}>
            {cands.map(({ acc, bankMatch }) => {
                const chipBusy = busy === `${busyPrefix}|${acc.id}`;
                return (
                    <Pressable
                        key={acc.id}
                        onPress={() => onPick(acc)}
                        disabled={!!busy}
                        accessibilityRole="button"
                        accessibilityLabel={`${labelPrefix} ${acc.name}`}
                        accessibilityState={{ disabled: !!busy, busy: chipBusy }}
                        style={[s.chip, bankMatch && s.chipMatch, !!busy && !chipBusy && s.chipDim]}
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
            {extra}
        </View>
    );

    const renderRow = (t: Transaction, cands: Array<{ acc: Account; bankMatch: boolean }>) => {
        const isSel = selected.has(t.id);
        return (
            <View key={t.id} style={[s.row, isSel && s.rowSel]}>
                <Pressable
                    onPress={() => toggleSelected(t.id)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: isSel }}
                    accessibilityLabel={`Seleccionar ${t.description}`}
                    style={s.rowHead}
                >
                    <Ionicons
                        name={isSel ? "checkbox" : "square-outline"}
                        size={22}
                        color={isSel ? C.primary : C.textSub}
                    />
                    <View style={s.rowBody}>
                        <Text style={s.rowDesc} numberOfLines={2}>{t.description}</Text>
                        <Text style={s.rowDate}>{shortDate(t.date)}</Text>
                    </View>
                    <Money
                        amount={t.amount}
                        currency={t.currency || "Q"}
                        size="sm"
                        gradient={false}
                        sign="never"
                        align="right"
                        prefix={t.type === "income" ? "+" : t.type === "expense" ? "-" : ""}
                        tone={t.type === "income" ? "income" : t.type === "expense" ? "expense" : "neutral"}
                        containerStyle={s.rowMoney}
                    />
                </Pressable>
                {renderChips(
                    cands,
                    acc => { void applyToTxs([t.id], acc, `${t.id}|${acc.id}`); },
                    t.id,
                    "Asignar a",
                    <Pressable
                        onPress={() => { void applyToTxs([t.id], null, `${t.id}|discard`); }}
                        disabled={!!busy}
                        accessibilityRole="button"
                        accessibilityLabel={`Descartar ${t.description}`}
                        accessibilityState={{ disabled: !!busy }}
                        style={[s.chip, s.chipDiscard, !!busy && s.chipDim]}
                    >
                        <Ionicons name="close-circle-outline" size={14} color={C.textSub} />
                        <Text style={s.chipTxt}>Descartar</Text>
                    </Pressable>,
                )}
            </View>
        );
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
                                Solo aplica al asignar todo un grupo: los SMS nuevos de ese banco o tarjeta irán solos a la cuenta
                                que elijas. Si asignás de a uno o por selección, no se crea ninguna regla.
                            </Text>
                        </View>
                    </Pressable>

                    {groups.map(group => {
                        const n = group.txIds.length;
                        const allExpense = group.txIds.every(id => txById.get(id)?.type === "expense");
                        const noun = allExpense ? (n === 1 ? "compra" : "compras") : (n === 1 ? "movimiento" : "movimientos");
                        const cands = candidatesFor(group.key, accounts);
                        const isOpen = expanded.has(group.key);
                        const selIds = group.txIds.filter(id => selected.has(id));
                        const allSel = selIds.length === n;
                        const limit = limits[group.key] ?? PAGE;
                        const visibleIds = group.txIds.slice(0, limit);
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
                                        <Text style={s.hint}>Asignar todo el grupo a:</Text>
                                        {renderChips(cands, acc => { void assign(group, acc); }, group.key, "Asignar todo el grupo a")}
                                    </>
                                )}

                                <View style={s.groupBtns}>
                                    <GlassButton
                                        label={isOpen ? `Ocultar movimientos (${n})` : `Ver movimientos (${n})`}
                                        kind="secondary"
                                        icon={isOpen ? "chevron-up" : "chevron-down"}
                                        onPress={() => toggleExpanded(group.key)}
                                        style={s.groupBtn}
                                    />
                                    <GlassButton
                                        label="Descartar todo el grupo"
                                        kind="ghost"
                                        icon="close-circle-outline"
                                        disabled={!!busy}
                                        onPress={() => { void discardGroup(group); }}
                                        style={s.groupBtn}
                                    />
                                </View>

                                {isOpen && (
                                    <View style={s.list}>
                                        <Pressable
                                            onPress={() => setGroupSelection(group, !allSel)}
                                            accessibilityRole="button"
                                            accessibilityLabel={allSel ? "Quitar selección" : "Seleccionar todos"}
                                            style={s.selectAll}
                                        >
                                            <Ionicons
                                                name={allSel ? "checkbox" : "square-outline"}
                                                size={22}
                                                color={allSel ? C.primary : C.textSub}
                                            />
                                            <Text style={s.selectAllTxt}>{allSel ? "Quitar selección" : "Seleccionar todos"}</Text>
                                        </Pressable>

                                        {selIds.length > 0 && (
                                            <View style={s.selBar}>
                                                <Text style={s.selTitle}>
                                                    {selIds.length} {plural(selIds.length, "seleccionado", "seleccionados")}
                                                </Text>
                                                {cands.length > 0 && (
                                                    <>
                                                        <Text style={s.hint}>Asignar {selIds.length} seleccionados a…</Text>
                                                        {renderChips(
                                                            cands,
                                                            acc => { void applyToTxs(selIds, acc, `${group.key}|sel|${acc.id}`); },
                                                            `${group.key}|sel`,
                                                            "Asignar seleccionados a",
                                                        )}
                                                    </>
                                                )}
                                                <GlassButton
                                                    label={`Descartar ${selIds.length} seleccionados`}
                                                    kind="ghost"
                                                    icon="close-circle-outline"
                                                    disabled={!!busy}
                                                    onPress={() => { void applyToTxs(selIds, null, `${group.key}|sel-discard`); }}
                                                />
                                            </View>
                                        )}

                                        {visibleIds.map(id => {
                                            const t = txById.get(id);
                                            return t ? renderRow(t, cands) : null;
                                        })}

                                        {n > limit && (
                                            <GlassButton
                                                label={`Ver más (${n - limit} restantes)`}
                                                kind="secondary"
                                                icon="chevron-down"
                                                onPress={() => setLimits(prev => ({ ...prev, [group.key]: limit + PAGE }))}
                                            />
                                        )}
                                    </View>
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
    chipDiscard: { borderStyle: "dashed" },
    chipDim: { opacity: 0.5 },
    chipTxt: { color: C.text, fontSize: 13, fontWeight: "700", flexShrink: 1 },
    groupBtns: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    groupBtn: { flexGrow: 1, flexBasis: 140 },
    list: { gap: 8, marginTop: 2 },
    selectAll: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
    selectAllTxt: { color: C.text, fontSize: 13, fontWeight: "800", flexShrink: 1 },
    selBar: {
        gap: 8,
        padding: 12,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: C.glassActiveBorder,
        backgroundColor: C.glassActive,
    },
    selTitle: { color: C.text, fontSize: 13, fontWeight: "800" },
    row: {
        gap: 8,
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.glassBorder,
        backgroundColor: C.glassInput,
    },
    rowSel: { borderColor: C.glassActiveBorder },
    rowHead: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 44 },
    rowBody: { flex: 1, flexShrink: 1 },
    rowDesc: { color: C.text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
    rowDate: { color: C.textSub, fontSize: 12, marginTop: 1 },
    rowMoney: { width: 96 },
    empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
    emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
    emptySub: { color: C.textSub, fontSize: 13, textAlign: "center" },
    emptyBtn: { alignSelf: "stretch", marginTop: 8 },
});

export default UnassignedAccountsModal;
