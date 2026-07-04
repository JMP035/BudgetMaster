import { Transaction, UserSettings } from "./services/storage";
import { EXPENSE_CATEGORIES } from "./categories";
import { SUBSCRIPTIONS_MERCHANTS, normalizeText } from "./services/Categorizer";

// ─────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────
const fmt = (n: number, cur: string) =>
    `${cur} ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

/** @deprecated — usar normalizeText de Categorizer */
function normalize(text: string): string {
    return normalizeText(text);
}

const REALITY = {
    GT: { canasta: 3950, interest: 0.08, card: 0.45, gas: 34.5, label: "Guatemala" },
    US: { canasta: 3200, interest: 0.07, card: 0.22, gas: 4.5,  label: "Global/USA" },
    EU: { canasta: 1800, interest: 0.04, card: 0.18, gas: 1.8,  label: "Europa" },
};

// ─────────────────────────────────────────────────────────────
// PROYECCIÓN DE FLUJO DE CAJA
// ─────────────────────────────────────────────────────────────
function calcCashFlowProjection(transactions: Transaction[], settings: UserSettings) {
    const now = new Date();
    const m = now.getMonth();
    const y = now.getFullYear();
    const daysTotal = new Date(y, m + 1, 0).getDate();
    const daysPassed = now.getDate();

    const monthTx = transactions.filter(t => {
        const d = new Date(t.date);
        return d.getMonth() === m && d.getFullYear() === y;
    });

    const spent   = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const income  = monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const dailyRate  = daysPassed > 0 ? spent / daysPassed : 0;
    const projected  = dailyRate * daysTotal;
    const daysLeft   = daysTotal - daysPassed;
    const safeDaily  = daysLeft > 0 ? (settings.budgetLimit - spent) / daysLeft : 0;

    return { spent, income, dailyRate, projected, daysLeft, daysTotal, daysPassed, safeDaily };
}

// ─────────────────────────────────────────────────────────────
// DETECTOR DE SUSCRIPCIONES
// ─────────────────────────────────────────────────────────────
function detectActiveSubscriptions(transactions: Transaction[]): { name: string; amount: number }[] {
    const found: Map<string, number> = new Map();
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

    const recentExpenses = transactions.filter(t =>
        t.type === "expense" && new Date(t.date) >= threeMonthsAgo
    );

    for (const sub of SUBSCRIPTIONS_MERCHANTS) {
        // Normalizar también la keyword: normalizeText colapsa letras repetidas
        // ("google" → "gogle"), si no, nunca coincidiría con la descripción.
        const keyword = normalizeText(sub.keyword);
        const hits = recentExpenses.filter(t =>
            normalizeText(t.description || "").includes(keyword)
        );
        if (hits.length > 0) {
            const avg = hits.reduce((s, t) => s + t.amount, 0) / hits.length;
            found.set(sub.name, avg);
        }
    }

    return Array.from(found.entries()).map(([name, amount]) => ({ name, amount }));
}

// ─────────────────────────────────────────────────────────────
// PRESUPUESTO BASE CERO (50-30-20)
// ─────────────────────────────────────────────────────────────
function calcZeroBasedBudget(monthlyIncome: number, currency: string) {
    const needs      = monthlyIncome * 0.50;
    const savings    = monthlyIncome * 0.30;
    const lifestyle  = monthlyIncome * 0.20;
    return {
        needs:     fmt(needs, currency),
        savings:   fmt(savings, currency),
        lifestyle: fmt(lifestyle, currency),
        income:    fmt(monthlyIncome, currency),
    };
}

// ─────────────────────────────────────────────────────────────
// RESPUESTA PRINCIPAL CON IA
// ─────────────────────────────────────────────────────────────
export async function getAIResponse(
    message: string,
    transactions: Transaction[],
    settings: UserSettings
): Promise<string> {
    const rawMsg = message;
    const msg    = normalize(message);
    const now    = new Date();
    const m = now.getMonth(), y = now.getFullYear();
    const cur = settings.currency || "Q";

    let context = REALITY.US;
    if (cur === "Q")   context = REALITY.GT;
    if (cur === "EUR") context = REALITY.EU;

    // ── LLAMADA A GEMINI (si hay API Key) ────────────────────
    if (settings.geminiApiKey && settings.geminiApiKey.length > 20) {
        try {
            const { spent, income, projected } = calcCashFlowProjection(transactions, settings);
            const balance = income - spent;
            const prompt = `Eres el ASESOR SMITH — CFO personal experto en finanzas guatemaltecas. Contexto: ${context.label}. Período actual: Gastos=${fmt(spent, cur)}, Ingresos=${fmt(income, cur)}, Saldo libre=${fmt(balance, cur)}, Proyección fin de mes=${fmt(projected, cur)}, Presupuesto=${fmt(settings.budgetLimit, cur)}. Ingreso mensual declarado=${fmt(settings.monthlyIncome || 0, cur)}. Responde de forma directa, sobria y sin emojis. Responde a: "${rawMsg}"`;
            const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${settings.geminiApiKey}`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            const data = await res.json();
            if (!data.error && data.candidates) return data.candidates[0].content.parts[0].text.replace(/\*\*/g, "");
        } catch (e) {}
    }

    // ── FALLBACK LOCAL ────────────────────────────────────────
    const monthTx   = transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === m && d.getFullYear() === y; });
    const spent     = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const income    = monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const budgetLeft= settings.budgetLimit - spent;
    const topCat    = EXPENSE_CATEGORIES
        .map(c => ({ label: c.label, total: monthTx.filter(t => t.type === "expense" && t.category === c.id).reduce((s, t) => s + t.amount, 0) }))
        .sort((a, b) => b.total - a.total)[0];

    const projection = calcCashFlowProjection(transactions, settings);

    // Detector de montos y tiempos en el mensaje
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
        if (timeMatch[2].includes("ano"))    months *= 12;
        if (timeMatch[2].includes("semana")) months = Math.ceil(months / 4);
    }

    // ── PRIORIDAD 0: Proyección de flujo de caja ─────────────
    if (msg.match(/proyeccion|flujo|ritmo|velocidad|al final|fin de mes|cuanto gasto|cuanto voy a gastar/)) {
        const pct = settings.budgetLimit > 0 ? Math.round((spent / settings.budgetLimit) * 100) : 0;
        const status = projection.projected > settings.budgetLimit
            ? `ALERTA: Se proyecta EXCEDER el presupuesto en ${fmt(projection.projected - settings.budgetLimit, cur)}.`
            : `Va en camino de mantenerse DENTRO del presupuesto.`;
        return `Proyección de Flujo de Caja:
Gastos actuales: ${fmt(spent, cur)} (${pct}% del presupuesto)
Ritmo diario: ${fmt(projection.dailyRate, cur)}/día
Proyección fin de mes: ${fmt(projection.projected, cur)}
Presupuesto: ${fmt(settings.budgetLimit, cur)}
${status}
Gasto seguro diario restante: ${fmt(projection.safeDaily, cur)}/día por ${projection.daysLeft} días.`;
    }

    // ── PRIORIDAD 0: Presupuesto Base Cero ───────────────────
    if (msg.match(/base cero|50.30.20|50 30 20|como divido|dividir|presupuesto ideal|plan base|distribucion/)) {
        const inc = settings.monthlyIncome || income || settings.budgetLimit;
        if (inc <= 0) return `Para calcular el presupuesto base cero, primero configura tu ingreso mensual en Ajustes. La fórmula 50-30-20 distribuirá tu sueldo de forma óptima.`;
        const zbb = calcZeroBasedBudget(inc, cur);
        return `Plan Presupuesto Base Cero (50-30-20) para ingresos de ${zbb.income}:

50% — Necesidades básicas (renta, servicios, alimentación):
  ${zbb.needs}

30% — Ahorro e inversión (fondo de emergencia, metas activas):
  ${zbb.savings}

20% — Estilo de vida / Pago de deudas (entretenimiento, deseos):
  ${zbb.lifestyle}

Este es el plan de distribución ideal según tu ingreso declarado.`;
    }

    // ── PRIORIDAD 0: Suscripciones activas ───────────────────
    if (msg.match(/suscripcion|subscripcion|streaming|netflix|spotify|servicios digitales|cuanto pago en suscripcion|mis suscripciones/)) {
        const subs = detectActiveSubscriptions(transactions);
        if (subs.length === 0) {
            return `No detecté suscripciones recurrentes en tus últimas transacciones. Si tienes Netflix, Spotify u otros servicios, asegúrate de que estén registrados con las palabras clave correctas.`;
        }
        const total = subs.reduce((s, sub) => s + sub.amount, 0);
        const annual = total * 12;
        const lines  = subs.map(s => `  · ${s.name}: ${fmt(s.amount, cur)}/mes`).join("\n");
        return `Suscripciones activas detectadas:
${lines}

Total mensual: ${fmt(total, cur)}
Costo anual estimado: ${fmt(annual, cur)}

¿Alguna de estas no la usás activamente? Cancelarla te ahorraría ${fmt(total / subs.length, cur)}/mes en promedio.`;
    }

    // ── PRIORIDAD 1: Sabiduría de Pensadores ─────────────────
    if (msg.includes("napoleon") || msg.includes("hil") || msg.includes("piense") || msg.includes("haga") || msg.includes("rico")) {
        return `Asesoría Napoleon Hill: El éxito financiero comienza con la autodisciplina. Según sus principios, sus ${fmt(budgetLeft, cur)} actuales requieren que defina un propósito claro. Sin un plan mental, el capital se diluye ante los impulsos.`;
    }
    if (msg.includes("kiyosaki") || msg.includes("rata") || msg.includes("padre") || msg.includes("pasivo") || msg.includes("activo")) {
        return `Análisis Kiyosaki: Usted se encuentra en la Carrera de la Rata si sus gastos siguen enfocados en pasivos. Los ${fmt(budgetLeft, cur)} restantes en su cuenta son capital para adquirir activos que generen flujo de caja.`;
    }
    if (msg.includes("babilonia") || msg.includes("pagat") || msg.includes("diezmo")) {
        return `Principio de Babilonia: Se debe conservar al menos el 10% de lo ganado. En su caso, debería separar ${fmt(settings.budgetLimit * 0.1, cur)} inmediatamente para su fondo de riqueza personal.`;
    }

    // ── PRIORIDAD 1.5: Combustible / Estaciones de Servicio ──
    if (msg.includes("est de serv") || msg.includes("estacion de servicio") || msg.includes("gasolinera") || msg.includes("shell") || msg.includes("puma") || msg.includes("texaco") || msg.includes("combustible")) {
        return `Asesoría de Combustible: "Est. de Serv." o "Estación de Servicio" se refiere a tus consumos de combustible (como gasolineras Shell, Puma o Texaco). BudgetMaster los clasifica automáticamente bajo la categoría "Combustible". Te sugiero presupuestar este gasto mensualmente para evitar sorpresas.`;
    }

    // ── PRIORIDAD 2: Metas de Ahorro y Compras ───────────────
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
        if (amount > budgetLeft) return `Advertencia: El gasto de ${fmt(amount, cur)} excede su presupuesto disponible de ${fmt(budgetLeft, cur)}. No es recomendable en este momento.`;
        return `Validación de Compra: Dispone de ${fmt(budgetLeft, cur)}. La compra de ${fmt(amount, cur)} es posible, pero reducirá su margen de maniobra.`;
    }

    // ── PRIORIDAD 3: Reportes y Saludos ──────────────────────
    if (msg.match(/(voy|como|va|resumen|situacion|estado|analiza|reporte)/)) {
        const pct = settings.budgetLimit > 0 ? (spent / settings.budgetLimit) * 100 : 0;
        return `Reporte Financiero:
Presupuesto utilizado: ${pct.toFixed(1)}%.
Categoría de mayor impacto: ${topCat?.label || "General"}.
Saldo actual libre: ${fmt(budgetLeft, cur)}.
Proyección fin de mes: ${fmt(projection.projected, cur)}.`;
    }

    if (msg.match(/(hola|buenos|dias|tardes|noches|smit|smith)/)) return `Bienvenido al sistema de asesoría, Sr. ${settings.userName}. ¿Desea que planifiquemos una meta de ahorro, revisemos su proyección de flujo de caja o veamos sus suscripciones activas?`;
    if (msg.match(/(gracias|ok|entendido)/)) return `La disciplina financiera es fundamental. Quedo a su disposición.`;

    return `Entendido. Mi análisis sugiere que podemos optimizar su flujo de ${fmt(budgetLeft, cur)} revisando sus gastos en ${topCat?.label || "general"}. Puede preguntarme por su proyección de fin de mes, plan base cero o suscripciones activas.`;
}

// ─────────────────────────────────────────────────────────────
// DETECCIÓN DE BANCO (para SmsService y otros)
// ─────────────────────────────────────────────────────────────
export function detectBankName(text: string): string {
    // Coincidencia por palabra completa: con includes(), "BI" coincidía con
    // "reciBIda" y "BAC" con palabras que lo contienen, etiquetando mal el banco.
    const t = text.toUpperCase();
    const banks = ["BANRURAL", "BAC", "BAMER", "BI", "INDUSTRIAL", "GYT", "CONTINENTAL", "PROMERICA", "BANTRAB", "CHASE", "BOFA", "SANTANDER", "BBVA", "CITI"];
    for (const b of banks) {
        if (new RegExp(`\\b${b}\\b`).test(t)) return b;
    }
    return "Banco";
}
