import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
    Alert, Animated, Easing, RefreshControl,
    ScrollView, StyleSheet, Text, TouchableOpacity, View
} from "react-native";
import {
    CategoryBudget, FixedExpense, SavingsGoal,
    Transaction, UserSettings,
    calcFinancialScore, getDaysUntilNextPayment
} from "../services/storage";
import { SmsService } from "../services/SmsService";
import { NotificationService } from "../services/NotificationService";
import { getCat } from "../categories";
import { C, shadow } from "../theme";

// ─────────────────────────────────────────────────────────────
// BARRA ANIMADA
// ─────────────────────────────────────────────────────────────
function AnimBar({ pct, color }: { pct: number; color: string }) {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, {
            toValue: Math.min(pct, 100),
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [pct]);
    const w = anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });
    return (
        <View style={{ height: 6, backgroundColor: C.bgDeep, borderRadius: 3, overflow: "hidden", borderWidth: 1, borderColor: C.cardBorder }}>
            <Animated.View style={{ height: "100%", width: w, backgroundColor: color, borderRadius: 3 }} />
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
                <View style={{
                    position: "absolute", width: 160, height: 160, borderRadius: 80, borderWidth: 14,
                    borderColor: "transparent",
                    borderTopColor: ringColor,
                    borderRightColor: pct > 0.25 ? ringColor : "transparent",
                    borderBottomColor: pct > 0.5 ? ringColor : "transparent",
                    borderLeftColor: pct > 0.75 ? ringColor : "transparent",
                    transform: [{ rotate: "-90deg" }],
                }} />
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
// SCORE FINANCIERO
// ─────────────────────────────────────────────────────────────
function ScoreWidget({ score }: { score: number }) {
    const anim = useRef(new Animated.Value(0)).current;
    const color = score >= 80 ? C.income : score >= 60 ? C.accent : score >= 40 ? C.warning : C.danger;
    const label = score >= 80 ? "Excelente" : score >= 60 ? "Bueno" : score >= 40 ? "Regular" : "Crítico";

    useEffect(() => {
        Animated.timing(anim, {
            toValue: score,
            duration: 1200,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [score]);

    const w = anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

    return (
        <View style={s.scoreCard}>
            <View style={s.scoreHeader}>
                <View style={[s.scoreIconBg, { backgroundColor: color + "22" }]}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.scoreTitle}>Score Financiero</Text>
                    <Text style={[s.scoreLabel, { color }]}>{label}</Text>
                </View>
                <Text style={[s.scoreValue, { color }]}>{score}</Text>
                <Text style={s.scoreMax}>/100</Text>
            </View>
            <View style={{ height: 8, backgroundColor: C.bgDeep, borderRadius: 4, overflow: "hidden", borderWidth: 1, borderColor: C.cardBorder }}>
                <Animated.View style={{ height: "100%", width: w, backgroundColor: color, borderRadius: 4 }} />
            </View>
            <Text style={s.scoreHint}>
                {score >= 80 ? "Disciplina financiera ejemplar. Seguí así." :
                    score >= 60 ? "Vas bien. Pequeños ajustes te llevan al siguiente nivel." :
                        score >= 40 ? "Hay oportunidades de mejora importantes." :
                            "Situación crítica. Revisa tu presupuesto urgente."}
            </Text>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// TARJETA DE BALANCE POR MONEDA
// ─────────────────────────────────────────────────────────────
function CurrencyCard({ currency, income, expense }: { currency: string; income: number; expense: number }) {
    const balance = income - expense;
    const isPositive = balance >= 0;
    const fmt = (n: number) => `${currency} ${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
    const accentColor = currency === 'Q' ? C.primary : "#4A9EE8";

    return (
        <View style={[s.currencyCard, { borderTopColor: accentColor }]}>
            <View style={s.currencyHeader}>
                <View style={[s.currencyBadge, { backgroundColor: accentColor + "22" }]}>
                    <Text style={[s.currencySymbol, { color: accentColor }]}>{currency}</Text>
                </View>
                <Text style={s.currencyTitle}>{currency === 'Q' ? 'QUETZALES' : currency === 'USD' ? 'DÓLARES' : currency}</Text>
            </View>
            <View style={s.currencyRow}>
                <View style={s.currencyItem}>
                    <Text style={s.currencyLbl}>INGRESOS</Text>
                    <Text style={[s.currencyVal, { color: C.income }]}>{fmt(income)}</Text>
                </View>
                <View style={s.currencyDivider} />
                <View style={s.currencyItem}>
                    <Text style={s.currencyLbl}>GASTOS</Text>
                    <Text style={[s.currencyVal, { color: C.expense }]}>{fmt(expense)}</Text>
                </View>
                <View style={s.currencyDivider} />
                <View style={s.currencyItem}>
                    <Text style={s.currencyLbl}>NETO</Text>
                    <Text style={[s.currencyVal, { color: isPositive ? C.income : C.danger }]}>
                        {isPositive ? "+" : "-"}{fmt(balance)}
                    </Text>
                </View>
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// WIDGET GASTOS FIJOS
// ─────────────────────────────────────────────────────────────
function FixedExpensesWidget({ fixedExpenses, onPress }: { fixedExpenses: FixedExpense[]; onPress: () => void }) {
    const active = fixedExpenses.filter(e => e.isActive);
    const paid = active.filter(e => e.isPaid).length;
    const pending = active.filter(e => !e.isPaid);
    const overdue = pending.filter(e => new Date().getDate() > e.dayOfMonth);

    if (active.length === 0) return null;

    return (
        <TouchableOpacity style={s.widgetCard} onPress={onPress} activeOpacity={0.8}>
            <View style={s.widgetHeader}>
                <Ionicons name="calendar-outline" size={18} color={C.primaryLight} />
                <Text style={s.widgetTitle}>Gastos Fijos del Mes</Text>
                <View style={[s.widgetBadge, { backgroundColor: overdue.length > 0 ? C.danger + "22" : C.income + "22" }]}>
                    <Text style={[s.widgetBadgeTxt, { color: overdue.length > 0 ? C.danger : C.income }]}>
                        {paid}/{active.length}
                    </Text>
                </View>
            </View>
            <AnimBar pct={active.length > 0 ? (paid / active.length) * 100 : 0} color={paid === active.length ? C.income : C.primary} />
            {overdue.length > 0 && (
                <Text style={s.widgetAlert}>⚠️ {overdue.length} gasto(s) vencido(s) sin pagar</Text>
            )}
            {pending.slice(0, 2).map(e => (
                <View key={e.id} style={s.widgetItem}>
                    <Ionicons name="ellipse-outline" size={12} color={C.textMuted} style={{ marginRight: 8 }} />
                    <Text style={s.widgetItemTxt} numberOfLines={1}>{e.name}</Text>
                    <Text style={s.widgetItemAmt}>{e.currency} {e.amount.toFixed(0)}</Text>
                    <Text style={s.widgetItemDay}>Día {e.dayOfMonth}</Text>
                </View>
            ))}
            {pending.length > 2 && (
                <Text style={s.widgetMore}>+{pending.length - 2} más pendientes →</Text>
            )}
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────
// WIDGET METAS DE AHORRO
// ─────────────────────────────────────────────────────────────
function GoalsWidget({ goals, onPress }: { goals: SavingsGoal[]; onPress: () => void }) {
    const active = goals.filter(g => !g.isCompleted);
    if (active.length === 0) return null;

    return (
        <TouchableOpacity style={s.widgetCard} onPress={onPress} activeOpacity={0.8}>
            <View style={s.widgetHeader}>
                <Ionicons name="trophy-outline" size={18} color={C.primaryLight} />
                <Text style={s.widgetTitle}>Metas de Ahorro</Text>
                <Text style={[s.widgetBadgeTxt, { color: C.accent }]}>{active.length} activa{active.length > 1 ? "s" : ""}</Text>
            </View>
            {active.slice(0, 2).map(goal => {
                const pct = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
                return (
                    <View key={goal.id} style={{ marginBottom: 10 }}>
                        <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                            <Text style={s.widgetItemTxt}>{goal.name}</Text>
                            <Text style={[s.widgetItemAmt, { color: goal.color }]}>{Math.round(pct)}%</Text>
                        </View>
                        <AnimBar pct={pct} color={goal.color} />
                    </View>
                );
            })}
            {active.length > 2 && (
                <Text style={s.widgetMore}>+{active.length - 2} metas más →</Text>
            )}
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────
// BRIEFING CFO
// ─────────────────────────────────────────────────────────────
function BriefingCard({ text, loading }: { text: string; loading: boolean }) {
    const fadeAnim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        if (!loading && text) {
            Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }).start();
        }
    }, [loading, text]);

    if (loading) {
        return (
            <View style={s.briefingCard}>
                <View style={s.briefingHeader}>
                    <Ionicons name="sparkles-outline" size={16} color={C.primaryLight} />
                    <Text style={s.briefingTitle}>CFO Intelligence</Text>
                </View>
                <Text style={s.briefingLoading}>Analizando tu situación financiera...</Text>
            </View>
        );
    }

    return (
        <Animated.View style={[s.briefingCard, { opacity: fadeAnim }]}>
            <View style={s.briefingHeader}>
                <Ionicons name="sparkles-outline" size={16} color={C.primaryLight} />
                <Text style={s.briefingTitle}>CFO Intelligence</Text>
                <View style={s.briefingBadge}>
                    <Text style={s.briefingBadgeTxt}>AI</Text>
                </View>
            </View>
            <Text style={s.briefingText}>{text}</Text>
        </Animated.View>
    );
}

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
// DASHBOARD PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props {
    transactions: Transaction[];
    settings: UserSettings;
    fixedExpenses: FixedExpense[];
    categoryBudgets: CategoryBudget[];
    savingsGoals: SavingsGoal[];
    onRefresh: () => void;
    refreshing: boolean;
    onNavigateBudget?: () => void;
}

export default function DashboardScreen({
    transactions, settings, fixedExpenses, categoryBudgets, savingsGoals,
    onRefresh, refreshing, onNavigateBudget,
}: Props) {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();

    const [briefing, setBriefing] = useState("");
    const [briefingLoading, setBriefingLoading] = useState(true);

    // Cargar briefing al montar
    useEffect(() => {
        const load = async () => {
            setBriefingLoading(true);
            const text = await NotificationService.getDailyBriefing(
                settings, transactions, categoryBudgets, fixedExpenses
            );
            setBriefing(text);
            setBriefingLoading(false);
        };
        load();
    }, [transactions.length]);

    const handleSmsSync = async () => {
        try {
            const result = await SmsService.syncBankSms();
            if (result.transactions.length > 0) {
                Alert.alert(
                    "✅ Sincronización Exitosa",
                    `Se importaron ${result.transactions.length} transacción(es).\n\n` +
                    `📨 SMS leídos: ${result.totalRead}\n` +
                    `🏦 Bancarios detectados: ${result.totalMatched}\n` +
                    `⏭ Ya registrados: ${result.totalSkipped}`
                );
                onRefresh();
            } else {
                Alert.alert(
                    "📭 Al día",
                    `Se revisaron ${result.totalRead} SMS.\n` +
                    `Bancarios: ${result.totalMatched} | Ya registrados: ${result.totalSkipped}\n\n` +
                    `Todo está actualizado.`
                );
            }
        } catch {
            Alert.alert("⚠️ Aviso", "Asegúrate de conceder permisos de SMS.");
        }
    };

    // Transacciones del mes
    const monthTx = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === month && d.getFullYear() === year;
    });

    const incomeQ = monthTx.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const expenseQ = monthTx.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const incomeUSD = monthTx.filter(t => t.type === "income" && t.currency === "USD").reduce((s, t) => s + t.amount, 0);
    const expenseUSD = monthTx.filter(t => t.type === "expense" && t.currency === "USD").reduce((s, t) => s + t.amount, 0);
    const hasUSD = incomeUSD > 0 || expenseUSD > 0;

    // Patrimonio total
    const allIncQ = transactions.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const allExpQ = transactions.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const allIncUSD = transactions.filter(t => t.type === "income" && t.currency === "USD").reduce((s, t) => s + t.amount, 0);
    const allExpUSD = transactions.filter(t => t.type === "expense" && t.currency === "USD").reduce((s, t) => s + t.amount, 0);
    const netQ = (settings.externalSavings || 0) + (allIncQ - allExpQ);
    const netUSD = (settings.externalSavingsUSD || 0) + (allIncUSD - allExpUSD);

    // Score
    const score = calcFinancialScore(transactions, settings, fixedExpenses, categoryBudgets);

    // Días hasta próximo pago
    const daysLeft = getDaysUntilNextPayment(settings);

    // Gráfica 6 meses
    const months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(year, month - (5 - i), 1);
        return { label: d.toLocaleDateString("es-GT", { month: "short" }), month: d.getMonth(), year: d.getFullYear() };
    });
    const chartData = months.map(mo =>
        transactions.filter(t =>
            t.type === "expense" && (t.currency === "Q" || !t.currency) &&
            new Date(t.date).getMonth() === mo.month && new Date(t.date).getFullYear() === mo.year
        ).reduce((s, t) => s + t.amount, 0)
    );

    const recent = [...transactions].sort((a, b) => +new Date(b.date) - +new Date(a.date)).slice(0, 5);
    const fmt = (n: number, cur = "Q") => `${cur} ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

    return (
        <ScrollView
            style={s.screen}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {/* HEADER */}
            <View style={s.header}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <View style={s.logoBox}>
                        <Ionicons name="wallet-outline" size={26} color="#1A0E00" />
                    </View>
                    <View>
                        <Text style={s.greeting}>Hola, {settings.userName}</Text>
                        <Text style={s.month}>{now.toLocaleDateString("es-GT", { month: "long", year: "numeric" }).toUpperCase()}</Text>
                    </View>
                </View>
                <View style={{ flexDirection: "row", gap: 8 }}>
                    {daysLeft > 0 && settings.paymentCycle !== "irregular" && (
                        <View style={[s.daysBadge, { borderColor: daysLeft <= 3 ? C.danger + "66" : C.cardBorder }]}>
                            <Ionicons name="time-outline" size={12} color={daysLeft <= 3 ? C.danger : C.textMuted} />
                            <Text style={[s.daysBadgeTxt, { color: daysLeft <= 3 ? C.danger : C.textMuted }]}>{daysLeft}d</Text>
                        </View>
                    )}
                    <TouchableOpacity onPress={handleSmsSync} style={s.syncBtn}>
                        <Ionicons name="sync-circle-outline" size={24} color={C.accent} />
                        <View style={s.syncDot} />
                    </TouchableOpacity>
                </View>
            </View>

            {/* BRIEFING CFO */}
            <BriefingCard text={briefing} loading={briefingLoading} />

            {/* SCORE FINANCIERO */}
            <ScoreWidget score={score} />

            {/* PATRIMONIO TOTAL */}
            <View style={s.netWorthCard}>
                <Text style={s.netWorthTitle}>PATRIMONIO TOTAL</Text>
                <Text style={[s.netWorthVal, { color: netQ >= 0 ? C.textPrimary : C.danger }]}>
                    {netQ < 0 ? "-" : ""}Q {Math.abs(netQ).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}
                </Text>
                {netUSD !== 0 && (
                    <Text style={[s.netWorthValSub, { color: netUSD >= 0 ? "#4A9EE8" : C.danger }]}>
                        {netUSD < 0 ? "-" : "+"}USD {Math.abs(netUSD).toFixed(2)}
                    </Text>
                )}
            </View>

            {/* BALANCE Q */}
            <CurrencyCard currency="Q" income={incomeQ} expense={expenseQ} />

            {/* BALANCE USD */}
            {hasUSD && <CurrencyCard currency="USD" income={incomeUSD} expense={expenseUSD} />}

            {/* PRESUPUESTO Q */}
            <View style={[s.card, { alignItems: "center", paddingVertical: 24 }]}>
                <Text style={[s.sectionTitle, { marginBottom: 16 }]}>PRESUPUESTO MENSUAL Q</Text>
                <BudgetRing spent={expenseQ} limit={settings.budgetLimit} currency="Q" />
            </View>

            {/* WIDGETS PRESUPUESTO */}
            <FixedExpensesWidget fixedExpenses={fixedExpenses} onPress={onNavigateBudget || (() => { })} />
            <GoalsWidget goals={savingsGoals} onPress={onNavigateBudget || (() => { })} />

            {/* GRÁFICA 6 MESES */}
            <View style={s.card}>
                <Text style={s.sectionTitle}>GASTOS Q — ÚLTIMOS 6 MESES</Text>
                <View style={{ marginTop: 16 }}>
                    <MiniBarChart data={chartData} color={C.primary} labels={months.map(m => m.label)} />
                </View>
            </View>

            {/* RECIENTES */}
            <View style={[s.card, { marginBottom: 120 }]}>
                <Text style={[s.sectionTitle, { marginBottom: 12 }]}>RECIENTES</Text>
                {recent.length === 0 ? (
                    <Text style={s.empty}>Sin transacciones aún.</Text>
                ) : recent.map(tx => {
                    const cat = getCat(tx.category, settings.customCategories);
                    const txCurrency = tx.currency || "Q";
                    return (
                        <View key={tx.id} style={s.txItem}>
                            <View style={[s.txIcon, { backgroundColor: cat.color + "22", borderColor: cat.color + "44", shadowColor: cat.color }]}>
                                <Ionicons name={cat.icon} size={20} color={cat.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.txDesc} numberOfLines={1}>{tx.description || cat.label}</Text>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                                    <Text style={s.txDate}>{new Date(tx.date).toLocaleDateString("es-GT", { day: "2-digit", month: "short" })}</Text>
                                    {tx.bank && (
                                        <View style={s.bankBadge}>
                                            <Text style={s.bankBadgeTxt}>{tx.bank}</Text>
                                        </View>
                                    )}
                                    {txCurrency !== "Q" && (
                                        <View style={[s.bankBadge, { backgroundColor: "#4A9EE822" }]}>
                                            <Text style={[s.bankBadgeTxt, { color: "#4A9EE8" }]}>{txCurrency}</Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                            <Text style={[s.txAmount, { color: tx.type === "income" ? C.income : C.expense }]}>
                                {tx.type === "income" ? "+" : "-"}{fmt(tx.amount, txCurrency)}
                            </Text>
                        </View>
                    );
                })}
            </View>
        </ScrollView>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },

    // Header
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
    logoBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", marginRight: 12 },
    greeting: { color: C.text, fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
    month: { color: C.textPrimary, fontSize: 11, marginTop: 2, letterSpacing: 1.5, fontWeight: "700" },
    daysBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, backgroundColor: C.card },
    daysBadgeTxt: { fontSize: 11, fontWeight: "700" },
    syncBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primaryDark + "33", borderWidth: 1, borderColor: C.accent + "66", alignItems: "center", justifyContent: "center" },
    syncDot: { position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },

    // Briefing
    briefingCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.primary + "33", borderLeftWidth: 3, borderLeftColor: C.primary, padding: 16, marginBottom: 14, ...shadow(C.primaryGlow, 8, 0.2) },
    briefingHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    briefingTitle: { color: C.primaryLight, fontSize: 12, fontWeight: "800", letterSpacing: 1, flex: 1 },
    briefingBadge: { backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 },
    briefingBadgeTxt: { color: "#1A0E00", fontSize: 10, fontWeight: "900" },
    briefingText: { color: C.text, fontSize: 13, lineHeight: 20 },
    briefingLoading: { color: C.textMuted, fontSize: 13, fontStyle: "italic" },

    // Score
    scoreCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    scoreHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
    scoreIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    scoreTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", flex: 1 },
    scoreLabel: { fontSize: 11, fontWeight: "700" },
    scoreValue: { fontSize: 32, fontWeight: "900" },
    scoreMax: { color: C.textMuted, fontSize: 14, marginLeft: 2, alignSelf: "flex-end", marginBottom: 4 },
    scoreHint: { color: C.textMuted, fontSize: 12, marginTop: 8 },

    // Patrimonio
    netWorthCard: { backgroundColor: C.cardHigh, borderRadius: 20, borderWidth: 1, borderColor: C.primary + "44", padding: 24, alignItems: "center", marginBottom: 14, ...shadow(C.primaryGlow, 15, 0.2) },
    netWorthTitle: { color: C.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1.5, marginBottom: 8 },
    netWorthVal: { fontSize: 34, fontWeight: "900" },
    netWorthValSub: { fontSize: 18, fontWeight: "700", marginTop: 4 },

    // Balance moneda
    currencyCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopWidth: 3, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    currencyHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    currencyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 10 },
    currencySymbol: { fontSize: 14, fontWeight: "900" },
    currencyTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 1 },
    currencyRow: { flexDirection: "row", alignItems: "center" },
    currencyItem: { flex: 1, alignItems: "center" },
    currencyLbl: { color: C.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
    currencyVal: { fontSize: 15, fontWeight: "800" },
    currencyDivider: { width: 1, height: 40, backgroundColor: C.cardBorder },

    // Widgets
    widgetCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    widgetHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    widgetTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", flex: 1 },
    widgetBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    widgetBadgeTxt: { fontSize: 12, fontWeight: "800" },
    widgetAlert: { color: C.danger, fontSize: 11, fontWeight: "700", marginTop: 6, marginBottom: 6 },
    widgetItem: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
    widgetItemTxt: { flex: 1, color: C.text, fontSize: 13, fontWeight: "600" },
    widgetItemAmt: { color: C.textPrimary, fontSize: 13, fontWeight: "800", marginRight: 8 },
    widgetItemDay: { color: C.textMuted, fontSize: 11 },
    widgetMore: { color: C.primaryLight, fontSize: 12, fontWeight: "700", marginTop: 6, textAlign: "right" },

    // General
    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    sectionTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.8 },
    ringBg: { borderColor: C.bgDeep, alignItems: "center", justifyContent: "center" },

    // Recientes
    txItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.separator },
    txIcon: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginRight: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8 },
    txDesc: { color: C.text, fontSize: 14, fontWeight: "800" },
    txDate: { color: C.textMuted, fontSize: 11 },
    txAmount: { fontSize: 15, fontWeight: "800" },
    bankBadge: { backgroundColor: C.primary + "33", paddingHorizontal: 6, borderRadius: 4 },
    bankBadgeTxt: { color: C.primaryLight, fontSize: 9, fontWeight: "800" },
    empty: { color: C.textMuted, fontSize: 13, textAlign: "center", marginVertical: 10 },
});