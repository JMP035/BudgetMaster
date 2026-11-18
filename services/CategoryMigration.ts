// ─────────────────────────────────────────────────────────────
// MIGRACIÓN DE CATEGORÍAS (módulo PURO)
// ─────────────────────────────────────────────────────────────
// Sin react-native ni AsyncStorage: solo `import type` de ./storage.
// «Pago Militar» (military) dejó de ser categoría predefinida y pasa a «Salario» (salary).
// La persistencia y la marca de «ya migrado» viven en StorageService.runMigrations.

import type { CategoryBudget, CreditInstallment, FixedExpense, MerchantRule, Transaction } from './storage';

export interface MilitaryMigrationInput {
  transactions: Transaction[];
  fixedExpenses: FixedExpense[];
  categoryBudgets: CategoryBudget[];
  merchantRules: MerchantRule[];
  installments: CreditInstallment[];
}

export interface MilitaryMigrationResult extends MilitaryMigrationInput {
  changed: boolean;
  /** Qué colecciones cambiaron (para guardar solo esas). */
  changedKeys: Array<keyof MilitaryMigrationInput>;
}

const FROM = 'military';
const TO = 'salary';

function fixTransaction(t: Transaction): Transaction {
  let out = t;
  if (t.category === FROM) out = { ...out, category: TO };
  if (t.mergedFrom && t.mergedFrom.category === FROM) {
    out = { ...out, mergedFrom: { ...t.mergedFrom, category: TO } };
  }
  if (t.transferPrev && t.transferPrev.category === FROM) {
    out = { ...out, transferPrev: { ...t.transferPrev, category: TO } };
  }
  return out;
}

/** Mapea una colección: devuelve la misma referencia si nada cambió. */
function mapIfChanged<T>(items: T[], fix: (x: T) => T): { items: T[]; changed: boolean } {
  let changed = false;
  const next = items.map(x => {
    const y = fix(x);
    if (y !== x) changed = true;
    return y;
  });
  return { items: changed ? next : items, changed };
}

/** Presupuestos: renombra military→salary y, si quedan dos de salary, conserva el de mayor límite. */
function migrateBudgets(budgets: CategoryBudget[]): { items: CategoryBudget[]; changed: boolean } {
  if (!budgets.some(b => b.categoryId === FROM)) return { items: budgets, changed: false };
  const renamed = budgets.map(b => (b.categoryId === FROM ? { ...b, categoryId: TO } : b));
  const salary = renamed.filter(b => b.categoryId === TO);
  if (salary.length <= 1) return { items: renamed, changed: true };
  const best = salary.reduce((a, b) => (b.limit > a.limit ? b : a));
  let kept = false;
  const items = renamed.filter(b => {
    if (b.categoryId !== TO) return true;
    if (b === best && !kept) { kept = true; return true; }
    return false;
  });
  return { items, changed: true };
}

export function migrateMilitaryToSalary(input: MilitaryMigrationInput): MilitaryMigrationResult {
  const tx = mapIfChanged(input.transactions, fixTransaction);
  const fe = mapIfChanged(input.fixedExpenses, f => (f.category === FROM ? { ...f, category: TO } : f));
  const mr = mapIfChanged(input.merchantRules, r => (r.category === FROM ? { ...r, category: TO } : r));
  const ins = mapIfChanged(input.installments, i => (i.category === FROM ? { ...i, category: TO } : i));
  const bu = migrateBudgets(input.categoryBudgets);

  const changedKeys: Array<keyof MilitaryMigrationInput> = [];
  if (tx.changed) changedKeys.push('transactions');
  if (fe.changed) changedKeys.push('fixedExpenses');
  if (bu.changed) changedKeys.push('categoryBudgets');
  if (mr.changed) changedKeys.push('merchantRules');
  if (ins.changed) changedKeys.push('installments');

  return {
    transactions: tx.items,
    fixedExpenses: fe.items,
    categoryBudgets: bu.items,
    merchantRules: mr.items,
    installments: ins.items,
    changed: changedKeys.length > 0,
    changedKeys,
  };
}
