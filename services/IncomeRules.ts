// ─────────────────────────────────────────────────────────────
// APRENDIZAJE DE DEPÓSITOS POR ORIGEN (módulo PURO, espejo de MerchantRules)
// ─────────────────────────────────────────────────────────────
// Sin react-native ni AsyncStorage: solo `import type` de ./storage y de
// ./BankSmsParser. La persistencia vive en StorageService
// (getIncomeRules / saveIncomeWithLearning).
//
// Una regla dice: «los depósitos de este banco, esta cuenta y este origen van a
// esta categoría». Se aplica solo a ingresos de SMS (transfer_in, deposit, payroll).
//
// OJO (a propósito): un ingreso aprendido deja de ser la categoría 'transfer_in',
// así que TransferPairs ya no lo toma como la mitad de una transferencia entre
// cuentas propias ni lo empareja. Es lo deseado: si el usuario enseñó que ese
// origen es, por ejemplo, su salario, no es un movimiento neutro.

import type { IncomeRule, Transaction } from './storage';
import type { SmsClassification } from './BankSmsParser';
import { extractIncomeOrigin, incomeAcctKey, incomeRuleKey, originKey } from './IncomeOrigin';

/** Tope de reglas aprendidas; al excederlo se descartan las de updatedAt más viejo. */
const MAX_INCOME_RULES = 200;

/** Tipos de SMS que pueden recibir una regla de ingreso. */
const LEARNABLE_KINDS = ['transfer_in', 'deposit', 'payroll'];

/** Clave de regla para un SMS de ingreso, o null si no dice de dónde viene el dinero. */
export function incomeKeyOfSms(bank: string | null | undefined, body: string | null | undefined): string | null {
  if (!body) return null;
  const ok = originKey(extractIncomeOrigin(body));
  if (!ok) return null;
  return incomeRuleKey((bank || 'Banco').toUpperCase(), incomeAcctKey(body), ok);
}

/** Clave de regla de un movimiento: solo ingresos que vienen de un SMS con origen. */
export function incomeKeyOfTx(tx: Transaction): string | null {
  if (tx.source !== 'sms' || tx.type !== 'income') return null;
  return incomeKeyOfSms(tx.bank, tx.originalSMS);
}

/** Origen legible del movimiento (para mostrar en el interruptor), o null. */
export function incomeOriginLabelOfTx(tx: Transaction): string | null {
  if (tx.source !== 'sms' || tx.type !== 'income') return null;
  const origin = extractIncomeOrigin(tx.originalSMS);
  return origin && originKey(origin) ? origin.replace(/\s+/g, ' ').trim() : null;
}

/** Regla que aplica a esa clave (coincidencia exacta de banco, cuenta y origen). */
export function findIncomeRule(rules: IncomeRule[] | undefined, key: string | null): IncomeRule | null {
  if (!rules || rules.length === 0 || !key) return null;
  return rules.find(r => r.key === key) ?? null;
}

function tsOf(iso: string): number {
  const n = Date.parse(iso);
  return isNaN(n) ? 0 : n;
}

/**
 * Agrega o actualiza la regla del origen (la última corrección gana). Con más de
 * 200 reglas descarta las de updatedAt más viejo. No-op si no hay clave.
 */
export function upsertIncomeRule(
  rules: IncomeRule[] | undefined,
  key: string | null,
  label: string,
  category: string,
  nowIso: string,
): IncomeRule[] {
  const current = rules ?? [];
  if (!key) return current;
  const clean = label.replace(/\s+/g, ' ').trim();
  const existing = current.find(r => r.key === key);
  let next: IncomeRule[];
  if (existing) {
    next = current.map(r => r.key === key
      ? { ...r, label: clean, category, updatedAt: nowIso, hits: r.hits + 1 }
      : r);
  } else {
    next = [...current, { key, label: clean, category, createdAt: nowIso, updatedAt: nowIso, hits: 1 }];
  }
  if (next.length > MAX_INCOME_RULES) {
    next = [...next]
      .sort((a, b) => tsOf(b.updatedAt) - tsOf(a.updatedAt))
      .slice(0, MAX_INCOME_RULES);
  }
  return next;
}

/**
 * Ids de OTROS ingresos que comparten banco, cuenta y origen con `tx` y pueden
 * recibir su categoría: source 'sms', ingreso y sin categoría editada a mano.
 */
export function sameOriginTxIds(txs: Transaction[], tx: Transaction): string[] {
  const key = incomeKeyOfTx(tx);
  if (!key) return [];
  const ids: string[] = [];
  for (const t of txs) {
    if (t.id === tx.id) continue;
    if (t.source !== 'sms' || t.type !== 'income' || t.categoryEditedAt || t.transferPairId) continue;
    if (incomeKeyOfTx(t) === key) ids.push(t.id);
  }
  return ids;
}

/**
 * Aplica la regla aprendida de ingresos (si hay) a un SMS de depósito o
 * transferencia recibida. Cambia la categoría y agrega `|learned_income` a la razón.
 * No toca gastos ni otros tipos de SMS.
 */
export function applyIncomeRule(
  c: SmsClassification,
  body: string,
  rules?: IncomeRule[],
): SmsClassification {
  if (!rules || rules.length === 0) return c;
  if (!c.accepted || c.txType !== 'income' || !LEARNABLE_KINDS.includes(c.kind)) return c;
  const rule = findIncomeRule(rules, incomeKeyOfSms(c.bank, body));
  if (!rule) return c;
  return { ...c, category: rule.category, reason: c.reason + '|learned_income' };
}
