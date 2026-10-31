import { useState, useRef, useEffect } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { TripEditModal } from "../../components/TripEditModal";
import { tripsService, paymentsService, titleCase } from "../../services/transportsService";
import { useToast } from "../../contexts/ToastContext";
import { useCaptureActions } from "../../hooks/useCaptureActions";
import { PRINT_SHEET_CSS } from "../../utils/printWindow";
import { fmtCurrency } from "../../utils/format";
import { PrintableSummary } from "./PrintableSummary";
import { PaymentAbonos } from "./PaymentAbonos";
import { attempt } from "../../utils/attempt";
import { useValuesChanged } from "../../hooks/useValuesChanged";

export function PaymentDetailModal({ open, onClose, payment, carrier, carriers = [], faenaById, subfaenaById, cycleById, onDelete, onChanged }) {
  const toast = useToast();
  const [trips, setTrips] = useState([]);
  const [loading, setLoading] = useState(false);
  const printRef = useRef(null);
  const { busy, copy, download, print } = useCaptureActions();
  const [editMode, setEditMode] = useState(false);
  // Edición de una vuelta (mismo modal que TripsTab) y confirmación para
  // sacarla del resumen sin borrarla: vuelve a quedar suelta para otro
  // resumen.
  const [editingTrip, setEditingTrip] = useState(null);
  const [confirmRemoveTrip, setConfirmRemoveTrip] = useState(null);
  // Agregar vueltas: busca vueltas pendientes del mismo transportista que no
  // están en ningún resumen y las suma a este.
  const [addingTrips, setAddingTrips] = useState(false);
  const [availableTrips, setAvailableTrips] = useState([]);
  const [loadingAvailable, setLoadingAvailable] = useState(false);
  const [selectedToAdd, setSelectedToAdd] = useState(() => new Set());
  const [addBusy, setAddBusy] = useState(false);
  // Abonos: pagos parciales antes de marcar el resumen como pagado. Copia
  // local sincronizada con el doc, para mostrar los cambios sin esperar la
  // recarga del padre.
  const [abonos, setAbonos] = useState(payment?.abonos || []);
  if (useValuesChanged([payment?.id, payment?.abonos], { onMount: true })) setAbonos(payment?.abonos || []);

  useEffect(() => {
    if (!open || !payment) return;
    (async () => {
      setLoading(true);
      const { error: err } = await attempt(async () => {
        const all = await tripsService.listByCarrier(payment.carrierId);
        const filtered = all
          .filter((t) => (payment.tripIds || []).includes(t.id))
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        setTrips(filtered);
      });
      if (err) toast.error("No se pudieron cargar las vueltas del resumen: " + (err.message || err));
      setLoading(false);
    })();
  }, [open, payment, toast]);

  if (!payment) return null;
  const isPaid = payment.status === "paid";

  const periodLabel = (() => {
    if (payment.periodFrom && payment.periodTo) return `${payment.periodFrom} → ${payment.periodTo}`;
    const dates = trips.map((t) => t.date).filter(Boolean).sort();
    if (dates.length === 0) return "—";
    return `${dates[0]} → ${dates[dates.length - 1]}`;
  })();

  const handleDownload = () => download(printRef.current, `transporte_${carrier?.alias || "resumen"}_${payment.id}.png`);
  const handleCopy = () => copy(printRef.current);

  // Vuelve a leer las vueltas del resumen después de editar o quitar una.
  const refreshTrips = async () => {
    const { error: err } = await attempt(async () => {
      const all = await tripsService.listByCarrier(payment.carrierId);
      // Relee el resumen para tener sus tripIds al día (quitar una vuelta los
      // cambia); si la lectura falla, usa los del resumen recibido.
      let currentTripIds = payment.tripIds || [];
      await attempt(async () => {
        const updated = await paymentsService.getById(payment.id);
        if (updated) currentTripIds = updated.tripIds || currentTripIds;
      });
      const filtered = all
        .filter((t) => currentTripIds.includes(t.id))
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
    const { error: err } = await attempt(async () => {
      await paymentsService.editSummaryTrips(payment.id, {
        removeTripIds: [confirmRemoveTrip.id],
      });
      setConfirmRemoveTrip(null);
      await refreshTrips();
      if (onChanged) await onChanged();
      toast.success("Vuelta quitada del resumen");
    });
    if (err) toast.error("Error al quitar: " + (err.message || err));
  };

  // Carga las vueltas pendientes del mismo transportista que no tienen
  // resumen.
  const openAddTrips = async () => {
    setSelectedToAdd(new Set());
    setAddingTrips(true);
    setLoadingAvailable(true);
    const { error: err } = await attempt(async () => {
      const all = await tripsService.listByCarrier(payment.carrierId, { onlyPending: true });
      const unlinked = all
        .filter((t) => !t.paymentId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      setAvailableTrips(unlinked);
    });
    if (err) toast.error("Error al buscar vueltas sueltas: " + (err.message || err));
    setLoadingAvailable(false);
  };

  const toggleSelectToAdd = (id) => {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleAddTrips = async () => {
    if (selectedToAdd.size === 0) return;
    setAddBusy(true);
    const { error: err } = await attempt(async () => {
      await paymentsService.editSummaryTrips(payment.id, { addTripIds: [...selectedToAdd] });
      setAddingTrips(false);
      setSelectedToAdd(new Set());
      await refreshTrips();
      if (onChanged) await onChanged();
      toast.success("Vueltas agregadas al resumen");
    });
    if (err) toast.error("Error al agregar: " + (err.message || err));
    setAddBusy(false);
  };

  const handlePrint = () => print(printRef.current, { title: "Resumen Transporte", css: PRINT_SHEET_CSS });

  return (
    <Modal
      section="Detalle del resumen de transporte"
      open={open}
      onClose={onClose}
      title={`Resumen — ${carrier?.alias || payment.carrierId}`}
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
          {!isPaid && (
            <button
              onClick={() => setEditMode((v) => !v)}
              className={`rounded-md border px-3 py-1.5 text-sm ${editMode ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]" : "border-[var(--color-border)] hover:bg-[var(--color-accent-soft)]"}`}
              title="Editar valores inline + acceder a los botones de editar detalles completos / quitar vuelta por fila"
            >
              {editMode ? "✓ Listo" : "✏️ Editar resumen"}
            </button>
          )}
          {!isPaid && (
            <button
              onClick={openAddTrips}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
              title="Sumar a este resumen vueltas pendientes que se olvidaron incluir, sin borrarlo y volverlo a crear"
            >
              + Vuelta suelta
            </button>
          )}
          {/* Marcar pagado y revertir se hacen desde "Quincenas"; acá solo se
              edita o elimina el resumen. Abierto desde una quincena, `onDelete`
              llega null y el botón no se muestra: para eliminar el resumen
              primero hay que sacarlo de la quincena. */}
          {!isPaid && onDelete && (
            <button
              onClick={onDelete}
              className="rounded-md border border-[var(--color-danger)] px-3 py-1.5 text-sm text-[var(--color-danger)]"
            >
              Eliminar
            </button>
          )}
        </>
      }
    >
      <div className="mb-3 flex items-center justify-between text-sm">
        <span className={isPaid ? "font-medium text-[var(--color-success)]" : "font-medium text-[var(--color-warning)]"}>
          {isPaid ? "Pagado" : "Pendiente"}
        </span>
        <span className="text-[var(--color-muted)]">{periodLabel}</span>
        <span className="font-semibold tabular-nums">
          {fmtCurrency(trips.reduce((s, t) => s + (Number(t.amount) || 0), 0))}
        </span>
      </div>

      <PaymentAbonos payment={payment} abonos={abonos} setAbonos={setAbonos} isPaid={isPaid} onChanged={onChanged} />

      {loading ? (
        <div className="py-6 text-center text-sm text-[var(--color-muted)]">Cargando...</div>
      ) : (
        <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
          <PrintableSummary
            ref={printRef}
            payment={payment}
            abonos={abonos}
            carrier={carrier}
            trips={trips}
            editable={editMode && !isPaid}
            onEditTrip={editMode && !isPaid ? (t) => setEditingTrip(t) : null}
            onRemoveTrip={editMode && !isPaid ? (t) => setConfirmRemoveTrip(t) : null}
            periodLabel={periodLabel}
            faenaById={faenaById}
            subfaenaById={subfaenaById}
            cycleById={cycleById}
          />
        </div>
      )}

      {payment.notes && (
        <div className="mt-3 rounded-md bg-[var(--color-surface-2)] p-2 text-xs">
          <span className="text-[var(--color-muted)]">Notas: </span>
          {payment.notes}
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
            ? `¿Sacar la vuelta del ${confirmRemoveTrip.date} (${fmtCurrency(confirmRemoveTrip.amount)}) de este resumen? La vuelta no se borra — vuelve a estar suelta para futuros resúmenes.`
            : ""
        }
        confirmLabel="Quitar"
        danger
        onCancel={() => setConfirmRemoveTrip(null)}
        onConfirm={handleRemoveTripFromPayment}
      />

      <Modal
        open={addingTrips}
        onClose={() => setAddingTrips(false)}
        title="+ Agregar vuelta suelta al resumen"
        size="lg"
        footer={
          <>
            <button
              onClick={() => setAddingTrips(false)}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
            >
              Cancelar
            </button>
            <button
              onClick={handleAddTrips}
              disabled={selectedToAdd.size === 0 || addBusy}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
            >
              {addBusy ? "Agregando..." : `Agregar (${selectedToAdd.size})`}
            </button>
          </>
        }
      >
        {loadingAvailable ? (
          <div className="py-6 text-center text-sm text-[var(--color-muted)]">Buscando vueltas sueltas...</div>
        ) : availableTrips.length === 0 ? (
          <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
            {carrier?.alias || "Este transportista"} no tiene vueltas pendientes sin resumen asignado.
          </div>
        ) : (
          <div className="max-h-[50vh] space-y-1.5 overflow-auto">
            {availableTrips.map((t) => {
              const checked = selectedToAdd.has(t.id);
              const fa = faenaById?.get(t.faenaId);
              const sb = subfaenaById?.get(t.subfaenaId);
              return (
                <label
                  key={t.id}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-2.5 py-2 text-sm ${
                    checked ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                  }`}
                >
                  <input type="checkbox" checked={checked} onChange={() => toggleSelectToAdd(t.id)} />
                  <span className="font-mono text-xs tabular-nums text-[var(--color-muted)]">{t.date}</span>
                  <span className="min-w-0 flex-1 truncate">
                    {t.vehicleAlias || "—"}
                    {fa && <span className="text-[var(--color-muted)]"> · {fa.name}{sb ? ` / ${sb.name}` : ""}</span>}
                    {t.lugar && <span className="text-[var(--color-muted)]"> · {titleCase(t.lugar)}{t.destino ? ` → ${titleCase(t.destino)}` : ""}</span>}
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">{fmtCurrency(t.amount)}</span>
                </label>
              );
            })}
          </div>
        )}
      </Modal>
    </Modal>
  );
}
