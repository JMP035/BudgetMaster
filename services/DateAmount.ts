// Utilidades puras de monto y fecha (sin AsyncStorage ni react-native) para poder
// importarlas desde módulos de servicio verificables con sucrase-node. storage.ts las reexporta.

/**
 * Parsea un monto ingresado por el usuario con separadores de miles/decimales
 * ambiguos (convención de Guatemala: tanto "," como "." pueden ser decimal o
 * de miles según el contexto). Devuelve NaN si no se puede interpretar.
 */
export function parseAmount(input: string): number {
  let s = input.trim().replace(/\s/g, "");
  if (!s) return NaN;

  const hasComma = s.includes(",");
  const hasDot = s.includes(".");

  if (hasComma && hasDot) {
    // El separador que aparece último es el decimal.
    const lastComma = s.lastIndexOf(",");
    const lastDot = s.lastIndexOf(".");
    if (lastComma > lastDot) {
      s = s.replace(/\./g, "").replace(",", ".");
    } else {
      s = s.replace(/,/g, "");
    }
  } else if (hasComma) {
    const commaCount = (s.match(/,/g) || []).length;
    if (commaCount > 1 || /^\d{1,3},\d{3}$/.test(s)) {
      s = s.replace(/,/g, "");
    } else {
      s = s.replace(",", ".");
    }
  } else if (hasDot) {
    const dotCount = (s.match(/\./g) || []).length;
    if (dotCount > 1) {
      s = s.replace(/\./g, "");
    }
  }

  return /^\d+(\.\d+)?$/.test(s) ? Number(s) : NaN;
}

/** Formatea una fecha (solo año-mes-día, sin hora) como "YYYY-MM-DD" en horario local */
export function formatDateOnly(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Parsea una cadena "YYYY-MM-DD" a un Date al mediodía local. Devuelve null si no es válida. */
export function parseDateOnly(s: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
  if (!match) return null;
  const y = Number(match[1]);
  const m = Number(match[2]);
  const d = Number(match[3]);
  const date = new Date(y, m - 1, d, 12, 0, 0);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}
