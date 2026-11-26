// Los adjuntos de los resúmenes de transporte: de dónde viene cada archivo (su
// resumen y, si respalda un abono, ese abono) y la lista de todos los de un
// transportista, para verlos juntos. Solo cálculo.
import { localIsoDate } from "./dates";
import { fmtCurrency } from "./format";
import { millisOf } from "./syncedList";

// "2026-10-12" → "12-10-2026".
const dmy = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  return m ? `${m[3]}-${m[2]}-${m[1]}` : "";
};

// El día de un resumen para ordenarlos: el fin de su período, o su comienzo, o
// el día en que se creó.
function paymentDay(payment) {
  if (payment.periodTo || payment.periodFrom) return payment.periodTo || payment.periodFrom;
  const ms = millisOf(payment.createdAt);
  return ms ? localIsoDate(new Date(ms)) : "";
}

// "Resumen 01-10-2026 → 15-10-2026", o con un solo día si el período no tiene
// los dos extremos.
export function paymentFileLabel(payment) {
  const from = dmy(payment?.periodFrom);
  const to = dmy(payment?.periodTo);
  if (from && to) return from === to ? `Resumen ${from}` : `Resumen ${from} → ${to}`;
  const day = from || to || dmy(paymentDay(payment || {}));
  return day ? `Resumen ${day}` : "Resumen";
}

// "Abono 12-10-2026 · $50.000".
export function abonoFileLabel(abono) {
  return [`Abono ${dmy(abono?.date) || "sin fecha"}`, fmtCurrency(abono?.amount)].join(" · ");
}

// El abono que respalda un adjunto, o null si es del resumen (o si su abono se
// quitó).
export function abonoOfAttachment(payment, attachment) {
  if (!attachment?.abonoId) return null;
  return (payment?.abonos || []).find((a) => a.id === attachment.abonoId) || null;
}

// Cuántos adjuntos respaldan un abono.
export function abonoAttachmentCount(payment, abonoId) {
  return (payment?.attachments || []).filter((a) => a.abonoId === abonoId).length;
}

// Los adjuntos de los resúmenes de un transportista, del resumen más nuevo al
// más viejo y, en cada uno, en el orden en que se subieron. Cada archivo lleva
// `paymentId`, `groupLabel` (su resumen), `abonoLabel` (su abono, o "") y
// `context` (los dos juntos, para el visor).
export function carrierFiles(payments) {
  return (payments || [])
    .filter((p) => (p.attachments || []).length > 0)
    .sort((a, b) => paymentDay(b).localeCompare(paymentDay(a)))
    .flatMap((p) => {
      const groupLabel = paymentFileLabel(p);
      return (p.attachments || []).map((att) => {
        const abono = abonoOfAttachment(p, att);
        const abonoLabel = abono ? abonoFileLabel(abono) : "";
        return { ...att, paymentId: p.id, groupLabel, abonoLabel, context: [groupLabel, abonoLabel].filter(Boolean).join(" · ") };
      });
    });
}
