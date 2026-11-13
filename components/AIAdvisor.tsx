import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
    ActivityIndicator, ScrollView, StyleSheet, Text, TextInput,
    TouchableOpacity, useWindowDimensions, View
} from "react-native";
import {
    Account, CategoryBudget, CreditInstallment, FixedExpense,
    SavingsGoal, StorageService, Transaction, UserSettings,
    getCurrentFinancialPeriod
} from "../services/storage";
import { buildLocalOpening, computeLocalMetrics, getLocalResponse, getQuickReplies } from "../services/LocalAdvisorEngine";
import { createGeminiTransport } from "../services/GeminiClient";
import { isSmsFeatureOn } from "../services/features";
import { applyEdit, startGuided } from "../services/assistant/Dialogue";
import type { DialogueOutput } from "../services/assistant/Dialogue";
import { IN_PROGRESS, SAVE_ERROR, UNDO_ERROR, executeProposal, undoAction } from "../services/assistant/Executor";
import { createExecutorDeps } from "../services/assistant/ExecutorDeps";
import { routeMessage } from "../services/assistant/Router";
import type { RouterDeps } from "../services/assistant/Router";
import { EMPTY_DIALOGUE } from "../services/assistant/types";
import type {
    ActionProposal, ActionResult, AssistantContext, ChatMessage, Chip, DialogueState, DialogueTarget, SlotMap,
} from "../services/assistant/types";
import { C } from "../theme";
import { useTutorialRef } from "../context/TutorialContext";
import { AssistantMessageView, AssistantTypingRow } from "./assistant/AssistantMessageView";
import { ProposalEditSheet } from "./assistant/ProposalEditSheet";
import { QuickActionsBar } from "./assistant/QuickActionsBar";
import type { QuickActionId } from "./assistant/QuickActionsBar";
import { GlassBackground } from "./GlassCard";
import { HelpButton } from "./HelpButton";
import { InlineNotice } from "./InlineNotice";
import { ScreenHeader } from "./ScreenHeader";
import { useKeyboardHeight } from "./useKeyboardHeight";

// ─────────────────────────────────────────────────────────────
// CONSTANTES
// ─────────────────────────────────────────────────────────────
type Busy = "idle" | "thinking" | "gemini" | "executing";
type GeminiTurn = { role: "user" | "model"; text: string };

const WELCOME_EXTRA = "También puedo crear metas, presupuestos y gastos fijos, registrar movimientos y responder consultas.";
const SAVE_DEBOUNCE_MS = 800;
const GEMINI_COOLDOWN_MS = 60000;
const MAX_GEMINI_HISTORY = 20;
const LOCAL_BANNER = "Modo local: entiendo consultas y órdenes en el teléfono, sin internet. Gemini es opcional (Ajustes).";

/** Pregunta del botón «Consultar»: el `value` de cada chip se envía como si se hubiera escrito. */
const QUERY_QUESTION = "¿Qué desea consultar?";
const QUERY_CHIPS: Chip[] = [
    { label: "Gasto por categoría", value: "Cuánto gasté por categoría este período" },
    { label: "Movimientos de un comercio", value: "Muéstrame los movimientos" },
    { label: "Gastos fijos pendientes", value: "Qué gastos fijos me faltan por pagar" },
    { label: "Presupuestos", value: "Cómo van mis presupuestos" },
    { label: "Metas", value: "Cómo van mis metas" },
];
/** Slot de las preguntas que no pertenecen a un diálogo (aclaración del router y «Consultar»). */
const FREE_QUESTION_SLOT = "_intent";

const GUIDED_TARGETS: Record<Exclude<QuickActionId, "query">, { target: DialogueTarget; preset?: SlotMap }> = {
    goal: { target: { type: "action", id: "create_goal" } },
    budget: { target: { type: "action", id: "set_category_budget" } },
    fixed: { target: { type: "action", id: "create_fixed_expense" } },
    expense: { target: { type: "action", id: "create_transaction" }, preset: { tx_type: "expense" } },
};

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props {
    transactions: Transaction[];
    settings: UserSettings;
    accounts?: Account[];
    fixedExpenses?: FixedExpense[];
    categoryBudgets?: CategoryBudget[];
    savingsGoals?: SavingsGoal[];
    creditInstallments?: CreditInstallment[];
    /** El asistente escribe datos: la app debe refrescar su estado con la lista nueva. */
    onTransactionsChanged: (t: Transaction[]) => void;
    onFixedExpensesChanged: (f: FixedExpense[]) => void;
    onCategoryBudgetsChanged: (b: CategoryBudget[]) => void;
    onSavingsGoalsChanged: (g: SavingsGoal[]) => void;
}

export default function AIAdvisor(props: Props) {
    const {
        transactions, settings,
        accounts = [], fixedExpenses = [], categoryBudgets = [],
        savingsGoals = [], creditInstallments = [],
    } = props;
    const hasApiKey = (settings.geminiApiKey ?? "").trim().length > 20;
    const { height: windowHeight } = useWindowDimensions();
    const kb = useKeyboardHeight();

    const metrics = useMemo(
        () => computeLocalMetrics(transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets),
        [transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets]
    );

    const getWelcomeText = (): string => {
        const base = hasApiKey
            ? `¡Hola ${settings.userName}! Soy tu CFO personal. Tengo acceso a tus datos financieros reales y puedo ayudarte con cualquier análisis o decisión. ¿En qué te puedo ayudar hoy?`
            : buildLocalOpening(transactions, settings, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets);
        return `${base}\n\n${WELCOME_EXTRA}`;
    };

    // ── Estado (con espejo en refs para leerlo de forma síncrona dentro de handlers asíncronos) ──
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [dialogue, setDialogue] = useState<DialogueState>(EMPTY_DIALOGUE);
    const [geminiHistory, setGeminiHistory] = useState<GeminiTurn[]>([]);
    const [busy, setBusy] = useState<Busy>("idle");
    const [editing, setEditing] = useState<ActionProposal | null>(null);
    const [merchantRules, setMerchantRules] = useState<AssistantContext["merchantRules"]>([]);
    const [hydrated, setHydrated] = useState(false);
    const [input, setInput] = useState("");
    const [rootBox, setRootBox] = useState<{ y: number; h: number } | null>(null);

    const messagesRef = useRef<ChatMessage[]>([]);
    const dialogueRef = useRef<DialogueState>(EMPTY_DIALOGUE);
    const geminiHistoryRef = useRef<GeminiTurn[]>([]);
    const busyRef = useRef<Busy>("idle");
    const hydratedRef = useRef(false);
    const mountedRef = useRef(true);
    const dirtyRef = useRef(false);
    const cooldownRef = useRef(0);
    const idSeq = useRef(0);
    const layoutYRef = useRef<Record<string, number>>({});
    const focusRef = useRef<string | null>(null);
    const focusTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const undoingRef = useRef<Set<string>>(new Set());

    const scrollRef = useRef<ScrollView>(null);
    const rootRef = useRef<View>(null);
    const inputRef = useRef<TextInput>(null);
    const headerRef = useTutorialRef("advisor_header");
    const chatRef = useTutorialRef("advisor_chat");
    const suggestionsRef = useTutorialRef("advisor_suggestions");
    const inputBoxRef = useTutorialRef("advisor_input");
    const clearRef = useTutorialRef("advisor_clear");

    const newId = (): string => `${Date.now().toString(36)}${(idSeq.current++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

    const saveNow = () => {
        if (!hydratedRef.current) return;
        dirtyRef.current = false;
        const msgs = messagesRef.current;
        // Solo la bienvenida: no hay nada que guardar (y así «Reiniciar» deja el almacenamiento limpio).
        if (msgs.length === 0 || (msgs.length === 1 && msgs[0].id === "welcome" && geminiHistoryRef.current.length === 0)) return;
        void StorageService.saveAssistantChat({
            v: 1, messages: msgs, geminiHistory: geminiHistoryRef.current, savedAt: new Date().toISOString(),
        });
    };
    const saveNowRef = useRef(saveNow);
    saveNowRef.current = saveNow;

    const updateMessages = (fn: (prev: ChatMessage[]) => ChatMessage[]) => {
        const next = fn(messagesRef.current);
        if (next === messagesRef.current) return;
        messagesRef.current = next;
        setMessages(next);
        // Si la pantalla ya se desmontó (cambio de pestaña en medio de una acción), el efecto de guardado no corre.
        if (!mountedRef.current) { dirtyRef.current = true; saveNowRef.current(); }
    };
    const updateDialogue = (next: DialogueState) => { dialogueRef.current = next; setDialogue(next); };
    const updateGeminiHistory = (next: GeminiTurn[]) => { geminiHistoryRef.current = next; setGeminiHistory(next); };
    const setBusyBoth = (b: Busy) => { busyRef.current = b; setBusy(b); };

    /** Contexto fresco para el NLU, el Gemini y el Executor (siempre con los datos más recientes del render). */
    const buildCtx = (): AssistantContext => ({
        now: new Date(),
        period: getCurrentFinancialPeriod(settings),
        settings,
        transactions, accounts, fixedExpenses, categoryBudgets, savingsGoals, merchantRules,
        smsOn: isSmsFeatureOn(settings),
    });
    const latest = useRef({ buildCtx, props, hasApiKey });
    latest.current = { buildCtx, props, hasApiKey };

    const getWelcomeTextRef = useRef(getWelcomeText);
    getWelcomeTextRef.current = getWelcomeText;

    // ── Montaje: chat guardado + reglas de comercio ──
    useEffect(() => {
        mountedRef.current = true;
        let alive = true;
        (async () => {
            let chat: Awaited<ReturnType<typeof StorageService.getAssistantChat>> = null;
            let rules: AssistantContext["merchantRules"] = [];
            try { chat = await StorageService.getAssistantChat(); } catch { }
            try { rules = await StorageService.getMerchantRules(); } catch { }
            if (!alive) return;
            setMerchantRules(rules);
            if (chat && chat.messages.length > 0) {
                // Lo pendiente de una sesión anterior ya no se puede confirmar ni deshacer.
                messagesRef.current = chat.messages.map((m): ChatMessage => {
                    if (m.kind === "proposal" && (m.proposal.status === "pending" || m.proposal.status === "executing")) {
                        return { ...m, proposal: { ...m.proposal, status: "expired" } };
                    }
                    if (m.kind === "notice" && m.undoState === "available") return { ...m, undoState: "expired" };
                    return m;
                });
                geminiHistoryRef.current = chat.geminiHistory.slice(-MAX_GEMINI_HISTORY);
            } else {
                messagesRef.current = [{
                    id: "welcome", at: new Date().toISOString(), role: "ai", kind: "text", source: "advisor",
                    text: getWelcomeTextRef.current(),
                }];
            }
            setMessages(messagesRef.current);
            setGeminiHistory(geminiHistoryRef.current);
            hydratedRef.current = true;
            setHydrated(true);
        })();
        return () => {
            alive = false;
            mountedRef.current = false;
            if (dirtyRef.current) saveNowRef.current();
            if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        };
    }, []);

    // ── Guardado con debounce (solo tras hidratar) ──
    useEffect(() => {
        if (!hydrated) return;
        dirtyRef.current = true;
        const t = setTimeout(() => saveNowRef.current(), SAVE_DEBOUNCE_MS);
        return () => clearTimeout(t);
    }, [hydrated, messages, geminiHistory]);

    // La bienvenida (con cifras) se mantiene al día mientras sea el único mensaje.
    useEffect(() => {
        if (!hydrated) return;
        const text = getWelcomeText();
        updateMessages(prev => {
            const first = prev[0];
            if (prev.length === 1 && first.kind === "text" && first.id === "welcome" && first.text !== text) {
                return [{ ...first, text }];
            }
            return prev;
        });
    }, [hydrated, hasApiKey, settings, transactions, accounts, fixedExpenses, savingsGoals, creditInstallments, categoryBudgets]);

    // ── Teclado: edge-to-edge no redimensiona la ventana; se compensa el solape con la TabBar ──
    const measureRoot = () => {
        rootRef.current?.measureInWindow((_x, y, _w, h) => {
            if (h > 0) setRootBox(prev => (prev && prev.y === y && prev.h === h ? prev : { y, h }));
        });
    };
    useEffect(() => {
        measureRoot();
        const t = setTimeout(() => {
            measureRoot();
            scrollRef.current?.scrollToEnd({ animated: true });
        }, 80);
        return () => clearTimeout(t);
    }, [kb]);
    const kbPad = rootBox ? Math.max(0, kb - (windowHeight - (rootBox.y + rootBox.h))) : 0;
    const keyboardOpen = kb > 0;

    // ── Scroll ──
    const scrollToProposal = (proposalId: string): boolean => {
        const msg = messagesRef.current.find(m => m.kind === "proposal" && m.proposal.proposalId === proposalId);
        const y = msg ? layoutYRef.current[msg.id] : undefined;
        if (y === undefined) return false;
        scrollRef.current?.scrollTo({ y: Math.max(0, y - 8), animated: true });
        focusRef.current = null;
        return true;
    };
    const requestFocus = (proposalId: string) => {
        focusRef.current = proposalId;
        if (focusTimerRef.current) clearTimeout(focusTimerRef.current);
        // Si la tarjeta nunca reporta su posición, no se bloquea el scroll al final.
        focusTimerRef.current = setTimeout(() => { focusRef.current = null; }, 1200);
    };
    const onLayoutMessage = (messageId: string, y: number) => {
        layoutYRef.current[messageId] = y;
        const pid = focusRef.current;
        if (!pid) return;
        const msg = messagesRef.current.find(m => m.id === messageId);
        if (msg && msg.kind === "proposal" && msg.proposal.proposalId === pid) scrollToProposal(pid);
    };
    useEffect(() => {
        // Tarjeta corregida (mismo mensaje, posición ya conocida): el onLayout puede no repetirse.
        const pid = focusRef.current;
        if (pid) scrollToProposal(pid);
    }, [messages]);

    // ── Helpers de mensajes ──
    const makeNotice = (variant: "success" | "error" | "info" | "warning", text: string, extra: Partial<Extract<ChatMessage, { kind: "notice" }>> = {}): ChatMessage => ({
        id: newId(), at: new Date().toISOString(), role: "ai", kind: "notice", variant, text, ...extra,
    });
    const makeUser = (text: string): ChatMessage => ({
        id: newId(), at: new Date().toISOString(), role: "user", kind: "text", text,
    });
    const findProposal = (proposalId: string): ActionProposal | null => {
        const m = messagesRef.current.find(x => x.kind === "proposal" && x.proposal.proposalId === proposalId);
        return m && m.kind === "proposal" ? m.proposal : null;
    };
    const patchProposal = (proposalId: string, patch: Partial<ActionProposal>) => {
        updateMessages(prev => prev.map(m =>
            m.kind === "proposal" && m.proposal.proposalId === proposalId ? { ...m, proposal: { ...m.proposal, ...patch } } : m));
    };
    const clearLastProposal = (proposalId: string) => {
        if (dialogueRef.current.lastProposalId === proposalId) {
            updateDialogue({ ...dialogueRef.current, lastProposalId: null });
        }
    };

    const outputToMessages = (out: DialogueOutput): ChatMessage[] => {
        const at = new Date().toISOString();
        switch (out.type) {
            case "ask": return [{ id: newId(), at, role: "ai", kind: "question", text: out.text, chips: out.chips, slot: out.slot }];
            case "propose": return [{ id: newId(), at, role: "ai", kind: "proposal", proposal: out.proposal }];
            case "query": return [{ id: newId(), at, role: "ai", kind: "query", result: out.result }];
            case "cancelled": return [makeNotice("info", out.text)];
            default: return [];
        }
    };

    // ── Enviar un mensaje (escrito o desde un chip) ──
    const handleSend = async (text?: string) => {
        const userText = (text ?? input).trim();
        if (!userText || busyRef.current !== "idle" || !hydratedRef.current) return;
        setInput("");
        setBusyBoth("thinking");
        updateMessages(prev => [...prev, makeUser(userText)]);

        const { buildCtx: ctxOf, props: p, hasApiKey: keyOn } = latest.current;
        const st = p.settings;
        // Tras una espera corta, si hay clave, el indicador pasa a «Consultando con Gemini…».
        const timer = keyOn ? setTimeout(() => { if (busyRef.current === "thinking") setBusyBoth("gemini"); }, 350) : null;
        try {
            const ctx = ctxOf();
            const deps: RouterDeps = {
                newId,
                gemini: keyOn ? {
                    transport: createGeminiTransport((st.geminiApiKey ?? "").trim()),
                    history: geminiHistoryRef.current,
                    userName: st.userName,
                    extras: {
                        budgetLimit: st.budgetLimit,
                        monthlyIncome: st.monthlyIncome,
                        activeDebts: st.activeDebts,
                        monthlySavingsGoal: st.monthlySavingsGoal,
                        installments: p.creditInstallments ?? [],
                    },
                } : null,
                geminiCooldownUntil: cooldownRef.current,
                localAdvisor: t => getLocalResponse(
                    t, p.transactions, st, p.accounts ?? [], p.fixedExpenses ?? [], p.savingsGoals ?? [],
                    p.creditInstallments ?? [], p.categoryBudgets ?? [],
                ),
                getProposal: findProposal,
            };
            const outcome = await routeMessage(userText, dialogueRef.current, ctx, deps);

            if (outcome.rateLimited) cooldownRef.current = Date.now() + GEMINI_COOLDOWN_MS;
            if (outcome.geminiText) {
                updateGeminiHistory([
                    ...geminiHistoryRef.current,
                    { role: "user" as const, text: userText },
                    { role: "model" as const, text: outcome.geminiText },
                ].slice(-MAX_GEMINI_HISTORY));
            }
            if (outcome.focusProposalId) requestFocus(outcome.focusProposalId);
            updateMessages(prev => {
                let next = prev;
                const rep = outcome.replaceProposal;
                if (rep) {
                    next = next.map(m => (m.kind === "proposal" && m.proposal.proposalId === rep.proposalId ? { ...m, proposal: rep } : m));
                }
                const cancelled = outcome.cancelledProposalId;
                if (cancelled) {
                    next = next.map(m => (
                        m.kind === "proposal" && m.proposal.proposalId === cancelled && m.proposal.status === "pending"
                            ? { ...m, proposal: { ...m.proposal, status: "cancelled" as const } } : m));
                }
                return [...next, ...outcome.messages];
            });
            updateDialogue(outcome.state);
        } catch {
            updateMessages(prev => [...prev, makeNotice("error", "No pude procesar el mensaje. Intente de nuevo.")]);
        } finally {
            if (timer) clearTimeout(timer);
            setBusyBoth("idle");
        }
    };

    /** Los chips se envían como si se hubieran escrito; «Cancelar» sin nada pendiente no pasa por el router. */
    const handleChip = (chip: Chip) => {
        if (busyRef.current !== "idle") return;
        if (chip.value === "cancelar" && !dialogueRef.current.active) {
            const lp = dialogueRef.current.lastProposalId;
            const pending = lp ? findProposal(lp) : null;
            if (!pending || pending.status !== "pending") {
                updateMessages(prev => [...prev, makeUser(chip.label), makeNotice("info", "Listo. Escriba otra consulta u orden cuando quiera.")]);
                return;
            }
        }
        void handleSend(chip.value);
    };

    // ── Acciones guiadas ──
    const handleQuickAction = (id: QuickActionId) => {
        if (busyRef.current !== "idle" || !hydratedRef.current) return;
        if (id === "query") {
            updateDialogue({ active: null, lastProposalId: dialogueRef.current.lastProposalId });
            updateMessages(prev => [...prev, {
                id: newId(), at: new Date().toISOString(), role: "ai", kind: "question",
                text: QUERY_QUESTION, chips: QUERY_CHIPS, slot: FREE_QUESTION_SLOT,
            }]);
            return;
        }
        const g = GUIDED_TARGETS[id];
        const r = startGuided(g.target, latest.current.buildCtx(), newId, g.preset);
        const out = outputToMessages(r.out);
        const prop = out.find(m => m.kind === "proposal");
        if (prop && prop.kind === "proposal") requestFocus(prop.proposal.proposalId);
        updateMessages(prev => [...prev, ...out]);
        updateDialogue(r.state);
    };

    // ── Confirmar / Editar / Cancelar / Deshacer ──
    const executorDeps = () => createExecutorDeps({
        settings: latest.current.props.settings,
        onTransactions: latest.current.props.onTransactionsChanged,
        onFixed: latest.current.props.onFixedExpensesChanged,
        onBudgets: latest.current.props.onCategoryBudgetsChanged,
        onGoals: latest.current.props.onSavingsGoalsChanged,
    });

    const handleConfirm = async (proposalId: string) => {
        const original = findProposal(proposalId);
        if (!original || original.status !== "pending") return;
        const wasIdle = busyRef.current === "idle";
        if (wasIdle) setBusyBoth("executing");
        // Visualmente «executing»; al Executor se le pasa la propuesta ORIGINAL (status 'pending').
        patchProposal(proposalId, { status: "executing", error: undefined });
        let result: ActionResult;
        try {
            result = await executeProposal(original, latest.current.buildCtx(), executorDeps());
        } catch {
            result = { ok: false, proposalId, error: SAVE_ERROR };
        }
        if (!result.ok && result.error === IN_PROGRESS) {
            // Doble toque: el primer intento ya está en curso y pintará el resultado.
            if (wasIdle && busyRef.current === "executing") setBusyBoth("idle");
            return;
        }
        if (result.ok) {
            patchProposal(proposalId, { status: "done" });
            clearLastProposal(proposalId);
            const notice = makeNotice("success", result.message, result.undo ? { undo: result.undo, undoState: "available" } : {});
            // Un solo «Deshacer» vigente: al confirmar otra escritura, los anteriores vencen.
            updateMessages(prev => [
                ...prev.map((m): ChatMessage => (m.kind === "notice" && m.undoState === "available" ? { ...m, undoState: "expired" } : m)),
                notice,
            ]);
        } else {
            patchProposal(proposalId, { status: "failed", error: result.error });
        }
        if (wasIdle && busyRef.current === "executing") setBusyBoth("idle");
    };

    const handleEdit = (proposalId: string) => {
        const p = findProposal(proposalId);
        if (p && p.status === "pending") setEditing(p);
    };

    const handleEditSave = (patch: SlotMap) => {
        const base = editing ? findProposal(editing.proposalId) : null;
        setEditing(null);
        if (!base || base.status !== "pending") return;
        // Un campo vaciado llega como '' y applyEdit lo interpreta como «vaciar el slot».
        const next = applyEdit(base, patch, latest.current.buildCtx());
        requestFocus(next.proposalId);
        updateMessages(prev => prev.map(m => (m.kind === "proposal" && m.proposal.proposalId === next.proposalId ? { ...m, proposal: next } : m)));
        updateDialogue({ ...dialogueRef.current, lastProposalId: next.proposalId });
    };

    const handleCancel = (proposalId: string) => {
        const p = findProposal(proposalId);
        if (!p || p.status !== "pending") return;
        patchProposal(proposalId, { status: "cancelled" });
        clearLastProposal(proposalId);
    };

    const handleUndo = async (messageId: string) => {
        const msg = messagesRef.current.find(m => m.id === messageId);
        if (!msg || msg.kind !== "notice" || msg.undoState !== "available" || !msg.undo) return;
        if (undoingRef.current.has(messageId)) return;
        undoingRef.current.add(messageId);
        const setUndoState = (state: "available" | "done" | "expired") =>
            updateMessages(prev => prev.map(m => (m.kind === "notice" && m.id === messageId ? { ...m, undoState: state } : m)));
        try {
            const res = await undoAction(msg.undo, executorDeps());
            if (res.message === IN_PROGRESS) return;
            if (res.ok) {
                updateMessages(prev => [
                    ...prev.map((m): ChatMessage => (m.kind === "notice" && m.id === messageId ? { ...m, undoState: "done" } : m)),
                    makeNotice("info", res.message),
                ]);
            } else {
                // Fallo transitorio: se puede reintentar; si el registro cambió, ya no.
                updateMessages(prev => [
                    ...prev.map((m): ChatMessage => (m.kind === "notice" && m.id === messageId
                        ? { ...m, undoState: res.message === UNDO_ERROR ? "available" : "expired" } : m)),
                    makeNotice("warning", res.message),
                ]);
            }
        } catch {
            setUndoState("available");
            updateMessages(prev => [...prev, makeNotice("warning", UNDO_ERROR)]);
        } finally {
            undoingRef.current.delete(messageId);
        }
    };

    // ── Reiniciar ──
    const handleClearChat = () => {
        if (busyRef.current !== "idle") return;
        layoutYRef.current = {};
        focusRef.current = null;
        updateMessages(() => [{
            id: "welcome", at: new Date().toISOString(), role: "ai", kind: "text", source: "advisor", text: getWelcomeText(),
        }]);
        updateGeminiHistory([]);
        updateDialogue(EMPTY_DIALOGUE);
        setEditing(null);
        dirtyRef.current = false;
        void StorageService.clearAssistantChat();
    };

    const editCtx = useMemo(() => (editing ? latest.current.buildCtx() : null), [editing]);

    const quickReplies = useMemo(() => getQuickReplies(metrics), [metrics]);
    const lastUserText = [...messages].reverse().find(m => m.role === "user" && m.kind === "text");
    const visibleReplies = quickReplies.filter(q => !lastUserText || lastUserText.kind !== "text" || q !== lastUserText.text);
    const idle = busy === "idle";
    const typing = busy === "thinking" || busy === "gemini";
    const showSuggestions = !keyboardOpen && idle && !dialogue.active && input.trim() === "" && visibleReplies.length > 0;

    return (
        <View
            ref={rootRef}
            onLayout={measureRoot}
            style={[s.screen, { paddingBottom: kbPad }]}
        >
            {/* HEADER */}
            <View style={s.headerWrap}>
                <ScreenHeader
                    title="Asesor IA"
                    subtitle={hasApiKey ? "Gemini activo" : "Modo local"}
                    compact
                    headerRef={headerRef}
                    left={
                        <View style={s.iconBg}>
                            <GlassBackground radius={14} blur={false} />
                            <Ionicons name="sparkles" size={22} color={C.primaryLight} />
                        </View>
                    }
                    right={
                        <>
                            <HelpButton tutorialId="tutorial_ia" />
                            <View ref={clearRef} collapsable={false}>
                                <TouchableOpacity
                                    onPress={handleClearChat}
                                    disabled={!idle}
                                    activeOpacity={0.7}
                                    accessibilityRole="button"
                                    accessibilityLabel="Reiniciar el chat"
                                    style={[s.clearBtn, !idle && { opacity: 0.4 }]}
                                >
                                    <GlassBackground radius={18} blur={false} />
                                    <Ionicons name="refresh-outline" size={18} color={C.primaryLight} />
                                </TouchableOpacity>
                            </View>
                        </>
                    }
                />
            </View>

            {/* AVISO sin API Key */}
            {!hasApiKey && (
                <InlineNotice
                    variant="info"
                    icon="shield-checkmark-outline"
                    text={LOCAL_BANNER}
                    style={s.banner}
                />
            )}

            {/* MENSAJES */}
            <View ref={chatRef} collapsable={false} style={s.chatWrap}>
                <ScrollView
                    ref={scrollRef}
                    style={s.chatList}
                    contentContainerStyle={{ paddingTop: 8, paddingBottom: 16 }}
                    showsVerticalScrollIndicator={false}
                    keyboardShouldPersistTaps="handled"
                    onContentSizeChange={() => {
                        if (focusRef.current) return;
                        scrollRef.current?.scrollToEnd({ animated: true });
                    }}
                >
                    {messages.map((msg, i) => (
                        <AssistantMessageView
                            key={msg.id}
                            message={msg}
                            isLast={
                                i === messages.length - 1 && idle &&
                                (msg.kind !== "question" || !!dialogue.active || msg.slot === FREE_QUESTION_SLOT)
                            }
                            onChip={handleChip}
                            onConfirm={id => { void handleConfirm(id); }}
                            onEdit={handleEdit}
                            onCancel={handleCancel}
                            onUndo={id => { void handleUndo(id); }}
                            settings={settings}
                            onLayoutMessage={onLayoutMessage}
                        />
                    ))}
                    {typing && (
                        <AssistantTypingRow text={busy === "gemini" ? "Consultando con Gemini…" : "Analizando…"} />
                    )}
                </ScrollView>
            </View>

            {/* ACCIONES GUIADAS: se ocultan con el teclado abierto */}
            {!keyboardOpen && (
                <View style={s.quickWrap}>
                    <QuickActionsBar onAction={handleQuickAction} disabled={!idle || !hydrated} />
                </View>
            )}

            {/* SUGERENCIAS RÁPIDAS */}
            <View ref={suggestionsRef} collapsable={false} style={s.suggestionsWrap}>
                {showSuggestions && (
                    <ScrollView
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        style={s.suggestionsRow}
                        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, alignItems: "center" }}
                    >
                        {visibleReplies.map(q => (
                            <TouchableOpacity
                                key={q}
                                style={s.suggestionChip}
                                onPress={() => { void handleSend(q); }}
                                disabled={!idle}
                                accessibilityRole="button"
                                accessibilityLabel={q}
                            >
                                <Text style={s.suggestionTxt} maxFontSizeMultiplier={1.3}>{q}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                )}
            </View>

            {/* INPUT */}
            <View ref={inputBoxRef} collapsable={false} style={s.inputContainer}>
                <GlassBackground radius={0} blur={false} />
                <TextInput
                    ref={inputRef}
                    style={s.input}
                    value={input}
                    onChangeText={setInput}
                    placeholder="Escriba una consulta u orden…"
                    placeholderTextColor={C.textMuted}
                    onSubmitEditing={() => { void handleSend(); }}
                    returnKeyType="send"
                    multiline
                    maxLength={500}
                    accessibilityLabel="Mensaje para el asesor"
                />
                <TouchableOpacity
                    style={[s.sendBtn, (!input.trim() || !idle || !hydrated) && { opacity: 0.4 }]}
                    onPress={() => { void handleSend(); }}
                    disabled={!input.trim() || !idle || !hydrated}
                    accessibilityRole="button"
                    accessibilityLabel="Enviar"
                >
                    {typing
                        ? <ActivityIndicator size="small" color={C.onPrimary} />
                        : <Ionicons name="send" size={20} color={C.onPrimary} />
                    }
                </TouchableOpacity>
            </View>

            {/* EDITAR PROPUESTA */}
            {editing && editCtx && (
                <ProposalEditSheet
                    proposal={editing}
                    ctx={editCtx}
                    onSave={handleEditSave}
                    onClose={() => setEditing(null)}
                />
            )}
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1, backgroundColor: C.bg },
    headerWrap: { paddingHorizontal: 16 },
    iconBg: { width: 44, height: 44, borderRadius: 14, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    clearBtn: { width: 36, height: 36, borderRadius: 18, overflow: "hidden", alignItems: "center", justifyContent: "center" },
    banner: { marginHorizontal: 16, marginBottom: 8 },
    chatWrap: { flex: 1, minHeight: 0 },
    chatList: { flex: 1, paddingHorizontal: 16 },
    quickWrap: { flexShrink: 0, marginBottom: 8 },
    suggestionsWrap: { flexShrink: 0 },
    suggestionsRow: { flexGrow: 0, height: 48, marginBottom: 8 },
    suggestionChip: { paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.primaryDark + "33", borderRadius: 20, borderWidth: 1, borderColor: C.primary + "44" },
    suggestionTxt: { color: C.primaryLight, fontSize: 13, fontWeight: "600" },
    // INPUT — el contenedor siempre visible, el input se contrae si el nombre es largo
    inputContainer: {
        flexDirection: "row",
        alignItems: "flex-end",
        padding: 12,
        paddingBottom: 16,
        borderTopWidth: 1,
        borderTopColor: C.glassBorder,
        gap: 8,
        // Asegurar que el contenedor no desborde
        flexWrap: "nowrap",
        overflow: "hidden",
    },
    input: {
        flex: 1,
        // minWidth: 0 es clave para que el TextInput se contraiga cuando hay poco espacio
        minWidth: 0,
        backgroundColor: C.glassInput,
        borderRadius: 20,
        borderWidth: 1,
        borderColor: C.glassInputBorder,
        paddingHorizontal: 16,
        paddingVertical: 10,
        color: C.text,
        fontSize: 15,
        maxHeight: 100,
    },
    // El botón siempre tiene tamaño fijo, NUNCA sale de pantalla
    sendBtn: {
        width: 44,
        height: 44,
        flexShrink: 0,
        borderRadius: 22,
        backgroundColor: C.primary,
        alignItems: "center",
        justifyContent: "center",
    },
});
