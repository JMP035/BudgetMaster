import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated, BackHandler, Easing, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View, useWindowDimensions
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useTutorialAction, useTutorialRef, useTutorialScroll } from "../context/TutorialContext";
import {
  Account, AccountType, CreditInstallment,
  Currency, SmsLinkSeen, StorageService, Transaction, UserSettings,
  calcCreditCommitments, calcNetWorthFromAccounts, convertAmount,
  getAccountMonthlyInstallmentTotal, getMonthlyInstallmentTotal, hasReliableConversion,
  parseAmount, parseDateOnly, storedDateToDateOnly
} from "../services/storage";
import { cycleSpentForCard, linkKeyLabel } from "../services/AccountLinking";
import { detectBankName } from "../services/BankSmsParser";
import { balanceModeOf } from "../services/Balances";
import { hasValidCardDates } from "../services/CardSetup";
import type { BalanceMode } from "../services/Balances";
import {
  balanceModeHelp, balanceModeTag, canTransfer, findEquivalentTransferSms, planSmsJoin,
  resolveBalanceFields, smsBalanceMismatch, suggestToAmount, transferFromChoices, transferToChoices, validateTransferForm,
} from "../services/TransferForm";
import type { SmsJoinPlan } from "../services/TransferForm";
import { nextInstallmentCut } from "../services/InstallmentSchedule";
import { statementFor } from "../services/CardStatement";
import type { StatementStatus } from "../services/CardStatement";
import { formatShortDay } from "../services/BudgetBreakdown";
import { isSmsFeatureOn } from "../services/features";
import { formatMoney } from "../services/format";
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
import { CardPaymentSheet, StatementAmountSheet } from "./CardStatementSheets";
import { BalanceAdjustSheet } from "./BalanceAdjustSheet";
import { DateField, noonOf } from "./DateField";
import Money from "./Money";
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

// Cómo lleva su saldo cada cuenta (ver services/Balances.ts): el saldo es opcional.
/** Pausa entre cerrar una ventana y abrir la siguiente (Android). */
const SWITCH_DELAY_MS = 250;

const BALANCE_MODE_OPTIONS: { value: BalanceMode; label: string }[] = [
  { value: 'none', label: 'Sin seguimiento' },
  { value: 'manual', label: 'Manual' },
  { value: 'auto', label: 'Automático' },
];

// Bancos conocidos para vincular mensajes (códigos que usa el lector de SMS)
const LINK_BANKS = ['BAC', 'BI', 'BANRURAL', 'GYT', 'BAM', 'PROMERICA', 'BANTRAB'];

type LinkKind = 'prod' | 'card' | 'acct';
const LINK_KIND_OPTIONS: { value: LinkKind; label: string }[] = [
  { value: 'prod', label: 'Producto' },
  { value: 'card', label: 'Tarjeta' },
  { value: 'acct', label: 'Cuenta' },
];
const LINK_KIND_HINT: Record<LinkKind, string> = {
  prod: 'Producto o marca tal como la nombra el mensaje. Ej: BAC VISA.',
  card: 'Últimos 4 dígitos de la tarjeta (terminación).',
  acct: 'Últimos 4 dígitos de la cuenta (terminación).',
};

function statusLabel(st: StatementStatus): string {
  return st === 'paid' ? 'Pagado' : st === 'partial' ? 'Pago parcial' : st === 'overdue' ? 'Vencido' : 'Pendiente';
}

function statusColor(st: StatementStatus): string {
  return st === 'paid' ? C.income : st === 'overdue' ? C.danger : C.warning;
}

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
export function AccountModal({ onSave, onClose, existing, defaultType, defaultCurrency, smsOn = false, allAccounts, transactions, onAdjust, onRequestAdjust }: {
  onSave: (a: Account) => void; onClose: () => void; existing?: Account; defaultType?: AccountType;
  defaultCurrency?: Currency;
  /** Muestra la sección de mensajes (SMS) que actualizan la cuenta. Apagado = oculta. */
  smsOn?: boolean;
  /** Todas las cuentas, para avisar si otra ya usa la misma clave de vínculo. */
  allAccounts?: Account[];
  /** Movimientos, para mostrar «Según tu banco (SMS)» en las cuentas con saldo automático. */
  transactions?: Transaction[];
  /** «Usar este saldo»: re-ancla la cuenta con el saldo que trajo el SMS. */
  onAdjust?: (accountId: string, amount: number, atIso: string) => void;
  /** «Ajustar al saldo real»: el padre cierra este formulario y abre la hoja de ajuste. */
  onRequestAdjust?: (accountId: string) => void;
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
  const [payFromId, setPayFromId] = useState<string | null>(existing?.payFromAccountId ?? null);
  const [error, setError] = useState('');

  // ── Saldo opcional (ver services/Balances.ts) ─────────────
  const existingAuto = !!existing && balanceModeOf(existing) === 'auto';
  const [mode, setMode] = useState<BalanceMode>(
    existing ? balanceModeOf(existing) : ((defaultType ?? 'bank') === 'credit' ? 'none' : 'manual'),
  );
  const [modeTouched, setModeTouched] = useState(false);
  const [startText, setStartText] = useState(existingAuto ? String(existing?.balanceAnchorAmount ?? existing?.balance ?? 0) : '');
  const [startDate, setStartDate] = useState<Date>(() => {
    const at = existing?.balanceAnchorAt ? new Date(existing.balanceAnchorAt) : null;
    return noonOf(at && !isNaN(at.getTime()) ? at : new Date());
  });
  const [startTouched, setStartTouched] = useState(false);
  const [smsAutoBal, setSmsAutoBal] = useState(!!existing?.smsAutoBalance);

  // ── Mensajes (SMS) que actualizan esta cuenta ─────────────
  const [smsLinks, setSmsLinks] = useState<string[]>(existing?.smsLinks ?? []);
  const [showAddLink, setShowAddLink] = useState(false);
  const [linkBank, setLinkBank] = useState<string>(() => {
    const b = detectBankName(existing?.bankName || '');
    return b === 'Banco' ? '' : b;
  });
  const [linkKind, setLinkKind] = useState<LinkKind>('prod');
  const [linkValue, setLinkValue] = useState('');
  const [linkNotice, setLinkNotice] = useState<{ variant: InlineNoticeVariant; text: string } | null>(null);
  const [linkSeen, setLinkSeen] = useState<SmsLinkSeen[]>([]);

  useEffect(() => {
    if (!smsOn) return;
    let alive = true;
    StorageService.getSmsLinkSeen()
      .then(list => { if (alive) setLinkSeen(list); })
      .catch(() => { });
    return () => { alive = false; };
  }, [smsOn]);

  const typeInfo = ACCOUNT_TYPES.find(t => t.type === type)!;
  const showSmsSection = smsOn && (type === 'bank' || type === 'credit' || type === 'savings');
  // Cuentas de las que puede salir el pago de la tarjeta (no tarjetas)
  const payFromChoices = (allAccounts ?? []).filter(a => a.isActive && a.type !== 'credit' && a.id !== existing?.id);

  // Cada cambio en un campo limpia el aviso de error
  const ch = (set: (v: string) => void) => (v: string) => { set(v); setError(''); };

  // Sugerencias vistas en los SMS, del banco y tipo elegidos y que aún no estén en la cuenta
  const linkSuggestions = linkSeen.filter(
    x => x.key.startsWith(`${linkBank}|${linkKind}:`) && !smsLinks.includes(x.key),
  ).slice(0, 8);

  const handleAddLink = () => {
    if (!linkBank) { setLinkNotice({ variant: 'error', text: 'Elige el banco del mensaje.' }); return; }
    let value = linkValue.trim();
    if (linkKind === 'prod') {
      value = value.replace(/\s+/g, ' ').toUpperCase();
      if (!value) { setLinkNotice({ variant: 'error', text: 'Escribe el producto o marca, por ejemplo BAC VISA.' }); return; }
      if (value.includes('|')) { setLinkNotice({ variant: 'error', text: 'El producto no puede llevar el símbolo |.' }); return; }
    } else if (!/^\d{4}$/.test(value)) {
      setLinkNotice({ variant: 'error', text: 'Ingresa exactamente 4 dígitos.' });
      return;
    }
    const key = `${linkBank}|${linkKind}:${value}`;
    if (smsLinks.includes(key)) {
      setLinkNotice({ variant: 'info', text: 'Esta cuenta ya tiene ese vínculo.' });
      return;
    }
    const owner = (allAccounts ?? []).find(a => a.id !== existing?.id && a.isActive && a.smsLinks?.includes(key));
    if (owner) {
      setLinkNotice({ variant: 'warning', text: `Ese mensaje ya actualiza la cuenta «${owner.name}». Quítalo de allá para usarlo aquí.` });
      return;
    }
    setSmsLinks(prev => [...prev, key]);
    setLinkValue('');
    setLinkNotice(null);
    setShowAddLink(false);
    setError('');
  };

  const handleSave = () => {
    if (!name.trim()) { setError('Ingresa el nombre de la cuenta.'); return; }

    // Saldo opcional (ver services/Balances.ts): modo, saldo y ancla según lo elegido.
    const bf = resolveBalanceFields({ mode, existing, manualText: balance, startText, startDate, startTouched });
    if ('error' in bf) { setError(bf.error); return; }

    const linksChanged = [...smsLinks].sort().join('\n') !== [...(existing?.smsLinks ?? [])].sort().join('\n');
    const smsFields = {
      smsLinks: smsLinks.length > 0 ? smsLinks : undefined,
      smsLinkedAt: linksChanged ? new Date().toISOString() : existing?.smsLinkedAt,
      smsAutoBalance: bf.balanceMode === 'auto' && smsOn ? smsAutoBal : existing?.smsAutoBalance,
      balanceMode: bf.balanceMode,
      balanceAnchorAt: bf.balanceAnchorAt,
      balanceAnchorAmount: bf.balanceAnchorAmount,
    };

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
        balance: bf.balance,
        initialBalance: bf.initialBalance,
        color,
        icon: typeInfo.icon,
        bankName: bankName.trim() || undefined,
        creditLimit: existing?.creditLimit,
        cutoffDay: parsedCutoff,
        paymentDueDay: parsedPaymentDue,
        payFromAccountId: payFromId && payFromChoices.some(a => a.id === payFromId) ? payFromId : undefined,
        statementOverrides: existing?.statementOverrides,
        isActive: true,
        createdAt: existing?.createdAt || new Date().toISOString(),
        notes: notes.trim() || undefined,
        ...smsFields,
      };
      onSave(account);
      onClose();
      return;
    }

    const account: Account = {
      id: existing?.id || `acc_${Date.now()}`,
      name: name.trim(),
      type,
      currency,
      balance: bf.balance,
      initialBalance: bf.initialBalance,
      color,
      icon: typeInfo.icon,
      bankName: bankName.trim() || undefined,
      isActive: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
      notes: notes.trim() || undefined,
      ...smsFields,
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
            <TouchableOpacity key={t.type} style={[md.typeChip, type === t.type && { borderColor: t.color, backgroundColor: t.color + '22' }]} onPress={() => {
              setType(t.type); setError('');
              // Mientras la persona no elija el modo, la tarjeta no lleva saldo y el resto sí.
              if (!modeTouched) setMode(t.type === 'credit' ? 'none' : (mode === 'none' ? 'manual' : mode));
            }}>
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

      {/* Moneda */}
      <View>
        <Text style={md.lbl}>MONEDA</Text>
        <GlassSegmented options={CURRENCY_OPTIONS} value={currency === 'USD' ? 'USD' : 'Q'} onChange={v => setCurrency(v)} />
      </View>

      {/* Saldo opcional: Sin seguimiento / Manual / Automático */}
      <Text style={md.lbl}>SALDO</Text>
      <GlassSegmented
        options={BALANCE_MODE_OPTIONS}
        value={mode}
        onChange={v => { setMode(v); setModeTouched(true); setError(''); }}
      />
      <Text style={[md.hint, { marginTop: 8 }]}>{balanceModeHelp(mode, type)}</Text>

      {mode === 'manual' && (
        <View>
          <Text style={md.lbl}>SALDO ACTUAL</Text>
          <View style={md.amtRow}>
            <Text style={md.cur}>{currency}</Text>
            <TextInput style={md.amtInput} value={balance} onChangeText={ch(setBalance)} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
          </View>
        </View>
      )}

      {mode === 'auto' && (
        <View>
          <Text style={md.lbl}>SALDO DE PARTIDA</Text>
          <View style={md.amtRow}>
            <Text style={md.cur}>{currency}</Text>
            <TextInput
              style={md.amtInput}
              value={startText}
              onChangeText={v => { setStartText(v); setStartTouched(true); setError(''); }}
              placeholder={existing ? existing.balance.toFixed(2) : '0.00'}
              placeholderTextColor={C.textMuted}
              keyboardType="decimal-pad"
              accessibilityLabel="Saldo de partida"
            />
          </View>
          <Text style={[md.hint, { marginTop: 6 }]}>
            Lo que tiene la cuenta en la fecha de abajo. Si lo dejas vacío, se usa el saldo actual de la cuenta con la fecha de hoy.
          </Text>
          <DateField label="FECHA DEL SALDO DE PARTIDA" value={startDate} onChange={d => { setStartDate(d); setStartTouched(true); setError(''); }} />

          {existingAuto && !!existing && (
            <View style={{ marginTop: 12 }}>
              <Text style={md.hint}>La app calcula hoy: {formatMoney(existing.balance, existing.currency)}</Text>
              {(() => {
                const mm = smsOn && transactions ? smsBalanceMismatch(existing, transactions) : null;
                return mm && onAdjust ? (
                  <InlineNotice
                    variant="info"
                    text={`Según tu banco (SMS): ${formatMoney(mm.amount, existing.currency)}. La app calculaba ${formatMoney(mm.expected, existing.currency)} para ese momento.`}
                    actionLabel="Usar este saldo"
                    onAction={() => { onAdjust(existing.id, mm.amount, mm.at); onClose(); }}
                    style={{ marginBottom: 8 }}
                  />
                ) : null;
              })()}
              {!!onRequestAdjust && (
                <GlassButton
                  kind="secondary"
                  icon="analytics-outline"
                  label="Ajustar al saldo real"
                  onPress={() => onRequestAdjust(existing.id)}
                />
              )}
            </View>
          )}

          {smsOn && type !== 'credit' && (
            <TouchableOpacity
              style={md.checkRow}
              onPress={() => setSmsAutoBal(v => !v)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: smsAutoBal }}
              accessibilityLabel="Ajustar sola con el saldo de mis SMS"
            >
              <Ionicons name={smsAutoBal ? 'checkbox' : 'square-outline'} size={22} color={smsAutoBal ? C.primary : C.textSub} />
              <View style={{ flex: 1 }}>
                <Text style={md.checkTitle}>Ajustar sola con el saldo de mis SMS</Text>
                <Text style={md.hint}>Si el SMS del banco trae tu saldo, la app lo toma como el saldo real al sincronizar. «Deshacer» la última sincronización lo devuelve.</Text>
              </View>
            </TouchableOpacity>
          )}
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
      {type === 'credit' && (
        <Text style={md.hint}>
          Día de corte = la fecha de «Saldo al corte» de tu estado de cuenta (ese día entra en el estado y el ciclo nuevo empieza al día siguiente).
        </Text>
      )}
      {type === 'credit' && (!cutoffDay.trim() || !paymentDueDay.trim()) && (
        <InlineNotice
          variant="info"
          text="Sin estos días no hay fecha de pago, recordatorios ni semáforo de capacidad."
          style={{ marginTop: 10 }}
        />
      )}
      {type === 'credit' && payFromChoices.length > 0 && (
        <View>
          <Text style={md.lbl}>CUENTA CON LA QUE PAGAS (Opcional)</Text>
          <View style={md.linkWrap}>
            <TouchableOpacity
              style={[md.bankChip, payFromId === null && md.bankChipActive]}
              onPress={() => { setPayFromId(null); setError(''); }}
              accessibilityRole="button"
              accessibilityState={{ selected: payFromId === null }}
            >
              <Text style={[md.bankChipTxt, payFromId === null && { color: C.primaryLight }]}>Ninguna</Text>
            </TouchableOpacity>
            {payFromChoices.map(a => (
              <TouchableOpacity
                key={a.id}
                style={[md.bankChip, payFromId === a.id && md.bankChipActive]}
                onPress={() => { setPayFromId(a.id); setError(''); }}
                accessibilityRole="button"
                accessibilityLabel={a.name}
                accessibilityState={{ selected: payFromId === a.id }}
              >
                <Text style={[md.bankChipTxt, payFromId === a.id && { color: C.primaryLight }]} numberOfLines={1}>{a.name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <Text style={md.hint}>
            De ahí sale el dinero cuando pagas esta tarjeta.{smsOn ? ' Si el banco te manda el SMS del pago, la app lo empareja sola con esa salida: no cuenta como un gasto nuevo.' : ''}
          </Text>
        </View>
      )}

      {/* Mensajes (SMS) que actualizan esta cuenta */}
      {showSmsSection && (
        <View>
          <Text style={md.lbl}>MENSAJES QUE ACTUALIZAN ESTA CUENTA</Text>
          {smsLinks.length === 0 ? (
            <Text style={md.hint}>Aún no hay mensajes vinculados a esta cuenta.</Text>
          ) : (
            <View style={md.linkWrap}>
              {smsLinks.map(key => (
                <View key={key} style={md.linkChip}>
                  <Text style={md.linkChipTxt} numberOfLines={1}>{linkKeyLabel(key)}</Text>
                  <TouchableOpacity
                    onPress={() => { setSmsLinks(prev => prev.filter(k => k !== key)); setLinkNotice(null); }}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    accessibilityRole="button"
                    accessibilityLabel={`Quitar vínculo ${linkKeyLabel(key)}`}
                  >
                    <Ionicons name="close" size={14} color={C.textSub} />
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          )}

          {showAddLink ? (
            <View style={md.addLinkBox}>
              <Text style={md.subLbl}>BANCO</Text>
              <View style={md.linkWrap}>
                {LINK_BANKS.map(b => (
                  <TouchableOpacity
                    key={b}
                    style={[md.bankChip, linkBank === b && md.bankChipActive]}
                    onPress={() => { setLinkBank(b); setLinkNotice(null); }}
                    accessibilityRole="button"
                    accessibilityState={{ selected: linkBank === b }}
                  >
                    <Text style={[md.bankChipTxt, linkBank === b && { color: C.primaryLight }]}>{b}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <Text style={md.subLbl}>TIPO</Text>
              <GlassSegmented
                options={LINK_KIND_OPTIONS}
                value={linkKind}
                onChange={v => { setLinkKind(v); setLinkValue(''); setLinkNotice(null); }}
              />
              <Text style={md.hint}>{LINK_KIND_HINT[linkKind]}</Text>

              <Text style={md.subLbl}>VALOR</Text>
              <TextInput
                style={md.input}
                value={linkValue}
                onChangeText={v => { setLinkValue(linkKind === 'prod' ? v : v.replace(/\D/g, '').slice(0, 4)); setLinkNotice(null); }}
                placeholder={linkKind === 'prod' ? 'Ej: BAC VISA' : '1234'}
                placeholderTextColor={C.textMuted}
                keyboardType={linkKind === 'prod' ? 'default' : 'number-pad'}
                autoCapitalize={linkKind === 'prod' ? 'characters' : 'none'}
                maxLength={linkKind === 'prod' ? 30 : 4}
              />
              {linkSuggestions.length > 0 && (
                <>
                  <Text style={md.hint}>Vistos en tus mensajes:</Text>
                  <View style={[md.linkWrap, { marginTop: 6 }]}>
                    {linkSuggestions.map(x => {
                      const val = x.key.slice(x.key.indexOf(':') + 1);
                      return (
                        <TouchableOpacity
                          key={x.key}
                          style={[md.bankChip, linkValue === val && md.bankChipActive]}
                          onPress={() => { setLinkValue(val); setLinkNotice(null); }}
                          accessibilityRole="button"
                          accessibilityLabel={`Usar ${val}`}
                        >
                          <Text style={[md.bankChipTxt, linkValue === val && { color: C.primaryLight }]}>
                            {linkKind === 'prod' ? val : `*${val}`}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              )}

              {!!linkNotice && <InlineNotice variant={linkNotice.variant} text={linkNotice.text} style={{ marginTop: 10 }} />}
              <View style={md.addLinkActions}>
                <GlassButton kind="ghost" label="Cancelar" onPress={() => { setShowAddLink(false); setLinkNotice(null); setLinkValue(''); }} style={{ flex: 1 }} />
                <GlassButton kind="secondary" icon="add-circle-outline" label="Agregar" onPress={handleAddLink} style={{ flex: 1 }} />
              </View>
            </View>
          ) : (
            <GlassButton
              kind="secondary"
              icon="add-circle-outline"
              label="Agregar mensaje"
              onPress={() => { setShowAddLink(true); setLinkNotice(null); }}
              style={{ marginTop: 10 }}
            />
          )}

          <Text style={[md.hint, { marginTop: 10 }]}>
            Vincular organiza tus movimientos por cuenta; no cambia un saldo que escribiste a mano.
          </Text>
          {type === 'credit' && (
            <Text style={md.hint}>
              Las tarjetas normalmente no llevan saldo: verás «Ciclo abierto» y el «Estado al corte».
            </Text>
          )}
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
/** Lo que el formulario entrega al guardar una transferencia entre cuentas que no son tarjeta. */
interface TransferSubmit {
  fromId: string;
  toId: string;
  amount: number;
  toAmount?: number;
  date: Date;
  /** SMS equivalentes que ya llegaron: se unen en lugar de crear otro movimiento. */
  join: SmsJoinPlan;
}

function TransferModal({ accounts, transactions, settings, smsOn, onSave, onPayCard, onClose }: {
  /** Todas las cuentas activas (las tarjetas solo como destino: llevan al pago de la tarjeta). */
  accounts: Account[];
  transactions: Transaction[];
  settings: UserSettings;
  smsOn: boolean;
  onSave: (p: TransferSubmit) => void;
  onPayCard: (cardId: string, fromId: string) => void;
  onClose: () => void;
}) {
  const fromChoices = transferFromChoices(accounts);
  const [fromId, setFromId] = useState(fromChoices[0]?.id || '');
  const [toId, setToId] = useState(fromChoices[1]?.id || '');
  const [amount, setAmount] = useState('');
  const [toAmountText, setToAmountText] = useState('');
  const [toAmountTouched, setToAmountTouched] = useState(false);
  const [date, setDate] = useState<Date>(() => noonOf(new Date()));
  const [joinSms, setJoinSms] = useState(true);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<{ variant: InlineNoticeVariant; text: string } | null>(null);

  useEffect(() => {
    if (!smsOn) return;
    let alive = true;
    StorageService.getDupIgnored()
      .then(list => { if (alive) setIgnored(new Set(list)); })
      .catch(() => { });
    return () => { alive = false; };
  }, [smsOn]);

  const fromAcc = accounts.find(a => a.id === fromId);
  const toAcc = accounts.find(a => a.id === toId);
  const toChoices = transferToChoices(accounts, fromId);
  const isCardDest = toAcc?.type === 'credit';

  const amountNum = parseAmount(amount);
  const crossCurrency = !!fromAcc && !!toAcc && !isCardDest && fromAcc.currency !== toAcc.currency;
  const fxBlocked = crossCurrency && !!fromAcc && !!toAcc && !hasReliableConversion(fromAcc.currency, toAcc.currency);
  const fxBlockedText = fxBlocked
    ? `No hay tipo de cambio confiable entre ${fromAcc!.currency} y ${toAcc!.currency}. Solo se puede transferir USD↔Q, o entre cuentas de la misma moneda.`
    : '';
  // Lo que recibe el destino: sugerido con el tipo de cambio de Ajustes, y la persona lo puede corregir.
  const suggested = crossCurrency && fromAcc && toAcc
    ? suggestToAmount(amountNum, fromAcc.currency, toAcc.currency, settings.exchangeRate)
    : null;
  const toAmountShown = toAmountTouched ? toAmountText : (suggested !== null ? String(suggested) : '');
  const toAmountNum = toAmountTouched ? parseAmount(toAmountText) : (suggested ?? NaN);

  // ¿Ya llegó el SMS de esta transferencia? (antes o después, la app no la duplica)
  const match = useMemo(() => {
    if (!smsOn || !fromAcc || !toAcc || isCardDest || !(amountNum > 0)) return {};
    return findEquivalentTransferSms(transactions, {
      fromAcc, toAcc, amount: amountNum, toAmount: isNaN(toAmountNum) ? undefined : toAmountNum, date, ignored,
    });
  }, [smsOn, fromAcc, toAcc, isCardDest, amountNum, toAmountNum, date, transactions, ignored]);
  const plan: SmsJoinPlan = joinSms ? planSmsJoin(match) : { kind: 'none' };
  const hasMatch = !!match.out || !!match.inn;

  const joinText = match.out && match.inn
    ? 'Ya llegaron los dos SMS de esta transferencia (la salida y la entrada). Al guardar se unen en una sola transferencia.'
    : match.out
      ? 'Ya llegó el SMS de la salida de esta transferencia. Al guardar se une a él en vez de crear otro movimiento.'
      : 'Ya llegó el SMS de la entrada de esta transferencia. Al guardar se une a él en vez de crear otro movimiento.';

  const handleSave = () => {
    if (isCardDest && toAcc) {
      if (!fromAcc) { setNotice({ variant: 'error', text: 'Elige la cuenta de origen.' }); return; }
      onPayCard(toAcc.id, fromAcc.id);
      return;
    }
    const err = validateTransferForm({ fromAcc, toAcc, amount: amountNum, toAmount: crossCurrency ? toAmountNum : undefined });
    if (err) { setNotice({ variant: err.startsWith('No hay tipo de cambio') ? 'warning' : 'error', text: err }); return; }
    onSave({
      fromId, toId, amount: amountNum,
      ...(crossCurrency ? { toAmount: toAmountNum } : {}),
      date, join: plan,
    });
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
        {acc.type === 'credit'
          ? <Text style={md.noBal}>Tarjeta</Text>
          : balanceModeOf(acc) === 'none'
            ? <Text style={md.noBal}>Sin saldo</Text>
            : <Money amount={acc.balance} currency={acc.currency} size="sm" gradient={false} align="right" />}
        {selected && <Ionicons name="checkmark-circle" size={18} color={acc.color} />}
      </GlassCard>
    </TouchableOpacity>
  );

  return (
    <GlassSheet
      onClose={onClose}
      title="Transferir entre mis cuentas"
      footer={
        <View style={md.footer}>
          {fxBlocked
            ? <InlineNotice variant="warning" text={fxBlockedText} />
            : !!notice && <InlineNotice variant={notice.variant} text={notice.text} />}
          <GlassButton
            label={isCardDest ? 'Continuar al pago de la tarjeta' : plan.kind !== 'none' ? 'Guardar y unir con el SMS' : 'Transferir'}
            icon={isCardDest ? 'card-outline' : 'swap-horizontal-outline'}
            onPress={handleSave}
            disabled={fxBlocked}
          />
        </View>
      }
    >
      <Text style={md.hint}>
        Mover dinero entre tus cuentas no cuenta como gasto ni ingreso. Puedes registrarla antes o después de que llegue el SMS del banco: la app no la duplica.
      </Text>

      <Text style={md.lbl}>DESDE</Text>
      {fromChoices.map(acc => renderAccRow(acc, fromId === acc.id, () => {
        setFromId(acc.id);
        if (toId === acc.id) setToId(fromChoices.find(a => a.id !== acc.id)?.id ?? '');
      }))}

      <View style={md.transferArrow}>
        <Ionicons name="arrow-down" size={24} color={C.primary} />
      </View>

      <Text style={md.lbl}>HACIA</Text>
      {toChoices.map(acc => renderAccRow(acc, toId === acc.id, () => setToId(acc.id)))}

      {isCardDest ? (
        <InlineNotice
          variant="info"
          text="Pagar una tarjeta se registra con su «Registrar pago»: ahí eliges el estado, el monto en cada moneda y la fecha. Es una transferencia a la tarjeta, no un gasto nuevo, y baja el saldo de la cuenta con la que pagas si lo lleva."
          style={{ marginTop: 12 }}
        />
      ) : (
        <>
          <Text style={[md.lbl, { marginTop: 16 }]}>MONTO</Text>
          <View style={md.amtRow}>
            <Text style={md.cur}>{fromAcc?.currency || 'Q'}</Text>
            <TextInput style={md.amtInput} value={amount} onChangeText={v => { setAmount(v); setNotice(null); }} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" autoFocus accessibilityLabel="Monto de la transferencia" />
          </View>

          {crossCurrency && !fxBlocked && toAcc && (
            <View>
              <Text style={md.lbl}>LO QUE RECIBE {toAcc.name.toUpperCase()}</Text>
              <View style={md.amtRow}>
                <Text style={md.cur}>{toAcc.currency}</Text>
                <TextInput
                  style={md.amtInput}
                  value={toAmountShown}
                  onChangeText={v => { setToAmountText(v); setToAmountTouched(true); setNotice(null); }}
                  placeholder="0.00"
                  placeholderTextColor={C.textMuted}
                  keyboardType="decimal-pad"
                  accessibilityLabel="Monto que recibe la cuenta de destino"
                />
              </View>
              <Text style={[md.hint, { marginTop: 8 }]}>
                Sugerido con el tipo de cambio de Ajustes (Q {settings.exchangeRate}/USD). Si tu banco aplicó otro, escribe lo que realmente recibió.
              </Text>
            </View>
          )}

          <DateField label="FECHA" value={date} onChange={d => { setDate(d); setNotice(null); }} />

          {hasMatch && (
            <InlineNotice
              variant="info"
              text={joinSms ? joinText : 'No se unirá con el SMS: se creará una transferencia nueva y el SMS seguirá pendiente.'}
              actionLabel={joinSms ? 'No unir' : 'Unir'}
              onAction={() => setJoinSms(v => !v)}
              style={{ marginTop: 12 }}
            />
          )}
        </>
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
  /** Pide abrir el alta de cuenta (bancaria o tarjeta) al montar o al cambiar; lo usa «Crearlo ahora» del tutorial. */
  autoCreate?: { type: 'bank' | 'credit'; n: number } | null;
  onAutoCreateHandled?: () => void;
  /** Pide abrir la edición de una cuenta (p. ej. el corte y pago de una tarjeta, desde la guía del Inicio o el tutorial). */
  autoEdit?: { id: string; n: number } | null;
  onAutoEditHandled?: () => void;
}

export default function AccountsScreen({
  accounts, setAccounts, creditInstallments, setCreditInstallments,
  transactions, setTransactions, settings, onClose, autoCreate, onAutoCreateHandled, autoEdit, onAutoEditHandled,
}: Props) {
  const insets = useSafeAreaInsets();
  const { height: winH, width: winW } = useWindowDimensions();
  // Columna derecha de saldos: ancho explícito para que el importe pueda medirse/encogerse
  const balColW = Math.min(160, Math.max(104, Math.round(winW * 0.34)));
  const dialog = useGlassDialog();
  const smsOn = isSmsFeatureOn(settings);

  const [activeTab, setActiveTab] = useState<'accounts' | 'installments'>('accounts');
  const [showAccModal, setShowAccModal] = useState(false);
  const [showInstModal, setShowInstModal] = useState(false);
  const [showTransfer, setShowTransfer] = useState(false);
  const [editingAcc, setEditingAcc] = useState<Account | undefined>();
  const [editingInst, setEditingInst] = useState<CreditInstallment | undefined>();
  const [createType, setCreateType] = useState<AccountType | undefined>();
  const [cardSheet, setCardSheet] = useState<{ kind: 'amount' | 'pay'; cardId: string; fromId?: string } | null>(null);
  const [adjustId, setAdjustId] = useState<string | null>(null);

  // Android no maneja dos Modal a la vez: al pasar de una ventana a otra se cierra la actual y se abre la siguiente
  // con una pausa (mismo patrón que SmsPendingSheet).
  const switchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openAfterPause = (fn: () => void) => {
    if (switchTimer.current) clearTimeout(switchTimer.current);
    switchTimer.current = setTimeout(() => { switchTimer.current = null; fn(); }, SWITCH_DELAY_MS);
  };
  useEffect(() => () => { if (switchTimer.current) clearTimeout(switchTimer.current); }, []);

  // «Crearlo ahora» del tutorial: abre el alta de la cuenta o tarjeta que falta.
  useEffect(() => {
    if (!autoCreate) return;
    setActiveTab('accounts');
    setEditingAcc(undefined);
    setCreateType(autoCreate.type);
    setShowAccModal(true);
    onAutoCreateHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCreate?.n]);

  // Editar una cuenta concreta (guía del Inicio / «Crearlo ahora» del tutorial para el corte y pago de la tarjeta).
  useEffect(() => {
    if (!autoEdit) return;
    const target = accounts.find(a => a.id === autoEdit.id);
    if (target) {
      setActiveTab('accounts');
      setCreateType(undefined);
      setEditingAcc(target);
      setShowAccModal(true);
    }
    onAutoEditHandled?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoEdit?.n]);

  // ── Tutorial ──────────────────────────────────────────────
  const rootRef = useTutorialRef('accounts_root');
  const headerRef = useTutorialRef('accounts_header');
  const summaryRef = useTutorialRef('accounts_summary');
  const listRef = useTutorialRef('accounts_list');
  const fabRef = useTutorialRef('accounts_fab');
  const transferBtnRef = useTutorialRef('accounts_transfer_btn');
  const tabsRef = useTutorialRef('accounts_tabs');
  const instListRef = useTutorialRef('accounts_inst_list');
  const stmtRef = useTutorialRef('accounts_card_statement');
  const cycleRef = useTutorialRef('accounts_card_cycle');
  const stmtActionsRef = useTutorialRef('accounts_card_actions');
  const balanceRef = useTutorialRef('accounts_balance');
  const adjustBtnRef = useTutorialRef('accounts_adjust_btn');
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

  // ── Patrimonio neto ──────────────────────────────────────
  const { totalQ, totalUSD, totalEUR, totalGBP } = calcNetWorthFromAccounts(accounts, settings.exchangeRate);
  const { installmentsPendingQ } = calcCreditCommitments(creditInstallments, settings.exchangeRate);
  const totalAssets = totalQ + convertAmount(totalUSD, 'USD', 'Q', settings.exchangeRate);
  const monthlyInstTotal = getMonthlyInstallmentTotal(creditInstallments, settings.exchangeRate);

  const activeAccounts = accounts.filter(a => a.isActive);
  const activeInstallments = creditInstallments.filter(i => i.isActive);
  // El tutorial señala el estado de la primera tarjeta (los refs son únicos)
  const firstCreditId = activeAccounts.find(a => a.type === 'credit')?.id;
  // ...y el saldo de la primera cuenta que no es tarjeta y el botón «Ajustar al saldo real» de la primera automática
  const firstBalanceId = activeAccounts.find(a => a.type !== 'credit')?.id;
  const firstAutoId = activeAccounts.find(a => a.type !== 'credit' && balanceModeOf(a) === 'auto')?.id;
  const adjustAcc = adjustId ? accounts.find(a => a.id === adjustId) : undefined;
  const sheetCard = cardSheet ? accounts.find(a => a.id === cardSheet.cardId) : undefined;
  const sheetStatement = sheetCard ? statementFor(sheetCard, transactions, creditInstallments, new Date()) : null;

  // ── Handlers Cuentas ─────────────────────────────────────
  const handleSaveAccount = async (account: Account) => {
    const previous = accounts.find(a => a.id === account.id);
    const isNew = !previous;
    const linksChanged = (previous?.smsLinks ?? []).join('\n') !== (account.smsLinks ?? []).join('\n');
    try {
      const updated = isNew
        ? await StorageService.addAccount(account)
        : await StorageService.updateAccount(account);
      setAccounts(updated);
      // Si cambiaron los vínculos, se vuelve a asignar la cuenta a los movimientos SMS (no toca saldos)
      if (linksChanged) {
        const relinked = await StorageService.relinkAllTransactions();
        setTransactions(relinked);
      }
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
    // Los cortes ya cumplidos cargan su cuota de una vez (sin esperar al próximo arranque).
    const synced = await StorageService.syncInstallmentCharges();
    if (synced.changed) {
      setTransactions(await StorageService.getTransactions());
      setCreditInstallments(await StorageService.getCreditInstallments());
    }
  };

  const handleDeleteInstallment = async (id: string) => {
    const ok = await dialog.confirm({
      title: 'Eliminar visacuota',
      message: 'Esta visacuota se borrará de forma permanente. Las cuotas que ya se cargaron como gasto se quedan en tus movimientos.',
      confirmLabel: 'Eliminar',
    });
    if (!ok) return;
    const updated = await StorageService.deleteCreditInstallment(id);
    setCreditInstallments(updated);
    setTransactions(await StorageService.getTransactions());
  };

  // ── Handlers Estado de cuenta y pago de tarjeta ───────────
  const handleSaveStatementAmount = async (cardId: string, cutKey: string, amounts: { Q?: number; USD?: number }) => {
    try {
      setAccounts(await StorageService.setStatementOverride(cardId, cutKey, amounts));
    } catch (e) {
      console.warn('[AccountsScreen] No se pudo guardar el monto del estado:', e);
      void dialog.alert({ variant: 'error', title: 'No se pudo guardar', message: 'No se pudo guardar el monto del estado. Intenta de nuevo.' });
    }
  };

  const handleRegisterPayment = async (
    cardId: string, cutKey: string,
    p: { amounts: { Q?: number; USD?: number }; fromAccountId?: string; date: Date },
  ) => {
    try {
      setTransactions(await StorageService.registerCardPayment({ cardId, cutKey, ...p }));
      // El pago resta de la cuenta pagadora si lleva saldo manual.
      setAccounts(await StorageService.getAccounts());
    } catch (e) {
      console.warn('[AccountsScreen] No se pudo registrar el pago:', e);
      void dialog.alert({ variant: 'error', title: 'No se pudo registrar', message: 'No se pudo registrar el pago. Intenta de nuevo.' });
    }
  };

  // ── Handlers Saldo y Transferencia ────────────────────────
  const handleAdjustBalance = async (accountId: string, amount: number, atIso: string) => {
    try {
      setAccounts(await StorageService.setBalanceAnchor(accountId, amount, atIso));
    } catch (e) {
      console.warn('[AccountsScreen] No se pudo ajustar el saldo:', e);
      void dialog.alert({ variant: 'error', title: 'No se pudo ajustar', message: 'No se pudo ajustar el saldo. Intenta de nuevo.' });
    }
  };

  const handleTransfer = async (p: TransferSubmit) => {
    const fromAcc = accounts.find(a => a.id === p.fromId);
    const toAcc = accounts.find(a => a.id === p.toId);
    if (!fromAcc || !toAcc) return;
    if (!hasReliableConversion(fromAcc.currency, toAcc.currency)) return;
    try {
      // El SMS ya llegó: se une a él en vez de crear un movimiento repetido.
      if (p.join.kind !== 'none') {
        const j = p.join;
        const res = await StorageService.joinTransferWithSms({
          outId: j.kind === 'pair' || j.kind === 'out' ? j.outId : undefined,
          inId: j.kind === 'pair' || j.kind === 'in' ? j.inId : undefined,
          fromId: p.fromId, toId: p.toId, toAmount: p.toAmount,
        });
        setAccounts(res.accounts);
        setTransactions(res.transactions);
        return;
      }
      const description = fromAcc.currency !== toAcc.currency && p.toAmount
        ? `Transferencia: ${fromAcc.name} → ${toAcc.name} (${formatMoney(p.amount, fromAcc.currency)} → ${formatMoney(p.toAmount, toAcc.currency)})`
        : `Transferencia: ${fromAcc.name} → ${toAcc.name}`;
      // Un solo movimiento type 'transfer' (neutro); el saldo de las cuentas con saldo manual se ajusta en storage.
      const res = await StorageService.transferBetweenAccounts(p.fromId, p.toId, p.amount, {
        description, date: p.date,
        ...(fromAcc.currency !== toAcc.currency ? { toAmount: p.toAmount } : {}),
      });
      setAccounts(res.accounts);
      setTransactions(res.transactions);
    } catch (e) {
      console.warn('[AccountsScreen] No se pudo registrar la transferencia:', e);
      void dialog.alert({ variant: 'error', title: 'No se pudo registrar', message: 'No se pudo registrar la transferencia. Intenta de nuevo.' });
    }
  };

  const openTransfer = () => {
    if (!canTransfer(accounts)) {
      void dialog.alert({
        variant: 'info', title: 'Necesitas dos cuentas',
        message: 'Para transferir hacen falta al menos dos cuentas que no sean tarjeta de crédito. Crea otra con el botón +.',
      });
      return;
    }
    setShowTransfer(true);
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
              <View ref={canTransfer(accounts) ? transferBtnRef : undefined} collapsable={false}>
                <TouchableOpacity style={s.transferBtn} onPress={openTransfer} accessibilityRole="button" accessibilityLabel="Transferir entre cuentas">
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
              <Money amount={totalAssets} size="md" tone="neutral" decimals={0} align="center" containerStyle={s.summaryMoney} />
              {(totalEUR !== 0 || totalGBP !== 0) && (
                <Text style={s.summarySub}>
                  + {[totalEUR !== 0 ? formatMoney(totalEUR, 'EUR', { decimals: 0 }) : null, totalGBP !== 0 ? formatMoney(totalGBP, '£', { decimals: 0 }) : null].filter(Boolean).join(" · ")}
                </Text>
              )}
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryLbl}>VISACUOTAS PEND.</Text>
              <Money amount={installmentsPendingQ} size="sm" tone="warning" decimals={0} align="center" containerStyle={s.summaryMoney} />
            </View>
            <View style={s.summaryDivider} />
            <View style={s.summaryItem}>
              <Text style={s.summaryLbl}>NETO Q</Text>
              <Money amount={totalQ} size="sm" tone="auto" decimals={0} align="center" containerStyle={s.summaryMoney} />
            </View>
          </View>
          {totalUSD !== 0 && (
            <View style={[s.summaryRow, s.summaryRowSep]}>
              <View style={s.summaryItem}>
                <Text style={s.summaryLbl}>NETO USD</Text>
                <Money amount={totalUSD} currency="USD" size="sm" tone="auto" align="center" containerStyle={s.summaryMoney} />
              </View>
              <View style={s.summaryDivider} />
              <View style={s.summaryItem}>
                <Text style={s.summaryLbl}>CUOTAS/MES</Text>
                <Money amount={monthlyInstTotal} size="sm" tone="warning" decimals={0} align="center" containerStyle={s.summaryMoney} />
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
                  <Money amount={totalEUR} currency="EUR" size="sm" tone="auto" align="center" containerStyle={s.summaryMoney} />
                </View>
              )}
              {totalEUR !== 0 && totalGBP !== 0 && <View style={s.summaryDivider} />}
              {totalGBP !== 0 && (
                <View style={s.summaryItem}>
                  <Text style={s.summaryLbl}>NETO £</Text>
                  <Money amount={totalGBP} currency="£" size="sm" tone="auto" align="center" containerStyle={s.summaryMoney} />
                </View>
              )}
            </View>
          )}
          {activeAccounts.length > 0 && !activeAccounts.some(a => a.type !== 'credit' && balanceModeOf(a) !== 'none') && (
            <Text style={s.summaryNote}>Ninguna cuenta lleva saldo: son cifras en cero. Al editar una cuenta elige Saldo → Manual o Automático.</Text>
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
                const links = smsOn ? (acc.smsLinks ?? []) : [];
                const linksLabel = links.length > 0
                  ? `SMS: ${linkKeyLabel(links[0])}${links.length > 1 ? ` +${links.length - 1}` : ''}`
                  : null;
                const nowCard = new Date();
                const cycle = isCredit ? cycleSpentForCard(transactions, acc, nowCard) : null;
                const stmt = isCredit ? statementFor(acc, transactions, creditInstallments, nowCard) : null;
                const isFirstCard = acc.id === firstCreditId;

                return (
                  <TouchableOpacity
                    key={acc.id}
                    style={s.cardWrap}
                    onLongPress={() => { setEditingAcc(acc); setShowAccModal(true); }}
                    activeOpacity={0.85}
                  >
                    <GlassCard radius={16} blur={false} leftAccentColor={acc.color} contentStyle={s.accCol}>
                      <View style={s.accRowInner}>
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
                        {!isCredit && balanceModeTag(acc) === 'Automático' && (
                          <View style={s.modeBadge}>
                            <Ionicons name="sync-outline" size={10} color={C.primaryLight} />
                            <Text style={s.modeBadgeTxt}>Automático</Text>
                          </View>
                        )}
                        {isCredit && cutoffPaymentLabel && (
                          <Text style={s.accExtra}>{cutoffPaymentLabel}</Text>
                        )}
                        {isCredit && !hasValidCardDates(acc) && (
                          <TouchableOpacity
                            style={s.datesBadge}
                            onPress={() => { setEditingAcc(acc); setShowAccModal(true); }}
                            activeOpacity={0.7}
                            hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                            accessibilityRole="button"
                            accessibilityLabel={`Configurar el corte y el pago de ${acc.name}`}
                          >
                            <Ionicons name="calendar-outline" size={10} color={C.warning} />
                            <Text style={s.datesBadgeTxt} numberOfLines={2}>
                              {acc.cutoffDay || acc.paymentDueDay
                                ? `${acc.cutoffDay ? 'Sin día de pago' : 'Sin día de corte'} · Configurar`
                                : 'Sin corte ni pago · Configurar'}
                            </Text>
                          </TouchableOpacity>
                        )}
                        {isCredit && monthlyTotal > 0 && (
                          <Text style={[s.accExtra, { color: C.warning }]}>
                            Cuota mensual: {formatMoney(monthlyTotal, acc.currency)}
                          </Text>
                        )}
                        {linksLabel && (
                          <View style={s.linkBadge}>
                            <Ionicons name="chatbubble-ellipses-outline" size={10} color={C.accent} />
                            <Text style={s.linkBadgeTxt} numberOfLines={1}>{linksLabel}</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ alignItems: 'flex-end', width: balColW }}>
                        <View ref={acc.id === firstBalanceId ? balanceRef : undefined} collapsable={false} style={{ alignSelf: 'stretch', alignItems: 'flex-end' }}>
                        {isCredit ? (
                          monthlyTotal > 0 ? (
                            <Money amount={monthlyTotal} currency={acc.currency} size="sm" tone="warning" align="right" containerStyle={s.accMoney} />
                          ) : (
                            <Text style={s.noInst}>Sin cuotas activas</Text>
                          )
                        ) : balanceModeOf(acc) === 'none' ? (
                          <Text style={s.noInst}>Sin saldo</Text>
                        ) : (
                          <Money amount={acc.balance} currency={acc.currency} size="md" tone="auto" align="right" containerStyle={s.accMoney} />
                        )}
                        </View>
                        <View style={s.accActions}>
                          <TouchableOpacity
                            onPress={() => { setEditingAcc(acc); setShowAccModal(true); }}
                            style={s.editBtn}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Editar cuenta ${acc.name}`}
                          >
                            <Ionicons name="pencil-outline" size={16} color={C.primaryLight} />
                          </TouchableOpacity>
                          <TouchableOpacity
                            onPress={() => handleDeleteAccount(acc.id)}
                            style={s.deleteBtn}
                            hitSlop={8}
                            accessibilityRole="button"
                            accessibilityLabel={`Eliminar cuenta ${acc.name}`}
                          >
                            <Ionicons name="trash-outline" size={16} color={C.danger} />
                          </TouchableOpacity>
                        </View>
                      </View>
                      </View>
                      {!isCredit && balanceModeOf(acc) === 'auto' && (
                        <View ref={acc.id === firstAutoId ? adjustBtnRef : undefined} collapsable={false} style={s.adjustRow}>
                          <GlassButton
                            kind="ghost" icon="analytics-outline" label="Ajustar al saldo real"
                            onPress={() => setAdjustId(acc.id)}
                            style={s.adjustBtn}
                          />
                        </View>
                      )}
                      {isCredit && stmt && cycle && (
                        <View style={s.stmtBox}>
                          <View ref={isFirstCard ? stmtRef : undefined} collapsable={false}>
                            <View style={s.stmtHead}>
                              <Text style={s.stmtTitle}>Estado al {formatShortDay(stmt.cut)}</Text>
                              <View style={[s.stmtChip, { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive }]}>
                                <Text style={[s.stmtChipTxt, { color: C.primaryLight }]}>{stmt.isEstimated ? 'Estimado' : 'Del estado de cuenta'}</Text>
                              </View>
                              <View style={[s.stmtChip, { borderColor: statusColor(stmt.status) + '55', backgroundColor: statusColor(stmt.status) + '22' }]}>
                                <Text style={[s.stmtChipTxt, { color: statusColor(stmt.status) }]}>{statusLabel(stmt.status)}</Text>
                              </View>
                            </View>
                            <Text style={s.stmtAmounts}>
                              {stmt.toPay.Q > 0 || stmt.toPay.USD > 0
                                ? [stmt.toPay.Q > 0 ? formatMoney(stmt.toPay.Q, 'Q') : null, stmt.toPay.USD > 0 ? formatMoney(stmt.toPay.USD, 'USD') : null].filter(Boolean).join(' · ')
                                : 'Sin saldo en este estado'}
                            </Text>
                            {stmt.status !== 'paid' && stmt.due && (
                              <Text style={[s.accExtra, stmt.status === 'overdue' && { color: C.danger }]}>
                                {stmt.status === 'overdue' ? 'Venció el ' : 'Paga antes del '}{formatShortDay(stmt.due)}
                              </Text>
                            )}
                            {(stmt.paid.Q > 0 || stmt.paid.USD > 0) && (
                              <Text style={s.accExtra}>
                                Pagado: {[stmt.paid.Q > 0 ? formatMoney(stmt.paid.Q, 'Q') : null, stmt.paid.USD > 0 ? formatMoney(stmt.paid.USD, 'USD') : null].filter(Boolean).join(' · ')}
                                {stmt.status !== 'paid' ? ' · Falta: ' + [stmt.remaining.Q > 0 ? formatMoney(stmt.remaining.Q, 'Q') : null, stmt.remaining.USD > 0 ? formatMoney(stmt.remaining.USD, 'USD') : null].filter(Boolean).join(' · ') : ''}
                              </Text>
                            )}
                          </View>
                          <View ref={isFirstCard ? cycleRef : undefined} collapsable={false}>
                            <Text style={[s.accExtra, { color: C.primaryLight }]}>
                              Ciclo abierto: {(cycle.byCurrency.length > 0 ? cycle.byCurrency : [{ currency: cycle.currency, amount: 0 }])
                                .map(c => formatMoney(Math.max(0, c.amount), c.currency)).join(' · ')}
                            </Text>
                          </View>
                          <View ref={isFirstCard ? stmtActionsRef : undefined} collapsable={false} style={s.stmtActions}>
                            <GlassButton
                              kind="secondary" icon="create-outline" label="Ingresar monto real"
                              onPress={() => setCardSheet({ kind: 'amount', cardId: acc.id })}
                              style={s.stmtBtn}
                            />
                            <GlassButton
                              kind="secondary" icon="card-outline" label="Registrar pago"
                              onPress={() => setCardSheet({ kind: 'pay', cardId: acc.id })}
                              style={s.stmtBtn}
                            />
                          </View>
                        </View>
                      )}
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
                const nextCut = nextInstallmentCut(item, acc, new Date());

                return (
                  <View key={item.id} style={s.cardWrap}>
                    <GlassCard radius={16} blur={false} leftAccentColor={acc?.color || C.primary} contentStyle={s.instContent}>
                      <View style={s.instHeader}>
                        <Text style={s.instName}>{item.name}</Text>
                        <Money amount={item.totalAmount} currency={item.currency} size="sm" align="right" />

                      </View>
                      {acc && (
                        <View style={s.instAccRow}>
                          <Ionicons name="card-outline" size={12} color={acc.color} />
                          <Text style={[s.instAccTxt, { color: acc.color }]}>{acc.name}</Text>
                        </View>
                      )}
                      <AnimBar pct={pct} color={acc?.color || C.primary} />
                      {nextCut && (
                        <Text style={[s.accExtra, { fontSize: 11, marginTop: 8 }]}>
                          Próxima cuota: {nextCut.toLocaleDateString('es-GT', { day: '2-digit', month: 'short', year: 'numeric' })}
                        </Text>
                      )}
                      <View style={s.instStats}>
                        <View style={s.instStat}>
                          <Money amount={item.monthlyPayment} currency={item.currency} size="sm" tone="warning" align="center" minScale={0.5} containerStyle={s.summaryMoney} />
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
                          style={s.editBtn}
                          hitSlop={8}
                          accessibilityRole="button"
                          accessibilityLabel={`Editar visacuota ${item.name}`}
                        >
                          <Ionicons name="pencil-outline" size={14} color={C.primaryLight} />
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => handleDeleteInstallment(item.id)}
                          style={s.deleteBtn}
                          hitSlop={8}
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
            if (activeTab === 'accounts') { setEditingAcc(undefined); setCreateType(undefined); setShowAccModal(true); }
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
          defaultType={createType}
          defaultCurrency={settings.currency}
          smsOn={smsOn}
          allAccounts={accounts}
          transactions={transactions}
          onAdjust={(id, amount, atIso) => { void handleAdjustBalance(id, amount, atIso); }}
          onRequestAdjust={id => {
            setShowAccModal(false); setEditingAcc(undefined); setCreateType(undefined);
            openAfterPause(() => setAdjustId(id));
          }}
          onSave={handleSaveAccount}
          onClose={() => { setShowAccModal(false); setEditingAcc(undefined); setCreateType(undefined); }}
        />
      )}
      {cardSheet?.kind === 'amount' && sheetCard && sheetStatement && (
        <StatementAmountSheet
          card={sheetCard}
          statement={sheetStatement}
          onSave={amounts => { void handleSaveStatementAmount(sheetCard.id, sheetStatement.cutKey, amounts); }}
          onClose={() => setCardSheet(null)}
        />
      )}
      {cardSheet?.kind === 'pay' && sheetCard && sheetStatement && (
        <CardPaymentSheet
          card={sheetCard}
          statement={sheetStatement}
          fromChoices={accounts.filter(a => a.isActive && a.type !== 'credit')}
          initialFromId={cardSheet.fromId}
          onSave={p => { void handleRegisterPayment(sheetCard.id, sheetStatement.cutKey, p); }}
          onClose={() => setCardSheet(null)}
        />
      )}
      {showInstModal && (
        <InstallmentModal accounts={accounts} existing={editingInst} customCategories={settings.customCategories} onSave={handleSaveInstallment} onClose={() => { setShowInstModal(false); setEditingInst(undefined); }} />
      )}
      {adjustAcc && (
        <BalanceAdjustSheet
          account={adjustAcc}
          mismatch={smsOn ? smsBalanceMismatch(adjustAcc, transactions) : null}
          onSave={(amount, atIso) => { void handleAdjustBalance(adjustAcc.id, amount, atIso); }}
          onClose={() => setAdjustId(null)}
        />
      )}
      {showTransfer && canTransfer(accounts) && (
        <TransferModal
          accounts={accounts.filter(a => a.isActive)}
          transactions={transactions}
          settings={settings}
          smsOn={smsOn}
          onSave={p => { void handleTransfer(p); }}
          onPayCard={(cardId, fromId) => {
            // Pagar la tarjeta es su propio flujo (estado, monto por moneda): se cierra esta ventana y se abre esa.
            setShowTransfer(false);
            openAfterPause(() => setCardSheet({ kind: 'pay', cardId, fromId }));
          }}
          onClose={() => setShowTransfer(false)}
        />
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
  summaryMoney: { alignSelf: 'stretch' },
  summaryNote: { color: C.textSub, fontSize: 11, lineHeight: 16, marginTop: 10, textAlign: 'center' },
  summarySub: { color: C.textSub, fontSize: 10, marginTop: 2 },
  summaryDivider: { width: 1, height: 32, backgroundColor: C.glassBorder, marginHorizontal: 8 },

  tabs: { marginHorizontal: 16, marginBottom: 16 },

  cardWrap: { marginHorizontal: 16, marginBottom: 10 },
  accCol: { padding: 14, paddingLeft: 17 },
  accRowInner: { flexDirection: 'row', alignItems: 'center' },
  stmtBox: { marginTop: 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: C.glassBorder, gap: 2 },
  stmtHead: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  stmtTitle: { color: C.textPrimary, fontSize: 12, fontWeight: '800' },
  stmtChip: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10, borderWidth: 1 },
  stmtChipTxt: { fontSize: 10, fontWeight: '900', letterSpacing: 0.4 },
  stmtAmounts: { color: C.textPrimary, fontSize: 16, fontWeight: '900', marginTop: 4 },
  stmtActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  stmtBtn: { flexGrow: 1, flexBasis: 140 },
  accIcon: { width: 44, height: 44, borderRadius: 12, alignItems: 'center', justifyContent: 'center', marginRight: 12 },
  nameRow: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 8 },
  accName: { color: C.textPrimary, fontSize: 15, fontWeight: '800', flexShrink: 1 },
  accType: { color: C.textSub, fontSize: 11, marginTop: 2 },
  accExtra: { color: C.textSub, fontSize: 10, marginTop: 3 },
  noInst: { color: C.textSub, fontSize: 12, marginBottom: 4 },
  accMoney: { alignSelf: 'stretch', marginBottom: 4 },
  bankBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bankBadgeTxt: { fontSize: 9, fontWeight: '800' },
  accActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  modeBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', marginTop: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
  modeBadgeTxt: { color: C.primaryLight, fontSize: 9, fontWeight: '800' },
  adjustRow: { marginTop: 8, alignItems: 'flex-start' },
  adjustBtn: { alignSelf: 'flex-start' },
  editBtn: { padding: 8, borderRadius: 8, backgroundColor: C.glassActive, borderWidth: 1, borderColor: C.glassActiveBorder },
  deleteBtn: { padding: 8, borderRadius: 8, backgroundColor: C.danger + '11' },
  linkBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', marginTop: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: C.accent + '55', backgroundColor: C.accent + '22' },
  datesBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', marginTop: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: C.warning + '55', backgroundColor: C.warning + '22' },
  datesBadgeTxt: { color: C.warning, fontSize: 9, fontWeight: '800', flexShrink: 1 },
  linkBadgeTxt: { color: C.accent, fontSize: 9, fontWeight: '800', flexShrink: 1 },

  instContent: { padding: 14, paddingLeft: 17 },
  instHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 6 },
  instName: { color: C.textPrimary, fontSize: 15, fontWeight: '800', flex: 1 },
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
  noBal: { color: C.textSub, fontSize: 12 },
  checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 14, minHeight: 44 },
  checkTitle: { color: C.text, fontSize: 14, fontWeight: '800' },
  input: { backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, padding: 14, color: C.text, fontSize: 15 },
  amtRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: C.glassInput, borderRadius: 12, borderWidth: 1, borderColor: C.glassInputBorder, paddingHorizontal: 14, paddingVertical: 10 },
  amtInput: { flex: 1, color: C.text, fontSize: 18, fontWeight: '700' },
  cur: { color: C.textSub, fontSize: 16, fontWeight: '700', marginRight: 8 },
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
  typeChipTxt: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  colorGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 8 },
  colorDot: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  colorDotActive: { borderWidth: 3, borderColor: C.text },

  subLbl: { color: C.textSub, fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  linkWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  linkChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: '100%', paddingHorizontal: 10, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
  linkChipTxt: { color: C.textPrimary, fontSize: 12, fontWeight: '700', flexShrink: 1 },
  addLinkBox: { marginTop: 10, padding: 12, borderRadius: 14, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
  bankChip: { paddingHorizontal: 12, paddingVertical: 7, borderRadius: 16, borderWidth: 1, borderColor: C.glassInputBorder, backgroundColor: C.glassInput },
  bankChipActive: { borderColor: C.glassActiveBorder, backgroundColor: C.glassActive },
  bankChipTxt: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  addLinkActions: { flexDirection: 'row', gap: 10, marginTop: 12 },

  accSelectRow: { borderWidth: 1, marginBottom: 8 },
  accSelectContent: { flexDirection: 'row', alignItems: 'center', padding: 12, gap: 10 },
  accDot: { width: 12, height: 12, borderRadius: 6 },
  accSelectName: { flex: 1, color: C.text, fontSize: 14, fontWeight: '700' },
  transferArrow: { alignItems: 'center', paddingVertical: 8 },
});
