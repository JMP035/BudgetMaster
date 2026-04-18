import { Transaction, UserSettings } from "./services/storage";
import { EXPENSE_CATEGORIES } from "./categories";

const fmt = (n: number, cur: string) =>
    `${cur} ${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;

export async function getAIResponse(
    message: string,
    transactions: Transaction[],
    settings: UserSettings
): Promise<string> {
    const msg = message.toLowerCase().trim();
    const now = new Date();
    const m = now.getMonth(), y = now.getFullYear();

    const monthTx = transactions.filter(t => { const d = new Date(t.date); return d.getMonth() === m && d.getFullYear() === y; });
    const spent = monthTx.filter(t => t.type === "expense").reduce((s, t) => s + t.amount, 0);
    const income = monthTx.filter(t => t.type === "income").reduce((s, t) => s + t.amount, 0);
    const balance = income - spent;
    const savingsRate = income > 0 ? (balance / income) * 100 : 0;
    const cur = settings.currency;
    const budgetLeft = settings.budgetLimit - spent;

    // Si el usuario proporcionó su API Key, usamos la verdadera inteligencia de Gemini
    if (settings.geminiApiKey && settings.geminiApiKey.length > 20) {
        try {
            const prompt = `
Eres el ASESOR FINANCIERO ELITE de ${settings.userName} para la aplicación BudgetMaster.
TU MISIÓN: Ayudar al usuario a alcanzar la libertad financiera mediante planes de ahorro agresivos y control de gastos inteligente.

PAUTAS DE COMPORTAMIENTO:
1. TONO: Profesional, directo, motivador pero firme (como un asesor de banca privada suiza).
2. ENFOQUE: Siempre prioriza el AHORRO. Si el usuario pregunta por gastar, evalúa el impacto real en su presupuesto mensual.
3. CONTEXTO LOCAL: Estás configurado para el mercado de GUATEMALA.
4. BREVEDAD: Máximo 3-4 oraciones muy claras. 
5. FORMATO: Usa lenguaje natural. NUNCA uses negritas (**), solo texto plano o emojis.

DATOS ACTUALES (${now.toLocaleDateString("es-GT")}):
- Presupuesto mensual: ${fmt(settings.budgetLimit, cur)}
- Ingresos: ${fmt(income, cur)}
- Gastos: ${fmt(spent, cur)}
- Saldo Disponible: ${fmt(balance, cur)}
- Tasa de Ahorro: ${savingsRate.toFixed(2)}%

Si el usuario te pregunta por compras (ej: "¿Puedo comprar un celular?"), calcula cuánto le quedará de "Saldo Disponible" después de ese gasto y adviértele si su tasa de ahorro bajará de forma alarmante. Si pregunta por planes de ahorro, propón métodos como el 50/30/20 o metas a corto plazo.

Pregunta del usuario: "${message}"
Respuesta del Asesor Elite:`;

            let targetModel = "gemini-1.0-pro"; // Modelo 1.0 estable sugerido por el usuario

            let res = await fetch(`https://generativelanguage.googleapis.com/v1/models/${targetModel}:generateContent?key=${settings.geminiApiKey}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
            });
            let data = await res.json();

            // Si falla el 1.0, intentamos el 1.5 en silencio
            if (data.error) {
                targetModel = "gemini-1.5-flash";
                res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${targetModel}:generateContent?key=${settings.geminiApiKey}`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
                });
                data = await res.json();
            }

            // Especial: Si nos rechaza y dice 'Model Not Found', consultaremos a la propia Google, directamente desde la app, qué modelos SI tienes habilitados.
            if (data.error && data.error.code === 404 && data.error.message.includes("not found")) {
                try {
                    const listRes = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${settings.geminiApiKey}`);
                    const listData = await listRes.json();
                    if (listData.models) {
                        const modelsArray = listData.models.map((m: any) => m.name.replace("models/", ""));
                        // Si encontramos uno válido como pro o flash, se lo decimos.
                        const recs = modelsArray.filter((n: string) => n.includes("gemini"));
                        return `🕵️‍♂️ **INFO DIAGNÓSTICO:** Google rechazó el modelo estándar.\n\nHe consultado tu llave y estos son los nombres exactos que tu cuenta SÍ soporta:\n\n` + recs.join("\n") + `\n\nPor favor, dime cuál ves en esta lista para que yo la deje fija internamente.`;
                    }
                } catch (e) {}
            }

            if (data.error) return "Error de la API de Google: " + data.error.message;
            if (data.candidates && data.candidates[0].content) {
                return data.candidates[0].content.parts[0].text.replace(/\*\*/g, "");
            }
            return "No recibí respuesta de los servidores neuronales. Intenta de nuevo.";
        } catch (e) {
            return "Hubo un error contactando a la Inteligencia Artificial. Revisa tu conexión a internet.";
        }
    }

    // --- FALLBACK: IA LOCAL BASADA EN REGLAS SINTACTICAS (Si no hay API Key) ---

    const catTotals = EXPENSE_CATEGORIES.map(c => ({
        label: c.label,
        total: monthTx.filter(t => t.type === "expense" && t.category === c.id).reduce((s, t) => s + t.amount, 0),
    })).filter(c => c.total > 0).sort((a, b) => b.total - a.total);
    const top = catTotals[0];

    const buyRegex = /(comprar|compro|gastar|gasto|zapatos|pantalón|camisa|celular|salida)[\s\S]*?(\d+)/;
    const buyMatch = msg.match(buyRegex) || msg.match(/(\d+)[\s\S]*?(comprar|gastar)/);
    if (buyMatch || msg.includes("comprar") || msg.includes("compro")) {
        const numMatch = msg.match(/\d+/);
        if (numMatch) {
            const amount = parseFloat(numMatch[0]);
            if (amount <= budgetLeft) {
                return `✅ Tienes disponible ${cur} ${budgetLeft.toFixed(2)} en presupuesto. Permite gasto de ${amount}. Reducirá tu ahorro. ¿Es necesario?`;
            } else {
                return `❌ No lo recomiendo. Tu presupuesto restante es solo ${cur} ${budgetLeft.toFixed(2)}, la compra de ${amount} te deja en negativo.`;
            }
        } else {
            return `¿De cuánto dinero hablamos? 🤔 Si me dices el monto (ej. "quiero gastar unos 500"), evaluaré si puedes.`;
        }
    }

    if (msg.match(/(voy|estoy|como va)/)) {
        if (!transactions.length) return `Aún no tienes transacciones.`;
        if (savingsRate >= 20) return `🌟 ¡Excelente! Ahorras el ${savingsRate.toFixed(1)}% este mes. ¡Vas muy bien!`;
        if (savingsRate >= 0) return `😐 Equilibrio justo. Solo ahorras el ${savingsRate.toFixed(1)}%. Gastos: ${fmt(spent, cur)}. Reduce en ${top?.label ?? "gastos hormiga"}.`;
        return `⚠️ ¡Atención! Déficit de ${fmt(-balance, cur)}. Tus gastos superan tus ingresos.`;
    }

    if (msg.match(/(mayor gasto|gasto mas|categoría)/)) {
        if (!top) return "No hay gastos registrados aún este mes.";
        return `Tu agujero financiero es "${top.label}" con ${fmt(top.total, cur)}.`;
    }

    if (msg.match(/(consejo|mejorar|ahorrar|tip)/)) {
        return `💡 Regla de oro: Espera 48 hrs antes de una compra grande. Si tienes presupuesto, cómpralo en frío y no por impulso.`;
    }

    return `(Modo Local Básico Activo) No puedo entender oraciones complejas sin tu Gemni API Key. Te recomiendo colocarla en "Ajustes", o usar frases cortas como "¿Cómo voy?".`;
}

// Helper para reconocer bancos de Guatemala en SMS
export function detectBankName(text: string): string {
    const t = text.toUpperCase();
    if (t.includes("BANRURAL")) return "Banrural";
    if (t.includes("BAC") || t.includes("BAMER")) return "BAC Bank";
    if (t.includes("BI") || t.includes("INDUSTRIAL")) return "Banco Industrial";
    if (t.includes("G&T") || t.includes("CONTINENTAL")) return "G&T Continental";
    if (t.includes("PROMERICA")) return "Banco Promerica";
    if (t.includes("BANTRAB")) return "Bantrab";
    if (t.includes("CHIT") || t.includes("INTERCAP")) return "Intercap";
    return "Banco Desconocido";
}
