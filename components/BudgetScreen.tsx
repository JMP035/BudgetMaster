import { Ionicons } from "@expo/vector-icons";
import DateTimePicker from "@react-native-community/datetimepicker";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated, Easing, LayoutChangeEvent,
    Platform, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View
} from "react-native";
import {
    CategoryBudget, CustomCategory, Currency, FixedExpense, SavingsGoal,
    StorageService, Transaction, UserSettings,
    formatDateOnly, getCurrentFinancialPeriod, getDaysUntilNextPayment, isFixedExpenseOverdue,
    parseAmount, parseDateOnly, storedDateToDateOnly
} from "../services/storage";
import { getAllExpenseCategories, getCat } from "../categories";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "../categories";
import { C, shadow } from "../theme";
import { useTutorialAction, useTutorialRef, useTutorialScroll } from "../context/TutorialContext";
import { NotificationService } from "../services/NotificationService";
import { GlassBackground, GlassCard } from "./GlassCard";
import { GlassButton } from "./GlassButton";
import { GlassSheet } from "./GlassSheet";
import { useGlassDialog } from "./GlassDialogProvider";
import { HelpButton } from "./HelpButton";
import { InlineNotice } from "./InlineNotice";
import { ScreenHeader } from "./ScreenHeader";
import { useKeyboardHeight } from "./useKeyboardHeight";

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
const TAB_LABELS = ["Gastos Fijos", "Categorías", "Metas"];

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
    const segW = width > 0 ? (width - PAD * 2) / 3 : 0;
    const translateX = indicatorX.interpolate({
        inputRange: [0, 1, 2],
        outputRange: [0, segW, segW * 2],
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
// MODAL — NUEVO GASTO FIJO
// ─────────────────────────────────────────────────────────────
function FixedExpenseModal({ onSave, onClose, existing, customCategories, defaultCurrency }: {
    onSave: (e: FixedExpense) => void;
    onClose: () => void;
    existing?: FixedExpense;
    customCategories?: CustomCategory[];
    defaultCurrency: Currency;
}) {
    const allCats = getAllExpenseCategories(customCategories);
    const [name, setName] = useState(existing?.name || "");
    const [amount, setAmount] = useState(existing?.amount.toString() || "");
    const [currency, setCurrency] = useState<Currency>(existing?.currency || defaultCurrency || "Q");
    const [category, setCategory] = useState(existing?.category || "other");
    const [day, setDay] = useState(existing?.dayOfMonth.toString() || "1");
    const [autoRecord, setAutoRecord] = useState(existing?.autoRecord ?? true);
    const [notes, setNotes] = useState(existing?.notes || "");
    const [error, setError] = useState("");
    const currencyOptions = FORM_CURRENCIES.includes(currency) ? FORM_CURRENCIES : [...FORM_CURRENCIES, currency];

    const handleSave = () => {
        if (!name.trim()) { setError("Ingresa el nombre del gasto."); return; }
        const amt = parseAmount(amount);
        if (isNaN(amt) || amt <= 0) { setError("Ingresa un monto válido."); return; }
        const dayNum = parseInt(day);
        if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) { setError("Día inválido (1-31)."); return; }

        const expense: FixedExpense = {
            id: existing?.id || `fe_${Date.now()}`,
            name: name.trim(),
            amount: amt,
            currency,
            category,
            dayOfMonth: dayNum,
            isPaid: existing?.isPaid || false,
            paidDate: existing?.paidDate,
            lastTxId: existing?.lastTxId,
            autoRecord,
            notes: notes.trim(),
            isActive: true,
        };
        onSave(expense);
        onClose();
    };

    return (
        <GlassSheet
            onClose={onClose}
            title={`${existing ? "Editar" : "Nuevo"} Gasto Fijo`}
            icon="calendar-outline"
            footer={
                <View style={md.footer}>
                    {!!error && <InlineNotice variant="error" text={error} style={md.notice} />}
                    <GlassButton label="Guardar Gasto Fijo" icon="save-outline" onPress={handleSave} />
                </View>
            }
        >
            <Text style={md.lbl}>NOMBRE</Text>
            <TextInput style={md.input} value={name} onChangeText={v => { setName(v); setError(""); }} placeholder="Ej: Renta, Internet, Gym..." placeholderTextColor={C.textMuted} autoFocus />

            <View style={md.row}>
                <View style={{ flex: 2, marginRight: 8 }}>
                    <Text style={md.lbl}>MONTO</Text>
                    <View style={md.amtRow}>
                        <Text style={md.cur}>{currency}</Text>
                        <TextInput style={md.amtInput} value={amount} onChangeText={v => { setAmount(v); setError(""); }} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
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

            <Text style={md.lbl}>DÍA DEL MES QUE VENCE</Text>
            <TextInput style={md.input} value={day} onChangeText={v => { setDay(v); setError(""); }} placeholder="1-31" placeholderTextColor={C.textMuted} keyboardType="numeric" />
            <Text style={md.hint}>El día del mes en que debes pagar este gasto. Ej: 1, 15, 30.</Text>

            <Text style={md.lbl}>CATEGORÍA</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: "row", gap: 8 }}>
                    {allCats.map(cat => (
                        <TouchableOpacity key={cat.id} style={[md.catChip, category === cat.id && md.catChipActive]} onPress={() => setCategory(cat.id)}>
                            <Ionicons name={cat.icon} size={16} color={category === cat.id ? cat.color : C.textSub} />
                            <Text style={[md.catChipTxt, category === cat.id && { color: C.primaryLight }]}>{cat.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </ScrollView>

            <View style={md.switchRow}>
                <View style={{ flex: 1 }}>
                    <Text style={md.lbl}>REGISTRAR AUTOMÁTICAMENTE</Text>
                    <Text style={md.hint}>Al marcarlo como pagado, se crea una transacción automáticamente.</Text>
                </View>
                <TouchableOpacity
                    style={[md.toggle, autoRecord && md.toggleActive]}
                    onPress={() => setAutoRecord(!autoRecord)}
                    accessibilityRole="switch"
                    accessibilityState={{ checked: autoRecord }}
                >
                    <Text style={{ color: autoRecord ? C.onPrimary : C.textSub, fontSize: 11, fontWeight: "800" }}>
                        {autoRecord ? "SÍ" : "NO"}
                    </Text>
                </TouchableOpacity>
            </View>

            <Text style={md.lbl}>NOTAS (Opcional)</Text>
            <TextInput style={md.input} value={notes} onChangeText={setNotes} placeholder="Ej: Tarjeta BAC cuota mínima..." placeholderTextColor={C.textMuted} />
            <View style={{ height: 16 }} />
        </GlassSheet>
    );
}

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
                    <Text style={md.previewAmt}>{currency} {target || "0.00"}</Text>
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
    const dialog = useGlassDialog();
    const tutScroll = useTutorialScroll('budget_fixed');
    const summaryRef = useTutorialRef('budget_fixed_summary');
    const listRef = useTutorialRef('budget_fixed_list');
    const fabRef = useTutorialRef('budget_fixed_fab');

    const active = fixedExpenses.filter(e => e.isActive);
    const paid = active.filter(e => e.isPaid).length;
    const totalQ = active.filter(e => e.currency === 'Q').reduce((s, e) => s + e.amount, 0);
    const paidQ = active.filter(e => e.isPaid && e.currency === 'Q').reduce((s, e) => s + e.amount, 0);

    const handleTogglePaid = async (expense: FixedExpense) => {
        const willBePaid = !expense.isPaid;
        let lastTxId = expense.lastTxId;

        if (!willBePaid) {
            // Al desmarcar: revertir la transacción auto-generada (si existe) ANTES de actualizar el gasto fijo
            if (expense.lastTxId) {
                const txAll = await StorageService.deleteTransaction(expense.lastTxId);
                setTransactions(txAll);
            }
            lastTxId = undefined;
        } else if (expense.autoRecord) {
            // Al marcar como pagado con auto-registro: usar id determinístico y reversible
            const tx: Transaction = {
                id: `fe_tx_${expense.id}`,
                amount: expense.amount,
                description: expense.name,
                category: expense.category,
                date: new Date().toISOString(),
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
            isPaid: willBePaid,
            paidDate: willBePaid ? new Date().toISOString() : undefined,
            lastTxId,
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
                            <Text style={[s.summaryVal, { color: C.income }]}>Q {paidQ.toFixed(0)}</Text>
                            <Text style={s.summaryLbl}>CUBIERTO</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryItem}>
                            <Text style={[s.summaryVal, { color: C.warning }]}>Q {(totalQ - paidQ).toFixed(0)}</Text>
                            <Text style={s.summaryLbl}>PENDIENTE</Text>
                        </View>
                        <View style={s.summaryDivider} />
                        <View style={s.summaryItem}>
                            <Text style={[s.summaryVal, { color: daysLeft <= 5 ? C.danger : C.accent }]}>{daysLeft}d</Text>
                            <Text style={s.summaryLbl}>PRÓX. PAGO</Text>
                        </View>
                    </GlassCard>

                    <AnimatedBar pct={active.length > 0 ? (paid / active.length) * 100 : 0} color={C.income} height={6} />
                    <Text style={s.barLabel}>{Math.round(active.length > 0 ? (paid / active.length) * 100 : 0)}% de gastos fijos cubiertos este mes</Text>
                </View>

                <View ref={listRef} collapsable={false} style={{ marginTop: 16 }}>
                    {active.length === 0 ? (
                        <View style={s.empty}>
                            <Ionicons name="calendar-outline" size={48} color={C.textMuted} />
                            <Text style={s.emptyTitle}>Sin gastos fijos</Text>
                            <Text style={s.emptyDesc}>Agrega tus compromisos mensuales: renta, internet, tarjetas, etc.</Text>
                        </View>
                    ) : (
                        [...active]
                            .sort((a, b) => a.dayOfMonth - b.dayOfMonth)
                            .map(expense => {
                                const cat = getCat(expense.category, settings.customCategories);
                                const isOverdue = isFixedExpenseOverdue(expense);
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
                                                    <Text style={s.fixedDay}>Día {expense.dayOfMonth}</Text>
                                                    {isOverdue && <View style={s.overdueBadge}><Text style={s.overdueTxt}>VENCIDO</Text></View>}
                                                    {expense.autoRecord && <View style={s.autoBadge}><Text style={s.autoTxt}>AUTO</Text></View>}
                                                </View>
                                            </View>

                                            <View style={{ alignItems: "flex-end" }}>
                                                <Text style={[s.fixedAmount, { color: expense.isPaid ? C.income : C.expense }]}>
                                                    {expense.currency} {expense.amount.toFixed(2)}
                                                </Text>
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

            {showModal && (
                <FixedExpenseModal
                    existing={editing}
                    onSave={handleSave}
                    onClose={() => { setShowModal(false); setEditing(undefined); }}
                    customCategories={settings.customCategories}
                    defaultCurrency={settings.currency || "Q"}
                />
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN 2 — PRESUPUESTO POR CATEGORÍA
// ─────────────────────────────────────────────────────────────
function CategoryBudgetTab({
    categoryBudgets, setCategoryBudgets, transactions, settings
}: {
    categoryBudgets: CategoryBudget[];
    setCategoryBudgets: (b: CategoryBudget[]) => void;
    transactions: Transaction[];
    settings: UserSettings;
}) {
    const [editing, setEditing] = useState<string | null>(null);
    const [limitVal, setLimitVal] = useState("");
    const [limitError, setLimitError] = useState("");
    const kb = useKeyboardHeight();
    const scrollRef = useRef<ScrollView>(null);
    const tutScroll = useTutorialScroll('budget_categories', scrollRef);
    const summaryRef = useTutorialRef('budget_cat_summary');
    const gridRef = useTutorialRef('budget_cat_grid');
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

    return (
        <ScrollView {...tutScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* RESUMEN TOTAL */}
            <View ref={summaryRef} collapsable={false}>
                <GlassCard radius={16} blur={false} style={s.summaryCard} contentStyle={s.summaryContent}>
                    <View style={s.summaryItem}>
                        <Text style={s.summaryVal}>Q {totalBudgeted.toFixed(0)}</Text>
                        <Text style={s.summaryLbl}>PLANIFICADO</Text>
                    </View>
                    <View style={s.summaryDivider} />
                    <View style={s.summaryItem}>
                        <Text style={[s.summaryVal, { color: C.expense }]}>Q {totalSpent.toFixed(0)}</Text>
                        <Text style={s.summaryLbl}>GASTADO</Text>
                    </View>
                    <View style={s.summaryDivider} />
                    <View style={s.summaryItem}>
                        <Text style={[s.summaryVal, { color: totalBudgeted - totalSpent >= 0 ? C.income : C.danger }]}>
                            Q {Math.abs(totalBudgeted - totalSpent).toFixed(0)}
                        </Text>
                        <Text style={s.summaryLbl}>{totalBudgeted - totalSpent >= 0 ? "DISPONIBLE" : "EXCESO"}</Text>
                    </View>
                </GlassCard>
            </View>

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

                return (
                    <GlassCard key={cb.categoryId} radius={16} blur={false} style={s.catBudgetCard} contentStyle={s.catBudgetContent}>
                        <View style={s.catBudgetHeader}>
                            <View style={[s.catIcon, { backgroundColor: cat.color + "22", borderColor: cat.color + "44" }]}>
                                <Ionicons name={cat.icon} size={18} color={cat.color} />
                            </View>
                            <View style={{ flex: 1 }}>
                                <Text style={s.catName}>{cat.label}</Text>
                                <Text style={[s.catStatus, { color: barColor }]}>
                                    {over ? `Excedido Q${(spent - cb.limit).toFixed(2)}` : `Q${(cb.limit - spent).toFixed(2)} disponibles`}
                                </Text>
                            </View>
                            <View style={{ alignItems: "flex-end" }}>
                                <Text style={s.catSpent}>Q {spent.toFixed(2)}</Text>
                                <Text style={s.catLimit}>de Q {cb.limit.toFixed(2)}</Text>
                            </View>
                            <TouchableOpacity
                                onPress={() => handleDelete(cb.categoryId)}
                                style={[s.deleteBtn, { marginLeft: 8 }]}
                                accessibilityRole="button"
                                accessibilityLabel={`Quitar presupuesto de ${cat.label}`}
                            >
                                <Ionicons name="trash-outline" size={14} color={C.danger} />
                            </TouchableOpacity>
                        </View>
                        <AnimatedBar pct={pct} color={barColor} height={8} />
                        <Text style={s.pctLabel}>{Math.round(pct)}%</Text>
                    </GlassCard>
                );
            })}

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
                        const monthly = daysLeft > 0 ? (remaining / Math.max(daysLeft / 30, 0.1)).toFixed(2) : "Meta vencida";

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
                                        <View style={{ alignItems: "flex-end" }}>
                                            <Text style={s.goalCurrent}>{goal.currency} {goal.currentAmount.toFixed(2)}</Text>
                                            <Text style={s.goalTarget}>de {goal.currency} {goal.targetAmount.toFixed(2)}</Text>
                                        </View>
                                    </View>

                                    <AnimatedBar pct={pct} color={goal.color} height={10} />

                                    <View style={s.goalStats}>
                                        <View style={s.goalStat}>
                                            <Text style={s.goalStatVal}>{goal.currency} {remaining.toFixed(2)}</Text>
                                            <Text style={s.goalStatLbl}>RESTANTE</Text>
                                        </View>
                                        <View style={s.goalStat}>
                                            <Text style={s.goalStatVal}>{daysLeft > 0 ? `${daysLeft}d` : "Vencida"}</Text>
                                            <Text style={s.goalStatLbl}>PLAZO</Text>
                                        </View>
                                        <View style={s.goalStat}>
                                            <Text style={s.goalStatVal}>{goal.currency} {monthly}/mes</Text>
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
                                            <Text style={[s.goalCurrent, { color: C.income }]}>{goal.currency} {goal.targetAmount.toFixed(2)}</Text>
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
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
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
}

export default function BudgetScreen({
    transactions, setTransactions, settings,
    fixedExpenses, setFixedExpenses,
    categoryBudgets, setCategoryBudgets,
    savingsGoals, setSavingsGoals,
    onRefresh,
}: Props) {
    const [activeTab, setActiveTab] = useState(0);
    const fadeAnim = useRef(new Animated.Value(1)).current;
    const headerRef = useTutorialRef('budget_header');

    const handleTabChange = useCallback((i: number) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
        setTimeout(() => setActiveTab(i), 120);
    }, []);

    // Permite que el tutorial cambie de pestaña interna
    useTutorialAction('budget:setTab', arg => {
        const i = Number(arg);
        if (i >= 0 && i <= 2 && i !== activeTab) handleTabChange(i);
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
                    />
                )}
                {activeTab === 2 && (
                    <SavingsGoalsTab
                        savingsGoals={savingsGoals}
                        setSavingsGoals={setSavingsGoals}
                        settings={settings}
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
    summaryItem: { flex: 1, alignItems: "center" },
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
    fixedAmount: { fontSize: 15, fontWeight: "800" },
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
    catSpent: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
    catLimit: { color: C.textSub, fontSize: 11 },
    pctLabel: { color: C.textSub, fontSize: 10, marginTop: 4, textAlign: "right" },
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
    goalCurrent: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
    goalTarget: { color: C.textSub, fontSize: 11, marginTop: 2 },
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
    input: { backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, padding: 14, color: C.text, fontSize: 15 },
    row: { flexDirection: "row", alignItems: "flex-start" },
    amtRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, paddingHorizontal: 14, paddingVertical: 10 },
    amtInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: "700" },
    cur: { color: C.textSub, fontSize: 16, fontWeight: "700", marginRight: 8 },
    miniBtn: { paddingVertical: 10, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    miniBtnActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    miniTxt: { color: C.textSub, fontSize: 13, fontWeight: "800" },
    catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    catChipActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    catChipTxt: { color: C.textSub, fontSize: 11, fontWeight: "700" },
    switchRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
    toggle: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput, marginLeft: 12 },
    toggleActive: { backgroundColor: C.primary, borderColor: C.primaryLight },
    preview: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 8, gap: 14 },
    previewIcon: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    previewName: { fontSize: 18, fontWeight: "800" },
    previewAmt: { color: C.textSub, fontSize: 14, marginTop: 2 },
    colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
    colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    colorDotActive: { borderWidth: 3, borderColor: C.textPrimary },
    iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
});
