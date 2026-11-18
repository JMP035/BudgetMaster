process.env.TZ = 'America/Guatemala';
// Pruebas de los saldos opcionales (services/Balances.ts, TransferQuestions.ts y su cableado en storage). Sin dependencias:
//   npm run test:balances   →   sucrase-node scripts/balances.test.ts
import { resetMemoryStorage } from './_async-storage-mock';

import {
  accountEffect, applyManualEffects, balanceModeOf, deriveBalance, isBalanceTracked, latestSmsBalance,
  planBalanceAnchorsUndo, planSmsBalanceAnchors, withBalanceAnchor, withDerivedBalances,
} from '../services/Balances';
import {
  findUnpairedTransfers, movableAccounts, planAssignTransferDestination, transferQuestionKey,
} from '../services/TransferQuestions';
import { applyTransferPair } from '../services/TransferPairs';
import { applyCardPaymentMatch, buildCardPaymentTxs } from '../services/CardStatement';
import { buildRecordFromClassification, classifyBankSms } from '../services/BankSmsParser';
import { StorageService, calcNetWorthFromAccounts } from '../services/storage';
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

/** Gasto del período en Q como lo cuenta la app: solo type 'expense'. */
const spentQ = (txs: Transaction[]) => txs.filter(t => t.type === 'expense' && t.currency === 'Q').reduce((s, t) => s + t.amount, 0);

const ANCHOR = d(2026, 11, 1, 8, 0);
const ban = () => acc('ban', { name: 'Banrural', bankName: 'Banrural', balanceMode: 'auto', balanceAnchorAmount: 1000, balanceAnchorAt: ANCHOR.toISOString() });
const bac = () => acc('bac', { name: 'BAC', bankName: 'BAC', balanceMode: 'auto', balanceAnchorAmount: 500, balanceAnchorAt: ANCHOR.toISOString() });
const card = () => acc('card', { name: 'BAC Visa', type: 'credit', balanceMode: 'none', payFromAccountId: 'bac', cutoffDay: 9, paymentDueDay: 2 });
const derived = (accounts: Account[], txs: Transaction[], id: string) => withDerivedBalances(accounts, txs).find(a => a.id === id)!.balance;

// ─────────────────────────────────────────────────────────────
// 1. Modo por defecto y patrimonio
// ─────────────────────────────────────────────────────────────
{
  check('sin modo: banco = manual', balanceModeOf(acc('a')) === 'manual');
  check('sin modo: tarjeta = none', balanceModeOf(acc('c', { type: 'credit' })) === 'none');
  check('modo guardado se respeta', balanceModeOf(acc('a', { balanceMode: 'none' })) === 'none' && balanceModeOf(acc('a', { balanceMode: 'auto' })) === 'auto');
  check('isBalanceTracked: none no, manual/auto sí', !isBalanceTracked(acc('a', { balanceMode: 'none' })) && isBalanceTracked(acc('b')) && isBalanceTracked(acc('c', { balanceMode: 'auto' })));

  const accounts = [
    acc('m', { balance: 100, balanceMode: 'manual' }),
    acc('n', { balance: 999, balanceMode: 'none' }),
    acc('u', { balance: 50, currency: 'USD', balanceMode: 'manual' }),
    card(),
  ];
  const nw = calcNetWorthFromAccounts(accounts, 7.7);
  check('patrimonio: modo none ignorado', near(nw.totalQ, 100) && near(nw.totalUSD, 50), JSON.stringify(nw));
  const nwNone = calcNetWorthFromAccounts([acc('n', { balance: 999, balanceMode: 'none' }), card()], 7.7);
  check('patrimonio: sin cuentas con saldo todo es 0', nwNone.totalQ === 0 && nwNone.totalUSD === 0);
  const view = withDerivedBalances(accounts, []);
  check('withDerivedBalances sin cuentas auto devuelve las mismas', view === accounts);
}

// ─────────────────────────────────────────────────────────────
// 2. Flujo completo: sueldo en Banrural → transferencia a BAC (par SMS) → pago de la tarjeta desde BAC
// ─────────────────────────────────────────────────────────────
{
  const accounts = [ban(), bac(), card()];
  const sal = tx('sal', 'income', 7426.61, d(2026, 11, 5, 8, 0), { accountId: 'ban', bank: 'BANRURAL' });
  const tout = tx('tout', 'expense', 3000, d(2026, 11, 5, 11, 0), { accountId: 'ban', bank: 'BANRURAL', category: 'transfer' });
  const tin = tx('tin', 'income', 3000, d(2026, 11, 5, 11, 2), { accountId: 'bac', bank: 'BAC', category: 'transfer_in' });
  const buy = tx('buy', 'expense', 150, d(2026, 11, 6, 9, 0), { accountId: 'bac', bank: 'BAC', category: 'food' });
  const pay = tx('pay', 'transfer', 2500, d(2026, 11, 20, 10, 0), { accountId: 'card', bank: 'BAC', category: 'transfer' });
  const payOut = tx('payOut', 'expense', 2500, d(2026, 11, 20, 10, 1), { accountId: 'bac', bank: 'BAC', category: 'transfer' });
  const raw = [sal, tout, tin, buy, pay, payOut];

  // Antes de emparejar: las salidas aparecen como gasto y las entradas como ingreso, pero los saldos ya cuadran.
  check('antes de emparejar: Banrural', near(derived(accounts, raw, 'ban'), 1000 + 7426.61 - 3000), String(derived(accounts, raw, 'ban')));
  check('antes de emparejar: BAC', near(derived(accounts, raw, 'bac'), 500 + 3000 - 150 - 2500));

  const paired = applyTransferPair(raw, 'tout', 'tin');
  const matched = applyCardPaymentMatch(paired, { txId: 'pay', cardId: 'card', cutKey: '2026-11-09', outId: 'payOut' });
  check('el pago de tarjeta se emparejó', matched.paired);
  const all = matched.txs;

  check('par SMS: sueldo +7,426.61 y transferencia −3,000 en Banrural', near(derived(accounts, all, 'ban'), 5426.61), String(derived(accounts, all, 'ban')));
  check('par SMS: la entrada +3,000 y el pago de tarjeta −2,500 en BAC', near(derived(accounts, all, 'bac'), 850), String(derived(accounts, all, 'bac')));
  check('los saldos no cambian al emparejar (mismo resultado antes y después)',
    near(derived(accounts, all, 'ban'), derived(accounts, raw, 'ban')) && near(derived(accounts, all, 'bac'), derived(accounts, raw, 'bac')));
  check('el pago de tarjeta no toca la tarjeta (modo none)', derived(accounts, all, 'card') === 0);
  check('cada mitad del par mueve la cuenta donde está',
    accountEffect(all.find(t => t.id === 'tout')!, 'ban') === -3000 && accountEffect(all.find(t => t.id === 'tin')!, 'bac') === 3000
    && accountEffect(all.find(t => t.id === 'tout')!, 'bac') === 0);
  check('el pago de tarjeta resta de BAC (la pagadora) y de nadie más',
    accountEffect(all.find(t => t.id === 'payOut')!, 'bac') === -2500 && accountEffect(all.find(t => t.id === 'pay')!, 'card') === 0
    && accountEffect(all.find(t => t.id === 'payOut')!, 'ban') === 0);

  // El gasto del período: solo la compra real; el par y el pago son neutros.
  check('el gasto del período es solo la compra (150)', spentQ(all) === 150, String(spentQ(all)));
  check('transferencias y pago: type transfer, nunca gasto', all.filter(t => t.transferPairId).every(t => t.type === 'transfer'));
  check('los saldos se muestran sin guardar el derivado en las cuentas originales', accounts[0].balance === 0 && accounts[1].balance === 0);

  // Pago registrado a mano desde BAC (buildCardPaymentTxs): resta de la pagadora, en la moneda de la cuenta.
  const manualPay = buildCardPaymentTxs({ card: { id: 'card', name: 'BAC Visa' }, cutKey: '2026-11-09', amounts: { Q: 1000, USD: 10 }, fromAccountId: 'bac', date: d(2026, 11, 22), idSeed: 'x' });
  const withManual = [...all, ...manualPay];
  check('pago manual: BAC baja 1,000 (solo la parte en quetzales)', near(derived(accounts, withManual, 'bac'), 850 - 1000), String(derived(accounts, withManual, 'bac')));
  check('pago manual: la tarjeta no cambia', derived(accounts, withManual, 'card') === 0);
  check('pago manual: el gasto del período no cambia', spentQ(withManual) === 150);
  const cardAuto = { ...card(), balanceMode: 'auto' as const };
  check('aunque la tarjeta estuviera en auto, el pago no le suma', accountEffect(manualPay[0], 'card', { isCard: cardAuto.type === 'credit' }) === 0);
}

// ─────────────────────────────────────────────────────────────
// 3. Re-anclaje («Ajustar al saldo real») y movimientos en la misma fecha
// ─────────────────────────────────────────────────────────────
{
  const a = bac();
  const txs = [
    tx('i1', 'income', 3000, d(2026, 11, 5, 11, 2), { accountId: 'bac' }),
    tx('e1', 'expense', 150, d(2026, 11, 6, 9, 0), { accountId: 'bac' }),
    tx('e2', 'expense', 2500, d(2026, 11, 20, 10, 1), { accountId: 'bac' }),
  ];
  check('ancla original: 500 + 3000 − 150 − 2500', near(deriveBalance(a, txs), 850));
  const at = d(2026, 11, 10, 9, 0);
  const re = withBalanceAnchor(a, 900, at.toISOString());
  check('re-anclar: solo cuentan los movimientos posteriores', near(deriveBalance(re, txs), 900 - 2500), String(deriveBalance(re, txs)));
  check('re-anclar: el saldo guardado y el ancla quedan fijados', re.balance === 900 && re.balanceAnchorAmount === 900 && re.balanceAnchorAt === at.toISOString());
  const same = tx('same', 'expense', 10, at, { accountId: 'bac' });
  check('un movimiento en el mismo instante del ancla no cuenta (ya está en el saldo real)', near(deriveBalance(re, [...txs, same]), 900 - 2500));
  const noAnchor = acc('na', { balanceMode: 'auto', initialBalance: 200 });
  check('sin ancla: saldo inicial + todos los movimientos', near(deriveBalance(noAnchor, [tx('x', 'income', 50, d(2026, 5, 1), { accountId: 'na' }), tx('y', 'expense', 20, d(2026, 6, 1), { accountId: 'na' })]), 230));
}

// ─────────────────────────────────────────────────────────────
// 4. Monedas: FX con toAmount
// ─────────────────────────────────────────────────────────────
{
  const q = bac();
  const usd = acc('usd', { currency: 'USD', balanceMode: 'auto', initialBalance: 10 });
  const fx = tx('fx', 'transfer', 770, d(2026, 11, 8), { source: 'manual', fromAccountId: 'bac', toAccountId: 'usd', toAmount: 100 });
  check('FX: la cuenta en USD recibe toAmount', near(deriveBalance(usd, [fx]), 110));
  check('FX: la cuenta en Q baja el monto', near(deriveBalance(q, [fx]), 500 - 770));
  const noTo = tx('fx2', 'transfer', 770, d(2026, 11, 8), { source: 'manual', fromAccountId: 'bac', toAccountId: 'usd' });
  check('sin toAmount y moneda distinta: la cuenta destino no cambia', near(deriveBalance(usd, [noTo]), 10));
  const usdExp = tx('ue', 'expense', 30, d(2026, 11, 9), { accountId: 'bac', currency: 'USD' });
  check('un movimiento en otra moneda no afecta la cuenta', near(deriveBalance(q, [usdExp]), 500));
  const same = tx('sm', 'transfer', 100, d(2026, 11, 8), { source: 'manual', fromAccountId: 'bac', toAccountId: 'ban' });
  check('misma moneda: sale y entra lo mismo', accountEffect(same, 'bac') === -100 && accountEffect(same, 'ban') === 100);
}

// ─────────────────────────────────────────────────────────────
// 5. Modo manual: no se duplica; solo transferencias/pagos de la app lo mueven
// ─────────────────────────────────────────────────────────────
{
  const man = acc('man', { balance: 1000, balanceMode: 'manual' });
  const man2 = acc('man2', { balance: 50, balanceMode: 'manual' });
  const none = acc('non', { balance: 0, balanceMode: 'none' });
  const au = acc('au', { balanceMode: 'auto', initialBalance: 0 });
  const accounts = [man, man2, none, au];
  const t = tx('t', 'transfer', 200, d(2026, 11, 8), { source: 'manual', fromAccountId: 'man', toAccountId: 'man2' });
  const adj = applyManualEffects(accounts, [t]);
  check('manual: origen −200 y destino +200 en el saldo guardado', adj[0].balance === 800 && adj[1].balance === 250);
  check('manual: none y auto no se tocan', adj[2] === none && adj[3] === au);
  // Con el movimiento ya en la lista, la vista NO lo vuelve a sumar a las cuentas manuales.
  const view = withDerivedBalances(adj, [t]);
  check('manual: la vista no duplica el movimiento', view[0].balance === 800 && view[1].balance === 250);
  const toAuto = tx('t2', 'transfer', 70, d(2026, 11, 8), { source: 'manual', fromAccountId: 'man', toAccountId: 'au' });
  const adj2 = applyManualEffects(accounts, [toAuto]);
  check('manual → auto: baja el manual y el auto solo lo deriva', adj2[0].balance === 930 && adj2[3].balance === 0 && near(derived(adj2, [toAuto], 'au'), 70));
  const manualPay = buildCardPaymentTxs({ card: { id: 'card', name: 'Visa' }, cutKey: 'k', amounts: { Q: 300 }, fromAccountId: 'man', date: d(2026, 11, 9), idSeed: 'p' });
  check('manual: el pago de tarjeta resta de la cuenta pagadora', applyManualEffects([man, card()], manualPay)[0].balance === 700);
}

// ─────────────────────────────────────────────────────────────
// 6. Conciliación con el saldo del SMS (smsBalance) y deshacer
// ─────────────────────────────────────────────────────────────
{
  const a = { ...ban(), smsAutoBalance: true };
  const b = bac(); // auto pero sin smsAutoBalance: no concilia
  const accounts = [a, b];
  const s1 = tx('s1', 'expense', 50, d(2026, 11, 8, 10, 0), { accountId: 'ban', smsBalance: { amount: 4200, currency: 'Q' } });
  const s2 = tx('s2', 'expense', 20, d(2026, 11, 9, 10, 0), { accountId: 'ban', smsBalance: { amount: 4180, currency: 'Q' } });
  const old = tx('old', 'expense', 5, d(2026, 10, 20, 10, 0), { accountId: 'ban', smsBalance: { amount: 1, currency: 'Q' } });
  const usdOne = tx('usd1', 'expense', 5, d(2026, 11, 12, 10, 0), { accountId: 'ban', currency: 'USD', smsBalance: { amount: 77, currency: 'USD' } });
  const forBac = tx('fb', 'expense', 5, d(2026, 11, 9, 11, 0), { accountId: 'bac', smsBalance: { amount: 300, currency: 'Q' } });
  const txs = [s1, s2, old, usdOne, forBac];

  const latest = latestSmsBalance(a, txs);
  check('latestSmsBalance: el más reciente de la misma moneda', !!latest && latest.amount === 4180 && latest.txId === 's2');
  const plan = planSmsBalanceAnchors(accounts, txs);
  check('re-ancla solo la cuenta auto con smsAutoBalance', plan.records.length === 1 && plan.records[0].accountId === 'ban');
  const nb = plan.accounts.find(x => x.id === 'ban')!;
  check('el ancla queda en el saldo y fecha del SMS', nb.balanceAnchorAmount === 4180 && nb.balanceAnchorAt === s2.date);
  check('el saldo conciliado es el del SMS (el movimiento del SMS ya está dentro)', near(derived(plan.accounts, txs, 'ban'), 4180));
  check('movimientos posteriores al SMS sí cuentan', near(derived(plan.accounts, [...txs, tx('later', 'expense', 80, d(2026, 11, 10), { accountId: 'ban' })], 'ban'), 4100));
  check('la cuenta sin smsAutoBalance no cambia', plan.accounts.find(x => x.id === 'bac') === b);
  check('el registro guarda el ancla previa', plan.records[0].prevAmount === 1000 && plan.records[0].prevAt === ANCHOR.toISOString() && plan.records[0].at === s2.date);

  const again = planSmsBalanceAnchors(plan.accounts, txs);
  check('segunda pasada: idempotente (sin registros)', again.records.length === 0 && again.accounts === plan.accounts);

  // Un ajuste manual MÁS NUEVO que el SMS no se pisa.
  const manualLater = withBalanceAnchor(a, 4000, d(2026, 11, 15).toISOString());
  check('un ancla manual más nueva que el SMS no se pisa', planSmsBalanceAnchors([manualLater], txs).records.length === 0);

  // Deshacer
  const undone = planBalanceAnchorsUndo(plan.records, plan.accounts);
  const ub = undone.accounts.find(x => x.id === 'ban')!;
  check('deshacer: vuelve el ancla anterior', undone.changed && ub.balanceAnchorAmount === 1000 && ub.balanceAnchorAt === ANCHOR.toISOString() && ub.balance === 0);
  const reAdjusted = plan.accounts.map(x => x.id === 'ban' ? withBalanceAnchor(x, 3000, d(2026, 11, 16).toISOString()) : x);
  check('deshacer: si la persona ajustó después, no se toca', !planBalanceAnchorsUndo(plan.records, reAdjusted).changed);
  const virgin = planSmsBalanceAnchors([{ ...acc('v', { balanceMode: 'auto', smsAutoBalance: true }) }], [tx('v1', 'expense', 5, d(2026, 11, 8), { accountId: 'v', smsBalance: { amount: 10, currency: 'Q' } })]);
  const vBack = planBalanceAnchorsUndo(virgin.records, virgin.accounts).accounts[0];
  check('deshacer una cuenta que no tenía ancla: lo quita', vBack.balanceAnchorAmount === undefined && vBack.balanceAnchorAt === undefined);
  check('sin registros no hay cambios', !planBalanceAnchorsUndo(undefined, accounts).changed && !planBalanceAnchorsUndo([], accounts).changed);
}

// ─────────────────────────────────────────────────────────────
// 7. El parser expone el saldo del SMS sin cambiar el monto principal
// ─────────────────────────────────────────────────────────────
{
  const recv = Date.UTC(2026, 10, 5, 16);
  const m1 = 'BANRURAL: Debito por Q50.00 en: SUPER MERCADO. Saldo disponible: Q1,234.56 Fecha 05/11/2026 10:00';
  const c1 = classifyBankSms({ body: m1, receivedAt: recv });
  check('parser: monto principal sigue siendo el del movimiento', c1.accepted && c1.amount === 50);
  check('parser: balanceAfter trae el saldo', !!c1.balanceAfter && c1.balanceAfter.amount === 1234.56 && c1.balanceAfter.currency === 'Q');
  const r1 = buildRecordFromClassification(c1, m1);
  check('el movimiento copia el saldo a smsBalance', r1?.transaction?.smsBalance?.amount === 1234.56 && r1.transaction.amount === 50);
  const m2 = 'BAC: Compra aprobada por Q125.50 en SUPER 24 con tarjeta BAC VISA 05/11/2026 10:00';
  const c2 = classifyBankSms({ body: m2, receivedAt: recv });
  check('parser: sin «saldo» no hay balanceAfter', c2.accepted && c2.amount === 125.5 && c2.balanceAfter === null);
  check('sin saldo no hay smsBalance', buildRecordFromClassification(c2, m2)?.transaction?.smsBalance === undefined);
  const m3 = 'BANRURAL: Se acredito Q7,426.61 a su cuenta 4400123456. Saldo actual: Q8,000.00. 05/11/2026 08:00';
  const c3 = classifyBankSms({ body: m3, receivedAt: recv });
  check('parser: depósito con saldo', c3.accepted && c3.amount === 7426.61 && c3.balanceAfter?.amount === 8000);
  const m4 = 'BAC: Compra aprobada por $20.00 en AMAZON con tarjeta BAC VISA. Saldo disponible Q 900.00 05/11/2026 10:00';
  const c4 = classifyBankSms({ body: m4, receivedAt: recv });
  check('parser: un saldo en otra moneda que el movimiento no se toma', c4.accepted && c4.currency === 'USD' && c4.balanceAfter === null);
  const m5 = 'BAC: Compra aprobada por Q125.50 en SUPER 24 con tarjeta BAC VISA. Cupo disponible Q 5,000.00 05/11/2026 10:00';
  const c5 = classifyBankSms({ body: m5, receivedAt: recv });
  check('parser: «cupo disponible» no es el saldo de la cuenta', c5.accepted && c5.amount === 125.5 && c5.balanceAfter === null);
}

// ─────────────────────────────────────────────────────────────
// 8. Preguntas de transferencias sin par
// ─────────────────────────────────────────────────────────────
{
  const NOW = d(2026, 11, 20, 12, 0);
  const two = [acc('ban', { balanceMode: 'manual' }), acc('bac', { balanceMode: 'manual' })];
  const oldOut = tx('oldOut', 'expense', 500, d(2026, 11, 10, 9, 0), { accountId: 'ban', bank: 'BANRURAL', category: 'transfer' });
  const oldIn = tx('oldIn', 'income', 800, d(2026, 11, 11, 9, 0), { accountId: 'bac', bank: 'BAC', category: 'transfer_in' });
  const recentLone = tx('recentLone', 'expense', 90, d(2026, 11, 20, 8, 0), { accountId: 'ban', bank: 'BANRURAL', category: 'transfer' });
  const justNow = tx('justNow', 'expense', 91, d(2026, 11, 20, 11, 40), { accountId: 'ban', bank: 'BANRURAL', category: 'transfer' });
  const outP = tx('outP', 'expense', 300, d(2026, 11, 20, 9, 0), { accountId: 'ban', bank: 'BANRURAL', category: 'transfer' });
  const inP = tx('inP', 'income', 300, d(2026, 11, 20, 9, 5), { accountId: 'bac', bank: 'BAC', category: 'transfer_in' });
  const cardOut = tx('cardOut', 'expense', 700, d(2026, 11, 1, 9, 0), { accountId: 'bac', bank: 'BAC', category: 'transfer', cardPayment: { cardId: 'card', cutKey: 'k' } });
  const manualOut = tx('manualOut', 'expense', 40, d(2026, 11, 1, 9, 0), { accountId: 'bac', source: 'manual', category: 'transfer' });
  const all = [oldOut, oldIn, recentLone, justNow, outP, inP, cardOut, manualOut];

  const q = findUnpairedTransfers(all, two, new Set(), NOW);
  const ids = q.map(x => x.txId);
  check('pregunta: salida y entrada con más de 36 h', ids.includes('oldOut') && ids.includes('oldIn') && q.find(x => x.txId === 'oldOut')!.reason === 'old');
  check('pregunta: la entrada se marca como «in» y la salida como «out»', q.find(x => x.txId === 'oldIn')!.direction === 'in' && q.find(x => x.txId === 'oldOut')!.direction === 'out');
  check('pregunta: reciente sin contraparte posible (pasada la gracia)', ids.includes('recentLone') && q.find(x => x.txId === 'recentLone')!.reason === 'no_counterpart');
  check('pregunta: no se pregunta lo que acaba de llegar (aún puede venir su otra mitad)', !ids.includes('justNow'));
  check('pregunta: no se pregunta si hay contraparte posible reciente', !ids.includes('outP') && !ids.includes('inP'));
  check('pregunta: pago de tarjeta y movimientos manuales no se preguntan', !ids.includes('cardOut') && !ids.includes('manualOut'));
  check('pregunta: más antiguas primero', ids[0] === 'oldOut' && ids[1] === 'oldIn');

  const paired = applyTransferPair(all, 'outP', 'inP');
  check('un par ya vinculado no se pregunta', !findUnpairedTransfers(paired, two, new Set(), NOW).some(x => x.txId === 'outP' || x.txId === 'inP'));
  check('descartada: no vuelve (clave tq|id)', transferQuestionKey('oldOut') === 'tq|oldOut'
    && !findUnpairedTransfers(all, two, new Set([transferQuestionKey('oldOut')]), NOW).some(x => x.txId === 'oldOut'));

  const oneAndCard = [acc('ban'), card()];
  check('solo hay pregunta con al menos 2 cuentas que no sean tarjeta', findUnpairedTransfers(all, oneAndCard, new Set(), NOW).length === 0 && movableAccounts(oneAndCard).length === 1);
  check('cuentas inactivas no cuentan', findUnpairedTransfers(all, [acc('ban'), acc('bac', { isActive: false })], new Set(), NOW).length === 0);

  // Asignar el destino
  const outFixed = planAssignTransferDestination(oldOut, 'bac', two)!;
  check('salida asignada: transferencia neutra con origen y destino', outFixed.type === 'transfer' && outFixed.category === 'transfer'
    && outFixed.fromAccountId === 'ban' && outFixed.toAccountId === 'bac' && outFixed.transferPrev?.type === 'expense' && outFixed.transferPrev?.category === 'transfer');
  check('salida asignada: mueve ambas cuentas', accountEffect(outFixed, 'ban') === -500 && accountEffect(outFixed, 'bac') === 500);
  check('salida asignada: ya no cuenta como gasto', spentQ([outFixed]) === 0);
  const inFixed = planAssignTransferDestination(oldIn, 'ban', two)!;
  check('entrada asignada: viene de la cuenta elegida', inFixed.type === 'transfer' && inFixed.toAccountId === 'bac' && inFixed.fromAccountId === 'ban' && inFixed.transferPrev?.type === 'income');
  check('entrada asignada: mueve ambas cuentas', accountEffect(inFixed, 'bac') === 800 && accountEffect(inFixed, 'ban') === -800);
  check('la pregunta ya no sale una vez asignada', !findUnpairedTransfers([outFixed, inFixed], two, new Set(), NOW).length);
  check('el original no se muta', oldOut.type === 'expense' && oldOut.fromAccountId === undefined);
  check('no se asigna la misma cuenta, una tarjeta ni una cuenta que no existe',
    planAssignTransferDestination(oldOut, 'ban', two) === null
    && planAssignTransferDestination(oldOut, 'card', [...two, card()]) === null
    && planAssignTransferDestination(oldOut, 'zzz', two) === null);
  check('un movimiento que no es salida/entrada de transferencia no se asigna', planAssignTransferDestination(tx('z', 'expense', 5, NOW, { accountId: 'ban', category: 'food' }), 'bac', two) === null);
  const fx = planAssignTransferDestination(oldOut, 'usd', [...two, acc('usd', { currency: 'USD' })], { toAmount: 65 })!;
  check('salida a una cuenta en USD: toAmount', fx.toAmount === 65 && near(accountEffect(fx, 'usd', { currency: 'USD' }), 65));
}

// ─────────────────────────────────────────────────────────────
// 9. Cableado en StorageService (AsyncStorage en memoria)
// ─────────────────────────────────────────────────────────────
async function storageScenarios(): Promise<void> {
  // 9a. Migración balance_modes_v1
  resetMemoryStorage();
  await StorageService.saveAccounts([acc('b1'), acc('c1', { type: 'credit' }), acc('a1', { balanceMode: 'auto' }), acc('n1', { balanceMode: 'none' })]);
  await StorageService.runMigrations();
  const migrated = await StorageService.getAccounts();
  check('migración: banco → manual', migrated.find(a => a.id === 'b1')!.balanceMode === 'manual');
  check('migración: tarjeta → none', migrated.find(a => a.id === 'c1')!.balanceMode === 'none');
  check('migración: lo que ya tenía modo se respeta', migrated.find(a => a.id === 'a1')!.balanceMode === 'auto' && migrated.find(a => a.id === 'n1')!.balanceMode === 'none');
  await StorageService.saveAccounts(migrated.map(a => a.id === 'b1' ? { ...a, balanceMode: 'auto' as const } : a));
  await StorageService.runMigrations();
  check('migración: no se repite (idempotente)', (await StorageService.getAccounts()).find(a => a.id === 'b1')!.balanceMode === 'auto');

  // 9b. transferBetweenAccounts
  resetMemoryStorage();
  await StorageService.saveAccounts([
    acc('m1', { balance: 1000, balanceMode: 'manual' }), acc('m2', { balance: 50, balanceMode: 'manual' }),
    acc('nn', { balance: 0, balanceMode: 'none' }), acc('au', { balanceMode: 'auto', initialBalance: 0 }),
    acc('us', { currency: 'USD', balance: 10, balanceMode: 'manual' }),
  ]);
  const r1 = await StorageService.transferBetweenAccounts('m1', 'm2', 200);
  check('transferir manual→manual: un solo movimiento type transfer con origen y destino',
    r1.transactions.length === 1 && r1.transactions[0].type === 'transfer' && r1.transactions[0].fromAccountId === 'm1' && r1.transactions[0].toAccountId === 'm2' && r1.transactions[0].amount === 200);
  check('transferir manual→manual: se ajusta el saldo guardado', r1.accounts.find(a => a.id === 'm1')!.balance === 800 && r1.accounts.find(a => a.id === 'm2')!.balance === 250);
  check('transferir: queda guardado', (await StorageService.getAccounts()).find(a => a.id === 'm1')!.balance === 800 && (await StorageService.getTransactions()).length === 1);
  check('transferir: nunca cuenta como gasto', spentQ(r1.transactions) === 0);

  const r2 = await StorageService.transferBetweenAccounts('nn', 'm2', 99999);
  check('transferir desde una cuenta sin saldo (none): sin validar saldo', r2.transactions.length === 2 && r2.accounts.find(a => a.id === 'nn')!.balance === 0);
  check('transferir desde none: el destino manual sí sube', r2.accounts.find(a => a.id === 'm2')!.balance === 250 + 99999);

  const r3 = await StorageService.transferBetweenAccounts('m1', 'au', 100);
  check('transferir a una cuenta auto: no se guarda el saldo, se deriva', r3.accounts.find(a => a.id === 'au')!.balance === 0 && near(derived(r3.accounts, r3.transactions, 'au'), 100));
  check('transferir a una cuenta auto: el origen manual baja una sola vez', r3.accounts.find(a => a.id === 'm1')!.balance === 700);

  const r4 = await StorageService.transferBetweenAccounts('m1', 'us', 770, { toAmount: 100 });
  check('transferir entre monedas: guarda toAmount y sube el destino manual en SU moneda', r4.transactions[0].toAmount === 100 && r4.accounts.find(a => a.id === 'us')!.balance === 110 && r4.accounts.find(a => a.id === 'm1')!.balance === -70);
  const r5 = await StorageService.transferBetweenAccounts('m1', 'm2', 10, { toAmount: 5 });
  check('toAmount se ignora entre cuentas de la misma moneda', r5.transactions[0].toAmount === undefined);
  const before = (await StorageService.getTransactions()).length;
  const bad = await StorageService.transferBetweenAccounts('m1', 'm1', 10);
  check('transferir a la misma cuenta no hace nada', bad.transactions.length === before);

  // 9c. registerCardPayment
  resetMemoryStorage();
  await StorageService.saveAccounts([
    acc('pm', { balance: 5000, balanceMode: 'manual' }), acc('pa', { balanceMode: 'auto', initialBalance: 5000 }),
    acc('visa', { type: 'credit', balanceMode: 'none', payFromAccountId: 'pm' }),
  ]);
  const t1 = await StorageService.registerCardPayment({ cardId: 'visa', cutKey: '2026-11-09', amounts: { Q: 1200, USD: 15 }, fromAccountId: 'pm', date: d(2026, 11, 22) });
  const accs1 = await StorageService.getAccounts();
  check('pago de tarjeta: cuenta manual pagadora baja el monto en su moneda', accs1.find(a => a.id === 'pm')!.balance === 3800, String(accs1.find(a => a.id === 'pm')!.balance));
  check('pago de tarjeta: la tarjeta no cambia', accs1.find(a => a.id === 'visa')!.balance === 0);
  check('pago de tarjeta: es neutro (no gasto)', t1.length === 2 && spentQ(t1) === 0 && t1.every(t => t.type === 'transfer' && !!t.cardPayment));
  await StorageService.registerCardPayment({ cardId: 'visa', cutKey: '2026-11-09', amounts: { Q: 500 }, fromAccountId: 'pa', date: d(2026, 11, 23) });
  const accs2 = await StorageService.getAccounts();
  const txs2 = await StorageService.getTransactions();
  check('pago de tarjeta: cuenta auto no se guarda, se deriva', accs2.find(a => a.id === 'pa')!.balance === 0 && near(derived(accs2, txs2, 'pa'), 4500));
  await StorageService.registerCardPayment({ cardId: 'visa', cutKey: '2026-11-09', amounts: { Q: 100 }, date: d(2026, 11, 24) });
  check('pago de tarjeta sin cuenta pagadora: nadie baja', (await StorageService.getAccounts()).find(a => a.id === 'pm')!.balance === 3800);

  // 9d. setBalanceAnchor
  const at = d(2026, 11, 25, 9, 0).toISOString();
  const anch = await StorageService.setBalanceAnchor('pa', 4300, at);
  const pa = anch.find(a => a.id === 'pa')!;
  check('setBalanceAnchor: fija monto y fecha', pa.balanceAnchorAmount === 4300 && pa.balanceAnchorAt === at && pa.balance === 4300);
  check('setBalanceAnchor: el derivado parte del ancla', near(derived(anch, txs2, 'pa'), 4300));
  check('setBalanceAnchor: cuenta o fecha inválida no cambia nada', (await StorageService.setBalanceAnchor('nope', 1, at)).find(a => a.id === 'pa')!.balance === 4300
    && (await StorageService.setBalanceAnchor('pa', 1, 'no-fecha')).find(a => a.id === 'pa')!.balance === 4300);

  // 9e. syncSmsBalances + deshacer del lote
  resetMemoryStorage();
  const ancla = d(2026, 11, 1, 8, 0).toISOString();
  await StorageService.saveAccounts([{ ...acc('s1', { balanceMode: 'auto', smsAutoBalance: true, balanceAnchorAmount: 1000, balanceAnchorAt: ancla, balance: 1000 }) }, acc('s2', { balanceMode: 'manual', smsAutoBalance: true })]);
  const smsTx = tx('sms_1', 'expense', 40, d(2026, 11, 9, 10, 0), { accountId: 's1', smsBalance: { amount: 3210.5, currency: 'Q' } });
  const smsTx2 = tx('sms_2', 'expense', 40, d(2026, 11, 9, 10, 0), { accountId: 's2', smsBalance: { amount: 12, currency: 'Q' } });
  await StorageService.saveTransactions([smsTx, smsTx2]);
  const recs = await StorageService.syncSmsBalances();
  const afterSync = await StorageService.getAccounts();
  check('syncSmsBalances: re-ancla la cuenta auto con el saldo del SMS', recs.length === 1 && recs[0].accountId === 's1'
    && afterSync.find(a => a.id === 's1')!.balanceAnchorAmount === 3210.5 && afterSync.find(a => a.id === 's1')!.balanceAnchorAt === smsTx.date);
  check('syncSmsBalances: una cuenta manual no se toca', afterSync.find(a => a.id === 's2')!.balanceAnchorAmount === undefined);
  check('syncSmsBalances: segunda vez no cambia nada', (await StorageService.syncSmsBalances()).length === 0);

  const batchId = 'smsb_test';
  await StorageService.recordSmsBatch({ id: batchId, at: new Date().toISOString(), mode: 'manual', txIds: [], installmentIds: [], fixedMarks: [], balanceAnchors: recs });
  const undo = await StorageService.undoSmsBatch(batchId, { includeEdited: false });
  const restored = (await StorageService.getAccounts()).find(a => a.id === 's1')!;
  check('deshacer el lote: la cuenta vuelve al ancla anterior', undo.removedTx === 0 && restored.balanceAnchorAmount === 1000 && restored.balanceAnchorAt === ancla && restored.balance === 1000,
    JSON.stringify(restored));
  check('deshacer el lote: el lote deja el registro', (await StorageService.getSmsBatches()).every(b => b.id !== batchId));

  // 9f. Preguntas: asignar destino y descartar
  resetMemoryStorage();
  const qa = [acc('ban', { balanceMode: 'manual', balance: 100 }), acc('bac', { balanceMode: 'manual', balance: 100 })];
  await StorageService.saveAccounts(qa);
  const lone = tx('lone', 'expense', 60, d(2026, 11, 2, 9, 0), { accountId: 'ban', bank: 'BANRURAL', category: 'transfer' });
  const incoming = tx('inc', 'income', 75, d(2026, 11, 2, 10, 0), { accountId: 'bac', bank: 'BAC', category: 'transfer_in' });
  await StorageService.saveTransactions([lone, incoming]);
  const assigned = await StorageService.assignTransferDestination('lone', 'bac');
  const lt = assigned.find(t => t.id === 'lone')!;
  check('storage: asignar destino convierte la salida en transferencia', lt.type === 'transfer' && lt.toAccountId === 'bac' && lt.fromAccountId === 'ban');
  check('storage: los SMS no mueven el saldo guardado de cuentas manuales', (await StorageService.getAccounts()).every(a => a.balance === 100));
  const same = await StorageService.assignTransferDestination('inc', 'bac');
  check('storage: destino inválido no cambia el movimiento', same.find(t => t.id === 'inc')!.type === 'income');
  await StorageService.dismissTransferQuestion('inc');
  check('storage: descartar guarda la clave tq|id', (await StorageService.getDupIgnored()).includes('tq|inc'));
}

storageScenarios()
  .then(() => {
    console.log(`\nSaldos opcionales: ${checks - failures}/${checks} comprobaciones correctas.`);
    if (failures > 0) process.exit(1);
  })
  .catch(e => {
    console.log('ERROR inesperado en las pruebas de storage:', e);
    process.exit(1);
  });
