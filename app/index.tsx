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
import BiometricGate from "../components/BiometricGate";
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
  const totalDebts = data.activeDebtsList?.length > 0
    ? data.activeDebtsList.reduce((s: number, d: any) => s + parseFloat(d.monthlyPayment || "0"), 0)
    : parseFloat(data.activeDebts || "0");

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
    activeDebts: totalDebts,
    monthlySavingsGoal: parseFloat(data.monthlySavings || "0"),
    preferredBanks: data.preferredBanks || [],
    externalSavings: parseFloat(data.externalSavings || "0"),
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

  const TABS: { id: Tab | "advisor"; icon: keyof typeof Ionicons.glyphMap; label: string; tutRef?: any; isAdvisor?: boolean }[] = [
    { id: "dashboard", icon: "home", label: "Inicio" },
    { id: "transactions", icon: "list", label: "Movimientos" },
    { id: "budget", icon: "wallet-outline", label: "Presupuesto", tutRef: tabBudgetRef },
    { id: "add", icon: "add", label: "Agregar", tutRef: tabAddRef },
    { id: "stats", icon: "bar-chart-outline", label: "Estadísticas" },
    { id: "advisor", icon: "sparkles", label: "Asesor", tutRef: tabAdvisorRef, isAdvisor: true },
    { id: "settings", icon: "settings", label: "Ajustes", tutRef: tabSettingsRef },
  ];

  return (
    <View style={[tb.bar, { paddingBottom: Math.max(insets.bottom, 12) }]}>
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
  const [autoTutorial, setAutoTutorial] = useState<string | undefined>();

  // ── Carga inicial ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    // El reset mensual debe correr ANTES de leer los datos,
    // si no la UI muestra gastos fijos/cuotas del mes anterior.
    await StorageService.checkAndRunMonthlyReset();
    const data = await StorageService.loadAllData();
    setTxs(data.transactions);
    setSettings(data.settings);
    setFixedExpenses(data.fixedExpenses);
    setCategoryBudgets(data.categoryBudgets);
    setSavingsGoals(data.savingsGoals);
    setAccounts(data.accounts);
    setCreditInstallments(data.creditInstallments);
  }, []);

  useEffect(() => {
    loadData();
    NotificationService.requestPermissions();
    NotificationService.scheduleWeeklySummary();
    TutorialService.isCompleted('tour_inicial').then(done => {
      if (!done) setTimeout(() => setAutoTutorial('tour_inicial'), 1800);
    });
  }, [loadData]);

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

  const hAdd = async (tx: Transaction) => {
    await StorageService.addTransaction(tx);
    setTxs(p => [tx, ...p]);
    try {
      await NotificationService.onTransactionAdded(
        tx, [tx, ...txs], settings, categoryBudgets, fixedExpenses
      );
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

    // Crear CreditInstallments desde las deudas declaradas en el onboarding
    if (data.activeDebtsList && data.activeDebtsList.length > 0) {
      let allInstallments = [...creditInstallments];
      for (const debt of data.activeDebtsList) {
        const monthly = parseFloat(debt.monthlyPayment || "0");
        if (monthly <= 0) continue;

        const newInstallment: CreditInstallment = {
          id: `onb_${debt.id}`,
          accountId: "",  // Sin cuenta asociada inicialmente
          name: debt.name,
          totalAmount: parseFloat(debt.totalAmount || "0") || monthly * 12,
          monthlyPayment: monthly,
          totalInstallments: parseFloat(debt.totalAmount || "0") > 0
            ? Math.ceil(parseFloat(debt.totalAmount) / monthly)
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

  // ── Renders condicionales ─────────────────────────────────
  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)} />;
  if (!settings.onboardingComplete) return <OnboardingScreen onComplete={handleOnboarding} />;

  return (
    <TutorialMenuProvider onOpen={() => { }}>
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
            <AddScreen
              onAdd={hAdd}
              settings={settings}
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
          onTutorialEnd={() => setAutoTutorial(undefined)}
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
      <BiometricGate>
        <AppContent />
      </BiometricGate>
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
    overflow: "visible",
    ...shadow(C.primaryGlow, 8, 0.25),
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
  addBubble: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.primaryLight, borderTopColor: C.accentLight, ...shadow(C.primaryGlow, 12, 0.7) },
  label: { color: C.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 0.2 },
});