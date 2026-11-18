// ─────────────────────────────────────────────────────────────
// FUENTES DE INGRESO (módulo PURO)
// ─────────────────────────────────────────────────────────────
// Sin react-native ni AsyncStorage: de ./storage solo `import type`. La persistencia vive en
// StorageService (getIncomeSources / linkIncome / unlinkIncome) y el cableado de SMS en SmsService.
//
// Una fuente de ingreso es «de dónde y cuándo me pagan» (sueldo, pago quincenal, venta semanal,
// aguinaldo...). Su patrón se APRENDE de un SMS de ejemplo (banco, cuenta, quién envía y monto), no se
// asume ninguna profesión. Con la fuente la app puede: reconocer el depósito de cada ciclo (matchIncome),
// decir si ya llegó o se atrasó (sourceStatus), mover el inicio del período al día real del sueldo (ancla
// automática) y sugerir el ingreso mensual real (incomeDeltaSuggestion).
//
// Regex sin lookbehind ni flags s/v (Hermes). Fechas locales a las 12:00.

import type { IncomePattern, IncomeRule, IncomeSource, Transaction, UserSettings } from './storage';
import { classifyBankSms, maskSmsForDiagnostics } from './BankSmsParser';
import { extractIncomeOrigin, incomeAcctKey, originKey } from './IncomeOrigin';
import { incomeKeyOfTx, incomeOriginLabelOfTx, upsertIncomeRule } from './IncomeRules';
import { adjustPayDate, DEFAULT_PAY_RULES, parseYmd, ymd } from './PayCalendar';
import type { PayRules } from './PayCalendar';
import { buildStartResolver, removeAnchorsForTx, upsertAutoAnchor } from './PeriodAnchors';
import type { PeriodAnchor } from './PeriodAnchors';
import { effectiveDay, storedToLocalDate } from './FixedCycle';

/** Tolerancia de monto (%) con que se aprende un patrón nuevo (los centavos cambian de un mes a otro). */
export const DEFAULT_TOLERANCE_PCT = 1.5;

/** Puntaje mínimo para vincular solo (auto) y para proponerlo al usuario. */
export const AUTO_SCORE = 80;
export const PROPOSAL_SCORE = 45;

const LEARNABLE_KINDS = ['transfer_in', 'deposit', 'payroll'];

function dayNumOf(d: Date): number {
  return Math.round(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / 86400000);
}

function addDays(d: Date, n: number): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n, 12, 0, 0, 0);
}

function noon(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12, 0, 0, 0);
}

// ═════════════ Aprender el patrón desde un SMS ═════════════

export interface IncomePatternPreview {
  bank: string;
  acctKey: string | null;
  originLabel: string | null;
  amount: number;
  currency: string;
  /** 'YYYY-MM-DD' del día que dice el SMS (o en que llegó). */
  date: string;
  /** Día del mes de ese depósito (1..31): sugerencia para `days`. */
  day: number;
  /** Día de la semana (0=domingo) de ese depósito: sugerencia para fuentes semanales. */
  weekday: number;
  kind: string;
}

export type LearnPatternResult =
  | { ok: true; pattern: IncomePattern; preview: IncomePatternPreview }
  | { ok: false; reason: 'not_income' | 'no_amount' | 'not_bank' };

/**
 * Aprende el patrón de una fuente desde un SMS de ingreso (cualquier banco): banco, cuenta enmascarada,
 * quién envía y monto. Usa el mismo motor que la importación, así que lo que se aprende es exactamente lo
 * que después se reconoce. El texto se guarda enmascarado (sin dígitos de cuenta).
 */
export function learnPatternFromSms(body: string, receivedAt?: number, nowIso?: string): LearnPatternResult {
  const c = classifyBankSms({ body, receivedAt });
  if (c.kind === 'not_bank' || c.kind === 'phishing') return { ok: false, reason: 'not_bank' };
  if (c.accepted && (c.txType !== 'income' || LEARNABLE_KINDS.indexOf(c.kind) < 0)) {
    return { ok: false, reason: 'not_income' };
  }
  if (c.amount === null || !(c.amount > 0)) return { ok: false, reason: 'no_amount' };
  if (!c.accepted) return { ok: false, reason: 'not_income' };

  const origin = extractIncomeOrigin(body);
  const key = originKey(origin);
  const acctKey = incomeAcctKey(body);
  const bank = (c.bank || 'Banco').toUpperCase();
  const pattern: IncomePattern = {
    bank,
    ...(acctKey ? { acctKey } : {}),
    ...(key ? { originKey: key, originLabel: (origin as string).replace(/\s+/g, ' ').trim() } : {}),
    amount: c.amount,
    tolerancePct: DEFAULT_TOLERANCE_PCT,
    learnedAt: nowIso ?? new Date().toISOString(),
    sampleMasked: maskSmsForDiagnostics(body),
  };
  const when = c.occurredAt;
  return {
    ok: true,
    pattern,
    preview: {
      bank, acctKey: acctKey ?? null, originLabel: pattern.originLabel ?? null,
      amount: c.amount, currency: c.currency, date: ymd(when), day: when.getDate(),
      weekday: when.getDay(), kind: c.kind,
    },
  };
}

// ═════════════ Ocurrencias esperadas ═════════════

export interface IncomeOccurrence {
  /** Fecha NOMINAL del pago ('YYYY-MM-DD'): la clave del ciclo. */
  key: string;
  /** Fecha en que se espera de verdad (fin de semana / feriado ya ajustados). */
  date: Date;
}

function rulesFor(source: IncomeSource, rules: PayRules): PayRules {
  return source.weekendRule ? { ...rules, weekendRule: source.weekendRule } : rules;
}

/**
 * Ocurrencias de la fuente cuya fecha esperada cae entre `from` y `to` (inclusive, por día). Mensual y
 * quincenal usan los días del mes (recortados al largo del mes), semanal el día de la semana (0-6).
 * Con `months` solo cuentan esos meses (extras: 7 = bono 14, 12 = aguinaldo). Irregular no tiene
 * ocurrencias fijas.
 */
export function expectedOccurrences(source: IncomeSource, from: Date, to: Date, rules: PayRules): IncomeOccurrence[] {
  if (source.frequency === 'irregular') return [];
  const r = rulesFor(source, rules);
  const fromN = dayNumOf(from);
  const toN = dayNumOf(to);
  const months = Array.isArray(source.months) && source.months.length > 0 ? source.months : null;
  const out: IncomeOccurrence[] = [];
  const seen: Record<string, boolean> = {};

  const push = (nominal: Date) => {
    if (months && months.indexOf(nominal.getMonth() + 1) < 0) return;
    const key = ymd(nominal);
    if (seen[key]) return;
    seen[key] = true;
    const adj = adjustPayDate(nominal, r);
    const n = dayNumOf(adj);
    if (n < fromN || n > toN) return;
    out.push({ key, date: adj });
  };

  const days = Array.isArray(source.days) ? source.days : [];
  if (source.frequency === 'weekly') {
    const wd = Math.round(Number(days[0]));
    if (!(wd >= 0 && wd <= 6)) return [];
    // Margen de 8 días a cada lado: el ajuste por fin de semana puede mover el pago hasta 7 días.
    for (let i = -8; i <= toN - fromN + 8; i++) {
      const dt = addDays(noon(from), i);
      if (dt.getDay() === wd) push(dt);
    }
  } else {
    const list = Array.from(new Set(days.map(Number).filter(n => n >= 1 && n <= 31).map(n => Math.round(n))));
    const totalMonths = (to.getFullYear() - from.getFullYear()) * 12 + (to.getMonth() - from.getMonth()) + 3;
    for (let k = 0; k < totalMonths; k++) {
      const ref = new Date(from.getFullYear(), from.getMonth() - 1 + k, 1, 12, 0, 0, 0);
      for (const d of list) {
        push(new Date(ref.getFullYear(), ref.getMonth(), effectiveDay(d, ref.getFullYear(), ref.getMonth()), 12, 0, 0, 0));
      }
    }
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

// ═════════════ Reconocer un depósito ═════════════

export interface IncomeMatch {
  sourceId: string;
  sourceName: string;
  /** Clave del ciclo (fecha nominal 'YYYY-MM-DD'); la fecha del movimiento si no cae cerca de ningún pago. */
  occKey: string;
  score: number;
  /** true = se puede vincular solo; false = solo proponer al usuario. */
  auto: boolean;
  reasons: string[];
}

export interface IncomeProposal extends IncomeMatch {
  txId: string;
}

interface Scored { source: IncomeSource; score: number; originOk: boolean; amountPts: number; reasons: string[]; occKey: string }

function scoreSource(
  source: IncomeSource, tx: Transaction, txDate: Date, rules: PayRules,
  txBank: string, txAcct: string | null, txOrigin: string | null,
): Scored | null {
  const r = rulesFor(source, rules);
  const reasons: string[] = [];
  let score = 0;
  let originOk = false;
  let amountPts = 0;
  const pat = source.pattern;
  if (pat) {
    if (txBank && txBank === (pat.bank || '').toUpperCase()) { score += 20; reasons.push('banco'); }
    // Si ni el patrón ni el SMS traen cuenta, "coinciden" (hay bancos que no la muestran).
    if ((pat.acctKey || null) === txAcct) { score += 25; reasons.push('cuenta'); }
    if (pat.originKey && txOrigin) {
      if (pat.originKey !== txOrigin) return null;   // viene de otro lado conocido: no es esta fuente
      score += 30; originOk = true; reasons.push('origen');
    }
  }
  const ref = pat && pat.amount > 0 ? pat.amount : source.amount;
  if (ref > 0) {
    const tol = pat && pat.tolerancePct > 0 ? pat.tolerancePct : DEFAULT_TOLERANCE_PCT;
    const diffPct = Math.abs(tx.amount - ref) / ref * 100;
    if (diffPct <= tol) { amountPts = 20; reasons.push('monto'); }
    else if (diffPct <= 10) { amountPts = 8; reasons.push('monto aproximado'); }
    score += amountPts;
  }
  // Fecha: ocurrencia más cercana (hasta ±7 días) y si cae dentro de la tolerancia del calendario.
  let occKey = ymd(txDate);
  const occs = expectedOccurrences(source, addDays(txDate, -9), addDays(txDate, 9), r);
  let bestDist = 999;
  for (const o of occs) {
    const dist = Math.abs(dayNumOf(o.date) - dayNumOf(txDate));
    if (dist < bestDist) { bestDist = dist; occKey = o.key; }
  }
  if (bestDist > 7) occKey = ymd(txDate);
  else if (bestDist <= Math.max(0, r.toleranceDays)) { score += 5; reasons.push('fecha'); }
  return { source, score, originOk, amountPts, reasons, occKey };
}

/**
 * ¿A qué fuente pertenece este ingreso? Puntaje: banco 20 + cuenta 25 + origen 30 + monto (dentro de la
 * tolerancia 20; hasta 10% 8) + fecha (dentro de la tolerancia de una ocurrencia 5). Auto desde 80 (y solo
 * si coincide el origen y el monto está a menos de 10%); propuesta desde 45. Gana el mejor; si dos fuentes
 * empatan solo se propone. Los movimientos que no son ingreso o ya son parte de una transferencia no
 * participan. Si el SMS dice de quién viene y no es el origen aprendido, esa fuente se descarta.
 */
export function matchIncome(tx: Transaction, sources: IncomeSource[], rules: PayRules): IncomeMatch | null {
  if (tx.type !== 'income' || tx.transferPairId || !(tx.amount > 0)) return null;
  const txDate = storedToLocalDate(tx.date);
  if (!txDate) return null;
  const txBank = (tx.bank || '').toUpperCase();
  const txAcct = incomeAcctKey(tx.originalSMS);
  const txOrigin = originKey(extractIncomeOrigin(tx.originalSMS));

  const scored: Scored[] = [];
  for (const s of sources) {
    if (!s.isActive || (s.currency && tx.currency && s.currency !== tx.currency)) continue;
    const sc = scoreSource(s, tx, txDate, rules, txBank, txAcct, txOrigin);
    if (sc && sc.score >= PROPOSAL_SCORE) scored.push(sc);
  }
  if (scored.length === 0) return null;
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];
  const tie = scored.length > 1 && scored[1].score === best.score;
  const auto = !tie && best.score >= AUTO_SCORE && best.originOk && best.amountPts > 0;
  return {
    sourceId: best.source.id, sourceName: best.source.name, occKey: best.occKey,
    score: best.score, auto, reasons: best.reasons,
  };
}

// ═════════════ Estado de la fuente ═════════════

export type IncomeStatus = 'received' | 'expected' | 'late' | 'none';

export interface IncomeSourceStatus {
  status: IncomeStatus;
  occurrence: IncomeOccurrence | null;
  /** Movimiento vinculado que cubre esa ocurrencia (si llegó). */
  tx: Transaction | null;
  /** Monto real recibido (si llegó). */
  amount: number | null;
}

const EXTRA_WINDOW_DAYS = 31;

function latestLinked(txs: Transaction[], sourceId: string, key: string): Transaction | null {
  let best: Transaction | null = null;
  for (const t of txs) {
    if (t.incomeSourceId !== sourceId || t.incomeCycleKey !== key) continue;
    if (!best || Date.parse(t.date) > Date.parse(best.date)) best = t;
  }
  return best;
}

/**
 * Estado del ciclo vigente de la fuente: 'received' (ya llegó), 'expected' (aún no toca o está dentro de la
 * tolerancia), 'late' (pasó la tolerancia y no llegó) o 'none' (sin ocurrencia que vigilar: irregular sin
 * pagos del mes, o un extra fuera de su temporada).
 */
export function sourceStatus(
  source: IncomeSource, txs: Transaction[], now: Date, rules: PayRules = DEFAULT_PAY_RULES,
): IncomeSourceStatus {
  const none: IncomeSourceStatus = { status: 'none', occurrence: null, tx: null, amount: null };
  const done = (o: IncomeOccurrence, t: Transaction): IncomeSourceStatus =>
    ({ status: 'received', occurrence: o, tx: t, amount: t.amount });

  if (source.frequency === 'irregular') {
    let best: Transaction | null = null;
    for (const t of txs) {
      if (t.incomeSourceId !== source.id) continue;
      const d = storedToLocalDate(t.date);
      if (!d || d.getFullYear() !== now.getFullYear() || d.getMonth() !== now.getMonth()) continue;
      if (!best || Date.parse(t.date) > Date.parse(best.date)) best = t;
    }
    return best ? { status: 'received', occurrence: null, tx: best, amount: best.amount } : none;
  }

  const r = rulesFor(source, rules);
  const todayN = dayNumOf(now);
  // Los ciclos anteriores a la creación de la fuente no cuentan como atrasados (salvo que ya estén vinculados).
  const createdN = source.createdAt && !isNaN(Date.parse(source.createdAt)) ? dayNumOf(new Date(source.createdAt)) : null;
  const occs = expectedOccurrences(source, addDays(noon(now), -45), addDays(noon(now), 45), r).filter(o =>
    createdN === null || dayNumOf(o.date) >= createdN || !!latestLinked(txs, source.id, o.key));
  const past = occs.filter(o => dayNumOf(o.date) <= todayN);
  const future = occs.filter(o => dayNumOf(o.date) > todayN);
  const cur = past.length > 0 ? past[past.length - 1] : null;
  const next = future.length > 0 ? future[0] : null;
  const isExtra = source.role === 'extra';

  if (next) {
    const early = latestLinked(txs, source.id, next.key);
    if (early) return done(next, early);
  }
  if (cur) {
    const t = latestLinked(txs, source.id, cur.key);
    if (t) return done(cur, t);
    const lateDays = todayN - dayNumOf(cur.date);
    if (!(isExtra && lateDays > EXTRA_WINDOW_DAYS)) {
      const status: IncomeStatus = lateDays <= Math.max(0, r.toleranceDays) ? 'expected' : 'late';
      return { status, occurrence: cur, tx: null, amount: null };
    }
  }
  if (next && !(isExtra && dayNumOf(next.date) - todayN > EXTRA_WINDOW_DAYS)) {
    return { status: 'expected', occurrence: next, tx: null, amount: null };
  }
  return none;
}

// ═════════════ Ingreso base mensual ═════════════

function toQ(amount: number, currency: string, rate: number): number {
  if (currency === 'USD') return amount * (rate > 0 ? rate : 7.7);
  return amount;
}

/** Último monto realmente recibido de la fuente (por fecha) o, si aún no llegó nada, el declarado. */
function latestAmount(source: IncomeSource, txs: Transaction[]): number {
  let best: Transaction | null = null;
  for (const t of txs) {
    if (t.incomeSourceId !== source.id) continue;
    if (!best || Date.parse(t.date) > Date.parse(best.date)) best = t;
  }
  return best ? best.amount : source.amount;
}

/** Promedio mensual de lo recibido en los 3 últimos meses con pagos (o el monto declarado si no hay). */
function irregularAverage(source: IncomeSource, txs: Transaction[]): number {
  const perMonth: Record<string, number> = {};
  for (const t of txs) {
    if (t.incomeSourceId !== source.id) continue;
    const d = storedToLocalDate(t.date);
    if (!d) continue;
    const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    perMonth[k] = (perMonth[k] || 0) + t.amount;
  }
  const keys = Object.keys(perMonth).sort().slice(-3);
  if (keys.length === 0) return source.amount > 0 ? source.amount : 0;
  return keys.reduce((s, k) => s + perMonth[k], 0) / keys.length;
}

/**
 * Ingreso base mensual REAL en Q: mensual = lo último recibido (o lo declarado), quincenal ×2, semanal
 * ×52/12 e irregular = promedio de los últimos 3 meses con pagos. Los extras (aguinaldo, bono 14) y las
 * fuentes inactivas NO cuentan. `rate` = quetzales por dólar.
 */
export function baseMonthlyIncome(sources: IncomeSource[], txs: Transaction[], rate: number): number {
  let total = 0;
  for (const s of sources) {
    if (!s.isActive || s.role !== 'base') continue;
    let monthly: number;
    if (s.frequency === 'irregular') monthly = irregularAverage(s, txs);
    else {
      const per = latestAmount(s, txs);
      monthly = s.frequency === 'biweekly' ? per * 2 : s.frequency === 'weekly' ? per * 52 / 12 : per;
    }
    total += toQ(monthly, s.currency, rate);
  }
  return Math.round(total * 100) / 100;
}

export interface IncomeDeltaSuggestion {
  suggested: number;
  current: number;
  diffPct: number;
}

/**
 * Si el ingreso base real difiere en más de 5% del `monthlyIncome` de los ajustes, sugiere actualizarlo.
 * null si no hay fuentes base con monto o la diferencia es pequeña.
 */
export function incomeDeltaSuggestion(
  settings: Pick<UserSettings, 'monthlyIncome' | 'exchangeRate'>, sources: IncomeSource[], txs: Transaction[],
): IncomeDeltaSuggestion | null {
  const real = baseMonthlyIncome(sources, txs, settings.exchangeRate);
  if (!(real > 0)) return null;
  const current = Number(settings.monthlyIncome) > 0 ? Number(settings.monthlyIncome) : 0;
  const diffPct = current > 0 ? Math.abs(real - current) / current * 100 : 100;
  if (diffPct <= 5) return null;
  return { suggested: real, current, diffPct: Math.round(diffPct * 10) / 10 };
}

// ═════════════ Vincular un ingreso a su fuente (plan puro) ═════════════

export interface IncomeLinkPlan {
  tx: Transaction;
  prevCategory: string;
  incomeRules: IncomeRule[];
  anchors: PeriodAnchor[];
  /** Clave del ancla automática creada (si se movió el período). */
  anchorKey?: string;
}

type ScheduleSettings = Pick<UserSettings, 'paymentCycle' | 'paymentDay' | 'paymentDays'> & { payRules?: PayRules };

/**
 * Ancla automática del inicio del período para un ingreso base vinculado, o null si no corresponde: solo
 * fuentes base con `anchorsPeriod`, ciclo mensual/quincenal, `payRules.autoAnchor` y un pago real a
 * ±toleranceDays del día nominal que de verdad es un día de pago configurado.
 */
export function anchorForIncome(
  tx: Transaction, source: IncomeSource, occKey: string, settings: ScheduleSettings, rules: PayRules, nowIso: string,
): PeriodAnchor | null {
  if (source.role !== 'base' || !source.anchorsPeriod || !rules.autoAnchor) return null;
  if (source.frequency !== 'monthly' && source.frequency !== 'biweekly') return null;
  const nominal = parseYmd(occKey);
  const txDate = storedToLocalDate(tx.date);
  if (!nominal || !txDate) return null;
  const tol = Math.min(7, Math.max(0, rules.toleranceDays));
  if (Math.abs(dayNumOf(txDate) - dayNumOf(nominal)) > tol) return null;
  const candidate: PeriodAnchor = {
    key: occKey, start: ymd(txDate), source: 'auto', txId: tx.id, sourceId: source.id, at: nowIso,
  };
  // El resolvedor decide: solo vale si la clave es un día de pago efectivo del ciclo de los ajustes.
  const r = buildStartResolver({ ...settings, payRules: rules }, [candidate])(occKey);
  return r && r.source === 'salary' ? candidate : null;
}

/**
 * Plan (sin escribir nada) para vincular `tx` a `source` en el ciclo `occKey`: fija la categoría de la fuente,
 * aprende la regla del origen (solo fuentes base: un extra comparte origen con el sueldo y no debe pisar su
 * categoría) y, si corresponde, crea el ancla automática del período.
 */
export function planIncomeLink(input: {
  tx: Transaction; source: IncomeSource; occKey: string; settings: ScheduleSettings; rules: PayRules;
  incomeRules: IncomeRule[]; anchors: PeriodAnchor[]; nowIso: string;
}): IncomeLinkPlan {
  const { tx, source, occKey, settings, rules, nowIso } = input;
  const prevCategory = tx.category;
  let incomeRules = input.incomeRules;
  const ruleKey = source.role === 'base' ? incomeKeyOfTx(tx) : null;
  if (ruleKey) {
    const label = incomeOriginLabelOfTx(tx) ?? source.pattern?.originLabel ?? source.name;
    incomeRules = upsertIncomeRule(incomeRules, ruleKey, label, source.category, nowIso)
      .map(r => (r.key === ruleKey ? { ...r, sourceId: source.id } : r));
  }
  let anchors = removeAnchorsForTx(input.anchors, tx.id);
  const anchor = anchorForIncome(tx, source, occKey, settings, rules, nowIso);
  if (anchor) anchors = upsertAutoAnchor(anchors, anchor);
  const linked: Transaction = {
    ...tx, category: source.category, incomeSourceId: source.id, incomeCycleKey: occKey,
    // Sin regla que lo sostenga, la revisión de SMS volvería a proponer otra categoría: se marca como elegida.
    ...(!ruleKey && source.role === 'base' ? { categoryEditedAt: nowIso } : {}),
  };
  return { tx: linked, prevCategory, incomeRules, anchors, ...(anchor ? { anchorKey: anchor.key } : {}) };
}

// ═════════════ Lectura segura de lo guardado ═════════════

/** Lista válida de fuentes a partir de lo guardado (descarta entradas mal formadas). */
export function sanitizeIncomeSources(raw: unknown): IncomeSource[] {
  if (!Array.isArray(raw)) return [];
  const out: IncomeSource[] = [];
  for (const s of raw) {
    if (!s || typeof s !== 'object') continue;
    const x = s as Partial<IncomeSource>;
    if (typeof x.id !== 'string' || !x.id || typeof x.name !== 'string') continue;
    const freq = x.frequency;
    if (freq !== 'monthly' && freq !== 'biweekly' && freq !== 'weekly' && freq !== 'irregular') continue;
    const amount = Number(x.amount);
    out.push({
      ...x,
      id: x.id,
      name: x.name,
      category: typeof x.category === 'string' && x.category ? x.category : 'salary',
      amount: Number.isFinite(amount) && amount >= 0 ? amount : 0,
      currency: x.currency ?? 'Q',
      frequency: freq,
      days: Array.isArray(x.days) ? x.days.map(Number).filter(n => Number.isFinite(n)) : [],
      role: x.role === 'extra' ? 'extra' : 'base',
      anchorsPeriod: !!x.anchorsPeriod,
      isActive: x.isActive !== false,
      createdAt: typeof x.createdAt === 'string' ? x.createdAt : '',
    } as IncomeSource);
  }
  return out;
}
