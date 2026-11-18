// Vínculo SMS <-> cuentas/tarjetas (puro, sin React Native ni AsyncStorage).
// Contrato del Paso 0 de la ronda SMS 2. En la entrega R-A/R-B el saldo automático NO
// está activo: computeDesiredEffect devuelve siempre null y reconcileBalanceEffects es
// una función identidad (lo implementa la entrega R-C).
//
// Circularidad: ./storage importa assignAccountsToTransactions de este módulo, por eso
// aquí solo se usa `import type` de ./storage (se borra al compilar). De BankSmsParser
// solo se importan funciones puras. Regex sin lookbehind ni flags s/v (Hermes).
import type { Account, Currency, SmsLinkSeen, Transaction } from './storage';
import { detectBankName, prepareSms } from './BankSmsParser';
import { lastClosedCut, sumByCurrency } from './CardCycle';

export type LinkSignalKind = 'card' | 'acct' | 'acctpre' | 'prod' | 'kind' | 'bank';

/** Una señal del SMS. key = 'BANCO|tipo:valor' (o 'BANCO|bank'). */
export interface LinkSignal { key: string; kind: LinkSignalKind; bank: string; value: string; }

function makeSignal(bank: string, kind: LinkSignalKind, value: string): LinkSignal {
  return { key: kind === 'bank' ? `${bank}|bank` : `${bank}|${kind}:${value}`, kind, bank, value };
}

// ─────────────────────────────────────────────────────────────
// Señales del SMS
// ─────────────────────────────────────────────────────────────

const ACCT_STARS_RE = /(?:cuenta|cta\.?)\s*(?:no\.?\s*)?[*x]{2,}\s?(\d{4})/;
const ACCT_TERMINADA_RE = /cuenta\s+terminada\s+en\s+[*x]*(\d{4})\b/;
const ACCT_PRE_RE = /(?:cuenta|cta\.?)\s*(\d{4})x{2,}/;
const ACCT_GYT_RE = /de la cuenta\s+(?:no\.?\s*)?[*x]*(\d[\d-]{2,})/;
const CARD_STARS_RE = /\*{2,}\s?(\d{4})/;
const CARD_WORDS_RE = /(?:tarjeta|tarj\.?)\s+(?:(?!q\b|usd\b)[a-z&]+\s+){0,3}(\d{4})\b(?![.,]\d)/;
const CARD_TERMINADA_RE = /terminada\s+en\s+[*x]*(\d{4})\b/;
const PROD_RE = /protege tu\s+([a-z &]+?):/;
const PROD_FALLBACK_RE = /\b(visa|mastercard|amex)\b/;

function lastFour(digits: string): string {
  const only = digits.replace(/\D/g, '');
  return only.length >= 4 ? only.slice(-4) : '';
}

/**
 * Señales del SMS ordenadas de más a menos específica:
 * card / acct / acctpre → prod → kind → bank. `bank` (si viene) manda sobre la detección.
 * El comodín `BANCO|bank` no se emite cuando el banco es desconocido ('Banco').
 */
export function extractSmsLinkSignals(body: string, bank?: string): LinkSignal[] {
  const { flat } = prepareSms(body || '');
  const b = (bank && bank.trim() ? bank.trim() : detectBankName(body || '')).toUpperCase();
  const out: LinkSignal[] = [];
  const seen = new Set<string>();
  const push = (kind: LinkSignalKind, value: string): void => {
    const s = makeSignal(b, kind, value);
    if (!seen.has(s.key)) { seen.add(s.key); out.push(s); }
  };

  // Las cuentas se detectan primero y se quitan del texto para que "Cta ***5678"
  // o "cuenta 3012XXXX" no se lean después como tarjeta.
  let rest = flat;
  const accts: Array<[LinkSignalKind, string]> = [];
  const takeAcct = (re: RegExp, kind: LinkSignalKind, conv: (m: string) => string): void => {
    const m = re.exec(rest);
    if (!m) return;
    const v = conv(m[1]);
    if (v) accts.push([kind, v]);
    rest = rest.slice(0, m.index) + ' ' + rest.slice(m.index + m[0].length);
  };
  takeAcct(ACCT_STARS_RE, 'acct', lastFour);
  takeAcct(ACCT_TERMINADA_RE, 'acct', lastFour);
  takeAcct(ACCT_PRE_RE, 'acctpre', v => v);
  takeAcct(ACCT_GYT_RE, 'acct', lastFour);

  const cardM = CARD_STARS_RE.exec(rest) || CARD_WORDS_RE.exec(rest) || CARD_TERMINADA_RE.exec(rest);
  if (cardM) push('card', cardM[1]);
  for (const [kind, v] of accts) push(kind, v);

  const prodM = PROD_RE.exec(flat);
  let prod = prodM ? prodM[1].replace(/\s+/g, ' ').trim().toUpperCase() : '';
  if (!prod) {
    const f = PROD_FALLBACK_RE.exec(flat);
    if (f) prod = f[1].toUpperCase();
  }
  if (prod) push('prod', prod);

  if (/tarjeta de debito/.test(flat)) push('kind', 'debit');
  else if (/tarjeta de credito/.test(flat)) push('kind', 'credit');

  if (b && b !== 'BANCO') push('bank', b);
  return out;
}

/** 'BAC|card:5031' → 'BAC · tarjeta *5031'. */
export function linkKeyLabel(key: string): string {
  const bar = key.indexOf('|');
  if (bar < 0) return key;
  const bank = key.slice(0, bar);
  const tail = key.slice(bar + 1);
  if (tail === 'bank') return `${bank} · todos los movimientos`;
  const colon = tail.indexOf(':');
  if (colon < 0) return key;
  const kind = tail.slice(0, colon);
  const value = tail.slice(colon + 1);
  switch (kind) {
    case 'card': return `${bank} · tarjeta *${value}`;
    case 'acct': return `${bank} · cuenta *${value}`;
    case 'acctpre': return `${bank} · cuenta ${value}XXXX`;
    case 'prod': return `${bank} · ${value}`;
    case 'kind':
      return `${bank} · ${value === 'debit' ? 'tarjeta de débito' : value === 'credit' ? 'tarjeta de crédito' : value}`;
    default: return key;
  }
}

function signalFromKey(key: string): LinkSignal | null {
  const bar = key.indexOf('|');
  if (bar < 0) return null;
  const bank = key.slice(0, bar);
  const tail = key.slice(bar + 1);
  if (tail === 'bank') return makeSignal(bank, 'bank', bank);
  const colon = tail.indexOf(':');
  if (colon < 0) return null;
  const kind = tail.slice(0, colon) as LinkSignalKind;
  if (!['card', 'acct', 'acctpre', 'prod', 'kind'].includes(kind)) return null;
  return makeSignal(bank, kind, tail.slice(colon + 1));
}

// ─────────────────────────────────────────────────────────────
// Elección de la cuenta
// ─────────────────────────────────────────────────────────────

export interface AccountMatch { accountId: string | null; ambiguous: string[]; signal: LinkSignal | null; }

const SPECIFIC_KINDS: LinkSignalKind[] = ['card', 'acct', 'acctpre'];

/** ¿La cuenta tiene alguna terminación (card/acct/acctpre) de este banco? */
function hasEndingOfBank(acc: Account, bank: string): boolean {
  const prefixes = [`${bank}|card:`, `${bank}|acct:`, `${bank}|acctpre:`];
  return (acc.smsLinks ?? []).some(k => prefixes.some(p => k.startsWith(p)));
}

/**
 * Elige la cuenta por especificidad, sin adivinar: para cada señal (de más a menos
 * específica) se buscan las cuentas activas con esa clave. 1 candidata = asigna; 2 o más
 * = ambiguo (no asigna); ninguna = baja a la siguiente señal. Si el SMS trae una
 * terminación (card/acct/acctpre), las cuentas de ese banco que tengan OTRA terminación
 * quedan excluidas de las señales menos específicas.
 */
export function matchAccountForSms(signals: LinkSignal[], accounts: Account[]): AccountMatch {
  const active = accounts.filter(a => a.isActive);
  const specificBanks = new Set(signals.filter(s => SPECIFIC_KINDS.includes(s.kind)).map(s => s.bank));
  const fallback = signals[0] ?? null;

  for (const sig of signals) {
    const lowerTier = !SPECIFIC_KINDS.includes(sig.kind);
    const candidates = active.filter(a => {
      if (!(a.smsLinks ?? []).includes(sig.key)) return false;
      if (lowerTier && specificBanks.has(sig.bank) && hasEndingOfBank(a, sig.bank)) return false;
      return true;
    });
    if (candidates.length === 1) return { accountId: candidates[0].id, ambiguous: [], signal: sig };
    if (candidates.length > 1) return { accountId: null, ambiguous: candidates.map(a => a.id), signal: sig };
  }
  return { accountId: null, ambiguous: [], signal: fallback };
}

// ─────────────────────────────────────────────────────────────
// Asignación masiva
// ─────────────────────────────────────────────────────────────

/** Asigna accountId (accountSource 'rule') a movimientos SMS. Idempotente; no toca accountSource 'user'. */
export function assignAccountsToTransactions(
  txs: Transaction[],
  accounts: Account[],
): { txs: Transaction[]; assigned: number; ambiguous: number; unassigned: number } {
  let assigned = 0;
  let ambiguous = 0;
  let unassigned = 0;
  let changedAny = false;

  const next = txs.map(t => {
    if (t.source !== 'sms' || t.accountSource === 'user') return t;

    let signals: LinkSignal[] = [];
    if (t.originalSMS) signals = extractSmsLinkSignals(t.originalSMS, t.bank);
    else if (t.smsAccountHint) {
      const s = signalFromKey(t.smsAccountHint);
      if (s) signals = [s];
    }
    const hint = t.smsAccountHint ?? (signals.length ? signals[0].key : undefined);
    const m = matchAccountForSms(signals, accounts);

    let out = t;
    if (hint !== t.smsAccountHint) out = { ...out, smsAccountHint: hint };

    // Cuenta puesta sin accountSource (dato antiguo): no se pisa.
    const manages = !t.accountId || t.accountSource === 'rule';
    if (manages) {
      if (m.accountId) {
        if (t.accountId !== m.accountId || t.accountSource !== 'rule') {
          if (t.accountId !== m.accountId) assigned++;
          out = { ...out, accountId: m.accountId, accountSource: 'rule' };
        }
      } else if (t.accountId) {
        const copy: Transaction = { ...out };
        delete copy.accountId;
        delete copy.accountSource;
        out = copy;
      }
    }

    if (!out.accountId) {
      if (m.ambiguous.length >= 2) ambiguous++;
      else unassigned++;
    }
    if (out !== t) changedAny = true;
    return out;
  });

  return { txs: changedAny ? next : txs, assigned, ambiguous, unassigned };
}

/**
 * ¿Es un movimiento SMS "por asignar"? Sin cuenta, con pista de vínculo y sin decisión del
 * usuario: uno descartado a propósito (accountSource 'user' sin accountId) ya no está pendiente.
 */
export function isPendingUnassigned(t: Transaction): boolean {
  return t.source === 'sms' && !t.accountId && t.accountSource !== 'user' && !!t.smsAccountHint;
}

/** Agrupa por smsAccountHint los movimientos SMS sin cuenta ("Por asignar"); excluye los descartados. */
export function groupUnassigned(
  txs: Transaction[],
): Array<{ key: string; label: string; txIds: string[]; total: number; currency: Currency }> {
  const groups = new Map<string, Transaction[]>();
  for (const t of txs) {
    if (!isPendingUnassigned(t) || !t.smsAccountHint) continue;
    const g = groups.get(t.smsAccountHint);
    if (g) g.push(t); else groups.set(t.smsAccountHint, [t]);
  }
  const out: Array<{ key: string; label: string; txIds: string[]; total: number; currency: Currency }> = [];
  groups.forEach((list, key) => {
    // Moneda del grupo: la más frecuente; el total solo suma movimientos en esa moneda.
    const counts = new Map<Currency, number>();
    for (const t of list) counts.set(t.currency, (counts.get(t.currency) ?? 0) + 1);
    let currency: Currency = list[0].currency;
    let best = 0;
    counts.forEach((n, c) => { if (n > best) { best = n; currency = c; } });
    let total = 0;
    for (const t of list) {
      if (t.currency !== currency) continue;
      if (t.type === 'expense') total += t.amount;
      else if (t.type === 'income') total -= t.amount;
    }
    out.push({
      key, label: linkKeyLabel(key), txIds: list.map(t => t.id),
      total: Math.round(total * 100) / 100, currency,
    });
  });
  return out.sort((a, b) => b.txIds.length - a.txIds.length);
}

// ─────────────────────────────────────────────────────────────
// Saldo automático (R-C): fuera de esta entrega
// ─────────────────────────────────────────────────────────────

/** R-C (saldo automático). En R-A/R-B devuelve SIEMPRE null. */
export function computeDesiredEffect(
  tx: Transaction,
  accounts: Account[],
  exchangeRate: number,
): { accountId: string; delta: number } | null {
  void tx; void accounts; void exchangeRate;
  return null;
}

/** R-C (saldo automático). En R-A/R-B es identidad: no cambia nada ni mueve saldos. */
export function reconcileBalanceEffects(
  prevTxs: Transaction[],
  nextTxs: Transaction[],
  accounts: Account[],
  exchangeRate: number,
  nowIso: string,
): { txs: Transaction[]; accountDeltas: Record<string, number>; changed: boolean } {
  void prevTxs; void accounts; void exchangeRate; void nowIso;
  return { txs: nextTxs, accountDeltas: {}, changed: false };
}

// ─────────────────────────────────────────────────────────────
// Consumido en el ciclo de una tarjeta
// ─────────────────────────────────────────────────────────────

/**
 * "Ciclo abierto" de una tarjeta: gastos menos reembolsos (ingresos) con accountId === card.id desde el
 * día siguiente al último corte hasta hoy (el día de corte es el último día INCLUIDO en el estado, y hoy
 * todavía pertenece al ciclo abierto aunque sea día de corte). Sin cutoffDay usa el mes calendario.
 * `byCurrency` separa cada moneda sin convertir (las compras en dólares se pagan en dólares); `amount` y
 * `currency` son el total en la moneda de la tarjeta (compatibilidad). Las transferencias nunca suman.
 */
export function cycleSpentForCard(
  txs: Transaction[],
  card: Account,
  now: Date,
): { amount: number; currency: Currency; from: Date; to: Date; byCurrency: Array<{ currency: Currency; amount: number }> } {
  const closed = lastClosedCut(card, now);
  const from = new Date(closed.getFullYear(), closed.getMonth(), closed.getDate() + 1);
  const byCurrency = sumByCurrency(txs, card.id, from, now);
  const main = byCurrency.find(c => c.currency === card.currency);
  return { amount: Math.max(0, main ? main.amount : 0), currency: card.currency, from, to: now, byCurrency };
}

// ─────────────────────────────────────────────────────────────
// Inventario de terminaciones vistas
// ─────────────────────────────────────────────────────────────

const MAX_LINK_SEEN = 50;

/** Acumula claves de señal vistas en los SMS (solo claves y conteos, sin texto; máx. 50). */
export function collectLinkSeen(bodies: string[], prev: SmsLinkSeen[], nowIso: string): SmsLinkSeen[] {
  const found = new Map<string, number>();
  for (const body of bodies) {
    for (const s of extractSmsLinkSignals(body)) {
      if (s.kind === 'kind' || s.kind === 'bank') continue;
      found.set(s.key, (found.get(s.key) ?? 0) + 1);
    }
  }
  if (found.size === 0) return prev;

  const map = new Map<string, SmsLinkSeen>();
  for (const p of prev) map.set(p.key, p);
  found.forEach((n, key) => {
    const old = map.get(key);
    map.set(key, { key, count: (old?.count ?? 0) + n, lastAt: nowIso });
  });
  return Array.from(map.values())
    .sort((a, b) => b.count - a.count || (a.lastAt < b.lastAt ? 1 : a.lastAt > b.lastAt ? -1 : 0))
    .slice(0, MAX_LINK_SEEN);
}
