// La liquidación de un resumen de transporte: lo que se pagó al marcarlo
// pagado, el total menos sus abonos, con el día del pago. No se guarda: sale
// del total, los abonos y `paidAt`, así vale también para los resúmenes ya
// pagados y revertir el pago no tiene que borrar nada.

import { localIsoDate } from "./dates";

// Día (`YYYY-MM-DD`) de una marca de tiempo de Firestore o de su forma
// guardada en el navegador; "" si no hay.
function dayOf(ts) {
  const d = ts?.toDate?.() || (ts?.seconds != null ? new Date(ts.seconds * 1000) : null);
  return d ? localIsoDate(d) : "";
}

// `{ amount, date }`, o null si el resumen está pendiente o sus abonos ya
// cubrían el total. `abonos` y `total` reemplazan los del resumen: el detalle
// usa su copia en vivo de los abonos, y las tablas, el total de las vueltas
// que muestran.
export function payoffOf(payment, { abonos = payment?.abonos, total = payment?.total } = {}) {
  if (payment?.status !== "paid") return null;
  const abonado = (abonos || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const amount = (Number(total) || 0) - abonado;
  return amount > 0 ? { amount, date: dayOf(payment.paidAt) } : null;
}
