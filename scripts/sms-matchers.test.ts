process.env.TZ = 'America/Guatemala';
// Pruebas de FixedExpenseMatcher (D4) y DuplicateDetector (D5). Sin dependencias:
//   npm run test:sms-matchers   →   sucrase-node scripts/sms-matchers.test.ts

import {
  dupPairKey, findManualSmsDuplicates, mergeManualIntoSms, splitMerged,
} from '../services/DuplicateDetector';
import {
  FIXED_AUTO_THRESHOLD, FIXED_PROPOSE_THRESHOLD, matchFixedExpenses,
  findFixedFusions, findPastSmsForFixed, fixedRejectKey, planFixedFusion, rankFixedForTx, relinkFixedAfterSplit,
} from '../services/FixedExpenseMatcher';
import {
  cycleKeyFor, cycleKeyFromFeTxId, defaultPaidDate, dueDateInPeriod, feTxId, fixedCycleConfig, fixedDueInfo,
  fixedIdFromFeTxId, nextFixedReminder, normalizeCycleKey, periodFor, planFixedPeriodReset,
} from '../services/FixedCycle';
import type { FixedCycleConfig } from '../services/FixedCycle';
import { planSmsUndo } from '../services/SmsUndoPlan';
import type { FixedExpense, SmsBatchRecord, Transaction } from '../services/storage';

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
const CAL: FixedCycleConfig = { anchorDay: 1 };  // período = mes calendario
const P27: FixedCycleConfig = { anchorDay: 27 }; // período 27 – 26

// ═════════════ FixedExpenseMatcher (D4) ═════════════
console.log('FixedExpenseMatcher');
check('umbrales', FIXED_AUTO_THRESHOLD === 80 && FIXED_PROPOSE_THRESHOLD === 45);

{
  // "Luz" Q650 día 28 vs R4 EEGSA Q687.20 del 29/07 (comercio sacado del SMS original real).
  const r4 = sms('r4', 687.2, d(2026, 7, 29, 7, 42), 'Eegsa Web', { originalSMS: R4_BODY, merchant: undefined, description: 'BAC · compra' });
  const luz = fixed('luz', 'Luz', 650, 28);
  const m = matchFixedExpenses([r4], [luz], [r4], NOW, { cycle: CAL });
  check('Luz+R4: una coincidencia', m.length === 1, JSON.stringify(m));
  check('Luz+R4: puntaje 70', m[0]?.score === 70, String(m[0]?.score));
  check('Luz+R4: NO automática', m[0]?.auto === false);
  check('Luz+R4: ids', m[0]?.expenseId === 'luz' && m[0]?.txId === 'r4');

  // Con el comercio aprendido: 50 + 20 + 20 = 90, automática. Desde el catálogo de marcas (GuatemalaBrands)
  // el comercio "EEGSA WEB" se normaliza a la marca "EEGSA", así que la clave aprendida es 'eegsa' (antes 'eegsa web').
  const learned = fixed('luz', 'Luz', 650, 28, { smsMatchKey: 'eegsa' });
  const m2 = matchFixedExpenses([r4], [learned], [r4], NOW, { cycle: CAL });
  check('Luz aprendida: 90', m2[0]?.score === 90, String(m2[0]?.score));
  check('Luz aprendida: automática', m2[0]?.auto === true);

  // Mismo caso con merchant ya guardado en el movimiento.
  const r4b = sms('r4b', 687.2, d(2026, 7, 29, 7, 42), 'EEGSA WEB');
  const m2b = matchFixedExpenses([r4b], [learned], [r4b], NOW, { cycle: CAL });
  check('Luz aprendida con merchant guardado: automática', m2b[0]?.auto === true && m2b[0]?.score === 90);

  // Gasto "EEGSA" sin alias: 40 (nombre) + 20 (monto <=10%) + 20 (ventana) = 80, automática.
  const eegsa = fixed('eegsa', 'EEGSA', 640, 28);
  const m3 = matchFixedExpenses([r4], [eegsa], [r4], NOW, { cycle: CAL });
  check('EEGSA sin alias: 80', m3[0]?.score === 80, String(m3[0]?.score));
  check('EEGSA sin alias: automática', m3[0]?.auto === true);
}

{
  // Tigo y Claro contra un SMS de TIGO: solo coincide Tigo.
  const tigoSms = sms('tg', 250, d(2026, 7, 27), 'TIGO');
  const tigo = fixed('f-tigo', 'Tigo', 250, 28, { category: 'internet' });
  const claro = fixed('f-claro', 'Claro', 250, 28, { category: 'internet' });
  const m = matchFixedExpenses([tigoSms], [tigo, claro], [tigoSms], NOW, { cycle: CAL });
  check('Tigo/Claro: solo una coincidencia', m.length === 1, JSON.stringify(m));
  check('Tigo/Claro: es Tigo', m[0]?.expenseId === 'f-tigo');
  check('Tigo/Claro: Tigo automática (40+30+20)', m[0]?.auto === true && m[0]?.score === 90);

  // "Internet" genérico + SMS de TIGO: alias de grupo (30 + monto + ventana).
  const net = fixed('f-net', 'Internet casa', 250, 28, { category: 'internet' });
  const mNet = matchFixedExpenses([tigoSms], [net], [tigoSms], NOW, { cycle: CAL });
  check('Internet genérico: alias 30 -> 80', mNet[0]?.score === 80, String(mNet[0]?.score));
  // "Internet Tigo" vs SMS de CLARO: el nombre nombra a otro proveedor.
  const claroSms = sms('cl', 250, d(2026, 7, 27), 'CLARO');
  const netTigo = fixed('f-net2', 'Internet Tigo', 250, 28, { category: 'internet' });
  check('Internet Tigo vs Claro: sin coincidencia', matchFixedExpenses([claroSms], [netTigo], [claroSms], NOW, { cycle: CAL }).length === 0);
}

{
  // Dos SMS de EEGSA el mismo mes: nada automático, dos propuestas.
  const a = sms('e1', 687.2, d(2026, 7, 29), 'EEGSA WEB');
  const b = sms('e2', 687.2, d(2026, 7, 15), 'EEGSA WEB');
  const eegsa = fixed('eegsa', 'EEGSA', 687.2, 28);
  const m = matchFixedExpenses([a, b], [eegsa], [a, b], NOW, { cycle: CAL });
  check('2 SMS EEGSA: dos propuestas', m.length === 2, String(m.length));
  check('2 SMS EEGSA: ninguna automática', m.every(x => !x.auto));
  check('2 SMS EEGSA: ordenadas por puntaje', m.length === 2 && m[0].score >= m[1].score);

  // Dos gastos fijos que compiten por el mismo SMS: tampoco automático.
  const e2 = fixed('eegsa2', 'EEGSA casa 2', 687.2, 28);
  const m2 = matchFixedExpenses([a], [eegsa, e2], [a], NOW, { cycle: CAL });
  check('2 gastos para 1 SMS: ninguna automática', m2.length === 2 && m2.every(x => !x.auto));
}

{
  // Nombres canónicos del catálogo de marcas (GuatemalaBrands): los alias de luz / agua / internet siguen funcionando.
  const luzCanon = fixed('luz', 'Luz', 650, 28);
  for (const brand of ['EEGSA', 'Energuate', 'Deocsa']) {
    const t = sms('c-' + brand, 650, d(2026, 7, 29), brand);
    const r = matchFixedExpenses([t], [luzCanon], [t], NOW, { cycle: CAL });
    check(`Luz + marca canónica "${brand}": una coincidencia`, r.length === 1 && r[0].expenseId === 'luz', JSON.stringify(r));
  }
  const aguaT = sms('c-empagua', 120, d(2026, 7, 29), 'Empagua');
  check('Gasto "Empagua" + marca canónica "Empagua"', matchFixedExpenses([aguaT], [fixed('agua', 'Empagua', 120, 28)], [aguaT], NOW, { cycle: CAL }).length === 1);
  const netT = sms('c-claro', 299, d(2026, 7, 29), 'Claro');
  check('Internet + marca canónica "Claro"', matchFixedExpenses([netT], [fixed('net', 'Internet', 299, 28, { category: 'internet' })], [netT], NOW, { cycle: CAL }).length === 1);
  const telgua = sms('c-telgua', 299, d(2026, 7, 29), 'Telgua');
  check('Internet + marca canónica "Telgua"', matchFixedExpenses([telgua], [fixed('net2', 'Internet', 299, 28, { category: 'internet' })], [telgua], NOW, { cycle: CAL }).length === 1);
  const strT = sms('c-disney', 59, d(2026, 7, 29), 'Disney+');
  check('Streaming + marca canónica "Disney+"', matchFixedExpenses([strT], [fixed('st', 'Streaming', 59, 28, { category: 'streaming' })], [strT], NOW, { cycle: CAL }).length === 1);
}

{
  // Mes anterior: se excluye. Fuera de moneda, ya vinculado o gasto pagado/inactivo: no se considera.
  const old = sms('old', 687.2, d(2026, 6, 29), 'EEGSA WEB');
  const luz = fixed('luz', 'EEGSA', 687.2, 28);
  check('mes anterior excluido', matchFixedExpenses([old], [luz], [old], NOW, { cycle: CAL }).length === 0);

  const ok = sms('ok', 687.2, d(2026, 7, 29), 'EEGSA WEB');
  check('base automática', matchFixedExpenses([ok], [luz], [ok], NOW, { cycle: CAL })[0]?.auto === true);
  const usd = sms('usd', 687.2, d(2026, 7, 29), 'EEGSA WEB', { currency: 'USD' });
  check('otra moneda excluida', matchFixedExpenses([usd], [luz], [usd], NOW, { cycle: CAL }).length === 0);
  const linked = sms('lnk', 687.2, d(2026, 7, 29), 'EEGSA WEB', { fixedExpenseId: 'otro' });
  check('ya vinculado excluido', matchFixedExpenses([linked], [luz], [linked], NOW, { cycle: CAL }).length === 0);
  const income = sms('inc', 687.2, d(2026, 7, 29), 'EEGSA WEB', { type: 'income' });
  check('ingreso excluido', matchFixedExpenses([income], [luz], [income], NOW, { cycle: CAL }).length === 0);
  check('gasto pagado no se considera', matchFixedExpenses([ok], [{ ...luz, isPaid: true, lastTxId: 'fe_tx_eegsa' }], [ok], NOW, { cycle: CAL }).length === 0);
  check('gasto inactivo no se considera', matchFixedExpenses([ok], [{ ...luz, isActive: false }], [ok], NOW, { cycle: CAL }).length === 0);
  const manualFe = manual('fe_tx_luz', 687.2, d(2026, 7, 28), 'Pago EEGSA', { fixedExpenseId: 'luz' });
  check('con movimiento manual del mes no se considera', matchFixedExpenses([ok], [luz], [ok, manualFe], NOW, { cycle: CAL }).length === 0);

  // Renta: sin alias, solo propuesta débil con monto exacto y transferencia.
  const rent = fixed('renta', 'Renta', 3000, 1, { category: 'rent' });
  const tr = sms('tr', 3000, d(2026, 7, 2), 'TRANSFERENCIA', { category: 'transfer' });
  const mr = matchFixedExpenses([tr], [rent], [tr], NOW, { cycle: CAL });
  check('renta: propuesta débil', mr.length === 1 && mr[0].auto === false && mr[0].score >= 45 && mr[0].score < 80, JSON.stringify(mr));
  const cafe = sms('cafe', 3000, d(2026, 7, 2), 'CAFE LUNA');
  check('renta: compra normal no empareja', matchFixedExpenses([cafe], [rent], [cafe], NOW, { cycle: CAL }).length === 0);
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

// ═════════════ Gasto fijo ↔ SMS (Disney) ═════════════
console.log('Gasto fijo ↔ SMS (Disney)');
{
  const NOW_NOV = new Date(2026, 10, 10, 10);
  const feDisney = fixed('fe_disney', 'Disney+', 11.49, 1, { currency: 'USD', category: 'streaming', autoRecord: true });
  const dSms = (id: string, date: Date, extra: Partial<Transaction> = {}) =>
    sms(id, 11.49, date, 'Disney Plus', { currency: 'USD', description: 'BAC · Compra en Disney Plus', ...extra });
  const ago = dSms('d-ago', d(2026, 8, 1, 8));
  const sep = dSms('d-sep', d(2026, 9, 1, 8));
  const oct = dSms('d-oct', d(2026, 10, 1, 8));
  const smsNov1 = dSms('d-nov', d(2026, 11, 1, 8));
  const manualNov = manual('fe_tx_fe_disney_2026-11', 11.49, d(2026, 11, 10, 12), 'Disney+', {
    currency: 'USD', category: 'streaming', fixedExpenseId: 'fe_disney',
  });
  const fePaid: FixedExpense = { ...feDisney, isPaid: true, paidBy: 'manual', lastTxId: manualNov.id, paidDate: manualNov.date };
  const NOWISO = '2026-11-10T20:00:00.000Z';

  // (1) Ids fe_tx_
  check('fixedIdFromFeTxId: id con ciclo', fixedIdFromFeTxId('fe_tx_fe_disney_2026-11') === 'fe_disney');
  check('fixedIdFromFeTxId: id viejo sin ciclo', fixedIdFromFeTxId('fe_tx_luz') === 'luz');
  check('fixedIdFromFeTxId: ciclo y sufijo numérico', fixedIdFromFeTxId('fe_tx_fe_1_2026-11_1731') === 'fe_1');
  check('fixedIdFromFeTxId: no es fe_tx_', fixedIdFromFeTxId('abc') === null);
  check('cycleKeyFromFeTxId: con ciclo (formato viejo)', cycleKeyFromFeTxId('fe_tx_fe_disney_2026-11') === '2026-11');
  check('cycleKeyFromFeTxId: sin ciclo', cycleKeyFromFeTxId('fe_tx_luz') === null);
  check('cycleKeyFromFeTxId: ciclo y sufijo numérico', cycleKeyFromFeTxId('fe_tx_fe_1_2026-11_1731') === '2026-11');
  check('cycleKeyFromFeTxId: no es fe_tx_', cycleKeyFromFeTxId('abc') === null);
  check('feTxId', feTxId('fe_disney', '2026-11') === 'fe_tx_fe_disney_2026-11');
  check('feTxId <-> fixedIdFromFeTxId', fixedIdFromFeTxId(feTxId('x_y', '2026-02')) === 'x_y');

  // (2) Período de un movimiento (reemplaza a occurrenceKeyFor: ahora depende SOLO de la fecha)
  check('cycleKeyFor: 30 oct (CAL) -> período de octubre', cycleKeyFor(CAL, d(2026, 10, 30).toISOString()) === '2026-10-01');
  check('cycleKeyFor: 2 nov (CAL) -> período de noviembre', cycleKeyFor(CAL, d(2026, 11, 2).toISOString()) === '2026-11-01');
  check('cycleKeyFor: valor solo-fecha', cycleKeyFor(CAL, '2026-11-01') === '2026-11-01');
  check('cycleKeyFor: medianoche UTC es ese día', cycleKeyFor(CAL, '2026-11-01T00:00:00.000Z') === '2026-11-01');
  check('cycleKeyFor: 28 feb (CAL) -> febrero', cycleKeyFor(CAL, '2027-02-28') === '2027-02-01');
  check('cycleKeyFor: fecha inválida', cycleKeyFor(CAL, 'nada') === null);

  // (3) Lo que antes no se unía sigue sin proponerse por las rutas viejas
  check('matcher: SMS de ago/sep/oct no entran al ciclo de noviembre',
    matchFixedExpenses([ago, sep, oct], [feDisney], [ago, sep, oct, manualNov], NOW_NOV, { cycle: CAL }).length === 0);
  check('duplicados: manual 10 nov y SMS 1 nov no se proponen (> 1 día)',
    findManualSmsDuplicates([manualNov, smsNov1], none).length === 0);

  // (4) Fusión
  const all = [manualNov, smsNov1, ago, sep, oct];
  const f1 = findFixedFusions(all, [fePaid], { cycle: CAL });
  check('fusión: un par', f1.length === 1, JSON.stringify(f1));
  check('fusión: ids', f1[0]?.manualId === manualNov.id && f1[0]?.smsId === 'd-nov' && f1[0]?.expenseId === 'fe_disney');
  check('fusión: automática con puntaje 90', f1[0]?.auto === true && f1[0]?.score === 90, JSON.stringify(f1[0]));
  const fLearn = findFixedFusions(all, [{ ...fePaid, smsMatchKey: 'disney' }], { cycle: CAL });
  check('fusión con comercio aprendido: 100', fLearn[0]?.score === 100, JSON.stringify(fLearn[0]));
  check('fusión: par ignorado', findFixedFusions(all, [fePaid], { cycle: CAL, ignored: new Set([dupPairKey(manualNov.id, 'd-nov')]) }).length === 0);
  const sms1399 = dSms('d-nov', d(2026, 11, 1, 8), { amount: 13.99 });
  check('fusión: monto distinto no se propone', findFixedFusions([manualNov, sms1399], [fePaid], { cycle: CAL }).length === 0);
  check('fusión: onlySmsIds', findFixedFusions(all, [fePaid], { cycle: CAL, onlySmsIds: new Set(['d-oct']) }).length === 0
    && findFixedFusions(all, [fePaid], { cycle: CAL, onlySmsIds: new Set(['d-nov']) }).length === 1);
  check('fusión: SMS del 1 oct no se une al manual de noviembre',
    findFixedFusions([manualNov, oct], [fePaid], { cycle: CAL }).length === 0);
  check('fusión: SMS con transferPairId excluido',
    findFixedFusions([manualNov, dSms('d-nov', d(2026, 11, 1, 8), { transferPairId: 'p1' })], [fePaid], { cycle: CAL }).length === 0);
  check('fusión: SMS vinculado a otro gasto excluido',
    findFixedFusions([manualNov, dSms('d-nov', d(2026, 11, 1, 8), { fixedExpenseId: 'otro' })], [fePaid], { cycle: CAL }).length === 0);
  check('fusión: SMS ya vinculado a este mismo gasto sí cuenta',
    findFixedFusions([manualNov, dSms('d-nov', d(2026, 11, 1, 8), { fixedExpenseId: 'fe_disney' })], [fePaid], { cycle: CAL }).length === 1);
  check('fusión: otra moneda excluida',
    findFixedFusions([manualNov, dSms('d-nov', d(2026, 11, 1, 8), { currency: 'Q' })], [fePaid], { cycle: CAL }).length === 0);
  check('fusión: gasto fijo inexistente', findFixedFusions(all, [], { cycle: CAL }).length === 0);
  // Dos SMS el mismo mes para un manual: un solo par (cada movimiento en un par) y no automático.
  const smsNov2 = dSms('d-nov2', d(2026, 11, 2, 8));
  const f2 = findFixedFusions([manualNov, smsNov1, smsNov2], [fePaid], { cycle: CAL });
  check('fusión: dos SMS un manual -> un par no automático', f2.length === 1 && f2[0].auto === false, JSON.stringify(f2));
  check('fusión: gana el SMS más cercano al manual', f2[0]?.smsId === 'd-nov2', JSON.stringify(f2));
  // Dos manuales y dos SMS: dos pares, ninguno automático.
  const manualNov2 = manual('otro_manual', 11.49, d(2026, 11, 11, 12), 'Disney+', { currency: 'USD', fixedExpenseId: 'fe_disney' });
  const f3 = findFixedFusions([manualNov, manualNov2, smsNov1, smsNov2], [fePaid], { cycle: CAL });
  check('fusión 2x2: dos pares sin repetir', f3.length === 2
    && new Set(f3.map(x => x.manualId)).size === 2 && new Set(f3.map(x => x.smsId)).size === 2, JSON.stringify(f3));
  check('fusión 2x2: ninguno automático', f3.every(x => !x.auto));

  // (5) Plan de fusión y reversa
  const plan = planFixedFusion(manualNov, smsNov1, fePaid, NOWISO, CAL, 'disney');
  check('plan: el SMS sobrevive con su id', plan.merged.id === 'd-nov');
  check('plan: monto y fecha del SMS', plan.merged.amount === 11.49 && plan.merged.date === smsNov1.date);
  check('plan: fixedExpenseId', plan.merged.fixedExpenseId === 'fe_disney');
  check('plan: mergedFrom del manual', plan.merged.mergedFrom?.id === manualNov.id);
  check('plan: gasto pagado por SMS', plan.nextFe.isPaid === true && plan.nextFe.paidBy === 'sms'
    && plan.nextFe.paidTxId === 'd-nov' && plan.nextFe.lastTxId === undefined && plan.nextFe.paidDate === smsNov1.date,
    JSON.stringify(plan.nextFe));
  check('plan: paidCycleKey 2026-11-01', plan.nextFe.paidCycleKey === '2026-11-01');
  check('plan: aprende smsMatchKey', plan.nextFe.smsMatchKey === 'disney');
  check('plan: no muta el gasto original', fePaid.lastTxId === manualNov.id && fePaid.smsMatchKey === undefined);
  const planKeep = planFixedFusion(manualNov, smsNov1, { ...fePaid, smsMatchKey: 'otra' }, NOWISO, CAL, 'disney');
  check('plan: no pisa un smsMatchKey existente', planKeep.nextFe.smsMatchKey === 'otra');
  const feMarked = { ...fePaid, paidCycleKey: '2026-12-01' };
  check('plan: respeta un paidCycleKey ya guardado', planFixedFusion(manualNov, smsNov1, feMarked, NOWISO, CAL).nextFe.paidCycleKey === '2026-12-01');

  // Manual de un mes pasado: el gasto no cambia (solo aprende la clave).
  const manualOct = manual('fe_tx_fe_disney_2026-10', 11.49, d(2026, 10, 10, 12), 'Disney+', { currency: 'USD', fixedExpenseId: 'fe_disney' });
  const planPast = planFixedFusion(manualOct, oct, fePaid, NOWISO, CAL);
  check('plan mes pasado: gasto sin cambios', planPast.nextFe === fePaid);
  check('plan mes pasado: aun así vincula el SMS', planPast.merged.fixedExpenseId === 'fe_disney' && planPast.merged.mergedFrom?.id === manualOct.id);
  check('plan mes pasado: aprende la clave sin tocar el pago',
    planFixedFusion(manualOct, oct, fePaid, NOWISO, CAL, 'disney').nextFe.smsMatchKey === 'disney'
    && planFixedFusion(manualOct, oct, fePaid, NOWISO, CAL, 'disney').nextFe.paidTxId === undefined);

  const back = splitMerged(plan.merged);
  check('separar: vuelve el manual con su vínculo', back?.manual.id === manualNov.id && back.manual.fixedExpenseId === 'fe_disney');
  check('separar: el SMS queda sin vínculo', back?.sms.fixedExpenseId === undefined);
  const relinked = relinkFixedAfterSplit([plan.nextFe], 'd-nov', back!.manual);
  check('relink: pagado a mano de nuevo', relinked[0].isPaid === true && relinked[0].paidBy === 'manual'
    && relinked[0].lastTxId === manualNov.id && relinked[0].paidTxId === undefined && relinked[0].paidDate === manualNov.date,
    JSON.stringify(relinked[0]));
  check('relink: conserva el ciclo', relinked[0].paidCycleKey === '2026-11-01');
  check('relink: otro SMS no toca el gasto', relinkFixedAfterSplit([plan.nextFe], 'otro-sms', back!.manual)[0] === plan.nextFe);

  // Regresión del slice: id terminado en _2026-11 da el id real del gasto.
  check('mergeManualIntoSms: id fe_tx_<id>_<ciclo> -> id real',
    mergeManualIntoSms(manual('fe_tx_fe_disney_2026-11', 11.49, d(2026, 11, 10), 'Disney+', { currency: 'USD' }), smsNov1, NOWISO).fixedExpenseId === 'fe_disney');

  // (6) Aprendizaje
  {
    const NOW_DEC = new Date(2026, 11, 3, 10);
    const dec1 = dSms('d-dec', d(2026, 12, 1, 8));
    const feDia10 = fixed('fe_d10', 'Disney+', 11.49, 10, { currency: 'USD', category: 'streaming' });
    const withKey = matchFixedExpenses([dec1], [{ ...feDia10, smsMatchKey: 'disney' }], [dec1], NOW_DEC, { cycle: CAL });
    check('aprendizaje: con clave 85 automática', withKey.length === 1 && withKey[0].score === 85 && withKey[0].auto === true, JSON.stringify(withKey));
    const noKey = matchFixedExpenses([dec1], [feDia10], [dec1], NOW_DEC, { cycle: CAL });
    check('aprendizaje: sin clave 75 no automática', noKey.length === 1 && noKey[0].score === 75 && noKey[0].auto === false, JSON.stringify(noKey));
    // Precio distinto (13% > 10%) con clave y dentro de la ventana de pago (8 dic): 50 + 0 + 20.
    const dec8 = dSms('d-dec8', d(2026, 12, 8, 8), { amount: 12.99 });
    const price = matchFixedExpenses([dec8], [{ ...feDia10, smsMatchKey: 'disney' }], [dec8], NOW_DEC, { cycle: CAL });
    check('aprendizaje: precio 12.99 con clave 70 propuesta', price.length === 1 && price[0].score === 70 && price[0].auto === false, JSON.stringify(price));
    // Rechazo: la clave coincide con la de FixedExpenseMatchModal y se respeta.
    check('fixedRejectKey', fixedRejectKey('fe_d10', 'd-dec') === 'fx|fe_d10|d-dec');
    const ign = matchFixedExpenses([dec1], [feDia10], [dec1], NOW_DEC, { cycle: CAL, ignored: new Set([fixedRejectKey('fe_d10', 'd-dec')]) });
    check('rechazo: par ignorado no se propone', ign.length === 0);
  }

  // (7) SMS pasados
  {
    const manualOctReal = manual('fe_tx_fe_disney_2026-10', 11.49, d(2026, 10, 10, 12), 'Disney+', { currency: 'USD', fixedExpenseId: 'fe_disney' });
    const past = findPastSmsForFixed(feDisney, [ago, sep, oct, smsNov1, manualNov, manualOctReal], { key: 'disney', beforeKey: '2026-11-01', cycle: CAL });
    check('pasados: tres meses', past.length === 3, JSON.stringify(past.map(p => p.cycleKey)));
    check('pasados: orden reciente primero', past.map(p => p.tx.id).join() === 'd-oct,d-sep,d-ago', past.map(p => p.tx.id).join());
    check('pasados: ciclos', past.map(p => p.cycleKey).join() === '2026-10-01,2026-09-01,2026-08-01');
    check('pasados: manualId solo en octubre', past[0].manualId === 'fe_tx_fe_disney_2026-10' && past[1].manualId === undefined && past[2].manualId === undefined);
    const netflix = sms('nf', 11.49, d(2026, 10, 1, 9), 'Netflix', { currency: 'USD' });
    const linked = dSms('d-lnk', d(2026, 7, 1, 8), { fixedExpenseId: 'otro' });
    const merged = dSms('d-mrg', d(2026, 6, 1, 8), { mergedFrom: { id: 'x', description: 'x', category: 'other', date: '', amount: 1, currency: 'USD' } });
    const usdQ = dSms('d-q', d(2026, 5, 1, 8), { currency: 'Q' });
    const paired = dSms('d-pair', d(2026, 4, 1, 8), { transferPairId: 'p' });
    const noise = [netflix, linked, merged, usdQ, paired];
    check('pasados: excluye otro comercio, vinculados, unidos, otra moneda y transferencias',
      findPastSmsForFixed(feDisney, [ago, sep, oct, ...noise], { key: 'disney', beforeKey: '2026-11-01', cycle: CAL }).length === 3);
    check('pasados: excludeTxId', findPastSmsForFixed(feDisney, [ago, sep, oct], { key: 'disney', beforeKey: '2026-11-01', excludeTxId: 'd-oct', cycle: CAL }).length === 2);
    check('pasados: beforeKey', findPastSmsForFixed(feDisney, [ago, sep, oct], { key: 'disney', beforeKey: '2026-10-01', cycle: CAL }).length === 2);
    // Dos SMS del mismo mes: uno (el de monto más cercano; con empate, el más antiguo).
    const octCheap = dSms('d-oct-b', d(2026, 10, 2, 8), { amount: 5 });
    const one = findPastSmsForFixed(feDisney, [oct, octCheap], { key: 'disney', beforeKey: '2026-11-01', cycle: CAL });
    check('pasados: un SMS por mes (monto más cercano)', one.length === 1 && one[0].tx.id === 'd-oct', JSON.stringify(one.map(p => p.tx.id)));
    const octTie = dSms('d-oct-c', d(2026, 10, 2, 8));
    const tie = findPastSmsForFixed(feDisney, [octTie, oct], { key: 'disney', beforeKey: '2026-11-01', cycle: CAL });
    check('pasados: empate gana el más antiguo', tie.length === 1 && tie[0].tx.id === 'd-oct', JSON.stringify(tie.map(p => p.tx.id)));
    const many: Transaction[] = [];
    for (let i = 0; i < 30; i++) many.push(dSms(`m${i}`, new Date(2024, 0 + i, 1, 8)));
    check('pasados: tope 24', findPastSmsForFixed(feDisney, many, { key: 'disney', beforeKey: '2027-01-01', cycle: CAL }).length === 24);

    // La UI solo ofrece unir duplicados reales (con manualId): SMS sueltos de otros meses no se ofrecen.
    const dupsOnly = (txs: Transaction[]) =>
      findPastSmsForFixed(feDisney, txs, { key: 'disney', beforeKey: '2026-11-01', cycle: CAL }).filter(p => !!p.manualId);
    check('pasados (solo duplicados): ago/sep/oct sin manuales -> 0', dupsOnly([ago, sep, oct]).length === 0);
    const dupOnly = dupsOnly([ago, sep, oct, manualOctReal]);
    check('pasados (solo duplicados): con fe_tx_fe_disney_2026-10 -> 1',
      dupOnly.length === 1 && dupOnly[0].tx.id === 'd-oct' && dupOnly[0].manualId === 'fe_tx_fe_disney_2026-10',
      JSON.stringify(dupOnly.map(p => p.tx.id)));
    // Fusión: SMS de otro mes (>= 30 días del manual) no se une aunque el comercio y el monto coincidan.
    check('fusión: SMS 30+ días antes del manual no se une',
      findFixedFusions([manualNov, dSms('d-oct10', d(2026, 10, 10, 8))], [fePaid], { cycle: CAL }).length === 0);
    check('fusión: SMS 30+ días antes (ago/sep/oct) no se une al manual de noviembre',
      findFixedFusions([manualNov, ago, sep, oct], [fePaid], { cycle: CAL }).length === 0);
  }

  // (8) Período 27 oct – 26 nov (paymentDay = 27): el SMS pertenece al período de su fecha
  {
    const s28 = dSms('p28', d(2026, 10, 28, 8));
    const m = matchFixedExpenses([s28], [feDisney], [s28], NOW_NOV, { cycle: P27 });
    check('período: SMS 28 oct con gasto día 1 -> una coincidencia automática', m.length === 1 && m[0].auto === true && m[0].score === 90, JSON.stringify(m));
    const feDia28 = fixed('fe28', 'Disney+', 11.49, 28, { currency: 'USD', category: 'streaming' });
    const s27 = dSms('p27', d(2026, 10, 27, 8));
    const m27 = matchFixedExpenses([s27], [feDia28], [s27], NOW_NOV, { cycle: P27 });
    check('período: SMS 27 oct con gasto día 28 -> coincide (27 oct es el inicio del período)', m27.length === 1 && m27[0].auto === true, JSON.stringify(m27));
  }

  // (9) Reinicio mensual
  {
    const NOW_NOV1 = new Date(2026, 10, 1, 9);
    const keep = { ...feDisney, isPaid: true, paidBy: 'sms' as const, paidTxId: 'x', paidCycleKey: '2026-11' }; // clave vieja 'YYYY-MM'
    const future = { ...feDisney, id: 'fut', isPaid: true, paidCycleKey: '2026-12' };
    const old = { ...feDisney, id: 'old', isPaid: true, paidBy: 'manual' as const, lastTxId: 'y', paidDate: '2026-10-10', paidCycleKey: '2026-10' };
    const noKey = { ...feDisney, id: 'nk', isPaid: true, paidBy: 'manual' as const, lastTxId: 'z', paidDate: '2026-10-10' };
    const r = planFixedPeriodReset([keep, future, old, noKey], NOW_NOV1, CAL);
    check('reinicio: ciclo actual se conserva', r.next[0] === keep);
    check('reinicio: ciclo futuro se conserva', r.next[1] === future);
    check('reinicio: ciclo anterior se reinicia', r.next[2].isPaid === false && r.next[2].paidCycleKey === undefined
      && r.next[2].lastTxId === undefined && r.next[2].paidDate === undefined && r.next[2].paidBy === undefined);
    check('reinicio: sin clave se reinicia', r.next[3].isPaid === false && r.next[3].lastTxId === undefined);
    check('reinicio: changed', r.changed === true);
    const r2 = planFixedPeriodReset([keep, feDisney], NOW_NOV1, CAL);
    check('reinicio: sin cambios -> changed false', r2.changed === false && r2.next[0] === keep && r2.next[1] === feDisney);
  }

  // (10) Ranking
  {
    const netflixFe = fixed('nf', 'Netflix', 15.99, 5, { currency: 'USD', category: 'streaming' });
    const luzFe = fixed('luz', 'Luz', 650, 28);
    const rank = rankFixedForTx(smsNov1, [netflixFe, feDisney, luzFe, { ...feDisney, id: 'off', isActive: false }], CAL);
    check('ranking: Disney primero con >= 45', rank[0].expense.id === 'fe_disney' && rank[0].score >= 45, JSON.stringify(rank.map(r => [r.expense.id, r.score])));
    check('ranking: solo activos', rank.length === 3);
    const luzRank = rank.find(r => r.expense.id === 'luz');
    check('ranking: otra moneda puntúa 0', luzRank?.score === 0 && luzRank.reasons[0] === 'otra moneda');
  }

  // (11) Con período de presupuesto el SMS del 1 oct pertenece al período actual aunque el gasto sea del día 30
  {
    const NOW_OCT5 = new Date(2026, 9, 5, 10);
    const feDia30 = fixed('fe30', 'Disney+', 11.49, 30, { currency: 'USD', category: 'streaming' });
    check('SMS 1 oct en el período actual -> coincide', matchFixedExpenses([oct], [feDia30], [oct], NOW_OCT5, { cycle: CAL }).length === 1);
  }
}

// ═════════════ Vínculo con gasto fijo: manual NO fe_tx_ y deshacer lote con fusiones ═════════════
console.log('Fusión gasto fijo: separar y deshacer');
{
  const nowIso = new Date(2026, 10, 12, 10).toISOString();
  const feX = fixed('fe_x', 'Gimnasio', 300, 10, { lastTxId: 'm_gym' });
  const mGym = manual('m_gym', 300, d(2026, 11, 10), 'Gimnasio', { fixedExpenseId: 'fe_x' });
  const sGym = sms('s_gym', 300, d(2026, 11, 11, 8), 'Gimnasio Atlas');

  const mg = mergeManualIntoSms(mGym, sGym, nowIso);
  check('unir manual no fe_tx_: mergedFrom conserva fixedExpenseId', mg.mergedFrom?.fixedExpenseId === 'fe_x' && mg.fixedExpenseId === 'fe_x');
  const sp = splitMerged(mg);
  check('separar manual no fe_tx_: el vínculo vuelve al manual', sp?.manual.fixedExpenseId === 'fe_x' && sp.sms.fixedExpenseId === undefined, JSON.stringify(sp));
  const mgRelinked = { ...mg, fixedExpenseId: 'otro' };
  check('separar: si el SMS se vinculó a otro gasto, no se mueve',
    splitMerged(mgRelinked)?.sms.fixedExpenseId === 'otro' && splitMerged(mgRelinked)?.manual.fixedExpenseId === undefined);
  check('unir manual sin vínculo: mergedFrom sin fixedExpenseId', mergeManualIntoSms(manual('m_z', 300, d(2026, 11, 10), 'x'), sGym, nowIso).mergedFrom?.fixedExpenseId === undefined);

  // planSmsUndo con fixedMerges
  const plan0 = planFixedFusion(mGym, sGym, feX, nowIso, CAL);
  const batch: SmsBatchRecord = {
    id: 'b1', at: new Date(2026, 10, 12, 9).toISOString(), mode: 'auto',
    txIds: ['s_gym'], installmentIds: [],
    fixedMarks: [{ expenseId: 'fe_x', prev: { isPaid: true, paidDate: mGym.date, paidTxId: undefined, paidBy: 'manual', lastTxId: 'm_gym', paidCycleKey: '2026-11' } }],
    fixedMerges: [{ smsId: 's_gym', expenseId: 'fe_x', manual: mGym }],
  };
  const txsAfter = [plan0.merged];
  const u = planSmsUndo(batch, txsAfter, [], [plan0.nextFe], false);
  check('deshacer: el SMS fusionado automáticamente no cuenta como editado', u.removeTxs.length === 1 && u.editedCount === 0, JSON.stringify([u.removeTxs.length, u.editedCount]));
  check('deshacer: vuelve el manual', u.restoreManuals.length === 1 && u.restoreManuals[0].id === 'm_gym');
  check('deshacer: gasto restaurado (lastTxId y ciclo)', u.nextExpenses[0].paidTxId === undefined && u.nextExpenses[0].lastTxId === 'm_gym'
    && u.nextExpenses[0].paidBy === 'manual' && u.nextExpenses[0].paidCycleKey === '2026-11' && u.nextExpenses[0].isPaid === true,
    JSON.stringify(u.nextExpenses[0]));
  check('deshacer: cuenta un gasto revertido', u.revertedFixed === 1);

  // Si el manual ya existe (no se duplica)
  check('deshacer: no duplica un manual existente', planSmsUndo(batch, [plan0.merged, mGym], [], [plan0.nextFe], false).restoreManuals.length === 0);

  // mergedFrom que NO es del lote -> editado
  const other = { ...plan0.merged, mergedFrom: { ...plan0.merged.mergedFrom!, id: 'otro_manual' } };
  const uEd = planSmsUndo(batch, [other], [], [plan0.nextFe], false);
  check('deshacer: mergedFrom distinto al del lote -> editado, se conserva', uEd.removeTxs.length === 0 && uEd.editedCount === 1);

  // Lote viejo (sin fixedMerges): un mergedFrom sigue siendo "editado"
  const oldBatch: SmsBatchRecord = { ...batch, fixedMerges: undefined, fixedMarks: [] };
  const uOld = planSmsUndo(oldBatch, txsAfter, [], [plan0.nextFe], false);
  check('deshacer lote viejo: mergedFrom cuenta como editado', uOld.removeTxs.length === 0 && uOld.editedCount === 1 && uOld.restoreManuals.length === 0);

  // Lote viejo: prev sin lastTxId/paidCycleKey -> esos campos no se tocan
  const oldMark: SmsBatchRecord = {
    id: 'b0', at: batch.at, mode: 'auto', txIds: ['s_pay'], installmentIds: [],
    fixedMarks: [{ expenseId: 'fe_y', prev: { isPaid: false, paidDate: undefined, paidTxId: undefined, paidBy: undefined } as any }],
  };
  const sPay = sms('s_pay', 100, d(2026, 11, 11, 8), 'Tigo', { fixedExpenseId: 'fe_y' });
  const feY = fixed('fe_y', 'Internet', 100, 11, { isPaid: true, paidBy: 'sms', paidTxId: 's_pay', lastTxId: 'keep_me' });
  const uMark = planSmsUndo(oldMark, [sPay], [], [feY], false);
  check('deshacer lote viejo: lastTxId intacto', uMark.nextExpenses[0].lastTxId === 'keep_me' && uMark.nextExpenses[0].isPaid === false);
}

// ═════════════ defaultPaidDate (fecha por defecto al marcar pagado a mano) ═════════════
console.log('defaultPaidDate');
{
  const ymd = (x: Date) => `${x.getFullYear()}-${x.getMonth() + 1}-${x.getDate()}`;
  const hoy10 = new Date(2026, 10, 10, 9, 30); // 10/11/2026
  check('defaultPaidDate: día 1 y hoy 10 nov -> 1 nov', ymd(defaultPaidDate(1, hoy10, CAL)) === '2026-11-1', ymd(defaultPaidDate(1, hoy10, CAL)));
  check('defaultPaidDate: día 15 y hoy 10 nov -> hoy', ymd(defaultPaidDate(15, hoy10, CAL)) === '2026-11-10');
  check('defaultPaidDate: día = hoy -> hoy', ymd(defaultPaidDate(10, hoy10, CAL)) === '2026-11-10');
  const hoy28feb = new Date(2026, 1, 28, 20, 0); // 28/02/2026 (no bisiesto)
  check('defaultPaidDate: día 31 en febrero (28) -> último día', ymd(defaultPaidDate(31, hoy28feb, CAL)) === '2026-2-28');
  const hoy15feb = new Date(2026, 1, 15, 8, 0);
  check('defaultPaidDate: día 31 en febrero y hoy 15 -> hoy', ymd(defaultPaidDate(31, hoy15feb, CAL)) === '2026-2-15');
  check('defaultPaidDate: a las 12:00 locales', defaultPaidDate(1, hoy10, CAL).getHours() === 12);
}

// ═════════════ Período de presupuesto (paymentDay = 27) ═════════════
console.log('Período de presupuesto (paymentDay=27)');
{
  const NOW27 = new Date(2026, 10, 10, 10); // 10/11/2026
  const NOWISO27 = '2026-11-10T16:00:00.000Z';
  const ymdOf = (x: Date) => `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
  const hm = (x: Date) => `${x.getHours()}:${x.getMinutes()}:${x.getSeconds()}.${x.getMilliseconds()}`;

  // 1. Período actual
  const p = periodFor(P27, NOW27);
  check('P27: clave del período de 10 nov', p.key === '2026-10-27', p.key);
  check('P27: inicio 27 oct 00:00', ymdOf(p.start) === '2026-10-27' && hm(p.start) === '0:0:0.0', ymdOf(p.start) + ' ' + hm(p.start));
  check('P27: fin 26 nov 23:59:59.999', ymdOf(p.end) === '2026-11-26' && hm(p.end) === '23:59:59.999', ymdOf(p.end) + ' ' + hm(p.end));

  // 2. Bordes
  check('P27 borde: 27 oct -> 2026-10-27', periodFor(P27, d(2026, 10, 27, 0, 0)).key === '2026-10-27');
  check('P27 borde: 26 oct -> 2026-09-27', periodFor(P27, d(2026, 10, 26, 23, 59)).key === '2026-09-27');
  check('P27 borde: 26 nov 23:59 -> 2026-10-27', periodFor(P27, d(2026, 11, 26, 23, 59)).key === '2026-10-27');
  check('P27 borde: 27 nov 00:00 -> 2026-11-27', periodFor(P27, d(2026, 11, 27, 0, 0)).key === '2026-11-27');
  check('P27 borde: 5 ene 2027 -> 2026-12-27', periodFor(P27, d(2027, 1, 5)).key === '2026-12-27');

  // 3. Febrero y bisiesto
  const P30: FixedCycleConfig = { anchorDay: 30 };
  const P31: FixedCycleConfig = { anchorDay: 31 };
  const f27 = periodFor(P30, d(2027, 2, 27));
  check('P30 feb 2027: 27 feb -> 2027-01-30 y termina el 27 feb', f27.key === '2027-01-30' && ymdOf(f27.end) === '2027-02-27', f27.key + ' ' + ymdOf(f27.end));
  const f28 = periodFor(P30, d(2027, 2, 28));
  check('P30 feb 2027: 28 feb -> 2027-02-28 y termina el 29 mar', f28.key === '2027-02-28' && ymdOf(f28.end) === '2027-03-29', f28.key + ' ' + ymdOf(f28.end));
  check('P31: 31 ene -> 2027-01-31, termina el 27 feb', periodFor(P31, d(2027, 1, 31)).key === '2027-01-31' && ymdOf(periodFor(P31, d(2027, 1, 31)).end) === '2027-02-27');
  check('P31: 28 feb -> 2027-02-28, termina el 30 mar', periodFor(P31, d(2027, 2, 28)).key === '2027-02-28' && ymdOf(periodFor(P31, d(2027, 2, 28)).end) === '2027-03-30');
  check('P31: 31 mar -> 2027-03-31', periodFor(P31, d(2027, 3, 31)).key === '2027-03-31');
  check('P30 bisiesto 2028: 29 feb -> 2028-02-29', periodFor(P30, d(2028, 2, 29)).key === '2028-02-29');

  // 4. Vencimiento dentro del período
  const pOct = periodFor(P27, d(2026, 10, 27));
  const pNov = periodFor(P27, d(2026, 11, 27));
  check('vence: día 28 en 27 oct -> 28 oct', ymdOf(dueDateInPeriod(28, pOct, P27)) === '2026-10-28');
  check('vence: día 1 -> 1 nov', ymdOf(dueDateInPeriod(1, pOct, P27)) === '2026-11-01');
  check('vence: día 31 -> 31 oct', ymdOf(dueDateInPeriod(31, pOct, P27)) === '2026-10-31');
  check('vence: día 27 -> 27 oct', ymdOf(dueDateInPeriod(27, pOct, P27)) === '2026-10-27');
  check('vence: día 26 -> 26 nov', ymdOf(dueDateInPeriod(26, pOct, P27)) === '2026-11-26');
  check('vence: día 28 en período 27 nov -> 28 nov', ymdOf(dueDateInPeriod(28, pNov, P27)) === '2026-11-28');
  check('vence: 12:00 locales', dueDateInPeriod(28, pOct, P27).getHours() === 12);
  const pJan31 = periodFor(P31, d(2027, 1, 31));
  const pFeb28 = periodFor(P31, d(2027, 2, 28));
  check('vence recorte: ancla 31, día 30, período 31 ene–27 feb -> 27 feb', ymdOf(dueDateInPeriod(30, pJan31, P31)) === '2027-02-27', ymdOf(dueDateInPeriod(30, pJan31, P31)));
  check('vence recorte: ancla 31, día 30, período 28 feb–30 mar -> 30 mar', ymdOf(dueDateInPeriod(30, pFeb28, P31)) === '2027-03-30', ymdOf(dueDateInPeriod(30, pFeb28, P31)));

  // 5. Propiedad: un vencimiento por período, dentro del período y estrictamente creciente
  {
    let bad = '';
    for (let anchor = 1; anchor <= 31 && !bad; anchor++) {
      for (let day = 1; day <= 31 && !bad; day++) {
        const cfg: FixedCycleConfig = { anchorDay: anchor };
        let per = periodFor(cfg, new Date(2027, 0, 15, 12));
        let prev = -Infinity;
        for (let i = 0; i < 24; i++) {
          const due = dueDateInPeriod(day, per, cfg);
          const dn = Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
          const lo = Date.UTC(per.start.getFullYear(), per.start.getMonth(), per.start.getDate());
          const hi = Date.UTC(per.end.getFullYear(), per.end.getMonth(), per.end.getDate());
          if (dn < lo || dn > hi) { bad = `fuera del período: ancla ${anchor} día ${day} período ${per.key} vence ${ymdOf(due)}`; break; }
          if (dn <= prev) { bad = `no creciente: ancla ${anchor} día ${day} período ${per.key} vence ${ymdOf(due)}`; break; }
          prev = dn;
          const nxt = periodFor(cfg, new Date(per.end.getFullYear(), per.end.getMonth(), per.end.getDate() + 1, 12));
          if (nxt.key <= per.key) { bad = `período no avanza: ancla ${anchor} ${per.key}`; break; }
          per = nxt;
        }
      }
    }
    check('propiedad: anchor 1..31 × día 1..31 × 24 períodos: dentro del período y estrictamente creciente', bad === '', bad);
  }

  // 6. Spotify día 28: SMS del 28 oct + registro manual del 10 nov = mismo período
  {
    const feSpot = fixed('fe_spot', 'Spotify', 6.49, 28, { currency: 'USD', category: 'streaming', autoRecord: true });
    const sms28 = sms('s-spot', 6.49, d(2026, 10, 28, 8), 'Spotify', { currency: 'USD' });
    const man = manual(feTxId('fe_spot', '2026-10-27'), 6.49, d(2026, 11, 10, 12), 'Spotify', { currency: 'USD', fixedExpenseId: 'fe_spot' });
    const fePaid27: FixedExpense = { ...feSpot, isPaid: true, paidBy: 'manual', lastTxId: man.id, paidCycleKey: '2026-10-27' };
    const f = findFixedFusions([man, sms28], [fePaid27], { cycle: P27 });
    check('Spotify: fusión P27 -> un par automático de 90', f.length === 1 && f[0].auto === true && f[0].score === 90, JSON.stringify(f));
    // Un manual SIN clave en el id (solo fixedExpenseId): su período sale de su fecha. Con mes calendario el 10 nov y el 28 oct
    // son de períodos distintos y están a 13 días (bug anterior); con P27 son el mismo período.
    const manNoKey = manual('m_spot_nokey', 6.49, d(2026, 11, 10, 12), 'Spotify', { currency: 'USD', fixedExpenseId: 'fe_spot' });
    check('Spotify: manual sin clave y mes calendario NO se fusiona (documenta el bug anterior)', findFixedFusions([manNoKey, sms28], [feSpot], { cycle: CAL }).length === 0);
    check('Spotify: manual sin clave y P27 SÍ se fusiona', findFixedFusions([manNoKey, sms28], [feSpot], { cycle: P27 }).length === 1);
    const pl = planFixedFusion(man, sms28, fePaid27, NOWISO27, P27);
    check('Spotify: plan conserva paidCycleKey 2026-10-27 y paga por el SMS', pl.nextFe.paidCycleKey === '2026-10-27' && pl.nextFe.paidTxId === 's-spot' && pl.nextFe.paidBy === 'sms', JSON.stringify(pl.nextFe));
    const mm = matchFixedExpenses([sms28], [feSpot], [sms28], NOW27, { cycle: P27 });
    check('Spotify: SMS 28 oct coincide con el gasto (automática)', mm.length === 1 && mm[0].auto === true, JSON.stringify(mm));
    check('Spotify: con el manual del período en allTxs ya no se considera', matchFixedExpenses([sms28], [feSpot], [sms28, man], NOW27, { cycle: P27 }).length === 0);
    const sms26 = sms('s-spot26', 6.49, d(2026, 10, 26, 8), 'Spotify', { currency: 'USD' });
    check('Spotify: SMS del 26 oct es del período anterior', matchFixedExpenses([sms26], [feSpot], [sms26], NOW27, { cycle: P27 }).length === 0);
    const manOld = manual('fe_tx_fe_spot_2026-10', 6.49, d(2026, 11, 10, 12), 'Spotify', { currency: 'USD', fixedExpenseId: 'fe_spot' });
    const fOld = findFixedFusions([manOld, sms28], [{ ...fePaid27, lastTxId: manOld.id }], { cycle: P27 });
    check('Spotify: manual con id de formato viejo (YYYY-MM) también se fusiona', fOld.length === 1 && fOld[0].auto === true, JSON.stringify(fOld));
    check('matchFixedExpenses: id viejo en allTxs cuenta como pagado del período', matchFixedExpenses([sms28], [feSpot], [sms28, manOld], NOW27, { cycle: P27 }).length === 0);
  }

  // 7. Disney día 1
  {
    const feDis = fixed('fe_disney', 'Disney+', 11.49, 1, { currency: 'USD', category: 'streaming' });
    const dNov1 = sms('d-nov1', 11.49, d(2026, 11, 1, 8), 'Disney Plus', { currency: 'USD' });
    const m = matchFixedExpenses([dNov1], [feDis], [dNov1], NOW27, { cycle: P27 });
    check('Disney día 1 (P27): SMS 1 nov -> una automática', m.length === 1 && m[0].auto === true, JSON.stringify(m));
    check('Disney día 1 (P27): vence el 1 nov', ymdOf(dueDateInPeriod(1, periodFor(P27, NOW27), P27)) === '2026-11-01');
  }

  // 8. Día 31
  {
    const feNet = fixed('fe_net', 'Internet', 299, 31, { category: 'internet' });
    const claro = sms('s-claro', 299, d(2026, 10, 31, 9), 'Claro');
    const m = matchFixedExpenses([claro], [feNet], [claro], NOW27, { cycle: P27 });
    check('Internet día 31 (P27): SMS Claro 31 oct coincide', m.length === 1 && m[0].expenseId === 'fe_net', JSON.stringify(m));
    const info = fixedDueInfo(feNet, P27, NOW27);
    check('Internet día 31 (P27): vence 31 oct y está atrasado si no se pagó', ymdOf(info.due) === '2026-10-31' && info.overdue === true);
    check('Internet día 31 (P27): pagado no está atrasado', fixedDueInfo({ ...feNet, isPaid: true }, P27, NOW27).overdue === false);
    check('Internet día 31 (P27): próximo vencimiento 30 nov', ymdOf(info.nextDue) === '2026-11-30', ymdOf(info.nextDue));
  }

  // 9. Fecha por defecto al marcar pagado
  {
    check('defaultPaidDate P27: día 28 -> 28 oct', ymdOf(defaultPaidDate(28, NOW27, P27)) === '2026-10-28');
    check('defaultPaidDate P27: día 1 -> 1 nov', ymdOf(defaultPaidDate(1, NOW27, P27)) === '2026-11-01');
    check('defaultPaidDate P27: día 31 -> 31 oct', ymdOf(defaultPaidDate(31, NOW27, P27)) === '2026-10-31');
    check('defaultPaidDate P27: día 15 (vence 15 nov, futuro) -> hoy', ymdOf(defaultPaidDate(15, NOW27, P27)) === '2026-11-10');
    check('defaultPaidDate P27: a las 12:00', defaultPaidDate(28, NOW27, P27).getHours() === 12 && defaultPaidDate(15, NOW27, P27).getHours() === 12);
  }

  // 10. Reinicio por período
  {
    const spotPaid = (key: string, extra: Partial<FixedExpense> = {}): FixedExpense => fixed('fe_spot', 'Spotify', 6.49, 28, {
      currency: 'USD', isPaid: true, paidBy: 'manual', lastTxId: 'm', paidDate: '2026-11-10T18:00:00.000Z', paidCycleKey: key, ...extra,
    });
    const a = spotPaid('2026-10-27');
    const r1 = planFixedPeriodReset([a], d(2026, 11, 26, 23, 0), P27);
    check('reinicio P27: 26 nov 23:00 conserva (misma referencia)', r1.next[0] === a && r1.changed === false);
    const r2 = planFixedPeriodReset([a], d(2026, 11, 27, 9, 0), P27);
    check('reinicio P27: 27 nov 09:00 reinicia', r2.changed === true && r2.next[0].isPaid === false && r2.next[0].paidCycleKey === undefined && r2.next[0].lastTxId === undefined);
    const r2b = planFixedPeriodReset(r2.next, d(2026, 11, 27, 9, 0), P27);
    check('reinicio P27: idempotente (2ª corrida sin cambios)', r2b.changed === false && r2b.next[0] === r2.next[0]);
    const old = spotPaid('2026-10');
    check('reinicio P27: clave vieja 2026-10 con día 28 conserva el 10 nov', planFixedPeriodReset([old], NOW27, P27).next[0] === old);
    check('reinicio P27: clave vieja 2026-10 con día 28 reinicia el 27 nov', planFixedPeriodReset([old], d(2026, 11, 27, 9, 0), P27).next[0].isPaid === false);
    const dis = fixed('fe_disney', 'Disney+', 11.49, 1, { currency: 'USD', isPaid: true, paidBy: 'sms', paidTxId: 'x', paidCycleKey: '2026-11' });
    check('reinicio P27: clave vieja 2026-11 con día 1 conserva el 10 nov', planFixedPeriodReset([dis], NOW27, P27).next[0] === dis);
    const noKey = spotPaid('', { paidCycleKey: undefined, paidDate: '2026-11-02' });
    check('reinicio P27: sin clave y paidDate 2 nov conserva el 10 nov', planFixedPeriodReset([noKey], NOW27, P27).next[0] === noKey);
  }

  // 11. Cambio de paymentDay
  {
    const P5: FixedCycleConfig = { anchorDay: 5 };
    const spot = fixed('fe_spot', 'Spotify', 6.49, 28, { currency: 'USD', isPaid: true, paidBy: 'manual', lastTxId: 'm', paidCycleKey: '2026-10-27' });
    check('cambio 27->5: Spotify pagado en 2026-10-27 se reinicia el 10 nov', planFixedPeriodReset([spot], NOW27, P5).next[0].isPaid === false);
    const dia10 = fixed('fe_d10', 'Gym', 100, 10, { isPaid: true, paidBy: 'manual', lastTxId: 'm', paidCycleKey: '2026-10-27' });
    check('cambio 27->5: gasto día 10 pagado en 2026-10-27 se conserva', planFixedPeriodReset([dia10], NOW27, P5).next[0] === dia10);
    check('cambio 5->27: clave 2026-11-05 con día 28 -> 2026-11-27', normalizeCycleKey('2026-11-05', 28, P27) === '2026-11-27', String(normalizeCycleKey('2026-11-05', 28, P27)));
    check('normalizeCycleKey: clave vigente se devuelve igual', normalizeCycleKey('2026-10-27', 28, P27) === '2026-10-27');
    check('normalizeCycleKey: formato viejo 2026-10 con día 28 -> 2026-10-27', normalizeCycleKey('2026-10', 28, P27) === '2026-10-27');
    check('normalizeCycleKey: formato inválido -> null', normalizeCycleKey('', 28, P27) === null && normalizeCycleKey('abc', 28, P27) === null);
  }

  // 12. Ids con clave de período
  check('ids: fixedIdFromFeTxId con YYYY-MM-DD', fixedIdFromFeTxId('fe_tx_fe_1731_2026-10-27') === 'fe_1731');
  check('ids: cycleKeyFromFeTxId con YYYY-MM-DD', cycleKeyFromFeTxId('fe_tx_fe_1731_2026-10-27') === '2026-10-27');
  check('ids: con sufijo numérico', fixedIdFromFeTxId('fe_tx_fe_1731_2026-10-27_1731999') === 'fe_1731'
    && cycleKeyFromFeTxId('fe_tx_fe_1731_2026-10-27_1731999') === '2026-10-27');
  check('ids: feTxId con clave de período', feTxId('fe_1731', '2026-10-27') === 'fe_tx_fe_1731_2026-10-27');

  // 13. Recordatorios
  {
    const spotPaid = fixed('fe_spot', 'Spotify', 6.49, 28, { currency: 'USD', isPaid: true, paidBy: 'manual', paidCycleKey: '2026-10-27' });
    const r1 = nextFixedReminder(spotPaid, P27, NOW27);
    check('recordatorio: Spotify pagado -> 25 nov 09:00 (payDay 28)', r1 !== null && ymdOf(r1.date) === '2026-11-25' && r1.date.getHours() === 9 && r1.payDay === 28, JSON.stringify(r1));
    const spotDue = fixed('fe_spot', 'Spotify', 6.49, 28, { currency: 'USD' });
    const r2 = nextFixedReminder(spotDue, P27, d(2026, 10, 27, 10, 0));
    check('recordatorio: Spotify impago el 27 oct -> 25 nov (el 25 oct ya pasó)', r2 !== null && ymdOf(r2.date) === '2026-11-25' && r2.payDay === 28, JSON.stringify(r2));
    const dis = fixed('fe_disney', 'Disney+', 11.49, 1, { currency: 'USD' });
    const r3 = nextFixedReminder(dis, P27, NOW27);
    check('recordatorio: Disney impago el 10 nov -> 28 nov 09:00 (vence 1 dic)', r3 !== null && ymdOf(r3.date) === '2026-11-28' && r3.date.getHours() === 9 && r3.payDay === 1, JSON.stringify(r3));
  }

  // 14. Configuración desde los ajustes
  {
    check('config: mensual 27 -> 27', fixedCycleConfig({ paymentCycle: 'monthly', paymentDay: 27, paymentDays: [15, 30] }).anchorDay === 27);
    check('config: quincenal [30,15] -> 15', fixedCycleConfig({ paymentCycle: 'biweekly', paymentDay: 27, paymentDays: [30, 15] }).anchorDay === 15);
    check('config: semanal -> 1', fixedCycleConfig({ paymentCycle: 'weekly', paymentDay: 3, paymentDays: [15, 30] }).anchorDay === 1);
    check('config: irregular -> 1', fixedCycleConfig({ paymentCycle: 'irregular', paymentDay: 27, paymentDays: [15, 30] }).anchorDay === 1);
    check('config: paymentDay NaN -> 1', fixedCycleConfig({ paymentCycle: 'monthly', paymentDay: NaN, paymentDays: [15, 30] }).anchorDay === 1);
    check('config: paymentDay 40 -> 31', fixedCycleConfig({ paymentCycle: 'monthly', paymentDay: 40, paymentDays: [15, 30] }).anchorDay === 31);
  }
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
