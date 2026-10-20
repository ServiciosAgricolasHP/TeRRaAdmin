import { useMemo } from "react";
import { isWeekendDate, humanDate } from "./helpers";

// ============================================================================
// Modal: todas las subfaenas del día
// ============================================================================
//
// Se abre con un click en la celda (en mobile, también en una barra). Muestra
// todas las subfaenas del día, incluidas las que no caben en la celda, como
// botones agrupados por faena; cada una abre su detalle del día.
export function DayExpandedModal({ date, subjobsOfDay, subjobById, jobById, onClose, onPickSubjob }) {
  const groupedByJob = useMemo(() => {
    const map = new Map();
    for (const s of subjobsOfDay) {
      const subjob = subjobById.get(s.subjobId);
      const job = subjob ? jobById.get(subjob.faenaId) : null;
      const jobId = job?.id || "(sin-faena)";
      if (!map.has(jobId)) {
        map.set(jobId, { job, items: [] });
      }
      map.get(jobId).items.push(s);
    }
    return [...map.values()].sort((a, b) =>
      (a.job?.name || "").localeCompare(b.job?.name || ""),
    );
  }, [subjobsOfDay, subjobById, jobById]);

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
              {subjobsOfDay.length} subfaena{subjobsOfDay.length === 1 ? "" : "s"} activa{subjobsOfDay.length === 1 ? "" : "s"}
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
          {groupedByJob.length === 0 ? (
            <p className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-sm text-[var(--color-muted)]">
              Sin actividad registrada este día.
            </p>
          ) : (
            groupedByJob.map((g) => (
              <section key={g.job?.id || "(sin-faena)"}>
                <h3 className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-muted)]">
                  {g.job?.name || "Sin faena"}
                </h3>
                <div className="space-y-1.5">
                  {g.items.map((s) => (
                    <button
                      key={s.subjobId}
                      type="button"
                      onClick={() => onPickSubjob(s.subjobId)}
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
