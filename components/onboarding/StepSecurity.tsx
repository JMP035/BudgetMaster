import * as LocalAuthentication from "expo-local-authentication";
import React, { useEffect, useRef, useState } from "react";
import { GlassButton } from "../GlassButton";
import { InlineNotice } from "../InlineNotice";
import { ps, StepHeader, StepProps } from "./OnbPrimitives";

/** Seguridad (solo si el equipo tiene huella o rostro registrados). */
export default function StepSecurity({ draft, onChange }: StepProps) {
    const [busy, setBusy] = useState(false);
    const [cancelled, setCancelled] = useState(false);
    const mounted = useRef(true);
    useEffect(() => () => { mounted.current = false; }, []);

    const activate = async () => {
        if (busy) return;
        setBusy(true);
        setCancelled(false);
        try {
            const res = await LocalAuthentication.authenticateAsync({ promptMessage: "Confirmá para activar el bloqueo" });
            if (!mounted.current) return;
            if (res.success) onChange({ biometricEnabled: true });
            else setCancelled(true);
        } catch {
            if (mounted.current) setCancelled(true);
        } finally {
            if (mounted.current) setBusy(false);
        }
    };

    return (
        <>
            <StepHeader
                icon="finger-print-outline"
                title="Seguridad"
                subtitle="Protegé tu información con huella o rostro al abrir la app."
            />

            {draft.biometricEnabled ? (
                <>
                    <InlineNotice variant="success" text="Bloqueo activado. Te lo vamos a pedir al abrir la app." />
                    <GlassButton
                        label="Desactivar"
                        kind="secondary"
                        onPress={() => onChange({ biometricEnabled: false })}
                        style={{ marginTop: 12 }}
                    />
                </>
            ) : (
                <>
                    <GlassButton
                        label="Activar"
                        icon="lock-closed-outline"
                        onPress={() => { void activate(); }}
                        loading={busy}
                    />
                    {cancelled && (
                        <InlineNotice variant="info" style={ps.notice} text="No se activó; podés hacerlo en Ajustes" />
                    )}
                </>
            )}
        </>
    );
}
