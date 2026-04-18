import { Transaction, UserSettings } from "./services/storage";
import { EXPENSE_CATEGORIES } from "./categories";

const fmt = (n: number, cur: string) =>
    `${cur} ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

function normalize(text: string): string {
    return text.toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
        .replace(/[^a-z0-9\s]/g, "") 
        .replace(/(.)\1+/g, "$1"); 
}

const REALITY = {
    GT: { canasta: 3950, interest: 0.08, card: 0.45, gas: 34.5, label: "Guatemala" },
    US: { canasta: 3200, interest: 0.07, card: 0.22, gas: 4.5, label: "Global/USA" },
    EU: { canasta: 1800, interest: 0.04, card: 0.18, gas: 1.8, label: "Europa" },
};

export async function getAIResponse(
    message: string,
    transactions: Transaction[],
    settings: UserSettings
): Promise<string> {
    const rawMsg = message;
    const msg = normalize(message); 
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    const cur = settings.currency;

    let context = REALITY.US;
    if (cur === "Q") context = REALITY.GT;
    if (cur === "€") context = REALITY.EU;

    if (settings.geminiApiKey && settings.geminiApiKey.length > 20) {
        try {
            const monthTx_api = transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === m && d.getFullYear() === y; });
            const spent_api = monthTx_api.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
            const income_api = monthTx_api.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
            const balance_api = income_api - spent_api;
            const prompt = `Eres el ASESOR SMITH. Maestros: Napoleon Hill, Kiyosaki, Ramsey. Contexto: ${context.label}. Saldo: ${fmt(balance_api, cur)}. Responde de forma sobria, profesional y sin usar emojis. Responde a: "${rawMsg}"`;
            let res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${settings.geminiApiKey}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            let data = await res.json();
            if (!data.error && data.candidates) return data.candidates[0].content.parts[0].text.replace(/\*\*/g, "");
        } catch (e) {}
    }

    const monthTx = transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === m && d.getFullYear() === y; });
    const spent = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const budgetLeft = settings.budgetLimit - spent;
    const topCat = EXPENSE_CATEGORIES.map(c => ({ label: c.label, total: monthTx.filter(t => t.type === "expense" && t.category === c.id).reduce((s, t) => s + t.amount, 0) })).sort((a,b)=>b.total-a.total)[0];

    // Detector de Montos y Tiempos
    let amount = 0;
    const numMatch = rawMsg.match(/(\d+[\d,.]*)/);
    if (numMatch) {
        amount = parseFloat(numMatch[0].replace(/,/g, ""));
        if (msg.includes("milon")) amount *= 1000000;
        if (msg.includes("mil") || msg.includes(" k ")) amount *= 1000;
    }

    let months = 1;
    const timeMatch = rawMsg.match(/(\d+)\s*(mes|mess|ano|semana)/);
    if (timeMatch) {
        months = parseInt(timeMatch[1]);
        if (timeMatch[2].includes("ano")) months *= 12;
        if (timeMatch[2].includes("semana")) months = Math.ceil(months / 4);
    }

    // PRIORIDAD 1: Sabiduría de Pensadores
    if (msg.includes("napoleon") || msg.includes("hil") || msg.includes("piense") || msg.includes("haga") || msg.includes("rico")) {
        return `Asesoría Napoleon Hill: El éxito financiero comienza con la autodisciplina. Según sus principios, sus ${fmt(budgetLeft, cur)} actuales requieren que defina un propósito claro. Sin un plan mental, el capital se diluye ante los impulsos.`;
    }
    if (msg.includes("kiyosaki") || msg.includes("rata") || msg.includes("padre") || msg.includes("pasivo") || msg.includes("activo")) {
        return `Análisis Kiyosaki: Usted se encuentra en la Carrera de la Rata si sus gastos siguen enfocados en pasivos. Los ${fmt(budgetLeft, cur)} restantes en su cuenta son capital para adquirir activos que generen flujo de caja.`;
    }
    if (msg.includes("babilonia") || msg.includes("pagat") || msg.includes("diezmo")) {
        return `Principio de Babilonia: Se debe conservar al menos el 10% de lo ganado. En su caso, debería separar ${fmt(settings.budgetLimit * 0.1, cur)} inmediatamente para su fondo de riqueza personal.`;
    }

    // PRIORIDAD 2: Metas de Ahorro y Compras (Lógica Dinámica)
    if (amount > 0 && months >= 1 && (msg.includes("ahoro") || msg.includes("meta") || msg.includes("tener") || msg.includes("lograr"))) {
        const mensual = amount / months;
        const viabilidad = mensual <= budgetLeft ? "ALCANZABLE con su saldo actual" : "EXCEDE su capacidad actual";
        return `Plan Maestro de Ahorro: 
Para alcanzar la meta de ${fmt(amount, cur)} en ${months} meses:
- Cuota Mensual: ${fmt(mensual, cur)}
- Cuota Semanal: ${fmt(mensual / 4, cur)}
Estado: Esta meta es ${viabilidad}. Le recomiendo recortar en la categoría ${topCat?.label} para asegurar el éxito.`;
    }

    if (amount > 0 && (msg.includes("casa") || msg.includes("terreno") || msg.includes("vivienda"))) {
        const eng = amount * 0.20;
        return `Análisis de Propiedad: Para un inmueble de ${fmt(amount, cur)}, el enganche sugerido es de ${fmt(eng, cur)}. Actualmente su liquidez es de ${fmt(budgetLeft, cur)}. Sugerimos un plan a 24 meses.`;
    }

    if (amount > 0 && (msg.includes("caro") || msg.includes("auto") || msg.includes("comprar"))) {
        if (amount > budgetLeft) return `Advertencia: El gasto de ${fmt(amount, cur)} para este vehículo excede su presupuesto disponible de ${fmt(budgetLeft, cur)}. No es recomendable en este momento.`;
        return `Validación de Compra: Dispone de ${fmt(budgetLeft, cur)}. La compra de ${fmt(amount, cur)} es posible, pero reducirá su margen de maniobra.`;
    }

    // PRIORIDAD 3: Reportes y Saludos
    if (msg.match(/(voy|como|va|resumen|situacion|estado|analiza|reporte)/)) {
        const pct = (spent/settings.budgetLimit)*100;
        return `Reporte Financiero: 
Presupuesto utilizado: ${pct.toFixed(1)}%. 
Categoría de mayor impacto: ${topCat?.label || "General"}. 
Saldo actual libre: ${fmt(budgetLeft, cur)}.`;
    }

    if (msg.match(/(hola|buenos|dias|tardes|noches|smit|smith)/)) return `Bienvenido al sistema de asesoría, Sr. ${settings.userName}. ¿Desea que planifiquemos una meta de ahorro o revisemos sus activos hoy?`;
    if (msg.match(/(gracias|ok|entendido)/)) return `La disciplina financiera es fundamental. Quedo a su disposición.`;

    return `Entendido. Mi análisis sugiere que podemos optimizar su flujo de ${fmt(budgetLeft, cur)} revisando sus gastos en ${topCat?.label || "general"}. ¿En qué más puedo ayudarle?`;
}

export function detectBankName(text: string): string {
    const t = normalize(text).toUpperCase();
    const banks = ["BANRURAL", "BAC", "BAMER", "BI", "INDUSTRIAL", "GYT", "CONTINENTAL", "PROMERICA", "BANTRAB", "CHASE", "BOFA", "SANTANDER", "BBVA", "CITI"];
    for (const b of banks) { if (t.includes(b)) return b; }
    return "Banco";
}
