import { Ionicons } from "@expo/vector-icons";
import React, { useCallback, useEffect, useState } from "react";
import { LayoutAnimation, Platform, StyleSheet, Text, TouchableOpacity, UIManager, View } from "react-native";
import { StorageService, Transaction, UserSettings } from "../services/storage";
import { C, shadow } from "./theme";

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

// Pantallas
import AddScreen from "./screens/AddScreen";
import AIAdvisor from "./screens/AIAdvisor";
import DashboardScreen from "./screens/Dashboard";
import OnboardingScreen from "./screens/OnboardingScreen";
import SettingsScreen from "./screens/SettingsScreen";
import SplashScreen from "./screens/SplashScreen";
import StatsScreen from "./screens/StatsScreen";
import TransactionsScreen from "./screens/Transactions";
export type Tab = "dashboard" | "transactions" | "add" | "stats" | "ai" | "settings";

const TABS: { id: Tab; icon: keyof typeof Ionicons.glyphMap; label: string }[] = [
  { id: "dashboard", icon: "home", label: "Inicio" },
  { id: "transactions", icon: "list", label: "Movimientos" },
  { id: "add", icon: "add", label: "Agregar" },
  { id: "stats", icon: "bar-chart", label: "Estadísticas" },
  { id: "settings", icon: "settings", label: "Ajustes" },
];

export default function Index() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [txs, setTxs] = useState<Transaction[]>([]);
  const [settings, setSettings] = useState<UserSettings>({
    userName: "Usuario", userTitle: "BudgetMaster Pro", budgetLimit: 6000,
    currency: "Q", smsEnabled: true, externalSavings: 0, onboardingComplete: false, tutorialComplete: false
  });

  const [refreshing, setRefreshing] = useState(false);
  const [showSplash, setShowSplash] = useState(true);

  const loadData = useCallback(async () => {
    const data = await StorageService.loadAllData();
    setTxs(data.transactions);
    setSettings(data.settings);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const hRefresh = async () => { setRefreshing(true); await loadData(); setRefreshing(false); }
  const hDelete = async (id: string) => { setTxs(await StorageService.deleteTransaction(id)); }
  const hAdd = (tx: Transaction) => { setTxs(p => [tx, ...p]); setTab("dashboard"); }
  const hSaveSet = (s: UserSettings) => setSettings(s);
  const hClear = async () => { await StorageService.clearAllData(); await loadData(); setTab("dashboard"); }

  const handleOnboarding = async (name: string, externalSavings: number) => {
    const updated = { ...settings, userName: name, externalSavings, onboardingComplete: true, tutorialComplete: true };
    await StorageService.saveSettings(updated);
    setSettings(updated);
  };

  if (showSplash) return <SplashScreen onDone={() => setShowSplash(false)} />;
  if (!settings.onboardingComplete) return <OnboardingScreen onComplete={handleOnboarding} />;

  // Todo el mundo tiene acceso a la IA ahora
  const tabsToMap = [
    TABS[0], TABS[1], TABS[2], TABS[3],
    { id: "ai", icon: "sparkles", label: "Asesor IA" },
    TABS[4]
  ];

  return (
    <View style={s.root}>
      {tab === "dashboard" && <DashboardScreen transactions={txs} settings={settings} onRefresh={hRefresh} refreshing={refreshing} />}
      {tab === "transactions" && <TransactionsScreen transactions={txs} settings={settings} onDelete={hDelete} />}
      {tab === "add" && <AddScreen onAdd={hAdd} defaultCurrency={settings.currency} />}
      {tab === "stats" && <StatsScreen transactions={txs} settings={settings} />}
      {tab === "ai" && <AIAdvisor transactions={txs} settings={settings} />}
      {tab === "settings" && <SettingsScreen settings={settings} onSave={hSaveSet} onClearAll={hClear} />}

      <View style={s.tabBar}>
        {tabsToMap.map(t => {
          const isActive = tab === t.id;
          const isAdd = t.id === "add";
          return (
            <TouchableOpacity key={t.id} style={[s.tabItem, isAdd && s.tabAddItem]} onPress={() => {
              LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
              setTab(t.id as Tab);
            }}>
              <View style={[isAdd && s.addBubble, isActive && !isAdd && s.tabBg]}>
                <Ionicons name={t.icon as any} size={isAdd ? 32 : 22} color={isAdd ? "#1A0E00" : isActive ? C.primaryLight : C.textMuted} />
              </View>
              {!isAdd && <Text style={[s.tabLbl, isActive && { color: C.primaryLight }]}>{t.label}</Text>}
            </TouchableOpacity>
          );
        })}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },
  tabBar: { flexDirection: "row", backgroundColor: C.card, borderTopWidth: 1.5, borderTopColor: C.primary + "55", paddingBottom: 20, paddingTop: 8, paddingHorizontal: 8, ...shadow(C.primaryGlow, 8, 0.25) },
  tabItem: { flex: 1, alignItems: "center", gap: 3 },
  tabAddItem: { flex: 1, alignItems: "center", justifyContent: "center", marginTop: -18 },
  tabBg: { backgroundColor: C.primaryDark + "44", paddingHorizontal: 16, paddingVertical: 6, borderRadius: 20, borderWidth: 1, borderColor: C.primary + "55" },
  addBubble: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", borderWidth: 2, borderColor: C.primaryLight, borderTopColor: C.accentLight, ...shadow(C.primaryGlow, 12, 0.7) },
  tabLbl: { color: C.textMuted, fontSize: 10, fontWeight: "700", letterSpacing: 0.3 }
});
