process.env.TZ = 'America/Guatemala';
// Pruebas del bloque G2 de la auditoría final (widget, entrada rápida y detalles). Sin dependencias:
//   npm run test:audit-g2   →   sucrase-node scripts/audit-g2.test.ts
import { resetMemoryStorage } from './_async-storage-mock';

import { decideQuickAdd, isQuickAddUrl, quickAddPath, redirectQuickAdd } from '../services/QuickAdd';
import { createSingleFlight } from '../services/SingleFlight';

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

async function scenarios(): Promise<void> {
  resetMemoryStorage();
  quickAdd();
  await singleFlight();
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
