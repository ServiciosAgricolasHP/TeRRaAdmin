// Cuándo una nómina aplica sola un anticipo o un bono pendiente: no antes de
// su fecha de inicio (`applyFrom`: "Descontar desde" en un anticipo, "Pagar
// desde" en un bono), ni uno que se dejó fuera de esa nómina
// (`skippedAdvanceIds`: una cuota desmarcada o un monto bajado a $0 al
// generarla, o uno que se le quitó después).
import { fmtShortDate } from "./format";

const NO_IDS = new Set();

// La fecha de inicio, "YYYY-MM-DD", o "" si no tiene.
export const applyFromOf = (adv) => String(adv?.applyFrom || "").slice(0, 10);

// Si `today` ("YYYY-MM-DD") todavía no llega a la fecha de inicio.
export function isDeferred(adv, today) {
  const from = applyFromOf(adv);
  return !!from && from > String(today || "");
}

// Los anticipos y bonos que dejó fuera una nómina.
export const skippedIdsOf = (payroll) => new Set(payroll?.skippedAdvanceIds || []);

// Por qué una nómina no aplica sola un anticipo o bono pendiente: "skipped"
// si se dejó fuera de ella, "deferred" si no llega su fecha de inicio, y null
// si lo aplica. `skipped` es el `Set` de `skippedIdsOf`.
export function holdReasonOf(adv, { skipped = NO_IDS, today } = {}) {
  if (adv?.id && skipped.has(adv.id)) return "skipped";
  if (isDeferred(adv, today)) return "deferred";
  return null;
}

// Los que la nómina aplica sola, de `advances`.
export const autoAppliedOf = (advances, opts) => (advances || []).filter((a) => !holdReasonOf(a, opts));

// La lista de los que deja fuera la nómina después de un cambio: suma `add`
// y saca `remove` (lo que ahora sí aplica). Sin repetidos, en orden.
export function nextSkippedIds(current = [], { add = [], remove = [] } = {}) {
  const out = new Set((current || []).filter(Boolean));
  for (const id of remove) out.delete(id);
  for (const id of add) if (id) out.add(id);
  return [...out];
}

// "Desde 01-dic", o "" sin fecha de inicio.
export function applyFromLabel(adv) {
  const from = applyFromOf(adv);
  return from ? `Desde ${fmtShortDate(from)}` : "";
}
