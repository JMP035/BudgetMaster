import { Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { StorageService, Transaction, Currency } from './storage';
import { detectBankName } from '../ai';
import { detectCategory, buildSmartDescription } from './Categorizer';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

function detectCurrency(body: string): Currency {
  const b = body.toUpperCase();
  if (b.includes('USD') || b.includes('US$') || b.includes('DOLAR')) return 'USD';
  if (b.includes('EUR') || b.includes('EURO')) return 'EUR';
  if (b.includes('GBP') || b.includes('£')) return '£';
  return 'Q';
}

function extractAmount(body: string): number | null {
  const patterns = [
    /[Mm]onto\s*:\s*(?:Q\.?|GTQ|USD?|EUR?|GBP|£)\s*([\d,]+(?:\.\d{1,2})?)/,
    /[Aa]probada\s+por\s+(?:Q\.?|GTQ|USD?|EUR?)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /por\s+(?:Q\.?|GTQ|USD?|EUR?)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /(?:Q\.?|GTQ)\s*([\d,]+(?:\.\d{1,2})?)/,
    /(?:USD|EUR|GBP)\s*([\d,]+(?:\.\d{1,2})?)/i,
    /([\d,]+(?:\.\d{1,2})?)\s*(?:Q|GTQ|USD|EUR)\b/i,
  ];
  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > 0 && value < 1000000) return value;
    }
  }
  return null;
}

function detectTransactionType(body: string): 'income' | 'expense' {
  const b = body.toLowerCase();
  const incomeKeywords = [
    'abono', 'deposito', 'depósito', 'acredito', 'acreditó',
    'acreditado', 'recibida', 'ingreso', 'transferencia recibida',
    'se acredito', 'credito en su cuenta',
  ];
  return incomeKeywords.some(k => b.includes(k)) ? 'income' : 'expense';
}

// detectCategory y buildSmartDescription ahora vienen del Categorizer centralizado

function generateSmsId(body: string, date: number): string {
  const base = `${date}-${body.trim().substring(0, 40)}`;
  let hash = 0;
  for (let i = 0; i < base.length; i++) {
    hash = ((hash << 5) - hash) + base.charCodeAt(i);
    hash |= 0;
  }
  return `sms_${Math.abs(hash).toString(36)}`;
}

// ─────────────────────────────────────────────────────────────
// KEYWORDS
// ─────────────────────────────────────────────────────────────
function msgContainsBankKeywords(text: string): boolean {
  const t = text.toLowerCase();
  const keywords = [
    'compra', 'consumo', 'retiro', 'debito', 'debitado',
    'abono', 'deposito', 'depósito', 'transferencia', 'pago',
    'aprobada por', 'bac visa', 'bac mastercard', 'prf protege',
    'se debito', 'se acredito', 'cuenta monetaria', 'banrural',
    'retiro de atm', 'tarjeta de debito', 'no. autorizacion', 'monto:',
    'informamos', 'debito ift', 'gtq',
    'promerica', 'notificame', 'transaccion autorizada',
    'acreditado', 'acredito', 'cargo', 'movimiento',
    'seguro', 'insurance',
  ];
  return keywords.some(k => t.includes(k));
}

function isOwnTransfer(body: string): boolean {
  const b = body.toLowerCase();
  const ownKeywords = ['transferencia inmediata', 'tif', 'transferencias inmediatas', 'entre cuentas'];
  const hasTransfer = ownKeywords.some(k => b.includes(k));
  const hasDebit = b.includes('debito') || b.includes('se debito');
  const hasCredit = b.includes('acredito') || b.includes('se acredito');
  return hasTransfer && (hasDebit || hasCredit);
}

// ─────────────────────────────────────────────────────────────
// RESULTADO DEL SYNC
// ─────────────────────────────────────────────────────────────
export interface SyncResult {
  transactions: Transaction[];
  totalRead: number;
  totalMatched: number;
  totalSkipped: number;
  totalIgnored: number;
}

// ─────────────────────────────────────────────────────────────
// SERVICIO PRINCIPAL
// ─────────────────────────────────────────────────────────────
export const SmsService = {

  async syncBankSms(): Promise<SyncResult> {
    if (Platform.OS !== 'android') {
      return { transactions: [], totalRead: 0, totalMatched: 0, totalSkipped: 0, totalIgnored: 0 };
    }

    const filter = { box: 'inbox', indexFrom: 0, maxCount: 300 };

    return new Promise((resolve, reject) => {
      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: string) => { console.error('SMS list failed:', fail); reject(new Error(fail)); },
        async (_count: number, smsList: string) => {
          let messages: Array<{ body: string; date: number; address: string }> = [];
          try { messages = JSON.parse(smsList); } catch {
            resolve({ transactions: [], totalRead: 0, totalMatched: 0, totalSkipped: 0, totalIgnored: 0 });
            return;
          }

          const totalRead = messages.length;
          let totalMatched = 0;
          let totalSkipped = 0;
          let totalIgnored = 0;
          const newTransactions: Transaction[] = [];

          const now = new Date();
          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();

          for (const sms of messages) {
            try {
              if (sms.date < threeMonthsAgo) continue;
              const body = sms.body;
              if (!msgContainsBankKeywords(body)) continue;
              totalMatched++;

              if (isOwnTransfer(body)) { totalIgnored++; continue; }

              const parsed = this.parseSimpleSms(body, sms.date);
              if (!parsed) { totalIgnored++; continue; }

              const exists = await this.checkIfExists(parsed.id);
              if (exists) { totalSkipped++; continue; }

              await StorageService.addTransaction(parsed);
              newTransactions.push(parsed);
            } catch (e) {
              console.warn('SMS parse error:', e);
              continue;
            }
          }

          console.log(`SMS Sync: leídos=${totalRead}, bancarios=${totalMatched}, nuevos=${newTransactions.length}`);
          resolve({ transactions: newTransactions, totalRead, totalMatched, totalSkipped, totalIgnored });
        }
      );
    });
  },

  parseSimpleSms(body: string, smsDate?: number): Transaction | null {
    const amount = extractAmount(body);
    if (!amount) return null;

    const type = detectTransactionType(body);
    const category = detectCategory(body, type);
    const currency = detectCurrency(body);
    const bank = detectBankName(body);
    const date = smsDate ? new Date(smsDate).toISOString() : new Date().toISOString();
    const description = buildSmartDescription(body, bank, type);
    const id = generateSmsId(body, smsDate ?? Date.now());

    return {
      id,
      amount,
      category,
      date,
      description,
      type,
      source: 'sms',
      currency,
      originalSMS: body,
      bank,
    };
  },

  async checkIfExists(id: string): Promise<boolean> {
    const all = await StorageService.getTransactions();
    return all.some(t => t.id === id);
  },
};