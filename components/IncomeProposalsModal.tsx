import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { StorageService } from "../services/storage";
import type { Transaction } from "../services/storage";
import type { IncomeProposal } from "../services/IncomeSources";
import { incomeProposalKey } from "../services/IncomeSourceView";
import { extractIncomeOrigin } from "../services/IncomeOrigin";
import { GlassCard } from "./GlassCard";
import { GlassSheet } from "./GlassSheet";
import { GlassButton } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";
import Money from "./Money";

export interface IncomeProposalsModalProps {
    visible: boolean;
    proposals: IncomeProposal[];
    transactions: Transaction[];
    onClose: () => void;
    onChanged: () => void;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtWhen(stored: string): string {
    const d = new Date(stored);
    if (isNaN(d.getTime())) return "fecha desconocida";
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

/** «¿Es tu sueldo?»: ingresos que se parecen a una fuente pero no alcanzaron para vincularse solos. */
export function IncomeProposalsModal({ visible, proposals, transactions, onClose, onChanged }: IncomeProposalsModalProps) {
    const [done, setDone] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (visible) { setDone(new Set()); setBusy(null); setError(null); }
    }, [visible]);

    const byId = useMemo(() => new Map(transactions.map(t => [t.id, t] as const)), [transactions]);

    const items = useMemo(() => {
        const out: Array<{ key: string; p: IncomeProposal; tx: Transaction }> = [];
        for (const p of proposals) {
            const key = incomeProposalKey(p.txId, p.sourceId);
            if (done.has(key)) continue;
            const tx = byId.get(p.txId);
            if (!tx) continue;
            out.push({ key, p, tx });
        }
        return out;
    }, [proposals, byId, done]);

    if (!visible) return null;

    const finish = (key: string) => {
        setDone(prev => new Set(prev).add(key));
        onChanged();
    };

    const confirm = async (key: string, p: IncomeProposal) => {
        if (busy) return;
        setBusy(`${key}|yes`);
        setError(null);
        try {
            const r = await StorageService.linkIncome(p.txId, p.sourceId, p.occKey);
            if (!r) { setError("No se pudo vincular: el movimiento o la fuente ya no existen."); return; }
            finish(key);
        } catch (e) {
            console.warn("linkIncome error:", e);
            setError("No se pudo vincular el ingreso. No se modificó nada. Prueba de nuevo.");
        } finally {
            setBusy(null);
        }
    };

    const reject = async (key: string) => {
        if (busy) return;
        setBusy(`${key}|no`);
        setError(null);
        try {
            await StorageService.addDupIgnored([key]);
            finish(key);
        } catch (e) {
            console.warn("addDupIgnored (ingreso) error:", e);
            setError("No se pudo guardar tu respuesta. Prueba de nuevo.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <GlassSheet onClose={onClose} title="¿Es de tu fuente de ingreso?" icon="cash-outline">
            {items.length === 0 ? (
                <View style={s.empty}>
                    <Ionicons name="checkmark-circle-outline" size={44} color={C.accent} />
                    <Text style={s.emptyTitle}>Todo resuelto</Text>
                    <Text style={s.emptySub}>No quedan ingresos por confirmar.</Text>
                    <GlassButton label="Cerrar" kind="secondary" onPress={onClose} style={s.emptyBtn} />
                </View>
            ) : (
                <>
                    <Text style={s.intro}>
                        {items.length === 1 ? "Este ingreso se parece" : `Estos ${items.length} ingresos se parecen`} a una de tus fuentes de ingreso.
                    </Text>
                    <Text style={s.legend}>
                        Si lo confirmas, la fuente pasa a «Recibido», el ingreso toma su categoría y, si la fuente mueve tu período, el período empieza ese día.
                    </Text>
                    {!!error && <InlineNotice variant="error" text={error} style={s.notice} />}
                    {items.map(({ key, p, tx }) => {
                        const origin = extractIncomeOrigin(tx.originalSMS);
                        return (
                            <GlassCard key={key} radius={16} blur={false} style={s.card} contentStyle={s.cardContent}>
                                <Text style={s.question}>¿Es tu {p.sourceName}?</Text>
                                <Money amount={tx.amount} currency={tx.currency || "Q"} size="md" sign="never" tone="income" align="left" containerStyle={s.money} />
                                <Text style={s.meta}>
                                    {fmtWhen(tx.date)}{tx.bank ? ` · ${tx.bank}` : ""}
                                </Text>
                                {!!origin && <Text style={s.meta} numberOfLines={2}>De {origin}</Text>}
                                <View style={s.actions}>
                                    <GlassButton
                                        label="Sí, es mi pago"
                                        icon="checkmark-circle-outline"
                                        onPress={() => { void confirm(key, p); }}
                                        loading={busy === `${key}|yes`}
                                        disabled={!!busy && busy !== `${key}|yes`}
                                    />
                                    <GlassButton
                                        label="No"
                                        kind="secondary"
                                        onPress={() => { void reject(key); }}
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
    cardContent: { padding: 14, gap: 4 },
    question: { color: C.textPrimary, fontSize: 16, fontWeight: "900" },
    money: { alignSelf: "stretch", marginTop: 4 },
    meta: { color: C.textSub, fontSize: 12, lineHeight: 17 },
    actions: { gap: 8, marginTop: 10 },
    empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
    emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
    emptySub: { color: C.textSub, fontSize: 13, textAlign: "center" },
    emptyBtn: { alignSelf: "stretch", marginTop: 8 },
});

export default IncomeProposalsModal;
