process.env.TZ = 'America/Guatemala';
// Pruebas de la capacidad de pago de una tarjeta y de «Llegó tu sueldo» (services/Capacity.ts).
//   npm run test:capacity   →   sucrase-node scripts/capacity.test.ts

import {
  LEVEL_RANK, capacityFor, capacityMessage, commitmentsUntil, expectedIncomeUntil, levelOf, resourcesUntil,
  salaryFigures, salaryMessage,
} from '../services/Capacity';
import type { CapacityContext } from '../services/Capacity';
import { computeFinancialPeriod } from '../services/FinancialPeriod';
import { fixedCycleConfig } from '../services/FixedCycle';
import { DEFAULT_PAY_RULES } from '../services/PayCalendar';
import type { Account, CreditInstallment, FixedExpense, IncomeSource, Transaction, UserSettings } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);

const settings = {
  paymentCycle: 'monthly', paymentDay: 27, paymentDays: [15, 30], monthlyIncome: 8000, exchangeRate: 7.7,
} as unknown as UserSettings;

function acct(extra: Partial<Account>): Account {
  return {
    id: 'a', name: 'Cuenta', type: 'bank', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'x',
    isActive: true, createdAt: '2026-01-01T12:00:00.000Z', ...extra,
  };
}

const visa = acct({ id: 'c1', name: 'Visa', type: 'credit', cutoffDay: 9, paymentDueDay: 2 });
const bank = (balance: number) => acct({ id: 'b1', name: 'Monibyte', type: 'bank', balance, balanceMode: 'manual' });

function expense(id: string, amount: number, date: Date, extra: Partial<Transaction> = {}): Transaction {
  return { id, amount, description: id, category: 'food', date: date.toISOString(), type: 'expense', source: 'manual', currency: 'Q', ...extra };
}

const luz: FixedExpense = {
  id: 'f1', name: 'Luz', amount: 300, currency: 'Q', category: 'bills', dayOfMonth: 22, isPaid: false, autoRecord: false, isActive: true,
};

const salary: IncomeSource = {
  id: 's1', name: 'Sueldo', category: 'salary', amount: 8000, currency: 'Q', frequency: 'monthly', days: [27],
  role: 'base', anchorsPeriod: true, isActive: true, createdAt: '2026-01-01T12:00:00.000Z',
};

// Estado de la Visa (corte 9, pago 2): ciclo 10-oct..9-nov = 1500 + 700 = 2200; el 12-nov (300) es del próximo estado.
const cardTxs: Transaction[] = [
  expense('k1', 1500, d(2026, 10, 20), { accountId: 'c1' }),
  expense('k2', 700, d(2026, 11, 5), { accountId: 'c1' }),
  expense('k3', 300, d(2026, 11, 12), { accountId: 'c1' }),
];

function ctxOf(over: Partial<CapacityContext>): CapacityContext {
  return {
    now: d(2026, 11, 18, 10), accounts: [visa, bank(4000)], txs: cardTxs, insts: [], fixed: [luz], sources: [],
    exchangeRate: 7.7, monthlyIncome: 8000, payRules: DEFAULT_PAY_RULES, cycle: fixedCycleConfig(settings),
    paymentCycle: 'monthly',
    periodAt: (x: Date) => computeFinancialPeriod(settings, x, null) as never,
    ...over,
  };
}

// ── Niveles ──
check('nivel 0.69 = ok', levelOf(0.69) === 'ok');
check('nivel 0.70 = warn', levelOf(0.7) === 'warn');
check('nivel 0.89 = warn', levelOf(0.89) === 'warn');
check('nivel 0.90 = alert', levelOf(0.9) === 'alert');
check('nivel 0.99 = alert', levelOf(0.99) === 'alert');
check('nivel 1.00 = red', levelOf(1) === 'red');
check('nivel 3 = red', levelOf(3) === 'red');
check('rangos ordenados', LEVEL_RANK.ok < LEVEL_RANK.warn && LEVEL_RANK.warn < LEVEL_RANK.alert && LEVEL_RANK.alert < LEVEL_RANK.red);

// ── Capacidad con saldos: comprometido = estado 2200 + Luz (22-nov) 300 = 2500 ──
const base = capacityFor(visa, ctxOf({ accounts: [visa, bank(4000)] }))!;
check('capacidad: existe', !!base);
check('capacidad: estado cerrado del 9-nov', base.cutKey === '2026-11-09', base.cutKey);
check('capacidad: vence el 2-dic', base.due.getMonth() === 11 && base.due.getDate() === 2);
check('capacidad: 14 días al pago', base.daysToDue === 14, String(base.daysToDue));
check('capacidad: basis balances', base.basis === 'balances');
check('capacidad: comprometido 2500', near(base.committed, 2500), String(base.committed));
check('capacidad: partes (estado 2200, fijos 300, otras 0)',
  near(base.parts.statementQ, 2200) && near(base.parts.fixed, 300) && near(base.parts.otherDebts, 0));
check('capacidad: recursos = saldo 4000', near(base.resources, 4000), String(base.resources));
check('capacidad: ratio 0.625 -> ok', near(base.ratio, 0.625, 0.001) && base.level === 'ok', `${base.ratio} ${base.level}`);

const lv = (bal: number) => capacityFor(visa, ctxOf({ accounts: [visa, bank(bal)] }))!;
check('nivel ok con saldo 4000', lv(4000).level === 'ok');
check('nivel warn con saldo 3500 (0.714)', lv(3500).level === 'warn', lv(3500).level);
check('nivel alert con saldo 2700 (0.926)', lv(2700).level === 'alert', lv(2700).level);
check('nivel red con saldo 2500 (1.0)', lv(2500).level === 'red');
check('nivel red con saldo 2000 (1.25)', lv(2000).level === 'red' && near(lv(2000).ratio, 1.25, 0.001));
check('nivel red con saldo 0 (sin recursos)', lv(0).level === 'red' && lv(0).ratio >= 1);

// ── El sueldo que llega ANTES del pago se cuenta (sueldo el 27, pago el 2-dic) ──
const lowBal = capacityFor(visa, ctxOf({ accounts: [visa, bank(500)] }))!;
check('sin sueldo esperado: saldo 500 -> rojo', lowBal.level === 'red');
const withSalary = capacityFor(visa, ctxOf({ accounts: [visa, bank(500)], sources: [salary] }))!;
check('con sueldo del 27-nov: recursos 500 + 8000', near(withSalary.resources, 8500), String(withSalary.resources));
check('con sueldo del 27-nov: ok', withSalary.level === 'ok' && near(withSalary.parts.expectedIncome, 8000), withSalary.level);
const exp = expectedIncomeUntil(ctxOf({ sources: [salary] }), d(2026, 12, 2));
check('ingresos esperados: solo el del 27-nov', exp.items.length === 1 && exp.items[0].date.getDate() === 27 && exp.items[0].date.getMonth() === 10);
// Un sueldo posterior a la fecha de pago no cuenta.
const late = capacityFor(visa, ctxOf({ accounts: [visa, bank(500)], sources: [{ ...salary, days: [5] }] }))!;
check('sueldo del 5-dic (después del pago del 2) no cuenta', near(late.resources, 500) && late.level === 'red', String(late.resources));
// El ciclo ya vinculado a un depósito no se cuenta otra vez (ya está en el saldo).
const linked: Transaction[] = [...cardTxs, { id: 'inc', amount: 8000, description: 's', category: 'salary', date: d(2026, 11, 27).toISOString(), type: 'income', source: 'sms', currency: 'Q', incomeSourceId: 's1', incomeCycleKey: '2026-11-27' }];
const expLinked = expectedIncomeUntil(ctxOf({ sources: [salary], txs: linked, now: d(2026, 11, 27, 15) }), d(2026, 12, 2));
check('ocurrencia ya vinculada no se cuenta', expLinked.items.length === 0);

// ── Sin saldos: ingreso declarado restante (basis declared) ──
const noBal = capacityFor(visa, ctxOf({ accounts: [visa] }))!;
check('sin saldos: basis declared', noBal.basis === 'declared');
check('sin saldos: recursos = declarado 8000', near(noBal.resources, 8000), String(noBal.resources));
check('sin saldos: ratio 0.3125 ok', near(noBal.ratio, 0.3125, 0.001) && noBal.level === 'ok');
const spentTxs: Transaction[] = [...cardTxs, expense('big', 5000, d(2026, 11, 10))];
const noBal2 = capacityFor(visa, ctxOf({ accounts: [visa], txs: spentTxs }))!;
check('sin saldos: lo gastado del período resta (8000 - 5000)', near(noBal2.resources, 3000) && noBal2.level === 'warn' && near(noBal2.ratio, 2500 / 3000, 0.001), `${noBal2.resources} ${noBal2.level}`);
check('sin saldos: el cargo de la tarjeta no resta dos veces', near(noBal.resources, 8000));
const noInfo = capacityFor(visa, ctxOf({ accounts: [visa], monthlyIncome: 0 }));
check('sin saldos ni ingreso declarado ni fuentes: null', noInfo === null);
const onlySources = capacityFor(visa, ctxOf({ accounts: [visa], monthlyIncome: 0, sources: [salary] }))!;
check('sin saldos y sin declarado pero con fuente: usa la fuente', !!onlySources && near(onlySources.resources, 8000) && onlySources.basis === 'declared');
const inactive = capacityFor({ ...visa, isActive: false }, ctxOf({}));
check('tarjeta inactiva: null', inactive === null);
const noDue = capacityFor({ ...visa, paymentDueDay: undefined }, ctxOf({}));
check('tarjeta sin día de pago: null', noDue === null);
const nothing = capacityFor(visa, ctxOf({ txs: [] }));
check('nada por pagar: null', nothing === null);

// ── USD: se convierte solo para el ratio; las partes conservan sus monedas ──
const usdTxs: Transaction[] = [...cardTxs, expense('u1', 100, d(2026, 11, 3), { accountId: 'c1', currency: 'USD' })];
const usd = capacityFor(visa, ctxOf({ txs: usdTxs, accounts: [visa, bank(4000)] }))!;
check('USD: partes separadas', near(usd.parts.statementQ, 2200) && near(usd.parts.statementUSD, 100));
check('USD: comprometido = 2200 + 100 x 7.7 + 300', near(usd.committed, 2200 + 770 + 300), String(usd.committed));
const usdBank = capacityFor(visa, ctxOf({ accounts: [visa, bank(4000), acct({ id: 'b2', type: 'bank', currency: 'USD', balance: 100, balanceMode: 'manual' })] }))!;
check('USD: el saldo en dólares suma convertido', near(usdBank.resources, 4000 + 770), String(usdBank.resources));

// ── Otras deudas, gasto fijo duplicado de la tarjeta, cuentas sin seguimiento ──
const loan: CreditInstallment = {
  id: 'l1', accountId: '', name: 'Préstamo', totalAmount: 1200, monthlyPayment: 400, totalInstallments: 6, paidInstallments: 1,
  startDate: '2026-10-15T12:00:00.000Z', currency: 'Q', category: 'debt', isActive: true, trackSince: '2026-10-15T12:00:00.000Z', paidOffset: 0, dueDay: 25,
};
const withLoan = capacityFor(visa, ctxOf({ insts: [loan] }))!;
check('préstamo con cuota antes del pago suma a otras deudas', near(withLoan.parts.otherDebts, 400), String(withLoan.parts.otherDebts));
const visaFixed: FixedExpense = { ...luz, id: 'f2', name: 'Pago Visa', amount: 2200, dayOfMonth: 1 };
const dup = capacityFor(visa, ctxOf({ fixed: [luz, visaFixed] }))!;
check('un gasto fijo con el nombre de la tarjeta no se cuenta dos veces', near(dup.committed, 2500), String(dup.committed));
const noTrack = capacityFor(visa, ctxOf({ accounts: [visa, acct({ id: 'b3', balance: 99999, balanceMode: 'none' })] }))!;
check('cuenta sin seguimiento no cuenta como saldo (usa declarado)', noTrack.basis === 'declared');
const savingsInv = capacityFor(visa, ctxOf({ accounts: [visa, acct({ id: 'inv', type: 'investment', balance: 99999, balanceMode: 'manual' })] }))!;
check('una inversión no es dinero disponible', savingsInv.basis === 'declared');
const paidFixed = capacityFor(visa, ctxOf({ fixed: [{ ...luz, isPaid: true, paidCycleKey: '2026-10-27' }] }))!;
check('gasto fijo ya pagado en el período no se cuenta', near(paidFixed.committed, 2200), String(paidFixed.committed));
const farFixed = capacityFor(visa, ctxOf({ fixed: [{ ...luz, dayOfMonth: 5 }] }))!;
check('gasto fijo del 5-dic (después del pago del 2) no se cuenta; el del 5-nov atrasado sí', near(farFixed.committed, 2500), String(farFixed.committed));

// ── Mensajes ──
const mWarn = capacityMessage(lv(3500));
check('mensaje warn', mWarn.title.indexOf('Ojo') === 0 && mWarn.body.indexOf('71%') >= 0 && mWarn.body.indexOf('02/12') >= 0, mWarn.body);
const mAlert = capacityMessage(lv(2700));
check('mensaje alert', mAlert.title.indexOf('casi al límite') >= 0, mAlert.title);
const mRed = capacityMessage(lv(2000));
check('mensaje red dice cuánto falta', mRed.title.indexOf('No alcanza') === 0 && mRed.body.indexOf('Q500.00') >= 0, mRed.body);
check('mensaje con saldos lo dice', mWarn.body.indexOf('saldos') >= 0);
const mDecl = capacityMessage(noBal2);
check('mensaje basis declared lo DICE', mDecl.body.indexOf('ingreso declarado') >= 0 && mDecl.body.indexOf('aún no llevas saldos') >= 0, mDecl.body);
check('mensaje marca el estado estimado', mWarn.body.indexOf('(estimado)') >= 0);

// ── Llegó tu sueldo (27-nov): comprometido hasta el 26-dic y libre ──
const nowSal = d(2026, 11, 27, 10);
const salTxs: Transaction[] = [...cardTxs, { id: 'inc', amount: 8000, description: 's', category: 'salary', date: nowSal.toISOString(), type: 'income', source: 'sms', currency: 'Q', incomeSourceId: 's1', incomeCycleKey: '2026-11-27' }];
// Regla exacta: el sueldo del 27-dic (domingo) no se mueve al viernes 25 y cae fuera de lo cubierto (hasta el 26).
const salaryExact: IncomeSource = { ...salary, weekendRule: 'exact' };
const figs = salaryFigures(ctxOf({ now: nowSal, txs: salTxs, sources: [salaryExact], accounts: [visa, bank(5000)] }), 8000);
check('sueldo: cubre hasta el 26-dic', figs.until.getMonth() === 11 && figs.until.getDate() === 26, figs.until.toISOString());
check('sueldo: comprometido = estado 2200 + Luz 22-dic 300', near(figs.committed, 2500), String(figs.committed));
check('sueldo: libre = 5000 + 8000 - 2500', figs.free !== null && near(figs.free, 10500), String(figs.free));
check('sueldo: basis balances', figs.basis === 'balances');
const msg = salaryMessage(figs);
check('mensaje del sueldo', msg.title === 'Llegó tu sueldo' && msg.body.indexOf('Comprometido Q2,500.00') >= 0 && msg.body.indexOf('libre Q10,500.00') >= 0 && msg.body.indexOf('26/12') >= 0, msg.body);
const figsDecl = salaryFigures(ctxOf({ now: nowSal, txs: salTxs, accounts: [visa] }), 8000);
check('sueldo sin saldos: basis declared y el extra no se suma dos veces', figsDecl.basis === 'declared' && figsDecl.free !== null && near(figsDecl.free, 8000 - 2500), String(figsDecl.free));
check('mensaje del sueldo declared lo dice', salaryMessage(figsDecl).body.indexOf('ingreso declarado') >= 0);
const figsNone = salaryFigures(ctxOf({ now: nowSal, txs: salTxs, accounts: [visa], monthlyIncome: 0 }));
check('sueldo sin con qué calcular: libre null', figsNone.free === null && salaryMessage(figsNone).body.indexOf('Comprometido') === 0);
const figsNeg = salaryFigures(ctxOf({ now: nowSal, txs: salTxs, accounts: [visa, bank(1000)] }));
check('sueldo: si no alcanza dice cuánto falta', figsNeg.free !== null && figsNeg.free < 0 && salaryMessage(figsNeg).body.indexOf('te faltan') >= 0, salaryMessage(figsNeg).body);

// ── Piezas sueltas ──
const res = resourcesUntil(ctxOf({ accounts: [visa, bank(1234.5)] }), d(2026, 12, 2))!;
check('resourcesUntil: balances', res.basis === 'balances' && near(res.balances, 1234.5));
const com = commitmentsUntil(ctxOf({}), d(2026, 12, 2));
check('commitmentsUntil: 2200 + 300', near(com.total, 2500) && com.debtItems.length === 1 && com.fixedItems.length === 1, String(com.total));

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
