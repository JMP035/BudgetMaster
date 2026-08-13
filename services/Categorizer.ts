// ─────────────────────────────────────────────────────────────
// SERVICIO DE CATEGORIZACIÓN CENTRALIZADO
// ─────────────────────────────────────────────────────────────
// Contiene las reglas unificadas de emparejamiento de comercios,
// detección de categorías y limpieza de descripciones para
// consumo manual, SMS y asesoría conversacional.

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

/** Detecta la categoría de una transacción basado en su texto y tipo */
export function detectCategory(body: string, type: 'income' | 'expense'): string {
  if (type === 'income') return 'salary';
  const b = body.toLowerCase();

  // ── Combustible / Gasolineras / Estaciones de servicio ───────
  if (b.match(/gasolina|combustible|estaci[oó]n\s+de\s+serv|est\.?\s*de\s*serv|gasolinera|surtidor/)) return 'fuel';
  if (b.match(/\bshell\b|\btexaco\b|\bpuma\b|\buno\b|\besso\b|\bredipsa\b|\bzeta\s*gas\b|\bpetrogas\b|\btotal\s*gas\b/)) return 'fuel';

  // ── Comida / Restaurantes ─────────────────────────────────────
  if (b.match(/pizza|mcdon|mcdonald|burger|pollo\s*campero|kfc|subway|irtra|restauran|comida|food|domino|wendy|denny|applebee|chili|friday|sushi|tacos|burritos/)) return 'food';

  // ── Supermercados ─────────────────────────────────────────────
  if (b.match(/walmart|despensa|hiper\s*paiz|paiz|supermercado|grocery|maxi\s*despensa|la\s*torre|chedraui/)) return 'groceries';

  // ── ATM / Cajeros ─────────────────────────────────────────────
  if (b.match(/\batm\b|retiro\s+de\s+atm|cajero\s+autom/)) return 'atm';

  // ── Transporte ────────────────────────────────────────────────
  if (b.match(/uber|taxi/)) return 'transport';

  // ── Streaming ─────────────────────────────────────────────────
  if (b.match(/netflix|spotify|disney|hbo|youtube\s+premium|prime\s+video|paramount|crunchyroll/)) return 'streaming';

  // ── Entretenimiento ───────────────────────────────────────────
  if (b.match(/steam|playstation|xbox|nintendo|game|juego|cine|cinepolis|pradera/)) return 'entertainment';

  // ── Farmacia ──────────────────────────────────────────────────
  if (b.match(/farmacia|galeno|meykos|medicina|pharmacy|farmacias\s+cruz\s+verde|similar/)) return 'pharmacy';

  // ── Salud ─────────────────────────────────────────────────────
  if (b.match(/hospital|medico|doctor|clinica|salud|laboratorio|radiologia/)) return 'health';

  // ── Compras online ────────────────────────────────────────────
  if (b.match(/amazon|ebay|aliexpress|mercado\s+libre|shein|temu/)) return 'shopping';

  // ── Internet / Telecomunicaciones ─────────────────────────────
  if (b.match(/claro|tigo|movistar|internet|wifi|telefon|fibernet/)) return 'internet';

  // ── Servicios básicos ─────────────────────────────────────────
  if (b.match(/agua|luz\b|eegsa|empagua|electricidad|energuate|recibo\s+de/)) return 'utilities';

  // ── Suscripciones recurrentes ─────────────────────────────────
  if (b.match(/google\s*(pay|one|play)|apple|microsoft|dropbox|adobe|cloud/)) return 'subscriptions';

  // ── Viajes ────────────────────────────────────────────────────
  if (b.match(/hotel|airbnb|vuelo|aeropuerto|avianca|volaris|united|american\s+airlines|la\s+aurora/)) return 'travel';

  // ── Transferencias ────────────────────────────────────────────
  if (b.match(/transferencia|tif|inmediata/)) return 'transfer';

  return 'other';
}

/**
 * Extrae el nombre del comercio a partir del texto del SMS, probando (en orden)
 * el patrón BAC (`en X el/DD`), BANRURAL (`en: X`), GTC (`Localidad: X`) y la
 * lista de comercios conocidos. Limpia sufijos de cuotas ("10 PAG") y números
 * de referencia ("REF.:0000544") antes de aplicar TitleCase, para que el
 * nombre no arrastre ese ruido hacia visacuotas/transacciones.
 */
export function extractMerchantName(body: string): string | null {
  const b = body;

  const cleanRaw = (raw: string): string => {
    const cleaned = raw
      .replace(/\s*\d{1,3}\s*(PAG(?:OS)?|CUOTAS?|MSI)\s*$/i, '')
      .replace(/REF\.?:?\s*[A-Z0-9]{4,}/i, '')
      .replace(/\s{2,}/g, ' ')
      .trim();
    return toTitleCase(cleaned);
  };

  // BAC: "compra Aprobada por Q X.XX en NOMBRE_COMERCIO el DD/MM/YY"
  const bacMatch = b.match(/en\s+([A-Z][A-Z0-9\s]+?)\s+(?:el|El|\d{2}\/)/);
  if (bacMatch) return cleanRaw(bacMatch[1].trim());

  // BANRURAL: "se debito de tu Cuenta X en: DESCRIPCION"
  const banruralDebit = b.match(/en:\s+([A-Z][A-Z0-9\s\-]+)/i);
  if (banruralDebit) return cleanRaw(banruralDebit[1].trim());

  // GTC: "Consumo tarjeta de debito ... Localidad: LUGAR CIUDAD"
  const gtcLocalidad = b.match(/[Ll]ocalidad:\s*([A-Z][A-Z0-9\s]+?)(?:\s{2,}|\n|GT|$)/);
  if (gtcLocalidad) return cleanRaw(gtcLocalidad[1].trim());

  // Detectar comercios conocidos
  const knownPlaces: [RegExp, string][] = [
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

  for (const [regex, name] of knownPlaces) {
    if (regex.test(b)) return name;
  }

  return null;
}

/** Limpia y formatea la descripción de una transacción a partir del texto del SMS */
export function buildSmartDescription(body: string, bank: string, type: 'income' | 'expense'): string {
  const b = body;

  // BANRURAL ingreso
  if (b.toLowerCase().includes('se acredito') || b.toLowerCase().includes('acreditado')) {
    return `${bank} · Abono recibido`;
  }

  if (b.toLowerCase().includes('retiro de atm')) {
    return `${bank} · Retiro en cajero automático`;
  }

  if (b.toLowerCase().includes('debito ift')) {
    return `${bank} · Débito por transferencia`;
  }
  if (b.toLowerCase().includes('transferencia')) {
    return type === 'income'
      ? `${bank} · Transferencia recibida`
      : `${bank} · Transferencia enviada`;
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

function toTitleCase(str: string): string {
  return str.toLowerCase().replace(/\b\w/g, c => c.toUpperCase()).trim();
}
