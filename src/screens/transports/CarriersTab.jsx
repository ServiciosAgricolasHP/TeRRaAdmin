import { useState, useEffect, useMemo } from "react";
import { useCarriers } from "../../contexts/CarriersContext";
import { paymentsService, tripsService } from "../../services/transportsService";
import { useToast } from "../../contexts/ToastContext";
import { fmtCurrency } from "../../utils/format";
import { CarrierEditModal } from "./CarrierEditModal";
import { CarrierSummaryModal } from "./CarrierSummaryModal";
import { UnpricedTripsModal } from "./UnpricedTripsModal";
import { unpricedTripsByCarrier } from "../../utils/unpricedTrips";

// ============================================================
// PESTAÑA TRANSPORTISTAS
// ============================================================

export function CarriersTab({ onViewTrips }) {
  const toast = useToast();
  const { carriers, addCarrier, updateCarrier, softDeleteCarrier, restoreCarrier } = useCarriers();
  const [edit, setEdit] = useState(null); // null | "new" | carrier
  const [summaryCarrier, setSummaryCarrier] = useState(null);
  const [showInactive, setShowInactive] = useState(false);
  // Filtro por tipo (all/own/contracted) y orden de la grilla.
  const [typeFilter, setTypeFilter] = useState("all");
  const [sortBy, setSortBy] = useState("owed_desc");

  // Métricas por transportista: cantidad de resúmenes pendientes, total
  // adeudado (suma de resúmenes pendientes + vueltas sueltas pendientes) y
  // total de vueltas pendientes (sueltas, sin resumen asignado).
  const [pendingPayments, setPendingPayments] = useState([]);
  // Todas las vueltas pendientes: las sueltas alimentan las métricas y las sin
  // precio, el botón "Vueltas sin precio".
  const [allPendingTrips, setAllPendingTrips] = useState([]);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);
  const [showUnpriced, setShowUnpriced] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setMetricsLoading(true);
      try {
        const [payments, trips] = await Promise.all([
          paymentsService.listAll(),
          tripsService.listPending(),
        ]);
        if (cancelled) return;
        setPendingPayments(payments.filter((p) => p.status === "pending"));
        setAllPendingTrips(trips);
      } catch (err) {
        if (!cancelled) toast.error("No se pudieron cargar las métricas de transportistas: " + (err.message || err));
      } finally {
        if (!cancelled) setMetricsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [toast, reloadKey]);

  const pendingTrips = useMemo(() => allPendingTrips.filter((t) => !t.paymentId), [allPendingTrips]);
  const unpricedGroups = useMemo(() => unpricedTripsByCarrier(allPendingTrips, carriers), [allPendingTrips, carriers]);
  const unpricedCount = unpricedGroups.reduce((s, g) => s + g.trips.length, 0);

  const metricsByCarrier = useMemo(() => {
    const map = new Map();
    const ensure = (cid) => {
      if (!map.has(cid)) {
        map.set(cid, { pendingPaymentCount: 0, pendingPaymentTotal: 0, pendingTripCount: 0, pendingTripTotal: 0 });
      }
      return map.get(cid);
    };
    for (const p of pendingPayments) {
      const e = ensure(p.carrierId);
      e.pendingPaymentCount += 1;
      e.pendingPaymentTotal += Number(p.total) || 0;
    }
    for (const t of pendingTrips) {
      const e = ensure(t.carrierId);
      e.pendingTripCount += 1;
      e.pendingTripTotal += Number(t.amount) || 0;
    }
    return map;
  }, [pendingPayments, pendingTrips]);

  const totalsAll = useMemo(() => {
    let owed = 0, resumenes = 0, vueltas = 0;
    for (const [, m] of metricsByCarrier) {
      owed += m.pendingPaymentTotal + m.pendingTripTotal;
      resumenes += m.pendingPaymentCount;
      vueltas += m.pendingTripCount;
    }
    return { owed, resumenes, vueltas };
  }, [metricsByCarrier]);

  const visible = useMemo(() => {
    let list = showInactive ? carriers : carriers.filter((c) => c.active !== false);
    if (typeFilter !== "all") list = list.filter((c) => (c.type || "contracted") === typeFilter);
    const owedOf = (c) => {
      const m = metricsByCarrier.get(c.id);
      return m ? (m.pendingPaymentTotal + m.pendingTripTotal) : 0;
    };
    const arr = [...list];
    arr.sort((a, b) => {
      switch (sortBy) {
        case "owed_desc":
          return owedOf(b) - owedOf(a);
        case "alpha":
          return String(a.alias || "").localeCompare(String(b.alias || ""), "es");
        case "type":
          return String(a.type || "contracted").localeCompare(String(b.type || "contracted")) ||
            String(a.alias || "").localeCompare(String(b.alias || ""), "es");
        default:
          return 0;
      }
    });
    return arr;
  }, [carriers, showInactive, typeFilter, sortBy, metricsByCarrier]);

  const handleSave = async (data) => {
    if (edit && edit !== "new") {
      await updateCarrier(edit.id, data);
    } else {
      await addCarrier(data);
    }
    setEdit(null);
  };

  return (
    <div>
      {/* Totales generales: adeudado, resúmenes pendientes y vueltas sueltas */}
      {!metricsLoading && totalsAll.owed > 0 && (
        <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5 text-xs">
          <div>
            <div className="text-[var(--color-muted)]">Adeudado total</div>
            <div className="mt-0.5 font-semibold text-base tabular-nums text-[var(--color-accent)]">{fmtCurrency(totalsAll.owed)}</div>
          </div>
          <div>
            <div className="text-[var(--color-muted)]">Resúmenes pendientes</div>
            <div className="mt-0.5 font-semibold text-base tabular-nums">{totalsAll.resumenes}</div>
          </div>
          <div>
            <div className="text-[var(--color-muted)]">Vueltas sueltas</div>
            <div className="mt-0.5 font-semibold text-base tabular-nums">{totalsAll.vueltas}</div>
          </div>
        </div>
      )}

      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
            <button
              onClick={() => setTypeFilter("all")}
              className={`px-2.5 py-1 ${typeFilter === "all" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
            >
              Todos ({carriers.length})
            </button>
            <button
              onClick={() => setTypeFilter("own")}
              className={`px-2.5 py-1 border-l border-[var(--color-border)] ${typeFilter === "own" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
            >
              🏠 Propios ({carriers.filter((c) => c.type === "own").length})
            </button>
            <button
              onClick={() => setTypeFilter("contracted")}
              className={`px-2.5 py-1 border-l border-[var(--color-border)] ${typeFilter === "contracted" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
            >
              🚚 Contratados ({carriers.filter((c) => (c.type || "contracted") === "contracted").length})
            </button>
          </div>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
            title="Ordenar por"
          >
            <option value="owed_desc">Mayor adeudado</option>
            <option value="alpha">Alfabético</option>
            <option value="type">Por tipo</option>
          </select>
          <label className="flex items-center gap-1 text-xs text-[var(--color-muted)]">
            <input type="checkbox" checked={showInactive} onChange={(e) => setShowInactive(e.target.checked)} />
            Mostrar inactivos
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unpricedCount > 0 && (
            <button
              onClick={() => setShowUnpriced(true)}
              className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-1.5 text-sm font-medium text-[var(--color-warning)] hover:opacity-90"
              title="Vueltas pendientes de transportistas contratados que todavía no tienen tarifa"
            >
              ⚠ Vueltas sin precio ({unpricedCount})
            </button>
          )}
          <button
            onClick={() => setEdit("new")}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            + Transportista
          </button>
        </div>
      </div>

      {visible.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          Sin transportistas
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
          {visible.map((c) => {
            const m = metricsByCarrier.get(c.id) || { pendingPaymentCount: 0, pendingPaymentTotal: 0, pendingTripCount: 0, pendingTripTotal: 0 };
            const owed = m.pendingPaymentTotal + m.pendingTripTotal;
            const hasDebt = owed > 0;
            const isOwn = c.type === "own";
            const isInactive = c.active === false;
            // Banda superior según tipo: propio = color de acento, contratado =
            // ámbar. Los inactivos van en gris.
            const bandColor = isOwn ? "var(--color-accent)" : "#d97706";
            const bandSoft = isOwn ? "var(--color-accent-soft)" : "#fef3c7";
            return (
              <div
                key={c.id}
                role="button"
                tabIndex={0}
                onClick={() => setSummaryCarrier(c)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setSummaryCarrier(c);
                  }
                }}
                className={`group relative cursor-pointer overflow-hidden rounded-lg border bg-[var(--color-surface)] shadow-sm transition-all hover:shadow-md ${
                  isInactive ? "border-[var(--color-border)] opacity-60" : "border-[var(--color-border)] hover:border-[var(--color-accent)]"
                }`}
                title="Ver el resumen del transportista"
                style={{ borderTop: `3px solid ${isInactive ? "var(--color-border)" : bandColor}` }}
              >
                <div className="p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm">{isOwn ? "🏠" : "🚚"}</span>
                        <div className="truncate font-semibold">{c.alias}</div>
                      </div>
                      <div className="truncate text-xs text-[var(--color-muted)]">{c.name}</div>
                    </div>
                    <span
                      className="shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium"
                      style={{ background: bandSoft, color: bandColor }}
                    >
                      {isOwn ? "propio" : "contratado"}
                    </span>
                  </div>

                  {/* Métricas: adeudado destacado, resúmenes y vueltas */}
                  <div className="mt-2.5 grid grid-cols-3 gap-1.5">
                    <div className={`rounded-md p-1.5 ${hasDebt ? "bg-[var(--color-warning-soft)]" : "bg-[var(--color-surface-2)]"}`}>
                      <div className="text-[9px] uppercase tracking-wide text-[var(--color-muted)]">Adeudado</div>
                      <div className={`mt-0.5 text-xs font-bold tabular-nums ${hasDebt ? "text-[var(--color-warning)]" : "text-[var(--color-muted)]"}`}>
                        {hasDebt ? fmtCurrency(owed) : "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-[var(--color-surface-2)] p-1.5">
                      <div className="text-[9px] uppercase tracking-wide text-[var(--color-muted)]">Resúmenes</div>
                      <div className="mt-0.5 text-xs font-bold tabular-nums">
                        {m.pendingPaymentCount > 0 ? m.pendingPaymentCount : "—"}
                      </div>
                    </div>
                    <div className="rounded-md bg-[var(--color-surface-2)] p-1.5">
                      <div className="text-[9px] uppercase tracking-wide text-[var(--color-muted)]">Vueltas</div>
                      <div className="mt-0.5 text-xs font-bold tabular-nums">
                        {m.pendingTripCount > 0 ? m.pendingTripCount : "—"}
                      </div>
                    </div>
                  </div>

                  {!isOwn && c.defaultRate > 0 && (
                    <div className="mt-2 text-[10px] text-[var(--color-muted)]">
                      Tarifa por defecto · <span className="tabular-nums">{fmtCurrency(c.defaultRate)}</span>
                    </div>
                  )}

                  <div className="mt-2 flex flex-wrap gap-1 text-[10px]">
                    {(c.vehicles || []).map((v) => (
                      <span key={v.alias} className="inline-flex items-center gap-0.5 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5">
                        🚐 {v.alias}
                        {v.plate && <span className="text-[var(--color-muted)]">({v.plate})</span>}
                      </span>
                    ))}
                    {(c.vehicles || []).length === 0 && (
                      <span className="text-[var(--color-muted)] italic">sin vehículos</span>
                    )}
                  </div>
                </div>

                <div
                  className="flex items-center justify-between border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5"
                  onClick={(e) => e.stopPropagation()}
                >
                  <span className="text-[10px] text-[var(--color-muted)] opacity-0 transition-opacity group-hover:opacity-100">
                    Click para ver el resumen →
                  </span>
                  <div className="flex gap-1">
                    <button
                      onClick={() => onViewTrips(c)}
                      className="rounded px-1.5 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                      title="Ver sus vueltas en la pestaña Vueltas"
                    >
                      🚚 Vueltas
                    </button>
                    <button
                      onClick={() => setEdit(c)}
                      className="rounded px-1.5 py-0.5 text-[11px] text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
                    >
                      Editar
                    </button>
                    {!isInactive ? (
                      <button
                        onClick={() => softDeleteCarrier(c.id)}
                        className="rounded px-1.5 py-0.5 text-[11px] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                      >
                        Desactivar
                      </button>
                    ) : (
                      <button
                        onClick={() => restoreCarrier(c.id)}
                        className="rounded px-1.5 py-0.5 text-[11px] text-[var(--color-success)] hover:bg-[var(--color-accent-soft)]"
                      >
                        Restaurar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <CarrierEditModal open={!!edit} carrier={edit === "new" ? null : edit} onClose={() => setEdit(null)} onSave={handleSave} />
      {summaryCarrier && <CarrierSummaryModal carrier={summaryCarrier} onClose={() => setSummaryCarrier(null)} />}
      {showUnpriced && (
        <UnpricedTripsModal
          groups={unpricedGroups}
          onClose={() => setShowUnpriced(false)}
          onSaved={() => {
            setShowUnpriced(false);
            setReloadKey((k) => k + 1);
          }}
        />
      )}
    </div>
  );
}
