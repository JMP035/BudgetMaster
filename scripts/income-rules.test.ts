process.env.TZ = 'America/Guatemala';
// Pruebas del aprendizaje de depósitos por origen (services/IncomeOrigin.ts + IncomeRules.ts). Sin dependencias:
//   npm run test:income-rules   →   sucrase-node scripts/income-rules.test.ts

import {
  extractIncomeOrigin, incomeAcctKey, incomeRuleKey, originKey,
} from '../services/IncomeOrigin';
import {
  applyIncomeRule, findIncomeRule, incomeKeyOfSms, incomeKeyOfTx, sameOriginTxIds, upsertIncomeRule,
} from '../services/IncomeRules';
import {
  buildExistingSmsIndex, classifyBankSms, planSmsImport, reviewImportedSms,
} from '../services/BankSmsParser';
import { extractSmsLinkSignals } from '../services/AccountLinking';
import type { IncomeRule, Transaction } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

// SMS reales de Banrural (no se tocan sus datos).
const SMS_A = 'BANRURAL: Recibiste Q7,426.61 en tu cuenta Monetaria *** ****5051 de SECCION DE OPERACIONES DE DEPOSITOS, el 27/10/2026 a las 10:31.';
const SMS_B = 'BANRURAL: Amigo, se acredito a tu Cuenta Monetaria ****5051  Q. 7,426.60  en: SECCION DE OPERACIONES DE DEPOSITOS';
// Sin origen: dice que se acreditó pero no de dónde viene.
const SMS_NO_ORIGIN = 'BANRURAL: Amigo, se acredito a tu Cuenta Monetaria ****5051 Q. 100.00';
// Un gasto cualquiera de Banrural con "en:" (agencia/canal): no debe aprender nada.
const SMS_EXPENSE = 'BANRURAL: Amigo, se debito de tu Cuenta Monetaria ****5051 Q. 50.00 en: TIENDA LA ESQUINA';

const ISO = new Date(2026, 10, 5, 12, 0).toISOString();

// ── Origen y clave ────────────────────────────────────────────
check('origen (a)', extractIncomeOrigin(SMS_A) === 'SECCION DE OPERACIONES DE DEPOSITOS', String(extractIncomeOrigin(SMS_A)));
check('origen (b)', extractIncomeOrigin(SMS_B) === 'SECCION DE OPERACIONES DE DEPOSITOS', String(extractIncomeOrigin(SMS_B)));
check('originKey (a) y (b) iguales',
  originKey(extractIncomeOrigin(SMS_A)) === 'seccion de operaciones de depositos' &&
  originKey(extractIncomeOrigin(SMS_A)) === originKey(extractIncomeOrigin(SMS_B)),
  `${originKey(extractIncomeOrigin(SMS_A))} / ${originKey(extractIncomeOrigin(SMS_B))}`);
check('cuenta 5051 en ambos', incomeAcctKey(SMS_A) === '5051' && incomeAcctKey(SMS_B) === '5051',
  `${incomeAcctKey(SMS_A)} / ${incomeAcctKey(SMS_B)}`);
check('originKey: sin tildes, dígitos ni signos, 5 palabras',
  originKey('Mindef, Sección  de Pagos #12 Zona Norte Extra') === 'mindef seccion de pagos zona');
check('originKey: menos de 4 letras → null', originKey('AB 12') === null && originKey('') === null && originKey(null) === null);
check('incomeRuleKey con y sin cuenta',
  incomeRuleKey('BANRURAL', '5051', 'x y') === 'BANRURAL|5051|x y' && incomeRuleKey('BANRURAL', null, 'x y') === 'BANRURAL|*|x y');
check('sin origen: extractIncomeOrigin null', extractIncomeOrigin(SMS_NO_ORIGIN) === null);
check('origen con "de X el 27/10" sin coma',
  extractIncomeOrigin('Recibiste Q10.00 en tu cuenta Monetaria ***5051 de JUAN PEREZ el 27/10/2026') === 'JUAN PEREZ');
check('origen al final con punto',
  extractIncomeOrigin('Recibiste Q10.00 en tu cuenta Monetaria ***5051 de JUAN PEREZ.') === 'JUAN PEREZ');

// La cuenta de la clave coincide con la señal acct/card de extractSmsLinkSignals (últimos 4 dígitos).
const sigA = extractSmsLinkSignals(SMS_A, 'BANRURAL').find(s => s.kind === 'acct' || s.kind === 'card');
check('la cuenta coincide con la señal de vínculo SMS', !!sigA && sigA.value === '5051', JSON.stringify(sigA));

// ── Clasificación base ────────────────────────────────────────
const cA = classifyBankSms({ body: SMS_A });
const cB = classifyBankSms({ body: SMS_B });
check('base (a): ingreso transfer_in', cA.accepted && cA.txType === 'income' && cA.category === 'transfer_in', `${cA.kind}/${cA.category}`);
check('base (b): ingreso transfer_in', cB.accepted && cB.txType === 'income' && cB.category === 'transfer_in', `${cB.kind}/${cB.category}`);

const keyA = incomeKeyOfSms(cA.bank, SMS_A);
const keyB = incomeKeyOfSms(cB.bank, SMS_B);
check('clave de regla (a) = (b)', keyA !== null && keyA === keyB, `${keyA} / ${keyB}`);
check('clave de regla del SMS sin origen es null', incomeKeyOfSms('BANRURAL', SMS_NO_ORIGIN) === null);

const rules: IncomeRule[] = upsertIncomeRule([], keyA, 'SECCION DE OPERACIONES DE DEPOSITOS', 'salary', ISO);

// ── upsert / find ─────────────────────────────────────────────
check('upsert crea la regla', rules.length === 1 && rules[0].category === 'salary' && rules[0].hits === 1);
const rules2 = upsertIncomeRule(rules, keyA, 'SECCION DE OPERACIONES DE DEPOSITOS', 'freelance', ISO);
check('upsert reemplaza (la última gana) e incrementa hits',
  rules2.length === 1 && rules2[0].category === 'freelance' && rules2[0].hits === 2);
check('upsert con clave null es no-op', upsertIncomeRule(rules, null, 'x', 'salary', ISO) === rules);
check('findIncomeRule encuentra por clave exacta', findIncomeRule(rules, keyB)?.category === 'salary');
check('findIncomeRule otra cuenta → null', findIncomeRule(rules, incomeRuleKey('BANRURAL', '9999', 'seccion de operaciones de depositos')) === null);
let many: IncomeRule[] = [];
for (let i = 0; i < 205; i++) {
  many = upsertIncomeRule(many, `BANRURAL|*|origen ${String.fromCharCode(97 + (i % 26))}${i}`, `o${i}`, 'salary',
    new Date(2026, 0, 1, 12, 0, i).toISOString());
}
check('tope de 200 reglas', many.length === 200);

// ── applyIncomeRule ───────────────────────────────────────────
const aA = applyIncomeRule(cA, SMS_A, rules);
check('applyIncomeRule cambia la categoría (a)', aA.category === 'salary' && aA.reason.endsWith('|learned_income'), `${aA.category}/${aA.reason}`);
check('applyIncomeRule cambia la categoría (b)', applyIncomeRule(cB, SMS_B, rules).category === 'salary');
check('applyIncomeRule sin reglas devuelve la misma', applyIncomeRule(cA, SMS_A, undefined) === cA && applyIncomeRule(cA, SMS_A, []) === cA);
const cNoOrigin = classifyBankSms({ body: SMS_NO_ORIGIN });
check('SMS sin origen: no aprende (misma clasificación)', applyIncomeRule(cNoOrigin, SMS_NO_ORIGIN, rules) === cNoOrigin);
const cExp = classifyBankSms({ body: SMS_EXPENSE });
check('un gasto no se ve afectado', applyIncomeRule(cExp, SMS_EXPENSE, rules) === cExp && cExp.txType !== 'income', `${cExp.kind}/${cExp.txType}`);

// ── planSmsImport ─────────────────────────────────────────────
const msg = (body: string, receivedAt: number) => ({ body, receivedAt });
const T0 = new Date(2026, 9, 27, 10, 31).getTime();
const planBase = planSmsImport([msg(SMS_A, T0)], buildExistingSmsIndex([], [], []), []);
const planLearn = planSmsImport([msg(SMS_A, T0)], buildExistingSmsIndex([], [], []), [], { incomeRules: rules });
check('plan sin reglas: transfer_in', planBase.transactions[0]?.category === 'transfer_in');
check('plan con regla: categoría elegida', planLearn.transactions[0]?.category === 'salary' && planLearn.transactions[0].type === 'income',
  planLearn.transactions[0]?.category);
const planB = planSmsImport([msg(SMS_B, T0)], buildExistingSmsIndex([], [], []), [], { incomeRules: rules });
check('plan con regla: el SMS (b) también', planB.transactions[0]?.category === 'salary');
const planNo = planSmsImport([msg(SMS_NO_ORIGIN, T0)], buildExistingSmsIndex([], [], []), [], { incomeRules: rules });
check('plan: SMS sin origen sigue como transfer_in', planNo.transactions[0]?.category === 'transfer_in', planNo.transactions[0]?.category);
const planExp = planSmsImport([msg(SMS_EXPENSE, T0)], buildExistingSmsIndex([], [], []), [], { incomeRules: rules });
check('plan: un gasto conserva su categoría y tipo', planExp.transactions.length === 1 && planExp.transactions[0].type === 'expense');
check('plan: invariante de estadísticas con reglas',
  planLearn.stats.bankCandidates === planLearn.stats.imported + planLearn.stats.installments + planLearn.stats.duplicates +
  planLearn.stats.dismissedByUser + planLearn.stats.promos + planLearn.stats.otp + planLearn.stats.declined + planLearn.stats.info +
  planLearn.stats.notices + planLearn.stats.ownTransfers + planLearn.stats.untrusted + planLearn.stats.unparsed);

// ── incomeKeyOfTx / sameOriginTxIds ───────────────────────────
const learnedTx = planLearn.transactions[0];
check('incomeKeyOfTx coincide con la clave del SMS', incomeKeyOfTx(learnedTx) === keyA, `${incomeKeyOfTx(learnedTx)} / ${keyA}`);
check('incomeKeyOfTx de un gasto es null', incomeKeyOfTx(planExp.transactions[0]) === null);
check('incomeKeyOfTx de un movimiento manual es null', incomeKeyOfTx({ ...learnedTx, source: 'manual' }) === null);

function incomeTx(id: string, body: string, category: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, amount: 7426.6, description: 'BANRURAL · Transferencia recibida', category, date: new Date(2026, 9, 27, 12, 0).toISOString(),
    type: 'income', source: 'sms', currency: 'Q', originalSMS: body, bank: 'BANRURAL', ...extra,
  };
}
const edited = incomeTx('e1', SMS_A, 'salary', { categoryEditedAt: ISO });
const peers = [
  edited,
  incomeTx('p1', SMS_B, 'transfer_in'),
  incomeTx('p2', SMS_A, 'transfer_in', { categoryEditedAt: ISO }),   // editado a mano: no se toca
  incomeTx('p3', SMS_NO_ORIGIN, 'transfer_in'),                      // otro origen: no se toca
  incomeTx('p4', SMS_A, 'transfer_in', { source: 'manual' }),        // manual: no se toca
  { ...incomeTx('p5', SMS_EXPENSE, 'food'), type: 'expense' as const }, // gasto: no se toca
  incomeTx('p6', SMS_A, 'transfer_in', { transferPairId: 'pair1' }), // par neutro: no se toca
];
const ids = sameOriginTxIds(peers, edited);
check('sameOriginTxIds: solo ingresos SMS del mismo origen sin edición manual', ids.length === 1 && ids[0] === 'p1', ids.join(','));

// ── reviewImportedSms ─────────────────────────────────────────
// Un ingreso ya guardado con la categoría aprendida: la revisión no debe proponer revertir a transfer_in.
const stored = incomeTx('s1', SMS_A, 'salary');
const rev0 = reviewImportedSms([stored], new Set(), {});
check('revisión sin reglas SÍ propone volver a transfer_in (lo que se evita)', rev0.some(i => i.txId === 's1' && i.proposed?.category === 'transfer_in'),
  JSON.stringify(rev0.map(i => i.proposed)));
const rev1 = reviewImportedSms([stored], new Set(), { incomeRules: rules });
check('revisión con reglas no propone revertir lo aprendido', !rev1.some(i => i.txId === 's1'), JSON.stringify(rev1.map(i => i.proposed)));
// Un ingreso SMS que aún tiene transfer_in y ya hay regla: se propone aprenderlo con la etiqueta correcta.
const staleTx = incomeTx('s2', SMS_B, 'transfer_in');
const rev2 = reviewImportedSms([staleTx], new Set(), { incomeRules: rules });
check('revisión propone aplicar lo aprendido con la etiqueta «Según lo que le enseñaste a la app»',
  rev2.length === 1 && rev2[0].proposed?.category === 'salary' && rev2[0].reasonLabel.includes('Según lo que le enseñaste a la app'),
  JSON.stringify(rev2.map(i => [i.proposed, i.reasonLabel])));
// Categoría editada a mano: la revisión nunca la toca.
const rev3 = reviewImportedSms([incomeTx('s3', SMS_A, 'bonus', { categoryEditedAt: ISO })], new Set(), { incomeRules: rules });
check('revisión no toca categorías editadas a mano', rev3.length === 0, JSON.stringify(rev3.map(i => i.proposed)));

if (failures > 0) {
  console.log(`\n${failures} de ${checks} comprobaciones fallaron.`);
  process.exit(1);
}
console.log(`OK income-rules: ${checks} comprobaciones.`);
