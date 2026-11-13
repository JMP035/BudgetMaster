// NLU local del asistente: clasificador de intención por reglas con pesos + extracción de slots.
// Módulo PURO: sin react-native ni AsyncStorage (de ../storage solo `import type`). Hermes: sin
// lookbehind, sin grupos con nombre, sin flags s/v/u. Todo texto se normaliza con `normalizeWithMap`.
//
// Clasificador (§3 del plan): cada regla de RULES aporta un peso si su frase aparece. El puntaje de una
// intención es la suma de sus pesos recortada a [0, 1]. Las reglas 'support' solo cuentan si la
// intención ya tiene alguna regla 'strong' (un verbo de crear o un monto solos no bastan) y las
// 'negative' restan. La confianza es el puntaje más alto; si la diferencia con el segundo es menor a
// 0.15 la intención se marca ambigua y la confianza baja de CONF_ACT (el Router pregunta con chips).
import type { Chip, DialogueTarget, IntentId, SlotMap, SlotValue } from './types';
import type { AssistantContext } from './types';
import { formatMoney } from '../format';
import { fuzzyEq, hasPhrase, normalizeWithMap, tokens } from './Text';
import type { AmountMatch } from './AmountParser';
import { extractAmounts } from './AmountParser';
import { extractDate, extractDayOfMonth, extractRange } from './DateParser';
import {
  categoryCandidates, categoryChips, extractFixedName, extractGoalName, extractTxDescription,
  resolveAccount, resolveCategories, resolveMerchant,
} from './Lexicon';

/** Confianza mínima para actuar sin preguntar. */
export const CONF_ACT = 0.6;
/** Por debajo de esto la frase no se entiende (`unknown`); entre ambos valores se aclara. */
export const CONF_CLARIFY = 0.35;
/** Diferencia mínima entre la primera y la segunda intención; menos que esto = ambigua. */
export const AMBIGUITY_GAP = 0.15;

/** Frases de ejemplo que se muestran en la ayuda («qué puedes hacer»). */
export const ASSISTANT_EXAMPLES: string[] = [
  '¿Cuánto gasté en Restaurantes este período?',
  'Muéstrame los movimientos de Spotify',
  '¿Qué gastos fijos me faltan por pagar?',
  'Crea una meta de Q5,000 para una laptop en diciembre',
  'Ponle un límite de Q800 a Restaurantes',
  'Agrega Netflix de $15.99 el 5 de cada mes',
  'Gasté 85 en gasolina ayer',
  'Me pagaron Q6,000 de sueldo',
];

// ─────────────────────────────────────────────────────────────
// Tipos públicos
// ─────────────────────────────────────────────────────────────

export interface Ambiguity { slot: string; chips: Chip[] }

export interface NluResult {
  intent: IntentId;
  confidence: number;
  second?: { intent: IntentId; confidence: number };
  slots: SlotMap;
  ambiguities: Ambiguity[];
  /** Reglas que dispararon, como «intención|clase|peso|frase» (para depurar). */
  rules: string[];
  /** Las dos intenciones principales casi empatan: `confidence` quedó por debajo de CONF_ACT. */
  intentAmbiguous?: boolean;
  /** Hasta 3 intenciones con puntaje > 0, de mayor a menor (útil para los chips de aclaración). */
  candidates: { intent: IntentId; confidence: number }[];
}

/** Estado de la conversación: sirve para no leer «sí»/«no»/«mejor 600» como metas si no hay nada pendiente. */
export interface UtteranceState {
  dialogue?: boolean;   // hay un diálogo de slots abierto
  pending?: boolean;    // hay una tarjeta de propuesta pendiente
}

export type RuleKind = 'strong' | 'support' | 'negative';

/**
 * Regla del clasificador. Sintaxis de `phrases` (alternativas, basta una):
 *  - palabras separadas por espacio = frase contigua («cuanto gaste»);
 *  - `a&b` = ambas frases presentes en cualquier orden;
 *  - `~palabra` = esa palabra tolera errores de ortografía (fuzzyEq); sin `~` es exacta.
 * `when` son condiciones sobre el texto (todas deben cumplirse): amount, category, date, day, range,
 * merchant, account, verb (verbo imperativo de crear), cverb (verbo o «nuevo/a»), name (nombre libre de
 * meta), entity, `!cond` para negarlas y `len<=N` para el número de palabras. Una regla sin frases se
 * dispara solo con sus condiciones. `whole`: todas las palabras del texto deben ser de las frases
 * («sí», «dale, va»): evita que «si» dentro de una oración cuente como confirmación.
 */
export interface NluRule {
  intent: IntentId;
  phrases: string[];
  weight: number;       // negativo en las 'negative'
  kind: RuleKind;
  when?: string[];
  whole?: boolean;
}

// ─────────────────────────────────────────────────────────────
// Tabla de reglas
// ─────────────────────────────────────────────────────────────

const GOAL: IntentId = 'create.create_goal';
const BUDGET: IntentId = 'create.set_category_budget';
const FIXED: IntentId = 'create.create_fixed_expense';
const TX: IntentId = 'create.create_transaction';
const Q_SPEND: IntentId = 'query.spending_total';
const Q_LIST: IntentId = 'query.list_movements';
const Q_FIXED: IntentId = 'query.fixed_pending';
const Q_BUDGET: IntentId = 'query.budget_status';
const Q_GOALS: IntentId = 'query.goals_status';

/** Producto cartesiano «a&b» de dos listas de frases. */
function x(a: string[], b: string[]): string[] {
  const out: string[] = [];
  for (const p of a) for (const q of b) out.push(`${p}&${q}`);
  return out;
}

export const RULES: NluRule[] = [];
function rule(intent: IntentId, kind: RuleKind, weight: number, phrases: string[], when?: string[], whole?: boolean): void {
  RULES.push({ intent, kind, weight: kind === 'negative' ? -Math.abs(weight) : weight, phrases, when, whole });
}

/** Palabras que hacen sonar la frase a consejo o pregunta abierta (restan a las acciones). */
const ADVICE_WORDS = [
  'plan', 'consejo', 'consejos', 'recomienda', 'recomiendas', 'recomendacion', 'puedo', 'deberia', 'debo', 'conviene',
  'como puedo', 'como hago', 'como logro', 'cuanto debo', 'cuanto deberia', 'sera posible', 'me alcanza', 'ideal',
];
/** Formas de consulta («cómo van…», «cuánto me queda…»). */
const QUERY_FORMS = [
  'como van', 'como va', 'como vamos', 'como voy', 'como esta', 'como estan', 'estado', 'progreso', 'avance',
  'cuanto me queda', 'cuanto queda', 'cuanto llevo', 'cuanto he gastado', 'muestrame', 'mostrame', 'revisa', 'ver',
];

// ── create.create_goal ──
rule(GOAL, 'strong', 0.6, [
  'meta', 'meta de ahorro', 'objetivo de ahorro', 'quiero ahorrar', 'necesito ahorrar', 'quisiera ahorrar',
  'voy a ahorrar', 'quiero ~ahorrar', '~ahorrar para', '~juntar para', '~reunir para', 'quiero juntar', 'quiero reunir',
  'ahorrar&para', 'quiero guardar para',
]);
rule(GOAL, 'support', 0.3, [], ['cverb']);
rule(GOAL, 'support', 0.15, [], ['amount']);
rule(GOAL, 'support', 0.1, [], ['date']);
rule(GOAL, 'support', 0.1, [], ['name']);
rule(GOAL, 'negative', 0.5, ADVICE_WORDS);
rule(GOAL, 'negative', 0.6, [
  'como va', 'como van', 'como vamos', 'cuanto llevo', 'cuanto he ahorrado', 'cuanto falta', 'cuanto me falta',
  'estado', 'progreso', 'avance', 'mis metas', 'muestrame', 'mostrame', 'ver mis',
]);

// ── create.set_category_budget ──
rule(BUDGET, 'strong', 0.6, [
  'presupuesto', 'limite', 'limites', 'tope', 'topes', 'maximo', 'no gastar mas de', 'no gastar mas que',
  'no pasarme de', 'no pasar de', '~limitar', 'limita', 'limitame', 'limitarme', '~presupuestar', 'presupuesta',
  'presupuestame', 'no gastar mas', 'gastar mas de',
]);
rule(BUDGET, 'support', 0.2, [], ['category']);
rule(BUDGET, 'support', 0.15, [], ['amount']);
rule(BUDGET, 'support', 0.2, [], ['cverb']);
rule(BUDGET, 'negative', 0.5, QUERY_FORMS, ['!amount']);
rule(BUDGET, 'negative', 0.5, ADVICE_WORDS);

// ── create.create_fixed_expense ──
rule(FIXED, 'strong', 0.6, [
  'gasto fijo', 'pago fijo', 'gasto recurrente', 'pago recurrente', 'cada mes', 'todos los meses', '~mensualmente',
  'de cada mes',
]);
rule(FIXED, 'strong', 0.35, ['mensual', '~suscripcion']);
rule(FIXED, 'support', 0.25, [], ['day']);
rule(FIXED, 'support', 0.15, [], ['amount']);
rule(FIXED, 'support', 0.2, [], ['cverb']);
rule(FIXED, 'negative', 0.6, [
  'faltan', 'falta', 'pendiente', 'pendientes', 'por pagar', 'no he pagado', 'vencido', 'vencidos', 'cuales', 'cuanto',
  'que gastos', 'que pagos', 'muestrame', 'mostrame',
]);
rule(FIXED, 'negative', 0.5, ADVICE_WORDS);

// ── create.create_transaction ──
rule(TX, 'strong', 0.6, [
  'gaste', 'gastamos', 'pague', 'pagamos', 'compre', 'compramos', 'me cobraron', 'me cargaron', 'me debitaron',
  'me descontaron', 'se me fueron', 'gastee',
]);
rule(TX, 'strong', 0.6, [
  'me pagaron', 'me depositaron', 'me cayo', 'me cayeron', 'me entro', 'me entraron', 'me llego', 'me abonaron', 'me transfirieron',
  'me acreditaron', 'recibi', 'cobre', 'ingreso de', 'ingrese', 'gane', 'me pago', 'me dieron', 'vendi',
]);
rule(TX, 'strong', 0.6, x(
  ['registra', 'registrar', 'registrame', 'anota', 'anotar', 'anotame', 'apunta', 'apuntame', 'agrega', 'agregame',
    'agregar', 'anade', 'anademe', 'crea', 'creame', 'suma', 'guarda', 'guardame'],
  ['gasto', 'ingreso', 'compra', 'movimiento', 'pago', 'venta'],
));
rule(TX, 'strong', 0.5, ['un gasto de', 'un ingreso de', 'nuevo gasto', 'nuevo ingreso']);
rule(TX, 'support', 0.2, [], ['amount']);
rule(TX, 'support', 0.1, [], ['category']);
rule(TX, 'negative', 0.6, ['puedo', 'me alcanza', 'deberia', 'conviene', 'debo', 'plan', 'consejo', 'recomienda', 'recomiendas']);
rule(TX, 'negative', 0.4, ['~cuanto', '~cuantos', '~cuanta', '~cuantas']);
rule(TX, 'negative', 0.5, ['que gaste', 'en que gaste', 'donde gaste', 'que compre', 'en que se me fue', 'en que he gastado']);
rule(TX, 'negative', 0.6, ['gasto fijo', 'pago fijo', 'cada mes', 'todos los meses', '~mensualmente', 'de cada mes', 'gastos fijos', 'gasto recurrente', 'pago recurrente']);

// ── query.spending_total ──
rule(Q_SPEND, 'strong', 0.6, [
  '~cuanto gaste', '~cuanto he gastado', '~cuanto gastamos', '~cuanto gasto', '~cuanto llevo', '~cuanto pague',
  '~cuanto he pagado', '~cuanto me entro', '~cuanto ingrese', '~cuanto he ingresado', '~cuanto he ganado',
  '~cuanto gane', '~cuanto me han pagado', '~cuanto me cayo', '~cuanto se me fue', '~cuanto me vole',
  '~cuanto me fundi', '~cuanto gastaron', '~cuanto va gastado', '~cuanto suma',
  'total de gastos', 'total de ingresos', 'total gastado', 'total en', 'total de', 'gastos totales', 'el total',
  '~cuanto&en total', '~cuanto&gastado',
]);
rule(Q_SPEND, 'support', 0.15, [], ['range']);
rule(Q_SPEND, 'support', 0.15, [], ['category']);
rule(Q_SPEND, 'support', 0.15, [], ['merchant']);
rule(Q_SPEND, 'negative', 0.4, [], ['verb']);
rule(Q_SPEND, 'negative', 0.6, ['ahorrado', 'ahorrando', 'ahorre', 'ahorrar']);
rule(Q_SPEND, 'negative', 0.5, ['falta', 'faltan', 'pendiente', 'pendientes', 'por pagar']);

// ── query.list_movements ──
rule(Q_LIST, 'strong', 0.6, [
  ...x(
    ['muestrame', 'mostrame', 'ensename', 'ver', 'veo', 'lista', 'listame', 'listar', 'dame', 'dime', 'quiero ver',
      'revisa', 'revisar', 'consulta', 'consultar', 'detalle', 'detalles', 'abre', 'mostrar', 'muestra', 'ensenar'],
    ['~movimientos', 'movimiento', 'gastos', 'compras', 'pagos', '~transacciones', 'ingresos', '~historial'],
  ),
  '~movimientos', 'mis movimientos', 'ultimos gastos', 'ultimas compras', 'historial de', 'que he comprado',
  'en que he gastado', 'en que gaste', 'en que se me fue', 'que gaste', 'donde gaste', 'detalle de gastos',
]);
rule(Q_LIST, 'strong', 0.4, ['gastos de', 'gastos en', 'compras de', 'compras en', 'ingresos de']);
rule(Q_LIST, 'support', 0.2, [], ['merchant']);
rule(Q_LIST, 'support', 0.1, [], ['range']);
rule(Q_LIST, 'support', 0.1, [], ['category']);
rule(Q_LIST, 'negative', 0.5, ['pendientes', 'pendiente', 'fijos', 'faltan', 'falta', 'metas', 'presupuestos', 'por pagar']);
rule(Q_LIST, 'negative', 0.5, ['cuanto', 'cuantos', 'cuanta']);
rule(Q_LIST, 'negative', 0.4, [], ['amount', 'verb']);

// ── query.fixed_pending ──
rule(Q_FIXED, 'strong', 0.6, [
  'gastos fijos', 'pagos fijos', 'mis gastos fijos', 'pagos pendientes', 'gastos pendientes', 'facturas pendientes',
  'recibos pendientes', 'que me falta pagar', 'que falta pagar', 'que me falta por pagar', 'que falta por pagar',
  'que debo pagar', 'que tengo que pagar', 'que tengo por pagar', 'que pagos tengo', 'que pagos faltan',
  'proximos pagos', 'pagos vencidos', 'gastos vencidos', 'que se vence', 'que vence',
  '~cuanto&falta&pagar',
]);
rule(Q_FIXED, 'strong', 0.4, x(['gastos fijos', 'pagos fijos', 'gasto fijo', 'pago fijo'], [
  'faltan', 'falta', 'pendientes', 'pendiente', 'por pagar', 'no he pagado', 'sin pagar', 'vencidos', 'vencido',
]));
rule(Q_FIXED, 'negative', 0.3, [], ['verb']);
rule(Q_FIXED, 'negative', 0.6, ['cada mes', 'todos los meses', '~mensualmente']);

// ── query.budget_status ──
rule(Q_BUDGET, 'strong', 0.5, ['presupuestos', 'mis presupuestos']);
rule(Q_BUDGET, 'strong', 0.8, [
  ...x(
    ['como van', 'como voy', 'como vamos', 'como va', 'como estan', 'como esta', 'estado de', 'estado del', 'estatus',
      'revisa', 'revisar', 'muestrame', 'mostrame', 'ver', 'cuanto me queda', 'cuanto queda', 'avance de', 'que tal voy',
      'como me va', 'cuanto he gastado', 'cuanto llevo'],
    ['presupuesto', 'presupuestos'],
  ),
  'me queda&presupuesto', 'me pase&presupuesto', 'excedido&presupuesto', 'pase del presupuesto',
]);
rule(Q_BUDGET, 'strong', 0.8, [
  'cuanto me queda', 'cuanto queda', 'cuanto me sobra', 'cuanto me queda de', 'cuanto me queda en',
  ...x(['como voy', 'como va', 'como estoy', 'cuanto llevo', 'cuanto he gastado'], ['limite', 'tope']),
], ['category']);
rule(Q_BUDGET, 'strong', 0.35, ['presupuesto'], ['!amount', '!cverb']);
rule(Q_BUDGET, 'negative', 0.5, [], ['amount', 'verb']);
rule(Q_BUDGET, 'negative', 0.4, ['gaste', 'gastos de']);

// ── query.goals_status ──
rule(Q_GOALS, 'strong', 0.6, [
  'metas', 'mis metas', 'las metas', 'mi meta', '~cuanto&ahorrado', 'cuanto he ahorrado', 'cuanto tengo ahorrado',
  'cuanto llevo ahorrado',
]);
rule(Q_GOALS, 'strong', 0.8, [
  ...x(
    ['como va', 'como van', 'como vamos', 'como voy', 'cuanto', 'estado', 'progreso', 'avance', 'ver', 'muestrame',
      'mostrame', 'revisa', 'revisar'],
    ['meta', 'metas'],
  ),
]);
rule(Q_GOALS, 'negative', 0.5, [], ['cverb']);
rule(Q_GOALS, 'negative', 0.5, ['quiero ahorrar', 'ahorrar para', 'plan para ahorrar']);

// ── advice ──
rule('advice', 'strong', 0.6, [
  'puedo comprar', 'puedo gastar', 'puedo permitirme', 'puedo pagar', 'puedo ahorrar', 'me alcanza', 'me alcanzaria',
  'me alcanzara', 'conviene', 'me conviene', 'deberia', 'deberiamos', 'debo comprar', 'debo ahorrar', 'debo gastar',
  '~consejo', '~consejos', 'recomienda', 'recomiendas', '~recomendacion', '~recomendaciones', 'como voy', 'resumen',
  '~proyeccion', 'cuando me pagan', 'cuando cobro', 'deuda', 'deudas', '~visacuota', '~visacuotas', 'hola',
  'gracias', 'buenos dias', 'buenas tardes', 'buenas noches', 'buenas', 'que tal', 'como estoy', 'estoy gastando mucho',
  'gasto mucho', 'gastando demasiado', 'como puedo', 'como hago', 'como ahorrar', 'como ahorro', 'como reducir',
  'como bajo', 'como controlo', 'tips', 'analiza', '~analisis', '~situacion financiera', 'salud financiera',
  'tengo dinero para', 'es buena idea', 'vale la pena', 'cuanto debo ahorrar', 'cuanto deberia', 'cuanto puedo',
  'que opinas', 'que piensas', '~sugerencia', '~sugerencias', 'ideas para', 'ayudame a', 'ayudame con',
  'cuanto me queda', 'cuanto queda', 'cuanto me sobra', 'cuanto dinero me queda', 'cuanto tengo', 'cual es mi',
  'como van mis finanzas', 'mis finanzas', 'finanzas',
]);
rule('advice', 'strong', 0.7, [
  'plan para ahorrar', 'plan de ahorro', 'plan de pagos', 'plan para pagar', 'plan para salir', 'dame un plan',
  'armame un plan', 'hazme un plan', 'haceme un plan', 'un plan',
]);
rule('advice', 'strong', 0.45, ['plan']);

// ── meta ──
rule('meta.cancel', 'strong', 0.7, [
  'cancela', 'cancelar', 'cancelalo', 'cancelame', 'olvidalo', 'olvida eso', 'dejalo', 'dejalo asi', 'mejor no',
  'ya no', 'no quiero', 'no gracias', 'descarta', 'descartar', 'descartalo', 'nada', 'salir', 'detente', 'alto',
  'no importa', 'dejemoslo',
], ['len<=6']);
rule('meta.cancel', 'strong', 0.7, ['no', 'nel', 'nop', 'nope', 'cancela', 'cancelar', 'nada', 'dejalo', 'olvidalo'], undefined, true);
rule('meta.confirm', 'strong', 0.7, [
  'si', 'sii', 'dale', 'va', 'vaya', 'confirmo', 'confirmado', 'confirma', 'confirmar', 'ok', 'okey', 'okay', 'simon',
  'de', 'una', 'listo', 'claro', 'correcto', 'esta', 'bien', 'perfecto', 'sale', 'aja', 'guardalo', 'guardar',
  'hazlo', 'adelante', 'procede', 'por', 'favor', 'pues', 'sip', 'seguro', 'exacto', 'asi', 'es',
], undefined, true);
rule('meta.correct', 'strong', 0.7, [
  'no eran', 'no era', 'no fueron', 'no fue', 'no son', 'eran', 'era', 'fueron', 'mejor', 'cambia', 'cambialo',
  'cambiale', 'corrige', 'corrigelo', '~corregir', '~correccion', 'en realidad', 'perdon', 'me equivoque',
  'equivoque', 'quise decir', 'queria decir', 'que sea', 'que sean', 'mejor que sea', 'son',
], ['entity', 'len<=10']);
rule('meta.correct', 'strong', 0.6, ['no'], ['entity', 'len<=4']);
rule('meta.correct', 'strong', 0.6, ['corrige', 'corrigelo', '~corregir', '~correccion', 'cambia', 'cambialo', 'en realidad'], ['len<=4']);
rule('meta.help', 'strong', 0.7, [
  'ayuda', 'que puedes hacer', 'que sabes hacer', 'que haces', 'que puedo hacer', 'como funciona', 'como te uso',
  'como uso', 'comandos', 'opciones', 'ejemplos', 'que puedo preguntarte', 'que puedo pedirte', 'instrucciones', 'help',
  'menu', 'para que sirves', 'que eres', 'que sabes', 'que me puedes ayudar',
], ['len<=6']);
rule('meta.help', 'strong', 0.7, ['ayudame', 'ayudenme'], ['len<=2']);

// ─────────────────────────────────────────────────────────────
// Compilación y coincidencias
// ─────────────────────────────────────────────────────────────

interface Part { text: string; toks: string[]; fuzzy: boolean[]; anyFuzzy: boolean }
interface Compiled { rule: NluRule; alts: Part[][]; vocab: Set<string> | null }

function compilePart(src: string): Part {
  const toks: string[] = [];
  const fuzzy: boolean[] = [];
  for (const raw of src.split(' ')) {
    if (!raw) continue;
    if (raw.charAt(0) === '~') { toks.push(raw.slice(1)); fuzzy.push(true); }
    else { toks.push(raw); fuzzy.push(false); }
  }
  return { text: toks.join(' '), toks, fuzzy, anyFuzzy: fuzzy.some(f => f) };
}

const COMPILED: Compiled[] = RULES.map(r => {
  const alts = r.phrases.map(p => p.split('&').map(compilePart));
  let vocab: Set<string> | null = null;
  if (r.whole) {
    vocab = new Set<string>();
    for (const alt of alts) for (const part of alt) for (const t of part.toks) vocab.add(t);
  }
  return { rule: r, alts, vocab };
});

function partMatches(norm: string, toks: string[], part: Part): boolean {
  if (!part.anyFuzzy) return hasPhrase(norm, part.text);
  const n = part.toks.length;
  for (let i = 0; i + n <= toks.length; i++) {
    let ok = true;
    for (let k = 0; k < n; k++) {
      const t = toks[i + k];
      const p = part.toks[k];
      if (!(t === p || (part.fuzzy[k] && fuzzyEq(t, p)))) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

/** Imperativos de «crear/registrar» (restan a las consultas: «agrega…» no es una pregunta). */
const CREATE_VERBS = new Set([
  'crea', 'creame', 'cree', 'crear', 'creeme', 'crearme', 'haceme', 'hazme', 'agrega', 'agregame', 'agregar', 'agregue',
  'anade', 'anademe', 'anadir', 'anota', 'anotame', 'anotar', 'apunta', 'apuntame', 'registra', 'registrame', 'registrar',
  'pon', 'ponme', 'pone', 'ponle', 'ponla', 'ponlo', 'ponele', 'ponelo', 'ajusta', 'ajustar', 'fija', 'fijame', 'fijar', 'establece', 'establecer', 'define',
  'definir', 'configura', 'configurame', 'abre', 'abrime', 'abrir', 'guarda', 'guardame', 'programa', 'programame',
]);

interface Features {
  has(cond: string): boolean;
}

const INCOME_VERB_TOKENS = ['pagaron', 'depositaron', 'cayo', 'entro', 'llego', 'abonaron', 'transfirieron', 'acreditaron', 'recibi', 'cobre', 'ingreso', 'ingrese', 'gane', 'dieron', 'vendi'];

function customOf(ctx: AssistantContext) {
  return ctx.settings.customCategories ?? [];
}

function makeFeatures(raw: string, norm: string, map: number[], ctx: AssistantContext): Features {
  const toks = tokens(norm);
  const cache: Record<string, boolean> = {};
  const compute = (c: string): boolean => {
    switch (c) {
      case 'amount': return extractAmounts(norm).length > 0;
      case 'category':
        return resolveCategories(norm, customOf(ctx), 'expense').length > 0
          || resolveCategories(norm, customOf(ctx), 'income').length > 0;
      case 'date': return !!extractDate(norm, ctx.now, 'future') || !!extractDate(norm, ctx.now, 'past');
      case 'day': return !!extractDayOfMonth(norm);
      case 'range': return !!extractRange(norm, ctx);
      case 'merchant': return !!resolveMerchant(norm, ctx);
      case 'account': return resolveAccount(norm, ctx.accounts).length > 0;
      case 'verb': return toks.some(t => CREATE_VERBS.has(t));
      case 'cverb': return toks.some(t => CREATE_VERBS.has(t) || t === 'nuevo' || t === 'nueva');
      case 'name': {
        const consumed: [number, number][] = [];
        const d = extractDate(norm, ctx.now, 'future');
        if (d) consumed.push([d.start, d.end]);
        for (const a of extractAmounts(norm, { excludeSpans: consumed })) consumed.push([a.start, a.end]);
        return extractGoalName(raw, norm, map, consumed) !== null;
      }
      case 'entity':
        return compute('amount') || compute('category') || compute('date') || compute('day') || compute('account');
      default: {
        const m = /^len<=(\d+)$/.exec(c);
        if (m) return toks.length <= Number(m[1]);
        return false;
      }
    }
  };
  return {
    has(cond: string): boolean {
      const neg = cond.charAt(0) === '!';
      const key = neg ? cond.slice(1) : cond;
      if (!(key in cache)) cache[key] = key === 'entity' ? computeEntity(key) : compute(key);
      return neg ? !cache[key] : cache[key];
    },
  };
  function computeEntity(key: string): boolean {
    return key === 'entity' ? ['amount', 'category', 'date', 'day', 'account'].some(k => {
      if (!(k in cache)) cache[k] = compute(k);
      return cache[k];
    }) : false;
  }
}

const ACTION_INTENTS: IntentId[] = [GOAL, BUDGET, FIXED, TX, Q_SPEND, Q_LIST, Q_FIXED, Q_BUDGET, Q_GOALS, 'advice', 'meta.cancel', 'meta.confirm', 'meta.correct', 'meta.help'];

function clamp01(n: number): number {
  return n < 0 ? 0 : n > 1 ? 1 : n;
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}

export function targetOfIntent(intent: IntentId): DialogueTarget | null {
  if (intent.indexOf('create.') === 0) return { type: 'action', id: intent.slice(7) as never };
  if (intent.indexOf('query.') === 0) return { type: 'query', id: intent.slice(6) as never };
  return null;
}

// ─────────────────────────────────────────────────────────────
// parseUtterance
// ─────────────────────────────────────────────────────────────

/**
 * Clasifica un mensaje y extrae sus slots. Sin `state` no se filtra nada; con `state`, «sí/dale»
 * (confirm) y «no, eran 600» (correct) solo se reconocen si hay una tarjeta pendiente, y «no/cancela»
 * si hay una tarjeta o un diálogo abierto.
 */
export function parseUtterance(raw: string, ctx: AssistantContext, state?: UtteranceState): NluResult {
  const { norm, map } = normalizeWithMap(raw);
  const empty: NluResult = { intent: 'unknown', confidence: 0, slots: {}, ambiguities: [], rules: [], candidates: [] };
  if (!norm) return empty;

  const toks = tokens(norm);
  const f = makeFeatures(raw, norm, map, ctx);

  const sums = new Map<IntentId, number>();
  const strong = new Set<IntentId>();
  const fired: string[] = [];

  const matches = (c: Compiled): string | null => {
    const r = c.rule;
    if (r.when) for (const cond of r.when) if (!f.has(cond)) return null;
    if (c.vocab) {
      for (const t of toks) if (!c.vocab.has(t)) return null;
      return '(texto completo)';
    }
    if (c.alts.length === 0) return '(condiciones)';
    for (let i = 0; i < c.alts.length; i++) {
      if (c.alts[i].every(p => partMatches(norm, toks, p))) return r.phrases[i];
    }
    return null;
  };

  // 1) reglas fuertes y negativas; 2) apoyos solo si hay alguna fuerte.
  const hits: { c: Compiled; phrase: string }[] = [];
  for (const c of COMPILED) {
    const intent = c.rule.intent;
    if (state) {
      if (intent === 'meta.confirm' && !state.pending) continue;
      if (intent === 'meta.correct' && !state.pending && !state.dialogue) continue;
      if (intent === 'meta.cancel' && !state.pending && !state.dialogue) continue;
    }
    const phrase = matches(c);
    if (phrase === null) continue;
    hits.push({ c, phrase });
    if (c.rule.kind === 'strong') strong.add(intent);
  }
  for (const h of hits) {
    const r = h.c.rule;
    if (r.kind === 'support' && !strong.has(r.intent)) continue;
    if (r.kind === 'negative' && !strong.has(r.intent)) continue;
    sums.set(r.intent, (sums.get(r.intent) ?? 0) + r.weight);
    fired.push(`${r.intent}|${r.kind}|${r.weight}|${h.phrase}`);
  }

  const scored = ACTION_INTENTS
    .filter(i => strong.has(i))
    .map(i => ({ intent: i, confidence: round3(clamp01(sums.get(i) ?? 0)) }))
    .filter(s => s.confidence > 0)
    .sort((a, b) => b.confidence - a.confidence);

  const candidates = scored.slice(0, 3);
  if (scored.length === 0) return { ...empty, rules: fired };

  const top = scored[0];
  const second = scored.length > 1 ? scored[1] : undefined;

  if (top.confidence < CONF_CLARIFY) {
    return { intent: 'unknown', confidence: top.confidence, slots: {}, ambiguities: [], rules: fired, candidates };
  }

  let confidence = top.confidence;
  let intentAmbiguous = false;
  if (second && second.confidence >= CONF_CLARIFY && top.confidence - second.confidence < AMBIGUITY_GAP) {
    intentAmbiguous = true;
    if (confidence >= CONF_ACT) confidence = round3(CONF_ACT - 0.01);
  }

  const target = targetOfIntent(top.intent);
  const ex = target ? extractSlotsFor(target, raw, ctx)
    : top.intent === 'meta.correct' ? extractCorrectionSlots(norm, ctx)
      : { slots: {} as SlotMap, ambiguities: [] as Ambiguity[] };
  const out: NluResult = {
    intent: top.intent, confidence, slots: ex.slots, ambiguities: ex.ambiguities, rules: fired, candidates,
  };
  if (second) out.second = second;
  if (intentAmbiguous) out.intentAmbiguous = true;
  return out;
}

// ─────────────────────────────────────────────────────────────
// Extracción de slots
// ─────────────────────────────────────────────────────────────

type Span = [number, number];

function overlaps(a: number, b: number, spans: Span[]): boolean {
  for (const [s, e] of spans) if (a < e && s < b) return true;
  return false;
}

function amountSymbol(cur: string | null): string {
  return cur === 'USD' ? '$' : cur === 'EUR' ? '€' : cur === '£' ? '£' : cur === 'Q' ? 'Q' : '';
}

/**
 * Elige el monto del mensaje: con marcador de moneda gana sobre los que no lo tienen; si quedan varios
 * valores distintos es una ambigüedad (chips con cada uno). Todos los tramos se marcan como consumidos.
 */
function pickAmount(ms: AmountMatch[], out: SlotMap, amb: Ambiguity[], consumed: Span[]): void {
  if (ms.length === 0) return;
  for (const m of ms) consumed.push([m.start, m.end]);
  let pool = ms.filter(m => m.explicitCurrency);
  if (pool.length === 0) pool = ms;
  const distinct: AmountMatch[] = [];
  for (const m of pool) {
    if (!distinct.some(d => d.value === m.value && d.currency === m.currency)) distinct.push(m);
  }
  if (distinct.length === 1) {
    out.amount = distinct[0].value;
    if (distinct[0].currency) out.currency = distinct[0].currency;
    return;
  }
  amb.push({
    slot: 'amount',
    chips: distinct.slice(0, 3).map(m => ({
      label: formatMoney(m.value, m.currency ?? 'Q'),
      value: `${amountSymbol(m.currency)}${m.value}`,
    })),
  });
}

/** Categoría(s) del texto: una → slot; empate sobre el mismo tramo («gas») → chips. Devuelve la elegida. */
function pickCategory(
  norm: string, ctx: AssistantContext, type: 'expense' | 'income', consumed: Span[],
  out: SlotMap, amb: Ambiguity[], dropAliasesOf?: string,
): string | null {
  const custom = customOf(ctx);
  let matches = resolveCategories(norm, custom, type).filter(m => !overlaps(m.start, m.end, consumed));
  if (dropAliasesOf) {
    const label = normalizeWithMap(dropAliasesOf).norm;
    matches = matches.filter(m => !(hasPhrase(label, m.alias) || hasPhrase(m.alias, label) || label.indexOf(m.alias) >= 0));
  }
  if (matches.length === 0) return null;
  const first = matches[0];
  const tied = matches.filter(m => m.start === first.start && m.end === first.end);
  const ids = categoryCandidates(tied);
  if (ids.length > 1) {
    amb.push({ slot: 'category', chips: categoryChips(ids, custom, type) });
    return null;
  }
  out.category = first.id;
  return first.id;
}

function pickAccount(norm: string, ctx: AssistantContext, out: SlotMap, amb: Ambiguity[]): void {
  const accs = resolveAccount(norm, ctx.accounts);
  if (accs.length === 1) out.account = accs[0].id;
  else if (accs.length > 1) amb.push({ slot: 'account', chips: accs.slice(0, 4).map(a => ({ label: a.name, value: a.name })) });
}

const INCOME_Q_TOKENS = ['ingreso', 'ingresos', 'ingrese', 'ingresado', 'ganado', 'gane', 'entro', 'entraron', 'cobrado', 'cobre', 'depositaron', 'pagaron', 'cayo', 'recibi', 'recibido'];
const EXPENSE_Q_TOKENS = ['gasto', 'gastos', 'gaste', 'gastado', 'pague', 'pagado', 'compre', 'compras', 'compra'];

function queryTxType(toks: string[]): 'expense' | 'income' | null {
  if (toks.some(t => INCOME_Q_TOKENS.indexOf(t) >= 0)) return 'income';
  if (toks.some(t => EXPENSE_Q_TOKENS.indexOf(t) >= 0)) return 'expense';
  return null;
}

/** Tipo de un movimiento según el verbo que aparezca primero («gasté…», «me pagaron…»). */
export function txTypeFromText(toks: string[]): 'expense' | 'income' | null {
  const INCOME_EXTRA = ['pagaron', 'depositaron', 'cayo', 'cayeron', 'entraron', 'entro', 'llego', 'abonaron', 'transfirieron', 'acreditaron', 'recibi', 'cobre', 'ingreso', 'ingresos', 'ingrese', 'gane', 'dieron', 'vendi', 'abono', 'deposito'];
  const EXPENSE = ['gaste', 'gastamos', 'pague', 'pagamos', 'compre', 'compramos', 'cobraron', 'cargaron', 'debitaron', 'descontaron', 'gasto', 'compra', 'fueron', 'gastee'];
  let iIn = -1;
  let iEx = -1;
  toks.forEach((t, i) => {
    if (iIn < 0 && INCOME_EXTRA.indexOf(t) >= 0 && !(t === 'pagaron' && toks[i - 1] !== 'me')) iIn = i;
    if (iEx < 0 && EXPENSE.indexOf(t) >= 0 && t !== 'fueron') iEx = i;
  });
  // «me pagaron…» exige «me» delante; «pagaron» suelto no cuenta.
  if (iIn < 0 && iEx < 0) return null;
  if (iIn < 0) return 'expense';
  if (iEx < 0) return 'income';
  return iIn < iEx ? 'income' : 'expense';
}

/**
 * Extrae los slots que el mensaje trae para un objetivo (acción o consulta). Cada tramo consumido
 * (rango, fecha, día, monto) se excluye de los pasos siguientes para que «el 15» o «5 mil» no acaben
 * dentro de un nombre. Un empate (categoría «gas», dos cuentas «BAC», dos montos sueltos) no llena
 * el slot: se devuelve en `ambiguities` con chips para preguntar.
 */
export function extractSlotsFor(
  target: DialogueTarget, raw: string, ctx: AssistantContext,
): { slots: SlotMap; ambiguities: Ambiguity[] } {
  const { norm, map } = normalizeWithMap(raw);
  const out: SlotMap = {};
  const amb: Ambiguity[] = [];
  if (!norm) return { slots: out, ambiguities: amb };
  const toks = tokens(norm);
  const consumed: Span[] = [];

  if (target.type === 'query') {
    extractQuerySlots(target.id, norm, toks, ctx, out, amb, consumed);
    return { slots: out, ambiguities: amb };
  }

  switch (target.id) {
    case 'create_goal': {
      const dm = extractDate(norm, ctx.now, 'future');
      if (dm) { out.deadline = dm.date; consumed.push([dm.start, dm.end]); }
      pickAmount(extractAmounts(norm, { excludeSpans: consumed }), out, amb, consumed);
      const name = extractGoalName(raw, norm, map, consumed);
      if (name) out.name = name;
      break;
    }
    case 'set_category_budget': {
      pickAmount(extractAmounts(norm), out, amb, consumed);
      pickCategory(norm, ctx, 'expense', consumed, out, amb);
      break;
    }
    case 'create_fixed_expense': {
      const dy = extractDayOfMonth(norm);
      if (dy) { out.day = dy.day; consumed.push([dy.start, dy.end]); }
      pickAmount(extractAmounts(norm, { excludeSpans: consumed }), out, amb, consumed);
      const name = extractFixedName(raw, norm, map, consumed);
      if (name) out.name = name;
      pickCategory(norm, ctx, 'expense', consumed, out, amb);
      break;
    }
    case 'create_transaction': {
      let type = txTypeFromText(toks);
      const dm = extractDate(norm, ctx.now, 'past');
      if (dm) { out.date = dm.date; consumed.push([dm.start, dm.end]); }
      pickAmount(extractAmounts(norm, { excludeSpans: consumed }), out, amb, consumed);
      const catConsumed = consumed.slice();
      if (type === 'income') {
        pickCategory(norm, ctx, 'income', catConsumed, out, amb);
      } else {
        const got = pickCategory(norm, ctx, 'expense', catConsumed, out, amb);
        if (!got && type === null && amb.every(a => a.slot !== 'category')) {
          if (pickCategory(norm, ctx, 'income', catConsumed, out, amb)) type = 'income';
        }
      }
      if (type) out.tx_type = type;
      const desc = extractTxDescription(raw, norm, map, consumed);
      if (desc) out.description = desc;
      pickAccount(norm, ctx, out, amb);
      break;
    }
  }
  return { slots: out, ambiguities: amb };
}

/**
 * Datos que puede traer una corrección («no, eran 600», «cambia la categoría a comida»): monto, moneda y
 * categoría. La acción a la que se aplican la conoce quien tiene la tarjeta (Dialogue.applyCorrection).
 */
function extractCorrectionSlots(norm: string, ctx: AssistantContext): { slots: SlotMap; ambiguities: Ambiguity[] } {
  const out: SlotMap = {};
  const amb: Ambiguity[] = [];
  const consumed: Span[] = [];
  pickAmount(extractAmounts(norm), out, amb, consumed);
  if (!pickCategory(norm, ctx, 'expense', consumed, out, amb) && amb.every(a => a.slot !== 'category')) {
    pickCategory(norm, ctx, 'income', consumed, out, amb);
  }
  return { slots: out, ambiguities: amb };
}

function extractQuerySlots(
  id: string, norm: string, toks: string[], ctx: AssistantContext,
  out: SlotMap, amb: Ambiguity[], consumed: Span[],
): void {
  if (id === 'fixed_pending' || id === 'goals_status') return;

  if (id === 'budget_status') {
    pickCategory(norm, ctx, 'expense', consumed, out, amb);
    return;
  }

  // spending_total y list_movements: rango → tipo → categoría → cuenta → comercio
  const rg = extractRange(norm, ctx);
  if (rg) {
    const { start_i, end_i, ...range } = rg;
    out.range = range;
    consumed.push([start_i, end_i]);
  }
  const type = queryTxType(toks);
  if (type) out.tx_type = type;

  const amounts = extractAmounts(norm, { excludeSpans: consumed });
  for (const a of amounts) consumed.push([a.start, a.end]);

  const catSlots: SlotMap = {};
  const catAmb: Ambiguity[] = [];
  const catId = pickCategory(norm, ctx, type === 'income' ? 'income' : 'expense', consumed, catSlots, catAmb);
  pickAccount(norm, ctx, out, amb);

  const merchant = resolveMerchant(norm, ctx, { excludeSpans: consumed });
  if (merchant) {
    out.merchant = merchant.label;
    // «Spotify» es streaming pero, con movimientos de ese comercio, se filtra por comercio, no por categoría.
    const again: SlotMap = {};
    const againAmb: Ambiguity[] = [];
    const kept = pickCategory(norm, ctx, type === 'income' ? 'income' : 'expense', consumed, again, againAmb, merchant.label);
    if (kept) out.category = kept;
    else for (const a of againAmb) amb.push(a);
  } else {
    if (catId) out.category = catId;
    for (const a of catAmb) amb.push(a);
  }
}

export type { SlotValue };
