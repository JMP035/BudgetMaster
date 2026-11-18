// ─────────────────────────────────────────────────────────────
// ORIGEN DEL INGRESO POR SMS (módulo PURO)
// ─────────────────────────────────────────────────────────────
// Sin react-native ni AsyncStorage. Saca del texto del SMS "de dónde viene el
// dinero" (p. ej. «SECCION DE OPERACIONES DE DEPOSITOS») para que la app pueda
// recordar cómo clasificar los depósitos del mismo origen (IncomeRules).
//
// Regex sin lookbehind ni flags s/v (Hermes).
//
// NOTA: la cuenta se lee aquí con su propia expresión y NO con extractSmsLinkSignals
// (AccountLinking): AccountLinking importa BankSmsParser y BankSmsParser importa
// IncomeRules -> IncomeOrigin, así que importarlo aquí cerraría un ciclo de módulos.
// Para los SMS reales de Banrural da el mismo valor (últimos 4 dígitos enmascarados).

/** Máximo de palabras del origen que forman la clave. */
const MAX_ORIGIN_TOKENS = 5;

/** Origen en la forma «…cuenta Monetaria *** ****5051 de ORIGEN, el 27/10/2026 …». */
const ORIGIN_AFTER_ACCOUNT_RE =
  /cuenta[^*]*\*[*\s]*\d{3,4}\s+de\s+(.+?)(?:,|\s+el\s+\d|\.\s|\.?$)/i;

/** Origen en la forma «se acreditó … en: ORIGEN». */
const ORIGIN_EN_RE = /\ben:\s*(.+?)\s*\.?\s*$/i;

/** Cuenta enmascarada: «****5051», «*** ****5051», «xx5051». */
const MASKED_ACCT_RE = /[*x]{2,}\s?(\d{4})\b/;

function flat(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

/**
 * Texto crudo de quién envía el dinero, o null si el SMS no lo dice.
 * Dos formas: «… cuenta X ***1234 de ORIGEN, el …» y «se acreditó … en: ORIGEN».
 */
export function extractIncomeOrigin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const text = raw.replace(/ /g, ' ').replace(/\s+/g, ' ').trim();
  const m = ORIGIN_AFTER_ACCOUNT_RE.exec(text) || ORIGIN_EN_RE.exec(text);
  if (!m) return null;
  const origin = m[1].trim();
  return origin.length > 0 ? origin : null;
}

/**
 * Clave estable del origen: minúsculas, sin tildes, dígitos ni signos, con las
 * primeras 5 palabras. Null si tiene menos de 4 letras (no hay de qué aprender).
 */
export function originKey(origin: string | null | undefined): string | null {
  if (!origin) return null;
  const tokens = flat(origin)
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_ORIGIN_TOKENS);
  const key = tokens.join(' ');
  if (key.replace(/\s/g, '').length < 4) return null;
  return key;
}

/** Últimos 4 dígitos de la cuenta enmascarada del SMS, o null si no hay. */
export function incomeAcctKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const m = MASKED_ACCT_RE.exec(flat(raw));
  return m ? m[1] : null;
}

/** Clave de la regla: banco | cuenta (o '*' si el SMS no la trae) | origen. */
export function incomeRuleKey(bank: string, acctKey: string | null, key: string): string {
  return `${bank}|${acctKey ?? '*'}|${key}`;
}
