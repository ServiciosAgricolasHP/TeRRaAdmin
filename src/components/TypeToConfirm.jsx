import { useState } from "react";
import Modal from "./Modal";
import { ProgressBar } from "./ProgressBar";

// Confirmación reforzada: el botón se habilita al escribir `word`, sin
// distinguir mayúsculas. Lo que se explica va en `message` o, con más de un
// párrafo, en `children`. `progress` (`{ label, done, total }`) se muestra
// mientras `busy`; sin `total`, la barra queda indeterminada. `section` es la
// del registro de lecturas, para el modal que lee datos por su cuenta.
export function TypeToConfirm({ word, title, message, children, confirmLabel, busy, progress, section, onConfirm, onCancel }) {
  const [typed, setTyped] = useState("");
  const armed = typed.trim().toUpperCase() === String(word).toUpperCase();

  return (
    <Modal
      open
      onClose={onCancel}
      title={title}
      size="sm"
      section={section}
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
        {message && <p className="text-sm">{message}</p>}
        {children}
        {busy && progress && <ProgressBar label={progress.label ?? "Liberando códigos…"} done={progress.done} total={progress.total} />}
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
