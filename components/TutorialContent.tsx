import React, {
    createContext, useCallback, useContext, useEffect,
    useMemo, useRef,
} from 'react';
import { FlatList, NativeScrollEvent, NativeSyntheticEvent, ScrollView, View } from 'react-native';

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
export interface SpotlightRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

type Scrollable = ScrollView | FlatList<any>;
interface ScrollEntry { node: Scrollable; offset: number }
type ActionFn = (arg?: string | number) => void;

interface TutorialContextValue {
    /** Registra un ref con un ID único */
    registerRef: (id: string, ref: View | null) => void;
    /** Mide la posición real en pantalla de un elemento registrado */
    measureElement: (id: string) => Promise<SpotlightRect | null>;
    /** Registra (o desregistra con null) un ScrollView/FlatList bajo una clave */
    registerScroll: (key: string, node: Scrollable | null) => void;
    /** Actualiza el offset vertical conocido de un scroll registrado */
    setScrollOffset: (key: string, y: number) => void;
    /** Hace scroll (si hace falta) para que el elemento quede visible. false si no se pudo. */
    ensureVisible: (key: string, elementId: string, topMargin?: number) => Promise<boolean>;
    /** Registra (o desregistra con null) una acción invocable desde un paso del tutorial */
    registerAction: (id: string, fn: ActionFn | null) => void;
    /** Ejecuta una acción registrada. false si no existe o lanzó un error. */
    runAction: (id: string, arg?: string | number) => boolean;
}

// ─────────────────────────────────────────────────────────────
// CONTEXTO
// ─────────────────────────────────────────────────────────────
const TutorialContext = createContext<TutorialContextValue>({
    registerRef: () => { },
    measureElement: async () => null,
    registerScroll: () => { },
    setScrollOffset: () => { },
    ensureVisible: async () => false,
    registerAction: () => { },
    runAction: () => false,
});

const SCROLL_SETTLE_MS = 380;
const EDGE_MARGIN = 12;
const MIN_CARD_SPACE = 260;
const DEFAULT_TOP_MARGIN = 96;

const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

/** Mide un nodo nativo en coordenadas de ventana. null si no se puede o no tiene tamaño. */
function measureNodeInWindow(node: any): Promise<SpotlightRect | null> {
    return new Promise(resolve => {
        if (!node || typeof node.measureInWindow !== 'function') { resolve(null); return; }
        try {
            node.measureInWindow((x: number, y: number, width: number, height: number) => {
                if (width === 0 && height === 0) { resolve(null); return; }
                resolve({ x, y, width, height });
            });
        } catch {
            resolve(null);
        }
    });
}

export function TutorialProvider({ children }: { children: React.ReactNode }) {
    const refs = useRef<Record<string, View | null>>({});
    const scrolls = useRef<Record<string, ScrollEntry>>({});
    const actions = useRef<Record<string, ActionFn>>({});

    const registerRef = useCallback((id: string, ref: View | null) => {
        refs.current[id] = ref;
    }, []);

    const measureElement = useCallback((id: string): Promise<SpotlightRect | null> => {
        return measureNodeInWindow(refs.current[id]);
    }, []);

    const registerScroll = useCallback((key: string, node: Scrollable | null) => {
        if (!node) {
            delete scrolls.current[key];
            return;
        }
        const prev = scrolls.current[key];
        scrolls.current[key] = { node, offset: prev && prev.node === node ? prev.offset : 0 };
    }, []);

    const setScrollOffset = useCallback((key: string, y: number) => {
        const entry = scrolls.current[key];
        if (entry) entry.offset = y;
    }, []);

    const ensureVisible = useCallback(async (key: string, elementId: string, topMargin?: number): Promise<boolean> => {
        try {
            const entry = scrolls.current[key];
            const elNode = refs.current[elementId];
            if (!entry || !elNode) return false;

            // Para FlatList, el contenedor medible es su ScrollView nativo si existe.
            const anyNode = entry.node as any;
            const contNode = typeof anyNode.getNativeScrollRef === 'function'
                ? (anyNode.getNativeScrollRef() ?? anyNode)
                : anyNode;

            const [el, cont] = await Promise.all([
                measureNodeInWindow(elNode),
                measureNodeInWindow(contNode),
            ]);
            if (!el || !cont) return false;

            const elTop = el.y;
            const elBottom = el.y + el.height;
            const contTop = cont.y;
            const contBottom = cont.y + cont.height;

            const fullyInside = elTop >= contTop + EDGE_MARGIN && elBottom <= contBottom - EDGE_MARGIN;
            const roomForCard = (elTop - contTop) > MIN_CARD_SPACE || (contBottom - elBottom) > MIN_CARD_SPACE;
            if (fullyInside && roomForCard) return true;

            const target = Math.max(0, entry.offset + (elTop - contTop) - (topMargin ?? DEFAULT_TOP_MARGIN));
            if ('scrollToOffset' in anyNode && typeof anyNode.scrollToOffset === 'function') {
                anyNode.scrollToOffset({ offset: target, animated: true });
            } else {
                anyNode.scrollTo({ y: target, animated: true });
            }
            entry.offset = target;
            await sleep(SCROLL_SETTLE_MS);
            return true;
        } catch {
            return false;
        }
    }, []);

    const registerAction = useCallback((id: string, fn: ActionFn | null) => {
        if (fn) actions.current[id] = fn;
        else delete actions.current[id];
    }, []);

    const runAction = useCallback((id: string, arg?: string | number): boolean => {
        const fn = actions.current[id];
        if (!fn) return false;
        try {
            fn(arg);
            return true;
        } catch {
            return false;
        }
    }, []);

    const value = useMemo<TutorialContextValue>(() => ({
        registerRef, measureElement, registerScroll, setScrollOffset,
        ensureVisible, registerAction, runAction,
    }), [registerRef, measureElement, registerScroll, setScrollOffset, ensureVisible, registerAction, runAction]);

    return (
        <TutorialContext.Provider value={value}>
            {children}
        </TutorialContext.Provider>
    );
}

export function useTutorial() {
    return useContext(TutorialContext);
}

// ─────────────────────────────────────────────────────────────
// HOOK PARA REGISTRAR UN ELEMENTO
// ─────────────────────────────────────────────────────────────
/**
 * Uso:
 *   const ref = useTutorialRef('sync_btn');
 *   <View ref={ref}>...</View>
 */
export function useTutorialRef(id: string) {
    const { registerRef } = useTutorial();
    const ref = useCallback((node: View | null) => {
        registerRef(id, node);
    }, [id, registerRef]);
    return ref;
}

// ─────────────────────────────────────────────────────────────
// HOOK PARA REGISTRAR UN SCROLLVIEW / FLATLIST
// ─────────────────────────────────────────────────────────────
/**
 * Uso:
 *   const tutScroll = useTutorialScroll('stats');
 *   <ScrollView {...tutScroll}>...</ScrollView>
 *
 * Si la pantalla ya tiene su propio ref al ScrollView, pasalo como segundo
 * argumento y el hook también le asigna el nodo.
 */
export function useTutorialScroll(key: string, externalRef?: React.MutableRefObject<any>) {
    const { registerScroll, setScrollOffset } = useTutorial();

    const ref = useCallback((node: Scrollable | null) => {
        registerScroll(key, node);
        if (externalRef) externalRef.current = node;
    }, [key, registerScroll, externalRef]);

    const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
        setScrollOffset(key, e.nativeEvent.contentOffset.y);
    }, [key, setScrollOffset]);

    // Desregistrar al desmontar (o si cambia la clave)
    useEffect(() => {
        return () => registerScroll(key, null);
    }, [key, registerScroll]);

    return { ref, onScroll, scrollEventThrottle: 16 as const };
}

// ─────────────────────────────────────────────────────────────
// HOOK PARA REGISTRAR UNA ACCIÓN DE TUTORIAL
// ─────────────────────────────────────────────────────────────
/**
 * Uso (cambiar de pestaña interna desde un paso):
 *   useTutorialAction('budget:setTab', arg => setActiveTab(Number(arg)));
 */
export function useTutorialAction(id: string, fn: (arg?: string | number) => void) {
    const { registerAction } = useTutorial();
    const fnRef = useRef(fn);
    fnRef.current = fn;

    useEffect(() => {
        registerAction(id, (arg?: string | number) => fnRef.current(arg));
        return () => registerAction(id, null);
    }, [id, registerAction]);
}
