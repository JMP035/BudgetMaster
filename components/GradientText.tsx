import React, { useId, useState } from "react";
import { StyleSheet, Text, View, TextStyle, LayoutChangeEvent } from "react-native";
import Svg, { Defs, LinearGradient, Stop, Text as SvgText } from "react-native-svg";
import { C } from "../theme";

// ajuste fino de línea base; si el número aparece corrido verticalmente, tocar solo este valor
const BASELINE_OFFSET = 0.36;

export interface GradientTextProps {
    text: string;
    style: TextStyle;
    colors?: string[];
}

export function GradientText({ text, style, colors = [C.primary, C.primaryLight, C.primaryGlow, C.primaryLight] }: GradientTextProps) {
    const [size, setSize] = useState<{ w: number; h: number } | null>(null);
    const gid = "bm" + useId().replace(/[^a-zA-Z0-9]/g, "");
    const fontSize = style.fontSize ?? 16;

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
                    <Defs>
                        <LinearGradient id={gid} x1="0" y1="1" x2="1" y2="0">
                            {colors.map((c, i) => (
                                <Stop key={i} offset={i / (colors.length - 1)} stopColor={c} />
                            ))}
                        </LinearGradient>
                    </Defs>
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

export default GradientText;
