import { tratoUnitLabel } from "../../../utils/cosechaCombos";
import { fmtCurrency } from "../../../utils/format";
import { WorkerDayHeader } from "./WorkerDayHeader";
import { FloorRow } from "./FloorRow";
import { formatDayLabel, cardAccentCls, inputCls } from "./dayCards";
import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

export function PieceworkDay({ d }) {
  const {
    catalogs,
    commitPieceworkTier,
    daysWithFloor,
    dayTiersByDate,
    readOnly,
  } = useCycleDetail();
  const {
    clearDraft,
    displayValue,
    drafts,
    row,
    runWithSaving,
    savingFields,
    setConfiguringDate,
    setDraft,
    workerRut,
  } = useWorkerEdit();
  const tiers = dayTiersByDate[d] || [];
  if (tiers.length === 0 && !daysWithFloor?.has(d)) {
    return (
      <div key={d} className="rounded-lg border border-dashed border-[var(--color-border)] p-3.5">
        <div className="mb-1 flex items-center justify-between gap-2">
          <div className="text-sm font-semibold">{formatDayLabel(d)}</div>
          {!readOnly && (
            <button type="button" onClick={() => setConfiguringDate(d)} className="text-xs text-[var(--color-accent)] hover:underline">
              ⚙ Configurar
            </button>
          )}
        </div>
        <div className="text-xs text-[var(--color-muted)]">Sin precio configurado este día.</div>
      </div>
    );
  }
  return (
    <div key={d} className={cardAccentCls(Number(row[`${d}__total`]) > 0)}>
      <WorkerDayHeader d={d} />
      <div className="space-y-2">
        {tiers.map((t) => {
          const field = `${d}__${t.key}`;
          const amt = Number(row[`${field}__amt`]) || 0;
          const unitLbl = t.unit != null ? tratoUnitLabel(catalogs, t.unit) : null;
          return (
            <div key={t.key} className="flex items-center justify-between gap-2">
              <div className="text-xs text-[var(--color-muted)]">
                {fmtCurrency(t.price)} {t.mode === "flat" ? "/día" : `/${unitLbl ? unitLbl.toLowerCase() : "unid"}`}
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  inputMode="decimal"
                  disabled={readOnly}
                  value={displayValue(field)}
                  onChange={(e) => setDraft(field, e.target.value)}
                  onBlur={async () => {
                    if (!(field in drafts)) return;
                    const v = drafts[field];
                    await runWithSaving(field, () => commitPieceworkTier(d, t.key, workerRut, v));
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
      <FloorRow d={d} />
    </div>
  );
}
