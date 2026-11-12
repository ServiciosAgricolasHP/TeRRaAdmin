// Los ciclos a los que se puede saltar desde la grilla de un ciclo: los
// activos de su misma faena, agrupados por subfaena.
import { cycleSortDay } from "./cycleClosing";
import { matchesSearchQuery } from "./textSearch";

// El nombre corto de un ciclo: su etiqueta sin el prefijo "Faena/Subfaena/".
export function shortCycleName(cycle) {
  const label = cycle?.label || "";
  const parts = label.split("/");
  return (parts.length >= 3 ? parts.slice(2).join("/") : label) || cycle?.id || "";
}

// Los ciclos activos de la faena `jobId`, un grupo por subfaena (por nombre;
// los ciclos sin subfaena, al final) con sus ciclos por su primer día
// trabajado. El ciclo abierto en la grilla (`currentId`) entra aunque esté
// cerrado, marcado `current`. `search` deja los ciclos cuya subfaena o nombre
// calza.
export function switchableCycles({ cycles = [], subjobs = [], jobId, currentId = null, search = "" }) {
  if (!jobId) return [];
  const subjobName = new Map(subjobs.map((s) => [s.id, s.name]));
  const groups = new Map();
  for (const c of cycles) {
    if (c.faenaId !== jobId) continue;
    if (c.status === "closed" && c.id !== currentId) continue;
    const subjobId = c.subfaenaId || "";
    const name = subjobId ? subjobName.get(subjobId) || "(subfaena eliminada)" : "Sin subfaena";
    const cycleName = shortCycleName(c);
    if (search.trim() && !matchesSearchQuery(`${name} ${cycleName}`, search)) continue;
    if (!groups.has(subjobId)) groups.set(subjobId, { subjobId, name, cycles: [] });
    groups.get(subjobId).cycles.push({ id: c.id, name: cycleName, sortDay: cycleSortDay(c), current: c.id === currentId });
  }
  return [...groups.values()]
    .map((g) => ({
      ...g,
      cycles: g.cycles
        .sort((a, b) => a.sortDay.localeCompare(b.sortDay) || a.name.localeCompare(b.name, "es", { numeric: true }))
        .map(({ id, name, current }) => ({ id, name, current })),
    }))
    .sort((a, b) => !a.subjobId - !b.subjobId || a.name.localeCompare(b.name, "es", { numeric: true }));
}
