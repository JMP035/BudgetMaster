process.env.TZ = 'America/Guatemala';
// Pruebas del bloque G2 de la auditoría final (widget, entrada rápida y detalles). Sin dependencias:
//   npm run test:audit-g2   →   sucrase-node scripts/audit-g2.test.ts
import { resetMemoryStorage } from './_async-storage-mock';

import { decideQuickAdd, isQuickAddUrl, quickAddPath, redirectQuickAdd } from '../services/QuickAdd';
import { createSingleFlight } from '../services/SingleFlight';
import { WIDGET_STALE_TEXT, buildWidgetSnapshot, freshenWidgetSnapshot, maskForPrivacy, sanitizeWidgetSnapshot, widgetDaysText } from '../services/WidgetSnapshot';
import type { WidgetSnapshot } from '../services/WidgetSnapshot';
import { computeFinancialPeriod, daysLeftInPeriod } from '../services/FinancialPeriod';
import { StorageService } from '../services/storage';
import type { UserSettings } from '../services/storage';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}

// ── G2-1: «+ gasto» del widget sin apilar otra copia de la app ───────────────────────────────────────
function quickAdd(): void {
  // El enlace del widget se reescribe a una ruta que NO es «quick-add» (la ruta apilaba una segunda copia de la app).
  check('G2-1a: budgetmaster://quick-add es el enlace del widget', isQuickAddUrl('budgetmaster://quick-add'));
  check('G2-1b: con barra final, triple barra y parámetros también', isQuickAddUrl('budgetmaster://quick-add/')
    && isQuickAddUrl('budgetmaster:///quick-add') && isQuickAddUrl('budgetmaster://quick-add?x=1') && isQuickAddUrl('/quick-add'));
  check('G2-1c: otros enlaces NO se reescriben', !isQuickAddUrl('budgetmaster://settings') && !isQuickAddUrl('budgetmaster://quick-add-x')
    && !isQuickAddUrl('https://quick-add') && !isQuickAddUrl('budgetmaster://'));
  check('G2-1d: la ruta nueva es «/» con open=add y la marca', quickAddPath(1700000000123) === '/?open=add&n=1700000000123');
  check('G2-1e: redirectQuickAdd reescribe el enlace del widget y deja pasar lo demás',
    redirectQuickAdd('budgetmaster://quick-add', 5) === '/?open=add&n=5' && redirectQuickAdd('budgetmaster://otra', 5) === 'budgetmaster://otra');
  check('G2-1f: dos toques dan rutas distintas (la marca cambia)', quickAddPath(1) !== quickAddPath(2));

  const base = { handled: null as string | null, splashDone: true, settingsLoaded: true, onboardingDone: true };
  check('G2-1g: sin open no hace nada', decideQuickAdd({ ...base }).action === 'none');
  check('G2-1h: open=add con la app lista abre Agregar y recuerda la marca',
    JSON.stringify(decideQuickAdd({ ...base, open: 'add', nonce: '10' })) === JSON.stringify({ action: 'open', key: '10' }));
  check('G2-1i: la misma marca ya atendida no se repite', decideQuickAdd({ ...base, open: 'add', nonce: '10', handled: '10' }).action === 'none');
  check('G2-1j: una marca nueva (otro toque con la app abierta) se atiende de nuevo',
    decideQuickAdd({ ...base, open: 'add', nonce: '11', handled: '10' }).action === 'open');
  check('G2-1k: durante la splash espera y NO consume el pedido', decideQuickAdd({ ...base, open: 'add', nonce: '1', splashDone: false }).action === 'wait');
  check('G2-1l: con los ajustes sin cargar espera (el onboarding «incompleto» es solo el valor por defecto)',
    decideQuickAdd({ ...base, open: 'add', nonce: '1', settingsLoaded: false, onboardingDone: false }).action === 'wait');
  const early = decideQuickAdd({ ...base, open: 'add', nonce: '1', onboardingDone: false });
  check('G2-1m: con el onboarding sin terminar el pedido se DESCARTA (no salta a Agregar cuando arranca el recorrido)',
    early.action === 'discard' && early.key === '1');
  check('G2-1n: open como lista (expo-router) y sin marca también funciona', decideQuickAdd({ ...base, open: ['add'] }).action === 'open'
    && decideQuickAdd({ ...base, open: ['add'] }).key === 'sin-marca');
  check('G2-1o: open con otro valor se ignora', decideQuickAdd({ ...base, open: 'otra', nonce: '1' }).action === 'none');
}

async function singleFlight(): Promise<void> {
  // Candado de módulo de la sincronización automática: dos instancias a la vez no sincronizan las dos.
  const gate = createSingleFlight();
  let runs = 0;
  let release: () => void = () => undefined;
  const slow = () => new Promise<string>(resolve => { runs++; release = () => resolve('listo'); });
  const first = gate.tryRun(slow);
  const second = await gate.tryRun(async () => { runs++; return 'otra'; });
  check('G2-1p: con una sincronización en curso la segunda NO corre (devuelve null)', second === null && runs === 1 && gate.busy());
  release();
  check('G2-1q: la primera termina con su resultado', (await first) === 'listo' && !gate.busy());
  check('G2-1r: ya libre, la siguiente sí corre', (await gate.tryRun(async () => 'otra')) === 'otra');
  let threw = false;
  try { await gate.tryRun(async () => { throw new Error('x'); }); } catch { threw = true; }
  check('G2-1s: si falla, el candado se suelta', threw && !gate.busy() && (await gate.tryRun(async () => 1)) === 1);
}

// ── G2-2: el widget no se queda congelado con la foto de otro día ───────────────────────────────────
const d = (y: number, m: number, day: number, h = 12, mi = 0) => new Date(y, m - 1, day, h, mi);
const monthly = {
  paymentCycle: 'monthly', paymentDay: 27, paymentDays: [15, 30], monthlyIncome: 8000, budgetLimit: 6000, exchangeRate: 7.7,
} as unknown as UserSettings;

function photoOn(now: Date, cfg: UserSettings = monthly): WidgetSnapshot {
  return buildWidgetSnapshot({
    settings: cfg, transactions: [], fixedExpenses: [], accounts: [], creditInstallments: [], incomeSources: [],
    daysLeft: daysLeftInPeriod(cfg, now, null),
    periodAt: x => computeFinancialPeriod(cfg, x, null),
  }, now);
}

function widgetFresh(): void {
  const snap = photoOn(d(2026, 11, 25, 9));
  check('G2-2a: la foto guarda la fecha del cobro (27/11) y el fin del período', snap.nextPayDate === '2026-11-27' && snap.periodEndDate === '2026-11-27'
    && snap.daysToPay === 2, JSON.stringify([snap.nextPayDate, snap.periodEndDate, snap.daysToPay]));

  // Antes (código anterior): pintar el 2/12 repintaba la foto del 25/11 y seguía diciendo «2 días al cobro».
  const sameDay = freshenWidgetSnapshot(snap, d(2026, 11, 25, 22));
  check('G2-2b: el mismo día dice «2 días al cobro»', !sameDay.stale && widgetDaysText(sameDay.snap!) === '2 días al cobro');
  const next = freshenWidgetSnapshot(snap, d(2026, 11, 26, 0, 5));
  check('G2-2c: al día siguiente (sin abrir la app) dice «1 día al cobro»', !next.stale && next.snap!.daysToPay === 1
    && widgetDaysText(next.snap!) === '1 día al cobro' && next.snap!.daysLeftInPeriod === 1, JSON.stringify(next.snap));
  check('G2-2d: el disponible por día se reparte entre los días que de verdad quedan',
    !next.stale && next.snap!.availablePerDay === Math.round((snap.availablePeriod / 1) * 100) / 100);
  const payDay = freshenWidgetSnapshot(snap, d(2026, 11, 27, 8));
  check('G2-2e: el día del cobro la foto ya es de otro período: «Abre la app para actualizar»', payDay.stale && payDay.snap === null);
  const later = freshenWidgetSnapshot(snap, d(2026, 12, 2, 9));
  check('G2-2f: el 2/12 sigue sin mostrar «2 días al cobro» ni el disponible viejo', later.stale && later.snap === null);
  check('G2-2g: el texto de foto vieja es el pedido', WIDGET_STALE_TEXT === 'Abre la app para actualizar');

  const irregular = photoOn(d(2026, 11, 20), { ...monthly, paymentCycle: 'irregular' } as UserSettings);
  check('G2-2h: irregular: sin fecha de cobro pero con fin de período (1/12)', irregular.nextPayDate === null && irregular.periodEndDate === '2026-12-01'
    && irregular.daysToPay === null, JSON.stringify([irregular.nextPayDate, irregular.periodEndDate, irregular.daysToPay]));
  const irr = freshenWidgetSnapshot(irregular, d(2026, 11, 25));
  check('G2-2i: irregular: los días del período bajan y nunca dicen «cobras»', !irr.stale && irr.snap!.daysToPay === null && irr.snap!.daysLeftInPeriod === 6
    && widgetDaysText(irr.snap!) === '6 días en el período', widgetDaysText((irr as { snap: WidgetSnapshot }).snap));
  check('G2-2j: irregular: llegado el 1/12 es foto vieja', freshenWidgetSnapshot(irregular, d(2026, 12, 1)).stale);

  // Compatibilidad: fotos viejas sin las fechas nuevas.
  const old = sanitizeWidgetSnapshot({ v: 1, updatedAt: d(2026, 11, 25, 9).toISOString(), currency: 'Q', availablePeriod: 1000, daysToPay: 2,
    daysLeftInPeriod: 2, availablePerDay: 500, budgetPct: 10, hasBudget: true });
  check('G2-2k: foto vieja sin fechas: se deduce el fin del período de updatedAt + días', !!old && old.periodEndDate === '2026-11-27' && old.nextPayDate === '2026-11-27',
    JSON.stringify(old));
  check('G2-2l: esa foto vieja también deja de mentir pasado el cobro', !!old && freshenWidgetSnapshot(old, d(2026, 12, 2)).stale
    && !freshenWidgetSnapshot(old, d(2026, 11, 26)).stale);
  const older = sanitizeWidgetSnapshot({ v: 1, updatedAt: d(2026, 11, 25, 9).toISOString(), currency: 'Q', availablePeriod: 1000, daysToPay: 0,
    availablePerDay: 1000, budgetPct: 0, hasBudget: false });
  check('G2-2m: foto muy vieja sin días (irregular o ambigua): sin fecha y se pinta como antes (nunca «foto vieja» falsa)',
    !!older && older.periodEndDate === undefined && !freshenWidgetSnapshot(older, d(2027, 1, 5)).stale);
  check('G2-2n: sanitize conserva las fechas de una foto nueva', sanitizeWidgetSnapshot(JSON.parse(JSON.stringify(snap)))?.periodEndDate === '2026-11-27');

  // La privacidad se aplica sobre la foto ya al día (los montos siguen ocultos).
  const fresh = freshenWidgetSnapshot(snap, d(2026, 11, 26));
  const masked = !fresh.stale ? maskForPrivacy(fresh.snap) : null;
  check('G2-2o: enmascarada conserva los días nuevos y borra los montos', !!masked && masked.daysToPay === 1 && masked.availablePeriod === 0 && masked.masked === true);
}

async function scenarios(): Promise<void> {
  resetMemoryStorage();
  quickAdd();
  await singleFlight();
  widgetFresh();
  void StorageService;
}

scenarios()
  .then(() => {
    console.log(`\nAuditoría G2: ${checks - failures}/${checks} comprobaciones correctas.`);
    if (failures > 0) process.exit(1);
  })
  .catch(e => {
    console.log('ERROR inesperado en las pruebas de G2:', e);
    process.exit(1);
  });
