// Las vueltas de la pestaña Vueltas de Transportes: el filtro, el orden por
// columna y la agrupación por transportista.

// Las vueltas que pasan los filtros de la pestaña (`dateTo` filtra en el
// cliente, sin volver a leer).
export function filterTrips(trips, filter, dateTo) {
  return trips.filter((t) => {
    if (filter.carrierId && t.carrierId !== filter.carrierId) return false;
    if (filter.status && t.status !== filter.status) return false;
    if (filter.cycleId && t.cycleId !== filter.cycleId) return false;
    if (filter.faenaId && t.faenaId !== filter.faenaId) return false;
    if (dateTo && t.date && t.date > dateTo) return false;
    return true;
  });
}

// Último tramo del label "Faena/Subfaena/Ciclo N": la faena y la subfaena
// ya tienen su propia columna.
export function cycleShort(cy) {
  const l = cy?.label || "";
  const idx = l.lastIndexOf("/");
  return idx >= 0 ? l.slice(idx + 1) : l;
}

// Un solo orden para las tablas y tarjetas de todos los transportistas, por
// `sortBy` y en el sentido de `sortDir`.
export function sortTripsBy(list, { sortBy, sortDir, faenaById, subfaenaById }) {
  const keyOf = (t) => {
    switch (sortBy) {
      case "date": return t.date || "";
      case "vehicle": return (t.vehicleAlias || "").toLowerCase();
      case "faena": {
        const fa = faenaById.get(t.faenaId);
        const sb = subfaenaById.get(t.subfaenaId);
        return `${fa?.name || ""}/${sb?.name || ""}`.toLowerCase();
      }
      case "destino": return `${t.lugar || ""} ${t.destino || ""}`.toLowerCase();
      case "personas": return Number(t.personCount) || 0;
      case "vueltas": return Number(t.qty) || 0;
      case "monto": return Number(t.amount) || 0;
      case "estado": return t.status || "";
      default: return "";
    }
  };
  const arr = [...list];
  arr.sort((a, b) => {
    const ka = keyOf(a);
    const kb = keyOf(b);
    const cmp = typeof ka === "number" && typeof kb === "number"
      ? ka - kb
      : String(ka).localeCompare(String(kb), "es");
    return sortDir === "asc" ? cmp : -cmp;
  });
  return arr;
}

// Vueltas agrupadas por transportista, con alias, total y desglose
// pendiente/pagado para el encabezado del grupo. Las vueltas sin carrierId
// van al grupo "Sin transportista".
export function groupTripsByCarrier(trips, carrierById) {
  const groups = new Map();
  for (const t of trips) {
    const cid = t.carrierId || "__none__";
    if (!groups.has(cid)) {
      const c = carrierById.get(t.carrierId);
      groups.set(cid, {
        carrierId: cid,
        alias: c?.alias || (cid === "__none__" ? "Sin transportista" : "—"),
        name: c?.name || "",
        trips: [],
        total: 0,
        pendingCount: 0,
        paidCount: 0,
        pendingTotal: 0,
      });
    }
    const g = groups.get(cid);
    g.trips.push(t);
    const amt = Number(t.amount) || 0;
    g.total += amt;
    if (t.status === "paid") g.paidCount += 1;
    else { g.pendingCount += 1; g.pendingTotal += amt; }
  }
  return [...groups.values()].sort((a, b) => a.alias.localeCompare(b.alias, "es"));
}
