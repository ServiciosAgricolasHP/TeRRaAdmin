// Fila de chips de un filtro múltiple (Grupo, Ciclo) del detalle de la nómina.
export function FilterChips({ label, options, active, onToggle }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-xs">
      <span className="w-12 shrink-0 text-[var(--color-muted)]">{label}</span>
      {options.map((o) => {
        const on = active.has(o.id);
        return (
          <button
            key={o.id}
            type="button"
            onClick={() => onToggle(o.id)}
            title={o.title}
            aria-pressed={on}
            className={`min-h-7 rounded-full border px-2.5 py-0.5 ${
              on
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] font-medium text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-surface)] hover:border-[var(--color-accent)]"
            }`}
          >
            {on ? "✓ " : ""}
            {o.label}
            {o.count != null && <span className="ml-1 opacity-60">{o.count}</span>}
          </button>
        );
      })}
    </div>
  );
}

// Un filtro activo, con ✕ para quitarlo.
export function FilterToken({ label, onRemove }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-[var(--color-accent)] bg-[var(--color-accent-soft)] py-0.5 pl-2.5 pr-1 text-[var(--color-accent)]">
      {label}
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Quitar ${label}`}
        className="rounded-full px-1 leading-none hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
      >
        ✕
      </button>
    </span>
  );
}
