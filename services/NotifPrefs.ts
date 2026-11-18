// Preferencias de notificaciones (módulo PURO: sin react-native ni AsyncStorage; de ./storage nada).
// Se guardan en UserSettings.notif. Los ajustes viejos no las traen: `sanitizeNotifPrefs` completa y valida.

/** Tipos de aviso que la persona puede encender o apagar. */
export type NotifKind =
  | 'fixed'             // recordatorio de gasto fijo
  | 'card_due'          // pago de tarjeta (5 días, 1 día y el mismo día)
  | 'card_cut'          // corte de tarjeta mañana
  | 'installment_last'  // última visacuota
  | 'debt_due'          // vencimiento de deudas (préstamos con día de pago)
  | 'salary'            // «Llegó tu sueldo: comprometido X, libre Y»
  | 'capacity'          // capacidad de pago de una tarjeta
  | 'period_end'        // fin del período
  | 'daily'             // resumen diario
  | 'weekly'            // resumen semanal
  | 'thresholds'        // umbrales de presupuesto y de categoría
  | 'ai';               // recordatorio del Asesor IA

export const NOTIF_KINDS: NotifKind[] = [
  'fixed', 'card_due', 'card_cut', 'installment_last', 'debt_due', 'salary',
  'capacity', 'period_end', 'daily', 'weekly', 'thresholds', 'ai',
];

export interface NotifPrefs {
  kinds: Record<NotifKind, boolean>;
  /** Hora (0-23) de los recordatorios de pagos. */
  reminderHour: number;
  dailySummary: { enabled: boolean; hour: number };
  /** Horas silenciosas: de quietStart a quietEnd (puede cruzar la medianoche). Nada suena dentro. */
  quietStart: number;
  quietEnd: number;
  /** Tope de avisos por día (los programados y los inmediatos suman). */
  maxPerDay: number;
}

function defaultKinds(): Record<NotifKind, boolean> {
  const k = {} as Record<NotifKind, boolean>;
  for (const n of NOTIF_KINDS) k[n] = true;
  return k;
}

export const DEFAULT_NOTIF_PREFS: NotifPrefs = {
  kinds: defaultKinds(),
  reminderHour: 8,
  dailySummary: { enabled: true, hour: 20 },
  quietStart: 22,
  quietEnd: 7,
  maxPerDay: 4,
};

function hourOr(v: unknown, fallback: number): number {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && n <= 23 ? Math.round(n) : fallback;
}

/** Preferencias válidas a partir de un valor guardado (tolera datos viejos, incompletos o corruptos). */
export function sanitizeNotifPrefs(raw: unknown): NotifPrefs {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<NotifPrefs> & { kinds?: Record<string, unknown> };
  const kinds = defaultKinds();
  if (r.kinds && typeof r.kinds === 'object') {
    for (const n of NOTIF_KINDS) {
      const v = (r.kinds as Record<string, unknown>)[n];
      if (typeof v === 'boolean') kinds[n] = v;
    }
  }
  const ds = (r.dailySummary && typeof r.dailySummary === 'object' ? r.dailySummary : {}) as Partial<NotifPrefs['dailySummary']>;
  const max = Number(r.maxPerDay);
  return {
    kinds,
    reminderHour: hourOr(r.reminderHour, DEFAULT_NOTIF_PREFS.reminderHour),
    dailySummary: {
      enabled: typeof ds.enabled === 'boolean' ? ds.enabled : DEFAULT_NOTIF_PREFS.dailySummary.enabled,
      hour: hourOr(ds.hour, DEFAULT_NOTIF_PREFS.dailySummary.hour),
    },
    quietStart: hourOr(r.quietStart, DEFAULT_NOTIF_PREFS.quietStart),
    quietEnd: hourOr(r.quietEnd, DEFAULT_NOTIF_PREFS.quietEnd),
    maxPerDay: Number.isFinite(max) ? Math.min(10, Math.max(1, Math.round(max))) : DEFAULT_NOTIF_PREFS.maxPerDay,
  };
}

/** ¿La hora `h` (0-23) cae en las horas silenciosas? Con inicio = fin no hay horas silenciosas. */
export function isQuietHour(h: number, prefs: Pick<NotifPrefs, 'quietStart' | 'quietEnd'>): boolean {
  const { quietStart: s, quietEnd: e } = prefs;
  if (s === e) return false;
  return s < e ? h >= s && h < e : h >= s || h < e;
}

/**
 * Mueve una fecha que cae en horas silenciosas al próximo `quietEnd` en punto (el mismo día si todavía no
 * llegó esa hora; si no, el día siguiente). Las fechas fuera de las horas silenciosas no cambian.
 */
export function adjustForQuiet(d: Date, prefs: Pick<NotifPrefs, 'quietStart' | 'quietEnd'>): Date {
  if (!isQuietHour(d.getHours(), prefs)) return d;
  const sameDay = new Date(d.getFullYear(), d.getMonth(), d.getDate(), prefs.quietEnd, 0, 0, 0);
  if (sameDay.getTime() > d.getTime()) return sameDay;
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1, prefs.quietEnd, 0, 0, 0);
}
