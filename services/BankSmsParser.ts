// ─────────────────────────────────────────────────────────────
// BANK SMS PARSER — motor puro de clasificación de SMS bancarios
// ─────────────────────────────────────────────────────────────
// Sin react-native, sin AsyncStorage, sin ../ai. Solo `import type` de
// ./storage (se borra en compilación) y funciones puras de ./Categorizer.
// Se prueba de forma aislada con `npm run test:sms` (scripts/sms-parser.test.ts
// contra el corpus de scripts/sms-corpus.ts).
//
// Reglas de compatibilidad: sin lookbehind y sin flags `s`/`v` en regex
// (Hermes). Cualquier cambio de reglas debe agregar su caso al corpus.
//
// Casos reales de referencia (BAC Guatemala):
//
// Caso 1 (cuotas):
//   "PRF protege tu BAC VISA: compra Aprobada por Q 2,550.00 en OPTICA ALPI
//    STORE PERI 10 PAG el 24/07/26 21:22 +Info:https://g.bac.gt/SMS"
//   → installment_purchase, 10 cuotas.
//
// Caso 2 (cuotas, sin espacio antes de PAG): "... TELGUA AGEN PLZ SAN NICO
//    48PAG el 26/07/26 10:33 ..." → installment_purchase, 48 cuotas.
//
// Caso 3 (mismo comercio y REF cada mes — NO es duplicado):
//   "... Q 687.20 en EEGSA WEB REF.:0000544 GUATE el 29/07/26 07:42 ..."
//   La referencia es el número de cliente y se repite todos los meses. El id
//   ya no usa la referencia: usa un fingerprint del texto completo (que
//   incluye fecha y hora), así el pago de agosto no se descarta como duplicado.
//
// Caso 4 (promocional, NO es ingreso):
//   "JACOB, tu Extra por Q.15,840 esta listo HOY con deposito inmediato en la
//    App: https://g.bac.gt/Ex16/t/mLrnNl ..."  → promo.
//   "Un apoyo EXTRA hace la diferencia! Tienes hasta Q21,440 disponibles. ..." → promo.
//
// Caso 5 (llega tarde): compra del 04/10 20:54 recibida el 05/10 02:10. La
//   fecha del movimiento es la del TEXTO (04/10 20:54), no la de recepción.
//
// Contraejemplos de pago único: "... Q 15.00 en PARQUEO PERI ..." y
//   "... USD 1.99 en GOOGLE *Google One ..." son purchase (no cuotas).

import type { Account, CreditInstallment, Currency, MerchantRule, SmsInboxItem, Transaction } from './storage';
import {
  categorizeExpense,
  categorizeIncome,
  extractMerchantAndLocation,
  normalizeText,
} from './Categorizer';
import { findMerchantRule } from './MerchantRules';

// ─────────────────────────────────────────────────────────────
// 1a. NORMALIZACIÓN
// ─────────────────────────────────────────────────────────────

/**
 * raw: espacios no separables → espacio, \r\n → \n, trim. NO colapsa espacios
 * dobles (BAC los usa para separar comercio y ciudad).
 * flat: minúsculas, sin tildes, espacios colapsados.
 */
export function prepareSms(body: string): { raw: string; flat: string } {
  const raw = body.replace(/\u00A0/g, ' ').replace(/\r\n/g, '\n').trim();
  const flat = raw
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return { raw, flat };
}

function flatOf(s: string): string {
  return prepareSms(s).flat;
}

// ─────────────────────────────────────────────────────────────
// 1b. BANCO Y REMITENTE
// ─────────────────────────────────────────────────────────────

const BANK_RULES: Array<[RegExp, string]> = [
  [/\bBANRURAL\b/, 'BANRURAL'],
  [/\bBAC\b|\bCREDOMATIC\b/, 'BAC'],
  [/\bBI\b|\bBANCO INDUSTRIAL\b|\bINDUSTRIAL\b/, 'BI'],
  [/\bG&T\b|\bGYT\b|\bCONTINENTAL\b|\bGTC\b/, 'GYT'],
  [/\bBAM\b|\bBAMER\b|\bAGROMERCANTIL\b/, 'BAM'],
  [/\bPROMERICA\b/, 'PROMERICA'],
  [/\bBANTRAB\b/, 'BANTRAB'],
  [/\bINTERBANCO\b/, 'INTERBANCO'],
  [/\bFICOHSA\b/, 'FICOHSA'],
  [/\bAZTECA\b/, 'AZTECA'],
  [/\bCHASE\b/, 'CHASE'],
  [/\bBOFA\b/, 'BOFA'],
  [/\bSANTANDER\b/, 'SANTANDER'],
  [/\bBBVA\b/, 'BBVA'],
  [/\bCITI\b/, 'CITI'],
];

/**
 * Detecta el banco por palabra completa (con includes(), "BI" coincidía con
 * "reciBIda"). El orden importa: BANRURAL antes que BAC. Devuelve "Banco" si
 * no reconoce ninguno.
 */
export function detectBankName(text: string): string {
  const t = text.toUpperCase();
  for (const [re, code] of BANK_RULES) {
    if (re.test(t)) return code;
  }
  return 'Banco';
}

export type SmsSender = 'trusted_unknown' | 'shortcode' | 'longnumber';

/** Sin address (texto pegado) → trusted_unknown; alfanumérico o ≤6 dígitos → shortcode; el resto → longnumber. */
export function classifySender(address?: string): SmsSender {
  const a = (address ?? '').trim();
  if (!a) return 'trusted_unknown';
  const compact = a.replace(/[\s\-()]/g, '');
  if (/^\+?\d+$/.test(compact)) {
    const digits = compact.replace(/\D/g, '');
    if (!compact.startsWith('+') && digits.length <= 6) return 'shortcode';
    return 'longnumber';
  }
  return 'shortcode';
}

export const BANK_LINK_DOMAINS = [
  'g.bac.gt', 'bac.net', 'baccredomatic.com', 'banrural.com.gt', 'bi.com.gt',
  'corporacionbi.com', 'gytcontinental.com.gt', 'bam.com.gt', 'promerica.com.gt', 'bantrab.com.gt',
];

function hostIsBank(host: string): boolean {
  const h = host.toLowerCase();
  return BANK_LINK_DOMAINS.some(d => h === d || h.endsWith('.' + d));
}

/** Hosts mencionados en el texto (URLs con esquema o dominios sueltos). */
function extractHosts(flat: string): string[] {
  const hosts: string[] = [];
  const urlRe = /https?:\/\/([^\s/:?#]+)/g;
  let m: RegExpExecArray | null;
  while ((m = urlRe.exec(flat)) !== null) hosts.push(m[1]);
  const bareRe = /[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|gt|info|xyz|link|ly)\b/g;
  while ((m = bareRe.exec(flat)) !== null) hosts.push(m[0]);
  return hosts;
}

// ─────────────────────────────────────────────────────────────
// 1c. MONTOS
// ─────────────────────────────────────────────────────────────

/**
 * Interpreta un monto con separadores ambiguos (misma lógica que
 * `parseAmount` de storage.ts, copiada porque este módulo no puede importar
 * storage). Recorta [.,] finales. NaN si no es válido.
 */
export function parseMoneyToken(token: string): number {
  let s = token.trim().replace(/\s/g, '').replace(/[.,]+$/, '');
  if (!s) return NaN;

  const hasComma = s.includes(',');
  const hasDot = s.includes('.');

  if (hasComma && hasDot) {
    const lastComma = s.lastIndexOf(',');
    const lastDot = s.lastIndexOf('.');
    if (lastComma > lastDot) {
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  } else if (hasComma) {
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount > 1 || /^\d{1,3},\d{3}$/.test(s)) {
      s = s.replace(/,/g, '');
    } else {
      s = s.replace(',', '.');
    }
  } else if (hasDot) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) s = s.replace(/\./g, '');
  }

  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

export interface MoneyToken {
  value: number;
  currency: Currency;
  index: number;
  isBalance: boolean;
}

function currencyFromSymbol(sym: string): Currency {
  const s = sym.toUpperCase();
  if (s === 'USD' || s === 'US$' || s === '$') return 'USD';
  if (s === 'EUR' || s === '€') return 'EUR';
  return 'Q';
}

const BALANCE_CONTEXT_RE = /saldo|disponible|limite|cupo|hasta|minimo/;

/**
 * Extrae todos los montos con su moneda TOMADA DEL TOKEN (no del texto
 * completo: "EUREKA STORE" ya no vuelve EUR). Marca como balance los que
 * están precedidos (30 caracteres) por saldo/disponible/límite/cupo/hasta/mínimo.
 */
export function extractMoneyTokens(raw: string): MoneyToken[] {
  const out: MoneyToken[] = [];
  const push = (numStr: string, sym: string, index: number) => {
    const value = parseMoneyToken(numStr);
    if (isNaN(value) || value <= 0 || value >= 1_000_000) return;
    const prev = flatOf(raw.slice(Math.max(0, index - 30), index));
    out.push({ value, currency: currencyFromSymbol(sym), index, isBalance: BALANCE_CONTEXT_RE.test(prev) });
  };

  const prefixRe = /(?:^|[^A-Za-z0-9])(GTQ|Q|US\$|USD|\$|EUR|€)\s?\.?\s?(\d[\d.,]*\d|\d)/g;
  let m: RegExpExecArray | null;
  while ((m = prefixRe.exec(raw)) !== null) {
    push(m[2], m[1], m.index + m[0].length - m[2].length);
  }
  const suffixRe = /(\d[\d.,]*\d|\d)\s?(GTQ|USD|EUR)\b/gi;
  while ((m = suffixRe.exec(raw)) !== null) {
    if (out.some(t => t.index === m!.index)) continue;
    push(m[1], m[2], m.index);
  }
  out.sort((a, b) => a.index - b.index);
  return out;
}

/** El primer monto que no sea saldo/límite/mínimo. null si todos lo son. */
export function pickPrimaryAmount(tokens: MoneyToken[], _flat?: string): MoneyToken | null {
  for (const t of tokens) {
    if (!t.isBalance) return t;
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// 1d. FECHA DEL TEXTO
// ─────────────────────────────────────────────────────────────

export interface TextDate {
  date: Date;
  source: 'text' | 'received' | 'now';
  hasTime: boolean;
}

const DATE_SRC = '\\b(\\d{1,2})[\\/\\-.](\\d{1,2})[\\/\\-.](\\d{4}|\\d{2})\\b(?:[^\\d\\n]{0,14}?(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*(a\\.?\\s?m\\.?|p\\.?\\s?m\\.?)?)?';
const DATE_IGNORE_CONTEXT_RE = /vence|vencimiento|antes del|fecha limite|corte/;

function sameLocalDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function formatLocalDay(d: Date): string {
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function buildLocalDate(y: number, mo: number, d: number, hh: number, mi: number, ss: number): Date | null {
  const dt = new Date(y, mo - 1, d, hh, mi, ss);
  if (dt.getFullYear() !== y || dt.getMonth() !== mo - 1 || dt.getDate() !== d) return null;
  return dt;
}

/**
 * Fecha y hora del movimiento a partir del TEXTO (en hora local). Prefiere
 * DD/MM; si queda fuera de la ventana de recepción [−10 días, +36 h] prueba
 * MM/DD; si tampoco, usa la recepción. Sin receivedAt acepta la fecha del
 * texto si no está a más de 1 día en el futuro.
 */
export function extractTextDate(raw: string, receivedAt?: number): TextDate {
  const hasReceived = typeof receivedAt === 'number' && isFinite(receivedAt);
  const recv = hasReceived ? new Date(receivedAt as number) : null;
  const re = new RegExp(DATE_SRC, 'gi');
  let m: RegExpExecArray | null;

  while ((m = re.exec(raw)) !== null) {
    const prior = flatOf(raw.slice(Math.max(0, m.index - 20), m.index));
    if (DATE_IGNORE_CONTEXT_RE.test(prior)) continue;

    const a = parseInt(m[1], 10);
    const b = parseInt(m[2], 10);
    let y = parseInt(m[3], 10);
    if (m[3].length === 2) y += 2000;

    let hh: number | null = null;
    let mi = 0;
    let ss = 0;
    if (m[4] !== undefined) {
      hh = parseInt(m[4], 10);
      mi = parseInt(m[5], 10);
      ss = m[6] !== undefined ? parseInt(m[6], 10) : 0;
      const ampm = m[7] ? m[7].toLowerCase().replace(/[^ap]/g, '') : '';
      if (ampm === 'p' && hh < 12) hh += 12;
      if (ampm === 'a' && hh === 12) hh = 0;
      if (hh > 23 || mi > 59 || ss > 59) { hh = null; mi = 0; ss = 0; }
    }
    const hasTime = hh !== null;

    const make = (day: number, month: number): Date | null =>
      buildLocalDate(y, month, day, hh ?? 12, mi, ss);

    const candidates = [make(a, b), make(b, a)];

    if (recv) {
      const lo = recv.getTime() - 10 * 86400000;
      const hi = recv.getTime() + 36 * 3600000;
      for (const c of candidates) {
        if (!c) continue;
        if (c.getTime() < lo || c.getTime() > hi) continue;
        let date = c;
        if (!hasTime && sameLocalDay(c, recv)) date = new Date(recv.getTime());
        return { date, source: 'text', hasTime };
      }
    } else {
      const limit = Date.now() + 86400000;
      for (const c of candidates) {
        if (c && c.getTime() <= limit) return { date: c, source: 'text', hasTime };
      }
    }
  }

  if (recv) return { date: recv, source: 'received', hasTime: false };
  return { date: new Date(), source: 'now', hasTime: false };
}

// ─────────────────────────────────────────────────────────────
// 1e. FINGERPRINT E ID
// ─────────────────────────────────────────────────────────────

/** djb2 + FNV-1a de 32 bits, cada uno en base36, unidos con "_". */
export function hash64(s: string): string {
  let h1 = 5381;
  let h2 = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = (((h1 << 5) + h1) ^ c) >>> 0;
    h2 = (h2 ^ c) >>> 0;
    h2 = Math.imul(h2, 0x01000193) >>> 0;
  }
  return h1.toString(36) + '_' + h2.toString(36);
}

/**
 * Huella estable del SMS. Si el texto trae fecha CON hora, la huella solo
 * depende del texto (dos pagos de EEGSA en meses distintos difieren por la
 * fecha). Si no, se agrega el día local de recepción.
 */
export function buildSmsFingerprint(body: string, receivedAt?: number): string {
  const { raw, flat } = prepareSms(body);
  const td = extractTextDate(raw, receivedAt);
  const base = `smsfp_${hash64(flat)}`;
  if (td.source === 'text' && td.hasTime) return base;
  if (typeof receivedAt === 'number' && isFinite(receivedAt)) {
    return `${base}_${formatLocalDay(new Date(receivedAt))}`;
  }
  return base;
}

export function buildSmsTransactionId(fp: string): string {
  return 'sms_' + fp;
}

// ─────────────────────────────────────────────────────────────
// 1f. REFERENCIA Y TARJETA (informativos)
// ─────────────────────────────────────────────────────────────

export function extractBankReference(raw: string): string | null {
  const m = raw.match(/\bREF(?:ERENCIA)?\b\.?\s*(?:No\.?\s*)?:?\s*([A-Z0-9-]{4,})/i);
  return m ? m[1] : null;
}

export function extractCardLast4(raw: string): string | null {
  const m = raw.match(/(?:\*{2,}|x{2,}|terminada en\s*)(\d{4})\b/i);
  return m ? m[1] : null;
}

// ─────────────────────────────────────────────────────────────
// 1g. TIPOS DE SALIDA
// ─────────────────────────────────────────────────────────────

export type SmsKind =
  | 'purchase' | 'installment_purchase' | 'atm_withdrawal' | 'debit'
  | 'transfer_out' | 'transfer_in' | 'deposit' | 'payroll' | 'refund'
  | 'card_payment' | 'loan_disbursement'
  | 'own_transfer' | 'promo' | 'otp' | 'declined' | 'balance_info'
  | 'statement' | 'security' | 'phishing' | 'not_bank' | 'unparsed'
  | 'notice' | 'bank_fee';

export interface SmsClassification {
  accepted: boolean;            // true => genera Transaction o CreditInstallment
  kind: SmsKind;
  reason: string;               // código corto para depurar/diagnóstico, ej 'promo:tu extra'
  bank: string;
  amount: number | null;
  currency: Currency;
  txType: 'income' | 'expense' | 'transfer' | null;
  category: string | null;
  merchant: string | null;
  location: string | null;
  description: string | null;
  occurredAt: Date;
  dateSource: 'text' | 'received' | 'now';
  installments: number | null;
  bankRef: string | null;
  cardLast4: string | null;
  fingerprint: string;
}

export interface SmsInput { body: string; address?: string; receivedAt?: number }

// ─────────────────────────────────────────────────────────────
// 1h. CLASIFICADOR POR ETAPAS
// ─────────────────────────────────────────────────────────────

const URL_RE = /https?:\/\//;

const OTP_WORD_RE = /\b(?:codigo|token|clave|pin|otp|contrasena|verificacion)\b/;
const SECURITY_RE = /inicio de sesion|ingreso a (?:tu|su) banca|cambio de (?:clave|contrasena)|dispositivo nuevo|bloquead/;
const DECLINED_RE = /\b(?:rechazad[ao]s?|declinad[ao]s?|denegad[ao]s?|no (?:fue )?(?:aprobad|autorizad|procesad|realizad|exitos)\w*|fondos insuficientes|fallid[ao]s?|no se pudo)\b/;

const CREDITED_PAST_RE = new RegExp(
  '\\b(?:se acredit\\w*|fue acreditad\\w*|hemos acreditad\\w*|acreditamos|se abono|fue abonad\\w*|se deposito|' +
  'deposito (?:recibido|realizado|acreditado|efectuado)|desembolso (?:realizado|exitoso|efectuado|aplicado)|' +
  'se desembols\\w*|credito a (?:tu|su) cuenta|ingreso a (?:tu|su) cuenta|abono a (?:tu|su) cuenta|' +
  'acreditad[oa] (?:a|en) (?:tu|su) cuenta)\\b'
);

const PROMO_PHRASES = [
  'tu extra', 'extra por', 'extrafinanciamiento', 'apoyo extra',
  'esta listo', 'estan listos', 'listo para ti', 'disponible para ti', 'disponibles', 'tienes hasta',
  'tienes disponible', 'hasta q',
  'pre-aprobad', 'preaprobad', 'pre aprobad', 'aprobado para ti',
  'solicita', 'solicitalo', 'deposito inmediato', 'en minutos', 'en segundos', 'hoy mismo',
  'aprovecha', 'oferta', 'promo', 'descuento', 'cuotas sin intereses', 'meses sin intereses', 'tasa 0',
  '0% de interes',
  'gana ', 'participa', 'sorteo', 'te invitamos', 'no te lo pierdas', 'ultimo dia', 'beneficio',
  'tarjeta adicional', 'aumento de limite', 'credito personal', 'prestamo', 'financiamiento',
  'llama al', 'whatsapp', 'escribenos', 'haz clic', 'da clic', 'descarga', 'ingresa a',
];
const LOAN_WORDS_RE = /prestamo|extra|desembols|financiamiento/;

const STATEMENT_RE = /pago minimo|fecha (?:de )?(?:corte|limite)|estado de cuenta|tu pago vence|recuerda (?:pagar|tu pago)/;
const BALANCE_INFO_RE = /\b(?:tu|su) saldo (?:es|disponible|actual)|saldo al\b/;
const TRANSACTIONAL_VERB_RE = /\b(?:compra|consumo|cargo|retiro|transaccion|debit\w*|acredit\w*|deposito|abono|transferencia|pago|cobro)\b/;
const BANK_TEMPLATE_RE = /prf protege tu|bac (?:visa|mastercard|amex)|credomatic/;

// Avisos informativos SIN monto (tarjeta en Apple/Google/Garmin Pay, cuenta asociada a la app,
// límite alcanzado, agradecimiento de pago). Solo se evalúan sin monto: un aviso nunca se traga
// un movimiento real.
const NOTICE_RE = new RegExp(
  '(?:activad|reanudad|suspendid|desactivad|eliminad|agregad|registrad|vinculad|habilitad)[ao]s? en (?:el )?servicio|' +
  '\\b(?:apple|google|garmin|samsung) pay\\b|' +
  'asociad[ao]s? (?:en|a) (?:android|ios|iphone|la app|tu app|su app|app)|desde app \\w+ en|' +
  'alcanzaste el \\d+ ?% del limite|(?:has|ha) alcanzado (?:el )?(?:\\d+ ?% (?:de|del) )?(?:tu |su )?limite|' +
  'gracias por (?:tu|su) pago|te agradece (?:el|tu) pago'
);

// Comisiones bancarias descritas en el texto del SMS.
const FEE_RE = /\b(?:comision\w*|cargo por (?:servicio|transferencia|transaccion|manejo)|cobro (?:de|por) (?:servicio|comision\w*|transferencia)|costo (?:de|por) (?:la )?(?:transaccion|transferencia))\b/;

/**
 * Montos (Q) de los débitos BANRURAL sin comercio reconocido que son la comisión por
 * transferencia. Ajustar cuando el usuario comparta el texto real.
 */
export const BANRURAL_FEE_AMOUNTS: number[] = [5];

/** Monto máximo (Q) de un movimiento que puede ser la comisión de una transferencia vecina. */
export const FEE_PAIR_MAX = 10;

const REFUND_RE = /\b(?:reverso|reversion|reversad\w*|devolucion|devuelt\w*|anulacion|anulad[ao]s?|reembolso|contracargo|reintegro)\b/;
const CARD_PAYMENT_RE = /(?:pago|abono) (?:a|de|recibido a|aplicado a) (?:tu |su )?tarjeta|hemos recibido (?:tu|su) pago|pago (?:aplicado|recibido|acreditado) a (?:tu|su) tarjeta|abono a tarjeta/;
const OWN_TRANSFER_RE = /entre (?:tus|sus) cuentas|cuentas propias|a (?:tu|su) (?:otra )?cuenta propia/;
const ATM_A_RE = /\b(?:retiro|extraccion)\b/;
const ATM_B_RE = /\b(?:atm|cajero)\b/;
const ATM_C_RE = /retiro (?:aprobado|realizado|exitoso|en efectivo)/;
const TRANSFER_IN_RE = /recibiste|has recibido|te (?:envio|enviaron|transfirio|transfirieron)|transferencia (?:recibida|entrante|a (?:tu|su) favor)|se acredito.*transferencia|transferencia.*(?:acreditad|se acredito)/;
const TRANSFER_OUT_A_RE = /\b(?:transferencia|transferiste|enviaste|ach|tif|debito ift)\b/;
const TRANSFER_OUT_B_RE = /(?:enviada|realizada|exitosa|debit|a la cuenta|a favor de|a cuenta)/;
const PAYROLL_RE = /\b(?:planilla|nomina|salario|sueldo|honorarios|mindef|ministerio de la defensa|ejercito)\b/;
const PURCHASE_A_RE = /\b(?:compra|consumo|cargo|transaccion|pago|cobro)\b/;
const PURCHASE_B_RE = /(?:aprobad|autorizad|realizad|exitos|efectuad|aplicad)/;
const DEBIT_RE = /se debit|debitad|debito (?:a|de|en|por)|notificacion de debito|pagaste/;
const PURCHASE_WORD_RE = /\b(?:compra|consumo)\b/;

const BANK_NAME_STRIP_RE = /\b(?:credomatic|bac|banrural|bi|banco industrial|industrial|g&t|gyt|continental|gtc|bam|bamer|agromercantil|promerica|bantrab|interbanco|ficohsa|azteca)\b/g;

function stripBoilerplate(flat: string): string {
  return flat
    .replace(/prf protege tu/g, ' ')
    .replace(/\+info:\S*/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:com|net|gt|info)\S*/g, ' ')
    .replace(/\bbac (?:visa|mastercard|amex)\b/g, ' ')
    .replace(/\*+\d+/g, ' ')
    .replace(BANK_NAME_STRIP_RE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function stripNumbersForOtp(raw: string): string {
  return flatOf(
    raw
      .replace(/(?:^|[^A-Za-z0-9])(?:GTQ|Q|US\$|USD|\$|EUR|€)\s?\.?\s?(?:\d[\d.,]*\d|\d)/g, ' ')
      .replace(/(\d[\d.,]*\d|\d)\s?(?:GTQ|USD|EUR)\b/gi, ' ')
      .replace(/\d{1,2}[\/\-.]\d{1,2}[\/\-.]\d{2,4}/g, ' ')
      .replace(/\d{1,2}:\d{2}(?::\d{2})?/g, ' ')
      .replace(/[*xX]+\d+/g, ' ')
  );
}

function bankLabel(bank: string): string {
  return bank === 'Banco' ? 'Banco' : bank;
}

function describe(kind: SmsKind, bank: string, merchant: string | null, location: string | null): string {
  const b = bankLabel(bank);
  switch (kind) {
    case 'purchase':
    case 'installment_purchase':
      return merchant ? `${b} · Compra en ${merchant}` : `${b} · Gasto con tarjeta`;
    case 'debit':
      return merchant ? `${b} · Débito en ${merchant}` : `${b} · Débito de cuenta`;
    case 'atm_withdrawal': {
      const place = merchant ?? location;
      return place ? `${b} · Retiro en cajero ${place}` : `${b} · Retiro en cajero`;
    }
    case 'bank_fee': return `${b} · Comisión bancaria`;
    case 'transfer_out': return `${b} · Transferencia enviada`;
    case 'transfer_in': return `${b} · Transferencia recibida`;
    case 'payroll': return `${b} · Pago de planilla`;
    case 'deposit': return `${b} · Depósito recibido`;
    case 'refund': return merchant ? `${b} · Reverso/devolución de ${merchant}` : `${b} · Reverso/devolución`;
    case 'card_payment': return `${b} · Pago de tarjeta`;
    case 'loan_disbursement': return `${b} · Desembolso de préstamo`;
    default: return `${b} · Movimiento`;
  }
}

/**
 * Clasifica un SMS. El orden de las etapas es obligatorio: la primera regla
 * que coincide gana. Todas las palabras se buscan en `flat`.
 */
export function classifyBankSms(input: SmsInput): SmsClassification {
  // Etapa 0 ────────────────────────────────────────────────
  const { raw, flat } = prepareSms(input.body);
  // El banco emisor suele ir al inicio ("BAC: ... a cuenta BANRURAL"): se busca primero ahí.
  const headBank = detectBankName(raw.slice(0, 40));
  const bank = headBank !== 'Banco' ? headBank : detectBankName(raw);
  const sender = classifySender(input.address);
  const tokens = extractMoneyTokens(raw);
  const primary = pickPrimaryAmount(tokens, flat);
  const fingerprint = buildSmsFingerprint(input.body, input.receivedAt);
  const td = extractTextDate(raw, input.receivedAt);
  const info = extractMerchantAndLocation(raw);
  const bankRef = extractBankReference(raw);
  const cardLast4 = extractCardLast4(raw);
  const amount = primary ? primary.value : null;
  const currency: Currency = primary ? primary.currency : 'Q';

  const base = {
    bank, amount, currency, merchant: info.merchant, location: info.location,
    occurredAt: td.date, dateSource: td.source, bankRef, cardLast4, fingerprint,
  };
  const reject = (kind: SmsKind, reason: string): SmsClassification => ({
    ...base, accepted: false, kind, reason, txType: null, category: null,
    description: null, installments: null,
  });
  const accept = (
    kind: SmsKind, reason: string, txType: 'income' | 'expense' | 'transfer', category: string,
    installments: number | null = null,
  ): SmsClassification => {
    // Etapa 18: remitente
    if (sender === 'longnumber') {
      if (bank === 'Banco') return reject('not_bank', 'untrusted_sender');
      reason += '|longnumber';
    }
    return {
      ...base, accepted: true, kind, reason, txType, category, installments,
      description: describe(kind, bank, info.merchant, info.location),
    };
  };

  // Etapa 1: phishing ─────────────────────────────────────
  if (sender === 'longnumber') {
    const hosts = extractHosts(flat);
    if (hosts.some(h => !hostIsBank(h))) return reject('phishing', 'phishing:url_externa');
    if (URL_RE.test(flat) && hosts.length === 0) return reject('phishing', 'phishing:url');
  }

  // Etapa 2: otp / security ───────────────────────────────
  if (OTP_WORD_RE.test(flat)) {
    if (/\b\d{4,8}\b/.test(stripNumbersForOtp(raw))) return reject('otp', 'otp:codigo');
  }
  if (/no (?:lo )?compartas/.test(flat)) return reject('otp', 'otp:no_compartas');
  if (SECURITY_RE.test(flat) && amount === null) return reject('security', 'security');

  // Etapa 3: declined ─────────────────────────────────────
  const declined = flat.match(DECLINED_RE);
  if (declined) return reject('declined', `declined:${declined[0]}`);

  // Etapa 3b: not_bank (antes de promo: Tigo/ViX no son mensajes bancarios) ─────
  if (bank === 'Banco' && !BANK_TEMPLATE_RE.test(flat) && !extractHosts(flat).some(hostIsBank)) {
    return reject('not_bank', 'no_bank_template');
  }

  // Etapa 3c: aviso informativo — solo sin monto: un aviso nunca se traga un movimiento ──
  if (amount === null && NOTICE_RE.test(flat)) return reject('notice', 'notice');

  // Etapa 4: acreditación pasada (solo flag) ──────────────
  const creditedPast = CREDITED_PAST_RE.test(flat);

  // Etapa 5: promo ────────────────────────────────────────
  if (!creditedPast) {
    // El comercio puede llevar palabras como "oferta": se quita del texto a evaluar.
    const segFlat = info.segment ? flatOf(info.segment) : '';
    const promoText = segFlat ? flat.replace(segFlat, ' ') : flat;
    for (const p of PROMO_PHRASES) {
      if (promoText.includes(p)) return reject('promo', `promo:${p.trim()}`);
    }
    if (/g\.bac\.gt\/(?!SMS\b)[A-Za-z0-9]/i.test(raw)) return reject('promo', 'promo:link');
    if (/https?:\/\/\S*\/t\//i.test(raw)) return reject('promo', 'promo:link_t');
    if (/\bdesembols/.test(promoText)) return reject('promo', 'promo:desembols');
  } else if (LOAN_WORDS_RE.test(flat) && amount !== null) {
    return accept('loan_disbursement', 'loan_disbursement', 'transfer', 'transfer');
  }

  // Etapa 6: statement / balance_info ─────────────────────
  if (STATEMENT_RE.test(flat)) return reject('statement', 'statement');
  if (BALANCE_INFO_RE.test(flat) && !TRANSACTIONAL_VERB_RE.test(flat)) return reject('balance_info', 'balance_info');

  // Etapa 7: (not_bank se evalúa antes, en la etapa 3b)

  // Etapa 8: sin monto ────────────────────────────────────
  if (amount === null) return reject('unparsed', 'no_amount');

  // Etapa 9: refund ───────────────────────────────────────
  if (REFUND_RE.test(flat)) return accept('refund', 'refund', 'income', 'other');

  // Etapa 10: card_payment ────────────────────────────────
  if (CARD_PAYMENT_RE.test(flat)) return accept('card_payment', 'card_payment', 'transfer', 'transfer');

  // Etapa 11: own_transfer ────────────────────────────────
  if (OWN_TRANSFER_RE.test(flat)) return reject('own_transfer', 'own_transfer');

  // Etapa 12: atm_withdrawal ──────────────────────────────
  if ((ATM_A_RE.test(flat) && ATM_B_RE.test(flat)) || ATM_C_RE.test(flat)) {
    return accept('atm_withdrawal', 'atm_withdrawal', 'expense', 'atm');
  }

  // Etapa 12b: comisión bancaria descrita en el texto ─────
  if (FEE_RE.test(flat) && !/\bsin comision/.test(flat)) {
    return accept('bank_fee', 'bank_fee:texto', 'expense', 'bank_fees');
  }

  // Etapa 13: transfer_in ─────────────────────────────────
  if (TRANSFER_IN_RE.test(flat)) {
    return accept('transfer_in', 'transfer_in', 'income', categorizeIncome(flat, 'transfer_in'));
  }

  // Etapa 14: transfer_out ────────────────────────────────
  if (TRANSFER_OUT_A_RE.test(flat) && TRANSFER_OUT_B_RE.test(flat)) {
    return accept('transfer_out', 'transfer_out', 'expense', 'transfer');
  }

  // Etapa 15: payroll ─────────────────────────────────────
  if (creditedPast && PAYROLL_RE.test(flat)) {
    return accept('payroll', 'payroll', 'income', categorizeIncome(flat, 'payroll'));
  }

  // Etapa 16: deposit ─────────────────────────────────────
  if (creditedPast) {
    // Un depósito sin "efectivo"/"ventanilla" es una transferencia recibida.
    if (!/\b(?:efectivo|ventanilla)\b/.test(flat)) {
      return accept('transfer_in', 'deposit_as_transfer', 'income', categorizeIncome(flat, 'transfer_in'));
    }
    return accept('deposit', 'deposit', 'income', categorizeIncome(flat, 'deposit'));
  }

  // Etapa 17: purchase / debit ────────────────────────────
  const approvedTemplate = PURCHASE_A_RE.test(flat) && PURCHASE_B_RE.test(flat);
  const isDebit = DEBIT_RE.test(flat);
  const merchantTemplate = PURCHASE_WORD_RE.test(flat) && info.segment !== null;
  if (approvedTemplate || isDebit || merchantTemplate) {
    const isPurchase = approvedTemplate || merchantTemplate;
    const category = categorizeExpense(info.merchant, info.location, stripBoilerplate(flat));
    // BANRURAL: "en: X" es la agencia o el canal, no un comercio. Sin comercio es una
    // transferencia enviada; con monto de comisión conocido y sin comercio reconocible es la comisión.
    if (!isPurchase && bank === 'BANRURAL') {
      if (info.merchant === null) return accept('transfer_out', 'banrural_debit_sin_comercio', 'expense', 'transfer');
      if (category === 'other' && currency === 'Q' && amount !== null && BANRURAL_FEE_AMOUNTS.includes(amount)) {
        return accept('bank_fee', 'bank_fee:monto_banrural', 'expense', 'bank_fees');
      }
    }
    let installments: number | null = null;
    if (isPurchase) installments = detectInstallmentCount(info.segment, flat, approvedTemplate);
    if (installments !== null) {
      return accept('installment_purchase', 'installment_purchase', 'expense', category, installments);
    }
    return accept(isPurchase ? 'purchase' : 'debit', isPurchase ? 'purchase' : 'debit', 'expense', category);
  }

  // Etapa 19 ──────────────────────────────────────────────
  return reject('unparsed', 'no_match');
}

/** Número de cuotas del segmento del comercio ("... 10 PAG", "48PAG", "12 CUOTAS") o de "en N cuotas"/"a N meses". */
function detectInstallmentCount(segment: string | null, flat: string, approved: boolean): number | null {
  const inRange = (n: number) => !isNaN(n) && n >= 2 && n <= 60;
  if (segment) {
    for (const part of segment.split(/\s{2,}/)) {
      const p = part.trim();
      const m = p.match(/(\d{1,3})\s*PAG(?:OS)?$/i) || p.match(/(\d{1,3})\s*CUOTAS?$/i);
      if (m) {
        const n = parseInt(m[1], 10);
        if (inRange(n)) return n;
      }
    }
  }
  if (approved) {
    const m = flat.match(/\ben (\d{1,2}) cuotas\b|\ba (\d{1,2}) meses\b/);
    if (m) {
      const n = parseInt(m[1] ?? m[2], 10);
      if (inRange(n)) return n;
    }
  }
  return null;
}

// ─────────────────────────────────────────────────────────────
// CONSTRUCCIÓN DE REGISTROS (pura)
// ─────────────────────────────────────────────────────────────

export interface ParsedSmsResult {
  kind: 'transaction' | 'installment';
  transaction?: Transaction;
  installment?: CreditInstallment;
}

const BANK_ACCOUNT_ALIASES: Record<string, string[]> = {
  BAC: ['bac', 'credomatic'],
  BANRURAL: ['banrural'],
  BI: ['bi', 'industrial'],
  GYT: ['g&t', 'gyt', 'continental'],
  BAM: ['bam', 'bamer', 'agromercantil'],
  PROMERICA: ['promerica'],
  BANTRAB: ['bantrab'],
};

function bankMatchesAccount(bank: string, bankName: string): boolean {
  const aliases = BANK_ACCOUNT_ALIASES[bank];
  const flatName = flatOf(bankName);
  if (aliases) return aliases.some(a => new RegExp('(^|[^a-z0-9])' + a.replace(/[&]/g, '\\&') + '([^a-z0-9]|$)').test(flatName));
  return normalizeText(bankName).includes(normalizeText(bank));
}

/**
 * Convierte una clasificación aceptada en Transaction o CreditInstallment.
 * Devuelve null si !accepted.
 */
export function buildRecordFromClassification(
  c: SmsClassification,
  body: string,
  accounts: Account[] = [],
): ParsedSmsResult | null {
  if (!c.accepted || c.amount === null || c.txType === null) return null;
  const id = buildSmsTransactionId(c.fingerprint);
  const date = c.occurredAt.toISOString();

  if (c.kind === 'installment_purchase' && c.installments) {
    let accountId = '';
    if (c.bank !== 'Banco') {
      const matches = accounts.filter(a =>
        a.type === 'credit' && a.isActive && !!a.bankName && bankMatchesAccount(c.bank, a.bankName!)
      );
      if (matches.length === 1) accountId = matches[0].id;
    }
    const installment: CreditInstallment = {
      id,
      accountId,
      name: c.merchant || 'Compra a cuotas',
      totalAmount: c.amount,
      monthlyPayment: Math.round((c.amount / c.installments) * 100) / 100,
      totalInstallments: c.installments,
      paidInstallments: 0,
      startDate: date,
      currency: c.currency,
      category: c.category ?? 'other',
      isActive: true,
      notes: `Detectado automáticamente por SMS (${c.bank})`,
      originalSMS: body,
      smsFingerprint: c.fingerprint,
    };
    return { kind: 'installment', installment };
  }

  const transaction: Transaction = {
    id,
    amount: c.amount,
    category: c.category ?? 'other',
    date,
    description: c.description ?? `${c.bank} · Movimiento`,
    type: c.txType,
    source: 'sms',
    currency: c.currency,
    originalSMS: body,
    bank: c.bank,
    smsFingerprint: c.fingerprint,
  };
  if (c.location) transaction.location = c.location;
  if (c.merchant) transaction.merchant = c.merchant;
  if (c.bankRef) transaction.bankRef = c.bankRef;
  return { kind: 'transaction', transaction };
}

// ─────────────────────────────────────────────────────────────
// APRENDIZAJE POR COMERCIO Y EMPAREJAMIENTO DE COMISIONES (puros)
// ─────────────────────────────────────────────────────────────

/**
 * Aplica la regla aprendida del comercio (si hay) a un gasto de compra/débito
 * con comercio. No toca transferencias ni comisiones: en BANRURAL "en: X" es la
 * agencia, no un comercio.
 */
export function applyLearnedRule(c: SmsClassification, rules?: MerchantRule[]): SmsClassification {
  if (!rules || rules.length === 0) return c;
  if (!c.accepted || c.txType !== 'expense' || !c.merchant) return c;
  if (c.kind !== 'purchase' && c.kind !== 'installment_purchase' && c.kind !== 'debit') return c;
  const rule = findMerchantRule(rules, c.merchant);
  if (!rule) return c;
  return { ...c, category: rule.category, reason: c.reason + '|learned' };
}

const FEE_PAIR_WINDOW_MS = 5 * 60000;

/**
 * Ids de movimientos SMS que parecen la comisión de una transferencia enviada:
 * gasto en Q de monto <= FEE_PAIR_MAX, mismo banco, a ±5 minutos de una
 * transferencia (categoría 'transfer', gasto) de monto mayor. Ordena por fecha
 * y solo compara vecinos dentro de la ventana (O(n log n)).
 */
export function findPairedBankFeeIds(txs: Transaction[]): Set<string> {
  const ids = new Set<string>();
  const sorted: Array<{ t: Transaction; ts: number }> = [];
  for (const t of txs) {
    if (t.source !== 'sms') continue;
    const ts = Date.parse(t.date);
    if (isNaN(ts)) continue;
    sorted.push({ t, ts });
  }
  sorted.sort((a, b) => a.ts - b.ts);

  const isCandidate = (t: Transaction) =>
    t.type === 'expense' && (t.currency ?? 'Q') === 'Q' && t.amount <= FEE_PAIR_MAX &&
    t.category !== 'bank_fees' && t.category !== 'transfer';
  const isTransferFor = (u: Transaction, t: Transaction) =>
    u.id !== t.id && u.type === 'expense' && u.bank === t.bank && u.category === 'transfer' && u.amount > t.amount;

  for (let i = 0; i < sorted.length; i++) {
    const { t, ts } = sorted[i];
    if (!isCandidate(t)) continue;
    let found = false;
    for (let j = i - 1; j >= 0 && ts - sorted[j].ts <= FEE_PAIR_WINDOW_MS && !found; j--) {
      found = isTransferFor(sorted[j].t, t);
    }
    for (let j = i + 1; j < sorted.length && sorted[j].ts - ts <= FEE_PAIR_WINDOW_MS && !found; j++) {
      found = isTransferFor(sorted[j].t, t);
    }
    if (found) ids.add(t.id);
  }
  return ids;
}

// ─────────────────────────────────────────────────────────────
// 1k. PLAN DE IMPORTACIÓN (puro)
// ─────────────────────────────────────────────────────────────

export interface ExistingSmsIndex {
  ids: Set<string>;
  fingerprints: Set<string>;
  dismissed: Set<string>;
  installmentKeys: Set<string>;   // `${totalAmount}|${totalInstallments}|${YYYY-MM-DD}`
}

function installmentKey(amount: number, n: number, day: string): string {
  return `${amount}|${n}|${day}`;
}

/**
 * Índice de lo ya existente. Compatibilidad con los movimientos SMS legados
 * (sin smsFingerprint): su `date` es exactamente el `sms.date` original, así
 * que recalcular la huella con originalSMS + Date.parse(date) coincide.
 */
export function buildExistingSmsIndex(
  txs: Transaction[],
  insts: CreditInstallment[],
  dismissed: string[],
): ExistingSmsIndex {
  const idx: ExistingSmsIndex = {
    ids: new Set(), fingerprints: new Set(), dismissed: new Set(dismissed), installmentKeys: new Set(),
  };
  for (const t of txs) {
    if (t.source !== 'sms') continue;
    idx.ids.add(t.id);
    if (t.smsFingerprint) idx.fingerprints.add(t.smsFingerprint);
    if (t.originalSMS) {
      const ts = Date.parse(t.date);
      idx.fingerprints.add(buildSmsFingerprint(t.originalSMS, isNaN(ts) ? undefined : ts));
    }
  }
  for (const i of insts) {
    idx.ids.add(i.id);
    if (i.smsFingerprint) idx.fingerprints.add(i.smsFingerprint);
    const ts = Date.parse(i.startDate);
    if (!isNaN(ts)) {
      idx.installmentKeys.add(installmentKey(i.totalAmount, i.totalInstallments, formatLocalDay(new Date(ts))));
    }
  }
  return idx;
}

export interface SmsImportStats {
  totalRead: number;
  bankCandidates: number;
  imported: number;          // Transaction creadas (incluye las neutrales)
  installments: number;
  duplicates: number;
  dismissedByUser: number;
  promos: number;
  otp: number;               // otp + security
  declined: number;
  info: number;              // statement + balance_info
  notices: number;           // avisos informativos sin monto (no son movimientos)
  ownTransfers: number;
  untrusted: number;         // phishing + remitente no confiable
  unparsed: number;
  neutral: number;           // card_payment + loan_disbursement: SUBCONJUNTO de imported (no suma aparte)
}

export interface SmsImportPlan {
  transactions: Transaction[];
  installments: CreditInstallment[];
  stats: SmsImportStats;
  diagnostics: Array<{ kind: SmsKind; reason: string; body: string }>;
  /** SMS bancarios que el motor no entendió (alimentan el buzón de sin clasificar). */
  unrecognized: SmsInboxItem[];
}

/** Opciones de planSmsImport: aprendizaje por comercio y movimientos ya guardados. */
export interface PlanOptions {
  merchantRules?: MerchantRule[];
  existingTxs?: Transaction[];
}

export function emptySmsStats(): SmsImportStats {
  return {
    totalRead: 0, bankCandidates: 0, imported: 0, installments: 0, duplicates: 0, dismissedByUser: 0,
    promos: 0, otp: 0, declined: 0, info: 0, notices: 0, ownTransfers: 0, untrusted: 0, unparsed: 0, neutral: 0,
  };
}

const MAX_DIAGNOSTICS = 300;
/** Tope de ítems que el plan devuelve para el buzón de "sin clasificar". */
const MAX_INBOX = 200;

/**
 * Clasifica y deduplica una lista de SMS. Invariante (probado en el test):
 *   bankCandidates === imported + installments + duplicates + dismissedByUser
 *                      + promos + otp + declined + info + notices + ownTransfers
 *                      + untrusted + unparsed
 * (`neutral` es un subconjunto informativo de `imported`.)
 * Un candidato bancario es todo lo que no sea `not_bank`, salvo el remitente
 * no confiable (not_bank con reason `untrusted_sender`) que cuenta en `untrusted`.
 * Muta `index` para deduplicar dentro de la misma corrida.
 */
export function planSmsImport(
  messages: SmsInput[],
  index: ExistingSmsIndex,
  accounts: Account[],
  opts: PlanOptions = {},
): SmsImportPlan {
  const stats = emptySmsStats();
  stats.totalRead = messages.length;
  const transactions: Transaction[] = [];
  const installments: CreditInstallment[] = [];
  const diagnostics: SmsImportPlan['diagnostics'] = [];
  const unrecognized: SmsInboxItem[] = [];

  const addUnrecognized = (c: SmsClassification, msg: SmsInput) => {
    if (unrecognized.length >= MAX_INBOX) return;
    unrecognized.push({
      fingerprint: c.fingerprint,
      body: msg.body,
      address: msg.address,
      receivedAt: msg.receivedAt,
      reason: c.reason,
      bank: c.bank,
      amount: c.amount,
      currency: c.currency,
      merchant: c.merchant,
      occurredAt: c.occurredAt.toISOString(),
      suggestedType: c.amount === null ? null : (CREDITED_PAST_RE.test(prepareSms(msg.body).flat) ? 'income' : 'expense'),
    });
  };

  const addDiag = (c: SmsClassification, body: string) => {
    if (diagnostics.length < MAX_DIAGNOSTICS) diagnostics.push({ kind: c.kind, reason: c.reason, body });
  };

  for (const msg of messages) {
    const c = applyLearnedRule(classifyBankSms(msg), opts.merchantRules);
    const untrustedBank = c.kind === 'not_bank' && c.reason.startsWith('untrusted');
    if (c.kind === 'not_bank' && !untrustedBank) continue;
    stats.bankCandidates++;

    if (!c.accepted) {
      switch (c.kind) {
        case 'promo': stats.promos++; break;
        case 'otp': case 'security': stats.otp++; break;
        case 'declined': stats.declined++; break;
        case 'statement': case 'balance_info': stats.info++; break;
        case 'notice': stats.notices++; break;
        case 'own_transfer': stats.ownTransfers++; break;
        case 'phishing': case 'not_bank': stats.untrusted++; break;
        default: stats.unparsed++; addUnrecognized(c, msg); break;
      }
      addDiag(c, msg.body);
      continue;
    }

    const id = buildSmsTransactionId(c.fingerprint);
    if (index.dismissed.has(c.fingerprint) || index.dismissed.has(id)) {
      stats.dismissedByUser++;
      continue;
    }

    const isInstallment = c.kind === 'installment_purchase';
    const keys: string[] = [];
    if (isInstallment && c.amount !== null && c.installments) {
      keys.push(installmentKey(c.amount, c.installments, formatLocalDay(c.occurredAt)));
      if (typeof msg.receivedAt === 'number') {
        keys.push(installmentKey(c.amount, c.installments, formatLocalDay(new Date(msg.receivedAt))));
      }
    }
    if (index.fingerprints.has(c.fingerprint) || index.ids.has(id) || keys.some(k => index.installmentKeys.has(k))) {
      stats.duplicates++;
      continue;
    }

    const record = buildRecordFromClassification(c, msg.body, accounts);
    if (!record) { stats.unparsed++; addDiag(c, msg.body); addUnrecognized(c, msg); continue; }

    index.fingerprints.add(c.fingerprint);
    index.ids.add(id);
    keys.forEach(k => index.installmentKeys.add(k));

    if (record.kind === 'installment' && record.installment) {
      installments.push(record.installment);
      stats.installments++;
    } else if (record.transaction) {
      transactions.push(record.transaction);
      stats.imported++;
      if (c.kind === 'card_payment' || c.kind === 'loan_disbursement') stats.neutral++;
    }
  }

  // Comisiones: gasto pequeño pegado (±5 min) a una transferencia enviada del mismo banco.
  const fees = findPairedBankFeeIds([
    ...transactions,
    ...(opts.existingTxs ?? []).filter(t => t.source === 'sms'),
  ]);
  for (const t of transactions) {
    if (fees.has(t.id)) {
      t.category = 'bank_fees';
      t.description = describe('bank_fee', t.bank ?? 'Banco', null, null);
    }
  }

  return { transactions, installments, stats, diagnostics, unrecognized };
}

// ─────────────────────────────────────────────────────────────
// 1l. REVISIÓN DE LO YA IMPORTADO
// ─────────────────────────────────────────────────────────────

export interface SmsReviewItem {
  txId: string;
  action: 'remove' | 'fix';
  reasonLabel: string;
  proposed?: Partial<Pick<Transaction, 'type' | 'category' | 'date' | 'description'>>;
  original: Transaction;
}

/** Etiqueta en español de por qué un SMS no se importa (para la revisión y para explainSms). */
export function reasonLabelFor(kind: SmsKind): string {
  switch (kind) {
    case 'promo': return 'Oferta o publicidad del banco';
    case 'otp': case 'security': return 'Código de seguridad';
    case 'declined': return 'Transacción rechazada';
    case 'statement': case 'balance_info': return 'Aviso de saldo o estado de cuenta';
    case 'own_transfer': return 'Transferencia entre tus cuentas';
    case 'notice': return 'Aviso informativo del banco (sin movimiento)';
    case 'not_bank': case 'phishing': return 'No es un SMS bancario confiable';
    default: return 'No es un movimiento reconocible';
  }
}

/**
 * Reclasifica los movimientos SMS ya guardados y propone eliminar o corregir.
 * Las categorías solo se proponen si hoy son 'other', vienen de una regla
 * aprendida, cambian de familia (transferencia/comisión) o son una comisión
 * emparejada; y nunca sobre movimientos con `categoryEditedAt`.
 */
export function reviewImportedSms(
  txs: Transaction[],
  keptIds: Set<string>,
  opts: { merchantRules?: MerchantRule[] } = {},
): SmsReviewItem[] {
  const items: SmsReviewItem[] = [];

  // Pasada 1: clasificar cada movimiento SMS (con reglas aprendidas).
  const classified = new Map<string, SmsClassification>();
  for (const t of txs) {
    if (t.source !== 'sms' || !t.originalSMS || keptIds.has(t.id)) continue;
    const ts = Date.parse(t.date);
    classified.set(t.id, applyLearnedRule(
      classifyBankSms({ body: t.originalSMS, receivedAt: isNaN(ts) ? undefined : ts }),
      opts.merchantRules,
    ));
  }

  // Pasada 2: emparejar comisiones sobre la vista "ya reclasificada".
  const virtual = txs.map(t => {
    const c = classified.get(t.id);
    return c && c.accepted && c.category && c.txType ? { ...t, category: c.category, type: c.txType } : t;
  });
  const feeIds = findPairedBankFeeIds(virtual);

  for (const t of txs) {
    let c = classified.get(t.id);
    if (!c) continue;
    const ts = Date.parse(t.date);

    if (!c.accepted) {
      items.push({ txId: t.id, action: 'remove', reasonLabel: reasonLabelFor(c.kind), original: t });
      continue;
    }
    if (c.txType === null) continue;

    if (feeIds.has(t.id)) {
      c = { ...c, category: 'bank_fees', description: describe('bank_fee', c.bank, null, null) };
    }

    const proposed: NonNullable<SmsReviewItem['proposed']> = {};
    const typeChanged = c.txType !== t.type;
    const dayChanged = !isNaN(ts) && !sameLocalDay(c.occurredAt, new Date(ts));
    const salaryChanged = t.type === 'income' && t.category === 'salary' && c.category !== 'salary';
    const learned = c.reason.includes('|learned');
    const categoryFix = !t.categoryEditedAt && !!c.category && c.category !== t.category && (
      t.category === 'other' ||
      learned ||
      ['transfer', 'transfer_in', 'bank_fees'].includes(c.category) ||
      feeIds.has(t.id)
    );

    if (!(typeChanged || dayChanged || salaryChanged || categoryFix)) continue;

    if (typeChanged && c.txType) proposed.type = c.txType;
    if (c.category && c.category !== t.category && (typeChanged || salaryChanged || categoryFix)) {
      proposed.category = c.category;
    }
    if (dayChanged) proposed.date = c.occurredAt.toISOString();
    // La descripción solo se propone si hay otro cambio sustantivo (evita una avalancha de
    // cambios cosméticos de mayúsculas) o si la actual termina en puntuación suelta.
    if (c.description && c.description !== t.description &&
        (categoryFix || typeChanged || /[,;:.\-]\s*$/.test(t.description))) {
      proposed.description = c.description;
    }

    const labels: string[] = [];
    if (typeChanged) labels.push('Tipo de movimiento incorrecto');
    if (salaryChanged && !typeChanged && !categoryFix) labels.push('Categoría incorrecta');
    if (categoryFix) {
      if (c.category === 'transfer' || c.category === 'transfer_in') labels.push('Es una transferencia');
      else if (c.category === 'bank_fees') labels.push('Comisión bancaria');
      else if (learned) labels.push('Según lo que le enseñaste a la app');
      else labels.push('Categoría sugerida');
    }
    if (dayChanged) labels.push('Fecha incorrecta');
    items.push({ txId: t.id, action: 'fix', reasonLabel: labels.join(' y '), proposed, original: t });
  }
  return items;
}

// ─────────────────────────────────────────────────────────────
// DIAGNÓSTICO COMPARTIBLE (enmascarado)
// ─────────────────────────────────────────────────────────────

/** Oculta números largos, últimos dígitos de tarjeta/cuenta, nombre propio inicial y enlaces con token antes de compartir un SMS. */
export function maskSmsForDiagnostics(body: string): string {
  return body
    .replace(/\d{6,}/g, '######')
    .replace(/^\s*[A-ZÁÉÍÓÚÑ]{2,},/, 'NOMBRE,')
    .replace(/https?:\/\/\S*\/t\/\S*/g, 'https://g.bac.gt/…')
    // Últimos dígitos de tarjeta o cuenta: ****1234, **5031, xx1234.
    .replace(/(?:\*{2,}|[xX]{2,})\d{2,}/g, '****');
}
