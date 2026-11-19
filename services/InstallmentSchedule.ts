// Calendario de cargos de las visacuotas (módulo PURO: de ./storage solo `import type`).
//
// Cada visacuota se cuenta POR CUOTA en el corte de la tarjeta en que entra (no la compra completa):
// la cuota n carga un gasto fechado el día del n-ésimo corte, empezando por el primer corte >= la
// fecha de inicio. Un préstamo sin tarjeta cae el `dueDay` (o el día de la fecha de inicio) de cada mes.
// Los cargos tienen id estable `inst_<instId>_<n>`: la sincronización es idempotente.
import type { Account, CreditInstallment, Transaction } from './storage';
import { storedToLocalDate } from './FixedCycle';
import { cutDate, cycleRange, dayNum, effectiveCutoffDay } from './CardCycle';

const MAX_COUNT = 1200;

function validDay(n: number | undefined): number | null {
  return typeof n === 'number' && isFinite(n) && n >= 1 && n <= 31 ? Math.floor(n) : null;
}

/** Tarjeta de crédito de la visacuota (undefined = préstamo sin tarjeta o tarjeta que ya no existe). */
export function cardOfInstallment(inst: CreditInstallment, accounts: Account[]): Account | undefined {
  if (!inst.accountId) return undefined;
  return accounts.find(a => a.id === inst.accountId && a.type === 'credit');
}

function totalOf(inst: CreditInstallment): number {
  return Math.min(Math.max(0, Math.floor(inst.totalInstallments) || 0), MAX_COUNT);
}

/**
 * Fecha (12:00 local) del corte n-ésimo (n >= 1) de la visacuota: el primer corte >= `startDate` es el 1.º.
 * Sin tarjeta: `dueDay` o el día de `startDate`, una vez al mes. null si la fecha de inicio no es válida.
 */
export function cutForInstallment(inst: CreditInstallment, card: Account | undefined, n: number): Date | null {
  const start = storedToLocalDate(inst.startDate);
  if (!start) return null;
  const day = card ? effectiveCutoffDay(card) : (validDay(inst.dueDay) ?? start.getDate());
  const y = start.getFullYear();
  const m = start.getMonth();
  const base = dayNum(cutDate(day, y, m)) < dayNum(start) ? m + 1 : m;
  return cutDate(day, y, base + (Math.max(1, Math.floor(n)) - 1));
}

/** Cuántos cortes de la visacuota ya se cumplieron (corte <= hoy), sin pasar del total de cuotas. */
export function chargedCount(inst: CreditInstallment, card: Account | undefined, now: Date): number {
  const total = totalOf(inst);
  const today = dayNum(now);
  let count = 0;
  for (let n = 1; n <= total; n++) {
    const cut = cutForInstallment(inst, card, n);
    if (!cut || dayNum(cut) > today) break;
    count = n;
  }
  return count;
}

/** Corte de la próxima cuota (la que aún no se carga); null si ya se cargaron todas. */
export function nextInstallmentCut(inst: CreditInstallment, card: Account | undefined, now: Date): Date | null {
  const n = chargedCount(inst, card, now) + 1;
  return n <= totalOf(inst) ? cutForInstallment(inst, card, n) : null;
}

export interface InstallmentChargePlan {
  /** Cargos nuevos (gasto por cuota). */
  toAdd: Transaction[];
  /** Visacuotas con `paidInstallments` / `isActive` actualizados. */
  updates: CreditInstallment[];
  /** Movimientos SMS de gasto que ya eran el cargo de una cuota: solo se les pone installmentId/installmentNo. */
  twinUpdates: Transaction[];
}

/**
 * Plan (sin escribir nada) de los cargos que faltan. Para cada visacuota activa y con `trackSince`:
 * - por cada corte cumplido y posterior (o igual) a `trackSince` genera el gasto de la cuota, salvo que ya
 *   exista (mismo id o mismo installmentId+installmentNo) o su id esté en `dismissed`;
 * - si ya hay un SMS de gasto de la misma tarjeta, mismo monto (±0.01) y fecha dentro del ciclo de ese corte,
 *   ese SMS es el cargo: se le marca la cuota en vez de crear otro movimiento;
 * - `paidInstallments = clamp(cuotas cargadas + paidOffset)` y al llegar al total la visacuota queda inactiva;
 *   si ya pasaron todos los cortes, queda pagada por completo (total) e inactiva sin importar el offset.
 */
export function planInstallmentCharges(
  insts: CreditInstallment[],
  accounts: Account[],
  txs: Transaction[],
  dismissed: Iterable<string>,
  now: Date,
): InstallmentChargePlan {
  const dismissedSet = new Set<string>(dismissed);
  const haveIds = new Set<string>();
  const haveNo = new Set<string>();
  for (const t of txs) {
    haveIds.add(t.id);
    if (t.installmentId && t.installmentNo) haveNo.add(`${t.installmentId}#${t.installmentNo}`);
  }
  const usedTwins = new Set<string>();
  const toAdd: Transaction[] = [];
  const updates: CreditInstallment[] = [];
  const twinUpdates: Transaction[] = [];

  for (const inst of insts) {
    if (!inst.isActive || !inst.trackSince) continue;
    const trackLocal = storedToLocalDate(inst.trackSince);
    if (!trackLocal) continue;
    const trackN = dayNum(trackLocal);
    const card = cardOfInstallment(inst, accounts);
    const total = totalOf(inst);
    const count = chargedCount(inst, card, now);

    for (let n = 1; n <= count; n++) {
      const cut = cutForInstallment(inst, card, n);
      if (!cut || dayNum(cut) < trackN) continue;
      const id = `inst_${inst.id}_${n}`;
      if (haveIds.has(id) || dismissedSet.has(id) || haveNo.has(`${inst.id}#${n}`)) continue;

      if (card) {
        const range = cycleRange(card, cut);
        const fromN = dayNum(range.from);
        const toN = dayNum(range.to);
        const twin = txs.find(t => {
          if (usedTwins.has(t.id) || t.source !== 'sms' || t.type !== 'expense' || t.installmentId) return false;
          if (t.transferPairId || t.accountId !== card.id || t.currency !== inst.currency) return false;
          if (Math.round(Math.abs(t.amount - inst.monthlyPayment) * 100) > 1) return false;
          const local = storedToLocalDate(t.date);
          if (!local) return false;
          const dn = dayNum(local);
          return dn >= fromN && dn <= toN;
        });
        if (twin) {
          usedTwins.add(twin.id);
          haveNo.add(`${inst.id}#${n}`);
          twinUpdates.push({ ...twin, installmentId: inst.id, installmentNo: n });
          continue;
        }
      }

      const charge: Transaction = {
        id,
        amount: inst.monthlyPayment,
        description: `Cuota ${n}/${inst.totalInstallments} · ${inst.name}`,
        category: inst.category,
        date: cut.toISOString(),
        type: 'expense',
        source: 'manual',
        currency: inst.currency,
        installmentId: inst.id,
        installmentNo: n,
      };
      if (card) charge.accountId = card.id;
      toAdd.push(charge);
      haveIds.add(id);
      haveNo.add(`${inst.id}#${n}`);
    }

    // Ya pasaron todos los cortes: no queda nada por cargar y la visacuota termina (sin esto, una migrada con
    // paidOffset negativo quedaba «zombi»: 2/6 y activa para siempre porque ya no hay cortes futuros).
    const paid = total > 0 && count >= total
      ? total
      : Math.min(total, Math.max(0, count + (inst.paidOffset ?? 0)));
    const isActive = paid < total;
    if (paid !== inst.paidInstallments || isActive !== inst.isActive) {
      updates.push({ ...inst, paidInstallments: paid, isActive });
    }
  }
  return { toAdd, updates, twinUpdates };
}

/**
 * Migración 'installments_schedule_v1': a las visacuotas existentes (sin `trackSince`) les pone
 * trackSince = ahora y paidOffset = pagadas − cuotas ya cargadas hoy, para no regenerar ni perder lo
 * contado antes. Idempotente: las que ya tienen trackSince no se tocan.
 */
export function migrateInstallmentsSchedule(
  insts: CreditInstallment[],
  accounts: Account[],
  now: Date,
): { installments: CreditInstallment[]; changed: boolean } {
  let changed = false;
  const installments = insts.map(i => {
    if (i.trackSince !== undefined) return i;
    changed = true;
    const card = cardOfInstallment(i, accounts);
    return { ...i, trackSince: now.toISOString(), paidOffset: i.paidInstallments - chargedCount(i, card, now) };
  });
  return { installments: changed ? installments : insts, changed };
}

function stripInstallmentMark(t: Transaction): Transaction {
  const { installmentId: _i, installmentNo: _n, ...rest } = t;
  return rest;
}

/**
 * Deshacer una visacuota importada: borra los cargos que ella generó (movimientos manuales con su
 * installmentId) y a los SMS que eran su gemelo les quita la marca. Puro. `changed`: algo se modificó.
 */
export function dropInstallmentCharges(
  txs: Transaction[],
  instIds: Set<string>,
): { txs: Transaction[]; removed: number; changed: boolean } {
  if (instIds.size === 0) return { txs, removed: 0, changed: false };
  let removed = 0;
  let changed = false;
  const out: Transaction[] = [];
  for (const t of txs) {
    if (t.installmentId === undefined || !instIds.has(t.installmentId)) { out.push(t); continue; }
    changed = true;
    if (t.source === 'manual') { removed++; continue; }
    out.push(stripInstallmentMark(t));
  }
  return { txs: changed ? out : txs, removed, changed };
}

/**
 * Borrar una visacuota CONSERVA los cargos ya generados (fueron gastos reales): solo pierden el vínculo
 * (installmentId/installmentNo) con la visacuota que se elimina. Puro.
 */
export function detachInstallmentCharges(txs: Transaction[], instId: string): { txs: Transaction[]; changed: boolean } {
  if (!txs.some(t => t.installmentId === instId)) return { txs, changed: false };
  return { txs: txs.map(t => (t.installmentId === instId ? stripInstallmentMark(t) : t)), changed: true };
}

/**
 * Prepara una visacuota para guardarla (nueva o editada): fija `trackSince` y `paidOffset`.
 * - Nueva con cuotas ya pagadas: empieza a contar desde ahora y `paidOffset` hace que `paidInstallments`
 *   sea justo lo que indicó la persona. Nueva sin pagadas: cuenta desde la fecha de inicio.
 * - Ya con `trackSince` (SMS, onboarding): se respeta tal cual.
 * - Editada: conserva `trackSince`; si cambió algo que mueve el calendario o las cuotas pagadas,
 *   recalcula `paidOffset` para que `paidInstallments` siga siendo lo que se escribió.
 */
export function prepareInstallmentForSave(
  item: CreditInstallment,
  existing: CreditInstallment | undefined,
  accounts: Account[],
  now: Date,
): CreditInstallment {
  const card = cardOfInstallment(item, accounts);
  if (!existing) {
    if (item.trackSince !== undefined) return item;
    if (item.paidInstallments > 0) {
      return {
        ...item, trackSince: now.toISOString(),
        paidOffset: item.paidInstallments - chargedCount(item, card, now),
      };
    }
    return { ...item, trackSince: item.startDate, paidOffset: 0 };
  }
  const base: CreditInstallment = {
    ...item,
    trackSince: item.trackSince ?? existing.trackSince,
    paidOffset: item.paidOffset ?? existing.paidOffset,
  };
  if (base.trackSince === undefined) return base;
  const moved = existing.paidInstallments !== item.paidInstallments
    || existing.startDate !== item.startDate
    || existing.accountId !== item.accountId
    || existing.totalInstallments !== item.totalInstallments
    || (existing.dueDay ?? 0) !== (item.dueDay ?? 0);
  if (!moved) return base;
  return { ...base, paidOffset: item.paidInstallments - chargedCount(item, card, now) };
}
