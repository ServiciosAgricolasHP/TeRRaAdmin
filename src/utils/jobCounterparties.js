// Las contrapartes de una faena: el RUT y la razón social de cada empresa a
// la que se le presta el servicio (`counterparties: [{ rut, name }]`). Casi
// siempre es una; con más de una, cada una lleva su razón social, que es lo
// que las distingue. Una subfaena puede quedar con una de las de su faena
// (`counterpartyRut`).
import { formatRutForDisplay, normalizeRut, validateRut } from "./rutUtils";

// Las filas del formulario como se guardan: RUT sin puntos, la razón social
// tal cual (es el nombre legal del SII) y sin las filas vacías.
export function cleanCounterparties(rows) {
  return (rows || [])
    .map((r) => ({ rut: normalizeRut(r?.rut), name: String(r?.name || "").trim() }))
    .filter((r) => r.rut || r.name);
}

// Qué está mal en las contrapartes, o "" si se pueden guardar.
export function counterpartiesError(rows) {
  const list = cleanCounterparties(rows);
  const seen = new Set();
  for (const r of list) {
    if (!r.rut) return `Falta el RUT de ${r.name}.`;
    if (!validateRut(r.rut)) return `El RUT ${formatRutForDisplay(r.rut)} no es válido.`;
    if (seen.has(r.rut)) return `El RUT ${formatRutForDisplay(r.rut)} está dos veces.`;
    seen.add(r.rut);
  }
  if (list.length > 1) {
    const unnamed = list.find((r) => !r.name);
    if (unnamed) return `Con más de un RUT, cada uno lleva su razón social: falta la de ${formatRutForDisplay(unnamed.rut)}.`;
  }
  return "";
}

// Las contrapartes guardadas de una faena.
export const counterpartiesOf = (job) => cleanCounterparties(job?.counterparties);

// La contraparte de una subfaena: la de su faena con ese RUT, o null.
export function subjobCounterparty(subjob, job) {
  const rut = normalizeRut(subjob?.counterpartyRut);
  if (!rut) return null;
  return counterpartiesOf(job).find((c) => c.rut === rut) || { rut, name: "" };
}
