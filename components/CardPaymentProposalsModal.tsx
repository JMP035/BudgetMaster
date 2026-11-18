import React, { useEffect, useMemo, useState } from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { StorageService } from "../services/storage";
import type { Account, Transaction } from "../services/storage";
import { cardPaymentProposalKey, cutFromKey } from "../services/CardStatement";
import type { CardPaymentProposal } from "../services/CardStatement";
import { formatShortDay } from "../services/BudgetBreakdown";
import { formatMoney } from "../services/format";
import { GlassCard } from "./GlassCard";
import { GlassSheet } from "./GlassSheet";
import { GlassButton } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";
import Money from "./Money";

export interface CardPaymentProposalsModalProps {
    visible: boolean;
    proposals: CardPaymentProposal[];
    transactions: Transaction[];
    accounts: Account[];
    onClose: () => void;
    onChanged: () => void;
}

/** «¿Es el pago de tu tarjeta?»: salidas de tu cuenta pagadora que se parecen a lo que falta de un estado. */
export function CardPaymentProposalsModal({ visible, proposals, transactions, accounts, onClose, onChanged }: CardPaymentProposalsModalProps) {
    const [done, setDone] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (visible) { setDone(new Set()); setBusy(null); setError(null); }
    }, [visible]);

    const items = useMemo(() => {
        const out: Array<{ key: string; p: CardPaymentProposal; card: Account; tx: Transaction }> = [];
        for (const p of proposals) {
            const key = cardPaymentProposalKey(p.outId, p.cardId);
            if (done.has(key)) continue;
            const card = accounts.find(a => a.id === p.cardId);
            const tx = transactions.find(t => t.id === p.outId);
            if (!card || !tx) continue;
            out.push({ key, p, card, tx });
        }
        return out;
    }, [proposals, accounts, transactions, done]);

    if (!visible) return null;

    const finish = (key: string) => {
        setDone(prev => new Set(prev).add(key));
        onChanged();
    };

    const confirm = async (key: string, p: CardPaymentProposal) => {
        if (busy) return;
        setBusy(`${key}|yes`);
        setError(null);
        try {
            await StorageService.confirmCardPaymentProposal(p.outId, p.cardId, p.cutKey);
            finish(key);
        } catch (e) {
            console.warn("confirmCardPaymentProposal error:", e);
            setError("No se pudo registrar el pago. No se modificó nada. Probá de nuevo.");
        } finally {
            setBusy(null);
        }
    };

    const dismiss = async (key: string, p: CardPaymentProposal) => {
        if (busy) return;
        setBusy(`${key}|no`);
        setError(null);
        try {
            await StorageService.dismissCardPaymentProposal(p.outId, p.cardId);
            finish(key);
        } catch (e) {
            console.warn("dismissCardPaymentProposal error:", e);
            setError("No se pudo guardar tu respuesta. Probá de nuevo.");
        } finally {
            setBusy(null);
        }
    };

    return (
        <GlassSheet onClose={onClose} title="¿Es el pago de tu tarjeta?" icon="card-outline">
            {items.length === 0 ? (
                <View style={s.empty}>
                    <Ionicons name="checkmark-circle-outline" size={44} color={C.accent} />
                    <Text style={s.emptyTitle}>Todo resuelto</Text>
                    <Text style={s.emptySub}>No quedan pagos de tarjeta por revisar.</Text>
                    <GlassButton label="Cerrar" kind="secondary" onPress={onClose} style={s.emptyBtn} />
                </View>
            ) : (
                <>
                    <Text style={s.intro}>
                        {items.length === 1 ? "Una salida de tu cuenta se parece" : `${items.length} salidas de tu cuenta se parecen`} a lo que falta pagar de tu tarjeta.
                    </Text>
                    <Text style={s.legend}>
                        Pagar la tarjeta no es un gasto nuevo: si confirmás, deja de contar como gasto y rebaja lo que falta del estado.
                    </Text>
                    {!!error && <InlineNotice variant="error" text={error} style={s.notice} />}
                    {items.map(({ key, p, card, tx }) => {
                        const cut = cutFromKey(p.cutKey);
                        return (
                            <GlassCard key={key} radius={16} blur={false} style={s.card} contentStyle={s.cardContent}>
                                <Text style={s.cardName} numberOfLines={2}>{card.name}</Text>
                                {!!cut && <Text style={s.cardMeta}>Estado al {formatShortDay(cut)} · faltaba {formatMoney(p.remaining, p.currency)}</Text>}
                                <View style={s.amountRow}>
                                    <Text style={s.cardMeta}>{tx.bank ? `Salió de ${tx.bank}` : "Salida de tu cuenta"}</Text>
                                    <Money amount={Math.abs(tx.amount)} currency={tx.currency} size="sm" gradient={false} sign="never" tone="neutral" />
                                </View>
                                <View style={s.actions}>
                                    <GlassButton
                                        label="Sí, es el pago de mi tarjeta"
                                        icon="card-outline"
                                        onPress={() => { void confirm(key, p); }}
                                        loading={busy === `${key}|yes`}
                                        disabled={!!busy && busy !== `${key}|yes`}
                                    />
                                    <GlassButton
                                        label="No"
                                        kind="secondary"
                                        onPress={() => { void dismiss(key, p); }}
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
    cardContent: { padding: 14, gap: 8 },
    cardName: { color: C.text, fontSize: 15, fontWeight: "800" },
    cardMeta: { color: C.textSub, fontSize: 12, flexShrink: 1 },
    amountRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 },
    actions: { gap: 8, marginTop: 4 },
    empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
    emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
    emptySub: { color: C.textSub, fontSize: 13, textAlign: "center" },
    emptyBtn: { alignSelf: "stretch", marginTop: 8 },
});

export default CardPaymentProposalsModal;
