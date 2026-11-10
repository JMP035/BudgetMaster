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
import type { FixedMatch } from './FixedExpenseMatcher';
import type { DupPair } from './DuplicateDetector';
import type { TransferPair } from './TransferPairs';
import type { SmsBatchRecord } from './storage';
import { assignAccountsToTransactions, collectLinkSeen, extractSmsLinkSignals, isPendingUnassigned, matchAccountForSms } from './AccountLinking';
import { findFixedFusions, matchFixedExpenses } from './FixedExpenseMatcher';
import { merchantKey, merchantOfTransaction } from './MerchantRules';
import { findManualSmsDuplicates } from './DuplicateDetector';
import { findTransferPairs } from './TransferPairs';

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
  /** Id del lote registrado para "Deshacer" (null si no se importó ni marcó nada). */
  batchId: string | null;
  /** Modo con que se corrió: 'auto' (al abrir), 'manual' (botón) o 'full' (3 meses completos). */
  mode: SmsSyncMode;
  /** Gastos fijos marcados como pagados automáticamente en esta sincronización. */
  fixedAutoMarked: FixedMatch[];
  /** Posibles pagos de gastos fijos que el usuario debe confirmar. */
  fixedProposals: FixedMatch[];
  /** Posibles duplicados manual/SMS pendientes de decidir. */
  duplicates: DupPair[];
  /** Movimientos SMS con pista de cuenta (smsAccountHint) pero sin cuenta asignada. */
  unassignedCount: number;
  /** Pares "transferencia enviada + recibida" probables que el usuario debe confirmar (los `auto` ya se vincularon). */
  transferPairs: TransferPair[];
}

export type SmsSyncMode = 'auto' | 'manual' | 'full';

export type SmsPermissionStatus = 'granted' | 'denied' | 'never_ask_again' | 'unavailable';

export interface SmsPermissionDetail {
  status: SmsPermissionStatus;
  apiLevel: number | null;
  /** true si Android respondió "no volver a preguntar" al instante (típico de "Configuración restringida"). */
  instantDenial: boolean;
  manufacturer: string;
}

function emptySyncResult(mode: SmsSyncMode = 'manual'): SyncResult {
  return {
    transactions: [], installments: [], totalRead: 0, totalMatched: 0, totalSkipped: 0, totalIgnored: 0,
    stats: emptySmsStats(), reviewItems: [], diagnostics: [], inbox: [],
    batchId: null, mode, fixedAutoMarked: [], fixedProposals: [], duplicates: [], unassignedCount: 0, transferPairs: [],
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

  /**
   * Solo VERIFICA el permiso de lectura de SMS (PermissionsAndroid.check). NUNCA lo pide.
   * Seguro en cualquier plataforma: devuelve false fuera de Android o ante cualquier error.
   */
  async hasReadSmsPermission(): Promise<boolean> {
    if (Platform.OS !== 'android') return false;
    try {
      return await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
    } catch {
      return false;
    }
  },

  /**
   * Sincroniza los SMS bancarios. Hay un único candado de módulo: si ya corre una
   * sincronización (botón o automática) se devuelve la MISMA promesa.
   * 'full' relee 3 meses (5000 SMS); 'manual' y 'auto' son incrementales (1000 SMS).
   */
  syncBankSms(opts?: { mode?: SmsSyncMode }): Promise<SyncResult> {
    const mode: SmsSyncMode = opts?.mode ?? 'manual';
    if (Platform.OS !== 'android') return Promise.resolve(emptySyncResult(mode));
    if (syncInFlight) return syncInFlight;
    const run: Promise<SyncResult> = runSmsSync(mode).finally(() => {
      if (syncInFlight === run) syncInFlight = null;
    });
    syncInFlight = run;
    return run;
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

// ─────────────────────────────────────────────────────────────
// SINCRONIZACIÓN (privado del módulo)
// ─────────────────────────────────────────────────────────────
let syncInFlight: Promise<SyncResult> | null = null;

const TWO_DAYS_MS = 2 * 24 * 60 * 60 * 1000;

function listSms(filter: object): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    SmsAndroid.list(
      JSON.stringify(filter),
      (fail: string) => { console.error('SMS list failed:', fail); reject(new Error(fail)); },
      (_count: number, smsList: string) => resolve(smsList),
    );
  });
}

/** Tarjeta de crédito para una visacuota sin tarjeta asignada (solo si la señal es inequívoca). */
function creditAccountForInstallment(inst: CreditInstallment, accounts: Account[]): string {
  if (inst.accountId || !inst.originalSMS) return inst.accountId;
  const credit = accounts.filter(a => a.type === 'credit');
  if (credit.length === 0) return inst.accountId;
  const m = matchAccountForSms(extractSmsLinkSignals(inst.originalSMS), credit);
  return m.accountId ?? inst.accountId;
}

async function runSmsSync(mode: SmsSyncMode): Promise<SyncResult> {
  if (Platform.OS !== 'android') return emptySyncResult(mode);

  if (!SmsService.isSmsModuleAvailable()) throw new Error('SMS_MODULE_UNAVAILABLE');
  const hasPerm = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.READ_SMS);
  if (!hasPerm) throw new Error('SMS_PERMISSION_DENIED');

  try {
    const full = mode === 'full';
    const startedAt = new Date().toISOString();
    const now = new Date();
    const threeMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 3, 1).getTime();

    const syncState = await StorageService.getSmsSyncState();
    const lastSyncMs = syncState.lastSyncAt ? Date.parse(syncState.lastSyncAt) : NaN;
    const minDate = full || isNaN(lastSyncMs)
      ? threeMonthsAgo
      : Math.max(threeMonthsAgo, lastSyncMs - TWO_DAYS_MS);
    const filter = { box: 'inbox', minDate, indexFrom: 0, maxCount: full ? 5000 : 1000 };

    const smsList = await listSms(filter);
    let parsedList: Array<{ body?: string; date?: number | string; address?: string }> = [];
    try { parsedList = JSON.parse(smsList); } catch { return emptyResultWithRead(0, mode); }
    const messages = (Array.isArray(parsedList) ? parsedList : [])
      .filter(m => typeof m?.body === 'string' && Number(m.date) >= minDate)
      .map(m => ({ body: m.body as string, address: m.address, receivedAt: Number(m.date) }));

    const [txs, insts, dismissed, kept, accounts, rules, fixedBefore, dupIgnoredList, linkSeenPrev] = await Promise.all([
      StorageService.getTransactions(),
      StorageService.getCreditInstallments(),
      StorageService.getDismissedSms(),
      StorageService.getSmsReviewKept(),
      StorageService.getAccounts(),
      StorageService.getMerchantRules(),
      StorageService.getFixedExpenses(),
      StorageService.getDupIgnored(),
      StorageService.getSmsLinkSeen(),
    ]);

    const index = buildExistingSmsIndex(txs, insts, dismissed);
    const plan = planSmsImport(messages, index, accounts, { merchantRules: rules, existingTxs: txs });

    // (a) Cuenta de cada movimiento nuevo (por vínculos SMS) y tarjeta de las visacuotas ambiguas.
    const newTxs = assignAccountsToTransactions(plan.transactions, accounts).txs;
    const newInsts = plan.installments.map(i => {
      const accountId = creditAccountForInstallment(i, accounts);
      return accountId === i.accountId ? i : { ...i, accountId };
    });

    // (b) Importación en lote.
    const after = await StorageService.importSmsBatch(newTxs, newInsts);

    // (c) Buzón: la completa reemplaza; el resto fusiona (no pierde lo no revisado).
    const inboxCandidates = plan.unrecognized.filter(
      i => !index.fingerprints.has(i.fingerprint) && !index.dismissed.has(i.fingerprint),
    );
    const inbox = full
      ? await StorageService.replaceSmsInbox(inboxCandidates)
      : await StorageService.mergeSmsInbox(inboxCandidates);

    const newIds = new Set(newTxs.map(t => t.id));
    let allTxs = after.transactions;
    let mutated = false;

    // (d) Gastos fijos: los `auto` se marcan ya (guardando el estado previo para Deshacer); el resto se propone.
    const fixedMarks: SmsBatchRecord['fixedMarks'] = [];
    const fixedMerges: NonNullable<SmsBatchRecord['fixedMerges']> = [];
    const fixedAutoMarked: FixedMatch[] = [];
    let fixedProposals: FixedMatch[] = [];
    try {
      const matches = matchFixedExpenses(newTxs, fixedBefore, allTxs, now, { ignored: new Set(dupIgnoredList) });
      fixedProposals = matches.filter(m => !m.auto);
      for (const m of matches.filter(x => x.auto)) {
        const fe = fixedBefore.find(e => e.id === m.expenseId);
        if (!fe) continue;
        fixedMarks.push({
          expenseId: fe.id,
          prev: {
            isPaid: fe.isPaid, paidDate: fe.paidDate, paidTxId: fe.paidTxId, paidBy: fe.paidBy,
            lastTxId: fe.lastTxId, paidCycleKey: fe.paidCycleKey,
          },
        });
        await StorageService.markFixedPaidBySms(m.expenseId, m.txId);
        fixedAutoMarked.push(m);
        mutated = true;
      }
    } catch (e) {
      console.warn('SMS sync (gastos fijos) error:', e instanceof Error ? e.message : 'desconocido');
    }

    // (d2) Registro manual de "marcar pagado" + SMS nuevo del mismo pago: los `auto` se unen ya
    // (guardando el manual para Deshacer); el resto se propone con `manualId`.
    const fusionManualIds = new Set<string>();
    const fusionSmsIds = new Set<string>();
    try {
      const txsNow = mutated ? await StorageService.getTransactions() : allTxs;
      const fixedNow = mutated ? await StorageService.getFixedExpenses() : fixedBefore;
      const marked = new Set(fixedMarks.map(m => m.expenseId));
      const markedSms = new Set(fixedAutoMarked.map(m => m.txId));
      const fusions = findFixedFusions(txsNow, fixedNow, { ignored: new Set(dupIgnoredList), onlySmsIds: newIds })
        .filter(f => !markedSms.has(f.smsId) && !marked.has(f.expenseId));
      for (const f of fusions) {
        if (!f.auto) {
          fixedProposals.push({
            expenseId: f.expenseId, txId: f.smsId, manualId: f.manualId, score: f.score, auto: false, reasons: f.reasons,
          });
          continue;
        }
        const fe = fixedNow.find(e => e.id === f.expenseId);
        const manual = txsNow.find(t => t.id === f.manualId);
        const sms = txsNow.find(t => t.id === f.smsId);
        if (!fe || !manual || !sms) continue;
        fixedMarks.push({
          expenseId: fe.id,
          prev: {
            isPaid: fe.isPaid, paidDate: fe.paidDate, paidTxId: fe.paidTxId, paidBy: fe.paidBy,
            lastTxId: fe.lastTxId, paidCycleKey: fe.paidCycleKey,
          },
        });
        fixedMerges.push({ smsId: sms.id, expenseId: fe.id, manual: { ...manual } });
        await StorageService.mergeFixedManualIntoSms(fe.id, manual.id, sms.id, merchantKey(merchantOfTransaction(sms)) ?? undefined);
        fixedAutoMarked.push({
          expenseId: fe.id, txId: sms.id, manualId: manual.id, score: f.score, auto: true, reasons: f.reasons,
        });
        fusionManualIds.add(manual.id);
        fusionSmsIds.add(sms.id);
        mutated = true;
      }
    } catch (e) {
      console.warn('SMS sync (fusión de gastos fijos) error:', e instanceof Error ? e.message : 'desconocido');
    }

    // (e) Duplicados manual/SMS entre los movimientos nuevos y los manuales existentes.
    let duplicates: DupPair[] = [];
    try {
      duplicates = findManualSmsDuplicates(allTxs, new Set(dupIgnoredList), { onlySmsIds: newIds })
        .filter(p => !fusionManualIds.has(p.manualId) && !fusionSmsIds.has(p.smsId));
    } catch (e) {
      console.warn('SMS sync (duplicados) error:', e instanceof Error ? e.message : 'desconocido');
    }

    // (e2) Pares de transferencia entre cuentas propias: los `auto` se vinculan, el resto se propone.
    let transferPairs: TransferPair[] = [];
    try {
      const pairs = findTransferPairs(allTxs, new Set(dupIgnoredList), { onlyIds: newIds, accounts });
      transferPairs = pairs.filter(p => !p.auto);
      for (const p of pairs.filter(x => x.auto)) {
        await StorageService.linkTransferPair(p.outId, p.inId);
        mutated = true;
      }
    } catch (e) {
      console.warn('SMS sync (transferencias) error:', e instanceof Error ? e.message : 'desconocido');
    }

    if (mutated) allTxs = await StorageService.getTransactions();

    // (f) Lote para "Deshacer".
    let batchId: string | null = null;
    if (newTxs.length > 0 || newInsts.length > 0 || fixedMarks.length > 0 || fixedMerges.length > 0) {
      batchId = `smsb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      await StorageService.recordSmsBatch({
        id: batchId,
        at: startedAt,
        mode,
        txIds: newTxs.map(t => t.id),
        installmentIds: newInsts.map(i => i.id),
        fixedMarks,
        ...(fixedMerges.length > 0 ? { fixedMerges } : {}),
      });
    }

    // (h) Inventario de terminaciones vistas (solo claves y conteos; usa los textos bancarios nuevos).
    try {
      const bodies = [
        ...newTxs.map(t => t.originalSMS ?? ''),
        ...newInsts.map(i => i.originalSMS ?? ''),
        ...inboxCandidates.map(i => i.body),
      ].filter(b => b.length > 0);
      const seen = collectLinkSeen(bodies, linkSeenPrev, startedAt);
      if (seen !== linkSeenPrev) await StorageService.saveSmsLinkSeen(seen);
    } catch (e) {
      console.warn('SMS sync (terminaciones) error:', e instanceof Error ? e.message : 'desconocido');
    }

    // (i) Movimientos sin cuenta pero con pista (solo si el usuario ya tiene cuentas con banco).
    const unassignedCount = accounts.some(a => !!a.bankName)
      ? allTxs.filter(isPendingUnassigned).length
      : 0;

    const reviewItems = reviewImportedSms(allTxs, new Set(kept), { merchantRules: rules });

    // (g) Solo si todo terminó bien.
    await StorageService.saveSmsSyncState({ lastSyncAt: startedAt, ...(full ? { lastFullSyncAt: startedAt } : {}) });

    const s = plan.stats;
    console.log(
      `SMS Sync[${mode}]: leidos=${s.totalRead}, bancarios=${s.bankCandidates}, importados=${s.imported}, cuotas=${s.installments}, ` +
      `duplicados=${s.duplicates}, descartados=${s.dismissedByUser}, promos=${s.promos}, otp=${s.otp}, ` +
      `rechazados=${s.declined}, info=${s.info}, avisos=${s.notices}, propias=${s.ownTransfers}, no_confiables=${s.untrusted}, ` +
      `no_reconocidos=${s.unparsed}, buzon=${inbox.length}, revision=${reviewItems.length}, ` +
      `fijos_auto=${fixedAutoMarked.length}, fijos_prop=${fixedProposals.length}, dup=${duplicates.length}, ` +
      `transf=${transferPairs.length}, sin_cuenta=${unassignedCount}`
    );

    return {
      transactions: newTxs,
      installments: newInsts,
      totalRead: s.totalRead,
      totalMatched: s.bankCandidates,
      totalSkipped: s.duplicates + s.dismissedByUser,
      totalIgnored: s.bankCandidates - s.imported - s.installments - s.duplicates - s.dismissedByUser,
      stats: s,
      reviewItems,
      diagnostics: plan.diagnostics,
      inbox,
      batchId,
      mode,
      fixedAutoMarked,
      fixedProposals,
      duplicates,
      unassignedCount,
      transferPairs,
    };
  } catch (e) {
    console.warn('SMS sync error:', e instanceof Error ? e.message : 'desconocido');
    throw e instanceof Error ? e : new Error('SMS_SYNC_FAILED');
  }
}

/** ¿Hay algo que mostrarle al usuario tras la sincronización? (puro; sirve para el aviso del Dashboard) */
export function hasSomethingToShow(r: SyncResult): boolean {
  return r.transactions.length > 0
    || r.installments.length > 0
    || r.fixedAutoMarked.length > 0
    || r.fixedProposals.length > 0
    || r.duplicates.length > 0
    || r.transferPairs.length > 0
    || r.unassignedCount > 0
    || r.inbox.length > 0
    || r.reviewItems.length > 0;
}

function emptyResultWithRead(totalRead: number, mode: SmsSyncMode = 'manual'): SyncResult {
  const r = emptySyncResult(mode);
  r.totalRead = totalRead;
  r.stats.totalRead = totalRead;
  return r;
}
