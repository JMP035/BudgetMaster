// Léxico del asistente: categorías con sinónimos guatemaltecos, comercios, cuentas y nombres libres.
// Módulo puro: sin react-native ni AsyncStorage (de ../storage solo se importan tipos) y sin regex
// lookbehind (Hermes). Todo texto que entra aquí ya viene normalizado con `normalizeWithMap`
// (minúsculas, sin tildes, sin signos); los índices `start`/`end` son posiciones en ese `norm`
// (`end` exclusivo), igual que en el resto de los parsers del asistente.

import type { Account, CustomCategory, Transaction } from '../storage';
import type { AssistantContext, Chip } from './types';
import { categorizeExpense, categorizeIncome, flatText } from '../Categorizer';
import { findMerchantRule, merchantKey, merchantOfTransaction } from '../MerchantRules';
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, categoryLabelOf, getAllExpenseCategories, getAllIncomeCategories } from '../../categories';
import { fuzzyEq, hasPhrase, normalizeWithMap } from './Text';

// ─────────────────────────────────────────────────────────────
// SINÓNIMOS
// ─────────────────────────────────────────────────────────────

/**
 * Sinónimos de categorías de gasto (id de categories.ts → frases ya normalizadas). Las etiquetas
 * de las categorías («Restaurantes», «Combustible»…) se suman solas al construir el índice.
 * «gas» suelto NO va aquí: es ambiguo (Combustible / Servicios) y se trata aparte.
 */
export const CATEGORY_SYNONYMS: Record<string, string[]> = {
  food: ['comida', 'almuerzo', 'desayuno', 'cena', 'refaccion', 'shucos', 'shuco', 'pollo campero', 'tamales'],
  groceries: ['super', 'supermercado', 'despensa', 'paiz', 'walmart', 'la torre', 'maxi despensa', 'mercado', 'mandado', 'pricesmart', 'bodegona'],
  transport: ['uber', 'taxi', 'indriver', 'bus', 'camioneta', 'pasaje', 'parqueo', 'transporte', 'movilizacion', 'tuc tuc'],
  fuel: ['gasolina', 'combustible', 'diesel', 'gasolinera', 'shell', 'puma', 'texaco'],
  restaurant: ['restaurante', 'restaurant', 'comer fuera', 'salir a comer', 'pizza', 'pizzeria', 'sushi'],
  entertainment: ['cine', 'salidas', 'fiesta', 'entretenimiento', 'diversion', 'videojuegos'],
  streaming: ['netflix', 'spotify', 'disney', 'hbo', 'max', 'prime video'],
  shopping: ['compras', 'tienda', 'amazon', 'shein', 'temu', 'cemaco', 'siman'],
  clothes: ['ropa', 'zapatos', 'tenis', 'vestimenta'],
  health: ['salud', 'doctor', 'medico', 'hospital', 'clinica', 'dentista', 'laboratorio'],
  pharmacy: ['farmacia', 'medicina', 'medicinas', 'medicamentos', 'pastillas'],
  education: ['colegio', 'universidad', 'estudios', 'cursos', 'libros', 'educacion', 'escuela', 'colegiatura', 'matricula'],
  utilities: ['luz', 'agua', 'energia', 'eegsa', 'energuate', 'gas propano', 'gas natural', 'tropigas', 'servicios', 'electricidad', 'empagua'],
  internet: ['internet', 'telefono', 'recarga', 'tigo', 'claro', 'wifi', 'telgua', 'celular'],
  rent: ['renta', 'alquiler', 'hipoteca', 'arrendamiento'],
  travel: ['viaje', 'hotel', 'vuelo', 'vacaciones', 'avion', 'airbnb'],
  atm: ['retiro', 'cajero', 'atm'],
  subscriptions: ['suscripcion', 'membresia'],
  tech: ['tecnologia', 'compu', 'computadora', 'laptop', 'audifonos', 'electronica'],
  bank_fees: ['comision', 'cargo bancario'],
};

/** Sinónimos de categorías de ingreso. */
export const INCOME_SYNONYMS: Record<string, string[]> = {
  salary: ['salario', 'sueldo', 'quincena', 'planilla', 'nomina'],
  military: ['pago militar'],
  freelance: ['freelance', 'chamba', 'trabajo extra', 'honorarios'],
  bonus: ['bono', 'aguinaldo', 'bono 14', 'bonificacion'],
  gift: ['regalo'],
  investment: ['inversion', 'intereses ganados', 'dividendos', 'rendimientos'],
  rental: ['alquiler cobrado'],
  business: ['negocio', 'ventas'],
};

/** Alias de gasto que son marcas o comercios (un comercio con ese nombre gana a la categoría). */
const BRAND_ALIASES: string[] = [
  'uber', 'indriver', 'shell', 'puma', 'texaco', 'netflix', 'spotify', 'disney', 'hbo', 'max', 'prime video',
  'amazon', 'shein', 'temu', 'cemaco', 'siman', 'paiz', 'walmart', 'la torre', 'maxi despensa', 'pricesmart',
  'tigo', 'claro', 'telgua', 'eegsa', 'energuate', 'empagua', 'tropigas', 'pollo campero', 'airbnb',
];

/**
 * Alias que solo valen escritos tal cual (sin tolerancia a errores ni plural): sus vecinos
 * cotidianos son otras palabras («salud» / «saludo», «vuelo» / «vuelvo», «regalo» / «regalé»,
 * «tenis» / «tenía», «claro» / «clara», «compras» / «compra»).
 */
const EXACT_ONLY: string[] = ['salud', 'vuelo', 'regalo', 'tenis', 'claro', 'compras', 'cena', 'cine', 'luz', 'ropa', 'agua', 'bono'];

/** Alias ambiguo: la misma palabra apunta a dos categorías y el usuario debe elegir. */
const AMBIGUOUS_ALIASES: { alias: string; ids: string[] }[] = [
  { alias: 'gas', ids: ['fuel', 'utilities'] },
];

/** Categorías que no se pueden nombrar desde el chat (no son destino de un gasto o ingreso). */
const NOT_NAMEABLE = ['other', 'transfer', 'transfer_in'];

// ─────────────────────────────────────────────────────────────
// UTILIDADES DE TOKENS
// ─────────────────────────────────────────────────────────────

interface Tok { t: string; start: number; end: number }

/** Palabras de `norm` con su posición. */
function tokenSpans(norm: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < norm.length) {
    if (norm[i] === ' ') { i++; continue; }
    let j = i;
    while (j < norm.length && norm[j] !== ' ') j++;
    out.push({ t: norm.slice(i, j), start: i, end: j });
    i = j;
  }
  return out;
}

/** Normaliza una etiqueta o nombre guardado (con «/», «-», «&», emojis…) a palabras sueltas. */
function normLabel(s: string): string {
  return normalizeWithMap(s.replace(/[/\-_&+*#]/g, ' ')).norm
    .split(' ')
    .map(w => w.replace(/[^a-z0-9]/g, ''))   // emojis y símbolos sueltos no son palabras
    .filter(w => w.length > 0)
    .join(' ');
}

/** ¿La palabra del usuario equivale a la del alias? (igual, plural simple o error de ortografía). */
function wordMatches(userTok: string, aliasTok: string, exactOnly: boolean): boolean {
  if (userTok === aliasTok) return true;
  if (exactOnly) return false;
  if (userTok.length >= 3 && aliasTok.length >= 3) {
    if (userTok === aliasTok + 's' || userTok === aliasTok + 'es') return true;
    if (aliasTok === userTok + 's' || aliasTok === userTok + 'es') return true;
  }
  // Los errores de ortografía casi nunca cambian la primera letra; exigirla evita falsos parecidos
  // entre palabras de 8+ letras («propinas» / «tropigas»).
  return userTok[0] === aliasTok[0] && fuzzyEq(userTok, aliasTok);
}

/** Busca la frase `aliasToks` en `toks`; devuelve el índice de la primera palabra o -1. */
function findPhraseAt(toks: Tok[], aliasToks: string[], exactOnly: boolean, from = 0): number {
  const n = aliasToks.length;
  if (n === 0) return -1;
  for (let i = from; i + n <= toks.length; i++) {
    let ok = true;
    for (let k = 0; k < n; k++) {
      if (!wordMatches(toks[i + k].t, aliasToks[k], exactOnly)) { ok = false; break; }
    }
    if (ok) return i;
  }
  return -1;
}

function overlapsAny(start: number, end: number, spans: [number, number][] | undefined): boolean {
  if (!spans) return false;
  for (const [s, e] of spans) if (start < e && s < end) return true;
  return false;
}

// ─────────────────────────────────────────────────────────────
// CATEGORÍAS
// ─────────────────────────────────────────────────────────────

export interface CategoryMatch { id: string; alias: string; start: number; end: number }

interface AliasEntry { id: string; alias: string; toks: string[]; custom: boolean; exactOnly: boolean; brand: boolean; group?: string }

function buildStaticIndex(
  synonyms: Record<string, string[]>,
  base: { id: string; label: string }[],
  withBrands: boolean,
): AliasEntry[] {
  const seen = new Set<string>();
  const out: AliasEntry[] = [];
  const brandSet = new Set(withBrands ? BRAND_ALIASES : []);
  const add = (id: string, raw: string) => {
    const alias = normLabel(raw);
    if (!alias) return;
    const key = id + '|' + alias;
    if (seen.has(key)) return;
    seen.add(key);
    out.push({
      id, alias, toks: alias.split(' '), custom: false,
      exactOnly: EXACT_ONLY.indexOf(alias) >= 0, brand: brandSet.has(alias),
    });
  };
  for (const id of Object.keys(synonyms)) for (const a of synonyms[id]) add(id, a);
  for (const c of base) if (NOT_NAMEABLE.indexOf(c.id) < 0) add(c.id, c.label);
  return out;
}

const EXPENSE_INDEX = buildStaticIndex(CATEGORY_SYNONYMS, EXPENSE_CATEGORIES, true);
const INCOME_INDEX = buildStaticIndex(INCOME_SYNONYMS, INCOME_CATEGORIES, false);

function customEntries(custom: CustomCategory[] | undefined, type: 'expense' | 'income'): AliasEntry[] {
  const out: AliasEntry[] = [];
  for (const c of custom ?? []) {
    if (!(c.type === 'both' || c.type === type)) continue;
    const alias = normLabel(c.label);
    if (!alias) continue;
    out.push({ id: c.id, alias, toks: alias.split(' '), custom: true, exactOnly: false, brand: false });
  }
  return out;
}

/**
 * Categorías mencionadas en `norm`. Se busca por frase completa con tolerancia a errores de
 * ortografía y plural. Orden del resultado: las personalizadas primero, luego la frase más larga
 * (y a igualdad, la que aparece antes). Las frases que se pisan se resuelven a favor de la primera
 * en ese orden: «gas propano» gana a «gas».
 *
 * Una palabra ambigua («gas» suelto) devuelve DOS coincidencias con el mismo tramo (Combustible y
 * Servicios): quien llama usa `categoryCandidates` y, si salen varias, pregunta con chips.
 */
export function resolveCategories(
  norm: string,
  custom: CustomCategory[] | undefined,
  type: 'expense' | 'income',
): CategoryMatch[] {
  const toks = tokenSpans(norm);
  if (toks.length === 0) return [];

  type Cand = CategoryMatch & { custom: boolean; ntok: number; exact: boolean; group?: string };
  const cands: Cand[] = [];

  const entries: AliasEntry[] = [
    ...customEntries(custom, type),
    ...(type === 'expense' ? EXPENSE_INDEX : INCOME_INDEX),
  ];
  for (const e of entries) {
    let from = 0;
    while (from < toks.length) {
      const at = findPhraseAt(toks, e.toks, e.exactOnly, from);
      if (at < 0) break;
      cands.push({
        id: e.id, alias: e.alias, start: toks[at].start, end: toks[at + e.toks.length - 1].end,
        custom: e.custom, ntok: e.toks.length,
        exact: norm.slice(toks[at].start, toks[at + e.toks.length - 1].end) === e.alias,
      });
      from = at + 1;
    }
  }

  if (type === 'expense') {
    for (const amb of AMBIGUOUS_ALIASES) {
      for (const tk of toks) {
        if (tk.t !== amb.alias) continue;
        for (const id of amb.ids) {
          cands.push({ id, alias: amb.alias, start: tk.start, end: tk.end, custom: false, ntok: 1, exact: true, group: amb.alias });
        }
      }
    }
  }

  cands.sort((a, b) => {
    if (a.custom !== b.custom) return a.custom ? -1 : 1;
    if (a.ntok !== b.ntok) return b.ntok - a.ntok;
    if (a.exact !== b.exact) return a.exact ? -1 : 1;   // lo escrito tal cual gana a lo corregido
    if (a.alias.length !== b.alias.length) return b.alias.length - a.alias.length;
    return a.start - b.start;
  });

  const accepted: Cand[] = [];
  for (const c of cands) {
    const clash = accepted.filter(a => c.start < a.end && a.start < c.end);
    const tie = clash.length > 0 && clash.every(a =>
      a.start === c.start && a.end === c.end && a.alias === c.alias && a.custom === c.custom
      && a.group === c.group && a.id !== c.id);
    if (clash.length === 0 || tie) accepted.push(c);
  }
  return accepted.map(a => ({ id: a.id, alias: a.alias, start: a.start, end: a.end }));
}

/** Ids distintos de las coincidencias, en el mismo orden. Con más de uno hay que preguntar. */
export function categoryCandidates(matches: CategoryMatch[]): string[] {
  const ids: string[] = [];
  for (const m of matches) if (ids.indexOf(m.id) < 0) ids.push(m.id);
  return ids;
}

/** Chips para elegir entre categorías candidatas (`value` = id de categoría). */
export function categoryChips(ids: string[], custom: CustomCategory[] | undefined, type: 'expense' | 'income'): Chip[] {
  return ids.map(id => ({ label: categoryLabelOf(id, custom ?? [], type), value: id }));
}

/**
 * Categoría más probable para un texto libre (nombre de un gasto fijo, descripción de un
 * movimiento). Gastos: regla aprendida del comercio → sinónimos del asistente → reglas de
 * Categorizer → 'other'. Ingresos: sinónimos → reglas de ingreso de Categorizer → 'other'.
 * Siempre devuelve un id válido para el tipo (incluidas las categorías personalizadas).
 */
export function guessCategoryForText(
  text: string,
  ctx: Pick<AssistantContext, 'merchantRules'> & { settings: { customCategories: CustomCategory[] } },
  type: 'expense' | 'income',
): string {
  const custom = ctx.settings.customCategories;
  const valid = new Set(
    (type === 'expense' ? getAllExpenseCategories(custom) : getAllIncomeCategories(custom)).map(c => c.id),
  );
  const clean = (text ?? '').trim();
  if (!clean) return 'other';

  if (type === 'expense') {
    const rule = findMerchantRule(ctx.merchantRules, clean);
    if (rule && valid.has(rule.category) && rule.category !== 'transfer') return rule.category;
  }

  const matches = resolveCategories(normalizeWithMap(clean).norm, custom, type);
  if (matches.length > 0 && valid.has(matches[0].id)) return matches[0].id;

  const guess = type === 'expense'
    ? categorizeExpense(clean, null, flatText(clean))
    : categorizeIncome(flatText(clean), 'deposit');
  return valid.has(guess) && guess !== 'transfer' && guess !== 'transfer_in' ? guess : 'other';
}

// ─────────────────────────────────────────────────────────────
// CUENTAS
// ─────────────────────────────────────────────────────────────

/** Palabras de nombre de cuenta que no sirven para distinguirla de otra. */
const GENERIC_ACCOUNT_WORDS = [
  'cuenta', 'cuentas', 'banco', 'tarjeta', 'tarjetas', 'credito', 'debito', 'de', 'del', 'la', 'el', 'los', 'las',
  'mi', 'mis', 'y', 'en', 'con', 'a', 'efectivo', 'cash', 'ahorro', 'ahorros', 'monetaria',
];

/** Palabras de tipo de cuenta: tarjeta/crédito = credit, efectivo = cash, débito = bank. */
const ACCOUNT_TYPE_WORDS: Record<string, Account['type']> = {
  tarjeta: 'credit', tarjetas: 'credit', credito: 'credit', tc: 'credit',
  efectivo: 'cash', cash: 'cash',
  debito: 'bank',
};

function distinctiveWords(label: string | undefined): string[] {
  if (!label) return [];
  return normLabel(label).split(' ').filter(w => w.length >= 2 && GENERIC_ACCOUNT_WORDS.indexOf(w) < 0);
}

/**
 * Cuentas mencionadas: por nombre o por banco (todas las palabras distintivas = mejor coincidencia;
 * alguna sola = coincidencia parcial) y por palabra de tipo. Solo cuentas activas. Si hay
 * coincidencia por nombre/banco se descarta lo que solo coincide por tipo, y entre las de nombre
 * se queda el mejor nivel. Varias candidatas → quien llama ofrece chips.
 */
export function resolveAccount(norm: string, accounts: Account[]): Account[] {
  const toks = tokenSpans(norm).map(t => t.t);
  if (toks.length === 0) return [];

  const wanted = new Set<Account['type']>();
  for (const t of toks) if (ACCOUNT_TYPE_WORDS[t]) wanted.add(ACCOUNT_TYPE_WORDS[t]);

  const has = (w: string) => toks.some(t => wordMatches(t, w, w.length < 5));
  const scoreOf = (words: string[]): number => {
    if (words.length === 0) return 0;
    return words.filter(has).length;   // más palabras distintivas = mejor coincidencia
  };

  const scored: { acc: Account; score: number; order: number }[] = [];
  accounts.forEach((acc, order) => {
    if (acc.isActive === false) return;
    const score = Math.max(scoreOf(distinctiveWords(acc.name)), scoreOf(distinctiveWords(acc.bankName)));
    scored.push({ acc, score, order });
  });

  const named = scored.filter(s => s.score > 0);
  if (named.length > 0) {
    const preferred = wanted.size > 0 ? named.filter(s => wanted.has(s.acc.type)) : [];
    const pool = preferred.length > 0 ? preferred : named;
    const top = Math.max(...pool.map(s => s.score));
    return pool.filter(s => s.score === top).sort((a, b) => a.order - b.order).map(s => s.acc);
  }
  if (wanted.size > 0) return scored.filter(s => wanted.has(s.acc.type)).map(s => s.acc);
  return [];
}

// ─────────────────────────────────────────────────────────────
// COMERCIOS
// ─────────────────────────────────────────────────────────────

/** Palabras que nunca son un comercio (verbos de consulta, rangos, conectores). */
const MERCHANT_STOP = new Set([
  'de', 'del', 'la', 'el', 'los', 'las', 'en', 'con', 'a', 'al', 'por', 'para', 'que', 'y', 'o', 'un', 'una', 'mi', 'mis', 'me',
  'gaste', 'gasto', 'gastos', 'gastado', 'gastamos', 'pague', 'pago', 'pagos', 'compre', 'compra', 'compras', 'cuanto', 'cuantos',
  'cuanta', 'total', 'llevo', 'muestrame', 'mostrame', 'ensename', 'ver', 'lista', 'listame', 'movimiento', 'movimientos',
  'hoy', 'ayer', 'anteayer', 'antier', 'manana', 'semana', 'semanas', 'mes', 'meses', 'ano', 'anos', 'periodo', 'quincena',
  'ciclo', 'pasado', 'pasada', 'anterior', 'ultimos', 'ultimo', 'este', 'esta', 'estos', 'actual', 'desde', 'hasta',
  'tengo', 'hay', 'hice', 'fue', 'fueron', 'solo', 'todo', 'todos', 'q', 'usd', 'quetzales', 'dolares',
]);

function isTransferLikeTx(t: Transaction): boolean {
  return t.type === 'transfer' || !!t.transferPairId;
}

/** Texto en el que se busca el comercio de un movimiento: comercio + descripción, normalizado. */
function merchantHay(t: Transaction): string {
  return normalizeWithMap((merchantOfTransaction(t) ?? '') + ' ' + (t.description ?? '')).norm;
}

/**
 * ¿El movimiento es de ese comercio? Acepta la clave (`merchantKey`), la etiqueta o lo que haya
 * escrito el usuario: coincide como frase en comercio + descripción, o por clave de aprendizaje
 * («pollocampero» y «Pollo Campero» son el mismo). Es el criterio con el que `resolveMerchant`
 * cuenta, así que Queries debe usar esta misma función para filtrar.
 */
export function txMatchesMerchant(tx: Transaction, merchant: string): boolean {
  const k = normalizeWithMap(merchant).norm;
  if (!k) return false;
  if (hasPhrase(merchantHay(tx), k)) return true;
  const mk = merchantKey(merchantOfTransaction(tx) ?? tx.description);
  return mk !== null && (mk === k || mk.indexOf(k + ' ') === 0);
}

/**
 * Comercio mencionado en `norm` que tenga movimientos en `ctx.transactions` (se ignoran las
 * transferencias). Gana la frase más larga; las palabras que solo son una categoría genérica
 * («supermercado», «gasolina», «restaurantes») no cuentan como comercio, pero sí las marcas
 * («Spotify», «Shell»): con movimientos de la marca se filtra por comercio y no por categoría.
 * `label` es el nombre tal como aparece en los movimientos, `key` su `merchantKey` y `count` los
 * movimientos que cumplen `txMatchesMerchant(tx, key)`.
 */
export function resolveMerchant(
  norm: string,
  ctx: { transactions: Transaction[]; settings?: { customCategories: CustomCategory[] } },
  opts?: { excludeSpans?: [number, number][] },
): { label: string; key: string; count: number } | null {
  const toks = tokenSpans(norm);
  if (toks.length === 0) return null;
  const txs = ctx.transactions.filter(t => !isTransferLikeTx(t));
  if (txs.length === 0) return null;

  // Tramos de categoría genérica (no marca): ahí no se busca comercio.
  const custom = ctx.settings?.customCategories;
  const generic: [number, number][] = [];
  for (const type of ['expense', 'income'] as const) {
    const brandSet = type === 'expense' ? new Set(BRAND_ALIASES) : new Set<string>();
    for (const m of resolveCategories(norm, custom, type)) {
      if (!brandSet.has(m.alias)) generic.push([m.start, m.end]);
    }
  }
  const insideGeneric = (t: Tok) => generic.some(([s, e]) => t.start >= s && t.end <= e);

  // Textos distintos de comercio + descripción (agrupados para no repetir el trabajo).
  const hays = new Map<string, { toks: string[]; label: string; n: number }>();
  for (const t of txs) {
    const h = merchantHay(t);
    if (!h) continue;
    const label = (merchantOfTransaction(t) || t.description || '').replace(/\s+/g, ' ').trim();
    const cur = hays.get(h);
    if (cur) cur.n++;
    else hays.set(h, { toks: h.split(' '), label, n: 1 });
  }
  if (hays.size === 0) return null;

  let best: { len: number; n: number; phrase: string; label: string } | null = null;
  const maxN = 4;
  for (let i = 0; i < toks.length; i++) {
    for (let n = Math.min(maxN, toks.length - i); n >= 1; n--) {
      const gram = toks.slice(i, i + n);
      const first = gram[0];
      const last = gram[n - 1];
      if (MERCHANT_STOP.has(first.t) || MERCHANT_STOP.has(last.t)) continue;
      if (first.t.length < 3 && n === 1) continue;
      if (gram.some(g => g.t.length < 2)) continue;
      if (gram.every(g => /^[0-9]+([.,][0-9]+)?$/.test(g.t))) continue;
      if (gram.some(g => overlapsAny(g.start, g.end, opts?.excludeSpans))) continue;
      if (gram.every(insideGeneric)) continue;
      const words = gram.map(g => g.t);
      let found = 0;
      let label = '';
      let labelN = 0;
      hays.forEach(h => {
        const probe = h.toks.map((t, idx) => ({ t, start: idx, end: idx + 1 }));
        if (findPhraseAt(probe, words, false) >= 0) {
          found += h.n;
          if (h.n > labelN) { labelN = h.n; label = h.label; }
        }
      });
      if (found === 0) continue;
      const len = words.join(' ').length;
      if (!best || len > best.len || (len === best.len && found > best.n)) {
        best = { len, n: found, phrase: words.join(' '), label };
      }
    }
  }
  if (!best) return null;

  const label = best.label || best.phrase;
  let key = merchantKey(label) ?? best.phrase;
  let count = txs.filter(t => txMatchesMerchant(t, key)).length;
  if (count === 0) {
    key = best.phrase;
    count = txs.filter(t => txMatchesMerchant(t, key)).length;
  }
  if (count === 0) return null;
  return { label, key, count };
}

// ─────────────────────────────────────────────────────────────
// NOMBRES LIBRES (metas, gastos fijos, descripciones)
// ─────────────────────────────────────────────────────────────

/** Largo máximo de un nombre libre. */
export const FREE_NAME_MAX = 40;

const ARTICLES = new Set(['un', 'una', 'unos', 'unas', 'el', 'la', 'los', 'las', 'mi', 'mis', 'tu', 'tus', 'su', 'sus']);
const CONNECTORS = new Set(['de', 'del', 'para', 'por', 'con', 'a', 'al', 'en', 'y', 'o', 'que', 'un', 'una', 'el', 'la', 'los', 'las', 'mi', 'mis']);
const DATE_WORDS = new Set([
  'hoy', 'ayer', 'anteayer', 'antier', 'manana', 'pasado', 'fin', 'mes', 'ano', 'anio', 'semana', 'proximo', 'proxima', 'dia', 'dias',
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre', 'octubre', 'noviembre', 'diciembre',
  'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'navidad', 'este', 'esta',
]);
/** Palabras que cierran un nombre libre ya empezado. */
const NAME_STOPS = new Set([
  'para', 'por', 'con', 'usando', 'desde', 'hasta', 'antes', 'cada', 'todos', 'todas', 'mensual', 'mensualmente', 'que',
  'ayer', 'hoy', 'anteayer', 'antier', 'manana', 'este', 'esta', 'q', 'usd', 'us', 'dolares', 'quetzales', 'varas',
]);
/** Palabras con las que no puede empezar un nombre libre (son otra cosa: cuenta, fecha, verbo). */
const NAME_BAD_START = new Set([
  'tarjeta', 'efectivo', 'cuenta', 'todos', 'todas', 'cada', 'mensual', 'mensualmente', 'siempre',
  'ahorrar', 'juntar', 'reunir', 'ahorro', 'q', 'usd', 'us', 'dolares', 'quetzales', 'varas',
]);
/** Palabras que se saltan al principio para encontrar el nombre de un gasto fijo. */
const LEAD_SKIP = new Set([
  'crea', 'creame', 'cree', 'crear', 'agrega', 'agregame', 'agregar', 'anade', 'anademe', 'anota', 'anotame', 'registra', 'registrame',
  'pon', 'ponme', 'pone', 'nuevo', 'nueva', 'gasto', 'pago', 'fijo', 'fija', 'recurrente', 'haceme', 'hazme', 'hace', 'haz',
  'quiero', 'necesito', 'me', 'por', 'favor', 'un', 'una', 'el', 'la', 'los', 'las', 'mi', 'mis', 'de', 'para', 'llamado', 'llamada', 'otro', 'otra',
]);

const EDGE_PUNCT_START = /^[\s,.;:\-–—"'()¿?¡!]+/;
const EDGE_PUNCT_END = /[\s,.;:\-–—"'()¿?¡!]+$/;

/**
 * Deja un nombre libre listo para guardar: sin artículos al inicio ni conectores al final, con la
 * primera letra en mayúscula (un texto TODO EN MAYÚSCULAS se pasa a minúsculas) y de máximo 40
 * caracteres. Conserva las mayúsculas y tildes que escribió el usuario («Viaje a Antigua»).
 */
export function cleanFreeName(raw: string, max: number = FREE_NAME_MAX): string {
  let s = (raw ?? '').replace(/\s+/g, ' ').replace(EDGE_PUNCT_START, '').replace(EDGE_PUNCT_END, '');
  for (let guard = 0; guard < 4; guard++) {
    const m = /^(un|una|unos|unas|el|la|los|las|mi|mis|tu|tus|su|sus)\s+/i.exec(s);
    if (!m) break;
    s = s.slice(m[0].length);
  }
  for (let guard = 0; guard < 4; guard++) {
    const m = /\s+(de|del|para|por|con|a|al|en|y|o|que)$/i.exec(s);
    if (!m) break;
    s = s.slice(0, s.length - m[0].length);
  }
  s = s.replace(EDGE_PUNCT_END, '');
  if (!s || /^(un|una|unos|unas|el|la|los|las|mi|mis|tu|tus|su|sus|de|del|para|por|con|a|al|en|y|o|que)$/i.test(s)) return '';
  if (s === s.toUpperCase() && s !== s.toLowerCase()) s = s.toLowerCase();
  s = s.charAt(0).toUpperCase() + s.slice(1);
  if (s.length > max) s = s.slice(0, max).replace(EDGE_PUNCT_END, '');
  return s;
}

/**
 * Recorta del texto crudo el nombre que empieza en la palabra `from`: salta artículos, se corta en
 * el primer tramo ya consumido (monto, fecha…) o en una palabra de cierre, y quita conectores
 * sueltos al final. Devuelve null si no queda nada utilizable.
 */
function nameFrom(
  raw: string, map: number[], toks: Tok[], from: number,
  consumed: [number, number][] | undefined, extraStops: Set<string>,
): string | null {
  let i = from;
  while (i < toks.length && ARTICLES.has(toks[i].t)) i++;
  const startIdx = i;
  if (startIdx >= toks.length) return null;
  if (NAME_BAD_START.has(toks[startIdx].t) || DATE_WORDS.has(toks[startIdx].t)) return null;

  let last = -1;
  for (; i < toks.length; i++) {
    const t = toks[i];
    if (overlapsAny(t.start, t.end, consumed)) break;
    if (i > startIdx && (NAME_STOPS.has(t.t) || extraStops.has(t.t))) break;
    last = i;
  }
  while (last >= startIdx && CONNECTORS.has(toks[last].t)) last--;
  if (last < startIdx) return null;
  if (overlapsAny(toks[startIdx].start, toks[startIdx].end, consumed)) return null;

  const a = map[toks[startIdx].start];
  const b = map[toks[last].end - 1];
  if (a === undefined || b === undefined) return null;
  const name = cleanFreeName(raw.slice(a, b + 1));
  return name.length > 0 ? name : null;
}

const NO_STOPS = new Set<string>();

/**
 * Nombre libre de una meta de ahorro. Patrones, en este orden: «ahorrar|juntar|reunir para …»,
 * «meta (de|para|llamada) …», y cualquier «para …». Termina en el primer tramo consumido (monto,
 * fecha) o en «para/por/con».
 *   «una meta para una laptop de 5k para fin de año» → «Laptop»
 *   «quiero ahorrar para el viaje a Antigua»         → «Viaje a Antigua»
 * `consumed` son tramos [start, end) de `norm` ya usados por otros extractores. Null si no hay nombre.
 */
export function extractGoalName(
  raw: string, norm: string, map: number[], consumed?: [number, number][],
): string | null {
  const toks = tokenSpans(norm);
  if (toks.length === 0) return null;

  // 1) «ahorrar|juntar|reunir para» (y «ahorro para»)
  for (let i = 0; i + 1 < toks.length; i++) {
    const verb = toks[i].t;
    const isVerb = ['ahorrar', 'juntar', 'reunir', 'ahorro', 'ahorrando', 'juntando'].some(v => wordMatches(verb, v, v.length < 5));
    if (isVerb && toks[i + 1].t === 'para') {
      const n = nameFrom(raw, map, toks, i + 2, consumed, NO_STOPS);
      if (n) return n;
    }
  }

  // 2) «meta (de|para|llamada|llamado|titulada)? …»
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].t !== 'meta' && toks[i].t !== 'metas') continue;
    let j = i + 1;
    if (j < toks.length && ['de', 'para', 'llamada', 'llamado', 'titulada', 'titulado'].indexOf(toks[j].t) >= 0) j++;
    const n = nameFrom(raw, map, toks, j, consumed, NO_STOPS);
    if (n) return n;
  }

  // 3) cualquier «para …»
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].t !== 'para') continue;
    const n = nameFrom(raw, map, toks, i + 1, consumed, NO_STOPS);
    if (n) return n;
  }
  return null;
}

/**
 * Descripción de un movimiento: el tramo que sigue a «en|de|a» (la primera preposición que deje un
 * nombre válido). «gasté 50 en Pollo Campero» → «Pollo Campero». Null si no hay.
 */
export function extractTxDescription(
  raw: string, norm: string, map: number[], consumed?: [number, number][],
): string | null {
  const toks = tokenSpans(norm);
  for (let i = 0; i + 1 < toks.length; i++) {
    if (toks[i].t !== 'en' && toks[i].t !== 'de' && toks[i].t !== 'a') continue;
    if (overlapsAny(toks[i].start, toks[i].end, consumed)) continue;
    const n = nameFrom(raw, map, toks, i + 1, consumed, NO_STOPS);
    if (n) return n;
  }
  return null;
}

/**
 * Nombre de un gasto fijo. Prueba: «gasto|pago fijo (de|para|llamado) …», luego la primera palabra
 * útil del mensaje tras el verbo de crear («Agrega Netflix de $15.99…» → «Netflix»), luego
 * «pago|pagar (la|el) …» y por último `extractTxDescription`.
 */
export function extractFixedName(
  raw: string, norm: string, map: number[], consumed?: [number, number][],
): string | null {
  const toks = tokenSpans(norm);
  if (toks.length === 0) return null;

  for (let i = 0; i + 1 < toks.length; i++) {
    if ((toks[i].t === 'gasto' || toks[i].t === 'pago' || toks[i].t === 'gastos' || toks[i].t === 'pagos')
      && (toks[i + 1].t === 'fijo' || toks[i + 1].t === 'fija' || toks[i + 1].t === 'fijos')) {
      let j = i + 2;
      if (j < toks.length && ['de', 'para', 'llamado', 'llamada'].indexOf(toks[j].t) >= 0) j++;
      const n = nameFrom(raw, map, toks, j, consumed, NO_STOPS);
      if (n) return n;
    }
  }

  let k = 0;
  while (k < toks.length && LEAD_SKIP.has(toks[k].t)) k++;
  if (k < toks.length) {
    const n = nameFrom(raw, map, toks, k, consumed, NO_STOPS);
    if (n) return n;
  }

  for (let i = 0; i + 1 < toks.length; i++) {
    if (toks[i].t === 'pago' || toks[i].t === 'pagar' || toks[i].t === 'pagas') {
      const n = nameFrom(raw, map, toks, i + 1, consumed, NO_STOPS);
      if (n) return n;
    }
  }
  return extractTxDescription(raw, norm, map, consumed);
}
