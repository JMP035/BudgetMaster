process.env.TZ = 'America/Guatemala';
// Pruebas del ciclo de tarjeta y de las visacuotas por cuota (services/CardCycle.ts e InstallmentSchedule.ts).
//   npm run test:card-cycle   →   sucrase-node scripts/card-cycle.test.ts

import { cutDate, cycleRange, dueDateFor, lastClosedCut, sumByCurrency } from '../services/CardCycle';
import { cycleSpentForCard } from '../services/AccountLinking';
import {
  chargedCount, cutForInstallment, detachInstallmentCharges, dropInstallmentCharges, migrateInstallmentsSchedule,
  nextInstallmentCut, planInstallmentCharges, prepareInstallmentForSave,
} from '../services/InstallmentSchedule';
import type { InstallmentChargePlan } from '../services/InstallmentSchedule';
import { mergeManualIntoSms } from '../services/DuplicateDetector';
import type { Account, CreditInstallment, Transaction } from '../services/storage';

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

/** Simula lo que hace StorageService.syncInstallmentCharges con un plan. */
function apply(state: { txs: Transaction[]; insts: CreditInstallment[] }, plan: InstallmentChargePlan) {
  const twin = new Map(plan.twinUpdates.map(t => [t.id, t] as const));
  const upd = new Map(plan.updates.map(i => [i.id, i] as const));
  return {
    txs: [...plan.toAdd, ...state.txs.map(t => twin.get(t.id) ?? t)],
    insts: state.insts.map(i => upd.get(i.id) ?? i),
  };
}

// ─────────────────────────────────────────────────────────────
// Fechas de corte y de pago
// ─────────────────────────────────────────────────────────────
{
  const c9 = card('c9', { cutoffDay: 9, paymentDueDay: 2 });
  check('cutDate 9 de noviembre', ymd(cutDate(9, 2026, 10)) === '2026-11-09');
  check('cutDate a las 12:00 locales', cutDate(9, 2026, 10).getHours() === 12);
  check('cutDate admite mes desbordado', ymd(cutDate(9, 2026, 12)) === '2027-01-09' && ymd(cutDate(9, 2026, -1)) === '2025-12-09');

  // corte 31 en febrero: se recorta al último día del mes
  check('corte 31 en febrero 2026 → 28', ymd(cutDate(31, 2026, 1)) === '2026-02-28');
  check('corte 31 en febrero 2028 (bisiesto) → 29', ymd(cutDate(31, 2028, 1)) === '2028-02-29');
  check('corte 30 en febrero → 28', ymd(cutDate(30, 2026, 1)) === '2026-02-28');
  const c31 = card('c31', { cutoffDay: 31 });
  check('corte 31: último cerrado el 1 de marzo es el 28 de febrero', ymd(lastClosedCut(c31, d(2026, 3, 1))) === '2026-02-28');
  check('corte 31: el 28 de febrero sigue abierto (último cerrado: 31 de enero)', ymd(lastClosedCut(c31, d(2026, 2, 28))) === '2026-01-31');
  const rFeb = cycleRange(c31, cutDate(31, 2026, 1));
  check('corte 31: ciclo de febrero va del 1 al 28', ymd(rFeb.from) === '2026-02-01' && ymd(rFeb.to) === '2026-02-28');
  const rMar = cycleRange(c31, cutDate(31, 2026, 2));
  check('corte 31: ciclo de marzo va del 1 al 31', ymd(rMar.from) === '2026-03-01' && ymd(rMar.to) === '2026-03-31');

  // el día de corte es el último día incluido y hoy, si es día de corte, sigue abierto
  check('día de corte (9 nov): sigue abierto → último cerrado 9 oct', ymd(lastClosedCut(c9, d(2026, 11, 9, 8))) === '2026-10-09');
  check('día de corte a medianoche sigue abierto', ymd(lastClosedCut(c9, d(2026, 11, 9, 0, 0))) === '2026-10-09');
  check('al día siguiente (10 nov) el corte del 9 ya cerró', ymd(lastClosedCut(c9, d(2026, 11, 10, 0, 1))) === '2026-11-09');
  check('a mitad de ciclo (20 nov) el último cerrado es el 9 nov', ymd(lastClosedCut(c9, d(2026, 11, 20))) === '2026-11-09');
  check('antes del corte (5 nov) el último cerrado es el 9 oct', ymd(lastClosedCut(c9, d(2026, 11, 5))) === '2026-10-09');

  const r = cycleRange(c9, d(2026, 11, 9));
  check('ciclo del corte 9 nov: 10 oct … 9 nov', ymd(r.from) === '2026-10-10' && ymd(r.to) === '2026-11-09');

  // fecha de pago
  check('corte 9 / pago 2 → 2 del mes siguiente', ymd(dueDateFor(d(2026, 11, 9), 2)) === '2026-12-02');
  check('corte 10 / pago 25 → 25 del mismo mes', ymd(dueDateFor(d(2026, 11, 10), 25)) === '2026-11-25');
  check('corte 9 / pago 9 → estrictamente posterior: el mes siguiente', ymd(dueDateFor(d(2026, 11, 9), 9)) === '2026-12-09');
  check('corte en diciembre / pago 2 → enero del año siguiente', ymd(dueDateFor(d(2026, 12, 9), 2)) === '2027-01-02');
  check('pago 31 en un mes de 30 días se recorta', ymd(dueDateFor(d(2026, 11, 10), 31)) === '2026-11-30');
  check('sin día de pago → null', dueDateFor(d(2026, 11, 9), undefined) === null);

  // sin día de corte: mes calendario
  const none = card('none');
  check('sin corte: el 17 nov el último cerrado es el 31 oct', ymd(lastClosedCut(none, d(2026, 11, 17))) === '2026-10-31');
  const rn = cycleRange(none, cutDate(31, 2026, 10));
  check('sin corte: el ciclo es el mes calendario', ymd(rn.from) === '2026-11-01' && ymd(rn.to) === '2026-11-30');
}

// ─────────────────────────────────────────────────────────────
// Ciclo abierto: Q y USD separados (datos reales del estado de cuenta)
// ─────────────────────────────────────────────────────────────
{
  const c = card('c1', { cutoffDay: 9, paymentDueDay: 2 });
  const list: Transaction[] = [
    tx('q1', d(2026, 10, 10, 0, 5), 5000.5, { accountId: 'c1' }),            // primer día del ciclo
    tx('q2', d(2026, 10, 25), 4000, { accountId: 'c1' }),
    tx('q3', d(2026, 11, 9, 23, 30), 275.51, { accountId: 'c1' }),            // día de corte: sigue incluido
    tx('u1', d(2026, 10, 12), 20.17, { accountId: 'c1', currency: 'USD' }),
    tx('u2', d(2026, 11, 3), 19.5, { accountId: 'c1', currency: 'USD' }),
    tx('antes', d(2026, 10, 9, 23, 0), 999, { accountId: 'c1' }),             // corte anterior: no entra
    tx('otra', d(2026, 10, 20), 777, { accountId: 'otra' }),
    tx('trf', d(2026, 10, 20), 3000, { accountId: 'c1', type: 'transfer' }),
    tx('par', d(2026, 10, 21), 3000, { accountId: 'c1', transferPairId: 'p1' }),
    tx('pago', d(2026, 10, 22), 1500, { accountId: 'c1', type: 'income', transferPairId: 'p2' }),
  ];
  const now = d(2026, 11, 9, 20);
  const r = cycleSpentForCard(list, c, now);
  const q = r.byCurrency.find(x => x.currency === 'Q');
  const u = r.byCurrency.find(x => x.currency === 'USD');
  check('ciclo abierto Q = 9,276.01', !!q && q.amount === 9276.01, JSON.stringify(r.byCurrency));
  check('ciclo abierto USD = 39.67', !!u && u.amount === 39.67, JSON.stringify(r.byCurrency));
  check('byCurrency ordenado Q, USD', r.byCurrency.length === 2 && r.byCurrency[0].currency === 'Q' && r.byCurrency[1].currency === 'USD');
  check('amount/currency principal = moneda de la tarjeta', r.amount === 9276.01 && r.currency === 'Q');
  check('transferencias y pares neutros no suman', r.byCurrency.every(x => x.amount < 10000));
  check('ciclo abierto desde el 10 de octubre a las 00:00', ymd(r.from) === '2026-10-10' && r.from.getHours() === 0);

  // al día siguiente del corte el ciclo nuevo empieza vacío y el anterior ya no cuenta
  const r2 = cycleSpentForCard(list, c, d(2026, 11, 10, 9));
  check('10 de noviembre: ciclo nuevo en 0', r2.amount === 0 && r2.byCurrency.length === 0, JSON.stringify(r2.byCurrency));
  check('10 de noviembre: desde el 10/11', ymd(r2.from) === '2026-11-10');

  // reembolso (ingreso) resta; sin cutoff: mes calendario
  const withRefund = [...list, tx('reemb', d(2026, 11, 2), 100, { accountId: 'c1', type: 'income' })];
  const r3 = cycleSpentForCard(withRefund, c, now);
  check('un reembolso resta', r3.byCurrency[0].amount === 9176.01, JSON.stringify(r3.byCurrency));
  const sum = sumByCurrency(list, 'c1', d(2026, 10, 10), d(2026, 11, 9));
  check('sumByCurrency inclusivo en ambos extremos', sum.find(x => x.currency === 'Q')?.amount === 9276.01);
  check('sumByCurrency sin movimientos → vacío', sumByCurrency([], 'c1', d(2026, 10, 10), d(2026, 11, 9)).length === 0);
}

// ─────────────────────────────────────────────────────────────
// Calendario de cuotas
// ─────────────────────────────────────────────────────────────
{
  const c = card('c1', { cutoffDay: 9, paymentDueDay: 2 });
  const i = inst('i1'); // compra el 15 de agosto: 1.ª cuota en el corte del 9 de septiembre
  check('1.ª cuota: primer corte >= inicio (9 sep)', ymd(cutForInstallment(i, c, 1)) === '2026-09-09');
  check('2.ª cuota: 9 oct', ymd(cutForInstallment(i, c, 2)) === '2026-10-09');
  check('12.ª cuota: 9 ago 2027', ymd(cutForInstallment(i, c, 12)) === '2027-08-09');
  check('compra el día de corte entra en ese mismo corte', ymd(cutForInstallment(inst('x', { startDate: d(2026, 9, 9).toISOString() }), c, 1)) === '2026-09-09');
  check('compra el día siguiente al corte entra en el próximo', ymd(cutForInstallment(inst('x', { startDate: d(2026, 9, 10).toISOString() }), c, 1)) === '2026-10-09');
  check('chargedCount el 17 de nov = 3', chargedCount(i, c, d(2026, 11, 17)) === 3);
  check('chargedCount el día del corte ya cuenta ese corte', chargedCount(i, c, d(2026, 11, 9, 8)) === 3);
  check('chargedCount un día antes del corte no lo cuenta', chargedCount(i, c, d(2026, 11, 8)) === 2);
  check('chargedCount antes del primer corte = 0', chargedCount(i, c, d(2026, 9, 1)) === 0);
  check('chargedCount no pasa del total', chargedCount(i, c, d(2030, 1, 1)) === 12);
  check('próxima cuota el 17 de nov: corte del 9 de dic', ymd(nextInstallmentCut(i, c, d(2026, 11, 17))) === '2026-12-09');
  check('sin próxima cuota cuando ya se cargaron todas', nextInstallmentCut(i, c, d(2030, 1, 1)) === null);
  check('fecha de inicio inválida → sin cortes', chargedCount(inst('bad', { startDate: 'xx' }), c, d(2026, 11, 17)) === 0);

  // préstamo sin tarjeta
  const loanDue = inst('l1', { accountId: '', dueDay: 15, startDate: d(2026, 11, 3).toISOString() });
  check('préstamo con dueDay: 1.ª cuota el 15 de nov', ymd(cutForInstallment(loanDue, undefined, 1)) === '2026-11-15');
  check('préstamo con dueDay: 2.ª cuota el 15 de dic', ymd(cutForInstallment(loanDue, undefined, 2)) === '2026-12-15');
  const loanNoDay = inst('l2', { accountId: '', startDate: d(2026, 11, 3).toISOString() });
  check('préstamo sin dueDay: usa el día de la fecha de inicio', ymd(cutForInstallment(loanNoDay, undefined, 1)) === '2026-11-03' && ymd(cutForInstallment(loanNoDay, undefined, 2)) === '2026-12-03');
  const loan31 = inst('l3', { accountId: '', startDate: d(2026, 1, 31).toISOString() });
  check('préstamo del 31: febrero se recorta', ymd(cutForInstallment(loan31, undefined, 2)) === '2026-02-28' && ymd(cutForInstallment(loan31, undefined, 3)) === '2026-03-31');
  const loanPast = inst('l4', { accountId: '', dueDay: 5, startDate: d(2026, 11, 10).toISOString() });
  check('préstamo cuyo día de pago ya pasó este mes: 1.ª cuota el mes siguiente', ymd(cutForInstallment(loanPast, undefined, 1)) === '2026-12-05');
}

// ─────────────────────────────────────────────────────────────
// Cargos: 12 cuotas con la app sin abrir 3 meses
// ─────────────────────────────────────────────────────────────
{
  const accounts = [card('c1', { cutoffDay: 9, paymentDueDay: 2 })];
  const now = d(2026, 11, 17);
  let state = { txs: [] as Transaction[], insts: [inst('i1')] };
  const plan = planInstallmentCharges(state.insts, accounts, state.txs, [], now);
  check('3 cortes sin abrir la app → 3 cargos de una vez', plan.toAdd.length === 3, String(plan.toAdd.length));
  check('ids estables inst_<id>_<n>', plan.toAdd.map(t => t.id).join(',') === 'inst_i1_1,inst_i1_2,inst_i1_3');
  const c1 = plan.toAdd[0];
  check('cargo: gasto manual por la cuota', c1.type === 'expense' && c1.source === 'manual' && c1.amount === 500 && c1.currency === 'Q');
  check('cargo: cuenta de la tarjeta, categoría de la visacuota', c1.accountId === 'c1' && c1.category === 'shopping');
  check('cargo: descripción «Cuota k/N · nombre»', c1.description === 'Cuota 1/12 · Laptop');
  check('cargo: marca la visacuota y el número', c1.installmentId === 'i1' && c1.installmentNo === 1);
  const cd = new Date(c1.date);
  check('cargo: fechado el día del corte a las 12:00 locales', ymd(cd) === '2026-09-09' && cd.getHours() === 12);
  check('paidInstallments pasa a 3 y sigue activa', plan.updates.length === 1 && plan.updates[0].paidInstallments === 3 && plan.updates[0].isActive);

  state = apply(state, plan);
  const again = planInstallmentCharges(state.insts, accounts, state.txs, [], now);
  check('idempotente: la 2.ª corrida no cambia nada', again.toAdd.length === 0 && again.updates.length === 0 && again.twinUpdates.length === 0);
  const later = planInstallmentCharges(state.insts, accounts, state.txs, [], d(2026, 12, 9));
  check('el siguiente corte agrega solo la cuota nueva', later.toAdd.length === 1 && later.toAdd[0].id === 'inst_i1_4' && later.updates[0].paidInstallments === 4);

  // un id descartado (cuota borrada a mano) no se regenera, pero la cuota sigue contando como cargada
  const dismissed = planInstallmentCharges([inst('i1')], accounts, [], ['inst_i1_2'], now);
  check('id descartado no se regenera', dismissed.toAdd.map(t => t.id).join(',') === 'inst_i1_1,inst_i1_3');
  check('el descartado igual cuenta en paidInstallments', dismissed.updates[0].paidInstallments === 3);
  // si se borra un cargo ya existente y su id queda en descartados, tampoco vuelve
  const deletedOne = state.txs.filter(t => t.id !== 'inst_i1_1');
  const noBack = planInstallmentCharges(state.insts, accounts, deletedOne, ['inst_i1_1'], now);
  check('cargo borrado + id descartado → no vuelve', noBack.toAdd.length === 0);

  // solo cortes desde trackSince: nada retroactivo
  const tracked = planInstallmentCharges([inst('i2', { trackSince: d(2026, 10, 20).toISOString() })], accounts, [], [], now);
  check('trackSince: solo cortes desde esa fecha', tracked.toAdd.map(t => t.id).join(',') === 'inst_i2_3');
  check('trackSince: paidInstallments igual cuenta los cortes cumplidos', tracked.updates[0].paidInstallments === 3);
  const noTrack = planInstallmentCharges([inst('i3', { trackSince: undefined })], accounts, [], [], now);
  check('sin trackSince no se toca la visacuota', noTrack.toAdd.length === 0 && noTrack.updates.length === 0);
  const inactive = planInstallmentCharges([inst('i4', { isActive: false })], accounts, [], [], now);
  check('visacuota inactiva: no genera', inactive.toAdd.length === 0 && inactive.updates.length === 0);

  // préstamo sin tarjeta: cargo sin cuenta
  const loan = inst('l1', { accountId: '', dueDay: 15, startDate: d(2026, 9, 3).toISOString(), trackSince: d(2026, 9, 3).toISOString() });
  const lp = planInstallmentCharges([loan], accounts, [], [], now);
  check('préstamo: 3 cargos (15 sep, oct y nov) sin cuenta', lp.toAdd.length === 3 && lp.toAdd.every(t => t.accountId === undefined) && ymd(new Date(lp.toAdd[0].date)) === '2026-09-15');
}

// ─────────────────────────────────────────────────────────────
// Gemelo SMS: no duplica
// ─────────────────────────────────────────────────────────────
{
  const accounts = [card('c1', { cutoffDay: 9, paymentDueDay: 2 })];
  const now = d(2026, 11, 17);
  const sms = tx('sms_a', d(2026, 10, 5), 500, { source: 'sms', accountId: 'c1' });       // ciclo de la cuota 2 (10 sep – 9 oct)
  const lejos = tx('sms_b', d(2026, 10, 15), 500, { source: 'sms', accountId: 'c1' });    // ciclo de la cuota 3
  const otroMonto = tx('sms_c', d(2026, 9, 20), 450, { source: 'sms', accountId: 'c1' });
  const otraTarjeta = tx('sms_d', d(2026, 9, 20), 500, { source: 'sms', accountId: 'c2' });
  const usd = tx('sms_e', d(2026, 9, 21), 500, { source: 'sms', accountId: 'c1', currency: 'USD' });
  const state0 = { txs: [sms, lejos, otroMonto, otraTarjeta, usd], insts: [inst('i1')] };
  const plan = planInstallmentCharges(state0.insts, accounts, state0.txs, [], now);
  check('gemelo: se marca el SMS (cuota 2) y la cuota 3', plan.twinUpdates.map(t => `${t.id}:${t.installmentNo}`).sort().join(',') === 'sms_a:2,sms_b:3');
  check('gemelo: solo se crea el cargo de la cuota 1', plan.toAdd.map(t => t.id).join(',') === 'inst_i1_1');
  check('gemelo: el SMS conserva su monto y fuente', plan.twinUpdates.every(t => t.source === 'sms' && t.amount === 500 && t.installmentId === 'i1'));
  const st = apply(state0, plan);
  const again = planInstallmentCharges(st.insts, accounts, st.txs, [], now);
  check('gemelo: idempotente', again.toAdd.length === 0 && again.twinUpdates.length === 0 && again.updates.length === 0);
  check('gemelo: no hay más de un movimiento por cuota', st.txs.filter(t => t.installmentId === 'i1' && t.installmentNo === 2).length === 1);
  // tolerancia de 1 centavo
  const cent = tx('sms_f', d(2026, 9, 20), 500.01, { source: 'sms', accountId: 'c1' });
  const pc = planInstallmentCharges([inst('i1')], accounts, [cent], [], now);
  check('gemelo: tolera ±0.01', pc.twinUpdates.length === 1 && pc.twinUpdates[0].id === 'sms_f' && pc.twinUpdates[0].installmentNo === 2);
  // un SMS no sirve de gemelo de dos cuotas
  const oneSms = tx('sms_g', d(2026, 10, 5), 500, { source: 'sms', accountId: 'c1' });
  const po = planInstallmentCharges([inst('i1')], accounts, [oneSms], [], now);
  check('gemelo: un SMS cubre una sola cuota', po.twinUpdates.length === 1 && po.toAdd.length === 2);
  // si el cargo generado se une luego a su SMS (mergeManualIntoSms), la marca de la cuota pasa al SMS y no se regenera
  const generated = plan.toAdd[0];
  const smsLate = tx('sms_h', d(2026, 9, 9, 18), 500, { source: 'sms', accountId: 'c1' });
  const merged = mergeManualIntoSms(generated, smsLate, d(2026, 11, 17).toISOString());
  check('unión manual+SMS: el SMS hereda installmentId/No', merged.installmentId === 'i1' && merged.installmentNo === 1);
  const afterMerge = planInstallmentCharges([inst('i1')], accounts, [merged], [], now);
  check('unión manual+SMS: la cuota 1 no se regenera', !afterMerge.toAdd.some(t => t.id === 'inst_i1_1'));
}

// ─────────────────────────────────────────────────────────────
// Última cuota y cuotas pagadas
// ─────────────────────────────────────────────────────────────
{
  const accounts = [card('c1', { cutoffDay: 9 })];
  const i = inst('i1', { totalInstallments: 3, totalAmount: 1500 });
  const p1 = planInstallmentCharges([i], accounts, [], [], d(2026, 10, 20));
  check('antes de la última: 2 cuotas y sigue activa', p1.updates[0].paidInstallments === 2 && p1.updates[0].isActive);
  const p2 = planInstallmentCharges([i], accounts, [], [], d(2026, 11, 10));
  check('al cargarse la última queda inactiva con 3/3', p2.updates[0].paidInstallments === 3 && !p2.updates[0].isActive);
  check('la última cuota genera su cargo «Cuota 3/3»', p2.toAdd[2].description === 'Cuota 3/3 · Laptop');
  const st = apply({ txs: [], insts: [i] }, p2);
  const p3 = planInstallmentCharges(st.insts, accounts, st.txs, [], d(2027, 3, 1));
  check('terminada: no genera ni cambia nada más', p3.toAdd.length === 0 && p3.updates.length === 0);
  check('nunca más de N cargos', st.txs.length === 3);

  // paidOffset: cuotas pagadas antes de seguirlas
  const off = inst('i2', { totalInstallments: 6, paidOffset: 2, trackSince: d(2026, 10, 1).toISOString() });
  const po = planInstallmentCharges([off], accounts, [], [], d(2026, 11, 10));
  check('paidOffset suma a lo cargado (3 cortes + 2); cargos solo desde trackSince', po.updates.length === 1 && po.updates[0].paidInstallments === 5 && po.toAdd.length === 2, JSON.stringify(po.updates.map(u => u.paidInstallments)) + po.toAdd.length);
  const offEnd = inst('i3', { totalInstallments: 6, paidOffset: 5, trackSince: d(2026, 10, 1).toISOString() });
  const pe = planInstallmentCharges([offEnd], accounts, [], [], d(2026, 11, 10));
  check('paidOffset + cargadas llega al total → inactiva', pe.updates[0].paidInstallments === 6 && !pe.updates[0].isActive);
  const clamp = inst('i4', { totalInstallments: 6, paidOffset: 99, trackSince: d(2026, 10, 1).toISOString() });
  check('paidInstallments nunca pasa del total', planInstallmentCharges([clamp], accounts, [], [], d(2026, 11, 10)).updates[0].paidInstallments === 6);
  const neg = inst('i5', { paidInstallments: 2, paidOffset: -50, trackSince: d(2026, 10, 1).toISOString() });
  check('paidInstallments nunca baja de 0', planInstallmentCharges([neg], accounts, [], [], d(2026, 11, 10)).updates[0].paidInstallments === 0);
}

// ─────────────────────────────────────────────────────────────
// Migración 'installments_schedule_v1'
// ─────────────────────────────────────────────────────────────
{
  const accounts = [card('c1', { cutoffDay: 9 })];
  const now = d(2026, 11, 17);
  // contadas por el esquema viejo (una por mes): 5 pagadas; con el calendario nuevo ya habría 10 cortes
  const old: CreditInstallment = {
    id: 'old', accountId: 'c1', name: 'TV', totalAmount: 6000, monthlyPayment: 500, totalInstallments: 12, paidInstallments: 5,
    startDate: d(2026, 1, 15).toISOString(), currency: 'Q', category: 'shopping', isActive: true,
  };
  const m = migrateInstallmentsSchedule([old], accounts, now);
  check('migración: trackSince = ahora', m.changed && m.installments[0].trackSince === now.toISOString());
  check('migración: paidOffset = pagadas − cargadas hoy (5 − 10)', m.installments[0].paidOffset === -5, String(m.installments[0].paidOffset));
  const p0 = planInstallmentCharges(m.installments, accounts, [], [], now);
  check('migración: no genera cargos retroactivos', p0.toAdd.length === 0);
  check('migración: no cambia lo ya contado (5)', p0.updates.length === 0 && m.installments[0].paidInstallments === 5);
  const p1 = planInstallmentCharges(m.installments, accounts, [], [], d(2026, 12, 10));
  check('migración: el siguiente corte agrega UNA cuota y paga la 6.ª', p1.toAdd.length === 1 && p1.toAdd[0].id === 'inst_old_11' && p1.updates[0].paidInstallments === 6);
  const m2 = migrateInstallmentsSchedule(m.installments, accounts, d(2026, 12, 1));
  check('migración idempotente: no toca las que ya tienen trackSince', !m2.changed && m2.installments === m.installments);

  // visacuota nueva (cero cuotas contadas) con paid 0 → paidOffset 0
  const young: CreditInstallment = { ...old, id: 'young', startDate: d(2026, 11, 12).toISOString(), paidInstallments: 0 };
  const my = migrateInstallmentsSchedule([young], accounts, now);
  check('migración: sin cortes cumplidos → paidOffset 0', my.installments[0].paidOffset === 0);
  // préstamo sin tarjeta
  const loan: CreditInstallment = { ...old, id: 'loan', accountId: '', paidInstallments: 2, startDate: d(2026, 9, 3).toISOString() };
  const ml = migrateInstallmentsSchedule([loan], accounts, now);
  check('migración préstamo: cuotas del 3 sep, oct y nov = 3 → paidOffset −1', ml.installments[0].paidOffset === -1);
}

// ─────────────────────────────────────────────────────────────
// Crear / editar: trackSince y paidOffset
// ─────────────────────────────────────────────────────────────
{
  const accounts = [card('c1', { cutoffDay: 9 })];
  const now = d(2026, 11, 17);
  const base = inst('n1', { trackSince: undefined, paidOffset: undefined });
  const fresh = prepareInstallmentForSave(base, undefined, accounts, now);
  check('nueva sin cuotas pagadas: trackSince = startDate', fresh.trackSince === base.startDate && fresh.paidOffset === 0);
  const withPaid = prepareInstallmentForSave({ ...base, paidInstallments: 4 }, undefined, accounts, now);
  check('nueva con pagadas: trackSince = ahora', withPaid.trackSince === now.toISOString());
  check('nueva con pagadas: paidInstallments queda justo en lo indicado', planInstallmentCharges([withPaid], accounts, [], [], now).updates.length === 0 && withPaid.paidOffset === 4 - 3);
  const sms = inst('sms1', { trackSince: d(2026, 8, 15).toISOString() });
  check('con trackSince (SMS, onboarding): se respeta', prepareInstallmentForSave(sms, undefined, accounts, now) === sms);

  // edición: sin cambios conserva; cambiar las pagadas recalcula paidOffset
  const migrated = { ...inst('e1'), trackSince: now.toISOString(), paidOffset: -5, paidInstallments: 5 };
  const same = prepareInstallmentForSave({ ...migrated, name: 'Otro nombre' }, migrated, accounts, now);
  check('edición sin mover cuotas: conserva trackSince y paidOffset', same.trackSince === migrated.trackSince && same.paidOffset === -5);
  const bumped = prepareInstallmentForSave({ ...migrated, paidInstallments: 8 }, migrated, accounts, now);
  check('edición de las pagadas: paidOffset se recalcula (8 − 3)', bumped.paidOffset === 5, String(bumped.paidOffset));
  const editedPlan = planInstallmentCharges([bumped], accounts, [], [], now);
  check('edición de las pagadas: el plan respeta lo escrito', editedPlan.updates.length === 0);
}

// ─────────────────────────────────────────────────────────────
// Borrar visacuota y deshacer lote
// ─────────────────────────────────────────────────────────────
{
  const accounts = [card('c1', { cutoffDay: 9 })];
  const sms = tx('sms_a', d(2026, 10, 5), 500, { source: 'sms', accountId: 'c1' });
  const other = tx('otro', d(2026, 10, 6), 80, { accountId: 'c1' });
  const plan = planInstallmentCharges([inst('i1')], accounts, [sms, other], [], d(2026, 11, 17));
  const st = apply({ txs: [sms, other], insts: [inst('i1')] }, plan);

  const kept = detachInstallmentCharges(st.txs, 'i1');
  check('borrar visacuota: conserva los cargos (mismo número de movimientos)', kept.changed && kept.txs.length === st.txs.length);
  check('borrar visacuota: los cargos pierden el vínculo', kept.txs.every(t => t.installmentId === undefined && t.installmentNo === undefined));
  check('borrar visacuota: los cargos siguen como gasto de la tarjeta', kept.txs.filter(t => t.id.startsWith('inst_')).every(t => t.type === 'expense' && t.accountId === 'c1'));
  check('borrar otra visacuota no toca nada', !detachInstallmentCharges(st.txs, 'zzz').changed);

  const undone = dropInstallmentCharges(st.txs, new Set(['i1']));
  check('deshacer lote: borra los cargos generados', undone.removed === 2 && !undone.txs.some(t => t.id.startsWith('inst_')));
  check('deshacer lote: el SMS gemelo se queda, sin la marca', undone.txs.some(t => t.id === 'sms_a' && t.installmentId === undefined && t.installmentNo === undefined));
  check('deshacer lote: lo demás no se toca', undone.txs.some(t => t.id === 'otro') && undone.txs.length === 2);
  check('deshacer sin visacuotas: sin cambios', !dropInstallmentCharges(st.txs, new Set()).changed && dropInstallmentCharges(st.txs, new Set()).txs === st.txs);
  check('deshacer otra visacuota: sin cambios', !dropInstallmentCharges(st.txs, new Set(['zzz'])).changed);
}

// ─────────────────────────────────────────────────────────────
// Las transferencias nunca suman al ciclo ni son cargos
// ─────────────────────────────────────────────────────────────
{
  const c = card('c1', { cutoffDay: 9 });
  const list = [
    tx('t1', d(2026, 10, 20), 500, { accountId: 'c1', type: 'transfer' }),
    tx('t2', d(2026, 10, 20), 500, { accountId: 'c1', transferPairId: 'x' }),
    tx('t3', d(2026, 10, 20), 500, { accountId: 'c1', type: 'income', transferPairId: 'x' }),
  ];
  const r = cycleSpentForCard(list, c, d(2026, 11, 5));
  check('transferencias y pares neutros: ciclo en 0', r.amount === 0 && r.byCurrency.length === 0);
  // un SMS marcado como par neutro no puede ser gemelo de una cuota
  const par = tx('sms_p', d(2026, 10, 5), 500, { source: 'sms', accountId: 'c1', transferPairId: 'p9' });
  const plan = planInstallmentCharges([inst('i1')], [c], [par], [], d(2026, 11, 17));
  check('un par de transferencia no es gemelo de una cuota', plan.twinUpdates.length === 0 && plan.toAdd.length === 3);
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
