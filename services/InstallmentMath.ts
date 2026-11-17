// Cálculo del número de cuotas de una visacuota (módulo PURO: sin react-native ni AsyncStorage).

/** Tolerancia: el cociente total/cuota puede salir "casi entero" porque el banco redondea la cuota. */
const NEAR_INTEGER_TOLERANCE = 0.05;

/**
 * Número de cuotas que sugiere el monto total y la cuota mensual.
 *
 * La cuota mensual casi siempre viene redondeada (1,000 / 12 = 83.33), así que total/cuota rara vez
 * da un entero exacto (1000 / 83.33 = 12.0005). Con `Math.ceil` eso daba SIEMPRE una cuota de más (13).
 * Regla: si el cociente está a menos del 5 % de una cuota de un entero, se toma ese entero; si no
 * (por ejemplo 1000 / 300 = 3.33), se redondea hacia arriba porque la última cuota sale menor.
 * Devuelve 0 si falta un dato válido.
 */
export function suggestInstallmentCount(total: number, monthly: number): number {
  if (!(total > 0) || !(monthly > 0) || !isFinite(total) || !isFinite(monthly)) return 0;
  const ratio = total / monthly;
  const nearest = Math.round(ratio);
  if (nearest >= 1 && Math.abs(ratio - nearest) <= NEAR_INTEGER_TOLERANCE) return nearest;
  return Math.max(1, Math.ceil(ratio));
}
