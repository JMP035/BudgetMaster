import { PermissionsAndroid, Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { StorageService, Transaction } from './storage';
import { detectBankName } from '../ai';

export const SmsService = {
  async requestPermissions() {
    if (Platform.OS !== 'android') return false;
    
    try {
      const granted = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.READ_SMS,
        PermissionsAndroid.PERMISSIONS.RECEIVE_SMS,
      ]);
      
      return (
        granted['android.permission.READ_SMS'] === PermissionsAndroid.RESULTS.GRANTED &&
        granted['android.permission.RECEIVE_SMS'] === PermissionsAndroid.RESULTS.GRANTED
      );
    } catch (err) {
      console.warn(err);
      return false;
    }
  },

  async syncBankSms() {
    if (Platform.OS !== 'android') return [];

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return [];

    const filter = {
      box: 'inbox',
      read: 0,
      indexFrom: 0,
      maxCount: 20,
    };

    return new Promise((resolve, reject) => {
      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: string) => {
          console.error("Failed to list SMS: ", fail);
          reject(fail);
        },
        async (count: number, smsList: string) => {
          const messages = JSON.parse(smsList);
          const newTransactions: Transaction[] = [];

          for (const sms of messages) {
            const body = sms.body;
            if (msgContainsBankKeywords(body)) {
                const parsed = this.parseSimpleSms(body);
                if (parsed) {
                    const exists = await this.checkIfExists(parsed);
                    if (!exists) {
                        await StorageService.addTransaction(parsed);
                        newTransactions.push(parsed);
                    }
                }
            }
          }
          resolve(newTransactions);
        }
      );
    });
  },

  parseSimpleSms(body: string): Transaction | null {
    const amountMatch = body.match(/(?:Q|\$|USD|GTQ)\.?\s?([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)/i) || 
                       body.match(/([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2})?)\s?(?:Q|\$|USD|GTQ)/i);
    
    if (!amountMatch) return null;

    const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
    const isIncome = body.toLowerCase().includes("abono") || body.toLowerCase().includes("deposito") || body.toLowerCase().includes("recibida");
    
    return {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      amount: amount,
      category: isIncome ? 'income' : 'shopping',
      date: new Date().toISOString(),
      description: `SMS: ${body.substring(0, 30)}...`,
      type: isIncome ? 'income' : 'expense',
      source: 'sms', // CAMPO OBLIGATORIO CORREGIDO
      originalSMS: body,
      bank: detectBankName(body)
    };
  },

  async checkIfExists(newTx: Transaction): Promise<boolean> {
    const all = await StorageService.getTransactions();
    return all.some(t => t.amount === newTx.amount && t.description === newTx.description);
  }
};

function msgContainsBankKeywords(text: string): boolean {
    const t = text.toLowerCase();
    const keywords = ["compra", "retiro", "consumo", "abono", "deposito", "transferencia", "pago", "debitado"];
    return keywords.some(k => t.includes(k));
}
