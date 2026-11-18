process.env.TZ = 'America/Guatemala';
// Pruebas del estado de cuenta, el pago de la tarjeta y la deuda programada (services/CardStatement.ts).
//   npm run test:card-statement   →   sucrase-node scripts/card-statement.test.ts

import {
  applyCardPaymentMatch, applyCardPaymentProposal, buildCardPaymentTxs, cardPaymentProposalKey, cutFromKey, cutKeyOf,
  debtsNotInFixed, liveCardPaymentProposals, matchCardPaymentSms, matchOutflowToCardPayment, planCardPaymentsUndo,
  proposeCardPayment, scheduledDebts, statementFor, sumDebts,
} from '../services/CardStatement';
import { isTransferLike, buildPeriodBreakdown } from '../services/BudgetBreakdown';
import { sumByCurrency } from '../services/CardCycle';
import { planSmsUndo } from '../services/SmsUndoPlan';
import type { Account, CreditInstallment, SmsBatchRecord, Transaction } from '../services/storage';

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
const ymd = (x: Date | null) => (x ? `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}` : 'null');

function card(id: string, extra: Partial<Account> = {}): Account {
  return {
    id, name: id, type: 'credit', currency: 'Q', balance: 0, initialBalance: 0, color: '#fff', icon: 'card',
    isActive: true, createdAt: d(2026, 1, 1).toISOString(), ...extra,
  };
}

function bank(id: string): Account {
  return { ...card(id), type: 'bank' };
}

function tx(id: string, date: Date, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return { id, amount, description: `mov ${id}`, category: 'other', date: date.toISOString(), type: 'expense', source: 'manual', currency: 'Q', ...extra };
}

function inst(id: string, extra: Partial<CreditInstallment> = {}): CreditInstallment {
  return {
    id, accountId: 'c1', name: 'Laptop', totalAmount: 6000, monthlyPayment: 500, totalInstallments: 12, paidInstallments: 0,
    startDate: d(2026, 8, 15).toISOString(), trackSince: d(2026, 8, 15).toISOString(), paidOffset: 0,
    currency: 'Q', category: 'shopping', isActive: true, ...extra,
  };
}

/** Los datos reales del usuario: ciclo 10 oct – 9 nov con Q 9,276.01 y US$ 39.67; corte 9, paga el 2. */
function userCycle(): Transaction[] {
  return [
    tx('q1', d(2026, 10, 10, 0, 5), 5000.5, { accountId: 'c1' }),
    tx('q2', d(2026, 10, 25), 4000, { accountId: 'c1' }),
    tx('q3', d(2026, 11, 9, 23, 30), 275.51, { accountId: 'c1' }),
    tx('u1', d(2026, 10, 12), 20.17, { accountId: 'c1', currency: 'USD' }),
    tx('u2', d(2026, 11, 3), 19.5, { accountId: 'c1', currency: 'USD' }),
    tx('antes', d(2026, 10, 9, 23, 0), 999, { accountId: 'c1' }),
  ];
}

const c1 = card('c1', { name: 'BAC Visa', cutoffDay: 9, paymentDueDay: 2, payFromAccountId: 'bac' });
const bac = bank('bac');
const NOW = d(2026, 11, 12);

// ─────────────────────────────────────────────────────────────
// Estimado vs real (los dos montos reales del usuario)
// ─────────────────────────────────────────────────────────────
{
  const st = statementFor(c1, userCycle(), [], NOW);
  check('estado: clave del corte 2026-11-09', st.cutKey === '2026-11-09' && ymd(st.cut) === '2026-11-09');
  check('estado: vence el 2 del mes siguiente', ymd(st.due) === '2026-12-02');
  check('estimado Q = 9,276.01', st.estimated.Q === 9276.01, String(st.estimated.Q));
  check('estimado USD = 39.67', st.estimated.USD === 39.67, String(st.estimated.USD));
  check('sin monto real: se paga el estimado y se etiqueta «estimado»', st.real === undefined && st.isEstimated && st.toPay.Q === 9276.01 && st.toPay.USD === 39.67);
  check('sin pagos: pendiente y falta todo', st.status === 'pending' && st.remaining.Q === 9276.01 && st.remaining.USD === 39.67 && st.paid.Q === 0);
  check('ciclo abierto vacío el 12 de nov', st.open.Q === 0 && st.open.USD === 0);

  const withReal = card('c1', {
    cutoffDay: 9, paymentDueDay: 2,
    statementOverrides: [{ cutKey: '2026-11-09', Q: 9276.01, USD: 39.67, at: NOW.toISOString() }],
  });
  const sr = statementFor(withReal, userCycle(), [], NOW);
  check('con monto real: ya no es estimado', !sr.isEstimated && sr.real?.Q === 9276.01 && sr.real?.USD === 39.67);
  check('con monto real: a pagar Q 9,276.01 y $ 39.67', sr.toPay.Q === 9276.01 && sr.toPay.USD === 39.67);

  const differs = card('c1', { cutoffDay: 9, paymentDueDay: 2, statementOverrides: [{ cutKey: '2026-11-09', Q: 9300, at: NOW.toISOString() }] });
  const sd = statementFor(differs, userCycle(), [], NOW);
  check('el real manda sobre el estimado (Q 9,300) y el USD sin real sigue estimado', sd.toPay.Q === 9300 && sd.toPay.USD === 39.67 && sd.isEstimated);
  const onlyQ = card('c1', { cutoffDay: 9, paymentDueDay: 2, statementOverrides: [{ cutKey: '2026-11-09', Q: 9300, USD: 39.67, at: NOW.toISOString() }] });
  check('con los dos reales no hay estimación', !statementFor(onlyQ, userCycle(), [], NOW).isEstimated);
  const oldOverride = card('c1', { cutoffDay: 9, paymentDueDay: 2, statementOverrides: [{ cutKey: '2026-10-09', Q: 1, at: NOW.toISOString() }] });
  check('un real de otro corte no se usa', statementFor(oldOverride, userCycle(), [], NOW).toPay.Q === 9276.01);

  // las transferencias y la propia mitad del pago nunca suman al estimado
  const list = [...userCycle(), tx('pago', d(2026, 11, 20), 3000, { accountId: 'c1', type: 'transfer', source: 'sms' })];
  check('un movimiento neutro de la tarjeta no suma al estimado', statementFor(c1, list, [], NOW).estimated.Q === 9276.01);

  check('cutFromKey / cutKeyOf van y vuelven', ymd(cutFromKey('2026-11-09')) === '2026-11-09' && cutKeyOf(d(2026, 1, 5)) === '2026-01-05' && cutFromKey('x') === null);
}

// ─────────────────────────────────────────────────────────────
// Pagos: parcial, por moneda, completo, vencido
// ─────────────────────────────────────────────────────────────
{
  const pay = (id: string, amount: number, currency: 'Q' | 'USD' = 'Q', at = d(2026, 11, 20)): Transaction =>
    tx(id, at, amount, { type: 'transfer', category: 'transfer', currency, toAccountId: 'c1', cardPayment: { cardId: 'c1', cutKey: '2026-11-09' } });

  const partial = statementFor(c1, [...userCycle(), pay('p1', 4000)], [], d(2026, 11, 21));
  check('pago parcial → partial; falta lo que resta', partial.status === 'partial' && partial.paid.Q === 4000 && partial.remaining.Q === 5276.01 && partial.remaining.USD === 39.67);

  const qOnly = statementFor(c1, [...userCycle(), pay('p1', 9276.01)], [], d(2026, 11, 21));
  check('Q pagado y USD pendiente → partial', qOnly.status === 'partial' && qOnly.remaining.Q === 0 && qOnly.remaining.USD === 39.67);

  const all = statementFor(c1, [...userCycle(), pay('p1', 9276.01), pay('p2', 39.67, 'USD')], [], d(2026, 11, 21));
  check('las dos monedas pagadas → paid', all.status === 'paid' && all.remaining.Q === 0 && all.remaining.USD === 0);

  const overpaid = statementFor(c1, [...userCycle(), pay('p1', 99999)], [], d(2026, 11, 21));
  check('pagar de más no deja saldo negativo', overpaid.remaining.Q === 0 && overpaid.remaining.USD === 39.67);

  const overdue = statementFor(c1, userCycle(), [], d(2026, 12, 3));
  check('después del 2 de diciembre sin pagar → overdue', overdue.status === 'overdue');
  check('el día del vencimiento todavía no está vencido', statementFor(c1, userCycle(), [], d(2026, 12, 2, 20)).status === 'pending');
  const overdueQ = statementFor(c1, [...userCycle(), pay('p1', 9276.01)], [], d(2026, 12, 3));
  check('vencido con un pago parcial sigue vencido', overdueQ.status === 'overdue');
  const paidLate = statementFor(c1, [...userCycle(), pay('p1', 9276.01), pay('p2', 39.67, 'USD')], [], d(2026, 12, 3));
  check('pagado completo nunca figura vencido', paidLate.status === 'paid');

  const noDue = statementFor(card('c1', { cutoffDay: 9 }), userCycle(), [], NOW);
  check('sin día de pago no hay vencimiento ni overdue', noDue.due === null && noDue.status === 'pending');

  // el pago de otro estado o de otra tarjeta no cuenta
  const other = tx('px', d(2026, 11, 20), 5000, { type: 'transfer', category: 'transfer', cardPayment: { cardId: 'c1', cutKey: '2026-10-09' } });
  const other2 = tx('py', d(2026, 11, 20), 5000, { type: 'transfer', category: 'transfer', cardPayment: { cardId: 'zzz', cutKey: '2026-11-09' } });
  check('el pago de otro estado u otra tarjeta no rebaja este', statementFor(c1, [...userCycle(), other, other2], [], NOW).paid.Q === 0);

  // el pago NO cuenta en el gasto del período (isTransferLike) ni en el ciclo abierto
  const made = buildCardPaymentTxs({ card: c1, cutKey: '2026-11-09', amounts: { Q: 5000, USD: 39.67 }, fromAccountId: 'bac', date: d(2026, 11, 20), idSeed: 'x' });
  check('registrar pago: un movimiento por moneda', made.length === 2 && made[0].currency === 'Q' && made[1].currency === 'USD');
  check('registrar pago: transferencia neutra con cardPayment', made.every(t => t.type === 'transfer' && t.category === 'transfer' && isTransferLike(t) && t.cardPayment?.cardId === 'c1' && t.toAccountId === 'c1' && t.fromAccountId === 'bac'));
  const period = { start: d(2026, 11, 1), end: d(2026, 11, 30, 23) };
  const bd = buildPeriodBreakdown(made, period);
  check('el pago no suma al gasto del período', bd.size === 0);
  const withExpense = buildPeriodBreakdown([...made, tx('g', d(2026, 11, 20), 100)], period);
  check('solo el gasto real suma al período', withExpense.get('other')?.qTotal === 100 && withExpense.size === 1);
  check('el pago no entra al ciclo de la tarjeta', sumByCurrency(made.map(t => ({ ...t, accountId: 'c1' })), 'c1', d(2026, 11, 1), d(2026, 11, 30)).length === 0);
  check('monto 0 o vacío no genera movimiento', buildCardPaymentTxs({ card: c1, cutKey: 'k', amounts: { Q: 0 }, date: NOW, idSeed: 'y' }).length === 0);
}

// ─────────────────────────────────────────────────────────────
// SMS de pago + salida de BAC: un solo par neutro, sin gasto nuevo
// ─────────────────────────────────────────────────────────────
{
  const cards = [c1];
  const out = tx('sms_out', d(2026, 11, 20, 9, 55), 5000, { source: 'sms', category: 'transfer', accountId: 'bac', bank: 'BAC' });
  const pay = tx('sms_pay', d(2026, 11, 20, 10, 0), 5000, { source: 'sms', type: 'transfer', category: 'transfer', accountId: 'c1', bank: 'BAC' });
  const base = [...userCycle(), out, pay];

  const m = matchCardPaymentSms(pay, cards, base, [], d(2026, 11, 21));
  check('el SMS de pago va al estado cerrado del 9 de nov', !!m && m.cardId === 'c1' && m.cutKey === '2026-11-09');
  check('se empareja con la salida de la cuenta pagadora', m?.outId === 'sms_out');
  const r = applyCardPaymentMatch(base, m!);
  const outAfter = r.txs.find(t => t.id === 'sms_out')!;
  const payAfter = r.txs.find(t => t.id === 'sms_pay')!;
  check('la salida queda neutra con transferPrev y fromAccountId', r.paired && outAfter.type === 'transfer' && outAfter.transferPrev?.type === 'expense' && outAfter.transferPrev?.category === 'transfer' && outAfter.fromAccountId === 'bac' && outAfter.toAccountId === 'c1');
  check('es UN solo par: mismo transferPairId en las dos mitades', !!outAfter.transferPairId && outAfter.transferPairId === payAfter.transferPairId);
  check('solo la mitad de la tarjeta lleva el pago (sin doble conteo)', !!payAfter.cardPayment && !outAfter.cardPayment);
  check('no se creó ningún movimiento nuevo', r.txs.length === base.length);
  check('ninguna de las dos mitades es gasto', isTransferLike(outAfter) && isTransferLike(payAfter));
  const bdBefore = buildPeriodBreakdown(base, { start: d(2026, 11, 1), end: d(2026, 11, 30, 23) });
  const bdAfter = buildPeriodBreakdown(r.txs, { start: d(2026, 11, 1), end: d(2026, 11, 30, 23) });
  check('antes de emparejar la salida SÍ contaba como gasto; después ya no', bdBefore.get('transfer')?.qTotal === 5000 && !bdAfter.has('transfer'));
  const st = statementFor(c1, r.txs, [], d(2026, 11, 21));
  check('el estado cuenta el pago UNA sola vez', st.paid.Q === 5000 && st.remaining.Q === 4276.01 && st.status === 'partial');
  check('idempotente: no se vuelve a emparejar', matchCardPaymentSms(payAfter, cards, r.txs, [], d(2026, 11, 21)) === null);

  // la salida llega después del SMS de la tarjeta
  const onlyPay = [...userCycle(), pay];
  const m1 = matchCardPaymentSms(pay, cards, onlyPay, [], d(2026, 11, 21))!;
  check('sin salida todavía: el SMS igual rebaja el estado', m1.outId === undefined && m1.cutKey === '2026-11-09');
  const s1 = applyCardPaymentMatch(onlyPay, m1);
  check('sin salida: no hay par y el pago queda marcado', !s1.paired && s1.txs.find(t => t.id === 'sms_pay')!.cardPayment?.cutKey === '2026-11-09');
  const later = [...s1.txs, out];
  const m2 = matchOutflowToCardPayment(out, cards, later);
  check('la salida que llega después se empareja con el pago', !!m2 && m2.outOnly === true && m2.txId === 'sms_pay' && m2.outId === 'sms_out');
  const s2 = applyCardPaymentMatch(later, m2!);
  check('la salida tardía queda neutra y el estado no cambia', s2.paired && isTransferLike(s2.txs.find(t => t.id === 'sms_out')!) && statementFor(c1, s2.txs, [], d(2026, 11, 21)).paid.Q === 5000);

  // lo que NO se empareja
  const farOut = { ...out, date: d(2026, 11, 22, 10, 5).toISOString() }; // 48 h
  check('salida a más de 36 h: no se empareja', matchCardPaymentSms(pay, cards, [...userCycle(), farOut, pay], [], NOW)?.outId === undefined);
  const otherAmt = { ...out, amount: 4999.5 };
  check('monto distinto: no se empareja', matchCardPaymentSms(pay, cards, [...userCycle(), otherAmt, pay], [], NOW)?.outId === undefined);
  const tolerance = { ...out, amount: 5000.01 };
  check('monto igual ±0.01: sí se empareja', matchCardPaymentSms(pay, cards, [...userCycle(), tolerance, pay], [], NOW)?.outId === 'sms_out');
  const otherAcc = { ...out, accountId: 'otra' };
  check('salida de otra cuenta: no se empareja', matchCardPaymentSms(pay, cards, [...userCycle(), otherAcc, pay], [], NOW)?.outId === undefined);
  const noPayFrom = card('c1', { cutoffDay: 9, paymentDueDay: 2 });
  check('sin cuenta pagadora configurada no hay par', matchCardPaymentSms(pay, [noPayFrom], base, [], NOW)?.outId === undefined);
  const usdOut = { ...out, currency: 'USD' as const };
  check('otra moneda: no se empareja', matchCardPaymentSms(pay, cards, [...userCycle(), usdOut, pay], [], NOW)?.outId === undefined);

  // no aplica
  check('SMS sin cuenta de tarjeta: no aplica', matchCardPaymentSms({ ...pay, accountId: undefined }, cards, base, [], NOW) === null);
  check('SMS de una cuenta que no es tarjeta: no aplica', matchCardPaymentSms({ ...pay, accountId: 'bac' }, cards, base, [], NOW) === null);
  check('un gasto no es pago de tarjeta', matchCardPaymentSms({ ...pay, type: 'expense' }, cards, base, [], NOW) === null);
  const manual = tx('man', d(2026, 11, 20, 8), 5000, { type: 'transfer', category: 'transfer', toAccountId: 'c1', cardPayment: { cardId: 'c1', cutKey: '2026-11-09' } });
  check('si ya registraste ese pago a mano, el SMS no suma otro', matchCardPaymentSms(pay, cards, [...userCycle(), manual, pay], [], NOW) === null);

  // USD paga el estado que debe USD; un estado ya pagado en esa moneda pasa al anterior
  const usdPay = tx('sms_usd', d(2026, 11, 20, 12), 39.67, { source: 'sms', type: 'transfer', category: 'transfer', accountId: 'c1', currency: 'USD' });
  check('un pago en dólares va al estado que debe dólares', matchCardPaymentSms(usdPay, cards, [...userCycle(), usdPay], [], NOW)?.cutKey === '2026-11-09');
  const octCard = [
    tx('o1', d(2026, 9, 20), 1000, { accountId: 'c1' }),
    tx('n1', d(2026, 10, 20), 2000, { accountId: 'c1' }),
  ];
  const novPay = tx('sms_n', d(2026, 11, 20, 12), 2000, { source: 'sms', type: 'transfer', category: 'transfer', accountId: 'c1' });
  check('el pago del 20 de nov cubre el corte del 9 de nov', matchCardPaymentSms(novPay, cards, [...octCard, novPay], [], d(2026, 11, 21))?.cutKey === '2026-11-09');
  const earlyPay = tx('sms_e', d(2026, 11, 5, 12), 1000, { source: 'sms', type: 'transfer', category: 'transfer', accountId: 'c1' });
  check('un pago anterior al corte (5 de nov) cubre el estado del 9 de oct', matchCardPaymentSms(earlyPay, cards, [...octCard, earlyPay], [], d(2026, 11, 21))?.cutKey === '2026-10-09');
}

// ─────────────────────────────────────────────────────────────
// Propuesta «¿Es el pago de tu tarjeta?» (±1 % entre el corte y el vencimiento + 5 días)
// ─────────────────────────────────────────────────────────────
{
  const cards = [c1];
  const mk = (id: string, amount: number, at: Date, extra: Partial<Transaction> = {}) =>
    tx(id, at, amount, { source: 'sms', category: 'transfer', accountId: 'bac', bank: 'BAC', ...extra });
  const base = userCycle();

  const exact = mk('o1', 9276.01, d(2026, 11, 28));
  const p1 = proposeCardPayment(exact, cards, [...base, exact], [], d(2026, 11, 29));
  check('propuesta: monto igual a lo que falta', !!p1 && p1.cardId === 'c1' && p1.cutKey === '2026-11-09' && p1.remaining === 9276.01);
  const within = mk('o2', 9276.01 * 1.009, d(2026, 11, 28));
  check('propuesta: dentro de ±1 %', !!proposeCardPayment(within, cards, [...base, within], [], d(2026, 11, 29)));
  const outside = mk('o3', 9276.01 * 1.02, d(2026, 11, 28));
  check('propuesta: fuera de ±1 % no se propone', proposeCardPayment(outside, cards, [...base, outside], [], d(2026, 11, 29)) === null);
  const lateOk = mk('o4', 9276.01, d(2026, 12, 7));
  check('propuesta: hasta 5 días después del vencimiento (7 dic)', !!proposeCardPayment(lateOk, cards, [...base, lateOk], [], d(2026, 12, 8)));
  const tooLate = mk('o5', 9276.01, d(2026, 12, 8));
  check('propuesta: más de 5 días después del vencimiento no', proposeCardPayment(tooLate, cards, [...base, tooLate], [], d(2026, 12, 9)) === null);
  const beforeCut = mk('o6', 9276.01, d(2026, 11, 8));
  check('propuesta: antes del corte no', proposeCardPayment(beforeCut, cards, [...base, beforeCut], [], NOW) === null);
  const otherAcc = mk('o7', 9276.01, d(2026, 11, 28), { accountId: 'otra' });
  check('propuesta: solo de la cuenta pagadora', proposeCardPayment(otherAcc, cards, [...base, otherAcc], [], d(2026, 11, 29)) === null);
  const usd = mk('o8', 39.67, d(2026, 11, 28), { currency: 'USD' });
  check('propuesta: cada moneda contra su saldo (US$ 39.67)', proposeCardPayment(usd, cards, [...base, usd], [], d(2026, 11, 29))?.currency === 'USD');
  const already = mk('o9', 9276.01, d(2026, 11, 28), { transferPairId: 'tp_x', type: 'transfer' });
  check('propuesta: una salida ya neutra no se propone', proposeCardPayment(already, cards, [...base, already], [], d(2026, 11, 29)) === null);

  const live = liveCardPaymentProposals([...base, exact], cards, [], new Set(), null, d(2026, 11, 29));
  check('liveCardPaymentProposals: una propuesta', live.length === 1 && live[0].outId === 'o1');
  const ign = liveCardPaymentProposals([...base, exact], cards, [], new Set([cardPaymentProposalKey('o1', 'c1')]), null, d(2026, 11, 29));
  check('liveCardPaymentProposals: la ignorada no vuelve', ign.length === 0);
  check('liveCardPaymentProposals: onlyIds filtra', liveCardPaymentProposals([...base, exact], cards, [], new Set(), new Set(['zzz']), d(2026, 11, 29)).length === 0);

  const applied = applyCardPaymentProposal([...base, exact], { outId: 'o1', cardId: 'c1', cutKey: '2026-11-09' });
  const o1 = applied.find(t => t.id === 'o1')!;
  check('confirmar: la salida es el pago neutro, sin gasto nuevo', o1.type === 'transfer' && !!o1.cardPayment && o1.transferPrev?.type === 'expense' && o1.fromAccountId === 'bac' && applied.length === base.length + 1);
  const after = statementFor(c1, applied, [], d(2026, 11, 29));
  check('confirmar: el estado Q queda pagado', after.remaining.Q === 0 && after.paid.Q === 9276.01);
  check('confirmar: ya no se vuelve a proponer', liveCardPaymentProposals(applied, cards, [], new Set(), null, d(2026, 11, 29)).length === 0);
}

// ─────────────────────────────────────────────────────────────
// Deshacer el lote: lo que cambió (d4) se revierte
// ─────────────────────────────────────────────────────────────
{
  const cards = [c1];
  const out = tx('sms_out', d(2026, 11, 20, 9, 55), 5000, { source: 'sms', category: 'transfer', accountId: 'bac', bank: 'BAC' });
  const pay = tx('sms_pay', d(2026, 11, 20, 10, 0), 5000, { source: 'sms', type: 'transfer', category: 'transfer', accountId: 'c1', bank: 'BAC' });
  const before = [...userCycle(), out, pay];
  const m = matchCardPaymentSms(pay, cards, before, [], d(2026, 11, 21))!;
  const applied = applyCardPaymentMatch(before, m).txs;
  const record = [{ txId: m.txId, cardId: m.cardId, cutKey: m.cutKey, outId: m.outId }];

  // los dos SMS del lote: se quitan los dos (el comportamiento normal de deshacer)
  const batch: SmsBatchRecord = { id: 'b1', at: d(2026, 11, 20, 11).toISOString(), mode: 'manual', txIds: ['sms_out', 'sms_pay'], installmentIds: [], fixedMarks: [], cardPayments: record };
  const plan = planSmsUndo(batch, applied, [], [], false);
  const remaining = applied.filter(t => !plan.removedTxIds.has(t.id));
  const u = planCardPaymentsUndo(batch.cardPayments, remaining);
  check('deshacer (ambos SMS en el lote): no queda ningún pago ni par suelto', remaining.every(t => !t.cardPayment && !t.transferPairId) && !u.changed);

  // la salida es de OTRO lote (ya estaba): deshacer el lote del SMS de pago la devuelve a gasto
  const batch2: SmsBatchRecord = { ...batch, txIds: ['sms_pay'] };
  const plan2 = planSmsUndo(batch2, applied, [], [], false);
  const remaining2 = applied.filter(t => !plan2.removedTxIds.has(t.id));
  const u2 = planCardPaymentsUndo(batch2.cardPayments, remaining2);
  const outBack = u2.txs.find(t => t.id === 'sms_out')!;
  check('deshacer: la salida vuelve a expense / transfer, sin par ni fromAccountId', u2.changed && outBack.type === 'expense' && outBack.category === 'transfer' && !outBack.transferPairId && !outBack.transferPrev && outBack.fromAccountId === undefined && outBack.toAccountId === undefined);
  check('deshacer: el pago ya no rebaja el estado', statementFor(c1, u2.txs, [], d(2026, 11, 21)).paid.Q === 0);

  // el SMS de pago se conserva (editado): pierde cardPayment y el par
  const u3 = planCardPaymentsUndo(record, applied);
  const payBack = u3.txs.find(t => t.id === 'sms_pay')!;
  check('deshacer con el SMS conservado: pierde cardPayment y par', !payBack.cardPayment && !payBack.transferPairId && payBack.type === 'transfer');
  check('deshacer: el original no se muta', applied.find(t => t.id === 'sms_pay')!.cardPayment !== undefined && applied.find(t => t.id === 'sms_out')!.type === 'transfer');

  // salida tardía (outOnly): el pago de otro lote conserva su cardPayment
  const lateRecord = [{ txId: 'sms_pay', cardId: 'c1', cutKey: '2026-11-09', outId: 'sms_out', outOnly: true }];
  const u4 = planCardPaymentsUndo(lateRecord, applied);
  check('deshacer salida tardía: la salida vuelve y el pago conserva su estado', u4.txs.find(t => t.id === 'sms_out')!.type === 'expense' && !!u4.txs.find(t => t.id === 'sms_pay')!.cardPayment);

  check('sin registros no hay cambios', !planCardPaymentsUndo(undefined, applied).changed && planCardPaymentsUndo([], applied).txs === applied);
  check('idempotente: deshacer dos veces no cambia más', !planCardPaymentsUndo(record, u3.txs).changed);
}

// ─────────────────────────────────────────────────────────────
// Deuda programada
// ─────────────────────────────────────────────────────────────
{
  const accounts = [c1, bac, card('c2', { cutoffDay: 20, paymentDueDay: 5, name: 'Visa Gold' })];
  const loan = inst('loan1', { accountId: '', name: 'Préstamo auto', dueDay: 15, monthlyPayment: 1200, startDate: d(2026, 9, 3).toISOString(), trackSince: d(2026, 9, 3).toISOString() });
  const until = d(2026, 12, 26);
  const debts = scheduledDebts(accounts, [loan], userCycle(), NOW, until);
  const cardDebt = debts.find(x => x.id === 'card_c1_2026-11-09');
  check('deuda: la tarjeta aparece con su vencimiento del 2 de dic', !!cardDebt && ymd(cardDebt.due) === '2026-12-02' && cardDebt.kind === 'card');
  check('deuda: montos Q y USD por separado y estimados', cardDebt?.amounts.length === 2 && cardDebt.amounts[0].amount === 9276.01 && cardDebt.amounts[1].currency === 'USD' && cardDebt.isEstimated);
  const loanDebt = debts.find(x => x.id === 'loan_loan1');
  check('deuda: el préstamo trae su próxima cuota (15 de nov)', !!loanDebt && ymd(loanDebt.due) === '2026-11-15' && loanDebt.amounts[0].amount === 1200);
  check('deuda: ordenada por vencimiento', debts.every((x, i) => i === 0 || debts[i - 1].due.getTime() <= x.due.getTime()));
  check('deuda: la visacuota de una tarjeta no es un préstamo aparte', !scheduledDebts(accounts, [inst('i1')], userCycle(), NOW, until).some(x => x.kind === 'loan'));
  check('deuda: lo que vence después de `until` no entra', !scheduledDebts(accounts, [loan], userCycle(), NOW, d(2026, 11, 30)).some(x => x.id === 'card_c1_2026-11-09'));

  const paid = [...userCycle(),
    tx('p1', d(2026, 11, 20), 9276.01, { type: 'transfer', category: 'transfer', cardPayment: { cardId: 'c1', cutKey: '2026-11-09' } }),
    tx('p2', d(2026, 11, 20), 39.67, { type: 'transfer', category: 'transfer', currency: 'USD', cardPayment: { cardId: 'c1', cutKey: '2026-11-09' } }),
  ];
  check('deuda: un estado pagado ya no figura', !scheduledDebts(accounts, [], paid, d(2026, 11, 21), until).some(x => x.id === 'card_c1_2026-11-09'));
  const partial = [...userCycle(), tx('p1', d(2026, 11, 20), 9276.01, { type: 'transfer', category: 'transfer', cardPayment: { cardId: 'c1', cutKey: '2026-11-09' } })];
  const pd = scheduledDebts(accounts, [], partial, d(2026, 11, 21), until).find(x => x.id === 'card_c1_2026-11-09');
  check('deuda: con Q pagado solo falta el USD', pd?.amounts.length === 1 && pd.amounts[0].currency === 'USD' && pd.status === 'partial');
  const od = scheduledDebts(accounts, [], userCycle(), d(2026, 12, 3), d(2026, 12, 26)).find(x => x.id === 'card_c1_2026-11-09');
  check('deuda: vencida figura como overdue', od?.status === 'overdue');

  // el próximo estado: la visacuota cuenta en el corte que viene
  const i4 = inst('i4', { accountId: 'c1' });
  const next = statementFor(c1, userCycle(), [i4], NOW, d(2026, 12, 9));
  check('próximo estado: suma la cuota que aún no es cargo (500)', next.estimated.Q === 500, String(next.estimated.Q));
  const charged = [...userCycle(), tx('inst_i4_4', d(2026, 12, 9), 500, { accountId: 'c1', installmentId: 'i4', installmentNo: 4 })];
  check('próximo estado: sin duplicar si la cuota ya es cargo', statementFor(c1, charged, [i4], d(2026, 12, 9, 13), d(2026, 12, 9)).estimated.Q === 500);

  const named = debtsNotInFixed(debts, [{ name: 'Pago tarjeta BAC Visa', isActive: true }, { name: 'Renta', isActive: true }]);
  check('sin doble conteo: un gasto fijo con el nombre de la tarjeta la reemplaza', !named.some(x => x.cardId === 'c1') && named.some(x => x.id === 'loan_loan1'));
  check('un gasto fijo inactivo no cuenta', debtsNotInFixed(debts, [{ name: 'Pago tarjeta BAC Visa', isActive: false }]).length === debts.length);
  check('nombres sin relación no quitan nada', debtsNotInFixed(debts, [{ name: 'Internet', isActive: true }]).length === debts.length);
  const tot = sumDebts(debts);
  check('sumDebts suma Q y USD', tot.Q === Math.round((9276.01 + 1200) * 100) / 100 && tot.USD === 39.67, JSON.stringify(tot));
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
