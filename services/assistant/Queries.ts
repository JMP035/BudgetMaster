// Consultas de solo lectura del asistente (gastos, movimientos, gastos fijos, presupuestos, metas).
// Módulo PURO: sin react-native ni AsyncStorage (de ../storage solo `import type`). Hermes: sin lookbehind.
//
// Regla de oro: los dólares y las demás monedas SIEMPRE van aparte; nunca se convierten ni se suman a Q.
// Las transferencias (type 'transfer' o con transferPairId) nunca cuentan.
// El período por defecto es el del presupuesto (ctx.period), no el mes calendario.
import type { Currency, Transaction } from '../storage';
import type { AssistantContext, DateRange, MoneyTotal, QueryId, QueryResult, QueryRow, SlotMap, SlotSpec } from './types';
import { currencyNoun, currencyOf, formatPeriodRange, formatShortDay, isTransferLike } from '../BudgetBreakdown';
import { fixedCycleConfig, fixedDueInfo, isPaidForPeriod, periodFor, storedToLocalDate } from '../FixedCycle';
import { flatText } from '../Categorizer';
import { merchantKey, merchantOfTransaction } from '../MerchantRules';
import { formatDateOnly, parseDateOnly } from '../DateAmount';
import { formatMoney } from '../format';
import { categoryLabelOf, getAllExpenseCategories, getAllIncomeCategories } from '../../categories';

// ─────────────────────────────────────────────────────────────
// Utilidades compartidas (también las usa Actions.ts)
// ─────────────────────────────────────────────────────────────

export const CURRENCY_LIST: Currency[] = ['Q', 'USD', 'EUR', '£'];

/** Normaliza el valor de un slot de moneda; null si no es una moneda soportada. */
export function normCurrency(v: unknown): Currency | null {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (s === '£') return '£';
  const u = s.toUpperCase();
  if (u === 'Q' || u === 'USD' || u === 'EUR') return u as Currency;
  return null;
}

/** 'expense' | 'income' desde el valor de un slot (acepta «gasto» / «ingreso»). */
export function normTxType(v: unknown): 'expense' | 'income' | null {
  if (typeof v !== 'string') return null;
  const s = v.trim().toLowerCase();
  if (s === 'expense' || s === 'gasto') return 'expense';
  if (s === 'income' || s === 'ingreso') return 'income';
  return null;
}

/** Día local 'YYYY-MM-DD' de un movimiento (los solo-fecha ya son ese día); '' si la fecha es inválida. */
export function txDay(t: Transaction): string {
  const d = storedToLocalDate(t.date);
  return d ? formatDateOnly(d) : '';
}

/** Número de día calendario para restar fechas 'YYYY-MM-DD' sin problemas de horario. */
export function dayNumber(ymd: string): number {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return NaN;
  return Math.round(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) / 86400000);
}

/** Rango por defecto: el período de presupuesto actual. */
export function periodRange(ctx: AssistantContext): DateRange {
  return {
    kind: 'period',
    start: formatDateOnly(ctx.period.start),
    end: formatDateOnly(ctx.period.end),
    label: formatPeriodRange({ start: ctx.period.start, end: ctx.period.end }),
  };
}

function isDateRange(v: unknown): v is DateRange {
  if (!v || typeof v !== 'object') return false;
  const r = v as DateRange;
  return typeof r.start === 'string' && typeof r.end === 'string'
    && !!parseDateOnly(r.start) && !!parseDateOnly(r.end);
}

/** Rango pedido en el slot `range` o, si falta o es inválido, el período actual. */
export function rangeOf(slots: SlotMap, ctx: AssistantContext): DateRange {
  const v = slots.range;
  if (isDateRange(v)) {
    const label = typeof v.label === 'string' && v.label ? v.label : `${v.start} – ${v.end}`;
    return v.start <= v.end ? { ...v, label } : { ...v, start: v.end, end: v.start, label };
  }
  return periodRange(ctx);
}

/** Id de categoría para un valor de slot (acepta el id o la etiqueta); null si no existe. */
export function resolveCategoryId(ctx: AssistantContext, v: unknown, kind: 'expense' | 'income' | 'any' = 'any'): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const custom = ctx.settings.customCategories ?? [];
  const lists = kind === 'expense' ? [getAllExpenseCategories(custom)]
    : kind === 'income' ? [getAllIncomeCategories(custom)]
      : [getAllExpenseCategories(custom), getAllIncomeCategories(custom)];
  const s = v.trim();
  for (const list of lists) if (list.some(c => c.id === s)) return s;
  const f = flatText(s);
  for (const list of lists) {
    const hit = list.find(c => flatText(c.label) === f);
    if (hit) return hit.id;
  }
  return null;
}

/** Id de cuenta para un valor de slot (id o nombre exacto); null si no existe. */
export function resolveAccountId(ctx: AssistantContext, v: unknown): string | null {
  if (typeof v !== 'string' || !v.trim()) return null;
  const s = v.trim();
  if (ctx.accounts.some(a => a.id === s)) return s;
  const f = flatText(s);
  const hit = ctx.accounts.find(a => flatText(a.name) === f);
  return hit ? hit.id : null;
}

function categoryName(ctx: AssistantContext, id: string, type: 'expense' | 'income'): string {
  return categoryLabelOf(id, ctx.settings.customCategories ?? [], type);
}

function cut(s: string, n: number): string {
  const clean = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return clean.length > n ? clean.slice(0, n - 1) + '…' : clean;
}

const CURRENCY_RANK: Record<string, number> = { Q: 0, USD: 1, EUR: 2, '£': 3 };
const rankOf = (c: string): number => (c in CURRENCY_RANK ? CURRENCY_RANK[c] : 9);

const round2 = (n: number): number => Math.round(n * 100) / 100;

// ─────────────────────────────────────────────────────────────
// Filtrado y totales
// ─────────────────────────────────────────────────────────────

export interface TxFilter {
  range: DateRange;
  /** Sin tipo: gastos e ingresos (las transferencias nunca). */
  type?: 'expense' | 'income';
  category?: string;
  merchant?: string;
  accountId?: string;
}

/** Movimientos que cumplen el filtro, más recientes primero. SIEMPRE excluye las transferencias. */
export function filterTransactions(ctx: AssistantContext, f: TxFilter): Transaction[] {
  const mText = f.merchant ? flatText(f.merchant) : '';
  const mKey = f.merchant ? merchantKey(f.merchant) : null;
  const picked: { t: Transaction; day: string; ts: number }[] = [];
  for (const t of ctx.transactions) {
    if (isTransferLike(t)) continue;
    if (t.type !== 'expense' && t.type !== 'income') continue;
    if (f.type && t.type !== f.type) continue;
    const dt = storedToLocalDate(t.date);
    if (!dt) continue;
    const day = formatDateOnly(dt);
    if (day < f.range.start || day > f.range.end) continue;
    if (f.category && t.category !== f.category) continue;
    if (f.accountId && t.accountId !== f.accountId) continue;
    if (mText) {
      const m = merchantOfTransaction(t);
      const hay = flatText(`${m ?? ''} ${t.description ?? ''}`);
      const keyHit = !!mKey && merchantKey(m) === mKey;
      if (!keyHit && hay.indexOf(mText) < 0) continue;
    }
    picked.push({ t, day, ts: dt.getTime() });
  }
  picked.sort((a, b) => (a.day < b.day ? 1 : a.day > b.day ? -1 : b.ts - a.ts));
  return picked.map(p => p.t);
}

/** Totales por moneda (Q primero). Nunca convierte ni suma entre monedas. Solo monedas con movimientos. */
export function totalsByCurrency(txs: Transaction[]): MoneyTotal[] {
  const map = new Map<string, MoneyTotal>();
  for (const t of txs) {
    const cur = currencyOf(t) as Currency;
    let e = map.get(cur);
    if (!e) { e = { currency: cur, amount: 0, count: 0 }; map.set(cur, e); }
    e.amount += t.amount;
    e.count += 1;
  }
  return [...map.values()]
    .map(e => ({ ...e, amount: round2(e.amount) }))
    .sort((a, b) => rankOf(a.currency) - rankOf(b.currency) || a.currency.localeCompare(b.currency));
}

function foreignNote(currencies: string[]): string | undefined {
  const foreign = currencies.filter(c => c !== 'Q');
  if (foreign.length === 0) return undefined;
  const nouns = foreign.map(currencyNoun).join(' y ');
  return `Los montos en ${nouns} no se convierten ni se suman a quetzales.`;
}

function capRows(rows: QueryRow[], max: number): { rows: QueryRow[]; moreCount: number } {
  return { rows: rows.slice(0, max), moreCount: Math.max(0, rows.length - max) };
}

function countLabel(n: number): string {
  return n === 1 ? '1 movimiento' : `${n} movimientos`;
}

function dayDate(ymd: string): Date {
  return parseDateOnly(ymd) ?? new Date(0);
}

// ─────────────────────────────────────────────────────────────
// Especificación de slots
// ─────────────────────────────────────────────────────────────

const RANGE_SLOT: SlotSpec = {
  key: 'range', type: 'range', label: 'Rango', required: false,
  question: '¿De qué fechas?',
  description: 'Rango de fechas: periodo actual (por defecto), periodo anterior o fechas personalizadas.',
};
const CATEGORY_SLOT: SlotSpec = {
  key: 'category', type: 'category_any', label: 'Categoría', required: false,
  question: '¿De qué categoría?',
  description: 'Categoría a filtrar (opcional).',
};
const MERCHANT_SLOT: SlotSpec = {
  key: 'merchant', type: 'merchant', label: 'Comercio', required: false,
  question: '¿De qué comercio?',
  description: 'Nombre del comercio o texto de la descripción a buscar (opcional).',
};
const ACCOUNT_SLOT: SlotSpec = {
  key: 'account', type: 'account', label: 'Cuenta', required: false,
  question: '¿De qué cuenta?',
  description: 'Cuenta o tarjeta a filtrar (opcional).',
};
const TX_TYPE_SLOT: SlotSpec = {
  key: 'tx_type', type: 'tx_type', label: 'Tipo', required: false,
  question: '¿Gastos o ingresos?',
  description: 'expense (gasto) o income (ingreso). Por defecto, gastos.',
};

export interface QuerySpec {
  id: QueryId;
  title: string;
  geminiName: string;
  geminiDescription: string;
  slots: SlotSpec[];
  run(slots: SlotMap, ctx: AssistantContext): QueryResult;
}

interface CommonFilter {
  range: DateRange;
  type: 'expense' | 'income' | undefined;
  category?: string;
  merchant?: string;
  accountId?: string;
}

function commonFilter(slots: SlotMap, ctx: AssistantContext): CommonFilter {
  const f: CommonFilter = { range: rangeOf(slots, ctx), type: normTxType(slots.tx_type) ?? undefined };
  const cat = resolveCategoryId(ctx, slots.category, f.type === 'income' ? 'income' : f.type === 'expense' ? 'expense' : 'any');
  if (cat) f.category = cat;
  if (typeof slots.merchant === 'string' && slots.merchant.trim()) f.merchant = slots.merchant.trim();
  const acc = resolveAccountId(ctx, slots.account);
  if (acc) f.accountId = acc;
  return f;
}

function filterParts(ctx: AssistantContext, f: CommonFilter, type: 'expense' | 'income'): string[] {
  const parts: string[] = [];
  if (f.category) parts.push(categoryName(ctx, f.category, type));
  if (f.merchant) parts.push(f.merchant);
  if (f.accountId) {
    const a = ctx.accounts.find(x => x.id === f.accountId);
    if (a) parts.push(a.name);
  }
  return parts;
}

// ─────────────────────────────────────────────────────────────
// spending_total
// ─────────────────────────────────────────────────────────────

function runSpendingTotal(slots: SlotMap, ctx: AssistantContext): QueryResult {
  const f = commonFilter(slots, ctx);
  const type: 'expense' | 'income' = f.type ?? 'expense';
  const txs = filterTransactions(ctx, { ...f, type });
  const totals = totalsByCurrency(txs);
  const base = type === 'income' ? 'Ingresos' : 'Gastos';
  const parts = filterParts(ctx, f, type);
  const title = parts.length ? `${base}: ${parts.join(' · ')}` : base;

  // Agrupa por (categoría o comercio, moneda): una fila nunca mezcla monedas.
  const byCategory = !f.category;
  const groups = new Map<string, { title: string; currency: Currency; amount: number; count: number }>();
  for (const t of txs) {
    const cur = currencyOf(t) as Currency;
    let gkey: string;
    let gtitle: string;
    if (byCategory) {
      gkey = t.category;
      gtitle = categoryName(ctx, t.category, type);
    } else {
      const m = merchantOfTransaction(t) || t.description || categoryName(ctx, t.category, type);
      gkey = merchantKey(m) ?? flatText(m);
      gtitle = m;
    }
    const k = `${cur}|${gkey}`;
    let g = groups.get(k);
    if (!g) { g = { title: gtitle, currency: cur, amount: 0, count: 0 }; groups.set(k, g); }
    g.amount += t.amount;
    g.count += 1;
  }
  const sorted = [...groups.entries()]
    .map(([k, g]) => ({ k, ...g }))
    .sort((a, b) => rankOf(a.currency) - rankOf(b.currency) || b.amount - a.amount || a.title.localeCompare(b.title));
  const allRows: QueryRow[] = sorted.map(g => ({
    id: g.k, title: g.title, subtitle: countLabel(g.count), amount: round2(g.amount), currency: g.currency,
    tone: type === 'income' ? 'income' : 'expense',
  }));
  const { rows, moreCount } = capRows(allRows, byCategory ? 20 : 10);

  const res: QueryResult = { queryId: 'spending_total', title, subtitle: f.range.label, totals, rows, moreCount };
  if (txs.length === 0) res.emptyText = type === 'income' ? 'No hay ingresos con esos filtros en este rango.' : 'No hay gastos con esos filtros en este rango.';
  const note = foreignNote(totals.map(t => t.currency));
  if (note) res.note = note;
  return res;
}

// ─────────────────────────────────────────────────────────────
// list_movements
// ─────────────────────────────────────────────────────────────

const LIST_MAX = 15;

function runListMovements(slots: SlotMap, ctx: AssistantContext): QueryResult {
  const f = commonFilter(slots, ctx);
  const txs = filterTransactions(ctx, f);
  const parts = filterParts(ctx, f, f.type ?? 'expense');
  const base = f.type === 'income' ? 'Ingresos' : f.type === 'expense' ? 'Gastos' : 'Movimientos';
  const title = parts.length ? `${base}: ${parts.join(' · ')}` : base;

  const shown = txs.slice(0, LIST_MAX);
  const rows: QueryRow[] = shown.map(t => {
    const day = txDay(t);
    const label = categoryName(ctx, t.category, t.type === 'income' ? 'income' : 'expense');
    const row: QueryRow = {
      id: t.id,
      title: (t.description && t.description.trim()) || merchantOfTransaction(t) || label,
      subtitle: `${formatShortDay(dayDate(day))} · ${label}`,
      amount: t.amount,
      currency: currencyOf(t) as Currency,
      tone: t.type === 'income' ? 'income' : 'expense',
    };
    if (t.source === 'sms' && ctx.smsOn) row.badge = 'SMS';
    return row;
  });

  // Con un tipo definido se totaliza (por moneda); mezclando gastos e ingresos un total no tendría sentido.
  const totals = f.type ? totalsByCurrency(txs) : [];
  const res: QueryResult = {
    queryId: 'list_movements', title, subtitle: f.range.label, totals, rows,
    moreCount: Math.max(0, txs.length - LIST_MAX),
  };
  if (txs.length === 0) res.emptyText = 'No hay movimientos con esos filtros en este rango.';
  const note = foreignNote([...new Set(txs.map(t => currencyOf(t)))]);
  if (note) res.note = note;
  return res;
}

// ─────────────────────────────────────────────────────────────
// fixed_pending
// ─────────────────────────────────────────────────────────────

function runFixedPending(_slots: SlotMap, ctx: AssistantContext): QueryResult {
  const cfg = fixedCycleConfig(ctx.settings);
  const today = formatDateOnly(ctx.now);
  const pending = ctx.fixedExpenses
    .filter(fe => fe.isActive && !isPaidForPeriod(fe, cfg, ctx.now))
    .map(fe => ({ fe, info: fixedDueInfo(fe, cfg, ctx.now) }))
    .sort((a, b) => a.info.due.getTime() - b.info.due.getTime() || a.fe.name.localeCompare(b.fe.name));

  const rowsAll: QueryRow[] = pending.map(({ fe, info }) => {
    const overdue = formatDateOnly(info.due) < today;   // pendiente y ya pasó su día
    const row: QueryRow = {
      id: fe.id, title: fe.name, subtitle: `Vence ${formatShortDay(info.due)}`,
      amount: fe.amount, currency: fe.currency || 'Q', tone: 'expense',
    };
    if (overdue) row.badge = 'Vencido';
    return row;
  });
  const totals = totalsByCurrency(pending.map(({ fe }) => ({ amount: fe.amount, currency: fe.currency || 'Q' }) as Transaction));
  const { rows, moreCount } = capRows(rowsAll, 20);
  const period = periodFor(cfg, ctx.now);
  const res: QueryResult = {
    queryId: 'fixed_pending', title: 'Gastos fijos pendientes',
    subtitle: formatPeriodRange({ start: period.start, end: period.end }),
    totals, rows, moreCount,
  };
  if (pending.length === 0) res.emptyText = 'No hay gastos fijos pendientes en este período.';
  const note = foreignNote(totals.map(t => t.currency));
  if (note) res.note = note;
  return res;
}

// ─────────────────────────────────────────────────────────────
// budget_status
// ─────────────────────────────────────────────────────────────

function runBudgetStatus(slots: SlotMap, ctx: AssistantContext): QueryResult {
  const range = periodRange(ctx);
  const onlyCat = resolveCategoryId(ctx, slots.category, 'expense');
  const budgets = ctx.categoryBudgets.filter(b => (b.currency || 'Q') === 'Q' && (!onlyCat || b.categoryId === onlyCat));

  const periodTxs = filterTransactions(ctx, { range, type: 'expense' });
  const spentQ = new Map<string, number>();
  const foreignCurrencies = new Set<string>();
  const budgetedIds = new Set(budgets.map(b => b.categoryId));
  for (const t of periodTxs) {
    if (!budgetedIds.has(t.category)) continue;
    const cur = currencyOf(t);
    if (cur === 'Q') spentQ.set(t.category, (spentQ.get(t.category) ?? 0) + t.amount);
    else foreignCurrencies.add(cur);
  }

  const items = budgets.map(b => {
    const spent = round2(spentQ.get(b.categoryId) ?? 0);
    const pct = b.limit > 0 ? Math.round((spent / b.limit) * 100) : 0;
    return { b, spent, pct };
  }).sort((x, y) => y.pct - x.pct || x.b.categoryId.localeCompare(y.b.categoryId));

  const rowsAll: QueryRow[] = items.map(({ b, spent, pct }) => {
    const over = spent > b.limit;
    return {
      id: b.categoryId,
      title: categoryName(ctx, b.categoryId, 'expense'),
      subtitle: over
        ? `Excedido por ${formatMoney(spent - b.limit, 'Q')} (límite ${formatMoney(b.limit, 'Q')})`
        : `Quedan ${formatMoney(b.limit - spent, 'Q')} de ${formatMoney(b.limit, 'Q')}`,
      amount: spent, currency: 'Q' as Currency, tone: 'expense' as const,
      badge: over ? 'Excedido' : `${pct}%`,
    };
  });
  const { rows, moreCount } = capRows(rowsAll, 20);
  const totalSpent = round2(items.reduce((s, i) => s + i.spent, 0));
  const totals: MoneyTotal[] = items.length ? [{ currency: 'Q', amount: totalSpent, count: items.length }] : [];

  const res: QueryResult = {
    queryId: 'budget_status',
    title: onlyCat ? `Presupuesto: ${categoryName(ctx, onlyCat, 'expense')}` : 'Presupuestos por categoría',
    subtitle: range.label, totals, rows, moreCount,
  };
  if (items.length === 0) {
    res.emptyText = onlyCat
      ? `No hay un presupuesto definido para ${categoryName(ctx, onlyCat, 'expense')}.`
      : 'No hay presupuestos por categoría definidos.';
  }
  if (foreignCurrencies.size > 0) {
    const nouns = [...foreignCurrencies].sort((a, b) => rankOf(a) - rankOf(b)).map(currencyNoun).join(' y ');
    res.note = `Hay gastos en ${nouns} en estas categorías; no cuentan para el límite en quetzales ni se convierten.`;
  }
  return res;
}

// ─────────────────────────────────────────────────────────────
// goals_status
// ─────────────────────────────────────────────────────────────

function runGoalsStatus(_slots: SlotMap, ctx: AssistantContext): QueryResult {
  const today = formatDateOnly(ctx.now);
  const goals = ctx.savingsGoals.filter(g => !g.isCompleted);
  const rowsAll: QueryRow[] = goals.map(g => {
    const pct = g.targetAmount > 0 ? Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100)) : 0;
    const dl = storedToLocalDate(g.deadline);
    const dlText = dl ? `${formatShortDay(dl)} ${dl.getFullYear()}` : 'sin fecha';
    const row: QueryRow = {
      id: g.id, title: g.name,
      subtitle: `de ${formatMoney(g.targetAmount, g.currency || 'Q')} · vence ${dlText}`,
      amount: g.currentAmount, currency: g.currency || 'Q', tone: 'neutral', badge: `${pct}%`,
    };
    if (dl && formatDateOnly(dl) < today) row.badge = 'Vencida';
    return row;
  });
  const totals = totalsByCurrency(goals.map(g => ({ amount: g.currentAmount, currency: g.currency || 'Q' }) as Transaction));
  const { rows, moreCount } = capRows(rowsAll, 20);
  const res: QueryResult = {
    queryId: 'goals_status', title: 'Metas de ahorro', subtitle: 'Ahorrado hasta hoy', totals, rows, moreCount,
  };
  if (goals.length === 0) res.emptyText = 'No tiene metas de ahorro activas.';
  const note = foreignNote(totals.map(t => t.currency));
  if (note) res.note = note;
  return res;
}

// ─────────────────────────────────────────────────────────────
// Registro
// ─────────────────────────────────────────────────────────────

export const QUERIES: Record<QueryId, QuerySpec> = {
  spending_total: {
    id: 'spending_total', title: 'Total gastado',
    geminiName: 'consultar_gastos',
    geminiDescription: 'Total de gastos (o ingresos) del periodo, por moneda y desglosado por categoría o comercio. Los dólares se informan aparte.',
    slots: [RANGE_SLOT, CATEGORY_SLOT, MERCHANT_SLOT, ACCOUNT_SLOT, TX_TYPE_SLOT],
    run: runSpendingTotal,
  },
  list_movements: {
    id: 'list_movements', title: 'Movimientos',
    geminiName: 'listar_movimientos',
    geminiDescription: 'Lista los movimientos más recientes, con filtros opcionales de comercio, categoría, cuenta y fechas.',
    slots: [RANGE_SLOT, CATEGORY_SLOT, MERCHANT_SLOT, ACCOUNT_SLOT, TX_TYPE_SLOT],
    run: runListMovements,
  },
  fixed_pending: {
    id: 'fixed_pending', title: 'Gastos fijos pendientes',
    geminiName: 'gastos_fijos_pendientes',
    geminiDescription: 'Gastos fijos activos que faltan por pagar en el periodo de presupuesto actual, con los vencidos marcados.',
    slots: [],
    run: runFixedPending,
  },
  budget_status: {
    id: 'budget_status', title: 'Estado de presupuestos',
    geminiName: 'estado_presupuestos',
    geminiDescription: 'Gasto en quetzales contra el límite de cada presupuesto por categoría en el periodo actual.',
    slots: [{ ...CATEGORY_SLOT, type: 'category_expense', description: 'Categoría de gasto a revisar (opcional; sin ella, todas).' }],
    run: runBudgetStatus,
  },
  goals_status: {
    id: 'goals_status', title: 'Metas de ahorro',
    geminiName: 'estado_metas',
    geminiDescription: 'Metas de ahorro activas con lo ahorrado, el objetivo y la fecha límite.',
    slots: [],
    run: runGoalsStatus,
  },
};

// ─────────────────────────────────────────────────────────────
// Salida compacta para el modelo
// ─────────────────────────────────────────────────────────────

/**
 * Resumen mínimo de un resultado para devolverlo a Gemini: máx 20 filas, textos de fila de hasta 40
 * caracteres y sin ids de movimiento, `originalSMS`, `bankRef` ni huellas (ni siquiera existen en QueryRow).
 */
export function compactForModel(r: QueryResult): Record<string, unknown> {
  const out: Record<string, unknown> = {
    consulta: r.queryId,
    titulo: cut(r.title, 40),
    periodo: cut(r.subtitle, 40),
    totales: r.totals.map(t => ({ moneda: t.currency, monto: round2(t.amount), movimientos: t.count })),
    filas: r.rows.slice(0, 20).map(row => {
      const o: Record<string, unknown> = { titulo: cut(row.title, 40) };
      if (row.subtitle) o.detalle = cut(row.subtitle, 40);
      if (row.amount !== undefined) o.monto = round2(row.amount);
      if (row.currency) o.moneda = row.currency;
      if (row.badge) o.marca = cut(row.badge, 40);
      return o;
    }),
    mas_filas: r.moreCount + Math.max(0, r.rows.length - 20),
  };
  if (r.emptyText) out.sin_datos = cut(r.emptyText, 120);
  if (r.note) out.nota = cut(r.note, 120);
  return out;
}
