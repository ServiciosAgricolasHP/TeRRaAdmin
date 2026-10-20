
// Editor de los encabezados de ciclo: cómo aparece cada uno en el XLSX, los
// comprobantes y el detalle impreso.
export function CycleTitlesEditor({ cycleDetails, cycleTitleOverrides, setCycleTitle, setShowTitleEditor }) {
  "use no memo";
  return (
    <section className="rounded-lg border border-[var(--color-accent)]/50 bg-[var(--color-accent-soft)]/40 p-4">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold">📝 Encabezados de ciclo</h3>
        <button
          onClick={() => setShowTitleEditor(false)}
          className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
        >
          ✕
        </button>
      </div>
      <p className="mb-3 text-[11px] text-[var(--color-muted)]">
        Personaliza cómo aparece cada ciclo en el XLSX, los comprobantes y el PDF de detalle.
        Dejar vacío para restaurar el nombre original. Los cambios se guardan automáticamente.
      </p>
      <div className="space-y-2">
        {cycleDetails.map((c) => {
          const override = cycleTitleOverrides[c.id];
          const hasOverride = !!override;
          return (
            <div key={c.id} className="flex items-center gap-2">
              <label
                className="w-44 shrink-0 truncate text-[11px] text-[var(--color-muted)]"
                title={c.label}
              >
                {c.label}
              </label>
              <input
                value={override ?? ""}
                placeholder={c.label}
                onChange={(e) => setCycleTitle(c.id, e.target.value)}
                className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
              />
              {hasOverride && (
                <button
                  onClick={() => setCycleTitle(c.id, "")}
                  className="rounded px-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-accent)]"
                  title="Restaurar el nombre original"
                >
                  ↺
                </button>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
