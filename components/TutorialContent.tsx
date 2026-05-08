import React, {
    createContext, useCallback, useContext,
    useRef, useState,
} from 'react';
import { Dimensions, View } from 'react-native';

const { width: SW, height: SH } = Dimensions.get('window');

// ─────────────────────────────────────────────────────────────
// TIPOS
// ─────────────────────────────────────────────────────────────
export interface SpotlightRect {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface TutorialContextValue {
    /** Registra un ref con un ID único */
    registerRef: (id: string, ref: View | null) => void;
    /** Mide la posición real en pantalla de un elemento registrado */
    measureElement: (id: string) => Promise<SpotlightRect | null>;
}

// ─────────────────────────────────────────────────────────────
// CONTEXTO
// ─────────────────────────────────────────────────────────────
const TutorialContext = createContext<TutorialContextValue>({
    registerRef: () => { },
    measureElement: async () => null,
});

export function TutorialProvider({ children }: { children: React.ReactNode }) {
    const refs = useRef<Record<string, View | null>>({});

    const registerRef = useCallback((id: string, ref: View | null) => {
        refs.current[id] = ref;
    }, []);

    const measureElement = useCallback((id: string): Promise<SpotlightRect | null> => {
        return new Promise(resolve => {
            const ref = refs.current[id];
            if (!ref) { resolve(null); return; }

            // measureInWindow da coordenadas absolutas en pantalla
            ref.measureInWindow((x, y, width, height) => {
                if (width === 0 && height === 0) {
                    resolve(null);
                    return;
                }
                resolve({
                    x: Math.max(0, x),
                    y: Math.max(0, y),
                    width: Math.min(width, SW - x),
                    height: Math.min(height, SH - y),
                });
            });
        });
    }, []);

    return (
        <TutorialContext.Provider value={{ registerRef, measureElement }}>
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