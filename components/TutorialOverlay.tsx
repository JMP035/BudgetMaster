import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
    Animated, Dimensions, Easing, Modal,
    ScrollView, StyleSheet, Text,
    TouchableOpacity, View
} from "react-native";
import { Tutorial, TutorialService, TUTORIALS } from "../services/Tutorial";
import { C, shadow } from "../theme";

const { width, height } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────
// OVERLAY SPOTLIGHT — un paso del tutorial
// ─────────────────────────────────────────────────────────────
interface StepOverlayProps {
    tutorial: Tutorial;
    stepIndex: number;
    onNext: () => void;
    onSkip: () => void;
}

function StepOverlay({ tutorial, stepIndex, onNext, onSkip }: StepOverlayProps) {
    const step = tutorial.steps[stepIndex];
    const isLast = stepIndex === tutorial.steps.length - 1;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const slideAnim = useRef(new Animated.Value(30)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        fadeAnim.setValue(0);
        slideAnim.setValue(30);

        Animated.parallel([
            Animated.timing(fadeAnim, { toValue: 1, duration: 350, useNativeDriver: true }),
            Animated.spring(slideAnim, { toValue: 0, friction: 7, useNativeDriver: true }),
        ]).start();

        // Pulso en el ícono
        Animated.loop(
            Animated.sequence([
                Animated.timing(pulseAnim, { toValue: 1.15, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
                Animated.timing(pulseAnim, { toValue: 1, duration: 800, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
            ])
        ).start();
    }, [stepIndex]);

    const cardBottom = step.position === 'top' ? undefined : 100;
    const cardTop = step.position === 'top' ? 80 : undefined;

    return (
        <View style={ov.container} pointerEvents="box-none">
            {/* Fondo oscuro semi-transparente */}
            <Animated.View style={[ov.backdrop, { opacity: fadeAnim }]} />

            {/* Tarjeta del paso */}
            <Animated.View style={[
                ov.card,
                {
                    bottom: cardBottom,
                    top: step.position === 'center' ? height * 0.25 : cardTop,
                    opacity: fadeAnim,
                    transform: [{ translateY: slideAnim }],
                    borderTopColor: tutorial.color,
                }
            ]}>
                {/* Progreso */}
                <View style={ov.progressRow}>
                    {tutorial.steps.map((_, i) => (
                        <View
                            key={i}
                            style={[
                                ov.progressDot,
                                {
                                    backgroundColor: i <= stepIndex ? tutorial.color : C.cardBorder,
                                    width: i === stepIndex ? 20 : 8,
                                }
                            ]}
                        />
                    ))}
                </View>

                {/* Ícono animado */}
                <Animated.View style={[ov.iconWrap, { backgroundColor: tutorial.color + "22", borderColor: tutorial.color + "55", transform: [{ scale: pulseAnim }] }]}>
                    <Ionicons name={step.icon as any} size={32} color={tutorial.color} />
                </Animated.View>

                {/* Texto */}
                <Text style={ov.stepTitle}>{step.title}</Text>
                <Text style={ov.stepDesc}>{step.description}</Text>

                {/* Contador */}
                <Text style={ov.counter}>{stepIndex + 1} de {tutorial.steps.length}</Text>

                {/* Botones */}
                <View style={ov.btnRow}>
                    <TouchableOpacity style={ov.skipBtn} onPress={onSkip}>
                        <Text style={ov.skipTxt}>Saltar tutorial</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[ov.nextBtn, { backgroundColor: tutorial.color }]} onPress={onNext}>
                        <Text style={ov.nextTxt}>{isLast ? "¡Entendido!" : "Siguiente"}</Text>
                        <Ionicons name={isLast ? "checkmark" : "arrow-forward"} size={18} color="#1A0E00" style={{ marginLeft: 6 }} />
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// MENÚ DE TUTORIALES
// ─────────────────────────────────────────────────────────────
interface TutorialMenuProps {
    onSelect: (tutorial: Tutorial) => void;
    onClose: () => void;
    completed: string[];
}

function TutorialMenu({ onSelect, onClose, completed }: TutorialMenuProps) {
    const slideAnim = useRef(new Animated.Value(height)).current;

    useEffect(() => {
        Animated.spring(slideAnim, { toValue: 0, friction: 7, tension: 50, useNativeDriver: true }).start();
    }, []);

    const handleClose = () => {
        Animated.timing(slideAnim, { toValue: height, duration: 300, useNativeDriver: true }).start(onClose);
    };

    return (
        <Modal visible transparent animationType="none" onRequestClose={handleClose}>
            <View style={mn.overlay}>
                <TouchableOpacity style={mn.backdrop} onPress={handleClose} activeOpacity={1} />
                <Animated.View style={[mn.sheet, { transform: [{ translateY: slideAnim }] }]}>

                    <View style={mn.header}>
                        <View style={mn.headerLeft}>
                            <Ionicons name="school-outline" size={22} color={C.primaryLight} />
                            <Text style={mn.title}>Academia BudgetMaster</Text>
                        </View>
                        <TouchableOpacity onPress={handleClose} style={mn.closeBtn}>
                            <Ionicons name="close" size={22} color={C.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <Text style={mn.subtitle}>Seleccioná el tutorial que querés ver</Text>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {TUTORIALS.map(tutorial => {
                            const isDone = completed.includes(tutorial.id);
                            return (
                                <TouchableOpacity
                                    key={tutorial.id}
                                    style={[mn.tutorialCard, { borderLeftColor: tutorial.color }]}
                                    onPress={() => { handleClose(); setTimeout(() => onSelect(tutorial), 350); }}
                                    activeOpacity={0.8}
                                >
                                    <View style={[mn.tutorialIcon, { backgroundColor: tutorial.color + "22" }]}>
                                        <Ionicons name={tutorial.icon as any} size={24} color={tutorial.color} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                                            <Text style={mn.tutorialTitle}>{tutorial.title}</Text>
                                            {isDone && (
                                                <View style={mn.doneBadge}>
                                                    <Ionicons name="checkmark" size={10} color={C.income} />
                                                    <Text style={mn.doneTxt}>Visto</Text>
                                                </View>
                                            )}
                                        </View>
                                        <Text style={mn.tutorialDesc}>{tutorial.description}</Text>
                                        <Text style={mn.tutorialSteps}>{tutorial.steps.length} pasos</Text>
                                    </View>
                                    <Ionicons name="chevron-forward" size={18} color={C.textMuted} />
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
// COMPONENTE PRINCIPAL — botón flotante + lógica completa
// ─────────────────────────────────────────────────────────────
interface Props {
    activeTutorialId?: string;     // Para lanzar tutorial automáticamente
    onTutorialEnd?: () => void;
}

export default function TutorialOverlay({ activeTutorialId, onTutorialEnd }: Props) {
    const [showMenu, setShowMenu] = useState(false);
    const [activeTutorial, setActiveTutorial] = useState<Tutorial | null>(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [completed, setCompleted] = useState<string[]>([]);
    const [btnVisible, setBtnVisible] = useState(true);

    const btnScale = useRef(new Animated.Value(0)).current;
    const btnRotate = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        // Cargar tutoriales completados
        TutorialService.getCompleted().then(setCompleted);

        // Animación de entrada del botón
        Animated.spring(btnScale, { toValue: 1, friction: 4, delay: 1000, useNativeDriver: true }).start();
    }, []);

    // Lanzar tutorial automáticamente si se pasa un ID
    useEffect(() => {
        if (activeTutorialId) {
            const t = TutorialService.getTutorial(activeTutorialId);
            if (t) startTutorial(t);
        }
    }, [activeTutorialId]);

    const startTutorial = (tutorial: Tutorial) => {
        setActiveTutorial(tutorial);
        setStepIndex(0);
        setBtnVisible(false);
        // Rotar botón "?"
        Animated.timing(btnRotate, { toValue: 1, duration: 300, useNativeDriver: true }).start();
    };

    const handleNext = () => {
        if (!activeTutorial) return;
        if (stepIndex < activeTutorial.steps.length - 1) {
            setStepIndex(i => i + 1);
        } else {
            endTutorial();
        }
    };

    const endTutorial = async () => {
        if (activeTutorial) {
            await TutorialService.markCompleted(activeTutorial.id);
            setCompleted(await TutorialService.getCompleted());
        }
        setActiveTutorial(null);
        setStepIndex(0);
        setBtnVisible(true);
        Animated.timing(btnRotate, { toValue: 0, duration: 300, useNativeDriver: true }).start();
        onTutorialEnd?.();
    };

    const toggleBtn = () => {
        if (activeTutorial) { endTutorial(); return; }
        Animated.sequence([
            Animated.spring(btnScale, { toValue: 0.85, friction: 4, useNativeDriver: true }),
            Animated.spring(btnScale, { toValue: 1, friction: 4, useNativeDriver: true }),
        ]).start();
        setShowMenu(true);
    };

    const spin = btnRotate.interpolate({ inputRange: [0, 1], outputRange: ["0deg", "90deg"] });

    return (
        <>
            {/* TUTORIAL ACTIVO */}
            {activeTutorial && (
                <Modal visible transparent animationType="none">
                    <StepOverlay
                        tutorial={activeTutorial}
                        stepIndex={stepIndex}
                        onNext={handleNext}
                        onSkip={endTutorial}
                    />
                </Modal>
            )}

            {/* MENÚ DE TUTORIALES */}
            {showMenu && (
                <TutorialMenu
                    completed={completed}
                    onSelect={t => { setShowMenu(false); startTutorial(t); }}
                    onClose={() => setShowMenu(false)}
                />
            )}

            {/* BOTÓN FLOTANTE "?" */}
            <Animated.View style={[
                fab.wrap,
                { transform: [{ scale: btnScale }, { rotate: spin }] }
            ]}>
                <TouchableOpacity
                    style={[fab.btn, activeTutorial && { backgroundColor: C.danger }]}
                    onPress={toggleBtn}
                    activeOpacity={0.8}
                >
                    <Ionicons
                        name={activeTutorial ? "close" : "help"}
                        size={22}
                        color="#1A0E00"
                    />
                </TouchableOpacity>
            </Animated.View>
        </>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────

// Overlay / spotlight
const ov = StyleSheet.create({
    container: { ...StyleSheet.absoluteFillObject, zIndex: 1000 },
    backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: "rgba(0,0,0,0.75)" },
    card: {
        position: "absolute",
        left: 20,
        right: 20,
        backgroundColor: C.card,
        borderRadius: 24,
        borderWidth: 1,
        borderColor: C.cardBorder,
        borderTopWidth: 3,
        padding: 24,
        ...shadow("#000", 20, 0.5),
        zIndex: 1001,
    },
    progressRow: { flexDirection: "row", gap: 6, marginBottom: 20, alignItems: "center" },
    progressDot: { height: 6, borderRadius: 3 },
    iconWrap: { width: 64, height: 64, borderRadius: 20, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    stepTitle: { color: C.textPrimary, fontSize: 20, fontWeight: "900", marginBottom: 10 },
    stepDesc: { color: C.textSub, fontSize: 14, lineHeight: 22, marginBottom: 16 },
    counter: { color: C.textMuted, fontSize: 11, letterSpacing: 1, marginBottom: 16 },
    btnRow: { flexDirection: "row", gap: 12, alignItems: "center" },
    skipBtn: { flex: 1, paddingVertical: 12, alignItems: "center" },
    skipTxt: { color: C.textMuted, fontSize: 13, fontWeight: "600" },
    nextBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    nextTxt: { color: "#1A0E00", fontSize: 15, fontWeight: "900" },
});

// Menú
const mn = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
    backdrop: { ...StyleSheet.absoluteFillObject },
    sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.primary + "55", padding: 24, maxHeight: height * 0.85, ...shadow(C.primaryGlow, 20, 0.4) },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 },
    headerLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    title: { color: C.textPrimary, fontSize: 20, fontWeight: "900" },
    closeBtn: { padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
    subtitle: { color: C.textMuted, fontSize: 13, marginBottom: 20 },
    tutorialCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderLeftWidth: 4, padding: 16, marginBottom: 12, gap: 14 },
    tutorialIcon: { width: 48, height: 48, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    tutorialTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
    tutorialDesc: { color: C.textSub, fontSize: 12, marginTop: 3, lineHeight: 17 },
    tutorialSteps: { color: C.textMuted, fontSize: 11, marginTop: 4 },
    doneBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.income + "22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
    doneTxt: { color: C.income, fontSize: 10, fontWeight: "700" },
});

// Botón flotante
const fab = StyleSheet.create({
    wrap: { position: "absolute", bottom: 90, right: 16, zIndex: 999 },
    btn: {
        width: 46,
        height: 46,
        borderRadius: 23,
        backgroundColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
        borderWidth: 1.5,
        borderColor: C.primaryLight,
        ...shadow(C.primaryGlow, 10, 0.6),
    },
});