// Pruebas del marcado ligero de los textos del tutorial (services/TutorialText.ts) y de las reglas de los pasos
// (límite de largo y de bloques, comillas balanceadas, ids únicos). La conservación del contenido está en
// scripts/tutorial-content.test.ts.
//   npm run test:tutorial-text   →   sucrase-node scripts/tutorial-text.test.ts
import { TUTORIALS } from '../services/TutorialData';
import type { Tutorial, TutorialStep } from '../services/TutorialData';
import { parseTutorialText, plainTutorialText, stepPlainLength } from '../services/TutorialText';

let failures = 0;
let checks = 0;
function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const MAX_PLAIN = 380;
const MAX_BLOCKS = 6;

// ═════════════ Parser ═════════════
console.log('Parser');
{
  const one = parseTutorialText('Un texto sin marcas.');
  check('sin marcas → 1 párrafo', one.length === 1 && one[0].kind === 'paragraph' && one[0].spans.length === 1);
  check('texto vacío → []', parseTutorialText('').length === 0);

  const two = parseTutorialText('Primero.\n\nSegundo.');
  check('\\n\\n → 2 párrafos', two.length === 2 && two.every(b => b.kind === 'paragraph'));

  const bl = parseTutorialText('En su detalle:\n• Uno.\n• Dos.');
  check('«• » → viñetas', bl.length === 3 && bl[0].kind === 'paragraph' && bl[1].kind === 'bullet' && bl[2].kind === 'bullet');
  check('la viñeta no conserva el «• »', bl[1].spans[0].text === 'Uno.');

  const note = parseTutorialText('Ojo: no se guarda con «Guardar».');
  check('«Ojo: » → note con etiqueta', note.length === 1 && note[0].kind === 'note' && note[0].label === 'Ojo:');
  check('la nota resalta lo que va entre «»', note[0].spans.some(s => s.highlight && s.text === '«Guardar»'));

  const ex = parseTutorialText('Ejemplo: Q 100 de supermercado.');
  check('«Ejemplo: » → example', ex.length === 1 && ex[0].kind === 'example' && ex[0].label === 'Ejemplo:');

  const hl = parseTutorialText('Toca «Guardar» o «Cancelar».');
  const marks = hl[0].spans.filter(s => s.highlight).map(s => s.text);
  check('«a» y «b» → 2 spans resaltados', marks.length === 2 && marks[0] === '«Guardar»' && marks[1] === '«Cancelar»', JSON.stringify(marks));
  check('las comillas se conservan en el texto plano', plainTutorialText('Toca «Guardar».') === 'Toca «Guardar».');

  const bad1 = parseTutorialText('Toca «Guardar sin cerrar.');
  check('« sin » → texto plano sin romper', bad1.length === 1 && bad1[0].spans.every(s => !s.highlight));
  const bad2 = parseTutorialText('Toca Guardar» y «Cancelar».');
  check('» antes de « → texto plano', bad2[0].spans.every(s => !s.highlight));

  check('plano: viñetas y saltos con espacios simples', plainTutorialText('Hola:\n• Uno.\n• Dos.\n\nFin.') === 'Hola: Uno. Dos. Fin.', plainTutorialText('Hola:\n• Uno.\n• Dos.\n\nFin.'));
  check('plano incluye la etiqueta de la nota', plainTutorialText('Ojo: cuidado.') === 'Ojo: cuidado.');
  check('stepPlainLength suma lead y cuerpo', stepPlainLength({ lead: 'Abc.', description: 'Def.' }) === 9);
  check('stepPlainLength sin lead', stepPlainLength({ description: 'Def.' }) === 4);
}

// ═════════════ Reglas de los pasos ═════════════
const smsOff = (t: Tutorial): Tutorial | null => {
  if (t.requiresSms) return null;
  return {
    ...t,
    steps: t.steps.filter(s => !s.requiresSms).map(s => ({
      ...s,
      lead: s.noSmsLead ?? s.lead,
      description: s.noSmsDescription ?? s.description,
      emptyHint: s.noSmsEmptyHint ?? s.emptyHint,
    })),
  };
};

// Tutoriales que todavía no pasaron al formato nuevo (se vacía al terminar la conversión).
const NOT_CONVERTED: string[] = ['tour_inicial', 'tutorial_inicio', 'tutorial_periodo', 'tutorial_sueldo', 'tutorial_presupuesto', 'tutorial_stats', 'tutorial_ia', 'tutorial_widget', 'tutorial_ajustes'];

const balanced = (s: string | undefined) => {
  if (!s) return true;
  let open = false;
  for (const ch of s) {
    if (ch === '«') { if (open) return false; open = true; }
    else if (ch === '»') { if (!open) return false; open = false; }
  }
  return !open;
};

function checkSteps(label: string, t: Tutorial, enforceLimits: boolean) {
  const ids = new Set<string>();
  for (const s of t.steps) {
    check(`${label}: id único (${s.id})`, !ids.has(s.id));
    ids.add(s.id);
    check(`${label}: ${s.id} tiene título`, s.title.trim().length > 0);
    check(`${label}: ${s.id} tiene descripción`, s.description.trim().length > 0);
    check(`${label}: «» balanceadas en ${s.id}`, [s.title, s.lead, s.noSmsLead, s.description, s.noSmsDescription, s.emptyHint, s.noSmsEmptyHint].every(balanced));
    if (enforceLimits) {
      const len = stepPlainLength(s);
      check(`${label}: ${s.id} ≤ ${MAX_PLAIN} caracteres (tiene ${len})`, len <= MAX_PLAIN);
      const blocks = parseTutorialText(s.description).length + (s.lead ? 1 : 0);
      check(`${label}: ${s.id} ≤ ${MAX_BLOCKS} bloques (tiene ${blocks})`, blocks <= MAX_BLOCKS);
    }
  }
}

console.log('Pasos con SMS');
for (const t of TUTORIALS) checkSteps(`${t.id}`, t, !NOT_CONVERTED.includes(t.id));

console.log('Pasos sin SMS');
for (const t of TUTORIALS) {
  const off = smsOff(t);
  if (off) checkSteps(`${t.id} (sin SMS)`, off, !NOT_CONVERTED.includes(t.id));
}

console.log('Campos opcionales coherentes');
{
  const all: TutorialStep[] = TUTORIALS.flatMap(t => t.steps);
  check('noSmsLead solo en pasos con lead', all.every(s => !s.noSmsLead || !!s.lead));
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
