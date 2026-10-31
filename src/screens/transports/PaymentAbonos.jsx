import { useState } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { paymentsService } from "../../services/transportsService";
import { useToast } from "../../contexts/ToastContext";
import { localIsoDate } from "../../utils/dates";
import { fmtCurrency } from "../../utils/format";
import { attempt } from "../../utils/attempt";

// Los abonos de un resumen de transporte: lo abonado y el saldo, y agregar,
// editar o quitar uno. `abonos` es la copia local del modal, que también usa
// el imprimible.
export function PaymentAbonos({ payment, abonos, setAbonos, isPaid, onChanged }) {
  const toast = useToast();
  const [newAbono, setNewAbono] = useState({ amount: "", date: "", notes: "" });
  const [abonoBusy, setAbonoBusy] = useState(false);
  // Abono en edición: { id, amount, date, notes } o null.
  const [editingAbono, setEditingAbono] = useState(null);
  const [confirmRemoveAbono, setConfirmRemoveAbono] = useState(null); // abonoId o null
  // Confirmación para un abono mayor que el saldo: askConfirm devuelve una
  // promesa que handleAddAbono espera antes de seguir.
  const [confirmState, setConfirmState] = useState(null);
  const askConfirm = (message) => new Promise((resolve) => setConfirmState({ message, resolve }));

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
    const { error: err } = await attempt(async () => {
      const updated = await paymentsService.addAbono(payment.id, {
        amount: amt,
        date: newAbono.date || localIsoDate(),
        notes: newAbono.notes,
      });
      setAbonos(updated.abonos || []);
      setNewAbono({ amount: "", date: "", notes: "" });
      if (onChanged) await onChanged();
    });
    if (err) toast.error("Error al cargar abono: " + (err.message || err));
    setAbonoBusy(false);
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
    const { error: err } = await attempt(async () => {
      const updated = await paymentsService.updateAbono(payment.id, editingAbono.id, {
        amount: amt,
        date: editingAbono.date,
        notes: editingAbono.notes,
      });
      setAbonos(updated.abonos || []);
      setEditingAbono(null);
      if (onChanged) await onChanged();
    });
    if (err) toast.error("Error al editar el abono: " + (err.message || err));
    setAbonoBusy(false);
  };

  const handleRemoveAbono = (abonoId) => setConfirmRemoveAbono(abonoId);
  const doRemoveAbono = async (abonoId) => {
    setAbonoBusy(true);
    const { error: err } = await attempt(async () => {
      const updated = await paymentsService.removeAbono(payment.id, abonoId);
      setAbonos(updated.abonos || []);
      if (onChanged) await onChanged();
    });
    if (err) toast.error("Error al eliminar abono: " + (err.message || err));
    setAbonoBusy(false);
  };

  return (
    <>
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
    </>
  );
}
