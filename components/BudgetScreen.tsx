import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useRef, useState } from "react";
import {
    Alert, Animated, Easing, KeyboardAvoidingView, Modal,
    Platform, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View
} from "react-native";
import {
    CategoryBudget, Currency, FixedExpense, SavingsGoal,
    StorageService, Transaction, UserSettings,
    getDaysUntilNextPayment
} from "../services/storage";
import { EXPENSE_CATEGORIES, getAllExpenseCategories, getCat } from "../categories";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "../categories";
import { C, shadow } from "../theme";

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
    track: { backgroundColor: C.bgDeep, borderRadius: 6, overflow: "hidden", borderWidth: 1, borderColor: C.cardBorder },
    fill: { borderRadius: 6, position: "relative" },
    glow: { position: "absolute", right: 0, top: -2, width: 12, height: 12, borderRadius: 6, opacity: 0.7 },
});

// ─────────────────────────────────────────────────────────────
// TABS INTERNOS ANIMADOS
// ─────────────────────────────────────────────────────────────
const TAB_LABELS = ["Gastos Fijos", "Categorías", "Metas"];

function InternalTabs({ active, onChange }: { active: number; onChange: (i: number) => void }) {
    const indicatorX = useRef(new Animated.Value(0)).current;

    const handlePress = (i: number) => {
        Animated.spring(indicatorX, {
            toValue: i,
            friction: 6,
            tension: 80,
            useNativeDriver: false,
        }).start();
        onChange(i);
    };

    const left = indicatorX.interpolate({
        inputRange: [0, 1, 2],
        outputRange: ["0%", "33.33%", "66.66%"],
    });

    return (
        <View style={t.container}>
            <Animated.View style={[t.indicator, { left }]} />
            {TAB_LABELS.map((label, i) => (
                <TouchableOpacity key={i} style={t.tab} onPress={() => handlePress(i)}>
                    <Text style={[t.label, active === i && t.labelActive]}>{label}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

const t = StyleSheet.create({
    container: { flexDirection: "row", backgroundColor: C.card, borderRadius: 14, padding: 4, marginBottom: 20, position: "relative", borderWidth: 1, borderColor: C.cardBorder },
    indicator: { position: "absolute", top: 4, width: "33.33%", bottom: 4, backgroundColor: C.primaryDark + "66", borderRadius: 10, borderWidth: 1, borderColor: C.primary + "55" },
    tab: { flex: 1, paddingVertical: 10, alignItems: "center", zIndex: 1 },
    label: { color: C.textMuted, fontSize: 12, fontWeight: "700" },
    labelActive: { color: C.primaryLight, fontWeight: "900" },
});

// ─────────────────────────────────────────────────────────────
// MODAL — NUEVO GASTO FIJO
// ─────────────────────────────────────────────────────────────
function FixedExpenseModal({ onSave, onClose, existing }: {
    onSave: (e: FixedExpense) => void;
    onClose: () => void;
    existing?: FixedExpense;
}) {
    const [name, setName] = useState(existing?.name || "");
    const [amount, setAmount] = useState(existing?.amount.toString() || "");
    const [currency, setCurrency] = useState<Currency>(existing?.currency || "Q");
    const [category, setCategory] = useState(existing?.category || "other");
    const [day, setDay] = useState(existing?.dayOfMonth.toString() || "1");
    const [autoRecord, setAutoRecord] = useState(existing?.autoRecord ?? true);
    const [notes, setNotes] = useState(existing?.notes || "");

    const handleSave = () => {
        if (!name.trim()) { Alert.alert("Error", "Ingresa el nombre del gasto."); return; }
        const amt = parseFloat(amount.replace(",", "."));
        if (isNaN(amt) || amt <= 0) { Alert.alert("Error", "Ingresa un monto válido."); return; }
        const dayNum = parseInt(day);
        if (isNaN(dayNum) || dayNum < 1 || dayNum > 31) { Alert.alert("Error", "Día inválido (1-31)."); return; }

        const expense: FixedExpense = {
            id: existing?.id || `fe_${Date.now()}`,
            name: name.trim(),
            amount: amt,
            currency,
            category,
            dayOfMonth: dayNum,
            isPaid: existing?.isPaid || false,
            autoRecord,
            notes: notes.trim(),
            isActive: true,
        };
        onSave(expense);
        onClose();
    };

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={md.overlay}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
                    <View style={md.sheet}>
                        <View style={md.header}>
                            <Text style={md.title}>{existing ? "Editar" : "Nuevo"} Gasto Fijo</Text>
                            <TouchableOpacity onPress={onClose} style={md.closeBtn}>
                                <Ionicons name="close" size={22} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            <Text style={md.lbl}>NOMBRE</Text>
                            <TextInput style={md.input} value={name} onChangeText={setName} placeholder="Ej: Renta, Internet, Gym..." placeholderTextColor={C.textMuted} autoFocus />

                            <View style={md.row}>
                                <View style={{ flex: 2, marginRight: 8 }}>
                                    <Text style={md.lbl}>MONTO</Text>
                                    <View style={md.amtRow}>
                                        <Text style={md.cur}>{currency}</Text>
                                        <TextInput style={md.amtInput} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
                                    </View>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={md.lbl}>MONEDA</Text>
                                    <View style={{ gap: 6 }}>
                                        {(["Q", "USD"] as Currency[]).map(c => (
                                            <TouchableOpacity key={c} style={[md.miniBtn, currency === c && md.miniBtnActive]} onPress={() => setCurrency(c)}>
                                                <Text style={[md.miniTxt, currency === c && { color: C.primaryLight }]}>{c}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                            </View>

                            <Text style={md.lbl}>DÍA DEL MES QUE VENCE</Text>
                            <TextInput style={md.input} value={day} onChangeText={setDay} placeholder="1-31" placeholderTextColor={C.textMuted} keyboardType="numeric" />
                            <Text style={md.hint}>El día del mes en que debes pagar este gasto. Ej: 1, 15, 30.</Text>

                            <Text style={md.lbl}>CATEGORÍA</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                                <View style={{ flexDirection: "row", gap: 8 }}>
                                    {EXPENSE_CATEGORIES.slice(0, 12).map(cat => (
                                        <TouchableOpacity key={cat.id} style={[md.catChip, category === cat.id && { borderColor: cat.color, backgroundColor: cat.color + "22" }]} onPress={() => setCategory(cat.id)}>
                                            <Ionicons name={cat.icon} size={16} color={category === cat.id ? cat.color : C.textMuted} />
                                            <Text style={[md.catChipTxt, category === cat.id && { color: cat.color }]}>{cat.label}</Text>
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
                                >
                                    <Text style={{ color: autoRecord ? "#1A0E00" : C.textMuted, fontSize: 11, fontWeight: "800" }}>
                                        {autoRecord ? "SÍ" : "NO"}
                                    </Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={md.lbl}>NOTAS (Opcional)</Text>
                            <TextInput style={md.input} value={notes} onChangeText={setNotes} placeholder="Ej: Tarjeta BAC cuota mínima..." placeholderTextColor={C.textMuted} />

                            <TouchableOpacity style={md.saveBtn} onPress={handleSave}>
                                <Ionicons name="save-outline" size={20} color="#1A0E00" />
                                <Text style={md.saveBtnTxt}>Guardar Gasto Fijo</Text>
                            </TouchableOpacity>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────
// MODAL — NUEVA META DE AHORRO
// ─────────────────────────────────────────────────────────────
function SavingsGoalModal({ onSave, onClose, existing }: {
    onSave: (g: SavingsGoal) => void;
    onClose: () => void;
    existing?: SavingsGoal;
}) {
    const [name, setName] = useState(existing?.name || "");
    const [target, setTarget] = useState(existing?.targetAmount.toString() || "");
    const [current, setCurrent] = useState(existing?.currentAmount.toString() || "0");
    const [currency, setCurrency] = useState<Currency>(existing?.currency || "Q");
    const [deadline, setDeadline] = useState(existing?.deadline ? existing.deadline.substring(0, 10) : "");
    const [selectedColor, setColor] = useState(existing?.color || CATEGORY_COLORS[0]);
    const [selectedIcon, setIcon] = useState(existing?.icon || "star-outline");

    const handleSave = () => {
        if (!name.trim()) { Alert.alert("Error", "Ingresa el nombre de la meta."); return; }
        const tgt = parseFloat(target.replace(",", "."));
        const cur = parseFloat(current.replace(",", "."));
        if (isNaN(tgt) || tgt <= 0) { Alert.alert("Error", "Ingresa un monto objetivo válido."); return; }

        const goal: SavingsGoal = {
            id: existing?.id || `sg_${Date.now()}`,
            name: name.trim(),
            targetAmount: tgt,
            currentAmount: isNaN(cur) ? 0 : cur,
            currency,
            deadline: deadline ? new Date(deadline).toISOString() : new Date(Date.now() + 180 * 86400000).toISOString(),
            icon: selectedIcon,
            color: selectedColor,
            isCompleted: false,
            createdAt: existing?.createdAt || new Date().toISOString(),
        };
        onSave(goal);
        onClose();
    };

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={md.overlay}>
                <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ width: "100%" }}>
                    <View style={md.sheet}>
                        <View style={md.header}>
                            <Text style={md.title}>{existing ? "Editar" : "Nueva"} Meta de Ahorro</Text>
                            <TouchableOpacity onPress={onClose} style={md.closeBtn}>
                                <Ionicons name="close" size={22} color={C.textMuted} />
                            </TouchableOpacity>
                        </View>

                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Preview */}
                            <View style={[md.preview, { borderColor: selectedColor + "55", backgroundColor: selectedColor + "11" }]}>
                                <View style={[md.previewIcon, { backgroundColor: selectedColor + "22", borderColor: selectedColor + "44" }]}>
                                    <Ionicons name={selectedIcon as any} size={28} color={selectedColor} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={[md.previewName, { color: selectedColor }]}>{name || "Mi Meta"}</Text>
                                    <Text style={md.previewAmt}>{currency} {target || "0.00"}</Text>
                                </View>
                            </View>

                            <Text style={md.lbl}>NOMBRE DE LA META</Text>
                            <TextInput style={md.input} value={name} onChangeText={setName} placeholder="Ej: Laptop, Viaje, Fondo de emergencia..." placeholderTextColor={C.textMuted} autoFocus />

                            <View style={md.row}>
                                <View style={{ flex: 2, marginRight: 8 }}>
                                    <Text style={md.lbl}>MONTO OBJETIVO</Text>
                                    <View style={md.amtRow}>
                                        <Text style={md.cur}>{currency}</Text>
                                        <TextInput style={md.amtInput} value={target} onChangeText={setTarget} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
                                    </View>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={md.lbl}>MONEDA</Text>
                                    <View style={{ gap: 6 }}>
                                        {(["Q", "USD"] as Currency[]).map(c => (
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

                            <Text style={md.lbl}>FECHA LÍMITE (YYYY-MM-DD)</Text>
                            <TextInput style={md.input} value={deadline} onChangeText={setDeadline} placeholder="2025-12-31" placeholderTextColor={C.textMuted} />

                            <Text style={md.lbl}>COLOR</Text>
                            <View style={md.colorGrid}>
                                {CATEGORY_COLORS.slice(0, 10).map(c => (
                                    <TouchableOpacity key={c} style={[md.colorDot, { backgroundColor: c }, selectedColor === c && md.colorDotActive]} onPress={() => setColor(c)}>
                                        {selectedColor === c && <Ionicons name="checkmark" size={14} color="#fff" />}
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <Text style={md.lbl}>ÍCONO</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                <View style={{ flexDirection: "row", gap: 8, marginBottom: 16 }}>
                                    {CATEGORY_ICONS.slice(0, 16).map(ic => (
                                        <TouchableOpacity key={ic} style={[md.iconBtn, selectedIcon === ic && { borderColor: selectedColor, backgroundColor: selectedColor + "22" }]} onPress={() => setIcon(ic as any)}>
                                            <Ionicons name={ic} size={22} color={selectedIcon === ic ? selectedColor : C.textSub} />
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </ScrollView>

                            <TouchableOpacity style={md.saveBtn} onPress={handleSave}>
                                <Ionicons name="trophy-outline" size={20} color="#1A0E00" />
                                <Text style={md.saveBtnTxt}>Crear Meta</Text>
                            </TouchableOpacity>
                            <View style={{ height: 40 }} />
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
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

    const active = fixedExpenses.filter(e => e.isActive);
    const paid = active.filter(e => e.isPaid).length;
    const totalQ = active.filter(e => e.currency === 'Q').reduce((s, e) => s + e.amount, 0);
    const paidQ = active.filter(e => e.isPaid && e.currency === 'Q').reduce((s, e) => s + e.amount, 0);

    const handleTogglePaid = async (expense: FixedExpense) => {
        const updated = { ...expense, isPaid: !expense.isPaid, paidDate: !expense.isPaid ? new Date().toISOString() : undefined };
        const all = await StorageService.updateFixedExpense(updated);
        setFixedExpenses(all);

        // Auto-registrar transacción si está activado
        if (!expense.isPaid && updated.autoRecord) {
            const tx: Transaction = {
                id: `fe_tx_${expense.id}_${Date.now()}`,
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
        }
        // Notificar al padre para que recargue todos los datos
        onRefresh?.();
    };

    const handleSave = async (expense: FixedExpense) => {
        const isNew = !fixedExpenses.find(e => e.id === expense.id);
        const all = isNew
            ? await StorageService.addFixedExpense(expense)
            : await StorageService.updateFixedExpense(expense);
        setFixedExpenses(all);
    };

    const handleDelete = (id: string) => {
        Alert.alert("Eliminar", "¿Borrar este gasto fijo?", [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Eliminar", style: "destructive", onPress: async () => {
                    const all = await StorageService.deleteFixedExpense(id);
                    setFixedExpenses(all);
                }
            }
        ]);
    };

    const daysLeft = getDaysUntilNextPayment(settings);

    return (
        <View style={{ flex: 1 }}>
            {/* LISTA Y RESUMEN */}
            <ScrollView showsVerticalScrollIndicator={false}>
                {/* RESUMEN */}
                <View style={s.summaryCard}>
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
                </View>

                <AnimatedBar pct={active.length > 0 ? (paid / active.length) * 100 : 0} color={C.income} height={6} />
                <Text style={s.barLabel}>{Math.round(active.length > 0 ? (paid / active.length) * 100 : 0)}% de gastos fijos cubiertos este mes</Text>
                
                <View style={{ marginTop: 16 }}>
                {active.length === 0 ? (
                    <View style={s.empty}>
                        <Ionicons name="calendar-outline" size={48} color={C.textMuted} />
                        <Text style={s.emptyTitle}>Sin gastos fijos</Text>
                        <Text style={s.emptyDesc}>Agrega tus compromisos mensuales: renta, internet, tarjetas, etc.</Text>
                    </View>
                ) : (
                    active
                        .sort((a, b) => a.dayOfMonth - b.dayOfMonth)
                        .map(expense => {
                            const cat = getCat(expense.category, settings.customCategories);
                            const isOverdue = !expense.isPaid && new Date().getDate() > expense.dayOfMonth;
                            return (
                                <TouchableOpacity
                                    key={expense.id}
                                    style={[s.fixedCard, expense.isPaid && s.fixedCardPaid, isOverdue && s.fixedCardOverdue]}
                                    onLongPress={() => { setEditing(expense); setShowModal(true); }}
                                    activeOpacity={0.8}
                                >
                                    <TouchableOpacity style={[s.checkbox, expense.isPaid && s.checkboxPaid]} onPress={() => handleTogglePaid(expense)}>
                                        {expense.isPaid && <Ionicons name="checkmark" size={16} color="#1A0E00" />}
                                    </TouchableOpacity>

                                    <View style={[s.fixedIcon, { backgroundColor: cat.color + "22", borderColor: cat.color + "44" }]}>
                                        <Ionicons name={cat.icon} size={20} color={cat.color} />
                                    </View>

                                    <View style={{ flex: 1 }}>
                                        <Text style={[s.fixedName, expense.isPaid && { textDecorationLine: "line-through", color: C.textMuted }]}>
                                            {expense.name}
                                        </Text>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 3 }}>
                                            <Text style={s.fixedDay}>Día {expense.dayOfMonth}</Text>
                                            {isOverdue && <View style={s.overdueBadge}><Text style={s.overdueTxt}>VENCIDO</Text></View>}
                                            {expense.autoRecord && <View style={s.autoBadge}><Text style={s.autoTxt}>AUTO</Text></View>}
                                        </View>
                                    </View>

                                    <View style={{ alignItems: "flex-end" }}>
                                        <Text style={[s.fixedAmount, { color: expense.isPaid ? C.income : C.expense }]}>
                                            {expense.currency} {expense.amount.toFixed(2)}
                                        </Text>
                                        <TouchableOpacity onPress={() => handleDelete(expense.id)} style={s.deleteBtn}>
                                            <Ionicons name="trash-outline" size={14} color={C.danger} />
                                        </TouchableOpacity>
                                    </View>
                                </TouchableOpacity>
                            );
                        })
                )}
                <View style={{ height: 100 }} />
                </View>
            </ScrollView>

            {/* FAB */}
            <TouchableOpacity style={s.fab} onPress={() => { setEditing(undefined); setShowModal(true); }}>
                <Ionicons name="add" size={28} color="#1A0E00" />
            </TouchableOpacity>

            {showModal && (
                <FixedExpenseModal
                    existing={editing}
                    onSave={handleSave}
                    onClose={() => { setShowModal(false); setEditing(undefined); }}
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

    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const monthTx = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y && t.type === 'expense' && t.currency === 'Q';
    });

    const allCats = getAllExpenseCategories(settings.customCategories);

    const getSpent = (catId: string) =>
        monthTx.filter(t => t.category === catId).reduce((s, t) => s + t.amount, 0);

    const handleSaveBudget = async (catId: string) => {
        const val = parseFloat(limitVal.replace(",", "."));
        if (isNaN(val) || val <= 0) { Alert.alert("Error", "Ingresa un límite válido."); return; }
        const budget: CategoryBudget = { categoryId: catId, limit: val, currency: "Q", alertAt: 80 };
        const all = await StorageService.upsertCategoryBudget(budget);
        setCategoryBudgets(all);
        setEditing(null);
        setLimitVal("");
    };

    const handleDelete = async (catId: string) => {
        const all = await StorageService.deleteCategoryBudget(catId);
        setCategoryBudgets(all);
    };

    const totalBudgeted = categoryBudgets.reduce((s, b) => s + b.limit, 0);
    const totalSpent = categoryBudgets.reduce((s, b) => s + getSpent(b.categoryId), 0);

    return (
        <ScrollView showsVerticalScrollIndicator={false}>
            {/* RESUMEN TOTAL */}
            <View style={s.summaryCard}>
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
                    <View key={cb.categoryId} style={s.catBudgetCard}>
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
                            <TouchableOpacity onPress={() => handleDelete(cb.categoryId)} style={[s.deleteBtn, { marginLeft: 8 }]}>
                                <Ionicons name="trash-outline" size={14} color={C.danger} />
                            </TouchableOpacity>
                        </View>
                        <AnimatedBar pct={pct} color={barColor} height={8} />
                        <Text style={s.pctLabel}>{Math.round(pct)}%</Text>
                    </View>
                );
            })}

            {/* AGREGAR PRESUPUESTO A CATEGORÍAS */}
            <Text style={[s.sectionTitle, { marginTop: 8 }]}>AGREGAR PRESUPUESTO</Text>
            <Text style={s.sectionHint}>Toca una categoría para asignarle un límite mensual.</Text>

            <View style={s.catGrid}>
                {allCats
                    .filter(cat => !categoryBudgets.find(cb => cb.categoryId === cat.id))
                    .map(cat => (
                        <TouchableOpacity
                            key={cat.id}
                            style={[s.catChip, editing === cat.id && { borderColor: cat.color, backgroundColor: cat.color + "22" }]}
                            onPress={() => { setEditing(cat.id); setLimitVal(""); }}
                        >
                            <Ionicons name={cat.icon} size={16} color={editing === cat.id ? cat.color : C.textSub} />
                            <Text style={[s.catChipTxt, editing === cat.id && { color: cat.color }]}>{cat.label}</Text>
                        </TouchableOpacity>
                    ))}
            </View>

            {editing && (
                <View style={s.limitInputCard}>
                    <Text style={s.limitInputLabel}>Límite para {getCat(editing, settings.customCategories).label}</Text>
                    <View style={s.limitRow}>
                        <Text style={s.limitCur}>Q</Text>
                        <TextInput
                            style={s.limitInput}
                            value={limitVal}
                            onChangeText={setLimitVal}
                            placeholder="0.00"
                            placeholderTextColor={C.textMuted}
                            keyboardType="decimal-pad"
                            autoFocus
                        />
                        <TouchableOpacity style={s.limitSaveBtn} onPress={() => handleSaveBudget(editing)}>
                            <Ionicons name="checkmark" size={20} color="#1A0E00" />
                        </TouchableOpacity>
                        <TouchableOpacity style={s.limitCancelBtn} onPress={() => setEditing(null)}>
                            <Ionicons name="close" size={20} color={C.textMuted} />
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            <View style={{ height: 100 }} />
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

    const handleSave = async (goal: SavingsGoal) => {
        const isNew = !savingsGoals.find(g => g.id === goal.id);
        const all = isNew
            ? await StorageService.addSavingsGoal(goal)
            : await StorageService.updateSavingsGoal(goal);
        setSavingsGoals(all);
    };

    const handleAbono = async (goal: SavingsGoal) => {
        const val = parseFloat(abonoVal.replace(",", "."));
        if (isNaN(val) || val <= 0) { Alert.alert("Error", "Ingresa un monto válido."); return; }
        const updated = {
            ...goal,
            currentAmount: goal.currentAmount + val,
            isCompleted: goal.currentAmount + val >= goal.targetAmount,
        };
        const all = await StorageService.updateSavingsGoal(updated);
        setSavingsGoals(all);
        setAbonoId(null);
        setAbonoVal("");
    };

    const handleDelete = (id: string) => {
        Alert.alert("Eliminar", "¿Borrar esta meta?", [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Eliminar", style: "destructive", onPress: async () => {
                    const all = await StorageService.deleteSavingsGoal(id);
                    setSavingsGoals(all);
                }
            }
        ]);
    };

    const active = savingsGoals.filter(g => !g.isCompleted);
    const completed = savingsGoals.filter(g => g.isCompleted);

    return (
        <View style={{ flex: 1 }}>
            <ScrollView showsVerticalScrollIndicator={false}>
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
                    const deadline = new Date(goal.deadline);
                    const daysLeft = Math.ceil((deadline.getTime() - Date.now()) / 86400000);
                    const monthly = daysLeft > 0 ? (remaining / Math.max(daysLeft / 30, 0.1)).toFixed(2) : "Meta vencida";

                    return (
                        <View key={goal.id} style={[s.goalCard, { borderTopColor: goal.color }]}>
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
                                <View style={s.abonoRow}>
                                    <Text style={s.abonoCur}>{goal.currency}</Text>
                                    <TextInput
                                        style={s.abonoInput}
                                        value={abonoVal}
                                        onChangeText={setAbonoVal}
                                        placeholder="0.00"
                                        placeholderTextColor={C.textMuted}
                                        keyboardType="decimal-pad"
                                        autoFocus
                                    />
                                    <TouchableOpacity style={[s.abonoBtn, { backgroundColor: goal.color }]} onPress={() => handleAbono(goal)}>
                                        <Text style={s.abonoBtnTxt}>Abonar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setAbonoId(null)} style={s.abonoCancelBtn}>
                                        <Ionicons name="close" size={18} color={C.textMuted} />
                                    </TouchableOpacity>
                                </View>
                            ) : (
                                <View style={s.goalActions}>
                                    <TouchableOpacity style={[s.goalActionBtn, { borderColor: goal.color, backgroundColor: goal.color + "11" }]} onPress={() => setAbonoId(goal.id)}>
                                        <Ionicons name="add-circle-outline" size={16} color={goal.color} />
                                        <Text style={[s.goalActionTxt, { color: goal.color }]}>Abonar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.goalActionBtn} onPress={() => { setEditing(goal); setShowModal(true); }}>
                                        <Ionicons name="pencil-outline" size={16} color={C.textSub} />
                                        <Text style={s.goalActionTxt}>Editar</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={s.goalActionBtn} onPress={() => handleDelete(goal.id)}>
                                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                                        <Text style={[s.goalActionTxt, { color: C.danger }]}>Eliminar</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                        </View>
                    );
                })}

                {completed.length > 0 && (
                    <>
                        <Text style={[s.sectionTitle, { marginTop: 16 }]}>🏆 METAS COMPLETADAS</Text>
                        {completed.map(goal => (
                            <View key={goal.id} style={[s.goalCard, { opacity: 0.7, borderTopColor: C.income }]}>
                                <View style={s.goalHeader}>
                                    <View style={[s.goalIcon, { backgroundColor: C.income + "22", borderColor: C.income + "44" }]}>
                                        <Ionicons name="trophy-outline" size={22} color={C.income} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.goalName}>{goal.name}</Text>
                                        <Text style={[s.goalPct, { color: C.income }]}>¡Meta alcanzada! 🎉</Text>
                                    </View>
                                    <Text style={[s.goalCurrent, { color: C.income }]}>{goal.currency} {goal.targetAmount.toFixed(2)}</Text>
                                </View>
                            </View>
                        ))}
                    </>
                )}

                <View style={{ height: 100 }} />
            </ScrollView>

            <TouchableOpacity style={s.fab} onPress={() => { setEditing(undefined); setShowModal(true); }}>
                <Ionicons name="add" size={28} color="#1A0E00" />
            </TouchableOpacity>

            {showModal && (
                <SavingsGoalModal
                    existing={editing}
                    onSave={handleSave}
                    onClose={() => { setShowModal(false); setEditing(undefined); }}
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

    const handleTabChange = useCallback((i: number) => {
        Animated.sequence([
            Animated.timing(fadeAnim, { toValue: 0, duration: 120, useNativeDriver: true }),
            Animated.timing(fadeAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        ]).start();
        setTimeout(() => setActiveTab(i), 120);
    }, []);

    return (
        <View style={s.screen}>
            <View style={s.pageHeader}>
                <Text style={s.pageTitle}>Presupuesto</Text>
                <Text style={s.pageSubtitle}>Planifica · Controla · Crece</Text>
            </View>

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
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    pageHeader: { marginBottom: 20 },
    pageTitle: { color: C.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: 0.5 },
    pageSubtitle: { color: C.textSub, fontSize: 13, marginTop: 4 },
    sectionTitle: { color: C.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.5, marginBottom: 10 },
    sectionHint: { color: C.textMuted, fontSize: 12, marginBottom: 12 },
    barLabel: { color: C.textMuted, fontSize: 11, marginTop: 6, marginBottom: 4 },

    // Resumen
    summaryCard: { flexDirection: "row", backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    summaryItem: { flex: 1, alignItems: "center" },
    summaryVal: { color: C.textPrimary, fontSize: 16, fontWeight: "900", marginBottom: 4 },
    summaryLbl: { color: C.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 1 },
    summaryDivider: { width: 1, backgroundColor: C.cardBorder, marginHorizontal: 8 },

    // Gastos fijos
    fixedCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 14, marginBottom: 10, ...shadow("#000", 4, 0.2) },
    fixedCardPaid: { opacity: 0.7, backgroundColor: C.bgDeep },
    fixedCardOverdue: { borderColor: C.danger + "55", backgroundColor: C.danger + "08" },
    checkbox: { width: 28, height: 28, borderRadius: 14, borderWidth: 2, borderColor: C.cardBorder, alignItems: "center", justifyContent: "center", marginRight: 12 },
    checkboxPaid: { backgroundColor: C.income, borderColor: C.income },
    fixedIcon: { width: 40, height: 40, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 12 },
    fixedName: { color: C.text, fontSize: 15, fontWeight: "700" },
    fixedDay: { color: C.textMuted, fontSize: 11 },
    fixedAmount: { fontSize: 15, fontWeight: "800" },
    overdueBadge: { backgroundColor: C.danger + "22", paddingHorizontal: 6, borderRadius: 4 },
    overdueTxt: { color: C.danger, fontSize: 9, fontWeight: "900" },
    autoBadge: { backgroundColor: C.accent + "22", paddingHorizontal: 6, borderRadius: 4 },
    autoTxt: { color: C.accent, fontSize: 9, fontWeight: "900" },
    deleteBtn: { padding: 6, borderRadius: 8, backgroundColor: C.danger + "11" },

    // Categorías
    catBudgetCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, padding: 14, marginBottom: 12, ...shadow("#000", 4, 0.2) },
    catBudgetHeader: { flexDirection: "row", alignItems: "center", marginBottom: 10 },
    catIcon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 10 },
    catName: { color: C.text, fontSize: 14, fontWeight: "700" },
    catStatus: { fontSize: 11, marginTop: 2 },
    catSpent: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
    catLimit: { color: C.textMuted, fontSize: 11 },
    pctLabel: { color: C.textMuted, fontSize: 10, marginTop: 4, textAlign: "right" },
    catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    catChipTxt: { color: C.textSub, fontSize: 12, fontWeight: "700" },
    limitInputCard: { backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.primary + "55", padding: 16, marginBottom: 16 },
    limitInputLabel: { color: C.textPrimary, fontSize: 14, fontWeight: "700", marginBottom: 10 },
    limitRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    limitCur: { color: C.textMuted, fontSize: 16, fontWeight: "700" },
    limitInput: { flex: 1, backgroundColor: C.bgDeep, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, padding: 10, color: C.text, fontSize: 16, fontWeight: "700" },
    limitSaveBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
    limitCancelBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: "center", justifyContent: "center" },

    // Metas
    goalCard: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.cardBorder, borderTopWidth: 3, padding: 16, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    goalHeader: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    goalIcon: { width: 44, height: 44, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 12 },
    goalName: { color: C.textPrimary, fontSize: 16, fontWeight: "800" },
    goalPct: { fontSize: 12, fontWeight: "700", marginTop: 2 },
    goalCurrent: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
    goalTarget: { color: C.textMuted, fontSize: 11, marginTop: 2 },
    goalStats: { flexDirection: "row", marginTop: 10, marginBottom: 12 },
    goalStat: { flex: 1, alignItems: "center" },
    goalStatVal: { color: C.textPrimary, fontSize: 13, fontWeight: "800" },
    goalStatLbl: { color: C.textMuted, fontSize: 9, letterSpacing: 1, marginTop: 2 },
    goalActions: { flexDirection: "row", gap: 8 },
    goalActionBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    goalActionTxt: { color: C.textSub, fontSize: 12, fontWeight: "700" },
    abonoRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    abonoCur: { color: C.textMuted, fontSize: 16, fontWeight: "700" },
    abonoInput: { flex: 1, backgroundColor: C.bgDeep, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, padding: 10, color: C.text, fontSize: 16, fontWeight: "700" },
    abonoBtn: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10 },
    abonoBtnTxt: { color: "#1A0E00", fontSize: 13, fontWeight: "800" },
    abonoCancelBtn: { width: 36, height: 36, borderRadius: 18, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: "center", justifyContent: "center" },

    // Shared
    empty: { alignItems: "center", paddingTop: 60, gap: 12 },
    emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: "800" },
    emptyDesc: { color: C.textMuted, fontSize: 13, textAlign: "center", lineHeight: 20, paddingHorizontal: 20 },
    fab: { position: "absolute", bottom: 20, right: 0, width: 58, height: 58, borderRadius: 29, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", ...shadow(C.primaryGlow, 12, 0.6), borderWidth: 2, borderColor: C.primaryLight },
});

// ESTILOS MODALES
const md = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
    sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.primary + "55", padding: 24, maxHeight: "90%", ...shadow(C.primaryGlow, 20, 0.4) },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
    title: { color: C.textPrimary, fontSize: 20, fontWeight: "900" },
    closeBtn: { padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
    lbl: { color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },
    hint: { color: C.textMuted, fontSize: 12, marginTop: 4, lineHeight: 17 },
    input: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, padding: 14, color: C.text, fontSize: 15 },
    row: { flexDirection: "row", alignItems: "flex-start" },
    amtRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 14, paddingVertical: 10 },
    amtInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: "700" },
    cur: { color: C.textMuted, fontSize: 16, fontWeight: "700", marginRight: 8 },
    miniBtn: { paddingVertical: 10, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    miniBtnActive: { borderColor: C.primary, backgroundColor: C.primaryDark + "33" },
    miniTxt: { color: C.textSub, fontSize: 13, fontWeight: "800" },
    catChip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    catChipTxt: { color: C.textSub, fontSize: 11, fontWeight: "700" },
    switchRow: { flexDirection: "row", alignItems: "center", marginTop: 8 },
    toggle: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep, marginLeft: 12 },
    toggleActive: { backgroundColor: C.primary, borderColor: C.primaryLight },
    saveBtn: { flexDirection: "row", backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center", gap: 10, marginTop: 20, ...shadow(C.primaryGlow, 10, 0.4) },
    saveBtnTxt: { color: "#1A0E00", fontSize: 15, fontWeight: "900" },
    preview: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 14, borderWidth: 1, marginBottom: 8, gap: 14 },
    previewIcon: { width: 48, height: 48, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    previewName: { fontSize: 18, fontWeight: "800" },
    previewAmt: { color: C.textSub, fontSize: 14, marginTop: 2 },
    colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10, marginBottom: 8 },
    colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    colorDotActive: { borderWidth: 3, borderColor: "#fff" },
    iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
});