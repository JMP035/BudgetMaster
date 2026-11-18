import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator, Animated, Easing, Linking, Modal, Platform, RefreshControl,
    ScrollView, StyleSheet, Text, TouchableOpacity, View
} from "react-native";
import {
    Account, CategoryBudget, CreditInstallment, FixedExpense,
    FinancialPeriod, SavingsGoal, StorageService, Transaction, UserSettings,
    calcCreditCommitments, calcFinancialScore, calcNetWorthFromAccounts,
    getAccountMonthlyInstallmentTotal, getCurrentFinancialPeriod,
    getDaysUntilNextPayment, getMonthlyInstallmentTotal, isFixedExpenseOverdue
} from "../services/storage";
import { SmsService } from "../services/SmsService";
import type { SmsPermissionDetail, SmsSyncMode, SyncResult } from "../services/SmsService";
import { smsPermissionHelp } from "../services/SmsPermissionHelp";
import GettingStartedCard from "./GettingStartedCard";
import type { GuideSettingsSection } from "./GettingStartedCard";
import { NotificationService } from "../services/NotificationService";
import { getCat } from "../categories";
import { C } from "../theme";
import { useTutorialRef, useTutorialScroll } from "../context/TutorialContext";
import { HelpButton } from "./HelpButton";
import { GlassCard, GlassBackground } from "./GlassCard";
import GradientText from "./GradientText";
import Money from "./Money";
import { formatMoney } from "../services/format";
import { fixedCycleConfig, fixedDueInfo } from "../services/FixedCycle";
import { isSmsFeatureOn } from "../services/features";
import { GlassDialog } from "./GlassDialog";
import type { GlassDialogProps, GlassDialogStat } from "./GlassDialog";
import SmsInboxModal from "./SmsInboxModal";
import SmsPendingSheet, { countPending } from "./SmsPendingSheet";
import { InlineNotice } from "./InlineNotice";
import { useGlassDialog } from "./GlassDialogProvider";
import { useUndoLastSync } from "./useUndoLastSync";
import PeriodStartSheet from "./PeriodStartSheet";

type SyncDialogState = Omit<GlassDialogProps, "visible" | "onClose">;

// Estadísticas del diálogo de sincronización: las 3 primeras siempre, el resto solo si > 0.
function buildSyncStats(r: SyncResult): { stats: GlassDialogStat[]; footnote?: string } {
    const st = r.stats;
    const stats: GlassDialogStat[] = [
        { icon: "mail-outline", label: r.mode === "full" ? "SMS revisados (últimos 3 meses)" : "SMS revisados", value: st.totalRead },
        { icon: "business-outline", label: "Mensajes bancarios", value: st.bankCandidates },
        { icon: "copy-outline", label: "Ya registrados", value: st.duplicates + st.dismissedByUser },
    ];
    if (r.fixedAutoMarked.length > 0) stats.push({ icon: "calendar-outline", label: "Gastos fijos pagados", value: r.fixedAutoMarked.length, tone: "positive" });
    if (st.installments > 0) stats.push({ icon: "layers-outline", label: "Compras a cuotas", value: st.installments, tone: "positive" });
    if (st.neutral > 0) stats.push({ icon: "swap-horizontal-outline", label: "Pagos de tarjeta y transferencias neutras", value: st.neutral });
    if (st.promos > 0) stats.push({ icon: "megaphone-outline", label: "Promociones y ofertas omitidas", value: st.promos, tone: "muted" });
    if (st.otp > 0) stats.push({ icon: "key-outline", label: "Códigos y alertas de seguridad omitidos", value: st.otp, tone: "muted" });
    if (st.declined > 0) stats.push({ icon: "close-circle-outline", label: "Transacciones rechazadas omitidas", value: st.declined, tone: "muted" });
    if (st.notices + st.info > 0) stats.push({ icon: "notifications-outline", label: "Avisos informativos del banco (sin movimiento)", value: st.notices + st.info, tone: "muted" });
    if (st.ownTransfers > 0) stats.push({ icon: "repeat-outline", label: "Transferencias entre tus cuentas", value: st.ownTransfers, tone: "muted" });
    if (st.unparsed > 0) stats.push({ icon: "help-circle-outline", label: "Mensajes sin clasificar", value: st.unparsed, tone: "warning" });
    return { stats, footnote: st.installments > 0 ? "Revisalas en Cuentas → Visacuotas." : undefined };
}

// ─────────────────────────────────────────────────────────────
// BARRA ANIMADA
// ─────────────────────────────────────────────────────────────
function AnimBar({ pct, color }: { pct: number; color: string }) {
    const anim = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        Animated.timing(anim, { toValue: Math.min(pct, 100), duration: 900, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
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
    const pct = limit > 0 ? Math.min(spent / limit, 1) : 0;
    const ringColor = spent > limit ? C.danger : pct > 0.8 ? C.warning : C.primaryLight;
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
            <Money amount={spent} currency={currency} size="md" containerStyle={{ marginTop: 12, alignSelf: "stretch" }} align="center" />
            <Text style={{ color: C.textMuted, fontSize: 12 }}>{`de ${formatMoney(limit, currency)}`}</Text>
        </View>
    );
}

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
// SCORE FINANCIERO
// ─────────────────────────────────────────────────────────────
function ScoreWidget({ score }: { score: number }) {
    const anim = useRef(new Animated.Value(0)).current;
    const color = score >= 80 ? C.income : score >= 60 ? C.accent : score >= 40 ? C.warning : C.danger;
    const label = score >= 80 ? "Excelente" : score >= 60 ? "Bueno" : score >= 40 ? "Regular" : "Crítico";

    useEffect(() => {
        Animated.timing(anim, { toValue: score, duration: 1200, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
    }, [score]);

    const w = anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

    return (
        <GlassCard style={s.glassOuter} contentStyle={s.scoreCard}>
            <View style={s.scoreHeader}>
                <View style={[s.scoreIconBg, { backgroundColor: color + "22" }]}>
                    <Ionicons name="shield-checkmark-outline" size={20} color={color} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.scoreTitle}>Score Financiero</Text>
                    <Text style={[s.scoreLabel, { color }]}>{label}</Text>
                </View>
                {score >= 60 ? <GradientText text={String(score)} style={s.scoreValue} /> : <Text style={[s.scoreValue, { color }]}>{score}</Text>}
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
            <Text style={s.scoreSource}>Se calcula con los movimientos que registrás este mes, no con tu ingreso declarado.</Text>
        </GlassCard>
    );
}

// ─────────────────────────────────────────────────────────────
// TARJETA DE BALANCE POR MONEDA
// ─────────────────────────────────────────────────────────────
function CurrencyCard({ currency, income, expense }: { currency: string; income: number; expense: number }) {
    const balance = income - expense;
    const accentColor = currency === "Q" ? C.primary : C.fx;
    return (
        <GlassCard style={s.glassOuter} contentStyle={s.currencyCard} topAccentColor={accentColor} topAccentWidth={3}>
            <View style={s.currencyHeader}>
                <View style={[s.currencyBadge, { backgroundColor: accentColor + "22" }]}>
                    <Text style={[s.currencySymbol, { color: accentColor }]}>{currency}</Text>
                </View>
                <Text style={s.currencyTitle}>{currency === "Q" ? "QUETZALES" : currency === "USD" ? "DÓLARES" : currency}</Text>
            </View>
            <View style={s.currencyRow}>
                <View style={s.currencyItem}>
                    <Text style={s.currencyLbl}>INGRESOS</Text>
                    <Money amount={income} currency={currency} size="md" tone="income" align="center" containerStyle={s.moneyFill} />
                </View>
                <View style={s.currencyDivider} />
                <View style={s.currencyItem}>
                    <Text style={s.currencyLbl}>GASTOS</Text>
                    <Money amount={expense} currency={currency} size="md" tone="expense" align="center" containerStyle={s.moneyFill} />
                </View>
                <View style={s.currencyDivider} />
                <View style={s.currencyItem}>
                    <Text style={s.currencyLbl}>NETO</Text>
                    <Money amount={balance} currency={currency} size="md" tone="auto" sign="always" align="center" containerStyle={s.moneyFill} />
                </View>
            </View>
        </GlassCard>
    );
}

// ─────────────────────────────────────────────────────────────
// WIDGET CUENTAS
// ─────────────────────────────────────────────────────────────
function AccountsWidget({ accounts, installments, settings, onPress }: {
    accounts: Account[]; installments: CreditInstallment[];
    settings: UserSettings; onPress: () => void;
}) {
    const active = accounts.filter(a => a.isActive);
    const { totalQ, totalUSD, totalEUR, totalGBP } = calcNetWorthFromAccounts(active, settings.exchangeRate);
    const monthlyInst = getMonthlyInstallmentTotal(installments, settings.exchangeRate);
    const { installmentsPendingQ } = calcCreditCommitments(installments, settings.exchangeRate);
    const creditCards = active.filter(a => a.type === "credit");

    return (
        <TouchableOpacity style={s.glassOuter} onPress={onPress} activeOpacity={0.8}>
            <GlassCard contentStyle={s.widgetCard}>
            <View style={s.widgetHeader}>
                <Ionicons name="wallet-outline" size={18} color={C.primaryLight} />
                <Text style={s.widgetTitle}>Mis Cuentas</Text>
                <Text style={[s.widgetBadgeTxt, { color: C.textMuted }]}>{active.length} cuenta{active.length !== 1 ? "s" : ""}</Text>
                <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
            </View>

            <View style={s.accountsRow}>
                <View style={s.accountsItem}>
                    <Text style={s.accountsLbl}>NETO Q</Text>
                    <Money amount={totalQ} currency="Q" size="md" tone="auto" decimals={0} align="center" containerStyle={s.moneyFill} />
                </View>
                {totalUSD !== 0 && (
                    <>
                        <View style={s.accountsDivider} />
                        <View style={s.accountsItem}>
                            <Text style={s.accountsLbl}>NETO USD</Text>
                            <Money amount={totalUSD} currency="USD" size="md" tone="auto" decimals={0} align="center" containerStyle={s.moneyFill} />
                        </View>
                    </>
                )}
                {totalEUR !== 0 && (
                    <>
                        <View style={s.accountsDivider} />
                        <View style={s.accountsItem}>
                            <Text style={s.accountsLbl}>NETO EUR</Text>
                            <Money amount={totalEUR} currency="EUR" size="md" tone="auto" decimals={0} align="center" containerStyle={s.moneyFill} />
                        </View>
                    </>
                )}
                {totalGBP !== 0 && (
                    <>
                        <View style={s.accountsDivider} />
                        <View style={s.accountsItem}>
                            <Text style={s.accountsLbl}>NETO £</Text>
                            <Money amount={totalGBP} currency="£" size="md" tone="auto" decimals={0} align="center" containerStyle={s.moneyFill} />
                        </View>
                    </>
                )}
                {installmentsPendingQ > 0 && (
                    <>
                        <View style={s.accountsDivider} />
                        <View style={s.accountsItem}>
                            <Text style={s.accountsLbl}>VISACUOTAS PEND.</Text>
                            <Money amount={installmentsPendingQ} currency="Q" size="md" tone="warning" decimals={0} align="center" containerStyle={s.moneyFill} />
                        </View>
                    </>
                )}
                {monthlyInst > 0 && (
                    <>
                        <View style={s.accountsDivider} />
                        <View style={s.accountsItem}>
                            <Text style={s.accountsLbl}>CUOTAS/MES</Text>
                            <Money amount={monthlyInst} currency="Q" size="md" tone="warning" decimals={0} align="center" containerStyle={s.moneyFill} />
                        </View>
                    </>
                )}
            </View>

            {/* Mini lista de cuentas */}
            {active.slice(0, 3).map(acc => {
                if (acc.type === "credit") {
                    const accMonthlyTotal = getAccountMonthlyInstallmentTotal(installments, acc.id, settings.exchangeRate, acc.currency);
                    return (
                        <View key={acc.id} style={s.accMiniRow}>
                            <View style={[s.accMiniDot, { backgroundColor: acc.color }]} />
                            <Text style={s.accMiniName} numberOfLines={1}>{acc.name}</Text>
                            {accMonthlyTotal > 0 ? (
                                <Money amount={accMonthlyTotal} currency={acc.currency} size="sm" tone="warning" suffix="/mes" align="right" containerStyle={s.moneyRowEnd} />
                            ) : (
                                <Text style={[s.accMiniVal, { color: C.textMuted }]}>Sin cuotas</Text>
                            )}
                        </View>
                    );
                }
                return (
                    <View key={acc.id} style={s.accMiniRow}>
                        <View style={[s.accMiniDot, { backgroundColor: acc.color }]} />
                        <Text style={s.accMiniName} numberOfLines={1}>{acc.name}</Text>
                        <Money amount={acc.balance} currency={acc.currency} size="sm" tone="auto" align="right" containerStyle={s.moneyRowEnd} />
                    </View>
                );
            })}
            {active.length > 3 && (
                <Text style={s.widgetMore}>+{active.length - 3} cuentas más →</Text>
            )}

            {/* Alerta visacuotas */}
            {monthlyInst > 0 && (
                <View style={[s.widgetAlert, { backgroundColor: C.warning + "11", borderColor: C.warning + "33" }]}>
                    <Ionicons name="card-outline" size={13} color={C.warning} />
                    <Text style={[s.widgetAlertTxt, { color: C.warning }]}>
                        {`Este mes debés ${formatMoney(monthlyInst, "Q", { decimals: 0 })} en visacuotas`}
                    </Text>
                </View>
            )}
            </GlassCard>
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────
// WIDGET GASTOS FIJOS
// ─────────────────────────────────────────────────────────────
const SHORT_MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** «28 oct» (mes abreviado fijo: no depende del locale del dispositivo). */
function formatShortDay(d: Date): string {
    return `${d.getDate()} ${SHORT_MONTHS[d.getMonth()]}`;
}

function FixedExpensesWidget({ fixedExpenses, settings, onPress }: {
    fixedExpenses: FixedExpense[]; settings: UserSettings; onPress: () => void;
}) {
    const active = fixedExpenses.filter(e => e.isActive);
    const paid = active.filter(e => e.isPaid).length;
    const cycle = fixedCycleConfig(settings);
    const now = new Date();
    const pending = active.filter(e => !e.isPaid)
        .map(e => ({ e, due: fixedDueInfo(e, cycle, now).due }))
        .sort((a, b) => a.due.getTime() - b.due.getTime());
    const overdue = pending.filter(p => isFixedExpenseOverdue(p.e, cycle, now));
    if (active.length === 0) return null;

    return (
        <TouchableOpacity style={s.glassOuter} onPress={onPress} activeOpacity={0.8}>
            <GlassCard contentStyle={s.widgetCard}>
            <View style={s.widgetHeader}>
                <Ionicons name="calendar-outline" size={18} color={C.primaryLight} />
                <Text style={s.widgetTitle}>Gastos fijos del período</Text>
                <View style={[s.widgetBadge, { backgroundColor: overdue.length > 0 ? C.danger + "22" : C.income + "22" }]}>
                    <Text style={[s.widgetBadgeTxt, { color: overdue.length > 0 ? C.danger : C.income }]}>
                        {paid}/{active.length}
                    </Text>
                </View>
            </View>
            <AnimBar pct={active.length > 0 ? (paid / active.length) * 100 : 0} color={paid === active.length ? C.income : C.primary} />
            {overdue.length > 0 && (
                <View style={s.overdueRow}>
                    <Ionicons name="warning-outline" size={13} color={C.danger} />
                    <Text style={s.overdueTxt}>{overdue.length} gasto(s) vencido(s) sin pagar</Text>
                </View>
            )}
            {pending.slice(0, 2).map(({ e, due }) => (
                <View key={e.id} style={s.widgetItem}>
                    <Ionicons name="ellipse-outline" size={12} color={C.textMuted} style={{ marginRight: 8 }} />
                    <Text style={s.widgetItemTxt} numberOfLines={1}>{e.name}</Text>
                    <Money amount={e.amount} currency={e.currency} size="sm" tone="neutral" decimals={0} align="right" containerStyle={[s.moneyRowEnd, { marginRight: 8 }]} />
                    <Text style={s.widgetItemDay}>vence {formatShortDay(due)}</Text>
                </View>
            ))}
            {pending.length > 2 && <Text style={s.widgetMore}>+{pending.length - 2} más →</Text>}
            </GlassCard>
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────
// WIDGET METAS
// ─────────────────────────────────────────────────────────────
function GoalsWidget({ goals, onPress }: { goals: SavingsGoal[]; onPress: () => void }) {
    const active = goals.filter(g => !g.isCompleted);
    if (active.length === 0) return null;
    return (
        <TouchableOpacity style={s.glassOuter} onPress={onPress} activeOpacity={0.8}>
            <GlassCard contentStyle={s.widgetCard}>
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
            {active.length > 2 && <Text style={s.widgetMore}>+{active.length - 2} metas más →</Text>}
            </GlassCard>
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

    return (
        <Animated.View style={[s.glassOuter, { opacity: loading ? 1 : fadeAnim }]}>
            <GlassCard leftAccentColor={C.primary} contentStyle={s.briefingCard}>
                <View style={s.briefingHeader}>
                    <Ionicons name="sparkles-outline" size={16} color={C.primaryLight} />
                    <Text style={s.briefingTitle}>CFO Intelligence</Text>
                    <View style={s.briefingBadge}><Text style={s.briefingBadgeTxt}>AI</Text></View>
                </View>
                <Text style={loading ? s.briefingLoading : s.briefingText}>
                    {loading ? "Analizando tu situación financiera..." : text}
                </Text>
            </GlassCard>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────
// ORBE AMBIENTAL
// ─────────────────────────────────────────────────────────────
const AmbientOrb = React.memo(function AmbientOrb({ size, color, style }: { size: number; color: string; style?: any }) {
    return (
        <View pointerEvents="none" renderToHardwareTextureAndroid style={[{ position: "absolute" }, style]}>
            <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: color, opacity: 0.045 }} />
            <View style={{ position: "absolute", width: size * 0.72, height: size * 0.72, borderRadius: (size * 0.72) / 2, backgroundColor: color, opacity: 0.045, top: (size - size * 0.72) / 2, left: (size - size * 0.72) / 2 }} />
            <View style={{ position: "absolute", width: size * 0.45, height: size * 0.45, borderRadius: (size * 0.45) / 2, backgroundColor: color, opacity: 0.045, top: (size - size * 0.45) / 2, left: (size - size * 0.45) / 2 }} />
        </View>
    );
});

// ─────────────────────────────────────────────────────────────
// MODAL — INFO DE PATRIMONIO TOTAL (vidrio, no Alert nativo)
// ─────────────────────────────────────────────────────────────
function NetWorthInfoModal({ visible, onClose }: { visible: boolean; onClose: () => void }) {
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={ni.overlay}>
                <GlassCard radius={20} style={ni.card} contentStyle={ni.content} blur={false}>
                    <View style={ni.iconWrap}>
                        <Ionicons name="business-outline" size={22} color={C.primaryLight} />
                    </View>
                    <Text style={ni.title}>Patrimonio Total</Text>
                    <Text style={ni.body}>El Patrimonio Total muestra lo que tenés en tus cuentas de activos.</Text>

                    <View style={ni.row}>
                        <Ionicons name="checkmark-circle" size={15} color={C.income} />
                        <Text style={ni.rowLabel}>INCLUYE</Text>
                    </View>
                    <Text style={ni.bullet}>• Saldo en cuentas de ahorro</Text>
                    <Text style={ni.bullet}>• Efectivo disponible</Text>
                    <Text style={ni.bullet}>• Saldo positivo en cuentas bancarias e inversiones</Text>

                    <View style={ni.row}>
                        <Ionicons name="close-circle" size={15} color={C.danger} />
                        <Text style={ni.rowLabel}>NO INCLUYE</Text>
                    </View>
                    <Text style={ni.bullet}>• Saldo deudor de tarjetas de crédito</Text>
                    <Text style={ni.bullet}>• Pendiente de visacuotas</Text>

                    <Text style={ni.footnote}>
                        Los compromisos de crédito (tarjetas y visacuotas) se muestran por separado, debajo del patrimonio, para no mezclar lo que tenés con lo que debés.
                    </Text>

                    <TouchableOpacity style={ni.btn} onPress={onClose}>
                        <Text style={ni.btnTxt}>Entendido</Text>
                    </TouchableOpacity>
                </GlassCard>
            </View>
        </Modal>
    );
}

const ni = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: C.overlayScrim, alignItems: "center", justifyContent: "center", padding: 24 },
    card: { width: "100%", maxWidth: 380, backgroundColor: C.cardHigh },
    content: { padding: 22 },
    iconWrap: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.primary + "22", borderWidth: 1, borderColor: C.primary + "44", alignItems: "center", justifyContent: "center", marginBottom: 12 },
    title: { color: C.text, fontSize: 18, fontWeight: "900", marginBottom: 8 },
    body: { color: C.textSub, fontSize: 13, lineHeight: 19, marginBottom: 14 },
    row: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, marginBottom: 4 },
    rowLabel: { color: C.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1 },
    bullet: { color: C.textSub, fontSize: 13, lineHeight: 19, marginLeft: 4 },
    footnote: { color: C.textMuted, fontSize: 12, lineHeight: 18, marginTop: 14 },
    btn: { backgroundColor: C.primary, borderRadius: 12, paddingVertical: 13, alignItems: "center", marginTop: 18 },
    btnTxt: { color: C.onPrimary, fontSize: 14, fontWeight: "900" },
});

// ─────────────────────────────────────────────────────────────
// DASHBOARD PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props {
    transactions: Transaction[];
    settings: UserSettings;
    fixedExpenses: FixedExpense[];
    categoryBudgets: CategoryBudget[];
    savingsGoals: SavingsGoal[];
    accounts: Account[];
    creditInstallments: CreditInstallment[];
    onRefresh: () => void;
    refreshing: boolean;
    onNavigateBudget?: () => void;
    onNavigateAccounts?: () => void;
    /** Resultado de la última sincronización automática (alimenta el aviso bajo el encabezado). */
    smsAutoResult?: SyncResult | null;
    onDismissSmsAuto?: () => void;
    /** Contador que sube cuando el onboarding pide la importación guiada de SMS (3 meses). */
    syncRequest?: number;
    /** Abre Ajustes enfocando una sección (desde la tarjeta «Guía y primeros pasos»). */
    onNavigateSettings?: (section: GuideSettingsSection) => void;
}

// Última petición de importación atendida: sobrevive a que el Dashboard se desmonte al cambiar de pestaña.
let lastHandledSyncRequest = 0;

// Texto del aviso de sincronización automática; null si no hay nada que decir.
function buildAutoNotice(r: SyncResult): { text: string; variant: "success" | "warning"; actionLabel: "Ver" | "Revisar" } | null {
    const fresh = r.transactions.length + r.installments.length;
    const pending = countPending(r);
    if (fresh === 0 && pending === 0) return null;
    if (pending === 0) {
        return {
            text: `${fresh} ${fresh === 1 ? "movimiento nuevo importado" : "movimientos nuevos importados"}`,
            variant: "success",
            actionLabel: "Ver",
        };
    }
    const toReview = `${pending} por revisar`;
    return {
        text: fresh > 0 ? `${fresh} ${fresh === 1 ? "nuevo" : "nuevos"} · ${toReview}` : toReview,
        variant: "warning",
        actionLabel: "Revisar",
    };
}

export default function DashboardScreen({
    transactions, settings, fixedExpenses, categoryBudgets,
    savingsGoals, accounts, creditInstallments,
    onRefresh, refreshing, onNavigateBudget, onNavigateAccounts,
    smsAutoResult, onDismissSmsAuto, syncRequest, onNavigateSettings,
}: Props) {
    const glass = useGlassDialog();
    const undo = useUndoLastSync(onRefresh);
    const now = new Date();

    const briefingRef = useTutorialRef('briefing_card');
    const scoreRef = useTutorialRef('score_card');
    const syncRef = useTutorialRef('sync_btn');
    const accountsRef = useTutorialRef('accounts_widget');
    const headerRef = useTutorialRef('dash_header');
    const netWorthRef = useTutorialRef('dash_networth');
    const balanceQRef = useTutorialRef('dash_balance_q');
    const budgetRef = useTutorialRef('dash_budget');
    const fixedRef = useTutorialRef('dash_fixed');
    const recentRef = useTutorialRef('dash_recent');
    const tutScroll = useTutorialScroll('dashboard');

    // ── PERÍODO FINANCIERO REAL ───────────────────────────────
    const period: FinancialPeriod = getCurrentFinancialPeriod(settings);

    const [briefing, setBriefing] = useState("");
    const [briefingLoading, setBriefingLoading] = useState(true);
    const [syncing, setSyncing] = useState(false);
    const [showNetWorthInfo, setShowNetWorthInfo] = useState(false);
    const [dialog, setDialog] = useState<SyncDialogState | null>(null);
    const [showPending, setShowPending] = useState(false);
    const [pendingResult, setPendingResult] = useState<SyncResult | null>(null);
    const [showInbox, setShowInbox] = useState(false);
    const [inboxCount, setInboxCount] = useState(0);
    const [showPeriodSheet, setShowPeriodSheet] = useState(false);
    const [showPeriodNotice, setShowPeriodNotice] = useState(false);

    // Aviso único: el período ahora puede empezar antes (fin de semana, feriado o sueldo adelantado).
    // Solo mensual/quincenal y solo si el inicio efectivo del período actual difiere del nominal.
    const periodShifted = (settings.paymentCycle === "monthly" || settings.paymentCycle === "biweekly")
        && period.startSource !== "nominal";
    useEffect(() => {
        if (!periodShifted) return;
        let cancelled = false;
        StorageService.getNotificationState().then(async st => {
            if (cancelled || st.periodRulesNoticeShown) return;
            setShowPeriodNotice(true);
            await StorageService.markPeriodRulesNoticeShown();
        }).catch(() => { });
        return () => { cancelled = true; };
    }, [periodShifted]);

    useEffect(() => {
        const load = async () => {
            setBriefingLoading(true);
            const text = await NotificationService.getDailyBriefing(settings, transactions, categoryBudgets, fixedExpenses);
            setBriefing(text);
            setBriefingLoading(false);
        };
        load();
    }, [transactions.length, settings.budgetLimit, settings.userName]);

    const smsEnabled = isSmsFeatureOn(settings);
    useEffect(() => {
        if (!smsEnabled) { setInboxCount(0); return; }
        let cancelled = false;
        StorageService.getSmsInbox().then(i => { if (!cancelled) setInboxCount(i.length); });
        return () => { cancelled = true; };
    }, [smsEnabled]);

    // ── Flujo de sincronización SMS (GlassDialog, sin Alert nativo) ──
    // Android no maneja bien dos Modal a la vez: se cierra uno y se abre el otro con una pausa.
    const SWITCH_DELAY_MS = 250;
    const closeDialog = () => setDialog(null);
    const afterDialogClosed = (fn: () => void) => {
        setDialog(null);
        setTimeout(fn, SWITCH_DELAY_MS);
    };
    const openSystemSettings = () => {
        afterDialogClosed(() => { Linking.openSettings().catch(() => { }); });
    };

    const openPending = (result: SyncResult) => {
        setPendingResult(result);
        afterDialogClosed(() => setShowPending(true));
    };

    const showSmsUnavailable = () => setDialog({
        variant: "warning",
        icon: "construct-outline",
        title: "Función no disponible",
        message: "Esta versión de la app no incluye el lector de SMS (por ejemplo, en Expo Go). Instalá la app compilada (APK) para usar la sincronización.",
    });

    const showSmsPermissionDenied = () => setDialog({
        variant: "warning",
        icon: "chatbubble-ellipses-outline",
        title: "Permiso de SMS necesario",
        message: "Sin este permiso BudgetMaster no puede detectar tus movimientos bancarios. Todo se procesa en tu teléfono y solo se leen mensajes de bancos.",
        footnote: "También podés pegar un SMS en Agregar → Leer SMS.",
        actions: [
            { label: "Reintentar", kind: "primary", onPress: () => afterDialogClosed(() => { void handleSmsSync(); }) },
            { label: "Abrir ajustes", kind: "secondary", onPress: openSystemSettings },
            { label: "Ahora no", kind: "secondary", onPress: closeDialog },
        ],
    });

    const showSmsPermissionBlocked = (perm: SmsPermissionDetail) => {
        const { message, steps, footnote } = smsPermissionHelp(perm);
        setDialog({
            variant: "warning",
            icon: "lock-closed-outline",
            title: "Permiso de SMS bloqueado",
            message,
            steps,
            footnote,
            actions: [
                { label: "Abrir ajustes", kind: "primary", onPress: openSystemSettings },
                { label: "Cancelar", kind: "secondary", onPress: closeDialog },
            ],
        });
    };

    const showSyncResult = (result: SyncResult) => {
        const { stats, footnote } = buildSyncStats(result);
        const imported = result.transactions.length + result.installments.length;
        const pending = countPending(result);

        const actions: GlassDialogProps["actions"] = [];
        if (pending > 0) {
            actions.push({
                label: `Revisar (${pending})`,
                kind: "secondary",
                icon: "shield-checkmark-outline",
                onPress: () => openPending(result),
            });
        }
        if (result.batchId) {
            actions.push({
                label: "Deshacer",
                kind: "secondary",
                icon: "arrow-undo-outline",
                onPress: () => afterDialogClosed(() => { void undo.requestUndo(); }),
            });
        }
        actions.push({ label: "Listo", kind: "primary", onPress: closeDialog });

        if (imported > 0) {
            setDialog({
                variant: "success",
                icon: "cloud-done-outline",
                title: "Sincronización completa",
                highlight: { value: String(result.stats.imported + result.stats.installments), caption: "movimientos importados" },
                stats,
                footnote,
                actions,
            });
        } else {
            setDialog({
                variant: "info",
                icon: "checkmark-done-outline",
                title: "Todo al día",
                message: "No encontramos movimientos nuevos para importar.",
                stats,
                footnote,
                actions,
            });
        }
    };

    const handleSmsSync = async (mode: Exclude<SmsSyncMode, "auto"> = "manual") => {
        if (syncing) return;

        if (Platform.OS !== 'android') {
            setDialog({
                variant: "info",
                icon: "phone-portrait-outline",
                title: "Solo en Android",
                message: "La sincronización de SMS solo funciona en Android.",
            });
            return;
        }

        if (!SmsService.isSmsModuleAvailable()) {
            showSmsUnavailable();
            return;
        }

        const perm = await SmsService.requestReadSmsPermissionDetailed();
        if (perm.status === 'never_ask_again') {
            showSmsPermissionBlocked(perm);
            return;
        }
        if (perm.status !== 'granted') {
            showSmsPermissionDenied();
            return;
        }

        setSyncing(true);
        try {
            const result = await SmsService.syncBankSms({ mode });
            setInboxCount(result.inbox.length);
            showSyncResult(result);
            if (result.transactions.length > 0 || result.installments.length > 0 || result.fixedAutoMarked.length > 0) onRefresh();
            void undo.reload();
        } catch (e) {
            const msg = e instanceof Error ? e.message : String(e);
            if (msg === 'SMS_PERMISSION_DENIED') {
                showSmsPermissionDenied();
            } else if (msg === 'SMS_MODULE_UNAVAILABLE') {
                showSmsUnavailable();
            } else {
                setDialog({
                    variant: "error",
                    icon: "warning-outline",
                    title: "No se pudo sincronizar",
                    message: "No se pudieron leer los SMS. Intentá de nuevo.",
                    footnote: `Detalle técnico: ${msg}`,
                });
            }
        } finally {
            setSyncing(false);
        }
    };

    // Pulsación larga del botón: relee los últimos 3 meses (con confirmación previa).
    const confirmFullSync = async () => {
        if (syncing) return;
        const ok = await glass.confirm({
            variant: "info",
            icon: "sync-outline",
            title: "Sincronizar todo",
            message: "Volver a leer los últimos 3 meses. Puede tardar unos segundos.",
            confirmLabel: "Sincronizar",
            destructive: false,
        });
        if (ok) void handleSmsSync("full");
    };

    // Importación guiada pedida por el onboarding (una sola vez por petición).
    useEffect(() => {
        if (!syncRequest || syncRequest <= lastHandledSyncRequest) return;
        lastHandledSyncRequest = syncRequest;
        void handleSmsSync("full");
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [syncRequest]);

    // Aviso de la sincronización automática (Ver / Revisar). Se descarta al abrirlo.
    const autoNotice = smsAutoResult ? buildAutoNotice(smsAutoResult) : null;
    const onAutoNoticeAction = () => {
        if (!smsAutoResult) return;
        const r = smsAutoResult;
        onDismissSmsAuto?.();
        if (countPending(r) > 0) {
            setPendingResult(r);
            setShowPending(true);
        } else {
            showSyncResult(r);
        }
    };

    // ── Transacciones del PERÍODO FINANCIERO (no del mes calendario) ──
    const inPeriod = (t: { date: string }) => {
        const d = new Date(t.date);
        return d >= period.start && d <= period.end;
    };
    const inPrevPeriod = (t: { date: string }) => {
        const d = new Date(t.date);
        return d >= period.prevStart && d <= period.prevEnd;
    };

    const periodTx = transactions.filter(inPeriod);
    const prevTx = transactions.filter(inPrevPeriod);

    const incomeQ = periodTx.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const expenseQ = periodTx.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const incomeUSD = periodTx.filter(t => t.type === "income" && t.currency === "USD").reduce((s, t) => s + t.amount, 0);
    const expenseUSD = periodTx.filter(t => t.type === "expense" && t.currency === "USD").reduce((s, t) => s + t.amount, 0);
    const hasUSD = incomeUSD > 0 || expenseUSD > 0;

    // Comparativa con período anterior
    const prevExpenseQ = prevTx.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const periodDiff = prevExpenseQ > 0 ? expenseQ - prevExpenseQ : 0;
    const periodDiffPct = prevExpenseQ > 0 ? Math.abs(periodDiff / prevExpenseQ) * 100 : 0;

    // Patrimonio total
    const hasAccounts = accounts.filter(a => a.isActive).length > 0;
    const { totalQ: accNetQ, totalUSD: accNetUSD, totalEUR: accNetEUR, totalGBP: accNetGBP } = calcNetWorthFromAccounts(accounts.filter(a => a.isActive), settings.exchangeRate);
    const allIncQ = transactions.filter(t => t.type === "income" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const allExpQ = transactions.filter(t => t.type === "expense" && (t.currency === "Q" || !t.currency)).reduce((s, t) => s + t.amount, 0);
    const netQ = hasAccounts ? accNetQ : (settings.externalSavings || 0) + (allIncQ - allExpQ);
    const netUSD = hasAccounts ? accNetUSD : (settings.externalSavingsUSD || 0);
    const netEUR = hasAccounts ? accNetEUR : 0;
    const netGBP = hasAccounts ? accNetGBP : 0;
    const { installmentsPendingQ: totalInstallmentsPendingQ } = calcCreditCommitments(creditInstallments, settings.exchangeRate);
    const totalCreditCommitmentsQ = totalInstallmentsPendingQ;

    const score = calcFinancialScore(transactions, settings, fixedExpenses, categoryBudgets, accounts);
    const daysLeft = getDaysUntilNextPayment(settings);

    // Gráfica: últimos 6 períodos
    const month = now.getMonth();
    const year = now.getFullYear();
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
    const smsOn = isSmsFeatureOn(settings);

    return (
        <View style={s.root}>
            <AmbientOrb size={280} color={C.primary} style={s.orbA} />
            <AmbientOrb size={300} color={C.primaryLight} style={s.orbB} />
            <AmbientOrb size={240} color={C.primary} style={s.orbC} />
            <ScrollView
            {...tutScroll}
            style={s.screen}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={C.primary} />}
            showsVerticalScrollIndicator={false}
        >
            {/* HEADER */}
            <View style={s.header} ref={headerRef} collapsable={false}>
                <View style={{ flexDirection: "row", alignItems: "center", flex: 1, marginRight: 10 }}>
                    <View style={s.logoBox}>
                        <Ionicons name="wallet-outline" size={26} color={C.onPrimary} />
                    </View>
                    <TouchableOpacity
                        style={{ flex: 1, minWidth: 110 }}
                        onPress={() => setShowPeriodSheet(true)}
                        activeOpacity={0.7}
                        accessibilityRole="button"
                        accessibilityLabel={`Período ${period.label}. Tocá para ver cuándo empieza`}
                    >
                        <Text style={s.greeting} numberOfLines={1}>Hola, {settings.userName}</Text>
                        <View style={s.monthRow}>
                            <Text style={s.month}>{period.label.toUpperCase()}</Text>
                            <Ionicons name="create-outline" size={13} color={C.primaryLight} />
                        </View>
                        <Text style={s.periodProgress}>
                            Día {period.daysPassed} de {period.daysTotal} del período
                        </Text>
                    </TouchableOpacity>
                    <HelpButton tutorialId="tutorial_inicio" />
                </View>
                <View style={{ flexDirection: "row", gap: 8, flexShrink: 0 }}>
                    {daysLeft > 0 && settings.paymentCycle !== "irregular" && (
                        <View style={[s.daysBadge, { borderColor: daysLeft <= 3 ? C.danger + "66" : C.cardBorder }]}>
                            <Ionicons name="time-outline" size={12} color={daysLeft <= 3 ? C.danger : C.textMuted} />
                            <Text style={[s.daysBadgeTxt, { color: daysLeft <= 3 ? C.danger : C.textMuted }]}>{daysLeft}d</Text>
                        </View>
                    )}
                    {smsOn && (
                        <View ref={syncRef} collapsable={false}>
                            <TouchableOpacity
                                onPress={() => { void handleSmsSync(); }}
                                onLongPress={() => { void confirmFullSync(); }}
                                delayLongPress={500}
                                style={s.syncBtn}
                                disabled={syncing}
                                accessibilityRole="button"
                                accessibilityLabel="Sincronizar SMS"
                                accessibilityHint="Mantené presionado para volver a leer los últimos 3 meses"
                            >
                                <View pointerEvents="none" style={s.syncGlass}>
                                    <View style={s.syncOrbOuter} />
                                    <View style={s.syncOrbInner} />
                                    <GlassBackground radius={20} intensity={30} />
                                </View>
                                {syncing ? (
                                    <ActivityIndicator size="small" color={C.accent} />
                                ) : (
                                    <>
                                        <Ionicons name="sync-circle-outline" size={24} color={C.accent} />
                                        <View style={s.syncDot} />
                                    </>
                                )}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>

            {/* MENSAJES SIN CLASIFICAR: fila propia para que no le quite ancho al saludo */}
            {smsOn && inboxCount > 0 && (
                <View style={s.inboxRow}>
                    <TouchableOpacity
                        onPress={() => setShowInbox(true)}
                        style={s.inboxChip}
                        accessibilityRole="button"
                        accessibilityLabel={`${inboxCount} mensajes sin clasificar. Abrir buzón`}
                    >
                        <Ionicons name="file-tray-outline" size={13} color={C.warning} />
                        <Text style={s.inboxChipTxt} numberOfLines={1}>{inboxCount} sin clasificar</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* AVISO DE SINCRONIZACIÓN AUTOMÁTICA DE SMS */}
            {smsOn && autoNotice && (
                <View style={s.autoNoticeRow}>
                    <InlineNotice
                        variant={autoNotice.variant}
                        text={autoNotice.text}
                        icon="sync-circle-outline"
                        actionLabel={autoNotice.actionLabel}
                        onAction={onAutoNoticeAction}
                        style={s.autoNotice}
                    />
                    <TouchableOpacity
                        onPress={() => onDismissSmsAuto?.()}
                        style={s.autoNoticeClose}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel="Descartar aviso"
                    >
                        <Ionicons name="close" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                </View>
            )}

            {/* AVISO ÚNICO: EL PERÍODO PUEDE EMPEZAR ANTES */}
            {showPeriodNotice && (
                <View style={s.autoNoticeRow}>
                    <InlineNotice
                        variant="info"
                        text="Ahora tu período puede empezar antes si tu día de pago cae en fin de semana o feriado. Puedes cambiarlo tocando las fechas de arriba."
                        icon="calendar-outline"
                        actionLabel="Ver"
                        onAction={() => { setShowPeriodNotice(false); setShowPeriodSheet(true); }}
                        style={s.autoNotice}
                    />
                    <TouchableOpacity
                        onPress={() => setShowPeriodNotice(false)}
                        style={s.autoNoticeClose}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel="Descartar aviso"
                    >
                        <Ionicons name="close" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                </View>
            )}

            {/* GUÍA Y PRIMEROS PASOS */}
            <GettingStartedCard
                settings={settings}
                accounts={accounts}
                fixedExpenses={fixedExpenses}
                onOpenAccounts={() => onNavigateAccounts?.()}
                onOpenBudget={() => onNavigateBudget?.()}
                onActivateSms={() => { void handleSmsSync(); }}
                onOpenSettings={section => onNavigateSettings?.(section)}
                refreshKey={syncing}
            />

            {/* BRIEFING CFO */}
            <View ref={briefingRef} collapsable={false}>
                <BriefingCard text={briefing} loading={briefingLoading} />
            </View>

            {/* SCORE */}
            <View ref={scoreRef} collapsable={false}>
                <ScoreWidget score={score} />
            </View>

            {/* PATRIMONIO TOTAL */}
            <View ref={netWorthRef} collapsable={false}>
            <GlassCard radius={20} style={s.glassOuter} contentStyle={s.netWorthCard}>
                <View style={s.netWorthTitleRow}>
                    <Text style={s.netWorthTitle}>PATRIMONIO TOTAL</Text>
                    <TouchableOpacity
                        onPress={() => setShowNetWorthInfo(true)}
                        style={s.netWorthInfoBtn}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Ionicons name="information-circle-outline" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                </View>
                <Money amount={netQ} size="xl" tone="auto" align="center" containerStyle={s.moneyFill} />
                {netUSD !== 0 && (
                    <Money amount={netUSD} currency="USD" size="sm" sign="always" gradient={false} align="center"
                        style={{ color: netUSD >= 0 ? C.fx : C.danger }} containerStyle={[s.moneyFill, { marginTop: 4 }]} />
                )}
                {netEUR !== 0 && (
                    <Money amount={netEUR} currency="EUR" size="sm" sign="always" gradient={false} align="center"
                        style={{ color: netEUR >= 0 ? C.fx : C.danger }} containerStyle={[s.moneyFill, { marginTop: 4 }]} />
                )}
                {netGBP !== 0 && (
                    <Money amount={netGBP} currency="£" size="sm" sign="always" gradient={false} align="center"
                        style={{ color: netGBP >= 0 ? C.fx : C.danger }} containerStyle={[s.moneyFill, { marginTop: 4 }]} />
                )}
                {hasAccounts && (
                    <Text style={s.netWorthSource}>Solo activos (sin tarjetas de crédito) • basado en tus cuentas</Text>
                )}
                {!hasAccounts && (
                    <Text style={s.netWorthSource}>Estimado por ingresos/gastos • agrega cuentas para mayor precisión</Text>
                )}
                {totalCreditCommitmentsQ > 0 && (
                    <View style={s.netWorthCommitmentsRow}>
                        <Ionicons name="card-outline" size={13} color={C.warning} />
                        <Text style={s.netWorthCommitments}>
                            {`Compromisos de crédito (aparte): ${formatMoney(totalCreditCommitmentsQ, "Q")}`}
                        </Text>
                    </View>
                )}
            </GlassCard>
            </View>

            {/* BALANCE Q */}
            <View ref={balanceQRef} collapsable={false}>
                <CurrencyCard currency="Q" income={incomeQ} expense={expenseQ} />
            </View>
            {hasUSD && <CurrencyCard currency="USD" income={incomeUSD} expense={expenseUSD} />}

            {/* COMPARATIVA CON PERÍODO ANTERIOR */}
            {periodDiff !== 0 && prevExpenseQ > 0 && (
                <View style={[s.periodBadge, { backgroundColor: periodDiff > 0 ? C.danger + "15" : C.income + "15", borderColor: periodDiff > 0 ? C.danger + "44" : C.income + "44" }]}>
                    <Ionicons name={periodDiff > 0 ? "trending-up" : "trending-down"} size={14} color={periodDiff > 0 ? C.danger : C.income} />
                    <Text style={{ color: periodDiff > 0 ? C.danger : C.income, fontSize: 12, fontWeight: "700", flex: 1, marginLeft: 8 }}>
                        {formatMoney(periodDiff, "Q", { decimals: 0, sign: "always" })} vs período anterior ({periodDiffPct.toFixed(0)}% {periodDiff > 0 ? "más" : "menos"})
                    </Text>
                    <Text style={{ color: C.textMuted, fontSize: 10 }}>{period.prevLabel}</Text>
                </View>
            )}

            {/* PRESUPUESTO */}
            <View ref={budgetRef} collapsable={false}>
                <GlassCard style={s.glassOuter} contentStyle={[s.cardContent, { alignItems: "center", paddingVertical: 24 }]}>
                    <Text style={[s.sectionTitle, { marginBottom: 4 }]}>PRESUPUESTO DEL PERÍODO</Text>
                    <Text style={{ color: C.textMuted, fontSize: 10, marginBottom: 16 }}>{period.label}</Text>
                    <BudgetRing spent={expenseQ} limit={settings.budgetLimit} currency="Q" />
                </GlassCard>
            </View>

            {/* WIDGET CUENTAS */}
            <View ref={accountsRef} collapsable={false}>
                <AccountsWidget
                    accounts={accounts}
                    installments={creditInstallments}
                    settings={settings}
                    onPress={onNavigateAccounts || (() => { })}
                />
            </View>

            {/* WIDGET GASTOS FIJOS */}
            <View ref={fixedRef} collapsable={false}>
                <FixedExpensesWidget fixedExpenses={fixedExpenses} settings={settings} onPress={onNavigateBudget || (() => { })} />

                {/* WIDGET METAS */}
                <GoalsWidget goals={savingsGoals} onPress={onNavigateBudget || (() => { })} />
            </View>

            {/* GRÁFICA 6 MESES */}
            <GlassCard style={s.glassOuter} contentStyle={s.cardContent}>
                <Text style={s.sectionTitle}>GASTOS Q — ÚLTIMOS 6 MESES</Text>
                <View style={{ marginTop: 16 }}>
                    <MiniBarChart data={chartData} color={C.primary} labels={months.map(m => m.label)} />
                </View>
            </GlassCard>

            {/* RECIENTES */}
            <View ref={recentRef} collapsable={false} style={{ marginBottom: 120 }}>
            <GlassCard style={s.glassOuter} contentStyle={s.cardContent}>
                <Text style={[s.sectionTitle, { marginBottom: 12 }]}>RECIENTES</Text>
                {recent.length === 0 ? (
                    <Text style={s.empty}>Sin transacciones aún.</Text>
                ) : recent.map(tx => {
                    const cat = getCat(tx.category, settings.customCategories, tx.type);
                    const txCurrency = tx.currency || "Q";
                    const isTransfer = tx.type === "transfer";
                    return (
                        <View key={tx.id} style={s.txItem}>
                            <View style={[s.txIcon, { backgroundColor: isTransfer ? C.primary + "22" : cat.color + "22", borderColor: isTransfer ? C.primary + "44" : cat.color + "44", shadowColor: isTransfer ? C.primary : cat.color }]}>
                                <Ionicons name={isTransfer ? "swap-horizontal-outline" : cat.icon} size={20} color={isTransfer ? C.primaryLight : cat.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.txDesc} numberOfLines={1}>{tx.description || cat.label}</Text>
                                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
                                    <Text style={s.txDate}>{new Date(tx.date).toLocaleDateString("es-GT", { day: "2-digit", month: "short" })}</Text>
                                    {tx.bank && <View style={s.bankBadge}><Text style={s.bankBadgeTxt}>{tx.bank}</Text></View>}
                                    {txCurrency !== "Q" && <View style={[s.bankBadge, { backgroundColor: C.fx + "22" }]}><Text style={[s.bankBadgeTxt, { color: C.fx }]}>{txCurrency}</Text></View>}
                                    {isTransfer && <View style={[s.bankBadge, { backgroundColor: C.primary + "22" }]}><Text style={[s.bankBadgeTxt, { color: C.primaryLight }]}>TRANSFER</Text></View>}
                                </View>
                            </View>
                            <Money
                                amount={tx.amount}
                                currency={txCurrency}
                                size="sm"
                                sign="never"
                                prefix={isTransfer ? "→ " : tx.type === "income" ? "+" : "-"}
                                tone={isTransfer ? "muted" : tx.type === "income" ? "income" : "expense"}
                                gradient={false}
                                align="right"
                                containerStyle={s.txMoney}
                            />
                        </View>
                    );
                })}
            </GlassCard>
            </View>
            </ScrollView>
            <NetWorthInfoModal visible={showNetWorthInfo} onClose={() => setShowNetWorthInfo(false)} />
            {dialog && <GlassDialog visible onClose={closeDialog} {...dialog} />}
            {showPeriodSheet && (
                <PeriodStartSheet
                    settings={settings}
                    onClose={() => setShowPeriodSheet(false)}
                    onChanged={() => onRefresh()}
                />
            )}
            {smsOn && (
                <SmsPendingSheet
                    visible={showPending}
                    result={pendingResult}
                    settings={settings}
                    accounts={accounts}
                    transactions={transactions}
                    fixedExpenses={fixedExpenses}
                    onClose={() => setShowPending(false)}
                    onChanged={() => { onRefresh(); StorageService.getSmsInbox().then(i => setInboxCount(i.length)).catch(() => { }); }}
                />
            )}
            {smsOn && (
                <SmsInboxModal
                    visible={showInbox}
                    settings={settings}
                    onClose={() => setShowInbox(false)}
                    onChanged={() => { onRefresh(); StorageService.getSmsInbox().then(i => setInboxCount(i.length)); }}
                />
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root: { flex: 1 },
    orbA: { top: -60, right: -90 },
    orbB: { top: 360, left: -120 },
    orbC: { top: 720, right: -80 },
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
    logoBox: { width: 44, height: 44, borderRadius: 12, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", marginRight: 12, borderWidth: 1, borderTopColor: C.primaryGlow, borderLeftColor: C.primaryLight, borderRightColor: C.primaryDark, borderBottomColor: C.primaryDark },
    periodProgress: { color: C.accent, fontSize: 9, marginTop: 1, fontWeight: "700", letterSpacing: 0.5 },
    periodBadge: { flexDirection: "row", alignItems: "center", borderWidth: 1, borderRadius: 12, padding: 10, marginBottom: 14, flexWrap: "wrap" },
    greeting: { color: C.text, fontSize: 22, fontWeight: "800", letterSpacing: 0.3 },
    monthRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 2 },
    month: { color: C.textPrimary, fontSize: 11, letterSpacing: 1.5, fontWeight: "700", flexShrink: 1 },
    daysBadge: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, backgroundColor: C.glassFill },
    daysBadgeTxt: { fontSize: 11, fontWeight: "700" },
    inboxRow: { flexDirection: "row", marginTop: -8, marginBottom: 14 },
    inboxChip: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 1, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, borderColor: C.warning + "66", backgroundColor: C.glassFill },
    inboxChipTxt: { color: C.warning, fontSize: 11, fontWeight: "700", flexShrink: 1 },
    syncBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
    syncGlass: { ...StyleSheet.absoluteFillObject, borderRadius: 20, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    syncOrbOuter: { position: "absolute", width: 34, height: 34, borderRadius: 17, backgroundColor: C.primary, opacity: 0.25 },
    syncOrbInner: { position: "absolute", width: 20, height: 20, borderRadius: 10, backgroundColor: C.primaryLight, opacity: 0.35 },
    syncDot: { position: "absolute", top: -2, right: -2, width: 8, height: 8, borderRadius: 4, backgroundColor: C.accent },

    autoNoticeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14, marginTop: -6 },
    autoNotice: { flex: 1 },
    autoNoticeClose: { width: 28, height: 28, alignItems: "center", justifyContent: "center" },

    glassOuter: { marginBottom: 14 },

    briefingCard: { padding: 16 },
    briefingHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 },
    briefingTitle: { color: C.primaryLight, fontSize: 12, fontWeight: "800", letterSpacing: 1, flex: 1 },
    briefingBadge: { backgroundColor: C.primary, paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderTopColor: C.primaryGlow, borderLeftColor: C.primaryLight, borderRightColor: C.primaryDark, borderBottomColor: C.primaryDark },
    briefingBadgeTxt: { color: C.onPrimary, fontSize: 10, fontWeight: "900" },
    briefingText: { color: C.text, fontSize: 13, lineHeight: 20 },
    briefingLoading: { color: C.textMuted, fontSize: 13, fontStyle: "italic" },

    scoreCard: { padding: 16 },
    scoreHeader: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
    scoreIconBg: { width: 36, height: 36, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    scoreTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", flex: 1 },
    scoreLabel: { fontSize: 11, fontWeight: "700" },
    scoreValue: { fontSize: 32, fontWeight: "900", lineHeight: 38 },
    scoreMax: { color: C.textMuted, fontSize: 14, marginLeft: 2, alignSelf: "flex-end", marginBottom: 4 },
    scoreHint: { color: C.textMuted, fontSize: 12, marginTop: 8 },
    scoreSource: { color: C.textMuted, fontSize: 10, marginTop: 6, letterSpacing: 0.5 },

    netWorthCard: { padding: 24, alignItems: "center" },
    netWorthTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 8 },
    netWorthTitle: { color: C.textMuted, fontSize: 11, fontWeight: "900", letterSpacing: 1.5 },
    netWorthInfoBtn: { opacity: 0.7 },
    netWorthVal: { fontSize: 34, fontWeight: "900", lineHeight: 40 },
    netWorthValSub: { fontSize: 18, fontWeight: "700", marginTop: 4 },
    netWorthSource: { color: C.textMuted, fontSize: 10, marginTop: 6, letterSpacing: 0.5 },
    netWorthCommitmentsRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 },
    netWorthCommitments: { color: C.warning, fontSize: 11, fontWeight: "700", flexShrink: 1 },

    currencyCard: { padding: 16 },
    currencyHeader: { flexDirection: "row", alignItems: "center", marginBottom: 14 },
    currencyBadge: { paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, marginRight: 10 },
    currencySymbol: { fontSize: 14, fontWeight: "900" },
    currencyTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 1 },
    currencyRow: { flexDirection: "row", alignItems: "center" },
    currencyItem: { flex: 1, alignItems: "center" },
    currencyLbl: { color: C.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 4 },
    currencyVal: { fontSize: 15, fontWeight: "800" },
    currencyDivider: { width: 1, height: 40, backgroundColor: C.glassBorder },

    widgetCard: { padding: 16 },
    widgetHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 },
    widgetTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", flex: 1 },
    widgetBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 },
    widgetBadgeTxt: { fontSize: 12, fontWeight: "800" },
    widgetItem: { flexDirection: "row", alignItems: "center", paddingVertical: 6 },
    widgetItemTxt: { flex: 1, color: C.text, fontSize: 13, fontWeight: "600" },
    widgetItemAmt: { color: C.textPrimary, fontSize: 13, fontWeight: "800", marginRight: 8 },
    widgetItemDay: { color: C.textMuted, fontSize: 11 },
    widgetMore: { color: C.primaryLight, fontSize: 12, fontWeight: "700", marginTop: 6, textAlign: "right" },
    widgetAlert: { flexDirection: "row", alignItems: "center", gap: 6, padding: 8, borderRadius: 8, borderWidth: 1, marginTop: 8 },
    widgetAlertTxt: { fontSize: 12, fontWeight: "700" },
    overdueRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 6, marginBottom: 6 },
    overdueTxt: { color: C.danger, fontSize: 11, fontWeight: "700", flexShrink: 1 },

    accountsRow: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    accountsItem: { flex: 1, alignItems: "center" },
    accountsLbl: { color: C.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1, marginBottom: 3 },
    accountsVal: { fontSize: 14, fontWeight: "900" },
    accountsDivider: { width: 1, height: 32, backgroundColor: C.glassBorder, marginHorizontal: 6 },
    accMiniRow: { flexDirection: "row", alignItems: "center", paddingVertical: 5, borderTopWidth: 1, borderTopColor: C.separator },
    accMiniDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
    accMiniName: { flex: 1, color: C.textSub, fontSize: 12 },
    accMiniVal: { fontSize: 12, fontWeight: "700" },

    cardContent: { padding: 16 },
    sectionTitle: { color: C.textPrimary, fontSize: 13, fontWeight: "800", letterSpacing: 0.8 },
    ringBg: { borderColor: C.bgDeep, alignItems: "center", justifyContent: "center" },

    txItem: { flexDirection: "row", alignItems: "center", paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.separator },
    txIcon: { width: 44, height: 44, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginRight: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8 },
    txDesc: { color: C.text, fontSize: 14, fontWeight: "800" },
    txDate: { color: C.textMuted, fontSize: 11 },
    txMoney: { flexShrink: 1, maxWidth: "45%" },
    moneyFill: { alignSelf: "stretch" },
    moneyRowEnd: { flexShrink: 1, maxWidth: "55%" },
    bankBadge: { backgroundColor: C.primary + "33", paddingHorizontal: 6, borderRadius: 4 },
    bankBadgeTxt: { color: C.primaryLight, fontSize: 9, fontWeight: "800" },
    empty: { color: C.textMuted, fontSize: 13, textAlign: "center", marginVertical: 10 },
});
