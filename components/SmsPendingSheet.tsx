import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { StorageService } from "../services/storage";
import type { Account, CreditInstallment, FixedExpense, IncomeSource, Transaction, UserSettings } from "../services/storage";
import { reviewImportedSms } from "../services/BankSmsParser";
import type { SmsReviewItem } from "../services/BankSmsParser";
import type { SyncResult } from "../services/SmsService";
import { findFixedFusions, matchFixedExpenses } from "../services/FixedExpenseMatcher";
import type { FixedMatch } from "../services/FixedExpenseMatcher";
import { fixedCycleConfig } from "../services/FixedCycle";
import { findManualSmsDuplicates } from "../services/DuplicateDetector";
import type { DupPair } from "../services/DuplicateDetector";
import { findTransferPairs } from "../services/TransferPairs";
import type { TransferPair } from "../services/TransferPairs";
import { findUnpairedTransfers } from "../services/TransferQuestions";
import type { UnpairedTransfer } from "../services/TransferQuestions";
import { groupUnassigned } from "../services/AccountLinking";
import { incomeProposalsTitle, liveIncomeProposals } from "../services/IncomeSourceView";
import type { IncomeProposal } from "../services/IncomeSources";
import { sanitizePayRules } from "../services/PayCalendar";
import { liveCardPaymentProposals } from "../services/CardStatement";
import type { CardPaymentProposal } from "../services/CardStatement";
import { GlassSheet } from "./GlassSheet";
import { GlassCard } from "./GlassCard";
import { GlassButton } from "./GlassButton";
import SmsReviewModal from "./SmsReviewModal";
import SmsInboxModal from "./SmsInboxModal";
import DuplicateMergeModal from "./DuplicateMergeModal";
import FixedExpenseMatchModal from "./FixedExpenseMatchModal";
import TransferPairsModal from "./TransferPairsModal";
import IncomeProposalsModal from "./IncomeProposalsModal";
import UnassignedAccountsModal from "./UnassignedAccountsModal";
import CardPaymentProposalsModal from "./CardPaymentProposalsModal";
import TransferQuestionsModal from "./TransferQuestionsModal";

type IoniconName = keyof typeof Ionicons.glyphMap;
type Kind = "review" | "dups" | "fixed" | "transfers" | "transferq" | "income" | "cardpay" | "unassigned" | "inbox";
// 'sheet' = la hoja visible; 'none' = pausa entre dos ventanas (Android no maneja dos Modal a la vez)
type ViewState = "sheet" | "none" | Kind;

const SWITCH_DELAY_MS = 250;

/** Cantidad total de pendientes de una sincronización (para el botón "Revisar (N)" y el aviso de Inicio). */
export function countPending(r: SyncResult): number {
    return r.reviewItems.length
        + r.duplicates.length
        + r.fixedProposals.length
        + r.transferPairs.length
        + (r.incomeProposals?.length ?? 0)
        + (r.cardPaymentProposals?.length ?? 0)
        + (r.transferQuestions?.length ?? 0)
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
                    <Text style={s.rowTitle}>{title}</Text>
                    <Text style={s.rowHint}>{hint}</Text>
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
    visible, result: syncResult, settings, accounts, transactions, fixedExpenses, onClose, onChanged,
}: SmsPendingSheetProps) {
    const [view, setView] = useState<ViewState>("sheet");
    // 'sync' = solo lo que trajo la sincronización que abrió la hoja; 'all' = todo lo guardado (también períodos anteriores).
    const [scope, setScope] = useState<"sync" | "all">("sync");
    const result = scope === "all" ? null : syncResult;
    const [dupIgnored, setDupIgnored] = useState<string[]>([]);
    const [keptIds, setKeptIds] = useState<string[]>([]);
    const [inboxCount, setInboxCount] = useState(0);
    const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
    const [insts, setInsts] = useState<CreditInstallment[]>([]);
    const [tick, setTick] = useState(0);
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const clearTimer = () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };

    // Cada vez que se abre: vuelve a la hoja y recarga lo persistido (ignorados, "conservar", buzón).
    useEffect(() => {
        if (!visible) { clearTimer(); return; }
        setView("sheet");
        setScope("sync");
        setTick(t => t + 1);
        return clearTimer;
    }, [visible]);

    useEffect(() => {
        if (!visible) return;
        let cancelled = false;
        (async () => {
            try {
                const [ign, kept, inbox, sources, instList] = await Promise.all([
                    StorageService.getDupIgnored(),
                    StorageService.getSmsReviewKept(),
                    StorageService.getSmsInbox(),
                    StorageService.getIncomeSources(),
                    StorageService.getCreditInstallments(),
                ]);
                if (cancelled) return;
                setDupIgnored(ign);
                setKeptIds(kept);
                setInboxCount(inbox.length);
                setIncomeSources(sources);
                setInsts(instList);
            } catch (e) {
                console.warn("[SmsPendingSheet] carga:", e);
            }
        })();
        return () => { cancelled = true; };
    }, [visible, tick]);

    const txIds = useMemo(() => new Set(transactions.map(t => t.id)), [transactions]);

    // Gastos fijos por confirmar: pagos que podrían ser un gasto fijo, o el mismo cobro que un registro
    // manual de "marcar pagado" (con manualId). Con resultado se filtran los vigentes; sin resultado se recalculan.
    const fixedMatches: FixedMatch[] = useMemo(() => {
        if (!visible) return [];
        try {
            if (result) {
                return result.fixedProposals.filter(m => {
                    if (m.manualId) return txIds.has(m.manualId) && txIds.has(m.txId);
                    const fe = fixedExpenses.find(e => e.id === m.expenseId);
                    return !!fe && !fe.isPaid && txIds.has(m.txId);
                });
            }
            const ignored = new Set(dupIgnored);
            const cycle = fixedCycleConfig(settings);
            const fusions: FixedMatch[] = findFixedFusions(transactions, fixedExpenses, { cycle, ignored }).map(f => ({
                expenseId: f.expenseId, txId: f.smsId, manualId: f.manualId, score: f.score, auto: false, reasons: f.reasons,
            }));
            const proposals = matchFixedExpenses(
                transactions.filter(t => t.source === "sms"), fixedExpenses, transactions, new Date(), { cycle, ignored },
            );
            return [...fusions, ...proposals];
        } catch (e) {
            console.warn("[SmsPendingSheet] gastos fijos:", e);
            return [];
        }
    }, [visible, result, transactions, fixedExpenses, txIds, dupIgnored, settings]);

    // Un registro manual que ya se ofrece unir con su SMS como gasto fijo no se repite como duplicado.
    const fusedManualIds = useMemo(
        () => new Set(fixedMatches.filter(m => !!m.manualId).map(m => m.manualId as string)),
        [fixedMatches],
    );

    // Duplicados: con resultado se filtran los que siguen vigentes; sin resultado se recalculan.
    const dupPairs: DupPair[] = useMemo(() => {
        if (!visible) return [];
        try {
            const pairs = result
                ? result.duplicates.filter(p => txIds.has(p.manualId) && txIds.has(p.smsId))
                : findManualSmsDuplicates(transactions, new Set(dupIgnored));
            return pairs.filter(p => !fusedManualIds.has(p.manualId));
        } catch (e) {
            console.warn("[SmsPendingSheet] duplicados:", e);
            return [];
        }
    }, [visible, result, transactions, txIds, dupIgnored, fusedManualIds]);

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

    // «¿A qué cuenta fue?»: transferencias de SMS sin su otra mitad (pasadas 36 h o sin contraparte posible). Siempre se
    // recalcula con los movimientos vigentes; solo hay pregunta si hay al menos 2 cuentas que no sean tarjeta.
    const transferQuestions: UnpairedTransfer[] = useMemo(() => {
        if (!visible) return [];
        try {
            return findUnpairedTransfers(transactions, accounts, new Set(dupIgnored));
        } catch (e) {
            console.warn("[SmsPendingSheet] ¿a qué cuenta fue?:", e);
            return [];
        }
    }, [visible, transactions, accounts, dupIgnored]);

    // «¿Es tu sueldo?»: con resultado se revisan solo los ingresos de esa sincronización; sin resultado, todos los
    // ingresos de SMS sin fuente. Siempre se vuelve a correr matchIncome, así que lo ya resuelto desaparece.
    const incomeProposals: IncomeProposal[] = useMemo(() => {
        if (!visible) return [];
        try {
            return liveIncomeProposals(
                transactions, incomeSources, sanitizePayRules(settings.payRules), new Set(dupIgnored),
                result ? result.incomeProposals.map(p => p.txId) : null,
            );
        } catch (e) {
            console.warn("[SmsPendingSheet] ingresos:", e);
            return [];
        }
    }, [visible, result, transactions, incomeSources, dupIgnored, settings.payRules]);

    // «¿Es el pago de tu tarjeta?»: salidas de la cuenta pagadora que se parecen a lo que falta de un estado.
    // Con resultado se revisan solo las de esa sincronización; sin resultado, todas las de SMS. Siempre se recalcula.
    const cardPayProposals: CardPaymentProposal[] = useMemo(() => {
        if (!visible) return [];
        try {
            const cards = accounts.filter(a => a.type === "credit" && a.isActive);
            return liveCardPaymentProposals(
                transactions, cards, insts, new Set(dupIgnored),
                result ? new Set((result.cardPaymentProposals ?? []).map(p => p.outId)) : null, new Date(),
            );
        } catch (e) {
            console.warn("[SmsPendingSheet] pago de tarjeta:", e);
            return [];
        }
    }, [visible, result, transactions, accounts, insts, dupIgnored]);

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
                const incomeRules = await StorageService.getIncomeRules();
                const items = reviewImportedSms(transactions, new Set(keptIds), { merchantRules: rules, incomeRules });
                if (!cancelled) setLiveReview(items);
            } catch (e) {
                console.warn("[SmsPendingSheet] dudosos:", e);
                if (!cancelled) setLiveReview([]);
            }
        })();
        return () => { cancelled = true; };
    }, [visible, result, transactions, keptIds, txIds]);

    const total = liveReview.length + dupPairs.length + fixedMatches.length
        + transferPairs.length + transferQuestions.length + incomeProposals.length + cardPayProposals.length + unassignedCount + inboxCount;

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

    const canWiden = syncResult !== null && scope === "sync";
    const widenBlock = canWiden ? (
        <View style={s.widenWrap}>
            <GlassButton
                kind="ghost"
                icon="time-outline"
                label="Revisar también lo de antes"
                onPress={() => { setScope("all"); setTick(t => t + 1); }}
            />
            <Text style={s.widenHint}>Incluye movimientos de sincronizaciones anteriores, también del período anterior.</Text>
        </View>
    ) : null;

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
                                {total === 1 ? "Tienes 1 cosa por revisar." : `Tienes ${total} cosas por revisar.`} Toca una fila para resolverla.
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
                            {transferQuestions.length > 0 && (
                                <PendingRow
                                    icon="swap-horizontal-outline"
                                    title="¿A qué cuenta fue?"
                                    hint="Transferencias del banco sin su otra mitad: elige la cuenta"
                                    count={transferQuestions.length}
                                    onPress={() => goTo("transferq")}
                                />
                            )}
                            {incomeProposals.length > 0 && (
                                <PendingRow
                                    icon="cash-outline"
                                    title={incomeProposalsTitle(incomeProposals)}
                                    hint="Depósitos que se parecen a una de tus fuentes de ingreso"
                                    count={incomeProposals.length}
                                    onPress={() => goTo("income")}
                                />
                            )}
                            {cardPayProposals.length > 0 && (
                                <PendingRow
                                    icon="card-outline"
                                    title="¿Es el pago de tu tarjeta?"
                                    hint="Salidas de tu cuenta que parecen el pago de una tarjeta"
                                    count={cardPayProposals.length}
                                    onPress={() => goTo("cardpay")}
                                />
                            )}
                            {unassignedCount > 0 && (
                                <PendingRow
                                    icon="card-outline"
                                    title="Compras sin cuenta"
                                    hint="Asígnalas a una cuenta para organizarlas por cuenta"
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
                    {widenBlock}
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
                settings={settings}
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
            <TransferQuestionsModal
                visible={view === "transferq"}
                items={transferQuestions}
                transactions={transactions}
                accounts={accounts}
                exchangeRate={settings.exchangeRate}
                onClose={backToSheet}
                onChanged={childChanged}
            />
            <IncomeProposalsModal
                visible={view === "income"}
                proposals={incomeProposals}
                transactions={transactions}
                onClose={backToSheet}
                onChanged={childChanged}
            />
            <CardPaymentProposalsModal
                visible={view === "cardpay"}
                proposals={cardPayProposals}
                transactions={transactions}
                accounts={accounts}
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
    widenWrap: { marginTop: 4, marginBottom: 6 },
    widenHint: { color: C.textSub, fontSize: 12, lineHeight: 17, textAlign: "center", marginTop: 2 },
});
