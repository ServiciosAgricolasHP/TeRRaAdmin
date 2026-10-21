import { useCycleDetail } from "./CycleDetailContext";

// Barra sobre la grilla: ver a todos, por grupo (líder) o por contrato, solo a
// quienes tienen producción, y los saltos a cada grupo.
export function GridToolbar() {
  "use no memo";
  const {
    columnFilterActive,
    employmentLoading,
    gridVisible,
    groupView,
    onlyWithProduction,
    orderedGroups,
    scrollToGroup,
    setGroupView,
    setOnlyWithProduction,
    workers,
  } = useCycleDetail();
  return (
    <>
      {workers.length > 0 && (
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
              <button
                onClick={() => setGroupView("employment")}
                title="Con contrato, a honorarios y sin nada, según lo vigente en algún día del ciclo"
                className={`px-3 py-1.5 ${groupView === "employment" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
              >
                Por contrato
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
          {gridVisible && employmentLoading && <span className="text-xs text-[var(--color-muted)]">Cargando contratos…</span>}
          {gridVisible && orderedGroups.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              {orderedGroups.map((g) => {
                const isNone = g.none;
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
                    {g.icon !== "👥" && `${g.icon} `}{g.label} · {g.count}
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
