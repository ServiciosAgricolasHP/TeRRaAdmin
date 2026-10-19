import { Link } from "react-router-dom";
import { useCycleDetail } from "./CycleDetailContext";

// Migas del ciclo (faena, subfaena y ciclo) y, con la barra plegada, una
// línea con la navegación entre ciclos y la labor activa.
export function CycleHeader() {
  "use no memo";
  const {
    activeLabor,
    cycle,
    days,
    faena,
    navigate,
    nextCycle,
    prevCycle,
    setToolbarCollapsed,
    subfaena,
    toolbarCollapsed,
    workers,
  } = useCycleDetail();
  return (
    <>
      <div className="mb-2 flex items-center gap-2 text-sm text-[var(--color-muted)]">
        <Link to="/faenas" className="hover:text-[var(--color-accent)]">Faenas</Link>
        <span>/</span>
        {faena ? (
          <Link
            to={`/faenas?selected=${faena.id}`}
            className="hover:text-[var(--color-accent)]"
          >
            {faena.name}
          </Link>
        ) : (
          <span>—</span>
        )}
        {subfaena && (
          <>
            <span>/</span>
            <Link
              to={`/faenas?selected=${faena?.id || ""}&sub=${subfaena.id}`}
              className="hover:text-[var(--color-accent)]"
            >
              {subfaena.name}
            </Link>
          </>
        )}
        <span>/</span>
        <span className="text-[var(--color-text)]">{cycle.label}</span>
      </div>

      {toolbarCollapsed && (
        <div className="mb-2 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setToolbarCollapsed(false)}
            title="Mostrar controles del ciclo"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            ▶
          </button>
          <button
            type="button"
            onClick={() => prevCycle && navigate(`/cycles/${prevCycle.id}`)}
            disabled={!prevCycle}
            title={prevCycle ? `Ciclo anterior: ${prevCycle.label}` : "No hay ciclo anterior"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
          >
            ‹
          </button>
          <span className="text-lg font-semibold tracking-tight">{cycle.label}</span>
          <button
            type="button"
            onClick={() => nextCycle && navigate(`/cycles/${nextCycle.id}`)}
            disabled={!nextCycle}
            title={nextCycle ? `Ciclo siguiente: ${nextCycle.label}` : "No hay ciclo siguiente"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
          >
            ›
          </button>
          {activeLabor && (
            <span className="ml-1 truncate text-xs text-[var(--color-muted)]">
              {activeLabor.name} · {workers.length} trab. · {days.length} días
            </span>
          )}
        </div>
      )}
    </>
  );
}
