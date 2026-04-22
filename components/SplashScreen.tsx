import React, { useEffect, useRef } from "react";
import {
    Animated, Dimensions, Easing, StyleSheet, Text, View
} from "react-native";
import { C } from "../theme";

const { width, height } = Dimensions.get("window");

// ─────────────────────────────────────────────────────────────
// PARTÍCULA INDIVIDUAL
// ─────────────────────────────────────────────────────────────
interface ParticleProps {
    delay: number;
    x: number;
    size: number;
    color: string;
    duration: number;
}

function Particle({ delay, x, size, color, duration }: ParticleProps) {
    const translateY = useRef(new Animated.Value(height * 0.6)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    const scale = useRef(new Animated.Value(0.3)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
                Animated.timing(opacity, {
                    toValue: 0.8,
                    duration: 400,
                    useNativeDriver: true,
                }),
                Animated.spring(scale, {
                    toValue: 1,
                    friction: 4,
                    useNativeDriver: true,
                }),
                Animated.timing(translateY, {
                    toValue: -height * 0.2,
                    duration,
                    easing: Easing.out(Easing.quad),
                    useNativeDriver: true,
                }),
            ]),
            Animated.timing(opacity, {
                toValue: 0,
                duration: 600,
                useNativeDriver: true,
            }),
        ]).start();
    }, []);

    return (
        <Animated.View
            style={{
                position: "absolute",
                left: x,
                bottom: height * 0.3,
                width: size,
                height: size,
                borderRadius: size / 2,
                backgroundColor: color,
                opacity,
                transform: [{ translateY }, { scale }],
            }}
        />
    );
}

// ─────────────────────────────────────────────────────────────
// ANILLO GIRATORIO
// ─────────────────────────────────────────────────────────────
function SpinningRing({ size, color, delay, duration, clockwise = true }: {
    size: number; color: string; delay: number; duration: number; clockwise?: boolean;
}) {
    const rotate = useRef(new Animated.Value(0)).current;
    const opacity = useRef(new Animated.Value(0)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.delay(delay),
            Animated.parallel([
                Animated.timing(opacity, { toValue: 1, duration: 600, useNativeDriver: true }),
                Animated.loop(
                    Animated.timing(rotate, {
                        toValue: 1,
                        duration,
                        easing: Easing.linear,
                        useNativeDriver: true,
                    })
                ),
            ]),
        ]).start();
    }, []);

    const spin = rotate.interpolate({
        inputRange: [0, 1],
        outputRange: clockwise ? ["0deg", "360deg"] : ["360deg", "0deg"],
    });

    return (
        <Animated.View
            style={{
                position: "absolute",
                width: size,
                height: size,
                borderRadius: size / 2,
                borderWidth: 1.5,
                borderColor: "transparent",
                borderTopColor: color,
                borderRightColor: color + "66",
                opacity,
                transform: [{ rotate: spin }],
            }}
        />
    );
}

// ─────────────────────────────────────────────────────────────
// SPLASH SCREEN PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props { onDone: () => void; }

export default function SplashScreen({ onDone }: Props) {
    // Animaciones principales
    const bgOpacity = useRef(new Animated.Value(0)).current;
    const logoScale = useRef(new Animated.Value(0)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const glowScale = useRef(new Animated.Value(0.5)).current;
    const glowOpacity = useRef(new Animated.Value(0)).current;
    const titleOpacity = useRef(new Animated.Value(0)).current;
    const titleY = useRef(new Animated.Value(20)).current;
    const subOpacity = useRef(new Animated.Value(0)).current;
    const subY = useRef(new Animated.Value(15)).current;
    const tagOpacity = useRef(new Animated.Value(0)).current;
    const barWidth = useRef(new Animated.Value(0)).current;
    const barOpacity = useRef(new Animated.Value(0)).current;
    const fadeOut = useRef(new Animated.Value(1)).current;
    const shimmer = useRef(new Animated.Value(0)).current;

    // Partículas
    const particles = [
        { delay: 600, x: width * 0.15, size: 6, color: C.primary, duration: 2200 },
        { delay: 800, x: width * 0.30, size: 4, color: C.primaryLight, duration: 1800 },
        { delay: 700, x: width * 0.50, size: 8, color: C.accent, duration: 2000 },
        { delay: 900, x: width * 0.65, size: 5, color: C.primary, duration: 2400 },
        { delay: 750, x: width * 0.80, size: 4, color: C.primaryGlow, duration: 1900 },
        { delay: 1000, x: width * 0.22, size: 3, color: C.accentLight, duration: 2100 },
        { delay: 850, x: width * 0.72, size: 7, color: C.primaryLight, duration: 2300 },
        { delay: 650, x: width * 0.42, size: 5, color: C.primary, duration: 1700 },
    ];

    useEffect(() => {
        // Shimmer loop en el logo
        Animated.loop(
            Animated.sequence([
                Animated.timing(shimmer, { toValue: 1, duration: 1500, useNativeDriver: true }),
                Animated.timing(shimmer, { toValue: 0, duration: 1500, useNativeDriver: true }),
            ])
        ).start();

        // Secuencia principal
        Animated.sequence([
            // Fondo aparece
            Animated.timing(bgOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),

            // Glow y logo entran
            Animated.parallel([
                Animated.spring(glowScale, { toValue: 1, friction: 4, useNativeDriver: true }),
                Animated.timing(glowOpacity, { toValue: 0.6, duration: 600, useNativeDriver: true }),
                Animated.spring(logoScale, { toValue: 1, friction: 3.5, tension: 40, useNativeDriver: true }),
                Animated.timing(logoOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
            ]),

            Animated.delay(200),

            // Título entra
            Animated.parallel([
                Animated.timing(titleOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
                Animated.timing(titleY, { toValue: 0, duration: 500, easing: Easing.out(Easing.back(1.5)), useNativeDriver: true }),
            ]),

            Animated.delay(100),

            // Subtítulo
            Animated.parallel([
                Animated.timing(subOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
                Animated.timing(subY, { toValue: 0, duration: 400, easing: Easing.out(Easing.quad), useNativeDriver: true }),
            ]),

            Animated.delay(100),

            // Tagline
            Animated.timing(tagOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),

            Animated.delay(200),

            // Barra de carga
            Animated.parallel([
                Animated.timing(barOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
                Animated.timing(barWidth, { toValue: 1, duration: 1200, easing: Easing.inOut(Easing.cubic), useNativeDriver: false }),
            ]),

            Animated.delay(300),

            // Fade out final
            Animated.timing(fadeOut, { toValue: 0, duration: 500, useNativeDriver: true }),

        ]).start(() => onDone());
    }, []);

    const barW = barWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });
    const shimmerOpacity = shimmer.interpolate({ inputRange: [0, 1], outputRange: [0.05, 0.2] });

    return (
        <Animated.View style={[s.container, { opacity: fadeOut }]}>

            {/* FONDO GRADIENTE SIMULADO */}
            <Animated.View style={[s.bg, { opacity: bgOpacity }]}>
                <View style={s.bgGradient1} />
                <View style={s.bgGradient2} />
                <View style={s.bgGradient3} />
            </Animated.View>

            {/* PARTÍCULAS */}
            {particles.map((p, i) => <Particle key={i} {...p} />)}

            {/* ANILLOS GIRATORIOS */}
            <SpinningRing size={320} color={C.primary + "30"} delay={300} duration={12000} clockwise />
            <SpinningRing size={260} color={C.primary + "40"} delay={500} duration={9000} clockwise={false} />
            <SpinningRing size={200} color={C.accent + "50"} delay={700} duration={7000} clockwise />
            <SpinningRing size={140} color={C.primary + "60"} delay={400} duration={5000} clockwise={false} />

            {/* GLOW CENTRAL */}
            <Animated.View style={[s.glow, {
                opacity: glowOpacity,
                transform: [{ scale: glowScale }],
            }]} />

            {/* LOGO */}
            <Animated.View style={[s.logoWrap, {
                opacity: logoOpacity,
                transform: [{ scale: logoScale }],
            }]}>
                {/* Shimmer interior */}
                <Animated.View style={[s.logoShimmer, { opacity: shimmerOpacity }]} />

                {/* Símbolo $ estilizado en cobre */}
                <View style={s.logoInner}>
                    <Text style={s.logoSymbol}>₿</Text>
                    <Text style={s.logoSubSymbol}>M</Text>
                </View>

                {/* Borde brillante */}
                <View style={s.logoBorderTop} />
            </Animated.View>

            {/* TEXTOS */}
            <View style={s.textBlock}>
                <Animated.Text style={[s.title, {
                    opacity: titleOpacity,
                    transform: [{ translateY: titleY }],
                }]}>
                    BudgetMaster
                </Animated.Text>

                <Animated.Text style={[s.subtitle, {
                    opacity: subOpacity,
                    transform: [{ translateY: subY }],
                }]}>
                    TU CFO PERSONAL
                </Animated.Text>

                <Animated.Text style={[s.tagline, { opacity: tagOpacity }]}>
                    Inteligencia Financiera · Disciplina · Libertad
                </Animated.Text>
            </View>

            {/* BARRA DE CARGA */}
            <Animated.View style={[s.barWrap, { opacity: barOpacity }]}>
                <View style={s.barTrack}>
                    <Animated.View style={[s.barFill, { width: barW }]}>
                        <View style={s.barGlow} />
                    </Animated.View>
                </View>
                <Text style={s.barLabel}>Iniciando sistema financiero...</Text>
            </Animated.View>

            {/* VERSION */}
            <Animated.Text style={[s.version, { opacity: tagOpacity }]}>
                v1.0 — Powered by AI
            </Animated.Text>

        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: C.bgDeep,
        alignItems: "center",
        justifyContent: "center",
    },

    // Fondo
    bg: { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
    bgGradient1: { position: "absolute", width: 600, height: 600, borderRadius: 300, backgroundColor: C.primary + "08", top: -100 },
    bgGradient2: { position: "absolute", width: 400, height: 400, borderRadius: 200, backgroundColor: C.accent + "06", bottom: -50 },
    bgGradient3: { position: "absolute", width: 300, height: 300, borderRadius: 150, backgroundColor: C.primary + "05", top: height * 0.3 },

    // Glow
    glow: {
        position: "absolute",
        width: 200,
        height: 200,
        borderRadius: 100,
        backgroundColor: C.primary + "15",
        shadowColor: C.primaryGlow,
        shadowOpacity: 1,
        shadowRadius: 60,
        elevation: 30,
    },

    // Logo
    logoWrap: {
        width: 110,
        height: 110,
        borderRadius: 30,
        backgroundColor: C.card,
        borderWidth: 1.5,
        borderColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
        marginBottom: 32,
        shadowColor: C.primaryGlow,
        shadowOpacity: 0.9,
        shadowRadius: 30,
        elevation: 20,
        overflow: "hidden",
    },
    logoShimmer: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "50%",
        backgroundColor: "#FFFFFF",
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
    },
    logoInner: {
        alignItems: "center",
        justifyContent: "center",
    },
    logoSymbol: {
        fontSize: 42,
        color: C.primaryLight,
        fontWeight: "900",
        lineHeight: 48,
    },
    logoSubSymbol: {
        fontSize: 11,
        color: C.accent,
        fontWeight: "900",
        letterSpacing: 4,
        marginTop: -4,
    },
    logoBorderTop: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: 2,
        backgroundColor: C.primaryGlow,
        opacity: 0.8,
    },

    // Textos
    textBlock: { alignItems: "center", marginBottom: 52 },
    title: {
        color: C.primaryLight,
        fontSize: 36,
        fontWeight: "900",
        letterSpacing: 1.5,
        marginBottom: 6,
        textShadowColor: C.primaryGlow,
        textShadowOffset: { width: 0, height: 0 },
        textShadowRadius: 20,
    },
    subtitle: {
        color: C.accent,
        fontSize: 12,
        fontWeight: "900",
        letterSpacing: 5,
        marginBottom: 12,
    },
    tagline: {
        color: C.textMuted,
        fontSize: 11,
        letterSpacing: 1.5,
        textAlign: "center",
    },

    // Barra
    barWrap: { width: width * 0.65, alignItems: "center", position: "absolute", bottom: 80 },
    barTrack: {
        width: "100%",
        height: 3,
        backgroundColor: C.card,
        borderRadius: 2,
        overflow: "hidden",
        marginBottom: 10,
        borderWidth: 1,
        borderColor: C.cardBorder,
    },
    barFill: {
        height: "100%",
        backgroundColor: C.primary,
        borderRadius: 2,
    },
    barGlow: {
        position: "absolute",
        right: 0,
        top: -3,
        width: 20,
        height: 9,
        backgroundColor: C.primaryGlow,
        borderRadius: 4,
        opacity: 0.9,
    },
    barLabel: {
        color: C.textMuted,
        fontSize: 11,
        letterSpacing: 1,
    },

    // Versión
    version: {
        position: "absolute",
        bottom: 30,
        color: C.textMuted,
        fontSize: 10,
        letterSpacing: 1,
        opacity: 0.5,
    },
});