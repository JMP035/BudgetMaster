process.env.TZ = 'America/Guatemala';
// Pruebas del extractor de montos del asistente (services/assistant/AmountParser.ts). Sin dependencias:
//   npm run test:assistant-amount   →   sucrase-node scripts/assistant-amount.test.ts

import { extractAmounts, parseAmountToken, parseSpanishNumber } from '../services/assistant/AmountParser';
import { normalizeWithMap, tokens } from '../services/assistant/Text';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

/** «5000|Q», «20|USD» o «500» (sin moneda), en orden de aparición. */
function amounts(raw: string, excludeSpans?: [number, number][]): string[] {
  const { norm } = normalizeWithMap(raw);
  return extractAmounts(norm, excludeSpans ? { excludeSpans } : undefined)
    .map(m => `${m.value}${m.currency ? '|' + m.currency : ''}`);
}

function expectAmounts(raw: string, expected: string[]): void {
  const got = amounts(raw);
  check(`monto «${raw}»`, JSON.stringify(got) === JSON.stringify(expected), `esperado ${JSON.stringify(expected)}, obtenido ${JSON.stringify(got)}`);
}

// ── Cifras con moneda ──
expectAmounts('Q5,000', ['5000|Q']);
expectAmounts('q5000', ['5000|Q']);
expectAmounts('Q 5,000.50', ['5000.5|Q']);
expectAmounts('Q.500', ['500|Q']);
expectAmounts('Q1,500.75', ['1500.75|Q']);
expectAmounts('Q5,000.00', ['5000|Q']);
expectAmounts('500 quetzales', ['500|Q']);
expectAmounts('5,000 quetzales', ['5000|Q']);
expectAmounts('500 Quetzal', ['500|Q']);
expectAmounts('500 varas', ['500|Q']);
expectAmounts('500 pesos', ['500|Q']);
expectAmounts('500 QTZ', ['500|Q']);
expectAmounts('500q', ['500|Q']);
expectAmounts('500 Q', ['500|Q']);
expectAmounts('q100.000', ['100000|Q']);
expectAmounts('$20', ['20|USD']);
expectAmounts('$ 20', ['20|USD']);
expectAmounts('20$', ['20|USD']);
expectAmounts('20 dolares', ['20|USD']);
expectAmounts('20 Dólares', ['20|USD']);
expectAmounts('US$ 100', ['100|USD']);
expectAmounts('100 USD', ['100|USD']);
expectAmounts('usd100', ['100|USD']);
expectAmounts('50 verdes', ['50|USD']);
expectAmounts('€50', ['50|EUR']);
expectAmounts('50 euros', ['50|EUR']);
expectAmounts('100 libras', ['100|£']);

// ── Cifras sin moneda ──
expectAmounts('3,500.00', ['3500']);
expectAmounts('3.500', ['3500']);
expectAmounts('1.234.567', ['1234567']);
expectAmounts('1,234,567', ['1234567']);
expectAmounts('100,000', ['100000']);
expectAmounts('12,5', ['12.5']);
expectAmounts('5.5', ['5.5']);
expectAmounts('0.500', ['0.5']);
expectAmounts('gaste 45 en gasolina', ['45']);
expectAmounts('pagar 150 de luz y 75 de agua', ['150', '75']);

// ── k / mil / millones ──
expectAmounts('5k', ['5000']);
expectAmounts('5K', ['5000']);
expectAmounts('Q5k', ['5000|Q']);
expectAmounts('q 1k', ['1000|Q']);
expectAmounts('1.5k', ['1500']);
expectAmounts('5 mil', ['5000']);
expectAmounts('5mil', ['5000']);
expectAmounts('ahorrar 10 mil quetzales', ['10000|Q']);
expectAmounts('2 mil 500', ['2500']);
expectAmounts('2 mil quinientos', ['2500']);
expectAmounts('1.5 millones', ['1500000']);
expectAmounts('2.5 millones', ['2500000']);
expectAmounts('5 millones', ['5000000']);

// ── En palabras ──
expectAmounts('mil quinientos', ['1500']);
expectAmounts('MIL QUINIENTOS', ['1500']);
expectAmounts('mil', ['1000']);
expectAmounts('mil quetzales', ['1000|Q']);
expectAmounts('dos mil trescientos cincuenta', ['2350']);
expectAmounts('tres mil doscientos', ['3200']);
expectAmounts('cinco mil', ['5000']);
expectAmounts('veinte mil', ['20000']);
expectAmounts('cien mil', ['100000']);
expectAmounts('ciento cincuenta mil', ['150000']);
expectAmounts('quinientos mil', ['500000']);
expectAmounts('medio millón', ['500000']);
expectAmounts('un millón', ['1000000']);
expectAmounts('un millón y medio', ['1500000']);
expectAmounts('dos millones quinientos mil', ['2500000']);
expectAmounts('veinte quetzales', ['20|Q']);
expectAmounts('cincuenta dólares', ['50|USD']);
expectAmounts('quince quetzales', ['15|Q']);
expectAmounts('diez dolares', ['10|USD']);
expectAmounts('treinta y cinco', ['35']);
expectAmounts('cuarenta y cinco quetzales', ['45|Q']);
expectAmounts('veintiuno', ['21']);
expectAmounts('veintinueve', ['29']);
expectAmounts('cien', ['100']);
expectAmounts('ciento veinte', ['120']);
expectAmounts('quinientos', ['500']);
expectAmounts('setecientos', ['700']);
expectAmounts('novecientos', ['900']);
expectAmounts('doscientas varas', ['200|Q']);
expectAmounts('cero', []);

// ── Errores comunes de escritura ──
expectAmounts('sinco mil', ['5000']);
expectAmounts('quinentos', ['500']);
expectAmounts('sietecientos', ['700']);
expectAmounts('cinquenta', ['50']);
expectAmounts('nuevo celular de 3000', ['3000']);       // «nuevo» no es 9
expectAmounts('cuarto de 500', ['500']);                // «cuarto» no es 4

// ── Frases completas ──
expectAmounts('meta de laptop de Q5,000 para el 15 de marzo', ['5000|Q']);
expectAmounts('Q500 y $20', ['500|Q', '20|USD']);
expectAmounts('Gasté Q 85.50 en el súper', ['85.5|Q']);
expectAmounts('cuanto gaste', []);
expectAmounts('crear una meta', []);
expectAmounts('un gasto de 200', ['200']);

// ── No son montos: fechas y plazos ──
expectAmounts('el 15', []);
expectAmounts('en 3 meses', []);
expectAmounts('últimos 30 días', []);
expectAmounts('dia 30', []);
expectAmounts('15 de marzo', []);
expectAmounts('marzo 15', []);
expectAmounts('diciembre 2027', []);
expectAmounts('diciembre de 2027', []);
expectAmounts('cada 5', []);
expectAmounts('el quince', []);
expectAmounts('dentro de seis meses', []);
expectAmounts('en dos semanas', []);
expectAmounts('5 veces', []);
expectAmounts('del 5 al 20 de octubre', []);
expectAmounts('0', []);

// ── Una librería de peso no es dinero ──
expectAmounts('5 libras de carne', ['5']);

// ── Robustez frente a claves del prototipo ──
expectAmounts('constructor toString valueOf __proto__', []);

// ── excludeSpans ──
check('excludeSpans quita el monto', JSON.stringify(amounts('ahorrar 500', [[8, 11]])) === '[]');
check('excludeSpans no afecta a otro monto', JSON.stringify(amounts('ahorrar 500 y 300', [[8, 11]])) === '["300"]');

// ── Tramos (start / end exclusivo, incluyendo el marcador de moneda) ──
{
  const { norm } = normalizeWithMap('Q5,000');
  const m = extractAmounts(norm)[0];
  check('tramo Q5,000', !!m && m.start === 0 && m.end === 6 && m.explicitCurrency && m.currency === 'Q');
}
{
  const { norm } = normalizeWithMap('meta de q 500 para ya');
  const m = extractAmounts(norm)[0];
  check('tramo «q 500» incluye el marcador', !!m && norm.slice(m.start, m.end) === 'q 500', m ? norm.slice(m.start, m.end) : 'sin monto');
}
{
  const { norm } = normalizeWithMap('veinte quetzales de luz');
  const m = extractAmounts(norm)[0];
  check('tramo «veinte quetzales»', !!m && norm.slice(m.start, m.end) === 'veinte quetzales');
}
{
  const { norm } = normalizeWithMap('sin moneda 5 mil');
  const m = extractAmounts(norm)[0];
  check('sin moneda → currency null y explicitCurrency false', !!m && m.currency === null && !m.explicitCurrency && norm.slice(m.start, m.end) === '5 mil');
}

// ── parseAmountToken ──
check('token 3.500 = 3500', parseAmountToken('3.500') === 3500);
check('token 12.345 = 12345', parseAmountToken('12.345') === 12345);
check('token 1.5 = 1.5', parseAmountToken('1.5') === 1.5);
check('token 0.500 = 0.5', parseAmountToken('0.500') === 0.5);
check('token 5,000 = 5000', parseAmountToken('5,000') === 5000);
check('token 1,500.50', parseAmountToken('1,500.50') === 1500.5);
check('token 1.500,50', parseAmountToken('1.500,50') === 1500.5);
check('token 3.500.000', parseAmountToken('3.500.000') === 3500000);
check('token 1234 = 1234', parseAmountToken('1234') === 1234);
check('token 12,5 = 12.5', parseAmountToken('12,5') === 12.5);
check('token abc = NaN', Number.isNaN(parseAmountToken('abc')));
check('token vacío = NaN', Number.isNaN(parseAmountToken('')));

// ── parseSpanishNumber ──
const psn = (s: string) => parseSpanishNumber(tokens(normalizeWithMap(s).norm), 0);
check('psn cinco', JSON.stringify(psn('cinco')) === '{"value":5,"consumed":1}');
check('psn treinta y cinco', JSON.stringify(psn('treinta y cinco')) === '{"value":35,"consumed":3}');
check('psn mil quinientos y resto', JSON.stringify(psn('mil quinientos quetzales')) === '{"value":1500,"consumed":2}');
check('psn no empieza número', psn('hola') === null);
check('psn «y» suelta no se consume', JSON.stringify(psn('treinta y')) === '{"value":30,"consumed":1}');
check('psn cinco cinco = solo el primero', JSON.stringify(psn('cinco cinco')) === '{"value":5,"consumed":1}');
check('psn desde posición', JSON.stringify(parseSpanishNumber(['gaste', 'dos', 'mil'], 1)) === '{"value":2000,"consumed":2}');
check('psn índice fuera de rango', parseSpanishNumber(['a'], 5) === null);
check('psn dos millones quinientos mil', psn('dos millones quinientos mil')?.value === 2500000);
check('psn medio millon', JSON.stringify(psn('medio millon')) === '{"value":500000,"consumed":2}');

console.log(`${checks} comprobaciones, ${failures} fallas`);
if (failures > 0) process.exit(1);
