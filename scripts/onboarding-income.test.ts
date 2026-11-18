process.env.TZ = 'America/Guatemala';
// Pruebas del paso «SMS de tu pago» del onboarding (B5): la fuente de ingreso principal que arma el commit,
// el borrador con/sin muestra y el pendiente de la guía del Inicio. Sin dependencias:
//   npm run test:onboarding-income   →   sucrase-node scripts/onboarding-income.test.ts

import {
  ONB_INCOME_SOURCE_ID, buildOnboardingCommit, emptyDraft, optionalSteps, sanitizeDraft,
} from '../services/OnboardingPlan';
import type { OnboardingDraft } from '../services/OnboardingPlan';
import { buildChecklist, isChecklistComplete, pendingCount } from '../services/GettingStarted';
import type { ChecklistInput } from '../services/GettingStarted';
import type { IncomeSource, UserSettings } from '../services/storage';

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
  if (s.includes(',') && s.includes('.')) s = s.replace(/,/g, '');
  else if (s.includes(',')) s = /^\d{1,3},\d{3}$/.test(s) ? s.replace(/,/g, '') : s.replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

const BASE: UserSettings = {
  userName: 'Usuario', userTitle: 'BudgetMaster Pro', budgetLimit: 6000, budgetLimitUSD: 800,
  budgetLimitUSDMode: 'auto', currency: 'Q', paymentCycle: 'monthly', paymentDay: 30, paymentDays: [15, 30],
  monthlyIncome: 0, monthlyIncomeUSD: 0, activeDebts: 0, activeDebtsUSD: 0, monthlySavingsGoal: 0,
  externalSavings: 0, externalSavingsUSD: 0, preferredBanks: [], exchangeRate: 7.7, exchangeRateMode: 'auto',
  smsEnabled: true, biometricEnabled: false, geminiApiKey: '', customCategories: [], onboardingComplete: false,
  tutorialComplete: false, cardsOnboardingComplete: false, financialScoreHistory: [], activeDebtsList: [],
  smsAutoSync: true,
};

const NOW = '2026-11-12T18:00:00.000Z';
const ctx = { isAndroid: true, exchangeRate: 7.7, parse, nowIso: NOW };

// SMS reales de Banrural (los mismos de income-sources.test.ts; no se tocan sus datos).
const SMS_A = 'BANRURAL: Recibiste Q7,426.61 en tu cuenta Monetaria *** ****5051 de SECCION DE OPERACIONES DE DEPOSITOS, el 27/10/2026 a las 10:31.';
const SMS_B = 'BANRURAL: Amigo, se acredito a tu Cuenta Monetaria ****5051  Q. 7,426.60  en: SECCION DE OPERACIONES DE DEPOSITOS';

function draftWith(patch: Partial<OnboardingDraft>): OnboardingDraft {
  return { ...emptyDraft(), name: 'Ana', income: '7,400', paymentDay: '27', ...patch };
}

const sourceOf = (d: OnboardingDraft, c = ctx): IncomeSource => {
  const list = buildOnboardingCommit(d, BASE, c).incomeSources;
  check('el commit trae exactamente una fuente', list.length === 1, String(list.length));
  return list[0];
};

// ─────────────────────────────────────────────────────────────
// Con muestra confirmada
// ─────────────────────────────────────────────────────────────
console.log('Fuente con SMS de ejemplo');
{
  const d = draftWith({ incomeSample: { body: SMS_A, confirmed: true } });
  const src = sourceOf(d);
  check('id determinístico onb_income_main', src.id === 'onb_income_main' && src.id === ONB_INCOME_SOURCE_ID);
  check('mensual: nombre Sueldo, día 27, base, ancla el período',
    src.name === 'Sueldo' && src.frequency === 'monthly' && eq(src.days, [27]) && src.role === 'base' && src.anchorsPeriod === true,
    JSON.stringify(src));
  check('monto del ingreso (7,400) en Q y categoría de sueldo', src.amount === 7400 && src.currency === 'Q' && src.category === 'salary');
  check('activa y con fecha del commit', src.isActive && src.createdAt === NOW);
  check('aprendió el patrón: BANRURAL, cuenta 5051, quién envía',
    !!src.pattern && src.pattern.bank === 'BANRURAL' && src.pattern.acctKey === '5051'
    && src.pattern.originKey === 'seccion de operaciones de depositos', JSON.stringify(src.pattern));
  check('el SMS guardado va enmascarado (sin la cuenta)', !!src.pattern && src.pattern.sampleMasked.indexOf('5051') < 0);
  check('monto del patrón 7426.61', !!src.pattern && src.pattern.amount === 7426.61);

  // Idempotente: repetir el commit da lo mismo (mismo id, mismo contenido) y un upsert por id no duplica.
  const again = sourceOf(d);
  check('commit repetido: la misma fuente exacta', eq(src, again));
  const stored: IncomeSource[] = [src];
  const upsert = (all: IncomeSource[], items: IncomeSource[]): IncomeSource[] => {
    const ids = new Set(items.map(i => i.id));
    return [...all.filter(a => !ids.has(a.id)), ...items];
  };
  const afterTwice = upsert(upsert(stored, [again]), [again]);
  check('upsert dos veces sigue siendo una sola fuente', afterTwice.length === 1);

  const other = buildOnboardingCommit(d, BASE, ctx);
  check('el commit conserva settings, cuentas, fijos y visacuotas',
    other.settings.onboardingComplete === true && Array.isArray(other.accounts) && Array.isArray(other.fixedExpenses) && Array.isArray(other.installments));
}

// ─────────────────────────────────────────────────────────────
// Sin muestra / muestra sin confirmar / muestra inservible
// ─────────────────────────────────────────────────────────────
console.log('Fuente sin patrón');
{
  const none = sourceOf(draftWith({}));
  check('sin muestra: la fuente se crea igual, sin patrón', none.id === 'onb_income_main' && none.pattern === undefined && eq(none.days, [27]));
  check('sin muestra: la clave pattern no existe', !('pattern' in none));
  const unconfirmed = sourceOf(draftWith({ incomeSample: { body: SMS_A, confirmed: false } }));
  check('muestra sin confirmar: sin patrón', unconfirmed.pattern === undefined);
  const junk = sourceOf(draftWith({ incomeSample: { body: 'Hola, nos vemos mañana a las 5 en el parque', confirmed: true } }));
  check('muestra que no es un SMS bancario: sin patrón y sin romper', junk.pattern === undefined && junk.id === 'onb_income_main');
  const blank = sourceOf(draftWith({ incomeSample: { body: '   ', confirmed: true } }));
  check('muestra vacía: sin patrón', blank.pattern === undefined);
}

// ─────────────────────────────────────────────────────────────
// Cada persona cobra distinto: nada hardcodeado
// ─────────────────────────────────────────────────────────────
console.log('Distintas formas de cobrar');
{
  const bi = sourceOf(draftWith({ paymentCycle: 'biweekly', payDay1: '30', payDay2: '15', income: '8,000' }));
  check('quincenal: días ordenados, mitad por pago, ancla el período',
    bi.name === 'Quincena' && bi.frequency === 'biweekly' && eq(bi.days, [15, 30]) && bi.amount === 4000 && bi.anchorsPeriod, JSON.stringify(bi));

  const wk = sourceOf(draftWith({ paymentCycle: 'weekly', income: '5,200', incomeSample: { body: SMS_A, confirmed: true } }));
  check('semanal con muestra: el día de la semana sale del SMS (martes = 2), no ancla',
    wk.frequency === 'weekly' && eq(wk.days, [2]) && wk.anchorsPeriod === false && wk.amount === 1200, JSON.stringify(wk));
  const wkNo = sourceOf(draftWith({ paymentCycle: 'weekly', income: '5,200' }));
  check('semanal sin muestra: sin día inventado', eq(wkNo.days, []) && wkNo.pattern === undefined);

  const irr = sourceOf(draftWith({ paymentCycle: 'irregular', income: '3,000' }));
  check('irregular (ventas): sin días, no ancla, monto declarado',
    irr.frequency === 'irregular' && eq(irr.days, []) && irr.anchorsPeriod === false && irr.amount === 3000 && irr.name === 'Mis ingresos');

  const usd = sourceOf(draftWith({ incomeCurrency: 'USD', income: '1000' }));
  check('ingreso en dólares: la fuente queda en USD con el monto declarado', usd.currency === 'USD' && usd.amount === 1000);

  const edited = sourceOf(draftWith({
    incomeSample: { body: SMS_A, confirmed: true, edit: { originText: 'EMPRESA EJEMPLO SA', amount: 7000 } },
  }));
  check('la corrección del usuario se repite al armar el commit',
    !!edited.pattern && edited.pattern.originLabel === 'EMPRESA EJEMPLO SA' && edited.pattern.amount === 7000
    && edited.pattern.originKey === 'empresa ejemplo sa', JSON.stringify(edited.pattern));
}

// ─────────────────────────────────────────────────────────────
// Los dos SMS reales de Banrural dan el mismo patrón en el commit
// ─────────────────────────────────────────────────────────────
console.log('Dos formatos de Banrural');
{
  const a = sourceOf(draftWith({ incomeSample: { body: SMS_A, confirmed: true } }));
  const b = sourceOf(draftWith({ incomeSample: { body: SMS_B, confirmed: true } }));
  check('ambos aprenden', !!a.pattern && !!b.pattern);
  if (a.pattern && b.pattern) {
    check('mismo banco, cuenta y quién envía',
      a.pattern.bank === b.pattern.bank && a.pattern.acctKey === b.pattern.acctKey
      && a.pattern.originKey === b.pattern.originKey && a.pattern.originLabel === b.pattern.originLabel,
      `${JSON.stringify(a.pattern)} / ${JSON.stringify(b.pattern)}`);
    check('monto parecido (los centavos varían)', Math.abs(a.pattern.amount - b.pattern.amount) < 0.05);
  }
}

// ─────────────────────────────────────────────────────────────
// Borrador: viejos sin incomeSample siguen válidos
// ─────────────────────────────────────────────────────────────
console.log('Borrador');
{
  const old = JSON.parse(JSON.stringify(emptyDraft())) as Record<string, unknown>;
  delete old.incomeSample;
  const s = sanitizeDraft(old);
  check('borrador viejo (sin incomeSample) sigue válido', s !== null && !('incomeSample' in s), JSON.stringify(s));

  const withSample = draftWith({ phase: 'optional', step: 1, incomeSample: { body: SMS_A, confirmed: true, edit: { originText: 'X', amount: 10 } } });
  const round = sanitizeDraft(JSON.parse(JSON.stringify(withSample)));
  check('borrador con muestra sale igual', round !== null && eq(round, withSample));
  const plain = draftWith({ incomeSample: { body: SMS_B, confirmed: false } });
  check('muestra sin confirmar también sale igual', eq(sanitizeDraft(JSON.parse(JSON.stringify(plain))), plain));

  const badSample = sanitizeDraft({ ...JSON.parse(JSON.stringify(emptyDraft())), incomeSample: { body: 5, confirmed: 'si' } });
  check('muestra mal formada se descarta sin invalidar el borrador', badSample !== null && !('incomeSample' in badSample));
  const badEdit = sanitizeDraft({ ...JSON.parse(JSON.stringify(emptyDraft())), incomeSample: { body: 'x', confirmed: true, edit: { originText: 1, amount: 'a' } } });
  check('corrección mal formada también se descarta', badEdit !== null && !('incomeSample' in badEdit));
  check('un borrador con basura sigue rechazándose', sanitizeDraft({ v: 1, incomeSample: { body: 'x', confirmed: true } }) === null);
}

// ─────────────────────────────────────────────────────────────
// Pasos del onboarding
// ─────────────────────────────────────────────────────────────
console.log('Pasos');
{
  for (const isAndroid of [true, false]) {
    for (const biometricAvailable of [true, false]) {
      for (const needsUsd of [true, false]) {
        const ids = optionalSteps({ isAndroid, biometricAvailable, needsUsd });
        check(`income va justo después de accounts (android=${isAndroid}, bio=${biometricAvailable}, usd=${needsUsd})`,
          ids[0] === 'accounts' && ids[1] === 'income');
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Guía del Inicio
// ─────────────────────────────────────────────────────────────
console.log('Guía del Inicio');
{
  const base: ChecklistInput = {
    accountsCount: 0, incomePatternCount: 0, fixedCount: 0, isAndroid: true, smsOn: true, smsSynced: false,
    biometricAvailable: true, biometricEnabled: false, geminiKey: '', tourDone: false, skipped: [],
  };
  const get = (i: ChecklistInput) => buildChecklist(i).find(x => x.id === 'income')!;
  const without = get(base);
  check('sin fuente con patrón: pendiente', !without.done && !without.hidden);
  check('título «Enseñarle a la app tu pago»', without.title === 'Enseñarle a la app tu pago' && without.hint.length > 0);
  check('con una fuente con patrón: hecho', get({ ...base, incomePatternCount: 1 }).done);
  check('visible también en iOS y con SMS apagado (se puede pegar el texto)',
    !get({ ...base, isAndroid: false, smsOn: false }).hidden);
  check('va justo después de cuentas', eq(buildChecklist(base).map(i => i.id).slice(0, 3), ['tour', 'accounts', 'income']));
  check('«No me interesa» lo saca de los pendientes',
    pendingCount(buildChecklist(base), ['income']) === pendingCount(buildChecklist(base), []) - 1);
  check('queda en la guía hasta completarse: la checklist no está completa sin el patrón',
    !isChecklistComplete(buildChecklist({ ...base, accountsCount: 1, fixedCount: 1, smsSynced: true, biometricEnabled: true, geminiKey: 'x'.repeat(25), tourDone: true }), []));
  check('con el patrón y todo lo demás hecho, la checklist se completa',
    isChecklistComplete(buildChecklist({ ...base, accountsCount: 1, incomePatternCount: 1, fixedCount: 1, smsSynced: true, biometricEnabled: true, geminiKey: 'x'.repeat(25), tourDone: true }), []));
}

if (failures > 0) {
  console.log(`\n${failures} FALLA(S) de ${checks} comprobaciones`);
  process.exit(1);
}
console.log(`OK  ${checks} comprobaciones`);
