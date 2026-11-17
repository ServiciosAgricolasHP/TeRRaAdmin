import { formatRutForDisplay } from "../../../utils/rutUtils";
import { fmtShortDate } from "../../../utils/format";
import { SEVERITY_ICON, worstOpenSeverity } from "../checkSeverity";

const btn =
  "min-h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]";

// Una revisión dentro del modal: su título, cuántas alertas tiene y, abierta,
// la explicación y una fila por persona con lo encontrado. `onReview` en
// `null` la deja solo para leer. `body`, si viene, reemplaza la lista de
// personas (asignar grupos).
export function CheckGroup({ check, alerts, open, onToggle, onReview, onShowInTable, body = null }) {
  const worst = worstOpenSeverity(alerts) || alerts[0]?.severity;
  const reviewedCount = alerts.filter((a) => a.review).length;
  const allReviewed = reviewedCount === alerts.length;
  const keys = alerts.map((a) => a.key);

  return (
    <div className="rounded-lg border border-[var(--color-border)]">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-[var(--color-surface-2)]"
      >
        <span aria-hidden="true">{allReviewed ? "✓" : SEVERITY_ICON[worst]}</span>
        <span className={`flex-1 font-medium ${allReviewed ? "text-[var(--color-muted)]" : ""}`}>{check.title}</span>
        <span className="whitespace-nowrap text-xs text-[var(--color-muted)]">
          {alerts.length} {alerts.length === 1 ? "persona" : "personas"}
          {reviewedCount > 0 && !allReviewed && ` · ${reviewedCount} revisada${reviewedCount === 1 ? "" : "s"}`}
        </span>
        <span aria-hidden="true" className="text-[var(--color-muted)]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-[var(--color-border)] px-3 py-2">
          <p className="text-xs text-[var(--color-muted)]">{check.explanation}</p>
          {(onShowInTable || onReview) && (
            <div className="flex flex-wrap gap-2">
              {onShowInTable && (
                <button type="button" className={btn} onClick={() => onShowInTable(check.id)}>
                  Ver en la tabla
                </button>
              )}
              {onReview && (
                <button type="button" className={btn} onClick={() => onReview(keys, !allReviewed)}>
                  {allReviewed ? "Desmarcar todas" : "✓ Marcar todas revisadas"}
                </button>
              )}
            </div>
          )}
          {body || (
          <ul className="divide-y divide-[var(--color-border)]">
            {alerts.map((a) => (
              <li key={a.key} className={`flex items-start gap-3 py-2 ${a.review ? "opacity-60" : ""}`}>
                <span aria-hidden="true" className="pt-0.5">{SEVERITY_ICON[a.severity]}</span>
                <div className="min-w-0 flex-1 text-sm">
                  <div className="font-medium">
                    {a.name || "(sin nombre)"} <span className="font-mono text-xs font-normal text-[var(--color-muted)]">{formatRutForDisplay(a.rut)}</span>
                  </div>
                  <ul className="mt-0.5 space-y-0.5 text-xs text-[var(--color-muted)]">
                    {a.lines.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                  {a.review && (
                    <div className="mt-0.5 text-[11px] text-[var(--color-muted)]">
                      ✓ Revisada{a.review.byName ? ` por ${a.review.byName}` : ""}
                      {a.review.at ? `, ${fmtShortDate(a.review.at)}` : ""}
                    </div>
                  )}
                </div>
                {onReview && (
                  <label className="flex min-h-8 shrink-0 cursor-pointer items-center gap-1.5 text-xs">
                    <input type="checkbox" checked={!!a.review} onChange={(e) => onReview([a.key], e.target.checked)} />
                    Revisada
                  </label>
                )}
              </li>
            ))}
          </ul>
          )}
        </div>
      )}
    </div>
  );
}
