import { fmtNumber } from "../utils/format";
import { pageWindow } from "../utils/pagination";

const btnCls = "min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 hover:bg-[var(--color-accent-soft)] disabled:opacity-40";

// La paginación de una lista (`usePagination`, hooks/): el rango que se ve
// ("Mostrando 51–100 de 1.183") y los números de página con ventana
// (‹ 1 … 4 5 6 … 24 ›). Con una sola página, solo el rango.
export default function Pager({ page, pageCount, pageSize, total, onPage, className = "" }) {
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 text-xs ${className}`}>
      <span className="text-[var(--color-muted)]">
        Mostrando {fmtNumber(from)}–{fmtNumber(to)} de {fmtNumber(total)}
      </span>
      {pageCount > 1 && (
        <nav aria-label="Páginas" className="flex flex-wrap items-center gap-1">
          <button type="button" onClick={() => onPage(page - 1)} disabled={page <= 1} aria-label="Página anterior" className={btnCls}>
            ‹
          </button>
          {pageWindow(pageCount, page).map((n, i) =>
            n === "…" ? (
              <span key={`gap_${i}`} className="px-1 text-[var(--color-muted)]">…</span>
            ) : (
              <button
                key={n}
                type="button"
                onClick={() => onPage(n)}
                aria-current={n === page ? "page" : undefined}
                className={`min-h-[32px] min-w-[32px] rounded-md border px-2 py-1 tabular-nums ${
                  n === page
                    ? "border-[var(--color-accent)] bg-[var(--color-accent)] font-semibold text-[var(--color-accent-fg)]"
                    : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
                }`}
              >
                {n}
              </button>
            ),
          )}
          <button type="button" onClick={() => onPage(page + 1)} disabled={page >= pageCount} aria-label="Página siguiente" className={btnCls}>
            ›
          </button>
        </nav>
      )}
    </div>
  );
}
