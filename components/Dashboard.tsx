import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Image, RefreshControl, ScrollView, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { Transaction, UserSettings } from "../services/storage";
import { getCat } from "../categories";
import { C, shadow } from "../theme";

// ... [MiniBarChart and BudgetRing exactly as before, included to keep file complete]
export function MiniBarChart({ data, color, labels }: { data: number[]; color: string; labels: string[] }) {
    const max = Math.max(...data, 1);
    return (
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 60, gap: 4 }}>
            {data.map((val, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center" }}>
                    <View style={{ width: "80%", height: Math.max(4, (val / max) * 50), backgroundColor: color, borderRadius: 3, opacity: i === data.length - 1 ? 1 : 0.4 }} />
                    <Text style={{ color: C.textMuted, fontSize: 9, marginTop: 3 }}>{labels[i]}</Text>
                </View>
            ))}
        </View>
    );
}

export function BudgetRing({ spent, limit, currency }: { spent: number; limit: number; currency: string }) {
    const { width, height } = useWindowDimensions();
    const pct = Math.min(spent / limit, 1);
    const isLandscape = width > height;
    const size = isLandscape ? 120 : 160;
    const stroke = isLandscape ? 10 : 14;
    const over = spent > limit;
    const ringColor = over ? C.danger : pct > 0.8 ? C.warning : C.primaryLight;

    return (
        <View style={{ alignItems: "center" }}>
            <View style={[s.ringBg, { width: size, height: size, borderRadius: size / 2, borderWidth: stroke }]}>
                <View style={[{ position: "absolute", width: size, height: size, borderRadius: size / 2, borderWidth: stroke, borderColor: "transparent", borderTopColor: ringColor, borderRightColor: pct > 0.25 ? ringColor : "transparent", borderBottomColor: pct > 0.5 ? ringColor : "transparent", borderLeftColor: pct > 0.75 ? ringColor : "transparent", transform: [{ rotate: "-90deg" }] }]} />
                <View style={{ alignItems: "center" }}>
                    <Text style={{ color: ringColor, fontSize: 24, fontWeight: "900" }}>{Math.round(pct * 100)}%</Text>
                    <Text style={{ color: C.textSub, fontSize: 10, marginTop: 2, letterSpacing: 1 }}>USADO</Text>
                </View>
            </View>
            <Text style={{ color: C.textPrimary, fontSize: 20, fontWeight: "800", marginTop: 12 }}>{currency} {spent.toFixed(2)}</Text>
            <Text style={{ color: C.textMuted, fontSize: 12 }}>de {currency} {limit.toFixed(2)}</Text>
        </View>
    );
}

// Dashboard UI Simple Component
function NetWorthCard({ totalNetWorth, currency }: { totalNetWorth: number; currency: string; }) {
    const fmt = (n: number) => `${currency} ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    return (
        <View style={s.netWorthCard}>
            <Text style={s.netWorthTitle}>PATRIMONIO TOTAL</Text>
            <Text style={s.netWorthVal}>{fmt(totalNetWorth)}</Text>
        </View>
    );
}

interface Props { transactions: Transaction[]; settings: UserSettings; onRefresh: () => void; refreshing: boolean; }

export default function DashboardScreen({ transactions, settings, onRefresh, refreshing }: Props) {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const monthTx = transactions.filter(t => new Date(t.date).getMonth() === month && new Date(t.date).getFullYear() === year);

    const spent = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const income = monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const balance = income - spent;

    // Para el árbol:
    const savingsRate = income > 0 ? (balance / income) * 100 : 0;

    // Patrimonio Total = Ahorros Externos + Balance Histórico (en este MVP simple sumamos todos los ingresos vs gastos de la app + externos)
    const allTimeIncome = transactions.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const allTimeSpent = transactions.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const totalNetWorth = (settings.externalSavings || 0) + (allTimeIncome - allTimeSpent);

    const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(year, month - (5 - i), 1);
        return { label: d.toLocaleDateString("es-GT", { month: "short" }), month: d.getMonth(), year: d.getFullYear() };
    });
    const chartData = months.map(m =>
        transactions.filter(t => t.type === "expense" && new Date(t.date).getMonth() === m.month && new Date(t.date).getFullYear() === m.year).reduce((s, t) => s + t.amount, 0)
    );

    const recent = [...transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5);
    const fmt = (n: number) => `${settings.currency} ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

    return (
        <ScrollView style={s.screen} refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />} showsVerticalScrollIndicator={false}>
            <View style={s.header}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', marginRight: 12 }}>
                        <Ionicons name="wallet-outline" size={28} color="#1A0E00" />
                    </View>
                    <View>
                        <Text style={s.greeting}>Hola, {settings.userName}</Text>
                        <Text style={s.month}>{now.toLocaleDateString("es-GT", { month: "long", year: "numeric" }).toUpperCase()}</Text>
                    </View>
                </View>

                <View style={[s.badge, settings.smsEnabled && { borderColor: C.accent, backgroundColor: C.accent + "22" }]}>
                    <Ionicons name="chatbubble-ellipses" size={18} color={settings.smsEnabled ? C.accent : C.textMuted} />
                    {settings.smsEnabled && <View style={{ position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent }} />}
                </View>
            </View>

            <NetWorthCard totalNetWorth={totalNetWorth} currency={settings.currency} />

            <View style={s.statsRow}>
                <View style={[s.statCard, { borderTopColor: C.income }]}>
                    <Text style={s.statLabel}>INGRESOS</Text>
                    <Text style={[s.statValue, { color: C.income }]}>{fmt(income)}</Text>
                </View>
                <View style={[s.statCard, { borderTopColor: C.expense }]}>
                    <Text style={s.statLabel}>GASTOS</Text>
                    <Text style={[s.statValue, { color: C.expense }]}>{fmt(spent)}</Text>
                </View>
            </View>

            <View style={[s.card, { alignItems: "center", paddingVertical: 24 }]}>
                <Text style={[s.title, { marginBottom: 16 }]}>TU PRESUPUESTO</Text>
                <BudgetRing spent={spent} limit={settings.budgetLimit} currency={settings.currency} />
            </View>

            <View style={s.card}>
                <Text style={s.title}>GASTOS ÚLTIMOS 6 MESES</Text>
                <View style={{ marginTop: 16 }}><MiniBarChart data={chartData} color={C.primary} labels={months.map(m => m.label)} /></View>
            </View>

            <View style={[s.card, { marginBottom: 120 }]}>
                <Text style={[s.title, { marginBottom: 12 }]}>RECIENTES</Text>
                {recent.length === 0 ? <Text style={s.empty}>Sin transacciones aún.</Text> :
                    recent.map(tx => {
                        const cat = getCat(tx.category);
                        return (
                            <View key={tx.id} style={s.txItem}>
                                <View style={[
                                    s.txIconGlass,
                                    {
                                        backgroundColor: cat.color + "22",
                                        borderColor: cat.color + "44",
                                        borderTopColor: cat.color + "99",
                                        shadowColor: cat.color
                                    }
                                ]}>
                                    <Ionicons name={cat.icon} size={20} color={cat.color} style={{ opacity: 0.9 }} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.txDesc} numberOfLines={1}>{tx.description || cat.label}</Text>
                                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                                        <Text style={s.txDate}>{new Date(tx.date).toLocaleDateString("es-GT", { day: "2-digit", month: "short" })}</Text>
                                        {tx.bank && (
                                            <View style={{ backgroundColor: C.primary + "33", paddingHorizontal: 6, borderRadius: 4 }}>
                                                <Text style={{ color: C.primaryLight, fontSize: 9, fontWeight: "800" }}>{tx.bank.toUpperCase()}</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                                <Text style={[s.txAmount, { color: tx.type === "income" ? C.income : C.expense }]}>
                                    {tx.type === "income" ? "+" : "-"}{fmt(tx.amount)}
                                </Text>
                            </View>
                        );
                    })}
            </View>
        </ScrollView>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
    greeting: { color: C.text, fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
    month: { color: C.textPrimary, fontSize: 11, marginTop: 2, letterSpacing: 1.5, fontWeight: "700" },
    badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primaryDark + "33", borderWidth: 1, borderColor: C.primary + "66", alignItems: "center", justifyContent: "center" },

    netWorthCard: { backgroundColor: C.cardHigh, borderRadius: 20, borderWidth: 1, borderColor: C.primary + "44", padding: 24, alignItems: "center", marginBottom: 16, marginTop: -4, ...shadow(C.primaryGlow, 15, 0.2) },
    netWorthTitle: { color: C.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginBottom: 8 },
    netWorthVal: { color: C.textPrimary, fontSize: 36, fontWeight: "900" },

    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    statsRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    statCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, borderTopWidth: 2, padding: 14, ...shadow("#000", 4, 0.3) },
    statLabel: { color: C.textMuted, fontSize: 11, marginBottom: 4, letterSpacing: 1, fontWeight: "700" },
    statValue: { fontSize: 20, fontWeight: "800" },
    title: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.8 },
    ringBg: { borderColor: C.bgDeep, alignItems: "center", justifyContent: "center" },
    txItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.separator },
    txIconGlass: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginRight: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8 },
    txDesc: { color: C.text, fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
    txDate: { color: C.textMuted, fontSize: 11, marginTop: 2 },
    txAmount: { fontSize: 15, fontWeight: "800" },
    empty: { color: C.textMuted, fontSize: 13, textAlign: "center", marginVertical: 10 }
});
