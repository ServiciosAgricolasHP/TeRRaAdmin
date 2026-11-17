// Las copias por ciclo de las jornadas que usa Nómina
// (services/workdayCycles.js): cómo se les aplica lo que cambió, cómo se
// reparte una lectura entre los ciclos y cuáles se dejan de guardar.

// La copia de un ciclo con lo que cambió en `workdays`: agrega o reemplaza
// las jornadas del ciclo y saca las que pasaron a otro. Si nada de `changed`
// toca al ciclo, devuelve la misma copia.
export function applyCycleChanges(list, changed, cycleId) {
  const byId = new Map(list.map((d) => [d.id, d]));
  let touched = false;
  for (const d of changed) {
    if (d.cycleId === cycleId) {
      byId.set(d.id, d);
      touched = true;
    } else if (byId.delete(d.id)) {
      touched = true;
    }
  }
  return touched ? [...byId.values()] : list;
}

// Los ids de las jornadas eliminadas que hay que sacar de las copias
// (`deleted`, las marcas de services/workdayDeletions.js), sin las que
// volvieron a escribirse: una jornada que está en `changed` existe, aunque
// tenga una marca de antes.
export function deletedIdsOf(deleted, changed) {
  const alive = new Set(changed.map((d) => d.id));
  return new Set(deleted.map((d) => d.id).filter((id) => !alive.has(id)));
}

// La copia sin las jornadas eliminadas. Si no tenía ninguna, devuelve la
// misma copia.
export function removeDeleted(list, deletedIds) {
  if (!deletedIds.size || !list.some((d) => deletedIds.has(d.id))) return list;
  return list.filter((d) => !deletedIds.has(d.id));
}

// Las jornadas de una lectura repartidas por ciclo, con una entrada (quizás
// vacía) para cada uno de `cycleIds`.
export function groupByCycle(docs, cycleIds) {
  const out = new Map(cycleIds.map((id) => [id, []]));
  for (const d of docs) out.get(d.cycleId)?.push(d);
  return out;
}

// Los ciclos que se dejan de guardar: los que no se usan hace `maxAgeMs` o
// más. `cycles`: { [cycleId]: { usedAt } }.
export function cyclesToDrop(cycles, now, maxAgeMs) {
  return Object.entries(cycles)
    .filter(([, c]) => now - (c.usedAt || 0) >= maxAgeMs)
    .map(([id]) => id);
}
