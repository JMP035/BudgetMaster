// Capacidad de pago (módulo PURO: de ./storage solo `import type`, sin regex lookbehind, fechas locales).
//
// Versión simple: ¿alcanza lo que tendré para pagar lo que debo hasta esa fecha?
//   recursos   = saldo de las cuentas con seguimiento + ingresos esperados ANTES de la fecha de pago
//   comprometido = estado de la tarjeta por pagar (sus cuotas ya van dentro) + gastos fijos impagos que vencen
//                  antes de esa fecha + otras deudas programadas (otras tarjetas, préstamos)
//   ratio      = comprometido / recursos        niveles: ok < 70%, aviso >= 70%, alerta >= 90%, rojo >= 100%
// Ejemplo: sueldo el 25/27, corte el 9 y pago el 2: el pago del 2 se cubre con el sueldo que llega antes, por eso
// se cuentan los ingresos esperados antes de la fecha de pago.
// Si ninguna cuenta lleva saldo, se usa el INGRESO DECLARADO que queda del período (basis 'declared') y el mensaje lo
// dice. El USD se convierte con el tipo de cambio solo para el ratio; las partes conservan sus monedas.
import type { Account, CreditInstallment, FixedExpense, IncomeSource, Transaction } from './storage';
import {
  dueDateInPeriod, isPaidForPeriod, nextPeriod, periodFor, storedToLocalDate,
} from './FixedCycle';
import type { FixedCycleConfig } from './FixedCycle';
import { cutDate, cycleRange, dayNum, effectiveCutoffDay, lastClosedCut } from './CardCycle';
import { debtsNotInFixed, scheduledDebts, statementFor, sumDebts } from './CardStatement';
import type { ScheduledDebt } from './CardStatement';
import { isBalanceTracked, withDerivedBalances } from './Balances';
import { expectedOccurrences } from './IncomeSources';
import type { PayRules } from './PayCalendar';
import { fmtDM, fmtQ } from './NotificationTexts';
import type { PeriodRange } from './NotificationTexts';

const EPS = 0.005;
const MAX_RATIO = 9.99;

export type CapacityLevel = 'ok' | 'warn' | 'alert' | 'red';
export const LEVEL_RANK: Record<CapacityLevel, number> = { ok: 0, warn: 1, alert: 2, red: 3 };

/** ratio (comprometido / recursos) -> nivel: ok < 0.7, warn >= 0.7, alert >= 0.9, red >= 1. */
export function levelOf(ratio: number): CapacityLevel {
  if (ratio >= 1) return 'red';
  if (ratio >= 0.9) return 'alert';
  if (ratio >= 0.7) return 'warn';
  return 'ok';
}

export type CapacityBasis = 'balances' | 'declared';

export interface CapacityContext {
  now: Date;
  accounts: Account[];
  txs: Transaction[];
  insts: CreditInstallment[];
  fixed: FixedExpense[];
  sources: IncomeSource[];
  /** Quetzales por dólar. */
  exchangeRate: number;
  /** Ingreso mensual declarado en Ajustes (Q). */
  monthlyIncome: number;
  payRules: PayRules;
  cycle: FixedCycleConfig;
  /** Período de pago (real, con el inicio del sueldo) que contiene a esa fecha. */
  periodAt: (d: Date) => PeriodRange & { nextStart: Date };
}

function rateOf(ctx: CapacityContext): number {
  return ctx.exchangeRate > 0 ? ctx.exchangeRate : 7.7;
}

/** Q y USD se suman (USD con el tipo de cambio); las otras monedas no entran al cálculo. */
function toQ(amount: number, currency: string, rate: number): number {
  if (currency === 'Q') return amount;
  if (currency === 'USD') return amount * rate;
  return 0;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function noon(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((Date.UTC(a.getFullYear(), a.getMonth(), a.getDate()) - Date.UTC(b.getFullYear(), b.getMonth(), b.getDate())) / 86400000);
}

// ── Recursos ───────────────────────────────────────────────────

export interface ExpectedIncomeItem { name: string; date: Date; amountQ: number; }

/** Ingresos esperados entre hoy y `until` que todavía no llegaron (las ocurrencias ya vinculadas a un depósito no cuentan). */
export function expectedIncomeUntil(ctx: CapacityContext, until: Date): { total: number; items: ExpectedIncomeItem[] } {
  const rate = rateOf(ctx);
  const today = noon(ctx.now);
  const items: ExpectedIncomeItem[] = [];
  for (const s of ctx.sources) {
    if (!s.isActive || s.frequency === 'irregular') continue;
    for (const o of expectedOccurrences(s, today, until, ctx.payRules)) {
      const linked = ctx.txs.some(t => t.incomeSourceId === s.id && t.incomeCycleKey === o.key);
      if (linked) continue;
      items.push({ name: s.name, date: o.date, amountQ: round2(toQ(s.amount, s.currency, rate)) });
    }
  }
  items.sort((a, b) => a.date.getTime() - b.date.getTime());
  return { total: round2(items.reduce((s, i) => s + i.amountQ, 0)), items };
}

/** Ingreso declarado que queda del período: lo declarado menos lo gastado (sin cargos de tarjeta: esos van en su estado). */
function declaredRemaining(ctx: CapacityContext): number {
  if (!(ctx.monthlyIncome > 0)) return 0;
  const rate = rateOf(ctx);
  const p = ctx.periodAt(ctx.now);
  const lo = dayNum(p.start);
  const hi = dayNum(p.end);
  const cards = new Set(ctx.accounts.filter(a => a.type === 'credit').map(a => a.id));
  let spent = 0;
  for (const t of ctx.txs) {
    if (t.type !== 'expense' || t.transferPairId) continue;
    if (t.accountId && cards.has(t.accountId)) continue;
    const local = storedToLocalDate(t.date);
    if (!local) continue;
    const n = dayNum(local);
    if (n < lo || n > hi) continue;
    spent += toQ(t.amount, t.currency ?? 'Q', rate);
  }
  return Math.max(0, round2(ctx.monthlyIncome - spent));
}

export interface ResourcesResult {
  resources: number;
  basis: CapacityBasis;
  /** Saldo de cuentas con seguimiento (basis 'balances'). */
  balances: number;
  /** Ingresos esperados antes de la fecha. */
  expected: number;
  /** Ingreso declarado restante (basis 'declared'). */
  declared: number;
}

/**
 * Lo que tendré disponible hasta `until`. `extraQ` es dinero que acaba de llegar y que el saldo guardado todavía no
 * incluye (solo se suma con saldos; el ingreso declarado ya lo contiene). null = no hay con qué calcular
 * (ninguna cuenta lleva saldo y no hay ingreso declarado ni fuentes esperadas).
 */
export function resourcesUntil(ctx: CapacityContext, until: Date, extraQ = 0): ResourcesResult | null {
  const rate = rateOf(ctx);
  const tracked = withDerivedBalances(ctx.accounts, ctx.txs)
    .filter(a => a.isActive && a.type !== 'credit' && a.type !== 'investment' && isBalanceTracked(a));
  const expected = expectedIncomeUntil(ctx, until).total;
  if (tracked.length > 0) {
    const balances = round2(tracked.reduce((s, a) => s + toQ(a.balance, a.currency, rate), 0));
    return {
      resources: Math.max(0, round2(balances + expected + (extraQ > 0 ? extraQ : 0))),
      basis: 'balances', balances, expected, declared: 0,
    };
  }
  if (!(ctx.monthlyIncome > 0) && !(expected > 0)) return null;
  const declared = declaredRemaining(ctx);
  // Con ingreso declarado ya está todo el ingreso del período: no se suman las fuentes (doble conteo).
  const resources = ctx.monthlyIncome > 0 ? declared : expected;
  return { resources: Math.max(0, round2(resources)), basis: 'declared', balances: 0, expected, declared };
}

// ── Comprometido ───────────────────────────────────────────────

export interface FixedDueItem { id: string; name: string; due: Date; amountQ: number; }

/** Gastos fijos activos e impagos que vencen a más tardar en `until` (los atrasados cuentan). */
export function unpaidFixedUntil(ctx: CapacityContext, until: Date): FixedDueItem[] {
  const rate = rateOf(ctx);
  const untilN = dayNum(until);
  const out: FixedDueItem[] = [];
  for (const f of ctx.fixed) {
    if (!f.isActive) continue;
    let p = periodFor(ctx.cycle, ctx.now);
    for (let i = 0; i < 4; i++) {
      if (dayNum(p.start) > untilN) break;
      const due = dueDateInPeriod(f.dayOfMonth, p, ctx.cycle);
      const paid = i === 0 && isPaidForPeriod(f, ctx.cycle, ctx.now);
      if (!paid && dayNum(due) <= untilN) {
        out.push({ id: f.id, name: f.name, due, amountQ: round2(toQ(f.amount, f.currency, rate)) });
      }
      p = nextPeriod(ctx.cycle, p);
    }
  }
  return out.sort((a, b) => a.due.getTime() - b.due.getTime());
}

export interface CommitmentsResult {
  /** Total en Q (USD convertido). */
  total: number;
  fixed: number;
  debts: number;
  debtItems: ScheduledDebt[];
  fixedItems: FixedDueItem[];
}

/** Todo lo comprometido hasta `until`: estados de tarjetas, préstamos y gastos fijos impagos (sin doble conteo). */
export function commitmentsUntil(ctx: CapacityContext, until: Date): CommitmentsResult {
  const rate = rateOf(ctx);
  const debtItems = debtsNotInFixed(scheduledDebts(ctx.accounts, ctx.insts, ctx.txs, ctx.now, until), ctx.fixed);
  const pair = sumDebts(debtItems);
  const debts = round2(pair.Q + pair.USD * rate);
  const fixedItems = unpaidFixedUntil(ctx, until);
  const fixed = round2(fixedItems.reduce((s, f) => s + f.amountQ, 0));
  return { total: round2(debts + fixed), fixed, debts, debtItems, fixedItems };
}

// ── Capacidad de una tarjeta ───────────────────────────────────

export interface CapacityParts {
  /** Lo que falta pagar del estado, por moneda. */
  statementQ: number;
  statementUSD: number;
  statementIsEstimated: boolean;
  /** Estado en Q (USD convertido). */
  statementTotal: number;
  /** Cuotas de visacuotas ya cargadas en ese ciclo: van DENTRO del estado (informativo, no se suman otra vez). */
  installmentsIncluded: number;
  fixed: number;
  otherDebts: number;
  balances: number;
  expectedIncome: number;
  declared: number;
}

export interface CapacityResult {
  cardId: string;
  cardName: string;
  /** Clave del estado evaluado (fecha del corte). */
  cutKey: string;
  due: Date;
  daysToDue: number;
  ratio: number;
  level: CapacityLevel;
  resources: number;
  committed: number;
  basis: CapacityBasis;
  parts: CapacityParts;
}

/**
 * Capacidad de pago de una tarjeta para su próximo estado con saldo: el cerrado si aún debe algo o, si no, el que viene.
 * null si no es una tarjeta activa con día de pago, no hay nada por pagar o no hay con qué calcular.
 */
export function capacityFor(card: Account, ctx: CapacityContext): CapacityResult | null {
  if (!card.isActive || card.type !== 'credit' || !(card.paymentDueDay && card.paymentDueDay >= 1)) return null;
  const rate = rateOf(ctx);
  const closed = lastClosedCut(card, ctx.now);
  const cuts = [closed, cutDate(effectiveCutoffDay(card), closed.getFullYear(), closed.getMonth() + 1)];
  let st: ReturnType<typeof statementFor> | null = null;
  for (const c of cuts) {
    const s = statementFor(card, ctx.txs, ctx.insts, ctx.now, c);
    if (!s.due) continue;
    if (s.remaining.Q + s.remaining.USD * rate > EPS) { st = s; break; }
  }
  if (!st || !st.due) return null;

  const today = noon(ctx.now);
  const until = dayNum(st.due) < dayNum(today) ? today : st.due;
  const res = resourcesUntil(ctx, until);
  if (!res) return null;

  const statementQ = st.remaining.Q;
  const statementUSD = st.remaining.USD;
  const statementTotal = round2(statementQ + statementUSD * rate);

  const allDebts = scheduledDebts(ctx.accounts, ctx.insts, ctx.txs, ctx.now, until);
  const others = debtsNotInFixed(allDebts.filter(d => d.cardId !== card.id), ctx.fixed);
  const op = sumDebts(others);
  const otherDebts = round2(op.Q + op.USD * rate);

  // Un gasto fijo con el nombre de esta tarjeta es ese mismo pago: el estado manda.
  const cardAsDebt: ScheduledDebt = {
    id: `card_${card.id}_${st.cutKey}`, kind: 'card', name: card.name, due: st.due, amounts: [], isEstimated: false,
  };
  const fixedItems = unpaidFixedUntil(ctx, until)
    .filter(f => debtsNotInFixed([cardAsDebt], [{ name: f.name, isActive: true }]).length > 0);
  const fixed = round2(fixedItems.reduce((s, f) => s + f.amountQ, 0));

  const range = cycleRange(card, st.cut);
  let installmentsIncluded = 0;
  for (const t of ctx.txs) {
    if (t.accountId !== card.id || !t.installmentId || t.type !== 'expense') continue;
    const d = storedToLocalDate(t.date);
    if (!d) continue;
    const n = dayNum(d);
    if (n >= dayNum(range.from) && n <= dayNum(range.to)) installmentsIncluded += toQ(t.amount, t.currency, rate);
  }

  const committed = round2(statementTotal + fixed + otherDebts);
  const ratio = res.resources > EPS ? Math.min(MAX_RATIO, committed / res.resources) : (committed > EPS ? MAX_RATIO : 0);
  return {
    cardId: card.id, cardName: card.name, cutKey: st.cutKey, due: st.due,
    daysToDue: dayDiff(st.due, ctx.now), ratio, level: levelOf(ratio),
    resources: res.resources, committed, basis: res.basis,
    parts: {
      statementQ, statementUSD, statementIsEstimated: st.isEstimated, statementTotal,
      installmentsIncluded: round2(installmentsIncluded), fixed, otherDebts,
      balances: res.balances, expectedIncome: res.expected, declared: res.declared,
    },
  };
}

/** Mensaje del aviso de capacidad (puro). El nivel 'ok' no se avisa. */
export function capacityMessage(cap: CapacityResult): { title: string; body: string } {
  const pct = Math.round(Math.min(cap.ratio, MAX_RATIO) * 100);
  const when = fmtDM(cap.due);
  const pay = `${fmtQ(cap.parts.statementTotal)}${cap.parts.statementIsEstimated ? ' (estimado)' : ''}`;
  let title: string;
  if (cap.level === 'red') title = `No alcanza para pagar ${cap.cardName}`;
  else if (cap.level === 'alert') title = `Pago de ${cap.cardName} casi al límite`;
  else title = `Ojo con el pago de ${cap.cardName}`;

  const parts: string[] = [];
  parts.push(`El ${when} vence ${pay}. Contando todo lo que debes hasta esa fecha (${fmtQ(cap.committed)}) usas el ${pct}% de lo que tendrás (${fmtQ(cap.resources)}).`);
  if (cap.level === 'red') parts.push(`Te faltarían ${fmtQ(Math.max(0, cap.committed - cap.resources))}.`);
  parts.push(
    cap.basis === 'declared'
      ? 'Calculado con tu ingreso declarado, porque aún no llevas saldos en tus cuentas.'
      : 'Calculado con tus saldos y los ingresos que esperas antes de esa fecha.',
  );
  return { title, body: parts.join(' ') };
}

// ── Llegó el sueldo ────────────────────────────────────────────

export interface SalaryFigures {
  /** Lo comprometido hasta el próximo pago (Q). */
  committed: number;
  /** Lo que queda libre; null si no hay con qué calcular (sin saldos ni ingreso declarado). */
  free: number | null;
  basis: CapacityBasis | null;
  /** Último día cubierto (el día anterior al próximo inicio del período). */
  until: Date;
}

/**
 * «Llegó tu sueldo»: lo comprometido hasta el próximo pago y lo que queda libre. `extraQ` = el sueldo recién
 * llegado cuando el saldo guardado todavía no lo incluye (cuentas de saldo manual o sin saldo).
 */
export function salaryFigures(ctx: CapacityContext, extraQ = 0): SalaryFigures {
  const p = ctx.periodAt(ctx.now);
  const until = new Date(p.nextStart.getFullYear(), p.nextStart.getMonth(), p.nextStart.getDate() - 1, 12, 0, 0, 0);
  const c = commitmentsUntil(ctx, until);
  const r = resourcesUntil(ctx, until, extraQ);
  return {
    committed: c.total,
    free: r ? round2(r.resources - c.total) : null,
    basis: r ? r.basis : null,
    until,
  };
}

export function salaryMessage(f: SalaryFigures): { title: string; body: string } {
  const title = 'Llegó tu sueldo';
  const hasta = `hasta el ${fmtDM(f.until)}`;
  let body: string;
  if (f.free === null) {
    body = `Comprometido ${fmtQ(f.committed)} ${hasta}, según lo registrado.`;
  } else if (f.free >= 0) {
    body = `Comprometido ${fmtQ(f.committed)}, libre ${fmtQ(f.free)} ${hasta}.`;
  } else {
    body = `Comprometido ${fmtQ(f.committed)}, te faltan ${fmtQ(Math.abs(f.free))} ${hasta}.`;
  }
  if (f.basis === 'declared') body += ' Calculado con tu ingreso declarado: aún no llevas saldos en tus cuentas.';
  return { title, body };
}
