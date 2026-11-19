process.env.TZ = 'America/Guatemala';
// Pruebas de los requisitos de los pasos del tutorial (services/TutorialRequirements.ts).
//   npm run test:tutorial-requirements   →   sucrase-node scripts/tutorial-requirements.test.ts

import {
  buildRequirementFacts, missingRequirement, requirementLabel, requirementNoticeText,
} from '../services/TutorialRequirements';
import type { RequirementFacts, TutorialRequirement } from '../services/TutorialRequirements';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const FULL: RequirementFacts = { hasBankAccount: true, hasCreditCard: true, hasCardWithDates: true, hasIncomeSource: true, smsOn: true };
const EMPTY: RequirementFacts = { hasBankAccount: false, hasCreditCard: false, hasCardWithDates: false, hasIncomeSource: false, smsOn: false };

// ── missingRequirement: cada requisito con datos completos e incompletos ─────
const REQS: TutorialRequirement[] = ['bank_account', 'any_account', 'credit_card', 'card_dates', 'income_source', 'sms_on'];
for (const r of REQS) {
  check(`${r}: facts completos -> null`, missingRequirement({ requires: r }, FULL) === null);
  check(`${r}: facts vacíos -> ${r}`, missingRequirement({ requires: r }, EMPTY) === r);
}

// Solo falta lo que el paso pide, no lo demás
check('bank_account falta aunque exista tarjeta', missingRequirement({ requires: 'bank_account' }, { ...FULL, hasBankAccount: false }) === 'bank_account');
check('bank_account presente aunque falte lo demás', missingRequirement({ requires: 'bank_account' }, { ...EMPTY, hasBankAccount: true }) === null);
check('credit_card falta aunque exista cuenta', missingRequirement({ requires: 'credit_card' }, { ...FULL, hasCreditCard: false }) === 'credit_card');
check('credit_card presente aunque falte lo demás', missingRequirement({ requires: 'credit_card' }, { ...EMPTY, hasCreditCard: true }) === null);
check('card_dates falta aunque exista tarjeta sin fechas', missingRequirement({ requires: 'card_dates' }, { ...FULL, hasCardWithDates: false }) === 'card_dates');
check('card_dates presente aunque falte lo demás', missingRequirement({ requires: 'card_dates' }, { ...EMPTY, hasCardWithDates: true }) === null);
check('income_source falta', missingRequirement({ requires: 'income_source' }, { ...FULL, hasIncomeSource: false }) === 'income_source');
check('income_source presente', missingRequirement({ requires: 'income_source' }, { ...EMPTY, hasIncomeSource: true }) === null);
check('sms_on apagado', missingRequirement({ requires: 'sms_on' }, { ...FULL, smsOn: false }) === 'sms_on');
check('sms_on encendido', missingRequirement({ requires: 'sms_on' }, { ...EMPTY, smsOn: true }) === null);

// any_account: basta una cuenta o una tarjeta
check('any_account con solo cuenta -> null', missingRequirement({ requires: 'any_account' }, { ...EMPTY, hasBankAccount: true }) === null);
check('any_account con solo tarjeta -> null', missingRequirement({ requires: 'any_account' }, { ...EMPTY, hasCreditCard: true }) === null);
check('any_account sin ninguna -> any_account', missingRequirement({ requires: 'any_account' }, EMPTY) === 'any_account');
check('any_account no la cumple solo tener SMS o ingresos', missingRequirement({ requires: 'any_account' }, { ...EMPTY, smsOn: true, hasIncomeSource: true }) === 'any_account');

// Paso sin requires -> null siempre
check('sin requires con facts vacíos -> null', missingRequirement({}, EMPTY) === null);
check('sin requires con facts completos -> null', missingRequirement({}, FULL) === null);
check('requires undefined explícito -> null', missingRequirement({ requires: undefined }, EMPTY) === null);

// ── Textos ──────────────────────────────────────────────────
check('label bank_account', requirementLabel('bank_account') === 'la cuenta');
check('label any_account', requirementLabel('any_account') === 'una cuenta o tarjeta');
check('label credit_card', requirementLabel('credit_card') === 'la tarjeta');
check('label card_dates', requirementLabel('card_dates') === 'una tarjeta con su día de corte y de pago');
check('label income_source', requirementLabel('income_source') === 'una fuente de ingreso');
check('label sms_on', requirementLabel('sms_on') === 'activar los SMS');
for (const r of REQS) {
  check(`aviso ${r} empieza con «Para este paso necesitas»`, requirementNoticeText(r).startsWith('Para este paso necesitas '));
  check(`aviso ${r} nombra el requisito`, requirementNoticeText(r).includes(requirementLabel(r)));
}

// ── buildRequirementFacts ────────────────────────────────────
const acc = (type: string, isActive = true, cutoffDay?: number, paymentDueDay?: number) => ({ type, isActive, cutoffDay, paymentDueDay });
const none = buildRequirementFacts({ accounts: [], incomeSources: [], smsOn: false });
check('sin datos: nada existe', !none.hasBankAccount && !none.hasCreditCard && !none.hasIncomeSource && !none.smsOn);

const bank = buildRequirementFacts({ accounts: [acc('bank')], incomeSources: [], smsOn: true });
check('cuenta bancaria activa', bank.hasBankAccount && !bank.hasCreditCard && bank.smsOn);

const savings = buildRequirementFacts({ accounts: [acc('savings')], incomeSources: [], smsOn: false });
check('cuenta de ahorro cuenta como cuenta', savings.hasBankAccount);

const cash = buildRequirementFacts({ accounts: [acc('cash')], incomeSources: [], smsOn: false });
check('efectivo no cuenta como cuenta bancaria', !cash.hasBankAccount && !cash.hasCreditCard);

const credit = buildRequirementFacts({ accounts: [acc('credit')], incomeSources: [], smsOn: false });
check('tarjeta activa', credit.hasCreditCard && !credit.hasBankAccount);

const inactive = buildRequirementFacts({ accounts: [acc('bank', false), acc('credit', false)], incomeSources: [], smsOn: false });
check('cuentas inactivas no cuentan', !inactive.hasBankAccount && !inactive.hasCreditCard);

check('una fuente de ingreso activa cuenta', buildRequirementFacts({ accounts: [], incomeSources: [{ isActive: true }], smsOn: false }).hasIncomeSource);
check('una fuente inactiva no cuenta', !buildRequirementFacts({ accounts: [], incomeSources: [{ isActive: false }], smsOn: false }).hasIncomeSource);
check('sin fuentes no hay fuente de ingreso', !buildRequirementFacts({ accounts: [], incomeSources: [], smsOn: false }).hasIncomeSource);
check('con varias basta una activa', buildRequirementFacts({ accounts: [], incomeSources: [{ isActive: false }, { isActive: true }], smsOn: false }).hasIncomeSource);

// hasCardWithDates: tarjeta activa con AMBOS días válidos
const cardFacts = (...accs: ReturnType<typeof acc>[]) => buildRequirementFacts({ accounts: accs, incomeSources: [], smsOn: false });
check('sin cuentas: sin tarjeta con fechas', !cardFacts().hasCardWithDates);
check('tarjeta sin días: no cuenta', !cardFacts(acc('credit')).hasCardWithDates);
check('tarjeta solo con corte: no cuenta', !cardFacts(acc('credit', true, 25)).hasCardWithDates);
check('tarjeta solo con pago: no cuenta', !cardFacts(acc('credit', true, undefined, 10)).hasCardWithDates);
check('tarjeta con ambos días: cuenta', cardFacts(acc('credit', true, 25, 10)).hasCardWithDates);
check('día fuera de rango no cuenta', !cardFacts(acc('credit', true, 0, 10)).hasCardWithDates && !cardFacts(acc('credit', true, 25, 32)).hasCardWithDates);
check('tarjeta inactiva con fechas no cuenta', !cardFacts(acc('credit', false, 25, 10)).hasCardWithDates);
check('una cuenta bancaria con días no cuenta como tarjeta', !cardFacts(acc('bank', true, 25, 10)).hasCardWithDates);
check('basta UNA tarjeta con fechas aunque otra no las tenga', cardFacts(acc('credit'), acc('credit', true, 20, 5)).hasCardWithDates);

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
