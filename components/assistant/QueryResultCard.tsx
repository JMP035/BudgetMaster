import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { MoneyTotal, QueryResult, QueryRow } from "../../services/assistant/types";
import { C } from "../../theme";
import { GlassCard } from "../GlassCard";
import { Money } from "../Money";

export const QUERY_VISIBLE_ROWS = 8;

export interface QueryResultCardProps {
    result: QueryResult;
}

const FOREIGN_LABEL: Record<string, string> = {
    USD: "En dólares (aparte)",
    EUR: "En euros (aparte)",
    "£": "En libras (aparte)",
};

const COUNT_QUERIES = new Set(["spending_total", "list_movements"]);

function badgeColor(badge: string): string {
    return /^(vencid|excedid)/i.test(badge) ? C.danger : C.primaryLight;
}

function RowView({ row, first }: { row: QueryRow; first: boolean }) {
    const tone = row.tone === "expense" ? "expense" : row.tone === "income" ? "income" : "neutral";
    return (
        <View style={[s.row, !first && s.rowBorder]}>
            <View style={s.rowMain}>
                <View style={s.titleRow}>
                    <Text style={s.rowTitle}>{row.title}</Text>
                    {!!row.badge && (
                        <View style={[s.badge, { borderColor: badgeColor(row.badge) }]}>
                            <Text style={[s.badgeTxt, { color: badgeColor(row.badge) }]}>{row.badge}</Text>
                        </View>
                    )}
                </View>
                {!!row.subtitle && <Text style={s.rowSub}>{row.subtitle}</Text>}
            </View>
            {row.amount !== undefined && (
                <Money
                    amount={row.amount}
                    currency={row.currency ?? "Q"}
                    size="sm"
                    tone={tone}
                    gradient={false}
                    align="right"
                    containerStyle={s.rowAmount}
                />
            )}
        </View>
    );
}

function TotalsBlock({ totals, queryId }: { totals: MoneyTotal[]; queryId: string }) {
    if (totals.length === 0) return null;
    const quetzales = totals.find(t => t.currency === "Q");
    const foreign = totals.filter(t => t.currency !== "Q");
    const countText = (t: MoneyTotal) =>
        COUNT_QUERIES.has(queryId) ? `${t.count} ${t.count === 1 ? "movimiento" : "movimientos"}` : "";
    return (
        <View style={s.totals}>
            {quetzales && (
                <View>
                    <Money amount={quetzales.amount} currency="Q" size="md" />
                    {!!countText(quetzales) && <Text style={s.countTxt}>{countText(quetzales)}</Text>}
                </View>
            )}
            {foreign.map(t => (
                <View key={t.currency}>
                    <View style={s.foreignRow}>
                        <Text style={s.foreignLabel}>{FOREIGN_LABEL[t.currency] ?? `En ${t.currency} (aparte)`}</Text>
                        <Money
                            amount={t.amount}
                            currency={t.currency}
                            size="sm"
                            tone="neutral"
                            gradient={false}
                            containerStyle={s.foreignMoney}
                        />
                    </View>
                    {!!countText(t) && <Text style={s.countTxt}>{countText(t)}</Text>}
                </View>
            ))}
        </View>
    );
}

export function QueryResultCard({ result }: QueryResultCardProps) {
    const [expanded, setExpanded] = useState(false);
    const rows = result.rows;
    const extra = Math.max(0, rows.length - QUERY_VISIBLE_ROWS);
    const shown = expanded ? rows : rows.slice(0, QUERY_VISIBLE_ROWS);

    return (
        <View style={s.wrap}>
            <GlassCard radius={18} blur={false} contentStyle={s.content}>
                <View accessible accessibilityRole="header" accessibilityLabel={`${result.title}. ${result.subtitle}`}>
                    <Text style={s.title}>{result.title}</Text>
                    {!!result.subtitle && <Text style={s.subtitle}>{result.subtitle}</Text>}
                </View>

                <TotalsBlock totals={result.totals} queryId={result.queryId} />

                {rows.length === 0 ? (
                    <Text style={s.empty}>{result.emptyText ?? "No hay datos para mostrar."}</Text>
                ) : (
                    <View>
                        {shown.map((row, i) => (
                            <RowView key={row.id} row={row} first={i === 0} />
                        ))}
                    </View>
                )}

                {extra > 0 && (
                    <TouchableOpacity
                        onPress={() => setExpanded(v => !v)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel={expanded ? "Ver menos" : `Ver ${extra} más`}
                        style={s.moreBtn}
                    >
                        <Text style={s.moreTxt}>{expanded ? "Ver menos" : `Ver ${extra} más`}</Text>
                        <Ionicons name={expanded ? "chevron-up" : "chevron-down"} size={14} color={C.primaryLight} />
                    </TouchableOpacity>
                )}

                {result.moreCount > 0 && (
                    <Text style={s.moreCount}>y {result.moreCount} más en Movimientos</Text>
                )}

                {!!result.note && (
                    <View style={s.noteRow}>
                        <Ionicons name="information-circle-outline" size={14} color={C.textSub} />
                        <Text style={s.note}>{result.note}</Text>
                    </View>
                )}
            </GlassCard>
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { flex: 1, flexShrink: 1, minWidth: 0 },
    content: { padding: 14, gap: 10 },
    title: { color: C.textPrimary, fontSize: 15, fontWeight: "900", lineHeight: 20 },
    subtitle: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 2 },
    totals: { gap: 8 },
    countTxt: { color: C.textSub, fontSize: 12, marginTop: 2 },
    foreignRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 10, rowGap: 2 },
    foreignLabel: { color: C.fx, fontSize: 12, fontWeight: "700", flexShrink: 1 },
    foreignMoney: { flexShrink: 1 },
    row: { flexDirection: "row", alignItems: "flex-start", gap: 10, paddingVertical: 9 },
    rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.glassBorder },
    rowMain: { flex: 1, flexShrink: 1, minWidth: 0 },
    titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 6, rowGap: 3 },
    rowTitle: { color: C.text, fontSize: 14, fontWeight: "700", lineHeight: 19, flexShrink: 1 },
    rowSub: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 1 },
    rowAmount: { maxWidth: "45%", flexShrink: 0, paddingTop: 1 },
    badge: { borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1 },
    badgeTxt: { fontSize: 11, fontWeight: "800" },
    empty: { color: C.textSub, fontSize: 13, lineHeight: 19 },
    moreBtn: {
        flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6,
        minHeight: 40, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput,
        paddingHorizontal: 12,
    },
    moreTxt: { color: C.primaryLight, fontSize: 13, fontWeight: "800" },
    moreCount: { color: C.textSub, fontSize: 12, lineHeight: 17 },
    noteRow: { flexDirection: "row", alignItems: "flex-start", gap: 6 },
    note: { color: C.textSub, fontSize: 12, lineHeight: 17, flexShrink: 1 },
});

export default QueryResultCard;
