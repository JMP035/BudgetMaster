import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Account, StorageService, UserSettings } from "../services/storage";
import { C } from "../theme";
import { AccountModal } from "./AccountsScreen";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { useGlassDialog } from "./GlassDialogProvider";

// ─────────────────────────────────────────────────────────────
// ONBOARDING DE TARJETAS DE CRÉDITO (post-onboarding principal)
// ─────────────────────────────────────────────────────────────
interface Props {
    settings: UserSettings;
    onComplete: () => void;
}

export default function CardsOnboardingScreen({ settings, onComplete }: Props) {
    const insets = useSafeAreaInsets();
    const dialog = useGlassDialog();
    const [cards, setCards] = useState<Account[]>([]);
    const [showAccModal, setShowAccModal] = useState(false);

    const handleSaveCard = async (account: Account) => {
        try {
            await StorageService.addAccount(account);
            setCards(prev => [...prev, account]);
        } catch (e) {
            console.warn("[CardsOnboarding] No se pudo guardar la tarjeta:", e);
            void dialog.alert({ variant: "error", title: "No se pudo guardar", message: "No se pudo guardar la tarjeta. Intenta de nuevo." });
        }
    };

    return (
        <View style={[s.container, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
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
                            <GlassCard
                                key={card.id}
                                radius={14}
                                blur={false}
                                leftAccentColor={card.color}
                                style={s.cardRow}
                                contentStyle={s.cardRowContent}
                            >
                                <View style={[s.cardIcon, { backgroundColor: card.color + "22" }]}>
                                    <Ionicons name="card-outline" size={20} color={card.color} />
                                </View>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={s.cardName} numberOfLines={1}>{card.name}</Text>
                                    {card.bankName && <Text style={s.cardBank} numberOfLines={1}>{card.bankName}</Text>}
                                </View>
                                <Ionicons name="checkmark-circle" size={20} color={C.income} />
                            </GlassCard>
                        ))}
                    </View>
                )}

                <GlassButton
                    kind="secondary"
                    icon="add-circle-outline"
                    label="Agregar tarjeta"
                    onPress={() => setShowAccModal(true)}
                />
            </ScrollView>

            <View style={s.footer}>
                <GlassButton kind="secondary" label="Omitir" onPress={onComplete} style={s.skipBtn} />
                <GlassButton label="Continuar" icon="arrow-forward" onPress={onComplete} style={s.continueBtn} />
            </View>

            {showAccModal && (
                <AccountModal
                    defaultType="credit"
                    defaultCurrency={settings.currency}
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
    container: { flex: 1, backgroundColor: C.bg, paddingHorizontal: 24 },
    header: { alignItems: "center", marginBottom: 24, marginTop: 20 },
    iconWrap: { width: 64, height: 64, borderRadius: 20, backgroundColor: C.primary + "22", alignItems: "center", justifyContent: "center", marginBottom: 16, borderWidth: 1, borderColor: C.glassBorder },
    title: { color: C.textPrimary, fontSize: 22, fontWeight: "900", marginBottom: 10, textAlign: "center" },
    subtitle: { color: C.textSub, fontSize: 14, lineHeight: 22, textAlign: "center" },

    list: { marginBottom: 16 },
    listLbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8 },
    cardRow: { marginBottom: 8 },
    cardRowContent: { flexDirection: "row", alignItems: "center", padding: 12, paddingLeft: 15, gap: 10 },
    cardIcon: { width: 38, height: 38, borderRadius: 10, alignItems: "center", justifyContent: "center" },
    cardName: { color: C.textPrimary, fontSize: 14, fontWeight: "800" },
    cardBank: { color: C.textSub, fontSize: 11, marginTop: 2 },

    footer: { flexDirection: "row", alignItems: "center", gap: 12, paddingTop: 12 },
    skipBtn: { flex: 1 },
    continueBtn: { flex: 2 },
});
