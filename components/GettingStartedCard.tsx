import { Ionicons } from "@expo/vector-icons";
import * as LocalAuthentication from "expo-local-authentication";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Platform, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTutorialRef } from "../context/TutorialContext";
import { cardsMissingDates } from "../services/CardSetup";
import { isSmsFeatureOn } from "../services/features";
import {
  buildChecklist, helpModulesFor, isChecklistComplete,
} from "../services/GettingStarted";
import type { ChecklistId, GettingStartedState } from "../services/GettingStarted";
import { Account, FixedExpense, StorageService, UserSettings } from "../services/storage";
import { TutorialService } from "../services/TutorialService";
import { C } from "../theme";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { useGlassDialog } from "./GlassDialogProvider";
import GradientText from "./GradientText";
import { isTutorialActive, openTutorialMenu, startTutorialById } from "./TutorialOverlay";

export type GuideSettingsSection = "biometric" | "gemini" | "sms";

interface Props {
  settings: UserSettings;
  accounts: Account[];
  fixedExpenses: FixedExpense[];
  onOpenAccounts: () => void;
  /** Abre Cuentas con la edición de esa tarjeta (para poner su día de corte y de pago). */
  onOpenCardSetup: (accountId: string) => void;
  onOpenBudget: () => void;
  /** Abre Presupuesto → Ingresos; `openForm` abre ya el formulario de una fuente nueva (cuando no hay ninguna). */
  onOpenIncome: (openForm: boolean) => void;
  onActivateSms: () => void;
  onOpenSettings: (section: GuideSettingsSection) => void;
  /** Cambia cuando algo externo pudo alterar el checklist (p. ej. terminó una sincronización de SMS). */
  refreshKey?: unknown;
}

export default function GettingStartedCard({
  settings, accounts, fixedExpenses,
  onOpenAccounts, onOpenCardSetup, onOpenBudget, onOpenIncome, onActivateSms, onOpenSettings, refreshKey,
}: Props) {
  const glass = useGlassDialog();
  const guideRef = useTutorialRef("dash_guide");

  const [gs, setGs] = useState<GettingStartedState | null>(null);
  const [completed, setCompleted] = useState<string[]>([]);
  const [smsSynced, setSmsSynced] = useState(false);
  const [incomeCounts, setIncomeCounts] = useState({ total: 0, withPattern: 0 });
  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const tutorialWasActive = useRef(false);

  const reload = useCallback(async () => {
    try {
      const [state, done, sync, sources] = await Promise.all([
        StorageService.getGettingStarted(),
        TutorialService.getCompleted(),
        StorageService.getSmsSyncState(),
        StorageService.getIncomeSources(),
      ]);
      setGs(state);
      setCompleted(done);
      setSmsSynced(!!sync.lastSyncAt);
      const active = sources.filter(x => x.isActive);
      setIncomeCounts({ total: active.length, withPattern: active.filter(x => !!x.pattern).length });
    } catch (e) {
      console.warn("[GettingStarted] carga:", e);
    }
  }, []);

  // Carga al montar y cuando cambian los datos que alimentan el checklist.
  useEffect(() => {
    void reload();
  }, [reload, refreshKey, accounts.length, fixedExpenses.length, settings.smsEnabled, settings.biometricEnabled, settings.geminiApiKey]);

  // Sensor biométrico disponible (huella o rostro registrados).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const hw = await LocalAuthentication.hasHardwareAsync();
        const enrolled = hw ? await LocalAuthentication.isEnrolledAsync() : false;
        if (!cancelled) setBiometricAvailable(hw && enrolled);
      } catch {
        if (!cancelled) setBiometricAvailable(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Cuando termina un tutorial se vuelve a leer qué tutoriales están completados.
  const visible = !!gs && !gs.dismissed;
  useEffect(() => {
    if (!visible) return;
    const id = setInterval(() => {
      const active = isTutorialActive();
      if (tutorialWasActive.current && !active) void reload();
      tutorialWasActive.current = active;
    }, 1500);
    return () => clearInterval(id);
  }, [visible, reload]);

  if (!gs || gs.dismissed) return null;

  const smsOn = isSmsFeatureOn(settings);
  const missingCards = cardsMissingDates(accounts);
  const items = buildChecklist({
    accountsCount: accounts.length,
    creditCardsCount: accounts.filter(a => a.isActive && a.type === "credit").length,
    cardsMissingDatesCount: missingCards.length,
    incomePatternCount: incomeCounts.withPattern,
    fixedCount: fixedExpenses.length,
    isAndroid: Platform.OS === "android",
    smsOn,
    smsSynced,
    biometricAvailable,
    biometricEnabled: settings.biometricEnabled,
    geminiKey: settings.geminiApiKey ?? "",
    tourDone: completed.includes("tour_inicial"),
    skipped: gs.skipped,
  });
  const shown = items.filter(i => !i.hidden && !gs.skipped.includes(i.id));
  const doneCount = shown.filter(i => i.done).length;
  const checklistComplete = isChecklistComplete(items, gs.skipped);

  const persist = async (patch: Partial<GettingStartedState>) => {
    const next = await StorageService.patchGettingStarted(patch);
    setGs(next);
  };

  const toggleCollapsed = () => { void persist({ collapsed: !gs.collapsed }); };

  const confirmDismiss = async () => {
    const ok = await glass.confirm({
      variant: "info",
      icon: "eye-off-outline",
      title: "¿Ocultar la guía?",
      message: "La podés volver a abrir en Ajustes → Academia.",
      confirmLabel: "Ocultar",
      destructive: false,
    });
    if (ok) await persist({ dismissed: true });
  };

  const skipItem = (id: ChecklistId) => {
    if (gs.skipped.includes(id)) return;
    void persist({ skipped: [...gs.skipped, id] });
  };

  const doItem = (id: ChecklistId) => {
    switch (id) {
      case "tour":
        if (!isTutorialActive()) startTutorialById("tour_inicial");
        break;
      case "accounts": onOpenAccounts(); break;
      case "card_dates":
        if (missingCards.length > 0) onOpenCardSetup(missingCards[0].id);
        else onOpenAccounts();
        break;
      case "income": onOpenIncome(incomeCounts.total === 0); break;
      case "fixed": onOpenBudget(); break;
      case "sms": onActivateSms(); break;
      case "biometric": onOpenSettings("biometric"); break;
      case "gemini": onOpenSettings("gemini"); break;
    }
  };

  const startHelp = (tutorialId: string) => {
    if (isTutorialActive()) return;
    startTutorialById(tutorialId);
  };

  const modules = helpModulesFor(smsOn);

  return (
    <View ref={guideRef} collapsable={false}>
      <GlassCard radius={20} style={s.outer} contentStyle={s.card}>
        {/* ENCABEZADO */}
        <View style={s.headerRow}>
          <TouchableOpacity
            style={s.headerMain}
            onPress={toggleCollapsed}
            activeOpacity={0.7}
            accessibilityRole="button"
            accessibilityLabel={gs.collapsed ? "Expandir guía y primeros pasos" : "Contraer guía y primeros pasos"}
          >
            <Ionicons name="compass-outline" size={20} color={C.primaryLight} />
            <View style={s.titleWrap}>
              <GradientText text="Guía y primeros pasos" style={s.title} />
              {shown.length > 0 && (
                <Text style={s.counter}>{doneCount} de {shown.length} listos</Text>
              )}
            </View>
            <Ionicons name={gs.collapsed ? "chevron-down" : "chevron-up"} size={18} color={C.textMuted} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { void confirmDismiss(); }}
            style={s.closeBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            accessibilityRole="button"
            accessibilityLabel="Ocultar guía"
          >
            <Ionicons name="close" size={18} color={C.textMuted} />
          </TouchableOpacity>
        </View>

        {!gs.collapsed && (
          <>
            {/* CHECKLIST */}
            {!checklistComplete && (
              <View style={s.list}>
                {shown.map(item => (
                  <View key={item.id} style={s.item}>
                    <View style={s.itemTop}>
                      <Ionicons
                        name={item.done ? "checkmark-circle" : "ellipse-outline"}
                        size={20}
                        color={item.done ? C.success : C.textMuted}
                      />
                      <View style={s.itemText}>
                        <Text style={[s.itemTitle, item.done && s.itemTitleDone]}>{item.title}</Text>
                        {!item.done && <Text style={s.itemHint}>{item.hint}</Text>}
                      </View>
                    </View>
                    {!item.done && (
                      <View style={s.itemActions}>
                        <GlassButton label="Hacer" kind="primary" onPress={() => doItem(item.id)} style={s.smallBtn} />
                        <GlassButton label="No me interesa" kind="ghost" onPress={() => skipItem(item.id)} style={s.smallBtn} />
                      </View>
                    )}
                  </View>
                ))}
              </View>
            )}

            {/* CENTRO DE AYUDA */}
            <Text style={s.sectionLabel}>CENTRO DE AYUDA</Text>
            <View style={s.chips}>
              {modules.map(m => {
                const done = completed.includes(m.tutorialId);
                return (
                  <TouchableOpacity
                    key={m.tutorialId}
                    style={[s.chip, done && s.chipDone]}
                    onPress={() => startHelp(m.tutorialId)}
                    activeOpacity={0.75}
                    accessibilityRole="button"
                    accessibilityLabel={`Tutorial: ${m.label}${done ? ", completado" : ""}`}
                  >
                    {done && <Ionicons name="checkmark" size={13} color={C.success} />}
                    <Text style={s.chipTxt}>{m.label}</Text>
                  </TouchableOpacity>
                );
              })}
              <TouchableOpacity
                style={[s.chip, s.chipAll]}
                onPress={() => openTutorialMenu()}
                activeOpacity={0.75}
                accessibilityRole="button"
                accessibilityLabel="Ver todos los tutoriales"
              >
                <Text style={[s.chipTxt, s.chipAllTxt]}>Ver todos</Text>
                <Ionicons name="chevron-forward" size={13} color={C.primaryLight} />
              </TouchableOpacity>
            </View>
          </>
        )}
      </GlassCard>
    </View>
  );
}

const s = StyleSheet.create({
  outer: { marginBottom: 14 },
  card: { padding: 16 },
  headerRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  headerMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  titleWrap: { flex: 1, flexShrink: 1 },
  title: { fontSize: 16, fontWeight: "900" },
  counter: { color: C.textSub, fontSize: 12, marginTop: 2 },
  closeBtn: { padding: 4 },
  list: { marginTop: 12, gap: 12 },
  item: { gap: 8 },
  itemTop: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  itemText: { flex: 1, flexShrink: 1 },
  itemTitle: { color: C.text, fontSize: 14, fontWeight: "800" },
  itemTitleDone: { color: C.textSub, fontWeight: "600" },
  itemHint: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 2 },
  itemActions: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingLeft: 30 },
  smallBtn: { minHeight: 38, paddingVertical: 6, paddingHorizontal: 14 },
  sectionLabel: {
    color: C.textMuted, fontSize: 11, fontWeight: "800", letterSpacing: 1.2,
    marginTop: 16, marginBottom: 8,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    flexDirection: "row", alignItems: "center", gap: 5,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16,
    backgroundColor: C.glassInput, borderWidth: 1, borderColor: C.glassInputBorder,
  },
  chipDone: { borderColor: C.success + "55" },
  chipTxt: { color: C.text, fontSize: 13, fontWeight: "700", flexShrink: 1 },
  chipAll: { backgroundColor: C.glassActive, borderColor: C.glassActiveBorder },
  chipAllTxt: { color: C.primaryLight },
});
