// Requisitos de los pasos del tutorial (módulo PURO, sin react-native ni AsyncStorage).
//
// Un paso que necesita algo que debe existir antes (una cuenta, una tarjeta, una fuente de ingreso, los
// SMS activos) lo declara en `requires`. Si falta, el overlay del tutorial lo dice y ofrece crearlo en ese
// momento: el tutorial nunca se queda señalando una pantalla vacía.

export type TutorialRequirement = 'bank_account' | 'credit_card' | 'income_source' | 'sms_on';

/** Lo que ya existe en los datos del usuario (lo calcula app/index.tsx). */
export interface RequirementFacts {
  hasBankAccount: boolean;
  hasCreditCard: boolean;
  hasIncomeSource: boolean;
  smsOn: boolean;
}

/** Requisito del paso que NO se cumple con los datos actuales; null si no pide nada o ya se cumple. */
export function missingRequirement(
  step: { requires?: TutorialRequirement },
  facts: RequirementFacts,
): TutorialRequirement | null {
  const req = step.requires;
  if (!req) return null;
  switch (req) {
    case 'bank_account': return facts.hasBankAccount ? null : req;
    case 'credit_card': return facts.hasCreditCard ? null : req;
    case 'income_source': return facts.hasIncomeSource ? null : req;
    case 'sms_on': return facts.smsOn ? null : req;
    default: return null;
  }
}

/** Cómo se nombra el requisito en la frase «Para este paso necesitás …». */
export function requirementLabel(req: TutorialRequirement): string {
  switch (req) {
    case 'bank_account': return 'la cuenta';
    case 'credit_card': return 'la tarjeta';
    case 'income_source': return 'una fuente de ingreso';
    case 'sms_on': return 'activar los SMS';
  }
}

/** Texto del aviso que muestra el tutorial cuando falta el requisito. */
export function requirementNoticeText(req: TutorialRequirement): string {
  return `Para este paso necesitás ${requirementLabel(req)}. El tutorial se cierra para que lo crees; abrilo de nuevo después.`;
}

/** Datos mínimos (estructurales) para calcular los hechos sin importar storage. */
export interface RequirementSources {
  accounts: Array<{ type: string; isActive: boolean }>;
  /** Fuentes de ingreso creadas (Presupuesto → Ingresos); basta una activa para cumplir el requisito. */
  incomeSources: Array<{ isActive: boolean }>;
  smsOn: boolean;
}

export function buildRequirementFacts(src: RequirementSources): RequirementFacts {
  const active = src.accounts.filter(a => a.isActive);
  return {
    hasBankAccount: active.some(a => a.type === 'bank' || a.type === 'savings'),
    hasCreditCard: active.some(a => a.type === 'credit'),
    hasIncomeSource: src.incomeSources.some(s => s.isActive),
    smsOn: src.smsOn,
  };
}
