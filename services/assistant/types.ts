// Tipos compartidos del asistente (módulo puro: de ../storage solo se importan tipos).
import type { Account, CategoryBudget, Currency, FixedExpense, MerchantRule, SavingsGoal, Transaction, UserSettings } from '../storage';

export type ActionId = 'create_goal' | 'set_category_budget' | 'create_fixed_expense' | 'create_transaction';
export type QueryId = 'spending_total' | 'list_movements' | 'fixed_pending' | 'budget_status' | 'goals_status';
export type IntentId =
  | `create.${ActionId}` | `query.${QueryId}`
  | 'meta.cancel' | 'meta.confirm' | 'meta.correct' | 'meta.help' | 'advice' | 'unknown';

export type SlotType = 'amount' | 'currency' | 'date_future' | 'date_past' | 'day_of_month' | 'category_expense'
  | 'category_any' | 'account' | 'text' | 'tx_type' | 'range' | 'merchant';

export interface DateRange { kind: 'period' | 'prev_period' | 'custom'; start: string; end: string; label: string } // YYYY-MM-DD inclusivos
export type SlotValue = string | number | DateRange;
export type SlotMap = Partial<Record<string, SlotValue>>;

export interface Chip { label: string; value: string }
export interface SlotSpec {
  key: string; type: SlotType; label: string; required: boolean;
  question: string; description: string;          // description → Gemini
  chips?: (ctx: AssistantContext, slots: SlotMap) => Chip[];
  defaultValue?: (ctx: AssistantContext, slots: SlotMap) => SlotValue | undefined;
}
export interface ValidationIssue { slot?: string; message: string }
export interface SummaryRow { label: string; value: string; money?: { amount: number; currency: Currency }; slotKey?: string }

export interface AssistantContext {
  now: Date;
  period: { start: Date; end: Date; prevStart: Date; prevEnd: Date; label: string };
  settings: Pick<UserSettings, 'currency' | 'customCategories' | 'paymentCycle' | 'paymentDay' | 'paymentDays' | 'exchangeRate' | 'smsEnabled'> & { paymentWeekday?: number };
  transactions: Transaction[]; accounts: Account[]; fixedExpenses: FixedExpense[];
  categoryBudgets: CategoryBudget[]; savingsGoals: SavingsGoal[]; merchantRules: MerchantRule[];
  smsOn: boolean;
}

export interface DupHint { txId: string; source: 'sms' | 'manual'; label: string; date: string; amount: number; currency: Currency }
export type ActionDraft =
  | { kind: 'create_goal'; goal: SavingsGoal }
  | { kind: 'set_category_budget'; budget: CategoryBudget; previous: CategoryBudget | null }
  | { kind: 'create_fixed_expense'; expense: FixedExpense }
  | { kind: 'create_transaction'; tx: Transaction; duplicates: DupHint[] };

export type ProposalStatus = 'pending' | 'executing' | 'done' | 'cancelled' | 'failed' | 'expired';
export interface ActionProposal {
  proposalId: string; actionId: ActionId; slots: SlotMap;
  summary: SummaryRow[]; warnings: string[]; issues: ValidationIssue[];
  origin: 'local' | 'gemini' | 'guided'; status: ProposalStatus; error?: string;
}
export type UndoToken =
  | { kind: 'delete_goal'; id: string; snapshot: SavingsGoal }
  | { kind: 'restore_budget'; categoryId: string; applied: CategoryBudget; previous: CategoryBudget | null }
  | { kind: 'delete_fixed'; id: string; snapshot: FixedExpense }
  | { kind: 'delete_tx'; id: string; snapshot: Transaction };
export type ActionResult =
  | { ok: true; proposalId: string; message: string; undo?: UndoToken }
  | { ok: false; proposalId: string; error: string };

export interface MoneyTotal { currency: Currency; amount: number; count: number }
export interface QueryRow { id: string; title: string; subtitle?: string; amount?: number; currency?: Currency; tone?: 'expense' | 'income' | 'neutral'; badge?: string }
export interface QueryResult {
  queryId: QueryId; title: string; subtitle: string;
  totals: MoneyTotal[];        // una por moneda, Q primero, NUNCA convertidas ni sumadas
  rows: QueryRow[];            // máx 20
  moreCount: number; emptyText?: string; note?: string;
}

export type ChatMessage =
  | { id: string; at: string; role: 'user'; kind: 'text'; text: string }
  | { id: string; at: string; role: 'ai'; kind: 'text'; text: string; source: 'local' | 'gemini' | 'advisor' }
  | { id: string; at: string; role: 'ai'; kind: 'question'; text: string; chips: Chip[]; slot: string }
  | { id: string; at: string; role: 'ai'; kind: 'proposal'; proposal: ActionProposal }
  | { id: string; at: string; role: 'ai'; kind: 'query'; result: QueryResult }
  | { id: string; at: string; role: 'ai'; kind: 'notice'; variant: 'success' | 'error' | 'info' | 'warning'; text: string; undo?: UndoToken; undoState?: 'available' | 'done' | 'expired' };

export type DialogueTarget = { type: 'action'; id: ActionId } | { type: 'query'; id: QueryId };
export interface DialogueState {
  active: null | { target: DialogueTarget; slots: SlotMap; pendingSlot: string | null; failures: number; origin: ActionProposal['origin'] };
  lastProposalId: string | null;
}
export const EMPTY_DIALOGUE: DialogueState = { active: null, lastProposalId: null };

export interface StoredAssistantChat { v: 1; messages: ChatMessage[]; geminiHistory: { role: 'user' | 'model'; text: string }[]; savedAt: string }
