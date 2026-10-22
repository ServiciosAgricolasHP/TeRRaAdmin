// Transportistas recientes por ciclo, guardados en `localStorage`. Cuando se
// guarda una vuelta, el transportista usado pasa al frente de la lista, así el
// próximo ingreso lo tiene arriba en el buscador.
const RECENTS_MAX = 6;
const recentsKey = (cycleId) => `transports.recentCarriers.${cycleId || "_global"}`;
export function loadRecents(cycleId) {
  try {
    const raw = localStorage.getItem(recentsKey(cycleId));
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.filter((v) => typeof v === "string") : [];
  } catch { return []; }
}
export function pushRecent(cycleId, carrierId) {
  if (!carrierId) return;
  try {
    const cur = loadRecents(cycleId).filter((id) => id !== carrierId);
    cur.unshift(carrierId);
    localStorage.setItem(recentsKey(cycleId), JSON.stringify(cur.slice(0, RECENTS_MAX)));
  } catch { /* noop */ }
}
