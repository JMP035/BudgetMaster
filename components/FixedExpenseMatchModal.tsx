import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { FixedExpense, StorageService, Transaction } from "../services/storage";
import type { FixedMatch } from "../services/FixedExpenseMatcher";
import { merchantKey, merchantOfTransaction } from "../services/MerchantRules";
import { formatMoney } from "../services/format";
import { GlassCard } from "./GlassCard";
import { GlassSheet } from "./GlassSheet";
import { GlassButton } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";
import Money from "./Money";

export interface FixedExpenseMatchModalProps {
    visible: boolean;
    matches: FixedMatch[];
    transactions: Transaction[];
    fixedExpenses: FixedExpense[];
    onClose: () => void;
    onChanged: () => void;
}

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtDay(stored: string): string {
    const m = /^(\d{4})-(\d{2})-(\d{2})(T00:00:00(\.000)?Z)?$/.exec(stored);
    const d = m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(stored);
    return isNaN(d.getTime()) ? "fecha desconocida" : `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

/** Q650 si es entero, Q650.50 si no. */
function fmtAmount(n: number, currency: string): string {
    return formatMoney(n, currency, { decimals: Math.abs(n - Math.round(n)) < 0.005 ? 0 : 2 }).replace(/\s/, "");
}

function describeReasons(reasons: string[]): string {
    const text = reasons.join(", ").replace(/<=/g, "hasta ");
    return text.charAt(0).toUpperCase() + text.slice(1);
}

const matchKey = (m: FixedMatch) => `${m.expenseId}|${m.txId}`;

interface Group {
    expense: FixedExpense;
    items: Array<{ match: FixedMatch; tx: Transaction }>;
}

export function FixedExpenseMatchModal({
    visible,
    matches,
    transactions,
    fixedExpenses,
    onClose,
    onChanged,
}: FixedExpenseMatchModalProps) {
    const [done, setDone] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    useEffect(() => {
        if (visible) {
            setDone(new Set());
            setBusy(null);
            setError(null);
            setSuccess(null);
        }
    }, [visible]);

    const groups = useMemo<Group[]>(() => {
        const txById = new Map<string, Transaction>();
        for (const t of transactions) txById.set(t.id, t);
        const feById = new Map<string, FixedExpense>();
        for (const f of fixedExpenses) feById.set(f.id, f);

        const order: string[] = [];
        const map = new Map<string, Group>();
        for (const match of matches) {
            if (done.has(matchKey(match))) continue;
            const tx = txById.get(match.txId);
            const expense = feById.get(match.expenseId);
            if (!tx || !expense) continue;
            let g = map.get(expense.id);
            if (!g) {
                g = { expense, items: [] };
                map.set(expense.id, g);
                order.push(expense.id);
            }
            g.items.push({ match, tx });
        }
        return order.map(id => {
            const g = map.get(id)!;
            g.items.sort((a, b) => b.match.score - a.match.score);
            return g;
        });
    }, [matches, transactions, fixedExpenses, done]);

    if (!visible) return null;

    const confirmMatch = async (match: FixedMatch, tx: Transaction, expense: FixedExpense) => {
        if (busy) return;
        const key = matchKey(match);
        setBusy(`${key}|yes`);
        setError(null);
        setSuccess(null);
        try {
            const learnKey = merchantKey(merchantOfTransaction(tx)) ?? undefined;
            await StorageService.markFixedPaidBySms(match.expenseId, match.txId, learnKey);
            // El gasto ya quedó pagado y el movimiento ya tiene dueño: se van todas las propuestas que los tocan.
            setDone(prev => {
                const next = new Set(prev);
                for (const m of matches) {
                    if (m.expenseId === match.expenseId || m.txId === match.txId) next.add(matchKey(m));
                }
                return next;
            });
            setSuccess(
                learnKey
                    ? `«${expense.name}» quedó pagado. La próxima vez se marcará solo.`
                    : `«${expense.name}» quedó pagado.`,
            );
            onChanged();
        } catch (e) {
            console.warn("markFixedPaidBySms error:", e);
            setError("No se pudo marcar el gasto como pagado. No se modificó nada. Probá de nuevo.");
        } finally {
            setBusy(null);
        }
    };

    const rejectMatch = async (match: FixedMatch) => {
        if (busy) return;
        const key = matchKey(match);
        setBusy(`${key}|no`);
        setError(null);
        setSuccess(null);
        try {
            await StorageService.addDupIgnored([`fx|${match.expenseId}|${match.txId}`]);
            setDone(prev => new Set(prev).add(key));
            onChanged();
        } catch (e) {
            console.warn("addDupIgnored (fx) error:", e);
            setError("No se pudo guardar tu respuesta. Probá de nuevo.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <GlassSheet onClose={onClose} title="Gastos fijos por confirmar" icon="calendar-outline">
            {!!success && <InlineNotice variant="success" text={success} style={s.notice} />}
            {!!error && <InlineNotice variant="error" text={error} style={s.notice} />}

            {groups.length === 0 ? (
                <View style={s.empty}>
                    <Ionicons name="checkmark-circle-outline" size={44} color={C.accent} />
                    <Text style={s.emptyTitle}>Todo resuelto</Text>
                    <Text style={s.emptySub}>No quedan pagos por confirmar.</Text>
                    <GlassButton label="Cerrar" kind="secondary" onPress={onClose} style={s.emptyBtn} />
                </View>
            ) : (
                <>
                    <Text style={s.legend}>
                        Estos pagos del banco se parecen a tus gastos fijos. Si confirmás uno, la app aprende el comercio
                        y la próxima vez lo marca sola.
                    </Text>

                    {groups.map(({ expense, items }) => {
                        const multi = items.length > 1;
                        const feLabel = `«${expense.name}» (${fmtAmount(expense.amount, expense.currency)}, día ${expense.dayOfMonth})`;
                        return (
                            <GlassCard key={expense.id} radius={16} blur={false} style={s.card} contentStyle={s.cardContent}>
                                {multi && (
                                    <Text style={s.pickTitle}>
                                        Hay {items.length} pagos que podrían ser tu gasto fijo {feLabel}. Elegí el correcto.
                                    </Text>
                                )}
                                {items.map(({ match, tx }, idx) => {
                                    const key = matchKey(match);
                                    const merchant = merchantOfTransaction(tx) || tx.description || "un comercio";
                                    const yesKey = `${key}|yes`;
                                    const noKey = `${key}|no`;
                                    return (
                                        <View key={key} style={[s.cand, multi && idx > 0 && s.candSep]}>
                                            <View style={s.candHead}>
                                                <Money
                                                    amount={Math.abs(tx.amount)}
                                                    currency={tx.currency}
                                                    size="sm"
                                                    gradient={false}
                                                    sign="never"
                                                    tone="expense"
                                                    containerStyle={s.candMoney}
                                                />
                                                <Text style={s.candDate}>{fmtDay(tx.date)}</Text>
                                            </View>
                                            <Text style={s.question}>
                                                {multi
                                                    ? `Pago de ${merchant} por ${fmtAmount(tx.amount, tx.currency)} (${fmtDay(tx.date)})`
                                                    : `¿Este pago de ${merchant} de ${fmtAmount(tx.amount, tx.currency)} (${fmtDay(tx.date)}) es tu gasto fijo ${feLabel}?`}
                                            </Text>
                                            {match.reasons.length > 0 && (
                                                <Text style={s.reasons}>
                                                    Por qué coincide: {describeReasons(match.reasons)}.
                                                </Text>
                                            )}
                                            <View style={s.actions}>
                                                <GlassButton
                                                    label="Sí, marcar pagado"
                                                    icon="checkmark-circle-outline"
                                                    onPress={() => { void confirmMatch(match, tx, expense); }}
                                                    loading={busy === yesKey}
                                                    disabled={!!busy && busy !== yesKey}
                                                />
                                                <GlassButton
                                                    label="No"
                                                    kind="secondary"
                                                    onPress={() => { void rejectMatch(match); }}
                                                    loading={busy === noKey}
                                                    disabled={!!busy && busy !== noKey}
                                                />
                                            </View>
                                        </View>
                                    );
                                })}
                            </GlassCard>
                        );
                    })}
                </>
            )}
        </GlassSheet>
    );
}

const s = StyleSheet.create({
    legend: { color: C.textSub, fontSize: 13, lineHeight: 18, marginBottom: 12 },
    notice: { marginBottom: 12 },
    card: { marginBottom: 12 },
    cardContent: { padding: 14, gap: 12 },
    pickTitle: { color: C.text, fontSize: 14, fontWeight: "800", lineHeight: 20 },
    cand: { gap: 8 },
    candSep: { borderTopWidth: 1, borderTopColor: C.glassBorder, paddingTop: 12 },
    candHead: { flexDirection: "row", alignItems: "center", gap: 10 },
    candMoney: { flexShrink: 1 },
    candDate: { color: C.textSub, fontSize: 12 },
    question: { color: C.text, fontSize: 14, lineHeight: 20 },
    reasons: { color: C.textSub, fontSize: 12, lineHeight: 17 },
    actions: { gap: 8, marginTop: 4 },
    empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
    emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
    emptySub: { color: C.textSub, fontSize: 13, textAlign: "center" },
    emptyBtn: { alignSelf: "stretch", marginTop: 8 },
});

export default FixedExpenseMatchModal;
