process.env.TZ = 'America/Guatemala';
// Pruebas de las fuentes de ingreso (services/IncomeSources.ts + SmsUndoPlan + PeriodAnchors). Sin dependencias:
//   npm run test:income-sources   →   sucrase-node scripts/income-sources.test.ts
// Lo que escribe StorageService (linkIncome / undoSmsBatch) se prueba por sus planes puros (planIncomeLink,
// planIncomeLinksUndo), porque storage.ts importa AsyncStorage y no se puede cargar acá.

import {
  baseMonthlyIncome, expectedOccurrences, incomeDeltaSuggestion, learnPatternFromSms, matchIncome,
  planIncomeLink, sanitizeIncomeSources, sourceStatus,
} from '../services/IncomeSources';
import { buildExistingSmsIndex, planSmsImport } from '../services/BankSmsParser';
import { DEFAULT_PAY_RULES, ymd } from '../services/PayCalendar';
import type { PayRules } from '../services/PayCalendar';
import { buildStartResolver, sanitizePaymentSchedule } from '../services/PeriodAnchors';
import type { PeriodAnchor } from '../services/PeriodAnchors';
import { planIncomeLinksUndo, planSmsUndo } from '../services/SmsUndoPlan';
import { computeFinancialPeriod } from '../services/FinancialPeriod';
import { findIncomeRule, incomeKeyOfTx } from '../services/IncomeRules';
import type { IncomeSource, SmsBatchRecord, Transaction } from '../services/storage';

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
const rules = (over: Partial<PayRules> = {}): PayRules => ({ ...DEFAULT_PAY_RULES, ...over });
const NOW_ISO = '2026-10-27T18:00:00.000Z';

// SMS reales de Banrural (no se tocan sus datos).
const SMS_A = 'BANRURAL: Recibiste Q7,426.61 en tu cuenta Monetaria *** ****5051 de SECCION DE OPERACIONES DE DEPOSITOS, el 27/10/2026 a las 10:31.';
const SMS_B = 'BANRURAL: Amigo, se acredito a tu Cuenta Monetaria ****5051  Q. 7,426.60  en: SECCION DE OPERACIONES DE DEPOSITOS';
const SMS_SEP25 = 'BANRURAL: Recibiste Q7,426.61 en tu cuenta Monetaria *** ****5051 de SECCION DE OPERACIONES DE DEPOSITOS, el 25/09/2026 a las 10:31.';
const SMS_OTHER = 'BANRURAL: Recibiste Q7,426.61 en tu cuenta Monetaria *** ****5051 de JUAN PEREZ LOPEZ, el 27/10/2026 a las 10:31.';
const SMS_SMALL = 'BANRURAL: Recibiste Q500.00 en tu cuenta Monetaria *** ****5051 de SECCION DE OPERACIONES DE DEPOSITOS, el 27/10/2026 a las 10:31.';
const SMS_EXPENSE = 'BANRURAL: Amigo, se debito de tu Cuenta Monetaria ****5051 Q. 50.00 en: TIENDA LA ESQUINA';

/** Movimiento SMS real: pasa por el mismo motor de importación que la sincronización. */
function importTx(body: string, at: Date): Transaction {
  const plan = planSmsImport([{ body, receivedAt: at.getTime() }], buildExistingSmsIndex([], [], []), []);
  if (plan.transactions.length !== 1) throw new Error('no se importó: ' + body.slice(0, 30));
  return plan.transactions[0];
}

function source(over: Partial<IncomeSource> = {}): IncomeSource {
  const learned = learnPatternFromSms(SMS_A, d(2026, 10, 27).getTime());
  if (!learned.ok) throw new Error('no aprendió');
  return {
    id: 'src_sueldo', name: 'Sueldo', category: 'salary', amount: 7426.61, currency: 'Q', frequency: 'monthly',
    days: [27], role: 'base', anchorsPeriod: true, pattern: learned.pattern, isActive: true,
    createdAt: '2026-01-01T12:00:00.000Z', ...over,
  };
}

// ═════════════ Aprender el patrón ═════════════
console.log('Aprender el patrón');
const la = learnPatternFromSms(SMS_A, d(2026, 10, 27).getTime());
const lb = learnPatternFromSms(SMS_B, d(2026, 10, 27).getTime());
check('formato (a) aprende', la.ok === true);
check('formato (b) aprende', lb.ok === true);
if (la.ok && lb.ok) {
  check('mismo originKey', la.pattern.originKey === lb.pattern.originKey && la.pattern.originKey === 'seccion de operaciones de depositos',
    `${la.pattern.originKey} / ${lb.pattern.originKey}`);
  check('cuenta 5051 en ambos', la.pattern.acctKey === '5051' && lb.pattern.acctKey === '5051');
  check('banco BANRURAL en ambos', la.pattern.bank === 'BANRURAL' && lb.pattern.bank === 'BANRURAL', la.pattern.bank);
  check('monto (a) 7426.61 y (b) 7426.6', la.pattern.amount === 7426.61 && lb.pattern.amount === 7426.6);
  check('tolerancia 1.5%', la.pattern.tolerancePct === 1.5);
  check('etiqueta de origen legible', la.pattern.originLabel === 'SECCION DE OPERACIONES DE DEPOSITOS');
  check('el ejemplo guardado va enmascarado (sin la cuenta)', la.pattern.sampleMasked.indexOf('5051') < 0 && lb.pattern.sampleMasked.indexOf('5051') < 0,
    la.pattern.sampleMasked);
  check('vista previa: día 27 de octubre', la.preview.date === '2026-10-27' && la.preview.day === 27 && la.preview.weekday === 2,
    JSON.stringify(la.preview));
}
const lExp = learnPatternFromSms(SMS_EXPENSE);
check('un gasto no es ingreso', !lExp.ok && lExp.reason === 'not_income', JSON.stringify(lExp));
const lNoAmount = learnPatternFromSms('BANRURAL: Amigo, se acredito a tu Cuenta Monetaria ****5051 en: SECCION DE OPERACIONES DE DEPOSITOS');
check('sin monto: no_amount', !lNoAmount.ok && lNoAmount.reason === 'no_amount', JSON.stringify(lNoAmount));
const lNotBank = learnPatternFromSms('Hola, nos vemos mañana a las 5 en el parque');
check('texto que no es de un banco: not_bank', !lNotBank.ok && lNotBank.reason === 'not_bank', JSON.stringify(lNotBank));

// ═════════════ Ocurrencias esperadas ═════════════
console.log('Ocurrencias esperadas');
{
  const s = source();
  const occ = expectedOccurrences(s, d(2026, 9, 1), d(2026, 11, 30), rules());
  const txt = occ.map(o => `${o.key}>${ymd(o.date)}`).join(' ');
  check('mensual 27: sep (domingo → vie 25), oct, nov', txt === '2026-09-27>2026-09-25 2026-10-27>2026-10-27 2026-11-27>2026-11-27', txt);
  const next = expectedOccurrences(s, d(2026, 9, 1), d(2026, 9, 30), rules({ weekendRule: 'next_business' }));
  check('regla next_business: domingo → lunes 28', ymd(next[0].date) === '2026-09-28' && next[0].key === '2026-09-27');
  const own = expectedOccurrences(source({ weekendRule: 'exact' }), d(2026, 9, 1), d(2026, 9, 30), rules());
  check('la fuente puede tener su propia regla (exact)', ymd(own[0].date) === '2026-09-27');
  const bi = expectedOccurrences(source({ frequency: 'biweekly', days: [15, 30] }), d(2026, 11, 1), d(2026, 11, 30), rules());
  check('quincenal: 15 nov (dom → vie 13) y 30 nov', bi.map(o => o.key + '>' + ymd(o.date)).join(' ') === '2026-11-15>2026-11-13 2026-11-30>2026-11-30',
    bi.map(o => o.key + '>' + ymd(o.date)).join(' '));
  const wk = expectedOccurrences(source({ frequency: 'weekly', days: [5] }), d(2026, 10, 1), d(2026, 10, 31), rules());
  check('semanal viernes: 5 pagos en octubre 2026 (2, 9, 16, 23 y 30)', wk.length === 5 && wk.every(o => o.date.getDay() === 5), String(wk.length));
  const aguinaldo = source({ id: 'src_agui', role: 'extra', days: [15], months: [12], anchorsPeriod: false });
  const ex = expectedOccurrences(aguinaldo, d(2026, 6, 1), d(2027, 1, 31), rules());
  check('extra con months [12]: solo diciembre', ex.length === 1 && ex[0].key === '2026-12-15', JSON.stringify(ex.map(o => o.key)));
  check('irregular: sin ocurrencias fijas', expectedOccurrences(source({ frequency: 'irregular', days: [] }), d(2026, 1, 1), d(2026, 12, 31), rules()).length === 0);
  const feb = expectedOccurrences(source({ days: [31] }), d(2027, 2, 1), d(2027, 2, 28), rules());
  check('día 31 en febrero se recorta a 28 (clave 2027-02-28)', feb.length === 1 && feb[0].key === '2027-02-28', JSON.stringify(feb.map(o => o.key)));
}

// ═════════════ Reconocer el depósito ═════════════
console.log('Reconocer el depósito');
{
  const s = source();
  const txB = importTx(SMS_B, d(2026, 10, 27, 10, 31));
  const mB = matchIncome(txB, [s], rules());
  check('.60 (formato b) vs patrón .61: auto', !!mB && mB.auto && mB.sourceId === s.id && mB.score === 100, JSON.stringify(mB));
  check('clave del ciclo = fecha nominal', mB?.occKey === '2026-10-27', mB?.occKey);
  const txA = importTx(SMS_A, d(2026, 10, 27, 10, 31));
  const mA = matchIncome(txA, [s], rules());
  check('.61 (formato a): auto', !!mA && mA.auto && mA.score === 100, JSON.stringify(mA));
  // Patrón aprendido del (b) reconoce el (a)
  const lbP = learnPatternFromSms(SMS_B);
  if (lbP.ok) {
    const mBA = matchIncome(txA, [source({ pattern: lbP.pattern })], rules());
    check('patrón aprendido del (b) reconoce el (a)', !!mBA && mBA.auto, JSON.stringify(mBA));
  }
  const txOther = importTx(SMS_OTHER, d(2026, 10, 27, 10, 31));
  check('depósito de otro origen: sin match', matchIncome(txOther, [s], rules()) === null, JSON.stringify(matchIncome(txOther, [s], rules())));
  const txSmall = importTx(SMS_SMALL, d(2026, 10, 27, 10, 31));
  const mSmall = matchIncome(txSmall, [s], rules());
  check('mismo origen pero monto muy distinto: solo propuesta', !!mSmall && !mSmall.auto && mSmall.score >= 45, JSON.stringify(mSmall));
  const txExp = importTx(SMS_EXPENSE, d(2026, 10, 27, 10, 31));
  check('un gasto no hace match', matchIncome(txExp, [s], rules()) === null);
  check('fuente inactiva no participa', matchIncome(txB, [source({ isActive: false })], rules()) === null);
  check('un ingreso que ya es par de transferencia no participa', matchIncome({ ...txB, transferPairId: 'tp1' }, [s], rules()) === null);
  check('sin patrón (solo monto y fecha) no alcanza', matchIncome(txB, [source({ pattern: undefined })], rules()) === null);
  // Aguinaldo: mismo origen y otro monto; el sueldo y el extra no se confunden.
  const agui = source({ id: 'src_agui', name: 'Aguinaldo', category: 'bonus', role: 'extra', days: [15], months: [12], anchorsPeriod: false, amount: 7426.61 });
  const txDic = importTx(SMS_A.replace('27/10/2026', '15/12/2026'), d(2026, 12, 15, 10, 31));
  const mDic = matchIncome(txDic, [s, agui], rules());
  check('diciembre: gana el extra (su fecha coincide) y es auto', !!mDic && mDic.sourceId === 'src_agui' && mDic.auto, JSON.stringify(mDic));
  // Empate: dos fuentes idénticas → solo propuesta.
  const twin = source({ id: 'src_gemela', name: 'Gemela' });
  const mTie = matchIncome(txB, [s, twin], rules());
  check('empate entre dos fuentes: solo propuesta', !!mTie && !mTie.auto && mTie.score >= 80, JSON.stringify(mTie));
  // Fecha fuera de tolerancia pero mismo origen/monto: sigue siendo auto (95).
  const txLate = importTx(SMS_A.replace('27/10/2026', '20/10/2026'), d(2026, 10, 20, 10, 31));
  const mLate = matchIncome(txLate, [s], rules());
  check('depósito 7 días antes: auto sin el punto de fecha (95)', !!mLate && mLate.auto && mLate.score === 95, JSON.stringify(mLate));
}

// ═════════════ Estado de la fuente ═════════════
console.log('Estado de la fuente');
{
  const s = source({ createdAt: '2026-10-01T12:00:00.000Z' });
  const linked = (key: string, amount: number, date: Date): Transaction => ({
    id: 'tx_' + key, amount, description: 'Depósito', category: 'salary', date: date.toISOString(), type: 'income', source: 'sms',
    currency: 'Q', incomeSourceId: s.id, incomeCycleKey: key,
  });
  const st1 = sourceStatus(s, [], d(2026, 10, 20), rules());
  check('20 oct sin pago: esperado el 27 (el ciclo de sep, anterior a la fuente, no cuenta)',
    st1.status === 'expected' && st1.occurrence?.key === '2026-10-27', JSON.stringify([st1.status, st1.occurrence?.key]));
  const st2 = sourceStatus(s, [], d(2026, 10, 27), rules());
  check('27 oct sin pago aún: esperado', st2.status === 'expected', st2.status);
  const st3 = sourceStatus(s, [], d(2026, 10, 30), rules());
  check('30 oct (3 días, dentro de tolerancia): esperado', st3.status === 'expected', st3.status);
  const st4 = sourceStatus(s, [], d(2026, 10, 31), rules());
  check('31 oct (4 días, pasó la tolerancia): atrasado', st4.status === 'late', st4.status);
  const rec = linked('2026-10-27', 7426.61, d(2026, 10, 27, 10, 31));
  const st5 = sourceStatus(s, [rec], d(2026, 10, 28), rules());
  check('con depósito vinculado: recibido con el monto real', st5.status === 'received' && st5.amount === 7426.61 && st5.tx?.id === rec.id,
    JSON.stringify([st5.status, st5.amount]));
  const st5b = sourceStatus(s, [rec], d(2026, 11, 15), rules());
  check('15 nov: el ciclo vigente sigue siendo el de octubre (recibido)', st5b.status === 'received' && st5b.occurrence?.key === '2026-10-27', JSON.stringify([st5b.status, st5b.occurrence?.key]));
  const st5d = sourceStatus(s, [rec], d(2026, 11, 28), rules());
  check('28 nov sin el depósito de noviembre: esperado aún (1 día, dentro de la tolerancia)', st5d.status === 'expected' && st5d.occurrence?.key === '2026-11-27', JSON.stringify([st5d.status, st5d.occurrence?.key]));
  const early = linked('2026-11-27', 7426.61, d(2026, 11, 25, 10, 0));
  const st5c = sourceStatus(s, [rec, early], d(2026, 11, 25, 15), rules());
  check('pago adelantado ya vinculado: recibido', st5c.status === 'received' && st5c.occurrence?.key === '2026-11-27');
  const agui = source({ id: 'src_agui', role: 'extra', days: [15], months: [12], anchorsPeriod: false, createdAt: '2026-01-01T12:00:00.000Z' });
  check('extra fuera de su temporada: none', sourceStatus(agui, [], d(2026, 10, 20), rules()).status === 'none');
  check('extra en temporada (10 dic): esperado', sourceStatus(agui, [], d(2026, 12, 10), rules()).status === 'expected');
  check('extra a 5 días de su fecha sin llegar: atrasado', sourceStatus(agui, [], d(2026, 12, 21), rules()).status === 'late');
  check('extra 3 meses después sin llegar: none (no se queda atrasado para siempre)', sourceStatus(agui, [], d(2027, 3, 20), rules()).status === 'none');
  const irr = source({ id: 'src_irr', frequency: 'irregular', days: [] });
  check('irregular sin pagos del mes: none', sourceStatus(irr, [], d(2026, 10, 20), rules()).status === 'none');
  const irrTx = { ...linked('x', 800, d(2026, 10, 12)), incomeSourceId: 'src_irr', incomeCycleKey: undefined };
  const stI = sourceStatus(irr, [irrTx], d(2026, 10, 20), rules());
  check('irregular con un pago este mes: recibido', stI.status === 'received' && stI.amount === 800);
}

// ═════════════ Ingreso base y sugerencia ═════════════
console.log('Ingreso base');
{
  const mk = (srcId: string, amount: number, date: Date, id: string): Transaction => ({
    id, amount, description: 'Depósito', category: 'salary', date: date.toISOString(), type: 'income', source: 'sms',
    currency: 'Q', incomeSourceId: srcId, incomeCycleKey: ymd(date),
  });
  const base = source();
  const agui = source({ id: 'src_agui', name: 'Aguinaldo', category: 'bonus', role: 'extra', days: [15], months: [12], anchorsPeriod: false, amount: 7426.61 });
  const tx1 = mk(base.id, 7426.61, d(2026, 10, 27), 'a1');
  const txAg = mk(agui.id, 7426.61, d(2026, 12, 15), 'a2');
  check('base mensual usa lo último recibido', baseMonthlyIncome([base], [tx1], 7.7) === 7426.61);
  check('los extras NO suman', baseMonthlyIncome([base, agui], [tx1, txAg], 7.7) === 7426.61);
  check('fuente inactiva no suma', baseMonthlyIncome([source({ isActive: false })], [], 7.7) === 0);
  check('quincenal ×2', baseMonthlyIncome([source({ frequency: 'biweekly', days: [15, 30], amount: 3000, pattern: undefined })], [], 7.7) === 6000);
  check('semanal ×52/12', baseMonthlyIncome([source({ frequency: 'weekly', days: [5], amount: 1000, pattern: undefined })], [], 7.7) === 4333.33,
    String(baseMonthlyIncome([source({ frequency: 'weekly', days: [5], amount: 1000, pattern: undefined })], [], 7.7)));
  check('USD se convierte con el tipo de cambio', baseMonthlyIncome([source({ currency: 'USD', amount: 100, pattern: undefined })], [], 7.7) === 770);
  const irr = source({ id: 'src_irr', frequency: 'irregular', days: [], amount: 0, pattern: undefined, anchorsPeriod: false });
  const irrTxs = [
    mk(irr.id, 1000, d(2026, 7, 10), 'i1'), mk(irr.id, 2000, d(2026, 8, 12), 'i2'),
    mk(irr.id, 3000, d(2026, 9, 5), 'i3'), mk(irr.id, 500, d(2026, 9, 20), 'i3b'), mk(irr.id, 5000, d(2026, 10, 8), 'i4'),
  ];
  // Últimos 3 meses con pagos: ago 2000, sep 3500, oct 5000 → 3500
  check('irregular = promedio de los últimos 3 meses con pagos', baseMonthlyIncome([irr], irrTxs, 7.7) === 3500, String(baseMonthlyIncome([irr], irrTxs, 7.7)));
  check('irregular sin pagos usa lo declarado', baseMonthlyIncome([{ ...irr, amount: 1200 }], [], 7.7) === 1200);

  const sug = incomeDeltaSuggestion({ monthlyIncome: 6000, exchangeRate: 7.7 }, [base], [tx1]);
  check('ingreso declarado 6000 vs real 7426.61 (>5%): sugiere', !!sug && sug.suggested === 7426.61 && sug.current === 6000, JSON.stringify(sug));
  check('diferencia pequeña (<5%): no sugiere', incomeDeltaSuggestion({ monthlyIncome: 7400, exchangeRate: 7.7 }, [base], [tx1]) === null);
  check('sin ingreso declarado: sugiere el real', incomeDeltaSuggestion({ monthlyIncome: 0, exchangeRate: 7.7 }, [base], [tx1])?.suggested === 7426.61);
  check('sin fuentes base: no sugiere', incomeDeltaSuggestion({ monthlyIncome: 6000, exchangeRate: 7.7 }, [agui], [txAg]) === null);
}

// ═════════════ Vincular: categoría, regla y ancla del período ═════════════
console.log('Vincular y mover el período');
const SETTINGS27 = { paymentCycle: 'monthly' as const, paymentDay: 27, paymentDays: [15, 30] };
{
  const s = source();
  const txSep = importTx(SMS_SEP25, d(2026, 9, 25, 10, 31));
  check('el SMS se importó el vie 25/09', ymd(new Date(txSep.date)) === '2026-09-25', txSep.date);
  const m = matchIncome(txSep, [s], rules());
  check('sueldo del vie 25: auto y ciclo nominal 2026-09-27', !!m && m.auto && m.occKey === '2026-09-27', JSON.stringify(m));
  const plan = planIncomeLink({
    tx: txSep, source: s, occKey: m!.occKey, settings: SETTINGS27, rules: rules(), incomeRules: [], anchors: [], nowIso: NOW_ISO,
  });
  check('ancla automática key 2026-09-27 → inicio 2026-09-25',
    plan.anchors.length === 1 && plan.anchors[0].key === '2026-09-27' && plan.anchors[0].start === '2026-09-25' && plan.anchors[0].source === 'auto'
    && plan.anchors[0].txId === txSep.id && plan.anchorKey === '2026-09-27', JSON.stringify(plan.anchors));
  check('el movimiento toma categoría, fuente y ciclo', plan.tx.category === 'salary' && plan.tx.incomeSourceId === s.id
    && plan.tx.incomeCycleKey === '2026-09-27' && plan.prevCategory === 'transfer_in', JSON.stringify([plan.tx.category, plan.prevCategory]));
  check('la categoría no se marca como editada a mano (hay regla que la sostiene)', plan.tx.categoryEditedAt === undefined);
  const rule = findIncomeRule(plan.incomeRules, incomeKeyOfTx(txSep));
  check('aprende la regla del origen con el id de la fuente', !!rule && rule.category === 'salary' && rule.sourceId === s.id, JSON.stringify(plan.incomeRules));

  // El período se mueve de verdad.
  const resolve = buildStartResolver(SETTINGS27, plan.anchors);
  const r = resolve('2026-09-27');
  check('el resolvedor usa el sueldo real', !!r && r.source === 'salary' && ymd(r.date) === '2026-09-25', JSON.stringify(r && [r.source, ymd(r.date)]));
  const fp = computeFinancialPeriod(SETTINGS27, d(2026, 9, 26), resolve);
  check('el período vigente del 26/09 arranca el 25/09 (clave 2026-09-27)', ymd(fp.start) === '2026-09-25' && fp.key === '2026-09-27' && fp.startSource === 'salary',
    `${ymd(fp.start)} ${fp.key} ${fp.startSource}`);

  // Vincular otra vez con otro movimiento reemplaza el ancla de ese ciclo; el mismo movimiento no duplica.
  const again = planIncomeLink({
    tx: plan.tx, source: s, occKey: '2026-09-27', settings: SETTINGS27, rules: rules(), incomeRules: plan.incomeRules, anchors: plan.anchors, nowIso: NOW_ISO,
  });
  check('re-vincular no duplica anclas ni reglas', again.anchors.length === 1 && again.incomeRules.length === 1 && again.incomeRules[0].hits === 2);

  // Casos que NO mueven el período.
  const far = planIncomeLink({
    tx: { ...txSep, date: d(2026, 10, 20, 10, 31).toISOString() }, source: s, occKey: '2026-10-27', settings: SETTINGS27, rules: rules(),
    incomeRules: [], anchors: [], nowIso: NOW_ISO,
  });
  check('pago 7 días antes (fuera de la tolerancia de 3): no ancla', far.anchors.length === 0 && far.anchorKey === undefined);
  const noAnchor = planIncomeLink({
    tx: txSep, source: source({ anchorsPeriod: false }), occKey: '2026-09-27', settings: SETTINGS27, rules: rules(), incomeRules: [], anchors: [], nowIso: NOW_ISO,
  });
  check('fuente con anchorsPeriod false: no ancla', noAnchor.anchors.length === 0);
  const offRules = planIncomeLink({
    tx: txSep, source: s, occKey: '2026-09-27', settings: SETTINGS27, rules: rules({ autoAnchor: false }), incomeRules: [], anchors: [], nowIso: NOW_ISO,
  });
  check('payRules.autoAnchor apagado: no ancla', offRules.anchors.length === 0);
  const extra = planIncomeLink({
    tx: txSep, source: source({ role: 'extra' }), occKey: '2026-09-27', settings: SETTINGS27, rules: rules(), incomeRules: [], anchors: [], nowIso: NOW_ISO,
  });
  check('un extra no ancla ni pisa la regla del sueldo', extra.anchors.length === 0 && extra.incomeRules.length === 0 && extra.tx.category === 'salary');
  const wrongDay = planIncomeLink({
    tx: txSep, source: s, occKey: '2026-09-27', settings: { ...SETTINGS27, paymentDay: 15 }, rules: rules(), incomeRules: [], anchors: [], nowIso: NOW_ISO,
  });
  check('si el día de pago de Ajustes no es ese, no ancla', wrongDay.anchors.length === 0);
  const weekly = planIncomeLink({
    tx: txSep, source: source({ frequency: 'weekly', days: [5] }), occKey: '2026-09-25', settings: { ...SETTINGS27, paymentCycle: 'weekly' }, rules: rules(),
    incomeRules: [], anchors: [], nowIso: NOW_ISO,
  });
  check('ciclo semanal: no ancla', weekly.anchors.length === 0);

  // Cambiar el día de pago: el ancla se ignora y no se pierde.
  const sched = sanitizePaymentSchedule(SETTINGS27, { paymentDay: 15 });
  check('cambiar a día 15: paymentDay 15 y el ciclo se conserva', sched.paymentDay === 15 && sched.paymentCycle === 'monthly');
  check('con día 15 el resolvedor ignora el ancla del 27', buildStartResolver(sched, plan.anchors)('2026-09-27') === null);
  const back = sanitizePaymentSchedule(sched, { paymentDay: 27 });
  check('al volver al 27 el ancla revive', buildStartResolver(back, plan.anchors)('2026-09-27')?.source === 'salary');
  const bw = sanitizePaymentSchedule(SETTINGS27, { paymentCycle: 'biweekly', paymentDays: [30, 15] });
  check('quincenal: dos días ordenados', bw.paymentCycle === 'biweekly' && bw.paymentDays.join() === '15,30', JSON.stringify(bw));
  check('valores inválidos se descartan', sanitizePaymentSchedule(SETTINGS27, { paymentDay: 45, paymentDays: [5], paymentCycle: 'daily' as any }).paymentDay === 27
    && sanitizePaymentSchedule(SETTINGS27, { paymentDays: [5] }).paymentDays.join() === '15,30'
    && sanitizePaymentSchedule(SETTINGS27, { paymentCycle: 'daily' as any }).paymentCycle === 'monthly');
}

// ═════════════ Deshacer el lote ═════════════
console.log('Deshacer el lote');
{
  const s = source();
  const settings = SETTINGS27;
  const txSep = importTx(SMS_SEP25, d(2026, 9, 25, 10, 31));
  const plan = planIncomeLink({ tx: txSep, source: s, occKey: '2026-09-27', settings, rules: rules(), incomeRules: [], anchors: [], nowIso: NOW_ISO });
  const manualAnchor: PeriodAnchor = { key: '2026-08-27', start: '2026-08-26', source: 'manual', at: NOW_ISO };
  const otherAuto: PeriodAnchor = { key: '2026-07-27', start: '2026-07-27', source: 'auto', txId: 'otro_tx', at: NOW_ISO };
  const anchors = [manualAnchor, otherAuto, ...plan.anchors];
  const batch: SmsBatchRecord = {
    id: 'smsb_1', at: '2026-09-25T20:00:00.000Z', mode: 'manual', txIds: [txSep.id], installmentIds: [], fixedMarks: [],
    incomeLinks: [{ txId: txSep.id, prevCategory: plan.prevCategory, anchorKey: plan.anchorKey }],
  };
  const txs = [plan.tx];

  // (1) Se elimina el movimiento del lote: las anclas automáticas de ese sueldo se van; las demás no.
  const up = planSmsUndo(batch, txs, [], [], false);
  check('el lote elimina el sueldo vinculado', up.removeTxs.length === 1 && up.removeTxs[0].id === txSep.id);
  const remaining = txs.filter(t => !up.removedTxIds.has(t.id));
  const un = planIncomeLinksUndo(batch.incomeLinks, remaining, anchors);
  check('deshacer quita el ancla automática del sueldo', un.anchorsChanged && un.anchors.length === 2
    && !un.anchors.some(a => a.txId === txSep.id), JSON.stringify(un.anchors));
  check('conserva el ancla manual y las automáticas de otros sueldos', un.anchors.some(a => a.source === 'manual') && un.anchors.some(a => a.txId === 'otro_tx'));
  check('sin el ancla, el período vuelve a la fecha esperada (no al sueldo)', buildStartResolver(settings, un.anchors)('2026-09-27')?.source === 'expected');

  // (2) El usuario editó la cuenta (accountSource 'user'): el movimiento se queda, pero pierde el vínculo y recupera la categoría.
  const kept = { ...plan.tx, accountId: 'acc1', accountSource: 'user' as const };
  const up2 = planSmsUndo(batch, [kept], [], [], false);
  check('movimiento editado se conserva', up2.removeTxs.length === 0 && up2.keptEdited === 1);
  const un2 = planIncomeLinksUndo(batch.incomeLinks, [kept], anchors);
  const t2 = un2.txs[0];
  check('el que se queda: categoría previa y sin fuente ni ciclo', t2.category === 'transfer_in' && t2.incomeSourceId === undefined
    && t2.incomeCycleKey === undefined && un2.txsChanged && un2.reverted === 1, JSON.stringify([t2.category, t2.incomeSourceId]));
  check('y también pierde su ancla', un2.anchors.every(a => a.txId !== txSep.id));

  // (3) Categoría editada a mano después: se respeta, solo se suelta el vínculo.
  const mine = { ...plan.tx, category: 'bonus', categoryEditedAt: '2026-09-26T10:00:00.000Z' };
  const un3 = planIncomeLinksUndo(batch.incomeLinks, [mine], anchors);
  check('categoría elegida a mano se respeta', un3.txs[0].category === 'bonus' && un3.txs[0].incomeSourceId === undefined);

  // (4) Lote sin vínculos de ingreso: no hace nada.
  const none = planIncomeLinksUndo(undefined, txs, anchors);
  check('lote sin incomeLinks: sin cambios', !none.txsChanged && !none.anchorsChanged && none.txs === txs && none.anchors === anchors);
}

// ═════════════ Lectura segura ═════════════
console.log('Lectura segura');
{
  const good = source();
  const list = sanitizeIncomeSources([good, null, 5, { id: 'x' }, { id: 'y', name: 'Y', frequency: 'daily' }, { id: 'z', name: 'Z', frequency: 'weekly', days: [5], amount: 'abc' }]);
  check('descarta entradas mal formadas y normaliza', list.length === 2 && list[0].id === good.id && list[1].id === 'z' && list[1].amount === 0
    && list[1].role === 'base' && list[1].isActive === true, JSON.stringify(list.map(s => s.id)));
  check('no-arreglo → []', sanitizeIncomeSources('basura').length === 0);
}

if (failures > 0) {
  console.log(`\n${failures} de ${checks} comprobaciones fallaron.`);
  process.exit(1);
}
console.log(`OK income-sources: ${checks} comprobaciones.`);
