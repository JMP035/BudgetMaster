// Utilidades de texto del asistente. Módulo puro: sin react-native, sin AsyncStorage y sin
// regex lookbehind (Hermes). Las frases y palabras que se comparan aquí ya vienen normalizadas.

/** Signos que se tratan como separador de palabras. */
const PUNCT = '¿?¡!.,;:"\'()';

function isDigit(c: string | undefined): boolean {
  return c !== undefined && c >= '0' && c <= '9';
}

/**
 * Normaliza el texto del usuario: minúsculas, sin tildes (NFD), ñ→n y signos → espacio, con los
 * espacios colapsados. `map[i]` es el índice del carácter original (en `raw`) del que salió
 * `norm[i]`, para poder recortar nombres libres del texto crudo y conservar mayúsculas y tildes.
 * A diferencia de `normalizeText` no colapsa letras repetidas.
 *
 * Un «.» o «,» entre dos dígitos se conserva («5,000.50», «3.500», «1.5»): sin eso los montos
 * llegarían partidos al AmountParser.
 */
export function normalizeWithMap(raw: string): { norm: string; map: number[] } {
  const chars: string[] = [];
  const map: number[] = [];
  let pendingSpace = false;

  for (let i = 0; i < raw.length; i++) {
    const c = raw[i];
    const keepSeparator = (c === '.' || c === ',') && isDigit(raw[i - 1]) && isDigit(raw[i + 1]);
    if (!keepSeparator && (PUNCT.indexOf(c) >= 0 || /\s/.test(c))) {
      pendingSpace = true;
      continue;
    }
    // minúsculas + NFD y se descartan las marcas diacríticas (ñ → n + tilde → n)
    const folded = c.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    for (let k = 0; k < folded.length; k++) {
      if (pendingSpace && chars.length > 0) {
        chars.push(' ');
        map.push(i);
      }
      pendingSpace = false;
      chars.push(folded[k]);
      map.push(i);
    }
  }
  return { norm: chars.join(''), map };
}

/** Palabras de un texto ya normalizado. */
export function tokens(norm: string): string[] {
  return norm.split(' ').filter(t => t.length > 0);
}

/**
 * Distancia de Damerau-Levenshtein (variante con transposiciones adyacentes) con tope: devuelve
 * `max + 1` en cuanto es seguro que la distancia lo supera.
 */
function damerau(a: string, b: string, max: number): number {
  const la = a.length;
  const lb = b.length;
  if (Math.abs(la - lb) > max) return max + 1;
  if (la === 0) return lb;
  if (lb === 0) return la;

  let prev2: number[] = new Array(lb + 1).fill(0);
  let prev: number[] = new Array(lb + 1);
  let cur: number[] = new Array(lb + 1);
  for (let j = 0; j <= lb; j++) prev[j] = j;

  for (let i = 1; i <= la; i++) {
    cur[0] = i;
    let rowMin = cur[0];
    for (let j = 1; j <= lb; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        v = Math.min(v, prev2[j - 2] + 1);
      }
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    const tmp = prev2;
    prev2 = prev;
    prev = cur;
    cur = tmp;
  }
  return prev[lb];
}

/**
 * Igualdad aproximada de dos palabras ya normalizadas. Tolerancia según la palabra más corta:
 * 0 errores si tiene menos de 5 letras, hasta 1 con 5-7 y hasta 2 con 8 o más. Si alguna lleva
 * dígitos solo vale la igualdad exacta (para que «10000» no se confunda con «10001»).
 */
export function fuzzyEq(a: string, b: string): boolean {
  if (a === b) return true;
  const len = Math.min(a.length, b.length);
  const max = len < 5 ? 0 : len < 8 ? 1 : 2;
  if (max === 0) return false;
  if (/[0-9]/.test(a) || /[0-9]/.test(b)) return false;
  return damerau(a, b, max) <= max;
}

/** ¿Alguna palabra de la lista es (aprox.) igual a `word`? */
export function hasWordFuzzy(toks: string[], word: string): boolean {
  for (const t of toks) if (fuzzyEq(t, word)) return true;
  return false;
}

/**
 * ¿Contiene `norm` la frase completa, delimitada por palabras? Equivale a `(^| )frase( |$)`,
 * sin construir una regex (no hay que escapar la frase y no se usa lookbehind).
 */
export function hasPhrase(norm: string, phrase: string): boolean {
  if (!phrase) return false;
  return (' ' + norm + ' ').indexOf(' ' + phrase + ' ') >= 0;
}
