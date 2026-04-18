import { PermissionsAndroid, Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { StorageService, Transaction } from './storage';
import { detectBankName } from '../ai';

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Inicio y fin del mes actual en timestamps */
function getCurrentMonthRange(): { minDate: number; maxDate: number } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
  return { minDate: start.getTime(), maxDate: end.getTime() };
}

/** Detecta la moneda del SMS → "Q", "USD", "EUR" */
function detectCurrency(body: string): string {
  const b = body.toUpperCase();
  if (b.includes('USD') || b.includes('US$') || b.includes('DOLAR')) return 'USD';
  if (b.includes('EUR') || b.includes('EURO')) return 'EUR';
  return 'Q'; // default quetzales
}

/** Extrae el monto numérico del SMS — soporta todos los formatos GT */
function extractAmount(body: string): number | null {
  const patterns = [
    // "Monto: Q. 500.00"  /  "Monto: Q.37.45"
    /[Mm]onto\s*:\s*(?:Q\.?|GTQ|USD?|EUR?)\s*([\d,]+(?:\.\d{1,2})?)/,
    // "por Q 201.30"  /  "por GTQ 700.00"
    /por\s+(?:Q\.?|GTQ|USD?|EUR?)\s*([\d,]+(?:\.\d{1,2})?)/i,
    // "Q.100.00"  /  "Q 35.00"  /  "GTQ 2200.00"
    /(?:Q\.?|GTQ|USD?|EUR?)\s*([\d,]+(?:\.\d{1,2})?)/i,
    // "201.30 Q"  (monto antes de moneda)
    /([\d,]+(?:\.\d{1,2})?)\s*(?:Q|GTQ|USD|EUR)/i,
  ];

  for (const pattern of patterns) {
    const match = body.match(pattern);
    if (match) {
      const value = parseFloat(match[1].replace(/,/g, ''));
      if (!isNaN(value) && value > 0) return value;
    }
  }
  return null;
}

/** Determina si el SMS es un ingreso o un gasto */
function detectTransactionType(body: string): 'income' | 'expense' {
  const b = body.toLowerCase();
  const incomeKeywords = [
    'abono', 'deposito', 'depósito', 'acredito', 'acreditó',
    'acreditado', 'recibida', 'ingreso', 'transferencia recibida',
    'se acredito', 'credito en su cuenta',
  ];
  return incomeKeywords.some(k => b.includes(k)) ? 'income' : 'expense';
}

/** Asigna categoría automática según el comercio o tipo */
function detectCategory(body: string, type: 'income' | 'expense'): string {
  if (type === 'income') return 'salary';
  const b = body.toLowerCase();
  if (b.match(/pizza|mcdon|burger|pollo|restaurant|comida|food|kfc|subway/)) return 'food';
  if (b.match(/uber|taxi|gasolina|combustible|atm|retiro/)) return 'transport';
  if (b.match(/farmacia|medico|hospital|clinica|salud/)) return 'health';
  if (b.match(/netflix|spotify|steam|google play|cloud|entretenimiento/)) return 'entertainment';
  if (b.match(/amazon|ebay|compra|shopping|tienda/)) return 'shopping';
  if (b.match(/agua|luz|internet|telefono|claro|tigo|servicio/)) return 'utilities';
  return 'other';
}

// ─────────────────────────────────────────────────────────────
// KEYWORDS — todos los bancos GT cubiertos
// ─────────────────────────────────────────────────────────────
function msgContainsBankKeywords(text: string): boolean {
  const t = text.toLowerCase();
  const keywords = [
    // Operaciones genéricas
    'compra', 'compra aprobada', 'consumo', 'retiro', 'debito', 'debitado',
    'abono', 'deposito', 'depósito', 'transferencia', 'pago',
    // BAC Credomatic
    'aprobada por', 'bac visa', 'bac mastercard', 'prf protege',
    // BANRURAL
    'se debito', 'se acredito', 'cuenta monetaria', 'banrural',
    // Banco GTC / G&T Continental
    'retiro de atm', 'tarjeta de debito', 'no. autorizacion', 'monto:',
    // BANTRAB
    'informamos', 'debito ift', 'gtq',
    // PROMERICA (patrones comunes)
    'promerica', 'notificame', 'transaccion autorizada',
    // Genéricos adicionales
    'acreditado', 'acredito', 'cargo', 'movimiento',
  ];
  return keywords.some(k => t.includes(k));
}

// ─────────────────────────────────────────────────────────────
// SERVICIO PRINCIPAL
// ─────────────────────────────────────────────────────────────
export const SmsService = {

  async requestPermissions(): Promise<boolean> {
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
      console.warn('SMS permission error:', err);
      return false;
    }
  },

  async syncBankSms(): Promise<Transaction[]> {
    if (Platform.OS !== 'android') return [];

    const hasPermission = await this.requestPermissions();
    if (!hasPermission) return [];

    const { minDate, maxDate } = getCurrentMonthRange();

    const filter = {
      box: 'inbox',
      indexFrom: 0,
      maxCount: 200,          // cubre todo el mes
      minDate,                 // primer día del mes actual
      maxDate,                 // último día del mes actual
    };

    return new Promise((resolve, reject) => {
      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: string) => {
          console.error('Failed to list SMS:', fail);
          reject(fail);
        },
        async (_count: number, smsList: string) => {
          const messages: Array<{ body: string; date: number; address: string }> = JSON.parse(smsList);
          const newTransactions: Transaction[] = [];

          for (const sms of messages) {
            const body = sms.body;
            if (!msgContainsBankKeywords(body)) continue;

            const parsed = this.parseSimpleSms(body, sms.date);
            if (!parsed) continue;

            const exists = await this.checkIfExists(parsed);
            if (!exists) {
              await StorageService.addTransaction(parsed);
              newTransactions.push(parsed);
            }
          }
          resolve(newTransactions);
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

    // Usar la fecha real del SMS; si no viene, usar ahora
    const date = smsDate ? new Date(smsDate).toISOString() : new Date().toISOString();

    // Descripción limpia: banco + primeros 40 chars del SMS
    const shortBody = body.replace(/\s+/g, ' ').trim().substring(0, 40);
    const description = `${bank}: ${shortBody}...`;

    return {
      id: Date.now().toString(36) + Math.random().toString(36).substr(2, 9),
      amount,
      category,
      date,
      description,
      type,
      source: 'sms',
      originalSMS: body,
      bank,
      // Guardamos la moneda en el campo location (reutilizamos hasta que el modelo tenga campo currency)
      location: currency !== 'Q' ? currency : undefined,
    };
  },

  /** Evita duplicados comparando banco + monto + fecha del día */
  async checkIfExists(newTx: Transaction): Promise<boolean> {
    const all = await StorageService.getTransactions();
    const newDay = newTx.date.substring(0, 10); // "YYYY-MM-DD"
    return all.some(t =>
      t.source === 'sms' &&
      t.amount === newTx.amount &&
      t.bank === newTx.bank &&
      t.date.substring(0, 10) === newDay
    );
  },
};