import { useState } from "react";
import Modal, { ModalCloseButton } from "./Modal";
import { endEmployments } from "../services/employmentsService";
import { localIsoDate } from "../utils/dates";
import { END_REASONS, planEndEmployments, employmentTypeLabel } from "../utils/employment";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

// Terminar uno o varios períodos el mismo día y por el mismo motivo. Los
// contratos quedan con el finiquito pendiente.
export default function EndEmploymentsModal({ items, onClose, onDone }) {
  const [endDate, setEndDate] = useState(localIsoDate());
  const [endReason, setEndReason] = useState("jobEnd");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const plan = planEndEmployments(items, { endDate, endReason });
  const contracts = plan.update.filter((u) => u.patch.settlementStatus).length;

  const confirm = async () => {
    setBusy(true);
    try {
      await endEmployments(plan.update, { endDate, endReason });
      onDone(plan.update.length);
    } catch (e) {
      setError(e.message || "No se pudo terminar.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={items.length === 1 ? "Terminar período" : `Terminar ${items.length} períodos`}
      size="md"
      footer={
        <>
          <ModalCloseButton disabled={busy} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface-2)]">
            Cancelar
          </ModalCloseButton>
          <button
            type="button"
            onClick={confirm}
            disabled={busy || !endDate || plan.update.length === 0}
            className="rounded-md bg-[var(--color-danger)] px-4 py-2 text-sm font-medium text-white hover:opacity-90 disabled:opacity-60"
          >
            {busy ? "Terminando…" : `Terminar ${plan.update.length}`}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Fecha de término</span>
            <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className={inputCls} />
          </label>
          <label className="block">
            <span className="mb-1 block text-sm text-[var(--color-muted)]">Motivo</span>
            <select value={endReason} onChange={(e) => setEndReason(e.target.value)} className={inputCls}>
              {Object.entries(END_REASONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
            </select>
          </label>
        </div>
        <ul className="max-h-48 space-y-0.5 overflow-y-auto rounded-md border border-[var(--color-border)] p-2 text-sm">
          {items.map((e) => (
            <li key={e.id} className="flex justify-between gap-2">
              <span className="truncate">{e.workerName || e.workerRut}</span>
              <span className="shrink-0 text-xs text-[var(--color-muted)]">{employmentTypeLabel(e.type)} desde {e.startDate}</span>
            </li>
          ))}
        </ul>
        {contracts > 0 && (
          <p className="text-xs text-[var(--color-muted)]">
            {contracts === 1 ? "El contrato queda" : `Los ${contracts} contratos quedan`} con el finiquito pendiente.
          </p>
        )}
        {plan.skipped.length > 0 && (
          <p className="text-xs text-[var(--color-warning)]">
            {plan.skipped.length} no se termina{plan.skipped.length === 1 ? "" : "n"}: empezaron después de esa fecha.
          </p>
        )}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    </Modal>
  );
}
