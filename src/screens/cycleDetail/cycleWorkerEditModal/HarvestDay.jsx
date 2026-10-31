import { comboLabel, containerLabel } from "../../../utils/cosechaCombos";
import { fmtCurrency } from "../../../utils/format";
import { WorkerDayHeader } from "./WorkerDayHeader";
import { FloorRow } from "./FloorRow";
import { formatDayLabel, cardAccentCls, inputCls } from "./dayCards";
import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

export function HarvestDay({ d }) {
  const {
    catalogs,
    commitHarvestCombo,
    dayCombosByDate,
    daysWithFloor,
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
  const combos = dayCombosByDate[d] || [];
  if (combos.length === 0 && !daysWithFloor?.has(d)) {
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
        <div className="text-xs text-[var(--color-muted)]">Sin tipo de pago configurado este día.</div>
      </div>
    );
  }
  return (
    <div key={d} className={cardAccentCls(Number(row[`${d}__total`]) > 0)}>
      <WorkerDayHeader d={d} />
      <div className="space-y-2">
        {combos.map((c) => {
          const field = `${d}__${c.key}`;
          const amt = Number(row[`${field}__amt`]) || 0;
          return (
            <div key={c.key} className="flex items-center justify-between gap-2">
              <div className="min-w-0 text-sm">
                <div className="truncate">{comboLabel(catalogs, c.x, c.y)}</div>
                <div className="text-[10px] text-[var(--color-muted)]">
                  {c.mode === "flat" ? `${fmtCurrency(c.price)}/día` : `${fmtCurrency(c.price)}/${containerLabel(catalogs, c.y).toLowerCase()}`}
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
                    await runWithSaving(field, () => commitHarvestCombo(d, c.key, workerRut, v));
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
