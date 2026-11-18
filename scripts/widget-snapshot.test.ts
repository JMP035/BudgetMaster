process.env.TZ = 'America/Guatemala';
// Pruebas de la foto de cifras del widget de Android y de su privacidad (services/WidgetSnapshot.ts + claves de storage).
//   npm run test:widget-snapshot   →   sucrase-node scripts/widget-snapshot.test.ts

import { resetMemoryStorage } from './_async-storage-mock';
import { buildWidgetSnapshot, maskForPrivacy, sanitizeWidgetSnapshot, widgetShortDate } from '../services/WidgetSnapshot';
import type { WidgetSnapshotData } from '../services/WidgetSnapshot';
import { computeFinancialPeriod, daysUntilNextPay } from '../services/FinancialPeriod';
import { StorageService } from '../services/storage';
import type { Account, FixedExpense, Transaction, UserSettings } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const near = (a: number, b: number, eps = 0.01) => Math.abs(a - b) < eps;
const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);

const settings = {
  paymentCycle: 'monthly', paymentDay: 27, paymentDays: [15, 30], monthlyIncome: 8000, budgetLimit: 6000, exchangeRate: 7.7,
} as unknown as UserSettings;

function acct(extra: Partial<Account>): Account {
  return {
    id: 'a', name: 'Cuenta', type: 'bank', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'x',
    isActive: true, createdAt: '2026-01-01T12:00:00.000Z', ...extra,
  };
}

function tx(id: string, date: Date, amount: number, extra: Partial<Transaction> = {}): Transaction {
  return { id, amount, description: id, category: 'other', date: date.toISOString(), type: 'expense', source: 'manual', currency: 'Q', ...extra };
}

const luz: FixedExpense = {
  id: 'f1', name: 'Luz', amount: 300, currency: 'Q', category: 'bills', dayOfMonth: 22, isPaid: false, autoRecord: false, isActive: true,
};

// Los datos reales del usuario: ciclo 10 oct – 9 nov con Q 9,276.01 y US$ 39.67; corte 9, paga el 2.
const visa = acct({ id: 'c1', name: 'BAC Visa', type: 'credit', cutoffDay: 9, paymentDueDay: 2 });
const monibyte = acct({ id: 'b1', name: 'Monibyte', balance: 4000, balanceMode: 'manual' });
const efectivo = acct({ id: 'e1', name: 'Efectivo', balanceMode: 'none' });
const inactiva = acct({ id: 'x1', name: 'Vieja', balance: 999, balanceMode: 'manual', isActive: false });

const cardTxs: Transaction[] = [
  tx('q1', d(2026, 10, 10, 0, 5), 5000.5, { accountId: 'c1' }),
  tx('q2', d(2026, 10, 25), 4000, { accountId: 'c1' }),
  tx('q3', d(2026, 11, 9, 23, 30), 275.51, { accountId: 'c1' }),
  tx('u1', d(2026, 10, 12), 20.17, { accountId: 'c1', currency: 'USD' }),
  tx('u2', d(2026, 11, 3), 19.5, { accountId: 'c1', currency: 'USD' }),
  tx('antes', d(2026, 10, 9, 23, 0), 999, { accountId: 'c1' }),
];
// Del período 27-oct..26-nov: el gasto de la cuenta, un traslado (no cuenta) y un pago de tarjeta emparejado (no cuenta).
const periodTxs: Transaction[] = [
  tx('g1', d(2026, 11, 5), 500, { accountId: 'b1' }),
  tx('tr', d(2026, 11, 6), 1000, { type: 'transfer', accountId: 'b1' }),
  tx('par', d(2026, 11, 7), 700, { accountId: 'b1', transferPairId: 'p1' }),
];

const NOW = d(2026, 11, 12, 10);

function dataOf(over: Partial<WidgetSnapshotData> = {}): WidgetSnapshotData {
  return {
    settings,
    transactions: [...cardTxs, ...periodTxs],
    fixedExpenses: [luz],
    accounts: [visa, monibyte, efectivo, inactiva],
    creditInstallments: [],
    incomeSources: [],
    daysLeft: daysUntilNextPay(settings, NOW, null),
    periodAt: (x: Date) => computeFinancialPeriod(settings, x, null),
    ...over,
  };
}

// ── Disponible y días ──
{
  const s = buildWidgetSnapshot(dataOf(), NOW);
  const spent = 500 + 275.51; // el traslado y el pago emparejado nunca suman al gasto
  check('versión 1, moneda Q', s.v === 1 && s.currency === 'Q');
  check('días al cobro: 27-nov menos 12-nov = 15', s.daysToPay === 15, String(s.daysToPay));
  check('disponible = presupuesto − gastado (sin traslados)', near(s.availablePeriod, 6000 - spent), String(s.availablePeriod));
  check('disponible por día = disponible / días', near(s.availablePerDay, (6000 - spent) / 15), String(s.availablePerDay));
  check('porcentaje del presupuesto', s.hasBudget && s.budgetPct === Math.round((spent / 6000) * 100), String(s.budgetPct));
  check('updatedAt = now', s.updatedAt === NOW.toISOString());
}

// ── Sin presupuesto: usa el ingreso declarado ──
{
  const s = buildWidgetSnapshot(dataOf({ settings: { ...settings, budgetLimit: 0 } as UserSettings }), NOW);
  check('sin presupuesto: hasBudget false y pct 0', !s.hasBudget && s.budgetPct === 0);
  check('sin presupuesto: disponible = ingreso declarado − gastado', near(s.availablePeriod, 8000 - 775.51), String(s.availablePeriod));
}

// ── Próxima tarjeta: estimado y real ──
{
  const s = buildWidgetSnapshot(dataOf(), NOW);
  const c = s.nextCard;
  check('próxima tarjeta: BAC Visa vence el 2 de diciembre', !!c && c.name === 'BAC Visa' && c.due === '2026-12-02', JSON.stringify(c));
  check('próxima tarjeta: Q 9,276.01 y US$ 39.67', !!c && c.Q === 9276.01 && c.USD === 39.67, JSON.stringify(c));
  check('próxima tarjeta: sin monto real es «estimado»', !!c && c.estimated === true);

  const real = [{ cutKey: '2026-11-09', Q: 9276.01, USD: 39.67, at: NOW.toISOString() }];
  const s2 = buildWidgetSnapshot(dataOf({ accounts: [{ ...visa, statementOverrides: real }, monibyte] }), NOW);
  check('próxima tarjeta: con el estado de cuenta real ya no es estimado', !!s2.nextCard && s2.nextCard.estimated === false, JSON.stringify(s2.nextCard));

  check('widgetShortDate dd/mm', widgetShortDate('2026-12-02') === '02/12' && widgetShortDate('basura') === '');
}

// ── Próximo gasto fijo y semáforo ──
{
  const s = buildWidgetSnapshot(dataOf(), NOW);
  check('próximo fijo: Luz el 22/11 por Q300', !!s.nextFixed && s.nextFixed.name === 'Luz' && s.nextFixed.due === '2026-11-22'
    && s.nextFixed.amount === 300 && s.nextFixed.currency === 'Q', JSON.stringify(s.nextFixed));
  check('semáforo: Q4,000 de saldo no alcanza para Q9,276 + US$39.67 = rojo', s.capacity === 'red', String(s.capacity));
  const paid = buildWidgetSnapshot(dataOf({ fixedExpenses: [{ ...luz, isPaid: true, paidCycleKey: '2026-10-27' }] }), NOW);
  check('fijo ya pagado en el período no es el próximo del período actual', !paid.nextFixed || paid.nextFixed.due !== '2026-11-22', JSON.stringify(paid.nextFixed));
}

// ── Saldos: solo cuentas activas con seguimiento ──
{
  const s = buildWidgetSnapshot(dataOf(), NOW);
  check('saldos: solo Monibyte (sin tarjeta, sin saldo apagado, sin inactivas)',
    !!s.balances && s.balances.length === 1 && s.balances[0].name === 'Monibyte' && s.balances[0].amount === 4000, JSON.stringify(s.balances));
  const none = buildWidgetSnapshot(dataOf({ accounts: [visa, efectivo] }), NOW);
  check('sin cuentas con seguimiento: no hay saldos', none.balances === undefined);
}

// ── Privacidad: todos los montos fuera ──
{
  const s = buildWidgetSnapshot(dataOf(), NOW);
  const m = maskForPrivacy(s);
  const json = JSON.stringify(m);
  check('mask: marcado como enmascarado', m.masked === true && s.masked === undefined);
  check('mask: disponible y por día en cero', m.availablePeriod === 0 && m.availablePerDay === 0);
  check('mask: tarjeta sin montos', !!m.nextCard && m.nextCard.Q === 0 && m.nextCard.USD === 0);
  check('mask: fijo sin monto', !!m.nextFixed && m.nextFixed.amount === 0);
  check('mask: saldos sin montos', !!m.balances && m.balances.every(b => b.amount === 0));
  check('mask: ningún monto original sobrevive en el JSON',
    !json.includes('9276.01') && !json.includes('39.67') && !json.includes('4000') && !json.includes(String(s.availablePeriod))
    && !json.includes(String(s.availablePerDay)) && !json.includes('300,') && !/"amount":300/.test(json), json);
  check('mask: días, porcentaje, fechas, nombres y semáforo se conservan',
    m.daysToPay === s.daysToPay && m.budgetPct === s.budgetPct && m.nextCard?.due === '2026-12-02'
    && m.nextCard?.name === 'BAC Visa' && m.nextFixed?.name === 'Luz' && m.capacity === s.capacity);
  check('mask: no muta la foto original', s.availablePeriod !== 0 && s.nextCard?.Q === 9276.01 && s.balances?.[0].amount === 4000);
}

// ── Sin tarjetas, fuentes ni gastos: no revienta ──
{
  const empty = buildWidgetSnapshot(dataOf({ transactions: [], fixedExpenses: [], accounts: [], creditInstallments: [], incomeSources: [] }), NOW);
  check('vacío: sin tarjeta, fijo, semáforo ni saldos',
    empty.nextCard === undefined && empty.nextFixed === undefined && empty.capacity === undefined && empty.balances === undefined);
  check('vacío: disponible = presupuesto', empty.availablePeriod === 6000 && empty.budgetPct === 0);
  const m = maskForPrivacy(empty);
  check('vacío: enmascarar tampoco revienta', m.masked === true && m.nextCard === undefined && m.balances === undefined);
  const noDays = buildWidgetSnapshot(dataOf({ daysLeft: 0 }), NOW);
  check('0 días: por día = disponible entero', near(noDays.availablePerDay, noDays.availablePeriod));
  const irr = buildWidgetSnapshot(dataOf({ settings: { ...settings, paymentCycle: 'irregular' } as UserSettings, daysLeft: 0 }), NOW);
  check('ciclo irregular no revienta', irr.daysToPay === 0);
}

// ── Lectura segura ──
check('sanitize: basura -> null', sanitizeWidgetSnapshot(null) === null && sanitizeWidgetSnapshot({ v: 2 }) === null && sanitizeWidgetSnapshot('x') === null);

// ── Persistencia (AsyncStorage en memoria) ──
async function persistence(): Promise<void> {
  resetMemoryStorage();
  check('privacidad: por defecto OCULTOS', (await StorageService.getWidgetPrivacy()) === 'hidden');
  await StorageService.saveWidgetPrivacy('shown');
  check('privacidad: guarda «shown»', (await StorageService.getWidgetPrivacy()) === 'shown');
  await StorageService.saveWidgetPrivacy('hidden');
  check('privacidad: vuelve a «hidden»', (await StorageService.getWidgetPrivacy()) === 'hidden');

  check('snapshot: nulo si nunca se guardó', (await StorageService.getWidgetSnapshot()) === null);
  const s = buildWidgetSnapshot(dataOf(), NOW);
  await StorageService.saveWidgetSnapshot(s);
  const back = await StorageService.getWidgetSnapshot();
  check('snapshot: ida y vuelta', !!back && back.availablePeriod === s.availablePeriod && back.nextCard?.Q === 9276.01);
  await StorageService.clearAllData();
  check('borrar todo también limpia el widget', (await StorageService.getWidgetSnapshot()) === null
    && (await StorageService.getWidgetPrivacy()) === 'hidden');
}

persistence()
  .catch(e => { failures++; console.log('FALLA  persistencia →', e); })
  .then(() => {
    console.log(`\n${checks} comprobaciones, ${failures} fallos`);
    if (failures > 0) process.exit(1);
  });
