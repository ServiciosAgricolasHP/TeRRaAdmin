import { useState } from "react";
import Modal from "../../components/Modal";
import { attempt } from "../../utils/attempt";

// Modal para renombrar una nómina. El nombre es solo una etiqueta: solo se
// valida que no esté vacío. Enter confirma, Escape cancela (vía Modal).
export function RenamePayrollModal({ payroll, onCancel, onConfirm }) {
  const [name, setName] = useState(payroll?.name || "");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!name.trim() || busy) return;
    setBusy(true);
    const { error } = await attempt(() => onConfirm(name));
    setBusy(false);
    if (error) throw error;
  };
  return (
    <Modal
      open
      onClose={onCancel}
      size="sm"
      title="Renombrar nómina"
      footer={
        <>
          <button onClick={onCancel} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={busy || !name.trim()}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </>
      }
    >
      <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">Nombre</label>
      <input
        autoFocus
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && submit()}
        className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
    </Modal>
  );
}
