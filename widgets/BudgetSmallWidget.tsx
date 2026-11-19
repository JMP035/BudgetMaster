// Widget pequeño (2x2): lo disponible del período y los días al cobro. Estilo Liquid Glass (ver widget-style.ts).
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { headerLayout, heroFontSize } from '../services/WidgetFormat';
import { AddExpenseButton, EyeButton, GlassSheen, WIDGET_ROOT_STYLE } from './widget-parts';
import { W, amountText, daysText, emptyText } from './widget-view';
import type { WidgetSize, WidgetView } from './widget-view';

export function BudgetSmallWidget({ view, size }: { view: WidgetView; size: WidgetSize }) {
  const { snap, hidden } = view;
  const { showBrand } = headerLayout(size.width);
  const heroText = snap ? amountText(hidden, snap.availablePeriod) : '';
  const heroSize = heroFontSize(heroText, size.width - 28);
  const negative = !!snap && !hidden && snap.availablePeriod < 0;
  // Positiva: bronce claro con un resplandor tenue (no hay texto con degradado en un widget). Negativa u oculta: plana.
  const heroStyle = negative
    ? { fontSize: heroSize, fontWeight: 'bold' as const, color: W.danger, adjustsFontSizeToFit: true }
    : hidden
      ? { fontSize: heroSize, fontWeight: 'bold' as const, color: W.text, adjustsFontSizeToFit: true }
      : {
        fontSize: heroSize, fontWeight: 'bold' as const, color: W.bronze, adjustsFontSizeToFit: true,
        textShadowColor: W.edge, textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 },
      };

  return (
    <FlexWidget clickAction="OPEN_APP" style={WIDGET_ROOT_STYLE}>
      <GlassSheen width={size.width} />
      <FlexWidget
        style={{
          width: 'match_parent', flex: 1, flexDirection: 'column', justifyContent: 'flex-start',
          padding: 12, paddingRight: 14,
        }}
      >
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
          {showBrand && <TextWidget text="BUDGETMASTER" style={{ fontSize: 8, fontWeight: 'bold', color: W.textPrimary }} />}
          <FlexWidget style={{ flex: 1 }} />
          <AddExpenseButton compact />
          <FlexWidget style={{ width: 6 }} />
          <EyeButton hidden={hidden} />
        </FlexWidget>
        <FlexWidget style={{ width: 'match_parent', height: 10 }} />
        {snap ? (
          <FlexWidget style={{ width: 'match_parent', flexDirection: 'column' }}>
            <TextWidget text="Disponible" maxLines={1} truncate="END" style={{ fontSize: 11, color: W.sub }} />
            <TextWidget
              text={heroText}
              maxLines={1}
              truncate="END"
              style={{ ...heroStyle, width: 'match_parent' }}
            />
            <TextWidget text={daysText(snap)} maxLines={1} truncate="END" style={{ fontSize: 12, color: W.bronze }} />
          </FlexWidget>
        ) : (
          <TextWidget text={emptyText(view, 'Abre BudgetMaster para ver tu resumen')} maxLines={3} style={{ fontSize: 12, color: W.sub }} />
        )}
        <FlexWidget style={{ flex: 1 }} />
      </FlexWidget>
    </FlexWidget>
  );
}
