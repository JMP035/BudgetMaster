import AsyncStorage from '@react-native-async-storage/async-storage';
import { formatDateOnly } from './DateAmount';
import { buildSmsFingerprint } from './BankSmsParser';
import { assignAccountsToTransactions } from './AccountLinking';
import { mergeManualIntoSms, splitMerged } from './DuplicateDetector';
import { applyTransferPair, clearPairIdOfPartner, revertTransferPair, transferPairKey } from './TransferPairs';
import { merchantKey, merchantOfTransaction, sameMerchantTxIds, upsertMerchantRule } from './MerchantRules';
import { incomeKeyOfTx, incomeOriginLabelOfTx, sameOriginTxIds, upsertIncomeRule } from './IncomeRules';
import { planIncomeLinksUndo, planSmsUndo } from './SmsUndoPlan';
import { applyCardPaymentMatch, applyCardPaymentProposal, buildCardPaymentTxs, cardPaymentProposalKey, planCardPaymentsUndo } from './CardStatement';
import type { CardPaymentMatch } from './CardStatement';
import { applyManualEffects, balanceModeOf, planBalanceAnchorsUndo, planManualEffectsRevert, planSmsBalanceAnchors, withBalanceAnchor } from './Balances';
import type { BalanceAnchorRecord } from './Balances';
import { planAssignTransferDestination, planDismissTransferQuestion } from './TransferQuestions';
import { planIncomeLink, sanitizeIncomeSources } from './IncomeSources';
import {
  cycleKeyFor, cycleKeyFromFeTxId, dueDateInPeriod, fixedCycleConfig, fixedIdFromFeTxId, normalizeCycleKey,
  periodFor, planFixedPeriodReset, setPeriodStartResolver, storedToLocalDate,
} from './FixedCycle';
import type { FixedCycleConfig } from './FixedCycle';
import { DEFAULT_PAY_RULES, sanitizePayRules } from './PayCalendar';
import type { PayRules } from './PayCalendar';
import {
  buildStartResolver, clearManualAnchor, removeAnchorsForTx, sanitizeAnchors, sanitizePaymentSchedule, setManualAnchor,
} from './PeriodAnchors';
import type { PeriodAnchor, PaymentSchedule } from './PeriodAnchors';
import { computeFinancialPeriod, daysUntilNextPay, normalizeWeekday } from './FinancialPeriod';
import type { FinancialPeriod } from './FinancialPeriod';
import { planFixedFusion, relinkFixedAfterSplit } from './FixedExpenseMatcher';
import {
  detachInstallmentCharges, dropInstallmentCharges, migrateInstallmentsSchedule, planInstallmentCharges,
  prepareInstallmentForSave,
} from './InstallmentSchedule';
// Módulos puros del onboarding: de ellos solo se importan valores sin dependencia de storage en runtime
// (sanitizeDraft / sanitizeGettingStarted); los tipos van con `import type`.
import { sanitizeDraft } from './OnboardingPlan';
import type { OnboardingCommit, OnboardingDraft } from './OnboardingPlan';
import { sanitizeGettingStarted } from './GettingStarted';
import { sanitizeWidgetSnapshot } from './WidgetSnapshot';
import type { WidgetSnapshot } from './WidgetSnapshot';
import { migrateMilitaryToSalary } from './CategoryMigration';
import { emitSettingsChanged } from './SettingsEvents';
import { emitPlanInputsChanged } from './NotifEvents';
import { DEFAULT_NOTIF_PREFS, sanitizeNotifPrefs } from './NotifPrefs';
import type { NotifPrefs } from './NotifPrefs';
import type { GettingStartedState } from './GettingStarted';
// Chat del asistente: validación/recorte puros en ChatStore (solo tipos de ./assistant/types).
import type { StoredAssistantChat } from './assistant/types';
import { parseStoredChatJson, trimStoredChat } from './assistant/ChatStore';

// ─────────────────────────────────────────────────────────────
// TIPOS BASE
// ─────────────────────────────────────────────────────────────
export type { NotifKind, NotifPrefs } from './NotifPrefs';
export type Currency = 'Q' | 'USD' | 'EUR' | '£';
export type PaymentCycle = 'monthly' | 'biweekly' | 'weekly' | 'irregular';
export type AccountType = 'cash' | 'bank' | 'credit' | 'investment' | 'savings';

// ─────────────────────────────────────────────────────────────
// TRANSACCIÓN
// ─────────────────────────────────────────────────────────────
export interface Transaction {
  id: string;
  amount: number;
  description: string;
  category: string;
  date: string;
  type: 'expense' | 'income' | 'transfer';
  source: 'manual' | 'sms';
  currency: Currency;
  originalSMS?: string;
  bank?: string;
  location?: string;
  fromAccountId?: string;   // Para transferencias
  toAccountId?: string;   // Para transferencias
  bankRef?: string;        // Número de referencia bancaria (si el SMS lo trae)
  smsFingerprint?: string; // Huella del SMS de origen (deduplicación y descartes)
  merchant?: string;       // Comercio normalizado para mostrar (SMS)
  categoryEditedAt?: string; // ISO: el usuario eligió la categoría a mano
  accountId?: string;        // Cuenta/tarjeta a la que pertenece (solo para mostrar; ver balanceEffect)
  accountSource?: 'rule' | 'user'; // Quién asignó la cuenta: regla de vínculo SMS o el usuario
  smsAccountHint?: string;   // Clave de señal más específica del SMS (ej. 'BAC|prod:BAC VISA')
  fixedExpenseId?: string;   // Gasto fijo que pagó este movimiento
  /** Efecto aplicado al saldo de una cuenta (saldo automático; ronda R-C, hoy sin uso). */
  balanceEffect?: { accountId: string; delta: number; appliedAt: string; settled?: boolean };
  /** Copia del movimiento manual que se unió a este SMS (permite "Separar"). */
  mergedFrom?: {
    id: string; description: string; category: string; date: string; amount: number; currency: Currency;
    fixedExpenseId?: string;   // gasto fijo que traía el manual (el vínculo vuelve al manual al separar)
    accountId?: string;        // cuenta del manual (para devolverla al separar)
    categoryEditedAt?: string; // categoryEditedAt del manual (para devolverlo al separar)
    smsPrev?: {
      description: string; category: string; categoryEditedAt?: string;
      accountId?: string; accountSource?: 'rule' | 'user'; // cuenta del SMS antes de que la pisara la del manual
    };
  };
  /** Id compartido por las dos mitades de una transferencia entre cuentas propias (par neutro). */
  transferPairId?: string;
  /** Tipo y categoría antes de marcar el par como neutro (permite revertir). */
  transferPrev?: { type: 'income' | 'expense' | 'transfer'; category: string };
  /** Fuente de ingreso (IncomeSource.id) a la que pertenece este depósito. */
  incomeSourceId?: string;
  /** Ciclo de la fuente que cubre este depósito: fecha nominal del pago ('YYYY-MM-DD'). */
  incomeCycleKey?: string;
  /** Visacuota (CreditInstallment.id) de la que este movimiento es el cargo de una cuota. */
  installmentId?: string;
  /** Número de la cuota (1..N) que representa este movimiento. */
  installmentNo?: number;
  /** Pago de una tarjeta: tarjeta y estado (cutKey 'AAAA-MM-DD' del corte) que cubre. Es una transferencia neutra. */
  cardPayment?: { cardId: string; cutKey: string };
  /** Transferencia entre cuentas de distinta moneda: lo que recibió la cuenta destino (en SU moneda). */
  toAmount?: number;
  /** Saldo de la cuenta que trajo el SMS después de este movimiento (concilia el saldo automático). */
  smsBalance?: { amount: number; currency: Currency };
}

// ─────────────────────────────────────────────────────────────
// CUENTA FINANCIERA
// ─────────────────────────────────────────────────────────────
export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: Currency;
  balance: number;        // Saldo actual
  initialBalance: number;       // Saldo inicial al crear
  color: string;
  icon: string;
  bankName?: string;        // Nombre del banco si aplica
  creditLimit?: number;        // Para tarjetas de crédito (legado, ya no editable vía UI)
  cutoffDay?: number;        // Día de corte (1-31), solo para type === 'credit'
  paymentDueDay?: number;        // Día de pago (1-31), solo para type === 'credit'
  isActive: boolean;
  createdAt: string;
  notes?: string;
  smsLinks?: string[];       // Claves de vínculo SMS normalizadas ('BANCO|tipo:valor')
  smsLinkedAt?: string;      // ISO: última vez que cambiaron los vínculos
  /** Cómo lleva su saldo (ver services/Balances.ts). Sin valor: 'none' en tarjetas y 'manual' en el resto. */
  balanceMode?: 'none' | 'manual' | 'auto';
  smsAutoBalance?: boolean;  // Saldo automático: concilia con el saldo que trae el SMS (re-ancla)
  balanceAnchorAt?: string;  // ISO: en modo auto solo cuentan los movimientos posteriores a esta fecha
  balanceAnchorAmount?: number; // Saldo real en balanceAnchorAt (punto de partida del saldo derivado)
  /** Tarjeta: cuenta con la que se paga (de ahí sale el dinero). */
  payFromAccountId?: string;
  /** Tarjeta: montos reales de los últimos estados de cuenta (los últimos 6). */
  statementOverrides?: StatementOverride[];
}

/** Monto real de un estado de cuenta escrito a mano (por moneda). `cutKey` = fecha del corte 'AAAA-MM-DD'. */
export interface StatementOverride { cutKey: string; Q?: number; USD?: number; at: string; }

// ─────────────────────────────────────────────────────────────
// VISACUOTA / CUOTA DE TARJETA
// ─────────────────────────────────────────────────────────────
export interface CreditInstallment {
  id: string;
  accountId: string;      // Tarjeta de crédito asociada
  name: string;      // Ej: "Laptop Lenovo"
  totalAmount: number;      // Monto total de la compra
  monthlyPayment: number;      // Cuota mensual
  totalInstallments: number;    // Total de cuotas
  paidInstallments: number;    // Cuotas pagadas
  startDate: string;      // Fecha de inicio
  currency: Currency;
  category: string;
  isActive: boolean;
  notes?: string;
  originalSMS?: string;     // SMS de origen (si se detectó por SMS)
  smsFingerprint?: string;  // Huella del SMS de origen
  /** ISO: solo los cortes desde este día generan el cargo de la cuota (nada retroactivo). Ver InstallmentSchedule. */
  trackSince?: string;
  /** Ajuste para que paidInstallments = cuotas cargadas + paidOffset (cuotas pagadas antes de seguirlas). */
  paidOffset?: number;
  /** Día de pago (1-31) de un préstamo sin tarjeta; sin él se usa el día de startDate. */
  dueDay?: number;
}

// ─────────────────────────────────────────────────────────────
// CATEGORÍA PERSONALIZADA
// ─────────────────────────────────────────────────────────────
export interface CustomCategory {
  id: string;
  label: string;
  icon: string;
  color: string;
  type: 'expense' | 'income' | 'both';
}

// ─────────────────────────────────────────────────────────────
// APRENDIZAJE POR COMERCIO Y BUZÓN DE SMS SIN CLASIFICAR
// ─────────────────────────────────────────────────────────────
export interface MerchantRule { key: string; label: string; category: string; createdAt: string; updatedAt: string; hits: number; }

/** Regla de depósitos: banco|cuenta|origen del SMS -> categoría (ver services/IncomeRules.ts). */
export interface IncomeRule {
  key: string; label: string; category: string; sourceId?: string;
  createdAt: string; updatedAt: string; hits: number;
}

/** Patrón aprendido de un SMS de ejemplo: cómo reconocer el depósito de una fuente (ver services/IncomeSources.ts). */
export interface IncomePattern {
  bank: string;
  /** Últimos 4 dígitos de la cuenta enmascarada del SMS. */
  acctKey?: string;
  /** Clave normalizada de quién envía (igual que IncomeOrigin.originKey). */
  originKey?: string;
  originLabel?: string;
  amount: number;
  /** Tolerancia del monto en % (los centavos cambian de un mes a otro). */
  tolerancePct: number;
  learnedAt: string;
  /** SMS de ejemplo ya enmascarado (sin dígitos de cuenta). */
  sampleMasked: string;
}

/** De dónde y cuándo me pagan: sueldo, pago quincenal, ventas semanales, aguinaldo, etc. */
export interface IncomeSource {
  id: string;
  name: string;
  category: string;
  amount: number;
  currency: Currency;
  frequency: 'monthly' | 'biweekly' | 'weekly' | 'irregular';
  /** Día(s) del mes (mensual / quincenal) o día de la semana 0-6 (semanal). */
  days: number[];
  weekendRule?: PayRules['weekendRule'];
  accountId?: string;
  /** 'base' = ingreso regular que cuenta para el ingreso mensual; 'extra' = opcional (aguinaldo, bono 14). */
  role: 'base' | 'extra';
  /** Extras: meses (1-12) en que llegan, p. ej. 7 = bono 14, 12 = aguinaldo. */
  months?: number[];
  /** El día real en que cae esta fuente mueve el inicio del período. */
  anchorsPeriod: boolean;
  pattern?: IncomePattern;
  isActive: boolean;
  createdAt: string;
}

export interface SmsInboxItem {
  fingerprint: string; body: string; address?: string; receivedAt?: number;
  reason: string; bank: string; amount: number | null; currency: Currency;
  merchant: string | null; occurredAt: string; suggestedType: 'expense' | 'income' | null;
}

// ─────────────────────────────────────────────────────────────
// GASTO FIJO
// ─────────────────────────────────────────────────────────────
export interface FixedExpense {
  id: string;
  name: string;
  amount: number;
  currency: Currency;
  category: string;
  dayOfMonth: number;
  isPaid: boolean;
  paidDate?: string;
  autoRecord: boolean;
  notes?: string;
  isActive: boolean;
  lastTxId?: string;
  paidTxId?: string;         // Movimiento SMS que lo pagó (NUNCA se borra al desmarcar)
  paidBy?: 'manual' | 'sms';
  smsMatchKey?: string;      // merchantKey aprendido para emparejar SMS
  paidCycleKey?: string;     // Inicio ('YYYY-MM-DD') del período de presupuesto que cubre el pago; datos viejos pueden traer 'YYYY-MM'
}

// ─────────────────────────────────────────────────────────────
// PRESUPUESTO POR CATEGORÍA
// ─────────────────────────────────────────────────────────────
export interface CategoryBudget {
  categoryId: string;
  limit: number;
  currency: Currency;
  alertAt: number;
}

// ─────────────────────────────────────────────────────────────
// META DE AHORRO
// ─────────────────────────────────────────────────────────────
export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currency: Currency;
  currentAmount: number;
  deadline: string;
  category?: string;
  icon: string;
  color: string;
  isCompleted: boolean;
  createdAt: string;
}

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE USUARIO
// ─────────────────────────────────────────────────────────────
export interface UserSettings {
  userName: string;
  userTitle: string;
  budgetLimit: number;
  budgetLimitUSD: number;
  /** 'auto' (default): el equivalente en USD se deriva de budgetLimit / exchangeRate. 'manual': se usa budgetLimitUSD tal cual. */
  budgetLimitUSDMode?: 'auto' | 'manual';
  currency: Currency;
  paymentCycle: PaymentCycle;
  paymentDay: number;
  paymentDays: number[];
  /** Día de la semana en que le pagan (0=dom..6=sáb); solo ciclo semanal. Default 0; se normaliza al leer. */
  paymentWeekday?: number;
  monthlyIncome: number;
  monthlyIncomeUSD: number;
  /** @deprecated instantánea del onboarding; solo la lee DebtLoad.legacyDeclaredDebtQ. */
  activeDebts: number;
  /** @deprecated instantánea del onboarding; solo la lee DebtLoad.legacyDeclaredDebtQ. */
  activeDebtsUSD: number;
  monthlySavingsGoal: number;
  externalSavings: number;
  externalSavingsUSD: number;
  preferredBanks: string[];
  exchangeRate: number;
  /** 'auto' (default): se sincroniza con ExchangeRateService. 'manual': el usuario lo fijó a mano. */
  exchangeRateMode?: 'auto' | 'manual';
  exchangeRateSource?: string;
  /** ISO de la última actualización automática del tipo de cambio */
  exchangeRateUpdatedAt?: string;
  smsEnabled: boolean;
  biometricEnabled: boolean;
  geminiApiKey?: string;
  customCategories: CustomCategory[];
  onboardingComplete: boolean;
  tutorialComplete: boolean;
  cardsOnboardingComplete: boolean;
  /** @deprecated sin uso; se conserva por compatibilidad */
  financialScoreHistory: { month: string; score: number }[];
  /** @deprecated instantánea del onboarding; solo la lee DebtLoad.legacyDeclaredDebtQ. */
  activeDebtsList?: any[];
  /** Sincronizar SMS al abrir la app (default true). Nunca pide permisos por su cuenta. */
  smsAutoSync?: boolean;
  /** Reglas del día de pago: fin de semana, feriados, tolerancia y ancla automática (ver services/PayCalendar.ts). */
  payRules?: PayRules;
  /** Preferencias de notificaciones (ver services/NotifPrefs.ts); withSettingsDefaults siempre las completa. */
  notif?: NotifPrefs;
}

// ─────────────────────────────────────────────────────────────
// SINCRONIZACIÓN SMS: ESTADO, LOTES (DESHACER) Y SEÑALES VISTAS
// ─────────────────────────────────────────────────────────────
export interface SmsSyncState { lastSyncAt?: string; lastFullSyncAt?: string; lastAutoAttemptAt?: string; }

export interface SmsBatchRecord {
  id: string; at: string; mode: 'auto' | 'manual' | 'full';
  txIds: string[]; installmentIds: string[];
  fixedMarks: Array<{ expenseId: string; prev: Pick<FixedExpense, 'isPaid' | 'paidDate' | 'paidTxId' | 'paidBy' | 'lastTxId' | 'paidCycleKey'> }>;
  /** Uniones gasto fijo <-> SMS hechas en este lote (para deshacer: se restaura el manual). */
  fixedMerges?: Array<{ smsId: string; expenseId: string; manual: Transaction }>;
  /** Ingresos que el lote vinculó solo a una fuente (para deshacer: categoría previa y ancla del período). */
  incomeLinks?: Array<{ txId: string; prevCategory: string; anchorKey?: string }>;
  /** Pagos de tarjeta que el lote emparejó solo (para deshacer: la salida vuelve a su tipo y el pago pierde su estado). */
  cardPayments?: Array<{ txId: string; cardId: string; cutKey: string; outId?: string; outOnly?: boolean }>;
  /** Cuentas de saldo automático que el lote re-ancló con el saldo del SMS (para deshacer: vuelve el ancla previa). */
  balanceAnchors?: BalanceAnchorRecord[];
}

export interface SmsLinkSeen { key: string; count: number; lastAt: string; }

/** Resultado de deshacer un lote de sincronización. */
export interface SmsUndoResult { removedTx: number; removedInst: number; keptEdited: number; revertedFixed: number; }

/** Conteos para la confirmación de "Deshacer última sincronización". */
export interface SmsUndoPreview {
  batchId: string; at: string; mode: 'auto' | 'manual' | 'full';
  txCount: number; installmentCount: number; editedCount: number; fixedCount: number;
}

// ─────────────────────────────────────────────────────────────
// APP DATA
// ─────────────────────────────────────────────────────────────
export interface AppData {
  transactions: Transaction[];
  settings: UserSettings;
  fixedExpenses: FixedExpense[];
  categoryBudgets: CategoryBudget[];
  savingsGoals: SavingsGoal[];
  accounts: Account[];
  creditInstallments: CreditInstallment[];
  lastResetDate: string;
}

// ─────────────────────────────────────────────────────────────
// ESTADO DE NOTIFICACIONES
// ─────────────────────────────────────────────────────────────
export interface NotificationState {
  weeklySummaryFireAt?: string;   // ISO
  setupNudgesShown: string[];
  /** Ya se avisó que el período ahora arranca el día que cae el sueldo (ver B3b). */
  periodRulesNoticeShown?: boolean;
  /** Ids (bm_p_*) del plan de avisos programado la última vez (cuenta los avisos de cada día). */
  planned?: string[];
  /** Claves de avisos inmediatos ya enviados (umbral por período, capacidad por estado y nivel, sueldo por movimiento). */
  fired?: string[];
  /** Avisos inmediatos enviados hoy ('AAAA-MM-DD'): cuentan para el tope diario. */
  dayCount?: { day: string; count: number };
}

// ─────────────────────────────────────────────────────────────
// CLAVES DE ALMACENAMIENTO
// ─────────────────────────────────────────────────────────────
const K = {
  TRANSACTIONS: '@bm_transactions',
  SETTINGS: '@bm_settings',
  LAST_RESET: '@bm_last_reset',
  FIXED_EXPENSES: '@bm_fixed_expenses',
  CATEGORY_BUDGETS: '@bm_category_budgets',
  SAVINGS_GOALS: '@bm_savings_goals',
  ACCOUNTS: '@bm_accounts',
  CREDIT_INSTALLMENTS: '@bm_credit_installments',
  NOTIFICATION_STATE: '@bm_notification_state',
  SMS_DISMISSED: '@bm_sms_dismissed',
  SMS_REVIEW_KEPT: '@bm_sms_review_kept',
  MERCHANT_RULES: '@bm_merchant_rules',
  INCOME_RULES: '@bm_income_rules',
  INCOME_SOURCES: '@bm_income_sources',
  PERIOD_ANCHORS: '@bm_period_anchors',
  SMS_INBOX: '@bm_sms_inbox',
  SMS_INBOX_IGNORED: '@bm_sms_inbox_ignored',
  SMS_SYNC_STATE: '@bm_sms_sync_state',
  SMS_BATCHES: '@bm_sms_batches',
  DUP_IGNORED: '@bm_dup_ignored',
  SMS_LINK_SEEN: '@bm_sms_link_seen',
  ONBOARDING_DRAFT: '@bm_onboarding_draft',
  GETTING_STARTED: '@bm_getting_started',
  ASSISTANT_CHAT: '@bm_assistant_chat',
  MIGRATIONS: '@bm_migrations',
  WIDGET_SNAPSHOT: '@bm_widget_snapshot',
  WIDGET_PRIVACY: '@bm_widget_privacy',
};

/** Privacidad del widget de Android: 'hidden' (por defecto) esconde los montos; 'shown' los muestra. */
export type WidgetPrivacy = 'hidden' | 'shown';

/** Lista JSON guardada; [] si no hay nada. A diferencia de los getters, propaga los errores (commitOnboarding). */
async function readListStrict<T>(key: string): Promise<T[]> {
  const data = await AsyncStorage.getItem(key);
  if (!data) return [];
  const parsed = JSON.parse(data);
  return Array.isArray(parsed) ? parsed : [];
}

/** Reemplaza por id los elementos existentes y agrega los nuevos al final (idempotente). */
function upsertById<T extends { id: string }>(all: T[], items: T[]): T[] {
  const next = [...all];
  for (const it of items) {
    const idx = next.findIndex(x => x.id === it.id);
    if (idx >= 0) next[idx] = it; else next.push(it);
  }
  return next;
}

// ─────────────────────────────────────────────────────────────
// DEFAULTS
// ─────────────────────────────────────────────────────────────
export const DEFAULT_SETTINGS: UserSettings = {
  userName: 'Usuario',
  userTitle: 'BudgetMaster Pro',
  budgetLimit: 6000,
  budgetLimitUSD: 800,
  budgetLimitUSDMode: 'auto',
  currency: 'Q',
  paymentCycle: 'monthly',
  paymentDay: 30,
  paymentDays: [15, 30],
  paymentWeekday: 0,
  monthlyIncome: 0,
  monthlyIncomeUSD: 0,
  activeDebts: 0,
  activeDebtsUSD: 0,
  monthlySavingsGoal: 0,
  externalSavings: 0,
  externalSavingsUSD: 0,
  preferredBanks: [],
  exchangeRate: 7.70,
  exchangeRateMode: 'auto',
  smsEnabled: true,
  biometricEnabled: false,
  geminiApiKey: '',
  customCategories: [],
  onboardingComplete: false,
  tutorialComplete: false,
  cardsOnboardingComplete: false,
  financialScoreHistory: [],
  activeDebtsList: [],
  smsAutoSync: true,
  payRules: DEFAULT_PAY_RULES,
  notif: DEFAULT_NOTIF_PREFS,
};

/** Ajustes guardados + defaults; `payRules` siempre completo y válido (ajustes viejos no lo traen). */
function withSettingsDefaults(parsed: unknown): UserSettings {
  const base = (parsed && typeof parsed === 'object' ? parsed : {}) as Partial<UserSettings>;
  return {
    ...DEFAULT_SETTINGS, ...base,
    paymentWeekday: normalizeWeekday(base.paymentWeekday),
    payRules: sanitizePayRules(base.payRules), notif: sanitizeNotifPrefs(base.notif),
  };
}

/**
 * Equivalente en USD del presupuesto mensual. En modo 'manual' se respeta el valor
 * guardado; en 'auto' (default) se deriva de budgetLimit y el tipo de cambio vigente.
 */
export function getBudgetLimitUSD(s: UserSettings): number {
  if (s.budgetLimitUSDMode === 'manual') return s.budgetLimitUSD;
  const r = s.exchangeRate > 0 ? s.exchangeRate : 7.7;
  return Math.round((s.budgetLimit / r) * 100) / 100;
}

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────

/** Cantidad de días del mes dado (acepta month fuera de 0-11, JS lo normaliza) */
function daysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** Recorta un día de pago configurado al largo real del mes indicado */
export function getEffectivePaymentDay(paymentDay: number, year: number, month: number): number {
  return Math.min(Math.max(1, Math.round(paymentDay)), daysInMonth(year, month));
}

/** Indica si un gasto fijo está vencido: no pagado y ya pasó su vencimiento dentro del período de presupuesto actual */
export function isFixedExpenseOverdue(expense: FixedExpense, cycle: FixedCycleConfig, now: Date = new Date()): boolean {
  if (expense.isPaid) return false;
  const due = dueDateInPeriod(expense.dayOfMonth, periodFor(cycle, now), cycle);
  return Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()) > Date.UTC(due.getFullYear(), due.getMonth(), due.getDate());
}

/**
 * Indica si existe una tasa de cambio confiable entre dos monedas.
 * La app solo tiene tasa real Q↔USD; cualquier conversión USD↔EUR/£ no es
 * confiable (ver JSDoc de convertAmount) y debe bloquearse con este helper.
 */
export function hasReliableConversion(from: Currency, to: Currency): boolean {
  const isUsdEurOrGbpPair =
    (from === 'USD' && (to === 'EUR' || to === '£')) ||
    (to === 'USD' && (from === 'EUR' || from === '£'));
  return !isUsdEurOrGbpPair;
}

export { parseAmount, formatDateOnly, parseDateOnly } from './DateAmount';

/**
 * Convierte una fecha-hora guardada (string ISO con hora, posiblemente vieja)
 * a una cadena solo-día "YYYY-MM-DD", evitando el corrimiento de día que
 * causaría convertir a horario local una fecha guardada a medianoche UTC.
 */
export function storedDateToDateOnly(stored: string): string {
  if (/^\d{4}-\d{2}-\d{2}(T00:00:00(\.000)?Z)?$/.test(stored)) {
    return stored.slice(0, 10);
  }
  const d = new Date(stored);
  return isNaN(d.getTime()) ? formatDateOnly(new Date()) : formatDateOnly(d);
}

// Anclas del inicio real del período en memoria (se cargan en loadAllData / getPeriodAnchors).
let anchorsCache: PeriodAnchor[] = [];

/** Reconstruye el resolvedor global de FixedCycle.periodFor con los ajustes y las anclas actuales. */
export function refreshPeriodResolver(settings: UserSettings): void {
  setPeriodStartResolver(buildStartResolver(settings, anchorsCache));
}

/** Días hasta próximo pago (inicio real del período siguiente: sueldo, fin de semana o feriado incluidos). */
export function getDaysUntilNextPayment(settings: UserSettings, now: Date = new Date()): number {
  return daysUntilNextPay(settings, now, buildStartResolver(settings, anchorsCache));
}

// ─────────────────────────────────────────────────────────────
// PERÍODO FINANCIERO (basado en día de pago, no mes calendario)
// ─────────────────────────────────────────────────────────────
export type { FinancialPeriod } from './FinancialPeriod';

/** Calcula el período financiero actual y el anterior según el ciclo de pago (ver services/FinancialPeriod.ts). */
export function getCurrentFinancialPeriod(settings: UserSettings, now: Date = new Date()): FinancialPeriod {
  return computeFinancialPeriod(settings, now, buildStartResolver(settings, anchorsCache));
}

/**
 * Patrimonio neto total desde cuentas.
 * Las cuentas de tipo 'credit' (tarjetas) se EXCLUYEN por completo: no son
 * activos ni se restan como pasivo aquí. Sus saldos y el pendiente de
 * visacuotas se reportan aparte como "compromisos de crédito"
 * (ver calcCreditCommitments) para no mezclar patrimonio con deuda de tarjeta.
 * Tampoco suman las cuentas que no llevan saldo (modo 'none'): el saldo es opcional.
 */
export function calcNetWorthFromAccounts(accounts: Account[], exchangeRate: number): { totalQ: number; totalUSD: number; totalEUR: number; totalGBP: number } {
  let totalQ = 0;
  let totalUSD = 0;
  let totalEUR = 0;
  let totalGBP = 0;

  for (const acc of accounts) {
    if (!acc.isActive) continue;
    if (acc.type === 'credit') continue;
    if (balanceModeOf(acc) === 'none') continue;
    const amount = acc.balance;

    if (acc.currency === 'Q') totalQ += amount;
    if (acc.currency === 'USD') totalUSD += amount;
    if (acc.currency === 'EUR') totalEUR += amount;
    if (acc.currency === '£') totalGBP += amount;
  }

  return { totalQ, totalUSD, totalEUR, totalGBP };
}

/**
 * Convierte un monto entre monedas usando Q como moneda puente.
 * Para EUR/£ no hay tasa de cambio disponible en la app: se asumen 1:1
 * respecto a Q (misma limitación que el resto del código; no se introduce
 * infraestructura nueva de FX). Como consecuencia, una conversión USD↔EUR/£
 * no es confiable (pasa por Q con una tasa 1:1 inventada); usar
 * hasReliableConversion() para detectar y bloquear ese caso antes de llamar
 * a esta función donde el resultado se le muestra o aplica al usuario.
 */
export function convertAmount(amount: number, from: Currency, to: Currency, exchangeRate: number): number {
  if (from === to) return amount;
  const q = from === 'USD' ? amount * exchangeRate : amount;
  return to === 'USD' ? q / exchangeRate : q;
}

/**
 * Compromisos de crédito, calculados aparte del patrimonio neto:
 * Las tarjetas de crédito ya no tienen saldo propio (siempre sería 0);
 * toda su deuda vive en las visacuotas asociadas.
 * - installmentsPendingQ: monto pendiente (no el total) de las visacuotas activas (convertido a Q)
 */
export function calcCreditCommitments(installments: CreditInstallment[], exchangeRate: number): { installmentsPendingQ: number } {
  const installmentsPendingQ = installments
    .filter(i => i.isActive)
    .reduce((s, i) => {
      const pending = Math.max(0, i.totalAmount - i.monthlyPayment * i.paidInstallments);
      return s + convertAmount(pending, i.currency, 'Q', exchangeRate);
    }, 0);

  return { installmentsPendingQ };
}

/** Cuota mensual pendiente de visacuotas, en Q */
export function getMonthlyInstallmentTotal(installments: CreditInstallment[], exchangeRate: number): number {
  return installments
    .filter(i => i.isActive && i.paidInstallments < i.totalInstallments)
    .reduce((s, i) => s + convertAmount(i.monthlyPayment, i.currency, 'Q', exchangeRate), 0);
}

/** Cuota mensual total de las visacuotas activas ligadas a una cuenta (tarjeta) específica, convertida a targetCurrency */
export function getAccountMonthlyInstallmentTotal(installments: CreditInstallment[], accountId: string, exchangeRate: number, targetCurrency: Currency): number {
  return installments
    .filter(i => i.accountId === accountId && i.isActive && i.paidInstallments < i.totalInstallments)
    .reduce((s, i) => s + convertAmount(i.monthlyPayment, i.currency, targetCurrency, exchangeRate), 0);
}

// ─────────────────────────────────────────────────────────────
// SMS: LLAVES DE DESCARTE
// ─────────────────────────────────────────────────────────────
const MAX_SMS_DISMISSED = 5000;
const MAX_SMS_REVIEW_KEPT = 5000;
const MAX_SMS_INBOX = 200;
const MAX_SMS_INBOX_IGNORED = 2000;
const MAX_DUP_IGNORED = 2000;
const MAX_SMS_BATCHES = 3;
const SMS_UNDO_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/** Llaves (id y huella) que impiden que un movimiento SMS borrado vuelva a importarse. */
function smsTombstoneKeys(tx: Transaction): string[] {
  const ts = Date.parse(tx.date);
  const fp = tx.smsFingerprint
    ?? (tx.originalSMS ? buildSmsFingerprint(tx.originalSMS, isNaN(ts) ? undefined : ts) : '');
  return [tx.id, fp].filter(Boolean);
}

// ─────────────────────────────────────────────────────────────
// STORAGE SERVICE
// ─────────────────────────────────────────────────────────────
export const StorageService = {

  // ── Transacciones ─────────────────────────────────────────
  async getTransactions(): Promise<Transaction[]> {
    try {
      const data = await AsyncStorage.getItem(K.TRANSACTIONS);
      if (!data) return [];
      const txs: Transaction[] = JSON.parse(data);
      return txs.map(t => ({ ...t, currency: t.currency ?? 'Q' }));
    } catch { return []; }
  },

  async saveTransactions(txs: Transaction[]): Promise<void> {
    try { await AsyncStorage.setItem(K.TRANSACTIONS, JSON.stringify(txs)); } catch { }
    emitPlanInputsChanged();
  },

  async addTransaction(tx: Transaction): Promise<Transaction[]> {
    const all = await this.getTransactions();
    const updated = [tx, ...all];
    await this.saveTransactions(updated);
    return updated;
  },

  async deleteTransaction(id: string): Promise<Transaction[]> {
    const all = await this.getTransactions();
    const target = all.find(t => t.id === id);
    // Un movimiento SMS borrado no debe "resucitar" en la próxima sincronización
    // (tampoco al convertirlo en visacuota): se registra su huella como descartada.
    if (target && target.source === 'sms') {
      await this.addDismissedSms(smsTombstoneKeys(target));
    }
    // El cargo de una cuota de visacuota borrado a mano no se vuelve a generar en el siguiente corte/arranque.
    if (target && (target.id.startsWith('inst_') || (target.installmentId && target.installmentNo))) {
      await this.addDismissedSms([
        ...(target.id.startsWith('inst_') ? [target.id] : []),
        ...(target.installmentId && target.installmentNo ? [`inst_${target.installmentId}_${target.installmentNo}`] : []),
      ]);
    }
    let updated = all.filter(t => t.id !== id);
    // Mitad de un par de transferencia: la otra queda neutra pero sin transferPairId (sin huérfanos).
    if (target?.transferPairId) updated = clearPairIdOfPartner(updated, target.transferPairId);
    await this.saveTransactions(updated);
    // Una transferencia o pago de tarjeta hecho a mano ajustó el saldo guardado de las cuentas manuales: se devuelve.
    if (target) {
      try {
        const accounts = await this.getAccounts();
        const reverted = planManualEffectsRevert(accounts, target);
        if (reverted !== accounts) await this.saveAccounts(reverted);
      } catch { }
    }
    // Un sueldo vinculado a una fuente pudo haber movido el inicio del período: esa ancla se va con él.
    if (target?.incomeSourceId) {
      try {
        const anchors = await this.getPeriodAnchors();
        const left = removeAnchorsForTx(anchors, id);
        if (left.length !== anchors.length) await this.savePeriodAnchors(left);
      } catch { }
    }
    // Si el movimiento pagaba un gasto fijo, ese gasto vuelve a "no pagado". Solo se toca
    // si el vínculo vigente apunta a este movimiento (uno de un mes anterior no desmarca el actual).
    if (target?.fixedExpenseId) {
      try {
        const expenses = await this.getFixedExpenses();
        let changed = false;
        const nextExpenses = expenses.map(e => {
          if (e.id !== target.fixedExpenseId || (e.paidTxId !== id && e.lastTxId !== id)) return e;
          changed = true;
          return {
            ...e, isPaid: false, paidDate: undefined, paidTxId: undefined, paidBy: undefined,
            paidCycleKey: undefined,
            lastTxId: e.lastTxId === id ? undefined : e.lastTxId,
          };
        });
        if (changed) await this.saveFixedExpenses(nextExpenses);
      } catch { }
    }
    return updated;
  },

  async updateTransaction(tx: Transaction): Promise<Transaction[]> {
    const all = await this.getTransactions();
    const updated = all.map(t => t.id === tx.id ? tx : t);
    await this.saveTransactions(updated);
    return updated;
  },

  // ── SMS: descartados y revisión ───────────────────────────
  async getDismissedSms(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(K.SMS_DISMISSED);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  /** Agrega llaves (id/huella) a la lista de descartados. Sin repetidos; tope de 5000 (descarta las más viejas). */
  async addDismissedSms(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      const current = await this.getDismissedSms();
      const merged = Array.from(new Set([...current, ...keys]));
      const trimmed = merged.length > MAX_SMS_DISMISSED ? merged.slice(merged.length - MAX_SMS_DISMISSED) : merged;
      await AsyncStorage.setItem(K.SMS_DISMISSED, JSON.stringify(trimmed));
    } catch { }
  },

  async getSmsReviewKept(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(K.SMS_REVIEW_KEPT);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  /** Ids de movimientos SMS que el usuario decidió conservar en la revisión (no se vuelven a sugerir). */
  async addSmsReviewKept(ids: string[]): Promise<void> {
    if (ids.length === 0) return;
    try {
      const current = await this.getSmsReviewKept();
      const merged = Array.from(new Set([...current, ...ids]));
      const trimmed = merged.length > MAX_SMS_REVIEW_KEPT ? merged.slice(merged.length - MAX_SMS_REVIEW_KEPT) : merged;
      await AsyncStorage.setItem(K.SMS_REVIEW_KEPT, JSON.stringify(trimmed));
    } catch { }
  },

  /**
   * Importa en lote movimientos y visacuotas detectados por SMS: UNA lectura y
   * UNA escritura por colección. Ignora los ids ya presentes. Devuelve las
   * colecciones completas resultantes.
   */
  async importSmsBatch(
    txs: Transaction[],
    insts: CreditInstallment[],
  ): Promise<{ transactions: Transaction[]; installments: CreditInstallment[] }> {
    let allTxs = await this.getTransactions();
    let allInsts = await this.getCreditInstallments();
    if (txs.length > 0) {
      const have = new Set(allTxs.map(t => t.id));
      const fresh = txs.filter(t => !have.has(t.id));
      if (fresh.length > 0) {
        allTxs = [...fresh, ...allTxs];
        await this.saveTransactions(allTxs);
      }
    }
    if (insts.length > 0) {
      const have = new Set(allInsts.map(i => i.id));
      const fresh = insts.filter(i => !have.has(i.id));
      if (fresh.length > 0) {
        allInsts = [...allInsts, ...fresh];
        await this.saveCreditInstallments(allInsts);
      }
    }
    return { transactions: allTxs, installments: allInsts };
  },

  /**
   * Aplica la revisión de SMS ya importados con UNA lectura y UNA escritura de
   * transacciones: elimina removeIds (dejando su huella como descartada),
   * reemplaza los movimientos de updates y registra keepIds como conservados.
   */
  async applySmsReview(removeIds: string[], updates: Transaction[], keepIds: string[]): Promise<Transaction[]> {
    const all = await this.getTransactions();
    const removeSet = new Set(removeIds);
    const tombstones: string[] = [];
    for (const t of all) {
      if (removeSet.has(t.id)) tombstones.push(...smsTombstoneKeys(t));
    }
    const updateMap = new Map(updates.map(u => [u.id, u]));
    const next = all
      .filter(t => !removeSet.has(t.id))
      .map(t => updateMap.get(t.id) ?? t);
    await this.saveTransactions(next);
    await this.addDismissedSms(tombstones);
    await this.addSmsReviewKept(keepIds);
    return next;
  },

  // ── Aprendizaje por comercio ──────────────────────────────
  async getMerchantRules(): Promise<MerchantRule[]> {
    try {
      const data = await AsyncStorage.getItem(K.MERCHANT_RULES);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  async saveMerchantRules(rules: MerchantRule[]): Promise<void> {
    try { await AsyncStorage.setItem(K.MERCHANT_RULES, JSON.stringify(rules)); } catch { }
  },

  async deleteMerchantRule(key: string): Promise<MerchantRule[]> {
    const all = await this.getMerchantRules();
    const updated = all.filter(r => r.key !== key);
    await this.saveMerchantRules(updated);
    return updated;
  },

  /**
   * Guarda un movimiento editado (tx ya trae categoryEditedAt). Con `applyToPast`
   * copia la categoría a los otros movimientos SMS del mismo comercio (sin marcarlos
   * como editados a mano); con `remember` aprende la regla del comercio.
   * Una lectura y una escritura de transacciones. `affected` = otros movimientos cambiados.
   */
  async saveTransactionWithLearning(
    tx: Transaction,
    opts: { remember: boolean; applyToPast: boolean },
  ): Promise<{ transactions: Transaction[]; affected: number }> {
    const all = await this.getTransactions();
    const pastIds = opts.applyToPast ? new Set(sameMerchantTxIds(all, tx)) : new Set<string>();
    let affected = 0;
    const next = all.map(t => {
      if (t.id === tx.id) return tx;
      if (pastIds.has(t.id) && t.category !== tx.category) {
        affected++;
        return { ...t, category: tx.category };
      }
      return t;
    });
    await this.saveTransactions(next);

    if (opts.remember) {
      const merchant = merchantOfTransaction(tx);
      if (merchant) {
        const rules = await this.getMerchantRules();
        const updated = upsertMerchantRule(rules, merchant, tx.category, new Date().toISOString());
        await this.saveMerchantRules(updated);
      }
    }
    return { transactions: next, affected };
  },

  // ── Aprendizaje de depósitos (origen del ingreso) ─────────
  async getIncomeRules(): Promise<IncomeRule[]> {
    try {
      const data = await AsyncStorage.getItem(K.INCOME_RULES);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  async saveIncomeRules(rules: IncomeRule[]): Promise<void> {
    try { await AsyncStorage.setItem(K.INCOME_RULES, JSON.stringify(rules)); } catch { }
  },

  async deleteIncomeRule(key: string): Promise<IncomeRule[]> {
    const all = await this.getIncomeRules();
    const updated = all.filter(r => r.key !== key);
    await this.saveIncomeRules(updated);
    return updated;
  },

  /**
   * Como saveTransactionWithLearning pero para ingresos SMS: guarda el movimiento editado
   * (tx ya trae categoryEditedAt). Con `applyToPast` copia la categoría a los otros ingresos
   * SMS del mismo origen (sin categoryEditedAt, sin marcarlos como editados a mano); con
   * `remember` aprende la regla banco|cuenta|origen. `affected` = otros movimientos cambiados.
   */
  async saveIncomeWithLearning(
    tx: Transaction,
    opts: { remember: boolean; applyToPast: boolean },
  ): Promise<{ transactions: Transaction[]; affected: number }> {
    const all = await this.getTransactions();
    const pastIds = opts.applyToPast ? new Set(sameOriginTxIds(all, tx)) : new Set<string>();
    let affected = 0;
    const next = all.map(t => {
      if (t.id === tx.id) return tx;
      if (pastIds.has(t.id) && t.category !== tx.category) {
        affected++;
        return { ...t, category: tx.category };
      }
      return t;
    });
    await this.saveTransactions(next);

    if (opts.remember) {
      const key = incomeKeyOfTx(tx);
      const label = incomeOriginLabelOfTx(tx);
      if (key && label) {
        const rules = await this.getIncomeRules();
        await this.saveIncomeRules(upsertIncomeRule(rules, key, label, tx.category, new Date().toISOString()));
      }
    }
    return { transactions: next, affected };
  },

  // ── Fuentes de ingreso ────────────────────────────────────
  async getIncomeSources(): Promise<IncomeSource[]> {
    try {
      const data = await AsyncStorage.getItem(K.INCOME_SOURCES);
      return sanitizeIncomeSources(data ? JSON.parse(data) : []);
    } catch { return []; }
  },

  async saveIncomeSources(list: IncomeSource[]): Promise<void> {
    try { await AsyncStorage.setItem(K.INCOME_SOURCES, JSON.stringify(list)); } catch { }
    emitPlanInputsChanged();
  },

  async addIncomeSource(source: IncomeSource): Promise<IncomeSource[]> {
    const next = [...(await this.getIncomeSources()).filter(s => s.id !== source.id), source];
    await this.saveIncomeSources(next);
    return next;
  },

  async updateIncomeSource(source: IncomeSource): Promise<IncomeSource[]> {
    const next = (await this.getIncomeSources()).map(s => (s.id === source.id ? source : s));
    await this.saveIncomeSources(next);
    return next;
  },

  /** Borra la fuente. NO borra movimientos: solo les quita incomeSourceId / incomeCycleKey (y el vínculo de las reglas). */
  async deleteIncomeSource(id: string): Promise<IncomeSource[]> {
    const next = (await this.getIncomeSources()).filter(s => s.id !== id);
    await this.saveIncomeSources(next);
    const txs = await this.getTransactions();
    if (txs.some(t => t.incomeSourceId === id)) {
      await this.saveTransactions(txs.map(t => {
        if (t.incomeSourceId !== id) return t;
        const { incomeSourceId: _s, incomeCycleKey: _c, ...rest } = t;
        return rest;
      }));
    }
    const rules = await this.getIncomeRules();
    if (rules.some(r => r.sourceId === id)) {
      await this.saveIncomeRules(rules.map(r => {
        if (r.sourceId !== id) return r;
        const { sourceId: _x, ...rest } = r;
        return rest;
      }));
    }
    return next;
  },

  /**
   * Vincula un ingreso a su fuente en el ciclo `occKey` (fecha nominal del pago): le pone la categoría de la
   * fuente, aprende la regla del origen y, si la fuente es base y ancla el período, mueve el inicio del período
   * al día real del depósito (ancla automática; ver planIncomeLink). Devuelve null si no existe el movimiento
   * o la fuente. `prevCategory` y `anchorKey` sirven para deshacer el lote.
   */
  async linkIncome(
    txId: string, sourceId: string, occKey: string,
  ): Promise<{ tx: Transaction; prevCategory: string; anchorKey?: string } | null> {
    const [txs, sources, incomeRules, anchors, settings] = await Promise.all([
      this.getTransactions(), this.getIncomeSources(), this.getIncomeRules(), this.getPeriodAnchors(), this.getSettings(),
    ]);
    const tx = txs.find(t => t.id === txId);
    const source = sources.find(s => s.id === sourceId);
    if (!tx || !source || tx.type !== 'income') return null;
    const plan = planIncomeLink({
      tx, source, occKey, settings, rules: sanitizePayRules(settings.payRules),
      incomeRules, anchors, nowIso: new Date().toISOString(),
    });
    await this.saveTransactions(txs.map(t => (t.id === txId ? plan.tx : t)));
    if (plan.incomeRules !== incomeRules) await this.saveIncomeRules(plan.incomeRules);
    await this.savePeriodAnchors(plan.anchors);   // también reconstruye el resolvedor del período
    return { tx: plan.tx, prevCategory: plan.prevCategory, ...(plan.anchorKey ? { anchorKey: plan.anchorKey } : {}) };
  },

  /** Quita el vínculo del ingreso con su fuente y las anclas automáticas que nacieron de él. La categoría se queda. */
  async unlinkIncome(txId: string): Promise<Transaction[]> {
    const txs = await this.getTransactions();
    const target = txs.find(t => t.id === txId);
    const next = target && (target.incomeSourceId || target.incomeCycleKey)
      ? txs.map(t => {
        if (t.id !== txId) return t;
        const { incomeSourceId: _s, incomeCycleKey: _c, ...rest } = t;
        return rest;
      })
      : txs;
    if (next !== txs) await this.saveTransactions(next);
    const anchors = await this.getPeriodAnchors();
    const left = removeAnchorsForTx(anchors, txId);
    if (left.length !== anchors.length) await this.savePeriodAnchors(left);
    else refreshPeriodResolver(await this.getSettings());
    return next;
  },

  // ── Buzón de SMS sin clasificar ───────────────────────────
  async getSmsInbox(): Promise<SmsInboxItem[]> {
    try {
      const data = await AsyncStorage.getItem(K.SMS_INBOX);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  /** Reemplaza el buzón con lo que el motor no entendió (sin ignorados; tope de 200). */
  async replaceSmsInbox(items: SmsInboxItem[]): Promise<SmsInboxItem[]> {
    const ignored = new Set(await this.getSmsInboxIgnored());
    const next = items.filter(i => !ignored.has(i.fingerprint)).slice(0, MAX_SMS_INBOX);
    try { await AsyncStorage.setItem(K.SMS_INBOX, JSON.stringify(next)); } catch { }
    return next;
  },

  async getSmsInboxIgnored(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(K.SMS_INBOX_IGNORED);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  /** Marca un SMS del buzón como ignorado (tope de 2000) y lo saca del buzón. */
  async ignoreSmsInboxItem(fp: string): Promise<void> {
    try {
      const current = await this.getSmsInboxIgnored();
      const merged = Array.from(new Set([...current, fp]));
      const trimmed = merged.length > MAX_SMS_INBOX_IGNORED ? merged.slice(merged.length - MAX_SMS_INBOX_IGNORED) : merged;
      await AsyncStorage.setItem(K.SMS_INBOX_IGNORED, JSON.stringify(trimmed));
      const inbox = await this.getSmsInbox();
      await AsyncStorage.setItem(K.SMS_INBOX, JSON.stringify(inbox.filter(i => i.fingerprint !== fp)));
    } catch { }
  },

  /** Registra como movimiento un SMS del buzón y lo saca del buzón. */
  async registerSmsInboxItem(fp: string, tx: Transaction): Promise<Transaction[]> {
    const updated = await this.addTransaction(tx);
    try {
      const inbox = await this.getSmsInbox();
      await AsyncStorage.setItem(K.SMS_INBOX, JSON.stringify(inbox.filter(i => i.fingerprint !== fp)));
    } catch { }
    return updated;
  },

  /**
   * Buzón incremental: fusiona por huella con el buzón actual (sin perder lo no revisado),
   * quita ignorados y SMS ya registrados como movimiento, y deja los 200 más nuevos
   * por receivedAt. `replaceSmsInbox` no cambia (se usa en la sincronización completa).
   */
  async mergeSmsInbox(items: SmsInboxItem[]): Promise<SmsInboxItem[]> {
    const [current, ignoredList, txs] = await Promise.all([
      this.getSmsInbox(), this.getSmsInboxIgnored(), this.getTransactions(),
    ]);
    const ignored = new Set(ignoredList);
    const registered = new Set<string>();
    for (const t of txs) { registered.add(t.id); if (t.smsFingerprint) registered.add(t.smsFingerprint); }
    const byFp = new Map<string, SmsInboxItem>();
    for (const i of current) byFp.set(i.fingerprint, i);
    for (const i of items) byFp.set(i.fingerprint, i);
    const next = Array.from(byFp.values())
      .filter(i => !ignored.has(i.fingerprint) && !registered.has(i.fingerprint))
      .sort((a, b) => (b.receivedAt ?? 0) - (a.receivedAt ?? 0))
      .slice(0, MAX_SMS_INBOX);
    try { await AsyncStorage.setItem(K.SMS_INBOX, JSON.stringify(next)); } catch { }
    return next;
  },

  // ── Sincronización SMS: estado y lotes (deshacer) ─────────
  async getSmsSyncState(): Promise<SmsSyncState> {
    try {
      const data = await AsyncStorage.getItem(K.SMS_SYNC_STATE);
      const parsed = data ? JSON.parse(data) : {};
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    } catch { return {}; }
  },

  /** Fusiona `patch` con el estado guardado y devuelve el estado resultante. */
  async saveSmsSyncState(patch: Partial<SmsSyncState>): Promise<SmsSyncState> {
    const next = { ...(await this.getSmsSyncState()), ...patch };
    try { await AsyncStorage.setItem(K.SMS_SYNC_STATE, JSON.stringify(next)); } catch { }
    return next;
  },

  async getSmsBatches(): Promise<SmsBatchRecord[]> {
    try {
      const data = await AsyncStorage.getItem(K.SMS_BATCHES);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  /** Agrega el lote al inicio y deja solo los 3 más nuevos. */
  async recordSmsBatch(rec: SmsBatchRecord): Promise<void> {
    try {
      const current = await this.getSmsBatches();
      const next = [rec, ...current.filter(b => b.id !== rec.id)].slice(0, MAX_SMS_BATCHES);
      await AsyncStorage.setItem(K.SMS_BATCHES, JSON.stringify(next));
    } catch { }
  },

  /** Último lote si tiene 7 días o menos (los lotes deshechos se quitan del registro). */
  async getLastSmsBatch(): Promise<SmsBatchRecord | null> {
    const [last] = await this.getSmsBatches();
    if (!last) return null;
    const at = Date.parse(last.at);
    if (isNaN(at) || Date.now() - at > SMS_UNDO_WINDOW_MS) return null;
    return last;
  },

  /**
   * Solo conteos para la confirmación de "Deshacer". null si `batchId` no es el último lote
   * o tiene más de 7 días. txCount/installmentCount/fixedCount = lo que se deshace por defecto
   * (sin editados); editedCount = los que el interruptor "Incluir también los N que editaste" sumaría.
   */
  async previewUndoSmsBatch(batchId: string): Promise<SmsUndoPreview | null> {
    const batch = await this.getLastSmsBatch();
    if (!batch || batch.id !== batchId) return null;
    const [txs, insts, expenses] = await Promise.all([
      this.getTransactions(), this.getCreditInstallments(), this.getFixedExpenses(),
    ]);
    const plan = planSmsUndo(batch, txs, insts, Array.isArray(expenses) ? expenses : [], false);
    return {
      batchId: batch.id, at: batch.at, mode: batch.mode,
      txCount: plan.removeTxs.length, installmentCount: plan.removeInsts.length,
      editedCount: plan.editedCount, fixedCount: plan.revertedFixed,
    };
  },

  /**
   * Deshace el último lote: elimina sus movimientos y visacuotas (los editados se conservan salvo
   * `includeEdited`), los agrega a descartados (no vuelven a importarse), restaura los gastos fijos
   * marcados por el lote y quita el lote del registro. Si `batchId` no es el último lote vigente
   * (o ya pasaron 7 días) no hace nada y devuelve ceros. Una lectura y una escritura por colección.
   */
  async undoSmsBatch(batchId: string, opts: { includeEdited: boolean }): Promise<SmsUndoResult> {
    const empty: SmsUndoResult = { removedTx: 0, removedInst: 0, keptEdited: 0, revertedFixed: 0 };
    const batch = await this.getLastSmsBatch();
    if (!batch || batch.id !== batchId) return empty;
    const [txs, insts, expenses] = await Promise.all([
      this.getTransactions(), this.getCreditInstallments(), this.getFixedExpenses(),
    ]);
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    const plan = planSmsUndo(batch, txs, insts, safeExpenses, !!opts.includeEdited);

    // saveTransactions es el punto por donde se revertirán los saldos cuando exista el saldo automático.
    // Los registros manuales que el lote había unido a un SMS vuelven (no reciben lápida: no son SMS).
    // Los cargos que generaron las visacuotas deshechas se van con ellas (no quedan cuotas huérfanas).
    const dropped = dropInstallmentCharges(txs, new Set(plan.removeInsts.map(i => i.id)));
    const afterTwins = dropped.txs;
    const remaining = plan.removeTxs.length > 0 || dropped.removed > 0
      ? [...afterTwins.filter(t => !plan.removedTxIds.has(t.id)), ...plan.restoreManuals]
      : afterTwins;
    // Ingresos que el lote vinculó solo a una fuente: categoría previa en los que se quedan y fuera sus anclas.
    const incomeUndo = (batch.incomeLinks && batch.incomeLinks.length > 0)
      ? planIncomeLinksUndo(batch.incomeLinks, remaining, await this.getPeriodAnchors())
      : null;
    // Pagos de tarjeta que el lote emparejó solo: la salida de la cuenta pagadora vuelve a lo que era.
    const cardUndo = (batch.cardPayments && batch.cardPayments.length > 0)
      ? planCardPaymentsUndo(batch.cardPayments, incomeUndo ? incomeUndo.txs : remaining)
      : null;
    if (plan.removeTxs.length > 0 || dropped.changed || incomeUndo?.txsChanged || cardUndo?.changed) {
      await this.saveTransactions(cardUndo ? cardUndo.txs : (incomeUndo ? incomeUndo.txs : remaining));
    }
    if (incomeUndo?.anchorsChanged) await this.savePeriodAnchors(incomeUndo.anchors);
    // Cuentas de saldo automático que el lote re-ancló con el saldo del SMS: vuelve el ancla de antes.
    if (batch.balanceAnchors && batch.balanceAnchors.length > 0) {
      const balUndo = planBalanceAnchorsUndo(batch.balanceAnchors, await this.getAccounts());
      if (balUndo.changed) await this.saveAccounts(balUndo.accounts);
    }
    if (plan.removeInsts.length > 0) {
      const instIds = new Set(plan.removeInsts.map(i => i.id));
      await this.saveCreditInstallments(insts.filter(i => !instIds.has(i.id)));
    }
    if (plan.revertedFixed > 0) await this.saveFixedExpenses(plan.nextExpenses);

    const tombstones = [
      ...plan.removeTxs.flatMap(smsTombstoneKeys),
      ...plan.removeInsts.flatMap(i => [i.id, i.smsFingerprint ?? ''].filter(Boolean)),
    ];
    await this.addDismissedSms(tombstones);

    try {
      const rest = (await this.getSmsBatches()).filter(b => b.id !== batchId);
      await AsyncStorage.setItem(K.SMS_BATCHES, JSON.stringify(rest));
    } catch { }

    return {
      removedTx: plan.removeTxs.length, removedInst: plan.removeInsts.length,
      keptEdited: plan.keptEdited, revertedFixed: plan.revertedFixed,
    };
  },

  // ── Gastos fijos pagados por SMS ──────────────────────────
  /**
   * Marca el gasto fijo como pagado por un movimiento SMS: isPaid, paidDate = tx.date,
   * paidTxId, paidBy 'sms' (lastTxId no se toca) y tx.fixedExpenseId. Con `learnKey`
   * guarda smsMatchKey para que los próximos períodos se marque solo.
   */
  async markFixedPaidBySms(expenseId: string, txId: string, learnKey?: string): Promise<FixedExpense[]> {
    const [expenses, txs, cfg] = await Promise.all([this.getFixedExpenses(), this.getTransactions(), this.getFixedCycleConfig()]);
    const tx = txs.find(t => t.id === txId);
    if (!tx || !expenses.some(e => e.id === expenseId)) return expenses;
    const nextExpenses = expenses.map(e => e.id !== expenseId ? e : {
      ...e, isPaid: true, paidDate: tx.date, paidTxId: txId, paidBy: 'sms' as const,
      paidCycleKey: cycleKeyFor(cfg, tx.date) ?? periodFor(cfg, new Date()).key,
      ...(learnKey ? { smsMatchKey: learnKey } : {}),
    });
    await this.saveFixedExpenses(nextExpenses);
    await this.saveTransactions(txs.map(t => t.id === txId ? { ...t, fixedExpenseId: expenseId } : t));
    return nextExpenses;
  },

  /**
   * Desmarca un gasto fijo. Si lo pagó un SMS (paidTxId) solo suelta el vínculo y NO borra
   * el movimiento. Si lo pagó un registro manual (lastTxId 'fe_tx_*') lo borra, como antes.
   */
  async unmarkFixedPaid(expenseId: string): Promise<FixedExpense[]> {
    const expenses = await this.getFixedExpenses();
    const exp = expenses.find(e => e.id === expenseId);
    if (!exp) return expenses;
    if (exp.paidTxId) {
      const txs = await this.getTransactions();
      await this.saveTransactions(txs.map(t => t.id === exp.paidTxId ? { ...t, fixedExpenseId: undefined } : t));
    }
    if (exp.lastTxId && fixedIdFromFeTxId(exp.lastTxId) !== null) await this.deleteTransaction(exp.lastTxId);
    const next = expenses.map(e => e.id !== expenseId ? e : {
      ...e, isPaid: false, paidDate: undefined, paidTxId: undefined, paidBy: undefined, lastTxId: undefined,
      paidCycleKey: undefined,
    });
    await this.saveFixedExpenses(next);
    return next;
  },

  // ── Duplicados manual/SMS ─────────────────────────────────
  async getDupIgnored(): Promise<string[]> {
    try {
      const data = await AsyncStorage.getItem(K.DUP_IGNORED);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  /** Agrega claves de par (dupPairKey) a la lista de ignorados. Sin repetidos; tope de 2000. */
  async addDupIgnored(keys: string[]): Promise<void> {
    if (keys.length === 0) return;
    try {
      const merged = Array.from(new Set([...(await this.getDupIgnored()), ...keys]));
      const trimmed = merged.length > MAX_DUP_IGNORED ? merged.slice(merged.length - MAX_DUP_IGNORED) : merged;
      await AsyncStorage.setItem(K.DUP_IGNORED, JSON.stringify(trimmed));
    } catch { }
  },

  /**
   * Une el movimiento manual al SMS (sobrevive el SMS; ver mergeManualIntoSms). El manual se borra
   * del arreglo SIN descartar su huella (no es SMS). Si el manual era el lastTxId de un gasto fijo,
   * el vínculo pasa al SMS (paidTxId = smsId, paidBy 'sms', lastTxId undefined).
   * Si alguno no existe o no son manual/SMS, no cambia nada.
   */
  async mergeDuplicate(manualId: string, smsId: string): Promise<Transaction[]> {
    const [txs, expenses, cfg] = await Promise.all([this.getTransactions(), this.getFixedExpenses(), this.getFixedCycleConfig()]);
    const manual = txs.find(t => t.id === manualId);
    const sms = txs.find(t => t.id === smsId);
    if (!manual || !sms || manualId === smsId || manual.source !== 'manual' || sms.source !== 'sms') return txs;

    let merged = mergeManualIntoSms(manual, sms, new Date().toISOString());
    const safeExpenses = Array.isArray(expenses) ? expenses : [];
    let expensesChanged = false;
    const nextExpenses = safeExpenses.map(e => {
      if (e.lastTxId !== manualId && e.paidTxId !== manualId) return e;
      expensesChanged = true;
      // El vínculo del manual con el gasto fijo manda sobre cualquier otro que traiga el SMS.
      merged = { ...merged, fixedExpenseId: e.id };
      return {
        ...e, paidTxId: smsId, paidBy: 'sms' as const, lastTxId: undefined, paidDate: sms.date,
        paidCycleKey: e.paidCycleKey ?? cycleKeyFor(cfg, sms.date) ?? undefined,
      };
    });

    const next = txs.filter(t => t.id !== manualId).map(t => t.id === smsId ? merged : t);
    await this.saveTransactions(next);
    if (expensesChanged) await this.saveFixedExpenses(nextExpenses);
    return next;
  },

  /** Separa un SMS unido (splitMerged): restaura el SMS y vuelve a crear el manual. Sin mergedFrom no cambia nada. */
  async splitDuplicate(smsId: string): Promise<Transaction[]> {
    const txs = await this.getTransactions();
    const sms = txs.find(t => t.id === smsId);
    if (!sms) return txs;
    const res = splitMerged(sms);
    if (!res) return txs;
    const hasManual = txs.some(t => t.id === res.manual.id);
    const next: Transaction[] = [];
    for (const t of txs) {
      if (t.id === smsId) {
        next.push(res.sms);
        if (!hasManual) next.push(res.manual);
      } else next.push(t);
    }
    await this.saveTransactions(next);
    // El gasto fijo que el SMS unido pagaba vuelve a figurar pagado a mano por el manual restaurado.
    try {
      const expenses = await this.getFixedExpenses();
      const relinked = relinkFixedAfterSplit(expenses, smsId, res.manual);
      if (relinked.some((e, i) => e !== expenses[i])) await this.saveFixedExpenses(relinked);
    } catch { }
    return next;
  },

  // ── Gastos fijos <-> movimientos SMS ──────────────────────
  /**
   * Une el registro manual de "marcar pagado" con el SMS del mismo pago (planFixedFusion): el manual
   * se quita (sin lápida: no es SMS) y el SMS sobrevive con el gasto fijo vinculado; si el manual era
   * el que pagaba el gasto, ahora lo paga el SMS. Sin cambios si algo no existe, el manual no es manual,
   * el SMS no es SMS o el SMS ya está unido. Una lectura y una escritura por colección.
   */
  async mergeFixedManualIntoSms(
    expenseId: string, manualId: string, smsId: string, learnKey?: string,
  ): Promise<{ transactions: Transaction[]; fixedExpenses: FixedExpense[] }> {
    const [txs, rawExpenses, cfg] = await Promise.all([this.getTransactions(), this.getFixedExpenses(), this.getFixedCycleConfig()]);
    const expenses = Array.isArray(rawExpenses) ? rawExpenses : [];
    const manual = txs.find(t => t.id === manualId);
    const sms = txs.find(t => t.id === smsId);
    const fe = expenses.find(e => e.id === expenseId);
    if (!manual || !sms || !fe || manualId === smsId
      || manual.source !== 'manual' || sms.source !== 'sms' || sms.mergedFrom) {
      return { transactions: txs, fixedExpenses: expenses };
    }
    const { merged, nextFe } = planFixedFusion(manual, sms, fe, new Date().toISOString(), cfg, learnKey);
    const nextTxs = txs.filter(t => t.id !== manualId).map(t => t.id === smsId ? merged : t);
    const nextExpenses = expenses.map(e => e.id === expenseId ? nextFe : e);
    await this.saveTransactions(nextTxs);
    await this.saveFixedExpenses(nextExpenses);
    return { transactions: nextTxs, fixedExpenses: nextExpenses };
  },

  /**
   * Vincula un movimiento SMS a un gasto fijo (elegido a mano). Resultado:
   *  - 'paid'    el SMS cae en el período actual (o uno futuro) y el gasto estaba impago: queda pagado por el SMS.
   *  - 'merged'  el gasto ya estaba pagado por un registro manual: se une al SMS (el manual desaparece).
   *  - 'history' el SMS queda vinculado como historial (período pasado, o gasto ya pagado por otro SMS).
   *  - 'already' el SMS ya era el pago vigente (o la entrada no es válida: no cambia nada).
   * Si el SMS apuntaba a OTRO gasto fijo, suelta ese vínculo (y el otro queda impago si lo pagaba este SMS).
   * opts.learn guarda el comercio en smsMatchKey; opts.updateDay mueve dayOfMonth al día local del SMS
   * (el período del SMS depende solo de su fecha). Una lectura y una escritura por colección.
   */
  async linkSmsToFixed(
    txId: string, expenseId: string, opts: { learn: boolean; updateDay?: boolean },
  ): Promise<{ transactions: Transaction[]; fixedExpenses: FixedExpense[]; outcome: 'paid' | 'merged' | 'history' | 'already' }> {
    const now = new Date();
    const [txs, rawExpenses, cfg] = await Promise.all([this.getTransactions(), this.getFixedExpenses(), this.getFixedCycleConfig()]);
    const cur = periodFor(cfg, now).key;
    const expenses = Array.isArray(rawExpenses) ? rawExpenses : [];
    const tx = txs.find(t => t.id === txId);
    const fe0 = expenses.find(e => e.id === expenseId);
    if (!tx || !fe0) return { transactions: txs, fixedExpenses: expenses, outcome: 'already' };

    const learnKey = merchantKey(merchantOfTransaction(tx));
    let fe: FixedExpense = { ...fe0 };
    if (opts.learn && learnKey) fe.smsMatchKey = learnKey;
    if (opts.updateDay) {
      const local = storedToLocalDate(tx.date);
      if (local) fe.dayOfMonth = local.getDate();
    }
    const key = cycleKeyFor(cfg, tx.date) ?? cur;

    // Suelta el vínculo con otro gasto fijo.
    const otherId = tx.fixedExpenseId && tx.fixedExpenseId !== expenseId ? tx.fixedExpenseId : null;

    let nextTxs = txs;
    let outcome: 'paid' | 'merged' | 'history' | 'already';
    const linkedTx: Transaction = { ...tx, fixedExpenseId: expenseId };
    const justLink = () => { nextTxs = txs.map(t => t.id === txId ? linkedTx : t); };

    // Registro manual de este gasto: el que lo paga hoy, o el de ese período (historial).
    const isOwnManual = (t: Transaction) =>
      t.source === 'manual' && t.type === 'expense' && !t.mergedFrom
      && (t.fixedExpenseId === fe.id || fixedIdFromFeTxId(t.id) === fe.id);
    const canFuse = tx.source === 'sms' && !tx.mergedFrom;
    const fuse = (manual: Transaction) => {
      const { merged, nextFe } = planFixedFusion(manual, tx, fe, now.toISOString(), cfg);
      fe = nextFe;
      nextTxs = txs.filter(t => t.id !== manual.id).map(t => t.id === txId ? merged : t);
    };

    if (key >= cur) {
      if (fe.paidTxId === txId) {
        outcome = 'already';
        justLink();
      } else {
        const payingManual = fe.isPaid
          ? txs.find(t => (t.id === fe.lastTxId || t.id === fe.paidTxId) && isOwnManual(t))
          : undefined;
        if (payingManual && canFuse) {
          fuse(payingManual);
          outcome = 'merged';
        } else if (fe.isPaid && fe.paidBy === 'sms' && fe.paidTxId && fe.paidTxId !== txId) {
          outcome = 'history';
          justLink();
        } else {
          fe = { ...fe, isPaid: true, paidBy: 'sms', paidTxId: txId, paidDate: tx.date, paidCycleKey: key };
          outcome = 'paid';
          justLink();
        }
      }
    } else {
      outcome = 'history';
      const periodManual = txs.find(t =>
        isOwnManual(t)
        && (normalizeCycleKey(cycleKeyFromFeTxId(t.id) ?? '', fe.dayOfMonth, cfg) ?? cycleKeyFor(cfg, t.date)) === key);
      if (periodManual && canFuse) fuse(periodManual);
      else justLink();
    }

    const finalExpenses = expenses.map(e => {
      if (e.id === expenseId) return fe;
      if (otherId && e.id === otherId && e.paidTxId === txId) {
        return {
          ...e, isPaid: false, paidDate: undefined, paidTxId: undefined, paidBy: undefined, paidCycleKey: undefined,
        };
      }
      return e;
    });
    await this.saveTransactions(nextTxs);
    await this.saveFixedExpenses(finalExpenses);
    return { transactions: nextTxs, fixedExpenses: finalExpenses, outcome };
  },

  /** Crea el gasto fijo y le vincula el SMS (linkSmsToFixed con learn: true). */
  async createFixedFromSms(
    txId: string, expense: FixedExpense,
  ): Promise<{ transactions: Transaction[]; fixedExpenses: FixedExpense[]; outcome: 'paid' | 'merged' | 'history' | 'already' }> {
    await this.addFixedExpense(expense);
    return this.linkSmsToFixed(txId, expense.id, { learn: true });
  },

  /**
   * Vincula SMS de períodos pasados a un gasto fijo (historial). Cada ítem pone fixedExpenseId en el SMS
   * y, con `manualId`, une el registro manual de ese período al SMS. No toca el gasto fijo (nunca cambia
   * isPaid del período en curso): se omiten los SMS ya vinculados a otro gasto y los manuales que pagan
   * el gasto hoy. `linked` cuenta los SMS vinculados (fusionados incluidos); `merged`, las fusiones.
   */
  async linkFixedHistory(
    expenseId: string, items: Array<{ txId: string; manualId?: string }>,
  ): Promise<{ transactions: Transaction[]; linked: number; merged: number }> {
    const [txs, rawExpenses, cfg] = await Promise.all([this.getTransactions(), this.getFixedExpenses(), this.getFixedCycleConfig()]);
    const fe = (Array.isArray(rawExpenses) ? rawExpenses : []).find(e => e.id === expenseId);
    if (!fe) return { transactions: txs, linked: 0, merged: 0 };

    const nowIso = new Date().toISOString();
    let next = txs;
    let linked = 0;
    let merged = 0;
    for (const item of items) {
      const tx = next.find(t => t.id === item.txId);
      if (!tx || (tx.fixedExpenseId && tx.fixedExpenseId !== expenseId)) continue;
      const manual = item.manualId ? next.find(t => t.id === item.manualId) : undefined;
      if (manual && manual.source === 'manual' && tx.source === 'sms' && !tx.mergedFrom
        && !manual.mergedFrom && manual.id !== fe.lastTxId && manual.id !== fe.paidTxId) {
        const res = planFixedFusion(manual, tx, fe, nowIso, cfg);
        next = next.filter(t => t.id !== manual.id).map(t => t.id === tx.id ? res.merged : t);
        merged++;
      } else {
        next = next.map(t => t.id === tx.id ? { ...t, fixedExpenseId: expenseId } : t);
      }
      linked++;
    }
    if (linked > 0) await this.saveTransactions(next);
    return { transactions: next, linked, merged };
  },

  /**
   * Desvincula un SMS de su gasto fijo. Si estaba unido a un registro manual del gasto (mergedFrom de un
   * fe_tx_), lo separa: vuelve el manual y el gasto queda pagado a mano. Si no, solo quita
   * fixedExpenseId; si el SMS era el pago vigente (paidTxId) el gasto queda impago, y si el comercio
   * coincide con smsMatchKey, este se borra.
   */
  async unlinkSmsFromFixed(
    txId: string,
  ): Promise<{ transactions: Transaction[]; fixedExpenses: FixedExpense[] }> {
    const [txs, rawExpenses] = await Promise.all([this.getTransactions(), this.getFixedExpenses()]);
    const expenses = Array.isArray(rawExpenses) ? rawExpenses : [];
    const tx = txs.find(t => t.id === txId);
    if (!tx) return { transactions: txs, fixedExpenses: expenses };

    const mf = tx.mergedFrom;
    if (mf && (fixedIdFromFeTxId(mf.id) !== null || mf.fixedExpenseId !== undefined)) {
      const res = splitMerged(tx);
      if (res) {
        const hasManual = txs.some(t => t.id === res.manual.id);
        const nextTxs: Transaction[] = [];
        for (const t of txs) {
          if (t.id === txId) {
            nextTxs.push(res.sms);
            if (!hasManual) nextTxs.push(res.manual);
          } else nextTxs.push(t);
        }
        const relinked = relinkFixedAfterSplit(expenses, txId, res.manual);
        const changed = relinked.some((e, i) => e !== expenses[i]);
        await this.saveTransactions(nextTxs);
        if (changed) await this.saveFixedExpenses(relinked);
        return { transactions: nextTxs, fixedExpenses: changed ? relinked : expenses };
      }
    }

    const fid = tx.fixedExpenseId ?? expenses.find(e => e.paidTxId === txId)?.id;
    if (!fid) return { transactions: txs, fixedExpenses: expenses };
    const key = merchantKey(merchantOfTransaction(tx));
    const nextExpenses = expenses.map(e => {
      if (e.id !== fid) return e;
      let out = e;
      if (e.paidTxId === txId) {
        out = { ...out, isPaid: false, paidDate: undefined, paidTxId: undefined, paidBy: undefined, paidCycleKey: undefined };
      }
      if (key && e.smsMatchKey === key) out = { ...out, smsMatchKey: undefined };
      return out;
    });
    const nextTxs = txs.map(t => {
      if (t.id !== txId) return t;
      const { fixedExpenseId: _removed, ...rest } = t;
      return rest as Transaction;
    });
    await this.saveTransactions(nextTxs);
    await this.saveFixedExpenses(nextExpenses);
    return { transactions: nextTxs, fixedExpenses: nextExpenses };
  },

  // ── Pares de transferencia entre cuentas propias (neutros; no mueven saldos) ──
  /** Marca salida y entrada como neutras (type/category 'transfer') con un transferPairId compartido. */
  async linkTransferPair(outId: string, inId: string): Promise<Transaction[]> {
    const txs = await this.getTransactions();
    const next = applyTransferPair(txs, outId, inId);
    if (next !== txs) await this.saveTransactions(next);
    return next;
  },

  /** Deshace el par al que pertenece txId: ambos vuelven a su type/category previos. */
  async unlinkTransferPair(txId: string): Promise<Transaction[]> {
    const txs = await this.getTransactions();
    const next = revertTransferPair(txs, txId);
    if (next !== txs) await this.saveTransactions(next);
    return next;
  },

  /** "No es un par": el par (outId, inId) no vuelve a proponerse (misma lista de ignorados que los duplicados). */
  async dismissTransferPair(outId: string, inId: string): Promise<void> {
    await this.addDupIgnored([transferPairKey(outId, inId)]);
  },

  // ── Estado de cuenta y pago de tarjeta (el pago es una transferencia neutra; nunca un gasto) ──
  /**
   * Guarda el monto REAL del estado de cuenta (por moneda) de una tarjeta. Sin Q ni USD quita el que había.
   * Solo se conservan los últimos 6 estados.
   */
  async setStatementOverride(cardId: string, cutKey: string, amounts: { Q?: number; USD?: number }): Promise<Account[]> {
    const all = await this.getAccounts();
    if (!all.some(a => a.id === cardId)) return all;
    const clean = (n: number | undefined): number | undefined =>
      typeof n === 'number' && isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : undefined;
    const q = clean(amounts.Q);
    const usd = clean(amounts.USD);
    const updated = all.map(a => {
      if (a.id !== cardId) return a;
      const rest = (a.statementOverrides ?? []).filter(o => o.cutKey !== cutKey);
      const list = q === undefined && usd === undefined
        ? rest
        : [...rest, {
            cutKey, at: new Date().toISOString(),
            ...(q !== undefined ? { Q: q } : {}), ...(usd !== undefined ? { USD: usd } : {}),
          }];
      const trimmed = list.sort((x, y) => (x.cutKey < y.cutKey ? -1 : x.cutKey > y.cutKey ? 1 : 0)).slice(-6);
      return { ...a, statementOverrides: trimmed.length > 0 ? trimmed : undefined };
    });
    await this.saveAccounts(updated);
    return updated;
  },

  /**
   * Registra el pago de una tarjeta: un movimiento por moneda (type 'transfer', category 'transfer',
   * toAccountId = la tarjeta, con `cardPayment`). Es una transferencia neutra: no suma al gasto del período.
   * El pago resta de la cuenta con la que se paga: en modo 'manual' se descuenta aquí de su saldo guardado; en
   * 'auto' lo hace el saldo derivado (Balances.accountEffect); en 'none' no hay saldo. La tarjeta nunca cambia.
   * Devuelve la lista completa de movimientos.
   */
  async registerCardPayment(p: {
    cardId: string; cutKey: string; amounts: { Q?: number; USD?: number }; fromAccountId?: string; date: Date;
  }): Promise<Transaction[]> {
    const [accounts, txs] = await Promise.all([this.getAccounts(), this.getTransactions()]);
    const card = accounts.find(a => a.id === p.cardId);
    if (!card) return txs;
    const news = buildCardPaymentTxs({
      card, cutKey: p.cutKey, amounts: p.amounts, fromAccountId: p.fromAccountId, date: p.date, idSeed: String(Date.now()),
    });
    if (news.length === 0) return txs;
    const next = [...news, ...txs];
    await this.saveTransactions(next);
    const adjusted = applyManualEffects(accounts, news);
    if (adjusted.some((a, i) => a !== accounts[i])) await this.saveAccounts(adjusted);
    return next;
  },

  /** Aplica los emparejamientos de pago de tarjeta de una sincronización (una lectura y una escritura). */
  async applyCardPaymentMatches(matches: CardPaymentMatch[]): Promise<Transaction[]> {
    const txs = await this.getTransactions();
    let next = txs;
    for (const m of matches) next = applyCardPaymentMatch(next, m).txs;
    if (next !== txs) await this.saveTransactions(next);
    return next;
  },

  /** «Sí, es el pago de mi tarjeta»: la salida pasa a ser el pago (neutro) del estado indicado. */
  async confirmCardPaymentProposal(outId: string, cardId: string, cutKey: string): Promise<Transaction[]> {
    const txs = await this.getTransactions();
    const next = applyCardPaymentProposal(txs, { outId, cardId, cutKey });
    if (next !== txs) await this.saveTransactions(next);
    return next;
  },

  /** «No»: esa salida no vuelve a proponerse como pago de esa tarjeta. */
  async dismissCardPaymentProposal(outId: string, cardId: string): Promise<void> {
    await this.addDupIgnored([cardPaymentProposalKey(outId, cardId)]);
  },

  // ── Vínculo SMS <-> cuentas (solo para mostrar; no mueve saldos) ──
  async getSmsLinkSeen(): Promise<SmsLinkSeen[]> {
    try {
      const data = await AsyncStorage.getItem(K.SMS_LINK_SEEN);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  async saveSmsLinkSeen(items: SmsLinkSeen[]): Promise<void> {
    try { await AsyncStorage.setItem(K.SMS_LINK_SEEN, JSON.stringify(items)); } catch { }
  },

  /** Vuelve a asignar cuentas a todos los movimientos SMS según los vínculos actuales. */
  async relinkAllTransactions(): Promise<Transaction[]> {
    const [txs, accounts] = await Promise.all([this.getTransactions(), this.getAccounts()]);
    const res = assignAccountsToTransactions(txs, accounts);
    if (res.txs !== txs) await this.saveTransactions(res.txs);
    return res.txs;
  },

  /**
   * Asigna (o quita, con null) la cuenta de un movimiento a mano: accountSource 'user'.
   * `suggestRule` = smsAccountHint del movimiento cuando ninguna cuenta lo usa todavía,
   * para ofrecer "Recordar: los SMS de X van a esta cuenta".
   */
  async setTransactionAccount(
    txId: string,
    accountId: string | null,
  ): Promise<{ transactions: Transaction[]; suggestRule?: string }> {
    const [txs, accounts] = await Promise.all([this.getTransactions(), this.getAccounts()]);
    const tx = txs.find(t => t.id === txId);
    if (!tx) return { transactions: txs };
    const next = txs.map(t => t.id !== txId ? t : {
      ...t, accountId: accountId ?? undefined, accountSource: 'user' as const,
    });
    await this.saveTransactions(next);
    const hint = tx.smsAccountHint;
    const taken = hint ? accounts.some(a => a.smsLinks?.includes(hint)) : true;
    return accountId && hint && !taken ? { transactions: next, suggestRule: hint } : { transactions: next };
  },

  /**
   * Asigna varios movimientos a una cuenta de una sola vez (UNA lectura y UNA escritura de
   * transacciones). accountId null = DESCARTAR: queda sin cuenta a propósito (accountId
   * undefined, accountSource 'user') y deja de aparecer como pendiente. No toca saldos ni
   * crea reglas de vínculo. Devuelve la lista completa de transacciones ya guardada.
   */
  async setTransactionsAccount(txIds: string[], accountId: string | null): Promise<Transaction[]> {
    const txs = await this.getTransactions();
    const ids = new Set(txIds);
    if (ids.size === 0) return txs;
    let changed = false;
    const next = txs.map(t => {
      if (!ids.has(t.id)) return t;
      changed = true;
      return { ...t, accountId: accountId ?? undefined, accountSource: 'user' as const };
    });
    if (!changed) return txs;
    await this.saveTransactions(next);
    return next;
  },

  /**
   * Asigna a `accountId` los movimientos sin cuenta cuyo smsAccountHint es `key`.
   * Con `remember` agrega `key` a account.smsLinks (si otra cuenta ya la tiene devuelve
   * error 'conflict' y no guarda nada). accountSource: remember ? 'rule' : 'user'.
   */
  async assignUnassignedGroup(
    key: string,
    accountId: string,
    remember: boolean,
  ): Promise<{ ok: boolean; error?: 'conflict' | 'not_found'; assigned: number; transactions: Transaction[] }> {
    const [txs, accounts] = await Promise.all([this.getTransactions(), this.getAccounts()]);
    const target = accounts.find(a => a.id === accountId);
    if (!target) return { ok: false, error: 'not_found', assigned: 0, transactions: txs };
    if (remember) {
      if (accounts.some(a => a.id !== accountId && a.isActive && a.smsLinks?.includes(key))) {
        return { ok: false, error: 'conflict', assigned: 0, transactions: txs };
      }
      if (!target.smsLinks?.includes(key)) {
        const nowIso = new Date().toISOString();
        await this.saveAccounts(accounts.map(a => a.id !== accountId ? a : {
          ...a, smsLinks: [...(a.smsLinks ?? []), key], smsLinkedAt: nowIso,
        }));
      }
    }
    let assigned = 0;
    const next = txs.map(t => {
      if (t.smsAccountHint !== key || t.accountId || t.accountSource === 'user') return t;
      assigned++;
      return { ...t, accountId, accountSource: remember ? 'rule' as const : 'user' as const };
    });
    if (assigned > 0) await this.saveTransactions(next);
    return { ok: true, assigned, transactions: next };
  },

  // ── Settings ──────────────────────────────────────────────
  async getSettings(): Promise<UserSettings> {
    try {
      const data = await AsyncStorage.getItem(K.SETTINGS);
      return data ? withSettingsDefaults(JSON.parse(data)) : DEFAULT_SETTINGS;
    } catch { return DEFAULT_SETTINGS; }
  },

  /**
   * Igual que getSettings() pero sin try/catch: los errores se propagan.
   * Usado donde una falla silenciosa sería peligrosa (ej. el gate biométrico),
   * para poder distinguir "no hay configuración guardada" de "algo falló".
   */
  async getSettingsOrThrow(): Promise<UserSettings> {
    const data = await AsyncStorage.getItem(K.SETTINGS);
    return data ? withSettingsDefaults(JSON.parse(data)) : DEFAULT_SETTINGS;
  },

  async saveSettings(s: UserSettings): Promise<void> {
    try { await AsyncStorage.setItem(K.SETTINGS, JSON.stringify(s)); } catch { }
    refreshPeriodResolver(s);
    emitSettingsChanged(s);
  },

  /**
   * Cambia el ciclo y/o el día de pago (hasta ahora solo se definían en el onboarding). Valida con
   * sanitizePaymentSchedule, guarda y reconstruye el resolvedor del período (saveSettings). Las anclas no se
   * borran: las de claves que ya no son día de pago efectivo las ignora el resolvedor.
   */
  async updatePaymentSchedule(patch: Partial<PaymentSchedule>): Promise<UserSettings> {
    const s = await this.getSettings();
    const next: UserSettings = { ...s, ...sanitizePaymentSchedule(s, patch) };
    await this.saveSettings(next);
    return next;
  },

  /** Agrega una categoría propia y devuelve los ajustes ya guardados. */
  async addCustomCategory(cat: CustomCategory): Promise<UserSettings> {
    const s = await this.getSettings();
    const next: UserSettings = { ...s, customCategories: [...(s.customCategories ?? []), cat] };
    await this.saveSettings(next);
    return next;
  },

  /** Reemplaza (por id) una categoría propia y devuelve los ajustes ya guardados. */
  async updateCustomCategory(cat: CustomCategory): Promise<UserSettings> {
    const s = await this.getSettings();
    const next: UserSettings = {
      ...s, customCategories: (s.customCategories ?? []).map(c => (c.id === cat.id ? cat : c)),
    };
    await this.saveSettings(next);
    return next;
  },

  // ── Anclas del inicio real del período ────────────────────
  async getPeriodAnchors(): Promise<PeriodAnchor[]> {
    try {
      const data = await AsyncStorage.getItem(K.PERIOD_ANCHORS);
      anchorsCache = sanitizeAnchors(data ? JSON.parse(data) : []);
    } catch { /* se conserva lo que haya en memoria */ }
    return anchorsCache;
  },

  /** Guarda las anclas, actualiza la memoria y reconstruye el resolvedor del período. */
  async savePeriodAnchors(list: PeriodAnchor[]): Promise<void> {
    anchorsCache = sanitizeAnchors(list);
    try { await AsyncStorage.setItem(K.PERIOD_ANCHORS, JSON.stringify(anchorsCache)); } catch { }
    refreshPeriodResolver(await this.getSettings());
    emitPlanInputsChanged();
  },

  /** El usuario fija a mano el inicio real del período `key` (inicio nominal): la automatización no lo revierte. */
  async setManualPeriodStart(key: string, start: string): Promise<PeriodAnchor[]> {
    const list = setManualAnchor(await this.getPeriodAnchors(), key, start, new Date().toISOString());
    await this.savePeriodAnchors(list);
    return anchorsCache;
  },

  /** Quita el inicio manual del período `key`: vuelve a regir el sueldo detectado o la fecha esperada. */
  async clearManualPeriodStart(key: string): Promise<PeriodAnchor[]> {
    const list = clearManualAnchor(await this.getPeriodAnchors(), key);
    await this.savePeriodAnchors(list);
    return anchorsCache;
  },

  // ── Migraciones de datos ──────────────────────────────────
  /**
   * Corre las migraciones pendientes (una vez cada una, idempotentes). Cada migración escribe SOLO lo que
   * cambió y, al final, registra su marca en K.MIGRATIONS: si algo falla a medias la marca no se escribe y
   * se reintenta en el siguiente arranque (los pasos son idempotentes). Para agregar otra migración, suma
   * una entrada a la lista `steps` con su id de marca.
   */
  async runMigrations(): Promise<void> {
    try {
      let done: string[] = [];
      try {
        const raw = await AsyncStorage.getItem(K.MIGRATIONS);
        const parsed = raw ? JSON.parse(raw) : [];
        done = Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
      } catch { done = []; }

      const steps: Array<{ id: string; run: () => Promise<void> }> = [
        {
          id: 'military_to_salary_v1',
          run: async () => {
            const [transactions, fixedExpenses, categoryBudgets, merchantRules, installments] = await Promise.all([
              this.getTransactions(), this.getFixedExpenses(), this.getCategoryBudgets(),
              this.getMerchantRules(), this.getCreditInstallments(),
            ]);
            const r = migrateMilitaryToSalary({ transactions, fixedExpenses, categoryBudgets, merchantRules, installments });
            if (!r.changed) return;
            // Escrituras directas (sin tragar errores): si una falla, la marca no se registra.
            if (r.changedKeys.includes('transactions')) await AsyncStorage.setItem(K.TRANSACTIONS, JSON.stringify(r.transactions));
            if (r.changedKeys.includes('fixedExpenses')) await AsyncStorage.setItem(K.FIXED_EXPENSES, JSON.stringify(r.fixedExpenses));
            if (r.changedKeys.includes('categoryBudgets')) await AsyncStorage.setItem(K.CATEGORY_BUDGETS, JSON.stringify(r.categoryBudgets));
            if (r.changedKeys.includes('merchantRules')) await AsyncStorage.setItem(K.MERCHANT_RULES, JSON.stringify(r.merchantRules));
            if (r.changedKeys.includes('installments')) await AsyncStorage.setItem(K.CREDIT_INSTALLMENTS, JSON.stringify(r.installments));
          },
        },
        {
          // Las visacuotas pasan de «una cuota por mes calendario» a «una cuota por corte de la tarjeta».
          // trackSince = ahora (no se generan cargos retroactivos) y paidOffset conserva lo ya contado.
          id: 'installments_schedule_v1',
          run: async () => {
            const [insts, accounts] = await Promise.all([this.getCreditInstallments(), this.getAccounts()]);
            const r = migrateInstallmentsSchedule(insts, accounts, new Date());
            if (r.changed) await AsyncStorage.setItem(K.CREDIT_INSTALLMENTS, JSON.stringify(r.installments));
          },
        },
        {
          // Saldos opcionales: las tarjetas no llevan saldo ('none') y el resto sigue como hoy ('manual'); nada
          // cambia para la persona salvo que elija el saldo automático.
          id: 'balance_modes_v1',
          run: async () => {
            const accounts = await this.getAccounts();
            let changed = false;
            const next = accounts.map(a => {
              if (a.balanceMode) return a;
              changed = true;
              return { ...a, balanceMode: a.type === 'credit' ? 'none' as const : 'manual' as const };
            });
            if (changed) await AsyncStorage.setItem(K.ACCOUNTS, JSON.stringify(next));
          },
        },
      ];

      for (const step of steps) {
        if (done.includes(step.id)) continue;
        await step.run();
        done = [...done, step.id];
        await AsyncStorage.setItem(K.MIGRATIONS, JSON.stringify(done));
      }
    } catch { /* se reintenta en el próximo arranque */ }
  },

  // ── Gastos Fijos ──────────────────────────────────────────
  async getFixedExpenses(): Promise<FixedExpense[]> {
    try {
      const data = await AsyncStorage.getItem(K.FIXED_EXPENSES);
      const parsed = data ? JSON.parse(data) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch { return []; }
  },

  async saveFixedExpenses(expenses: FixedExpense[]): Promise<void> {
    try { await AsyncStorage.setItem(K.FIXED_EXPENSES, JSON.stringify(expenses)); } catch { }
    emitPlanInputsChanged();
  },

  async addFixedExpense(e: FixedExpense): Promise<FixedExpense[]> {
    const all = await this.getFixedExpenses();
    const updated = [...all, e];
    await this.saveFixedExpenses(updated);
    return updated;
  },

  async updateFixedExpense(e: FixedExpense): Promise<FixedExpense[]> {
    const all = await this.getFixedExpenses();
    const updated = all.map(x => x.id === e.id ? e : x);
    await this.saveFixedExpenses(updated);
    return updated;
  },

  async deleteFixedExpense(id: string): Promise<FixedExpense[]> {
    const all = await this.getFixedExpenses();
    const updated = all.filter(e => e.id !== id);
    await this.saveFixedExpenses(updated);
    return updated;
  },

  /** Configuración del período de presupuesto de los gastos fijos según los ajustes. */
  async getFixedCycleConfig(): Promise<FixedCycleConfig> {
    return fixedCycleConfig(await this.getSettings());
  },

  /**
   * Reinicio por período (planFixedPeriodReset): un gasto sigue pagado si su paidCycleKey cubre el período
   * actual o uno futuro (pago adelantado); el resto se limpia, vínculos incluidos (no se borra ningún
   * movimiento: quedan como historial). Solo escribe si algo cambió. Idempotente.
   */
  async resetFixedExpensesForNewPeriod(now: Date = new Date()): Promise<void> {
    const [all, cfg] = await Promise.all([this.getFixedExpenses(), this.getFixedCycleConfig()]);
    const { next, changed } = planFixedPeriodReset(all, now, cfg);
    if (changed) await this.saveFixedExpenses(next);
  },

  // ── Presupuestos por Categoría ────────────────────────────
  async getCategoryBudgets(): Promise<CategoryBudget[]> {
    try {
      const data = await AsyncStorage.getItem(K.CATEGORY_BUDGETS);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async saveCategoryBudgets(budgets: CategoryBudget[]): Promise<void> {
    try { await AsyncStorage.setItem(K.CATEGORY_BUDGETS, JSON.stringify(budgets)); } catch { }
  },

  async upsertCategoryBudget(budget: CategoryBudget): Promise<CategoryBudget[]> {
    const all = await this.getCategoryBudgets();
    const exists = all.findIndex(b => b.categoryId === budget.categoryId);
    const updated = exists >= 0
      ? all.map((b, i) => i === exists ? budget : b)
      : [...all, budget];
    await this.saveCategoryBudgets(updated);
    return updated;
  },

  async deleteCategoryBudget(categoryId: string): Promise<CategoryBudget[]> {
    const all = await this.getCategoryBudgets();
    const updated = all.filter(b => b.categoryId !== categoryId);
    await this.saveCategoryBudgets(updated);
    return updated;
  },

  // ── Metas de Ahorro ───────────────────────────────────────
  async getSavingsGoals(): Promise<SavingsGoal[]> {
    try {
      const data = await AsyncStorage.getItem(K.SAVINGS_GOALS);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async saveSavingsGoals(goals: SavingsGoal[]): Promise<void> {
    try { await AsyncStorage.setItem(K.SAVINGS_GOALS, JSON.stringify(goals)); } catch { }
  },

  async addSavingsGoal(g: SavingsGoal): Promise<SavingsGoal[]> {
    const all = await this.getSavingsGoals();
    const updated = [...all, g];
    await this.saveSavingsGoals(updated);
    return updated;
  },

  async updateSavingsGoal(g: SavingsGoal): Promise<SavingsGoal[]> {
    const all = await this.getSavingsGoals();
    const updated = all.map(x => x.id === g.id ? g : x);
    await this.saveSavingsGoals(updated);
    return updated;
  },

  async deleteSavingsGoal(id: string): Promise<SavingsGoal[]> {
    const all = await this.getSavingsGoals();
    const updated = all.filter(g => g.id !== id);
    await this.saveSavingsGoals(updated);
    return updated;
  },

  // ── Cuentas ───────────────────────────────────────────────
  async getAccounts(): Promise<Account[]> {
    try {
      const data = await AsyncStorage.getItem(K.ACCOUNTS);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async saveAccounts(accounts: Account[]): Promise<void> {
    try { await AsyncStorage.setItem(K.ACCOUNTS, JSON.stringify(accounts)); } catch { }
    emitPlanInputsChanged();
  },

  async addAccount(account: Account): Promise<Account[]> {
    const all = await this.getAccounts();
    const updated = [...all, account];
    // a diferencia de saveAccounts, propaga el error
    await AsyncStorage.setItem(K.ACCOUNTS, JSON.stringify(updated));
    emitPlanInputsChanged();
    return updated;
  },

  async updateAccount(account: Account): Promise<Account[]> {
    const all = await this.getAccounts();
    const updated = all.map(a => a.id === account.id ? account : a);
    await this.saveAccounts(updated);
    return updated;
  },

  async deleteAccount(id: string): Promise<Account[]> {
    const all = await this.getAccounts();
    const updated = all.filter(a => a.id !== id);
    await this.saveAccounts(updated);
    return updated;
  },

  /** Actualiza el saldo de una cuenta */
  async adjustAccountBalance(accountId: string, delta: number): Promise<void> {
    const all = await this.getAccounts();
    const updated = all.map(a =>
      a.id === accountId ? { ...a, balance: a.balance + delta } : a
    );
    await this.saveAccounts(updated);
  },

  /**
   * «Ajustar al saldo real»: fija el saldo de la cuenta en `atIso` (ancla). Los movimientos posteriores son los
   * únicos que cuentan; en modo auto el saldo queda derivado (ancla + movimientos), en manual es el número fijado.
   */
  async setBalanceAnchor(accountId: string, amount: number, atIso: string): Promise<Account[]> {
    const all = await this.getAccounts();
    if (!isFinite(amount) || isNaN(Date.parse(atIso)) || !all.some(a => a.id === accountId)) return all;
    const updated = all.map(a => (a.id === accountId ? withBalanceAnchor(a, amount, atIso) : a));
    await this.saveAccounts(updated);
    return updated;
  },

  /**
   * Transferencia entre cuentas propias: crea UN movimiento type 'transfer' (neutro para las estadísticas) con
   * fromAccountId / toAccountId / toAmount (lo que recibe el destino si es de otra moneda). Sin validar saldo
   * (el saldo es opcional: la UI avisa solo si la cuenta origen lo lleva). En modo 'manual' ajusta el saldo
   * guardado a mano; en 'auto' el movimiento ya cuenta en el saldo derivado; en 'none' no hay saldo.
   */
  async transferBetweenAccounts(
    fromId: string, toId: string, amount: number,
    opts?: { toAmount?: number; date?: Date; description?: string },
  ): Promise<{ accounts: Account[]; transactions: Transaction[] }> {
    const [accounts, txs] = await Promise.all([this.getAccounts(), this.getTransactions()]);
    const fromAcc = accounts.find(a => a.id === fromId);
    const toAcc = accounts.find(a => a.id === toId);
    if (fromId === toId || !fromAcc || !toAcc || !isFinite(amount) || amount <= 0) return { accounts, transactions: txs };
    const crossCurrency = fromAcc.currency !== toAcc.currency;
    const toAmount = crossCurrency && typeof opts?.toAmount === 'number' && isFinite(opts.toAmount) && opts.toAmount > 0
      ? Math.round(opts.toAmount * 100) / 100 : undefined;
    const tx: Transaction = {
      id: `transfer_${Date.now()}`,
      amount,
      description: opts?.description ?? `Transferencia: ${fromAcc.name} → ${toAcc.name}`,
      category: 'transfer',
      date: (opts?.date ?? new Date()).toISOString(),
      type: 'transfer',
      source: 'manual',
      currency: fromAcc.currency,
      fromAccountId: fromId,
      toAccountId: toId,
      ...(toAmount !== undefined ? { toAmount } : {}),
    };
    const nextTxs = [tx, ...txs];
    await this.saveTransactions(nextTxs);
    const adjusted = applyManualEffects(accounts, [tx]);
    if (adjusted.some((a, i) => a !== accounts[i])) await this.saveAccounts(adjusted);
    return { accounts: adjusted, transactions: nextTxs };
  },

  /**
   * La persona registra a mano una transferencia cuyo SMS ya llegó: en vez de crear otro movimiento se une a él.
   * Llegaron los dos SMS → se emparejan; solo la salida → pasa a ser la transferencia hacia `toId`; solo la entrada →
   * pasa a ser la transferencia desde `fromId`. Un SMS sin cuenta toma la de la transferencia. Como la persona la
   * registró a propósito, las cuentas de saldo 'manual' sí se ajustan (los SMS solos no mueven ese saldo).
   */
  async joinTransferWithSms(p: {
    outId?: string; inId?: string; fromId: string; toId: string; toAmount?: number;
  }): Promise<{ accounts: Account[]; transactions: Transaction[] }> {
    const [accounts, txs] = await Promise.all([this.getAccounts(), this.getTransactions()]);
    const work = txs.map(t => {
      if (t.id === p.outId && !t.accountId) return { ...t, accountId: p.fromId };
      if (t.id === p.inId && !t.accountId) return { ...t, accountId: p.toId };
      return t;
    });
    let next: Transaction[] = work;
    if (p.outId && p.inId) {
      next = applyTransferPair(work, p.outId, p.inId);
    } else if (p.outId || p.inId) {
      const id = (p.outId ?? p.inId) as string;
      const target = work.find(t => t.id === id);
      const planned = target
        ? planAssignTransferDestination(target, p.outId ? p.toId : p.fromId, accounts, p.outId ? { toAmount: p.toAmount } : undefined)
        : null;
      if (planned) next = work.map(t => (t.id === id ? planned : t));
    }
    const changed = next.filter(t => t.type === 'transfer' && !txs.some(o => o === t));
    if (next === work || changed.length === 0) return { accounts, transactions: txs };
    await this.saveTransactions(next);
    const adjusted = applyManualEffects(accounts, changed);
    if (adjusted.some((a, i) => a !== accounts[i])) await this.saveAccounts(adjusted);
    return { accounts: adjusted, transactions: next };
  },

  /**
   * Concilia con el saldo del SMS: toda cuenta de modo auto con `smsAutoBalance` se re-ancla con el SMS más
   * reciente que traiga saldo. Devuelve un registro por cuenta cambiada (la sincronización lo guarda en el lote
   * para que «Deshacer» devuelva el ancla anterior).
   */
  async syncSmsBalances(): Promise<BalanceAnchorRecord[]> {
    const [accounts, txs] = await Promise.all([this.getAccounts(), this.getTransactions()]);
    const plan = planSmsBalanceAnchors(accounts, txs);
    if (plan.records.length > 0) await this.saveAccounts(plan.accounts);
    return plan.records;
  },

  /** «Esta transferencia fue a (o vino de) esta cuenta»: el movimiento pasa a ser una transferencia entre cuentas propias. */
  async assignTransferDestination(txId: string, accountId: string, toAmount?: number): Promise<Transaction[]> {
    const [txs, accounts] = await Promise.all([this.getTransactions(), this.getAccounts()]);
    const tx = txs.find(t => t.id === txId);
    if (!tx) return txs;
    const planned = planAssignTransferDestination(tx, accountId, accounts, { toAmount });
    if (!planned) return txs;
    const next = txs.map(t => (t.id === txId ? planned : t));
    // Los SMS no cambian el saldo guardado de una cuenta manual; las de modo auto lo derivan del movimiento.
    await this.saveTransactions(next);
    return next;
  },

  /** «A otra persona» / «Ingreso externo»: el movimiento queda como está y la pregunta no vuelve. */
  async dismissTransferQuestion(txId: string): Promise<void> {
    await this.addDupIgnored([planDismissTransferQuestion(txId)]);
  },

  // ── Visacuotas / Cuotas ───────────────────────────────────
  async getCreditInstallments(): Promise<CreditInstallment[]> {
    try {
      const data = await AsyncStorage.getItem(K.CREDIT_INSTALLMENTS);
      return data ? JSON.parse(data) : [];
    } catch { return []; }
  },

  async saveCreditInstallments(items: CreditInstallment[]): Promise<void> {
    try { await AsyncStorage.setItem(K.CREDIT_INSTALLMENTS, JSON.stringify(items)); } catch { }
    emitPlanInputsChanged();
  },

  async addCreditInstallment(item: CreditInstallment): Promise<CreditInstallment[]> {
    const all = await this.getCreditInstallments();
    // Fija trackSince/paidOffset (las que ya vienen con trackSince, como las de SMS, se respetan).
    const prepared = prepareInstallmentForSave(item, undefined, await this.getAccounts(), new Date());
    const updated = [...all, prepared];
    await this.saveCreditInstallments(updated);
    return updated;
  },

  /** Agrega una visacuota nueva (usado al convertir un movimiento existente en visacuota). Las tarjetas ya no tienen saldo propio, así que no se ajusta ningún balance. */
  async addInstallmentAndAdjustBalance(item: CreditInstallment): Promise<{ installments: CreditInstallment[]; accounts: Account[] }> {
    const installments = await this.addCreditInstallment(item);
    const accounts = await this.getAccounts();
    return { installments, accounts };
  },

  async updateCreditInstallment(item: CreditInstallment): Promise<CreditInstallment[]> {
    const all = await this.getCreditInstallments();
    const previous = all.find(x => x.id === item.id);
    // Si cambió algo que mueve el calendario o las cuotas pagadas, paidOffset se recalcula.
    const prepared = previous ? prepareInstallmentForSave(item, previous, await this.getAccounts(), new Date()) : item;
    const updated = all.map(x => x.id === item.id ? prepared : x);
    await this.saveCreditInstallments(updated);
    return updated;
  },

  /**
   * Elimina una visacuota. Los cargos que ya generó se CONSERVAN (fueron gastos reales del período) y solo
   * pierden el vínculo con ella; los que aún no se cargaban simplemente dejan de existir.
   */
  async deleteCreditInstallment(id: string): Promise<CreditInstallment[]> {
    const all = await this.getCreditInstallments();
    const target = all.find(x => x.id === id);
    if (target && (target.smsFingerprint || target.id.startsWith('sms_'))) {
      await this.addDismissedSms([target.id, target.smsFingerprint ?? ''].filter(Boolean));
    }
    const updated = all.filter(x => x.id !== id);
    await this.saveCreditInstallments(updated);
    const detached = detachInstallmentCharges(await this.getTransactions(), id);
    if (detached.changed) await this.saveTransactions(detached.txs);
    return updated;
  },

  /**
   * Genera los cargos de cuota que faltan (uno por corte cumplido de cada visacuota activa) y actualiza
   * las cuotas pagadas. Idempotente: se puede llamar en cada arranque. Una escritura por colección.
   * Los ids de cargos borrados a mano (en descartados) no se regeneran.
   */
  async syncInstallmentCharges(now: Date = new Date()): Promise<{ added: number; changed: boolean }> {
    await this.runMigrations();
    const [insts, accounts, txs, dismissed] = await Promise.all([
      this.getCreditInstallments(), this.getAccounts(), this.getTransactions(), this.getDismissedSms(),
    ]);
    if (insts.length === 0) return { added: 0, changed: false };
    const plan = planInstallmentCharges(insts, accounts, txs, dismissed, now);
    if (plan.toAdd.length > 0 || plan.twinUpdates.length > 0) {
      const twinMap = new Map(plan.twinUpdates.map(t => [t.id, t] as const));
      await this.saveTransactions([...plan.toAdd, ...txs.map(t => twinMap.get(t.id) ?? t)]);
    }
    if (plan.updates.length > 0) {
      const updMap = new Map(plan.updates.map(i => [i.id, i] as const));
      await this.saveCreditInstallments(insts.map(i => updMap.get(i.id) ?? i));
    }
    return {
      added: plan.toAdd.length,
      changed: plan.toAdd.length > 0 || plan.twinUpdates.length > 0 || plan.updates.length > 0,
    };
  },

  // ── Estado de notificaciones ──────────────────────────────
  async getNotificationState(): Promise<NotificationState> {
    try {
      const data = await AsyncStorage.getItem(K.NOTIFICATION_STATE);
      return data ? { setupNudgesShown: [], ...JSON.parse(data) } : { setupNudgesShown: [] };
    } catch { return { setupNudgesShown: [] }; }
  },

  async saveNotificationState(s: NotificationState): Promise<void> {
    try { await AsyncStorage.setItem(K.NOTIFICATION_STATE, JSON.stringify(s)); } catch { }
  },

  async markSetupNudgesShown(ids: string[]): Promise<void> {
    const prev = await this.getNotificationState();
    const setupNudgesShown = Array.from(new Set([...prev.setupNudgesShown, ...ids]));
    await this.saveNotificationState({ ...prev, setupNudgesShown });
  },

  /** Marca que ya se mostró el aviso único «tu período ahora puede empezar antes» (ver B3b). */
  async markPeriodRulesNoticeShown(): Promise<void> {
    const prev = await this.getNotificationState();
    if (prev.periodRulesNoticeShown) return;
    await this.saveNotificationState({ ...prev, periodRulesNoticeShown: true });
  },

  async setWeeklySummaryFireAt(iso: string): Promise<void> {
    const prev = await this.getNotificationState();
    await this.saveNotificationState({ ...prev, weeklySummaryFireAt: iso });
  },

  // ── Reset mensual ─────────────────────────────────────────
  async getLastResetDate(): Promise<string | null> {
    try { return await AsyncStorage.getItem(K.LAST_RESET); } catch { return null; }
  },

  async saveLastResetDate(date: string): Promise<void> {
    try { await AsyncStorage.setItem(K.LAST_RESET, date); } catch { }
  },

  async checkAndRunMonthlyReset(): Promise<boolean> {
    const now = new Date();
    // Gastos fijos: por período (idempotente, en cada carga). Visacuotas: un cargo por corte de la tarjeta
    // (idempotente; se pone al día de una vez si la app estuvo sin abrir varios cortes).
    await this.resetFixedExpensesForNewPeriod(now);
    await this.syncInstallmentCharges(now);
    const lastReset = await this.getLastResetDate();
    const nowY = now.getFullYear();
    const nowM = now.getMonth();
    const currentMonth = `${nowY}-${nowM}`;

    const match = lastReset ? /^(\d{4})-(\d{1,2})$/.exec(lastReset) : null;
    if (!match) {
      // Sin registro previo o con formato inválido.
      await this.saveLastResetDate(currentMonth);
      return true;
    }

    const lastY = Number(match[1]);
    const lastM = Number(match[2]);
    const elapsed = (nowY * 12 + nowM) - (lastY * 12 + lastM);

    if (elapsed <= 0) {
      // Reloj del dispositivo atrasado (o mismo mes): no se guarda nada.
      return false;
    }

    await this.saveLastResetDate(currentMonth);
    return true;
  },

  // ── Cargar TODO ───────────────────────────────────────────
  async loadAllData(): Promise<AppData> {
    await this.runMigrations();
    const [
      transactions, settings, fixedExpenses,
      categoryBudgets, savingsGoals, accounts,
      creditInstallments, lastResetDate, periodAnchors,
    ] = await Promise.all([
      this.getTransactions(),
      this.getSettings(),
      this.getFixedExpenses(),
      this.getCategoryBudgets(),
      this.getSavingsGoals(),
      this.getAccounts(),
      this.getCreditInstallments(),
      this.getLastResetDate(),
      this.getPeriodAnchors(),
    ]);
    void periodAnchors; // getPeriodAnchors ya dejó las anclas en memoria
    refreshPeriodResolver(settings);

    return {
      transactions,
      settings,
      fixedExpenses,
      categoryBudgets,
      savingsGoals,
      accounts,
      creditInstallments,
      lastResetDate: lastResetDate || new Date().toISOString(),
    };
  },

  // ── Onboarding: borrador, guía de primeros pasos y commit ─
  async getOnboardingDraft(): Promise<OnboardingDraft | null> {
    try {
      const data = await AsyncStorage.getItem(K.ONBOARDING_DRAFT);
      return data ? sanitizeDraft(JSON.parse(data)) : null;
    } catch { return null; }
  },

  async saveOnboardingDraft(d: OnboardingDraft): Promise<void> {
    try { await AsyncStorage.setItem(K.ONBOARDING_DRAFT, JSON.stringify(d)); } catch { }
  },

  async clearOnboardingDraft(): Promise<void> {
    try { await AsyncStorage.removeItem(K.ONBOARDING_DRAFT); } catch { }
  },

  /** Estado de la tarjeta «Guía y primeros pasos»; null si nunca se creó (usuarios anteriores al onboarding nuevo). */
  async getGettingStarted(): Promise<GettingStartedState | null> {
    try {
      const data = await AsyncStorage.getItem(K.GETTING_STARTED);
      return data ? sanitizeGettingStarted(JSON.parse(data)) : null;
    } catch { return null; }
  },

  async saveGettingStarted(s: GettingStartedState): Promise<void> {
    try { await AsyncStorage.setItem(K.GETTING_STARTED, JSON.stringify(s)); } catch { }
  },

  /** Última foto de cifras para el widget de Android; null si todavía no se guardó (o es de otra versión). */
  async getWidgetSnapshot(): Promise<WidgetSnapshot | null> {
    try {
      const data = await AsyncStorage.getItem(K.WIDGET_SNAPSHOT);
      return data ? sanitizeWidgetSnapshot(JSON.parse(data)) : null;
    } catch { return null; }
  },

  async saveWidgetSnapshot(s: WidgetSnapshot): Promise<void> {
    try { await AsyncStorage.setItem(K.WIDGET_SNAPSHOT, JSON.stringify(s)); } catch { }
  },

  /** Privacidad del widget: 'hidden' por defecto (los montos no se ven hasta tocar el ojo). */
  async getWidgetPrivacy(): Promise<WidgetPrivacy> {
    try {
      const v = await AsyncStorage.getItem(K.WIDGET_PRIVACY);
      return v === 'shown' ? 'shown' : 'hidden';
    } catch { return 'hidden'; }
  },

  async saveWidgetPrivacy(p: WidgetPrivacy): Promise<void> {
    try { await AsyncStorage.setItem(K.WIDGET_PRIVACY, p); } catch { }
  },

  /** Fusiona `p` con el estado guardado; si no existe, lo crea (con tourDeferred: true) y devuelve el resultado. */
  async patchGettingStarted(p: Partial<GettingStartedState>): Promise<GettingStartedState> {
    const cur: GettingStartedState = (await this.getGettingStarted()) ?? {
      v: 1, dismissed: false, collapsed: false, skipped: [], tourDeferred: true, createdAt: new Date().toISOString(),
    };
    const next: GettingStartedState = { ...cur, ...p, v: 1 };
    await this.saveGettingStarted(next);
    return next;
  },

  /**
   * Guarda lo que creó el onboarding. Orden: cuentas, gastos fijos, visacuotas y fuentes de ingreso (upsert por id: repetir
   * no duplica) y AL FINAL los ajustes con onboardingComplete, para que un corte a mitad deje el
   * onboarding pendiente y se pueda repetir. Incluye la fuente de ingreso principal (`onb_income_main`). Luego borra el borrador. Propaga los errores de
   * escritura en vez de tragarlos (así la pantalla puede avisar y reintentar).
   */
  async commitOnboarding(c: OnboardingCommit): Promise<void> {
    const accounts = upsertById(await readListStrict<Account>(K.ACCOUNTS), c.accounts);
    await AsyncStorage.setItem(K.ACCOUNTS, JSON.stringify(accounts));
    const fixed = upsertById(await readListStrict<FixedExpense>(K.FIXED_EXPENSES), c.fixedExpenses);
    await AsyncStorage.setItem(K.FIXED_EXPENSES, JSON.stringify(fixed));
    const inst = upsertById(await readListStrict<CreditInstallment>(K.CREDIT_INSTALLMENTS), c.installments);
    await AsyncStorage.setItem(K.CREDIT_INSTALLMENTS, JSON.stringify(inst));
    const incomes = upsertById(await readListStrict<IncomeSource>(K.INCOME_SOURCES), c.incomeSources);
    await AsyncStorage.setItem(K.INCOME_SOURCES, JSON.stringify(incomes));
    await AsyncStorage.setItem(K.SETTINGS, JSON.stringify({ ...c.settings, onboardingComplete: true }));
    refreshPeriodResolver({ ...c.settings, onboardingComplete: true });
    await this.clearOnboardingDraft();
  },

  // ── Chat del asistente ────────────────────────────────────
  /** Chat guardado del Asesor; null si no hay, está corrupto o no es la versión 1. */
  async getAssistantChat(): Promise<StoredAssistantChat | null> {
    try { return parseStoredChatJson(await AsyncStorage.getItem(K.ASSISTANT_CHAT)); } catch { return null; }
  },

  /** Guarda el chat recortado a los últimos 60 mensajes y 20 entradas del historial de Gemini. */
  async saveAssistantChat(c: StoredAssistantChat): Promise<void> {
    try { await AsyncStorage.setItem(K.ASSISTANT_CHAT, JSON.stringify(trimStoredChat(c))); } catch { }
  },

  async clearAssistantChat(): Promise<void> {
    try { await AsyncStorage.removeItem(K.ASSISTANT_CHAT); } catch { }
  },

  // ── Limpiar todo ──────────────────────────────────────────
  async clearAllData(): Promise<void> {
    try { await AsyncStorage.multiRemove(Object.values(K)); } catch { }
    anchorsCache = [];
    setPeriodStartResolver(null);
  },
};