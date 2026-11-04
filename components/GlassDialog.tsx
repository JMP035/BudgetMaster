import React from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../theme";
import { GlassBackground, GlassCard } from "./GlassCard";
import { GradientText } from "./GradientText";

type IoniconName = keyof typeof Ionicons.glyphMap;

export type GlassDialogVariant = "info" | "success" | "warning" | "error";

export interface GlassDialogStat {
    icon: IoniconName;
    label: string;
    value: string | number;
    tone?: "default" | "positive" | "warning" | "muted";
}

export interface GlassDialogAction {
    label: string;
    onPress: () => void;
    kind?: "primary" | "secondary" | "destructive";
    icon?: IoniconName;
}

export interface GlassDialogProps {
    visible: boolean;
    onClose: () => void;
    variant?: GlassDialogVariant;
    icon?: IoniconName;
    title: string;
    message?: string;
    highlight?: { value: string; caption?: string };
    stats?: GlassDialogStat[];
    steps?: string[];
    footnote?: string;
    /** Máx 3. Si no se pasa: [{ label: 'Entendido', kind: 'primary', onPress: onClose }] */
    actions?: GlassDialogAction[];
    /** Default true */
    dismissOnBackdrop?: boolean;
}

const VARIANT_COLOR: Record<GlassDialogVariant, string> = {
    info: C.primaryLight,
    success: C.success,
    warning: C.warning,
    error: C.danger,
};

const VARIANT_ICON: Record<GlassDialogVariant, IoniconName> = {
    info: "information-circle-outline",
    success: "checkmark-circle-outline",
    warning: "alert-circle-outline",
    error: "close-circle-outline",
};

const STAT_TONE_COLOR: Record<NonNullable<GlassDialogStat["tone"]>, string> = {
    default: C.text,
    positive: C.income,
    warning: C.warning,
    muted: C.textMuted,
};

const BTN_MIN_HEIGHT = 46;
const BTN_GAP = 10;

export function GlassDialog({
    visible,
    onClose,
    variant = "info",
    icon,
    title,
    message,
    highlight,
    stats,
    steps,
    footnote,
    actions,
    dismissOnBackdrop = true,
}: GlassDialogProps) {
    const { width, height } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const color = VARIANT_COLOR[variant];
    const iconName = icon ?? VARIANT_ICON[variant];

    const list: GlassDialogAction[] = (actions && actions.length > 0
        ? actions.slice(0, 3)
        : [{ label: "Entendido", kind: "primary" as const, onPress: onClose }]);

    const stacked = width < 360 || list.length >= 3;
    const hasPrimary = list.some((a) => (a.kind ?? "secondary") === "primary");
    // apilado: primaria arriba; en fila: primaria a la derecha
    const ordered = [...list].sort((a, b) => {
        const pa = (a.kind ?? "secondary") === "primary" ? 1 : 0;
        const pb = (b.kind ?? "secondary") === "primary" ? 1 : 0;
        return stacked ? pb - pa : pa - pb;
    });

    const availableH = height - insets.top - insets.bottom - 48;
    const actionsH = stacked ? list.length * BTN_MIN_HEIGHT + (list.length - 1) * BTN_GAP : BTN_MIN_HEIGHT;
    const scrollMaxH = Math.max(120, Math.min(height * 0.82, availableH) - actionsH - 22 * 2 - 16);

    const visibleStats = stats ?? [];
    const visibleSteps = steps ?? [];

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={onClose}
        >
            <View
                style={[
                    s.overlay,
                    { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24, paddingHorizontal: 20 },
                ]}
            >
                <Pressable
                    style={StyleSheet.absoluteFill}
                    onPress={dismissOnBackdrop ? onClose : undefined}
                    accessible={false}
                />
                <GlassCard
                    radius={22}
                    blur={false}
                    style={s.card}
                    contentStyle={s.content}
                >
                    <View accessibilityViewIsModal>
                        <ScrollView
                            style={{ maxHeight: scrollMaxH, flexGrow: 0 }}
                            showsVerticalScrollIndicator={false}
                            bounces={false}
                            contentContainerStyle={s.scrollContent}
                        >
                            <View style={[s.iconWrap, { backgroundColor: color + "22", borderColor: color + "44" }]}>
                                <Ionicons name={iconName} size={22} color={color} />
                            </View>
                            <Text style={s.title} accessibilityRole="header">{title}</Text>
                            {!!message && <Text style={s.message}>{message}</Text>}

                            {highlight && (
                                <View style={s.highlightWrap}>
                                    <GradientText text={highlight.value} style={s.highlightValue} />
                                    {!!highlight.caption && <Text style={s.highlightCaption}>{highlight.caption}</Text>}
                                </View>
                            )}

                            {visibleStats.length > 0 && (
                                <View style={s.statsWrap}>
                                    {visibleStats.map((st, i) => {
                                        const tone = st.tone ?? "default";
                                        const toneColor = STAT_TONE_COLOR[tone];
                                        return (
                                            <View
                                                key={`${st.label}-${i}`}
                                                style={[s.statRow, i > 0 && s.statRowSep]}
                                            >
                                                <Ionicons
                                                    name={st.icon}
                                                    size={16}
                                                    color={tone === "default" ? C.textSub : toneColor}
                                                />
                                                <Text style={s.statLabel}>{st.label}</Text>
                                                <Text style={[s.statValue, { color: toneColor }]}>{String(st.value)}</Text>
                                            </View>
                                        );
                                    })}
                                </View>
                            )}

                            {visibleSteps.length > 0 && (
                                <View style={s.stepsWrap}>
                                    {visibleSteps.map((step, i) => (
                                        <View key={i} style={s.stepRow}>
                                            <View style={s.stepCircle}>
                                                <Text style={s.stepNum}>{i + 1}</Text>
                                            </View>
                                            <Text style={s.stepText}>{step}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {!!footnote && <Text style={s.footnote}>{footnote}</Text>}
                        </ScrollView>

                        <View style={[s.actions, stacked ? s.actionsStacked : s.actionsRow]}>
                            {ordered.map((a, i) => {
                                const kind = a.kind ?? "secondary";
                                const isPrimary = kind === "primary";
                                const textColor = isPrimary ? "#1A0E00" : kind === "destructive" ? C.danger : C.text;
                                const flexStyle = stacked
                                    ? s.btnStacked
                                    : hasPrimary && !isPrimary
                                        ? s.btnRowSide
                                        : s.btnRowGrow;
                                return (
                                    <Pressable
                                        key={`${a.label}-${i}`}
                                        accessibilityRole="button"
                                        accessibilityLabel={a.label}
                                        onPress={a.onPress}
                                        style={({ pressed }) => [
                                            s.btn,
                                            flexStyle,
                                            isPrimary && s.btnPrimary,
                                            kind === "destructive" && s.btnDestructive,
                                            pressed && s.btnPressed,
                                        ]}
                                    >
                                        {kind === "secondary" && <GlassBackground radius={12} blur={false} />}
                                        {!!a.icon && <Ionicons name={a.icon} size={16} color={textColor} />}
                                        <Text style={[s.btnTxt, { color: textColor }]} numberOfLines={2}>
                                            {a.label}
                                        </Text>
                                    </Pressable>
                                );
                            })}
                        </View>
                    </View>
                </GlassCard>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: C.overlayScrim, alignItems: "center", justifyContent: "center" },
    card: { width: "100%", maxWidth: 400, backgroundColor: C.cardHigh },
    content: { padding: 22 },
    scrollContent: { paddingBottom: 2 },
    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        borderWidth: 1,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 12,
    },
    title: { color: C.text, fontSize: 18, fontWeight: "900", marginBottom: 8 },
    message: { color: C.textSub, fontSize: 13, lineHeight: 19, marginBottom: 6 },
    highlightWrap: { alignItems: "center", marginTop: 8, marginBottom: 6 },
    highlightValue: { fontSize: 40, fontWeight: "900", textAlign: "center" },
    highlightCaption: { color: C.textSub, fontSize: 13, marginTop: 2, textAlign: "center" },
    statsWrap: { marginTop: 10 },
    statRow: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        paddingVertical: 9,
    },
    statRowSep: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: C.separator },
    statLabel: { color: C.textSub, fontSize: 13, lineHeight: 18, flexShrink: 1, flexGrow: 1, flexBasis: 0, minWidth: 120 },
    statValue: { fontSize: 15, fontWeight: "800", textAlign: "right" },
    stepsWrap: { marginTop: 10, gap: 10 },
    stepRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    stepCircle: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: C.primary + "22",
        borderWidth: 1,
        borderColor: C.primary + "44",
        alignItems: "center",
        justifyContent: "center",
    },
    stepNum: { color: C.primaryLight, fontSize: 12, fontWeight: "900" },
    stepText: { color: C.text, fontSize: 13, lineHeight: 19, flex: 1 },
    footnote: { color: C.textMuted, fontSize: 12, lineHeight: 18, marginTop: 14 },
    actions: { marginTop: 16 },
    actionsRow: { flexDirection: "row", gap: BTN_GAP },
    actionsStacked: { flexDirection: "column", gap: BTN_GAP },
    btn: {
        minHeight: BTN_MIN_HEIGHT,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 6,
        overflow: "hidden",
    },
    btnStacked: { alignSelf: "stretch" },
    btnRowGrow: { flex: 1 },
    btnRowSide: { flexShrink: 1 },
    btnPrimary: { backgroundColor: C.primary },
    btnDestructive: { borderWidth: 1, borderColor: C.danger + "66" },
    btnPressed: { opacity: 0.8 },
    btnTxt: { fontSize: 14, fontWeight: "900", textAlign: "center", flexShrink: 1 },
});

export default GlassDialog;
