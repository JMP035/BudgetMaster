// Montos del asistente. Módulo puro: sin react-native, sin AsyncStorage y sin regex lookbehind (Hermes).
// Recibe texto YA normalizado (Text.normalizeWithMap: minúsculas, sin tildes, signos → espacio salvo
// «.» y «,» entre dos dígitos). Los índices `start`/`end` son de ese texto normalizado; `end` es exclusivo.
import type { Currency } from '../storage';
import { parseAmount } from '../DateAmount';

export interface AmountMatch {
  value: number;
  currency: Currency | null;     // null = sin marcador de moneda
  start: number;                 // incluye el marcador de moneda pegado o suelto («q 500»)
  end: number;                   // exclusivo
  explicitCurrency: boolean;
}

// ── Léxico ──────────────────────────────────────────────────────────────────────────────

/** Diccionario sin prototipo: «constructor» o «toString» escritos por el usuario no deben contar como clave. */
function dict<T>(o: Record<string, T>): Record<string, T> {
  return Object.assign(Object.create(null), o);
}

/** Marcadores que van ANTES del número («q500», «q 500», «$20», «usd 20»). */
const PREFIX_MARKERS: Record<string, Currency> = dict({
  q: 'Q', qtz: 'Q', gtq: 'Q',
  '$': 'USD', 'us$': 'USD', usd: 'USD',
  '€': 'EUR', eur: 'EUR',
  '£': '£',
});

/** Palabras que van DESPUÉS del número («500 quetzales», «500 varas», «20 dolares»). */
const SUFFIX_WORDS: Record<string, Currency> = dict({
  q: 'Q', qtz: 'Q', gtq: 'Q', quetzal: 'Q', quetzales: 'Q', vara: 'Q', varas: 'Q', peso: 'Q', pesos: 'Q',
  '$': 'USD', usd: 'USD', dolar: 'USD', dolares: 'USD', dls: 'USD', dlls: 'USD', dlrs: 'USD', verde: 'USD', verdes: 'USD',
  '€': 'EUR', eur: 'EUR', euro: 'EUR', euros: 'EUR',
  '£': '£', libra: '£', libras: '£',
});

/** Número seguido de estas palabras no es un monto («en 3 meses», «últimos 30 días»). */
const TIME_UNITS = [
  'dia', 'dias', 'semana', 'semanas', 'mes', 'meses', 'ano', 'anos', 'quincena', 'quincenas',
  'hora', 'horas', 'minuto', 'minutos', 'vez', 'veces',
];

/** Palabras que, delante de un entero 1-31, lo vuelven día del mes («el 15», «día 30», «cada 5»). */
const DAY_LEADS = ['el', 'dia', 'dias', 'los', 'cada', 'del', 'al', 'hasta', 'desde', 'entre'];

const MONTH_WORDS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'setiembre',
  'octubre', 'noviembre', 'diciembre',
  'ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'sept', 'set', 'oct', 'nov', 'dic',
];

const UNITS: Record<string, number> = dict({
  uno: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
});
const TEENS: Record<string, number> = dict({
  diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
  dieciocho: 18, diecinueve: 19, veinte: 20, veintiuno: 21, veintidos: 22, veintitres: 23,
  veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
});
const TENS: Record<string, number> = dict({
  treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
});
const HUNDREDS: Record<string, number> = dict({
  cien: 100, ciento: 100, doscientos: 200, trescientos: 300, cuatrocientos: 400, quinientos: 500,
  seiscientos: 600, setecientos: 700, ochocientos: 800, novecientos: 900,
});

/** Errores de escritura frecuentes. Las palabras de número se comparan exactas: con fuzzy «nuevo»→9 y «cuarto»→4. */
const WORD_ALIASES: Record<string, string> = dict({
  sinco: 'cinco', cinko: 'cinco', dies: 'diez', onse: 'once', dose: 'doce', trese: 'trece', katorse: 'catorce',
  quinentos: 'quinientos', quinietos: 'quinientos', kinientos: 'quinientos',
  sietecientos: 'setecientos', nuevecientos: 'novecientos',
  cinquenta: 'cincuenta', sincuenta: 'cincuenta', trenta: 'treinta', viente: 'veinte',
  veintiun: 'veintiuno', veintiuna: 'veintiuno', un: 'uno', una: 'uno',
});

function canon(w: string): string {
  const a = WORD_ALIASES[w];
  if (a) return a;
  // femeninos: doscientas… novecientas, quinientas
  if (w.length > 7 && w.endsWith('cientas')) return w.slice(0, -7) + 'cientos';
  if (w === 'quinientas') return 'quinientos';
  return w;
}

function isNumberWord(w: string): boolean {
  const c = canon(w);
  return c in UNITS || c in TEENS || c in TENS || c in HUNDREDS || c === 'mil' || c === 'cero'
    || c === 'millon' || c === 'millones';
}

// ── Números en palabras ─────────────────────────────────────────────────────────────────

/**
 * Lee un número en palabras desde `tokens[i]`: «cinco», «treinta y cinco», «mil quinientos»,
 * «dos mil trescientos cincuenta», «un millon», «medio millon», «dos millones quinientos mil».
 * Devuelve el valor y cuántos tokens consumió, o null si ahí no empieza un número.
 */
export function parseSpanishNumber(toks: string[], i: number): { value: number; consumed: number } | null {
  if (i < 0 || i >= toks.length) return null;
  let total = 0;
  let h = 0;
  let t = 0;
  let u = 0;
  let milDone = false;
  let millonDone = false;
  let j = i;

  if (toks[i] === 'medio' && (toks[i + 1] === 'millon' || toks[i + 1] === 'millones')) {
    return { value: 500000, consumed: 2 };
  }
  if (canon(toks[i]) === 'cero') return { value: 0, consumed: 1 };

  while (j < toks.length) {
    const w = canon(toks[j]);
    const group = h + t + u;
    if (w in HUNDREDS) {
      if (group !== 0) break;
      h = HUNDREDS[w];
      j++;
    } else if (w in TEENS) {
      if (t !== 0 || u !== 0) break;
      t = TEENS[w];
      j++;
    } else if (w in TENS) {
      if (t !== 0 || u !== 0) break;
      t = TENS[w];
      j++;
    } else if (w in UNITS) {
      if (u !== 0) break;
      if (t !== 0 && !(t >= 20 && t % 10 === 0)) break;   // «quince cinco» no
      u = UNITS[w];
      j++;
    } else if (w === 'y') {
      const next = j + 1 < toks.length ? canon(toks[j + 1]) : '';
      if (t >= 20 && t % 10 === 0 && u === 0 && next in UNITS) {
        u = UNITS[next];
        j += 2;
      } else {
        break;
      }
    } else if (w === 'mil') {
      if (milDone) break;
      total += (group || 1) * 1000;
      h = 0; t = 0; u = 0;
      milDone = true;
      j++;
    } else if (w === 'millon' || w === 'millones') {
      if (millonDone || milDone) break;
      total += (group || 1) * 1000000;
      h = 0; t = 0; u = 0;
      millonDone = true;
      j++;
      if (toks[j] === 'y' && toks[j + 1] === 'medio') {   // «un millon y medio»
        total += 500000;
        j += 2;
      }
    } else {
      break;
    }
  }

  const consumed = j - i;
  if (consumed === 0) return null;
  return { value: total + h + t + u, consumed };
}

// ── Números en cifras ───────────────────────────────────────────────────────────────────

/**
 * Convierte un número en cifras a su valor, con la convención guatemalteca de `parseAmount` salvo una
 * desviación: «3.500» (1-3 dígitos, punto, exactamente 3 dígitos) vale 3500, no 3.5. Para «0.500» se
 * mantiene 0.5. Devuelve NaN si no es un número.
 */
export function parseAmountToken(s: string): number {
  const t = s.trim();
  if (/^[1-9]\d{0,2}\.\d{3}$/.test(t)) return Number(t.replace('.', ''));
  return parseAmount(t);
}

// ── Extracción ──────────────────────────────────────────────────────────────────────────

interface Tok { t: string; s: number; e: number }

function scan(norm: string): Tok[] {
  const out: Tok[] = [];
  let i = 0;
  while (i < norm.length) {
    if (norm[i] === ' ') { i++; continue; }
    let j = i;
    while (j < norm.length && norm[j] !== ' ') j++;
    out.push({ t: norm.slice(i, j), s: i, e: j });
    i = j;
  }
  return out;
}

const NUM_TOKEN = /^(gtq|qtz|usd|eur|us\$|[q$€£])?(\d+(?:[.,]\d+)*)(k|mil|gtq|qtz|usd|eur|dls|[q$€£])?$/;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function isMonthWord(w: string | undefined): boolean {
  return w !== undefined && MONTH_WORDS.indexOf(w) >= 0;
}

/**
 * Montos del texto normalizado, en orden de aparición. `excludeSpans` son tramos [inicio, fin) ya
 * consumidos por otra extracción (fechas, rangos): ningún token que los toque cuenta como monto.
 *
 * Además descarta por sí mismo los números que son claramente fecha o plazo y no llevan moneda:
 * «el 15», «día 30», «cada 5», «15 de marzo», «marzo 15», «diciembre 2027», «en 3 meses»,
 * «últimos 30 días».
 */
export function extractAmounts(norm: string, opts?: { excludeSpans?: [number, number][] }): AmountMatch[] {
  const toks = scan(norm);
  const words = toks.map(x => x.t);
  const excl = (opts && opts.excludeSpans) || [];
  const used: boolean[] = toks.map(() => false);
  const out: AmountMatch[] = [];

  const overlaps = (s: number, e: number): boolean => {
    for (const [a, b] of excl) if (s < b && e > a) return true;
    return false;
  };

  /** ¿El número (entero 1-31 / año / otro) del rango de tokens [i, last] es una fecha o un plazo? */
  const looksLikeDate = (i: number, last: number, value: number, plainInt: boolean): boolean => {
    const next = words[last + 1];
    const next2 = words[last + 2];
    const prev = words[i - 1];
    const prev2 = words[i - 2];
    if (next !== undefined && TIME_UNITS.indexOf(next) >= 0) return true;
    if (plainInt && value >= 1 && value <= 31) {
      if (next === 'de' && isMonthWord(next2)) return true;
      if (isMonthWord(next)) return true;
      if (prev !== undefined && DAY_LEADS.indexOf(prev) >= 0) return true;
      if (isMonthWord(prev)) return true;
      if ((prev === 'de' || prev === 'del') && isMonthWord(prev2)) return true;
    }
    if (plainInt && value >= 1900 && value <= 2200) {
      if (isMonthWord(prev)) return true;
      if ((prev === 'de' || prev === 'del') && isMonthWord(prev2)) return true;
    }
    return false;
  };

  /** Marcador de moneda suelto justo antes del token i («q 500», «$ 20»). */
  const prefixBefore = (i: number): { cur: Currency; tok: number } | null => {
    const p = i - 1;
    if (p >= 0 && !used[p] && PREFIX_MARKERS[words[p]] !== undefined) return { cur: PREFIX_MARKERS[words[p]], tok: p };
    return null;
  };

  /** Palabra de moneda suelta justo después del token `last`. */
  const suffixAfter = (last: number): { cur: Currency; tok: number } | null => {
    const n = last + 1;
    if (n < toks.length && !used[n] && SUFFIX_WORDS[words[n]] !== undefined) {
      if ((words[n] === 'libra' || words[n] === 'libras') && words[n + 1] === 'de') return null;   // «5 libras de carne»
      return { cur: SUFFIX_WORDS[words[n]], tok: n };
    }
    return null;
  };

  const push = (value: number, cur: Currency | null, first: number, last: number): void => {
    for (let k = first; k <= last; k++) used[k] = true;
    out.push({ value: round2(value), currency: cur, start: toks[first].s, end: toks[last].e, explicitCurrency: cur !== null });
  };

  for (let i = 0; i < toks.length; i++) {
    if (used[i]) continue;
    const m = NUM_TOKEN.exec(words[i]);

    if (m) {
      // ── cifras ──
      let value = parseAmountToken(m[2]);
      if (!isFinite(value)) continue;
      let cur: Currency | null = m[1] ? PREFIX_MARKERS[m[1]] : null;
      let first = i;
      let last = i;
      let multiplied = false;

      const g3 = m[3];
      if (g3 === 'k' || g3 === 'mil') {
        value *= 1000;
        multiplied = true;
      } else if (g3) {
        cur = cur || PREFIX_MARKERS[g3];
      }

      if (!multiplied) {
        const n = words[last + 1];
        if (n === 'k' || n === 'mil') { value *= 1000; multiplied = true; last++; }
        else if (n === 'millon' || n === 'millones') { value *= 1000000; multiplied = true; last++; }
      }
      // «5 mil 500», «2 mil quinientos»
      if (multiplied && (words[last] === 'mil' || g3 === 'mil')) {
        const nx = words[last + 1];
        if (nx !== undefined && /^\d{1,3}$/.test(nx) && !used[last + 1]) {
          value += Number(nx);
          last++;
        } else if (nx !== undefined && isNumberWord(nx)) {
          const r = parseSpanishNumber(words, last + 1);
          if (r && r.value > 0 && r.value < 1000) { value += r.value; last += r.consumed; }
        }
      }

      if (!cur) {
        const pre = prefixBefore(first);
        if (pre) { cur = pre.cur; first = pre.tok; }
      }
      if (!cur) {
        const suf = suffixAfter(last);
        if (suf) { cur = suf.cur; last = suf.tok; }
      }

      const plainInt = !cur && !multiplied && /^\d{1,4}$/.test(m[2]);
      if (!cur && looksLikeDate(i, last, value, plainInt)) { used[i] = true; continue; }
      if (overlaps(toks[first].s, toks[last].e)) { for (let k = first; k <= last; k++) used[k] = true; continue; }
      if (!(value > 0)) { for (let k = first; k <= last; k++) used[k] = true; continue; }
      push(value, cur, first, last);
      continue;
    }

    if (isNumberWord(words[i]) || words[i] === 'medio') {
      // ── palabras ──
      const r = parseSpanishNumber(words, i);
      if (!r) continue;
      let last = i + r.consumed - 1;
      let first = i;
      let cur: Currency | null = null;
      const pre = prefixBefore(first);
      if (pre) { cur = pre.cur; first = pre.tok; }
      if (!cur) {
        const suf = suffixAfter(last);
        if (suf) { cur = suf.cur; last = suf.tok; }
      }
      const bareOne = r.value === 1 && r.consumed === 1;
      if (bareOne && !cur) { used[i] = true; continue; }          // «una meta», «un gasto»: no es el número 1
      const plainInt = !cur && r.value <= 31;
      if (!cur && looksLikeDate(i, i + r.consumed - 1, r.value, plainInt)) {
        for (let k = i; k < i + r.consumed; k++) used[k] = true;
        continue;
      }
      if (overlaps(toks[first].s, toks[last].e) || !(r.value > 0)) {
        for (let k = first; k <= last; k++) used[k] = true;
        continue;
      }
      push(r.value, cur, first, last);
      i = Math.max(i, last);
    }
  }

  out.sort((a, b) => a.start - b.start);
  return out;
}
