import React, { useEffect, useMemo, useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { Account, StorageService, Transaction } from "../services/storage";
import { movableAccounts } from "../services/TransferQuestions";
import type { UnpairedTransfer } from "../services/TransferQuestions";
import { findManualTransferFor, reliableConversion, suggestToAmount } from "../services/TransferForm";
import { formatMoney } from "../services/format";
import { GlassCard } from "./GlassCard";
import { GlassSheet } from "./GlassSheet";
import { GlassButton } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";
import { Money } from "./Money";

export interface TransferQuestionsModalProps {
    visible: boolean;
    items: UnpairedTransfer[];
    transactions: Transaction[];
    accounts: Account[];
    /** Tipo de cambio de Ajustes (Q por USD): sugiere lo que recibió una cuenta de otra moneda. */
    exchangeRate: number;
    onClose: () => void;
    onChanged: () => void;
}

type NoticeState = { variant: "success" | "error"; text: string };

function shortDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-GT", { day: "numeric", month: "short", year: "numeric" });
}

/**
 * «¿A qué cuenta fue?»: transferencias del banco (SMS) que no tienen su otra mitad. La persona elige la cuenta propia a
 * la que fue (o de la que vino) y el movimiento pasa a ser una transferencia entre sus cuentas (no es gasto ni ingreso);
 * «A otra persona» / «Ingreso externo» lo deja como está y no vuelve a preguntar.
 */
export function TransferQuestionsModal({ visible, items, transactions, accounts, exchangeRate, onClose, onChanged }: TransferQuestionsModalProps) {
    // Ids ya resueltos en esta ventana: se ocultan al instante, sin esperar a que el padre recargue.
    const [resolved, setResolved] = useState<Set<string>>(new Set());
    const [busy, setBusy] = useState<string | null>(null);
    const [notice, setNotice] = useState<NoticeState | null>(null);

    useEffect(() => {
        if (visible) { setResolved(new Set()); setBusy(null); setNotice(null); }
    }, [visible]);

    const txById = useMemo(() => new Map(transactions.map(t => [t.id, t] as const)), [transactions]);
    const choices = useMemo(() => movableAccounts(accounts), [accounts]);
    const rows = useMemo(() => items.filter(i => !resolved.has(i.txId) && txById.has(i.txId)), [items, resolved, txById]);

    if (!visible) return null;

    const done = (id: string, text: string) => {
        setResolved(prev => new Set(prev).add(id));
        setNotice({ variant: "success", text });
        onChanged();
    };

    const pick = async (item: UnpairedTransfer, acc: Account) => {
        if (busy) return;
        setBusy(`${item.txId}|${acc.id}`);
        setNotice(null);
        try {
            const toAmount = item.direction === "out" && item.currency !== acc.currency
                ? suggestToAmount(item.amount, item.currency, acc.currency, exchangeRate) ?? undefined
                : undefined;
            await StorageService.assignTransferDestination(item.txId, acc.id, toAmount);
            done(item.txId, item.direction === "out"
                ? `Listo: la salida fue a «${acc.name}». Ya no cuenta como gasto.`
                : `Listo: la entrada vino de «${acc.name}». Ya no cuenta como ingreso.`);
        } catch (e) {
            console.warn("assignTransferDestination error:", e);
            setNotice({ variant: "error", text: "No se pudo guardar. No se modificó nada. Prueba de nuevo." });
        } finally {
            setBusy(null);
        }
    };

    const other = async (item: UnpairedTransfer) => {
        if (busy) return;
        setBusy(`${item.txId}|other`);
        setNotice(null);
        try {
            await StorageService.dismissTransferQuestion(item.txId);
            done(item.txId, "Listo: se queda como está y no se vuelve a preguntar.");
        } catch (e) {
            console.warn("dismissTransferQuestion error:", e);
            setNotice({ variant: "error", text: "No se pudo guardar. Prueba de nuevo." });
        } finally {
            setBusy(null);
        }
    };

    // Ya la había registrado a mano: se queda la suya y se descarta el SMS repetido.
    const mergeWithManual = async (item: UnpairedTransfer) => {
        if (busy) return;
        setBusy(`${item.txId}|merge`);
        setNotice(null);
        try {
            await StorageService.deleteTransaction(item.txId);
            done(item.txId, "Listo: se quedó la transferencia que registraste y se descartó el SMS repetido.");
        } catch (e) {
            console.warn("merge manual transfer error:", e);
            setNotice({ variant: "error", text: "No se pudo unir. No se modificó nada. Prueba de nuevo." });
        } finally {
            setBusy(null);
        }
    };

    return (
        <GlassSheet onClose={onClose} title="¿A qué cuenta fue?" icon="swap-horizontal-outline">
            <InlineNotice
                variant="info"
                text="Mover dinero entre tus cuentas no es un gasto ni un ingreso. Elige la cuenta y la app lo deja como transferencia."
                style={s.notice}
            />
            {!!notice && <InlineNotice variant={notice.variant} text={notice.text} style={s.notice} />}

            {rows.length === 0 ? (
                <View style={s.empty}>
                    <Ionicons name="checkmark-circle-outline" size={44} color={C.accent} />
                    <Text style={s.emptyTitle}>Todo resuelto</Text>
                    <Text style={s.emptySub}>No quedan transferencias por aclarar.</Text>
                    <GlassButton label="Cerrar" kind="secondary" onPress={onClose} style={s.emptyBtn} />
                </View>
            ) : (
                rows.map(item => {
                    const tx = txById.get(item.txId) as Transaction;
                    const out = item.direction === "out";
                    const manual = findManualTransferFor(tx, transactions);
                    const manualLabel = manual
                        ? `${manual.description} · ${shortDate(manual.date)} · ${formatMoney(manual.amount, manual.currency)}`
                        : "";
                    const cands = choices.filter(a => a.id !== tx.accountId);
                    return (
                        <GlassCard key={item.txId} radius={16} blur={false} style={s.card} contentStyle={s.cardContent}>
                            <View style={s.head}>
                                <View style={s.headBody}>
                                    <Text style={s.title}>{out ? "Salida de dinero" : "Entrada de dinero"}{item.bank ? ` · ${item.bank}` : ""}</Text>
                                    <Text style={s.date}>{shortDate(item.date)}</Text>
                                </View>
                                <Money
                                    amount={item.amount}
                                    currency={item.currency}
                                    size="sm"
                                    gradient={false}
                                    sign="never"
                                    align="right"
                                    prefix={out ? "-" : "+"}
                                    tone={out ? "expense" : "income"}
                                    containerStyle={s.money}
                                />
                            </View>

                            {!!manual && (
                                <InlineNotice
                                    variant="info"
                                    text={`Parece la transferencia que ya registraste: ${manualLabel}. Si es la misma, únelas: se queda la tuya y se descarta este SMS repetido.`}
                                    actionLabel="Unirlas"
                                    onAction={() => { void mergeWithManual(item); }}
                                />
                            )}

                            <Text style={s.hint}>{out ? "¿A qué cuenta tuya fue?" : "¿De qué cuenta tuya vino?"}</Text>
                            <View style={s.chips}>
                                {cands.map(acc => {
                                    const blocked = item.currency !== acc.currency && !reliableConversion(item.currency, acc.currency);
                                    const chipBusy = busy === `${item.txId}|${acc.id}`;
                                    return (
                                        <Pressable
                                            key={acc.id}
                                            onPress={() => { void pick(item, acc); }}
                                            disabled={!!busy || blocked}
                                            accessibilityRole="button"
                                            accessibilityLabel={`${out ? "Fue a" : "Vino de"} ${acc.name}`}
                                            accessibilityState={{ disabled: !!busy || blocked, busy: chipBusy }}
                                            style={[s.chip, (!!busy && !chipBusy || blocked) && s.chipDim]}
                                        >
                                            <Ionicons name="wallet-outline" size={14} color={C.primaryLight} />
                                            <Text style={s.chipTxt} numberOfLines={1}>{acc.name}</Text>
                                        </Pressable>
                                    );
                                })}
                                <Pressable
                                    onPress={() => { void other(item); }}
                                    disabled={!!busy}
                                    accessibilityRole="button"
                                    accessibilityLabel={out ? "Fue a otra persona" : "Fue un ingreso externo"}
                                    accessibilityState={{ disabled: !!busy }}
                                    style={[s.chip, s.chipOther, !!busy && s.chipDim]}
                                >
                                    <Ionicons name="close-circle-outline" size={14} color={C.textSub} />
                                    <Text style={s.chipTxt}>{out ? "A otra persona" : "Ingreso externo"}</Text>
                                </Pressable>
                            </View>
                        </GlassCard>
                    );
                })
            )}
        </GlassSheet>
    );
}

const s = StyleSheet.create({
    notice: { marginBottom: 12 },
    card: { marginBottom: 12 },
    cardContent: { padding: 14, gap: 10 },
    head: { flexDirection: "row", alignItems: "center", gap: 10 },
    headBody: { flex: 1, flexShrink: 1 },
    title: { color: C.text, fontSize: 14, fontWeight: "800" },
    date: { color: C.textSub, fontSize: 12, marginTop: 2 },
    money: { width: 110 },
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
        borderColor: C.glassActiveBorder,
        backgroundColor: C.glassActive,
    },
    chipOther: { borderColor: C.glassBorder, backgroundColor: C.glassInput, borderStyle: "dashed" },
    chipDim: { opacity: 0.5 },
    chipTxt: { color: C.text, fontSize: 13, fontWeight: "700", flexShrink: 1 },
    empty: { alignItems: "center", gap: 8, paddingVertical: 24 },
    emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "900" },
    emptySub: { color: C.textSub, fontSize: 13, textAlign: "center" },
    emptyBtn: { alignSelf: "stretch", marginTop: 8 },
});

export default TransferQuestionsModal;
