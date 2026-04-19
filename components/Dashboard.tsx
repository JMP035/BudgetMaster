import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Transaction, UserSettings } from "../services/storage";
import { SmsService } from "../services/SmsService";
import { getCat } from "../categories";
import { C, shadow } from "../theme";

// ─────────────────────────────────────────────────────────────
// MINI BAR CHART
// ─────────────────────────────────────────────────────────────
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

// ─────────────────────────────────────────────────────────────
// BUDGET RING
// ─────────────────────────────────────────────────────────────
export function BudgetRing({ spent, limit, currency }: { spent: number; limit: number; currency: string }) {
    const pct = Math.min(spent / limit, 1);
    const over = spent > limit;
    const ringColor = over ? C.danger : pct > 0.8 ? C.warning : C.primaryLight;

    return (
        <View style={{ alignItems: "center" }}>
            <View style={[s.ringBg, { width: 160, height: 160, borderRadius: 80, borderWidth: 14 }]}>
                <View style={[{
                    position: "absolute", width: 160, height: 160, borderRadius: 80, borderWidth: 14,
                    borderColor: "transparent",
                    borderTopColor: ringColor,
                    borderRightColor: pct > 0.25 ? ringColor : "transparent",
                    borderBottomColor: pct > 0.5 ? ringColor : "transparent",
                    borderLeftColor: pct > 0.75 ? ringColor : "transparent",
                    transform: [{ rotate: "-90deg" }]
                }]} />
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

// ─────────────────────────────────────────────────────────────
// TARJETA DE BALANCE POR MONEDA
// ─────────────────────────────────────────────────────────────
function CurrencyBalanceCard({ currency, income, expense }: { currency: string; income: number; expense: number }) {
    const balance = income - expense;
    const isPositive = balance >= 0;
    const fmt = (n: number) => `${currency} ${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

    return (
        <View style={s.currencyCard}>
            <View style={s.currencyHeader}>
                <View style={[s.currencyBadge, { backgroundColor: currency === 'Q' ? C.primary + "33" : "#4A9EE833" }]}>
                    <Text style={[s.currencySymbol, { color: currency === 'Q' ? C.primaryLight : "#4A9EE8" }]}>{currency}</Text>
                </View>
                <Text style={s.currencyTitle}>{currency === 'Q' ? 'QUETZALES' : currency === 'USD' ? 'DÓLARES' : currency === 'EUR' ? 'EUROS' : currency}</Text>
            </View>

            <View style={s.currencyRow}>
                <View style={s.currencyItem}>
                    <Text style={s.currencyLabel}>INGRESOS</Text>
                    <Text style={[s.currencyValue, { color: C.income }]}>{fmt(income)}</Text>
                </View>
                <View style={s.currencyDivider} />
                <View style={s.currencyItem}>
                    <Text style={s.currencyLabel}>GASTOS</Text>
                    <Text style={[s.currencyValue, { color: C.expense }]}>{fmt(expense)}</Text>
                </View>
                <View style={s.currencyDivider} />
                <View style={s.currencyItem}>
                    <Text style={s.currencyLabel}>NETO</Text>
                    <Text style={[s.currencyValue, { color: isPositive ? C.income : C.danger }]}>
                        {isPositive ? '+' : '-'}{fmt(balance)}
                    </Text>
                </View>
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// TARJETA DE PATRIMONIO TOTAL
// ─────────────────────────────────────────────────────────────
function NetWorthCard({ transactions, settings }: { transactions: Transaction[]; settings: UserSettings }) {
    const allTimeIncomeQ = transactions.filter(t => t.type === 'income' && t.currency === 'Q').reduce((s, t) => s + t.amount, 0);
    const allTimeExpenseQ = transactions.filter(t => t.type === 'expense' && t.currency === 'Q').reduce((s, t) => s + t.amount, 0);
    const allTimeIncomeUSD = transactions.filter(t => t.type === 'income' && t.currency === 'USD').reduce((s, t) => s + t.amount, 0);
    const allTimeExpenseUSD = transactions.filter(t => t.type === 'expense' && t.currency === 'USD').reduce((s, t) => s + t.amount, 0);

    const netQ = (settings.externalSavings || 0) + (allTimeIncomeQ - allTimeExpenseQ);
    const netUSD = (settings.externalSavingsUSD || 0) + (allTimeIncomeUSD - allTimeExpenseUSD);

    const fmt = (n: number, cur: string) =>
        `${n < 0 ? '-' : ''}${cur} ${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

    return (
        <View style={s.netWorthCard}>
            <Text style={s.netWorthTitle}>PATRIMONIO TOTAL</Text>
            <Text style={[s.netWorthVal, { color: netQ >= 0 ? C.textPrimary : C.danger }]}>{fmt(netQ, 'Q')}</Text>
            {netUSD !== 0 && (
                <Text style={[s.netWorthValSmall, { color: netUSD >= 0 ? "#4A9EE8" : C.danger }]}>{fmt(netUSD, 'USD')}</Text>
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// DASHBOARD PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props {
    transactions: Transaction[];
    settings: UserSettings;
    onRefresh: () => void;
    refreshing: boolean;
}

export default function DashboardScreen({ transactions, settings, onRefresh, refreshing }: Props) {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const handleSmsSync = async () => {
        try {
            const result = await SmsService.syncBankSms();
            if (result.transactions.length > 0) {
                Alert.alert(
                    "✅ Sincronización Exitosa",
                    `Se importaron ${result.transactions.length} transacción(es) nueva(s).\n\n` +
                    `📨 SMS leídos: ${result.totalRead}\n` +
                    `🏦 Bancarios detectados: ${result.totalMatched}\n` +
                    `⏭ Ya registrados: ${result.totalSkipped}`
                );
                onRefresh();
            } else {
                Alert.alert(
                    "📭 Sincronización Completa",
                    `Se revisaron ${result.totalRead} SMS.\n` +
                    `🏦 Bancarios encontrados: ${result.totalMatched}\n` +
                    `⏭ Ya registrados: ${result.totalSkipped}\n` +
                    `🚫 Sin monto/ignorados: ${result.totalIgnored}\n\n` +
                    `Todo está al día.`
                );
            }
        } catch (error) {
            Alert.alert("⚠️ Aviso", "Asegúrate de conceder permisos de lectura de SMS.");
        }
    };

    // Transacciones del mes actual
    const monthTx = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === month && d.getFullYear() === year;
    });

    // Balance en Q
    const incomeQ = monthTx.filter(t => t.type === 'income' && (t.currency === 'Q' || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const expenseQ = monthTx.filter(t => t.type === 'expense' && (t.currency === 'Q' || !t.currency)).reduce((s, t) => s + t.amount, 0);

    // Balance en USD
    const incomeUSD = monthTx.filter(t => t.type === 'income' && t.currency === 'USD').reduce((s, t) => s + t.amount, 0);
    const expenseUSD = monthTx.filter(t => t.type === 'expense' && t.currency === 'USD').reduce((s, t) => s + t.amount, 0);

    // Balance en EUR
    const incomeEUR = monthTx.filter(t => t.type === 'income' && t.currency === 'EUR').reduce((s, t) => s + t.amount, 0);
    const expenseEUR = monthTx.filter(t => t.type === 'expense' && t.currency === 'EUR').reduce((s, t) => s + t.amount, 0);

    const hasUSD = incomeUSD > 0 || expenseUSD > 0;
    const hasEUR = incomeEUR > 0 || expenseEUR > 0;

    // Gráfica últimos 6 meses (solo Q)
    const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(year, month - (5 - i), 1);
        return { label: d.toLocaleDateString("es-GT", { month: "short" }), month: d.getMonth(), year: d.getFullYear() };
    });
    const chartData = months.map(m =>
        transactions
            .filter(t => t.type === "expense" && (t.currency === 'Q' || !t.currency) &&
                new Date(t.date).getMonth() === m.month && new Date(t.date).getFullYear() === m.year)
            .reduce((s, t) => s + t.amount, 0)
    );

    const recent = [...transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5);

    const fmt = (n: number, cur = 'Q') =>
        `${cur} ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

    return (
        <ScrollView
            style={s.screen}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {/* HEADER */}
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
                <TouchableOpacity onPress={handleSmsSync} style={s.badge}>
                    <Ionicons name="sync-circle-outline" size={24} color={C.accent} />
                    <View style={s.badgeDot} />
                </TouchableOpacity>
            </View>

            {/* PATRIMONIO TOTAL */}
            <NetWorthCard transactions={transactions} settings={settings} />

            {/* BALANCE EN Q */}
            <CurrencyBalanceCard currency="Q" income={incomeQ} expense={expenseQ} />

            {/* BALANCE EN USD (solo si hay) */}
            {hasUSD && <CurrencyBalanceCard currency="USD" income={incomeUSD} expense={expenseUSD} />}

            {/* BALANCE EN EUR (solo si hay) */}
            {hasEUR && <CurrencyBalanceCard currency="EUR" income={incomeEUR} expense={expenseEUR} />}

            {/* PRESUPUESTO Q */}
            <View style={[s.card, { alignItems: "center", paddingVertical: 24 }]}>
                <Text style={[s.title, { marginBottom: 16 }]}>PRESUPUESTO MENSUAL Q</Text>
                <BudgetRing spent={expenseQ} limit={settings.budgetLimit} currency="Q" />
            </View>

            {/* PRESUPUESTO USD (solo si hay) */}
            {hasUSD && settings.budgetLimitUSD > 0 && (
                <View style={[s.card, { alignItems: "center", paddingVertical: 24 }]}>
                    <Text style={[s.title, { marginBottom: 16 }]}>PRESUPUESTO MENSUAL USD</Text>
                    <BudgetRing spent={expenseUSD} limit={settings.budgetLimitUSD} currency="USD" />
                </View>
            )}

            {/* GRÁFICA 6 MESES */}
            <View style={s.card}>
                <Text style={s.title}>GASTOS Q — ÚLTIMOS 6 MESES</Text>
                <View style={{ marginTop: 16 }}>
                    <MiniBarChart data={chartData} color={C.primary} labels={months.map(m => m.label)} />
                </View>
            </View>

            {/* RECIENTES */}
            <View style={[s.card, { marginBottom: 120 }]}>
                <Text style={[s.title, { marginBottom: 12 }]}>RECIENTES</Text>
                {recent.length === 0 ? (
                    <Text style={s.empty}>Sin transacciones aún.</Text>
                ) : (
                    recent.map(tx => {
                        const cat = getCat(tx.category, settings.customCategories);
                        const txCurrency = tx.currency || 'Q';
                        return (
                            <View key={tx.id} style={s.txItem}>
                                <View style={[s.txIconGlass, { backgroundColor: cat.color + "22", borderColor: cat.color + "44", borderTopColor: cat.color + "99", shadowColor: cat.color }]}>
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
                                        {txCurrency !== 'Q' && (
                                            <View style={{ backgroundColor: "#4A9EE833", paddingHorizontal: 6, borderRadius: 4 }}>
                                                <Text style={{ color: "#4A9EE8", fontSize: 9, fontWeight: "800" }}>{txCurrency}</Text>
                                            </View>
                                        )}
                                    </View>
                                </View>
                                <Text style={[s.txAmount, { color: tx.type === "income" ? C.income : C.expense }]}>
                                    {tx.type === "income" ? "+" : "-"}{fmt(tx.amount, txCurrency)}
                                </Text>
                            </View>
                        );
                    })
                )}
            </View>
        </ScrollView>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
    greeting: { color: C.text, fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
    month: { color: C.textPrimary, fontSize: 11, marginTop: 2, letterSpacing: 1.5, fontWeight: "700" },
    badge: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primaryDark + "33", borderWidth: 1, borderColor: C.accent + "66", alignItems: "center", justifyContent: "center" },
    badgeDot: { position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },

    // Patrimonio
    netWorthCard: { backgroundColor: C.cardHigh, borderRadius: 20, borderWidth: 1, borderColor: C.primary + "44", padding: 24, alignItems: "center", marginBottom: 14, ...shadow(C.primaryGlow, 15, 0.2) },
    netWorthTitle: { color: C.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginBottom: 8 },
    netWorthVal: { color: C.textPrimary, fontSize: 34, fontWeight: "900" },
    netWorthValSmall: { color: "#4A9EE8", fontSize: 18, fontWeight: "700", marginTop: 4 },

    // Tarjeta por moneda
    currencyCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    currencyHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    currencyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 10 },
    currencySymbol: { fontSize: 14, fontWeight: "900" },
    currencyTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 1 },
    currencyRow: { flexDirection: "row", alignItems: "center" },
    currencyItem: { flex: 1, alignItems: "center" },
    currencyLabel: { color: C.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
    currencyValue: { fontSize: 15, fontWeight: "800" },
    currencyDivider: { width: 1, height: 40, backgroundColor: C.cardBorder },

    // General
    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    title: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.8 },
    ringBg: { borderColor: C.bgDeep, alignItems: "center", justifyContent: "center" },

    // Transacciones recientes
    txItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.separator },
    txIconGlass: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginRight: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8 },
    txDesc: { color: C.text, fontSize: 14, fontWeight: "800", letterSpacing: 0.2 },
    txDate: { color: C.textMuted, fontSize: 11 },
    txAmount: { fontSize: 15, fontWeight: "800" },
    empty: { color: C.textMuted, fontSize: 13, textAlign: "center", marginVertical: 10 },
});