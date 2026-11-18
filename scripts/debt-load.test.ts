process.env.TZ = 'America/Guatemala';
// Pruebas de la carga de deuda mensual (services/DebtLoad.ts). Sin dependencias:
//   npm run test:debt-load   →   sucrase-node scripts/debt-load.test.ts

import { debtLevelOf, debtSummaryText, legacyDeclaredDebtQ, monthlyDebtLoad } from '../services/DebtLoad';
import type { CreditInstallment, IncomeSource, UserSettings } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

function inst(id: string, over: Partial<CreditInstallment> = {}): CreditInstallment {
  return {
    id, accountId: 'card1', name: `cuota ${id}`, totalAmount: 12000, monthlyPayment: 1000, totalInstallments: 12,
    paidInstallments: 0, startDate: '2026-10-01T12:00:00.000Z', currency: 'Q', category: 'other', isActive: true, ...over,
  };
}

function src(over: Partial<IncomeSource> = {}): IncomeSource {
  return {
    id: 'src1', name: 'Sueldo', category: 'salary', amount: 10000, currency: 'Q', frequency: 'monthly', days: [27],
    role: 'base', anchorsPeriod: true, isActive: true, createdAt: '2026-01-01T12:00:00.000Z', ...over,
  };
}

type S = Pick<UserSettings, 'monthlyIncome' | 'exchangeRate' | 'activeDebts'>;
const settings = (over: Partial<S> = {}): S => ({ monthlyIncome: 0, exchangeRate: 7.5, activeDebts: 0, ...over });
const load = (installments: CreditInstallment[], s: S, sources: IncomeSource[] = []) =>
  monthlyDebtLoad({ installments, settings: s, sources, txs: [] });

// ── 1. Conversión y clasificación (tarjeta / préstamo) ──
console.log('Cuotas y préstamos');
{
  const usd = load([inst('a', { currency: 'USD', monthlyPayment: 100 })], settings());
  check('cuota en USD se convierte a Q (100 × 7.5)', usd.totalQ === 750 && usd.cardInstallmentsQ === 750, String(usd.totalQ));
  const loan = load([inst('b', { accountId: '', monthlyPayment: 800 })], settings());
  check('préstamo sin tarjeta va a loansQ', loan.loansQ === 800 && loan.cardInstallmentsQ === 0 && loan.totalQ === 800);
  const both = load([inst('a', { monthlyPayment: 500 }), inst('b', { accountId: '', monthlyPayment: 300 })], settings());
  check('tarjeta + préstamo suman', both.cardInstallmentsQ === 500 && both.loansQ === 300 && both.totalQ === 800 && both.activeCount === 2);
  const eur = load([inst('c', { currency: 'EUR' as CreditInstallment['currency'], monthlyPayment: 200 })], settings());
  check('otras monedas van 1:1 (igual que convertAmount)', eur.totalQ === 200);
}

// ── 2. Exclusión de terminadas e inactivas ──
console.log('Cuotas terminadas o inactivas');
{
  const l = load([
    inst('done', { paidInstallments: 12, monthlyPayment: 999 }),
    inst('off', { isActive: false, monthlyPayment: 888 }),
    inst('live', { paidInstallments: 11, monthlyPayment: 100 }),
  ], settings());
  check('solo cuenta la que aún tiene cuotas por pagar', l.totalQ === 100 && l.activeCount === 1, String(l.totalQ));
}

// ── 3. Deuda declarada (legado) sin doble conteo ──
console.log('Deuda declarada del onboarding');
{
  const solo = load([], settings({ activeDebts: 500 }));
  check('sin cuotas onb_, la deuda declarada cuenta', solo.legacyQ === 500 && solo.totalQ === 500 && solo.activeCount === 0);
  const withReal = load([inst('x', { monthlyPayment: 200 })], settings({ activeDebts: 500 }));
  check('cuota real (no onb_) + declarada: ambas', withReal.totalQ === 700 && withReal.legacyQ === 500);
  const dup = load([inst('onb_d1', { monthlyPayment: 500 })], settings({ activeDebts: 500 }));
  check('con cuota onb_ la declarada se ignora (sin doble conteo)', dup.legacyQ === 0 && dup.totalQ === 500, String(dup.totalQ));
  const dupDone = load([inst('onb_d1', { paidInstallments: 12 })], settings({ activeDebts: 500 }));
  check('aunque la cuota onb_ ya terminó, la declarada no resucita', dupDone.legacyQ === 0 && dupDone.totalQ === 0 && dupDone.level === 'none');
  check('legacyDeclaredDebtQ: 0 o negativo = 0', legacyDeclaredDebtQ({ activeDebts: 0 }, []) === 0 && legacyDeclaredDebtQ({ activeDebts: -5 }, []) === 0);
  check('legacyDeclaredDebtQ directo', legacyDeclaredDebtQ({ activeDebts: 450 }, []) === 450
    && legacyDeclaredDebtQ({ activeDebts: 450 }, [inst('onb_z')]) === 0);
  const cleared = load([], settings({ activeDebts: 0 }));
  check('«Ya no la tengo» (activeDebts 0) deja la carga en 0', cleared.totalQ === 0 && cleared.level === 'none');
}

// ── 4. Prioridad del ingreso: fuentes > declarado > ninguno ──
console.log('Ingreso base del ratio');
{
  const insts = [inst('a', { monthlyPayment: 2000 })];
  const fromSrc = load(insts, settings({ monthlyIncome: 5000 }), [src({ amount: 10000 })]);
  check('con fuentes usa el ingreso de las fuentes', fromSrc.incomeBasis === 'sources' && fromSrc.incomeQ === 10000 && fromSrc.ratioPct === 20);
  const declared = load(insts, settings({ monthlyIncome: 5000 }));
  check('sin fuentes usa el declarado', declared.incomeBasis === 'declared' && declared.incomeQ === 5000 && declared.ratioPct === 40);
  const inactive = load(insts, settings({ monthlyIncome: 5000 }), [src({ isActive: false })]);
  check('fuente inactiva no cuenta: cae al declarado', inactive.incomeBasis === 'declared');
  const extra = load(insts, settings({ monthlyIncome: 5000 }), [src({ role: 'extra' })]);
  check('fuente extra no cuenta: cae al declarado', extra.incomeBasis === 'declared');
  const none = load(insts, settings());
  check('sin ingreso: none y ratio null', none.incomeBasis === 'none' && none.ratioPct === null && none.incomeQ === 0 && none.totalQ === 2000);
  check('sin ratio no hay nivel (se muestra el monto)', none.level === 'none');
  const usdSrc = load(insts, settings(), [src({ currency: 'USD', amount: 1000 })]);
  check('fuente en USD se convierte', usdSrc.incomeQ === 7500 && usdSrc.ratioPct === 26.7, String(usdSrc.ratioPct));
}

// ── 5. Fronteras 20 y 40 (decisión: 20 exacto = moderado; 40 exacto = moderado; >40 = alto) ──
console.log('Umbrales');
{
  check('19.9 % saludable', debtLevelOf(19.9) === 'healthy');
  check('20 % exacto es moderado', debtLevelOf(20) === 'moderate');
  check('40 % exacto sigue moderado', debtLevelOf(40) === 'moderate');
  check('40.1 % alto', debtLevelOf(40.1) === 'high');
  check('0 % saludable', debtLevelOf(0) === 'healthy');
  check('null = none', debtLevelOf(null) === 'none');
  check('se clasifica el número redondeado a 1 decimal (19.96 → 20.0 moderado)', debtLevelOf(19.96) === 'moderate');
  check('40.04 → 40.0 moderado', debtLevelOf(40.04) === 'moderate');
  const at20 = load([inst('a', { monthlyPayment: 2000 })], settings({ monthlyIncome: 10000 }));
  check('monthlyDebtLoad: 2000/10000 = 20 % → moderate', at20.ratioPct === 20 && at20.level === 'moderate');
  const at40 = load([inst('a', { monthlyPayment: 4000 })], settings({ monthlyIncome: 10000 }));
  check('monthlyDebtLoad: 40 % → moderate', at40.ratioPct === 40 && at40.level === 'moderate');
  const above = load([inst('a', { monthlyPayment: 4001 })], settings({ monthlyIncome: 10000 }));
  check('monthlyDebtLoad: 40.01 % redondea a 40.0 → moderate; 4100 → high',
    above.level === 'moderate' && load([inst('a', { monthlyPayment: 4100 })], settings({ monthlyIncome: 10000 })).level === 'high');
  const low = load([inst('a', { monthlyPayment: 1000 })], settings({ monthlyIncome: 10000 }));
  check('10 % → healthy', low.ratioPct === 10 && low.level === 'healthy');
}

// ── 6. Total 0 → none ──
console.log('Sin deuda');
{
  const z = load([], settings({ monthlyIncome: 10000 }));
  check('total 0 → none, ratio 0', z.totalQ === 0 && z.level === 'none' && z.ratioPct === 0 && z.activeCount === 0);
  check('texto sin deuda', debtSummaryText(z) === 'Sin cuotas de deuda activas');
}

// ── 7. La deuda cambia después del onboarding ──
console.log('Deuda viva');
{
  const s = settings({ monthlyIncome: 10000, activeDebts: 1000 });
  const base = [inst('onb_d1', { monthlyPayment: 1000 })];
  const l0 = load(base, s);
  check('al inicio: 1000/10000 = 10 %', l0.ratioPct === 10 && l0.level === 'healthy');
  const l1 = load([...base, inst('nueva', { monthlyPayment: 1500 })], s);
  check('agregar una visacuota después sube el ratio (25 %, moderado)', l1.ratioPct === 25 && l1.level === 'moderate' && l1.activeCount === 2);
  const l2 = load([inst('onb_d1', { monthlyPayment: 1000, paidInstallments: 12 }), inst('nueva', { monthlyPayment: 1500 })], s);
  check('terminar una lo baja (15 %)', l2.ratioPct === 15 && l2.level === 'healthy' && l2.totalQ === 1500);
  check('el ratio ya no depende de activeDebts', load(base, settings({ monthlyIncome: 10000, activeDebts: 99999 })).totalQ === 1000);
}

// ── 8. Texto resumen ──
console.log('Texto');
{
  const l = load([inst('a', { monthlyPayment: 1234.5 })], settings({ monthlyIncome: 10000 }));
  check('resumen con ratio declarado', debtSummaryText(l) === 'Q1,234.50 al mes (12.3% del ingreso declarado)', debtSummaryText(l));
  const ls = load([inst('a', { monthlyPayment: 1000 })], settings(), [src()]);
  check('resumen con base fuentes', debtSummaryText(ls) === 'Q1,000.00 al mes (10.0% del ingreso de tus fuentes)', debtSummaryText(ls));
  const ln = load([inst('a', { monthlyPayment: 1000 })], settings());
  check('resumen sin ingreso', debtSummaryText(ln).indexOf('sin ingreso') >= 0, debtSummaryText(ln));
}

console.log(failures === 0 ? `OK  ${checks} comprobaciones` : `${failures} FALLAS de ${checks}`);
process.exit(failures === 0 ? 0 : 1);
