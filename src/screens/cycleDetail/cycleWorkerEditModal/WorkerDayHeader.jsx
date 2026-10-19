import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";
import { fmtCurrency } from "../../../utils/format";
import { formatDayLabel } from "./dayCards";

export function ConfigureButton({ d }) {
  "use no memo";
  const { readOnly } = useCycleDetail();
  const { setConfiguringDate } = useWorkerEdit();
  return !readOnly && (
    <button
      type="button"
      onClick={() => setConfiguringDate(d)}
      title="Configurar precios de este día"
      className="-m-1 rounded p-1 text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
    >
      ⚙
    </button>
  );
}

export function TotalBadge({ amt }) {
  "use no memo";
  return amt > 0 ? (
    <span className="rounded-full bg-[var(--color-accent-soft)] px-2 py-0.5 text-xs font-semibold tabular-nums text-[var(--color-accent)]">
      {fmtCurrency(amt)}
    </span>
  ) : (
    <span className="text-xs text-[var(--color-muted)]">—</span>
  );
}

// `amountField`: el total del día está en `${d}__total` en
// cosecha/trato/tratoEtapas y en `${d}__amt` en tratoHE, que no tiene
// `__total` (ver buildRowsOvertimeDay).
export function WorkerDayHeader({ d, amountField = `${d}__total` }) {
  "use no memo";
  const { row } = useWorkerEdit();
  return <div className="mb-2 flex items-center justify-between gap-2">
    <div className="flex items-center gap-1.5">
      <div className="text-sm font-semibold">{formatDayLabel(d)}</div>
      <ConfigureButton d={d} />
    </div>
    <TotalBadge amt={Number(row[amountField]) || 0} />
  </div>;
}
