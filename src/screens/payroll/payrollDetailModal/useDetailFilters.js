import { useState, useMemo } from "react";
import { payrollLeadersOf, filterPayrollItems } from "../../../utils/payrollDetail";

// Filtros del detalle: búsqueda, medio de pago, grupo y ciclo, con los items
// que quedan y el panel de Grupo y Ciclo.
export function useDetailFilters({ items, payroll, rutOf }) {
  // Filtros y estado de la UI del detalle.
  const [search, setSearch] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("all"); // all | bank | cash
  const [leaderFilter, setLeaderFilter] = useState(() => new Set());
  const [cycleFilter, setCycleFilter] = useState(() => new Set());

  // Panel de los filtros de Grupo y Ciclo.
  const [showFilters, setShowFilters] = useState(false);

  const toggleSetItem = (setter, value) => setter((prev) => {
    const next = new Set(prev);
    if (next.has(value)) next.delete(value);
    else next.add(value);
    return next;
  });

  const allLeaders = useMemo(() => payrollLeadersOf(items), [items]);

  // Filtros vigentes: se ignora el grupo o el ciclo que ya no está en la
  // nómina (un ciclo que se sacó, un grupo cuyo último trabajador salió). Se
  // descarta al leer y no al editar, así cubre sacar ciclos o labores, sacar un
  // trabajador y recalcular.
  const activeLeaderFilter = useMemo(() => {
    const current = new Set(allLeaders.map((g) => g.leader));
    return new Set([...leaderFilter].filter((l) => current.has(l)));
  }, [leaderFilter, allLeaders]);
  const activeCycleFilter = useMemo(() => {
    const current = new Set((payroll.cycleDetails || []).map((c) => c.id));
    return new Set([...cycleFilter].filter((id) => current.has(id)));
  }, [cycleFilter, payroll.cycleDetails]);

  const filteredItems = useMemo(() => filterPayrollItems(items, { search, paymentMethod, activeLeaderFilter, activeCycleFilter, rutOf }), [items, search, paymentMethod, activeLeaderFilter, activeCycleFilter, rutOf]);

  const hasActiveFilter = !!(search || paymentMethod !== "all" || activeLeaderFilter.size > 0 || activeCycleFilter.size > 0);
  const moreFilterCount = activeLeaderFilter.size + activeCycleFilter.size;
  const clearFilters = () => {
    setSearch("");
    setPaymentMethod("all");
    setLeaderFilter(new Set());
    setCycleFilter(new Set());
  };
  return {
    activeCycleFilter,
    activeLeaderFilter,
    allLeaders,
    clearFilters,
    filteredItems,
    hasActiveFilter,
    moreFilterCount,
    paymentMethod,
    search,
    setCycleFilter,
    setLeaderFilter,
    setPaymentMethod,
    setSearch,
    setShowFilters,
    showFilters,
    toggleSetItem,
  };
}
