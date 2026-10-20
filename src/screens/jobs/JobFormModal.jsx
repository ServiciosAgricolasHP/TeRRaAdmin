import Modal, { ModalCloseButton } from "../../components/Modal";
import TextField from "../../components/TextField";
import { hasChanges } from "../../utils/formChanges";

// Alta y edición de una faena: nombre, ubicación y notas.
export function JobFormModal({ busy, jobForm, setJobForm, submitJob }) {
  "use no memo";
  return (
    <Modal
      open={!!jobForm}
      onClose={() => !busy && setJobForm(null)}
      dirty={!!jobForm && !busy && hasChanges(jobForm.initial, jobForm.data)}
      title={jobForm?.mode === "edit" ? "Editar faena" : "Nueva faena"}
    >
      {jobForm && (
        <form onSubmit={submitJob} className="space-y-4">
          <TextField
            label="Nombre"
            required
            autoFocus
            value={jobForm.data.name}
            onChange={(v) => setJobForm((f) => ({ ...f, data: { ...f.data, name: v } }))}
          />
          <TextField
            label="Ubicación"
            value={jobForm.data.location}
            onChange={(v) => setJobForm((f) => ({ ...f, data: { ...f.data, location: v } }))}
          />
          <TextField
            label="Notas"
            value={jobForm.data.notes}
            onChange={(v) => setJobForm((f) => ({ ...f, data: { ...f.data, notes: v } }))}
          />
          <div className="flex justify-end gap-2 pt-2">
            <ModalCloseButton
              disabled={busy}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            >
              Cancelar
            </ModalCloseButton>
            <button
              type="submit"
              disabled={busy}
              className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
            >
              {busy ? "..." : "Guardar"}
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
