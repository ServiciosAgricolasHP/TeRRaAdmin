import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { hasChanges } from "../../utils/formChanges";

export function FortnightMetaEditModal({ fortnight, onClose, onSave }) {
  const [name, setName] = useState(fortnight?.name || "");
  const [periodFrom, setPeriodFrom] = useState(fortnight?.periodFrom || "");
  const [periodTo, setPeriodTo] = useState(fortnight?.periodTo || "");
  const [notes, setNotes] = useState(fortnight?.notes || "");
  const [busy, setBusy] = useState(false);
  const onSubmit = async () => {
    if (!name.trim()) return;
    setBusy(true);
    try {
      await onSave({ name, periodFrom: periodFrom || null, periodTo: periodTo || null, notes });
    } finally {
      setBusy(false);
    }
  };
  const dirty =
    !busy &&
    hasChanges(
      { name: fortnight?.name, periodFrom: fortnight?.periodFrom, periodTo: fortnight?.periodTo, notes: fortnight?.notes },
      { name, periodFrom, periodTo, notes },
    );
  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      dirty={dirty}
      title="Editar quincena"
      size="md"
      footer={
        <>
          <ModalCloseButton disabled={busy} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          <button onClick={onSubmit} disabled={!name.trim() || busy} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
            {busy ? "Guardando..." : "Guardar"}
          </button>
        </>
      }
    >
      <div className="space-y-2">
        <label className="block">
          <span className="block text-xs text-[var(--color-muted)]">Nombre</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className="block text-xs text-[var(--color-muted)]">Desde</span>
            <input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
          </label>
          <label className="block">
            <span className="block text-xs text-[var(--color-muted)]">Hasta</span>
            <input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs text-[var(--color-muted)]">Notas</span>
          <input value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1 w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]" />
        </label>
      </div>
    </Modal>
  );
}
