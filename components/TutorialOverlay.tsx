import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated, BackHandler, Easing, Keyboard, LayoutChangeEvent, Modal,
    ScrollView, StyleSheet, Text,
    TouchableOpacity, TouchableWithoutFeedback, useWindowDimensions, View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTutorial } from "../context/TutorialContext";
import { Tutorial, TutorialScreen, TutorialService, TutorialStep } from "../services/TutorialService";
import { C } from "../theme";
import { GlassBackground, GlassCard } from "./GlassCard";
import { GlassButton } from "./GlassButton";
import { InlineNotice } from "./InlineNotice";

const PADDING = 10;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));
const NAV_MOUNT_MS = 350;
const NAV_SETTLE_MS = 300;
const STEP_SETTLE_MS = 120;
const MEASURE_RETRY_MS = 250;
const MEASURE_ATTEMPTS = 3;
const ACTION_RETRIES = 4;
const ACTION_RETRY_MS = 200;
const ACTION_SETTLE_MS = 420;

const KEYBOARD_HIDE_TIMEOUT_MS = 700;
const STABLE_MEASURE_EXTRA = 4;
const STABLE_MEASURE_MS = 120;
const STABLE_TOLERANCE_PX = 2;

/** Espera a que el teclado termine de ocultarse (o vence el timeout). */
function waitKeyboardHidden(ms: number): Promise<void> {
    return new Promise<void>(resolve => {
        let done = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const sub = Keyboard.addListener('keyboardDidHide', () => finish());
        function finish() {
            if (done) return;
            done = true;
            if (timer) clearTimeout(timer);
            sub.remove();
            resolve();
        }
        timer = setTimeout(finish, ms);
    });
}

/** Si el teclado está visible lo cierra y espera a que el layout se reacomode. */
async function ensureKeyboardHidden() {
    if (Keyboard.isVisible()) {
        const hidden = waitKeyboardHidden(KEYBOARD_HIDE_TIMEOUT_MS);
        Keyboard.dismiss();
        await hidden;
    } else {
        Keyboard.dismiss();
    }
}

const DEFAULT_EMPTY_HINT ="Esta sección aparece cuando tengas datos registrados en este módulo.";

interface Rect { x: number; y: number; width: number; height: number; }

// ─────────────────────────────────────────────────────────────
// SPOTLIGHT MASK — 4 rectángulos oscuros alrededor del elemento
// ─────────────────────────────────────────────────────────────
function SpotlightMask({ rect, padding = PADDING, soft = false, width, height }: { rect: Rect | null; padding?: number; soft?: boolean; width: number; height: number }) {
    if (!rect) {
        return <View style={[StyleSheet.absoluteFill, { backgroundColor: soft ? C.scrimSoft : C.scrimTutorial }]} />;
    }

    const sp = Math.max(0, padding);
    const sx = Math.max(0, rect.x - sp);
    const sy = Math.max(0, rect.y - sp);
    const sw = Math.min(rect.width + sp * 2, width - sx);
    const sh = Math.min(rect.height + sp * 2, height - sy);

    // Anillo acotado a la pantalla: nunca se sale por los bordes.
    const ring = (k: number) => {
        const left = Math.max(1, sx - k);
        const right = Math.min(width - 1, sx + sw + k);
        const top = Math.max(1, sy - k);
        const bottom = Math.min(height - 1, sy + sh + k);
        return { top, left, width: right - left, height: bottom - top };
    };

    return (
        <>
            <View style={{ position: "absolute", top: 0, left: 0, right: 0, height: sy, backgroundColor: C.scrimTutorial }} />
            <View style={{ position: "absolute", top: sy, left: 0, width: sx, height: sh, backgroundColor: C.scrimTutorial }} />
            <View style={{ position: "absolute", top: sy, left: sx + sw, right: 0, height: sh, backgroundColor: C.scrimTutorial }} />
            <View style={{ position: "absolute", top: sy + sh, left: 0, right: 0, bottom: 0, backgroundColor: C.scrimTutorial }} />
            {/* Anillo exterior (resplandor) */}
            <View style={{
                position: "absolute",
                ...ring(6),
                borderRadius: 18, borderWidth: 6,
                borderColor: C.spotlightGlow,
            }} />
            {/* Anillo interior (bronce) */}
            <View style={{
                position: "absolute",
                ...ring(2),
                borderRadius: 14, borderWidth: 2,
                borderColor: C.spotlightRing,
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
    fallback: boolean;
    containerHeight: number;
    onNext: () => void;
    onSkip: () => void;
}

const CARD_MAX_WIDTH = 440;
const GAP = 12;               // separación entre la tarjeta y el anillo del spotlight
const EDGE = 8;               // margen mínimo contra los bordes seguros de la pantalla
const RING = 6;               // grosor del resplandor del spotlight
const MIN_BODY = 96;          // alto mínimo legible de título + descripción
const MIN_BODY_COMPACT = 44;  // piso absoluto del cuerpo cuando hay que comprimir

interface CardMeasure { key: string; naturalH: number; bodyH: number; iconBlockH: number; }

/**
 * Tarjeta del tutorial en dos fases:
 *  1. MEDICIÓN: se renderiza invisible, sin límites, para conocer su alto natural
 *     (tarjeta completa, cuerpo y bloque del ícono). Solo se mide una vez por clave.
 *  2. UBICACIÓN: con esas medidas fijas se decide dónde va (junto al elemento,
 *     con scroll interno o superpuesta) sin retroalimentarse del alto ya ubicado.
 * Cabecera y pie (contador + botones) son fijos; solo el cuerpo hace scroll.
 */
function StepCard({ tutorial, step, stepIndex, rect, fallback, containerHeight, onNext, onSkip }: StepCardProps) {
    const insets = useSafeAreaInsets();
    const { width: winW, fontScale } = useWindowDimensions();
    const slideAnim = useRef(new Animated.Value(40)).current;
    const fadeAnim = useRef(new Animated.Value(0)).current;
    const pulseAnim = useRef(new Animated.Value(1)).current;
    const isLast = stepIndex === tutorial.steps.length - 1;

    const sideMargin = Math.max(20, (winW - CARD_MAX_WIDTH) / 2);

    const measureKey = `${winW}:${fontScale}:${fallback}`;
    const [measured, setMeasured] = useState<CardMeasure | null>(null);
    const partsRef = useRef<{ key?: string; naturalH?: number; bodyH?: number; iconBlockH?: number }>({});
    const prevKeyRef = useRef(measureKey);
    const m = measured && measured.key === measureKey ? measured : null;
    const ready = m != null;

    // Si cambia el ancho, la escala de fuente o la nota de fallback, hay que re-medir.
    useEffect(() => {
        if (prevKeyRef.current === measureKey) return;
        prevKeyRef.current = measureKey;
        setMeasured(null);
    }, [measureKey]);

    // La animación arranca recién cuando la tarjeta ya fue medida y ubicada.
    useEffect(() => {
        if (!ready) return;
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
    }, [ready]);

    const report = (part: 'naturalH' | 'bodyH' | 'iconBlockH', value: number) => {
        let p = partsRef.current;
        if (p.key !== measureKey) {
            p = { key: measureKey };
            partsRef.current = p;
        }
        p[part] = value;
        if (p.naturalH != null && p.bodyH != null && p.iconBlockH != null) {
            setMeasured({ key: measureKey, naturalH: p.naturalH, bodyH: p.bodyH, iconBlockH: p.iconBlockH });
        }
    };

    const progress = (
        <View style={card.progressRow}>
            {tutorial.steps.map((_, i) => (
                <View key={i} style={[
                    card.progressDot,
                    { backgroundColor: i <= stepIndex ? C.primaryLight : C.glassBorder, width: i === stepIndex ? 24 : 8 }
                ]} />
            ))}
        </View>
    );

    const bodyContent = (
        <>
            <Text style={card.title}>{step.title}</Text>
            <Text style={card.desc}>{step.description}</Text>
            {fallback && (
                <InlineNotice variant="info" text={step.emptyHint ?? DEFAULT_EMPTY_HINT} style={card.notice} />
            )}
        </>
    );

    const footer = (
        <>
            <Text style={card.counter}>{stepIndex + 1} / {tutorial.steps.length}</Text>
            <View style={card.btnRow}>
                <GlassButton kind="ghost" label="Omitir tutorial" onPress={onSkip} style={card.skipBtn} />
                <GlassButton
                    kind="primary"
                    label={isLast ? "¡Listo!" : "Siguiente"}
                    icon={isLast ? "checkmark" : "arrow-forward"}
                    onPress={onNext}
                    style={card.nextBtn}
                />
            </View>
        </>
    );

    // ── FASE DE MEDICIÓN ────────────────────────────────────────
    if (!m) {
        return (
            <View
                pointerEvents="none"
                onLayout={(e: LayoutChangeEvent) => report('naturalH', e.nativeEvent.layout.height)}
                style={[card.container, { left: sideMargin, right: sideMargin, top: 0, opacity: 0 }]}
            >
                {progress}
                <View onLayout={(e: LayoutChangeEvent) => report('iconBlockH', e.nativeEvent.layout.height)}>
                    <View style={card.iconWrap}>
                        <Ionicons name={step.icon as any} size={28} color={C.primaryLight} />
                    </View>
                </View>
                <View onLayout={(e: LayoutChangeEvent) => report('bodyH', e.nativeEvent.layout.height)}>
                    {bodyContent}
                </View>
                {footer}
            </View>
        );
    }

    // ── FASE DE UBICACIÓN ───────────────────────────────────────
    const H = containerHeight;
    const safeTop = insets.top + EDGE;
    const safeBottom = H - Math.max(insets.bottom, EDGE) - EDGE;
    const avail = Math.max(0, safeBottom - safeTop);

    const { naturalH, bodyH, iconBlockH } = m;
    const chromeFull = naturalH - bodyH;
    // Pantalla muy baja (landscape / chica): se oculta el ícono y se achica el padding.
    const compact = (avail - chromeFull) < MIN_BODY;
    const chrome = compact ? chromeFull - iconBlockH : chromeFull;
    const naturalEff = compact ? naturalH - iconBlockH : naturalH;
    const cardCap = Math.min(naturalEff, avail);
    const minScrollBody = Math.min(bodyH, 120);

    let top: number;
    let cardH: number;
    let bodyMax: number | undefined;
    let overlap = false;

    if (!rect) {
        cardH = cardCap;
        top = safeTop + (avail - cardH) / 2;
        bodyMax = naturalEff > avail ? avail - chrome : undefined;
    } else {
        const pad = step.padding ?? PADDING;
        const holeTop = rect.y - pad - RING;
        const holeBottom = rect.y + rect.height + pad + RING;
        const spaceAbove = holeTop - GAP - safeTop;
        const spaceBelow = safeBottom - (holeBottom + GAP);
        const space = (side: 'above' | 'below') => side === 'above' ? spaceAbove : spaceBelow;
        const order: ('above' | 'below')[] = step.position === 'top' ? ['above', 'below'] : ['below', 'above'];
        const placeOn = (side: 'above' | 'below', h: number) =>
            side === 'above' ? holeTop - GAP - h : holeBottom + GAP;

        const fit = order.find(s => space(s) >= naturalEff);
        if (fit) {
            // (a) cabe completa junto al elemento
            cardH = naturalEff;
            top = placeOn(fit, cardH);
            bodyMax = undefined;
        } else {
            const best = space(order[1]) > space(order[0]) ? order[1] : order[0];
            if (space(best) >= chrome + minScrollBody) {
                // (b) cabe con scroll interno en el cuerpo
                cardH = space(best);
                bodyMax = cardH - chrome;
                top = placeOn(best, cardH);
            } else {
                // (c) el elemento ocupa casi todo: la tarjeta se superpone
                overlap = true;
                cardH = cardCap;
                bodyMax = naturalEff > avail ? avail - chrome : undefined;
                const anchorBottom = (rect.y + rect.height / 2) <= (safeTop + safeBottom) / 2;
                top = anchorBottom ? safeBottom - cardH : safeTop;
            }
        }
    }

    top = Math.max(safeTop, Math.min(top, safeBottom - cardH));
    if (bodyMax != null) bodyMax = Math.max(MIN_BODY_COMPACT, bodyMax);

    return (
        <Animated.View
            style={[
                card.container,
                compact && card.containerCompact,
                { left: sideMargin, right: sideMargin, top, maxHeight: avail },
                { opacity: fadeAnim, transform: [{ translateY: slideAnim }] },
            ]}
        >
            <GlassBackground radius={22} blur={false} />
            {overlap && <View pointerEvents="none" style={card.overlapBorder} />}

            {/* Cabecera fija: progreso e ícono */}
            {progress}
            {!compact && (
                <Animated.View style={[card.iconWrap, { transform: [{ scale: pulseAnim }] }]}>
                    <Ionicons name={step.icon as any} size={28} color={C.primaryLight} />
                </Animated.View>
            )}

            {/* Cuerpo: único tramo con scroll cuando falta espacio */}
            {bodyMax != null ? (
                <ScrollView
                    style={{ maxHeight: bodyMax, flexGrow: 0 }}
                    showsVerticalScrollIndicator
                >
                    {bodyContent}
                </ScrollView>
            ) : (
                <View>{bodyContent}</View>
            )}

            {/* Pie fijo: contador + botones siempre visibles */}
            {footer}
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
    tutorials: Tutorial[];
}

function TutorialMenu({ onSelect, onClose, completed, tutorials }: MenuProps) {
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
                    <GlassBackground radius={28} blur={false} />
                    <View style={mn.handle} />
                    <View style={mn.header}>
                        <Ionicons name="school-outline" size={22} color={C.primaryLight} />
                        <Text style={mn.title}>Academia BudgetMaster</Text>
                        <TouchableOpacity
                            onPress={close}
                            style={mn.closeBtn}
                            accessibilityRole="button"
                            accessibilityLabel="Cerrar"
                        >
                            <GlassBackground radius={18} blur={false} />
                            <Ionicons name="close" size={20} color={C.textSub} />
                        </TouchableOpacity>
                    </View>
                    <Text style={mn.subtitle}>Elegí un tutorial. También podés abrir el de cada módulo con el botón ? de su encabezado.</Text>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        {tutorials.map(tut => {
                            const done = completed.includes(tut.id);
                            return (
                                <TouchableOpacity
                                    key={tut.id}
                                    style={mn.itemWrap}
                                    onPress={() => { close(); setTimeout(() => onSelect(tut), 320); }}
                                    activeOpacity={0.8}
                                >
                                    <GlassCard radius={16} blur={false} leftAccentColor={tut.color} contentStyle={mn.item}>
                                        <View style={mn.itemIcon}>
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
                                        <Ionicons name="chevron-forward" size={16} color={C.textSub} />
                                    </GlassCard>
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
    smsEnabled?: boolean;
}

export default function TutorialOverlay({ activeTutorialId, onTutorialEnd, showMenu, onCloseMenu, currentScreen, onNavigateToScreen, smsEnabled = true }: Props) {
    const { measureElement, ensureVisible, runAction } = useTutorial();

    const [activeTutorial, setActiveTutorial] = useState<Tutorial | null>(null);
    const [stepIndex, setStepIndex] = useState(0);
    const [spotlightRect, setSpotlightRect] = useState<Rect | null>(null);
    const [fallback, setFallback] = useState(false);
    const [completed, setCompleted] = useState<string[]>([]);
    const [measuredKey, setMeasuredKey] = useState<string | null>(null);
    const measureSeqRef = useRef(0);
    const isMountedRef = useRef(true);

    const activeTutorialRef = useRef<Tutorial | null>(null);
    activeTutorialRef.current = activeTutorial;
    const currentScreenRef = useRef<TutorialScreen>(currentScreen ?? 'dashboard');
    currentScreenRef.current = currentScreen ?? 'dashboard';
    const onNavigateRef = useRef(onNavigateToScreen);
    onNavigateRef.current = onNavigateToScreen;
    const smsEnabledRef = useRef(smsEnabled);
    smsEnabledRef.current = smsEnabled;
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

    // API imperativa (sin deps para tener siempre el closure fresco)
    useEffect(() => {
        _start = (id: string) => {
            if (_activeFlag || activeTutorialRef.current) return;
            const t = TutorialService.getTutorial(id, { smsEnabled: smsEnabledRef.current });
            if (t) startTutorial(t);
        };
        return () => { _start = null; };
    });

    useEffect(() => {
        _activeFlag = !!activeTutorial;
    }, [activeTutorial]);

    // Ignorar activeTutorialId si ya hay un tutorial en curso
    useEffect(() => {
        if (!activeTutorialId) return;
        if (activeTutorialRef.current) return;
        const t = TutorialService.getTutorial(activeTutorialId, { smsEnabled: smsEnabledRef.current });
        if (t) startTutorial(t);
    }, [activeTutorialId]);

    // Si se pide el menú con un tutorial activo, se descarta la petición
    useEffect(() => {
        if (showMenu && activeTutorial) onCloseMenu?.();
    }, [showMenu, activeTutorial]);

    useEffect(() => {
        if (!activeTutorial) {
            measureSeqRef.current++;
            return;
        }
        measureStep(activeTutorial.steps[stepIndex], `${activeTutorial.id}:${stepIndex}`);
    }, [activeTutorial, stepIndex]);

    // Convierte un rect medido en coordenadas de pantalla (measureInWindow) a
    // coordenadas relativas al overlay, y recorta lo que no es visible —
    // limitándolo al contenedor indicado por clipId (p. ej. 'app_content' para
    // excluir la barra inferior, o 'accounts_root' para el módulo de Cuentas).
    const toOverlayRect = useCallback(async (raw: Rect, clipId: string | null, debugId?: string): Promise<Rect | null> => {
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
        if (clipId) {
            const c = await measureElement(clipId).catch(() => null);
            if (c) {
                top = c.y - origin.y;
                bottom = c.y + c.height - origin.y;
            }
        }

        const visTop = Math.max(y, top);
        const visBottom = Math.min(y + raw.height, bottom);
        const visH = visBottom - visTop;

        let out: Rect | null = null;
        if (!(visH <= 0 || visH < Math.min(48, raw.height * 0.4))) {
            const cx = Math.max(0, x);
            const cw = Math.min(raw.width - (cx - x), overlaySizeRef.current.width - cx);
            out = { x: cx, y: visTop, width: cw, height: visH };
        }

        if (__DEV__) {
            console.log('[Tutorial]', debugId, JSON.stringify({ raw, origin, clip: { top, bottom }, out }));
        }
        return out;
    }, [measureElement]);

    const measureStep = useCallback(async (step: TutorialStep, key: string) => {
        const seq = ++measureSeqRef.current;
        const stale = () => !isMountedRef.current || seq !== measureSeqRef.current;
        try {
            // 1. Teclado fuera (esperando a que el layout se reacomode)
            await ensureKeyboardHidden();
            if (stale()) return;

            // 2. Navegar si el paso pertenece a otra pantalla
            let navigated = false;
            if (step.screen && step.screen !== currentScreenRef.current && onNavigateRef.current) {
                onNavigateRef.current(step.screen);
                navigated = true;
            }

            // 3. Acción (p. ej. cambiar de pestaña interna)
            let waitedMount = false;
            if (step.action) {
                if (navigated) {
                    await sleep(NAV_MOUNT_MS);
                    waitedMount = true;
                    if (stale()) return;
                }
                for (let i = 0; i < ACTION_RETRIES; i++) {
                    if (runAction(step.action.id, step.action.arg)) break;
                    await sleep(ACTION_RETRY_MS);
                    if (stale()) return;
                }
                await sleep(ACTION_SETTLE_MS);
                if (stale()) return;
            }

            // 4. Paso sin elemento: tarjeta centrada sin resaltar nada
            if (!step.elementId) {
                setSpotlightRect(null);
                setFallback(false);
                setMeasuredKey(key);
                return;
            }

            // 5. Esperar a que la pantalla termine de montarse/asentarse
            if (navigated) {
                if (!waitedMount) {
                    await sleep(NAV_MOUNT_MS);
                    if (stale()) return;
                }
                await ensureKeyboardHidden();
                if (stale()) return;
                await sleep(NAV_SETTLE_MS);
            } else {
                await sleep(STEP_SETTLE_MS);
            }
            if (stale()) return;

            // 6. Scroll automático hasta el elemento
            const scrollKey = step.scrollKey ?? step.screen;
            if (scrollKey) {
                await ensureVisible(scrollKey, step.elementId).catch(() => false);
                if (stale()) return;
            }

            // 7. Medición con reintentos, esperando a que la posición se estabilice
            const elementId = step.elementId;
            const measureStable = async (): Promise<Rect | null> => {
                let last: Rect | null = null;
                for (let i = 0; i < MEASURE_ATTEMPTS; i++) {
                    if (stale()) return null;
                    last = await measureElement(elementId).catch(() => null);
                    if (last) break;
                    await sleep(MEASURE_RETRY_MS);
                }
                if (!last) return null;
                for (let i = 0; i < STABLE_MEASURE_EXTRA; i++) {
                    await sleep(STABLE_MEASURE_MS);
                    if (stale()) return null;
                    const next = await measureElement(elementId).catch(() => null);
                    if (stale()) return null;
                    if (!next) continue;
                    const stable =
                        Math.abs(next.x - last.x) <= STABLE_TOLERANCE_PX &&
                        Math.abs(next.y - last.y) <= STABLE_TOLERANCE_PX &&
                        Math.abs(next.width - last.width) <= STABLE_TOLERANCE_PX &&
                        Math.abs(next.height - last.height) <= STABLE_TOLERANCE_PX;
                    last = next;
                    if (stable) break;
                }
                return last;
            };
            const raw = await measureStable();
            if (stale()) return;

            // 8. Recorte al contenedor de la pantalla
            const clipId = step.screen === 'accounts' ? 'accounts_root' : step.screen ? 'app_content' : null;
            const rect = raw ? await toOverlayRect(raw, clipId, `${key}:${step.elementId}`) : null;
            if (stale()) return;

            // 9. Sin rect visible: tarjeta centrada con nota de fallback
            setSpotlightRect(rect);
            setFallback(!rect);
            setMeasuredKey(key);
        } catch (e) {
            if (stale()) return;
            console.warn('[Tutorial] measureStep:', e);
            setSpotlightRect(null);
            setFallback(!!step.elementId);
            setMeasuredKey(key);
        }
    }, [measureElement, ensureVisible, runAction, toOverlayRect]);

    const startTutorial = (tutorial: Tutorial) => {
        // Si Cuentas está abierto y el tutorial no es de Cuentas, volver a una pantalla normal
        if (currentScreenRef.current === 'accounts' && !tutorial.steps.some(s => s.screen === 'accounts')) {
            onNavigateRef.current?.(tutorial.steps.find(s => s.screen)?.screen ?? 'dashboard');
        }
        _activeFlag = true;
        setActiveTutorial(tutorial);
        setStepIndex(0);
        setSpotlightRect(null);
        setFallback(false);
        setMeasuredKey(null);
    };

    const handleNext = async () => {
        if (!activeTutorial) return;
        if (stepIndex < activeTutorial.steps.length - 1) {
            setSpotlightRect(null);
            setFallback(false);
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
        _activeFlag = false;
        setActiveTutorial(null);
        setStepIndex(0);
        setSpotlightRect(null);
        setFallback(false);
        setMeasuredKey(null);
        onTutorialEnd?.();
    };

    // El botón Atrás de Android cierra el tutorial en vez de salir de la pantalla
    // en la que el tutorial nos dejó (incluido el módulo de Cuentas).
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
                    <SpotlightMask rect={spotlightRect} padding={currentStep.padding ?? PADDING} soft={fallback} width={overlaySize.width} height={overlaySize.height} />
                    {/* Bloquea todos los toques */}
                    <TouchableWithoutFeedback onPress={() => { }}>
                        <View style={StyleSheet.absoluteFill} />
                    </TouchableWithoutFeedback>
                    {/* Card encima del bloqueador */}
                    {cardReady && (
                        <StepCard
                            key={currentKey ?? undefined}
                            tutorial={activeTutorial}
                            step={currentStep}
                            stepIndex={stepIndex}
                            rect={spotlightRect}
                            fallback={fallback}
                            containerHeight={overlaySize.height}
                            onNext={handleNext}
                            onSkip={endTutorial}
                        />
                    )}
                </View>
            )}

            {/* MENÚ */}
            {showMenu && !activeTutorial && (
                <TutorialMenu
                    completed={completed}
                    tutorials={TutorialService.getTutorials({ smsEnabled })}
                    onSelect={t => {
                        onCloseMenu?.();
                        if (activeTutorialRef.current) return;
                        startTutorial(t);
                    }}
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
let _start: ((id: string) => void) | null = null;
let _activeFlag = false;

/** Inicia un tutorial por id desde cualquier pantalla. Se ignora si ya hay uno activo. */
export function startTutorialById(id: string) {
    try {
        _start?.(id);
    } catch (e) {
        console.warn('[Tutorial] startTutorialById:', e);
    }
}

/** true mientras hay un tutorial en curso. */
export function isTutorialActive() {
    return _activeFlag;
}

export function TutorialMenuButton() {
    return (
        <TouchableOpacity
            style={{ padding: 4 }}
            onPress={() => _openMenu?.()}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
            <Ionicons name="help-circle-outline" size={24} color={C.primaryLight} />
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
// elevation 9999 (mayor que la de la TabBar y de AccountsScreen, que usan <= 50)
// para que el overlay del tutorial quede siempre encima en Android.
const ov = StyleSheet.create({
    root: { ...StyleSheet.absoluteFillObject, zIndex: 9999, elevation: 9999 },
});

const card = StyleSheet.create({
    container: { position: "absolute", borderRadius: 22, overflow: "hidden", backgroundColor: C.cardHigh, padding: 22, zIndex: 9999 },
    containerCompact: { padding: 16 },
    overlapBorder: { ...StyleSheet.absoluteFillObject, borderRadius: 22, borderWidth: 1, borderColor: C.glassActiveBorder },
    progressRow: { flexDirection: "row", gap: 6, marginBottom: 18, alignItems: "center" },
    progressDot: { height: 6, borderRadius: 3 },
    iconWrap: { width: 58, height: 58, borderRadius: 18, borderWidth: 1.5, backgroundColor: C.glassActive, borderColor: C.glassActiveBorder, alignItems: "center", justifyContent: "center", marginBottom: 14 },
    title: { color: C.textPrimary, fontSize: 19, fontWeight: "900", marginBottom: 8, lineHeight: 26 },
    desc: { color: C.text, fontSize: 14, lineHeight: 22, marginBottom: 14 },
    notice: { marginBottom: 14 },
    counter: { color: C.textSub, fontSize: 11, letterSpacing: 1, marginBottom: 14 },
    btnRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    skipBtn: { flex: 1, paddingHorizontal: 4 },
    nextBtn: { flex: 2 },
});

const mn = StyleSheet.create({
    overlay: { flex: 1, justifyContent: "flex-end" },
    sheet: { backgroundColor: C.bg, overflow: "hidden", borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingTop: 24, paddingHorizontal: 16 },
    handle: { width: 40, height: 4, backgroundColor: C.glassBorder, borderRadius: 2, alignSelf: "center", marginBottom: 16 },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 6 },
    title: { color: C.textPrimary, fontSize: 20, fontWeight: "900", flex: 1, flexShrink: 1 },
    closeBtn: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    subtitle: { color: C.textSub, fontSize: 13, marginBottom: 20 },
    itemWrap: { marginBottom: 10 },
    item: { flexDirection: "row", alignItems: "center", padding: 12, paddingLeft: 15, gap: 10 },
    itemIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: C.glassActive, alignItems: "center", justifyContent: "center" },
    titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 },
    itemTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800", flexShrink: 1 },
    itemDesc: { color: C.textSub, fontSize: 12, marginTop: 3, flexShrink: 1 },
    itemSteps: { color: C.textSub, fontSize: 11, marginTop: 4 },
    doneBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: C.income + "22", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, flexShrink: 0 },
    doneTxt: { color: C.income, fontSize: 10, fontWeight: "700" },
});
