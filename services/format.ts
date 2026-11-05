// Formateo de importes unificado. Módulo puro: sin AsyncStorage ni react-native.
// No usa Intl ni toLocaleString (Hermes no los soporta de forma consistente).

// USD se muestra como "$" (igual que el campo de equivalente en Ajustes).
export const CURRENCY_DISPLAY: Record<string, string> = { Q: "Q", USD: "$", EUR: "€", "£": "£" };

export type SignMode = "auto" | "always" | "never";

// Número absoluto con miles separados por coma y punto decimal.
export function formatNumber(n: number, decimals = 2): string {
    const [int, dec] = Math.abs(n).toFixed(decimals).split(".");
    const intFmt = int.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
    return dec !== undefined ? `${intFmt}.${dec}` : intFmt;
}

// "auto": solo '-' si es negativo; "always": '+' / '-'; "never": sin signo.
export function formatMoney(
    n: number,
    currency = "Q",
    opts: { decimals?: number; sign?: SignMode } = {}
): string {
    const decimals = opts.decimals ?? 2;
    const mode = opts.sign ?? "auto";
    const safe = isFinite(n) ? n : 0;
    const r = Number(safe.toFixed(decimals)); // evita "-0.00"
    let sign = "";
    if (mode !== "never") {
        if (r < 0) sign = "-";
        else if (mode === "always" && r > 0) sign = "+";
    }
    return `${sign}${CURRENCY_DISPLAY[currency] ?? currency} ${formatNumber(r, decimals)}`;
}
