process.env.TZ = 'America/Guatemala';
// Pruebas del formulario de transferencias y de saldos opcionales (services/TransferForm.ts y su cableado en storage).
// Sin dependencias:  npm run test:transfer-form   →   sucrase-node scripts/transfer-form.test.ts
import { resetMemoryStorage } from './_async-storage-mock';

import {
  anchorIsoFor, balanceModeHelp, balanceModeTag, canTransfer, findEquivalentTransferSms, findManualTransferFor,
  parseSignedAmount, planSmsJoin, reliableConversion, resolveBalanceFields, smsBalanceMismatch, suggestToAmount,
  transferFromChoices, transferToChoices, validateTransferForm,
} from '../services/TransferForm';
import { deriveBalance, planManualEffectsRevert, withDerivedBalances } from '../services/Balances';
import { StorageService } from '../services/storage';
import type { Account, Transaction } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);

function acc(id: string, patch: Partial<Account> = {}): Account {
  return {
    id, name: id, type: 'bank', currency: 'Q', balance: 0, initialBalance: 0, color: '#fff', icon: 'card-outline',
    isActive: true, createdAt: d(2026, 1, 1).toISOString(), ...patch,
  };
}

function tx(id: string, type: Transaction['type'], amount: number, at: Date, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, amount, description: `mov ${id}`, category: type === 'income' ? 'salary' : 'other', date: at.toISOString(),
    type, source: 'sms', currency: 'Q', ...extra,
  };
}

const ban = acc('ban', { name: 'Banrural' });
const bac = acc('bac', { name: 'BAC' });
const usd = acc('usd', { name: 'Dólares', currency: 'USD' });
const visa = acc('visa', { name: 'BAC Visa', type: 'credit' });
const off = acc('off', { isActive: false });
const ALL = [ban, bac, usd, visa, off];

// ─────────────────────────────────────────────────────────────
// 1. Cuentas y monedas
// ─────────────────────────────────────────────────────────────
{
  check('origen: activas y sin tarjeta', transferFromChoices(ALL).map(a => a.id).join() === 'ban,bac,usd');
  check('destino: todas las activas menos el origen, tarjetas incluidas', transferToChoices(ALL, 'ban').map(a => a.id).join() === 'bac,usd,visa');
  check('canTransfer: con dos cuentas sí', canTransfer([ban, bac]));
  check('canTransfer: una cuenta y una tarjeta no', !canTransfer([ban, visa]) && !canTransfer([ban]) && !canTransfer([]));
  check('canTransfer: las inactivas no cuentan', !canTransfer([ban, off]));
  check('reliableConversion: Q↔USD y misma moneda sí; USD↔EUR no', reliableConversion('Q', 'USD') && reliableConversion('USD', 'Q') && reliableConversion('Q', 'Q') && !reliableConversion('USD', 'EUR') && !reliableConversion('£', 'USD'));
  check('suggestToAmount: Q → USD', suggestToAmount(770, 'Q', 'USD', 7.7) === 100);
  check('suggestToAmount: USD → Q', suggestToAmount(100, 'USD', 'Q', 7.7) === 770);
  check('suggestToAmount: misma moneda, tasa inválida, monto inválido o conversión no confiable → null',
    suggestToAmount(100, 'Q', 'Q', 7.7) === null && suggestToAmount(100, 'Q', 'USD', 0) === null
    && suggestToAmount(NaN, 'Q', 'USD', 7.7) === null && suggestToAmount(100, 'USD', 'EUR', 7.7) === null);
}

// ─────────────────────────────────────────────────────────────
// 2. Validación del formulario (sin «saldo insuficiente»)
// ─────────────────────────────────────────────────────────────
{
  check('válida: misma moneda', validateTransferForm({ fromAcc: ban, toAcc: bac, amount: 100 }) === null);
  check('sin saldo suficiente no se rechaza (el saldo es opcional)',
    validateTransferForm({ fromAcc: acc('p', { balance: 5, balanceMode: 'manual' }), toAcc: bac, amount: 99999 }) === null);
  check('sin origen / sin destino', validateTransferForm({ toAcc: bac, amount: 1 }) !== null && validateTransferForm({ fromAcc: ban, amount: 1 }) !== null);
  check('mismas cuentas', validateTransferForm({ fromAcc: ban, toAcc: ban, amount: 1 }) === 'Las cuentas deben ser diferentes.');
  check('monto inválido', validateTransferForm({ fromAcc: ban, toAcc: bac, amount: NaN }) === 'Ingresa un monto válido.' && validateTransferForm({ fromAcc: ban, toAcc: bac, amount: 0 }) !== null);
  check('otra moneda sin lo que recibe el destino', validateTransferForm({ fromAcc: ban, toAcc: usd, amount: 770 }) !== null
    && validateTransferForm({ fromAcc: ban, toAcc: usd, amount: 770, toAmount: NaN }) !== null);
  check('otra moneda con lo que recibe el destino', validateTransferForm({ fromAcc: ban, toAcc: usd, amount: 770, toAmount: 100 }) === null);
  check('USD ↔ EUR bloqueado', (validateTransferForm({ fromAcc: usd, toAcc: acc('eur', { currency: 'EUR' }), amount: 10, toAmount: 9 }) ?? '').startsWith('No hay tipo de cambio'));
}

// ─────────────────────────────────────────────────────────────
// 3. ¿Ya llegó el SMS de la transferencia?
// ─────────────────────────────────────────────────────────────
{
  const when = d(2026, 11, 10, 15, 0);
  const smsOut = tx('o1', 'expense', 3000, d(2026, 11, 10, 15, 5), { accountId: 'ban', category: 'transfer', bank: 'BANRURAL' });
  const smsIn = tx('i1', 'income', 3000, d(2026, 11, 10, 15, 6), { accountId: 'bac', category: 'transfer_in', bank: 'BAC' });
  const find = (txs: Transaction[], extra: Record<string, unknown> = {}) =>
    findEquivalentTransferSms(txs, { fromAcc: ban, toAcc: bac, amount: 3000, date: when, ...extra } as Parameters<typeof findEquivalentTransferSms>[1]);

  const m1 = find([smsOut]);
  check('solo la salida: la encuentra', m1.out?.id === 'o1' && !m1.inn && planSmsJoin(m1).kind === 'out');
  const m2 = find([smsIn]);
  check('solo la entrada: la encuentra', m2.inn?.id === 'i1' && !m2.out && planSmsJoin(m2).kind === 'in');
  const m3 = find([smsOut, smsIn]);
  const p3 = planSmsJoin(m3);
  check('los dos: se emparejan', p3.kind === 'pair' && p3.outId === 'o1' && p3.inId === 'i1');
  check('ninguno: se crea la transferencia a mano', planSmsJoin(find([])).kind === 'none');

  check('monto ±0.01 sí, ±0.5 no', !!find([{ ...smsOut, amount: 3000.01 }]).out && !find([{ ...smsOut, amount: 3000.5 }]).out);
  check('36 h sí, más no', !!find([{ ...smsOut, date: d(2026, 11, 12, 1, 0).toISOString() }]).out
    && !find([{ ...smsOut, date: d(2026, 11, 12, 6, 0).toISOString() }]).out);
  check('el SMS de otra cuenta no cuenta; sin cuenta asignada sí', !find([{ ...smsOut, accountId: 'usd' }]).out && !!find([{ ...smsOut, accountId: undefined }]).out);
  check('ya emparejado, pago de tarjeta o pregunta descartada: no', !find([{ ...smsOut, transferPairId: 'tp_x' }]).out
    && !find([{ ...smsOut, cardPayment: { cardId: 'visa', cutKey: '2026-11-09' } }]).out
    && !find([smsOut], { ignored: new Set(['tq|o1']) }).out);
  check('una compra normal con el mismo monto no es transferencia', !find([{ ...smsOut, category: 'food' }]).out);
  check('con una tarjeta de por medio no se une', !!findEquivalentTransferSms([smsOut], { fromAcc: ban, toAcc: visa, amount: 3000, date: when }).out === false);
  // Otra moneda: la entrada llega por lo que recibió el destino
  const usdIn = tx('i2', 'income', 100, d(2026, 11, 10, 15, 6), { accountId: 'usd', category: 'transfer_in', currency: 'USD' });
  const m4 = findEquivalentTransferSms([usdIn], { fromAcc: ban, toAcc: usd, amount: 770, toAmount: 100, date: when });
  check('otra moneda: la entrada coincide con lo que recibe el destino', m4.inn?.id === 'i2');
  check('otra moneda: sin toAmount no hay entrada que unir', !findEquivalentTransferSms([usdIn], { fromAcc: ban, toAcc: usd, amount: 770, date: when }).inn);
  // El más cercano en el tiempo
  const far = { ...smsOut, id: 'o_far', date: d(2026, 11, 11, 10, 0).toISOString() };
  check('varios candidatos: el más cercano', find([far, smsOut]).out?.id === 'o1');
}

// ─────────────────────────────────────────────────────────────
// 4. Llegó el SMS después de la transferencia a mano
// ─────────────────────────────────────────────────────────────
{
  const manual = tx('transfer_1', 'transfer', 3000, d(2026, 11, 10, 15, 0), { source: 'manual', category: 'transfer', fromAccountId: 'ban', toAccountId: 'bac' });
  const smsOut = tx('o1', 'expense', 3000, d(2026, 11, 10, 15, 5), { accountId: 'ban', category: 'transfer' });
  const smsIn = tx('i1', 'income', 3000, d(2026, 11, 10, 15, 6), { accountId: 'bac', category: 'transfer_in' });
  check('la salida del SMS coincide con la transferencia a mano', findManualTransferFor(smsOut, [manual, smsOut])?.id === 'transfer_1');
  check('la entrada del SMS coincide con la transferencia a mano', findManualTransferFor(smsIn, [manual, smsIn])?.id === 'transfer_1');
  check('salida de otra cuenta: no coincide', findManualTransferFor({ ...smsOut, accountId: 'bac' }, [manual]) === null);
  check('monto distinto o fuera de 36 h: no coincide', findManualTransferFor({ ...smsOut, amount: 2000 }, [manual]) === null
    && findManualTransferFor({ ...smsOut, date: d(2026, 11, 13, 15, 0).toISOString() }, [manual]) === null);
  check('una transferencia que viene de otro SMS no cuenta como «a mano»', findManualTransferFor(smsOut, [{ ...manual, source: 'sms' }]) === null);
  check('un pago de tarjeta a mano no se confunde', findManualTransferFor(smsOut, [{ ...manual, cardPayment: { cardId: 'visa', cutKey: 'x' } }]) === null);
  check('un gasto cualquiera no tiene transferencia a mano', findManualTransferFor({ ...smsOut, category: 'food' }, [manual]) === null);
  const usdManual = tx('transfer_2', 'transfer', 770, d(2026, 11, 10, 15, 0), { source: 'manual', category: 'transfer', fromAccountId: 'ban', toAccountId: 'usd', toAmount: 100 });
  const usdIn = tx('i2', 'income', 100, d(2026, 11, 10, 15, 6), { accountId: 'usd', category: 'transfer_in', currency: 'USD' });
  check('otra moneda: la entrada se compara con toAmount', findManualTransferFor(usdIn, [usdManual])?.id === 'transfer_2');
}

// ─────────────────────────────────────────────────────────────
// 5. Saldo: modo, saldo de partida y fechas
// ─────────────────────────────────────────────────────────────
{
  check('parseSignedAmount: negativos y miles', parseSignedAmount('-250') === -250 && parseSignedAmount('1,250.50') === 1250.5 && isNaN(parseSignedAmount('abc')) && isNaN(parseSignedAmount('')));
  const now = d(2026, 11, 20, 9, 30);
  check('anchorIsoFor: hoy = este instante', anchorIsoFor(d(2026, 11, 20, 12, 0), now) === now.toISOString());
  check('anchorIsoFor: un día pasado a las 12:00', anchorIsoFor(d(2026, 11, 5, 8, 0), now) === d(2026, 11, 5, 12, 0).toISOString());
  check('textos de ayuda por modo', balanceModeHelp('none').length > 20 && balanceModeHelp('manual').length > 20 && balanceModeHelp('auto').includes('Ajustar al saldo real') && balanceModeHelp('none', 'credit').includes('tarjeta'));
  check('etiqueta de la lista', balanceModeTag(acc('a', { balanceMode: 'auto' })) === 'Automático' && balanceModeTag(acc('a', { balanceMode: 'none' })) === 'Sin saldo' && balanceModeTag(acc('a', { balanceMode: 'manual' })) === null
    && balanceModeTag(acc('c', { type: 'credit' })) === 'Sin saldo');

  const base = { manualText: '0', startText: '', startDate: now, startTouched: false, now };
  const none = resolveBalanceFields({ ...base, mode: 'none' });
  check('none: sin ancla y saldo en cero', !('error' in none) && none.balanceMode === 'none' && none.balance === 0 && none.balanceAnchorAt === undefined);
  const manual = resolveBalanceFields({ ...base, mode: 'manual', manualText: '-120.5' });
  check('manual: el saldo escrito (con signo)', !('error' in manual) && manual.balance === -120.5 && manual.initialBalance === -120.5);
  check('manual: saldo inválido', 'error' in resolveBalanceFields({ ...base, mode: 'manual', manualText: 'abc' }));
  const auto1 = resolveBalanceFields({ ...base, mode: 'auto', startText: '1500', startTouched: true });
  check('auto nueva: saldo de partida = ancla en el instante de hoy', !('error' in auto1) && auto1.balanceMode === 'auto' && auto1.balanceAnchorAmount === 1500 && auto1.balanceAnchorAt === now.toISOString() && auto1.balance === 1500);
  const was = acc('m', { balance: 800, balanceMode: 'manual', initialBalance: 100 });
  const auto2 = resolveBalanceFields({ ...base, mode: 'auto', existing: was });
  check('manual → auto sin escribir: usa el saldo actual como ancla de hoy', !('error' in auto2) && auto2.balanceAnchorAmount === 800 && auto2.balanceAnchorAt === now.toISOString() && auto2.initialBalance === 100);
  const anchored = acc('a', { balanceMode: 'auto', balance: 4321, balanceAnchorAmount: 1000, balanceAnchorAt: d(2026, 11, 1, 8, 0).toISOString(), initialBalance: 1000 });
  const auto3 = resolveBalanceFields({ ...base, mode: 'auto', existing: anchored });
  check('auto sin tocar: conserva su ancla (no guarda el saldo derivado)', !('error' in auto3) && auto3.balanceAnchorAmount === 1000 && auto3.balanceAnchorAt === anchored.balanceAnchorAt && auto3.balance === 1000);
  const auto4 = resolveBalanceFields({ ...base, mode: 'auto', existing: anchored, startText: '900', startTouched: true, startDate: d(2026, 11, 10) });
  check('auto con nueva partida y fecha pasada: se re-ancla a las 12:00 de ese día', !('error' in auto4) && auto4.balanceAnchorAmount === 900 && auto4.balanceAnchorAt === d(2026, 11, 10, 12, 0).toISOString());
  check('auto: saldo de partida inválido', 'error' in resolveBalanceFields({ ...base, mode: 'auto', startText: 'x', startTouched: true }));
  const toNone = resolveBalanceFields({ ...base, mode: 'none', existing: anchored });
  check('auto → none: ya no hay ancla', !('error' in toNone) && toNone.balanceAnchorAt === undefined && toNone.balanceMode === 'none');
}

// ─────────────────────────────────────────────────────────────
// 6. «Según tu banco (SMS)»
// ─────────────────────────────────────────────────────────────
{
  const a = acc('ban', { balanceMode: 'auto', balanceAnchorAmount: 1000, balanceAnchorAt: d(2026, 11, 1, 8, 0).toISOString() });
  const spend = tx('s1', 'expense', 100, d(2026, 11, 5, 10, 0), { accountId: 'ban' });
  const smsSame = tx('s2', 'expense', 50, d(2026, 11, 6, 10, 0), { accountId: 'ban', smsBalance: { amount: 850, currency: 'Q' } });
  check('SMS que cuadra con lo calculado: no hay diferencia', smsBalanceMismatch(a, [spend, smsSame]) === null);
  const smsDiff = tx('s3', 'expense', 50, d(2026, 11, 6, 10, 0), { accountId: 'ban', smsBalance: { amount: 900, currency: 'Q' } });
  const mm = smsBalanceMismatch(a, [spend, smsDiff]);
  check('SMS que no cuadra: muestra el saldo del banco y lo esperado', !!mm && mm.amount === 900 && near(mm.expected, 850) && near(mm.diff, 50), JSON.stringify(mm));
  const later = tx('s4', 'expense', 10, d(2026, 11, 9, 10, 0), { accountId: 'ban' });
  check('un movimiento posterior al SMS no cuenta en «lo esperado»', !!smsBalanceMismatch(a, [spend, smsDiff, later]) && near(smsBalanceMismatch(a, [spend, smsDiff, later])!.expected, 850));
  check('SMS más viejo que el ancla: se ignora', smsBalanceMismatch({ ...a, balanceAnchorAt: d(2026, 11, 8, 8, 0).toISOString() }, [spend, smsDiff]) === null);
  check('cuenta manual o sin SMS: nada', smsBalanceMismatch({ ...a, balanceMode: 'manual' }, [smsDiff]) === null && smsBalanceMismatch(a, [spend]) === null);
}

// ─────────────────────────────────────────────────────────────
// 7. Borrar una transferencia a mano devuelve el saldo manual
// ─────────────────────────────────────────────────────────────
{
  const m1 = acc('m1', { balance: 800, balanceMode: 'manual' });
  const m2 = acc('m2', { balance: 250, balanceMode: 'manual' });
  const au = acc('au', { balanceMode: 'auto', balance: 0 });
  const nn = acc('nn', { balanceMode: 'none', balance: 0 });
  const manualTx = tx('transfer_1731000000000', 'transfer', 200, d(2026, 11, 10), { source: 'manual', category: 'transfer', fromAccountId: 'm1', toAccountId: 'm2' });
  const back = planManualEffectsRevert([m1, m2, au, nn], manualTx);
  check('revertir: devuelve el saldo de las dos cuentas manuales', back[0].balance === 1000 && back[1].balance === 50);
  check('revertir: no toca las cuentas auto ni sin saldo', back[2] === au && back[3] === nn);
  const smsAccounts = [m1, m2];
  check('revertir: transferencia que viene de un SMS no revierte nada', planManualEffectsRevert(smsAccounts, { ...manualTx, source: 'sms' }) === smsAccounts);
  check('revertir: mitad de un par no revierte', planManualEffectsRevert([m1, m2], { ...manualTx, transferPairId: 'tp_x' })[0].balance === 800);
  check('revertir: un gasto normal no revierte', planManualEffectsRevert([m1, m2], tx('e', 'expense', 10, d(2026, 11, 10), { source: 'manual', accountId: 'm1' }))[0].balance === 800);
  const cardPay = tx('cardpay_1731000000000_Q', 'transfer', 500, d(2026, 11, 10), { source: 'manual', category: 'transfer', fromAccountId: 'm1', toAccountId: 'visa', cardPayment: { cardId: 'visa', cutKey: '2026-11-09' } });
  const backCard = planManualEffectsRevert([m1, acc('visa', { type: 'credit', balanceMode: 'none' })], cardPay);
  check('revertir: el pago de tarjeta devuelve lo que se descontó a la cuenta pagadora', backCard[0].balance === 1300 && backCard[1].balance === 0);
  // Una cuenta re-ajustada DESPUÉS de crear el movimiento ya lo incluye en su ancla
  const readjusted = acc('m1', { balance: 800, balanceMode: 'manual', balanceAnchorAt: new Date(1731000000000 + 60_000).toISOString(), balanceAnchorAmount: 800 });
  check('revertir: si se ajustó al saldo real después, no se revierte', planManualEffectsRevert([readjusted, m2], manualTx)[0].balance === 800 && planManualEffectsRevert([readjusted, m2], manualTx)[1].balance === 50);
}

// ─────────────────────────────────────────────────────────────
// 8. Storage: borrar revierte, y unir con el SMS
// ─────────────────────────────────────────────────────────────
async function storageScenarios(): Promise<void> {
  resetMemoryStorage();
  await StorageService.saveAccounts([acc('m1', { balance: 1000, balanceMode: 'manual' }), acc('m2', { balance: 50, balanceMode: 'manual' }), acc('visa', { type: 'credit', balanceMode: 'none' })]);
  const r = await StorageService.transferBetweenAccounts('m1', 'm2', 200);
  const created = r.transactions[0];
  check('transferir: ajusta los dos saldos manuales', r.accounts.find(a => a.id === 'm1')!.balance === 800 && r.accounts.find(a => a.id === 'm2')!.balance === 250);
  await StorageService.deleteTransaction(created.id);
  const after = await StorageService.getAccounts();
  check('borrar la transferencia: los saldos manuales vuelven', after.find(a => a.id === 'm1')!.balance === 1000 && after.find(a => a.id === 'm2')!.balance === 50);
  check('borrar la transferencia: ya no hay movimientos', (await StorageService.getTransactions()).length === 0);

  await StorageService.registerCardPayment({ cardId: 'visa', cutKey: '2026-11-09', amounts: { Q: 300 }, fromAccountId: 'm1', date: d(2026, 11, 22) });
  const pay = (await StorageService.getTransactions())[0];
  check('pago de tarjeta: baja la cuenta pagadora', (await StorageService.getAccounts()).find(a => a.id === 'm1')!.balance === 700);
  await StorageService.deleteTransaction(pay.id);
  check('borrar el pago de tarjeta: la cuenta recupera lo que se descontó', (await StorageService.getAccounts()).find(a => a.id === 'm1')!.balance === 1000);

  // Una transferencia que viene de un SMS nunca movió el saldo guardado: borrarla tampoco lo toca
  resetMemoryStorage();
  await StorageService.saveAccounts([acc('m1', { balance: 1000, balanceMode: 'manual' }), acc('m2', { balance: 50, balanceMode: 'manual' })]);
  await StorageService.saveTransactions([tx('lone', 'expense', 60, d(2026, 11, 2, 9, 0), { accountId: 'm1', category: 'transfer' })]);
  await StorageService.assignTransferDestination('lone', 'm2');
  await StorageService.deleteTransaction('lone');
  const afterSms = await StorageService.getAccounts();
  check('borrar una transferencia de SMS no toca los saldos manuales', afterSms.find(a => a.id === 'm1')!.balance === 1000 && afterSms.find(a => a.id === 'm2')!.balance === 50);

  // Unir con el SMS que ya llegó: sin duplicar
  resetMemoryStorage();
  await StorageService.saveAccounts([
    acc('ban', { balance: 5000, balanceMode: 'manual' }), acc('bac', { balance: 100, balanceMode: 'manual' }),
    acc('au', { balanceMode: 'auto', initialBalance: 0 }),
  ]);
  const o = tx('o1', 'expense', 3000, d(2026, 11, 10, 15, 5), { accountId: 'ban', category: 'transfer' });
  const i = tx('i1', 'income', 3000, d(2026, 11, 10, 15, 6), { accountId: 'bac', category: 'transfer_in' });
  await StorageService.saveTransactions([o, i]);
  const j1 = await StorageService.joinTransferWithSms({ outId: 'o1', fromId: 'ban', toId: 'bac' });
  const joined = j1.transactions.find(t => t.id === 'o1')!;
  check('unir con la salida: es la transferencia (neutra) y no se crea otro movimiento', j1.transactions.length === 2 && joined.type === 'transfer' && joined.fromAccountId === 'ban' && joined.toAccountId === 'bac');
  check('unir con la salida: las cuentas manuales sí se ajustan (la persona la registró)', j1.accounts.find(a => a.id === 'ban')!.balance === 2000 && j1.accounts.find(a => a.id === 'bac')!.balance === 3100);

  resetMemoryStorage();
  await StorageService.saveAccounts([acc('ban', { balance: 5000, balanceMode: 'manual' }), acc('bac', { balance: 100, balanceMode: 'manual' })]);
  await StorageService.saveTransactions([o, i]);
  const j2 = await StorageService.joinTransferWithSms({ outId: 'o1', inId: 'i1', fromId: 'ban', toId: 'bac' });
  const half = j2.transactions.find(t => t.id === 'o1')!;
  check('unir los dos SMS: quedan emparejados', j2.transactions.every(t => t.type === 'transfer' && !!t.transferPairId) && !!half.transferPairId);
  check('unir los dos SMS: los saldos manuales se ajustan una sola vez', j2.accounts.find(a => a.id === 'ban')!.balance === 2000 && j2.accounts.find(a => a.id === 'bac')!.balance === 3100);

  resetMemoryStorage();
  await StorageService.saveAccounts([acc('ban', { balance: 5000, balanceMode: 'manual' }), acc('bac', { balance: 100, balanceMode: 'manual' })]);
  await StorageService.saveTransactions([{ ...i, id: 'i2', accountId: undefined }]);
  const j3 = await StorageService.joinTransferWithSms({ inId: 'i2', fromId: 'ban', toId: 'bac' });
  const inJoined = j3.transactions.find(t => t.id === 'i2')!;
  check('unir con la entrada sin cuenta: toma la cuenta de destino y queda desde el origen', inJoined.type === 'transfer' && inJoined.toAccountId === 'bac' && inJoined.fromAccountId === 'ban' && inJoined.accountId === 'bac');

  resetMemoryStorage();
  const au = acc('au', { balanceMode: 'auto', initialBalance: 0, balanceAnchorAmount: 0, balanceAnchorAt: d(2026, 11, 1).toISOString() });
  const bn = acc('ban', { balanceMode: 'auto', initialBalance: 0, balanceAnchorAmount: 1000, balanceAnchorAt: d(2026, 11, 1).toISOString() });
  await StorageService.saveAccounts([bn, au]);
  await StorageService.saveTransactions([{ ...o, accountId: 'ban' }]);
  const j4 = await StorageService.joinTransferWithSms({ outId: 'o1', fromId: 'ban', toId: 'au' });
  const view = withDerivedBalances(j4.accounts, j4.transactions);
  check('unir con cuentas automáticas: el saldo no se guarda y el derivado cuenta una sola vez',
    j4.accounts.find(a => a.id === 'ban')!.balance === 0 && near(view.find(a => a.id === 'au')!.balance, 3000) && near(view.find(a => a.id === 'ban')!.balance, -2000), JSON.stringify(view.map(a => a.balance)));
  check('derivado coincide con deriveBalance', near(deriveBalance(j4.accounts.find(a => a.id === 'ban')!, j4.transactions), -2000));

  const none = await StorageService.joinTransferWithSms({ outId: 'nope', fromId: 'ban', toId: 'au' });
  check('unir con un SMS que no existe no cambia nada', none.transactions.length === 1 && none.transactions[0].type === 'transfer');
}

storageScenarios()
  .then(() => {
    console.log(`\nTransferencias y saldos (formulario): ${checks - failures}/${checks} comprobaciones correctas.`);
    if (failures > 0) process.exit(1);
  })
  .catch(e => { console.error(e); process.exit(1); });
