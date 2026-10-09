// Qué labores de un ciclo alimenta la app de escaneo de QR.
//
// La sincronización de Pesajes QR hace `upsert` de los workdays sobre un docId
// derivado de (ciclo, labor, trabajador, día, combo) y pisa `qty` y `amount`.
// Por eso la grilla del ciclo deja esas celdas de solo lectura.
//
// La fuente es `qrPrefixes` y no los workdays sincronizados (`harvestSynced`):
// el bloqueo rige desde antes del primer pesaje, con la grilla vacía.

// Un prefijo apunta a una labor solo si está activo y tiene el par
// (ciclo, labor) completo. `active` ausente cuenta como activo, igual que en
// la pantalla de Pesajes QR.
export function isPrefixSyncing(prefix, cycleId) {
  if (!prefix || !cycleId) return false;
  if (prefix.active === false) return false;
  return prefix.cycleId === cycleId && !!prefix.laborId;
}

// laborId → prefijo que la sincroniza. Si dos prefijos apuntan a la misma
// labor gana el primero; basta uno para bloquearla.
export function qrLockedLaborsOf(prefixes = [], cycleId = null) {
  const out = new Map();
  for (const p of prefixes) {
    if (!isPrefixSyncing(p, cycleId)) continue;
    if (!out.has(p.laborId)) out.set(p.laborId, p);
  }
  return out;
}
