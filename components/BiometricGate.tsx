import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useEffect, useRef, useState } from "react";
import {
    Animated, Easing, StyleSheet, Text,
    TouchableOpacity, View
} from "react-native";
import { StorageService } from "../services/storage";
import { C, shadow } from "../theme";

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
interface Props {
    children: React.ReactNode;
}

type AuthState = "checking" | "locked" | "unlocked" | "disabled";

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function BiometricGate({ children }: Props) {
    const [authState, setAuthState] = useState<AuthState>("checking");
    const [authType, setAuthType] = useState<"fingerprint" | "face" | "generic">("fingerprint");
    const [error, setError] = useState<string>("");
    const [attempts, setAttempts] = useState(0);

    // Animaciones
    const fadeAnim  = useRef(new Animated.Value(0)).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const glowAnim  = useRef(new Animated.Value(0)).current;

    // Pulso del ícono
    useEffect(() => {
        Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(glowAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
        ).start();
    }, []);

    useEffect(() => {
        initAuth();
    }, []);

    const initAuth = async () => {
        try {
            const settings = await StorageService.getSettings();
            if (!settings.biometricEnabled) {
                setAuthState("disabled");
                return;
            }

            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (!hasHardware) {
                setAuthState("disabled");
                return;
            }

            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!isEnrolled) {
                setAuthState("disabled");
                return;
            }

            // Detectar tipo de biometría
            const supportedTypes = await LocalAuthentication.supportedAuthenticationTypesAsync();
            if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
                setAuthType("face");
            } else if (supportedTypes.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
                setAuthType("fingerprint");
            }

            // Mostrar pantalla de bloqueo con animación
            setAuthState("locked");
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
                Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
            ]).start();

            // Intentar autenticación automática
            await attemptAuth();

        } catch {
            setAuthState("disabled");
        }
    };

    const attemptAuth = async () => {
        try {
            setError("");
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: "Verificá tu identidad para acceder a BudgetMaster",
                cancelLabel: "Cancelar",
                fallbackLabel: "Usar PIN",
                disableDeviceFallback: false,
            });

            if (result.success) {
                // Animación de éxito
                Animated.parallel([
                    Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                    Animated.timing(scaleAnim, { toValue: 1.1, duration: 200, useNativeDriver: true }),
                ]).start(() => setAuthState("unlocked"));
            } else {
                setAttempts(prev => prev + 1);
                if (result.error === "user_cancel" || result.error === "system_cancel") {
                    setError("Autenticación cancelada. Tocá el botón para intentar de nuevo.");
                } else {
                    shake();
                    setError("No se pudo verificar tu identidad. Intentá de nuevo.");
                }
            }
        } catch {
            setError("Error al acceder al sensor biométrico.");
        }
    };

    const shake = () => {
        Animated.sequence([
            Animated.timing(shakeAnim, { toValue: 10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -10, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
            Animated.timing(shakeAnim, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]).start();
    };

    // Si no necesita auth o ya fue desbloqueado, mostrar la app directamente
    if (authState === "disabled" || authState === "checking" || authState === "unlocked") {
        return <>{children}</>;
    }

    const iconName = authType === "face" ? "scan-outline" : "finger-print-outline";
    const iconLabel = authType === "face" ? "Face ID" : "Huella Digital";
    const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] });

    return (
        <Animated.View style={[s.screen, { opacity: fadeAnim }]}>
            {/* FONDO DEGRADADO */}
            <View style={s.bgGradient} />
            <View style={s.bgOrb1} />
            <View style={s.bgOrb2} />

            <Animated.View style={[s.card, { transform: [{ scale: scaleAnim }, { translateX: shakeAnim }] }]}>

                {/* LOGO */}
                <View style={s.logoWrap}>
                    <View style={s.logoBg}>
                        <Ionicons name="wallet-outline" size={32} color="#1A0E00" />
                    </View>
                </View>

                <Text style={s.appName}>BudgetMaster</Text>
                <Text style={s.subtitle}>Tu asesor financiero personal</Text>

                {/* ÍCONO BIOMÉTRICO CON PULSO */}
                <View style={s.biometricWrap}>
                    <Animated.View style={[s.glowRing, { opacity: glowOpacity }]} />
                    <TouchableOpacity
                        style={s.biometricBtn}
                        onPress={attemptAuth}
                        activeOpacity={0.8}
                        accessibilityLabel="Autenticar con biometría"
                    >
                        <Ionicons name={iconName as any} size={48} color={C.primaryLight} />
                    </TouchableOpacity>
                </View>

                <Text style={s.biometricLabel}>{iconLabel}</Text>
                <Text style={s.instruction}>Tocá el sensor para acceder</Text>

                {/* ERROR */}
                {error ? (
                    <View style={s.errorBox}>
                        <Ionicons name="alert-circle-outline" size={16} color={C.danger} />
                        <Text style={s.errorText}>{error}</Text>
                    </View>
                ) : null}

                {/* BOTÓN DE REINTENTO */}
                <TouchableOpacity style={s.retryBtn} onPress={attemptAuth} activeOpacity={0.8}>
                    <Ionicons name="refresh-outline" size={18} color="#1A0E00" />
                    <Text style={s.retryText}>
                        {attempts === 0 ? "Autenticar" : "Intentar de nuevo"}
                    </Text>
                </TouchableOpacity>

                {attempts >= 3 && (
                    <Text style={s.hint}>
                        ¿Problemas? Usá PIN o patrón del dispositivo cuando se solicite.
                    </Text>
                )}
            </Animated.View>
        </Animated.View>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: {
        flex: 1, backgroundColor: C.bgDeep,
        alignItems: "center", justifyContent: "center",
    },
    bgGradient: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: C.bgDeep,
    },
    bgOrb1: {
        position: "absolute", width: 300, height: 300, borderRadius: 150,
        backgroundColor: C.primaryDark + "44", top: -80, right: -80,
    },
    bgOrb2: {
        position: "absolute", width: 200, height: 200, borderRadius: 100,
        backgroundColor: C.accent + "22", bottom: -60, left: -60,
    },
    card: {
        width: "88%", backgroundColor: C.card,
        borderRadius: 28, borderWidth: 1, borderColor: C.cardBorder,
        borderTopColor: C.primary, borderTopWidth: 2,
        padding: 32, alignItems: "center",
        ...shadow(C.primaryGlow, 24, 0.4),
    },
    logoWrap: { marginBottom: 16 },
    logoBg: {
        width: 64, height: 64, borderRadius: 18,
        backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
        ...shadow(C.primaryGlow, 12, 0.5),
    },
    appName: {
        color: C.textPrimary, fontSize: 26, fontWeight: "900",
        letterSpacing: 0.5, marginBottom: 4,
    },
    subtitle: {
        color: C.textMuted, fontSize: 13, marginBottom: 32,
    },
    biometricWrap: {
        width: 100, height: 100, alignItems: "center", justifyContent: "center", marginBottom: 12,
    },
    glowRing: {
        position: "absolute",
        width: 96, height: 96, borderRadius: 48,
        backgroundColor: C.primary + "33",
        borderWidth: 2, borderColor: C.primaryLight + "66",
    },
    biometricBtn: {
        width: 80, height: 80, borderRadius: 40,
        backgroundColor: C.primaryDark + "55",
        borderWidth: 2, borderColor: C.primary,
        alignItems: "center", justifyContent: "center",
    },
    biometricLabel: {
        color: C.primaryLight, fontSize: 14, fontWeight: "800",
        letterSpacing: 1, marginBottom: 4,
    },
    instruction: {
        color: C.textMuted, fontSize: 12, marginBottom: 24,
    },
    errorBox: {
        flexDirection: "row", alignItems: "center", gap: 8,
        backgroundColor: C.danger + "15", borderWidth: 1, borderColor: C.danger + "44",
        borderRadius: 12, padding: 12, marginBottom: 16, width: "100%",
    },
    errorText: { color: C.danger, fontSize: 12, flex: 1 },
    retryBtn: {
        flexDirection: "row", alignItems: "center", justifyContent: "center",
        gap: 10, backgroundColor: C.primary, borderRadius: 16,
        paddingVertical: 16, paddingHorizontal: 32, width: "100%",
        ...shadow(C.primaryGlow, 10, 0.5),
    },
    retryText: { color: "#1A0E00", fontSize: 15, fontWeight: "900" },
    hint: {
        color: C.textMuted, fontSize: 11, textAlign: "center",
        marginTop: 16, lineHeight: 17,
    },
});
