import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { GlassDialog, GlassDialogProps, GlassDialogVariant } from "./GlassDialog";

type IoniconName = keyof typeof Ionicons.glyphMap;

export type DialogAction = {
    label: string;
    value: string;
    kind?: "primary" | "secondary" | "destructive";
    icon?: IoniconName;
};

export type DialogOptions = Omit<GlassDialogProps, "visible" | "onClose" | "actions"> & {
    actions?: DialogAction[];
};

export interface AlertOptions extends Omit<DialogOptions, "title" | "message" | "variant"> {
    title: string;
    message?: string;
    variant?: GlassDialogVariant;
}

export interface ConfirmOptions {
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    variant?: GlassDialogVariant;
    icon?: IoniconName;
    steps?: string[];
}

export interface GlassDialogApi {
    /** Resuelve con el `value` de la acción pulsada, o null si se descarta. */
    show: (opts: DialogOptions) => Promise<string | null>;
    alert: (opts: AlertOptions) => Promise<void>;
    confirm: (opts: ConfirmOptions) => Promise<boolean>;
}

interface QueueItem {
    opts: DialogOptions;
    resolve: (value: string | null) => void;
}

const FALLBACK_API: GlassDialogApi = {
    show: async () => {
        console.warn("[GlassDialog] useGlassDialog usado fuera de GlassDialogProvider");
        return null;
    },
    alert: async () => {
        console.warn("[GlassDialog] useGlassDialog usado fuera de GlassDialogProvider");
    },
    confirm: async () => {
        console.warn("[GlassDialog] useGlassDialog usado fuera de GlassDialogProvider");
        return false;
    },
};

const GlassDialogContext = createContext<GlassDialogApi | null>(null);

export function GlassDialogProvider({ children }: { children: React.ReactNode }) {
    const [current, setCurrent] = useState<QueueItem | null>(null);
    const currentRef = useRef<QueueItem | null>(null);
    const queueRef = useRef<QueueItem[]>([]);

    const setActive = useCallback((item: QueueItem | null) => {
        currentRef.current = item;
        setCurrent(item);
    }, []);

    const finish = useCallback(
        (value: string | null) => {
            const item = currentRef.current;
            if (!item) return;
            item.resolve(value);
            const next = queueRef.current.shift() ?? null;
            setActive(next);
        },
        [setActive]
    );

    const show = useCallback(
        (opts: DialogOptions) =>
            new Promise<string | null>((resolve) => {
                const item: QueueItem = { opts, resolve };
                if (currentRef.current) {
                    queueRef.current.push(item);
                } else {
                    setActive(item);
                }
            }),
        [setActive]
    );

    const alert = useCallback(
        async ({ title, message, variant = "info", ...rest }: AlertOptions) => {
            await show({ title, message, variant, ...rest });
        },
        [show]
    );

    const confirm = useCallback(
        async ({
            title,
            message,
            confirmLabel = "Eliminar",
            cancelLabel = "Cancelar",
            destructive = true,
            variant = "warning",
            icon,
            steps,
        }: ConfirmOptions) => {
            const result = await show({
                title,
                message,
                variant,
                icon,
                steps,
                actions: [
                    { label: cancelLabel, value: "cancel", kind: "secondary" },
                    { label: confirmLabel, value: "ok", kind: destructive ? "destructive" : "primary" },
                ],
            });
            return result === "ok";
        },
        [show]
    );

    const api = useMemo<GlassDialogApi>(() => ({ show, alert, confirm }), [show, alert, confirm]);

    const { actions, ...dialogRest } = current?.opts ?? { title: "" };

    return (
        <GlassDialogContext.Provider value={api}>
            {children}
            <GlassDialog
                {...dialogRest}
                visible={!!current}
                onClose={() => finish(null)}
                actions={actions?.map((a) => ({
                    label: a.label,
                    kind: a.kind,
                    icon: a.icon,
                    onPress: () => finish(a.value),
                }))}
            />
        </GlassDialogContext.Provider>
    );
}

export function useGlassDialog(): GlassDialogApi {
    const ctx = useContext(GlassDialogContext);
    return ctx ?? FALLBACK_API;
}

export default GlassDialogProvider;
