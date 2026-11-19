process.env.TZ = 'America/Guatemala';
// Pruebas del bloque G1 de la auditoría final (datos y dinero). Sin dependencias:
//   npm run test:audit-g1   →   sucrase-node scripts/audit-g1.test.ts
import { resetMemoryStorage } from './_async-storage-mock';

import { capacityFor, resourcesUntil } from '../services/Capacity';
import type { CapacityContext } from '../services/Capacity';
import { migrateInstallmentsSchedule, planInstallmentCharges } from '../services/InstallmentSchedule';
import { computeFinancialPeriod } from '../services/FinancialPeriod';
import { fixedCycleConfig, setPeriodStartResolver } from '../services/FixedCycle';
import { DEFAULT_PAY_RULES } from '../services/PayCalendar';
import { DEFAULT_SETTINGS, StorageService } from '../services/storage';
import type { Account, CreditInstallment, FixedExpense, PaymentCycle, SmsBatchRecord, Transaction, UserSettings } from '../services/storage';

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

const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;

function acct(extra: Partial<Account>): Account {
  return {
    id: 'a', name: 'Cuenta', type: 'bank', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'x',
    isActive: true, createdAt: '2026-01-01T12:00:00.000Z', ...extra,
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
  // ───────────────────────────────────────────────────────────
  // 4. Capacidad con ingreso declarado: se reparte por ciclo (no se resta lo del período a un ingreso mensual)
  // ───────────────────────────────────────────────────────────
  {
    const visa = acct({ id: 'c1', name: 'Visa', type: 'credit', cutoffDay: 9, paymentDueDay: 22 });
    const capCtx = (paymentCycle: PaymentCycle, now: Date, txs: Transaction[]): CapacityContext => {
      const settings = { paymentCycle, paymentDay: 15, paymentDays: [1, 16], paymentWeekday: 5, monthlyIncome: 8000, exchangeRate: 7.7 } as unknown as UserSettings;
      return {
        now, accounts: [visa], txs, insts: [], fixed: [], sources: [], exchangeRate: 7.7, monthlyIncome: 8000,
        payRules: DEFAULT_PAY_RULES, cycle: fixedCycleConfig(settings), paymentCycle,
        periodAt: (x: Date) => computeFinancialPeriod(settings, x, null) as never,
      };
    };
    const card3000: Transaction = tx('k1', 'expense', 3000, d(2026, 10, 20), { accountId: 'c1', source: 'manual' });
    // Semanal: miércoles 18/11, la tarjeta de Q3,000 vence el 22/11 (en 4 días) y ya se gastaron Q1,500 esta semana.
    const wNow = d(2026, 11, 18, 10);
    const wk = capCtx('weekly', wNow, [card3000, tx('g1', 'expense', 1500, d(2026, 11, 16), { source: 'manual' })]);
    const wRes = capacityFor(visa, wk)!;
    check('G1-4: semanal, ingreso Q8,000/mes, Q1,500 gastados: recursos ≈ 1846 − 1500 (no 6,500)',
      !!wRes && near(wRes.resources, 8000 * 12 / 52 - 1500, 0.02), String(wRes && wRes.resources));
    check('G1-4: semanal: la tarjeta de Q3,000 que vence en 4 días sale en rojo', !!wRes && wRes.level === 'red', String(wRes && wRes.level));
    // Quincenal: recursos = 4,000 − gastado de la quincena.
    const bNow = d(2026, 11, 20, 10);
    const bi = capCtx('biweekly', bNow, [card3000, tx('g2', 'expense', 1000, d(2026, 11, 18), { source: 'manual' })]);
    const bRes = resourcesUntil(bi, d(2026, 11, 22))!;
    check('G1-4: quincenal: recursos = 4,000 − 1,000', near(bRes.resources, 3000), String(bRes.resources));
    // Mensual: sin cambio (regresión).
    const mo = capCtx('monthly', bNow, [card3000, tx('g3', 'expense', 1000, d(2026, 11, 18), { source: 'manual' })]);
    const mRes = resourcesUntil(mo, d(2026, 11, 22))!;
    check('G1-4: mensual sin cambio: recursos = 8,000 − 1,000', near(mRes.resources, 7000), String(mRes.resources));
  }

  // ───────────────────────────────────────────────────────────
  // 5. Visacuota «zombi»: tras migrar, si ya pasaron todos los cortes se cierra
  // ───────────────────────────────────────────────────────────
  {
    const NOW = d(2026, 11, 18, 15);
    const old = (over: Partial<CreditInstallment> = {}): CreditInstallment => ({
      id: 'z1', accountId: '', name: 'Préstamo viejo', totalAmount: 6000, monthlyPayment: 1000, totalInstallments: 6,
      paidInstallments: 2, startDate: d(2026, 1, 10).toISOString(), currency: 'Q', category: 'other', isActive: true, ...over,
    } as CreditInstallment);
    const mig = migrateInstallmentsSchedule([old()], [], NOW);
    const plan = planInstallmentCharges(mig.installments, [], [], [], NOW);
    const after = plan.updates[0] ?? mig.installments[0];
    check('G1-5: visacuota de 6 cuotas desde el 10/01 con 2 pagadas, migrada el 18/11: queda cerrada',
      after.isActive === false && after.paidInstallments === 6, JSON.stringify({ a: after.isActive, p: after.paidInstallments }));
    check('G1-5: la migración no genera cargos retroactivos', plan.toAdd.length === 0);
    // Una a la que todavía le quedan cortes sigue viva y conserva lo contado.
    const mig2 = migrateInstallmentsSchedule([old({ id: 'z2', totalInstallments: 12, totalAmount: 12000 })], [], NOW);
    const plan2 = planInstallmentCharges(mig2.installments, [], [], [], NOW);
    const after2 = plan2.updates[0] ?? mig2.installments[0];
    check('G1-5: con cortes futuros sigue activa y paga lo que llevaba (2/12)', after2.isActive === true && after2.paidInstallments === 2,
      JSON.stringify({ a: after2.isActive, p: after2.paidInstallments }));
    // Idempotente: una vez cerrada no vuelve a cambiar.
    const again = planInstallmentCharges([after], [], [], [], NOW);
    check('G1-5: idempotente', again.updates.length === 0 && again.toAdd.length === 0);
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
