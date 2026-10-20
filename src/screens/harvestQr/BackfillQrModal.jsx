import Modal from "../../components/Modal";
import { prefixOfCode } from "../../utils/qrCodes";
import { ProgressBar } from "./ProgressBar";

export function BackfillQrModal({ code, worker, count, busy, progress, onConfirm, onCancel }) {
  return (
    <Modal
      open
      onClose={onCancel}
      title="Pesajes sin QR registrado"
      size="sm"
      footer={
        <>
          <button onClick={onCancel} disabled={busy} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm disabled:opacity-60">
            Dejar así
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {busy ? "Asignando…" : `Asignar ${code}`}
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        <p>
          <strong>{worker.name || worker.id}</strong> tiene <strong>{count}</strong> pesaje(s) del prefijo{" "}
          <span className="font-mono">{prefixOfCode(code)}</span> sin ningún QR anotado — cargados a mano, o
          escaneados antes de que se guardara el código.
        </p>
        {busy && progress && <ProgressBar label="Anotando el código…" done={progress.done} total={progress.total} />}
        <p className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2 text-xs text-[var(--color-muted)]">
          Esto solo anota la llave con la que hoy se identifica a esta persona en terreno. Ningún pesaje
          cambia de dueño: siguen siendo suyos por RUT, que es lo que se lee al buscar.
        </p>
      </div>
    </Modal>
  );
}
