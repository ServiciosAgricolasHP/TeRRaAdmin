import { useMemo, useState } from "react";
import { formatRutForDisplay } from "../utils/rutUtils";
import { matchesSearchQuery } from "../utils/textSearch";
import { initials } from "../utils/nameUtils";
import { dayHasData } from "../utils/cycleRowUtils";

function countDaysWithData(row, days) {
  let count = 0;
  for (const d of days) {
    if (dayHasData(row, d)) count++;
  }
  return count;
}

// Vista mobile de CycleDetail: reemplaza el AG-Grid (columnas = días) por
// una lista informativa de trabajadores con su total del ciclo. Evita el
// scroll horizontal infinito de decenas de columnas-día en pantallas chicas.
export default function CycleWorkerList({ rows, days, fmtCurrency, onSelectWorker, onlyWithProduction }) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => [...(rows || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [rows],
  );
  // Igual que en el grid de escritorio: el toggle "solo con producción" se
  // pausa solo mientras el usuario está buscando algo puntual acá abajo, para
  // que encontrar a alguien no dependa de que tenga plata este ciclo.
  const filtered = useMemo(() => {
    const byName = sorted.filter((row) => matchesSearchQuery(row.name, query));
    if (!onlyWithProduction || query.trim()) return byName;
    return byName.filter((row) => Number(row.total) > 0);
  }, [sorted, query, onlyWithProduction]);

  if (sorted.length === 0) {
    return (
      <div
        className="flex h-full items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]"
        style={{ minHeight: 200 }}
      >
        Agrega trabajadores para empezar.
      </div>
    );
  }

  // `minHeight` explícito: el padre es un flex column con `min-h-0 flex-1`
  // (para que el AG-Grid pueda colapsar/scrollear internamente en vez de
  // empujar el layout). Sin un piso propio, esta lista podía quedar con
  // altura 0 y renderizarse invisible cuando el resto del toolbar (barra de
  // precios expandida, etc.) ya ocupaba casi todo el viewport — el grid
  // nunca sufría esto porque ya traía su propio `style={{ minHeight: 400 }}`.
  return (
    <div className="flex h-full flex-col" style={{ minHeight: 400 }}>
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="🔍 Buscar por nombre..."
        className="mb-2 w-full shrink-0 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
      />
      <div className="flex-1 space-y-2 overflow-y-auto pb-2">
        {filtered.length === 0 ? (
          <div className="flex items-center justify-center py-8 text-sm text-[var(--color-muted)]">
            Sin coincidencias.
          </div>
        ) : (
          filtered.map((row) => {
            const clickable = !!onSelectWorker;
            const daysWithData = days ? countDaysWithData(row, days) : null;
            return (
              <div
                key={row.rut}
                onClick={clickable ? () => onSelectWorker(row.rut) : undefined}
                className={`flex items-center gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3.5 ${
                  clickable ? "cursor-pointer hover:bg-[var(--color-accent-soft)]" : ""
                }`}
              >
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent-soft)] text-sm font-semibold text-[var(--color-accent)]">
                  {initials(row.name)}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate font-medium">{row.name}</div>
                  <div className="font-mono text-xs text-[var(--color-muted)]">
                    {formatRutForDisplay(row.rut) || row.rut}
                  </div>
                  {(row._isTemp || row._isOrphan || row._monthly) && (
                    <div className="mt-0.5 flex flex-wrap gap-1 text-[10px]">
                      {row._isTemp && (
                        <span className="rounded bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[var(--color-warning)]">
                          Temporal
                        </span>
                      )}
                      {row._isOrphan && (
                        <span className="rounded bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[var(--color-danger)]">
                          Fuera del listado
                        </span>
                      )}
                      {row._monthly && (
                        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 text-emerald-700 dark:text-emerald-300">
                          Mensual
                        </span>
                      )}
                    </div>
                  )}
                </div>
                <div className="shrink-0 text-right">
                  <div className="text-base font-semibold tabular-nums text-[var(--color-accent)]">
                    {fmtCurrency(row.total || 0)}
                  </div>
                  {daysWithData !== null && (
                    <div className="text-[10px] text-[var(--color-muted)]">
                      {daysWithData} día{daysWithData === 1 ? "" : "s"} con producción
                    </div>
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
