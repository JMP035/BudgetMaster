import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { StorageService, Transaction } from "../services/storage";
import { DupPair, dupPairKey } from "../services/DuplicateDetector";
import { GlassCard } from "./GlassCard";
import { GlassSheet } from "./GlassSheet";
import { GlassButton } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";
import { useGlassDialog } from "./GlassDialogProvider";
import Money from "./Money";

export interface DuplicateMergeModalProps {
    visible: boolean;
    pairs: DupPair[];
    transactions: Transaction[];
    onClose: () => void;
    onChanged: () => void;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

// Un valor solo-fecha (o medianoche UTC) ya ES el día; el resto se lee como instante local.
function toLocalDate(stored: string): Date | null {
    const m = /^(\d{4})-(\d{2})-(\d{2})(T00:00:00(\.000)?Z)?$/.exec(stored);
    if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    const d = new Date(stored);
    return isNaN(d.getTime()) ? null : d;
}

function fmtDay(stored: string): string {
    const d = toLocalDate(stored);
    return d ? `${d.getDate()} ${MONTHS[d.getMonth()]}` : "fecha desconocida";
}

interface SideProps {
    label: string;
    tx: Transaction;
    text: string;
}

function Side({ label, tx, text }: SideProps) {
    return (
        <View style={s.side}>
            <Text style={s.sideLabel} numberOfLines={2}>{label}</Text>
            <Money
                amount={Math.abs(tx.amount)}
                currency={tx.currency}
                size="sm"
                gradient={false}
                sign="never"
                tone={tx.type === "income" ? "income" : "expense"}
            />
            <Text style={s.sideDate}>{fmtDay(tx.date)}</Text>
            <Text style={s.sideDesc} numberOfLines={3}>{text || "Sin descripción"}</Text>
        </View>
    );
}

export function DuplicateMergeModal({ visible, pairs, transactions, onClose, onChanged }: DuplicateMergeModalProps) {
    const { width, fontScale } = useWindowDimensions();
    const dialog = useGlassDialog();
    const [done, setDone] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Cada vez que se abre, la lista local vuelve a empezar desde las props.
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
        const out: Array<{ key: string; pair: DupPair; manual: Transaction; sms: Transaction }> = [];
        for (const pair of pairs) {
            const key = dupPairKey(pair.manualId, pair.smsId);
            if (done.has(key)) continue;
            const manual = byId.get(pair.manualId);
            const sms = byId.get(pair.smsId);
            if (!manual || !sms) continue;
            out.push({ key, pair, manual, sms });
        }
        return out;
    }, [pairs, byId, done]);

    if (!visible) return null;

    const stacked = width < 360 || fontScale > 1.3;

    const finish = (key: string) => {
        setDone(prev => new Set(prev).add(key));
        onChanged();
    };

    const merge = async (key: string, pair: DupPair) => {
        if (busy) return;
        if (pair.ambiguous) {
            const ok = await dialog.confirm({
                title: "Unir de todos modos",
                message: "Este movimiento tiene más de una coincidencia posible. Si no es el correcto, podés separarlos después desde el detalle del movimiento.",
                confirmLabel: "Unir",
                destructive: false,
                variant: "info",
                icon: "git-merge-outline",
            });
            if (!ok) return;
        }
        setBusy(`${key}|merge`);
        setError(null);
        try {
            const next = await StorageService.mergeDuplicate(pair.manualId, pair.smsId);
            if (next.some(t => t.id === pair.manualId)) throw new Error("merge not applied");
            finish(key);
        } catch (e) {
            console.warn("mergeDuplicate error:", e);
            setError("No se pudieron unir los movimientos. No se modificó nada. Probá de nuevo.");
        } finally {
            setBusy(null);
        }
    };

    const ignore = async (key: string) => {
        if (busy) return;
        setBusy(`${key}|ignore`);
        setError(null);
        try {
            await StorageService.addDupIgnored([key]);
            finish(key);
        } catch (e) {
            console.warn("addDupIgnored error:", e);
            setError("No se pudo guardar tu respuesta. Probá de nuevo.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <GlassSheet onClose={onClose} title="Posibles duplicados" icon="copy-outline">
            {items.length === 0 ? (
                <View style={s.empty}>
                    <Ionicons name="checkmark-circle-outline" size={44} color={C.accent} />
                    <Text style={s.emptyTitle}>Todo resuelto</Text>
                    <Text style={s.emptySub}>No quedan movimientos duplicados por revisar.</Text>
                    <GlassButton label="Cerrar" kind="secondary" onPress={onClose} style={s.emptyBtn} />
                </View>
            ) : (
                <>
                    <Text style={s.intro}>
                        {items.length} {items.length === 1 ? "par parece" : "pares parecen"} el mismo movimiento anotado dos veces.
                    </Text>
                    <Text style={s.legend}>
                        Se conserva tu descripción y categoría; monto, fecha y banco vienen del SMS.
                    </Text>
                    {!!error && <InlineNotice variant="error" text={error} style={s.notice} />}

                    {items.map(({ key, pair, manual, sms }) => {
                        const smsBank = sms.bank ? sms.bank : "tu banco";
                        const smsText = sms.merchant || sms.description;
                        return (
                            <GlassCard key={key} radius={16} blur={false} style={s.card} contentStyle={s.cardContent}>
                                {pair.ambiguous && (
                                    <View style={s.chip}>
                                        <Ionicons name="help-circle-outline" size={12} color={C.warning} />
                                        <Text style={s.chipTxt}>Posible</Text>
                                    </View>
                                )}
                                <View style={[s.sides, stacked && s.sidesStacked]}>
                                    <Side label="Anotado a mano" tx={manual} text={manual.description} />
                                    <Side label={`Del SMS de ${smsBank}`} tx={sms} text={smsText} />
                                </View>
                                <View style={s.actions}>
                                    <GlassButton
                                        label="Unir"
                                        icon="git-merge-outline"
                                        onPress={() => { void merge(key, pair); }}
                                        loading={busy === `${key}|merge`}
                                        disabled={!!busy && busy !== `${key}|merge`}
                                    />
                                    <GlassButton
                                        label="No son el mismo"
                                        kind="secondary"
                                        onPress={() => { void ignore(key); }}
                                        loading={busy === `${key}|ignore`}
                                        disabled={!!busy && busy !== `${key}|ignore`}
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
    sideDate: { color: C.textSub, fontSize: 12 },
    sideDesc: { color: C.text, fontSize: 13, fontWeight: "700", lineHeight: 18 },
    actions: { gap: 8 },
    empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
    emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
    emptySub: { color: C.textSub, fontSize: 13, textAlign: "center" },
    emptyBtn: { alignSelf: "stretch", marginTop: 8 },
});

export default DuplicateMergeModal;
