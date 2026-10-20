import { useState, useEffect, useMemo } from "react";
import { cyclesService, jobsService } from "../../services";
import { countWorkdaysByCycle } from "../../services/countsService";
import { fmtNumber } from "../../utils/format";
import { ConsoleCard } from "./ConsoleCard";

// ============================================================
// Sección: workdays por ciclo (abiertos; los cerrados, opcionales)
// ============================================================
export function WorkdaysByCycleSection() {
  const [cycles, setCycles] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [counts, setCounts] = useState({}); // cycleId → count | "err" | "..."
  const [includeClosed, setIncludeClosed] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const [c, f] = await Promise.all([
          cyclesService.list({ cache: true, ttl: 60_000 }),
          jobsService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        ]);
        setCycles(c);
        setJobs(f);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const visibleCycles = useMemo(() => {
    const list = includeClosed ? cycles : cycles.filter((c) => c.status !== "closed");
    const jobName = (id) => jobs.find((f) => f.id === id)?.name || "—";
    return list
      .map((c) => ({ ...c, jobName: jobName(c.faenaId) }))
      .sort((a, b) =>
        String(a.jobName).localeCompare(b.jobName) ||
        String(a.label || "").localeCompare(b.label || ""),
      );
  }, [cycles, jobs, includeClosed]);

  const runAll = async () => {
    setRunning(true);
    try {
      for (const c of visibleCycles) {
        setCounts((prev) => ({ ...prev, [c.id]: "..." }));
        try {
          const n = await countWorkdaysByCycle(c.id);
          setCounts((prev) => ({ ...prev, [c.id]: n }));
        } catch {
          setCounts((prev) => ({ ...prev, [c.id]: "err" }));
        }
      }
    } finally {
      setRunning(false);
    }
  };

  const numericCounts = Object.values(counts).filter((v) => typeof v === "number");
  const total = numericCounts.reduce((s, n) => s + n, 0);

  return (
    <ConsoleCard id="workdays-por-ciclo" title="Jornadas por ciclo" 
      description={<>1 lectura por ciclo. Útil para ver dónde está concentrada la data.</>} 
      actions={<><div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-xs">
            <input
              type="checkbox"
              checked={includeClosed}
              onChange={(e) => setIncludeClosed(e.target.checked)}
            />
            incluir cerrados
          </label>
          <button
            type="button"
            onClick={runAll}
            disabled={running || loading || visibleCycles.length === 0}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-50"
          >
            {running
              ? "Ejecutando…"
              : `▶ Contar ${visibleCycles.length} ciclo${visibleCycles.length === 1 ? "" : "s"} (~${visibleCycles.length} lecturas)`}
          </button>
        </div></>}>

      {loading ? (
        <p className="text-xs text-[var(--color-muted)]">Cargando ciclos…</p>
      ) : (
        <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="bg-[var(--color-surface-2)] text-left text-xs text-[var(--color-muted)]">
              <tr>
                <th className="px-3 py-2">Faena</th>
                <th className="px-3 py-2">Ciclo</th>
                <th className="px-3 py-2">Estado</th>
                <th className="px-3 py-2 text-right">Jornadas</th>
              </tr>
            </thead>
            <tbody>
              {visibleCycles.map((c) => {
                const v = counts[c.id];
                return (
                  <tr key={c.id} className="border-t border-[var(--color-border)]">
                    <td className="px-3 py-1.5 text-xs text-[var(--color-muted)]">{c.jobName}</td>
                    <td className="px-3 py-1.5">{c.label}</td>
                    <td className="px-3 py-1.5 text-xs">
                      {c.status === "closed" ? (
                        <span className="text-[var(--color-muted)]">cerrado</span>
                      ) : (
                        <span className="text-[var(--color-accent)]">abierto</span>
                      )}
                    </td>
                    <td className="px-3 py-1.5 text-right tabular-nums">
                      {v === "..." ? (
                        <span className="text-[var(--color-muted)]">…</span>
                      ) : v === "err" ? (
                        <span className="text-[var(--color-danger)]">err</span>
                      ) : typeof v === "number" ? (
                        <span className="font-semibold">{fmtNumber(v)}</span>
                      ) : (
                        <span className="text-[var(--color-muted)]">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {numericCounts.length > 0 && (
        <p className="mt-3 text-xs text-[var(--color-muted)]">
          Suma de los {numericCounts.length} ciclo
          {numericCounts.length === 1 ? "" : "s"} contados:{" "}
          <span className="font-semibold tabular-nums text-[var(--color-text)]">
            {fmtNumber(total)}
          </span>{" "}
          workdays
        </p>
      )}
    </ConsoleCard>
  );
}
