process.env.TZ = 'America/Guatemala';
// Pruebas del Executor del asistente (ejecutar / deshacer con dependencias simuladas en memoria) y del
// recorte/validación del chat guardado (ChatStore). Sin AsyncStorage ni notificaciones reales:
//   npm run test:assistant-executor   →   sucrase-node scripts/assistant-executor.test.ts

import type { ActionProposal, AssistantContext, ChatMessage, StoredAssistantChat, UndoToken } from '../services/assistant/types';
import type { CategoryBudget, FixedExpense, SavingsGoal, Transaction, UserSettings } from '../services/storage';
import { makeProposal, entityIdFor } from '../services/assistant/Actions';
import {
  ALREADY_DONE, IN_PROGRESS, NOT_PENDING, SAVE_ERROR, UNDO_CHANGED, UNDO_ERROR, executeProposal, undoAction,
} from '../services/assistant/Executor';
import type { ExecutorDeps } from '../services/assistant/Executor';
import { withWriteVerification } from '../services/assistant/VerifiedStorage';
import {
  MAX_STORED_HISTORY, MAX_STORED_MESSAGES, isValidChatMessage, parseStoredChatJson, trimStoredChat, validateStoredChat,
} from '../services/assistant/ChatStore';
import { CATEGORY_COLORS } from '../categories';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail?: string): void {
  checks++;
  if (!cond) {
    failures++;
    console.log(`FALLA  ${name}${detail ? '  →  ' + detail : ''}`);
  }
}
const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

// Los fallos simulados provocan console.warn dentro del Executor: se cuentan en vez de ensuciar la salida.
let warns = 0;
const realWarn = console.warn;
console.warn = () => { warns++; };

// ─────────────────────────────────────────────────────────────
// Datos y mocks
// ─────────────────────────────────────────────────────────────
const NOW = new Date(2026, 10, 12, 10, 0);   // jueves 12 nov 2026
const iso = (y: number, m: number, d: number, h = 12): string => new Date(y, m - 1, d, h, 0).toISOString();

const PERIOD = {
  start: new Date(2026, 9, 27, 0, 0, 0, 0), end: new Date(2026, 10, 26, 23, 59, 59, 999),
  prevStart: new Date(2026, 8, 27, 0, 0, 0, 0), prevEnd: new Date(2026, 9, 26, 23, 59, 59, 999),
  label: '27 oct – 26 nov',
};

const SETTINGS = {
  currency: 'Q',
  customCategories: [{ id: 'custom_pets', label: 'Mascotas', icon: 'paw-outline', color: '#E8453C', type: 'expense' }],
  paymentCycle: 'monthly', paymentDay: 27, paymentDays: [], exchangeRate: 7.8, smsEnabled: true,
} as unknown as AssistantContext['settings'];

const SHELL_SMS: Transaction = {
  id: 'shell1', amount: 85, description: 'SHELL ZONA 10', category: 'fuel', date: iso(2026, 11, 11),
  type: 'expense', source: 'sms', currency: 'Q', merchant: 'SHELL',
};
const NETFLIX_SMS: Transaction = {
  id: 'nf1', amount: 15.99, description: 'NETFLIX', category: 'streaming', date: iso(2026, 11, 5),
  type: 'expense', source: 'sms', currency: 'USD', merchant: 'NETFLIX',
};
const BUDGET_REST: CategoryBudget = { categoryId: 'restaurant', limit: 600, currency: 'Q', alertAt: 70 };

function mkCtx(over: Partial<AssistantContext> = {}): AssistantContext {
  return {
    now: NOW, period: PERIOD, settings: SETTINGS,
    transactions: [SHELL_SMS, NETFLIX_SMS], accounts: [], fixedExpenses: [],
    categoryBudgets: [BUDGET_REST], savingsGoals: [], merchantRules: [], smsOn: true,
    ...over,
  };
}

interface Env {
  deps: ExecutorDeps;
  goals: SavingsGoal[]; budgets: CategoryBudget[]; fixed: FixedExpense[]; txs: Transaction[];
  writes: string[];                       // métodos de escritura invocados
  failOn: Set<string>;                    // métodos de storage que lanzan
  cb: { goals: SavingsGoal[][]; budgets: CategoryBudget[][]; fixed: FixedExpense[][]; txs: Transaction[][] };
  notif: { schedule: FixedExpense[]; cancel: string[]; onTx: unknown[][] };
  notifMode: { schedule: 'ok' | 'reject' | 'throw' | 'hang'; cancel: 'ok' | 'reject' | 'throw'; onTx: 'ok' | 'reject' | 'throw' | 'hang' };
  cbThrows: boolean;
}

function makeEnv(init: { goals?: SavingsGoal[]; budgets?: CategoryBudget[]; fixed?: FixedExpense[]; txs?: Transaction[] } = {}): Env {
  const env: Env = {
    goals: [...(init.goals ?? [])], budgets: [...(init.budgets ?? [BUDGET_REST])], fixed: [...(init.fixed ?? [])],
    txs: [...(init.txs ?? [SHELL_SMS, NETFLIX_SMS])],
    writes: [], failOn: new Set(),
    cb: { goals: [], budgets: [], fixed: [], txs: [] },
    notif: { schedule: [], cancel: [], onTx: [] },
    notifMode: { schedule: 'ok', cancel: 'ok', onTx: 'ok' },
    cbThrows: false,
    deps: null as unknown as ExecutorDeps,
  };
  const gate = (name: string): void => { if (env.failOn.has(name)) throw new Error(`falla simulada: ${name}`); };
  const write = (name: string): void => { gate(name); env.writes.push(name); };
  const cbCall = (): void => { if (env.cbThrows) throw new Error('callback roto'); };
  env.deps = {
    settings: { currency: 'Q', budgetLimit: 5000 } as unknown as UserSettings,
    storage: {
      async getSavingsGoals() { gate('getSavingsGoals'); return [...env.goals]; },
      async addSavingsGoal(g) { write('addSavingsGoal'); env.goals = [...env.goals, g]; return [...env.goals]; },
      async deleteSavingsGoal(id) { write('deleteSavingsGoal'); env.goals = env.goals.filter(x => x.id !== id); return [...env.goals]; },
      async getCategoryBudgets() { gate('getCategoryBudgets'); return [...env.budgets]; },
      async upsertCategoryBudget(b) {
        write('upsertCategoryBudget');
        env.budgets = env.budgets.some(x => x.categoryId === b.categoryId) ? env.budgets.map(x => x.categoryId === b.categoryId ? b : x) : [...env.budgets, b];
        return [...env.budgets];
      },
      async deleteCategoryBudget(id) { write('deleteCategoryBudget'); env.budgets = env.budgets.filter(x => x.categoryId !== id); return [...env.budgets]; },
      async getFixedExpenses() { gate('getFixedExpenses'); return [...env.fixed]; },
      async addFixedExpense(e) { write('addFixedExpense'); env.fixed = [...env.fixed, e]; return [...env.fixed]; },
      async deleteFixedExpense(id) { write('deleteFixedExpense'); env.fixed = env.fixed.filter(x => x.id !== id); return [...env.fixed]; },
      async getTransactions() { gate('getTransactions'); return [...env.txs]; },
      async addTransaction(tx) { write('addTransaction'); env.txs = [...env.txs, tx]; return [...env.txs]; },
      async deleteTransaction(id) { write('deleteTransaction'); env.txs = env.txs.filter(x => x.id !== id); return [...env.txs]; },
    },
    notifications: {
      scheduleFixedExpenseReminder(e) {
        env.notif.schedule.push(e);
        const m = env.notifMode.schedule;
        if (m === 'throw') throw new Error('sync');
        if (m === 'reject') return Promise.reject(new Error('rechazo'));
        if (m === 'hang') return new Promise<void>(() => { });
        return Promise.resolve();
      },
      cancelFixedExpenseReminder(id) {
        env.notif.cancel.push(id);
        const m = env.notifMode.cancel;
        if (m === 'throw') throw new Error('sync');
        if (m === 'reject') return Promise.reject(new Error('rechazo'));
        return Promise.resolve();
      },
      onTransactionAdded(...args) {
        env.notif.onTx.push(args);
        const m = env.notifMode.onTx;
        if (m === 'throw') throw new Error('sync');
        if (m === 'reject') return Promise.reject(new Error('rechazo'));
        if (m === 'hang') return new Promise<void>(() => { });
        return Promise.resolve();
      },
    },
    onGoals: g => { env.cb.goals.push(g); cbCall(); },
    onBudgets: b => { env.cb.budgets.push(b); cbCall(); },
    onFixed: f => { env.cb.fixed.push(f); cbCall(); },
    onTransactions: t => { env.cb.txs.push(t); cbCall(); },
  };
  return env;
}

const goalSlots = { name: 'Laptop', amount: 5000, deadline: '2026-12-31', currency: 'Q' };
const budgetSlots = { category: 'restaurant', amount: 800 };
const fixedSlots = { name: 'Netflix', amount: 15.99, day: 5, currency: 'USD', category: 'streaming' };
const txSlots = { tx_type: 'expense', amount: 85, category: 'fuel', description: 'Gasolina', date: '2026-11-11' };

let seq = 0;
const pid = (): string => `p${++seq}`;
const goalP = (slots = goalSlots, id = pid(), ctx = mkCtx()) => makeProposal('create_goal', slots, ctx, 'local', id);
const budgetP = (slots = budgetSlots, id = pid(), ctx = mkCtx()) => makeProposal('set_category_budget', slots, ctx, 'local', id);
const fixedP = (slots = fixedSlots, id = pid(), ctx = mkCtx()) => makeProposal('create_fixed_expense', slots, ctx, 'local', id);
const txP = (slots: Record<string, string | number> = txSlots, id = pid(), ctx = mkCtx()) => makeProposal('create_transaction', slots, ctx, 'local', id);

async function main(): Promise<void> {
  // ───────────────────────────────────────────────────────────
  // 1. ChatStore (puro): validación y recorte
  // ───────────────────────────────────────────────────────────
  const userMsg = (i: number): ChatMessage => ({ id: `m${i}`, at: iso(2026, 11, 12), role: 'user', kind: 'text', text: `hola ${i}` });
  const baseChat = (n: number, h: number): StoredAssistantChat => ({
    v: 1, savedAt: '2026-11-12T10:00:00.000Z',
    messages: Array.from({ length: n }, (_, i) => userMsg(i)),
    geminiHistory: Array.from({ length: h }, (_, i) => ({ role: i % 2 === 0 ? 'user' as const : 'model' as const, text: `t${i}` })),
  });

  check('validate: null → null', validateStoredChat(null) === null);
  check('validate: string → null', validateStoredChat('x') === null);
  check('validate: número → null', validateStoredChat(3) === null);
  check('validate: arreglo → null', validateStoredChat([]) === null);
  check('validate: sin v → null', validateStoredChat({ messages: [], geminiHistory: [] }) === null);
  check('validate: v 2 → null', validateStoredChat({ v: 2, messages: [], geminiHistory: [] }) === null);
  check('validate: messages no arreglo → null', validateStoredChat({ v: 1, messages: 'x', geminiHistory: [] }) === null);
  check('validate: geminiHistory ausente → null', validateStoredChat({ v: 1, messages: [] }) === null);
  check('validate: geminiHistory objeto → null', validateStoredChat({ v: 1, messages: [], geminiHistory: {} }) === null);
  check('validate: vacío válido', same(validateStoredChat({ v: 1, messages: [], geminiHistory: [], savedAt: 'x' }), { v: 1, messages: [], geminiHistory: [], savedAt: 'x' }));
  check('validate: savedAt ausente → cadena vacía', validateStoredChat({ v: 1, messages: [], geminiHistory: [] })?.savedAt === '');

  const proposalMsg: ChatMessage = { id: 'pm', at: 'a', role: 'ai', kind: 'proposal', proposal: goalP() };
  const questionMsg: ChatMessage = { id: 'qm', at: 'a', role: 'ai', kind: 'question', text: '¿?', chips: [{ label: 'a', value: 'a' }], slot: 'amount' };
  const queryMsg: ChatMessage = { id: 'rm', at: 'a', role: 'ai', kind: 'query', result: { queryId: 'goals_status', title: 't', subtitle: 's', totals: [], rows: [], moreCount: 0 } };
  const noticeMsg: ChatMessage = { id: 'nm', at: 'a', role: 'ai', kind: 'notice', variant: 'success', text: 'ok', undoState: 'available' };
  const aiText: ChatMessage = { id: 'tm', at: 'a', role: 'ai', kind: 'text', text: 'hola', source: 'local' };
  for (const m of [userMsg(1), aiText, questionMsg, proposalMsg, queryMsg, noticeMsg]) {
    check(`isValid: acepta kind ${m.kind}`, isValidChatMessage(m));
  }
  check('isValid: rechaza kind desconocido', !isValidChatMessage({ ...aiText, kind: 'raro' }));
  check('isValid: rechaza role inválido', !isValidChatMessage({ ...aiText, role: 'bot' }));
  check('isValid: rechaza sin id', !isValidChatMessage({ at: 'a', role: 'user', kind: 'text', text: 'x' }));
  check('isValid: rechaza texto numérico', !isValidChatMessage({ ...aiText, text: 5 }));
  check('isValid: rechaza question sin chips', !isValidChatMessage({ ...questionMsg, chips: undefined }));
  check('isValid: rechaza proposal con actionId falso', !isValidChatMessage({ ...proposalMsg, proposal: { ...(proposalMsg as { proposal: ActionProposal }).proposal, actionId: 'borrar_todo' } }));
  check('isValid: rechaza proposal sin summary', !isValidChatMessage({ ...proposalMsg, proposal: { proposalId: 'x', actionId: 'create_goal' } }));
  check('isValid: rechaza query sin rows', !isValidChatMessage({ ...queryMsg, result: { totals: [] } }));
  check('isValid: rechaza notice con variante falsa', !isValidChatMessage({ ...noticeMsg, variant: 'peligro' }));
  check('isValid: rechaza null', !isValidChatMessage(null));
  check('isValid: rechaza arreglo', !isValidChatMessage([]));
  check('isValid: rechaza question del usuario', !isValidChatMessage({ ...questionMsg, role: 'user' }));

  const mixed = validateStoredChat({
    v: 1, savedAt: 's',
    messages: [userMsg(1), { id: 'x' }, null, 5, { ...aiText, kind: 'raro' }, aiText],
    geminiHistory: [{ role: 'user', text: 'a' }, { role: 'x', text: 'b' }, { role: 'model', text: 7 }, null, { role: 'model', text: 'c' }],
  });
  check('validate: descarta mensajes mal formados y conserva los buenos', same(mixed?.messages.map(m => m.id), ['m1', 'tm']));
  check('validate: descarta historial mal formado', same(mixed?.geminiHistory, [{ role: 'user', text: 'a' }, { role: 'model', text: 'c' }]));

  const big = baseChat(100, 50);
  const trimmed = trimStoredChat(big);
  check('trim: 100 mensajes → 60', trimmed.messages.length === MAX_STORED_MESSAGES && MAX_STORED_MESSAGES === 60);
  check('trim: conserva los ÚLTIMOS 60', trimmed.messages[0].id === 'm40' && trimmed.messages[59].id === 'm99');
  check('trim: historial 50 → 20', trimmed.geminiHistory.length === MAX_STORED_HISTORY && MAX_STORED_HISTORY === 20);
  check('trim: historial conserva los últimos 20', trimmed.geminiHistory[0].text === 't30' && trimmed.geminiHistory[19].text === 't49');
  check('trim: no muta la entrada', big.messages.length === 100 && big.geminiHistory.length === 50);
  check('trim: conserva savedAt y v', trimmed.v === 1 && trimmed.savedAt === big.savedAt);
  check('trim: 60 exactos no cambia', trimStoredChat(baseChat(60, 20)).messages.length === 60);
  check('trim: 61 → 60 sin el primero', trimStoredChat(baseChat(61, 0)).messages[0].id === 'm1');
  check('trim: menos del tope se conserva', trimStoredChat(baseChat(3, 2)).messages.length === 3 && trimStoredChat(baseChat(3, 2)).geminiHistory.length === 2);
  const small = baseChat(3, 2);
  check('trim: devuelve copias (no comparte el arreglo)', trimStoredChat(small).messages !== small.messages && trimStoredChat(small).geminiHistory !== small.geminiHistory);
  check('trim: vacío', trimStoredChat(baseChat(0, 0)).messages.length === 0);

  check('json: null → null', parseStoredChatJson(null) === null);
  check('json: vacío → null', parseStoredChatJson('') === null);
  check('json: texto roto → null', parseStoredChatJson('{no es json') === null);
  check('json: versión 2 → null', parseStoredChatJson(JSON.stringify({ v: 2, messages: [], geminiHistory: [] })) === null);
  const rt = parseStoredChatJson(JSON.stringify(trimStoredChat(big)));
  check('json: ida y vuelta conserva 60 mensajes', rt?.messages.length === 60 && rt?.geminiHistory.length === 20);
  check('json: ida y vuelta con tarjetas de todos los tipos', parseStoredChatJson(JSON.stringify({ v: 1, savedAt: '', geminiHistory: [], messages: [userMsg(1), aiText, questionMsg, proposalMsg, queryMsg, noticeMsg] }))?.messages.length === 6);

  // ───────────────────────────────────────────────────────────
  // 2. executeProposal — meta
  // ───────────────────────────────────────────────────────────
  {
    const env = makeEnv();
    const p = goalP();
    const r = await executeProposal(p, mkCtx(), env.deps);
    check('meta: ok', r.ok === true);
    check('meta: proposalId en el resultado', r.proposalId === p.proposalId);
    check('meta: mensaje exacto', r.ok && r.message === 'Meta «Laptop» creada.', r.ok ? r.message : r.error);
    check('meta: se guardó una', env.goals.length === 1);
    const g = env.goals[0];
    check('meta: id determinístico', g.id === entityIdFor('create_goal', p.proposalId) && g.id === `sg_as_${p.proposalId}`);
    check('meta: campos', g.name === 'Laptop' && g.targetAmount === 5000 && g.currentAmount === 0 && g.currency === 'Q' && g.isCompleted === false);
    check('meta: icono y color', g.icon === 'star-outline' && g.color === CATEGORY_COLORS[0]);
    check('meta: deadline a mediodía local', g.deadline === new Date(2026, 11, 31, 12).toISOString(), g.deadline);
    check('meta: onGoals con la lista', env.cb.goals.length === 1 && env.cb.goals[0].length === 1);
    check('meta: otros callbacks sin llamar', env.cb.budgets.length + env.cb.fixed.length + env.cb.txs.length === 0);
    check('meta: sin notificaciones', env.notif.schedule.length + env.notif.onTx.length === 0);
    check('meta: undo delete_goal', r.ok && r.undo?.kind === 'delete_goal' && r.undo.id === g.id && r.undo.snapshot.name === 'Laptop');
  }
  {
    // Idempotencia: la misma propuesta (aún 'pending' en la copia del llamador) dos veces seguidas
    const env = makeEnv();
    const p = goalP();
    const r1 = await executeProposal(p, mkCtx(), env.deps);
    const r2 = await executeProposal(p, mkCtx(), env.deps);
    check('meta idem: segundo intento ok', r1.ok && r2.ok);
    check('meta idem: no duplica', env.goals.length === 1);
    check('meta idem: una sola escritura', env.writes.filter(w => w === 'addSavingsGoal').length === 1);
    check('meta idem: mismo mensaje y undo', r2.ok && r1.ok && r2.message === r1.message && r2.undo?.kind === 'delete_goal');
    check('meta idem: refresca el estado de la app', env.cb.goals.length === 2);
  }
  {
    // Doble toque concurrente
    const env = makeEnv();
    const p = goalP();
    const [a, b] = await Promise.all([executeProposal(p, mkCtx(), env.deps), executeProposal(p, mkCtx(), env.deps)]);
    check('meta concurrente: exactamente uno ok', [a, b].filter(x => x.ok).length === 1);
    check('meta concurrente: el otro dice que está en curso', [a, b].some(x => !x.ok && x.error === IN_PROGRESS));
    check('meta concurrente: un solo registro', env.goals.length === 1);
    const c = await executeProposal(p, mkCtx(), env.deps);
    check('meta concurrente: libera el cerrojo al terminar', c.ok === true && env.goals.length === 1);
  }
  for (const status of ['done', 'cancelled', 'expired', 'failed', 'executing'] as const) {
    const env = makeEnv();
    const p = { ...goalP(), status };
    const r = await executeProposal(p, mkCtx(), env.deps);
    const expected = status === 'done' ? ALREADY_DONE : NOT_PENDING;
    check(`estado ${status}: rechaza`, !r.ok && r.error === expected, r.ok ? 'ok' : r.error);
    check(`estado ${status}: no escribe ni avisa`, env.writes.length === 0 && env.cb.goals.length === 0);
  }
  {
    // Revalidación con el ctx fresco
    const env = makeEnv();
    const p = goalP();
    const later = mkCtx({ now: new Date(2027, 0, 5, 9, 0) });   // la fecha límite 2026-12-31 ya pasó
    const r = await executeProposal(p, later, env.deps);
    check('meta revalida: fecha límite vencida', !r.ok && r.error === 'La fecha límite debe ser posterior a hoy.', r.ok ? 'ok' : r.error);
    check('meta revalida: no escribe', env.writes.length === 0 && env.goals.length === 0);
    const bad = { ...goalP(), slots: { ...goalSlots, amount: 0 } };
    const r2 = await executeProposal(bad, mkCtx(), env.deps);
    check('meta revalida: monto 0', !r2.ok && r2.error === 'El monto debe ser mayor que cero.', r2.ok ? 'ok' : r2.error);
    const noName = { ...goalP(), slots: { ...goalSlots, name: '   ' } };
    const r3 = await executeProposal(noName, mkCtx(), env.deps);
    check('meta revalida: sin nombre', !r3.ok);
    const hugeName = { ...goalP(), slots: { ...goalSlots, name: 'x'.repeat(41) } };
    check('meta revalida: nombre de 41 caracteres', !(await executeProposal(hugeName, mkCtx(), env.deps)).ok);
    check('meta revalida: ninguna escritura tras 4 rechazos', env.writes.length === 0);
  }
  {
    // Errores de storage
    const env = makeEnv();
    env.failOn.add('addSavingsGoal');
    const p = goalP();
    const r = await executeProposal(p, mkCtx(), env.deps);
    check('meta error: al escribir → mensaje de guardado', !r.ok && r.error === SAVE_ERROR && SAVE_ERROR === 'No se pudo guardar. Intente de nuevo.');
    check('meta error: no avisa a la app', env.cb.goals.length === 0 && env.goals.length === 0);
    env.failOn.clear();
    const r2 = await executeProposal(p, mkCtx(), env.deps);
    check('meta error: reintentar después funciona (cerrojo liberado)', r2.ok && env.goals.length === 1);

    const env2 = makeEnv();
    env2.failOn.add('getSavingsGoals');
    check('meta error: al leer → mensaje de guardado', (await executeProposal(goalP(), mkCtx(), env2.deps) as { error?: string }).error === SAVE_ERROR);
    check('meta error: al leer no escribe', env2.writes.length === 0);
  }
  {
    // Un callback roto no invalida lo guardado
    const env = makeEnv();
    env.cbThrows = true;
    const before = warns;
    const r = await executeProposal(goalP(), mkCtx(), env.deps);
    check('meta: callback que falla no cambia el resultado', r.ok && env.goals.length === 1);
    check('meta: el fallo del callback se registra', warns > before);
  }

  // ───────────────────────────────────────────────────────────
  // 3. executeProposal — presupuesto por categoría
  // ───────────────────────────────────────────────────────────
  {
    const env = makeEnv({ budgets: [] });
    const p = budgetP({ category: 'fuel', amount: 300 });
    const r = await executeProposal(p, mkCtx({ categoryBudgets: [] }), env.deps);
    check('presupuesto nuevo: ok', r.ok === true);
    const label = 'Combustible';
    check('presupuesto nuevo: mensaje con etiqueta y monto', r.ok && /^Límite de .+ fijado en Q 300\.00\.$/.test(r.message), r.ok ? r.message : r.error);
    void label;
    check('presupuesto nuevo: guardado en Q con alerta 80', same(env.budgets, [{ categoryId: 'fuel', limit: 300, currency: 'Q', alertAt: 80 }]), JSON.stringify(env.budgets));
    check('presupuesto nuevo: undo sin previous', r.ok && r.undo?.kind === 'restore_budget' && r.undo.previous === null && r.undo.applied.limit === 300);
    check('presupuesto nuevo: onBudgets', env.cb.budgets.length === 1);
  }
  {
    const env = makeEnv();   // restaurantes 600 alerta 70
    const p = budgetP();
    const r = await executeProposal(p, mkCtx(), env.deps);
    check('presupuesto existente: ok', r.ok === true);
    check('presupuesto existente: mensaje exacto', r.ok && r.message === 'Límite de Restaurantes fijado en Q 800.00.', r.ok ? r.message : r.error);
    check('presupuesto existente: reemplaza (sin duplicar)', env.budgets.length === 1 && env.budgets[0].limit === 800);
    check('presupuesto existente: conserva alertAt', env.budgets[0].alertAt === 70);
    check('presupuesto existente: undo guarda el previous', r.ok && r.undo?.kind === 'restore_budget' && same(r.undo.previous, BUDGET_REST));
  }
  {
    // El previous sale del storage, no de un ctx viejo
    const env = makeEnv();
    const p = budgetP();
    const staleCtx = mkCtx({ categoryBudgets: [] });
    const r = await executeProposal(p, staleCtx, env.deps);
    check('presupuesto: previous del storage aunque el ctx esté viejo', r.ok && r.undo?.kind === 'restore_budget' && r.undo.previous?.limit === 600);
    check('presupuesto: alertAt del storage aunque el ctx esté viejo', env.budgets[0].alertAt === 70);
  }
  {
    const env = makeEnv();
    const p = budgetP();
    const [a, b] = await Promise.all([executeProposal(p, mkCtx(), env.deps), executeProposal(p, mkCtx(), env.deps)]);
    check('presupuesto concurrente: uno ok y otro en curso', [a, b].filter(x => x.ok).length === 1 && [a, b].some(x => !x.ok && x.error === IN_PROGRESS));
    check('presupuesto concurrente: una escritura', env.writes.filter(w => w === 'upsertCategoryBudget').length === 1);
    check('presupuesto estado done: rechaza', !(await executeProposal({ ...p, status: 'done' }, mkCtx(), env.deps)).ok);
  }
  {
    const env = makeEnv();
    const usd = { ...budgetP(), slots: { ...budgetSlots, currency: 'USD' } };
    const r = await executeProposal(usd, mkCtx(), env.deps);
    check('presupuesto revalida: USD no admitido', !r.ok && r.error === 'Los presupuestos por categoría se manejan en quetzales.', r.ok ? 'ok' : r.error);
    const ghost = { ...budgetP(), slots: { category: 'no_existe', amount: 100 } };
    check('presupuesto revalida: categoría inexistente', !(await executeProposal(ghost, mkCtx(), env.deps)).ok);
    const custom = { ...budgetP(), slots: { category: 'custom_pets', amount: 150 } };
    const noCustomCtx = mkCtx({ settings: { ...SETTINGS, customCategories: [] } });
    check('presupuesto revalida: categoría personalizada borrada', !(await executeProposal(custom, noCustomCtx, env.deps)).ok);
    check('presupuesto revalida: no escribe', env.writes.length === 0);
    const okCustom = await executeProposal({ ...custom, proposalId: pid() }, mkCtx(), env.deps);
    check('presupuesto personalizado: mensaje con la etiqueta', okCustom.ok && okCustom.message === 'Límite de Mascotas fijado en Q 150.00.', okCustom.ok ? okCustom.message : okCustom.error);
  }
  {
    const env = makeEnv();
    env.failOn.add('upsertCategoryBudget');
    const r = await executeProposal(budgetP(), mkCtx(), env.deps);
    check('presupuesto error: al escribir', !r.ok && r.error === SAVE_ERROR);
    check('presupuesto error: no avisa y no cambia', env.cb.budgets.length === 0 && env.budgets[0].limit === 600);
    const env2 = makeEnv();
    env2.failOn.add('getCategoryBudgets');
    check('presupuesto error: al leer', (await executeProposal(budgetP(), mkCtx(), env2.deps) as { error?: string }).error === SAVE_ERROR);
  }

  // ───────────────────────────────────────────────────────────
  // 4. executeProposal — gasto fijo
  // ───────────────────────────────────────────────────────────
  {
    const env = makeEnv();
    const p = fixedP();
    const r = await executeProposal(p, mkCtx(), env.deps);
    check('fijo: ok', r.ok === true);
    check('fijo: mensaje exacto', r.ok && r.message === 'Gasto fijo «Netflix» agregado.', r.ok ? r.message : r.error);
    const e = env.fixed[0];
    check('fijo: id determinístico', e.id === `fe_as_${p.proposalId}`);
    check('fijo: campos', e.name === 'Netflix' && e.amount === 15.99 && e.currency === 'USD' && e.category === 'streaming' && e.dayOfMonth === 5);
    check('fijo: banderas iniciales', e.isPaid === false && e.autoRecord === true && e.isActive === true && e.notes === '');
    check('fijo: smsMatchKey con SMS de Netflix y SMS activo', e.smsMatchKey === 'netflix', String(e.smsMatchKey));
    check('fijo: onFixed', env.cb.fixed.length === 1 && env.cb.fixed[0].length === 1);
    check('fijo: programa el recordatorio con el gasto', env.notif.schedule.length === 1 && env.notif.schedule[0].id === e.id);
    check('fijo: undo delete_fixed', r.ok && r.undo?.kind === 'delete_fixed' && r.undo.id === e.id);
  }
  {
    const env = makeEnv();
    const r = await executeProposal(fixedP(fixedSlots, pid(), mkCtx({ smsOn: false })), mkCtx({ smsOn: false }), env.deps);
    check('fijo SMS apagado: sin smsMatchKey', r.ok && env.fixed[0].smsMatchKey === undefined);
  }
  {
    const env = makeEnv();
    const p = fixedP();
    await executeProposal(p, mkCtx(), env.deps);
    const r2 = await executeProposal(p, mkCtx(), env.deps);
    check('fijo idem: no duplica', r2.ok && env.fixed.length === 1);
    check('fijo idem: no reprograma el recordatorio', env.notif.schedule.length === 1);
    check('fijo idem: undo disponible', r2.ok && r2.undo?.kind === 'delete_fixed');
    const env2 = makeEnv();
    const p2 = fixedP();
    const [a, b] = await Promise.all([executeProposal(p2, mkCtx(), env2.deps), executeProposal(p2, mkCtx(), env2.deps)]);
    check('fijo concurrente: uno solo', [a, b].filter(x => x.ok).length === 1 && env2.fixed.length === 1);
  }
  for (const mode of ['reject', 'throw', 'hang'] as const) {
    const env = makeEnv();
    env.notifMode.schedule = mode;
    const r = await Promise.race([
      executeProposal(fixedP(), mkCtx(), env.deps),
      new Promise<'timeout'>(res => setTimeout(() => res('timeout'), 500)),
    ]);
    check(`fijo recordatorio ${mode}: no bloquea ni falla`, r !== 'timeout' && r.ok === true && env.fixed.length === 1);
  }
  {
    const env = makeEnv();
    const dup = fixedP({ ...fixedSlots, name: 'Gym', amount: 200, day: 31, currency: 'Q', category: 'health' });
    const r = await executeProposal(dup, mkCtx(), env.deps);
    check('fijo día 31: ok (solo avisa)', r.ok === true && env.fixed[0].dayOfMonth === 31);
    const bad0 = { ...fixedP(), slots: { ...fixedSlots, day: 0 } };
    const bad32 = { ...fixedP(), slots: { ...fixedSlots, day: 32 } };
    const badAmount = { ...fixedP(), slots: { ...fixedSlots, amount: -5 } };
    const badCat = { ...fixedP(), slots: { ...fixedSlots, category: 'zzz' } };
    const badCur = { ...fixedP(), slots: { ...fixedSlots, currency: 'MXN' } };
    const env2 = makeEnv();
    check('fijo revalida: día 0', !(await executeProposal(bad0, mkCtx(), env2.deps)).ok);
    check('fijo revalida: día 32', !(await executeProposal(bad32, mkCtx(), env2.deps)).ok);
    check('fijo revalida: monto negativo', !(await executeProposal(badAmount, mkCtx(), env2.deps)).ok);
    check('fijo revalida: categoría inexistente', !(await executeProposal(badCat, mkCtx(), env2.deps)).ok);
    check('fijo revalida: moneda inválida', !(await executeProposal(badCur, mkCtx(), env2.deps)).ok);
    check('fijo revalida: no escribe ni programa', env2.writes.length === 0 && env2.notif.schedule.length === 0);
  }
  {
    const env = makeEnv();
    env.failOn.add('addFixedExpense');
    const r = await executeProposal(fixedP(), mkCtx(), env.deps);
    check('fijo error: al escribir', !r.ok && r.error === SAVE_ERROR);
    check('fijo error: no programa recordatorio ni avisa', env.notif.schedule.length === 0 && env.cb.fixed.length === 0);
    const env2 = makeEnv();
    env2.failOn.add('getFixedExpenses');
    check('fijo error: al leer', (await executeProposal(fixedP(), mkCtx(), env2.deps) as { error?: string }).error === SAVE_ERROR);
  }

  // ───────────────────────────────────────────────────────────
  // 5. executeProposal — movimiento
  // ───────────────────────────────────────────────────────────
  {
    const env = makeEnv();
    const ctx = mkCtx();
    const p = txP();
    check('mov: la propuesta trae aviso de duplicado con el SMS', p.warnings.length > 0 && p.issues.length === 0, JSON.stringify(p.warnings));
    const r = await executeProposal(p, ctx, env.deps);
    check('mov: ok pese al aviso de duplicado', r.ok === true);
    check('mov: mensaje exacto', r.ok && r.message === 'Gasto de Q 85.00 registrado.', r.ok ? r.message : r.error);
    const t = env.txs.find(x => x.id === `as_${p.proposalId}`)!;
    check('mov: id determinístico', !!t && t.id === entityIdFor('create_transaction', p.proposalId));
    check('mov: campos', t.amount === 85 && t.category === 'fuel' && t.type === 'expense' && t.currency === 'Q' && t.description === 'Gasolina');
    check('mov: source manual y fecha del día elegido', t.source === 'manual' && new Date(t.date).getDate() === 11 && new Date(t.date).getMonth() === 10);
    check('mov: onTransactions con la lista completa', env.cb.txs.length === 1 && env.cb.txs[0].length === 3);
    check('mov: onTransactionAdded se llamó una vez', env.notif.onTx.length === 1);
    const args = env.notif.onTx[0];
    check('mov: onTransactionAdded(tx, lista, settings, presupuestos del ctx, fijos del ctx)',
      (args[0] as Transaction).id === t.id && (args[1] as Transaction[]).length === 3 && args[2] === env.deps.settings
      && args[3] === ctx.categoryBudgets && args[4] === ctx.fixedExpenses);
    check('mov: undo delete_tx', r.ok && r.undo?.kind === 'delete_tx' && r.undo.id === t.id && r.undo.snapshot.amount === 85);
  }
  {
    const env = makeEnv();
    const r = await executeProposal(txP({ tx_type: 'income', amount: 6000, category: 'salary', description: 'Sueldo', date: '2026-11-12' }), mkCtx(), env.deps);
    check('mov ingreso: mensaje', r.ok && r.message === 'Ingreso de Q 6,000.00 registrado.', r.ok ? r.message : r.error);
    check('mov ingreso: tipo income', env.txs[env.txs.length - 1].type === 'income');
    const r2 = await executeProposal(txP({ tx_type: 'expense', amount: 12, category: 'streaming', description: 'Spotify', date: '2026-11-12', currency: 'USD' }), mkCtx(), env.deps);
    check('mov USD: mensaje con $', r2.ok && r2.message === 'Gasto de $ 12.00 registrado.', r2.ok ? r2.message : r2.error);
    check('mov USD: moneda guardada', env.txs[env.txs.length - 1].currency === 'USD');
  }
  {
    const env = makeEnv();
    const p = txP();
    await executeProposal(p, mkCtx(), env.deps);
    const r2 = await executeProposal(p, mkCtx(), env.deps);
    check('mov idem: no duplica', r2.ok && env.txs.length === 3);
    check('mov idem: no repite alertas', env.notif.onTx.length === 1);
    check('mov idem: una sola escritura', env.writes.filter(w => w === 'addTransaction').length === 1);
    const env2 = makeEnv();
    const p2 = txP();
    const [a, b] = await Promise.all([executeProposal(p2, mkCtx(), env2.deps), executeProposal(p2, mkCtx(), env2.deps)]);
    check('mov concurrente: uno solo', [a, b].filter(x => x.ok).length === 1 && env2.txs.length === 3);
    check('mov concurrente: el otro está en curso', [a, b].some(x => !x.ok && x.error === IN_PROGRESS));
  }
  for (const mode of ['reject', 'throw', 'hang'] as const) {
    const env = makeEnv();
    env.notifMode.onTx = mode;
    const r = await Promise.race([
      executeProposal(txP(), mkCtx(), env.deps),
      new Promise<'timeout'>(res => setTimeout(() => res('timeout'), 500)),
    ]);
    check(`mov alertas ${mode}: no bloquea ni falla`, r !== 'timeout' && r.ok === true && env.txs.length === 3);
  }
  {
    const env = makeEnv();
    const future = { ...txP(), slots: { ...txSlots, date: '2026-11-20' } };
    const r = await executeProposal(future, mkCtx(), env.deps);
    check('mov revalida: fecha futura', !r.ok && r.error === 'La fecha del movimiento no puede ser futura.', r.ok ? 'ok' : r.error);
    const old = { ...txP(), slots: { ...txSlots, date: '2025-01-01' } };
    check('mov revalida: más de un año', !(await executeProposal(old, mkCtx(), env.deps)).ok);
    const earlier = txP({ ...txSlots, date: '2026-11-12' });
    const r2 = await executeProposal(earlier, mkCtx({ now: new Date(2026, 10, 11, 10, 0) }), env.deps);
    check('mov revalida: el ctx fresco cambió el «hoy»', !r2.ok);
    const noAmount = { ...txP(), slots: { ...txSlots, amount: 0 } };
    check('mov revalida: monto 0', !(await executeProposal(noAmount, mkCtx(), env.deps)).ok);
    const badType = { ...txP(), slots: { ...txSlots, tx_type: 'regalo' } };
    check('mov revalida: tipo inválido', !(await executeProposal(badType, mkCtx(), env.deps)).ok);
    const badCat = { ...txP(), slots: { ...txSlots, category: 'salary' } };   // categoría de ingreso en un gasto
    check('mov revalida: categoría de otro tipo', !(await executeProposal(badCat, mkCtx(), env.deps)).ok);
    const badAcc = { ...txP(), slots: { ...txSlots, account: 'acc_fantasma' } };
    check('mov revalida: cuenta inexistente', !(await executeProposal(badAcc, mkCtx(), env.deps)).ok);
    check('mov revalida: no escribe ni avisa', env.writes.length === 0 && env.notif.onTx.length === 0 && env.cb.txs.length === 0);
  }
  {
    const env = makeEnv();
    env.failOn.add('addTransaction');
    const r = await executeProposal(txP(), mkCtx(), env.deps);
    check('mov error: al escribir', !r.ok && r.error === SAVE_ERROR);
    check('mov error: no avisa, no alerta', env.cb.txs.length === 0 && env.notif.onTx.length === 0 && env.txs.length === 2);
    const env2 = makeEnv();
    env2.failOn.add('getTransactions');
    check('mov error: al leer', (await executeProposal(txP(), mkCtx(), env2.deps) as { error?: string }).error === SAVE_ERROR);
    check('mov error: al leer no escribe', env2.writes.length === 0);
  }

  // ───────────────────────────────────────────────────────────
  // 6. undoAction — meta
  // ───────────────────────────────────────────────────────────
  {
    const env = makeEnv();
    const r = await executeProposal(goalP(), mkCtx(), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    const u = await undoAction(undo, env.deps);
    check('deshacer meta: ok', u.ok === true);
    check('deshacer meta: mensaje', u.message === 'Meta «Laptop» eliminada.', u.message);
    check('deshacer meta: la borra', env.goals.length === 0);
    check('deshacer meta: avisa a la app con la lista vacía', env.cb.goals.length === 2 && env.cb.goals[1].length === 0);
    const u2 = await undoAction(undo, env.deps);
    check('deshacer meta: segunda vez no hace nada', !u2.ok && u2.message === UNDO_CHANGED);
    check('deshacer meta: UNDO_CHANGED es el texto del plan', UNDO_CHANGED === 'Ya no se puede deshacer: el registro cambió después (por ejemplo, se unió con un SMS).');
  }
  {
    const env = makeEnv();
    const r = await executeProposal(goalP(), mkCtx(), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    env.goals = env.goals.map(g => ({ ...g, currentAmount: 250 }));   // el usuario ya abonó
    const u = await undoAction(undo, env.deps);
    check('deshacer meta con abonos: no se puede', !u.ok && u.message === UNDO_CHANGED);
    check('deshacer meta con abonos: no borra', env.goals.length === 1 && !env.writes.includes('deleteSavingsGoal'));
    env.goals = [];
    check('deshacer meta ya borrada a mano: no se puede', !(await undoAction(undo, env.deps)).ok);
  }
  {
    // Ciclo completo: ejecutar → deshacer → volver a ejecutar la misma propuesta recrea la meta
    const env = makeEnv();
    const p = goalP();
    const r = await executeProposal(p, mkCtx(), env.deps);
    await undoAction((r.ok ? r.undo : undefined) as UndoToken, env.deps);
    const again = await executeProposal(p, mkCtx(), env.deps);
    check('meta ejecutar→deshacer→ejecutar: se recrea una sola vez', again.ok && env.goals.length === 1);
  }

  // ───────────────────────────────────────────────────────────
  // 7. undoAction — presupuesto
  // ───────────────────────────────────────────────────────────
  {
    const env = makeEnv({ budgets: [] });
    const r = await executeProposal(budgetP({ category: 'fuel', amount: 300 }), mkCtx({ categoryBudgets: [] }), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    const u = await undoAction(undo, env.deps);
    check('deshacer presupuesto nuevo: lo elimina', u.ok && env.budgets.length === 0 && env.writes.includes('deleteCategoryBudget'));
    check('deshacer presupuesto nuevo: mensaje', /^Límite de .+ eliminado\.$/.test(u.message), u.message);
    check('deshacer presupuesto nuevo: avisa a la app', env.cb.budgets.length === 2 && env.cb.budgets[1].length === 0);
    check('deshacer presupuesto nuevo: segunda vez no se puede', !(await undoAction(undo, env.deps)).ok);
  }
  {
    const env = makeEnv();
    const r = await executeProposal(budgetP(), mkCtx(), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    const u = await undoAction(undo, env.deps);
    check('deshacer presupuesto reemplazado: restaura el anterior', u.ok && same(env.budgets, [BUDGET_REST]), JSON.stringify(env.budgets));
    check('deshacer presupuesto reemplazado: mensaje', u.message === 'Límite de Restaurantes restaurado a Q 600.00.', u.message);
    check('deshacer presupuesto reemplazado: usa upsert, no delete', env.writes.includes('upsertCategoryBudget') && !env.writes.includes('deleteCategoryBudget'));
  }
  {
    const env = makeEnv();
    const r = await executeProposal(budgetP(), mkCtx(), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    env.budgets = env.budgets.map(b => ({ ...b, limit: 950 }));   // el usuario lo cambió después
    const u = await undoAction(undo, env.deps);
    check('deshacer presupuesto cambiado después: no se puede', !u.ok && u.message === UNDO_CHANGED);
    check('deshacer presupuesto cambiado después: no toca el límite nuevo', env.budgets[0].limit === 950);
    env.budgets = [];
    check('deshacer presupuesto eliminado a mano: no se puede', !(await undoAction(undo, env.deps)).ok);
  }
  {
    // El deshacer aplica a la categoría correcta aunque haya otros presupuestos
    const other: CategoryBudget = { categoryId: 'fuel', limit: 80, currency: 'Q', alertAt: 90 };
    const env = makeEnv({ budgets: [BUDGET_REST, other] });
    const r = await executeProposal(budgetP(), mkCtx(), env.deps);
    await undoAction((r.ok ? r.undo : undefined) as UndoToken, env.deps);
    check('deshacer presupuesto: no toca otras categorías', env.budgets.find(b => b.categoryId === 'fuel')?.limit === 80 && env.budgets.find(b => b.categoryId === 'restaurant')?.limit === 600);
  }

  // ───────────────────────────────────────────────────────────
  // 8. undoAction — gasto fijo
  // ───────────────────────────────────────────────────────────
  {
    const env = makeEnv();
    const r = await executeProposal(fixedP(), mkCtx(), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    const id = env.fixed[0].id;
    const u = await undoAction(undo, env.deps);
    check('deshacer fijo: ok', u.ok && u.message === 'Gasto fijo «Netflix» eliminado.', u.message);
    check('deshacer fijo: lo borra', env.fixed.length === 0);
    check('deshacer fijo: cancela el recordatorio', same(env.notif.cancel, [id]));
    check('deshacer fijo: avisa a la app', env.cb.fixed.length === 2 && env.cb.fixed[1].length === 0);
    check('deshacer fijo: segunda vez no se puede ni cancela de nuevo', !(await undoAction(undo, env.deps)).ok && env.notif.cancel.length === 1);
  }
  {
    const env = makeEnv();
    const r = await executeProposal(fixedP(), mkCtx(), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    env.fixed = env.fixed.map(e => ({ ...e, isPaid: true }));   // ya se marcó como pagado
    const u = await undoAction(undo, env.deps);
    check('deshacer fijo ya pagado: no se puede', !u.ok && u.message === UNDO_CHANGED);
    check('deshacer fijo ya pagado: no borra ni cancela', env.fixed.length === 1 && env.notif.cancel.length === 0);
  }
  for (const mode of ['reject', 'throw'] as const) {
    const env = makeEnv();
    const r = await executeProposal(fixedP(), mkCtx(), env.deps);
    env.notifMode.cancel = mode;
    const u = await undoAction((r.ok ? r.undo : undefined) as UndoToken, env.deps);
    check(`deshacer fijo, cancelar recordatorio ${mode}: igual se deshace`, u.ok && env.fixed.length === 0);
  }

  // ───────────────────────────────────────────────────────────
  // 9. undoAction — movimiento
  // ───────────────────────────────────────────────────────────
  {
    const env = makeEnv();
    const r = await executeProposal(txP(), mkCtx(), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    const u = await undoAction(undo, env.deps);
    check('deshacer mov: ok', u.ok && u.message === 'Gasto de Q 85.00 eliminado.', u.message);
    check('deshacer mov: lo borra y deja los demás', env.txs.length === 2 && env.txs.every(t => t.source === 'sms'));
    check('deshacer mov: avisa a la app', env.cb.txs.length === 2 && env.cb.txs[1].length === 2);
    check('deshacer mov: segunda vez no se puede', !(await undoAction(undo, env.deps)).ok);
  }
  {
    const env = makeEnv();
    const r = await executeProposal(txP({ tx_type: 'income', amount: 500, category: 'salary', date: '2026-11-12' }), mkCtx(), env.deps);
    const u = await undoAction((r.ok ? r.undo : undefined) as UndoToken, env.deps);
    check('deshacer ingreso: mensaje', u.ok && u.message === 'Ingreso de Q 500.00 eliminado.', u.message);
  }
  {
    // Se unió con un SMS: el manual desaparece y el SMS conserva la copia en mergedFrom
    const env = makeEnv();
    const p = txP();
    const r = await executeProposal(p, mkCtx(), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    const manualId = `as_${p.proposalId}`;
    env.txs = env.txs.filter(t => t.id !== manualId).map(t => t.id === 'shell1'
      ? { ...t, mergedFrom: { id: manualId, description: 'Gasolina', category: 'fuel', date: iso(2026, 11, 11), amount: 85, currency: 'Q' as const } }
      : t);
    const u = await undoAction(undo, env.deps);
    check('deshacer mov unido con SMS: no se puede', !u.ok && u.message === UNDO_CHANGED);
    check('deshacer mov unido con SMS: no borra nada', env.txs.length === 2 && !env.writes.includes('deleteTransaction'));
  }
  {
    // Mismo id pero el registro cambió
    const base = async () => {
      const env = makeEnv();
      const p = txP();
      const r = await executeProposal(p, mkCtx(), env.deps);
      return { env, undo: (r.ok ? r.undo : undefined) as UndoToken, id: `as_${p.proposalId}` };
    };
    const a = await base();
    a.env.txs = a.env.txs.map(t => t.id === a.id ? { ...t, source: 'sms' as const } : t);
    check('deshacer mov: ya no es manual', !(await undoAction(a.undo, a.env.deps)).ok && a.env.txs.length === 3);
    const b = await base();
    b.env.txs = b.env.txs.map(t => t.id === b.id ? { ...t, mergedFrom: { id: 'x', description: 'x', category: 'fuel', date: iso(2026, 11, 11), amount: 85, currency: 'Q' as const } } : t);
    check('deshacer mov: tiene mergedFrom', !(await undoAction(b.undo, b.env.deps)).ok && b.env.txs.length === 3);
    const c = await base();
    c.env.txs = c.env.txs.map(t => t.id === c.id ? { ...t, amount: 90 } : t);
    check('deshacer mov: el monto fue editado', !(await undoAction(c.undo, c.env.deps)).ok && c.env.txs.length === 3);
    const d = await base();
    d.env.txs = d.env.txs.filter(t => t.id !== d.id);
    const du = await undoAction(d.undo, d.env.deps);
    check('deshacer mov: ya borrado', !du.ok && du.message === UNDO_CHANGED);
    const e = await base();
    e.env.txs = e.env.txs.map(t => t.id === e.id ? { ...t, category: 'food', description: 'otra cosa' } : t);
    check('deshacer mov: cambio de categoría/descripción sí se puede deshacer', (await undoAction(e.undo, e.env.deps)).ok && e.env.txs.length === 2);
  }

  // ───────────────────────────────────────────────────────────
  // 10. undoAction — errores de storage y concurrencia
  // ───────────────────────────────────────────────────────────
  {
    const env = makeEnv();
    const r = await executeProposal(txP(), mkCtx(), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    env.failOn.add('getTransactions');
    const u = await undoAction(undo, env.deps);
    check('deshacer: error al leer', !u.ok && u.message === UNDO_ERROR && UNDO_ERROR === 'No se pudo deshacer. Intente de nuevo.');
    env.failOn.clear();
    env.failOn.add('deleteTransaction');
    const u2 = await undoAction(undo, env.deps);
    check('deshacer: error al borrar', !u2.ok && u2.message === UNDO_ERROR && env.txs.length === 3);
    env.failOn.clear();
    check('deshacer: tras el error se puede reintentar (cerrojo liberado)', (await undoAction(undo, env.deps)).ok && env.txs.length === 2);
  }
  for (const [name, make, failOn] of [
    ['meta', async (env: Env) => (await executeProposal(goalP(), mkCtx(), env.deps)), 'deleteSavingsGoal'],
    ['presupuesto', async (env: Env) => (await executeProposal(budgetP(), mkCtx(), env.deps)), 'upsertCategoryBudget'],
    ['gasto fijo', async (env: Env) => (await executeProposal(fixedP(), mkCtx(), env.deps)), 'deleteFixedExpense'],
  ] as const) {
    const env = makeEnv();
    const r = await make(env);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    env.failOn.add(failOn);
    const u = await undoAction(undo, env.deps);
    check(`deshacer ${name}: error de escritura → mensaje de error`, !u.ok && u.message === UNDO_ERROR, u.message);
  }
  {
    const env = makeEnv();
    const r = await executeProposal(goalP(), mkCtx(), env.deps);
    const undo = (r.ok ? r.undo : undefined) as UndoToken;
    const [a, b] = await Promise.all([undoAction(undo, env.deps), undoAction(undo, env.deps)]);
    check('deshacer concurrente: uno solo lo hace', [a, b].filter(x => x.ok).length === 1);
    check('deshacer concurrente: el otro está en curso', [a, b].some(x => !x.ok && x.message === IN_PROGRESS));
    check('deshacer concurrente: una sola escritura', env.writes.filter(w => w === 'deleteSavingsGoal').length === 1);
  }
  {
    // Un callback roto durante el deshacer no lo invalida
    const env = makeEnv();
    const r = await executeProposal(goalP(), mkCtx(), env.deps);
    env.cbThrows = true;
    const u = await undoAction((r.ok ? r.undo : undefined) as UndoToken, env.deps);
    check('deshacer: callback que falla no cambia el resultado', u.ok && env.goals.length === 0);
  }
  {
    // Aislamiento entre propuestas distintas: ids distintos, no se pisan
    const env = makeEnv();
    const r1 = await executeProposal(goalP(), mkCtx(), env.deps);
    const r2 = await executeProposal(goalP({ ...goalSlots, name: 'Viaje' }), mkCtx(), env.deps);
    check('dos metas con propuestas distintas: ambas se guardan', r1.ok && r2.ok && env.goals.length === 2);
    await undoAction((r1.ok ? r1.undo : undefined) as UndoToken, env.deps);
    check('deshacer una meta no toca la otra', env.goals.length === 1 && env.goals[0].name === 'Viaje');
  }
  {
    // Flujo cruzado: ejecutar las cuatro acciones y deshacerlas todas
    const env = makeEnv();
    const results = [
      await executeProposal(goalP(), mkCtx(), env.deps),
      await executeProposal(budgetP(), mkCtx(), env.deps),
      await executeProposal(fixedP(), mkCtx(), env.deps),
      await executeProposal(txP(), mkCtx(), env.deps),
    ];
    check('cuatro acciones seguidas: todas ok', results.every(x => x.ok));
    const undone = [];
    for (const x of results) undone.push(await undoAction((x.ok ? x.undo : undefined) as UndoToken, env.deps));
    check('cuatro deshacer seguidos: todos ok', undone.every(x => x.ok));
    check('quedó todo como al principio', env.goals.length === 0 && env.fixed.length === 0 && env.txs.length === 2 && same(env.budgets, [BUDGET_REST]));
  }

  // ───────────────────────────────────────────────────────────
  // 5. Verificación de escritura real (VerifiedStorage): el storage «traga» el error y no escribe
  // ───────────────────────────────────────────────────────────
  {
    /** Entorno cuyo storage descarta las escrituras en silencio (como los save* con AsyncStorage roto). */
    const makeDropEnv = (dropAdds: boolean, dropDeletes: boolean) => {
      const env = makeEnv();
      const real = env.deps.storage;
      const inner = {
        ...real,
        addSavingsGoal: async (g: SavingsGoal) => (dropAdds ? [...env.goals] : real.addSavingsGoal(g)),
        deleteSavingsGoal: async (id: string) => (dropDeletes ? [...env.goals] : real.deleteSavingsGoal(id)),
        upsertCategoryBudget: async (b: CategoryBudget) => (dropAdds ? [...env.budgets] : real.upsertCategoryBudget(b)),
        deleteCategoryBudget: async (id: string) => (dropDeletes ? [...env.budgets] : real.deleteCategoryBudget(id)),
        addFixedExpense: async (e: FixedExpense) => (dropAdds ? [...env.fixed] : real.addFixedExpense(e)),
        deleteFixedExpense: async (id: string) => (dropDeletes ? [...env.fixed] : real.deleteFixedExpense(id)),
        addTransaction: async (tx: Transaction) => (dropAdds ? [...env.txs] : real.addTransaction(tx)),
        deleteTransaction: async (id: string) => (dropDeletes ? [...env.txs] : real.deleteTransaction(id)),
      };
      env.deps = { ...env.deps, storage: withWriteVerification(inner) };
      return env;
    };

    // Escritura descartada → SAVE_ERROR en las cuatro acciones, y la app no se refresca con datos falsos.
    const dropAdd = makeDropEnv(true, false);
    const rg = await executeProposal(goalP(), mkCtx(), dropAdd.deps);
    check('verificación: meta no escrita → SAVE_ERROR', !rg.ok && rg.error === SAVE_ERROR, JSON.stringify(rg));
    const rb = await executeProposal(budgetP(), mkCtx(), dropAdd.deps);
    check('verificación: presupuesto no escrito → SAVE_ERROR', !rb.ok && rb.error === SAVE_ERROR, JSON.stringify(rb));
    const rf = await executeProposal(fixedP(), mkCtx(), dropAdd.deps);
    check('verificación: gasto fijo no escrito → SAVE_ERROR', !rf.ok && rf.error === SAVE_ERROR, JSON.stringify(rf));
    const rt = await executeProposal(txP(), mkCtx(), dropAdd.deps);
    check('verificación: movimiento no escrito → SAVE_ERROR', !rt.ok && rt.error === SAVE_ERROR, JSON.stringify(rt));
    check('verificación: sin callbacks tras escritura fallida',
      dropAdd.cb.goals.length === 0 && dropAdd.cb.budgets.length === 0 && dropAdd.cb.fixed.length === 0 && dropAdd.cb.txs.length === 0);
    check('verificación: sin recordatorio ni notificación tras fallo', dropAdd.notif.schedule.length === 0 && dropAdd.notif.onTx.length === 0);

    // Escritura real → pasa y entrega la lista releída.
    const okEnv = makeDropEnv(false, false);
    const ok1 = await executeProposal(goalP(), mkCtx(), okEnv.deps);
    check('verificación: escritura real → ok', ok1.ok, JSON.stringify(ok1));
    check('verificación: el callback recibe la lista releída', okEnv.cb.goals.length === 1 && okEnv.cb.goals[0].length === 1);
    const ok2 = await executeProposal(budgetP(), mkCtx(), okEnv.deps);
    const ok3 = await executeProposal(fixedP(), mkCtx(), okEnv.deps);
    const ok4 = await executeProposal(txP(), mkCtx(), okEnv.deps);
    check('verificación: las cuatro acciones reales → ok', ok2.ok && ok3.ok && ok4.ok);

    // Deshacer con borrado descartado → UNDO_ERROR; con borrado real → ok.
    const dropDel = makeDropEnv(false, true);
    const g2 = await executeProposal(goalP(), mkCtx(), dropDel.deps);
    const b2 = await executeProposal(budgetP(), mkCtx(), dropDel.deps);
    const f2 = await executeProposal(fixedP(), mkCtx(), dropDel.deps);
    const t2 = await executeProposal(txP(), mkCtx(), dropDel.deps);
    for (const [name, r] of [['meta', g2], ['gasto fijo', f2], ['movimiento', t2]] as const) {
      const u = await undoAction((r.ok ? r.undo : undefined) as UndoToken, dropDel.deps);
      check(`verificación: deshacer ${name} con borrado descartado → UNDO_ERROR`, !u.ok && u.message === UNDO_ERROR, JSON.stringify(u));
    }
    // Presupuesto: deshacer restaura el límite anterior con un upsert; si se descarta, también es UNDO_ERROR.
    check('verificación: presupuesto aplicado con borrado real', b2.ok);
    const real = dropDel.deps.storage;
    const dropUpsert = withWriteVerification({ ...real, upsertCategoryBudget: async () => [...dropDel.budgets] });
    const ub = await undoAction((b2.ok ? b2.undo : undefined) as UndoToken, { ...dropDel.deps, storage: dropUpsert });
    check('verificación: deshacer presupuesto con upsert descartado → UNDO_ERROR', !ub.ok && ub.message === UNDO_ERROR, JSON.stringify(ub));
    const undoOk = makeDropEnv(false, false);
    const g3 = await executeProposal(goalP(), mkCtx(), undoOk.deps);
    const u3 = await undoAction((g3.ok ? g3.undo : undefined) as UndoToken, undoOk.deps);
    check('verificación: deshacer con borrado real → ok', u3.ok && undoOk.goals.length === 0, JSON.stringify(u3));

    // Las lecturas pasan sin tocar nada.
    const probe = makeEnv();
    const wrapped = withWriteVerification(probe.deps.storage);
    check('verificación: las lecturas pasan tal cual', (await wrapped.getTransactions()).length === 2 && probe.writes.length === 0);
  }

  console.warn = realWarn;
  console.log(`\n${checks} comprobaciones, ${failures} fallas`);
  if (failures > 0) process.exit(1);
}

main().catch(e => {
  console.warn = realWarn;
  console.log('ERROR no controlado en las pruebas:', e);
  process.exit(1);
});
