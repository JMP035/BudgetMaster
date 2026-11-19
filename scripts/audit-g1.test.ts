process.env.TZ = 'America/Guatemala';
// Pruebas del bloque G1 de la auditoría final (datos y dinero). Sin dependencias:
//   npm run test:audit-g1   →   sucrase-node scripts/audit-g1.test.ts
import { resetMemoryStorage } from './_async-storage-mock';

import { setPeriodStartResolver } from '../services/FixedCycle';
import { DEFAULT_SETTINGS, StorageService } from '../services/storage';
import type { FixedExpense, SmsBatchRecord, Transaction, UserSettings } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);

function tx(id: string, type: Transaction['type'], amount: number, at: Date, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, amount, description: `mov ${id}`, category: type === 'income' ? 'salary' : 'other', date: at.toISOString(),
    type, source: 'sms', currency: 'Q', ...extra,
  };
}

async function scenarios(): Promise<void> {
  // ───────────────────────────────────────────────────────────
  // 2. El reinicio de gastos fijos corre con el resolvedor del período ya armado
  // ───────────────────────────────────────────────────────────
  {
    resetMemoryStorage();
    // Arranque en frío: sin resolvedor global (como al abrir la app antes de loadAllData).
    setPeriodStartResolver(null);
    const settings: UserSettings = {
      ...DEFAULT_SETTINGS, paymentCycle: 'monthly', paymentDay: 15,
      payRules: { weekendRule: 'next_business', holidays: true, toleranceDays: 3, autoAnchor: true },
    };
    await StorageService.saveSettings(settings);
    setPeriodStartResolver(null);
    const luz: FixedExpense = {
      id: 'f1', name: 'Luz', amount: 300, currency: 'Q', category: 'utilities', dayOfMonth: 20,
      isPaid: true, paidDate: d(2025, 10, 20).toISOString(), paidTxId: 't1', paidCycleKey: '2025-10-15', isActive: true,
    } as FixedExpense;
    await StorageService.saveFixedExpenses([luz]);
    // Sábado 15/11/2025 con la regla «siguiente hábil»: el período real sigue siendo el que arrancó el 15/10.
    await StorageService.checkAndRunMonthlyReset(d(2025, 11, 15, 10));
    const after = (await StorageService.getFixedExpenses())[0];
    check('G1-2: «Luz» pagada en el período 2025-10-15 sigue pagada el sábado 15/11 (arranque en frío)',
      after.isPaid === true && after.paidTxId === 't1' && after.paidCycleKey === '2025-10-15', JSON.stringify(after));
  }

  // ───────────────────────────────────────────────────────────
  // 3. Deshacer una sync no deja huérfana la mitad vieja de un par de transferencia
  // ───────────────────────────────────────────────────────────
  {
    resetMemoryStorage();
    const old = d(2026, 11, 10, 9, 0);
    // Salida de una sync ANTERIOR + entrada de la sync NUEVA (que la empareja sola).
    const out = tx('o1', 'expense', 500, old, { category: 'transfer', bank: 'BAC', accountId: 'a1' });
    const inn = tx('i1', 'income', 500, d(2026, 11, 10, 9, 5), { category: 'transfer_in', bank: 'BANRURAL' });
    const lone = tx('x1', 'expense', 80, d(2026, 11, 9), { category: 'food' });
    await StorageService.saveTransactions([out, inn, lone]);
    await StorageService.linkTransferPair('o1', 'i1');
    const paired = await StorageService.getTransactions();
    check('G1-3 (previo): el par quedó neutro', paired.find(t => t.id === 'o1')!.type === 'transfer'
      && paired.find(t => t.id === 'i1')!.type === 'transfer');
    const batch: SmsBatchRecord = {
      id: 'b_pair', at: new Date().toISOString(), mode: 'manual', txIds: ['i1'], installmentIds: [], fixedMarks: [],
      transferPairs: [{ outId: 'o1', inId: 'i1' }],
    };
    await StorageService.recordSmsBatch(batch);
    await StorageService.undoSmsBatch('b_pair', { includeEdited: false });
    const left = await StorageService.getTransactions();
    const o = left.find(t => t.id === 'o1');
    check('G1-3: la entrada nueva se borra', !left.some(t => t.id === 'i1'));
    check('G1-3: la salida vieja vuelve a ser un gasto (sin par huérfano)',
      !!o && o.type === 'expense' && o.category === 'transfer' && o.transferPairId === undefined && o.transferPrev === undefined,
      JSON.stringify(o));
    check('G1-3: el resto de movimientos no se toca', left.find(t => t.id === 'x1')?.type === 'expense' && left.length === 2);

    // Lote viejo (sin el campo transferPairs): no rompe.
    resetMemoryStorage();
    await StorageService.saveTransactions([tx('n1', 'expense', 10, d(2026, 11, 9), { category: 'food' })]);
    await StorageService.recordSmsBatch({ id: 'b_old', at: new Date().toISOString(), mode: 'auto', txIds: ['n1'], installmentIds: [], fixedMarks: [] });
    const r = await StorageService.undoSmsBatch('b_old', { includeEdited: false });
    check('G1-3: lote viejo sin transferPairs se deshace igual', r.removedTx === 1 && (await StorageService.getTransactions()).length === 0);

    // Par con las dos mitades en el mismo lote: se van las dos y no queda nada colgando.
    resetMemoryStorage();
    await StorageService.saveTransactions([
      tx('o2', 'expense', 90, d(2026, 11, 10), { category: 'transfer', bank: 'BAC' }),
      tx('i2', 'income', 90, d(2026, 11, 10), { category: 'transfer_in', bank: 'BANRURAL' }),
    ]);
    await StorageService.linkTransferPair('o2', 'i2');
    await StorageService.recordSmsBatch({
      id: 'b_both', at: new Date().toISOString(), mode: 'auto', txIds: ['o2', 'i2'], installmentIds: [], fixedMarks: [],
      transferPairs: [{ outId: 'o2', inId: 'i2' }],
    });
    await StorageService.undoSmsBatch('b_both', { includeEdited: false });
    check('G1-3: par entero del lote: se borra completo', (await StorageService.getTransactions()).length === 0);
  }
}

scenarios()
  .then(() => {
    console.log(`\nAuditoría G1: ${checks - failures}/${checks} comprobaciones correctas.`);
    if (failures > 0) process.exit(1);
  })
  .catch(e => {
    console.log('ERROR inesperado en las pruebas de G1:', e);
    process.exit(1);
  });
