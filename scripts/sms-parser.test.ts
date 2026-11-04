process.env.TZ = 'America/Guatemala';
// Pruebas del motor de parseo de SMS. Sin dependencias: se ejecuta con
//   npm run test:sms   →   sucrase-node scripts/sms-parser.test.ts
// (sucrase-node viene como dependencia transitiva de expo-constants). Si una
// actualización de Expo la quitara, alternativa sin tocar package.json:
//   npx --yes tsx scripts/sms-parser.test.ts

import {
  buildExistingSmsIndex, buildSmsFingerprint, classifyBankSms, emptySmsStats, formatLocalDay,
  planSmsImport, reviewImportedSms, SmsClassification,
} from '../services/BankSmsParser';
import { categorizeExpense, categorizeIncome, extractMerchantAndLocation } from '../services/Categorizer';
import type { Transaction } from '../services/storage';
import type { SmsCase } from './sms-corpus';

// El corpus calcula sus receivedAt al cargarse: debe cargarse DESPUÉS de fijar TZ.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const corpusMod = require('./sms-corpus') as typeof import('./sms-corpus');
const SMS_CORPUS: SmsCase[] = corpusMod.SMS_CORPUS;
const { R1_BODY, R4_BODY, R4C_BODY, R6_BODY, S24_BODY, S47_BODY } = corpusMod;

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
    s.info + s.ownTransfers + s.untrusted + s.unparsed;
  check('(e) bankCandidates === suma de categorías', s.bankCandidates === sum, `${s.bankCandidates} vs ${sum} ${JSON.stringify(s)}`);
  check('(e) totalRead === corpus', s.totalRead === SMS_CORPUS.length);
  check('(e) neutral <= imported', s.neutral <= s.imported);
  check('(e) neutral = S23, S24, S40', s.neutral === 3, String(s.neutral));
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
// Categorizer: unidades puntuales
// ─────────────────────────────────────────────────────────────
console.log('\n=== Categorizer ===');
{
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
