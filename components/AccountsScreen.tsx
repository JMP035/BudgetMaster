import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  Alert, Animated, Easing, KeyboardAvoidingView,
  Modal, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View
} from "react-native";
import {
  Account, AccountType, CreditInstallment,
  Currency, StorageService, Transaction, UserSettings,
  calcCreditCommitments, calcNetWorthFromAccounts, convertAmount,
  getAccountMonthlyInstallmentTotal, getMonthlyInstallmentTotal
} from "../services/storage";
import { EXPENSE_CATEGORIES } from "../categories";
import { C, shadow } from "../theme";
import InstallmentModal from "./InstallmentModal";

// ─────────────────────────────────────────────────────────────
// CONFIGURACIÓN DE TIPOS DE CUENTA
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
    <View style={{ height: 6, backgroundColor: C.bgDeep, borderRadius: 3, overflow: 'hidden', marginTop: 8 }}>
      <Animated.View style={{ height: '100%', width: w, backgroundColor: color, borderRadius: 3 }} />
    </View>
  );
}

// ─────────────────────────────────────────────────────────────
// MODAL — NUEVA CUENTA
// ─────────────────────────────────────────────────────────────
export function AccountModal({ onSave, onClose, existing, defaultType }: {
  onSave: (a: Account) => void; onClose: () => void; existing?: Account; defaultType?: AccountType;
}) {
  const [name, setName] = useState(existing?.name || '');
  const [type, setType] = useState<AccountType>(existing?.type || defaultType || 'bank');
  const [currency, setCurrency] = useState<Currency>(existing?.currency || 'Q');
  const [balance, setBalance] = useState(existing?.balance.toString() || '0');
  const [color, setColor] = useState(existing?.color || ACCOUNT_COLORS[0]);
  const [bankName, setBankName] = useState(existing?.bankName || '');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [cutoffDay, setCutoffDay] = useState(existing?.cutoffDay?.toString() || '');
  const [paymentDueDay, setPaymentDueDay] = useState(existing?.paymentDueDay?.toString() || '');

  const typeInfo = ACCOUNT_TYPES.find(t => t.type === type)!;

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Error', 'Ingresa el nombre de la cuenta.'); return; }

    if (type === 'credit') {
      let parsedCutoff: number | undefined;
      let parsedPaymentDue: number | undefined;
      if (cutoffDay.trim()) {
        parsedCutoff = parseInt(cutoffDay, 10);
        if (isNaN(parsedCutoff) || parsedCutoff < 1 || parsedCutoff > 31) {
          Alert.alert('Error', 'El día de corte debe ser un número entre 1 y 31.');
          return;
        }
      }
      if (paymentDueDay.trim()) {
        parsedPaymentDue = parseInt(paymentDueDay, 10);
        if (isNaN(parsedPaymentDue) || parsedPaymentDue < 1 || parsedPaymentDue > 31) {
          Alert.alert('Error', 'El día de pago debe ser un número entre 1 y 31.');
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

    const bal = parseFloat(balance.replace(',', '.'));
    if (isNaN(bal)) { Alert.alert('Error', 'Ingresa un saldo válido.'); return; }

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
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={md.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
          <View style={md.sheet}>
            <View style={md.header}>
              <Text style={md.title}>{existing ? 'Editar' : 'Nueva'} Cuenta</Text>
              <TouchableOpacity onPress={onClose} style={md.closeBtn}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {/* Tipo de cuenta */}
              <Text style={md.lbl}>TIPO DE CUENTA</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                  {ACCOUNT_TYPES.map(t => (
                    <TouchableOpacity key={t.type} style={[md.typeChip, type === t.type && { borderColor: t.color, backgroundColor: t.color + '22' }]} onPress={() => setType(t.type)}>
                      <Ionicons name={t.icon as any} size={16} color={type === t.type ? t.color : C.textMuted} />
                      <Text style={[md.typeChipTxt, type === t.type && { color: t.color }]}>{t.label}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
              <Text style={md.hint}>{typeInfo.desc}</Text>

              {/* Nombre */}
              <Text style={md.lbl}>NOMBRE</Text>
              <TextInput style={md.input} value={name} onChangeText={setName} placeholder="Ej: BAC Cuenta Monetaria, Efectivo..." placeholderTextColor={C.textMuted} autoFocus />

              {/* Banco (si aplica) */}
              {(type === 'bank' || type === 'credit' || type === 'savings') && (
                <>
                  <Text style={md.lbl}>BANCO (Opcional)</Text>
                  <TextInput style={md.input} value={bankName} onChangeText={setBankName} placeholder="Ej: BAC, BANRURAL, GTC..." placeholderTextColor={C.textMuted} />
                </>
              )}

              {/* Moneda y saldo */}
              {type === 'credit' ? (
                <View>
                  <Text style={md.lbl}>MONEDA</Text>
                  <View style={{ flexDirection: 'row', gap: 6 }}>
                    {(['Q', 'USD'] as Currency[]).map(c => (
                      <TouchableOpacity key={c} style={[md.currBtn, currency === c && md.currBtnActive]} onPress={() => setCurrency(c)}>
                        <Text style={[md.currTxt, currency === c && { color: C.primaryLight }]}>{c}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              ) : (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={md.lbl}>MONEDA</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                      {(['Q', 'USD'] as Currency[]).map(c => (
                        <TouchableOpacity key={c} style={[md.currBtn, currency === c && md.currBtnActive]} onPress={() => setCurrency(c)}>
                          <Text style={[md.currTxt, currency === c && { color: C.primaryLight }]}>{c}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </View>
                  <View style={{ flex: 2 }}>
                    <Text style={md.lbl}>SALDO ACTUAL</Text>
                    <View style={md.amtRow}>
                      <Text style={md.cur}>{currency}</Text>
                      <TextInput style={md.amtInput} value={balance} onChangeText={setBalance} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
                    </View>
                  </View>
                </View>
              )}

              {/* Día de corte / día de pago (solo tarjetas) */}
              {type === 'credit' && (
                <View style={{ flexDirection: 'row', gap: 12 }}>
                  <View style={{ flex: 1 }}>
                    <Text style={md.lbl}>DÍA DE CORTE (Opcional)</Text>
                    <TextInput style={md.input} value={cutoffDay} onChangeText={setCutoffDay} placeholder="Ej: 25" placeholderTextColor={C.textMuted} keyboardType="number-pad" maxLength={2} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={md.lbl}>DÍA DE PAGO (Opcional)</Text>
                    <TextInput style={md.input} value={paymentDueDay} onChangeText={setPaymentDueDay} placeholder="Ej: 10" placeholderTextColor={C.textMuted} keyboardType="number-pad" maxLength={2} />
                  </View>
                </View>
              )}

              {/* Color */}
              <Text style={md.lbl}>COLOR</Text>
              <View style={md.colorGrid}>
                {ACCOUNT_COLORS.map(c => (
                  <TouchableOpacity key={c} style={[md.colorDot, { backgroundColor: c }, color === c && md.colorDotActive]} onPress={() => setColor(c)}>
                    {color === c && <Ionicons name="checkmark" size={14} color="#fff" />}
                  </TouchableOpacity>
                ))}
              </View>

              {/* Notas */}
              <Text style={md.lbl}>NOTAS (Opcional)</Text>
              <TextInput style={md.input} value={notes} onChangeText={setNotes} placeholder="Información adicional..." placeholderTextColor={C.textMuted} />

              <TouchableOpacity style={md.saveBtn} onPress={handleSave}>
                <Ionicons name="save-outline" size={20} color="#1A0E00" />
                <Text style={md.saveBtnTxt}>Guardar Cuenta</Text>
              </TouchableOpacity>
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
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

  const fromAcc = accounts.find(a => a.id === fromId);
  const toAcc = accounts.find(a => a.id === toId);

  const previewAmt = parseFloat(amount.replace(',', '.'));
  const showPreview = !!fromAcc && !!toAcc && toAcc.currency !== fromAcc.currency && !isNaN(previewAmt) && previewAmt > 0;
  const convertedPreview = showPreview ? convertAmount(previewAmt, fromAcc!.currency, toAcc!.currency, settings.exchangeRate) : 0;

  const handleSave = () => {
    if (fromId === toId) { Alert.alert('Error', 'Las cuentas deben ser diferentes.'); return; }
    const amt = parseFloat(amount.replace(',', '.'));
    if (isNaN(amt) || amt <= 0) { Alert.alert('Error', 'Ingresa un monto válido.'); return; }
    if (!fromAcc || fromAcc.balance < amt) { Alert.alert('Error', 'Saldo insuficiente en la cuenta origen.'); return; }
    onSave(fromId, toId, amt);
    onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={md.overlay}>
        <View style={md.sheet}>
          <View style={md.header}>
            <Text style={md.title}>Transferencia entre Cuentas</Text>
            <TouchableOpacity onPress={onClose} style={md.closeBtn}>
              <Ionicons name="close" size={22} color={C.textMuted} />
            </TouchableOpacity>
          </View>

          <Text style={md.hint}>Mover dinero entre tus cuentas no cuenta como gasto ni ingreso.</Text>

          <Text style={md.lbl}>DESDE</Text>
          {accounts.map(acc => (
            <TouchableOpacity key={acc.id} style={[s.accSelectRow, fromId === acc.id && { borderColor: acc.color }]} onPress={() => setFromId(acc.id)}>
              <View style={[s.accDot, { backgroundColor: acc.color }]} />
              <Text style={s.accSelectName}>{acc.name}</Text>
              <Text style={s.accSelectBal}>{acc.currency} {acc.balance.toFixed(2)}</Text>
              {fromId === acc.id && <Ionicons name="checkmark-circle" size={18} color={acc.color} />}
            </TouchableOpacity>
          ))}

          <View style={s.transferArrow}>
            <Ionicons name="arrow-down" size={24} color={C.primary} />
          </View>

          <Text style={md.lbl}>HACIA</Text>
          {accounts.filter(a => a.id !== fromId).map(acc => (
            <TouchableOpacity key={acc.id} style={[s.accSelectRow, toId === acc.id && { borderColor: acc.color }]} onPress={() => setToId(acc.id)}>
              <View style={[s.accDot, { backgroundColor: acc.color }]} />
              <Text style={s.accSelectName}>{acc.name}</Text>
              <Text style={s.accSelectBal}>{acc.currency} {acc.balance.toFixed(2)}</Text>
              {toId === acc.id && <Ionicons name="checkmark-circle" size={18} color={acc.color} />}
            </TouchableOpacity>
          ))}

          <Text style={[md.lbl, { marginTop: 16 }]}>MONTO</Text>
          <View style={md.amtRow}>
            <Text style={md.cur}>{fromAcc?.currency || 'Q'}</Text>
            <TextInput style={md.amtInput} value={amount} onChangeText={setAmount} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" autoFocus />
          </View>
          {showPreview && (
            <Text style={md.hint}>
              Se acreditarán {toAcc!.currency} {convertedPreview.toFixed(2)} en {toAcc!.name} (tipo de cambio Q {settings.exchangeRate}/USD)
            </Text>
          )}

          <TouchableOpacity style={[md.saveBtn, { marginTop: 20 }]} onPress={handleSave}>
            <Ionicons name="swap-horizontal-outline" size={20} color="#1A0E00" />
            <Text style={md.saveBtnTxt}>Transferir</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
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
  const [activeTab, setActiveTab] = useState<'accounts' | 'installments'>('accounts');
  const [showAccModal, setShowAccModal] = useState(false);
  const [showInstModal, setShowInstModal] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editingAcc, setEditingAcc] = useState<Account | undefined>();
  const [editingInst, setEditingInst] = useState<CreditInstallment | undefined>();

  const fmt = (n: number, cur: Currency = 'Q') =>
    `${cur} ${Math.abs(n).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',')}`;

  // ── Patrimonio neto ──────────────────────────────────────
  const { totalQ, totalUSD, totalEUR, totalGBP } = calcNetWorthFromAccounts(accounts, settings.exchangeRate);
  const { installmentsPendingQ } = calcCreditCommitments(creditInstallments, settings.exchangeRate);
  const totalAssets = accounts.filter(a => a.type !== 'credit' && a.isActive).reduce((s, a) => {
    if (a.currency === 'Q') return s + a.balance;
    if (a.currency === 'USD') return s + a.balance * settings.exchangeRate;
    return s;
  }, 0);
  const monthlyInstTotal = getMonthlyInstallmentTotal(creditInstallments);

  // ── Handlers Cuentas ─────────────────────────────────────
  const handleSaveAccount = async (account: Account) => {
    const isNew = !accounts.find(a => a.id === account.id);
    const updated = isNew
      ? await StorageService.addAccount(account)
      : await StorageService.updateAccount(account);
    setAccounts(updated);
  };

  const handleDeleteAccount = (id: string) => {
    Alert.alert('Eliminar', '¿Borrar esta cuenta? Las visacuotas asociadas se desactivarán.', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
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
        }
      },
    ]);
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

  const handleDeleteInstallment = (id: string) => {
    Alert.alert('Eliminar', '¿Borrar esta visacuota?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Eliminar', style: 'destructive', onPress: async () => {
          const updated = await StorageService.deleteCreditInstallment(id);
          setCreditInstallments(updated);
        }
      },
    ]);
  };

  // ── Handler Transferencia ─────────────────────────────────
  const handleTransfer = async (fromId: string, toId: string, amount: number) => {
    const fromAcc = accounts.find(a => a.id === fromId);
    const toAcc = accounts.find(a => a.id === toId);
    if (!fromAcc || !toAcc) return;

    await StorageService.adjustAccountBalance(fromId, -amount);
    const amountToCredit = convertAmount(amount, fromAcc.currency, toAcc.currency, settings.exchangeRate);
    await StorageService.adjustAccountBalance(toId, amountToCredit);
    const accs = await StorageService.getAccounts();
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
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <View style={s.screen}>
        {/* HEADER */}
        <View style={s.header}>
          <TouchableOpacity onPress={onClose} style={s.backBtn}>
            <Ionicons name="chevron-down" size={24} color={C.textSub} />
          </TouchableOpacity>
          <Text style={s.headerTitle}>Mis Cuentas</Text>
          <TouchableOpacity style={s.transferBtn} onPress={() => setShowTransfer(true)}>
            <Ionicons name="swap-horizontal-outline" size={18} color={C.primaryLight} />
            <Text style={s.transferBtnTxt}>Transferir</Text>
          </TouchableOpacity>
        </View>

        {/* RESUMEN PATRIMONIO */}
        <View style={s.summaryCard}>
          <View style={s.summaryRow}>
            <View style={s.summaryItem}>
              <Text style={s.summaryLbl}>ACTIVOS</Text>
              <Text style={[s.summaryVal, { color: C.income }]}>Q {totalAssets.toFixed(0)}</Text>
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
            <View style={[s.summaryRow, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.separator }]}>
              <View style={s.summaryItem}>
                <Text style={s.summaryLbl}>NETO USD</Text>
                <Text style={[s.summaryVal, { color: totalUSD >= 0 ? '#4A9EE8' : C.danger }]}>
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
                <Text style={[s.summaryVal, { color: C.textMuted, fontSize: 13 }]}>Q {settings.exchangeRate}/USD</Text>
              </View>
            </View>
          )}
          {(totalEUR !== 0 || totalGBP !== 0) && (
            <View style={[s.summaryRow, { marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.separator }]}>
              {totalEUR !== 0 && (
                <View style={s.summaryItem}>
                  <Text style={s.summaryLbl}>NETO EUR</Text>
                  <Text style={[s.summaryVal, { color: totalEUR >= 0 ? '#4A9EE8' : C.danger }]}>
                    {totalEUR < 0 ? '-' : ''}EUR {Math.abs(totalEUR).toFixed(2)}
                  </Text>
                </View>
              )}
              {totalEUR !== 0 && totalGBP !== 0 && <View style={s.summaryDivider} />}
              {totalGBP !== 0 && (
                <View style={s.summaryItem}>
                  <Text style={s.summaryLbl}>NETO £</Text>
                  <Text style={[s.summaryVal, { color: totalGBP >= 0 ? '#4A9EE8' : C.danger }]}>
                    {totalGBP < 0 ? '-' : ''}£ {Math.abs(totalGBP).toFixed(2)}
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>

        {/* TABS INTERNOS */}
        <View style={s.tabRow}>
          <TouchableOpacity style={[s.tab, activeTab === 'accounts' && s.tabActive]} onPress={() => setActiveTab('accounts')}>
            <Text style={[s.tabTxt, activeTab === 'accounts' && s.tabTxtActive]}>Cuentas ({accounts.filter(a => a.isActive).length})</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[s.tab, activeTab === 'installments' && s.tabActive]} onPress={() => setActiveTab('installments')}>
            <Text style={[s.tabTxt, activeTab === 'installments' && s.tabTxtActive]}>Visacuotas ({creditInstallments.filter(i => i.isActive).length})</Text>
          </TouchableOpacity>
        </View>

        {/* CONTENIDO */}
        <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
          {activeTab === 'accounts' ? (
            <>
              {accounts.filter(a => a.isActive).length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="wallet-outline" size={48} color={C.textMuted} />
                  <Text style={s.emptyTitle}>Sin cuentas registradas</Text>
                  <Text style={s.emptyDesc}>Agrega tus cuentas bancarias, efectivo, tarjetas e inversiones para un panorama completo de tu patrimonio.</Text>
                </View>
              ) : (
                accounts.filter(a => a.isActive).map(acc => {
                  const typeInfo = ACCOUNT_TYPES.find(t => t.type === acc.type)!;
                  const isCredit = acc.type === 'credit';
                  const monthlyTotal = isCredit ? getAccountMonthlyInstallmentTotal(creditInstallments, acc.id) : 0;
                  const cutoffPaymentLabel = isCredit && (acc.cutoffDay || acc.paymentDueDay)
                    ? [
                        acc.cutoffDay ? `Corte: día ${acc.cutoffDay}` : null,
                        acc.paymentDueDay ? `Pago: día ${acc.paymentDueDay}` : null,
                      ].filter(Boolean).join(' · ')
                    : null;

                  return (
                    <TouchableOpacity
                      key={acc.id}
                      style={[s.accCard, { borderLeftColor: acc.color }]}
                      onLongPress={() => { setEditingAcc(acc); setShowAccModal(true); }}
                      activeOpacity={0.85}
                    >
                      <View style={[s.accIcon, { backgroundColor: acc.color + '22' }]}>
                        <Ionicons name={typeInfo.icon as any} size={22} color={acc.color} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                          <Text style={s.accName}>{acc.name}</Text>
                          {acc.bankName && (
                            <View style={[s.bankBadge, { backgroundColor: acc.color + '22' }]}>
                              <Text style={[s.bankBadgeTxt, { color: acc.color }]}>{acc.bankName}</Text>
                            </View>
                          )}
                        </View>
                        <Text style={s.accType}>{typeInfo.label}</Text>
                        {isCredit && cutoffPaymentLabel && (
                          <Text style={{ color: C.textMuted, fontSize: 10, marginTop: 3 }}>{cutoffPaymentLabel}</Text>
                        )}
                        {isCredit && monthlyTotal > 0 && (
                          <Text style={{ color: C.warning, fontSize: 10, marginTop: 3 }}>
                            Cuota mensual: {acc.currency} {monthlyTotal.toFixed(2)}
                          </Text>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end' }}>
                        {isCredit ? (
                          monthlyTotal > 0 ? (
                            <Text style={[s.accBalance, { color: C.warning }]}>{acc.currency} {monthlyTotal.toFixed(2)}</Text>
                          ) : (
                            <Text style={{ color: C.textMuted, fontSize: 12, marginBottom: 4 }}>Sin cuotas activas</Text>
                          )
                        ) : (
                          <Text style={[s.accBalance, { color: acc.color }]}>
                            {fmt(acc.balance, acc.currency)}
                          </Text>
                        )}
                        <TouchableOpacity onPress={() => handleDeleteAccount(acc.id)} style={s.deleteBtn}>
                          <Ionicons name="trash-outline" size={14} color={C.danger} />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </>
          ) : (
            <>
              {creditInstallments.filter(i => i.isActive).length === 0 ? (
                <View style={s.empty}>
                  <Ionicons name="card-outline" size={48} color={C.textMuted} />
                  <Text style={s.emptyTitle}>Sin visacuotas</Text>
                  <Text style={s.emptyDesc}>Registra tus compras en cuotas. La app descontará automáticamente cada mes y te mostrará cuánto te falta para terminar de pagar.</Text>
                </View>
              ) : (
                creditInstallments.filter(i => i.isActive).map(item => {
                  const acc = accounts.find(a => a.id === item.accountId);
                  const remaining = item.totalInstallments - item.paidInstallments;
                  const pct = (item.paidInstallments / item.totalInstallments) * 100;
                  const endDate = new Date(item.startDate);
                  endDate.setMonth(endDate.getMonth() + item.totalInstallments);

                  return (
                    <View key={item.id} style={[s.instCard, { borderLeftColor: acc?.color || C.primary }]}>
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
                      <View style={{ flexDirection: 'row', gap: 8, alignSelf: 'flex-end', marginTop: 8 }}>
                        <TouchableOpacity onPress={() => { setEditingInst(item); setShowInstModal(true); }} style={s.deleteBtn}>
                          <Ionicons name="pencil-outline" size={14} color={C.primaryLight} />
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => handleDeleteInstallment(item.id)} style={s.deleteBtn}>
                          <Ionicons name="trash-outline" size={14} color={C.danger} />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </>
          )}
          <View style={{ height: 100 }} />
        </ScrollView>

        {/* FAB */}
        <TouchableOpacity
          style={s.fab}
          onPress={() => {
            if (activeTab === 'accounts') { setEditingAcc(undefined); setShowAccModal(true); }
            else { setEditingInst(undefined); setShowInstModal(true); }
          }}
        >
          <Ionicons name="add" size={28} color="#1A0E00" />
        </TouchableOpacity>

        {/* MODALES */}
        {showAccModal && (
          <AccountModal existing={editingAcc} onSave={handleSaveAccount} onClose={() => { setShowAccModal(false); setEditingAcc(undefined); }} />
        )}
        {showInstModal && (
          <InstallmentModal accounts={accounts} existing={editingInst} onSave={handleSaveInstallment} onClose={() => { setShowInstModal(false); setEditingInst(undefined); }} />
        )}
        {showTransfer && accounts.filter(a => a.isActive && a.type !== 'credit').length >= 2 && (
          <TransferModal accounts={accounts.filter(a => a.isActive && a.type !== 'credit')} settings={settings} onSave={handleTransfer} onClose={() => setShowTransfer(false)} />
        )}
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS
// ─────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: C.bg, paddingTop: 52 },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 16 },
  backBtn: { padding: 8, borderRadius: 12, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
  headerTitle: { color: C.textPrimary, fontSize: 20, fontWeight: '900' },
  transferBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: C.primaryDark + '44', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.primary + '55' },
  transferBtnTxt: { color: C.primaryLight, fontSize: 12, fontWeight: '700' },

  summaryCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, marginHorizontal: 16, padding: 16, marginBottom: 16, ...shadow('#000', 6, 0.3) },
  summaryRow: { flexDirection: 'row', alignItems: 'center' },
  summaryItem: { flex: 1, alignItems: 'center' },
  summaryLbl: { color: C.textMuted, fontSize: 9, fontWeight: '700', letterSpacing: 1, marginBottom: 4 },
  summaryVal: { fontSize: 15, fontWeight: '900', color: C.textPrimary },
  summaryDivider: { width: 1, height: 32, backgroundColor: C.cardBorder, marginHorizontal: 8 },

  tabRow: { flexDirection: 'row', marginHorizontal: 16, backgroundColor: C.card, borderRadius: 12, padding: 4, marginBottom: 16, borderWidth: 1, borderColor: C.cardBorder },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 8 },
  tabActive: { backgroundColor: C.primaryDark + '66', borderWidth: 1, borderColor: C.primary + '55' },
  tabTxt: { color: C.textMuted, fontSize: 12, fontWeight: '700' },
  tabTxtActive: { color: C.primaryLight, fontWeight: '900' },

  accCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderLeftWidth: 4, padding: 14, marginHorizontal: 16, marginBottom: 10, ...shadow('#000', 4, 0.2) },
  accIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  accName: { color: C.textPrimary, fontSize: 15, fontWeight: '800' },
  accType: { color: C.textMuted, fontSize: 11, marginTop: 2 },
  accBalance: { fontSize: 16, fontWeight: '900', marginBottom: 4 },
  bankBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bankBadgeTxt: { fontSize: 9, fontWeight: '800' },
  deleteBtn: { padding: 6, borderRadius: 8, backgroundColor: C.danger + '11' },

  instCard: { backgroundColor: C.card, borderRadius: 16, borderWidth: 1, borderColor: C.cardBorder, borderLeftWidth: 4, padding: 14, marginHorizontal: 16, marginBottom: 10, ...shadow('#000', 4, 0.2) },
  instHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 },
  instName: { color: C.textPrimary, fontSize: 15, fontWeight: '800', flex: 1 },
  instBalance: { fontSize: 14, fontWeight: '800' },
  instAccRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 8 },
  instAccTxt: { fontSize: 11, fontWeight: '700' },
  instStats: { flexDirection: 'row', marginTop: 10 },
  instStat: { flex: 1, alignItems: 'center' },
  instStatVal: { color: C.textPrimary, fontSize: 12, fontWeight: '800' },
  instStatLbl: { color: C.textMuted, fontSize: 9, letterSpacing: 1, marginTop: 2 },

  accSelectRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, padding: 12, marginBottom: 8, gap: 10 },
  accDot: { width: 12, height: 12, borderRadius: 6 },
  accSelectName: { flex: 1, color: C.text, fontSize: 14, fontWeight: '700' },
  accSelectBal: { color: C.textMuted, fontSize: 12 },
  transferArrow: { alignItems: 'center', paddingVertical: 8 },

  empty: { alignItems: 'center', paddingTop: 60, gap: 12, paddingHorizontal: 32 },
  emptyTitle: { color: C.textPrimary, fontSize: 18, fontWeight: '800' },
  emptyDesc: { color: C.textMuted, fontSize: 13, textAlign: 'center', lineHeight: 20 },
  fab: { position: 'absolute', bottom: 20, right: 16, width: 58, height: 58, borderRadius: 29, backgroundColor: C.primary, alignItems: 'center', justifyContent: 'center', ...shadow(C.primaryGlow, 12, 0.6), borderWidth: 2, borderColor: C.primaryLight },
});

const md = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: '#000000AA', justifyContent: 'flex-end' },
  sheet: { backgroundColor: C.bg, borderTopLeftRadius: 28, borderTopRightRadius: 28, borderTopWidth: 1, borderColor: C.primary + '55', padding: 24, maxHeight: '90%', ...shadow(C.primaryGlow, 20, 0.4) },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 },
  title: { color: C.textPrimary, fontSize: 20, fontWeight: '900' },
  closeBtn: { padding: 8, borderRadius: 20, backgroundColor: C.card, borderWidth: 1, borderColor: C.cardBorder },
  lbl: { color: C.textMuted, fontSize: 11, fontWeight: '700', letterSpacing: 1.2, marginBottom: 8, marginTop: 14 },
  hint: { color: C.textMuted, fontSize: 12, lineHeight: 17, marginBottom: 8 },
  input: { backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, padding: 14, color: C.text, fontSize: 15 },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.card, borderRadius: 12, borderWidth: 1, borderColor: C.cardBorder, paddingHorizontal: 14, paddingVertical: 10 },
  amtInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: '700' },
  cur: { color: C.textMuted, fontSize: 16, fontWeight: '700', marginRight: 8 },
  currBtn: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 10, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
  currBtnActive: { borderColor: C.primary, backgroundColor: C.primaryDark + '33' },
  currTxt: { color: C.textSub, fontSize: 14, fontWeight: '700' },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
  typeChipTxt: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderWidth: 3, borderColor: '#fff' },
  saveBtn: { flexDirection: 'row', backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20, ...shadow(C.primaryGlow, 10, 0.4) },
  saveBtnTxt: { color: '#1A0E00', fontSize: 15, fontWeight: '900' },
});
