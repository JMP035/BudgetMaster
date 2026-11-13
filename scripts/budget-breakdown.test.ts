process.env.TZ = 'America/Guatemala';
// Pruebas del desglose del período por categoría y moneda (services/BudgetBreakdown.ts). Sin dependencias:
//   npm run test:budget-breakdown   →   sucrase-node scripts/budget-breakdown.test.ts

import {
  buildPeriodBreakdown, currencyNoun, foreignTotalsOf, formatPeriodRange, formatShortDay, uncoveredCategories,
} from '../services/BudgetBreakdown';
import type { Transaction } from '../services/storage';

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

function tx(id: string, category: string, amount: number, date: Date, extra: Partial<Transaction> = {}): Transaction {
  return {
    id, amount, description: `mov ${id}`, category, date: date.toISOString(),
    type: 'expense', source: 'manual', currency: 'Q', ...extra,
  };
}

// Período: 27 oct – 26 nov 2026
const period = { start: d(2026, 10, 27, 0, 0), end: d(2026, 11, 26, 23, 59) };

const txs: Transaction[] = [
  tx('f1', 'food', 100, d(2026, 10, 28)),
  tx('f2', 'food', 50.5, d(2026, 11, 5)),
  tx('f3', 'food', 17.98, d(2026, 11, 6), { currency: 'USD' }),
  tx('f4', 'food', 20, d(2026, 11, 7), { currency: undefined as unknown as Transaction['currency'] }), // antiguo sin moneda = Q
  tx('r1', 'restaurant', 200, d(2026, 11, 8)),
  tx('g1', 'groceries', 5, d(2026, 11, 9), { currency: 'EUR' }),
  tx('c1', 'custom_123', 80, d(2026, 11, 10)),
  tx('c2', 'custom_123', 12, d(2026, 11, 11), { currency: 'USD' }),
  tx('c3', 'custom_123', 7, d(2026, 11, 12), { currency: 'USD' }),
  // fuera del período
  tx('o1', 'food', 999, d(2026, 10, 26, 23, 59)),
  tx('o2', 'restaurant', 999, d(2026, 11, 27, 0, 1)),
  // ingreso y transferencias: no cuentan
  tx('i1', 'salary', 5000, d(2026, 11, 1), { type: 'income' }),
  tx('t1', 'food', 300, d(2026, 11, 2), { type: 'transfer' }),
  tx('t2', 'transfer', 400, d(2026, 11, 3), { transferPairId: 'tp1' }),
  tx('t3', 'transfer', 150, d(2026, 11, 4)),                    // salida por transferencia sin par
  tx('bad', 'food', 1, d(2026, 11, 13), { date: 'no-es-fecha' }),  // fecha inválida
];

const map = buildPeriodBreakdown(txs, period);

// ── Categoría con Q y USD ──
const food = map.get('food')!;
check('food existe', !!food);
check('food: total Q suma solo Q (100 + 50.5 + 20 sin moneda)', Math.abs(food.qTotal - 170.5) < 1e-9, String(food.qTotal));
check('food: 3 movimientos en Q', food.qTxs.length === 3);
check('food: Q ordenado por fecha desc', food.qTxs.map(t => t.id).join(',') === 'f4,f2,f1', food.qTxs.map(t => t.id).join(','));
check('food: una casilla extra (USD)', food.foreign.length === 1 && food.foreign[0].currency === 'USD');
check('food: total USD sin convertir', Math.abs(food.foreign[0].total - 17.98) < 1e-9);
check('food: el USD no entra al total Q', food.qTotal < 170.51);
check('food: excluye fuera de período, transferencias y fecha inválida',
  !food.qTxs.some(t => ['o1', 't1', 'bad'].includes(t.id)));

// ── Otra categoría solo con Q ──
const rest = map.get('restaurant')!;
check('restaurant: 200 Q, sin casillas extra', rest.qTotal === 200 && rest.foreign.length === 0);
check('restaurant: movimiento posterior al período excluido', rest.qTxs.length === 1);

// ── Categoría solo en otra moneda ──
const groc = map.get('groceries')!;
check('groceries: Q = 0 y casilla EUR', groc.qTotal === 0 && groc.qTxs.length === 0 && groc.foreign[0].currency === 'EUR' && groc.foreign[0].total === 5);

// ── Categoría personalizada ──
const cu = map.get('custom_123')!;
check('custom: Q 80', cu.qTotal === 80);
check('custom: USD agrupa dos movimientos (19)', cu.foreign.length === 1 && cu.foreign[0].total === 19 && cu.foreign[0].txs.length === 2);
check('custom: USD ordenado por fecha desc', cu.foreign[0].txs.map(t => t.id).join(',') === 'c3,c2');

// ── Ingresos y transferencias no crean categoría ──
check('el ingreso no aparece', !map.has('salary'));
check('transferencia con type transfer no suma a food', !food.qTxs.some(t => t.id === 't1'));
const trf = map.get('transfer')!;
check('transferencia con par no cuenta; la sin par sí queda en su categoría', trf.qTotal === 150 && trf.qTxs.length === 1 && trf.qTxs[0].id === 't3');

// ── Suma de monedas extranjeras (resumen superior) ──
const ft = foreignTotalsOf(map);
check('totales extranjeros: USD 36.98 y EUR 5, en ese orden',
  ft.length === 2 && ft[0].currency === 'USD' && Math.abs(ft[0].total - 36.98) < 1e-9 && ft[1].currency === 'EUR' && ft[1].total === 5,
  JSON.stringify(ft));

// ── Categorías sin presupuesto ──
const unc = uncoveredCategories(map, ['food']);
check('sin presupuesto: no incluye food ni transfer', !unc.some(e => e.categoryId === 'food' || e.categoryId === 'transfer'));
check('sin presupuesto: orden por total Q desc (restaurant, custom, groceries)',
  unc.map(e => e.categoryId).join(',') === 'restaurant,custom_123,groceries', unc.map(e => e.categoryId).join(','));
check('sin presupuesto: incluye la que solo tiene gasto en EUR', unc.some(e => e.categoryId === 'groceries'));
const unc2 = uncoveredCategories(map, ['food', 'restaurant', 'custom_123', 'groceries']);
check('sin presupuesto: vacío si todo tiene presupuesto', unc2.length === 0);

// ── Sin movimientos ──
const empty = buildPeriodBreakdown([], period);
check('lista vacía: mapa vacío y sin extranjeros', empty.size === 0 && foreignTotalsOf(empty).length === 0);

// ── Límites inclusivos del período ──
const edge = buildPeriodBreakdown([
  tx('e1', 'food', 10, period.start),
  tx('e2', 'food', 20, period.end),
], period);
check('los bordes del período son inclusivos', edge.get('food')?.qTotal === 30);

// ── Formato ──
check('formatShortDay', formatShortDay(d(2026, 10, 27)) === '27 oct');
check('formatPeriodRange', formatPeriodRange(period) === '27 oct – 26 nov', formatPeriodRange(period));
check('currencyNoun', currencyNoun('USD') === 'dólares' && currencyNoun('EUR') === 'euros' && currencyNoun('£') === 'libras');

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
