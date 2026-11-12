import { useEffect } from "react";
import Modal from "./Modal";
import { ProgressBar } from "./ProgressBar";

// `progress` ({ label, done, total }) muestra la barra de avance mientras
// `busy`, para una confirmación que dispara algo largo.
export default function ConfirmDialog({ open, title = "Confirmar", message, onConfirm, onCancel, confirmLabel = "Confirmar", danger = false, busy = false, progress = null }) {
  // Enter confirma, salvo con el foco en uno de los botones del diálogo: ahí
  // Enter hace el clic de ese botón (en "Cancelar", cancela).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key !== "Enter" || busy || e.defaultPrevented) return;
      if (e.target instanceof Element && e.target.closest("[data-confirm-button]")) return;
      e.preventDefault();
      onConfirm?.();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onConfirm]);

  return (
    <Modal
      open={open}
      onClose={onCancel}
      title={title}
      size="sm"
      footer={
        <>
          <button
            data-confirm-button
            onClick={onCancel}
            disabled={busy}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
          >
            Cancelar
          </button>
          <button
            data-confirm-button
            onClick={onConfirm}
            disabled={busy}
            className={`rounded-md px-3 py-1.5 text-sm font-medium text-white disabled:opacity-60 ${
              danger ? "bg-[var(--color-danger)] hover:opacity-90" : "bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]"
            }`}
          >
            {busy ? "..." : confirmLabel}
          </button>
        </>
      }
    >
      <p className="whitespace-pre-line break-words text-sm text-[var(--color-muted)]">{message}</p>
      {busy && progress && (
        <div className="mt-3">
          <ProgressBar label={progress.label} done={progress.done} total={progress.total} />
        </div>
      )}
    </Modal>
  );
}
