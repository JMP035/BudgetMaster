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

const FULL: RequirementFacts = { hasBankAccount: true, hasCreditCard: true, hasIncomeSource: true, smsOn: true };
const EMPTY: RequirementFacts = { hasBankAccount: false, hasCreditCard: false, hasIncomeSource: false, smsOn: false };

// ── missingRequirement: cada requisito con datos completos e incompletos ─────
const REQS: TutorialRequirement[] = ['bank_account', 'credit_card', 'income_source', 'sms_on'];
for (const r of REQS) {
  check(`${r}: facts completos -> null`, missingRequirement({ requires: r }, FULL) === null);
  check(`${r}: facts vacíos -> ${r}`, missingRequirement({ requires: r }, EMPTY) === r);
}

// Solo falta lo que el paso pide, no lo demás
check('bank_account falta aunque exista tarjeta', missingRequirement({ requires: 'bank_account' }, { ...FULL, hasBankAccount: false }) === 'bank_account');
check('bank_account presente aunque falte lo demás', missingRequirement({ requires: 'bank_account' }, { ...EMPTY, hasBankAccount: true }) === null);
check('credit_card falta aunque exista cuenta', missingRequirement({ requires: 'credit_card' }, { ...FULL, hasCreditCard: false }) === 'credit_card');
check('credit_card presente aunque falte lo demás', missingRequirement({ requires: 'credit_card' }, { ...EMPTY, hasCreditCard: true }) === null);
check('income_source falta', missingRequirement({ requires: 'income_source' }, { ...FULL, hasIncomeSource: false }) === 'income_source');
check('income_source presente', missingRequirement({ requires: 'income_source' }, { ...EMPTY, hasIncomeSource: true }) === null);
check('sms_on apagado', missingRequirement({ requires: 'sms_on' }, { ...FULL, smsOn: false }) === 'sms_on');
check('sms_on encendido', missingRequirement({ requires: 'sms_on' }, { ...EMPTY, smsOn: true }) === null);

// Paso sin requires -> null siempre
check('sin requires con facts vacíos -> null', missingRequirement({}, EMPTY) === null);
check('sin requires con facts completos -> null', missingRequirement({}, FULL) === null);
check('requires undefined explícito -> null', missingRequirement({ requires: undefined }, EMPTY) === null);

// ── Textos ──────────────────────────────────────────────────
check('label bank_account', requirementLabel('bank_account') === 'la cuenta');
check('label credit_card', requirementLabel('credit_card') === 'la tarjeta');
check('label income_source', requirementLabel('income_source') === 'una fuente de ingreso');
check('label sms_on', requirementLabel('sms_on') === 'activar los SMS');
for (const r of REQS) {
  check(`aviso ${r} empieza con «Para este paso necesitás»`, requirementNoticeText(r).startsWith('Para este paso necesitás '));
  check(`aviso ${r} nombra el requisito`, requirementNoticeText(r).includes(requirementLabel(r)));
}

// ── buildRequirementFacts ────────────────────────────────────
const acc = (type: string, isActive = true) => ({ type, isActive });
const none = buildRequirementFacts({ accounts: [], monthlyIncome: 0, hasIncomeTransaction: false, smsOn: false });
check('sin datos: nada existe', !none.hasBankAccount && !none.hasCreditCard && !none.hasIncomeSource && !none.smsOn);

const bank = buildRequirementFacts({ accounts: [acc('bank')], monthlyIncome: 0, hasIncomeTransaction: false, smsOn: true });
check('cuenta bancaria activa', bank.hasBankAccount && !bank.hasCreditCard && bank.smsOn);

const savings = buildRequirementFacts({ accounts: [acc('savings')], monthlyIncome: 0, hasIncomeTransaction: false, smsOn: false });
check('cuenta de ahorro cuenta como cuenta', savings.hasBankAccount);

const cash = buildRequirementFacts({ accounts: [acc('cash')], monthlyIncome: 0, hasIncomeTransaction: false, smsOn: false });
check('efectivo no cuenta como cuenta bancaria', !cash.hasBankAccount && !cash.hasCreditCard);

const credit = buildRequirementFacts({ accounts: [acc('credit')], monthlyIncome: 0, hasIncomeTransaction: false, smsOn: false });
check('tarjeta activa', credit.hasCreditCard && !credit.hasBankAccount);

const inactive = buildRequirementFacts({ accounts: [acc('bank', false), acc('credit', false)], monthlyIncome: 0, hasIncomeTransaction: false, smsOn: false });
check('cuentas inactivas no cuentan', !inactive.hasBankAccount && !inactive.hasCreditCard);

check('ingreso mensual > 0 es fuente', buildRequirementFacts({ accounts: [], monthlyIncome: 5000, hasIncomeTransaction: false, smsOn: false }).hasIncomeSource);
check('un ingreso registrado es fuente', buildRequirementFacts({ accounts: [], monthlyIncome: 0, hasIncomeTransaction: true, smsOn: false }).hasIncomeSource);
check('ingreso mensual NaN no es fuente', !buildRequirementFacts({ accounts: [], monthlyIncome: NaN, hasIncomeTransaction: false, smsOn: false }).hasIncomeSource);

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
