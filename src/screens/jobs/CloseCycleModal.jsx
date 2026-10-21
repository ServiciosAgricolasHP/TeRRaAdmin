import Modal from "../../components/Modal";

// Cerrar un ciclo y, ya cerrado, ofrecer crear el siguiente.
export function CloseCycleModal({ busy, closeFlow, confirmCloseCycle, createNextCycle, setCloseFlow }) {
  "use no memo";
  return (
    <Modal
      open={!!closeFlow}
      onClose={() => !busy && setCloseFlow(null)}
      title={closeFlow?.askNext ? "¿Crear nuevo ciclo?" : "Cerrar ciclo"}
      footer={
        closeFlow?.askNext ? (
          <>
            <button
              onClick={() => setCloseFlow(null)}
              disabled={busy}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            >
              No, gracias
            </button>
            <button
              onClick={() => createNextCycle(closeFlow.copyWorkers)}
              disabled={busy}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
            >
              {busy ? "..." : "Crear ciclo"}
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => setCloseFlow(null)}
              disabled={busy}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            >
              Cancelar
            </button>
            <button
              onClick={confirmCloseCycle}
              disabled={busy}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
            >
              {busy ? "..." : "Cerrar ciclo"}
            </button>
          </>
        )
      }
    >
      {closeFlow && !closeFlow.askNext && (
        <p className="text-sm text-[var(--color-muted)]">
          Vas a cerrar <span className="text-[var(--color-text)]">{closeFlow.cycle.label}</span>.
        </p>
      )}
      {closeFlow?.askNext && (
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-muted)]">
            El ciclo fue cerrado. ¿Crear uno nuevo a continuación?
          </p>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={closeFlow.copyWorkers}
              onChange={(e) => setCloseFlow((s) => ({ ...s, copyWorkers: e.target.checked }))}
            />
            Copiar trabajadores de cada labor del ciclo anterior
          </label>
        </div>
      )}
    </Modal>
  );
}
