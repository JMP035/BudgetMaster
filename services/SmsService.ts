import { Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { StorageService, Transaction, Currency } from './storage';
import { detectBankName } from '../ai';

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

function detectCategory(body: string, type: 'income' | 'expense'): string {
  if (type === 'income') return 'salary';
  const b = body.toLowerCase();

  // ── Combustible / Gasolineras / Estaciones de servicio ───────
  // Reconoce: "est. de serv.", "estacion de servicio", "gasolinera",
  // Shell, Texaco, Puma, Uno, Redipsa, G&G, Esso, Petrox, Total, Zeta Gas
  if (b.match(/gasolina|combustible|estaci[oó]n\s+de\s+serv|est\.?\s*de\s*serv|gasolinera|surtidor/)) return 'fuel';
  if (b.match(/\bshell\b|\btexaco\b|\bpuma\b|\buno\b|\besso\b|\bredipsa\b|\bzeta\s*gas\b|\bpetrogas\b|\btotal\s*gas\b/)) return 'fuel';
  if (b.match(/uber|taxi|combustible/)) return 'fuel';

  // ── Comida / Restaurantes ─────────────────────────────────────
  if (b.match(/pizza|mcdon|mcdonald|burger|pollo\s*campero|kfc|subway|irtra|restauran|comida|food|domino|wendy|denny|applebee|chili|friday|sushi|tacos|burritos/)) return 'food';

  // ── Supermercados ─────────────────────────────────────────────
  if (b.match(/walmart|despensa|hiper\s*paiz|paiz|supermercado|grocery|maxi\s*despensa|la\s*torre|chedraui/)) return 'groceries';

  // ── Seguros ───────────────────────────────────────────────────
  if (b.match(/seguro|insurance|asegura/)) return 'insurance';

  // ── ATM ───────────────────────────────────────────────────────
  if (b.match(/\batm\b|retiro\s+de\s+atm|cajero\s+autom/)) return 'atm';

  // ── Streaming ─────────────────────────────────────────────────
  if (b.match(/netflix|spotify|disney|hbo|youtube\s+premium|prime\s+video|paramount|crunchyroll/)) return 'streaming';

  // ── Entretenimiento ───────────────────────────────────────────
  if (b.match(/steam|playstation|xbox|nintendo|game|juego|cine|cinepolis|pradera/)) return 'entertainment';

  // ── Farmacia ──────────────────────────────────────────────────
  if (b.match(/farmacia|galeno|meykos|medicina|pharmacy|farmacias\s+cruz\s+verde|similar/)) return 'pharmacy';

  // ── Salud ─────────────────────────────────────────────────────
  if (b.match(/hospital|medico|doctor|clinica|salud|laboratorio|radiologia/)) return 'health';

  // ── Compras online ────────────────────────────────────────────
  if (b.match(/amazon|ebay|aliexpress|mercado\s+libre|shein|temu/)) return 'shopping';

  // ── Internet / Telecomunicaciones ─────────────────────────────
  if (b.match(/claro|tigo|movistar|internet|wifi|telefon|fibernet/)) return 'internet';

  // ── Servicios básicos ─────────────────────────────────────────
  if (b.match(/agua|luz\b|eegsa|empagua|electricidad|energuate|recibo\s+de/)) return 'utilities';

  // ── Suscripciones ─────────────────────────────────────────────
  if (b.match(/google\s*(pay|one|play)|apple|microsoft|dropbox|adobe|cloud/)) return 'subscriptions';

  // ── Viajes ────────────────────────────────────────────────────
  if (b.match(/hotel|airbnb|vuelo|aeropuerto|avianca|volaris|united|american\s+airlines|la\s+aurora/)) return 'travel';

  // ── Transferencias ────────────────────────────────────────────
  if (b.match(/transferencia|tif|inmediata/)) return 'transfer';

  return 'other';
}

// ─────────────────────────────────────────────────────────────
// DESCRIPCIÓN INTELIGENTE — extrae el comercio real del SMS
// ─────────────────────────────────────────────────────────────
function buildSmartDescription(body: string, bank: string, type: 'income' | 'expense'): string {
  const b = body;

  // BAC: "compra Aprobada por Q X.XX en NOMBRE_COMERCIO el DD/MM/YY"
  const bacMatch = b.match(/en\s+([A-Z][A-Z0-9\s]+?)\s+(?:el|El|\d{2}\/)/);
  if (bacMatch) {
    const place = toTitleCase(bacMatch[1].trim());
    return `${bank} · Compra en ${place}`;
  }

  // BANRURAL: "se debito de tu Cuenta X en: DESCRIPCION"
  const banruralDebit = b.match(/en:\s+([A-Z][A-Z0-9\s\-]+)/i);
  if (banruralDebit) {
    const desc = toTitleCase(banruralDebit[1].trim());
    return `${bank} · ${desc}`;
  }

  // BANRURAL ingreso: "se acredito a tu Cuenta X"
  if (b.toLowerCase().includes('se acredito') || b.toLowerCase().includes('acreditado')) {
    return `${bank} · Abono recibido`;
  }

  // GTC: "Consumo tarjeta de debito con la cuenta XXXX ... Localidad: LUGAR CIUDAD"
  const gtcLocalidad = b.match(/[Ll]ocalidad:\s*([A-Z][A-Z0-9\s]+?)(?:\s{2,}|\n|GT|$)/);
  if (gtcLocalidad) {
    const place = toTitleCase(gtcLocalidad[1].trim());
    return `${bank} · Consumo en ${place}`;
  }

  // GTC: "Retiro de ATM"
  if (b.toLowerCase().includes('retiro de atm')) {
    return `${bank} · Retiro en cajero automático`;
  }

  // BANTRAB: "DEBITO IFT" o "Transferencia"
  if (b.toLowerCase().includes('debito ift')) {
    return `${bank} · Débito por transferencia`;
  }
  if (b.toLowerCase().includes('transferencia')) {
    return type === 'income'
      ? `${bank} · Transferencia recibida`
      : `${bank} · Transferencia enviada`;
  }

  // Detectar comercios conocidos en el texto
  const knownPlaces: [RegExp, string][] = [
    // Gasolineras / Estaciones de Servicio
    [/\bshell\b/i, "Shell (Est. de Servicio)"],
    [/\btexaco\b/i, "Texaco (Est. de Servicio)"],
    [/\bpuma\b/i, "Puma (Est. de Servicio)"],
    [/\besso\b/i, "Esso (Est. de Servicio)"],
    [/\bredipsa\b/i, "Redipsa (Est. de Servicio)"],
    [/\bzeta\s*gas\b/i, "Zeta Gas"],
    [/estaci[oó]n\s+de\s+serv|est\.?\s*de\s*serv|gasolinera/i, "Estación de Servicio"],
    // Restaurantes
    [/mcdon|mcdonald/i, "McDonald's"],
    [/pizza\s*hut/i, "Pizza Hut"],
    [/pollo\s*campero/i, "Pollo Campero"],
    [/\bkfc\b/i, "KFC"],
    [/\bsubway\b/i, "Subway"],
    [/\bwendy/i, "Wendy's"],
    [/\bdomino/i, "Domino's Pizza"],
    // Supermercados
    [/walmart/i, "Walmart"],
    [/despensa/i, "Despensa Familiar"],
    [/hiper\s*paiz|\bpaiz\b/i, "Hiper Paiz"],
    [/maxi\s*despensa/i, "Maxi Despensa"],
    // Streaming
    [/netflix/i, "Netflix"],
    [/spotify/i, "Spotify"],
    [/disney/i, "Disney+"],
    [/paramount/i, "Paramount+"],
    [/hbo\s*max/i, "HBO Max"],
    // Tech
    [/\bgoogle\b/i, "Google"],
    [/\bapple\b/i, "Apple"],
    [/amazon/i, "Amazon"],
    // Transporte
    [/\buber\b/i, "Uber"],
    [/\bindriver\b/i, "InDriver"],
    // Telecomunicaciones
    [/\btigo\b/i, "Tigo"],
    [/\bclaro\b/i, "Claro"],
    // Guatemala
    [/\birtra\b/i, "IRTRA"],
  ];

  for (const [regex, name] of knownPlaces) {
    if (regex.test(b)) {
      return type === 'income'
        ? `${bank} · Pago recibido de ${name}`
        : `${bank} · Compra en ${name}`;
    }
  }

  // Fallback genérico limpio
  return type === 'income'
    ? `${bank} · Ingreso recibido`
    : `${bank} · Gasto con tarjeta`;
}

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
}

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