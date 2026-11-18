// Cliente de red de Gemini (único módulo del asistente que usa `fetch`).
//  - `createGeminiTransport(apiKey)`: transporte para el ciclo con herramientas (assistant/GeminiTools.ts).
//  - `requestGemini` / `requestGeminiSafe` / `callGemini`: chat sin herramientas, copiados tal cual de
//    components/AIAdvisor.tsx (respaldo cuando el ciclo con herramientas falla con bad_request).
import { GeminiHttpError } from "./assistant/GeminiTools";
import type { GeminiTransport } from "./assistant/GeminiTools";

export const GEMINI_MODEL = "gemini-2.5-flash";
// Holgado: en los modelos 2.5 el "thinking" comparte este presupuesto con la respuesta visible.
export const GEMINI_MAX_OUTPUT_TOKENS = 2048;
// Continuaciones automáticas máximas cuando la respuesta se corta por MAX_TOKENS.
export const GEMINI_MAX_CONTINUATIONS = 2;
export const GEMINI_TIMEOUT_MS = 14000;
export const CONTINUE_PROMPT = "Continúa exactamente donde quedaste, sin repetir lo anterior ni saludar.";

export interface GeminiMessage {
    role: "user" | "model";
    parts: { text: string }[];
}

export interface GeminiChunk {
    text: string;
    finishReason?: string;
}

/** thinkingBudget: 0 solo es válido en la familia flash (2.5-pro no permite desactivarlo). */
function supportsThinkingOff(model: string): boolean {
    return /^gemini-2\.5-flash/.test(model);
}

const endpoint = (apiKey: string): string =>
    `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent?key=${apiKey}`;

// ─────────────────────────────────────────────────────────────
// TRANSPORTE PARA EL CICLO CON HERRAMIENTAS
// ─────────────────────────────────────────────────────────────

/**
 * Transporte para `runGeminiTurn`: POST generateContent con timeout de 14 s. Devuelve el JSON crudo.
 * Lanza `GeminiHttpError(status)` si la API responde con error, `GeminiHttpError(408)` si se agota el tiempo
 * (AbortError) y `GeminiHttpError(0)` si no hay red.
 */
export function createGeminiTransport(apiKey: string): GeminiTransport {
    const key = apiKey.trim();
    return async (body, opts) => {
        const payload: Record<string, unknown> = { ...(body as Record<string, unknown>) };
        if (opts.disableThinking && supportsThinkingOff(GEMINI_MODEL)) {
            const gc = (payload.generationConfig && typeof payload.generationConfig === "object")
                ? (payload.generationConfig as Record<string, unknown>) : {};
            payload.generationConfig = { ...gc, thinkingConfig: { thinkingBudget: 0 } };
        }
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
        const fail = (e: any): GeminiHttpError => new GeminiHttpError(e?.name === "AbortError" ? 408 : 0);
        try {
            let res: Response;
            try {
                res = await fetch(endpoint(key), {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(payload),
                    signal: controller.signal,
                });
            } catch (e) {
                throw fail(e);
            }
            if (!res.ok) throw new GeminiHttpError(res.status);
            try {
                return await res.json();
            } catch (e) {
                throw fail(e);
            }
        } finally {
            clearTimeout(timeoutId);
        }
    };
}

// ─────────────────────────────────────────────────────────────
// CHAT SIN HERRAMIENTAS (copiado de AIAdvisor.tsx, comportamiento sin cambios)
// ─────────────────────────────────────────────────────────────

/** Una sola petición a Gemini con timeout propio. Devuelve texto (todas las parts) y finishReason. */
export async function requestGemini(
    messages: GeminiMessage[],
    apiKey: string,
    disableThinking: boolean,
): Promise<GeminiChunk> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);
    try {
        const generationConfig: Record<string, unknown> = {
            maxOutputTokens: GEMINI_MAX_OUTPUT_TOKENS,
            temperature: 0.7,
            topP: 0.9,
        };
        if (disableThinking) generationConfig.thinkingConfig = { thinkingBudget: 0 };

        const res = await fetch(
            endpoint(apiKey),
            {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contents: messages, generationConfig }),
                signal: controller.signal,
            }
        );
        if (!res.ok) throw new GeminiHttpError(res.status);   // mensaje: «Gemini error: <status>»

        const data = await res.json();
        const candidate = data?.candidates?.[0];
        const parts: any[] = candidate?.content?.parts ?? [];
        // Concatenar TODAS las partes de texto (ignorando las de "thought" si vinieran)
        const text = parts
            .filter(p => typeof p?.text === "string" && !p?.thought)
            .map(p => p.text)
            .join("");
        return { text, finishReason: candidate?.finishReason };
    } finally {
        clearTimeout(timeoutId);
    }
}

/** Petición con thinking desactivado (si el modelo lo soporta); si la API responde 400, reintenta sin ese campo. */
export async function requestGeminiSafe(messages: GeminiMessage[], apiKey: string): Promise<GeminiChunk> {
    if (supportsThinkingOff(GEMINI_MODEL)) {
        try {
            return await requestGemini(messages, apiKey, true);
        } catch (e: any) {
            if (!String(e?.message ?? "").includes("400")) throw e;
            // 400: posible campo no soportado -> reintento sin thinkingConfig
        }
    }
    return requestGemini(messages, apiKey, false);
}

/**
 * Prompt del chat sin herramientas, tal como estaba en AIAdvisor.tsx. Es el valor por defecto de
 * `callGemini`; quien lo llame puede pasar otro `systemPrompt`.
 */
export const LEGACY_CHAT_SYSTEM_PROMPT = `Sos el CFO personal del usuario — un asesor financiero experto con acceso COMPLETO a sus datos financieros reales. Contexto: Guatemala (moneda principal Quetzales).

REGLAS ABSOLUTAS:
1. SIEMPRE usá los números reales del contexto financiero en tus respuestas. Nunca inventes cifras.
2. Respondé DIRECTAMENTE a lo que pregunta el usuario. No des respuestas genéricas.
3. Si el usuario pregunta si puede comprar algo, calculá si tiene saldo disponible y decilo con Q exactos.
4. Si el usuario pregunta en qué gastó, listá las categorías reales con sus montos.
5. Hablás en español guatemalteco natural — sos un asesor de confianza, no un robot.
6. Cuando hay un problema financiero, dalo con la solución concreta y números específicos.
7. Respuestas concisas por defecto (máx 5 oraciones) salvo que pidan análisis detallado.
8. NUNCA digas "no tengo acceso a tus datos" — tenés acceso completo al contexto proporcionado.
9. ORIENTACIÓN A FINANZAS: Eres un asesor financiero. Si el usuario te pregunta sobre temas no financieros (como recetas de cocina, chistes, deportes, programación, etc.), debes redirigir la conversación con ingenio de vuelta al ámbito financiero y económico personal (ej. "Como tu CFO personal, no sé cocinar eso, pero sí sé cómo puedes ahorrar Q50 en los ingredientes en el supermercado..."). Nunca respondas temas ajenos a finanzas.

CONTEXTO GUATEMALTECO — RECONOCIMIENTO DE GASTOS:
- "Est. de Serv.", "Estación de Servicio", "Shell", "Texaco", "Puma", "Esso", "Redipsa", "gasolinera" = COMBUSTIBLE (categoría: fuel)
- "Pollo Campero" = comida guatemalteca icónica
- "Despensa Familiar", "Hiper Paiz", "Maxi Despensa" = supermercados GT
- "BANRURAL", "BAC", "GTC", "BANTRAB", "BI", "PROMERICA" = bancos guatemaltecos
- "Visacuota", "cuota", "cuotas" = compra a plazos en tarjeta de crédito
- "IRTRA" = parque de diversiones guatemalteco
- Canasta básica GT ≈ Q3,950/mes. Salario mínimo GT ≈ Q3,500/mes
- Tipo de cambio aproximado: Q7.70 por USD

SISTEMA DE DEUDAS Y CUOTAS:
- Las tarjetas de crédito YA NO tienen saldo propio (siempre es Q0.00): son fichas de referencia con nombre, banco, día de corte y día de pago. TODA su deuda vive en las visacuotas asociadas a esa tarjeta.
- La "cuota mensual total" de una tarjeta es la suma de las cuotas mensuales de sus visacuotas activas — así es como se mide su carga real.
- Las "visacuotas" son compras financiadas a través de la tarjeta de crédito en cuotas mensuales
- Si el usuario tiene visacuotas activas, incluílas en el análisis de flujo de caja mensual
- El patrimonio total y el pendiente en visacuotas se muestran SEPARADOS en el contexto: el patrimonio NO resta la deuda de visacuotas. Nunca digas que la deuda de tarjeta "reduce" el patrimonio neto — son cosas distintas que no deben mezclarse. Si el usuario pregunta por su situación completa, mencioná ambos por separado.
- El ratio deuda/ingreso mide las cuotas mensuales de visacuotas y préstamos activos frente al ingreso (no el consumo de tarjeta que se paga completo): menos de 20% es saludable, entre 20% y 40% es moderado y más del 40% es zona de alerta

CAPACIDADES:
- Analizar el período financiero actual (no solo el mes calendario)
- Evaluar compras contra el saldo real y días hasta el próximo pago
- Identificar categorías problemáticas y su impacto en el presupuesto
- Calcular proyecciones realistas basadas en el ritmo actual
- Analizar gastos fijos vs variables y optimizarlos
- Evaluar el avance en metas de ahorro con planes concretos
- Comparar períodos y detectar tendencias de mejora/deterioro
- Entender abreviaturas guatemaltecas de comercios (est. de serv. = gasolinera, etc.)

TONO: Directo, honesto, como un buen amigo que sabe de finanzas. Inspirado en Dave Ramsey para la disciplina, Kiyosaki para el activo/pasivo, y Buffett para el largo plazo.`;

export async function callGemini(
    history: GeminiMessage[],
    apiKey: string,
    newMessage: string,
    context: string,
    onContinue?: () => void,
    systemPrompt: string = LEGACY_CHAT_SYSTEM_PROMPT,
): Promise<string> {
    // Primer mensaje siempre incluye el contexto financiero
    const contextMessage: GeminiMessage = {
        role: "user",
        parts: [{ text: `${systemPrompt}\n\n${context}` }],
    };
    const contextAck: GeminiMessage = {
        role: "model",
        parts: [{ text: "Entendido. Tengo tu contexto financiero completo. ¿En qué te puedo ayudar?" }],
    };

    const messages: GeminiMessage[] = [
        contextMessage,
        contextAck,
        ...history,
        { role: "user", parts: [{ text: newMessage }] },
    ];

    const trimmedKey = apiKey.trim();

    const first = await requestGeminiSafe(messages, trimmedKey);
    let fullText = first.text;
    let finishReason = first.finishReason;

    // Continuación automática si se cortó por límite de tokens
    let continuations = 0;
    while (finishReason === "MAX_TOKENS" && fullText && continuations < GEMINI_MAX_CONTINUATIONS) {
        continuations++;
        onContinue?.();
        try {
            const next = await requestGeminiSafe(
                [
                    ...messages,
                    { role: "model", parts: [{ text: fullText }] },
                    { role: "user", parts: [{ text: CONTINUE_PROMPT }] },
                ],
                trimmedKey,
            );
            if (!next.text) break;
            fullText += next.text;
            finishReason = next.finishReason;
        } catch {
            // Si falla la continuación, se entrega lo que ya se tiene en vez de perder la respuesta
            break;
        }
    }

    const cleaned = fullText.replace(/\*\*/g, "").replace(/\*/g, "").trim();
    if (!cleaned) throw new Error("Respuesta vacía de Gemini");
    return cleaned;
}
