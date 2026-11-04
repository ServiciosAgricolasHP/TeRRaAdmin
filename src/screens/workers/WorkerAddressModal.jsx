import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { workersService } from "../../services/workersService";
import { attempt } from "../../utils/attempt";
import { hasChanges } from "../../utils/formChanges";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

// La dirección y la comuna que pide la boleta de honorarios, completadas desde
// la lista sin abrir la ficha. Se guardan en el trabajador y `onSaved(patch)`
// las pone en las filas de la lista.
export default function WorkerAddressModal({ item, onClose, onSaved }) {
  const [initial] = useState(() => ({ address: item.address || "", commune: item.commune || "" }));
  const [form, setForm] = useState(initial);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const save = async (e) => {
    e.preventDefault();
    const patch = { address: form.address.trim(), commune: form.commune.trim() };
    if (!patch.address) return setError("Falta la dirección.");
    setBusy(true);
    setError("");
    const { error: err } = await attempt(() => workersService.update(item.workerId, patch));
    if (err) {
      setError(err.message || "No se pudo guardar.");
      setBusy(false);
      return;
    }
    onSaved(patch);
  };

  return (
    <Modal open onClose={() => !busy && onClose()} title={`Dirección de ${item.name}`} size="md" dirty={hasChanges(initial, form) && !busy}>
      <form onSubmit={save} className="space-y-3">
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">Dirección</span>
          <input autoFocus value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} className={inputCls} />
        </label>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">Comuna</span>
          <input value={form.commune} onChange={(e) => setForm((f) => ({ ...f, commune: e.target.value }))} className={inputCls} />
        </label>
        <p className="text-xs text-[var(--color-muted)]">Queda guardada en la ficha del trabajador.</p>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
        <div className="flex justify-end gap-2">
          <ModalCloseButton disabled={busy} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface-2)]">
            Cancelar
          </ModalCloseButton>
          <button type="submit" disabled={busy} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60">
            {busy ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
