import { getDaySingle } from "../../../utils/cosechaCombos";
import { parseAmount } from "../../../utils/formula";
import { fmtCurrency } from "../../../utils/format";
import { DEFAULT_OVERTIME_RATE, DEFAULT_BONUS_MANEJO, DEFAULT_BONUS_SUPERVISION } from "../../../utils/tratoHE";
import { AttendanceDay } from "./AttendanceDay";
import { WorkerDayHeader } from "./WorkerDayHeader";
import { effectiveDayPrice, cardAccentCls, inputCls } from "./dayCards";
import { useCycleDetail } from "../CycleDetailContext";
import { useWorkerEdit } from "./WorkerEditContext";

export function OvertimeDay({ d }) {
  "use no memo";
  const { activeLabor, dayPrices, readOnly, upsertOvertimeDayWorkday } = useCycleDetail();
  const {
    clearDraft,
    displayValue,
    drafts,
    row,
    runWithSaving,
    savingFields,
    setBonusDate,
    setDraft,
    workerRut,
  } = useWorkerEdit();
  // Desglose del monto de tratoHE (base/HE/bonos/extras) como texto siempre
  // visible. En escritorio es el tooltip de `buildBreakdown` (CycleDetail.jsx),
  // que vive dentro del useMemo de columnas de la grilla y no se puede reusar.
  const overtimeDayBreakdown = (d, cfg, m, s, x) => {
    const qty = Number(row[`${d}__qty`]) || 0;
    const hours = Number(row[`${d}__he`]) || 0;
    const overtimeRate = activeLabor.overtimeRate ?? DEFAULT_OVERTIME_RATE;
    const drivingBonus = activeLabor.bonusManejo ?? DEFAULT_BONUS_MANEJO;
    const bonusSupervision = activeLabor.bonusSupervision ?? DEFAULT_BONUS_SUPERVISION;
    const parts = [];
    if (cfg.mode === "overtimeOnly") {
      parts.push("Solo HE");
    } else if (qty > 0) {
      parts.push(`Base ${fmtCurrency(qty)}`);
    }
    if (hours > 0) parts.push(`HE ${hours}h (${fmtCurrency(hours * overtimeRate)})`);
    if (m) parts.push(`Manejo ${fmtCurrency(drivingBonus)}`);
    if (s) parts.push(`Supervisión ${fmtCurrency(bonusSupervision)}`);
    if (x !== 0) parts.push(`Extras ${fmtCurrency(x)}`);
    return parts;
  };
  if (row._monthly) return <AttendanceDay d={d} />;
  const cfg = getDaySingle(dayPrices, activeLabor.id, d, "normal");
  const suggested = effectiveDayPrice(activeLabor, cfg);
  const qtyField = `${d}__qty`;
  const qty = Number(row[qtyField]) || 0;
  const heField = `${d}__he`;
  const m = !!row[`${d}__m`];
  const s = !!row[`${d}__s`];
  const x = Number(row[`${d}__x`]) || 0;
  const breakdownParts = overtimeDayBreakdown(d, cfg, m, s, x);
  return (
    <div key={d} className={cardAccentCls(Number(row[`${d}__amt`]) > 0)}>
      <WorkerDayHeader d={d} amountField={`${d}__amt`} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex items-center gap-1.5 text-xs">
          Base
          <input
            type="text"
            inputMode="decimal"
            disabled={readOnly || cfg.mode === "overtimeOnly"}
            value={displayValue(qtyField)}
            placeholder={cfg.mode === "overtimeOnly" ? "solo HE" : String(suggested)}
            onChange={(e) => setDraft(qtyField, e.target.value)}
            onBlur={async () => {
              if (!(qtyField in drafts)) return;
              const v = parseAmount(drafts[qtyField]) || 0;
              await runWithSaving(qtyField, () => upsertOvertimeDayWorkday(activeLabor.id, d, workerRut, { qty: v }));
              clearDraft(qtyField);
            }}
            className={inputCls}
          />
          {!readOnly && cfg.mode !== "overtimeOnly" && !qty && !!suggested && drafts[qtyField] === undefined && (
            <button
              type="button"
              onClick={() => runWithSaving(qtyField, () => upsertOvertimeDayWorkday(activeLabor.id, d, workerRut, { qty: suggested }))}
              className="text-[10px] italic text-[var(--color-muted)] hover:text-[var(--color-accent)]"
            >
              usar {fmtCurrency(suggested)}
            </button>
          )}
          {savingFields[qtyField] && (
            <span className="text-[10px] font-semibold text-[var(--color-accent)] animate-pulse">guardando…</span>
          )}
        </label>
        <label className="flex items-center gap-1.5 text-xs">
          HE
          <input
            type="text"
            inputMode="decimal"
            disabled={readOnly}
            value={displayValue(heField)}
            onChange={(e) => setDraft(heField, e.target.value)}
            onBlur={async () => {
              if (!(heField in drafts)) return;
              const v = parseAmount(drafts[heField]) || 0;
              await runWithSaving(heField, () => upsertOvertimeDayWorkday(activeLabor.id, d, workerRut, { overtimeHours: v }));
              clearDraft(heField);
            }}
            className="w-16 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-sm outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
          />
          h
          {savingFields[heField] && (
            <span className="text-[10px] font-semibold text-[var(--color-accent)] animate-pulse">guardando…</span>
          )}
        </label>
        <button
          type="button"
          disabled={readOnly}
          onClick={() => setBonusDate(d)}
          className="ml-auto flex items-center gap-1 rounded-md border border-[var(--color-border)] px-2 py-1.5 text-xs hover:bg-[var(--color-accent-soft)]"
        >
          {m && (
            <span className="rounded bg-blue-100 px-1 text-[9px] font-medium text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">M</span>
          )}
          {s && (
            <span className="rounded bg-purple-100 px-1 text-[9px] font-medium text-purple-700 dark:bg-purple-900/40 dark:text-purple-300">
              S
            </span>
          )}
          {x !== 0 && (
            <span className="rounded bg-amber-100 px-1 text-[9px] font-medium text-amber-700 dark:bg-amber-900/40 dark:text-amber-300">+</span>
          )}
          {!m && !s && !x && <span className="text-[var(--color-muted)]">Bonos</span>}
        </button>
      </div>
      {breakdownParts.length > 0 && (
        <div className="mt-2 border-t border-[var(--color-border)] pt-2 text-[10px] tabular-nums text-[var(--color-muted)]">
          {breakdownParts.join(" · ")} = {fmtCurrency(Number(row[`${d}__amt`]) || 0)}
        </div>
      )}
    </div>
  );
}
