import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { StorageService } from "../services/storage";
import type { Account, FixedExpense, Transaction, UserSettings } from "../services/storage";
import { reviewImportedSms } from "../services/BankSmsParser";
import type { SmsReviewItem } from "../services/BankSmsParser";
import type { SyncResult } from "../services/SmsService";
import type { FixedMatch } from "../services/FixedExpenseMatcher";
import { findManualSmsDuplicates } from "../services/DuplicateDetector";
import type { DupPair } from "../services/DuplicateDetector";
import { findTransferPairs } from "../services/TransferPairs";
import type { TransferPair } from "../services/TransferPairs";
import { groupUnassigned } from "../services/AccountLinking";
import { GlassSheet } from "./GlassSheet";
import { GlassCard } from "./GlassCard";
import { GlassButton } from "./GlassButton";
import SmsReviewModal from "./SmsReviewModal";
import SmsInboxModal from "./SmsInboxModal";
import DuplicateMergeModal from "./DuplicateMergeModal";
import FixedExpenseMatchModal from "./FixedExpenseMatchModal";
import TransferPairsModal from "./TransferPairsModal";
import UnassignedAccountsModal from "./UnassignedAccountsModal";

type IoniconName = keyof typeof Ionicons.glyphMap;
type Kind = "review" | "dups" | "fixed" | "transfers" | "unassigned" | "inbox";
// 'sheet' = la hoja visible; 'none' = pausa entre dos ventanas (Android no maneja dos Modal a la vez)
type ViewState = "sheet" | "none" | Kind;

const SWITCH_DELAY_MS = 250;

/** Cantidad total de pendientes de una sincronización (para el botón "Revisar (N)" y el aviso de Inicio). */
export function countPending(r: SyncResult): number {
    return r.reviewItems.length
        + r.duplicates.length
        + r.fixedProposals.length
        + r.transferPairs.length
        + r.unassignedCount
        + r.inbox.length;
}

export interface SmsPendingSheetProps {
    visible: boolean;
    /** Resultado de la sincronización que originó la apertura; null si se abre desde Ajustes. */
    result: SyncResult | null;
    settings: UserSettings;
    accounts: Account[];
    transactions: Transaction[];
    fixedExpenses: FixedExpense[];
    onClose: () => void;
    onChanged: () => void;
}

interface RowProps {
    icon: IoniconName;
    title: string;
    hint: string;
    count: number;
    onPress: () => void;
}

function PendingRow({ icon, title, hint, count, onPress }: RowProps) {
    return (
        <TouchableOpacity
            onPress={onPress}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={`${title}: ${count}. ${hint}`}
        >
            <GlassCard radius={16} blur={false} style={s.rowCard} contentStyle={s.rowContent}>
                <View style={s.rowIcon}>
                    <Ionicons name={icon} size={20} color={C.primaryLight} />
                </View>
                <View style={s.rowBody}>
                    <Text style={s.rowTitle} numberOfLines={2}>{title}</Text>
                    <Text style={s.rowHint} numberOfLines={2}>{hint}</Text>
                </View>
                <View style={s.countBadge}>
                    <Text style={s.countTxt}>{count}</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </GlassCard>
        </TouchableOpacity>
    );
}

export default function SmsPendingSheet({
    visible, result, settings, accounts, transactions, fixedExpenses, onClose, onChanged,
}: SmsPendingSheetProps) {
    const [view, setView] = useState<ViewState>("sheet");
    const [dupIgnored, setDupIgnored] = useState<string[]>([]);
    const [keptIds, setKeptIds] = useState<string[]>([]);
    const [inboxCount, setInboxCount] = useState(0);
    const [tick, setTick] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimer = () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };

    // Cada vez que se abre: vuelve a la hoja y recarga lo persistido (ignorados, "conservar", buzón).
    useEffect(() => {
        if (!visible) { clearTimer(); return; }
        setView("sheet");
        setTick(t => t + 1);
        return clearTimer;
    }, [visible]);

    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        (async () => {
            try {
                const [ign, kept, inbox] = await Promise.all([
                    StorageService.getDupIgnored(),
                    StorageService.getSmsReviewKept(),
                    StorageService.getSmsInbox(),
                ]);
                if (cancelled) return;
                setDupIgnored(ign);
                setKeptIds(kept);
                setInboxCount(inbox.length);
            } catch (e) {
                console.warn("[SmsPendingSheet] carga:", e);
            }
        })();
        return () => { cancelled = true; };
    }, [visible, tick]);

    const txIds = useMemo(() => new Set(transactions.map(t => t.id)), [transactions]);

    // Duplicados: con resultado se filtran los que siguen vigentes; sin resultado se recalculan.
    const dupPairs: DupPair[] = useMemo(() => {
        if (!visible) return [];
        try {
            if (result) return result.duplicates.filter(p => txIds.has(p.manualId) && txIds.has(p.smsId));
            return findManualSmsDuplicates(transactions, new Set(dupIgnored));
        } catch (e) {
            console.warn("[SmsPendingSheet] duplicados:", e);
            return [];
        }
    }, [visible, result, transactions, txIds, dupIgnored]);

    const transferPairs: TransferPair[] = useMemo(() => {
        if (!visible) return [];
        try {
            if (result) {
                const byId = new Map(transactions.map(t => [t.id, t] as const));
                return result.transferPairs.filter(p => {
                    const o = byId.get(p.outId);
                    const i = byId.get(p.inId);
                    return !!o && !!i && !o.transferPairId && !i.transferPairId;
                });
            }
            return findTransferPairs(transactions, new Set(dupIgnored), { accounts }).filter(p => !p.auto);
        } catch (e) {
            console.warn("[SmsPendingSheet] transferencias:", e);
            return [];
        }
    }, [visible, result, transactions, dupIgnored, accounts]);

    const unassignedGroups = useMemo(() => {
        if (!visible) return [];
        // Sin cuentas con banco no hay a dónde vincular (misma regla que la sincronización).
        if (!accounts.some(a => !!a.bankName)) return [];
        return groupUnassigned(transactions);
    }, [visible, transactions, accounts]);
    const unassignedCount = useMemo(
        () => unassignedGroups.reduce((n, g) => n + g.txIds.length, 0),
        [unassignedGroups],
    );

    const fixedMatches: FixedMatch[] = useMemo(() => {
        if (!result) return [];
        return result.fixedProposals.filter(m => {
            const fe = fixedExpenses.find(e => e.id === m.expenseId);
            return !!fe && !fe.isPaid && txIds.has(m.txId);
        });
    }, [result, fixedExpenses, txIds]);

    const [liveReview, setLiveReview] = useState<SmsReviewItem[]>([]);
    useEffect(() => {
        if (!visible) return;
        if (result) {
            setLiveReview(result.reviewItems.filter(i => txIds.has(i.txId)));
            return;
        }
        let cancelled = false;
        (async () => {
            try {
                const rules = await StorageService.getMerchantRules();
                const items = reviewImportedSms(transactions, new Set(keptIds), { merchantRules: rules });
                if (!cancelled) setLiveReview(items);
            } catch (e) {
                console.warn("[SmsPendingSheet] dudosos:", e);
                if (!cancelled) setLiveReview([]);
            }
        })();
        return () => { cancelled = true; };
    }, [visible, result, transactions, keptIds, txIds]);

    const total = liveReview.length + dupPairs.length + fixedMatches.length
        + transferPairs.length + unassignedCount + inboxCount;

    // Una sola ventana a la vez: cerrar la actual y abrir la siguiente con una pausa.
    const goTo = useCallback((next: ViewState) => {
        clearTimer();
        setView("none");
        timerRef.current = setTimeout(() => { setView(next); timerRef.current = null; }, SWITCH_DELAY_MS);
    }, []);
    const backToSheet = useCallback(() => goTo("sheet"), [goTo]);
    const childChanged = useCallback(() => {
        setTick(t => t + 1);
        onChanged();
    }, [onChanged]);

    if (!visible) return null;

    return (
        <>
            {view === "sheet" && (
                <GlassSheet onClose={onClose} title="Centro de revisión" icon="shield-checkmark-outline">
                    {total === 0 ? (
                        <GlassCard radius={16} blur={false} style={s.rowCard} contentStyle={s.emptyContent}>
                            <Ionicons name="checkmark-done-outline" size={30} color={C.success} />
                            <Text style={s.emptyTitle}>Todo al día</Text>
                            <Text style={s.emptyTxt}>No hay movimientos por revisar.</Text>
                        </GlassCard>
                    ) : (
                        <>
                            <Text style={s.intro}>
                                {total === 1 ? "Tenés 1 cosa por revisar." : `Tenés ${total} cosas por revisar.`} Tocá una fila para resolverla.
                            </Text>
                            {liveReview.length > 0 && (
                                <PendingRow
                                    icon="shield-checkmark-outline"
                                    title="Movimientos dudosos"
                                    hint="Importados que conviene corregir o eliminar"
                                    count={liveReview.length}
                                    onPress={() => goTo("review")}
                                />
                            )}
                            {dupPairs.length > 0 && (
                                <PendingRow
                                    icon="copy-outline"
                                    title="Posibles duplicados"
                                    hint="Anotados a mano y también llegaron por SMS"
                                    count={dupPairs.length}
                                    onPress={() => goTo("dups")}
                                />
                            )}
                            {fixedMatches.length > 0 && (
                                <PendingRow
                                    icon="calendar-outline"
                                    title="Gastos fijos por confirmar"
                                    hint="Pagos que podrían ser uno de tus gastos fijos"
                                    count={fixedMatches.length}
                                    onPress={() => goTo("fixed")}
                                />
                            )}
                            {transferPairs.length > 0 && (
                                <PendingRow
                                    icon="repeat-outline"
                                    title="Transferencias entre tus cuentas"
                                    hint="Una salida y una entrada que parecen la misma"
                                    count={transferPairs.length}
                                    onPress={() => goTo("transfers")}
                                />
                            )}
                            {unassignedCount > 0 && (
                                <PendingRow
                                    icon="card-outline"
                                    title="Compras sin cuenta"
                                    hint="Asignalas a una cuenta para que muevan su saldo"
                                    count={unassignedCount}
                                    onPress={() => goTo("unassigned")}
                                />
                            )}
                            {inboxCount > 0 && (
                                <PendingRow
                                    icon="file-tray-outline"
                                    title="Sin clasificar"
                                    hint="Mensajes bancarios que la app no entendió"
                                    count={inboxCount}
                                    onPress={() => goTo("inbox")}
                                />
                            )}
                        </>
                    )}
                    <GlassButton label="Cerrar" kind="secondary" onPress={onClose} style={s.closeBtn} />
                </GlassSheet>
            )}

            <SmsReviewModal
                visible={view === "review"}
                items={liveReview}
                customCategories={settings.customCategories}
                onClose={backToSheet}
                onApplied={() => { childChanged(); backToSheet(); }}
            />
            <DuplicateMergeModal
                visible={view === "dups"}
                pairs={dupPairs}
                transactions={transactions}
                onClose={backToSheet}
                onChanged={childChanged}
            />
            <FixedExpenseMatchModal
                visible={view === "fixed"}
                matches={fixedMatches}
                transactions={transactions}
                fixedExpenses={fixedExpenses}
                onClose={backToSheet}
                onChanged={childChanged}
            />
            <TransferPairsModal
                visible={view === "transfers"}
                pairs={transferPairs}
                transactions={transactions}
                onClose={backToSheet}
                onChanged={childChanged}
            />
            <UnassignedAccountsModal
                visible={view === "unassigned"}
                transactions={transactions}
                accounts={accounts}
                onClose={backToSheet}
                onChanged={childChanged}
            />
            <SmsInboxModal
                visible={view === "inbox"}
                settings={settings}
                onClose={backToSheet}
                onChanged={childChanged}
            />
        </>
    );
}

const s = StyleSheet.create({
    intro: { color: C.textSub, fontSize: 13, lineHeight: 18, marginBottom: 12 },
    rowCard: { marginBottom: 10 },
    rowContent: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
    rowIcon: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", backgroundColor: C.glassActive, borderWidth: 1, borderColor: C.glassActiveBorder },
    rowBody: { flex: 1, flexShrink: 1 },
    rowTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
    rowHint: { color: C.textSub, fontSize: 12, marginTop: 2 },
    countBadge: { minWidth: 28, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 12, alignItems: "center", backgroundColor: C.glassActive, borderWidth: 1, borderColor: C.glassActiveBorder },
    countTxt: { color: C.primaryLight, fontSize: 13, fontWeight: "800" },
    emptyContent: { alignItems: "center", gap: 6, padding: 24 },
    emptyTitle: { color: C.text, fontSize: 16, fontWeight: "800" },
    emptyTxt: { color: C.textSub, fontSize: 13, textAlign: "center" },
    closeBtn: { marginTop: 6 },
});
