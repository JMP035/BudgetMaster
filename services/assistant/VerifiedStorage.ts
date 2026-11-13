// Verificación de escritura real para el Executor del asistente.
// Los save* de StorageService tragan los errores de AsyncStorage: si la escritura falla, `addX` igual
// devuelve la lista nueva y el Executor diría «guardado» sin estarlo. Este envoltorio relee el storage
// después de cada escritura (y de cada borrado, en deshacer) y LANZA si la entidad no quedó como se
// esperaba; el Executor ya convierte cualquier excepción en SAVE_ERROR / UNDO_ERROR.
// Módulo PURO (sin AsyncStorage): se prueba con un ExecutorStorage simulado. ExecutorDeps.ts lo aplica.
import type { ExecutorStorage } from './Executor';

export const VERIFY_ERROR = 'No se pudo confirmar la escritura en el almacenamiento.';

function mismatch(what: string): Error {
  return new Error(`${VERIFY_ERROR} (${what})`);
}

/**
 * Devuelve un ExecutorStorage que, tras cada add/upsert/delete, vuelve a leer y confirma el resultado.
 * Las lecturas (`get*`) pasan tal cual. La lista que devuelve cada escritura es la RELEÍDA, no la que
 * devolvió el storage, así la UI se refresca con lo que realmente hay guardado.
 */
export function withWriteVerification(inner: ExecutorStorage): ExecutorStorage {
  return {
    getSavingsGoals: () => inner.getSavingsGoals(),
    getCategoryBudgets: () => inner.getCategoryBudgets(),
    getFixedExpenses: () => inner.getFixedExpenses(),
    getTransactions: () => inner.getTransactions(),

    async addSavingsGoal(g) {
      await inner.addSavingsGoal(g);
      const list = await inner.getSavingsGoals();
      if (!list.some(x => x.id === g.id)) throw mismatch('addSavingsGoal');
      return list;
    },
    async deleteSavingsGoal(id) {
      await inner.deleteSavingsGoal(id);
      const list = await inner.getSavingsGoals();
      if (list.some(x => x.id === id)) throw mismatch('deleteSavingsGoal');
      return list;
    },

    async upsertCategoryBudget(b) {
      await inner.upsertCategoryBudget(b);
      const list = await inner.getCategoryBudgets();
      const saved = list.find(x => x.categoryId === b.categoryId);
      if (!saved || saved.limit !== b.limit) throw mismatch('upsertCategoryBudget');
      return list;
    },
    async deleteCategoryBudget(categoryId) {
      await inner.deleteCategoryBudget(categoryId);
      const list = await inner.getCategoryBudgets();
      if (list.some(x => x.categoryId === categoryId)) throw mismatch('deleteCategoryBudget');
      return list;
    },

    async addFixedExpense(e) {
      await inner.addFixedExpense(e);
      const list = await inner.getFixedExpenses();
      if (!list.some(x => x.id === e.id)) throw mismatch('addFixedExpense');
      return list;
    },
    async deleteFixedExpense(id) {
      await inner.deleteFixedExpense(id);
      const list = await inner.getFixedExpenses();
      if (list.some(x => x.id === id)) throw mismatch('deleteFixedExpense');
      return list;
    },

    async addTransaction(tx) {
      await inner.addTransaction(tx);
      const list = await inner.getTransactions();
      if (!list.some(x => x.id === tx.id)) throw mismatch('addTransaction');
      return list;
    },
    async deleteTransaction(id) {
      await inner.deleteTransaction(id);
      const list = await inner.getTransactions();
      if (list.some(x => x.id === id)) throw mismatch('deleteTransaction');
      return list;
    },
  };
}
