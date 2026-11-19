import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AppState, InteractionManager, LayoutAnimation, Platform, StatusBar,
  StyleSheet, Text, TouchableOpacity,
  UIManager, View
} from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { decideQuickAdd } from "../services/QuickAdd";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Account, AppData, CategoryBudget, CreditInstallment,
  DEFAULT_SETTINGS, FixedExpense, getCurrentFinancialPeriod, getDaysLeftInPeriod, IncomeSource, parseAmount,
  SavingsGoal, StorageService, Transaction, UserSettings
} from "../services/storage";
import { ExchangeRateService } from "../services/ExchangeRateService";
import { NotificationService } from "../services/NotificationService";
import { isSmsFeatureOn } from "../services/features";
import { withDerivedBalances } from "../services/Balances";
import { buildWidgetSnapshot } from "../services/WidgetSnapshot";
import { clearWidgets, refreshWidgets } from "../services/WidgetBridge";
import { maybeAutoSync } from "../services/SmsAutoSync";
import { onSettingsChanged } from "../services/SettingsEvents";
import { hasSomethingToShow } from "../services/SmsService";
import type { SyncResult } from "../services/SmsService";
import { buildOnboardingCommit } from "../services/OnboardingPlan";
import type { OnboardingResult } from "../services/OnboardingPlan";
import { TutorialService } from "../services/TutorialService";
import type { TutorialScreen } from "../services/TutorialService";
import { cardsMissingDates } from "../services/CardSetup";
import { buildRequirementFacts } from "../services/TutorialRequirements";
import type { TutorialRequirement } from "../services/TutorialRequirements";
import { TutorialProvider, useTutorialRef } from "../context/TutorialContext";
import { C, shadow } from "../theme";
import { GlassBackground } from "../components/GlassCard";
import { GlassDialogProvider } from "../components/GlassDialogProvider";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Pantallas
import AccountsScreen from "../components/AccountsScreen";
import AddScreen from "../components/AddScreen";
import AIAdvisor from "../components/AIAdvisor";
import BiometricGate, { setBiometricRuntimeEnabled } from "../components/BiometricGate";
import BudgetScreen from "../components/BudgetScreen";
import type { BudgetRequest } from "../components/BudgetScreen";
import CardsOnboardingScreen from "../components/CardsOnboardingScreen";
import DashboardScreen from "../components/Dashboard";
import OnboardingScreen from "../components/OnboardingScreen";
import SettingsScreen from "../components/SettingsScreen";
import SplashScreen from "../components/SplashScreen";
import StatsScreen from "../components/StatsScreen";
import TransactionsScreen from "../components/Transactions";
import TutorialOverlay, { TutorialMenuProvider } from "../components/TutorialOverlay";

export type Tab = "dashboard" | "transactions" | "add" | "budget" | "stats" | "settings";

// ─────────────────────────────────────────────────────────────
// TAB BAR — estable con refs para tutorial
// ─────────────────────────────────────────────────────────────
interface TabBarProps {
  tab: Tab;
  showAI: boolean;
  onSwitch: (t: Tab) => void;
  onToggleAI: () => void;
}

function TabBar({ tab, showAI, onSwitch, onToggleAI }: TabBarProps) {
  const insets = useSafeAreaInsets();

  const tabAddRef = useTutorialRef('tab_add');
  const tabBudgetRef = useTutorialRef('tab_budget');
  const tabAdvisorRef = useTutorialRef('tab_advisor');
  const tabSettingsRef = useTutorialRef('tab_settings');
  const tabStatsRef = useTutorialRef('tab_stats');

  const TABS: { id: Tab | "advisor"; icon: keyof typeof Ionicons.glyphMap; label: string; tutRef?: any; isAdvisor?: boolean }[] = [
    { id: "dashboard", icon: "home", label: "Inicio" },
    { id: "transactions", icon: "list", label: "Movimientos" },
    { id: "budget", icon: "wallet-outline", label: "Presupuesto", tutRef: tabBudgetRef },
    { id: "add", icon: "add", label: "Agregar", tutRef: tabAddRef },
    { id: "stats", icon: "bar-chart-outline", label: "Estadísticas", tutRef: tabStatsRef },
    { id: "advisor", icon: "sparkles", label: "Asesor", tutRef: tabAdvisorRef, isAdvisor: true },
    { id: "settings", icon: "settings", label: "Ajustes", tutRef: tabSettingsRef },
  ];

  return (
    <View style={[tb.wrap, { paddingBottom: Math.max(insets.bottom, 8) }]}>
      <View style={tb.bar}>
        <GlassBackground radius={28} blur={false} />
        {TABS.map(t => {
        const isAdd = t.id === "add";
        const isAdvisor = t.isAdvisor;
        const isActive = isAdvisor ? showAI : (tab === t.id && !showAI);

        return (
          <View
            key={t.id}
            ref={t.tutRef}
            collapsable={false}
            style={tb.item}
          >
            <TouchableOpacity
              style={isAdd ? tb.addButton : tb.button}
              onPress={() => isAdvisor ? onToggleAI() : onSwitch(t.id as Tab)}
              activeOpacity={0.7}
            >
              <View style={[isAdd && tb.addBubble, isActive && !isAdd && tb.tabBg]}>
                <Ionicons
                  name={t.icon}
                  size={isAdd ? 30 : 22}
                  color={isAdd ? C.onPrimary : isActive ? C.primaryLight : C.textMuted}
                />
              </View>
              {!isAdd && (
                <Text style={[tb.label, isActive && { color: C.primaryLight }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>{t.label}</Text>
              )}
            </TouchableOpacity>
          </View>
        );
        })}
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// APP CONTENT
// ─────────────────────────────────────────────────────────────
function AppContent() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [showSplash, setShowSplash] = useState(true);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [creditInstallments, setCreditInstallments] = useState<CreditInstallment[]>([]);
  // Fuentes de ingreso (Presupuesto → Ingresos): alimentan el requisito «income_source» del tutorial.
  const [incomeSources, setIncomeSources] = useState<IncomeSource[]>([]);
  // Pedido de ir a Presupuesto → Ingresos (Ajustes, «Crearlo ahora» del tutorial); BudgetScreen lo atiende y lo limpia.
  const [budgetRequest, setBudgetRequest] = useState<BudgetRequest | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  // Espejo síncrono de showAccounts y marca de "Cuentas lo abrió el tutorial" (para cerrarlo al terminar)
  const showAccountsRef = useRef(false);
  showAccountsRef.current = showAccounts;
  const tutorialOpenedAccountsRef = useRef(false);
  // «Crearlo ahora» del tutorial: Cuentas se abre con el modal de alta ya listo (cuenta bancaria o tarjeta).
  const [accountCreate, setAccountCreate] = useState<{ type: "bank" | "credit"; n: number } | null>(null);
  // Abrir Cuentas ya con la edición de una cuenta (guía del Inicio y «Crearlo ahora» de card_dates: corte y pago).
  const [accountEdit, setAccountEdit] = useState<{ id: string; n: number } | null>(null);
  const [autoTutorial, setAutoTutorial] = useState<string | undefined>();
  const [showTutorialMenu, setShowTutorialMenu] = useState(false);
  const contentRef = useTutorialRef('app_content');
  // Resultado de la última sincronización automática de SMS (alimenta el aviso del Dashboard)
  const [smsAuto, setSmsAuto] = useState<SyncResult | null>(null);
  const autoSyncRunningRef = useRef(false);
  const showSplashRef = useRef(true);
  showSplashRef.current = showSplash;
  // Sección de Ajustes a la que bajar (desde la tarjeta «Guía y primeros pasos»)
  const [settingsFocus, setSettingsFocus] = useState<"biometric" | "gemini" | "sms" | null>(null);
  // Importación guiada de SMS tras el onboarding: sube el contador y el Dashboard la ejecuta.
  const [syncRequest, setSyncRequest] = useState(0);
  // true mientras la importación guiada espera (al recorrido o a que arranque): frena la sync automática.
  const pendingImportRef = useRef(false);

  // «+ gasto» del widget de Android: budgetmaster://quick-add llega como /?open=add.
  // app/+native-intent.tsx lo reescribe a /?open=add&n=<marca>: solo actualiza los parámetros de ESTA pantalla (no apila otra).
  const { open: openParam, n: nonceParam } = useLocalSearchParams<{ open?: string; n?: string }>();
  const router = useRouter();
  // Marca del último toque ya atendido (con la app abierta puede haber varios, cada uno con su marca).
  const quickAddHandledRef = useRef<string | null>(null);
  // true cuando loadData ya leyó los ajustes (antes, onboardingComplete es solo el valor por defecto).
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  // Permiso de notificaciones: se pide UNA vez por sesión y nunca encima de la splash ni del onboarding (en Android 13+ el
  // diálogo del sistema taparía la pantalla). Quien ya completó el onboarding lo recibe al terminar la splash; quien lo
  // completa ahora, al terminar el onboarding (handleOnboarding).
  const notifAskedRef = useRef(false);
  const [notifStartup, setNotifStartup] = useState(false);

  // ── Carga inicial ─────────────────────────────────────────
  const loadData = useCallback(async (): Promise<AppData> => {
    // El reset mensual debe correr ANTES de leer los datos,
    // si no la UI muestra gastos fijos/cuotas del mes anterior.
    await StorageService.checkAndRunMonthlyReset();
    const data = await StorageService.loadAllData();
    setTxs(data.transactions);

    // Si el usuario ya tenía tarjetas de crédito antes de este cambio, se marca
    // el onboarding de tarjetas como completado automáticamente (no se le vuelve a mostrar).
    let settingsToUse = data.settings;
    if (!data.settings.cardsOnboardingComplete && data.accounts.some(a => a.type === 'credit')) {
      settingsToUse = { ...data.settings, cardsOnboardingComplete: true };
      await StorageService.saveSettings(settingsToUse);
    }
    setSettings(settingsToUse);

    setFixedExpenses(data.fixedExpenses);
    setCategoryBudgets(data.categoryBudgets);
    setSavingsGoals(data.savingsGoals);
    setAccounts(data.accounts);
    setCreditInstallments(data.creditInstallments);
    setIncomeSources(await StorageService.getIncomeSources());

    void NotificationService.syncPlanned().catch(e => console.warn("[loadData] plan de avisos:", e));

    // Sincronizar el tipo de cambio (salvo que el usuario lo haya fijado a mano).
    // Sin red, getRate devuelve offline:true y no se pisa nada.
    if (settingsToUse.exchangeRateMode !== 'manual') {
      const current = settingsToUse;
      void ExchangeRateService.getRate()
        .then(async r => {
          if (r.offline || Math.abs(r.rate - current.exchangeRate) < 1e-5) return;
          const fresh = await StorageService.getSettings();
          if (fresh.exchangeRateMode === 'manual') return;
          const upd: UserSettings = {
            ...fresh,
            exchangeRate: r.rate,
            exchangeRateSource: r.source,
            exchangeRateUpdatedAt: new Date(r.timestamp).toISOString(),
          };
          await StorageService.saveSettings(upd);
          setSettings(upd);
        })
        .catch(e => console.warn("[loadData] tipo de cambio:", e));
    }

    return { ...data, settings: settingsToUse };
  }, []);

  // Avisos de arranque (plan programado, avisos de configuración) con los datos del momento. Sin permiso no hacen nada.
  const runNotificationStartup = useCallback(async () => {
    const data = await StorageService.loadAllData();
    await NotificationService.runStartupNotifications(data);
  }, []);

  // Pide el permiso de notificaciones y, apenas se concede, corre los avisos de arranque (en la primera sesión no corrían).
  const askNotifications = useCallback(async () => {
    if (notifAskedRef.current) return;
    notifAskedRef.current = true;
    try {
      const granted = await NotificationService.requestPermissions();
      if (granted) await runNotificationStartup();
    } catch (e) {
      console.warn("[notificaciones] permiso y arranque:", e);
    }
  }, [runNotificationStartup]);

  // Refresca el estado de settings cuando storage guarda desde un sheet suelto (p. ej. «+ Nueva categoría»).
  useEffect(() => onSettingsChanged(setSettings), []);

  useEffect(() => {
    (async () => {
      const data = await loadData();
      setSettingsLoaded(true);
      // El tour automático solo corre si el onboarding ya está completo
      if (data.settings.onboardingComplete) {
        // Quien eligió «Más tarde» en el cierre del onboarding no recibe el recorrido solo.
        Promise.all([
          TutorialService.isCompleted('tour_inicial'),
          StorageService.getGettingStarted(),
        ]).then(([done, guide]) => {
          if (!done && !guide?.tourDeferred) setTimeout(() => setAutoTutorial('tour_inicial'), 1800);
        }).catch(() => { });
      }
      // El permiso de notificaciones se pide después (ver abajo), no al montar.
      setNotifStartup(!!data.settings.onboardingComplete);
    })().catch(e => console.warn("[startup] carga inicial:", e));
  }, [loadData]);

  // Quien ya completó el onboarding: el permiso se pide al terminar la splash (no encima de ella).
  useEffect(() => {
    if (showSplash || !notifStartup) return;
    const timer = setTimeout(() => { void askNotifications(); }, 600);
    return () => clearTimeout(timer);
  }, [showSplash, notifStartup, askNotifications]);

  // ── Sincronización automática de SMS ──────────────────────
  // maybeAutoSync ya valida Android, permiso, interruptores y el límite de 15 min (persistido).
  const runAutoSync = useCallback(async (s: UserSettings) => {
    if (autoSyncRunningRef.current || pendingImportRef.current) return;
    autoSyncRunningRef.current = true;
    try {
      const r = await maybeAutoSync(s);
      if (!r) return;
      if (r.transactions.length || r.installments.length || r.fixedAutoMarked.length) await loadData();
      if (hasSomethingToShow(r)) setSmsAuto(r);
    } catch (e) {
      console.warn("[autoSync]", e);
    } finally {
      autoSyncRunningRef.current = false;
    }
  }, [loadData]);

  // Al arrancar: una vez que terminó la splash, sin bloquear la interfaz.
  useEffect(() => {
    if (showSplash) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const task = InteractionManager.runAfterInteractions(() => {
      timer = setTimeout(() => {
        if (cancelled) return;
        StorageService.getSettings()
          .then(st => (st.onboardingComplete ? runAutoSync(st) : undefined))
          .catch(e => console.warn("[autoSync] arranque:", e));
      }, 1500);
    });
    return () => {
      cancelled = true;
      task.cancel();
      if (timer) clearTimeout(timer);
    };
  }, [showSplash, runAutoSync]);

  // Al volver a primer plano (el límite de 15 min evita repeticiones).
  useEffect(() => {
    const sub = AppState.addEventListener("change", state => {
      if (state !== "active" || showSplashRef.current) return;
      StorageService.getSettings()
        .then(st => runAutoSync(st))
        .catch(e => console.warn("[autoSync] primer plano:", e));
    });
    return () => sub.remove();
  }, [runAutoSync]);

  // «+ gasto» del widget: abre la pestaña Agregar una vez por toque (cada toque trae su marca `n`), ya pasada la splash, la
  // carga de ajustes y la biometría (los hijos de BiometricGate solo se montan después de desbloquear: el bloqueo nunca
  // se salta). Si el onboarding no terminó, el pedido se DESCARTA (no se salta a Agregar cuando arranca el recorrido).
  // Tras atenderlo se limpian los parámetros: así la ruta queda en «/» y el siguiente toque es un pedido nuevo.
  useEffect(() => {
    const d = decideQuickAdd({
      open: openParam,
      nonce: nonceParam,
      handled: quickAddHandledRef.current,
      splashDone: !showSplash,
      settingsLoaded,
      onboardingDone: settings.onboardingComplete && settings.cardsOnboardingComplete,
    });
    if (d.action === "none" || d.action === "wait") return;
    quickAddHandledRef.current = d.key;
    if (d.action === "open") {
      setShowAccounts(false);
      setShowAI(false);
      setTab("add");
    }
    try {
      router.setParams({ open: undefined, n: undefined });
    } catch (e) {
      console.warn("[quick-add] limpiar parámetros:", e);
    }
  }, [openParam, nonceParam, showSplash, settingsLoaded, settings.onboardingComplete, settings.cardsOnboardingComplete, router]);

  // ── Widget de Android: la foto de cifras se rehace 1 s después del último cambio de datos ──
  useEffect(() => {
    if (Platform.OS !== "android" || showSplash || !settings.onboardingComplete) return;
    const timer = setTimeout(() => {
      try {
        const now = new Date();
        const snapshot = buildWidgetSnapshot({
          settings, transactions: txs, fixedExpenses, accounts, creditInstallments, incomeSources,
          daysLeft: getDaysLeftInPeriod(settings, now),
          periodAt: d => {
            const fp = getCurrentFinancialPeriod(settings, d);
            return { start: fp.start, end: fp.end, nextStart: fp.nextStart };
          },
        }, now);
        void refreshWidgets(snapshot);
      } catch (e) {
        console.warn("[widget] foto de cifras:", e);
      }
    }, 1000);
    return () => clearTimeout(timer);
  }, [showSplash, txs, settings, accounts, fixedExpenses, creditInstallments, incomeSources]);

  // ── Handlers ──────────────────────────────────────────────
  const hRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const hDelete = async (id: string) => {
    const updated = await StorageService.deleteTransaction(id);
    setTxs(updated);
  };

  const hUpdate = async (tx: Transaction) => {
    const updated = await StorageService.updateTransaction(tx);
    setTxs(updated);
  };

  const hConvertToInstallment = async (item: CreditInstallment, originalTxId: string) => {
    const { installments, accounts: accs } = await StorageService.addInstallmentAndAdjustBalance(item);
    setCreditInstallments(installments);
    setAccounts(accs);
    const updatedTxs = await StorageService.deleteTransaction(originalTxId);
    setTxs(updatedTxs);
    // La compra completa se reemplaza por sus cuotas: los cortes ya cumplidos cargan su cuota de una vez.
    const synced = await StorageService.syncInstallmentCharges();
    if (synced.changed) {
      setTxs(await StorageService.getTransactions());
      setCreditInstallments(await StorageService.getCreditInstallments());
    }
  };

  const hAdd = async (tx: Transaction) => {
    await StorageService.addTransaction(tx);
    setTxs(p => [tx, ...p]);
    void NotificationService.onTransactionAdded(
      tx, [tx, ...txs], settings, categoryBudgets, fixedExpenses
    ).catch(e => console.warn("[hAdd] Notificación falló:", e));
    setTab("dashboard");
  };

  const hSaveSettings = (s: UserSettings) => setSettings(s);

  const hCardsOnboardingComplete = async () => {
    const updated = { ...settings, cardsOnboardingComplete: true };
    await StorageService.saveSettings(updated);
    setSettings(updated);
    // Los avisos de arranque esperan a este onboarding (runStartupNotifications lo exige): ahora ya pueden correr.
    void runNotificationStartup().catch(e => console.warn("[notificaciones] arranque tras tarjetas:", e));
  };

  // «Ya no la tengo»: borra la deuda declarada en el onboarding viejo (legado; no se migra a cuotas).
  const clearLegacyDebt = async () => {
    const updated = { ...settings, activeDebts: 0, activeDebtsUSD: 0 };
    await StorageService.saveSettings(updated);
    setSettings(updated);
  };

  const hClearAll = async () => {
    await NotificationService.cancelAll();
    await StorageService.clearAllData();
    // Vuelve el onboarding: al terminarlo se pide el permiso de nuevo (si ya estaba concedido no sale ningún diálogo).
    notifAskedRef.current = false;
    setNotifStartup(false);
    // La foto del widget se borró con los datos: se repinta ya (estado vacío «Abre BudgetMaster…»), sin esperar a los ~30 min.
    void clearWidgets();
    await loadData();
    setTab("dashboard");
  };

  // Recibe el borrador del onboarding, lo guarda de forma idempotente (upsert por id) y arranca
  // el recorrido y/o la importación guiada de SMS según lo que pidió el usuario.
  const handleOnboarding = async (r: OnboardingResult) => {
    const base = await StorageService.getSettings();
    const cachedRate = await ExchangeRateService.getCachedRate().catch(() => null);
    const commit = buildOnboardingCommit(r.draft, base, {
      isAndroid: Platform.OS === "android",
      exchangeRate: cachedRate?.rate ?? base.exchangeRate,
      parse: parseAmount,
      nowIso: new Date().toISOString(),
    });
    await StorageService.commitOnboarding(commit);
    setBiometricRuntimeEnabled(commit.settings.biometricEnabled);
    await StorageService.saveGettingStarted({
      v: 1,
      dismissed: false,
      collapsed: false,
      skipped: [],
      tourDeferred: !r.tourRequested,
      createdAt: new Date().toISOString(),
    });
    await loadData();
    // Onboarding terminado: AHORA se pide el permiso de notificaciones (antes del recorrido, para que el diálogo no se le cruce).
    await askNotifications();

    const importAfter = Platform.OS === "android" && commit.settings.smsEnabled
      && r.draft.sms.importAfter && r.draft.sms.granted;
    if (importAfter) pendingImportRef.current = true;

    if (r.tourRequested) {
      // La importación espera a que termine el recorrido (onTutorialEnd)
      setTimeout(() => setAutoTutorial("tour_inicial"), 800);
    } else if (importAfter) {
      pendingImportRef.current = false;
      setSyncRequest(n => n + 1);
    }
  };

  const switchTab = (id: Tab) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTab(id);
    setShowAI(false);
  };

  const toggleAI = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setShowAI(v => !v);
  };

  // Navegación automática del tutorial: sin LayoutAnimation, para que la
  // medición del spotlight no capture una animación a medias.
  const navigateForTutorial = useCallback((screen: TutorialScreen) => {
    if (screen === 'accounts') {
      // Si Cuentas no estaba abierto, lo abre el tutorial y lo cierra al terminar
      if (!showAccountsRef.current) tutorialOpenedAccountsRef.current = true;
      showAccountsRef.current = true;
      setShowAccounts(true);
      return;
    }
    tutorialOpenedAccountsRef.current = false;
    setShowAccounts(false);
    if (screen === 'advisor') {
      setShowAI(true);
      return;
    }
    setTab(screen);
    setShowAI(false);
  }, []);

  // Cuentas tal como se muestran: las de saldo automático traen el saldo derivado de los movimientos (nunca se guarda).
  const accountsView = useMemo(() => withDerivedBalances(accounts, txs), [accounts, txs]);

  // Requisitos de los pasos del tutorial: qué existe ya en los datos del usuario.
  const smsOnNow = isSmsFeatureOn(settings);
  const requirementFacts = useMemo(() => buildRequirementFacts({
    accounts,
    incomeSources,
    smsOn: smsOnNow,
  }), [accounts, incomeSources, smsOnNow]);

  // «Crearlo ahora»: lleva al usuario a donde se crea lo que falta (el tutorial ya se cerró).
  const handleFulfillRequirement = useCallback((req: TutorialRequirement) => {
    tutorialOpenedAccountsRef.current = false;
    switch (req) {
      case "bank_account":
      case "any_account":
      case "credit_card":
        setAccountCreate({ type: req === "credit_card" ? "credit" : "bank", n: Date.now() });
        setShowAI(false);
        setShowAccounts(true);
        break;
      case "card_dates": {
        // Con una tarjeta sin días se abre su edición; sin tarjetas, el alta de una tarjeta.
        const missing = cardsMissingDates(accounts);
        if (missing.length > 0) setAccountEdit({ id: missing[0].id, n: Date.now() });
        else setAccountCreate({ type: "credit", n: Date.now() });
        setShowAI(false);
        setShowAccounts(true);
        break;
      }
      case "income_source":
        // Presupuesto → Ingresos con el formulario de la fuente ya abierto (una sola ventana a la vez).
        setShowAccounts(false);
        setShowAI(false);
        setBudgetRequest({ tab: 3, openIncome: true, n: Date.now() });
        setTab("budget");
        break;
      case "sms_on":
        setShowAccounts(false);
        setShowAI(false);
        setSettingsFocus("sms");
        setTab("settings");
        break;
    }
  }, [accounts]);

  // ── Renders condicionales ─────────────────────────────────
  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)} />;
  if (!settings.onboardingComplete) return <OnboardingScreen onComplete={handleOnboarding} />;
  if (!settings.cardsOnboardingComplete) return <CardsOnboardingScreen settings={settings} onComplete={hCardsOnboardingComplete} />;

  return (
    <TutorialMenuProvider onOpen={() => setShowTutorialMenu(true)}>
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={C.bgDeep} />

        {/* CONTENIDO */}
        <View ref={contentRef} collapsable={false} style={s.content}>
          {tab === "dashboard" && !showAI && (
            <DashboardScreen
              transactions={txs}
              settings={settings}
              fixedExpenses={fixedExpenses}
              categoryBudgets={categoryBudgets}
              savingsGoals={savingsGoals}
              accounts={accountsView}
              creditInstallments={creditInstallments}
              onRefresh={hRefresh}
              refreshing={refreshing}
              onNavigateBudget={() => switchTab("budget")}
              onNavigateIncome={openForm => {
                // Presupuesto → Ingresos (con el formulario abierto si todavía no hay ninguna fuente)
                setBudgetRequest({ tab: 3, ...(openForm ? { openIncome: true } : {}), n: Date.now() });
                switchTab("budget");
              }}
              onNavigateAccounts={opts => {
                if (opts?.editAccountId) setAccountEdit({ id: opts.editAccountId, n: Date.now() });
                setShowAccounts(true);
              }}
              smsAutoResult={smsAuto}
              onDismissSmsAuto={() => setSmsAuto(null)}
              syncRequest={syncRequest}
              onNavigateSettings={section => { setSettingsFocus(section); switchTab("settings"); }}
            />
          )}
          {tab === "transactions" && !showAI && (
            <TransactionsScreen
              transactions={txs}
              settings={settings}
              onDelete={hDelete}
              onUpdate={hUpdate}
              onReplaceAll={setTxs}
              accounts={accountsView}
              onConvertToInstallment={hConvertToInstallment}
              fixedExpenses={fixedExpenses}
              onFixedExpensesChanged={setFixedExpenses}
            />
          )}
          {tab === "add" && !showAI && (
            <AddScreen
              onAdd={hAdd}
              settings={settings}
              accounts={accountsView}
            />
          )}
          {tab === "budget" && !showAI && (
            // FIX C: onRefresh pasado correctamente a BudgetScreen
            <BudgetScreen
              transactions={txs}
              setTransactions={setTxs}
              settings={settings}
              fixedExpenses={fixedExpenses}
              setFixedExpenses={setFixedExpenses}
              categoryBudgets={categoryBudgets}
              setCategoryBudgets={setCategoryBudgets}
              savingsGoals={savingsGoals}
              setSavingsGoals={setSavingsGoals}
              onRefresh={hRefresh}
              request={budgetRequest}
              onRequestHandled={() => setBudgetRequest(null)}
              onIncomeSourcesChanged={setIncomeSources}
            />
          )}
          {tab === "stats" && !showAI && (
            <StatsScreen
              transactions={txs}
              settings={settings}
              creditInstallments={creditInstallments}
              incomeSources={incomeSources}
              onClearLegacyDebt={clearLegacyDebt}
            />
          )}
          {tab === "settings" && !showAI && (
            <SettingsScreen
              settings={settings}
              onSave={hSaveSettings}
              onClearAll={hClearAll}
              focusSection={settingsFocus}
              onFocusHandled={() => setSettingsFocus(null)}
              onOpenGuide={() => switchTab("dashboard")}
              onOpenIncomeSources={() => {
                setBudgetRequest({ tab: 3, n: Date.now() });
                switchTab("budget");
              }}
              onDataChanged={() => { void loadData(); }}
            />
          )}
          {showAI && (
            <AIAdvisor
              transactions={txs}
              settings={settings}
              accounts={accountsView}
              fixedExpenses={fixedExpenses}
              categoryBudgets={categoryBudgets}
              savingsGoals={savingsGoals}
              creditInstallments={creditInstallments}
              incomeSources={incomeSources}
              onTransactionsChanged={setTxs}
              onFixedExpensesChanged={setFixedExpenses}
              onCategoryBudgetsChanged={setCategoryBudgets}
              onSavingsGoalsChanged={setSavingsGoals}
            />
          )}
        </View>

        {/* TAB BAR */}
        <TabBar
          tab={tab}
          showAI={showAI}
          onSwitch={switchTab}
          onToggleAI={toggleAI}
        />

        {/* CUENTAS */}
        {showAccounts && (
          <AccountsScreen
            accounts={accountsView}
            setAccounts={setAccounts}
            creditInstallments={creditInstallments}
            setCreditInstallments={setCreditInstallments}
            transactions={txs}
            setTransactions={setTxs}
            settings={settings}
            autoCreate={accountCreate}
            onAutoCreateHandled={() => setAccountCreate(null)}
            autoEdit={accountEdit}
            onAutoEditHandled={() => setAccountEdit(null)}
            onClose={() => { setShowAccounts(false); loadData(); }}
          />
        )}

        {/* TUTORIAL */}
        <TutorialOverlay
          activeTutorialId={autoTutorial}
          onTutorialEnd={() => {
            setAutoTutorial(undefined);
            if (tutorialOpenedAccountsRef.current) {
              tutorialOpenedAccountsRef.current = false;
              setShowAccounts(false);
              void loadData();
            }
            // Importación guiada de SMS: arranca cuando termina el recorrido del onboarding
            if (pendingImportRef.current) {
              pendingImportRef.current = false;
              setSyncRequest(n => n + 1);
            }
          }}
          showMenu={showTutorialMenu}
          onCloseMenu={() => setShowTutorialMenu(false)}
          currentScreen={showAccounts ? 'accounts' : showAI ? 'advisor' : tab}
          onNavigateToScreen={navigateForTutorial}
          smsEnabled={isSmsFeatureOn(settings)}
          requirementFacts={requirementFacts}
          onFulfillRequirement={handleFulfillRequirement}
        />
      </View>
    </TutorialMenuProvider>
  );
}

// ─────────────────────────────────────────────────────────────
// EXPORT PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function Index() {
  return (
    <TutorialProvider>
      <GlassDialogProvider>
        <BiometricGate>
          <AppContent />
        </BiometricGate>
      </GlassDialogProvider>
    </TutorialProvider>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bgDeep },
  content: { flex: 1 },
});

const tb = StyleSheet.create({
  wrap: {
    paddingHorizontal: 10,
    paddingTop: 6,
    backgroundColor: C.bgDeep,
  },
  bar: {
    flexDirection: "row",
    borderRadius: 28,
    paddingTop: 8,
    paddingBottom: 8,
    paddingHorizontal: 4,
    overflow: "visible",
  },
  item: { 
    flex: 1, 
    alignItems: "center", 
    justifyContent: "flex-end" 
  },
  button: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 4,
    width: "100%",
    gap: 3,
  },
  addButton: {
    alignItems: "center",
    justifyContent: "center",
    bottom: 14,
    zIndex: 10,
  },
  tabBg: { backgroundColor: C.primaryDark + "44", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.primary + "55" },
  addBubble: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.primaryLight, borderTopColor: C.primaryGlow, borderBottomColor: C.primaryDark, ...shadow(C.primaryGlow, 12, 0.7) },
  label: { color: C.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 0.2 },
});