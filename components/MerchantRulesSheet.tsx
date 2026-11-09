import React, { useCallback, useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { getCat } from "../categories";
import { CustomCategory, MerchantRule, StorageService } from "../services/storage";
import { GlassBackground } from "./GlassCard";
import { GlassSheet } from "./GlassSheet";
import { useGlassDialog } from "./GlassDialogProvider";

interface Props {
    onClose: () => void;
    /** Se llama con la cantidad de reglas que quedan tras borrar una. */
    onChanged?: (count: number) => void;
    customCategories?: CustomCategory[];
}

export function MerchantRulesSheet({ onClose, onChanged, customCategories }: Props) {
    const dialog = useGlassDialog();
    const [rules, setRules] = useState<MerchantRule[] | null>(null);

    useEffect(() => {
        let alive = true;
        StorageService.getMerchantRules().then((r) => { if (alive) setRules(r); });
        return () => { alive = false; };
    }, []);

    const remove = useCallback(async (rule: MerchantRule) => {
        const ok = await dialog.confirm({
            title: "Olvidar comercio",
            message: `Se borrará lo aprendido de «${rule.label}». Los movimientos ya guardados no cambian.`,
            confirmLabel: "Olvidar",
            destructive: true,
            icon: "trash-outline",
        });
        if (!ok) return;
        const updated = await StorageService.deleteMerchantRule(rule.key);
        setRules(updated);
        onChanged?.(updated.length);
    }, [dialog, onChanged]);

    return (
        <GlassSheet title="Comercios aprendidos" icon="school-outline" onClose={onClose}>
            {rules === null ? null : rules.length === 0 ? (
                <Text style={s.empty}>
                    Todavía no le enseñaste ningún comercio. Cambiá la categoría de un movimiento de SMS y activá «Recordar».
                </Text>
            ) : (
                <View style={s.list}>
                    {rules.map((r) => (
                        <View key={r.key} style={s.row}>
                            <GlassBackground radius={14} blur={false} />
                            <View style={s.rowBody}>
                                <Text style={s.label} numberOfLines={2}>{r.label}</Text>
                                <View style={s.catLine}>
                                    <Ionicons name="arrow-forward" size={12} color={C.textSub} />
                                    <Text style={s.cat} numberOfLines={1}>{getCat(r.category, customCategories ?? [], "expense").label}</Text>
                                </View>
                            </View>
                            <TouchableOpacity
                                onPress={() => { void remove(r); }}
                                accessibilityRole="button"
                                accessibilityLabel={`Olvidar ${r.label}`}
                                style={s.delBtn}
                            >
                                <Ionicons name="trash-outline" size={18} color={C.danger} />
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}
        </GlassSheet>
    );
}

const s = StyleSheet.create({
    empty: { color: C.textSub, fontSize: 14, lineHeight: 21, paddingVertical: 8 },
    list: { gap: 10, paddingBottom: 4 },
    row: {
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingLeft: 14,
        paddingRight: 6,
        paddingVertical: 8,
        borderRadius: 14,
        overflow: "hidden",
    },
    rowBody: { flex: 1, flexShrink: 1 },
    label: { color: C.text, fontSize: 14, fontWeight: "800" },
    catLine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
    cat: { color: C.textSub, fontSize: 13, flexShrink: 1 },
    delBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center" },
});

export default MerchantRulesSheet;
