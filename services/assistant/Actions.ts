// Parte PURA de las acciones del asistente: slots, validación, avisos, resumen y construcción de la
// entidad (la escritura y el deshacer viven en Executor.ts). Sin react-native ni AsyncStorage (de
// ../storage solo `import type`). Hermes: sin lookbehind. Fechas con formatDateOnly / parseDateOnly.
import type { Currency, FixedExpense, SavingsGoal, Transaction } from '../storage';
import type {
  ActionDraft, ActionId, ActionProposal, AssistantContext, Chip, DupHint, SlotMap, SlotSpec, SlotValue,
  SummaryRow, ValidationIssue,
} from './types';
import { formatDateOnly, parseAmount, parseDateOnly } from '../DateAmount';
import { formatMoney } from '../format';
import { formatShortDay, currencyOf, isTransferLike } from '../BudgetBreakdown';
import { flatText } from '../Categorizer';
import { merchantKey, merchantOfTransaction } from '../MerchantRules';
import { findManualSmsDuplicates } from '../DuplicateDetector';
import {
  CATEGORY_COLORS, categoryLabelOf, getAllExpenseCategories, getAllIncomeCategories,
} from '../../categories';
import {
  CURRENCY_LIST, dayNumber, filterTransactions, normCurrency, normTxType, periodRange, resolveAccountId,
  resolveCategoryId, txDay,
} from './Queries';
import { formatDateEs } from './DateParser';
import { guessCategoryForText } from './Lexicon';
import { periodCategoryLimit } from '../PeriodBudget';

export const MAX_AMOUNT = 100_000_000;
export const HIGH_AMOUNT = 100_000;
const DEFAULT_ALERT_AT = 80;
const GOAL_NAME_MAX = 40;
const FIXED_NAME_MAX = 60;
const DESCRIPTION_MAX = 100;
const MAX_PAST_DAYS = 366;

export interface ActionSpec {
  id: ActionId;
  title: string;
  icon: string;
  geminiName: string;
  geminiDescription: string;
  slots: SlotSpec[];
  validate(slots: SlotMap, ctx: AssistantContext): ValidationIssue[];
  /** `excludeId`: id de un movimiento ya guardado que no debe contarse como duplicado de sí mismo. */
  warnings(slots: SlotMap, ctx: AssistantContext, excludeId?: string): string[];
  summarize(slots: SlotMap, ctx: AssistantContext): SummaryRow[];
  build(slots: SlotMap, ctx: AssistantContext, ids: { entityId: string; nowIso: string }): ActionDraft;
}

// ─────────────────────────────────────────────────────────────
// Lectura tolerante de slots
// ─────────────────────────────────────────────────────────────

function isEmptyValue(v: SlotValue | undefined | null): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'number') return !Number.isFinite(v);
  return false;
}

function amountOf(slots: SlotMap): number | undefined {
  const v = slots.amount;
  if (typeof v === 'number') return Number.isFinite(v) ? v : undefined;
  if (typeof v === 'string') { const n = parseAmount(v); return Number.isFinite(n) ? n : undefined; }
  return undefined;
}

function textOf(v: SlotValue | undefined, max: number): string {
  if (typeof v !== 'string') return '';
  const s = v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim();
  return s.length > max ? s.slice(0, max).trim() : s;
}

function dayOfMonthOf(slots: SlotMap): number | undefined {
  const v = slots.day;
  if (typeof v === 'number') return v;
  if (typeof v === 'string' && /^\d+$/.test(v.trim())) return Number(v.trim());
  return undefined;
}

function ymdOf(v: SlotValue | undefined): string | undefined {
  return typeof v === 'string' && parseDateOnly(v) ? v : undefined;
}

function currencyOfSlots(slots: SlotMap, ctx: AssistantContext): Currency {
  return normCurrency(slots.currency) ?? normCurrency(ctx.settings.currency) ?? 'Q';
}

function todayYmd(ctx: AssistantContext): string {
  return formatDateOnly(ctx.now);
}

// ─────────────────────────────────────────────────────────────
// Chips
// ─────────────────────────────────────────────────────────────

const DEFAULT_EXPENSE_CHIPS = ['food', 'groceries', 'transport', 'fuel', 'restaurant', 'utilities', 'shopping', 'health'];
const DEFAULT_INCOME_CHIPS = ['salary', 'freelance', 'bonus', 'business', 'gift', 'other'];

/**
 * Chips de categoría: las 6 con más gasto en Q del período (completadas con las habituales) y, salvo con
 * `all`, un chip «Ver todas». Con `all` devuelve la lista completa. El valor es la etiqueta visible.
 */
export function topCategoryChips(ctx: AssistantContext, kind: 'expense' | 'income', all = false): Chip[] {
  const custom = ctx.settings.customCategories ?? [];
  const list = (kind === 'income' ? getAllIncomeCategories(custom) : getAllExpenseCategories(custom))
    .filter(c => c.id !== 'transfer' && c.id !== 'transfer_in');
  if (all) return list.map(c => ({ label: c.label, value: c.label }));

  const spent = new Map<string, number>();
  for (const t of filterTransactions(ctx, { range: periodRange(ctx), type: kind })) {
    if (currencyOf(t) !== 'Q') continue;
    spent.set(t.category, (spent.get(t.category) ?? 0) + t.amount);
  }
  const ids = [...spent.entries()].sort((a, b) => b[1] - a[1]).map(e => e[0]).filter(id => list.some(c => c.id === id));
  for (const id of kind === 'income' ? DEFAULT_INCOME_CHIPS : DEFAULT_EXPENSE_CHIPS) {
    if (ids.length >= 6) break;
    if (!ids.includes(id) && list.some(c => c.id === id)) ids.push(id);
  }
  const chips = ids.slice(0, 6).map(id => {
    const c = list.find(x => x.id === id)!;
    return { label: c.label, value: c.label };
  });
  chips.push({ label: 'Ver todas', value: 'Ver todas' });
  return chips;
}

const mk = (labels: string[]): Chip[] => labels.map(l => ({ label: l, value: l }));
const CURRENCY_CHIPS = (): Chip[] => mk(['Quetzales', 'Dólares']);
const DAY_CHIPS = (): Chip[] => mk(['1', '15', '30', 'Fin de mes']);
const FUTURE_CHIPS = (): Chip[] => mk(['En 3 meses', 'En 6 meses', 'Fin de año', 'En 1 año']);
const PAST_CHIPS = (): Chip[] => mk(['Hoy', 'Ayer']);
const TX_TYPE_CHIPS = (): Chip[] => mk(['Gasto', 'Ingreso']);

// ─────────────────────────────────────────────────────────────
// Slots por acción
// ─────────────────────────────────────────────────────────────

const AMOUNT_SLOT = (question: string): SlotSpec => ({
  key: 'amount', type: 'amount', label: 'Monto', required: true, question,
  description: 'Monto positivo, solo el número (sin símbolo de moneda).',
});

const CURRENCY_SLOT = (description = 'Moneda: Q (quetzales), USD, EUR o £. Por defecto, la moneda principal.'): SlotSpec => ({
  key: 'currency', type: 'currency', label: 'Moneda', required: false,
  question: '¿En qué moneda?', description,
  chips: CURRENCY_CHIPS,
  defaultValue: ctx => normCurrency(ctx.settings.currency) ?? 'Q',
});

const GOAL_SLOTS: SlotSpec[] = [
  {
    key: 'name', type: 'text', label: 'Nombre', required: true,
    question: '¿Cómo se llama la meta?', description: 'Nombre corto de la meta (máx. 40 caracteres).',
  },
  AMOUNT_SLOT('¿Cuánto quiere ahorrar?'),
  {
    key: 'deadline', type: 'date_future', label: 'Fecha límite', required: true,
    question: '¿Para cuándo?', description: 'Fecha límite futura, formato YYYY-MM-DD.',
    chips: FUTURE_CHIPS,
  },
  CURRENCY_SLOT(),
];

const BUDGET_SLOTS: SlotSpec[] = [
  {
    key: 'category', type: 'category_expense', label: 'Categoría', required: true,
    question: '¿De qué categoría?', description: 'Categoría de gasto a limitar.',
    chips: ctx => topCategoryChips(ctx, 'expense'),
  },
  AMOUNT_SLOT('¿Cuál es el límite mensual, en quetzales?'),
  {
    key: 'currency', type: 'currency', label: 'Moneda', required: false,
    question: '¿En qué moneda?', description: 'Solo se admite Q: los presupuestos por categoría se manejan en quetzales.',
    chips: CURRENCY_CHIPS,
  },
];

const FIXED_SLOTS: SlotSpec[] = [
  {
    key: 'name', type: 'text', label: 'Nombre', required: true,
    question: '¿Cómo se llama el gasto fijo?', description: 'Nombre del gasto fijo (por ejemplo, Netflix o Luz).',
  },
  AMOUNT_SLOT('¿De cuánto es el pago?'),
  {
    key: 'day', type: 'day_of_month', label: 'Día de cobro', required: true,
    question: '¿Qué día del mes se cobra?', description: 'Día del mes en que vence, entero de 1 a 31.',
    chips: DAY_CHIPS,
  },
  CURRENCY_SLOT(),
  {
    key: 'category', type: 'category_expense', label: 'Categoría', required: true,
    question: '¿De qué categoría es?', description: 'Categoría de gasto del pago fijo.',
    chips: ctx => topCategoryChips(ctx, 'expense'),
    defaultValue: (ctx, slots) => {
      const g = guessCategoryForText(textOf(slots.name, FIXED_NAME_MAX), ctx, 'expense');
      return g === 'other' ? undefined : g;
    },
  },
];

const txKind = (slots: SlotMap): 'expense' | 'income' => normTxType(slots.tx_type) ?? 'expense';

const TX_SLOTS: SlotSpec[] = [
  {
    key: 'tx_type', type: 'tx_type', label: 'Tipo', required: true,
    question: '¿Es un gasto o un ingreso?', description: 'expense (gasto) o income (ingreso).',
    chips: TX_TYPE_CHIPS,
  },
  AMOUNT_SLOT('¿De cuánto fue?'),
  {
    key: 'category', type: 'category_any', label: 'Categoría', required: true,
    question: '¿De qué categoría?', description: 'Categoría del movimiento, según sea gasto o ingreso.',
    chips: (ctx, slots) => topCategoryChips(ctx, txKind(slots)),
    defaultValue: (ctx, slots) => {
      const desc = textOf(slots.description, DESCRIPTION_MAX);
      const g = guessCategoryForText(desc, ctx, txKind(slots));
      if (g === 'other' && !desc) return undefined;
      return g;
    },
  },
  {
    key: 'description', type: 'text', label: 'Descripción', required: false,
    question: '¿Qué descripción le pongo?', description: 'Comercio o concepto (opcional; por defecto, la categoría).',
  },
  {
    key: 'date', type: 'date_past', label: 'Fecha', required: false,
    question: '¿Cuándo fue?', description: 'Fecha del movimiento (hoy o pasada), formato YYYY-MM-DD.',
    chips: PAST_CHIPS,
    defaultValue: ctx => todayYmd(ctx),
  },
  CURRENCY_SLOT(),
  {
    key: 'account', type: 'account', label: 'Cuenta', required: false,
    question: '¿En qué cuenta?', description: 'Cuenta o tarjeta (opcional).',
  },
];

// ─────────────────────────────────────────────────────────────
// Validaciones compartidas
// ─────────────────────────────────────────────────────────────

function missingIssues(specSlots: SlotSpec[], slots: SlotMap): ValidationIssue[] {
  return specSlots
    .filter(s => s.required && isEmptyValue(slots[s.key]))
    .map(s => ({ slot: s.key, message: `Falta indicar: ${s.label.toLowerCase()}.` }));
}

function amountIssues(slots: SlotMap): ValidationIssue[] {
  if (isEmptyValue(slots.amount)) return [];   // lo avisa missingIssues
  const a = amountOf(slots);
  if (a === undefined || !(a > 0)) return [{ slot: 'amount', message: 'El monto debe ser mayor que cero.' }];
  if (a >= MAX_AMOUNT) return [{ slot: 'amount', message: 'El monto es demasiado grande (máximo 99,999,999.99).' }];
  return [];
}

function currencyIssues(slots: SlotMap): ValidationIssue[] {
  if (isEmptyValue(slots.currency)) return [];
  return normCurrency(slots.currency)
    ? []
    : [{ slot: 'currency', message: `La moneda debe ser ${CURRENCY_LIST.join(', ')}.` }];
}

const highAmountWarning = (slots: SlotMap): string[] => {
  const a = amountOf(slots);
  return a !== undefined && a >= HIGH_AMOUNT && a < MAX_AMOUNT ? ['Monto inusualmente alto; revise antes de confirmar.'] : [];
};

function catLabel(ctx: AssistantContext, id: string, type: 'expense' | 'income'): string {
  return categoryLabelOf(id, ctx.settings.customCategories ?? [], type);
}

const moneyRow = (label: string, amount: number | undefined, currency: Currency, slotKey: string): SummaryRow => (
  amount === undefined
    ? { label, value: '—', slotKey }
    : { label, value: formatMoney(amount, currency), money: { amount, currency }, slotKey }
);

function dateRow(label: string, ymd: string | undefined, slotKey: string): SummaryRow {
  return { label, value: ymd ? formatDateEs(ymd) : '—', slotKey };
}

// ─────────────────────────────────────────────────────────────
// create_goal
// ─────────────────────────────────────────────────────────────

const createGoal: ActionSpec = {
  id: 'create_goal',
  title: 'Nueva meta de ahorro',
  icon: 'trophy-outline',
  geminiName: 'proponer_meta_ahorro',
  geminiDescription: 'Prepara una meta de ahorro (nombre, monto objetivo y fecha límite). La persona debe confirmarla en la app.',
  slots: GOAL_SLOTS,

  validate(slots, ctx) {
    const issues = [...missingIssues(GOAL_SLOTS, slots), ...amountIssues(slots), ...currencyIssues(slots)];
    if (!isEmptyValue(slots.name)) {
      const raw = typeof slots.name === 'string' ? slots.name.replace(/\s+/g, ' ').trim() : '';
      if (raw.length < 1) issues.push({ slot: 'name', message: 'El nombre de la meta es obligatorio.' });
      else if (raw.length > GOAL_NAME_MAX) issues.push({ slot: 'name', message: `El nombre admite hasta ${GOAL_NAME_MAX} caracteres.` });
    }
    if (!isEmptyValue(slots.deadline)) {
      const d = ymdOf(slots.deadline);
      if (!d) issues.push({ slot: 'deadline', message: 'La fecha límite no es válida.' });
      else if (!(dayNumber(d) > dayNumber(todayYmd(ctx)))) issues.push({ slot: 'deadline', message: 'La fecha límite debe ser posterior a hoy.' });
    }
    return issues;
  },

  warnings(slots) {
    return highAmountWarning(slots);
  },

  summarize(slots, ctx) {
    const cur = currencyOfSlots(slots, ctx);
    return [
      { label: 'Nombre', value: textOf(slots.name, GOAL_NAME_MAX) || '—', slotKey: 'name' },
      moneyRow('Objetivo', amountOf(slots), cur, 'amount'),
      dateRow('Fecha límite', ymdOf(slots.deadline), 'deadline'),
    ];
  },

  build(slots, ctx, ids) {
    const deadline = parseDateOnly(ymdOf(slots.deadline) ?? '') ?? ctx.now;
    const goal: SavingsGoal = {
      id: ids.entityId,
      name: textOf(slots.name, GOAL_NAME_MAX),
      targetAmount: amountOf(slots) ?? 0,
      currentAmount: 0,
      currency: currencyOfSlots(slots, ctx),
      deadline: deadline.toISOString(),
      icon: 'star-outline',
      color: CATEGORY_COLORS[0],
      isCompleted: false,
      createdAt: ids.nowIso,
    };
    return { kind: 'create_goal', goal };
  },
};

// ─────────────────────────────────────────────────────────────
// set_category_budget
// ─────────────────────────────────────────────────────────────

function spentQInPeriod(ctx: AssistantContext, categoryId: string): number {
  let sum = 0;
  for (const t of filterTransactions(ctx, { range: periodRange(ctx), type: 'expense', category: categoryId })) {
    if (currencyOf(t) === 'Q') sum += t.amount;
  }
  return Math.round(sum * 100) / 100;
}

const setCategoryBudget: ActionSpec = {
  id: 'set_category_budget',
  title: 'Límite por categoría',
  icon: 'pie-chart-outline',
  geminiName: 'proponer_presupuesto_categoria',
  geminiDescription: 'Prepara un límite de gasto MENSUAL para una categoría, siempre en quetzales (la app lo reparte por período si la persona cobra por quincena o semana). Reemplaza el límite actual si existe. La persona debe confirmarlo en la app.',
  slots: BUDGET_SLOTS,

  validate(slots, ctx) {
    const issues = [...missingIssues(BUDGET_SLOTS, slots), ...amountIssues(slots)];
    if (!isEmptyValue(slots.currency)) {
      const c = normCurrency(slots.currency);
      if (!c) issues.push({ slot: 'currency', message: `La moneda debe ser ${CURRENCY_LIST.join(', ')}.` });
      else if (c !== 'Q') issues.push({ slot: 'currency', message: 'Los presupuestos por categoría se manejan en quetzales.' });
    }
    if (!isEmptyValue(slots.category) && !resolveCategoryId(ctx, slots.category, 'expense')) {
      issues.push({ slot: 'category', message: 'La categoría no existe.' });
    }
    return issues;
  },

  warnings(slots, ctx) {
    const out: string[] = [];
    const id = resolveCategoryId(ctx, slots.category, 'expense');
    const amount = amountOf(slots);
    if (id) {
      const prev = ctx.categoryBudgets.find(b => b.categoryId === id);
      if (prev) out.push(`Reemplaza el límite actual de ${formatMoney(prev.limit, 'Q')}.`);
      if (amount !== undefined) {
        // El límite es mensual: el gasto del período se compara contra el límite repartido a ese período.
        const spent = spentQInPeriod(ctx, id);
        if (spent > periodCategoryLimit(amount, ctx.settings.paymentCycle)) out.push(`En el período ya van ${formatMoney(spent, 'Q')}.`);
      }
    }
    return [...out, ...highAmountWarning(slots)];
  },

  summarize(slots, ctx) {
    const id = resolveCategoryId(ctx, slots.category, 'expense');
    return [
      { label: 'Categoría', value: id ? catLabel(ctx, id, 'expense') : '—', slotKey: 'category' },
      moneyRow('Límite mensual', amountOf(slots), 'Q', 'amount'),
    ];
  },

  build(slots, ctx) {
    const categoryId = resolveCategoryId(ctx, slots.category, 'expense') ?? '';
    const previous = ctx.categoryBudgets.find(b => b.categoryId === categoryId) ?? null;
    return {
      kind: 'set_category_budget',
      budget: { categoryId, limit: amountOf(slots) ?? 0, currency: 'Q', alertAt: previous?.alertAt ?? DEFAULT_ALERT_AT },
      previous,
    };
  },
};

// ─────────────────────────────────────────────────────────────
// create_fixed_expense
// ─────────────────────────────────────────────────────────────

/** merchantKey del nombre, solo si SMS está activo y algún movimiento SMS ya lo trae. */
function smsMatchKeyFor(name: string, ctx: AssistantContext): string | undefined {
  if (!ctx.smsOn) return undefined;
  const key = merchantKey(name);
  if (!key) return undefined;
  const hit = ctx.transactions.some(t => t.source === 'sms' && merchantKey(merchantOfTransaction(t)) === key);
  return hit ? key : undefined;
}

const createFixedExpense: ActionSpec = {
  id: 'create_fixed_expense',
  title: 'Nuevo gasto fijo',
  icon: 'calendar-outline',
  geminiName: 'proponer_gasto_fijo',
  geminiDescription: 'Prepara un gasto fijo mensual (nombre, monto y día de cobro). La persona debe confirmarlo en la app.',
  slots: FIXED_SLOTS,

  validate(slots, ctx) {
    const issues = [...missingIssues(FIXED_SLOTS, slots), ...amountIssues(slots), ...currencyIssues(slots)];
    if (!isEmptyValue(slots.name)) {
      const raw = typeof slots.name === 'string' ? slots.name.replace(/\s+/g, ' ').trim() : '';
      if (raw.length < 1) issues.push({ slot: 'name', message: 'El nombre del gasto fijo es obligatorio.' });
      else if (raw.length > FIXED_NAME_MAX) issues.push({ slot: 'name', message: `El nombre admite hasta ${FIXED_NAME_MAX} caracteres.` });
    }
    if (!isEmptyValue(slots.day)) {
      const d = dayOfMonthOf(slots);
      if (d === undefined || !Number.isInteger(d) || d < 1 || d > 31) issues.push({ slot: 'day', message: 'El día de cobro debe ser un número entero de 1 a 31.' });
    }
    if (!isEmptyValue(slots.category) && !resolveCategoryId(ctx, slots.category, 'expense')) {
      issues.push({ slot: 'category', message: 'La categoría no existe.' });
    }
    return issues;
  },

  warnings(slots, ctx) {
    const out: string[] = [];
    const name = textOf(slots.name, FIXED_NAME_MAX);
    if (name) {
      const f = flatText(name);
      const dup = ctx.fixedExpenses.find(e => e.isActive && flatText(e.name) === f);
      if (dup) out.push(`Ya existe un gasto fijo activo llamado «${dup.name}».`);
    }
    const day = dayOfMonthOf(slots);
    if (day !== undefined && day >= 29 && day <= 31) out.push('En meses cortos vence el último día.');
    return [...out, ...highAmountWarning(slots)];
  },

  summarize(slots, ctx) {
    const cur = currencyOfSlots(slots, ctx);
    const day = dayOfMonthOf(slots);
    const cat = resolveCategoryId(ctx, slots.category, 'expense');
    const name = textOf(slots.name, FIXED_NAME_MAX);
    const rows: SummaryRow[] = [
      { label: 'Nombre', value: name || '—', slotKey: 'name' },
      moneyRow('Monto', amountOf(slots), cur, 'amount'),
      { label: 'Día de cobro', value: day !== undefined ? `Día ${day} de cada mes` : '—', slotKey: 'day' },
      { label: 'Categoría', value: cat ? catLabel(ctx, cat, 'expense') : '—', slotKey: 'category' },
    ];
    const key = name ? smsMatchKeyFor(name, ctx) : undefined;
    if (key) rows.push({ label: 'Emparejar con SMS de', value: key });
    return rows;
  },

  build(slots, ctx, ids) {
    const name = textOf(slots.name, FIXED_NAME_MAX);
    const expense: FixedExpense = {
      id: ids.entityId,
      name,
      amount: amountOf(slots) ?? 0,
      currency: currencyOfSlots(slots, ctx),
      category: resolveCategoryId(ctx, slots.category, 'expense') ?? 'other',
      dayOfMonth: dayOfMonthOf(slots) ?? 1,
      isPaid: false,
      autoRecord: true,
      isActive: true,
      notes: '',
    };
    const key = smsMatchKeyFor(name, ctx);
    if (key) expense.smsMatchKey = key;
    return { kind: 'create_fixed_expense', expense };
  },
};

// ─────────────────────────────────────────────────────────────
// create_transaction
// ─────────────────────────────────────────────────────────────

const AMOUNT_EPS = 0.005;

function dupHintOf(t: Transaction, source: 'sms' | 'manual'): DupHint {
  return {
    txId: t.id, source,
    label: (merchantOfTransaction(t) || t.description || '').trim(),
    date: txDay(t), amount: t.amount, currency: currencyOf(t) as Currency,
  };
}

/** Movimientos ya guardados que se parecen al candidato: SMS (DuplicateDetector) o manuales iguales. */
function findDuplicateHints(candidate: Transaction, ctx: AssistantContext): DupHint[] {
  const others = ctx.transactions.filter(t => t.id !== candidate.id);
  const hints: DupHint[] = [];
  const seen = new Set<string>();

  const pairs = findManualSmsDuplicates([candidate, ...others], new Set<string>());
  for (const p of pairs) {
    if (p.manualId !== candidate.id) continue;
    const sms = others.find(t => t.id === p.smsId);
    if (sms && !seen.has(sms.id)) { seen.add(sms.id); hints.push(dupHintOf(sms, 'sms')); }
  }

  const day = txDay(candidate);
  for (const t of others) {
    if (seen.has(t.id)) continue;
    if (t.source !== 'manual' || t.mergedFrom || isTransferLike(t)) continue;
    if (t.type !== candidate.type || currencyOf(t) !== currencyOf(candidate)) continue;
    if (Math.abs(t.amount - candidate.amount) > AMOUNT_EPS) continue;
    if (txDay(t) !== day) continue;
    seen.add(t.id);
    hints.push(dupHintOf(t, 'manual'));
  }
  return hints.slice(0, 3);
}

function buildTx(slots: SlotMap, ctx: AssistantContext, ids: { entityId: string; nowIso: string }): { tx: Transaction; duplicates: DupHint[] } {
  const type = txKind(slots);
  const cat = resolveCategoryId(ctx, slots.category, type) ?? 'other';
  const day = parseDateOnly(ymdOf(slots.date) ?? todayYmd(ctx)) ?? ctx.now;
  // Día elegido + hora actual: conserva el orden dentro del día (igual que AddScreen).
  const when = new Date(day.getFullYear(), day.getMonth(), day.getDate(), ctx.now.getHours(), ctx.now.getMinutes(), ctx.now.getSeconds(), ctx.now.getMilliseconds());
  const tx: Transaction = {
    id: ids.entityId,
    amount: amountOf(slots) ?? 0,
    description: textOf(slots.description, DESCRIPTION_MAX) || catLabel(ctx, cat, type),
    category: cat,
    date: when.toISOString(),
    type,
    source: 'manual',
    currency: currencyOfSlots(slots, ctx),
  };
  const acc = resolveAccountId(ctx, slots.account);
  if (acc) tx.accountId = acc;
  return { tx, duplicates: findDuplicateHints(tx, ctx) };
}

const createTransaction: ActionSpec = {
  id: 'create_transaction',
  title: 'Registrar movimiento',
  icon: 'swap-vertical-outline',
  geminiName: 'proponer_movimiento',
  geminiDescription: 'Prepara el registro de un gasto o un ingreso (monto, categoría, fecha). La persona debe confirmarlo en la app.',
  slots: TX_SLOTS,

  validate(slots, ctx) {
    const issues = [...missingIssues(TX_SLOTS, slots), ...amountIssues(slots), ...currencyIssues(slots)];
    if (!isEmptyValue(slots.tx_type) && !normTxType(slots.tx_type)) {
      issues.push({ slot: 'tx_type', message: 'El tipo debe ser gasto o ingreso.' });
    }
    if (!isEmptyValue(slots.category)) {
      const t = normTxType(slots.tx_type);
      if (!resolveCategoryId(ctx, slots.category, t ?? 'any')) issues.push({ slot: 'category', message: 'La categoría no existe.' });
    }
    if (!isEmptyValue(slots.date)) {
      const d = ymdOf(slots.date);
      if (!d) issues.push({ slot: 'date', message: 'La fecha no es válida.' });
      else {
        const diff = dayNumber(todayYmd(ctx)) - dayNumber(d);
        if (diff < 0) issues.push({ slot: 'date', message: 'La fecha del movimiento no puede ser futura.' });
        else if (diff > MAX_PAST_DAYS) issues.push({ slot: 'date', message: 'La fecha no puede ser de hace más de un año.' });
      }
    }
    if (!isEmptyValue(slots.account) && !resolveAccountId(ctx, slots.account)) {
      issues.push({ slot: 'account', message: 'La cuenta no existe.' });
    }
    return issues;
  },

  warnings(slots, ctx, excludeId) {
    const out: string[] = [];
    const { duplicates } = buildTx(slots, ctx, { entityId: excludeId ?? '__candidate__', nowIso: ctx.now.toISOString() });
    for (const h of duplicates.slice(0, 2)) {
      const money = formatMoney(h.amount, h.currency);
      const when = formatShortDay(parseDateOnly(h.date) ?? ctx.now);
      const label = h.label.length > 40 ? h.label.slice(0, 39) + '…' : h.label;
      if (h.source === 'sms' && ctx.smsOn) {
        out.push(`Ya hay un movimiento del banco (SMS) por ${money} el ${when}${label ? ` en ${label}` : ''}. Confirme solo si es otro movimiento.`);
      } else {
        out.push(`Ya hay un movimiento similar por ${money} el ${when}${label ? ` (${label})` : ''}. Confirme solo si es otro movimiento.`);
      }
    }
    return [...out, ...highAmountWarning(slots)];
  },

  summarize(slots, ctx) {
    const type = txKind(slots);
    const cur = currencyOfSlots(slots, ctx);
    const cat = resolveCategoryId(ctx, slots.category, type);
    const desc = textOf(slots.description, DESCRIPTION_MAX);
    const rows: SummaryRow[] = [
      { label: 'Tipo', value: type === 'income' ? 'Ingreso' : 'Gasto', slotKey: 'tx_type' },
      moneyRow('Monto', amountOf(slots), cur, 'amount'),
      { label: 'Categoría', value: cat ? catLabel(ctx, cat, type) : '—', slotKey: 'category' },
      { label: 'Descripción', value: desc || (cat ? catLabel(ctx, cat, type) : '—'), slotKey: 'description' },
      dateRow('Fecha', ymdOf(slots.date) ?? todayYmd(ctx), 'date'),
    ];
    const acc = resolveAccountId(ctx, slots.account);
    if (acc) rows.push({ label: 'Cuenta', value: ctx.accounts.find(a => a.id === acc)?.name ?? '—', slotKey: 'account' });
    return rows;
  },

  build(slots, ctx, ids) {
    const { tx, duplicates } = buildTx(slots, ctx, ids);
    return { kind: 'create_transaction', tx, duplicates };
  },
};

// ─────────────────────────────────────────────────────────────
// Registro y utilidades públicas
// ─────────────────────────────────────────────────────────────

export const ACTIONS: Record<ActionId, ActionSpec> = {
  create_goal: createGoal,
  set_category_budget: setCategoryBudget,
  create_fixed_expense: createFixedExpense,
  create_transaction: createTransaction,
};

/** Slots obligatorios que aún no tienen valor (vacío, NaN o solo espacios). */
export function missingSlots(spec: ActionSpec, slots: SlotMap): SlotSpec[] {
  return spec.slots.filter(s => s.required && isEmptyValue(slots[s.key]));
}

/**
 * Rellena con su valor por defecto los slots que faltan, en el orden de la spec (los valores por defecto
 * pueden depender de los anteriores). Un `defaultValue` que devuelve undefined deja el slot sin valor.
 * No modifica `slots`.
 */
export function withDefaults(spec: ActionSpec, slots: SlotMap, ctx: AssistantContext): SlotMap {
  const out: SlotMap = { ...slots };
  for (const s of spec.slots) {
    if (!isEmptyValue(out[s.key]) || !s.defaultValue) continue;
    const v = s.defaultValue(ctx, out);
    if (v !== undefined) out[s.key] = v;
  }
  return out;
}

/** Id determinístico de la entidad creada: reenviar la misma propuesta nunca duplica el registro. */
export function entityIdFor(actionId: ActionId, proposalId: string): string {
  const prefix = actionId === 'create_goal' ? 'sg_as_' : actionId === 'create_fixed_expense' ? 'fe_as_' : 'as_';
  return prefix + proposalId;
}

/** Arma la tarjeta de confirmación: aplica defaults, valida, avisa y resume. Estado inicial 'pending'. */
export function makeProposal(
  actionId: ActionId,
  slots: SlotMap,
  ctx: AssistantContext,
  origin: ActionProposal['origin'],
  proposalId: string,
): ActionProposal {
  const spec = ACTIONS[actionId];
  const full = withDefaults(spec, slots, ctx);
  const issues = spec.validate(full, ctx);
  const warnings = issues.length === 0 ? spec.warnings(full, ctx, entityIdFor(actionId, proposalId)) : [];
  return {
    proposalId, actionId, slots: full,
    summary: spec.summarize(full, ctx),
    warnings, issues, origin, status: 'pending',
  };
}
