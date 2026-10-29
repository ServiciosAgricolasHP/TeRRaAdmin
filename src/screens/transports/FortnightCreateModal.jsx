import { useState, useMemo } from "react";
import Modal from "../../components/Modal";
import { fmtCurrency } from "../../utils/format";

// Alta de quincena: se eligen fechas, faenas y transportistas, y la quincena
// se arma con un resumen nuevo por transportista (con sus vueltas sueltas de
// ese alcance) más los resúmenes sueltos que se elijan importar.
export function FortnightCreateModal({ carriersById, faenas, pendingTrips, looseSummaries, onClose, onCreate }) {
  const [name, setName] = useState("");
  const [periodFrom, setPeriodFrom] = useState("");
  const [periodTo, setPeriodTo] = useState("");
  const [notes, setNotes] = useState("");
  // Transportistas excluidos; vacío = todos incluidos.
  const [excludedCarrierIds, setExcludedCarrierIds] = useState(new Set());
  // Faenas excluidas; vacío = todas incluidas.
  const [excludedFaenaIds, setExcludedFaenaIds] = useState(new Set());
  // Resúmenes existentes elegidos para importar.
  const [importIds, setImportIds] = useState(new Set());
  const [busy, setBusy] = useState(false);

  // Vueltas sueltas (sin paymentId) del rango y de las faenas incluidas: con
  // ellas se arman los resúmenes nuevos.
  const eligibleTrips = useMemo(() => {
    return pendingTrips.filter((t) => {
      if ((periodFrom && t.date < periodFrom) || (periodTo && t.date > periodTo)) return false;
      if (excludedFaenaIds.has(t.faenaId)) return false;
      return true;
    });
  }, [pendingTrips, periodFrom, periodTo, excludedFaenaIds]);

  // Vueltas elegibles agrupadas por transportista.
  const tripsByCarrier = useMemo(() => {
    const m = new Map();
    for (const t of eligibleTrips) {
      if (!m.has(t.carrierId)) m.set(t.carrierId, []);
      m.get(t.carrierId).push(t);
    }
    return m;
  }, [eligibleTrips]);

  // Transportistas con vueltas elegibles, por alias. Entran todos salvo los
  // que se destilden.
  const autoCarriers = useMemo(() => {
    return [...tripsByCarrier.entries()]
      .map(([carrierId, trips]) => {
        const total = trips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
        return { carrierId, trips, total };
      })
      .sort((a, b) => {
        const ca = carriersById.get(a.carrierId);
        const cb = carriersById.get(b.carrierId);
        return (ca?.alias || "").localeCompare(cb?.alias || "");
      });
  }, [tripsByCarrier, carriersById]);

  // Transportistas a los que se les crea un resumen nuevo.
  const perCarrierToCreate = useMemo(
    () => autoCarriers.filter((c) => !excludedCarrierIds.has(c.carrierId)),
    [autoCarriers, excludedCarrierIds],
  );

  // Resúmenes sueltos y no pagados que se pueden importar. Con rango definido,
  // solo los que se cruzan con él; los que no tienen período entran igual.
  const importableSummaries = useMemo(() => {
    return looseSummaries
      .filter((s) => {
        if (!periodFrom && !periodTo) return true;
        const sFrom = s.periodFrom || s.periodTo || null;
        const sTo = s.periodTo || s.periodFrom || null;
        if (!sFrom || !sTo) return true;
        // Se cruzan si NO (sTo < from || sFrom > to)
        if (periodFrom && sTo < periodFrom) return false;
        if (periodTo && sFrom > periodTo) return false;
        return true;
      })
      .sort((a, b) => {
        const ca = carriersById.get(a.carrierId);
        const cb = carriersById.get(b.carrierId);
        return (ca?.alias || "").localeCompare(cb?.alias || "");
      });
  }, [looseSummaries, periodFrom, periodTo, carriersById]);

  const importedTotal = useMemo(() => {
    return importableSummaries
      .filter((s) => importIds.has(s.id))
      .reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  }, [importableSummaries, importIds]);

  const createdTotal = useMemo(
    () => perCarrierToCreate.reduce((s, p) => s + p.total, 0),
    [perCarrierToCreate],
  );

  const grandTotal = createdTotal + importedTotal;
  const totalSummaries = perCarrierToCreate.length + importIds.size;

  const toggleCarrier = (id) => {
    setExcludedCarrierIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleFaena = (id) => {
    setExcludedFaenaIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const toggleImport = (id) => {
    setImportIds((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };
  const includeAllCarriers = () => setExcludedCarrierIds(new Set());
  const excludeAllCarriers = () =>
    setExcludedCarrierIds(new Set(autoCarriers.map((c) => c.carrierId)));

  const onSubmit = async () => {
    if (!name.trim() || totalSummaries === 0) return;
    setBusy(true);
    try {
      await onCreate({
        name,
        periodFrom: periodFrom || null,
        periodTo: periodTo || null,
        notes,
        perCarrier: perCarrierToCreate,
        importSummaryIds: [...importIds],
      });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Nueva quincena"
      size="xl"
      footer={
        <>
          <button onClick={() => !busy && onClose()} disabled={busy} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={onSubmit}
            disabled={!name.trim() || totalSummaries === 0 || busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {busy ? "Creando..." : `Crear quincena (${totalSummaries} resumen${totalSummaries === 1 ? "" : "es"} · ${fmtCurrency(grandTotal)})`}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-2 md:grid-cols-2">
          <label className="block">
            <span className="block text-xs text-[var(--color-muted)]">Nombre *</span>
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder='ej. "Quincena 1 de Mayo 2026"'
              className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <div className="grid grid-cols-2 gap-1">
            <label className="block">
              <span className="block text-xs text-[var(--color-muted)]">Desde</span>
              <input
                type="date"
                value={periodFrom}
                onChange={(e) => setPeriodFrom(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <label className="block">
              <span className="block text-xs text-[var(--color-muted)]">Hasta</span>
              <input
                type="date"
                value={periodTo}
                onChange={(e) => setPeriodTo(e.target.value)}
                className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              />
            </label>
          </div>
        </div>
        <label className="block">
          <span className="block text-xs text-[var(--color-muted)]">Notas (opcional)</span>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>

        {/* Faenas: cada chip excluye o vuelve a incluir una; arrancan todas
            incluidas. */}
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Faenas (filtra las vueltas sueltas elegibles)
            </span>
            {excludedFaenaIds.size > 0 && (
              <button
                onClick={() => setExcludedFaenaIds(new Set())}
                className="rounded px-1 py-0.5 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
              >
                Incluir todas
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-1">
            {faenas.length === 0 && (
              <span className="text-[10px] text-[var(--color-muted)]">Sin faenas activas.</span>
            )}
            {faenas.map((f) => {
              const excluded = excludedFaenaIds.has(f.id);
              return (
                <button
                  key={f.id}
                  onClick={() => toggleFaena(f.id)}
                  className={`rounded-full border px-2 py-0.5 text-xs ${
                    excluded
                      ? "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] line-through"
                      : "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  }`}
                >
                  {f.name}
                </button>
              );
            })}
          </div>
        </div>

        {/* Transportistas con vueltas sueltas en el rango. */}
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Resúmenes nuevos a crear · {perCarrierToCreate.length}/{autoCarriers.length} transportistas · {eligibleTrips.length} vueltas
            </span>
            {autoCarriers.length > 0 && (
              <div className="flex gap-1">
                {excludedCarrierIds.size > 0 && (
                  <button onClick={includeAllCarriers} className="rounded px-1 py-0.5 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]">
                    Incluir todos
                  </button>
                )}
                {excludedCarrierIds.size < autoCarriers.length && (
                  <button onClick={excludeAllCarriers} className="rounded px-1 py-0.5 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]">
                    Excluir todos
                  </button>
                )}
              </div>
            )}
          </div>
          {autoCarriers.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-4 text-center text-xs text-[var(--color-muted)]">
              No hay transportistas con vueltas sueltas en el rango seleccionado.
            </div>
          ) : (
            <div className="max-h-56 space-y-1 overflow-auto">
              {autoCarriers.map((row) => {
                const carrier = carriersById.get(row.carrierId);
                const included = !excludedCarrierIds.has(row.carrierId);
                return (
                  <label
                    key={row.carrierId}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                      included
                        ? "border-[var(--color-accent)] bg-[var(--color-surface)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)] opacity-60"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={included}
                      onChange={() => toggleCarrier(row.carrierId)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 truncate">
                      <span className="font-medium">{carrier?.alias || row.carrierId}</span>
                      <span className="ml-2 text-[10px] text-[var(--color-muted)]">
                        {row.trips.length} vuelta{row.trips.length === 1 ? "" : "s"}
                      </span>
                    </span>
                    <span className="tabular-nums">{fmtCurrency(row.total)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {/* Resúmenes existentes (sueltos, no pagados) que se pueden importar. */}
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="mb-1.5 flex items-center justify-between text-xs">
            <span className="font-medium uppercase tracking-wide text-[var(--color-muted)]">
              Importar resúmenes existentes · {importIds.size}/{importableSummaries.length}
            </span>
            {importableSummaries.length > 0 && importIds.size > 0 && (
              <button
                onClick={() => setImportIds(new Set())}
                className="rounded px-1 py-0.5 text-[10px] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
              >
                Limpiar
              </button>
            )}
          </div>
          {importableSummaries.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-3 text-center text-[11px] text-[var(--color-muted)]">
              No hay resúmenes sueltos para importar.
            </div>
          ) : (
            <div className="max-h-44 space-y-1 overflow-auto">
              {importableSummaries.map((s) => {
                const carrier = carriersById.get(s.carrierId);
                const selected = importIds.has(s.id);
                const period = (s.periodFrom || s.periodTo) ? `${s.periodFrom || "?"} → ${s.periodTo || "?"}` : "—";
                return (
                  <label
                    key={s.id}
                    className={`flex cursor-pointer items-center gap-2 rounded-md border px-2 py-1.5 text-sm ${
                      selected
                        ? "border-[var(--color-accent)] bg-[var(--color-surface)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface)]"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      onChange={() => toggleImport(s.id)}
                      className="h-4 w-4"
                    />
                    <span className="flex-1 truncate">
                      <span className="font-medium">{carrier?.alias || s.carrierId}</span>
                      <span className="ml-2 text-[10px] text-[var(--color-muted)]">
                        {(s.tripIds || []).length} vuelta{(s.tripIds || []).length === 1 ? "" : "s"} · {period}
                      </span>
                    </span>
                    <span className="tabular-nums">{fmtCurrency(s.total || 0)}</span>
                  </label>
                );
              })}
            </div>
          )}
        </div>

        {totalSummaries > 0 && (
          <div className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 py-2 text-sm">
            <div className="flex items-center justify-between">
              <span className="font-medium text-[var(--color-accent)]">
                Total quincena · {totalSummaries} resumen{totalSummaries === 1 ? "" : "es"}
              </span>
              <span className="font-semibold tabular-nums text-[var(--color-accent)]">{fmtCurrency(grandTotal)}</span>
            </div>
            <div className="mt-0.5 text-[10px] text-[var(--color-muted)]">
              {perCarrierToCreate.length > 0 && `${perCarrierToCreate.length} nuevo${perCarrierToCreate.length === 1 ? "" : "s"} (${fmtCurrency(createdTotal)})`}
              {perCarrierToCreate.length > 0 && importIds.size > 0 && " · "}
              {importIds.size > 0 && `${importIds.size} importado${importIds.size === 1 ? "" : "s"} (${fmtCurrency(importedTotal)})`}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
