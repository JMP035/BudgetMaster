// Textos y mapeos de la UI de notificaciones y del semáforo de capacidad (módulo PURO: sin react-native ni
// AsyncStorage; de ./storage nada, de ./Capacity solo tipos). Los componentes solo pintan lo que sale de aquí.
import type { NotifKind, NotifPrefs } from './NotifPrefs';
import type { CapacityBasis, CapacityLevel } from './Capacity';

// ── Tipos de aviso ─────────────────────────────────────────────

export const NOTIF_KIND_INFO: Record<NotifKind, { label: string; help: string }> = {
  fixed: { label: 'Gastos fijos', help: 'Te recuerda un gasto fijo 3 días antes de que venza.' },
  card_due: { label: 'Pago de tarjeta', help: '5 días antes, 1 día antes y el mismo día del pago, con lo que falta pagar.' },
  card_cut: { label: 'Corte de tarjeta', help: 'El día antes del corte: lo que compres después entra al siguiente estado.' },
  installment_last: { label: 'Última visacuota', help: 'Te avisa el día antes de que se cargue la última cuota de una compra.' },
  debt_due: { label: 'Deudas', help: 'Préstamos con día de pago: 2 días antes y el mismo día.' },
  salary: { label: 'Llegó tu sueldo', help: 'Cuando la app reconoce tu depósito: cuánto está comprometido y cuánto queda libre.' },
  capacity: { label: 'Capacidad de pago', help: 'Si el pago de una tarjeta ya compromete casi todo lo que tendrás para pagarla.' },
  period_end: { label: 'Fin de período', help: 'El día antes de que cierre tu período, con cuánto llevas gastado.' },
  daily: { label: 'Resumen diario', help: 'Un solo aviso al día con lo que registraste y cuánto te queda. Reemplaza al aviso por cada gasto.' },
  weekly: { label: 'Resumen semanal', help: 'Una vez por semana: los domingos, o el último día de tu semana si cobras semanal (ese día reemplaza al resumen diario).' },
  thresholds: { label: 'Alertas de presupuesto', help: 'Al llegar al 50 %, 80 % y 100 % del presupuesto del período o de una categoría.' },
  ai: { label: 'Recordatorio del Asesor IA', help: 'Un empujón ocasional para consultar a tu asesor.' },
};

// ── Horas ──────────────────────────────────────────────────────

function h12(h: number): number {
  const m = h % 12;
  return m === 0 ? 12 : m;
}

/** 8 -> «8:00 am», 20 -> «8:00 pm», 0 -> «12:00 am». */
export function hourLabel(h: number): string {
  return `${h12(h)}:00 ${h < 12 ? 'am' : 'pm'}`;
}

/** 8 -> «8 am», 22 -> «10 pm». */
export function hourShort(h: number): string {
  return `${h12(h)} ${h < 12 ? 'am' : 'pm'}`;
}

/** Horas ofrecidas como chips: las de `base` más la actual si no está (un valor guardado nunca queda fuera). */
export function hourOptions(base: number[], current: number): number[] {
  return base.indexOf(current) >= 0 ? base.slice() : [...base, current];
}

/** Resumen corto de las preferencias, p. ej. «Resumen diario 8:00 pm · Recordatorios 8:00 am · Silencio 10 pm–7 am». */
export function prefsSummary(p: NotifPrefs): string {
  const parts: string[] = [];
  parts.push(p.dailySummary.enabled ? `Resumen diario ${hourLabel(p.dailySummary.hour)}` : 'Sin resumen diario');
  parts.push(`Recordatorios ${hourLabel(p.reminderHour)}`);
  parts.push(p.quietStart === p.quietEnd ? 'Sin horas silenciosas' : `Silencio ${hourShort(p.quietStart)}–${hourShort(p.quietEnd)}`);
  return parts.join(' · ');
}

// ── Semáforo de capacidad de pago ──────────────────────────────

export type CapacityTone = 'green' | 'amber' | 'red';

/** ok -> verde, warn -> ámbar, alert y red -> rojo. */
export function capacityTone(level: CapacityLevel): CapacityTone {
  if (level === 'ok') return 'green';
  if (level === 'warn') return 'amber';
  return 'red';
}

export function capacityLevelLabel(level: CapacityLevel): string {
  if (level === 'ok') return 'Te alcanza';
  if (level === 'warn') return 'Ojo con este pago';
  if (level === 'alert') return 'Casi al límite';
  return 'No alcanza';
}

/** Porcentaje entero comprometido (tope 999 %). */
export function capacityPct(ratio: number): number {
  const r = isFinite(ratio) && ratio > 0 ? ratio : 0;
  return Math.round(Math.min(r, 9.99) * 100);
}

/** Texto del chip: «Capacidad de pago: 62% comprometido». */
export function capacityChipText(ratio: number): string {
  return `Capacidad de pago: ${capacityPct(ratio)}% comprometido`;
}

/** De dónde salen los recursos, dicho claro. */
export function capacityBasisText(basis: CapacityBasis): string {
  return basis === 'declared'
    ? 'Calculado con tu ingreso declarado, porque aún no llevas saldos en tus cuentas.'
    : 'Calculado con los saldos de tus cuentas y los ingresos que esperas antes de esa fecha.';
}

/** «hoy», «mañana», «en 5 días», «hace 2 días». */
export function dueInText(daysToDue: number): string {
  if (daysToDue === 0) return 'hoy';
  if (daysToDue === 1) return 'mañana';
  if (daysToDue > 1) return `en ${daysToDue} días`;
  return daysToDue === -1 ? 'ayer' : `hace ${-daysToDue} días`;
}
