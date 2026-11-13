import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { LayoutChangeEvent, StyleSheet, Text, View } from "react-native";
import { ACTIONS } from "../../services/assistant/Actions";
import type { ActionProposal, SummaryRow } from "../../services/assistant/types";
import { C } from "../../theme";
import { GlassButton, GlassButtonGroup } from "../GlassButton";
import { GlassCard } from "../GlassCard";
import { InlineNotice } from "../InlineNotice";
import { Money } from "../Money";

type IoniconName = keyof typeof Ionicons.glyphMap;

export interface ProposalCardProps {
    proposal: ActionProposal;
    onConfirm: (proposalId: string) => void;
    onEdit: (proposalId: string) => void;
    onCancel: (proposalId: string) => void;
    /** Para que la pantalla pueda hacer scroll hasta la tarjeta (focusProposalId). */
    onLayout?: (e: LayoutChangeEvent) => void;
}

/** Texto plano de la propuesta para lectores de pantalla (agrupa título y filas en un solo foco). */
function summaryA11y(title: string, rows: SummaryRow[], suggested: boolean): string {
    const body = rows.map(r => `${r.label}: ${r.value}`).join(". ");
    return `${title}${suggested ? ", sugerido por IA" : ""}. ${body}`;
}

/** «Confirmar: título + monto» para el botón (el monto es la primera fila con importe). */
function confirmA11y(title: string, rows: SummaryRow[]): string {
    const m = rows.find(r => !!r.money);
    return m ? `Confirmar: ${title}, ${m.value}` : `Confirmar: ${title}`;
}

function SummaryLine({ row }: { row: SummaryRow }) {
    return (
        <View style={s.row}>
            <Text style={s.rowLabel}>{row.label}</Text>
            {row.money ? (
                <Money
                    amount={row.money.amount}
                    currency={row.money.currency}
                    size="sm"
                    tone="neutral"
                    gradient={false}
                    align="right"
                    containerStyle={s.rowMoney}
                />
            ) : (
                <Text style={s.rowValue}>{row.value}</Text>
            )}
        </View>
    );
}

function StatusLine({ icon, color, text }: { icon: IoniconName; color: string; text: string }) {
    return (
        <View style={s.statusRow}>
            <Ionicons name={icon} size={16} color={color} />
            <Text style={[s.statusTxt, { color }]}>{text}</Text>
        </View>
    );
}

export function ProposalCard({ proposal, onConfirm, onEdit, onCancel, onLayout }: ProposalCardProps) {
    const spec = ACTIONS[proposal.actionId];
    const { status } = proposal;
    const open = status === "pending" || status === "executing";
    const executing = status === "executing";
    const suggested = proposal.origin === "gemini";
    const hasIssues = proposal.issues.length > 0;
    const accent = status === "done" ? C.success : status === "failed" ? C.danger : undefined;
    const dimmed = status === "cancelled" || status === "expired";

    return (
        <View style={s.wrap} onLayout={onLayout}>
            <GlassCard
                radius={18}
                blur={false}
                leftAccentColor={accent}
                style={dimmed ? s.dimmed : undefined}
                contentStyle={s.content}
            >
                <View
                    accessible
                    accessibilityLabel={summaryA11y(spec.title, proposal.summary, suggested)}
                    style={s.summaryBlock}
                >
                    <View style={s.header}>
                        <View style={s.iconWrap}>
                            <Ionicons name={spec.icon as IoniconName} size={16} color={C.primaryLight} />
                        </View>
                        <Text style={s.title}>{spec.title}</Text>
                        {suggested && (
                            <View style={s.badge}>
                                <Ionicons name="sparkles" size={11} color={C.primaryLight} />
                                <Text style={s.badgeTxt}>Sugerido por IA</Text>
                            </View>
                        )}
                    </View>
                    <View style={s.rows}>
                        {proposal.summary.map((row, i) => (
                            <SummaryLine key={`${row.slotKey ?? row.label}-${i}`} row={row} />
                        ))}
                    </View>
                </View>

                {open && proposal.warnings.map((w, i) => (
                    <InlineNotice key={`w${i}`} variant="warning" text={w} />
                ))}
                {open && proposal.issues.map((it, i) => (
                    <InlineNotice key={`i${i}`} variant="error" text={it.message} />
                ))}

                {open && (
                    <GlassButtonGroup direction="auto">
                        <GlassButton
                            label="Confirmar"
                            accessibilityLabel={confirmA11y(spec.title, proposal.summary)}
                            icon="checkmark"
                            kind="primary"
                            loading={executing}
                            disabled={hasIssues}
                            onPress={() => onConfirm(proposal.proposalId)}
                        />
                        <GlassButton
                            label="Editar"
                            icon="create-outline"
                            kind="secondary"
                            disabled={executing}
                            onPress={() => onEdit(proposal.proposalId)}
                        />
                        <GlassButton
                            label="Cancelar"
                            kind="ghost"
                            disabled={executing}
                            onPress={() => onCancel(proposal.proposalId)}
                        />
                    </GlassButtonGroup>
                )}

                {status === "done" && <StatusLine icon="checkmark-circle-outline" color={C.success} text="Guardado" />}
                {status === "cancelled" && <StatusLine icon="close-circle-outline" color={C.textSub} text="Cancelada" />}
                {status === "expired" && (
                    <StatusLine
                        icon="time-outline"
                        color={C.textSub}
                        text="Venció: ya no se puede confirmar. Vuelva a pedirla si aún la necesita."
                    />
                )}
                {status === "failed" && (
                    <StatusLine
                        icon="alert-circle-outline"
                        color={C.danger}
                        text={proposal.error ? `No se guardó. ${proposal.error}` : "No se guardó."}
                    />
                )}
            </GlassCard>
        </View>
    );
}

const s = StyleSheet.create({
    wrap: { flex: 1, flexShrink: 1, minWidth: 0 },
    dimmed: { opacity: 0.7 },
    content: { padding: 14, gap: 10 },
    summaryBlock: { gap: 10 },
    header: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 6 },
    iconWrap: {
        width: 30, height: 30, borderRadius: 15,
        backgroundColor: C.glassActive, borderWidth: 1, borderColor: C.glassActiveBorder,
        alignItems: "center", justifyContent: "center", flexShrink: 0,
    },
    title: { color: C.textPrimary, fontSize: 15, fontWeight: "900", flexShrink: 1 },
    badge: {
        flexDirection: "row", alignItems: "center", gap: 4,
        paddingHorizontal: 8, paddingVertical: 3, borderRadius: 10,
        backgroundColor: C.glassActive, borderWidth: 1, borderColor: C.glassActiveBorder,
    },
    badgeTxt: { color: C.primaryLight, fontSize: 11, fontWeight: "800" },
    rows: { gap: 8 },
    row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 12, rowGap: 2 },
    rowLabel: { color: C.textSub, fontSize: 12, fontWeight: "700", flexShrink: 1 },
    rowValue: { color: C.text, fontSize: 14, fontWeight: "700", lineHeight: 20, flexShrink: 1, marginLeft: "auto", textAlign: "right" },
    rowMoney: { flexShrink: 1, marginLeft: "auto" },
    statusRow: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
    statusTxt: { fontSize: 13, fontWeight: "700", lineHeight: 18, flexShrink: 1 },
});

export default ProposalCard;
