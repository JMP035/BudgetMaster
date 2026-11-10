process.env.TZ = 'America/Guatemala';
// Pruebas de pares de transferencia entre cuentas propias (services/TransferPairs.ts). Sin dependencias:
//   npm run test:sms-transfers   →   sucrase-node scripts/sms-transfers.test.ts

import {
  applyTransferPair, clearPairIdOfPartner, findTransferPairs, revertTransferPair, transferPairKey,
} from '../services/TransferPairs';
import type { Account, Transaction } from '../services/storage';

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

function outTx(id: string, amount: number, date: Date, bank: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, amount, description: `${bank} · Transferencia enviada`, category: 'transfer', date: date.toISOString(),
    type: 'expense', source: 'sms', currency: 'Q', bank, smsFingerprint: `fp-${id}`, originalSMS: `${bank}: Transferencia enviada`,
    ...extra,
  };
}

function inTx(id: string, amount: number, date: Date, bank: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, amount, description: `${bank} · Transferencia recibida`, category: 'transfer_in', date: date.toISOString(),
    type: 'income', source: 'sms', currency: 'Q', bank, smsFingerprint: `fp-${id}`, originalSMS: `${bank}: Transferencia recibida`,
    ...extra,
  };
}

function acct(id: string, bank: string, links: string[], extra: Partial<Account> = {}): Account {
  return {
    id, name: id, type: 'bank', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'card',
    bankName: bank, isActive: true, createdAt: '2026-01-01T00:00:00.000Z', smsLinks: links, ...extra,
  };
}

const none = new Set<string>();
const T0 = d(2026, 10, 10, 14, 0);
const plusMin = (base: Date, min: number) => new Date(base.getTime() + min * 60000);

// ═════════════ Detección ═════════════
console.log('findTransferPairs');

{
  // Caso base: BAC monetaria -> G&T, 5 minutos después.
  const o = outTx('o1', 500, T0, 'BAC');
  const i = inTx('i1', 500, plusMin(T0, 5), 'GYT');
  const r = findTransferPairs([o, i], none);
  check('par básico: uno', r.length === 1, JSON.stringify(r));
  check('par básico: ids', r[0]?.outId === 'o1' && r[0]?.inId === 'i1');
  check('par básico: puntaje en rango y alto', r[0] !== undefined && r[0].score >= 80 && r[0].score <= 100, String(r[0]?.score));
  check('par básico: sin cuenta reconocida no es auto', r[0]?.auto === false);
  check('par básico: reasons informativos', (r[0]?.reasons.length ?? 0) >= 2 && !r[0].reasons.some(x => x.includes('ambiguo')));
  check('par básico: entrada antes que la salida también', findTransferPairs([o, inTx('i1', 500, plusMin(T0, -5), 'GYT')], none).length === 1);
}

{
  // Cercanía: más cerca puntúa más.
  const o = outTx('o1', 500, T0, 'BAC');
  const near = findTransferPairs([o, inTx('i1', 500, plusMin(T0, 10), 'GYT')], none)[0];
  const mid = findTransferPairs([o, inTx('i1', 500, plusMin(T0, 90), 'GYT')], none)[0];
  const far = findTransferPairs([o, inTx('i1', 500, plusMin(T0, 60 * 30), 'GYT')], none)[0];
  check('cercanía: 10 min > 90 min > 30 h', near && mid && far && near.score > mid.score && mid.score > far.score,
    `${near?.score} ${mid?.score} ${far?.score}`);
  check('ventana: 35 h todavía empareja', findTransferPairs([o, inTx('i1', 500, plusMin(T0, 60 * 35), 'GYT')], none).length === 1);
  check('ventana: 37 h no empareja', findTransferPairs([o, inTx('i1', 500, plusMin(T0, 60 * 37), 'GYT')], none).length === 0);
}

{
  const o = outTx('o1', 500, T0, 'BAC');
  check('3 días de diferencia: nada', findTransferPairs([o, inTx('i1', 500, plusMin(T0, 60 * 24 * 3), 'GYT')], none).length === 0);
  check('monto distinto: nada', findTransferPairs([o, inTx('i1', 501, plusMin(T0, 5), 'GYT')], none).length === 0);
  check('monto con diferencia de 0.004: sí', findTransferPairs([o, inTx('i1', 500.004, plusMin(T0, 5), 'GYT')], none).length === 1);
  check('monto con diferencia de 0.01: no', findTransferPairs([o, inTx('i1', 500.01, plusMin(T0, 5), 'GYT')], none).length === 0);
  check('moneda distinta (USD vs Q): nada', findTransferPairs([o, inTx('i1', 500, plusMin(T0, 5), 'GYT', { currency: 'USD' })], none).length === 0);
  check('mismo banco: nada', findTransferPairs([o, inTx('i1', 500, plusMin(T0, 5), 'BAC')], none).length === 0);
  check('mismo banco con distinta capitalización: nada', findTransferPairs([o, inTx('i1', 500, plusMin(T0, 5), 'bac')], none).length === 0);
  check('sin banco en un lado: nada', findTransferPairs([o, inTx('i1', 500, plusMin(T0, 5), 'GYT', { bank: undefined })], none).length === 0);
  check('movimiento manual: nada', findTransferPairs([o, inTx('i1', 500, plusMin(T0, 5), 'GYT', { source: 'manual' })], none).length === 0);
  check('ya emparejado (transferPairId): nada',
    findTransferPairs([o, inTx('i1', 500, plusMin(T0, 5), 'GYT', { transferPairId: 'tp_x' })], none).length === 0);
  check('categoría equivocada en la entrada: nada', findTransferPairs([o, inTx('i1', 500, plusMin(T0, 5), 'GYT', { category: 'salary' })], none).length === 0);
  check('dos salidas (sin entrada): nada', findTransferPairs([o, outTx('o2', 500, plusMin(T0, 5), 'GYT')], none).length === 0);
  check('lista vacía: nada', findTransferPairs([], none).length === 0);
}

{
  // Par ignorado.
  const o = outTx('o1', 500, T0, 'BAC');
  const i = inTx('i1', 500, plusMin(T0, 5), 'GYT');
  check('par ignorado: nada', findTransferPairs([o, i], new Set([transferPairKey('o1', 'i1')])).length === 0);
  check('ignorar otro par no afecta', findTransferPairs([o, i], new Set([transferPairKey('o1', 'zzz')])).length === 1);
  check('clave con prefijo tp|', transferPairKey('a', 'b') === 'tp|a|b');
}

{
  // Comisión bancaria: no se empareja.
  const fee = outTx('f1', 5, T0, 'BANRURAL', { category: 'bank_fees', originalSMS: 'BANRURAL: Cobro de comision por transferencia Q.5.00 cuenta ****5678' });
  const dep = inTx('i1', 5, plusMin(T0, 5), 'GYT');
  check('comisión BANRURAL Q5 no se empareja', findTransferPairs([fee, dep], none).length === 0);
}

{
  // Ambigüedad: una salida, dos entradas posibles.
  const o = outTx('o1', 500, T0, 'BAC');
  const i1 = inTx('i1', 500, plusMin(T0, 5), 'GYT');
  const i2 = inTx('i2', 500, plusMin(T0, 120), 'BI');
  const r = findTransferPairs([o, i1, i2], none);
  check('ambiguo (2 entradas): se propone un solo par', r.length === 1, JSON.stringify(r));
  check('ambiguo: el más cercano gana', r[0]?.inId === 'i1');
  check('ambiguo: reasons incluye "ambiguo" y auto false', !!r[0]?.reasons.some(x => x.includes('ambiguo')) && r[0].auto === false);
  const clean = findTransferPairs([o, i1], none)[0];
  check('ambiguo: puntaje menor que el par limpio', r[0] !== undefined && clean !== undefined && r[0].score < clean.score);

  // Al revés: dos salidas, una entrada.
  const o2 = outTx('o2', 500, plusMin(T0, 60), 'BI');
  const r2 = findTransferPairs([o, o2, i1], none);
  check('ambiguo (2 salidas): un par con auto false', r2.length === 1 && r2[0].auto === false && r2[0].reasons.some(x => x.includes('ambiguo')));

  // Descartar el par candidato quita la ambigüedad del otro.
  const r3 = findTransferPairs([o, i1, i2], new Set([transferPairKey('o1', 'i2')]));
  check('descartar la alternativa: queda limpio', r3.length === 1 && r3[0].inId === 'i1' && !r3[0].reasons.some(x => x.includes('ambiguo')));
}

{
  // Un movimiento en un solo par: dos pares independientes por monto.
  const txs = [
    outTx('o1', 500, T0, 'BAC'), inTx('i1', 500, plusMin(T0, 3), 'GYT'),
    outTx('o2', 1200, plusMin(T0, 10), 'BAC'), inTx('i2', 1200, plusMin(T0, 13), 'GYT'),
  ];
  const r = findTransferPairs(txs, none);
  check('dos pares independientes', r.length === 2 && r.some(p => p.outId === 'o1' && p.inId === 'i1') && r.some(p => p.outId === 'o2' && p.inId === 'i2'));
  const used = r.flatMap(p => [p.outId, p.inId]);
  check('cada movimiento en un solo par', new Set(used).size === used.length);
}

{
  // auto: destino reconocido por smsLinks.
  const o = outTx('o1', 500, T0, 'BAC', { originalSMS: 'BAC: Transferencia enviada por Q500.00 a cuenta ***5678' });
  const i = inTx('i1', 500, plusMin(T0, 5), 'GYT');
  const accounts = [acct('gyt1', 'G&T', ['GYT|acct:5678'])];
  const r = findTransferPairs([o, i], none, { accounts });
  check('cuenta destino reconocida: auto true', r.length === 1 && r[0].auto === true, JSON.stringify(r));
  check('cuenta destino reconocida: puntaje mayor que sin cuenta',
    r[0] !== undefined && r[0].score > findTransferPairs([o, i], none)[0].score);
  check('cuenta destino reconocida: reasons lo dice', !!r[0]?.reasons.some(x => x.includes('cuenta tuya')));
  check('sin opts.accounts: auto false', findTransferPairs([o, i], none)[0].auto === false);
  check('cuenta de otra terminación: auto false',
    findTransferPairs([o, i], none, { accounts: [acct('gyt1', 'G&T', ['GYT|acct:9999'])] })[0].auto === false);
  check('cuenta inactiva: auto false',
    findTransferPairs([o, i], none, { accounts: [acct('gyt1', 'G&T', ['GYT|acct:5678'], { isActive: false })] })[0].auto === false);
  check('cuenta de otro banco con la misma terminación: auto false',
    findTransferPairs([o, i], none, { accounts: [acct('bi1', 'BI', ['BI|acct:5678'])] })[0].auto === false);
  check('salida sin texto de cuenta: auto false',
    findTransferPairs([outTx('o1', 500, T0, 'BAC'), i], none, { accounts: accounts })[0].auto === false);
  check('ambigua con cuenta reconocida: auto false',
    findTransferPairs([o, i, inTx('i2', 500, plusMin(T0, 60), 'BI')], none, { accounts })[0].auto === false);

  // Tarjeta (card) también cuenta como señal.
  const oCard = outTx('o3', 700, T0, 'BAC', { originalSMS: 'BAC: Transferencia de Q700.00 a tarjeta ****4321' });
  const iCard = inTx('i3', 700, plusMin(T0, 2), 'BI');
  check('señal card reconocida: auto true',
    findTransferPairs([oCard, iCard], none, { accounts: [acct('bi1', 'BI', ['BI|card:4321'])] })[0]?.auto === true);
}

{
  // onlyIds: solo pares donde alguno esté en el conjunto.
  const txs = [
    outTx('o1', 500, T0, 'BAC'), inTx('i1', 500, plusMin(T0, 3), 'GYT'),
    outTx('o2', 1200, plusMin(T0, 10), 'BAC'), inTx('i2', 1200, plusMin(T0, 13), 'GYT'),
  ];
  const byOut = findTransferPairs(txs, none, { onlyIds: new Set(['o2']) });
  check('onlyIds (salida): solo su par', byOut.length === 1 && byOut[0].outId === 'o2');
  const byIn = findTransferPairs(txs, none, { onlyIds: new Set(['i1']) });
  check('onlyIds (entrada): solo su par', byIn.length === 1 && byIn[0].inId === 'i1');
  check('onlyIds vacío: nada', findTransferPairs(txs, none, { onlyIds: new Set() }).length === 0);
  check('onlyIds con id ajeno: nada', findTransferPairs(txs, none, { onlyIds: new Set(['zzz']) }).length === 0);
  check('onlyIds con ambos ids: un solo par', findTransferPairs(txs, none, { onlyIds: new Set(['o1', 'i1']) }).length === 1);
  // La ambigüedad considera también movimientos fuera del conjunto.
  const amb = findTransferPairs(
    [outTx('o1', 500, T0, 'BAC'), inTx('i1', 500, plusMin(T0, 3), 'GYT'), outTx('o9', 500, plusMin(T0, 20), 'BI')],
    none, { onlyIds: new Set(['i1']) },
  );
  check('onlyIds: ambigüedad cuenta contrapartes fuera del conjunto', amb.length === 1 && amb[0].reasons.some(x => x.includes('ambiguo')));
}

// ═════════════ Aplicar / revertir (parte pura de linkTransferPair / unlinkTransferPair) ═════════════
console.log('applyTransferPair / revertTransferPair');
{
  const o = outTx('o1', 500, T0, 'BAC');
  const i = inTx('i1', 500, plusMin(T0, 5), 'GYT');
  const fee = outTx('f1', 5, T0, 'BAC', { category: 'bank_fees' });
  const orig = [o, fee, i];
  const snapshot = JSON.stringify(orig);

  const linked = applyTransferPair(orig, 'o1', 'i1');
  const lo = linked.find(t => t.id === 'o1');
  const li = linked.find(t => t.id === 'i1');
  check('aplicar: ambos type transfer y category transfer',
    lo?.type === 'transfer' && lo.category === 'transfer' && li?.type === 'transfer' && li.category === 'transfer');
  check('aplicar: transferPairId compartido y estable', lo?.transferPairId === 'tp_o1' && li?.transferPairId === 'tp_o1');
  check('aplicar: guarda transferPrev', lo?.transferPrev?.type === 'expense' && lo.transferPrev.category === 'transfer'
    && li?.transferPrev?.type === 'income' && li.transferPrev.category === 'transfer_in');
  check('aplicar: conserva monto, fecha y banco', lo?.amount === 500 && lo.date === o.date && li?.bank === 'GYT');
  check('aplicar: no toca la comisión', JSON.stringify(linked.find(t => t.id === 'f1')) === JSON.stringify(fee));
  check('aplicar: no muta la entrada', JSON.stringify(orig) === snapshot);
  check('aplicar: mismo orden y cantidad', linked.map(t => t.id).join() === 'o1,f1,i1');

  check('ya emparejados no se vuelven a emparejar', applyTransferPair(linked, 'o1', 'i1') === linked);
  check('id inexistente: sin cambios', applyTransferPair(orig, 'o1', 'nope') === orig && applyTransferPair(orig, 'nope', 'i1') === orig);
  check('mismo id: sin cambios', applyTransferPair(orig, 'o1', 'o1') === orig);
  check('ya neutros no se vuelven a proponer', findTransferPairs(linked, none).length === 0);

  // Revertir desde cualquiera de las dos mitades.
  const backFromOut = revertTransferPair(linked, 'o1');
  const backFromIn = revertTransferPair(linked, 'i1');
  check('revertir (desde la salida): vuelve a como estaba', JSON.stringify(backFromOut) === snapshot, JSON.stringify(backFromOut));
  check('revertir (desde la entrada): vuelve a como estaba', JSON.stringify(backFromIn) === snapshot);
  check('revertir: quita transferPairId y transferPrev',
    backFromOut.every(t => t.transferPairId === undefined && t.transferPrev === undefined));
  check('revertir movimiento sin par: sin cambios', revertTransferPair(orig, 'o1') === orig && revertTransferPair(orig, 'nope') === orig);
  check('tras revertir se puede detectar de nuevo', findTransferPairs(backFromOut, none).length === 1);

  // Borrar una mitad: la otra queda neutra pero sin transferPairId.
  const afterDelete = clearPairIdOfPartner(linked.filter(t => t.id !== 'o1'), 'tp_o1');
  const survivor = afterDelete.find(t => t.id === 'i1');
  check('borrar una mitad: la otra sigue neutra', survivor?.type === 'transfer' && survivor.category === 'transfer');
  check('borrar una mitad: la otra pierde transferPairId', survivor?.transferPairId === undefined);
  check('borrar una mitad: no toca otros movimientos', JSON.stringify(afterDelete.find(t => t.id === 'f1')) === JSON.stringify(fee));
  const reverted = revertTransferPair(afterDelete, 'i1');
  check('mitad huérfana aún se puede revertir', reverted.find(t => t.id === 'i1')?.type === 'income'
    && reverted.find(t => t.id === 'i1')?.category === 'transfer_in');

  // Una entrada que ya era 'transfer' (p. ej. pago de tarjeta) conserva su transferPrev.
  const card = outTx('c1', 300, T0, 'BAC', { type: 'transfer', category: 'transfer' });
  const lk = applyTransferPair([card, inTx('i4', 300, plusMin(T0, 1), 'BI')], 'c1', 'i4');
  check('transferPrev conserva type previo', lk[0].transferPrev?.type === 'transfer');
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
