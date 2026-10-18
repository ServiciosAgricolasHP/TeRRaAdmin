import { useState } from "react";
import { localIsoDate } from "../../utils/dates";
import { countWorkdaysInRange } from "../../services/countsService";
import { fmtNumber } from "../../utils/format";
import { ConsoleCard } from "./ConsoleCard";

// ============================================================
// Sección: workdays en un rango de fechas
// ============================================================
export function WorkdaysByRangeSection() {
  const today = localIsoDate();
  const monthStart = today.slice(0, 8) + "01";
  const [from, setFrom] = useState(monthStart);
  const [to, setTo] = useState(today);
  const [count, setCount] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const run = async () => {
    if (!from || !to) {
      setError("Completa ambas fechas");
      return;
    }
    setError("");
    setBusy(true);
    try {
      const c = await countWorkdaysInRange(from, to);
      setCount(c);
    } catch (err) {
      setError(err.message || String(err));
      setCount(null);
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConsoleCard id="workdays-por-rango-custom" title="Jornadas por rango de fechas">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-[var(--color-muted)]">Desde</label>
        <input
          type="date"
          value={from}
          onChange={(e) => setFrom(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
        />
        <label className="text-xs text-[var(--color-muted)]">Hasta</label>
        <input
          type="date"
          value={to}
          onChange={(e) => setTo(e.target.value)}
          className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
        />
        <button
          type="button"
          onClick={run}
          disabled={busy}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
        >
          {busy ? "Ejecutando…" : "▶ Contar (~1 lectura)"}
        </button>
        {count != null && (
          <span className="ml-auto text-sm">
            <span className="text-[var(--color-muted)]">Resultado: </span>
            <span className="font-semibold tabular-nums">{fmtNumber(count)}</span>{" "}
            workdays
          </span>
        )}
      </div>
      {error && (
        <p className="mt-2 text-xs text-[var(--color-danger)]">{error}</p>
      )}
    </ConsoleCard>
  );
}
