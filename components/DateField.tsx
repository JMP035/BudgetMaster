import React, { useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import { C } from "../theme";
import { GlassBackground } from "./GlassCard";

/** Una fecha al mediodía local (la hora no importa: evita saltos de día por zona horaria). */
export function noonOf(d: Date): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

/**
 * Campo de fecha con el selector del sistema (mismo patrón que «Fecha del pago» de la tarjeta).
 * No permite fechas futuras: lo que se registra ya pasó.
 */
export function DateField({ label, value, onChange }: { label: string; value: Date; onChange: (d: Date) => void }) {
    const [showPicker, setShowPicker] = useState(false);
    const maxDate = new Date();
    maxDate.setHours(23, 59, 59, 999);
    const dateLabel = value.toLocaleDateString("es-GT", { weekday: "short", day: "2-digit", month: "long", year: "numeric" });

    return (
        <View>
            <Text style={s.lbl}>{label}</Text>
            <TouchableOpacity
                style={s.field}
                onPress={() => setShowPicker(v => !v)}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel={`${label}: ${dateLabel}. Toca para cambiarla`}
            >
                <GlassBackground radius={12} blur={false} />
                <Ionicons name="calendar-outline" size={18} color={C.primaryLight} style={{ marginRight: 10 }} />
                <Text style={[s.txt, { textTransform: "capitalize" }]}>{dateLabel}</Text>
                <Ionicons name="chevron-down" size={16} color={C.textSub} />
            </TouchableOpacity>
            {showPicker && Platform.OS === "android" && (
                <DateTimePicker
                    value={value}
                    mode="date"
                    display="default"
                    maximumDate={maxDate}
                    onChange={(event, selected) => {
                        setShowPicker(false);
                        if (event.type === "set" && selected) onChange(noonOf(selected));
                    }}
                />
            )}
            {showPicker && Platform.OS === "ios" && (
                <View style={s.iosWrap}>
                    <DateTimePicker
                        value={value}
                        mode="date"
                        display="inline"
                        themeVariant="dark"
                        maximumDate={maxDate}
                        accentColor={C.primary}
                        onChange={(_e, selected) => { if (selected) onChange(noonOf(selected)); }}
                    />
                    <TouchableOpacity style={s.iosDone} onPress={() => setShowPicker(false)}>
                        <Text style={s.iosDoneTxt}>Listo</Text>
                    </TouchableOpacity>
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 14 },
    field: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14, overflow: "hidden" },
    txt: { flex: 1, color: C.text, fontSize: 15, fontWeight: "700" },
    iosWrap: { marginTop: 8 },
    iosDone: { alignSelf: "flex-end", paddingHorizontal: 16, paddingVertical: 8 },
    iosDoneTxt: { color: C.primaryLight, fontWeight: "800" },
});

export default DateField;
