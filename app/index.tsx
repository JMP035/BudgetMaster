import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState, InteractionManager, LayoutAnimation, Platform, StatusBar,
  StyleSheet, Text, TouchableOpacity,
  UIManager, View
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Account, AppData, CategoryBudget, CreditInstallment,
  DEFAULT_SETTINGS, FixedExpense, parseAmount, SavingsGoal,
  StorageService, Transaction, UserSettings
} from "../services/storage";
import { ExchangeRateService } from "../services/ExchangeRateService";
import { NotificationService } from "../services/NotificationService";
import { isSmsFeatureOn } from "../services/features";
import { maybeAutoSync } from "../services/SmsAutoSync";
import { hasSomethingToShow } from "../services/SmsService";
import type { SyncResult } from "../services/SmsService";
import { TutorialService } from "../services/TutorialService";
import type { TutorialScreen } from "../services/TutorialService";
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
import BiometricGate from "../components/BiometricGate";
import BudgetScreen from "../components/BudgetScreen";
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
// ONBOARDING → SETTINGS
// ─────────────────────────────────────────────────────────────
// Parsea montos con separadores ambiguos (convención de Guatemala); vacío o inválido = 0
const num = (x: any): number => {
  const n = parseAmount(String(x ?? ""));
  return isNaN(n) ? 0 : n;
};

function buildSettingsFromOnboarding(data: any): UserSettings {
  const totalDebts = data.activeDebtsList?.length > 0
    ? data.activeDebtsList.reduce((s: number, d: any) => s + num(d.monthlyPayment), 0)
    : num(data.activeDebts);

  return {
    ...DEFAULT_SETTINGS,
    userName: data.name || "Usuario",
    currency: data.currency || "Q",
    monthlyIncome: num(data.monthlyIncome),
    monthlyIncomeUSD: data.currency === "USD" ? num(data.monthlyIncome) : 0,
    paymentCycle: data.paymentCycle || "monthly",
    paymentDay: parseInt(data.paymentDay || "30"),
    paymentDays: (() => {
      const parsed = (data.paymentDays || "").split(",").map((d: string) => parseInt(d.trim())).filter((n: number) => !isNaN(n));
      return parsed.length > 0 ? parsed : [15, 30];
    })(),
    budgetLimit: (num(data.monthlyIncome) || 6000) * 0.8,
    activeDebts: totalDebts,
    monthlySavingsGoal: num(data.monthlySavings),
    preferredBanks: data.preferredBanks || [],
    externalSavings: num(data.externalSavings),
    onboardingComplete: true,
    tutorialComplete: true,
    activeDebtsList: data.activeDebtsList || [],
  };
}

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
  const [refreshing, setRefreshing] = useState(false);
  const [showAI, setShowAI] = useState(false);
  const [showAccounts, setShowAccounts] = useState(false);
  // Espejo síncrono de showAccounts y marca de "Cuentas lo abrió el tutorial" (para cerrarlo al terminar)
  const showAccountsRef = useRef(false);
  showAccountsRef.current = showAccounts;
  const tutorialOpenedAccountsRef = useRef(false);
  const [autoTutorial, setAutoTutorial] = useState<string | undefined>();
  const [showTutorialMenu, setShowTutorialMenu] = useState(false);
  const contentRef = useTutorialRef('app_content');
  // Resultado de la última sincronización automática de SMS (alimenta el aviso del Dashboard)
  const [smsAuto, setSmsAuto] = useState<SyncResult | null>(null);
  const autoSyncRunningRef = useRef(false);
  const showSplashRef = useRef(true);
  showSplashRef.current = showSplash;

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

    void NotificationService.syncFixedExpenseReminders(data.fixedExpenses).catch(e => console.warn("[loadData] recordatorios:", e));

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

  useEffect(() => {
    (async () => {
      const data = await loadData();
      // El tour automático solo corre si el onboarding ya está completo
      if (data.settings.onboardingComplete) {
        TutorialService.isCompleted('tour_inicial').then(done => {
          if (!done) setTimeout(() => setAutoTutorial('tour_inicial'), 1800);
        }).catch(() => { });
      }
      const granted = await NotificationService.requestPermissions();
      if (granted) await NotificationService.runStartupNotifications(data);
    })().catch(e => console.warn("[startup] notificaciones:", e));
  }, [loadData]);

  // ── Sincronización automática de SMS ──────────────────────
  // maybeAutoSync ya valida Android, permiso, interruptores y el límite de 15 min (persistido).
  const runAutoSync = useCallback(async (s: UserSettings) => {
    if (autoSyncRunningRef.current) return;
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
  };

  const hClearAll = async () => {
    await NotificationService.cancelAll();
    await StorageService.clearAllData();
    await loadData();
    setTab("dashboard");
  };

  const handleOnboarding = async (data: any) => {
    const newSettings = buildSettingsFromOnboarding(data);
    await StorageService.saveSettings(newSettings);
    setSettings(newSettings);

    // Crear CreditInstallments desde las deudas declaradas en el onboarding
    if (data.activeDebtsList && data.activeDebtsList.length > 0) {
      let allInstallments = [...creditInstallments];
      for (const debt of data.activeDebtsList) {
        const monthly = num(debt.monthlyPayment);
        if (monthly <= 0) continue;

        const newInstallment: CreditInstallment = {
          id: `onb_${debt.id}`,
          accountId: "",  // Sin cuenta asociada inicialmente
          name: debt.name,
          totalAmount: num(debt.totalAmount) || monthly * 12,
          monthlyPayment: monthly,
          totalInstallments: num(debt.totalAmount) > 0
            ? Math.ceil(num(debt.totalAmount) / monthly)
            : 12,
          paidInstallments: 0,
          startDate: new Date().toISOString(),
          currency: data.currency || "Q",
          category: debt.type === 'credit' ? 'transfer' :
                    debt.type === 'loan' ? 'other' : 'subscriptions',
          isActive: true,
          notes: `Registrado en onboarding (${debt.type === 'credit' ? 'Tarjeta de crédito' : debt.type === 'loan' ? 'Préstamo' : debt.type === 'installment' ? 'Visacuota' : 'Otra deuda'})`,
        };
        const updated = await StorageService.addCreditInstallment(newInstallment);
        allInstallments = updated;
      }
      setCreditInstallments(allInstallments);
    }

    setTimeout(() => setAutoTutorial('tour_inicial'), 800);
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
              accounts={accounts}
              creditInstallments={creditInstallments}
              onRefresh={hRefresh}
              refreshing={refreshing}
              onNavigateBudget={() => switchTab("budget")}
              onNavigateAccounts={() => setShowAccounts(true)}
              smsAutoResult={smsAuto}
              onDismissSmsAuto={() => setSmsAuto(null)}
            />
          )}
          {tab === "transactions" && !showAI && (
            <TransactionsScreen
              transactions={txs}
              settings={settings}
              onDelete={hDelete}
              onUpdate={hUpdate}
              onReplaceAll={setTxs}
              accounts={accounts}
              onConvertToInstallment={hConvertToInstallment}
              fixedExpenses={fixedExpenses}
              onFixedExpensesChanged={setFixedExpenses}
            />
          )}
          {tab === "add" && !showAI && (
            <AddScreen
              onAdd={hAdd}
              settings={settings}
              accounts={accounts}
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
            />
          )}
          {tab === "stats" && !showAI && (
            <StatsScreen transactions={txs} settings={settings} />
          )}
          {tab === "settings" && !showAI && (
            <SettingsScreen
              settings={settings}
              onSave={hSaveSettings}
              onClearAll={hClearAll}
            />
          )}
          {showAI && (
            <AIAdvisor
              transactions={txs}
              settings={settings}
              accounts={accounts}
              fixedExpenses={fixedExpenses}
              categoryBudgets={categoryBudgets}
              savingsGoals={savingsGoals}
              creditInstallments={creditInstallments}
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
            accounts={accounts}
            setAccounts={setAccounts}
            creditInstallments={creditInstallments}
            setCreditInstallments={setCreditInstallments}
            transactions={txs}
            setTransactions={setTxs}
            settings={settings}
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
          }}
          showMenu={showTutorialMenu}
          onCloseMenu={() => setShowTutorialMenu(false)}
          currentScreen={showAccounts ? 'accounts' : showAI ? 'advisor' : tab}
          onNavigateToScreen={navigateForTutorial}
          smsEnabled={isSmsFeatureOn(settings)}
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