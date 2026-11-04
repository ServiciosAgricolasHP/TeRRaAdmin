import { useState } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { setPrincipal } from "../../services/employmentsService";
import { attempt } from "../../utils/attempt";
import { NO_PRINCIPAL } from "../../utils/employment";

const inputCls =
  "w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]";

const SHOWN_NAMES = 6;

// Le pone el mismo mandante a los períodos elegidos en Contratos, o se lo
// quita con "Sin mandante".
export default function SetPrincipalModal({ items, principals, onClose, onDone }) {
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const n = items.length;
  const names = items.slice(0, SHOWN_NAMES).map((e) => e.workerName).join(", ");
  const more = n > SHOWN_NAMES ? ` y ${n - SHOWN_NAMES} más` : "";

  const save = async () => {
    setBusy(true);
    setError("");
    const principalId = choice === NO_PRINCIPAL ? "" : choice;
    const { error: err } = await attempt(() => setPrincipal(items.map((e) => e.id), principalId));
    if (err) {
      setError(err.message || "No se pudo guardar.");
      setBusy(false);
      return;
    }
    onDone(n);
  };

  return (
    <Modal
      open
      onClose={() => !busy && onClose()}
      title="Cambiar el mandante"
      size="md"
      footer={
        <>
          <ModalCloseButton disabled={busy} className="rounded-md border border-[var(--color-border)] px-4 py-2 text-sm hover:bg-[var(--color-surface-2)]">
            Cancelar
          </ModalCloseButton>
          <button type="button" onClick={save} disabled={busy || !choice} className="rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-60">
            {busy ? "Guardando…" : `Guardar (${n})`}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">
          <b>{n} período{n === 1 ? "" : "s"}:</b> {names}
          {more}
        </p>
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">Mandante</span>
          <select value={choice} onChange={(e) => setChoice(e.target.value)} className={inputCls}>
            <option value="">Elige…</option>
            {principals.filter((x) => x.enabled !== false).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            <option value={NO_PRINCIPAL}>Sin mandante (quitarlo)</option>
          </select>
        </label>
        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </div>
    </Modal>
  );
}
