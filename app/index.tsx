import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  LayoutAnimation, Platform, StatusBar,
  StyleSheet, Text, TouchableOpacity,
  UIManager, View
} from "react-native";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Account, CategoryBudget, CreditInstallment,
  DEFAULT_SETTINGS, FixedExpense, SavingsGoal,
  StorageService, Transaction, UserSettings
} from "../services/storage";
import { NotificationService } from "../services/NotificationService";
import { TutorialService } from "../services/TutorialService";
import { TutorialProvider, useTutorialRef } from "../context/TutorialContext";
import { C, shadow } from "../theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Pantallas
import AccountsScreen from "../components/AccountsScreen";
import AddScreen from "../components/AddScreen";
import AIAdvisor from "../components/AIAdvisor";
import BudgetScreen from "../components/BudgetScreen";
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
function buildSettingsFromOnboarding(data: any): UserSettings {
  return {
    ...DEFAULT_SETTINGS,
    userName: data.name || "Usuario",
    currency: data.currency || "Q",
    monthlyIncome: parseFloat(data.monthlyIncome || "0"),
    monthlyIncomeUSD: data.currency === "USD" ? parseFloat(data.monthlyIncome || "0") : 0,
    paymentCycle: data.paymentCycle || "monthly",
    paymentDay: parseInt(data.paymentDay || "30"),
    paymentDays: data.paymentDays?.split(",").map((d: string) => parseInt(d.trim())) || [15, 30],
    budgetLimit: parseFloat(data.monthlyIncome || "6000") * 0.8,
    activeDebts: parseFloat(data.activeDebts || "0"),
    monthlySavingsGoal: parseFloat(data.monthlySavings || "0"),
    preferredBanks: data.preferredBanks || [],
    externalSavings: parseFloat(data.externalSavings || "0"),
    onboardingComplete: true,
    tutorialComplete: true,
  };
}

// ─────────────────────────────────────────────────────────────
// TAB BAR — con refs para tutorial
// ─────────────────────────────────────────────────────────────
interface TabBarProps {
  tab: Tab;
  showAI: boolean;
  onSwitch: (t: Tab) => void;
  onToggleAI: () => void;
}

function TabBar({ tab, showAI, onSwitch, onToggleAI }: TabBarProps) {
  const insets = useSafeAreaInsets();

  // Refs para tutorial spotlight
  const tabAddRef = useTutorialRef('tab_add');
  const tabBudgetRef = useTutorialRef('tab_budget');
  const tabAdvisorRef = useTutorialRef('tab_advisor');
  const tabSettingsRef = useTutorialRef('tab_settings');

  const TABS = [
    { id: "dashboard" as Tab, icon: "home" as const, label: "Inicio", ref: undefined },
    { id: "transactions" as Tab, icon: "list" as const, label: "Movimientos", ref: undefined },
    { id: "add" as Tab, icon: "add" as const, label: "Agregar", ref: tabAddRef },
    { id: "budget" as Tab, icon: "wallet-outline" as const, label: "Presupuesto", ref: tabBudgetRef },
    { id: "stats" as Tab, icon: "bar-chart-outline" as const, label: "Estadísticas", ref: undefined },
    { id: "settings" as Tab, icon: "settings" as const, label: "Ajustes", ref: tabSettingsRef },
  ];

  return (
    <View style={[tb.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
      {TABS.map(t => {
        const isActive = tab === t.id && !showAI;
        const isAdd = t.id === "add";
        return (
          <View
            key={t.id}
            ref={t.ref as any}
            collapsable={false}
            style={[tb.item, isAdd && tb.addItem]}
          >
            <TouchableOpacity
              style={[tb.item, isAdd && tb.addItem]}
              onPress={() => onSwitch(t.id)}
            >
              <View style={[isAdd && tb.addBubble, isActive && !isAdd && tb.tabBg]}>
                <Ionicons
                  name={t.icon}
                  size={isAdd ? 30 : 22}
                  color={isAdd ? "#1A0E00" : isActive ? C.primaryLight : C.textMuted}
                />
              </View>
              {!isAdd && (
                <Text style={[tb.label, isActive && { color: C.primaryLight }]}>{t.label}</Text>
              )}
            </TouchableOpacity>
          </View>
        );
      })}

      {/* ASESOR IA */}
      <View ref={tabAdvisorRef as any} collapsable={false} style={tb.item}>
        <TouchableOpacity
          style={tb.item}
          onPress={onToggleAI}
        >
          <View style={[showAI && tb.tabBg]}>
            <Ionicons name="sparkles" size={22} color={showAI ? C.primaryLight : C.textMuted} />
          </View>
          <Text style={[tb.label, showAI && { color: C.primaryLight }]}>Asesor</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// COMPONENTE RAÍZ — sin provider (se pone afuera)
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
  const [autoTutorial, setAutoTutorial] = useState<string | undefined>();
  const [showTutorialMenu, setShowTutorialMenu] = useState(false);

  // ── Carga inicial ────────────────────────────────────────
  const loadData = useCallback(async () => {
    const data = await StorageService.loadAllData();
    setTxs(data.transactions);
    setSettings(data.settings);
    setFixedExpenses(data.fixedExpenses);
    setCategoryBudgets(data.categoryBudgets);
    setSavingsGoals(data.savingsGoals);
    setAccounts(data.accounts);
    setCreditInstallments(data.creditInstallments);
    await StorageService.checkAndRunMonthlyReset();
  }, []);

  useEffect(() => {
    loadData();
    NotificationService.requestPermissions();
    NotificationService.scheduleWeeklySummary();
    // Tour inicial automático
    TutorialService.isCompleted('tour_inicial').then(done => {
      if (!done) setTimeout(() => setAutoTutorial('tour_inicial'), 1800);
    });
  }, [loadData]);

  // ── Handlers ─────────────────────────────────────────────
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

  const hAdd = async (tx: Transaction) => {
    await StorageService.addTransaction(tx);
    setTxs(p => [tx, ...p]);
    try {
      await NotificationService.onTransactionAdded(tx, [tx, ...txs], settings, categoryBudgets, fixedExpenses);
    } catch { }
    setTab("dashboard");
  };

  const hSaveSettings = (s: UserSettings) => setSettings(s);

  const hClearAll = async () => {
    await StorageService.clearAllData();
    await loadData();
    setTab("dashboard");
  };

  const handleOnboarding = async (data: any) => {
    const newSettings = buildSettingsFromOnboarding(data);
    await StorageService.saveSettings(newSettings);
    setSettings(newSettings);
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

  // ── Renders condicionales ────────────────────────────────
  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)} />;
  if (!settings.onboardingComplete) return <OnboardingScreen onComplete={handleOnboarding} />;

  return (
    <TutorialMenuProvider onOpen={() => setShowTutorialMenu(true)}>
      <View style={s.root}>
        <StatusBar barStyle="light-content" backgroundColor={C.bgDeep} />

        {/* CONTENIDO */}
        <View style={s.content}>
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
            />
          )}
          {tab === "transactions" && !showAI && (
            <TransactionsScreen
              transactions={txs}
              settings={settings}
              onDelete={hDelete}
              onUpdate={hUpdate}
            />
          )}
          {tab === "add" && !showAI && (
            <AddScreen onAdd={hAdd} settings={settings} />
          )}
          {tab === "budget" && !showAI && (
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
            <AIAdvisor transactions={txs} settings={settings} />
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

        {/* TUTORIAL OVERLAY */}
        <TutorialOverlay
          activeTutorialId={autoTutorial}
          onTutorialEnd={() => setAutoTutorial(undefined)}
        />
      </View>
    </TutorialMenuProvider>
  );
}

// ─────────────────────────────────────────────────────────────
// EXPORT PRINCIPAL — envuelve con TutorialProvider
// ─────────────────────────────────────────────────────────────
export default function Index() {
  return (
    <TutorialProvider>
      <AppContent />
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
  bar: {
    flexDirection: "row",
    backgroundColor: C.card,
    borderTopWidth: 1.5,
    borderTopColor: C.primary + "55",
    paddingTop: 8,
    paddingHorizontal: 4,
    ...shadow(C.primaryGlow, 8, 0.25),
  },
  item: { flex: 1, alignItems: "center", gap: 3 },
  addItem: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: -18 },
  tabBg: { backgroundColor: C.primaryDark + "44", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.primary + "55" },
  addBubble: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.primaryLight, borderTopColor: C.accentLight, ...shadow(C.primaryGlow, 12, 0.7) },
  label: { color: C.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 0.3 },
});