import { effectivePiso } from "../../../utils/cosechaCombos";
import { fmtCurrency } from "../../../utils/format";
import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

export function FloorRow({ d }) {
  "use no memo";
  const {
    activeLabor,
    dayPrices,
    daysWithFloor,
    readOnly,
    toggleFloor,
  } = useCycleDetail();
  const { row, workerRut } = useWorkerEdit();
  if (!daysWithFloor?.has(d)) return null;
  const eff = effectivePiso(activeLabor, dayPrices, d);
  const amt = Number(row[`${d}__piso`]) || 0;
  const checked = amt > 0;
  const hasWd = !!row[`${d}__piso_has_wd`];
  const canToggle = !readOnly && hasWd && eff > 0;
  return (
    <div className="mt-2 flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-2">
      <div className="text-xs text-[var(--color-muted)]">🪙 Piso{eff > 0 ? ` (${fmtCurrency(eff)})` : ""}</div>
      <button
        type="button"
        disabled={!canToggle}
        onClick={() => toggleFloor(activeLabor.id, d, workerRut)}
        title={!hasWd ? "Asigna primero producción a este día" : eff === 0 ? "Configura el piso del día o el piso por defecto de la labor" : ""}
        className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
          checked
            ? "bg-amber-500/20 text-amber-700 dark:text-amber-300"
            : canToggle
              ? "border border-[var(--color-border)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
              : "cursor-not-allowed border border-[var(--color-border)] text-[var(--color-muted)] opacity-40"
        }`}
      >
        {checked ? `Con piso · ${fmtCurrency(amt)}` : "Sin piso"}
      </button>
    </div>
  );
}
