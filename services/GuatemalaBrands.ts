// ─────────────────────────────────────────────────────────────
// CATÁLOGO DE MARCAS Y LUGARES DE GUATEMALA (módulo PURO)
// ─────────────────────────────────────────────────────────────
// Sin react-native ni storage. Lo usan Categorizer (nombre del comercio sin ubicación
// y categoría por marca) y MerchantRules (clave de aprendizaje con el nombre canónico).
//
// Qué resuelve:
//   · "SAN MARTIN MAJADAS" / "SAN MARTIN ARANDA"  → marca "San Martín" + ubicación aparte.
//   · "PAGGO APP RESTAURAN" / "PAYPAL *SPOTIFY"    → se quita la pasarela de pago.
//   · "TIENDA DOÑA MARTA ZONA 7" (marca desconocida) → "Tienda Doña Marta" + "Zona 7".
//
// CÓMO COMPLETAR EL CATÁLOGO: agregar objetos a GT_BRANDS_DATA en GuatemalaBrands.data.ts (mismo
// formato; los alias van en minúsculas y sin tildes, pero se normalizan igual por si no; "pollocampero"
// y "pollo campero" dan la misma clave). El índice se construye una sola vez al cargar el módulo.
//
// Semántica de `confidence`:
//   · 'high' (o ausente): el alias es distintivo. Si el comercio EMPIEZA con el alias, se usa la
//     marca y lo que sobra se descarta salvo que parezca una ubicación ("Anthropic Claude Sub"
//     → "Anthropic").
//   · 'medium' | 'low': el alias es corto o común ("Uno", "Suma", "La Torre", "Parma"). Solo se
//     acepta si no sobra texto o lo que sobra parece una ubicación; así "Parma Pizzeria Italiana"
//     no se convierte en "Parma" y se pierde el nombre.
//
// Las categorías son ids de categories.ts. Restaurantes = TODA la comida ya preparada (restaurant);
// Supermercado y conveniencia = groceries; panaderías, mercados y tiendas de barrio = food.

import { GT_AMBIGUOUS_PLACES, GT_BRANDS_DATA, GT_GATEWAYS_DATA, GT_PLACES_DATA } from './GuatemalaBrands.data';

export interface GtBrand {
  /** Nombre canónico que se muestra y con el que se calcula la clave de aprendizaje. */
  name: string;
  /** Id de categoría (categories.ts). */
  category: string;
  /** Alias adicionales (el propio `name` ya cuenta como alias). Coinciden por PREFIJO de palabras completas. */
  aliases: string[];
  confidence?: 'high' | 'medium' | 'low';
  note?: string;
}

// ─────────────────────────────────────────────────────────────
// TOKENIZACIÓN
// ─────────────────────────────────────────────────────────────

/** Palabra: letras/dígitos (con tildes latinas), "#12" y apóstrofes internos ("Carl's"). */
const WORD_SRC = "#?[A-Za-z0-9\\u00C0-\\u00FF]+(?:['\\u2019][A-Za-z\\u00C0-\\u00FF]+)?";

interface Tok {
  /** Token normalizado: minúsculas, sin tildes ni apóstrofes ("Carl's" → "carls"). */
  t: string;
  start: number;
  end: number;
}

function normToken(w: string): string {
  return w.toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/['’]/g, '');
}

function tokenize(s: string): Tok[] {
  const out: Tok[] = [];
  const re = new RegExp(WORD_SRC, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    out.push({ t: normToken(m[0]), start: m.index, end: m.index + m[0].length });
  }
  return out;
}

/** Une tokens sin espacios: así "super 24", "super24" y "wal mart"/"walmart" dan la misma clave. */
function joinToks(toks: Tok[], from: number, to: number): string {
  let s = '';
  for (let i = from; i < to; i++) s += toks[i].t;
  return s;
}

function joinStr(s: string): { key: string; count: number } {
  const toks = tokenize(s);
  return { key: joinToks(toks, 0, toks.length), count: toks.length };
}

// ─────────────────────────────────────────────────────────────
// CATÁLOGO (los datos viven en GuatemalaBrands.data.ts)
// ─────────────────────────────────────────────────────────────

export const GT_BRANDS: GtBrand[] = GT_BRANDS_DATA;

// ─────────────────────────────────────────────────────────────
// LUGARES Y PASARELAS
// ─────────────────────────────────────────────────────────────

/**
 * Lugares (colonias, centros comerciales, municipios) que el comercio trae pegados al final.
 * "Zona N" / "ZN" no hace falta listarlos: se detectan por patrón. Incluye los ambiguos
 * (GT_AMBIGUOUS_PLACES): estos solo cuentan como ubicación si antes hay una palabra que no sea
 * genérica ni otro lugar ("San Martin Aranda" sí; "Aranda" solo, o "Tienda Aranda", no).
 */
export const GT_PLACES: string[] = [...GT_PLACES_DATA, ...GT_AMBIGUOUS_PLACES];

const AMBIGUOUS_PLACES: string[] = GT_AMBIGUOUS_PLACES;

/** Palabras que por sí solas no son un nombre de comercio ("Plaza" + "Atanasio Tzul" no se separa). */
const GENERIC_NAME_WORDS = new Set([
  'plaza', 'centro', 'comercial', 'mall', 'parque', 'hotel', 'hospital', 'colegio', 'tienda', 'super',
  'supermercado', 'mercado', 'farmacia', 'restaurante', 'estacion', 'parqueo', 'parqueos', 'gasolinera',
  'cc', 'de', 'del', 'la', 'las', 'el', 'los', 'y',
]);

/**
 * Pasarelas de pago: aparecen como prefijo del comercio real ("PAGGO APP RESTAURAN",
 * "PAYPAL *SPOTIFY") y no clasifican por sí solas.
 */
export const GT_GATEWAYS: string[] = GT_GATEWAYS_DATA;

// ─────────────────────────────────────────────────────────────
// ÍNDICES (una sola vez, a nivel de módulo)
// ─────────────────────────────────────────────────────────────

const BRAND_INDEX = new Map<string, GtBrand>();
let MAX_ALIAS_TOKENS = 1;
for (const brand of GT_BRANDS) {
  for (const alias of [brand.name, ...brand.aliases]) {
    const { key, count } = joinStr(alias);
    if (!key || BRAND_INDEX.has(key)) continue;
    BRAND_INDEX.set(key, brand);
    if (count > MAX_ALIAS_TOKENS) MAX_ALIAS_TOKENS = count;
  }
}

const PLACE_INDEX = new Set<string>();
let MAX_PLACE_TOKENS = 1;
for (const place of GT_PLACES) {
  const { key, count } = joinStr(place);
  if (!key) continue;
  PLACE_INDEX.add(key);
  if (count > MAX_PLACE_TOKENS) MAX_PLACE_TOKENS = count;
}
const AMBIGUOUS_INDEX = new Set(AMBIGUOUS_PLACES.map(p => joinStr(p).key));

const GATEWAY_INDEX = new Set<string>();
let MAX_GATEWAY_TOKENS = 1;
for (const g of GT_GATEWAYS) {
  const { key, count } = joinStr(g);
  if (!key) continue;
  GATEWAY_INDEX.add(key);
  if (count > MAX_GATEWAY_TOKENS) MAX_GATEWAY_TOKENS = count;
}

// ─────────────────────────────────────────────────────────────
// UBICACIÓN: utilidades
// ─────────────────────────────────────────────────────────────

const BRANCH_RE = /^#\d+$/;
const ZONE_TOKEN_RE = /^z\d{1,2}$/;
const CONNECTORS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'y', 'en', 'a']);

/** Token que es parte de una ubicación (zona, sucursal o un lugar de una sola palabra). */
function isLocationToken(t: string): boolean {
  return BRANCH_RE.test(t) || ZONE_TOKEN_RE.test(t) || t === 'zona' || PLACE_INDEX.has(t);
}

/** Texto de ubicación con formato: "Z10" → "Zona 10", conectores en minúscula, "#12" intacto. */
function formatLocation(text: string): string | null {
  const words = text.split(/\s+/).map(w => w.replace(/[,;:.\-]+$/, '')).filter(Boolean);
  if (words.length === 0) return null;
  const out = words.map((w, i) => {
    const lower = w.toLowerCase();
    const z = lower.match(/^z(\d{1,2})$/);
    if (z) return `Zona ${z[1]}`;
    if (w.startsWith('#')) return w;
    if (i > 0 && CONNECTORS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
  return out.join(' ');
}

/** Longitud (en tokens) y tipo de la ubicación que termina en `end`; take 0 si no hay. */
function locationTail(toks: Tok[], end: number): { take: number; named: boolean; ambiguous: boolean } {
  const last = toks[end - 1].t;
  if (BRANCH_RE.test(last) || ZONE_TOKEN_RE.test(last)) return { take: 1, named: false, ambiguous: false };
  if (end >= 2 && /^\d{1,3}$/.test(last) && toks[end - 2].t === 'zona') return { take: 2, named: false, ambiguous: false };
  for (let len = Math.min(MAX_PLACE_TOKENS, end); len >= 1; len--) {
    const key = joinToks(toks, end - len, end);
    if (PLACE_INDEX.has(key)) return { take: len, named: true, ambiguous: AMBIGUOUS_INDEX.has(key) };
  }
  return { take: 0, named: false, ambiguous: false };
}

/**
 * ¿El texto contiene algo que parece una ubicación? (zona, "#12", o un lugar de GT_PLACES).
 * Los números sueltos no cuentan.
 */
export function looksLikeLocation(text: string): boolean {
  const toks = tokenize(text);
  for (let i = 0; i < toks.length; i++) {
    const t = toks[i].t;
    if (BRANCH_RE.test(t) || ZONE_TOKEN_RE.test(t)) return true;
    if (t === 'zona' && i + 1 < toks.length && /^\d{1,3}$/.test(toks[i + 1].t)) return true;
    for (let len = 1; len <= MAX_PLACE_TOKENS && i + len <= toks.length; len++) {
      if (PLACE_INDEX.has(joinToks(toks, i, i + len))) return true;
    }
  }
  return false;
}

/**
 * Separa la ubicación al FINAL de un nombre de comercio. Conservador: nunca deja el nombre
 * vacío ni de una sola letra; un lugar ambiguo ("Aranda") solo se separa si antes hay una
 * palabra que no sea genérica ni otro lugar; y un lugar no se separa si lo que quedaría son
 * solo palabras genéricas ("Plaza Atanasio Tzul" se queda entero).
 */
export function splitLocation(merchant: string): { name: string; location: string | null } {
  const text = merchant.trim();
  const toks = tokenize(text);
  let end = toks.length;

  while (end > 1) {
    const tail = locationTail(toks, end);
    if (tail.take === 0) break;
    const nameEnd = end - tail.take;
    if (nameEnd < 1) break;
    if (joinToks(toks, 0, nameEnd).length <= 1) break;
    if (tail.named) {
      const nameToks = toks.slice(0, nameEnd);
      if (nameToks.every(x => GENERIC_NAME_WORDS.has(x.t))) break;
      if (tail.ambiguous && !nameToks.some(x => !GENERIC_NAME_WORDS.has(x.t) && !isLocationToken(x.t))) break;
    }
    end = nameEnd;
  }

  if (end === toks.length) return { name: text, location: null };
  return {
    name: text.slice(0, toks[end - 1].end),
    location: formatLocation(text.slice(toks[end].start)),
  };
}

// ─────────────────────────────────────────────────────────────
// MARCAS Y PASARELAS: búsqueda
// ─────────────────────────────────────────────────────────────

export interface BrandSplit {
  brand: GtBrand;
  /** Resto del comercio (original) si parece una ubicación o la marca es una gasolinera; si no, null. */
  location: string | null;
  /** Texto que sobró tras el alias, sin procesar. */
  rest: string;
}

/** Interpreta lo que sobra tras la marca: { location, known } (known = se puede aceptar/descartar sin perder el nombre). */
function interpretRest(rest: string, brand: GtBrand): { location: string | null; known: boolean } {
  if (!rest) return { location: null, known: true };
  const toks = tokenize(rest);
  // Un solo carácter es un nombre truncado por el banco ("Estacion de Servicio J").
  if (toks.length === 0 || (toks.length === 1 && toks[0].t.length <= 1)) return { location: null, known: true };
  // Una gasolinera de marca fuerte acepta cualquier resto ("Shell El Camino"); las ambiguas (Uno, Puma, Delta, Total)
  // solo si lo que sobra parece una ubicación ("Total Play", "Puma Shoes" no son combustible).
  const fuelAnything = brand.category === 'fuel' && (brand.confidence ?? 'high') === 'high';
  if (looksLikeLocation(rest) || fuelAnything) return { location: formatLocation(rest), known: true };
  return { location: null, known: false };
}

/**
 * Busca la marca por PREFIJO de palabras completas (gana el alias más largo) y devuelve
 * también la ubicación que sobra. Tolera abreviaturas explícitas del catálogo, "'s" y espacios.
 */
export function splitBrand(merchant: string): BrandSplit | null {
  const toks = tokenize(merchant);
  const max = Math.min(toks.length, MAX_ALIAS_TOKENS);
  for (let k = max; k >= 1; k--) {
    const brand = BRAND_INDEX.get(joinToks(toks, 0, k));
    if (!brand) continue;
    const rest = k < toks.length ? merchant.slice(toks[k].start).trim() : '';
    const r = interpretRest(rest, brand);
    // Marca ambigua con texto que no parece ubicación: puede ser otro comercio.
    if (!r.known && (brand.confidence ?? 'high') !== 'high') continue;
    return { brand, location: r.location, rest };
  }
  return null;
}

/** Marca de un comercio ya normalizado (flatText) o crudo; null si no hay. */
export function findBrand(normalizedMerchant: string): GtBrand | null {
  const hit = splitBrand(normalizedMerchant);
  return hit ? hit.brand : null;
}

/**
 * Quita el prefijo de pasarela ("Paggo App Restauran" → "Restauran"). Si el comercio es solo
 * la pasarela, lo devuelve intacto.
 */
export function stripGateway(merchant: string): { name: string; gateway: string | null } {
  const toks = tokenize(merchant);
  for (let k = Math.min(MAX_GATEWAY_TOKENS, toks.length - 1); k >= 1; k--) {
    if (GATEWAY_INDEX.has(joinToks(toks, 0, k))) {
      return {
        name: merchant.slice(toks[k].start).trim(),
        gateway: merchant.slice(toks[0].start, toks[k - 1].end),
      };
    }
  }
  return { name: merchant.trim(), gateway: null };
}
