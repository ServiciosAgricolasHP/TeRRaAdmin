import { useMemo, useState } from "react";
import { useEmployers } from "../../hooks/useEmployers";
import { useEmploymentsFrom } from "../../hooks/useEmploymentsFrom";
import { localIsoDate } from "../../utils/dates";
import { activeByWorker, matchesEmploymentFilter } from "../../utils/employment";

// Filtro de la grilla por contrato u honorarios: con contrato, a honorarios o
// sin nada, y el empleador. Cuenta lo vigente en algún día del ciclo, así un
// contrato que terminó a mitad de ciclo sigue contando. Los períodos se leen
// solo con el filtro en uso. `employmentPass(row)` es null sin filtro.
export function useEmploymentFilter(days) {
  const [employmentFilter, setEmploymentFilter] = useState({ type: "", employerId: "" });
  const on = !!(employmentFilter.type || employmentFilter.employerId);
  const sorted = [...days].sort();
  const from = sorted[0] || localIsoDate();
  const to = sorted[sorted.length - 1] || from;
  const { employments, loading } = useEmploymentsFrom(from, on);
  const { employers } = useEmployers();
  const employmentPass = useMemo(() => {
    if (!on) return null;
    const active = activeByWorker(employments, from, to);
    return (row) => matchesEmploymentFilter(active.get(row?.rut), employmentFilter);
  }, [on, employments, from, to, employmentFilter]);
  return { employmentFilter, setEmploymentFilter, employmentPass, employmentLoading: on && loading, employers };
}
