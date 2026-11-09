process.env.TZ = 'America/Guatemala';
// Pruebas del motor de parseo de SMS. Sin dependencias: se ejecuta con
//   npm run test:sms   →   sucrase-node scripts/sms-parser.test.ts
// (sucrase-node viene como dependencia transitiva de expo-constants). Si una
// actualización de Expo la quitara, alternativa sin tocar package.json:
//   npx --yes tsx scripts/sms-parser.test.ts

import {
  applyLearnedRule, buildExistingSmsIndex, buildSmsFingerprint, classifyBankSms, emptySmsStats, findPairedBankFeeIds,
  formatLocalDay, maskSmsForDiagnostics, planSmsImport, reviewImportedSms, SmsClassification,
} from '../services/BankSmsParser';
import { categorizeExpense, categorizeIncome, extractMerchantAndLocation } from '../services/Categorizer';
import { findMerchantRule, merchantKey, upsertMerchantRule } from '../services/MerchantRules';
import type { Transaction } from '../services/storage';
import type { SmsCase } from './sms-corpus';

// El corpus calcula sus receivedAt al cargarse: debe cargarse DESPUÉS de fijar TZ.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const corpusMod = require('./sms-corpus') as typeof import('./sms-corpus');
const SMS_CORPUS: SmsCase[] = corpusMod.SMS_CORPUS;
const { R1_BODY, R4_BODY, R4C_BODY, R6_BODY, S24_BODY, S47_BODY, M1_BODY, B1_BODY, B5_BODY } = corpusMod;

/** Mensajes de un caso del corpus tal como los entrega SmsService. */
function msgOf(c: SmsCase): { body: string; address?: string; receivedAt?: number } {
  return { body: c.body, address: c.address, receivedAt: c.receivedAt };
}

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

function hhmm(d: Date): string {
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
}

function byId(id: string): SmsCase {
  const c = SMS_CORPUS.find(x => x.id === id);
  if (!c) throw new Error('caso no encontrado: ' + id);
  return c;
}

function classify(c: SmsCase): SmsClassification {
  return classifyBankSms({ body: c.body, address: c.address, receivedAt: c.receivedAt });
}

// ─────────────────────────────────────────────────────────────
// (a) corpus contra classifyBankSms  /  (g) misma tabla en otra zona horaria
// ─────────────────────────────────────────────────────────────
function runCorpus(label: string, print: boolean): void {
  if (print) console.log(`\n=== (a) Corpus (${label}) ===\nid | esperado | obtenido`);
  for (const c of SMS_CORPUS) {
    const r = classify(c);
    const e = c.expect;
    const problems: string[] = [];
    const cmp = (field: string, want: unknown, got: unknown) => {
      if (want !== undefined && want !== got) problems.push(`${field}: esperado ${String(want)}, obtenido ${String(got)}`);
    };
    cmp('accepted', e.accepted, r.accepted);
    cmp('kind', e.kind, r.kind);
    cmp('amount', e.amount, r.amount);
    cmp('currency', e.currency, r.currency);
    cmp('txType', e.txType, r.txType);
    cmp('category', e.category, r.category);
    cmp('merchant', e.merchant, r.merchant);
    cmp('bank', e.bank, r.bank);
    cmp('bankRef', e.bankRef, r.bankRef);
    cmp('dateSource', e.dateSource, r.dateSource);
    cmp('day', e.day, formatLocalDay(r.occurredAt));
    cmp('hhmm', e.hhmm, hhmm(r.occurredAt));
    cmp('installments', e.installments, r.installments);
    check(`[${label}] ${c.id}`, problems.length === 0, problems.join('; '));
    if (print) {
      const want = `${e.accepted ? 'OK' : 'NO'} ${e.kind}${e.amount !== undefined ? ' ' + e.amount : ''}${e.category ? ' ' + e.category : ''}${e.day ? ' ' + e.day : ''}${e.hhmm ? ' ' + e.hhmm : ''}`;
      const got = `${r.accepted ? 'OK' : 'NO'} ${r.kind}${r.amount !== null ? ' ' + r.amount : ''}${r.category ? ' ' + r.category : ''} ${formatLocalDay(r.occurredAt)} ${hhmm(r.occurredAt)} [${r.reason}]`;
      console.log(`${problems.length ? 'XX' : 'ok'} ${c.id.padEnd(4)} | ${want} | ${got}`);
    }
  }
}

check('TZ Guatemala activa', new Date(2026, 9, 5, 12, 0).getTimezoneOffset() === 360, String(new Date(2026, 9, 5, 12, 0).getTimezoneOffset()));
runCorpus('TZ=America/Guatemala', true);

// ─────────────────────────────────────────────────────────────
// (b) planSmsImport: dedupe por fingerprint, sin el bug del REF mensual
// ─────────────────────────────────────────────────────────────
console.log('\n=== (b) planSmsImport: REF repetido ===');
{
  const r4a = byId('R4a'), r4b = byId('R4b'), r4c = byId('R4c'), s47a = byId('S47a'), s47b = byId('S47b');
  const plan = planSmsImport([r4a, r4b, r4c, s47a].map(c => ({ body: c.body, address: c.address, receivedAt: c.receivedAt })),
    buildExistingSmsIndex([], [], []), []);
  check('(b) R4a+R4b+R4c+S47 → 3 importados', plan.stats.imported === 3, JSON.stringify(plan.stats));
  check('(b) R4a+R4b+R4c+S47 → 1 duplicado', plan.stats.duplicates === 1, JSON.stringify(plan.stats));
  check('(b) R4c (mismo REF, otro mes) NO es duplicado de R4a',
    plan.transactions.filter(t => t.description.includes('Eegsa')).length === 2);

  const plan2 = planSmsImport([s47a, s47b].map(c => ({ body: c.body, receivedAt: c.receivedAt })),
    buildExistingSmsIndex([], [], []), []);
  check('(b) S47 en días distintos → 2 importados, 0 duplicados',
    plan2.stats.imported === 2 && plan2.stats.duplicates === 0, JSON.stringify(plan2.stats));
  check('(b) fingerprints de S47 distintos',
    buildSmsFingerprint(S47_BODY, s47a.receivedAt) !== buildSmsFingerprint(S47_BODY, s47b.receivedAt));
  check('(b) R4_BODY / R4C_BODY fingerprints distintos',
    buildSmsFingerprint(R4_BODY, r4a.receivedAt) !== buildSmsFingerprint(R4C_BODY, r4c.receivedAt));
}

// ─────────────────────────────────────────────────────────────
// (c) compatibilidad con las transacciones legadas
// ─────────────────────────────────────────────────────────────
console.log('\n=== (c) Compatibilidad legada ===');
function legacyTx(id: string, body: string, rx: number, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, amount: 220, category: 'other', date: new Date(rx).toISOString(), description: 'BAC · legado',
    type: 'expense', source: 'sms', currency: 'Q', originalSMS: body, bank: 'BAC', ...extra,
  };
}
{
  const rx = byId('R1').receivedAt as number;
  const old = legacyTx('sms_h_xxx', R1_BODY, rx);
  const plan = planSmsImport([{ body: R1_BODY, receivedAt: rx }], buildExistingSmsIndex([old], [], []), []);
  check('(c) R1 legado → 1 duplicado', plan.stats.duplicates === 1, JSON.stringify(plan.stats));
  check('(c) R1 legado → 0 importados', plan.stats.imported === 0 && plan.transactions.length === 0);

  // SMS legado sin hora en el texto (huella con el día de recepción)
  const rx47 = byId('S47a').receivedAt as number;
  const old47 = legacyTx('sms_h_yyy', S47_BODY, rx47, { amount: 50 });
  const plan47 = planSmsImport([{ body: S47_BODY, receivedAt: rx47 }], buildExistingSmsIndex([old47], [], []), []);
  check('(c) S47 legado (sin fecha en texto) → duplicado', plan47.stats.duplicates === 1, JSON.stringify(plan47.stats));

  // Visacuota legada (id sms_ref_/sms_h_, sin huella): se detecta por monto|cuotas|día
  const r2 = byId('R2');
  const inst = {
    id: 'sms_h_inst', accountId: '', name: 'Optica Alpi Store Peri', totalAmount: 2550, monthlyPayment: 255,
    totalInstallments: 10, paidInstallments: 0, startDate: new Date(r2.receivedAt as number).toISOString(),
    currency: 'Q' as const, category: 'other', isActive: true,
  };
  const planInst = planSmsImport([{ body: r2.body, receivedAt: r2.receivedAt }], buildExistingSmsIndex([], [inst], []), []);
  check('(c) visacuota legada → duplicado', planInst.stats.duplicates === 1 && planInst.stats.installments === 0, JSON.stringify(planInst.stats));
}

// ─────────────────────────────────────────────────────────────
// (d) dismissed
// ─────────────────────────────────────────────────────────────
console.log('\n=== (d) Descartados por el usuario ===');
{
  const c = byId('R7');
  const fp = buildSmsFingerprint(c.body, c.receivedAt);
  const plan = planSmsImport([{ body: c.body, receivedAt: c.receivedAt }], buildExistingSmsIndex([], [], [fp]), []);
  check('(d) fingerprint descartado → dismissedByUser 1', plan.stats.dismissedByUser === 1 && plan.stats.imported === 0, JSON.stringify(plan.stats));
  const plan2 = planSmsImport([{ body: c.body, receivedAt: c.receivedAt }], buildExistingSmsIndex([], [], ['sms_' + fp]), []);
  check('(d) id descartado → dismissedByUser 1', plan2.stats.dismissedByUser === 1, JSON.stringify(plan2.stats));
}

// ─────────────────────────────────────────────────────────────
// (e) invariante de stats sobre todo el corpus
// ─────────────────────────────────────────────────────────────
console.log('\n=== (e) Invariante de stats ===');
{
  const msgs = SMS_CORPUS.map(c => ({ body: c.body, address: c.address, receivedAt: c.receivedAt }));
  const plan = planSmsImport(msgs, buildExistingSmsIndex([], [], []), []);
  const s = plan.stats;
  const sum = s.imported + s.installments + s.duplicates + s.dismissedByUser + s.promos + s.otp + s.declined +
    s.info + s.notices + s.ownTransfers + s.untrusted + s.unparsed;
  check('(e) bankCandidates === suma de categorías', s.bankCandidates === sum, `${s.bankCandidates} vs ${sum} ${JSON.stringify(s)}`);
  check('(e) totalRead === corpus', s.totalRead === SMS_CORPUS.length);
  check('(e) neutral <= imported', s.neutral <= s.imported);
  check('(e) neutral = S23, S24, S40', s.neutral === 3, String(s.neutral));
  check('(e) notices = N1-N4', s.notices === 4, String(s.notices));
  // not_bank (no cuentan como candidatos): S42 y S43 + Tigo/ViX N5, N6, N7.
  check('(e) Tigo/ViX (N5-N7), S42 y S43 no cuentan como candidatos bancarios',
    s.bankCandidates === SMS_CORPUS.length - 5, `${s.bankCandidates} vs ${SMS_CORPUS.length - 5}`);
  check('(e) el corpus completo no deja SMS sin entender', s.unparsed === 0, String(s.unparsed));
  check('(e) emptySmsStats en cero', Object.values(emptySmsStats()).every(v => v === 0));
  console.log(JSON.stringify(s));
}

// ─────────────────────────────────────────────────────────────
// (f) reviewImportedSms
// ─────────────────────────────────────────────────────────────
console.log('\n=== (f) Revisión de lo ya importado ===');
{
  const r6 = legacyTx('sms_h_r6', R6_BODY, byId('R6').receivedAt as number, { amount: 15840, type: 'income', category: 'salary' });
  const items6 = reviewImportedSms([r6], new Set());
  check('(f) R6 legada como ingreso/Salario → remove', items6.length === 1 && items6[0].action === 'remove', JSON.stringify(items6.map(i => i.action)));
  check('(f) R6 reasonLabel', items6[0]?.reasonLabel === 'Oferta o publicidad del banco');
  check('(f) R6 en keptIds → sin propuesta', reviewImportedSms([r6], new Set([r6.id])).length === 0);

  const s24 = legacyTx('sms_h_s24', S24_BODY, byId('S24').receivedAt as number, { amount: 2000, type: 'income', category: 'salary' });
  const items24 = reviewImportedSms([s24], new Set());
  check('(f) S24 legada como income → fix con type transfer',
    items24.length === 1 && items24[0].action === 'fix' && items24[0].proposed?.type === 'transfer', JSON.stringify(items24[0]?.proposed));

  const r1 = byId('R1');
  const lateRx = r1.receivedAt as number;   // 05/10 02:10
  const r1tx = legacyTx('sms_h_r1', R1_BODY, lateRx, { category: 'food' });
  const items1 = reviewImportedSms([r1tx], new Set());
  const fixedDate = items1[0]?.proposed?.date ? new Date(items1[0].proposed.date) : null;
  check('(f) R1 con fecha de recepción 05/10 → fix con día 04/10',
    items1.length === 1 && items1[0].action === 'fix' && !!fixedDate && formatLocalDay(fixedDate) === '2026-10-04',
    JSON.stringify(items1[0]?.proposed));

  const okTx = legacyTx('sms_h_ok', R1_BODY, new Date(2026, 9, 4, 20, 54).getTime(), { category: 'food' });
  check('(f) R1 con fecha correcta → sin propuestas', reviewImportedSms([okTx], new Set()).length === 0);
}

// ─────────────────────────────────────────────────────────────
// (b2) emparejamiento de comisiones
// ─────────────────────────────────────────────────────────────
console.log('\n=== (b2) Emparejamiento de comisiones ===');
{
  const b1 = byId('B1'), b5 = byId('B5');
  const plan = planSmsImport([b1, b5].map(msgOf), buildExistingSmsIndex([], [], []), []);
  const t1 = plan.transactions.find(t => t.originalSMS === B1_BODY);
  const t5 = plan.transactions.find(t => t.originalSMS === B5_BODY);
  check('(b2) B1 y B5 importados', plan.stats.imported === 2 && !!t1 && !!t5, JSON.stringify(plan.stats));
  check('(b2) B1 queda como transferencia', t1?.category === 'transfer', String(t1?.category));
  check('(b2) B5 (Q6 a 1 min de la transferencia) → bank_fees', t5?.category === 'bank_fees', String(t5?.category));
  check('(b2) B5 descripción "BANRURAL · Comisión bancaria"', t5?.description === 'BANRURAL · Comisión bancaria', String(t5?.description));
  check('(b2) B1 guarda merchant null (sin comercio)', t1?.merchant === undefined);

  // B5 sola: sin transferencia vecina sigue siendo un débito normal.
  const alone = planSmsImport([msgOf(b5)], buildExistingSmsIndex([], [], []), []);
  check('(b2) B5 sola → other', alone.transactions[0]?.category === 'other', String(alone.transactions[0]?.category));

  // B5 sola pero con la transferencia ya guardada (existingTxs) → bank_fees.
  const existing: Transaction[] = [{
    id: 'sms_prev_b1', amount: 200, category: 'transfer', date: new Date(b1.receivedAt as number).toISOString(),
    description: 'BANRURAL · Transferencia enviada', type: 'expense', source: 'sms', currency: 'Q', bank: 'BANRURAL',
    originalSMS: B1_BODY,
  }];
  const withExisting = planSmsImport([msgOf(b5)], buildExistingSmsIndex([], [], []), [], { existingTxs: existing });
  check('(b2) B5 + transferencia ya guardada → bank_fees', withExisting.transactions[0]?.category === 'bank_fees',
    String(withExisting.transactions[0]?.category));

  // Fuera de la ventana de 5 minutos no se empareja.
  const farB5 = { body: B5_BODY, receivedAt: (b5.receivedAt as number) + 10 * 60000 };
  const far = planSmsImport([msgOf(b1), farB5], buildExistingSmsIndex([], [], []), []);
  check('(b2) a 10 minutos de la transferencia → no se empareja',
    far.transactions.find(t => t.originalSMS === B5_BODY)?.category === 'other');

  // Otro banco no se empareja.
  const otherBank = findPairedBankFeeIds([
    { id: 'a', amount: 200, category: 'transfer', date: new Date(2026, 10, 3, 14, 20).toISOString(), description: '', type: 'expense', source: 'sms', currency: 'Q', bank: 'BAC' },
    { id: 'b', amount: 6, category: 'other', date: new Date(2026, 10, 3, 14, 21).toISOString(), description: '', type: 'expense', source: 'sms', currency: 'Q', bank: 'BANRURAL' },
  ]);
  check('(b2) bancos distintos → sin emparejar', otherBank.size === 0);
  // Una compra grande no es comisión aunque esté al lado de una transferencia.
  const bigPurchase = findPairedBankFeeIds([
    { id: 'a', amount: 200, category: 'transfer', date: new Date(2026, 10, 3, 14, 20).toISOString(), description: '', type: 'expense', source: 'sms', currency: 'Q', bank: 'BANRURAL' },
    { id: 'b', amount: 60, category: 'other', date: new Date(2026, 10, 3, 14, 21).toISOString(), description: '', type: 'expense', source: 'sms', currency: 'Q', bank: 'BANRURAL' },
  ]);
  check('(b2) monto > Q10 → no es comisión', bigPurchase.size === 0);
}

// ─────────────────────────────────────────────────────────────
// (b3) unrecognized (buzón de sin clasificar)
// ─────────────────────────────────────────────────────────────
console.log('\n=== (b3) SMS sin clasificar ===');
{
  const unparsedMsg = { body: 'BANRURAL: Movimiento Q.30.00 cuenta ****5678', receivedAt: new Date(2026, 10, 4, 9, 0).getTime() };
  const msgs = [unparsedMsg, msgOf(byId('N1')), msgOf(byId('N2')), msgOf(byId('P1')), msgOf(byId('N5'))];
  const plan = planSmsImport(msgs, buildExistingSmsIndex([], [], []), []);
  check('(b3) 1 unparsed → 1 en unrecognized', plan.unrecognized.length === 1 && plan.stats.unparsed === 1, JSON.stringify(plan.stats));
  const u = plan.unrecognized[0];
  check('(b3) unrecognized: monto 30', u?.amount === 30, String(u?.amount));
  check('(b3) unrecognized: banco BANRURAL y moneda Q', u?.bank === 'BANRURAL' && u?.currency === 'Q');
  check('(b3) unrecognized: cuerpo, motivo y tipo sugerido', u?.body === unparsedMsg.body && u?.reason === 'no_match' && u?.suggestedType === 'expense',
    `${u?.reason} ${u?.suggestedType}`);
  check('(b3) unrecognized: huella y fecha ISO', !!u?.fingerprint && u?.fingerprint === buildSmsFingerprint(unparsedMsg.body, unparsedMsg.receivedAt) &&
    !isNaN(Date.parse(u?.occurredAt ?? '')));
  check('(b3) los avisos (notices) NO van al buzón', plan.stats.notices === 2 && !plan.unrecognized.some(i => /apple pay/i.test(i.body)));
  check('(b3) promos y no-bancarios NO van al buzón', plan.stats.promos === 1 && plan.unrecognized.length === 1);
  check('(b3) sin monto → suggestedType null', (() => {
    const p2 = planSmsImport([{ body: 'BANRURAL: tu cuenta tiene novedades', receivedAt: unparsedMsg.receivedAt }],
      buildExistingSmsIndex([], [], []), []);
    return p2.unrecognized.length === 1 && p2.unrecognized[0].suggestedType === null && p2.unrecognized[0].amount === null;
  })());

  // Tope de 200
  const many = Array.from({ length: 250 }, (_v, i) => ({
    body: `BANRURAL: Movimiento Q.${30 + i}.00 cuenta ****5678`, receivedAt: unparsedMsg.receivedAt,
  }));
  const planMany = planSmsImport(many, buildExistingSmsIndex([], [], []), []);
  check('(b3) tope de 200 en unrecognized', planMany.unrecognized.length === 200 && planMany.stats.unparsed === 250,
    `${planMany.unrecognized.length} / ${planMany.stats.unparsed}`);
}

// ─────────────────────────────────────────────────────────────
// (h) aprendizaje por comercio
// ─────────────────────────────────────────────────────────────
console.log('\n=== (h) Aprendizaje por comercio ===');
{
  check('(h) merchantKey("Gourmelt Zona 11") === gourmelt', merchantKey('Gourmelt Zona 11') === 'gourmelt', String(merchantKey('Gourmelt Zona 11')));
  // DESVÍO: services/MerchantRules.ts (Paso 0) incluye 'restauran' en GENERIC_KEYS, así que da null (el plan decía 'restauran').
  check('(h) merchantKey("Paggo App Restauran") → null (clave genérica)', merchantKey('Paggo App Restauran') === null,
    String(merchantKey('Paggo App Restauran')));
  check('(h) merchantKey("Paggo App Ferreteria El") === ferreteria el', merchantKey('Paggo App Ferreteria El') === 'ferreteria el',
    String(merchantKey('Paggo App Ferreteria El')));
  check('(h) merchantKey("Pago") === null', merchantKey('Pago') === null);
  check('(h) merchantKey(null) === null', merchantKey(null) === null);
  check('(h) merchantKey("Super 24 #12 Mixco") → null (queda "super", genérica)', merchantKey('Super 24 #12 Mixco') === null,
    String(merchantKey('Super 24 #12 Mixco')));
  check('(h) merchantKey quita ciudad final', merchantKey('Pollo Campero Majadas Guatemala') === 'pollo campero majadas', String(merchantKey('Pollo Campero Majadas Guatemala')));

  const iso = new Date(2026, 10, 5, 12, 0).toISOString();
  const rules = upsertMerchantRule([], 'La Trama', 'entertainment', iso);
  check('(h) upsert crea 1 regla con clave la trama', rules.length === 1 && rules[0].key === 'la trama' && rules[0].hits === 1);
  const rules2 = upsertMerchantRule(rules, 'LA TRAMA', 'shopping', iso);
  check('(h) upsert misma clave reemplaza (la última gana) y suma hits',
    rules2.length === 1 && rules2[0].category === 'shopping' && rules2[0].hits === 2);
  check('(h) upsert con clave genérica es no-op', upsertMerchantRule([], 'Pago', 'food', iso).length === 0);

  const m1 = byId('M1'), m2 = byId('M2');
  const plan = planSmsImport([msgOf(m1)], buildExistingSmsIndex([], [], []), [], { merchantRules: rules });
  check('(h) con regla aprendida M1 → entertainment', plan.transactions[0]?.category === 'entertainment', String(plan.transactions[0]?.category));
  check('(h) M1 guarda merchant "La Trama"', plan.transactions[0]?.merchant === 'La Trama', String(plan.transactions[0]?.merchant));
  const planNo = planSmsImport([msgOf(m1)], buildExistingSmsIndex([], [], []), []);
  check('(h) sin regla aprendida M1 sigue en food', planNo.transactions[0]?.category === 'food');
  const plan2 = planSmsImport([msgOf(m2)], buildExistingSmsIndex([], [], []), [], { merchantRules: rules });
  check('(h) la regla de La Trama no afecta a M2 (Gourmelt)', plan2.transactions[0]?.category === 'food', String(plan2.transactions[0]?.category));

  const cM1 = classify(m1);
  check('(h) applyLearnedRule marca la razón |learned', applyLearnedRule(cM1, rules).reason.endsWith('|learned'));
  check('(h) applyLearnedRule sin reglas devuelve la misma clasificación', applyLearnedRule(cM1, undefined) === cM1 && applyLearnedRule(cM1, []) === cM1);
  const rulesFee = upsertMerchantRule([], 'Plaza Atanasio Tzul', 'shopping', iso);
  const cB2 = classify(byId('B2'));
  check('(h) no se aprende sobre comisiones (bank_fee)', applyLearnedRule(cB2, rulesFee).category === 'bank_fees');
  const cB1 = classify(byId('B1'));
  check('(h) no se aprende sobre transferencias', applyLearnedRule(cB1, rulesFee) === cB1);

  // findMerchantRule: gana la clave más larga; coincide por prefijo de tokens
  const r1 = upsertMerchantRule([], 'Pollo', 'food', iso);
  const r2 = upsertMerchantRule(r1, 'Pollo Campero', 'entertainment', iso);
  check('(h) findMerchantRule prefiere la clave más larga',
    findMerchantRule(r2, 'Pollo Campero Zona 10')?.category === 'entertainment');
  check('(h) findMerchantRule cae a la clave corta si no hay la larga', findMerchantRule(r2, 'Pollo Brujo')?.category === 'food');
  check('(h) findMerchantRule no coincide con prefijo parcial de palabra', findMerchantRule(r1, 'Pollos Hermanos') === null);
  check('(h) findMerchantRule sin reglas → null', findMerchantRule([], 'Pollo') === null && findMerchantRule(undefined, 'Pollo') === null);
}

// ─────────────────────────────────────────────────────────────
// (f2) revisión: categorías, transferencias y comisiones
// ─────────────────────────────────────────────────────────────
console.log('\n=== (f2) Revisión de categorías ===');
{
  const b1c = byId('B1'), b5c = byId('B5'), m1c = byId('M1');
  const b1tx = (extra: Partial<Transaction> = {}) => legacyTx('sms_h_b1', B1_BODY, b1c.receivedAt as number,
    { amount: 200, bank: 'BANRURAL', description: 'BANRURAL · Débito de cuenta', category: 'other', ...extra });
  const b5tx = (extra: Partial<Transaction> = {}) => legacyTx('sms_h_b5', B5_BODY, b5c.receivedAt as number,
    { amount: 6, bank: 'BANRURAL', description: 'BANRURAL · Débito en Agencia Central', category: 'other', ...extra });
  const m1tx = (extra: Partial<Transaction> = {}) => legacyTx('sms_h_m1', M1_BODY, m1c.receivedAt as number,
    { amount: 375, bank: 'BAC', description: 'BAC · Compra en La Trama', category: 'other', ...extra });

  const iB1 = reviewImportedSms([b1tx()], new Set());
  check('(f2) B1 legada other → fix con category transfer',
    iB1.length === 1 && iB1[0].action === 'fix' && iB1[0].proposed?.category === 'transfer', JSON.stringify(iB1[0]?.proposed));
  check('(f2) B1 → descripción "BANRURAL · Transferencia enviada"', iB1[0]?.proposed?.description === 'BANRURAL · Transferencia enviada');
  check('(f2) B1 → etiqueta "Es una transferencia"', iB1[0]?.reasonLabel === 'Es una transferencia', String(iB1[0]?.reasonLabel));
  check('(f2) B1 no cambia el tipo (sigue gasto)', iB1[0]?.proposed?.type === undefined);

  check('(f2) B1 con categoryEditedAt → sin propuesta',
    reviewImportedSms([b1tx({ categoryEditedAt: new Date().toISOString() })], new Set()).length === 0);
  check('(f2) M1 con shopping (no es other) → sin propuesta',
    reviewImportedSms([m1tx({ category: 'shopping' })], new Set()).length === 0);
  const iM1 = reviewImportedSms([m1tx()], new Set());
  check('(f2) M1 con other → propuesta food', iM1.length === 1 && iM1[0].proposed?.category === 'food', JSON.stringify(iM1[0]?.proposed));
  check('(f2) M1 → etiqueta "Categoría sugerida"', iM1[0]?.reasonLabel === 'Categoría sugerida', String(iM1[0]?.reasonLabel));
  check('(f2) M1 ya en food → sin propuesta (sin cambios cosméticos)',
    reviewImportedSms([m1tx({ category: 'food', description: 'otra descripcion' })], new Set()).length === 0);

  const pair = reviewImportedSms([b1tx(), b5tx()], new Set());
  const iB5 = pair.find(i => i.txId === 'sms_h_b5');
  check('(f2) B1+B5 legadas other → B5 propuesta bank_fees', iB5?.action === 'fix' && iB5.proposed?.category === 'bank_fees', JSON.stringify(iB5?.proposed));
  check('(f2) B5 descripción "BANRURAL · Comisión bancaria"', iB5?.proposed?.description === 'BANRURAL · Comisión bancaria');
  check('(f2) B5 etiqueta "Comisión bancaria"', iB5?.reasonLabel === 'Comisión bancaria', String(iB5?.reasonLabel));
  check('(f2) B1+B5 → 2 propuestas', pair.length === 2, String(pair.length));
  check('(f2) B5 en keptIds → sin propuesta de B5',
    !reviewImportedSms([b1tx(), b5tx()], new Set(['sms_h_b5'])).some(i => i.txId === 'sms_h_b5'));
  check('(f2) B5 ya bank_fees → sin propuesta', reviewImportedSms([b1tx({ category: 'transfer' }), b5tx({ category: 'bank_fees', description: 'BANRURAL · Comisión bancaria' })], new Set()).length === 0);

  // Regla aprendida: propone aunque la categoría actual no sea 'other'.
  const rules = upsertMerchantRule([], 'La Trama', 'entertainment', new Date(2026, 10, 5).toISOString());
  const iLearned = reviewImportedSms([m1tx({ category: 'food' })], new Set(), { merchantRules: rules });
  check('(f2) regla aprendida → propone entertainment', iLearned.length === 1 && iLearned[0].proposed?.category === 'entertainment', JSON.stringify(iLearned[0]?.proposed));
  check('(f2) regla aprendida → etiqueta "Según lo que le enseñaste a la app"', iLearned[0]?.reasonLabel === 'Según lo que le enseñaste a la app', String(iLearned[0]?.reasonLabel));
  check('(f2) regla aprendida respeta categoryEditedAt',
    reviewImportedSms([m1tx({ category: 'food', categoryEditedAt: new Date().toISOString() })], new Set(), { merchantRules: rules }).length === 0);

  // Descripción: solo se propone junto a otro cambio sustantivo (no hay avalancha cosmética).
  const b2c = byId('B2');
  const dirtyTx = (category: string) => legacyTx('sms_h_b2', b2c.body, b2c.receivedAt as number,
    { amount: 5, bank: 'BANRURAL', category, description: 'BANRURAL · Débito en Plaza Atanasio Tzul,' });
  const dirty = reviewImportedSms([dirtyTx('other')], new Set());
  check('(f2) B2 legada other → bank_fees con descripción limpia',
    dirty.length === 1 && dirty[0].proposed?.category === 'bank_fees' && dirty[0].proposed?.description === 'BANRURAL · Comisión bancaria',
    JSON.stringify(dirty[0]?.proposed));
  check('(f2) solo la descripción distinta (categoría ya correcta) → sin propuesta',
    reviewImportedSms([dirtyTx('bank_fees')], new Set()).length === 0);
  check('(f2) M1 legada food con otra descripción pero sin cambios sustantivos → sin propuesta',
    reviewImportedSms([m1tx({ category: 'food', description: 'BAC · Compra en La Trama,' })], new Set()).length === 0);

  // Depósito legado: other → transfer_in
  const b4 = byId('B4');
  const iB4 = reviewImportedSms([legacyTx('sms_h_b4', b4.body, b4.receivedAt as number,
    { amount: 515, bank: 'BANRURAL', type: 'income', category: 'other', description: 'BANRURAL · Depósito recibido' })], new Set());
  check('(f2) B4 legada como depósito other → transfer_in', iB4.length === 1 && iB4[0].proposed?.category === 'transfer_in' && iB4[0].proposed?.description === 'BANRURAL · Transferencia recibida',
    JSON.stringify(iB4[0]?.proposed));

  // Los avisos ya importados por error se proponen para quitar
  const n2 = byId('N2');
  const iN2 = reviewImportedSms([legacyTx('sms_h_n2', n2.body, n2.receivedAt as number, { amount: 1 })], new Set());
  check('(f2) aviso legado (Apple Pay) → remove con etiqueta de aviso',
    iN2.length === 1 && iN2[0].action === 'remove' && iN2[0].reasonLabel === 'Aviso informativo del banco (sin movimiento)', JSON.stringify(iN2.map(i => i.reasonLabel)));
}

// ─────────────────────────────────────────────────────────────
// Máscara de diagnóstico
// ─────────────────────────────────────────────────────────────
console.log('\n=== Máscara ===');
{
  const m = maskSmsForDiagnostics('tarjeta **5031 cuenta 123456789');
  check('máscara oculta **5031 y 123456789', !m.includes('5031') && !m.includes('123456789'), m);
  check('máscara oculta ****1234', !maskSmsForDiagnostics('Cuenta ****1234 debitada').includes('1234'));
  check('máscara oculta xx1234', !maskSmsForDiagnostics('tarjeta xx1234 aprobada').includes('1234'));
  check('máscara conserva el monto', maskSmsForDiagnostics('compra por Q 220.00 en ****1234').includes('Q 220.00'));
  const t = maskSmsForDiagnostics(R6_BODY);
  check('máscara conserva el comportamiento previo (NOMBRE y enlace /t/)', t.startsWith('NOMBRE,') && !t.includes('mLrnNl'), t);
}

// ─────────────────────────────────────────────────────────────
// Categorizer: unidades puntuales
// ─────────────────────────────────────────────────────────────
console.log('\n=== Categorizer ===');
{
  check('Categorizer "Estacion de Servicio J" → fuel', categorizeExpense('Estacion de Servicio J', null, '') === 'fuel');
  check('Categorizer "Parqueos" → transport', categorizeExpense('Parqueos', null, '') === 'transport');
  check('Categorizer "Paggo App Restauran" → food', categorizeExpense('Paggo App Restauran', null, '') === 'food');
  check('Categorizer "Soluciones Tecnologica" → tech', categorizeExpense('Soluciones Tecnologica', 'Guatemala', '') === 'tech');
  check('Categorizer "Suma" (inicio del comercio) → groceries', categorizeExpense('Suma', 'Guatemala', '') === 'groceries');
  check('Categorizer "Pacaya Tours" → other (no es paca)', categorizeExpense('Pacaya Tours', 'Escuintla', '') === 'other');
  check('Categorizer "Farmacia Batres" + ciudad San Martin → pharmacy (merchantStart no mira la ubicación)',
    categorizeExpense('Farmacia Batres', 'San Martin', '') === 'pharmacy');
  check('Categorizer "Hotel San Martin" → travel', categorizeExpense('Hotel San Martin', 'Antigua', '') === 'travel');
  check('Categorizer "San Martin" solo → food', categorizeExpense('San Martin', 'Guatemala', '') === 'food');
  check('Categorizer "Consumax Tienda" → shopping', categorizeExpense('Consumax Tienda', 'Guatemala', '') === 'shopping');
  check('Categorizer "Apple Store Oakland" → other', categorizeExpense('Apple Store Oakland', null, '') === 'other');
  check('Categorizer "Anthropic Claude Sub" → subscriptions', categorizeExpense('Anthropic Claude Sub', 'San Francisco', '') === 'subscriptions');
  check('Categorizer "La Megapaca Montserrat" → clothes (antes que shopping)', categorizeExpense('La Megapaca Montserrat', 'Guatemala', '') === 'clothes');
  check('Categorizer "Click Computacion" → tech', categorizeExpense('Click Computacion', null, '') === 'tech');
  check('Categorizer "Clickstream" no es tech por merchantStart', categorizeExpense('Clickstream Co', null, '') !== 'tech');
  check('Categorizer merchantStart no aplica sin comercio', categorizeExpense(null, null, 'suma san martin') === 'other');
  const mB2 = extractMerchantAndLocation(byId('B2').body);
  check('extract: coma final fuera ("Plaza Atanasio Tzul")', mB2.merchant === 'Plaza Atanasio Tzul', String(mB2.merchant));
  const mM5 = extractMerchantAndLocation(byId('M5').body);
  check('extract: conectores en minúscula ("Estacion de Servicio J")', mM5.merchant === 'Estacion de Servicio J', String(mM5.merchant));
  const mM1 = extractMerchantAndLocation(M1_BODY);
  check('extract: el primer token conserva mayúscula ("La Trama")', mM1.merchant === 'La Trama' && mM1.location === 'Guatemala', `${mM1.merchant} / ${mM1.location}`);
  check('extract: "El Marinero Miraflores" empieza en mayúscula',
    extractMerchantAndLocation(byId('M3').body).merchant === 'El Marinero Miraflores');
  check('extract: ubicación sin puntuación final',
    extractMerchantAndLocation('PRF protege tu BAC VISA: compra Aprobada por Q 5.00 en TIENDA X    ZONA 1, el 01/10/26 10:00').location === 'Zona 1');
  const m = extractMerchantAndLocation(R1_BODY);
  check('Categorizer R1 merchant', m.merchant === "Castor's Pizza Kalu", String(m.merchant));
  check('Categorizer R1 location', m.location === 'Guatemala', String(m.location));
  check('categorizeIncome sin pistas → other', categorizeIncome('deposito en efectivo', 'deposit') === 'other');
  check('categorizeIncome planilla → salary', categorizeIncome('pago de planilla', 'payroll') === 'salary');
  check('categorizeExpense "uno" solo en comercio', categorizeExpense(null, null, 'compra uno cualquiera') === 'other');
  check('categorizeExpense banca por internet no es internet', categorizeExpense(null, null, 'pago por internet') === 'other');
}

// ─────────────────────────────────────────────────────────────
// (g) misma tabla con TZ=UTC: el día debe coincidir (getters locales)
// ─────────────────────────────────────────────────────────────
process.env.TZ = 'UTC';
check('TZ UTC activa', new Date(2026, 9, 5, 12, 0).getTimezoneOffset() === 0, String(new Date(2026, 9, 5, 12, 0).getTimezoneOffset()));
console.log('\n=== (g) Corpus con TZ=UTC ===');
runCorpus('TZ=UTC', false);

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
process.exit(failures ? 1 : 0);
