import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
    Animated, Dimensions, Easing, ScrollView,
    StyleSheet, Text, TouchableOpacity, View
} from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { Transaction, UserSettings, getDaysUntilNextPayment } from "../services/storage";
import { EXPENSE_CATEGORIES, getCat } from "../categories";
import { C, shadow } from "../theme";

const { width } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────
// BARRA ANIMADA
// ─────────────────────────────────────────────────────────────
function AnimBar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
    const anim = useRef(new Animated.Value(0)).current;
    React.useEffect(() => {
        Animated.timing(anim, { toValue: Math.min(pct, 100), duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }, [pct]);
    const w = anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });
    return (
        <View style={{ height, backgroundColor: C.bgDeep, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: C.cardBorder }}>
            <Animated.View style={{ height: "100%", width: w, backgroundColor: color, borderRadius: 6 }} />
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// GRÁFICA DE PASTEL SVG
// ─────────────────────────────────────────────────────────────
interface PieSlice { id: string; label: string; value: number; pct: number; color: string; icon: string; }

function PieChart({ slices, selected, onSelect }: {
    slices: PieSlice[];
    selected: string | null;
    onSelect: (id: string | null) => void;
}) {
    const size = width * 0.72;
    const cx = size / 2;
    const cy = size / 2;
    const radius = size * 0.38;
    const inner = size * 0.22;

    let cumAngle = -90; // Empezar desde arriba

    const polarToCartesian = (angle: number, r: number) => {
        const rad = (angle * Math.PI) / 180;
        return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
    };

    const slicePath = (startAngle: number, endAngle: number, isSelected: boolean) => {
        const r = isSelected ? radius + 8 : radius;
        const inn = isSelected ? inner - 2 : inner;
        const s = polarToCartesian(startAngle, r);
        const e = polarToCartesian(endAngle, r);
        const si = polarToCartesian(startAngle, inn);
        const ei = polarToCartesian(endAngle, inn);
        const large = endAngle - startAngle > 180 ? 1 : 0;
        return `M ${s.x} ${s.y} A ${r} ${r} 0 ${large} 1 ${e.x} ${e.y} L ${ei.x} ${ei.y} A ${inn} ${inn} 0 ${large} 0 ${si.x} ${si.y} Z`;
    };

    const total = slices.reduce((s, sl) => s + sl.value, 0);
    const selectedSlice = slices.find(s => s.id === selected);

    return (
        <View style={{ alignItems: "center" }}>
            <Svg width={size} height={size}>
                <G>
                    {slices.map((slice, i) => {
                        const angle = (slice.pct / 100) * 360;
                        const startAngle = cumAngle;
                        const endAngle = cumAngle + angle - 1;
                        cumAngle += angle;
                        const isSelected = selected === slice.id;

                        return (
                            <G key={slice.id} onPress={() => onSelect(isSelected ? null : slice.id)}>
                                <Path
                                    d={slicePath(startAngle, endAngle, isSelected)}
                                    fill={slice.color}
                                    opacity={selected && !isSelected ? 0.45 : 1}
                                />
                            </G>
                        );
                    })}
                    {/* Centro */}
                    <Circle cx={cx} cy={cy} r={inner - 2} fill={C.card} />
                    {/* Texto centro */}
                    {selectedSlice ? (
                        <>
                            <SvgText x={cx} y={cy - 8} textAnchor="middle" fill={selectedSlice.color} fontSize="18" fontWeight="900">
                                {selectedSlice.pct.toFixed(0)}%
                            </SvgText>
                            <SvgText x={cx} y={cy + 12} textAnchor="middle" fill={C.textMuted} fontSize="10">
                                {selectedSlice.label}
                            </SvgText>
                        </>
                    ) : (
                        <>
                            <SvgText x={cx} y={cy - 6} textAnchor="middle" fill={C.textPrimary} fontSize="14" fontWeight="900">
                                Q {(total / 1000).toFixed(1)}k
                            </SvgText>
                            <SvgText x={cx} y={cy + 12} textAnchor="middle" fill={C.textMuted} fontSize="10">
                                TOTAL
                            </SvgText>
                        </>
                    )}
                </G>
            </Svg>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// STAT CARD
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
                <Text style={sc.title}>{title}</Text>
            </View>
            {value ? <Text style={[sc.value, { color }]}>{value}</Text> : null}
            {subtitle && <Text style={sc.subtitle}>{subtitle}</Text>}
            {children}
        </View>
    );
}

const sc = StyleSheet.create({
    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopWidth: 3, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    iconBg: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    title: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5, flex: 1 },
    value: { fontSize: 28, fontWeight: "900", marginBottom: 4 },
    subtitle: { color: C.textMuted, fontSize: 12, lineHeight: 17 },
});

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
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props { transactions: Transaction[]; settings: UserSettings; }

export default function StatsScreen({ transactions, settings }: Props) {
    const [period, setPeriod] = useState<"month" | "year" | "all">("month");
    const [selectedSlice, setSelectedSlice] = useState<string | null>(null);

    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();

    // Filtrar por período
    const filtered = period === "month"
        ? transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === m && d.getFullYear() === y; })
        : period === "year"
            ? transactions.filter(t => new Date(t.date).getFullYear() === y)
            : transactions;

    const expensesQ = filtered.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency));
    const incomesQ = filtered.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency));
    const totalExp = expensesQ.reduce((s, t) => s + t.amount, 0);
    const totalInc = incomesQ.reduce((s, t) => s + t.amount, 0);
    const savings = totalInc - totalExp;
    const savingsRate = totalInc > 0 ? (savings / totalInc) * 100 : 0;
    const fmt = (n: number) => `Q ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

    // ── Datos para pastel ─────────────────────────────────────
    const byCat: PieSlice[] = EXPENSE_CATEGORIES
        .map(cat => {
            const sum = expensesQ.filter(t => t.category === cat.id).reduce((s, t) => s + t.amount, 0);
            return { id: cat.id, label: cat.label, value: sum, pct: totalExp > 0 ? (sum / totalExp) * 100 : 0, color: cat.color, icon: cat.icon };
        })
        .filter(c => c.value > 0)
        .sort((a, b) => b.value - a.value);

    const selectedCatData = byCat.find(s => s.id === selectedSlice);

    // ── Stats ────────────────────────────────────────────────
    const daysPassed = now.getDate();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const daysLeft = getDaysUntilNextPayment(settings);
    const dailyRate = totalExp / Math.max(daysPassed, 1);
    const projected = dailyRate * daysInMonth;
    const projBalance = totalInc - projected;

    const last6Months = Array.from({ length: 6 }, (_, i) => {
        const d = new Date(y, m - (5 - i), 1);
        return { label: d.toLocaleDateString("es-GT", { month: "short" }), month: d.getMonth(), year: d.getFullYear() };
    });

    const expByMonth = last6Months.map(mo =>
        transactions.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency) &&
            new Date(t.date).getMonth() === mo.month && new Date(t.date).getFullYear() === mo.year
        ).reduce((s, t) => s + t.amount, 0)
    );
    const incByMonth = last6Months.map(mo =>
        transactions.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency) &&
            new Date(t.date).getMonth() === mo.month && new Date(t.date).getFullYear() === mo.year
        ).reduce((s, t) => s + t.amount, 0)
    );

    const netWorthByMonth = last6Months.map((_, i) => {
        const cumInc = last6Months.slice(0, i + 1).reduce((s, mo) =>
            s + transactions.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency) &&
                new Date(t.date).getMonth() === mo.month && new Date(t.date).getFullYear() === mo.year
            ).reduce((ss, t) => ss + t.amount, 0), 0);
        const cumExp = last6Months.slice(0, i + 1).reduce((s, mo) =>
            s + transactions.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency) &&
                new Date(t.date).getMonth() === mo.month && new Date(t.date).getFullYear() === mo.year
            ).reduce((ss, t) => ss + t.amount, 0), 0);
        return Math.max(cumInc - cumExp + (settings.externalSavings || 0), 0);
    });

    const avgDaily = totalExp / Math.max(daysPassed, 1);
    const avgDailyBudget = settings.budgetLimit / daysInMonth;
    const dailyPct = (avgDaily / avgDailyBudget) * 100;

    const daysWithExpense = new Set(expensesQ.map(t => new Date(t.date).toDateString())).size;
    const daysWithoutExpense = Math.max(daysPassed - daysWithExpense, 0);

    const prevMonthExp = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === "expense" && (t.currency === "Q" || !t.currency) &&
            d.getMonth() === (m === 0 ? 11 : m - 1) && d.getFullYear() === (m === 0 ? y - 1 : y);
    }).reduce((s, t) => s + t.amount, 0);
    const velocityDiff = totalExp - prevMonthExp;
    const velocityPct = prevMonthExp > 0 ? (Math.abs(velocityDiff) / prevMonthExp) * 100 : 0;

    const avgMonthlyExp = expByMonth.reduce((s, v) => s + v, 0) / 6;
    const avgMonthlyInc = incByMonth.reduce((s, v) => s + v, 0) / 6;
    const avgMonthlySav = avgMonthlyInc - avgMonthlyExp;
    const proj6 = (settings.externalSavings || 0) + avgMonthlySav * 6;
    const proj12 = (settings.externalSavings || 0) + avgMonthlySav * 12;

    const banks = ["BAC", "BANRURAL", "GTC", "BANTRAB", "PROMERICA", "Banco"];
    const byBank = banks.map(bank => ({
        bank,
        amount: expensesQ.filter(t => t.bank === bank).reduce((s, t) => s + t.amount, 0),
        count: expensesQ.filter(t => t.bank === bank).length,
    })).filter(b => b.amount > 0).sort((a, b) => b.amount - a.amount);
    const bankMax = Math.max(...byBank.map(b => b.amount), 1);

    const debtRatio = settings.monthlyIncome > 0 ? (settings.activeDebts / settings.monthlyIncome) * 100 : 0;
    const debtColor = debtRatio > 40 ? C.danger : debtRatio > 20 ? C.warning : C.income;

    return (
        <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>

            {/* TÍTULO */}
            <View style={s.pageHeader}>
                <Text style={s.pageTitle}>Estadísticas</Text>
                <Text style={s.pageSubtitle}>Análisis completo de tu economía</Text>
            </View>

            {/* FILTRO PERÍODO */}
            <View style={s.filterRow}>
                {(["month", "year", "all"] as const).map(p => (
                    <TouchableOpacity key={p} style={[s.filterTab, period === p && s.filterTabActive]} onPress={() => { setPeriod(p); setSelectedSlice(null); }}>
                        <Text style={[s.filterTxt, period === p && s.filterTxtActive]}>
                            {p === "month" ? "Este Mes" : p === "year" ? "Este Año" : "Todo"}
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

            {/* ── GRÁFICA DE PASTEL ── */}
            {byCat.length > 0 && (
                <View style={s.card}>
                    <View style={s.cardHeader}>
                        <View style={[s.cardIcon, { backgroundColor: C.primary + "22" }]}>
                            <Ionicons name="pie-chart-outline" size={18} color={C.primaryLight} />
                        </View>
                        <Text style={s.cardTitle}>
                            Desglose por Categoría — {period === "month" ? "Este Mes" : period === "year" ? "Este Año" : "Historial"}
                        </Text>
                    </View>

                    <PieChart slices={byCat} selected={selectedSlice} onSelect={setSelectedSlice} />

                    {/* Detalle de slice seleccionado */}
                    {selectedCatData && (
                        <View style={[s.sliceDetail, { borderColor: selectedCatData.color + "55", backgroundColor: selectedCatData.color + "11" }]}>
                            <Ionicons name={selectedCatData.icon as any} size={20} color={selectedCatData.color} />
                            <View style={{ flex: 1, marginLeft: 10 }}>
                                <Text style={[s.sliceName, { color: selectedCatData.color }]}>{selectedCatData.label}</Text>
                                <Text style={s.sliceAmt}>Q {selectedCatData.value.toFixed(2)}</Text>
                            </View>
                            <Text style={[s.slicePct, { color: selectedCatData.color }]}>{selectedCatData.pct.toFixed(1)}%</Text>
                        </View>
                    )}

                    {/* Leyenda */}
                    <View style={{ marginTop: 16 }}>
                        {byCat.slice(0, 6).map(cat => (
                            <TouchableOpacity
                                key={cat.id}
                                style={[s.legendRow, selectedSlice === cat.id && { backgroundColor: cat.color + "11", borderRadius: 8 }]}
                                onPress={() => setSelectedSlice(selectedSlice === cat.id ? null : cat.id)}
                            >
                                <View style={[s.legendDot, { backgroundColor: cat.color }]} />
                                <Ionicons name={cat.icon as any} size={14} color={cat.color} style={{ marginRight: 6 }} />
                                <Text style={s.legendLabel}>{cat.label}</Text>
                                <View style={{ flex: 1, marginHorizontal: 10 }}>
                                    <AnimBar pct={cat.pct} color={cat.color} height={5} />
                                </View>
                                <Text style={s.legendAmt}>Q {cat.value.toFixed(0)}</Text>
                                <Text style={[s.legendPct, { color: cat.color }]}>{cat.pct.toFixed(0)}%</Text>
                            </TouchableOpacity>
                        ))}
                        {byCat.length > 6 && (
                            <Text style={{ color: C.textMuted, fontSize: 11, textAlign: "center", marginTop: 6 }}>
                                +{byCat.length - 6} categorías más
                            </Text>
                        )}
                    </View>

                    {/* Tasa de ahorro */}
                    <View style={[s.savingsRow, { marginTop: 16 }]}>
                        <Text style={s.savingsLbl}>Tasa de Ahorro</Text>
                        <Text style={[s.savingsVal, { color: savingsRate >= 20 ? C.income : savingsRate >= 0 ? C.warning : C.danger }]}>
                            {savingsRate.toFixed(1)}%
                        </Text>
                    </View>
                    <AnimBar pct={Math.max(0, Math.min(savingsRate, 100))} color={savingsRate >= 20 ? C.income : savingsRate >= 0 ? C.warning : C.danger} />
                    <Text style={[s.savingsHint, { color: savingsRate >= 20 ? C.income : C.warning }]}>
                        {savingsRate >= 20 ? "✅ Excelente — superás el 20% recomendado" : savingsRate >= 0 ? "⚠️ Bajo — apunta al 20% mínimo" : "🔴 Negativo — gastás más de lo que ingresás"}
                    </Text>
                </View>
            )}

            {/* STAT 1 — Flujo proyectado */}
            <StatCard icon="trending-up-outline" title="Flujo de Caja Proyectado" value={fmt(projected)} color={projBalance >= 0 ? C.income : C.danger}
                subtitle={`A este ritmo (Q${avgDaily.toFixed(0)}/día), proyectas gastar Q${projected.toFixed(0)} este mes. ${projBalance >= 0 ? `Te sobraría Q${projBalance.toFixed(0)}.` : `Te faltarían Q${Math.abs(projBalance).toFixed(0)}.`} Días hasta próximo ingreso: ${daysLeft}.`}
            />

            {/* STAT 2 — Comparativa mes a mes */}
            <StatCard icon="bar-chart-outline" title="Comparativa Últimos 6 Meses" value="" color={C.primary}>
                <Text style={s.chartLabel}>GASTOS</Text>
                <VertBars data={expByMonth} color={C.expense} labels={last6Months.map(m => m.label)} />
                <View style={{ height: 28 }} />
                <Text style={s.chartLabel}>INGRESOS</Text>
                <VertBars data={incByMonth} color={C.income} labels={last6Months.map(m => m.label)} />
                {velocityDiff !== 0 && (
                    <View style={[s.trendBadge, { backgroundColor: velocityDiff > 0 ? C.danger + "22" : C.income + "22", marginTop: 12 }]}>
                        <Ionicons name={velocityDiff > 0 ? "trending-up" : "trending-down"} size={14} color={velocityDiff > 0 ? C.danger : C.income} />
                        <Text style={{ color: velocityDiff > 0 ? C.danger : C.income, fontSize: 12, fontWeight: "700", marginLeft: 6 }}>
                            {velocityDiff > 0 ? "+" : "-"}Q{Math.abs(velocityDiff).toFixed(0)} vs mes anterior ({velocityPct.toFixed(0)}%)
                        </Text>
                    </View>
                )}
            </StatCard>

            {/* STAT 3 — Patrimonio histórico */}
            <StatCard icon="diamond-outline" title="Patrimonio Neto Histórico" value={`Q ${(netWorthByMonth[netWorthByMonth.length - 1] || 0).toFixed(0)}`} color={C.primaryLight}
                subtitle="Evolución acumulada de tu patrimonio en Q en los últimos 6 meses."
            >
                <View style={{ marginTop: 12 }}>
                    <VertBars data={netWorthByMonth} color={C.primaryLight} labels={last6Months.map(m => m.label)} />
                </View>
            </StatCard>

            {/* STAT 4 — Gasto promedio diario */}
            <StatCard icon="today-outline" title="Gasto Promedio Diario" value={`Q ${avgDaily.toFixed(2)}/día`} color={dailyPct > 100 ? C.danger : dailyPct > 80 ? C.warning : C.accent}
                subtitle={`Tu presupuesto diario ideal es Q${avgDailyBudget.toFixed(2)}/día. Vas al ${Math.round(dailyPct)}% de ese límite.`}
            >
                <AnimBar pct={dailyPct} color={dailyPct > 100 ? C.danger : dailyPct > 80 ? C.warning : C.accent} />
            </StatCard>

            {/* STAT 5 — Días sin gastar */}
            <StatCard icon="shield-checkmark-outline" title="Días Sin Gastar" value={`${daysWithoutExpense} días`} color={daysWithoutExpense >= 3 ? C.income : C.textSub}
                subtitle={`De ${daysPassed} días transcurridos, gastaste en ${daysWithExpense}.`}
            />

            {/* STAT 6 — Desglose por banco */}
            {byBank.length > 0 && (
                <StatCard icon="business-outline" title="Gasto por Banco / Tarjeta" value="" color="#4A9EE8">
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

            {/* STAT 7 — Ratio deuda/ingreso */}
            {settings.activeDebts > 0 && (
                <StatCard icon="alert-circle-outline" title="Ratio Deuda / Ingreso" value={`${debtRatio.toFixed(1)}%`} color={debtColor}
                    subtitle={debtRatio > 40 ? "⚠️ Ratio peligroso. Más del 40% de tu ingreso mensual es deuda." : debtRatio > 20 ? "📊 Ratio moderado. Busca reducirlo progresivamente." : "✅ Ratio saludable. Tu deuda está bajo control."}
                >
                    <AnimBar pct={Math.min(debtRatio, 100)} color={debtColor} />
                </StatCard>
            )}

            {/* STAT 8 — Velocidad de gasto */}
            <StatCard icon="speedometer-outline" title="Velocidad de Gasto" value={velocityDiff === 0 ? "Sin cambio" : `${velocityDiff > 0 ? "+" : ""}Q ${velocityDiff.toFixed(0)}`}
                color={velocityDiff > 0 ? C.danger : velocityDiff < 0 ? C.income : C.textSub}
                subtitle={velocityDiff > 0 ? `Gastás Q${velocityDiff.toFixed(0)} más que el mes pasado (${velocityPct.toFixed(0)}% más rápido).` : velocityDiff < 0 ? `Gastás Q${Math.abs(velocityDiff).toFixed(0)} menos que el mes pasado. ¡Buen trabajo!` : "Sin datos para comparar."}
            />

            {/* STAT 9 — Proyección patrimonio */}
            <StatCard icon="rocket-outline" title="Proyección de Patrimonio" value={`Q ${Math.max(proj6, 0).toFixed(0)} en 6 meses`} color={avgMonthlySav >= 0 ? C.primaryLight : C.danger}
                subtitle={`A tu ritmo actual de ahorro (Q${avgMonthlySav.toFixed(0)}/mes), tu patrimonio en 12 meses sería Q${Math.max(proj12, 0).toFixed(0)}.${avgMonthlySav < 0 ? " ⚠️ Estás en negativo." : ""}`}
            />

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
    quickRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    quickCard: { flex: 1, backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, borderTopWidth: 2, padding: 12, alignItems: "center" },
    quickLbl: { color: C.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
    quickVal: { fontSize: 15, fontWeight: "900" },
    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
    cardIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    cardTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5, flex: 1 },
    sliceDetail: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 12 },
    sliceName: { fontSize: 14, fontWeight: "800" },
    sliceAmt: { color: C.textSub, fontSize: 12, marginTop: 2 },
    slicePct: { fontSize: 22, fontWeight: "900" },
    legendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    legendLabel: { color: C.text, fontSize: 12, fontWeight: "600", width: 80 },
    legendAmt: { color: C.textSub, fontSize: 11, fontWeight: "700", width: 55, textAlign: "right" },
    legendPct: { fontSize: 11, fontWeight: "900", width: 35, textAlign: "right" },
    savingsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    savingsLbl: { color: C.textSub, fontSize: 12, fontWeight: "600" },
    savingsVal: { fontSize: 18, fontWeight: "900" },
    savingsHint: { fontSize: 11, marginTop: 6 },
    chartLabel: { color: C.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
    trendBadge: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 10 },
    bankRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    bankInfo: { width: 80 },
    bankName: { color: C.text, fontSize: 12, fontWeight: "700" },
    bankCount: { color: C.textMuted, fontSize: 10 },
    bankAmount: { color: C.textPrimary, fontSize: 13, fontWeight: "800", width: 60, textAlign: "right" },
});