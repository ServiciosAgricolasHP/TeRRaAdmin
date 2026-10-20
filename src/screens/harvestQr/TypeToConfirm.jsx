import { useState } from "react";
import Modal from "../../components/Modal";
import { ProgressBar } from "./ProgressBar";

export function TypeToConfirm({ word, title, message, confirmLabel, busy, progress, onConfirm, onCancel }) {
  const [typed, setTyped] = useState("");
  const armed = typed.trim().toUpperCase() === String(word).toUpperCase();

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button onClick={onCancel} disabled={busy} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-60">
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={!armed || busy}
            className="rounded-md bg-[var(--color-danger)] px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Procesando…" : confirmLabel}
          </button>
        </>
      }
    >
      <div className="space-y-3">
        <p className="text-sm">{message}</p>
        {busy && progress && <ProgressBar label="Liberando códigos…" done={progress.done} total={progress.total} />}
        <label className="block">
          <span className="mb-1 block text-sm text-[var(--color-muted)]">
            Escribe <strong className="font-mono">{word}</strong> para confirmar
          </span>
          <input
            type="text"
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            autoFocus
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 font-mono text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>
      </div>
    </Modal>
  );
}
