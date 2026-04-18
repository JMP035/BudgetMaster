import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { StorageService, UserSettings } from "../services/storage";
import { C, shadow } from "../theme";

interface Props { settings: UserSettings; onSave: (s: UserSettings) => void; onClearAll: () => void; }

export default function SettingsScreen({ settings, onSave, onClearAll }: Props) {
    const [name, setName] = useState(settings.userName);
    const [budget, setBudget] = useState(settings.budgetLimit.toString());
    const [currency, setCurrency] = useState(settings.currency);
    const [extSavings, setExtSavings] = useState(settings.externalSavings?.toString() || "0");
    const [smsOpt, setSmsOpt] = useState(settings.smsEnabled ?? true);
    const [apiKey, setApiKey] = useState(settings.geminiApiKey || "");
    const [saved, setSaved] = useState(false);

    const handleSave = async () => {
        const budgetNum = parseFloat(budget.replace(",", "."));
        const savingNum = parseFloat(extSavings.replace(",", "."));
        if (isNaN(budgetNum) || budgetNum <= 0) { Alert.alert("Error", "Presupuesto menor a 0"); return; }

        const updated: UserSettings = {
            ...settings,
            userName: name.trim() || "Usuario",
            budgetLimit: budgetNum,
            currency: currency.trim() || "Q",
            smsEnabled: smsOpt,
            externalSavings: isNaN(savingNum) ? 0 : savingNum,
            geminiApiKey: apiKey.trim()
        };
        await StorageService.saveSettings(updated);
        onSave(updated);
        setSaved(true); setTimeout(() => setSaved(false), 2000);
    };

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"} 
            style={{ flex: 1 }}
        >
            <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>
            <View style={s.header}>
                <Text style={s.title}>Configuración</Text>
            </View>

            <View style={s.card}>
                <Text style={s.lbl}>NOMBRE</Text>
                <TextInput style={s.input} value={name} onChangeText={setName} placeholderTextColor={C.textMuted} />
            </View>

            <View style={s.card}>
                <Text style={s.lbl}>PRESUPUESTO MENSUAL</Text>
                <TextInput style={s.input} value={budget} onChangeText={setBudget} keyboardType="decimal-pad" placeholderTextColor={C.textMuted} />
            </View>

            <View style={s.card}>
                <Text style={s.lbl}>MONEDA</Text>
                <View style={s.curRow}>
                    {["Q", "$", "€", "£"].map(c => (
                        <TouchableOpacity key={c} style={[s.curBtn, currency === c && s.curActive]} onPress={() => setCurrency(c)}>
                            <Text style={[s.curTxt, currency === c && { color: C.primaryLight }]}>{c}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
                <TextInput style={[s.input, { marginTop: 12 }]} value={currency} onChangeText={setCurrency} maxLength={4} placeholder="Otro..." placeholderTextColor={C.textMuted} />
            </View>

            <View style={s.card}>
                <Text style={s.lbl}>AHORROS EXTERNOS (Patrimonio Total)</Text>
                <Text style={{ color: C.textSub, fontSize: 11, marginBottom: 8 }}>Súmalo a tu progreso para alimentar tu Árbol de Dinero.</Text>
                <TextInput style={s.input} value={extSavings} onChangeText={setExtSavings} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.textMuted} />
            </View>

            <View style={[s.card, { paddingBottom: 18 }]}>
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.lbl}>VINCULACIÓN SMS AUTOMÁTICA</Text>
                        <Text style={{ color: C.textSub, fontSize: 11 }}>Lee mensajes bancarios para registrar gastos automáticamente. (Requiere permisos en Android).</Text>
                    </View>
                    <Switch value={smsOpt} onValueChange={setSmsOpt} trackColor={{ false: C.bgDeep, true: C.accent }} thumbColor={C.text} style={{ marginLeft: 10 }} />
                </View>
            </View>

            <View style={s.card}>
                <Text style={s.lbl}>API KEY DE GOOGLE GEMINI</Text>
                <Text style={{ color: C.textSub, fontSize: 11, marginBottom: 8 }}>Ingresa tu clave de Gemini API para activar la Inteligencia Artificial neuronal avanzada en la app.</Text>
                <TextInput style={s.input} value={apiKey} onChangeText={setApiKey} placeholder="AIzaSy..." secureTextEntry placeholderTextColor={C.textMuted} />
            </View>

            <TouchableOpacity style={s.btn} onPress={handleSave}>
                <Text style={s.btnTxt}>{saved ? "Guardado" : "Guardar Cambios"}</Text>
                <Ionicons name={saved ? "checkmark" : "save"} size={20} color="#1A0E00" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            <View style={s.dangerCard}>
                <Text style={[s.title, { color: C.danger, fontSize: 18, marginBottom: 8 }]}>Zona de Peligro</Text>
                <Text style={{ color: C.textSub, fontSize: 13, marginBottom: 16 }}>Borrará todas tus transacciones y volverás a empezar de cero.</Text>
                <TouchableOpacity style={s.dangerBtn} onPress={() => {
                    if (Platform.OS === 'web') {
                        if (window.confirm("¿Borrar todos los datos permanentemente?")) onClearAll();
                    } else {
                        Alert.alert("Cuidado", "¿Borrar todo?", [{ text: "Cancelar" }, { text: "Borrar", style: "destructive", onPress: onClearAll }]);
                    }
                }}>
                    <Text style={{ color: C.danger, fontWeight: "700" }}>Borrar Todos los Datos</Text>
                </TouchableOpacity>
            </View>
            <View style={{ height: 120 }} />
        </ScrollView>
    </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    header: { marginBottom: 18 },
    title: { color: C.textPrimary, fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },
    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 18, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    lbl: { color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
    input: { color: C.text, fontSize: 16, borderBottomWidth: 1, borderBottomColor: C.primary + "55", paddingVertical: 8 },
    curRow: { flexDirection: "row", gap: 8 },
    curBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    curActive: { borderColor: C.primary, borderTopColor: C.primaryLight, backgroundColor: C.primaryDark + "33", ...shadow(C.primaryGlow, 6, 0.4) },
    curTxt: { color: C.textSub, fontSize: 16, fontWeight: "700" },
    btn: { flexDirection: "row", backgroundColor: C.primary, borderRadius: 14, paddingVertical: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.primaryLight, borderTopColor: C.accentLight, marginTop: 6, ...shadow(C.primaryGlow, 12, 0.5) },
    btnTxt: { color: "#1A0E00", fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
    dangerCard: { marginTop: 30, padding: 18, borderRadius: 16, borderWidth: 1, borderColor: C.danger + "55", backgroundColor: C.danger + "11" },
    dangerBtn: { padding: 14, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: C.danger }
});
