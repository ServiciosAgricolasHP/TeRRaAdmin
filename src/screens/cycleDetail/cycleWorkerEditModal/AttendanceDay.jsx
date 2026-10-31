import { ConfigureButton } from "./WorkerDayHeader";
import { cardAccentCls, formatDayLabel } from "./dayCards";
import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

// Día de un trabajador de sueldo mensual: solo la asistencia, en $0.
export function AttendanceDay({ d }) {
  const { readOnly, toggleAttendance } = useCycleDetail();
  const { row, workerRut } = useWorkerEdit();
  const present = !!row[`${d}__present`];
  return (
    <div key={d} className={`flex items-center justify-between gap-2 ${cardAccentCls(present)}`}>
      <div className="flex items-center gap-1.5">
        <div className="text-sm font-semibold">{formatDayLabel(d)}</div>
        <ConfigureButton d={d} />
      </div>
      <button
        type="button"
        disabled={readOnly}
        onClick={() => toggleAttendance(workerRut, d, present)}
        className={`rounded-full px-3 py-1.5 text-xs font-medium ${
          present
            ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
            : "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
        }`}
      >
        {present ? "✓ Presente" : "Marcar presente"}
      </button>
    </div>
  );
}
