// Duplicados manual/SMS (módulo PURO, decisión D5). Solo se proponen; nunca se borra
// nada automático. Sin react-native ni AsyncStorage: de ./storage solo `import type`.
//
// Criterios obligatorios: uno manual y otro sms, mismo type, misma moneda, mismo monto
// (+-0.005), día local con diferencia <= 1, ninguno ya unido (mergedFrom) y par no ignorado.
// Puntaje: base 40; +40 mismo día / +20 un día; +15 palabras de la descripción manual
// coinciden con el comercio; +5 misma categoría. Se propone con >= 60.
import type { Transaction } from './storage';
import { formatLocalDay } from './BankSmsParser';
import { flatText } from './Categorizer';
import { merchantOfTransaction } from './MerchantRules';
import { fixedIdFromFeTxId } from './FixedCycle';

export interface DupPair { manualId: string; smsId: string; score: number; ambiguous: boolean; reasons: string[]; }

const DUP_PROPOSE_THRESHOLD = 60;
const AMOUNT_EPS = 0.005;

/** Clave estable de un par: `${manualId}|${smsId}`. */
export function dupPairKey(manualId: string, smsId: string): string {
  return `${manualId}|${smsId}`;
}

/**
 * Día local (YYYY-MM-DD) de un movimiento. Un valor solo-fecha (o medianoche UTC, como lo
 * guardan algunas pantallas) ya ES el día; el resto se convierte a día local. Misma regla que
 * storedDateToDateOnly (storage.ts), copiada aquí para no importar AsyncStorage.
 */
function dayOf(tx: Transaction): string {
  if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(tx.date)) return tx.date.slice(0, 10);
  const d = new Date(tx.date);
  return isNaN(d.getTime()) ? '' : formatLocalDay(d);
}

/** Número de día (días desde epoch, sin horas) para comparar días calendario sin usar milisegundos de la hora. */
function dayNumber(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86400000);
}

function shiftDay(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + delta));
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}

function wordsOf(text: string): string[] {
  return flatText(text).replace(/[^a-z0-9 ]/g, ' ').split(' ').filter(w => w.length >= 4);
}

function descriptionMatchesMerchant(manual: Transaction, sms: Transaction): boolean {
  const smsText = flatText(`${merchantOfTransaction(sms) ?? ''} ${sms.description ?? ''}`);
  return wordsOf(manual.description ?? '').some(w => smsText.includes(w));
}

interface Candidate { manual: Transaction; sms: Transaction; score: number; diff: number; reasons: string[]; order: number; }

/** Pares manual/SMS probables (puntaje >= 60). Con onlySmsIds solo evalúa esos SMS (lote nuevo). */
export function findManualSmsDuplicates(
  txs: Transaction[],
  ignored: Set<string>,
  opts?: { onlySmsIds?: Set<string> },
): DupPair[] {
  const onlyIds = opts?.onlySmsIds;

  // Los fe_tx_* cuentan como manuales; los manuales 'transfer' (entre cuentas propias) se excluyen.
  const manualsByDay = new Map<string, Transaction[]>();
  const smsList: Transaction[] = [];
  for (const t of txs) {
    if (t.mergedFrom) continue;
    if (t.source === 'manual') {
      if (t.type === 'transfer') continue;
      const day = dayOf(t);
      if (!day) continue;
      const bucket = manualsByDay.get(day);
      if (bucket) bucket.push(t); else manualsByDay.set(day, [t]);
    } else if (t.source === 'sms' && t.type !== 'transfer') {
      if (onlyIds && !onlyIds.has(t.id)) continue;
      smsList.push(t);
    }
  }

  const cands: Candidate[] = [];
  let order = 0;
  for (const sms of smsList) {
    const smsDay = dayOf(sms);
    if (!smsDay) continue;
    for (const delta of [0, -1, 1]) {
      const bucket = manualsByDay.get(shiftDay(smsDay, delta));
      if (!bucket) continue;
      for (const manual of bucket) {
        if (manual.type !== sms.type || manual.currency !== sms.currency) continue;
        if (Math.abs(manual.amount - sms.amount) > AMOUNT_EPS) continue;
        if (ignored.has(dupPairKey(manual.id, sms.id))) continue;
        const diff = Math.abs(dayNumber(dayOf(manual)) - dayNumber(smsDay));
        if (diff > 1) continue;

        let score = 40 + (diff === 0 ? 40 : 20);
        const reasons = [diff === 0 ? 'mismo día' : 'un día de diferencia', 'mismo monto'];
        if (descriptionMatchesMerchant(manual, sms)) { score += 15; reasons.push('descripción coincide con el comercio'); }
        if (manual.category === sms.category) { score += 5; reasons.push('misma categoría'); }
        if (score >= DUP_PROPOSE_THRESHOLD) cands.push({ manual, sms, score, diff, reasons, order: order++ });
      }
    }
  }

  // Cuántos candidatos tiene cada lado (para etiquetar "posible" cuando hay más de uno).
  const perSms = new Map<string, number>();
  const perManual = new Map<string, number>();
  for (const c of cands) {
    perSms.set(c.sms.id, (perSms.get(c.sms.id) ?? 0) + 1);
    perManual.set(c.manual.id, (perManual.get(c.manual.id) ?? 0) + 1);
  }

  // Un movimiento en un solo par: se asigna desde el puntaje más alto.
  cands.sort((a, b) => b.score - a.score || a.diff - b.diff || a.order - b.order);
  const usedManual = new Set<string>();
  const usedSms = new Set<string>();
  const out: DupPair[] = [];
  for (const c of cands) {
    if (usedManual.has(c.manual.id) || usedSms.has(c.sms.id)) continue;
    usedManual.add(c.manual.id);
    usedSms.add(c.sms.id);
    out.push({
      manualId: c.manual.id,
      smsId: c.sms.id,
      score: c.score,
      ambiguous: (perSms.get(c.sms.id) ?? 0) > 1 || (perManual.get(c.manual.id) ?? 0) > 1,
      reasons: c.reasons,
    });
  }
  return out;
}

/** Sobrevive el SMS; del manual se conservan descripción y categoría. Guarda mergedFrom para separar. */
export function mergeManualIntoSms(manual: Transaction, sms: Transaction, nowIso: string): Transaction {
  const merged: Transaction = { ...sms };

  merged.mergedFrom = {
    id: manual.id,
    description: manual.description,
    category: manual.category,
    date: manual.date,
    amount: manual.amount,
    currency: manual.currency,
    smsPrev: { description: sms.description, category: sms.category, categoryEditedAt: sms.categoryEditedAt },
  };
  // Para que "Separar" sea ida y vuelta completa: lo del manual que se pierde al unir.
  if (manual.accountId) {
    merged.mergedFrom.accountId = manual.accountId;
    // La cuenta del manual pisa la del SMS: se guarda la del SMS para devolverla.
    if (sms.accountId !== undefined) merged.mergedFrom.smsPrev!.accountId = sms.accountId;
    if (sms.accountSource !== undefined) merged.mergedFrom.smsPrev!.accountSource = sms.accountSource;
  }
  if (manual.categoryEditedAt !== undefined) merged.mergedFrom.categoryEditedAt = manual.categoryEditedAt;

  if (manual.description && manual.description.trim()) merged.description = manual.description;
  merged.category = manual.category;
  merged.categoryEditedAt = nowIso;

  if (manual.accountId) {
    merged.accountId = manual.accountId;
    merged.accountSource = 'user';
  }

  // El cargo de una cuota de visacuota que se une a su SMS conserva la marca de la cuota (no se regenera).
  if (manual.installmentId && manual.installmentNo) {
    merged.installmentId = manual.installmentId;
    merged.installmentNo = manual.installmentNo;
  }

  if (manual.fixedExpenseId) {
    merged.fixedExpenseId = manual.fixedExpenseId;
    // Se conserva para que "Separar" devuelva el vínculo al manual aunque su id no sea fe_tx_*.
    merged.mergedFrom.fixedExpenseId = manual.fixedExpenseId;
  } else {
    const fid = fixedIdFromFeTxId(manual.id);
    if (fid) merged.fixedExpenseId = fid;
  }

  return merged;
}

/** Deshace mergeManualIntoSms. null si el SMS no tiene mergedFrom. */
export function splitMerged(sms: Transaction): { sms: Transaction; manual: Transaction } | null {
  const mf = sms.mergedFrom;
  if (!mf) return null;

  const restored: Transaction = { ...sms };
  delete restored.mergedFrom;
  if (mf.smsPrev) {
    restored.description = mf.smsPrev.description;
    restored.category = mf.smsPrev.category;
    if (mf.smsPrev.categoryEditedAt !== undefined) restored.categoryEditedAt = mf.smsPrev.categoryEditedAt;
    else delete restored.categoryEditedAt;
    // La cuenta del manual pisó la del SMS al unir: si el usuario no la cambió después, vuelve la del SMS.
    if (mf.accountId !== undefined && restored.accountId === mf.accountId) {
      if (mf.smsPrev.accountId !== undefined) restored.accountId = mf.smsPrev.accountId;
      else delete restored.accountId;
      if (mf.smsPrev.accountSource !== undefined) restored.accountSource = mf.smsPrev.accountSource;
      else delete restored.accountSource;
    }
  }

  const manual: Transaction = {
    id: mf.id,
    amount: mf.amount,
    description: mf.description,
    category: mf.category,
    date: mf.date,
    type: sms.type,
    source: 'manual',
    currency: mf.currency,
  };
  if (mf.accountId !== undefined) manual.accountId = mf.accountId;
  if (mf.categoryEditedAt !== undefined) manual.categoryEditedAt = mf.categoryEditedAt;

  // El vínculo con el gasto fijo vuelve al manual si era suyo: un fe_tx_ o un manual que ya traía
  // fixedExpenseId (conservado en mergedFrom).
  if (restored.fixedExpenseId) {
    if (mf.fixedExpenseId !== undefined) {
      if (restored.fixedExpenseId === mf.fixedExpenseId) {
        manual.fixedExpenseId = mf.fixedExpenseId;
        delete restored.fixedExpenseId;
      }
    } else if (fixedIdFromFeTxId(mf.id) !== null) {
      manual.fixedExpenseId = restored.fixedExpenseId;
      delete restored.fixedExpenseId;
    }
  }

  return { sms: restored, manual };
}
