import { useState, useRef, useEffect, useMemo } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { TripEditModal } from "../../components/TripEditModal";
import { tripsService, paymentsService } from "../../services/transportsService";
import { useToast } from "../../contexts/ToastContext";
import { useCaptureActions } from "../../hooks/useCaptureActions";
import { PRINT_SHEET_CSS } from "../../utils/printWindow";
import { fmtCurrency } from "../../utils/format";
import { PrintableSummary } from "./PrintableSummary";
import { attempt } from "../../utils/attempt";
import { useValuesChanged } from "../../hooks/useValuesChanged";

// Junta las vueltas de todos los resúmenes de un transportista (p. ej. las dos
// quincenas de un mes) en una sola tabla para verlas, imprimirlas o copiarlas.
// Permite editar o quitar vueltas: editar recalcula el total de su resumen
// (lo hace el servicio) y quitar la desvincula solo de su resumen
// (`paymentByTripId`). Las vueltas pagadas se bloquean fila por fila
// (t.status === "paid").
export function UnifiedSummaryModal({ open, onClose, group, faenaById, subfaenaById, cycleById, carriers = [], onChanged }) {
  const toast = useToast();
  const [trips, setTrips] = useState([]);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const { busy, copy, download, print } = useCaptureActions();
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [editMode, setEditMode] = useState(false);
  const [editingTrip, setEditingTrip] = useState(null);
  const [confirmRemoveTrip, setConfirmRemoveTrip] = useState(null);
  const printRef = useRef(null);

  const fmtDate = (d) => {
    if (!d || typeof d !== "string") return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : d;
  };

  if (useValuesChanged([open, group], { onMount: true }) && open && group) {
    setEditMode(false);
    setEditingTrip(null);
    setConfirmRemoveTrip(null);
    setItems(group.items);
    setLoading(true);
  }
  useEffect(() => {
    if (!open || !group) return;
    (async () => {
      const { error: err } = await attempt(async () => {
        const tripIds = new Set();
        for (const p of group.items) for (const id of p.tripIds || []) tripIds.add(id);
        const all = await tripsService.listByCarrier(group.carrierId);
        const filtered = all
          .filter((t) => tripIds.has(t.id))
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        setTrips(filtered);
        setDateFrom(filtered[0]?.date || "");
        setDateTo(filtered[filtered.length - 1]?.date || "");
      });
      setLoading(false);
      if (err) throw err;
    })();
  }, [open, group]);

  // Resumen al que pertenece cada vuelta, para desvincularla de él al quitarla.
  const paymentByTripId = useMemo(() => {
    const map = new Map();
    for (const p of items) for (const id of p.tripIds || []) map.set(id, p);
    return map;
  }, [items]);

  const refreshTrips = async () => {
    if (!group) return;
    const { error: err } = await attempt(async () => {
      const tripIds = new Set();
      for (const p of items) for (const id of p.tripIds || []) tripIds.add(id);
      const all = await tripsService.listByCarrier(group.carrierId);
      const filtered = all
        .filter((t) => tripIds.has(t.id))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      setTrips(filtered);
    });
    if (err) toast.error("No se pudieron recargar las vueltas: " + (err.message || err));
  };

  const handleSaveTrip = async (form) => {
    if (!editingTrip) return;
    const { error: err } = await attempt(async () => {
      // Conserva el ciclo, la faena y la subfaena de la vuelta, igual que
      // TripsTab.
      const payload = {
        ...form,
        cycleId: editingTrip.cycleId || null,
        faenaId: editingTrip.faenaId || null,
        subfaenaId: editingTrip.subfaenaId || null,
      };
      // tripsService.update propaga el total al resumen (y a su quincena),
      // así que acá solo hace falta refrescar la vista.
      await tripsService.update(editingTrip.id, payload);
      setEditingTrip(null);
      await refreshTrips();
      if (onChanged) await onChanged();
      toast.success("Vuelta actualizada");
    });
    if (err) toast.error("Error al guardar: " + (err.message || err));
  };

  const handleRemoveTripFromPayment = async () => {
    if (!confirmRemoveTrip) return;
    const owningPayment = paymentByTripId.get(confirmRemoveTrip.id);
    if (!owningPayment) {
      toast.error("No se encontró el resumen de origen de esta vuelta");
      setConfirmRemoveTrip(null);
      return;
    }
    const { error: err } = await attempt(async () => {
      await paymentsService.editSummaryTrips(owningPayment.id, {
        removeTripIds: [confirmRemoveTrip.id],
      });
      setItems((prev) =>
        prev.map((p) =>
          p.id === owningPayment.id
            ? { ...p, tripIds: (p.tripIds || []).filter((id) => id !== confirmRemoveTrip.id) }
            : p,
        ),
      );
      setTrips((prev) => prev.filter((t) => t.id !== confirmRemoveTrip.id));
      setConfirmRemoveTrip(null);
      if (onChanged) await onChanged();
      toast.success("Vuelta quitada del resumen");
    });
    if (err) toast.error("Error al quitar: " + (err.message || err));
  };

  if (!group) return null;
  const carrier = { id: group.carrierId, alias: group.alias, name: group.name };

  const filteredTrips = trips.filter((t) => {
    if (dateFrom && t.date < dateFrom) return false;
    if (dateTo && t.date > dateTo) return false;
    return true;
  });
  const total = filteredTrips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const resetRange = () => {
    setDateFrom(trips[0]?.date || "");
    setDateTo(trips[trips.length - 1]?.date || "");
  };
  const periodLabel = filteredTrips.length > 0
    ? `${fmtDate(filteredTrips[0].date)} → ${fmtDate(filteredTrips[filteredTrips.length - 1].date)}`
    : "—";

  const handleCopy = () => copy(printRef.current);
  const handleDownload = () => download(printRef.current, `transporte_unificado_${group.alias}_${dateFrom}_${dateTo}.png`);
  const handlePrint = () => print(printRef.current, { title: "Resumen Transporte Unificado", css: PRINT_SHEET_CSS });

  return (
    <Modal
      section="Resumen unificado"
      open={open}
      onClose={onClose}
      title={`🔗 Vista unificada — ${group.alias}`}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cerrar
          </button>
          <button
            onClick={handleCopy}
            disabled={busy === "copy"}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          >
            {busy === "copy" ? "Copiando..." : "📋 Copiar imagen"}
          </button>
          <button
            onClick={handleDownload}
            disabled={busy === "download"}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          >
            {busy === "download" ? "Descargando..." : "📥 Descargar PNG"}
          </button>
          <button
            onClick={handlePrint}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
          >
            🖨 Imprimir
          </button>
          <button
            onClick={() => setEditMode((v) => !v)}
            className={`rounded-md border px-3 py-1.5 text-sm ${editMode ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border)] hover:bg-[var(--color-accent-soft)]"}`}
            title="Editar detalles o quitar vueltas fila por fila. Las ya pagadas quedan bloqueadas."
          >
            {editMode ? "✓ Listo" : "✏️ Editar vueltas"}
          </button>
        </>
      }
    >
      <div className="mb-2 flex flex-wrap gap-1 text-[10px] text-[var(--color-muted)]">
        Incluye {group.items.length} resúmenes:{" "}
        {group.items
          .slice()
          .sort((a, b) => (a.periodFrom || "").localeCompare(b.periodFrom || ""))
          .map((p) => `${fmtDate(p.periodFrom)}→${fmtDate(p.periodTo)}`)
          .join(" · ")}
      </div>

      <div className="mb-3 flex flex-wrap items-end justify-between gap-2 text-xs">
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex items-center gap-1">
            <span className="text-[var(--color-muted)]">Desde</span>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1"
            />
          </label>
          <label className="flex items-center gap-1">
            <span className="text-[var(--color-muted)]">Hasta</span>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1"
            />
          </label>
          <button
            type="button"
            onClick={resetRange}
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 hover:bg-[var(--color-accent-soft)]"
            title="Volver a mostrar todo el rango incluido"
          >
            ⟲ Todo el rango
          </button>
        </div>
        <div className="text-sm">
          <span className="text-[var(--color-muted)]">
            {filteredTrips.length} vuelta{filteredTrips.length === 1 ? "" : "s"} ·{" "}
          </span>
          <span className="font-semibold tabular-nums">{fmtCurrency(total)}</span>
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-[var(--color-muted)]">Cargando...</div>
      ) : filteredTrips.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          Sin vueltas en el rango seleccionado
        </div>
      ) : (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <PrintableSummary
            ref={printRef}
            payment={null}
            carrier={carrier}
            trips={filteredTrips}
            periodLabel={periodLabel}
            faenaById={faenaById}
            subfaenaById={subfaenaById}
            cycleById={cycleById}
            editable={editMode}
            onEditTrip={editMode ? (t) => setEditingTrip(t) : null}
            onRemoveTrip={editMode ? (t) => setConfirmRemoveTrip(t) : null}
            isTripLocked={(t) => t.status === "paid"}
          />
        </div>
      )}

      <TripEditModal
        open={!!editingTrip}
        onClose={() => setEditingTrip(null)}
        trip={editingTrip}
        carriers={carriers}
        days={[]}
        onSave={handleSaveTrip}
      />

      <ConfirmDialog
        open={!!confirmRemoveTrip}
        title="Quitar vuelta del resumen"
        message={
          confirmRemoveTrip
            ? `¿Sacar la vuelta del ${confirmRemoveTrip.date} (${fmtCurrency(confirmRemoveTrip.amount)}) de su resumen? La vuelta no se borra — vuelve a estar suelta para futuros resúmenes.`
            : ""
        }
        confirmLabel="Quitar"
        danger
        onCancel={() => setConfirmRemoveTrip(null)}
        onConfirm={handleRemoveTripFromPayment}
      />
    </Modal>
  );
}
