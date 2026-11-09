import { PermissionsAndroid, Platform } from 'react-native';
// @ts-ignore
import SmsAndroid from 'react-native-get-sms-android';
import { Account, StorageService } from './storage';
import {
  buildExistingSmsIndex, buildRecordFromClassification, classifyBankSms, emptySmsStats,
  planSmsImport, reasonLabelFor, reviewImportedSms,
} from './BankSmsParser';
import type { ParsedSmsResult, SmsImportPlan, SmsImportStats, SmsKind, SmsReviewItem } from './BankSmsParser';
import type { CreditInstallment, SmsInboxItem, Transaction } from './storage';

// El motor de parseo vive en BankSmsParser (puro, probado con `npm run test:sms`).
// Aquí solo queda lo que toca APIs de Android: permisos y lectura de la bandeja.
export { buildRecordFromClassification };
export type { ParsedSmsResult, SmsImportStats, SmsKind, SmsReviewItem };

// ─────────────────────────────────────────────────────────────
// RESULTADO DEL SYNC
// ─────────────────────────────────────────────────────────────
export interface SyncResult {
  /** Movimientos NUEVOS creados en esta sincronización. */
  transactions: Transaction[];
  /** Visacuotas NUEVAS creadas en esta sincronización. */
  installments: CreditInstallment[];
  totalRead: number;
  /** Mensajes bancarios candidatos (= stats.bankCandidates). */
  totalMatched: number;
  /** Ya registrados + descartados por el usuario (= duplicates + dismissedByUser). */
  totalSkipped: number;
  /** Mensajes bancarios que no generaron movimiento (promos, OTP, rechazados, avisos, no reconocidos...). */
  totalIgnored: number;
  stats: SmsImportStats;
  /** Movimientos SMS ya guardados que conviene eliminar o corregir (hay que confirmarlo con el usuario). */
  reviewItems: SmsReviewItem[];
  /** Mensajes bancarios no importados (máx. 300), para el diagnóstico compartible. */
  diagnostics: SmsImportPlan['diagnostics'];
  /** Buzón persistido de SMS que el motor no entendió (sin ignorados ni registrados). */
  inbox: SmsInboxItem[];
}

export type SmsPermissionStatus = 'granted' | 'denied' | 'never_ask_again' | 'unavailable';

export interface SmsPermissionDetail {
  status: SmsPermissionStatus;
  apiLevel: number | null;
  /** true si Android respondió "no volver a preguntar" al instante (típico de "Configuración restringida"). */
  instantDenial: boolean;
  manufacturer: string;
}

function emptySyncResult(): SyncResult {
  return {
    transactions: [], installments: [], totalRead: 0, totalMatched: 0, totalSkipped: 0, totalIgnored: 0,
    stats: emptySmsStats(), reviewItems: [], diagnostics: [], inbox: [],
  };
}

// ─────────────────────────────────────────────────────────────
// SERVICIO PRINCIPAL
// ─────────────────────────────────────────────────────────────
export const SmsService = {

  isSmsModuleAvailable(): boolean {
    return Platform.OS === 'android' && !!SmsAndroid && typeof SmsAndroid.list === 'function';
  },

  async requestReadSmsPermissionDetailed(): Promise<SmsPermissionDetail> {
    if (Platform.OS !== 'android') {
      return { status: 'unavailable', apiLevel: null, instantDenial: false, manufacturer: '' };
    }
    const apiLevel = typeof Platform.Version === 'number' ? Platform.Version : null;
    const manufacturer = ((Platform.constants as { Manufacturer?: string } | undefined)?.Manufacturer) ?? '';
    try {
      if (await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS)) {
        return { status: 'granted', apiLevel, instantDenial: false, manufacturer };
      }
      const startedAt = Date.now();
      const res = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.READ_SMS, {
        title: 'Permiso para leer SMS bancarios',
        message: 'BudgetMaster necesita leer tus SMS para detectar los mensajes de tu banco (compras, débitos, abonos) y registrarlos solo. Únicamente se procesan mensajes bancarios y todo queda en tu teléfono.',
        buttonPositive: 'Permitir',
        buttonNegative: 'Ahora no',
      });
      const elapsed = Date.now() - startedAt;
      let status: SmsPermissionStatus = 'denied';
      if (res === PermissionsAndroid.RESULTS.GRANTED) status = 'granted';
      else if (res === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) status = 'never_ask_again';
      // Un "no volver a preguntar" sin diálogo visible (<350 ms) suele ser "Configuración restringida".
      return { status, apiLevel, instantDenial: status === 'never_ask_again' && elapsed < 350, manufacturer };
    } catch (e) {
      console.warn('requestReadSmsPermissionDetailed error:', e);
      return { status: 'denied', apiLevel, instantDenial: false, manufacturer };
    }
  },

  async ensureReadSmsPermission(): Promise<SmsPermissionStatus> {
    return (await this.requestReadSmsPermissionDetailed()).status;
  },

  async syncBankSms(): Promise<SyncResult> {
    if (Platform.OS !== 'android') return emptySyncResult();

    if (!this.isSmsModuleAvailable()) throw new Error('SMS_MODULE_UNAVAILABLE');
    const hasPerm = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    if (!hasPerm) throw new Error('SMS_PERMISSION_DENIED');

    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();
    const filter = { box: 'inbox', minDate: threeMonthsAgo, indexFrom: 0, maxCount: 5000 };

    return new Promise<SyncResult>((resolve, reject) => {
      SmsAndroid.list(
        JSON.stringify(filter),
        (fail: string) => { console.error('SMS list failed:', fail); reject(new Error(fail)); },
        async (_count: number, smsList: string) => {
          try {
            let parsedList: Array<{ body?: string; date?: number | string; address?: string }> = [];
            try { parsedList = JSON.parse(smsList); } catch {
              resolve(emptyResultWithRead(0));
              return;
            }
            const messages = (Array.isArray(parsedList) ? parsedList : [])
              .filter(m => typeof m?.body === 'string' && Number(m.date) >= threeMonthsAgo)
              .map(m => ({ body: m.body as string, address: m.address, receivedAt: Number(m.date) }));

            const [txs, insts, dismissed, kept, accounts, rules] = await Promise.all([
              StorageService.getTransactions(),
              StorageService.getCreditInstallments(),
              StorageService.getDismissedSms(),
              StorageService.getSmsReviewKept(),
              StorageService.getAccounts(),
              StorageService.getMerchantRules(),
            ]);

            const index = buildExistingSmsIndex(txs, insts, dismissed);
            const plan = planSmsImport(messages, index, accounts, { merchantRules: rules, existingTxs: txs });

            const after = await StorageService.importSmsBatch(plan.transactions, plan.installments);
            const inbox = await StorageService.replaceSmsInbox(
              plan.unrecognized.filter(i => !index.fingerprints.has(i.fingerprint) && !index.dismissed.has(i.fingerprint)),
            );
            const reviewItems = reviewImportedSms(after.transactions, new Set(kept), { merchantRules: rules });

            const s = plan.stats;
            console.log(
              `SMS Sync: leidos=${s.totalRead}, bancarios=${s.bankCandidates}, importados=${s.imported}, cuotas=${s.installments}, ` +
              `duplicados=${s.duplicates}, descartados=${s.dismissedByUser}, promos=${s.promos}, otp=${s.otp}, ` +
              `rechazados=${s.declined}, info=${s.info}, avisos=${s.notices}, propias=${s.ownTransfers}, no_confiables=${s.untrusted}, ` +
              `no_reconocidos=${s.unparsed}, buzon=${inbox.length}, revision=${reviewItems.length}`
            );

            resolve({
              transactions: plan.transactions,
              installments: plan.installments,
              totalRead: s.totalRead,
              totalMatched: s.bankCandidates,
              totalSkipped: s.duplicates + s.dismissedByUser,
              totalIgnored: s.bankCandidates - s.imported - s.installments - s.duplicates - s.dismissedByUser,
              stats: s,
              reviewItems,
              diagnostics: plan.diagnostics,
              inbox,
            });
          } catch (e) {
            console.warn('SMS sync error:', e instanceof Error ? e.message : 'desconocido');
            reject(e instanceof Error ? e : new Error('SMS_SYNC_FAILED'));
          }
        }
      );
    });
  },

  /**
   * Adaptador para AddScreen (texto pegado, sin remitente). Misma firma de siempre.
   * Devuelve null si el SMS no es un movimiento reconocible (usar explainSms para el motivo).
   */
  parseSimpleSms(body: string, smsDate?: number, accounts: Account[] = []): ParsedSmsResult | null {
    const c = classifyBankSms({ body, receivedAt: smsDate });
    return buildRecordFromClassification(c, body, accounts);
  },

  /** Explica en español por qué un SMS se aceptó o no (para mensajes de UI). */
  explainSms(body: string): { accepted: boolean; kind: SmsKind; reasonLabel: string } {
    const c = classifyBankSms({ body });
    return {
      accepted: c.accepted,
      kind: c.kind,
      reasonLabel: c.accepted ? 'Movimiento bancario reconocido' : reasonLabelFor(c.kind),
    };
  },
};

function emptyResultWithRead(totalRead: number): SyncResult {
  const r = emptySyncResult();
  r.totalRead = totalRead;
  r.stats.totalRead = totalRead;
  return r;
}
