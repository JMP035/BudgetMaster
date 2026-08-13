// ─────────────────────────────────────────────────────────────
// BANK SMS PARSER — módulo puro, sin Platform/AsyncStorage/SmsAndroid
// ─────────────────────────────────────────────────────────────
// Detecta moneda, monto, tipo de transacción, cuotas, referencia bancaria
// y filtra mensajes promocionales (no transaccionales). Testeable de forma
// aislada ya que no depende de ninguna API nativa.
//
// Casos reales de referencia (BAC Guatemala), documentados porque no hay
// framework de tests instalado en el proyecto:
//
// Caso 1 (cuotas):
//   "PRF protege tu BAC VISA: compra Aprobada por Q 2,550.00 en OPTICA ALPI
//    STORE PERI 10 PAG el 24/07/26 21:22 +Info:https://g.bac.gt/SMS"
//   → detectInstallments(body) debe dar { totalInstallments: 10 }.
//
// Caso 2 (cuotas, sin espacio antes de PAG):
//   "PRF protege tu BAC VISA: compra Aprobada por Q 5,799.00 en TELGUA AGEN
//    PLZ SAN NICO 48PAG el 26/07/26 10:33 +Info:https://g.bac.gt/SMS"
//   → detectInstallments(body) debe dar { totalInstallments: 48 }.
//
// Caso 3 (duplicado — mismo mensaje llega dos veces idéntico):
//   "PRF protege tu BAC VISA: compra Aprobada por Q 687.20 en EEGSA WEB
//    REF.:0000544 GUATE el 29/07/26 07:42 +Info:https://g.bac.gt/SMS"
//   → buildDedupeId(...) debe dar el MISMO id las dos veces (usa bankRef).
//
// Caso 4 (promocional, debe ser rechazado):
//   "Un apoyo EXTRA hace la diferencia! Tienes hasta Q21,440 disponibles.
//    Desembólsalo en segundos desde tu App https://g.bac.gt/EXN3007/t/iTLrMB"
//   → isTransactionalSms(body) debe dar false.
//
// Contraejemplos de pago único (sin cuotas, sí transaccionales):
//   "PRF protege tu BAC VISA: compra Aprobada por Q 15.00 en PARQUEO PERI..."
//   "PRF protege tu BAC VISA: compra Aprobada por USD 1.99 en GOOGLE *...le
//    One 855-8..."
//   → isTransactionalSms(body) debe dar true, detectInstallments(body) debe
//     dar null.

import { Currency } from './storage';

// ─────────────────────────────────────────────────────────────
// MONEDA / MONTO / TIPO
// ─────────────────────────────────────────────────────────────

export function detectCurrency(body: string): Currency {
  const b = body.toUpperCase();
  if (b.includes('USD') || b.includes('US$') || b.includes('DOLAR')) return 'USD';
  if (b.includes('EUR') || b.includes('EURO')) return 'EUR';
  if (b.includes('GBP') || b.includes('£')) return '£';
  return 'Q';
}

export function extractAmount(body: string): number | null {
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

export function detectTransactionType(body: string): 'income' | 'expense' {
  const b = body.toLowerCase();
  const incomeKeywords = [
    'abono', 'deposito', 'depósito', 'acredito', 'acreditó',
    'acreditado', 'recibida', 'ingreso', 'transferencia recibida',
    'se acredito', 'credito en su cuenta',
  ];
  return incomeKeywords.some(k => b.includes(k)) ? 'income' : 'expense';
}

// ─────────────────────────────────────────────────────────────
// CUOTAS
// ─────────────────────────────────────────────────────────────

const INSTALLMENT_PATTERNS: RegExp[] = [
  /(\d{1,3})\s*PAG(?:OS)?\b/i,
  /(\d{1,3})\s*CUOTAS?\b/i,
  /A\s*(\d{1,3})\s*MESES\b/i,
  /(\d{1,3})\s*MSI\b/i,
  /PLAZO\s*:?\s*(\d{1,3})\b/i,
];

/** Detecta el número de cuotas de una compra. Evita falsos positivos con 0/1 o números absurdos (>60). */
export function detectInstallments(body: string): { totalInstallments: number } | null {
  for (const pattern of INSTALLMENT_PATTERNS) {
    const match = body.match(pattern);
    if (match) {
      const n = parseInt(match[1], 10);
      if (!isNaN(n) && n >= 2 && n <= 60) return { totalInstallments: n };
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// REFERENCIA BANCARIA
// ─────────────────────────────────────────────────────────────

export function extractBankReference(body: string): string | null {
  const match = body.match(/REF\.?:?\s*([A-Z0-9]{4,})/i);
  return match ? match[1] : null;
}

// ─────────────────────────────────────────────────────────────
// FILTRO DE MENSAJES TRANSACCIONALES vs. PROMOCIONALES
// ─────────────────────────────────────────────────────────────

// Estructura genérica de verbos de aprobación/ingreso — punto de extensión:
// para dar soporte a otro banco, agregar sus verbos a estos mismos regex.
const APPROVAL_VERBS_RE = /\b(compra|consumo|cargo|retiro|pago)\s+(?:fue\s+)?(aprobad[oa]|realizad[oa]|exitos[oa])\b/i;
const INCOME_VERBS_RE = /\b(abono|dep[oó]sito|acredit[oó]|acreditado|recibida|se\s+acredit[oó])\b/i;

const PROMO_REJECT_RE = /(tienes\s+hasta|aprovecha|desembols|preaprobad|extrafinanciamiento|solicita\s*ya|haz\s*clic|da\s*clic|oferta\s+especial)/i;

/** Determina si un SMS es una notificación transaccional real (no promocional/publicitaria). */
export function isTransactionalSms(body: string): boolean {
  if (PROMO_REJECT_RE.test(body)) return false;
  if (extractAmount(body) == null) return false;
  return APPROVAL_VERBS_RE.test(body) || INCOME_VERBS_RE.test(body);
}

// ─────────────────────────────────────────────────────────────
// DEDUPLICACIÓN
// ─────────────────────────────────────────────────────────────

function normalizeKey(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '_')
    .replace(/[^a-z0-9_]/g, '');
}

function hashString(input: string): string {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    hash = ((hash << 5) - hash) + input.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

/**
 * Construye un id de deduplicación estable. Si hay referencia bancaria, la usa
 * (misma compra reportada dos veces → mismo id). Si no, cae a un hash de
 * banco|monto|comercio normalizado|minuto (bucket de minuto para tolerar
 * pequeñas diferencias de reloj entre reintentos del mismo SMS).
 */
export function buildDedupeId(params: { bank: string; amount: number; merchant: string; dateISO: string; bankRef?: string | null }): string {
  const { bank, amount, merchant, dateISO, bankRef } = params;
  if (bankRef) {
    return `sms_ref_${normalizeKey(bank)}_${normalizeKey(bankRef)}`;
  }
  const bucket = dateISO.slice(0, 16); // yyyy-MM-ddTHH:mm (bucket de minuto)
  const base = `${bank}|${amount}|${normalizeKey(merchant)}|${bucket}`;
  return `sms_h_${hashString(base)}`;
}
