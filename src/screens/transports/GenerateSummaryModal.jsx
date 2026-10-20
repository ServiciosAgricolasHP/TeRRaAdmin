import { useState, useEffect, useMemo } from "react";
import Modal from "../../components/Modal";
import TextField from "../../components/TextField";
import Select from "../../components/Select";
import { tripsService, paymentsService, titleCase } from "../../services/transportsService";
import { fmtCurrency } from "../../utils/format";

export function GenerateSummaryModal({ open, onClose, carriers, faenas = [], faenaById, subfaenaById, cycleById, onGenerated }) {
  const [carrierId, setCarrierId] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [faenaFilter, setFaenaFilter] = useState("");
  const [preview, setPreview] = useState(null); // { trips, total }
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notes, setNotes] = useState("");
  const [sortBy, setSortBy] = useState("date");
  const [sortDir, setSortDir] = useState("desc");
  // Vueltas sueltas (pendientes, sin resumen) por transportista, leídas una
  // vez al abrir el modal. El selector solo lista a los transportistas que
  // tienen alguna, con su cantidad y monto.
  const [pendingByCarrier, setPendingByCarrier] = useState(() => new Map());
  const [loadingCarrierCounts, setLoadingCarrierCounts] = useState(false);

  useEffect(() => {
    if (!open) {
      setCarrierId("");
      setPeriodFrom("");
      setPeriodTo("");
      setFaenaFilter("");
      setPreview(null);
      setNotes("");
      setSortBy("date");
      setSortDir("desc");
      return;
    }
    let cancelled = false;
    setLoadingCarrierCounts(true);
    tripsService.listPendingUnlinked()
      .then((trips) => {
        if (cancelled) return;
        const map = new Map();
        for (const t of trips) {
          if (!t.carrierId) continue;
          const cur = map.get(t.carrierId) || { count: 0, total: 0 };
          cur.count += 1;
          cur.total += Number(t.amount) || 0;
          map.set(t.carrierId, cur);
        }
        setPendingByCarrier(map);
      })
      .finally(() => { if (!cancelled) setLoadingCarrierCounts(false); });
    return () => { cancelled = true; };
  }, [open]);

  const carrierOptions = useMemo(() => {
    return carriers
      .filter((c) => pendingByCarrier.has(c.id))
      .map((c) => {
        const p = pendingByCarrier.get(c.id);
        return { value: c.id, label: `${c.alias} — ${c.name} · ${p.count} suelta${p.count === 1 ? "" : "s"} (${fmtCurrency(p.total)})` };
      })
      .sort((a, b) => (pendingByCarrier.get(b.value)?.count || 0) - (pendingByCarrier.get(a.value)?.count || 0));
  }, [carriers, pendingByCarrier]);

  // La vista previa se recarga al cambiar el transportista o el rango de
  // fechas, y limpia el filtro de faena.
  useEffect(() => {
    if (!open || !carrierId) { setPreview(null); return; }
    let cancelled = false;
    setFaenaFilter("");
    setLoading(true);
    paymentsService.previewSummary({ carrierId, periodFrom, periodTo })
      .then((r) => { if (!cancelled) setPreview(r); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, carrierId, periodFrom, periodTo]);

  const handleGenerate = async () => {
    if (!preview || preview.trips.length === 0) return;
    setSaving(true);
    try {
      await paymentsService.createSummary({
        carrierId,
        periodFrom: periodFrom || null,
        periodTo: periodTo || null,
        groupBy: "day",
        tripIds: preview.trips.map((t) => t.id),
        total: preview.total,
        notes,
      });
      onGenerated();
    } finally {
      setSaving(false);
    }
  };

  // El filtro de faena solo acota el detalle: el resumen generado incluye
  // TODAS las vueltas pendientes del período (preview.trips).
  const faenaOptions = useMemo(() => {
    const ids = new Set((preview?.trips || []).map((t) => t.faenaId).filter(Boolean));
    return [...ids]
      .map((id) => ({ value: id, label: faenaById?.get(id)?.name || id }))
      .sort((a, b) => a.label.localeCompare(b.label, "es"));
  }, [preview, faenaById]);

  const visibleTrips = useMemo(() => {
    if (!preview) return [];
    return faenaFilter ? preview.trips.filter((t) => t.faenaId === faenaFilter) : preview.trips;
  }, [preview, faenaFilter]);

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
  ];

  const sortedTrips = useMemo(() => {
    const keyOf = (t) => {
      switch (sortBy) {
        case "date": return t.date || "";
        case "vehicle": return (t.vehicleAlias || "").toLowerCase();
        case "faena": {
          const fa = faenaById?.get(t.faenaId);
          const sb = subfaenaById?.get(t.subfaenaId);
          return `${fa?.name || ""}/${sb?.name || ""}`.toLowerCase();
        }
        case "destino": return `${t.lugar || ""} ${t.destino || ""}`.toLowerCase();
        case "personas": return Number(t.personCount) || 0;
        case "vueltas": return Number(t.qty) || 0;
        case "monto": return Number(t.amount) || 0;
        default: return "";
      }
    };
    const arr = [...visibleTrips];
    arr.sort((a, b) => {
      const ka = keyOf(a);
      const kb = keyOf(b);
      const cmp = typeof ka === "number" && typeof kb === "number"
        ? ka - kb
        : String(ka).localeCompare(String(kb), "es");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return arr;
  }, [visibleTrips, sortBy, sortDir, faenaById, subfaenaById]);

  const toggleSort = (field) => {
    if (sortBy === field) setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    else { setSortBy(field); setSortDir("asc"); }
  };

  const sortTh = (field, label, align) => {
    const active = sortBy === field;
    return (
      <th
        key={field}
        onClick={() => toggleSort(field)}
        title="Ordenar"
        className={`cursor-pointer select-none px-2 py-1.5 hover:text-[var(--color-foreground)] ${align === "right" ? "text-right" : ""}`}
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

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Generar resumen de transporte"
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={handleGenerate}
            disabled={!preview || preview.trips.length === 0 || saving}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Generar resumen"}
          </button>
        </>
      }
    >
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Select
          label="Transportista"
          value={carrierId}
          onChange={setCarrierId}
          options={carrierOptions}
          placeholder={loadingCarrierCounts ? "Cargando..." : carrierOptions.length ? "Selecciona" : "Sin vueltas sueltas"}
          disabled={loadingCarrierCounts || carrierOptions.length === 0}
          required
        />
        <Select
          label="Filtrar detalle por faena"
          value={faenaFilter}
          onChange={setFaenaFilter}
          options={faenaOptions}
          placeholder={faenaOptions.length ? "Todas" : "—"}
          disabled={faenaOptions.length === 0}
        />
        <TextField label="Desde" type="date" value={periodFrom} onChange={setPeriodFrom} />
        <TextField label="Hasta" type="date" value={periodTo} onChange={setPeriodTo} />
        <div className="md:col-span-2">
          <TextField label="Notas" value={notes} onChange={setNotes} />
        </div>
      </div>

      <div className="mt-4">
        {!loadingCarrierCounts && carrierOptions.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
            No hay vueltas sueltas de ningún transportista en este momento.
          </p>
        ) : !carrierId ? (
          <p className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
            Elige un transportista para ver sus vueltas pendientes.
          </p>
        ) : loading && !preview ? (
          <p className="py-8 text-center text-sm text-[var(--color-muted)]">Cargando vueltas pendientes...</p>
        ) : preview && preview.trips.length === 0 ? (
          <p className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
            No hay vueltas pendientes en el período seleccionado.
          </p>
        ) : preview ? (
          <>
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="text-[var(--color-muted)]">
                {faenaFilter ? `Mostrando ${visibleTrips.length} de ${preview.trips.length}` : `${preview.trips.length}`} vuelta{preview.trips.length === 1 ? "" : "s"} pendiente{preview.trips.length === 1 ? "" : "s"}
                {loading && <span className="ml-1 italic">(actualizando...)</span>}
              </span>
              <span className="text-right">
                <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Total a generar </span>
                <span className="font-semibold tabular-nums">{fmtCurrency(preview.total)}</span>
              </span>
            </div>
            <div className="max-h-72 overflow-auto rounded-md border border-[var(--color-border)]">
              <table className="w-full text-xs">
                <thead className="sticky top-0 z-10 border-b-2 border-[var(--color-accent)]/40 bg-[var(--color-surface-2)] text-left text-[10px] uppercase tracking-wide text-[var(--color-accent)]">
                  <tr>
                    {sortTh("date", "Fecha")}
                    {sortTh("vehicle", "Vehículo")}
                    {sortTh("faena", "Faena / Ciclo")}
                    {sortTh("destino", "Lugar → Destino")}
                    {sortTh("personas", "Personas", "right")}
                    {sortTh("vueltas", "Vueltas", "right")}
                    {sortTh("monto", "Monto", "right")}
                  </tr>
                </thead>
                <tbody>
                  {sortedTrips.map((t, idx) => {
                    const cy = cycleById?.get(t.cycleId);
                    const fa = faenaById?.get(t.faenaId);
                    const sb = subfaenaById?.get(t.subfaenaId);
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
                        <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{fmtCurrency(t.amount)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </Modal>
  );
}
