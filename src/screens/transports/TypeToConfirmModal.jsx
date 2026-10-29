import { useState } from "react";
import { useValuesChanged } from "../../hooks/useValuesChanged";
import Modal from "../../components/Modal";
import { useToast } from "../../contexts/ToastContext";

// Confirmación reforzada: el botón se habilita al escribir la palabra `word`,
// sin distinguir mayúsculas.
export function TypeToConfirmModal({ word, title, message, confirmLabel, danger = false, onCancel, onConfirm }) {
  const toast = useToast();
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  if (useValuesChanged([word])) {
    setTyped("");
    setBusy(false);
  }
  const ok = typed.trim().toLowerCase() === String(word || "").toLowerCase();
  return (
    <Modal
      open
      onClose={() => !busy && onCancel()}
      title={title}
      size="md"
      footer={
        <>
          <button onClick={() => !busy && onCancel()} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm" disabled={busy}>
            Cancelar
          </button>
          <button
            onClick={async () => {
              if (!ok || busy) return;
              setBusy(true);
              try { await onConfirm(); } catch (err) { toast.error(err?.message || "Error"); setBusy(false); }
            }}
            disabled={!ok || busy}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50 ${
              danger ? "bg-[var(--color-danger)] hover:opacity-90" : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]"
            }`}
          >
            {busy ? "Procesando..." : confirmLabel}
          </button>
        </>
      }
    >
      <p className="mb-3 text-sm">{message}</p>
      <label className="block text-xs text-[var(--color-muted)]">
        Para confirmar, escribe <b>{word}</b> abajo:
      </label>
      <input
        autoFocus
        value={typed}
        onChange={(e) => setTyped(e.target.value)}
        placeholder={word}
        disabled={busy}
        className={`mt-1 w-full rounded-md border bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)] ${
          ok ? "border-[var(--color-accent)]" : "border-[var(--color-border)]"
        }`}
      />
    </Modal>
  );
}
