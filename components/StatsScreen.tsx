import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
    Animated, Easing, ScrollView, StyleSheet,
    Text, TouchableOpacity, View
} from "react-native";
import { Transaction, UserSettings, getDaysUntilNextPayment } from "../services/storage";
import { EXPENSE_CATEGORIES, getCat } from "../categories";
import { C, shadow } from "../theme";

// ─────────────────────────────────────────────────────────────
// BARRA ANIMADA
// ─────────────────────────────────────────────────────────────
function AnimBar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
    const anim = useRef(new Animated.Value(0)).current;
    React.useEffect(() => {
        Animated.timing(anim, {
            toValue: Math.min(pct, 100),
            duration: 900,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [pct]);
    const w = anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });
    return (
        <View style={[ab.track, { height }]}>
            <Animated.View style={[ab.fill, { width: w, backgroundColor: color, height }]} />
        </View>
    );
}
const ab = StyleSheet.create({
    track: { backgroundColor: C.bgDeep, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: C.cardBorder },
    fill: { borderRadius: 6 },
});

// ─────────────────────────────────────────────────────────────
// MINI GRÁFICA DE LÍNEA
// ─────────────────────────────────────────────────────────────
function LineChart({ data, color, labels, height = 80 }: {
    data: number[]; color: string; labels: string[]; height?: number;
}) {
    const max = Math.max(...data, 1);
    const pts = data.map((v, i) => ({
        x: (i / (data.length - 1)) * 100,
        y: 100 - (v / max) * 90,
    }));

    return (
        <View style={{ height, position: "relative" }}>
            {/* Grid lines */}
            {[25, 50, 75].map(y => (
                <View key={y} style={{ position: "absolute", left: 0, right: 0, top: `${y}%`, height: 1, backgroundColor: C.cardBorder, opacity: 0.5 }} />
            ))}
            {/* Puntos y líneas */}
            {pts.map((pt, i) => (
                <React.Fragment key={i}>
                    {i > 0 && (
                        <View style={{
                            position: "absolute",
                            left: `${pts[i - 1].x}%`,
                            top: `${Math.min(pts[i - 1].y, pt.y)}%`,
                            width: `${pt.x - pts[i - 1].x}%`,
                            height: Math.abs(pt.y - pts[i - 1].y) + 1,
                            backgroundColor: color,
                            opacity: 0.6,
                        }} />
                    )}
                    <View style={{
                        position: "absolute",
                        left: `${pt.x}%`,
                        top: `${pt.y}%`,
                        width: 8, height: 8,
                        borderRadius: 4,
                        backgroundColor: color,
                        marginLeft: -4, marginTop: -4,
                        ...shadow(color, 4, 0.6),
                    }} />
                </React.Fragment>
            ))}
            {/* Labels */}
            <View style={{ position: "absolute", bottom: -18, left: 0, right: 0, flexDirection: "row", justifyContent: "space-between" }}>
                {labels.map((l, i) => (
                    <Text key={i} style={{ color: C.textMuted, fontSize: 9, textAlign: "center" }}>{l}</Text>
                ))}
            </View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// MINI BARRAS VERTICALES
// ─────────────────────────────────────────────────────────────
function VertBars({ data, color, labels }: { data: number[]; color: string; labels: string[] }) {
    const max = Math.max(...data, 1);
    return (
        <View style={{ flexDirection: "row", alignItems: "flex-end", height: 70, gap: 4 }}>
            {data.map((v, i) => (
                <View key={i} style={{ flex: 1, alignItems: "center" }}>
                    <View style={{ width: "80%", height: Math.max(4, (v / max) * 60), backgroundColor: color, borderRadius: 3, opacity: i === data.length - 1 ? 1 : 0.5 }} />
                    <Text style={{ color: C.textMuted, fontSize: 8, marginTop: 3 }}>{labels[i]}</Text>
                </View>
            ))}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// TARJETA DE STAT
// ─────────────────────────────────────────────────────────────
function StatCard({ icon, title, value, subtitle, color, children }: {
    icon: any; title: string; value: string; subtitle?: string; color: string; children?: React.ReactNode;
}) {
    return (
        <View style={[sc.card, { borderTopColor: color }]}>
            <View style={sc.header}>
                <View style={[sc.iconBg, { backgroundColor: color + "22" }]}>
                    <Ionicons name={icon} size={18} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={sc.title}>{title}</Text>
                </View>
            </View>
            <Text style={[sc.value, { color }]}>{value}</Text>
            {subtitle && <Text style={sc.subtitle}>{subtitle}</Text>}
            {children}
        </View>
    );
}
const sc = StyleSheet.create({
    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopWidth: 3, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    iconBg: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    title: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
    value: { fontSize: 28, fontWeight: "900", marginBottom: 4 },
    subtitle: { color: C.textMuted, fontSize: 12, lineHeight: 17 },
});

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props { transactions: Transaction[]; settings: UserSettings; }

export default function StatsScreen({ transactions, settings }: Props) {
    const [period, setPeriod] = useState<"month" | "all">("month");

    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();

    // Filtrar por período
    const filtered = period === "month"
        ? transactions.filter(t => {
            const d = new Date(t.date);
            return d.getMonth() === m && d.getFullYear() === y;
        })
        : transactions;

    const expensesQ = filtered.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency));
    const incomesQ = filtered.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency));
    const totalExp = expensesQ.reduce((s, t) => s + t.amount, 0);
    const totalInc = incomesQ.reduce((s, t) => s + t.amount, 0);
    const savings = totalInc - totalExp;
    const savingsRate = totalInc > 0 ? (savings / totalInc) * 100 : 0;
    const fmt = (n: number) => `Q ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

    // ── STAT 1: Flujo de caja proyectado ──────────────────────
    const daysPassed = now.getDate();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysLeft = getDaysUntilNextPayment(settings);
    const dailyRate = totalExp / Math.max(daysPassed, 1);
    const projected = dailyRate * daysInMonth;
    const projectedBalance = totalInc - projected;

    // ── STAT 2: Comparativa mes a mes (6 meses) ───────────────
    const last6Months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(y, m - (5 - i), 1);
        return { label: d.toLocaleDateString("es-GT", { month: "short" }), month: d.getMonth(), year: d.getFullYear() };
    });
    const expByMonth = last6Months.map(mo =>
        transactions.filter(t =>
            t.type === "expense" && (t.currency === "Q" || !t.currency) &&
            new Date(t.date).getMonth() === mo.month && new Date(t.date).getFullYear() === mo.year
        ).reduce((s, t) => s + t.amount, 0)
    );
    const incByMonth = last6Months.map(mo =>
        transactions.filter(t =>
            t.type === "income" && (t.currency === "Q" || !t.currency) &&
            new Date(t.date).getMonth() === mo.month && new Date(t.date).getFullYear() === mo.year
        ).reduce((s, t) => s + t.amount, 0)
    );

    // ── STAT 3: Patrimonio neto histórico ─────────────────────
    const netWorthByMonth = last6Months.map((_, i) => {
        const cumInc = last6Months.slice(0, i + 1).reduce((s, mo) =>
            s + transactions.filter(t =>
                t.type === "income" && (t.currency === "Q" || !t.currency) &&
                new Date(t.date).getMonth() === mo.month && new Date(t.date).getFullYear() === mo.year
            ).reduce((ss, t) => ss + t.amount, 0), 0);
        const cumExp = last6Months.slice(0, i + 1).reduce((s, mo) =>
            s + transactions.filter(t =>
                t.type === "expense" && (t.currency === "Q" || !t.currency) &&
                new Date(t.date).getMonth() === mo.month && new Date(t.date).getFullYear() === mo.year
            ).reduce((ss, t) => ss + t.amount, 0), 0);
        return Math.max(cumInc - cumExp + (settings.externalSavings || 0), 0);
    });

    // ── STAT 4: Gasto promedio diario ─────────────────────────
    const avgDaily = totalExp / Math.max(daysPassed, 1);
    const avgDailyBudget = settings.budgetLimit / daysInMonth;
    const dailyPct = (avgDaily / avgDailyBudget) * 100;

    // ── STAT 5: Días sin gastar ───────────────────────────────
    const daysWithExpense = new Set(
        expensesQ.map(t => new Date(t.date).toDateString())
    ).size;
    const daysWithoutExpense = Math.max(daysPassed - daysWithExpense, 0);
    // Racha actual
    let streak = 0;
    let checkDay = new Date(y, m, now.getDate());
    while (streak < 30) {
        const dayStr = checkDay.toDateString();
        const hasExp = expensesQ.some(t => new Date(t.date).toDateString() === dayStr);
        if (hasExp) break;
        streak++;
        checkDay.setDate(checkDay.getDate() - 1);
    }

    // ── STAT 6: Desglose por banco ────────────────────────────
    const banks = ["BAC", "BANRURAL", "GTC", "BANTRAB", "PROMERICA", "Banco"];
    const byBank = banks.map(bank => ({
        bank,
        amount: expensesQ.filter(t => t.bank === bank).reduce((s, t) => s + t.amount, 0),
        count: expensesQ.filter(t => t.bank === bank).length,
    })).filter(b => b.amount > 0).sort((a, b) => b.amount - a.amount);
    const bankMax = Math.max(...byBank.map(b => b.amount), 1);

    // ── STAT 7: Top 5 comercios / descripción ─────────────────
    const descMap: Record<string, number> = {};
    expensesQ.forEach(t => {
        const key = t.description.split(":")[0].trim().substring(0, 20);
        descMap[key] = (descMap[key] || 0) + t.amount;
    });
    const top5 = Object.entries(descMap)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5);
    const top5Max = Math.max(...top5.map(e => e[1]), 1);

    // ── STAT 8: Ratio deuda / ingreso ─────────────────────────
    const debtRatio = settings.monthlyIncome > 0
        ? (settings.activeDebts / settings.monthlyIncome) * 100
        : 0;
    const debtRatioColor = debtRatio > 40 ? C.danger : debtRatio > 20 ? C.warning : C.income;

    // ── STAT 9: Velocidad de gasto ────────────────────────────
    const prevMonthExp = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === "expense" && (t.currency === "Q" || !t.currency) &&
            d.getMonth() === (m === 0 ? 11 : m - 1) && d.getFullYear() === (m === 0 ? y - 1 : y);
    }).reduce((s, t) => s + t.amount, 0);
    const velocityDiff = totalExp - prevMonthExp;
    const velocityPct = prevMonthExp > 0 ? (Math.abs(velocityDiff) / prevMonthExp) * 100 : 0;

    // ── STAT 10: Proyección a 6 y 12 meses ───────────────────
    const avgMonthlyExp = expByMonth.reduce((s, v) => s + v, 0) / 6;
    const avgMonthlyInc = incByMonth.reduce((s, v) => s + v, 0) / 6;
    const avgMonthlySav = avgMonthlyInc - avgMonthlyExp;
    const proj6 = (settings.externalSavings || 0) + avgMonthlySav * 6;
    const proj12 = (settings.externalSavings || 0) + avgMonthlySav * 12;

    // ── Categorías ────────────────────────────────────────────
    const byCat = EXPENSE_CATEGORIES.map(cat => ({
        ...cat,
        sum: expensesQ.filter(t => t.category === cat.id).reduce((s, t) => s + t.amount, 0),
        pct: totalExp > 0 ? (expensesQ.filter(t => t.category === cat.id).reduce((s, t) => s + t.amount, 0) / totalExp) * 100 : 0,
    })).filter(c => c.sum > 0).sort((a, b) => b.sum - a.sum);

    return (
        <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>

            {/* TÍTULO */}
            <View style={s.pageHeader}>
                <Text style={s.pageTitle}>Estadísticas</Text>
                <Text style={s.pageSubtitle}>Análisis completo de tu economía</Text>
            </View>

            {/* FILTRO */}
            <View style={s.filterRow}>
                {(["month", "all"] as const).map(p => (
                    <TouchableOpacity key={p} style={[s.filterTab, period === p && s.filterTabActive]} onPress={() => setPeriod(p)}>
                        <Text style={[s.filterTxt, period === p && s.filterTxtActive]}>
                            {p === "month" ? "Este Mes" : "Todo el Tiempo"}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            {/* RESUMEN RÁPIDO */}
            <View style={s.quickRow}>
                <View style={[s.quickCard, { borderTopColor: C.income }]}>
                    <Text style={s.quickLbl}>INGRESOS</Text>
                    <Text style={[s.quickVal, { color: C.income }]}>Q {totalInc.toFixed(0)}</Text>
                </View>
                <View style={[s.quickCard, { borderTopColor: C.expense }]}>
                    <Text style={s.quickLbl}>GASTOS</Text>
                    <Text style={[s.quickVal, { color: C.expense }]}>Q {totalExp.toFixed(0)}</Text>
                </View>
                <View style={[s.quickCard, { borderTopColor: savings >= 0 ? C.accent : C.danger }]}>
                    <Text style={s.quickLbl}>AHORRO</Text>
                    <Text style={[s.quickVal, { color: savings >= 0 ? C.accent : C.danger }]}>
                        {savings >= 0 ? "+" : ""}Q {savings.toFixed(0)}
                    </Text>
                </View>
            </View>

            {/* STAT 1 — FLUJO DE CAJA PROYECTADO */}
            <StatCard
                icon="trending-up-outline"
                title="Flujo de Caja Proyectado"
                value={fmt(projected)}
                subtitle={`A este ritmo (Q${avgDaily.toFixed(0)}/día), proyectas gastar Q${projected.toFixed(0)} este mes. ${projectedBalance >= 0 ? `Te sobraría Q${projectedBalance.toFixed(0)}.` : `Te faltarían Q${Math.abs(projectedBalance).toFixed(0)}.`} Días hasta próximo ingreso: ${daysLeft}.`}
                color={projectedBalance >= 0 ? C.income : C.danger}
            />

            {/* STAT 2 — COMPARATIVA MES A MES */}
            <StatCard
                icon="bar-chart-outline"
                title="Comparativa Últimos 6 Meses"
                value=""
                subtitle=""
                color={C.primary}
            >
                <Text style={s.chartLabel}>GASTOS</Text>
                <VertBars data={expByMonth} color={C.expense} labels={last6Months.map(m => m.label)} />
                <View style={{ height: 28 }} />
                <Text style={s.chartLabel}>INGRESOS</Text>
                <VertBars data={incByMonth} color={C.income} labels={last6Months.map(m => m.label)} />
                <View style={{ height: 20 }} />
                {velocityDiff !== 0 && (
                    <View style={[s.trendBadge, { backgroundColor: velocityDiff > 0 ? C.danger + "22" : C.income + "22" }]}>
                        <Ionicons name={velocityDiff > 0 ? "trending-up" : "trending-down"} size={14} color={velocityDiff > 0 ? C.danger : C.income} />
                        <Text style={{ color: velocityDiff > 0 ? C.danger : C.income, fontSize: 12, fontWeight: "700", marginLeft: 6 }}>
                            {velocityDiff > 0 ? "+" : "-"}Q{Math.abs(velocityDiff).toFixed(0)} vs mes anterior ({velocityPct.toFixed(0)}%)
                        </Text>
                    </View>
                )}
            </StatCard>

            {/* STAT 3 — PATRIMONIO NETO HISTÓRICO */}
            <StatCard
                icon="diamond-outline"
                title="Patrimonio Neto Histórico"
                value={`Q ${(netWorthByMonth[netWorthByMonth.length - 1] || 0).toFixed(0)}`}
                subtitle="Evolución acumulada de tu patrimonio en Q en los últimos 6 meses."
                color={C.primaryLight}
            >
                <View style={{ marginTop: 12, paddingBottom: 24 }}>
                    <LineChart
                        data={netWorthByMonth}
                        color={C.primaryLight}
                        labels={last6Months.map(m => m.label)}
                        height={80}
                    />
                </View>
            </StatCard>

            {/* STAT 4 — GASTO PROMEDIO DIARIO */}
            <StatCard
                icon="today-outline"
                title="Gasto Promedio Diario"
                value={`Q ${avgDaily.toFixed(2)}/día`}
                subtitle={`Tu presupuesto diario ideal es Q${avgDailyBudget.toFixed(2)}/día. Vas al ${Math.round(dailyPct)}% de ese límite.`}
                color={dailyPct > 100 ? C.danger : dailyPct > 80 ? C.warning : C.accent}
            >
                <AnimBar pct={dailyPct} color={dailyPct > 100 ? C.danger : dailyPct > 80 ? C.warning : C.accent} height={8} />
            </StatCard>

            {/* STAT 5 — DÍAS SIN GASTAR */}
            <StatCard
                icon="shield-checkmark-outline"
                title="Días Sin Gastar"
                value={`${daysWithoutExpense} días`}
                subtitle={`${streak > 0 ? `Racha actual: ${streak} días consecutivos sin gastos. ` : ""}De ${daysPassed} días transcurridos, gastaste en ${daysWithExpense}.`}
                color={streak >= 3 ? C.income : C.textSub}
            >
                {streak >= 3 && (
                    <View style={[s.trendBadge, { backgroundColor: C.income + "22", marginTop: 8 }]}>
                        <Ionicons name="flame-outline" size={14} color={C.income} />
                        <Text style={{ color: C.income, fontSize: 12, fontWeight: "700", marginLeft: 6 }}>
                            🔥 ¡Racha de {streak} días sin gastar!
                        </Text>
                    </View>
                )}
            </StatCard>

            {/* STAT 6 — DESGLOSE POR BANCO */}
            {byBank.length > 0 && (
                <StatCard
                    icon="business-outline"
                    title="Gasto por Banco / Tarjeta"
                    value=""
                    subtitle=""
                    color="#4A9EE8"
                >
                    {byBank.map(b => (
                        <View key={b.bank} style={s.bankRow}>
                            <View style={s.bankInfo}>
                                <Text style={s.bankName}>{b.bank}</Text>
                                <Text style={s.bankCount}>{b.count} transacciones</Text>
                            </View>
                            <View style={{ flex: 1, marginHorizontal: 12 }}>
                                <AnimBar pct={(b.amount / bankMax) * 100} color="#4A9EE8" height={6} />
                            </View>
                            <Text style={s.bankAmount}>Q {b.amount.toFixed(0)}</Text>
                        </View>
                    ))}
                </StatCard>
            )}

            {/* STAT 7 — TOP 5 COMERCIOS */}
            {top5.length > 0 && (
                <StatCard
                    icon="storefront-outline"
                    title="Top 5 Lugares de Gasto"
                    value=""
                    subtitle=""
                    color={C.warning}
                >
                    {top5.map(([desc, amount], i) => (
                        <View key={i} style={s.topRow}>
                            <View style={[s.topRank, { backgroundColor: i === 0 ? C.primary : C.bgDeep }]}>
                                <Text style={[s.topRankTxt, { color: i === 0 ? "#1A0E00" : C.textMuted }]}>{i + 1}</Text>
                            </View>
                            <Text style={s.topDesc} numberOfLines={1}>{desc}</Text>
                            <View style={{ flex: 1, marginHorizontal: 10 }}>
                                <AnimBar pct={(amount / top5Max) * 100} color={C.warning} height={5} />
                            </View>
                            <Text style={s.topAmount}>Q {amount.toFixed(0)}</Text>
                        </View>
                    ))}
                </StatCard>
            )}

            {/* STAT 8 — RATIO DEUDA / INGRESO */}
            {settings.activeDebts > 0 && (
                <StatCard
                    icon="alert-circle-outline"
                    title="Ratio Deuda / Ingreso"
                    value={`${debtRatio.toFixed(1)}%`}
                    subtitle={
                        debtRatio > 40
                            ? "⚠️ Ratio peligroso. Más del 40% de tu ingreso mensual es deuda. Prioriza reducirla."
                            : debtRatio > 20
                                ? "📊 Ratio moderado. Puedes manejarlo pero busca reducirlo."
                                : "✅ Ratio saludable. Tu deuda está bajo control."
                    }
                    color={debtRatioColor}
                >
                    <AnimBar pct={Math.min(debtRatio, 100)} color={debtRatioColor} height={8} />
                    <View style={s.debtRow}>
                        <Text style={s.debtLbl}>Deuda: Q {settings.activeDebts.toFixed(0)}</Text>
                        <Text style={s.debtLbl}>Ingreso mensual: Q {settings.monthlyIncome.toFixed(0)}</Text>
                    </View>
                </StatCard>
            )}

            {/* STAT 9 — VELOCIDAD DE GASTO */}
            <StatCard
                icon="speedometer-outline"
                title="Velocidad de Gasto"
                value={velocityDiff === 0 ? "Sin cambio" : `${velocityDiff > 0 ? "+" : ""}Q ${velocityDiff.toFixed(0)}`}
                subtitle={
                    velocityDiff > 0
                        ? `Gastás Q${velocityDiff.toFixed(0)} más que el mes pasado (${velocityPct.toFixed(0)}% más rápido). Revisa qué categorías subieron.`
                        : velocityDiff < 0
                            ? `Gastás Q${Math.abs(velocityDiff).toFixed(0)} menos que el mes pasado (${velocityPct.toFixed(0)}% más lento). ¡Buen trabajo!`
                            : "Sin datos suficientes para comparar."
                }
                color={velocityDiff > 0 ? C.danger : velocityDiff < 0 ? C.income : C.textSub}
            />

            {/* STAT 10 — PROYECCIÓN PATRIMONIO */}
            <StatCard
                icon="rocket-outline"
                title="Proyección de Patrimonio"
                value={`Q ${Math.max(proj6, 0).toFixed(0)} en 6 meses`}
                subtitle={`A tu ritmo actual de ahorro (Q${avgMonthlySav.toFixed(0)}/mes), tu patrimonio en 12 meses sería Q${Math.max(proj12, 0).toFixed(0)}. ${avgMonthlySav < 0 ? "⚠️ Estás en negativo — gastas más de lo que ingresás." : ""}`}
                color={avgMonthlySav >= 0 ? C.primaryLight : C.danger}
            >
                <View style={{ marginTop: 10, paddingBottom: 24 }}>
                    <LineChart
                        data={[
                            settings.externalSavings || 0,
                            Math.max((settings.externalSavings || 0) + avgMonthlySav * 2, 0),
                            Math.max((settings.externalSavings || 0) + avgMonthlySav * 4, 0),
                            Math.max((settings.externalSavings || 0) + avgMonthlySav * 6, 0),
                            Math.max((settings.externalSavings || 0) + avgMonthlySav * 9, 0),
                            Math.max((settings.externalSavings || 0) + avgMonthlySav * 12, 0),
                        ]}
                        color={avgMonthlySav >= 0 ? C.primaryLight : C.danger}
                        labels={["Hoy", "2m", "4m", "6m", "9m", "12m"]}
                        height={80}
                    />
                </View>
            </StatCard>

            {/* DESGLOSE POR CATEGORÍA */}
            <View style={s.card}>
                <View style={s.cardHeader}>
                    <View style={[s.cardIcon, { backgroundColor: C.primary + "22" }]}>
                        <Ionicons name="pie-chart-outline" size={18} color={C.primaryLight} />
                    </View>
                    <Text style={s.cardTitle}>Desglose por Categoría</Text>
                </View>

                <View style={s.savingsRateRow}>
                    <Text style={s.savingsRateLbl}>Tasa de Ahorro</Text>
                    <Text style={[s.savingsRateVal, { color: savingsRate >= 20 ? C.income : savingsRate >= 0 ? C.warning : C.danger }]}>
                        {savingsRate.toFixed(1)}%
                    </Text>
                </View>
                <AnimBar pct={Math.max(0, Math.min(savingsRate, 100))} color={savingsRate >= 20 ? C.income : savingsRate >= 0 ? C.warning : C.danger} height={6} />
                <Text style={[s.savingsHint, { color: savingsRate >= 20 ? C.income : C.warning }]}>
                    {savingsRate >= 20 ? "✅ Excelente — superás el 20% recomendado" : savingsRate >= 0 ? "⚠️ Bajo — apunta al 20% mínimo" : "🔴 Negativo — gastás más de lo que ingresás"}
                </Text>

                <View style={{ marginTop: 16 }}>
                    {byCat.length === 0 ? (
                        <Text style={s.empty}>Sin gastos en este período.</Text>
                    ) : byCat.map(cat => (
                        <View key={cat.id} style={{ marginBottom: 14 }}>
                            <View style={s.catRow}>
                                <View style={[s.catIcon, { backgroundColor: cat.color + "22" }]}>
                                    <Ionicons name={cat.icon} size={14} color={cat.color} />
                                </View>
                                <Text style={s.catName}>{cat.label}</Text>
                                <Text style={s.catAmt}>Q {cat.sum.toFixed(0)}</Text>
                                <Text style={s.catPct}>{cat.pct.toFixed(0)}%</Text>
                            </View>
                            <AnimBar pct={cat.pct} color={cat.color} height={5} />
                        </View>
                    ))}
                </View>
            </View>

            <View style={{ height: 120 }} />
        </ScrollView>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    pageHeader: { marginBottom: 20 },
    pageTitle: { color: C.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: 0.5 },
    pageSubtitle: { color: C.textSub, fontSize: 13, marginTop: 4 },
    filterRow: { flexDirection: "row", gap: 8, marginBottom: 20 },
    filterTab: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: "center", backgroundColor: C.bgDeep },
    filterTabActive: { borderColor: C.primary, borderTopColor: C.primaryLight, backgroundColor: C.primaryDark + "33", ...shadow(C.primaryGlow, 6, 0.3) },
    filterTxt: { color: C.textSub, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
    filterTxtActive: { color: C.primaryLight, fontWeight: "900" },

    // Quick cards
    quickRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    quickCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, borderTopWidth: 2, padding: 12, alignItems: "center" },
    quickLbl: { color: C.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
    quickVal: { fontSize: 15, fontWeight: "900" },

    // Chart
    chartLabel: { color: C.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
    trendBadge: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 10, marginTop: 4 },

    // Banco
    bankRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    bankInfo: { width: 80 },
    bankName: { color: C.text, fontSize: 12, fontWeight: "700" },
    bankCount: { color: C.textMuted, fontSize: 10 },
    bankAmount: { color: C.textPrimary, fontSize: 13, fontWeight: "800", width: 60, textAlign: "right" },

    // Top 5
    topRow: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    topRank: { width: 24, height: 24, borderRadius: 12, alignItems: "center", justifyContent: "center", marginRight: 8, backgroundColor: C.bgDeep },
    topRankTxt: { fontSize: 11, fontWeight: "900" },
    topDesc: { width: 90, color: C.text, fontSize: 12, fontWeight: "600" },
    topAmount: { color: C.textPrimary, fontSize: 12, fontWeight: "800", width: 55, textAlign: "right" },

    // Deuda
    debtRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 8 },
    debtLbl: { color: C.textMuted, fontSize: 11 },

    // Categorías
    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
    cardIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    cardTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5 },
    savingsRateRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    savingsRateLbl: { color: C.textSub, fontSize: 12, fontWeight: "600" },
    savingsRateVal: { fontSize: 18, fontWeight: "900" },
    savingsHint: { fontSize: 11, marginTop: 6, marginBottom: 16 },
    catRow: { flexDirection: "row", alignItems: "center", marginBottom: 6 },
    catIcon: { width: 24, height: 24, borderRadius: 6, alignItems: "center", justifyContent: "center", marginRight: 8 },
    catName: { flex: 1, color: C.text, fontSize: 13, fontWeight: "600" },
    catAmt: { color: C.textSub, fontSize: 12, fontWeight: "700", marginRight: 8 },
    catPct: { color: C.textMuted, fontSize: 11, width: 30, textAlign: "right" },
    empty: { color: C.textMuted, fontSize: 13, textAlign: "center" },
});