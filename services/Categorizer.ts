// ─────────────────────────────────────────────────────────────
// SERVICIO DE CATEGORIZACIÓN CENTRALIZADO
// ─────────────────────────────────────────────────────────────
// Contiene las reglas unificadas de emparejamiento de comercios,
// detección de categorías y limpieza de descripciones para
// consumo manual, SMS y asesoría conversacional.
//
// Módulo PURO: sin imports de React Native ni de storage. Lo usa el motor de
// parseo de SMS (BankSmsParser) que se prueba con `npm run test:sms`.

export interface CategorizationResult {
  category: string;
  smartDescription: string;
}

export const SUBSCRIPTIONS_MERCHANTS: { name: string; keyword: string }[] = [
  { name: "Netflix", keyword: "netflix" },
  { name: "Spotify", keyword: "spotify" },
  { name: "Disney+", keyword: "disney" },
  { name: "HBO Max", keyword: "hbo" },
  { name: "YouTube Premium", keyword: "youtube premium" },
  { name: "Amazon Prime Video", keyword: "prime video" },
  { name: "Paramount+", keyword: "paramount" },
  { name: "Crunchyroll", keyword: "crunchyroll" },
  { name: "Google One / Play", keyword: "google" },
  { name: "Apple Services", keyword: "apple" },
  { name: "Microsoft 365", keyword: "microsoft" },
  { name: "Dropbox", keyword: "dropbox" },
  { name: "Adobe Creative Cloud", keyword: "adobe" },
];

/** Normaliza el texto quitando acentos y caracteres especiales para búsquedas más estables */
export function normalizeText(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/(.)\1+/g, "$1");
}

/**
 * Minúsculas, sin tildes y con espacios colapsados. A diferencia de
 * normalizeText NO colapsa letras repetidas ("pizza" sigue siendo "pizza") ni
 * borra puntuación, así que sirve para reglas con palabras completas.
 */
export function flatText(text: string): string {
  return text.toLowerCase()
    .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Texto para evaluar reglas de comercio: solo letras/dígitos/espacios y . & (para max.com, h&m). */
function ruleText(text: string): string {
  return flatText(text).replace(/[^a-z0-9\s&.]/g, " ").replace(/\s+/g, " ").trim();
}

// ─────────────────────────────────────────────────────────────
// CATEGORÍAS DE GASTO
// ─────────────────────────────────────────────────────────────

const wb = (src: string): RegExp => new RegExp("\\b(?:" + src + ")\\b");

interface ExpenseRule { category: string; re: RegExp; merchantOnly?: boolean }

// El orden importa: gana la primera regla que coincide.
const EXPENSE_RULES: ExpenseRule[] = [
  { category: "food", re: wb("uber\\s*eats|pedidos\\s*ya|hugo app|hugo|rappi") },
  { category: "food", re: wb("pizza|mcdon\\w*|burger|campero|pollo (?:granjero|brujo)|kfc|subway|domino\\w*|wendy\\w*|little caesars|taco bell|starbucks|barista|dunkin|sushi|tacos|restaurante?|cafe|cafeteria|comedor|irtra") },
  { category: "groceries", re: wb("walmart|despensa|paiz|la torre|pricesmart|super ?24|supermercado|maxi despensa|econosuper|super del barrio") },
  { category: "fuel", re: wb("gasolinera|estacion de serv|est de serv|shell|texaco|puma|esso|redipsa|zeta gas") },
  { category: "fuel", re: wb("uno"), merchantOnly: true },
  { category: "transport", re: wb("uber|indriver|yango|taxi|parqueo|parking|transmetro|tu muni") },
  { category: "streaming", re: wb("netflix|spotify|disney|hbo|max\\.com|youtube|prime video|paramount|crunchyroll|vix") },
  { category: "subscriptions", re: wb("google one|google storage|icloud|apple\\.com|microsoft|openai|chatgpt|dropbox|adobe|canva") },
  { category: "entertainment", re: wb("steam|playstation|xbox|nintendo|cine|cinepolis|cinemark|games?") },
  { category: "pharmacy", re: wb("farmacia|galeno|meykos|cruz verde|batres|kielsa|carolina|similares?") },
  { category: "health", re: wb("hospital|medico|doctor|clinica|laboratorio|radiologia|sanatorio|dental") },
  { category: "shopping", re: wb("amazon|amzn|ebay|aliexpress|shein|temu|mercado ?libre|pacifiko|cemaco|siman|elektra|curacao|max|tienda") },
  { category: "clothes", re: wb("zara|bershka|pull ?& ?bear|h&m|cuadra|payless|ropa") },
  { category: "internet", re: wb("tigo|claro|telgua|movistar|fibernet|cable"), },
  { category: "internet", re: wb("internet"), merchantOnly: true },
  { category: "utilities", re: wb("eegsa|energuate|empagua|electricidad|agua|luz|municipalidad") },
  { category: "travel", re: wb("hotel|airbnb|avianca|volaris|copa|united|american airlines|aeropuerto|booking") },
  { category: "education", re: wb("colegio|universidad|usac|url|umg|udv|academia|curso") },
];

// Palabras demasiado comunes para fiarse de ellas cuando NO hay comercio
// (texto completo del SMS): "claro", "internet" (banca por internet), "uno".
const FALLBACK_SKIP = /\b(?:claro|uno)\b/g;

/**
 * Categoría de un gasto. Evalúa las reglas sobre `comercio + ubicación`; solo
 * si no hay comercio usa `fallbackFlat` (texto del SMS ya sin boilerplate).
 */
export function categorizeExpense(merchant: string | null, location: string | null, fallbackFlat: string): string {
  const hasMerchant = !!merchant && merchant.trim().length > 0;
  let text = hasMerchant ? ruleText(`${merchant} ${location ?? ""}`) : ruleText(fallbackFlat);
  if (!hasMerchant) text = text.replace(FALLBACK_SKIP, " ");
  for (const rule of EXPENSE_RULES) {
    if (rule.merchantOnly && !hasMerchant) continue;
    if (rule.re.test(text)) return rule.category;
  }
  return "other";
}

/**
 * Categoría de un ingreso. `flat` debe venir ya normalizado (minúsculas, sin
 * tildes). Nunca devuelve 'salary' por defecto: solo si el texto lo dice.
 */
export function categorizeIncome(flat: string, kind: "deposit" | "transfer_in" | "payroll" | "refund"): string {
  if (/\b(?:mindef|ministerio de la defensa|ejercito|militar)\b/.test(flat)) return "military";
  if (/\b(?:planilla|nomina|salario|sueldo)\b/.test(flat)) return "salary";
  if (/\b(?:aguinaldo|bono ?14|bonificacion|bono)\b/.test(flat)) return "bonus";
  if (kind === "transfer_in") return "transfer_in";
  if (/\b(?:honorarios|freelance)\b/.test(flat)) return "freelance";
  return "other";
}

/**
 * Detecta la categoría de una transacción basado en su texto y tipo.
 * Se conserva por compatibilidad; delega en categorizeIncome/categorizeExpense.
 */
export function detectCategory(body: string, type: 'income' | 'expense'): string {
  if (type === 'income') return categorizeIncome(flatText(body), 'deposit');
  return categorizeExpense(extractMerchantName(body), null, flatText(body));
}

// ─────────────────────────────────────────────────────────────
// COMERCIO Y UBICACIÓN
// ─────────────────────────────────────────────────────────────

export interface MerchantInfo {
  merchant: string | null;
  location: string | null;
  /** Segmento crudo entre "en" y la fecha (conserva "10 PAG"), para detectar cuotas. */
  segment: string | null;
}

const DATE_SRC = "\\d{1,2}[\\/\\-.]\\d{1,2}[\\/\\-.]\\d{2,4}";
const SEGMENT_NOISE_RE = /\bq\b|\bgtq\b|\busd\b|\d+\.\d{2}\b|\*{2,}|\bcuenta\b|\btarjeta\b|\bcajero\b/i;
const INSTALLMENT_SUFFIX_RE = /\s*\d{1,3}\s*(?:PAG(?:OS)?|CUOTAS?|MSI)\s*$/i;
const REF_RE = /\bREF(?:ERENCIA)?\.?\s*:?\s*[A-Z0-9-]*\d[A-Z0-9-]*/i;

const LOCATION_ALIASES: Record<string, string> = {
  guate: "Guatemala",
  gt: "Guatemala",
  gua: "Guatemala",
  guatemala: "Guatemala",
};

/** TitleCase: mayúscula solo al inicio o tras espacio ("CASTOR'S" → "Castor's"). Conserva "#12", "Z10". */
function toTitleCase(str: string): string {
  return str
    .split(" ")
    .map(tok => {
      if (!tok) return tok;
      if (tok.length <= 4 && /[\d#]/.test(tok) && tok === tok.toUpperCase()) return tok;
      return tok.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase());
    })
    .join(" ");
}

function matchSegment(raw: string): string | null {
  // BANRURAL: "... Cuenta 3012XXXX en: PAGO TIGO RESIDENCIAL."
  let m = raw.match(/\ben:\s*(.+?)(?:\.|$|\n)/i);
  if (m) return m[1];
  // GTC: "Localidad: LUGAR CIUDAD"
  m = raw.match(/localidad:\s*(.+?)(?:\s{2,}|\n|$)/i);
  if (m) return m[1];
  // BAC: "... por Q X en NOMBRE   CIUDAD el DD/MM/YY"
  m = raw.match(new RegExp("\\ben\\s+(.+?)\\s+el\\s+" + DATE_SRC, "i"));
  if (m && !SEGMENT_NOISE_RE.test(m[1])) return m[1];
  // BI: "... en NOMBRE Fecha: DD/MM/YYYY"
  m = raw.match(/\ben\s+(.+?)\s+(?:fecha|el|a las)\b/i);
  if (m && !SEGMENT_NOISE_RE.test(m[1])) return m[1];
  return null;
}

/** Extrae comercio, ubicación y segmento crudo de un SMS (plantillas BAC, BANRURAL, GTC y BI). */
export function extractMerchantAndLocation(raw: string): MerchantInfo {
  const segment = matchSegment(raw);
  if (segment === null) return { merchant: null, location: null, segment: null };

  const cleaned = segment
    .replace(INSTALLMENT_SUFFIX_RE, "")
    .replace(REF_RE, "  ")
    .replace(/\s*\*\s*/g, " ")
    .trim();
  const parts = cleaned
    .split(/\s{2,}/)
    .map(p => p.replace(INSTALLMENT_SUFFIX_RE, "").replace(/\s+/g, " ").trim())
    .filter(p => p.length > 0);
  if (parts.length === 0) return { merchant: null, location: null, segment };

  const merchant = toTitleCase(parts[0]);
  let location: string | null = null;
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    // Un teléfono (solo dígitos/guiones) no es una ubicación.
    if (/[A-Za-z]/.test(last)) {
      location = LOCATION_ALIASES[last.toLowerCase()] ?? toTitleCase(last);
    }
  }
  return { merchant, location, segment };
}

const KNOWN_PLACES: [RegExp, string][] = [
  // Gasolineras
  [/\bshell\b/i, "Shell (Est. de Servicio)"],
  [/\btexaco\b/i, "Texaco (Est. de Servicio)"],
  [/\bpuma\b/i, "Puma (Est. de Servicio)"],
  [/\besso\b/i, "Esso (Est. de Servicio)"],
  [/\bredipsa\b/i, "Redipsa (Est. de Servicio)"],
  [/\bzeta\s*gas\b/i, "Zeta Gas"],
  [/estaci[oó]n\s+de\s+serv|est\.?\s*de\s*serv|gasolinera/i, "Estación de Servicio"],
  // Restaurantes
  [/mcdon|mcdonald/i, "McDonald's"],
  [/pizza\s*hut/i, "Pizza Hut"],
  [/pollo\s*campero/i, "Pollo Campero"],
  [/\bkfc\b/i, "KFC"],
  [/\bsubway\b/i, "Subway"],
  [/\bwendy/i, "Wendy's"],
  [/\bdomino/i, "Domino's Pizza"],
  // Supermercados
  [/walmart/i, "Walmart"],
  [/despensa/i, "Despensa Familiar"],
  [/hiper\s*paiz|\bpaiz\b/i, "Hiper Paiz"],
  [/maxi\s*despensa/i, "Maxi Despensa"],
  // Streaming / Suscripciones
  [/netflix/i, "Netflix"],
  [/spotify/i, "Spotify"],
  [/disney/i, "Disney+"],
  [/paramount/i, "Paramount+"],
  [/hbo\s*max/i, "HBO Max"],
  [/\bgoogle\b/i, "Google"],
  [/\bapple\b/i, "Apple"],
  [/amazon/i, "Amazon"],
  // Transporte
  [/\buber\b/i, "Uber"],
  [/\bindriver\b/i, "InDriver"],
  // Telecomunicaciones
  [/\btigo\b/i, "Tigo"],
  [/\bclaro\b/i, "Claro"],
  // Guatemala
  [/\birtra\b/i, "IRTRA"],
];

/**
 * Nombre del comercio. Usa la plantilla del banco; la lista de comercios
 * conocidos solo se aplica como respaldo cuando NO hubo plantilla.
 */
export function extractMerchantName(body: string): string | null {
  const info = extractMerchantAndLocation(body);
  if (info.segment !== null) return info.merchant;
  for (const [regex, name] of KNOWN_PLACES) {
    if (regex.test(body)) return name;
  }
  return null;
}

/** Limpia y formatea la descripción de una transacción a partir del texto del SMS */
export function buildSmartDescription(body: string, bank: string, type: 'income' | 'expense'): string {
  const lower = body.toLowerCase();

  if (lower.includes('retiro de atm')) {
    return `${bank} · Retiro en cajero automático`;
  }

  if (lower.includes('debito ift')) {
    return `${bank} · Débito por transferencia`;
  }

  const merchant = extractMerchantName(body);
  if (merchant) {
    return type === 'income'
      ? `${bank} · Pago recibido de ${merchant}`
      : `${bank} · Compra en ${merchant}`;
  }

  return type === 'income'
    ? `${bank} · Ingreso recibido`
    : `${bank} · Gasto con tarjeta`;
}
