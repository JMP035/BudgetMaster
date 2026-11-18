// Configuración de las tarjetas (módulo PURO): ¿tiene la tarjeta su día de corte y de pago?
// Sin esos días no hay fecha de pago, recordatorios, capacidad de pago, ni ciclo de la tarjeta para las
// cuotas. Sin react-native ni AsyncStorage: de ./storage solo `import type`.
import type { Account } from './storage';

const isDay = (n: unknown): boolean =>
  typeof n === 'number' && Number.isInteger(n) && n >= 1 && n <= 31;

/** Ambos días (corte y pago) son enteros entre 1 y 31. */
export function hasValidCardDates(a: Pick<Account, 'cutoffDay' | 'paymentDueDay'>): boolean {
  return isDay(a.cutoffDay) && isDay(a.paymentDueDay);
}

/** Tarjetas activas a las que les falta el día de corte o el de pago. */
export function cardsMissingDates(accounts: Account[]): Account[] {
  return accounts.filter(a => a.isActive && a.type === 'credit' && !hasValidCardDates(a));
}

/** Aviso único «configura el corte y pago» (lo programa NotificationService con el resto de avisos de configuración). */
export const CARD_DATES_NUDGE_LABEL = 'el corte y pago de tus tarjetas';
export const CARD_DATES_NUDGE_TITLE = '💳 Configura el corte y pago de tu tarjeta';

/** Cuerpo del aviso: con una tarjeta la nombra; con varias, dice cuántas son. */
export function cardDatesNudgeBody(cards: Array<{ name: string }>): string {
  const tail = 'Agrégalos en Cuentas para recibir el recordatorio de pago y ver tu capacidad de pago.';
  if (cards.length === 1) return `Tu tarjeta «${cards[0].name}» no tiene día de corte o de pago. ${tail}`;
  return `Tienes ${cards.length} tarjetas sin día de corte o de pago. ${tail}`;
}
