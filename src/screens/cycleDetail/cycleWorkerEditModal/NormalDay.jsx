import { getDaySingle } from "../../../utils/cosechaCombos";
import { fmtCurrency } from "../../../utils/format";
import { AttendanceDay } from "./AttendanceDay";
import { ConfigureButton } from "./WorkerDayHeader";
import { effectiveDayPrice, cardAccentCls, formatDayLabel, inputCls } from "./dayCards";
import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

export function NormalDay({ d }) {
  "use no memo";
  const { activeLabor, commitNormalAmount, dayPrices, readOnly } = useCycleDetail();
  const {
    clearDraft,
    displayValue,
    drafts,
    row,
    runWithSaving,
    savingFields,
    setDraft,
    workerRut,
  } = useWorkerEdit();
  const dayCfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
  const suggested = effectiveDayPrice(activeLabor, dayCfg);
  if (row._monthly) return <AttendanceDay d={d} />;
  const field = d;
  const amt = Number(row[field]) || 0;
  return (
    <div key={d} className={`flex items-center justify-between gap-2 ${cardAccentCls(amt > 0)}`}>
      <div className="flex items-center gap-1.5">
        <div className="text-sm font-semibold">{formatDayLabel(d)}</div>
        <ConfigureButton d={d} />
      </div>
      <div className="flex items-center gap-2">
        {savingFields[field] && (
          <span className="text-[10px] font-semibold text-[var(--color-accent)] animate-pulse">guardando…</span>
        )}
        {!readOnly && !amt && !!suggested && drafts[field] === undefined && (
          <button
            type="button"
            onClick={() => commitNormalAmount(d, workerRut, suggested)}
            className="text-[10px] italic text-[var(--color-muted)] hover:text-[var(--color-accent)]"
          >
            usar {fmtCurrency(suggested)}
          </button>
        )}
        <input
          type="text"
          inputMode="decimal"
          disabled={readOnly}
          value={displayValue(field)}
          placeholder={suggested ? String(suggested) : ""}
          onChange={(e) => setDraft(field, e.target.value)}
          onBlur={async () => {
            if (!(field in drafts)) return;
            const v = drafts[field];
            await runWithSaving(field, () => commitNormalAmount(d, workerRut, v));
            clearDraft(field);
          }}
          className={inputCls}
        />
      </div>
    </div>
  );
}
