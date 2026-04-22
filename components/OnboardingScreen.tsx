import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
    Animated, Dimensions, Easing, KeyboardAvoidingView,
    Platform, StyleSheet, Text, TextInput,
    TouchableOpacity, View
} from "react-native";
import { Currency, PaymentCycle, UserSettings } from "../services/storage";
import { C, shadow } from "../theme";

const { width } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
interface OnboardingData {
    name: string;
    monthlyIncome: string;
    paymentCycle: PaymentCycle;
    paymentDay: string;
    paymentDays: string;
    biggestExpense: string;
    activeDebts: string;
    monthlySavings: string;
    preferredBanks: string[];
    externalSavings: string;
    currency: Currency;
}

interface Props {
    onComplete: (data: OnboardingData) => void;
}

// ─────────────────────────────────────────────────────────────
// BANCOS DISPONIBLES
// ─────────────────────────────────────────────────────────────
const BANKS = ["BAC", "BANRURAL", "GTC", "BANTRAB", "PROMERICA", "BI", "CHASE", "OTRO"];

// ─────────────────────────────────────────────────────────────
// INDICADOR DE PROGRESO
// ─────────────────────────────────────────────────────────────
function ProgressBar({ current, total }: { current: number; total: number }) {
    const pct = ((current + 1) / total) * 100;
    const anim = useRef(new Animated.Value(0)).current;

    React.useEffect(() => {
        Animated.timing(anim, {
            toValue: pct,
            duration: 400,
            easing: Easing.out(Easing.quad),
            useNativeDriver: false,
        }).start();
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
    wrap: { width: "100%", marginBottom: 32 },
    track: { height: 3, backgroundColor: C.card, borderRadius: 2, overflow: "hidden", marginBottom: 8 },
    fill: { height: "100%", backgroundColor: C.primary, borderRadius: 2 },
    glow: { position: "absolute", right: 0, top: -3, width: 16, height: 9, backgroundColor: C.primaryGlow, borderRadius: 4, opacity: 0.9 },
    label: { color: C.textMuted, fontSize: 11, letterSpacing: 1, textAlign: "right" },
});

// ─────────────────────────────────────────────────────────────
// ANIMACIÓN DE ENTRADA DE CARD
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
// SELECTOR DE OPCIÓN
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
            <TouchableOpacity
                style={[o.btn, selected && o.btnActive]}
                onPress={handlePress}
                activeOpacity={0.8}
            >
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
    btn: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, padding: 16, marginBottom: 10 },
    btnActive: { borderColor: C.primary, borderTopColor: C.primaryLight, backgroundColor: C.primaryDark + "33", ...shadow(C.primaryGlow, 6, 0.3) },
    label: { color: C.textSub, fontSize: 15, fontWeight: "700" },
    desc: { color: C.textMuted, fontSize: 12, marginTop: 3 },
});

// ─────────────────────────────────────────────────────────────
// INPUT ESTILIZADO
// ─────────────────────────────────────────────────────────────
function StyledInput({ value, onChangeText, placeholder, keyboardType, prefix, suffix }: {
    value: string; onChangeText: (t: string) => void; placeholder: string;
    keyboardType?: any; prefix?: string; suffix?: string;
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
                autoFocus
            />
            {suffix && <Text style={i.fix}>{suffix}</Text>}
        </View>
    );
}

const i = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", backgroundColor: C.bgDeep, borderRadius: 14, borderWidth: 1.5, borderColor: C.primary + "55", paddingHorizontal: 16, paddingVertical: 14, marginTop: 12 },
    input: { flex: 1, color: C.text, fontSize: 18, fontWeight: "700" },
    fix: { color: C.textMuted, fontSize: 16, fontWeight: "700", marginHorizontal: 6 },
});

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function OnboardingScreen({ onComplete }: Props) {
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
        monthlySavings: "",
        preferredBanks: [],
        externalSavings: "0",
        currency: "Q",
    });

    const TOTAL_STEPS = 8;

    const goNext = () => {
        if (step < TOTAL_STEPS - 1) { setDir(1); setStep(s => s + 1); }
        else handleFinish();
    };

    const goBack = () => {
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

    const canContinue = (): boolean => {
        switch (step) {
            case 0: return data.name.trim().length > 0;
            case 1: return data.monthlyIncome.trim().length > 0;
            default: return true;
        }
    };

    // ── STEPS ─────────────────────────────────────────────────
    const steps = [

        // PASO 0 — Bienvenida + Nombre
        <AnimatedCard key={0} direction={dir}>
            <View style={s.stepHeader}>
                <View style={[s.stepIcon, { backgroundColor: C.primary + "22" }]}>
                    <Ionicons name="person-outline" size={28} color={C.primaryLight} />
                </View>
                <Text style={s.stepTitle}>¡Bienvenido a BudgetMaster!</Text>
                <Text style={s.stepSubtitle}>
                    Soy tu CFO personal. En los próximos pasos voy a conocer tu realidad financiera para darte consejos precisos y reales.{"\n\n"}
                    Comencemos con lo básico. ¿Cómo te llamas?
                </Text>
            </View>
            <StyledInput
                value={data.name}
                onChangeText={v => setData(d => ({ ...d, name: v }))}
                placeholder="Tu nombre..."
            />
        </AnimatedCard>,

        // PASO 1 — Ingreso mensual + Moneda
        <AnimatedCard key={1} direction={dir}>
            <View style={s.stepHeader}>
                <View style={[s.stepIcon, { backgroundColor: C.income + "22" }]}>
                    <Ionicons name="cash-outline" size={28} color={C.income} />
                </View>
                <Text style={s.stepTitle}>¿Cuánto ganás al mes?</Text>
                <Text style={s.stepSubtitle}>
                    Esta es la base de todo análisis financiero. No tiene que ser exacto — un aproximado es suficiente para que pueda proyectar tu situación.
                </Text>
            </View>
            <View style={s.currencyRow}>
                {(["Q", "USD"] as Currency[]).map(cur => (
                    <TouchableOpacity
                        key={cur}
                        style={[s.currBtn, data.currency === cur && s.currBtnActive]}
                        onPress={() => setData(d => ({ ...d, currency: cur }))}
                    >
                        <Text style={[s.currTxt, data.currency === cur && { color: C.primaryLight }]}>{cur}</Text>
                    </TouchableOpacity>
                ))}
            </View>
            <StyledInput
                value={data.monthlyIncome}
                onChangeText={v => setData(d => ({ ...d, monthlyIncome: v }))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                prefix={data.currency}
            />
        </AnimatedCard>,

        // PASO 2 — Ciclo de pago
        <AnimatedCard key={2} direction={dir}>
            <View style={s.stepHeader}>
                <View style={[s.stepIcon, { backgroundColor: "#4A9EE822" }]}>
                    <Ionicons name="calendar-outline" size={28} color="#4A9EE8" />
                </View>
                <Text style={s.stepTitle}>¿Cada cuándo te pagan?</Text>
                <Text style={s.stepSubtitle}>
                    Esto me permite calcular cuántos días te quedan hasta tu próximo ingreso y proyectar si tu dinero alcanzará.
                </Text>
            </View>
            <OptionBtn label="Mensual" icon="calendar-outline" desc="Me pagan una vez al mes" selected={data.paymentCycle === "monthly"} onPress={() => setData(d => ({ ...d, paymentCycle: "monthly" }))} />
            <OptionBtn label="Quincenal" icon="git-branch-outline" desc="Me pagan los días 15 y 30" selected={data.paymentCycle === "biweekly"} onPress={() => setData(d => ({ ...d, paymentCycle: "biweekly" }))} />
            <OptionBtn label="Semanal" icon="refresh-outline" desc="Me pagan cada semana" selected={data.paymentCycle === "weekly"} onPress={() => setData(d => ({ ...d, paymentCycle: "weekly" }))} />
            <OptionBtn label="Irregular" icon="shuffle-outline" desc="Freelance o negocio propio — ingresos variables" selected={data.paymentCycle === "irregular"} onPress={() => setData(d => ({ ...d, paymentCycle: "irregular" }))} />
        </AnimatedCard>,

        // PASO 3 — Día de pago (solo si es mensual)
        <AnimatedCard key={3} direction={dir}>
            <View style={s.stepHeader}>
                <View style={[s.stepIcon, { backgroundColor: C.primary + "22" }]}>
                    <Ionicons name="today-outline" size={28} color={C.primaryLight} />
                </View>
                <Text style={s.stepTitle}>
                    {data.paymentCycle === "biweekly" ? "¿Qué días te depositan?" : "¿Qué día del mes te pagan?"}
                </Text>
                <Text style={s.stepSubtitle}>
                    {data.paymentCycle === "biweekly"
                        ? "Ingresa los dos días separados por coma. Ej: 15,30"
                        : data.paymentCycle === "weekly"
                            ? "¿Qué día de la semana? (1=Lunes, 7=Domingo)"
                            : data.paymentCycle === "irregular"
                                ? "¿Cuándo fue tu último ingreso? (día del mes)"
                                : "Ingresa el día del mes en que recibes tu salario. Ej: 25, 30, 1"}
                </Text>
            </View>
            <StyledInput
                value={data.paymentCycle === "biweekly" ? data.paymentDays : data.paymentDay}
                onChangeText={v => data.paymentCycle === "biweekly"
                    ? setData(d => ({ ...d, paymentDays: v }))
                    : setData(d => ({ ...d, paymentDay: v }))
                }
                placeholder={data.paymentCycle === "biweekly" ? "15,30" : "30"}
                keyboardType="numeric"
                suffix="del mes"
            />
        </AnimatedCard>,

        // PASO 4 — Mayor gasto fijo
        <AnimatedCard key={4} direction={dir}>
            <View style={s.stepHeader}>
                <View style={[s.stepIcon, { backgroundColor: C.expense + "22" }]}>
                    <Ionicons name="home-outline" size={28} color={C.expense} />
                </View>
                <Text style={s.stepTitle}>¿Cuál es tu mayor gasto fijo?</Text>
                <Text style={s.stepSubtitle}>
                    Renta, hipoteca, cuota de préstamo... El gasto que sabés que viene sí o sí cada mes. Esto me ayuda a calcular tu margen real disponible.
                </Text>
            </View>
            <StyledInput
                value={data.biggestExpense}
                onChangeText={v => setData(d => ({ ...d, biggestExpense: v }))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                prefix="Q"
            />
            <Text style={s.hint}>Podés agregar todos tus gastos fijos en detalle después dentro de la app.</Text>
        </AnimatedCard>,

        // PASO 5 — Deudas activas
        <AnimatedCard key={5} direction={dir}>
            <View style={s.stepHeader}>
                <View style={[s.stepIcon, { backgroundColor: C.danger + "22" }]}>
                    <Ionicons name="alert-circle-outline" size={28} color={C.danger} />
                </View>
                <Text style={s.stepTitle}>¿Tenés deudas activas?</Text>
                <Text style={s.stepSubtitle}>
                    Tarjetas de crédito, préstamos, cuotas pendientes. El monto total aproximado que debés actualmente. Si no tenés, ingresá 0.{"\n\n"}
                    Kiyosaki lo dice claro: "La deuda no es el problema, no saber usarla sí lo es."
                </Text>
            </View>
            <StyledInput
                value={data.activeDebts}
                onChangeText={v => setData(d => ({ ...d, activeDebts: v }))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                prefix="Q"
            />
        </AnimatedCard>,

        // PASO 6 — Meta de ahorro mensual
        <AnimatedCard key={6} direction={dir}>
            <View style={s.stepHeader}>
                <View style={[s.stepIcon, { backgroundColor: C.accent + "22" }]}>
                    <Ionicons name="trending-up-outline" size={28} color={C.accent} />
                </View>
                <Text style={s.stepTitle}>¿Cuánto querés ahorrar al mes?</Text>
                <Text style={s.stepSubtitle}>
                    Los expertos recomiendan mínimo el 20% de tu ingreso. Con {data.monthlyIncome ? `Q${data.monthlyIncome}` : 'tu ingreso'} de ingreso, eso sería Q{data.monthlyIncome ? (parseFloat(data.monthlyIncome || "0") * 0.20).toFixed(0) : "0"} al mes.{"\n\n"}
                    "Págate a ti mismo primero." — El Hombre Más Rico de Babilonia
                </Text>
            </View>
            <StyledInput
                value={data.monthlySavings}
                onChangeText={v => setData(d => ({ ...d, monthlySavings: v }))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                prefix="Q"
            />
        </AnimatedCard>,

        // PASO 7 — Bancos + Ahorros externos
        <AnimatedCard key={7} direction={dir}>
            <View style={s.stepHeader}>
                <View style={[s.stepIcon, { backgroundColor: C.primary + "22" }]}>
                    <Ionicons name="business-outline" size={28} color={C.primaryLight} />
                </View>
                <Text style={s.stepTitle}>¿Qué bancos usás?</Text>
                <Text style={s.stepSubtitle}>
                    Seleccioná los bancos de los que querés que lea los SMS automáticamente. Podés seleccionar varios.
                </Text>
            </View>
            <View style={s.bankGrid}>
                {BANKS.map(bank => (
                    <TouchableOpacity
                        key={bank}
                        style={[s.bankBtn, data.preferredBanks.includes(bank) && s.bankBtnActive]}
                        onPress={() => toggleBank(bank)}
                    >
                        <Ionicons
                            name="business-outline"
                            size={14}
                            color={data.preferredBanks.includes(bank) ? C.primaryLight : C.textMuted}
                            style={{ marginRight: 6 }}
                        />
                        <Text style={[s.bankTxt, data.preferredBanks.includes(bank) && { color: C.primaryLight }]}>
                            {bank}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>
            <Text style={[s.hint, { marginTop: 16 }]}>¿Tenés ahorros en el banco actualmente?</Text>
            <StyledInput
                value={data.externalSavings}
                onChangeText={v => setData(d => ({ ...d, externalSavings: v }))}
                placeholder="0.00"
                keyboardType="decimal-pad"
                prefix="Q"
            />
        </AnimatedCard>,
    ];

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <View style={s.container}>

                {/* HEADER CFO */}
                <View style={s.header}>
                    <View style={s.cfoTag}>
                        <Ionicons name="shield-checkmark-outline" size={14} color={C.primaryLight} />
                        <Text style={s.cfoTxt}>CFO SETUP</Text>
                    </View>
                    <ProgressBar current={step} total={TOTAL_STEPS} />
                </View>

                {/* CONTENIDO DEL PASO */}
                <View style={s.content}>
                    {steps[step]}
                </View>

                {/* BOTONES */}
                <View style={s.footer}>
                    {step > 0 && (
                        <TouchableOpacity style={s.backBtn} onPress={goBack}>
                            <Ionicons name="arrow-back" size={20} color={C.textSub} />
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity
                        style={[s.nextBtn, !canContinue() && { opacity: 0.5 }]}
                        onPress={goNext}
                        disabled={!canContinue()}
                    >
                        <Text style={s.nextTxt}>
                            {step === TOTAL_STEPS - 1 ? "¡Comenzar!" : "Continuar"}
                        </Text>
                        <Ionicons
                            name={step === TOTAL_STEPS - 1 ? "rocket-outline" : "arrow-forward"}
                            size={20}
                            color="#1A0E00"
                            style={{ marginLeft: 8 }}
                        />
                    </TouchableOpacity>
                </View>

            </View>
        </KeyboardAvoidingView>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24, paddingTop: 56, paddingBottom: 24 },

    // Header
    header: { marginBottom: 8 },
    cfoTag: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 16, alignSelf: "flex-start", backgroundColor: C.primaryDark + "44", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.primary + "55" },
    cfoTxt: { color: C.primaryLight, fontSize: 11, fontWeight: "900", letterSpacing: 2 },

    // Step
    content: { flex: 1 },
    stepHeader: { marginBottom: 24 },
    stepIcon: { width: 60, height: 60, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder },
    stepTitle: { color: C.textPrimary, fontSize: 24, fontWeight: "900", marginBottom: 12, lineHeight: 30 },
    stepSubtitle: { color: C.textSub, fontSize: 14, lineHeight: 22 },
    hint: { color: C.textMuted, fontSize: 12, marginTop: 10, lineHeight: 18 },

    // Moneda
    currencyRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
    currBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
    currBtnActive: { borderColor: C.primary, backgroundColor: C.primaryDark + "33" },
    currTxt: { color: C.textSub, fontSize: 16, fontWeight: "900" },

    // Bancos
    bankGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    bankBtn: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
    bankBtnActive: { borderColor: C.primary, backgroundColor: C.primaryDark + "33", ...shadow(C.primaryGlow, 4, 0.3) },
    bankTxt: { color: C.textMuted, fontSize: 13, fontWeight: "700" },

    // Footer
    footer: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 16 },
    backBtn: { width: 52, height: 52, borderRadius: 16, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder, alignItems: "center", justifyContent: "center" },
    nextBtn: { flex: 1, flexDirection: "row", backgroundColor: C.primary, borderRadius: 16, paddingVertical: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.primaryLight, ...shadow(C.primaryGlow, 12, 0.5) },
    nextTxt: { color: "#1A0E00", fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
});