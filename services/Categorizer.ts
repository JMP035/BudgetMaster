// ─────────────────────────────────────────────────────────────
// SERVICIO DE CATEGORIZACIÓN CENTRALIZADO
// ─────────────────────────────────────────────────────────────
// Contiene las reglas unificadas de emparejamiento de comercios,
// detección de categorías y limpieza de descripciones para
// consumo manual, SMS y asesoría conversacional.
//
// Categorías de comida: "restaurant" (Restaurantes) = TODA la comida ya preparada
// (restaurantes, comida rápida, cafeterías, delivery, antojitos); "groceries" (Supermercado)
// = supermercados y tiendas de conveniencia; "food" (Comida) = el resto (panaderías,
// pastelerías, mercados, tiendas de barrio, snacks).
//
// Módulo PURO: sin imports de React Native ni de storage. Lo usa el motor de
// parseo de SMS (BankSmsParser) que se prueba con `npm run test:sms`.
//
// Nota sobre nombres truncados: el campo del comercio lo corta el propio SMS del
// banco (BAC ~22 caracteres: "SOLUCIONES TECNOLOGICA", "PAGGO APP RESTAURAN").
// Este módulo NO trunca nada; por eso las reglas de EXPENSE_RULES coinciden por
// prefijo (restaura\w*, tecnolog\w*, serv\w*).

import { splitBrand, splitLocation, stripGateway } from "./GuatemalaBrands";

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

interface ExpenseRule {
  category: string;
  re: RegExp;
  /** Solo se evalúa si hay comercio (no sobre el texto completo del SMS). */
  merchantOnly?: boolean;
  /** Anclada al INICIO del nombre del comercio (sin ubicación): para nombres cortos o comunes. */
  merchantStart?: boolean;
}

const rule = (category: string, src: string, opts: { merchantOnly?: boolean; merchantStart?: boolean } = {}): ExpenseRule => ({
  category,
  re: opts.merchantStart ? new RegExp("^(?:" + src + ")\\b") : wb(src),
  ...opts,
});

// El orden importa: gana la primera regla que coincide.
// Ojo: BAC corta el campo del comercio en ~22 caracteres ("ESTACION DE SERVICIO J",
// "PAGGO APP RESTAURAN"), por eso varias reglas coinciden por prefijo (\w*).
const EXPENSE_RULES: ExpenseRule[] = [
  // Delivery = comida preparada.
  rule("restaurant", "uber\\s*eats|pedidos\\s*ya|hugo app|hugo|rappi"),
  // Panaderías, pastelerías, mercados y tiendas de barrio = Comida. Van ANTES que restaurantes
  // ("Panadería y Cafetería" es una panadería). "mercado libre" es compras, no un mercado.
  rule("food", "panaderi\\w*|pasteleri\\w*|reposteri\\w*|mercado(?!\\s*libre)|tiendita\\w*|abarroteri\\w*|carniceri\\w*|verduleri\\w*|tortiller\\w*|dulceri\\w*|heladeri\\w*|tienda dona?"),
  // Comida ya preparada = Restaurantes.
  rule("restaurant", "pizz\\w*|mcdon\\w*|burger\\w*|hamburgues\\w*|campero|pollo\\w*|granjero|kfc|subway|domino\\w*|wendy\\w*|little caesars|taco bell|papa john\\w*|carl s jr|carls jr|carl s|starbucks|barista|dunkin\\w*|sushi|tacos?|taqueri\\w*|restaura\\w*|cafe|cafeteri\\w*|coffee|comedor\\w*|parrilla\\w*|churrasc\\w*|pupuseri\\w*|marisqueri\\w*|cevicheri\\w*|marinero|antojito\\w*|gourmelt|anfora|bistro|grill|wings|los cebollines|go green|sarita|pinulito|china wok"),
  // Nombres cortos o comunes: restaurantes solo al inicio del comercio. "San Martín" también es restaurante
  // (decisión del usuario; "Hotel San Martín" no empieza con el nombre y cae en viajes).
  rule("restaurant", "san martin|la trama|parma|el portal|la cocina", { merchantStart: true }),
  // Supermercados y tiendas de conveniencia (Súper 24).
  rule("groceries", "walmart|despensa\\w*|paiz|la torre|pricesmart|super ?24|tiendas? de conveniencia|mini ?super\\w*|supermercado\\w*|maxi despensa|econosuper|super del barrio|unisuper|la bodegona|bodegona|super selectos|dollar ?city"),
  rule("groceries", "suma|la barata", { merchantStart: true }),
  // Estaciones de servicio = gasolineras. ruleText conserva los puntos ("est. de serv."),
  // por eso `est\.?` y `\s+` en vez de un espacio literal. `estacion(?:es)?` (no `estacion\w*`)
  // para no capturar "estacionamiento"; "Estacion Central Mall" no lleva "serv" y no coincide.
  // "E/S Shell" llega como "e s shell" (la barra se vuelve espacio).
  rule("fuel", "gasolinera\\w*|estacion(?:es)?\\s+(?:de\\s+)?serv\\w*|est\\.?\\s+(?:de\\s+)?serv\\w*|e s shell|servicentro\\w*|shell|texaco|puma(?!\\s+(?:store|sport|outlet|tienda|ropa))|esso|chevron|petrolera\\w*|redipsa|zeta gas|gas station|combustible\\w*"),
  // Marcas cortas/comunes: solo al inicio del nombre del comercio ("Delta Airlines" y "Total Play" quedan fuera).
  rule("fuel", "delta(?!\\s+air)|total(?!\\s*play)", { merchantStart: true }),
  rule("fuel", "uno", { merchantOnly: true }),
  rule("transport", "uber|indriver|indrive|yango|taxi\\w*|parqueo\\w*|parking|estacionamiento\\w*|transporte\\w*|transmetro|tu muni|peaje\\w*|autopista"),
  rule("streaming", "netflix|spotify|disney\\w*|hbo|max\\.com|youtube|prime video|paramount|crunchyroll|vix|star plus|apple tv"),
  rule("subscriptions", "anthropic|claude|openai|chatgpt|google one|google storage|google play|icloud|apple\\.com|apple com|itunes|microsoft|office 365|adobe|canva|github|notion|duolingo|dropbox|midjourney|perplexity|grammarly|suscrip\\w*|membresi\\w*"),
  rule("internet", "starlink|tigo|claro|telgua|movistar|fibernet|cable\\w*|telecomunicacion\\w*"),
  rule("internet", "internet", { merchantOnly: true }),
  rule("tech", "soluciones tecnolog\\w*|tecnolog\\w*|tecno\\w*|computacion|computadora\\w*|compu\\w*|electronica\\w*|intelaf|macrosistemas|spirit|celulares|repuestos? de comput\\w*"),
  rule("tech", "click", { merchantStart: true }),
  rule("entertainment", "irtra|xetulul|xocomil|steam|playstation|xbox|nintendo|cine|cinepolis|cinemark|games?"),
  rule("pharmacy", "farmacia|galeno|meykos|cruz verde|batres|kielsa|carolina|similares?"),
  rule("health", "hospital|medico|doctor|clinica|laboratorio|radiologia|sanatorio|dental"),
  // Ropa ANTES que compras: "La Megapaca" no debe caer en "tienda"/"max".
  // `pacas?` es palabra completa para no capturar "Pacaya".
  rule("clothes", "megapaca|pacas?|ropa|boutique\\w*|zara|bershka|stradivarius|pull ?& ?bear|h&m|cuadra|payless|levis|nike|adidas"),
  rule("shopping", "amazon|amzn|ebay|aliexpress|shein|temu|mercado ?libre|pacifiko|cemaco|siman|elektra|curacao|max|tienda"),
  rule("utilities", "eegsa|energuate|empagua|electricidad|agua|luz|municipalidad"),
  rule("travel", "hotel|airbnb|avianca|volaris|copa|united|american airlines|aeropuerto|booking"),
  rule("education", "colegio|universidad|usac|url|umg|udv|academia|curso"),
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
  const merchantText = hasMerchant ? ruleText(merchant as string) : "";
  for (const r of EXPENSE_RULES) {
    if (r.merchantOnly && !hasMerchant) continue;
    if (r.merchantStart) {
      // Solo el inicio del nombre del comercio (sin ubicación).
      if (hasMerchant && r.re.test(merchantText)) return r.category;
      continue;
    }
    if (r.re.test(text)) return r.category;
  }
  return "other";
}

/**
 * Categoría de un ingreso. `flat` debe venir ya normalizado (minúsculas, sin
 * tildes). Nunca devuelve 'salary' por defecto: solo si el texto lo dice.
 */
export function categorizeIncome(flat: string, kind: "deposit" | "transfer_in" | "payroll" | "refund"): string {
  if (/\b(?:mindef|ministerio de la defensa|ejercito|militar|planilla|nomina|salario|sueldo)\b/.test(flat)) return "salary";
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
  /** Solo el nombre principal de la marca ("San Martín", "McDonald's"), sin ubicación ni pasarela. */
  merchant: string | null;
  /** Ubicación aparte ("Majadas", "Zona 10") o, si no hay, la ciudad del SMS. */
  location: string | null;
  /** Categoría que fija la marca del catálogo (GuatemalaBrands); null si no hay marca. Gana sobre EXPENSE_RULES. */
  brandCategory: string | null;
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

/** Conectores que van en minúscula cuando no son la primera palabra ("Estación de Servicio J"). */
const TITLE_LOWER_WORDS = new Set(["de", "del", "la", "las", "el", "los", "y", "en"]);

/**
 * TitleCase: mayúscula solo al inicio o tras espacio ("CASTOR'S" → "Castor's"). Conserva "#12", "Z10".
 * Los conectores (de, del, la, el...) quedan en minúscula salvo en la primera posición ("La Trama").
 */
function toTitleCase(str: string): string {
  return str
    .split(" ")
    .map((tok, i) => {
      if (!tok) return tok;
      if (tok.length <= 4 && /[\d#]/.test(tok) && tok === tok.toUpperCase()) return tok;
      if (i > 0 && TITLE_LOWER_WORDS.has(tok.toLowerCase())) return tok.toLowerCase();
      return tok.toLowerCase().replace(/(^|\s)(\S)/g, (_m, a: string, b: string) => a + b.toUpperCase());
    })
    .join(" ");
}

/** Quita puntuación final suelta ("Plaza Atanasio Tzul," → "Plaza Atanasio Tzul"). */
const TRAILING_PUNCT_RE = /[\s,;:.\-]+$/;

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

/**
 * Del nombre crudo del comercio saca SOLO el nombre principal: quita la pasarela de pago
 * (Paggo App, PayPal...), busca la marca del catálogo (nombre canónico + su categoría) y
 * separa la ubicación pegada al final. Sin marca conocida, separa la ubicación de forma
 * conservadora (zona N, lugares de GT_PLACES) sobre el nombre en TitleCase.
 */
function resolveMerchant(rawName: string): { merchant: string; location: string | null; brandCategory: string | null } {
  const name = stripGateway(rawName).name;
  const hit = splitBrand(name);
  if (hit) return { merchant: hit.brand.name, location: hit.location, brandCategory: hit.brand.category };
  const split = splitLocation(toTitleCase(name));
  return { merchant: split.name, location: split.location, brandCategory: null };
}

/** Extrae comercio, ubicación y segmento crudo de un SMS (plantillas BAC, BANRURAL, GTC y BI). */
export function extractMerchantAndLocation(raw: string): MerchantInfo {
  const segment = matchSegment(raw);
  if (segment === null) return { merchant: null, location: null, brandCategory: null, segment: null };

  const cleaned = segment
    .replace(INSTALLMENT_SUFFIX_RE, "")
    .replace(REF_RE, "  ")
    // "GOOGLE *Google One": el procesador repite el nombre antes del asterisco.
    .replace(/(\S+)\s*\*\s*\1(?=\s|$)/gi, "$1")
    .replace(/\s*\*\s*/g, " ")
    .trim();
  const parts = cleaned
    .split(/\s{2,}/)
    .map(p => p.replace(INSTALLMENT_SUFFIX_RE, "").replace(/\s+/g, " ").replace(TRAILING_PUNCT_RE, "").trim())
    .filter(p => p.length > 0);
  if (parts.length === 0) return { merchant: null, location: null, brandCategory: null, segment };

  const resolved = resolveMerchant(parts[0]);
  let city: string | null = null;
  if (parts.length > 1) {
    const last = parts[parts.length - 1];
    // Un teléfono (solo dígitos/guiones) no es una ubicación.
    if (/[A-Za-z]/.test(last)) {
      city = LOCATION_ALIASES[last.toLowerCase()] ?? toTitleCase(last);
    }
  }
  // La ubicación que venía pegada al nombre es más específica que la ciudad del SMS.
  return { merchant: resolved.merchant, location: resolved.location ?? city, brandCategory: resolved.brandCategory, segment };
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
  [/carl'?s\s*jr/i, "Carl's Jr"],
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
  [/\bstarlink\b/i, "Starlink"],
  [/\banthropic\b/i, "Anthropic"],
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
