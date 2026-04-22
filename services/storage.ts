import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────
// TIPOS BASE
// ─────────────────────────────────────────────────────────────
export type Currency = 'Q' | 'USD' | 'EUR' | '£';
export type PaymentCycle = 'monthly' | 'biweekly' | 'weekly' | 'irregular';
export type RiskProfile = 'conservative' | 'moderate' | 'aggressive';

// ─────────────────────────────────────────────────────────────
// TRANSACCIÓN
// ─────────────────────────────────────────────────────────────
export interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: 'expense' | 'income';
  source: 'manual' | 'sms';
  currency: Currency;
  originalSMS?: string;
  bank?: string;
  location?: string;
}

// ─────────────────────────────────────────────────────────────
// CATEGORÍA PERSONALIZADA
// ─────────────────────────────────────────────────────────────
export interface CustomCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  type: 'expense' | 'income' | 'both';
}

// ─────────────────────────────────────────────────────────────
// GASTO FIJO MENSUAL
// ─────────────────────────────────────────────────────────────
export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  currency: Currency;
  category: string;
  dayOfMonth: number;        // Día del mes que vence (1-31)
  isPaid: boolean;       // Si ya se pagó este mes
  paidDate?: string;        // Fecha en que se marcó como pagado
  autoRecord: boolean;       // Si se registra automáticamente como transacción
  notes?: string;
  isActive: boolean;
}

// ─────────────────────────────────────────────────────────────
// PRESUPUESTO POR CATEGORÍA
// ─────────────────────────────────────────────────────────────
export interface CategoryBudget {
  categoryId: string;
  limit: number;
  currency: Currency;
  alertAt: number;        // % para alertar (default 80)
}

// ─────────────────────────────────────────────────────────────
// META DE AHORRO
// ─────────────────────────────────────────────────────────────
export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currency: Currency;
  currentAmount: number;
  deadline: string;       // ISO date
  category?: string;
  icon: string;
  color: string;
  isCompleted: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE USUARIO (CFO PROFILE)
// ─────────────────────────────────────────────────────────────
export interface UserSettings {
  // Perfil básico
  userName: string;
  userTitle: string;

  // Presupuesto
  budgetLimit: number;         // Presupuesto mensual en Q
  budgetLimitUSD: number;         // Presupuesto mensual en USD
  currency: Currency;       // Moneda principal

  // Ciclo de pago
  paymentCycle: PaymentCycle;   // Frecuencia de pago
  paymentDay: number;         // Día del mes que cobra (mensual)
  paymentDays: number[];       // Días si es quincenal [15, 30]
  monthlyIncome: number;         // Ingreso promedio declarado en Q
  monthlyIncomeUSD: number;         // Ingreso promedio en USD

  // Deudas
  activeDebts: number;         // Monto total de deudas activas en Q
  activeDebtsUSD: number;

  // Meta de ahorro mensual
  monthlySavingsGoal: number;         // Cuánto quiere ahorrar por mes en Q

  // Ahorros externos
  externalSavings: number;
  externalSavingsUSD: number;

  // Bancos preferidos
  preferredBanks: string[];       // ['BAC', 'BANRURAL', ...]

  // Tipo de cambio
  exchangeRate: number;         // USD → Q

  // SMS
  smsEnabled: boolean;

  // IA
  geminiApiKey?: string;

  // Categorías custom
  customCategories: CustomCategory[];

  // Onboarding
  onboardingComplete: boolean;
  tutorialComplete: boolean;

  // Score financiero histórico
  financialScoreHistory: { month: string; score: number }[];
}

// ─────────────────────────────────────────────────────────────
// APP DATA
// ─────────────────────────────────────────────────────────────
export interface AppData {
  transactions: Transaction[];
  settings: UserSettings;
  fixedExpenses: FixedExpense[];
  categoryBudgets: CategoryBudget[];
  savingsGoals: SavingsGoal[];
  currentMonthSpent: number;
  lastResetDate: string;
}

// ─────────────────────────────────────────────────────────────
// CLAVES DE ALMACENAMIENTO
// ─────────────────────────────────────────────────────────────
const K = {
  TRANSACTIONS: '@bm_transactions',
  SETTINGS: '@bm_settings',
  LAST_RESET: '@bm_last_reset',
  CUSTOM_CATEGORIES: '@bm_custom_categories',
  FIXED_EXPENSES: '@bm_fixed_expenses',
  CATEGORY_BUDGETS: '@bm_category_budgets',
  SAVINGS_GOALS: '@bm_savings_goals',
};

// ─────────────────────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS: UserSettings = {
  userName: 'Usuario',
  userTitle: 'BudgetMaster Pro',
  budgetLimit: 6000,
  budgetLimitUSD: 800,
  currency: 'Q',
  paymentCycle: 'monthly',
  paymentDay: 30,
  paymentDays: [15, 30],
  monthlyIncome: 0,
  monthlyIncomeUSD: 0,
  activeDebts: 0,
  activeDebtsUSD: 0,
  monthlySavingsGoal: 0,
  externalSavings: 0,
  externalSavingsUSD: 0,
  preferredBanks: [],
  exchangeRate: 7.70,
  smsEnabled: true,
  geminiApiKey: '',
  customCategories: [],
  onboardingComplete: false,
  tutorialComplete: false,
  financialScoreHistory: [],
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Días que faltan hasta el próximo pago según ciclo */
export function getDaysUntilNextPayment(settings: UserSettings): number {
  const now = new Date();
  const today = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  if (settings.paymentCycle === 'weekly') {
    return 7 - now.getDay();
  }

  if (settings.paymentCycle === 'biweekly') {
    const days = settings.paymentDays.sort((a, b) => a - b);
    const next = days.find(d => d > today);
    if (next) return next - today;
    // Siguiente mes primer día de pago
    const firstNext = new Date(year, month + 1, days[0]);
    return Math.ceil((firstNext.getTime() - now.getTime()) / 86400000);
  }

  if (settings.paymentCycle === 'monthly') {
    const payDay = settings.paymentDay;
    if (today < payDay) return payDay - today;
    const nextPay = new Date(year, month + 1, payDay);
    return Math.ceil((nextPay.getTime() - now.getTime()) / 86400000);
  }

  return 0; // irregular
}

/** Calcula el Score Financiero (0-100) */
export function calcFinancialScore(
  transactions: Transaction[],
  settings: UserSettings,
  fixedExpenses: FixedExpense[],
  categoryBudgets: CategoryBudget[],
): number {
  const now = new Date();
  const m = now.getMonth();
  const y = now.getFullYear();

  const monthTx = transactions.filter(t => {
    const d = new Date(t.date);
    return d.getMonth() === m && d.getFullYear() === y;
  });

  const income = monthTx.filter(t => t.type === 'income' && t.currency === 'Q').reduce((s, t) => s + t.amount, 0);
  const expense = monthTx.filter(t => t.type === 'expense' && t.currency === 'Q').reduce((s, t) => s + t.amount, 0);

  let score = 50; // base

  // +20 si tasa de ahorro >= 20%
  const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;
  if (savingsRate >= 20) score += 20;
  else if (savingsRate >= 10) score += 10;
  else if (savingsRate < 0) score -= 15;

  // +15 si no superó el presupuesto
  if (expense <= settings.budgetLimit) score += 15;
  else score -= 10;

  // +10 si pagó todos los gastos fijos
  const paidFixed = fixedExpenses.filter(f => f.isPaid && f.isActive).length;
  const totalFixed = fixedExpenses.filter(f => f.isActive).length;
  if (totalFixed > 0 && paidFixed === totalFixed) score += 10;

  // +5 si tiene metas activas
  // (se suma en BudgetScreen al guardar metas)

  return Math.max(0, Math.min(100, score));
}

// ─────────────────────────────────────────────────────────────
// STORAGE SERVICE
// ─────────────────────────────────────────────────────────────
export const StorageService = {

  // ── Transacciones ─────────────────────────────────────────
  async getTransactions(): Promise<Transaction[]> {
    try {
      const data = await AsyncStorage.getItem(K.TRANSACTIONS);
      if (!data) return [];
      const txs: Transaction[] = JSON.parse(data);
      return txs.map(t => ({ ...t, currency: t.currency ?? 'Q' }));
    } catch { return []; }
  },

  async saveTransactions(txs: Transaction[]): Promise<void> {
    try { await AsyncStorage.setItem(K.TRANSACTIONS, JSON.stringify(txs)); } catch { }
  },

  async addTransaction(tx: Transaction): Promise<Transaction[]> {
    const all = await this.getTransactions();
    const updated = [tx, ...all];
    await this.saveTransactions(updated);
    return updated;
  },

  async deleteTransaction(id: string): Promise<Transaction[]> {
    const all = await this.getTransactions();
    const updated = all.filter(t => t.id !== id);
    await this.saveTransactions(updated);
    return updated;
  },

  async updateTransaction(tx: Transaction): Promise<Transaction[]> {
    const all = await this.getTransactions();
    const updated = all.map(t => t.id === tx.id ? tx : t);
    await this.saveTransactions(updated);
    return updated;
  },

  // ── Settings ──────────────────────────────────────────────
  async getSettings(): Promise<UserSettings> {
    try {
      const data = await AsyncStorage.getItem(K.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  },

  async saveSettings(s: UserSettings): Promise<void> {
    try { await AsyncStorage.setItem(K.SETTINGS, JSON.stringify(s)); } catch { }
  },

  // ── Categorías custom ─────────────────────────────────────
  async getCustomCategories(): Promise<CustomCategory[]> {
    try {
      const data = await AsyncStorage.getItem(K.CUSTOM_CATEGORIES);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async saveCustomCategory(cat: CustomCategory): Promise<CustomCategory[]> {
    const all = await this.getCustomCategories();
    const updated = [...all, cat];
    await AsyncStorage.setItem(K.CUSTOM_CATEGORIES, JSON.stringify(updated));
    return updated;
  },

  async deleteCustomCategory(id: string): Promise<CustomCategory[]> {
    const all = await this.getCustomCategories();
    const updated = all.filter(c => c.id !== id);
    await AsyncStorage.setItem(K.CUSTOM_CATEGORIES, JSON.stringify(updated));
    return updated;
  },

  // ── Gastos Fijos ──────────────────────────────────────────
  async getFixedExpenses(): Promise<FixedExpense[]> {
    try {
      const data = await AsyncStorage.getItem(K.FIXED_EXPENSES);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async saveFixedExpenses(expenses: FixedExpense[]): Promise<void> {
    try { await AsyncStorage.setItem(K.FIXED_EXPENSES, JSON.stringify(expenses)); } catch { }
  },

  async addFixedExpense(expense: FixedExpense): Promise<FixedExpense[]> {
    const all = await this.getFixedExpenses();
    const updated = [...all, expense];
    await this.saveFixedExpenses(updated);
    return updated;
  },

  async updateFixedExpense(expense: FixedExpense): Promise<FixedExpense[]> {
    const all = await this.getFixedExpenses();
    const updated = all.map(e => e.id === expense.id ? expense : e);
    await this.saveFixedExpenses(updated);
    return updated;
  },

  async deleteFixedExpense(id: string): Promise<FixedExpense[]> {
    const all = await this.getFixedExpenses();
    const updated = all.filter(e => e.id !== id);
    await this.saveFixedExpenses(updated);
    return updated;
  },

  /** Resetea isPaid de todos los gastos fijos al inicio del mes */
  async resetFixedExpensesForNewMonth(): Promise<void> {
    const all = await this.getFixedExpenses();
    const reset = all.map(e => ({ ...e, isPaid: false, paidDate: undefined }));
    await this.saveFixedExpenses(reset);
  },

  // ── Presupuestos por Categoría ────────────────────────────
  async getCategoryBudgets(): Promise<CategoryBudget[]> {
    try {
      const data = await AsyncStorage.getItem(K.CATEGORY_BUDGETS);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async saveCategoryBudgets(budgets: CategoryBudget[]): Promise<void> {
    try { await AsyncStorage.setItem(K.CATEGORY_BUDGETS, JSON.stringify(budgets)); } catch { }
  },

  async upsertCategoryBudget(budget: CategoryBudget): Promise<CategoryBudget[]> {
    const all = await this.getCategoryBudgets();
    const exists = all.findIndex(b => b.categoryId === budget.categoryId);
    const updated = exists >= 0
      ? all.map((b, i) => i === exists ? budget : b)
      : [...all, budget];
    await this.saveCategoryBudgets(updated);
    return updated;
  },

  async deleteCategoryBudget(categoryId: string): Promise<CategoryBudget[]> {
    const all = await this.getCategoryBudgets();
    const updated = all.filter(b => b.categoryId !== categoryId);
    await this.saveCategoryBudgets(updated);
    return updated;
  },

  // ── Metas de Ahorro ───────────────────────────────────────
  async getSavingsGoals(): Promise<SavingsGoal[]> {
    try {
      const data = await AsyncStorage.getItem(K.SAVINGS_GOALS);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async saveSavingsGoals(goals: SavingsGoal[]): Promise<void> {
    try { await AsyncStorage.setItem(K.SAVINGS_GOALS, JSON.stringify(goals)); } catch { }
  },

  async addSavingsGoal(goal: SavingsGoal): Promise<SavingsGoal[]> {
    const all = await this.getSavingsGoals();
    const updated = [...all, goal];
    await this.saveSavingsGoals(updated);
    return updated;
  },

  async updateSavingsGoal(goal: SavingsGoal): Promise<SavingsGoal[]> {
    const all = await this.getSavingsGoals();
    const updated = all.map(g => g.id === goal.id ? goal : g);
    await this.saveSavingsGoals(updated);
    return updated;
  },

  async deleteSavingsGoal(id: string): Promise<SavingsGoal[]> {
    const all = await this.getSavingsGoals();
    const updated = all.filter(g => g.id !== id);
    await this.saveSavingsGoals(updated);
    return updated;
  },

  // ── Reset mensual ─────────────────────────────────────────
  async getLastResetDate(): Promise<string | null> {
    try { return await AsyncStorage.getItem(K.LAST_RESET); } catch { return null; }
  },

  async saveLastResetDate(date: string): Promise<void> {
    try { await AsyncStorage.setItem(K.LAST_RESET, date); } catch { }
  },

  async checkAndRunMonthlyReset(): Promise<boolean> {
    const lastReset = await this.getLastResetDate();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth()}`;
    if (lastReset !== currentMonth) {
      await this.resetFixedExpensesForNewMonth();
      await this.saveLastResetDate(currentMonth);
      return true;
    }
    return false;
  },

  // ── Cargar TODO ───────────────────────────────────────────
  async loadAllData(): Promise<AppData> {
    const [transactions, settings, fixedExpenses, categoryBudgets, savingsGoals, lastResetDate] =
      await Promise.all([
        this.getTransactions(),
        this.getSettings(),
        this.getFixedExpenses(),
        this.getCategoryBudgets(),
        this.getSavingsGoals(),
        this.getLastResetDate(),
      ]);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const currentMonthSpent = transactions.reduce((total, t) => {
      const d = new Date(t.date);
      return (t.type === 'expense' && t.currency === 'Q' &&
        d.getMonth() === currentMonth && d.getFullYear() === currentYear)
        ? total + t.amount : total;
    }, 0);

    return {
      transactions,
      settings,
      fixedExpenses,
      categoryBudgets,
      savingsGoals,
      currentMonthSpent,
      lastResetDate: lastResetDate || new Date().toISOString(),
    };
  },

  // ── Limpiar todo ──────────────────────────────────────────
  async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove(Object.values(K));
    } catch { }
  },
};