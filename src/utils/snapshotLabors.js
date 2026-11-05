// Las labores que guarda el JSON de una nómina (`payrollSnapshots`) en cada
// ciclo: con ellas el detalle nombra la labor de cada jornada y arma su
// producción.

// Los ciclos que no conocen la labor de alguna de esas jornadas, o que no
// están en `cycles`: para nombrarla hay que leer el ciclo de nuevo.
export function cyclesMissingLabors(cycles, workdays) {
  const laborsOf = new Map((cycles || []).map((c) => [c.id, new Set((c.labors || []).map((l) => l.id))]));
  const missing = new Set();
  for (const wd of workdays || []) {
    if (!wd?.cycleId || !wd.laborId) continue;
    if (!laborsOf.get(wd.cycleId)?.has(wd.laborId)) missing.add(wd.cycleId);
  }
  return [...missing];
}

// Un ciclo del JSON con las labores y los precios del día vigentes (`live`,
// con la forma del JSON): cada labor toma su versión vigente, se suman las que
// no estaban y quedan las que el ciclo ya no tiene, porque sus jornadas pueden
// seguir en la nómina. Sin `live`, el ciclo queda igual.
export function withLiveLabors(snapCycle, live) {
  if (!live) return snapCycle;
  const liveById = new Map((live.labors || []).map((l) => [l.id, l]));
  const kept = (snapCycle.labors || []).map((l) => liveById.get(l.id) || l);
  const known = new Set(kept.map((l) => l.id));
  return {
    ...snapCycle,
    labors: [...kept, ...(live.labors || []).filter((l) => !known.has(l.id))],
    dayPrices: { ...(snapCycle.dayPrices || {}), ...(live.dayPrices || {}) },
  };
}

// Un ciclo del JSON con las labores que le faltan, tomadas de `live`, y sus
// precios del día. Lo que ya tenía no cambia: es lo que se pagó.
export function withMissingLabors(snapCycle, live) {
  if (!live) return snapCycle;
  const known = new Set((snapCycle.labors || []).map((l) => l.id));
  const added = (live.labors || []).filter((l) => !known.has(l.id));
  if (!added.length) return snapCycle;
  const dayPrices = { ...(snapCycle.dayPrices || {}) };
  for (const l of added) {
    if (live.dayPrices?.[l.id] && !dayPrices[l.id]) dayPrices[l.id] = live.dayPrices[l.id];
  }
  return { ...snapCycle, labors: [...(snapCycle.labors || []), ...added], dayPrices };
}

// Si dos valores guardados son iguales, sin importar el orden de las claves de
// un objeto.
export function sameData(a, b) {
  if (a === b) return true;
  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) return false;
  if (Array.isArray(a) !== Array.isArray(b)) return false;
  const keysA = Object.keys(a);
  if (keysA.length !== Object.keys(b).length) return false;
  return keysA.every((k) => Object.hasOwn(b, k) && sameData(a[k], b[k]));
}
