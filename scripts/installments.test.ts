// Pruebas del cálculo de cuotas de una visacuota (services/InstallmentMath.ts). Sin dependencias:
//   npm run test:installments   →   sucrase-node scripts/installments.test.ts

import { suggestInstallmentCount } from '../services/InstallmentMath';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

function eq(name: string, total: number, monthly: number, expected: number): void {
  const got = suggestInstallmentCount(total, monthly);
  check(`${total} / ${monthly} → ${expected}`, got === expected, `se obtuvo ${got}`);
}

// Caso reportado: la cuota redondeada hacía sumar una cuota de más
eq('caso real Pricesmart', 1014.75, 84.5, 12);
eq('1000 en 12 cuotas de 83.33', 1000, 83.33, 12);
eq('1000 en 12 cuotas de 83.34', 1000, 83.34, 12);
eq('1000 en 6 cuotas de 166.67', 1000, 166.67, 6);
eq('1000 en 3 cuotas de 333.33', 1000, 333.33, 3);
eq('5000 en 24 cuotas de 208.33', 5000, 208.33, 24);
eq('9999.99 en 36 cuotas de 277.78', 9999.99, 277.78, 36);

// Cocientes exactos
eq('1200 / 100', 1200, 100, 12);
eq('360 / 10', 360, 10, 36);
eq('500 / 500', 500, 500, 1);
eq('84.5 * 12 / 84.5', 84.5 * 12, 84.5, 12);

// Cuota que no divide: la última cuota sale menor, se redondea hacia arriba
eq('1000 / 300', 1000, 300, 4);
eq('1000 / 99', 1000, 99, 11);
eq('1000 / 98', 1000, 98, 11);
eq('100 / 30', 100, 30, 4);
eq('250 / 100', 250, 100, 3);

// Borde de la tolerancia (5 % de una cuota)
eq('10.04 cuotas', 1004, 100, 10);
eq('10.06 cuotas', 1006, 100, 11);

// Menos de una cuota
eq('cuota mayor que el total', 50, 100, 1);
eq('0.98 cuotas', 98, 100, 1);

// Datos inválidos
eq('total cero', 0, 100, 0);
eq('cuota cero', 100, 0, 0);
eq('total negativo', -5, 10, 0);
eq('cuota negativa', 100, -10, 0);
eq('NaN', NaN, 10, 0);
eq('Infinity', Infinity, 10, 0);

// Nunca devuelve menos de 1 con datos válidos
for (const [t, m] of [[0.01, 1000], [1, 1e9], [5, 5.0001]] as [number, number][]) {
  check(`mínimo 1 con ${t}/${m}`, suggestInstallmentCount(t, m) >= 1);
}

// Recorrido de plazos comunes con cuota redondeada a centavos: nunca una cuota de más
for (const n of [3, 6, 9, 12, 18, 24, 36, 48]) {
  for (const total of [500, 1000, 1014.75, 2499.99, 4800, 10000, 15750.5]) {
    const monthly = Math.round((total / n) * 100) / 100;
    check(`${total} en ${n} cuotas (cuota ${monthly})`, suggestInstallmentCount(total, monthly) === n,
      `se obtuvo ${suggestInstallmentCount(total, monthly)}`);
  }
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
process.exit(failures === 0 ? 0 : 1);
