import { useState, useEffect, useEffectEvent, useMemo } from "react";
import { useCarriers } from "../../contexts/CarriersContext";
import { tripsService, paymentsService, titleCase } from "../../services/transportsService";
import { cyclesService } from "../../services";
import { listJobs, listSubjobs } from "../../services/jobLists";
import { useToast } from "../../contexts/ToastContext";
import { fmtCurrency } from "../../utils/format";
import ScreenLoader from "../../components/ScreenLoader";
import { attempt } from "../../utils/attempt";

// ============================================================
// PESTAÑA PAGO POR FAENA: elige ciclos y genera un resumen por transportista
// ============================================================

export function FaenaBatchTab() {
  const toast = useToast();
  const { carriers } = useCarriers();
  const [step, setStep] = useState(1); // 1: elegir ciclos, 2: vista previa
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [faenas, setFaenas] = useState([]);
  const [subfaenas, setSubfaenas] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [allTrips, setAllTrips] = useState([]); // vueltas sueltas de ciclos abiertos
  const [selectedCycleIds, setSelectedCycleIds] = useState(() => new Set());
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [carrierItems, setCarrierItems] = useState([]); // [{carrierId, carrier, alias, name, trips, total, include, expanded}]

  const load = async () => {
    setLoading(true);
    const { error: err } = await attempt(async () => {
      const [f, s, c, pendingT] = await Promise.all([
        listJobs(),
        listSubjobs(),
        cyclesService.list({ order: ["createdAt", "desc"], cache: true, persist: true, ttl: 5 * 60 * 1000 }),
        tripsService.listPendingUnlinked(),
      ]);
      setFaenas(f);
      setSubfaenas(s);
      setCycles(c);
      // Solo ciclos abiertos; la consulta ya trae solo vueltas pendientes y sin resumen.
      const activeCycleIds = new Set(c.filter((x) => x.status !== "closed").map((x) => x.id));
      setAllTrips(pendingT.filter((t) => activeCycleIds.has(t.cycleId)));
    });
    setLoading(false);
    if (err) throw err;
  };

  const loadOnMount = useEffectEvent(() => load());
  useEffect(() => {
    loadOnMount();
  }, []);

  const subfaenaName = (id) => subfaenas.find((s) => s.id === id)?.name || "";

  const activeByFaena = useMemo(() => {
    const groups = new Map();
    for (const f of faenas) groups.set(f.id, { faena: f, cycles: [] });
    for (const c of cycles) {
      if (c.status === "closed") continue;
      const g = groups.get(c.faenaId);
      if (g) g.cycles.push(c);
    }
    return [...groups.values()].filter((g) => g.cycles.length > 0);
  }, [faenas, cycles]);

  const tripsInRange = useMemo(
    () => allTrips.filter((t) => (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo)),
    [allTrips, dateFrom, dateTo],
  );

  const cycleStats = useMemo(() => {
    const stats = {};
    for (const t of tripsInRange) {
      const cid = t.cycleId;
      if (!stats[cid]) stats[cid] = { total: 0, count: 0 };
      stats[cid].total += Number(t.amount) || 0;
      stats[cid].count += 1;
    }
    return stats;
  }, [tripsInRange]);

  const toggleCycle = (id) => {
    setSelectedCycleIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildPreview = () => {
    if (selectedCycleIds.size === 0) return;
    const trips = tripsInRange.filter((t) => selectedCycleIds.has(t.cycleId));
    const byCarrier = new Map();
    for (const t of trips) {
      if (!byCarrier.has(t.carrierId)) {
        byCarrier.set(t.carrierId, { carrierId: t.carrierId, trips: [], total: 0 });
      }
      const e = byCarrier.get(t.carrierId);
      e.trips.push(t);
      e.total += Number(t.amount) || 0;
    }
    const list = [...byCarrier.values()].map((e) => {
      const carrier = carriers.find((c) => c.id === e.carrierId);
      return {
        ...e,
        carrier,
        name: carrier?.name || "(transportista eliminado)",
        alias: carrier?.alias || "—",
        include: true,
        expanded: false,
      };
    }).sort((a, b) => (a.alias || "").localeCompare(b.alias || ""));
    setCarrierItems(list);
    setStep(2);
  };

  const updateItem = (carrierId, patch) =>
    setCarrierItems((prev) => prev.map((p) => (p.carrierId === carrierId ? { ...p, ...patch } : p)));

  const removeTrip = (carrierId, tripId) =>
    setCarrierItems((prev) =>
      prev.map((p) => {
        if (p.carrierId !== carrierId) return p;
        const trips = p.trips.filter((t) => t.id !== tripId);
        const total = trips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
        return { ...p, trips, total };
      }),
    );

  const totalSelected = useMemo(
    () => carrierItems.filter((p) => p.include).reduce((s, p) => s + p.total, 0),
    [carrierItems],
  );
  const includedCount = useMemo(() => carrierItems.filter((p) => p.include).length, [carrierItems]);

  const generate = async () => {
    const items = carrierItems.filter((p) => p.include && p.trips.length > 0);
    if (items.length === 0) {
      toast.warning("No hay transportistas con vueltas para pagar.");
      return;
    }
    setBusy(true);
    const { error: err } = await attempt(async () => {
      const cycleIds = [...selectedCycleIds];
      let created = 0;
      for (const it of items) {
        const datesSorted = it.trips.map((t) => t.date).sort();
        await paymentsService.createSummary({
          carrierId: it.carrierId,
          periodFrom: datesSorted[0] || null,
          periodTo: datesSorted[datesSorted.length - 1] || null,
          groupBy: "day",
          tripIds: it.trips.map((t) => t.id),
          total: it.total,
          notes: `Pago por faena · ${cycleIds.length} ciclo(s)`,
        });
        created += 1;
      }
      toast.success(`Se generaron ${created} resúmenes de pago.`);
      setSelectedCycleIds(new Set());
      setCarrierItems([]);
      setStep(1);
      await load();
    });
    setBusy(false);
    if (err) throw err;
  };

  if (loading) {
    return <ScreenLoader />;
  }

  if (step === 1) {
    if (activeByFaena.length === 0) {
      return (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-muted)]">
          No hay ciclos activos.
        </div>
      );
    }
    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-end gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
            />
          </div>
          {(dateFrom || dateTo) && (
            <button
              onClick={() => { setDateFrom(""); setDateTo(""); }}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)]"
            >
              Limpiar fechas
            </button>
          )}
          <div className="ml-auto text-xs text-[var(--color-muted)]">
            {tripsInRange.length} vuelta(s) en rango
          </div>
        </div>

        <div className="space-y-3">
          {activeByFaena.map(({ faena, cycles }) => (
            <div key={faena.id} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="border-b border-[var(--color-border)] px-4 py-2 text-sm font-semibold">
                {faena.name}
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {cycles.map((c) => {
                  const sub = subfaenaName(c.subfaenaId);
                  const isSelected = selectedCycleIds.has(c.id);
                  const stat = cycleStats[c.id] || { total: 0, count: 0 };
                  const noPending = stat.count === 0;
                  return (
                    <label
                      key={c.id}
                      className={`flex cursor-pointer items-center gap-3 px-4 py-2 hover:bg-[var(--color-accent-soft)] ${
                        noPending ? "opacity-60" : ""
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => toggleCycle(c.id)}
                        disabled={noPending && !isSelected}
                        className="h-4 w-4"
                      />
                      <div className="flex-1 text-sm">
                        <div className="font-medium">{c.label || c.id}</div>
                        {sub && <div className="text-xs text-[var(--color-muted)]">{sub}</div>}
                      </div>
                      <div className="text-right text-xs">
                        <div className={noPending ? "text-[var(--color-muted)]" : "font-semibold text-[var(--color-accent)]"}>
                          Pendiente: {fmtCurrency(stat.total)}
                        </div>
                        {stat.count > 0 && (
                          <div className="text-[var(--color-muted)]">{stat.count} vuelta(s)</div>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        <div className="sticky bottom-0 flex items-center justify-between rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
          <div className="text-sm text-[var(--color-muted)]">
            {selectedCycleIds.size} ciclo(s) seleccionado(s)
          </div>
          <button
            onClick={buildPreview}
            disabled={selectedCycleIds.size === 0}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            Continuar →
          </button>
        </div>
      </div>
    );
  }

  // Paso 2: vista previa
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3">
        <button
          onClick={() => setStep(1)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
        >
          ← Volver
        </button>
        <div className="ml-auto text-sm">
          <span className="text-[var(--color-muted)]">{includedCount} transportista(s) · </span>
          <span className="font-semibold">{fmtCurrency(totalSelected)}</span>
        </div>
        <button
          onClick={generate}
          disabled={busy || includedCount === 0}
          className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
        >
          {busy ? "Generando..." : `Generar ${includedCount} resumen(es)`}
        </button>
      </div>

      {carrierItems.length === 0 ? (
        <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-muted)]">
          No hay vueltas pendientes en los ciclos elegidos.
        </div>
      ) : (
        <div className="space-y-2">
          {carrierItems.map((it) => (
            <div key={it.carrierId} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
              <div className="flex items-center gap-3 px-4 py-2">
                <input
                  type="checkbox"
                  checked={it.include}
                  onChange={(e) => updateItem(it.carrierId, { include: e.target.checked })}
                  className="h-4 w-4"
                />
                <button
                  onClick={() => updateItem(it.carrierId, { expanded: !it.expanded })}
                  className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
                  title="Ver vueltas"
                >
                  {it.expanded ? "▾" : "▸"}
                </button>
                <div className="flex-1 text-sm">
                  <div className="font-medium">{it.alias} <span className="text-xs text-[var(--color-muted)]">· {it.name}</span></div>
                  <div className="text-xs text-[var(--color-muted)]">{it.trips.length} vuelta(s)</div>
                </div>
                <div className="font-semibold">{fmtCurrency(it.total)}</div>
              </div>
              {it.expanded && (
                <div className="border-t border-[var(--color-border)]">
                  <table className="w-full text-sm">
                    <thead className="bg-[var(--color-surface-2)] text-left text-[var(--color-muted)]">
                      <tr>
                        <th className="px-3 py-1.5 text-xs">Fecha</th>
                        <th className="px-3 py-1.5 text-xs">Vehículo</th>
                        <th className="px-3 py-1.5 text-xs">Lugar → Destino</th>
                        <th className="px-3 py-1.5 text-xs">Tipo</th>
                        <th className="px-3 py-1.5 text-right text-xs">Cant.</th>
                        <th className="px-3 py-1.5 text-right text-xs">Tarifa</th>
                        <th className="px-3 py-1.5 text-right text-xs">Monto</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {it.trips.map((t) => (
                        <tr key={t.id} className="border-t border-[var(--color-border)]">
                          <td className="px-3 py-1.5 font-mono text-xs">{t.date}</td>
                          <td className="px-3 py-1.5 text-xs">{t.vehicleAlias || "—"}</td>
                          <td className="px-3 py-1.5 text-xs text-[var(--color-muted)]">
                            {titleCase(t.lugar) || "—"} → {titleCase(t.destino) || "—"}
                          </td>
                          <td className="px-3 py-1.5 text-xs">{t.kind === "approach" ? "Acerc." : "Vuelta"}</td>
                          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{t.qty}</td>
                          <td className="px-3 py-1.5 text-right text-xs tabular-nums">{fmtCurrency(t.rate)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums">{fmtCurrency(t.amount)}</td>
                          <td className="px-3 py-1.5">
                            <button
                              onClick={() => removeTrip(it.carrierId, t.id)}
                              title="Quitar de este pago"
                              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
