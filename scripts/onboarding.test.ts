process.env.TZ = 'America/Guatemala';
// Pruebas del onboarding (services/OnboardingPlan.ts, GettingStarted.ts, SmsPermissionHelp.ts). Sin dependencias:
//   npm run test:onboarding   →   sucrase-node scripts/onboarding.test.ts

import {
  ONBOARDING_BANKS, ONB_TYPE_STYLE, FIXED_SUGGESTIONS,
  buildOnboardingCommit, canContinueRequired, dueLabel, emptyDraft, needsUsd, newDraftId, optionalSteps,
  periodSentence, sanitizeDraft, smsLinksFor, validateAccount, validateBiweekly, validateDay, validateFixed,
  validateIncome, validateName, validateRate, validateSavings, parseRate,
} from '../services/OnboardingPlan';
import type { DraftAccount, DraftFixed, OnboardingDraft } from '../services/OnboardingPlan';
import {
  buildChecklist, helpModulesFor, isChecklistComplete, pendingCount, sanitizeGettingStarted, CHECKLIST_IDS, HELP_MODULES,
} from '../services/GettingStarted';
import type { ChecklistInput } from '../services/GettingStarted';
import { smsPermissionHelp } from '../services/SmsPermissionHelp';
import { detectBankName } from '../services/BankSmsParser';
import { formatPeriodRange } from '../services/BudgetBreakdown';
import { fixedCycleConfig, periodFor } from '../services/FixedCycle';
import type { UserSettings } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const eq = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

/** Copia mínima de parseAmount (storage.ts importa AsyncStorage y no se puede cargar acá). */
function parse(input: string): number {
  let s = input.trim().replace(/\s/g, '');
  if (!s) return NaN;
  const hasComma = s.includes(',');
  const hasDot = s.includes('.');
  if (hasComma && hasDot) {
    if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
    else s = s.replace(/,/g, '');
  } else if (hasComma) {
    const n = (s.match(/,/g) || []).length;
    if (n > 1 || /^\d{1,3},\d{3}$/.test(s)) s = s.replace(/,/g, '');
    else s = s.replace(',', '.');
  } else if (hasDot) {
    if ((s.match(/\./g) || []).length > 1) s = s.replace(/\./g, '');
  }
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const BASE: UserSettings = {
  userName: 'Usuario', userTitle: 'BudgetMaster Pro', budgetLimit: 6000, budgetLimitUSD: 800,
  budgetLimitUSDMode: 'auto', currency: 'Q', paymentCycle: 'monthly', paymentDay: 30, paymentDays: [15, 30],
  monthlyIncome: 0, monthlyIncomeUSD: 0, activeDebts: 0, activeDebtsUSD: 0, monthlySavingsGoal: 0,
  externalSavings: 1234, externalSavingsUSD: 56, preferredBanks: [], exchangeRate: 7.7, exchangeRateMode: 'auto',
  smsEnabled: true, biometricEnabled: false, geminiApiKey: '', customCategories: [], onboardingComplete: false,
  tutorialComplete: false, cardsOnboardingComplete: false, financialScoreHistory: [], activeDebtsList: [],
  smsAutoSync: true,
};

const NOW = '2026-11-12T18:00:00.000Z';
const ctxAndroid = { isAndroid: true, exchangeRate: 7.7, parse, nowIso: NOW };
const ctxIos = { ...ctxAndroid, isAndroid: false };

function draftWith(patch: Partial<OnboardingDraft>): OnboardingDraft {
  return { ...emptyDraft(), name: 'Ana', income: '7,400', paymentDay: '27', ...patch };
}

function acc(id: string, bankCode: string | null, kind: DraftAccount['kind'], extra: Partial<DraftAccount> = {}): DraftAccount {
  const bank = ONBOARDING_BANKS.find(b => b.code === bankCode);
  return {
    id, bankCode, bankLabel: bank ? bank.label : (bankCode ?? 'Efectivo'), kind, currency: 'Q',
    name: `${bankCode ?? 'Efectivo'} ${kind}`, balance: '100', ...extra,
  };
}

// ─────────────────────────────────────────────────────────────
// buildOnboardingCommit: ingreso, ciclo, metas
// ─────────────────────────────────────────────────────────────
{
  const c = buildOnboardingCommit(draftWith({}), BASE, ctxAndroid);
  const s = c.settings;
  check('mensual: paymentCycle', s.paymentCycle === 'monthly');
  check('mensual día 27 → paymentDay 27', s.paymentDay === 27);
  check('mensual conserva paymentDays base', eq(s.paymentDays, [15, 30]));
  check('ingreso Q: monthlyIncome 7400', s.monthlyIncome === 7400);
  check('ingreso Q: monthlyIncomeUSD 0', s.monthlyIncomeUSD === 0);
  check('budgetLimit = 80 % del ingreso', s.budgetLimit === 5920, String(s.budgetLimit));
  check('budgetLimitUSDMode auto', s.budgetLimitUSDMode === 'auto');
  check('onboardingComplete true', s.onboardingComplete === true);
  check('cardsOnboardingComplete true', s.cardsOnboardingComplete === true);
  check('tutorialComplete true', s.tutorialComplete === true);
  check('userName recortado', s.userName === 'Ana');
  check('externalSavings igual al de base', s.externalSavings === 1234 && s.externalSavingsUSD === 56);
  check('Android: smsEnabled true', s.smsEnabled === true);
  check('smsAutoSync por defecto true', s.smsAutoSync === true);
  check('sin cuentas: preferredBanks vacío', eq(s.preferredBanks, []));
  check('sin nada más: listas vacías', c.accounts.length === 0 && c.fixedExpenses.length === 0 && c.installments.length === 0);
  check('settings no muta base', BASE.onboardingComplete === false && BASE.monthlyIncome === 0);
}
{
  const c = buildOnboardingCommit(draftWith({ paymentCycle: 'biweekly', payDay1: '30', payDay2: '15' }), BASE, ctxAndroid);
  check('quincenal "30","15" → [15,30]', eq(c.settings.paymentDays, [15, 30]));
  check('quincenal conserva paymentDay base', c.settings.paymentDay === 30);
  check('quincenal: paymentCycle', c.settings.paymentCycle === 'biweekly');
}
{
  const c = buildOnboardingCommit(draftWith({ paymentCycle: 'weekly' }), BASE, ctxAndroid);
  check('semanal conserva día y días base', c.settings.paymentDay === 30 && eq(c.settings.paymentDays, [15, 30]));
}
{
  const c = buildOnboardingCommit(draftWith({ incomeCurrency: 'USD', income: '1000', savings: '100' }), BASE, ctxAndroid);
  check('pago USD 1000 tc 7.7 → monthlyIncome 7700', c.settings.monthlyIncome === 7700, String(c.settings.monthlyIncome));
  check('pago USD → monthlyIncomeUSD 1000', c.settings.monthlyIncomeUSD === 1000);
  check('pago USD → currency USD', c.settings.currency === 'USD');
  check('pago USD → budgetLimit 80 % de 7700', c.settings.budgetLimit === 6160, String(c.settings.budgetLimit));
  check('ahorro en USD se guarda en Q', c.settings.monthlySavingsGoal === 770, String(c.settings.monthlySavingsGoal));
}
{
  const c = buildOnboardingCommit(draftWith({ income: '' }), BASE, ctxAndroid);
  check('ingreso 0 → budgetLimit 6000×0.8', c.settings.budgetLimit === 4800, String(c.settings.budgetLimit));
}
{
  const c = buildOnboardingCommit(draftWith({ savings: '1,480' }), BASE, ctxAndroid);
  check('ahorro en Q', c.settings.monthlySavingsGoal === 1480);
}
{
  const c = buildOnboardingCommit(draftWith({}), BASE, ctxIos);
  check('iOS: smsEnabled false', c.settings.smsEnabled === false);
  const d = draftWith({}); d.sms.optOut = true;
  check('Android con optOut: smsEnabled false', buildOnboardingCommit(d, BASE, ctxAndroid).settings.smsEnabled === false);
  const e = draftWith({}); e.sms.autoSync = false; e.biometricEnabled = true; e.geminiApiKey = ' abc ';
  const s = buildOnboardingCommit(e, BASE, ctxAndroid).settings;
  check('smsAutoSync, biometría y clave pasan al ajuste', s.smsAutoSync === false && s.biometricEnabled === true && s.geminiApiKey === 'abc');
}
{
  const d = draftWith({ usd: { mode: 'manual', rate: '7,70' } });
  const s = buildOnboardingCommit(d, BASE, { ...ctxAndroid, exchangeRate: 7.9 }).settings;
  check('tipo de cambio fijo "7,70" → 7.7 manual', s.exchangeRate === 7.7 && s.exchangeRateMode === 'manual' && s.exchangeRateSource === 'Manual' && s.exchangeRateUpdatedAt === NOW);
  const a = buildOnboardingCommit(draftWith({ usd: { mode: 'auto', rate: '' } }), BASE, { ...ctxAndroid, exchangeRate: 7.9 }).settings;
  check('tipo de cambio automático usa el de ctx', a.exchangeRate === 7.9 && a.exchangeRateMode === 'auto');
  const m = buildOnboardingCommit(draftWith({ incomeCurrency: 'USD', income: '100', usd: { mode: 'manual', rate: '8' } }), BASE, ctxAndroid).settings;
  check('conversión de ingreso usa el tipo fijo', m.monthlyIncome === 800);
}

// ─────────────────────────────────────────────────────────────
// Cuentas, gastos fijos, deudas
// ─────────────────────────────────────────────────────────────
{
  const d = draftWith({
    accounts: [
      acc('onb_acc_1', 'BAC', 'bank', { balance: '1,500.50' }),
      acc('onb_acc_2', 'BAC', 'credit', { balance: '999' }),
      acc('onb_acc_3', 'BANRURAL', 'savings', { currency: 'USD', balance: '200', name: 'Banrural Ahorro $' }),
      acc('onb_acc_4', null, 'cash', { balance: '' }),
    ],
    fixed: [{ id: 'onb_fx_1', name: ' Renta ', amount: '3,000', currency: 'Q', dayOfMonth: '5', category: 'rent' }],
    debts: [
      { id: 'debt_a', name: 'Laptop', type: 'installment', monthlyPayment: '500', totalAmount: '6000', currency: 'Q', accountId: 'onb_acc_2' },
      { id: 'debt_b', name: 'Préstamo', type: 'loan', monthlyPayment: '300', totalAmount: '', currency: 'Q', accountId: 'no_existe' },
      { id: 'debt_c', name: 'Sin cuota', type: 'other', monthlyPayment: '', totalAmount: '', currency: 'Q' },
    ],
  });
  const c = buildOnboardingCommit(d, BASE, ctxAndroid);
  check('4 cuentas', c.accounts.length === 4);
  const [a1, a2, a3, a4] = c.accounts;
  check('cuenta monetaria: tipo, saldo e inicial', a1.type === 'bank' && a1.balance === 1500.5 && a1.initialBalance === 1500.5);
  check('cuenta: color e icono de ONB_TYPE_STYLE', a1.color === ONB_TYPE_STYLE.bank.color && a1.icon === ONB_TYPE_STYLE.bank.icon);
  check('cuenta activa con createdAt', a1.isActive === true && a1.createdAt === NOW);
  check('tarjeta: saldo 0 aunque el borrador tenga uno', a2.type === 'credit' && a2.balance === 0 && a2.initialBalance === 0);
  check('ahorro USD: tipo y moneda', a3.type === 'savings' && a3.currency === 'USD' && a3.balance === 200);
  check('efectivo: tipo cash, saldo vacío = 0, sin bankName', a4.type === 'cash' && a4.balance === 0 && a4.bankName === undefined);
  check('bankName = etiqueta del banco', a1.bankName === 'BAC Credomatic');
  check('BAC con 2 cuentas: sin smsLinks', a1.smsLinks === undefined && a2.smsLinks === undefined);
  check('Banrural con 1 cuenta: smsLinks BANRURAL|bank', eq(a3.smsLinks, ['BANRURAL|bank']) && a3.smsLinkedAt === NOW);
  check('preferredBanks sin repetidos', eq(c.settings.preferredBanks, ['BAC', 'BANRURAL']), JSON.stringify(c.settings.preferredBanks));
  const f = c.fixedExpenses[0];
  check('gasto fijo: campos', f.id === 'onb_fx_1' && f.name === 'Renta' && f.amount === 3000 && f.dayOfMonth === 5 && f.category === 'rent');
  check('gasto fijo: no pagado, autoRecord, activo', f.isPaid === false && f.autoRecord === true && f.isActive === true);
  check('visacuotas: solo las de cuota > 0', c.installments.length === 2);
  const [i1, i2] = c.installments;
  check('visacuota con tarjeta del borrador', i1.id === 'onb_debt_a' && i1.accountId === 'onb_acc_2');
  check('visacuota: total y cuotas', i1.totalAmount === 6000 && i1.monthlyPayment === 500 && i1.totalInstallments === 12 && i1.paidInstallments === 0);
  check('visacuota con tarjeta inexistente: accountId vacío', i2.accountId === '');
  check('visacuota sin total: 12 cuotas y total = cuota×12', i2.totalInstallments === 12 && i2.totalAmount === 3600);
  check('activeDebts suma las cuotas', c.settings.activeDebts === 800, String(c.settings.activeDebts));
  check('activeDebtsList conserva todas las deudas con la forma de siempre', c.settings.activeDebtsList?.length === 3
    && eq(Object.keys(c.settings.activeDebtsList![0]), ['id', 'name', 'type', 'monthlyPayment', 'totalAmount']));
  check('categoría de visacuota por tipo', i1.category === 'subscriptions' && i2.category === 'other');
}

// ─────────────────────────────────────────────────────────────
// Tarjetas: día de corte y de pago en el commit
// ─────────────────────────────────────────────────────────────
{
  const d = draftWith({
    accounts: [
      acc('c1', 'BAC', 'credit', { cutoffDay: '25', paymentDueDay: '10' }),
      acc('c2', 'GYT', 'credit', { cutoffDay: ' 5 ' }),
      acc('c3', 'BI', 'credit'),
      acc('c4', 'BAM', 'credit', { cutoffDay: '40', paymentDueDay: 'x' }),
      acc('b1', 'BANRURAL', 'bank', { cutoffDay: '25', paymentDueDay: '10' }),
    ],
  });
  const [c1, c2, c3, c4, b1] = buildOnboardingCommit(d, BASE, ctxAndroid).accounts;
  check('tarjeta con días: cutoffDay y paymentDueDay numéricos', c1.cutoffDay === 25 && c1.paymentDueDay === 10);
  check('tarjeta con solo corte: solo ese', c2.cutoffDay === 5 && c2.paymentDueDay === undefined);
  check('tarjeta sin días: ambos sin definir', c3.cutoffDay === undefined && c3.paymentDueDay === undefined
    && !('cutoffDay' in c3) && !('paymentDueDay' in c3));
  check('tarjeta con días inválidos: no se asignan', c4.cutoffDay === undefined && c4.paymentDueDay === undefined);
  check('cuenta que no es tarjeta nunca lleva días', b1.cutoffDay === undefined && b1.paymentDueDay === undefined);
  check('cardsOnboardingComplete sigue en true (el onboarding nuevo no pasa por CardsOnboarding)',
    buildOnboardingCommit(d, BASE, ctxAndroid).settings.cardsOnboardingComplete === true);
}

// ─────────────────────────────────────────────────────────────
// Idempotencia y vínculos SMS
// ─────────────────────────────────────────────────────────────
{
  const d = draftWith({
    accounts: [acc(newDraftId('onb_acc'), 'BAC', 'bank'), acc(newDraftId('onb_acc'), 'GYT', 'savings')],
    fixed: [{ id: newDraftId('onb_fx'), name: 'Netflix', amount: '60', currency: 'Q', dayOfMonth: '10', category: 'streaming' }],
    debts: [{ id: newDraftId('debt'), name: 'Préstamo', type: 'loan', monthlyPayment: '300', totalAmount: '', currency: 'Q' }],
  });
  const a = buildOnboardingCommit(d, BASE, ctxAndroid);
  const b = buildOnboardingCommit(d, BASE, ctxAndroid);
  check('dos builds: mismos ids de cuentas', eq(a.accounts.map(x => x.id), b.accounts.map(x => x.id)));
  check('dos builds: mismos ids de gastos fijos', eq(a.fixedExpenses.map(x => x.id), b.fixedExpenses.map(x => x.id)));
  check('dos builds: mismos ids de visacuotas', eq(a.installments.map(x => x.id), b.installments.map(x => x.id)));
  check('dos builds: resultado idéntico', eq(a, b));
  const id1 = newDraftId('onb_acc');
  const id2 = newDraftId('onb_acc');
  check('newDraftId: prefijo y forma', /^onb_acc_[0-9a-z]+_[0-9a-z]{4}$/.test(id1), id1);
  check('newDraftId: dos llamadas distintas', id1 !== id2);
}
{
  const one = smsLinksFor([acc('a1', 'BAC', 'bank')]);
  check('una cuenta de BAC → BAC|bank', eq(one.a1, ['BAC|bank']));
  const two = smsLinksFor([acc('a1', 'BAC', 'bank'), acc('a2', 'BAC', 'credit'), acc('a3', 'BI', 'bank')]);
  check('dos cuentas de BAC → []', eq(two.a1, []) && eq(two.a2, []));
  check('otro banco con una sola cuenta sí vincula', eq(two.a3, ['BI|bank']));
  check('efectivo / otro banco sin código → []', eq(smsLinksFor([acc('c1', null, 'cash')]).c1, []));
}

// ─────────────────────────────────────────────────────────────
// Catálogo de bancos
// ─────────────────────────────────────────────────────────────
for (const b of ONBOARDING_BANKS) {
  check(`detectBankName("${b.label}") === ${b.code}`, detectBankName(b.label) === b.code, detectBankName(b.label));
}
check('catálogo sin códigos repetidos', new Set(ONBOARDING_BANKS.map(b => b.code)).size === ONBOARDING_BANKS.length);
check('catálogo incluye los códigos reales de SMS', ['BAC', 'GYT', 'BANRURAL', 'BI', 'BAM', 'PROMERICA', 'BANTRAB'].every(c => ONBOARDING_BANKS.some(b => b.code === c)));
check('sugerencias de gastos fijos: 10 con categoría', FIXED_SUGGESTIONS.length === 10 && FIXED_SUGGESTIONS.every(s => s.name && s.category));

// ─────────────────────────────────────────────────────────────
// Validaciones
// ─────────────────────────────────────────────────────────────
for (const bad of ['0', '32', 'a', '15,30', '', ' ', '-1', '1.5', '100']) {
  check(`validateDay("${bad}") inválido`, !validateDay(bad).ok);
}
for (const good of ['1', '15', '31', ' 27 ']) {
  check(`validateDay("${good}") válido`, validateDay(good).ok);
}
check('validateDay con max 28', validateDay('28', 28).ok && !validateDay('29', 28).ok);
check('quincena con días iguales inválida', !validateBiweekly('15', '15').ok);
check('quincena "15" y "30" válida', validateBiweekly('15', '30').ok);
check('quincena con un día inválido', !validateBiweekly('15', '40').ok && !validateBiweekly('x', '30').ok);
check('ingreso "7,400" → 7400', validateIncome('7,400', parse).ok && parse('7,400') === 7400);
check('ingreso vacío / 0 / texto inválidos', !validateIncome('', parse).ok && !validateIncome('0', parse).ok && !validateIncome('abc', parse).ok);
check('ingreso inválido trae mensaje', !!validateIncome('0', parse).error);
check('ahorro vacío válido', validateSavings('', 7400, parse).ok);
check('ahorro 0 válido sin aviso', validateSavings('0', 7400, parse).ok && !validateSavings('0', 7400, parse).warning);
check('ahorro > ingreso → warning (no bloquea)', validateSavings('8000', 7400, parse).ok && !!validateSavings('8000', 7400, parse).warning);
check('ahorro = ingreso → warning', !!validateSavings('7400', 7400, parse).warning);
check('ahorro menor: sin warning', !validateSavings('1480', 7400, parse).warning);
check('ahorro inválido bloquea', !validateSavings('abc', 7400, parse).ok);
check('ahorro sin ingreso conocido: sin warning', !validateSavings('500', 0, parse).warning);
check('tipo de cambio "7,70" → 7.7', parseRate('7,70') === 7.7 && validateRate('7,70').ok);
check('tipo de cambio "7.70" → 7.7', parseRate('7.70') === 7.7);
check('tipo de cambio "7,705" no se lee como 7705', parseRate('7,705') === 7.705);
check('tipo de cambio inválido', !validateRate('').ok && !validateRate('0').ok && !validateRate('a').ok && !validateRate('7,7,7').ok);
check('nombre vacío / solo espacios inválido', !validateName('').ok && !validateName('   ').ok);
check('nombre de 41 letras inválido, de 40 válido', !validateName('a'.repeat(41)).ok && validateName('a'.repeat(40)).ok);

{
  const fx = (id: string, name: string, extra: Partial<DraftFixed> = {}): DraftFixed =>
    ({ id, name, amount: '100', currency: 'Q', dayOfMonth: '5', category: 'other', ...extra });
  const existing = [fx('1', 'Netflix')];
  const dup = validateFixed(fx('2', ' netflix '), existing, parse);
  check('gasto fijo con nombre repetido inválido', !dup.ok && dup.error === 'Ya agregaste netflix', dup.error);
  check('nombre repetido ignora tildes y mayúsculas', !validateFixed(fx('3', 'TELÉFONO'), [fx('1', 'Telefono')], parse).ok);
  check('editar el mismo gasto no cuenta como repetido', validateFixed(fx('1', 'Netflix'), existing, parse).ok);
  check('gasto fijo nuevo válido', validateFixed(fx('4', 'Spotify'), existing, parse).ok);
  check('gasto fijo sin monto / monto 0 / día malo inválidos',
    !validateFixed(fx('5', 'A', { amount: '' }), [], parse).ok
    && !validateFixed(fx('6', 'B', { amount: '0' }), [], parse).ok
    && !validateFixed(fx('7', 'C', { dayOfMonth: '32' }), [], parse).ok);
  check('gasto fijo sin nombre inválido', !validateFixed(fx('8', ' '), [], parse).ok);
}
{
  check('cuenta sin nombre inválida', !validateAccount(acc('a', 'BAC', 'bank', { name: ' ' }), parse).ok);
  check('cuenta con saldo vacío = válida', validateAccount(acc('a', 'BAC', 'bank', { balance: '' }), parse).ok);
  const bad = validateAccount(acc('a', 'BAC', 'bank', { balance: 'abc' }), parse);
  check('cuenta con saldo inválido: mensaje', !bad.ok && bad.error === 'Ingresá un saldo válido');
  check('tarjeta ignora el saldo', validateAccount(acc('a', 'BAC', 'credit', { balance: 'abc' }), parse).ok);

  // Día de corte y de pago de la tarjeta (opcionales, 1..31)
  const card = (extra: Partial<DraftAccount>) => acc('c', 'BAC', 'credit', extra);
  check('tarjeta sin días (campos ausentes) = válida', validateAccount(card({}), parse).ok);
  check('tarjeta con días vacíos = válida', validateAccount(card({ cutoffDay: '', paymentDueDay: '' }), parse).ok);
  check('tarjeta con corte 25 y pago 10 = válida', validateAccount(card({ cutoffDay: '25', paymentDueDay: '10' }), parse).ok);
  check('tarjeta con solo corte = válida', validateAccount(card({ cutoffDay: '25' }), parse).ok);
  check('tarjeta con 1 y 31 = válida', validateAccount(card({ cutoffDay: '1', paymentDueDay: '31' }), parse).ok);
  for (const bad of ['0', '32', '99', 'a', '2.5', '-3']) {
    const vc = validateAccount(card({ cutoffDay: bad }), parse);
    check(`corte «${bad}» inválido con su mensaje`, !vc.ok && vc.error === 'El día de corte debe ser un número entre 1 y 31.', JSON.stringify(vc));
    const vp = validateAccount(card({ paymentDueDay: bad }), parse);
    check(`pago «${bad}» inválido con su mensaje`, !vp.ok && vp.error === 'El día de pago debe ser un número entre 1 y 31.', JSON.stringify(vp));
  }
  check('días en una cuenta que no es tarjeta se ignoran', validateAccount(acc('a', 'BAC', 'bank', { cutoffDay: '99', paymentDueDay: 'x' }), parse).ok);
}
{
  const d = draftWith({});
  check('canContinueRequired paso 0 (nombre)', canContinueRequired(d, 0, parse) && !canContinueRequired(draftWith({ name: ' ' }), 0, parse));
  check('canContinueRequired paso 1 (ingreso)', canContinueRequired(d, 1, parse) && !canContinueRequired(draftWith({ income: '0' }), 1, parse));
  check('canContinueRequired paso 2 mensual', canContinueRequired(d, 2, parse) && !canContinueRequired(draftWith({ paymentDay: '' }), 2, parse));
  check('canContinueRequired paso 2 quincenal', canContinueRequired(draftWith({ paymentCycle: 'biweekly' }), 2, parse)
    && !canContinueRequired(draftWith({ paymentCycle: 'biweekly', payDay1: '15', payDay2: '15' }), 2, parse));
  check('canContinueRequired paso 2 semanal/irregular no pide día',
    canContinueRequired(draftWith({ paymentCycle: 'weekly', paymentDay: '' }), 2, parse)
    && canContinueRequired(draftWith({ paymentCycle: 'irregular', paymentDay: '' }), 2, parse));
  check('canContinueRequired paso 3 (ahorro vacío ok, inválido no)', canContinueRequired(d, 3, parse) && !canContinueRequired(draftWith({ savings: 'x' }), 3, parse));
}

// ─────────────────────────────────────────────────────────────
// periodSentence y dueLabel
// ─────────────────────────────────────────────────────────────
const now = new Date(2026, 10, 12, 12, 0); // 12 nov 2026
{
  const cfg = fixedCycleConfig({ paymentCycle: 'monthly', paymentDay: 27, paymentDays: [15, 30] });
  const range = formatPeriodRange(periodFor(cfg, now));
  check('ancla 27, hoy 12 nov → «27 oct – 26 nov»', range === '27 oct – 26 nov', range);
  const m = periodSentence('monthly', range, range);
  check('mensual: título con el rango', m.title === 'Tu período de presupuesto: 27 oct – 26 nov', m.title);
  check('mensual: cuerpo explica gastos fijos', m.body.includes('una vez por período'));

  const lbl = dueLabel(5, cfg, now);
  check('día 5 vence «5 nov» dentro del período', lbl === 'Vence el 5 nov, dentro de tu período 27 oct – 26 nov', lbl);
  check('día 28 vence «28 oct»', dueLabel(28, cfg, now).startsWith('Vence el 28 oct,'), dueLabel(28, cfg, now));
  check('día 27 vence «27 oct»', dueLabel(27, cfg, now).startsWith('Vence el 27 oct,'));
}
{
  const cfg31 = { anchorDay: 31 };
  const feb = new Date(2026, 1, 15, 12, 0);
  const range = formatPeriodRange(periodFor(cfg31, feb));
  check('ancla 31 en febrero se recorta («31 ene – 27 feb»)', range === '31 ene – 27 feb', range);
  const mar = new Date(2026, 1, 28, 12, 0);
  check('ancla 31, 28 feb: arranca el 28 feb', formatPeriodRange(periodFor(cfg31, mar)).startsWith('28 feb'), formatPeriodRange(periodFor(cfg31, mar)));
  check('dueLabel ancla 31 día 31', dueLabel(31, cfg31, feb).startsWith('Vence el 31 ene,'), dueLabel(31, cfg31, feb));
}
{
  const bw = { paymentCycle: 'biweekly' as const, paymentDay: 30, paymentDays: [15, 30] };
  const nov20 = new Date(2026, 10, 20, 12, 0); // entre el 15 y el 29: quincena «15 nov – 29 nov»
  const fixedRange = formatPeriodRange(periodFor(fixedCycleConfig(bw), nov20));
  check('quincenal 15/30: período de fijos «15 nov – 14 dic»', fixedRange === '15 nov – 14 dic', fixedRange);
  const q = periodSentence('biweekly', '15 nov – 29 nov', fixedRange);
  check('quincenal: título', q.title === 'Tu presupuesto se mide por quincena: 15 nov – 29 nov', q.title);
  check('quincenal: cuerpo «del 15 nov al 14 dic»', q.body === 'Tus gastos fijos se cuentan una vez al mes, del 15 nov al 14 dic.', q.body);

  const w = periodSentence('weekly', '8 nov – 14 nov', '1 nov – 30 nov');
  check('semanal: domingo a sábado', w.title === 'Tu semana de presupuesto va de domingo a sábado: 8 nov – 14 nov', w.title);
  check('semanal: fijos por mes calendario', w.body === 'Los gastos fijos se cuentan por mes calendario (1 nov – 30 nov).', w.body);

  const irr = periodSentence('irregular', '1 nov – 30 nov', '1 nov – 30 nov');
  check('irregular: mes calendario', irr.title === 'Usamos el mes calendario: 1 nov – 30 nov', irr.title);
  const wk = fixedCycleConfig({ paymentCycle: 'weekly', paymentDay: 30, paymentDays: [15, 30] });
  check('semanal: fijos en mes calendario', formatPeriodRange(periodFor(wk, now)) === '1 nov – 30 nov');
}

// ─────────────────────────────────────────────────────────────
// optionalSteps y needsUsd
// ─────────────────────────────────────────────────────────────
{
  const full = optionalSteps({ isAndroid: true, biometricAvailable: true, needsUsd: true });
  check('Android con todo: 8 pasos en orden (income va tras accounts)', eq(full, ['accounts', 'income', 'fixed', 'debts', 'usd', 'sms', 'security', 'gemini']), JSON.stringify(full));
  const ios = optionalSteps({ isAndroid: false, biometricAvailable: true, needsUsd: false });
  check('iOS: sin paso sms', !ios.includes('sms'));
  check('sin dólares: sin paso usd', !ios.includes('usd'));
  const noSensor = optionalSteps({ isAndroid: true, biometricAvailable: false, needsUsd: false });
  check('sin sensor: sin paso security', !noSensor.includes('security'));
  check('mínimo: cuentas, SMS del pago, fijos, deudas y asesor', eq(optionalSteps({ isAndroid: false, biometricAvailable: false, needsUsd: false }), ['accounts', 'income', 'fixed', 'debts', 'gemini']));

  check('needsUsd: borrador vacío no', !needsUsd(emptyDraft()));
  check('needsUsd: usesUsd', needsUsd(draftWith({ usesUsd: true })));
  check('needsUsd: ingreso en USD', needsUsd(draftWith({ incomeCurrency: 'USD' })));
  check('needsUsd: cuenta en USD', needsUsd(draftWith({ accounts: [acc('a', 'BAC', 'bank', { currency: 'USD' })] })));
  check('needsUsd: gasto fijo en USD', needsUsd(draftWith({ fixed: [{ id: 'f', name: 'x', amount: '1', currency: 'USD', dayOfMonth: '1', category: 'other' }] })));
  check('needsUsd: deuda en USD', needsUsd(draftWith({ debts: [{ id: 'd', name: 'x', type: 'loan', monthlyPayment: '1', totalAmount: '', currency: 'USD' }] })));
}

// ─────────────────────────────────────────────────────────────
// sanitizeDraft
// ─────────────────────────────────────────────────────────────
{
  const full = draftWith({
    phase: 'optional', step: 2, usesUsd: true, usd: { mode: 'manual', rate: '7.8' },
    accounts: [acc('onb_acc_1', 'BAC', 'bank'), acc('onb_acc_2', null, 'cash', { bankLabel: 'Efectivo' })],
    fixed: [{ id: 'onb_fx_1', name: 'Renta', amount: '3000', currency: 'Q', dayOfMonth: '5', category: 'rent' }],
    debts: [
      { id: 'debt_1', name: 'Laptop', type: 'installment', monthlyPayment: '500', totalAmount: '6000', currency: 'Q', accountId: 'onb_acc_1' },
      { id: 'debt_2', name: 'Préstamo', type: 'loan', monthlyPayment: '300', totalAmount: '', currency: 'USD' },
    ],
    geminiApiKey: 'x'.repeat(30), biometricEnabled: true,
  });
  const round = sanitizeDraft(JSON.parse(JSON.stringify(full)));
  check('borrador válido sale igual', round !== null && eq(round, full));
  const emp = sanitizeDraft(JSON.parse(JSON.stringify(emptyDraft())));
  check('borrador vacío sale igual', emp !== null && eq(emp, emptyDraft()));

  check('null → null', sanitizeDraft(null) === null);
  check('undefined → null', sanitizeDraft(undefined) === null);
  check('texto → null', sanitizeDraft('hola') === null);
  check('número → null', sanitizeDraft(42) === null);
  check('arreglo → null', sanitizeDraft([]) === null);
  check('objeto vacío → null', sanitizeDraft({}) === null);
  check('v distinto → null', sanitizeDraft({ ...full, v: 2 }) === null);
  check('sin v → null', sanitizeDraft({ ...full, v: undefined }) === null);
  check('fase desconocida → null', sanitizeDraft({ ...full, phase: 'otra' }) === null);
  check('paso negativo → null', sanitizeDraft({ ...full, step: -1 }) === null);
  check('paso decimal → null', sanitizeDraft({ ...full, step: 1.5 }) === null);
  check('ciclo desconocido → null', sanitizeDraft({ ...full, paymentCycle: 'diario' }) === null);
  check('cuentas que no son lista → null', sanitizeDraft({ ...full, accounts: 'x' }) === null);
  check('cuenta con tipo inválido → null', sanitizeDraft({ ...full, accounts: [{ ...full.accounts[0], kind: 'oro' }] }) === null);
  check('gasto fijo con campo faltante → null', sanitizeDraft({ ...full, fixed: [{ id: 'x' }] }) === null);
  check('deuda con tipo inválido → null', sanitizeDraft({ ...full, debts: [{ ...full.debts[0], type: 'zzz' }] }) === null);
  check('usd con modo inválido → null', sanitizeDraft({ ...full, usd: { mode: 'x', rate: '1' } }) === null);
  check('sms incompleto → null', sanitizeDraft({ ...full, sms: { optOut: true } }) === null);
  check('moneda inválida → null', sanitizeDraft({ ...full, incomeCurrency: 'EUR' }) === null);
  check('claves extra se descartan', !('extra' in (sanitizeDraft({ ...full, extra: 1 }) as object)));

  // Días de la tarjeta: un borrador viejo (sin los campos) sigue siendo válido
  const oldCard = { ...acc('onb_acc_9', 'BAC', 'credit') };
  const sOld = sanitizeDraft({ ...JSON.parse(JSON.stringify(full)), accounts: [oldCard] });
  check('borrador viejo sin cutoffDay/paymentDueDay sigue válido', sOld !== null && sOld.accounts.length === 1
    && !('cutoffDay' in sOld.accounts[0]) && !('paymentDueDay' in sOld.accounts[0]));
  const sNew = sanitizeDraft({ ...JSON.parse(JSON.stringify(full)), accounts: [{ ...oldCard, cutoffDay: '25', paymentDueDay: '10' }] });
  check('borrador con días los conserva', sNew !== null && sNew.accounts[0].cutoffDay === '25' && sNew.accounts[0].paymentDueDay === '10');
  const sBad = sanitizeDraft({ ...JSON.parse(JSON.stringify(full)), accounts: [{ ...oldCard, cutoffDay: 25, paymentDueDay: { x: 1 } }] });
  check('día que no es texto: se descarta el campo, no la cuenta', sBad !== null && sBad.accounts.length === 1
    && sBad.accounts[0].id === 'onb_acc_9' && !('cutoffDay' in sBad.accounts[0]) && !('paymentDueDay' in sBad.accounts[0]));
}

// ─────────────────────────────────────────────────────────────
// GettingStarted
// ─────────────────────────────────────────────────────────────
{
  const base: ChecklistInput = {
    accountsCount: 0, creditCardsCount: 0, cardsMissingDatesCount: 0, incomePatternCount: 0, fixedCount: 0, isAndroid: true, smsOn: true, smsSynced: false, biometricAvailable: true,
    biometricEnabled: false, geminiKey: '', tourDone: false, skipped: [],
  };
  const get = (i: ChecklistInput, id: string) => buildChecklist(i).find(x => x.id === id)!;

  const items = buildChecklist(base);
  check('checklist: 8 ítems en orden (card_dates justo después de accounts)', eq(items.map(i => i.id), ['tour', 'accounts', 'card_dates', 'income', 'fixed', 'sms', 'biometric', 'gemini']));
  check('CHECKLIST_IDS coincide con el orden del checklist', eq(CHECKLIST_IDS, items.map(i => i.id)));
  check('checklist inicial (sin tarjetas): 7 pendientes, card_dates no cuenta', pendingCount(items, []) === 7);
  check('checklist: todos con título y pista', items.every(i => i.title.length > 0 && i.hint.length > 0));
  check('checklist: nada hecho; solo card_dates oculto (sin tarjetas)', items.every(i => !i.done || i.id === 'card_dates') && eq(items.filter(i => i.hidden).map(i => i.id), ['card_dates']));

  // card_dates: oculto sin tarjetas, pendiente con tarjetas sin días, hecho cuando ya no falta ninguna
  const cdNone = get(base, 'card_dates');
  check('card_dates: título y pista', cdNone.title === 'Configurar corte y pago de tus tarjetas'
    && cdNone.hint === 'Con el día de corte y el de pago recibes el recordatorio de pago y ves tu capacidad de pago.');
  check('card_dates oculto sin tarjetas', cdNone.hidden);
  const cdPending = get({ ...base, accountsCount: 1, creditCardsCount: 1, cardsMissingDatesCount: 1 }, 'card_dates');
  check('card_dates pendiente: visible y sin hacer', !cdPending.hidden && !cdPending.done);
  const cdDone = get({ ...base, accountsCount: 1, creditCardsCount: 2, cardsMissingDatesCount: 0 }, 'card_dates');
  check('card_dates hecho: visible y hecho cuando ninguna tarjeta falta', !cdDone.hidden && cdDone.done);
  check('card_dates pendiente cuenta como pendiente (8 con tarjeta sin días)',
    pendingCount(buildChecklist({ ...base, creditCardsCount: 1, cardsMissingDatesCount: 1 }), []) === 8);
  check('card_dates: «No me interesa» la saca de los pendientes',
    pendingCount(buildChecklist({ ...base, creditCardsCount: 1, cardsMissingDatesCount: 1 }), ['card_dates']) === 7);
  check('sanitizeGettingStarted acepta card_dates en skipped',
    eq(sanitizeGettingStarted({ v: 1, dismissed: false, collapsed: false, skipped: ['card_dates'], tourDeferred: false, createdAt: NOW })?.skipped, ['card_dates']));

  check('tour hecho', get({ ...base, tourDone: true }, 'tour').done);
  check('cuentas hechas con 1', get({ ...base, accountsCount: 1 }, 'accounts').done);
  check('gastos fijos hechos con 1', get({ ...base, fixedCount: 1 }, 'fixed').done);
  check('sms oculto en iOS', get({ ...base, isAndroid: false }, 'sms').hidden);
  check('sms oculto con SMS apagado', get({ ...base, smsOn: false }, 'sms').hidden);
  check('sms hecho si hubo sincronización', get({ ...base, smsSynced: true }, 'sms').done);
  check('biometría oculta sin sensor', get({ ...base, biometricAvailable: false }, 'biometric').hidden);
  check('biometría hecha si está activa', get({ ...base, biometricEnabled: true }, 'biometric').done);
  check('gemini no hecho con clave de 20', !get({ ...base, geminiKey: 'x'.repeat(20) }, 'gemini').done);
  check('gemini hecho con clave de 21', get({ ...base, geminiKey: 'x'.repeat(21) }, 'gemini').done);

  const hid = buildChecklist({ ...base, isAndroid: false, biometricAvailable: false });
  check('ocultos no cuentan como pendientes', pendingCount(hid, []) === 5);
  check('skipped no cuenta como pendiente', pendingCount(items, ['gemini', 'tour']) === 5);
  check('hechos no cuentan como pendientes', pendingCount(buildChecklist({ ...base, accountsCount: 2, tourDone: true }), []) === 5);
  check('no completa con pendientes', !isChecklistComplete(items, []));
  check('completa con todo saltado', isChecklistComplete(items, ['tour', 'accounts', 'card_dates', 'income', 'fixed', 'sms', 'biometric', 'gemini']));
  const allDone = buildChecklist({ ...base, accountsCount: 1, incomePatternCount: 1, fixedCount: 1, smsSynced: true, biometricEnabled: true, geminiKey: 'x'.repeat(25), tourDone: true });
  check('completa con todo hecho', isChecklistComplete(allDone, []));
  check('completa con mezcla de hechos, ocultos y saltados',
    isChecklistComplete(buildChecklist({ ...base, isAndroid: false, biometricAvailable: false, accountsCount: 1, tourDone: true }), ['income', 'fixed', 'gemini']));

  const ids = new Set(HELP_MODULES.map(m => m.tutorialId));
  check('HELP_MODULES: 17 ids únicos', HELP_MODULES.length === 17 && ids.size === 17);
  check('HELP_MODULES: ids reales de Tutorial.ts', ['tour_inicial', 'tutorial_inicio', 'tutorial_movimientos', 'tutorial_agregar', 'tutorial_presupuesto',
    'tutorial_cuentas', 'tutorial_stats', 'tutorial_ia', 'tutorial_ajustes', 'tutorial_sms', 'tutorial_periodo', 'tutorial_sueldo', 'tutorial_visacuotas', 'tutorial_compra_tarjeta', 'tutorial_pago_tarjeta', 'tutorial_saldos', 'tutorial_widget'].every(id => ids.has(id)));
  check('HELP_MODULES: el widget no requiere SMS', HELP_MODULES.find(m => m.tutorialId === 'tutorial_widget')?.requiresSms !== true);
  check('helpModulesFor(false) sin tutorial_sms', !helpModulesFor(false).some(m => m.tutorialId === 'tutorial_sms') && helpModulesFor(false).length === 16);
  check('helpModulesFor(true) con tutorial_sms', helpModulesFor(true).some(m => m.tutorialId === 'tutorial_sms') && helpModulesFor(true).length === 17);

  const st = { v: 1, dismissed: false, collapsed: true, skipped: ['tour', 'zzz'], tourDeferred: true, createdAt: NOW };
  const san = sanitizeGettingStarted(st);
  check('sanitizeGettingStarted válido filtra ids desconocidos', san !== null && eq(san.skipped, ['tour']) && san.collapsed && san.tourDeferred);
  check('sanitizeGettingStarted basura → null', sanitizeGettingStarted(null) === null && sanitizeGettingStarted({ v: 2 }) === null && sanitizeGettingStarted({ ...st, dismissed: 'no' }) === null);
}

// ─────────────────────────────────────────────────────────────
// smsPermissionHelp (mismos textos que el Dashboard)
// ─────────────────────────────────────────────────────────────
{
  const a33 = smsPermissionHelp({ apiLevel: 33, instantDenial: true, manufacturer: 'Google' });
  check('API 33 con instantDenial: 4 pasos', a33.steps.length === 4);
  check('API 33 con instantDenial: mensaje de configuración restringida', a33.message.startsWith('Android bloqueó el permiso sin preguntarte.') && a33.message.includes('«configuración restringida»'));
  check('API 33: paso 2 menciona «Permitir configuración restringida»', a33.steps[1].includes('«Permitir configuración restringida»'));
  check('Google: sin nota', a33.footnote === undefined);

  const honor = smsPermissionHelp({ apiLevel: 34, instantDenial: true, manufacturer: 'HONOR' });
  check('Honor: nota MagicOS', !!honor.footnote && honor.footnote.startsWith('En Honor/MagicOS'));
  check('Huawei: nota', !!smsPermissionHelp({ apiLevel: 30, instantDenial: false, manufacturer: 'Huawei' }).footnote);

  const a30 = smsPermissionHelp({ apiLevel: 30, instantDenial: true, manufacturer: 'Samsung' });
  check('API 30: 3 pasos', a30.steps.length === 3);
  check('API 30 con instantDenial: mensaje de «No volver a preguntar»', a30.message.includes('«No volver a preguntar»'));
  check('API 33 sin instantDenial: mensaje de «No volver a preguntar»', smsPermissionHelp({ apiLevel: 33, instantDenial: false, manufacturer: '' }).message.includes('«No volver a preguntar»'));
  const nul = smsPermissionHelp({ apiLevel: null, instantDenial: false, manufacturer: '' });
  check('apiLevel null: 3 pasos', nul.steps.length === 3);
  check('último paso invita a sincronizar de nuevo', a33.steps[3] === 'Volvé a BudgetMaster y tocá sincronizar de nuevo.');
}

if (failures > 0) {
  console.log(`\n${failures} FALLA(S) de ${checks} comprobaciones`);
  process.exit(1);
}
console.log(`OK  ${checks} comprobaciones`);
