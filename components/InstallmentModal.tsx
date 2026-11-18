import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import React, { useRef, useState } from "react";
import {
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import {
  Account, CreditInstallment, Currency, CustomCategory,
  formatDateOnly, parseAmount, parseDateOnly, storedDateToDateOnly
} from "../services/storage";
import { getAllExpenseCategories } from "../categories";
import { suggestInstallmentCount } from "../services/InstallmentMath";
import { C } from "../theme";
import { GlassButton } from "./GlassButton";
import { GlassSheet } from "./GlassSheet";
import { InlineNotice } from "./InlineNotice";

// ─────────────────────────────────────────────────────────────
// MODAL — NUEVA / EDITAR VISACUOTA
// ─────────────────────────────────────────────────────────────
interface Props {
  accounts: Account[];
  onSave: (i: CreditInstallment) => void;
  onClose: () => void;
  existing?: CreditInstallment;
  prefill?: { name?: string; total?: string; currency?: Currency };
  /** Categorías creadas por el usuario (settings.customCategories): se muestran junto a las predefinidas. */
  customCategories?: CustomCategory[];
}

export default function InstallmentModal({ accounts, onSave, onClose, existing, prefill, customCategories }: Props) {
  const categories = getAllExpenseCategories(customCategories);
  const creditAccounts = accounts.filter(a => a.type === 'credit' && a.isActive);
  // '' = préstamo sin tarjeta (por ejemplo una deuda del onboarding): al editarla no se le asigna una tarjeta sola.
  const [accountId, setAccountId] = useState(existing ? existing.accountId : (creditAccounts[0]?.id ?? ''));
  const [dueDay, setDueDay] = useState(existing?.dueDay?.toString() || '');
  const [name, setName] = useState(existing?.name || prefill?.name || '');
  const [total, setTotal] = useState(existing?.totalAmount.toString() || prefill?.total || '');
  const [monthly, setMonthly] = useState(existing?.monthlyPayment.toString() || '');
  const [installments, setInstallments] = useState(existing?.totalInstallments.toString() || '');
  const [category, setCategory] = useState(existing?.category || 'shopping');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [paidInstallments, setPaidInstallments] = useState(existing?.paidInstallments?.toString() || '0');
  const [startDate, setStartDate] = useState(existing?.startDate ? storedDateToDateOnly(existing.startDate) : formatDateOnly(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [error, setError] = useState('');

  const selectedAcc = accounts.find(a => a.id === accountId);
  const effectiveCurrency: Currency = existing?.currency || prefill?.currency || selectedAcc?.currency || 'Q';

  // Cada cambio en un campo limpia el aviso de error
  const ch = (set: (v: string) => void) => (v: string) => { set(v); setError(''); };

  // Auto-calcular cuotas al cambiar total/mensual. Al editar una visacuota existente no se recalcula
  // al abrir: se respeta el número de cuotas guardado hasta que la persona cambie el total o la cuota.
  const skipAutoCalc = useRef(!!existing);
  React.useEffect(() => {
    if (skipAutoCalc.current) { skipAutoCalc.current = false; return; }
    const n = suggestInstallmentCount(parseAmount(total), parseAmount(monthly));
    if (n > 0) setInstallments(n.toString());
  }, [total, monthly]);

  const handleSave = () => {
    if (!name.trim()) { setError('Ingresa el nombre de la compra.'); return; }
    const t = parseAmount(total);
    const m = parseAmount(monthly);
    const n = parseInt(installments);
    if (isNaN(t) || isNaN(m) || isNaN(n)) { setError('Ingresa montos válidos.'); return; }
    if (t <= 0 || m <= 0 || n < 1) { setError('El monto total, la cuota mensual y el total de cuotas deben ser mayores a 0.'); return; }

    const paid = parseInt(paidInstallments);
    if (isNaN(paid) || paid < 0 || paid >= n) {
      setError('Las cuotas ya pagadas deben ser un número entre 0 y el total de cuotas menos 1.');
      return;
    }

    let parsedDueDay: number | undefined;
    if (!accountId && dueDay.trim()) {
      parsedDueDay = parseInt(dueDay, 10);
      if (isNaN(parsedDueDay) || parsedDueDay < 1 || parsedDueDay > 31) { setError('El día de pago debe estar entre 1 y 31.'); return; }
    }

    const parsedStart = parseDateOnly(startDate);
    const validStartDate = parsedStart ? parsedStart.toISOString() : (existing?.startDate || new Date().toISOString());

    const item: CreditInstallment = {
      ...(existing ?? {}),
      id: existing?.id || `ci_${Date.now()}`,
      accountId,
      name: name.trim(),
      totalAmount: t,
      monthlyPayment: m,
      totalInstallments: n,
      paidInstallments: paid,
      startDate: validStartDate,
      currency: effectiveCurrency,
      category,
      isActive: true,
      notes: notes.trim() || undefined,
      dueDay: parsedDueDay,
    };
    onSave(item);
    onClose();
  };

  return (
    <GlassSheet
      onClose={onClose}
      title={`${existing ? 'Editar' : 'Nueva'} Visacuota`}
      footer={(
        <View style={md.footer}>
          {!!error && <InlineNotice variant="error" text={error} />}
          <GlassButton label="Guardar Visacuota" icon="card-outline" onPress={handleSave} />
        </View>
      )}
    >
      <>
          <Text style={md.lbl}>TARJETA DE CRÉDITO</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <TouchableOpacity style={[md.typeChip, accountId === '' && { borderColor: C.primary, backgroundColor: C.glassActive }]} onPress={() => { setAccountId(''); setError(''); }}>
                <Ionicons name="cash-outline" size={16} color={accountId === '' ? C.primaryLight : C.textSub} />
                <Text style={[md.typeChipTxt, accountId === '' && { color: C.primaryLight }]}>Sin tarjeta (préstamo)</Text>
              </TouchableOpacity>
              {creditAccounts.map(acc => (
                <TouchableOpacity key={acc.id} style={[md.typeChip, accountId === acc.id && { borderColor: acc.color, backgroundColor: acc.color + '22' }]} onPress={() => { setAccountId(acc.id); setError(''); }}>
                  <Ionicons name="card-outline" size={16} color={accountId === acc.id ? acc.color : C.textSub} />
                  <Text style={[md.typeChipTxt, accountId === acc.id && { color: acc.color }]}>{acc.name}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
          {creditAccounts.length === 0 && accountId === '' && (
            <Text style={md.hint}>Para una compra con tarjeta, primero agrega la tarjeta en la sección de Cuentas (con su día de corte).</Text>
          )}

          <Text style={md.lbl}>NOMBRE DE LA COMPRA</Text>
          <TextInput style={md.input} value={name} onChangeText={ch(setName)} placeholder="Ej: Laptop, Celular, Refrigeradora..." placeholderTextColor={C.textMuted} autoFocus />

          <Text style={md.lbl}>MONTO TOTAL</Text>
          <View style={md.amtRow}>
            <Text style={md.cur}>{effectiveCurrency}</Text>
            <TextInput style={md.amtInput} value={total} onChangeText={ch(setTotal)} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
          </View>

          <Text style={md.lbl}>CUOTA MENSUAL</Text>
          <View style={md.amtRow}>
            <Text style={md.cur}>{effectiveCurrency}</Text>
            <TextInput style={md.amtInput} value={monthly} onChangeText={ch(setMonthly)} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
          </View>

          <Text style={md.lbl}>TOTAL DE CUOTAS (auto-calculado)</Text>
          <View style={md.amtRow}>
            <TextInput style={md.amtInput} value={installments} onChangeText={ch(setInstallments)} placeholder="0" placeholderTextColor={C.textMuted} keyboardType="numeric" />
            <Text style={md.cur}>cuotas</Text>
          </View>
          <Text style={md.hint}>
            {accountId
              ? 'Cada corte de tu tarjeta la app carga una cuota como gasto en tu período (no la compra completa).'
              : 'Cada mes, el día de pago, la app carga una cuota como gasto en tu período.'}
          </Text>

          <Text style={md.lbl}>CUOTAS YA PAGADAS</Text>
          <View style={md.amtRow}>
            <TextInput style={md.amtInput} value={paidInstallments} onChangeText={ch(setPaidInstallments)} placeholder="0" placeholderTextColor={C.textMuted} keyboardType="numeric" />
            <Text style={md.cur}>de {installments || '0'}</Text>
          </View>
          <Text style={md.hint}>Si ya pagaste algunas cuotas antes de registrar esta compra, indícalo aquí: a partir de ahora la app carga las siguientes.</Text>

          {!accountId && (
            <>
              <Text style={md.lbl}>DÍA DE PAGO (opcional)</Text>
              <TextInput style={md.input} value={dueDay} onChangeText={ch(setDueDay)} placeholder="Ej: 15 (si lo dejas vacío, el día de la fecha de inicio)" placeholderTextColor={C.textMuted} keyboardType="number-pad" maxLength={2} />
              <Text style={md.hint}>El día del mes en que se carga la cuota de este préstamo.</Text>
            </>
          )}

          <Text style={md.lbl}>FECHA DE INICIO</Text>
          <TouchableOpacity style={md.amtRow} onPress={() => setShowDatePicker(true)}>
            <Ionicons name="calendar-outline" size={16} color={C.textSub} style={{ marginRight: 8 }} />
            <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
              {(parseDateOnly(startDate) ?? new Date()).toLocaleDateString('es-GT', { day: '2-digit', month: 'long', year: 'numeric' })}
            </Text>
          </TouchableOpacity>
          {showDatePicker && (
            <DateTimePicker
              value={parseDateOnly(startDate) ?? new Date()}
              mode="date"
              onChange={(event, selectedDate) => {
                setShowDatePicker(false);
                if (event.type !== 'dismissed' && selectedDate) {
                  setStartDate(formatDateOnly(selectedDate));
                }
              }}
            />
          )}

          <Text style={md.lbl}>CATEGORÍA</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ marginBottom: 16 }}>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              {categories.map(cat => (
                <TouchableOpacity key={cat.id} style={[md.typeChip, category === cat.id && { borderColor: cat.color, backgroundColor: cat.color + '22' }]} onPress={() => setCategory(cat.id)}>
                  <Ionicons name={cat.icon} size={14} color={category === cat.id ? cat.color : C.textSub} />
                  <Text style={[md.typeChipTxt, category === cat.id && { color: cat.color }]}>{cat.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>

          <Text style={md.lbl}>NOTAS (Opcional)</Text>
          <TextInput style={md.input} value={notes} onChangeText={ch(setNotes)} placeholder="Ej: Comprado en Elektra, 12 cuotas sin interés..." placeholderTextColor={C.textMuted} />
      </>
      <View style={{ height: 16 }} />
    </GlassSheet>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS (duplicados de AccountsScreen.tsx: importarlos crearía un ciclo de imports)
// ─────────────────────────────────────────────────────────────
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
});
