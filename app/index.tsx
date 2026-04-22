import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import {
  LayoutAnimation, Platform, StyleSheet,
  Text, TouchableOpacity, UIManager, View
} from "react-native";
import {
  CategoryBudget, DEFAULT_SETTINGS, FixedExpense,
  SavingsGoal, StorageService, Transaction, UserSettings
} from "../services/storage";
import { NotificationService } from "../services/NotificationService";
import { C, shadow } from "../theme";

if (Platform.OS === "android" && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Pantallas
import AddScreen from "../components/AddScreen";
import AIAdvisor from "../components/AIAdvisor";
import BudgetScreen from "../components/BudgetScreen";
import DashboardScreen from "../components/Dashboard";
import OnboardingScreen from "../components/OnboardingScreen";
import SettingsScreen from "../components/SettingsScreen";
import SplashScreen from "../components/SplashScreen";
import StatsScreen from "../components/StatsScreen";
import TransactionsScreen from "../components/Transactions";

export type Tab = "dashboard" | "transactions" | "add" | "budget" | "settings";

const TABS: { id: Tab; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: "dashboard", icon: "home", label: "Inicio" },
  { id: "transactions", icon: "list", label: "Movimientos" },
  { id: "add", icon: "add", label: "Agregar" },
  { id: "budget", icon: "wallet-outline", label: "Presupuesto" },
  { id: "settings", icon: "settings", label: "Ajustes" },
];

// ─────────────────────────────────────────────────────────────
// ONBOARDING DATA → SETTINGS
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
// COMPONENTE PRINCIPAL
// ─────────────────────────────────────────────────────────────
export default function Index() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [showSplash, setShowSplash] = useState(true);
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<UserSettings>(DEFAULT_SETTINGS);
  const [fixedExpenses, setFixedExpenses] = useState<FixedExpense[]>([]);
  const [categoryBudgets, setCategoryBudgets] = useState<CategoryBudget[]>([]);
  const [savingsGoals, setSavingsGoals] = useState<SavingsGoal[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [showAI, setShowAI] = useState(false);

  // ── Carga inicial ─────────────────────────────────────────
  const loadData = useCallback(async () => {
    const data = await StorageService.loadAllData();
    setTxs(data.transactions);
    setSettings(data.settings);
    setFixedExpenses(data.fixedExpenses);
    setCategoryBudgets(data.categoryBudgets);
    setSavingsGoals(data.savingsGoals);
    // Reset mensual automático
    await StorageService.checkAndRunMonthlyReset();
  }, []);

  useEffect(() => {
    loadData();
    // Solicitar permisos de notificaciones
    NotificationService.requestPermissions();
    // Programar resumen semanal
    NotificationService.scheduleWeeklySummary();
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
    setTxs(p => [tx, ...p]);

    // Disparar notificación inteligente
    try {
      await NotificationService.onTransactionAdded(
        tx,
        [tx, ...txs],
        settings,
        categoryBudgets,
        fixedExpenses,
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
  };

  const switchTab = (id: Tab) => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setTab(id);
    setShowAI(false);
  };

  // ── Renders condicionales ─────────────────────────────────
  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)} />;
  if (!settings.onboardingComplete) return <OnboardingScreen onComplete={handleOnboarding} />;

  return (
    <View style={s.root}>

      {/* CONTENIDO */}
      {tab === "dashboard" && !showAI && (
        <DashboardScreen
          transactions={txs}
          settings={settings}
          fixedExpenses={fixedExpenses}
          categoryBudgets={categoryBudgets}
          savingsGoals={savingsGoals}
          onRefresh={hRefresh}
          refreshing={refreshing}
          onNavigateBudget={() => switchTab("budget")}
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
        />
      )}

      {tab === "settings" && !showAI && (
        <SettingsScreen
          settings={settings}
          onSave={hSaveSettings}
          onClearAll={hClearAll}
        />
      )}

      {/* ASESOR IA — overlay desde cualquier tab */}
      {showAI && (
        <AIAdvisor
          transactions={txs}
          settings={settings}
        />
      )}

      {/* TAB BAR */}
      <View style={s.tabBar}>
        {TABS.map(t => {
          const isActive = tab === t.id && !showAI;
          const isAdd = t.id === "add";
          return (
            <TouchableOpacity
              key={t.id}
              style={[s.tabItem, isAdd && s.tabAddItem]}
              onPress={() => switchTab(t.id)}
            >
              <View style={[isAdd && s.addBubble, isActive && !isAdd && s.tabBg]}>
                <Ionicons
                  name={t.icon}
                  size={isAdd ? 30 : 22}
                  color={isAdd ? "#1A0E00" : isActive ? C.primaryLight : C.textMuted}
                />
              </View>
              {!isAdd && (
                <Text style={[s.tabLbl, isActive && { color: C.primaryLight }]}>{t.label}</Text>
              )}
            </TouchableOpacity>
          );
        })}

        {/* BOTÓN IA FLOTANTE */}
        <TouchableOpacity
          style={[s.tabItem]}
          onPress={() => {
            LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
            setShowAI(!showAI);
          }}
        >
          <View style={[showAI && s.tabBg]}>
            <Ionicons name="sparkles" size={22} color={showAI ? C.primaryLight : C.textMuted} />
          </View>
          <Text style={[s.tabLbl, showAI && { color: C.primaryLight }]}>Asesor</Text>
        </TouchableOpacity>
      </View>

    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  tabBar: { flexDirection: "row", backgroundColor: C.card, borderTopWidth: 1.5, borderTopColor: C.primary + "55", paddingBottom: 20, paddingTop: 8, paddingHorizontal: 4, ...shadow(C.primaryGlow, 8, 0.25) },
  tabItem: { flex: 1, alignItems: "center", gap: 3 },
  tabAddItem: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: -18 },
  tabBg: { backgroundColor: C.primaryDark + "44", paddingHorizontal: 14, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.primary + "55" },
  addBubble: { width: 56, height: 56, borderRadius: 28, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.primaryLight, borderTopColor: C.accentLight, ...shadow(C.primaryGlow, 12, 0.7) },
  tabLbl: { color: C.textMuted, fontSize: 9, fontWeight: "700", letterSpacing: 0.3 },
});