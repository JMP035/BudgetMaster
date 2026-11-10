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
  Currency, SmsLinkSeen, StorageService, Transaction, UserSettings,
  calcCreditCommitments, calcNetWorthFromAccounts, convertAmount,
  getAccountMonthlyInstallmentTotal, getMonthlyInstallmentTotal, hasReliableConversion,
  parseAmount, parseDateOnly, storedDateToDateOnly
} from "../services/storage";
import { cycleSpentForCard, linkKeyLabel } from "../services/AccountLinking";
import { detectBankName } from "../services/BankSmsParser";
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
export function AccountModal({ onSave, onClose, existing, defaultType, defaultCurrency, smsOn = false, allAccounts }: {
  onSave: (a: Account) => void; onClose: () => void; existing?: Account; defaultType?: AccountType;
  defaultCurrency?: Currency;
  /** Muestra la sección de mensajes (SMS) que actualizan la cuenta. Apagado = oculta. */
  smsOn?: boolean;
  /** Todas las cuentas, para avisar si otra ya usa la misma clave de vínculo. */
  allAccounts?: Account[];
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

    const linksChanged = [...smsLinks].sort().join('\n') !== [...(existing?.smsLinks ?? [])].sort().join('\n');
    const smsFields = {
      smsLinks: smsLinks.length > 0 ? smsLinks : undefined,
      smsLinkedAt: linksChanged ? new Date().toISOString() : existing?.smsLinkedAt,
      smsAutoBalance: existing?.smsAutoBalance,
      balanceAnchorAt: existing?.balanceAnchorAt,
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
        ...smsFields,
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
            Vincular no cambia saldos pasados: por ahora solo organiza tus movimientos por cuenta.
          </Text>
          {type === 'credit' && (
            <Text style={md.hint}>
              Las tarjetas no llevan saldo en la app: verás «Consumido este ciclo».
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
        <Money amount={acc.balance} currency={acc.currency} size="sm" gradient={false} align="right" />
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
          Se acreditarán {formatMoney(convertedPreview, toAcc!.currency)} en {toAcc!.name} (tipo de cambio Q {settings.exchangeRate}/USD)
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

  // ── Patrimonio neto ──────────────────────────────────────
  const { totalQ, totalUSD, totalEUR, totalGBP } = calcNetWorthFromAccounts(accounts, settings.exchangeRate);
  const { installmentsPendingQ } = calcCreditCommitments(creditInstallments, settings.exchangeRate);
  const totalAssets = totalQ + convertAmount(totalUSD, 'USD', 'Q', settings.exchangeRate);
  const monthlyInstTotal = getMonthlyInstallmentTotal(creditInstallments, settings.exchangeRate);

  const activeAccounts = accounts.filter(a => a.isActive);
  const activeInstallments = creditInstallments.filter(i => i.isActive);

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
      ? `Transferencia: ${fromAcc.name} → ${toAcc.name} (${formatMoney(amount, fromAcc.currency)} → ${formatMoney(amountToCredit, toAcc.currency)})`
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
                const cycle = smsOn && isCredit ? cycleSpentForCard(transactions, acc, new Date()) : null;

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
                            Cuota mensual: {formatMoney(monthlyTotal, acc.currency)}
                          </Text>
                        )}
                        {cycle && (
                          <Text style={[s.accExtra, { color: C.primaryLight }]}>
                            Consumido este ciclo: {formatMoney(cycle.amount, cycle.currency)}
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
                        {isCredit ? (
                          monthlyTotal > 0 ? (
                            <Money amount={monthlyTotal} currency={acc.currency} size="sm" tone="warning" align="right" containerStyle={s.accMoney} />
                          ) : (
                            <Text style={s.noInst}>Sin cuotas activas</Text>
                          )
                        ) : (
                          <Money amount={acc.balance} currency={acc.currency} size="md" tone="auto" align="right" containerStyle={s.accMoney} />
                        )}
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
                        <Money amount={item.totalAmount} currency={item.currency} size="sm" align="right" />

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
          smsOn={smsOn}
          allAccounts={accounts}
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
  summaryMoney: { alignSelf: 'stretch' },
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
  accMoney: { alignSelf: 'stretch', marginBottom: 4 },
  bankBadge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6 },
  bankBadgeTxt: { fontSize: 9, fontWeight: '800' },
  accActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  editBtn: { padding: 8, borderRadius: 8, backgroundColor: C.glassActive, borderWidth: 1, borderColor: C.glassActiveBorder },
  deleteBtn: { padding: 8, borderRadius: 8, backgroundColor: C.danger + '11' },
  linkBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, alignSelf: 'flex-start', maxWidth: '100%', marginTop: 5, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, borderColor: C.accent + '55', backgroundColor: C.accent + '22' },
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
