// Widget pequeño (2x2): lo disponible del período y los días al cobro.
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { AddExpenseButton, EyeButton, WIDGET_ROOT_STYLE } from './widget-parts';
import { W, amountText, daysText, emptyText } from './widget-view';
import type { WidgetView } from './widget-view';

export function BudgetSmallWidget({ view }: { view: WidgetView }) {
  const { snap, hidden } = view;
  return (
    <FlexWidget clickAction="OPEN_APP" style={{ ...WIDGET_ROOT_STYLE, padding: 12, flexDirection: 'column', justifyContent: 'space-between' }}>
      <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
        <TextWidget text="BUDGETMASTER" style={{ fontSize: 9, fontWeight: 'bold', color: W.bronze, letterSpacing: 1 }} />
        <FlexWidget style={{ flex: 1 }} />
        <AddExpenseButton compact />
        <FlexWidget style={{ width: 6 }} />
        <EyeButton hidden={hidden} />
      </FlexWidget>
      {snap ? (
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'column' }}>
          <TextWidget text="Disponible" style={{ fontSize: 11, color: W.sub }} />
          <TextWidget
            text={amountText(hidden, snap.availablePeriod)}
            maxLines={1}
            style={{ fontSize: 22, fontWeight: 'bold', color: !hidden && snap.availablePeriod < 0 ? W.danger : W.text }}
          />
          <TextWidget text={daysText(snap)} style={{ fontSize: 12, color: W.bronze }} />
        </FlexWidget>
      ) : (
        <TextWidget text={emptyText(view, 'Abre BudgetMaster para ver tu resumen')} maxLines={3} style={{ fontSize: 12, color: W.sub }} />
      )}
    </FlexWidget>
  );
}
