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
