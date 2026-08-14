import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
    ScrollView, StyleSheet, Text, TouchableOpacity, View
} from "react-native";
import { Account, StorageService, UserSettings } from "../services/storage";
import { C, shadow } from "../theme";
import { AccountModal } from "./AccountsScreen";

// ─────────────────────────────────────────────────────────────
// ONBOARDING DE TARJETAS DE CRÉDITO (post-onboarding principal)
// ─────────────────────────────────────────────────────────────
interface Props {
    settings: UserSettings;
    onComplete: () => void;
}

export default function CardsOnboardingScreen({ settings, onComplete }: Props) {
    const [cards, setCards] = useState<Account[]>([]);
    const [showAccModal, setShowAccModal] = useState(false);

    const handleSaveCard = async (account: Account) => {
        await StorageService.addAccount(account);
        setCards(prev => [...prev, account]);
    };

    return (
        <View style={s.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
                <View style={s.header}>
                    <View style={s.iconWrap}>
                        <Ionicons name="card-outline" size={32} color={C.primaryLight} />
                    </View>
                    <Text style={s.title}>¿Usás tarjetas de crédito?</Text>
                    <Text style={s.subtitle}>
                        Registrá tus tarjetas para llevar el control de sus visacuotas y fechas de corte y pago.{"\n\n"}
                        Esto es completamente opcional — podés agregarlas ahora o más tarde desde la sección de Cuentas.
                    </Text>
                </View>

                {cards.length > 0 && (
                    <View style={s.list}>
                        <Text style={s.listLbl}>TARJETAS AGREGADAS</Text>
                        {cards.map(card => (
                            <View key={card.id} style={[s.cardRow, { borderLeftColor: card.color }]}>
                                <View style={[s.cardIcon, { backgroundColor: card.color + "22" }]}>
                                    <Ionicons name="card-outline" size={20} color={card.color} />
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={s.cardName}>{card.name}</Text>
                                    {card.bankName && <Text style={s.cardBank}>{card.bankName}</Text>}
                                </View>
                                <Ionicons name="checkmark-circle" size={20} color={C.income} />
                            </View>
                        ))}
                    </View>
                )}

                <TouchableOpacity style={s.addBtn} onPress={() => setShowAccModal(true)}>
                    <Ionicons name="add-circle-outline" size={20} color={C.primaryLight} />
                    <Text style={s.addBtnTxt}>+ Agregar tarjeta</Text>
                </TouchableOpacity>
            </ScrollView>

            <View style={s.footer}>
                <TouchableOpacity style={s.skipBtn} onPress={onComplete}>
                    <Text style={s.skipTxt}>Omitir</Text>
                </TouchableOpacity>
                <TouchableOpacity style={s.continueBtn} onPress={onComplete}>
                    <Text style={s.continueTxt}>Continuar</Text>
                    <Ionicons name="arrow-forward" size={20} color="#1A0E00" style={{ marginLeft: 8 }} />
                </TouchableOpacity>
            </View>

            {showAccModal && (
                <AccountModal
                    defaultType="credit"
                    onSave={handleSaveCard}
                    onClose={() => setShowAccModal(false)}
                />
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24, paddingTop: 52, paddingBottom: 16 },
    header: { alignItems: "center", marginBottom: 24, marginTop: 20 },
    iconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.primary + "22", alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder },
    title: { color: C.textPrimary, fontSize: 22, fontWeight: "900", marginBottom: 10, textAlign: "center" },
    subtitle: { color: C.textSub, fontSize: 14, lineHeight: 22, textAlign: "center" },

    list: { marginBottom: 16 },
    listLbl: { color: C.textMuted, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
    cardRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.card, borderRadius: 14, borderWidth: 1, borderColor: C.cardBorder, borderLeftWidth: 4, padding: 12, marginBottom: 8, gap: 10 },
    cardIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    cardName: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
    cardBank: { color: C.textMuted, fontSize: 11, marginTop: 2 },

    addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, padding: 16, borderRadius: 14, borderWidth: 1, borderColor: C.primary + "44", backgroundColor: C.primaryDark + "22" },
    addBtnTxt: { color: C.primaryLight, fontSize: 15, fontWeight: "700" },

    footer: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12 },
    skipBtn: { flex: 1, paddingVertical: 18, alignItems: "center", justifyContent: "center", borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.card },
    skipTxt: { color: C.textMuted, fontSize: 15, fontWeight: "700" },
    continueBtn: { flex: 2, flexDirection: "row", backgroundColor: C.primary, borderRadius: 16, paddingVertical: 18, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.primaryLight, ...shadow(C.primaryGlow, 12, 0.5) },
    continueTxt: { color: "#1A0E00", fontSize: 16, fontWeight: "900", letterSpacing: 0.5 },
});
