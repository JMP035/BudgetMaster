import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────
// SERVICIO DE TIPO DE CAMBIO USD → Q
// Fuente principal: Banco de Guatemala (Banguat)
// Fuente de respaldo: Open Exchange Rates (sin clave)
// Cache de 6 horas
// ─────────────────────────────────────────────────────────────

const CACHE_KEY = '@bm_exchange_rate';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

interface CachedRate {
  rate: number;
  source: string;
  timestamp: number;
}

interface RateResult {
  rate: number;
  source: string;
}

// Tasa de respaldo si no hay conexión
const FALLBACK_RATE = 7.70;
const FALLBACK_SOURCE = 'Valor por defecto (sin conexión)';

async function fetchFromBanguat(): Promise<RateResult> {
  // API pública del Banco de Guatemala (tipo de cambio referencial)
  const res = await fetch(
    'https://apis.banguat.gob.gt/v1/cambio/referencial',
    { headers: { Accept: 'application/json' } }
  );
  if (!res.ok) throw new Error('Banguat no disponible');
  const json = await res.json();
  // La respuesta tiene la forma: { cambio: [ { venta: "7.72000", ... } ] }
  const venta = parseFloat(json?.cambio?.[0]?.venta);
  if (isNaN(venta) || venta <= 0) throw new Error('Tasa inválida de Banguat');
  return { rate: venta, source: 'Banco de Guatemala (Banguat)' };
}

async function fetchFromFallback(): Promise<RateResult> {
  // API pública sin clave: exchangerate-api.com
  const res = await fetch('https://open.er-api.com/v6/latest/USD');
  if (!res.ok) throw new Error('Exchange API no disponible');
  const json = await res.json();
  const rate = parseFloat(json?.rates?.GTQ);
  if (isNaN(rate) || rate <= 0) throw new Error('Tasa GTQ inválida');
  return { rate, source: 'Open Exchange Rates (mercado)' };
}

export const ExchangeRateService = {
  /**
   * Devuelve la tasa guardada en caché si es reciente (< 6h),
   * si no, intenta actualizar desde Banguat o la API de respaldo.
   */
  async getRate(): Promise<RateResult> {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed: CachedRate = JSON.parse(cached);
        const age = Date.now() - parsed.timestamp;
        if (age < CACHE_TTL_MS) {
          return { rate: parsed.rate, source: parsed.source };
        }
      }
    } catch { /* caché corrupto, continuar */ }

    return this.forceRefresh();
  },

  /**
   * Fuerza una actualización desde la red,
   * ignorando la caché aunque sea reciente.
   */
  async forceRefresh(): Promise<RateResult> {
    let result: RateResult;

    try {
      result = await fetchFromBanguat();
    } catch {
      try {
        result = await fetchFromFallback();
      } catch {
        result = { rate: FALLBACK_RATE, source: FALLBACK_SOURCE };
      }
    }

    // Guardar en caché
    try {
      const toCache: CachedRate = { ...result, timestamp: Date.now() };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
    } catch { /* ignorar error de escritura */ }

    return result;
  },
};
