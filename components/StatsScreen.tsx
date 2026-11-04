import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
    Animated, Easing, ScrollView,
    StyleSheet, Text, TouchableOpacity, useWindowDimensions, View
} from "react-native";
import Svg, { Circle, G, Path, Text as SvgText } from "react-native-svg";
import { Transaction, UserSettings, getCurrentFinancialPeriod, getDaysUntilNextPayment } from "../services/storage";
import { EXPENSE_CATEGORIES } from "../categories";
import { C } from "../theme";
import { useTutorialRef, useTutorialScroll } from "../context/TutorialContext";
import { GlassCard } from "./GlassCard";
import { GlassSegmented } from "./GlassSegmented";
import { GradientText } from "./GradientText";
import { HelpButton } from "./HelpButton";
import { ScreenHeader } from "./ScreenHeader";

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
        <View style={{ height, backgroundColor: C.glassInput, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: C.glassBorder }}>
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
    const { width } = useWindowDimensions();
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
                    {slices.map((slice) => {
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
                    <Circle cx={cx} cy={cy} r={inner - 2} fill={C.bg} />
                    {/* Texto centro */}
                    {selectedSlice ? (
                        <>
                            <SvgText x={cx} y={cy - 8} textAnchor="middle" fill={selectedSlice.color} fontSize="18" fontWeight="900">
                                {selectedSlice.pct.toFixed(0)}%
                            </SvgText>
                            <SvgText x={cx} y={cy + 12} textAnchor="middle" fill={C.textSub} fontSize="10">
                                {selectedSlice.label}
                            </SvgText>
                        </>
                    ) : (
                        <>
                            <SvgText x={cx} y={cy - 6} textAnchor="middle" fill={C.textPrimary} fontSize="14" fontWeight="900">
                                Q {(total / 1000).toFixed(1)}k
                            </SvgText>
                            <SvgText x={cx} y={cy + 12} textAnchor="middle" fill={C.textSub} fontSize="10">
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
function StatCard({ icon, title, value, subtitle, color, children, tutRef }: {
    icon: any; title: string; value: string; subtitle?: string; color: string; children?: React.ReactNode;
    tutRef?: (n: View | null) => void;
}) {
    // Valores positivos/destacables en bronce; neutros y negativos en color plano
    const highlight = color === C.primaryLight || color === C.income;
    const valueStyle = { fontSize: value.length > 14 ? 22 : 28, fontWeight: "900" as const };
    return (
        <View ref={tutRef} collapsable={false} style={sc.wrap}>
            <GlassCard radius={16} blur={false} topAccentColor={color} topAccentWidth={3} contentStyle={sc.content}>
                <View style={sc.header}>
                    <View style={[sc.iconBg, { backgroundColor: color + "22" }]}>
                        <Ionicons name={icon} size={18} color={color} />
                    </View>
                    <Text style={sc.title}>{title}</Text>
                </View>
                {value ? (
                    highlight ? (
                        <View style={sc.valueWrap}>
                            <GradientText text={value} style={valueStyle} />
                        </View>
                    ) : (
                        <Text style={[sc.value, valueStyle, { color }]}>{value}</Text>
                    )
                ) : null}
                {subtitle && <Text style={sc.subtitle}>{subtitle}</Text>}
                {children}
            </GlassCard>
        </View>
    );
}

const sc = StyleSheet.create({
    wrap: { marginBottom: 14 },
    content: { padding: 16 },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    iconBg: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    title: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5, flex: 1 },
    value: { marginBottom: 4 },
    valueWrap: { alignSelf: "flex-start", maxWidth: "100%", marginBottom: 4 },
    subtitle: { color: C.textSub, fontSize: 12, lineHeight: 17 },
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
                    <Text style={{ color: C.textSub, fontSize: 10, marginTop: 3 }}>{labels[i]}</Text>
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
    const [period, setPeriod] = useState<"current" | "prev" | "year" | "all">("current");
    const [selectedSlice, setSelectedSlice] = useState<string | null>(null);

    const headerRef = useTutorialRef('stats_header');
    const filterRef = useTutorialRef('stats_filter');
    const quickRef = useTutorialRef('stats_quick');
    const pieRef = useTutorialRef('stats_pie');
    const projRef = useTutorialRef('stats_projected');
    const compareRef = useTutorialRef('stats_compare');
    const accumulatedRef = useTutorialRef('stats_accumulated');
    const dailyRef = useTutorialRef('stats_daily');
    const noSpendRef = useTutorialRef('stats_nospend');
    const banksRef = useTutorialRef('stats_banks');
    const debtRef = useTutorialRef('stats_debt');
    const velocityRef = useTutorialRef('stats_velocity');
    const savingsProjRef = useTutorialRef('stats_savings_projection');
    const statsScroll = useTutorialScroll('stats');

    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();

    const fp = getCurrentFinancialPeriod(settings);

    // Filtrar por período
    const filtered = period === "current"
        ? transactions.filter(t => { const d = new Date(t.date); return d >= fp.start && d <= fp.end; })
        : period === "prev"
            ? transactions.filter(t => { const d = new Date(t.date); return d >= fp.prevStart && d <= fp.prevEnd; })
            : period === "year"
                ? transactions.filter(t => new Date(t.date).getFullYear() === y)
                : transactions;

    const periodLabel = period === "current" ? fp.label
        : period === "prev" ? fp.prevLabel
        : period === "year" ? `Año ${y}` : "Historial completo";

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
    const daysLeft = getDaysUntilNextPayment(settings);

    // Días inclusivos entre dos fechas (ignora horas)
    const dayDiff = (a: Date, b: Date) => Math.round((new Date(b.getFullYear(), b.getMonth(), b.getDate()).getTime() - new Date(a.getFullYear(), a.getMonth(), a.getDate()).getTime()) / 86400000) + 1;

    let daysElapsed: number;
    let daysTotal: number;
    if (period === "current") {
        daysElapsed = fp.daysPassed;
        daysTotal = fp.daysTotal;
    } else if (period === "prev") {
        daysElapsed = daysTotal = dayDiff(fp.prevStart, fp.prevEnd);
    } else if (period === "year") {
        daysElapsed = dayDiff(new Date(y, 0, 1), now);
        daysTotal = dayDiff(new Date(y, 0, 1), new Date(y, 11, 31));
    } else {
        const validDates = filtered.map(t => new Date(t.date)).filter(d => !isNaN(d.getTime()));
        if (validDates.length > 0) {
            const minDate = new Date(Math.min(...validDates.map(d => d.getTime())));
            daysElapsed = daysTotal = dayDiff(minDate, now);
        } else {
            daysElapsed = daysTotal = 1;
        }
    }
    daysElapsed = Math.max(daysElapsed, 1);
    daysTotal = Math.max(daysTotal, 1);

    const dailyRate = totalExp / daysElapsed;
    const projected = dailyRate * daysTotal;
    const projIncome = period === "current" ? totalInc : (totalInc / daysElapsed) * daysTotal;
    const projBalance = projIncome - projected;

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

    const avgDaily = dailyRate;
    const avgDailyBudget = settings.budgetLimit / Math.max(fp.daysTotal, 1);
    const dailyPct = avgDailyBudget > 0 ? (avgDaily / avgDailyBudget) * 100 : 0;

    const daysWithExpense = new Set(expensesQ.map(t => new Date(t.date).toDateString())).size;
    const daysWithoutExpense = Math.max(daysElapsed - daysWithExpense, 0);

    const prevPeriodExp = transactions.filter(t => {
        const d = new Date(t.date);
        return t.type === "expense" && (t.currency === "Q" || !t.currency) &&
            d >= fp.prevStart && d <= fp.prevEnd;
    }).reduce((s, t) => s + t.amount, 0);
    const velocityDiff = totalExp - prevPeriodExp;
    const velocityPct = prevPeriodExp > 0 ? (Math.abs(velocityDiff) / prevPeriodExp) * 100 : 0;

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

    // ── Subtítulo STAT 1 (Flujo de Caja Proyectado) ──────────
    const stat1Subtitle = period === "current"
        ? `A este ritmo (Q${avgDaily.toFixed(0)}/día), proyectas gastar Q${projected.toFixed(0)} este período. ${projBalance >= 0 ? `Te sobraría Q${projBalance.toFixed(0)}.` : `Te faltarían Q${Math.abs(projBalance).toFixed(0)}.`} Días hasta próximo ingreso: ${daysLeft}.`
        : period === "year"
            ? `A este ritmo (Q${avgDaily.toFixed(0)}/día), proyectas gastar Q${projected.toFixed(0)} este año. ${projBalance >= 0 ? `Te sobraría Q${projBalance.toFixed(0)}.` : `Te faltarían Q${Math.abs(projBalance).toFixed(0)}.`}`
            : `Gastaste Q${projected.toFixed(0)} en ${periodLabel} (Q${avgDaily.toFixed(0)}/día). ${projBalance >= 0 ? `Te sobró Q${projBalance.toFixed(0)}.` : `Te faltaron Q${Math.abs(projBalance).toFixed(0)}.`}`;

    const savingsColor = savingsRate >= 20 ? C.income : savingsRate >= 0 ? C.warning : C.danger;

    return (
        <ScrollView
            ref={statsScroll.ref}
            onScroll={statsScroll.onScroll}
            scrollEventThrottle={statsScroll.scrollEventThrottle}
            style={s.screen}
            showsVerticalScrollIndicator={false}
        >

            {/* TÍTULO */}
            <ScreenHeader
                title="Estadísticas"
                subtitle="Análisis completo de tu economía"
                right={<HelpButton tutorialId="tutorial_stats" />}
                headerRef={headerRef}
            />

            {/* FILTRO PERÍODO */}
            <GlassSegmented
                containerRef={filterRef}
                value={period}
                onChange={(v) => { setPeriod(v); setSelectedSlice(null); }}
                options={[
                    { value: "current", label: "Per. Actual" },
                    { value: "prev", label: "Per. Anterior" },
                    { value: "year", label: "Este Año" },
                    { value: "all", label: "Todo" },
                ]}
                style={{ marginBottom: 14 }}
            />

            {/* ETIQUETA PERÍODO ACTIVO */}
            <View style={s.periodRow}>
                <Ionicons name="calendar-outline" size={14} color={C.textSub} />
                <Text style={s.periodTxt} numberOfLines={1}>{periodLabel}</Text>
            </View>

            {/* RESUMEN RÁPIDO */}
            <View ref={quickRef} collapsable={false} style={s.quickRow}>
                <GlassCard radius={14} blur={false} topAccentColor={C.income} topAccentWidth={2} style={s.quickCard} contentStyle={s.quickContent}>
                    <Text style={s.quickLbl}>INGRESOS</Text>
                    <Text style={[s.quickVal, { color: C.income }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Q {totalInc.toFixed(0)}</Text>
                </GlassCard>
                <GlassCard radius={14} blur={false} topAccentColor={C.expense} topAccentWidth={2} style={s.quickCard} contentStyle={s.quickContent}>
                    <Text style={s.quickLbl}>GASTOS</Text>
                    <Text style={[s.quickVal, { color: C.expense }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>Q {totalExp.toFixed(0)}</Text>
                </GlassCard>
                <GlassCard radius={14} blur={false} topAccentColor={savings >= 0 ? C.accent : C.danger} topAccentWidth={2} style={s.quickCard} contentStyle={s.quickContent}>
                    <Text style={s.quickLbl}>AHORRO</Text>
                    <Text style={[s.quickVal, { color: savings >= 0 ? C.accent : C.danger }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                        {savings >= 0 ? "+" : ""}Q {savings.toFixed(0)}
                    </Text>
                </GlassCard>
            </View>

            {/* ── GRÁFICA DE PASTEL ── */}
            {byCat.length > 0 && (
                <View ref={pieRef} collapsable={false} style={s.cardWrap}>
                    <GlassCard radius={16} blur={false} contentStyle={s.cardContent}>
                        <View style={s.cardHeader}>
                            <View style={[s.cardIcon, { backgroundColor: C.primary + "22" }]}>
                                <Ionicons name="pie-chart-outline" size={18} color={C.primaryLight} />
                            </View>
                            <Text style={s.cardTitle}>
                                Desglose por Categoría — {periodLabel}
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
                                    <Text style={s.legendLabel} numberOfLines={1}>{cat.label}</Text>
                                    <View style={{ flex: 1, marginHorizontal: 10 }}>
                                        <AnimBar pct={cat.pct} color={cat.color} height={5} />
                                    </View>
                                    <Text style={s.legendAmt}>Q {cat.value.toFixed(0)}</Text>
                                    <Text style={[s.legendPct, { color: cat.color }]}>{cat.pct.toFixed(0)}%</Text>
                                </TouchableOpacity>
                            ))}
                            {byCat.length > 6 && (
                                <Text style={{ color: C.textSub, fontSize: 11, textAlign: "center", marginTop: 6 }}>
                                    +{byCat.length - 6} categorías más
                                </Text>
                            )}
                        </View>

                        {/* Tasa de ahorro */}
                        <View style={[s.savingsRow, { marginTop: 16 }]}>
                            <Text style={s.savingsLbl}>Tasa de Ahorro</Text>
                            <Text style={[s.savingsVal, { color: savingsColor }]}>
                                {savingsRate.toFixed(1)}%
                            </Text>
                        </View>
                        <AnimBar pct={Math.max(0, Math.min(savingsRate, 100))} color={savingsColor} />
                        <Text style={[s.savingsHint, { color: savingsRate >= 20 ? C.income : C.warning }]}>
                            {savingsRate >= 20 ? "Excelente: superás el 20% recomendado" : savingsRate >= 0 ? "Bajo: apuntá al 20% mínimo" : "Negativo: gastás más de lo que ingresás"}
                        </Text>
                    </GlassCard>
                </View>
            )}

            {/* STAT 1 — Flujo proyectado */}
            <StatCard tutRef={projRef} icon="trending-up-outline" title="Flujo de Caja Proyectado" value={fmt(projected)} color={projBalance >= 0 ? C.income : C.danger}
                subtitle={stat1Subtitle}
            />

            {/* STAT 2 — Comparativa mes a mes */}
            <StatCard tutRef={compareRef} icon="bar-chart-outline" title="Comparativa Últimos 6 Meses" value="" color={C.primary}>
                <Text style={s.chartLabel}>GASTOS</Text>
                <VertBars data={expByMonth} color={C.expense} labels={last6Months.map(m => m.label)} />
                <View style={{ height: 28 }} />
                <Text style={s.chartLabel}>INGRESOS</Text>
                <VertBars data={incByMonth} color={C.income} labels={last6Months.map(m => m.label)} />
                {period === "current" && velocityDiff !== 0 && (
                    <View style={[s.trendBadge, { backgroundColor: velocityDiff > 0 ? C.danger + "22" : C.income + "22", marginTop: 12 }]}>
                        <Ionicons name={velocityDiff > 0 ? "trending-up" : "trending-down"} size={14} color={velocityDiff > 0 ? C.danger : C.income} />
                        <Text style={{ flexShrink: 1, color: velocityDiff > 0 ? C.danger : C.income, fontSize: 12, fontWeight: "700", marginLeft: 6 }}>
                            {velocityDiff > 0 ? "+" : "-"}Q{Math.abs(velocityDiff).toFixed(0)} vs período anterior ({velocityPct.toFixed(0)}%)
                        </Text>
                    </View>
                )}
            </StatCard>

            {/* STAT 3 — Ahorro acumulado (flujo de transacciones, no saldo de cuentas) */}
            <StatCard tutRef={accumulatedRef} icon="diamond-outline" title="Ahorro Acumulado" value={`Q ${(netWorthByMonth[netWorthByMonth.length - 1] || 0).toFixed(0)}`} color={C.primaryLight}
                subtitle="Ingresos menos gastos registrados en Q, acumulado en los últimos 6 meses. No es el saldo de tus cuentas (eso lo ves en Cuentas y en el Dashboard) — es tu tendencia de ahorro según lo que fuiste registrando."
            >
                <View style={{ marginTop: 12 }}>
                    <VertBars data={netWorthByMonth} color={C.primaryLight} labels={last6Months.map(m => m.label)} />
                </View>
            </StatCard>

            {/* STAT 4 — Gasto promedio diario */}
            <StatCard tutRef={dailyRef} icon="today-outline" title="Gasto Promedio Diario" value={`Q ${avgDaily.toFixed(2)}/día`} color={dailyPct > 100 ? C.danger : dailyPct > 80 ? C.warning : C.accent}
                subtitle={`Tu presupuesto diario ideal es Q${avgDailyBudget.toFixed(2)}/día. Vas al ${Math.round(dailyPct)}% de ese límite.`}
            >
                <AnimBar pct={dailyPct} color={dailyPct > 100 ? C.danger : dailyPct > 80 ? C.warning : C.accent} />
            </StatCard>

            {/* STAT 5 — Días sin gastar */}
            <StatCard tutRef={noSpendRef} icon="shield-checkmark-outline" title="Días Sin Gastar" value={`${daysWithoutExpense} días`} color={daysWithoutExpense >= 3 ? C.income : C.textSub}
                subtitle={`De ${daysElapsed} días del período, gastaste en ${daysWithExpense}.`}
            />

            {/* STAT 6 — Desglose por banco */}
            {byBank.length > 0 && (
                <StatCard tutRef={banksRef} icon="business-outline" title="Gasto por Banco / Tarjeta" value="" color={C.fx}>
                    {byBank.map(b => (
                        <View key={b.bank} style={s.bankRow}>
                            <View style={s.bankInfo}>
                                <Text style={s.bankName} numberOfLines={1}>{b.bank}</Text>
                                <Text style={s.bankCount} numberOfLines={1}>{b.count} transacciones</Text>
                            </View>
                            <View style={{ flex: 1, marginHorizontal: 12 }}>
                                <AnimBar pct={(b.amount / bankMax) * 100} color={C.fx} height={6} />
                            </View>
                            <Text style={s.bankAmount}>Q {b.amount.toFixed(0)}</Text>
                        </View>
                    ))}
                </StatCard>
            )}

            {/* STAT 7 — Ratio deuda/ingreso */}
            {settings.activeDebts > 0 && (
                <StatCard tutRef={debtRef} icon="alert-circle-outline" title="Ratio Deuda / Ingreso" value={`${debtRatio.toFixed(1)}%`} color={debtColor}
                    subtitle={debtRatio > 40 ? "Ratio peligroso: más del 40% de tu ingreso mensual es deuda." : debtRatio > 20 ? "Ratio moderado: buscá reducirlo progresivamente." : "Ratio saludable: tu deuda está bajo control."}
                >
                    <AnimBar pct={Math.min(debtRatio, 100)} color={debtColor} />
                </StatCard>
            )}

            {/* STAT 8 — Velocidad de gasto */}
            {period === "current" && (
                <StatCard tutRef={velocityRef} icon="speedometer-outline" title="Velocidad de Gasto" value={velocityDiff === 0 ? "Sin cambio" : `${velocityDiff > 0 ? "+" : ""}Q ${velocityDiff.toFixed(0)}`}
                    color={velocityDiff > 0 ? C.danger : velocityDiff < 0 ? C.income : C.textSub}
                    subtitle={velocityDiff > 0 ? `Gastás Q${velocityDiff.toFixed(0)} más que el período anterior (${velocityPct.toFixed(0)}% más rápido).` : velocityDiff < 0 ? `Gastás Q${Math.abs(velocityDiff).toFixed(0)} menos que el período anterior. ¡Buen trabajo!` : "Sin datos para comparar."}
                />
            )}

            {/* STAT 9 — Proyección de ahorro (misma métrica de flujo que la tarjeta de arriba) */}
            <StatCard tutRef={savingsProjRef} icon="rocket-outline" title="Proyección de Ahorro" value={`Q ${Math.max(proj6, 0).toFixed(0)} en 6 meses`} color={avgMonthlySav >= 0 ? C.primaryLight : C.danger}
                subtitle={`A tu ritmo actual de ahorro (Q${avgMonthlySav.toFixed(0)}/mes), tu ahorro acumulado en 12 meses sería Q${Math.max(proj12, 0).toFixed(0)}.${avgMonthlySav < 0 ? " Atención: estás en negativo." : ""} (Basado en transacciones registradas, no en el saldo de tus cuentas.)`}
            />

            <View style={{ height: 120 }} />
        </ScrollView>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16 },
    periodRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14, paddingHorizontal: 4 },
    periodTxt: { color: C.textSub, fontSize: 11, fontWeight: "700", flexShrink: 1 },
    quickRow: { flexDirection: "row", gap: 10, marginBottom: 14 },
    quickCard: { flex: 1 },
    quickContent: { padding: 12, alignItems: "center" },
    quickLbl: { color: C.textSub, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
    quickVal: { fontSize: 15, fontWeight: "900" },
    cardWrap: { marginBottom: 14 },
    cardContent: { padding: 16 },
    cardHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 },
    cardIcon: { width: 34, height: 34, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    cardTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.5, flex: 1 },
    sliceDetail: { flexDirection: "row", alignItems: "center", padding: 12, borderRadius: 12, borderWidth: 1, marginTop: 12 },
    sliceName: { fontSize: 14, fontWeight: "800" },
    sliceAmt: { color: C.textSub, fontSize: 12, marginTop: 2 },
    slicePct: { fontSize: 22, fontWeight: "900" },
    legendRow: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5, marginRight: 8 },
    legendLabel: { color: C.text, fontSize: 12, fontWeight: "600", flex: 1, minWidth: 0 },
    legendAmt: { color: C.textSub, fontSize: 11, fontWeight: "700", textAlign: "right" },
    legendPct: { fontSize: 11, fontWeight: "900", minWidth: 35, textAlign: "right" },
    savingsRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
    savingsLbl: { color: C.textSub, fontSize: 12, fontWeight: "600" },
    savingsVal: { fontSize: 18, fontWeight: "900" },
    savingsHint: { fontSize: 11, marginTop: 6 },
    chartLabel: { color: C.textSub, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
    trendBadge: { flexDirection: "row", alignItems: "center", padding: 10, borderRadius: 10 },
    bankRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    bankInfo: { flexShrink: 1, maxWidth: "35%" },
    bankName: { color: C.text, fontSize: 12, fontWeight: "700" },
    bankCount: { color: C.textSub, fontSize: 10 },
    bankAmount: { color: C.textPrimary, fontSize: 13, fontWeight: "800", minWidth: 60, textAlign: "right" },
});
