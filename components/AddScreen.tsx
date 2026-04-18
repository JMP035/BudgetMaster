import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { StorageService, Transaction } from "../services/storage";
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES } from "../categories";
import { C, shadow } from "../theme";

export default function AddScreen({ onAdd, defaultCurrency }: { onAdd: (tx: Transaction) => void; defaultCurrency: string }) {
    const [type, setType] = useState<"expense" | "income">("expense");
    const [amount, setAmount] = useState("");
    const [desc, setDesc] = useState("");
    const [category, setCategory] = useState("other");
    const [loading, setLoading] = useState(false);

    const cats = type === "expense" ? EXPENSE_CATEGORIES : INCOME_CATEGORIES;

    const handleAdd = async () => {
        const amt = parseFloat(amount.replace(",", "."));
        if (!amount || isNaN(amt) || amt <= 0) { Alert.alert("Error", "Ingresa un monto válido mayor a 0"); return; }
        setLoading(true);
        const tx: Transaction = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2),
            amount: amt,
            description: desc.trim(),
            category,
            date: new Date().toISOString(),
            type,
            source: "manual",
        };
        await StorageService.addTransaction(tx);
        onAdd(tx);
        setAmount(""); setDesc(""); setCategory("other"); setLoading(false);
    };

    return (
        <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>
            <View style={s.header}>
                <Text style={s.title}>Nueva Transacción</Text>
            </View>

            <View style={s.typeRow}>
                <TouchableOpacity style={[s.typeBtn, type === "expense" && s.typeBtnExp]} onPress={() => { setType("expense"); setCategory("other"); }}>
                    <Ionicons name="trending-down" size={24} color={type === "expense" ? C.expense : C.textMuted} />
                    <Text style={[s.typeTxt, type === "expense" && { color: C.expense }]}>Gasto</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[s.typeBtn, type === "income" && s.typeBtnInc]} onPress={() => { setType("income"); setCategory("other"); }}>
                    <Ionicons name="trending-up" size={24} color={type === "income" ? C.income : C.textMuted} />
                    <Text style={[s.typeTxt, type === "income" && { color: C.income }]}>Ingreso</Text>
                </TouchableOpacity>
            </View>

            <View style={s.card}>
                <Text style={s.lbl}>MONTO</Text>
                <View style={s.amtRow}>
                    <Text style={s.cur}>{defaultCurrency}</Text>
                    <TextInput style={[s.amtInput, { color: type === "expense" ? C.expense : C.income }]} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" autoFocus />
                </View>
            </View>

            <View style={s.card}>
                <Text style={s.lbl}>DESCRIPCIÓN (Opcional)</Text>
                <View style={s.descRow}>
                    <Ionicons name="pencil" size={18} color={C.primaryLight} style={{ marginRight: 10 }} />
                    <TextInput style={s.txtInput} value={desc} onChangeText={setDesc} placeholder="Ej: Almuerzo, Uber, Sueldo..." placeholderTextColor={C.textMuted} maxLength={60} />
                </View>
            </View>

            <View style={[s.card, { paddingBottom: 6 }]}>
                <Text style={s.lbl}>CATEGORÍA</Text>
                <View style={s.catGrid}>
                    {cats.map(cat => (
                        <TouchableOpacity key={cat.id} onPress={() => setCategory(cat.id)} style={[s.catItem, category === cat.id && s.catActive]}>
                            <Ionicons name={cat.icon} size={24} color={category === cat.id ? C.primaryLight : C.textSub} />
                            <Text style={[s.catLbl, category === cat.id && { color: C.textPrimary }]}>{cat.label}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            </View>

            <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleAdd} disabled={loading}>
                <Text style={s.btnTxt}>{loading ? "Guardando..." : "Guardar"}</Text>
                <Ionicons name="save" size={20} color="#1A0E00" style={{ marginLeft: 8 }} />
            </TouchableOpacity>

            <View style={{ height: 140 }} />
        </ScrollView>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    header: { marginBottom: 18 },
    title: { color: C.textPrimary, fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },
    typeRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
    typeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: C.cardBorder, backgroundColor: C.card },
    typeTxt: { color: C.textSub, fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
    typeBtnExp: { borderColor: C.expense, backgroundColor: C.expense + "22", ...shadow(C.expense, 8, 0.3) },
    typeBtnInc: { borderColor: C.income, backgroundColor: C.income + "22", ...shadow(C.income, 8, 0.3) },
    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 18, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
    amtRow: { flexDirection: "row", alignItems: "center" },
    cur: { color: C.textMuted, fontSize: 28, fontWeight: "600", marginRight: 8 },
    amtInput: { flex: 1, fontSize: 40, fontWeight: "900", height: 50 },
    descRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.primary + "55", paddingBottom: 8 },
    txtInput: { flex: 1, color: C.text, fontSize: 16 },
    catGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
    catItem: { width: "31%", alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep, marginBottom: 8 },
    catActive: { borderColor: C.primary, borderTopColor: C.primaryLight, backgroundColor: C.primaryDark + "33", ...shadow(C.primaryGlow, 8, 0.4) },
    catLbl: { color: C.textSub, fontSize: 10, marginTop: 6, fontWeight: "600" },
    btn: { flexDirection: "row", backgroundColor: C.primary, borderRadius: 14, paddingVertical: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.primaryLight, borderTopColor: C.accentLight, marginTop: 6, ...shadow(C.primaryGlow, 12, 0.5) },
    btnTxt: { color: "#1A0E00", fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
});
