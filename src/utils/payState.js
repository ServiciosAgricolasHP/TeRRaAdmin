// El estado de pago de una nómina y cómo se muestra.
// Estado visible de la nómina, de tres caras. `status` en Firestore es
// binario; una nómina con las transferencias pagadas y el efectivo adeudado se
// muestra aparte de una sin pagar nada.
export function payStateOf(p) {
  if (p.status === "paid") return "paid";
  if (p.bankPaidAt) return "bankPaid";
  return "pending";
}

export const PAY_STATE_PILL = {
  paid: { label: "✓ Pagada", cls: "bg-[var(--color-success-soft)] text-[var(--color-success)]" },
  bankPaid: { label: "🏦 Transf. pagadas", cls: "bg-[var(--color-accent-soft)] text-[var(--color-accent)]" },
  pending: { label: "⏳ Pendiente", cls: "bg-[var(--color-warning-soft)] text-[var(--color-warning)]" },
};
