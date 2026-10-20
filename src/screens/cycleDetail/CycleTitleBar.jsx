import { useCycleDetail } from "./CycleDetailContext";

// Encabezado del ciclo: plegar la barra, ciclo anterior y siguiente de la
// subfaena, labores y días, y las acciones del ciclo (catálogos, transportes,
// resumen, cerrar o reabrir).
export function CycleTitleBar() {
  "use no memo";
  const {
    closed,
    cycle,
    days,
    handleReopenCycle,
    navigate,
    nextCycle,
    prevCycle,
    setCatalogsOpen,
    setCloseFlow,
    setSummaryOpen,
    setToolbarCollapsed,
    setTransportsOpen,
  } = useCycleDetail();
  return (
    <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
      <div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setToolbarCollapsed(true)}
            title="Ocultar controles del ciclo (más espacio para la grilla)"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
          >
            ▼
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
          <h1 className="text-2xl font-semibold tracking-tight">{cycle.label}</h1>
          <button
            type="button"
            onClick={() => nextCycle && navigate(`/cycles/${nextCycle.id}`)}
            disabled={!nextCycle}
            title={nextCycle ? `Ciclo siguiente: ${nextCycle.label}` : "No hay ciclo siguiente"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] disabled:opacity-30 disabled:pointer-events-none"
          >
            ›
          </button>
        </div>
        <p className="text-sm text-[var(--color-muted)]">
          {cycle.labors.length} labor{cycle.labors.length === 1 ? "" : "es"} · {days.length} días
          {closed && " · 🔒 ciclo cerrado (solo lectura)"}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => setCatalogsOpen(true)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
          ⚙ Catálogos
        </button>
        <button onClick={() => setTransportsOpen(true)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
          🚐 Transportes
        </button>
        <button onClick={() => setSummaryOpen(true)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
          📊 Resumen ciclo
        </button>
        {!closed && (
          <button onClick={() => setCloseFlow(true)} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
            Cerrar ciclo
          </button>
        )}
        {closed && (
          <button onClick={handleReopenCycle} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]">
            Reabrir ciclo
          </button>
        )}
        <span
          className="hidden sm:inline-flex items-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1 text-[10px] text-[var(--color-muted)]"
          title={
            "Atajos en el grid:\n" +
            "  Esc → salir de edición\n" +
            "  Shift+Click en filas → seleccionar rango\n" +
            "  Ctrl+D → copiar valor de la celda focuseada a las filas seleccionadas\n" +
            "  Ctrl+V → pegar columna desde portapapeles (una línea por fila)\n" +
            "  Ctrl+Z → deshacer último cambio (Ctrl+D y Ctrl+V se deshacen como uno)"
          }
        >
          ⌨ Atajos
        </span>
      </div>
    </div>
  );
}
