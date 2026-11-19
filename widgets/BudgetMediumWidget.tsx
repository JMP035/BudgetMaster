// Widget mediano (4x2): tu período de un vistazo (disponible por día, barra del presupuesto, próxima tarjeta,
// próximo gasto fijo, semáforo de capacidad y saldos). Estilo Liquid Glass (ver widget-style.ts).
import React from 'react';
import { FlexWidget, TextWidget } from 'react-native-android-widget';
import { capacityLevelLabel } from '../services/NotifUi';
import { balancesLine, heroFontSize } from '../services/WidgetFormat';
import { AddExpenseButton, BudgetBar, EyeButton, GlassSheen, WIDGET_ROOT_STYLE } from './widget-parts';
import { W, amountText, daysText, emptyText, levelColor, nextCardText, nextFixedText, updatedText } from './widget-view';
import type { WidgetSize, WidgetView } from './widget-view';

function Item({ label, value, lines = 1 }: { label: string; value: string; lines?: number }) {
  return (
    <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginBottom: 4 }}>
      <TextWidget text={label} maxLines={1} truncate="END" style={{ fontSize: 10, color: W.sub }} />
      <TextWidget text={value} maxLines={lines} truncate="END" style={{ fontSize: 11, fontWeight: 'bold', color: W.text }} />
    </FlexWidget>
  );
}

export function BudgetMediumWidget({ view, size }: { view: WidgetView; size: WidgetSize }) {
  const { snap, hidden } = view;

  if (!snap) {
    return (
      <FlexWidget clickAction="OPEN_APP" style={WIDGET_ROOT_STYLE}>
        <GlassSheen width={size.width} />
        <FlexWidget style={{ width: 'match_parent', flex: 1, flexDirection: 'column', justifyContent: 'center', padding: 12, paddingRight: 14 }}>
          <TextWidget text="BUDGETMASTER" style={{ fontSize: 8, fontWeight: 'bold', color: W.textPrimary }} />
          <TextWidget text={emptyText(view, 'Abre BudgetMaster para ver tu período de un vistazo')} maxLines={3} style={{ fontSize: 13, color: W.sub }} />
        </FlexWidget>
      </FlexWidget>
    );
  }

  const cardText = nextCardText(snap, hidden);
  const fixedText = nextFixedText(snap, hidden);
  const balances = snap.balances ?? [];
  const balancesText = balancesLine(balances, hidden);
  const perDayNegative = !hidden && snap.availablePerDay < 0;

  // Columna izquierda: la mitad del ancho útil (12 + 14 de padding y 10 de separación entre columnas).
  const colW = Math.max(60, (size.width - 26 - 10) / 2);
  const heroText = amountText(hidden, snap.availablePerDay);
  const heroSize = heroFontSize(heroText, colW);
  const heroStyle = perDayNegative
    ? { fontSize: heroSize, fontWeight: 'bold' as const, color: W.danger, adjustsFontSizeToFit: true }
    : hidden
      ? { fontSize: heroSize, fontWeight: 'bold' as const, color: W.text, adjustsFontSizeToFit: true }
      : {
        fontSize: heroSize, fontWeight: 'bold' as const, color: W.bronze, adjustsFontSizeToFit: true,
        textShadowColor: W.edge, textShadowRadius: 6, textShadowOffset: { width: 0, height: 0 },
      };
  const levelLabel = snap.capacity ? capacityLevelLabel(snap.capacity) : '';
  const budgetLine = snap.hasBudget
    ? `${snap.budgetPct}% del presupuesto${levelLabel ? ` · ${levelLabel}` : ''}`
    : '';

  return (
    <FlexWidget clickAction="OPEN_APP" style={WIDGET_ROOT_STYLE}>
      <GlassSheen width={size.width} />
      <FlexWidget
        style={{
          width: 'match_parent', flex: 1, flexDirection: 'column', justifyContent: 'space-between',
          padding: 12, paddingRight: 14,
        }}
      >
        {/* Encabezado: semáforo (solo el punto), marca, + gasto y el ojo */}
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
          {snap.capacity && (
            <FlexWidget
              style={{
                width: 8, height: 8, borderRadius: 4, backgroundColor: levelColor(snap.capacity),
                borderWidth: 1, borderColor: W.divider, marginRight: 6,
              }}
            />
          )}
          <TextWidget text="BUDGETMASTER" style={{ fontSize: 8, fontWeight: 'bold', color: W.textPrimary }} />
          <FlexWidget style={{ flex: 1 }} />
          <AddExpenseButton />
          <FlexWidget style={{ width: 6 }} />
          <EyeButton hidden={hidden} />
        </FlexWidget>

        {/* Cuerpo: tu período (izquierda) y lo que viene (derecha) */}
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row' }}>
          <FlexWidget style={{ flex: 1, flexDirection: 'column', marginRight: 10 }}>
            <TextWidget text="Disponible por día" maxLines={1} truncate="END" style={{ fontSize: 10, color: W.sub }} />
            <TextWidget
              text={heroText}
              maxLines={1}
              truncate="END"
              style={{ ...heroStyle, width: 'match_parent' }}
            />
            <TextWidget
              text={`${amountText(hidden, snap.availablePeriod)} · ${daysText(snap)}`}
              maxLines={1}
              truncate="END"
              style={{ fontSize: 11, color: W.bronze }}
            />
            {snap.hasBudget && (
              <FlexWidget style={{ width: 'match_parent', flexDirection: 'column', marginTop: 4 }}>
                <BudgetBar pct={snap.budgetPct} width={Math.floor(colW)} />
                <TextWidget text={budgetLine} maxLines={1} truncate="END" style={{ fontSize: 9, color: W.sub }} />
              </FlexWidget>
            )}
          </FlexWidget>
          <FlexWidget style={{ flex: 1, flexDirection: 'column' }}>
            {snap.nextCard && cardText && <Item label={`Tarjeta ${snap.nextCard.name}`} value={cardText} lines={2} />}
            {snap.nextFixed && fixedText && <Item label={`Fijo: ${snap.nextFixed.name}`} value={fixedText} />}
            {!cardText && !fixedText && (
              <TextWidget text="Sin pagos próximos" style={{ fontSize: 11, color: W.sub }} />
            )}
          </FlexWidget>
        </FlexWidget>

        {/* Separador y pie: saldos (primera cuenta + las demás) y la hora de la foto con ancho propio */}
        <FlexWidget style={{ width: 'match_parent', height: 1, backgroundColor: W.divider }} />
        <FlexWidget style={{ width: 'match_parent', flexDirection: 'row', alignItems: 'center' }}>
          <FlexWidget style={{ flex: 1, marginRight: 8 }}>
            {balances.length > 0 && (
              <TextWidget text={balancesText} maxLines={1} truncate="END" style={{ fontSize: 10, color: W.sub }} />
            )}
          </FlexWidget>
          <TextWidget text={updatedText(snap.updatedAt)} maxLines={1} style={{ width: 'wrap_content', fontSize: 9, color: W.muted }} />
        </FlexWidget>
      </FlexWidget>
    </FlexWidget>
  );
}
