import React from "react";
import { StyleProp, StyleSheet, Text, TouchableOpacity, View, ViewStyle } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { GlassBackground } from "./GlassCard";

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface GlassSegmentedOption<T extends string> {
    value: T;
    label: string;
    icon?: IoniconName;
    refCb?: (n: View | null) => void;
}

export interface GlassSegmentedProps<T extends string> {
    options: GlassSegmentedOption<T>[];
    value: T;
    onChange: (v: T) => void;
    /** Alto de cada celda. Default 40 */
    height?: number;
    containerRef?: (n: View | null) => void;
    style?: StyleProp<ViewStyle>;
}

export function GlassSegmented<T extends string>({
    options,
    value,
    onChange,
    height = 40,
    containerRef,
    style,
}: GlassSegmentedProps<T>) {
    return (
        <View ref={containerRef} collapsable={false} style={[s.container, style]} accessibilityRole="tablist">
            <GlassBackground radius={14} blur={false} />
            <View style={s.row}>
                {options.map((o) => {
                    const active = o.value === value;
                    const color = active ? C.primaryLight : C.textSub;
                    return (
                        <View key={o.value} ref={o.refCb} collapsable={false} style={s.cell}>
                            {/* Alto explícito y SIN flex:1 en el tocable: evita el bug de texto invisible por altura 0 */}
                            <TouchableOpacity
                                onPress={() => onChange(o.value)}
                                activeOpacity={0.8}
                                accessibilityRole="tab"
                                accessibilityLabel={o.label}
                                accessibilityState={{ selected: active }}
                                style={[s.item, { height }, active && s.itemActive]}
                            >
                                {!!o.icon && <Ionicons name={o.icon} size={14} color={color} />}
                                <Text
                                    style={[s.label, { color, fontWeight: active ? "800" : "700" }]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.8}
                                >
                                    {o.label}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    );
                })}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    container: { borderRadius: 14, padding: 4, overflow: "hidden" },
    row: { flexDirection: "row", gap: 4 },
    cell: { flex: 1 },
    item: {
        alignSelf: "stretch",
        borderRadius: 10,
        borderWidth: 1,
        borderColor: "transparent",
        paddingHorizontal: 6,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 5,
    },
    itemActive: { backgroundColor: C.glassActive, borderColor: C.glassActiveBorder },
    label: { fontSize: 13, flexShrink: 1, textAlign: "center" },
});

export default GlassSegmented;
