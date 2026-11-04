// ════════════════════════════════════════════════════════════
// THEME — Ónix Profundo × Bronce Metálico
// Vidrio neutro (Liquid Glass) — el bronce vive en el contenido, no en el vidrio
// ════════════════════════════════════════════════════════════
export const C = {
    bg: "#0C0C0C",
    bgDeep: "#080808",
    card: "#161616",
    cardHigh: "#1E1E1E",
    cardBorder: "#2A2A2A",
    shimmer: "#2E2E2E",
    primary: "#B8864B",      // Bronce medio, metal en sombra neutra
    primaryLight: "#E3BC7E", // Donde pega la luz
    primaryDark: "#5E4123",  // Sombra profunda
    primaryGlow: "#FCE1B0",  // Reflejo especular
    accent: "#4CB19F",       // Verde pátina (cobre oxidado)
    accentLight: "#7CD6C6",  // Pátina luminosa
    warning: "#E9A23B",      // Ámbar saturado, se distingue del bronce
    danger: "#E05A47",
    success: "#4CB19F",      // Usando la pátina para connotaciones positivas (ingresos)
    text: "#EFE8DE",         // Blanco cálido neutro
    textPrimary: "#D2A86E",  // Bronce legible para títulos
    textSub: "#9A8B78",
    textMuted: "#6F6253",
    income: "#4CB19F",       // Ingresos ahora en tono pátina contrastante
    expense: "#E05A47",
    separator: "#241A13",    // Separador sutil cobrizo oscuro
    // Material Liquid Glass — usar tal cual, NO concatenar sufijos hex (son rgba)
    glassFill: "rgba(255,255,255,0.055)",
    glassFillNoBlur: "rgba(255,255,255,0.065)", // compensa la falta de blur real en Android
    glassSheen: "rgba(255,255,255,0.03)",
    glassBorder: "rgba(255,255,255,0.09)",
    glassHighlight: "rgba(252,225,176,0.55)",
    glassHighlightSoft: "rgba(252,225,176,0.15)",
    overlayScrim: "#000000AA", // fondo oscurecido detrás de modales/diálogos
} as const;

export const shadow = (color: string, r = 12, op = 0.5) => ({
    shadowColor: color,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: op,
    shadowRadius: r,
    elevation: 8,
});
