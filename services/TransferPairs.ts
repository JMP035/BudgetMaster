// Módulo PURO (sin react-native ni AsyncStorage): detecta pares "transferencia enviada" +
// "transferencia recibida" entre cuentas propias de BANCOS DISTINTOS, para marcarlos como
// neutros (type 'transfer'). Solo se PROPONEN; el único caso `auto` es cuando el destino de la
// salida se reconoce como una cuenta del usuario por sus vínculos SMS. De ./storage solo
// `import type` (la circularidad con storage.ts se evita así). Regex sin lookbehind.
//
// Criterios obligatorios: ambos source 'sms'; salida = type 'expense' con category 'transfer'
// (las comisiones 'bank_fees' quedan fuera); entrada = type 'income' con category 'transfer_in';
// misma moneda; monto igual (+-0.005); bancos distintos; |fecha salida - fecha entrada| <= 36 h;
// sin transferPairId previo; par no ignorado.
// Puntaje (0-100): base 50 + cercanía (<=15 min 35; <=2 h 25; <=12 h 15; resto 5) + 15 si el
// destino de la salida es una cuenta del usuario. Ambiguo (2+ posibles en algún lado): -20 y sin auto.
import type { Account, Transaction } from './storage';
import { extractSmsLinkSignals } from './AccountLinking';

export interface TransferPair {
    outId: string;
    inId: string;
    score: number;
    /** true solo cuando el destino es una cuenta del usuario reconocida por sus vínculos SMS */
    auto: boolean;
    reasons: string[];
}

const AMOUNT_EPS = 0.005;
const WINDOW_MS = 36 * 60 * 60 * 1000;
const MIN_MS = 60 * 1000;
const HOUR_MS = 60 * MIN_MS;
const AMBIGUOUS_PENALTY = 20;
const DEST_ACCOUNT_BONUS = 15;
const PAIR_ID_PREFIX = 'tp_';

export function transferPairKey(outId: string, inId: string): string {
    return `tp|${outId}|${inId}`;
}

/** Id estable del par compartido por ambos movimientos. */
export function transferPairIdFor(outId: string): string {
    return `${PAIR_ID_PREFIX}${outId}`;
}

function isOutgoing(t: Transaction): boolean {
    return t.source === 'sms' && t.type === 'expense' && t.category === 'transfer' && !t.transferPairId;
}

function isIncoming(t: Transaction): boolean {
    return t.source === 'sms' && t.type === 'income' && t.category === 'transfer_in' && !t.transferPairId;
}

function bankOf(t: Transaction): string {
    return (t.bank ?? '').trim().toUpperCase();
}

function timeOf(t: Transaction): number {
    return Date.parse(t.date);
}

function centsOf(amount: number): number {
    return Math.round(amount * 100);
}

function closenessPoints(diffMs: number): { pts: number; label: string } {
    if (diffMs <= 15 * MIN_MS) return { pts: 35, label: 'en menos de 15 minutos' };
    if (diffMs <= 2 * HOUR_MS) return { pts: 25, label: 'en menos de 2 horas' };
    if (diffMs <= 12 * HOUR_MS) return { pts: 15, label: 'en el mismo día' };
    return { pts: 5, label: 'en menos de 36 horas' };
}

/**
 * ¿El texto de la salida menciona una cuenta/tarjeta del usuario del banco de la entrada?
 * Compara las señales acct/card/acctpre del SMS (con el banco de la entrada) contra las claves
 * smsLinks de las cuentas activas. Devuelve el id de la cuenta o null.
 */
function recognizedDestination(out: Transaction, inBank: string, accounts: Account[] | undefined): string | null {
    if (!accounts || accounts.length === 0 || !out.originalSMS || !inBank) return null;
    const signals = extractSmsLinkSignals(out.originalSMS, inBank)
        .filter(s => s.kind === 'acct' || s.kind === 'card' || s.kind === 'acctpre');
    if (signals.length === 0) return null;
    for (const acc of accounts) {
        if (!acc.isActive) continue;
        const links = acc.smsLinks ?? [];
        for (const s of signals) {
            if (s.bank.toUpperCase() === inBank && links.includes(s.key)) return acc.id;
        }
    }
    return null;
}

interface Cand {
    out: Transaction; inn: Transaction; raw: number; diff: number; order: number;
    reasons: string[]; dest: boolean;
}

/**
 * Pares salida/entrada entre cuentas propias de bancos distintos. Un movimiento va en un solo par
 * (se asigna desde el puntaje más alto). Con onlyIds solo se evalúan pares donde alguno de los dos
 * esté en el conjunto (índice por monto: costo bajo).
 */
export function findTransferPairs(
    txs: Transaction[],
    ignored: Set<string>,
    opts?: { onlyIds?: Set<string>; accounts?: Account[] },
): TransferPair[] {
    const onlyIds = opts?.onlyIds;
    const accounts = opts?.accounts;

    const outs: Transaction[] = [];
    const ins: Transaction[] = [];
    const outByCents = new Map<number, Transaction[]>();
    const inByCents = new Map<number, Transaction[]>();
    const push = (m: Map<number, Transaction[]>, c: number, t: Transaction): void => {
        const b = m.get(c);
        if (b) b.push(t); else m.set(c, [t]);
    };
    for (const t of txs) {
        if (isNaN(timeOf(t))) continue;
        if (isOutgoing(t)) { outs.push(t); push(outByCents, centsOf(t.amount), t); }
        else if (isIncoming(t)) { ins.push(t); push(inByCents, centsOf(t.amount), t); }
    }
    if (outs.length === 0 || ins.length === 0) return [];

    /** Contrapartes válidas de un movimiento (mismo monto, moneda, bancos distintos, ventana, no ignorado). */
    const counterparts = (t: Transaction, tIsOut: boolean): Transaction[] => {
        const index = tIsOut ? inByCents : outByCents;
        const c = centsOf(t.amount);
        const res: Transaction[] = [];
        for (const k of [c, c - 1, c + 1]) {
            const bucket = index.get(k);
            if (!bucket) continue;
            for (const o of bucket) {
                if (o.currency !== t.currency) continue;
                if (Math.abs(o.amount - t.amount) > AMOUNT_EPS) continue;
                const bt = bankOf(t);
                const bo = bankOf(o);
                if (!bt || !bo || bt === bo) continue;
                if (Math.abs(timeOf(o) - timeOf(t)) > WINDOW_MS) continue;
                const key = tIsOut ? transferPairKey(t.id, o.id) : transferPairKey(o.id, t.id);
                if (ignored.has(key)) continue;
                res.push(o);
            }
        }
        return res;
    };

    const countCache = new Map<string, number>();
    const countOf = (t: Transaction, tIsOut: boolean): number => {
        const key = (tIsOut ? 'o:' : 'i:') + t.id;
        let n = countCache.get(key);
        if (n === undefined) { n = counterparts(t, tIsOut).length; countCache.set(key, n); }
        return n;
    };

    // Los "conductores": todas las salidas, o solo las salidas/entradas del conjunto onlyIds.
    const seen = new Set<string>();
    const cands: Cand[] = [];
    let order = 0;
    const consider = (out: Transaction, inn: Transaction): void => {
        const key = transferPairKey(out.id, inn.id);
        if (seen.has(key)) return;
        seen.add(key);
        const diff = Math.abs(timeOf(out) - timeOf(inn));
        const close = closenessPoints(diff);
        const reasons = ['mismo monto', `bancos distintos (${bankOf(out)} → ${bankOf(inn)})`, close.label];
        let raw = 50 + close.pts;
        const dest = recognizedDestination(out, bankOf(inn), accounts) !== null;
        if (dest) { raw += DEST_ACCOUNT_BONUS; reasons.push('el destino es una cuenta tuya'); }
        cands.push({ out, inn, raw: Math.min(100, raw), diff, order: order++, reasons, dest });
    };
    for (const out of outs) {
        if (onlyIds && !onlyIds.has(out.id)) continue;
        for (const inn of counterparts(out, true)) consider(out, inn);
    }
    if (onlyIds) {
        for (const inn of ins) {
            if (!onlyIds.has(inn.id)) continue;
            for (const out of counterparts(inn, false)) consider(out, inn);
        }
    }

    cands.sort((a, b) => b.raw - a.raw || a.diff - b.diff || a.order - b.order);
    const usedOut = new Set<string>();
    const usedIn = new Set<string>();
    const result: TransferPair[] = [];
    for (const c of cands) {
        if (usedOut.has(c.out.id) || usedIn.has(c.inn.id)) continue;
        usedOut.add(c.out.id);
        usedIn.add(c.inn.id);
        const ambiguous = countOf(c.out, true) > 1 || countOf(c.inn, false) > 1;
        const reasons = c.reasons.slice();
        let score = c.raw;
        if (ambiguous) {
            score = Math.max(0, score - AMBIGUOUS_PENALTY);
            reasons.push('ambiguo: hay más de una coincidencia posible');
        }
        result.push({ outId: c.out.id, inId: c.inn.id, score, auto: c.dest && !ambiguous, reasons });
    }
    return result.sort((a, b) => b.score - a.score);
}

// ─────────────────────────────────────────────────────────────
// Aplicar / revertir el par sobre un arreglo (puro; storage lo usa con una lectura y una escritura)
// ─────────────────────────────────────────────────────────────

/**
 * Marca ambos movimientos como neutros (type 'transfer', category 'transfer'), guarda el estado
 * previo en transferPrev y les pone el mismo transferPairId. No mueve saldos. Si falta alguno,
 * son el mismo o alguno ya está emparejado, devuelve el mismo arreglo sin cambios.
 */
export function applyTransferPair(txs: Transaction[], outId: string, inId: string): Transaction[] {
    if (outId === inId) return txs;
    const out = txs.find(t => t.id === outId);
    const inn = txs.find(t => t.id === inId);
    if (!out || !inn || out.transferPairId || inn.transferPairId) return txs;
    const pairId = transferPairIdFor(outId);
    return txs.map(t => {
        if (t.id !== outId && t.id !== inId) return t;
        const prevType = t.type;
        return {
            ...t,
            type: 'transfer' as const,
            category: 'transfer',
            transferPrev: { type: prevType, category: t.category },
            transferPairId: pairId,
        };
    });
}

/**
 * Revierte el par al que pertenece txId (o la mitad huérfana que aún guarda transferPrev):
 * restaura type/category desde transferPrev y quita transferPairId/transferPrev.
 * Si txId no está emparejado devuelve el mismo arreglo.
 */
export function revertTransferPair(txs: Transaction[], txId: string): Transaction[] {
    const target = txs.find(t => t.id === txId);
    if (!target || (!target.transferPairId && !target.transferPrev)) return txs;
    const pairId = target.transferPairId;
    return txs.map(t => {
        const inPair = t.id === txId || (!!pairId && t.transferPairId === pairId);
        if (!inPair || (!t.transferPairId && !t.transferPrev)) return t;
        const copy: Transaction = { ...t };
        if (t.transferPrev) {
            copy.type = t.transferPrev.type;
            copy.category = t.transferPrev.category;
        }
        delete copy.transferPairId;
        delete copy.transferPrev;
        return copy;
    });
}

/** Al borrar un movimiento emparejado: el compañero queda neutro pero pierde el transferPairId. */
export function clearPairIdOfPartner(txs: Transaction[], pairId: string): Transaction[] {
    return txs.map(t => {
        if (t.transferPairId !== pairId) return t;
        const copy: Transaction = { ...t };
        delete copy.transferPairId;
        return copy;
    });
}
