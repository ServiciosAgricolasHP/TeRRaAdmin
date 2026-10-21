import { useMemo } from "react";
import { useEmploymentsFrom } from "../../hooks/useEmploymentsFrom";
import { localIsoDate } from "../../utils/dates";
import { activeByWorker, employmentGroupOf } from "../../utils/employment";

// La vista "Por contrato" de la grilla: de qué grupo es cada fila (con
// contrato, a honorarios o sin nada) según lo vigente en algún día del ciclo.
// Los períodos se leen solo con esa vista activa. `employmentGroupOf(rut)` es
// null mientras no está activa.
export function useEmploymentGroups(days, enabled) {
  const sorted = [...days].sort();
  const from = sorted[0] || localIsoDate();
  const to = sorted[sorted.length - 1] || from;
  const { employments, loading } = useEmploymentsFrom(from, enabled);
  const groupOf = useMemo(() => {
    if (!enabled) return null;
    const active = activeByWorker(employments, from, to);
    return (rut) => employmentGroupOf(active.get(rut));
  }, [enabled, employments, from, to]);
  return { employmentGroupOf: groupOf, employmentLoading: enabled && loading };
}
