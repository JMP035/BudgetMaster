process.env.TZ = 'America/Guatemala';
// Pruebas de los textos y mapeos de la UI de notificaciones y del semáforo de capacidad (services/NotifUi.ts).
//   npm run test:notif-ui   →   sucrase-node scripts/notif-ui.test.ts

import {
  NOTIF_KIND_INFO, capacityBasisText, capacityChipText, capacityLevelLabel, capacityPct, capacityTone, dueInText,
  hourLabel, hourOptions, hourShort, prefsSummary,
} from '../services/NotifUi';
import { DEFAULT_NOTIF_PREFS, NOTIF_KINDS, sanitizeNotifPrefs } from '../services/NotifPrefs';
import { levelOf } from '../services/Capacity';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

// ── Horas ──
check('hourLabel 8', hourLabel(8) === '8:00 am', hourLabel(8));
check('hourLabel 20', hourLabel(20) === '8:00 pm', hourLabel(20));
check('hourLabel 0', hourLabel(0) === '12:00 am', hourLabel(0));
check('hourLabel 12', hourLabel(12) === '12:00 pm', hourLabel(12));
check('hourLabel 23', hourLabel(23) === '11:00 pm', hourLabel(23));
check('hourShort 22', hourShort(22) === '10 pm', hourShort(22));
check('hourShort 7', hourShort(7) === '7 am', hourShort(7));
check('hourOptions incluye la actual', hourOptions([6, 7, 8], 15).join() === '6,7,8,15');
check('hourOptions no duplica', hourOptions([6, 7, 8], 7).join() === '6,7,8');

// ── Resumen de preferencias ──
check(
  'prefsSummary por defecto',
  prefsSummary(DEFAULT_NOTIF_PREFS) === 'Resumen diario 8:00 pm · Recordatorios 8:00 am · Silencio 10 pm–7 am',
  prefsSummary(DEFAULT_NOTIF_PREFS),
);
const noDaily = sanitizeNotifPrefs({ dailySummary: { enabled: false, hour: 20 }, reminderHour: 9, quietStart: 23, quietEnd: 6 });
check('prefsSummary sin resumen diario', prefsSummary(noDaily) === 'Sin resumen diario · Recordatorios 9:00 am · Silencio 11 pm–6 am', prefsSummary(noDaily));
const noQuiet = sanitizeNotifPrefs({ quietStart: 5, quietEnd: 5 });
check('prefsSummary sin horas silenciosas', prefsSummary(noQuiet).indexOf('Sin horas silenciosas') >= 0, prefsSummary(noQuiet));
check('prefsSummary con datos corruptos no falla', prefsSummary(sanitizeNotifPrefs('basura')) === prefsSummary(DEFAULT_NOTIF_PREFS));

// ── Tipos de aviso: todos tienen etiqueta y ayuda ──
check('NOTIF_KIND_INFO cubre todos los tipos', NOTIF_KINDS.every(k => !!NOTIF_KIND_INFO[k] && !!NOTIF_KIND_INFO[k].label && !!NOTIF_KIND_INFO[k].help));
check('etiquetas pedidas', NOTIF_KIND_INFO.fixed.label === 'Gastos fijos' && NOTIF_KIND_INFO.card_due.label === 'Pago de tarjeta'
  && NOTIF_KIND_INFO.salary.label === 'Llegó tu sueldo' && NOTIF_KIND_INFO.ai.label === 'Recordatorio del Asesor IA');
check('daily dice que reemplaza al aviso por gasto', /reemplaza/i.test(NOTIF_KIND_INFO.daily.help));

// ── Semáforo ──
check('tono ok = verde', capacityTone('ok') === 'green');
check('tono warn = ámbar', capacityTone('warn') === 'amber');
check('tono alert = rojo', capacityTone('alert') === 'red');
check('tono red = rojo', capacityTone('red') === 'red');
check('tono sigue a levelOf (0.5 verde, 0.8 ámbar, 0.95 rojo, 1.2 rojo)',
  capacityTone(levelOf(0.5)) === 'green' && capacityTone(levelOf(0.8)) === 'amber'
  && capacityTone(levelOf(0.95)) === 'red' && capacityTone(levelOf(1.2)) === 'red');
check('etiquetas de nivel', capacityLevelLabel('ok') === 'Te alcanza' && capacityLevelLabel('red') === 'No alcanza'
  && capacityLevelLabel('alert') === 'Casi al límite' && capacityLevelLabel('warn') === 'Ojo con este pago');
check('capacityPct redondea', capacityPct(0.6249) === 62 && capacityPct(0.629) === 63);
check('capacityPct tope y valores raros', capacityPct(50) === 999 && capacityPct(-1) === 0 && capacityPct(NaN) === 0);
check('chip: texto', capacityChipText(0.62) === 'Capacidad de pago: 62% comprometido', capacityChipText(0.62));
check('chip: 100%', capacityChipText(1) === 'Capacidad de pago: 100% comprometido');
check('basis balances', /saldos/.test(capacityBasisText('balances')) && !/declarado/.test(capacityBasisText('balances')));
check('basis declared lo dice claro', /ingreso declarado/.test(capacityBasisText('declared')) && /saldos/.test(capacityBasisText('declared')));
check('dueInText', dueInText(0) === 'hoy' && dueInText(1) === 'mañana' && dueInText(5) === 'en 5 días'
  && dueInText(-1) === 'ayer' && dueInText(-3) === 'hace 3 días');

console.log(`\n${checks} comprobaciones, ${failures} fallos`);
if (failures > 0) process.exit(1);
