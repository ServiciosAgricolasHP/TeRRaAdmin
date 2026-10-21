import { useState } from "react";
import Modal, { ModalCloseButton } from "./Modal";
import { employmentsService } from "../services/employmentsService";
import { hasChanges } from "../utils/formChanges";
import { localIsoDate } from "../utils/dates";
import { EMPLOYMENT_TYPES, END_REASONS, SETTLEMENT_STATUSES, employmentError } from "../utils/employment";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm text-[var(--color-muted)]">{label}</span>
      {children}
    </label>
  );
}

const formOf = (e) => ({
  type: e?.type || "contract",
  employerId: e?.employerId || "",
  startDate: e?.startDate || localIsoDate(),
  endDate: e?.endDate || "",
  endReason: e?.endReason || "",
  settlementStatus: e?.settlementStatus || "",
  notes: e?.notes || "",
});

// Un período de contrato u honorarios de una persona: alta o corrección. No
// deja guardar uno que se cruce con otro de la misma persona (`history`).
export default function EmploymentFormModal({ worker, employment, history, employers, onClose, onSaved }) {
  const [initial] = useState(() => formOf(employment));
  const [form, setForm] = useState(initial);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const choices = employers.filter((x) => x.enabled !== false || x.id === form.employerId);
  const ended = !!form.endDate;

  const save = async () => {
    const data = {
      workerId: worker.id,
      workerRut: employment?.workerRut || worker.rut || worker.id,
      workerName: worker.name || employment?.workerName || "",
      type: form.type,
      employerId: form.employerId,
      startDate: form.startDate,
      endDate: form.endDate,
      endReason: ended ? form.endReason || "other" : null,
      settlementStatus: ended && form.type === "contract" ? form.settlementStatus || "pending" : null,
      notes: form.notes.trim(),
    };
    // Al pasar el finiquito a solicitado o listo, la fecha es hoy si no tenía.
    const today = localIsoDate();
    if (data.settlementStatus === "requested" || data.settlementStatus === "done") {
      data.settlementRequestedAt = employment?.settlementRequestedAt || today;
    }
    if (data.settlementStatus === "done") data.settlementDoneAt = employment?.settlementDoneAt || today;
    const err =employmentError(history, { ...data, id: employment?.id });
    if (err) return setError(err);
    setBusy(true);
    try {
      if (employment?.id) await employmentsService.update(employment.id, data);
      else await employmentsService.create(data);
      onSaved();
    } catch (e) {
      setError(e.message || "No se pudo guardar.");
      setBusy(false);
    }
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title={employment?.id ? "Editar período" : "Nuevo período"}
      size="md"
      dirty={hasChanges(initial, form) && !busy}
      footer={
        <>
          <ModalCloseButton disabled={busy} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface-2)]">
            Cancelar
          </ModalCloseButton>
          <button
            type="button"
            onClick={save}
            disabled={busy || !form.employerId}
            className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-4">
        <div className="text-sm font-medium">{worker.name}</div>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Tipo">
            <select value={form.type} onChange={set("type")} className={inputCls}>
              {Object.entries(EMPLOYMENT_TYPES).map(([k, m]) => <option key={k} value={k}>{m.icon} {m.label}</option>)}
            </select>
          </Field>
          <Field label="Empleador">
            <select value={form.employerId} onChange={set("employerId")} className={inputCls}>
              <option value="">Elige…</option>
              {choices.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label="Desde">
            <input type="date" value={form.startDate} onChange={set("startDate")} className={inputCls} />
          </Field>
          <Field label="Hasta (vacío: sin término)">
            <input type="date" value={form.endDate} onChange={set("endDate")} className={inputCls} />
          </Field>
          {ended && (
            <Field label="Motivo del término">
              <select value={form.endReason} onChange={set("endReason")} className={inputCls}>
                <option value="">—</option>
                {Object.entries(END_REASONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </Field>
          )}
          {ended && form.type === "contract" && (
            <Field label="Finiquito">
              <select value={form.settlementStatus || "pending"} onChange={set("settlementStatus")} className={inputCls}>
                {Object.entries(SETTLEMENT_STATUSES).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </Field>
          )}
        </div>
        <Field label="Notas">
          <input value={form.notes} onChange={set("notes")} className={inputCls} />
        </Field>
        {choices.length === 0 && (
          <p className="text-xs text-[var(--color-warning)]">No hay empleadores. Agrégalos en Trabajadores → Contratos → ⚙ Empleadores.</p>
        )}
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    </Modal>
  );
}
