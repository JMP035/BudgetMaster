import React from "react";
import { Platform, StyleSheet, View, StyleProp, ViewStyle } from "react-native";
import { BlurView } from "expo-blur";
import { C } from "../theme";

// experimental en Android; si el scroll del Inicio se traba, cambiar a 'none' (queda vidrio translúcido sin desenfoque real)
export const GLASS_ANDROID_BLUR_METHOD: 'none' | 'dimezisBlurView' = 'dimezisBlurView';

export interface GlassBackgroundProps {
    radius?: number;
    blur?: boolean;
    intensity?: number;
    highlightColor?: string;
    topAccentColor?: string;
    topAccentWidth?: number;
    leftAccentColor?: string;
}

export function GlassBackground({
    radius = 16,
    blur = true,
    intensity = 40,
    highlightColor = C.glassHighlight,
    topAccentColor,
    topAccentWidth = 3,
    leftAccentColor,
}: GlassBackgroundProps) {
    return (
        <View pointerEvents="none" style={[StyleSheet.absoluteFill, { borderRadius: radius, overflow: "hidden" }]}>
            {blur && (
                <BlurView
                    tint="dark"
                    intensity={intensity}
                    experimentalBlurMethod={Platform.OS === "android" ? GLASS_ANDROID_BLUR_METHOD : undefined}
                    blurReductionFactor={4}
                    style={StyleSheet.absoluteFill}
                />
            )}
            <View style={[StyleSheet.absoluteFill, { backgroundColor: C.glassFill }]} />
            <View style={[styles.sheen, { backgroundColor: C.glassSheen }]} />
            <View style={[StyleSheet.absoluteFill, { borderRadius: radius, borderWidth: 1, borderColor: C.glassBorder }]} />
            {topAccentColor ? (
                <View style={[styles.topAccent, { height: topAccentWidth, backgroundColor: topAccentColor }]} />
            ) : (
                <>
                    <View style={[styles.topHighlight1, { backgroundColor: highlightColor, left: radius * 0.6, right: radius * 0.6 }]} />
                    <View style={[styles.topHighlight2, { backgroundColor: C.glassHighlightSoft, left: radius * 0.6, right: radius * 0.6 }]} />
                </>
            )}
            {leftAccentColor && (
                <View style={[styles.leftAccent, { backgroundColor: leftAccentColor }]} />
            )}
        </View>
    );
}

export interface GlassCardProps extends GlassBackgroundProps {
    children?: React.ReactNode;
    style?: StyleProp<ViewStyle>;
    contentStyle?: StyleProp<ViewStyle>;
}

export function GlassCard({ children, style, contentStyle, ...bgProps }: GlassCardProps) {
    const radius = bgProps.radius ?? 16;
    return (
        <View style={[{ borderRadius: radius, overflow: "hidden" }, style]}>
            <GlassBackground {...bgProps} />
            <View style={contentStyle}>{children}</View>
        </View>
    );
}

const styles = StyleSheet.create({
    sheen: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        height: "45%",
    },
    topAccent: {
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
    },
    topHighlight1: {
        position: "absolute",
        top: 0,
        height: 1,
    },
    topHighlight2: {
        position: "absolute",
        top: 1,
        height: 1,
    },
    leftAccent: {
        position: "absolute",
        top: 0,
        bottom: 0,
        left: 0,
        width: 3,
    },
});

export default GlassCard;
