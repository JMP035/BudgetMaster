import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { StyleProp, StyleSheet, TouchableOpacity, ViewStyle } from "react-native";
import { C } from "../theme";
import { GlassBackground } from "./GlassCard";
import { isTutorialActive, openTutorialMenu, startTutorialById } from "./TutorialOverlay";

interface HelpButtonProps {
    /** id del tutorial del módulo (ver TUTORIALS en services/Tutorial.ts) */
    tutorialId: string;
    size?: number;
    style?: StyleProp<ViewStyle>;
}

/**
 * Botón "?" para el encabezado de cada módulo: un toque abre el tutorial del
 * módulo; mantener presionado abre el menú con todos los tutoriales.
 */
export function HelpButton({ tutorialId, size = 36, style }: HelpButtonProps) {
    return (
        <TouchableOpacity
            onPress={() => { if (!isTutorialActive()) startTutorialById(tutorialId); }}
            onLongPress={openTutorialMenu}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel="Ver el tutorial de este módulo"
            accessibilityHint="Mantén presionado para ver todos los tutoriales"
            style={[s.btn, { width: size, height: size, borderRadius: size / 2 }, style]}
        >
            <GlassBackground radius={size / 2} blur={false} />
            <Ionicons name="help-circle-outline" size={Math.round(size * 0.58)} color={C.primaryLight} />
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    btn: { overflow: "hidden", alignItems: "center", justifyContent: "center" },
});

export default HelpButton;
