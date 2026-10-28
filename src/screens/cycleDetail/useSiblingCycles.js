import { useState, useEffect } from "react";
import { cyclesService } from "../../services";

// Ciclo anterior y siguiente de la misma faena y subfaena, para navegar entre
// ellos.
export function useSiblingCycles({ cycle, id }) {
  "use no memo";
  // Navegación entre ciclos hermanos (misma faena y subfaena), ordenados por
  // su primer día trabajado (mínimo de cycle.days), no por el número del
  // label. Se recarga solo cuando cambia la faena o la subfaena.
  const [siblingCycles, setSiblingCycles] = useState(null);
  useEffect(() => {
    const jobId = cycle?.faenaId;
    if (!jobId) return;
    const subjobId = cycle?.subfaenaId || null;
    let cancelled = false;
    (async () => {
      const list = await cyclesService.list({
        wheres: [["faenaId", "==", jobId]],
        cache: true,
        ttl: 2 * 60 * 1000,
      });
      if (cancelled) return;
      const scope = list.filter((c) => (c.subfaenaId || null) === subjobId);
      // Un ciclo sin días se ordena por startDate o createdAt, nunca por hoy
      // (a diferencia de firstWorkedDay).
      const firstDayForSort = (c) => {
        const days = c.days;
        if (Array.isArray(days) && days.length > 0) {
          return days.reduce((min, d) => (d < min ? d : min), days[0]);
        }
        return c.startDate || c.createdAt?.toDate?.()?.toISOString?.() || "";
      };
      scope.sort((a, b) => firstDayForSort(a).localeCompare(firstDayForSort(b)));
      setSiblingCycles(scope.map((c) => ({ id: c.id, label: c.label })));
    })();
    return () => { cancelled = true; };
  }, [cycle?.faenaId, cycle?.subfaenaId]);
  // Un ciclo sin faena no tiene hermanos, aunque quede una lista de antes.
  const siblings = cycle?.faenaId ? siblingCycles : null;
  const cycleNavIndex = siblings ? siblings.findIndex((c) => c.id === id) : -1;
  const prevCycle = cycleNavIndex > 0 ? siblings[cycleNavIndex - 1] : null;
  const nextCycle = cycleNavIndex >= 0 && cycleNavIndex < (siblings?.length || 0) - 1
    ? siblings[cycleNavIndex + 1]
    : null;
  return { nextCycle, prevCycle };
}
