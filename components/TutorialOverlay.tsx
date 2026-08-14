import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated, Dimensions, Easing, Modal,
    ScrollView, StyleSheet, Text,
    TouchableOpacity, TouchableWithoutFeedback, View
} from "react-native";
import { useTutorial } from "../context/TutorialContext";
import { Tutorial, TutorialService, TutorialStep, TUTORIALS } from "../services/TutorialService";
import { C, shadow } from "../theme";

const { width: SW, height: SH } = Dimensions.get("window");
const PADDING = 10;

interface Rect { x: number; y: number; width: number; height: number; }

// ─────────────────────────────────────────────────────────────
// SPOTLIGHT MASK — 4 rectángulos oscuros alrededor del elemento
// ─────────────────────────────────────────────────────────────
function SpotlightMask({ rect, padding = PADDING }: { rect: Rect | null; padding?: number }) {
    if (!rect) {
        return <View style={[StyleSheet.absoluteFill, { backgroundColor: "rgba(0,0,0,0.82)" }]} />;
    }

    const sp = Math.max(0, padding);
    const sx = Math.max(0, rect.x - sp);
    const sy = Math.max(0, rect.y - sp);
    const sw = rect.width + sp * 2;
    const sh = rect.height + sp * 2;

    return (
        <>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: sy, backgroundColor: "rgba(0,0,0,0.82)" }} />
            <View style={{ position: "absolute", top: sy, left: 0, width: sx, height: sh, backgroundColor: "rgba(0,0,0,0.82)" }} />
            <View style={{ position: "absolute", top: sy, left: sx + sw, right: 0, height: sh, backgroundColor: "rgba(0,0,0,0.82)" }} />
            <View style={{ position: "absolute", top: sy + sh, left: 0, right: 0, bottom: 0, backgroundColor: "rgba(0,0,0,0.82)" }} />
            {/* Borde brillante */}
            <View style={{
                position: "absolute",
                top: sy - 2, left: sx - 2,
                width: sw + 4, height: sh + 4,
                borderRadius: 14, borderWidth: 2,
                borderColor: C.primary + "99",
            }} />
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// STEP CARD
// ─────────────────────────────────────────────────────────────
interface StepCardProps {
    tutorial: Tutorial;
    step: TutorialStep;
    stepIndex: number;
    rect: Rect | null;
    onNext: () => void;
    onSkip: () => void;
}

function StepCard({ tutorial, step, stepIndex, rect, onNext, onSkip }: StepCardProps) {
    const slideAnim = useRef(new Animated.Value(40)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const isLast = stepIndex === tutorial.steps.length - 1;

    useEffect(() => {
        slideAnim.setValue(40);
        fadeAnim.setValue(0);
        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, friction: 7, tension: 60, useNativeDriver: true }),
        ]).start();
        const pulse = Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 700, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        );
        pulse.start();
        return () => pulse.stop();
    }, [stepIndex]);

    // Posicionar la card según espacio disponible
    const cardPosition = (): { top?: number } => {
        if (!rect) return { top: SH * 0.35 };
        const cardHeight = 300;
        const spaceBelow = SH - (rect.y + rect.height + PADDING);
        const spaceAbove = rect.y - PADDING;

        if (step.position === 'top' || spaceAbove > cardHeight + 20) {
            return { top: Math.max(60, rect.y - PADDING - cardHeight - 16) };
        }
        if (spaceBelow > cardHeight + 20) {
            return { top: rect.y + rect.height + PADDING + 16 };
        }
        return { top: SH * 0.32 };
    };

    return (
        <Animated.View style={[
            card.container,
            { opacity: fadeAnim, transform: [{ translateY: slideAnim }], ...cardPosition() },
        ]}>
            {/* Progreso */}
            <View style={card.progressRow}>
                {tutorial.steps.map((_, i) => (
                    <View key={i} style={[
                        card.progressDot,
                        { backgroundColor: i <= stepIndex ? tutorial.color : C.cardBorder, width: i === stepIndex ? 24 : 8 }
                    ]} />
                ))}
            </View>

            {/* Ícono */}
            <Animated.View style={[card.iconWrap, {
                backgroundColor: tutorial.color + "22",
                borderColor: tutorial.color + "44",
                transform: [{ scale: pulseAnim }],
            }]}>
                <Ionicons name={step.icon as any} size={28} color={tutorial.color} />
            </Animated.View>

            <Text style={card.title}>{step.title}</Text>
            <Text style={card.desc}>{step.description}</Text>
            <Text style={card.counter}>{stepIndex + 1} / {tutorial.steps.length}</Text>

            <View style={card.btnRow}>
                <TouchableOpacity style={card.skipBtn} onPress={onSkip}>
                    <Text style={card.skipTxt}>Omitir tutorial</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[card.nextBtn, { backgroundColor: tutorial.color }]} onPress={onNext}>
                    <Text style={card.nextTxt}>{isLast ? "¡Listo!" : "Siguiente"}</Text>
                    <Ionicons name={isLast ? "checkmark" : "arrow-forward"} size={18} color="#1A0E00" style={{ marginLeft: 6 }} />
                </TouchableOpacity>
            </View>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────
// MENÚ DE TUTORIALES
// ─────────────────────────────────────────────────────────────
interface MenuProps {
    onSelect: (t: Tutorial) => void;
    onClose: () => void;
    completed: string[];
}

function TutorialMenu({ onSelect, onClose, completed }: MenuProps) {
    const slideAnim = useRef(new Animated.Value(SH)).current;

    useEffect(() => {
        Animated.spring(slideAnim, { toValue: 0, friction: 7, tension: 50, useNativeDriver: true }).start();
    }, []);

    const close = () => {
        Animated.timing(slideAnim, { toValue: SH, duration: 280, useNativeDriver: true }).start(onClose);
    };

    return (
        <Modal visible transparent animationType="none" onRequestClose={close}>
            <View style={mn.overlay}>
                <TouchableWithoutFeedback onPress={close}>
                    <View style={StyleSheet.absoluteFill} />
                </TouchableWithoutFeedback>
                <Animated.View style={[mn.sheet, { transform: [{ translateY: slideAnim }] }]}>
                    <View style={mn.handle} />
                    <View style={mn.header}>
                        <Ionicons name="school-outline" size={22} color={C.primaryLight} />
                        <Text style={mn.title}>Academia BudgetMaster</Text>
                        <TouchableOpacity onPress={close} style={mn.closeBtn}>
                            <Ionicons name="close" size={20} color={C.textMuted} />
                        </TouchableOpacity>
                    </View>
                    <Text style={mn.subtitle}>Seleccioná el tutorial que querés ver</Text>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {TUTORIALS.map(tut => {
                            const done = completed.includes(tut.id);
                            return (
                                <TouchableOpacity
                                    key={tut.id}
                                    style={[mn.item, { borderLeftColor: tut.color }]}
                                    onPress={() => { close(); setTimeout(() => onSelect(tut), 320); }}
                                    activeOpacity={0.8}
                                >
                                    <View style={[mn.itemIcon, { backgroundColor: tut.color + "22" }]}>
                                        <Ionicons name={tut.icon as any} size={22} color={tut.color} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <Text style={mn.itemTitle}>{tut.title}</Text>
                                            {done && (
                                                <View style={mn.doneBadge}>
                                                    <Ionicons name="checkmark" size={10} color={C.income} />
                                                    <Text style={mn.doneTxt}>Visto</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={mn.itemDesc}>{tut.description}</Text>
                                        <Text style={mn.itemSteps}>{tut.steps.length} pasos</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                                </TouchableOpacity>
                            );
                        })}
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </Animated.View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props {
    activeTutorialId?: string;
    onTutorialEnd?: () => void;
    showMenu?: boolean;
    onCloseMenu?: () => void;
}

export default function TutorialOverlay({ activeTutorialId, onTutorialEnd, showMenu, onCloseMenu }: Props) {
    const { measureElement } = useTutorial();

    const [activeTutorial, setActiveTutorial] = useState<Tutorial | null>(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [spotlightRect, setSpotlightRect] = useState<Rect | null>(null);
    const [completed, setCompleted] = useState<string[]>([]);
    const [measuring, setMeasuring] = useState(false);

    useEffect(() => {
        TutorialService.getCompleted().then(setCompleted);
    }, []);

    useEffect(() => {
        if (activeTutorialId) {
            const t = TutorialService.getTutorial(activeTutorialId);
            if (t) startTutorial(t);
        }
    }, [activeTutorialId]);

    useEffect(() => {
        if (!activeTutorial) return;
        measureStep(activeTutorial.steps[stepIndex]);
    }, [activeTutorial, stepIndex]);

    // FIX: usa step.elementId (antes era step.targetRef)
    const measureStep = useCallback(async (step: TutorialStep) => {
        if (!step.elementId) {
            setSpotlightRect(null);
            return;
        }
        setMeasuring(true);
        await new Promise(r => setTimeout(r, 120));
        const rect = await measureElement(step.elementId);
        setSpotlightRect(rect);
        setMeasuring(false);
    }, [measureElement]);

    const startTutorial = (tutorial: Tutorial) => {
        setActiveTutorial(tutorial);
        setStepIndex(0);
    };

    const handleNext = async () => {
        if (!activeTutorial) return;
        if (stepIndex < activeTutorial.steps.length - 1) {
            setSpotlightRect(null);
            setStepIndex(i => i + 1);
        } else {
            await endTutorial();
        }
    };

    const endTutorial = async () => {
        if (activeTutorial) {
            await TutorialService.markCompleted(activeTutorial.id);
            setCompleted(await TutorialService.getCompleted());
        }
        setActiveTutorial(null);
        setStepIndex(0);
        setSpotlightRect(null);
        onTutorialEnd?.();
    };

    const currentStep = activeTutorial?.steps[stepIndex];

    return (
        <>
            {/* TUTORIAL ACTIVO */}
            {activeTutorial && currentStep && (
                <Modal visible transparent animationType="none" statusBarTranslucent>
                    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
                        <SpotlightMask rect={spotlightRect} padding={currentStep.padding ?? PADDING} />
                        {/* Bloquea todos los toques */}
                        <TouchableWithoutFeedback onPress={() => { }}>
                            <View style={StyleSheet.absoluteFill} />
                        </TouchableWithoutFeedback>
                        {/* Card encima del bloqueador */}
                        {!measuring && (
                            <StepCard
                                tutorial={activeTutorial}
                                step={currentStep}
                                stepIndex={stepIndex}
                                rect={spotlightRect}
                                onNext={handleNext}
                                onSkip={endTutorial}
                            />
                        )}
                    </View>
                </Modal>
            )}

            {/* MENÚ */}
            {showMenu && (
                <TutorialMenu
                    completed={completed}
                    onSelect={t => { onCloseMenu?.(); startTutorial(t); }}
                    onClose={() => onCloseMenu?.()}
                />
            )}
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// EXPORTS AUXILIARES
// ─────────────────────────────────────────────────────────────
let _openMenu: (() => void) | null = null;

export function TutorialMenuButton() {
    return (
        <TouchableOpacity
            style={{ padding: 4 }}
            onPress={() => _openMenu?.()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <Ionicons name="help-circle-outline" size={24} color={C.textMuted} />
        </TouchableOpacity>
    );
}

export function TutorialMenuProvider({
    children, onOpen,
}: { children: React.ReactNode; onOpen: () => void }) {
    _openMenu = onOpen;
    return <>{children}</>;
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const card = StyleSheet.create({
    container: { position: "absolute", left: 20, right: 20, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, padding: 22, zIndex: 9999, ...shadow("#000", 24, 0.6) },
    progressRow: { flexDirection: "row", gap: 6, marginBottom: 18, alignItems: "center" },
    progressDot: { height: 6, borderRadius: 3 },
    iconWrap: { width: 58, height: 58, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 14 },
    title: { color: C.textPrimary, fontSize: 19, fontWeight: "900", marginBottom: 8, lineHeight: 26 },
    desc: { color: C.textSub, fontSize: 14, lineHeight: 22, marginBottom: 14 },
    counter: { color: C.textMuted, fontSize: 11, letterSpacing: 1, marginBottom: 14 },
    btnRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    skipBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
    skipTxt: { color: C.textMuted, fontSize: 13, fontWeight: "600" },
    nextBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    nextTxt: { color: "#1A0E00", fontSize: 15, fontWeight: "900" },
});

const mn = StyleSheet.create({
    overlay: { flex: 1, justifyContent: "flex-end" },
    sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.primary + "44", padding: 24, maxHeight: SH * 0.85, ...shadow(C.primaryGlow, 20, 0.4) },
    handle: { width: 40, height: 4, backgroundColor: C.cardBorder, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
    title: { color: C.textPrimary, fontSize: 20, fontWeight: "900", flex: 1 },
    closeBtn: { padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
    subtitle: { color: C.textMuted, fontSize: 13, marginBottom: 20 },
    item: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderLeftWidth: 4, padding: 14, marginBottom: 10, gap: 12 },
    itemIcon: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    itemTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
    itemDesc: { color: C.textSub, fontSize: 12, marginTop: 3 },
    itemSteps: { color: C.textMuted, fontSize: 11, marginTop: 4 },
    doneBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.income + "22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    doneTxt: { color: C.income, fontSize: 10, fontWeight: "700" },
});