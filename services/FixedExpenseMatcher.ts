// Emparejamiento gasto fijo <-> movimiento SMS (módulo PURO, decisión D4).
// Sin react-native ni AsyncStorage: de ./storage solo `import type`.
//
// Puntaje (máximo 100):
//   nombre  50 = merchantKey igual a fe.smsMatchKey (aprendido)
//           40 = una palabra del nombre (>= 4 letras) aparece en el comercio o la descripción
//           30 = coincide un grupo de alias (luz, agua, internet, streaming)
//   monto   30 = diferencia <= 0.01 ; 20 = hasta 10 % ; 10 = hasta 35 % (solo utilities/internet)
//   ventana 20 = del día de pago -7 al +5 ; 5 = otro día del mes calendario actual
// Solo se marca sola con puntaje >= 80 y único en ambos sentidos; entre 45 y 79
// (o con varios candidatos) es propuesta.
import type { FixedExpense, Transaction } from './storage';
import { flatText } from './Categorizer';
import { merchantKey, merchantOfTransaction } from './MerchantRules';

export interface FixedMatch { expenseId: string; txId: string; score: number; auto: boolean; reasons: string[]; }

export const FIXED_AUTO_THRESHOLD = 80;
export const FIXED_PROPOSE_THRESHOLD = 45;

interface AliasGroup {
  /** Palabras genéricas que pueden aparecer en el nombre del gasto fijo. */
  labels: string[];
  /** Marcas / proveedores que pueden aparecer en el SMS. */
  aliases: string[];
}

const ALIAS_GROUPS: AliasGroup[] = [
  { labels: ['luz', 'electricidad', 'energia', 'electrica'], aliases: ['eegsa', 'energuate', 'deocsa', 'deorsa'] },
  { labels: ['agua'], aliases: ['empagua', 'agua', 'municipalidad'] },
  {
    labels: ['internet', 'cable', 'telefono', 'celular', 'plan', 'wifi', 'fibra'],
    aliases: ['tigo', 'claro', 'telgua', 'starlink', 'movistar'],
  },
  {
    labels: ['streaming', 'suscripcion', 'subscripcion'],
    // Mismos nombres que la regla `streaming` del Categorizer.
    aliases: [
      'netflix', 'spotify', 'disney', 'hbo', 'max.com', 'youtube', 'prime video', 'paramount', 'crunchyroll',
      'vix', 'star plus', 'apple tv',
    ],
  },
];

const RENT_RE = /\b(renta|alquiler)\b/;

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** ¿`word` aparece en `text` como palabra (o inicio de palabra)? Ambos ya en flatText. */
function hasWord(text: string, word: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${escapeRe(word)}`).test(text);
}

/** Texto plano del movimiento: comercio + descripción. */
function txText(tx: Transaction): string {
  return flatText(`${merchantOfTransaction(tx) ?? ''} ${tx.description ?? ''}`);
}

function sameMonth(iso: string, ref: Date): boolean {
  const d = new Date(iso);
  return !isNaN(d.getTime()) && d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function scoreName(fe: FixedExpense, tx: Transaction, text: string): { score: number; reason?: string } {
  const feKey = fe.smsMatchKey ? flatText(fe.smsMatchKey) : null;
  if (feKey && merchantKey(merchantOfTransaction(tx)) === feKey) {
    return { score: 50, reason: 'comercio aprendido' };
  }

  const name = flatText(fe.name).replace(/[^a-z0-9. ]/g, ' ').replace(/\s+/g, ' ').trim();
  const words = name.split(' ').filter(w => w.length >= 4);
  if (words.some(w => hasWord(text, w))) return { score: 40, reason: 'nombre en el comercio' };

  for (const g of ALIAS_GROUPS) {
    const nameHasLabel = g.labels.some(l => hasWord(name, l));
    if (!nameHasLabel) continue;
    // Si el nombre ya nombra a un proveedor concreto que NO es el del SMS (ej. "Claro" vs TIGO), no hay crédito.
    const nameBrands = g.aliases.filter(a => hasWord(name, a));
    if (nameBrands.some(a => !hasWord(text, a))) continue;
    if (g.aliases.some(a => hasWord(text, a))) return { score: 30, reason: 'proveedor del mismo rubro' };
  }
  return { score: 0 };
}

function scoreAmount(fe: FixedExpense, tx: Transaction): { score: number; reason?: string } {
  const diff = Math.abs(tx.amount - fe.amount);
  if (diff <= 0.01) return { score: 30, reason: 'monto exacto' };
  const rel = fe.amount > 0 ? diff / fe.amount : Infinity;
  if (rel <= 0.10) return { score: 20, reason: 'monto similar (<=10%)' };
  if (rel <= 0.35 && (fe.category === 'utilities' || fe.category === 'internet')) {
    return { score: 10, reason: 'monto variable (<=35%)' };
  }
  return { score: 0 };
}

function scoreWindow(fe: FixedExpense, tx: Transaction): { score: number; reason: string } {
  const delta = new Date(tx.date).getDate() - fe.dayOfMonth;
  if (delta >= -7 && delta <= 5) return { score: 20, reason: 'cerca del día de pago' };
  return { score: 5, reason: 'otro día del mes' };
}

/**
 * Puntúa cada (gasto fijo, movimiento candidato). `auto` solo con puntaje >= FIXED_AUTO_THRESHOLD
 * y único en ambos sentidos; entre FIXED_PROPOSE_THRESHOLD y 79 es propuesta. Ordenado por puntaje.
 */
export function matchFixedExpenses(
  candidates: Transaction[],
  expenses: FixedExpense[],
  allTxs: Transaction[],
  now: Date,
): FixedMatch[] {
  // Gastos fijos que ya tienen un movimiento (manual) este mes: no se consideran.
  const paidThisMonth = new Set<string>();
  for (const t of allTxs) {
    if (!sameMonth(t.date, now)) continue;
    if (t.fixedExpenseId) paidThisMonth.add(t.fixedExpenseId);
    if (t.id.startsWith('fe_tx_')) paidThisMonth.add(t.id.slice('fe_tx_'.length));
  }

  const cands = candidates.filter(t =>
    t.type === 'expense' && !t.fixedExpenseId && sameMonth(t.date, now));
  const active = expenses.filter(fe =>
    fe.isActive && !fe.isPaid && !paidThisMonth.has(fe.id));

  const scored: FixedMatch[] = [];
  for (const fe of active) {
    for (const tx of cands) {
      if (tx.currency !== fe.currency) continue;
      const text = txText(tx);
      const name = scoreName(fe, tx, text);
      const amount = scoreAmount(fe, tx);
      const win = scoreWindow(fe, tx);

      const rentFallback = name.score === 0 && RENT_RE.test(flatText(fe.name))
        && amount.score === 30 && tx.category === 'transfer';
      // Sin ninguna señal de nombre solo se admite la renta (transferencia con monto exacto).
      if (name.score === 0 && !rentFallback) continue;

      const score = name.score + amount.score + win.score;
      if (score < FIXED_PROPOSE_THRESHOLD) continue;

      const reasons = [name.reason, amount.reason, win.reason].filter((r): r is string => !!r);
      if (rentFallback) reasons.unshift('renta: transferencia con monto exacto');
      scored.push({ expenseId: fe.id, txId: tx.id, score, auto: false, reasons });
    }
  }

  const perExpense = new Map<string, number>();
  const perTx = new Map<string, number>();
  for (const m of scored) {
    perExpense.set(m.expenseId, (perExpense.get(m.expenseId) ?? 0) + 1);
    perTx.set(m.txId, (perTx.get(m.txId) ?? 0) + 1);
  }
  for (const m of scored) {
    m.auto = m.score >= FIXED_AUTO_THRESHOLD
      && perExpense.get(m.expenseId) === 1
      && perTx.get(m.txId) === 1;
  }
  return scored.sort((a, b) => b.score - a.score);
}
