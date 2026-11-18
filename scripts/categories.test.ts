process.env.TZ = 'America/Guatemala';
// Pruebas de la migración «Pago Militar» → «Salario» y de los alias de categorías. Sin dependencias:
//   npm run test:categories   →   sucrase-node scripts/categories.test.ts

import { INCOME_CATEGORIES, getCat } from '../categories';
import { categorizeIncome } from '../services/Categorizer';
import { migrateMilitaryToSalary } from '../services/CategoryMigration';
import { emitSettingsChanged, onSettingsChanged } from '../services/SettingsEvents';
import type {
  CategoryBudget, CreditInstallment, FixedExpense, MerchantRule, Transaction, UserSettings,
} from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);

function tx(id: string, category: string, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, amount: 100, description: `mov ${id}`, category, date: d(2026, 10, 1).toISOString(),
    type: 'income', source: 'manual', currency: 'Q', ...extra,
  };
}

const budget = (categoryId: string, limit: number): CategoryBudget => ({ categoryId, limit, currency: 'Q', alertAt: 80 });

// ── Catálogo y alias ──
check('ingreso: 9 categorías predefinidas', INCOME_CATEGORIES.length === 9, String(INCOME_CATEGORIES.length));
check('ingreso: ya no existe military', !INCOME_CATEGORIES.some(c => c.id === 'military'));
check("getCat('military') → Salario", getCat('military').label === 'Salario');
check("getCat('military', [], 'income') → Salario", getCat('military', [], 'income').label === 'Salario');
check("getCat('salary') → Salario", getCat('salary').label === 'Salario');

// ── Categorizer ──
check("categorizeIncome('pago mindef …','payroll') → salary", categorizeIncome('pago mindef quincena', 'payroll') === 'salary');
check('categorizeIncome: ejercito → salary', categorizeIncome('deposito ejercito de guatemala', 'deposit') === 'salary');
check('categorizeIncome: planilla sigue en salary', categorizeIncome('planilla octubre', 'payroll') === 'salary');
check('categorizeIncome: bono sigue en bonus', categorizeIncome('bono 14', 'deposit') === 'bonus');

// ── Migración ──
const transactions: Transaction[] = [
  tx('t1', 'military'),
  tx('t2', 'salary'),
  tx('t3', 'food', { type: 'expense' }),
  tx('t4', 'transfer_in', {
    mergedFrom: { id: 'm1', description: 'x', category: 'military', date: d(2026, 10, 2).toISOString(), amount: 10, currency: 'Q' },
  }),
  tx('t5', 'transfer_in', { transferPrev: { type: 'income', category: 'military' } }),
];
const fixedExpenses: FixedExpense[] = [{
  id: 'f1', name: 'Fijo', amount: 5, currency: 'Q', category: 'military', dayOfMonth: 1,
  isPaid: false, autoRecord: false, isActive: true,
}];
const merchantRules: MerchantRule[] = [{ key: 'mindef', label: 'Mindef', category: 'military', createdAt: 'a', updatedAt: 'a', hits: 1 }];
const installments: CreditInstallment[] = [];

const r1 = migrateMilitaryToSalary({
  transactions, fixedExpenses, merchantRules, installments,
  categoryBudgets: [budget('military', 5000), budget('salary', 3000), budget('food', 800)],
});
check('migración: changed', r1.changed === true);
check('migración: mueve movimientos', r1.transactions[0].category === 'salary');
check('migración: no toca los demás', r1.transactions[1].category === 'salary' && r1.transactions[2].category === 'food');
check('migración: mergedFrom.category', r1.transactions[3].mergedFrom?.category === 'salary');
check('migración: transferPrev.category', r1.transactions[4].transferPrev?.category === 'salary');
check('migración: gastos fijos', r1.fixedExpenses[0].category === 'salary');
check('migración: reglas de comercio', r1.merchantRules[0].category === 'salary');
check('migración: budgets fusionados en uno solo', r1.categoryBudgets.filter(b => b.categoryId === 'salary').length === 1);
check('migración: budget conserva el mayor límite', r1.categoryBudgets.find(b => b.categoryId === 'salary')?.limit === 5000);
check('migración: budget food intacto', r1.categoryBudgets.find(b => b.categoryId === 'food')?.limit === 800);
check('migración: ya no queda military en budgets', !r1.categoryBudgets.some(b => b.categoryId === 'military'));
check('migración: changedKeys incluye lo que cambió',
  ['transactions', 'fixedExpenses', 'categoryBudgets', 'merchantRules'].every(k => (r1.changedKeys as string[]).includes(k))
  && !(r1.changedKeys as string[]).includes('installments'));
check('migración: no muta la entrada', transactions[0].category === 'military' && transactions[3].mergedFrom?.category === 'military');

// Si el de salary tiene mayor límite, se conserva ese
const r2 = migrateMilitaryToSalary({
  transactions: [], fixedExpenses: [], merchantRules: [], installments: [],
  categoryBudgets: [budget('military', 1000), budget('salary', 3000)],
});
check('migración: gana el límite mayor de salary', r2.categoryBudgets.length === 1 && r2.categoryBudgets[0].limit === 3000);

// Solo military (sin salary): se renombra
const r3 = migrateMilitaryToSalary({
  transactions: [], fixedExpenses: [], merchantRules: [], installments: [],
  categoryBudgets: [budget('military', 1000)],
});
check('migración: military solo → salary', r3.categoryBudgets.length === 1 && r3.categoryBudgets[0].categoryId === 'salary');

// Idempotente: segunda pasada sin cambios
const r4 = migrateMilitaryToSalary(r1);
check('migración idempotente: segunda pasada → changed:false', r4.changed === false && r4.changedKeys.length === 0);
check('migración idempotente: conserva las referencias', r4.transactions === r1.transactions);

// Sin datos
const r5 = migrateMilitaryToSalary({ transactions: [], fixedExpenses: [], merchantRules: [], installments: [], categoryBudgets: [] });
check('migración: vacío → changed:false', r5.changed === false);

// ── SettingsEvents ──
const seen: string[] = [];
const off = onSettingsChanged(s => { seen.push(s.userName); });
const fake = { userName: 'Ana' } as UserSettings;
emitSettingsChanged(fake);
off();
emitSettingsChanged({ userName: 'Luis' } as UserSettings);
check('SettingsEvents: emite a los suscritos', seen.length === 1 && seen[0] === 'Ana');
const off2 = onSettingsChanged(() => { throw new Error('x'); });
let okAfterThrow = true;
try { emitSettingsChanged(fake); } catch { okAfterThrow = false; }
off2();
check('SettingsEvents: un listener que falla no rompe el emit', okAfterThrow);

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
