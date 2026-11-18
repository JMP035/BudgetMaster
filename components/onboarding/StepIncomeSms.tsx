import { Ionicons } from "@expo/vector-icons";
import React, { useContext, useEffect, useRef, useState } from "react";
import { Keyboard, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { formatMoney } from "../../services/format";
import { learnPatternFromSms } from "../../services/IncomeSources";
import type { IncomePatternPreview as PatternPreview } from "../../services/IncomeSources";
import { applyPatternCorrection, patternFailText, patternSummary } from "../../services/IncomeSourceView";
import { SmsService } from "../../services/SmsService";
import type { IncomeSmsCandidate } from "../../services/SmsService";
import type { IncomePattern } from "../../services/storage";
import { C } from "../../theme";
import { GlassButton } from "../GlassButton";
import { GlassCard } from "../GlassCard";
import IncomePatternPreview from "../IncomePatternPreview";
import { InlineNotice } from "../InlineNotice";
import { FieldContext, ps, StepHeader, StepProps } from "./OnbPrimitives";

const MONTHS = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const MAX_CANDIDATES = 10;

function fmtWhen(ms: number): string {
    const d = new Date(ms);
    return isNaN(d.getTime()) ? "" : `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

interface Analysis { body: string; pattern: IncomePattern; preview: PatternPreview }

/** Lo que la app entiende de un SMS ya guardado en el borrador (null si ya no se puede leer). */
function analysisFromDraft(sample: StepProps["draft"]["incomeSample"]): Analysis | null {
    if (!sample || !sample.body.trim()) return null;
    const r = learnPatternFromSms(sample.body);
    if (!r.ok) return null;
    const pattern = sample.confirmed && sample.edit ? applyPatternCorrection(r.pattern, sample.edit) : r.pattern;
    return { body: sample.body, pattern, preview: r.preview };
}

/**
 * Paso «SMS de tu pago». Pide el SMS con el que le llega el pago a la persona (sueldo, quincena, ventas…),
 * la app aprende el patrón y lo confirma con «Entendimos…». Es opcional («Lo hago después»): sin SMS la fuente
 * de ingreso se crea igual, sin patrón, y el pendiente queda en la guía del Inicio.
 */
export default function StepIncomeSms({ draft, onChange, onSkip }: StepProps & { onSkip: () => void }) {
    const ctx = useContext(FieldContext);
    const wrapRef = useRef<View>(null);
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    const [text, setText] = useState(draft.incomeSample?.body ?? "");
    const [analysis, setAnalysis] = useState<Analysis | null>(() => analysisFromDraft(draft.incomeSample));
    const [error, setError] = useState<string | null>(null);
    const [canPick, setCanPick] = useState(false);
    const [candidates, setCandidates] = useState<IncomeSmsCandidate[]>([]);
    const [loadingSms, setLoadingSms] = useState(false);

    const confirmed = !!draft.incomeSample?.confirmed && !!analysis && analysis.body === draft.incomeSample.body;

    // «Elegir de mis SMS» solo si es Android, el usuario no apagó los SMS y el permiso YA está concedido
    // (este paso nunca lo pide: el permiso se pide más adelante, en el paso de SMS).
    useEffect(() => {
        if (Platform.OS !== "android" || draft.sms.optOut) { setCanPick(false); return; }
        if (!SmsService.isSmsModuleAvailable()) return;
        void SmsService.hasReadSmsPermission().then(ok => { if (ok && mounted.current) setCanPick(true); });
    }, [draft.sms.optOut, draft.sms.granted]);

    const analyze = (body: string, receivedAt?: number) => {
        setError(null);
        const t = body.trim();
        if (!t) { setError("Pega primero el texto del SMS."); return; }
        const r = learnPatternFromSms(t, receivedAt);
        if (!r.ok) { setAnalysis(null); setError(patternFailText(r.reason)); return; }
        Keyboard.dismiss();
        setCandidates([]);
        setAnalysis({ body: t, pattern: r.pattern, preview: r.preview });
        onChange({ incomeSample: { body: t, confirmed: false } });
    };

    const discard = () => {
        setAnalysis(null);
        setError(null);
        onChange({ incomeSample: undefined });
    };

    const confirm = (p: IncomePattern) => {
        if (!analysis) return;
        const learned = analysis.pattern;
        const changed = (p.originLabel ?? "") !== (learned.originLabel ?? "") || p.amount !== learned.amount;
        setAnalysis({ ...analysis, pattern: p });
        onChange({
            incomeSample: {
                body: analysis.body,
                confirmed: true,
                ...(changed ? { edit: { originText: p.originLabel ?? "", amount: p.amount } } : {}),
            },
        });
    };

    const openPicker = async () => {
        if (loadingSms) return;
        setError(null);
        setLoadingSms(true);
        try {
            const list = await SmsService.listRecentIncomeSms(30);
            if (!mounted.current) return;
            if (list.length === 0) {
                setError("No encontré SMS de depósitos en tu bandeja. Pega el texto del SMS en el cuadro.");
                return;
            }
            setCandidates(list.slice(0, MAX_CANDIDATES));
        } catch {
            if (mounted.current) setError("No pude leer tus SMS. Pega el texto del SMS en el cuadro.");
        } finally {
            if (mounted.current) setLoadingSms(false);
        }
    };

    return (
        <>
            <StepHeader
                icon="chatbubble-ellipses-outline"
                title="El SMS de tu pago"
                subtitle="Pega el SMS con el que te llega tu pago (sueldo, quincena, ventas…). La app aprende de qué banco y cuenta llega, quién lo envía y cuánto, y así reconoce tu pago sola."
            />

            {confirmed && analysis ? (
                <GlassCard radius={16} blur={false} leftAccentColor={C.success} contentStyle={ps.cardContent}>
                    <View style={s.okHead}>
                        <Ionicons name="checkmark-circle-outline" size={16} color={C.success} />
                        <Text style={s.okTitle}>La app ya sabe cómo llega tu pago</Text>
                    </View>
                    <Text style={s.okTxt}>{patternSummary(analysis.pattern, analysis.preview.currency)}</Text>
                    <GlassButton
                        kind="secondary"
                        icon="swap-horizontal-outline"
                        label="Cambiar SMS de ejemplo"
                        onPress={() => { setText(""); discard(); }}
                        style={{ marginTop: 12 }}
                    />
                </GlassCard>
            ) : analysis ? (
                <IncomePatternPreview
                    pattern={analysis.pattern}
                    preview={analysis.preview}
                    onConfirm={confirm}
                    onDiscard={() => { setText(""); discard(); }}
                />
            ) : (
                <>
                    <View ref={wrapRef} collapsable={false}>
                        <TextInput
                            style={s.input}
                            value={text}
                            onChangeText={v => { setText(v); setError(null); }}
                            placeholder="Pega aquí el texto del SMS…"
                            placeholderTextColor={C.textMuted}
                            multiline
                            textAlignVertical="top"
                            autoCorrect={false}
                            accessibilityLabel="Texto del SMS de tu pago"
                            onFocus={() => ctx.onFocusField(wrapRef.current)}
                            onBlur={ctx.onBlurField}
                        />
                    </View>

                    {!!error && <InlineNotice variant="error" text={error} style={ps.notice} />}

                    <View style={s.actions}>
                        <GlassButton
                            kind="primary"
                            icon="scan-outline"
                            label="Analizar SMS"
                            disabled={!text.trim()}
                            onPress={() => analyze(text)}
                        />
                        {canPick && (
                            <GlassButton
                                kind="secondary"
                                icon="chatbubble-ellipses-outline"
                                label="Elegir de mis SMS"
                                loading={loadingSms}
                                onPress={() => { void openPicker(); }}
                            />
                        )}
                    </View>

                    {candidates.length > 0 && (
                        <>
                            <Text style={ps.hint}>Estos son tus últimos depósitos. Toca el de tu pago más reciente.</Text>
                            <View style={{ height: 8 }} />
                            {candidates.map((c, i) => (
                                <TouchableOpacity
                                    key={`${c.receivedAt}_${i}`}
                                    activeOpacity={0.8}
                                    onPress={() => { setText(c.body); analyze(c.body, c.receivedAt); }}
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
                        </>
                    )}

                    <Text style={ps.hint}>
                        No guardamos ningún número de cuenta. Si no lo tienes a mano, puedes hacerlo después: te queda en Inicio, en «Guía y primeros pasos».
                    </Text>
                    <GlassButton
                        kind="ghost"
                        label="Lo hago después"
                        onPress={onSkip}
                        style={{ marginTop: 6 }}
                    />
                </>
            )}
        </>
    );
}

const s = StyleSheet.create({
    input: { backgroundColor: C.glassInput, borderRadius: 14, borderWidth: 1.5, borderColor: C.glassActiveBorder, padding: 14, color: C.text, fontSize: 15, minHeight: 110, marginTop: 4 },
    actions: { gap: 8, marginTop: 12 },
    okHead: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 6 },
    okTitle: { color: C.text, fontSize: 13, fontWeight: "800", flexShrink: 1 },
    okTxt: { color: C.textPrimary, fontSize: 14, fontWeight: "700", lineHeight: 20 },
    pickCard: { marginBottom: 10 },
    pickContent: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14 },
    pickTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
    pickSub: { color: C.textSub, fontSize: 12, marginTop: 2 },
});
