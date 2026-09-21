// Qué labores de un ciclo las alimenta la app de escaneo de QR.
//
// La sincronización de Pesajes QR escribe los workdays con `upsert` sobre un
// docId derivado de (ciclo, labor, trabajador, día, combo), así que pisa `qty`
// y `amount` de lo que haya. Una cantidad tipeada a mano en la grilla del ciclo
// no convive con el scan: desaparece en la próxima sincronización y nadie se
// entera. Por eso la grilla bloquea esas celdas en vez de advertir.
//
// La fuente es `qrPrefixes`, no los workdays ya sincronizados (`harvestSynced`):
// hay que saberlo ANTES de que llegue el primer pesaje, que es justo cuando la
// grilla está vacía y tienta llenarla a mano.

// Un prefijo apunta a una labor solo si está activo y tiene el par
// (ciclo, labor) completo. `active` puede venir `undefined` en los documentos
// viejos — se toma como activo, igual que en la pantalla de Pesajes QR.
export function isPrefixSyncing(prefix, cycleId) {
  if (!prefix || !cycleId) return false;
  if (prefix.active === false) return false;
  return prefix.cycleId === cycleId && !!prefix.laborId;
}

// laborId → prefijo que la sincroniza. Si dos prefijos apuntan a la misma
// labor gana el primero: da igual cuál se muestre, lo que importa es que la
// labor quede bloqueada.
export function qrLockedLaborsOf(prefixes = [], cycleId = null) {
  const out = new Map();
  for (const p of prefixes) {
    if (!isPrefixSyncing(p, cycleId)) continue;
    if (!out.has(p.laborId)) out.set(p.laborId, p);
  }
  return out;
}
