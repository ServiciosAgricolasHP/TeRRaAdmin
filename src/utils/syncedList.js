// Puesta al día de una lista guardada en el navegador (`createSyncedList`,
// services/syncedList.js): la copia más lo que cambió desde la última vez, en
// vez de releer la colección entera.

import { daysUntil } from "./commitments";

// Milisegundos de un `updatedAt`: un Timestamp de Firestore, o
// el `{ seconds, nanoseconds }` en que queda al pasar por localStorage.
export function millisOf(value) {
  if (!value) return 0;
  if (typeof value.toMillis === "function") return value.toMillis();
  if (typeof value.seconds === "number") return value.seconds * 1000 + Math.floor((value.nanoseconds || 0) / 1e6);
  return 0;
}

// La fecha y hora ISO de un Timestamp de Firestore o de su forma guardada en
// localStorage; "" si no hay.
export function timestampIso(value) {
  const ms = millisOf(value);
  return ms ? new Date(ms).toISOString() : "";
}

// Del más nuevo al más viejo según `field` (un Timestamp). Los que no lo
// tienen van primero: son los recién creados en este equipo, que la copia
// guarda sin la hora del servidor hasta la siguiente puesta al día.
export function newestFirst(list, field = "createdAt") {
  const key = (d) => (d[field] ? millisOf(d[field]) : Infinity);
  return [...list].sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka === kb ? 0 : ka > kb ? -1 : 1;
  });
}

// La marca hasta donde llega la copia: el `field` más reciente de `docs`, o
// `current` si ninguno es posterior. Sale de las horas de Firestore, no del
// reloj del equipo.
export function markOf(docs, field, current = 0) {
  return docs.reduce((mark, d) => Math.max(mark, millisOf(d[field])), current);
}

// Desde dónde (sin incluirlo) trae la próxima puesta al día lo que cambió:
// `safe` si ya se sabe que todo lo escrito hasta ahí está en la copia; si no,
// unos minutos antes de la marca (`marginMs`), por si una escritura con una
// hora anterior a la marca todavía no se veía en Firestore.
export const deltaSince = ({ mark, safe }, marginMs) => safe ?? mark - marginMs;

// La marca después de una puesta al día que empezó en `start` y terminó en
// `end` (horas del equipo) y trajo hasta `newMark` (hora de Firestore). Cada
// puesta al día anota que, a la hora `end` del equipo, Firestore ya iba en su
// marca (`checkpoints`). Una puesta al día que empieza `marginMs` o más
// después de una anotación ve todo lo escrito hasta esa marca, así que la
// marca pasa a `safe`: la siguiente ya no vuelve a traer lo de esos minutos.
export function advanceMarks(state, { start, end, newMark, marginMs }) {
  const all = state.checkpoints || [];
  const ripe = all.filter((c) => start - c.at >= marginMs);
  const rest = all.filter((c) => start - c.at < marginMs);
  const safe = Math.max(deltaSince(state, marginMs), ...ripe.map((c) => c.mark));
  const last = rest[rest.length - 1];
  const known = newMark <= safe || last?.mark === newMark;
  return { mark: newMark, safe, checkpoints: known ? rest : [...rest, { mark: newMark, at: end }] };
}

// Junta la copia con los documentos que cambiaron: reemplaza por id y agrega
// los nuevos. Con `order` (`[campo, "asc" | "desc"]`), como `orderBy` en
// Firestore, deja fuera a los que no tienen el campo y ordena por él.
export function applyChanges(list, changed, order) {
  const byId = new Map(list.map((d) => [d.id, d]));
  for (const d of changed) byId.set(d.id, d);
  const out = [...byId.values()];
  if (!order) return out;
  const [field, dir = "asc"] = order;
  const sign = dir === "desc" ? -1 : 1;
  return out
    .filter((d) => d[field] !== undefined)
    .sort((a, b) => (a[field] < b[field] ? -sign : a[field] > b[field] ? sign : 0));
}

// Qué hacer cuando una pantalla pide la lista:
// - "full": leerla entera, si no hay copia o la última carga completa tiene
//   `fullEveryDays` días o más (con 1, si no es de hoy);
// - "cached": devolver la copia, si se puso al día hace menos de `minGapMs`,
//   salvo que se pida `fresh`;
// - "delta": traer solo lo que cambió.
export function syncMode({ hasCopy, fullDate, today, fullEveryDays = 1, lastSyncAt, now, fresh = false, minGapMs }) {
  const left = fullDate ? daysUntil(fullDate, today) : null;
  if (!hasCopy || left === null || left > 0 || -left >= fullEveryDays) return "full";
  if (!fresh && lastSyncAt && now - lastSyncAt < minGapMs) return "cached";
  return "delta";
}
