// Buscar faenas en la pantalla de Faenas: por su nombre, el dueño, la razón
// social o el RUT de sus contrapartes, o por el nombre o el RUT de alguna de
// sus subfaenas. Cada palabra tiene que aparecer, en cualquier orden y sin
// importar tildes ni mayúsculas; en un RUT no cuentan los puntos ni el guion.
import { counterpartiesOf } from "./jobCounterparties";
import { matchesSearchQuery } from "./textSearch";

const compact = (s) => String(s || "").replace(/[.\s-]/g, "").toUpperCase();

// Si lo escrito es parte de un RUT: solo dígitos (y la K), al menos 3.
const rutNeedle = (query) => {
  const c = compact(query);
  return /^[0-9K]{3,}$/.test(c) ? c : "";
};

// Si una faena calza con lo escrito: `{ via }`, con la subfaena por la que
// calza (`via: null` si calza la faena misma), o null si no calza.
// `subjobs` son las subfaenas de esa faena.
export function jobSearchMatch(job, subjobs, query) {
  if (!String(query || "").trim()) return { via: null };
  const needle = rutNeedle(query);
  const counterparties = counterpartiesOf(job);
  const own = [job?.name, job?.owner, ...counterparties.map((c) => c.name)].filter(Boolean).join(" ");
  if (matchesSearchQuery(own, query)) return { via: null };
  if (needle && counterparties.some((c) => compact(c.rut).includes(needle))) return { via: null };
  for (const s of subjobs || []) {
    if (matchesSearchQuery(s?.name || "", query)) return { via: s };
    if (needle && compact(s?.counterpartyRut).includes(needle)) return { via: s };
  }
  return null;
}
