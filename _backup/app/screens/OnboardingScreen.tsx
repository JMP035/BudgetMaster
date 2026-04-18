import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
    Alert, Animated, Dimensions,
    Image,
    StyleSheet, Text,
    TextInput, TouchableOpacity, View
} from "react-native";
import { C } from "../theme";

const { width } = Dimensions.get("window");

interface Props { onComplete: (name: string, externalSavings: number) => void; }

export default function OnboardingScreen({ onComplete }: Props) {
    const [step, setStep] = useState<0 | 1>(0);
    const [name, setName] = useState("");
    const [savings, setSavings] = useState("");
    const slideX = useRef(new Animated.Value(0)).current;

    const goNext = () => {
        if (step === 0) {
            if (!name.trim()) { Alert.alert("Falta tu nombre", "Ingresa tu nombre para continuar."); return; }
            Animated.timing(slideX, { toValue: -width, duration: 280, useNativeDriver: true }).start(() => {
                setStep(1); slideX.setValue(width);
                Animated.timing(slideX, { toValue: 0, duration: 280, useNativeDriver: true }).start();
            });
        } else {
            const savNum = parseFloat(savings.replace(",", "."));
            onComplete(name.trim(), isNaN(savNum) ? 0 : savNum);
        }
    };

    return (
        <View style={s.container}>
            {/* Logo */}
            <View style={s.header}>
                <Image source={require("../../assets/images/logo.png")} style={{ width: 100, height: 100, borderRadius: 28, marginBottom: 12 }} />
                <Text style={s.logoTitle}>BudgetMaster</Text>
                <Text style={s.logoSub}>INTELIGENCIA FINANCIERA</Text>
            </View>

            <Animated.View style={[s.card, { transform: [{ translateX: slideX }] }]}>
                {step === 0 ? (
                    <>
                        <Text style={s.title}>¡Bienvenido! 👋</Text>
                        <Text style={s.desc}>Para poder darte consejos financieros precisos, dime ¿cómo te llamamos?</Text>
                        <View style={s.inputRow}>
                            <Ionicons name="person-outline" size={20} color={C.primary} style={{ marginRight: 10 }} />
                            <TextInput
                                style={s.input} value={name} onChangeText={setName}
                                placeholder="Escribe tu nombre..." placeholderTextColor={C.textMuted}
                                autoFocus returnKeyType="done" onSubmitEditing={goNext}
                            />
                        </View>
                    </>
                ) : (
                    <>
                        <Text style={s.title}>Tus Ahorros Actuales 🏦</Text>
                        <Text style={s.desc}>¿Tienes dinero ahorrado actualmente en bancos o cuentas externas? Esto nos ayudará a calcular tu Patrimonio Total y hacer crecer tu Árbol de Dinero. (Puedes poner 0 si prefieres omitir).</Text>
                        <View style={s.inputRow}>
                            <Ionicons name="cash-outline" size={20} color={C.primary} style={{ marginRight: 10 }} />
                            <TextInput
                                style={s.input} value={savings} onChangeText={setSavings}
                                placeholder="0.00" placeholderTextColor={C.textMuted}
                                keyboardType="numeric" autoFocus returnKeyType="done" onSubmitEditing={goNext}
                            />
                        </View>
                    </>
                )}
            </Animated.View>

            <TouchableOpacity style={s.btn} onPress={goNext}>
                <Text style={s.btnText}>{step === 0 ? "Siguiente" : "¡Comenzar!"}</Text>
                <Ionicons name={step === 0 ? "arrow-forward" : "rocket"} size={20} color="#1A0E00" style={{ marginLeft: 8 }} />
            </TouchableOpacity>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24, justifyContent: "center" },
    header: { alignItems: "center", marginBottom: 28 },
    logoTitle: { color: C.textPrimary, fontSize: 22, fontWeight: "900", letterSpacing: 1 },
    logoSub: { color: C.accentLight, fontSize: 10, letterSpacing: 2, marginTop: 2 },
    card: { backgroundColor: C.card, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 22, marginBottom: 20, shadowColor: "#000", shadowOpacity: 0.4, shadowRadius: 8, elevation: 4 },
    title: { color: C.textPrimary, fontSize: 22, fontWeight: "800", marginBottom: 8 },
    desc: { color: C.textSub, fontSize: 13, marginBottom: 20, lineHeight: 19 },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.bgDeep, borderRadius: 12, borderWidth: 1, borderColor: C.primary + "55", paddingHorizontal: 16, paddingVertical: 14 },
    input: { flex: 1, color: C.text, fontSize: 16 },
    btn: { flexDirection: "row", backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.primaryLight, borderTopColor: C.accentLight, shadowColor: C.primaryGlow, shadowOpacity: 0.5, shadowRadius: 12, elevation: 10 },
    btnText: { color: "#1A0E00", fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
});
