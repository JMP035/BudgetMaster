import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated, BackHandler, Dimensions, Easing, Keyboard, LayoutChangeEvent, Modal,
    ScrollView, StyleSheet, Text,
    TouchableOpacity, TouchableWithoutFeedback, useWindowDimensions, View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTutorial } from "../context/TutorialContext";
import { Tutorial, TutorialScreen, TutorialService, TutorialStep, TUTORIALS } from "../services/TutorialService";
import { C, shadow } from "../theme";

const PADDING = 10;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const NAV_MOUNT_MS = 350;
const NAV_SETTLE_MS = 300;
const STEP_SETTLE_MS = 120;
const MEASURE_RETRY_MS = 250;
const MEASURE_ATTEMPTS = 3;

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
    containerHeight: number;
    onNext: () => void;
    onSkip: () => void;
}

// Alto aproximado de los elementos fijos de la tarjeta (paddings, barra de
// progreso, ícono, contador y botones) — usado para calcular cuánto espacio
// le queda al título + descripción cuando hay que limitarlos con ScrollView.
const FIXED_CHROME_HEIGHT = 220;

function StepCard({ tutorial, step, stepIndex, rect, containerHeight, onNext, onSkip }: StepCardProps) {
    const slideAnim = useRef(new Animated.Value(40)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const isLast = stepIndex === tutorial.steps.length - 1;
    // Estimación inicial del alto de la tarjeta; se corrige con la medición real (onLayout).
    const [cardHeight, setCardHeight] = useState(300);

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

    const handleCardLayout = (e: any) => {
        const measured = e.nativeEvent.layout.height;
        if (Math.abs(measured - cardHeight) > 4) {
            setCardHeight(measured);
        }
    };

    // Posicionar la card según espacio disponible
    const cardPosition = (): { top: number; maxContentHeight?: number } => {
        if (!rect) return { top: containerHeight * 0.35 };

        const spaceBelow = containerHeight - (rect.y + rect.height + PADDING);
        const spaceAbove = rect.y - PADDING;
        const fitsAbove = spaceAbove >= cardHeight + 20;
        const fitsBelow = spaceBelow >= cardHeight + 20;

        // La preferencia del step ('top'/'bottom') solo se respeta si el espacio alcanza.
        if (step.position === 'top' && fitsAbove) {
            return { top: Math.max(60, rect.y - PADDING - cardHeight - 16) };
        }
        if (step.position === 'bottom' && fitsBelow) {
            return { top: rect.y + rect.height + PADDING + 16 };
        }
        // Sin preferencia respetable: usar el lado que alcance el alto ideal.
        if (fitsAbove) {
            return { top: Math.max(60, rect.y - PADDING - cardHeight - 16) };
        }
        if (fitsBelow) {
            return { top: rect.y + rect.height + PADDING + 16 };
        }

        // Fallback: ni arriba ni abajo alcanza el alto ideal — se usa el lado
        // con más espacio disponible, pegado al rect, y se limita la altura
        // visible del contenido para nunca superponerse al spotlight.
        if (spaceAbove >= spaceBelow) {
            const availableHeight = Math.max(0, spaceAbove);
            return {
                top: Math.max(20, rect.y - PADDING - availableHeight),
                maxContentHeight: Math.max(40, availableHeight - FIXED_CHROME_HEIGHT),
            };
        }
        const availableHeight = Math.max(0, spaceBelow);
        return {
            top: rect.y + rect.height + PADDING,
            maxContentHeight: Math.max(40, availableHeight - FIXED_CHROME_HEIGHT),
        };
    };

    const pos = cardPosition();

    return (
        <Animated.View
            onLayout={handleCardLayout}
            style={[
                card.container,
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }], top: pos.top },
            ]}
        >
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

            {pos.maxContentHeight != null ? (
                <ScrollView style={{ maxHeight: pos.maxContentHeight }} showsVerticalScrollIndicator={false}>
                    <Text style={card.title}>{step.title}</Text>
                    <Text style={card.desc}>{step.description}</Text>
                </ScrollView>
            ) : (
                <>
                    <Text style={card.title}>{step.title}</Text>
                    <Text style={card.desc}>{step.description}</Text>
                </>
            )}
            <Text style={card.counter}>{stepIndex + 1} / {tutorial.steps.length}</Text>

            <View style={card.btnRow}>
                <TouchableOpacity style={card.skipBtn} onPress={onSkip}>
                    <Text style={card.skipTxt} numberOfLines={2}>Omitir tutorial</Text>
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
    const { height: winH } = useWindowDimensions();
    const insets = useSafeAreaInsets();
    const slideAnim = useRef(new Animated.Value(winH)).current;

    useEffect(() => {
        Animated.spring(slideAnim, { toValue: 0, friction: 7, tension: 50, useNativeDriver: true }).start();
    }, []);

    const close = () => {
        Animated.timing(slideAnim, { toValue: winH, duration: 280, useNativeDriver: true }).start(onClose);
    };

    return (
        <Modal visible transparent animationType="none" onRequestClose={close}>
            <View style={mn.overlay}>
                <TouchableWithoutFeedback onPress={close}>
                    <View style={StyleSheet.absoluteFill} />
                </TouchableWithoutFeedback>
                <Animated.View style={[mn.sheet, { maxHeight: winH * 0.85, paddingBottom: Math.max(24, insets.bottom + 16) }, { transform: [{ translateY: slideAnim }] }]}>
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
                                    <View style={{ flex: 1, minWidth: 0 }}>
                                        <View style={mn.titleRow}>
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
    currentScreen?: TutorialScreen;
    onNavigateToScreen?: (screen: TutorialScreen) => void;
}

export default function TutorialOverlay({ activeTutorialId, onTutorialEnd, showMenu, onCloseMenu, currentScreen, onNavigateToScreen }: Props) {
    const { measureElement } = useTutorial();

    const [activeTutorial, setActiveTutorial] = useState<Tutorial | null>(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [spotlightRect, setSpotlightRect] = useState<Rect | null>(null);
    const [completed, setCompleted] = useState<string[]>([]);
    const [measuredKey, setMeasuredKey] = useState<string | null>(null);
    const measureSeqRef = useRef(0);
    const isMountedRef = useRef(true);

    const currentScreenRef = useRef<TutorialScreen>(currentScreen ?? 'dashboard');
    currentScreenRef.current = currentScreen ?? 'dashboard';
    const onNavigateRef = useRef(onNavigateToScreen);
    onNavigateRef.current = onNavigateToScreen;
    const overlayRootRef = useRef<View>(null);

    const win = useWindowDimensions();
    const [overlaySize, setOverlaySize] = useState({ width: win.width, height: win.height });
    const overlaySizeRef = useRef(overlaySize);

    useEffect(() => {
        isMountedRef.current = true;
        return () => { isMountedRef.current = false; };
    }, []);

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
        if (!activeTutorial) {
            measureSeqRef.current++;
            return;
        }
        measureStep(activeTutorial.steps[stepIndex], `${activeTutorial.id}:${stepIndex}`);
    }, [activeTutorial, stepIndex]);

    // Convierte un rect medido en coordenadas de pantalla (measureInWindow) a
    // coordenadas relativas al overlay, y recorta lo que no es visible —
    // excluyendo la barra inferior cuando clipToContent (navegación con step.screen).
    const toOverlayRect = useCallback(async (raw: Rect, clipToContent: boolean): Promise<Rect | null> => {
        const origin = await new Promise<{ x: number; y: number }>(resolve => {
            const node = overlayRootRef.current;
            if (!node) { resolve({ x: 0, y: 0 }); return; }
            try {
                node.measureInWindow((x, y) => resolve({ x, y }));
            } catch {
                resolve({ x: 0, y: 0 });
            }
        });

        const x = raw.x - origin.x;
        const y = raw.y - origin.y;

        let top = 0;
        let bottom = overlaySizeRef.current.height;
        if (clipToContent) {
            const c = await measureElement('app_content').catch(() => null);
            if (c) {
                top = c.y - origin.y;
                bottom = c.y + c.height - origin.y;
            }
        }

        const visTop = Math.max(y, top);
        const visBottom = Math.min(y + raw.height, bottom);
        const visH = visBottom - visTop;

        if (visH <= 0 || visH < Math.min(48, raw.height * 0.4)) {
            return null;
        }

        const cx = Math.max(0, x);
        const cw = Math.min(raw.width - (cx - x), overlaySizeRef.current.width - cx);

        return { x: cx, y: visTop, width: cw, height: visH };
    }, [measureElement]);

    // FIX: usa step.elementId (antes era step.targetRef)
    const measureStep = useCallback(async (step: TutorialStep, key: string) => {
        const seq = ++measureSeqRef.current;
        const stale = () => !isMountedRef.current || seq !== measureSeqRef.current;
        Keyboard.dismiss();

        let navigated = false;
        if (step.screen && step.screen !== currentScreenRef.current && onNavigateRef.current) {
            onNavigateRef.current(step.screen);
            navigated = true;
        }

        if (!step.elementId) {
            setSpotlightRect(null);
            setMeasuredKey(key);
            return;
        }

        if (navigated) {
            await sleep(NAV_MOUNT_MS);
            if (stale()) return;
            Keyboard.dismiss();
            await sleep(NAV_SETTLE_MS);
        } else {
            await sleep(STEP_SETTLE_MS);
        }

        let raw: Rect | null = null;
        for (let i = 0; i < MEASURE_ATTEMPTS; i++) {
            if (stale()) return;
            raw = await measureElement(step.elementId).catch(() => null);
            if (raw) break;
            await sleep(MEASURE_RETRY_MS);
        }

        const rect = raw ? await toOverlayRect(raw, !!step.screen) : null;
        if (stale()) return;
        setSpotlightRect(rect);
        setMeasuredKey(key);
    }, [measureElement, toOverlayRect]);

    const startTutorial = (tutorial: Tutorial) => {
        setActiveTutorial(tutorial);
        setStepIndex(0);
        setSpotlightRect(null);
        setMeasuredKey(null);
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
        setMeasuredKey(null);
        onTutorialEnd?.();
    };

    // El botón Atrás de Android cierra el tutorial en vez de salir de la pantalla
    // en la que el tutorial nos dejó.
    useEffect(() => {
        if (!activeTutorial) return;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            void endTutorial();
            return true;
        });
        return () => sub.remove();
    }, [activeTutorial]);

    const currentStep = activeTutorial?.steps[stepIndex];
    const currentKey = activeTutorial ? `${activeTutorial.id}:${stepIndex}` : null;
    const cardReady = !!currentStep && (!currentStep.elementId || measuredKey === currentKey);

    return (
        <>
            {/*
              El tutorial activo NO se renderiza dentro de un Modal:
              - El Modal de Android abre otra ventana nativa, con su propio árbol de
                medición — measureInWindow de los elementos reales no es comparable
                con las coordenadas del Modal.
              - Edge-to-edge en RN 0.81 obliga a usar statusBarTranslucent, lo que
                complica aún más esa comparación de coordenadas.
              En su lugar usamos una View absoluta con zIndex/elevation muy alto
              (ver estilo `ov.root`) para quedar encima de la TabBar incluso en
              Android, y compensamos las coordenadas midiendo el origen de esta
              misma View (ver toOverlayRect).
            */}
            {activeTutorial && currentStep && (
                <View
                    ref={overlayRootRef}
                    collapsable={false}
                    style={ov.root}
                    onLayout={(e: LayoutChangeEvent) => {
                        const { width, height } = e.nativeEvent.layout;
                        overlaySizeRef.current = { width, height };
                        setOverlaySize({ width, height });
                    }}
                >
                    <SpotlightMask rect={spotlightRect} padding={currentStep.padding ?? PADDING} />
                    {/* Bloquea todos los toques */}
                    <TouchableWithoutFeedback onPress={() => { }}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    {/* Card encima del bloqueador */}
                    {cardReady && (
                        <StepCard
                            tutorial={activeTutorial}
                            step={currentStep}
                            stepIndex={stepIndex}
                            rect={spotlightRect}
                            containerHeight={overlaySize.height}
                            onNext={handleNext}
                            onSkip={endTutorial}
                        />
                    )}
                </View>
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

export function openTutorialMenu() {
    _openMenu?.();
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
// elevation 9999 (mayor que la que usa shadow() en la TabBar, que es 8) para
// que el overlay del tutorial quede siempre encima en Android.
const ov = StyleSheet.create({
    root: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 },
});

const card = StyleSheet.create({
    container: { position: "absolute", left: 20, right: 20, backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, padding: 22, zIndex: 9999, ...shadow("#000", 24, 0.6) },
    progressRow: { flexDirection: "row", gap: 6, marginBottom: 18, alignItems: "center" },
    progressDot: { height: 6, borderRadius: 3 },
    iconWrap: { width: 58, height: 58, borderRadius: 18, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginBottom: 14 },
    title: { color: C.textPrimary, fontSize: 19, fontWeight: "900", marginBottom: 8, lineHeight: 26 },
    desc: { color: C.textSub, fontSize: 14, lineHeight: 22, marginBottom: 14 },
    counter: { color: C.textMuted, fontSize: 11, letterSpacing: 1, marginBottom: 14 },
    btnRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    skipBtn: { flex: 1, paddingVertical: 12, paddingHorizontal: 4, alignItems: "center" },
    skipTxt: { color: C.textMuted, fontSize: 13, fontWeight: "600", textAlign: "center" },
    nextBtn: { flex: 2, flexDirection: "row", paddingVertical: 14, borderRadius: 14, alignItems: "center", justifyContent: "center" },
    nextTxt: { color: "#1A0E00", fontSize: 15, fontWeight: "900" },
});

const mn = StyleSheet.create({
    overlay: { flex: 1, justifyContent: "flex-end" },
    sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.primary + "44", paddingTop: 24, paddingHorizontal: 16, ...shadow(C.primaryGlow, 20, 0.4) },
    handle: { width: 40, height: 4, backgroundColor: C.cardBorder, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
    title: { color: C.textPrimary, fontSize: 20, fontWeight: "900", flex: 1, flexShrink: 1 },
    closeBtn: { padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
    subtitle: { color: C.textMuted, fontSize: 13, marginBottom: 20 },
    item: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderLeftWidth: 4, padding: 12, marginBottom: 10, gap: 10 },
    itemIcon: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
    itemTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800", flexShrink: 1 },
    itemDesc: { color: C.textSub, fontSize: 12, marginTop: 3, flexShrink: 1 },
    itemSteps: { color: C.textMuted, fontSize: 11, marginTop: 4 },
    doneBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.income + "22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, flexShrink: 0 },
    doneTxt: { color: C.income, fontSize: 10, fontWeight: "700" },
});