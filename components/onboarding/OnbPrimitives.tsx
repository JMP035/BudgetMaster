// Piezas compartidas del onboarding: campos con scroll al teclado, chips, opciones, barra de progreso,
// encabezado de paso y helpers de período. Los pasos son componentes controlados {draft, onChange}:
// la persistencia vive en OnboardingScreen.
import { Ionicons } from "@expo/vector-icons";
import React, { createContext, useContext, useEffect, useRef } from "react";
import {
    Animated, Easing, Keyboard, KeyboardTypeOptions, StyleProp, StyleSheet, Switch, Text, TextInput,
    TouchableOpacity, View, ViewStyle,
} from "react-native";
import { fixedCycleConfig, periodFor } from "../../services/FixedCycle";
import { formatPeriodRange } from "../../services/BudgetBreakdown";
import type { OnboardingDraft } from "../../services/OnboardingPlan";
import { DEFAULT_SETTINGS, getCurrentFinancialPeriod } from "../../services/storage";
import type { UserSettings } from "../../services/storage";
import { C } from "../../theme";
import { GlassBackground } from "../GlassCard";

type IoniconName = keyof typeof Ionicons.glyphMap;

// ─────────────────────────────────────────────────────────────
// TIPOS COMPARTIDOS
// ─────────────────────────────────────────────────────────────
export type DraftPatch = Partial<OnboardingDraft> | ((d: OnboardingDraft) => Partial<OnboardingDraft>);
export type OnChange = (patch: DraftPatch) => void;

export interface StepProps {
    draft: OnboardingDraft;
    onChange: OnChange;
}

/** Tipo de cambio que muestra el onboarding (el de hoy, o el último conocido si no hay red). */
export interface RateInfo {
    rate: number;
    source: string;
    offline: boolean;
}

// ─────────────────────────────────────────────────────────────
// SCROLL AL CAMPO ENFOCADO (patrón de SettingsScreen)
// ─────────────────────────────────────────────────────────────
export interface FieldCtx {
    /** El campo recibió foco: la pantalla guarda su posición y, con el teclado abierto, hace scroll. */
    onFocusField: (node: View | null) => void;
    onBlurField: () => void;
    /** Lleva un bloque (p. ej. un formulario en línea que acaba de abrirse) a la parte alta de la vista. */
    reveal: (node: View | null) => void;
}

export const FieldContext = createContext<FieldCtx>({
    onFocusField: () => { },
    onBlurField: () => { },
    reveal: () => { },
});

// ─────────────────────────────────────────────────────────────
// PERÍODOS (helpers compartidos por P3, gastos fijos y cierre)
// ─────────────────────────────────────────────────────────────
/** Ajustes de ciclo a partir del borrador, siempre con valores numéricos válidos. */
export function cycleSettingsOf(d: OnboardingDraft): Pick<UserSettings, "paymentCycle" | "paymentDay" | "paymentDays"> {
    const day = parseInt(d.paymentDay, 10);
    const a = parseInt(d.payDay1, 10);
    const b = parseInt(d.payDay2, 10);
    return {
        paymentCycle: d.paymentCycle,
        paymentDay: Number.isFinite(day) && day >= 1 && day <= 31 ? day : 1,
        paymentDays: Number.isFinite(a) && Number.isFinite(b) ? [a, b].sort((x, y) => x - y) : [15, 30],
    };
}

/** Rango del período de presupuesto y del período de gastos fijos de hoy, ya formateados («27 oct – 26 nov»). */
export function periodRanges(d: OnboardingDraft, now: Date = new Date()): { budget: string; fixed: string } {
    const cs = cycleSettingsOf(d);
    const fin = getCurrentFinancialPeriod({ ...DEFAULT_SETTINGS, ...cs });
    const fx = periodFor(fixedCycleConfig(cs), now);
    return {
        budget: formatPeriodRange({ start: fin.start, end: fin.end }),
        fixed: formatPeriodRange(fx),
    };
}

// ─────────────────────────────────────────────────────────────
// BARRA DE PROGRESO
// ─────────────────────────────────────────────────────────────
export function ProgressBar({ current, total, label }: { current: number; total: number; label?: string }) {
    const pct = total > 0 ? Math.min(100, ((current + 1) / total) * 100) : 0;
    const anim = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.timing(anim, { toValue: pct, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: false }).start();
    }, [pct, anim]);

    const barW = anim.interpolate({ inputRange: [0, 100], outputRange: ["0%", "100%"] });

    return (
        <View style={p.wrap}>
            <View style={p.track}>
                <Animated.View style={[p.fill, { width: barW }]}>
                    <View style={p.glow} />
                </Animated.View>
            </View>
            {!!label && <Text style={p.label}>{label}</Text>}
        </View>
    );
}

const p = StyleSheet.create({
    wrap: { width: "100%", marginBottom: 20 },
    track: { height: 3, backgroundColor: C.glassInput, borderRadius: 2, overflow: "hidden", marginBottom: 6 },
    fill: { height: "100%", backgroundColor: C.primary, borderRadius: 2 },
    glow: { position: "absolute", right: 0, top: -3, width: 16, height: 9, backgroundColor: C.primaryGlow, borderRadius: 4, opacity: 0.9 },
    label: { color: C.textSub, fontSize: 11, letterSpacing: 1, textAlign: "right" },
});

// ─────────────────────────────────────────────────────────────
// OPCIÓN SELECCIONABLE (tarjeta grande)
// ─────────────────────────────────────────────────────────────
export function OptionBtn({ label, selected, onPress, icon, desc }: {
    label: string; selected: boolean; onPress: () => void; icon?: IoniconName; desc?: string;
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
                accessibilityRole="radio"
                accessibilityState={{ selected }}
                accessibilityLabel={desc ? `${label}. ${desc}` : label}
            >
                {!selected && <GlassBackground radius={14} blur={false} />}
                {!!icon && <Ionicons name={icon} size={22} color={selected ? C.primaryLight : C.textSub} style={{ marginRight: 12 }} />}
                <View style={{ flex: 1, flexShrink: 1 }}>
                    <Text style={[o.label, selected && { color: C.primaryLight }]}>{label}</Text>
                    {!!desc && <Text style={o.desc}>{desc}</Text>}
                </View>
                {selected && <Ionicons name="checkmark-circle" size={22} color={C.primary} style={{ marginLeft: 8 }} />}
            </TouchableOpacity>
        </Animated.View>
    );
}

const o = StyleSheet.create({
    btn: { flexDirection: "row", alignItems: "center", borderRadius: 14, borderWidth: 1, borderColor: "transparent", paddingHorizontal: 16, paddingVertical: 14, marginBottom: 10, overflow: "hidden", minHeight: 56 },
    btnActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    label: { color: C.textSub, fontSize: 15, fontWeight: "700" },
    desc: { color: C.textSub, fontSize: 12, marginTop: 3 },
});

// ─────────────────────────────────────────────────────────────
// CHIP
// ─────────────────────────────────────────────────────────────
export function Chip({ label, selected, onPress, icon, disabled, style }: {
    label: string; selected?: boolean; onPress: () => void; icon?: IoniconName; disabled?: boolean;
    style?: StyleProp<ViewStyle>;
}) {
    const active = !!selected;
    return (
        <TouchableOpacity
            onPress={onPress}
            disabled={disabled}
            activeOpacity={0.8}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityState={{ selected: active, disabled: !!disabled }}
            style={[c.chip, active && c.chipActive, disabled && { opacity: 0.5 }, style]}
        >
            {!active && <GlassBackground radius={10} blur={false} />}
            {!!icon && <Ionicons name={icon} size={14} color={active ? C.primaryLight : C.textSub} />}
            <Text style={[c.txt, active && { color: C.primaryLight }]}>{label}</Text>
        </TouchableOpacity>
    );
}

const c = StyleSheet.create({
    chip: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 9, minHeight: 40, borderRadius: 10, borderWidth: 1, borderColor: "transparent", overflow: "hidden", maxWidth: "100%" },
    chipActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    txt: { color: C.textSub, fontSize: 13, fontWeight: "700", flexShrink: 1 },
});

/** Fila de chips que se acomoda en varias líneas (nunca ancho fijo). */
export function ChipRow({ children, style }: { children: React.ReactNode; style?: StyleProp<ViewStyle> }) {
    return <View style={[{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }, style]}>{children}</View>;
}

// ─────────────────────────────────────────────────────────────
// INPUT ESTILIZADO
// ─────────────────────────────────────────────────────────────
export function StyledInput({
    value, onChangeText, placeholder, keyboardType, prefix, suffix, autoFocus = false,
    autoCapitalize, autoCorrect, secureTextEntry, right, maxLength, style, accessibilityLabel,
}: {
    value: string; onChangeText: (t: string) => void; placeholder: string;
    keyboardType?: KeyboardTypeOptions; prefix?: string; suffix?: string; autoFocus?: boolean;
    autoCapitalize?: "none" | "sentences" | "words" | "characters"; autoCorrect?: boolean;
    secureTextEntry?: boolean; right?: React.ReactNode; maxLength?: number;
    style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
    const ctx = useContext(FieldContext);
    const wrapRef = useRef<View>(null);
    return (
        <View ref={wrapRef} collapsable={false} style={[i.row, style]}>
            {!!prefix && <Text style={i.fix}>{prefix}</Text>}
            <TextInput
                style={i.input}
                value={value}
                onChangeText={onChangeText}
                placeholder={placeholder}
                placeholderTextColor={C.textMuted}
                keyboardType={keyboardType ?? "default"}
                autoFocus={autoFocus}
                autoCapitalize={autoCapitalize}
                autoCorrect={autoCorrect}
                secureTextEntry={secureTextEntry}
                maxLength={maxLength}
                accessibilityLabel={accessibilityLabel ?? placeholder}
                returnKeyType="done"
                onSubmitEditing={() => Keyboard.dismiss()}
                onFocus={() => ctx.onFocusField(wrapRef.current)}
                onBlur={ctx.onBlurField}
            />
            {!!suffix && <Text style={i.fix}>{suffix}</Text>}
            {right}
        </View>
    );
}

const i = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderRadius: 14, borderWidth: 1.5, borderColor: C.glassActiveBorder, paddingHorizontal: 16, paddingVertical: 12, marginTop: 10 },
    input: { flex: 1, minWidth: 0, color: C.text, fontSize: 18, fontWeight: "700", paddingVertical: 2 },
    fix: { color: C.textSub, fontSize: 16, fontWeight: "700", marginHorizontal: 6 },
});

// ─────────────────────────────────────────────────────────────
// INTERRUPTOR CON TEXTO
// ─────────────────────────────────────────────────────────────
export function ToggleRow({ label, description, value, onValueChange, disabled, style }: {
    label: string; description?: string; value: boolean; onValueChange: (v: boolean) => void;
    disabled?: boolean; style?: StyleProp<ViewStyle>;
}) {
    return (
        <View style={[t.row, style]}>
            <View style={{ flex: 1, flexShrink: 1 }}>
                <Text style={t.label}>{label}</Text>
                {!!description && <Text style={t.desc}>{description}</Text>}
            </View>
            <Switch
                value={value}
                onValueChange={onValueChange}
                disabled={disabled}
                accessibilityLabel={label}
                trackColor={{ false: C.bgDeep, true: C.accent }}
                thumbColor={C.text}
                style={{ marginLeft: 12 }}
            />
        </View>
    );
}

const t = StyleSheet.create({
    row: { flexDirection: "row", alignItems: "center", marginTop: 14 },
    label: { color: C.text, fontSize: 14, fontWeight: "700", lineHeight: 20 },
    desc: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 2 },
});

// ─────────────────────────────────────────────────────────────
// ENCABEZADO DE PASO
// ─────────────────────────────────────────────────────────────
export function StepHeader({ icon, iconColor = C.primaryLight, title, subtitle }: {
    icon: IoniconName; iconColor?: string; title: string; subtitle?: string;
}) {
    return (
        <View style={ps.stepHeader}>
            <View style={ps.stepIcon}>
                <Ionicons name={icon} size={28} color={iconColor} />
            </View>
            <Text style={ps.stepTitle} accessibilityRole="header">{title}</Text>
            {!!subtitle && <Text style={ps.stepSubtitle}>{subtitle}</Text>}
        </View>
    );
}

/** Estilos de texto compartidos por los pasos. */
export const ps = StyleSheet.create({
    stepHeader: { marginBottom: 18 },
    stepIcon: { width: 56, height: 56, borderRadius: 18, alignItems: "center", justifyContent: "center", marginBottom: 14, borderWidth: 1, borderColor: C.glassBorder, backgroundColor: C.glassActive },
    stepTitle: { color: C.textPrimary, fontSize: 24, fontWeight: "900", marginBottom: 8, lineHeight: 30 },
    stepSubtitle: { color: C.textSub, fontSize: 14, lineHeight: 21 },
    label: { color: C.textSub, fontSize: 11, fontWeight: "800", letterSpacing: 1, marginTop: 16, textTransform: "uppercase" },
    hint: { color: C.textSub, fontSize: 12, lineHeight: 18, marginTop: 10 },
    notice: { marginTop: 12 },
    cardContent: { padding: 16 },
    rowBetween: { flexDirection: "row", alignItems: "center", gap: 10 },
    itemName: { color: C.text, fontSize: 14, fontWeight: "700" },
    itemSub: { color: C.textSub, fontSize: 11, marginTop: 2 },
    emptyBox: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, marginTop: 8 },
    emptyTxt: { color: C.textSub, fontSize: 13, flex: 1, flexShrink: 1 },
    trash: { padding: 8 },
    link: { color: C.primaryLight, fontSize: 14, fontWeight: "800", textAlign: "center", paddingVertical: 12 },
});
