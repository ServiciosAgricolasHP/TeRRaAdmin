import { useMemo, useRef, useEffect } from "react";

// ============================================================================
// Leyenda de colores
// ============================================================================

// Leyenda interactiva: click en un chip oculta o muestra esa subfaena en la
// grilla y el modal del día; doble click la aísla. "Mostrar todas" aparece solo
// con un filtro activo. El click espera ~220 ms antes de aplicarse, para no
// alternar el chip cuando en realidad es un doble click.
export function Legend({ dayIndex, excludedSubfaenas, onToggle, onIsolate, onClear }) {
  const subfaenas = useMemo(() => {
    const seen = new Map();
    for (const date in dayIndex) {
      for (const it of dayIndex[date]) {
        if (!seen.has(it.subfaenaId)) {
          seen.set(it.subfaenaId, {
            subfaenaId: it.subfaenaId,
            name: it.name,
            faenaName: it.faenaName,
            color: it.color,
          });
        }
      }
    }
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name));
  }, [dayIndex]);

  const allIds = useMemo(() => subfaenas.map((s) => s.subfaenaId), [subfaenas]);
  const clickTimer = useRef(null);
  const cancelPendingClick = () => {
    if (clickTimer.current) {
      clearTimeout(clickTimer.current);
      clickTimer.current = null;
    }
  };
  const handleClick = (id) => {
    cancelPendingClick();
    clickTimer.current = setTimeout(() => {
      clickTimer.current = null;
      onToggle(id);
    }, 220);
  };
  const handleDoubleClick = (id) => {
    cancelPendingClick();
    onIsolate(id, allIds);
  };
  useEffect(() => () => cancelPendingClick(), []);

  if (subfaenas.length === 0) return null;
  const hasFilter = excludedSubfaenas && excludedSubfaenas.size > 0;

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-2 text-[11px]">
      <span className="text-[var(--color-muted)]">
        Subfaenas{hasFilter ? " (click para mostrar/ocultar · doble-click para aislar)" : " (doble-click para aislar)"}:
      </span>
      {subfaenas.map((s) => {
        const excluded = excludedSubfaenas?.has(s.subfaenaId);
        return (
          <button
            type="button"
            key={s.subfaenaId}
            onClick={() => handleClick(s.subfaenaId)}
            onDoubleClick={() => handleDoubleClick(s.subfaenaId)}
            title={excluded ? "Click: mostrar · doble-click: aislar" : "Click: ocultar · doble-click: aislar"}
            className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 transition-opacity ${
              excluded
                ? "border-dashed border-[var(--color-border)] bg-transparent opacity-40"
                : "border-transparent bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
            }`}
          >
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            <span className={excluded ? "line-through" : ""}>{s.name}</span>
            {s.faenaName && <span className="text-[var(--color-muted)]">· {s.faenaName}</span>}
          </button>
        );
      })}
      {hasFilter && (
        <button
          type="button"
          onClick={onClear}
          className="ml-auto rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-muted)] hover:text-[var(--color-accent)]"
        >
          Mostrar todas
        </button>
      )}
    </div>
  );
}
