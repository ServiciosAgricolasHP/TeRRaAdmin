import Modal, { ModalCloseButton } from "../../components/Modal";
import TextField from "../../components/TextField";
import { hasChanges } from "../../utils/formChanges";
import { formatRutForDisplay } from "../../utils/rutUtils";

const NO_COUNTERPARTIES = [];

// Alta y edición de una subfaena: nombre, notas y, si su faena tiene más de
// una contraparte, cuál es la de esta subfaena (`counterparties`, las de la
// faena).
export function SubjobFormModal({ busy, setSubjobForm, subjobForm, submitSubjob, counterparties = NO_COUNTERPARTIES }) {
  const current = subjobForm?.data.counterpartyRut || "";
  const known = counterparties.some((c) => c.rut === current);
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
          {(counterparties.length > 1 || current) && (
            <label className="block">
              <span className="mb-1 block text-sm text-[var(--color-muted)]">Contraparte</span>
              <select
                value={current}
                onChange={(e) => setSubjobForm((s) => ({ ...s, data: { ...s.data, counterpartyRut: e.target.value } }))}
                className="min-h-9 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
              >
                <option value="">Sin elegir</option>
                {counterparties.map((c) => (
                  <option key={c.rut} value={c.rut}>
                    {c.name ? `${c.name} · ${formatRutForDisplay(c.rut)}` : formatRutForDisplay(c.rut)}
                  </option>
                ))}
                {current && !known && <option value={current}>{formatRutForDisplay(current)} (ya no está en la faena)</option>}
              </select>
            </label>
          )}
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
