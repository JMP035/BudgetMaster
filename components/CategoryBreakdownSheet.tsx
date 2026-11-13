import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { categoryLabelOf, getCat } from "../categories";
import {
    CategoryBreakdown, PeriodRange, currencyNoun, formatPeriodRange, formatShortDay,
} from "../services/BudgetBreakdown";
import { isSmsFeatureOn } from "../services/features";
import { formatMoney } from "../services/format";
import { merchantOfTransaction } from "../services/MerchantRules";
import type { FixedExpense, Transaction, UserSettings } from "../services/storage";
import { C } from "../theme";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { GlassSheet } from "./GlassSheet";
import Money from "./Money";

/** Tope de filas dibujadas por lista; el resto se resume en «y N más». */
const MAX_ROWS = 100;

interface Props {
    categoryId: string;
    /** Desglose del período para esta categoría (undefined = sin movimientos). */
    breakdown?: CategoryBreakdown;
    /** Límite en Q de la categoría, si tiene presupuesto. */
    limit?: number;
    period: PeriodRange;
    settings: UserSettings;
    fixedExpenses: FixedExpense[];
    onClose: () => void;
}

function TxRow({ tx, smsOn, fixedName }: { tx: Transaction; smsOn: boolean; fixedName?: string }) {
    const title = merchantOfTransaction(tx) || tx.description || "Movimiento";
    return (
        <View style={s.row}>
            <View style={s.rowMain}>
                <Text style={s.rowTitle} numberOfLines={2}>{title}</Text>
                <View style={s.rowMeta}>
                    <Text style={s.rowDate}>{formatShortDay(new Date(tx.date))}</Text>
                    {smsOn && tx.source === "sms" && (
                        <View style={s.smsChip}>
                            <Text style={s.smsChipTxt}>SMS</Text>
                        </View>
                    )}
                    {!!tx.fixedExpenseId && (
                        <View style={s.fixedChip}>
                            <Ionicons name="repeat-outline" size={10} color={C.primaryLight} />
                            <Text style={s.fixedChipTxt} numberOfLines={1}>{fixedName ?? "Gasto fijo"}</Text>
                        </View>
                    )}
                </View>
            </View>
            <Money
                amount={tx.amount}
                currency={tx.currency || "Q"}
                size="sm"
                gradient={false}
                sign="never"
                tone="expense"
                prefix="-"
                align="right"
                containerStyle={s.rowAmount}
            />
        </View>
    );
}

function TxList({ txs, smsOn, fixedExpenses }: { txs: Transaction[]; smsOn: boolean; fixedExpenses: FixedExpense[] }) {
    const shown = txs.slice(0, MAX_ROWS);
    const extra = txs.length - shown.length;
    return (
        <View>
            {shown.map(t => (
                <TxRow
                    key={t.id}
                    tx={t}
                    smsOn={smsOn}
                    fixedName={t.fixedExpenseId ? fixedExpenses.find(e => e.id === t.fixedExpenseId)?.name : undefined}
                />
            ))}
            {extra > 0 && <Text style={s.more}>y {extra} más</Text>}
        </View>
    );
}

export function CategoryBreakdownSheet({ categoryId, breakdown, limit, period, settings, fixedExpenses, onClose }: Props) {
    const smsOn = isSmsFeatureOn(settings);
    const cat = getCat(categoryId, settings.customCategories, "expense");
    const title = categoryLabelOf(categoryId, settings.customCategories, "expense");

    const qTotal = breakdown?.qTotal ?? 0;
    const qTxs = breakdown?.qTxs ?? [];
    const foreign = breakdown?.foreign ?? [];
    const hasLimit = limit !== undefined && limit > 0;
    const over = hasLimit && qTotal > limit;
    const pct = hasLimit ? Math.min((qTotal / limit) * 100, 100) : 0;
    const barColor = over ? C.danger : pct > 80 ? C.warning : cat.color;
    const isEmpty = qTxs.length === 0 && foreign.length === 0;

    return (
        <GlassSheet
            onClose={onClose}
            title={title}
            icon={cat.icon}
            footer={
                <View style={s.footer}>
                    <GlassButton label="Cerrar" kind="secondary" onPress={onClose} />
                </View>
            }
        >
            <Text style={s.period}>Período: {formatPeriodRange(period)}</Text>

            {isEmpty ? (
                <GlassCard radius={16} blur={false} contentStyle={s.emptyContent}>
                    <Ionicons name="receipt-outline" size={32} color={C.textMuted} />
                    <Text style={s.emptyTitle}>Sin movimientos en este período</Text>
                    <Text style={s.emptyDesc}>Cuando registres gastos de esta categoría aparecerán aquí.</Text>
                </GlassCard>
            ) : (
                <>
                    {/* RESUMEN EN Q */}
                    <GlassCard radius={16} blur={false} contentStyle={s.summaryContent}>
                        <Text style={s.sectionLbl}>GASTADO EN QUETZALES</Text>
                        <Money amount={qTotal} currency="Q" size="lg" tone="expense" gradient={false} containerStyle={s.summaryMoney} />
                        {hasLimit && (
                            <>
                                <Text style={[s.limitTxt, over && { color: C.danger }]}>
                                    {formatMoney(qTotal, "Q")} de {formatMoney(limit, "Q")}
                                </Text>
                                <View style={s.barTrack}>
                                    <View style={[s.barFill, { width: `${pct}%`, backgroundColor: barColor }]} />
                                </View>
                            </>
                        )}
                    </GlassCard>

                    {/* MOVIMIENTOS EN Q */}
                    <Text style={s.sectionTitle}>MOVIMIENTOS EN Q ({qTxs.length})</Text>
                    {qTxs.length > 0
                        ? <TxList txs={qTxs} smsOn={smsOn} fixedExpenses={fixedExpenses} />
                        : <Text style={s.none}>Sin gastos en quetzales este período.</Text>}

                    {/* OTRAS MONEDAS */}
                    {foreign.map(b => (
                        <View key={b.currency}>
                            <Text style={s.sectionTitle}>
                                {`EN ${currencyNoun(b.currency).toUpperCase()} (${hasLimit ? "NO CUENTAN EN EL LÍMITE" : "APARTE DEL TOTAL EN Q"})`}
                            </Text>
                            <TxList txs={b.txs} smsOn={smsOn} fixedExpenses={fixedExpenses} />
                            <View style={s.subtotal}>
                                <Text style={s.subtotalLbl}>Subtotal en {currencyNoun(b.currency)}</Text>
                                <Text style={s.subtotalVal}>{formatMoney(b.total, b.currency)}</Text>
                            </View>
                        </View>
                    ))}
                </>
            )}
            <View style={{ height: 8 }} />
        </GlassSheet>
    );
}

export default CategoryBreakdownSheet;

const s = StyleSheet.create({
    footer: { paddingTop: 12 },
    period: { color: C.textSub, fontSize: 13, fontWeight: "600", marginBottom: 14 },

    summaryContent: { padding: 16 },
    sectionLbl: { color: C.textSub, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 6 },
    summaryMoney: { alignSelf: "stretch" },
    limitTxt: { color: C.textSub, fontSize: 13, fontWeight: "600", marginTop: 8, marginBottom: 8 },
    barTrack: { height: 8, borderRadius: 6, backgroundColor: C.bgDeep, overflow: "hidden", borderWidth: 1, borderColor: C.glassBorder },
    barFill: { height: 8, borderRadius: 6 },

    sectionTitle: { color: C.textSub, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginTop: 18, marginBottom: 6 },
    none: { color: C.textSub, fontSize: 13, paddingVertical: 8 },
    more: { color: C.textSub, fontSize: 12, fontStyle: "italic", paddingVertical: 10, textAlign: "center" },

    row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.separator },
    rowMain: { flex: 1, flexShrink: 1 },
    rowTitle: { color: C.text, fontSize: 14, fontWeight: "700" },
    rowMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 3 },
    rowDate: { color: C.textSub, fontSize: 11 },
    rowAmount: { flexShrink: 0, maxWidth: "42%" },
    smsChip: { backgroundColor: C.accent + "22", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 1, borderColor: C.accent + "55" },
    smsChipTxt: { color: C.accent, fontSize: 9, fontWeight: "800" },
    fixedChip: { flexDirection: "row", alignItems: "center", gap: 3, maxWidth: 160, backgroundColor: C.primary + "33", borderRadius: 4, paddingHorizontal: 5, paddingVertical: 2, borderWidth: 1, borderColor: C.primary + "55" },
    fixedChipTxt: { color: C.primaryLight, fontSize: 9, fontWeight: "800", flexShrink: 1 },

    subtotal: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8, paddingTop: 10 },
    subtotalLbl: { color: C.textSub, fontSize: 12, fontWeight: "700", flexShrink: 1 },
    subtotalVal: { color: C.fx, fontSize: 15, fontWeight: "800" },

    emptyContent: { alignItems: "center", padding: 24, gap: 8 },
    emptyTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800", textAlign: "center" },
    emptyDesc: { color: C.textSub, fontSize: 13, textAlign: "center", lineHeight: 19 },
});
