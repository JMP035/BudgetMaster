import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { CATEGORY_COLORS, CATEGORY_ICONS } from "../categories";
import { CustomCategory, StorageService } from "../services/storage";
import { C } from "../theme";
import { GlassButton } from "./GlassButton";
import { GlassSegmented } from "./GlassSegmented";
import { GlassSheet } from "./GlassSheet";
import { InlineNotice } from "./InlineNotice";

// ─────────────────────────────────────────────────────────────
// SHEET «NUEVA / EDITAR CATEGORÍA»
// Compartido por Ajustes, Agregar, el detalle de un movimiento y el buzón de SMS.
// Guarda por sí mismo con StorageService (add/update) y avisa con onSaved.
// ─────────────────────────────────────────────────────────────
interface Props {
    /** Tipo preseleccionado al crear (ignorado si viene `existing`). */
    initialType?: 'expense' | 'income' | 'both';
    /** Categoría propia a editar: conserva su id. */
    existing?: CustomCategory;
    onSaved: (cat: CustomCategory) => void;
    onClose: () => void;
}

export function NewCategorySheet({ initialType, existing, onSaved, onClose }: Props) {
    const [label, setLabel] = useState(existing?.label ?? "");
    const [color, setColor] = useState(existing?.color ?? CATEGORY_COLORS[0]);
    const [icon, setIcon] = useState<string>(existing?.icon ?? CATEGORY_ICONS[0]);
    const [type, setType] = useState<'expense' | 'income' | 'both'>(existing?.type ?? initialType ?? 'expense');
    const [error, setError] = useState<string | null>(null);
    const [busy, setBusy] = useState(false);

    const handleSave = async () => {
        if (busy) return;
        if (!label.trim()) { setError("Ingresa un nombre para la categoría."); return; }
        const cat: CustomCategory = {
            id: existing?.id ?? `custom_${Date.now()}`,
            label: label.trim(),
            icon,
            color,
            type,
        };
        setBusy(true);
        try {
            if (existing) await StorageService.updateCustomCategory(cat);
            else await StorageService.addCustomCategory(cat);
        } catch {
            setBusy(false);
            setError("No se pudo guardar la categoría. Prueba de nuevo.");
            return;
        }
        onSaved(cat);
        onClose();
    };

    return (
        <GlassSheet
            onClose={onClose}
            title={existing ? "Editar categoría" : "Nueva categoría"}
            footer={
                <View style={nc.footer}>
                    {!!error && <InlineNotice variant="error" text={error} style={{ marginBottom: 10 }} />}
                    <GlassButton
                        label={existing ? "Guardar" : "Crear categoría"}
                        icon={existing ? "checkmark-circle-outline" : "add-circle-outline"}
                        onPress={handleSave}
                    />
                </View>
            }
        >
            <Text style={nc.lbl}>NOMBRE</Text>
            <TextInput
                style={nc.input}
                value={label}
                onChangeText={(v) => { setError(null); setLabel(v); }}
                placeholder="Ej: Mascotas, Gym..."
                placeholderTextColor={C.textMuted}
                autoFocus
            />

            <Text style={nc.lbl}>APLICA PARA</Text>
            <GlassSegmented
                options={[
                    { value: "expense" as const, label: "Gastos" },
                    { value: "income" as const, label: "Ingresos" },
                    { value: "both" as const, label: "Ambos" },
                ]}
                value={type}
                onChange={setType}
            />

            <Text style={nc.lbl}>COLOR</Text>
            <View style={nc.colorGrid}>
                {CATEGORY_COLORS.map(c => (
                    <TouchableOpacity
                        key={c}
                        accessibilityRole="button"
                        accessibilityLabel={`Color ${c}`}
                        style={[nc.colorDot, { backgroundColor: c }, color === c && nc.colorDotActive]}
                        onPress={() => setColor(c)}
                    >
                        {color === c && <Ionicons name="checkmark" size={14} color={C.text} />}
                    </TouchableOpacity>
                ))}
            </View>

            <Text style={nc.lbl}>ÍCONO</Text>
            <View style={nc.iconGrid}>
                {CATEGORY_ICONS.map(ic => (
                    <TouchableOpacity key={ic} style={[nc.iconBtn, icon === ic && { borderColor: color, backgroundColor: color + "22" }]} onPress={() => setIcon(ic)}>
                        <Ionicons name={ic} size={22} color={icon === ic ? color : C.textSub} />
                    </TouchableOpacity>
                ))}
            </View>

            {/* Preview */}
            <View style={[nc.preview, { borderColor: color + "55", backgroundColor: color + "11" }]}>
                <View style={[nc.previewIcon, { backgroundColor: color + "22", borderColor: color + "44" }]}>
                    <Ionicons name={icon as any} size={24} color={color} />
                </View>
                <Text style={[nc.previewLabel, { color }]} numberOfLines={1}>{label || "Vista previa"}</Text>
            </View>
        </GlassSheet>
    );
}

const nc = StyleSheet.create({
    footer: { marginTop: 12 },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 10, marginTop: 16 },
    input: { backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, padding: 14, color: C.text, fontSize: 15 },
    colorGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
    colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center" },
    colorDotActive: { borderWidth: 3, borderColor: C.text },
    iconGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    iconBtn: { width: 44, height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    preview: { flexDirection: "row", alignItems: "center", padding: 16, borderRadius: 14, borderWidth: 1, marginTop: 8, marginBottom: 8, gap: 14 },
    previewIcon: { width: 44, height: 44, borderRadius: 12, borderWidth: 1, alignItems: "center", justifyContent: "center" },
    previewLabel: { fontSize: 18, fontWeight: "800", flexShrink: 1 },
});
