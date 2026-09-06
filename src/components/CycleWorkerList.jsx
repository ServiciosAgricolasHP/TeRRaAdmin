import { useMemo, useState } from "react";
import { formatRutForDisplay } from "../utils/rutUtils";
import { matchesSearchQuery } from "../utils/textSearch";

// Cuenta en cuántos días de `days` este trabajador tiene algo cargado en
// esta labor. El nombre de los campos varía por tipo de labor (combo/tier/
// etapa vs. monto directo), así que en vez de conocer la forma exacta,
// buscamos cualquier campo del día con `__amt` (cosecha/trato/tratoEtapas/
// tratoHE) o el campo plano del día mismo (normal) con valor > 0.
function countDaysWithData(row, days) {
  let count = 0;
  for (const d of days) {
    let has = Number(row[d]) > 0;
    if (!has) {
      for (const k in row) {
        if (k.startsWith(`${d}__`) && k.endsWith("__amt") && Number(row[k]) > 0) {
          has = true;
          break;
        }
      }
    }
    if (has) count++;
  }
  return count;
}

// Vista mobile de CycleDetail: reemplaza el AG-Grid (columnas = días) por
// una lista informativa de trabajadores con su total del ciclo. Evita el
// scroll horizontal infinito de decenas de columnas-día en pantallas chicas.
export default function CycleWorkerList({ rows, days, fmtCurrency, onSelectWorker }) {
  const [query, setQuery] = useState("");

  const sorted = useMemo(
    () => [...(rows || [])].sort((a, b) => String(a.name || "").localeCompare(String(b.name || ""))),
    [rows],
  );
  const filtered = useMemo(
    () => sorted.filter((row) => matchesSearchQuery(row.name, query)),
    [sorted, query],
  );

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
                className={`flex items-center justify-between gap-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] p-3 ${
                  clickable ? "cursor-pointer hover:bg-[var(--color-accent-soft)]" : ""
                }`}
              >
                <div className="min-w-0">
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
                  <div className="text-base font-semibold tabular-nums">
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
