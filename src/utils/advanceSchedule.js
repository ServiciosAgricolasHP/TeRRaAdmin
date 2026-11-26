// Cuándo una nómina aplica sola un anticipo o un bono pendiente: no antes de
// su fecha de inicio (`applyFrom`: "Descontar desde" en un anticipo, "Pagar
// desde" en un bono).
import { fmtShortDate } from "./format";

// La fecha de inicio, "YYYY-MM-DD", o "" si no tiene.
export const applyFromOf = (adv) => String(adv?.applyFrom || "").slice(0, 10);

// Si `today` ("YYYY-MM-DD") todavía no llega a la fecha de inicio.
export function isDeferred(adv, today) {
  const from = applyFromOf(adv);
  return !!from && from > String(today || "");
}

// Los que una nómina armada el día `today` aplica sola, de `advances`.
export const autoAppliedOf = (advances, { today } = {}) => (advances || []).filter((a) => !isDeferred(a, today));

// "Desde 01-dic", o "" sin fecha de inicio.
export function applyFromLabel(adv) {
  const from = applyFromOf(adv);
  return from ? `Desde ${fmtShortDate(from)}` : "";
}
