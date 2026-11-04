import AsyncStorage from '@react-native-async-storage/async-storage';

// ─────────────────────────────────────────────────────────────
// SERVICIO DE TIPO DE CAMBIO USD → Q
// Fuente principal: Banco de Guatemala (Banguat)
// Fuente de respaldo: Open Exchange Rates (sin clave)
// Cache de 6 horas. El valor de respaldo (sin conexión) NUNCA se cachea:
// si ambas fuentes de red fallan, la próxima llamada vuelve a intentar
// conectarse en vez de quedarse pegada a FALLBACK_RATE por 6 horas.
// ─────────────────────────────────────────────────────────────

const CACHE_KEY = '@bm_exchange_rate';
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 horas

export interface CachedRate {
  rate: number;
  source: string;
  timestamp: number;
}

export interface RateResult {
  rate: number;
  source: string;
  /** Momento (ms epoch) en que se obtuvo/guardó la tasa */
  timestamp: number;
  /** true si no hubo red y se devolvió el último valor guardado (o el de respaldo) */
  offline: boolean;
}

type RawRate = { rate: number; source: string };

// Tasa de respaldo si no hay conexión
const FALLBACK_RATE = 7.70;
const FALLBACK_SOURCE = 'Valor por defecto (sin conexión)';

const FETCH_TIMEOUT_MS = 10000;

/** fetch con timeout vía AbortController (mismo patrón que callGemini en AIAdvisor). Si vence, el fetch rechaza (AbortError) y cae en el manejo de error existente. */
async function fetchWithTimeout(url: string, init: RequestInit = {}, timeoutMs: number = FETCH_TIMEOUT_MS): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchFromBanguat(): Promise<RawRate> {
  // API pública del Banco de Guatemala (tipo de cambio referencial)
  const res = await fetchWithTimeout(
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

async function fetchFromFallback(): Promise<RawRate> {
  // API pública sin clave: exchangerate-api.com
  const res = await fetchWithTimeout('https://open.er-api.com/v6/latest/USD');
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
        // Una entrada cacheada con la fuente de respaldo es inválida (de
        // versiones anteriores que sí la cacheaban): no se usa, se reintenta.
        if (age < CACHE_TTL_MS && parsed.source !== FALLBACK_SOURCE) {
          return { rate: parsed.rate, source: parsed.source, timestamp: parsed.timestamp, offline: false };
        }
      }
    } catch { /* caché corrupto, continuar */ }

    return this.forceRefresh();
  },

  /**
   * Última tasa guardada en caché (aunque esté vencida), o null si no hay una
   * válida. Ignora entradas con la fuente de respaldo.
   */
  async getCachedRate(): Promise<CachedRate | null> {
    try {
      const cached = await AsyncStorage.getItem(CACHE_KEY);
      if (!cached) return null;
      const parsed: CachedRate = JSON.parse(cached);
      if (!parsed || !(parsed.rate > 0) || parsed.source === FALLBACK_SOURCE) return null;
      return parsed;
    } catch {
      return null;
    }
  },

  /**
   * Fuerza una actualización desde la red, ignorando la caché aunque sea
   * reciente. Si ambas fuentes fallan devuelve la última tasa guardada
   * (offline: true); solo si no existe ninguna usa FALLBACK_RATE.
   */
  async forceRefresh(): Promise<RateResult> {
    let fetched: RawRate;

    try {
      fetched = await fetchFromBanguat();
    } catch {
      try {
        fetched = await fetchFromFallback();
      } catch {
        const cached = await this.getCachedRate();
        if (cached) {
          return { rate: cached.rate, source: cached.source, timestamp: cached.timestamp, offline: true };
        }
        // El valor de respaldo nunca se cachea.
        return { rate: FALLBACK_RATE, source: FALLBACK_SOURCE, timestamp: Date.now(), offline: true };
      }
    }

    const timestamp = Date.now();
    try {
      const toCache: CachedRate = { ...fetched, timestamp };
      await AsyncStorage.setItem(CACHE_KEY, JSON.stringify(toCache));
    } catch { /* ignorar error de escritura */ }

    return { ...fetched, timestamp, offline: false };
  },
};
