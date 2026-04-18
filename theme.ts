// ════════════════════════════════════════════════════════════
// THEME — Grafito Metálico × Cobre Brillante
// ════════════════════════════════════════════════════════════
export const C = {
    bg: "#0C0C0C",
    bgDeep: "#080808",
    card: "#161616",
    cardHigh: "#1E1E1E",
    cardBorder: "#2A2A2A",
    shimmer: "#2E2E2E",
    primary: "#B87333",      // Cobre real neto
    primaryLight: "#E59E6D", // Reflejos claros de cobre
    primaryDark: "#703816",  // Sombras metálicas profundas
    primaryGlow: "#FFC8A3",  // Destello brillante 
    accent: "#4CB19F",       // Verde pátina (cobre oxidado)
    accentLight: "#7CD6C6",  // Pátina luminosa
    warning: "#D4A373",
    danger: "#E05A47",
    success: "#4CB19F",      // Usando la pátina para connotaciones positivas (ingresos)
    text: "#F0E4DB",
    textPrimary: "#D59262",
    textSub: "#8A7969",
    textMuted: "#5A4C40",
    income: "#4CB19F",       // Ingresos ahora en tono pátina contrastante
    expense: "#E05A47",
    separator: "#241A13",    // Separador sutil cobrizo oscuro
} as const;

export const shadow = (color: string, r = 12, op = 0.5) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: op,
    shadowRadius: r,
    elevation: 8,
});
