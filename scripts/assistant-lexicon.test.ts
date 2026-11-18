process.env.TZ = 'America/Guatemala';
// Pruebas del léxico del asistente (services/assistant/Lexicon.ts): sinónimos de categorías, comercios,
// cuentas y nombres libres. Sin dependencias:
//   npm run test:assistant-lexicon   →   sucrase-node scripts/assistant-lexicon.test.ts

import {
  CATEGORY_SYNONYMS, INCOME_SYNONYMS, categoryCandidates, categoryChips, cleanFreeName, extractFixedName,
  extractGoalName, extractTxDescription, guessCategoryForText, resolveAccount, resolveCategories, resolveMerchant,
  txMatchesMerchant,
} from '../services/assistant/Lexicon';
import { normalizeWithMap } from '../services/assistant/Text';
import type { Account, CustomCategory, MerchantRule, Transaction } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

// ── Datos falsos ──
const CUSTOM: CustomCategory[] = [
  { id: 'custom_pets', label: 'Mascotas', icon: 'paw-outline', color: '#fff', type: 'expense' },
  { id: 'custom_gym', label: 'Gimnasio', icon: 'fitness-outline', color: '#fff', type: 'both' },
  { id: 'custom_tips', label: 'Propinas', icon: 'cash-outline', color: '#fff', type: 'income' },
  { id: 'custom_gas', label: 'Gas', icon: 'flame-outline', color: '#fff', type: 'expense' },
  { id: 'custom_hormiga', label: 'Gastos hormiga', icon: 'bug-outline', color: '#fff', type: 'expense' },
];

const tx = (id: string, description: string, extra: Partial<Transaction> = {}): Transaction => ({
  id, amount: 10, description, category: 'other', date: new Date(2026, 10, 5, 12).toISOString(),
  type: 'expense', source: 'manual', currency: 'Q', ...extra,
});

const TXS: Transaction[] = [
  tx('s1', 'Spotify Premium', { merchant: 'Spotify', currency: 'USD', amount: 4.99 }),
  tx('s2', 'Spotify', { merchant: 'Spotify', amount: 40 }),
  tx('sh1', 'Compra Shell', { merchant: 'SHELL', source: 'sms', amount: 85, originalSMS: 'BAC: compra por Q85 en SHELL ZONA 10' }),
  tx('pc1', 'Pollo Campero', { amount: 62 }),
  tx('pc2', 'Pollo Campero', { merchant: 'Pollo Campero Majadas', amount: 70 }),
  tx('su1', 'Super 24', { merchant: 'Super 24 Zona 1', amount: 120 }),
  tx('al1', 'Almuerzo', { amount: 35 }),
  tx('in1', 'Sueldo noviembre', { type: 'income', category: 'salary', amount: 6000 }),
  tx('tr1', 'Spotify transferencia', { type: 'transfer', amount: 999 }),
  tx('tr2', 'Pago Spotify', { transferPairId: 'tp1', amount: 999 }),
];

const ACCOUNTS: Account[] = [
  { id: 'a1', name: 'BAC Visa', type: 'credit', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'card', bankName: 'BAC', isActive: true, createdAt: '' },
  { id: 'a2', name: 'Cuenta Banrural', type: 'bank', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'card', bankName: 'Banrural', isActive: true, createdAt: '' },
  { id: 'a3', name: 'Efectivo', type: 'cash', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'cash', isActive: true, createdAt: '' },
  { id: 'a4', name: 'BAC Débito', type: 'bank', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'card', bankName: 'BAC', isActive: true, createdAt: '' },
  { id: 'a5', name: 'Banrural Vieja', type: 'bank', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'card', bankName: 'Banrural', isActive: false, createdAt: '' },
  { id: 'a6', name: 'Tarjeta Industrial', type: 'credit', currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'card', bankName: 'Industrial', isActive: true, createdAt: '' },
];

const RULES: MerchantRule[] = [
  { key: 'tienda juanita', label: 'Tienda Juanita', category: 'groceries', createdAt: '', updatedAt: '', hits: 2 },
  { key: 'cafe luna', label: 'Café Luna', category: 'custom_pets', createdAt: '', updatedAt: '', hits: 1 },
];

const ctxBase = { transactions: TXS, merchantRules: RULES, settings: { customCategories: CUSTOM } };

const nn = (raw: string) => normalizeWithMap(raw).norm;
const cats = (raw: string, type: 'expense' | 'income' = 'expense', custom: CustomCategory[] = []) =>
  resolveCategories(nn(raw), custom, type).map(m => m.id);
const first = (raw: string, type: 'expense' | 'income' = 'expense', custom: CustomCategory[] = []) => cats(raw, type, custom)[0];

// Tramo [start, end) de una frase dentro de norm (para simular lo que consumen otros extractores).
function span(norm: string, phrase: string): [number, number] {
  const i = norm.indexOf(phrase);
  return [i, i + phrase.length];
}

// ─────────────────────────────────────────────────────────────
// 1. Sinónimos de gasto
// ─────────────────────────────────────────────────────────────
const EXPENSE_CASES: [string, string][] = [
  ['gasté 85 en gasolina', 'fuel'],
  ['combustible', 'fuel'],
  ['eché diesel', 'fuel'],
  ['en la gasolinera', 'fuel'],
  ['fui a Shell', 'fuel'],
  ['puma', 'fuel'],
  ['texaco', 'fuel'],
  ['compré en el súper', 'groceries'],
  ['fui al supermercado', 'groceries'],
  ['la despensa', 'groceries'],
  ['Paiz', 'groceries'],
  ['Walmart', 'groceries'],
  ['La Torre', 'groceries'],
  ['maxi despensa', 'groceries'],
  ['el mandado', 'groceries'],
  ['en el mercado', 'groceries'],
  ['el almuerzo', 'food'],
  ['desayuno', 'food'],
  ['cena', 'food'],
  ['una refacción', 'food'],
  ['unos shucos', 'food'],
  ['pollo campero', 'food'],
  ['comida', 'food'],
  ['restaurante', 'restaurant'],
  ['comer fuera', 'restaurant'],
  ['uber', 'transport'],
  ['un taxi', 'transport'],
  ['inDriver', 'transport'],
  ['el bus', 'transport'],
  ['la camioneta', 'transport'],
  ['pasaje', 'transport'],
  ['parqueo', 'transport'],
  ['el cine', 'entertainment'],
  ['salidas', 'entertainment'],
  ['fiesta', 'entertainment'],
  ['netflix', 'streaming'],
  ['Disney', 'streaming'],
  ['HBO', 'streaming'],
  ['prime video', 'streaming'],
  ['compras', 'shopping'],
  ['amazon', 'shopping'],
  ['ropa', 'clothes'],
  ['unos zapatos', 'clothes'],
  ['tenis', 'clothes'],
  ['el doctor', 'health'],
  ['el médico', 'health'],
  ['hospital', 'health'],
  ['clínica', 'health'],
  ['dentista', 'health'],
  ['salud', 'health'],
  ['farmacia', 'pharmacy'],
  ['medicinas', 'pharmacy'],
  ['pastillas', 'pharmacy'],
  ['el colegio', 'education'],
  ['universidad', 'education'],
  ['libros', 'education'],
  ['cursos', 'education'],
  ['la luz', 'utilities'],
  ['el agua', 'utilities'],
  ['EEGSA', 'utilities'],
  ['energuate', 'utilities'],
  ['gas propano', 'utilities'],
  ['tropigas', 'utilities'],
  ['internet', 'internet'],
  ['teléfono', 'internet'],
  ['una recarga', 'internet'],
  ['tigo', 'internet'],
  ['claro', 'internet'],
  ['la renta', 'rent'],
  ['alquiler', 'rent'],
  ['hipoteca', 'rent'],
  ['un viaje', 'travel'],
  ['hotel', 'travel'],
  ['vuelo', 'travel'],
  ['retiro', 'atm'],
  ['cajero', 'atm'],
  ['suscripción', 'subscriptions'],
  ['membresía', 'subscriptions'],
  ['laptop', 'tech'],
  ['audífonos', 'tech'],
  ['computadora', 'tech'],
  ['comisión', 'bank_fees'],
  ['cargo bancario', 'bank_fees'],
];
for (const [raw, id] of EXPENSE_CASES) check(`gasto «${raw}» → ${id}`, first(raw) === id, JSON.stringify(cats(raw)));

// ─────────────────────────────────────────────────────────────
// 2. Sinónimos de ingreso
// ─────────────────────────────────────────────────────────────
const INCOME_CASES: [string, string][] = [
  ['me cayó el sueldo', 'salary'],
  ['mi salario', 'salary'],
  ['la quincena', 'salary'],
  ['planilla', 'salary'],
  ['pago militar', 'salary'],
  ['un freelance', 'freelance'],
  ['una chamba', 'freelance'],
  ['trabajo extra', 'freelance'],
  ['bono', 'bonus'],
  ['aguinaldo', 'bonus'],
  ['bono 14', 'bonus'],
  ['un regalo', 'gift'],
  ['inversión', 'investment'],
  ['intereses ganados', 'investment'],
  ['alquiler cobrado', 'rental'],
  ['mi negocio', 'business'],
  ['ventas', 'business'],
];
for (const [raw, id] of INCOME_CASES) check(`ingreso «${raw}» → ${id}`, first(raw, 'income') === id, JSON.stringify(cats(raw, 'income')));

// ─────────────────────────────────────────────────────────────
// 3. Tildes, mayúsculas, plural y errores de ortografía
// ─────────────────────────────────────────────────────────────
check('MAYÚSCULAS: GASOLINA', first('GASOLINA') === 'fuel');
check('MAYÚSCULAS con tilde: SÚPER', first('SÚPER') === 'groceries');
check('sin tilde: medico', first('medico') === 'health');
check('con tilde: MÉDICO', first('MÉDICO') === 'health');
check('typo: gasolna → fuel', first('gasolna') === 'fuel');
check('typo: gazolina → fuel', first('gazolina') === 'fuel');
check('typo: supermercdo → groceries', first('supermercdo') === 'groceries');
check('typo: supermecado → groceries', first('supermecado') === 'groceries');
check('plural: restaurantes → restaurant', first('restaurantes') === 'restaurant');
check('typo: restuarante → restaurant', first('restuarante') === 'restaurant');
check('typo: farmcia → pharmacy', first('farmcia') === 'pharmacy');
check('typo: netfilx → streaming', first('netfilx') === 'streaming');
check('typo: spotfy → streaming', first('spotfy') === 'streaming');
check('typo: despenza → groceries', first('despenza') === 'groceries');
check('plural: buses → transport', first('buses') === 'transport');
check('plural: taxis → transport', first('taxis') === 'transport');
check('plural: shucos y shuco → food', first('un shuco') === 'food' && first('dos shucos') === 'food');
check('plural: medicina → pharmacy', first('la medicina') === 'pharmacy');
check('«tenía» no es «tenis»', cats('tenía hambre').length === 0, JSON.stringify(cats('tenía hambre')));
check('«saludos» no es salud', cats('saludos').length === 0, JSON.stringify(cats('saludos')));
check('«vuelvo» no es vuelo', cats('ya vuelvo').length === 0);
check('«compra» (singular) no es «compras»', cats('hice una compra').length === 0);
check('«clara» no es claro', cats('mi amiga Clara').length === 0);
check('texto sin categoría → vacío', cats('hola buenas tardes').length === 0);
check('texto vacío → vacío', cats('').length === 0);
check('categoría etiqueta: transporte', first('transporte') === 'transport');
check('categoría etiqueta: servicios', first('servicios') === 'utilities');
check('categoría etiqueta: Internet/Tel. (internet tel)', first('internet tel') === 'internet');
check('categoría etiqueta: educación', first('educación') === 'education');
check('«otro» no es una categoría que se pueda nombrar', cats('otro').length === 0);

// ─────────────────────────────────────────────────────────────
// 4. Tramos, orden y empates
// ─────────────────────────────────────────────────────────────
{
  const n = nn('Gasté 85 en gasolina ayer');
  const m = resolveCategories(n, [], 'expense');
  check('tramo: start/end sobre norm', m.length === 1 && n.slice(m[0].start, m[0].end) === 'gasolina', JSON.stringify(m));
  check('tramo: alias reportado', m[0]?.alias === 'gasolina');
}
{
  const n = nn('gas propano y gasolina');
  const m = resolveCategories(n, [], 'expense');
  check('dos categorías distintas en el texto', categoryCandidates(m).length === 2 && categoryCandidates(m).indexOf('utilities') >= 0 && categoryCandidates(m).indexOf('fuel') >= 0, JSON.stringify(m));
  check('«gas propano» gana a «gas» (misma zona)', m.filter(x => x.alias === 'gas').length === 0);
}
{
  const m = resolveCategories(nn('comida y almuerzo'), [], 'expense');
  check('misma categoría dos veces → un candidato', categoryCandidates(m).length === 1 && m.length === 2, JSON.stringify(m));
}
{
  const m = resolveCategories(nn('internet tel'), [], 'expense');
  check('frase más larga gana a la palabra suelta', m.length === 1 && m[0].alias === 'internet tel', JSON.stringify(m));
}
check('«pago militar» es ingreso, no gasto', cats('pago militar', 'expense').length === 0);
check('«alquiler» como gasto es rent', first('alquiler', 'expense') === 'rent');
check('«alquiler» como ingreso es rental', first('alquiler', 'income') === 'rental');
check('«gas natural» → utilities', first('gas natural') === 'utilities');

// ─────────────────────────────────────────────────────────────
// 5. «gas» ambiguo
// ─────────────────────────────────────────────────────────────
{
  const m = resolveCategories(nn('pagué el gas'), [], 'expense');
  const ids = categoryCandidates(m);
  check('«gas» → dos candidatos', ids.length === 2, JSON.stringify(m));
  check('«gas» → Combustible y Servicios', ids.indexOf('fuel') >= 0 && ids.indexOf('utilities') >= 0, JSON.stringify(ids));
  check('«gas» → mismo tramo para ambos', m.length === 2 && m[0].start === m[1].start && m[0].end === m[1].end);
  const chips = categoryChips(ids, [], 'expense');
  check('«gas» → chips con etiquetas', chips.length === 2 && chips.some(c => c.label === 'Combustible' && c.value === 'fuel') && chips.some(c => c.label === 'Servicios' && c.value === 'utilities'), JSON.stringify(chips));
}
check('«gas» no es ambiguo como ingreso', cats('gas', 'income').length === 0);
{
  const ids = categoryCandidates(resolveCategories(nn('gas'), CUSTOM, 'expense'));
  check('una personalizada «Gas» desambigua «gas»', ids.length === 1 && ids[0] === 'custom_gas', JSON.stringify(ids));
}

// ─────────────────────────────────────────────────────────────
// 6. Categorías personalizadas
// ─────────────────────────────────────────────────────────────
check('personalizada: mascotas', first('mascotas', 'expense', CUSTOM) === 'custom_pets');
check('personalizada: Mascotas (mayúscula)', first('gasté 50 en Mascotas', 'expense', CUSTOM) === 'custom_pets');
check('personalizada: MASCOTAS', first('MASCOTAS', 'expense', CUSTOM) === 'custom_pets');
check('personalizada en singular: mascota', first('la mascota', 'expense', CUSTOM) === 'custom_pets');
check('personalizada con typo: mascotsa', first('mascotsa', 'expense', CUSTOM) === 'custom_pets');
check('personalizada de varias palabras', first('gastos hormiga', 'expense', CUSTOM) === 'custom_hormiga', JSON.stringify(cats('gastos hormiga', 'expense', CUSTOM)));
check('personalizada «both» sirve en gasto', first('gimnasio', 'expense', CUSTOM) === 'custom_gym');
check('personalizada «both» sirve en ingreso', first('gimnasio', 'income', CUSTOM) === 'custom_gym');
check('personalizada solo-ingreso no sale en gasto', cats('propinas', 'expense', CUSTOM).length === 0);
check('personalizada solo-ingreso sale en ingreso', first('propinas', 'income', CUSTOM) === 'custom_tips');
check('personalizada solo-gasto no sale en ingreso', cats('mascotas', 'income', CUSTOM).length === 0);
check('sin personalizadas no se resuelve «mascotas»', cats('mascotas').length === 0);
{
  const custom: CustomCategory[] = [{ id: 'custom_food', label: 'Comida', icon: 'x', color: '#fff', type: 'expense' }];
  const m = resolveCategories(nn('comida'), custom, 'expense');
  check('la personalizada gana a la estándar con el mismo nombre', m.length === 1 && m[0].id === 'custom_food', JSON.stringify(m));
}
{
  const m = resolveCategories(nn('mascotas y gasolina'), CUSTOM, 'expense');
  check('personalizadas primero en el orden del resultado', m.length === 2 && m[0].id === 'custom_pets' && m[1].id === 'fuel', JSON.stringify(m));
}
{
  const chips = categoryChips(['custom_pets', 'fuel'], CUSTOM, 'expense');
  check('chips usan la etiqueta de la personalizada', chips[0].label === 'Mascotas' && chips[0].value === 'custom_pets', JSON.stringify(chips));
}
check('etiqueta con emoji y símbolos no rompe', first('viajes', 'expense', [{ id: 'c1', label: '🎮 Juegos/Apps', icon: 'x', color: '#fff', type: 'expense' }]) === 'travel');
check('etiqueta personalizada con símbolos se divide', first('juegos apps', 'expense', [{ id: 'c1', label: '🎮 Juegos/Apps', icon: 'x', color: '#fff', type: 'expense' }]) === 'c1');
check('lista de personalizadas indefinida', cats('gasolina', 'expense', undefined as unknown as CustomCategory[]).length === 1);

// ─────────────────────────────────────────────────────────────
// 7. Catálogos exportados
// ─────────────────────────────────────────────────────────────
check('CATEGORY_SYNONYMS: fuel incluye gasolina', CATEGORY_SYNONYMS.fuel.indexOf('gasolina') >= 0);
check('CATEGORY_SYNONYMS: groceries incluye super', CATEGORY_SYNONYMS.groceries.indexOf('super') >= 0);
check('CATEGORY_SYNONYMS: 20 categorías de gasto con sinónimos', Object.keys(CATEGORY_SYNONYMS).length === 20, String(Object.keys(CATEGORY_SYNONYMS).length));
check('CATEGORY_SYNONYMS: sin «gas» suelto (es ambiguo)', Object.keys(CATEGORY_SYNONYMS).every(k => CATEGORY_SYNONYMS[k].indexOf('gas') < 0));
check('INCOME_SYNONYMS: salary incluye sueldo', INCOME_SYNONYMS.salary.indexOf('sueldo') >= 0);
check('INCOME_SYNONYMS: 7 categorías de ingreso con sinónimos', Object.keys(INCOME_SYNONYMS).length === 7);
check('sinónimos ya normalizados (minúsculas, sin tildes)', Object.keys(CATEGORY_SYNONYMS).every(k => CATEGORY_SYNONYMS[k].every(a => a === nn(a))));

// ─────────────────────────────────────────────────────────────
// 8. guessCategoryForText
// ─────────────────────────────────────────────────────────────
const g = (text: string, type: 'expense' | 'income' = 'expense') => guessCategoryForText(text, ctxBase, type);
check('guess: Gasolina → fuel', g('Gasolina') === 'fuel');
check('guess: Súper 24 → groceries', g('Súper 24') === 'groceries');
check('guess: regla aprendida gana (Tienda Juanita)', g('Tienda Juanita') === 'groceries');
check('guess: regla aprendida con sucursal', g('Tienda Juanita zona 7') === 'groceries');
check('guess: regla aprendida a categoría personalizada', g('Café Luna') === 'custom_pets');
check('guess: personalizada por nombre', g('Veterinario mascotas') === 'custom_pets');
check('guess: Spotify → streaming', g('Spotify') === 'streaming');
check('guess: Pollo Campero → food (sinónimo del asistente)', g('Pollo Campero') === 'food');
check('guess: caída a Categorizer (Cinépolis)', g('Cinepolis') === 'entertainment', g('Cinepolis'));
check('guess: caída a Categorizer (Megapaca)', g('Megapaca') === 'clothes', g('Megapaca'));
check('guess: sin pistas → other', g('algo raro xyz') === 'other');
check('guess: texto vacío → other', g('') === 'other' && g('   ') === 'other');
check('guess: «luz» → utilities', g('Luz') === 'utilities');
check('guess: «gas» ambiguo → una de las candidatas', ['fuel', 'utilities'].indexOf(guessCategoryForText('gas', { merchantRules: [], settings: { customCategories: [] } }, 'expense')) >= 0);
check('guess: «gas» con personalizada «Gas» → la personalizada', g('gas') === 'custom_gas');
check('guess ingreso: sueldo → salary', g('sueldo', 'income') === 'salary');
check('guess ingreso: aguinaldo → bonus', g('Aguinaldo', 'income') === 'bonus');
check('guess ingreso: propinas (personalizada) → custom_tips', g('propinas', 'income') === 'custom_tips');
check('guess ingreso: Mindef → salary (Categorizer)', g('Mindef', 'income') === 'salary');
check('guess ingreso: sin pistas → other', g('deposito raro', 'income') === 'other');
check('guess ingreso: no usa reglas de comercio', g('Tienda Juanita', 'income') === 'other');
check('guess gasto: nunca devuelve categorías de ingreso', g('sueldo') !== 'salary');
check('guess: regla con categoría eliminada se ignora', guessCategoryForText('Tienda Vieja', {
  merchantRules: [{ key: 'tienda vieja', label: 'Tienda Vieja', category: 'custom_borrada', createdAt: '', updatedAt: '', hits: 1 }],
  settings: { customCategories: [] },
}, 'expense') !== 'custom_borrada');

// ─────────────────────────────────────────────────────────────
// 9. Cuentas
// ─────────────────────────────────────────────────────────────
const accIds = (raw: string) => resolveAccount(nn(raw), ACCOUNTS).map(a => a.id);
check('cuenta: por nombre «banrural»', accIds('con banrural').join() === 'a2', accIds('con banrural').join());
check('cuenta: por nombre en mayúsculas', accIds('BANRURAL').join() === 'a2');
check('cuenta: typo «banrurl»', accIds('banrurl').join() === 'a2');
check('cuenta: nombre completo «bac visa»', accIds('con bac visa').join() === 'a1', accIds('con bac visa').join());
check('cuenta: «bac» sola → dos candidatas (chips)', accIds('en bac').join() === 'a1,a4', accIds('en bac').join());
check('cuenta: «tarjeta bac» → solo la de crédito', accIds('con la tarjeta bac').join() === 'a1', accIds('con la tarjeta bac').join());
check('cuenta: «débito bac» → solo la de débito', accIds('debito bac').join() === 'a4', accIds('debito bac').join());
check('cuenta: «efectivo» por nombre y tipo', accIds('en efectivo').join() === 'a3');
check('cuenta: «cash» por tipo', accIds('pagué en cash').join() === 'a3');
check('cuenta: «tarjeta» sola → todas las de crédito', accIds('con la tarjeta').join() === 'a1,a6', accIds('con la tarjeta').join());
check('cuenta: «tarjeta industrial»', accIds('tarjeta industrial').join() === 'a6');
check('cuenta: «industrial» por banco', accIds('industrial').join() === 'a6');
check('cuenta: por banco «banrural» no incluye la inactiva', accIds('banrural').indexOf('a5') < 0);
check('cuenta: sin pistas → vacío', accIds('gasté 50 en gasolina').length === 0);
check('cuenta: texto vacío → vacío', accIds('').length === 0);
check('cuenta: lista de cuentas vacía', resolveAccount(nn('bac'), []).length === 0);
check('cuenta: la palabra genérica «cuenta» no basta', accIds('en mi cuenta').length === 0, accIds('en mi cuenta').join());

// ─────────────────────────────────────────────────────────────
// 10. Comercios
// ─────────────────────────────────────────────────────────────
const merchant = (raw: string, spans?: [number, number][]) => resolveMerchant(nn(raw), ctxBase, spans ? { excludeSpans: spans } : undefined);
{
  const m = merchant('muéstrame los movimientos de Spotify');
  check('comercio: Spotify (gana a la categoría streaming)', !!m && m.key === 'spotify', JSON.stringify(m));
  check('comercio: Spotify cuenta 2 (sin transferencias)', m?.count === 2, JSON.stringify(m));
  check('comercio: etiqueta del movimiento', m?.label === 'Spotify');
}
check('comercio: typo «spotfy»', merchant('movimientos de spotfy')?.key === 'spotify');
check('comercio: MAYÚSCULAS', merchant('MOVIMIENTOS DE SPOTIFY')?.key === 'spotify');
{
  const m = merchant('cuánto gasté en Shell');
  check('comercio: Shell por SMS', !!m && m.key === 'shell' && m.count === 1, JSON.stringify(m));
}
{
  const m = merchant('gasté en pollo campero');
  check('comercio: Pollo Campero (2 movimientos, uno con sucursal)', !!m && m.key === 'pollo campero' && m.count === 2, JSON.stringify(m));
}
check('comercio: solo «campero» también', merchant('movimientos de campero')?.count === 2);
check('comercio: «super 24» gana a la palabra «super»', merchant('gasté en super 24')?.key === 'super 24', JSON.stringify(merchant('gasté en super 24')));
check('comercio: «supermercado» (categoría genérica) no es comercio', merchant('cuánto gasté en supermercado') === null, JSON.stringify(merchant('cuánto gasté en supermercado')));
check('comercio: «gasolina» (categoría genérica) no es comercio', merchant('cuánto gasté en gasolina') === null);
check('comercio: «almuerzo» (categoría genérica) no es comercio', merchant('cuánto gasté en almuerzo') === null);
check('comercio: «restaurantes» no es comercio', merchant('gasté en restaurantes') === null);
check('comercio: sin coincidencias → null', merchant('movimientos de Cemaco') === null);
check('comercio: texto sin comercio → null', merchant('cuánto gasté este período') === null);
check('comercio: sin movimientos → null', resolveMerchant(nn('spotify'), { transactions: [] }) === null);
check('comercio: solo transferencias → null', resolveMerchant(nn('spotify'), { transactions: TXS.filter(t => t.id === 'tr1' || t.id === 'tr2') }) === null);
{
  const n = nn('movimientos de Spotify');
  const m = resolveMerchant(n, ctxBase, { excludeSpans: [span(n, 'spotify')] });
  check('comercio: tramo excluido no se usa', m === null, JSON.stringify(m));
}
check('comercio: monto suelto no es comercio', merchant('gasté 50') === null);
check('comercio: la fecha no es comercio', merchant('gasté ayer') === null);
{
  const t = TXS.find(x => x.id === 'sh1')!;
  check('txMatchesMerchant: por clave', txMatchesMerchant(t, 'shell'));
  check('txMatchesMerchant: por etiqueta con mayúsculas', txMatchesMerchant(t, 'SHELL'));
  check('txMatchesMerchant: otro comercio no', !txMatchesMerchant(t, 'spotify'));
  check('txMatchesMerchant: por descripción de movimiento manual', txMatchesMerchant(TXS.find(x => x.id === 'pc1')!, 'pollo campero'));
  check('txMatchesMerchant: clave aprendida («pollocampero»)', txMatchesMerchant(tx('x', 'compra', { merchant: 'POLLOCAMPERO' }), 'pollo campero'));
  check('txMatchesMerchant: texto vacío no coincide', !txMatchesMerchant(t, ''));
}

// ─────────────────────────────────────────────────────────────
// 11. Nombre libre de la meta
// ─────────────────────────────────────────────────────────────
function goal(raw: string, consumedPhrases: string[] = []): string | null {
  const { norm, map } = normalizeWithMap(raw);
  return extractGoalName(raw, norm, map, consumedPhrases.map(p => span(norm, nn(p))));
}
check('meta: «una laptop de 5k para fin de año» → Laptop', goal('Creame una meta para una laptop de 5k para fin de año', ['5k', 'para fin de ano']) === 'Laptop', String(goal('Creame una meta para una laptop de 5k para fin de año', ['5k', 'para fin de ano'])));
check('meta: «el viaje a Antigua» → Viaje a Antigua', goal('Quiero ahorrar para el viaje a Antigua') === 'Viaje a Antigua', String(goal('Quiero ahorrar para el viaje a Antigua')));
check('meta: conserva mayúsculas y tildes del usuario', goal('meta para Mi Cumpleaños Número 30', []) === 'Cumpleaños Número 30', String(goal('meta para Mi Cumpleaños Número 30')));
check('meta: «meta llamada Casa»', goal('crea una meta llamada Casa') === 'Casa');
check('meta: «meta de carro nuevo»', goal('nueva meta de carro nuevo de 50 mil', ['50 mil']) === 'Carro nuevo', String(goal('nueva meta de carro nuevo de 50 mil', ['50 mil'])));
check('meta: «meta: boda» con dos puntos', goal('Meta: boda') === 'Boda');
check('meta: «ahorrar para» con monto en medio', goal('quiero ahorrar Q15,000 para mi moto', ['q15,000']) === 'Moto', String(goal('quiero ahorrar Q15,000 para mi moto', ['q15,000'])));
check('meta: «juntar para»', goal('quiero juntar para las vacaciones') === 'Vacaciones');
check('meta: «reunir para»', goal('necesito reunir para una compu') === 'Compu');
check('meta: MAYÚSCULAS → primera mayúscula', goal('QUIERO AHORRAR PARA UNA LAPTOP') === 'Laptop', String(goal('QUIERO AHORRAR PARA UNA LAPTOP')));
check('meta: nombre ya en mayúscula inicial', goal('ahorrar para La Casa Azul') === 'Casa Azul', String(goal('ahorrar para La Casa Azul')));
check('meta: termina en «para» (fecha)', goal('ahorrar para un celular para diciembre') === 'Celular', String(goal('ahorrar para un celular para diciembre')));
check('meta: límite de 40 caracteres', (goal('meta para ' + 'viaje'.repeat(20)) ?? '').length === 40, String((goal('meta para ' + 'viaje'.repeat(20)) ?? '').length));
check('meta: solo la fecha no es un nombre', goal('quiero ahorrar Q15,000 para diciembre', ['q15,000', 'para diciembre']) === null);
check('meta: «para diciembre» sin tramo consumido tampoco', goal('quiero ahorrar 5000 para diciembre', ['5000']) === null);
check('meta: sin nombre → null', goal('crea una meta') === null);
check('meta: sin nada → null', goal('hola') === null);
check('meta: no confunde «ahorrar» con nombre', goal('meta ahorrar 5000', ['5000']) === null);
check('meta: «meta de ahorro» → null', goal('meta de ahorro de 5000', ['5000']) === null, String(goal('meta de ahorro de 5000', ['5000'])));
check('meta: «ahorro para» (sustantivo)', goal('mi ahorro para un terreno') === 'Terreno');
check('meta: espacios y signos extra', goal('  ¡¿Meta para   la   universidad?!  ') === 'Universidad', String(goal('  ¡¿Meta para   la   universidad?!  ')));

// ─────────────────────────────────────────────────────────────
// 12. Descripción de movimientos y nombre de gastos fijos
// ─────────────────────────────────────────────────────────────
function desc(raw: string, consumedPhrases: string[] = []): string | null {
  const { norm, map } = normalizeWithMap(raw);
  return extractTxDescription(raw, norm, map, consumedPhrases.map(p => span(norm, nn(p))));
}
function fixed(raw: string, consumedPhrases: string[] = []): string | null {
  const { norm, map } = normalizeWithMap(raw);
  return extractFixedName(raw, norm, map, consumedPhrases.map(p => span(norm, nn(p))));
}
check('desc: «gasté 50 en Pollo Campero»', desc('gasté 50 en Pollo Campero', ['50']) === 'Pollo Campero', String(desc('gasté 50 en Pollo Campero', ['50'])));
check('desc: corta en la fecha', desc('gasté 85 en gasolina ayer', ['85', 'ayer']) === 'Gasolina', String(desc('gasté 85 en gasolina ayer', ['85', 'ayer'])));
check('desc: «pagué 200 de luz»', desc('pagué 200 de luz', ['200']) === 'Luz', String(desc('pagué 200 de luz', ['200'])));
check('desc: corta en «con» (cuenta)', desc('gasté 50 en Pollo Campero con la tarjeta', ['50']) === 'Pollo Campero', String(desc('gasté 50 en Pollo Campero con la tarjeta', ['50'])));
check('desc: salta preposición seguida de monto', desc('pagué de 200 en el super', ['200']) === 'Super', String(desc('pagué de 200 en el super', ['200'])));
check('desc: «a» como preposición', desc('le pagué 100 a Juan', ['100']) === 'Juan', String(desc('le pagué 100 a Juan', ['100'])));
check('desc: sin preposición → null', desc('me cayó el sueldo 6 mil', ['6 mil']) === null);
check('desc: la cuenta no es descripción', desc('gasté 50 en efectivo', ['50']) === null, String(desc('gasté 50 en efectivo', ['50'])));
check('desc: MAYÚSCULAS se normalizan', desc('GASTÉ 50 EN POLLO CAMPERO', ['50']) === 'Pollo campero', String(desc('GASTÉ 50 EN POLLO CAMPERO', ['50'])));
check('desc: 40 caracteres máximo', (desc('gasté 5 en ' + 'tienda '.repeat(12)) ?? '').length <= 40);
check('fijo: «Agrega Netflix de $15.99 el 5 de cada mes»', fixed('Agrega Netflix de $15.99 el 5 de cada mes', ['$15.99']) === 'Netflix', String(fixed('Agrega Netflix de $15.99 el 5 de cada mes', ['$15.99'])));
check('fijo: «gasto fijo de internet»', fixed('crea un gasto fijo de internet por Q350', ['q350']) === 'Internet', String(fixed('crea un gasto fijo de internet por Q350', ['q350'])));
check('fijo: «pago fijo llamado Colegio»', fixed('nuevo pago fijo llamado Colegio') === 'Colegio', String(fixed('nuevo pago fijo llamado Colegio')));
check('fijo: «pago la luz»', fixed('todos los meses pago la luz 450', ['450']) === 'Luz', String(fixed('todos los meses pago la luz 450', ['450'])));
check('fijo: nombre de varias palabras', fixed('agrega Seguro del carro de Q400', ['q400']) === 'Seguro del carro', String(fixed('agrega Seguro del carro de Q400', ['q400'])));
check('fijo: sin nombre → null', fixed('crea un gasto fijo') === null, String(fixed('crea un gasto fijo')));

// ─────────────────────────────────────────────────────────────
// 13. cleanFreeName
// ─────────────────────────────────────────────────────────────
check('clean: artículo inicial', cleanFreeName('una laptop') === 'Laptop');
check('clean: varios artículos', cleanFreeName('mi una laptop') === 'Laptop');
check('clean: conector final', cleanFreeName('laptop de') === 'Laptop');
check('clean: signos en los bordes', cleanFreeName('  «laptop».  '.replace(/[«»]/g, '"')) === 'Laptop');
check('clean: conserva mayúsculas internas', cleanFreeName('el viaje a Antigua') === 'Viaje a Antigua');
check('clean: TODO MAYÚSCULAS → oración', cleanFreeName('LAPTOP GAMER') === 'Laptop gamer');
check('clean: 40 caracteres', cleanFreeName('a'.repeat(100)).length === 40);
check('clean: vacío', cleanFreeName('') === '' && cleanFreeName('   ') === '' && cleanFreeName('el') === '');
check('clean: tilde inicial se conserva', cleanFreeName('ácido fólico') === 'Ácido fólico');

console.log(`\nAsistente · Lexicon: ${checks} comprobaciones, ${failures} fallas`);
if (failures > 0) process.exit(1);
