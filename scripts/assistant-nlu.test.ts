process.env.TZ = 'America/Guatemala';
// Pruebas del NLU del asistente (services/assistant/*). Sin dependencias:
//   npm run test:assistant   →   sucrase-node scripts/assistant-nlu.test.ts
// Los bloques siguientes del plan amplían este archivo (montos, fechas, léxico, NLU).

import { parseAmount, formatDateOnly, parseDateOnly } from '../services/DateAmount';
import { fuzzyEq, hasPhrase, hasWordFuzzy, normalizeWithMap, tokens } from '../services/assistant/Text';
import { EMPTY_DIALOGUE } from '../services/assistant/types';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

// ── DateAmount (movido desde storage.ts: mismo comportamiento) ──
check('parseAmount 1,500.50', parseAmount('1,500.50') === 1500.5);
check('parseAmount 5,000', parseAmount('5,000') === 5000);
check('parseAmount 3.500 sigue siendo 3.5', parseAmount('3.500') === 3.5);
check('parseAmount 1.234.567', parseAmount('1.234.567') === 1234567);
check('parseAmount 12,5', parseAmount('12,5') === 12.5);
check('parseAmount inválido', Number.isNaN(parseAmount('abc')) && Number.isNaN(parseAmount('')));
check('formatDateOnly', formatDateOnly(new Date(2027, 2, 5, 12)) === '2027-03-05');
const pd = parseDateOnly('2027-03-15');
check('parseDateOnly válida', !!pd && pd.getFullYear() === 2027 && pd.getMonth() === 2 && pd.getDate() === 15 && pd.getHours() === 12);
check('parseDateOnly inválida', parseDateOnly('2027-02-30') === null && parseDateOnly('15/03/2027') === null);

// ── types ──
check('EMPTY_DIALOGUE', EMPTY_DIALOGUE.active === null && EMPTY_DIALOGUE.lastProposalId === null);

// ── normalizeWithMap ──
{
  const raw = '¿Cuánto gasté en Comida?';
  const r = normalizeWithMap(raw);
  check('norm básica', r.norm === 'cuanto gaste en comida', r.norm);
  check('map mismo largo', r.map.length === r.norm.length);
  const i = r.norm.indexOf('comida');
  check('map apunta al raw', raw.slice(r.map[i], r.map[i + 5] + 1) === 'Comida', raw.slice(r.map[i], r.map[i + 5] + 1));
}
check('ñ → n', normalizeWithMap('Año nuevo').norm === 'ano nuevo');
check('colapsa espacios y recorta', normalizeWithMap('  hola   ,, mundo!!  ').norm === 'hola mundo');
check('no colapsa letras repetidas', normalizeWithMap('cooool').norm === 'cooool');
check('vacío', normalizeWithMap('').norm === '' && normalizeWithMap('').map.length === 0);
check('solo signos', normalizeWithMap('¿?!.,').norm === '');
check('separador entre dígitos se conserva', normalizeWithMap('Q5,000.50').norm === 'q5,000.50', normalizeWithMap('Q5,000.50').norm);
check('3.500 y 1.5 intactos', normalizeWithMap('meta de 3.500 y 1.5 millones').norm === 'meta de 3.500 y 1.5 millones');
check('punto fuera de dígitos separa', normalizeWithMap('Q.500').norm === 'q 500', normalizeWithMap('Q.500').norm);
check('punto final', normalizeWithMap('pagué 500.').norm === 'pague 500');
check('fechas con / y -', normalizeWithMap('el 15/03 o 15-03-2027').norm === 'el 15/03 o 15-03-2027');
{
  const r = normalizeWithMap('Ahorro  para Mi Moto');
  check('map con espacios colapsados', r.norm === 'ahorro para mi moto' && r.map.every((v, k) => k === 0 || v >= r.map[k - 1]));
}

// ── tokens ──
check('tokens', JSON.stringify(tokens('gaste 50 en comida')) === '["gaste","50","en","comida"]');
check('tokens vacío', tokens('').length === 0);

// ── fuzzyEq ──
check('fuzzy igual', fuzzyEq('comida', 'comida'));
check('fuzzy <5 letras exacto', !fuzzyEq('gato', 'gata') && !fuzzyEq('luz', 'lux'));
check('fuzzy 5-7 letras tolera 1', fuzzyEq('comida', 'comid') && fuzzyEq('comida', 'comdia') && fuzzyEq('renta', 'rente'));
check('fuzzy 5-7 letras no tolera 2', !fuzzyEq('comida', 'comxxa'));
check('fuzzy >=8 tolera 2', fuzzyEq('restaurante', 'restuarnte') && fuzzyEq('supermercado', 'supermerkdo'));
check('fuzzy >=8 no tolera 3', !fuzzyEq('supermercado', 'supermxxxdo'));
check('fuzzy transposición cuenta 1', fuzzyEq('gasolina', 'gasoilna') && fuzzyEq('compras', 'compars'));
check('fuzzy con dígitos solo exacto', !fuzzyEq('100000', '100001') && fuzzyEq('100000', '100000'));
check('fuzzy diferencia grande de largo', !fuzzyEq('comida', 'comidaaaaa'));
check('fuzzy usa la palabra más corta', !fuzzyEq('luz', 'luzzzzzzzz'));

// ── hasPhrase / hasWordFuzzy ──
check('hasPhrase palabra', hasPhrase('quiero ahorrar para una moto', 'ahorrar'));
check('hasPhrase frase', hasPhrase('quiero ahorrar para una moto', 'para una'));
check('hasPhrase no a mitad de palabra', !hasPhrase('quiero ahorrar', 'ahorra') && !hasPhrase('gasolina', 'gas'));
check('hasPhrase bordes', hasPhrase('hola', 'hola') && hasPhrase('hola amigo', 'hola') && hasPhrase('di hola', 'hola'));
check('hasPhrase vacía', !hasPhrase('hola', ''));
check('hasWordFuzzy', hasWordFuzzy(tokens('gaste en comdia'), 'comida') && !hasWordFuzzy(tokens('gaste en cine'), 'comida'));

// ─────────────────────────────────────────────────────────────
// NLU: corpus de intención y slots (scripts/assistant-corpus.ts)
// ─────────────────────────────────────────────────────────────
import { CORPUS, buildCorpusContext } from './assistant-corpus';
import type { CorpusEntry, ExpectedSlot } from './assistant-corpus';
import {
  ASSISTANT_EXAMPLES, CONF_ACT, CONF_CLARIFY, RULES, extractSlotsFor, parseUtterance,
} from '../services/assistant/Nlu';
import type { NluResult } from '../services/assistant/Nlu';

const nctx = buildCorpusContext();
const flat = (s: string): string => normalizeWithMap(s).norm;

function slotMatches(exp: ExpectedSlot, got: unknown): boolean {
  if (typeof exp === 'number') return typeof got === 'number' && Math.abs(got - exp) < 1e-9;
  if (typeof exp === 'string') return typeof got === 'string' && (got === exp || flat(got) === flat(exp));
  const g = got as { start?: string; end?: string } | undefined;
  return !!g && g.start === exp.start && g.end === exp.end;
}

function evaluate(entry: CorpusEntry, r: NluResult): { intentOk: boolean; slotsOk: boolean; why: string[] } {
  const why: string[] = [];
  let intentOk = r.intent === entry.intent;
  if (!intentOk) why.push(`intención ${r.intent} (${r.confidence}) ≠ ${entry.intent}`);
  const isAct = entry.intent.indexOf('create.') === 0 || entry.intent.indexOf('query.') === 0;
  if (intentOk && isAct && r.confidence < CONF_ACT) { intentOk = false; why.push(`confianza ${r.confidence} < ${CONF_ACT}`); }
  if (intentOk && entry.intent === 'unknown' && r.confidence >= CONF_CLARIFY) { intentOk = false; why.push(`unknown con confianza ${r.confidence}`); }
  if (intentOk && isAct && r.intentAmbiguous) { intentOk = false; why.push('intención ambigua'); }

  let slotsOk = true;
  for (const k of Object.keys(entry.slots ?? {})) {
    if (!slotMatches((entry.slots as Record<string, ExpectedSlot>)[k], r.slots[k])) {
      slotsOk = false;
      why.push(`slot ${k}: esperado ${JSON.stringify((entry.slots as Record<string, ExpectedSlot>)[k])}, obtenido ${JSON.stringify(r.slots[k])}`);
    }
  }
  if (entry.amb) {
    const a = r.ambiguities.find(x => x.slot === entry.amb!.slot);
    const got = a ? a.chips.map(c => c.value).sort().join() : '';
    if (!a || got !== entry.amb.values.slice().sort().join()) {
      slotsOk = false;
      why.push(`ambigüedad ${entry.amb.slot}: esperada [${entry.amb.values.join()}], obtenida [${got}]`);
    }
    if (r.slots[entry.amb.slot] !== undefined) { slotsOk = false; why.push(`el slot ambiguo ${entry.amb.slot} no debe llenarse`); }
  }
  return { intentOk, slotsOk, why };
}

check('el corpus tiene al menos 250 frases', CORPUS.length >= 250, String(CORPUS.length));
check('ASSISTANT_EXAMPLES son las 8 frases del plan', ASSISTANT_EXAMPLES.length === 8);
check('RULES con las tres clases de regla', ['strong', 'support', 'negative'].every(k => RULES.some(r => r.kind === k)));
check('CONF_ACT y CONF_CLARIFY', CONF_ACT === 0.6 && CONF_CLARIFY === 0.35);

const stats = new Map<string, { n: number; intent: number; slots: number; all: number }>();
let coreTotal = 0;
let coreOk = 0;
let allOk = 0;
const corpusFails: string[] = [];
for (const entry of CORPUS) {
  const r = parseUtterance(entry.text, nctx, entry.state);
  const ev = evaluate(entry, r);
  const ok = ev.intentOk && ev.slotsOk;
  const st = stats.get(entry.intent) ?? { n: 0, intent: 0, slots: 0, all: 0 };
  st.n++;
  if (ev.intentOk) st.intent++;
  if (ev.slotsOk) st.slots++;
  if (ok) st.all++;
  stats.set(entry.intent, st);
  if (ok) allOk++;
  if (entry.core) { coreTotal++; if (ok) coreOk++; }
  if (!ok) corpusFails.push(`${entry.core ? '[core] ' : ''}«${entry.text}» → ${ev.why.join('; ')}`);
}

console.log('\nCorpus del NLU: aciertos por intención (intención / slots / todo)');
for (const [intent, st] of Array.from(stats.entries())) {
  console.log(`  ${intent.padEnd(32)} ${String(st.n).padStart(3)} frases   ${st.intent}/${st.n}   ${st.slots}/${st.n}   ${st.all}/${st.n}`);
}
const pct = allOk / CORPUS.length;
console.log(`  TOTAL ${allOk}/${CORPUS.length} (${(pct * 100).toFixed(1)} %), core ${coreOk}/${coreTotal}`);
if (corpusFails.length > 0) { console.log('\nFrases del corpus que no acertaron:'); for (const f of corpusFails) console.log('  - ' + f); }
check('corpus: 100 % en las frases core', coreOk === coreTotal, `${coreOk}/${coreTotal}`);
check('corpus: al menos 95 % global', pct >= 0.95, `${(pct * 100).toFixed(1)} %`);
for (const [intent, st] of Array.from(stats.entries())) {
  check(`corpus: ${intent} acierta al menos 90 %`, st.all / st.n >= 0.9, `${st.all}/${st.n}`);
}

// ── Las 8 frases de ejemplo se entienden solas ──
{
  const want: string[] = [
    'query.spending_total', 'query.list_movements', 'query.fixed_pending', 'create.create_goal',
    'create.set_category_budget', 'create.create_fixed_expense', 'create.create_transaction', 'create.create_transaction',
  ];
  ASSISTANT_EXAMPLES.forEach((t, i) => {
    const r = parseUtterance(t, nctx);
    check(`ejemplo «${t}» → ${want[i]}`, r.intent === want[i] && r.confidence >= CONF_ACT, `${r.intent} ${r.confidence}`);
  });
}

// ── Consejo vs acción ──
{
  const adv = parseUtterance('¿Puedo comprar algo de Q500?', nctx);
  check('«¿Puedo comprar algo de Q500?» es consejo y no acción', adv.intent === 'advice' && Object.keys(adv.slots).length === 0, adv.intent);
  const plan = parseUtterance('Dame un plan para ahorrar Q15,000', nctx);
  check('«Dame un plan para ahorrar Q15,000» es consejo, no meta', plan.intent === 'advice');
  const tx = parseUtterance('gasté 85 en gasolina ayer', nctx);
  check('«gasté 85 en gasolina ayer» es movimiento', tx.intent === 'create.create_transaction' && tx.confidence >= CONF_ACT);
}

// ── Estructura del resultado ──
{
  const r = parseUtterance('Gasté 85 en gasolina ayer', nctx);
  check('NluResult trae slots, ambiguities, rules y candidates', typeof r.slots === 'object' && Array.isArray(r.ambiguities) && r.rules.length > 0 && r.candidates.length > 0);
  check('rules documenta qué disparó', r.rules.some(x => x.indexOf('create.create_transaction|strong') === 0));
  check('confianza entre 0 y 1', r.confidence > 0 && r.confidence <= 1);
  const e0 = parseUtterance('', nctx);
  check('texto vacío → unknown con confianza 0', e0.intent === 'unknown' && e0.confidence === 0);
  const e1 = parseUtterance('¿¡?!', nctx);
  check('solo signos → unknown', e1.intent === 'unknown');
  const amb = parseUtterance('resumen de mis gastos fijos', nctx);
  check('empate meta/consejo marca intención ambigua y baja la confianza', amb.intentAmbiguous === true && amb.confidence < CONF_ACT, JSON.stringify([amb.intent, amb.confidence, amb.candidates]));
  check('la ambigua deja las dos candidatas', amb.candidates.length >= 2);
}

// ── Estado de la conversación ──
{
  check('«si» sin tarjeta pendiente no es confirmación', parseUtterance('si', nctx, { dialogue: false, pending: false }).intent !== 'meta.confirm');
  check('«si» con tarjeta pendiente sí lo es', parseUtterance('si', nctx, { pending: true }).intent === 'meta.confirm');
  check('«no» sin nada pendiente no cancela', parseUtterance('no', nctx, { dialogue: false, pending: false }).intent !== 'meta.cancel');
  check('«no» en un diálogo cancela', parseUtterance('no', nctx, { dialogue: true }).intent === 'meta.cancel');
  check('«no, eran 600» sin tarjeta no es corrección', parseUtterance('no, eran 600', nctx, { dialogue: false, pending: false }).intent !== 'meta.correct');
  check('«si gaste 50 en comida» no es confirmación aunque empiece con «si»', parseUtterance('si gaste 50 en comida', nctx, { pending: true }).intent === 'create.create_transaction');
  check('«dale pues» confirma', parseUtterance('dale pues', nctx, { pending: true }).intent === 'meta.confirm');
}

// ── extractSlotsFor directo ──
{
  const g = extractSlotsFor({ type: 'action', id: 'create_goal' }, 'Q5,000 para diciembre', nctx);
  check('extractSlotsFor goal: monto y fecha en una respuesta', g.slots.amount === 5000 && g.slots.deadline === '2026-12-31', JSON.stringify(g.slots));
  check('extractSlotsFor goal: sin nombre inventado', g.slots.name === undefined);
  const q = extractSlotsFor({ type: 'query', id: 'fixed_pending' }, 'que gastos fijos faltan', nctx);
  check('extractSlotsFor consulta sin slots', Object.keys(q.slots).length === 0 && q.ambiguities.length === 0);
  const two = extractSlotsFor({ type: 'action', id: 'create_transaction' }, 'gaste 100 o 200 en comida', nctx);
  check('dos montos sueltos → ambigüedad de monto con chips', two.slots.amount === undefined && two.ambiguities.some(a => a.slot === 'amount' && a.chips.length === 2), JSON.stringify(two));
  const usd = extractSlotsFor({ type: 'action', id: 'create_transaction' }, 'gaste 100 y $20 en amazon', nctx);
  check('gana el monto con moneda explícita', usd.slots.amount === 20 && usd.slots.currency === 'USD', JSON.stringify(usd.slots));
  const bac2 = buildCorpusContext({
    accounts: [
      ...nctx.accounts,
      { id: 'acc3', name: 'BAC Débito', type: 'bank', currency: 'Q', balance: 0, initialBalance: 0, color: '#fff', icon: 'card-outline', bankName: 'BAC', isActive: true, createdAt: '' },
    ],
  });
  const ac = extractSlotsFor({ type: 'action', id: 'create_transaction' }, 'gaste 50 en comida con bac', bac2);
  check('cuenta «bac» con dos cuentas BAC → chips', ac.slots.account === undefined && ac.ambiguities.some(a => a.slot === 'account' && a.chips.length === 2), JSON.stringify(ac));
  const one = extractSlotsFor({ type: 'action', id: 'create_transaction' }, 'gaste 50 en comida con bac', nctx);
  check('cuenta «bac» con una sola cuenta BAC → se llena', one.slots.account === 'acc1');
}

// ── Sin tocar el estado: parseUtterance es determinista y no muta el contexto ──
{
  const before = JSON.stringify(nctx.transactions);
  const a = parseUtterance('cuanto gaste en comida este mes', nctx);
  const b = parseUtterance('cuanto gaste en comida este mes', nctx);
  check('parseUtterance es determinista', JSON.stringify(a) === JSON.stringify(b));
  check('parseUtterance no muta el contexto', before === JSON.stringify(nctx.transactions));
  check('el rango de una consulta no filtra índices internos', !('start_i' in (a.slots.range as object)));
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
