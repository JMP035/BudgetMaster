// Marcado ligero de los textos del tutorial. Módulo PURO (sin react-native), probado en scripts/tutorial-text.test.ts.
//
// Dentro de `description` / `noSmsDescription` (y de `lead`):
//   - línea en blanco (\n\n)        → párrafo nuevo
//   - línea que empieza con «• »    → viñeta
//   - párrafo que empieza «Ojo: »   → nota destacada
//   - párrafo que empieza «Ejemplo: » → ejemplo
//   - texto entre «…»               → resaltado (las comillas se conservan en el texto)
// Un texto sin marcas es un único párrafo, igual que antes.

export type TutorialSpan = { text: string; highlight?: boolean };
export type TutorialBlockKind = 'paragraph' | 'bullet' | 'note' | 'example';
export interface TutorialBlock {
  kind: TutorialBlockKind;
  spans: TutorialSpan[];
  /** Solo notas y ejemplos: la etiqueta («Ojo:» o «Ejemplo:»), que se pinta aparte. */
  label?: string;
}

const BULLET = '• ';
const NOTE = 'Ojo: ';
const EXAMPLE = 'Ejemplo: ';

/** true si las comillas angulares están balanceadas y sin anidar (si no, no se resalta nada). */
function quotesBalanced(src: string): boolean {
  let open = false;
  for (const ch of src) {
    if (ch === '«') { if (open) return false; open = true; }
    else if (ch === '»') { if (!open) return false; open = false; }
  }
  return !open;
}

function toSpans(text: string, highlightOk: boolean): TutorialSpan[] {
  if (!highlightOk) return text ? [{ text }] : [];
  const spans: TutorialSpan[] = [];
  let i = 0;
  while (i < text.length) {
    const a = text.indexOf('«', i);
    if (a < 0) { spans.push({ text: text.slice(i) }); break; }
    if (a > i) spans.push({ text: text.slice(i, a) });
    const b = text.indexOf('»', a);
    spans.push({ text: text.slice(a, b + 1), highlight: true });
    i = b + 1;
  }
  return spans;
}

/** Convierte un texto con marcas en bloques. Texto vacío → []. */
export function parseTutorialText(src: string): TutorialBlock[] {
  const ok = quotesBalanced(src);
  const blocks: TutorialBlock[] = [];
  const chunks = src.replace(/\r/g, '').split(/\n{2,}/);
  for (const chunk of chunks) {
    let para: string[] = [];
    const flush = () => {
      if (para.length === 0) return;
      const text = para.join(' ').trim();
      para = [];
      if (!text) return;
      if (text.startsWith(NOTE)) blocks.push({ kind: 'note', label: NOTE.trim(), spans: toSpans(text.slice(NOTE.length), ok) });
      else if (text.startsWith(EXAMPLE)) blocks.push({ kind: 'example', label: EXAMPLE.trim(), spans: toSpans(text.slice(EXAMPLE.length), ok) });
      else blocks.push({ kind: 'paragraph', spans: toSpans(text, ok) });
    };
    for (const raw of chunk.split('\n')) {
      const line = raw.trim();
      if (!line) continue;
      if (line.startsWith(BULLET)) {
        flush();
        blocks.push({ kind: 'bullet', spans: toSpans(line.slice(BULLET.length).trim(), ok) });
      } else {
        para.push(line);
      }
    }
    flush();
  }
  return blocks;
}

function blockText(b: TutorialBlock): string {
  return (b.label ? b.label + ' ' : '') + b.spans.map(s => s.text).join('');
}

/** Texto sin marcas (sin viñetas ni saltos), con espacios simples. Las comillas «» se conservan. */
export function plainTutorialText(src: string): string {
  return parseTutorialText(src).map(blockText).join(' ').replace(/\s+/g, ' ').trim();
}

/** Largo del texto plano de un paso: frase clave + descripción. Es lo que limita el contenido de cada paso. */
export function stepPlainLength(step: { lead?: string; description: string }): number {
  const lead = step.lead ? plainTutorialText(step.lead) : '';
  const body = plainTutorialText(step.description);
  return lead && body ? lead.length + 1 + body.length : lead.length + body.length;
}
