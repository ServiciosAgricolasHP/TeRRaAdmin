// Las faenas de una lista que se está generando: cada una se saca o se vuelve
// a poner de un toque, sin perder lo editado en sus filas. `groups` son los
// grupos por faena de la lista entera y `excluded`, los ids de las que quedan
// fuera ("" es el grupo sin faena).
export default function FaenaPicker({ groups, excluded, onChange }) {
  if (groups.length < 2) return null;
  const toggle = (id) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    onChange(next);
  };
  const link = "min-h-8 px-1.5 text-xs text-[var(--color-muted)] underline hover:text-[var(--color-fg)]";
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-[var(--color-muted)]">Faenas:</span>
      {groups.map((g) => {
        const on = !excluded.has(g.faenaId);
        return (
          <button
            key={g.faenaId}
            type="button"
            aria-pressed={on}
            onClick={() => toggle(g.faenaId)}
            className={`min-h-8 rounded-full border px-3 py-1 ${
              on
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]"
                : "border-[var(--color-border)] text-[var(--color-muted)] line-through"
            }`}
          >
            {on ? "✓" : "✕"} {g.faenaName} · {g.totals.days} día{g.totals.days === 1 ? "" : "s"}
          </button>
        );
      })}
      <button type="button" onClick={() => onChange(new Set())} className={link}>
        Todas
      </button>
      <button type="button" onClick={() => onChange(new Set(groups.map((g) => g.faenaId)))} className={link}>
        Ninguna
      </button>
    </div>
  );
}
