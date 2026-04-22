import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    Alert, KeyboardAvoidingView, Modal, Platform,
    ScrollView, StyleSheet, Switch, Text,
    TextInput, TouchableOpacity, View
} from "react-native";
import { Currency, CustomCategory, StorageService, UserSettings } from "../services/storage";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "../categories";
import { C, shadow } from "../theme";

// ─────────────────────────────────────────────────────────────
// SECCIÓN CON TÍTULO Y DESCRIPCIÓN
// ─────────────────────────────────────────────────────────────
function Section({ icon, title, description, children }: {
    icon: any; title: string; description?: string; children: React.ReactNode;
}) {
    return (
        <View style={s.section}>
            <View style={s.sectionHeader}>
                <View style={s.sectionIconBg}>
                    <Ionicons name={icon} size={18} color={C.primaryLight} />
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={s.sectionTitle}>{title}</Text>
                    {description && <Text style={s.sectionDesc}>{description}</Text>}
                </View>
            </View>
            {children}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// MODAL PARA CREAR CATEGORÍA CUSTOM
// ─────────────────────────────────────────────────────────────
function NewCategoryModal({ onSave, onClose }: {
    onSave: (cat: CustomCategory) => void;
    onClose: () => void;
}) {
    const [label, setLabel] = useState("");
    const [color, setColor] = useState(CATEGORY_COLORS[0]);
    const [icon, setIcon] = useState(CATEGORY_ICONS[0]);
    const [type, setType] = useState<'expense' | 'income' | 'both'>('expense');

    const handleSave = () => {
        if (!label.trim()) { Alert.alert("Error", "Ingresa un nombre para la categoría."); return; }
        const newCat: CustomCategory = {
            id: `custom_${Date.now()}`,
            label: label.trim(),
            icon,
            color,
            type,
        };
        onSave(newCat);
        onClose();
    };

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={nc.overlay}>
                <View style={nc.sheet}>
                    <View style={nc.header}>
                        <Text style={nc.title}>Nueva Categoría</Text>
                        <TouchableOpacity onPress={onClose} style={nc.closeBtn}>
                            <Ionicons name="close" size={22} color={C.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>
                        {/* NOMBRE */}
                        <Text style={nc.label}>NOMBRE</Text>
                        <TextInput
                            style={nc.input}
                            value={label}
                            onChangeText={setLabel}
                            placeholder="Ej: Mascotas, Gym, Café..."
                            placeholderTextColor={C.textMuted}
                            autoFocus
                        />

                        {/* TIPO */}
                        <Text style={nc.label}>APLICA PARA</Text>
                        <View style={nc.typeRow}>
                            {(['expense', 'income', 'both'] as const).map(t => (
                                <TouchableOpacity
                                    key={t}
                                    style={[nc.typeBtn, type === t && nc.typeBtnActive]}
                                    onPress={() => setType(t)}
                                >
                                    <Text style={[nc.typeTxt, type === t && { color: C.primaryLight }]}>
                                        {t === 'expense' ? 'Gastos' : t === 'income' ? 'Ingresos' : 'Ambos'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* COLOR */}
                        <Text style={nc.label}>COLOR</Text>
                        <View style={nc.colorGrid}>
                            {CATEGORY_COLORS.map(c => (
                                <TouchableOpacity
                                    key={c}
                                    style={[nc.colorDot, { backgroundColor: c }, color === c && nc.colorDotActive]}
                                    onPress={() => setColor(c)}
                                >
                                    {color === c && <Ionicons name="checkmark" size={14} color="#fff" />}
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* ICONO */}
                        <Text style={nc.label}>ÍCONO</Text>
                        <View style={nc.iconGrid}>
                            {CATEGORY_ICONS.slice(0, 24).map(ic => (
                                <TouchableOpacity
                                    key={ic}
                                    style={[nc.iconBtn, icon === ic && { borderColor: color, backgroundColor: color + "22" }]}
                                    onPress={() => setIcon(ic)}
                                >
                                    <Ionicons name={ic} size={22} color={icon === ic ? color : C.textSub} />
                                </TouchableOpacity>
                            ))}
                        </View>

                        {/* PREVIEW */}
                        <View style={[nc.preview, { borderColor: color + "55", backgroundColor: color + "11" }]}>
                            <View style={[nc.previewIcon, { backgroundColor: color + "22", borderColor: color + "44" }]}>
                                <Ionicons name={icon} size={24} color={color} />
                            </View>
                            <Text style={[nc.previewLabel, { color }]}>{label || "Vista previa"}</Text>
                        </View>

                        <TouchableOpacity style={nc.saveBtn} onPress={handleSave}>
                            <Ionicons name="add-circle-outline" size={20} color="#1A0E00" />
                            <Text style={nc.saveBtnTxt}>Crear Categoría</Text>
                        </TouchableOpacity>
                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL DE AJUSTES
// ─────────────────────────────────────────────────────────────
interface Props {
    settings: UserSettings;
    onSave: (s: UserSettings) => void;
    onClearAll: () => void;
}

export default function SettingsScreen({ settings, onSave, onClearAll }: Props) {
    const [name, setName] = useState(settings.userName);
    const [budgetQ, setBudgetQ] = useState(settings.budgetLimit.toString());
    const [budgetUSD, setBudgetUSD] = useState((settings.budgetLimitUSD || 800).toString());
    const [currency, setCurrency] = useState<Currency>(settings.currency);
    const [extSavingsQ, setExtSavingsQ] = useState(settings.externalSavings?.toString() || "0");
    const [extSavingsUSD, setExtSavingsUSD] = useState((settings.externalSavingsUSD || 0).toString());
    const [exchangeRate, setExchangeRate] = useState((settings.exchangeRate || 7.70).toString());
    const [smsOpt, setSmsOpt] = useState(settings.smsEnabled ?? true);
    const [apiKey, setApiKey] = useState(settings.geminiApiKey || "");
    const [saved, setSaved] = useState(false);
    const [showNewCat, setShowNewCat] = useState(false);
    const [customCats, setCustomCats] = useState<CustomCategory[]>(settings.customCategories || []);

    const handleSave = async () => {
        const bQ = parseFloat(budgetQ.replace(",", "."));
        const bUSD = parseFloat(budgetUSD.replace(",", "."));
        const sQ = parseFloat(extSavingsQ.replace(",", "."));
        const sUSD = parseFloat(extSavingsUSD.replace(",", "."));
        const rate = parseFloat(exchangeRate.replace(",", "."));

        if (isNaN(bQ) || bQ <= 0) { Alert.alert("Error", "El presupuesto en Q debe ser mayor a 0."); return; }

        const updated: UserSettings = {
            ...settings,
            userName: name.trim() || "Usuario",
            budgetLimit: bQ,
            budgetLimitUSD: isNaN(bUSD) ? 800 : bUSD,
            currency,
            smsEnabled: smsOpt,
            externalSavings: isNaN(sQ) ? 0 : sQ,
            externalSavingsUSD: isNaN(sUSD) ? 0 : sUSD,
            exchangeRate: isNaN(rate) ? 7.70 : rate,
            geminiApiKey: apiKey.trim(),
            customCategories: customCats,
        };
        await StorageService.saveSettings(updated);
        onSave(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2500);
    };

    const handleAddCustomCat = async (cat: CustomCategory) => {
        const updated = [...customCats, cat];
        setCustomCats(updated);
        await StorageService.saveCustomCategory(cat);
    };

    const handleDeleteCustomCat = async (id: string) => {
        Alert.alert("Eliminar categoría", "¿Estás seguro?", [
            { text: "Cancelar", style: "cancel" },
            {
                text: "Eliminar", style: "destructive", onPress: async () => {
                    const updated = await StorageService.deleteCustomCategory(id);
                    setCustomCats(updated);
                }
            }
        ]);
    };

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} style={{ flex: 1 }}>
            <ScrollView style={s.screen} showsVerticalScrollIndicator={false}>

                <View style={s.pageHeader}>
                    <Text style={s.pageTitle}>Configuración</Text>
                    <Text style={s.pageSubtitle}>Personaliza tu experiencia financiera</Text>
                </View>

                {/* ── PERFIL ─────────────────────────────────────── */}
                <Section
                    icon="person-circle-outline"
                    title="Tu Perfil"
                    description="¿Cómo quieres que te llamemos en la app?"
                >
                    <View style={s.inputRow}>
                        <Ionicons name="person-outline" size={18} color={C.primary} style={{ marginRight: 10 }} />
                        <TextInput
                            style={s.input}
                            value={name}
                            onChangeText={setName}
                            placeholder="Tu nombre..."
                            placeholderTextColor={C.textMuted}
                        />
                    </View>
                </Section>

                {/* ── PRESUPUESTO ────────────────────────────────── */}
                <Section
                    icon="wallet-outline"
                    title="Presupuesto Mensual"
                    description="Cuánto planeas gastar cada mes. La app te avisará cuando te acerques al límite."
                >
                    <Text style={s.subLabel}>EN QUETZALES (Q)</Text>
                    <View style={s.inputRow}>
                        <Text style={s.currSymbol}>Q</Text>
                        <TextInput
                            style={s.input}
                            value={budgetQ}
                            onChangeText={setBudgetQ}
                            keyboardType="decimal-pad"
                            placeholder="6000.00"
                            placeholderTextColor={C.textMuted}
                        />
                    </View>

                    <Text style={[s.subLabel, { marginTop: 12 }]}>EN DÓLARES (USD) — opcional</Text>
                    <Text style={s.hint}>Si tienes cuentas en dólares, ingresa tu presupuesto mensual en USD.</Text>
                    <View style={s.inputRow}>
                        <Text style={s.currSymbol}>$</Text>
                        <TextInput
                            style={s.input}
                            value={budgetUSD}
                            onChangeText={setBudgetUSD}
                            keyboardType="decimal-pad"
                            placeholder="800.00"
                            placeholderTextColor={C.textMuted}
                        />
                    </View>
                </Section>

                {/* ── MONEDA PRINCIPAL ───────────────────────────── */}
                <Section
                    icon="cash-outline"
                    title="Moneda Principal"
                    description="La moneda que usas en tu día a día. Los SMS y reportes usarán esta como referencia."
                >
                    <View style={s.currencyRow}>
                        {(["Q", "$", "€", "£"] as Currency[]).map(c => (
                            <TouchableOpacity
                                key={c}
                                style={[s.currencyBtn, currency === c && s.currencyBtnActive]}
                                onPress={() => setCurrency(c)}
                            >
                                <Text style={[s.currencyTxt, currency === c && { color: C.primaryLight }]}>{c}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </Section>

                {/* ── TIPO DE CAMBIO ─────────────────────────────── */}
                <Section
                    icon="swap-horizontal-outline"
                    title="Tipo de Cambio USD → Q"
                    description="Se usa para calcular el Patrimonio Total en quetzales. Actualízalo según el tipo de cambio del día."
                >
                    <View style={s.inputRow}>
                        <Text style={s.currSymbol}>Q</Text>
                        <TextInput
                            style={s.input}
                            value={exchangeRate}
                            onChangeText={setExchangeRate}
                            keyboardType="decimal-pad"
                            placeholder="7.70"
                            placeholderTextColor={C.textMuted}
                        />
                        <Text style={{ color: C.textMuted, fontSize: 13, marginLeft: 8 }}>por USD 1.00</Text>
                    </View>
                </Section>

                {/* ── AHORROS EXTERNOS ───────────────────────────── */}
                <Section
                    icon="bank-outline"
                    title="Ahorros Externos"
                    description="Dinero que tienes guardado fuera de lo que registras en la app (bancos, cuentas de ahorro, efectivo). Se suma al Patrimonio Total."
                >
                    <Text style={s.subLabel}>EN QUETZALES (Q)</Text>
                    <View style={s.inputRow}>
                        <Text style={s.currSymbol}>Q</Text>
                        <TextInput
                            style={s.input}
                            value={extSavingsQ}
                            onChangeText={setExtSavingsQ}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor={C.textMuted}
                        />
                    </View>

                    <Text style={[s.subLabel, { marginTop: 12 }]}>EN DÓLARES (USD)</Text>
                    <View style={s.inputRow}>
                        <Text style={s.currSymbol}>$</Text>
                        <TextInput
                            style={s.input}
                            value={extSavingsUSD}
                            onChangeText={setExtSavingsUSD}
                            keyboardType="decimal-pad"
                            placeholder="0.00"
                            placeholderTextColor={C.textMuted}
                        />
                    </View>
                </Section>

                {/* ── SMS AUTOMÁTICO ─────────────────────────────── */}
                <Section
                    icon="chatbubble-outline"
                    title="Sincronización SMS Automática"
                    description="Permite que BudgetMaster lea tus mensajes de texto bancarios (BAC, BANRURAL, GTC, BANTRAB, PROMERICA) y registre tus gastos automáticamente. Solo lee SMS de bancos, nunca de contactos personales."
                >
                    <View style={s.switchRow}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.switchLabel}>{smsOpt ? "✅ Activado" : "❌ Desactivado"}</Text>
                            <Text style={s.hint}>
                                {smsOpt
                                    ? "La app detectará y registrará tus movimientos bancarios automáticamente."
                                    : "Puedes seguir registrando gastos manualmente o pegando el SMS en Agregar."}
                            </Text>
                        </View>
                        <Switch
                            value={smsOpt}
                            onValueChange={setSmsOpt}
                            trackColor={{ false: C.bgDeep, true: C.accent }}
                            thumbColor={C.text}
                            style={{ marginLeft: 12 }}
                        />
                    </View>
                </Section>

                {/* ── IA GEMINI ──────────────────────────────────── */}
                <Section
                    icon="sparkles-outline"
                    title="Inteligencia Artificial (Gemini)"
                    description="Ingresa tu API Key de Google Gemini para activar el Asesor IA avanzado. Obtén tu clave gratuita en: aistudio.google.com"
                >
                    <View style={s.inputRow}>
                        <Ionicons name="key-outline" size={18} color={C.primary} style={{ marginRight: 10 }} />
                        <TextInput
                            style={s.input}
                            value={apiKey}
                            onChangeText={setApiKey}
                            placeholder="AIzaSy..."
                            placeholderTextColor={C.textMuted}
                            secureTextEntry
                        />
                    </View>
                    {apiKey.length > 10 && (
                        <Text style={[s.hint, { color: C.accent, marginTop: 6 }]}>✅ API Key configurada. El Asesor IA usará Gemini.</Text>
                    )}
                </Section>

                {/* ── CATEGORÍAS CUSTOM ──────────────────────────── */}
                <Section
                    icon="pricetag-outline"
                    title="Mis Categorías"
                    description="Crea categorías personalizadas para clasificar mejor tus gastos e ingresos. Por ejemplo: Mascotas, Gym, Inversiones, Negocio propio, etc."
                >
                    {customCats.length === 0 ? (
                        <Text style={s.hint}>Aún no tienes categorías personalizadas. Crea una para empezar.</Text>
                    ) : (
                        <View style={s.catList}>
                            {customCats.map(cat => (
                                <View key={cat.id} style={s.catRow}>
                                    <View style={[s.catIcon, { backgroundColor: cat.color + "22", borderColor: cat.color + "44" }]}>
                                        <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.catLabel}>{cat.label}</Text>
                                        <Text style={s.catType}>{cat.type === 'expense' ? 'Gastos' : cat.type === 'income' ? 'Ingresos' : 'Ambos'}</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => handleDeleteCustomCat(cat.id)} style={s.catDeleteBtn}>
                                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}
                    <TouchableOpacity style={s.addCatBtn} onPress={() => setShowNewCat(true)}>
                        <Ionicons name="add-circle-outline" size={20} color={C.primaryLight} />
                        <Text style={s.addCatTxt}>Crear nueva categoría</Text>
                    </TouchableOpacity>
                </Section>

                {/* ── GUARDAR ────────────────────────────────────── */}
                <TouchableOpacity style={s.saveBtn} onPress={handleSave}>
                    <Ionicons name={saved ? "checkmark-circle" : "save-outline"} size={22} color="#1A0E00" />
                    <Text style={s.saveBtnTxt}>{saved ? "¡Cambios guardados!" : "Guardar Cambios"}</Text>
                </TouchableOpacity>

                {/* ── ZONA DE PELIGRO ────────────────────────────── */}
                <View style={s.dangerZone}>
                    <Text style={s.dangerTitle}>⚠️ Zona de Peligro</Text>
                    <Text style={s.dangerDesc}>
                        Esto borrará TODAS tus transacciones, configuración y categorías personalizadas permanentemente. Esta acción no se puede deshacer.
                    </Text>
                    <TouchableOpacity
                        style={s.dangerBtn}
                        onPress={() => {
                            if (Platform.OS === 'web') {
                                if (window.confirm("¿Borrar todos los datos permanentemente?")) onClearAll();
                            } else {
                                Alert.alert(
                                    "⚠️ Borrar Todo",
                                    "Esta acción eliminará TODAS tus transacciones y configuración. ¿Estás completamente seguro?",
                                    [
                                        { text: "Cancelar", style: "cancel" },
                                        { text: "Sí, borrar todo", style: "destructive", onPress: onClearAll }
                                    ]
                                );
                            }
                        }}
                    >
                        <Ionicons name="trash-outline" size={18} color={C.danger} />
                        <Text style={s.dangerBtnTxt}>Borrar Todos los Datos</Text>
                    </TouchableOpacity>
                </View>

                <View style={{ height: 120 }} />
            </ScrollView>

            {showNewCat && (
                <NewCategoryModal
                    onSave={handleAddCustomCat}
                    onClose={() => setShowNewCat(false)}
                />
            )}
        </KeyboardAvoidingView>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    pageHeader: { marginBottom: 24 },
    pageTitle: { color: C.textPrimary, fontSize: 28, fontWeight: "900", letterSpacing: 0.5 },
    pageSubtitle: { color: C.textSub, fontSize: 13, marginTop: 4 },

    // Sección
    section: { backgroundColor: C.card, borderRadius: 18, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, padding: 18, marginBottom: 16, ...shadow("#000", 6, 0.3) },
    sectionHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
    sectionIconBg: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryDark + "44", borderWidth: 1, borderColor: C.primary + "55", alignItems: "center", justifyContent: "center", marginRight: 12, marginTop: 2 },
    sectionTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
    sectionDesc: { color: C.textSub, fontSize: 12, marginTop: 3, lineHeight: 17 },

    // Inputs
    subLabel: { color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
    hint: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.bgDeep, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 14, paddingVertical: 12 },
    input: { flex: 1, color: C.text, fontSize: 15 },
    currSymbol: { color: C.textMuted, fontSize: 16, fontWeight: "700", marginRight: 8 },

    // Moneda
    currencyRow: { flexDirection: "row", gap: 8 },
    currencyBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    currencyBtnActive: { borderColor: C.primary, borderTopColor: C.primaryLight, backgroundColor: C.primaryDark + "33", ...shadow(C.primaryGlow, 6, 0.4) },
    currencyTxt: { color: C.textSub, fontSize: 18, fontWeight: "900" },

    // Switch SMS
    switchRow: { flexDirection: "row", alignItems: "center" },
    switchLabel: { color: C.text, fontSize: 14, fontWeight: "700", marginBottom: 4 },

    // Categorías custom
    catList: { marginBottom: 12 },
    catRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.separator },
    catIcon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 12 },
    catLabel: { color: C.text, fontSize: 14, fontWeight: "700" },
    catType: { color: C.textMuted, fontSize: 11, marginTop: 2 },
    catDeleteBtn: { padding: 8, borderRadius: 8, backgroundColor: C.danger + "11", borderWidth: 1, borderColor: C.danger + "33" },
    addCatBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, borderWidth: 1, borderColor: C.primary + "44", backgroundColor: C.primaryDark + "22" },
    addCatTxt: { color: C.primaryLight, fontSize: 14, fontWeight: "700" },

    // Guardar
    saveBtn: { flexDirection: "row", backgroundColor: C.primary, borderRadius: 16, paddingVertical: 18, alignItems: "center", justifyContent: "center", gap: 10, marginTop: 8, marginBottom: 8, ...shadow(C.primaryGlow, 12, 0.5) },
    saveBtnTxt: { color: "#1A0E00", fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },

    // Peligro
    dangerZone: { marginTop: 8, padding: 20, borderRadius: 18, borderWidth: 1, borderColor: C.danger + "44", backgroundColor: C.danger + "0A" },
    dangerTitle: { color: C.danger, fontSize: 18, fontWeight: "800", marginBottom: 8 },
    dangerDesc: { color: C.textSub, fontSize: 13, lineHeight: 19, marginBottom: 16 },
    dangerBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 14, borderRadius: 12, borderWidth: 1, borderColor: C.danger + "66", backgroundColor: C.danger + "11" },
    dangerBtnTxt: { color: C.danger, fontWeight: "700", fontSize: 14 },
});

// ─────────────────────────────────────────────────────────────
// ESTILOS MODAL NUEVA CATEGORÍA
// ─────────────────────────────────────────────────────────────
const nc = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
    sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.primary + "55", padding: 24, maxHeight: "90%" },
    header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 20 },
    title: { color: C.textPrimary, fontSize: 20, fontWeight: "900" },
    closeBtn: { padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
    label: { color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10, marginTop: 16 },
    input: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, padding: 14, color: C.text, fontSize: 15 },
    typeRow: { flexDirection: "row", gap: 8 },
    typeBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    typeBtnActive: { borderColor: C.primary, backgroundColor: C.primaryDark + "33" },
    typeTxt: { color: C.textSub, fontSize: 13, fontWeight: "700" },
    colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    colorDotActive: { borderWidth: 3, borderColor: "#fff" },
    iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    preview: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 14, borderWidth: 1, marginTop: 16, gap: 14 },
    previewIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    previewLabel: { fontSize: 18, fontWeight: "800" },
    saveBtn: { flexDirection: "row", backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center", gap: 10, marginTop: 20, ...shadow(C.primaryGlow, 10, 0.4) },
    saveBtnTxt: { color: "#1A0E00", fontSize: 15, fontWeight: "900" },
});