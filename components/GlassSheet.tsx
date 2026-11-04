import React, { RefObject } from "react";
import {
    KeyboardAvoidingView,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
    useWindowDimensions,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../theme";
import { GlassBackground } from "./GlassCard";

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface GlassSheetProps {
    onClose: () => void;
    title: string;
    icon?: IoniconName;
    headerRight?: React.ReactNode;
    children: React.ReactNode;
    footer?: React.ReactNode;
    /** Default true */
    scroll?: boolean;
    scrollRef?: RefObject<ScrollView | null>;
    /** Default 0.9 */
    maxHeightRatio?: number;
}

export function GlassSheet({
    onClose,
    title,
    icon,
    headerRight,
    children,
    footer,
    scroll = true,
    scrollRef,
    maxHeightRatio = 0.9,
}: GlassSheetProps) {
    const { height } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    return (
        <Modal visible transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessible={false} />
                <KeyboardAvoidingView behavior="padding" style={s.kav}>
                    <View
                        style={[
                            s.sheet,
                            { maxHeight: height * maxHeightRatio, paddingBottom: insets.bottom + 16 },
                        ]}
                    >
                        <GlassBackground radius={28} blur={false} />
                        <View style={s.handle} />
                        <View style={s.header}>
                            {!!icon && <Ionicons name={icon} size={20} color={C.textPrimary} />}
                            <Text style={s.title} numberOfLines={2} accessibilityRole="header">{title}</Text>
                            {headerRight}
                            <TouchableOpacity
                                onPress={onClose}
                                accessibilityRole="button"
                                accessibilityLabel="Cerrar"
                                style={s.closeBtn}
                            >
                                <GlassBackground radius={18} blur={false} />
                                <Ionicons name="close" size={18} color={C.textSub} />
                            </TouchableOpacity>
                        </View>
                        {scroll ? (
                            <ScrollView
                                ref={scrollRef}
                                style={s.body}
                                keyboardShouldPersistTaps="handled"
                                showsVerticalScrollIndicator={false}
                            >
                                {children}
                            </ScrollView>
                        ) : (
                            <View style={s.bodyStatic}>{children}</View>
                        )}
                        {footer}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: C.overlayScrim, justifyContent: "flex-end" },
    kav: { flex: 1, width: "100%", justifyContent: "flex-end" },
    sheet: {
        backgroundColor: C.bg,
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        overflow: "hidden",
        paddingHorizontal: 24,
        paddingTop: 12,
    },
    handle: {
        width: 40,
        height: 4,
        borderRadius: 2,
        backgroundColor: C.glassBorder,
        alignSelf: "center",
        marginBottom: 14,
    },
    header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 16 },
    title: { color: C.textPrimary, fontSize: 20, fontWeight: "900", flexShrink: 1, flexGrow: 1 },
    closeBtn: {
        width: 36,
        height: 36,
        borderRadius: 18,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
        flexShrink: 0,
    },
    body: { flexGrow: 0, flexShrink: 1 },
    bodyStatic: { flexShrink: 1 },
});

export default GlassSheet;
