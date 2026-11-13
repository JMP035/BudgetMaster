// Router del asistente: decide, para cada mensaje del usuario, qué motor lo atiende (diálogo abierto,
// propuesta pendiente, NLU local o Gemini) y devuelve los mensajes nuevos del chat y el nuevo estado.
// Módulo PURO: sin react-native ni AsyncStorage. Todo lo externo llega por `deps` (transporte de Gemini,
// asesor local, generador de ids, reloj). Hermes: sin lookbehind, sin Intl ni toLocale*.
//
// El router NUNCA escribe datos ni confirma por texto: lo máximo que produce es una tarjeta de propuesta
// en estado 'pending'. Confirmar solo ocurre con el botón de la tarjeta (Executor, fuera de este módulo).
//
// Reglas, en orden (§4 paso 13 del plan):
//  1. Diálogo abierto → continueDialogue. Si devuelve 'pass' (otra orden/consulta clara) se descarta el
//     diálogo (con aviso) y se sigue en la regla 2 con el estado limpio.
//  2. Propuesta pendiente (state.lastProposalId, vía deps.getProposal): meta.correct → applyCorrection
//     (misma tarjeta, mismo proposalId); meta.confirm → aviso «toque Confirmar»; meta.cancel → cancelar.
//  3. parseUtterance y ruta por intención/confianza:
//       meta.help → ejemplos; create.*/query.* con confianza ≥ CONF_ACT → startDialogue (con ambigüedades);
//       advice → Gemini (si hay y sin cooldown) o localAdvisor; banda CONF_CLARIFY..CONF_ACT → Gemini o
//       pregunta de aclaración con chips; unknown → Gemini o localAdvisor (+4 ejemplos si el NLU vio un
//       verbo de acción, puntaje > 0.2).
//  4. Resultado de Gemini: text → mensaje (source 'gemini') + tarjetas de consulta; proposal → si faltan
//     slots, startDialogue con esos slots (preguntas locales), si no la tarjeta; error → SIEMPRE se degrada
//     a la ruta local con un aviso.
import type {
  ActionProposal, AssistantContext, ChatMessage, Chip, DialogueState, DialogueTarget, IntentId, QueryResult, ValidationIssue,
} from './types';
import type { DialogueOutput } from './Dialogue';
import { applyCorrection, continueDialogue, discardMessage, startDialogue } from './Dialogue';
import type { Ambiguity, NluResult } from './Nlu';
import { ASSISTANT_EXAMPLES, CONF_ACT, CONF_CLARIFY, parseUtterance, targetOfIntent } from './Nlu';
import { runGeminiTurn } from './GeminiTools';
import type { GeminiErrorKind, GeminiOutcome, GeminiTransport } from './GeminiTools';
import type { CompactExtras } from './GeminiContext';

export { CONF_ACT, CONF_CLARIFY };

/** Puntaje mínimo (de `unknown`) para considerar que el NLU «vio un verbo de acción». */
export const ACTION_VERB_SCORE = 0.2;

export interface RouterDeps {
  /** Genera ids únicos (mensajes y propuestas). */
  newId: () => string;
  /** Reloj; por defecto `ctx.now`. Se usa para `at` de los mensajes y para el cooldown de Gemini. */
  now?: () => Date;
  /** Gemini opcional: si es null el router funciona solo en local. */
  gemini: null | {
    transport: GeminiTransport;
    history: { role: 'user' | 'model'; text: string }[];
    userName: string;
    extras?: CompactExtras;
  };
  /** ms epoch hasta el que no se llama a Gemini (tras un 429); 0 = sin cooldown. */
  geminiCooldownUntil: number;
  /** Texto del motor local (LocalAdvisorEngine) para consejos y conversación sin Gemini. */
  localAdvisor: (text: string) => string;
  /** Busca la propuesta por id en el chat; null si no existe. Solo cuenta si su status es 'pending'. */
  getProposal: (proposalId: string) => ActionProposal | null;
}

export interface RouteOutcome {
  /** Mensajes de la IA a agregar al chat, en orden (el mensaje del usuario lo agrega la UI). */
  messages: ChatMessage[];
  /** Nuevo estado del diálogo (reemplaza al anterior). */
  state: DialogueState;
  /** true si se intentó una petición a Gemini (aunque haya fallado). */
  geminiUsed: boolean;
  /** Respuesta de texto de Gemini: la UI agrega {user: texto, model: geminiText} al historial. */
  geminiText?: string;
  /** Gemini devolvió 429: la UI debe fijar cooldown (p. ej. 60 s). */
  rateLimited?: boolean;
  /** Había clave de Gemini pero el cooldown estaba activo: no se llamó. */
  geminiSkipped?: 'cooldown';
  /** Tarjeta a la que hacer scroll (propuesta nueva, corregida o a confirmar). */
  focusProposalId?: string;
  /** Tarjeta corregida: la UI reemplaza la tarjeta del chat que tenga el mismo proposalId. */
  replaceProposal?: ActionProposal;
  /** Tarjeta cancelada por texto: la UI la marca como 'cancelled'. */
  cancelledProposalId?: string;
}

// ─────────────────────────────────────────────────────────────
// Textos
// ─────────────────────────────────────────────────────────────

export const MSG_CONFIRM_BUTTON = 'Para guardar, toque Confirmar en la tarjeta.';
export const MSG_PROPOSAL_CANCELLED = 'Listo, descarté la propuesta.';
export const MSG_PROPOSAL_UPDATED = 'Listo, actualicé la tarjeta.';
export const MSG_NO_CHANGE = 'No identifiqué qué dato cambiar. Indique por ejemplo «no, eran 600» o toque Editar en la tarjeta.';
export const MSG_CLARIFY = 'No estoy seguro de lo que necesita. ¿Cuál de estas opciones es?';
export const MSG_ADVISOR_FAILED = 'No pude procesar esa consulta. Intente de nuevo.';

export const GEMINI_NOTICES: Record<GeminiErrorKind, string> = {
  rate_limit: 'Gemini alcanzó su límite de solicitudes; respondo en modo local.',
  auth: 'La clave de Gemini no es válida (Ajustes → Inteligencia Artificial). Respondo en modo local.',
  timeout: 'Sin respuesta de Gemini; respondo en modo local.',
  network: 'Sin respuesta de Gemini; respondo en modo local.',
  bad_request: 'Gemini no pudo procesar la solicitud; respondo en modo local.',
  not_found: 'Gemini no pudo procesar la solicitud; respondo en modo local.',
  empty: 'Gemini no pudo procesar la solicitud; respondo en modo local.',
};

/** Chips de aclaración: la etiqueta se ve; el valor se envía como si se hubiera escrito (el NLU lo entiende). */
export const INTENT_CHIPS: Partial<Record<IntentId, Chip>> = {
  'create.create_goal': { label: 'Crear una meta', value: 'Crear una meta de ahorro' },
  'create.set_category_budget': { label: 'Fijar un límite', value: 'Poner un límite a una categoría' },
  'create.create_fixed_expense': { label: 'Agregar un gasto fijo', value: 'Agregar un gasto fijo' },
  'create.create_transaction': { label: 'Registrar un gasto', value: 'Registrar un gasto' },
  'query.spending_total': { label: 'Consultar lo gastado', value: 'Cuánto gasté este período' },
  'query.list_movements': { label: 'Ver movimientos', value: 'Muéstrame los movimientos' },
  'query.fixed_pending': { label: 'Gastos fijos pendientes', value: 'Qué gastos fijos me faltan por pagar' },
  'query.budget_status': { label: 'Ver presupuestos', value: 'Cómo van mis presupuestos' },
  'query.goals_status': { label: 'Ver mis metas', value: 'Cómo van mis metas' },
  advice: { label: 'Pedir un consejo', value: 'Dame un consejo' },
};
/** «Otra cosa» envía «ayuda»: muestra los ejemplos de lo que el asistente entiende. */
export const OTHER_CHIP: Chip = { label: 'Otra cosa', value: 'ayuda' };

/** Índices de ASSISTANT_EXAMPLES que se muestran cuando el NLU vio un verbo de acción pero no entendió. */
const HINT_EXAMPLE_INDEXES = [0, 3, 4, 6];

export function helpText(): string {
  return `Puedo responder consultas y preparar órdenes; toda orden se confirma con una tarjeta antes de guardarse. Por ejemplo:\n${ASSISTANT_EXAMPLES.map(e => `• ${e}`).join('\n')}`;
}

export function hintText(): string {
  const picks = HINT_EXAMPLE_INDEXES.map(i => ASSISTANT_EXAMPLES[i]).filter(e => !!e);
  return `Si quería registrar algo o consultar sus datos, pruebe por ejemplo:\n${picks.map(e => `• ${e}`).join('\n')}`;
}

// ─────────────────────────────────────────────────────────────
// Fabricación de mensajes
// ─────────────────────────────────────────────────────────────

function makers(ctx: AssistantContext, deps: RouterDeps) {
  const at = (): string => (deps.now ? deps.now() : ctx.now).toISOString();
  return {
    text: (text: string, source: 'local' | 'gemini' | 'advisor'): ChatMessage =>
      ({ id: deps.newId(), at: at(), role: 'ai', kind: 'text', text, source }),
    notice: (variant: 'success' | 'error' | 'info' | 'warning', text: string): ChatMessage =>
      ({ id: deps.newId(), at: at(), role: 'ai', kind: 'notice', variant, text }),
    question: (text: string, chips: Chip[], slot: string): ChatMessage =>
      ({ id: deps.newId(), at: at(), role: 'ai', kind: 'question', text, chips, slot }),
    proposal: (proposal: ActionProposal): ChatMessage =>
      ({ id: deps.newId(), at: at(), role: 'ai', kind: 'proposal', proposal }),
    query: (result: QueryResult): ChatMessage =>
      ({ id: deps.newId(), at: at(), role: 'ai', kind: 'query', result }),
  };
}
type Makers = ReturnType<typeof makers>;

interface Partial3 { messages: ChatMessage[]; state: DialogueState; focusProposalId?: string }

/** Salida del diálogo → mensajes del chat + estado. `issues` (de Gemini) se antepone a la pregunta del slot. */
function fromDialogue(
  r: { state: DialogueState; out: DialogueOutput }, m: Makers, issues?: ValidationIssue[],
): Partial3 {
  const out = r.out;
  switch (out.type) {
    case 'ask': {
      const issue = issues ? issues.find(i => i.slot === out.slot) : undefined;
      const text = issue ? `${issue.message} ${out.text}` : out.text;
      return { messages: [m.question(text, out.chips, out.slot)], state: r.state };
    }
    case 'propose':
      return { messages: [m.proposal(out.proposal)], state: r.state, focusProposalId: out.proposal.proposalId };
    case 'query':
      return { messages: [m.query(out.result)], state: r.state };
    case 'cancelled':
      return { messages: [m.notice('info', out.text)], state: r.state };
    default:
      return { messages: [], state: r.state };
  }
}

// ─────────────────────────────────────────────────────────────
// Clasificación de la ruta
// ─────────────────────────────────────────────────────────────

type Route = 'help' | 'act' | 'advice' | 'clarify' | 'unknown';

function classify(nlu: NluResult): Route {
  if (nlu.intent === 'meta.help') return 'help';
  if (nlu.intent === 'unknown') return 'unknown';
  if (nlu.intent.indexOf('meta.') === 0) return 'unknown';   // confirm/cancel/correct sin nada pendiente
  if (nlu.intentAmbiguous) return 'clarify';
  if (targetOfIntent(nlu.intent) && nlu.confidence >= CONF_ACT) return 'act';
  if (nlu.intent === 'advice' && nlu.confidence >= CONF_CLARIFY) return 'advice';
  return 'clarify';
}

interface Ctx3 {
  nlu: NluResult; text: string; ctx: AssistantContext; deps: RouterDeps; m: Makers;
  st: DialogueState; lead: ChatMessage[];
}

function localAdvice(c: Ctx3): ChatMessage {
  let reply: string;
  try { reply = c.deps.localAdvisor(c.text); } catch { reply = MSG_ADVISOR_FAILED; }
  return c.m.text(reply || MSG_ADVISOR_FAILED, 'advisor');
}

/** Ruta local (sin Gemini) para consejo, aclaración y desconocido. */
function localRoute(route: Route, c: Ctx3): RouteOutcome {
  const messages = c.lead.slice();
  if (route === 'clarify') {
    const chips: Chip[] = [];
    for (const cand of c.nlu.candidates) {
      const chip = INTENT_CHIPS[cand.intent];
      if (chip && !chips.some(x => x.value === chip.value)) chips.push(chip);
      if (chips.length >= 2) break;
    }
    chips.push(OTHER_CHIP);
    messages.push(c.m.question(MSG_CLARIFY, chips, '_intent'));
    return { messages, state: c.st, geminiUsed: false };
  }
  messages.push(localAdvice(c));
  if (route === 'unknown' && c.nlu.confidence > ACTION_VERB_SCORE) messages.push(c.m.text(hintText(), 'local'));
  return { messages, state: c.st, geminiUsed: false };
}

async function geminiRoute(c: Ctx3, route: Route): Promise<RouteOutcome> {
  const g = c.deps.gemini!;
  let outcome: GeminiOutcome;
  try {
    outcome = await runGeminiTurn({
      transport: g.transport, userText: c.text, history: g.history, ctx: c.ctx, userName: g.userName,
      newId: c.deps.newId, extras: g.extras,
    });
  } catch {
    outcome = { kind: 'error', error: 'network' };
  }

  if (outcome.kind === 'error') {
    const base = localRoute(route, { ...c, lead: [...c.lead, c.m.notice('warning', GEMINI_NOTICES[outcome.error])] });
    return { ...base, geminiUsed: true, rateLimited: outcome.error === 'rate_limit' ? true : undefined };
  }

  const messages = c.lead.slice();
  if (outcome.kind === 'text') {
    if (outcome.text) messages.push(c.m.text(outcome.text, 'gemini'));
    for (const q of outcome.queries) messages.push(c.m.query(q));
    const res: RouteOutcome = { messages, state: c.st, geminiUsed: true };
    if (outcome.text) res.geminiText = outcome.text;
    return res;
  }

  // proposal
  if (outcome.text) messages.push(c.m.text(outcome.text, 'gemini'));
  for (const q of outcome.queries) messages.push(c.m.query(q));
  const target: DialogueTarget = { type: 'action', id: outcome.proposal.actionId };
  let part: Partial3;
  if (outcome.missing.length > 0) {
    // Las preguntas son locales: el diálogo parte de lo que Gemini ya envió.
    part = fromDialogue(startDialogue(target, outcome.proposal.slots, c.ctx, 'gemini', c.deps.newId), c.m, outcome.argIssues);
  } else {
    part = {
      messages: [c.m.proposal(outcome.proposal)],
      state: { active: null, lastProposalId: outcome.proposal.proposalId },
      focusProposalId: outcome.proposal.proposalId,
    };
  }
  const res: RouteOutcome = { messages: [...messages, ...part.messages], state: part.state, geminiUsed: true };
  if (part.focusProposalId) res.focusProposalId = part.focusProposalId;
  if (outcome.text) res.geminiText = outcome.text;
  return res;
}

// ─────────────────────────────────────────────────────────────
// Punto de entrada
// ─────────────────────────────────────────────────────────────

/**
 * Enruta un mensaje del usuario. Nunca ejecuta nada: devuelve mensajes del asistente (texto, pregunta con
 * chips, tarjeta de propuesta, tarjeta de consulta, aviso) y el nuevo `DialogueState`.
 */
export async function routeMessage(
  raw: string, state: DialogueState, ctx: AssistantContext, deps: RouterDeps,
): Promise<RouteOutcome> {
  const text = raw.trim();
  const m = makers(ctx, deps);
  if (!text) return { messages: [], state, geminiUsed: false };

  let st: DialogueState = state;
  const lead: ChatMessage[] = [];

  // 1. Diálogo abierto.
  if (st.active) {
    const r = continueDialogue(st, text, ctx, deps.newId);
    if (r.out.type !== 'pass') {
      const part = fromDialogue(r, m);
      const res: RouteOutcome = { messages: part.messages, state: part.state, geminiUsed: false };
      if (part.focusProposalId) res.focusProposalId = part.focusProposalId;
      return res;
    }
    lead.push(m.notice('info', discardMessage(st.active.target)));
    st = { active: null, lastProposalId: st.lastProposalId };
  }

  // 2. Propuesta pendiente.
  const prop = st.lastProposalId ? deps.getProposal(st.lastProposalId) : null;
  const pending = !!prop && prop.status === 'pending';
  const nlu = parseUtterance(text, ctx, { dialogue: false, pending });

  if (pending && prop) {
    if (nlu.intent === 'meta.correct') {
      const next = applyCorrection(prop, text, ctx);
      if (next) {
        return {
          messages: [...lead, m.notice('info', MSG_PROPOSAL_UPDATED)], state: st, geminiUsed: false,
          replaceProposal: next, focusProposalId: next.proposalId,
        };
      }
      return { messages: [...lead, m.notice('info', MSG_NO_CHANGE)], state: st, geminiUsed: false, focusProposalId: prop.proposalId };
    }
    if (nlu.intent === 'meta.confirm') {
      return { messages: [...lead, m.notice('info', MSG_CONFIRM_BUTTON)], state: st, geminiUsed: false, focusProposalId: prop.proposalId };
    }
    if (nlu.intent === 'meta.cancel') {
      return {
        messages: [...lead, m.notice('info', MSG_PROPOSAL_CANCELLED)], state: { active: null, lastProposalId: null },
        geminiUsed: false, cancelledProposalId: prop.proposalId,
      };
    }
  }

  // 3. NLU local.
  const route = classify(nlu);
  const c: Ctx3 = { nlu, text, ctx, deps, m, st, lead };

  if (route === 'help') {
    return { messages: [...lead, m.text(helpText(), 'local')], state: st, geminiUsed: false };
  }
  if (route === 'act') {
    const target = targetOfIntent(nlu.intent)!;
    const amb: Ambiguity[] = nlu.ambiguities;
    const part = fromDialogue(startDialogue(target, nlu.slots, ctx, 'local', deps.newId, amb), m);
    const res: RouteOutcome = { messages: [...lead, ...part.messages], state: part.state, geminiUsed: false };
    if (part.focusProposalId) res.focusProposalId = part.focusProposalId;
    return res;
  }

  // advice / clarify / unknown: Gemini si hay y no está en cooldown.
  if (deps.gemini) {
    const nowMs = (deps.now ? deps.now() : ctx.now).getTime();
    if (nowMs >= deps.geminiCooldownUntil) return geminiRoute(c, route);
    const base = localRoute(route, c);
    return { ...base, geminiSkipped: 'cooldown' };
  }
  return localRoute(route, c);
}
