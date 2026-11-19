// Requisitos de los pasos del tutorial (módulo PURO, sin react-native ni AsyncStorage).
//
// Un paso que necesita algo que debe existir antes (una cuenta, una tarjeta, una fuente de ingreso, los
// SMS activos) lo declara en `requires`. Si falta, el overlay del tutorial lo dice y ofrece crearlo en ese
// momento: el tutorial nunca se queda señalando una pantalla vacía.

import { hasValidCardDates } from './CardSetup';

export type TutorialRequirement = 'bank_account' | 'any_account' | 'credit_card' | 'card_dates' | 'income_source' | 'sms_on';

/** Lo que ya existe en los datos del usuario (lo calcula app/index.tsx). */
export interface RequirementFacts {
  hasBankAccount: boolean;
  hasCreditCard: boolean;
  /** Hay una tarjeta activa con su día de corte y de pago (hasValidCardDates). */
  hasCardWithDates: boolean;
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
    case 'any_account': return facts.hasBankAccount || facts.hasCreditCard ? null : req;
    case 'credit_card': return facts.hasCreditCard ? null : req;
    case 'card_dates': return facts.hasCardWithDates ? null : req;
    case 'income_source': return facts.hasIncomeSource ? null : req;
    case 'sms_on': return facts.smsOn ? null : req;
    default: return null;
  }
}

/** Cómo se nombra el requisito en la frase «Para este paso necesitas …». */
export function requirementLabel(req: TutorialRequirement): string {
  switch (req) {
    case 'bank_account': return 'la cuenta';
    case 'any_account': return 'una cuenta o tarjeta';
    case 'credit_card': return 'la tarjeta';
    case 'card_dates': return 'una tarjeta con su día de corte y de pago';
    case 'income_source': return 'una fuente de ingreso';
    case 'sms_on': return 'activar los SMS';
  }
}

/** Texto del aviso que muestra el tutorial cuando falta el requisito. */
export function requirementNoticeText(req: TutorialRequirement): string {
  return `Para este paso necesitas ${requirementLabel(req)}. El tutorial se cierra para que lo crees; ábrelo de nuevo después.`;
}

/** Datos mínimos (estructurales) para calcular los hechos sin importar storage. */
export interface RequirementSources {
  accounts: Array<{ type: string; isActive: boolean; cutoffDay?: number; paymentDueDay?: number }>;
  /** Fuentes de ingreso creadas (Presupuesto → Ingresos); basta una activa para cumplir el requisito. */
  incomeSources: Array<{ isActive: boolean }>;
  smsOn: boolean;
}

export function buildRequirementFacts(src: RequirementSources): RequirementFacts {
  const active = src.accounts.filter(a => a.isActive);
  return {
    hasBankAccount: active.some(a => a.type === 'bank' || a.type === 'savings'),
    hasCreditCard: active.some(a => a.type === 'credit'),
    hasCardWithDates: active.some(a => a.type === 'credit' && hasValidCardDates(a)),
    hasIncomeSource: src.incomeSources.some(s => s.isActive),
    smsOn: src.smsOn,
  };
}
