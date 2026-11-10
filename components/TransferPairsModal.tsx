import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { StorageService, Transaction } from "../services/storage";
import { TransferPair, transferPairKey } from "../services/TransferPairs";
import { GlassCard } from "./GlassCard";
import { GlassSheet } from "./GlassSheet";
import { GlassButton } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";
import Money from "./Money";

export interface TransferPairsModalProps {
    visible: boolean;
    pairs: TransferPair[];
    transactions: Transaction[];
    onClose: () => void;
    onChanged: () => void;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtWhen(stored: string): string {
    const d = new Date(stored);
    if (isNaN(d.getTime())) return "fecha desconocida";
    const hh = String(d.getHours()).padStart(2, "0");
    const mm = String(d.getMinutes()).padStart(2, "0");
    return `${d.getDate()} ${MONTHS[d.getMonth()]}, ${hh}:${mm}`;
}

function fmtGap(a: string, b: string): string {
    const ms = Math.abs(Date.parse(a) - Date.parse(b));
    if (!isFinite(ms)) return "";
    const totalMin = Math.round(ms / 60000);
    if (totalMin < 1) return "Casi al mismo tiempo";
    if (totalMin < 60) return `${totalMin} min de diferencia`;
    const h = Math.floor(totalMin / 60);
    const m = totalMin % 60;
    return m === 0 ? `${h} h de diferencia` : `${h} h ${m} min de diferencia`;
}

function describeReasons(reasons: string[]): string {
    const text = reasons.join(", ");
    return text.charAt(0).toUpperCase() + text.slice(1);
}

interface SideProps {
    label: string;
    tx: Transaction;
}

function Side({ label, tx }: SideProps) {
    return (
        <View style={s.side}>
            <Text style={s.sideLabel} numberOfLines={2}>{label}</Text>
            <Money
                amount={Math.abs(tx.amount)}
                currency={tx.currency}
                size="sm"
                gradient={false}
                sign="never"
                tone="neutral"
            />
            <Text style={s.sideDate}>{fmtWhen(tx.date)}</Text>
        </View>
    );
}

export function TransferPairsModal({ visible, pairs, transactions, onClose, onChanged }: TransferPairsModalProps) {
    const { width, fontScale } = useWindowDimensions();
    const [done, setDone] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            setDone(new Set());
            setBusy(null);
            setError(null);
        }
    }, [visible]);

    const byId = useMemo(() => {
        const m = new Map<string, Transaction>();
        for (const t of transactions) m.set(t.id, t);
        return m;
    }, [transactions]);

    const items = useMemo(() => {
        const out: Array<{ key: string; pair: TransferPair; out: Transaction; inn: Transaction }> = [];
        for (const pair of pairs) {
            const key = transferPairKey(pair.outId, pair.inId);
            if (done.has(key)) continue;
            const o = byId.get(pair.outId);
            const i = byId.get(pair.inId);
            if (!o || !i) continue;
            out.push({ key, pair, out: o, inn: i });
        }
        return out;
    }, [pairs, byId, done]);

    if (!visible) return null;

    const stacked = width < 360 || fontScale > 1.3;

    const finish = (key: string) => {
        setDone(prev => new Set(prev).add(key));
        onChanged();
    };

    const link = async (key: string, pair: TransferPair) => {
        if (busy) return;
        setBusy(`${key}|link`);
        setError(null);
        try {
            await StorageService.linkTransferPair(pair.outId, pair.inId);
            finish(key);
        } catch (e) {
            console.warn("linkTransferPair error:", e);
            setError("No se pudo marcar la transferencia. No se modificó nada. Probá de nuevo.");
        } finally {
            setBusy(null);
        }
    };

    const dismiss = async (key: string, pair: TransferPair) => {
        if (busy) return;
        setBusy(`${key}|no`);
        setError(null);
        try {
            await StorageService.dismissTransferPair(pair.outId, pair.inId);
            finish(key);
        } catch (e) {
            console.warn("dismissTransferPair error:", e);
            setError("No se pudo guardar tu respuesta. Probá de nuevo.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <GlassSheet onClose={onClose} title="Posibles transferencias propias" icon="swap-horizontal-outline">
            {items.length === 0 ? (
                <View style={s.empty}>
                    <Ionicons name="checkmark-circle-outline" size={44} color={C.accent} />
                    <Text style={s.emptyTitle}>Todo resuelto</Text>
                    <Text style={s.emptySub}>No quedan transferencias por revisar.</Text>
                    <GlassButton label="Cerrar" kind="secondary" onPress={onClose} style={s.emptyBtn} />
                </View>
            ) : (
                <>
                    <Text style={s.intro}>
                        {items.length} {items.length === 1 ? "par de movimientos parece" : "pares de movimientos parecen"} una transferencia entre tus cuentas.
                    </Text>
                    <Text style={s.legend}>
                        Si es una transferencia entre tus propias cuentas, deja de contar como gasto e ingreso.
                    </Text>
                    {!!error && <InlineNotice variant="error" text={error} style={s.notice} />}

                    {items.map(({ key, pair, out, inn }) => {
                        const possible = pair.score < 60 || pair.reasons.some(r => r.startsWith("ambiguo"));
                        const gap = fmtGap(out.date, inn.date);
                        return (
                            <GlassCard key={key} radius={16} blur={false} style={s.card} contentStyle={s.cardContent}>
                                {possible && (
                                    <View style={s.chip}>
                                        <Ionicons name="help-circle-outline" size={12} color={C.warning} />
                                        <Text style={s.chipTxt}>Posible</Text>
                                    </View>
                                )}
                                <View style={[s.sides, stacked && s.sidesStacked]}>
                                    <Side label={`Salió de ${out.bank || "tu banco"}`} tx={out} />
                                    <Side label={`Llegó a ${inn.bank || "tu banco"}`} tx={inn} />
                                </View>
                                {!!gap && (
                                    <View style={s.gapRow}>
                                        <Ionicons name="time-outline" size={14} color={C.textSub} />
                                        <Text style={s.gapTxt}>{gap}</Text>
                                    </View>
                                )}
                                {pair.reasons.length > 0 && (
                                    <Text style={s.reasons}>{describeReasons(pair.reasons)}.</Text>
                                )}
                                <View style={s.actions}>
                                    <GlassButton
                                        label="Sí, es mi transferencia"
                                        icon="swap-horizontal-outline"
                                        onPress={() => { void link(key, pair); }}
                                        loading={busy === `${key}|link`}
                                        disabled={!!busy && busy !== `${key}|link`}
                                    />
                                    <GlassButton
                                        label="No"
                                        kind="secondary"
                                        onPress={() => { void dismiss(key, pair); }}
                                        loading={busy === `${key}|no`}
                                        disabled={!!busy && busy !== `${key}|no`}
                                    />
                                </View>
                            </GlassCard>
                        );
                    })}
                </>
            )}
        </GlassSheet>
    );
}

const s = StyleSheet.create({
    intro: { color: C.text, fontSize: 14, lineHeight: 20, marginBottom: 6 },
    legend: { color: C.textSub, fontSize: 13, lineHeight: 18, marginBottom: 12 },
    notice: { marginBottom: 12 },
    card: { marginBottom: 12 },
    cardContent: { padding: 14, gap: 12 },
    chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        alignSelf: "flex-start",
        borderWidth: 1,
        borderColor: C.warning + "55",
        backgroundColor: C.warning + "22",
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
    },
    chipTxt: { color: C.warning, fontSize: 11, fontWeight: "800" },
    sides: { flexDirection: "row", gap: 10 },
    sidesStacked: { flexDirection: "column" },
    side: {
        flex: 1,
        minWidth: 0,
        gap: 3,
        padding: 10,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: C.glassBorder,
    },
    sideLabel: { color: C.textSub, fontSize: 11, fontWeight: "800" },
    sideDate: { color: C.text, fontSize: 12 },
    gapRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6 },
    gapTxt: { color: C.textSub, fontSize: 12, flexShrink: 1 },
    reasons: { color: C.textSub, fontSize: 12, lineHeight: 17 },
    actions: { gap: 8 },
    empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
    emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
    emptySub: { color: C.textSub, fontSize: 13, textAlign: "center" },
    emptyBtn: { alignSelf: "stretch", marginTop: 8 },
});

export default TransferPairsModal;
