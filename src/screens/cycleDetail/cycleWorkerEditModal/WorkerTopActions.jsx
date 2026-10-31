import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

// Acciones sobre el trabajador (no sobre un día): pago mensual, grupo/líder
// y quitar de la labor. Usan las mismas funciones que los botones de la
// grilla de escritorio (toggleMonthly / assignLeaderToWorker /
// removeWorkerByRut en CycleDetail.jsx).
export function WorkerTopActions() {
  const {
    assignLeaderToWorker,
    isGroupedView,
    LEADER_LOCAL,
    readOnly,
    toggleMonthly,
  } = useCycleDetail();
  const {
    allowsMonthly,
    confirmingRemove,
    currentLeader,
    doRemove,
    isTemp,
    leaderBusy,
    removing,
    row,
    setConfirmingRemove,
    setPickingLeader,
    workerRut,
  } = useWorkerEdit();
  return <div className="mb-3 flex flex-wrap items-center gap-2 rounded-lg bg-[var(--color-surface-2)] p-2.5">
    {allowsMonthly && !readOnly && (
      <button
        type="button"
        onClick={() => toggleMonthly(workerRut)}
        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
          row._monthly
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
        }`}
        title="Pago mensual: las jornadas se registran como asistencia pero no entran a la nómina"
      >
        {row._monthly ? "✓ Mensual" : "Marcar mensual"}
      </button>
    )}
    {isGroupedView && !isTemp && (
      currentLeader ? (
        <button
          type="button"
          disabled={readOnly || leaderBusy}
          onClick={() => setPickingLeader(true)}
          className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          title="Cambiar líder/grupo"
        >
          Grupo: {currentLeader}
        </button>
      ) : (
        !readOnly && (
          <>
            <button
              type="button"
              disabled={leaderBusy}
              onClick={() => assignLeaderToWorker(workerRut, LEADER_LOCAL)}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            >
              Chilenos
            </button>
            <button
              type="button"
              disabled={leaderBusy}
              onClick={() => setPickingLeader(true)}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
            >
              Elegir líder…
            </button>
          </>
        )
      )
    )}
    {!readOnly && (
      <div className="ml-auto">
        {confirmingRemove ? (
          <div className="flex items-center gap-2">
            <span className="text-xs text-[var(--color-muted)]">¿Quitar del labor?</span>
            <button
              type="button"
              disabled={removing}
              onClick={doRemove}
              className="rounded-md bg-[var(--color-danger)] px-2.5 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            >
              Confirmar
            </button>
            <button
              type="button"
              disabled={removing}
              onClick={() => setConfirmingRemove(false)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-xs hover:bg-[var(--color-accent-soft)]"
            >
              Cancelar
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmingRemove(true)}
            className="rounded-full px-2.5 py-1.5 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
          >
            Quitar trabajador
          </button>
        )}
      </div>
    )}
  </div>;
}
