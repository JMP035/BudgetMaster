// Cuerpo de un paso del tutorial con formato: frase clave (lead), párrafos, viñetas, notas «Ojo:», ejemplos y
// nombres entre «…» resaltados en bronce. El marcado y su parser viven en services/TutorialText.ts (puro).
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { parseTutorialText } from "../services/TutorialText";
import type { TutorialBlock, TutorialSpan } from "../services/TutorialText";
import { C } from "../theme";

/**
 * Texto justificado solo en párrafos (nunca en viñetas ni notas). Apagado: con ~42 caracteres por línea y palabras
 * largas en español deja huecos grandes entre palabras. Se deja la opción para probarla en un teléfono real.
 */
const TUTORIAL_JUSTIFY = false;

const MAX_FONT_SCALE = 1.3;

function Spans({ spans, base }: { spans: TutorialSpan[]; base?: object }) {
    return (
        <>
            {spans.map((sp, i) => (
                sp.highlight
                    ? <Text key={i} style={[base, rt.highlight]}>{sp.text}</Text>
                    : <Text key={i} style={base}>{sp.text}</Text>
            ))}
        </>
    );
}

function Block({ block, last, nextKind }: { block: TutorialBlock; last: boolean; nextKind?: TutorialBlock["kind"] }) {
    if (block.kind === "bullet") {
        // Sangría colgante: el punto va en su propia columna y el texto no vuelve bajo él.
        const gap = last ? 0 : nextKind === "bullet" ? 4 : 8;
        return (
            <View style={[rt.bulletRow, { marginBottom: gap }]}>
                <Text style={rt.bulletDot} maxFontSizeMultiplier={MAX_FONT_SCALE}>•</Text>
                <Text style={rt.bulletTxt} maxFontSizeMultiplier={MAX_FONT_SCALE} android_hyphenationFrequency="none">
                    <Spans spans={block.spans} />
                </Text>
            </View>
        );
    }
    const mb = last ? 0 : 8;
    if (block.kind === "note") {
        return (
            <View style={[rt.note, { marginBottom: mb }]}>
                <Text style={rt.noteTxt} maxFontSizeMultiplier={MAX_FONT_SCALE} android_hyphenationFrequency="none">
                    <Text style={rt.label}>{block.label} </Text>
                    <Spans spans={block.spans} />
                </Text>
            </View>
        );
    }
    if (block.kind === "example") {
        return (
            <Text style={[rt.exampleTxt, { marginBottom: mb }]} maxFontSizeMultiplier={MAX_FONT_SCALE} android_hyphenationFrequency="none">
                <Text style={rt.label}>{block.label} </Text>
                <Spans spans={block.spans} />
            </Text>
        );
    }
    return (
        <Text
            style={[rt.para, { marginBottom: mb }, TUTORIAL_JUSTIFY && { textAlign: "justify" }]}
            maxFontSizeMultiplier={MAX_FONT_SCALE}
            textBreakStrategy="balanced"
            android_hyphenationFrequency={TUTORIAL_JUSTIFY ? "normal" : "none"}
        >
            <Spans spans={block.spans} />
        </Text>
    );
}

export function TutorialRichText({ lead, text }: { lead?: string; text: string }) {
    const blocks = parseTutorialText(text);
    return (
        <View style={rt.wrap}>
            {!!lead && (
                <Text style={[rt.lead, blocks.length === 0 && { marginBottom: 0 }]} maxFontSizeMultiplier={MAX_FONT_SCALE} textBreakStrategy="balanced">
                    {lead}
                </Text>
            )}
            {blocks.map((b, i) => (
                <Block key={i} block={b} last={i === blocks.length - 1} nextKind={blocks[i + 1]?.kind} />
            ))}
        </View>
    );
}

const rt = StyleSheet.create({
    wrap: { marginBottom: 10 },
    lead: { color: C.text, fontSize: 15, lineHeight: 22, fontWeight: "800", marginBottom: 8 },
    para: { color: C.text, fontSize: 14, lineHeight: 21 },
    bulletRow: { flexDirection: "row", alignItems: "flex-start" },
    bulletDot: { width: 14, color: C.primaryLight, fontSize: 14, lineHeight: 21, fontWeight: "900" },
    bulletTxt: { flex: 1, color: C.text, fontSize: 14, lineHeight: 21 },
    note: { borderLeftWidth: 2, borderLeftColor: C.primary, backgroundColor: C.glassActive, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 10 },
    noteTxt: { color: C.text, fontSize: 13, lineHeight: 20 },
    exampleTxt: { color: C.textSub, fontSize: 13, lineHeight: 20 },
    label: { color: C.primaryLight, fontWeight: "700" },
    highlight: { color: C.primaryLight, fontWeight: "700" },
});
