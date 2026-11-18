// Ciclo de una tarjeta de crédito (módulo PURO: de ./storage solo `import type`, sin regex lookbehind).
//
// «Día de corte» = el ÚLTIMO día incluido en el estado de cuenta (la fecha de «Saldo al corte»).
// El ciclo nuevo empieza el día siguiente a las 00:00. El día de corte todavía pertenece al ciclo que
// cierra: hoy, si es día de corte, sigue abierto. Sin día de corte se usa el mes calendario (equivale a
// un corte el último día de cada mes). Todas las fechas devueltas son días locales a las 12:00.
import type { Currency, Transaction } from './storage';
import { storedToLocalDate } from './FixedCycle';

/** Lo mínimo que se necesita de una tarjeta (estructural: una Account completa también sirve). */
export interface CycleCard { cutoffDay?: number; paymentDueDay?: number; }

function validDay(n: number | undefined): number | null {
  return typeof n === 'number' && isFinite(n) && n >= 1 && n <= 31 ? Math.floor(n) : null;
}

/** Número comparable del día local: AAAAMMDD. */
export function dayNum(d: Date): number {
  return d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
}

/** Día de corte efectivo: el configurado o, sin él, el último día de cada mes (mes calendario). */
export function effectiveCutoffDay(card: CycleCard): number {
  return validDay(card.cutoffDay) ?? 31;
}

/** Fecha de corte del mes `m` (0-11, admite desbordes) de `y`; el día se recorta al largo del mes. */
export function cutDate(cutoffDay: number, y: number, m: number): Date {
  const dim = new Date(y, m + 1, 0).getDate();
  const day = Math.min(Math.max(1, Math.floor(cutoffDay)), dim);
  return new Date(y, m, day, 12, 0, 0, 0);
}

/**
 * Último corte ya cerrado: el corte más reciente ANTERIOR a hoy. Si hoy es día de corte, ese día todavía
 * está abierto y el último cerrado es el del mes anterior.
 */
export function lastClosedCut(card: CycleCard, now: Date): Date {
  const day = effectiveCutoffDay(card);
  const thisCut = cutDate(day, now.getFullYear(), now.getMonth());
  return dayNum(thisCut) < dayNum(now) ? thisCut : cutDate(day, now.getFullYear(), now.getMonth() - 1);
}

/** Rango de un ciclo: del día siguiente al corte anterior hasta el corte (ambos días incluidos). */
export function cycleRange(card: CycleCard, cut: Date): { from: Date; to: Date } {
  const prev = cutDate(effectiveCutoffDay(card), cut.getFullYear(), cut.getMonth() - 1);
  return { from: new Date(prev.getFullYear(), prev.getMonth(), prev.getDate() + 1, 12, 0, 0, 0), to: cut };
}

/**
 * Fecha límite de pago de un corte: la primera aparición del día de pago ESTRICTAMENTE posterior al corte
 * (corte 9 y pago 2 → el 2 del mes siguiente; corte 10 y pago 25 → el 25 del mismo mes). null sin día de pago.
 */
export function dueDateFor(cut: Date, paymentDueDay: number | undefined): Date | null {
  const day = validDay(paymentDueDay);
  if (!day) return null;
  const same = cutDate(day, cut.getFullYear(), cut.getMonth());
  return dayNum(same) > dayNum(cut) ? same : cutDate(day, cut.getFullYear(), cut.getMonth() + 1);
}

/** Suma por moneda (gasto +, ingreso/reembolso −) de los movimientos de una tarjeta entre dos días (incluidos). */
export function sumByCurrency(
  txs: Transaction[],
  cardId: string,
  from: Date,
  to: Date,
): Array<{ currency: Currency; amount: number }> {
  const fromN = dayNum(from);
  const toN = dayNum(to);
  const totals = new Map<Currency, number>();
  for (const t of txs) {
    if (t.accountId !== cardId) continue;
    // Las transferencias (y las mitades de un par neutro) nunca son gasto del ciclo.
    if (t.type === 'transfer' || t.transferPairId) continue;
    if (t.type !== 'expense' && t.type !== 'income') continue;
    const local = storedToLocalDate(t.date);
    if (!local) continue;
    const n = dayNum(local);
    if (n < fromN || n > toN) continue;
    const cur: Currency = t.currency ?? 'Q';
    totals.set(cur, (totals.get(cur) ?? 0) + (t.type === 'expense' ? t.amount : -t.amount));
  }
  const rank = (c: Currency): number => (c === 'Q' ? 0 : c === 'USD' ? 1 : 2);
  return Array.from(totals.entries())
    .map(([currency, amount]) => ({ currency, amount: Math.round(amount * 100) / 100 }))
    .sort((a, b) => rank(a.currency) - rank(b.currency) || (a.currency < b.currency ? -1 : a.currency > b.currency ? 1 : 0));
}
