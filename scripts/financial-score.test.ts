process.env.TZ = 'America/Guatemala';
// Pruebas del score financiero por período (services/FinancialScore.ts). Sin dependencias:
//   npm run test:financial-score   →   sucrase-node scripts/financial-score.test.ts

import { computeFinancialScore, SAVINGS_PENDING_TEXT } from '../services/FinancialScore';
import type { ScoreInput } from '../services/FinancialScore';
import { incomeQOf, spentQOf, txsInPeriod } from '../services/NotificationTexts';
import { isTransferLike } from '../services/BudgetBreakdown';
import type { FixedExpense, Transaction } from '../services/storage';

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

function tx(id: string, type: 'income' | 'expense', amount: number, date: string, extra: Partial<Transaction> = {}): Transaction {
  return { id, amount, description: `mov ${id}`, category: type === 'income' ? 'salary' : 'food', date, type, source: 'manual', currency: 'Q', ...extra };
}

function fx(id: string, isPaid: boolean, isActive = true): FixedExpense {
  return { id, name: `fijo ${id}`, amount: 100, dueDay: 5, category: 'bills', isPaid, isActive } as unknown as FixedExpense;
}

// Período: 27 oct – 26 nov 2026 (sueldo el 27)
const window = { start: d(2026, 10, 27, 0, 0), end: d(2026, 11, 26, 23, 59) };

function input(over: Partial<ScoreInput>): ScoreInput {
  return { transactions: [], window, budgetForPeriod: 4000, fixedExpenses: [], activeAccountsCount: 1, ...over };
}
const factor = (r: ReturnType<typeof computeFinancialScore>, id: string) => r.factors.find(f => f.id === id)!;

// ── 1. Sueldo del 27: el 5 de noviembre el ingreso del 27 de octubre cuenta ──
{
  const txs = [tx('sal', 'income', 5000, '2026-10-27'), tx('g1', 'expense', 4200, '2026-11-05')];
  const r = computeFinancialScore(input({ transactions: txs, fixedExpenses: [fx('a', true), fx('b', true)] }));
  check('sueldo 27: ingreso cuenta', r.incomeQ === 5000, String(r.incomeQ));
  check('sueldo 27: gasto', r.expenseQ === 4200, String(r.expenseQ));
  check('sueldo 27: tasa 16%', r.savingsRate !== null && Math.abs(r.savingsRate - 16) < 1e-9, String(r.savingsRate));
  check('sueldo 27: ahorro +10', factor(r, 'savings').points === 10 && factor(r, 'savings').state === 'ok');
  // 50 + 10 (ahorro) + (4200 > 4000 → -10) + 10 (fijos) + 5 (cuentas) = 65
  check('sueldo 27: regresión de pesos', r.score === 65, String(r.score));
}

// ── 2. Día 1 del período, sin ingreso: ahorro pendiente, 50 + 15 + 5 ──
{
  const r = computeFinancialScore(input({}));
  check('día 1: savingsRate null', r.savingsRate === null);
  check('día 1: ahorro pending', factor(r, 'savings').state === 'pending' && factor(r, 'savings').points === 0);
  check('día 1: texto de ahorro pendiente', factor(r, 'savings').text === SAVINGS_PENDING_TEXT);
  check('día 1: score 70', r.score === 70, String(r.score));
  check('día 1: 4 factores en orden', r.factors.map(f => f.id).join(',') === 'savings,budget,fixed,accounts');
}

// ── 3. Tasas: tramos exactos ──
{
  const at = (income: number, expense: number) =>
    computeFinancialScore(input({ budgetForPeriod: 0, activeAccountsCount: 0, transactions: [tx('i', 'income', income, '2026-11-01'), tx('e', 'expense', expense, '2026-11-02')] }));
  check('tasa 20% exacta suma 20', at(1000, 800).score === 70, String(at(1000, 800).score));
  check('tasa 10% exacta suma 10', at(1000, 900).score === 60, String(at(1000, 900).score));
  check('tasa 9.9% suma 0', at(1000, 901).score === 50, String(at(1000, 901).score));
  check('tasa 0% suma 0', at(1000, 1000).score === 50, String(at(1000, 1000).score));
  check('tasa negativa resta 15', at(1000, 1001).score === 35, String(at(1000, 1001).score));
}

// ── 4. Formatos de fecha: solo-día e ISO de medianoche UTC ──
{
  const sd = computeFinancialScore(input({ transactions: [tx('a', 'income', 100, '2026-10-27')] }));
  check('fecha YYYY-MM-DD el primer día entra', sd.incomeQ === 100);
  const iso = computeFinancialScore(input({ transactions: [tx('a', 'income', 100, '2026-10-27T06:00:00.000Z')] }));
  check('ISO T06:00:00Z (medianoche local) el primer día entra', iso.incomeQ === 100, String(iso.incomeQ));
  const before = computeFinancialScore(input({ transactions: [tx('a', 'income', 100, '2026-10-27T05:59:00.000Z')] }));
  check('ISO 26 oct 23:59 local queda fuera', before.incomeQ === 0, String(before.incomeQ));
  const last = computeFinancialScore(input({ transactions: [tx('a', 'income', 100, d(2026, 11, 26, 23, 30).toISOString())] }));
  check('23:30 del último día entra', last.incomeQ === 100, String(last.incomeQ));
  const lastDay = computeFinancialScore(input({ transactions: [tx('a', 'income', 100, '2026-11-26')] }));
  check('YYYY-MM-DD del último día entra', lastDay.incomeQ === 100);
  const after = computeFinancialScore(input({ transactions: [tx('a', 'income', 100, '2026-11-27')] }));
  check('27 nov (siguiente período) queda fuera', after.incomeQ === 0);
}

// ── 5. Transferencias y monedas distintas de Q fuera ──
{
  const txs = [
    tx('i', 'income', 1000, '2026-11-01'),
    tx('e1', 'expense', 100, '2026-11-02'),
    tx('e2', 'expense', 500, '2026-11-03', { transferPairId: 'tp1' }),
    tx('e3', 'expense', 300, '2026-11-04', { type: 'transfer' }),
    tx('e4', 'expense', 700, '2026-11-05', { currency: 'USD' }),
    tx('i2', 'income', 900, '2026-11-06', { currency: 'USD' }),
    tx('i3', 'income', 400, '2026-11-07', { transferPairId: 'tp2' }),
  ];
  const r = computeFinancialScore(input({ transactions: txs }));
  check('transferencias y USD fuera del gasto', r.expenseQ === 100, String(r.expenseQ));
  check('transferencias y USD fuera del ingreso', r.incomeQ === 1000, String(r.incomeQ));
}

// ── 6. Presupuesto 0: neutral (antes restaba 10) ──
{
  const r = computeFinancialScore(input({ budgetForPeriod: 0, transactions: [tx('e', 'expense', 50, '2026-11-02')] }));
  check('presupuesto 0: pending', factor(r, 'budget').state === 'pending' && factor(r, 'budget').points === 0);
  check('presupuesto 0: score 55', r.score === 55, String(r.score));
  const neg = computeFinancialScore(input({ budgetForPeriod: -5 }));
  check('presupuesto negativo: neutral', factor(neg, 'budget').points === 0);
  const within = computeFinancialScore(input({ budgetForPeriod: 50, transactions: [tx('e', 'expense', 50, '2026-11-02')] }));
  check('gasto == presupuesto: +15', factor(within, 'budget').points === 15 && factor(within, 'budget').state === 'good');
  const over = computeFinancialScore(input({ budgetForPeriod: 50, transactions: [tx('e', 'expense', 50.01, '2026-11-02')] }));
  check('gasto > presupuesto: -10', factor(over, 'budget').points === -10 && factor(over, 'budget').state === 'bad');
}

// ── 7. Cuentas y fijos ──
{
  const none = computeFinancialScore(input({ activeAccountsCount: 0 }));
  check('0 cuentas activas: no suma', factor(none, 'accounts').points === 0 && none.score === 65, String(none.score));
  const some = computeFinancialScore(input({ activeAccountsCount: 3 }));
  check('cuentas activas: +5', factor(some, 'accounts').points === 5);
  const partial = computeFinancialScore(input({ fixedExpenses: [fx('a', true), fx('b', false)] }));
  check('fijos parciales: 0', factor(partial, 'fixed').points === 0 && factor(partial, 'fixed').state === 'ok');
  const inactiveIgnored = computeFinancialScore(input({ fixedExpenses: [fx('a', true), fx('b', false, false)] }));
  check('fijo inactivo no cuenta: todos pagados +10', factor(inactiveIgnored, 'fixed').points === 10);
  const noFixed = computeFinancialScore(input({ fixedExpenses: [fx('a', false, false)] }));
  check('sin fijos activos: neutral', factor(noFixed, 'fixed').points === 0 && factor(noFixed, 'fixed').state === 'pending');
}

// ── 8. Recorte 0–100 (rango real de los pesos: 25..100) ──
{
  const best = computeFinancialScore(input({
    fixedExpenses: [fx('a', true)],
    transactions: [tx('i', 'income', 1000, '2026-11-01'), tx('e', 'expense', 100, '2026-11-02')],
  }));
  check('máximo 100', best.score === 100, String(best.score));
  const worst = computeFinancialScore(input({
    activeAccountsCount: 0, budgetForPeriod: 10,
    transactions: [tx('i', 'income', 100, '2026-11-01'), tx('e', 'expense', 5000, '2026-11-02')],
  }));
  check('peor caso 25 (nunca bajo 0)', worst.score === 25, String(worst.score));
  let inRange = true;
  for (const inc of [0, 100, 1000]) for (const exp of [0, 50, 500, 5000]) for (const bud of [0, 100, 1000]) for (const acc of [0, 2]) for (const paid of [true, false]) {
    const txs: Transaction[] = [];
    if (inc > 0) txs.push(tx('i', 'income', inc, '2026-11-01'));
    if (exp > 0) txs.push(tx('e', 'expense', exp, '2026-11-02'));
    const sc = computeFinancialScore(input({ transactions: txs, budgetForPeriod: bud, activeAccountsCount: acc, fixedExpenses: [fx('a', paid)] })).score;
    if (!(sc >= 0 && sc <= 100 && Number.isInteger(sc))) inRange = false;
  }
  check('barrido de combinaciones: entero 0–100', inRange);
}

// ── 9. Unificación de cifras: anillo del Inicio, score, avisos y widget ──
{
  const txs = [
    tx('i', 'income', 5000, '2026-10-27'),
    tx('e1', 'expense', 100, '2026-11-02'),
    tx('e2', 'expense', 250, '2026-11-03', { transferPairId: 'tp9' }),   // gasto emparejado como transferencia
    tx('e3', 'expense', 40, '2026-11-04', { currency: 'USD' }),
    tx('e4', 'expense', 60, d(2026, 11, 26, 23, 30).toISOString()),      // último día, 23:30
  ];
  // Cálculo VIEJO del Dashboard: instantes + suma de todo lo que sea gasto en Q (incluía el emparejado).
  const legacyExpense = txs
    .filter(t => { const dt = new Date(t.date); return dt >= window.start && dt <= window.end; })
    .filter(t => t.type === 'expense' && (t.currency === 'Q' || !t.currency))
    .reduce((s, t) => s + t.amount, 0);
  const periodTx = txsInPeriod(txs, window.start, window.end);
  // Cálculo NUEVO del Dashboard (anillo): spentQOf; USD excluye isTransferLike.
  const ring = spentQOf(periodTx);
  const usd = periodTx.filter(t => t.type === 'expense' && t.currency === 'USD' && !isTransferLike(t)).reduce((s, t) => s + t.amount, 0);
  const r = computeFinancialScore(input({ transactions: txs }));
  check('el cálculo viejo sí sumaba el emparejado (410)', legacyExpense === 410, String(legacyExpense));
  check('anillo = spentQOf = 160 (sin emparejado)', ring === 160, String(ring));
  check('score usa la misma cifra que el anillo', r.expenseQ === ring, `${r.expenseQ} vs ${ring}`);
  check('ingreso del score = incomeQOf', r.incomeQ === incomeQOf(periodTx) && r.incomeQ === 5000);
  check('USD del Inicio sigue siendo 40', usd === 40, String(usd));
}

console.log(failures === 0 ? `OK  ${checks} comprobaciones` : `${failures} FALLAS de ${checks}`);
process.exit(failures === 0 ? 0 : 1);
