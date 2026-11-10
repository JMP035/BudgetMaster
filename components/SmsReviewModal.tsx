import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { C } from "../theme";
import { getCat } from "../categories";
import { CustomCategory, StorageService, Transaction } from "../services/storage";
import type { SmsReviewItem } from "../services/SmsService";
import { GlassBackground, GlassCard } from "./GlassCard";
import { GlassDialog } from "./GlassDialog";
import Money from "./Money";

interface Props {
    visible: boolean;
    items: SmsReviewItem[];
    onClose: () => void;
    onApplied: () => void;
    /** Categorías personalizadas, para mostrar sus nombres reales en "categoría X → Y". */
    customCategories?: CustomCategory[];
}

const TYPE_LABEL: Record<Transaction["type"], string> = {
    income: "Ingreso",
    expense: "Gasto",
    transfer: "Neutro (pago o transferencia)",
};

const fmtDay = (iso: string) => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "fecha desconocida";
    return d.toLocaleDateString("es-GT", { day: "2-digit", month: "short" }).replace(".", "");
};

const shortText = (t: string, max = 40) => (t.length > max ? t.slice(0, max - 1) + "…" : t);

/** "tipo Ingreso → Neutro · fecha 05 oct → 04 oct · categoría Salario → Otro" */
function describeFix(item: SmsReviewItem, customCategories: CustomCategory[] = []): string {
    const p = item.proposed;
    if (!p) return "";
    const o = item.original;
    const parts: string[] = [];
    if (p.type && p.type !== o.type) parts.push(`tipo ${TYPE_LABEL[o.type]} → ${TYPE_LABEL[p.type]}`);
    if (p.date) parts.push(`fecha ${fmtDay(o.date)} → ${fmtDay(p.date)}`);
    if (p.category && p.category !== o.category) {
        const from = getCat(o.category, customCategories, o.type).label;
        const to = getCat(p.category, customCategories, p.type ?? o.type).label;
        parts.push(`categoría ${from} → ${to}`);
    }
    if (p.description && p.description !== o.description) {
        parts.push(`descripción «${shortText(o.description || "sin descripción")}» → «${shortText(p.description)}»`);
    }
    return parts.join(" · ");
}

export default function SmsReviewModal({ visible, items, onClose, onApplied, customCategories }: Props) {
    const { width, height, fontScale } = useWindowDimensions();
    const insets = useSafeAreaInsets();

    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [expanded, setExpanded] = useState<Set<string>>(new Set());
    const [dlg, setDlg] = useState<"confirm" | "error" | null>(null);
    const [busy, setBusy] = useState(false);

    // Cada vez que se abre con una lista nueva, todo viene seleccionado.
    useEffect(() => {
        if (visible) {
            setSelected(new Set(items.map(i => i.txId)));
            setExpanded(new Set());
            setDlg(null);
            setBusy(false);
        }
    }, [visible, items]);

    const toggle = useCallback((id: string) => {
        setSelected(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const toggleExpanded = useCallback((id: string) => {
        setExpanded(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id); else next.add(id);
            return next;
        });
    }, []);

    const counts = useMemo(() => {
        let remove = 0;
        let fixCategory = 0;
        let fixOther = 0;
        for (const it of items) {
            if (!selected.has(it.txId)) continue;
            if (it.action === "remove") { remove++; continue; }
            const p = it.proposed;
            const onlyCategory = !p || (!(p.type && p.type !== it.original.type) && !p.date);
            if (onlyCategory) fixCategory++; else fixOther++;
        }
        return { remove, fixCategory, fixOther, total: remove + fixCategory + fixOther };
    }, [items, selected]);

    const allSelected = selected.size === items.length && items.length > 0;

    const apply = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const removeIds: string[] = [];
            const updates: Transaction[] = [];
            const keepIds: string[] = [];
            for (const it of items) {
                if (!selected.has(it.txId)) { keepIds.push(it.txId); continue; }
                if (it.action === "remove") removeIds.push(it.txId);
                else updates.push({ ...it.original, ...it.proposed });
            }
            await StorageService.applySmsReview(removeIds, updates, keepIds);
            setDlg(null);
            setBusy(false);
            onApplied();
        } catch (e) {
            console.warn("applySmsReview error:", e);
            setBusy(false);
            setDlg("error");
        }
    };

    const confirmMessage = (() => {
        const { remove: rm, fixCategory: fc, fixOther: fo } = counts;
        const mov = (n: number) => `${n} movimiento${n === 1 ? "" : "s"}`;
        const clauses: string[] = [];
        if (rm > 0) clauses.push(`se eliminarán ${mov(rm)}`);
        if (fc > 0) clauses.push(`se corregirá la categoría de ${mov(fc)}`);
        if (fo > 0) clauses.push(`se corregirán ${mov(fo)}`);
        const joined = clauses.length > 1
            ? `${clauses.slice(0, -1).join(", ")} y ${clauses[clauses.length - 1]}`
            : clauses[0] ?? "";
        const sentence = joined.charAt(0).toUpperCase() + joined.slice(1) + ".";
        return rm > 0 ? `${sentence} Los eliminados no volverán a importarse. ¿Continuar?` : `${sentence} ¿Continuar?`;
    })();

    const stacked = width < 400 || fontScale > 1.2;

    const cardMaxH = Math.min(height - insets.top - insets.bottom - 32, 720);

    const renderItem = useCallback(({ item }: { item: SmsReviewItem }) => {
        const o = item.original;
        const isSel = selected.has(item.txId);
        const isOpen = expanded.has(item.txId);
        const isRemove = item.action === "remove";
        const tone = isRemove ? C.warning : C.primaryLight;
        const fixLine = isRemove ? "" : describeFix(item, customCategories);
        const sign = o.type === "income" ? "+" : o.type === "expense" ? "-" : "";
        const amountTone = o.type === "income" ? "income" : o.type === "expense" ? "expense" : "neutral";

        return (
            <View style={s.itemWrap}>
                <GlassCard radius={14} blur={false}>
                    <View style={s.itemContent}>
                        <Pressable
                            onPress={() => toggle(item.txId)}
                            accessibilityRole="checkbox"
                            accessibilityState={{ checked: isSel }}
                            accessibilityLabel={`${o.description || "Movimiento"}, ${item.reasonLabel}`}
                            style={s.itemHeader}
                        >
                            <Ionicons
                                name={isSel ? "checkbox" : "square-outline"}
                                size={24}
                                color={isSel ? C.primary : C.textSub}
                            />
                            <View style={s.itemHeaderBody}>
                                <View style={[s.chip, { backgroundColor: tone + "22", borderColor: tone + "55" }]}>
                                    <Ionicons
                                        name={isRemove ? "trash-outline" : "construct-outline"}
                                        size={12}
                                        color={tone}
                                    />
                                    <Text style={[s.chipTxt, { color: tone }]}>
                                        {isRemove ? `Eliminar: ${item.reasonLabel}` : `Corregir: ${item.reasonLabel}`}
                                    </Text>
                                </View>
                                <Text style={s.itemDesc} numberOfLines={2}>{o.description || "Sin descripción"}</Text>
                                <View style={s.itemMeta}>
                                    <Money
                                        amount={Math.abs(o.amount)}
                                        currency={o.currency}
                                        size="sm"
                                        gradient={false}
                                        sign="never"
                                        prefix={sign}
                                        tone={amountTone}
                                        containerStyle={s.itemAmountWrap}
                                    />
                                    <Text style={s.itemDate}>{fmtDay(o.date)}</Text>
                                </View>
                            </View>
                        </Pressable>

                        {!!fixLine && (
                            <Text style={s.fixLine}>Se corregirá: {fixLine}</Text>
                        )}

                        {!!o.originalSMS && (
                            <Pressable
                                onPress={() => toggleExpanded(item.txId)}
                                accessibilityRole="button"
                                accessibilityLabel={isOpen ? "Contraer SMS original" : "Expandir SMS original"}
                            >
                                <Text style={s.sms} numberOfLines={isOpen ? undefined : 3}>{o.originalSMS}</Text>
                            </Pressable>
                        )}
                    </View>
                </GlassCard>
            </View>
        );
    }, [selected, expanded, toggle, toggleExpanded, customCategories]);

    return (
        <Modal
            visible={visible}
            transparent
            animationType="fade"
            statusBarTranslucent
            navigationBarTranslucent
            onRequestClose={onClose}
        >
            <View
                style={[
                    s.overlay,
                    { paddingTop: insets.top + 16, paddingBottom: insets.bottom + 16, paddingHorizontal: width < 360 ? 12 : 16 },
                ]}
            >
                <GlassCard
                    radius={22}
                    blur={false}
                    style={[s.card, { height: cardMaxH }]}
                    contentStyle={s.cardContent}
                >
                    <View style={s.header}>
                        <View style={s.iconWrap}>
                            <Ionicons name="shield-checkmark-outline" size={22} color={C.primaryLight} />
                        </View>
                        <View style={s.headerText}>
                            <Text style={s.title} accessibilityRole="header">Revisar movimientos importados</Text>
                            <Text style={s.subtitle}>
                                {items.length} movimiento{items.length === 1 ? "" : "s"} para revisar. Destildá los que quieras conservar tal como están.
                            </Text>
                            <Text style={s.note}>Las categorías que cambiaste a mano no se tocan.</Text>
                        </View>
                    </View>

                    <Pressable
                        onPress={() => setSelected(allSelected ? new Set() : new Set(items.map(i => i.txId)))}
                        accessibilityRole="button"
                        style={s.selectAll}
                    >
                        <Ionicons name={allSelected ? "checkbox" : "square-outline"} size={18} color={allSelected ? C.primary : C.textSub} />
                        <Text style={s.selectAllTxt}>{allSelected ? "Quitar selección" : "Seleccionar todo"}</Text>
                        <Text style={s.selectedCount}>{selected.size} de {items.length}</Text>
                    </Pressable>

                    <FlatList
                        style={s.list}
                        data={items}
                        keyExtractor={(it) => it.txId}
                        renderItem={renderItem}
                        extraData={{ selected, expanded }}
                        initialNumToRender={8}
                        windowSize={7}
                        showsVerticalScrollIndicator={false}
                        contentContainerStyle={s.listContent}
                    />

                    <View style={[s.actions, stacked && s.actionsStacked]}>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel="Ahora no"
                            onPress={onClose}
                            style={({ pressed }) => [s.btn, stacked ? s.btnStacked : s.btnGrow, pressed && s.btnPressed]}
                        >
                            <GlassBackground radius={12} blur={false} />
                            <Text style={[s.btnTxt, { color: C.text }]}>Ahora no</Text>
                        </Pressable>
                        <Pressable
                            accessibilityRole="button"
                            accessibilityLabel={`Aplicar ${counts.total}`}
                            accessibilityState={{ disabled: counts.total === 0 }}
                            disabled={counts.total === 0}
                            onPress={() => setDlg("confirm")}
                            style={({ pressed }) => [
                                s.btn,
                                stacked ? s.btnStacked : s.btnGrow,
                                s.btnPrimary,
                                counts.total === 0 && s.btnDisabled,
                                pressed && s.btnPressed,
                            ]}
                        >
                            <Text style={[s.btnTxt, { color: C.onPrimary }]}>Aplicar ({counts.total})</Text>
                        </Pressable>
                    </View>
                </GlassCard>

                <GlassDialog
                    visible={visible && dlg === "confirm"}
                    onClose={() => { if (!busy) setDlg(null); }}
                    variant={counts.remove === 0 ? "info" : "warning"}
                    icon={counts.remove === 0 ? "construct-outline" : "trash-outline"}
                    title="Confirmar cambios"
                    message={confirmMessage}
                    actions={[
                        { label: "Cancelar", kind: "secondary", onPress: () => { if (!busy) setDlg(null); } },
                        { label: busy ? "Aplicando..." : "Aplicar", kind: counts.remove === 0 ? "primary" : "destructive", onPress: () => { void apply(); } },
                    ]}
                />
                <GlassDialog
                    visible={visible && dlg === "error"}
                    onClose={() => setDlg(null)}
                    variant="error"
                    icon="warning-outline"
                    title="No se pudieron aplicar los cambios"
                    message="Ocurrió un problema al guardar. No se modificó nada. Intentá de nuevo."
                />
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: C.overlayScrim, alignItems: "center", justifyContent: "center" },
    card: { width: "100%", maxWidth: 480, backgroundColor: C.cardHigh },
    cardContent: { flex: 1, padding: 18 },
    header: { flexDirection: "row", alignItems: "flex-start", gap: 12, marginBottom: 10 },
    iconWrap: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: C.primary + "22",
        borderWidth: 1,
        borderColor: C.primary + "44",
        alignItems: "center",
        justifyContent: "center",
    },
    headerText: { flex: 1 },
    title: { color: C.text, fontSize: 18, fontWeight: "900", marginBottom: 4 },
    subtitle: { color: C.textSub, fontSize: 13, lineHeight: 19 },
    note: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginTop: 4 },
    selectAll: {
        flexDirection: "row",
        alignItems: "center",
        flexWrap: "wrap",
        gap: 8,
        paddingVertical: 8,
        minHeight: 40,
    },
    selectAllTxt: { color: C.text, fontSize: 13, fontWeight: "800", flexShrink: 1 },
    selectedCount: { color: C.textMuted, fontSize: 12, marginLeft: "auto" },
    list: { flex: 1 },
    listContent: { paddingBottom: 6 },
    itemWrap: { marginBottom: 10 },
    itemContent: { padding: 12 },
    itemHeader: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
    itemHeaderBody: { flex: 1 },
    chip: {
        flexDirection: "row",
        alignItems: "center",
        gap: 5,
        alignSelf: "flex-start",
        maxWidth: "100%",
        borderWidth: 1,
        borderRadius: 999,
        paddingHorizontal: 8,
        paddingVertical: 3,
        marginBottom: 6,
    },
    chipTxt: { fontSize: 11, fontWeight: "800", flexShrink: 1 },
    itemDesc: { color: C.text, fontSize: 14, fontWeight: "700", lineHeight: 19 },
    itemMeta: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 10, marginTop: 4 },
    itemAmountWrap: { flexShrink: 1, maxWidth: "100%" },
    itemDate: { color: C.textSub, fontSize: 12 },
    fixLine: { color: C.primaryLight, fontSize: 12, lineHeight: 18, marginTop: 8 },
    sms: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginTop: 8 },
    actions: { flexDirection: "row", gap: 10, marginTop: 12 },
    actionsStacked: { flexDirection: "column-reverse" },
    btn: {
        minHeight: 46,
        borderRadius: 12,
        paddingHorizontal: 16,
        paddingVertical: 10,
        alignItems: "center",
        justifyContent: "center",
        overflow: "hidden",
    },
    btnStacked: { alignSelf: "stretch" },
    btnGrow: { flex: 1 },
    btnPrimary: { backgroundColor: C.primary },
    btnDisabled: { opacity: 0.4 },
    btnPressed: { opacity: 0.8 },
    btnTxt: { fontSize: 14, fontWeight: "900", textAlign: "center" },
});
