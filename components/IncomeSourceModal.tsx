import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Switch, Text, TextInput, TouchableOpacity, View } from "react-native";
import { getAllIncomeCategories } from "../categories";
import { StorageService, parseAmount } from "../services/storage";
import type { Account, Currency, IncomePattern, IncomeSource, UserSettings } from "../services/storage";
import { isSmsFeatureOn } from "../services/features";
import { SmsService } from "../services/SmsService";
import type { IncomeSmsCandidate } from "../services/SmsService";
import { learnPatternFromSms } from "../services/IncomeSources";
import type { IncomePatternPreview as PatternPreview } from "../services/IncomeSources";
import {
    EXTRA_MONTH_PRESETS, FREQUENCY_LABELS, MONTH_SHORT, WEEKDAY_SHORT,
    patternFailText, patternSummary, suggestScheduleFromPreview, validateIncomeForm,
} from "../services/IncomeSourceView";
import type { IncomeFrequency } from "../services/IncomeSourceView";
import type { WeekendRule } from "../services/PayCalendar";
import { formatMoney } from "../services/format";
import { C } from "../theme";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { useGlassDialog } from "./GlassDialogProvider";
import { GlassSegmented } from "./GlassSegmented";
import { GlassSheet } from "./GlassSheet";
import IncomePatternPreview from "./IncomePatternPreview";
import { InlineNotice } from "./InlineNotice";
import { NewCategorySheet } from "./NewCategorySheet";

/** Pausa entre cerrar una ventana y abrir otra (Android no admite dos modales a la vez). */
const SWITCH_DELAY_MS = 250;

type Phase = "form" | "newCat" | "pick" | "none";

const FREQ_OPTIONS = (["monthly", "biweekly", "weekly", "irregular"] as IncomeFrequency[])
    .map(value => ({ value, label: FREQUENCY_LABELS[value] }));

const ROLE_OPTIONS = [
    { value: "base" as const, label: "Base" },
    { value: "extra" as const, label: "Extra" },
];

type RuleChoice = "global" | WeekendRule;
const RULE_OPTIONS: { value: RuleChoice; label: string }[] = [
    { value: "global", label: "La global" },
    { value: "prev_business", label: "Viernes antes" },
    { value: "next_business", label: "Lunes después" },
    { value: "exact", label: "Exacto" },
];

const CURRENCY_OPTIONS = [
    { value: "Q" as Currency, label: "Q" },
    { value: "USD" as Currency, label: "USD" },
];

const MONTHS_LOCALE = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

function fmtWhen(ms: number): string {
    const d = new Date(ms);
    return isNaN(d.getTime()) ? "" : `${d.getDate()} ${MONTHS_LOCALE[d.getMonth()]} ${d.getFullYear()}`;
}

interface Props {
    existing?: IncomeSource;
    settings: UserSettings;
    accounts: Account[];
    /** Se llama con la lista ya guardada (alta, edición o baja). */
    onSaved: (list: IncomeSource[]) => void;
    onClose: () => void;
}

export function IncomeSourceModal({ existing, settings, accounts, onSaved, onClose }: Props) {
    const dialog = useGlassDialog();
    const smsOn = isSmsFeatureOn(settings);
    const canPickSms = Platform.OS === "android" && smsOn;

    const [name, setName] = useState(existing?.name ?? "");
    const [category, setCategory] = useState(existing?.category ?? "salary");
    const [amount, setAmount] = useState(existing && existing.amount > 0 ? String(existing.amount) : "");
    const [currency, setCurrency] = useState<Currency>(existing?.currency ?? "Q");
    const [frequency, setFrequency] = useState<IncomeFrequency>(existing?.frequency ?? "monthly");
    const [day1, setDay1] = useState(existing && existing.frequency !== "weekly" && existing.days[0] ? String(existing.days[0]) : "");
    const [day2, setDay2] = useState(existing && existing.frequency === "biweekly" && existing.days[1] ? String(existing.days[1]) : "");
    const [weekday, setWeekday] = useState<number | null>(existing?.frequency === "weekly" ? (existing.days[0] ?? null) : null);
    const [rule, setRule] = useState<RuleChoice>(existing?.weekendRule ?? "global");
    const [accountId, setAccountId] = useState<string | null>(existing?.accountId ?? null);
    const [role, setRole] = useState<"base" | "extra">(existing?.role ?? "base");
    const [months, setMonths] = useState<number[]>(existing?.months ?? []);
    const [anchors, setAnchors] = useState(existing?.anchorsPeriod ?? true);
    const [pattern, setPattern] = useState<IncomePattern | null>(existing?.pattern ?? null);

    const [sampleText, setSampleText] = useState("");
    const [pending, setPending] = useState<{ pattern: IncomePattern; preview: PatternPreview } | null>(null);
    const [sampleError, setSampleError] = useState<string | null>(null);
    const [candidates, setCandidates] = useState<IncomeSmsCandidate[]>([]);
    const [loadingSms, setLoadingSms] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [saving, setSaving] = useState(false);

    // Una sola ventana a la vez: el formulario, «Nueva categoría» y la lista de SMS se alternan con una pausa.
    const [phase, setPhase] = useState<Phase>("form");
    const phaseTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => { if (phaseTimer.current) clearTimeout(phaseTimer.current); }, []);
    const goPhase = (next: "form" | "newCat" | "pick") => {
        if (phaseTimer.current) clearTimeout(phaseTimer.current);
        setPhase("none");
        phaseTimer.current = setTimeout(() => { setPhase(next); phaseTimer.current = null; }, SWITCH_DELAY_MS);
    };

    const touch = <T,>(setter: (v: T) => void) => (v: T) => { setError(null); setter(v); };

    const isMonthlyLike = frequency === "monthly" || frequency === "biweekly";
    const cats = getAllIncomeCategories(settings.customCategories);
    const destAccounts = accounts.filter(a => (a.isActive && a.type !== "credit") || a.id === existing?.accountId);

    // ── SMS de ejemplo ────────────────────────────────────────
    const analyze = (body: string, receivedAt?: number) => {
        setSampleError(null);
        setPending(null);
        const text = body.trim();
        if (!text) { setSampleError("Pega primero el texto del SMS."); return; }
        const r = learnPatternFromSms(text, receivedAt);
        if (!r.ok) { setSampleError(patternFailText(r.reason)); return; }
        setPending({ pattern: r.pattern, preview: r.preview });
    };

    const openPicker = async () => {
        if (loadingSms) return;
        setSampleError(null);
        setLoadingSms(true);
        try {
            const list = await SmsService.listRecentIncomeSms(30);
            if (list.length === 0) {
                setSampleError("No encontré SMS de depósitos en tu bandeja. Pega el texto del SMS en el cuadro.");
                return;
            }
            setCandidates(list);
            goPhase("pick");
        } catch (e) {
            console.warn("[IncomeSource] elegir SMS:", e);
            setSampleError("No pude leer tus SMS. Pega el texto del SMS en el cuadro.");
        } finally {
            setLoadingSms(false);
        }
    };

    const confirmPattern = (p: IncomePattern) => {
        const prev = pending?.preview;
        setPattern(p);
        setPending(null);
        setSampleText("");
        setError(null);
        if (!prev) return;
        // Solo se rellena lo que el usuario dejó vacío: nunca se pisa lo que ya escribió.
        if (!amount.trim()) {
            setAmount(String(p.amount));
            if (prev.currency === "Q" || prev.currency === "USD") setCurrency(prev.currency as Currency);
        }
        const hasDays = frequency === "weekly" ? weekday !== null : day1.trim() !== "";
        if (!hasDays) {
            const [first] = suggestScheduleFromPreview(prev, frequency);
            if (first !== undefined) {
                if (frequency === "weekly") setWeekday(first);
                else setDay1(String(first));
            }
        }
    };

    // ── Guardar / eliminar ────────────────────────────────────
    const handleSave = async () => {
        if (saving) return;
        const days = frequency === "monthly" ? [parseInt(day1, 10)]
            : frequency === "biweekly" ? [parseInt(day1, 10), parseInt(day2, 10)]
                : frequency === "weekly" ? [weekday ?? NaN] : [];
        const res = validateIncomeForm({
            id: existing?.id ?? `inc_${Date.now()}`,
            name, category, amount: parseAmount(amount), currency, frequency, days,
            weekendRule: rule === "global" ? null : rule,
            accountId, role, months, anchorsPeriod: anchors, pattern,
            isActive: existing?.isActive ?? true,
            createdAt: existing?.createdAt ?? new Date().toISOString(),
        });
        if (!res.ok) { setError(res.error); return; }
        setSaving(true);
        try {
            const list = existing
                ? await StorageService.updateIncomeSource(res.source)
                : await StorageService.addIncomeSource(res.source);
            onSaved(list);
            onClose();
        } catch (e) {
            console.warn("[IncomeSource] guardar:", e);
            setError("No se pudo guardar la fuente. Prueba de nuevo.");
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!existing) return;
        const ok = await dialog.confirm({
            title: "Eliminar fuente de ingreso",
            message: `¿Borrar «${existing.name}»? Tus movimientos no se borran: solo dejan de estar vinculados a esta fuente.`,
            confirmLabel: "Eliminar",
            destructive: true,
        });
        if (!ok) return;
        try {
            const list = await StorageService.deleteIncomeSource(existing.id);
            onSaved(list);
            onClose();
        } catch (e) {
            console.warn("[IncomeSource] eliminar:", e);
            setError("No se pudo eliminar la fuente. Prueba de nuevo.");
        }
    };

    if (phase === "none") return null;

    if (phase === "newCat") {
        return (
            <NewCategorySheet
                initialType="income"
                onSaved={cat => setCategory(cat.id)}
                onClose={() => goPhase("form")}
            />
        );
    }

    if (phase === "pick") {
        return (
            <GlassSheet onClose={() => goPhase("form")} title="Elige el SMS de tu pago" icon="chatbubble-ellipses-outline">
                <Text style={s.hint}>Estos son tus últimos depósitos. Toca el de tu pago más reciente para que la app aprenda cómo llega.</Text>
                <View style={{ height: 8 }} />
                {candidates.map((c, i) => (
                    <TouchableOpacity
                        key={`${c.receivedAt}_${i}`}
                        activeOpacity={0.8}
                        onPress={() => { setSampleText(c.body); analyze(c.body, c.receivedAt); goPhase("form"); }}
                        accessibilityRole="button"
                        accessibilityLabel={`${c.bank} ${formatMoney(c.amount, "Q")}`}
                    >
                        <GlassCard radius={14} blur={false} style={s.pickCard} contentStyle={s.pickContent}>
                            <View style={{ flex: 1, flexShrink: 1 }}>
                                <Text style={s.pickTitle} numberOfLines={2}>{c.bank} · {formatMoney(c.amount, "Q")}</Text>
                                {!!c.originLabel && <Text style={s.pickSub} numberOfLines={2}>de {c.originLabel}</Text>}
                                <Text style={s.pickSub}>{fmtWhen(c.receivedAt)}</Text>
                            </View>
                            <Ionicons name="chevron-forward" size={16} color={C.textMuted} />
                        </GlassCard>
                    </TouchableOpacity>
                ))}
                <View style={{ height: 8 }} />
            </GlassSheet>
        );
    }

    return (
        <GlassSheet
            onClose={onClose}
            title={existing ? "Editar fuente de ingreso" : "Nueva fuente de ingreso"}
            icon="cash-outline"
            maxHeightRatio={0.94}
            footer={
                <View style={s.footer}>
                    {!!error && <InlineNotice variant="error" text={error} style={s.notice} />}
                    <GlassButton
                        label={existing ? "Guardar fuente" : "Crear fuente"}
                        icon="checkmark-circle-outline"
                        loading={saving}
                        onPress={() => { void handleSave(); }}
                    />
                </View>
            }
        >
            <Text style={s.lbl}>NOMBRE</Text>
            <TextInput
                style={s.input}
                value={name}
                onChangeText={touch(setName)}
                placeholder="Ej: Sueldo, Quincena, Ventas, Aguinaldo…"
                placeholderTextColor={C.textMuted}
            />

            <Text style={s.lbl}>CATEGORÍA DE INGRESO</Text>
            <View style={s.chipWrap}>
                {cats.map(cat => {
                    const on = category === cat.id;
                    return (
                        <TouchableOpacity
                            key={cat.id}
                            style={[s.chip, on && s.chipOn]}
                            onPress={() => touch(setCategory)(cat.id)}
                            accessibilityRole="button"
                            accessibilityLabel={cat.label}
                            accessibilityState={{ selected: on }}
                        >
                            <Ionicons name={cat.icon} size={16} color={on ? C.primaryLight : C.textSub} />
                            <Text style={[s.chipTxt, on && s.chipTxtOn]} numberOfLines={1}>{cat.label}</Text>
                        </TouchableOpacity>
                    );
                })}
                <TouchableOpacity
                    style={[s.chip, s.chipNew]}
                    onPress={() => goPhase("newCat")}
                    accessibilityRole="button"
                    accessibilityLabel="Nueva categoría"
                >
                    <Ionicons name="add-circle-outline" size={16} color={C.primaryLight} />
                    <Text style={[s.chipTxt, { color: C.primaryLight }]} numberOfLines={1}>+ Nueva categoría</Text>
                </TouchableOpacity>
            </View>

            <Text style={s.lbl}>MONTO QUE TE PAGAN</Text>
            <View style={s.amtRow}>
                <Text style={s.cur}>{currency === "USD" ? "$" : currency}</Text>
                <TextInput
                    style={s.amtInput}
                    value={amount}
                    onChangeText={touch(setAmount)}
                    placeholder="0.00"
                    placeholderTextColor={C.textMuted}
                    keyboardType="decimal-pad"
                />
            </View>
            <GlassSegmented options={CURRENCY_OPTIONS} value={currency} onChange={touch(setCurrency)} height={40} style={s.gap} />

            <Text style={s.lbl}>CADA CUÁNTO</Text>
            <GlassSegmented options={FREQ_OPTIONS} value={frequency} onChange={touch(setFrequency)} height={42} />

            {frequency === "monthly" && (
                <>
                    <Text style={s.lbl}>DÍA DEL MES</Text>
                    <TextInput
                        style={s.input}
                        value={day1}
                        onChangeText={touch(setDay1)}
                        placeholder="Ej: 27"
                        placeholderTextColor={C.textMuted}
                        keyboardType="number-pad"
                        maxLength={2}
                    />
                </>
            )}
            {frequency === "biweekly" && (
                <>
                    <Text style={s.lbl}>LOS DOS DÍAS DEL MES</Text>
                    <View style={s.twoCols}>
                        <TextInput
                            style={[s.input, s.col]}
                            value={day1}
                            onChangeText={touch(setDay1)}
                            placeholder="Ej: 15"
                            placeholderTextColor={C.textMuted}
                            keyboardType="number-pad"
                            maxLength={2}
                        />
                        <TextInput
                            style={[s.input, s.col]}
                            value={day2}
                            onChangeText={touch(setDay2)}
                            placeholder="Ej: 30"
                            placeholderTextColor={C.textMuted}
                            keyboardType="number-pad"
                            maxLength={2}
                        />
                    </View>
                </>
            )}
            {frequency === "weekly" && (
                <>
                    <Text style={s.lbl}>DÍA DE LA SEMANA</Text>
                    <View style={s.chipWrap}>
                        {WEEKDAY_SHORT.map((label, i) => {
                            const on = weekday === i;
                            return (
                                <TouchableOpacity
                                    key={label}
                                    style={[s.chip, s.chipSmall, on && s.chipOn]}
                                    onPress={() => touch(setWeekday)(i)}
                                    accessibilityRole="button"
                                    accessibilityLabel={label}
                                    accessibilityState={{ selected: on }}
                                >
                                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>{label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </>
            )}
            {frequency === "irregular" && (
                <Text style={s.hint}>Sin día fijo: la app no espera una fecha. Reconoce tus pagos cuando llegan por SMS y promedia los últimos meses.</Text>
            )}

            {frequency !== "irregular" && (
                <>
                    <Text style={s.lbl}>SI CAE EN FIN DE SEMANA O FERIADO</Text>
                    <GlassSegmented options={RULE_OPTIONS} value={rule} onChange={touch(setRule)} height={42} />
                    <Text style={s.hint}>«La global» usa lo que elegiste en Ajustes → Ingresos y período.</Text>
                </>
            )}

            <Text style={s.lbl}>CUENTA DONDE TE PAGAN</Text>
            <View style={s.chipWrap}>
                <TouchableOpacity
                    style={[s.chip, accountId === null && s.chipOn]}
                    onPress={() => touch(setAccountId)(null)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: accountId === null }}
                >
                    <Text style={[s.chipTxt, accountId === null && s.chipTxtOn]}>Sin cuenta</Text>
                </TouchableOpacity>
                {destAccounts.map(a => {
                    const on = accountId === a.id;
                    return (
                        <TouchableOpacity
                            key={a.id}
                            style={[s.chip, on && s.chipOn]}
                            onPress={() => touch(setAccountId)(a.id)}
                            accessibilityRole="button"
                            accessibilityLabel={a.name}
                            accessibilityState={{ selected: on }}
                        >
                            <View style={[s.dot, { backgroundColor: a.color }]} />
                            <Text style={[s.chipTxt, on && s.chipTxtOn]} numberOfLines={1}>{a.name}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            {destAccounts.length === 0 && (
                <Text style={s.hint}>Todavía no tienes una cuenta bancaria. Créala en Cuentas para elegirla aquí.</Text>
            )}

            <Text style={s.lbl}>TIPO DE INGRESO</Text>
            <GlassSegmented options={ROLE_OPTIONS} value={role} onChange={touch(setRole)} height={42} />
            <Text style={s.hint}>
                {role === "base"
                    ? "Base: tu ingreso regular. Cuenta para tu ingreso mensual real."
                    : "Extra: un pago que llega solo en ciertos meses (aguinaldo, bono 14). No cuenta como ingreso mensual."}
            </Text>
            {role === "extra" && frequency !== "irregular" && (
                <>
                    <Text style={s.lbl}>¿EN QUÉ MESES LLEGA?</Text>
                    <View style={s.chipWrap}>
                        {EXTRA_MONTH_PRESETS.map(p => (
                            <TouchableOpacity
                                key={p.label}
                                style={[s.chip, s.chipNew]}
                                onPress={() => touch(setMonths)(p.months)}
                                accessibilityRole="button"
                                accessibilityLabel={p.label}
                            >
                                <Text style={[s.chipTxt, { color: C.primaryLight }]}>{p.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                    <View style={[s.chipWrap, { marginTop: 8 }]}>
                        {MONTH_SHORT.map((label, i) => {
                            const m = i + 1;
                            const on = months.includes(m);
                            return (
                                <TouchableOpacity
                                    key={label}
                                    style={[s.chip, s.chipSmall, on && s.chipOn]}
                                    onPress={() => touch(setMonths)(on ? months.filter(x => x !== m) : [...months, m].sort((a, b) => a - b))}
                                    accessibilityRole="button"
                                    accessibilityLabel={label}
                                    accessibilityState={{ selected: on }}
                                >
                                    <Text style={[s.chipTxt, on && s.chipTxtOn]}>{label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                </>
            )}

            {role === "base" && isMonthlyLike && (
                <View style={s.switchRow}>
                    <View style={s.switchText}>
                        <Text style={s.switchLabel}>Mueve mi período cuando llega</Text>
                        <Text style={s.hint}>Si tu pago llega antes o después del día esperado, tu período empieza el día que de verdad te pagan.</Text>
                    </View>
                    <Switch
                        value={anchors}
                        onValueChange={v => touch(setAnchors)(v)}
                        trackColor={{ false: C.bgDeep, true: C.accent }}
                        thumbColor={C.text}
                    />
                </View>
            )}

            {/* SMS DE EJEMPLO */}
            <Text style={[s.lbl, { marginTop: 22 }]}>SMS DE EJEMPLO</Text>
            {pattern && !pending ? (
                <GlassCard radius={16} blur={false} leftAccentColor={C.success} contentStyle={s.patternBox}>
                    <View style={s.patternHead}>
                        <Ionicons name="checkmark-circle-outline" size={16} color={C.success} />
                        <Text style={s.patternTitle}>La app ya sabe cómo llega tu pago</Text>
                    </View>
                    <Text style={s.patternTxt}>{patternSummary(pattern, currency)}</Text>
                    <View style={s.patternActions}>
                        <GlassButton kind="secondary" icon="swap-horizontal-outline" label="Cambiar SMS de ejemplo" onPress={() => setPattern(null)} />
                    </View>
                </GlassCard>
            ) : pending ? (
                <IncomePatternPreview
                    pattern={pending.pattern}
                    preview={pending.preview}
                    onConfirm={confirmPattern}
                    onDiscard={() => { setPending(null); setSampleError(null); }}
                />
            ) : (
                <>
                    <Text style={s.hint}>
                        Pega el SMS que te mandó el banco cuando te pagaron
                        {canPickSms ? " o elígelo de tus mensajes" : ""}. La app aprende de qué banco y cuenta llega, quién lo envía y cuánto, y así reconoce tu pago solo.
                    </Text>
                    <TextInput
                        style={[s.input, s.multiline]}
                        value={sampleText}
                        onChangeText={v => { setSampleText(v); setSampleError(null); }}
                        placeholder="Pega aquí el texto del SMS…"
                        placeholderTextColor={C.textMuted}
                        multiline
                        textAlignVertical="top"
                    />
                    {!!sampleError && <InlineNotice variant="error" text={sampleError} style={s.notice} />}
                    <View style={s.patternActions}>
                        <GlassButton
                            kind="primary"
                            icon="scan-outline"
                            label="Analizar SMS"
                            disabled={!sampleText.trim()}
                            onPress={() => analyze(sampleText)}
                        />
                        {canPickSms && (
                            <GlassButton
                                kind="secondary"
                                icon="chatbubble-ellipses-outline"
                                label="Elegir de mis SMS"
                                loading={loadingSms}
                                onPress={() => { void openPicker(); }}
                            />
                        )}
                    </View>
                    <Text style={s.hint}>
                        Sin SMS de ejemplo puedes guardar la fuente igual, pero la app no detectará tu pago sola: tendrías que vincular cada depósito a mano desde Movimientos.
                    </Text>
                </>
            )}

            {!!existing && (
                <GlassButton
                    kind="destructive"
                    icon="trash-outline"
                    label="Eliminar fuente"
                    style={s.deleteBtn}
                    onPress={() => { void handleDelete(); }}
                />
            )}
            <View style={{ height: 8 }} />
        </GlassSheet>
    );
}

export default IncomeSourceModal;

const s = StyleSheet.create({
    footer: { paddingTop: 12 },
    notice: { marginBottom: 10, marginTop: 10 },
    lbl: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1.2, marginBottom: 8, marginTop: 16 },
    hint: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 6 },
    gap: { marginTop: 10 },
    input: { backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, padding: 14, color: C.text, fontSize: 15 },
    multiline: { minHeight: 96, marginTop: 10 },
    twoCols: { flexDirection: "row", gap: 10 },
    col: { flex: 1 },
    amtRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, paddingHorizontal: 14, paddingVertical: 10 },
    amtInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: "700" },
    cur: { color: C.textSub, fontSize: 16, fontWeight: "700", marginRight: 8 },
    chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    chip: { flexDirection: "row", alignItems: "center", gap: 6, maxWidth: "100%", minHeight: 40, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
    chipSmall: { minWidth: 48, justifyContent: "center", paddingHorizontal: 8 },
    chipOn: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
    chipNew: { borderStyle: "dashed", borderColor: C.glassActiveBorder },
    chipTxt: { color: C.textSub, fontSize: 12, fontWeight: "700", flexShrink: 1 },
    chipTxtOn: { color: C.primaryLight, fontWeight: "800" },
    dot: { width: 10, height: 10, borderRadius: 5 },
    switchRow: { flexDirection: "row", alignItems: "center", gap: 12, marginTop: 18 },
    switchText: { flex: 1, flexShrink: 1 },
    switchLabel: { color: C.text, fontSize: 14, fontWeight: "700" },
    patternBox: { padding: 14 },
    patternHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    patternTitle: { color: C.text, fontSize: 13, fontWeight: "800", flexShrink: 1 },
    patternTxt: { color: C.textPrimary, fontSize: 14, fontWeight: "700", lineHeight: 20 },
    patternActions: { gap: 8, marginTop: 12 },
    deleteBtn: { marginTop: 22 },
    pickCard: { marginBottom: 10 },
    pickContent: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
    pickTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
    pickSub: { color: C.textSub, fontSize: 12, marginTop: 2 },
});
