import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
    Animated, Easing, KeyboardAvoidingView,
    Platform, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, View, Keyboard, TouchableWithoutFeedback
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Currency, PaymentCycle, parseAmount } from "../services/storage";
import { C } from "../theme";
import { GlassBackground, GlassCard } from "./GlassCard";
import { GlassButton } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";
import Money from "./Money";
import { formatMoney } from "../services/format";
import { useKeyboardHeight } from "./useKeyboardHeight";

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
interface DebtEntry {
    id: string;
    name: string;
    type: 'credit' | 'loan' | 'installment' | 'other';
    monthlyPayment: string;
    totalAmount: string;
}

interface OnboardingData {
    name: string;
    monthlyIncome: string;
    paymentCycle: PaymentCycle;
    paymentDay: string;
    paymentDays: string;
    biggestExpense: string;
    activeDebts: string;
    activeDebtsList: DebtEntry[];
    monthlySavings: string;
    preferredBanks: string[];
    externalSavings: string;
    currency: Currency;
}

interface Props { onComplete: (data: OnboardingData) => void; }

const BANKS = ["BAC", "BANRURAL", "GTC", "BANTRAB", "PROMERICA", "BI", "CHASE", "OTRO"];

/** Monto escrito por el usuario → número (acepta "7,400"); vacío o inválido = 0 */
const amt = (v: string): number => {
    const n = parseAmount(v || "0");
    return isNaN(n) ? 0 : n;
};

// ─────────────────────────────────────────────────────────────
// BARRA DE PROGRESO
// ─────────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
    const pct = ((current + 1) / total) * 100;
    const anim = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.timing(anim, { toValue: pct, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    }, [pct]);

    const barW = anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

    return (
        <View style={p.wrap}>
            <View style={p.track}>
                <Animated.View style={[p.fill, { width: barW }]}>
                    <View style={p.glow} />
                </Animated.View>
            </View>
            <Text style={p.label}>{current + 1} de {total}</Text>
        </View>
    );
}

const p = StyleSheet.create({
    wrap: { width: "100%", marginBottom: 24 },
    track: { height: 3, backgroundColor: C.glassInput, borderRadius: 2, overflow: "hidden", marginBottom: 6 },
    fill: { height: "100%", backgroundColor: C.primary, borderRadius: 2 },
    glow: { position: "absolute", right: 0, top: -3, width: 16, height: 9, backgroundColor: C.primaryGlow, borderRadius: 4, opacity: 0.9 },
    label: { color: C.textSub, fontSize: 11, letterSpacing: 1, textAlign: "right" },
});

// ─────────────────────────────────────────────────────────────
// ANIMACIÓN DE CARD
// ─────────────────────────────────────────────────────────────
function AnimatedCard({ children, direction = 1 }: { children: React.ReactNode; direction?: number }) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateX = useRef(new Animated.Value(40 * direction)).current;

    React.useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, friction: 7, tension: 50, useNativeDriver: true }),
        ]).start();
    }, []);

    return (
        <Animated.View style={{ opacity, transform: [{ translateX }], flex: 1 }}>
            {children}
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────
// OPCIÓN SELECCIONABLE
// ─────────────────────────────────────────────────────────────
function OptionBtn({ label, selected, onPress, icon, desc }: {
    label: string; selected: boolean; onPress: () => void; icon?: any; desc?: string;
}) {
    const scale = useRef(new Animated.Value(1)).current;
    const handlePress = () => {
        Animated.sequence([
            Animated.spring(scale, { toValue: 0.95, friction: 5, useNativeDriver: true }),
            Animated.spring(scale, { toValue: 1, friction: 5, useNativeDriver: true }),
        ]).start();
        onPress();
    };
    return (
        <Animated.View style={{ transform: [{ scale }] }}>
            <TouchableOpacity style={[o.btn, selected && o.btnActive]} onPress={handlePress} activeOpacity={0.8}>
                {!selected && <GlassBackground radius={14} blur={false} />}
                {icon && <Ionicons name={icon} size={22} color={selected ? C.primaryLight : C.textSub} style={{ marginRight: 12 }} />}
                <View style={{ flex: 1 }}>
                    <Text style={[o.label, selected && { color: C.primaryLight }]}>{label}</Text>
                    {desc && <Text style={o.desc}>{desc}</Text>}
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={C.primary} />}
            </TouchableOpacity>
        </Animated.View>
    );
}

const o = StyleSheet.create({
    btn: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: "transparent", padding: 16, marginBottom: 10, overflow: "hidden" },
    btnActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    label: { color: C.textSub, fontSize: 15, fontWeight: "700" },
    desc: { color: C.textSub, fontSize: 12, marginTop: 3 },
});

// ─────────────────────────────────────────────────────────────
// INPUT ESTILIZADO
// ─────────────────────────────────────────────────────────────
function StyledInput({ value, onChangeText, placeholder, keyboardType, prefix, suffix, autoFocus = false }: {
    value: string; onChangeText: (t: string) => void; placeholder: string;
    keyboardType?: any; prefix?: string; suffix?: string; autoFocus?: boolean;
}) {
    return (
        <View style={i.row}>
            {prefix && <Text style={i.fix}>{prefix}</Text>}
            <TextInput
                style={i.input}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={C.textMuted}
                keyboardType={keyboardType || "default"}
                autoFocus={autoFocus}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
            />
            {suffix && <Text style={i.fix}>{suffix}</Text>}
        </View>
    );
}

const i = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderRadius: 14, borderWidth: 1.5, borderColor: C.glassActiveBorder, paddingHorizontal: 16, paddingVertical: 14, marginTop: 12 },
    input: { flex: 1, color: C.text, fontSize: 18, fontWeight: "700" },
    fix: { color: C.textSub, fontSize: 16, fontWeight: "700", marginHorizontal: 6 },
});

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function OnboardingScreen({ onComplete }: Props) {
    const insets = useSafeAreaInsets();
    const kb = useKeyboardHeight();
    const [step, setStep] = useState(0);
    const [dir, setDir] = useState(1);
    const [data, setData] = useState<OnboardingData>({
        name: "",
        monthlyIncome: "",
        paymentCycle: "monthly",
        paymentDay: "30",
        paymentDays: "15,30",
        biggestExpense: "",
        activeDebts: "0",
        activeDebtsList: [],
        monthlySavings: "",
        preferredBanks: [],
        externalSavings: "0",
        currency: "Q",
    });

    // Estado temporal para agregar una deuda
    const [newDebtName, setNewDebtName] = useState("");
    const [newDebtType, setNewDebtType] = useState<DebtEntry['type']>("credit");
    const [newDebtMonthly, setNewDebtMonthly] = useState("");
    const [newDebtTotal, setNewDebtTotal] = useState("");
    const [showDebtForm, setShowDebtForm] = useState(false);

    const addDebt = () => {
        if (!newDebtName.trim() || !newDebtMonthly.trim()) return;
        const debt: DebtEntry = {
            id: `debt_${Date.now()}`,
            name: newDebtName.trim(),
            type: newDebtType,
            monthlyPayment: newDebtMonthly,
            totalAmount: newDebtTotal || "0",
        };
        const updatedList = [...data.activeDebtsList, debt];
        const totalMonthly = updatedList.reduce((s, d) => s + amt(d.monthlyPayment), 0);
        setData(d => ({
            ...d,
            activeDebtsList: updatedList,
            activeDebts: totalMonthly.toFixed(2),
        }));
        setNewDebtName("");
        setNewDebtMonthly("");
        setNewDebtTotal("");
        setShowDebtForm(false);
    };

    const removeDebt = (id: string) => {
        const updatedList = data.activeDebtsList.filter(d => d.id !== id);
        const totalMonthly = updatedList.reduce((s, d) => s + amt(d.monthlyPayment), 0);
        setData(d => ({
            ...d,
            activeDebtsList: updatedList,
            activeDebts: totalMonthly.toFixed(2),
        }));
    };

    const TOTAL_STEPS = 8;

    const goNext = () => {
        Keyboard.dismiss();
        if (step < TOTAL_STEPS - 1) { setDir(1); setStep(s => s + 1); }
        else handleFinish();
    };

    const goBack = () => {
        Keyboard.dismiss();
        if (step > 0) { setDir(-1); setStep(s => s - 1); }
    };

    const toggleBank = (bank: string) => {
        setData(d => ({
            ...d,
            preferredBanks: d.preferredBanks.includes(bank)
                ? d.preferredBanks.filter(b => b !== bank)
                : [...d.preferredBanks, bank],
        }));
    };

    const handleFinish = () => onComplete(data);

    const isValidDay = (str: string, max: number): boolean => {
        if (!/^\d{1,2}$/.test(str.trim())) return false;
        const n = parseInt(str.trim(), 10);
        return n >= 1 && n <= max;
    };

    const canContinue = (): boolean => {
        if (step === 0) return data.name.trim().length > 0;
        if (step === 1) return data.monthlyIncome.trim().length > 0;
        if (step === 3) {
            if (data.paymentCycle === "biweekly") {
                const parts = data.paymentDays.split(",").map(x => x.trim());
                return parts.length === 2 && parts.every(x => isValidDay(x, 31)) && parts[0] !== parts[1];
            }
            if (data.paymentCycle === "weekly") return isValidDay(data.paymentDay, 7);
            return isValidDay(data.paymentDay, 31);
        }
        return true;
    };

    // Espacio extra al final de cada paso para que el teclado no tape el último campo
    const kbSpacer = <View style={{ height: 24 + kb }} />;

    const steps = [
        // PASO 0 — Nombre
        <AnimatedCard key={0} direction={dir}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.stepHeader}>
                    <View style={s.stepIcon}>
                        <Ionicons name="person-outline" size={28} color={C.primaryLight} />
                    </View>
                    <Text style={s.stepTitle}>¡Bienvenido a BudgetMaster!</Text>
                    <Text style={s.stepSubtitle}>
                        Soy tu CFO personal. En los próximos pasos voy a conocer tu realidad financiera para darte consejos precisos y reales.{"\n\n"}
                        Comencemos. ¿Cómo te llamas?
                    </Text>
                </View>
                <StyledInput value={data.name} onChangeText={v => setData(d => ({ ...d, name: v }))} placeholder="Tu nombre..." autoFocus />
                {kbSpacer}
            </ScrollView>
        </AnimatedCard>,

        // PASO 1 — Ingreso + Moneda
        <AnimatedCard key={1} direction={dir}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.stepHeader}>
                    <View style={[s.stepIcon, { backgroundColor: C.income + "22" }]}>
                        <Ionicons name="cash-outline" size={28} color={C.income} />
                    </View>
                    <Text style={s.stepTitle}>¿Cuánto ganás al mes?</Text>
                    <Text style={s.stepSubtitle}>Esta es la base de todo análisis. Un aproximado es suficiente.</Text>
                </View>
                <View style={s.currencyRow}>
                    {(["Q", "USD"] as Currency[]).map(cur => (
                        <TouchableOpacity key={cur} style={[s.currBtn, data.currency === cur && s.chipActive]} onPress={() => setData(d => ({ ...d, currency: cur }))}>
                            {data.currency !== cur && <GlassBackground radius={12} blur={false} />}
                            <Text style={[s.currTxt, data.currency === cur && { color: C.primaryLight }]}>{cur}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <StyledInput value={data.monthlyIncome} onChangeText={v => setData(d => ({ ...d, monthlyIncome: v }))} placeholder="0.00" keyboardType="decimal-pad" prefix={data.currency} autoFocus />
                {kbSpacer}
            </ScrollView>
        </AnimatedCard>,

        // PASO 2 — Ciclo de pago
        <AnimatedCard key={2} direction={dir}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.stepHeader}>
                    <View style={s.stepIcon}>
                        <Ionicons name="calendar-outline" size={28} color={C.primaryLight} />
                    </View>
                    <Text style={s.stepTitle}>¿Cada cuándo te pagan?</Text>
                    <Text style={s.stepSubtitle}>Esto me permite calcular cuántos días te quedan hasta tu próximo ingreso y proyectar si tu dinero alcanzará.</Text>
                </View>
                <OptionBtn label="Mensual" icon="calendar-outline" desc="Me pagan una vez al mes" selected={data.paymentCycle === "monthly"} onPress={() => setData(d => ({ ...d, paymentCycle: "monthly" }))} />
                <OptionBtn label="Quincenal" icon="git-branch-outline" desc="Me pagan los días 15 y 30" selected={data.paymentCycle === "biweekly"} onPress={() => setData(d => ({ ...d, paymentCycle: "biweekly" }))} />
                <OptionBtn label="Semanal" icon="refresh-outline" desc="Me pagan cada semana" selected={data.paymentCycle === "weekly"} onPress={() => setData(d => ({ ...d, paymentCycle: "weekly" }))} />
                <OptionBtn label="Irregular" icon="shuffle-outline" desc="Freelance — ingresos variables" selected={data.paymentCycle === "irregular"} onPress={() => setData(d => ({ ...d, paymentCycle: "irregular" }))} />
                {kbSpacer}
            </ScrollView>
        </AnimatedCard>,

        // PASO 3 — Día de pago
        <AnimatedCard key={3} direction={dir}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.stepHeader}>
                    <View style={s.stepIcon}>
                        <Ionicons name="today-outline" size={28} color={C.primaryLight} />
                    </View>
                    <Text style={s.stepTitle}>{data.paymentCycle === "biweekly" ? "¿Qué días te depositan?" : "¿Qué día del mes te pagan?"}</Text>
                    <Text style={s.stepSubtitle}>
                        {data.paymentCycle === "biweekly" ? "Ingresa los dos días separados por coma. Ej: 15,30"
                            : data.paymentCycle === "weekly" ? "¿Qué día de la semana? (1=Lunes, 7=Domingo)"
                                : data.paymentCycle === "irregular" ? "¿Cuándo fue tu último ingreso? (día del mes)"
                                    : "Ingresa el día del mes en que recibes tu salario. Ej: 25, 30, 1"}
                    </Text>
                </View>
                <StyledInput
                    value={data.paymentCycle === "biweekly" ? data.paymentDays : data.paymentDay}
                    onChangeText={v => data.paymentCycle === "biweekly" ? setData(d => ({ ...d, paymentDays: v })) : setData(d => ({ ...d, paymentDay: v }))}
                    placeholder={data.paymentCycle === "biweekly" ? "15,30" : "30"}
                    keyboardType="numeric"
                    suffix="del mes"
                    autoFocus
                />
                {step === 3 && !canContinue() && (
                    <InlineNotice
                        variant="error"
                        style={{ marginTop: 10 }}
                        text={data.paymentCycle === "biweekly"
                            ? "Ingresa dos días válidos (1-31) separados por coma, ej: 15,30"
                            : data.paymentCycle === "weekly"
                                ? "Ingresa un día de la semana entre 1 y 7"
                                : "Ingresa un día del mes entre 1 y 31"}
                    />
                )}
                {kbSpacer}
            </ScrollView>
        </AnimatedCard>,

        // PASO 4 — Mayor gasto fijo
        <AnimatedCard key={4} direction={dir}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.stepHeader}>
                    <View style={[s.stepIcon, { backgroundColor: C.expense + "22" }]}>
                        <Ionicons name="home-outline" size={28} color={C.expense} />
                    </View>
                    <Text style={s.stepTitle}>¿Cuál es tu mayor gasto fijo?</Text>
                    <Text style={s.stepSubtitle}>Renta, hipoteca, cuota de préstamo... El gasto que viene sí o sí cada mes.</Text>
                </View>
                <StyledInput value={data.biggestExpense} onChangeText={v => setData(d => ({ ...d, biggestExpense: v }))} placeholder="0.00" keyboardType="decimal-pad" prefix="Q" autoFocus />
                <Text style={s.hint}>Podés agregar todos tus gastos fijos en detalle después en la sección Presupuesto.</Text>
                {kbSpacer}
            </ScrollView>
        </AnimatedCard>,

        // PASO 5 — Deudas múltiples
        <AnimatedCard key={5} direction={dir}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.stepHeader}>
                    <View style={[s.stepIcon, { backgroundColor: C.danger + "22" }]}>
                        <Ionicons name="alert-circle-outline" size={28} color={C.danger} />
                    </View>
                    <Text style={s.stepTitle}>¿Tenés deudas activas?</Text>
                    <Text style={s.stepSubtitle}>
                        Registra cada deuda por separado: tarjetas de crédito, préstamos, visacuotas. Así podré ayudarte a eliminarlas estratégicamente.{"\n\n"}"La deuda sin plan es una cadena invisible." — Dave Ramsey
                    </Text>
                </View>

                {/* Lista de deudas agregadas */}
                {data.activeDebtsList.length === 0 && !showDebtForm && (
                    <View style={s.noDebtBox}>
                        <Ionicons name="checkmark-circle-outline" size={28} color={C.income} />
                        <Text style={s.noDebtTxt}>Sin deudas registradas</Text>
                    </View>
                )}

                {data.activeDebtsList.map(debt => (
                    <GlassCard key={debt.id} radius={14} blur={false} leftAccentColor={C.danger} style={s.debtCard} contentStyle={s.debtCardContent}>
                        <View style={s.debtCardLeft}>
                            <Ionicons
                                name={debt.type === 'credit' ? 'card-outline' : debt.type === 'loan' ? 'cash-outline' : debt.type === 'installment' ? 'receipt-outline' : 'help-circle-outline'}
                                size={20}
                                color={C.danger}
                                style={{ marginRight: 10 }}
                            />
                            <View style={{ flex: 1 }}>
                                <Text style={s.debtName}>{debt.name}</Text>
                                <Text style={s.debtType}>
                                    {debt.type === 'credit' ? 'Tarjeta de crédito' :
                                     debt.type === 'loan' ? 'Préstamo bancario' :
                                     debt.type === 'installment' ? 'Visacuota / Cuotas' : 'Otra deuda'}
                                </Text>
                            </View>
                        </View>
                        <View style={{ alignItems: 'flex-end', flexShrink: 0 }}>
                            <Text style={s.debtAmount}>{formatMoney(amt(debt.monthlyPayment), data.currency)}/mes</Text>
                            <TouchableOpacity
                                onPress={() => removeDebt(debt.id)}
                                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                                accessibilityRole="button"
                                accessibilityLabel={`Quitar deuda ${debt.name}`}
                            >
                                <Ionicons name="trash-outline" size={16} color={C.danger} />
                            </TouchableOpacity>
                        </View>
                    </GlassCard>
                ))}

                {/* Resumen total */}
                {data.activeDebtsList.length > 0 && (
                    <View style={s.debtTotal}>
                        <Text style={s.debtTotalLbl}>TOTAL MENSUAL EN DEUDAS</Text>
                        <Money
                            amount={amt(data.activeDebts)}
                            currency={data.currency}
                            size="md"
                            tone="expense"
                            sign="never"
                            align="center"
                            containerStyle={s.debtTotalValWrap}
                        />
                        {amt(data.activeDebts) > amt(data.monthlyIncome) * 0.3 && (
                            <InlineNotice
                                variant="warning"
                                style={{ marginTop: 10, alignSelf: 'stretch' }}
                                text="Superas el 30% de tu ingreso en deudas. Zona de alerta."
                            />
                        )}
                    </View>
                )}

                {/* Formulario para agregar deuda */}
                {showDebtForm ? (
                    <GlassCard radius={14} blur={false} style={s.debtForm} contentStyle={s.debtFormContent}>
                        <Text style={s.debtFormTitle}>Nueva Deuda</Text>

                        <Text style={s.debtFormLbl}>NOMBRE DE LA DEUDA</Text>
                        <TextInput
                            style={s.debtInput}
                            value={newDebtName}
                            onChangeText={setNewDebtName}
                            placeholder="Ej: Visa BAC, Préstamo Banrural..."
                            placeholderTextColor={C.textMuted}
                            autoFocus
                        />

                        <Text style={s.debtFormLbl}>TIPO DE DEUDA</Text>
                        <View style={s.debtTypeRow}>
                            {([['credit', 'card-outline', 'Tarjeta'], ['loan', 'cash-outline', 'Préstamo'], ['installment', 'receipt-outline', 'Visacuota'], ['other', 'help-circle-outline', 'Otra']] as [DebtEntry['type'], any, string][]).map(([type, icon, label]) => (
                                <TouchableOpacity
                                    key={type}
                                    style={[s.debtTypeBtn, newDebtType === type && s.chipActive]}
                                    onPress={() => setNewDebtType(type)}
                                >
                                    {newDebtType !== type && <GlassBackground radius={10} blur={false} />}
                                    <Ionicons name={icon} size={16} color={newDebtType === type ? C.primaryLight : C.textSub} />
                                    <Text style={[s.debtTypeTxt, newDebtType === type && { color: C.primaryLight }]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={s.debtFormLbl}>CUOTA MENSUAL</Text>
                        <StyledInput
                            value={newDebtMonthly}
                            onChangeText={setNewDebtMonthly}
                            placeholder="0.00"
                            keyboardType="decimal-pad"
                            prefix={data.currency}
                        />

                        <View style={s.debtFormBtns}>
                            <GlassButton label="Cancelar" kind="secondary" onPress={() => setShowDebtForm(false)} style={{ flex: 1 }} />
                            <GlassButton
                                label="Agregar"
                                icon="checkmark"
                                onPress={addDebt}
                                disabled={!newDebtName.trim() || !newDebtMonthly.trim()}
                                style={{ flex: 2 }}
                            />
                        </View>
                    </GlassCard>
                ) : (
                    <GlassButton
                        label="Agregar deuda"
                        icon="add-circle-outline"
                        kind="secondary"
                        onPress={() => setShowDebtForm(true)}
                        style={{ marginTop: 14 }}
                    />
                )}

                {data.activeDebtsList.length === 0 && !showDebtForm && (
                    <GlassButton
                        label="No tengo deudas"
                        icon="thumbs-up-outline"
                        kind="secondary"
                        onPress={() => setData(d => ({ ...d, activeDebts: "0" }))}
                        style={{ marginTop: 10 }}
                    />
                )}
                {kbSpacer}
            </ScrollView>
        </AnimatedCard>,

        // PASO 6 — Meta de ahorro
        <AnimatedCard key={6} direction={dir}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.stepHeader}>
                    <View style={[s.stepIcon, { backgroundColor: C.accent + "22" }]}>
                        <Ionicons name="trending-up-outline" size={28} color={C.accent} />
                    </View>
                    <Text style={s.stepTitle}>¿Cuánto querés ahorrar al mes?</Text>
                    <Text style={s.stepSubtitle}>
                        Los expertos recomiendan mínimo el 20% de tu ingreso. Con {data.monthlyIncome ? `${data.currency} ${data.monthlyIncome}` : 'tu ingreso'}, eso sería {data.currency} {data.monthlyIncome ? (amt(data.monthlyIncome) * 0.20).toFixed(0) : "0"} al mes.{"\n\n"}
                        "Págate a ti mismo primero." — El Hombre Más Rico de Babilonia
                    </Text>
                </View>
                <StyledInput value={data.monthlySavings} onChangeText={v => setData(d => ({ ...d, monthlySavings: v }))} placeholder="0.00" keyboardType="decimal-pad" prefix="Q" autoFocus />
                {kbSpacer}
            </ScrollView>
        </AnimatedCard>,

        // PASO 7 — Bancos + Ahorros
        <AnimatedCard key={7} direction={dir}>
            <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                <View style={s.stepHeader}>
                    <View style={s.stepIcon}>
                        <Ionicons name="business-outline" size={28} color={C.primaryLight} />
                    </View>
                    <Text style={s.stepTitle}>¿Qué bancos usás?</Text>
                    <Text style={s.stepSubtitle}>Seleccioná los bancos de los que querés detectar SMS automáticamente.</Text>
                </View>
                <View style={s.bankGrid}>
                    {BANKS.map(bank => {
                        const active = data.preferredBanks.includes(bank);
                        return (
                            <TouchableOpacity key={bank} style={[s.bankBtn, active && s.chipActive]} onPress={() => toggleBank(bank)}>
                                {!active && <GlassBackground radius={10} blur={false} />}
                                <Ionicons name="business-outline" size={14} color={active ? C.primaryLight : C.textSub} style={{ marginRight: 6 }} />
                                <Text style={[s.bankTxt, active && { color: C.primaryLight }]}>{bank}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </View>
                <Text style={[s.hint, { marginTop: 16 }]}>¿Tenés ahorros en el banco actualmente?</Text>
                <StyledInput value={data.externalSavings} onChangeText={v => setData(d => ({ ...d, externalSavings: v }))} placeholder="0.00" keyboardType="decimal-pad" prefix="Q" />
                {kbSpacer}
            </ScrollView>
        </AnimatedCard>,
    ];

    return (
        <KeyboardAvoidingView
            style={{ flex: 1, backgroundColor: C.bg }}
            behavior="padding"
            keyboardVerticalOffset={0}
        >
            <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
                <View style={[s.container, { paddingTop: insets.top + 12, paddingBottom: kb > 0 ? 16 : insets.bottom + 16 }]}>

                    {/* HEADER */}
                    <View style={s.header}>
                        <View style={s.cfoTag}>
                            <Ionicons name="shield-checkmark-outline" size={14} color={C.primaryLight} />
                            <Text style={s.cfoTxt}>CFO SETUP</Text>
                        </View>
                        <ProgressBar current={step} total={TOTAL_STEPS} />
                    </View>

                    {/* CONTENIDO */}
                    <View style={s.content}>
                        {steps[step]}
                    </View>

                    {/* BOTONES */}
                    <View style={s.footer}>
                        {step > 0 && (
                            <GlassButton label="Atrás" icon="arrow-back" kind="secondary" onPress={goBack} style={s.backBtn} />
                        )}
                        <GlassButton
                            label={step === TOTAL_STEPS - 1 ? "¡Comenzar!" : "Continuar"}
                            icon={step === TOTAL_STEPS - 1 ? "rocket-outline" : "arrow-forward"}
                            onPress={goNext}
                            disabled={!canContinue()}
                            style={s.nextBtn}
                        />
                    </View>

                </View>
            </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
    header: { marginBottom: 4 },
    cfoTag: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14, alignSelf: "flex-start", backgroundColor: C.glassActive, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.glassActiveBorder },
    cfoTxt: { color: C.primaryLight, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
    content: { flex: 1 },
    stepHeader: { marginBottom: 20 },
    stepIcon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 1, borderColor: C.glassBorder, backgroundColor: C.glassActive },
    stepTitle: { color: C.textPrimary, fontSize: 24, fontWeight: "900", marginBottom: 10, lineHeight: 30 },
    stepSubtitle: { color: C.textSub, fontSize: 14, lineHeight: 22 },
    hint: { color: C.textSub, fontSize: 12, marginTop: 10, lineHeight: 18 },
    currencyRow: { flexDirection: "row", gap: 10, marginBottom: 4 },
    currBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: "transparent", overflow: "hidden" },
    currTxt: { color: C.textSub, fontSize: 16, fontWeight: "900" },
    // Chip seleccionado (moneda, banco, tipo de deuda)
    chipActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    bankGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    bankBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: "transparent", overflow: "hidden" },
    bankTxt: { color: C.textSub, fontSize: 13, fontWeight: "700" },
    footer: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12 },
    backBtn: { paddingHorizontal: 16 },
    nextBtn: { flex: 1 },

    // Estilos del sistema de deudas
    noDebtBox: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 16, backgroundColor: C.income + '11', borderRadius: 12, borderWidth: 1, borderColor: C.income + '33', marginTop: 8 },
    noDebtTxt: { color: C.income, fontSize: 14, fontWeight: '700', flex: 1 },
    debtCard: { marginTop: 10 },
    debtCardContent: { flexDirection: 'row', alignItems: 'center', padding: 14, justifyContent: 'space-between', gap: 8 },
    debtCardLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
    debtName: { color: C.text, fontSize: 14, fontWeight: '700' },
    debtType: { color: C.textSub, fontSize: 11, marginTop: 2 },
    debtAmount: { color: C.danger, fontSize: 13, fontWeight: '800' },
    debtTotal: { marginTop: 14, padding: 14, backgroundColor: C.danger + '11', borderRadius: 12, borderWidth: 1, borderColor: C.danger + '33', alignItems: 'center' },
    debtTotalLbl: { color: C.textSub, fontSize: 10, fontWeight: '800', letterSpacing: 1 },
    debtTotalValWrap: { alignSelf: 'stretch', marginTop: 4 },
    debtForm: { marginTop: 14 },
    debtFormContent: { padding: 16 },
    debtFormTitle: { color: C.textPrimary, fontSize: 15, fontWeight: '900', marginBottom: 12 },
    debtFormLbl: { color: C.textSub, fontSize: 10, fontWeight: '800', letterSpacing: 1, marginTop: 12, marginBottom: 4 },
    debtInput: { backgroundColor: C.glassInput, borderRadius: 10, borderWidth: 1.5, borderColor: C.glassInputBorder, padding: 12, color: C.text, fontSize: 14, fontWeight: '600' },
    debtTypeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 },
    debtTypeBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 10, borderWidth: 1, borderColor: 'transparent', overflow: 'hidden' },
    debtTypeTxt: { color: C.textSub, fontSize: 11, fontWeight: '700' },
    debtFormBtns: { flexDirection: 'row', gap: 10, marginTop: 14 },
});
