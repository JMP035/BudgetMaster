// Corpus de frases etiquetadas del asistente (intención + slots esperados) y el contexto de prueba con el
// que se corren. Lo consume scripts/assistant-nlu.test.ts. Fecha fija: jueves 12 nov 2026, período
// mensual con día de pago 27 (27 oct – 26 nov). Las frases mezclan con/sin tildes, MAYÚSCULAS, erratas,
// voseo, modismos guatemaltecos y orden invertido. `core: true` = debe acertar el 100 %.
import type { AssistantContext, IntentId } from '../services/assistant/types';
import type { UtteranceState } from '../services/assistant/Nlu';
import type { Account, CategoryBudget, FixedExpense, SavingsGoal, Transaction } from '../services/storage';

export const NOW = new Date(2026, 10, 12, 10, 0);
const iso = (y: number, m: number, d: number, h = 12): string => new Date(y, m - 1, d, h, 0).toISOString();

const PERIOD = {
  start: new Date(2026, 9, 27, 0, 0, 0, 0),
  end: new Date(2026, 10, 26, 23, 59, 59, 999),
  prevStart: new Date(2026, 8, 27, 0, 0, 0, 0),
  prevEnd: new Date(2026, 9, 26, 23, 59, 59, 999),
  label: '27 oct – 26 nov',
};

function tx(id: string, amount: number, description: string, category: string, date: string, extra: Partial<Transaction> = {}): Transaction {
  return { id, amount, description, category, date, type: 'expense', source: 'manual', currency: 'Q', ...extra };
}

export const CORPUS_TXS: Transaction[] = [
  tx('s_usd', 15.99, 'Spotify', 'streaming', iso(2026, 11, 5), { currency: 'USD' }),
  tx('s_q', 39, 'SPOTIFY', 'streaming', iso(2026, 11, 6), { source: 'sms', merchant: 'SPOTIFY' }),
  tx('shell1', 85, 'SHELL ZONA 10', 'fuel', iso(2026, 11, 11), { source: 'sms', merchant: 'SHELL', accountId: 'acc1' }),
  tx('pollo1', 120, 'Pollo Campero', 'restaurant', iso(2026, 11, 8)),
  tx('cena1', 200, 'Cena familiar', 'restaurant', iso(2026, 11, 9)),
  tx('pet1', 75, 'Croquetas', 'custom_pets', iso(2026, 11, 7)),
  tx('sal1', 6000, 'Sueldo', 'salary', iso(2026, 10, 27), { type: 'income' }),
  tx('tr1', 300, 'Entre cuentas', 'transfer', iso(2026, 11, 2), { type: 'transfer' }),
];

export const CORPUS_ACCOUNTS: Account[] = [
  { id: 'acc1', name: 'BAC Tarjeta', type: 'credit', currency: 'Q', balance: 0, initialBalance: 0, color: '#fff', icon: 'card-outline', bankName: 'BAC', isActive: true, createdAt: iso(2026, 1, 1) },
  { id: 'acc2', name: 'Banrural', type: 'bank', currency: 'Q', balance: 1000, initialBalance: 1000, color: '#fff', icon: 'business-outline', bankName: 'Banrural', isActive: true, createdAt: iso(2026, 1, 1) },
];

const FIXEDS: FixedExpense[] = [
  { id: 'fe_netflix', name: 'Netflix', amount: 15.99, currency: 'USD', category: 'streaming', dayOfMonth: 5, isPaid: true, paidCycleKey: '2026-10-27', autoRecord: true, isActive: true },
  { id: 'fe_luz', name: 'Luz', amount: 350, currency: 'Q', category: 'utilities', dayOfMonth: 8, isPaid: false, autoRecord: true, isActive: true },
];
const BUDGETS: CategoryBudget[] = [{ categoryId: 'restaurant', limit: 800, currency: 'Q', alertAt: 70 }];
const GOALS: SavingsGoal[] = [
  { id: 'sg_laptop', name: 'Laptop', targetAmount: 5000, currency: 'Q', currentAmount: 1000, deadline: new Date(2027, 2, 15, 12).toISOString(), icon: 'star-outline', color: '#fff', isCompleted: false, createdAt: iso(2026, 5, 1) },
];

export function buildCorpusContext(over: Partial<AssistantContext> = {}): AssistantContext {
  return {
    now: NOW,
    period: PERIOD,
    settings: {
      currency: 'Q',
      customCategories: [{ id: 'custom_pets', label: 'Mascotas', icon: 'paw-outline', color: '#E8453C', type: 'expense' }],
      paymentCycle: 'monthly', paymentDay: 27, paymentDays: [], exchangeRate: 7.8, smsEnabled: true,
    },
    transactions: CORPUS_TXS, accounts: CORPUS_ACCOUNTS, fixedExpenses: FIXEDS, categoryBudgets: BUDGETS, savingsGoals: GOALS,
    merchantRules: [], smsOn: true,
    ...over,
  };
}

// ─────────────────────────────────────────────────────────────
// Corpus
// ─────────────────────────────────────────────────────────────

export type ExpectedSlot = string | number | { start: string; end: string };

export interface CorpusEntry {
  text: string;
  intent: IntentId;
  slots?: Record<string, ExpectedSlot>;
  /** Se espera una ambigüedad de ese slot con esos valores (en cualquier orden). */
  amb?: { slot: string; values: string[] };
  core?: boolean;
  state?: UtteranceState;
}

const PERIOD_R = { start: '2026-10-27', end: '2026-11-26' };
const PREV_R = { start: '2026-09-27', end: '2026-10-26' };
const MONTH_R = { start: '2026-11-01', end: '2026-11-12' };
const OCT_R = { start: '2026-10-01', end: '2026-10-31' };
const day = (d: string) => ({ start: d, end: d });

type S = Record<string, ExpectedSlot>;
const SPEND: IntentId = 'query.spending_total';
const LIST: IntentId = 'query.list_movements';
const FIXPEND: IntentId = 'query.fixed_pending';
const BUDST: IntentId = 'query.budget_status';
const GOALST: IntentId = 'query.goals_status';
const GOAL: IntentId = 'create.create_goal';
const BUDGET: IntentId = 'create.set_category_budget';
const FIXED: IntentId = 'create.create_fixed_expense';
const TXI: IntentId = 'create.create_transaction';

function e(text: string, intent: IntentId, slots?: S, extra: Partial<CorpusEntry> = {}): CorpusEntry {
  return { text, intent, ...(slots ? { slots } : {}), ...extra };
}
const core = { core: true } as const;

export const CORPUS: CorpusEntry[] = [
  // ── query.spending_total ──
  e('¿Cuánto gasté en Restaurantes este período?', SPEND, { category: 'restaurant', range: PERIOD_R }, core),
  e('cuanto gaste en comida', SPEND, { category: 'food' }, core),
  e('CUANTO GASTE EN GASOLINA ESTE MES', SPEND, { category: 'fuel', range: MONTH_R }),
  e('cuánto he gastado en super', SPEND, { category: 'groceries' }),
  e('cuanto llevo gastado en comida', SPEND, { category: 'food' }),
  e('¿Cuánto gasté ayer?', SPEND, { range: day('2026-11-11') }, core),
  e('cuanto gaste hoy', SPEND, { range: day('2026-11-12') }),
  e('cuanto gaste la semana pasada', SPEND, { range: { start: '2026-11-02', end: '2026-11-08' } }),
  e('cuanto gaste este mes', SPEND, { range: MONTH_R }),
  e('cuanto gaste el mes pasado', SPEND, { range: OCT_R }),
  e('cuanto he gastado en spotify', SPEND, { merchant: 'Spotify' }),
  e('cuanto gaste en netflix este periodo', SPEND, { category: 'streaming', range: PERIOD_R }),
  e('cuánto gasté en Mascotas', SPEND, { category: 'custom_pets' }),
  e('cuanto gaste en el periodo anterior', SPEND, { range: PREV_R }),
  e('cuanto gaste en shell', SPEND, { merchant: 'SHELL' }),
  e('total de gastos este periodo', SPEND, { range: PERIOD_R }),
  e('total gastado en restaurantes', SPEND, { category: 'restaurant' }),
  e('cuanto me entro este mes', SPEND, { tx_type: 'income', range: MONTH_R }),
  e('cuanto he ganado este mes', SPEND, { tx_type: 'income', range: MONTH_R }),
  e('cuanto ingrese en octubre', SPEND, { tx_type: 'income', range: OCT_R }),
  e('cuanto gaste en gasolna', SPEND, { category: 'fuel' }),
  e('kuanto gaste en comida', SPEND, { category: 'food' }),
  e('cuánto gasté con la tarjeta', SPEND, { account: 'acc1' }),
  e('cuanto gaste en restaurantes con la tarjeta bac', SPEND, { category: 'restaurant', account: 'acc1' }),
  e('cuanto he gastado en farmacia los ultimos 30 dias', SPEND, { category: 'pharmacy', range: { start: '2026-10-14', end: '2026-11-12' } }),
  e('cuanto llevo gastado este año', SPEND, { range: { start: '2026-01-01', end: '2026-11-12' } }),
  e('cuanto se me fue en comida', SPEND, { category: 'food' }),
  e('cuanto me vole en comida la semana pasada', SPEND, { category: 'food', range: { start: '2026-11-02', end: '2026-11-08' } }),
  e('cuanto gaste en total este periodo', SPEND, { range: PERIOD_R }),
  e('cuanto he gastado en ropa', SPEND, { category: 'clothes' }),
  e('cuanto gaste en salud el mes pasado', SPEND, { category: 'health', range: OCT_R }),
  e('Cuanto pague de luz este periodo', SPEND, { category: 'utilities', range: PERIOD_R }),
  e('cuanto gaste en uber', SPEND, { category: 'transport' }),
  e('cuanto gaste en gas', SPEND, undefined, { amb: { slot: 'category', values: ['fuel', 'utilities'] } }),
  e('cuanto gaste con mi cuenta bac', SPEND, { account: 'acc1' }),
  e('cuanto he gastado en restaurantes en octubre', SPEND, { category: 'restaurant', range: OCT_R }),
  e('cuanto gaste del 5 al 10 de noviembre', SPEND, { range: { start: '2026-11-05', end: '2026-11-10' } }),

  // ── query.list_movements ──
  e('Muéstrame los movimientos de Spotify', LIST, { merchant: 'Spotify' }, core),
  e('muestrame mis gastos de ayer', LIST, { range: day('2026-11-11') }),
  e('ver movimientos de este mes', LIST, { range: MONTH_R }),
  e('lista mis compras de la semana pasada', LIST, { range: { start: '2026-11-02', end: '2026-11-08' } }),
  e('mostrame los movimientos', LIST, undefined, core),
  e('movimientos de shell', LIST, { merchant: 'SHELL' }),
  e('ultimos movimientos', LIST),
  e('muéstrame los gastos en restaurantes', LIST, { category: 'restaurant' }),
  e('dame mis movimientos de hoy', LIST, { range: day('2026-11-12') }),
  e('ver movimientos del periodo anterior', LIST, { range: PREV_R }),
  e('listame los ingresos de este mes', LIST, { tx_type: 'income', range: MONTH_R }),
  e('enséñame los movimientos de pollo campero', LIST, { merchant: 'Pollo Campero' }),
  e('que gaste ayer', LIST, { range: day('2026-11-11') }),
  e('en que gaste esta semana', LIST, { range: { start: '2026-11-09', end: '2026-11-12' } }),
  e('historial de gastos', LIST),
  e('MUESTRAME LOS MOVIMIENTOS DE LA TARJETA', LIST, { account: 'acc1' }),
  e('ver gastos de comida', LIST, { category: 'food' }),
  e('muestrame los movimientos de spotfy', LIST, { merchant: 'Spotify' }),
  e('mostrame los movimientos de los ultimos 7 dias', LIST, { range: { start: '2026-11-06', end: '2026-11-12' } }),
  e('ver mis gastos de mascotas', LIST, { category: 'custom_pets' }),
  e('detalle de gastos de este periodo', LIST, { range: PERIOD_R }),

  // ── query.fixed_pending ──
  e('¿Qué gastos fijos me faltan por pagar?', FIXPEND, undefined, core),
  e('que gastos fijos faltan', FIXPEND),
  e('que pagos tengo pendientes', FIXPEND),
  e('gastos fijos pendientes', FIXPEND),
  e('que me falta pagar', FIXPEND),
  e('mis gastos fijos', FIXPEND),
  e('cuales son mis gastos fijos pendientes', FIXPEND),
  e('que tengo que pagar este mes', FIXPEND),
  e('pagos pendientes', FIXPEND),
  e('QUE GASTOS FIJOS ME FALTAN', FIXPEND),
  e('que gastos fijos no he pagado', FIXPEND),
  e('cuanto me falta por pagar de gastos fijos', FIXPEND),
  e('gastos fijos vencidos', FIXPEND),
  e('que pagos faltan', FIXPEND),
  e('que gastos fijos me faltan por pagar este periodo', FIXPEND),
  e('gastos fijos por pagar', FIXPEND),
  e('qué gastos fijos me faltan', FIXPEND),

  // ── query.budget_status ──
  e('¿Cómo van mis presupuestos?', BUDST, undefined, core),
  e('como van mis presupuestos', BUDST),
  e('estado de mis presupuestos', BUDST),
  e('estado del presupuesto de restaurantes', BUDST, { category: 'restaurant' }),
  e('como voy con el presupuesto de combustible', BUDST, { category: 'fuel' }),
  e('cuanto me queda en restaurantes', BUDST, { category: 'restaurant' }),
  e('cuanto me queda de presupuesto en gasolina', BUDST, { category: 'fuel' }),
  e('me pase del presupuesto', BUDST),
  e('revisa mis presupuestos', BUDST),
  e('como voy con el limite de restaurantes', BUDST, { category: 'restaurant' }),
  e('muestrame mis presupuestos', BUDST),
  e('como esta mi presupuesto de comida', BUDST, { category: 'food' }),

  // ── query.goals_status ──
  e('¿Cómo van mis metas?', GOALST, undefined, core),
  e('como va mi meta', GOALST),
  e('mis metas', GOALST),
  e('estado de mis metas', GOALST),
  e('cuanto llevo ahorrado', GOALST),
  e('cuanto he ahorrado', GOALST),
  e('ver mis metas', GOALST),
  e('progreso de mi meta de laptop', GOALST),
  e('muestrame mis metas', GOALST),
  e('como van las metas', GOALST),

  // ── create.create_goal ──
  e('Crea una meta de Q5,000 para una laptop en diciembre', GOAL, { name: 'Laptop', amount: 5000, deadline: '2026-12-31' }, core),
  e('Quiero ahorrar Q15,000 para diciembre', GOAL, { amount: 15000, deadline: '2026-12-31' }, core),
  e('Creame una meta para una laptop de 5k para fin de año', GOAL, { name: 'Laptop', amount: 5000, deadline: '2026-12-31' }, core),
  e('crea una meta', GOAL, undefined, core),
  e('quiero ahorrar para un viaje a Antigua', GOAL, { name: 'Viaje a Antigua' }),
  e('meta de ahorro de Q20,000 para mi boda en 6 meses', GOAL, { name: 'Boda', amount: 20000, deadline: '2027-05-12' }),
  e('haceme una meta de 3 mil para una moto', GOAL, { name: 'Moto', amount: 3000 }),
  e('CREA UNA META DE Q10,000 PARA UN CARRO EN UN AÑO', GOAL, { name: 'Carro', amount: 10000, deadline: '2027-11-12' }),
  e('necesito ahorrar 8000 para vacaciones en 4 meses', GOAL, { name: 'Vacaciones', amount: 8000, deadline: '2027-03-12' }),
  e('quiero juntar Q2,500 para navidad', GOAL, { amount: 2500, deadline: '2026-12-25' }),
  e('creame una meta para el seguro del carro', GOAL, { name: 'Seguro del carro' }),
  e('nueva meta de ahorro para una laptop', GOAL, { name: 'Laptop' }),
  e('quiero ahorrar 5 mil para mi compu', GOAL, { name: 'Compu', amount: 5000 }),
  e('crea meta de ahorro Q30,000 para un enganche', GOAL, { name: 'Enganche', amount: 30000 }),
  e('quiero ahorrar $500 para el viaje', GOAL, { amount: 500, currency: 'USD', name: 'Viaje' }),
  e('crea una meta de 300 dolares para un celular para marzo', GOAL, { name: 'Celular', amount: 300, currency: 'USD', deadline: '2027-03-31' }),
  e('creame una meta de ahorro de Q12,000 para el 15 de marzo', GOAL, { amount: 12000, deadline: '2027-03-15' }),
  e('quiero ahorrar para una moto', GOAL, { name: 'Moto' }),
  e('me gustaria ahorrar 6000 para un viaje', GOAL, { name: 'Viaje', amount: 6000 }),
  e('crea una meta llamada Fondo de emergencia de Q10,000', GOAL, { name: 'Fondo de emergencia', amount: 10000 }),
  e('quiero ahorrar 20 mil para mi casa en dos años', GOAL, { name: 'Casa', amount: 20000, deadline: '2028-11-12' }),
  e('creame una meta para comprar una laptop de Q6,500 el 30 de noviembre', GOAL, { name: 'Comprar una laptop', amount: 6500, deadline: '2026-11-30' }),
  e('cree una meta de ahorro de 2000 para los regalos', GOAL, { name: 'Regalos', amount: 2000 }),
  e('ahorrar para mi cumpleaños', GOAL, { name: 'Cumpleaños' }),
  e('Meta: laptop Q5000 para diciembre', GOAL, { name: 'Laptop', amount: 5000, deadline: '2026-12-31' }),
  e('quiero ahorar 5000 para una laptop', GOAL, { name: 'Laptop', amount: 5000 }),
  e('crea una meta de quinientos quetzales para una bici', GOAL, { name: 'Bici', amount: 500 }),
  e('quiero juntar mil quinientos para unos zapatos en 3 meses', GOAL, { name: 'Zapatos', amount: 1500, deadline: '2027-02-12' }),
  e('meta de Q8,000 para mi viaje a Europa en un año', GOAL, { name: 'Viaje a Europa', amount: 8000, deadline: '2027-11-12' }),
  e('pon una meta de Q1,000 para el seguro', GOAL, { name: 'Seguro', amount: 1000 }),
  e('hazme una meta para ahorrar Q7,000 para un viaje', GOAL, { name: 'Viaje', amount: 7000 }),
  e('crea una meta para ahorrar', GOAL),
  e('quiero ahorrar Q500 al mes para una laptop', GOAL, { name: 'Laptop', amount: 500 }),
  e('Crea una meta de Q3,000 para Mascotas en diciembre', GOAL, { name: 'Mascotas', amount: 3000, deadline: '2026-12-31' }),

  // ── create.set_category_budget ──
  e('Ponle un límite de Q800 a Restaurantes', BUDGET, { category: 'restaurant', amount: 800 }, core),
  e('pon un presupuesto de Q1,500 para supermercado', BUDGET, { category: 'groceries', amount: 1500 }),
  e('limite de 500 en gasolina', BUDGET, { category: 'fuel', amount: 500 }),
  e('quiero un presupuesto de 600 para comida', BUDGET, { category: 'food', amount: 600 }),
  e('no quiero gastar mas de 300 en cine', BUDGET, { category: 'entertainment', amount: 300 }),
  e('ponme un tope de Q400 en ropa', BUDGET, { category: 'clothes', amount: 400 }),
  e('fija un maximo de 1000 para salud', BUDGET, { category: 'health', amount: 1000 }),
  e('LIMITE DE Q2,000 EN RESTAURANTES', BUDGET, { category: 'restaurant', amount: 2000 }),
  e('crea un presupuesto de 750 para farmacia', BUDGET, { category: 'pharmacy', amount: 750 }),
  e('establece un limite mensual de Q300 para streaming', BUDGET, { category: 'streaming', amount: 300 }),
  e('ponle un tope de 200 a uber', BUDGET, { category: 'transport', amount: 200 }),
  e('presupuesto de 1,200 para la comida', BUDGET, { category: 'food', amount: 1200 }),
  e('limita las compras a Q900', BUDGET, { category: 'shopping', amount: 900 }),
  e('quiero limitar mis gastos en restaurantes a 500', BUDGET, { category: 'restaurant', amount: 500 }),
  e('ponle limite de 3 mil al super', BUDGET, { category: 'groceries', amount: 3000 }),
  e('no gastar mas de 1500 en mascotas', BUDGET, { category: 'custom_pets', amount: 1500 }),
  e('presupuesto para educacion de Q2,500', BUDGET, { category: 'education', amount: 2500 }),
  e('ponle un limite de $100 a streaming', BUDGET, { category: 'streaming', amount: 100, currency: 'USD' }),
  e('agrega un limite de 450 para el cine', BUDGET, { category: 'entertainment', amount: 450 }),
  e('ponle un presupuesto de quinientos a la gasolina', BUDGET, { category: 'fuel', amount: 500 }),
  e('creame un presupuesto de Q1,000 para viajes', BUDGET, { category: 'travel', amount: 1000 }),
  e('tope de gasto de 650 en internet', BUDGET, { category: 'internet', amount: 650 }),
  e('ponele un limite de Q350 a farmacia', BUDGET, { category: 'pharmacy', amount: 350 }),
  e('limite de Q800 para restaurantes', BUDGET, { category: 'restaurant', amount: 800 }),
  e('ajusta el limite de comida a 900', BUDGET, { category: 'food', amount: 900 }),
  e('presupuesto de Q500 para gas', BUDGET, { amount: 500 }, { amb: { slot: 'category', values: ['fuel', 'utilities'] } }),
  e('limite de 1k para ropa', BUDGET, { category: 'clothes', amount: 1000 }),

  // ── create.create_fixed_expense ──
  e('Agrega Netflix de $15.99 el 5 de cada mes', FIXED, { name: 'Netflix', amount: 15.99, currency: 'USD', day: 5 }, core),
  e('agrega un gasto fijo de luz de Q350 el 8', FIXED, { name: 'Luz', amount: 350, day: 8 }, core),
  e('crea un gasto fijo: internet Q300 el 10 de cada mes', FIXED, { name: 'Internet', amount: 300, day: 10 }),
  e('pago fijo de renta Q2,500 el 1 de cada mes', FIXED, { name: 'Renta', amount: 2500, day: 1 }),
  e('agrega Spotify de Q39 cada mes', FIXED, { name: 'Spotify', amount: 39 }),
  e('todos los meses pago 200 de gimnasio el 15', FIXED, { name: 'Gimnasio', amount: 200, day: 15 }),
  e('agrega el seguro del carro Q450 todos los meses el 20', FIXED, { name: 'Seguro del carro', amount: 450, day: 20 }),
  e('nuevo gasto fijo Netflix $15.99 dia 5', FIXED, { name: 'Netflix', amount: 15.99, currency: 'USD', day: 5 }),
  e('agrega gasto fijo de agua Q120 el 12', FIXED, { name: 'Agua', amount: 120, day: 12 }),
  e('mensualmente pago Q500 de colegio el 5', FIXED, { name: 'Colegio', amount: 500, day: 5 }),
  e('gasto fijo de tigo Q150 cada 15', FIXED, { name: 'Tigo', amount: 150, day: 15 }),
  e('AGREGA NETFLIX DE $15.99 EL 5 DE CADA MES', FIXED, { name: 'Netflix', amount: 15.99, currency: 'USD', day: 5 }),
  e('pon un gasto fijo de renta de Q600 el 1', FIXED, { name: 'Renta', amount: 600, day: 1 }),
  e('crea un gasto fijo llamado Gym de 200 el 25', FIXED, { name: 'Gym', amount: 200, day: 25 }),
  e('agrega un pago recurrente de Amazon Prime de $14.99 el 3', FIXED, { name: 'Amazon Prime', amount: 14.99, currency: 'USD', day: 3 }),
  e('agrega mi pago de luz de Q400 el 10 de cada mes', FIXED, { name: 'Luz', amount: 400, day: 10 }),
  e('gasto fijo Netflix Q120 el 5', FIXED, { name: 'Netflix', amount: 120, day: 5 }),
  e('agrega Claro de Q199 el 28 de cada mes', FIXED, { name: 'Claro', amount: 199, day: 28 }),
  e('agrega la cuota del carro de Q2,200 cada mes el 5', FIXED, { name: 'Cuota del carro', amount: 2200, day: 5 }),
  e('agrega internet de Q300 el 10 de cada mes', FIXED, { name: 'Internet', amount: 300, day: 10 }),
  e('agrega Netflix de 15.99 dolares el 5 de cada mes', FIXED, { name: 'Netflix', amount: 15.99, currency: 'USD', day: 5 }),
  e('agrega un gasto fijo de gas de Q150 el 10', FIXED, { name: 'Gas', amount: 150, day: 10 }, { amb: { slot: 'category', values: ['fuel', 'utilities'] } }),
  e('gasto fijo: Hulu $7.99 cada mes el 12', FIXED, { name: 'Hulu', amount: 7.99, currency: 'USD', day: 12 }),
  e('agrega la renta de Q3,000 el 1 de cada mes', FIXED, { name: 'Renta', amount: 3000, day: 1 }),
  e('agrega Disney de Q89 mensual el 7', FIXED, { name: 'Disney', amount: 89, day: 7 }),

  // ── create.create_transaction ──
  e('Gasté 85 en gasolina ayer', TXI, { tx_type: 'expense', amount: 85, category: 'fuel', date: '2026-11-11' }, core),
  e('Me pagaron Q6,000 de sueldo', TXI, { tx_type: 'income', amount: 6000, category: 'salary' }, core),
  e('Me cayó el sueldo, 6 mil', TXI, { tx_type: 'income', amount: 6000, category: 'salary' }, core),
  e('gasté 50 en Pollo Campero', TXI, { tx_type: 'expense', amount: 50, category: 'food', description: 'Pollo Campero' }),
  e('pague 350 de luz el 8 de noviembre', TXI, { tx_type: 'expense', amount: 350, category: 'utilities', date: '2026-11-08' }),
  e('compre una pizza por 120', TXI, { tx_type: 'expense', amount: 120, category: 'restaurant' }),
  e('GASTE 200 EN SUPER', TXI, { tx_type: 'expense', amount: 200, category: 'groceries' }),
  e('gaste q45 en un uber anteayer', TXI, { tx_type: 'expense', amount: 45, category: 'transport', date: '2026-11-10' }),
  e('me depositaron 2500 de un freelance', TXI, { tx_type: 'income', amount: 2500, category: 'freelance' }),
  e('recibí 500 de aguinaldo', TXI, { tx_type: 'income', amount: 500, category: 'bonus' }),
  e('me cobraron Q25 de comision', TXI, { tx_type: 'expense', amount: 25, category: 'bank_fees' }),
  e('registra un gasto de Q150 en farmacia', TXI, { tx_type: 'expense', amount: 150, category: 'pharmacy' }),
  e('anota un ingreso de 1,200 de una chamba', TXI, { tx_type: 'income', amount: 1200, category: 'freelance' }),
  e('gaste 30 en shucos ayer', TXI, { tx_type: 'expense', amount: 30, category: 'food', date: '2026-11-11' }),
  e('pague la renta Q2,500', TXI, { tx_type: 'expense', amount: 2500, category: 'rent' }),
  e('gaste $20 en amazon', TXI, { tx_type: 'expense', amount: 20, currency: 'USD', category: 'shopping' }),
  e('gaste 12 dolares en netflix', TXI, { tx_type: 'expense', amount: 12, currency: 'USD', category: 'streaming' }),
  e('pague 90 de internet con la tarjeta', TXI, { tx_type: 'expense', amount: 90, category: 'internet', account: 'acc1' }),
  e('compre ropa por 300 el viernes', TXI, { tx_type: 'expense', amount: 300, category: 'clothes', date: '2026-11-06' }),
  e('me entro un pago de 800 por una chamba', TXI, { tx_type: 'income', amount: 800, category: 'freelance' }),
  e('me pagaron 1500 de freelance', TXI, { tx_type: 'income', amount: 1500, category: 'freelance' }),
  e('gaste 75 en mascotas', TXI, { tx_type: 'expense', amount: 75, category: 'custom_pets' }),
  e('gaste 60 en almuerzo hoy', TXI, { tx_type: 'expense', amount: 60, category: 'food', date: '2026-11-12' }),
  e('pagué 15 de parqueo', TXI, { tx_type: 'expense', amount: 15, category: 'transport' }),
  e('gasté Q250 en el cine con la tarjeta', TXI, { tx_type: 'expense', amount: 250, category: 'entertainment', account: 'acc1' }),
  e('me depositaron el sueldo, Q6,000', TXI, { tx_type: 'income', amount: 6000, category: 'salary' }),
  e('gaste 100 en gasolina el lunes', TXI, { tx_type: 'expense', amount: 100, category: 'fuel', date: '2026-11-09' }),
  e('me pagaron 300 de un regalo', TXI, { tx_type: 'income', amount: 300, category: 'gift' }),
  e('pague 400 en el super ayer', TXI, { tx_type: 'expense', amount: 400, category: 'groceries', date: '2026-11-11' }),
  e('vendi una laptop en 3500', TXI, { tx_type: 'income', amount: 3500 }),
  e('gaste 25 en cafe', TXI, { tx_type: 'expense', amount: 25 }),
  e('compré medicinas por Q180', TXI, { tx_type: 'expense', amount: 180, category: 'pharmacy' }),
  e('pagué el colegio Q1,200', TXI, { tx_type: 'expense', amount: 1200, category: 'education' }),
  e('me cobraron 15 por retiro en cajero', TXI, { tx_type: 'expense', amount: 15, category: 'atm' }),
  e('gasté 20 en gas', TXI, { tx_type: 'expense', amount: 20 }, { amb: { slot: 'category', values: ['fuel', 'utilities'] } }),
  e('gaste 85 en gasolina', TXI, { tx_type: 'expense', amount: 85, category: 'fuel' }),
  e('anota un gasto de 40 en comida', TXI, { tx_type: 'expense', amount: 40, category: 'food' }),
  e('pague 150 de tigo', TXI, { tx_type: 'expense', amount: 150, category: 'internet' }),

  // ── variantes difíciles: orden invertido, voseo, telegráficas, erratas ──
  e('una laptop de 5k quiero ahorrar para diciembre', GOAL, { name: 'Laptop', amount: 5000, deadline: '2026-12-31' }),
  e('para diciembre quiero ahorrar Q15,000', GOAL, { amount: 15000, deadline: '2026-12-31' }),
  e('por favor creame una meta de 5k para un viaje', GOAL, { name: 'Viaje', amount: 5000 }),
  e('meta laptop 5000 diciembre', GOAL, { name: 'Laptop', amount: 5000, deadline: '2026-12-31' }),
  e('quiero ahorrar 5000 en 6 meses para un viaje', GOAL, { name: 'Viaje', amount: 5000, deadline: '2027-05-12' }),
  e('en restaurantes cuanto gaste este periodo', SPEND, { category: 'restaurant', range: PERIOD_R }),
  e('vos, cuanto he gastado en super', SPEND, { category: 'groceries' }),
  e('me podes decir cuanto gaste en comida', SPEND, { category: 'food' }),
  e('cuanto gasté en comida ayer?', SPEND, { category: 'food', range: day('2026-11-11') }),
  e('cuanto gastamos en restaurantes', SPEND, { category: 'restaurant' }),
  e('CUANTO LLEVO GASTADO ESTE PERIODO', SPEND, { range: PERIOD_R }),
  e('cuanto he gastado en pollo campero', SPEND, { merchant: 'Pollo Campero' }),
  e('muestrame los movimientos de la semana pasada', LIST, { range: { start: '2026-11-02', end: '2026-11-08' } }),
  e('ver movimientos en pollo campero', LIST, { merchant: 'Pollo Campero' }),
  e('cuales gastos fijos faltan', FIXPEND),
  e('cuanto me queda en comida este periodo', BUDST, { category: 'food' }),
  e('ayer gaste 85 en gasolina', TXI, { tx_type: 'expense', amount: 85, category: 'fuel', date: '2026-11-11' }),
  e('gasolina 85 gaste ayer', TXI, { tx_type: 'expense', amount: 85, category: 'fuel', date: '2026-11-11' }),
  e('6 mil me cayeron de sueldo', TXI, { tx_type: 'income', amount: 6000, category: 'salary' }),
  e('me pagaron 6 mil de sueldo hoy', TXI, { tx_type: 'income', amount: 6000, category: 'salary', date: '2026-11-12' }),
  e('gasté Q85 en gasolina el 5 de noviembre', TXI, { tx_type: 'expense', amount: 85, category: 'fuel', date: '2026-11-05' }),
  e('gaste cien quetzales en comida', TXI, { tx_type: 'expense', amount: 100, category: 'food' }),
  e('el sueldo me cayo, 6000', TXI, { tx_type: 'income', amount: 6000, category: 'salary' }),
  e('ponele tope de 500 a comida', BUDGET, { category: 'food', amount: 500 }),
  e('limite 500 comida', BUDGET, { category: 'food', amount: 500 }),
  e('q500 de limite para comida', BUDGET, { category: 'food', amount: 500 }),
  e('mi presupuesto para comida es de 800', BUDGET, { category: 'food', amount: 800 }),
  e('agregame un gasto fijo de netflix de 15.99 dolares el 5', FIXED, { name: 'Netflix', amount: 15.99, currency: 'USD', day: 5 }),
  e('que puedo comprar con 500', 'advice'),
  e('dame consejos', 'advice'),
  e('me alcanza para un viaje de 3000', 'advice'),
  e('quiero un resumen de mis gastos', 'advice'),

  // ── advice (consejo y charla: NO son acciones) ──
  e('¿Puedo comprar algo de Q500?', 'advice', undefined, core),
  e('Dame un plan para ahorrar Q15,000', 'advice', undefined, core),
  e('hola', 'advice', undefined, core),
  e('¿cuándo me pagan?', 'advice', undefined, core),
  e('me alcanza para una laptop de 5000', 'advice'),
  e('como voy este mes', 'advice'),
  e('dame un consejo para ahorrar 500 al mes', 'advice'),
  e('tengo deudas, que hago', 'advice'),
  e('cuanto debo ahorrar al mes', 'advice'),
  e('gracias', 'advice'),
  e('buenos dias', 'advice'),
  e('que me recomiendas', 'advice'),
  e('cuanto me queda este mes', 'advice'),
  e('como puedo ahorrar mas', 'advice'),
  e('cuanto debo de visacuota', 'advice'),
  e('resumen de mi mes', 'advice'),
  e('conviene pagar la tarjeta completa', 'advice'),
  e('deberia comprar una moto', 'advice'),
  e('puedo gastar 300 en una cena', 'advice'),
  e('analiza mis gastos', 'advice'),
  e('como van mis finanzas', 'advice'),
  e('¿me alcanza para unas vacaciones de Q8,000?', 'advice'),

  // ── meta ──
  e('cancela', 'meta.cancel', undefined, { state: { dialogue: true } }),
  e('olvidalo', 'meta.cancel', undefined, { state: { dialogue: true } }),
  e('mejor no', 'meta.cancel', undefined, { state: { pending: true } }),
  e('no', 'meta.cancel', undefined, { state: { dialogue: true } }),
  e('si', 'meta.confirm', undefined, { state: { pending: true } }),
  e('dale', 'meta.confirm', undefined, { state: { pending: true } }),
  e('simon', 'meta.confirm', undefined, { state: { pending: true } }),
  e('de una', 'meta.confirm', undefined, { state: { pending: true } }),
  e('no, eran 600', 'meta.correct', { amount: 600 }, { state: { pending: true } }),
  e('mejor 700', 'meta.correct', { amount: 700 }, { state: { pending: true } }),
  e('cambia el monto a 900', 'meta.correct', { amount: 900 }, { state: { pending: true } }),
  e('corrige la categoria a comida', 'meta.correct', { category: 'food' }, { state: { pending: true } }),
  e('ayuda', 'meta.help'),
  e('que puedes hacer', 'meta.help'),
  e('que sabes hacer', 'meta.help'),

  // ── unknown ──
  e('cual es la capital de francia', 'unknown'),
  e('asdfghjk', 'unknown'),
  e('me gusta el futbol', 'unknown'),
  e('que hora es', 'unknown'),
  e('cuentame un chiste', 'unknown'),
  e('el cielo es azul', 'unknown'),
  e('xyz', 'unknown'),
  e('quien gano el partido', 'unknown'),
  e('mi perro se llama fido', 'unknown'),
  e('jajaja', 'unknown'),
  e('12345', 'unknown'),
  e('necesito una pizza grande', 'unknown'),
];
