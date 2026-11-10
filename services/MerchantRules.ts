// ─────────────────────────────────────────────────────────────
// APRENDIZAJE POR COMERCIO (módulo PURO)
// ─────────────────────────────────────────────────────────────
// Sin react-native ni AsyncStorage: solo `import type` de ./storage y
// funciones puras de ./Categorizer. La persistencia vive en StorageService
// (getMerchantRules / saveTransactionWithLearning / ...).
//
// Una "clave de comercio" es el nombre del comercio normalizado (sin número
// de sucursal, zona, # ni ciudad). Las reglas aprendidas coinciden por prefijo
// de tokens: gana la clave más larga y la última corrección gana.

import type { MerchantRule, Transaction } from './storage';
import { extractMerchantAndLocation, flatText } from './Categorizer';
import { findBrand, stripGateway } from './GuatemalaBrands';

/** Tope de reglas aprendidas; al excederlo se descartan las de updatedAt más viejo. */
const MAX_MERCHANT_RULES = 500;

/** Máximo de tokens que forman la clave. */
const MAX_KEY_TOKENS = 4;

/** Claves demasiado genéricas para aprender de ellas (afectarían a comercios no relacionados). */
const GENERIC_KEYS = [
  'pago', 'compra', 'tienda', 'servicio', 'servicios', 'super', 'farmacia',
  'restaurante', 'restaurant', 'restauran', 'restaurantes', 'app', 'pos', 'comercio', 'movimiento',
];

/** Ciudades que el SMS agrega al final del comercio. */
const TRAILING_CITY_RE = /(?:^|\s+)(?:guatemala|guate|gt|gua|mixco|villa nueva)$/;

function keyText(s: string): string {
  return flatText(s)
    .replace(/[^a-z0-9& ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Normaliza un comercio a su clave de aprendizaje. Devuelve null si no hay una
 * clave utilizable (vacía, de menos de 3 caracteres o genérica). Si el comercio
 * pertenece a una marca del catálogo (GuatemalaBrands) la clave sale del nombre
 * canónico: "San Martin Majadas" y "San Martin Aranda" dan la misma clave 'san martin'.
 */
export function merchantKey(merchant: string | null | undefined): string | null {
  if (!merchant) return null;

  // Sin pasarela de pago (Paggo App, PayPal...) y, si hay marca, con su nombre canónico.
  const base = stripGateway(merchant).name;
  const brand = findBrand(base);
  if (brand) {
    const bk = keyText(brand.name).split(' ').filter(Boolean).slice(0, MAX_KEY_TOKENS).join(' ');
    return bk.length < 3 ? null : bk;
  }

  const s = keyText(base);

  // Quita tokens de sucursal: números, #N, zN y "zona N" (ambos tokens).
  const raw = s.split(' ').filter(Boolean);
  const kept: string[] = [];
  for (let i = 0; i < raw.length; i++) {
    const t = raw[i];
    if (/^\d+$/.test(t) || /^#\d+$/.test(t) || /^z\d+$/.test(t)) continue;
    if (t === 'zona' && i + 1 < raw.length && /^\d+$/.test(raw[i + 1])) { i++; continue; }
    kept.push(t);
  }

  // Quita ciudades finales (puede haber más de una: "... gt guatemala").
  let joined = kept.join(' ');
  while (TRAILING_CITY_RE.test(joined)) {
    joined = joined.replace(TRAILING_CITY_RE, '').trim();
  }

  const key = joined.split(' ').filter(Boolean).slice(0, MAX_KEY_TOKENS).join(' ');
  if (key.length < 3) return null;
  if (GENERIC_KEYS.includes(key)) return null;
  return key;
}

/**
 * Busca la regla aprendida que aplica a un comercio. Coincide si la clave del
 * comercio es igual a la de la regla o empieza con ella seguida de espacio.
 * Si varias coinciden, gana la clave más larga.
 */
export function findMerchantRule(
  rules: MerchantRule[] | undefined,
  merchant: string | null,
): MerchantRule | null {
  if (!rules || rules.length === 0) return null;
  const k = merchantKey(merchant);
  if (!k) return null;
  let best: MerchantRule | null = null;
  for (const r of rules) {
    if (k === r.key || k.startsWith(r.key + ' ')) {
      if (!best || r.key.length > best.key.length) best = r;
    }
  }
  return best;
}

function tsOf(iso: string): number {
  const n = Date.parse(iso);
  return isNaN(n) ? 0 : n;
}

/**
 * Agrega o actualiza la regla del comercio. Si la clave ya existe, la reemplaza
 * (la última corrección gana): cambia categoría y updatedAt e incrementa hits.
 * Con más de 500 reglas descarta las de updatedAt más viejo. No-op si la clave es null.
 */
export function upsertMerchantRule(
  rules: MerchantRule[] | undefined,
  merchant: string,
  category: string,
  nowIso: string,
): MerchantRule[] {
  const current = rules ?? [];
  const key = merchantKey(merchant);
  if (!key) return current;

  const label = merchant.replace(/\s+/g, ' ').trim();
  const existing = current.find(r => r.key === key);
  let next: MerchantRule[];
  if (existing) {
    next = current.map(r => r.key === key
      ? { ...r, label, category, updatedAt: nowIso, hits: r.hits + 1 }
      : r);
  } else {
    next = [...current, { key, label, category, createdAt: nowIso, updatedAt: nowIso, hits: 1 }];
  }

  if (next.length > MAX_MERCHANT_RULES) {
    next = [...next]
      .sort((a, b) => tsOf(b.updatedAt) - tsOf(a.updatedAt))
      .slice(0, MAX_MERCHANT_RULES);
  }
  return next;
}

/** Comercio de un movimiento: el guardado o, si falta, el que se extrae del SMS original. */
export function merchantOfTransaction(tx: Transaction): string | null {
  return tx.merchant ?? (tx.originalSMS ? extractMerchantAndLocation(tx.originalSMS).merchant : null);
}

/**
 * Ids de OTROS movimientos que comparten comercio con `tx` y pueden recibir su
 * categoría: source 'sms', gasto y sin categoría editada a mano.
 */
export function sameMerchantTxIds(txs: Transaction[], tx: Transaction): string[] {
  const key = merchantKey(merchantOfTransaction(tx));
  if (!key) return [];
  const temp: MerchantRule[] = [{
    key, label: key, category: tx.category, createdAt: '', updatedAt: '', hits: 0,
  }];
  const ids: string[] = [];
  for (const t of txs) {
    if (t.id === tx.id) continue;
    if (t.source !== 'sms' || t.type !== 'expense' || t.categoryEditedAt) continue;
    if (findMerchantRule(temp, merchantOfTransaction(t))) ids.push(t.id);
  }
  return ids;
}
