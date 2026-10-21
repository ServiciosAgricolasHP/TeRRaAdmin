import Modal, { ModalCloseButton } from "../../components/Modal";
import TextField from "../../components/TextField";
import { hasChanges } from "../../utils/formChanges";

// Alta y edición de una subfaena: nombre y notas.
export function SubjobFormModal({ busy, setSubjobForm, subjobForm, submitSubjob }) {
  "use no memo";
  return (
    <Modal
      open={!!subjobForm}
      onClose={() => !busy && setSubjobForm(null)}
      dirty={!!subjobForm && !busy && hasChanges(subjobForm.initial, subjobForm.data)}
      title={subjobForm?.mode === "edit" ? "Editar subfaena" : "Nueva subfaena"}
    >
      {subjobForm && (
        <form onSubmit={submitSubjob} className="space-y-4">
          <TextField
            label="Nombre"
            required
            autoFocus
            value={subjobForm.data.name}
            onChange={(v) => setSubjobForm((s) => ({ ...s, data: { ...s.data, name: v } }))}
          />
          <TextField
            label="Notas"
            value={subjobForm.data.notes}
            onChange={(v) => setSubjobForm((s) => ({ ...s, data: { ...s.data, notes: v } }))}
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
