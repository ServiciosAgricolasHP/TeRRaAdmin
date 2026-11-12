import { Link } from "react-router-dom";
import { fmtCurrency } from "../../../utils/format";
import { fmtDayShortEs } from "../helpers";

// Los ciclos de la nómina, con sus labores y lo que paga cada una. Se cambian
// con "✎ Editar ciclos" (`EditCyclesModal`).
// "💸 Pagos del ciclo" abre lo que le pagó cada nómina a cada persona en ese
// ciclo (`onShowPayments`).
export function PayrollCyclesSection({ cycleBreakdown, cycleDetails, editMode, isCollapsed, onShowPayments, toggleSection }) {
  return (
    <section>
      <div className="mb-2 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={() => toggleSection("cycles")}
          className="flex flex-1 items-center gap-2 text-left text-sm font-semibold hover:text-[var(--color-accent)]"
        >
          <span className="text-[var(--color-muted)]">{isCollapsed("cycles") ? "▸" : "▾"}</span>
          <span>Ciclos de esta nómina</span>
          <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[11px] font-normal tabular-nums text-[var(--color-muted)]">
            {cycleDetails.length}
          </span>
        </button>
      </div>
      {!isCollapsed("cycles") && (
        <>
          {editMode && (
            <p className="mb-1.5 text-[11px] text-[var(--color-muted)]">
              Para agregar o sacar ciclos o labores, usa "✎ Editar ciclos": se cambian en un solo paso y la nómina se
              recalcula, con sus anticipos.
            </p>
          )}
          <ul className="grid gap-2 text-sm">
            {cycleBreakdown.map((c) => (
              <li
                key={c.id}
                className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
              >
                <div className="flex items-start gap-2.5 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium [overflow-wrap:anywhere]">{c.label}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-[var(--color-muted)]">
                      {c.faenaName && (
                        <span>
                          {c.faenaName}
                          {c.subfaenaName ? ` / ${c.subfaenaName}` : ""}
                        </span>
                      )}
                      {(c.firstDay || c.lastDay) && (
                        <span className="tabular-nums">
                          📅 {fmtDayShortEs(c.firstDay) || "?"}
                          {c.lastDay && c.firstDay !== c.lastDay ? ` → ${fmtDayShortEs(c.lastDay)}` : ""}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 flex-col items-end gap-1">
                    <span className="font-semibold tabular-nums">{fmtCurrency(c.amount)}</span>
                    <button
                      type="button"
                      onClick={() => onShowPayments(c)}
                      title="A quién se le pagó este ciclo, por labor, en todas sus nóminas"
                      className="min-h-9 whitespace-nowrap rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-3 text-sm font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
                    >
                      💸 Pagos del ciclo
                    </button>
                    <Link
                      to={`/cycles/${c.id}`}
                      title="Abrir el ciclo (Ctrl+clic: en otra pestaña)"
                      className="whitespace-nowrap text-xs text-[var(--color-accent)] hover:underline"
                    >
                      Abrir ciclo ↗
                    </Link>
                  </div>
                </div>
                {c.labors.length > 0 && (editMode || c.labors.length > 1 || Array.isArray(c.laborIds)) && (
                  <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-3">
                    {c.labors.map((l) => (
                      <li key={l.id} className="flex min-h-8 items-center gap-2 text-xs">
                        <span className="min-w-0 flex-1 truncate">
                          {l.name}
                          {!l.inScope && (
                            <span
                              className="ml-1 text-[10px] text-[var(--color-muted)]"
                              title="Recalcular no trae más de esta labor: solo están los días que se agregaron a mano."
                            >
                              · días agregados a mano
                            </span>
                          )}
                        </span>
                        <span className="shrink-0 tabular-nums text-[var(--color-muted)]">
                          {l.jornadas > 0 ? `${l.people} pers. · ${l.jornadas} jorn.` : "sin jornadas"}
                        </span>
                        <span className="w-24 shrink-0 text-right tabular-nums">
                          {l.amount == null ? "—" : fmtCurrency(l.amount)}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
