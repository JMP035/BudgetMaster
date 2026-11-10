import { useCallback, useEffect, useState } from "react";
import { SmsBatchRecord, StorageService } from "../services/storage";
import { useGlassDialog } from "./GlassDialogProvider";

function fmtWhen(iso: string): string {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return "la última vez";
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const mi = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} a las ${hh}:${mi}`;
}

/**
 * Flujo único de "Deshacer última sincronización" (Inicio y Ajustes). Solo se puede deshacer el
 * último lote (7 días o menos); lo editado por el usuario se conserva salvo que elija incluirlo.
 */
export function useUndoLastSync(onChanged?: () => void) {
    const dialog = useGlassDialog();
    const [batch, setBatch] = useState<SmsBatchRecord | null>(null);

    const reload = useCallback(async () => {
        try { setBatch(await StorageService.getLastSmsBatch()); } catch { setBatch(null); }
    }, []);

    useEffect(() => { void reload(); }, [reload]);

    const requestUndo = useCallback(async () => {
        const last = await StorageService.getLastSmsBatch();
        const preview = last ? await StorageService.previewUndoSmsBatch(last.id) : null;
        if (!last || !preview) {
            await dialog.alert({
                variant: "info",
                icon: "arrow-undo-outline",
                title: "Nada para deshacer",
                message: "Solo se puede deshacer la última sincronización, y hasta 7 días después de hacerla.",
            });
            await reload();
            return;
        }
        const total = preview.txCount + preview.installmentCount;
        if (total === 0 && preview.fixedCount === 0 && preview.editedCount === 0) {
            await dialog.alert({ variant: "info", title: "Nada para deshacer", message: "Esa sincronización no importó nada." });
            return;
        }
        const parts: string[] = [];
        if (preview.txCount > 0) parts.push(`${preview.txCount} movimiento${preview.txCount === 1 ? "" : "s"}`);
        if (preview.installmentCount > 0) parts.push(`${preview.installmentCount} visacuota${preview.installmentCount === 1 ? "" : "s"}`);
        if (preview.fixedCount > 0) parts.push(`${preview.fixedCount} gasto${preview.fixedCount === 1 ? "" : "s"} fijo${preview.fixedCount === 1 ? "" : "s"} marcado${preview.fixedCount === 1 ? "" : "s"} solo${preview.fixedCount === 1 ? "" : "s"}`);
        const ok = await dialog.confirm({
            variant: "warning",
            icon: "arrow-undo-outline",
            title: "Deshacer última sincronización",
            message: `Se quitará lo importado el ${fmtWhen(last.at)}: ${parts.join(", ") || "nada"}. No volverá a aparecer en próximas sincronizaciones.${preview.editedCount > 0 ? ` ${preview.editedCount} que editaste se conservan.` : ""}`,
            confirmLabel: "Deshacer",
        });
        if (!ok) return;
        let includeEdited = false;
        if (preview.editedCount > 0) {
            includeEdited = await dialog.confirm({
                variant: "info",
                title: "Lo que editaste",
                message: `${preview.editedCount} de esos movimientos los editaste después de importarlos. ¿Quitarlos también?`,
                confirmLabel: "Quitarlos también",
                cancelLabel: "Conservarlos",
                destructive: false,
            });
        }
        try {
            const r = await StorageService.undoSmsBatch(last.id, { includeEdited });
            await dialog.alert({
                variant: "success",
                title: "Sincronización deshecha",
                message: `Se quitaron ${r.removedTx} movimiento${r.removedTx === 1 ? "" : "s"} y ${r.removedInst} visacuota${r.removedInst === 1 ? "" : "s"}.${r.keptEdited > 0 ? ` Se conservaron ${r.keptEdited} que editaste.` : ""}`,
            });
        } catch (e) {
            await dialog.alert({ variant: "error", title: "No se pudo deshacer", message: "Intentá de nuevo." });
            console.warn("[useUndoLastSync]", e);
        }
        await reload();
        onChanged?.();
    }, [dialog, onChanged, reload]);

    return { batch, canUndo: batch !== null, reload, requestUndo };
}
