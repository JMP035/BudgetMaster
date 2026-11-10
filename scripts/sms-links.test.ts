process.env.TZ = 'America/Guatemala';
// Pruebas del vínculo SMS <-> cuentas (services/AccountLinking.ts). Sin dependencias:
//   npm run test:sms-links   →   sucrase-node scripts/sms-links.test.ts

import {
  assignAccountsToTransactions, collectLinkSeen, computeDesiredEffect, cycleSpentForCard,
  extractSmsLinkSignals, groupUnassigned, isPendingUnassigned, linkKeyLabel, matchAccountForSms, reconcileBalanceEffects,
} from '../services/AccountLinking';
import type { Account, Transaction } from '../services/storage';

// El corpus calcula sus receivedAt al cargarse: debe cargarse DESPUÉS de fijar TZ.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const corpusMod = require('./sms-corpus') as typeof import('./sms-corpus');
const { R1_BODY } = corpusMod;
const corpusBody = (id: string): string => {
  const c = corpusMod.SMS_CORPUS.find(x => x.id === id);
  if (!c) throw new Error('caso no encontrado: ' + id);
  return c.body;
};

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const keys = (body: string, bank?: string): string[] => extractSmsLinkSignals(body, bank).map(s => s.key);

function acc(id: string, links: string[], extra: Partial<Account> = {}): Account {
  return {
    id, name: id, type: 'credit', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'card',
    isActive: true, createdAt: '2026-01-01T00:00:00.000Z', smsLinks: links, ...extra,
  };
}

function tx(id: string, body: string | undefined, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, amount: 100, description: id, category: 'other', date: '2026-10-04T20:54:00.000Z', type: 'expense',
    source: 'sms', currency: 'Q', originalSMS: body, bank: 'BAC', ...extra,
  };
}

// ─────────────────────────────────────────────────────────────
// (a) señales
// ─────────────────────────────────────────────────────────────
{
  const r1 = keys(R1_BODY);
  check('R1 trae BAC|prod:BAC VISA', r1.includes('BAC|prod:BAC VISA'), r1.join(','));
  check('R1 no trae card', !r1.some(k => k.includes('|card:')), r1.join(','));
  check('R1 termina en BAC|bank', r1[r1.length - 1] === 'BAC|bank', r1.join(','));
  check('R1 prod antes que bank', r1.indexOf('BAC|prod:BAC VISA') < r1.indexOf('BAC|bank'));

  const gp = keys('Hola, su tarjeta BAC Credomatic **5031 ha sido activada en el servicio GOOGLE PAY');
  check('GOOGLE PAY → BAC|card:5031', gp[0] === 'BAC|card:5031', gp.join(','));

  const lim = keys('Alcanzaste el 100% del limite de tu tarjeta BAC 5031');
  check('límite 100% → card:5031', lim.includes('BAC|card:5031'), lim.join(','));

  const s14 = keys(corpusBody('S14'));
  check('S14 → BANRURAL|acctpre:3012', s14[0] === 'BANRURAL|acctpre:3012', s14.join(','));
  check('S14 no inventa card ni acct', !s14.some(k => k.includes('|card:') || k.includes('|acct:')), s14.join(','));

  const s12 = keys(corpusBody('S12'));
  check('S12 → BANRURAL|acct:5678', s12[0] === 'BANRURAL|acct:5678', s12.join(','));
  check('S12 no es tarjeta', !s12.some(k => k.includes('|card:')), s12.join(','));

  const gyt = keys('G&T Continental: Se realizo un consumo por Q.150.00 con la tarjeta de debito de la cuenta 01-234567-8 en SUPER 24');
  check('G&T → GYT|acct:5678', gyt.includes('GYT|acct:5678'), gyt.join(','));
  check('G&T → GYT|kind:debit', gyt.includes('GYT|kind:debit'), gyt.join(','));
  check('G&T acct antes que kind', gyt.indexOf('GYT|acct:5678') < gyt.indexOf('GYT|kind:debit'));

  const s24 = keys(corpusBody('S24'));
  check('S24 abono tarjeta crédito → BAC|card:1234 + kind:credit', s24[0] === 'BAC|card:1234' && s24.includes('BAC|kind:credit'), s24.join(','));

  const forced = keys('Compra aprobada por Q 10.00', 'BI');
  check('bank explícito manda', forced.join(',') === 'BI|bank', forced.join(','));
  check('banco desconocido no emite comodín', keys('Compra por Q 10.00').length === 0, keys('Compra por Q 10.00').join(','));
  check('cuerpo vacío no revienta', extractSmsLinkSignals('').length === 0);
}

// ─────────────────────────────────────────────────────────────
// (b) etiquetas
// ─────────────────────────────────────────────────────────────
check('label card', linkKeyLabel('BAC|card:5031') === 'BAC · tarjeta *5031', linkKeyLabel('BAC|card:5031'));
check('label prod', linkKeyLabel('BAC|prod:BAC VISA') === 'BAC · BAC VISA', linkKeyLabel('BAC|prod:BAC VISA'));
check('label acct', linkKeyLabel('BANRURAL|acct:5678') === 'BANRURAL · cuenta *5678');
check('label acctpre', linkKeyLabel('BANRURAL|acctpre:3012') === 'BANRURAL · cuenta 3012XXXX');
check('label kind', linkKeyLabel('BI|kind:debit') === 'BI · tarjeta de débito');
check('label bank', linkKeyLabel('BAC|bank') === 'BAC · todos los movimientos');
check('label rara = clave', linkKeyLabel('xyz') === 'xyz');

// ─────────────────────────────────────────────────────────────
// (c) match
// ─────────────────────────────────────────────────────────────
{
  const sigR1 = extractSmsLinkSignals(R1_BODY);
  const a1 = acc('c1', ['BAC|prod:BAC VISA']);
  const a2 = acc('c2', ['BAC|prod:BAC VISA']);
  const m1 = matchAccountForSms(sigR1, [a1]);
  check('una cuenta con prod → se asigna', m1.accountId === 'c1' && m1.signal?.key === 'BAC|prod:BAC VISA');

  const mAmb = matchAccountForSms(sigR1, [a1, a2]);
  check('dos cuentas con el mismo prod → null', mAmb.accountId === null);
  check('dos cuentas con el mismo prod → 2 en ambiguous', mAmb.ambiguous.length === 2, mAmb.ambiguous.join(','));

  const mInactive = matchAccountForSms(sigR1, [a1, acc('c3', ['BAC|prod:BAC VISA'], { isActive: false })]);
  check('cuenta inactiva se ignora', mInactive.accountId === 'c1');

  const mNone = matchAccountForSms(sigR1, [acc('z', ['BAC|prod:BAC MASTERCARD'])]);
  check('sin coincidencias → null y sin ambiguos', mNone.accountId === null && mNone.ambiguous.length === 0);
  check('sin coincidencias → signal = la más específica', mNone.signal?.key === 'BAC|prod:BAC VISA');

  // Exclusión: SMS con *5031, cuenta con card:2710 + prod:BAC VISA
  const sigCard = extractSmsLinkSignals('PRF protege tu BAC VISA: compra Aprobada por Q 50.00 en TIENDA tarjeta BAC **5031');
  check('señales: card y prod', sigCard[0].key === 'BAC|card:5031' && sigCard.some(s => s.key === 'BAC|prod:BAC VISA'), sigCard.map(s => s.key).join(','));
  const other = acc('otra', ['BAC|card:2710', 'BAC|prod:BAC VISA']);
  check('exclusión: card:2710 y SMS *5031 no se asigna por prod', matchAccountForSms(sigCard, [other]).accountId === null);
  const exact = acc('exacta', ['BAC|card:5031']);
  check('exclusión: la cuenta con card:5031 gana', matchAccountForSms(sigCard, [other, exact]).accountId === 'exacta');
  const generic = acc('generica', ['BAC|prod:BAC VISA']);
  check('exclusión: sin terminación baja a prod', matchAccountForSms(sigCard, [other, generic]).accountId === 'generica');
  check('sin terminación en el SMS, la cuenta con card:2710 + prod sí coincide por prod', matchAccountForSms(sigR1, [other]).accountId === 'otra');

  // Otro banco no se excluye
  const bi = acc('bi', ['BI|card:9999', 'BAC|prod:BAC VISA']);
  check('terminación de otro banco no excluye', matchAccountForSms(sigCard, [bi]).accountId === 'bi');

  // Cuenta bancaria Banrural por acctpre / acct
  const s14sig = extractSmsLinkSignals(corpusBody('S14'));
  check('S14 con cuenta acctpre:3012', matchAccountForSms(s14sig, [acc('br', ['BANRURAL|acctpre:3012'], { type: 'bank' })]).accountId === 'br');
  const s12sig = extractSmsLinkSignals(corpusBody('S12'));
  check('S12 con cuenta acct:5678', matchAccountForSms(s12sig, [acc('br', ['BANRURAL|acct:5678'], { type: 'bank' })]).accountId === 'br');
  check('comodín de banco', matchAccountForSms(s12sig, [acc('b', ['BANRURAL|bank'], { type: 'bank' })]).accountId === 'b');
  check('lista de señales vacía', matchAccountForSms([], [a1]).accountId === null);
}

// ─────────────────────────────────────────────────────────────
// (d) assignAccountsToTransactions
// ─────────────────────────────────────────────────────────────
{
  const accounts = [acc('c1', ['BAC|prod:BAC VISA'])];
  const txs: Transaction[] = [
    tx('t1', R1_BODY),
    tx('t2', R1_BODY, { accountSource: 'user' }),                       // sin cuenta pero del usuario: no se toca
    tx('t3', R1_BODY, { accountId: 'x', accountSource: 'user' }),
    tx('t4', undefined, { source: 'manual', bank: undefined }),
    tx('t5', 'Compra por Q 10.00 en SITIO'),                           // sin señales
  ];
  const r1 = assignAccountsToTransactions(txs, accounts);
  check('asigna t1', r1.txs[0].accountId === 'c1' && r1.txs[0].accountSource === 'rule', JSON.stringify(r1.txs[0]));
  check('t1 recibe smsAccountHint', r1.txs[0].smsAccountHint === 'BAC|prod:BAC VISA');
  check('assigned = 1', r1.assigned === 1, String(r1.assigned));
  check('t2 (user) intacto: misma referencia', r1.txs[1] === txs[1]);
  check('t3 (user) conserva su cuenta', r1.txs[2].accountId === 'x' && r1.txs[2] === txs[2]);
  check('manual intacto', r1.txs[3] === txs[3]);
  check('t5 sin cuenta cuenta como unassigned', r1.unassigned === 1, String(r1.unassigned));
  check('no muta la entrada', txs[0].accountId === undefined && txs[0].smsAccountHint === undefined);

  const r2 = assignAccountsToTransactions(r1.txs, accounts);
  check('idempotente: misma referencia en la 2ª corrida', r2.txs === r1.txs);
  check('idempotente: assigned = 0', r2.assigned === 0);

  // Sin cuentas: solo calcula hint; segunda corrida estable
  const r0 = assignAccountsToTransactions([tx('a', R1_BODY)], []);
  check('sin cuentas calcula hint', r0.txs[0].smsAccountHint === 'BAC|prod:BAC VISA' && !r0.txs[0].accountId);
  const r0b = assignAccountsToTransactions(r0.txs, []);
  check('sin cuentas: idempotente', r0b.txs === r0.txs);
  const rEmpty = assignAccountsToTransactions([], accounts);
  check('lista vacía: misma referencia', rEmpty.txs.length === 0);

  // Ambigüedad
  const amb = assignAccountsToTransactions([tx('a', R1_BODY)], [acc('c1', ['BAC|prod:BAC VISA']), acc('c2', ['BAC|prod:BAC VISA'])]);
  check('ambigua: sin cuenta', !amb.txs[0].accountId && amb.ambiguous === 1 && amb.assigned === 0, JSON.stringify(amb));

  // Regla que ya no aplica: quita solo si fue 'rule'
  const stale = assignAccountsToTransactions(r1.txs, [acc('c1', ['BAC|prod:BAC MASTERCARD'])]);
  check('regla caducada quita accountId de t1', !stale.txs[0].accountId && !stale.txs[0].accountSource, JSON.stringify(stale.txs[0]));
  check('regla caducada conserva t3 (user)', stale.txs[2].accountId === 'x');
  const stale2 = assignAccountsToTransactions(stale.txs, [acc('c1', ['BAC|prod:BAC MASTERCARD'])]);
  check('regla caducada: idempotente', stale2.txs === stale.txs);

  // Cambio de regla: pasa a otra cuenta
  const moved = assignAccountsToTransactions(r1.txs, [acc('c9', ['BAC|prod:BAC VISA'])]);
  check('cambia de cuenta si la regla cambió', moved.txs[0].accountId === 'c9' && moved.assigned === 1);

  // accountId sin accountSource (dato antiguo) no se pisa
  const legacy = assignAccountsToTransactions([tx('l', R1_BODY, { accountId: 'viejo' })], accounts);
  check('accountId sin source no se pisa', legacy.txs[0].accountId === 'viejo');

  // Usa el hint cuando no hay texto original
  const noBody = assignAccountsToTransactions([tx('n', undefined, { smsAccountHint: 'BAC|prod:BAC VISA' })], accounts);
  check('sin originalSMS usa smsAccountHint', noBody.txs[0].accountId === 'c1');
}

// ─────────────────────────────────────────────────────────────
// (e) groupUnassigned
// ─────────────────────────────────────────────────────────────
{
  const list: Transaction[] = [
    tx('a', R1_BODY, { smsAccountHint: 'BAC|prod:BAC VISA', amount: 100 }),
    tx('b', R1_BODY, { smsAccountHint: 'BAC|prod:BAC VISA', amount: 50.5 }),
    tx('c', R1_BODY, { smsAccountHint: 'BAC|prod:BAC VISA', amount: 20, type: 'income' }),
    tx('d', R1_BODY, { smsAccountHint: 'BANRURAL|acct:5678', amount: 10 }),
    tx('e', R1_BODY, { smsAccountHint: 'BAC|prod:BAC VISA', accountId: 'c1', accountSource: 'rule' }),
    tx('f', R1_BODY),                                                       // sin hint
    tx('g', undefined, { source: 'manual', smsAccountHint: 'BAC|prod:BAC VISA' }),
  ];
  const g = groupUnassigned(list);
  check('2 grupos', g.length === 2, String(g.length));
  check('grupo mayor primero', g[0].key === 'BAC|prod:BAC VISA' && g[0].txIds.join(',') === 'a,b,c', JSON.stringify(g[0]));
  check('label del grupo', g[0].label === 'BAC · BAC VISA', g[0].label);
  check('total = gastos - ingresos', g[0].total === 130.5, String(g[0].total));
  check('moneda del grupo', g[0].currency === 'Q');
  check('segundo grupo', g[1].key === 'BANRURAL|acct:5678' && g[1].total === 10 && g[1].label === 'BANRURAL · cuenta *5678');
  check('nada por asignar → []', groupUnassigned([list[4], list[5]]).length === 0);

  // Descartados por el usuario (accountSource 'user' sin accountId): ya no están pendientes.
  const withDiscarded: Transaction[] = [
    ...list,
    tx('h', R1_BODY, { smsAccountHint: 'BAC|prod:BAC VISA', accountSource: 'user' }),
    tx('i', R1_BODY, { smsAccountHint: 'BANRURAL|acct:5678', accountSource: 'user' }),
  ];
  const g2 = groupUnassigned(withDiscarded);
  check('descartados: no entran al grupo', g2[0].txIds.join(',') === 'a,b,c', JSON.stringify(g2[0]));
  check('descartados: grupo sin pendientes desaparece o no cambia', g2.length === 2 && g2[1].txIds.join(',') === 'd', JSON.stringify(g2));
  check('descartados: total no cambia', g2[0].total === 130.5, String(g2[0].total));
  check('solo descartados → []', groupUnassigned([withDiscarded[7], withDiscarded[8]]).length === 0);

  // Contador consistente: isPendingUnassigned (SmsService) == suma de groupUnassigned (SmsPendingSheet).
  const count = withDiscarded.filter(isPendingUnassigned).length;
  const sum = g2.reduce((n, x) => n + x.txIds.length, 0);
  check('contador consistente con los grupos', count === sum && count === 4, `${count} vs ${sum}`);
  check('isPendingUnassigned: descartado no cuenta', !isPendingUnassigned(withDiscarded[7]));
  check('isPendingUnassigned: pendiente cuenta', isPendingUnassigned(withDiscarded[0]));

  // assignAccountsToTransactions no toca accountSource 'user' (ni asigna ni borra).
  const bac = acc('c1', ['BAC|prod:BAC VISA']);
  const discarded = tx('x', R1_BODY, { accountSource: 'user' });
  const manual = tx('y', R1_BODY, { accountId: 'otra', accountSource: 'user' });
  const res = assignAccountsToTransactions([discarded, manual], [bac, acc('otra', [])]);
  check('asignación masiva: descartado queda igual', res.txs[0] === discarded && res.txs[0].accountId === undefined && res.txs[0].accountSource === 'user');
  check('asignación masiva: manual del usuario queda igual', res.txs[1] === manual && res.txs[1].accountId === 'otra');
  check('asignación masiva: nada asignado', res.assigned === 0);
}

// ─────────────────────────────────────────────────────────────
// (f) cycleSpentForCard
// ─────────────────────────────────────────────────────────────
{
  const card = acc('card', [], { cutoffDay: 15 });
  const d = (y: number, m: number, day: number, h = 12) => new Date(y, m - 1, day, h, 0).toISOString();
  const t = (id: string, date: string, amount: number, type: Transaction['type'], extra: Partial<Transaction> = {}) =>
    tx(id, undefined, { date, amount, type, accountId: 'card', ...extra });
  const list: Transaction[] = [
    t('antes', d(2026, 10, 15, 23), 999, 'expense'),          // día de corte del ciclo anterior: no cuenta
    t('c1', d(2026, 10, 16, 0), 100, 'expense'),              // primer día del ciclo
    t('c2', d(2026, 11, 3), 50.25, 'expense'),
    t('reemb', d(2026, 11, 4), 30, 'income'),                 // reembolso: resta
    t('otra', d(2026, 11, 5), 500, 'expense', { accountId: 'otra' }),
    t('usd', d(2026, 11, 5), 500, 'expense', { currency: 'USD' }),
    t('transf', d(2026, 11, 5), 500, 'transfer'),
    t('futuro', d(2026, 11, 20), 700, 'expense'),
  ];
  const now = new Date(2026, 10, 9, 10, 0); // 9 nov 2026
  const r = cycleSpentForCard(list, card, now);
  check('ciclo: monto', r.amount === 120.25, String(r.amount));
  check('ciclo: desde el 16/10', r.from.getFullYear() === 2026 && r.from.getMonth() === 9 && r.from.getDate() === 16 && r.from.getHours() === 0, r.from.toString());
  check('ciclo: hasta hoy', r.to === now);
  check('ciclo: moneda de la tarjeta', r.currency === 'Q');

  // Después del corte del mes: el ciclo empieza el 16 de este mes
  const r2 = cycleSpentForCard(list, card, new Date(2026, 10, 18, 9, 0));
  check('ciclo tras corte: desde el 16/11', r2.from.getMonth() === 10 && r2.from.getDate() === 16, r2.from.toString());
  check('ciclo tras corte: monto 0', r2.amount === 0, String(r2.amount));

  // En el día de corte el ciclo abierto sigue siendo el anterior
  const r3 = cycleSpentForCard(list, card, new Date(2026, 10, 15, 20, 0));
  check('día de corte: sigue el ciclo abierto (desde 16/10)', r3.from.getMonth() === 9 && r3.from.getDate() === 16);

  // Sin cutoffDay → mes calendario
  const noCut = acc('card', [], {});
  const r4 = cycleSpentForCard(list, noCut, now);
  check('sin cutoffDay: desde el 1 del mes', r4.from.getMonth() === 10 && r4.from.getDate() === 1, r4.from.toString());
  check('sin cutoffDay: solo noviembre', r4.amount === 20.25, String(r4.amount));

  // Corte 31 en mes de 30 días: cae el último día del mes
  const r5 = cycleSpentForCard([], acc('card', [], { cutoffDay: 31 }), new Date(2026, 10, 5));
  check('corte 31: desde el 1/11 (octubre tiene 31)', r5.from.getMonth() === 10 && r5.from.getDate() === 1, r5.from.toString());
  const r6 = cycleSpentForCard([], acc('card', [], { cutoffDay: 31 }), new Date(2026, 11, 5));
  check('corte 31: desde el 1/12 (noviembre tiene 30)', r6.from.getMonth() === 11 && r6.from.getDate() === 1, r6.from.toString());
}

// ─────────────────────────────────────────────────────────────
// (g) collectLinkSeen
// ─────────────────────────────────────────────────────────────
{
  const bodies = [
    R1_BODY, R1_BODY,
    'Hola, su tarjeta BAC Credomatic **5031 ha sido activada en el servicio GOOGLE PAY',
    corpusBody('S12'),
    'texto sin señales de banco',
  ];
  const seen = collectLinkSeen(bodies, [], '2026-11-09T10:00:00.000Z');
  const prod = seen.find(s => s.key === 'BAC|prod:BAC VISA');
  check('seen: prod contado 2 veces', prod?.count === 2, JSON.stringify(seen));
  check('seen: card:5031', seen.some(s => s.key === 'BAC|card:5031' && s.count === 1));
  check('seen: acct:5678', seen.some(s => s.key === 'BANRURAL|acct:5678'));
  check('seen: sin kind ni bank', !seen.some(s => s.key.includes('|kind:') || s.key.endsWith('|bank')));
  check('seen: ordenado por conteo', seen[0].key === 'BAC|prod:BAC VISA');
  check('seen: solo claves y conteos', seen.every(s => Object.keys(s).sort().join() === 'count,key,lastAt'));

  const again = collectLinkSeen([R1_BODY], seen, '2026-11-10T10:00:00.000Z');
  check('seen: acumula y actualiza lastAt', again.find(s => s.key === 'BAC|prod:BAC VISA')?.count === 3
    && again.find(s => s.key === 'BAC|prod:BAC VISA')?.lastAt === '2026-11-10T10:00:00.000Z');
  check('seen: sin cuerpos devuelve prev', collectLinkSeen([], seen, 'x') === seen);
  check('seen: sin señales devuelve prev', collectLinkSeen(['hola mundo'], seen, 'x') === seen);

  const many = Array.from({ length: 80 }, (_, i) => `Cta ***${String(1000 + i)} movimiento BAC`);
  check('seen: máximo 50', collectLinkSeen(many, [], 'n').length === 50);
}

// ─────────────────────────────────────────────────────────────
// (h) saldo automático: fuera de esta entrega
// ─────────────────────────────────────────────────────────────
{
  const a = acc('b1', [], { type: 'bank', smsAutoBalance: true, balanceAnchorAt: '2020-01-01T00:00:00.000Z' });
  const t1 = tx('t', R1_BODY, { accountId: 'b1', accountSource: 'rule' });
  check('computeDesiredEffect siempre null', computeDesiredEffect(t1, [a], 7.8) === null);
  const prev = [t1];
  const next = [{ ...t1 }];
  const rec = reconcileBalanceEffects(prev, next, [a], 7.8, '2026-11-09T00:00:00.000Z');
  check('reconcile es identidad', rec.txs === next && rec.changed === false && Object.keys(rec.accountDeltas).length === 0);
}

console.log(`\n${checks - failures}/${checks} verificaciones OK, ${failures} fallos`);
if (failures > 0) process.exit(1);
