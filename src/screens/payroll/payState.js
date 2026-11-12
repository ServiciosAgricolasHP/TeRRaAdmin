// Las fechas en que se marcó el pago de una nómina. Su estado (pendiente,
// transferencias pagadas o pagada) está en `utils/payState.js`.
import { fmtDate } from "./helpers";

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
