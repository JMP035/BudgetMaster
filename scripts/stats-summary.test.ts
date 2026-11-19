process.env.TZ = 'America/Guatemala';
// Pruebas de StatsSummary (resumen de Estadísticas por moneda y transferencias sin clasificar). Sin dependencias:
//   npm run test:stats-summary   →   sucrase-node scripts/stats-summary.test.ts

import {
  explainSavings, hasCurrencyActivity, isNeutralTx, isUnclassifiedTransfer, savingsComment, savingsLevel,
  statsRange, summarizeStats, topCategories, txCurrency, txsInRange,
} from '../services/StatsSummary';
import type { StatsSummary } from '../services/StatsSummary';
import type { Transaction } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

// ───────────── Fábricas ─────────────
const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);

function tx(id: string, type: Transaction['type'], amount: number, category: string, date: string, extra: Partial<Transaction> = {}): Transaction {
  return { id, amount, description: id, category, date, type, source: 'manual', currency: 'Q', ...extra };
}
const exp = (id: string, amount: number, category: string, date = '2026-07-10', extra: Partial<Transaction> = {}) =>
  tx(id, 'expense', amount, category, date, extra);
const inc = (id: string, amount: number, category: string, date = '2026-07-10', extra: Partial<Transaction> = {}) =>
  tx(id, 'income', amount, category, date, extra);

const NOW = d(2026, 7, 30, 10);
const FP = { start: d(2026, 7, 1, 0), end: d(2026, 7, 31, 23, 59), prevStart: d(2026, 6, 1, 0), prevEnd: d(2026, 6, 30, 23, 59) };

// ═════════════ Rangos ═════════════
console.log('Rangos');
{
  const cur = statsRange('current', FP, NOW);
  check('rango actual', cur.start === FP.start && cur.end === FP.end);
  const prev = statsRange('prev', FP, NOW);
  check('rango anterior', prev.start === FP.prevStart && prev.end === FP.prevEnd);
  const year = statsRange('year', FP, NOW);
  check('rango año', year.start?.getFullYear() === 2026 && year.start?.getMonth() === 0 && year.start?.getDate() === 1
    && year.end?.getMonth() === 11 && year.end?.getDate() === 31);
  const all = statsRange('all', FP, NOW);
  check('rango todo', all.start === null && all.end === null);

  const list = [
    exp('a', 10, 'food', '2026-07-01'),                    // primer día
    exp('b', 10, 'food', '2026-07-31'),                    // último día
    exp('c', 10, 'food', '2026-06-30'),                    // día anterior al inicio
    exp('d', 10, 'food', '2026-08-01'),                    // día posterior
    exp('e', 10, 'food', d(2026, 7, 31, 23, 59).toISOString()), // ISO con hora en el borde del día (local)
    exp('f', 10, 'food', d(2026, 7, 1, 0, 1).toISOString()),    // ISO con hora al inicio del día (local)
    exp('g', 10, 'food', d(2026, 6, 30, 23, 59).toISOString()), // un minuto antes del período
    exp('h', 10, 'food', 'no es fecha'),
  ];
  const ids = txsInRange(list, cur).map(t => t.id).sort().join(',');
  check('txsInRange: bordes del día local', ids === 'a,b,e,f', ids);
  check('txsInRange: todo devuelve la misma lista', txsInRange(list, all) === list);
  check('txsInRange: año', txsInRange(list, year).length === 7);
  check('txsInRange: período anterior', txsInRange(list, prev).map(t => t.id).sort().join(',') === 'c,g');
}

// ═════════════ Neutros, monedas y transferencias ═════════════
console.log('Neutros y monedas');
{
  check('txCurrency: vacío = Q', txCurrency({ ...exp('x', 1, 'food'), currency: undefined as unknown as 'Q' }) === 'Q');
  check('isNeutralTx: type transfer', isNeutralTx(tx('t', 'transfer', 5, 'transfer', '2026-07-10')));
  check('isNeutralTx: transferPairId', isNeutralTx(exp('t2', 5, 'transfer', '2026-07-10', { transferPairId: 'p1' })));
  check('isNeutralTx: pago de tarjeta', isNeutralTx(exp('t4', 5, 'transfer', '2026-07-10', { cardPayment: { cardId: 'c', cutKey: '2026-07-01' } })));
  check('isNeutralTx: gasto normal no', !isNeutralTx(exp('t3', 5, 'food')));

  check('sin clasificar: gasto Transferencia', isUnclassifiedTransfer(exp('u1', 100, 'transfer')));
  check('sin clasificar: ingreso transfer_in', isUnclassifiedTransfer(inc('u2', 100, 'transfer_in')));
  check('sin clasificar: la manual también cuenta', isUnclassifiedTransfer(exp('u3', 100, 'transfer', '2026-07-10', { source: 'manual' })));
  check('sin clasificar: el pago de tarjeta no', !isUnclassifiedTransfer(exp('u4', 100, 'transfer', '2026-07-10', { cardPayment: { cardId: 'c', cutKey: '2026-07-01' } })));
  check('sin clasificar: el par no', !isUnclassifiedTransfer(exp('u5', 100, 'transfer', '2026-07-10', { transferPairId: 'p' })));
  check('sin clasificar: type transfer no', !isUnclassifiedTransfer(tx('u6', 'transfer', 100, 'transfer', '2026-07-10')));
  check('sin clasificar: gasto de comida no', !isUnclassifiedTransfer(exp('u7', 100, 'food')));
  check('sin clasificar: ingreso de sueldo no', !isUnclassifiedTransfer(inc('u8', 100, 'salary')));

  const mix = [exp('q', 10, 'food'), exp('u', 20, 'food', '2026-07-10', { currency: 'USD' }), exp('e', 30, 'food', '2026-07-10', { currency: 'EUR' })];
  check('actividad Q', hasCurrencyActivity(mix, 'Q'));
  check('actividad USD', hasCurrencyActivity(mix, 'USD'));
  check('sin USD', !hasCurrencyActivity([mix[0]], 'USD'));
  check('EUR no cuenta como USD ni Q', !hasCurrencyActivity([mix[2]], 'USD') && !hasCurrencyActivity([mix[2]], 'Q'));
  check('neutros no son actividad', !hasCurrencyActivity([tx('t', 'transfer', 5, 'transfer', '2026-07-10', { currency: 'USD' })], 'USD'));

  const list = [
    inc('i1', 1000, 'salary'), exp('e1', 300, 'food'), exp('e2', 100, 'transport'),
    inc('i2', 50, 'salary', '2026-07-10', { currency: 'USD' }), exp('e3', 20, 'food', '2026-07-10', { currency: 'USD' }),
    { ...exp('e4', 40, 'food'), currency: undefined as unknown as 'Q' },
    tx('t1', 'transfer', 999, 'transfer', '2026-07-10'),
    exp('t2', 888, 'transfer', '2026-07-10', { transferPairId: 'p9' }),
    exp('e5', 77, 'food', '2026-07-10', { currency: 'EUR' }),
  ];
  const q = summarizeStats(list, { currency: 'Q', excludeUnclassified: false });
  check('Q: ingresos 1000', q.income === 1000, String(q.income));
  check('Q: gastos 440 (incluye el sin moneda)', q.expense === 440, String(q.expense));
  check('Q: ahorro 560', q.savings === 560);
  check('Q: tasa 56 %', q.savingsRate !== null && Math.abs(q.savingsRate - 56) < 1e-9, String(q.savingsRate));
  const u = summarizeStats(list, { currency: 'USD', excludeUnclassified: false });
  check('USD aparte: 50 / 20 / 30', u.income === 50 && u.expense === 20 && u.savings === 30);
  check('neutros y EUR nunca suman', q.expense === 440 && u.expense === 20);
}

// ═════════════ Sin clasificar y exclusión ═════════════
console.log('Transferencias sin clasificar');
{
  const list = [
    inc('i1', 2000, 'salary'), exp('e1', 500, 'food'),
    exp('t1', 300, 'transfer', '2026-07-10', { source: 'sms' }),
    exp('t2', 100, 'transfer', '2026-07-11', { source: 'manual' }),
    inc('t3', 400, 'transfer_in', '2026-07-12', { source: 'sms' }),
    exp('cp', 250, 'transfer', '2026-07-13', { source: 'sms', cardPayment: { cardId: 'c', cutKey: '2026-07-01' } }),
    exp('pp', 150, 'transfer', '2026-07-14', { source: 'sms', transferPairId: 'p1' }),
  ];
  const on = summarizeStats(list, { currency: 'Q', excludeUnclassified: false });
  check('con transferencias: gastos 900', on.expense === 900, String(on.expense));
  check('con transferencias: ingresos 2400', on.income === 2400, String(on.income));
  check('unclassified: cuenta 3', on.unclassified.count === 3, String(on.unclassified.count));
  check('unclassified: gasto 400, ingreso 400, total 800', on.unclassified.expense === 400 && on.unclassified.income === 400 && on.unclassified.total === 800);
  check('unclassified: reparto SMS / manual', on.unclassified.smsIds.sort().join(',') === 't1,t3' && on.unclassified.manualIds.join(',') === 't2');
  check('unclassified: todos los ids', on.unclassified.txIds.sort().join(',') === 't1,t2,t3');
  check('no excluido', on.excluded === false);

  const off = summarizeStats(list, { currency: 'Q', excludeUnclassified: true });
  check('excluidas: gastos 500 e ingresos 2000', off.expense === 500 && off.income === 2000, `${off.expense}/${off.income}`);
  check('excluidas: las categorías también cambian', !off.expenseByCategory.some(c => c.id === 'transfer') && !off.incomeByCategory.some(c => c.id === 'transfer_in'));
  check('excluidas: unclassified se mantiene', JSON.stringify(off.unclassified) === JSON.stringify(on.unclassified));
  check('excluidas: excluded verdadero', off.excluded === true);
  check('excluidas sin nada que excluir: excluded falso', summarizeStats([inc('i', 10, 'salary')], { currency: 'Q', excludeUnclassified: true }).excluded === false);

  // El aviso del período anterior se calcula con los movimientos de ese período.
  const prevList = [exp('pt', 600, 'transfer', '2026-06-15', { source: 'sms' }), exp('cur', 50, 'food', '2026-07-10')];
  const prevSum = summarizeStats(txsInRange(prevList, statsRange('prev', FP, NOW)), { currency: 'Q', excludeUnclassified: false });
  const curSum = summarizeStats(txsInRange(prevList, statsRange('current', FP, NOW)), { currency: 'Q', excludeUnclassified: false });
  check('período anterior: el aviso cuenta su transferencia', prevSum.unclassified.count === 1 && prevSum.unclassified.total === 600);
  check('período actual: sin aviso', curSum.unclassified.count === 0);

  // Una transferencia en dólares no se mezcla con la lista de quetzales.
  const usdT = [exp('tu', 40, 'transfer', '2026-07-10', { currency: 'USD', source: 'sms' })];
  check('sin clasificar por moneda', summarizeStats(usdT, { currency: 'Q', excludeUnclassified: false }).unclassified.count === 0
    && summarizeStats(usdT, { currency: 'USD', excludeUnclassified: false }).unclassified.count === 1);
}

// ═════════════ Ahorro, categorías y frases ═════════════
console.log('Ahorro y categorías');
{
  const none = summarizeStats([exp('e', 100, 'food')], { currency: 'Q', excludeUnclassified: false });
  check('sin ingresos: tasa null', none.savingsRate === null);
  check('sin ingresos: nivel no_income', savingsLevel(none) === 'no_income');
  check('sin ingresos: comentario nuevo', savingsComment('no_income') === 'Sin ingresos registrados en este período: no se puede calcular la tasa.');
  check('comentarios actuales', savingsComment('great') === 'Excelente: superas el 20% recomendado'
    && savingsComment('low') === 'Bajo: apunta al 20% mínimo' && savingsComment('negative') === 'Negativo: gastas más de lo que ingresas');

  const mk = (income: number, expense: number): StatsSummary =>
    summarizeStats([inc('i', income, 'salary'), exp('e', expense, 'food')], { currency: 'Q', excludeUnclassified: false });
  check('nivel: 20 % exacto = great', savingsLevel(mk(1000, 800)) === 'great');
  check('nivel: 19.9 % = low', savingsLevel(mk(1000, 801)) === 'low');
  check('nivel: 0 % exacto = low', savingsLevel(mk(1000, 1000)) === 'low');
  check('nivel: bajo 0 = negative', savingsLevel(mk(1000, 1001)) === 'negative');

  const big = summarizeStats([
    inc('i', 5000, 'salary'),
    exp('a', 333.33, 'food'), exp('b', 333.33, 'transport'), exp('c', 333.34, 'rent'), exp('d', 100, 'food'), exp('e', 900, 'other'),
  ], { currency: 'Q', excludeUnclassified: false });
  const sumPct = big.expenseByCategory.reduce((a, c) => a + c.pct, 0);
  check('porcentajes suman unos 100', Math.abs(sumPct - 100) < 0.1, String(sumPct));
  check('categorías de mayor a menor', big.expenseByCategory.map(c => c.id).join(',') === 'other,food,rent,transport', big.expenseByCategory.map(c => c.id).join(','));
  check('conteo por categoría', big.expenseByCategory.find(c => c.id === 'food')?.count === 2);
  check('valor redondeado a 2 decimales', big.expenseByCategory.find(c => c.id === 'food')?.value === 433.33);
  check('ingresos por categoría', big.incomeByCategory.length === 1 && big.incomeByCategory[0].id === 'salary' && big.incomeByCategory[0].pct === 100);

  check('topCategories: límite por defecto 3', topCategories(big.expenseByCategory).map(c => c.id).join(',') === 'other,food,rent');
  check('topCategories: n = 1', topCategories(big.expenseByCategory, 1).map(c => c.id).join(',') === 'other');
  check('topCategories: n mayor que la lista', topCategories(big.expenseByCategory, 10).length === 4);
  check('topCategories: lista desordenada', topCategories([{ id: 'a', value: 1, pct: 1, count: 1 }, { id: 'b', value: 9, pct: 9, count: 1 }], 1)[0].id === 'b');

  const label = (id: string) => ({ food: 'Comida', other: 'Otros' } as Record<string, string>)[id] ?? id;
  const t1 = explainSavings(mk(1000, 600), label);
  check('explicar positivo', t1[0] === 'Te quedó Q 400: entró Q 1,000 y gastaste Q 600.', t1[0]);
  check('explicar: categoría principal', t1[1] === 'Lo que más pesó fue Comida: Q 600 (100 % de tus gastos).', t1[1]);
  const t2 = explainSavings(mk(1000, 1500), label);
  check('explicar negativo', t2[0] === 'Gastaste Q 500 más de lo que entró: Q 1,000 de ingresos contra Q 1,500 de gastos.', t2[0]);
  const t3 = explainSavings(none, label);
  check('explicar sin ingresos', t3[0] === 'Todavía no registras ingresos en quetzales en este período, así que tu ahorro es igual a tus gastos, en negativo.', t3[0]);
  const t4 = explainSavings(summarizeStats([], { currency: 'Q', excludeUnclassified: false }), label);
  check('explicar vacío', t4.length === 1 && t4[0] === 'No hay ingresos ni gastos en quetzales en este período.', t4.join('|'));
  const usd = summarizeStats([inc('i', 100, 'salary', '2026-07-10', { currency: 'USD' }), exp('e', 30, 'food', '2026-07-10', { currency: 'USD' })], { currency: 'USD', excludeUnclassified: false });
  const t5 = explainSavings(usd, label);
  check('explicar con USD usa $', t5[0] === 'Te quedó $ 70: entró $ 100 y gastaste $ 30.', t5[0]);
  check('explicar nombra la categoría principal con la etiqueta', t5[1].includes('Comida'), t5[1]);
  check('explicar vacío en dólares', explainSavings(summarizeStats([], { currency: 'USD', excludeUnclassified: false }), label)[0] === 'No hay ingresos ni gastos en dólares en este período.');

  const withT = summarizeStats([inc('i', 2000, 'salary'), exp('e', 500, 'food'), exp('t', 300, 'transfer', '2026-07-10', { source: 'sms' })], { currency: 'Q', excludeUnclassified: false });
  const t6 = explainSavings(withT, label);
  check('explicar: transferencias contadas', t6.some(x => x === 'Q 300 de tus gastos son transferencias sin clasificar. Si fue dinero entre tus cuentas, al aclararlo tu ahorro quedaría en Q 1,500.'), t6.join('|'));
  const exclT = summarizeStats([inc('i', 2000, 'salary'), exp('e', 500, 'food'), exp('t', 300, 'transfer', '2026-07-10', { source: 'sms' })], { currency: 'Q', excludeUnclassified: true });
  const t7 = explainSavings(exclT, label);
  check('explicar: transferencias excluidas', t7[t7.length - 1] === 'No se cuentan Q 300 en transferencias sin clasificar (interruptor «Sin transferencias»).', t7.join('|'));
  check('explicar: excluidas no repite el aviso de contadas', !t7.some(x => x.includes('al aclararlo')));
  const inT = summarizeStats([inc('i', 1000, 'salary'), inc('t', 200, 'transfer_in', '2026-07-10', { source: 'sms' }), exp('e', 100, 'food')], { currency: 'Q', excludeUnclassified: false });
  check('explicar: ingresos sin clasificar', explainSavings(inT, label).some(x => x.startsWith('Q 200 de tus ingresos son transferencias sin clasificar')));

  const all = [...t1, ...t2, ...t3, ...t4, ...t5, ...t6, ...t7];
  check('el texto no usa voseo', !all.some(x => /\b(vos|tenés|podés|gastaste vos)\b/i.test(x)));
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
