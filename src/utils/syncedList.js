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

// La marca hasta donde llega la copia: el `field` más reciente de `docs`, o
// `current` si ninguno es posterior. Sale de las horas de Firestore, no del
// reloj del equipo.
export function markOf(docs, field, current = 0) {
  return docs.reduce((mark, d) => Math.max(mark, millisOf(d[field])), current);
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
