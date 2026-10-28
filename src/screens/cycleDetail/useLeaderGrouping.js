import { useMemo, useEffect } from "react";
import { EMPLOYMENT_GROUPS } from "../../utils/employment";

// Vistas agrupadas de la grilla, con un encabezado por grupo: "Por grupo" (por
// líder, `groupView === "group"`) y "Por contrato" (con contrato, a
// honorarios y sin nada, en ese orden; `groupView === "employment"`, con
// `employmentGroupOf`). También el filtro de "solo con producción" y el salto
// a cada grupo.
export function useLeaderGrouping({ employmentGroupOf, gridRef, groupView, onlyWithProduction, rowDataRaw, rutToLeader, setColumnFilterActive }) {
  "use no memo";
  const LEADER_LOCAL = "CHILENOS";
  const LEADER_FOREIGN = "EXTRANJEROS";
  const LEADER_NONE = "__NONE__";
  const orderLeaders = (leaders) => {
    const arr = [...leaders];
    return arr.sort((a, b) => {
      if (a === b) return 0;
      if (a === LEADER_LOCAL) return -1;
      if (b === LEADER_LOCAL) return 1;
      if (a === LEADER_FOREIGN) return -1;
      if (b === LEADER_FOREIGN) return 1;
      if (a === LEADER_NONE) return 1;
      if (b === LEADER_NONE) return -1;
      return a.localeCompare(b);
    });
  };
  const groupBuckets = useMemo(() => {
    const buckets = new Map();
    for (const row of rowDataRaw) {
      const leader = rutToLeader.get(row.rut) || LEADER_NONE;
      if (!buckets.has(leader)) buckets.set(leader, []);
      buckets.get(leader).push(row);
    }
    for (const [, rows] of buckets) rows.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
    return buckets;
  }, [rowDataRaw, rutToLeader]);
  const leaderGroups = useMemo(() => {
    const keys = orderLeaders([...groupBuckets.keys()]);
    return keys.map((k) => ({
      key: k,
      label: k === LEADER_NONE ? "SIN GRUPO" : k,
      icon: "👥",
      none: k === LEADER_NONE,
      count: groupBuckets.get(k)?.length || 0,
      rows: groupBuckets.get(k) || [],
    }));
  }, [groupBuckets]);
  // Por contrato: los grupos en su orden fijo y sin los vacíos. Las claves
  // llevan prefijo para no chocar con el nombre de un líder.
  const employmentGroups = useMemo(() => {
    if (!employmentGroupOf) return [];
    const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""));
    return EMPLOYMENT_GROUPS.map((g) => {
      const rows = rowDataRaw.filter((r) => employmentGroupOf(r.rut) === g.key).sort(byName);
      return { key: `employment:${g.key}`, label: g.label, icon: g.icon, none: g.key === "none", count: rows.length, rows };
    }).filter((g) => g.count > 0);
  }, [employmentGroupOf, rowDataRaw]);
  const isGroupedView = groupView === "group";
  const isEmploymentView = groupView === "employment" && !!employmentGroupOf;
  const orderedGroups = useMemo(
    () => (isGroupedView ? leaderGroups : isEmploymentView ? employmentGroups : []),
    [isGroupedView, isEmploymentView, leaderGroups, employmentGroups],
  );
  const rowData = useMemo(() => {
    if (!isGroupedView && !isEmploymentView) return rowDataRaw;
    const out = [];
    for (const g of orderedGroups) {
      out.push({
        rut: `__group__${g.key}`,
        _isHeader: true,
        _leader: g.label,
        _leaderKey: g.key,
        _icon: g.icon,
        _count: g.count,
      });
      for (const r of g.rows) out.push(r);
    }
    return out;
  }, [isGroupedView, isEmploymentView, rowDataRaw, orderedGroups]);
  // "Solo con producción" es un filtro externo de AG-Grid (no recorta
  // `rowData`), así convive con el orden y la selección de la grilla. Con un
  // filtro de columna activo deja pasar todo: la búsqueda muestra a todos los
  // que calzan, tengan o no producción.
  const isExternalFilterPresent = () => onlyWithProduction;
  const doesExternalFilterPass = (node) => {
    if (node.data?._isHeader) return true;
    if (gridRef.current?.api?.isColumnFilterPresent()) return true;
    return Number(node.data?.total) > 0;
  };
  useEffect(() => {
    gridRef.current?.api?.onFilterChanged();
  }, [gridRef, onlyWithProduction]);
  const handleGridFilterChanged = () => {
    setColumnFilterActive(!!gridRef.current?.api?.isColumnFilterPresent());
  };
  const scrollToGroup = (key) => {
    const api = gridRef.current?.api;
    if (!api) return;
    const node = api.getRowNode(`__group__${key}`);
    if (node) api.ensureNodeVisible(node, "top");
  };
  return {
    doesExternalFilterPass,
    handleGridFilterChanged,
    isExternalFilterPresent,
    isEmploymentView,
    isGroupedView,
    LEADER_LOCAL,
    LEADER_NONE,
    orderedGroups,
    rowData,
    scrollToGroup,
  };
}
