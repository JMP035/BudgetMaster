// Plan para deshacer un lote de sincronización SMS (módulo PURO, sin escribir nada).
// Sin react-native ni AsyncStorage: de ./storage solo `import type`.
import type { CreditInstallment, FixedExpense, IncomeRule, SmsBatchRecord, Transaction } from './storage';
import { removeAnchorsForTx, upsertAutoAnchor } from './PeriodAnchors';
import { revertTransferPair } from './TransferPairs';
import type { PeriodAnchor } from './PeriodAnchors';

/**
 * Revierte los vínculos de ingreso del lote sobre los movimientos que SE QUEDAN (los editados que no se
 * eliminan): restaura la categoría previa y quita la fuente y el ciclo. Las anclas automáticas nacidas de
 * esos movimientos (y de los que se eliminan) se quitan siempre y, si el vínculo había sobrescrito otra ancla
 * automática de esa clave (`prevAnchor`), esa vuelve. La regla de origen que el vínculo aprendió vuelve a como
 * estaba (`prevRule`) o, si nació con el lote (null), se quita. Los vínculos se deshacen del último al primero.
 * Lotes viejos sin esos campos: solo categoría y anclas, como antes. Puro: no escribe nada.
 */
export function planIncomeLinksUndo(
  links: SmsBatchRecord['incomeLinks'] | undefined,
  remainingTxs: Transaction[],
  anchors: PeriodAnchor[],
  incomeRules?: IncomeRule[],
): {
  txs: Transaction[]; anchors: PeriodAnchor[]; incomeRules: IncomeRule[];
  txsChanged: boolean; anchorsChanged: boolean; rulesChanged: boolean; reverted: number;
} {
  const rulesIn = incomeRules ?? [];
  if (!links || links.length === 0) {
    return { txs: remainingTxs, anchors, incomeRules: rulesIn, txsChanged: false, anchorsChanged: false, rulesChanged: false, reverted: 0 };
  }
  const byTx = new Map(links.map(l => [l.txId, l] as const));
  let txsChanged = false;
  let reverted = 0;
  const txs = remainingTxs.map(t => {
    const l = byTx.get(t.id);
    if (!l || !t.incomeSourceId) return t;
    txsChanged = true;
    reverted++;
    const { incomeSourceId: _s, incomeCycleKey: _c, ...rest } = t;
    // Si el usuario cambió la categoría a mano después, su elección se respeta.
    return t.categoryEditedAt ? rest : { ...rest, category: l.prevCategory };
  });
  let nextAnchors = anchors;
  let nextRules = rulesIn;
  let rulesChanged = false;
  for (const l of [...links].reverse()) {
    nextAnchors = removeAnchorsForTx(nextAnchors, l.txId);
    // El ancla que este vínculo sobrescribió vuelve (si no hay ya otra automática de esa clave).
    if (l.prevAnchor && !nextAnchors.some(a => a.key === l.prevAnchor!.key && a.source === 'auto')) {
      nextAnchors = upsertAutoAnchor(nextAnchors, l.prevAnchor);
    }
    if (l.ruleKey !== undefined && l.prevRule !== undefined) {
      const has = nextRules.some(r => r.key === l.ruleKey);
      if (l.prevRule === null) {
        if (has) { nextRules = nextRules.filter(r => r.key !== l.ruleKey); rulesChanged = true; }
      } else if (has) {
        nextRules = nextRules.map(r => (r.key === l.ruleKey ? { ...l.prevRule! } : r));
        rulesChanged = true;
      } else {
        nextRules = [...nextRules, { ...l.prevRule }];
        rulesChanged = true;
      }
    }
  }
  const anchorsChanged = JSON.stringify(nextAnchors) !== JSON.stringify(anchors);
  return {
    txs, anchors: anchorsChanged ? nextAnchors : anchors, incomeRules: rulesChanged ? nextRules : rulesIn,
    txsChanged, anchorsChanged, rulesChanged, reverted,
  };
}

/**
 * Pares de transferencia que el lote vinculó solos. Si el lote borra UNA mitad y la otra se conserva (era de una
 * sync anterior o un registro manual), la que queda vuelve a su tipo y categoría de antes (revertTransferPair):
 * sin esto quedaría como transferencia sin pareja y su gasto real desaparecería de estadísticas y presupuesto.
 * Si se borran las dos, o se conservan las dos, no se toca nada. Lotes viejos sin el campo: sin cambios.
 */
export function planTransferPairsUndo(
  pairs: SmsBatchRecord['transferPairs'] | undefined,
  remainingTxs: Transaction[],
  removedIds: Set<string>,
): { txs: Transaction[]; changed: boolean } {
  if (!pairs || pairs.length === 0) return { txs: remainingTxs, changed: false };
  let txs = remainingTxs;
  let changed = false;
  for (const p of pairs) {
    const outGone = removedIds.has(p.outId);
    const inGone = removedIds.has(p.inId);
    if (outGone === inGone) continue;
    const keptId = outGone ? p.inId : p.outId;
    const next = revertTransferPair(txs, keptId);
    if (next !== txs) { txs = next; changed = true; }
  }
  return { txs, changed };
}

/** Plan (sin escribir nada) para deshacer un lote de sincronización. Criterio de "editado": D6. */
export function planSmsUndo(
  batch: SmsBatchRecord,
  txs: Transaction[],
  insts: CreditInstallment[],
  expenses: FixedExpense[],
  includeEdited: boolean,
) {
  const batchAt = Date.parse(batch.at);
  // Gastos que el lote tocó: los marcados pagados y los de uniones manual <-> SMS.
  const autoFixedIds = new Set([
    ...(batch.fixedMarks ?? []).map(m => m.expenseId),
    ...(batch.fixedMerges ?? []).map(m => m.expenseId),
  ]);
  // Uniones automáticas del lote: el mergedFrom de ese SMS lo puso la sincronización, no el usuario.
  const autoMerged = new Map((batch.fixedMerges ?? []).map(m => [m.smsId, m] as const));
  const txIdSet = new Set(batch.txIds ?? []);
  const instIdSet = new Set(batch.installmentIds ?? []);

  const isTxEdited = (t: Transaction): boolean => {
    const am = autoMerged.get(t.id);
    // La unión automática del lote sella categoryEditedAt (después de batch.at) y, si el manual traía
    // cuenta, accountSource 'user': esos dos rastros no son ediciones del usuario.
    const isAutoMerge = !!am && t.mergedFrom?.id === am.manual.id;
    const edited = t.categoryEditedAt ? Date.parse(t.categoryEditedAt) : NaN;
    if (!isAutoMerge && !isNaN(edited) && !isNaN(batchAt) && edited > batchAt) return true;
    if (t.accountSource === 'user'
      && !(isAutoMerge && t.mergedFrom?.accountId !== undefined && t.accountId === t.mergedFrom.accountId)) return true;
    if (t.mergedFrom && !isAutoMerge) return true;
    // fixedExpenseId que no puso el lote (lo puso el usuario después)
    if (t.fixedExpenseId && !autoFixedIds.has(t.fixedExpenseId)) return true;
    return false;
  };
  // Sin instantánea de la visacuota solo se detectan las claras: con cuotas pagadas, cerrada
  // (inactiva) o con notas del usuario.
  const isInstEdited = (i: CreditInstallment): boolean =>
    (i.paidInstallments ?? 0) > 0 || !i.isActive || !!(i.notes && i.notes.trim());

  const batchTxs = txs.filter(t => txIdSet.has(t.id));
  const batchInsts = insts.filter(i => instIdSet.has(i.id));
  const editedTxs = batchTxs.filter(isTxEdited);
  const editedInsts = batchInsts.filter(isInstEdited);
  const removeTxs = includeEdited ? batchTxs : batchTxs.filter(t => !isTxEdited(t));
  const removeInsts = includeEdited ? batchInsts : batchInsts.filter(i => !isInstEdited(i));
  const removedTxIds = new Set(removeTxs.map(t => t.id));

  // Gastos fijos: solo se tocan si siguen vinculados (paidTxId) a un movimiento que se elimina.
  const prevByExpense = new Map((batch.fixedMarks ?? []).map(m => [m.expenseId, m.prev]));
  let revertedFixed = 0;
  const nextExpenses = expenses.map(e => {
    if (!e.paidTxId || !removedTxIds.has(e.paidTxId)) return e;
    revertedFixed++;
    const prev = prevByExpense.get(e.id);
    if (prev) {
      const restored: FixedExpense = {
        ...e, isPaid: prev.isPaid, paidDate: prev.paidDate, paidTxId: prev.paidTxId, paidBy: prev.paidBy,
      };
      // Lotes nuevos guardan también lastTxId y paidCycleKey; los viejos no (se dejan como están).
      // Tras JSON.stringify una clave undefined desaparece: si el gasto estaba impago, el ciclo
      // que puso el lote se limpia aunque la clave no esté.
      if ('lastTxId' in prev) restored.lastTxId = prev.lastTxId;
      if ('paidCycleKey' in prev) restored.paidCycleKey = prev.paidCycleKey;
      else if (!prev.isPaid) restored.paidCycleKey = undefined;
      return restored;
    }
    return { ...e, isPaid: false, paidDate: undefined, paidTxId: undefined, paidBy: undefined };
  });

  // Registros manuales unidos automáticamente a un SMS que se elimina: vuelven (si no existen ya).
  const restoreManuals = removeTxs
    .filter(t => autoMerged.has(t.id))
    .map(t => autoMerged.get(t.id)!.manual)
    .filter(m => !txs.some(x => x.id === m.id));

  return {
    removeTxs, removeInsts, removedTxIds, nextExpenses, revertedFixed, restoreManuals,
    editedCount: editedTxs.length + editedInsts.length,
    keptEdited: includeEdited ? 0 : editedTxs.length + editedInsts.length,
  };
}
