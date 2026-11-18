// Plan del onboarding (módulo PURO): borrador, validaciones, textos del período y construcción del
// commit final. Sin react-native ni AsyncStorage: de ./storage solo `import type`. Los montos se leen
// con un `parse` inyectado (parseAmount vive en storage.ts, que importa AsyncStorage).
//
// Los ids de lo que crea el onboarding son determinísticos a partir del borrador (`onb_acc_*`,
// `onb_fx_*`, `onb_<debt.id>`), de modo que repetir el commit hace upsert y nunca duplica.
import type {
  Account, AccountType, CreditInstallment, Currency, FixedExpense, IncomePattern, IncomeSource, PaymentCycle, UserSettings,
} from './storage';
import { learnPatternFromSms } from './IncomeSources';
import { applyPatternCorrection } from './IncomeSourceView';
import { dueDateInPeriod, periodFor, periodForWith } from './FixedCycle';
import type { FixedCycleConfig, PeriodStartResolver } from './FixedCycle';
import { formatPeriodRange, formatShortDay } from './BudgetBreakdown';
import { suggestInstallmentCount } from './InstallmentMath';

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
export type OnboardingPhase = 'required' | 'intro' | 'optional' | 'finish';
export type DraftCurrency = 'Q' | 'USD';
export type DraftAccountKind = 'bank' | 'savings' | 'credit' | 'cash';
export type DebtKind = 'credit' | 'loan' | 'installment' | 'other';
export type OptionalStepId = 'accounts' | 'income' | 'fixed' | 'debts' | 'usd' | 'sms' | 'security' | 'gemini';

/**
 * SMS de ejemplo con el que le llega el pago a la persona. `confirmed` = tocó «Sí, es así» sobre lo que la
 * app entendió; `edit` guarda su corrección (quién envía y monto) para repetirla al armar el commit.
 */
export interface DraftIncomeSample {
  body: string;
  confirmed: boolean;
  edit?: { originText: string; amount: number };
}

export interface DraftAccount {
  id: string;
  /** Código SMS del banco (BAC, GYT, ...) o null si es efectivo / «Otro». */
  bankCode: string | null;
  bankLabel: string;
  kind: DraftAccountKind;
  currency: DraftCurrency;
  name: string;
  balance: string;
  /** Tarjeta: día de corte (texto, vacío = sin configurar). Opcional: los borradores viejos no lo traen. */
  cutoffDay?: string;
  /** Tarjeta: día de pago (texto, vacío = sin configurar). Opcional: los borradores viejos no lo traen. */
  paymentDueDay?: string;
}

export interface DraftFixed {
  id: string;
  name: string;
  amount: string;
  currency: DraftCurrency;
  dayOfMonth: string;
  category: string;
}

export interface DraftDebt {
  id: string;
  name: string;
  type: DebtKind;
  monthlyPayment: string;
  totalAmount: string;
  /** Tarjeta del borrador a la que pertenece (solo tipo tarjeta / visacuota). */
  accountId?: string;
  currency: DraftCurrency;
}

export interface OnboardingDraft {
  v: 1;
  phase: OnboardingPhase;
  step: number;
  name: string;
  incomeCurrency: DraftCurrency;
  income: string;
  usesUsd: boolean;
  paymentCycle: PaymentCycle;
  paymentDay: string;
  payDay1: string;
  payDay2: string;
  savings: string;
  accounts: DraftAccount[];
  fixed: DraftFixed[];
  debts: DraftDebt[];
  usd: { mode: 'auto' | 'manual'; rate: string } | null;
  sms: { optOut: boolean; autoSync: boolean; importAfter: boolean; granted: boolean };
  biometricEnabled: boolean;
  geminiApiKey: string;
  /** Opcional: los borradores viejos no lo traen. */
  incomeSample?: DraftIncomeSample;
}

/** Lo que entrega OnboardingScreen a app/index.tsx. */
export interface OnboardingResult {
  draft: OnboardingDraft;
  tourRequested: boolean;
}

/** Lo que commitOnboarding escribe en el almacenamiento. */
export interface OnboardingCommit {
  settings: UserSettings;
  accounts: Account[];
  fixedExpenses: FixedExpense[];
  installments: CreditInstallment[];
  /** La fuente de ingreso principal (`onb_income_main`), con el patrón del SMS si se confirmó uno. */
  incomeSources: IncomeSource[];
}

export interface Validation { ok: boolean; error?: string; warning?: string; }

export interface BuildCtx {
  isAndroid: boolean;
  exchangeRate: number;
  parse: (s: string) => number;
  nowIso: string;
}

// ─────────────────────────────────────────────────────────────
// CATÁLOGOS
// ─────────────────────────────────────────────────────────────
/** Bancos del onboarding. `code` es el que devuelve detectBankName(label) (códigos de SMS). */
export const ONBOARDING_BANKS: { code: string; label: string }[] = [
  { code: 'BAC', label: 'BAC Credomatic' },
  { code: 'GYT', label: 'G&T Continental' },
  { code: 'BANRURAL', label: 'Banrural' },
  { code: 'BI', label: 'Banco Industrial' },
  { code: 'BAM', label: 'BAM' },
  { code: 'PROMERICA', label: 'Promerica' },
  { code: 'BANTRAB', label: 'Bantrab' },
  { code: 'INTERBANCO', label: 'Interbanco' },
];

export const FIXED_SUGGESTIONS: { name: string; category: string }[] = [
  { name: 'Renta', category: 'rent' },
  { name: 'Luz', category: 'utilities' },
  { name: 'Agua', category: 'utilities' },
  { name: 'Internet', category: 'internet' },
  { name: 'Teléfono', category: 'internet' },
  { name: 'Netflix', category: 'streaming' },
  { name: 'Spotify', category: 'streaming' },
  { name: 'Disney+', category: 'streaming' },
  { name: 'Colegio', category: 'education' },
  { name: 'Gimnasio', category: 'subscriptions' },
];

/** Tipo de cuenta, icono y color por clase de cuenta del onboarding (mismos valores que AccountsScreen). */
export const ONB_TYPE_STYLE: Record<DraftAccountKind, { type: AccountType; icon: string; color: string }> = {
  cash: { type: 'cash', icon: 'cash-outline', color: '#84CC16' },
  bank: { type: 'bank', icon: 'business-outline', color: '#4A9EE8' },
  savings: { type: 'savings', icon: 'save-outline', color: '#2ECC71' },
  credit: { type: 'credit', icon: 'card-outline', color: '#E8453C' },
};

// ─────────────────────────────────────────────────────────────
// BORRADOR
// ─────────────────────────────────────────────────────────────
export function emptyDraft(): OnboardingDraft {
  return {
    v: 1,
    phase: 'required',
    step: 0,
    name: '',
    incomeCurrency: 'Q',
    income: '',
    usesUsd: false,
    paymentCycle: 'monthly',
    paymentDay: '',
    payDay1: '15',
    payDay2: '30',
    savings: '',
    accounts: [],
    fixed: [],
    debts: [],
    usd: null,
    sms: { optOut: false, autoSync: true, importAfter: false, granted: false },
    biometricEnabled: false,
    geminiApiKey: '',
  };
}

/** Id nuevo para algo del borrador: `<prefijo>_<tiempo base36>_<4 al azar>`. */
export function newDraftId(prefix: string): string {
  const rnd = Math.random().toString(36).slice(2, 6).padEnd(4, '0');
  return `${prefix}_${Date.now().toString(36)}_${rnd}`;
}

const PHASES: OnboardingPhase[] = ['required', 'intro', 'optional', 'finish'];
const CYCLES: PaymentCycle[] = ['monthly', 'biweekly', 'weekly', 'irregular'];
const ACCOUNT_KINDS: DraftAccountKind[] = ['bank', 'savings', 'credit', 'cash'];
const DEBT_KINDS: DebtKind[] = ['credit', 'loan', 'installment', 'other'];

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === 'object' && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === 'string';
const isBool = (x: unknown): x is boolean => typeof x === 'boolean';
const isCur = (x: unknown): x is DraftCurrency => x === 'Q' || x === 'USD';

function sanitizeAccount(x: unknown): DraftAccount | null {
  if (!isObj(x)) return null;
  const { id, bankCode, bankLabel, kind, currency, name, balance, cutoffDay, paymentDueDay } = x;
  if (!isStr(id) || !id) return null;
  if (!(bankCode === null || isStr(bankCode))) return null;
  if (!isStr(bankLabel) || !isStr(name) || !isStr(balance)) return null;
  if (!ACCOUNT_KINDS.includes(kind as DraftAccountKind) || !isCur(currency)) return null;
  const out: DraftAccount = { id, bankCode, bankLabel, kind: kind as DraftAccountKind, currency, name, balance };
  // Los días son opcionales: si vienen mal formados se descarta el campo, no la cuenta.
  if (isStr(cutoffDay)) out.cutoffDay = cutoffDay;
  if (isStr(paymentDueDay)) out.paymentDueDay = paymentDueDay;
  return out;
}

function sanitizeFixed(x: unknown): DraftFixed | null {
  if (!isObj(x)) return null;
  const { id, name, amount, currency, dayOfMonth, category } = x;
  if (!isStr(id) || !id || !isStr(name) || !isStr(amount) || !isStr(dayOfMonth) || !isStr(category)) return null;
  if (!isCur(currency)) return null;
  return { id, name, amount, currency, dayOfMonth, category };
}

/** Muestra del SMS del pago; una muestra mal formada se descarta (no invalida el borrador entero). */
function sanitizeIncomeSample(x: unknown): DraftIncomeSample | null {
  if (!isObj(x) || !isStr(x.body) || !isBool(x.confirmed)) return null;
  const out: DraftIncomeSample = { body: x.body, confirmed: x.confirmed };
  const e = x.edit;
  if (e !== undefined) {
    if (!isObj(e) || !isStr(e.originText) || typeof e.amount !== 'number' || !Number.isFinite(e.amount)) return null;
    out.edit = { originText: e.originText, amount: e.amount };
  }
  return out;
}

function sanitizeDebt(x: unknown): DraftDebt | null {
  if (!isObj(x)) return null;
  const { id, name, type, monthlyPayment, totalAmount, accountId, currency } = x;
  if (!isStr(id) || !id || !isStr(name) || !isStr(monthlyPayment) || !isStr(totalAmount)) return null;
  if (!DEBT_KINDS.includes(type as DebtKind) || !isCur(currency)) return null;
  if (accountId !== undefined && !isStr(accountId)) return null;
  const out: DraftDebt = { id, name, type: type as DebtKind, monthlyPayment, totalAmount, currency };
  if (accountId !== undefined) out.accountId = accountId;
  return out;
}

/** Valida la forma de un borrador leído del almacenamiento. null si es basura o de otra versión. */
export function sanitizeDraft(raw: unknown): OnboardingDraft | null {
  if (!isObj(raw) || raw.v !== 1) return null;
  const r = raw;
  if (!PHASES.includes(r.phase as OnboardingPhase)) return null;
  if (typeof r.step !== 'number' || !Number.isInteger(r.step) || r.step < 0) return null;
  if (!isStr(r.name) || !isCur(r.incomeCurrency) || !isStr(r.income) || !isBool(r.usesUsd)) return null;
  if (!CYCLES.includes(r.paymentCycle as PaymentCycle)) return null;
  if (!isStr(r.paymentDay) || !isStr(r.payDay1) || !isStr(r.payDay2) || !isStr(r.savings)) return null;
  if (!Array.isArray(r.accounts) || !Array.isArray(r.fixed) || !Array.isArray(r.debts)) return null;
  const accounts = r.accounts.map(sanitizeAccount);
  const fixed = r.fixed.map(sanitizeFixed);
  const debts = r.debts.map(sanitizeDebt);
  if (accounts.some(a => a === null) || fixed.some(f => f === null) || debts.some(d => d === null)) return null;

  let usd: OnboardingDraft['usd'] = null;
  if (r.usd !== null) {
    if (!isObj(r.usd) || !(r.usd.mode === 'auto' || r.usd.mode === 'manual') || !isStr(r.usd.rate)) return null;
    usd = { mode: r.usd.mode, rate: r.usd.rate };
  }
  const s = r.sms;
  if (!isObj(s) || !isBool(s.optOut) || !isBool(s.autoSync) || !isBool(s.importAfter) || !isBool(s.granted)) return null;
  if (!isBool(r.biometricEnabled) || !isStr(r.geminiApiKey)) return null;
  const incomeSample = r.incomeSample === undefined ? null : sanitizeIncomeSample(r.incomeSample);

  return {
    v: 1,
    phase: r.phase as OnboardingPhase,
    step: r.step,
    name: r.name,
    incomeCurrency: r.incomeCurrency,
    income: r.income,
    usesUsd: r.usesUsd,
    paymentCycle: r.paymentCycle as PaymentCycle,
    paymentDay: r.paymentDay,
    payDay1: r.payDay1,
    payDay2: r.payDay2,
    savings: r.savings,
    accounts: accounts as DraftAccount[],
    fixed: fixed as DraftFixed[],
    debts: debts as DraftDebt[],
    usd,
    sms: { optOut: s.optOut, autoSync: s.autoSync, importAfter: s.importAfter, granted: s.granted },
    biometricEnabled: r.biometricEnabled,
    geminiApiKey: r.geminiApiKey,
    ...(incomeSample ? { incomeSample } : {}),
  };
}

// ─────────────────────────────────────────────────────────────
// VALIDACIONES
// ─────────────────────────────────────────────────────────────
const MAX_NAME = 40;

export function validateName(s: string): Validation {
  const t = s.trim();
  if (!t) return { ok: false, error: 'Escribí tu nombre para continuar.' };
  if (t.length > MAX_NAME) return { ok: false, error: `Usá ${MAX_NAME} letras o menos.` };
  return { ok: true };
}

export function validateIncome(s: string, parse: (s: string) => number): Validation {
  const n = parse(s);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, error: 'Ingresá un monto mayor a 0. Un aproximado está bien.' };
  }
  return { ok: true };
}

/** Día entero 1..max escrito solo con dígitos ("15,30", "a" y "" son inválidos). */
export function validateDay(s: string, max = 31): Validation {
  const t = s.trim();
  if (!/^\d{1,2}$/.test(t)) return { ok: false, error: `Ingresá un día entre 1 y ${max}.` };
  const n = Number(t);
  if (n < 1 || n > max) return { ok: false, error: `Ingresá un día entre 1 y ${max}.` };
  return { ok: true };
}

export function validateBiweekly(a: string, b: string): Validation {
  const va = validateDay(a);
  if (!va.ok) return va;
  const vb = validateDay(b);
  if (!vb.ok) return vb;
  if (Number(a.trim()) === Number(b.trim())) {
    return { ok: false, error: 'Los dos días de pago deben ser distintos.' };
  }
  return { ok: true };
}

/** `income` ya es un número (en la misma moneda que el ahorro). Vacío o 0 es válido. */
export function validateSavings(s: string, income: number, parse: (s: string) => number): Validation {
  if (!s.trim()) return { ok: true };
  const n = parse(s);
  if (!Number.isFinite(n) || n < 0) return { ok: false, error: 'Ingresá un monto válido.' };
  if (income > 0 && n >= income) return { ok: true, warning: 'Tu meta es igual o mayor que tu ingreso.' };
  return { ok: true };
}

/** Tipo de cambio escrito a mano: acepta «7.70» y «7,70». NaN si es inválido. */
export function parseRate(s: string): number {
  const t = s.trim();
  if (!/^\d+(?:[.,]\d+)?$/.test(t)) return NaN;
  return parseFloat(t.replace(',', '.'));
}

export function validateRate(s: string): Validation {
  const n = parseRate(s);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Ingresá un tipo de cambio mayor a 0.' };
  return { ok: true };
}

/** Ciclo de pago válido según su modalidad (semanal e irregular no piden día). */
export function validateCycle(d: OnboardingDraft): Validation {
  if (d.paymentCycle === 'monthly') return validateDay(d.paymentDay);
  if (d.paymentCycle === 'biweekly') return validateBiweekly(d.payDay1, d.payDay2);
  return { ok: true };
}

/** Ingreso del borrador como número (NaN/inválido = 0). */
function amountOf(s: string, parse: (s: string) => number): number {
  const n = parse(s);
  return Number.isFinite(n) ? n : 0;
}

/** ¿Se puede pasar del paso obligatorio `step` (0..3)? */
export function canContinueRequired(draft: OnboardingDraft, step: number, parse: (s: string) => number): boolean {
  switch (step) {
    case 0: return validateName(draft.name).ok;
    case 1: return validateIncome(draft.income, parse).ok;
    case 2: return validateCycle(draft).ok;
    case 3: return validateSavings(draft.savings, amountOf(draft.income, parse), parse).ok;
    default: return true;
  }
}

export function validateAccount(a: DraftAccount, parse: (s: string) => number): Validation {
  if (!a.name.trim()) return { ok: false, error: 'Escribí un nombre para la cuenta.' };
  if (a.kind !== 'credit' && a.balance.trim()) {
    const n = parse(a.balance);
    if (!Number.isFinite(n)) return { ok: false, error: 'Ingresá un saldo válido' };
  }
  if (a.kind === 'credit') {
    if (a.cutoffDay?.trim() && !validateDay(a.cutoffDay).ok) {
      return { ok: false, error: 'El día de corte debe ser un número entre 1 y 31.' };
    }
    if (a.paymentDueDay?.trim() && !validateDay(a.paymentDueDay).ok) {
      return { ok: false, error: 'El día de pago debe ser un número entre 1 y 31.' };
    }
  }
  return { ok: true };
}

/** Día de corte/pago del borrador como número, o undefined si está vacío o no es válido. */
function cardDay(s: string | undefined): number | undefined {
  if (s === undefined || !validateDay(s).ok) return undefined;
  return Number(s.trim());
}

/** Nombre sin mayúsculas, tildes ni espacios repetidos, para comparar. */
export function normalizeName(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim().replace(/\s+/g, ' ');
}

export function validateFixed(f: DraftFixed, existing: DraftFixed[], parse: (s: string) => number): Validation {
  const name = f.name.trim();
  if (!name) return { ok: false, error: 'Escribí el nombre del gasto.' };
  const key = normalizeName(name);
  if (existing.some(e => e.id !== f.id && normalizeName(e.name) === key)) {
    return { ok: false, error: `Ya agregaste ${name}` };
  }
  const n = parse(f.amount);
  if (!Number.isFinite(n) || n <= 0) return { ok: false, error: 'Ingresá un monto mayor a 0.' };
  const day = validateDay(f.dayOfMonth);
  if (!day.ok) return day;
  return { ok: true };
}

// ─────────────────────────────────────────────────────────────
// PASOS OPCIONALES
// ─────────────────────────────────────────────────────────────
export interface OptionalStepsCtx { isAndroid: boolean; biometricAvailable: boolean; needsUsd: boolean; }

export function optionalSteps(ctx: OptionalStepsCtx): OptionalStepId[] {
  // 'income' (el SMS del pago) va para todos: pegar el texto funciona en cualquier plataforma.
  const out: OptionalStepId[] = ['accounts', 'income', 'fixed', 'debts'];
  if (ctx.needsUsd) out.push('usd');
  if (ctx.isAndroid) out.push('sms');
  if (ctx.biometricAvailable) out.push('security');
  out.push('gemini');
  return out;
}

/** ¿Hay algo en dólares (ingreso, cuenta, gasto fijo, deuda) o el usuario dijo que usa dólares? */
export function needsUsd(d: OnboardingDraft): boolean {
  return d.usesUsd
    || d.incomeCurrency === 'USD'
    || d.accounts.some(a => a.currency === 'USD')
    || d.fixed.some(f => f.currency === 'USD')
    || d.debts.some(x => x.currency === 'USD');
}

// ─────────────────────────────────────────────────────────────
// TEXTOS DEL PERÍODO
// ─────────────────────────────────────────────────────────────
/**
 * Frase «Así se va a medir tu dinero». `budgetRange` y `fixedRange` ya vienen formateados
 * («27 oct – 26 nov», formatPeriodRange).
 */
export function periodSentence(
  cycle: PaymentCycle,
  budgetRange: string,
  fixedRange: string,
): { title: string; body: string } {
  switch (cycle) {
    case 'monthly':
      return {
        title: `Tu período de presupuesto: ${budgetRange}`,
        body: 'Cada mes arranca el día que cobrás y termina el día antes del siguiente pago. Tus gastos fijos se cuentan una vez por período.',
      };
    case 'biweekly':
      return {
        title: `Tu presupuesto se mide por quincena: ${budgetRange}`,
        body: `Tus gastos fijos se cuentan una vez al mes, del ${fixedRange.replace(' – ', ' al ')}.`,
      };
    case 'weekly':
      return {
        title: `Tu semana de presupuesto va de domingo a sábado: ${budgetRange}`,
        body: `Los gastos fijos se cuentan por mes calendario (${fixedRange}).`,
      };
    default:
      return {
        title: `Usamos el mes calendario: ${budgetRange}`,
        body: 'Tus gastos fijos también se cuentan por mes calendario.',
      };
  }
}

/**
 * «Vence el 5 nov, dentro de tu período 27 oct – 26 nov» para un gasto fijo del día `day`. En el onboarding se
 * pasa `resolve` armado con el ciclo del BORRADOR (el resolvedor global aún tiene los ajustes por defecto);
 * sin él se usa el global.
 */
export function dueLabel(day: number, cfg: FixedCycleConfig, now: Date, resolve?: PeriodStartResolver | null): string {
  const p = resolve === undefined ? periodFor(cfg, now) : periodForWith(cfg, now, resolve);
  const due = dueDateInPeriod(day, p, cfg);
  return `Vence el ${formatShortDay(due)}, dentro de tu período ${formatPeriodRange(p)}`;
}

// ─────────────────────────────────────────────────────────────
// VÍNCULOS SMS
// ─────────────────────────────────────────────────────────────
/**
 * Vínculos SMS por cuenta: `BANCO|bank` solo si ese banco tiene exactamente UNA cuenta en el borrador.
 * Con varias (o sin banco conocido) la lista queda vacía y la asignación se hace en la revisión.
 */
export function smsLinksFor(accounts: DraftAccount[]): Record<string, string[]> {
  const count = new Map<string, number>();
  for (const a of accounts) {
    if (a.bankCode) count.set(a.bankCode, (count.get(a.bankCode) ?? 0) + 1);
  }
  const out: Record<string, string[]> = {};
  for (const a of accounts) {
    out[a.id] = a.bankCode && count.get(a.bankCode) === 1 ? [`${a.bankCode}|bank`] : [];
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// COMMIT
// ─────────────────────────────────────────────────────────────
const round2 = (n: number): number => Math.round(n * 100) / 100;

const DEBT_LABEL: Record<DebtKind, string> = {
  credit: 'Tarjeta de crédito', loan: 'Préstamo', installment: 'Visacuota', other: 'Otra deuda',
};

export const ONB_INCOME_SOURCE_ID = 'onb_income_main';

/** Nombre de la fuente según cómo cobra la persona (nada de profesiones: lo puede renombrar después). */
const INCOME_NAME: Record<PaymentCycle, string> = {
  monthly: 'Sueldo', biweekly: 'Quincena', weekly: 'Pago semanal', irregular: 'Mis ingresos',
};

/**
 * Fuente de ingreso principal desde lo que la persona dijo en el onboarding: el ingreso mensual, cómo cobra y
 * los días. Con la muestra confirmada aprende el patrón (mismo motor que el formulario de Presupuesto) y, para
 * pago semanal, el día de la semana. `monthlyAmount` está en la moneda del ingreso; la fuente guarda lo de
 * CADA pago (quincenal = mitad, semanal = ×12/52), que es lo que baseMonthlyIncome vuelve a multiplicar.
 */
function buildIncomeSource(
  draft: OnboardingDraft,
  monthlyAmount: number,
  days: { paymentDay: number; paymentDays: number[] },
  nowIso: string,
): IncomeSource {
  const cycle = draft.paymentCycle;
  let pattern: IncomePattern | undefined;
  let weekday: number | undefined;
  const sample = draft.incomeSample;
  if (sample && sample.confirmed && sample.body.trim()) {
    const r = learnPatternFromSms(sample.body, undefined, nowIso);
    if (r.ok) {
      pattern = sample.edit ? applyPatternCorrection(r.pattern, sample.edit) : r.pattern;
      weekday = r.preview.weekday;
    }
  }
  let srcDays: number[] = [];
  if (cycle === 'monthly') srcDays = [days.paymentDay];
  else if (cycle === 'biweekly') srcDays = [...days.paymentDays];
  else if (cycle === 'weekly') srcDays = weekday !== undefined ? [weekday] : [];
  const perPayment = cycle === 'biweekly' ? round2(monthlyAmount / 2)
    : cycle === 'weekly' ? round2(monthlyAmount * 12 / 52)
      : monthlyAmount;
  return {
    id: ONB_INCOME_SOURCE_ID,
    name: INCOME_NAME[cycle],
    category: 'salary',
    amount: perPayment,
    currency: draft.incomeCurrency as Currency,
    frequency: cycle,
    days: srcDays,
    role: 'base',
    anchorsPeriod: cycle === 'monthly' || cycle === 'biweekly',
    ...(pattern ? { pattern } : {}),
    isActive: true,
    createdAt: nowIso,
  };
}

/**
 * Convierte el borrador en lo que se guarda. `base` son los ajustes actuales (se conservan los campos
 * que el onboarding no toca, p. ej. externalSavings). Determinista: los mismos ids para el mismo borrador.
 */
export function buildOnboardingCommit(
  draft: OnboardingDraft,
  base: UserSettings,
  ctx: BuildCtx,
): OnboardingCommit {
  const num = (s: string): number => amountOf(s, ctx.parse);

  const manualRate = draft.usd && draft.usd.mode === 'manual' ? parseRate(draft.usd.rate) : NaN;
  const useManual = Number.isFinite(manualRate) && manualRate > 0;
  const rate = useManual
    ? manualRate
    : (ctx.exchangeRate > 0 ? ctx.exchangeRate : (base.exchangeRate > 0 ? base.exchangeRate : 7.7));

  // Ingreso
  const incomeRaw = num(draft.income);
  const isUsd = draft.incomeCurrency === 'USD';
  const monthlyIncome = isUsd ? Math.round(incomeRaw * rate) : incomeRaw;
  const monthlyIncomeUSD = isUsd ? incomeRaw : 0;
  const budgetLimit = round2((monthlyIncome || 6000) * 0.8);

  // Ciclo
  let paymentDay = base.paymentDay;
  let paymentDays = base.paymentDays;
  if (draft.paymentCycle === 'monthly') {
    const n = parseInt(draft.paymentDay, 10);
    if (Number.isFinite(n)) paymentDay = n;
  } else if (draft.paymentCycle === 'biweekly') {
    const a = parseInt(draft.payDay1, 10);
    const b = parseInt(draft.payDay2, 10);
    if (Number.isFinite(a) && Number.isFinite(b)) paymentDays = [a, b].sort((x, y) => x - y);
  }

  // Ahorro (siempre en Q)
  const savingsRaw = num(draft.savings);
  const monthlySavingsGoal = isUsd ? round2(savingsRaw * rate) : savingsRaw;

  // Cuentas
  const links = smsLinksFor(draft.accounts);
  const accounts: Account[] = draft.accounts.map(a => {
    const style = ONB_TYPE_STYLE[a.kind];
    const balance = a.kind === 'credit' ? 0 : num(a.balance);
    const acc: Account = {
      id: a.id,
      name: a.name.trim(),
      type: style.type,
      currency: a.currency as Currency,
      balance,
      initialBalance: balance,
      color: style.color,
      icon: style.icon,
      isActive: true,
      createdAt: ctx.nowIso,
    };
    const bankName = a.kind === 'cash' ? '' : a.bankLabel.trim();
    if (bankName) acc.bankName = bankName;
    if (a.kind === 'credit') {
      const cut = cardDay(a.cutoffDay);
      const due = cardDay(a.paymentDueDay);
      if (cut !== undefined) acc.cutoffDay = cut;
      if (due !== undefined) acc.paymentDueDay = due;
    }
    const l = links[a.id];
    if (l && l.length > 0) {
      acc.smsLinks = [...l];
      acc.smsLinkedAt = ctx.nowIso;
    }
    return acc;
  });

  // Gastos fijos
  const fixedExpenses: FixedExpense[] = draft.fixed.map(f => ({
    id: f.id,
    name: f.name.trim(),
    amount: num(f.amount),
    currency: f.currency as Currency,
    category: f.category,
    dayOfMonth: parseInt(f.dayOfMonth, 10),
    isPaid: false,
    autoRecord: true,
    isActive: true,
  }));

  // Deudas
  const accountIds = new Set(draft.accounts.map(a => a.id));
  const installments: CreditInstallment[] = [];
  let totalDebts = 0;
  for (const d of draft.debts) {
    const monthly = num(d.monthlyPayment);
    if (monthly <= 0) continue;
    totalDebts += d.currency === 'USD' ? monthly * rate : monthly;
    const total = num(d.totalAmount);
    installments.push({
      id: `onb_${d.id}`,
      accountId: d.accountId && accountIds.has(d.accountId) ? d.accountId : '',
      name: d.name.trim(),
      totalAmount: total || monthly * 12,
      monthlyPayment: monthly,
      totalInstallments: total > 0 ? suggestInstallmentCount(total, monthly) : 12,
      paidInstallments: 0,
      startDate: ctx.nowIso,
      trackSince: ctx.nowIso,
      paidOffset: 0,
      currency: d.currency as Currency,
      category: d.type === 'credit' ? 'transfer' : d.type === 'loan' ? 'other' : 'subscriptions',
      isActive: true,
      notes: `Registrado en onboarding (${DEBT_LABEL[d.type]})`,
    });
  }

  const preferredBanks: string[] = [];
  for (const a of draft.accounts) {
    if (a.bankCode && !preferredBanks.includes(a.bankCode)) preferredBanks.push(a.bankCode);
  }

  const apiKey = draft.geminiApiKey.trim();

  const settings: UserSettings = {
    ...base,
    userName: draft.name.trim() || 'Usuario',
    currency: draft.incomeCurrency,
    monthlyIncome,
    monthlyIncomeUSD,
    paymentCycle: draft.paymentCycle,
    paymentDay,
    paymentDays,
    budgetLimit,
    budgetLimitUSDMode: 'auto',
    activeDebts: round2(totalDebts),
    activeDebtsList: draft.debts.map(d => ({
      id: d.id, name: d.name, type: d.type, monthlyPayment: d.monthlyPayment, totalAmount: d.totalAmount,
    })),
    monthlySavingsGoal,
    preferredBanks,
    externalSavings: base.externalSavings,
    externalSavingsUSD: base.externalSavingsUSD,
    exchangeRate: rate,
    exchangeRateMode: useManual ? 'manual' : (draft.usd ? 'auto' : (base.exchangeRateMode ?? 'auto')),
    smsEnabled: ctx.isAndroid && !draft.sms.optOut,
    smsAutoSync: draft.sms.autoSync,
    biometricEnabled: draft.biometricEnabled,
    geminiApiKey: apiKey,
    onboardingComplete: true,
    cardsOnboardingComplete: true,
    tutorialComplete: true,
  };
  if (useManual) {
    settings.exchangeRateSource = 'Manual';
    settings.exchangeRateUpdatedAt = ctx.nowIso;
  }

  const incomeSources = [buildIncomeSource(draft, incomeRaw, { paymentDay, paymentDays }, ctx.nowIso)];

  return { settings, accounts, fixedExpenses, installments, incomeSources };
}
