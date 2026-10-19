import { useCycleDetail } from "./CycleDetailContext";

// Barra sobre la grilla: ver a todos o por grupo, solo a quienes tienen
// producción, y los saltos a cada grupo.
export function GridToolbar() {
  "use no memo";
  const {
    columnFilterActive,
    gridVisible,
    groupView,
    LEADER_NONE,
    onlyWithProduction,
    orderedGroups,
    photoMode,
    scrollToGroup,
    setGroupView,
    setOnlyWithProduction,
    isGroupedView,
    workers,
  } = useCycleDetail();
  return (
    <>
      {!photoMode && workers.length > 0 && (
        <div className="mb-2 flex flex-wrap items-center gap-2">
          {gridVisible && (
            <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
              <button
                onClick={() => setGroupView("all")}
                className={`px-3 py-1.5 ${groupView === "all" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
              >
                Todos
              </button>
              <button
                onClick={() => setGroupView("group")}
                className={`px-3 py-1.5 ${groupView === "group" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
              >
                Por grupo
              </button>
            </div>
          )}
          <div
            className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs"
            title="Oculta a los trabajadores con $0 en esta labor este ciclo. Se pausa solo mientras haya una búsqueda/filtro de nombre activo, para que encontrar a alguien puntual siga mostrando resultados."
          >
            <button
              type="button"
              onClick={() => setOnlyWithProduction(false)}
              className={`px-3 py-1.5 ${!onlyWithProduction ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
            >
              Todos
            </button>
            <button
              type="button"
              onClick={() => setOnlyWithProduction(true)}
              className={`border-l border-[var(--color-border)] px-3 py-1.5 ${onlyWithProduction ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
            >
              Con producción
              {onlyWithProduction && columnFilterActive && <span className="ml-1 opacity-70">(pausado)</span>}
            </button>
          </div>
          {gridVisible && isGroupedView && orderedGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {orderedGroups.map((g) => {
                const isNone = g.key === LEADER_NONE;
                return (
                  <button
                    key={g.key}
                    type="button"
                    onClick={() => scrollToGroup(g.key)}
                    className={`rounded-full border px-2.5 py-1 text-xs ${
                      isNone
                        ? "border-[var(--color-warning)] bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                        : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                    }`}
                  >
                    {g.label} · {g.count}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </>
  );
}
