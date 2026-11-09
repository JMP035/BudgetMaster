// Muestra compartible de SMS para mejorar la lectura (puro: sin storage ni UI).
import { classifyBankSms, maskSmsForDiagnostics } from "./BankSmsParser";
import type { SmsInboxItem, Transaction } from "./storage";

export interface SmsSampleOptions {
    /** Máximo de ejemplos por grupo banco|tipo|categoría. */
    perGroup: number;
    /** Máximo de líneas de datos (sin contar la cabecera). */
    maxLines: number;
}

const UNCLASSIFIED = "sin_clasificar";
const MAX_UNCLASSIFIED = 20;
const HEADER = "BudgetMaster - muestra de SMS (números ocultos)\nformato: banco | tipo | motivo | categoría | texto";

interface Row {
    group: string;
    ts: number;
    line: string;
}

const clean = (body: string) => maskSmsForDiagnostics(body).replace(/\s+/g, " ").trim();
const tsOf = (v: number | string | undefined) => {
    const n = typeof v === "number" ? v : v ? Date.parse(v) : NaN;
    return isNaN(n) ? 0 : n;
};

export function buildSmsSampleReport(
    txs: Transaction[],
    inbox: SmsInboxItem[],
    opts: SmsSampleOptions = { perGroup: 4, maxLines: 150 },
): { text: string; count: number } {
    // 1. Sin clasificar (buzón), lo más reciente primero.
    const inboxRows: Row[] = inbox
        .filter((i) => !!i.body)
        .map((i) => ({
            group: UNCLASSIFIED,
            ts: tsOf(i.receivedAt ?? i.occurredAt),
            line: [i.bank || "Banco", UNCLASSIFIED, i.reason || "-", "-", clean(i.body)].join(" | "),
        }))
        .sort((a, b) => b.ts - a.ts)
        .slice(0, MAX_UNCLASSIFIED);

    // 2. Movimientos importados por SMS, agrupados por banco|tipo|categoría.
    const groups = new Map<string, Row[]>();
    for (const tx of txs) {
        if (tx.source !== "sms" || !tx.originalSMS) continue;
        const ts = tsOf(tx.date);
        let bank = tx.bank || "Banco";
        let kind = "unparsed";
        let reason = "-";
        try {
            const c = classifyBankSms({ body: tx.originalSMS, receivedAt: ts || undefined });
            bank = c.bank || bank;
            kind = c.kind;
            reason = c.reason || "-";
        } catch {
            // Si el motor falla con este SMS, se informa como no leído.
        }
        const key = `${bank}|${kind}|${tx.category}`;
        const row: Row = {
            group: key,
            ts,
            line: [bank, kind, reason, tx.category, clean(tx.originalSMS)].join(" | "),
        };
        const list = groups.get(key);
        if (list) list.push(row); else groups.set(key, [row]);
    }

    const perGroup = Math.max(1, opts.perGroup);
    const picked: Row[][] = [];
    groups.forEach((rows) => {
        rows.sort((a, b) => b.ts - a.ts);
        picked.push(rows.slice(0, perGroup));
    });
    // Grupos con actividad más reciente primero.
    picked.sort((a, b) => b[0].ts - a[0].ts);

    const lines = [...inboxRows, ...picked.flat()]
        .slice(0, Math.max(0, opts.maxLines))
        .map((r) => r.line);

    return { text: [HEADER, ...lines].join("\n"), count: lines.length };
}
