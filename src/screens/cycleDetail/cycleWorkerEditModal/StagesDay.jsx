import { fmtCurrency } from "../../../utils/format";
import { WorkerDayHeader } from "./WorkerDayHeader";
import { formatDayLabel, cardAccentCls, inputCls } from "./dayCards";
import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

export function StagesDay({ d }) {
  const { commitStageQty, dayStagesByDate, readOnly } = useCycleDetail();
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
  const stages = dayStagesByDate[d] || [];
  if (stages.length === 0) {
    return (
      <div key={d} className="rounded-lg border border-dashed border-[var(--color-border)] p-3.5">
        <div className="mb-1 text-sm font-semibold">{formatDayLabel(d)}</div>
        <div className="text-xs text-[var(--color-muted)]">Sin precio configurado este día.</div>
      </div>
    );
  }
  return (
    <div key={d} className={cardAccentCls(Number(row[`${d}__total`]) > 0)}>
      <WorkerDayHeader d={d} />
      <div className="space-y-2">
        {stages.map((st) => {
          const field = `${d}__${st.id}`;
          const amt = Number(row[`${field}__amt`]) || 0;
          return (
            <div key={st.id} className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-sm">
                <div className="truncate">
                  {st.name}
                  {st.counts ? " ✓" : ""}
                </div>
                <div className="text-[10px] text-[var(--color-muted)]">
                  {fmtCurrency(st.price)}
                  {st.mode === "flat" ? "/día" : "/unid"}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={readOnly}
                  value={displayValue(field)}
                  onChange={(e) => setDraft(field, e.target.value)}
                  onBlur={async () => {
                    if (!(field in drafts)) return;
                    const v = drafts[field];
                    await runWithSaving(field, () => commitStageQty(d, st.id, workerRut, v));
                    clearDraft(field);
                  }}
                  className={inputCls}
                />
                <span
                  className={`w-16 text-right text-[10px] tabular-nums ${
                    savingFields[field] ? "font-semibold text-[var(--color-accent)] animate-pulse" : "text-[var(--color-muted)]"
                  }`}
                >
                  {savingFields[field] ? "guardando…" : amt > 0 ? fmtCurrency(amt) : ""}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
