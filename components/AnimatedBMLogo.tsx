import React, { useEffect } from "react";
import Animated, {
    Easing, useAnimatedProps, useAnimatedStyle, useReducedMotion, useSharedValue,
    withDelay, withSequence, withSpring, withTiming,
} from "react-native-reanimated";
import Svg, { ClipPath, Defs, G, LinearGradient, Path, Rect, Stop } from "react-native-svg";
import { C } from "../theme";
import { BM_ASPECT, BM_LETTERS, BM_NEON, BM_NEON_LEN, BM_OUTLINE_LEN, BM_VIEWBOX } from "./bmLogoGeometry";

const AnimatedPath = Animated.createAnimatedComponent(Path);
const AnimatedRect = Animated.createAnimatedComponent(Rect);
const SHEEN_FROM = 60;
const SHEEN_TO = 860;
/** Momento (ms desde el montaje) en que el logo ya se ve completo: SplashScreen hace entrar el título solapado. */
export const LOGO_TITLE_AT_MS = 1500;

export default function AnimatedBMLogo({ width = 150 }: { width?: number }) {
    const reduce = useReducedMotion();
    const height = width * BM_ASPECT;
    const neonDash = useSharedValue(reduce ? 0 : BM_NEON_LEN + 2);
    const outlineDash = useSharedValue(reduce ? 0 : BM_OUTLINE_LEN + 2);
    const outlineOpacity = useSharedValue(reduce ? 0.45 : 1);
    const fill = useSharedValue(reduce ? 1 : 0);
    const sheenX = useSharedValue(reduce ? SHEEN_TO : SHEEN_FROM);
    const halo = useSharedValue(reduce ? 0.25 : 0.2);
    const scale = useSharedValue(reduce ? 1 : 0.94);

    useEffect(() => {
        if (reduce) return; // movimiento reducido: ya arrancó en el estado final
        neonDash.value = withDelay(300, withTiming(0, { duration: 700, easing: Easing.inOut(Easing.cubic) }));
        outlineDash.value = withDelay(500, withTiming(0, { duration: 650, easing: Easing.inOut(Easing.quad) }));
        fill.value = withDelay(950, withTiming(1, { duration: 400, easing: Easing.out(Easing.cubic) }));
        outlineOpacity.value = withDelay(1150, withTiming(0.45, { duration: 300, easing: Easing.linear }));
        sheenX.value = withDelay(1200, withTiming(SHEEN_TO, { duration: 550, easing: Easing.inOut(Easing.quad) }));
        scale.value = withDelay(300, withSequence(
            withTiming(0.96, { duration: 950, easing: Easing.linear }),
            withTiming(1.03, { duration: 200, easing: Easing.out(Easing.quad) }),
            withSpring(1, { damping: 12, stiffness: 180, mass: 1 }),
        ));
        halo.value = withDelay(1350, withSequence(
            withTiming(0.45, { duration: 200, easing: Easing.out(Easing.quad) }),
            withTiming(0.25, { duration: 400, easing: Easing.inOut(Easing.quad) }),
        ));
    }, [reduce]);

    const haloProps = useAnimatedProps(() => ({ strokeDashoffset: neonDash.value, strokeOpacity: halo.value }));
    const neonMidProps = useAnimatedProps(() => ({ strokeDashoffset: neonDash.value }));
    const neonCoreProps = useAnimatedProps(() => ({ strokeDashoffset: neonDash.value }));
    const fillProps = useAnimatedProps(() => ({ fillOpacity: fill.value }));
    const sheenProps = useAnimatedProps(() => ({ x: sheenX.value }));
    const outlineProps = useAnimatedProps(() => ({ strokeDashoffset: outlineDash.value, strokeOpacity: outlineOpacity.value }));
    const wrapStyle = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

    return (
        <Animated.View style={[{ width, height }, wrapStyle]} accessible accessibilityRole="image" accessibilityLabel="BudgetMaster">
            <Svg width={width} height={height} viewBox={BM_VIEWBOX}>
                <Defs>
                    <LinearGradient id="bmCopper" gradientUnits="userSpaceOnUse" x1="400" y1="316" x2="560" y2="704">
                        <Stop offset="0" stopColor={C.copperGlow} />
                        <Stop offset="0.2" stopColor={C.copperLight} />
                        <Stop offset="0.5" stopColor={C.copperDark} />
                        <Stop offset="0.78" stopColor={C.copper} />
                        <Stop offset="1" stopColor={C.copperLight} />
                    </LinearGradient>
                    <LinearGradient id="bmSheen" x1="0" y1="0" x2="1" y2="0">
                        <Stop offset="0" stopColor={C.primaryGlow} stopOpacity={0} />
                        <Stop offset="0.5" stopColor={C.primaryGlow} stopOpacity={0.85} />
                        <Stop offset="1" stopColor={C.primaryGlow} stopOpacity={0} />
                    </LinearGradient>
                    <ClipPath id="bmClip"><Path d={BM_LETTERS} clipRule="evenodd" /></ClipPath>
                </Defs>
                {/* 1. Neón: halo, medio y núcleo comparten el dashoffset */}
                <AnimatedPath d={BM_NEON} fill="none" stroke={C.accent} strokeWidth={20} strokeLinecap="round"
                    strokeDasharray={[BM_NEON_LEN, BM_NEON_LEN]} animatedProps={haloProps} />
                <AnimatedPath d={BM_NEON} fill="none" stroke={C.accent} strokeWidth={10} strokeOpacity={0.35} strokeLinecap="round"
                    strokeDasharray={[BM_NEON_LEN, BM_NEON_LEN]} animatedProps={neonMidProps} />
                <AnimatedPath d={BM_NEON} fill="none" stroke={C.accentLight} strokeWidth={4} strokeLinecap="round"
                    strokeDasharray={[BM_NEON_LEN, BM_NEON_LEN]} animatedProps={neonCoreProps} />
                {/* 2. Relleno de cobre */}
                <AnimatedPath d={BM_LETTERS} fill="url(#bmCopper)" fillRule="evenodd" animatedProps={fillProps} />
                {/* 3. Destello diagonal recortado a las letras */}
                <G clipPath="url(#bmClip)">
                    <G transform="rotate(20 512 511)">
                        <AnimatedRect y={150} width={120} height={720} fill="url(#bmSheen)" animatedProps={sheenProps} />
                    </G>
                </G>
                {/* 4. Contorno que se traza y después queda como borde de luz */}
                <AnimatedPath d={BM_LETTERS} fill="none" stroke={C.copperGlow} strokeWidth={3} strokeLinejoin="round"
                    strokeDasharray={[BM_OUTLINE_LEN, BM_OUTLINE_LEN]} animatedProps={outlineProps} />
            </Svg>
        </Animated.View>
    );
}
