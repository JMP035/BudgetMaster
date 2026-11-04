import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../theme";

export interface ScreenHeaderProps {
    title: string;
    subtitle?: string;
    right?: React.ReactNode;
    left?: React.ReactNode;
    headerRef?: (n: View | null) => void;
    compact?: boolean;
}

export function ScreenHeader({ title, subtitle, right, left, headerRef, compact = false }: ScreenHeaderProps) {
    const insets = useSafeAreaInsets();
    return (
        <View ref={headerRef} collapsable={false} style={[s.wrap, { paddingTop: insets.top + 12 }]}>
            <View style={s.row}>
                {left}
                <View style={s.texts}>
                    <Text
                        style={[s.title, compact && s.titleCompact]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                        accessibilityRole="header"
                    >
                        {title}
                    </Text>
                    {!!subtitle && <Text style={s.subtitle}>{subtitle}</Text>}
                </View>
                {!!right && <View style={s.right}>{right}</View>}
            </View>
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { marginBottom: 20 },
    row: { flexDirection: "row", alignItems: "center", gap: 10 },
    texts: { flex: 1, minWidth: 0 },
    title: { color: C.textPrimary, fontSize: 28, fontWeight: "900" },
    titleCompact: { fontSize: 22 },
    subtitle: { color: C.textSub, fontSize: 13, marginTop: 2 },
    right: { flexDirection: "row", alignItems: "center", gap: 8, flexShrink: 0 },
});

export default ScreenHeader;
