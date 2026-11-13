// Ejecución y deshacer de las propuestas del asistente. Es el ÚNICO módulo del asistente que escribe datos,
// pero no importa StorageService ni NotificationService: recibe todo por `deps` (inyección de dependencias),
// así se prueba con mocks en memoria sin AsyncStorage. La versión real de `deps` está en ExecutorDeps.ts.
// Puro en cuanto a imports: de ../storage solo tipos; formatMoney y categorías son módulos puros.
import type { CategoryBudget, FixedExpense, SavingsGoal, Transaction, UserSettings } from '../storage';
import type { ActionProposal, ActionResult, AssistantContext, UndoToken } from './types';
import { ACTIONS, entityIdFor } from './Actions';
import { formatMoney } from '../format';
import { categoryLabelOf } from '../../categories';

/** Operaciones de datos que necesita el Executor (la implementación real envuelve a StorageService). */
export interface ExecutorStorage {
  getSavingsGoals(): Promise<SavingsGoal[]>;
  addSavingsGoal(g: SavingsGoal): Promise<SavingsGoal[]>;
  deleteSavingsGoal(id: string): Promise<SavingsGoal[]>;
  getCategoryBudgets(): Promise<CategoryBudget[]>;
  upsertCategoryBudget(b: CategoryBudget): Promise<CategoryBudget[]>;
  deleteCategoryBudget(categoryId: string): Promise<CategoryBudget[]>;
  getFixedExpenses(): Promise<FixedExpense[]>;
  addFixedExpense(e: FixedExpense): Promise<FixedExpense[]>;
  deleteFixedExpense(id: string): Promise<FixedExpense[]>;
  getTransactions(): Promise<Transaction[]>;
  addTransaction(tx: Transaction): Promise<Transaction[]>;
  deleteTransaction(id: string): Promise<Transaction[]>;
}

/** Efectos secundarios (notificaciones). Nunca bloquean ni hacen fallar la escritura. */
export interface ExecutorNotifications {
  scheduleFixedExpenseReminder(e: FixedExpense): Promise<void>;
  cancelFixedExpenseReminder(expenseId: string): Promise<void>;
  onTransactionAdded(
    tx: Transaction, transactions: Transaction[], settings: UserSettings,
    categoryBudgets: CategoryBudget[], fixedExpenses: FixedExpense[],
  ): Promise<void>;
}

export interface ExecutorDeps {
  settings: UserSettings;
  storage: ExecutorStorage;
  notifications: ExecutorNotifications;
  /** Callbacks para refrescar el estado de la app tras escribir (o deshacer). Un fallo aquí se ignora. */
  onTransactions(t: Transaction[]): void;
  onFixed(f: FixedExpense[]): void;
  onBudgets(b: CategoryBudget[]): void;
  onGoals(g: SavingsGoal[]): void;
}

export const SAVE_ERROR = 'No se pudo guardar. Intente de nuevo.';
export const UNDO_ERROR = 'No se pudo deshacer. Intente de nuevo.';
export const UNDO_CHANGED = 'Ya no se puede deshacer: el registro cambió después (por ejemplo, se unió con un SMS).';
export const NOT_PENDING = 'Esta propuesta ya no está disponible.';
export const ALREADY_DONE = 'Esta acción ya se ejecutó.';
export const IN_PROGRESS = 'Esta acción ya se está procesando.';

/** Propuestas / deshacer en curso: evita que un doble toque ejecute dos veces. */
const inFlight = new Set<string>();

function warn(what: string, e: unknown): void {
  console.warn(`[assistant/Executor] ${what}`, e);
}

/** Corre un efecto secundario sin esperarlo: un fallo (síncrono o asíncrono) solo se registra. */
function fireAndForget(what: string, fn: () => Promise<void>): void {
  try {
    void fn().catch(e => warn(what, e));
  } catch (e) {
    warn(what, e);
  }
}

/** Avisa a la app del cambio; un callback que falla no invalida lo que ya se guardó. */
function notify<T>(what: string, cb: (v: T) => void, value: T): void {
  try { cb(value); } catch (e) { warn(what, e); }
}

const fail = (proposalId: string, error: string): ActionResult => ({ ok: false, proposalId, error });

// ─────────────────────────────────────────────────────────────
// executeProposal
// ─────────────────────────────────────────────────────────────

/**
 * Ejecuta una propuesta confirmada. Pasar la propuesta con `status === 'pending'` (el cambio visual a
 * «executing» lo hace el componente sobre su propia copia). Idempotente: un doble toque, o reenviar una
 * propuesta ya guardada, nunca duplica el registro (id determinístico + comprobación en storage).
 * Revalida con el `ctx` recibido, que debe ser reciente (los datos pudieron cambiar desde la propuesta).
 */
export async function executeProposal(p: ActionProposal, ctx: AssistantContext, deps: ExecutorDeps): Promise<ActionResult> {
  if (p.status !== 'pending') return fail(p.proposalId, p.status === 'done' ? ALREADY_DONE : NOT_PENDING);
  if (inFlight.has(p.proposalId)) return fail(p.proposalId, IN_PROGRESS);
  inFlight.add(p.proposalId);
  try {
    const spec = ACTIONS[p.actionId];
    if (!spec) return fail(p.proposalId, NOT_PENDING);
    const issues = spec.validate(p.slots, ctx);
    if (issues.length > 0) return fail(p.proposalId, issues[0].message);

    const draft = spec.build(p.slots, ctx, { entityId: entityIdFor(p.actionId, p.proposalId), nowIso: ctx.now.toISOString() });
    const st = deps.storage;

    switch (draft.kind) {
      case 'create_goal': {
        const goal = draft.goal;
        const message = `Meta «${goal.name}» creada.`;
        const existing = (await st.getSavingsGoals()).find(g => g.id === goal.id);
        if (existing) {
          // Ya guardada por un intento anterior: no se duplica.
          notify('onGoals', deps.onGoals, await st.getSavingsGoals());
          return { ok: true, proposalId: p.proposalId, message, undo: { kind: 'delete_goal', id: existing.id, snapshot: existing } };
        }
        const list = await st.addSavingsGoal(goal);
        notify('onGoals', deps.onGoals, list);
        return { ok: true, proposalId: p.proposalId, message, undo: { kind: 'delete_goal', id: goal.id, snapshot: goal } };
      }

      case 'set_category_budget': {
        // El límite anterior se lee del storage (no del ctx, que pudo quedar viejo) para que Deshacer restaure lo real.
        const previous = (await st.getCategoryBudgets()).find(b => b.categoryId === draft.budget.categoryId) ?? null;
        const budget: CategoryBudget = { ...draft.budget, alertAt: previous?.alertAt ?? draft.budget.alertAt };
        const list = await st.upsertCategoryBudget(budget);
        notify('onBudgets', deps.onBudgets, list);
        const label = categoryLabelOf(budget.categoryId, ctx.settings.customCategories ?? [], 'expense');
        return {
          ok: true, proposalId: p.proposalId,
          message: `Límite de ${label} fijado en ${formatMoney(budget.limit, 'Q')}.`,
          undo: { kind: 'restore_budget', categoryId: budget.categoryId, applied: budget, previous },
        };
      }

      case 'create_fixed_expense': {
        const expense = draft.expense;
        const message = `Gasto fijo «${expense.name}» agregado.`;
        const existing = (await st.getFixedExpenses()).find(e => e.id === expense.id);
        if (existing) {
          notify('onFixed', deps.onFixed, await st.getFixedExpenses());
          return { ok: true, proposalId: p.proposalId, message, undo: { kind: 'delete_fixed', id: existing.id, snapshot: existing } };
        }
        const list = await st.addFixedExpense(expense);
        notify('onFixed', deps.onFixed, list);
        fireAndForget('scheduleFixedExpenseReminder', () => deps.notifications.scheduleFixedExpenseReminder(expense));
        return { ok: true, proposalId: p.proposalId, message, undo: { kind: 'delete_fixed', id: expense.id, snapshot: expense } };
      }

      case 'create_transaction': {
        const tx = draft.tx;
        const message = `${tx.type === 'income' ? 'Ingreso' : 'Gasto'} de ${formatMoney(tx.amount, tx.currency)} registrado.`;
        const existing = (await st.getTransactions()).find(t => t.id === tx.id);
        if (existing) {
          notify('onTransactions', deps.onTransactions, await st.getTransactions());
          return { ok: true, proposalId: p.proposalId, message, undo: { kind: 'delete_tx', id: existing.id, snapshot: existing } };
        }
        const list = await st.addTransaction(tx);
        notify('onTransactions', deps.onTransactions, list);
        fireAndForget('onTransactionAdded', () =>
          deps.notifications.onTransactionAdded(tx, list, deps.settings, ctx.categoryBudgets, ctx.fixedExpenses));
        return { ok: true, proposalId: p.proposalId, message, undo: { kind: 'delete_tx', id: tx.id, snapshot: tx } };
      }
    }
  } catch (e) {
    warn('executeProposal', e);
    return fail(p.proposalId, SAVE_ERROR);
  } finally {
    inFlight.delete(p.proposalId);
  }
}

// ─────────────────────────────────────────────────────────────
// undoAction
// ─────────────────────────────────────────────────────────────

const undoKey = (t: UndoToken): string => (t.kind === 'restore_budget' ? `undo:${t.kind}:${t.categoryId}` : `undo:${t.kind}:${t.id}`);

/**
 * Deshace una acción releyendo el storage: solo borra/restaura si la entidad sigue igual a como se creó.
 * Si cambió (o ya no existe: borrada, unida con un SMS…), no toca nada y lo explica.
 */
export async function undoAction(t: UndoToken, deps: ExecutorDeps): Promise<{ ok: boolean; message: string }> {
  const key = undoKey(t);
  if (inFlight.has(key)) return { ok: false, message: IN_PROGRESS };
  inFlight.add(key);
  try {
    const st = deps.storage;
    const changed = { ok: false, message: UNDO_CHANGED };

    switch (t.kind) {
      case 'delete_goal': {
        const cur = (await st.getSavingsGoals()).find(g => g.id === t.id);
        if (!cur || cur.currentAmount !== t.snapshot.currentAmount) return changed;
        notify('onGoals', deps.onGoals, await st.deleteSavingsGoal(t.id));
        return { ok: true, message: `Meta «${t.snapshot.name}» eliminada.` };
      }

      case 'restore_budget': {
        const cur = (await st.getCategoryBudgets()).find(b => b.categoryId === t.categoryId);
        if (!cur || cur.limit !== t.applied.limit) return changed;
        const label = categoryLabelOf(t.categoryId, deps.settings.customCategories ?? [], 'expense');
        if (t.previous) {
          notify('onBudgets', deps.onBudgets, await st.upsertCategoryBudget(t.previous));
          return { ok: true, message: `Límite de ${label} restaurado a ${formatMoney(t.previous.limit, 'Q')}.` };
        }
        notify('onBudgets', deps.onBudgets, await st.deleteCategoryBudget(t.categoryId));
        return { ok: true, message: `Límite de ${label} eliminado.` };
      }

      case 'delete_fixed': {
        const cur = (await st.getFixedExpenses()).find(e => e.id === t.id);
        if (!cur || cur.isPaid) return changed;
        notify('onFixed', deps.onFixed, await st.deleteFixedExpense(t.id));
        fireAndForget('cancelFixedExpenseReminder', () => deps.notifications.cancelFixedExpenseReminder(t.id));
        return { ok: true, message: `Gasto fijo «${t.snapshot.name}» eliminado.` };
      }

      case 'delete_tx': {
        const cur = (await st.getTransactions()).find(x => x.id === t.id);
        if (!cur || cur.source !== 'manual' || cur.mergedFrom || cur.amount !== t.snapshot.amount) return changed;
        notify('onTransactions', deps.onTransactions, await st.deleteTransaction(t.id));
        return { ok: true, message: `${t.snapshot.type === 'income' ? 'Ingreso' : 'Gasto'} de ${formatMoney(t.snapshot.amount, t.snapshot.currency)} eliminado.` };
      }
    }
  } catch (e) {
    warn('undoAction', e);
    return { ok: false, message: UNDO_ERROR };
  } finally {
    inFlight.delete(key);
  }
}
