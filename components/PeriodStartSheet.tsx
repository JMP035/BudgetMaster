import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { parseYmd, sanitizePayRules, ymd } from "../services/PayCalendar";
import type { PayRules, WeekendRule } from "../services/PayCalendar";
import { getCurrentFinancialPeriod, StorageService } from "../services/storage";
import type { FinancialPeriod, UserSettings } from "../services/storage";
import type { PeriodAnchor } from "../services/PeriodAnchors";
import { C } from "../theme";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { GlassSegmented } from "./GlassSegmented";
import { GlassSheet } from "./GlassSheet";
import { InlineNotice } from "./InlineNotice";

const WEEKDAYS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

/** «vie 25» (o «vie 25 sep» si hace falta el mes). Mes y día fijos: no dependen del locale del teléfono. */
function dayLabel(d: Date, withMonth = false): string {
    return `${WEEKDAYS[d.getDay()]} ${d.getDate()}${withMonth ? ` ${MONTHS[d.getMonth()]}` : ""}`;
}

function addDays(d: Date, n: number): Date {
    return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0, 0);
}

/** Frase corta con el día (o los días) de pago configurados; la usa también Ajustes → Ingresos y período. */
export function payDayText(s: Pick<UserSettings, "paymentCycle" | "paymentDay" | "paymentDays">): string {
    if (s.paymentCycle === "monthly") return `Tu día de pago: el ${s.paymentDay} de cada mes`;
    if (s.paymentCycle === "biweekly") {
        const days = [...(s.paymentDays ?? [])].sort((a, b) => a - b);
        return days.length >= 2
            ? `Tus días de pago: el ${days[0]} y el ${days[1]} de cada mes`
            : "Cobrás dos veces al mes";
    }
    if (s.paymentCycle === "weekly") return "Cobrás cada semana";
    return "Tus ingresos son irregulares";
}

/** De dónde sale el inicio del período, en una frase clara. */
function originOf(p: FinancialPeriod): { icon: keyof typeof Ionicons.glyphMap; text: string } {
    switch (p.startSource) {
        case "manual":
            return { icon: "hand-left-outline", text: "Fijado por vos" };
        case "salary":
            return { icon: "cash-outline", text: `Empezó con tu sueldo del ${dayLabel(p.start)}` };
        case "expected":
            return ymd(p.start) < ymd(p.nominalStart)
                ? { icon: "play-back-outline", text: "Adelantado por fin de semana o feriado" }
                : { icon: "play-forward-outline", text: "Pasado al siguiente día hábil por fin de semana o feriado" };
        default:
            return { icon: "calendar-outline", text: "Es tu día de pago" };
    }
}

const WEEKEND_OPTIONS: { value: WeekendRule; label: string }[] = [
    { value: "prev_business", label: "Viernes antes" },
    { value: "next_business", label: "Lunes después" },
    { value: "exact", label: "Día exacto" },
];

const TOLERANCES = [1, 2, 3, 4, 5, 6, 7];

interface Props {
    settings: UserSettings;
    onClose: () => void;
    /** Se llama tras guardar algo; con los ajustes nuevos cuando cambiaron las reglas. */
    onChanged?: (settings?: UserSettings) => void;
}

export function PeriodStartSheet({ settings, onClose, onChanged }: Props) {
    const [cur, setCur] = useState<UserSettings>(settings);
    const [anchors, setAnchors] = useState<PeriodAnchor[]>([]);
    const [rules, setRules] = useState<PayRules>(() => sanitizePayRules(settings.payRules));
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState<{ variant: "success" | "error"; text: string } | null>(null);

    useEffect(() => {
        let cancelled = false;
        StorageService.getPeriodAnchors()
            .then(list => { if (!cancelled) setAnchors(list); })
            .catch(() => { });
        return () => { cancelled = true; };
    }, []);

    const period = getCurrentFinancialPeriod(cur);
    const adjustable = cur.paymentCycle === "monthly" || cur.paymentCycle === "biweekly";
    const savedRules = sanitizePayRules(cur.payRules);
    const tol = Math.min(7, Math.max(1, savedRules.toleranceDays));
    const manual = anchors.find(a => a.key === period.key && a.source === "manual");
    const startYmd = ymd(period.start);

    const [selected, setSelected] = useState(startYmd);
    // Si el período o su inicio cambian (por guardar o por volver a automático), la selección los sigue.
    useEffect(() => { setSelected(startYmd); }, [startYmd, period.key]);

    const nominal = period.nominalStart;
    // Nunca se ofrece un inicio posterior a hoy: si no, el período «actual» saltaría al anterior.
    const todayYmd = ymd(new Date());
    const chips: Date[] = [];
    for (let i = -tol; i <= tol; i++) {
        const d = addDays(nominal, i);
        if (ymd(d) <= todayYmd) chips.push(d);
    }
    if (chips.length === 0) chips.push(period.start);

    const origin = originOf(period);
    const canSave = adjustable && !busy && (selected !== startYmd || period.startSource !== "manual");

    const doSave = async () => {
        setBusy(true);
        setNotice(null);
        try {
            const list = await StorageService.setManualPeriodStart(period.key, selected);
            setAnchors(list);
            const d = parseYmd(selected);
            setNotice({ variant: "success", text: `Listo: tu período empieza el ${d ? dayLabel(d, true) : selected}.` });
            onChanged?.();
        } catch (e) {
            console.warn("[PeriodStart] guardar:", e);
            setNotice({ variant: "error", text: "No se pudo guardar. Intentá de nuevo." });
        } finally {
            setBusy(false);
        }
    };

    const doClear = async () => {
        setBusy(true);
        setNotice(null);
        try {
            const list = await StorageService.clearManualPeriodStart(period.key);
            setAnchors(list);
            setNotice({ variant: "success", text: "Volvió a automático: la app decide el inicio según tus reglas y tu sueldo." });
            onChanged?.();
        } catch (e) {
            console.warn("[PeriodStart] automático:", e);
            setNotice({ variant: "error", text: "No se pudo volver a automático. Intentá de nuevo." });
        } finally {
            setBusy(false);
        }
    };

    const rulesDirty = rules.weekendRule !== savedRules.weekendRule
        || rules.holidays !== savedRules.holidays
        || rules.toleranceDays !== savedRules.toleranceDays
        || rules.autoAnchor !== savedRules.autoAnchor;

    const doSaveRules = async () => {
        setBusy(true);
        setNotice(null);
        try {
            const fresh = await StorageService.getSettings();
            const upd: UserSettings = { ...fresh, payRules: rules };
            await StorageService.saveSettings(upd);
            setCur(upd);
            setNotice({ variant: "success", text: "Reglas guardadas." });
            onChanged?.(upd);
        } catch (e) {
            console.warn("[PeriodStart] reglas:", e);
            setNotice({ variant: "error", text: "No se pudieron guardar las reglas. Intentá de nuevo." });
        } finally {
            setBusy(false);
        }
    };

    const fixedStartText = cur.paymentCycle === "weekly"
        ? "Tu ciclo es semanal: el período siempre empieza el domingo, así que no hay nada que ajustar aquí."
        : "Tus ingresos son irregulares: el período es el mes calendario, así que su inicio es fijo y no hay nada que ajustar aquí.";

    return (
        <GlassSheet onClose={onClose} title="Cuándo empieza tu período" icon="calendar-outline">
            {/* PERÍODO ACTUAL */}
            <GlassCard radius={16} blur={false} contentStyle={s.summary}>
                <Text style={s.kicker}>PERÍODO ACTUAL</Text>
                <Text style={s.range}>{period.label}</Text>
                {adjustable ? (
                    <View style={s.originRow}>
                        <Ionicons name={origin.icon} size={16} color={C.primaryLight} />
                        <Text style={s.originTxt}>{origin.text}</Text>
                    </View>
                ) : null}
                <Text style={s.payInfo}>{payDayText(cur)}</Text>
            </GlassCard>

            {!!notice && <InlineNotice variant={notice.variant} text={notice.text} style={s.notice} />}

            {!adjustable ? (
                <InlineNotice variant="info" text={fixedStartText} style={s.notice} />
            ) : (
                <>
                    {/* ELEGIR OTRO INICIO */}
                    <Text style={s.sectionLabel}>ELEGÍ OTRO INICIO</Text>
                    <Text style={s.hint}>
                        Tu día de pago es el {nominal.getDate()}, pero a veces te pagan antes o después. Tocá la fecha en que de verdad te llegó el sueldo (no se ofrecen fechas futuras).
                    </Text>
                    <View style={s.chips}>
                        {chips.map(d => {
                            const key = ymd(d);
                            const on = key === selected;
                            return (
                                <TouchableOpacity
                                    key={key}
                                    style={[s.chip, on && s.chipOn]}
                                    onPress={() => { setSelected(key); setNotice(null); }}
                                    activeOpacity={0.75}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Empezar el ${dayLabel(d, true)}`}
                                    accessibilityState={{ selected: on }}
                                >
                                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>
                                        {dayLabel(d, d.getMonth() !== nominal.getMonth())}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <View style={s.btnCol}>
                        <GlassButton
                            kind="primary"
                            icon="checkmark-circle-outline"
                            label="Guardar"
                            disabled={!canSave}
                            loading={busy}
                            onPress={() => { void doSave(); }}
                        />
                        <GlassButton
                            kind="secondary"
                            icon="refresh-outline"
                            label="Volver a automático"
                            disabled={!manual || busy}
                            onPress={() => { void doClear(); }}
                        />
                    </View>
                    <Text style={s.hint}>
                        Lo que fijás a mano siempre gana: la app no lo cambia sola. «Volver a automático» le devuelve la decisión a tus reglas y a tu sueldo.
                    </Text>

                    {/* REGLAS */}
                    <Text style={[s.sectionLabel, { marginTop: 22 }]}>REGLAS</Text>
                    <Text style={s.subLabel}>Si tu día de pago cae en fin de semana o feriado</Text>
                    <GlassSegmented
                        options={WEEKEND_OPTIONS}
                        value={rules.weekendRule}
                        onChange={v => { setRules(r => ({ ...r, weekendRule: v })); setNotice(null); }}
                        height={44}
                    />

                    <View style={s.switchRow}>
                        <View style={s.switchText}>
                            <Text style={s.switchLabel}>Feriados de Guatemala</Text>
                            <Text style={s.hint}>Cuentan como días no hábiles, igual que sábado y domingo.</Text>
                        </View>
                        <Switch
                            value={rules.holidays}
                            onValueChange={v => { setRules(r => ({ ...r, holidays: v })); setNotice(null); }}
                            trackColor={{ false: C.bgDeep, true: C.accent }}
                            thumbColor={C.text}
                        />
                    </View>

                    <Text style={[s.subLabel, { marginTop: 16 }]}>Tolerancia (días de diferencia máxima)</Text>
                    <View style={s.chips}>
                        {TOLERANCES.map(n => {
                            const on = rules.toleranceDays === n;
                            return (
                                <TouchableOpacity
                                    key={n}
                                    style={[s.chip, s.chipSmall, on && s.chipOn]}
                                    onPress={() => { setRules(r => ({ ...r, toleranceDays: n })); setNotice(null); }}
                                    activeOpacity={0.75}
                                    accessibilityRole="button"
                                    accessibilityLabel={`Tolerancia de ${n} ${n === 1 ? "día" : "días"}`}
                                    accessibilityState={{ selected: on }}
                                >
                                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>{n}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    <Text style={s.hint}>El inicio del período nunca se aleja del día de pago más que esto, salvo lo que fijes a mano.</Text>

                    <View style={s.switchRow}>
                        <View style={s.switchText}>
                            <Text style={s.switchLabel}>Adelantar el período cuando llega el sueldo</Text>
                            <Text style={s.hint}>Si el sueldo llega antes o después de lo esperado, el período empieza ese día.</Text>
                        </View>
                        <Switch
                            value={rules.autoAnchor}
                            onValueChange={v => { setRules(r => ({ ...r, autoAnchor: v })); setNotice(null); }}
                            trackColor={{ false: C.bgDeep, true: C.accent }}
                            thumbColor={C.text}
                        />
                    </View>

                    <GlassButton
                        kind="primary"
                        icon="save-outline"
                        label="Guardar reglas"
                        disabled={!rulesDirty || busy}
                        onPress={() => { void doSaveRules(); }}
                        style={s.rulesBtn}
                    />
                </>
            )}
            <View style={{ height: 12 }} />
        </GlassSheet>
    );
}

export default PeriodStartSheet;

const s = StyleSheet.create({
    summary: { padding: 16 },
    kicker: { color: C.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2 },
    range: { color: C.textPrimary, fontSize: 20, fontWeight: "900", marginTop: 4 },
    originRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 },
    originTxt: { color: C.text, fontSize: 14, fontWeight: "700", flexShrink: 1 },
    payInfo: { color: C.textSub, fontSize: 12, marginTop: 8 },
    notice: { marginTop: 12 },
    sectionLabel: { color: C.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginTop: 20, marginBottom: 6 },
    subLabel: { color: C.text, fontSize: 13, fontWeight: "700", marginBottom: 8 },
    hint: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 6 },
    chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
    chip: {
        minHeight: 40, paddingHorizontal: 12, borderRadius: 14, alignItems: "center", justifyContent: "center",
        backgroundColor: C.glassInput, borderWidth: 1, borderColor: C.glassInputBorder,
    },
    chipSmall: { minWidth: 40, paddingHorizontal: 0 },
    chipOn: { backgroundColor: C.glassActive, borderColor: C.glassActiveBorder },
    chipTxt: { color: C.text, fontSize: 13, fontWeight: "700" },
    chipTxtOn: { color: C.primaryLight, fontWeight: "900" },
    btnCol: { gap: 10, marginTop: 14 },
    switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 16 },
    switchText: { flex: 1, flexShrink: 1 },
    switchLabel: { color: C.text, fontSize: 14, fontWeight: "700" },
    rulesBtn: { marginTop: 18 },
});
