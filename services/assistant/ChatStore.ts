// Validación y recorte PUROS del chat guardado del asistente (la lectura/escritura vive en storage.ts).
// Sin react-native ni AsyncStorage: de ./types solo se importan tipos.
import type { ChatMessage, StoredAssistantChat } from './types';

export const MAX_STORED_MESSAGES = 60;
export const MAX_STORED_HISTORY = 20;

const ACTION_IDS = ['create_goal', 'set_category_budget', 'create_fixed_expense', 'create_transaction'];

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** true si el mensaje tiene la forma mínima que necesita el renderizador de cada `kind`. */
export function isValidChatMessage(m: unknown): m is ChatMessage {
  if (!isObj(m)) return false;
  if (typeof m.id !== 'string' || typeof m.at !== 'string') return false;
  if (m.role !== 'user' && m.role !== 'ai') return false;
  switch (m.kind) {
    case 'text':
      return typeof m.text === 'string';
    case 'question':
      return m.role === 'ai' && typeof m.text === 'string' && Array.isArray(m.chips) && typeof m.slot === 'string';
    case 'proposal':
      return m.role === 'ai' && isObj(m.proposal)
        && typeof m.proposal.proposalId === 'string'
        && typeof m.proposal.actionId === 'string' && ACTION_IDS.includes(m.proposal.actionId)
        && Array.isArray(m.proposal.summary) && Array.isArray(m.proposal.warnings) && Array.isArray(m.proposal.issues);
    case 'query':
      return m.role === 'ai' && isObj(m.result) && Array.isArray(m.result.totals) && Array.isArray(m.result.rows);
    case 'notice':
      return m.role === 'ai' && typeof m.text === 'string'
        && (m.variant === 'success' || m.variant === 'error' || m.variant === 'info' || m.variant === 'warning');
    default:
      return false;
  }
}

function isValidHistoryEntry(h: unknown): h is { role: 'user' | 'model'; text: string } {
  return isObj(h) && (h.role === 'user' || h.role === 'model') && typeof h.text === 'string';
}

/**
 * Valida un chat leído de disco (ya pasado por JSON.parse). `v` debe ser 1 y `messages`/`geminiHistory`
 * deben ser arreglos; si no, null. Los elementos mal formados se descartan en vez de invalidar todo el chat.
 */
export function validateStoredChat(raw: unknown): StoredAssistantChat | null {
  if (!isObj(raw)) return null;
  if (raw.v !== 1) return null;
  if (!Array.isArray(raw.messages) || !Array.isArray(raw.geminiHistory)) return null;
  return {
    v: 1,
    messages: raw.messages.filter(isValidChatMessage),
    geminiHistory: raw.geminiHistory.filter(isValidHistoryEntry).map(h => ({ role: h.role, text: h.text })),
    savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '',
  };
}

/** Conserva los últimos 60 mensajes y las últimas 20 entradas del historial de Gemini. No muta la entrada. */
export function trimStoredChat(c: StoredAssistantChat): StoredAssistantChat {
  return {
    v: 1,
    messages: c.messages.length > MAX_STORED_MESSAGES ? c.messages.slice(-MAX_STORED_MESSAGES) : c.messages.slice(),
    geminiHistory: c.geminiHistory.length > MAX_STORED_HISTORY ? c.geminiHistory.slice(-MAX_STORED_HISTORY) : c.geminiHistory.slice(),
    savedAt: c.savedAt,
  };
}

/** Texto JSON → chat válido o null (JSON roto, vacío o con forma incorrecta). */
export function parseStoredChatJson(json: string | null | undefined): StoredAssistantChat | null {
  if (!json) return null;
  try { return validateStoredChat(JSON.parse(json)); } catch { return null; }
}
