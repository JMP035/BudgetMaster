process.env.TZ = 'America/Guatemala';
// Pruebas del formato de los widgets (montos abreviados, tamaño de la cifra, línea de tarjeta, saldos, cabecera)
// y del fondo Liquid Glass (conserva el borde: sin degradado).
//   npm run test:widget-format   →   sucrase-node scripts/widget-format.test.ts

import { NBSP, balancesLine, cardLine, headerLayout, heroFontSize, widgetMoney } from '../services/WidgetFormat';
import { WIDGET_ROOT_STYLE } from '../widgets/widget-style';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const eq = (name: string, got: string, want: string) => check(name, got === want, `${JSON.stringify(got)} ≠ ${JSON.stringify(want)}`);

console.log('widgetMoney compacto');
eq('-4158.45 → -Q 4,158', widgetMoney(-4158.45, 'Q', 'compact'), `-Q${NBSP}4,158`);
eq('462.05 → Q 462.05', widgetMoney(462.05, 'Q', 'compact'), `Q${NBSP}462.05`);
eq('12400 → Q 12.4k', widgetMoney(12400, 'Q', 'compact'), `Q${NBSP}12.4k`);
eq('1234567 → Q 1.2M', widgetMoney(1234567, 'Q', 'compact'), `Q${NBSP}1.2M`);
eq('0 → Q 0.00', widgetMoney(0, 'Q', 'compact'), `Q${NBSP}0.00`);
eq('USD 172.91 → $ 172.91', widgetMoney(172.91, 'USD', 'compact'), `$${NBSP}172.91`);
eq('-0.001 no deja «-0.00»', widgetMoney(-0.001, 'Q', 'compact'), `Q${NBSP}0.00`);
eq('999999 pasa a millones, no a «1000.0k»', widgetMoney(999999, 'Q', 'compact'), `Q${NBSP}1.0M`);
eq('9999.6 → Q 10,000 (sin decimales)', widgetMoney(9999.6, 'Q', 'compact'), `Q${NBSP}10,000`);

console.log('widgetMoney completo');
eq('full -4158.45', widgetMoney(-4158.45, 'Q', 'full'), `-Q${NBSP}4,158.45`);
eq('full USD', widgetMoney(172.91, 'USD', 'full'), `$${NBSP}172.91`);

console.log('Sin espacio normal entre símbolo y cifra');
{
  const samples = [-4158.45, 462.05, 12400, 1234567, 0, 9.9, -99999, 5e9];
  const all = samples.flatMap(n => [widgetMoney(n, 'Q', 'compact'), widgetMoney(n, 'Q', 'full'), widgetMoney(n, 'USD', 'compact')]);
  check('ningún monto trae un espacio normal', all.every(t => !t.includes(' ')), all.find(t => t.includes(' ')));
}

console.log('heroFontSize');
{
  check('«-Q 4,158.45» en 126 dp baja de 22', heroFontSize('-Q 4,158.45', 126) <= 20, String(heroFontSize('-Q 4,158.45', 126)));
  check('«Q 462.05» en 126 dp cabe a 22', heroFontSize('Q 462.05', 126) === 22, String(heroFontSize('Q 462.05', 126)));
  check('nunca baja de 14', heroFontSize('Q 99,999,999,999.99', 40) === 14);
  check('respeta la base', heroFontSize('Q 1', 500, 18) === 18);
}

console.log('cardLine');
{
  const line = cardLine({ due: '2027-01-02', Q: 3807.15, USD: 172.91 }, false);
  check('Q + USD cabe en 26 caracteres', line.length <= 26, `${line.length}: ${line}`);
  eq('línea de tarjeta', line, `02/01 · Q${NBSP}3,807 + $${NBSP}172.91`);
  eq('estimado', cardLine({ due: '2027-01-02', Q: 100, USD: 0, estimated: true }, false), `02/01 · Q${NBSP}100.00 (est.)`);
  eq('oculto', cardLine({ due: '2027-01-02', Q: 3807.15, USD: 172.91 }, true), '02/01 · ••••');
}

console.log('balancesLine');
{
  const five = [
    { name: 'BAC Ahorros', amount: 157, currency: 'Q' },
    { name: 'Efectivo', amount: 40, currency: 'Q' },
    { name: 'Banrural', amount: 12000, currency: 'Q' },
    { name: 'Wise', amount: 20, currency: 'USD' },
    { name: 'Otra', amount: 1, currency: 'Q' },
  ];
  const line = balancesLine(five, false);
  check('5 cuentas terminan en «+4 más»', line.endsWith('+4 más'), line);
  check('empieza por la primera cuenta', line.startsWith(`BAC Ahorros Q${NBSP}157.00`), line);
  eq('1 cuenta: solo ella', balancesLine(five.slice(0, 1), false), `BAC Ahorros Q${NBSP}157.00`);
  eq('0 cuentas: vacío', balancesLine([], false), '');
  check('oculto no muestra cifras', balancesLine(five, true).includes('••••') && !/\d{2,}/.test(balancesLine(five, true).replace('+4', '')));
}

console.log('headerLayout');
check('2×2 angosto (140 dp) sin marca', headerLayout(140).showBrand === false);
check('2×2 ancho (170 dp) con marca', headerLayout(170).showBrand === true);

console.log('Fondo Liquid Glass del widget');
{
  const st = WIDGET_ROOT_STYLE as Record<string, unknown>;
  check('no usa backgroundGradient (taparía el borde)', !('backgroundGradient' in st));
  check('conserva borderWidth y borderColor', typeof st.borderWidth === 'number' && (st.borderWidth as number) > 0 && !!st.borderColor);
  check('tiene fondo traslúcido', typeof st.backgroundColor === 'string' && /rgba/.test(st.backgroundColor as string));
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
