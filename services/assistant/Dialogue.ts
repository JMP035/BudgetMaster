// Diálogo (slot-filling) del asistente: convierte una orden a medias en preguntas con chips hasta que la
// acción tiene todos sus datos y se puede mostrar la tarjeta de confirmación. Módulo PURO: sin
// react-native ni AsyncStorage. Hermes: sin lookbehind. Fechas con formatDateOnly (nunca new Date('YYYY-MM-DD')).
//
// Reglas (§3 «Diálogo»): cada respuesta se lee con `parseSlotAnswer` del slot pendiente y, además, con
// `extractSlotsFor` para que «Q5,000 para diciembre» llene dos slots a la vez; dos fallos seguidos en el
// mismo slot repiten la pregunta con un ejemplo y el tercero cancela; otra orden o consulta clara
// (confianza >= 0.75) abandona el diálogo devolviendo 'pass' (el Router la procesa con el estado limpio).
import type {
  ActionProposal, AssistantContext, Chip, DateRange, DialogueState, DialogueTarget, QueryResult, SlotMap, SlotSpec,
  SlotValue,
} from './types';
import { formatDateOnly } from '../DateAmount';
import { ACTIONS, makeProposal, missingSlots, topCategoryChips, withDefaults } from './Actions';
import { QUERIES, dayNumber, normCurrency, normTxType, resolveCategoryId } from './Queries';
import { extractAmounts, parseSpanishNumber } from './AmountParser';
import { extractDate, extractDayOfMonth, extractRange } from './DateParser';
import {
  categoryCandidates, categoryChips, cleanFreeName, guessCategoryForText, resolveAccount, resolveCategories,
} from './Lexicon';
import { CONF_ACT, extractSlotsFor, parseUtterance, targetOfIntent } from './Nlu';
import type { Ambiguity } from './Nlu';
import { hasPhrase, normalizeWithMap, tokens } from './Text';

export type DialogueOutput =
  | { type: 'ask'; slot: string; text: string; chips: Chip[] }
  | { type: 'propose'; proposal: ActionProposal }
  | { type: 'query'; result: QueryResult }
  | { type: 'cancelled'; text: string }
  | { type: 'pass' };

export interface SlotAnswer { value?: SlotValue; error?: string; chips?: Chip[] }

/** Confianza mínima de otra orden/consulta para abandonar el diálogo abierto. */
export const CONF_SWITCH = 0.75;
/** Fallos seguidos en un mismo slot que cancelan el diálogo. */
export const MAX_FAILURES = 3;

const AMB_PREFIX = '_amb_';
const MAX_AMOUNT = 100_000_000;
const MAX_PAST_DAYS = 366;

// ─────────────────────────────────────────────────────────────
// Utilidades
// ─────────────────────────────────────────────────────────────

function specsOf(target: DialogueTarget): SlotSpec[] {
  return target.type === 'action' ? ACTIONS[target.id].slots : QUERIES[target.id].slots;
}

function isEmpty(v: SlotValue | undefined): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim() === '';
  if (typeof v === 'number') return !Number.isFinite(v);
  return false;
}

function sameTarget(a: DialogueTarget, b: DialogueTarget): boolean {
  return a.type === b.type && a.id === b.id;
}

function stripHidden(slots: SlotMap): SlotMap {
  const out: SlotMap = {};
  for (const k of Object.keys(slots)) if (k.indexOf(AMB_PREFIX) !== 0) out[k] = slots[k];
  return out;
}

function hiddenChips(slots: SlotMap, key: string): Chip[] | null {
  const v = slots[AMB_PREFIX + key];
  if (typeof v !== 'string') return null;
  try {
    const arr = JSON.parse(v);
    if (Array.isArray(arr) && arr.every(c => c && typeof c.label === 'string' && typeof c.value === 'string')) return arr as Chip[];
  } catch { /* se ignora */ }
  return null;
}

function firstAmbiguity(slots: SlotMap): string | null {
  for (const k of Object.keys(slots)) if (k.indexOf(AMB_PREFIX) === 0) return k.slice(AMB_PREFIX.length);
  return null;
}

const TARGET_LABEL: Record<string, string> = {
  create_goal: 'la meta pendiente',
  set_category_budget: 'el límite pendiente',
  create_fixed_expense: 'el gasto fijo pendiente',
  create_transaction: 'el movimiento pendiente',
  spending_total: 'la consulta',
  list_movements: 'la consulta',
  fixed_pending: 'la consulta',
  budget_status: 'la consulta',
  goals_status: 'la consulta',
};

/** «Se descartó la meta pendiente.» (el Router lo antepone cuando una orden nueva abandona un diálogo). */
export function discardMessage(target: DialogueTarget): string {
  return `Se descartó ${TARGET_LABEL[target.id] ?? 'lo pendiente'}.`;
}

const EXAMPLES: Record<string, string> = {
  amount: '5000, Q5,000 o 5 mil',
  currency: 'Quetzales o Dólares',
  date_future: 'diciembre, fin de año o 15 de marzo',
  date_past: 'hoy, ayer o 5 de noviembre',
  day_of_month: '15, el 5 o fin de mes',
  category_expense: 'comida o gasolina',
  category_any: 'comida, gasolina o sueldo',
  account: 'BAC o efectivo',
  text: 'Laptop',
  tx_type: 'Gasto o Ingreso',
  range: 'este mes o la semana pasada',
  merchant: 'Spotify',
};

function categoryKind(slots: SlotMap): 'expense' | 'income' {
  return normTxType(slots.tx_type) ?? 'expense';
}

function askSlot(
  target: DialogueTarget, slots: SlotMap, ctx: AssistantContext, key: string, prefix?: string, example?: boolean,
): DialogueOutput {
  const spec = specsOf(target).find(s => s.key === key);
  const clean = stripHidden(slots);
  let chips = hiddenChips(slots, key);
  let text: string;
  if (chips) {
    text = key === 'category' ? '¿A cuál categoría se refiere?'
      : key === 'account' ? '¿A cuál cuenta se refiere?'
        : key === 'amount' ? '¿Cuál es el monto correcto?' : (spec ? spec.question : '¿A cuál se refiere?');
  } else {
    text = spec ? spec.question : '¿Puede indicarlo de nuevo?';
    chips = spec && spec.chips ? spec.chips(ctx, clean) : [];
  }
  if (prefix) text = `${prefix} ${text}`;
  if (example && spec) text += ` Por ejemplo: ${EXAMPLES[spec.type] ?? 'una respuesta corta'}.`;
  return { type: 'ask', slot: key, text, chips };
}

// ─────────────────────────────────────────────────────────────
// Respuestas a un slot
// ─────────────────────────────────────────────────────────────

/** Quita de `raw` los tramos [start, end) de `norm` (usando `map`), de atrás hacia delante. */
function removeSpans(raw: string, map: number[], spans: [number, number][]): string {
  let out = raw;
  const sorted = spans.slice().sort((a, b) => b[0] - a[0]);
  for (const [s, e] of sorted) {
    const a = map[s];
    const b = map[e - 1];
    if (a === undefined || b === undefined) continue;
    out = out.slice(0, a) + ' ' + out.slice(b + 1);
  }
  return out;
}

const NAME_LEAD = /^\s*(?:se\s+llam(?:a|ara|aria)|llamad[ao]|el\s+nombre\s+es|nombre\s*[:=]?|le\s+pongo|ponle|ser[aá])\s+/i;

function textAnswer(raw: string, key: string): SlotAnswer {
  const { norm, map } = normalizeWithMap(raw);
  const max = key === 'description' ? 100 : 40;
  const amounts = extractAmounts(norm);
  const all = amounts.map(a => [a.start, a.end] as [number, number]);
  const explicit = amounts
    .filter(a => a.explicitCurrency || /\d\s*(k|mil|millon|millones)$/.test(norm.slice(a.start, a.end)))
    .map(a => [a.start, a.end] as [number, number]);
  const finish = (s: string): string => cleanFreeName(s.replace(NAME_LEAD, ''), max);
  if (all.length > 0 && finish(removeSpans(raw, map, all)) === '') {
    return { error: 'Eso parece un monto; necesito un nombre.' };
  }
  const name = finish(explicit.length > 0 ? removeSpans(raw, map, explicit) : raw);
  if (!name) return { error: 'No identifiqué el nombre.' };
  return { value: name };
}

function currencyAnswer(norm: string): SlotAnswer {
  const t = tokens(norm);
  for (const w of t) {
    const c = ({
      q: 'Q', qtz: 'Q', gtq: 'Q', quetzal: 'Q', quetzales: 'Q', vara: 'Q', varas: 'Q', peso: 'Q', pesos: 'Q',
      usd: 'USD', dolar: 'USD', dolares: 'USD', dls: 'USD', verde: 'USD', verdes: 'USD', '$': 'USD',
      eur: 'EUR', euro: 'EUR', euros: 'EUR', libra: '£', libras: '£', '£': '£',
    } as Record<string, string>)[w];
    if (c) return { value: c };
  }
  return { error: 'No identifiqué la moneda.' };
}

/**
 * Interpreta la respuesta del usuario a la pregunta de un slot. Devuelve el valor ya normalizado
 * (monto numérico, fecha 'YYYY-MM-DD', día entero, id de categoría o de cuenta, 'expense'/'income',
 * 'Q'/'USD'…), un `error` legible o, si hay varias coincidencias, `chips` para elegir. `slots` (opcional)
 * se usa para saber si una categoría es de gasto o de ingreso.
 */
export function parseSlotAnswer(spec: SlotSpec, raw: string, ctx: AssistantContext, slots?: SlotMap): SlotAnswer {
  const { norm } = normalizeWithMap(raw);
  if (!norm) return { error: 'No recibí una respuesta.' };
  const today = formatDateOnly(ctx.now);

  switch (spec.type) {
    case 'amount': {
      const ms = extractAmounts(norm);
      if (ms.length === 0) return { error: 'No identifiqué el monto.' };
      let pool = ms.filter(m => m.explicitCurrency);
      if (pool.length === 0) pool = ms;
      const distinct = pool.filter((m, i) => pool.findIndex(n => n.value === m.value && n.currency === m.currency) === i);
      if (distinct.length > 1) {
        return {
          error: 'Encontré más de un monto.',
          chips: distinct.slice(0, 3).map(m => ({ label: String(m.value), value: String(m.value) })),
        };
      }
      const v = distinct[0].value;
      if (!(v > 0)) return { error: 'El monto debe ser mayor que cero.' };
      if (v >= MAX_AMOUNT) return { error: 'El monto es demasiado grande.' };
      return { value: v };
    }
    case 'currency':
      return currencyAnswer(norm);
    case 'date_future': {
      let d = extractDate(norm, ctx.now, 'future');
      if (!d && /^\d{1,3} (dia|dias|semana|semanas|mes|meses|ano|anos)$/.test(norm)) d = extractDate('en ' + norm, ctx.now, 'future');
      if (!d) return { error: 'No identifiqué la fecha.' };
      if (!(dayNumber(d.date) > dayNumber(today))) return { error: 'La fecha debe ser posterior a hoy.' };
      return { value: d.date };
    }
    case 'date_past': {
      const d = extractDate(norm, ctx.now, 'past');
      if (!d) return { error: 'No identifiqué la fecha.' };
      const diff = dayNumber(today) - dayNumber(d.date);
      if (diff < 0) return { error: 'La fecha del movimiento no puede ser futura.' };
      if (diff > MAX_PAST_DAYS) return { error: 'La fecha no puede ser de hace más de un año.' };
      return { value: d.date };
    }
    case 'day_of_month': {
      const dm = extractDayOfMonth(norm);
      if (dm) return { value: dm.day };
      const t = tokens(norm);
      if (/^\d{1,2}$/.test(norm)) {
        const n = Number(norm);
        if (n >= 1 && n <= 31) return { value: n };
      }
      if (t.length === 1 && (t[0] === 'primero' || t[0] === 'primer')) return { value: 1 };
      const r = parseSpanishNumber(t, 0);
      if (r && r.consumed === t.length && r.value >= 1 && r.value <= 31) return { value: r.value };
      return { error: 'Indique un día del mes entre 1 y 31.' };
    }
    case 'category_expense':
    case 'category_any': {
      const first: 'expense' | 'income' = spec.type === 'category_expense' ? 'expense' : categoryKind(slots ?? {});
      const kinds: ('expense' | 'income')[] = spec.type === 'category_expense' ? ['expense'] : first === 'income' ? ['income', 'expense'] : ['expense', 'income'];
      const explicitType = !!(slots && normTxType(slots.tx_type));
      const custom = ctx.settings.customCategories ?? [];
      for (const kind of explicitType && spec.type === 'category_any' ? [first] : kinds) {
        const byId = resolveCategoryId(ctx, raw.trim(), kind);
        if (byId) return { value: byId };
        const ms = resolveCategories(norm, custom, kind);
        if (ms.length > 0) {
          const tied = ms.filter(m => m.start === ms[0].start && m.end === ms[0].end);
          const ids = categoryCandidates(tied);
          if (ids.length > 1) return { error: 'Hay más de una categoría posible.', chips: categoryChips(ids, custom, kind) };
          return { value: ms[0].id };
        }
      }
      for (const kind of explicitType && spec.type === 'category_any' ? [first] : kinds) {
        const g = guessCategoryForText(raw.trim(), ctx, kind);
        if (g !== 'other') return { value: g };
      }
      return { error: 'No encontré esa categoría.' };
    }
    case 'account': {
      const accs = resolveAccount(norm, ctx.accounts);
      if (accs.length === 1) return { value: accs[0].id };
      if (accs.length > 1) return { error: 'Hay más de una cuenta posible.', chips: accs.slice(0, 4).map(a => ({ label: a.name, value: a.name })) };
      return { error: 'No encontré esa cuenta.' };
    }
    case 'text':
      return textAnswer(raw, spec.key);
    case 'tx_type': {
      const t = tokens(norm);
      if (t.some(w => ['gasto', 'gastos', 'egreso', 'egresos', 'gaste', 'pague', 'compre', 'salida'].indexOf(w) >= 0)) return { value: 'expense' };
      if (t.some(w => ['ingreso', 'ingresos', 'entrada', 'cobro', 'ingrese', 'gane', 'deposito'].indexOf(w) >= 0)) return { value: 'income' };
      return { error: 'Indique si es un gasto o un ingreso.' };
    }
    case 'merchant': {
      const name = cleanFreeName(raw, 60);
      return name ? { value: name } : { error: 'No identifiqué el comercio.' };
    }
    case 'range': {
      const rg = extractRange(norm, ctx);
      if (!rg) return { error: 'No identifiqué las fechas.' };
      const { start_i: _s, end_i: _e, ...range } = rg;
      return { value: range as DateRange };
    }
    default:
      return { error: 'No entendí la respuesta.' };
  }
}

// ─────────────────────────────────────────────────────────────
// Avance del diálogo
// ─────────────────────────────────────────────────────────────

function stateAsk(
  target: DialogueTarget, slots: SlotMap, ctx: AssistantContext, origin: ActionProposal['origin'],
  key: string, failures: number, last: string | null, prefix?: string, example?: boolean,
): { state: DialogueState; out: DialogueOutput } {
  return {
    state: { active: { target, slots, pendingSlot: key, failures, origin }, lastProposalId: last },
    out: askSlot(target, slots, ctx, key, prefix, example),
  };
}

/** Siguiente paso con los slots actuales: pregunta lo que falta, ejecuta la consulta o arma la tarjeta. */
function advance(
  target: DialogueTarget, slots: SlotMap, ctx: AssistantContext, origin: ActionProposal['origin'],
  newId: () => string, last: string | null,
): { state: DialogueState; out: DialogueOutput } {
  const amb = firstAmbiguity(slots);
  if (amb) return stateAsk(target, slots, ctx, origin, amb, 0, last);

  const clean = stripHidden(slots);
  if (target.type === 'query') {
    const result = QUERIES[target.id].run(clean, ctx);
    return { state: { active: null, lastProposalId: last }, out: { type: 'query', result } };
  }

  const spec = ACTIONS[target.id];
  const full = withDefaults(spec, clean, ctx);
  const missing = missingSlots(spec, full);
  if (missing.length > 0) return stateAsk(target, clean, ctx, origin, missing[0].key, 0, last);

  const proposal = makeProposal(target.id, clean, ctx, origin, newId());
  return { state: { active: null, lastProposalId: proposal.proposalId }, out: { type: 'propose', proposal } };
}

/**
 * Abre un diálogo. `initialSlots` y `ambiguities` salen del NLU (o de Gemini). Con una ambigüedad
 * (categoría «gas», cuenta «BAC», dos montos) la primera pregunta es esa, con chips.
 */
export function startDialogue(
  target: DialogueTarget, initialSlots: SlotMap, ctx: AssistantContext, origin: ActionProposal['origin'],
  newId: () => string, ambiguities?: Ambiguity[],
): { state: DialogueState; out: DialogueOutput } {
  const slots: SlotMap = { ...initialSlots };
  for (const a of ambiguities ?? []) {
    if (isEmpty(slots[a.slot]) && a.chips.length > 0) slots[AMB_PREFIX + a.slot] = JSON.stringify(a.chips);
  }
  return advance(target, slots, ctx, origin, newId, null);
}

/** Diálogo guiado desde los botones rápidos: sin datos (o con `preset`, p. ej. tx_type 'expense'). */
export function startGuided(
  target: DialogueTarget, ctx: AssistantContext, newId: () => string, preset?: SlotMap,
): { state: DialogueState; out: DialogueOutput } {
  return startDialogue(target, preset ?? {}, ctx, 'guided', newId);
}

/** Datos que una corrección puede cambiar: no se acepta un nombre sin una señal explícita. */
function correctionPatch(target: DialogueTarget, raw: string, ctx: AssistantContext): SlotMap {
  const ext = extractSlotsFor(target, raw, ctx).slots;
  const patch: SlotMap = {};
  const namePlease = /nombre|llam|ponle|se llame|titul/i.test(raw);
  for (const k of Object.keys(ext)) {
    if (k === 'name' && !namePlease) continue;
    if (isEmpty(ext[k])) continue;
    patch[k] = ext[k];
  }
  return patch;
}

function cancelledOut(target: DialogueTarget, last: string | null): { state: DialogueState; out: DialogueOutput } {
  return {
    state: { active: null, lastProposalId: last },
    out: { type: 'cancelled', text: `Listo, descarté ${TARGET_LABEL[target.id] ?? 'lo pendiente'}.` },
  };
}

/**
 * Procesa la respuesta del usuario dentro de un diálogo abierto. Devuelve 'pass' si no hay diálogo o si
 * el mensaje es otra orden o consulta clara (el Router la atiende con el estado limpio).
 */
export function continueDialogue(
  state: DialogueState, raw: string, ctx: AssistantContext, newId: () => string,
): { state: DialogueState; out: DialogueOutput } {
  const a = state.active;
  if (!a) return { state, out: { type: 'pass' } };
  const last = state.lastProposalId;
  const specs = specsOf(a.target);
  const pendingKey = a.pendingSlot;
  const spec = pendingKey ? specs.find(s => s.key === pendingKey) : undefined;
  const { norm } = normalizeWithMap(raw);

  const fail = (prefix?: string): { state: DialogueState; out: DialogueOutput } => {
    const failures = a.failures + 1;
    if (failures >= MAX_FAILURES) {
      return {
        state: { active: null, lastProposalId: last },
        out: { type: 'cancelled', text: `No logré entender ese dato, así que descarté ${TARGET_LABEL[a.target.id] ?? 'lo pendiente'}. Puede empezar de nuevo cuando quiera.` },
      };
    }
    return stateAsk(a.target, a.slots, ctx, a.origin, pendingKey ?? specs[0].key, failures, last, prefix, failures >= 2);
  };

  if (!norm || !pendingKey) {
    if (!pendingKey) return advance(a.target, a.slots, ctx, a.origin, newId, last);
    return fail();
  }

  // «Ver todas»: reemplaza los chips por la lista completa de categorías.
  if (spec && (spec.type === 'category_expense' || spec.type === 'category_any') && hasPhrase(norm, 'ver todas')) {
    const kind = spec.type === 'category_expense' ? 'expense' : categoryKind(stripHidden(a.slots));
    return {
      state,
      out: { type: 'ask', slot: pendingKey, text: 'Estas son todas las categorías. ¿Cuál es?', chips: topCategoryChips(ctx, kind, true) },
    };
  }

  const nlu = parseUtterance(raw, ctx, { dialogue: true, pending: true });

  if (nlu.intent === 'meta.cancel') return cancelledOut(a.target, last);

  const nluTarget = targetOfIntent(nlu.intent);
  const sameIntent = !!nluTarget && sameTarget(nluTarget, a.target);
  if (nluTarget && !sameIntent && nlu.confidence >= CONF_SWITCH - 1e-9 && !nlu.intentAmbiguous) {
    return { state, out: { type: 'pass' } };
  }

  // «corregir» / «no, eran 600»: cambia datos ya dados (incluso los que no se están preguntando).
  if (nlu.intent === 'meta.correct') {
    const patch = correctionPatch(a.target, raw, ctx);
    if (Object.keys(patch).length === 0) {
      // Sin datos nuevos: vuelve a preguntar el último slot ya contestado.
      const filled = specs.filter(s => !isEmpty(stripHidden(a.slots)[s.key]));
      const prev = filled.length > 0 ? filled[filled.length - 1].key : pendingKey;
      const slots = { ...a.slots };
      if (prev !== pendingKey) delete slots[prev];
      return stateAsk(a.target, slots, ctx, a.origin, prev, 0, last, 'De acuerdo.');
    }
    const slots: SlotMap = { ...a.slots };
    for (const k of Object.keys(patch)) {
      slots[k] = patch[k];
      delete slots[AMB_PREFIX + k];
    }
    return advance(a.target, slots, ctx, a.origin, newId, last);
  }

  // Respuesta normal al slot pendiente (+ lo demás que traiga el mensaje).
  const ext = extractSlotsFor(a.target, raw, ctx);
  const slots: SlotMap = { ...a.slots };
  let filled = false;
  let err: string | undefined;
  let chips: Chip[] | undefined;
  let attempted = false;
  if (spec) {
    if (!(sameIntent && nlu.confidence >= CONF_ACT && spec.type === 'text')) {
      attempted = true;
      const ans = parseSlotAnswer(spec, raw, ctx, stripHidden(slots));
      if (ans.value !== undefined) { slots[pendingKey] = ans.value; filled = true; }
      else { err = ans.error; chips = ans.chips; }
    }
    if (!filled && !attempted && !isEmpty(ext.slots[pendingKey])) { slots[pendingKey] = ext.slots[pendingKey]; filled = true; }
  }
  if (!filled) {
    if (chips && chips.length > 0) {
      const s2 = { ...a.slots, [AMB_PREFIX + pendingKey]: JSON.stringify(chips) };
      return stateAsk(a.target, s2, ctx, a.origin, pendingKey, a.failures + 1 >= MAX_FAILURES ? MAX_FAILURES - 1 : a.failures + 1, last, err);
    }
    return fail(err);
  }
  delete slots[AMB_PREFIX + pendingKey];

  const cleanNow = stripHidden(slots);
  for (const k of Object.keys(ext.slots)) {
    if (k === pendingKey || isEmpty(ext.slots[k]) || !isEmpty(cleanNow[k])) continue;
    slots[k] = ext.slots[k];
  }
  for (const am of ext.ambiguities) {
    if (am.slot !== pendingKey && isEmpty(stripHidden(slots)[am.slot]) && am.chips.length > 0) {
      slots[AMB_PREFIX + am.slot] = JSON.stringify(am.chips);
    }
  }
  return advance(a.target, slots, ctx, a.origin, newId, last);
}

// ─────────────────────────────────────────────────────────────
// Tarjeta ya mostrada: editar y corregir
// ─────────────────────────────────────────────────────────────

/** Aplica los cambios de «Editar» (o de Gemini) a una propuesta: mismo proposalId, resumen y avisos nuevos. */
export function applyEdit(p: ActionProposal, patch: SlotMap, ctx: AssistantContext): ActionProposal {
  const merged: SlotMap = { ...p.slots };
  for (const k of Object.keys(patch)) {
    if (isEmpty(patch[k])) delete merged[k];
    else merged[k] = patch[k] as SlotValue;
  }
  // Cambiar de gasto a ingreso invalida la categoría anterior: se vuelve a adivinar (o a pedir).
  if (p.actionId === 'create_transaction' && 'tx_type' in patch && patch.tx_type !== p.slots.tx_type && !('category' in patch)) {
    delete merged.category;
  }
  const next = makeProposal(p.actionId, merged, ctx, p.origin, p.proposalId);
  return { ...next, status: 'pending' };
}

/**
 * «No, eran 600», «mejor en supermercado»: actualiza la MISMA tarjeta (mismo proposalId). Devuelve null si
 * la propuesta ya no está pendiente o si el mensaje no trae ningún dato que cambiar.
 */
export function applyCorrection(p: ActionProposal, raw: string, ctx: AssistantContext): ActionProposal | null {
  if (p.status !== 'pending') return null;
  const patch = correctionPatch({ type: 'action', id: p.actionId }, raw, ctx);
  const changed: SlotMap = {};
  for (const k of Object.keys(patch)) {
    if (JSON.stringify(patch[k]) !== JSON.stringify(p.slots[k])) changed[k] = patch[k];
  }
  if (Object.keys(changed).length === 0) return null;
  return applyEdit(p, changed, ctx);
}
