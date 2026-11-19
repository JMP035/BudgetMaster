// Sincronización automática de SMS al abrir la app. Nunca pide permisos.
import { Platform } from 'react-native';
import { StorageService } from './storage';
import type { UserSettings } from './storage';
import { SmsService } from './SmsService';
import type { SyncResult } from './SmsService';
import { isSmsFeatureOn } from './features';
import { createSingleFlight } from './SingleFlight';

/** No más de una sincronización automática cada 15 minutos (persistido en SmsSyncState.lastAutoAttemptAt). */
export const AUTO_SYNC_MIN_INTERVAL_MS = 15 * 60 * 1000;

/**
 * Candado de módulo: aunque haya dos copias de la pantalla de entrada o dos disparadores a la vez (arranque y vuelta a
 * primer plano), solo una sincronización automática corre; la otra devuelve null. El límite de 15 minutos se lee y se
 * escribe en storage (async), así que sin este candado dos llamadas simultáneas pasarían las dos el límite.
 */
const autoSyncGate = createSingleFlight();

/** Devuelve null si no corrió (condiciones no cumplidas, límite de frecuencia, otra sincronización en curso o error silencioso). */
export function maybeAutoSync(settings: UserSettings): Promise<SyncResult | null> {
  return autoSyncGate.tryRun(() => runAutoSync(settings));
}

async function runAutoSync(settings: UserSettings): Promise<SyncResult | null> {
  if (Platform.OS !== 'android') return null;
  try {
    if (!settings.onboardingComplete) return null;
    if (!isSmsFeatureOn(settings)) return null;
    if (settings.smsAutoSync === false) return null;
    if (!(await SmsService.hasReadSmsPermission())) return null;

    const state = await StorageService.getSmsSyncState();
    const last = state.lastAutoAttemptAt ? Date.parse(state.lastAutoAttemptAt) : NaN;
    const now = Date.now();
    // Si el reloj retrocedió (last en el futuro) no se bloquea para siempre.
    if (!isNaN(last) && now >= last && now - last < AUTO_SYNC_MIN_INTERVAL_MS) return null;

    // Se guarda ANTES de sincronizar: si falla, no se reintenta en bucle.
    await StorageService.saveSmsSyncState({ lastAutoAttemptAt: new Date(now).toISOString() });
    return await SmsService.syncBankSms({ mode: 'auto' });
  } catch (e) {
    console.warn('SMS auto-sync error:', e instanceof Error ? e.message : 'desconocido');
    return null;
  }
}
