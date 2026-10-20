// ============================================================
// Editores
// ============================================================

export function TitlesEditor({ titles, labors, carriers, onChange, onLaborNameChange, onCarrierNameChange }) {
  return (
    <div className="mb-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
      <div className="mb-2 text-xs font-medium uppercase tracking-wider text-[var(--color-muted)]">
        Títulos del resumen (compartidos con el equipo)
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        <label className="block">
          <span className="block text-[10px] text-[var(--color-muted)]">Título principal</span>
          <input
            value={titles.main || ""}
            onChange={(e) => onChange({ main: e.target.value })}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>
        <label className="block">
          <span className="block text-[10px] text-[var(--color-muted)]">Subtítulo (razón social / cliente)</span>
          <input
            value={titles.subtitle || ""}
            onChange={(e) => onChange({ subtitle: e.target.value })}
            className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
          />
        </label>
      </div>
      {labors.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] text-[var(--color-muted)]">Alias por labor (opcional)</div>
          <div className="grid gap-1.5 md:grid-cols-2">
            {labors.map((l) => (
              <label key={l.id} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate text-[var(--color-muted)]">{l.name}</span>
                <input
                  value={titles.laborNames?.[l.id] || ""}
                  placeholder={l.name}
                  onChange={(e) => onLaborNameChange(l.id, e.target.value)}
                  className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 outline-none focus:border-[var(--color-accent)]"
                />
              </label>
            ))}
          </div>
        </div>
      )}
      {carriers.length > 0 && (
        <div className="mt-2">
          <div className="mb-1 text-[10px] text-[var(--color-muted)]">Alias por transportista (opcional)</div>
          <div className="grid gap-1.5 md:grid-cols-2">
            {carriers.map((c) => (
              <label key={c.id} className="flex items-center gap-2 text-xs">
                <span className="w-32 truncate text-[var(--color-muted)]">{c.label}</span>
                <input
                  value={titles.carrierNames?.[c.id] || ""}
                  placeholder={c.label}
                  onChange={(e) => onCarrierNameChange(c.id, e.target.value)}
                  className="flex-1 rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 outline-none focus:border-[var(--color-accent)]"
                />
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
