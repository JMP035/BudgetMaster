import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, View } from "react-native";
import { C } from "../theme";

export default function SplashScreen({ onDone }: { onDone: () => void }) {
    const logoScale = useRef(new Animated.Value(0.3)).current;
    const logoOpacity = useRef(new Animated.Value(0)).current;
    const ringScale = useRef(new Animated.Value(0.6)).current;
    const ringOpacity = useRef(new Animated.Value(0)).current;
    const textOpacity = useRef(new Animated.Value(0)).current;
    const subOpacity = useRef(new Animated.Value(0)).current;
    const barWidth = useRef(new Animated.Value(0)).current;
    const fadeOut = useRef(new Animated.Value(1)).current;

    useEffect(() => {
        Animated.sequence([
            Animated.parallel([
                Animated.timing(ringOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
                Animated.spring(ringScale, { toValue: 1, friction: 5, useNativeDriver: true }),
            ]),
            Animated.parallel([
                Animated.timing(logoOpacity, { toValue: 1, duration: 350, useNativeDriver: true }),
                Animated.spring(logoScale, { toValue: 1, friction: 4, useNativeDriver: true }),
            ]),
            Animated.timing(textOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
            Animated.timing(subOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
            Animated.timing(barWidth, { toValue: 1, duration: 900, easing: Easing.inOut(Easing.ease), useNativeDriver: false }),
            Animated.timing(fadeOut, { toValue: 0, duration: 400, delay: 200, useNativeDriver: true }),
        ]).start(() => onDone());
    }, []);

    const barW = barWidth.interpolate({ inputRange: [0, 1], outputRange: ["0%", "100%"] });

    return (
        <Animated.View style={[s.container, { opacity: fadeOut }]}>
            <Animated.View style={[s.ring, s.ringOuter, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
            <Animated.View style={[s.ring, s.ringMid, { opacity: ringOpacity, transform: [{ scale: ringScale }] }]} />
            <Animated.View style={[s.logoBox, { opacity: logoOpacity, transform: [{ scale: logoScale }] }]}>
                <Ionicons name="wallet" size={58} color={C.primaryLight} />
                <View style={s.shine} />
            </Animated.View>
            <Animated.Text style={[s.name, { opacity: textOpacity }]}>BudgetMaster</Animated.Text>
            <Animated.Text style={[s.sub, { opacity: subOpacity }]}>TU DINERO · BAJO CONTROL</Animated.Text>
            <View style={s.trackWrap}>
                <Animated.View style={[s.bar, { width: barW }]} />
            </View>
            <Animated.Text style={[s.loading, { opacity: subOpacity }]}>Cargando...</Animated.Text>
        </Animated.View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bgDeep, alignItems: "center", justifyContent: "center" },
    ring: { position: "absolute", borderRadius: 999 },
    ringOuter: { width: 290, height: 290, borderWidth: 1, borderColor: C.primary + "30" },
    ringMid: { width: 210, height: 210, borderWidth: 1.5, borderColor: C.primary + "55" },
    logoBox: {
        width: 120, height: 120, borderRadius: 36, backgroundColor: "#1A1208",
        borderWidth: 2, borderColor: C.primary, alignItems: "center", justifyContent: "center",
        marginBottom: 28, shadowColor: C.primaryGlow, shadowOpacity: 0.8, shadowRadius: 30,
        elevation: 20, overflow: "hidden",
    },
    shine: { position: "absolute", top: 0, left: 0, right: 0, height: "45%", backgroundColor: "#FFFFFF0D", borderTopLeftRadius: 34, borderTopRightRadius: 34 },
    name: { color: C.primaryLight, fontSize: 34, fontWeight: "900", letterSpacing: 1.5, marginBottom: 6 },
    sub: { color: C.textSub, fontSize: 11, letterSpacing: 3, marginBottom: 52 },
    trackWrap: { width: 200, height: 3, backgroundColor: "#2A2A2A", borderRadius: 2, overflow: "hidden", marginBottom: 10 },
    bar: { height: "100%", backgroundColor: C.primary, borderRadius: 2 },
    loading: { color: C.textMuted, fontSize: 11, letterSpacing: 1.5 },
});
