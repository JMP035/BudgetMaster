import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated, AppState, BackHandler, Easing, Keyboard, KeyboardAvoidingView, Platform, ScrollView,
    StyleSheet, Text, TouchableOpacity, View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ExchangeRateService } from "../services/ExchangeRateService";
import {
    canContinueRequired, emptyDraft, needsUsd, optionalSteps, validateRate,
} from "../services/OnboardingPlan";
import type { OnboardingDraft, OnboardingPhase, OnboardingResult, OptionalStepId } from "../services/OnboardingPlan";
import { DEFAULT_SETTINGS, parseAmount, StorageService } from "../services/storage";
import { C } from "../theme";
import { GlassButton, GlassButtonGroup } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";
import FinishStep from "./onboarding/FinishStep";
import {
    DraftPatch, FieldContext, FieldCtx, ProgressBar, RateInfo,
} from "./onboarding/OnbPrimitives";
import SetupIntro from "./onboarding/SetupIntro";
import StepAccounts from "./onboarding/StepAccounts";
import StepCycle from "./onboarding/StepCycle";
import StepDebts from "./onboarding/StepDebts";
import StepFixed from "./onboarding/StepFixed";
import StepGemini from "./onboarding/StepGemini";
import StepIncome from "./onboarding/StepIncome";
import StepIncomeSms from "./onboarding/StepIncomeSms";
import StepName from "./onboarding/StepName";
import StepSavings from "./onboarding/StepSavings";
import StepSecurity from "./onboarding/StepSecurity";
import StepSms from "./onboarding/StepSms";
import StepUsd from "./onboarding/StepUsd";
import { useKeyboardHeight } from "./useKeyboardHeight";

interface Props { onComplete: (r: OnboardingResult) => Promise<void>; }

const REQUIRED_STEPS = 4;
const IS_ANDROID = Platform.OS === "android";

// ─────────────────────────────────────────────────────────────
// ANIMACIÓN DE CARD
// ─────────────────────────────────────────────────────────────
function AnimatedCard({ children, direction = 1 }: { children: React.ReactNode; direction?: number }) {
    const opacity = useRef(new Animated.Value(0)).current;
    const translateX = useRef(new Animated.Value(40 * direction)).current;

    useEffect(() => {
        Animated.parallel([
            Animated.timing(opacity, { toValue: 1, duration: 350, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            Animated.spring(translateX, { toValue: 0, friction: 7, tension: 50, useNativeDriver: true }),
        ]).start();
    }, [opacity, translateX]);

    return (
        <Animated.View style={{ opacity, transform: [{ translateX }], flex: 1 }}>
            {children}
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function OnboardingScreen({ onComplete }: Props) {
    const insets = useSafeAreaInsets();
    const kb = useKeyboardHeight();

    const [draft, setDraft] = useState<OnboardingDraft | null>(null);
    const draftRef = useRef<OnboardingDraft | null>(null);
    const loadedRef = useRef(false);
    const [dir, setDir] = useState(1);
    const [resumed, setResumed] = useState(false);
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [rate, setRate] = useState<RateInfo>({
        rate: DEFAULT_SETTINGS.exchangeRate > 0 ? DEFAULT_SETTINGS.exchangeRate : 7.7,
        source: "Valor por defecto",
        offline: false,
    });
    const [formOpen, setFormOpen] = useState(false);
    const [formWarned, setFormWarned] = useState(false);
    const [busy, setBusy] = useState<null | "tour" | "later">(null);
    const [commitError, setCommitError] = useState<string | null>(null);
    const committing = useRef(false);
    const optionalVisited = useRef(false);

    // ── Carga inicial: borrador guardado, ajustes (tipo de cambio) y biometría ──
    useEffect(() => {
        let alive = true;
        (async () => {
            const saved = await StorageService.getOnboardingDraft();
            if (!alive) return;
            if (saved) {
                const fixed = repairDraft(saved);
                draftRef.current = fixed;
                setDraft(fixed);
                const progressed = fixed.phase !== "required" || fixed.step > 0 || fixed.name.trim().length > 0;
                setResumed(progressed);
            } else {
                const fresh = emptyDraft();
                draftRef.current = fresh;
                setDraft(fresh);
            }
            loadedRef.current = true;
        })();
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const s = await StorageService.getSettings();
                if (alive && s.exchangeRate > 0) {
                    setRate({ rate: s.exchangeRate, source: s.exchangeRateSource ?? "Valor guardado", offline: false });
                }
                const cached = await ExchangeRateService.getCachedRate();
                if (alive && cached) setRate({ rate: cached.rate, source: cached.source, offline: false });
            } catch { /* se queda con el valor por defecto */ }
        })();
        (async () => {
            try {
                if (Platform.OS === "web") return;
                const hw = await LocalAuthentication.hasHardwareAsync();
                const enrolled = hw ? await LocalAuthentication.isEnrolledAsync() : false;
                if (alive) setBiometricAvailable(hw && enrolled);
            } catch { /* sin biometría */ }
        })();
        return () => { alive = false; };
    }, []);

    // El tipo de cambio de hoy solo se consulta en la red cuando hay algo en dólares.
    const usdNeeded = draft ? needsUsd(draft) : false;
    const rateFetched = useRef(false);
    useEffect(() => {
        if (!usdNeeded || rateFetched.current) return;
        rateFetched.current = true;
        let alive = true;
        ExchangeRateService.getRate()
            .then(r => { if (alive) setRate({ rate: r.rate, source: r.source, offline: r.offline }); })
            .catch(() => { /* se queda con el último valor conocido */ });
        return () => { alive = false; };
    }, [usdNeeded]);

    // ── Guardado del borrador: en cada cambio de paso y al pasar a segundo plano ──
    useEffect(() => {
        const sub = AppState.addEventListener("change", st => {
            if (st !== "background" && st !== "inactive") return;
            if (!loadedRef.current || committing.current || !draftRef.current) return;
            void StorageService.saveOnboardingDraft(draftRef.current);
        });
        return () => sub.remove();
    }, []);

    const onChange = useCallback((patch: DraftPatch) => {
        const cur = draftRef.current;
        if (!cur) return;
        const delta = typeof patch === "function" ? patch(cur) : patch;
        const next = { ...cur, ...delta };
        draftRef.current = next;
        setDraft(next);
    }, []);

    const goTo = useCallback((phase: OnboardingPhase, step: number, direction: number) => {
        const cur = draftRef.current;
        if (!cur) return;
        Keyboard.dismiss();
        setDir(direction);
        setResumed(false);
        setFormWarned(false);
        setFormOpen(false);
        if (phase === "optional") optionalVisited.current = true;
        const next: OnboardingDraft = { ...cur, phase, step };
        draftRef.current = next;
        setDraft(next);
        if (!committing.current) void StorageService.saveOnboardingDraft(next);
    }, []);

    const onFormOpenChange = useCallback((open: boolean) => {
        setFormOpen(open);
        if (!open) setFormWarned(false);
    }, []);

    // ── Teclado: scroll al campo enfocado (patrón de SettingsScreen) ──
    const scrollRef = useRef<ScrollView>(null);
    const scrollYRef = useRef(0);
    const [viewH, setViewH] = useState(0);
    const [focusedY, setFocusedY] = useState<number | null>(null);
    useEffect(() => {
        if (kb <= 0 || focusedY === null || viewH <= 0) return;
        // Solo se desplaza si el campo no se ve completo. Si ya cabe, no se mueve nada:
        // antes siempre subía el contenido y el título del paso quedaba fuera de pantalla.
        const FIELD_H = 96;
        const top = scrollYRef.current;
        const hidden = focusedY < top || focusedY + FIELD_H > top + viewH;
        if (hidden) {
            scrollRef.current?.scrollTo({ y: Math.max(focusedY - 24, 0), animated: true });
        }
    }, [kb, focusedY, viewH]);

    const fieldCtx = useMemo<FieldCtx>(() => {
        // posición del bloque dentro del contenido del ScrollView
        const measure = (node: View | null, cb: (y: number) => void) => {
            const inner = (scrollRef.current as unknown as { getInnerViewRef?: () => unknown } | null)?.getInnerViewRef?.();
            if (!node || !inner) return;
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            node.measureLayout(inner as any, (_x: number, y: number) => cb(y), () => { });
        };
        return {
            onFocusField: node => measure(node, y => setFocusedY(y)),
            onBlurField: () => setFocusedY(null),
            reveal: node => measure(node, y => scrollRef.current?.scrollTo({ y: Math.max(y - 16, 0), animated: true })),
        };
    }, []);

    // ── Navegación ──
    const optIds: OptionalStepId[] = useMemo(
        () => optionalSteps({ isAndroid: IS_ANDROID, biometricAvailable, needsUsd: draft ? needsUsd(draft) : false }),
        [biometricAvailable, draft],
    );

    const phase = draft?.phase ?? "required";
    const step = draft?.step ?? 0;
    const optIdx = Math.max(0, Math.min(step, optIds.length - 1));
    const optId: OptionalStepId | undefined = optIds[optIdx];

    const goBack = useCallback(() => {
        const cur = draftRef.current;
        if (!cur) return;
        const ids = optionalSteps({ isAndroid: IS_ANDROID, biometricAvailable, needsUsd: needsUsd(cur) });
        if (cur.phase === "required") {
            if (cur.step > 0) goTo("required", cur.step - 1, -1);
        } else if (cur.phase === "intro") {
            goTo("required", REQUIRED_STEPS - 1, -1);
        } else if (cur.phase === "optional") {
            if (cur.step > 0) goTo("optional", Math.min(cur.step, ids.length) - 1, -1);
            else goTo("intro", 0, -1);
        } else if (optionalVisited.current && ids.length > 0) {
            goTo("optional", ids.length - 1, -1);
        } else {
            goTo("intro", 0, -1);
        }
    }, [biometricAvailable, goTo]);

    const goNext = () => {
        if (!draft || committing.current) return;
        if (phase === "required") {
            if (!canContinueRequired(draft, step, parseAmount)) return;
            if (step < REQUIRED_STEPS - 1) goTo("required", step + 1, 1);
            else goTo("intro", 0, 1);
        } else if (phase === "intro") {
            goTo("optional", 0, 1);
        } else if (phase === "optional") {
            // un formulario en línea sin guardar: se avisa una vez antes de descartarlo
            if (formOpen && !formWarned) { setFormWarned(true); return; }
            if (optIdx + 1 < optIds.length) goTo("optional", optIdx + 1, 1);
            else goTo("finish", 0, 1);
        }
    };

    const skipStep = () => {
        if (optIdx + 1 < optIds.length) goTo("optional", optIdx + 1, 1);
        else goTo("finish", 0, 1);
    };

    const toFinish = () => goTo("finish", 0, 1);
    const toAccounts = () => {
        const idx = optIds.indexOf("accounts");
        if (idx >= 0) goTo("optional", idx, -1);
    };

    // Atrás de Android: retrocede un paso (en el primer paso sale de la app como siempre).
    const backRef = useRef<() => boolean>(() => false);
    backRef.current = () => {
        if (committing.current) return true;
        const cur = draftRef.current;
        if (!cur || (cur.phase === "required" && cur.step === 0)) return false;
        goBack();
        return true;
    };
    useEffect(() => {
        if (Platform.OS !== "android") return;
        const sub = BackHandler.addEventListener("hardwareBackPress", () => backRef.current());
        return () => sub.remove();
    }, []);

    // ── Cierre ──
    const finish = async (tourRequested: boolean) => {
        const cur = draftRef.current;
        if (!cur || committing.current) return;
        committing.current = true;
        setBusy(tourRequested ? "tour" : "later");
        setCommitError(null);
        Keyboard.dismiss();
        try {
            await onComplete({ draft: cur, tourRequested });
        } catch {
            committing.current = false;
            setBusy(null);
            setCommitError("No pudimos guardar tu configuración. Probá de nuevo.");
        }
    };

    if (!draft) {
        return <View style={[s.container, { paddingTop: insets.top + 12 }]} />;
    }

    // ── Contenido del paso actual ──
    const stepProps = { draft, onChange };
    let body: React.ReactNode = null;
    let cardKey = `${phase}:${step}`;
    if (phase === "required") {
        if (step === 0) body = <StepName {...stepProps} />;
        else if (step === 1) body = <StepIncome {...stepProps} rate={rate} />;
        else if (step === 2) body = <StepCycle {...stepProps} />;
        else body = <StepSavings {...stepProps} />;
    } else if (phase === "intro") {
        body = <SetupIntro steps={optIds} />;
    } else if (phase === "optional" && optId) {
        cardKey = `optional:${optId}`;
        switch (optId) {
            case "accounts": body = <StepAccounts {...stepProps} onFormOpenChange={onFormOpenChange} />; break;
            case "income": body = <StepIncomeSms {...stepProps} onSkip={skipStep} />; break;
            case "fixed": body = <StepFixed {...stepProps} onFormOpenChange={onFormOpenChange} />; break;
            case "debts": body = <StepDebts {...stepProps} rate={rate} onFormOpenChange={onFormOpenChange} />; break;
            case "usd": body = <StepUsd {...stepProps} rate={rate} />; break;
            case "sms": body = <StepSms {...stepProps} onCreateAccounts={toAccounts} />; break;
            case "security": body = <StepSecurity {...stepProps} />; break;
            case "gemini": body = <StepGemini {...stepProps} />; break;
        }
    } else {
        body = <FinishStep draft={draft} />;
    }

    const compact = kb > 0;
    const requiredOk = phase !== "required" || canContinueRequired(draft, step, parseAmount);
    const optionalOk = !(phase === "optional" && optId === "usd" && draft.usd?.mode === "manual" && !validateRate(draft.usd.rate).ok);

    const tagText = phase === "required" ? "TU BASE" : phase === "intro" ? "CONFIGURA TU DINERO" : "CASI LISTO";

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: C.bg }} behavior="padding" keyboardVerticalOffset={0}>
            <View style={[s.container, { paddingTop: insets.top + 12, paddingBottom: compact ? 16 : insets.bottom + 16 }]}>

                {/* ENCABEZADO */}
                {phase === "optional" ? (
                    <View style={s.header}>
                        <View style={s.optHeaderRow}>
                            <Text style={s.optTitle} accessibilityRole="header">
                                {`Configura tu dinero · ${optIdx + 1} de ${optIds.length}`}
                            </Text>
                            <GlassButton label="Saltar" kind="ghost" onPress={skipStep} style={s.skipBtn} />
                        </View>
                        <ProgressBar current={optIdx} total={optIds.length} />
                    </View>
                ) : (
                    <View style={s.header}>
                        {!compact && (
                            <View style={s.cfoTag}>
                                <Ionicons name="shield-checkmark-outline" size={14} color={C.primaryLight} />
                                <Text style={s.cfoTxt}>{tagText}</Text>
                            </View>
                        )}
                        {phase === "required" && (
                            <ProgressBar current={step} total={REQUIRED_STEPS} label={compact ? undefined : `Paso ${step + 1} de ${REQUIRED_STEPS}`} />
                        )}
                    </View>
                )}

                {resumed && !compact && (
                    <InlineNotice variant="info" style={s.topNotice} text="Seguimos donde te quedaste" />
                )}
                {formWarned && (
                    <InlineNotice
                        variant="warning"
                        style={s.topNotice}
                        text="Tenés un formulario sin guardar. Tocá «Agregar» para guardarlo o «Cancelar» para descartarlo; si tocás Seguir otra vez, se descarta."
                    />
                )}

                {/* CONTENIDO */}
                <View style={s.content}>
                    <AnimatedCard key={cardKey} direction={dir}>
                        <FieldContext.Provider value={fieldCtx}>
                            <ScrollView
                                ref={scrollRef}
                                keyboardShouldPersistTaps="handled"
                                keyboardDismissMode="on-drag"
                                showsVerticalScrollIndicator={false}
                                onLayout={e => setViewH(e.nativeEvent.layout.height)}
                                onScroll={e => { scrollYRef.current = e.nativeEvent.contentOffset.y; }}
                                scrollEventThrottle={16}
                            >
                                {body}
                                {/* El KeyboardAvoidingView de arriba ya sube todo con el teclado: aquí no se suma kb otra vez. */}
                                <View style={{ height: compact ? 24 : 120 }} />
                            </ScrollView>
                        </FieldContext.Provider>
                    </AnimatedCard>
                </View>

                {/* PIE */}
                <View style={s.footer}>
                    {!!commitError && phase === "finish" && (
                        <InlineNotice variant="error" style={{ marginBottom: 10 }} text={commitError} />
                    )}

                    {phase === "required" && (
                        <GlassButtonGroup>
                            {step > 0 && !compact && (
                                <GlassButton label="Atrás" icon="arrow-back" kind="secondary" onPress={goBack} />
                            )}
                            <GlassButton
                                label="Continuar"
                                icon="arrow-forward"
                                onPress={goNext}
                                disabled={!requiredOk}
                            />
                        </GlassButtonGroup>
                    )}

                    {phase === "intro" && (
                        <>
                            <GlassButtonGroup>
                                <GlassButton label="Configurar ahora" icon="arrow-forward" onPress={goNext} />
                                <GlassButton label="Hacerlo después" kind="secondary" onPress={toFinish} />
                            </GlassButtonGroup>
                            <FooterLink label="Volver" onPress={goBack} />
                        </>
                    )}

                    {phase === "optional" && (
                        <>
                            <GlassButtonGroup>
                                {!compact && <GlassButton label="Atrás" icon="arrow-back" kind="secondary" onPress={goBack} />}
                                <GlassButton label="Seguir" icon="arrow-forward" onPress={goNext} disabled={!optionalOk} />
                            </GlassButtonGroup>
                            {!compact && <FooterLink label="Terminar después" onPress={toFinish} />}
                        </>
                    )}

                    {phase === "finish" && (
                        <>
                            <GlassButtonGroup>
                                <GlassButton
                                    label="Sí, mostrarme"
                                    icon="compass-outline"
                                    onPress={() => { void finish(true); }}
                                    loading={busy === "tour"}
                                    disabled={busy === "later"}
                                />
                                <GlassButton
                                    label="Más tarde"
                                    kind="secondary"
                                    onPress={() => { void finish(false); }}
                                    loading={busy === "later"}
                                    disabled={busy === "tour"}
                                />
                            </GlassButtonGroup>
                            {busy === null && <FooterLink label="Volver" onPress={goBack} />}
                        </>
                    )}
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

function FooterLink({ label, onPress }: { label: string; onPress: () => void }) {
    return (
        <TouchableOpacity onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={s.footerLink}>
            <Text style={s.footerLinkTxt}>{label}</Text>
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────
// UTILIDADES
// ─────────────────────────────────────────────────────────────
/** Un borrador no puede quedar más adelante que el primer paso obligatorio inválido. */
function repairDraft(d: OnboardingDraft): OnboardingDraft {
    let firstBad = -1;
    for (let i = 0; i < REQUIRED_STEPS; i++) {
        if (!canContinueRequired(d, i, parseAmount)) { firstBad = i; break; }
    }
    if (firstBad < 0) return d;
    if (d.phase === "required") return d.step > firstBad ? { ...d, step: firstBad } : d;
    return { ...d, phase: "required", step: firstBad };
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 20 },
    header: { marginBottom: 4 },
    cfoTag: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 14, alignSelf: "flex-start", backgroundColor: C.glassActive, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.glassActiveBorder },
    cfoTxt: { color: C.primaryLight, fontSize: 11, fontWeight: "900", letterSpacing: 2 },
    optHeaderRow: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 },
    optTitle: { flex: 1, flexShrink: 1, color: C.textPrimary, fontSize: 15, fontWeight: "900", lineHeight: 21 },
    skipBtn: { minHeight: 40, paddingVertical: 6, paddingHorizontal: 12 },
    topNotice: { marginBottom: 10 },
    content: { flex: 1 },
    footer: { paddingTop: 12 },
    footerLink: { minHeight: 44, alignItems: "center", justifyContent: "center", marginTop: 4 },
    footerLinkTxt: { color: C.textSub, fontSize: 14, fontWeight: "700", textDecorationLine: "underline" },
});
