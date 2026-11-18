// Tarjeta «Guía y primeros pasos» del Inicio (módulo PURO): estado persistido, checklist de lo
// pendiente y centro de ayuda con los tutoriales por módulo. Sin react-native ni AsyncStorage.

export type ChecklistId = 'tour' | 'accounts' | 'fixed' | 'sms' | 'biometric' | 'gemini';

export const CHECKLIST_IDS: ChecklistId[] = ['tour', 'accounts', 'fixed', 'sms', 'biometric', 'gemini'];

export interface GettingStartedState {
  v: 1;
  /** El usuario ocultó la tarjeta (se reabre desde Ajustes → Academia). */
  dismissed: boolean;
  collapsed: boolean;
  /** Pendientes que el usuario marcó como «No me interesa». */
  skipped: ChecklistId[];
  /** Eligió «Más tarde» en el cierre del onboarding: el recorrido no arranca solo. */
  tourDeferred: boolean;
  createdAt: string;
}

export interface ChecklistInput {
  accountsCount: number;
  fixedCount: number;
  isAndroid: boolean;
  smsOn: boolean;
  /** Hay una sincronización de SMS hecha (existe lastSyncAt). */
  smsSynced: boolean;
  biometricAvailable: boolean;
  biometricEnabled: boolean;
  geminiKey: string;
  tourDone: boolean;
  skipped: ChecklistId[];
}

export interface ChecklistItem {
  id: ChecklistId;
  title: string;
  hint: string;
  done: boolean;
  hidden: boolean;
}

/** Misma regla que ai.ts: una clave de Gemini válida tiene más de 20 caracteres. */
const MIN_GEMINI_KEY = 21;

export function buildChecklist(input: ChecklistInput): ChecklistItem[] {
  return [
    {
      id: 'tour',
      title: 'Hacer el recorrido guiado',
      hint: 'En 1 minuto ves dónde está cada cosa.',
      done: input.tourDone,
      hidden: false,
    },
    {
      id: 'accounts',
      title: 'Agregar tus cuentas y tarjetas',
      hint: 'Así el patrimonio y los saldos salen de tus cuentas.',
      done: input.accountsCount > 0,
      hidden: false,
    },
    {
      id: 'fixed',
      title: 'Registrar tus gastos fijos',
      hint: 'Renta, servicios y suscripciones: te avisamos antes de que venzan.',
      done: input.fixedCount > 0,
      hidden: false,
    },
    {
      id: 'sms',
      title: 'Activar la lectura de SMS',
      hint: 'Registra solo tus compras, débitos y abonos del banco.',
      done: input.smsSynced,
      hidden: !input.isAndroid || !input.smsOn,
    },
    {
      id: 'biometric',
      title: 'Proteger con huella o rostro',
      hint: 'Pedimos tu huella o rostro al abrir la app.',
      done: input.biometricEnabled,
      hidden: !input.biometricAvailable,
    },
    {
      id: 'gemini',
      title: 'Conectar el Asesor con Gemini',
      hint: 'Opcional: respuestas en lenguaje natural con una clave gratuita.',
      done: input.geminiKey.trim().length >= MIN_GEMINI_KEY,
      hidden: false,
    },
  ];
}

/** Pendientes visibles: ni hechos, ni ocultos, ni descartados con «No me interesa». */
export function pendingCount(items: ChecklistItem[], skipped: ChecklistId[]): number {
  return items.filter(i => !i.hidden && !i.done && !skipped.includes(i.id)).length;
}

export function isChecklistComplete(items: ChecklistItem[], skipped: ChecklistId[]): boolean {
  return pendingCount(items, skipped) === 0;
}

/** Valida un estado leído del almacenamiento; null si no tiene la forma esperada. */
export function sanitizeGettingStarted(raw: unknown): GettingStartedState | null {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (r.v !== 1) return null;
  if (typeof r.dismissed !== 'boolean' || typeof r.collapsed !== 'boolean' || typeof r.tourDeferred !== 'boolean') return null;
  if (typeof r.createdAt !== 'string') return null;
  if (!Array.isArray(r.skipped)) return null;
  const skipped = r.skipped.filter(
    (x): x is ChecklistId => typeof x === 'string' && (CHECKLIST_IDS as string[]).includes(x),
  );
  return { v: 1, dismissed: r.dismissed, collapsed: r.collapsed, skipped, tourDeferred: r.tourDeferred, createdAt: r.createdAt };
}

// ─────────────────────────────────────────────────────────────
// CENTRO DE AYUDA
// ─────────────────────────────────────────────────────────────
export interface HelpModule { tutorialId: string; label: string; requiresSms?: boolean; }

/** Ids reales de services/Tutorial.ts. */
export const HELP_MODULES: HelpModule[] = [
  { tutorialId: 'tour_inicial', label: 'Recorrido general' },
  { tutorialId: 'tutorial_inicio', label: 'Inicio' },
  { tutorialId: 'tutorial_periodo', label: 'Tu período' },
  { tutorialId: 'tutorial_sueldo', label: 'Tu sueldo' },
  { tutorialId: 'tutorial_movimientos', label: 'Movimientos' },
  { tutorialId: 'tutorial_agregar', label: 'Agregar' },
  { tutorialId: 'tutorial_presupuesto', label: 'Presupuesto' },
  { tutorialId: 'tutorial_cuentas', label: 'Cuentas' },
  { tutorialId: 'tutorial_stats', label: 'Estadísticas' },
  { tutorialId: 'tutorial_ia', label: 'Asesor' },
  { tutorialId: 'tutorial_ajustes', label: 'Ajustes' },
  { tutorialId: 'tutorial_sms', label: 'SMS', requiresSms: true },
];

export function helpModulesFor(smsOn: boolean): HelpModule[] {
  return HELP_MODULES.filter(m => smsOn || !m.requiresSms);
}
