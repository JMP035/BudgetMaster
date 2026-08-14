import { Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { Account, CreditInstallment, StorageService, Transaction } from './storage';
import { detectBankName } from '../ai';
import { detectCategory, buildSmartDescription, extractMerchantName, normalizeText } from './Categorizer';
import {
  detectCurrency, extractAmount, detectTransactionType,
  detectInstallments, extractBankReference, isTransactionalSms, buildDedupeId,
} from './BankSmsParser';

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
// RESULTADO DEL PARSEO / SYNC
// ─────────────────────────────────────────────────────────────
export interface ParsedSmsResult {
  kind: 'transaction' | 'installment';
  transaction?: Transaction;
  installment?: CreditInstallment;
}

export interface SyncResult {
  transactions: Transaction[];
  installments: CreditInstallment[];
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
      return { transactions: [], installments: [], totalRead: 0, totalMatched: 0, totalSkipped: 0, totalIgnored: 0 };
    }

    const filter = { box: 'inbox', indexFrom: 0, maxCount: 2000 };
    const accounts = await StorageService.getAccounts();

    return new Promise((resolve, reject) => {
      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: string) => { console.error('SMS list failed:', fail); reject(new Error(fail)); },
        async (_count: number, smsList: string) => {
          let messages: Array<{ body: string; date: number; address: string }> = [];
          try { messages = JSON.parse(smsList); } catch {
            resolve({ transactions: [], installments: [], totalRead: 0, totalMatched: 0, totalSkipped: 0, totalIgnored: 0 });
            return;
          }

          const totalRead = messages.length;
          let totalMatched = 0;
          let totalSkipped = 0;
          let totalIgnored = 0;
          const newTransactions: Transaction[] = [];
          const newInstallments: CreditInstallment[] = [];

          const now = new Date();
          const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();

          for (const sms of messages) {
            try {
              if (sms.date < threeMonthsAgo) continue;
              const body = sms.body;
              if (!msgContainsBankKeywords(body)) continue;
              totalMatched++;

              if (isOwnTransfer(body)) { totalIgnored++; continue; }

              const parsed = this.parseSimpleSms(body, sms.date, accounts);
              if (!parsed) { totalIgnored++; continue; }

              const dedupeId = parsed.kind === 'transaction' ? parsed.transaction!.id : parsed.installment!.id;
              const exists = await this.checkIfExists(dedupeId);
              if (exists) { totalSkipped++; continue; }

              if (parsed.kind === 'transaction') {
                await StorageService.addTransaction(parsed.transaction!);
                newTransactions.push(parsed.transaction!);
              } else {
                await StorageService.addCreditInstallment(parsed.installment!);
                if (parsed.installment!.accountId) {
                  await StorageService.adjustAccountBalance(parsed.installment!.accountId, parsed.installment!.totalAmount);
                }
                newInstallments.push(parsed.installment!);
              }
            } catch (e) {
              console.warn('SMS parse error:', e);
              continue;
            }
          }

          console.log(`SMS Sync: leídos=${totalRead}, bancarios=${totalMatched}, transacciones=${newTransactions.length}, cuotas=${newInstallments.length}`);
          resolve({ transactions: newTransactions, installments: newInstallments, totalRead, totalMatched, totalSkipped, totalIgnored });
        }
      );
    });
  },

  parseSimpleSms(body: string, smsDate?: number, accounts: Account[] = []): ParsedSmsResult | null {
    if (!isTransactionalSms(body)) return null;

    const amount = extractAmount(body);
    if (!amount) return null;

    const type = detectTransactionType(body);
    const currency = detectCurrency(body);
    const bank = detectBankName(body);
    const date = smsDate ? new Date(smsDate).toISOString() : new Date().toISOString();
    const merchant = extractMerchantName(body);
    const bankRef = extractBankReference(body);
    const dedupeId = buildDedupeId({ bank, amount, merchant: merchant || '', dateISO: date, bankRef });

    const installmentInfo = type === 'expense' ? detectInstallments(body) : null;

    if (installmentInfo) {
      const matches = accounts.filter(a =>
        a.type === 'credit' && a.isActive && a.bankName &&
        normalizeText(a.bankName).includes(normalizeText(bank))
      );
      const accountId = matches.length === 1 ? matches[0].id : '';
      const monthlyPayment = Math.round((amount / installmentInfo.totalInstallments) * 100) / 100;

      const installment: CreditInstallment = {
        id: dedupeId,
        accountId,
        name: merchant || 'Compra a cuotas',
        totalAmount: amount,
        monthlyPayment,
        totalInstallments: installmentInfo.totalInstallments,
        paidInstallments: 0,
        startDate: date,
        currency,
        category: detectCategory(body, 'expense'),
        isActive: true,
        notes: `Detectado automáticamente por SMS (${bank})`,
      };

      return { kind: 'installment', installment };
    }

    const category = detectCategory(body, type);
    const description = buildSmartDescription(body, bank, type);

    const transaction: Transaction = {
      id: dedupeId,
      amount,
      category,
      date,
      description,
      type,
      source: 'sms',
      currency,
      originalSMS: body,
      bank,
      bankRef: bankRef || undefined,
    };

    return { kind: 'transaction', transaction };
  },

  async checkIfExists(id: string): Promise<boolean> {
    const [txs, installments] = await Promise.all([
      StorageService.getTransactions(),
      StorageService.getCreditInstallments(),
    ]);
    return txs.some(t => t.id === id) || installments.some(i => i.id === id);
  },
};
