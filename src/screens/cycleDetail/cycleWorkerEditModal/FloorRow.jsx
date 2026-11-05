import { containerLabel, floorField } from "../../../utils/cosechaCombos";
import { fmtCurrency } from "../../../utils/format";
import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

// Los pisos de la persona en un día: el del día y, en cosecha, uno por envase.
export function FloorRow({ d }) {
  const { floorsByDate } = useCycleDetail();
  const floors = floorsByDate?.[d] || [];
  if (!floors.length) return null;
  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-border)] pt-2">
      {floors.map((floor) => <FloorToggle key={floor.key} d={d} floor={floor} />)}
    </div>
  );
}

function FloorToggle({ d, floor }) {
  const { activeLabor, catalogs, readOnly, toggleFloor } = useCycleDetail();
  const { row, workerRut } = useWorkerEdit();
  const eff = floor.amount;
  const field = floorField(d, floor.key);
  const amt = Number(row[field]) || 0;
  const checked = amt > 0;
  const hasWd = !!row[`${field}_has_wd`];
  const canToggle = !readOnly && hasWd && eff > 0;
  const name = floor.container == null ? "Piso" : `Piso ${containerLabel(catalogs, floor.container)}`;
  return (
    <div className="flex items-center justify-between gap-2">
      <div className="text-xs text-[var(--color-muted)]">🪙 {name}{eff > 0 ? ` (${fmtCurrency(eff)})` : ""}</div>
      <button
        type="button"
        disabled={!canToggle}
        onClick={() => toggleFloor(activeLabor.id, d, workerRut, floor.key)}
        title={!hasWd ? "Asigna primero producción a este día" : eff === 0 ? "Configura el monto de este piso" : ""}
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
