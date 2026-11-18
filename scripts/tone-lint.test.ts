// Prueba anti-voseo: la app habla de «tú», nunca de «vos». Recorre services/, app/, context/, components/ y widgets/
// (.ts/.tsx) y falla si encuentra voseo en algo que el usuario puede leer (cadenas, plantillas, JSX, regex).
// Ignora los comentarios (// y /* */). Usa listas CERRADAS de voseo y, además, dos búsquedas generales con lista
// cerrada de palabras LEGÍTIMAS (un enclítico sin tilde —«ingresalo», «revisalas»— o un acabado en á/é/í que no se
// conozca falla hasta que se clasifique); «más», «después», «estás», «verás»… son legítimas. Sin dependencias:
//   npm run test:tone-lint   →   sucrase-node scripts/tone-lint.test.ts
import * as fs from 'fs';
import * as path from 'path';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

// ── Listas cerradas de voseo ─────────────────────────────────────────────────────────────────────────
// Pronombre y presente/imperativo con acento (lista de T1) + las que se encontraron en las pantallas (T2).
const PRESENT_AND_IMPERATIVE = [
  'vos', 'sos', 'tenés', 'podés', 'registrás', 'pagás', 'necesitás', 'escribís', 'llevás', 'elegís', 'debés', 'ahorrás',
  'usás', 'transferís', 'querés', 'editás', 'cobrás', 'abrís', 'sepás', 'fijás', 'eliminás', 'dejás', 'agregás',
  'terminás', 'seguís', 'planificás', 'pegás', 'marcás', 'mantenés', 'llegás', 'hacés', 'hablás', 'esperás',
  'encontrás', 'disponés', 'desmarcás', 'decidís', 'convertís', 'confirmás', 'cambiás', 'borrás', 'anotás',
  'actualizás', 'aceptás', 'tocá', 'creá', 'elegí', 'escribí', 'ingresá', 'agregá', 'registrá', 'usá', 'abrí',
  'activá', 'configurá', 'seguí', 'pegá', 'dejá', 'volvé', 'revisá', 'probá', 'mirá', 'mantené', 'entrá', 'definí',
  'anotá', 'separá', 'presioná', 'mencioná', 'listá', 'indicá', 'guardá', 'filtrá', 'esperá', 'escogé', 'editá',
  'considerá', 'cambiá', 'calculá', 'buscá', 'acá', 'respondé', 'recordá', 'poné', 'pedí', 'mové', 'mostrá', 'marcá',
  'empezá', 'deslizá', 'conocé', 'congelá', 'confirmá', 'completá', 'clasificá', 'bajá', 'aprendé', 'hacelo',
  'ponelo', 'decime', 'contame', 'fijate', 'andá',
  // T2: halladas en components/ (no estaban en la lista de T1)
  'podes', 'tocás', 'gastás', 'asignás', 'superás', 'llamás', 'ingresás', 'ganás', 'intentá', 'protegé', 'instalá',
  'verificá', 'sincronizá', 'planificá', 'personalizá', 'pagá', 'obtené', 'crecé', 'controlá', 'cerrá', 'asigná',
  'apuntá',
  // F1: voseo que el detector no veía (enclíticos sin tilde y un imperativo en -í)
  'corregí',
];

// Imperativo + pronombre enclítico (lista de T1). «dame» NO va: es igual en «tú» («dame un consejo»).
const ENCLITICS = [
  'abrila', 'abrilo', 'abrime', 'agregalas', 'agregalo', 'agregalos', 'agregame', 'activalo', 'arrastralo', 'cambiala',
  'cambiale', 'cambialo', 'cancelalo', 'cancelame', 'configuralo', 'configurame', 'decime', 'decilo', 'dejalo',
  'descartalo', 'guardalo', 'guardame', 'fijame', 'haceme', 'hacelo', 'muestrame', 'mostrame', 'ensename', 'enseñale',
  'corrigelo', 'creala', 'creame', 'creeme', 'escribime', 'escribenos', 'olvidalo', 'pagalo', 'pedile', 'pegalo',
  'ponele', 'ponelo', 'preguntale', 'preguntame', 'priorizalos', 'registrala', 'registrame', 'solicitalo', 'tocala',
  'tocalo', 'ayudame', 'ayudenme', 'anademe', 'anotame', 'apuntame', 'armame', 'limitame', 'listame', 'presupuestame',
  'programame', 'reinicialos', 'incluílas', 'vení', 'andá', 'contame', 'fijate', 'avisame',
  // T2
  'copiala', 'pegala',
  // F1
  'ingresalo', 'revisalas', 'asignalas', 'elegilo',
];

const WORDS = Array.from(new Set([...PRESENT_AND_IMPERATIVE, ...ENCLITICS]));
// Límites de palabra con Unicode (\b no entiende las tildes en JS): ni letra, ni dígito, ni «_» a los lados.
const VOSEO_RE = new RegExp(`(?<![\\p{L}\\p{N}_])(${WORDS.join('|')})(?![\\p{L}\\p{N}_])`, 'giu');

// ── Lista blanca (explícita y mínima) ────────────────────────────────────────────────────────────────
// Archivos que NO son texto que ve el usuario: reconocen lo que el usuario ESCRIBE (puede escribir en voseo, el
// asistente lo entiende) o son datos de bancos/comercios. Se excluyen completos.
const WHITELIST_FILES = new Map<string, string>([
  ['services/assistant/Lexicon.ts', 'léxico del asistente: reconoce voseo que el usuario escribe'],
  ['services/assistant/Nlu.ts', 'reglas del NLU: reconoce voseo que el usuario escribe'],
  ['services/assistant/AmountParser.ts', 'parser de montos: reconoce lo que el usuario escribe'],
  ['services/assistant/DateParser.ts', 'parser de fechas: reconoce lo que el usuario escribe'],
  ['services/assistant/Text.ts', 'normalización de texto del usuario (listas de formas escritas)'],
  ['services/BankSmsParser.ts', 'SMS de bancos: frases de promociones/avisos de terceros'],
  ['services/GuatemalaBrands.data.ts', 'catálogo de comercios: nombres propios (p. ej. «Pagalo»)'],
]);
// Líneas sueltas: las 2 regex del asistente local que RECONOCEN la escritura del usuario (no son texto mostrado).
const WHITELIST_LINES: { file: string; contains: string; word: string; why: string }[] = [
  { file: 'services/LocalAdvisorEngine.ts', contains: '(puedes|podes|sabes)', word: 'podes',
    why: 'regex que reconoce «qué podés hacer» escrito por el usuario' },
  { file: 'services/LocalAdvisorEngine.ts', contains: '|ayudame|', word: 'ayudame',
    why: 'regex que reconoce «ayudame» escrito por el usuario' },
];

// ── Detector ─────────────────────────────────────────────────────────────────────────────────────────
/** Devuelve el mismo texto con los comentarios (de línea y de bloque) reemplazados por espacios (conserva saltos de línea). */
function stripComments(src: string): string {
  const n = src.length;
  const out = src.split('');
  const blank = (a: number, b: number) => {
    for (let k = a; k < b; k++) if (out[k] !== '\n' && out[k] !== '\r') out[k] = ' ';
  };
  const stack: { t: 'tpl' | 'expr'; depth: number }[] = [];
  let i = 0;
  let last = ''; // último carácter significativo del código (para distinguir regex de división)
  let lastWord = '';
  const REGEX_PREV = new Set(['', '(', ',', '=', ':', '[', '!', '&', '|', '?', '{', '}', ';', '+', '-', '*', '%', '<', '>', '~', '^']);
  while (i < n) {
    const c = src[i];
    const d = src[i + 1];
    const top = stack[stack.length - 1];
    if (top && top.t === 'tpl') {
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { stack.pop(); i++; last = '`'; continue; }
      if (c === '$' && d === '{') { stack.push({ t: 'expr', depth: 0 }); i += 2; last = '{'; continue; }
      i++;
      continue;
    }
    if (top && top.t === 'expr') {
      if (c === '{') top.depth++;
      else if (c === '}') {
        if (top.depth === 0) { stack.pop(); i++; continue; }
        top.depth--;
      }
    }
    if (c === '/' && d === '/') {
      let j = src.indexOf('\n', i);
      if (j < 0) j = n;
      blank(i, j);
      i = j;
      continue;
    }
    if (c === '/' && d === '*') {
      const j = src.indexOf('*/', i + 2);
      const end = j < 0 ? n : j + 2;
      blank(i, end);
      i = end;
      continue;
    }
    if (c === '"' || c === "'") {
      let j = i + 1;
      while (j < n && src[j] !== c && src[j] !== '\n') {
        if (src[j] === '\\') j++;
        j++;
      }
      i = j + 1;
      last = c;
      continue;
    }
    if (c === '`') { stack.push({ t: 'tpl', depth: 0 }); i++; continue; }
    if (c === '/' && (REGEX_PREV.has(last) || lastWord === 'return' || lastWord === 'typeof')) {
      // Literal regex: se salta (su contenido se sigue analizando como texto; no es comentario).
      let j = i + 1;
      let inClass = false;
      let ok = false;
      while (j < n && src[j] !== '\n') {
        const ch = src[j];
        if (ch === '\\') { j += 2; continue; }
        if (ch === '[') inClass = true;
        else if (ch === ']') inClass = false;
        else if (ch === '/' && !inClass) { ok = true; break; }
        j++;
      }
      if (ok) {
        j++;
        while (j < n && /[a-z]/i.test(src[j])) j++;
        i = j;
        last = 'a';
        lastWord = '';
        continue;
      }
    }
    if (/\s/.test(c)) { i++; continue; }
    if (/[A-Za-z0-9_$]/.test(c)) {
      let j = i;
      while (j < n && /[A-Za-z0-9_$]/.test(src[j])) j++;
      lastWord = src.slice(i, j);
      last = 'a';
      i = j;
      continue;
    }
    last = c;
    lastWord = '';
    i++;
  }
  return out.join('');
}

interface Finding { line: number; word: string; text: string }

/** Busca voseo en el texto (sin comentarios). Devuelve línea (1-based) y palabra de cada hallazgo. */
function findVoseo(src: string): Finding[] {
  const lines = stripComments(src).split(/\r?\n/);
  const found: Finding[] = [];
  lines.forEach((text, idx) => {
    VOSEO_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = VOSEO_RE.exec(text)) !== null) found.push({ line: idx + 1, word: m[1], text: text.trim() });
  });
  return found;
}

// Búsqueda GENERAL 1: verbo + enclítico sin tilde (alo/ala/elo/ela/ilo/ila/ame/eme/ime…). En «tú» estas formas llevan
// tilde («ingrésalo», «revísalas», «asígnalas»); sin tilde son voseo. Solo palabras ASCII (la tilde las excluye) y sin
// mayúsculas internas (los identificadores camelCase no entran). Las palabras que solo se le parecen se listan aquí.
const GENERAL_ENCLITIC_RE = new RegExp(
  '(?<![\\p{L}\\p{N}_])[A-Za-z][a-z]*(?:alo|ala|alos|alas|elo|ela|elos|elas|ilo|ila|ilos|ilas|ame|eme|ime)(?![\\p{L}\\p{N}_])', 'gu');
const LEGIT_ENCLITIC_LOOKALIKES = new Set([
  'cancela', 'congela', 'instala', 'llame', 'dalo', 'dame', 'dilo', 'dime', // imperativos o subjuntivos iguales en «tú»
  'estilo', 'fila', 'filas', 'halo', 'modelos', 'vuelo', 'guatemala',        // sustantivos
  'name', 'pathname', 'same', 'time', 'theme', 'prime', 'frame',             // identificadores de código
]);

// Búsqueda GENERAL 2: palabras que acaban en á/é/í. Los imperativos del voseo («tocá», «corregí», «poné») acaban así,
// pero también los pretéritos («gasté», «entendí»), los futuros («borrará») y «qué», «aquí», «está»… Lista cerrada de
// las legítimas que hoy existen en el código; una nueva (voseo o no) falla hasta que se clasifique.
const GENERAL_ACCENT_RE = new RegExp('(?<![\\p{L}\\p{N}_])[A-Za-záéíóúñ][a-záéíóúñ]*[áéí](?![\\p{L}\\p{N}_])', 'gu');
const LEGIT_ACCENT_WORDS = new Set([
  'ahí', 'aquí', 'así', 'sí', 'qué', 'allá', 'está', 'esté', 'dé', 'sé', 'caché', 'mié', 'aá',
  'actualicé', 'descarté', 'eché', 'encontré', 'entendí', 'gasté', 'identifiqué', 'logré', 'recibí', 'reconocí', 'revisé',
  'aparecerá', 'armará', 'borrará', 'corregirá', 'creará', 'dejará', 'descontará', 'detectará', 'marcará', 'mostrará',
  'pedirá', 'podrá', 'preguntará', 'quitará', 'seguirá', 'tomará', 'unirá', 'usará', 'volverá',
]);

/** Busca las formas «generales» de voseo (ver arriba) en el texto sin comentarios. */
function findGeneral(src: string): Finding[] {
  const lines = stripComments(src).split(/\r?\n/);
  const found: Finding[] = [];
  lines.forEach((text, idx) => {
    for (const [re, legit] of [[GENERAL_ENCLITIC_RE, LEGIT_ENCLITIC_LOOKALIKES], [GENERAL_ACCENT_RE, LEGIT_ACCENT_WORDS]] as const) {
      re.lastIndex = 0;
      let m: RegExpExecArray | null;
      while ((m = re.exec(text)) !== null) {
        if (!legit.has(m[0].toLowerCase())) found.push({ line: idx + 1, word: m[0], text: text.trim() });
      }
    }
  });
  return found;
}

function isWhitelistedLine(file: string, f: Finding): boolean {
  return WHITELIST_LINES.some(w => w.file === file && w.word === f.word.toLowerCase() && f.text.includes(w.contains));
}

// ── Autotest del detector ────────────────────────────────────────────────────────────────────────────
const words = (s: string) => findVoseo(s).map(f => f.word.toLowerCase());

// Debe marcar
check('marca «Tocá aquí» en cadena', words('const a = "Tocá aquí";').join() === 'tocá');
check('marca «vos» suelto', words("const a = 'por vos';").join() === 'vos');
check('marca presente «tenés»', words('x("Si tenés dudas")').join() === 'tenés');
check('marca imperativo en plantilla', words('const a = `Elegí ${x} ahora`;').join() === 'elegí');
check('marca texto de plantilla tras ${}', words('const a = `${x} y podés ${y}`;').join() === 'podés');
check('marca enclítico «agregalo»', words('y("agregalo ya")').join() === 'agregalo');
check('marca mayúsculas «ELEGÍ OTRO INICIO»', words('<T>ELEGÍ OTRO INICIO</T>').join() === 'elegí');
check('marca «cerrá» (T2)', words('"Cerrá esta ventana"').join() === 'cerrá');
check('marca voseo dentro de regex (es código)', words('if (/que podes hacer/.test(m)) {}').join() === 'podes');
check('marca texto con «//» dentro de una cadena', words('const u = "http://x.com vos";').join() === 'vos');
check('marca tras un comentario de bloque cerrado', words('/* hola */ const a = "usás";').join() === 'usás');
check('informa la línea correcta', findVoseo('a\n// nada\n/* x\n y */\nconst b = "Pegá";')[0]?.line === 5);

// Formas nuevas (F1) y búsqueda general
check('marca «ingresalo manualmente» (lista cerrada)', words('footnote: "ingresalo manualmente"').join() === 'ingresalo');
check('marca «Revisalas en Cuentas» (lista cerrada)', words('"Revisalas en Cuentas"').join() === 'revisalas');
check('marca «Asignalas a una cuenta» (lista cerrada)', words('"Asignalas a una cuenta"').join() === 'asignalas');
check('marca «elegilo» (lista cerrada)', words('"o elegilo de tus mensajes"').join() === 'elegilo');
check('marca «corregí la categoría» (lista cerrada)', words("'corregí la categoría'").join() === 'corregí');
const gen = (s: string) => findGeneral(s).map(f => f.word.toLowerCase());
check('general: marca un enclítico sin tilde desconocido («tomalo»)', gen('"Tomalo ya"').join() === 'tomalo');
check('general: marca «ingresala», «revisalo», «asignalos», «elegila»', gen('"ingresala revisalo asignalos elegila"').join() === 'ingresala,revisalo,asignalos,elegila');
check('general: marca «dejame» y «mostrame»', gen('"dejame y mostrame"').join() === 'dejame,mostrame');
check('general: marca un imperativo en -á/-é/-í desconocido («Revisá», «Poné», «Decí»)', gen('"Revisá, Poné, Decí"').join() === 'revisá,poné,decí');
check('general: no marca la forma en «tú» con tilde («ingrésalo», «revísalas», «asígnalas»)', gen('"ingrésalo, revísalas, asígnalas, elígelo"').length === 0);
check('general: no marca palabras que solo se le parecen («regalo» NO está, «vuelo», «fila», «name»)', gen('"vuelo fila name time theme"').length === 0);
check('general: no marca identificadores camelCase', gen('const accountName = bankName; setTheme(prime);').join() === '');
check('general: no marca pretéritos y futuros conocidos', gen('"gasté, borrará, qué, aquí, está, entendí"').length === 0);
check('general: no marca comentarios', gen('// ingresalo ya\n/* Poné */ const a = 1;').length === 0);
check('general: «regalo» sin clasificar sí se marca (aviso de lista cerrada)', gen('"un regalo"').join() === 'regalo');

// No debe marcar
check('no marca «Toca aquí»', words('const a = "Toca aquí";').length === 0);
check('no marca palabras legítimas en -ás/-és', words('"más, después, estás, verás, además, demás, interés, atrás, tendrás"').length === 0);
check('no marca «dame un consejo» (igual en tú)', words("'Dame un consejo'").length === 0);
check('no marca «mantén» ni «cierra»', words('"Mantén presionado y cierra"').length === 0);
check('no marca comentario de línea', words('// Tocá aquí, vos podés').length === 0);
check('no marca comentario al final de línea', words('const a = 1; // podés cambiarlo').length === 0);
check('no marca comentario de bloque', words('/* tenés que hacerlo */ const a = 1;').length === 0);
check('no marca JSDoc multilínea', words('/**\n * Elegí un banco.\n * Tocá aquí.\n */\nconst a = 1;').length === 0);
check('no marca comentario dentro de ${}', words('const a = `x ${y /* podés */} z`;').length === 0);
check('no marca palabra dentro de otra («envos», «sosa»)', words('"envos sosa avos"').length === 0);

// Lista blanca
check('lista blanca: regex de LocalAdvisorEngine (podes)', isWhitelistedLine('services/LocalAdvisorEngine.ts',
  { line: 1, word: 'podes', text: "if (/que (puedes|podes|sabes) (hacer|responder)/.test(msg)) {" }));
check('lista blanca: regex de LocalAdvisorEngine (ayudame)', isWhitelistedLine('services/LocalAdvisorEngine.ts',
  { line: 1, word: 'ayudame', text: "if (/consejo|recomiend|que (debo)|ayudame|tip/.test(msg)) {" }));
check('lista blanca: no ampara otra línea del mismo archivo', !isWhitelistedLine('services/LocalAdvisorEngine.ts',
  { line: 1, word: 'podes', text: "return 'Podes ver tus gastos';" }));
check('lista blanca: no ampara otros archivos', !isWhitelistedLine('components/Dashboard.tsx',
  { line: 1, word: 'podes', text: "if (/que (puedes|podes|sabes) (hacer|responder)/.test(msg)) {" }));

// ── Recorrido de los archivos ────────────────────────────────────────────────────────────────────────
const ROOT = path.resolve(__dirname, '..');
const DIRS = ['services', 'app', 'context', 'components', 'widgets'];

function walk(dir: string, acc: string[] = []): string[] {
  if (!fs.existsSync(dir)) return acc;
  for (const name of fs.readdirSync(dir)) {
    const p = path.join(dir, name);
    if (fs.statSync(p).isDirectory()) walk(p, acc);
    else if (/\.tsx?$/.test(name)) acc.push(p);
  }
  return acc;
}

for (const rel of WHITELIST_FILES.keys()) {
  check(`lista blanca: existe ${rel}`, fs.existsSync(path.join(ROOT, rel)));
}
for (const w of WHITELIST_LINES) {
  check(`lista blanca: existe ${w.file}`, fs.existsSync(path.join(ROOT, w.file)));
}

let scanned = 0;
for (const dir of DIRS) {
  for (const abs of walk(path.join(ROOT, dir))) {
    const rel = path.relative(ROOT, abs).split(path.sep).join('/');
    if (WHITELIST_FILES.has(rel)) continue;
    scanned++;
    const text = fs.readFileSync(abs, 'utf8');
    const found = [...findVoseo(text), ...findGeneral(text)].filter(f => !isWhitelistedLine(rel, f));
    check(`sin voseo: ${rel}`, found.length === 0);
    for (const f of found) console.log(`  ${rel}:${f.line}:${f.word}   ${f.text.slice(0, 110)}`);
  }
}
check('se recorrieron archivos de las 5 carpetas', scanned > 50, `solo ${scanned}`);
check('se recorrió widgets/', walk(path.join(ROOT, 'widgets')).length >= 4);

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
