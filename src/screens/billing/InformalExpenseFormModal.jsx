import { useState } from "react";
import { informalExpensesService } from "../../services";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useToast } from "../../contexts/ToastContext";
import { todayIso } from "./docs";
import { attempt } from "../../utils/attempt";

// Crear/editar/eliminar un gasto informal (sin factura/boleta formal) de un
// centro de costo. Vive solo en `informalExpenses`: nunca toca `dteDocuments`
// ni los datos fiscales. El centro de costo viene fijo (el que se está viendo
// en CostCentersModal); no se elige aquí.
export function InformalExpenseFormModal({ expense, costCenterId, companiesList, onClose, onSaved, onDeleted }) {
  const toast = useToast();
  const [date, setDate] = useState(expense?.date || todayIso());
  const [amount, setAmount] = useState(expense ? String(expense.amount) : "");
  const [detail, setDetail] = useState(expense?.detail || "");
  const [companyId, setCompanyId] = useState(expense?.companyId || "");
  const [busy, setBusy] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const values = { date, amount, detail, companyId };
  const [baseline] = useState(values);

  const save = async () => {
    if (!date) { toast.warning("Falta la fecha."); return; }
    const amt = Number(amount);
    if (!amt || amt <= 0) { toast.warning("Ingresa un monto válido."); return; }
    if (!detail.trim()) { toast.warning("Agrega un detalle."); return; }
    setBusy(true);
    const { error: err } = await attempt(async () => {
      const payload = { costCenterId, date, amount: amt, detail: detail.trim(), companyId: companyId || null };
      if (expense) {
        await informalExpensesService.update(expense.id, payload);
      } else {
        await informalExpensesService.create(payload);
      }
      await onSaved();
      onClose();
    });
    if (err) toast.error("Error al guardar: " + (err.message || err));
    setBusy(false);
  };

  const remove = () => setConfirmDeleteOpen(true);
  const doRemove = async () => {
    setBusy(true);
    const { error: err } = await attempt(async () => {
      await informalExpensesService.remove(expense.id);
      await onDeleted();
      onClose();
    });
    if (err) toast.error("Error al eliminar: " + (err.message || err));
    setBusy(false);
    setConfirmDeleteOpen(false);
  };

  return (
    <>
    <Modal
      open
      onClose={onClose}
      dirty={!busy && hasChanges(baseline, values)}
      size="md"
      title={expense ? "Editar gasto informal" : "Nuevo gasto informal"}
      footer={
        <>
          {expense && (
            <button
              type="button"
              onClick={remove}
              disabled={busy}
              className="mr-auto rounded-md border border-[var(--color-danger)] px-3 py-1.5 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-50"
            >
              Eliminar
            </button>
          )}
          <ModalCloseButton
            disabled={busy}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm"
          >
            Cancelar
          </ModalCloseButton>
          <button
            type="submit"
            form="informal-expense-form"
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </>
      }
    >
      <form id="informal-expense-form" onSubmit={(e) => { e.preventDefault(); save(); }} className="space-y-3">
        <p className="text-xs text-[var(--color-muted)]">
          Plata sin factura/boleta formal (o boleta pedida pero nunca ingresada). Puramente informativo — no afecta la data fiscal real.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Fecha</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Monto</label>
            <input
              type="number"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0"
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
            />
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Detalle</label>
          <textarea
            value={detail}
            onChange={(e) => setDetail(e.target.value)}
            rows={2}
            placeholder='Ej: "Flete informal a Juan Pérez", "Ferretería, se pidió boleta pero no llegó"'
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Empresa (opcional)</label>
          <select
            value={companyId}
            onChange={(e) => setCompanyId(e.target.value)}
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
          >
            <option value="">— Sin empresa —</option>
            {companiesList.map((co) => (
              <option key={co.id} value={co.id}>{co.alias || co.razonSocial}</option>
            ))}
          </select>
        </div>
      </form>
    </Modal>
    <ConfirmDialog
      open={confirmDeleteOpen}
      title="Eliminar gasto informal"
      message="¿Eliminar este gasto informal?"
      confirmLabel="Eliminar"
      danger
      busy={busy}
      onConfirm={doRemove}
      onCancel={() => !busy && setConfirmDeleteOpen(false)}
    />
    </>
  );
}
