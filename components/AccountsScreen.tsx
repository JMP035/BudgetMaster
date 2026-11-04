import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated, BackHandler, Easing, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTutorialAction, useTutorialRef, useTutorialScroll } from "../context/TutorialContext";
import {
  Account, AccountType, CreditInstallment,
  Currency, StorageService, Transaction, UserSettings,
  calcCreditCommitments, calcNetWorthFromAccounts, convertAmount,
  getAccountMonthlyInstallmentTotal, getMonthlyInstallmentTotal, hasReliableConversion,
  parseAmount, parseDateOnly, storedDateToDateOnly
} from "../services/storage";
import { C } from "../theme";
import { GlassBackground, GlassCard } from "./GlassCard";
import { useGlassDialog } from "./GlassDialogProvider";
import { GlassButton } from "./GlassButton";
import { GlassSegmented } from "./GlassSegmented";
import { GlassSheet } from "./GlassSheet";
import { HelpButton } from "./HelpButton";
import InstallmentModal from "./InstallmentModal";
import { InlineNotice, InlineNoticeVariant } from "./InlineNotice";
import { ScreenHeader } from "./ScreenHeader";
import { isTutorialActive } from "./TutorialOverlay";

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE TIPOS DE CUENTA
// (paletas de datos que el usuario elige: excepción documentada al tema)
// ─────────────────────────────────────────────────────────────
const ACCOUNT_TYPES: { type: AccountType; label: string; icon: string; color: string; desc: string }[] = [
  { type: 'cash', label: 'Efectivo', icon: 'cash-outline', color: '#84CC16', desc: 'Dinero físico en mano' },
  { type: 'bank', label: 'Banco', icon: 'business-outline', color: '#4A9EE8', desc: 'Cuenta monetaria o de ahorro' },
  { type: 'credit', label: 'Tarjeta Crédito', icon: 'card-outline', color: '#E8453C', desc: 'Saldo deudor de tarjeta' },
  { type: 'investment', label: 'Inversión', icon: 'trending-up-outline', color: '#9B59B6', desc: 'Acciones, cripto, fondos' },
  { type: 'savings', label: 'Ahorro', icon: 'save-outline', color: '#2ECC71', desc: 'Cuenta de ahorro separada' },
];

const ACCOUNT_COLORS = [
  '#4A9EE8', '#2ECC71', '#E8943A', '#9B59B6', '#E8453C',
  '#84CC16', '#F5C842', '#20C997', '#5C6BC0', '#F97316',
];

const CURRENCY_OPTIONS: { value: 'Q' | 'USD'; label: string }[] = [
  { value: 'Q', label: 'Q' },
  { value: 'USD', label: 'USD' },
];

// ─────────────────────────────────────────────────────────────
// BARRA ANIMADA
// ─────────────────────────────────────────────────────────────
function AnimBar({ pct, color }: { pct: number; color: string }) {
  const anim = useRef(new Animated.Value(0)).current;
  React.useEffect(() => {
    Animated.timing(anim, { toValue: Math.min(pct, 100), duration: 800, easing: Easing.out(Easing.cubic), useNativeDriver: false }).start();
  }, [pct]);
  const w = anim.interpolate({ inputRange: [0, 100], outputRange: ['0%', '100%'] });
  return (
    <View style={s.barTrack}>
      <Animated.View style={{ height: '100%', width: w, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL — NUEVA CUENTA
// ─────────────────────────────────────────────────────────────
export function AccountModal({ onSave, onClose, existing, defaultType, defaultCurrency }: {
  onSave: (a: Account) => void; onClose: () => void; existing?: Account; defaultType?: AccountType;
  defaultCurrency?: Currency;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [type, setType] = useState<AccountType>(existing?.type || defaultType || 'bank');
  const [currency, setCurrency] = useState<Currency>(existing?.currency || defaultCurrency || 'Q');
  const [balance, setBalance] = useState(existing?.balance.toString() || '0');
  const [color, setColor] = useState(existing?.color || ACCOUNT_COLORS[0]);
  const [bankName, setBankName] = useState(existing?.bankName || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [cutoffDay, setCutoffDay] = useState(existing?.cutoffDay?.toString() || '');
  const [paymentDueDay, setPaymentDueDay] = useState(existing?.paymentDueDay?.toString() || '');
  const [error, setError] = useState('');

  const typeInfo = ACCOUNT_TYPES.find(t => t.type === type)!;

  // Cada cambio en un campo limpia el aviso de error
  const ch = (set: (v: string) => void) => (v: string) => { set(v); setError(''); };

  const handleSave = () => {
    if (!name.trim()) { setError('Ingresa el nombre de la cuenta.'); return; }

    if (type === 'credit') {
      let parsedCutoff: number | undefined;
      let parsedPaymentDue: number | undefined;
      if (cutoffDay.trim()) {
        parsedCutoff = parseInt(cutoffDay, 10);
        if (isNaN(parsedCutoff) || parsedCutoff < 1 || parsedCutoff > 31) {
          setError('El día de corte debe ser un número entre 1 y 31.');
          return;
        }
      }
      if (paymentDueDay.trim()) {
        parsedPaymentDue = parseInt(paymentDueDay, 10);
        if (isNaN(parsedPaymentDue) || parsedPaymentDue < 1 || parsedPaymentDue > 31) {
          setError('El día de pago debe ser un número entre 1 y 31.');
          return;
        }
      }

      const account: Account = {
        id: existing?.id || `acc_${Date.now()}`,
        name: name.trim(),
        type,
        currency,
        balance: existing?.balance ?? 0,
        initialBalance: existing?.initialBalance ?? 0,
        color,
        icon: typeInfo.icon,
        bankName: bankName.trim() || undefined,
        creditLimit: existing?.creditLimit,
        cutoffDay: parsedCutoff,
        paymentDueDay: parsedPaymentDue,
        isActive: true,
        createdAt: existing?.createdAt || new Date().toISOString(),
        notes: notes.trim() || undefined,
      };
      onSave(account);
      onClose();
      return;
    }

    const balTrim = balance.trim();
    const isNegBal = balTrim.startsWith('-');
    const balAbs = parseAmount(isNegBal ? balTrim.slice(1) : balTrim);
    const bal = isNegBal ? -balAbs : balAbs;
    if (isNaN(bal)) { setError('Ingresa un saldo válido.'); return; }

    const account: Account = {
      id: existing?.id || `acc_${Date.now()}`,
      name: name.trim(),
      type,
      currency,
      balance: bal,
      initialBalance: existing?.initialBalance ?? bal,
      color,
      icon: typeInfo.icon,
      bankName: bankName.trim() || undefined,
      isActive: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
      notes: notes.trim() || undefined,
    };
    onSave(account);
    onClose();
  };

  return (
    <GlassSheet
      onClose={onClose}
      title={`${existing ? 'Editar' : 'Nueva'} Cuenta`}
      footer={
        <View style={md.footer}>
          {!!error && <InlineNotice variant="error" text={error} />}
          <GlassButton label="Guardar Cuenta" icon="save-outline" onPress={handleSave} />
        </View>
      }
    >
      {/* Tipo de cuenta */}
      <Text style={md.lbl}>TIPO DE CUENTA</Text>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {ACCOUNT_TYPES.map(t => (
            <TouchableOpacity key={t.type} style={[md.typeChip, type === t.type && { borderColor: t.color, backgroundColor: t.color + '22' }]} onPress={() => { setType(t.type); setError(''); }}>
              <Ionicons name={t.icon as any} size={16} color={type === t.type ? t.color : C.textSub} />
              <Text style={[md.typeChipTxt, type === t.type && { color: t.color }]}>{t.label}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <Text style={md.hint}>{typeInfo.desc}</Text>

      {/* Nombre */}
      <Text style={md.lbl}>NOMBRE</Text>
      <TextInput style={md.input} value={name} onChangeText={ch(setName)} placeholder="Ej: BAC Cuenta Monetaria, Efectivo..." placeholderTextColor={C.textMuted} autoFocus />

      {/* Banco (si aplica) */}
      {(type === 'bank' || type === 'credit' || type === 'savings') && (
        <>
          <Text style={md.lbl}>BANCO (Opcional)</Text>
          <TextInput style={md.input} value={bankName} onChangeText={ch(setBankName)} placeholder="Ej: BAC, BANRURAL, GTC..." placeholderTextColor={C.textMuted} />
        </>
      )}

      {/* Moneda y saldo */}
      {type === 'credit' ? (
        <View>
          <Text style={md.lbl}>MONEDA</Text>
          <GlassSegmented options={CURRENCY_OPTIONS} value={currency === 'USD' ? 'USD' : 'Q'} onChange={v => setCurrency(v)} />
        </View>
      ) : (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={md.lbl}>MONEDA</Text>
            <GlassSegmented options={CURRENCY_OPTIONS} value={currency === 'USD' ? 'USD' : 'Q'} onChange={v => setCurrency(v)} />
          </View>
          <View style={{ flex: 2 }}>
            <Text style={md.lbl}>SALDO ACTUAL</Text>
            <View style={md.amtRow}>
              <Text style={md.cur}>{currency}</Text>
              <TextInput style={md.amtInput} value={balance} onChangeText={ch(setBalance)} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
            </View>
          </View>
        </View>
      )}

      {/* Día de corte / día de pago (solo tarjetas) */}
      {type === 'credit' && (
        <View style={{ flexDirection: 'row', gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Text style={md.lbl}>DÍA DE CORTE (Opcional)</Text>
            <TextInput style={md.input} value={cutoffDay} onChangeText={ch(setCutoffDay)} placeholder="Ej: 25" placeholderTextColor={C.textMuted} keyboardType="number-pad" maxLength={2} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={md.lbl}>DÍA DE PAGO (Opcional)</Text>
            <TextInput style={md.input} value={paymentDueDay} onChangeText={ch(setPaymentDueDay)} placeholder="Ej: 10" placeholderTextColor={C.textMuted} keyboardType="number-pad" maxLength={2} />
          </View>
        </View>
      )}

      {/* Color */}
      <Text style={md.lbl}>COLOR</Text>
      <View style={md.colorGrid}>
        {ACCOUNT_COLORS.map(c => (
          <TouchableOpacity key={c} style={[md.colorDot, { backgroundColor: c }, color === c && md.colorDotActive]} onPress={() => setColor(c)}>
            {color === c && <Ionicons name="checkmark" size={14} color={C.text} />}
          </TouchableOpacity>
        ))}
      </View>

      {/* Notas */}
      <Text style={md.lbl}>NOTAS (Opcional)</Text>
      <TextInput style={md.input} value={notes} onChangeText={ch(setNotes)} placeholder="Información adicional..." placeholderTextColor={C.textMuted} />
      <View style={{ height: 16 }} />
    </GlassSheet>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL — TRANSFERENCIA ENTRE CUENTAS
// ─────────────────────────────────────────────────────────────
function TransferModal({ accounts, settings, onSave, onClose }: {
  accounts: Account[];
  settings: UserSettings;
  onSave: (from: string, to: string, amount: number) => void;
  onClose: () => void;
}) {
  const [fromId, setFromId] = useState(accounts[0]?.id || '');
  const [toId, setToId] = useState(accounts[1]?.id || '');
  const [amount, setAmount] = useState('');
  const [notice, setNotice] = useState<{ variant: InlineNoticeVariant; text: string } | null>(null);

  const fromAcc = accounts.find(a => a.id === fromId);
  const toAcc = accounts.find(a => a.id === toId);

  const fxBlocked = !!fromAcc && !!toAcc && !hasReliableConversion(fromAcc.currency, toAcc.currency);
  const fxBlockedText = fxBlocked
    ? `No hay tipo de cambio confiable entre ${fromAcc!.currency} y ${toAcc!.currency}. Solo se puede transferir USD↔Q, o entre cuentas de la misma moneda.`
    : '';

  const previewAmt = parseAmount(amount);
  const showPreview = !!fromAcc && !!toAcc && toAcc.currency !== fromAcc.currency && !isNaN(previewAmt) && previewAmt > 0 && !fxBlocked;
  const convertedPreview = showPreview ? convertAmount(previewAmt, fromAcc!.currency, toAcc!.currency, settings.exchangeRate) : 0;

  const handleSave = () => {
    if (fromId === toId) { setNotice({ variant: 'error', text: 'Las cuentas deben ser diferentes.' }); return; }
    if (fxBlocked) { setNotice({ variant: 'warning', text: fxBlockedText }); return; }
    const amt = parseAmount(amount);
    if (isNaN(amt) || amt <= 0) { setNotice({ variant: 'error', text: 'Ingresa un monto válido.' }); return; }
    if (!fromAcc || fromAcc.balance < amt) { setNotice({ variant: 'error', text: 'Saldo insuficiente en la cuenta origen.' }); return; }
    onSave(fromId, toId, amt);
    onClose();
  };

  const renderAccRow = (acc: Account, selected: boolean, onPress: () => void) => (
    <TouchableOpacity key={acc.id} activeOpacity={0.8} onPress={() => { onPress(); setNotice(null); }}>
      <GlassCard
        radius={12}
        blur={false}
        style={[md.accSelectRow, { borderColor: selected ? acc.color : 'transparent' }]}
        contentStyle={md.accSelectContent}
      >
        <View style={[md.accDot, { backgroundColor: acc.color }]} />
        <Text style={md.accSelectName} numberOfLines={1}>{acc.name}</Text>
        <Text style={md.accSelectBal}>{acc.currency} {acc.balance.toFixed(2)}</Text>
        {selected && <Ionicons name="checkmark-circle" size={18} color={acc.color} />}
      </GlassCard>
    </TouchableOpacity>
  );

  return (
    <GlassSheet
      onClose={onClose}
      title="Transferencia entre Cuentas"
      footer={
        <View style={md.footer}>
          {fxBlocked
            ? <InlineNotice variant="warning" text={fxBlockedText} />
            : !!notice && <InlineNotice variant={notice.variant} text={notice.text} />}
          <GlassButton label="Transferir" icon="swap-horizontal-outline" onPress={handleSave} disabled={fxBlocked} />
        </View>
      }
    >
      <Text style={md.hint}>Mover dinero entre tus cuentas no cuenta como gasto ni ingreso.</Text>

      <Text style={md.lbl}>DESDE</Text>
      {accounts.map(acc => renderAccRow(acc, fromId === acc.id, () => setFromId(acc.id)))}

      <View style={md.transferArrow}>
        <Ionicons name="arrow-down" size={24} color={C.primary} />
      </View>

      <Text style={md.lbl}>HACIA</Text>
      {accounts.filter(a => a.id !== fromId).map(acc => renderAccRow(acc, toId === acc.id, () => setToId(acc.id)))}

      <Text style={[md.lbl, { marginTop: 16 }]}>MONTO</Text>
      <View style={md.amtRow}>
        <Text style={md.cur}>{fromAcc?.currency || 'Q'}</Text>
        <TextInput style={md.amtInput} value={amount} onChangeText={v => { setAmount(v); setNotice(null); }} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" autoFocus />
      </View>
      {showPreview && (
        <Text style={[md.hint, { marginTop: 8 }]}>
          Se acreditarán {toAcc!.currency} {convertedPreview.toFixed(2)} en {toAcc!.name} (tipo de cambio Q {settings.exchangeRate}/USD)
        </Text>
      )}
      <View style={{ height: 16 }} />
    </GlassSheet>
  );
}

// ─────────────────────────────────────────────────────────────
// PANTALLA PRINCIPAL
// ─────────────────────────────────────────────────────────────
interface Props {
  accounts: Account[];
  setAccounts: (a: Account[]) => void;
  creditInstallments: CreditInstallment[];
  setCreditInstallments: (i: CreditInstallment[]) => void;
  transactions: Transaction[];
  setTransactions: (t: Transaction[]) => void;
  settings: UserSettings;
  onClose: () => void;
}

export default function AccountsScreen({
  accounts, setAccounts, creditInstallments, setCreditInstallments,
  transactions, setTransactions, settings, onClose,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: winH } = useWindowDimensions();
  const dialog = useGlassDialog();

  const [activeTab, setActiveTab] = useState<'accounts' | 'installments'>('accounts');
  const [showAccModal, setShowAccModal] = useState(false);
  const [showInstModal, setShowInstModal] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editingAcc, setEditingAcc] = useState<Account | undefined>();
  const [editingInst, setEditingInst] = useState<CreditInstallment | undefined>();

  // ── Tutorial ──────────────────────────────────────────────
  const rootRef = useTutorialRef('accounts_root');
  const headerRef = useTutorialRef('accounts_header');
  const summaryRef = useTutorialRef('accounts_summary');
  const listRef = useTutorialRef('accounts_list');
  const fabRef = useTutorialRef('accounts_fab');
  const transferBtnRef = useTutorialRef('accounts_transfer_btn');
  const tabsRef = useTutorialRef('accounts_tabs');
  const instListRef = useTutorialRef('accounts_inst_list');
  const tutScroll = useTutorialScroll('accounts');
  useTutorialAction('accounts:setTab', arg => setActiveTab(arg === 'installments' ? 'installments' : 'accounts'));

  // ── Animación de entrada (reemplaza al slide del Modal) ───
  const translateY = useRef(new Animated.Value(winH)).current;
  useEffect(() => {
    Animated.spring(translateY, { toValue: 0, friction: 8, useNativeDriver: true }).start();
  }, [translateY]);

  // ── Botón Atrás de Android (cede si hay un tutorial activo) ─
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (isTutorialActive()) return false;
      onCloseRef.current();
      return true;
    });
    return () => sub.remove();
  }, []);

  const fmt = (n: number, cur: Currency = 'Q') =>
    `${cur} ${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  // ── Patrimonio neto ──────────────────────────────────────
  const { totalQ, totalUSD, totalEUR, totalGBP } = calcNetWorthFromAccounts(accounts, settings.exchangeRate);
  const { installmentsPendingQ } = calcCreditCommitments(creditInstallments, settings.exchangeRate);
  const totalAssets = totalQ + convertAmount(totalUSD, 'USD', 'Q', settings.exchangeRate);
  const monthlyInstTotal = getMonthlyInstallmentTotal(creditInstallments, settings.exchangeRate);

  const activeAccounts = accounts.filter(a => a.isActive);
  const activeInstallments = creditInstallments.filter(i => i.isActive);

  // ── Handlers Cuentas ─────────────────────────────────────
  const handleSaveAccount = async (account: Account) => {
    const isNew = !accounts.find(a => a.id === account.id);
    try {
      const updated = isNew
        ? await StorageService.addAccount(account)
        : await StorageService.updateAccount(account);
      setAccounts(updated);
    } catch (e) {
      console.warn('[AccountsScreen] No se pudo guardar la cuenta:', e);
      void dialog.alert({ variant: 'error', title: 'No se pudo guardar', message: 'No se pudo guardar la cuenta. Intenta de nuevo.' });
    }
  };

  const handleDeleteAccount = async (id: string) => {
    const ok = await dialog.confirm({
      title: 'Eliminar cuenta',
      message: 'Las visacuotas asociadas se desactivarán.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;

    const updated = await StorageService.deleteAccount(id);
    setAccounts(updated);

    const affected = creditInstallments.filter(i => i.accountId === id && i.isActive);
    let updatedInstallments = creditInstallments;
    for (const inst of affected) {
      updatedInstallments = await StorageService.updateCreditInstallment({ ...inst, isActive: false });
    }
    if (affected.length > 0) {
      setCreditInstallments(updatedInstallments);
    }
  };

  // ── Handlers Visacuotas ───────────────────────────────────
  const handleSaveInstallment = async (item: CreditInstallment) => {
    const existing = creditInstallments.find(i => i.id === item.id);
    const isNew = !existing;
    const updated = isNew
      ? await StorageService.addCreditInstallment(item)
      : await StorageService.updateCreditInstallment(item);
    setCreditInstallments(updated);
  };

  const handleDeleteInstallment = async (id: string) => {
    const ok = await dialog.confirm({
      title: 'Eliminar visacuota',
      message: 'Esta visacuota se borrará de forma permanente.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    const updated = await StorageService.deleteCreditInstallment(id);
    setCreditInstallments(updated);
  };

  // ── Handler Transferencia ─────────────────────────────────
  const handleTransfer = async (fromId: string, toId: string, amount: number) => {
    const fromAcc = accounts.find(a => a.id === fromId);
    const toAcc = accounts.find(a => a.id === toId);
    if (!fromAcc || !toAcc) return;
    if (!hasReliableConversion(fromAcc.currency, toAcc.currency)) return;

    const amountToCredit = convertAmount(amount, fromAcc.currency, toAcc.currency, settings.exchangeRate);
    const accs = await StorageService.transferBetweenAccounts(fromId, toId, -amount, amountToCredit);
    setAccounts(accs);

    // Registrar como transacción de transferencia
    const description = fromAcc.currency !== toAcc.currency
      ? `Transferencia: ${fromAcc.name} → ${toAcc.name} (${fromAcc.currency} ${amount.toFixed(2)} → ${toAcc.currency} ${amountToCredit.toFixed(2)})`
      : `Transferencia: ${fromAcc.name} → ${toAcc.name}`;
    const tx: Transaction = {
      id: `transfer_${Date.now()}`,
      amount,
      description,
      category: 'transfer',
      date: new Date().toISOString(),
      type: 'transfer',
      source: 'manual',
      currency: fromAcc.currency,
      fromAccountId: fromId,
      toAccountId: toId,
    };
    const txUpdated = await StorageService.addTransaction(tx);
    setTransactions(txUpdated);
  };

  return (
    <Animated.View
      ref={rootRef}
      collapsable={false}
      style={[StyleSheet.absoluteFill, s.root, { transform: [{ translateY }] }]}
    >
      {/* HEADER */}
      <View style={s.headerWrap}>
        <ScreenHeader
          compact
          title="Mis Cuentas"
          headerRef={headerRef}
          left={
            <TouchableOpacity
              onPress={onClose}
              style={s.backBtn}
              accessibilityRole="button"
              accessibilityLabel="Cerrar Mis Cuentas"
            >
              <GlassBackground radius={18} blur={false} />
              <Ionicons name="chevron-down" size={22} color={C.textSub} />
            </TouchableOpacity>
          }
          right={
            <>
              <View ref={transferBtnRef} collapsable={false}>
                <TouchableOpacity style={s.transferBtn} onPress={() => setShowTransfer(true)} accessibilityRole="button" accessibilityLabel="Transferir entre cuentas">
                  <GlassBackground radius={18} blur={false} />
                  <Ionicons name="swap-horizontal-outline" size={18} color={C.primaryLight} />
                  <Text style={s.transferBtnTxt} numberOfLines={1}>Transferir</Text>
                </TouchableOpacity>
              </View>
              <HelpButton tutorialId="tutorial_cuentas" />
            </>
          }
        />
      </View>

      {/* RESUMEN PATRIMONIO */}
      <View ref={summaryRef} collapsable={false} style={s.summaryWrap}>
        <GlassCard radius={20} blur={false} contentStyle={s.summaryContent}>
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={s.summaryLbl}>ACTIVOS</Text>
              <Text style={[s.summaryVal, { color: C.income }]}>Q {totalAssets.toFixed(0)}</Text>
              {(totalEUR !== 0 || totalGBP !== 0) && (
                <Text style={s.summarySub}>
                  + {[totalEUR !== 0 ? `EUR ${totalEUR.toFixed(0)}` : null, totalGBP !== 0 ? `£ ${totalGBP.toFixed(0)}` : null].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryLbl}>VISACUOTAS PEND.</Text>
              <Text style={[s.summaryVal, { color: C.warning }]}>Q {installmentsPendingQ.toFixed(0)}</Text>
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryLbl}>NETO Q</Text>
              <Text style={[s.summaryVal, { color: totalQ >= 0 ? C.textPrimary : C.danger }]}>
                {totalQ < 0 ? '-' : ''}Q {Math.abs(totalQ).toFixed(0)}
              </Text>
            </View>
          </View>
          {totalUSD !== 0 && (
            <View style={[s.summaryRow, s.summaryRowSep]}>
              <View style={s.summaryItem}>
                <Text style={s.summaryLbl}>NETO USD</Text>
                <Text style={[s.summaryVal, { color: totalUSD >= 0 ? C.fx : C.danger }]}>
                  {totalUSD < 0 ? '-' : ''}USD {Math.abs(totalUSD).toFixed(2)}
                </Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLbl}>CUOTAS/MES</Text>
                <Text style={[s.summaryVal, { color: C.warning }]}>Q {monthlyInstTotal.toFixed(0)}</Text>
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLbl}>TIPO CAMBIO</Text>
                <Text style={[s.summaryVal, { color: C.textSub, fontSize: 13 }]}>Q {settings.exchangeRate}/USD</Text>
              </View>
            </View>
          )}
          {(totalEUR !== 0 || totalGBP !== 0) && (
            <View style={[s.summaryRow, s.summaryRowSep]}>
              {totalEUR !== 0 && (
                <View style={s.summaryItem}>
                  <Text style={s.summaryLbl}>NETO EUR</Text>
                  <Text style={[s.summaryVal, { color: totalEUR >= 0 ? C.fx : C.danger }]}>
                    {totalEUR < 0 ? '-' : ''}EUR {Math.abs(totalEUR).toFixed(2)}
                  </Text>
                </View>
              )}
              {totalEUR !== 0 && totalGBP !== 0 && <View style={s.summaryDivider} />}
              {totalGBP !== 0 && (
                <View style={s.summaryItem}>
                  <Text style={s.summaryLbl}>NETO £</Text>
                  <Text style={[s.summaryVal, { color: totalGBP >= 0 ? C.fx : C.danger }]}>
                    {totalGBP < 0 ? '-' : ''}£ {Math.abs(totalGBP).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </GlassCard>
      </View>

      {/* TABS INTERNOS */}
      <GlassSegmented
        containerRef={tabsRef}
        style={s.tabs}
        value={activeTab}
        onChange={setActiveTab}
        options={[
          { value: 'accounts', label: `Cuentas (${activeAccounts.length})` },
          { value: 'installments', label: `Visacuotas (${activeInstallments.length})` },
        ]}
      />

      {/* CONTENIDO */}
      <ScrollView
        ref={tutScroll.ref}
        onScroll={tutScroll.onScroll}
        scrollEventThrottle={tutScroll.scrollEventThrottle}
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
      >
        {activeTab === 'accounts' ? (
          <View ref={listRef} collapsable={false}>
            {activeAccounts.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="wallet-outline" size={48} color={C.textMuted} />
                <Text style={s.emptyTitle}>Sin cuentas registradas</Text>
                <Text style={s.emptyDesc}>Agrega tus cuentas bancarias, efectivo, tarjetas e inversiones para un panorama completo de tu patrimonio.</Text>
              </View>
            ) : (
              activeAccounts.map(acc => {
                const typeInfo = ACCOUNT_TYPES.find(t => t.type === acc.type)!;
                const isCredit = acc.type === 'credit';
                const monthlyTotal = isCredit ? getAccountMonthlyInstallmentTotal(creditInstallments, acc.id, settings.exchangeRate, acc.currency) : 0;
                const cutoffPaymentLabel = isCredit && (acc.cutoffDay || acc.paymentDueDay)
                  ? [
                      acc.cutoffDay ? `Corte: día ${acc.cutoffDay}` : null,
                      acc.paymentDueDay ? `Pago: día ${acc.paymentDueDay}` : null,
                    ].filter(Boolean).join(' · ')
                  : null;

                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={s.cardWrap}
                    onLongPress={() => { setEditingAcc(acc); setShowAccModal(true); }}
                    activeOpacity={0.85}
                  >
                    <GlassCard radius={16} blur={false} leftAccentColor={acc.color} contentStyle={s.accRow}>
                      <View style={[s.accIcon, { backgroundColor: acc.color + '22' }]}>
                        <Ionicons name={typeInfo.icon as any} size={22} color={acc.color} />
                      </View>
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <View style={s.nameRow}>
                          <Text style={s.accName} numberOfLines={1}>{acc.name}</Text>
                          {acc.bankName && (
                            <View style={[s.bankBadge, { backgroundColor: acc.color + '22' }]}>
                              <Text style={[s.bankBadgeTxt, { color: acc.color }]}>{acc.bankName}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={s.accType}>{typeInfo.label}</Text>
                        {isCredit && cutoffPaymentLabel && (
                          <Text style={s.accExtra}>{cutoffPaymentLabel}</Text>
                        )}
                        {isCredit && monthlyTotal > 0 && (
                          <Text style={[s.accExtra, { color: C.warning }]}>
                            Cuota mensual: {acc.currency} {monthlyTotal.toFixed(2)}
                          </Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        {isCredit ? (
                          monthlyTotal > 0 ? (
                            <Text style={[s.accBalance, { color: C.warning }]}>{acc.currency} {monthlyTotal.toFixed(2)}</Text>
                          ) : (
                            <Text style={s.noInst}>Sin cuotas activas</Text>
                          )
                        ) : (
                          <Text style={[s.accBalance, { color: acc.color }]}>
                            {fmt(acc.balance, acc.currency)}
                          </Text>
                        )}
                        <TouchableOpacity
                          onPress={() => handleDeleteAccount(acc.id)}
                          style={s.deleteBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Eliminar cuenta ${acc.name}`}
                        >
                          <Ionicons name="trash-outline" size={14} color={C.danger} />
                        </TouchableOpacity>
                      </View>
                    </GlassCard>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        ) : (
          <View ref={instListRef} collapsable={false}>
            {activeInstallments.length === 0 ? (
              <View style={s.empty}>
                <Ionicons name="card-outline" size={48} color={C.textMuted} />
                <Text style={s.emptyTitle}>Sin visacuotas</Text>
                <Text style={s.emptyDesc}>Registra tus compras en cuotas. La app descontará automáticamente cada mes y te mostrará cuánto te falta para terminar de pagar.</Text>
              </View>
            ) : (
              activeInstallments.map(item => {
                const acc = accounts.find(a => a.id === item.accountId);
                const remaining = item.totalInstallments - item.paidInstallments;
                const pct = (item.paidInstallments / item.totalInstallments) * 100;
                const endDate = parseDateOnly(storedDateToDateOnly(item.startDate)) ?? new Date(item.startDate);
                endDate.setMonth(endDate.getMonth() + item.totalInstallments);

                return (
                  <View key={item.id} style={s.cardWrap}>
                    <GlassCard radius={16} blur={false} leftAccentColor={acc?.color || C.primary} contentStyle={s.instContent}>
                      <View style={s.instHeader}>
                        <Text style={s.instName}>{item.name}</Text>
                        <Text style={[s.instBalance, { color: C.expense }]}>
                          {item.currency} {item.totalAmount.toFixed(2)}
                        </Text>
                      </View>
                      {acc && (
                        <View style={s.instAccRow}>
                          <Ionicons name="card-outline" size={12} color={acc.color} />
                          <Text style={[s.instAccTxt, { color: acc.color }]}>{acc.name}</Text>
                        </View>
                      )}
                      <AnimBar pct={pct} color={acc?.color || C.primary} />
                      <View style={s.instStats}>
                        <View style={s.instStat}>
                          <Text style={s.instStatVal}>{item.currency} {item.monthlyPayment.toFixed(2)}</Text>
                          <Text style={s.instStatLbl}>CUOTA/MES</Text>
                        </View>
                        <View style={s.instStat}>
                          <Text style={s.instStatVal}>{item.paidInstallments}/{item.totalInstallments}</Text>
                          <Text style={s.instStatLbl}>PAGADAS</Text>
                        </View>
                        <View style={s.instStat}>
                          <Text style={s.instStatVal}>{remaining}</Text>
                          <Text style={s.instStatLbl}>RESTANTES</Text>
                        </View>
                        <View style={s.instStat}>
                          <Text style={s.instStatVal}>{endDate.toLocaleDateString('es-GT', { month: 'short', year: '2-digit' })}</Text>
                          <Text style={s.instStatLbl}>FIN</Text>
                        </View>
                      </View>
                      <View style={s.instActions}>
                        <TouchableOpacity
                          onPress={() => { setEditingInst(item); setShowInstModal(true); }}
                          style={s.deleteBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Editar visacuota ${item.name}`}
                        >
                          <Ionicons name="pencil-outline" size={14} color={C.primaryLight} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteInstallment(item.id)}
                          style={s.deleteBtn}
                          accessibilityRole="button"
                          accessibilityLabel={`Eliminar visacuota ${item.name}`}
                        >
                          <Ionicons name="trash-outline" size={14} color={C.danger} />
                        </TouchableOpacity>
                      </View>
                    </GlassCard>
                  </View>
                );
              })
            )}
          </View>
        )}
        <View style={{ height: 100 + insets.bottom }} />
      </ScrollView>

      {/* FAB (un solo elemento visible en ambas pestañas) */}
      <View ref={fabRef} collapsable={false} style={[s.fabWrap, { bottom: insets.bottom + 20 }]}>
        <TouchableOpacity
          style={s.fab}
          accessibilityRole="button"
          accessibilityLabel={activeTab === 'accounts' ? 'Agregar cuenta' : 'Agregar visacuota'}
          onPress={() => {
            if (activeTab === 'accounts') { setEditingAcc(undefined); setShowAccModal(true); }
            else { setEditingInst(undefined); setShowInstModal(true); }
          }}
        >
          <Ionicons name="add" size={28} color={C.onPrimary} />
        </TouchableOpacity>
      </View>

      {/* MODALES */}
      {showAccModal && (
        <AccountModal
          existing={editingAcc}
          defaultCurrency={settings.currency}
          onSave={handleSaveAccount}
          onClose={() => { setShowAccModal(false); setEditingAcc(undefined); }}
        />
      )}
      {showInstModal && (
        <InstallmentModal accounts={accounts} existing={editingInst} onSave={handleSaveInstallment} onClose={() => { setShowInstModal(false); setEditingInst(undefined); }} />
      )}
      {showTransfer && accounts.filter(a => a.isActive && a.type !== 'credit').length >= 2 && (
        <TransferModal accounts={accounts.filter(a => a.isActive && a.type !== 'credit')} settings={settings} onSave={handleTransfer} onClose={() => setShowTransfer(false)} />
      )}
    </Animated.View>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  root: { zIndex: 50, elevation: 50, backgroundColor: C.bg },
  headerWrap: { paddingHorizontal: 16 },
  backBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', overflow: 'hidden', flexShrink: 0 },
  transferBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 36, paddingHorizontal: 12, borderRadius: 18, overflow: 'hidden' },
  transferBtnTxt: { color: C.primaryLight, fontSize: 12, fontWeight: '700', flexShrink: 1 },

  summaryWrap: { marginHorizontal: 16, marginBottom: 16 },
  summaryContent: { padding: 16 },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryRowSep: { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.glassBorder },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLbl: { color: C.textSub, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4, textAlign: 'center' },
  summaryVal: { fontSize: 15, fontWeight: '900', color: C.textPrimary },
  summarySub: { color: C.textSub, fontSize: 10, marginTop: 2 },
  summaryDivider: { width: 1, height: 32, backgroundColor: C.glassBorder, marginHorizontal: 8 },

  tabs: { marginHorizontal: 16, marginBottom: 16 },

  cardWrap: { marginHorizontal: 16, marginBottom: 10 },
  accRow: { flexDirection: 'row', alignItems: 'center', padding: 14, paddingLeft: 17 },
  accIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  accName: { color: C.textPrimary, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  accType: { color: C.textSub, fontSize: 11, marginTop: 2 },
  accExtra: { color: C.textSub, fontSize: 10, marginTop: 3 },
  noInst: { color: C.textSub, fontSize: 12, marginBottom: 4 },
  accBalance: { fontSize: 16, fontWeight: '900', marginBottom: 4 },
  bankBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bankBadgeTxt: { fontSize: 9, fontWeight: '800' },
  deleteBtn: { padding: 6, borderRadius: 8, backgroundColor: C.danger + '11' },

  instContent: { padding: 14, paddingLeft: 17 },
  instHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  instName: { color: C.textPrimary, fontSize: 15, fontWeight: '800', flex: 1 },
  instBalance: { fontSize: 14, fontWeight: '800' },
  instAccRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  instAccTxt: { fontSize: 11, fontWeight: '700' },
  instStats: { flexDirection: 'row', marginTop: 10 },
  instStat: { flex: 1, alignItems: 'center' },
  instStatVal: { color: C.textPrimary, fontSize: 12, fontWeight: '800' },
  instStatLbl: { color: C.textSub, fontSize: 10, letterSpacing: 1, marginTop: 2 },
  instActions: { flexDirection: 'row', gap: 8, alignSelf: 'flex-end', marginTop: 8 },
  barTrack: { height: 6, backgroundColor: C.glassInput, borderRadius: 3, overflow: 'hidden', marginTop: 8 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '800' },
  emptyDesc: { color: C.textSub, fontSize: 13, textAlign: 'center', lineHeight: 20 },

  fabWrap: { position: 'absolute', right: 16, width: 58, height: 58 },
  fab: { width: 58, height: 58, borderRadius: 29, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: C.primaryLight },
});

const md = StyleSheet.create({
  footer: { gap: 10, paddingTop: 12 },
  lbl: { color: C.textSub, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8, marginTop: 14 },
  hint: { color: C.textSub, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  input: { backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, padding: 14, color: C.text, fontSize: 15 },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, paddingHorizontal: 14, paddingVertical: 10 },
  amtInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: '700' },
  cur: { color: C.textSub, fontSize: 16, fontWeight: '700', marginRight: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
  typeChipTxt: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderWidth: 3, borderColor: C.text },

  accSelectRow: { borderWidth: 1, marginBottom: 8 },
  accSelectContent: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  accDot: { width: 12, height: 12, borderRadius: 6 },
  accSelectName: { flex: 1, color: C.text, fontSize: 14, fontWeight: '700' },
  accSelectBal: { color: C.textSub, fontSize: 12 },
  transferArrow: { alignItems: 'center', paddingVertical: 8 },
});
