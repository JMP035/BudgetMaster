process.env.TZ = 'America/Guatemala';
// Pruebas del bloque G1 de la auditoría final (datos y dinero). Sin dependencias:
//   npm run test:audit-g1   →   sucrase-node scripts/audit-g1.test.ts
import { resetMemoryStorage } from './_async-storage-mock';

import { capacityFor, resourcesUntil } from '../services/Capacity';
import type { CapacityContext } from '../services/Capacity';
import { migrateInstallmentsSchedule, planInstallmentCharges } from '../services/InstallmentSchedule';
import { buildExistingSmsIndex, planSmsImport } from '../services/BankSmsParser';
import { learnPatternFromSms } from '../services/IncomeSources';
import { emptyDraft, buildOnboardingCommit, sanitizeDraft } from '../services/OnboardingPlan';
import type { DraftDebt, OnboardingDraft } from '../services/OnboardingPlan';
import { monthlyDebtLoad } from '../services/DebtLoad';
import { computeFinancialPeriod } from '../services/FinancialPeriod';
import { fixedCycleConfig, setPeriodStartResolver } from '../services/FixedCycle';
import { DEFAULT_PAY_RULES } from '../services/PayCalendar';
import { DEFAULT_SETTINGS, StorageService, parseAmount } from '../services/storage';
import type { Account, CreditInstallment, FixedExpense, IncomeSource, PaymentCycle, SmsBatchRecord, Transaction, UserSettings } from '../services/storage';

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

  // ───────────────────────────────────────────────────────────
  // 6. Deshacer un vínculo de ingreso automático restaura el ancla y la regla anteriores
  // ───────────────────────────────────────────────────────────
  {
    const SMS = (day: string) => `BANRURAL: Recibiste Q7,426.61 en tu cuenta Monetaria *** ****5051 de SECCION DE OPERACIONES DE DEPOSITOS, el ${day}/09/2026 a las 10:31.`;
    const importTx = (body: string, at: Date): Transaction => {
      const plan = planSmsImport([{ body, receivedAt: at.getTime() }], buildExistingSmsIndex([], [], []), []);
      if (plan.transactions.length !== 1) throw new Error('no se importó');
      return plan.transactions[0];
    };
    const learned = learnPatternFromSms(SMS('27'), d(2026, 9, 27).getTime());
    if (!learned.ok) throw new Error('no aprendió');
    const src: IncomeSource = {
      id: 'src_sueldo', name: 'Sueldo', category: 'salary', amount: 7426.61, currency: 'Q', frequency: 'monthly',
      days: [27], role: 'base', anchorsPeriod: true, pattern: learned.pattern, isActive: true, createdAt: '2026-01-01T12:00:00.000Z',
    };
    const setup = async (): Promise<{ t1: Transaction; t2: Transaction }> => {
      resetMemoryStorage();
      await StorageService.saveSettings({ ...DEFAULT_SETTINGS, paymentCycle: 'monthly', paymentDay: 27 });
      await StorageService.saveIncomeSources([src]);
      const t1 = importTx(SMS('25'), d(2026, 9, 25, 10, 31));
      const t2 = importTx(SMS('26'), d(2026, 9, 26, 10, 31));
      await StorageService.saveTransactions([t1, { ...t2, id: 'dep2', smsFingerprint: 'otro' }]);
      return { t1, t2: { ...t2, id: 'dep2', smsFingerprint: 'otro' } };
    };
    const linkRecord = (r: NonNullable<Awaited<ReturnType<typeof StorageService.linkIncome>>>, txId: string): NonNullable<SmsBatchRecord['incomeLinks']>[number] => ({
      txId, prevCategory: r.prevCategory,
      ...(r.anchorKey ? { anchorKey: r.anchorKey } : {}),
      ...(r.prevAnchor ? { prevAnchor: r.prevAnchor } : {}),
      ...(r.ruleKey ? { ruleKey: r.ruleKey, prevRule: r.prevRule ?? null } : {}),
    });

    // (a) Había un ancla automática y una regla aprendida de un vínculo anterior (mismo ciclo y mismo origen).
    {
      const { t1, t2 } = await setup();
      const r1 = await StorageService.linkIncome(t1.id, src.id, '2026-09-27');
      const ruleBefore = (await StorageService.getIncomeRules())[0];
      const anchorBefore = (await StorageService.getPeriodAnchors()).find(a => a.key === '2026-09-27' && a.source === 'auto');
      check('G1-6 (previo): el primer vínculo crea ancla y regla', !!r1 && !!anchorBefore && anchorBefore.txId === t1.id && ruleBefore.hits === 1);
      const r2 = await StorageService.linkIncome(t2.id, src.id, '2026-09-27');
      const anchorMid = (await StorageService.getPeriodAnchors()).find(a => a.key === '2026-09-27' && a.source === 'auto');
      check('G1-6 (previo): el segundo vínculo sobrescribe el ancla y suma un acierto', !!r2 && anchorMid?.txId === t2.id && anchorMid.start === '2026-09-26'
        && (await StorageService.getIncomeRules())[0].hits === 2);
      await StorageService.recordSmsBatch({
        id: 'b_inc', at: new Date().toISOString(), mode: 'auto', txIds: [t2.id], installmentIds: [], fixedMarks: [],
        incomeLinks: [linkRecord(r2!, t2.id)],
      });
      await StorageService.undoSmsBatch('b_inc', { includeEdited: false });
      const anchors = await StorageService.getPeriodAnchors();
      const auto = anchors.find(a => a.key === '2026-09-27' && a.source === 'auto');
      check('G1-6: al deshacer vuelve el ancla automática anterior (la del primer depósito)',
        !!auto && auto.txId === t1.id && auto.start === '2026-09-25', JSON.stringify(anchors));
      const rule = (await StorageService.getIncomeRules())[0];
      check('G1-6: la regla aprendida vuelve a sus aciertos de antes (hits 1)', !!rule && rule.hits === 1, JSON.stringify(rule));
    }

    // (b) La regla nació con este vínculo: al deshacer desaparece (y no queda ancla).
    {
      const { t1 } = await setup();
      const r1 = await StorageService.linkIncome(t1.id, src.id, '2026-09-27');
      check('G1-6 (previo): la regla nace con el vínculo', (await StorageService.getIncomeRules()).length === 1);
      await StorageService.recordSmsBatch({
        id: 'b_inc2', at: new Date().toISOString(), mode: 'auto', txIds: [t1.id], installmentIds: [], fixedMarks: [],
        incomeLinks: [linkRecord(r1!, t1.id)],
      });
      await StorageService.undoSmsBatch('b_inc2', { includeEdited: false });
      check('G1-6: la regla que nació en el lote se quita al deshacer', (await StorageService.getIncomeRules()).length === 0);
      check('G1-6: y no queda ancla del sueldo', (await StorageService.getPeriodAnchors()).length === 0);
    }
    // (c) Lote viejo (sin prevAnchor / ruleKey): sigue funcionando como antes.
    {
      const { t1 } = await setup();
      const r1 = await StorageService.linkIncome(t1.id, src.id, '2026-09-27');
      await StorageService.recordSmsBatch({
        id: 'b_inc3', at: new Date().toISOString(), mode: 'auto', txIds: [t1.id], installmentIds: [], fixedMarks: [],
        incomeLinks: [{ txId: t1.id, prevCategory: r1!.prevCategory, anchorKey: r1!.anchorKey }],
      });
      const res = await StorageService.undoSmsBatch('b_inc3', { includeEdited: false });
      check('G1-6: lote viejo sin los campos nuevos se deshace igual', res.removedTx === 1 && (await StorageService.getPeriodAnchors()).length === 0);
    }
  }
  // ───────────────────────────────────────────────────────────
  // 1. Deudas del onboarding: nada de gastos inmediatos, tarjeta solo declarada, gemelo en préstamos, migración
  // ───────────────────────────────────────────────────────────
  {
    const NOW = d(2026, 11, 18, 15);
    const ctx = { isAndroid: true, exchangeRate: 7.7, parse: parseAmount, nowIso: NOW.toISOString() };
    const draftWith = (debts: DraftDebt[], extra: Partial<OnboardingDraft> = {}): OnboardingDraft => ({
      ...emptyDraft(), name: 'Ana', income: '8000', paymentDay: '27', debts, ...extra,
    });
    const loan = (extra: Partial<DraftDebt> = {}): DraftDebt => ({
      id: 'd1', name: 'Préstamo', type: 'loan', monthlyPayment: '1000', totalAmount: '12000', currency: 'Q', ...extra,
    });
    const dayOf = (iso: string | undefined): string => {
      const x = new Date(iso ?? '');
      return `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
    };

    // (a) Préstamo sin día de pago: onboarding el 18/11 → nada hoy; la primera cuota cae el 18/12.
    {
      const c = buildOnboardingCommit(draftWith([loan()]), DEFAULT_SETTINGS, ctx);
      const inst = c.installments[0];
      const today = planInstallmentCharges(c.installments, c.accounts, [], [], NOW);
      check('G1-1a: el onboarding de un préstamo NO genera un gasto el mismo día', today.toAdd.length === 0, JSON.stringify(today.toAdd.map(t => [t.id, t.date])));
      check('G1-1a: trackSince es la próxima fecha de pago (18/12), nunca «ahora»', dayOf(inst.trackSince) === '2026-12-18', String(inst.trackSince));
      check('G1-1a: sin día, guarda el de hoy como día de pago', inst.dueDay === 18, String(inst.dueDay));
      const next = planInstallmentCharges(c.installments, c.accounts, [], [], d(2026, 12, 18, 9));
      check('G1-1a: el primer cargo es la próxima cuota (18/12, cuota 1/12)',
        next.toAdd.length === 1 && next.toAdd[0].description === 'Cuota 1/12 · Préstamo' && dayOf(next.toAdd[0].date) === '2026-12-18',
        JSON.stringify(next.toAdd.map(t => [t.description, t.date])));
    }
    // (b) Con día de pago.
    {
      const c = buildOnboardingCommit(draftWith([loan({ dueDay: '25' })]), DEFAULT_SETTINGS, ctx);
      check('G1-1b: día 25 → primer cargo el 25/11 (no hoy)',
        planInstallmentCharges(c.installments, c.accounts, [], [], NOW).toAdd.length === 0
        && planInstallmentCharges(c.installments, c.accounts, [], [], d(2026, 11, 25, 9)).toAdd.length === 1);
      const c2 = buildOnboardingCommit(draftWith([loan({ dueDay: '5' })]), DEFAULT_SETTINGS, ctx);
      check('G1-1b: día 5 (ya pasó este mes) → primer cargo el 5/12',
        planInstallmentCharges(c2.installments, c2.accounts, [], [], d(2026, 12, 4)).toAdd.length === 0
        && dayOf(planInstallmentCharges(c2.installments, c2.accounts, [], [], d(2026, 12, 5)).toAdd[0]?.date) === '2026-12-5');
      const d1 = sanitizeDraft(JSON.parse(JSON.stringify(draftWith([loan({ dueDay: '25' })]))));
      check('G1-1b: el borrador conserva el día de pago', !!d1 && d1.debts[0].dueDay === '25');
    }
    // (c) Visacuota con tarjeta cuyo corte es hoy: tampoco hay cargo inmediato.
    {
      const card = { id: 'k1', name: 'BAC Visa', kind: 'credit' as const, currency: 'Q' as const, balance: '', bankCode: 'BAC', bankLabel: 'BAC Credomatic', cutoffDay: '18', paymentDueDay: '5' };
      const c = buildOnboardingCommit(draftWith([loan({ id: 'd3', type: 'installment', accountId: 'k1' })], { accounts: [card as never] }), DEFAULT_SETTINGS, ctx);
      check('G1-1c: visacuota con corte hoy: sin cargo el mismo día', planInstallmentCharges(c.installments, c.accounts, [], [], NOW).toAdd.length === 0);
      check('G1-1c: el primer cargo es el próximo corte (18/12)', planInstallmentCharges(c.installments, c.accounts, [], [], d(2026, 12, 18, 9)).toAdd.length === 1);
    }
    // (d) Tarjeta de crédito declarada: no se convierte en cuota; sigue como deuda «declarada» sin doble conteo.
    {
      const c = buildOnboardingCommit(draftWith([
        loan(), loan({ id: 'd2', name: 'Visa BAC', type: 'credit', monthlyPayment: '600', totalAmount: '' }),
      ]), DEFAULT_SETTINGS, ctx);
      check('G1-1d: la deuda tipo tarjeta no se convierte en cuota', c.installments.length === 1 && c.installments[0].id === 'onb_d1', JSON.stringify(c.installments.map(i => i.id)));
      const load = monthlyDebtLoad({ installments: c.installments, settings: c.settings, sources: [], txs: [] });
      check('G1-1d: el préstamo cuenta como préstamo y la tarjeta como declarada (sin duplicar)',
        load.loansQ === 1000 && load.legacyQ === 600 && load.totalQ === 1600, JSON.stringify([load.loansQ, load.legacyQ, load.totalQ]));
      const cleared = monthlyDebtLoad({ installments: c.installments, settings: { ...c.settings, activeDebts: 0 }, sources: [], txs: [] });
      check('G1-1d: «Ya no la tengo» (activeDebts 0) quita la declarada y deja el préstamo', cleared.legacyQ === 0 && cleared.totalQ === 1000);
      const only = buildOnboardingCommit(draftWith([loan({ id: 'd2', name: 'Visa BAC', type: 'credit', monthlyPayment: '600' })]), DEFAULT_SETTINGS, ctx);
      const loadOnly = monthlyDebtLoad({ installments: only.installments, settings: only.settings, sources: [], txs: [] });
      check('G1-1d: solo tarjeta: queda declarada (600) y ninguna cuota', only.installments.length === 0 && loadOnly.legacyQ === 600 && loadOnly.activeCount === 0);
    }
    // (e) Gemelo en préstamos: un SMS de gasto (cualquier cuenta, mismo monto ±0.01, ±3 días) es la cuota.
    {
      const inst: CreditInstallment = {
        id: 'p1', accountId: '', name: 'Préstamo', totalAmount: 12000, monthlyPayment: 1000, totalInstallments: 12, paidInstallments: 0,
        startDate: d(2026, 11, 25).toISOString(), trackSince: d(2026, 11, 25).toISOString(), paidOffset: 0, dueDay: 25,
        currency: 'Q', category: 'other', isActive: true,
      } as CreditInstallment;
      const sms = (id: string, amount: number, at: Date, extra: Partial<Transaction> = {}) => tx(id, 'expense', amount, at, { accountId: 'debito', ...extra });
      const p = planInstallmentCharges([inst], [], [sms('s1', 1000.005, d(2026, 11, 23, 8))], [], d(2026, 11, 25, 9));
      check('G1-1e: el SMS de gasto del banco ES la cuota (no se crea otra)',
        p.toAdd.length === 0 && p.twinUpdates.length === 1 && p.twinUpdates[0].installmentId === 'p1' && p.twinUpdates[0].installmentNo === 1,
        JSON.stringify([p.toAdd.length, p.twinUpdates.length]));
      const far = planInstallmentCharges([inst], [], [sms('s2', 1000, d(2026, 11, 30, 8))], [], d(2026, 11, 25, 9));
      check('G1-1e: a más de 3 días ya no es gemelo', far.toAdd.length === 1 && far.twinUpdates.length === 0);
      const other = planInstallmentCharges([inst], [], [sms('s3', 1200, d(2026, 11, 25, 8))], [], d(2026, 11, 25, 9));
      check('G1-1e: otro monto no es gemelo', other.toAdd.length === 1);
      const manual = planInstallmentCharges([inst], [], [sms('s4', 1000, d(2026, 11, 25, 8), { source: 'manual' })], [], d(2026, 11, 25, 9));
      check('G1-1e: solo cuentan SMS (un registro manual no se toca)', manual.toAdd.length === 1 && manual.twinUpdates.length === 0);
      const paired = planInstallmentCharges([inst], [], [sms('s5', 1000, d(2026, 11, 25, 8), { transferPairId: 'tp_x', type: 'transfer' })], [], d(2026, 11, 25, 9));
      check('G1-1e: una transferencia entre cuentas propias no es la cuota', paired.toAdd.length === 1 && paired.twinUpdates.length === 0);
    }
    // (f) Quien ya tenía deudas del onboarding anterior: la actualización no genera cargos inmediatos.
    {
      resetMemoryStorage();
      const mk = (id: string, notes: string, category: string): CreditInstallment => ({
        id, accountId: '', name: id, totalAmount: 12000, monthlyPayment: 1000, totalInstallments: 12, paidInstallments: 1,
        startDate: d(2026, 10, 18).toISOString(), trackSince: d(2026, 10, 18).toISOString(), paidOffset: 0,
        currency: 'Q', category, isActive: true, notes,
      } as CreditInstallment);
      await StorageService.saveCreditInstallments([
        mk('onb_d1', 'Registrado en onboarding (Préstamo)', 'other'),
        mk('onb_d2', 'Registrado en onboarding (Tarjeta de crédito)', 'transfer'),
      ]);
      await StorageService.saveTransactions([{
        id: 'inst_onb_d1_1', amount: 1000, description: 'Cuota 1/12 · onb_d1', category: 'other', date: d(2026, 10, 18).toISOString(),
        type: 'expense', source: 'manual', currency: 'Q', installmentId: 'onb_d1', installmentNo: 1,
      }]);
      const res = await StorageService.syncInstallmentCharges(NOW);
      const txs = await StorageService.getTransactions();
      check('G1-1f: tras actualizar, el mismo día no aparece ningún gasto automático nuevo',
        res.added === 0 && txs.length === 1, JSON.stringify(txs.map(t => t.id)));
      const after = await StorageService.getCreditInstallments();
      const d1 = after.find(i => i.id === 'onb_d1')!;
      check('G1-1f: la cuota del préstamo sigue activa y su trackSince pasa a la próxima fecha (18/12)', d1.isActive && dayOf(d1.trackSince) === '2026-12-18', String(d1.trackSince));
      check('G1-1f: la «tarjeta de crédito» convertida en cuota deja de generar gastos', after.find(i => i.id === 'onb_d2')!.isActive === false);
      const dec = await StorageService.syncInstallmentCharges(d(2026, 12, 18, 9));
      const txs2 = await StorageService.getTransactions();
      check('G1-1f: en su día de pago (18/12) sí se carga la cuota del préstamo', dec.added === 1 && txs2.some(t => t.id === 'inst_onb_d1_3'), JSON.stringify(txs2.map(t => t.id)));
    }
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
