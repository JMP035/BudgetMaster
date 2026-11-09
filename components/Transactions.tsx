import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useMemo, useState } from "react";
import {
    FlatList, KeyboardAvoidingView, Share, StyleSheet, Switch, Text, TextInput, TouchableOpacity, useWindowDimensions, View
} from "react-native";
import { Account, CreditInstallment, Currency, StorageService, Transaction, UserSettings } from "../services/storage";
import { classifyBankSms, maskSmsForDiagnostics } from "../services/BankSmsParser";
import { merchantKey, merchantOfTransaction, sameMerchantTxIds } from "../services/MerchantRules";
import { getAllExpenseCategories, getAllIncomeCategories, getCat } from "../categories";
import { C } from "../theme";
import { isSmsFeatureOn } from "../services/features";
import Money from "./Money";
import { useTutorialRef, useTutorialScroll } from "../context/TutorialContext";
import { GlassBackground, GlassCard } from "./GlassCard";
import { useGlassDialog } from "./GlassDialogProvider";
import { GlassSheet } from "./GlassSheet";
import { GlassSegmented } from "./GlassSegmented";
import { GlassButton } from "./GlassButton";
import { ScreenHeader } from "./ScreenHeader";
import { HelpButton } from "./HelpButton";
import InstallmentModal from "./InstallmentModal";

const DELETE_CONFIRM = {
    title: "Eliminar movimiento",
    message: "Este registro se borrará de forma permanente y se recalcularán tus estadísticas.",
    confirmLabel: "Eliminar",
};

// ─────────────────────────────────────────────────────────────
// MODAL DE DETALLE / EDICIÓN
// ─────────────────────────────────────────────────────────────
interface DetailModalProps {
    tx: Transaction;
    settings: UserSettings;
    smsOn: boolean;
    transactions: Transaction[];
    onClose: () => void;
    onSave: (updated: Transaction) => void;
    onDelete: (id: string) => void;
    onReplaceAll: (txs: Transaction[]) => void;
    onConvertToInstallment: () => void;
}

function DetailModal({ tx, settings, smsOn, transactions, onClose, onSave, onDelete, onReplaceAll, onConvertToInstallment }: DetailModalProps) {
    const dialog = useGlassDialog();
    const { width } = useWindowDimensions();
    const cols = width >= 360 ? 4 : 3;
    const [category, setCategory] = useState(tx.category);
    const [currency, setCurrency] = useState<Currency>(tx.currency || 'Q');
    const [description, setDescription] = useState(tx.description);
    const [showSMS, setShowSMS] = useState(false);
    const [saving, setSaving] = useState(false);
    const [remember, setRemember] = useState(true);
    const [applyPast, setApplyPast] = useState(true);

    const merchant = merchantOfTransaction(tx);
    const learnable = tx.source === 'sms' && tx.type === 'expense' && merchantKey(merchant) !== null;
    const catChanged = category !== tx.category;
    const pastCount = useMemo(
        () => (learnable ? sameMerchantTxIds(transactions, { ...tx, category }).length : 0),
        [learnable, transactions, tx, category],
    );

    const cats = tx.type === 'expense'
        ? getAllExpenseCategories(settings.customCategories)
        : getAllIncomeCategories(settings.customCategories);

    const selectedCat = getCat(category, settings.customCategories, tx.type);
    const currencyOptions: { value: Currency; label: string }[] = [
        { value: 'Q', label: 'Q' },
        { value: 'USD', label: 'USD' },
        { value: 'EUR', label: 'EUR' },
        { value: '£', label: '£' },
    ];

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated: Transaction = {
                ...tx, category, currency, description,
                ...(catChanged ? { categoryEditedAt: new Date().toISOString() } : {}),
            };
            if (catChanged && learnable && (remember || applyPast)) {
                const r = await StorageService.saveTransactionWithLearning(updated, {
                    remember,
                    applyToPast: applyPast && pastCount > 0,
                });
                onReplaceAll(r.transactions);
                onClose();
            } else {
                await StorageService.updateTransaction(updated);
                onSave(updated);
                onClose();
            }
        } finally {
            setSaving(false);
        }
    };

    const handleShareSms = () => {
        if (!tx.originalSMS) return;
        Share.share({ message: tx.originalSMS }).catch(() => { });
    };

    const handleReportSms = () => {
        if (!tx.originalSMS) return;
        const c = classifyBankSms({ body: tx.originalSMS, receivedAt: Date.parse(tx.date) });
        const saved = getCat(tx.category, settings.customCategories, tx.type).label;
        const correct = getCat(category, settings.customCategories, tx.type).label;
        Share.share({
            message: `BudgetMaster - SMS mal clasificado\nBanco: ${tx.bank ?? '-'} | tipo: ${c.kind} | motivo: ${c.reason}\nCategoría guardada: ${saved} | correcta: ${correct}\n\n${maskSmsForDiagnostics(tx.originalSMS)}`,
        }).catch(() => { });
    };

    const handleDelete = async () => {
        if (await dialog.confirm(DELETE_CONFIRM)) {
            onDelete(tx.id);
            onClose();
        }
    };

    return (
        <GlassSheet title="Detalle del movimiento" onClose={onClose} maxHeightRatio={0.94}
            footer={
                <View style={m.footerRow}>
                    <GlassButton
                        kind="primary"
                        icon="save-outline"
                        label={saving ? "Guardando..." : "Guardar cambios"}
                        onPress={handleSave}
                        loading={saving}
                        style={{ flex: 1 }}
                    />
                    <TouchableOpacity
                        style={m.delBtn}
                        onPress={handleDelete}
                        activeOpacity={0.8}
                        accessibilityRole="button"
                        accessibilityLabel="Eliminar movimiento"
                    >
                        <Ionicons name="trash-outline" size={20} color={C.danger} />
                    </TouchableOpacity>
                </View>
            }
        >
            {/* HEADER CON MONTO */}
            <View style={m.header}>
                <View style={[m.catIcon, { backgroundColor: selectedCat.color + "22", borderColor: selectedCat.color + "55" }]}>
                    <Ionicons name={selectedCat.icon} size={28} color={selectedCat.color} />
                </View>
                <View style={{ flex: 1, marginLeft: 12 }}>
                    <Money
                        amount={tx.amount}
                        currency={tx.currency || 'Q'}
                        size="lg"
                        sign="never"
                        prefix={tx.type === 'income' ? '+' : '-'}
                        tone={tx.type === 'income' ? 'income' : 'expense'}
                    />
                    <Text style={m.date}>
                        {new Date(tx.date).toLocaleDateString("es-GT", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
                    </Text>
                </View>
            </View>

            {/* BANCO / FUENTE */}
            {tx.bank && (
                <View style={m.infoRow}>
                    <Ionicons name="business-outline" size={16} color={C.textSub} style={m.infoIcon} />
                    <Text style={m.infoLabel}>Banco</Text>
                    <Text style={m.infoValue}>{tx.bank}</Text>
                </View>
            )}

            {/* FUENTE */}
            <View style={m.infoRow}>
                <Ionicons
                    name={tx.source === 'sms' ? (smsOn ? "chatbubble-outline" : "business-outline") : "pencil-outline"}
                    size={16}
                    color={C.textSub}
                    style={m.infoIcon}
                />
                <Text style={m.infoLabel}>Fuente</Text>
                <Text style={m.infoValue}>
                    {tx.source === 'sms' ? (smsOn ? 'Detectado por SMS' : 'Importado del banco') : 'Ingreso manual'}
                </Text>
            </View>

            {/* CATEGORÍA EDITABLE */}
            <View style={m.section}>
                <Text style={m.sectionLabel}>CATEGORÍA</Text>
                <View style={m.catGrid}>
                    {cats.map(cat => (
                        <TouchableOpacity
                            key={cat.id}
                            style={[m.catItem, { width: cols === 4 ? "22.5%" : "30%" }, category === cat.id && m.catItemActive]}
                            onPress={() => setCategory(cat.id)}
                            accessibilityRole="button"
                            accessibilityLabel={cat.label}
                            accessibilityState={{ selected: category === cat.id }}
                        >
                            <Ionicons name={cat.icon} size={20} color={category === cat.id ? C.primaryLight : C.textSub} />
                            <Text style={[m.catLabel, category === cat.id && { color: C.textPrimary }]} numberOfLines={1}>
                                {cat.label}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                {/* APRENDIZAJE POR COMERCIO */}
                {learnable && catChanged && (
                    <View style={m.learnBox}>
                        <View style={m.switchRow}>
                            <View style={{ flex: 1 }}>
                                <Text style={m.switchLabel}>Recordar para «{merchant}»</Text>
                                <Text style={m.hint}>Las próximas compras de este comercio se clasifican solas.</Text>
                            </View>
                            <Switch
                                value={remember}
                                onValueChange={setRemember}
                                trackColor={{ false: C.bgDeep, true: C.accent }}
                                thumbColor={C.text}
                            />
                        </View>
                        {pastCount > 0 && (
                            <View style={[m.switchRow, { marginTop: 10 }]}>
                                <Text style={[m.switchLabel, { flex: 1 }]}>
                                    Aplicar también a {pastCount} {pastCount === 1 ? "movimiento anterior" : "movimientos anteriores"} de este comercio
                                </Text>
                                <Switch
                                    value={applyPast}
                                    onValueChange={setApplyPast}
                                    trackColor={{ false: C.bgDeep, true: C.accent }}
                                    thumbColor={C.text}
                                />
                            </View>
                        )}
                    </View>
                )}
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
                <GlassSegmented options={currencyOptions} value={currency} onChange={setCurrency} />
            </View>

            {/* SMS ORIGINAL */}
            {smsOn && tx.originalSMS && (
                <View style={m.section}>
                    <Text style={m.sectionLabel}>SMS ORIGINAL</Text>
                    <TouchableOpacity style={m.smsToggle} onPress={() => setShowSMS(!showSMS)}>
                        <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.accent} />
                        <Text style={m.smsToggleTxt}>Ver SMS original</Text>
                        <Ionicons name={showSMS ? "chevron-up" : "chevron-down"} size={16} color={C.accent} />
                    </TouchableOpacity>
                    {showSMS && (
                        <>
                            <View style={m.smsBox}>
                                <Text selectable style={m.smsTxt}>{tx.originalSMS}</Text>
                            </View>
                            <View style={m.smsActions}>
                                <GlassButton
                                    kind="ghost"
                                    icon="share-outline"
                                    label="Compartir SMS"
                                    onPress={handleShareSms}
                                    style={m.smsActionBtn}
                                />
                                <GlassButton
                                    kind="ghost"
                                    icon="flag-outline"
                                    label="Reportar mal clasificado"
                                    onPress={handleReportSms}
                                    style={m.smsActionBtn}
                                />
                            </View>
                            <Text style={m.hint}>Mantené presionado el texto para copiarlo.</Text>
                        </>
                    )}
                </View>
            )}

            {/* MÁS ACCIONES */}
            {tx.type === 'expense' && (
                <View style={m.section}>
                    <Text style={m.sectionLabel}>MÁS ACCIONES</Text>
                    <GlassButton
                        kind="secondary"
                        icon="card-outline"
                        label="Convertir a Visacuota"
                        onPress={onConvertToInstallment}
                    />
                </View>
            )}

            <View style={{ height: 8 }} />
        </GlassSheet>
    );
}

// ─────────────────────────────────────────────────────────────
// TARJETA DE TRANSACCIÓN
// ─────────────────────────────────────────────────────────────
interface TxCardProps {
    tx: Transaction;
    settings: UserSettings;
    smsOn: boolean;
    onDelete: (id: string) => void;
    onPress: (tx: Transaction) => void;
}

export function TxCard({ tx, settings, smsOn, onDelete, onPress }: TxCardProps) {
    const dialog = useGlassDialog();
    const cat = getCat(tx.category, settings.customCategories, tx.type);
    const isIncome = tx.type === "income";
    const txCurrency = tx.currency || 'Q';

    const handleDelete = async () => {
        if (await dialog.confirm(DELETE_CONFIRM)) onDelete(tx.id);
    };

    return (
        <TouchableOpacity onPress={() => onPress(tx)} activeOpacity={0.75}>
            <GlassCard radius={18} blur={false} style={{ marginBottom: 12 }} contentStyle={s.txRow}>
                <View style={[s.txIconGlass, { backgroundColor: cat.color + "22", borderColor: cat.color + "44", borderTopColor: cat.color + "99" }]}>
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
                        {smsOn && tx.source === "sms" && (
                            <View style={s.smsBadge}>
                                <Text style={s.smsBadgeTxt}>SMS</Text>
                            </View>
                        )}
                        {txCurrency !== 'Q' && (
                            <View style={[s.currencyBadge, { backgroundColor: C.fx + "22", borderColor: C.fx + "44" }]}>
                                <Text style={[s.currencyBadgeTxt, { color: C.fx }]}>{txCurrency}</Text>
                            </View>
                        )}
                        <Text style={[s.txCat, { color: cat.color + "cc" }]}>{cat.label}</Text>
                    </View>
                </View>

                <View style={{ alignItems: "flex-end" }}>
                    <Money
                        amount={tx.amount}
                        currency={txCurrency}
                        size="sm"
                        gradient={false}
                        sign="never"
                        align="right"
                        prefix={isIncome ? "+" : "-"}
                        tone={isIncome ? "income" : "expense"}
                        containerStyle={s.txAmount}
                    />
                    <TouchableOpacity
                        style={s.delBtn}
                        onPress={handleDelete}
                        accessibilityRole="button"
                        accessibilityLabel="Eliminar movimiento"
                    >
                        <Ionicons name="trash-outline" size={18} color={C.danger} />
                    </TouchableOpacity>
                </View>
            </GlassCard>
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
    onReplaceAll: (txs: Transaction[]) => void;
    accounts: Account[];
    onConvertToInstallment: (item: CreditInstallment, originalTxId: string) => void;
}

type TypeFilter = "all" | "expense" | "income";
type CurrencyFilter = "all" | "Q" | "USD" | "EUR";

const TYPE_OPTIONS: { value: TypeFilter; label: string }[] = [
    { value: "all", label: "Todos" },
    { value: "expense", label: "Gastos" },
    { value: "income", label: "Ingresos" },
];

export default function TransactionsScreen({ transactions, settings, onDelete, onUpdate, onReplaceAll, accounts, onConvertToInstallment }: Props) {
    const smsOn = isSmsFeatureOn(settings);
    const [filter, setFilter] = useState<TypeFilter>("all");
    const [currency, setCurrency] = useState<CurrencyFilter>("all");
    const [search, setSearch] = useState("");
    const [selected, setSelected] = useState<Transaction | null>(null);
    const [convertingTx, setConvertingTx] = useState<Transaction | null>(null);

    // Tutorial
    const headerRef = useTutorialRef('tx_header');
    const searchRef = useTutorialRef('tx_search');
    const typeFilterRef = useTutorialRef('tx_type_filter');
    const currencyFilterRef = useTutorialRef('tx_currency_filter');
    const firstRef = useTutorialRef('tx_first');
    const txScroll = useTutorialScroll('transactions');

    // Memoizar el filtrado para no recalcular en cada render
    const filtered = useMemo(() => transactions
        .filter(t => filter === "all" || t.type === filter)
        .filter(t => currency === "all" || (t.currency || 'Q') === currency)
        .filter(t => !search ||
            t.description.toLowerCase().includes(search.toLowerCase()) ||
            getCat(t.category, settings.customCategories, t.type).label.toLowerCase().includes(search.toLowerCase()) ||
            (t.bank || '').toLowerCase().includes(search.toLowerCase())
        )
        .sort((a, b) => +new Date(b.date) - +new Date(a.date)),
    [transactions, filter, currency, search, settings.customCategories]);

    const hasUSD = transactions.some(t => t.currency === 'USD');
    const hasEUR = transactions.some(t => t.currency === 'EUR');

    const currencyOptions = useMemo(() => {
        const opts: { value: CurrencyFilter; label: string }[] = [
            { value: "all", label: "Todas" },
            { value: "Q", label: "Q" },
        ];
        if (hasUSD) opts.push({ value: "USD", label: "USD" });
        if (hasEUR) opts.push({ value: "EUR", label: "EUR" });
        return opts;
    }, [hasUSD, hasEUR]);

    // Renderizador memoizado para FlatList (evita re-renders innecesarios)
    const renderItem = useCallback(({ item, index }: { item: Transaction; index: number }) => {
        const card = (
            <TxCard
                tx={item}
                settings={settings}
                smsOn={smsOn}
                onDelete={onDelete}
                onPress={setSelected}
            />
        );
        return index === 0
            ? <View ref={firstRef} collapsable={false}>{card}</View>
            : card;
    }, [settings, smsOn, onDelete, firstRef]);

    const keyExtractor = useCallback((item: Transaction) => item.id, []);

    return (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <View style={s.screen}>
                {/* LISTA — FlatList para rendimiento óptimo con 500+ registros */}
                <FlatList
                    ref={txScroll.ref}
                    onScroll={txScroll.onScroll}
                    scrollEventThrottle={txScroll.scrollEventThrottle}
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
                            <ScreenHeader
                                title="Movimientos"
                                subtitle={`${filtered.length} registros`}
                                right={<HelpButton tutorialId="tutorial_movimientos" />}
                                headerRef={headerRef}
                            />

                            {/* BÚSQUEDA */}
                            <View ref={searchRef} collapsable={false} style={s.searchBox}>
                                <GlassBackground radius={12} blur={false} />
                                <Ionicons name="search" size={18} color={C.textSub} style={{ marginRight: 8 }} />
                                <TextInput
                                    style={s.searchInput}
                                    value={search}
                                    onChangeText={setSearch}
                                    placeholder="Buscar por descripción, banco, categoría..."
                                    placeholderTextColor={C.textMuted}
                                />
                                {search.length > 0 && (
                                    <TouchableOpacity
                                        onPress={() => setSearch("")}
                                        accessibilityRole="button"
                                        accessibilityLabel="Borrar búsqueda"
                                    >
                                        <Ionicons name="close-circle" size={18} color={C.textSub} />
                                    </TouchableOpacity>
                                )}
                            </View>

                            {/* FILTRO TIPO */}
                            <GlassSegmented
                                options={TYPE_OPTIONS}
                                value={filter}
                                onChange={setFilter}
                                containerRef={typeFilterRef}
                                style={s.filterRow}
                            />

                            {/* FILTRO MONEDA (solo si hay múltiples) */}
                            {(hasUSD || hasEUR) && (
                                <GlassSegmented
                                    options={currencyOptions}
                                    value={currency}
                                    onChange={setCurrency}
                                    containerRef={currencyFilterRef}
                                    style={s.filterRow}
                                />
                            )}
                        </View>
                    }
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
                    smsOn={smsOn}
                    transactions={transactions}
                    onClose={() => setSelected(null)}
                    onSave={(updated) => { onUpdate(updated); setSelected(null); }}
                    onDelete={(id) => { onDelete(id); setSelected(null); }}
                    onReplaceAll={(txs) => { onReplaceAll(txs); setSelected(null); }}
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
    screen: { flex: 1, paddingHorizontal: 16 },
    searchBox: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 12, overflow: "hidden" },
    searchInput: { flex: 1, color: C.text, fontSize: 14 },
    filterRow: { marginBottom: 12 },
    empty: { alignItems: "center", marginTop: 60, gap: 12 },
    emptyTxt: { color: C.textSub, fontSize: 14 },
    txRow: { flexDirection: "row", alignItems: "center", padding: 14 },
    txIconGlass: { width: 48, height: 48, borderRadius: 14, borderWidth: 1.5, alignItems: "center", justifyContent: "center", marginRight: 14 },
    txDesc: { color: C.text, fontSize: 16, fontWeight: "800", letterSpacing: 0.2 },
    txMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" },
    txDate: { color: C.textSub, fontSize: 11 },
    txCat: { color: C.textSub, fontSize: 11 },
    txAmount: { marginBottom: 6 },
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
    header: { flexDirection: "row", alignItems: "center", marginBottom: 12 },
    catIcon: { width: 56, height: 56, borderRadius: 16, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
    date: { color: C.textSub, fontSize: 12, marginTop: 2, textTransform: "capitalize" },
    infoRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.separator },
    infoIcon: { marginRight: 10 },
    infoLabel: { color: C.textSub, fontSize: 13, flex: 1 },
    infoValue: { color: C.text, fontSize: 13, fontWeight: "700", flexShrink: 1, textAlign: "right" },
    section: { marginTop: 18 },
    sectionLabel: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
    input: { backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, padding: 12, color: C.text, fontSize: 14 },
    catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    catItem: { flexGrow: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    catItemActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    catLabel: { color: C.textSub, fontSize: 10, marginTop: 4, fontWeight: "600", textAlign: "center" },
    smsToggle: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, backgroundColor: C.accent + "11", borderRadius: 10, borderWidth: 1, borderColor: C.accent + "33" },
    smsToggleTxt: { color: C.accentLight, fontSize: 13, fontWeight: "700", flex: 1 },
    smsBox: { marginTop: 8, padding: 12, backgroundColor: C.glassInput, borderRadius: 10, borderWidth: 1, borderColor: C.glassInputBorder },
    smsTxt: { color: C.textSub, fontSize: 12, lineHeight: 18 },
    smsActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
    smsActionBtn: { flexGrow: 1, flexShrink: 1 },
    hint: { color: C.textMuted, fontSize: 11, marginTop: 4, lineHeight: 15 },
    learnBox: { marginTop: 12, padding: 12, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    switchRow: { flexDirection: "row", alignItems: "center", gap: 12 },
    switchLabel: { color: C.text, fontSize: 13, fontWeight: "700" },
    footerRow: { flexDirection: "row", gap: 10, paddingTop: 12, alignItems: "center" },
    delBtn: { width: 50, height: 50, borderRadius: 14, backgroundColor: C.danger + "11", borderWidth: 1, borderColor: C.danger + "66", alignItems: "center", justifyContent: "center" },
});
