import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
    Alert, FlatList, KeyboardAvoidingView, Modal, Platform, ScrollView,
    StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import { Account, CreditInstallment, Currency, StorageService, Transaction, UserSettings } from "../services/storage";
import { getAllExpenseCategories, getAllIncomeCategories, getCat } from "../categories";
import { C, shadow } from "../theme";
import InstallmentModal from "./InstallmentModal";

// ─────────────────────────────────────────────────────────────
// MODAL DE DETALLE / EDICIÓN
// ─────────────────────────────────────────────────────────────
interface DetailModalProps {
    tx: Transaction;
    settings: UserSettings;
    onClose: () => void;
    onSave: (updated: Transaction) => void;
    onDelete: (id: string) => void;
    onConvertToInstallment: () => void;
}

function DetailModal({ tx, settings, onClose, onSave, onDelete, onConvertToInstallment }: DetailModalProps) {
    const [category, setCategory] = useState(tx.category);
    const [currency, setCurrency] = useState<Currency>(tx.currency || 'Q');
    const [description, setDescription] = useState(tx.description);
    const [showSMS, setShowSMS] = useState(false);
    const [saving, setSaving] = useState(false);

    const cats = tx.type === 'expense'
        ? getAllExpenseCategories(settings.customCategories)
        : getAllIncomeCategories(settings.customCategories);

    const selectedCat = getCat(category, settings.customCategories);
    const currencies: Currency[] = ['Q', 'USD', 'EUR', '£'];

    const handleSave = async () => {
        setSaving(true);
        const updated: Transaction = { ...tx, category, currency, description };
        await StorageService.updateTransaction(updated);
        onSave(updated);
        setSaving(false);
        onClose();
    };

    const handleDelete = () => {
        if (Platform.OS === 'web') {
            if (window.confirm("¿Borrar este registro permanentemente?")) onDelete(tx.id);
        } else {
            Alert.alert("Eliminar", "¿Borrar este registro permanentemente?", [
                { text: "Cancelar", style: "cancel" },
                { text: "Eliminar", style: "destructive", onPress: () => { onDelete(tx.id); onClose(); } },
            ]);
        }
    };

    return (
        <Modal visible animationType="slide" transparent onRequestClose={onClose}>
            <View style={m.overlay}>
                <View style={m.sheet}>

                    {/* HEADER */}
                    <View style={m.header}>
                        <View style={[m.catIcon, { backgroundColor: selectedCat.color + "22", borderColor: selectedCat.color + "55" }]}>
                            <Ionicons name={selectedCat.icon} size={28} color={selectedCat.color} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text style={m.amount}>
                                <Text style={{ color: tx.type === 'income' ? C.income : C.expense }}>
                                    {tx.type === 'income' ? '+' : '-'}
                                </Text>
                                {' '}{tx.currency || 'Q'} {tx.amount.toFixed(2)}
                            </Text>
                            <Text style={m.date}>
                                {new Date(tx.date).toLocaleDateString("es-GT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={m.closeBtn}>
                            <Ionicons name="close" size={22} color={C.textMuted} />
                        </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false}>

                        {/* BANCO / FUENTE */}
                        {tx.bank && (
                            <View style={m.infoRow}>
                                <Ionicons name="business-outline" size={16} color={C.textMuted} style={m.infoIcon} />
                                <Text style={m.infoLabel}>Banco</Text>
                                <Text style={m.infoValue}>{tx.bank}</Text>
                            </View>
                        )}

                        {/* FUENTE */}
                        <View style={m.infoRow}>
                            <Ionicons name={tx.source === 'sms' ? "chatbubble-outline" : "pencil-outline"} size={16} color={C.textMuted} style={m.infoIcon} />
                            <Text style={m.infoLabel}>Fuente</Text>
                            <Text style={m.infoValue}>{tx.source === 'sms' ? 'Detectado por SMS' : 'Ingreso manual'}</Text>
                        </View>

                        {/* DESCRIPCIÓN EDITABLE */}
                        <View style={m.section}>
                            <Text style={m.sectionLabel}>DESCRIPCIÓN</Text>
                            <TextInput
                                style={m.input}
                                value={description}
                                onChangeText={setDescription}
                                placeholderTextColor={C.textMuted}
                                placeholder="Descripción del movimiento..."
                                multiline
                            />
                        </View>

                        {/* MONEDA EDITABLE */}
                        <View style={m.section}>
                            <Text style={m.sectionLabel}>MONEDA</Text>
                            <View style={m.currencyRow}>
                                {currencies.map(cur => (
                                    <TouchableOpacity
                                        key={cur}
                                        style={[m.currencyBtn, currency === cur && m.currencyBtnActive]}
                                        onPress={() => setCurrency(cur)}
                                    >
                                        <Text style={[m.currencyTxt, currency === cur && { color: C.primaryLight }]}>{cur}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* CATEGORÍA EDITABLE */}
                        <View style={m.section}>
                            <Text style={m.sectionLabel}>CATEGORÍA</Text>
                            <View style={m.catGrid}>
                                {cats.map(cat => (
                                    <TouchableOpacity
                                        key={cat.id}
                                        style={[m.catItem, category === cat.id && m.catItemActive]}
                                        onPress={() => setCategory(cat.id)}
                                    >
                                        <Ionicons name={cat.icon} size={20} color={category === cat.id ? C.primaryLight : C.textSub} />
                                        <Text style={[m.catLabel, category === cat.id && { color: C.textPrimary }]} numberOfLines={1}>
                                            {cat.label}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        </View>

                        {/* SMS ORIGINAL */}
                        {tx.originalSMS && (
                            <View style={m.section}>
                                <TouchableOpacity style={m.smsToggle} onPress={() => setShowSMS(!showSMS)}>
                                    <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.accent} />
                                    <Text style={m.smsToggleTxt}>Ver SMS original</Text>
                                    <Ionicons name={showSMS ? "chevron-up" : "chevron-down"} size={16} color={C.accent} />
                                </TouchableOpacity>
                                {showSMS && (
                                    <View style={m.smsBox}>
                                        <Text style={m.smsTxt}>{tx.originalSMS}</Text>
                                    </View>
                                )}
                            </View>
                        )}

                        {/* BOTONES */}
                        <TouchableOpacity style={m.saveBtn} onPress={handleSave} disabled={saving}>
                            <Ionicons name="save-outline" size={20} color="#1A0E00" />
                            <Text style={m.saveBtnTxt}>{saving ? "Guardando..." : "Guardar Cambios"}</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={m.convertBtn} onPress={onConvertToInstallment}>
                            <Ionicons name="card-outline" size={18} color={C.primaryLight} />
                            <Text style={m.convertBtnTxt}>Convertir a Visacuota</Text>
                        </TouchableOpacity>

                        <TouchableOpacity style={m.deleteBtn} onPress={handleDelete}>
                            <Ionicons name="trash-outline" size={18} color={C.danger} />
                            <Text style={m.deleteBtnTxt}>Eliminar Transacción</Text>
                        </TouchableOpacity>

                        <View style={{ height: 40 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

// ─────────────────────────────────────────────────────────────
// TARJETA DE TRANSACCIÓN
// ─────────────────────────────────────────────────────────────
interface TxCardProps {
    tx: Transaction;
    settings: UserSettings;
    onDelete: (id: string) => void;
    onPress: (tx: Transaction) => void;
}

export function TxCard({ tx, settings, onDelete, onPress }: TxCardProps) {
    const cat = getCat(tx.category, settings.customCategories);
    const isIncome = tx.type === "income";
    const txCurrency = tx.currency || 'Q';

    return (
        <TouchableOpacity style={s.txCard} onPress={() => onPress(tx)} activeOpacity={0.75}>
            <View style={[s.txIconGlass, { backgroundColor: cat.color + "22", borderColor: cat.color + "44", borderTopColor: cat.color + "99", shadowColor: cat.color }]}>
                <Ionicons name={cat.icon} size={22} color={cat.color} style={{ opacity: 0.9 }} />
            </View>

            <View style={{ flex: 1 }}>
                <Text style={s.txDesc} numberOfLines={1}>{tx.description || cat.label}</Text>
                <View style={s.txMeta}>
                    <Text style={s.txDate}>
                        {new Date(tx.date).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" })}
                    </Text>
                    {tx.bank && (
                        <View style={s.bankBadge}>
                            <Text style={s.bankTxt}>{tx.bank.toUpperCase()}</Text>
                        </View>
                    )}
                    {tx.source === "sms" && (
                        <View style={s.smsBadge}>
                            <Text style={s.smsBadgeTxt}>SMS</Text>
                        </View>
                    )}
                    {txCurrency !== 'Q' && (
                        <View style={[s.currencyBadge, { backgroundColor: "#4A9EE822", borderColor: "#4A9EE844" }]}>
                            <Text style={[s.currencyBadgeTxt, { color: "#4A9EE8" }]}>{txCurrency}</Text>
                        </View>
                    )}
                    <Text style={[s.txCat, { color: cat.color + "cc" }]}>{cat.label}</Text>
                </View>
            </View>

            <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.txAmount, { color: isIncome ? C.income : C.expense }]}>
                    {isIncome ? "+" : "-"}{txCurrency} {tx.amount.toFixed(2)}
                </Text>
                <TouchableOpacity
                    style={s.delBtn}
                    onPress={() => {
                        if (Platform.OS === 'web') {
                            if (window.confirm("¿Borrar este registro permanentemente?")) onDelete(tx.id);
                        } else {
                            Alert.alert("Eliminar", "¿Borrar este registro?", [
                                { text: "Cancelar", style: "cancel" },
                                { text: "Eliminar", style: "destructive", onPress: () => onDelete(tx.id) },
                            ]);
                        }
                    }}
                >
                    <Ionicons name="trash-outline" size={18} color={C.danger} />
                </TouchableOpacity>
            </View>
        </TouchableOpacity>
    );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props {
    transactions: Transaction[];
    settings: UserSettings;
    onDelete: (id: string) => void;
    onUpdate: (tx: Transaction) => void;
    accounts: Account[];
    onConvertToInstallment: (item: CreditInstallment, originalTxId: string) => void;
}

export default function TransactionsScreen({ transactions, settings, onDelete, onUpdate, accounts, onConvertToInstallment }: Props) {
    const [filter, setFilter] = useState<"all" | "expense" | "income">("all");
    const [currency, setCurrency] = useState<"all" | "Q" | "USD" | "EUR">("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Transaction | null>(null);
    const [convertingTx, setConvertingTx] = useState<Transaction | null>(null);

    // Memoizar el filtrado para no recalcular en cada render
    const filtered = useMemo(() => transactions
        .filter(t => filter === "all" || t.type === filter)
        .filter(t => currency === "all" || (t.currency || 'Q') === currency)
        .filter(t => !search ||
            t.description.toLowerCase().includes(search.toLowerCase()) ||
            getCat(t.category, settings.customCategories).label.toLowerCase().includes(search.toLowerCase()) ||
            (t.bank || '').toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [transactions, filter, currency, search, settings.customCategories]);

    const hasUSD = transactions.some(t => t.currency === 'USD');
    const hasEUR = transactions.some(t => t.currency === 'EUR');

    // Renderizador memoizado para FlatList (evita re-renders innecesarios)
    const renderItem = useCallback(({ item }: { item: Transaction }) => (
        <TxCard
            tx={item}
            settings={settings}
            onDelete={onDelete}
            onPress={setSelected}
        />
    ), [settings, onDelete]);

    const keyExtractor = useCallback((item: Transaction) => item.id, []);

    return (
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1 }}>
            <View style={s.screen}>
                {/* LISTA — FlatList para rendimiento óptimo con 500+ registros */}
                <FlatList
                    data={filtered}
                    renderItem={renderItem}
                    keyExtractor={keyExtractor}
                    showsVerticalScrollIndicator={false}
                    initialNumToRender={20}
                    maxToRenderPerBatch={15}
                    windowSize={10}
                    removeClippedSubviews={true}
                    ListHeaderComponent={
                        <View style={{ paddingBottom: 10 }}>
                            <View style={s.header}>
                                <Text style={s.title}>Movimientos</Text>
                                <Text style={s.sub}>{filtered.length} registros</Text>
                            </View>

                            {/* BÚSQUEDA */}
                            <View style={s.searchBox}>
                                <Ionicons name="search" size={18} color={C.textMuted} style={{ marginRight: 8 }} />
                                <TextInput
                                    style={s.searchInput}
                                    value={search}
                                    onChangeText={setSearch}
                                    placeholder="Buscar por descripción, banco, categoría..."
                                    placeholderTextColor={C.textMuted}
                                />
                                {search.length > 0 && (
                                    <TouchableOpacity onPress={() => setSearch("")}>
                                        <Ionicons name="close-circle" size={18} color={C.textMuted} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* FILTRO TIPO */}
                            <View style={s.filterRow}>
                                {(["all", "expense", "income"] as const).map(f => (
                                    <TouchableOpacity key={f} style={[s.filterTab, filter === f && s.filterTabActive]} onPress={() => setFilter(f)}>
                                        <Text style={[s.filterTxt, filter === f && s.filterTxtActive]}>
                                            {f === "all" ? "Todos" : f === "expense" ? "Gastos" : "Ingresos"}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* FILTRO MONEDA (solo si hay múltiples) */}
                            {(hasUSD || hasEUR) && (
                                <View style={[s.filterRow, { marginBottom: 10 }]}>
                                    {(["all", "Q", ...(hasUSD ? ["USD"] : []), ...(hasEUR ? ["EUR"] : [])] as const).map((cur: any) => (
                                        <TouchableOpacity key={cur} style={[s.filterTab, currency === cur && s.filterTabActive]} onPress={() => setCurrency(cur)}>
                                            <Text style={[s.filterTxt, currency === cur && s.filterTxtActive]}>
                                                {cur === "all" ? "Todas" : cur}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </View>
                    }
                    getItemLayout={(_data, index) => ({ length: 84, offset: 84 * index, index })}
                    ListEmptyComponent={
                        <View style={s.empty}>
                            <Ionicons name="search-outline" size={48} color={C.textMuted} />
                            <Text style={s.emptyTxt}>No hay resultados</Text>
                        </View>
                    }
                    ListFooterComponent={<View style={{ height: 120 }} />}
                    keyboardShouldPersistTaps="handled"
                />
            </View>

            {/* MODAL DETALLE */}
            {selected && (
                <DetailModal
                    tx={selected}
                    settings={settings}
                    onClose={() => setSelected(null)}
                    onSave={(updated) => { onUpdate(updated); setSelected(null); }}
                    onDelete={(id) => { onDelete(id); setSelected(null); }}
                    onConvertToInstallment={() => { setConvertingTx(selected); setSelected(null); }}
                />
            )}

            {/* MODAL CONVERTIR A VISACUOTA */}
            {convertingTx && (
                <InstallmentModal
                    accounts={accounts}
                    prefill={{ name: convertingTx.description, total: convertingTx.amount.toString(), currency: convertingTx.currency }}
                    onSave={(item) => { onConvertToInstallment(item, convertingTx.id); setConvertingTx(null); }}
                    onClose={() => setConvertingTx(null)}
                />
            )}
        </KeyboardAvoidingView>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS PANTALLA
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16, paddingTop: 52 },
    header: { marginBottom: 18 },
    title: { color: C.textPrimary, fontSize: 26, fontWeight: "800", letterSpacing: 0.5 },
    sub: { color: C.textSub, fontSize: 13, marginTop: 2 },
    searchBox: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12 },
    searchInput: { flex: 1, color: C.text, fontSize: 14 },
    filterRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
    filterTab: { flex: 1, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, alignItems: "center", backgroundColor: C.bgDeep },
    filterTabActive: { borderColor: C.primary, borderTopColor: C.primaryLight, backgroundColor: C.primaryDark + "33", ...shadow(C.primaryGlow, 6, 0.3) },
    filterTxt: { color: C.textSub, fontSize: 12, fontWeight: "700", textTransform: "uppercase" },
    filterTxtActive: { color: C.primaryLight, fontWeight: "900" },
    empty: { alignItems: "center", marginTop: 60, gap: 12 },
    emptyTxt: { color: C.textMuted, fontSize: 14 },
    txCard: { flexDirection: "row", alignItems: "center", backgroundColor: C.cardHigh, borderRadius: 18, padding: 14, marginBottom: 12, borderWidth: 1, borderColor: C.cardBorder, borderTopColor: C.shimmer, ...shadow("#000", 10, 0.4) },
    txIconGlass: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginRight: 14, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.6, shadowRadius: 10, elevation: 8 },
    txDesc: { color: C.text, fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },
    txMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
    txDate: { color: C.textMuted, fontSize: 11 },
    txCat: { color: C.textMuted, fontSize: 11 },
    txAmount: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
    delBtn: { backgroundColor: C.danger + "22", padding: 6, borderRadius: 8, borderWidth: 1, borderColor: C.danger + "44" },
    bankBadge: { backgroundColor: C.primary + "33", paddingHorizontal: 6, borderRadius: 4, borderWidth: 1, borderColor: C.primary + "55" },
    bankTxt: { color: C.primaryLight, fontSize: 8, fontWeight: "900" },
    smsBadge: { backgroundColor: C.accent + "22", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 1, borderColor: C.accent + "55" },
    smsBadgeTxt: { color: C.accent, fontSize: 9, fontWeight: "800" },
    currencyBadge: { paddingHorizontal: 6, borderRadius: 4, paddingVertical: 2, borderWidth: 1 },
    currencyBadgeTxt: { fontSize: 9, fontWeight: "900" },
});

// ─────────────────────────────────────────────────────────────
// ESTILOS MODAL
// ─────────────────────────────────────────────────────────────
const m = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: "#000000AA", justifyContent: "flex-end" },
    sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.primary + "55", padding: 24, maxHeight: "90%", ...shadow(C.primaryGlow, 20, 0.4) },
    header: { flexDirection: "row", alignItems: "center", marginBottom: 20 },
    catIcon: { width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    amount: { color: C.text, fontSize: 22, fontWeight: "900" },
    date: { color: C.textMuted, fontSize: 12, marginTop: 2, textTransform: "capitalize" },
    closeBtn: { padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
    infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.separator },
    infoIcon: { marginRight: 10 },
    infoLabel: { color: C.textMuted, fontSize: 13, flex: 1 },
    infoValue: { color: C.text, fontSize: 13, fontWeight: "700" },
    section: { marginTop: 18 },
    sectionLabel: { color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
    input: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, padding: 12, color: C.text, fontSize: 14 },
    currencyRow: { flexDirection: "row", gap: 8 },
    currencyBtn: { flex: 1, paddingVertical: 12, alignItems: "center", borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    currencyBtnActive: { borderColor: C.primary, backgroundColor: C.primaryDark + "33" },
    currencyTxt: { color: C.textSub, fontSize: 14, fontWeight: "700" },
    catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    catItem: { width: "30%", alignItems: "center", paddingVertical: 12, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
    catItemActive: { borderColor: C.primary, backgroundColor: C.primaryDark + "33" },
    catLabel: { color: C.textSub, fontSize: 10, marginTop: 4, fontWeight: "600", textAlign: "center" },
    smsToggle: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: C.accent + "11", borderRadius: 10, borderWidth: 1, borderColor: C.accent + "33" },
    smsToggleTxt: { color: C.accentLight, fontSize: 13, fontWeight: "700", flex: 1 },
    smsBox: { marginTop: 8, padding: 12, backgroundColor: C.bgDeep, borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder },
    smsTxt: { color: C.textSub, fontSize: 12, lineHeight: 18 },
    saveBtn: { flexDirection: "row", backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: "center", justifyContent: "center", gap: 10, marginTop: 20, ...shadow(C.primaryGlow, 10, 0.4) },
    saveBtnTxt: { color: "#1A0E00", fontSize: 15, fontWeight: "900" },
    convertBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: C.primary + "44", backgroundColor: C.primary + "11" },
    convertBtnTxt: { color: C.primaryLight, fontSize: 14, fontWeight: "700" },
    deleteBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, marginTop: 10, borderRadius: 12, borderWidth: 1, borderColor: C.danger + "44", backgroundColor: C.danger + "11" },
    deleteBtnTxt: { color: C.danger, fontSize: 14, fontWeight: "700" },
});