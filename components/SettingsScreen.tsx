import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
    KeyboardAvoidingView, ScrollView, Share, StyleSheet, Switch, Text,
    TextInput, TouchableOpacity, View, ActivityIndicator
} from "react-native";
import * as LocalAuthentication from "expo-local-authentication";
import { Account, Currency, CustomCategory, FixedExpense, PaymentCycle, StorageService, Transaction, UserSettings, getCurrentFinancialPeriod, parseAmount } from "../services/storage";
import { PeriodStartSheet, payDayText } from "./PeriodStartSheet";
import SmsPendingSheet from "./SmsPendingSheet";
import NotificationSettingsSheet from "./NotificationSettingsSheet";
import { sanitizeNotifPrefs } from "../services/NotifPrefs";
import { prefsSummary } from "../services/NotifUi";
import { ExchangeRateService, RateResult } from "../services/ExchangeRateService";
import { TutorialService } from "../services/TutorialService";
import { buildSmsSampleReport } from "../services/SmsDiagnostics";
import { openTutorialMenu } from "./TutorialOverlay";
import { useTutorialRef, useTutorialScroll } from "../context/TutorialContext";
import { C } from "../theme";
import { GlassBackground, GlassCard } from "./GlassCard";
import { GlassButton } from "./GlassButton";
import { GlassSegmented } from "./GlassSegmented";
import { NewCategorySheet } from "./NewCategorySheet";
import { MerchantRulesSheet } from "./MerchantRulesSheet";
import { SmsInboxModal } from "./SmsInboxModal";
import { Money } from "./Money";
import { HelpButton } from "./HelpButton";
import { InlineNotice } from "./InlineNotice";
import { ScreenHeader } from "./ScreenHeader";
import { useGlassDialog } from "./GlassDialogProvider";
import { useKeyboardHeight } from "./useKeyboardHeight";
import { useUndoLastSync } from "./useUndoLastSync";
import { setBiometricRuntimeEnabled } from "./BiometricGate";
import { SmsService } from "../services/SmsService";

type IoniconName = keyof typeof Ionicons.glyphMap;

const pad2 = (n: number) => String(n).padStart(2, "0");

/** "hace 5 min", "hace 2 horas", "hace 3 días" a partir de una fecha ISO (sin Intl). */
function formatAgo(iso?: string): string {
    if (!iso) return "Todavía no sincronizaste";
    const ts = Date.parse(iso);
    if (isNaN(ts)) return "Todavía no sincronizaste";
    const mins = Math.max(0, Math.floor((Date.now() - ts) / 60000));
    if (mins < 1) return "Última sincronización: hace instantes";
    if (mins < 60) return `Última sincronización: hace ${mins} min`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `Última sincronización: hace ${hours} ${hours === 1 ? "hora" : "horas"}`;
    const days = Math.floor(hours / 24);
    return `Última sincronización: hace ${days} ${days === 1 ? "día" : "días"}`;
}

/** Fecha y hora local en formato dd/mm/aaaa hh:mm (es-GT), sin depender de Intl. */
function formatStamp(ts: number): string {
    const d = new Date(ts);
    return `${pad2(d.getDate())}/${pad2(d.getMonth() + 1)}/${d.getFullYear()} ${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** El servicio devuelve esta fuente cuando no hay red ni valor guardado. */
const isDefaultRateSource = (src: string) => src.startsWith("Valor por defecto");

interface RateMeta {
    source: string;
    timestamp: number;
    offline: boolean;
}

// ─────────────────────────────────────────────────────────────
// SECCIÓN CON ÍCONO Y DESCRIPCIÓN
// ─────────────────────────────────────────────────────────────
function Section({ icon, title, description, tutId, onLayoutY, children }: {
    icon: IoniconName; title: string; description?: string; tutId?: string;
    onLayoutY?: (y: number) => void; children: React.ReactNode;
}) {
    const tutRef = useTutorialRef(tutId ?? "__none");
    return (
        <View
            ref={tutRef}
            collapsable={false}
            style={s.sectionWrap}
            onLayout={onLayoutY ? (e) => onLayoutY(e.nativeEvent.layout.y) : undefined}
        >
            <GlassCard radius={18} blur={false} contentStyle={s.sectionContent}>
                <View style={s.sectionHeader}>
                    <View style={s.sectionIconBg}>
                        <Ionicons name={icon} size={18} color={C.primaryLight} />
                    </View>
                    <View style={{ flex: 1 }}>
                        <Text style={s.sectionTitle}>{title}</Text>
                        {description && <Text style={s.sectionDesc}>{description}</Text>}
                    </View>
                </View>
                {children}
            </GlassCard>
        </View>
    );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props {
    settings: UserSettings;
    onSave: (s: UserSettings) => void;
    onClearAll: () => void;
    /** Sección a la que bajar al abrir Ajustes (desde la tarjeta «Guía y primeros pasos»). */
    focusSection?: "biometric" | "gemini" | "sms" | null;
    /** Se llama una vez que se atendió (o no se pudo atender) focusSection. */
    onFocusHandled?: () => void;
    /** «Guía y primeros pasos» en Academia: reabre la tarjeta y vuelve al Inicio. */
    onOpenGuide?: () => void;
    /** «Mis fuentes de ingreso»: lleva a Presupuesto → Ingresos. */
    onOpenIncomeSources?: () => void;
    /** Algo cambió en los movimientos desde un sheet de Ajustes (p. ej. al confirmar un ingreso): la app los relee. */
    onDataChanged?: () => void;
}

const CYCLE_OPTIONS: { value: PaymentCycle; label: string }[] = [
    { value: "monthly", label: "Mensual" },
    { value: "biweekly", label: "Quincenal" },
    { value: "weekly", label: "Semanal" },
    { value: "irregular", label: "Irregular" },
];

export default function SettingsScreen({ settings, onSave, onClearAll, focusSection, onFocusHandled, onOpenGuide, onOpenIncomeSources, onDataChanged }: Props) {
    const dialog = useGlassDialog();
    const kb = useKeyboardHeight();

    const [name, setName] = useState(settings.userName);
    const [budgetQ, setBudgetQ] = useState(settings.budgetLimit.toString());
    const [budgetUSD, setBudgetUSD] = useState(settings.budgetLimitUSD ? settings.budgetLimitUSD.toString() : "");
    const [usdMode, setUsdMode] = useState<'auto' | 'manual'>(settings.budgetLimitUSDMode ?? 'auto');
    const [currency, setCurrency] = useState<Currency>(settings.currency);
    const [extSavingsQ, setExtSavingsQ] = useState(settings.externalSavings?.toString() || "0");
    const [extSavingsUSD, setExtSavingsUSD] = useState((settings.externalSavingsUSD || 0).toString());
    const [exchangeRate, setExchangeRate] = useState((settings.exchangeRate || 7.70).toString());
    const [rateMode, setRateMode] = useState<'auto' | 'manual'>(settings.exchangeRateMode ?? 'auto');
    const [rateMeta, setRateMeta] = useState<RateMeta | null>(() => {
        if ((settings.exchangeRateMode ?? 'auto') === 'manual' || !settings.exchangeRateSource || !settings.exchangeRateUpdatedAt) return null;
        const ts = Date.parse(settings.exchangeRateUpdatedAt);
        return isNaN(ts) ? null : { source: settings.exchangeRateSource, timestamp: ts, offline: false };
    });
    const [loadingRate, setLoadingRate] = useState(false);
    const [rateNotice, setRateNotice] = useState<{ variant: "success" | "error"; text: string } | null>(null);
    const [smsOpt, setSmsOpt] = useState(settings.smsEnabled ?? true);
    const [ruleCount, setRuleCount] = useState(0);
    const [inboxCount, setInboxCount] = useState(0);
    const [showRules, setShowRules] = useState(false);
    const [showInbox, setShowInbox] = useState(false);
    const [sharingSms, setSharingSms] = useState(false);
    const [smsAutoOpt, setSmsAutoOpt] = useState(settings.smsAutoSync !== false);
    const [lastSyncAt, setLastSyncAt] = useState<string | undefined>(undefined);
    const [syncingFull, setSyncingFull] = useState(false);
    const [syncNotice, setSyncNotice] = useState<string | null>(null);
    const reloadSmsCounts = React.useCallback(async () => {
        const [rules, inbox, syncState] = await Promise.all([
            StorageService.getMerchantRules(),
            StorageService.getSmsInbox(),
            StorageService.getSmsSyncState(),
        ]);
        setRuleCount(rules.length);
        setInboxCount(inbox.length);
        setLastSyncAt(syncState.lastSyncAt);
    }, []);
    const undo = useUndoLastSync(() => { void reloadSmsCounts(); });
    const [pendingData, setPendingData] = useState<{ accounts: Account[]; transactions: Transaction[]; fixedExpenses: FixedExpense[] } | null>(null);
    const [showPending, setShowPending] = useState(false);
    const loadPendingData = async () => {
        const [accounts, transactions, fixedExpenses] = await Promise.all([
            StorageService.getAccounts(), StorageService.getTransactions(), StorageService.getFixedExpenses(),
        ]);
        setPendingData({ accounts, transactions, fixedExpenses });
    };
    const openPending = async () => {
        try {
            await loadPendingData();
            setShowPending(true);
        } catch (e) { console.warn("[Settings] pendientes:", e); }
    };
    useEffect(() => {
        if (smsOpt) void reloadSmsCounts();
    }, [smsOpt, reloadSmsCounts]);
    const [biometricOpt, setBiometricOpt] = useState(settings.biometricEnabled ?? false);
    const [biometricAvailable, setBiometricAvailable] = useState(false);
    const [apiKey, setApiKey] = useState(settings.geminiApiKey || "");
    const [saved, setSaved] = useState(false);
    const [formError, setFormError] = useState<string | null>(null);
    const [showPeriod, setShowPeriod] = useState(false);
    const [showNotif, setShowNotif] = useState(false);
    // Ciclo y día(s) de pago: se guardan con su propio botón (StorageService.updatePaymentSchedule), no con «Guardar Cambios».
    const [cycle, setCycle] = useState<PaymentCycle>(settings.paymentCycle);
    const [payDay1, setPayDay1] = useState(String(settings.paymentCycle === "biweekly" ? (settings.paymentDays?.[0] ?? 15) : settings.paymentDay));
    const [payDay2, setPayDay2] = useState(String(settings.paymentDays?.[1] ?? 30));
    const [schedBusy, setSchedBusy] = useState(false);
    const [schedNotice, setSchedNotice] = useState<{ variant: "success" | "error"; text: string } | null>(null);
    // Sube cuando el sheet del período guarda algo: el resumen de «Ingresos y período» se relee.
    const [, setPeriodTick] = useState(0);
    const [showNewCat, setShowNewCat] = useState(false);
    const [editingCat, setEditingCat] = useState<CustomCategory | null>(null);
    const [customCats, setCustomCats] = useState<CustomCategory[]>(settings.customCategories || []);
    // Si otra pantalla (sheet suelto) guarda categorías, el estado local se refresca.
    useEffect(() => { setCustomCats(settings.customCategories || []); }, [settings.customCategories]);

    // ── Tutorial y teclado ───────────────────────────────────
    const scrollRef = useRef<ScrollView>(null);
    const tutScroll = useTutorialScroll("settings", scrollRef);
    const headerRef = useTutorialRef("settings_header");
    const saveRef = useTutorialRef("settings_save");
    const dangerRef = useTutorialRef("settings_danger");
    const sectionYs = useRef<Record<string, number>>({});
    const [focusedY, setFocusedY] = useState<number | null>(null);
    useEffect(() => {
        if (kb > 0 && focusedY !== null) {
            scrollRef.current?.scrollTo({ y: Math.max(focusedY - 16, 0), animated: true });
        }
    }, [kb, focusedY]);
    const trackY = (key: string) => (y: number) => { sectionYs.current[key] = y; };

    // Bajar a la sección pedida por la guía. Las secciones miden su posición al montarse (y la de
    // biometría solo existe cuando el sensor está disponible), así que se reintenta unas veces.
    useEffect(() => {
        if (!focusSection) return;
        let attempts = 0;
        let timer: ReturnType<typeof setTimeout> | undefined;
        const tryScroll = () => {
            const y = sectionYs.current[focusSection];
            if (y !== undefined) {
                scrollRef.current?.scrollTo({ y: Math.max(y - 16, 0), animated: true });
                onFocusHandled?.();
                return;
            }
            attempts += 1;
            if (attempts >= 8) { onFocusHandled?.(); return; }
            timer = setTimeout(tryScroll, 250);
        };
        timer = setTimeout(tryScroll, 350);
        return () => { if (timer) clearTimeout(timer); };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [focusSection]);
    const focusProps = (key: string) => ({
        onFocus: () => setFocusedY(sectionYs.current[key] ?? null),
        onBlur: () => setFocusedY(null),
    });

    const rateNoticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const savedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (rateNoticeTimer.current) clearTimeout(rateNoticeTimer.current);
        if (savedTimer.current) clearTimeout(savedTimer.current);
    }, []);

    /** Escribir en cualquier campo limpia el error del formulario. */
    const onText = (setter: (v: string) => void) => (v: string) => {
        if (formError) setFormError(null);
        setter(v);
    };

    // ── Presupuesto en USD: se recalcula en cada render ──────
    // El tipo de cambio nunca lleva separador de miles: parseAmount leería "7,705" como 7705. Se mantiene parseFloat a propósito.
    const rateNum = parseFloat(exchangeRate.replace(",", "."));
    const bQNum = parseAmount(budgetQ);
    const autoUSD = rateNum > 0 && !isNaN(bQNum) ? bQNum / rateNum : NaN;

    // ── Cargar tipo de cambio automático al abrir ────────────
    useEffect(() => {
        if (rateMode === 'auto') loadExchangeRate();
        checkBiometricAvailability();
    }, []);

    const checkBiometricAvailability = async () => {
        try {
            const hasHW = await LocalAuthentication.hasHardwareAsync();
            const enrolled = await LocalAuthentication.isEnrolledAsync();
            setBiometricAvailable(hasHW && enrolled);
        } catch (e) { console.warn("[Settings] No se pudo verificar disponibilidad biométrica:", e); }
    };

    /** Aplica el resultado del servicio. Sin red ni caché prefiere el último valor guardado en ajustes antes que el de referencia. */
    const applyRateResult = (r: RateResult) => {
        const prevTs = settings.exchangeRateUpdatedAt ? Date.parse(settings.exchangeRateUpdatedAt) : NaN;
        if (r.offline && isDefaultRateSource(r.source) && settings.exchangeRateMode !== 'manual' && settings.exchangeRate > 0 && !isNaN(prevTs)) {
            setExchangeRate(settings.exchangeRate.toFixed(5));
            setRateMeta({ source: settings.exchangeRateSource ?? "Último valor guardado", timestamp: prevTs, offline: true });
            return;
        }
        setExchangeRate(r.rate.toFixed(5));
        setRateMeta({ source: r.source, timestamp: r.timestamp, offline: r.offline });
    };

    const loadExchangeRate = async () => {
        setLoadingRate(true);
        try {
            const r = await ExchangeRateService.getRate();
            applyRateResult(r);
        } catch (e) { console.warn("[Settings] No se pudo cargar el tipo de cambio:", e); }
        setLoadingRate(false);
    };

    const showRateNotice = (n: { variant: "success" | "error"; text: string }) => {
        setRateNotice(n);
        if (rateNoticeTimer.current) clearTimeout(rateNoticeTimer.current);
        rateNoticeTimer.current = setTimeout(() => setRateNotice(null), 3000);
    };

    /** Actualiza desde la red y deja el tipo de cambio en modo automático. */
    const forceRefreshRate = async () => {
        setLoadingRate(true);
        try {
            const r = await ExchangeRateService.forceRefresh();
            setRateMode('auto');
            applyRateResult(r);
            if (r.offline) {
                showRateNotice({ variant: "error", text: "No se pudo actualizar: sin conexión." });
            } else {
                showRateNotice({ variant: "success", text: `Tipo de cambio actualizado: Q ${r.rate.toFixed(5)}` });
            }
        } catch {
            showRateNotice({ variant: "error", text: "No se pudo actualizar el tipo de cambio." });
        }
        setLoadingRate(false);
    };

    /** El interruptor de SMS se guarda al instante (sin esperar a "Guardar cambios") sobre los ajustes más recientes. */
    const toggleSms = async (v: boolean) => {
        setSmsOpt(v);
        try {
            const fresh = await StorageService.getSettings();
            const upd: UserSettings = { ...fresh, smsEnabled: v };
            await StorageService.saveSettings(upd);
            onSave(upd);
        } catch (e) {
            console.warn("[Settings] sms:", e);
            setSmsOpt(!v);
        }
    };

    /** "Sincronizar al abrir la app": se guarda al instante, igual que el interruptor de SMS. */
    const toggleSmsAuto = async (v: boolean) => {
        setSmsAutoOpt(v);
        try {
            const fresh = await StorageService.getSettings();
            const upd: UserSettings = { ...fresh, smsAutoSync: v };
            await StorageService.saveSettings(upd);
            onSave(upd);
        } catch (e) {
            console.warn("[Settings] smsAutoSync:", e);
            setSmsAutoOpt(!v);
        }
    };

    /** Relee 3 meses. Ajustes nunca pide permisos: si falta, se indica sincronizar desde Inicio. */
    const handleSyncFull = async () => {
        if (syncingFull) return;
        setSyncNotice(null);
        setSyncingFull(true);
        try {
            if (!(await SmsService.hasReadSmsPermission())) {
                setSyncNotice("Primero sincronizá desde Inicio para dar el permiso.");
                return;
            }
            const r = await SmsService.syncBankSms({ mode: "full" });
            const imported = r.transactions.length + r.installments.length;
            await dialog.alert({
                variant: "success",
                title: "Sincronización completa",
                message: `Importados: ${imported}. Ya registrados: ${r.totalSkipped}. Sin clasificar: ${r.inbox.length}.`,
            });
            await reloadSmsCounts();
            await undo.reload();
        } catch (e) {
            console.warn("[Settings] sync full:", e);
            await dialog.alert({ variant: "error", title: "No se pudo sincronizar", message: "Intentá de nuevo." });
        } finally {
            setSyncingFull(false);
        }
    };

    // ── Ciclo y día(s) de pago ────────────────────────────────
    const savedDays = [...(settings.paymentDays ?? [15, 30])].sort((a, b) => a - b);
    const changeCycle = (v: PaymentCycle) => {
        setCycle(v);
        setSchedNotice(null);
        if (v === "monthly") setPayDay1(String(settings.paymentDay));
        else if (v === "biweekly") { setPayDay1(String(savedDays[0] ?? 15)); setPayDay2(String(savedDays[1] ?? 30)); }
    };
    const schedDirty = cycle !== settings.paymentCycle
        || (cycle === "monthly" && parseInt(payDay1, 10) !== settings.paymentDay)
        || (cycle === "biweekly" && (parseInt(payDay1, 10) !== savedDays[0] || parseInt(payDay2, 10) !== savedDays[1]));

    const saveSchedule = async () => {
        if (schedBusy) return;
        const inRange = (n: number) => Number.isFinite(n) && n >= 1 && n <= 31;
        const a = parseInt(payDay1, 10);
        const b = parseInt(payDay2, 10);
        if (cycle === "monthly" && !inRange(a)) {
            setSchedNotice({ variant: "error", text: "Escribí el día del mes en que te pagan (de 1 a 31)." });
            return;
        }
        if (cycle === "biweekly") {
            if (!inRange(a) || !inRange(b)) {
                setSchedNotice({ variant: "error", text: "Escribí los dos días del mes en que te pagan (de 1 a 31)." });
                return;
            }
            if (a === b) {
                setSchedNotice({ variant: "error", text: "Los dos días de pago deben ser distintos." });
                return;
            }
        }
        setSchedBusy(true);
        setSchedNotice(null);
        try {
            const upd = await StorageService.updatePaymentSchedule({
                paymentCycle: cycle,
                ...(cycle === "monthly" ? { paymentDay: a } : {}),
                ...(cycle === "biweekly" ? { paymentDays: [a, b] } : {}),
            });
            onSave(upd);
            setSchedNotice({ variant: "success", text: `Listo. ${payDayText(upd)}. Tu período se recalculó con el nuevo día.` });
        } catch (e) {
            console.warn("[Settings] ciclo de pago:", e);
            setSchedNotice({ variant: "error", text: "No se pudo guardar el día de pago. Probá de nuevo." });
        } finally {
            setSchedBusy(false);
        }
    };

    // ── Guardar ───────────────────────────────────────────────
    const handleSave = async () => {
        const bQ = parseAmount(budgetQ);
        const bUSDManual = parseAmount(budgetUSD);
        const sQ = parseAmount(extSavingsQ);
        const sUSD = parseAmount(extSavingsUSD);

        if (isNaN(bQ) || bQ <= 0) { setFormError("El presupuesto en quetzales debe ser mayor a 0."); return; }
        if (isNaN(rateNum) || rateNum <= 0) { setFormError("El tipo de cambio debe ser un número mayor a 0."); return; }
        if (usdMode === 'manual' && (isNaN(bUSDManual) || bUSDManual <= 0)) {
            setFormError("El monto fijo en dólares debe ser mayor a 0, o volvé al cálculo automático.");
            return;
        }
        setFormError(null);

        let rateFields: Pick<UserSettings, "exchangeRateSource" | "exchangeRateUpdatedAt">;
        if (rateMode === 'manual') {
            rateFields = { exchangeRateSource: "Manual", exchangeRateUpdatedAt: new Date().toISOString() };
        } else if (rateMeta) {
            rateFields = { exchangeRateSource: rateMeta.source, exchangeRateUpdatedAt: new Date(rateMeta.timestamp).toISOString() };
        } else {
            rateFields = { exchangeRateSource: settings.exchangeRateSource, exchangeRateUpdatedAt: settings.exchangeRateUpdatedAt };
        }

        const updated: UserSettings = {
            ...settings,
            userName: name.trim() || "Usuario",
            budgetLimit: bQ,
            budgetLimitUSD: usdMode === 'auto' ? Math.round((bQ / rateNum) * 100) / 100 : bUSDManual,
            budgetLimitUSDMode: usdMode,
            currency,
            smsEnabled: smsOpt,
            biometricEnabled: biometricOpt,
            externalSavings: isNaN(sQ) ? 0 : sQ,
            externalSavingsUSD: isNaN(sUSD) ? 0 : sUSD,
            exchangeRate: rateNum,
            exchangeRateMode: rateMode,
            ...rateFields,
            geminiApiKey: apiKey.trim(),
            customCategories: customCats,
        };
        await StorageService.saveSettings(updated);
        setBiometricRuntimeEnabled(updated.biometricEnabled);
        onSave(updated);
        setSaved(true);
        if (savedTimer.current) clearTimeout(savedTimer.current);
        savedTimer.current = setTimeout(() => setSaved(false), 2500);
    };

    /** Reabre la tarjeta «Guía y primeros pasos» del Inicio (la crea si el usuario no la tenía). */
    const handleOpenGuide = async () => {
        try {
            await StorageService.patchGettingStarted({ dismissed: false, collapsed: false });
        } catch (e) { console.warn("[Settings] guía:", e); }
        onOpenGuide?.();
    };

    /** El sheet ya guardó en storage (alta o edición); aquí solo se refleja en la pantalla. */
    const handleCustomCatSaved = (cat: CustomCategory) => {
        const exists = customCats.some(c => c.id === cat.id);
        const updated = exists ? customCats.map(c => (c.id === cat.id ? cat : c)) : [...customCats, cat];
        setCustomCats(updated);
        onSave({ ...settings, customCategories: updated });
    };

    const handleDeleteCustomCat = async (id: string) => {
        const ok = await dialog.confirm({
            title: "Eliminar categoría",
            message: "Esta categoría se borrará de forma permanente.",
            confirmLabel: "Eliminar",
        });
        if (!ok) return;
        const updated = customCats.filter(c => c.id !== id);
        setCustomCats(updated);
        const newSettings: UserSettings = { ...settings, customCategories: updated };
        await StorageService.saveSettings(newSettings);
        onSave(newSettings);
    };

    const handleShareSmsSample = async () => {
        if (sharingSms) return;
        const ok = await dialog.confirm({
            title: "Compartir muestra de tus SMS",
            message: "Vamos a armar un texto con hasta 4 ejemplos por tipo de tus SMS bancarios importados (y los sin clasificar). Ocultamos números de cuenta y tarjeta, tu nombre al inicio y los enlaces personales. Los montos y nombres de comercios sí van, porque son lo que hace falta para mejorar la lectura (por ejemplo, la comisión de BANRURAL). Nada se envía solo: elegís la app y la persona, y podés revisarlo antes.",
            confirmLabel: "Armar y compartir",
            icon: "paper-plane-outline",
        });
        if (!ok) return;
        setSharingSms(true);
        try {
            const [txs, inbox] = await Promise.all([StorageService.getTransactions(), StorageService.getSmsInbox()]);
            const { text, count } = buildSmsSampleReport(txs, inbox);
            if (count === 0) {
                await dialog.alert({
                    title: "No hay SMS para compartir",
                    message: "Todavía no hay mensajes importados ni sin clasificar.",
                });
                return;
            }
            await Share.share({ message: text });
        } catch (e) {
            console.warn("share sms sample error:", e);
        } finally {
            setSharingSms(false);
        }
    };

    const handleResetTutorials = async () => {
        await TutorialService.resetAll();
        await dialog.alert({
            variant: "success",
            title: "Tutoriales reiniciados",
            message: "El tour inicial aparecerá la próxima vez que abras la app.",
        });
    };

    const handleClearAll = async () => {
        const ok = await dialog.confirm({
            title: "Borrar todos los datos",
            message: "Esta acción no se puede deshacer. Se va a eliminar:",
            steps: [
                "Movimientos y cuentas",
                "Presupuestos, gastos fijos y metas",
                "Configuración y categorías personalizadas",
            ],
            confirmLabel: "Sí, borrar todo",
        });
        if (ok) onClearAll();
    };

    // ── Texto de fuente del tipo de cambio (modo automático) ─
    const rateStatus = (() => {
        if (rateMode === 'manual') return null;
        if (!rateMeta) return loadingRate ? <Text style={s.rateSource}>Actualizando...</Text> : null;
        if (rateMeta.offline) {
            const text = isDefaultRateSource(rateMeta.source)
                ? "Sin conexión y sin tipo de cambio guardado: se usa el valor de referencia Q 7.70."
                : `Sin conexión: se usa el último tipo de cambio guardado (${rateMeta.source}, ${formatStamp(rateMeta.timestamp)}).`;
            return <InlineNotice variant="warning" text={text} style={{ marginTop: 10 }} />;
        }
        return (
            <Text style={s.rateSource}>
                {loadingRate ? "Actualizando..." : `Fuente: ${rateMeta.source} · actualizado ${formatStamp(rateMeta.timestamp)}`}
            </Text>
        );
    })();

    return (
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
            <ScrollView
                ref={tutScroll.ref}
                onScroll={tutScroll.onScroll}
                scrollEventThrottle={tutScroll.scrollEventThrottle}
                style={s.screen}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >

                <ScreenHeader
                    title="Configuración"
                    subtitle="Personalizá tu experiencia financiera"
                    right={<HelpButton tutorialId="tutorial_ajustes" />}
                    headerRef={headerRef}
                />

                {/* PERFIL */}
                <Section tutId="settings_profile" onLayoutY={trackY("profile")} icon="person-circle-outline" title="Tu Perfil" description="¿Cómo querés que te llamemos en la app?">
                    <View style={s.inputRow}>
                        <Ionicons name="person-outline" size={18} color={C.primary} style={{ marginRight: 10 }} />
                        <TextInput style={s.input} value={name} onChangeText={onText(setName)} placeholder="Tu nombre..." placeholderTextColor={C.textMuted} returnKeyType="done" {...focusProps("profile")} />
                    </View>
                </Section>

                {/* SMS (arriba, para que el interruptor sea fácil de encontrar) */}
                <Section tutId="settings_sms" onLayoutY={trackY("sms")} icon="chatbubble-outline" title="Sincronización de SMS" description="Lee la bandeja de tu teléfono y solo procesa los mensajes de bancos (BAC, BANRURAL, GTC, BANTRAB y PROMERICA) para registrar gastos automáticamente. Nada sale de tu dispositivo.">
                    <View style={s.switchRow}>
                        <View style={{ flex: 1 }}>
                            <View style={s.switchLabelRow}>
                                <Ionicons name={smsOpt ? "checkmark-circle" : "ellipse-outline"} size={16} color={smsOpt ? C.accent : C.textSub} />
                                <Text style={s.switchLabel}>{smsOpt ? "Activado" : "Desactivado"}</Text>
                            </View>
                            <Text style={s.hint}>
                                {smsOpt
                                    ? "Botón de sincronizar en Inicio, «Leer SMS» en Agregar y tutoriales de SMS visibles."
                                    : "Todo lo relacionado con SMS queda oculto. Tus movimientos ya importados se conservan y Android no te pedirá el permiso."}
                            </Text>
                        </View>
                        <Switch value={smsOpt} onValueChange={toggleSms} trackColor={{ false: C.bgDeep, true: C.accent }} thumbColor={C.text} style={{ marginLeft: 12 }} />
                    </View>
                    {smsOpt && (
                        <View style={[s.switchRow, { marginTop: 16 }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={s.switchLabel}>Sincronizar al abrir la app</Text>
                                <Text style={s.hint}>Solo lee los mensajes nuevos. Nunca pide permisos por su cuenta.</Text>
                            </View>
                            <Switch value={smsAutoOpt} onValueChange={toggleSmsAuto} trackColor={{ false: C.bgDeep, true: C.accent }} thumbColor={C.text} style={{ marginLeft: 12 }} />
                        </View>
                    )}
                    {smsOpt && <Text style={[s.hint, { marginTop: 12 }]}>{formatAgo(lastSyncAt)}</Text>}
                    {smsOpt && (
                        <View style={s.smsTools}>
                            <GlassButton
                                kind="secondary"
                                icon="sync-outline"
                                label="Sincronizar todo (3 meses)"
                                loading={syncingFull}
                                onPress={() => { void handleSyncFull(); }}
                            />
                            {!!syncNotice && <InlineNotice variant="info" text={syncNotice} />}
                            <GlassButton
                                kind="secondary"
                                icon="albums-outline"
                                label="Revisar pendientes"
                                onPress={() => { void openPending(); }}
                            />
                            <GlassButton
                                kind="destructive"
                                icon="arrow-undo-outline"
                                label="Deshacer última sincronización"
                                disabled={!undo.canUndo}
                                onPress={() => { void undo.requestUndo(); }}
                            />
                            <GlassButton
                                kind="secondary"
                                icon="school-outline"
                                label={`Comercios aprendidos (${ruleCount})`}
                                onPress={() => setShowRules(true)}
                            />
                            <GlassButton
                                kind="secondary"
                                icon="mail-unread-outline"
                                label={`Mensajes sin clasificar (${inboxCount})`}
                                onPress={() => setShowInbox(true)}
                            />
                            <GlassButton
                                kind="secondary"
                                icon="paper-plane-outline"
                                label="Compartir muestra de mis SMS"
                                loading={sharingSms}
                                onPress={() => { void handleShareSmsSample(); }}
                            />
                        </View>
                    )}
                </Section>

                {/* PRESUPUESTO */}
                <Section tutId="settings_budget" onLayoutY={trackY("budget")} icon="wallet-outline" title="Presupuesto Mensual" description="Cuánto planeás gastar cada mes. La app te avisará cuando te acerques al límite.">
                    <Text style={s.subLabel}>EN QUETZALES (Q)</Text>
                    <View style={s.inputRow}>
                        <Text style={s.currSymbol}>Q</Text>
                        <TextInput style={s.input} value={budgetQ} onChangeText={onText(setBudgetQ)} keyboardType="decimal-pad" placeholder="6000.00" placeholderTextColor={C.textMuted} returnKeyType="done" {...focusProps("budget")} />
                    </View>
                    <Text style={s.hint}>Valor inicial sugerido al configurar la app: 80% de tu ingreso mensual.</Text>

                    <Text style={[s.subLabel, { marginTop: 14 }]}>EQUIVALENTE EN DÓLARES (USD)</Text>
                    {usdMode === 'auto' ? (
                        <>
                            <View style={s.autoRow}>
                                <GlassBackground radius={12} blur={false} />
                                {isNaN(autoUSD) ? (
                                    <Text style={s.autoValuePlain}>—</Text>
                                ) : (
                                    <Money amount={autoUSD} currency="USD" size="md" tone="neutral" containerStyle={{ flex: 1 }} />
                                )}
                            </View>
                            <Text style={s.hint}>
                                {isNaN(autoUSD)
                                    ? "Ingresá el presupuesto en quetzales y un tipo de cambio válido para ver el equivalente en dólares."
                                    : `Calculado automáticamente: Q ${bQNum.toFixed(2)} ÷ Q ${rateNum.toFixed(5)} por dólar. Se recalcula cuando cambiás el monto en quetzales o el tipo de cambio. Es solo una referencia: las alertas y el score usan el presupuesto en quetzales.`}
                            </Text>
                            <GlassButton
                                kind="ghost"
                                icon="create-outline"
                                label="Fijar un monto en dólares manualmente"
                                style={s.ghostBtn}
                                onPress={() => {
                                    setBudgetUSD(isNaN(autoUSD) ? "" : autoUSD.toFixed(2));
                                    setUsdMode('manual');
                                }}
                            />
                        </>
                    ) : (
                        <>
                            <View style={s.inputRow}>
                                <Text style={s.currSymbol}>$</Text>
                                <TextInput style={s.input} value={budgetUSD} onChangeText={onText(setBudgetUSD)} keyboardType="decimal-pad" placeholder="800.00" placeholderTextColor={C.textMuted} returnKeyType="done" {...focusProps("budget")} />
                            </View>
                            <InlineNotice variant="warning" text="Monto fijo: no cambia con el tipo de cambio." style={{ marginTop: 10 }} />
                            <GlassButton
                                kind="ghost"
                                icon="refresh-outline"
                                label="Volver al cálculo automático"
                                style={s.ghostBtn}
                                onPress={() => setUsdMode('auto')}
                            />
                        </>
                    )}
                </Section>

                {/* INGRESOS Y PERÍODO */}
                <Section tutId="settings_period" onLayoutY={trackY("period")} icon="calendar-outline" title="Ingresos y período" description="Tu período empieza el día que cae tu sueldo. Acá ves cuándo empezó y podés cambiar las reglas.">
                    <Text style={s.switchLabel}>{payDayText(settings)}</Text>
                    <Text style={s.hint}>Período actual: {getCurrentFinancialPeriod(settings).label}</Text>
                    <GlassButton
                        kind="secondary"
                        icon="calendar-outline"
                        label="Cuándo empieza mi período"
                        style={s.ghostBtn}
                        onPress={() => setShowPeriod(true)}
                    />
                    {!!onOpenIncomeSources && (
                        <GlassButton
                            kind="secondary"
                            icon="cash-outline"
                            label="Mis fuentes de ingreso"
                            style={s.ghostBtn}
                            onPress={onOpenIncomeSources}
                        />
                    )}

                    <Text style={[s.subLabel, { marginTop: 20 }]}>CICLO DE PAGO</Text>
                    <GlassSegmented options={CYCLE_OPTIONS} value={cycle} onChange={changeCycle} height={44} />
                    {cycle === "monthly" && (
                        <View style={[s.inputRow, { marginTop: 10 }]}>
                            <Ionicons name="calendar-outline" size={18} color={C.primary} style={{ marginRight: 10 }} />
                            <TextInput
                                style={s.input}
                                value={payDay1}
                                onChangeText={v => { setPayDay1(v); setSchedNotice(null); }}
                                keyboardType="number-pad"
                                maxLength={2}
                                placeholder="Día del mes (1-31)"
                                placeholderTextColor={C.textMuted}
                                returnKeyType="done"
                                {...focusProps("period")}
                            />
                        </View>
                    )}
                    {cycle === "biweekly" && (
                        <View style={[s.rateRow, { marginTop: 10 }]}>
                            <View style={[s.inputRow, { flex: 1 }]}>
                                <TextInput
                                    style={s.input}
                                    value={payDay1}
                                    onChangeText={v => { setPayDay1(v); setSchedNotice(null); }}
                                    keyboardType="number-pad"
                                    maxLength={2}
                                    placeholder="1.er día"
                                    placeholderTextColor={C.textMuted}
                                    {...focusProps("period")}
                                />
                            </View>
                            <View style={[s.inputRow, { flex: 1 }]}>
                                <TextInput
                                    style={s.input}
                                    value={payDay2}
                                    onChangeText={v => { setPayDay2(v); setSchedNotice(null); }}
                                    keyboardType="number-pad"
                                    maxLength={2}
                                    placeholder="2.º día"
                                    placeholderTextColor={C.textMuted}
                                    {...focusProps("period")}
                                />
                            </View>
                        </View>
                    )}
                    {cycle === "weekly" && (
                        <Text style={s.hint}>Con ciclo semanal el período siempre empieza el domingo: no hay un día que elegir.</Text>
                    )}
                    {cycle === "irregular" && (
                        <Text style={s.hint}>Con ingresos irregulares el período es el mes calendario: no hay un día que elegir.</Text>
                    )}
                    <InlineNotice
                        variant="info"
                        text="Cambiar el día de pago mueve tu período. Lo que fijaste a mano en un período anterior se conserva."
                        style={{ marginTop: 12 }}
                    />
                    {!!schedNotice && <InlineNotice variant={schedNotice.variant} text={schedNotice.text} style={{ marginTop: 10 }} />}
                    <GlassButton
                        kind="primary"
                        icon="save-outline"
                        label="Guardar ciclo y día de pago"
                        loading={schedBusy}
                        disabled={!schedDirty}
                        style={s.ghostBtn}
                        onPress={() => { void saveSchedule(); }}
                    />
                </Section>

                {/* MONEDA PRINCIPAL */}
                <Section tutId="settings_currency" icon="cash-outline" title="Moneda Principal" description="La moneda que usás en tu día a día.">
                    <GlassSegmented
                        options={[
                            { value: "Q" as Currency, label: "Q" },
                            { value: "USD" as Currency, label: "$" },
                            { value: "EUR" as Currency, label: "€" },
                            { value: "£" as Currency, label: "£" },
                        ]}
                        value={currency}
                        onChange={setCurrency}
                        height={46}
                    />
                </Section>

                {/* TIPO DE CAMBIO */}
                <Section
                    tutId="settings_rate"
                    onLayoutY={trackY("rate")}
                    icon="swap-horizontal-outline"
                    title="Tipo de Cambio USD → Q"
                    description="Se actualiza automáticamente desde el Banco de Guatemala. También podés editarlo manualmente."
                >
                    <View style={s.rateRow}>
                        <View style={[s.inputRow, { flex: 1 }]}>
                            <Text style={s.currSymbol}>Q</Text>
                            <TextInput
                                style={s.input}
                                value={exchangeRate}
                                onChangeText={(v) => { if (formError) setFormError(null); setRateMode('manual'); setExchangeRate(v); }}
                                keyboardType="decimal-pad"
                                placeholder="7.70000"
                                placeholderTextColor={C.textMuted}
                                returnKeyType="done"
                                {...focusProps("rate")}
                            />
                        </View>
                        {rateMode === 'auto' && (
                            <TouchableOpacity
                                style={s.refreshRateBtn}
                                onPress={forceRefreshRate}
                                disabled={loadingRate}
                                accessibilityRole="button"
                                accessibilityLabel="Actualizar tipo de cambio"
                            >
                                <GlassBackground radius={12} blur={false} />
                                {loadingRate
                                    ? <ActivityIndicator size="small" color={C.primaryLight} />
                                    : <Ionicons name="refresh-outline" size={18} color={C.primaryLight} />
                                }
                            </TouchableOpacity>
                        )}
                    </View>
                    {rateStatus}
                    {rateMode === 'manual' && (
                        <>
                            <Text style={s.rateSource}>Valor ingresado manualmente.</Text>
                            <GlassButton
                                kind="ghost"
                                icon="refresh-outline"
                                label="Volver a automático"
                                loading={loadingRate}
                                style={s.ghostBtn}
                                onPress={forceRefreshRate}
                            />
                        </>
                    )}
                    {!!rateNotice && <InlineNotice variant={rateNotice.variant} text={rateNotice.text} style={{ marginTop: 10 }} />}
                    {rateMode === 'auto' && (
                        <Text style={s.hint}>Se renueva automáticamente cada 6 horas desde el Banguat o mercado internacional.</Text>
                    )}
                </Section>

                {/* AHORROS EXTERNOS */}
                <Section tutId="settings_savings" onLayoutY={trackY("savings")} icon="business-outline" title="Ahorros Externos" description="Dinero fuera de tus cuentas registradas. Solo se usa si no tenés cuentas creadas.">
                    <Text style={s.subLabel}>EN QUETZALES (Q)</Text>
                    <View style={s.inputRow}>
                        <Text style={s.currSymbol}>Q</Text>
                        <TextInput style={s.input} value={extSavingsQ} onChangeText={onText(setExtSavingsQ)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.textMuted} returnKeyType="done" {...focusProps("savings")} />
                    </View>
                    <Text style={[s.subLabel, { marginTop: 12 }]}>EN DÓLARES (USD)</Text>
                    <View style={s.inputRow}>
                        <Text style={s.currSymbol}>$</Text>
                        <TextInput style={s.input} value={extSavingsUSD} onChangeText={onText(setExtSavingsUSD)} keyboardType="decimal-pad" placeholder="0.00" placeholderTextColor={C.textMuted} returnKeyType="done" {...focusProps("savings")} />
                    </View>
                </Section>

                {/* BIOMETRÍA */}
                {biometricAvailable && (
                    <Section tutId="settings_biometric" onLayoutY={trackY("biometric")} icon="finger-print-outline" title="Seguridad Biométrica" description="Protegé tu información financiera con huella digital o Face ID al abrir la app.">
                        <View style={s.switchRow}>
                            <View style={{ flex: 1 }}>
                                <View style={s.switchLabelRow}>
                                    <Ionicons name={biometricOpt ? "checkmark-circle" : "ellipse-outline"} size={16} color={biometricOpt ? C.accent : C.textSub} />
                                    <Text style={s.switchLabel}>{biometricOpt ? "Activado" : "Desactivado"}</Text>
                                </View>
                                <Text style={s.hint}>
                                    {biometricOpt ? "La app pedirá autenticación biométrica al abrirse." : "La app abre directamente sin solicitar biometría."}
                                </Text>
                            </View>
                            <Switch
                                value={biometricOpt}
                                onValueChange={setBiometricOpt}
                                trackColor={{ false: C.bgDeep, true: C.accent }}
                                thumbColor={C.text}
                                style={{ marginLeft: 12 }}
                            />
                        </View>
                    </Section>
                )}

                {/* GEMINI IA */}
                <Section tutId="settings_gemini" onLayoutY={trackY("gemini")} icon="sparkles-outline" title="Inteligencia Artificial (Gemini)" description="Ingresá tu API Key de Google Gemini para activar el Asesor IA avanzado con respuestas en lenguaje natural. Obtené tu clave gratuita en: aistudio.google.com">
                    <View style={s.inputRow}>
                        <Ionicons name="key-outline" size={18} color={C.primary} style={{ marginRight: 10 }} />
                        <TextInput style={s.input} value={apiKey} onChangeText={onText(setApiKey)} placeholder="AIzaSy..." placeholderTextColor={C.textMuted} secureTextEntry returnKeyType="done" {...focusProps("gemini")} />
                    </View>
                    {apiKey.length > 10 && (
                        <View style={s.geminiOk}>
                            <Ionicons name="checkmark-circle" size={16} color={C.accent} />
                            <Text style={[s.hint, { color: C.accent, marginTop: 0, flexShrink: 1 }]}>API Key configurada. El Asesor IA usará Gemini en modo chat real.</Text>
                        </View>
                    )}
                </Section>

                {/* NOTIFICACIONES */}
                <Section tutId="settings_notifications" onLayoutY={trackY("notifications")} icon="notifications-outline" title="Notificaciones" description="Elige qué avisos recibir, a qué hora y cuántos por día.">
                    <Text style={s.switchLabel}>{prefsSummary(sanitizeNotifPrefs(settings.notif))}</Text>
                    <GlassButton
                        kind="secondary"
                        icon="notifications-outline"
                        label="Configurar notificaciones"
                        style={s.ghostBtn}
                        onPress={() => setShowNotif(true)}
                    />
                </Section>

                {/* CATEGORÍAS CUSTOM */}
                <Section tutId="settings_categories" icon="pricetag-outline" title="Mis Categorías" description="Creá categorías personalizadas para clasificar mejor tus gastos e ingresos.">
                    {customCats.length === 0 ? (
                        <Text style={[s.hint, { marginBottom: 12 }]}>Aún no tenés categorías personalizadas.</Text>
                    ) : (
                        <View style={s.catList}>
                            {customCats.map(cat => (
                                <View key={cat.id} style={s.catRow}>
                                    <TouchableOpacity
                                        style={s.catEditArea}
                                        onPress={() => setEditingCat(cat)}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Editar categoría ${cat.label}`}
                                    >
                                        <View style={[s.catIcon, { backgroundColor: cat.color + "22", borderColor: cat.color + "44" }]}>
                                            <Ionicons name={cat.icon as any} size={18} color={cat.color} />
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.catLabel} numberOfLines={1}>{cat.label}</Text>
                                            <Text style={s.catType}>{cat.type === 'expense' ? 'Gastos' : cat.type === 'income' ? 'Ingresos' : 'Ambos'}</Text>
                                        </View>
                                        <Ionicons name="create-outline" size={16} color={C.textSub} />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={() => handleDeleteCustomCat(cat.id)}
                                        style={s.catDeleteBtn}
                                        accessibilityRole="button"
                                        accessibilityLabel={`Eliminar categoría ${cat.label}`}
                                    >
                                        <Ionicons name="trash-outline" size={16} color={C.danger} />
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}
                    <GlassButton kind="secondary" icon="add-circle-outline" label="Crear nueva categoría" onPress={() => setShowNewCat(true)} />
                </Section>

                {/* ACADEMIA / TUTORIALES */}
                <Section tutId="settings_academy" icon="school-outline" title="Academia BudgetMaster" description="Tutoriales interactivos para aprender a usar todas las funciones de la app.">
                    <GlassButton kind="secondary" icon="compass-outline" label="Guía y primeros pasos" style={{ marginBottom: 10 }} onPress={handleOpenGuide} />
                    <GlassButton kind="secondary" icon="play-circle-outline" label="Ver tutoriales" style={{ marginBottom: 10 }} onPress={openTutorialMenu} />
                    <GlassButton kind="secondary" icon="refresh-outline" label="Reiniciar todos los tutoriales" onPress={handleResetTutorials} />
                    <Text style={s.hint}>Abrí Ver tutoriales para elegir cualquier tutorial, o tocá el botón ? en el encabezado de cada módulo.</Text>
                </Section>

                {/* GUARDAR */}
                <View ref={saveRef} collapsable={false} style={s.saveWrap}>
                    {!!formError && <InlineNotice variant="error" text={formError} style={{ marginBottom: 10 }} />}
                    <GlassButton
                        icon={saved ? "checkmark-circle" : "save-outline"}
                        label={saved ? "¡Cambios guardados!" : "Guardar Cambios"}
                        onPress={handleSave}
                        style={s.saveBtn}
                    />
                </View>

                {/* ZONA DE PELIGRO */}
                <View ref={dangerRef} collapsable={false}>
                    <GlassCard radius={18} blur={false} style={s.dangerZone} contentStyle={s.dangerContent}>
                        <View style={s.dangerTitleRow}>
                            <Ionicons name="warning-outline" size={20} color={C.danger} />
                            <Text style={s.dangerTitle}>Zona de Peligro</Text>
                        </View>
                        <Text style={s.dangerDesc}>Esto borrará TODAS tus transacciones, cuentas, configuración y categorías personalizadas permanentemente. No se puede deshacer.</Text>
                        <GlassButton kind="destructive" icon="trash-outline" label="Borrar Todos los Datos" onPress={handleClearAll} />
                    </GlassCard>
                </View>

                <View style={{ height: 120 + kb }} />
            </ScrollView>

            {showPeriod && (
                <PeriodStartSheet
                    settings={settings}
                    onClose={() => setShowPeriod(false)}
                    onChanged={upd => { if (upd) onSave(upd); setPeriodTick(n => n + 1); }}
                />
            )}
            {showNotif && (
                <NotificationSettingsSheet
                    settings={settings}
                    onClose={() => setShowNotif(false)}
                    onChanged={upd => { onSave(upd); }}
                />
            )}
            {showNewCat && (
                <NewCategorySheet onSaved={handleCustomCatSaved} onClose={() => setShowNewCat(false)} />
            )}
            {editingCat && (
                <NewCategorySheet existing={editingCat} onSaved={handleCustomCatSaved} onClose={() => setEditingCat(null)} />
            )}
            {showRules && (
                <MerchantRulesSheet
                    customCategories={customCats}
                    onChanged={setRuleCount}
                    onClose={() => setShowRules(false)}
                />
            )}
            <SmsInboxModal
                visible={showInbox}
                settings={settings}
                onClose={() => setShowInbox(false)}
                onChanged={() => { void reloadSmsCounts(); }}
            />
            {pendingData && (
                <SmsPendingSheet
                    visible={showPending}
                    result={null}
                    settings={settings}
                    accounts={pendingData.accounts}
                    transactions={pendingData.transactions}
                    fixedExpenses={pendingData.fixedExpenses}
                    onClose={() => setShowPending(false)}
                    onChanged={() => {
                        void reloadSmsCounts();
                        void undo.reload();
                        void loadPendingData().catch(e => console.warn("[Settings] pendientes:", e));
                        onDataChanged?.();
                    }}
                />
            )}
        </KeyboardAvoidingView>
    );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    screen: { flex: 1, paddingHorizontal: 16 },
    sectionWrap: { marginBottom: 16 },
    sectionContent: { padding: 18 },
    sectionHeader: { flexDirection: "row", alignItems: "flex-start", marginBottom: 16 },
    sectionIconBg: { width: 36, height: 36, borderRadius: 10, backgroundColor: C.primaryDark + "44", borderWidth: 1, borderColor: C.primary + "55", alignItems: "center", justifyContent: "center", marginRight: 12, marginTop: 2 },
    sectionTitle: { color: C.textPrimary, fontSize: 15, fontWeight: "800" },
    sectionDesc: { color: C.textSub, fontSize: 12, marginTop: 3, lineHeight: 17 },
    subLabel: { color: C.textSub, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
    hint: { color: C.textSub, fontSize: 12, lineHeight: 17, marginTop: 6 },
    inputRow: { flexDirection: "row", alignItems: "center", backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, paddingHorizontal: 14, paddingVertical: 12 },
    input: { flex: 1, color: C.text, fontSize: 15 },
    currSymbol: { color: C.textSub, fontSize: 16, fontWeight: "700", marginRight: 8 },
    autoRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, minHeight: 50, overflow: "hidden" },
    autoValuePlain: { color: C.textSub, fontSize: 18, fontWeight: "900" },
    ghostBtn: { marginTop: 10, minHeight: 44 },
    rateRow: { flexDirection: "row", alignItems: "center", gap: 8 },
    refreshRateBtn: { width: 48, height: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", overflow: "hidden" },
    rateSource: { color: C.textSub, fontSize: 12, marginTop: 8, fontWeight: "600", lineHeight: 17 },
    switchRow: { flexDirection: "row", alignItems: "center" },
    smsTools: { gap: 10, marginTop: 16 },
    switchLabelRow: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 4 },
    switchLabel: { color: C.text, fontSize: 14, fontWeight: "700" },
    geminiOk: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 8 },
    catList: { marginBottom: 12 },
    catEditArea: { flex: 1, flexDirection: "row", alignItems: "center" },
    catRow: { flexDirection: "row", alignItems: "center", paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: C.separator },
    catIcon: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, alignItems: "center", justifyContent: "center", marginRight: 12 },
    catLabel: { color: C.text, fontSize: 14, fontWeight: "700" },
    catType: { color: C.textSub, fontSize: 11, marginTop: 2 },
    catDeleteBtn: { padding: 8, borderRadius: 8, backgroundColor: C.danger + "11", borderWidth: 1, borderColor: C.danger + "33" },
    saveWrap: { marginTop: 8, marginBottom: 16 },
    saveBtn: { minHeight: 56 },
    dangerZone: { borderWidth: 1, borderColor: C.danger + "44" },
    dangerContent: { padding: 20 },
    dangerTitleRow: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
    dangerTitle: { color: C.danger, fontSize: 18, fontWeight: "800" },
    dangerDesc: { color: C.textSub, fontSize: 13, lineHeight: 19, marginBottom: 16 },
});

