import React, { useCallback, useEffect, useState } from "react";
import { Share, StyleSheet, Text, TextInput, TouchableOpacity, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { getAllExpenseCategories, getAllIncomeCategories } from "../categories";
import { StorageService, parseAmount } from "../services/storage";
import type { SmsInboxItem, Transaction, UserSettings } from "../services/storage";
import { buildSmsTransactionId, maskSmsForDiagnostics } from "../services/BankSmsParser";
import { GlassSheet } from "./GlassSheet";
import { GlassCard } from "./GlassCard";
import { GlassButton, GlassButtonGroup } from "./GlassButton";
import { GlassSegmented } from "./GlassSegmented";
import { InlineNotice } from "./InlineNotice";
import Money from "./Money";
import { useGlassDialog } from "./GlassDialogProvider";

export interface SmsInboxModalProps {
    visible: boolean;
    settings: UserSettings;
    onClose: () => void;
    onChanged: () => void;
}

type EntryType = "expense" | "income";

const TYPE_OPTIONS: { value: EntryType; label: string }[] = [
    { value: "expense", label: "Gasto" },
    { value: "income", label: "Ingreso" },
];

function formatShortDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-GT", { day: "2-digit", month: "short" });
}

function formatLongDate(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString("es-GT", { day: "2-digit", month: "long", year: "numeric" });
}

export function SmsInboxModal({ visible, settings, onClose, onChanged }: SmsInboxModalProps) {
    const dialog = useGlassDialog();
    const { width } = useWindowDimensions();
    const cols = width >= 360 ? 4 : 3;

    const [items, setItems] = useState<SmsInboxItem[]>([]);
    const [loading, setLoading] = useState(true);
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [registering, setRegistering] = useState<SmsInboxItem | null>(null);

    // Formulario de "Registrar"
    const [type, setType] = useState<EntryType>("expense");
    const [amountText, setAmountText] = useState("");
    const [description, setDescription] = useState("");
    const [category, setCategory] = useState("other");
    const [error, setError] = useState("");
    const [saving, setSaving] = useState(false);

    const reload = useCallback(async () => {
        const next = await StorageService.getSmsInbox();
        setItems(next);
        setLoading(false);
        return next;
    }, []);

    useEffect(() => {
        if (!visible) return;
        setRegistering(null);
        setExpanded(new Set());
        setLoading(true);
        void reload();
    }, [visible, reload]);

    if (!visible) return null;

    const toggleExpanded = (fp: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(fp)) next.delete(fp); else next.add(fp);
            return next;
        });
    };

    const handleIgnore = async (item: SmsInboxItem) => {
        await StorageService.ignoreSmsInboxItem(item.fingerprint);
        await reload();
        onChanged();
    };

    const handleShareOne = async (item: SmsInboxItem) => {
        try {
            await Share.share({ message: maskSmsForDiagnostics(item.body) });
        } catch (e) {
            console.warn("Share inbox item error:", e instanceof Error ? e.message : "desconocido");
        }
    };

    const handleSendSamples = async () => {
        if (items.length === 0) return;
        const ok = await dialog.confirm({
            title: "Enviar ejemplos",
            message: `Se armará un texto con estos ${items.length} mensajes con números de cuenta y tarjeta, tu nombre y enlaces personales ocultos. Los montos y comercios se mantienen porque son lo que necesitamos para enseñarle a la app. Vos elegís con quién compartirlo.`,
            confirmLabel: "Continuar",
            cancelLabel: "Cancelar",
            variant: "info",
            icon: "paper-plane-outline",
        });
        if (!ok) return;
        const lines = items.map(i =>
            `${i.bank} | ${i.reason} | ${maskSmsForDiagnostics(i.body).replace(/\s+/g, " ").trim()}`
        );
        try {
            await Share.share({
                message: `BudgetMaster - SMS sin clasificar (${lines.length})\nformato: banco | motivo | texto\n\n${lines.join("\n")}`,
            });
        } catch (e) {
            console.warn("Share inbox samples error:", e instanceof Error ? e.message : "desconocido");
        }
    };

    const startRegister = (item: SmsInboxItem) => {
        setType(item.suggestedType ?? "expense");
        setAmountText(item.amount !== null ? String(item.amount) : "");
        setDescription(`${item.bank} · ${item.merchant ?? "Movimiento"}`);
        setCategory("other");
        setError("");
        setSaving(false);
        setRegistering(item);
    };

    const handleTypeChange = (next: EntryType) => {
        setType(next);
        // La categoría elegida puede no existir en el otro tipo: se vuelve a "other".
        const list = next === "expense"
            ? getAllExpenseCategories(settings.customCategories)
            : getAllIncomeCategories(settings.customCategories);
        if (!list.some(c => c.id === category)) setCategory("other");
    };

    const handleSave = async () => {
        if (!registering || saving) return;
        const amount = parseAmount(amountText);
        if (!isFinite(amount) || amount <= 0) {
            setError("Ingresá un monto válido mayor a 0.");
            return;
        }
        if (!description.trim()) {
            setError("Escribí una descripción para el movimiento.");
            return;
        }
        setError("");
        setSaving(true);
        try {
            const fp = registering.fingerprint;
            const tx: Transaction = {
                id: buildSmsTransactionId(fp),
                amount,
                category,
                date: registering.occurredAt,
                description: description.trim(),
                type,
                source: "sms",
                currency: registering.currency,
                originalSMS: registering.body,
                bank: registering.bank,
                smsFingerprint: fp,
                categoryEditedAt: new Date().toISOString(),
                merchant: registering.merchant ?? undefined,
            };
            await StorageService.registerSmsInboxItem(fp, tx);
            setRegistering(null);
            await reload();
            onChanged();
        } catch (e) {
            setError("No se pudo guardar el movimiento. Intentá de nuevo.");
            console.warn("Register inbox item error:", e instanceof Error ? e.message : "desconocido");
        } finally {
            setSaving(false);
        }
    };

    // ── Sub-vista: Registrar ──────────────────────────────────
    if (registering) {
        const cats = type === "expense"
            ? getAllExpenseCategories(settings.customCategories)
            : getAllIncomeCategories(settings.customCategories);
        return (
            <GlassSheet
                title="Registrar movimiento"
                icon="add-circle-outline"
                maxHeightRatio={0.92}
                onClose={() => setRegistering(null)}
                footer={
                    <GlassButtonGroup gap={10} style={s.footerRow}>
                        <GlassButton
                            label="Volver"
                            kind="ghost"
                            icon="arrow-back-outline"
                            onPress={() => setRegistering(null)}
                            disabled={saving}
                        />
                        <GlassButton
                            label="Guardar movimiento"
                            kind="primary"
                            icon="checkmark-outline"
                            onPress={handleSave}
                            loading={saving}
                        />
                    </GlassButtonGroup>
                }
            >
                {!!error && <InlineNotice variant="error" text={error} style={{ marginBottom: 12 }} />}

                <GlassSegmented options={TYPE_OPTIONS} value={type} onChange={handleTypeChange} />

                <View style={s.section}>
                    <Text style={s.sectionLabel}>MONTO ({registering.currency})</Text>
                    <TextInput
                        style={s.input}
                        value={amountText}
                        onChangeText={setAmountText}
                        keyboardType="decimal-pad"
                        placeholder="0.00"
                        placeholderTextColor={C.textMuted}
                    />
                </View>

                <View style={s.section}>
                    <Text style={s.sectionLabel}>DESCRIPCIÓN</Text>
                    <TextInput
                        style={s.input}
                        value={description}
                        onChangeText={setDescription}
                        placeholder="Descripción del movimiento..."
                        placeholderTextColor={C.textMuted}
                        multiline
                    />
                </View>

                <View style={s.section}>
                    <Text style={s.sectionLabel}>CATEGORÍA</Text>
                    <View style={s.catGrid}>
                        {cats.map(cat => {
                            const active = category === cat.id;
                            return (
                                <TouchableOpacity
                                    key={cat.id}
                                    style={[s.catItem, { width: cols === 4 ? "22.5%" : "30%" }, active && s.catItemActive]}
                                    onPress={() => setCategory(cat.id)}
                                    accessibilityRole="button"
                                    accessibilityLabel={cat.label}
                                    accessibilityState={{ selected: active }}
                                >
                                    <Ionicons name={cat.icon} size={20} color={active ? C.primaryLight : C.textSub} />
                                    <Text style={[s.catLabel, active && { color: C.textPrimary }]} numberOfLines={1}>
                                        {cat.label}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </View>

                <View style={s.section}>
                    <Text style={s.sectionLabel}>FECHA</Text>
                    <View style={s.readonlyBox}>
                        <Ionicons name="calendar-outline" size={16} color={C.textSub} />
                        <Text style={s.readonlyTxt}>{formatLongDate(registering.occurredAt)}</Text>
                    </View>
                </View>

                <View style={s.section}>
                    <Text style={s.sectionLabel}>SMS ORIGINAL</Text>
                    <View style={s.smsBox}>
                        <Text selectable style={s.smsTxt}>{registering.body}</Text>
                    </View>
                </View>
                <View style={{ height: 8 }} />
            </GlassSheet>
        );
    }

    // ── Lista del buzón ───────────────────────────────────────
    return (
        <GlassSheet
            title="Mensajes sin clasificar"
            icon="file-tray-outline"
            maxHeightRatio={0.92}
            onClose={onClose}
            footer={
                items.length > 0 ? (
                    <View style={s.footerStack}>
                        <GlassButton
                            label="Enviar ejemplos para mejorar la lectura"
                            kind="secondary"
                            icon="paper-plane-outline"
                            onPress={handleSendSamples}
                        />
                    </View>
                ) : undefined
            }
        >
            <InlineNotice
                variant="info"
                text="Parecen mensajes de tu banco, pero la app no supo qué movimiento son. El texto completo solo se guarda en tu teléfono."
                style={{ marginBottom: 14 }}
            />

            {!loading && items.length === 0 && (
                <View style={s.empty}>
                    <Ionicons name="checkmark-done-outline" size={40} color={C.accent} />
                    <Text style={s.emptyTxt}>Todo clasificado. Nada pendiente.</Text>
                </View>
            )}

            {items.map(item => {
                const isOpen = expanded.has(item.fingerprint);
                const dateIso = item.receivedAt !== undefined
                    ? new Date(item.receivedAt).toISOString()
                    : item.occurredAt;
                return (
                    <GlassCard key={item.fingerprint} radius={14} blur={false} style={s.card} contentStyle={s.cardContent}>
                        <View style={s.metaRow}>
                            <View style={s.bankChip}>
                                <Text style={s.bankChipTxt} numberOfLines={1}>{item.bank}</Text>
                            </View>
                            <Text style={s.dateTxt}>{formatShortDate(dateIso)}</Text>
                            {item.amount !== null && (
                                <Money
                                    amount={item.amount}
                                    currency={item.currency}
                                    size="sm"
                                    tone="neutral"
                                    gradient={false}
                                    align="right"
                                    containerStyle={{ flexShrink: 1, flexGrow: 1 }}
                                />
                            )}
                        </View>

                        <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => toggleExpanded(item.fingerprint)}
                            accessibilityRole="button"
                            accessibilityLabel={isOpen ? "Contraer mensaje" : "Expandir mensaje"}
                        >
                            <Text selectable numberOfLines={isOpen ? undefined : 4} style={s.bodyTxt}>
                                {item.body}
                            </Text>
                        </TouchableOpacity>

                        <GlassButtonGroup breakpoint={420}>
                            <GlassButton
                                label="Registrar"
                                kind="secondary"
                                icon="add-circle-outline"
                                onPress={() => startRegister(item)}
                            />
                            <GlassButton
                                label="Ignorar"
                                kind="ghost"
                                icon="eye-off-outline"
                                onPress={() => { void handleIgnore(item); }}
                            />
                            <GlassButton
                                label="Compartir"
                                kind="ghost"
                                icon="share-outline"
                                onPress={() => { void handleShareOne(item); }}
                            />
                        </GlassButtonGroup>
                    </GlassCard>
                );
            })}
            <View style={{ height: 8 }} />
        </GlassSheet>
    );
}

const s = StyleSheet.create({
    card: { marginBottom: 10 },
    cardContent: { padding: 12, gap: 10 },
    metaRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    bankChip: {
        flexShrink: 1, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 10,
        backgroundColor: C.glassActive, borderWidth: 1, borderColor: C.glassActiveBorder,
    },
    bankChipTxt: { color: C.primaryLight, fontSize: 11, fontWeight: "800" },
    dateTxt: { color: C.textSub, fontSize: 12, fontWeight: "600" },
    bodyTxt: { color: C.text, fontSize: 13, lineHeight: 19 },
    empty: { alignItems: "center", gap: 10, paddingVertical: 36 },
    emptyTxt: { color: C.textSub, fontSize: 14, fontWeight: "600", textAlign: "center" },
    footerStack: { paddingTop: 12 },
    footerRow: { paddingTop: 12 },
    section: { marginTop: 18 },
    sectionLabel: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10 },
    input: {
        backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder,
        padding: 12, color: C.text, fontSize: 14,
    },
    catGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    catItem: {
        flexGrow: 1, alignItems: "center", paddingVertical: 10, borderRadius: 12, borderWidth: 1,
        borderColor: C.glassInputBorder, backgroundColor: C.glassInput,
    },
    catItemActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    catLabel: { color: C.textSub, fontSize: 10, marginTop: 4, fontWeight: "600", textAlign: "center" },
    readonlyBox: {
        flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 12,
        borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput,
    },
    readonlyTxt: { color: C.textSub, fontSize: 14, flexShrink: 1 },
    smsBox: {
        padding: 12, backgroundColor: C.glassInput, borderRadius: 10, borderWidth: 1, borderColor: C.glassInputBorder,
    },
    smsTxt: { color: C.textSub, fontSize: 12, lineHeight: 18 },
});

export default SmsInboxModal;
