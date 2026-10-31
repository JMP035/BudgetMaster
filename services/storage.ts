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
  bankRef?: string;        // Número de referencia bancaria (si el SMS lo trae)
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
  creditLimit?: number;        // Para tarjetas de crédito (legado, ya no editable vía UI)
  cutoffDay?: number;        // Día de corte (1-31), solo para type === 'credit'
  paymentDueDay?: number;        // Día de pago (1-31), solo para type === 'credit'
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
  lastTxId?: string;
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
  cardsOnboardingComplete: boolean;
  financialScoreHistory: { month: string; score: number }[];
  activeDebtsList?: any[];
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
// ESTADO DE NOTIFICACIONES
// ─────────────────────────────────────────────────────────────
export interface NotificationState {
  weeklySummaryFireAt?: string;   // ISO
  setupNudgesShown: string[];
}

// ─────────────────────────────────────────────────────────────
// CLAVES DE ALMACENAMIENTO
// ─────────────────────────────────────────────────────────────
const K = {
  TRANSACTIONS: '@bm_transactions',
  SETTINGS: '@bm_settings',
  LAST_RESET: '@bm_last_reset',
  FIXED_EXPENSES: '@bm_fixed_expenses',
  CATEGORY_BUDGETS: '@bm_category_budgets',
  SAVINGS_GOALS: '@bm_savings_goals',
  ACCOUNTS: '@bm_accounts',
  CREDIT_INSTALLMENTS: '@bm_credit_installments',
  NOTIFICATION_STATE: '@bm_notification_state',
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
  cardsOnboardingComplete: false,
  financialScoreHistory: [],
  activeDebtsList: [],
};

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Cantidad de días del mes dado (acepta month fuera de 0-11, JS lo normaliza) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Recorta un día de pago configurado al largo real del mes indicado */
export function getEffectivePaymentDay(paymentDay: number, year: number, month: number): number {
  return Math.min(Math.max(1, Math.round(paymentDay)), daysInMonth(year, month));
}

/** Indica si un gasto fijo está vencido: no pagado y ya se pasó su día efectivo del mes actual */
export function isFixedExpenseOverdue(expense: FixedExpense, now: Date = new Date()): boolean {
  return !expense.isPaid && now.getDate() > getEffectivePaymentDay(expense.dayOfMonth, now.getFullYear(), now.getMonth());
}

/** Último instante (23:59:59) del día anterior a la fecha dada */
function dayBefore(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() - 1, 23, 59, 59);
}

/**
 * Parsea un monto ingresado por el usuario con separadores de miles/decimales
 * ambiguos (convención de Guatemala: tanto "," como "." pueden ser decimal o
 * de miles según el contexto). Devuelve NaN si no se puede interpretar.
 */
export function parseAmount(input: string): number {
  let s = input.trim().replace(/\s/g, "");
  if (!s) return NaN;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // El separador que aparece último es el decimal.
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount > 1 || /^\d{1,3},\d{3}$/.test(s)) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(",", ".");
    }
  } else if (hasDot) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      s = s.replace(/\./g, "");
    }
  }

  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/**
 * Indica si existe una tasa de cambio confiable entre dos monedas.
 * La app solo tiene tasa real Q↔USD; cualquier conversión USD↔EUR/£ no es
 * confiable (ver JSDoc de convertAmount) y debe bloquearse con este helper.
 */
export function hasReliableConversion(from: Currency, to: Currency): boolean {
  const isUsdEurOrGbpPair =
    (from === 'USD' && (to === 'EUR' || to === '£')) ||
    (to === 'USD' && (from === 'EUR' || from === '£'));
  return !isUsdEurOrGbpPair;
}

/** Formatea una fecha (solo año-mes-día, sin hora) como "YYYY-MM-DD" en horario local */
export function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parsea una cadena "YYYY-MM-DD" a un Date al mediodía local. Devuelve null si no es válida. */
export function parseDateOnly(s: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/**
 * Convierte una fecha-hora guardada (string ISO con hora, posiblemente vieja)
 * a una cadena solo-día "YYYY-MM-DD", evitando el corrimiento de día que
 * causaría convertir a horario local una fecha guardada a medianoche UTC.
 */
export function storedDateToDateOnly(stored: string): string {
  if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(stored)) {
    return stored.slice(0, 10);
  }
  const d = new Date(stored);
  return isNaN(d.getTime()) ? formatDateOnly(new Date()) : formatDateOnly(d);
}

/** Días hasta próximo pago */
export function getDaysUntilNextPayment(settings: UserSettings): number {
  const now = new Date();
  const today = now.getDate();
  const month = now.getMonth();
  const year = now.getFullYear();

  if (settings.paymentCycle === 'weekly') return 7 - now.getDay();

  if (settings.paymentCycle === 'biweekly') {
    const sortedRaw = [...settings.paymentDays].sort((a, b) => a - b);
    const days = sortedRaw.map(d => getEffectivePaymentDay(d, year, month));
    const next = days.find(d => d > today);
    if (next) return next - today;
    const firstNext = new Date(year, month + 1, getEffectivePaymentDay(sortedRaw[0], year, month + 1));
    return Math.ceil((firstNext.getTime() - now.getTime()) / 86400000);
  }

  if (settings.paymentCycle === 'monthly') {
    const eff = getEffectivePaymentDay(settings.paymentDay, year, month);
    if (today < eff) return eff - today;
    const nextPay = new Date(year, month + 1, getEffectivePaymentDay(settings.paymentDay, year, month + 1));
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
    const D = (yy: number, mm: number, dd: number) => new Date(yy, mm, dd);
    const e1 = (mo: number) => getEffectivePaymentDay(d1, y, mo);
    const e2 = (mo: number) => getEffectivePaymentDay(d2, y, mo);
    let start: Date, end: Date, prevStart: Date, prevEnd: Date;

    if (today >= e2(m)) {
      // Segunda quincena: e2(m) → e1(m+1) del mes siguiente
      start = D(y, m, e2(m));
      end = dayBefore(D(y, m + 1, e1(m + 1)));
      prevStart = D(y, m, e1(m));
      prevEnd = dayBefore(start);
    } else if (today >= e1(m)) {
      // Primera quincena: e1(m) → e2(m)-1
      start = D(y, m, e1(m));
      end = dayBefore(D(y, m, e2(m)));
      prevStart = D(y, m - 1, e2(m - 1));
      prevEnd = dayBefore(start);
    } else {
      // Antes del e1(m): última quincena del mes pasado
      start = D(y, m - 1, e2(m - 1));
      end = dayBefore(D(y, m, e1(m)));
      prevStart = D(y, m - 1, e1(m - 1));
      prevEnd = dayBefore(start);
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
  const P = settings.paymentDay;
  const e = (mo: number) => getEffectivePaymentDay(P, y, mo);

  let start: Date, end: Date, prevStart: Date, prevEnd: Date, nextStart: Date;

  if (today >= e(m)) {
    // Estamos dentro del período: desde e(m) de este mes
    start = new Date(y, m, e(m));
    nextStart = new Date(y, m + 1, e(m + 1));
    prevStart = new Date(y, m - 1, e(m - 1));
  } else {
    // Antes de e(m): período empezó el mes pasado
    start = new Date(y, m - 1, e(m - 1));
    nextStart = new Date(y, m, e(m));
    prevStart = new Date(y, m - 2, e(m - 2));
  }
  end = dayBefore(nextStart);
  prevEnd = dayBefore(start);

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

/**
 * Patrimonio neto total desde cuentas.
 * Las cuentas de tipo 'credit' (tarjetas) se EXCLUYEN por completo: no son
 * activos ni se restan como pasivo aquí. Sus saldos y el pendiente de
 * visacuotas se reportan aparte como "compromisos de crédito"
 * (ver calcCreditCommitments) para no mezclar patrimonio con deuda de tarjeta.
 */
export function calcNetWorthFromAccounts(accounts: Account[], exchangeRate: number): { totalQ: number; totalUSD: number; totalEUR: number; totalGBP: number } {
  let totalQ = 0;
  let totalUSD = 0;
  let totalEUR = 0;
  let totalGBP = 0;

  for (const acc of accounts) {
    if (!acc.isActive) continue;
    if (acc.type === 'credit') continue;
    const amount = acc.balance;

    if (acc.currency === 'Q') totalQ += amount;
    if (acc.currency === 'USD') totalUSD += amount;
    if (acc.currency === 'EUR') totalEUR += amount;
    if (acc.currency === '£') totalGBP += amount;
  }

  return { totalQ, totalUSD, totalEUR, totalGBP };
}

/**
 * Convierte un monto entre monedas usando Q como moneda puente.
 * Para EUR/£ no hay tasa de cambio disponible en la app: se asumen 1:1
 * respecto a Q (misma limitación que el resto del código; no se introduce
 * infraestructura nueva de FX). Como consecuencia, una conversión USD↔EUR/£
 * no es confiable (pasa por Q con una tasa 1:1 inventada); usar
 * hasReliableConversion() para detectar y bloquear ese caso antes de llamar
 * a esta función donde el resultado se le muestra o aplica al usuario.
 */
export function convertAmount(amount: number, from: Currency, to: Currency, exchangeRate: number): number {
  if (from === to) return amount;
  const q = from === 'USD' ? amount * exchangeRate : amount;
  return to === 'USD' ? q / exchangeRate : q;
}

/**
 * Compromisos de crédito, calculados aparte del patrimonio neto:
 * Las tarjetas de crédito ya no tienen saldo propio (siempre sería 0);
 * toda su deuda vive en las visacuotas asociadas.
 * - installmentsPendingQ: monto pendiente (no el total) de las visacuotas activas (convertido a Q)
 */
export function calcCreditCommitments(installments: CreditInstallment[], exchangeRate: number): { installmentsPendingQ: number } {
  const installmentsPendingQ = installments
    .filter(i => i.isActive)
    .reduce((s, i) => {
      const pending = Math.max(0, i.totalAmount - i.monthlyPayment * i.paidInstallments);
      return s + convertAmount(pending, i.currency, 'Q', exchangeRate);
    }, 0);

  return { installmentsPendingQ };
}

/** Cuota mensual pendiente de visacuotas, en Q */
export function getMonthlyInstallmentTotal(installments: CreditInstallment[], exchangeRate: number): number {
  return installments
    .filter(i => i.isActive && i.paidInstallments < i.totalInstallments)
    .reduce((s, i) => s + convertAmount(i.monthlyPayment, i.currency, 'Q', exchangeRate), 0);
}

/** Cuota mensual total de las visacuotas activas ligadas a una cuenta (tarjeta) específica, convertida a targetCurrency */
export function getAccountMonthlyInstallmentTotal(installments: CreditInstallment[], accountId: string, exchangeRate: number, targetCurrency: Currency): number {
  return installments
    .filter(i => i.accountId === accountId && i.isActive && i.paidInstallments < i.totalInstallments)
    .reduce((s, i) => s + convertAmount(i.monthlyPayment, i.currency, targetCurrency, exchangeRate), 0);
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

  /**
   * Igual que getSettings() pero sin try/catch: los errores se propagan.
   * Usado donde una falla silenciosa sería peligrosa (ej. el gate biométrico),
   * para poder distinguir "no hay configuración guardada" de "algo falló".
   */
  async getSettingsOrThrow(): Promise<UserSettings> {
    const data = await AsyncStorage.getItem(K.SETTINGS);
    return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
  },

  async saveSettings(s: UserSettings): Promise<void> {
    try { await AsyncStorage.setItem(K.SETTINGS, JSON.stringify(s)); } catch { }
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
    // a diferencia de saveAccounts, propaga el error
    await AsyncStorage.setItem(K.ACCOUNTS, JSON.stringify(updated));
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

  /** Transferencia en una sola lectura+escritura para no dejar saldos a medias */
  async transferBetweenAccounts(fromId: string, toId: string, fromDelta: number, toDelta: number): Promise<Account[]> {
    const all = await this.getAccounts();
    const fromAcc = all.find(a => a.id === fromId);
    const toAcc = all.find(a => a.id === toId);
    if (fromId === toId || !fromAcc || !toAcc) return all;
    const updated = all.map(a => {
      if (a.id === fromId) return { ...a, balance: a.balance + fromDelta };
      if (a.id === toId) return { ...a, balance: a.balance + toDelta };
      return a;
    });
    await this.saveAccounts(updated);
    return updated;
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

  /** Agrega una visacuota nueva (usado al convertir un movimiento existente en visacuota). Las tarjetas ya no tienen saldo propio, así que no se ajusta ningún balance. */
  async addInstallmentAndAdjustBalance(item: CreditInstallment): Promise<{ installments: CreditInstallment[]; accounts: Account[] }> {
    const installments = await this.addCreditInstallment(item);
    const accounts = await this.getAccounts();
    return { installments, accounts };
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
    const updated: CreditInstallment[] = [];
    for (const item of all) {
      if (!item.isActive || item.paidInstallments >= item.totalInstallments) {
        updated.push(item);
        continue;
      }
      const newPaid = item.paidInstallments + 1;
      updated.push({
        ...item,
        paidInstallments: newPaid,
        isActive: newPaid < item.totalInstallments,
      });
    }
    await this.saveCreditInstallments(updated);
  },

  // ── Estado de notificaciones ──────────────────────────────
  async getNotificationState(): Promise<NotificationState> {
    try {
      const data = await AsyncStorage.getItem(K.NOTIFICATION_STATE);
      return data ? { setupNudgesShown: [], ...JSON.parse(data) } : { setupNudgesShown: [] };
    } catch { return { setupNudgesShown: [] }; }
  },

  async saveNotificationState(s: NotificationState): Promise<void> {
    try { await AsyncStorage.setItem(K.NOTIFICATION_STATE, JSON.stringify(s)); } catch { }
  },

  async markSetupNudgesShown(ids: string[]): Promise<void> {
    const prev = await this.getNotificationState();
    const setupNudgesShown = Array.from(new Set([...prev.setupNudgesShown, ...ids]));
    await this.saveNotificationState({ ...prev, setupNudgesShown });
  },

  async setWeeklySummaryFireAt(iso: string): Promise<void> {
    const prev = await this.getNotificationState();
    await this.saveNotificationState({ ...prev, weeklySummaryFireAt: iso });
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
    const nowY = now.getFullYear();
    const nowM = now.getMonth();
    const currentMonth = `${nowY}-${nowM}`;

    const match = lastReset ? /^(\d{4})-(\d{1,2})$/.exec(lastReset) : null;
    if (!match) {
      // Sin registro previo o con formato inválido: un solo ciclo, como antes.
      await this.resetFixedExpensesForNewMonth();
      await this.processMonthlyInstallments();
      await this.saveLastResetDate(currentMonth);
      return true;
    }

    const lastY = Number(match[1]);
    const lastM = Number(match[2]);
    const elapsed = (nowY * 12 + nowM) - (lastY * 12 + lastM);

    if (elapsed <= 0) {
      // Reloj del dispositivo atrasado (o mismo mes): no se guarda nada.
      return false;
    }

    // Tope de 120 meses (10 años) solo como protección ante un lastReset
    // corrupto o absurdamente viejo; no es un límite funcional esperado.
    const cycles = Math.min(elapsed, 120);
    for (let i = 0; i < cycles; i++) {
      await this.resetFixedExpensesForNewMonth();
      await this.processMonthlyInstallments();
    }
    await this.saveLastResetDate(currentMonth);
    return true;
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