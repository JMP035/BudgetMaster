import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Transaction, UserSettings } from "../services/storage";
import { EXPENSE_CATEGORIES } from "../categories";
import { C, shadow } from "../theme";

export default function StatsScreen({ transactions, settings }: { transactions: Transaction[]; settings: UserSettings }) {
    const [period, setPeriod] = useState<"month" | "all">("month");
    const now = new Date();

    const filtered = period === "month"
        ? transactions.filter(t => new Date(t.date).getMonth() === now.getMonth() && new Date(t.date).getFullYear() === now.getFullYear())
        : transactions;

    const expenses = filtered.filter(t => t.type === "expense");
    const totalExpense = expenses.reduce((s, t) => s + t.amount, 0);

    const byCat = EXPENSE_CATEGORIES.map(cat => ({
        ...cat,
        sum: expenses.filter(t => t.category === cat.id).reduce((s, t) => s + t.amount, 0),
        pct: totalExpense ? (expenses.filter(t => t.category === cat.id).reduce((s, t) => s + t.amount, 0) / totalExpense) * 100 : 0
    })).filter(c => c.sum > 0).sort((a, b) => b.sum - a.sum);

    const totalIncome = filtered.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const savings = totalIncome - totalExpense;
    const savingsRate = totalIncome ? (savings / totalIncome) * 100 : 0;

    const fmt = (n: number) => `${settings.currency} ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

    return (
        <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>
            <View style={s.header}>
                <Text style={s.title}>Estadísticas</Text>
            </View>

            <View style={s.filterRow}>
                {(["month", "all"] as const).map(p => (
                    <TouchableOpacity key={p} style={[s.filterTab, period === p && s.filterTabActive]} onPress={() => setPeriod(p)}>
                        <Text style={[s.filterTxt, period === p && s.filterTxtActive]}>{p === "month" ? "Este Mes" : "Todo el Tiempo"}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            <View style={s.statsRow}>
                <View style={[s.statCard, { borderTopColor: C.expense }]}>
                    <Text style={s.statLabel}>GASTOS</Text>
                    <Text style={[s.statValue, { color: C.expense }]}>{fmt(totalExpense)}</Text>
                </View>
                <View style={[s.statCard, { borderTopColor: savings >= 0 ? C.income : C.danger }]}>
                    <Text style={s.statLabel}>AHORRO NETA</Text>
                    <Text style={[s.statValue, { color: savings >= 0 ? C.income : C.danger }]}>{fmt(savings)}</Text>
                </View>
            </View>

            <View style={s.card}>
                <Text style={s.titleSm}>TASA DE AHORRO</Text>
                <View style={s.barBg}>
                    <View style={[s.barFill, { width: `${Math.max(0, Math.min(savingsRate, 100))}%` as any, backgroundColor: savingsRate >= 20 ? C.income : savingsRate >= 0 ? C.warning : C.danger }]} />
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", marginTop: 8 }}>
                    <Ionicons name={savingsRate >= 20 ? "trending-up" : "warning"} size={16} color={savingsRate >= 20 ? C.income : C.warning} style={{ marginRight: 6 }} />
                    <Text style={s.barTxt}>{savingsRate >= 0 ? `Ahorraste el ${savingsRate.toFixed(1)}% (Meta: 20%)` : "Gastaste más de lo que ingresaste"}</Text>
                </View>
            </View>

            <View style={[s.card, { marginBottom: 120 }]}>
                <Text style={[s.titleSm, { marginBottom: 16 }]}>DESGLOSE POR CATEGORÍA</Text>
                {byCat.length === 0 ? <Text style={s.empty}>Sin gastos en este período.</Text> :
                    byCat.map(cat => (
                        <View key={cat.id} style={{ marginBottom: 14 }}>
                            <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 6 }}>
                                <View style={{ flexDirection: "row", alignItems: "center" }}>
                                    <Ionicons name={cat.icon} size={16} color={cat.color} style={{ marginRight: 8 }} />
                                    <Text style={{ color: C.text, fontSize: 13, fontWeight: "600" }}>{cat.label}</Text>
                                </View>
                                <Text style={{ color: C.textSub, fontSize: 13, fontWeight: "600" }}>{fmt(cat.sum)} ({cat.pct.toFixed(0)}%)</Text>
                            </View>
                            <View style={[s.barBg, { height: 6 }]}>
                                <View style={[s.barFill, { width: `${cat.pct}%` as any, backgroundColor: cat.color }]} />
                            </View>
                        </View>
                    ))
                }
            </View>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    header: { marginBottom: 18 },
    title: { color: C.textPrimary, fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },
    filterRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    filterTab: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: "center", backgroundColor: C.bgDeep },
    filterTabActive: { borderColor: C.primary, borderTopColor: C.primaryLight, backgroundColor: C.primaryDark + "33", ...shadow(C.primaryGlow, 6, 0.3) },
    filterTxt: { color: C.textSub, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
    filterTxtActive: { color: C.primaryLight, fontWeight: "900" },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    statCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, borderTopWidth: 2, padding: 14, ...shadow("#000", 4, 0.3) },
    statLabel: { color: C.textMuted, fontSize: 11, marginBottom: 4, letterSpacing: 1, fontWeight: "700" },
    statValue: { fontSize: 18, fontWeight: "800" },
    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 18, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    titleSm: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.8 },
    barBg: { height: 8, backgroundColor: C.bgDeep, borderRadius: 4, borderWidth: 1, borderColor: C.cardBorder, overflow: "hidden", marginTop: 8 },
    barFill: { height: "100%", borderRadius: 4 },
    barTxt: { color: C.textSub, fontSize: 13, fontWeight: "600" },
    empty: { color: C.textMuted, fontSize: 13, textAlign: "center" }
});
