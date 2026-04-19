import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
export type Currency = 'Q' | 'USD' | 'EUR' | '£';

export interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: 'expense' | 'income';
  source: 'manual' | 'sms';
  currency: Currency;       // Moneda real de la transacción
  originalSMS?: string;
  bank?: string;
  location?: string;
}

export interface CustomCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  type: 'expense' | 'income' | 'both';
}

export interface UserSettings {
  userName: string;
  userTitle: string;
  budgetLimit: number;
  budgetLimitUSD: number;     // Presupuesto mensual en USD
  currency: Currency;         // Moneda principal del usuario
  smsEnabled: boolean;
  externalSavings: number;
  externalSavingsUSD: number; // Ahorros externos en USD
  onboardingComplete: boolean;
  tutorialComplete: boolean;
  geminiApiKey?: string;
  exchangeRate: number;       // Tipo de cambio USD → Q (default 7.70)
  customCategories: CustomCategory[];
}

export interface AppData {
  transactions: Transaction[];
  settings: UserSettings;
  currentMonthSpent: number;
  lastResetDate: string;
}

// ─────────────────────────────────────────────────────────────
// CLAVES DE ALMACENAMIENTO
// ─────────────────────────────────────────────────────────────
const STORAGE_KEYS = {
  TRANSACTIONS: '@budgetmaster_transactions',
  SETTINGS: '@budgetmaster_settings',
  LAST_RESET: '@budgetmaster_last_reset',
  CUSTOM_CATEGORIES: '@budgetmaster_custom_categories',
};

// ─────────────────────────────────────────────────────────────
// VALORES POR DEFECTO
// ─────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS: UserSettings = {
  userName: 'Usuario',
  userTitle: 'BudgetMaster Pro',
  budgetLimit: 6000,
  budgetLimitUSD: 800,
  currency: 'Q',
  smsEnabled: true,
  externalSavings: 0,
  externalSavingsUSD: 0,
  onboardingComplete: false,
  tutorialComplete: false,
  geminiApiKey: '',
  exchangeRate: 7.70,
  customCategories: [],
};

// ─────────────────────────────────────────────────────────────
// SERVICIO DE ALMACENAMIENTO
// ─────────────────────────────────────────────────────────────
export const StorageService = {

  // ── Transacciones ──────────────────────────────────────────
  async getTransactions(): Promise<Transaction[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      if (!data) return [];
      const txs: Transaction[] = JSON.parse(data);
      // Migración: transacciones viejas sin campo currency reciben la moneda default
      return txs.map(t => ({ ...t, currency: t.currency ?? 'Q' }));
    } catch (error) {
      console.error('Error loading transactions:', error);
      return [];
    }
  },

  async saveTransactions(transactions: Transaction[]): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.TRANSACTIONS, JSON.stringify(transactions));
    } catch (error) {
      console.error('Error saving transactions:', error);
    }
  },

  async addTransaction(transaction: Transaction): Promise<Transaction[]> {
    const transactions = await this.getTransactions();
    const updated = [transaction, ...transactions];
    await this.saveTransactions(updated);
    return updated;
  },

  async deleteTransaction(id: string): Promise<Transaction[]> {
    const transactions = await this.getTransactions();
    const updated = transactions.filter(t => t.id !== id);
    await this.saveTransactions(updated);
    return updated;
  },

  async updateTransaction(updated: Transaction): Promise<Transaction[]> {
    const transactions = await this.getTransactions();
    const list = transactions.map(t => t.id === updated.id ? updated : t);
    await this.saveTransactions(list);
    return list;
  },

  // ── Configuración ──────────────────────────────────────────
  async getSettings(): Promise<UserSettings> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : DEFAULT_SETTINGS;
    } catch (error) {
      console.error('Error loading settings:', error);
      return DEFAULT_SETTINGS;
    }
  },

  async saveSettings(settings: UserSettings): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch (error) {
      console.error('Error saving settings:', error);
    }
  },

  // ── Categorías personalizadas ───────────────────────────────
  async getCustomCategories(): Promise<CustomCategory[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.CUSTOM_CATEGORIES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Error loading custom categories:', error);
      return [];
    }
  },

  async saveCustomCategory(cat: CustomCategory): Promise<CustomCategory[]> {
    const all = await this.getCustomCategories();
    const updated = [...all, cat];
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOM_CATEGORIES, JSON.stringify(updated));
    return updated;
  },

  async deleteCustomCategory(id: string): Promise<CustomCategory[]> {
    const all = await this.getCustomCategories();
    const updated = all.filter(c => c.id !== id);
    await AsyncStorage.setItem(STORAGE_KEYS.CUSTOM_CATEGORIES, JSON.stringify(updated));
    return updated;
  },

  // ── Reset mensual ───────────────────────────────────────────
  async getLastResetDate(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(STORAGE_KEYS.LAST_RESET);
    } catch (error) {
      console.error('Error loading last reset date:', error);
      return null;
    }
  },

  async saveLastResetDate(date: string): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_RESET, date);
    } catch (error) {
      console.error('Error saving last reset date:', error);
    }
  },

  async checkMonthlyReset(): Promise<boolean> {
    const lastReset = await this.getLastResetDate();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth()}`;
    if (lastReset !== currentMonth) {
      await this.saveLastResetDate(currentMonth);
      return true;
    }
    return false;
  },

  // ── Cargar todos los datos ──────────────────────────────────
  async loadAllData(): Promise<AppData> {
    const [transactions, settings, lastResetDate] = await Promise.all([
      this.getTransactions(),
      this.getSettings(),
      this.getLastResetDate(),
    ]);

    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    // Gasto del mes en moneda principal (Q)
    const currentMonthSpent = transactions.reduce((total, t) => {
      const tDate = new Date(t.date);
      if (
        t.type === 'expense' &&
        t.currency === 'Q' &&
        tDate.getMonth() === currentMonth &&
        tDate.getFullYear() === currentYear
      ) {
        return total + t.amount;
      }
      return total;
    }, 0);

    return {
      transactions,
      settings,
      currentMonthSpent,
      lastResetDate: lastResetDate || new Date().toISOString(),
    };
  },

  // ── Limpiar todos los datos ─────────────────────────────────
  async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.TRANSACTIONS,
        STORAGE_KEYS.SETTINGS,
        STORAGE_KEYS.LAST_RESET,
        STORAGE_KEYS.CUSTOM_CATEGORIES,
      ]);
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  },

  async resetMonth(): Promise<void> {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth()}`;
    const transactions = await this.getTransactions();
    const kept = transactions.filter(t => {
      const d = new Date(t.date);
      return d.getFullYear() < now.getFullYear() ||
        (d.getFullYear() === now.getFullYear() && d.getMonth() < now.getMonth());
    });
    await Promise.all([
      this.saveTransactions(kept),
      this.saveLastResetDate(currentMonth),
    ]);
  },
};