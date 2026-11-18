import React, { useCallback, useEffect, useRef, useState } from "react";
import { AppState, Linking, Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { SmsService } from "../../services/SmsService";
import type { SmsPermissionDetail } from "../../services/SmsService";
import { smsPermissionHelp } from "../../services/SmsPermissionHelp";
import { C } from "../../theme";
import { GlassButton } from "../GlassButton";
import { GlassCard } from "../GlassCard";
import { InlineNotice } from "../InlineNotice";
import { ps, StepHeader, StepProps, ToggleRow } from "./OnbPrimitives";

type PermState =
    | { kind: "idle" }
    | { kind: "granted" }
    | { kind: "denied" }
    | { kind: "blocked"; detail: SmsPermissionDetail }
    | { kind: "unavailable" };

/**
 * SMS (solo Android; en iOS el paso no existe). Pide el permiso con SmsService y reproduce los casos
 * del Dashboard: concedido, denegado, «no volver a preguntar» / configuración restringida y módulo ausente.
 */
export default function StepSms({ draft, onChange, onCreateAccounts }: StepProps & { onCreateAccounts: () => void }) {
    const [perm, setPerm] = useState<PermState>(draft.sms.granted ? { kind: "granted" } : { kind: "idle" });
    const [busy, setBusy] = useState(false);
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    const noAccounts = draft.accounts.length === 0;

    /** Marca el permiso como concedido; el valor inicial de «importar» solo se decide la primera vez. */
    const markGranted = useCallback(() => {
        setPerm({ kind: "granted" });
        onChange(d => (d.sms.granted
            ? {}
            : { sms: { ...d.sms, granted: true, importAfter: d.accounts.length > 0 && !d.sms.optOut } }));
    }, [onChange]);

    // Al montar: si el módulo no existe (Expo Go) se avisa; si el permiso ya estaba concedido, se refleja.
    useEffect(() => {
        if (Platform.OS !== "android") return;
        if (!SmsService.isSmsModuleAvailable()) { setPerm({ kind: "unavailable" }); return; }
        void SmsService.hasReadSmsPermission().then(ok => { if (ok && mounted.current) markGranted(); });
    }, [markGranted]);

    // Si el usuario fue a Ajustes del sistema a darlo, al volver se revisa sin pedirlo otra vez.
    useEffect(() => {
        if (perm.kind !== "blocked" && perm.kind !== "denied") return;
        const sub = AppState.addEventListener("change", st => {
            if (st !== "active") return;
            void SmsService.hasReadSmsPermission().then(ok => { if (ok && mounted.current) markGranted(); });
        });
        return () => sub.remove();
    }, [perm.kind, markGranted]);

    const request = async () => {
        if (busy) return;
        setBusy(true);
        try {
            const res = await SmsService.requestReadSmsPermissionDetailed();
            if (!mounted.current) return;
            if (res.status === "granted") markGranted();
            else if (res.status === "never_ask_again") setPerm({ kind: "blocked", detail: res });
            else if (res.status === "unavailable") setPerm({ kind: "unavailable" });
            else setPerm({ kind: "denied" });
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    const openSettings = () => { Linking.openSettings().catch(() => { }); };

    const setOptOut = (optOut: boolean) => onChange(d => ({
        sms: { ...d.sms, optOut, importAfter: optOut ? false : d.sms.importAfter },
    }));

    const help = perm.kind === "blocked" ? smsPermissionHelp(perm.detail) : null;

    return (
        <>
            <StepHeader
                icon="chatbubble-ellipses-outline"
                title="SMS de tu banco"
                subtitle="BudgetMaster puede leer los SMS de tu banco para registrar compras, débitos y abonos solo. Es opcional, se procesa en tu teléfono y solo mira mensajes de bancos. Puedes apagarlo cuando quieras en Ajustes."
            />

            {draft.sms.optOut ? (
                <>
                    <InlineNotice variant="info" text="Dejamos los SMS apagados. Los puedes activar cuando quieras en Ajustes." />
                    <TouchableOpacity
                        onPress={() => setOptOut(false)}
                        accessibilityRole="button"
                        style={s.linkBtn}
                    >
                        <Text style={ps.link}>Mejor sí quiero usarlos</Text>
                    </TouchableOpacity>
                </>
            ) : (
                <>
                    {perm.kind === "unavailable" && (
                        <InlineNotice
                            variant="warning"
                            icon="construct-outline"
                            text="Esta versión de la app no incluye el lector de SMS (por ejemplo, en Expo Go). Instala la app compilada (APK) para usar la sincronización."
                        />
                    )}

                    {perm.kind === "granted" && (
                        <InlineNotice variant="success" text="Listo: BudgetMaster ya puede leer los SMS de tu banco." />
                    )}

                    {perm.kind === "denied" && (
                        <>
                            <InlineNotice
                                variant="warning"
                                icon="chatbubble-ellipses-outline"
                                text="Sin este permiso BudgetMaster no puede detectar tus movimientos bancarios. Todo se procesa en tu teléfono y solo se leen mensajes de bancos."
                                actionLabel="Reintentar"
                                onAction={() => { void request(); }}
                            />
                            <Text style={ps.hint}>También puedes pegar un SMS en Agregar → Leer SMS.</Text>
                            <GlassButton
                                label="Abrir ajustes"
                                icon="settings-outline"
                                kind="secondary"
                                onPress={openSettings}
                                style={{ marginTop: 10 }}
                            />
                        </>
                    )}

                    {perm.kind === "blocked" && help && (
                        <>
                            <InlineNotice variant="warning" icon="lock-closed-outline" text={help.message} />
                            <GlassCard radius={14} blur={false} style={{ marginTop: 10 }} contentStyle={ps.cardContent}>
                                {help.steps.map((st, idx) => (
                                    <View key={idx} style={s.stepRow}>
                                        <Text style={s.stepNum}>{idx + 1}</Text>
                                        <Text style={s.stepTxt}>{st}</Text>
                                    </View>
                                ))}
                                {!!help.footnote && <Text style={[ps.hint, { marginTop: 4 }]}>{help.footnote}</Text>}
                            </GlassCard>
                            <GlassButton
                                label="Abrir ajustes"
                                icon="settings-outline"
                                onPress={openSettings}
                                style={{ marginTop: 12 }}
                            />
                        </>
                    )}

                    {perm.kind === "idle" && (
                        <GlassButton
                            label="Dar permiso de SMS"
                            icon="shield-checkmark-outline"
                            onPress={() => { void request(); }}
                            loading={busy}
                            style={{ marginTop: 4 }}
                        />
                    )}

                    {perm.kind !== "unavailable" && (
                        <>
                            <ToggleRow
                                label="Sincronizar al abrir la app"
                                description="Revisa los mensajes nuevos cada vez que abres BudgetMaster."
                                value={draft.sms.autoSync}
                                onValueChange={autoSync => onChange(d => ({ sms: { ...d.sms, autoSync } }))}
                            />
                            {perm.kind === "granted" && (
                                <ToggleRow
                                    label="Importar mis movimientos de los últimos 3 meses al terminar"
                                    value={draft.sms.importAfter}
                                    onValueChange={importAfter => onChange(d => ({ sms: { ...d.sms, importAfter } }))}
                                />
                            )}
                        </>
                    )}

                    {noAccounts && (
                        <InlineNotice
                            variant="warning"
                            style={ps.notice}
                            text={'Sin cuentas, los movimientos quedan "sin cuenta" y los asignas después'}
                            actionLabel="Crear cuentas"
                            onAction={onCreateAccounts}
                        />
                    )}

                    <TouchableOpacity
                        onPress={() => setOptOut(true)}
                        accessibilityRole="button"
                        style={s.linkBtn}
                    >
                        <Text style={s.skipLink}>No quiero usar SMS</Text>
                    </TouchableOpacity>
                </>
            )}
        </>
    );
}

const s = StyleSheet.create({
    linkBtn: { minHeight: 44, justifyContent: "center", alignItems: "center", marginTop: 8 },
    skipLink: { color: C.textSub, fontSize: 14, fontWeight: "700", textDecorationLine: "underline" },
    stepRow: { flexDirection: "row", gap: 10, marginBottom: 8 },
    stepNum: { color: C.primaryLight, fontSize: 13, fontWeight: "900", width: 18 },
    stepTxt: { color: C.text, fontSize: 13, lineHeight: 19, flex: 1, flexShrink: 1 },
});
