// El buscador del resumen, fijo entre el encabezado y el cuerpo del detalle:
// filtra la tabla del resumen por faena, subfaena, ciclo o labor
// (`useSummaryTable`). Al escribir abre el resumen si estaba plegado
// (`onStart`). Dice cuántas filas quedan de cuántas.
export function SummarySearchBar({ table, onStart }) {
  const { searching, summarySearch, setSummarySearch, activeSummary, allRowCount } = table;
  const shown = activeSummary?.rows.length || 0;
  return (
    <div className="shrink-0 border-b border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 sm:px-5 sm:py-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full sm:w-auto sm:min-w-[260px] sm:flex-1">
          <span className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-[var(--color-muted)]">🔍</span>
          <input
            type="search"
            value={summarySearch}
            onChange={(e) => {
              if (!searching && e.target.value.trim()) onStart?.();
              setSummarySearch(e.target.value);
            }}
            onKeyDown={(e) => {
              // Escape borra lo escrito; sin nada escrito, cierra el detalle.
              if (e.key !== "Escape" || !summarySearch) return;
              e.stopPropagation();
              setSummarySearch("");
            }}
            placeholder="Filtrar el resumen por faena, subfaena, ciclo o labor"
            aria-label="Filtrar el resumen"
            className="w-full rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] py-1.5 pl-8 pr-2.5 text-sm outline-none focus:border-[var(--color-accent)] focus:bg-[var(--color-surface)]"
          />
        </div>
        {searching && (
          <span className="ml-auto flex items-center gap-2 text-xs tabular-nums text-[var(--color-muted)]">
            <span>
              {shown} de {allRowCount} fila{allRowCount === 1 ? "" : "s"} del resumen
            </span>
            <button type="button" onClick={() => setSummarySearch("")} className="min-h-8 hover:text-[var(--color-danger)]">
              Limpiar
            </button>
          </span>
        )}
      </div>
    </div>
  );
}
