import React, { useId, useState } from "react";
import { StyleSheet, Text, View, TextStyle, ViewStyle, StyleProp, LayoutChangeEvent, useWindowDimensions } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { C } from "../theme";

// ajuste fino de línea base; si el número aparece corrido verticalmente, tocar solo este valor
const BASELINE_OFFSET = 0.36;

const DEFAULT_COLORS = [C.primary, C.primaryLight, C.primaryGlow, C.primaryLight];
const MAX_FONT_MULTIPLIER = 1.4;

export interface GradientTextProps {
    text: string;
    style: TextStyle;
    colors?: string[];
    /** Si true, el texto se encoge (hasta minScale) para caber en el ancho disponible del contenedor. */
    fit?: boolean;
    /** Escala mínima en modo fit. Default 0.6. */
    minScale?: number;
    /** Alineación horizontal en modo fit. Default "left". */
    align?: "left" | "center" | "right";
    /** Estilo del contenedor en modo fit. */
    containerStyle?: StyleProp<ViewStyle>;
}

function GradientDefs({ gid, colors }: { gid: string; colors: string[] }) {
    return (
        <Defs>
            <LinearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
                {colors.map((c, i) => (
                    <Stop key={i} offset={colors.length > 1 ? i / (colors.length - 1) : 0} stopColor={c} />
                ))}
            </LinearGradient>
        </Defs>
    );
}

// Camino clásico: tamaño natural, sin encogerse.
function GradientTextBasic({ text, style, colors = DEFAULT_COLORS }: GradientTextProps) {
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);
    const { fontScale } = useWindowDimensions();
    const gid = "bm" + useId().replace(/[^a-zA-Z0-9]/g, "");
    // el Text oculto escala con la fuente del sistema; el SVG debe hacer lo mismo
    const fontSize = (style.fontSize ?? 16) * fontScale;

    return (
        <View>
            <Text
                style={[style, { opacity: 0 }]}
                numberOfLines={1}
                onLayout={(e: LayoutChangeEvent) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
            >
                {text}
            </Text>
            {size && (
                <Svg width={size.w} height={size.h} style={StyleSheet.absoluteFill}>
                    <GradientDefs gid={gid} colors={colors} />
                    <SvgText
                        x={size.w / 2}
                        y={size.h / 2 + fontSize * BASELINE_OFFSET}
                        textAnchor="middle"
                        fontSize={fontSize}
                        fontWeight={String(style.fontWeight ?? "900")}
                        fill={`url(#${gid})`}
                    >
                        {text}
                    </SvgText>
                </Svg>
            )}
        </View>
    );
}

const JUSTIFY = { left: "flex-start", center: "center", right: "flex-end" } as const;

// Camino fit: mide el ancho disponible y el natural, y escala el SVG para que quepa.
function GradientTextFit({ text, style, colors = DEFAULT_COLORS, minScale = 0.6, align = "left", containerStyle }: GradientTextProps) {
    const [avail, setAvail] = useState(0);
    const [natural, setNatural] = useState<{ w: number; h: number } | null>(null);
    const { fontScale } = useWindowDimensions();
    const gid = "bm" + useId().replace(/[^a-zA-Z0-9]/g, "");
    const baseFont = style.fontSize ?? 16;

    let body: React.ReactNode = <View style={{ height: 0 }} />;
    if (natural && natural.w > 0 && avail > 0) {
        const scale = Math.min(1, Math.max(minScale, (avail - 1) / natural.w));
        const w = natural.w * scale;
        const h = natural.h * scale;
        const fontSize = baseFont * Math.min(fontScale, MAX_FONT_MULTIPLIER) * scale;
        body = (
            <View style={{ height: h, flexDirection: "row", justifyContent: JUSTIFY[align] }}>
                <Svg width={w} height={h}>
                    <GradientDefs gid={gid} colors={colors} />
                    <SvgText
                        x={w / 2}
                        y={h / 2 + fontSize * BASELINE_OFFSET}
                        textAnchor="middle"
                        fontSize={fontSize}
                        fontWeight={String(style.fontWeight ?? "900")}
                        fill={`url(#${gid})`}
                    >
                        {text}
                    </SvgText>
                </Svg>
            </View>
        );
    }

    return (
        <View
            style={[{ alignSelf: "stretch", minWidth: 0, overflow: "hidden" }, containerStyle]}
            onLayout={(e: LayoutChangeEvent) => setAvail(e.nativeEvent.layout.width)}
        >
            {/* medidor invisible: ancho natural del texto sin restricciones */}
            <View pointerEvents="none" style={{ position: "absolute", left: 0, top: 0, width: 4000, opacity: 0 }}>
                <Text
                    style={[style, { alignSelf: "flex-start" }]}
                    numberOfLines={1}
                    maxFontSizeMultiplier={MAX_FONT_MULTIPLIER}
                    onLayout={(e: LayoutChangeEvent) => setNatural({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
                >
                    {text}
                </Text>
            </View>
            {body}
        </View>
    );
}

export function GradientText(props: GradientTextProps) {
    return props.fit ? <GradientTextFit {...props} /> : <GradientTextBasic {...props} />;
}

export default GradientText;
