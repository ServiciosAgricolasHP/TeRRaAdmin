import { useCycleDetail } from "./CycleDetailContext";
import { EMPLOYMENT_FILTERS } from "../../utils/employment";

const selectCls =
  "rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]";

// Barra sobre la grilla: ver a todos o por grupo, solo a quienes tienen
// producción, por contrato u honorarios, y los saltos a cada grupo.
export function GridToolbar() {
  "use no memo";
  const {
    columnFilterActive,
    employers,
    employmentFilter,
    employmentLoading,
    gridVisible,
    groupView,
    LEADER_NONE,
    onlyWithProduction,
    orderedGroups,
    scrollToGroup,
    setGroupView,
    setOnlyWithProduction,
    setEmploymentFilter,
    isGroupedView,
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
          <select
            value={employmentFilter.type}
            onChange={(e) => setEmploymentFilter((f) => ({ ...f, type: e.target.value }))}
            className={selectCls}
            aria-label="Contrato u honorarios"
            title="Contrato u honorarios vigentes en algún día del ciclo"
          >
            <option value="">📄 Contrato: todos</option>
            {Object.entries(EMPLOYMENT_FILTERS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </select>
          {employmentFilter.type !== "none" && employers.length > 0 && (
            <select
              value={employmentFilter.employerId}
              onChange={(e) => setEmploymentFilter((f) => ({ ...f, employerId: e.target.value }))}
              className={selectCls}
              aria-label="Empleador"
            >
              <option value="">🏢 Empleador: todos</option>
              {employers.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          )}
          {employmentLoading && <span className="text-xs text-[var(--color-muted)]">Cargando contratos…</span>}
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
