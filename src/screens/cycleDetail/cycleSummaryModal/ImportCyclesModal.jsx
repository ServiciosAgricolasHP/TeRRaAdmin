// ============================================================
// Modal: Importar ciclos anteriores
// ============================================================
// Sub-modal de CycleSummaryModal (modo cobrar), paso 1: los ciclos de la misma
// faena y subfaena. En el paso 2 (ImportLaborsModal) se eligen sus labores.
export function ImportCyclesModal({ open, onClose, cycles, alreadyImported, selected, onToggle, onConfirm, busy }) {
  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4"
      onClick={onClose}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-baseline justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div>
            <h2 className="text-lg font-semibold">📥 Importar ciclos anteriores</h2>
            <p className="text-xs text-[var(--color-muted)]">
              Misma faena/subfaena. En el paso siguiente eliges qué labores traer; cada una entra con su propia tabla.
            </p>
          </div>
          <button onClick={onClose} className="text-[var(--color-muted)] hover:text-[var(--color-text)]">✕</button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-3">
          {cycles.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
              No hay otros ciclos en esta faena/subfaena.
            </p>
          ) : (
            <ul className="space-y-1">
              {cycles.map((c) => {
                const checked = selected.has(c.id);
                const alreadyDone = alreadyImported?.has(c.id);
                return (
                  <li key={c.id}>
                    <label
                      className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm ${
                        checked
                          ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                          : "border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => onToggle(c.id)}
                      />
                      <div className="flex-1">
                        <div className="font-medium">
                          {c.label || c.id}
                          {alreadyDone && (
                            <span
                              className="ml-2 rounded bg-[var(--color-success-bg,#dcfce7)] px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-[var(--color-success,#166534)]"
                              title="Ya se importó alguna de sus labores; en el paso siguiente aparecen deshabilitadas."
                            >
                              ✓ con importaciones
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-[var(--color-muted)]">
                          {c.status || "—"} · {(c.labors || []).length} labor{(c.labors || []).length === 1 ? "" : "es"}
                        </div>
                      </div>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-[var(--color-border)] px-5 py-3">
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
          >
            Cancelar
          </button>
          <button
            onClick={onConfirm}
            disabled={busy || selected.size === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Leyendo…" : `Siguiente: elegir labores (${selected.size} ciclo${selected.size === 1 ? "" : "s"})`}
          </button>
        </footer>
      </div>
    </div>
  );
}
