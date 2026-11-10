import React, { useCallback, useEffect, useRef, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { StorageService } from "../services/storage";
import type { FixedExpense, Transaction, UserSettings } from "../services/storage";
import { findPastSmsForFixed, rankFixedForTx } from "../services/FixedExpenseMatcher";
import type { PastSmsForFixed } from "../services/FixedExpenseMatcher";
import { FE_TX_PREFIX, monthKey, occurrenceKeyFor, storedToLocalDate } from "../services/FixedCycle";
import { merchantKey, merchantOfTransaction } from "../services/MerchantRules";
import { findBrand } from "../services/GuatemalaBrands";
import { NotificationService } from "../services/NotificationService";
import { isSmsFeatureOn } from "../services/features";
import { formatMoney } from "../services/format";
import { GlassSheet } from "./GlassSheet";
import { GlassCard } from "./GlassCard";
import { GlassButton, GlassButtonGroup } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";
import type { InlineNoticeVariant } from "./InlineNotice";
import { useGlassDialog } from "./GlassDialogProvider";
import FixedExpenseModal from "./FixedExpenseModal";
import Money from "./Money";

// 'none' = pausa entre dos ventanas (Android no maneja dos Modal a la vez)
type Stage = "pick" | "history" | "create" | "done" | "none";

const SWITCH_DELAY_MS = 250;
/** Desde este puntaje el gasto fijo se marca como «Sugerido» (mismo umbral que las propuestas). */
const SUGGEST_SCORE = 45;

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtDay(stored: string, withYear = false): string {
    const d = storedToLocalDate(stored);
    if (!d) return "fecha desconocida";
    return `${d.getDate()} ${MONTHS[d.getMonth()]}${withYear ? ` ${d.getFullYear()}` : ""}`;
}

function describeReasons(reasons: string[]): string {
    const text = reasons.join(", ").replace(/<=/g, "hasta ");
    return text.charAt(0).toUpperCase() + text.slice(1);
}

function titleCase(s: string): string {
    return s.toLowerCase().replace(/(^|\s)(\S)/g, (_m, sp: string, ch: string) => sp + ch.toUpperCase());
}

interface Notice { variant: InlineNoticeVariant; text: string; }

export interface FixedExpenseLinkSheetProps {
    visible: boolean;
    tx: Transaction;
    transactions: Transaction[];
    fixedExpenses: FixedExpense[];
    settings: UserSettings;
    initialMode?: "pick" | "history";
    /** Gasto fijo del que se buscan pagos anteriores (modo history). */
    expenseId?: string;
    onClose: () => void;
    onChanged: (txs: Transaction[], fes: FixedExpense[]) => void;
}

export default function FixedExpenseLinkSheet({
    visible, tx, transactions, fixedExpenses, settings, initialMode = "pick", expenseId, onClose, onChanged,
}: FixedExpenseLinkSheetProps) {
    const dialog = useGlassDialog();
    const smsOn = isSmsFeatureOn(settings);
    const [stage, setStage] = useState<Stage>(initialMode);
    const [data, setData] = useState({ txs: transactions, fes: fixedExpenses });
    const [busy, setBusy] = useState(false);
    const [notices, setNotices] = useState<Notice[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [historyFe, setHistoryFe] = useState<FixedExpense | null>(null);
    const [past, setPast] = useState<PastSmsForFixed[]>([]);
    const [checked, setChecked] = useState<Set<string>>(new Set());
    const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savingRef = useRef(false);

    const merchant = merchantOfTransaction(tx);
    const merchantLabel = merchant || tx.description || "este comercio";
    const learnKey = merchantKey(merchant);

    const clearTimer = () => {
        if (timerRef.current) { clearTimeout(timerRef.current); timerRef.current = null; }
    };
    useEffect(() => clearTimer, []);

    /** Una sola ventana a la vez: cierra la actual y abre la siguiente tras una pausa. */
    const switchTo = useCallback((next: Stage) => {
        clearTimer();
        setStage("none");
        timerRef.current = setTimeout(() => { setStage(next); timerRef.current = null; }, SWITCH_DELAY_MS);
    }, []);

    const buildPast = useCallback((fe: FixedExpense, txs: Transaction[]): PastSmsForFixed[] => {
        if (!learnKey) return [];
        const beforeKey = occurrenceKeyFor(fe.dayOfMonth, tx.date);
        if (!beforeKey) return [];
        return findPastSmsForFixed(fe, txs, { key: learnKey, excludeTxId: tx.id, beforeKey });
    }, [learnKey, tx.id, tx.date]);

    const enterHistory = useCallback((fe: FixedExpense, found: PastSmsForFixed[]) => {
        setHistoryFe(fe);
        setPast(found);
        setChecked(new Set(found.map(p => p.tx.id)));
    }, []);

    // Cada vez que se abre: vuelve al modo inicial con los datos de las props.
    useEffect(() => {
        if (!visible) { clearTimer(); return; }
        savingRef.current = false;
        setBusy(false);
        setNotices([]);
        setError(null);
        setData({ txs: transactions, fes: fixedExpenses });
        if (initialMode === "history") {
            const fe = fixedExpenses.find(e => e.id === expenseId);
            const found = fe ? buildPast(fe, transactions) : [];
            if (fe && found.length > 0) {
                enterHistory(fe, found);
                setStage("history");
            } else {
                onClose();
            }
        } else {
            setStage("pick");
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [visible, tx.id, initialMode, expenseId]);

    const publish = (txs: Transaction[], fes: FixedExpense[]) => {
        setData({ txs, fes });
        onChanged(txs, fes);
        void NotificationService.syncFixedExpenseReminders(fes);
    };

    /** Tras vincular/crear: ofrece los pagos anteriores o cierra con el aviso de éxito. */
    const afterLink = (
        fe: FixedExpense | undefined, txs: Transaction[], outcome: "paid" | "merged" | "history" | "already",
    ) => {
        const name = fe?.name ?? "el gasto fijo";
        const list: Notice[] = [];
        if (outcome === "paid") {
            list.push({
                variant: "success",
                text: learnKey
                    ? `«${name}» quedó pagado. Los próximos cobros de «${merchantLabel}» se marcarán solos.`
                    : `«${name}» quedó pagado.`,
            });
        } else if (outcome === "merged") {
            list.push({ variant: "success", text: "Unido: quedó el pago del banco." });
        } else if (outcome === "history") {
            list.push({ variant: "success", text: `Guardado como historial de ${name}.` });
        } else {
            list.push({ variant: "info", text: "Este pago ya estaba vinculado a ese gasto fijo." });
        }
        if (!learnKey) {
            list.push({
                variant: "warning",
                text: `El comercio «${merchantLabel}» es demasiado genérico: la app no podrá reconocer sus próximos cobros sola.`,
            });
        }
        setNotices(list);
        const found = fe && outcome !== "already" ? buildPast(fe, txs) : [];
        if (fe && found.length > 0) {
            enterHistory(fe, found);
            setStage("history");
        } else {
            setStage("done");
        }
    };

    const handlePick = async (fe: FixedExpense) => {
        if (busy) return;
        const now = new Date();
        const cur = monthKey(now);
        const key = occurrenceKeyFor(fe.dayOfMonth, tx.date) ?? cur;

        // (a) El gasto ya figura pagado a mano este mes: se une con ese registro.
        if (fe.isPaid && key >= cur && fe.paidTxId !== tx.id) {
            const manual = data.txs.find(t =>
                t.source === "manual" && !t.mergedFrom
                && (t.id === fe.lastTxId || t.id === fe.paidTxId) && t.id.startsWith(FE_TX_PREFIX));
            if (manual) {
                const ok = await dialog.confirm({
                    title: "Unir con tu registro manual",
                    message: `Ya marcaste «${fe.name}» como pagado a mano el ${fmtDay(manual.date)}. Se queda el pago del banco (${formatMoney(tx.amount, tx.currency)}, ${fmtDay(tx.date)}) y se borra el registro manual para no contarlo dos veces. Podés separarlos después desde el detalle.`,
                    confirmLabel: "Sí, unir",
                    cancelLabel: "Cancelar",
                    destructive: false,
                    variant: "info",
                });
                if (!ok) return;
            } else if (fe.paidBy === "sms" && fe.paidTxId) {
                // (b) Ya lo pagó otro SMS: este queda como pago adicional (historial).
                const ok = await dialog.confirm({
                    title: "Guardar como pago adicional",
                    message: `«${fe.name}» ya figura pagado este mes por otro mensaje del banco. Este pago se guarda como historial de «${fe.name}», sin cambiar su estado.`,
                    confirmLabel: "Guardar",
                    cancelLabel: "Cancelar",
                    destructive: false,
                    variant: "info",
                });
                if (!ok) return;
            }
        }

        // (c) El día de cobro del SMS no coincide con el día de pago del gasto fijo.
        let updateDay = false;
        const smsDay = storedToLocalDate(tx.date)?.getDate();
        if (smsDay !== undefined && smsDay !== fe.dayOfMonth) {
            updateDay = await dialog.confirm({
                title: "¿Actualizar el día de pago?",
                message: `Las suscripciones se cobran el mismo día cada mes. ¿Cambiar el día de pago de «${fe.name}» del ${fe.dayOfMonth} al ${smsDay}, como en este SMS?`,
                confirmLabel: `Sí, usar el día ${smsDay}`,
                cancelLabel: `No, dejar el día ${fe.dayOfMonth}`,
                destructive: false,
                variant: "info",
            });
        }

        setBusy(true);
        setError(null);
        try {
            const res = await StorageService.linkSmsToFixed(tx.id, fe.id, { learn: learnKey !== null, updateDay });
            publish(res.transactions, res.fixedExpenses);
            afterLink(res.fixedExpenses.find(e => e.id === fe.id), res.transactions, res.outcome);
        } catch (e) {
            console.warn("[FixedExpenseLinkSheet] vincular:", e);
            setError("No se pudo vincular el pago. No se modificó nada. Probá de nuevo.");
        } finally {
            setBusy(false);
        }
    };

    const handleCreateSave = (expense: FixedExpense) => {
        savingRef.current = true;
        setStage("none");
        void (async () => {
            const wait = new Promise<void>(resolve => { setTimeout(resolve, SWITCH_DELAY_MS); });
            try {
                const res = await StorageService.createFixedFromSms(tx.id, expense);
                await wait;
                publish(res.transactions, res.fixedExpenses);
                afterLink(res.fixedExpenses.find(e => e.id === expense.id), res.transactions, res.outcome);
            } catch (e) {
                console.warn("[FixedExpenseLinkSheet] crear:", e);
                await wait;
                setError("No se pudo crear el gasto fijo. Probá de nuevo.");
                setStage("pick");
            } finally {
                savingRef.current = false;
            }
        })();
    };

    const handleHistorySave = async () => {
        if (busy || !historyFe) return;
        const items = past.filter(p => checked.has(p.tx.id)).map(p => ({ txId: p.tx.id, manualId: p.manualId }));
        if (items.length === 0) return;
        setBusy(true);
        setError(null);
        try {
            const res = await StorageService.linkFixedHistory(historyFe.id, items);
            publish(res.transactions, data.fes);
            setNotices(res.linked > 0
                ? [{ variant: "success", text: `Guardado como historial de ${historyFe.name}.` }]
                : [{ variant: "warning", text: "No se vinculó ningún pago: ya estaban asociados a otro gasto fijo." }]);
            setStage("done");
        } catch (e) {
            console.warn("[FixedExpenseLinkSheet] historial:", e);
            setError("No se pudo guardar el historial. No se modificó nada. Probá de nuevo.");
        } finally {
            setBusy(false);
        }
    };

    const toggle = (id: string) => {
        setChecked(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    };

    if (!visible || !smsOn) return null;

    // ── Crear gasto fijo nuevo con los datos del SMS ──
    if (stage === "create") {
        const brand = merchant ? findBrand(merchant) : null;
        const name = brand?.name ?? (merchant ? titleCase(merchant) : tx.description || "");
        return (
            <FixedExpenseModal
                smsOn
                defaultCurrency={tx.currency || "Q"}
                customCategories={settings.customCategories}
                prefill={{
                    name,
                    amount: tx.amount,
                    currency: tx.currency || "Q",
                    dayOfMonth: storedToLocalDate(tx.date)?.getDate() ?? 1,
                    category: tx.category,
                    // Lo paga el SMS: sin registro automático para no duplicarlo
                    autoRecord: false,
                    smsMatchKey: learnKey ?? undefined,
                }}
                onSave={handleCreateSave}
                onClose={() => { if (!savingRef.current) switchTo("pick"); }}
            />
        );
    }
    if (stage === "none") return null;

    // ── Pagos anteriores del mismo comercio ──
    if (stage === "history" && historyFe) {
        const n = checked.size;
        return (
            <GlassSheet onClose={onClose} title="Pagos anteriores" icon="time-outline">
                {notices.map((nt, i) => <InlineNotice key={i} variant={nt.variant} text={nt.text} style={s.notice} />)}
                {!!error && <InlineNotice variant="error" text={error} style={s.notice} />}
                <Text style={s.intro}>
                    {`Encontramos ${past.length} ${past.length === 1 ? "pago anterior" : "pagos anteriores"} de «${merchantLabel}». ¿Guardarlos como historial de «${historyFe.name}»? No cambia montos ni saldos.`}
                </Text>
                {past.map(p => {
                    const on = checked.has(p.tx.id);
                    return (
                        <TouchableOpacity
                            key={p.tx.id}
                            onPress={() => toggle(p.tx.id)}
                            activeOpacity={0.8}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: on }}
                            accessibilityLabel={`${fmtDay(p.tx.date, true)}, ${formatMoney(p.tx.amount, p.tx.currency)}`}
                        >
                            <GlassCard radius={14} blur={false} style={s.rowCard} contentStyle={s.pastRow}>
                                <Ionicons
                                    name={on ? "checkbox" : "square-outline"}
                                    size={22}
                                    color={on ? C.primaryLight : C.textMuted}
                                />
                                <View style={s.rowBody}>
                                    <Text style={s.rowTitle}>{fmtDay(p.tx.date, true)}</Text>
                                    <Money
                                        amount={Math.abs(p.tx.amount)}
                                        currency={p.tx.currency}
                                        size="sm"
                                        gradient={false}
                                        sign="never"
                                        tone="expense"
                                    />
                                    {!!p.manualId && (
                                        <Text style={s.rowNote}>Se une con tu registro manual de ese mes</Text>
                                    )}
                                </View>
                            </GlassCard>
                        </TouchableOpacity>
                    );
                })}
                <GlassButtonGroup direction="column" style={s.actions}>
                    <GlassButton
                        label={`Vincular ${n} ${n === 1 ? "seleccionado" : "seleccionados"}`}
                        icon="link-outline"
                        onPress={() => { void handleHistorySave(); }}
                        loading={busy}
                        disabled={n === 0}
                    />
                    <GlassButton label="Ahora no" kind="secondary" onPress={onClose} disabled={busy} />
                </GlassButtonGroup>
            </GlassSheet>
        );
    }

    // ── Resultado ──
    if (stage === "done") {
        return (
            <GlassSheet onClose={onClose} title="Gasto fijo" icon="calendar-outline">
                {notices.map((nt, i) => <InlineNotice key={i} variant={nt.variant} text={nt.text} style={s.notice} />)}
                <GlassButton label="Listo" onPress={onClose} style={s.doneBtn} />
            </GlassSheet>
        );
    }

    // ── Elegir el gasto fijo ──
    const ranked = rankFixedForTx(tx, data.fes);
    const cur = monthKey(new Date());
    return (
        <GlassSheet onClose={onClose} title="¿Qué gasto fijo es?" icon="calendar-outline">
            {!!error && <InlineNotice variant="error" text={error} style={s.notice} />}
            <Text style={s.intro}>
                {`Pago de «${merchantLabel}» por ${formatMoney(tx.amount, tx.currency)} (${fmtDay(tx.date)}). Elegí a cuál de tus gastos fijos corresponde.`}
            </Text>
            {!learnKey && (
                <InlineNotice
                    variant="warning"
                    text="Este comercio es muy genérico: se puede vincular este pago, pero la app no podrá reconocer sus próximos cobros sola."
                    style={s.notice}
                />
            )}
            {ranked.length === 0 && (
                <InlineNotice variant="info" text="Todavía no tenés gastos fijos activos. Podés crear uno con este pago." style={s.notice} />
            )}
            {ranked.map(({ expense, score, reasons }) => {
                const suggested = score >= SUGGEST_SCORE;
                const paidNow = expense.isPaid && expense.paidCycleKey === cur;
                return (
                    <TouchableOpacity
                        key={expense.id}
                        onPress={() => { void handlePick(expense); }}
                        activeOpacity={0.8}
                        disabled={busy}
                        accessibilityRole="button"
                        accessibilityLabel={`${expense.name}${suggested ? ", sugerido" : ""}`}
                    >
                        <GlassCard radius={14} blur={false} style={s.rowCard} contentStyle={s.pickRow}>
                            <View style={s.rowBody}>
                                <Text style={s.rowTitle}>{expense.name}</Text>
                                {(suggested || paidNow) && (
                                    <View style={s.chips}>
                                        {suggested && (
                                            <View style={s.chip}>
                                                <Ionicons name="sparkles-outline" size={11} color={C.primaryLight} />
                                                <Text style={s.chipTxt}>Sugerido</Text>
                                            </View>
                                        )}
                                        {paidNow && (
                                            <View style={s.chip}>
                                                <Ionicons name="checkmark-circle-outline" size={11} color={C.success} />
                                                <Text style={s.chipTxt}>Pagado este mes</Text>
                                            </View>
                                        )}
                                    </View>
                                )}
                                <Text style={s.rowMeta}>Vence el día {expense.dayOfMonth}</Text>
                                <Money
                                    amount={expense.amount}
                                    currency={expense.currency}
                                    size="sm"
                                    gradient={false}
                                    tone="neutral"
                                />
                                {suggested && reasons.length > 0 && (
                                    <Text style={s.rowNote}>Por qué: {describeReasons(reasons)}.</Text>
                                )}
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                        </GlassCard>
                    </TouchableOpacity>
                );
            })}
            <GlassButton
                label="Crear gasto fijo nuevo con este pago"
                icon="add-circle-outline"
                kind="secondary"
                onPress={() => switchTo("create")}
                disabled={busy}
                style={s.createBtn}
            />
        </GlassSheet>
    );
}

const s = StyleSheet.create({
    intro: { color: C.textSub, fontSize: 13, lineHeight: 18, marginBottom: 12 },
    notice: { marginBottom: 12 },
    rowCard: { marginBottom: 10 },
    pickRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 14 },
    pastRow: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12 },
    rowBody: { flex: 1, flexShrink: 1, gap: 3 },
    rowTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
    rowMeta: { color: C.textSub, fontSize: 12 },
    rowNote: { color: C.textSub, fontSize: 12, lineHeight: 17 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
    chip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10, backgroundColor: C.glassActive, borderWidth: 1, borderColor: C.glassActiveBorder },
    chipTxt: { color: C.textPrimary, fontSize: 11, fontWeight: "800" },
    actions: { marginTop: 6 },
    createBtn: { marginTop: 6 },
    doneBtn: { marginTop: 4 },
});
