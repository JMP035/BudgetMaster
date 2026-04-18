import AsyncStorage from '@react-native-async-storage/async-storage';

// Tipos
export interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: 'expense' | 'income';
  source: 'manual' | 'sms';
  originalSMS?: string;
  bank?: string;
  location?: string;
}

export interface UserSettings {
  userName: string;
  userTitle: string;
  budgetLimit: number;
  currency: string;
  smsEnabled: boolean;
  externalSavings: number;
  onboardingComplete: boolean;
  tutorialComplete: boolean;
  geminiApiKey?: string;
}

export interface AppData {
  transactions: Transaction[];
  settings: UserSettings;
  currentMonthSpent: number;
  lastResetDate: string;
}

// Claves de almacenamiento
const STORAGE_KEYS = {
  TRANSACTIONS: '@budgetmaster_transactions',
  SETTINGS: '@budgetmaster_settings',

  LAST_RESET: '@budgetmaster_last_reset',
};

// Valores por defecto
const DEFAULT_SETTINGS: UserSettings = {
  userName: 'Usuario',
  userTitle: 'BudgetMaster Pro',
  budgetLimit: 6000,
  currency: 'Q',
  smsEnabled: true,
  externalSavings: 0,
  onboardingComplete: false,
  tutorialComplete: false,
  geminiApiKey: '',
};

// Funciones de almacenamiento

export const StorageService = {
  // Transacciones
  async getTransactions(): Promise<Transaction[]> {
    try {
      const data = await AsyncStorage.getItem(STORAGE_KEYS.TRANSACTIONS);
      return data ? JSON.parse(data) : [];
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

  // Configuración
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



  // Reset mensual
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

  // Verificar si necesita reset mensual
  async checkMonthlyReset(): Promise<boolean> {
    const lastReset = await this.getLastResetDate();
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth()}`;

    if (lastReset !== currentMonth) {
      // Solo actualizamos la fecha, el cálculo se hace dinámicamente
      await this.saveLastResetDate(currentMonth);
      return true;
    }
    return false;
  },

  // Cargar todos los datos
  async loadAllData(): Promise<AppData> {
    const [transactions, settings, lastResetDate] = await Promise.all([
      this.getTransactions(),
      this.getSettings(),
      this.getLastResetDate(),
    ]);

    // Calcular gasto del mes actual dinámicamente
    const now = new Date();
    const currentMonth = now.getMonth();
    const currentYear = now.getFullYear();

    const currentMonthSpent = transactions.reduce((total, t) => {
      const tDate = new Date(t.date);
      if (
        t.type === 'expense' &&
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

  // Limpiar todos los datos
  async clearAllData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        STORAGE_KEYS.TRANSACTIONS,
        STORAGE_KEYS.SETTINGS,

        STORAGE_KEYS.LAST_RESET,
      ]);
    } catch (error) {
      console.error('Error clearing data:', error);
    }
  },

  // Reiniciar solo el mes actual (mantener historial de meses anteriores)
  async resetMonth(): Promise<void> {
    const now = new Date();
    const currentMonth = `${now.getFullYear()}-${now.getMonth()}`;
    const transactions = await this.getTransactions();
    // Keep transactions from previous months
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
