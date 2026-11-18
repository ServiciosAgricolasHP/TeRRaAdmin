import { useState } from "react";
import { formatRutForDisplay } from "../../../utils/rutUtils";
import { fmtShortDate } from "../../../utils/format";
import { SEVERITY_ICON, worstOpenSeverity } from "../checkSeverity";

const btn =
  "min-h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50";

// Una revisión dentro del modal: su título, cuántas alertas tiene y, abierta,
// la explicación y una fila por persona con lo encontrado. Las revisadas van
// al final, plegadas en "Revisadas". `onReview` en `null` la deja solo para
// leer. `onCopy(alerts)` copia lo que falta revisar. `actions` se suma a los
// botones, y `body`, si viene, reemplaza la lista de las que faltan (asignar
// grupos).
export function CheckGroup({ check, alerts, open, onToggle, onReview, onShowInTable, onCopy, actions = null, body = null }) {
  const [showReviewed, setShowReviewed] = useState(false);
  const pending = alerts.filter((a) => !a.review);
  const reviewed = alerts.filter((a) => a.review);
  const worst = worstOpenSeverity(alerts) || alerts[0]?.severity;
  const allReviewed = pending.length === 0;

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
          {reviewed.length > 0 && !allReviewed && ` · ${reviewed.length} revisada${reviewed.length === 1 ? "" : "s"}`}
        </span>
        <span aria-hidden="true" className="text-[var(--color-muted)]">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="space-y-2 border-t border-[var(--color-border)] px-3 py-2">
          <p className="text-xs text-[var(--color-muted)]">{check.explanation}</p>
          <div className="flex flex-wrap gap-2">
            {onShowInTable && (
              <button type="button" className={btn} onClick={() => onShowInTable(check.id)}>
                Ver en la tabla
              </button>
            )}
            {onReview &&
              (allReviewed ? (
                <button type="button" className={btn} onClick={() => onReview(alerts.map((a) => a.key), false)}>
                  Desmarcar todas
                </button>
              ) : (
                <button type="button" className={btn} onClick={() => onReview(pending.map((a) => a.key), true)}>
                  ✓ Marcar todas revisadas
                </button>
              ))}
            {onCopy && (
              <button type="button" className={btn} disabled={allReviewed} onClick={() => onCopy(alerts)} title="Copiar las que faltan revisar, para avisar">
                📋 Copiar
              </button>
            )}
            {actions}
          </div>
          {body || (pending.length > 0 && <AlertList alerts={pending} onReview={onReview} />)}
          {reviewed.length > 0 && (
            <div className="border-t border-[var(--color-border)] pt-1">
              <button
                type="button"
                onClick={() => setShowReviewed((v) => !v)}
                aria-expanded={showReviewed}
                className="flex min-h-8 w-full items-center gap-1.5 text-left text-xs text-[var(--color-muted)] hover:text-[var(--color-text)]"
              >
                <span aria-hidden="true">{showReviewed ? "▾" : "▸"}</span>✓ Revisadas ({reviewed.length})
              </button>
              {showReviewed && <AlertList alerts={reviewed} onReview={onReview} dim />}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// Una fila por persona, con lo encontrado, quién la revisó y su casilla.
function AlertList({ alerts, onReview, dim = false }) {
  return (
    <ul className={`divide-y divide-[var(--color-border)] ${dim ? "opacity-60" : ""}`}>
      {alerts.map((a) => (
        <li key={a.key} className="flex items-start gap-3 py-2">
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
  );
}
