// Versión REAL de las dependencias del Executor: envuelve a StorageService y NotificationService.
// Vive aparte de Executor.ts para que este siga siendo importable (y probable con sucrase-node) sin
// AsyncStorage ni expo-notifications. Solo lo importa el componente del asistente (AIAdvisor).
import { StorageService } from '../storage';
import type { CategoryBudget, FixedExpense, SavingsGoal, Transaction, UserSettings } from '../storage';
import { NotificationService } from '../NotificationService';
import type { ExecutorDeps } from './Executor';
import { withWriteVerification } from './VerifiedStorage';

export interface ExecutorCallbacks {
  settings: UserSettings;
  onTransactions(t: Transaction[]): void;
  onFixed(f: FixedExpense[]): void;
  onBudgets(b: CategoryBudget[]): void;
  onGoals(g: SavingsGoal[]): void;
}

/**
 * Arma las dependencias reales. Los métodos de StorageService usan `this`, por eso se envuelven
 * con funciones flecha en vez de pasarlos sueltos.
 */
export function createExecutorDeps(cb: ExecutorCallbacks): ExecutorDeps {
  return {
    settings: cb.settings,
    // Cada escritura se relee y se confirma (los save* del storage tragan errores de AsyncStorage).
    storage: withWriteVerification({
      getSavingsGoals: () => StorageService.getSavingsGoals(),
      addSavingsGoal: g => StorageService.addSavingsGoal(g),
      deleteSavingsGoal: id => StorageService.deleteSavingsGoal(id),
      getCategoryBudgets: () => StorageService.getCategoryBudgets(),
      upsertCategoryBudget: b => StorageService.upsertCategoryBudget(b),
      deleteCategoryBudget: id => StorageService.deleteCategoryBudget(id),
      getFixedExpenses: () => StorageService.getFixedExpenses(),
      addFixedExpense: e => StorageService.addFixedExpense(e),
      deleteFixedExpense: id => StorageService.deleteFixedExpense(id),
      getTransactions: () => StorageService.getTransactions(),
      addTransaction: tx => StorageService.addTransaction(tx),
      deleteTransaction: id => StorageService.deleteTransaction(id),
    }),
    notifications: {
      scheduleFixedExpenseReminder: e => NotificationService.scheduleFixedExpenseReminder(e),
      cancelFixedExpenseReminder: id => NotificationService.cancelFixedExpenseReminder(id),
      onTransactionAdded: (tx, txs, settings, budgets, fixed) =>
        NotificationService.onTransactionAdded(tx, txs, settings, budgets, fixed),
    },
    onTransactions: cb.onTransactions,
    onFixed: cb.onFixed,
    onBudgets: cb.onBudgets,
    onGoals: cb.onGoals,
  };
}
