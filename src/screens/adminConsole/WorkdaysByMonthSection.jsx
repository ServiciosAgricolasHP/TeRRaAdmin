import { useState, useMemo, useEffect } from "react";
import { countWorkdaysInRange } from "../../services/countsService";
import { fmtNumber } from "../../utils/format";
import { ConsoleCard } from "./ConsoleCard";

const monthRange = (y, m) => {
  // m: 1..12
  const start = `${y}-${String(m).padStart(2, "0")}-01`;
  const lastDay = new Date(y, m, 0).getDate();
  const end = `${y}-${String(m).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
};

// ============================================================
// Sección: workdays por mes del año elegido
// ============================================================
export function WorkdaysByMonthSection() {
  const currentYear = new Date().getFullYear();
  const [year, setYear] = useState(currentYear);
  const [rows, setRows] = useState([]); // [{ month, start, end, count, busy, error }]
  const [running, setRunning] = useState(false);

  const months = useMemo(
    () => [
      "Ene", "Feb", "Mar", "Abr", "May", "Jun",
      "Jul", "Ago", "Sep", "Oct", "Nov", "Dic",
    ],
    [],
  );

  const reset = () => {
    setRows(
      Array.from({ length: 12 }, (_, i) => {
        const { start, end } = monthRange(year, i + 1);
        return { month: i + 1, start, end, count: null };
      }),
    );
  };

  useEffect(() => {
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [year]);

  const runYear = async () => {
    setRunning(true);
    try {
      for (let i = 0; i < 12; i++) {
        const { start, end } = monthRange(year, i + 1);
        setRows((prev) => prev.map((r, idx) => (idx === i ? { ...r, busy: true } : r)));
        try {
          const count = await countWorkdaysInRange(start, end);
          setRows((prev) =>
            prev.map((r, idx) => (idx === i ? { ...r, count, busy: false } : r)),
          );
        } catch (err) {
          setRows((prev) =>
            prev.map((r, idx) =>
              idx === i ? { ...r, error: err.message || String(err), busy: false } : r,
            ),
          );
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const total = rows.reduce((s, r) => s + (r.count || 0), 0);
  const totalRuns = rows.filter((r) => r.count != null).length;

  return (
    <ConsoleCard id="workdays-por-mes" title="Jornadas por mes" 
      description={<>12 consultas, ~12 lecturas en total. Útil para ver estacionalidad.</>} 
      actions={<><div className="flex items-center gap-2">
          <label className="text-xs text-[var(--color-muted)]">Año</label>
          <input
            type="number"
            value={year}
            onChange={(e) => setYear(Number(e.target.value) || currentYear)}
            className="w-20 rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
          />
          <button
            type="button"
            onClick={runYear}
            disabled={running}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {running ? "Ejecutando…" : "▶ Contar año (~12 lecturas)"}
          </button>
        </div></>}>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
        {rows.map((r, i) => (
          <div
            key={r.month}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2"
          >
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
              {months[i]} {year}
            </div>
            <div className="mt-1 text-lg font-semibold tabular-nums">
              {r.busy ? "…" : r.error ? "err" : r.count != null ? fmtNumber(r.count) : "—"}
            </div>
          </div>
        ))}
      </div>
      {totalRuns > 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Total año:{" "}
          <span className="font-semibold tabular-nums text-[var(--color-text)]">
            {fmtNumber(total)}
          </span>{" "}
          workdays
        </p>
      )}
    </ConsoleCard>
  );
}
