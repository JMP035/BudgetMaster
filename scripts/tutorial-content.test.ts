// Conservación del contenido del tutorial: al repartir los textos en pasos más cortos y darles formato NO se pierde
// información. Compara, por tutorial y por variante (con y sin SMS), las palabras de la foto «antes»
// (scripts/fixtures/tutorial-baseline.json) con las de ahora: todas las palabras de 3+ letras del ANTES deben estar
// presentes en el DESPUÉS (las palabras nuevas, como conectores, se permiten; al cortar una oración o pasar a viñetas
// una palabra repetida puede perder una aparición, así que se compara por presencia, no por conteo). Lista las que falten.
//   npm run test:tutorial-content   →   sucrase-node scripts/tutorial-content.test.ts
import * as fs from 'fs';
import * as path from 'path';
import { TUTORIALS } from '../services/TutorialData';
import type { Tutorial } from '../services/TutorialData';

let failures = 0;
let checks = 0;
function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

interface Snapshot { titles: string[]; steps: number; stepsNoSms: number | null; withSms: string; noSms: string | null }
const baseline: Record<string, Snapshot> = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'tutorial-baseline.json'), 'utf8'));

/**
 * Palabras que cambian a propósito (cambios de redacción aprobados) y que por eso pueden faltar en el DESPUÉS.
 * Cada entrada: tutorial → palabra → por qué.
 */
const ALLOWED_MISSING: Record<string, Record<string, string>> = {
  tutorial_cuentas: {
    etiqueta: 'patrón aprobado: «la etiqueta «Automático»» pasa a la viñeta «Automático»: …',
    demás: 'patrón aprobado: «en las demás cuentas» se escribe «en las cuentas que no son «Automático»» (al pasar a viñetas «las demás» pierde su referencia)',
  },
};

function words(text: string): Map<string, number> {
  const m = new Map<string, number>();
  const clean = text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ');
  for (const w of clean.split(' ')) {
    if (w.length < 3 && !/^[0-9]+$/.test(w)) continue;
    m.set(w, (m.get(w) ?? 0) + 1);
  }
  return m;
}

function missing(before: string, after: string, allowed: Record<string, string> = {}): string[] {
  const b = words(before);
  const a = words(after);
  const out: string[] = [];
  for (const [w, n] of b) {
    if (allowed[w]) continue;
    const have = a.get(w) ?? 0;
    if (have < 1) out.push(`${w} (${n}→${have})`);
  }
  return out;
}

const bodyOf = (s: { lead?: string; description: string; emptyHint?: string }) => [s.lead ?? '', s.description, s.emptyHint ?? ''].join('\n');

function currentText(t: Tutorial, noSms: boolean): string {
  const steps = noSms ? t.steps.filter(s => !s.requiresSms) : t.steps;
  return steps.map(s => noSms
    ? bodyOf({ lead: s.noSmsLead ?? s.lead, description: s.noSmsDescription ?? s.description, emptyHint: s.noSmsEmptyHint ?? s.emptyHint })
    : bodyOf(s)).join('\n\n');
}

console.log('Cobertura de la foto base');
check('todos los tutoriales de la foto base siguen existiendo', Object.keys(baseline).every(id => TUTORIALS.some(t => t.id === id)));
check('no hay tutoriales nuevos sin foto base', TUTORIALS.every(t => baseline[t.id]));

console.log('Conservación de contenido');
for (const t of TUTORIALS) {
  const snap = baseline[t.id];
  if (!snap) continue;
  const allowed = ALLOWED_MISSING[t.id] ?? {};
  const lostWith = missing(snap.withSms, currentText(t, false), allowed);
  check(`${t.id} (con SMS): no se pierde ninguna palabra`, lostWith.length === 0, lostWith.join(', '));
  if (snap.noSms !== null) {
    const lostNo = missing(snap.noSms, currentText(t, true), allowed);
    check(`${t.id} (sin SMS): no se pierde ninguna palabra`, lostNo.length === 0, lostNo.join(', '));
  }
  // Red de seguridad: una oración entera perdida no se vería palabra por palabra; el total de palabras no puede caer más de un 8 %.
  const total = (s: string) => [...words(s).values()].reduce((a, b) => a + b, 0);
  check(`${t.id} (con SMS): el total de palabras no cae más de un 8 %`, total(currentText(t, false)) >= total(snap.withSms) * 0.92, `${total(snap.withSms)} → ${total(currentText(t, false))}`);
  check(`${t.id}: un tutorial solo con SMS sigue siendo solo con SMS`, !!snap.noSms === !t.requiresSms);
}

console.log('Pasos');
{
  const before = Object.values(baseline).reduce((a, s) => a + s.steps, 0);
  const now = TUTORIALS.reduce((a, t) => a + t.steps.length, 0);
  check('nunca hay menos pasos que antes', now >= before, `${before} → ${now}`);
  console.log(`  (pasos: ${before} antes → ${now} ahora)`);
}

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
