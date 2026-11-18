import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useEffect, useRef, useState } from "react";
import {
    ActivityIndicator, Animated, AppState, AppStateStatus, Easing, Modal, StyleSheet, Text,
    TouchableOpacity, View
} from "react-native";
import { StorageService } from "../services/storage";
import { C } from "../theme";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { InlineNotice } from "./InlineNotice";

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
interface Props {
    children: React.ReactNode;
}

type AuthState = "checking" | "locked" | "unlocked" | "disabled" | "error";

// Algunos Android (p. ej. Honor con sensor bajo pantalla) mandan la app a "background"
// justo al cerrar el prompt biométrico; sin este margen eso re-bloqueaba en bucle.
const AUTH_GRACE_MS = 3000;

// Tiempo máximo fuera de la app antes de volver a pedir biometría. Si el usuario
// vuelve antes de este tiempo no se le pide nada.
const RELOCK_AFTER_MS = 30_000;

// Referencia al ref de "biometría activa" de la instancia montada. Permite que Ajustes y el
// onboarding avisen al guardián cuando se activa o se apaga el bloqueo sin reiniciar la app.
let biometricEnabledRuntimeRef: { current: boolean } | null = null;

/** Actualiza en caliente si el guardián debe re-bloquear al volver de segundo plano. */
export function setBiometricRuntimeEnabled(v: boolean): void {
    if (biometricEnabledRuntimeRef) biometricEnabledRuntimeRef.current = v;
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function BiometricGate({ children }: Props) {
    const [authState, setAuthState] = useState<AuthState>("checking");
    const [authType, setAuthType] = useState<"fingerprint" | "face" | "generic">("fingerprint");
    const [error, setError] = useState<string>("");
    const [attempts, setAttempts] = useState(0);
    const [isAuthenticating, setIsAuthenticating] = useState(false);
    // Una vez true, los children quedan montados para siempre (el re-bloqueo se dibuja encima)
    const [hasUnlockedOnce, setHasUnlockedOnce] = useState(false);

    // Refs de estado para usar dentro del listener de AppState sin depender de closures viejas
    const authStateRef = useRef<AuthState>("checking");
    const hasUnlockedOnceRef = useRef(false);
    const biometricEnabledRef = useRef(false);
    biometricEnabledRuntimeRef = biometricEnabledRef;
    const isAuthenticatingRef = useRef(false);
    // Momento en que la app pasó a background estando desbloqueada (ver RELOCK_AFTER_MS)
    const backgroundedAtRef = useRef<number | null>(null);
    // Marca de tiempo del último inicio/fin de un prompt biométrico (ver AUTH_GRACE_MS)
    const lastAuthEventRef = useRef(0);

    // Animaciones
    const fadeAnim  = useRef(new Animated.Value(0)).current;
    const shakeAnim = useRef(new Animated.Value(0)).current;
    const scaleAnim = useRef(new Animated.Value(0.9)).current;
    const glowAnim  = useRef(new Animated.Value(0)).current;

    useEffect(() => { authStateRef.current = authState; }, [authState]);

    // Pulso del ícono — solo corre mientras la pantalla de bloqueo está visible
    useEffect(() => {
        if (authState !== "locked") return;
        const loop = Animated.loop(
            Animated.sequence([
                Animated.timing(glowAnim, { toValue: 1, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
                Animated.timing(glowAnim, { toValue: 0, duration: 1500, easing: Easing.inOut(Easing.sin), useNativeDriver: true }),
            ])
        );
        loop.start();
        return () => loop.stop();
    }, [authState]);

    useEffect(() => {
        initAuth();
    }, []);

    // Al pasar a background se anota la hora; al volver a foreground, si pasaron más de
    // RELOCK_AFTER_MS, se bloquea (overlay encima de la app, que sigue montada) y se pide biometría.
    useEffect(() => {
        const sub = AppState.addEventListener("change", (next: AppStateStatus) => {
            if (next === "background") {
                if (
                    backgroundedAtRef.current === null &&
                    (authStateRef.current === "unlocked" || authStateRef.current === "disabled") &&
                    biometricEnabledRef.current &&
                    !isAuthenticatingRef.current &&
                    Date.now() - lastAuthEventRef.current > AUTH_GRACE_MS
                ) {
                    backgroundedAtRef.current = Date.now();
                }
            } else if (next === "active") {
                const backgroundedAt = backgroundedAtRef.current;
                backgroundedAtRef.current = null;
                if (
                    backgroundedAt !== null &&
                    Date.now() - backgroundedAt > RELOCK_AFTER_MS &&
                    (authStateRef.current === "unlocked" || authStateRef.current === "disabled") &&
                    !isAuthenticatingRef.current
                ) {
                    // Bloqueo síncrono (antes de cualquier await) para minimizar el parpadeo
                    authStateRef.current = "locked";
                    fadeAnim.setValue(0);
                    scaleAnim.setValue(0.9);
                    setAttempts(0);
                    setError("");
                    setAuthState("locked");
                    initAuth();
                }
            }
            // "inactive" se ignora a propósito: en iOS el propio prompt de Face ID
            // y el selector de apps generan "inactive". En Android, el PIN de
            // respaldo puede mandar la app a "background", pero en ese momento
            // el estado ya es "locked" e isAuthenticatingRef está en true, así
            // que no hay bucle de re-bloqueo.
        });
        return () => sub.remove();
    }, []);

    // Pasa a un estado que deja ver la app ("unlocked" o "disabled"). El primer paso a
    // uno de ellos monta los children; desde entonces ya no se desmontan nunca.
    const markUnlocked = (state: "unlocked" | "disabled") => {
        authStateRef.current = state;
        hasUnlockedOnceRef.current = true;
        setHasUnlockedOnce(true);
        setAuthState(state);
    };

    const initAuth = async () => {
        if (hasUnlockedOnceRef.current) {
            // Re-bloqueo: la app sigue montada debajo; NO se usa la pantalla "checking"
            // (reemplazaría la app). Se mantiene el overlay de bloqueo.
            authStateRef.current = "locked";
            setAuthState("locked");
        } else {
            setAuthState("checking");
        }
        setError("");
        try {
            const settings = await StorageService.getSettingsOrThrow();
            biometricEnabledRef.current = settings.biometricEnabled;
            if (!settings.biometricEnabled) {
                markUnlocked("disabled");
                return;
            }

            const hasHardware = await LocalAuthentication.hasHardwareAsync();
            if (!hasHardware) {
                biometricEnabledRef.current = false;
                markUnlocked("disabled");
                return;
            }

            const isEnrolled = await LocalAuthentication.isEnrolledAsync();
            if (!isEnrolled) {
                biometricEnabledRef.current = false;
                markUnlocked("disabled");
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
            fadeAnim.setValue(0);
            scaleAnim.setValue(0.9);
            setAuthState("locked");
            Animated.parallel([
                Animated.timing(fadeAnim, { toValue: 1, duration: 400, useNativeDriver: true }),
                Animated.spring(scaleAnim, { toValue: 1, friction: 6, useNativeDriver: true }),
            ]).start();

            // Intentar autenticación automática
            await attemptAuth();

        } catch {
            setError("No se pudo verificar la configuración de seguridad. Toca Reintentar.");
            setAuthState("error");
        }
    };

    const attemptAuth = async () => {
        if (isAuthenticatingRef.current) return;
        isAuthenticatingRef.current = true;
        lastAuthEventRef.current = Date.now();
        setIsAuthenticating(true);
        try {
            setError("");
            const result = await LocalAuthentication.authenticateAsync({
                promptMessage: "Verifica tu identidad para acceder a BudgetMaster",
                cancelLabel: "Cancelar",
                fallbackLabel: "Usar PIN",
                disableDeviceFallback: false,
            });

            if (result.success) {
                if (hasUnlockedOnceRef.current) {
                    // Re-bloqueo: se quita el overlay directamente; la app no se remonta
                    markUnlocked("unlocked");
                } else {
                    // Primer desbloqueo: animación de éxito y luego se montan los children
                    Animated.parallel([
                        Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }),
                        Animated.timing(scaleAnim, { toValue: 1.1, duration: 200, useNativeDriver: true }),
                    ]).start(() => markUnlocked("unlocked"));
                }
            } else {
                setAttempts(prev => prev + 1);
                if (result.error === "user_cancel" || result.error === "system_cancel") {
                    setError("Autenticación cancelada. Toca el botón para intentar de nuevo.");
                } else {
                    shake();
                    setError("No se pudo verificar tu identidad. Intenta de nuevo.");
                }
            }
        } catch {
            setError("Error al acceder al sensor biométrico.");
        } finally {
            lastAuthEventRef.current = Date.now();
            isAuthenticatingRef.current = false;
            setIsAuthenticating(false);
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

    // Pantalla de bloqueo (checking / error / locked). Se usa tanto en el arranque en frío
    // (pantalla completa, sin children) como en el re-bloqueo (dentro de un Modal sobre la app).
    const renderLockScreen = () => {
    if (authState === "checking") {
        return (
            <View style={s.screen}>
                <View style={s.bgGradient} />
                <ActivityIndicator size="large" color={C.primary} />
            </View>
        );
    }

    if (authState === "error") {
        return (
            <View style={s.screen}>
                <View style={s.bgGradient} />
                <GlassCard radius={28} blur={false} topAccentColor={C.primary} topAccentWidth={2} style={s.card} contentStyle={s.cardContent}>
                    <View style={s.logoWrap}>
                        <View style={s.logoBg}>
                            <Ionicons name="wallet-outline" size={32} color={C.onPrimary} />
                        </View>
                    </View>

                    <Text style={s.appName}>BudgetMaster</Text>

                    <InlineNotice variant="error" text={error} style={s.notice} />

                    <GlassButton label="Reintentar" icon="refresh-outline" onPress={initAuth} style={s.retryBtn} />
                </GlassCard>
            </View>
        );
    }

    const iconName = authType === "face" ? "scan-outline" : "finger-print-outline";
    const iconLabel = authType === "face" ? "Face ID" : "Huella Digital";
    const glowOpacity = glowAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0.8] });

    return (
        <View style={s.screen}>
            {/* FONDO OPACO (no se anima: en re-bloqueo debe tapar la app desde el primer frame) */}
            <View style={s.bgGradient} />
          <Animated.View style={[s.fadeLayer, { opacity: fadeAnim }]}>
            <View style={s.bgOrb1} />
            <View style={s.bgOrb2} />

            <Animated.View style={[s.card, { transform: [{ scale: scaleAnim }, { translateX: shakeAnim }] }]}>
              <GlassCard radius={28} blur={false} topAccentColor={C.primary} topAccentWidth={2} contentStyle={s.cardContent}>

                {/* LOGO */}
                <View style={s.logoWrap}>
                    <View style={s.logoBg}>
                        <Ionicons name="wallet-outline" size={32} color={C.onPrimary} />
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
                        disabled={isAuthenticating}
                    >
                        <Ionicons name={iconName as any} size={48} color={C.primaryLight} />
                    </TouchableOpacity>
                </View>

                <Text style={s.biometricLabel}>{iconLabel}</Text>
                <Text style={s.instruction}>Toca el sensor para acceder</Text>

                {/* ERROR */}
                {error ? <InlineNotice variant="error" text={error} style={s.notice} /> : null}

                {/* BOTÓN DE REINTENTO */}
                <GlassButton
                    label={attempts === 0 ? "Autenticar" : "Intentar de nuevo"}
                    icon="refresh-outline"
                    onPress={attemptAuth}
                    disabled={isAuthenticating}
                    style={s.retryBtn}
                />

                {attempts >= 3 && (
                    <Text style={s.hint}>
                        ¿Problemas? Usa PIN o patrón del dispositivo cuando se solicite.
                    </Text>
                )}
              </GlassCard>
            </Animated.View>
          </Animated.View>
        </View>
    );
    };

    // Arranque en frío (antes del primer desbloqueo): solo la pantalla de bloqueo, sin children.
    if (!hasUnlockedOnce) {
        return renderLockScreen();
    }

    // Después del primer desbloqueo los children quedan siempre montados. Si hay que
    // re-bloquear, la pantalla de bloqueo va en un Modal (renderizado DESPUÉS de los children
    // para apilarse encima de cualquier otro Modal abierto) y los children se ocultan al
    // lector de pantalla.
    const relocked = authState === "locked" || authState === "checking" || authState === "error";
    return (
        <>
            <View
                style={s.appWrap}
                importantForAccessibility={relocked ? "no-hide-descendants" : "auto"}
                accessibilityElementsHidden={relocked}
            >
                {children}
            </View>
            {relocked && (
                <Modal
                    visible
                    transparent
                    statusBarTranslucent
                    animationType="none"
                    onRequestClose={() => {}}
                >
                    {renderLockScreen()}
                </Modal>
            )}
        </>
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
    appWrap: { flex: 1 },
    fadeLayer: {
        ...StyleSheet.absoluteFillObject,
        alignItems: "center", justifyContent: "center",
    },
    card: { width: "88%" },
    cardContent: { padding: 32, alignItems: "center" },
    logoWrap: { marginBottom: 16 },
    logoBg: {
        width: 64, height: 64, borderRadius: 18,
        backgroundColor: C.primary, alignItems: "center", justifyContent: "center",
    },
    appName: {
        color: C.textPrimary, fontSize: 26, fontWeight: "900",
        letterSpacing: 0.5, marginBottom: 4,
    },
    subtitle: {
        color: C.textSub, fontSize: 13, marginBottom: 32,
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
        color: C.textSub, fontSize: 12, marginBottom: 24,
    },
    notice: { width: "100%", marginBottom: 16 },
    retryBtn: { width: "100%" },
    hint: {
        color: C.textSub, fontSize: 11, textAlign: "center",
        marginTop: 16, lineHeight: 17,
    },
});
