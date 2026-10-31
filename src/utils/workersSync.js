// Puesta al día de la lista de trabajadores (`syncWorkers`, services/
// workersService.js): la copia guardada en el navegador más lo que cambió
// desde la última vez, en vez de releer la colección entera.

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

const byName = (a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0);

// Junta la copia con los trabajadores que cambiaron: reemplaza por id y agrega
// los nuevos. Como `orderBy("name")` en Firestore, deja fuera a quien no tiene
// `name` y ordena por nombre.
export function applyWorkerChanges(list, changed) {
  const byId = new Map(list.map((w) => [w.id, w]));
  for (const w of changed) byId.set(w.id, w);
  return [...byId.values()].filter((w) => w.name !== undefined).sort(byName);
}

// Qué hacer cuando una pantalla pide la lista:
// - "full": leerla entera, si no hay copia o la última carga completa no es
//   de hoy (así entra una vez al día lo que se escribe sin `updatedAt` y sale
//   quien se eliminó en otro equipo);
// - "cached": devolver la copia, si se puso al día hace menos de `minGapMs`,
//   salvo que se pida `fresh`;
// - "delta": traer solo lo que cambió.
export function syncMode({ hasCopy, fullDate, today, lastSyncAt, now, fresh = false, minGapMs }) {
  if (!hasCopy || fullDate !== today) return "full";
  if (!fresh && lastSyncAt && now - lastSyncAt < minGapMs) return "cached";
  return "delta";
}
