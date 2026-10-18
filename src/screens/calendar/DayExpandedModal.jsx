import { useMemo } from "react";
import { isWeekendDate, humanDate } from "./helpers";

// ============================================================================
// Modal: todas las subfaenas del día
// ============================================================================
//
// Se abre con un click en la celda (en mobile, también en una barra). Muestra
// todas las subfaenas del día, incluidas las que no caben en la celda, como
// botones agrupados por faena; cada una abre su detalle del día.
export function DayExpandedModal({ date, subfaenasOfDay, subfaenaById, faenaById, onClose, onPickSubfaena }) {
  const groupedByFaena = useMemo(() => {
    const map = new Map();
    for (const s of subfaenasOfDay) {
      const sub = subfaenaById.get(s.subfaenaId);
      const faena = sub ? faenaById.get(sub.faenaId) : null;
      const faenaId = faena?.id || "(sin-faena)";
      if (!map.has(faenaId)) {
        map.set(faenaId, { faena, items: [] });
      }
      map.get(faenaId).items.push(s);
    }
    return [...map.values()].sort((a, b) =>
      (a.faena?.name || "").localeCompare(b.faena?.name || ""),
    );
  }, [subfaenasOfDay, subfaenaById, faenaById]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div
        className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-xl border border-[var(--color-border)] bg-[var(--color-surface)] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex shrink-0 items-baseline justify-between border-b border-[var(--color-border)] px-5 py-3">
          <div>
            <h2 className={`text-lg font-semibold ${isWeekendDate(date) ? "text-[#dc2626]" : ""}`}>
              {humanDate(date)}
            </h2>
            <p className="text-xs text-[var(--color-muted)]">
              {subfaenasOfDay.length} subfaena{subfaenasOfDay.length === 1 ? "" : "s"} activa{subfaenasOfDay.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-[var(--color-muted)] hover:text-[var(--color-text)]"
          >
            ✕
          </button>
        </header>

        <div className="flex-1 space-y-3 overflow-y-auto px-5 py-4">
          {groupedByFaena.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
              Sin actividad registrada este día.
            </p>
          ) : (
            groupedByFaena.map((g) => (
              <section key={g.faena?.id || "(sin-faena)"}>
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  {g.faena?.name || "Sin faena"}
                </h3>
                <div className="space-y-1.5">
                  {g.items.map((s) => (
                    <button
                      key={s.subfaenaId}
                      type="button"
                      onClick={() => onPickSubfaena(s.subfaenaId)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm font-medium text-white shadow-sm hover:opacity-90"
                      style={{ backgroundColor: s.color }}
                    >
                      <span className="truncate">{s.name}</span>
                      <span className="shrink-0 text-xs opacity-90">
                        {s.workerCount} {s.workerCount === 1 ? "trabajador" : "trabajadores"}
                      </span>
                    </button>
                  ))}
                </div>
              </section>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
