// Las vueltas pendientes que todavía no tienen precio (`rate` 0 o vacío), de
// transportistas contratados. Las de un transportista propio van en $0 a
// propósito y no cuentan. Las pagadas tampoco: ya no se editan.

export const isUnpricedTrip = (t) => t.status !== "paid" && !(Number(t.rate) > 0);

// Las agrupa por transportista, por alias, y cada grupo por fecha. Un
// transportista que ya no está en la lista cuenta como contratado.
export function unpricedTripsByCarrier(trips, carriers) {
  const carrierById = new Map(carriers.map((c) => [c.id, c]));
  const groups = new Map();
  for (const t of trips) {
    if (!isUnpricedTrip(t)) continue;
    const carrier = carrierById.get(t.carrierId) || null;
    if (carrier?.type === "own") continue;
    if (!groups.has(t.carrierId)) groups.set(t.carrierId, { carrierId: t.carrierId, carrier, trips: [] });
    groups.get(t.carrierId).trips.push(t);
  }
  const aliasOf = (g) => g.carrier?.alias || "";
  return [...groups.values()]
    .map((g) => ({ ...g, trips: g.trips.sort((a, b) => String(a.date || "").localeCompare(String(b.date || ""))) }))
    .sort((a, b) => aliasOf(a).localeCompare(aliasOf(b), "es"));
}
