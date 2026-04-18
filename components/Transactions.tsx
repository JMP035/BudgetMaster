import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Transaction, UserSettings } from "../services/storage";
import { getCat } from "../categories";
import { C, shadow } from "../theme";

export function TxCard({ tx, currency, onDelete }: { tx: Transaction; currency: string; onDelete: (id: string) => void }) {
    const cat = getCat(tx.category);
    const isIncome = tx.type === "income";

    return (
        <View style={s.txCard}>
            <View style={[
                s.txIconGlass,
                {
                    backgroundColor: cat.color + "22",
                    borderColor: cat.color + "44",
                    borderTopColor: cat.color + "99",
                    shadowColor: cat.color
                }
            ]}>
                <Ionicons name={cat.icon} size={22} color={cat.color} style={{ opacity: 0.9 }} />
            </View>
            <View style={{ flex: 1 }}>
                <Text style={s.txDesc} numberOfLines={1}>{tx.description || cat.label}</Text>
                <View style={s.txMeta}>
                    <Text style={s.txDate}>{new Date(tx.date).toLocaleDateString("es-GT", { day: "2-digit", month: "short", year: "numeric" })}</Text>
                    {tx.bank && (
                        <View style={{ backgroundColor: C.primary + "33", paddingHorizontal: 6, borderRadius: 4, borderWidth: 1, borderColor: C.primary + "55" }}>
                            <Text style={{ color: C.primaryLight, fontSize: 8, fontWeight: "900" }}>{tx.bank.toUpperCase()}</Text>
                        </View>
                    )}
                    {tx.source === "sms" && <View style={s.smsBadge}><Text style={s.smsTxt}>SMS</Text></View>}
                    <Text style={[s.txCat, { color: cat.color + "cc" }]}>{cat.label}</Text>
                </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.txAmount, { color: isIncome ? C.income : C.expense }]}>
                    {isIncome ? "+" : "-"}{currency} {tx.amount.toFixed(2)}
                </Text>
                <TouchableOpacity
                    style={s.delBtn}
                    onPress={() => {
                        if (Platform.OS === 'web') {
                            if (window.confirm("¿Borrar este registro permanentemente?")) onDelete(tx.id);
                        } else {
                            Alert.alert("Eliminar", "¿Borrar este registro permanente?", [
                                { text: "Cancelar", style: "cancel" },
                                { text: "Eliminar", style: "destructive", onPress: () => onDelete(tx.id) },
                            ]);
                        }
                    }}
                >
                    <Ionicons name="trash-outline" size={18} color={C.danger} />
                </TouchableOpacity>
            </View>
        </View>
    );
}

interface Props { transactions: Transaction[]; settings: UserSettings; onDelete: (id: string) => void; }

export default function TransactionsScreen({ transactions, settings, onDelete }: Props) {
    const [filter, setFilter] = useState<"all" | "expense" | "income">("all");
    const [search, setSearch] = useState("");

    const filtered = transactions
        .filter(t => filter === "all" || t.type === filter)
        .filter(t => !search || t.description.toLowerCase().includes(search.toLowerCase()) || getCat(t.category).label.toLowerCase().includes(search.toLowerCase()))
        .sort((a, b) => +new Date(b.date) - +new Date(a.date));

    return (
        <KeyboardAvoidingView 
            behavior={Platform.OS === "ios" ? "padding" : "height"} 
            style={{ flex: 1 }}
        >
            <View style={s.screen}>
            <View style={s.header}>
                <Text style={s.title}>Movimientos</Text>
                <Text style={s.sub}>{filtered.length} registros</Text>
            </View>

            <View style={s.searchBox}>
                <Ionicons name="search" size={18} color={C.textMuted} style={{ marginRight: 8 }} />
                <TextInput style={s.searchInput} value={search} onChangeText={setSearch} placeholder="Buscar gastos, ingresos..." placeholderTextColor={C.textMuted} />
                {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch("")}><Ionicons name="close-circle" size={18} color={C.textMuted} /></TouchableOpacity>
                )}
            </View>

            <View style={s.filterRow}>
                {(["all", "expense", "income"] as const).map(f => (
                    <TouchableOpacity key={f} style={[s.filterTab, filter === f && s.filterTabActive]} onPress={() => setFilter(f)}>
                        <Text style={[s.filterTxt, filter === f && s.filterTxtActive]}>
                            {f === "all" ? "Todos" : f === "expense" ? "Gastos" : "Ingresos"}
                        </Text>
                    </TouchableOpacity>
                ))}
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
                {filtered.length === 0 ? (
                    <View style={s.empty}>
                        <Ionicons name="search-outline" size={48} color={C.textMuted} />
                        <Text style={s.emptyTxt}>No hay resultados</Text>
                    </View>
                ) : (
                    filtered.map(tx => <TxCard key={tx.id} tx={tx} currency={settings.currency} onDelete={onDelete} />)
                )}
                <View style={{ height: 120 }} />
            </ScrollView>
        </View>
    </KeyboardAvoidingView>
    );
}

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
    txMeta: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 },
    txDate: { color: C.textMuted, fontSize: 11 },
    txCat: { color: C.textMuted, fontSize: 11 },
    txAmount: { fontSize: 16, fontWeight: "800", marginBottom: 6 },
    delBtn: { backgroundColor: C.danger + "22", padding: 6, borderRadius: 8, borderWidth: 1, borderColor: C.danger + "44" },
    smsBadge: { backgroundColor: C.accent + "22", borderRadius: 4, paddingHorizontal: 4, paddingVertical: 2, borderWidth: 1, borderColor: C.accent + "55" },
    smsTxt: { color: C.accent, fontSize: 9, fontWeight: "800" },
});
