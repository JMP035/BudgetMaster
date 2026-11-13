import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Linking, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { C } from "../../theme";
import { GlassButton } from "../GlassButton";
import { GlassCard } from "../GlassCard";
import { InlineNotice } from "../InlineNotice";
import { ps, StepHeader, StepProps, StyledInput } from "./OnbPrimitives";

const AI_STUDIO_URL = "https://aistudio.google.com/apikey";

const STEPS = [
    "Abrí aistudio.google.com/apikey con tu cuenta de Google.",
    "Tocá Create API key.",
    "Copiala y pegala acá.",
];

/** Asesor IA (opcional): clave gratuita de Google Gemini. Vacío es válido. */
export default function StepGemini({ draft, onChange }: StepProps) {
    const [visible, setVisible] = useState(false);
    const key = draft.geminiApiKey.trim();
    // ai.ts exige más de 20 caracteres
    const incomplete = key.length > 0 && key.length < 21;

    const openStudio = () => { Linking.openURL(AI_STUDIO_URL).catch(() => { }); };

    return (
        <>
            <StepHeader
                icon="sparkles-outline"
                title="Asesor IA"
                subtitle="El Asesor ya funciona sin configurar nada, con respuestas locales basadas en tus datos. Si agregás una clave gratuita de Google Gemini, responde en lenguaje natural. Al usarla, un resumen de tus finanzas se envía a Google para generar la respuesta."
            />

            <GlassCard radius={14} blur={false} contentStyle={ps.cardContent}>
                {STEPS.map((st, idx) => (
                    <View key={idx} style={[s.stepRow, idx === STEPS.length - 1 && { marginBottom: 0 }]}>
                        <Text style={s.stepNum}>{idx + 1}</Text>
                        <Text style={s.stepTxt}>{st}</Text>
                    </View>
                ))}
            </GlassCard>

            <GlassButton
                label="Abrir AI Studio"
                icon="open-outline"
                kind="secondary"
                onPress={openStudio}
                style={{ marginTop: 12 }}
            />

            <Text style={ps.label}>Tu clave</Text>
            <StyledInput
                value={draft.geminiApiKey}
                onChangeText={geminiApiKey => onChange({ geminiApiKey })}
                placeholder="AIzaSy..."
                autoCapitalize="none"
                autoCorrect={false}
                secureTextEntry={!visible}
                accessibilityLabel="Clave de Google Gemini"
                right={(
                    <TouchableOpacity
                        onPress={() => setVisible(v => !v)}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                        accessibilityRole="button"
                        accessibilityLabel={visible ? "Ocultar clave" : "Mostrar clave"}
                        style={{ marginLeft: 6 }}
                    >
                        <Ionicons name={visible ? "eye-off-outline" : "eye-outline"} size={20} color={C.textSub} />
                    </TouchableOpacity>
                )}
            />
            {incomplete && <InlineNotice variant="warning" style={ps.notice} text="La clave parece incompleta" />}
        </>
    );
}

const s = StyleSheet.create({
    stepRow: { flexDirection: "row", gap: 10, marginBottom: 10 },
    stepNum: { color: C.primaryLight, fontSize: 14, fontWeight: "900", width: 18 },
    stepTxt: { color: C.text, fontSize: 14, lineHeight: 20, flex: 1, flexShrink: 1 },
});
