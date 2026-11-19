// Foto «antes» de los textos del tutorial. Se corre UNA vez (antes de repartir los textos en pasos más cortos) y su
// resultado, scripts/fixtures/tutorial-baseline.json, se versiona: scripts/tutorial-content.test.ts comprueba contra ella
// que no se pierde ninguna palabra al dividir o dar formato. Para regenerarla (solo si un texto cambia a propósito):
//   npx sucrase-node scripts/tutorial-baseline.ts
import * as fs from 'fs';
import * as path from 'path';
import { TUTORIALS } from '../services/TutorialData';

interface Snapshot { titles: string[]; steps: number; stepsNoSms: number | null; withSms: string; noSms: string | null }

const out: Record<string, Snapshot> = {};
for (const t of TUTORIALS) {
  const withSms = t.steps.map(s => [s.description, s.emptyHint ?? ''].join('\n')).join('\n\n');
  let noSms: string | null = null;
  let stepsNoSms: number | null = null;
  if (!t.requiresSms) {
    const kept = t.steps.filter(s => !s.requiresSms);
    stepsNoSms = kept.length;
    noSms = kept.map(s => [s.noSmsDescription ?? s.description, s.noSmsEmptyHint ?? s.emptyHint ?? ''].join('\n')).join('\n\n');
  }
  out[t.id] = { titles: t.steps.map(s => s.title), steps: t.steps.length, stepsNoSms, withSms, noSms };
}

const dir = path.join(__dirname, 'fixtures');
fs.mkdirSync(dir, { recursive: true });
fs.writeFileSync(path.join(dir, 'tutorial-baseline.json'), JSON.stringify(out, null, 2) + '\n');
const total = Object.values(out).reduce((a, s) => a + s.steps, 0);
console.log(`Tutoriales: ${Object.keys(out).length}, pasos: ${total}`);
