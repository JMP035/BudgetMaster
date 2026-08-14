import DateTimePicker from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import {
  Alert, KeyboardAvoidingView, Modal, Platform,
  ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View
} from "react-native";
import {
  Account, CreditInstallment, Currency
} from "../services/storage";
import { EXPENSE_CATEGORIES } from "../categories";
import { C, shadow } from "../theme";

// ─────────────────────────────────────────────────────────────
// MODAL — NUEVA / EDITAR VISACUOTA
// ─────────────────────────────────────────────────────────────
interface Props {
  accounts: Account[];
  onSave: (i: CreditInstallment) => void;
  onClose: () => void;
  existing?: CreditInstallment;
  prefill?: { name?: string; total?: string; currency?: Currency };
}

export default function InstallmentModal({ accounts, onSave, onClose, existing, prefill }: Props) {
  const creditAccounts = accounts.filter(a => a.type === 'credit' && a.isActive);
  const [accountId, setAccountId] = useState(existing?.accountId || creditAccounts[0]?.id || '');
  const [name, setName] = useState(existing?.name || prefill?.name || '');
  const [total, setTotal] = useState(existing?.totalAmount.toString() || prefill?.total || '');
  const [monthly, setMonthly] = useState(existing?.monthlyPayment.toString() || '');
  const [installments, setInstallments] = useState(existing?.totalInstallments.toString() || '');
  const [category, setCategory] = useState(existing?.category || 'shopping');
  const [notes, setNotes] = useState(existing?.notes || '');
  const [paidInstallments, setPaidInstallments] = useState(existing?.paidInstallments?.toString() || '0');
  const [startDate, setStartDate] = useState(existing?.startDate?.slice(0, 10) || new Date().toISOString().slice(0, 10));
  const [showDatePicker, setShowDatePicker] = useState(false);

  const selectedAcc = accounts.find(a => a.id === accountId);

  // Auto-calcular cuotas al cambiar total/mensual
  React.useEffect(() => {
    const t = parseFloat(total);
    const m = parseFloat(monthly);
    if (t > 0 && m > 0) setInstallments(Math.ceil(t / m).toString());
  }, [total, monthly]);

  const handleSave = () => {
    if (!name.trim()) { Alert.alert('Error', 'Ingresa el nombre de la compra.'); return; }
    if (!accountId) { Alert.alert('Error', 'Selecciona una tarjeta de crédito.'); return; }
    const t = parseFloat(total.replace(',', '.'));
    const m = parseFloat(monthly.replace(',', '.'));
    const n = parseInt(installments);
    if (isNaN(t) || isNaN(m) || isNaN(n)) { Alert.alert('Error', 'Ingresa montos válidos.'); return; }

    const paid = parseInt(paidInstallments);
    if (isNaN(paid) || paid < 0 || paid >= n) {
      Alert.alert('Error', 'Las cuotas ya pagadas deben ser un número entre 0 y el total de cuotas menos 1.');
      return;
    }

    let validStartDate = existing?.startDate || new Date().toISOString();
    if (/^\d{4}-\d{2}-\d{2}$/.test(startDate) && !isNaN(new Date(startDate).getTime())) {
      validStartDate = new Date(startDate).toISOString();
    }

    const item: CreditInstallment = {
      id: existing?.id || `ci_${Date.now()}`,
      accountId,
      name: name.trim(),
      totalAmount: t,
      monthlyPayment: m,
      totalInstallments: n,
      paidInstallments: paid,
      startDate: validStartDate,
      currency: prefill?.currency || selectedAcc?.currency || 'Q',
      category,
      isActive: true,
      notes: notes.trim() || undefined,
    };
    onSave(item);
    onClose();
  };

  return (
    <Modal visible animationType="slide" transparent onRequestClose={onClose}>
      <View style={md.overlay}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width: '100%' }}>
          <View style={md.sheet}>
            <View style={md.header}>
              <Text style={md.title}>{existing ? 'Editar' : 'Nueva'} Visacuota</Text>
              <TouchableOpacity onPress={onClose} style={md.closeBtn}>
                <Ionicons name="close" size={22} color={C.textMuted} />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false}>
              {creditAccounts.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Ionicons name="card-outline" size={48} color={C.textMuted} />
                  <Text style={{ color: C.textMuted, fontSize: 14, textAlign: 'center', marginTop: 12 }}>
                    Primero agrega una tarjeta de crédito en la sección de Cuentas.
                  </Text>
                </View>
              ) : (
                <>
                  <Text style={md.lbl}>TARJETA DE CRÉDITO</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {creditAccounts.map(acc => (
                        <TouchableOpacity key={acc.id} style={[md.typeChip, accountId === acc.id && { borderColor: acc.color, backgroundColor: acc.color + '22' }]} onPress={() => setAccountId(acc.id)}>
                          <Ionicons name="card-outline" size={16} color={accountId === acc.id ? acc.color : C.textMuted} />
                          <Text style={[md.typeChipTxt, accountId === acc.id && { color: acc.color }]}>{acc.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={md.lbl}>NOMBRE DE LA COMPRA</Text>
                  <TextInput style={md.input} value={name} onChangeText={setName} placeholder="Ej: Laptop, Celular, Refrigeradora..." placeholderTextColor={C.textMuted} autoFocus />

                  <Text style={md.lbl}>MONTO TOTAL</Text>
                  <View style={md.amtRow}>
                    <Text style={md.cur}>{selectedAcc?.currency || 'Q'}</Text>
                    <TextInput style={md.amtInput} value={total} onChangeText={setTotal} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
                  </View>

                  <Text style={md.lbl}>CUOTA MENSUAL</Text>
                  <View style={md.amtRow}>
                    <Text style={md.cur}>{selectedAcc?.currency || 'Q'}</Text>
                    <TextInput style={md.amtInput} value={monthly} onChangeText={setMonthly} placeholder="0.00" placeholderTextColor={C.textMuted} keyboardType="decimal-pad" />
                  </View>

                  <Text style={md.lbl}>TOTAL DE CUOTAS (auto-calculado)</Text>
                  <View style={md.amtRow}>
                    <TextInput style={md.amtInput} value={installments} onChangeText={setInstallments} placeholder="0" placeholderTextColor={C.textMuted} keyboardType="numeric" />
                    <Text style={md.cur}>cuotas</Text>
                  </View>
                  <Text style={md.hint}>La app descuenta una cuota automáticamente cada mes.</Text>

                  <Text style={md.lbl}>CUOTAS YA PAGADAS</Text>
                  <View style={md.amtRow}>
                    <TextInput style={md.amtInput} value={paidInstallments} onChangeText={setPaidInstallments} placeholder="0" placeholderTextColor={C.textMuted} keyboardType="numeric" />
                    <Text style={md.cur}>de {installments || '0'}</Text>
                  </View>
                  <Text style={md.hint}>Si ya pagaste algunas cuotas antes de registrar esta compra, indícalo aquí.</Text>

                  <Text style={md.lbl}>FECHA DE INICIO</Text>
                  <TouchableOpacity style={md.amtRow} onPress={() => setShowDatePicker(true)}>
                    <Ionicons name="calendar-outline" size={16} color={C.textMuted} style={{ marginRight: 8 }} />
                    <Text style={{ color: C.text, fontSize: 15, fontWeight: '700' }}>
                      {new Date(startDate).toLocaleDateString('es-GT', { day: '2-digit', month: 'long', year: 'numeric' })}
                    </Text>
                  </TouchableOpacity>
                  {showDatePicker && (
                    <DateTimePicker
                      value={new Date(startDate)}
                      mode="date"
                      onChange={(event, selectedDate) => {
                        setShowDatePicker(false);
                        if (event.type !== 'dismissed' && selectedDate) {
                          setStartDate(selectedDate.toISOString().slice(0, 10));
                        }
                      }}
                    />
                  )}

                  <Text style={md.lbl}>CATEGORÍA</Text>
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                      {EXPENSE_CATEGORIES.slice(0, 10).map(cat => (
                        <TouchableOpacity key={cat.id} style={[md.typeChip, category === cat.id && { borderColor: cat.color, backgroundColor: cat.color + '22' }]} onPress={() => setCategory(cat.id)}>
                          <Ionicons name={cat.icon} size={14} color={category === cat.id ? cat.color : C.textMuted} />
                          <Text style={[md.typeChipTxt, category === cat.id && { color: cat.color }]}>{cat.label}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </ScrollView>

                  <Text style={md.lbl}>NOTAS (Opcional)</Text>
                  <TextInput style={md.input} value={notes} onChangeText={setNotes} placeholder="Ej: Comprado en Elektra, 12 cuotas sin interés..." placeholderTextColor={C.textMuted} />

                  <TouchableOpacity style={md.saveBtn} onPress={handleSave}>
                    <Ionicons name="card-outline" size={20} color="#1A0E00" />
                    <Text style={md.saveBtnTxt}>Guardar Visacuota</Text>
                  </TouchableOpacity>
                </>
              )}
              <View style={{ height: 40 }} />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

// ─────────────────────────────────────────────────────────────
// ESTILOS (duplicados de AccountsScreen.tsx — ver nota en ese archivo)
// ─────────────────────────────────────────────────────────────
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
  typeChip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 20, borderWidth: 1, borderColor: C.cardBorder, backgroundColor: C.bgDeep },
  typeChipTxt: { color: C.textSub, fontSize: 12, fontWeight: '700' },
  saveBtn: { flexDirection: 'row', backgroundColor: C.primary, borderRadius: 14, paddingVertical: 16, alignItems: 'center', justifyContent: 'center', gap: 10, marginTop: 20, ...shadow(C.primaryGlow, 10, 0.4) },
  saveBtnTxt: { color: '#1A0E00', fontSize: 15, fontWeight: '900' },
});
