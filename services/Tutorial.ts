import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { TUTORIALS, androidOnlyNotice } from './TutorialData';
import type { Tutorial } from './TutorialData';

// Los tipos y los textos viven en services/TutorialData.ts (módulo puro, probable en Node); se re-exportan aquí
// para que ningún import existente cambie.
export { TUTORIALS, androidOnlyNotice } from './TutorialData';
export type { Tutorial, TutorialStep, TutorialScreen } from './TutorialData';

// ─────────────────────────────────────────────────────────────
// STORAGE
// ─────────────────────────────────────────────────────────────
// Debe ser igual a K.COMPLETED_TUTORIALS de services/storage.ts: «Borrar todos los datos» la limpia desde allí.
const KEY = '@bm_completed_tutorials';

export const TutorialService = {
    async getCompleted(): Promise<string[]> {
        try {
            const data = await AsyncStorage.getItem(KEY);
            return data ? JSON.parse(data) : [];
        } catch { return []; }
    },

    async markCompleted(tutorialId: string): Promise<void> {
        try {
            const all = await this.getCompleted();
            if (!all.includes(tutorialId)) {
                await AsyncStorage.setItem(KEY, JSON.stringify([...all, tutorialId]));
            }
        } catch { }
    },

    async isCompleted(tutorialId: string): Promise<boolean> {
        const all = await this.getCompleted();
        return all.includes(tutorialId);
    },

    async resetAll(): Promise<void> {
        try { await AsyncStorage.removeItem(KEY); } catch { }
    },

    // Con smsEnabled === false quita lo relacionado con SMS (tutoriales y pasos marcados con
    // requiresSms) y usa los textos alternativos; por defecto devuelve TUTORIALS sin cambios.
    getTutorials(opts?: { smsEnabled?: boolean }): Tutorial[] {
        const base = Platform.OS === 'android' ? TUTORIALS : TUTORIALS.map(androidOnlyNotice);
        if (opts?.smsEnabled !== false) return base;
        return base
            .filter(t => !t.requiresSms)
            .map(t => ({
                ...t,
                steps: t.steps
                    .filter(s => !s.requiresSms)
                    .map(s => ({
                        ...s,
                        description: s.noSmsDescription ?? s.description,
                        emptyHint: s.noSmsEmptyHint ?? s.emptyHint,
                    })),
            }));
    },

    getTutorial(id: string, opts?: { smsEnabled?: boolean }): Tutorial | undefined {
        return this.getTutorials(opts).find(t => t.id === id);
    },
};