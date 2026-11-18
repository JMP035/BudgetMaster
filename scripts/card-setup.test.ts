process.env.TZ = 'America/Guatemala';
// Pruebas del corte y pago de las tarjetas (services/CardSetup.ts). Sin dependencias:
//   npm run test:card-setup   →   sucrase-node scripts/card-setup.test.ts

import {
  CARD_DATES_NUDGE_LABEL, CARD_DATES_NUDGE_TITLE, cardDatesNudgeBody, cardsMissingDates, hasValidCardDates,
} from '../services/CardSetup';
import type { Account } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

const mk = (id: string, type: Account['type'], extra: Partial<Account> = {}): Account => ({
  id, name: `Cuenta ${id}`, type, currency: 'Q', balance: 0, initialBalance: 0, color: '#000', icon: 'card-outline',
  isActive: true, createdAt: '2026-11-12T18:00:00.000Z', ...extra,
});

// ── hasValidCardDates ───────────────────────────────────────
check('25 y 10: válido', hasValidCardDates({ cutoffDay: 25, paymentDueDay: 10 }));
check('1 y 31: válido (extremos)', hasValidCardDates({ cutoffDay: 1, paymentDueDay: 31 }));
check('sin días: no', !hasValidCardDates({}));
check('solo corte: no', !hasValidCardDates({ cutoffDay: 25 }));
check('solo pago: no', !hasValidCardDates({ paymentDueDay: 10 }));
check('0: no', !hasValidCardDates({ cutoffDay: 0, paymentDueDay: 10 }) && !hasValidCardDates({ cutoffDay: 25, paymentDueDay: 0 }));
check('32: no', !hasValidCardDates({ cutoffDay: 32, paymentDueDay: 10 }) && !hasValidCardDates({ cutoffDay: 25, paymentDueDay: 32 }));
check('negativo: no', !hasValidCardDates({ cutoffDay: -5, paymentDueDay: 10 }));
check('decimales: no', !hasValidCardDates({ cutoffDay: 2.5, paymentDueDay: 10 }) && !hasValidCardDates({ cutoffDay: 25, paymentDueDay: 10.1 }));
check('NaN: no', !hasValidCardDates({ cutoffDay: NaN, paymentDueDay: 10 }));
// Texto o vacío (datos corruptos): nunca cuentan, aunque el tipo diga number
check('cadena vacía: no', !hasValidCardDates({ cutoffDay: '' as unknown as number, paymentDueDay: 10 }));
check('texto numérico: no (solo números)', !hasValidCardDates({ cutoffDay: '25' as unknown as number, paymentDueDay: 10 }));
check('null: no', !hasValidCardDates({ cutoffDay: null as unknown as number, paymentDueDay: 10 }));

// ── cardsMissingDates ───────────────────────────────────────
{
  const accounts: Account[] = [
    mk('ok', 'credit', { cutoffDay: 25, paymentDueDay: 10 }),
    mk('sin', 'credit'),
    mk('soloCorte', 'credit', { cutoffDay: 20 }),
    mk('inactiva', 'credit', { isActive: false }),
    mk('banco', 'bank'),
    mk('ahorro', 'savings'),
    mk('efectivo', 'cash'),
    mk('bancoConDias', 'bank', { cutoffDay: 1 }),
  ];
  const missing = cardsMissingDates(accounts).map(a => a.id);
  check('faltan: la tarjeta sin días y la que tiene solo corte', JSON.stringify(missing) === JSON.stringify(['sin', 'soloCorte']), JSON.stringify(missing));
  check('la tarjeta completa no falta', !missing.includes('ok'));
  check('las inactivas quedan fuera', !missing.includes('inactiva'));
  check('las cuentas que no son tarjeta quedan fuera', !missing.includes('banco') && !missing.includes('ahorro') && !missing.includes('efectivo') && !missing.includes('bancoConDias'));
  check('sin cuentas: nada falta', cardsMissingDates([]).length === 0);
  check('todas completas: nada falta', cardsMissingDates([mk('a', 'credit', { cutoffDay: 3, paymentDueDay: 28 })]).length === 0);
}

// ── Aviso card_dates ────────────────────────────────────────
{
  const one = cardDatesNudgeBody([{ name: 'BAC Tarjeta' }]);
  check('una tarjeta: la nombra', one.startsWith('Tu tarjeta «BAC Tarjeta» no tiene día de corte o de pago.'), one);
  check('una tarjeta: dice dónde y para qué', one.includes('Agrégalos en Cuentas para recibir el recordatorio de pago y ver tu capacidad de pago.'));
  const many = cardDatesNudgeBody([{ name: 'A' }, { name: 'B' }, { name: 'C' }]);
  check('varias: dice cuántas', many.startsWith('Tienes 3 tarjetas sin día de corte o de pago.'), many);
  check('varias: dice dónde y para qué', many.includes('Agrégalos en Cuentas para recibir el recordatorio de pago y ver tu capacidad de pago.'));
  check('varias no nombra una sola', !many.includes('«'));
  check('dos tarjetas: «Tienes 2 tarjetas»', cardDatesNudgeBody([{ name: 'A' }, { name: 'B' }]).startsWith('Tienes 2 tarjetas'));
  check('título del aviso', CARD_DATES_NUDGE_TITLE === '💳 Configura el corte y pago de tu tarjeta');
  check('etiqueta del aviso', CARD_DATES_NUDGE_LABEL === 'el corte y pago de tus tarjetas');
}

if (failures > 0) {
  console.log(`\n${failures} FALLA(S) de ${checks} comprobaciones`);
  process.exit(1);
}
console.log(`OK  ${checks} comprobaciones`);
