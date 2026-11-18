// Widget mediano (4x2): tu período de un vistazo (disponible por día, barra del presupuesto, próxima tarjeta,
// próximo gasto fijo, semáforo de capacidad y saldos).
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { capacityLevelLabel } from '../services/NotifUi';
import { AddExpenseButton, BudgetBar, EyeButton, WIDGET_ROOT_STYLE } from './widget-parts';
import { W, amountText, daysText, levelColor, nextCardText, nextFixedText, updatedText } from './widget-view';
import type { WidgetView } from './widget-view';

function Item({ label, value }: { label: string; value: string }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginBottom: 4 }}>
      <TextWidget text={label} maxLines={1} truncate="END" style={{ fontSize: 10, color: W.sub }} />
      <TextWidget text={value} maxLines={1} truncate="END" style={{ fontSize: 11, fontWeight: 'bold', color: W.text }} />
    </FlexWidget>
  );
}

export function BudgetMediumWidget({ view }: { view: WidgetView }) {
  const { snap, hidden } = view;

  if (!snap) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={{ ...WIDGET_ROOT_STYLE, padding: 12, flexDirection: 'column', justifyContent: 'center' }}>
        <TextWidget text="BUDGETMASTER" style={{ fontSize: 9, fontWeight: 'bold', color: W.bronze, letterSpacing: 1 }} />
        <TextWidget text="Abre BudgetMaster para ver tu período de un vistazo" maxLines={3} style={{ fontSize: 13, color: W.sub }} />
      </FlexWidget>
    );
  }

  const cardText = nextCardText(snap, hidden);
  const fixedText = nextFixedText(snap, hidden);
  const balances = snap.balances ?? [];
  const balancesText = balances.slice(0, 2).map(b => `${b.name} ${amountText(hidden, b.amount, b.currency)}`).join(' · ')
    + (balances.length > 2 ? ` · +${balances.length - 2}` : '');
  const perDayNegative = !hidden && snap.availablePerDay < 0;

  return (
    <FlexWidget clickAction="OPEN_APP" style={{ ...WIDGET_ROOT_STYLE, padding: 12, flexDirection: 'column', justifyContent: 'space-between' }}>
      {/* Encabezado: marca, semáforo, + gasto y el ojo */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text="BUDGETMASTER" style={{ fontSize: 9, fontWeight: 'bold', color: W.bronze, letterSpacing: 1 }} />
        <FlexWidget style={{ flex: 1 }} />
        {snap.capacity && (
          <FlexWidget style={{ flexDirection: 'row', alignItems: 'center', marginRight: 8 }}>
            <FlexWidget style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: levelColor(snap.capacity), marginRight: 4 }} />
            <TextWidget text={capacityLevelLabel(snap.capacity)} maxLines={1} style={{ fontSize: 10, color: W.sub }} />
          </FlexWidget>
        )}
        <AddExpenseButton />
        <FlexWidget style={{ width: 6 }} />
        <EyeButton hidden={hidden} />
      </FlexWidget>

      {/* Cuerpo: tu período (izquierda) y lo que viene (derecha) */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row' }}>
        <FlexWidget style={{ flex: 1, flexDirection: 'column', marginRight: 10 }}>
          <TextWidget text="Disponible por día" style={{ fontSize: 10, color: W.sub }} />
          <TextWidget
            text={amountText(hidden, snap.availablePerDay)}
            maxLines={1}
            style={{ fontSize: 22, fontWeight: 'bold', color: perDayNegative ? W.danger : W.text }}
          />
          <TextWidget
            text={`${amountText(hidden, snap.availablePeriod)} · ${daysText(snap.daysToPay)}`}
            maxLines={1}
            truncate="END"
            style={{ fontSize: 11, color: W.bronze }}
          />
          {snap.hasBudget && (
            <FlexWidget style={{ flexDirection: 'column', marginTop: 4 }}>
              <BudgetBar pct={snap.budgetPct} />
              <TextWidget text={`${snap.budgetPct}% del presupuesto`} style={{ fontSize: 9, color: W.sub }} />
            </FlexWidget>
          )}
        </FlexWidget>
        <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
          {snap.nextCard && cardText && <Item label={`Tarjeta ${snap.nextCard.name}`} value={cardText} />}
          {snap.nextFixed && fixedText && <Item label={`Fijo: ${snap.nextFixed.name}`} value={fixedText} />}
          {!cardText && !fixedText && (
            <TextWidget text="Sin pagos próximos" style={{ fontSize: 11, color: W.sub }} />
          )}
        </FlexWidget>
      </FlexWidget>

      {/* Pie: saldos de las cuentas con seguimiento y la hora de la foto */}
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        {balances.length > 0 && (
          <TextWidget text={balancesText} maxLines={1} truncate="END" style={{ fontSize: 10, color: W.sub }} />
        )}
        <FlexWidget style={{ flex: 1 }} />
        <TextWidget text={updatedText(snap.updatedAt)} style={{ fontSize: 9, color: W.muted }} />
      </FlexWidget>
    </FlexWidget>
  );
}
