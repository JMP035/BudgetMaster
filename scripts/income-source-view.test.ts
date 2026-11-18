process.env.TZ = 'America/Guatemala';
// Pruebas de la vista de fuentes de ingreso (services/IncomeSourceView.ts). Sin dependencias:
//   npm run test:income-source-view   →   sucrase-node scripts/income-source-view.test.ts

import {
  applyPatternCorrection, buildIncomeList, incomeProposalKey, incomeProposalsTitle, liveIncomeProposals,
  patternFailText, patternSummary, scheduleText, statusView, suggestScheduleFromPreview, suggestionText,
  validateIncomeForm,
} from '../services/IncomeSourceView';
import type { IncomeFormInput } from '../services/IncomeSourceView';
import { learnPatternFromSms, sourceStatus } from '../services/IncomeSources';
import { buildExistingSmsIndex, planSmsImport } from '../services/BankSmsParser';
import { DEFAULT_PAY_RULES } from '../services/PayCalendar';
import type { IncomeSource, Transaction } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);
const SMS_OCT = 'BANRURAL: Recibiste Q7,426.61 en tu cuenta Monetaria *** ****5051 de SECCION DE OPERACIONES DE DEPOSITOS, el 27/10/2026 a las 10:31.';
const SMS_SEP = 'BANRURAL: Recibiste Q7,426.61 en tu cuenta Monetaria *** ****5051 de SECCION DE OPERACIONES DE DEPOSITOS, el 25/09/2026 a las 10:31.';

function importTx(body: string, at: Date): Transaction {
  const plan = planSmsImport([{ body, receivedAt: at.getTime() }], buildExistingSmsIndex([], [], []), []);
  if (plan.transactions.length !== 1) throw new Error('no se importó: ' + body.slice(0, 30));
  return plan.transactions[0];
}

function source(over: Partial<IncomeSource> = {}): IncomeSource {
  const learned = learnPatternFromSms(SMS_OCT, d(2026, 10, 27).getTime());
  if (!learned.ok) throw new Error('no aprendió');
  return {
    id: 'src_sueldo', name: 'Sueldo', category: 'salary', amount: 7426.61, currency: 'Q', frequency: 'monthly',
    days: [27], role: 'base', anchorsPeriod: true, pattern: learned.pattern, isActive: true,
    createdAt: '2026-01-01T12:00:00.000Z', ...over,
  };
}

// ── scheduleText ─────────────────────────────────────────────
check('texto mensual', scheduleText(source()) === 'Mensual · día 27', scheduleText(source()));
check('texto quincenal', scheduleText(source({ frequency: 'biweekly', days: [15, 30] })) === 'Quincenal · días 15 y 30');
check('texto semanal', scheduleText(source({ frequency: 'weekly', days: [5] })) === 'Semanal · cada viernes');
check('texto semanal domingo (0)', scheduleText(source({ frequency: 'weekly', days: [0] })) === 'Semanal · cada domingo');
check('texto irregular', scheduleText(source({ frequency: 'irregular', days: [] })) === 'Irregular');
check('texto extra con mes', scheduleText(source({ role: 'extra', months: [7] })) === 'Mensual · día 27 · julio');
check('texto extra con dos meses', scheduleText(source({ role: 'extra', months: [6, 12] })) === 'Mensual · día 27 · junio, diciembre');

// ── patternSummary ───────────────────────────────────────────
const learned = learnPatternFromSms(SMS_OCT, d(2026, 10, 27).getTime());
if (!learned.ok) throw new Error('no aprendió');
const sum = patternSummary(learned.pattern);
check('resumen del patrón', sum === 'BANRURAL · cuenta ***5051 · de «SECCION DE OPERACIONES DE DEPOSITOS» · ≈Q 7,426.61 (±1.5%)', sum);
check('resumen sin cuenta ni origen', patternSummary({ bank: 'BAC', amount: 100, tolerancePct: 0, learnedAt: '', sampleMasked: '' }) === 'BAC · ≈Q 100.00', patternSummary({ bank: 'BAC', amount: 100, tolerancePct: 0, learnedAt: '', sampleMasked: '' }));

// ── applyPatternCorrection ───────────────────────────────────
const fixed = applyPatternCorrection(learned.pattern, { originText: '  Mi   Empresa SA  ', amount: 8000 });
check('corrección: origen nuevo', fixed.originLabel === 'Mi Empresa SA' && fixed.originKey === 'mi empresa sa', JSON.stringify(fixed));
check('corrección: monto nuevo', fixed.amount === 8000);
check('corrección conserva banco y cuenta', fixed.bank === 'BANRURAL' && fixed.acctKey === '5051');
const noOrigin = applyPatternCorrection(learned.pattern, { originText: 'ab', amount: 0 });
check('corrección: origen muy corto se descarta', noOrigin.originKey === undefined && noOrigin.originLabel === undefined);
check('corrección: monto inválido conserva el anterior', noOrigin.amount === learned.pattern.amount);

// ── motivos de fallo y sugerencias ───────────────────────────
check('motivos de fallo con texto', ['not_income', 'no_amount', 'not_bank'].every(r => patternFailText(r as 'not_income').length > 20));
check('día sugerido mensual', suggestScheduleFromPreview({ day: 27, weekday: 2 }, 'monthly')[0] === 27);
check('día sugerido semanal', suggestScheduleFromPreview({ day: 27, weekday: 2 }, 'weekly')[0] === 2);
check('día sugerido irregular', suggestScheduleFromPreview({ day: 27, weekday: 2 }, 'irregular').length === 0);

// ── suggestionText ───────────────────────────────────────────
check('sugerencia con declarado', suggestionText({ suggested: 7426.61, current: 6000 }).startsWith('Tu ingreso real es Q 7,426.61, ¿actualizar el declarado?'), suggestionText({ suggested: 7426.61, current: 6000 }));
check('sugerencia sin declarado', !suggestionText({ suggested: 7426.61, current: 0 }).includes('hoy tenés'));

// ── validateIncomeForm ───────────────────────────────────────
const form = (over: Partial<IncomeFormInput> = {}): IncomeFormInput => ({
  id: 'src_1', name: 'Sueldo', category: 'salary', amount: 7000, currency: 'Q', frequency: 'monthly', days: [27],
  role: 'base', months: [], anchorsPeriod: true, createdAt: '2026-11-01T12:00:00.000Z', ...over,
});
const ok = (f: IncomeFormInput) => validateIncomeForm(f);
check('form válido mensual', ok(form()).ok);
const v1 = ok(form());
check('form válido: ancla activa en base mensual', v1.ok && v1.source.anchorsPeriod === true && v1.source.days[0] === 27);
check('sin nombre', !ok(form({ name: '   ' })).ok);
check('sin monto', !ok(form({ amount: NaN })).ok);
check('monto 0', !ok(form({ amount: 0 })).ok);
check('día 0 mensual', !ok(form({ days: [0] })).ok);
check('día 32 mensual', !ok(form({ days: [32] })).ok);
check('día NaN mensual', !ok(form({ days: [NaN] })).ok);
check('día decimal mensual', !ok(form({ days: [27.5] })).ok);
const q = ok(form({ frequency: 'biweekly', days: [30, 15] }));
check('quincenal ordena los días', q.ok && q.source.days[0] === 15 && q.source.days[1] === 30);
check('quincenal con un solo día', !ok(form({ frequency: 'biweekly', days: [15] })).ok);
check('quincenal con días iguales', !ok(form({ frequency: 'biweekly', days: [15, 15] })).ok);
check('semanal acepta 0 (domingo)', ok(form({ frequency: 'weekly', days: [0] })).ok);
check('semanal rechaza 7', !ok(form({ frequency: 'weekly', days: [7] })).ok);
const irr = ok(form({ frequency: 'irregular', days: [NaN, NaN], anchorsPeriod: true }));
check('irregular sin días y sin ancla', irr.ok && irr.source.days.length === 0 && irr.source.anchorsPeriod === false);
check('semanal nunca ancla el período', ok(form({ frequency: 'weekly', days: [5] })).ok && (ok(form({ frequency: 'weekly', days: [5] })) as { ok: true; source: IncomeSource }).source.anchorsPeriod === false);
const ex = ok(form({ role: 'extra', months: [7], anchorsPeriod: true }));
check('extra con mes guarda meses y no ancla', ex.ok && ex.source.months?.[0] === 7 && ex.source.anchorsPeriod === false);
check('extra sin meses', !ok(form({ role: 'extra', months: [] })).ok);
check('extra irregular sin meses es válido', ok(form({ role: 'extra', frequency: 'irregular', days: [], months: [] })).ok);
const bm = ok(form({ role: 'base', months: [3, 4] }));
check('base ignora meses', bm.ok && bm.source.months === undefined);
const wr = ok(form({ weekendRule: 'next_business', accountId: 'acc_1' }));
check('regla propia y cuenta destino', wr.ok && wr.source.weekendRule === 'next_business' && wr.source.accountId === 'acc_1');
const nowr = ok(form({ weekendRule: null, accountId: null }));
check('sin regla propia ni cuenta no deja claves', nowr.ok && !('weekendRule' in nowr.source) && !('accountId' in nowr.source));
const withPat = ok(form({ pattern: learned.pattern }));
check('conserva el patrón', withPat.ok && withPat.source.pattern?.acctKey === '5051');
const rounded = ok(form({ amount: 7426.6149 }));
check('redondea el monto a centavos', rounded.ok && rounded.source.amount === 7426.61);

// ── buildIncomeList / statusView ─────────────────────────────
const txOct = importTx(SMS_OCT, d(2026, 10, 27, 10, 31));
const linkedOct: Transaction = { ...txOct, incomeSourceId: 'src_sueldo', incomeCycleKey: '2026-10-27', category: 'salary' };
const base = source();
const extra = source({ id: 'src_b14', name: 'Bono 14', role: 'extra', months: [7], anchorsPeriod: false, days: [15] });
const irregular = source({ id: 'src_ventas', name: 'Ventas', frequency: 'irregular', days: [], anchorsPeriod: false });
const inactive = source({ id: 'src_old', name: 'Antiguo', isActive: false });
const list = buildIncomeList([extra, inactive, irregular, base], [linkedOct], d(2026, 10, 28), DEFAULT_PAY_RULES);
check('lista: base activa primero', list[0].source.id === 'src_sueldo', list.map(i => i.source.id).join(','));
check('lista: extra después de base, inactiva al final', list[list.length - 1].source.id === 'src_old', list.map(i => i.source.id).join(','));
check('estado recibido tras vincular', list[0].view.label === 'Recibido' && list[0].view.tone === 'success', JSON.stringify(list[0].view));
check('detalle recibido con fecha', list[0].view.detail === 'Llegó el 27 oct', list[0].view.detail);
const pending = statusView(sourceStatus(base, [], d(2026, 9, 26), DEFAULT_PAY_RULES), base);
check('esperado dentro de la tolerancia', pending.label === 'Esperado' && pending.tone === 'info' && pending.detail.startsWith('Se espera el'), JSON.stringify(pending));
const late = statusView(sourceStatus(base, [], d(2026, 11, 2), DEFAULT_PAY_RULES), base);
check('atrasado pasada la tolerancia', late.label === 'Atrasado' && late.tone === 'danger', JSON.stringify(late));
const irrView = list.find(i => i.source.id === 'src_ventas')!.view;
check('irregular sin pagos', irrView.label === 'Sin pago' && irrView.detail === 'Sin pagos este mes', JSON.stringify(irrView));
const extraView = list.find(i => i.source.id === 'src_b14')!.view;
check('extra fuera de temporada', extraView.tone === 'muted', JSON.stringify(extraView));

// ── liveIncomeProposals ──────────────────────────────────────
const txSep = importTx(SMS_SEP, d(2026, 9, 25, 10, 31));
const props = liveIncomeProposals([txOct, txSep], [base], DEFAULT_PAY_RULES, new Set());
check('propone los depósitos sin fuente (más reciente primero)', props.length === 2 && props[0].txId === txOct.id, JSON.stringify(props.map(p => p.txId)));
check('propuesta nunca es auto', props.every(p => p.auto === false));
const ignoredSet = new Set([incomeProposalKey(txOct.id, 'src_sueldo')]);
const props2 = liveIncomeProposals([txOct, txSep], [base], DEFAULT_PAY_RULES, ignoredSet);
check('un «No» recordado no vuelve', props2.length === 1 && props2[0].txId === txSep.id);
check('clave del «No»', incomeProposalKey('t1', 's1') === 'inc|t1|s1');
const props3 = liveIncomeProposals([linkedOct, txSep], [base], DEFAULT_PAY_RULES, new Set());
check('un ingreso ya vinculado no se propone', props3.every(p => p.txId !== linkedOct.id));
const dupCycle = { ...txOct, id: 'tx_dup', smsFingerprint: 'otro' };
const props4 = liveIncomeProposals([linkedOct, dupCycle], [base], DEFAULT_PAY_RULES, new Set());
check('un ciclo ya cubierto no se vuelve a proponer', props4.length === 0, JSON.stringify(props4.map(p => p.txId)));
check('sin fuentes activas no hay propuestas', liveIncomeProposals([txOct], [inactive], DEFAULT_PAY_RULES, new Set()).length === 0);
const onlyOne = liveIncomeProposals([txOct, txSep], [base], DEFAULT_PAY_RULES, new Set(), [txSep.id]);
check('limitado a los movimientos del resultado', onlyOne.length === 1 && onlyOne[0].txId === txSep.id);
const manual: Transaction = { ...txOct, id: 'tx_manual', source: 'manual' };
check('un ingreso manual no se propone', liveIncomeProposals([manual], [base], DEFAULT_PAY_RULES, new Set()).length === 0);
const expense: Transaction = { ...txOct, id: 'tx_exp', type: 'expense' };
check('un gasto no se propone', liveIncomeProposals([expense], [base], DEFAULT_PAY_RULES, new Set()).length === 0);
const paired: Transaction = { ...txOct, id: 'tx_pair', transferPairId: 'pair_1' };
check('una transferencia propia no se propone', liveIncomeProposals([paired], [base], DEFAULT_PAY_RULES, new Set()).length === 0);

check('título con una fuente', incomeProposalsTitle([{ sourceName: 'Sueldo' }, { sourceName: 'Sueldo' }]) === '¿Es tu Sueldo?');
check('título con varias fuentes', incomeProposalsTitle([{ sourceName: 'Sueldo' }, { sourceName: 'Ventas' }]) === '¿Es de alguna de tus fuentes de ingreso?');

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
