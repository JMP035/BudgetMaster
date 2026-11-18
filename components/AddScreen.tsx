import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import DateTimePicker from "@react-native-community/datetimepicker";
import {
    KeyboardAvoidingView, Platform, ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import { Account, Currency, Transaction, UserSettings, formatDateOnly, parseAmount, parseDateOnly } from "../services/storage";
import { getAllExpenseCategories, getAllIncomeCategories } from "../categories";
import { C } from "../theme";
import { SmsService } from "../services/SmsService";
import { useTutorialRef, useTutorialScroll } from "../context/TutorialContext";
import { GlassDialog } from "./GlassDialog";
import type { GlassDialogProps } from "./GlassDialog";
import { GlassCard, GlassBackground } from "./GlassCard";
import { GlassButton } from "./GlassButton";
import { ScreenHeader } from "./ScreenHeader";
import { HelpButton } from "./HelpButton";
import { useKeyboardHeight } from "./useKeyboardHeight";
import { NewCategorySheet } from "./NewCategorySheet";
import { formatMoney } from "../services/format";
import { isSmsFeatureOn } from "../services/features";

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
    const [dialog, setDialog] = useState<Omit<GlassDialogProps, "visible" | "onClose"> | null>(null);
    const [dateStr, setDateStr] = useState(formatDateOnly(new Date()));
    const [showDatePicker, setShowDatePicker] = useState(false);
    const [showNewCat, setShowNewCat] = useState(false);
    const kb = useKeyboardHeight();
    const tutScroll = useTutorialScroll('add');
    const smsOn = isSmsFeatureOn(settings);

    // Si se apaga el interruptor de SMS, cerrar y limpiar el panel de pegar SMS.
    useEffect(() => {
        if (!smsOn) {
            setShowSmsInput(false);
            setSmsText("");
        }
    }, [smsOn]);

    const typeSelectorRef = useTutorialRef('add_type_selector');
    const currencyRef = useTutorialRef('add_currency');
    const amountRef = useTutorialRef('add_amount');
    const descriptionRef = useTutorialRef('add_description');
    const categoryRef = useTutorialRef('add_category');
    const smsBtnRef = useTutorialRef('add_sms_btn');
    const headerRef = useTutorialRef('add_header');
    const saveBtnRef = useTutorialRef('add_save_btn');

    const currencies: Currency[] = ['Q', 'USD', 'EUR', '£'];

    const expenseCats = getAllExpenseCategories(settings.customCategories);
    const incomeCats = getAllIncomeCategories(settings.customCategories);
    const cats = type === "expense" ? expenseCats : incomeCats;

    const handleParseSms = () => {
        if (!smsText.trim()) {
            setDialog({ variant: "warning", icon: "clipboard-outline", title: "Falta el SMS", message: "Pega el texto de tu SMS primero." });
            return;
        }

        const parsed = SmsService.parseSimpleSms(smsText, undefined, accounts);

        if (!parsed) {
            const why = SmsService.explainSms(smsText).reasonLabel;
            setDialog({
                variant: "info",
                icon: "information-circle-outline",
                title: "No se registró",
                message: `No se registró: ${why}`,
                footnote: "Si es un movimiento real, ingresalo manualmente.",
            });
            return;
        }

        if (parsed.kind === "installment") {
            const inst = parsed.installment!;
            setDialog({
                variant: "info",
                icon: "layers-outline",
                title: "Compra a cuotas detectada",
                message: inst.name,
                stats: [
                    { icon: "cash-outline", label: "Total", value: formatMoney(inst.totalAmount, inst.currency) },
                    { icon: "repeat-outline", label: "Cuotas", value: inst.totalInstallments },
                    { icon: "calendar-outline", label: "Pago mensual", value: formatMoney(inst.monthlyPayment, inst.currency) },
                ],
                footnote: "Registrala desde Cuentas → Visacuotas.",
            });
            setShowSmsInput(false);
            setSmsText("");
            return;
        }

        const tx = parsed.transaction!;

        // Pago de tarjeta o desembolso: movimiento neutro, no es gasto ni ingreso.
        if (tx.type === "transfer") {
            const isLoan = SmsService.explainSms(smsText).kind === "loan_disbursement";
            setDialog({
                variant: "info",
                icon: "swap-horizontal-outline",
                title: isLoan ? "Desembolso detectado" : "Pago de tarjeta detectado",
                message: `${tx.description || "Movimiento"} por ${formatMoney(tx.amount, tx.currency)}.`,
                footnote: "Es un movimiento neutro: no cuenta como gasto ni como ingreso, por eso no se carga en el formulario. La sincronización de SMS en Inicio lo registra como neutro.",
            });
            setShowSmsInput(false);
            setSmsText("");
            return;
        }

        setCurrency(tx.currency);
        setAmount(tx.amount.toString());
        setType(tx.type === "income" ? "income" : "expense");
        setCategory(tx.category);
        setDesc(tx.description);
        setShowSmsInput(false);
        setSmsText("");
        setDialog({
            variant: "success",
            icon: "flash-outline",
            title: "Detectado",
            message: `Mensaje de ${tx.bank || "tu banco"} analizado correctamente.`,
        });
    };

    const handleAdd = async () => {
        const amt = parseAmount(amount);
        if (!amount || isNaN(amt) || amt <= 0) {
            setDialog({ variant: "warning", icon: "alert-circle-outline", title: "Monto inválido", message: "Ingresa un monto válido mayor a 0." });
            return;
        }
        setLoading(true);
        // Fecha elegida (solo día) combinada con la hora actual, para conservar el orden dentro del día.
        const picked = parseDateOnly(dateStr) ?? new Date();
        const clock = new Date();
        const when = new Date(picked.getFullYear(), picked.getMonth(), picked.getDate(), clock.getHours(), clock.getMinutes(), clock.getSeconds(), clock.getMilliseconds());
        const tx: Transaction = {
            id: Date.now().toString(36) + Math.random().toString(36).slice(2),
            amount: amt,
            description: desc.trim(),
            category,
            date: when.toISOString(),
            type,
            source: "manual",
            currency,
        };
        onAdd(tx);
        // Reset
        setAmount(""); setDesc(""); setCategory("other");
        setCurrency(settings.currency || 'Q');
        setDateStr(formatDateOnly(new Date()));
        setShowDatePicker(false);
        setLoading(false);
    };

    const pickerValue = parseDateOnly(dateStr) ?? new Date();
    const dateLabel = pickerValue.toLocaleDateString("es-GT", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });

    return (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <ScrollView {...tutScroll} style={s.screen} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                {/* HEADER */}
                <ScreenHeader
                    title="Nueva Transacción"
                    compact
                    headerRef={headerRef}
                    right={
                        <>
                            {smsOn && (
                                <View ref={smsBtnRef} collapsable={false}>
                                    <TouchableOpacity
                                        style={s.smsBtn}
                                        onPress={() => setShowSmsInput(!showSmsInput)}
                                        accessibilityRole="button"
                                        accessibilityLabel="Leer SMS del banco"
                                    >
                                        <GlassBackground radius={20} blur={false} />
                                        <Ionicons name="scan-outline" size={20} color={C.primaryLight} />
                                        <Text style={s.smsBtnTxt}>Leer SMS</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                            <HelpButton tutorialId="tutorial_agregar" />
                        </>
                    }
                />

                {/* LEER SMS */}
                {smsOn && showSmsInput && (
                    <GlassCard blur={false} style={s.card} contentStyle={s.cardContent} leftAccentColor={C.accent}>
                        <Text style={[s.lbl, { color: C.accentLight }]}>PEGA AQUÍ EL TEXTO DEL BANCO</Text>
                        <Text style={s.hint}>
                            Copia el SMS que te envió tu banco y pégalo aquí. La app detectará el monto, moneda y tipo automáticamente.
                        </Text>
                        <TextInput
                            style={[s.input, { minHeight: 80, textAlignVertical: "top" }]}
                            multiline
                            value={smsText}
                            onChangeText={setSmsText}
                            placeholder="Ej: PRF protege tu BAC Visa: compra Aprobada por Q 150.00 en WALMART..."
                            placeholderTextColor={C.textMuted}
                        />
                        <GlassButton label="Analizar SMS" icon="flash" onPress={handleParseSms} style={{ marginTop: 12 }} />
                    </GlassCard>
                )}

                {/* TIPO: GASTO / INGRESO */}
                <View style={s.typeRow} ref={typeSelectorRef} collapsable={false}>
                    <TouchableOpacity
                        style={[s.typeBtn, type === "expense" && { borderColor: C.expense, backgroundColor: C.expense + "22" }]}
                        onPress={() => { setType("expense"); setCategory("other"); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: type === "expense" }}
                    >
                        <GlassBackground radius={14} blur={false} />
                        <Ionicons name="trending-down" size={24} color={type === "expense" ? C.expense : C.textSub} />
                        <Text style={[s.typeTxt, type === "expense" && { color: C.expense }]}>Gasto</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.typeBtn, type === "income" && { borderColor: C.income, backgroundColor: C.income + "22" }]}
                        onPress={() => { setType("income"); setCategory("other"); }}
                        accessibilityRole="button"
                        accessibilityState={{ selected: type === "income" }}
                    >
                        <GlassBackground radius={14} blur={false} />
                        <Ionicons name="trending-up" size={24} color={type === "income" ? C.income : C.textSub} />
                        <Text style={[s.typeTxt, type === "income" && { color: C.income }]}>Ingreso</Text>
                    </TouchableOpacity>
                </View>

                {/* MONEDA */}
                <View ref={currencyRef} collapsable={false}>
                    <GlassCard blur={false} style={s.card} contentStyle={s.cardContent}>
                        <Text style={s.lbl}>MONEDA</Text>
                        <Text style={s.hint}>¿En qué moneda es esta transacción?</Text>
                        <View style={s.currencyRow}>
                            {currencies.map(cur => (
                                <TouchableOpacity
                                    key={cur}
                                    style={[s.currencyBtn, currency === cur && s.optionActive]}
                                    onPress={() => setCurrency(cur)}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: currency === cur }}
                                >
                                    <Text style={[s.currencyTxt, currency === cur && { color: C.primaryLight, fontSize: 18 }]}>{cur}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </GlassCard>
                </View>

                {/* MONTO */}
                <View ref={amountRef} collapsable={false}>
                    <GlassCard blur={false} style={s.card} contentStyle={s.cardContent}>
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
                    </GlassCard>
                </View>

                {/* FECHA */}
                <GlassCard blur={false} style={s.card} contentStyle={s.cardContent}>
                    <Text style={s.lbl}>FECHA</Text>
                    <TouchableOpacity
                        style={s.dateRow}
                        onPress={() => setShowDatePicker(v => !v)}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Elegir la fecha del movimiento"
                    >
                        <Ionicons name="calendar-outline" size={18} color={C.primaryLight} />
                        <Text style={s.dateTxt} numberOfLines={1}>{dateLabel}</Text>
                        <Ionicons name="chevron-down" size={16} color={C.textSub} />
                    </TouchableOpacity>
                    {showDatePicker && Platform.OS === "android" && (
                        <DateTimePicker
                            value={pickerValue}
                            mode="date"
                            display="default"
                            onChange={(event, selected) => {
                                setShowDatePicker(false);
                                if (event.type === "set" && selected) setDateStr(formatDateOnly(selected));
                            }}
                        />
                    )}
                    {showDatePicker && Platform.OS === "ios" && (
                        <View style={s.iosPickerWrap}>
                            <DateTimePicker
                                value={pickerValue}
                                mode="date"
                                display="inline"
                                themeVariant="dark"
                                accentColor={C.primary}
                                onChange={(_e, selected) => { if (selected) setDateStr(formatDateOnly(selected)); }}
                            />
                            <TouchableOpacity style={s.iosPickerDone} onPress={() => setShowDatePicker(false)}>
                                <Text style={s.iosPickerDoneTxt}>Listo</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </GlassCard>

                {/* DESCRIPCIÓN */}
                <View ref={descriptionRef} collapsable={false}>
                    <GlassCard blur={false} style={s.card} contentStyle={s.cardContent}>
                        <Text style={s.lbl}>DESCRIPCIÓN (Opcional)</Text>
                        <Text style={s.hint}>¿En qué gastaste o de dónde viene el dinero?</Text>
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
                    </GlassCard>
                </View>

                {/* CATEGORÍA */}
                <View ref={categoryRef} collapsable={false}>
                    <GlassCard blur={false} style={s.card} contentStyle={[s.cardContent, { paddingBottom: 10 }]}>
                        <Text style={s.lbl}>CATEGORÍA</Text>
                        <Text style={[s.hint, { marginBottom: 12 }]}>
                            Clasifica tu transacción para ver estadísticas más precisas.
                            {settings.customCategories?.length > 0 ? " Incluye tus categorías personalizadas." : " Puedes crear categorías propias en Ajustes."}
                        </Text>
                        <View style={s.catGrid}>
                            {cats.map(cat => (
                                <TouchableOpacity
                                    key={cat.id}
                                    onPress={() => setCategory(cat.id)}
                                    style={[s.catItem, category === cat.id && s.optionActive]}
                                    accessibilityRole="button"
                                    accessibilityState={{ selected: category === cat.id }}
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
                            <TouchableOpacity
                                onPress={() => setShowNewCat(true)}
                                style={[s.catItem, s.catItemNew]}
                                accessibilityRole="button"
                                accessibilityLabel="Nueva categoría"
                            >
                                <Ionicons name="add-circle-outline" size={24} color={C.primaryLight} />
                                <Text style={[s.catLbl, { color: C.primaryLight }]} numberOfLines={1}>+ Nueva categoría</Text>
                            </TouchableOpacity>
                        </View>
                    </GlassCard>
                </View>

                {/* GUARDAR */}
                <View ref={saveBtnRef} collapsable={false}>
                    <GlassButton
                        icon="save"
                        label={loading ? "Guardando..." : `Guardar ${type === 'expense' ? 'Gasto' : 'Ingreso'} en ${currency}`}
                        onPress={handleAdd}
                        disabled={loading}
                        style={s.btn}
                    />
                </View>

                <View style={{ height: 140 + kb }} />
            </ScrollView>
            {dialog && <GlassDialog visible onClose={() => setDialog(null)} {...dialog} />}
            {showNewCat && (
                <NewCategorySheet
                    initialType={type}
                    onSaved={cat => setCategory(cat.id)}
                    onClose={() => setShowNewCat(false)}
                />
            )}
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16 },
    smsBtn: { flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, overflow: "hidden" },
    smsBtnTxt: { color: C.primaryLight, fontSize: 12, fontWeight: "700" },
    typeRow: { flexDirection: "row", gap: 12, marginBottom: 16 },
    typeBtn: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 14, borderWidth: 1.5, borderColor: "transparent", overflow: "hidden" },
    typeTxt: { color: C.textSub, fontSize: 16, fontWeight: "800", letterSpacing: 0.5 },
    card: { marginBottom: 14 },
    cardContent: { padding: 18 },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
    hint: { color: C.textSub, fontSize: 12, marginBottom: 10 },
    input: { color: C.text, fontSize: 16, backgroundColor: C.glassInput, borderWidth: 1, borderColor: C.glassInputBorder, borderRadius: 12, padding: 12 },
    currencyRow: { flexDirection: "row", gap: 8 },
    currencyBtn: { flex: 1, paddingVertical: 14, alignItems: "center", borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    currencyTxt: { color: C.textSub, fontSize: 15, fontWeight: "700" },
    optionActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    amtRow: { flexDirection: "row", alignItems: "center" },
    cur: { color: C.textSub, fontSize: 24, fontWeight: "600", marginRight: 8 },
    amtInput: { flex: 1, fontSize: 44, fontWeight: "900", height: 80 },
    dateRow: { flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: C.glassInput, borderWidth: 1, borderColor: C.glassInputBorder, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 12 },
    dateTxt: { flex: 1, color: C.text, fontSize: 15, fontWeight: "600", textTransform: "capitalize" },
    iosPickerWrap: { marginTop: 8 },
    iosPickerDone: { alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 8 },
    iosPickerDoneTxt: { color: C.primaryLight, fontWeight: "800" },
    descRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderWidth: 1, borderColor: C.glassInputBorder, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 4 },
    txtInput: { flex: 1, color: C.text, fontSize: 16, paddingVertical: 10 },
    catGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between", gap: 8 },
    catItem: { width: "31%", alignItems: "center", paddingVertical: 14, borderRadius: 14, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput, marginBottom: 8 },
    catItemNew: { borderStyle: "dashed", borderColor: C.glassActiveBorder },
    catLbl: { color: C.textSub, fontSize: 10, marginTop: 6, fontWeight: "600", textAlign: "center" },
    btn: { marginTop: 6, paddingVertical: 18 },
});
