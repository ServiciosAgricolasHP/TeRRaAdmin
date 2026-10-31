import { tratoTypeLabel } from "../../utils/cosechaCombos";
import { DEFAULT_BASE_DAY, DEFAULT_OVERTIME_RATE, DEFAULT_BONUS_MANEJO, DEFAULT_BONUS_SUPERVISION } from "../../utils/tratoHE";
import { useCycleDetail } from "./CycleDetailContext";

// Barra de la labor activa: qué se ingresa en ella, la vista detalle o
// resumen, editar o quitar la labor, agregar días y trabajadores, y los días
// del ciclo con su botón para quitarlos.
export function LaborToolbar() {
  const {
    activeLabor,
    askRemoveLabor,
    catalogs,
    harvestView,
    cycle,
    days,
    defaultMode,
    activeStages,
    gridVisible,
    isHarvestLabor,
    isQtyLabor,
    isPieceworkStagesLabor,
    isOvertimeDayLabor,
    isPieceworkLabor,
    openEditLabor,
    readOnly,
    removeDay,
    setAddDayOpen,
    setHarvestView,
    setDefaultLeadersOpen,
    setPickerOpen,
    setOvertimeDayView,
    setPieceworkView,
    overtimeDayView,
    pieceworkView,
    workers,
  } = useCycleDetail();
  return (
    <>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="text-xs text-[var(--color-muted)]">
          {workers.length} trabajadores · {days.length} días
          {!isQtyLabor && (
            <span className="ml-3 text-[var(--color-muted)]/70">
              Tip: usa <code className="rounded bg-[var(--color-surface-2)] px-1">=350*54</code> para fórmulas.
            </span>
          )}
          {isHarvestLabor && (
            <span className="ml-3 text-[var(--color-muted)]/70">
              Cosecha · por defecto {defaultMode === "flat" ? "día fijo" : "por unidad"} · agrega tipos por día abajo
            </span>
          )}
          {isPieceworkLabor && (
            <span className="ml-3 text-[var(--color-muted)]/70">
              Trato · {tratoTypeLabel(catalogs, activeLabor.tratoType ?? 0)} · ingresa cantidad y precio del día
            </span>
          )}
          {isPieceworkStagesLabor && (
            <span className="ml-3 text-[var(--color-muted)]/70">
              Por etapas · {activeStages.map((s) => `${s.name}${s.counts ? " ✓" : ""}`).join(" · ")} · ✓ = cuenta unidades
            </span>
          )}
          {isOvertimeDayLabor && (
            <span className="ml-3 text-[var(--color-muted)]/70">
              Trato + HE · base ${(activeLabor.baseDayDefault ?? DEFAULT_BASE_DAY).toLocaleString("es-CL")} · HE ${(activeLabor.overtimeRate ?? DEFAULT_OVERTIME_RATE).toLocaleString("es-CL")}/h · bonos M ${(activeLabor.bonusManejo ?? DEFAULT_BONUS_MANEJO).toLocaleString("es-CL")} / S ${(activeLabor.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION).toLocaleString("es-CL")}
            </span>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {isOvertimeDayLabor && (
            <>
              {gridVisible && (
                <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-xs">
                  <button
                    onClick={() => setOvertimeDayView("detalle")}
                    className={`px-3 py-1.5 transition-colors ${
                      overtimeDayView === "detalle"
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                        : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                    }`}
                  >
                    Detalle
                  </button>
                  <button
                    onClick={() => setOvertimeDayView("resumen")}
                    className={`px-3 py-1.5 transition-colors ${
                      overtimeDayView === "resumen"
                        ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                        : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                    }`}
                  >
                    Resumen
                  </button>
                </div>
              )}
              <button onClick={() => setDefaultLeadersOpen(true)} disabled={readOnly} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-40">
                ⚑ Líderes / Manejo
              </button>
            </>
          )}
          {isHarvestLabor && gridVisible && (
            <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-xs">
              <button
                onClick={() => setHarvestView("detalle")}
                className={`px-3 py-1.5 transition-colors ${
                  harvestView === "detalle"
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                Detalle
              </button>
              <button
                onClick={() => setHarvestView("resumen")}
                className={`px-3 py-1.5 transition-colors ${
                  harvestView === "resumen"
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                Resumen
              </button>
            </div>
          )}
          {isPieceworkLabor && gridVisible && (
            <div className="flex rounded-md overflow-hidden border border-[var(--color-border)] text-xs">
              <button
                onClick={() => setPieceworkView("detalle")}
                className={`px-3 py-1.5 transition-colors ${
                  pieceworkView === "detalle"
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                Detalle
              </button>
              <button
                onClick={() => setPieceworkView("resumen")}
                className={`px-3 py-1.5 transition-colors ${
                  pieceworkView === "resumen"
                    ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium"
                    : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                Resumen
              </button>
            </div>
          )}
          <button onClick={openEditLabor} disabled={readOnly} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-40">
            Editar labor
          </button>
          <button onClick={askRemoveLabor} disabled={readOnly || cycle.labors.length === 1} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)] disabled:opacity-40">
            Quitar labor
          </button>
          <button onClick={() => setAddDayOpen(true)} disabled={readOnly} className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            + Día
          </button>
          <button onClick={() => setPickerOpen(true)} disabled={readOnly} className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] shadow-sm hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
            + Trabajador
          </button>
        </div>
      </div>

      {days.length > 0 && !readOnly && (
        <div className="mb-2 flex flex-wrap gap-1">
          {days.map((d) => (
            <button
              key={d}
              onClick={() => removeDay(d)}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-0.5 text-xs text-[var(--color-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
              title="Click para quitar el día (solo si ninguna labor tiene producción ni hay vueltas de transporte ese día)"
            >
              {d} ✕
            </button>
          ))}
        </div>
      )}
    </>
  );
}
