// Cálculo para crear un ciclo en Faenas: importar desde otro ciclo abierto
// (labores, precios por día y jornadas), encadenar el ciclo siguiente al
// cerrar uno y separar el sufijo editable de la etiqueta. `makeId` genera el
// id de cada labor nueva.
import { workdayDocId } from "./cosechaCombos";

// Ciclos abiertos de la subfaena que pueden servir de origen para importar,
// del más reciente al más antiguo.
export function importCandidatesOf(cycles, subjobId) {
  const scope = cycles.filter((c) => c.subfaenaId === subjobId);
  const sortKey = (c) => c.endDate || c.startDate || c.createdAt?.toDate?.()?.toISOString?.() || "";
  return scope
    .filter((c) => c.status !== "closed")
    .sort((a, b) => sortKey(b).localeCompare(sortKey(a)));
}

// Copia la configuración completa de cada labor salvo el id; el form de la
// labor en CycleDetail solo lee los campos que conoce. Devuelve también el
// mapa id viejo → id nuevo, para mover precios y jornadas.
export function cloneLabors(labors, makeId) {
  const oldToNewLaborId = new Map();
  const cloned = labors.map((l) => {
    const id = makeId();
    oldToNewLaborId.set(l.id, id);
    const { id: _drop, ...rest } = l;
    return { ...rest, id };
  });
  return { labors: cloned, oldToNewLaborId };
}

// Precios por día del ciclo origen, re-mapeados al laborId nuevo de cada
// labor importada y filtrados por los días marcados. Sin ninguno, undefined.
export function importedDayPrices(sourceDayPrices, oldToNewLaborId, days) {
  const src = sourceDayPrices || {};
  const out = {};
  for (const [oldLid, newLid] of oldToNewLaborId) {
    const srcLab = src[oldLid];
    if (!srcLab) continue;
    const filtered = {};
    for (const d in srcLab) {
      if (days.has(d)) filtered[d] = srcLab[d];
    }
    if (Object.keys(filtered).length > 0) out[newLid] = filtered;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

// Una jornada movida a otro ciclo y labor: el docId codifica cycleId+laborId,
// así que cambia. El comboKey sale del docId, desde el 5.º segmento; con 4
// segmentos es "0_0" implícito (jornada simple).
export function movedWorkday(w, cycleId, laborId) {
  const parts = String(w.id || "").split("__");
  const ck = parts.length >= 5 ? parts.slice(4).join("__") : "0_0";
  const { id: _oldId, cycleId: _cy, laborId: _la, ...rest } = w;
  return {
    id: workdayDocId(cycleId, laborId, w.workerRut, w.date, ck),
    data: { ...rest, cycleId, laborId },
  };
}

// Labores del ciclo que sigue a uno cerrado: la configuración completa de
// cada una (tipo de trato, base diaria, tarifa de HE, bonos, etapas…), igual
// que al importar. Los trabajadores solo si se pidió.
export function nextCycleLabors(labors, copyWorkers, makeId) {
  return labors.map((l) => {
    const { id: _drop, ...rest } = l;
    return { ...rest, id: makeId(), workers: copyWorkers ? l.workers || [] : [] };
  });
}

// La parte editable de la etiqueta, sin el prefijo "Faena/Subfaena/". Sin
// distinguir mayúsculas: los nombres de faena y subfaena se guardan como
// título, y un ciclo antiguo puede traer el prefijo en mayúsculas.
export function cycleLabelSuffix(label, prefix) {
  return (label || "").toLowerCase().startsWith(prefix.toLowerCase())
    ? (label || "").slice(prefix.length)
    : label || "";
}
