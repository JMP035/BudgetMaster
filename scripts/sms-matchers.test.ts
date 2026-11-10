process.env.TZ = 'America/Guatemala';
// Pruebas de FixedExpenseMatcher (D4) y DuplicateDetector (D5). Sin dependencias:
//   npm run test:sms-matchers   →   sucrase-node scripts/sms-matchers.test.ts

import {
  dupPairKey, findManualSmsDuplicates, mergeManualIntoSms, splitMerged,
} from '../services/DuplicateDetector';
import { FIXED_AUTO_THRESHOLD, FIXED_PROPOSE_THRESHOLD, matchFixedExpenses } from '../services/FixedExpenseMatcher';
import type { FixedExpense, Transaction } from '../services/storage';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { R4_BODY } = require('./sms-corpus') as typeof import('./sms-corpus');

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
function sms(id: string, amount: number, date: Date, merchant: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, amount, description: `BAC · ${merchant}`, category: 'other', date: date.toISOString(), type: 'expense',
    source: 'sms', currency: 'Q', bank: 'BAC', merchant, smsFingerprint: `fp-${id}`, originalSMS: `sms ${id}`,
    ...extra,
  };
}

function manual(id: string, amount: number, date: Date, description: string, extra: Partial<Transaction> = {}): Transaction {
  return { id, amount, description, category: 'other', date: date.toISOString(), type: 'expense', source: 'manual', currency: 'Q', ...extra };
}

function fixed(id: string, name: string, amount: number, dayOfMonth: number, extra: Partial<FixedExpense> = {}): FixedExpense {
  return {
    id, name, amount, currency: 'Q', category: 'utilities', dayOfMonth, isPaid: false, autoRecord: false, isActive: true,
    ...extra,
  };
}

const NOW = new Date(2026, 6, 30, 10, 0); // 30/07/2026
const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);

// ═════════════ FixedExpenseMatcher (D4) ═════════════
console.log('FixedExpenseMatcher');
check('umbrales', FIXED_AUTO_THRESHOLD === 80 && FIXED_PROPOSE_THRESHOLD === 45);

{
  // "Luz" Q650 día 28 vs R4 EEGSA Q687.20 del 29/07 (comercio sacado del SMS original real).
  const r4 = sms('r4', 687.2, d(2026, 7, 29, 7, 42), 'Eegsa Web', { originalSMS: R4_BODY, merchant: undefined, description: 'BAC · compra' });
  const luz = fixed('luz', 'Luz', 650, 28);
  const m = matchFixedExpenses([r4], [luz], [r4], NOW);
  check('Luz+R4: una coincidencia', m.length === 1, JSON.stringify(m));
  check('Luz+R4: puntaje 70', m[0]?.score === 70, String(m[0]?.score));
  check('Luz+R4: NO automática', m[0]?.auto === false);
  check('Luz+R4: ids', m[0]?.expenseId === 'luz' && m[0]?.txId === 'r4');

  // Con el comercio aprendido: 50 + 20 + 20 = 90, automática.
  const learned = fixed('luz', 'Luz', 650, 28, { smsMatchKey: 'eegsa web' });
  const m2 = matchFixedExpenses([r4], [learned], [r4], NOW);
  check('Luz aprendida: 90', m2[0]?.score === 90, String(m2[0]?.score));
  check('Luz aprendida: automática', m2[0]?.auto === true);

  // Mismo caso con merchant ya guardado en el movimiento.
  const r4b = sms('r4b', 687.2, d(2026, 7, 29, 7, 42), 'EEGSA WEB');
  const m2b = matchFixedExpenses([r4b], [learned], [r4b], NOW);
  check('Luz aprendida con merchant guardado: automática', m2b[0]?.auto === true && m2b[0]?.score === 90);

  // Gasto "EEGSA" sin alias: 40 (nombre) + 20 (monto <=10%) + 20 (ventana) = 80, automática.
  const eegsa = fixed('eegsa', 'EEGSA', 640, 28);
  const m3 = matchFixedExpenses([r4], [eegsa], [r4], NOW);
  check('EEGSA sin alias: 80', m3[0]?.score === 80, String(m3[0]?.score));
  check('EEGSA sin alias: automática', m3[0]?.auto === true);
}

{
  // Tigo y Claro contra un SMS de TIGO: solo coincide Tigo.
  const tigoSms = sms('tg', 250, d(2026, 7, 27), 'TIGO');
  const tigo = fixed('f-tigo', 'Tigo', 250, 28, { category: 'internet' });
  const claro = fixed('f-claro', 'Claro', 250, 28, { category: 'internet' });
  const m = matchFixedExpenses([tigoSms], [tigo, claro], [tigoSms], NOW);
  check('Tigo/Claro: solo una coincidencia', m.length === 1, JSON.stringify(m));
  check('Tigo/Claro: es Tigo', m[0]?.expenseId === 'f-tigo');
  check('Tigo/Claro: Tigo automática (40+30+20)', m[0]?.auto === true && m[0]?.score === 90);

  // "Internet" genérico + SMS de TIGO: alias de grupo (30 + monto + ventana).
  const net = fixed('f-net', 'Internet casa', 250, 28, { category: 'internet' });
  const mNet = matchFixedExpenses([tigoSms], [net], [tigoSms], NOW);
  check('Internet genérico: alias 30 -> 80', mNet[0]?.score === 80, String(mNet[0]?.score));
  // "Internet Tigo" vs SMS de CLARO: el nombre nombra a otro proveedor.
  const claroSms = sms('cl', 250, d(2026, 7, 27), 'CLARO');
  const netTigo = fixed('f-net2', 'Internet Tigo', 250, 28, { category: 'internet' });
  check('Internet Tigo vs Claro: sin coincidencia', matchFixedExpenses([claroSms], [netTigo], [claroSms], NOW).length === 0);
}

{
  // Dos SMS de EEGSA el mismo mes: nada automático, dos propuestas.
  const a = sms('e1', 687.2, d(2026, 7, 29), 'EEGSA WEB');
  const b = sms('e2', 687.2, d(2026, 7, 15), 'EEGSA WEB');
  const eegsa = fixed('eegsa', 'EEGSA', 687.2, 28);
  const m = matchFixedExpenses([a, b], [eegsa], [a, b], NOW);
  check('2 SMS EEGSA: dos propuestas', m.length === 2, String(m.length));
  check('2 SMS EEGSA: ninguna automática', m.every(x => !x.auto));
  check('2 SMS EEGSA: ordenadas por puntaje', m.length === 2 && m[0].score >= m[1].score);

  // Dos gastos fijos que compiten por el mismo SMS: tampoco automático.
  const e2 = fixed('eegsa2', 'EEGSA casa 2', 687.2, 28);
  const m2 = matchFixedExpenses([a], [eegsa, e2], [a], NOW);
  check('2 gastos para 1 SMS: ninguna automática', m2.length === 2 && m2.every(x => !x.auto));
}

{
  // Mes anterior: se excluye. Fuera de moneda, ya vinculado o gasto pagado/inactivo: no se considera.
  const old = sms('old', 687.2, d(2026, 6, 29), 'EEGSA WEB');
  const luz = fixed('luz', 'EEGSA', 687.2, 28);
  check('mes anterior excluido', matchFixedExpenses([old], [luz], [old], NOW).length === 0);

  const ok = sms('ok', 687.2, d(2026, 7, 29), 'EEGSA WEB');
  check('base automática', matchFixedExpenses([ok], [luz], [ok], NOW)[0]?.auto === true);
  const usd = sms('usd', 687.2, d(2026, 7, 29), 'EEGSA WEB', { currency: 'USD' });
  check('otra moneda excluida', matchFixedExpenses([usd], [luz], [usd], NOW).length === 0);
  const linked = sms('lnk', 687.2, d(2026, 7, 29), 'EEGSA WEB', { fixedExpenseId: 'otro' });
  check('ya vinculado excluido', matchFixedExpenses([linked], [luz], [linked], NOW).length === 0);
  const income = sms('inc', 687.2, d(2026, 7, 29), 'EEGSA WEB', { type: 'income' });
  check('ingreso excluido', matchFixedExpenses([income], [luz], [income], NOW).length === 0);
  check('gasto pagado no se considera', matchFixedExpenses([ok], [{ ...luz, isPaid: true, lastTxId: 'fe_tx_eegsa' }], [ok], NOW).length === 0);
  check('gasto inactivo no se considera', matchFixedExpenses([ok], [{ ...luz, isActive: false }], [ok], NOW).length === 0);
  const manualFe = manual('fe_tx_luz', 687.2, d(2026, 7, 28), 'Pago EEGSA', { fixedExpenseId: 'luz' });
  check('con movimiento manual del mes no se considera', matchFixedExpenses([ok], [luz], [ok, manualFe], NOW).length === 0);

  // Renta: sin alias, solo propuesta débil con monto exacto y transferencia.
  const rent = fixed('renta', 'Renta', 3000, 1, { category: 'rent' });
  const tr = sms('tr', 3000, d(2026, 7, 2), 'TRANSFERENCIA', { category: 'transfer' });
  const mr = matchFixedExpenses([tr], [rent], [tr], NOW);
  check('renta: propuesta débil', mr.length === 1 && mr[0].auto === false && mr[0].score >= 45 && mr[0].score < 80, JSON.stringify(mr));
  const cafe = sms('cafe', 3000, d(2026, 7, 2), 'CAFE LUNA');
  check('renta: compra normal no empareja', matchFixedExpenses([cafe], [rent], [cafe], NOW).length === 0);
}

// ═════════════ DuplicateDetector (D5) ═════════════
console.log('DuplicateDetector');
const none = new Set<string>();

{
  const m = manual('m1', 25, d(2026, 10, 10, 15, 30), 'Café', { category: 'food' });
  const s = sms('s1', 25, d(2026, 10, 10, 15, 20), 'CAFE LUNA', { category: 'food' });
  const p = findManualSmsDuplicates([m, s], none);
  check('café mismo día: un par', p.length === 1, JSON.stringify(p));
  check('café mismo día: puntaje >= 80', (p[0]?.score ?? 0) >= 80, String(p[0]?.score));
  check('café mismo día: no ambiguo', p[0]?.ambiguous === false);
  check('café mismo día: ids', p[0]?.manualId === 'm1' && p[0]?.smsId === 's1');
  check('dupPairKey', dupPairKey('m1', 's1') === 'm1|s1');

  // Día local, no milisegundos: 23:50 y 00:10 del día siguiente son 1 día de diferencia (20 minutos).
  const late = manual('mL', 25, d(2026, 10, 10, 23, 50), 'Café');
  const early = sms('sE', 25, d(2026, 10, 11, 0, 10), 'CAFE LUNA');
  const pl = findManualSmsDuplicates([late, early], none);
  check('cruce de medianoche: par de un día', pl.length === 1 && pl[0].reasons[0] === 'un día de diferencia' && pl[0].score >= 60, JSON.stringify(pl));

  // Un día de diferencia (en horas más de 24 también cuenta como 1 día si es el día calendario siguiente).
  const m1d = manual('m1d', 25, d(2026, 10, 9, 8, 0), 'Café');
  const s1d = sms('s1d', 25, d(2026, 10, 10, 22, 0), 'CAFE LUNA'); // 38 h de diferencia, 1 día local
  const p1 = findManualSmsDuplicates([m1d, s1d], none);
  check('un día de diferencia (38 h): par', p1.length === 1, JSON.stringify(p1));
  check('un día: puntaje menor que el mismo día', (p1[0]?.score ?? 0) < (p[0]?.score ?? 0));

  // Dos días: nada.
  const m2d = manual('m2d', 25, d(2026, 10, 8, 12), 'Café');
  check('dos días: nada', findManualSmsDuplicates([m2d, s1d], none).length === 0);

  // USD contra Q: nada.
  const usd = sms('sU', 25, d(2026, 10, 10, 15, 20), 'CAFE LUNA', { currency: 'USD' });
  check('USD vs Q: nada', findManualSmsDuplicates([m, usd], none).length === 0);

  // Monto distinto, tipo distinto.
  check('monto distinto: nada', findManualSmsDuplicates([m, sms('sM', 25.5, d(2026, 10, 10), 'X')], none).length === 0);
  check('tipo distinto: nada', findManualSmsDuplicates([m, sms('sT', 25, d(2026, 10, 10), 'X', { type: 'income' })], none).length === 0);
  check('tolerancia de centavos (0.004)', findManualSmsDuplicates([m, sms('sC', 25.004, d(2026, 10, 10), 'X')], none).length === 1);

  // Par ignorado: nada.
  check('par ignorado: nada', findManualSmsDuplicates([m, s], new Set([dupPairKey('m1', 's1')])).length === 0);

  // Ya unido: nada.
  const merged = mergeManualIntoSms(m, s, '2026-10-10T20:00:00.000Z');
  const m3 = manual('m3', 25, d(2026, 10, 10, 18, 0), 'Otro café');
  check('SMS ya unido: no se vuelve a proponer', findManualSmsDuplicates([merged, m3], none).length === 0);
  const mergedManual = manual('mx', 25, d(2026, 10, 10), 'Café', { mergedFrom: merged.mergedFrom });
  check('manual con mergedFrom: no se propone', findManualSmsDuplicates([mergedManual, s], none).length === 0);

  // Transferencias manuales (entre cuentas propias) se excluyen; fe_tx_ cuentan como manuales.
  const tr = manual('mt', 25, d(2026, 10, 10), 'Mover', { type: 'transfer' });
  check('manual transfer excluido', findManualSmsDuplicates([tr, s], none).length === 0);
  const fe = manual('fe_tx_luz', 25, d(2026, 10, 10), 'Pago luz', { fixedExpenseId: 'luz' });
  const pf = findManualSmsDuplicates([fe, s], none);
  check('fe_tx_ cuenta como manual', pf.length === 1 && pf[0].manualId === 'fe_tx_luz', JSON.stringify(pf));

  // Misma fuente: dos SMS o dos manuales no son duplicados manual/SMS.
  const s2 = sms('s2', 25, d(2026, 10, 10), 'CAFE LUNA');
  check('dos SMS: nada', findManualSmsDuplicates([s, s2], none).length === 0);
  check('dos manuales: nada', findManualSmsDuplicates([m, manual('m2', 25, d(2026, 10, 10), 'Café')], none).length === 0);
}

{
  // Dos cafés manuales de Q25 y un SMS de Q25: ambiguous.
  const ma = manual('ma', 25, d(2026, 10, 10, 9), 'Café');
  const mb = manual('mb', 25, d(2026, 10, 10, 16), 'Café');
  const s = sms('s1', 25, d(2026, 10, 10, 15, 20), 'CAFE LUNA');
  const p = findManualSmsDuplicates([ma, mb, s], none);
  check('2 manuales: se propone un solo par', p.length === 1, JSON.stringify(p));
  check('2 manuales: ambiguous', p[0]?.ambiguous === true);

  // Un movimiento en un solo par: 2 manuales + 2 SMS iguales -> dos pares distintos sin repetir.
  const s2 = sms('s2', 25, d(2026, 10, 10, 17, 0), 'CAFE LUNA');
  const p2 = findManualSmsDuplicates([ma, mb, s, s2], none);
  check('2x2: dos pares', p2.length === 2, JSON.stringify(p2));
  check('2x2: sin repetir movimientos',
    new Set(p2.map(x => x.manualId)).size === 2 && new Set(p2.map(x => x.smsId)).size === 2);

  // Asignación desde el puntaje más alto: el manual con coincidencia de palabras gana al SMS.
  const mGood = manual('mg', 25, d(2026, 10, 10, 9), 'Café Luna', { category: 'food' });
  const sGood = sms('sg', 25, d(2026, 10, 10, 9), 'CAFE LUNA', { category: 'food' });
  const sOther = sms('so', 25, d(2026, 10, 10, 9), 'TIENDA XYZ');
  const pg = findManualSmsDuplicates([mGood, sOther, sGood], none);
  check('gana el de mayor puntaje', pg.length === 1 && pg[0].smsId === 'sg' && pg[0].score === 100, JSON.stringify(pg));
}

{
  // onlySmsIds: solo evalúa esos SMS.
  const m1 = manual('m1', 25, d(2026, 10, 10), 'Café');
  const m2 = manual('m2', 40, d(2026, 10, 11), 'Taxi');
  const s1 = sms('s1', 25, d(2026, 10, 10), 'CAFE LUNA');
  const s2 = sms('s2', 40, d(2026, 10, 11), 'UBER');
  const all = [m1, m2, s1, s2];
  check('sin filtro: dos pares', findManualSmsDuplicates(all, none).length === 2);
  const only = findManualSmsDuplicates(all, none, { onlySmsIds: new Set(['s2']) });
  check('onlySmsIds: solo el par del lote', only.length === 1 && only[0].smsId === 's2', JSON.stringify(only));
  check('onlySmsIds vacío: nada', findManualSmsDuplicates(all, none, { onlySmsIds: new Set() }).length === 0);
}

// ───────────── Unir y separar ─────────────
{
  const sOrig = sms('s1', 25, d(2026, 10, 10, 15, 20), 'CAFE LUNA', {
    category: 'food', description: 'BAC · Cafe Luna', accountId: 'cta-rule', accountSource: 'rule', bankRef: '123',
  });
  const mOrig = manual('m1', 25, d(2026, 10, 10, 15, 30), 'Café con Ana', { category: 'restaurant' });
  const NOWISO = '2026-10-10T21:00:00.000Z';

  const merged = mergeManualIntoSms(mOrig, sOrig, NOWISO);
  check('unir: conserva id/huella/monto/fecha/banco/originalSMS',
    merged.id === 's1' && merged.smsFingerprint === 'fp-s1' && merged.amount === 25 && merged.date === sOrig.date
    && merged.bank === 'BAC' && merged.originalSMS === 'sms s1' && merged.source === 'sms');
  check('unir: descripción del manual', merged.description === 'Café con Ana');
  check('unir: categoría del manual editada', merged.category === 'restaurant' && merged.categoryEditedAt === NOWISO);
  check('unir: mergedFrom con copia del manual',
    merged.mergedFrom?.id === 'm1' && merged.mergedFrom.description === 'Café con Ana' && merged.mergedFrom.date === mOrig.date);
  check('unir: smsPrev', merged.mergedFrom?.smsPrev?.description === 'BAC · Cafe Luna' && merged.mergedFrom.smsPrev.category === 'food');
  check('unir: no muta las entradas', sOrig.description === 'BAC · Cafe Luna' && !sOrig.mergedFrom && sOrig.categoryEditedAt === undefined);
  check('unir: sin accountId del manual conserva el del SMS', merged.accountId === 'cta-rule' && merged.accountSource === 'rule');

  const back = splitMerged(merged);
  check('separar: devuelve resultado', back !== null);
  check('separar: SMS original', JSON.stringify(back?.sms) === JSON.stringify(sOrig), JSON.stringify(back?.sms));
  check('separar: manual original', JSON.stringify(back?.manual) === JSON.stringify(mOrig), JSON.stringify(back?.manual));
  check('separar: sin mergedFrom en el SMS', back?.sms.mergedFrom === undefined);
  check('separar: SMS sin mergedFrom -> null', splitMerged(sOrig) === null);

  // Con categoría previa editada del SMS y descripción vacía en el manual.
  const sEdited = { ...sOrig, categoryEditedAt: '2026-10-09T10:00:00.000Z' };
  const mEmpty = manual('m2', 25, d(2026, 10, 10), '  ', { category: 'food' });
  const mg2 = mergeManualIntoSms(mEmpty, sEdited, NOWISO);
  check('descripción vacía del manual: se conserva la del SMS', mg2.description === 'BAC · Cafe Luna');
  const back2 = splitMerged(mg2);
  check('separar con categoryEditedAt previo', JSON.stringify(back2?.sms) === JSON.stringify(sEdited));
  check('separar: manual vacío', JSON.stringify(back2?.manual) === JSON.stringify(mEmpty));

  // Cuenta del manual gana con accountSource 'user'.
  const mAcc = manual('m3', 25, d(2026, 10, 10), 'Café', { accountId: 'cta-user' });
  const mg3 = mergeManualIntoSms(mAcc, sOrig, NOWISO);
  check('unir: accountId del manual con source user', mg3.accountId === 'cta-user' && mg3.accountSource === 'user');

  // fe_tx_: el vínculo pasa al SMS y vuelve al separar.
  const mFe = manual('fe_tx_luz', 25, d(2026, 10, 10), 'Pago luz', { fixedExpenseId: 'luz' });
  const mg4 = mergeManualIntoSms(mFe, sOrig, NOWISO);
  check('unir fe_tx_: fixedExpenseId pasa al SMS', mg4.fixedExpenseId === 'luz');
  const mFeOld = manual('fe_tx_agua', 25, d(2026, 10, 10), 'Pago agua'); // dato viejo sin fixedExpenseId
  check('unir fe_tx_ sin campo: se deriva del id', mergeManualIntoSms(mFeOld, sOrig, NOWISO).fixedExpenseId === 'agua');
  const back4 = splitMerged(mg4);
  check('separar fe_tx_: el vínculo vuelve al manual', back4?.manual.fixedExpenseId === 'luz' && back4.sms.fixedExpenseId === undefined);
  check('separar fe_tx_: SMS original', JSON.stringify(back4?.sms) === JSON.stringify(sOrig));

  // Ida y vuelta completa: cuenta y categoryEditedAt del manual, y la cuenta previa del SMS.
  const mFull = manual('m5', 25, d(2026, 10, 10), 'Café', {
    category: 'restaurant', accountId: 'cta-user', categoryEditedAt: '2026-10-10T20:30:00.000Z',
  });
  const mg5 = mergeManualIntoSms(mFull, sOrig, NOWISO);
  check('unir: mergedFrom guarda accountId y categoryEditedAt del manual',
    mg5.mergedFrom?.accountId === 'cta-user' && mg5.mergedFrom.categoryEditedAt === '2026-10-10T20:30:00.000Z');
  check('unir: smsPrev guarda la cuenta previa del SMS',
    mg5.mergedFrom?.smsPrev?.accountId === 'cta-rule' && mg5.mergedFrom.smsPrev.accountSource === 'rule');
  const back5 = splitMerged(mg5);
  check('separar: el manual recupera cuenta y categoryEditedAt',
    back5?.manual.accountId === 'cta-user' && back5.manual.categoryEditedAt === '2026-10-10T20:30:00.000Z'
    && back5.manual.accountSource === undefined);
  check('separar: el SMS recupera su cuenta de regla', back5?.sms.accountId === 'cta-rule' && back5.sms.accountSource === 'rule');
  check('separar: sin mergedFrom en el SMS (cuenta)', back5?.sms.mergedFrom === undefined);

  // SMS sin cuenta + manual con cuenta: al separar el SMS vuelve a quedar sin cuenta.
  const sNoAcc = sms('s6', 25, d(2026, 10, 10, 15, 20), 'CAFE LUNA');
  const back6 = splitMerged(mergeManualIntoSms(mFull, sNoAcc, NOWISO));
  check('separar: SMS sin cuenta previa queda sin cuenta',
    back6 !== null && back6.sms.accountId === undefined && back6.sms.accountSource === undefined
    && JSON.stringify(back6.sms) === JSON.stringify(sNoAcc));

  // Si el usuario cambió la cuenta después de unir, no se pisa al separar.
  const mg7 = { ...mg5, accountId: 'cta-otra' };
  check('separar: cuenta cambiada después de unir se respeta', splitMerged(mg7)?.sms.accountId === 'cta-otra');
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
