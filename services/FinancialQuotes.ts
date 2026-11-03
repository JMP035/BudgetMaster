// ─────────────────────────────────────────────────────────────
// FRASES DE PENSADORES — compartidas entre NotificationService
// y el motor local del Asesor IA (LocalAdvisorEngine)
// ─────────────────────────────────────────────────────────────
export const QUOTES = {
    discipline: [
        '"La autodisciplina es el puente entre las metas y los logros." — Napoleon Hill',
        '"Págate a ti mismo primero." — El Hombre Más Rico de Babilonia',
        '"Un presupuesto no te dice que no puedes gastar. Te dice dónde gastar." — Dave Ramsey',
        '"La libertad financiera no es un sueño. Es una decisión." — Napoleon Hill',
    ],
    warning: [
        '"Los pobres gastan primero y ahorran lo que sobra. Los ricos ahorran primero." — Kiyosaki',
        '"No es cuánto ganas, sino cuánto guardas." — Warren Buffett',
        '"El precio de todo es la cantidad de vida que das a cambio." — Thoreau',
        '"Una deuda sin plan es una cadena invisible." — Dave Ramsey',
    ],
    critical: [
        '"Si no encuentras la manera de ganar dinero mientras duermes, trabajarás hasta que mueras." — Kiyosaki',
        '"El que no controla su dinero, es controlado por su falta de él." — Ramsey',
        '"No es el salario lo que hace rico a un hombre, son sus hábitos de gasto." — Keyes',
        '"Tu futuro se crea por lo que haces hoy, no mañana." — Robert Kiyosaki',
    ],
    positive: [
        '"El éxito es la suma de pequeños esfuerzos repetidos día tras día." — Robert Collier',
        '"La riqueza no es un accidente. Es el resultado de decisiones correctas." — Napoleon Hill',
        '"Cada peso que ahorras hoy es un soldado trabajando para tu libertad mañana." — Kiyosaki',
    ],
};

export type QuoteTone = keyof typeof QUOTES;

export function randomQuote(type: QuoteTone): string {
    const arr = QUOTES[type];
    return arr[Math.floor(Math.random() * arr.length)];
}

/** Frase determinista para el día dado: la misma todo el día, cambia día a día. */
export function dailyQuote(type: QuoteTone, date: Date = new Date()): string {
    const arr = QUOTES[type];
    const dayOfYear = Math.floor((date.getTime() - new Date(date.getFullYear(), 0, 0).getTime()) / 86400000);
    return arr[dayOfYear % arr.length];
}
