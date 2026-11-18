// Foto de las cifras que muestra el widget de Android (módulo PURO: de ./storage solo `import type`, sin regex
// lookbehind, fechas locales a las 12:00). Usa los MISMOS cálculos que el Dashboard y los avisos: período de pago real,
// gasto sin traslados ni pagos de tarjeta, estado de cuenta de la tarjeta, semáforo de capacidad y saldos solo de las
// cuentas que llevan seguimiento. El widget lee esta foto (la app la guarda cada vez que cambian los datos) y nunca
// recalcula: así no necesita cargar toda la app para dibujarse.
import type {
  Account, CreditInstallment, FixedExpense, IncomeSource, Transaction, UserSettings,
} from './storage';
import { capacityFor, unpaidFixedUntil } from './Capacity';
import type { CapacityContext, CapacityLevel } from './Capacity';
import { isBalanceTracked, withDerivedBalances } from './Balances';
import { scheduledDebts } from './CardStatement';
import { fixedCycleConfig } from './FixedCycle';
import { sanitizePayRules } from './PayCalendar';
import { periodSnapshot } from './NotificationTexts';
import type { PeriodRange } from './NotificationTexts';

export const WIDGET_SNAPSHOT_VERSION = 1;
/** Cuántos saldos guarda la foto (el widget mediano muestra los primeros). */
export const WIDGET_MAX_BALANCES = 6;
/** Hasta cuántos días adelante se busca el próximo pago de tarjeta y el próximo gasto fijo. */
const LOOKAHEAD_DAYS = 70;

export interface WidgetSnapshot {
  v: 1;
  /** ISO del momento en que se armó la foto. */
  updatedAt: string;
  currency: 'Q';
  /** Lo que queda disponible del período (presupuesto menos lo gastado; sin presupuesto, el ingreso declarado o registrado). */
  availablePeriod: number;
  /** Días hasta el próximo pago (0 si no aplica). */
  daysToPay: number;
  /** availablePeriod repartido entre los días que faltan. */
  availablePerDay: number;
  /** Porcentaje del presupuesto ya gastado (0 sin presupuesto). */
  budgetPct: number;
  hasBudget: boolean;
  /** Pago de tarjeta más próximo con saldo por pagar. `due` = 'AAAA-MM-DD'. */
  nextCard?: { name: string; due: string; Q: number; USD: number; estimated: boolean };
  /** Gasto fijo impago más próximo. `due` = 'AAAA-MM-DD'. */
  nextFixed?: { name: string; due: string; amount: number; currency: string };
  /** Semáforo de capacidad de pago de la tarjeta más próxima. */
  capacity?: CapacityLevel;
  /** Saldos de las cuentas que llevan seguimiento. */
  balances?: { name: string; amount: number; currency: string }[];
  /** true cuando los montos fueron borrados por privacidad (ver maskForPrivacy). */
  masked?: boolean;
}

export interface WidgetSnapshotData {
  settings: UserSettings;
  transactions: Transaction[];
  fixedExpenses: FixedExpense[];
  accounts: Account[];
  creditInstallments: CreditInstallment[];
  incomeSources: IncomeSource[];
  /** Días hasta el próximo pago (lo da el llamador: depende del ciclo y de las anclas). */
  daysLeft: number;
  /** Período de pago (real, con el inicio del sueldo) que contiene a esa fecha. */
  periodAt: (d: Date) => PeriodRange & { nextStart: Date };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 'AAAA-MM-DD' -> Date local a las 12:00 (nunca new Date('AAAA-MM-DD'), que corre un día en Guatemala). */
export function widgetDateOf(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0, 0);
}

/** 'dd/mm' de una clave 'AAAA-MM-DD'; '' si no es válida. */
export function widgetShortDate(key: string): string {
  const d = widgetDateOf(key);
  return d ? `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}` : '';
}

function noon(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

/** Arma la foto del widget con lo registrado hasta `now`. */
export function buildWidgetSnapshot(data: WidgetSnapshotData, now: Date): WidgetSnapshot {
  const { settings } = data;
  const period = data.periodAt(now);
  const daysLeft = Math.max(0, Math.round(data.daysLeft) || 0);

  // Período real: gasto sin traslados ni pagos de tarjeta (igual que el aviso diario y el briefing).
  const snap = periodSnapshot({
    settings, txs: data.transactions, categoryBudgets: [], fixed: data.fixedExpenses, now, period,
    daysLeft, labelOfCategory: id => id,
  });
  const base = snap.hasBudget ? snap.budgetLimit : (settings.monthlyIncome > 0 ? settings.monthlyIncome : snap.incomeQ);
  const availablePeriod = round2(base - snap.spentQ);
  const availablePerDay = daysLeft > 0 ? round2(availablePeriod / daysLeft) : availablePeriod;

  const out: WidgetSnapshot = {
    v: WIDGET_SNAPSHOT_VERSION,
    updatedAt: now.toISOString(),
    currency: 'Q',
    availablePeriod,
    daysToPay: daysLeft,
    availablePerDay,
    budgetPct: snap.hasBudget ? Math.max(0, snap.pct) : 0,
    hasBudget: snap.hasBudget,
  };

  const until = new Date(now.getFullYear(), now.getMonth(), now.getDate() + LOOKAHEAD_DAYS, 12, 0, 0, 0);

  // Próximo pago de tarjeta: el estado con saldo por pagar que vence primero.
  try {
    const debts = scheduledDebts(data.accounts, data.creditInstallments, data.transactions, now, until)
      .filter(x => x.kind === 'card');
    const first = debts[0];
    if (first) {
      let Q = 0;
      let USD = 0;
      for (const a of first.amounts) {
        if (a.currency === 'Q') Q = round2(Q + a.amount);
        else if (a.currency === 'USD') USD = round2(USD + a.amount);
      }
      out.nextCard = { name: first.name, due: ymd(first.due), Q, USD, estimated: first.isEstimated };
    }
  } catch { /* sin tarjeta en el widget */ }

  const ctx: CapacityContext = {
    now,
    accounts: data.accounts,
    txs: data.transactions,
    insts: data.creditInstallments,
    fixed: data.fixedExpenses,
    sources: data.incomeSources,
    exchangeRate: settings.exchangeRate,
    monthlyIncome: settings.monthlyIncome,
    payRules: sanitizePayRules(settings.payRules),
    cycle: fixedCycleConfig(settings),
    periodAt: data.periodAt,
  };

  // Próximo gasto fijo impago (los atrasados cuentan: son lo más urgente).
  try {
    const item = unpaidFixedUntil(ctx, until)[0];
    const f = item ? data.fixedExpenses.find(x => x.id === item.id) : undefined;
    if (item && f) out.nextFixed = { name: f.name, due: ymd(item.due), amount: round2(f.amount), currency: f.currency };
  } catch { /* sin gasto fijo en el widget */ }

  // Semáforo: la tarjeta con el pago más próximo (igual que el Dashboard).
  try {
    const cards = data.accounts.filter(a => a.isActive && a.type === 'credit' && !!a.cutoffDay && !!a.paymentDueDay);
    let best: { due: number; level: CapacityLevel } | null = null;
    for (const c of cards) {
      const r = capacityFor(c, ctx);
      if (r && (!best || r.due.getTime() < best.due)) best = { due: r.due.getTime(), level: r.level };
    }
    if (best) out.capacity = best.level;
  } catch { /* sin semáforo en el widget */ }

  // Saldos: solo cuentas activas con seguimiento (nunca tarjetas ni inversiones).
  const tracked = withDerivedBalances(data.accounts, data.transactions)
    .filter(a => a.isActive && a.type !== 'credit' && a.type !== 'investment' && isBalanceTracked(a));
  if (tracked.length > 0) {
    out.balances = tracked.slice(0, WIDGET_MAX_BALANCES).map(a => ({ name: a.name, amount: round2(a.balance), currency: a.currency }));
  }

  return out;
}

/**
 * Copia de la foto con TODOS los montos borrados (en cero) y `masked: true`; el widget dibuja «••••» en su lugar.
 * Quedan visibles lo que no es un monto: días, porcentaje del presupuesto, fechas, nombres y semáforo.
 */
export function maskForPrivacy(s: WidgetSnapshot): WidgetSnapshot {
  const out: WidgetSnapshot = { ...s, availablePeriod: 0, availablePerDay: 0, masked: true };
  if (s.nextCard) out.nextCard = { ...s.nextCard, Q: 0, USD: 0 };
  if (s.nextFixed) out.nextFixed = { ...s.nextFixed, amount: 0 };
  if (s.balances) out.balances = s.balances.map(b => ({ ...b, amount: 0 }));
  return out;
}

/** Valida una foto leída del disco; null si no es de esta versión. */
export function sanitizeWidgetSnapshot(raw: unknown): WidgetSnapshot | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Partial<WidgetSnapshot>;
  if (r.v !== 1 || typeof r.availablePeriod !== 'number' || typeof r.daysToPay !== 'number') return null;
  return r as WidgetSnapshot;
}
