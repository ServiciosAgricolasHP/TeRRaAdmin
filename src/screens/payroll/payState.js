// Estado de pago de una nómina: pendiente, transferencias pagadas o pagada, y
// las fechas en que se marcó cada cosa.
import { fmtDate } from "./helpers";

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

// Estado de la nómina en una sola línea y, si las transferencias ya salieron,
// el efectivo que falta entregar.
// Cuándo se pagó la nómina: el día en que se marcó pagada y, en un pago en dos
// tiempos, también el día en que salieron las transferencias. `short` es el
// rótulo corto de la tabla del historial.
export function paymentDates(p) {
  const out = [];
  if (p?.bankPaidAt) out.push({ key: "bank", label: "Transferencias el", short: "Transf.", date: fmtDate(p.bankPaidAt) });
  if (p?.status === "paid" && p.paidAt) {
    out.push(
      p.bankPaidAt
        ? { key: "paid", label: "Pago final el", short: "Final", date: fmtDate(p.paidAt) }
        : { key: "paid", label: "Pagada el", short: "Pagada", date: fmtDate(p.paidAt) },
    );
  }
  return out;
}
