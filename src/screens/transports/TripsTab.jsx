import { useState, useEffect, useMemo } from "react";
import Select from "../../components/Select";
import ConfirmDialog from "../../components/ConfirmDialog";
import { TripEditModal } from "../../components/TransportsModal";
import { useCarriers } from "../../contexts/CarriersContext";
import { tripsService, titleCase } from "../../services/transportsService";
import { cyclesService, faenasService, subfaenasService } from "../../services";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useToast } from "../../contexts/ToastContext";
import { fmtCurrency } from "../../utils/format";
import { isoDateNDaysAgo, DEFAULT_HISTORY_DAYS } from "./historyRange";

// ============================================================
// PESTAÑA VUELTAS
// ============================================================

export function TripsTab({ initialCarrierId = null }) {
  const isMobile = useIsMobile();
  const toast = useToast();
  const { activeCarriers, carriers } = useCarriers();
  const [trips, setTrips] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [faenas, setFaenas] = useState([]);
  const [subfaenas, setSubfaenas] = useState([]);
  const [loading, setLoading] = useState(true);
  // `initialCarrierId` se lee solo al montar: TripsTab se vuelve a montar cada
  // vez que se cambia de pestaña.
  const [filter, setFilter] = useState({ carrierId: initialCarrierId || "", status: "", cycleId: "", faenaId: "" });
  const [sinceDate, setSinceDate] = useState(() => isoDateNDaysAgo(DEFAULT_HISTORY_DAYS));
  const [showHistoric, setShowHistoric] = useState(false);
  // Fecha "hasta" (filtra en el cliente, no vuelve a leer) y orden por columna.
  const [dateTo, setDateTo] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  const [editing, setEditing] = useState(null); // vuelta en edición, o null
  const [confirmDel, setConfirmDel] = useState(null);

  const reload = async () => {
    setLoading(true);
    try {
      const tripPromise = showHistoric
        ? tripsService.listAll()
        : tripsService.listSince(sinceDate);
      const [tripList, cyc, fa, sub] = await Promise.all([
        tripPromise,
        cyclesService.list({ cache: true, persist: true, ttl: 5 * 60 * 1000 }),
        faenasService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        subfaenasService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
      ]);
      tripList.sort((a, b) => (a.date < b.date ? 1 : -1));
      setTrips(tripList);
      setCycles(cyc);
      setFaenas(fa);
      setSubfaenas(sub);
    } catch (err) {
      toast.error("No se pudieron cargar las vueltas: " + (err.message || err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sinceDate, showHistoric]);

  const carrierById = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers]);
  const cycleById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);
  const faenaById = useMemo(() => new Map(faenas.map((f) => [f.id, f])), [faenas]);
  const subfaenaById = useMemo(() => new Map(subfaenas.map((s) => [s.id, s])), [subfaenas]);

  // El filtro de Ciclo cuelga de la Faena: sin faena elegida, el select queda
  // vacío y deshabilitado.
  const cycleOptionsForFilter = useMemo(() => {
    if (!filter.faenaId) return [];
    return cycles
      .filter((c) => c.faenaId === filter.faenaId)
      .sort((a, b) => String(a.label || "").localeCompare(String(b.label || ""), "es"));
  }, [cycles, filter.faenaId]);

  const filtered = useMemo(() => {
    return trips.filter((t) => {
      if (filter.carrierId && t.carrierId !== filter.carrierId) return false;
      if (filter.status && t.status !== filter.status) return false;
      if (filter.cycleId && t.cycleId !== filter.cycleId) return false;
      if (filter.faenaId && t.faenaId !== filter.faenaId) return false;
      if (dateTo && t.date && t.date > dateTo) return false;
      return true;
    });
  }, [trips, filter, dateTo]);

  const total = filtered.reduce((s, t) => s + (Number(t.amount) || 0), 0);

  // Último tramo del label "Faena/Subfaena/Ciclo N": la faena y la subfaena
  // ya tienen su propia columna.
  const cycleShort = (cy) => {
    const l = cy?.label || "";
    const idx = l.lastIndexOf("/");
    return idx >= 0 ? l.slice(idx + 1) : l;
  };

  const SORT_OPTIONS = [
    { v: "date", l: "Fecha" },
    { v: "vehicle", l: "Vehículo" },
    { v: "faena", l: "Faena / Ciclo" },
    { v: "destino", l: "Lugar / Destino" },
    { v: "personas", l: "Personas" },
    { v: "vueltas", l: "Vueltas" },
    { v: "monto", l: "Monto" },
    { v: "estado", l: "Estado" },
  ];

  // Un solo orden para las tablas y tarjetas de todos los transportistas.
  const sortTrips = (list) => {
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
  };

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortDir("asc"); }
  };

  // Función simple (no componente) para evitar que React trate cada header
  // como un tipo de componente nuevo en cada render y lo remonte de más.
  const sortTh = (field, label, align) => {
    const active = sortBy === field;
    return (
      <th
        key={field}
        onClick={() => toggleSort(field)}
        title="Ordenar"
        className={`cursor-pointer select-none px-2 py-2 hover:text-[var(--color-foreground)] ${align === "right" ? "text-right" : ""}`}
      >
        <span className={`inline-flex items-center gap-1 ${align === "right" ? "flex-row-reverse" : ""}`}>
          {label}
          <span className={active ? "text-[var(--color-accent)]" : "text-[var(--color-muted)] opacity-50"}>
            {active ? (sortDir === "asc" ? "▲" : "▼") : "⇅"}
          </span>
        </span>
      </th>
    );
  };

  const handleSaveTrip = async (form) => {
    if (!editing) return;
    // Conserva el ciclo, la faena y la subfaena de la vuelta: desde acá no se
    // editan.
    const payload = {
      ...form,
      cycleId: editing.cycleId || null,
      faenaId: editing.faenaId || null,
      subfaenaId: editing.subfaenaId || null,
    };
    try {
      await tripsService.update(editing.id, payload);
      setEditing(null);
      await reload();
      toast.success("Vuelta actualizada");
    } catch (err) {
      toast.error("Error al guardar: " + (err.message || err));
    }
  };

  const handleDeleteTrip = async () => {
    if (!confirmDel) return;
    try {
      await tripsService.remove(confirmDel.id);
      setConfirmDel(null);
      await reload();
      toast.success("Vuelta eliminada");
    } catch (err) {
      toast.error(err.message || "Error al eliminar");
    }
  };

  // Vueltas agrupadas por transportista, con alias, total y desglose
  // pendiente/pagado para el encabezado del grupo. Las vueltas sin carrierId
  // van al grupo "Sin transportista".
  const byCarrier = useMemo(() => {
    const groups = new Map();
    for (const t of filtered) {
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
  }, [filtered, carrierById]);

  // Transportistas expandidos; arrancan todos colapsados.
  const [expandedCarriers, setExpandedCarriers] = useState(() => new Set());
  const toggleCarrier = (cid) => setExpandedCarriers((prev) => {
    const next = new Set(prev);
    if (next.has(cid)) next.delete(cid);
    else next.add(cid);
    return next;
  });
  const expandAll = () => setExpandedCarriers(new Set(byCarrier.map((g) => g.carrierId)));
  const collapseAll = () => setExpandedCarriers(new Set());

  const filterCarrier = filter.carrierId ? carrierById.get(filter.carrierId) : null;

  return (
    <>
    <div>
      {/* Encabezado del transportista filtrado, se llegue desde una tarjeta de
          "Transportistas" o desde el filtro. */}
      {filterCarrier && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm">
          <span className="font-medium text-[var(--color-accent)]">
            🚐 Vueltas — {filterCarrier.alias}{filterCarrier.name ? ` · ${filterCarrier.name}` : ""}
          </span>
          <button
            type="button"
            onClick={() => setFilter((f) => ({ ...f, carrierId: "" }))}
            className="rounded border border-[var(--color-accent)] px-2 py-1 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
          >
            ✕ Ver todos los transportistas
          </button>
        </div>
      )}

      <div className="mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
        <div className="grid grid-cols-1 gap-2 md:grid-cols-5">
          <Select
            label="Transportista"
            value={filter.carrierId}
            onChange={(v) => setFilter((f) => ({ ...f, carrierId: v }))}
            options={activeCarriers.map((c) => ({ value: c.id, label: `${c.alias} — ${c.name}` }))}
            placeholder="Todos"
          />
          <Select
            label="Estado"
            value={filter.status}
            onChange={(v) => setFilter((f) => ({ ...f, status: v }))}
            options={[
              { value: "pending", label: "Pendiente" },
              { value: "paid", label: "Pagado" },
            ]}
            placeholder="Todos"
          />
          <Select
            label="Faena"
            value={filter.faenaId}
            onChange={(v) => setFilter((f) => ({ ...f, faenaId: v, cycleId: "" }))}
            options={faenas.map((f) => ({ value: f.id, label: f.name }))}
            placeholder="Todas"
          />
          <Select
            label="Ciclo"
            value={filter.cycleId}
            onChange={(v) => setFilter((f) => ({ ...f, cycleId: v }))}
            options={cycleOptionsForFilter.map((c) => ({ value: c.id, label: c.label || c.id }))}
            placeholder={filter.faenaId ? "Todos" : "Elige una faena primero"}
            disabled={!filter.faenaId}
          />
          <div className="flex items-end justify-end text-sm">
            <div className="rounded-md bg-[var(--color-accent-soft)] px-3 py-2 text-right">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Total filtrado</div>
              <div className="font-semibold tabular-nums text-[var(--color-accent)]">{fmtCurrency(total)}</div>
            </div>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[var(--color-border)] pt-3 text-xs">
          <span className="text-[var(--color-muted)]">Mostrar:</span>
          <input
            type="date"
            disabled={showHistoric}
            value={sinceDate}
            onChange={(e) => setSinceDate(e.target.value || isoDateNDaysAgo(DEFAULT_HISTORY_DAYS))}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
          />
          <span className="text-[var(--color-muted)]">en adelante</span>
          <label className="flex items-center gap-1">
            <span className="text-[var(--color-muted)]">hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={showHistoric}
              onChange={(e) => setShowHistoric(e.target.checked)}
            />
            <span>ver histórico completo</span>
          </label>
          <span className="mx-1 h-4 w-px bg-[var(--color-border)]" />
          <label className="flex items-center gap-1">
            <span className="text-[var(--color-muted)]">Ordenar</span>
            <select
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1"
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.v} value={o.v}>{o.l}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => setSortDir((d) => (d === "asc" ? "desc" : "asc"))}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
            title={sortDir === "asc" ? "Ascendente — clic para invertir" : "Descendente — clic para invertir"}
          >
            {sortDir === "asc" ? "↑ Asc" : "↓ Desc"}
          </button>
          {!showHistoric && !dateTo && (
            <span className="ml-auto text-[var(--color-muted)]">
              Por defecto últimos {DEFAULT_HISTORY_DAYS} días
            </span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">Cargando...</div>
      ) : filtered.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          Sin vueltas
        </div>
      ) : (
        <>
          <div className="mb-2 flex items-center justify-end gap-1 text-xs">
            <span className="mr-1 text-[var(--color-muted)]">
              {byCarrier.length} transportista{byCarrier.length === 1 ? "" : "s"}
            </span>
            <button
              type="button"
              onClick={expandAll}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
              disabled={expandedCarriers.size === byCarrier.length}
            >
              ▾ Expandir todos
            </button>
            <button
              type="button"
              onClick={collapseAll}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
              disabled={expandedCarriers.size === 0}
            >
              ▸ Colapsar todos
            </button>
          </div>
          <div className="space-y-2">
            {byCarrier.map((g) => {
              // Con un solo transportista visible, el grupo va siempre expandido.
              const expanded = expandedCarriers.has(g.carrierId) || byCarrier.length === 1;
              const carrierObj = carrierById.get(g.carrierId);
              const isOwn = carrierObj?.type === "own";
              const bandColor = g.carrierId === "__none__" ? "var(--color-muted)" : (isOwn ? "var(--color-accent)" : "#d97706");
              return (
                <div
                  key={g.carrierId}
                  className="overflow-hidden rounded-lg border border-[var(--color-border)] shadow-sm"
                  style={{ borderTop: `3px solid ${bandColor}` }}
                >
                  <button
                    type="button"
                    onClick={() => toggleCarrier(g.carrierId)}
                    className="flex w-full flex-wrap items-center gap-2.5 bg-[var(--color-surface-2)] px-3 py-2.5 text-left text-sm hover:bg-[var(--color-accent-soft)]"
                  >
                    <span className="text-[var(--color-muted)]">{expanded ? "▾" : "▸"}</span>
                    <span className="text-base leading-none">{g.carrierId === "__none__" ? "❓" : isOwn ? "🏠" : "🚚"}</span>
                    <span className="font-semibold">{g.alias}</span>
                    {g.name && <span className="text-xs text-[var(--color-muted)]">· {g.name}</span>}
                    <span className="ml-1 flex items-center gap-1">
                      <span className="rounded-full bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
                        {g.trips.length} vuelta{g.trips.length === 1 ? "" : "s"}
                      </span>
                      {g.pendingCount > 0 && (
                        <span className="rounded-full bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-warning)]">
                          {g.pendingCount} pend.
                        </span>
                      )}
                      {g.paidCount > 0 && (
                        <span className="rounded-full bg-[var(--color-success-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-success)]">
                          {g.paidCount} pag.
                        </span>
                      )}
                    </span>
                    <span className="ml-auto text-right">
                      <span className="block font-semibold tabular-nums">{fmtCurrency(g.total)}</span>
                      {g.pendingTotal > 0 && g.pendingTotal !== g.total && (
                        <span className="block text-[10px] text-[var(--color-warning)] tabular-nums">
                          pend: {fmtCurrency(g.pendingTotal)}
                        </span>
                      )}
                    </span>
                  </button>
                  {expanded && (
                    isMobile ? (
                      <div className="space-y-2 p-2">
                        {sortTrips(g.trips).map((t) => {
                          const cy = cycleById.get(t.cycleId);
                          const fa = faenaById.get(t.faenaId);
                          const sb = subfaenaById.get(t.subfaenaId);
                          const zero = !(Number(t.amount) > 0);
                          const isPaid = t.status === "paid";
                          return (
                            <div
                              key={t.id}
                              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2.5 space-y-2 shadow-sm"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="font-mono text-xs text-[var(--color-muted)]">{t.date}</div>
                                <div className="text-right">
                                  <div className={`font-semibold tabular-nums ${zero ? "italic text-[var(--color-muted)]" : "text-[var(--color-accent)]"}`}>
                                    {fmtCurrency(t.amount)}
                                  </div>
                                  {isPaid ? (
                                    <span className="rounded-full bg-[var(--color-success-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-success)]">
                                      pagado
                                    </span>
                                  ) : (
                                    <span className="rounded-full bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-warning)]">
                                      pendiente
                                    </span>
                                  )}
                                </div>
                              </div>
                              <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-xs">
                                <div>
                                  <span className="text-[var(--color-muted)]">Vehículo: </span>
                                  {t.vehicleAlias || "—"}
                                  {t.kind === "approach" && (
                                    <span className="ml-1 rounded-full bg-purple-100 px-1.5 py-0.5 text-[10px] font-medium text-purple-700 dark:bg-purple-900/30 dark:text-purple-300">
                                      acercamiento
                                    </span>
                                  )}
                                </div>
                                <div>
                                  <span className="text-[var(--color-muted)]">Personas: </span>
                                  {t.personCount ?? "—"}
                                </div>
                                <div className="col-span-2">
                                  <span className="text-[var(--color-muted)]">Faena / Ciclo: </span>
                                  {fa?.name || "—"}
                                  {sb && <span className="text-[var(--color-muted)]"> / {sb.name}</span>}
                                  {cy && <span className="text-[var(--color-muted)]"> · {cycleShort(cy)}</span>}
                                </div>
                                <div className="col-span-2">
                                  <span className="text-[var(--color-muted)]">Lugar → Destino: </span>
                                  {titleCase(t.lugar) || "—"}
                                  {t.destino && <span className="text-[var(--color-muted)]"> → {titleCase(t.destino)}</span>}
                                </div>
                                <div>
                                  <span className="text-[var(--color-muted)]">Vueltas: </span>
                                  <span className="tabular-nums">{t.qty}</span>
                                </div>
                              </div>
                              <div className="flex justify-end gap-1 border-t border-[var(--color-border)] pt-1.5">
                                <button
                                  onClick={() => setEditing(t)}
                                  disabled={isPaid}
                                  title={isPaid ? "No se puede editar una vuelta pagada" : "Editar"}
                                  className="rounded px-2 py-0.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  Editar
                                </button>
                                <button
                                  onClick={() => setConfirmDel(t)}
                                  disabled={isPaid}
                                  title={isPaid ? "No se puede eliminar una vuelta pagada" : "Eliminar"}
                                  className="rounded px-2 py-0.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
                                >
                                  ✕
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-[var(--color-accent-soft)] text-left text-[10px] uppercase tracking-wide text-[var(--color-accent)]">
                            <tr>
                              {sortTh("date", "Fecha")}
                              {sortTh("vehicle", "Vehículo")}
                              {sortTh("faena", "Faena / Ciclo")}
                              {sortTh("destino", "Lugar → Destino")}
                              {sortTh("personas", "Personas", "right")}
                              {sortTh("vueltas", "Vueltas", "right")}
                              {sortTh("monto", "Monto", "right")}
                              {sortTh("estado", "Estado")}
                              <th className="px-2 py-2"></th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortTrips(g.trips).map((t, idx) => {
                              const cy = cycleById.get(t.cycleId);
                              const fa = faenaById.get(t.faenaId);
                              const sb = subfaenaById.get(t.subfaenaId);
                              const zero = !(Number(t.amount) > 0);
                              const isPaid = t.status === "paid";
                              return (
                                <tr
                                  key={t.id}
                                  className={`border-t border-[var(--color-border)] transition-colors hover:bg-[var(--color-accent-soft)]/50 ${idx % 2 === 1 ? "bg-[var(--color-surface-2)]/40" : ""}`}
                                >
                                  <td className="px-2 py-1.5 font-mono tabular-nums">{t.date}</td>
                                  <td className="px-2 py-1.5">
                                    <div className="flex items-center gap-1.5">
                                      <span>{t.vehicleAlias || "—"}</span>
                                      {t.kind === "approach" && (
                                        <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
                                          acercamiento
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <div className="flex flex-wrap items-center gap-1.5">
                                      <span>
                                        {fa?.name || "—"}
                                        {sb && <span className="text-[var(--color-muted)]"> / {sb.name}</span>}
                                      </span>
                                      {cy && (
                                        <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
                                          {cycleShort(cy)}
                                        </span>
                                      )}
                                    </div>
                                  </td>
                                  <td className="px-2 py-1.5">
                                    {titleCase(t.lugar) || "—"}
                                    {t.destino && <span className="text-[var(--color-muted)]"> → {titleCase(t.destino)}</span>}
                                  </td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{t.personCount ?? "—"}</td>
                                  <td className="px-2 py-1.5 text-right tabular-nums">{t.qty}</td>
                                  <td
                                    className={`px-2 py-1.5 text-right tabular-nums ${
                                      zero ? "italic text-[var(--color-muted)]" : "font-semibold text-[var(--color-accent)]"
                                    }`}
                                  >
                                    {fmtCurrency(t.amount)}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    {isPaid ? (
                                      <span className="rounded-full bg-[var(--color-success-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-success)]">
                                        pagado
                                      </span>
                                    ) : (
                                      <span className="rounded-full bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--color-warning)]">
                                        pendiente
                                      </span>
                                    )}
                                  </td>
                                  <td className="px-2 py-1.5">
                                    <div className="flex gap-1">
                                      <button
                                        onClick={() => setEditing(t)}
                                        disabled={isPaid}
                                        title={isPaid ? "No se puede editar una vuelta pagada" : "Editar"}
                                        className="rounded px-2 py-0.5 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        Editar
                                      </button>
                                      <button
                                        onClick={() => setConfirmDel(t)}
                                        disabled={isPaid}
                                        title={isPaid ? "No se puede eliminar una vuelta pagada" : "Eliminar"}
                                        className="rounded px-2 py-0.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-40 disabled:cursor-not-allowed"
                                      >
                                        ✕
                                      </button>
                                    </div>
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>

    <TripEditModal
      open={!!editing}
      onClose={() => setEditing(null)}
      trip={editing}
      carriers={carriers}
      days={[]}
      onSave={handleSaveTrip}
    />

    <ConfirmDialog
      open={!!confirmDel}
      title="Eliminar vuelta"
      message={
        confirmDel
          ? `¿Eliminar la vuelta del ${confirmDel.date} (${fmtCurrency(confirmDel.amount)})?`
          : ""
      }
      confirmLabel="Eliminar"
      danger
      onCancel={() => setConfirmDel(null)}
      onConfirm={handleDeleteTrip}
    />
    </>
  );
}
