import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    Alert, KeyboardAvoidingView, Platform, ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import { Account, Currency, Transaction, UserSettings } from "../services/storage";
import { getAllExpenseCategories, getAllIncomeCategories } from "../categories";
import { C, shadow } from "../theme";
import { SmsService } from "../services/SmsService";
import { useTutorialRef } from "../context/TutorialContext";

interface Props {
    onAdd: (tx: Transaction) => void;
    settings: UserSettings;
    accounts?: Account[];
}

export default function AddScreen({ onAdd, settings, accounts = [] }: Props) {
    const [type, setType] = useState<"expense" | "income">("expense");
    const [amount, setAmount] = useState("");
    const [desc, setDesc] = useState("");
    const [category, setCategory] = useState("other");
    const [currency, setCurrency] = useState<Currency>(settings.currency || 'Q');
    const [loading, setLoading] = useState(false);
    const [smsText, setSmsText] = useState("");
    const [showSmsInput, setShowSmsInput] = useState(false);

    const typeSelectorRef = useTutorialRef('add_type_selector');
    const currencyRef = useTutorialRef('add_currency');
    const amountRef = useTutorialRef('add_amount');
    const descriptionRef = useTutorialRef('add_description');
    const categoryRef = useTutorialRef('add_category');

    const currencies: Currency[] = ['Q', 'USD', 'EUR', '£'];

    const expenseCats = getAllExpenseCategories(settings.customCategories);
    const incomeCats = getAllIncomeCategories(settings.customCategories);
    const cats = type === "expense" ? expenseCats : incomeCats;

    const handleParseSms = () => {
        if (!smsText.trim()) { Alert.alert("Error", "Pega el texto de tu SMS primero."); return; }

        const parsed = SmsService.parseSimpleSms(smsText, undefined, accounts);

        if (!parsed) {
            Alert.alert("No detectado", "No se reconoció como un mensaje transaccional (puede ser promocional o un formato no soportado). Ingresa la transacción manualmente.");
            return;
        }

        if (parsed.kind === "installment") {
            const inst = parsed.installment!;
            Alert.alert(
                "Compra a cuotas detectada",
                `${inst.name}\nTotal: ${inst.currency} ${inst.totalAmount.toFixed(2)}\nCuotas: ${inst.totalInstallments}\nPago mensual: ${inst.currency} ${inst.monthlyPayment.toFixed(2)}\n\nRegístrala desde Cuentas → Visacuotas.`
            );
            setShowSmsInput(false);
            setSmsText("");
            return;
        }

        const tx = parsed.transaction!;
        setCurrency(tx.currency);
        setAmount(tx.amount.toString());
        setType(tx.type === "income" ? "income" : "expense");
        setCategory(tx.category);
        setDesc(tx.description);
        setShowSmsInput(false);
        setSmsText("");
        Alert.alert("¡Detectado!", `Mensaje de ${tx.bank || "tu banco"} analizado correctamente.`);
    };

    const handleAdd = async () => {
        const amt = parseFloat(amount.replace(",", "."));
        if (!amount || isNaN(amt) || amt <= 0) {
            Alert.alert("Error", "Ingresa un monto válido mayor a 0.");
            return;
        }
        setLoading(true);
        const tx: Transaction = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2),
            amount: amt,
            description: desc.trim(),
            category,
            date: new Date().toISOString(),
            type,
            source: "manual",
            currency,
        };
        onAdd(tx);
        // Reset
        setAmount(""); setDesc(""); setCategory("other");
        setCurrency(settings.currency || 'Q');
        setLoading(false);
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>

                {/* HEADER */}
                <View style={s.header}>
                    <Text style={s.title}>Nueva Transacción</Text>
                    <TouchableOpacity style={s.smsBtn} onPress={() => setShowSmsInput(!showSmsInput)}>
                        <Ionicons name="scan-outline" size={20} color={C.primaryLight} />
                        <Text style={s.smsBtnTxt}>Leer SMS</Text>
                    </TouchableOpacity>
                </View>

                {/* LEER SMS */}
                {showSmsInput && (
                    <View style={[s.card, { borderColor: C.accent + "55", backgroundColor: C.accent + "0A" }]}>
                        <Text style={[s.lbl, { color: C.accentLight }]}>PEGA AQUÍ EL TEXTO DEL BANCO</Text>
                        <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 10 }}>
                            Copia el SMS que te envió tu banco y pégalo aquí. La app detectará el monto, moneda y tipo automáticamente.
                        </Text>
                        <TextInput
                            style={[s.txtInput, { minHeight: 80, textAlignVertical: "top", backgroundColor: C.bgDeep, borderRadius: 10, padding: 12 }]}
                            multiline
                            value={smsText}
                            onChangeText={setSmsText}
                            placeholder="Ej: PRF protege tu BAC Visa: compra Aprobada por Q 150.00 en WALMART..."
                            placeholderTextColor={C.textMuted}
                        />
                        <TouchableOpacity style={s.parseBtn} onPress={handleParseSms}>
                            <Ionicons name="flash" size={16} color="#1A0E00" />
                            <Text style={s.parseBtnTxt}>Analizar SMS</Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* TIPO: GASTO / INGRESO */}
                <View style={s.typeRow} ref={typeSelectorRef} collapsable={false}>
                    <TouchableOpacity
                        style={[s.typeBtn, type === "expense" && s.typeBtnExp]}
                        onPress={() => { setType("expense"); setCategory("other"); }}
                    >
                        <Ionicons name="trending-down" size={24} color={type === "expense" ? C.expense : C.textMuted} />
                        <Text style={[s.typeTxt, type === "expense" && { color: C.expense }]}>Gasto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.typeBtn, type === "income" && s.typeBtnInc]}
                        onPress={() => { setType("income"); setCategory("other"); }}
                    >
                        <Ionicons name="trending-up" size={24} color={type === "income" ? C.income : C.textMuted} />
                        <Text style={[s.typeTxt, type === "income" && { color: C.income }]}>Ingreso</Text>
                    </TouchableOpacity>
                </View>

                {/* MONEDA */}
                <View style={s.card} ref={currencyRef} collapsable={false}>
                    <Text style={s.lbl}>MONEDA</Text>
                    <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 10 }}>
                        ¿En qué moneda es esta transacción?
                    </Text>
                    <View style={s.currencyRow}>
                        {currencies.map(cur => (
                            <TouchableOpacity
                                key={cur}
                                style={[s.currencyBtn, currency === cur && s.currencyBtnActive]}
                                onPress={() => setCurrency(cur)}
                            >
                                <Text style={[s.currencyTxt, currency === cur && { color: C.primaryLight, fontSize: 18 }]}>{cur}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* MONTO */}
                <View style={s.card} ref={amountRef} collapsable={false}>
                    <Text style={s.lbl}>MONTO</Text>
                    <View style={s.amtRow}>
                        <Text style={s.cur}>{currency}</Text>
                        <TextInput
                            style={[s.amtInput, { color: type === "expense" ? C.expense : C.income }]}
                            value={amount}
                            onChangeText={setAmount}
                            placeholder="0.00"
                            placeholderTextColor={C.textMuted}
                            keyboardType="decimal-pad"
                            autoFocus
                        />
                    </View>
                </View>

                {/* DESCRIPCIÓN */}
                <View style={s.card} ref={descriptionRef} collapsable={false}>
                    <Text style={s.lbl}>DESCRIPCIÓN (Opcional)</Text>
                    <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 8 }}>
                        ¿En qué gastaste o de dónde viene el dinero?
                    </Text>
                    <View style={s.descRow}>
                        <Ionicons name="pencil" size={18} color={C.primaryLight} style={{ marginRight: 10 }} />
                        <TextInput
                            style={s.txtInput}
                            value={desc}
                            onChangeText={setDesc}
                            placeholder="Ej: Almuerzo, Uber, Salario, Netflix..."
                            placeholderTextColor={C.textMuted}
                            maxLength={80}
                        />
                    </View>
                </View>

                {/* CATEGORÍA */}
                <View style={[s.card, { paddingBottom: 6 }]} ref={categoryRef} collapsable={false}>
                    <Text style={s.lbl}>CATEGORÍA</Text>
                    <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 12 }}>
                        Clasifica tu transacción para ver estadísticas más precisas.
                        {settings.customCategories?.length > 0 ? " Incluye tus categorías personalizadas." : " Puedes crear categorías propias en Ajustes."}
                    </Text>
                    <View style={s.catGrid}>
                        {cats.map(cat => (
                            <TouchableOpacity
                                key={cat.id}
                                onPress={() => setCategory(cat.id)}
                                style={[s.catItem, category === cat.id && s.catActive]}
                            >
                                <Ionicons
                                    name={cat.icon}
                                    size={24}
                                    color={category === cat.id ? cat.color : C.textSub}
                                />
                                <Text style={[s.catLbl, category === cat.id && { color: C.textPrimary }]} numberOfLines={1}>
                                    {cat.label}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </View>

                {/* GUARDAR */}
                <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleAdd} disabled={loading}>
                    <Ionicons name="save" size={20} color="#1A0E00" style={{ marginLeft: 8 }} />
                    <Text style={s.btnTxt}>{loading ? "Guardando..." : `Guardar ${type === 'expense' ? 'Gasto' : 'Ingreso'} en ${currency}`}</Text>
                </TouchableOpacity>

                <View style={{ height: 140 }} />
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 },
    title: { color: C.textPrimary, fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },
    smsBtn: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: C.primaryDark + "44", paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.primary + "44" },
    smsBtnTxt: { color: C.primaryLight, fontSize: 12, fontWeight: "700" },
    parseBtn: { flexDirection: "row", backgroundColor: C.accent, borderRadius: 10, paddingVertical: 12, alignItems: "center", justifyContent: "center", gap: 8, marginTop: 12 },
    parseBtnTxt: { color: "#1A0E00", fontSize: 13, fontWeight: "800" },
    typeRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
    typeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: C.cardBorder, backgroundColor: C.card },
    typeTxt: { color: C.textSub, fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
    typeBtnExp: { borderColor: C.expense, backgroundColor: C.expense + "22", ...shadow(C.expense, 8, 0.3) },
    typeBtnInc: { borderColor: C.income, backgroundColor: C.income + "22", ...shadow(C.income, 8, 0.3) },
    card: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 18, marginBottom: 14, ...shadow("#000", 6, 0.3) },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
    currencyRow: { flexDirection: "row", gap: 8 },
    currencyBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    currencyBtnActive: { borderColor: C.primary, borderTopColor: C.primaryLight, backgroundColor: C.primaryDark + "33", ...shadow(C.primaryGlow, 6, 0.4) },
    currencyTxt: { color: C.textSub, fontSize: 15, fontWeight: "700" },
    amtRow: { flexDirection: "row", alignItems: "center" },
    cur: { color: C.textMuted, fontSize: 24, fontWeight: "600", marginRight: 8 },
    amtInput: { flex: 1, fontSize: 44, fontWeight: "900", height: 80 },
    descRow: { flexDirection: "row", alignItems: "center", borderBottomWidth: 1, borderBottomColor: C.primary + "55", paddingBottom: 8 },
    txtInput: { flex: 1, color: C.text, fontSize: 16 },
    catGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
    catItem: { width: "31%", alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep, marginBottom: 8 },
    catActive: { borderColor: C.primary, borderTopColor: C.primaryLight, backgroundColor: C.primaryDark + "33", ...shadow(C.primaryGlow, 8, 0.4) },
    catLbl: { color: C.textSub, fontSize: 10, marginTop: 6, fontWeight: "600", textAlign: "center" },
    btn: { flexDirection: "row", backgroundColor: C.primary, borderRadius: 14, paddingVertical: 18, alignItems: "center", justifyContent: "center", gap: 10, borderWidth: 1, borderColor: C.primaryLight, borderTopColor: C.accentLight, marginTop: 6, ...shadow(C.primaryGlow, 12, 0.5) },
    btnTxt: { color: "#1A0E00", fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
});