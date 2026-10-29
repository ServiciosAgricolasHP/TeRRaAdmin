import { useState, useRef, useEffect } from "react";
import Modal from "../../components/Modal";
import ConfirmDialog from "../../components/ConfirmDialog";
import { TripEditModal } from "../../components/TripEditModal";
import { tripsService, paymentsService, titleCase } from "../../services/transportsService";
import { useToast } from "../../contexts/ToastContext";
import { useCaptureActions } from "../../hooks/useCaptureActions";
import { PRINT_SHEET_CSS } from "../../utils/printWindow";
import { localIsoDate } from "../../utils/dates";
import { fmtCurrency } from "../../utils/format";
import { PrintableSummary } from "./PrintableSummary";

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
  const [newAbono, setNewAbono] = useState({ amount: "", date: "", notes: "" });
  const [abonoBusy, setAbonoBusy] = useState(false);
  // Abono en edición: { id, amount, date, notes } o null.
  const [editingAbono, setEditingAbono] = useState(null);
  const [confirmRemoveAbono, setConfirmRemoveAbono] = useState(null); // abonoId o null
  // Confirmación para un abono mayor que el saldo: askConfirm devuelve una
  // promesa que handleAddAbono espera antes de seguir.
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (message) => new Promise((resolve) => setConfirmState({ message, resolve }));
  useEffect(() => {
    setAbonos(payment?.abonos || []);
  }, [payment?.id, payment?.abonos]);

  useEffect(() => {
    if (!open || !payment) return;
    (async () => {
      setLoading(true);
      try {
        const all = await tripsService.listByCarrier(payment.carrierId);
        const filtered = all
          .filter((t) => (payment.tripIds || []).includes(t.id))
          .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
        setTrips(filtered);
      } catch (err) {
        toast.error("No se pudieron cargar las vueltas del resumen: " + (err.message || err));
      } finally {
        setLoading(false);
      }
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

  // Abonado y saldo, desde el estado local `abonos` (no `payment.abonos`),
  // para reflejar al instante un abono agregado o quitado.
  const totalAbonado = abonos.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const pendingAmount = Math.max(0, (Number(payment.total) || 0) - totalAbonado);

  const handleAddAbono = async () => {
    const amt = Number(newAbono.amount) || 0;
    if (amt <= 0) {
      toast.error("Ingresa un monto mayor a 0");
      return;
    }
    if (amt > pendingAmount) {
      const ok = await askConfirm(
        `El abono (${fmtCurrency(amt)}) supera el monto pendiente (${fmtCurrency(pendingAmount)}). ¿Continuar igual?`,
      );
      if (!ok) return;
    }
    setAbonoBusy(true);
    try {
      const updated = await paymentsService.addAbono(payment.id, {
        amount: amt,
        date: newAbono.date || localIsoDate(),
        notes: newAbono.notes,
      });
      setAbonos(updated.abonos || []);
      setNewAbono({ amount: "", date: "", notes: "" });
      if (onChanged) await onChanged();
    } catch (err) {
      toast.error("Error al cargar abono: " + (err.message || err));
    } finally {
      setAbonoBusy(false);
    }
  };

  const startEditAbono = (a) =>
    setEditingAbono({ id: a.id, amount: String(a.amount ?? ""), date: a.date || "", notes: a.notes || "" });
  const handleSaveAbonoEdit = async () => {
    if (!editingAbono) return;
    const amt = Number(editingAbono.amount) || 0;
    if (amt <= 0) {
      toast.error("Ingresa un monto mayor a 0");
      return;
    }
    // Lo pendiente sin contar este abono, para avisar si el nuevo monto lo supera.
    const prev = Number(abonos.find((a) => a.id === editingAbono.id)?.amount) || 0;
    const pendingWithout = pendingAmount + prev;
    if (amt > pendingWithout) {
      const ok = await askConfirm(
        `El abono (${fmtCurrency(amt)}) supera el monto pendiente (${fmtCurrency(pendingWithout)}). ¿Continuar igual?`,
      );
      if (!ok) return;
    }
    setAbonoBusy(true);
    try {
      const updated = await paymentsService.updateAbono(payment.id, editingAbono.id, {
        amount: amt,
        date: editingAbono.date,
        notes: editingAbono.notes,
      });
      setAbonos(updated.abonos || []);
      setEditingAbono(null);
      if (onChanged) await onChanged();
    } catch (err) {
      toast.error("Error al editar el abono: " + (err.message || err));
    } finally {
      setAbonoBusy(false);
    }
  };

  const handleRemoveAbono = (abonoId) => setConfirmRemoveAbono(abonoId);
  const doRemoveAbono = async (abonoId) => {
    setAbonoBusy(true);
    try {
      const updated = await paymentsService.removeAbono(payment.id, abonoId);
      setAbonos(updated.abonos || []);
      if (onChanged) await onChanged();
    } catch (err) {
      toast.error("Error al eliminar abono: " + (err.message || err));
    } finally {
      setAbonoBusy(false);
    }
  };

  // Vuelve a leer las vueltas del resumen después de editar o quitar una.
  const refreshTrips = async () => {
    try {
      const all = await tripsService.listByCarrier(payment.carrierId);
      // Relee el resumen para tener sus tripIds al día (quitar una vuelta los
      // cambia); si la lectura falla, usa los del resumen recibido.
      let currentTripIds = payment.tripIds || [];
      try {
        const updated = await paymentsService.getById(payment.id);
        if (updated) currentTripIds = updated.tripIds || currentTripIds;
      } catch { /* noop */ }
      const filtered = all
        .filter((t) => currentTripIds.includes(t.id))
        .sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
      setTrips(filtered);
    } catch (err) {
      toast.error("No se pudieron recargar las vueltas: " + (err.message || err));
    }
  };

  const handleSaveTrip = async (form) => {
    if (!editingTrip) return;
    try {
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
    } catch (err) {
      toast.error("Error al guardar: " + (err.message || err));
    }
  };

  const handleRemoveTripFromPayment = async () => {
    if (!confirmRemoveTrip) return;
    try {
      await paymentsService.editSummaryTrips(payment.id, {
        removeTripIds: [confirmRemoveTrip.id],
      });
      setConfirmRemoveTrip(null);
      await refreshTrips();
      if (onChanged) await onChanged();
      toast.success("Vuelta quitada del resumen");
    } catch (err) {
      toast.error("Error al quitar: " + (err.message || err));
    }
  };

  // Carga las vueltas pendientes del mismo transportista que no tienen
  // resumen.
  const openAddTrips = async () => {
    setSelectedToAdd(new Set());
    setAddingTrips(true);
    setLoadingAvailable(true);
    try {
      const all = await tripsService.listByCarrier(payment.carrierId, { onlyPending: true });
      const unlinked = all
        .filter((t) => !t.paymentId)
        .sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
      setAvailableTrips(unlinked);
    } catch (err) {
      toast.error("Error al buscar vueltas sueltas: " + (err.message || err));
    } finally {
      setLoadingAvailable(false);
    }
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
    try {
      await paymentsService.editSummaryTrips(payment.id, { addTripIds: [...selectedToAdd] });
      setAddingTrips(false);
      setSelectedToAdd(new Set());
      await refreshTrips();
      if (onChanged) await onChanged();
      toast.success("Vueltas agregadas al resumen");
    } catch (err) {
      toast.error("Error al agregar: " + (err.message || err));
    } finally {
      setAddBusy(false);
    }
  };

  const handlePrint = () => print(printRef.current, { title: "Resumen Transporte", css: PRINT_SHEET_CSS });

  return (
    <Modal
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

      {/* Abonos: se muestran si hay alguno o si el resumen está pendiente;
          con el resumen pagado quedan de solo lectura. */}
      {(abonos.length > 0 || !isPaid) && (
        <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3 text-sm">
          <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-muted)]">
              💰 Abonos ({abonos.length})
            </span>
            <span className="flex flex-wrap items-baseline gap-3 text-xs">
              <span className="text-[var(--color-muted)]">
                Abonado:{" "}
                <span className="font-semibold tabular-nums text-[var(--color-success)]">
                  {fmtCurrency(totalAbonado)}
                </span>
              </span>
              <span className="text-[var(--color-muted)]">
                Pendiente:{" "}
                <span className={`font-semibold tabular-nums ${pendingAmount === 0 ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
                  {fmtCurrency(pendingAmount)}
                </span>
              </span>
            </span>
          </div>

          {abonos.length > 0 && (
            <ul className="mb-2 space-y-1">
              {abonos.map((a) => (editingAbono?.id === a.id ? (
                <li
                  key={a.id}
                  className="flex flex-wrap items-end gap-2 rounded border border-[var(--color-accent)] bg-[var(--color-surface)] px-2 py-2 text-xs"
                >
                  <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-muted)]">
                    Monto
                    <input
                      type="number"
                      min="0"
                      value={editingAbono.amount}
                      onChange={(e) => setEditingAbono((ed) => ({ ...ed, amount: e.target.value }))}
                      className="w-28 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-muted)]">
                    Fecha
                    <input
                      type="date"
                      value={editingAbono.date}
                      onChange={(e) => setEditingAbono((ed) => ({ ...ed, date: e.target.value }))}
                      className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                  <label className="flex min-w-[140px] flex-1 flex-col gap-0.5 text-[10px] text-[var(--color-muted)]">
                    Nota
                    <input
                      type="text"
                      value={editingAbono.notes}
                      onChange={(e) => setEditingAbono((ed) => ({ ...ed, notes: e.target.value }))}
                      className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                  <div className="flex gap-1">
                    <button
                      onClick={() => setEditingAbono(null)}
                      disabled={abonoBusy}
                      className="min-h-8 rounded border border-[var(--color-border)] px-2 py-1 text-xs hover:bg-[var(--color-surface-2)] disabled:opacity-50"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSaveAbonoEdit}
                      disabled={abonoBusy}
                      className="min-h-8 rounded bg-[var(--color-accent)] px-2 py-1 text-xs font-medium text-[var(--color-accent-fg)] hover:opacity-90 disabled:opacity-50"
                    >
                      {abonoBusy ? "Guardando…" : "Guardar"}
                    </button>
                  </div>
                </li>
              ) : (
                <li
                  key={a.id}
                  className="flex flex-wrap items-center gap-2 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs"
                >
                  <span className="font-mono text-[var(--color-muted)]">{a.date || "—"}</span>
                  <span className="font-semibold tabular-nums">{fmtCurrency(a.amount)}</span>
                  {a.notes && (
                    <span className="text-[var(--color-muted)] truncate">— {a.notes}</span>
                  )}
                  {!isPaid && (
                    <span className="ml-auto flex gap-1">
                      <button
                        onClick={() => startEditAbono(a)}
                        disabled={abonoBusy || !!editingAbono}
                        title="Editar monto, fecha o nota de este abono"
                        className="min-h-7 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                      >
                        ✏️
                      </button>
                      <button
                        onClick={() => handleRemoveAbono(a.id)}
                        disabled={abonoBusy}
                        title="Eliminar este abono"
                        className="min-h-7 rounded border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-50"
                      >
                        ✕
                      </button>
                    </span>
                  )}
                </li>
              )))}
            </ul>
          )}

          {!isPaid && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-muted)]">
                Monto
                <input
                  type="number"
                  min="0"
                  step="100"
                  placeholder="0"
                  value={newAbono.amount}
                  onChange={(e) => setNewAbono((p) => ({ ...p, amount: e.target.value }))}
                  className="w-28 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-right text-sm tabular-nums outline-none focus:border-[var(--color-accent)]"
                />
              </label>
              <label className="flex flex-col gap-0.5 text-[10px] text-[var(--color-muted)]">
                Fecha
                <input
                  type="date"
                  value={newAbono.date}
                  onChange={(e) => setNewAbono((p) => ({ ...p, date: e.target.value }))}
                  className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                />
              </label>
              <label className="flex flex-1 flex-col gap-0.5 text-[10px] text-[var(--color-muted)]">
                Nota (opcional)
                <input
                  type="text"
                  placeholder="ej. transferencia, efectivo, cheque..."
                  value={newAbono.notes}
                  onChange={(e) => setNewAbono((p) => ({ ...p, notes: e.target.value }))}
                  className="min-w-[140px] rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                />
              </label>
              <button
                onClick={handleAddAbono}
                disabled={abonoBusy || !newAbono.amount}
                className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
              >
                {abonoBusy ? "Cargando..." : "+ Abono"}
              </button>
            </div>
          )}
        </div>
      )}

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

      <ConfirmDialog
        open={!!confirmRemoveAbono}
        title="Eliminar abono"
        message="¿Eliminar este abono?"
        confirmLabel="Eliminar"
        danger
        onCancel={() => setConfirmRemoveAbono(null)}
        onConfirm={() => {
          const id = confirmRemoveAbono;
          setConfirmRemoveAbono(null);
          doRemoveAbono(id);
        }}
      />

      <ConfirmDialog
        open={!!confirmState}
        title="Confirmar"
        message={confirmState?.message || ""}
        confirmLabel="Continuar"
        onCancel={() => { confirmState?.resolve(false); setConfirmState(null); }}
        onConfirm={() => { confirmState?.resolve(true); setConfirmState(null); }}
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
