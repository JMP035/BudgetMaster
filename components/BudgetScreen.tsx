import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated, Easing, LayoutChangeEvent,
    Platform, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View
} from "react-native";
import {
    Account, CategoryBudget, Currency, FixedExpense, IncomeSource, SavingsGoal,
    StorageService, Transaction, UserSettings,
    formatDateOnly, getCurrentFinancialPeriod, getDaysUntilNextPayment, isFixedExpenseOverdue,
    parseAmount, parseDateOnly, storedDateToDateOnly
} from "../services/storage";
import { isSmsFeatureOn } from "../services/features";
import { merchantOfTransaction } from "../services/MerchantRules";
import { matchFixedExpenses } from "../services/FixedExpenseMatcher";
import { cycleKeyFor, defaultPaidDate, feTxId, fixedCycleConfig, fixedDueInfo, periodFor } from "../services/FixedCycle";
import { getAllExpenseCategories, getCat } from "../categories";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "../categories";
import { C, shadow } from "../theme";
import { useTutorialAction, useTutorialRef, useTutorialScroll } from "../context/TutorialContext";
import { NotificationService } from "../services/NotificationService";
import { GlassBackground, GlassCard } from "./GlassCard";
import { GlassButton, GlassButtonGroup } from "./GlassButton";
import { GlassSheet } from "./GlassSheet";
import FixedExpenseModal from "./FixedExpenseModal";
import { useGlassDialog } from "./GlassDialogProvider";
import { HelpButton } from "./HelpButton";
import { InlineNotice } from "./InlineNotice";
import { ScreenHeader } from "./ScreenHeader";
import { useKeyboardHeight } from "./useKeyboardHeight";
import Money from "./Money";
import { formatMoney } from "../services/format";
import {
    CategoryBreakdown, buildPeriodBreakdown, currencyNoun, foreignTotalsOf, formatShortDay, uncoveredCategories
} from "../services/BudgetBreakdown";
import CategoryBreakdownSheet from "./CategoryBreakdownSheet";
import IncomeSourceModal from "./IncomeSourceModal";
import { baseMonthlyIncome, incomeDeltaSuggestion } from "../services/IncomeSources";
import { buildIncomeList, suggestionText } from "../services/IncomeSourceView";
import type { StatusTone } from "../services/IncomeSourceView";
import { sanitizePayRules } from "../services/PayCalendar";

// ─────────────────────────────────────────────────────────────
// BARRA DE PROGRESO ANIMADA
// ─────────────────────────────────────────────────────────────
function AnimatedBar({ pct, color, height = 8 }: { pct: number; color: string; height?: number }) {
    const anim = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.timing(anim, {
            toValue: Math.min(pct, 100),
            duration: 800,
            easing: Easing.out(Easing.cubic),
            useNativeDriver: false,
        }).start();
    }, [pct]);

    const width = anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

    return (
        <View style={[bar.track, { height }]}>
            <Animated.View style={[bar.fill, { width, backgroundColor: color, height }]}>
                {pct > 5 && <View style={[bar.glow, { backgroundColor: color }]} />}
            </Animated.View>
        </View>
    );
}

const bar = StyleSheet.create({
    track: { backgroundColor: C.bgDeep, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: C.glassBorder },
    fill: { borderRadius: 6, position: "relative" },
    glow: { position: "absolute", right: 0, top: -2, width: 12, height: 12, borderRadius: 6, opacity: 0.7 },
});

// ─────────────────────────────────────────────────────────────
// TABS INTERNOS ANIMADOS
// ─────────────────────────────────────────────────────────────
const TAB_LABELS = ["Gastos Fijos", "Categorías", "Metas", "Ingresos"];

function InternalTabs({ active, onChange }: { active: number; onChange: (i: number) => void }) {
    const [width, setWidth] = useState(0);
    const indicatorX = useRef(new Animated.Value(active)).current;
    const containerRef = useTutorialRef('budget_tabs');

    // El indicador sigue a `active`, también cuando el cambio es programático (tutorial)
    useEffect(() => {
        Animated.spring(indicatorX, {
            toValue: active,
            friction: 7,
            tension: 80,
            useNativeDriver: true,
        }).start();
    }, [active]);

    const PAD = 4;
    const segW = width > 0 ? (width - PAD * 2) / TAB_LABELS.length : 0;
    const translateX = indicatorX.interpolate({
        inputRange: [0, 1, 2, 3],
        outputRange: [0, segW, segW * 2, segW * 3],
    });

    return (
        <View ref={containerRef} collapsable={false} style={t.container} onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}>
            <GlassBackground radius={16} blur={false} />
            {segW > 0 && <Animated.View pointerEvents="none" style={[t.indicator, { width: segW, transform: [{ translateX }] }]} />}
            <View style={t.row}>
                {TAB_LABELS.map((label, i) => (
                    <View key={label} style={t.cell}>
                        <TouchableOpacity
                            style={t.tab}
                            onPress={() => onChange(i)}
                            activeOpacity={0.7}
                            accessibilityRole="tab"
                            accessibilityState={{ selected: active === i }}
                        >
                            <Text style={[t.label, active === i && t.labelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{label}</Text>
                        </TouchableOpacity>
                    </View>
                ))}
            </View>
        </View>
    );
}

const t = StyleSheet.create({
    container: { borderRadius: 16, padding: 4, marginBottom: 20, overflow: "hidden" },
    indicator: { position: "absolute", top: 4, bottom: 4, left: 4, borderRadius: 12, backgroundColor: C.glassActive, borderWidth: 1, borderColor: C.glassActiveBorder },
    row: { flexDirection: "row" },
    cell: { flex: 1 },
    tab: { height: 40, paddingHorizontal: 6, alignItems: "center", justifyContent: "center" },
    label: { color: C.textSub, fontSize: 13, fontWeight: "700", textAlign: "center" },
    labelActive: { color: C.primaryLight, fontWeight: "800" },
});

// Monedas ofrecidas en los formularios (se agrega la actual si es otra, p. ej. EUR)
const FORM_CURRENCIES: Currency[] = ["Q", "USD"];

// ─────────────────────────────────────────────────────────────
// MODAL — NUEVA META DE AHORRO
// ─────────────────────────────────────────────────────────────
function SavingsGoalModal({ onSave, onClose, existing, defaultCurrency }: {
    onSave: (g: SavingsGoal) => void;
    onClose: () => void;
    existing?: SavingsGoal;
    defaultCurrency: Currency;
}) {
    const [name, setName] = useState(existing?.name || "");
    const [target, setTarget] = useState(existing?.targetAmount.toString() || "");
    const [current, setCurrent] = useState(existing?.currentAmount.toString() || "0");
    const [currency, setCurrency] = useState<Currency>(existing?.currency || defaultCurrency || "Q");
    const [deadline, setDeadline] = useState(existing?.deadline ? storedDateToDateOnly(existing.deadline) : "");
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [error, setError] = useState("");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const parsedDeadline = parseDateOnly(deadline);
    const pickerValue = parsedDeadline && parsedDeadline >= today ? parsedDeadline : new Date(Date.now() + 180 * 86400000);
    const [selectedColor, setColor] = useState(existing?.color || CATEGORY_COLORS[0]);
    const [selectedIcon, setIcon] = useState(existing?.icon || "star-outline");
    const currencyOptions = FORM_CURRENCIES.includes(currency) ? FORM_CURRENCIES : [...FORM_CURRENCIES, currency];

    const handleSave = () => {
        if (!name.trim()) { setError("Ingresa el nombre de la meta."); return; }
        const tgt = parseAmount(target);
        const cur = parseAmount(current);
        if (isNaN(tgt) || tgt <= 0) { setError("Ingresa un monto objetivo válido."); return; }
        const curVal = isNaN(cur) ? 0 : cur;

        const goal: SavingsGoal = {
            id: existing?.id || `sg_${Date.now()}`,
            name: name.trim(),
            targetAmount: tgt,
            currentAmount: curVal,
            currency,
            deadline: parsedDeadline ? parsedDeadline.toISOString() : new Date(Date.now() + 180 * 86400000).toISOString(),
            icon: selectedIcon,
            color: selectedColor,
            isCompleted: curVal >= tgt,
            createdAt: existing?.createdAt || new Date().toISOString(),
        };
        onSave(goal);
        onClose();
    };

    return (
        <GlassSheet
            onClose={onClose}
            title={`${existing ? "Editar" : "Nueva"} Meta de Ahorro`}
            icon="trophy-outline"
            footer={
                <View style={md.footer}>
                    {!!error && <InlineNotice variant="error" text={error} style={md.notice} />}
                    <GlassButton label={existing ? "Guardar Meta" : "Crear Meta"} icon="trophy-outline" onPress={handleSave} />
                </View>
            }
        >
            {/* Preview */}
            <View style={[md.preview, { borderColor: selectedColor + "55", backgroundColor: selectedColor + "11" }]}>
                <View style={[md.previewIcon, { backgroundColor: selectedColor + "22", borderColor: selectedColor + "44" }]}>
                    <Ionicons name={selectedIcon as any} size={28} color={selectedColor} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={[md.previewName, { color: selectedColor }]} numberOfLines={1}>{name || "Mi Meta"}</Text>
                    <Money amount={parseAmount(target) || 0} currency={currency} size="lg" />
                </View>
            </View>

            <Text style={md.lbl}>NOMBRE DE LA META</Text>
            <TextInput style={md.input} value={name} onChangeText={v => { setName(v); setError(""); }} placeholder="Ej: Laptop, Viaje, Fondo de emergencia..." placeholderTextColor={C.textMuted} autoFocus />

            <View style={md.row}>
                <View style={{ flex: 2, marginRight: 8 }}>
                    <Text style={md.lbl}>MONTO OBJETIVO</Text>
                    <View style={md.amtRow}>
                        <Text style={md.cur}>{currency}</Text>
                        <TextInput style={md.amtInput} value={target} onChangeText={v => { setTarget(v); setError(""); }} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
                    </View>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={md.lbl}>MONEDA</Text>
                    <View style={{ gap: 6 }}>
                        {currencyOptions.map(c => (
                            <TouchableOpacity key={c} style={[md.miniBtn, currency === c && md.miniBtnActive]} onPress={() => setCurrency(c)}>
                                <Text style={[md.miniTxt, currency === c && { color: C.primaryLight }]}>{c}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>
            </View>

            <Text style={md.lbl}>YA TENGO AHORRADO</Text>
            <View style={md.amtRow}>
                <Text style={md.cur}>{currency}</Text>
                <TextInput style={md.amtInput} value={current} onChangeText={setCurrent} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
            </View>

            <Text style={md.lbl}>FECHA LÍMITE (OPCIONAL)</Text>
            <TouchableOpacity style={md.dateField} onPress={() => setShowDatePicker(true)} activeOpacity={0.75}>
                <GlassBackground radius={12} blur={false} />
                <Ionicons name="calendar-outline" size={18} color={C.primaryLight} style={{ marginRight: 10 }} />
                <Text style={[md.dateTxt, !parsedDeadline && { color: C.textMuted }]} numberOfLines={1}>
                    {parsedDeadline ? parsedDeadline.toLocaleDateString("es-GT", { day: "2-digit", month: "long", year: "numeric" }) : "Elegir fecha"}
                </Text>
                {parsedDeadline && (
                    <TouchableOpacity onPress={() => setDeadline("")} hitSlop={10}>
                        <Ionicons name="close-circle" size={18} color={C.textMuted} />
                    </TouchableOpacity>
                )}
            </TouchableOpacity>
            <Text style={md.hint}>Si no elegís una fecha, se usan 6 meses desde hoy.</Text>
            {showDatePicker && Platform.OS === "android" && (
                <DateTimePicker
                    value={pickerValue}
                    mode="date"
                    display="default"
                    minimumDate={today}
                    onChange={(event, selected) => {
                        setShowDatePicker(false);
                        if (event.type === "set" && selected) setDeadline(formatDateOnly(selected));
                    }}
                />
            )}
            {showDatePicker && Platform.OS === "ios" && (
                <View style={md.iosPickerWrap}>
                    <DateTimePicker
                        value={pickerValue}
                        mode="date"
                        display="inline"
                        themeVariant="dark"
                        minimumDate={today}
                        accentColor={C.primary}
                        onChange={(_e, selected) => { if (selected) setDeadline(formatDateOnly(selected)); }}
                    />
                    <TouchableOpacity style={md.iosPickerDone} onPress={() => setShowDatePicker(false)}>
                        <Text style={md.iosPickerDoneTxt}>Listo</Text>
                    </TouchableOpacity>
                </View>
            )}

            <Text style={md.lbl}>COLOR</Text>
            <View style={md.colorGrid}>
                {CATEGORY_COLORS.slice(0, 10).map(c => (
                    <TouchableOpacity key={c} style={[md.colorDot, { backgroundColor: c }, selectedColor === c && md.colorDotActive]} onPress={() => setColor(c)}>
                        {selectedColor === c && <Ionicons name="checkmark" size={14} color={C.textPrimary} />}
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={md.lbl}>ÍCONO</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                    {CATEGORY_ICONS.slice(0, 16).map(ic => (
                        <TouchableOpacity key={ic} style={[md.iconBtn, selectedIcon === ic && { borderColor: selectedColor, backgroundColor: selectedColor + "22" }]} onPress={() => setIcon(ic as any)}>
                            <Ionicons name={ic} size={22} color={selectedIcon === ic ? selectedColor : C.textSub} />
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>
            <View style={{ height: 8 }} />
        </GlassSheet>
    );
}

// ─────────────────────────────────────────────────────────────
// HOJA "¿CUÁNDO SE PAGÓ?" (marcar un gasto fijo como pagado a mano)
// ─────────────────────────────────────────────────────────────
function PaidDateSheet({ expenseName, initial, minDate, onConfirm, onCancel }: {
    expenseName: string;
    initial: Date;
    minDate: Date;
    onConfirm: (picked: Date) => void;
    onCancel: () => void;
}) {
    const [picked, setPicked] = useState(initial);
    const [showPicker, setShowPicker] = useState(false);
    // Sin fechas futuras: el tope es el final de hoy.
    const maxDate = new Date();
    maxDate.setHours(23, 59, 59, 999);
    const dateLabel = picked.toLocaleDateString("es-GT", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });
    const toNoon = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);

    return (
        <GlassSheet
            onClose={onCancel}
            title="¿Cuándo se pagó?"
            icon="calendar-outline"
            footer={
                <View style={md.footer}>
                    <GlassButtonGroup>
                        <GlassButton label="Confirmar" icon="checkmark" onPress={() => onConfirm(picked)} />
                        <GlassButton label="Cancelar" kind="secondary" onPress={onCancel} />
                    </GlassButtonGroup>
                </View>
            }
        >
            <Text style={md.paidSubtitle}>{expenseName}</Text>
            <Text style={md.lbl}>FECHA DE PAGO</Text>
            <TouchableOpacity
                style={md.dateField}
                onPress={() => setShowPicker(v => !v)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`Fecha de pago: ${dateLabel}. Toca para cambiarla`}
            >
                <GlassBackground radius={12} blur={false} />
                <Ionicons name="calendar-outline" size={18} color={C.primaryLight} style={{ marginRight: 10 }} />
                <Text style={[md.dateTxt, { textTransform: "capitalize" }]}>{dateLabel}</Text>
                <Ionicons name="chevron-down" size={16} color={C.textSub} />
            </TouchableOpacity>
            <Text style={md.hint}>Solo fechas de este período (desde el {formatShortDay(minDate)}) y nunca futuras.</Text>
            {showPicker && Platform.OS === "android" && (
                <DateTimePicker
                    value={picked}
                    mode="date"
                    display="default"
                    minimumDate={minDate}
                    maximumDate={maxDate}
                    onChange={(event, selected) => {
                        setShowPicker(false);
                        if (event.type === "set" && selected) setPicked(toNoon(selected));
                    }}
                />
            )}
            {showPicker && Platform.OS === "ios" && (
                <View style={md.iosPickerWrap}>
                    <DateTimePicker
                        value={picked}
                        mode="date"
                        display="inline"
                        themeVariant="dark"
                        minimumDate={minDate}
                        maximumDate={maxDate}
                        accentColor={C.primary}
                        onChange={(_e, selected) => { if (selected) setPicked(toNoon(selected)); }}
                    />
                    <TouchableOpacity style={md.iosPickerDone} onPress={() => setShowPicker(false)}>
                        <Text style={md.iosPickerDoneTxt}>Listo</Text>
                    </TouchableOpacity>
                </View>
            )}
            <View style={{ height: 8 }} />
        </GlassSheet>
    );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN 1 — GASTOS FIJOS
// ─────────────────────────────────────────────────────────────
function FixedExpensesTab({
    fixedExpenses, setFixedExpenses, transactions, setTransactions, settings, onRefresh
}: {
    fixedExpenses: FixedExpense[];
    setFixedExpenses: (e: FixedExpense[]) => void;
    transactions: Transaction[];
    setTransactions: (t: Transaction[]) => void;
    settings: UserSettings;
    onRefresh?: () => void;
}) {
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<FixedExpense | undefined>();
    const [paidPrompt, setPaidPrompt] = useState<{ expense: FixedExpense; initial: Date; minDate: Date; resolve: (d: Date | null) => void } | null>(null);
    const dialog = useGlassDialog();
    const smsOn = isSmsFeatureOn(settings);
    const cycle = fixedCycleConfig(settings);
    const tutScroll = useTutorialScroll('budget_fixed');
    const summaryRef = useTutorialRef('budget_fixed_summary');
    const listRef = useTutorialRef('budget_fixed_list');
    const fabRef = useTutorialRef('budget_fixed_fab');

    const active = fixedExpenses.filter(e => e.isActive);
    const paid = active.filter(e => e.isPaid).length;
    const totalQ = active.filter(e => e.currency === 'Q').reduce((s, e) => s + e.amount, 0);
    const paidQ = active.filter(e => e.isPaid && e.currency === 'Q').reduce((s, e) => s + e.amount, 0);

    /** Abre la hoja "¿Cuándo se pagó?"; resuelve con la fecha elegida o null si se cancela. */
    const askPaidDate = (expense: FixedExpense, initial: Date, minDate: Date) =>
        new Promise<Date | null>(resolve => setPaidPrompt({ expense, initial, minDate, resolve }));

    const closePaidPrompt = (result: Date | null) => {
        paidPrompt?.resolve(result);
        setPaidPrompt(null);
    };

    const handleTogglePaid = async (expense: FixedExpense) => {
        const willBePaid = !expense.isPaid;
        let lastTxId = expense.lastTxId;

        if (!willBePaid) {
            // Al desmarcar: unmarkFixedPaid borra solo el registro manual (fe_tx_*) y,
            // si lo pagó un SMS, suelta el vínculo SIN borrar ni descartar el movimiento.
            const all = await StorageService.unmarkFixedPaid(expense.id);
            setFixedExpenses(all);
            setTransactions(await StorageService.getTransactions());
            const reverted = all.find(e => e.id === expense.id);
            if (reverted) {
                void NotificationService.scheduleFixedExpenseReminder(reverted).catch(e => console.warn("[FixedExpense] recordatorio:", e));
            }
            onRefresh?.();
            return;
        }

        // Con SMS activo: si ya hay un pago del banco que corresponde a este gasto, se ofrece usarlo.
        if (smsOn) {
            try {
                const ign = new Set(await StorageService.getDupIgnored());
                const m = matchFixedExpenses(
                    transactions.filter(t => t.source === 'sms'), [expense], transactions, new Date(), { cycle, ignored: ign },
                )[0];
                const smsTx = m ? transactions.find(t => t.id === m.txId) : undefined;
                if (m && smsTx) {
                    const d = storedDateToDateOnly(smsTx.date).split("-");
                    const ok = await dialog.confirm({
                        title: "Ya hay un pago del banco",
                        message: `Encontramos ${merchantOfTransaction(smsTx) ?? smsTx.description} por ${formatMoney(smsTx.amount, smsTx.currency)} el ${d[2]}/${d[1]}/${d[0]}. ¿Usar ese pago en vez de crear un registro manual?`,
                        confirmLabel: "Usar pago del banco",
                        cancelLabel: "Registrar a mano",
                        variant: "info",
                        destructive: false,
                    });
                    if (ok) {
                        const res = await StorageService.linkSmsToFixed(m.txId, expense.id, { learn: true });
                        setFixedExpenses(res.fixedExpenses);
                        setTransactions(res.transactions);
                        const linked = res.fixedExpenses.find(e => e.id === expense.id);
                        if (linked) {
                            void NotificationService.scheduleFixedExpenseReminder(linked).catch(e => console.warn("[FixedExpense] recordatorio:", e));
                        }
                        onRefresh?.();
                        return;
                    }
                }
            } catch (e) {
                console.warn("[FixedExpense] pago del banco:", e instanceof Error ? e.message : "desconocido");
            }
        }

        // Pago a mano: se pregunta la fecha (por defecto, el día de cobro si ya pasó; si no, hoy).
        const now = new Date();
        const period = periodFor(cycle, now);
        const pickedDay = await askPaidDate(expense, defaultPaidDate(expense.dayOfMonth, now, cycle), period.start);
        if (!pickedDay) return;
        // Día elegido + hora actual (conserva el orden dentro del día; mismo criterio que AddScreen).
        const paidAt = new Date(pickedDay.getFullYear(), pickedDay.getMonth(), pickedDay.getDate(),
            now.getHours(), now.getMinutes(), now.getSeconds(), now.getMilliseconds());
        const cycleKey = cycleKeyFor(cycle, formatDateOnly(pickedDay)) ?? period.key;
        if (expense.autoRecord) {
            // Al marcar como pagado con auto-registro: id determinístico, reversible y único por período
            let txId = feTxId(expense.id, cycleKey);
            if (transactions.some(t => t.id === txId)) txId = `${txId}_${Date.now()}`;
            const tx: Transaction = {
                id: txId,
                amount: expense.amount,
                description: expense.name,
                category: expense.category,
                date: paidAt.toISOString(),
                type: 'expense',
                source: 'manual',
                currency: expense.currency,
            };
            const txAll = await StorageService.addTransaction(tx);
            setTransactions(txAll);
            lastTxId = tx.id;
        }

        const updated: FixedExpense = {
            ...expense,
            isPaid: true,
            paidDate: paidAt.toISOString(),
            lastTxId,
            paidBy: 'manual',
            paidCycleKey: cycleKey,
        };
        const all = await StorageService.updateFixedExpense(updated);
        setFixedExpenses(all);
        void NotificationService.scheduleFixedExpenseReminder(updated).catch(e => console.warn("[FixedExpense] recordatorio:", e));

        // Notificar al padre para que recargue todos los datos
        onRefresh?.();
    };

    const handleSave = async (expense: FixedExpense) => {
        const isNew = !fixedExpenses.find(e => e.id === expense.id);
        const all = isNew
            ? await StorageService.addFixedExpense(expense)
            : await StorageService.updateFixedExpense(expense);
        setFixedExpenses(all);
        void NotificationService.scheduleFixedExpenseReminder(expense).catch(e => console.warn("[FixedExpense] recordatorio:", e));
    };

    const handleDelete = async (expense: FixedExpense) => {
        const ok = await dialog.confirm({
            title: "Eliminar gasto fijo",
            message: `¿Borrar "${expense.name}"?`,
            confirmLabel: "Eliminar",
            destructive: true,
        });
        if (!ok) return;
        const all = await StorageService.deleteFixedExpense(expense.id);
        setFixedExpenses(all);
        void NotificationService.cancelFixedExpenseReminder(expense.id).catch(e => console.warn("[FixedExpense] cancelar recordatorio:", e));
    };

    const daysLeft = getDaysUntilNextPayment(settings);
    const listNow = new Date();

    return (
        <View style={{ flex: 1 }}>
            {/* LISTA Y RESUMEN */}
            <ScrollView {...tutScroll} showsVerticalScrollIndicator={false}>
                {/* RESUMEN */}
                <View ref={summaryRef} collapsable={false}>
                    <GlassCard radius={16} blur={false} style={s.summaryCard} contentStyle={s.summaryContent}>
                        <View style={s.summaryItem}>
                            <Text style={s.summaryVal}>{paid}/{active.length}</Text>
                            <Text style={s.summaryLbl}>PAGADOS</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryItem}>
                            <Money amount={paidQ} currency="Q" size="md" tone="income" decimals={0} align="center" containerStyle={s.summaryMoney} />
                            <Text style={s.summaryLbl}>CUBIERTO</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryItem}>
                            <Money amount={totalQ - paidQ} currency="Q" size="md" tone="warning" decimals={0} align="center" containerStyle={s.summaryMoney} />
                            <Text style={s.summaryLbl}>PENDIENTE</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryItem}>
                            <Text style={[s.summaryVal, { color: daysLeft <= 5 ? C.danger : C.accent }]}>{daysLeft}d</Text>
                            <Text style={s.summaryLbl}>PRÓX. PAGO</Text>
                        </View>
                    </GlassCard>

                    <AnimatedBar pct={active.length > 0 ? (paid / active.length) * 100 : 0} color={C.income} height={6} />
                    <Text style={s.barLabel}>{Math.round(active.length > 0 ? (paid / active.length) * 100 : 0)}% de gastos fijos cubiertos este período</Text>
                </View>

                <View ref={listRef} collapsable={false} style={{ marginTop: 16 }}>
                    {active.length === 0 ? (
                        <View style={s.empty}>
                            <Ionicons name="calendar-outline" size={48} color={C.textMuted} />
                            <Text style={s.emptyTitle}>Sin gastos fijos</Text>
                            <Text style={s.emptyDesc}>Agrega tus compromisos mensuales: renta, internet, tarjetas, etc.</Text>
                        </View>
                    ) : (
                        active
                            .map(expense => ({ expense, info: fixedDueInfo(expense, cycle, listNow) }))
                            .sort((a, b) => a.info.due.getTime() - b.info.due.getTime())
                            .map(({ expense, info }) => {
                                const cat = getCat(expense.category, settings.customCategories);
                                const isOverdue = isFixedExpenseOverdue(expense, cycle, listNow);
                                return (
                                    <GlassCard
                                        key={expense.id}
                                        radius={16}
                                        blur={false}
                                        leftAccentColor={isOverdue ? C.danger : undefined}
                                        style={[s.fixedCard, expense.isPaid && s.fixedCardPaid]}
                                    >
                                        <TouchableOpacity
                                            style={s.fixedRow}
                                            onLongPress={() => { setEditing(expense); setShowModal(true); }}
                                            activeOpacity={0.8}
                                        >
                                            <TouchableOpacity
                                                style={[s.checkbox, expense.isPaid && s.checkboxPaid]}
                                                onPress={() => handleTogglePaid(expense)}
                                                accessibilityRole="checkbox"
                                                accessibilityLabel={`Marcar ${expense.name} como ${expense.isPaid ? "pendiente" : "pagado"}`}
                                                accessibilityState={{ checked: expense.isPaid }}
                                            >
                                                {expense.isPaid && <Ionicons name="checkmark" size={16} color={C.onPrimary} />}
                                            </TouchableOpacity>

                                            <View style={[s.fixedIcon, { backgroundColor: cat.color + "22", borderColor: cat.color + "44" }]}>
                                                <Ionicons name={cat.icon} size={20} color={cat.color} />
                                            </View>

                                            <View style={{ flex: 1 }}>
                                                <Text style={[s.fixedName, expense.isPaid && { textDecorationLine: "line-through", color: C.textMuted }]}>
                                                    {expense.name}
                                                </Text>
                                                <View style={s.fixedMeta}>
                                                    <Text style={s.fixedDay}>
                                                        Día {expense.dayOfMonth}
                                                        {expense.isPaid
                                                            ? ` · próximo ${formatShortDay(info.nextDue)}`
                                                            : ` · ${isOverdue ? "venció" : "vence"} ${formatShortDay(info.due)}`}
                                                    </Text>
                                                    {isOverdue && <View style={s.overdueBadge}><Text style={s.overdueTxt}>VENCIDO</Text></View>}
                                                    {expense.autoRecord && <View style={s.autoBadge}><Text style={s.autoTxt}>AUTO</Text></View>}
                                                    {smsOn && expense.isPaid && expense.paidBy === 'sms' && <View style={s.autoBadge}><Text style={s.autoTxt}>SMS</Text></View>}
                                                </View>
                                            </View>

                                            <View style={{ alignItems: "flex-end" }}>
                                                <Money amount={expense.amount} currency={expense.currency} size="sm" tone={expense.isPaid ? "income" : "expense"} align="right" />
                                                <TouchableOpacity
                                                    onPress={() => handleDelete(expense)}
                                                    style={s.deleteBtn}
                                                    accessibilityRole="button"
                                                    accessibilityLabel={`Eliminar ${expense.name}`}
                                                >
                                                    <Ionicons name="trash-outline" size={14} color={C.danger} />
                                                </TouchableOpacity>
                                            </View>
                                        </TouchableOpacity>
                                    </GlassCard>
                                );
                            })
                    )}
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>

            {/* FAB */}
            <View ref={fabRef} collapsable={false} style={s.fabWrap}>
                <TouchableOpacity
                    style={s.fab}
                    onPress={() => { setEditing(undefined); setShowModal(true); }}
                    accessibilityRole="button"
                    accessibilityLabel="Agregar gasto fijo"
                >
                    <Ionicons name="add" size={28} color={C.onPrimary} />
                </TouchableOpacity>
            </View>

            {paidPrompt && (
                <PaidDateSheet
                    expenseName={paidPrompt.expense.name}
                    initial={paidPrompt.initial}
                    minDate={paidPrompt.minDate}
                    onConfirm={d => closePaidPrompt(d)}
                    onCancel={() => closePaidPrompt(null)}
                />
            )}

            {showModal && (
                <FixedExpenseModal
                    existing={editing}
                    onSave={handleSave}
                    onClose={() => { setShowModal(false); setEditing(undefined); }}
                    customCategories={settings.customCategories}
                    defaultCurrency={settings.currency || "Q"}
                    smsOn={smsOn}
                />
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN 2 — PRESUPUESTO POR CATEGORÍA
// ─────────────────────────────────────────────────────────────
function CategoryBudgetTab({
    categoryBudgets, setCategoryBudgets, transactions, settings, fixedExpenses
}: {
    categoryBudgets: CategoryBudget[];
    setCategoryBudgets: (b: CategoryBudget[]) => void;
    transactions: Transaction[];
    settings: UserSettings;
    fixedExpenses: FixedExpense[];
}) {
    const [editing, setEditing] = useState<string | null>(null);
    const [breakdownCat, setBreakdownCat] = useState<string | null>(null);
    const [limitVal, setLimitVal] = useState("");
    const [limitError, setLimitError] = useState("");
    const kb = useKeyboardHeight();
    const scrollRef = useRef<ScrollView>(null);
    const tutScroll = useTutorialScroll('budget_categories', scrollRef);
    const summaryRef = useTutorialRef('budget_cat_summary');
    const gridRef = useTutorialRef('budget_cat_grid');
    const listRef = useTutorialRef('budget_cat_list');
    const limitCardY = useRef(0);
    useEffect(() => {
        if (kb > 0 && editing) {
            scrollRef.current?.scrollTo({ y: Math.max(limitCardY.current - 24, 0), animated: true });
        }
    }, [kb, editing]);

    const fp = getCurrentFinancialPeriod(settings);
    const periodTx = transactions.filter(t => {
        const d = new Date(t.date);
        return d >= fp.start && d <= fp.end && t.type === 'expense' && (t.currency === 'Q' || !t.currency);
    });

    const allCats = getAllExpenseCategories(settings.customCategories);

    const getSpent = (catId: string) =>
        periodTx.filter(t => t.category === catId).reduce((s, t) => s + t.amount, 0);

    const handleSaveBudget = async (catId: string) => {
        const val = parseAmount(limitVal);
        if (isNaN(val) || val <= 0) { setLimitError("Ingresa un límite válido."); return; }
        const budget: CategoryBudget = { categoryId: catId, limit: val, currency: "Q", alertAt: 80 };
        const all = await StorageService.upsertCategoryBudget(budget);
        setCategoryBudgets(all);
        setEditing(null);
        setLimitVal("");
        setLimitError("");
    };

    const handleDelete = async (catId: string) => {
        const all = await StorageService.deleteCategoryBudget(catId);
        setCategoryBudgets(all);
    };

    const totalBudgeted = categoryBudgets.reduce((s, b) => s + b.limit, 0);
    const totalSpent = categoryBudgets.reduce((s, b) => s + getSpent(b.categoryId), 0);

    // Desglose del período por categoría y moneda (solo lectura; el total en Q de arriba sigue usando getSpent)
    const periodStartMs = fp.start.getTime();
    const periodEndMs = fp.end.getTime();
    const breakdowns = useMemo(
        () => buildPeriodBreakdown(transactions, { start: new Date(periodStartMs), end: new Date(periodEndMs) }),
        [transactions, periodStartMs, periodEndMs],
    );
    const foreignSummary = foreignTotalsOf(breakdowns);
    const uncovered = uncoveredCategories(breakdowns, categoryBudgets.map(b => b.categoryId));
    const foreignLine = (list: CategoryBreakdown["foreign"]) =>
        list.map(b => `En ${currencyNoun(b.currency)}: ${formatMoney(b.total, b.currency)}`);

    return (
        <>
        <ScrollView {...tutScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* RESUMEN TOTAL */}
            <View ref={summaryRef} collapsable={false}>
                <GlassCard radius={16} blur={false} style={s.summaryCard} contentStyle={s.summaryContent}>
                    <View style={s.summaryItem}>
                        <Money amount={totalBudgeted} currency="Q" size="md" tone="neutral" decimals={0} align="center" containerStyle={s.summaryMoney} />
                        <Text style={s.summaryLbl}>PLANIFICADO</Text>
                    </View>
                    <View style={s.summaryDivider} />
                    <View style={s.summaryItem}>
                        <Money amount={totalSpent} currency="Q" size="md" tone="expense" decimals={0} align="center" containerStyle={s.summaryMoney} />
                        <Text style={s.summaryLbl}>GASTADO</Text>
                    </View>
                    <View style={s.summaryDivider} />
                    <View style={s.summaryItem}>
                        <Money amount={totalBudgeted - totalSpent} currency="Q" size="md" tone="auto" decimals={0} align="center" containerStyle={s.summaryMoney} />
                        <Text style={s.summaryLbl}>{totalBudgeted - totalSpent >= 0 ? "DISPONIBLE" : "EXCESO"}</Text>
                    </View>
                </GlassCard>
            </View>
            {foreignSummary.length > 0 && (
                <Text style={s.fxSummary}>
                    Además gastaste {foreignSummary.map(f => `${formatMoney(f.total, f.currency)} en ${currencyNoun(f.currency)}`).join(" y ")} (aparte)
                </Text>
            )}

            <View ref={listRef} collapsable={false}>
            {/* CATEGORÍAS CON PRESUPUESTO */}
            {categoryBudgets.length > 0 && (
                <Text style={s.sectionTitle}>CON PRESUPUESTO ASIGNADO</Text>
            )}

            {categoryBudgets.map(cb => {
                const cat = getCat(cb.categoryId, settings.customCategories);
                const spent = getSpent(cb.categoryId);
                const pct = Math.min((spent / cb.limit) * 100, 100);
                const over = spent > cb.limit;
                const barColor = over ? C.danger : pct > 80 ? C.warning : cat.color;
                const fxLines = foreignLine(breakdowns.get(cb.categoryId)?.foreign ?? []);
                const openBreakdown = () => setBreakdownCat(cb.categoryId);

                return (
                    <GlassCard key={cb.categoryId} radius={16} blur={false} style={s.catBudgetCard} contentStyle={s.catBudgetContent}>
                        <View style={s.catBudgetHeader}>
                            <TouchableOpacity
                                style={s.catMainTap}
                                activeOpacity={0.7}
                                onPress={openBreakdown}
                                accessibilityRole="button"
                                accessibilityLabel={`Ver movimientos de ${cat.label}`}
                            >
                                <View style={[s.catIcon, { backgroundColor: cat.color + "22", borderColor: cat.color + "44" }]}>
                                    <Ionicons name={cat.icon} size={18} color={cat.color} />
                                </View>
                                <View style={{ flex: 1, flexShrink: 1 }}>
                                    <Text style={s.catName}>{cat.label}</Text>
                                    <Text style={[s.catStatus, { color: barColor }]}>
                                        {over ? `Excedido ${formatMoney(spent - cb.limit, "Q")}` : `${formatMoney(cb.limit - spent, "Q")} disponibles`}
                                    </Text>
                                </View>
                                <View style={{ alignItems: "flex-end" }}>
                                    <Money amount={spent} currency="Q" size="sm" align="right" />
                                    <Text style={s.catLimit}>de {formatMoney(cb.limit, "Q")}</Text>
                                </View>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={() => handleDelete(cb.categoryId)}
                                style={[s.deleteBtn, { marginLeft: 8 }]}
                                accessibilityRole="button"
                                accessibilityLabel={`Quitar presupuesto de ${cat.label}`}
                            >
                                <Ionicons name="trash-outline" size={14} color={C.danger} />
                            </TouchableOpacity>
                        </View>
                        {/* El resto de la tarjeta también abre el desglose (el botón de arriba ya lo anuncia) */}
                        <TouchableOpacity activeOpacity={0.7} onPress={openBreakdown} accessible={false}>
                            {fxLines.map(line => (
                                <Text key={line} style={s.fxLine}>{line}</Text>
                            ))}
                            <AnimatedBar pct={pct} color={barColor} height={8} />
                            <View style={s.catFooter}>
                                <Text style={s.pctLabel}>{Math.round(pct)}%</Text>
                                <View style={s.viewMore}>
                                    <Text style={s.viewMoreTxt}>Ver movimientos</Text>
                                    <Ionicons name="chevron-forward" size={13} color={C.textSub} />
                                </View>
                            </View>
                        </TouchableOpacity>
                    </GlassCard>
                );
            })}

            {/* GASTOS SIN PRESUPUESTO */}
            {uncovered.length > 0 && (
                <>
                    <Text style={[s.sectionTitle, { marginTop: 8 }]}>GASTOS SIN PRESUPUESTO</Text>
                    <Text style={s.sectionHint}>Categorías con gasto este período que no tienen límite. Toca una para ver sus movimientos.</Text>
                    {uncovered.map(e => {
                        const cat = getCat(e.categoryId, settings.customCategories, "expense");
                        const fxLines = foreignLine(e.foreign);
                        return (
                            <TouchableOpacity
                                key={e.categoryId}
                                activeOpacity={0.75}
                                onPress={() => setBreakdownCat(e.categoryId)}
                                accessibilityRole="button"
                                accessibilityLabel={`Ver movimientos de ${cat.label}`}
                            >
                                <GlassCard radius={14} blur={false} style={s.uncoveredCard} contentStyle={s.uncoveredContent}>
                                    <View style={[s.catIcon, { backgroundColor: cat.color + "22", borderColor: cat.color + "44" }]}>
                                        <Ionicons name={cat.icon} size={18} color={cat.color} />
                                    </View>
                                    <View style={{ flex: 1, flexShrink: 1 }}>
                                        <Text style={s.catName} numberOfLines={2}>{cat.label}</Text>
                                    </View>
                                    <View style={s.uncoveredAmounts}>
                                        {e.qTotal > 0 && (
                                            <Money amount={e.qTotal} currency="Q" size="sm" tone="expense" gradient={false} align="right" />
                                        )}
                                        {fxLines.map(line => (
                                            <Text key={line} style={[s.fxLine, s.fxLineRight]}>{line}</Text>
                                        ))}
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color={C.textSub} />
                                </GlassCard>
                            </TouchableOpacity>
                        );
                    })}
                </>
            )}
            </View>

            {/* AGREGAR PRESUPUESTO A CATEGORÍAS */}
            <View ref={gridRef} collapsable={false}>
                <Text style={[s.sectionTitle, { marginTop: 8 }]}>AGREGAR PRESUPUESTO</Text>
                <Text style={s.sectionHint}>Toca una categoría para asignarle un límite mensual.</Text>

                <View style={s.catGrid}>
                    {allCats
                        .filter(cat => !categoryBudgets.find(cb => cb.categoryId === cat.id))
                        .map(cat => (
                            <TouchableOpacity
                                key={cat.id}
                                style={[s.catChip, editing === cat.id && s.catChipActive]}
                                onPress={() => { setEditing(cat.id); setLimitVal(""); setLimitError(""); }}
                                accessibilityRole="button"
                                accessibilityState={{ selected: editing === cat.id }}
                            >
                                <Ionicons name={cat.icon} size={16} color={editing === cat.id ? cat.color : C.textSub} />
                                <Text style={[s.catChipTxt, editing === cat.id && { color: C.primaryLight }]}>{cat.label}</Text>
                            </TouchableOpacity>
                        ))}
                </View>
            </View>

            {editing && (
                <View style={{ marginBottom: 16 }} onLayout={e => { limitCardY.current = e.nativeEvent.layout.y; }}>
                    <GlassCard radius={14} blur={false} contentStyle={s.limitInputContent}>
                        <Text style={s.limitInputLabel}>Límite para {getCat(editing, settings.customCategories).label}</Text>
                        <View style={s.limitRow}>
                            <Text style={s.limitCur}>Q</Text>
                            <TextInput
                                style={s.limitInput}
                                value={limitVal}
                                onChangeText={v => { setLimitVal(v); setLimitError(""); }}
                                placeholder="0.00"
                                placeholderTextColor={C.textMuted}
                                keyboardType="decimal-pad"
                                autoFocus
                            />
                            <TouchableOpacity style={s.limitSaveBtn} onPress={() => handleSaveBudget(editing)} accessibilityRole="button" accessibilityLabel="Guardar límite">
                                <Ionicons name="checkmark" size={20} color={C.onPrimary} />
                            </TouchableOpacity>
                            <TouchableOpacity style={s.limitCancelBtn} onPress={() => { setEditing(null); setLimitError(""); }} accessibilityRole="button" accessibilityLabel="Cancelar">
                                <GlassBackground radius={20} blur={false} />
                                <Ionicons name="close" size={20} color={C.textSub} />
                            </TouchableOpacity>
                        </View>
                        {!!limitError && <InlineNotice variant="error" text={limitError} style={s.inlineNotice} />}
                    </GlassCard>
                </View>
            )}

            <View style={{ height: 100 + kb }} />
        </ScrollView>

        {/* DESGLOSE DE MOVIMIENTOS DE LA CATEGORÍA (solo lectura) */}
        {breakdownCat && (
            <CategoryBreakdownSheet
                categoryId={breakdownCat}
                breakdown={breakdowns.get(breakdownCat)}
                limit={categoryBudgets.find(b => b.categoryId === breakdownCat)?.limit}
                period={{ start: fp.start, end: fp.end }}
                settings={settings}
                fixedExpenses={fixedExpenses}
                onClose={() => setBreakdownCat(null)}
            />
        )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN 3 — METAS DE AHORRO
// ─────────────────────────────────────────────────────────────
function SavingsGoalsTab({
    savingsGoals, setSavingsGoals, settings
}: {
    savingsGoals: SavingsGoal[];
    setSavingsGoals: (g: SavingsGoal[]) => void;
    settings: UserSettings;
}) {
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<SavingsGoal | undefined>();
    const [abonoId, setAbonoId] = useState<string | null>(null);
    const [abonoVal, setAbonoVal] = useState("");
    const [abonoError, setAbonoError] = useState("");
    const dialog = useGlassDialog();
    const kb = useKeyboardHeight();
    const scrollRef = useRef<ScrollView>(null);
    const tutScroll = useTutorialScroll('budget_goals', scrollRef);
    const listRef = useTutorialRef('budget_goals_list');
    const fabRef = useTutorialRef('budget_goals_fab');
    const goalYs = useRef<Record<string, number>>({});
    useEffect(() => {
        if (kb > 0 && abonoId) {
            const y = goalYs.current[abonoId];
            if (y !== undefined) scrollRef.current?.scrollTo({ y: Math.max(y - 16, 0), animated: true });
        }
    }, [kb, abonoId]);

    const handleSave = async (goal: SavingsGoal) => {
        const isNew = !savingsGoals.find(g => g.id === goal.id);
        const all = isNew
            ? await StorageService.addSavingsGoal(goal)
            : await StorageService.updateSavingsGoal(goal);
        setSavingsGoals(all);
    };

    const handleAbono = async (goal: SavingsGoal) => {
        const val = parseAmount(abonoVal);
        if (isNaN(val) || val <= 0) { setAbonoError("Ingresa un monto válido."); return; }
        const updated = {
            ...goal,
            currentAmount: goal.currentAmount + val,
            isCompleted: goal.currentAmount + val >= goal.targetAmount,
        };
        const all = await StorageService.updateSavingsGoal(updated);
        setSavingsGoals(all);
        void NotificationService.notifyGoalProgressIfCrossed(goal, updated, settings).catch(e => console.warn("[Abono] notificación:", e));
        setAbonoId(null);
        setAbonoVal("");
        setAbonoError("");
    };

    const handleDelete = async (goal: SavingsGoal) => {
        const ok = await dialog.confirm({
            title: "Eliminar meta",
            message: `¿Borrar la meta "${goal.name}"?`,
            confirmLabel: "Eliminar",
            destructive: true,
        });
        if (!ok) return;
        const all = await StorageService.deleteSavingsGoal(goal.id);
        setSavingsGoals(all);
    };

    const active = savingsGoals.filter(g => !g.isCompleted);
    const completed = savingsGoals.filter(g => g.isCompleted);

    return (
        <View style={{ flex: 1 }}>
            <ScrollView {...tutScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View ref={listRef} collapsable={false}>
                    {savingsGoals.length === 0 ? (
                        <View style={s.empty}>
                            <Ionicons name="trophy-outline" size={48} color={C.textMuted} />
                            <Text style={s.emptyTitle}>Sin metas de ahorro</Text>
                            <Text style={s.emptyDesc}>Define hacia dónde va tu dinero. Una laptop, un viaje, un fondo de emergencia.</Text>
                        </View>
                    ) : null}

                    {active.map(goal => {
                        const pct = Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
                        const remaining = goal.targetAmount - goal.currentAmount;
                        const deadline = parseDateOnly(storedDateToDateOnly(goal.deadline)) ?? new Date(goal.deadline);
                        const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
                        const monthly = daysLeft > 0 ? remaining / Math.max(daysLeft / 30, 0.1) : null;

                        return (
                            <View key={goal.id} style={s.goalWrap} onLayout={e => { goalYs.current[goal.id] = e.nativeEvent.layout.y; }}>
                                <GlassCard radius={18} blur={false} topAccentColor={goal.color} contentStyle={s.goalContent}>
                                    <View style={s.goalHeader}>
                                        <View style={[s.goalIcon, { backgroundColor: goal.color + "22", borderColor: goal.color + "44" }]}>
                                            <Ionicons name={goal.icon as any} size={22} color={goal.color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.goalName}>{goal.name}</Text>
                                            <Text style={[s.goalPct, { color: goal.color }]}>{Math.round(pct)}% completado</Text>
                                        </View>
                                        <View style={s.goalAmounts}>
                                            <Money amount={goal.currentAmount} currency={goal.currency} size="md" align="right" containerStyle={s.goalMoney} />
                                            <Text style={s.goalTarget}>de {formatMoney(goal.targetAmount, goal.currency)}</Text>
                                        </View>
                                    </View>

                                    <AnimatedBar pct={pct} color={goal.color} height={10} />

                                    <View style={s.goalStats}>
                                        <View style={s.goalStat}>
                                            <Money amount={remaining} currency={goal.currency} size="sm" align="center" containerStyle={s.goalMoney} />
                                            <Text style={s.goalStatLbl}>RESTANTE</Text>
                                        </View>
                                        <View style={s.goalStat}>
                                            <Text style={s.goalStatVal}>{daysLeft > 0 ? `${daysLeft}d` : "Vencida"}</Text>
                                            <Text style={s.goalStatLbl}>PLAZO</Text>
                                        </View>
                                        <View style={s.goalStat}>
                                            {monthly === null ? (
                                                <Text style={s.goalStatVal}>Meta vencida</Text>
                                            ) : (
                                                <Money amount={monthly} currency={goal.currency} size="sm" suffix="/mes" align="center" containerStyle={s.goalMoney} />
                                            )}
                                            <Text style={s.goalStatLbl}>NECESARIO</Text>
                                        </View>
                                    </View>

                                    {/* ABONO */}
                                    {abonoId === goal.id ? (
                                        <View>
                                            <View style={s.abonoRow}>
                                                <Text style={s.abonoCur}>{goal.currency}</Text>
                                                <TextInput
                                                    style={s.abonoInput}
                                                    value={abonoVal}
                                                    onChangeText={v => { setAbonoVal(v); setAbonoError(""); }}
                                                    placeholder="0.00"
                                                    placeholderTextColor={C.textMuted}
                                                    keyboardType="decimal-pad"
                                                    autoFocus
                                                />
                                                <TouchableOpacity style={[s.abonoBtn, { backgroundColor: goal.color }]} onPress={() => handleAbono(goal)}>
                                                    <Text style={s.abonoBtnTxt}>Abonar</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => { setAbonoId(null); setAbonoError(""); }}
                                                    style={s.abonoCancelBtn}
                                                    accessibilityRole="button"
                                                    accessibilityLabel="Cancelar abono"
                                                >
                                                    <GlassBackground radius={18} blur={false} />
                                                    <Ionicons name="close" size={18} color={C.textSub} />
                                                </TouchableOpacity>
                                            </View>
                                            {!!abonoError && <InlineNotice variant="error" text={abonoError} style={s.inlineNotice} />}
                                        </View>
                                    ) : (
                                        <View style={s.goalActions}>
                                            <TouchableOpacity style={[s.goalActionBtn, { borderColor: goal.color, backgroundColor: goal.color + "11" }]} onPress={() => { setAbonoId(goal.id); setAbonoVal(""); setAbonoError(""); }}>
                                                <Ionicons name="add-circle-outline" size={16} color={goal.color} />
                                                <Text style={[s.goalActionTxt, { color: goal.color }]}>Abonar</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={s.goalActionBtn} onPress={() => { setEditing(goal); setShowModal(true); }}>
                                                <Ionicons name="pencil-outline" size={16} color={C.textSub} />
                                                <Text style={s.goalActionTxt}>Editar</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity style={s.goalActionBtn} onPress={() => handleDelete(goal)}>
                                                <Ionicons name="trash-outline" size={16} color={C.danger} />
                                                <Text style={[s.goalActionTxt, { color: C.danger }]}>Eliminar</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                </GlassCard>
                            </View>
                        );
                    })}

                    {completed.length > 0 && (
                        <>
                            <View style={s.completedTitleRow}>
                                <Ionicons name="trophy-outline" size={14} color={C.textSub} />
                                <Text style={s.completedTitle}>METAS COMPLETADAS</Text>
                            </View>
                            {completed.map(goal => (
                                <View key={goal.id} style={[s.goalWrap, { opacity: 0.7 }]}>
                                    <GlassCard radius={18} blur={false} topAccentColor={C.income} contentStyle={s.goalContent}>
                                        <View style={[s.goalHeader, { marginBottom: 0 }]}>
                                            <View style={[s.goalIcon, { backgroundColor: C.income + "22", borderColor: C.income + "44" }]}>
                                                <Ionicons name="trophy-outline" size={22} color={C.income} />
                                            </View>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.goalName}>{goal.name}</Text>
                                                <Text style={[s.goalPct, { color: C.income }]}>¡Meta alcanzada!</Text>
                                            </View>
                                            <View style={s.goalAmounts}>
                                                <Money amount={goal.targetAmount} currency={goal.currency} size="md" tone="income" align="right" containerStyle={s.goalMoney} />
                                            </View>
                                        </View>
                                    </GlassCard>
                                </View>
                            ))}
                        </>
                    )}
                </View>

                <View style={{ height: 100 + kb }} />
            </ScrollView>

            <View ref={fabRef} collapsable={false} style={s.fabWrap}>
                <TouchableOpacity
                    style={s.fab}
                    onPress={() => { setEditing(undefined); setShowModal(true); }}
                    accessibilityRole="button"
                    accessibilityLabel="Agregar meta de ahorro"
                >
                    <Ionicons name="add" size={28} color={C.onPrimary} />
                </TouchableOpacity>
            </View>

            {showModal && (
                <SavingsGoalModal
                    existing={editing}
                    onSave={handleSave}
                    onClose={() => { setShowModal(false); setEditing(undefined); }}
                    defaultCurrency={settings.currency || "Q"}
                />
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN 4 — INGRESOS (fuentes de ingreso)
// ─────────────────────────────────────────────────────────────
const TONE_COLOR: Record<StatusTone, string> = {
    success: C.success,
    info: C.primaryLight,
    danger: C.danger,
    muted: C.textSub,
};

function IncomeTab({
    transactions, settings, autoCreate, onAutoCreateHandled, onSourcesChanged,
}: {
    transactions: Transaction[];
    settings: UserSettings;
    /** Cambia (n distinto de 0) cuando otra pantalla pide abrir el formulario de una fuente nueva. */
    autoCreate: number;
    onAutoCreateHandled: () => void;
    onSourcesChanged?: (list: IncomeSource[]) => void;
}) {
    const [sources, setSources] = useState<IncomeSource[]>([]);
    const [accounts, setAccounts] = useState<Account[]>([]);
    const [showModal, setShowModal] = useState(false);
    const [editing, setEditing] = useState<IncomeSource | undefined>();
    const [updating, setUpdating] = useState(false);
    const [notice, setNotice] = useState<{ variant: "success" | "error"; text: string } | null>(null);
    const tutScroll = useTutorialScroll('budget_income');
    const listRef = useTutorialRef('budget_income_list');
    const fabRef = useTutorialRef('budget_income_fab');

    useEffect(() => {
        let cancelled = false;
        Promise.all([StorageService.getIncomeSources(), StorageService.getAccounts()])
            .then(([list, accs]) => { if (!cancelled) { setSources(list); setAccounts(accs); } })
            .catch(e => console.warn("[Ingresos] carga:", e));
        return () => { cancelled = true; };
    }, []);

    useEffect(() => {
        if (!autoCreate) return;
        setEditing(undefined);
        setShowModal(true);
        onAutoCreateHandled();
    }, [autoCreate]);

    const rules = sanitizePayRules(settings.payRules);
    const items = buildIncomeList(sources, transactions, new Date(), rules);
    const baseIncome = baseMonthlyIncome(sources, transactions, settings.exchangeRate);
    const activeCount = sources.filter(x => x.isActive).length;
    const suggestion = incomeDeltaSuggestion(settings, sources, transactions);

    const handleSaved = (list: IncomeSource[]) => {
        setSources(list);
        onSourcesChanged?.(list);
    };

    const applySuggestion = async () => {
        if (!suggestion || updating) return;
        setUpdating(true);
        setNotice(null);
        try {
            const fresh = await StorageService.getSettings();
            const next: UserSettings = {
                ...fresh,
                monthlyIncome: suggestion.suggested,
                // Solo se toca el equivalente en dólares si ya estaba declarado (el onboarding lo deja en 0 para quien gana en Q).
                ...(fresh.monthlyIncomeUSD > 0 && fresh.exchangeRate > 0
                    ? { monthlyIncomeUSD: Math.round((suggestion.suggested / fresh.exchangeRate) * 100) / 100 }
                    : {}),
            };
            await StorageService.saveSettings(next);
            setNotice({ variant: "success", text: `Listo: tu ingreso declarado ahora es ${formatMoney(suggestion.suggested, "Q")}.` });
        } catch (e) {
            console.warn("[Ingresos] actualizar declarado:", e);
            setNotice({ variant: "error", text: "No se pudo actualizar tu ingreso. Probá de nuevo." });
        } finally {
            setUpdating(false);
        }
    };

    return (
        <View style={{ flex: 1 }}>
            <ScrollView {...tutScroll} showsVerticalScrollIndicator={false}>
                <GlassCard radius={16} blur={false} style={s.summaryCard} contentStyle={s.incSummary}>
                    <Text style={s.incKicker}>INGRESO BASE DEL PERÍODO</Text>
                    <Money amount={baseIncome} currency="Q" size="lg" tone="income" align="left" containerStyle={s.incSummaryMoney} />
                    <Text style={s.incSummaryHint}>
                        {activeCount === 0
                            ? "Se calcula con lo que de verdad te pagan tus fuentes base. Todavía no hay ninguna."
                            : "Lo que de verdad te pagan tus fuentes base en un mes. Los extras (aguinaldo, bono 14) no cuentan."}
                    </Text>
                </GlassCard>

                {!!suggestion && (
                    <InlineNotice
                        variant="info"
                        icon="trending-up-outline"
                        text={suggestionText(suggestion)}
                        actionLabel={updating ? "Guardando…" : "Actualizar"}
                        onAction={() => { void applySuggestion(); }}
                        style={s.incNotice}
                    />
                )}
                {!!notice && <InlineNotice variant={notice.variant} text={notice.text} style={s.incNotice} />}

                <View ref={listRef} collapsable={false} style={{ marginTop: 6 }}>
                    {items.length === 0 ? (
                        <View style={s.empty}>
                            <Ionicons name="cash-outline" size={48} color={C.textMuted} />
                            <Text style={s.emptyTitle}>Sin fuentes de ingreso</Text>
                            <Text style={s.emptyDesc}>Todavía no tenés fuentes de ingreso. Creá la primera con el botón + y enseñale a la app de dónde y cuándo te pagan.</Text>
                        </View>
                    ) : (
                        items.map(({ source, status, view, schedule }) => {
                            const color = TONE_COLOR[view.tone];
                            const shown = status.amount ?? source.amount;
                            return (
                                <TouchableOpacity
                                    key={source.id}
                                    activeOpacity={0.8}
                                    onPress={() => { setEditing(source); setShowModal(true); }}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Editar ${source.name}. ${view.label}`}
                                >
                                    <GlassCard
                                        radius={16}
                                        blur={false}
                                        leftAccentColor={color}
                                        style={[s.incCard, !source.isActive && { opacity: 0.6 }]}
                                        contentStyle={s.incContent}
                                    >
                                        <View style={{ flex: 1, flexShrink: 1 }}>
                                            <View style={s.incTitleRow}>
                                                <Text style={s.incName} numberOfLines={2}>{source.name}</Text>
                                                <View style={[s.incChip, { borderColor: color + "66", backgroundColor: color + "22" }]}>
                                                    <Text style={[s.incChipTxt, { color }]}>{view.label.toUpperCase()}</Text>
                                                </View>
                                                {source.role === "extra" && (
                                                    <View style={s.autoBadge}><Text style={s.autoTxt}>EXTRA</Text></View>
                                                )}
                                            </View>
                                            <Text style={s.incSched}>{schedule}</Text>
                                            <Text style={s.incDetail}>{view.detail}</Text>
                                            {!source.pattern && (
                                                <Text style={s.incNoPattern}>Sin SMS de ejemplo: no se detecta sola</Text>
                                            )}
                                        </View>
                                        <View style={s.incAmt}>
                                            <Money
                                                amount={shown}
                                                currency={source.currency}
                                                size="sm"
                                                tone="income"
                                                gradient={false}
                                                align="right"
                                                containerStyle={s.incMoney}
                                            />
                                        </View>
                                    </GlassCard>
                                </TouchableOpacity>
                            );
                        })
                    )}
                </View>
                <View style={{ height: 100 }} />
            </ScrollView>

            <View ref={fabRef} collapsable={false} style={s.fabWrap}>
                <TouchableOpacity
                    style={s.fab}
                    onPress={() => { setEditing(undefined); setShowModal(true); }}
                    accessibilityRole="button"
                    accessibilityLabel="Agregar fuente de ingreso"
                >
                    <Ionicons name="add" size={28} color={C.onPrimary} />
                </TouchableOpacity>
            </View>

            {showModal && (
                <IncomeSourceModal
                    existing={editing}
                    settings={settings}
                    accounts={accounts}
                    onSaved={handleSaved}
                    onClose={() => { setShowModal(false); setEditing(undefined); }}
                />
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
export interface BudgetRequest { tab: number; openIncome?: boolean; n: number }

interface Props {
    transactions: Transaction[];
    setTransactions: (t: Transaction[]) => void;
    settings: UserSettings;
    fixedExpenses: FixedExpense[];
    setFixedExpenses: (e: FixedExpense[]) => void;
    categoryBudgets: CategoryBudget[];
    setCategoryBudgets: (b: CategoryBudget[]) => void;
    savingsGoals: SavingsGoal[];
    setSavingsGoals: (g: SavingsGoal[]) => void;
    onRefresh?: () => void;
    /** Pedido de otra pantalla: abrir una pestaña (3 = Ingresos) y, si se indica, el formulario de una fuente nueva. */
    request?: BudgetRequest | null;
    onRequestHandled?: () => void;
    /** Avisa a la app cuando cambia la lista de fuentes de ingreso (alta, edición o baja). */
    onIncomeSourcesChanged?: (list: IncomeSource[]) => void;
}

export default function BudgetScreen({
    transactions, setTransactions, settings,
    fixedExpenses, setFixedExpenses,
    categoryBudgets, setCategoryBudgets,
    savingsGoals, setSavingsGoals,
    onRefresh, request, onRequestHandled, onIncomeSourcesChanged,
}: Props) {
    const [activeTab, setActiveTab] = useState(request ? request.tab : 0);
    const [incomeAutoCreate, setIncomeAutoCreate] = useState(0);
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const headerRef = useTutorialRef('budget_header');

    const handleTabChange = useCallback((i: number) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
        setTimeout(() => setActiveTab(i), 120);
    }, []);

    // Otra pantalla (Ajustes, «Crearlo ahora» del tutorial) pide ir directo a una pestaña.
    useEffect(() => {
        if (!request) return;
        setActiveTab(request.tab);
        if (request.openIncome) setIncomeAutoCreate(request.n);
        onRequestHandled?.();
    }, [request]);

    // Permite que el tutorial cambie de pestaña interna
    useTutorialAction('budget:setTab', arg => {
        const i = Number(arg);
        if (i >= 0 && i < TAB_LABELS.length && i !== activeTab) handleTabChange(i);
    });

    return (
        <View style={s.screen}>
            <ScreenHeader
                title="Presupuesto"
                subtitle="Planificá · Controlá · Crecé"
                right={<HelpButton tutorialId="tutorial_presupuesto" />}
                headerRef={headerRef}
            />

            <InternalTabs active={activeTab} onChange={handleTabChange} />

            <Animated.View style={{ flex: 1, opacity: fadeAnim }}>
                {activeTab === 0 && (
                    <FixedExpensesTab
                        fixedExpenses={fixedExpenses}
                        setFixedExpenses={setFixedExpenses}
                        transactions={transactions}
                        setTransactions={setTransactions}
                        settings={settings}
                        onRefresh={onRefresh}
                    />
                )}
                {activeTab === 1 && (
                    <CategoryBudgetTab
                        categoryBudgets={categoryBudgets}
                        setCategoryBudgets={setCategoryBudgets}
                        transactions={transactions}
                        settings={settings}
                        fixedExpenses={fixedExpenses}
                    />
                )}
                {activeTab === 2 && (
                    <SavingsGoalsTab
                        savingsGoals={savingsGoals}
                        setSavingsGoals={setSavingsGoals}
                        settings={settings}
                    />
                )}
                {activeTab === 3 && (
                    <IncomeTab
                        transactions={transactions}
                        settings={settings}
                        autoCreate={incomeAutoCreate}
                        onAutoCreateHandled={() => setIncomeAutoCreate(0)}
                        onSourcesChanged={onIncomeSourcesChanged}
                    />
                )}
            </Animated.View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16 },
    sectionTitle: { color: C.textSub, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 10 },
    sectionHint: { color: C.textSub, fontSize: 12, marginBottom: 12 },
    barLabel: { color: C.textSub, fontSize: 11, marginTop: 6, marginBottom: 4 },
    inlineNotice: { marginTop: 10 },

    // Resumen
    summaryCard: { marginBottom: 14 },
    summaryContent: { flexDirection: "row", padding: 16 },
    summaryItem: { flex: 1, alignItems: "center", paddingHorizontal: 2 },
    summaryMoney: { alignSelf: "stretch", marginBottom: 4 },
    summaryVal: { color: C.textPrimary, fontSize: 16, fontWeight: "900", marginBottom: 4 },
    summaryLbl: { color: C.textSub, fontSize: 10, fontWeight: "700", letterSpacing: 1 },
    summaryDivider: { width: 1, backgroundColor: C.glassBorder, marginHorizontal: 8 },

    // Gastos fijos
    fixedCard: { marginBottom: 10 },
    fixedCardPaid: { opacity: 0.7 },
    fixedRow: { flexDirection: "row", alignItems: "center", padding: 14 },
    fixedMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, marginTop: 3 },
    checkbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: C.textSub, alignItems: "center", justifyContent: "center", marginRight: 12 },
    checkboxPaid: { backgroundColor: C.income, borderColor: C.income },
    fixedIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 12 },
    fixedName: { color: C.text, fontSize: 15, fontWeight: "700" },
    fixedDay: { color: C.textSub, fontSize: 11 },
    overdueBadge: { backgroundColor: C.danger + "22", paddingHorizontal: 6, borderRadius: 4 },
    overdueTxt: { color: C.danger, fontSize: 9, fontWeight: "900" },
    autoBadge: { backgroundColor: C.accent + "22", paddingHorizontal: 6, borderRadius: 4 },
    autoTxt: { color: C.accent, fontSize: 9, fontWeight: "900" },
    deleteBtn: { padding: 6, borderRadius: 8, backgroundColor: C.danger + "11" },

    // Categorías
    catBudgetCard: { marginBottom: 12 },
    catBudgetContent: { padding: 14 },
    catBudgetHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    catIcon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 10 },
    catName: { color: C.text, fontSize: 14, fontWeight: "700" },
    catStatus: { fontSize: 11, marginTop: 2 },
    catLimit: { color: C.textSub, fontSize: 11 },
    catMainTap: { flex: 1, flexDirection: "row", alignItems: "center" },
    catFooter: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 6, marginTop: 4 },
    viewMore: { flexDirection: "row", alignItems: "center", gap: 2 },
    viewMoreTxt: { color: C.textSub, fontSize: 11, fontWeight: "700" },
    fxLine: { color: C.fx, fontSize: 12, fontWeight: "700", marginBottom: 8 },
    fxLineRight: { marginTop: 2, marginBottom: 0, textAlign: "right" },
    fxSummary: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: -6, marginBottom: 14, paddingHorizontal: 4 },
    uncoveredCard: { marginBottom: 8 },
    uncoveredContent: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 10 },
    uncoveredAmounts: { alignItems: "flex-end", flexShrink: 0, maxWidth: "45%" },
    pctLabel: { color: C.textSub, fontSize: 10 },
    catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    catChipActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    catChipTxt: { color: C.textSub, fontSize: 12, fontWeight: "700" },
    limitInputContent: { padding: 16 },
    limitInputLabel: { color: C.textPrimary, fontSize: 14, fontWeight: "700", marginBottom: 10 },
    limitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    limitCur: { color: C.textSub, fontSize: 16, fontWeight: "700" },
    limitInput: { flex: 1, backgroundColor: C.glassInput, borderRadius: 10, borderWidth: 1, borderColor: C.glassInputBorder, padding: 10, color: C.text, fontSize: 16, fontWeight: "700" },
    limitSaveBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
    limitCancelBtn: { width: 40, height: 40, borderRadius: 20, overflow: "hidden", alignItems: "center", justifyContent: "center" },

    // Metas
    goalWrap: { marginBottom: 14 },
    goalContent: { padding: 16 },
    goalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    goalIcon: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 12 },
    goalName: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
    goalPct: { fontSize: 12, fontWeight: "700", marginTop: 2 },
    goalAmounts: { width: "42%", alignItems: "stretch" },
    goalMoney: { alignSelf: "stretch" },
    goalTarget: { color: C.textSub, fontSize: 11, marginTop: 2, textAlign: "right" },
    goalStats: { flexDirection: "row", marginTop: 10, marginBottom: 12 },
    goalStat: { flex: 1, alignItems: "center" },
    goalStatVal: { color: C.textPrimary, fontSize: 13, fontWeight: "800", textAlign: "center" },
    goalStatLbl: { color: C.textSub, fontSize: 10, letterSpacing: 1, marginTop: 2 },
    goalActions: { flexDirection: "row", gap: 8 },
    goalActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    goalActionTxt: { color: C.textSub, fontSize: 12, fontWeight: "700" },
    abonoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    abonoCur: { color: C.textSub, fontSize: 16, fontWeight: "700" },
    abonoInput: { flex: 1, backgroundColor: C.glassInput, borderRadius: 10, borderWidth: 1, borderColor: C.glassInputBorder, padding: 10, color: C.text, fontSize: 16, fontWeight: "700" },
    abonoBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
    abonoBtnTxt: { color: C.onPrimary, fontSize: 13, fontWeight: "800" },
    abonoCancelBtn: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    completedTitleRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 16, marginBottom: 10 },
    completedTitle: { color: C.textSub, fontSize: 11, fontWeight: "800", letterSpacing: 1.5 },

    // Ingresos
    incSummary: { padding: 16 },
    incKicker: { color: C.textSub, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
    incSummaryMoney: { alignSelf: "stretch", marginTop: 6 },
    incSummaryHint: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 6 },
    incNotice: { marginBottom: 12 },
    incCard: { marginBottom: 10 },
    incContent: { flexDirection: "row", alignItems: "flex-start", gap: 10, padding: 14 },
    incTitleRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8 },
    incName: { color: C.text, fontSize: 15, fontWeight: "800", flexShrink: 1 },
    incChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
    incChipTxt: { fontSize: 10, fontWeight: "900", letterSpacing: 0.5 },
    incSched: { color: C.textSub, fontSize: 12, marginTop: 4 },
    incDetail: { color: C.text, fontSize: 12, fontWeight: "600", marginTop: 2 },
    incNoPattern: { color: C.warning, fontSize: 11, marginTop: 4 },
    incAmt: { width: "34%", alignItems: "stretch" },
    incMoney: { alignSelf: "stretch" },

    // Shared
    empty: { alignItems: "center", paddingTop: 60, gap: 12 },
    emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "800" },
    emptyDesc: { color: C.textSub, fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: 20 },
    fabWrap: { position: "absolute", bottom: 20, right: 0, width: 58, height: 58, borderRadius: 29, ...shadow(C.primaryGlow, 12, 0.6) },
    fab: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.primaryLight },
});

// ESTILOS MODALES (contenido de los GlassSheet)
const md = StyleSheet.create({
    footer: { paddingTop: 12 },
    notice: { marginBottom: 10 },
    dateField: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, overflow: "hidden" },
    dateTxt: { flex: 1, color: C.text, fontSize: 15, fontWeight: "700" },
    iosPickerWrap: { marginTop: 8 },
    iosPickerDone: { alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 8 },
    iosPickerDoneTxt: { color: C.primaryLight, fontWeight: "800" },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },
    hint: { color: C.textSub, fontSize: 12, marginTop: 4, lineHeight: 17 },
    paidSubtitle: { color: C.textSub, fontSize: 15, fontWeight: "600", lineHeight: 21 },
    input: { backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, padding: 14, color: C.text, fontSize: 15 },
    row: { flexDirection: "row", alignItems: "flex-start" },
    amtRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, paddingHorizontal: 14, paddingVertical: 10 },
    amtInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: "700" },
    cur: { color: C.textSub, fontSize: 16, fontWeight: "700", marginRight: 8 },
    miniBtn: { paddingVertical: 10, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    miniBtnActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    miniTxt: { color: C.textSub, fontSize: 13, fontWeight: "800" },
    preview: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 8, gap: 14 },
    previewIcon: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    previewName: { fontSize: 18, fontWeight: "800" },
    colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
    colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    colorDotActive: { borderWidth: 3, borderColor: C.textPrimary },
    iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
});
