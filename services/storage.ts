import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────
// TIPOS BASE
// ─────────────────────────────────────────────────────────────
export type Currency = 'Q' | 'USD' | 'EUR' | '£';
export type PaymentCycle = 'monthly' | 'biweekly' | 'weekly' | 'irregular';
export type AccountType = 'cash' | 'bank' | 'credit' | 'investment' | 'savings';

// ─────────────────────────────────────────────────────────────
// TRANSACCIÓN
// ─────────────────────────────────────────────────────────────
export interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: 'expense' | 'income' | 'transfer';
  source: 'manual' | 'sms';
  currency: Currency;
  originalSMS?: string;
  bank?: string;
  location?: string;
  fromAccountId?: string;   // Para transferencias
  toAccountId?: string;   // Para transferencias
}

// ─────────────────────────────────────────────────────────────
// CUENTA FINANCIERA
// ─────────────────────────────────────────────────────────────
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;        // Saldo actual
  initialBalance: number;       // Saldo inicial al crear
  color: string;
  icon: string;
  bankName?: string;        // Nombre del banco si aplica
  creditLimit?: number;        // Para tarjetas de crédito
  isActive: boolean;
  createdAt: string;
  notes?: string;
}

// ─────────────────────────────────────────────────────────────
// VISACUOTA / CUOTA DE TARJETA
// ─────────────────────────────────────────────────────────────
export interface CreditInstallment {
  id: string;
  accountId: string;      // Tarjeta de crédito asociada
  name: string;      // Ej: "Laptop Lenovo"
  totalAmount: number;      // Monto total de la compra
  monthlyPayment: number;      // Cuota mensual
  totalInstallments: number;    // Total de cuotas
  paidInstallments: number;    // Cuotas pagadas
  startDate: string;      // Fecha de inicio
  currency: Currency;
  category: string;
  isActive: boolean;
  notes?: string;
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
// GASTO FIJO
// ─────────────────────────────────────────────────────────────
export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  currency: Currency;
  category: string;
  dayOfMonth: number;
  isPaid: boolean;
  paidDate?: string;
  autoRecord: boolean;
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
  alertAt: number;
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
  deadline: string;
  category?: string;
  icon: string;
  color: string;
  isCompleted: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE USUARIO
// ─────────────────────────────────────────────────────────────
export interface UserSettings {
  userName: string;
  userTitle: string;
  budgetLimit: number;
  budgetLimitUSD: number;
  currency: Currency;
  paymentCycle: PaymentCycle;
  paymentDay: number;
  paymentDays: number[];
  monthlyIncome: number;
  monthlyIncomeUSD: number;
  activeDebts: number;
  activeDebtsUSD: number;
  monthlySavingsGoal: number;
  externalSavings: number;
  externalSavingsUSD: number;
  preferredBanks: string[];
  exchangeRate: number;
  smsEnabled: boolean;
  biometricEnabled: boolean;
  geminiApiKey?: string;
  customCategories: CustomCategory[];
  onboardingComplete: boolean;
  tutorialComplete: boolean;
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
  accounts: Account[];
  creditInstallments: CreditInstallment[];
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
  ACCOUNTS: '@bm_accounts',
  CREDIT_INSTALLMENTS: '@bm_credit_installments',
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
  biometricEnabled: false,
  geminiApiKey: '',
  customCategories: [],
  onboardingComplete: false,
  tutorialComplete: false,
  financialScoreHistory: [],
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Días hasta próximo pago */
export function getDaysUntilNextPayment(settings: UserSettings): number {
  const now = new Date();
  const today = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  if (settings.paymentCycle === 'weekly') return 7 - now.getDay();

  if (settings.paymentCycle === 'biweekly') {
    const days = settings.paymentDays.sort((a, b) => a - b);
    const next = days.find(d => d > today);
    if (next) return next - today;
    const firstNext = new Date(year, month + 1, days[0]);
    return Math.ceil((firstNext.getTime() - now.getTime()) / 86400000);
  }

  if (settings.paymentCycle === 'monthly') {
    const payDay = settings.paymentDay;
    if (today < payDay) return payDay - today;
    const nextPay = new Date(year, month + 1, payDay);
    return Math.ceil((nextPay.getTime() - now.getTime()) / 86400000);
  }
  return 0;
}

// ─────────────────────────────────────────────────────────────
// PERÍODO FINANCIERO (basado en día de pago, no mes calendario)
// ─────────────────────────────────────────────────────────────
export interface FinancialPeriod {
  start: Date;
  end: Date;
  label: string;        // Ej: "15 May – 14 Jun 2026"
  prevStart: Date;
  prevEnd: Date;
  prevLabel: string;    // Ej: "15 Abr – 14 May 2026"
  daysPassed: number;   // Días transcurridos en el período actual
  daysTotal: number;    // Duración total del período en días
}

const fmt_d = (d: Date) =>
  d.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' });

/** Calcula el período financiero actual y el anterior según el ciclo de pago */
export function getCurrentFinancialPeriod(settings: UserSettings): FinancialPeriod {
  const now = new Date();
  const today = now.getDate();
  const m = now.getMonth();
  const y = now.getFullYear();

  // ── Ciclo irregular → usa mes calendario ────────────────────
  if (settings.paymentCycle === 'irregular') {
    const start = new Date(y, m, 1);
    const end = new Date(y, m + 1, 0, 23, 59, 59);
    const prevStart = new Date(y, m - 1, 1);
    const prevEnd = new Date(y, m, 0, 23, 59, 59);
    return {
      start, end, label: fmt_d(start) + ' – ' + fmt_d(end),
      prevStart, prevEnd, prevLabel: fmt_d(prevStart) + ' – ' + fmt_d(prevEnd),
      daysPassed: today, daysTotal: new Date(y, m + 1, 0).getDate(),
    };
  }

  // ── Ciclo semanal ────────────────────────────────────────────
  if (settings.paymentCycle === 'weekly') {
    const dayOfWeek = now.getDay(); // 0=dom
    const start = new Date(now); start.setDate(today - dayOfWeek); start.setHours(0, 0, 0, 0);
    const end = new Date(start); end.setDate(start.getDate() + 6); end.setHours(23, 59, 59);
    const prevStart = new Date(start); prevStart.setDate(start.getDate() - 7);
    const prevEnd = new Date(start); prevEnd.setDate(start.getDate() - 1); prevEnd.setHours(23, 59, 59);
    return {
      start, end, label: fmt_d(start) + ' – ' + fmt_d(end),
      prevStart, prevEnd, prevLabel: fmt_d(prevStart) + ' – ' + fmt_d(prevEnd),
      daysPassed: dayOfWeek + 1, daysTotal: 7,
    };
  }

  // ── Ciclo quincenal ──────────────────────────────────────────
  if (settings.paymentCycle === 'biweekly') {
    const days = [...settings.paymentDays].sort((a, b) => a - b); // Ej: [15, 30]
    const d1 = days[0] ?? 15;
    const d2 = days[1] ?? 30;
    let start: Date, end: Date, prevStart: Date, prevEnd: Date;

    if (today >= d2 || (d2 > 28 && today >= d2)) {
      // Segunda quincena: d2 → d1 del mes siguiente
      start = new Date(y, m, d2);
      const nextD1 = new Date(y, m + 1, d1);
      end = new Date(nextD1); end.setDate(nextD1.getDate() - 1); end.setHours(23, 59, 59);
      prevStart = new Date(y, m, d1);
      prevEnd = new Date(y, m, d2 - 1); prevEnd.setHours(23, 59, 59);
    } else if (today >= d1) {
      // Primera quincena: d1 → d2-1
      start = new Date(y, m, d1);
      end = new Date(y, m, d2 - 1, 23, 59, 59);
      prevStart = new Date(y, m - 1, d2);
      prevEnd = new Date(y, m, d1 - 1, 23, 59, 59);
    } else {
      // Antes del d1: última quincena del mes pasado
      start = new Date(y, m - 1, d2);
      end = new Date(y, m, d1 - 1, 23, 59, 59);
      prevStart = new Date(y, m - 1, d1);
      prevEnd = new Date(y, m - 1, d2 - 1, 23, 59, 59);
    }
    const daysTotal = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    const daysPassed = Math.min(Math.round((now.getTime() - start.getTime()) / 86400000) + 1, daysTotal);
    return {
      start, end, label: fmt_d(start) + ' – ' + fmt_d(end),
      prevStart, prevEnd, prevLabel: fmt_d(prevStart) + ' – ' + fmt_d(prevEnd),
      daysPassed, daysTotal,
    };
  }

  // ── Ciclo mensual (default) ──────────────────────────────────
  const payDay = Math.min(settings.paymentDay, 28); // Máx 28 para evitar Feb

  let start: Date, end: Date, prevStart: Date, prevEnd: Date;

  if (today >= payDay) {
    // Estamos dentro del período: desde payDay de este mes
    start = new Date(y, m, payDay, 0, 0, 0);
    end = new Date(y, m + 1, payDay - 1, 23, 59, 59);
    prevStart = new Date(y, m - 1, payDay, 0, 0, 0);
    prevEnd = new Date(y, m, payDay - 1, 23, 59, 59);
  } else {
    // Antes del payDay: período empezó el mes pasado
    start = new Date(y, m - 1, payDay, 0, 0, 0);
    end = new Date(y, m, payDay - 1, 23, 59, 59);
    prevStart = new Date(y, m - 2, payDay, 0, 0, 0);
    prevEnd = new Date(y, m - 1, payDay - 1, 23, 59, 59);
  }

  const daysTotal = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
  const daysPassed = Math.min(Math.round((now.getTime() - start.getTime()) / 86400000) + 1, daysTotal);

  return {
    start, end, label: fmt_d(start) + ' – ' + fmt_d(end),
    prevStart, prevEnd, prevLabel: fmt_d(prevStart) + ' – ' + fmt_d(prevEnd),
    daysPassed, daysTotal,
  };
}

/** Score financiero 0-100 */
export function calcFinancialScore(
  transactions: Transaction[],
  settings: UserSettings,
  fixedExpenses: FixedExpense[],
  categoryBudgets: CategoryBudget[],
  accounts: Account[],
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

  let score = 50;

  const savingsRate = income > 0 ? ((income - expense) / income) * 100 : 0;
  if (savingsRate >= 20) score += 20;
  else if (savingsRate >= 10) score += 10;
  else if (savingsRate < 0) score -= 15;

  if (expense <= settings.budgetLimit) score += 15;
  else score -= 10;

  const paidFixed = fixedExpenses.filter(f => f.isPaid && f.isActive).length;
  const totalFixed = fixedExpenses.filter(f => f.isActive).length;
  if (totalFixed > 0 && paidFixed === totalFixed) score += 10;

  // Bonus si tiene cuentas registradas
  if (accounts.length > 0) score += 5;

  return Math.max(0, Math.min(100, score));
}

/** Patrimonio neto total desde cuentas */
export function calcNetWorthFromAccounts(accounts: Account[], exchangeRate: number): { totalQ: number; totalUSD: number } {
  let totalQ = 0;
  let totalUSD = 0;

  for (const acc of accounts) {
    if (!acc.isActive) continue;
    const isCredit = acc.type === 'credit';
    const amount = isCredit ? -Math.abs(acc.balance) : acc.balance;

    if (acc.currency === 'Q') totalQ += amount;
    if (acc.currency === 'USD') totalUSD += amount;
  }

  return { totalQ, totalUSD };
}

/** Cuota mensual pendiente de visacuotas */
export function getMonthlyInstallmentTotal(installments: CreditInstallment[]): number {
  return installments
    .filter(i => i.isActive && i.paidInstallments < i.totalInstallments)
    .reduce((s, i) => s + i.monthlyPayment, 0);
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

  async addFixedExpense(e: FixedExpense): Promise<FixedExpense[]> {
    const all = await this.getFixedExpenses();
    const updated = [...all, e];
    await this.saveFixedExpenses(updated);
    return updated;
  },

  async updateFixedExpense(e: FixedExpense): Promise<FixedExpense[]> {
    const all = await this.getFixedExpenses();
    const updated = all.map(x => x.id === e.id ? e : x);
    await this.saveFixedExpenses(updated);
    return updated;
  },

  async deleteFixedExpense(id: string): Promise<FixedExpense[]> {
    const all = await this.getFixedExpenses();
    const updated = all.filter(e => e.id !== id);
    await this.saveFixedExpenses(updated);
    return updated;
  },

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

  async addSavingsGoal(g: SavingsGoal): Promise<SavingsGoal[]> {
    const all = await this.getSavingsGoals();
    const updated = [...all, g];
    await this.saveSavingsGoals(updated);
    return updated;
  },

  async updateSavingsGoal(g: SavingsGoal): Promise<SavingsGoal[]> {
    const all = await this.getSavingsGoals();
    const updated = all.map(x => x.id === g.id ? g : x);
    await this.saveSavingsGoals(updated);
    return updated;
  },

  async deleteSavingsGoal(id: string): Promise<SavingsGoal[]> {
    const all = await this.getSavingsGoals();
    const updated = all.filter(g => g.id !== id);
    await this.saveSavingsGoals(updated);
    return updated;
  },

  // ── Cuentas ───────────────────────────────────────────────
  async getAccounts(): Promise<Account[]> {
    try {
      const data = await AsyncStorage.getItem(K.ACCOUNTS);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async saveAccounts(accounts: Account[]): Promise<void> {
    try { await AsyncStorage.setItem(K.ACCOUNTS, JSON.stringify(accounts)); } catch { }
  },

  async addAccount(account: Account): Promise<Account[]> {
    const all = await this.getAccounts();
    const updated = [...all, account];
    await this.saveAccounts(updated);
    return updated;
  },

  async updateAccount(account: Account): Promise<Account[]> {
    const all = await this.getAccounts();
    const updated = all.map(a => a.id === account.id ? account : a);
    await this.saveAccounts(updated);
    return updated;
  },

  async deleteAccount(id: string): Promise<Account[]> {
    const all = await this.getAccounts();
    const updated = all.filter(a => a.id !== id);
    await this.saveAccounts(updated);
    return updated;
  },

  /** Actualiza el saldo de una cuenta */
  async adjustAccountBalance(accountId: string, delta: number): Promise<void> {
    const all = await this.getAccounts();
    const updated = all.map(a =>
      a.id === accountId ? { ...a, balance: a.balance + delta } : a
    );
    await this.saveAccounts(updated);
  },

  // ── Visacuotas / Cuotas ───────────────────────────────────
  async getCreditInstallments(): Promise<CreditInstallment[]> {
    try {
      const data = await AsyncStorage.getItem(K.CREDIT_INSTALLMENTS);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async saveCreditInstallments(items: CreditInstallment[]): Promise<void> {
    try { await AsyncStorage.setItem(K.CREDIT_INSTALLMENTS, JSON.stringify(items)); } catch { }
  },

  async addCreditInstallment(item: CreditInstallment): Promise<CreditInstallment[]> {
    const all = await this.getCreditInstallments();
    const updated = [...all, item];
    await this.saveCreditInstallments(updated);
    return updated;
  },

  async updateCreditInstallment(item: CreditInstallment): Promise<CreditInstallment[]> {
    const all = await this.getCreditInstallments();
    const updated = all.map(x => x.id === item.id ? item : x);
    await this.saveCreditInstallments(updated);
    return updated;
  },

  async deleteCreditInstallment(id: string): Promise<CreditInstallment[]> {
    const all = await this.getCreditInstallments();
    const updated = all.filter(x => x.id !== id);
    await this.saveCreditInstallments(updated);
    return updated;
  },

  /** Avanza un mes en todas las cuotas activas */
  async processMonthlyInstallments(): Promise<void> {
    const all = await this.getCreditInstallments();
    const updated = all.map(item => {
      if (!item.isActive || item.paidInstallments >= item.totalInstallments) return item;
      const newPaid = item.paidInstallments + 1;
      return {
        ...item,
        paidInstallments: newPaid,
        isActive: newPaid < item.totalInstallments,
      };
    });
    await this.saveCreditInstallments(updated);
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
      await this.processMonthlyInstallments();
      await this.saveLastResetDate(currentMonth);
      return true;
    }
    return false;
  },

  // ── Cargar TODO ───────────────────────────────────────────
  async loadAllData(): Promise<AppData> {
    const [
      transactions, settings, fixedExpenses,
      categoryBudgets, savingsGoals, accounts,
      creditInstallments, lastResetDate,
    ] = await Promise.all([
      this.getTransactions(),
      this.getSettings(),
      this.getFixedExpenses(),
      this.getCategoryBudgets(),
      this.getSavingsGoals(),
      this.getAccounts(),
      this.getCreditInstallments(),
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
      accounts,
      creditInstallments,
      currentMonthSpent,
      lastResetDate: lastResetDate || new Date().toISOString(),
    };
  },

  // ── Limpiar todo ──────────────────────────────────────────
  async clearAllData(): Promise<void> {
    try { await AsyncStorage.multiRemove(Object.values(K)); } catch { }
  },
};