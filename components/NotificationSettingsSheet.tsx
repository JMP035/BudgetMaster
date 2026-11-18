import React, { useState } from "react";
import { Linking, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { NotificationService } from "../services/NotificationService";
import { NOTIF_KINDS, sanitizeNotifPrefs } from "../services/NotifPrefs";
import type { NotifKind, NotifPrefs } from "../services/NotifPrefs";
import { NOTIF_KIND_INFO, hourLabel, hourOptions, hourShort, prefsSummary } from "../services/NotifUi";
import { StorageService } from "../services/storage";
import type { UserSettings } from "../services/storage";
import { C } from "../theme";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { GlassSheet } from "./GlassSheet";
import { InlineNotice } from "./InlineNotice";

const REMINDER_HOURS = [6, 7, 8, 9, 10, 11, 12];
const DAILY_HOURS = [17, 18, 19, 20, 21, 22, 23];
const QUIET_START_HOURS = [20, 21, 22, 23, 0, 1];
const QUIET_END_HOURS = [5, 6, 7, 8, 9, 10];
const MAX_PER_DAY = [1, 2, 3, 4, 5, 6, 7, 8];

interface Props {
    settings: UserSettings;
    onClose: () => void;
    /** Se llama tras guardar, con los ajustes nuevos. */
    onChanged?: (settings: UserSettings) => void;
}

type Notice = { variant: "success" | "error" | "warning" | "info"; text: string; action?: boolean };

function samePrefs(a: NotifPrefs, b: NotifPrefs): boolean {
    return JSON.stringify(a) === JSON.stringify(b);
}

export function NotificationSettingsSheet({ settings, onClose, onChanged }: Props) {
    const [saved, setSaved] = useState<NotifPrefs>(() => sanitizeNotifPrefs(settings.notif));
    const [prefs, setPrefs] = useState<NotifPrefs>(() => sanitizeNotifPrefs(settings.notif));
    const [busy, setBusy] = useState(false);
    const [testing, setTesting] = useState(false);
    const [notice, setNotice] = useState<Notice | null>(null);

    const dirty = !samePrefs(prefs, saved);
    const edit = (fn: (p: NotifPrefs) => NotifPrefs) => { setPrefs(p => fn(p)); setNotice(null); };
    const setKind = (k: NotifKind, v: boolean) => edit(p => ({ ...p, kinds: { ...p.kinds, [k]: v } }));

    const doSave = async () => {
        setBusy(true);
        setNotice(null);
        try {
            const clean = sanitizeNotifPrefs(prefs);
            const fresh = await StorageService.getSettings();
            const upd: UserSettings = { ...fresh, notif: clean };
            // saveSettings avisa del cambio y el servicio de notificaciones vuelve a armar lo programado.
            await StorageService.saveSettings(upd);
            setSaved(clean);
            setPrefs(clean);
            setNotice({ variant: "success", text: "Listo: tus avisos se ajustaron a lo que elegiste." });
            onChanged?.(upd);
        } catch (e) {
            console.warn("[NotificationSettings] guardar:", e);
            setNotice({ variant: "error", text: "No se pudo guardar. Intenta de nuevo." });
        } finally {
            setBusy(false);
        }
    };

    const doTest = async () => {
        setTesting(true);
        setNotice(null);
        try {
            const r = await NotificationService.sendTestNotification();
            if (r === "sent") {
                setNotice({ variant: "success", text: "Aviso de prueba enviado: debería llegarte en unos segundos." });
            } else if (r === "denied") {
                setNotice({
                    variant: "warning",
                    text: "El permiso de notificaciones está denegado. Actívalo en los ajustes del teléfono para recibir avisos.",
                    action: true,
                });
            } else {
                setNotice({ variant: "error", text: "No se pudo enviar el aviso de prueba en este dispositivo." });
            }
        } finally {
            setTesting(false);
        }
    };

    const chipRow = (
        options: number[], current: number, onPick: (n: number) => void, label: (n: number) => string, a11y: (n: number) => string,
    ) => (
        <View style={s.chips}>
            {options.map(n => {
                const on = n === current;
                return (
                    <TouchableOpacity
                        key={n}
                        style={[s.chip, on && s.chipOn]}
                        onPress={() => onPick(n)}
                        activeOpacity={0.75}
                        accessibilityRole="button"
                        accessibilityLabel={a11y(n)}
                        accessibilityState={{ selected: on }}
                    >
                        <Text style={[s.chipTxt, on && s.chipTxtOn]}>{label(n)}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );

    return (
        <GlassSheet onClose={onClose} title="Notificaciones" icon="notifications-outline">
            <GlassCard radius={16} blur={false} contentStyle={s.summary}>
                <Text style={s.kicker}>TUS AVISOS</Text>
                <Text style={s.summaryTxt}>{prefsSummary(prefs)}</Text>
                <Text style={s.hint}>
                    Máximo {prefs.maxPerDay} {prefs.maxPerDay === 1 ? "aviso" : "avisos"} por día. Ya no hay un aviso por cada gasto: el resumen diario los junta.
                </Text>
            </GlassCard>

            {!!notice && (
                <InlineNotice
                    variant={notice.variant}
                    text={notice.text}
                    style={s.notice}
                    actionLabel={notice.action ? "Abrir ajustes" : undefined}
                    onAction={notice.action ? () => { Linking.openSettings().catch(() => { }); } : undefined}
                />
            )}

            {/* QUÉ AVISOS */}
            <Text style={s.sectionLabel}>QUÉ AVISOS QUIERES</Text>
            {NOTIF_KINDS.map(k => (
                <View key={k} style={s.switchRow}>
                    <View style={s.switchText}>
                        <Text style={s.switchLabel}>{NOTIF_KIND_INFO[k].label}</Text>
                        <Text style={s.hint}>{NOTIF_KIND_INFO[k].help}</Text>
                    </View>
                    <Switch
                        value={prefs.kinds[k]}
                        onValueChange={v => setKind(k, v)}
                        trackColor={{ false: C.bgDeep, true: C.accent }}
                        thumbColor={C.text}
                        accessibilityLabel={NOTIF_KIND_INFO[k].label}
                    />
                </View>
            ))}

            {/* HORAS */}
            <Text style={[s.sectionLabel, { marginTop: 24 }]}>HORAS</Text>
            <Text style={s.subLabel}>Hora de los recordatorios de pagos</Text>
            {chipRow(
                hourOptions(REMINDER_HOURS, prefs.reminderHour), prefs.reminderHour,
                n => edit(p => ({ ...p, reminderHour: n })), hourShort, n => `Recordatorios a las ${hourLabel(n)}`,
            )}

            <View style={s.switchRow}>
                <View style={s.switchText}>
                    <Text style={s.switchLabel}>Resumen diario</Text>
                    <Text style={s.hint}>Un solo aviso al día con lo que registraste y cuánto te queda del período.</Text>
                </View>
                <Switch
                    value={prefs.dailySummary.enabled}
                    onValueChange={v => edit(p => ({ ...p, dailySummary: { ...p.dailySummary, enabled: v } }))}
                    trackColor={{ false: C.bgDeep, true: C.accent }}
                    thumbColor={C.text}
                    accessibilityLabel="Resumen diario"
                />
            </View>
            {prefs.dailySummary.enabled && (
                <>
                    <Text style={[s.subLabel, { marginTop: 12 }]}>Hora del resumen diario</Text>
                    {chipRow(
                        hourOptions(DAILY_HOURS, prefs.dailySummary.hour), prefs.dailySummary.hour,
                        n => edit(p => ({ ...p, dailySummary: { ...p.dailySummary, hour: n } })), hourShort,
                        n => `Resumen diario a las ${hourLabel(n)}`,
                    )}
                </>
            )}

            <Text style={[s.subLabel, { marginTop: 20 }]}>Horas silenciosas: desde</Text>
            {chipRow(
                hourOptions(QUIET_START_HOURS, prefs.quietStart), prefs.quietStart,
                n => edit(p => ({ ...p, quietStart: n })), hourShort, n => `Silencio desde las ${hourLabel(n)}`,
            )}
            <Text style={[s.subLabel, { marginTop: 12 }]}>Horas silenciosas: hasta</Text>
            {chipRow(
                hourOptions(QUIET_END_HOURS, prefs.quietEnd), prefs.quietEnd,
                n => edit(p => ({ ...p, quietEnd: n })), hourShort, n => `Silencio hasta las ${hourLabel(n)}`,
            )}
            <Text style={s.hint}>Dentro de ese rato no suena nada; lo que caiga ahí se mueve a la hora en que termina el silencio. Si eliges la misma hora en «desde» y «hasta», no hay horas silenciosas.</Text>

            <Text style={[s.subLabel, { marginTop: 20 }]}>Máximo de avisos por día</Text>
            {chipRow(
                MAX_PER_DAY.indexOf(prefs.maxPerDay) >= 0 ? MAX_PER_DAY : [...MAX_PER_DAY, prefs.maxPerDay], prefs.maxPerDay,
                n => edit(p => ({ ...p, maxPerDay: n })), n => String(n), n => `Máximo ${n} ${n === 1 ? "aviso" : "avisos"} por día`,
            )}
            <Text style={s.hint}>Si hay más, quedan los más importantes: primero los pagos. El aviso de «no alcanza para pagar» siempre llega.</Text>

            <View style={s.btnCol}>
                <GlassButton
                    kind="primary"
                    icon="checkmark-circle-outline"
                    label="Guardar"
                    disabled={!dirty || busy}
                    loading={busy}
                    onPress={() => { void doSave(); }}
                />
                <GlassButton
                    kind="secondary"
                    icon="paper-plane-outline"
                    label="Enviar aviso de prueba"
                    disabled={testing}
                    loading={testing}
                    onPress={() => { void doTest(); }}
                />
            </View>
            <Text style={s.hint}>El aviso de prueba llega en unos segundos, aunque estés en horas silenciosas. Si el permiso está apagado, te lo pedimos.</Text>
            <View style={{ height: 12 }} />
        </GlassSheet>
    );
}

export default NotificationSettingsSheet;

const s = StyleSheet.create({
    summary: { padding: 16 },
    kicker: { color: C.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
    summaryTxt: { color: C.textPrimary, fontSize: 15, fontWeight: "800", marginTop: 6, lineHeight: 21 },
    notice: { marginTop: 12 },
    sectionLabel: { color: C.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginTop: 20, marginBottom: 6 },
    subLabel: { color: C.text, fontSize: 13, fontWeight: "700", marginTop: 8, marginBottom: 2 },
    hint: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 6 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
    chip: {
        minHeight: 40, minWidth: 48, paddingHorizontal: 12, borderRadius: 14, alignItems: "center", justifyContent: "center",
        backgroundColor: C.glassInput, borderWidth: 1, borderColor: C.glassInputBorder,
    },
    chipOn: { backgroundColor: C.glassActive, borderColor: C.glassActiveBorder },
    chipTxt: { color: C.text, fontSize: 13, fontWeight: "700" },
    chipTxtOn: { color: C.primaryLight, fontWeight: "900" },
    switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
    switchText: { flex: 1, flexShrink: 1 },
    switchLabel: { color: C.text, fontSize: 14, fontWeight: "700" },
    btnCol: { gap: 10, marginTop: 24 },
});
