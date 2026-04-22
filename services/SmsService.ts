import { Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { StorageService, Transaction, Currency } from './storage';
import { detectBankName } from '../ai';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Detecta la moneda real del SMS */
function detectCurrency(body: string): Currency {
  const b = body.toUpperCase();
  if (b.includes('USD') || b.includes('US$') || b.includes('DOLAR')) return 'USD';
  if (b.includes('EUR') || b.includes('EURO')) return 'EUR';
  if (b.includes('GBP') || b.includes('£')) return '£';
  return 'Q';
}

/** Extrae el monto numérico — soporta todos los formatos GT */
function extractAmount(body: string): number | null {
  const patterns = [
    // "Monto: Q. 500.00" / "Monto: USD 10.00"
    /[Mm]onto\s*:\s*(?:Q\.?|GTQ|USD?|EUR?|GBP|£)\s*([\d,]+(?:\.\d{1,2})?)/,
    // "Aprobada por Q 35.00" / "Aprobada por USD 10.00"
    /[Aa]probada\s+por\s+(?:Q\.?|GTQ|USD?|EUR?)\s*([\d,]+(?:\.\d{1,2})?)/i,
    // "por Q 201.30" / "por GTQ 700.00"
    /por\s+(?:Q\.?|GTQ|USD?|EUR?)\s*([\d,]+(?:\.\d{1,2})?)/i,
    // "Q.100.00" / "Q 35.00" / "GTQ 2200.00"
    /(?:Q\.?|GTQ)\s*([\d,]+(?:\.\d{1,2})?)/,
    // "USD 10.00" / "EUR 5.00"
    /(?:USD|EUR|GBP)\s*([\d,]+(?:\.\d{1,2})?)/i,
    // "201.30 Q" (monto antes de moneda)
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

/** Determina si el SMS es ingreso o gasto */
function detectTransactionType(body: string): 'income' | 'expense' {
  const b = body.toLowerCase();
  const incomeKeywords = [
    'abono', 'deposito', 'depósito', 'acredito', 'acreditó',
    'acreditado', 'recibida', 'ingreso', 'transferencia recibida',
    'se acredito', 'credito en su cuenta',
  ];
  return incomeKeywords.some(k => b.includes(k)) ? 'income' : 'expense';
}

/** Detecta transferencias entre cuentas propias (no contarlas como gasto real) */
function isOwnTransfer(body: string): boolean {
  const b = body.toLowerCase();
  const ownKeywords = [
    'transferencia inmediata', 'tif', 'transferencias inmediatas',
    'entre cuentas', 'cuenta propia', 'mismo titular',
  ];
  // Si tiene keyword de transferencia Y keyword de ingreso al mismo tiempo
  // probablemente es un movimiento interno
  const hasTransfer = ownKeywords.some(k => b.includes(k));
  const hasDebit = b.includes('debito') || b.includes('debitado') || b.includes('se debito');
  const hasCredit = b.includes('acredito') || b.includes('se acredito');
  // Solo marcamos como transferencia interna si ambos lados aparecen en el mismo SMS
  return hasTransfer && (hasDebit || hasCredit);
}

/** Categoría automática según comercio en el SMS */
function detectCategory(body: string, type: 'income' | 'expense'): string {
  if (type === 'income') return 'salary';
  const b = body.toLowerCase();
  if (b.match(/pizza|mcdon|burger|pollo|kfc|subway|irtra|restauran|comida|food|domino/)) return 'food';
  if (b.match(/walmart|despensa|hiper|supermercado|grocery|maxi/)) return 'groceries';
  if (b.match(/uber|taxi|gasolina|combustible|puma|shell|texaco/)) return 'fuel';
  if (b.match(/atm|retiro de atm/)) return 'atm';
  if (b.match(/netflix|spotify|disney|hbo|youtube|prime|streaming/)) return 'streaming';
  if (b.match(/steam|playstation|xbox|nintendo|game|juego/)) return 'entertainment';
  if (b.match(/farmacia|galeno|meykos|medicina|pharmacy/)) return 'pharmacy';
  if (b.match(/hospital|medico|doctor|clinica|salud/)) return 'health';
  if (b.match(/amazon|ebay|aliexpress|mercado libre/)) return 'shopping';
  if (b.match(/claro|tigo|movistar|internet|wifi|telefon/)) return 'internet';
  if (b.match(/agua|luz|eegsa|empagua|electricidad/)) return 'utilities';
  if (b.match(/google|apple|microsoft|cloud/)) return 'subscriptions';
  if (b.match(/hotel|airbnb|vuelo|aeropuerto|avianca|volaris/)) return 'travel';
  if (b.match(/transferencia|tif|inmediata/)) return 'transfer';
  return 'other';
}

/** ID determinístico basado en contenido — evita duplicados reales */
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
// KEYWORDS — todos los bancos GT cubiertos
// ─────────────────────────────────────────────────────────────
function msgContainsBankKeywords(text: string): boolean {
  const t = text.toLowerCase();
  const keywords = [
    // Operaciones genéricas
    'compra', 'consumo', 'retiro', 'debito', 'debitado',
    'abono', 'deposito', 'depósito', 'transferencia', 'pago',
    // BAC Credomatic
    'aprobada por', 'bac visa', 'bac mastercard', 'prf protege',
    // BANRURAL
    'se debito', 'se acredito', 'cuenta monetaria', 'banrural',
    // Banco GTC / G&T Continental
    'retiro de atm', 'tarjeta de debito', 'no. autorizacion', 'monto:',
    // BANTRAB
    'informamos', 'debito ift', 'gtq',
    // PROMERICA
    'promerica', 'notificame', 'transaccion autorizada',
    // Genéricos
    'acreditado', 'acredito', 'cargo', 'movimiento',
  ];
  return keywords.some(k => t.includes(k));
}

// ─────────────────────────────────────────────────────────────
// RESULTADO DEL SYNC
// ─────────────────────────────────────────────────────────────
export interface SyncResult {
  transactions: Transaction[];
  totalRead: number;
  totalMatched: number;
  totalSkipped: number;   // Ya existían
  totalIgnored: number;   // Sin monto o transferencias internas
}

// ─────────────────────────────────────────────────────────────
// SERVICIO PRINCIPAL
// ─────────────────────────────────────────────────────────────
export const SmsService = {

  async syncBankSms(): Promise<SyncResult> {
    if (Platform.OS !== 'android') {
      return { transactions: [], totalRead: 0, totalMatched: 0, totalSkipped: 0, totalIgnored: 0 };
    }

    // Permisos ya dados por ADB — no pedimos en runtime para evitar
    // que Android los rechace automáticamente en apps de sideload

    const filter = {
      box: 'inbox',
      indexFrom: 0,
      maxCount: 300, // Cubre 2 meses para la mayoría de usuarios
    };

    return new Promise((resolve, reject) => {
      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: string) => {
          console.error('Failed to list SMS:', fail);
          reject(new Error(fail));
        },
        async (_count: number, smsList: string) => {
          let messages: Array<{ body: string; date: number; address: string }> = [];

          try {
            messages = JSON.parse(smsList);
          } catch (e) {
            console.error('Error parsing SMS list:', e);
            resolve({ transactions: [], totalRead: 0, totalMatched: 0, totalSkipped: 0, totalIgnored: 0 });
            return;
          }

          const totalRead = messages.length;
          let totalMatched = 0;
          let totalSkipped = 0;
          let totalIgnored = 0;
          const newTransactions: Transaction[] = [];

          // Filtrar por los últimos 2 meses
          const now = new Date();
          const twoMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime();

          for (const sms of messages) {
            try {
              // Solo procesar SMS de los últimos 2 meses
              if (sms.date < twoMonthsAgo) continue;

              const body = sms.body;
              if (!msgContainsBankKeywords(body)) continue;
              totalMatched++;

              // Ignorar transferencias internas
              if (isOwnTransfer(body)) {
                totalIgnored++;
                continue;
              }

              const parsed = this.parseSimpleSms(body, sms.date);
              if (!parsed) {
                totalIgnored++;
                continue;
              }

              const exists = await this.checkIfExists(parsed.id);
              if (exists) {
                totalSkipped++;
                continue;
              }

              await StorageService.addTransaction(parsed);
              newTransactions.push(parsed);

            } catch (e) {
              console.warn('Error processing SMS:', e);
              continue;
            }
          }

          console.log(`SMS Sync: leídos=${totalRead}, bancarios=${totalMatched}, nuevos=${newTransactions.length}, omitidos=${totalSkipped}, ignorados=${totalIgnored}`);
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
    const shortBody = body.replace(/\s+/g, ' ').trim().substring(0, 40);
    const description = `${bank}: ${shortBody}...`;
    const id = generateSmsId(body, smsDate ?? Date.now());

    return {
      id,
      amount,
      category,
      date,
      description,
      type,
      source: 'sms',
      currency,                // ← Moneda real detectada del SMS
      originalSMS: body,
      bank,
    };
  },

  /** Verifica duplicado por ID determinístico */
  async checkIfExists(id: string): Promise<boolean> {
    const all = await StorageService.getTransactions();
    return all.some(t => t.id === id);
  },
};