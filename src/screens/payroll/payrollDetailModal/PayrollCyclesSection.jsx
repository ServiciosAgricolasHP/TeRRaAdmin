import { Link } from "react-router-dom";
import { fmtCurrency } from "../../../utils/format";
import { fmtDayShortEs } from "../helpers";

// Los ciclos de la nómina, con sus labores y lo que paga cada una. En
// "✂ Editar contenido" se destildan ciclos o labores para sacarlos con
// Recalcular.
export function PayrollCyclesSection({ cycleBreakdown, cycleDetails, edit, isCollapsed, recalc, toggleSection }) {
  "use no memo";
  const { activeRemoval, recalcBusy, removalSummary, setRemoval, startRecalc, toggleCycleRemoval, toggleLaborRemoval } = recalc;
  const { editBusy, editMode } = edit;
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
              Destilda los ciclos o labores que quieras sacar y aprieta "Recalcular sin esto". Quien se queda sin
              producción sale de la nómina, y lo que ya no alcance de sus anticipos vuelve a quedar pendiente.
            </p>
          )}
          <ul className="grid gap-2 text-sm">
            {cycleBreakdown.map((c) => {
              const r = activeRemoval.get(c.id);
              const cycleOut = r === true;
              const partial = r instanceof Set;
              const Head = editMode ? "label" : "div";
              return (
                <li
                  key={c.id}
                  className={`overflow-hidden rounded-lg border bg-[var(--color-surface)] shadow-sm ${
                    r ? "border-[var(--color-danger)]" : "border-[var(--color-border)]"
                  }`}
                >
                  <Head className={`flex items-start gap-2.5 px-3 py-2.5 ${editMode ? "cursor-pointer" : ""}`}>
                    {editMode && (
                      <input
                        type="checkbox"
                        checked={!cycleOut}
                        ref={(el) => {
                          if (el) el.indeterminate = partial;
                        }}
                        onChange={() => toggleCycleRemoval(c.id)}
                        disabled={editBusy || recalcBusy}
                        className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                      />
                    )}
                    <div className={`min-w-0 flex-1 ${cycleOut ? "line-through opacity-60" : ""}`}>
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
                      <span className={`font-semibold tabular-nums ${cycleOut ? "line-through opacity-60" : ""}`}>
                        {fmtCurrency(c.amount)}
                      </span>
                      <Link
                        to={`/cycles/${c.id}`}
                        title="Abrir el ciclo (Ctrl+clic: en otra pestaña)"
                        className="whitespace-nowrap text-xs text-[var(--color-accent)] hover:underline"
                      >
                        Abrir ciclo ↗
                      </Link>
                    </div>
                  </Head>
                  {c.labors.length > 0 && (editMode || c.labors.length > 1 || Array.isArray(c.laborIds)) && (
                    <ul className="divide-y divide-[var(--color-border)] border-t border-[var(--color-border)] bg-[var(--color-surface-2)] px-3">
                      {c.labors.map((l) => {
                        const out = cycleOut || (partial && r.has(l.id));
                        const Row = editMode ? "label" : "div";
                        return (
                          <li key={l.id}>
                            <Row className={`flex min-h-8 items-center gap-2 text-xs ${editMode ? "cursor-pointer" : ""}`}>
                              {editMode && (
                                <input
                                  type="checkbox"
                                  checked={!out}
                                  onChange={() => toggleLaborRemoval(c, l.id)}
                                  disabled={editBusy || recalcBusy}
                                  className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                                />
                              )}
                              <span className={`min-w-0 flex-1 truncate ${out ? "line-through text-[var(--color-muted)]" : ""}`}>
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
                              <span className={`w-24 shrink-0 text-right tabular-nums ${out ? "line-through text-[var(--color-muted)]" : ""}`}>
                                {l.amount == null ? "—" : fmtCurrency(l.amount)}
                              </span>
                            </Row>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
          {editMode && activeRemoval.size > 0 && (
            <div className="mt-2 flex flex-wrap items-center gap-2 rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2 text-xs">
              <div className="min-w-0 flex-1">
                <div>
                  Sacas{" "}
                  {[
                    removalSummary.cyclesOut ? `${removalSummary.cyclesOut} ciclo${removalSummary.cyclesOut === 1 ? "" : "s"}` : "",
                    removalSummary.laborsOut ? `${removalSummary.laborsOut} labor${removalSummary.laborsOut === 1 ? "" : "es"}` : "",
                  ]
                    .filter(Boolean)
                    .join(" y ")}{" "}
                  · <b className="tabular-nums">{removalSummary.unknown ? "más de " : ""}{fmtCurrency(removalSummary.amount)}</b> de bruto
                </div>
                {removalSummary.allOut && (
                  <div className="mt-0.5 font-medium text-[var(--color-danger)]">
                    Eso deja la nómina vacía: para sacar todo, elimina la nómina.
                  </div>
                )}
              </div>
              <button
                type="button"
                onClick={() => setRemoval(new Map())}
                disabled={recalcBusy}
                className="min-h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 disabled:opacity-50"
              >
                Deshacer
              </button>
              <button
                type="button"
                onClick={startRecalc}
                disabled={recalcBusy || removalSummary.allOut}
                className="min-h-8 rounded-md bg-[var(--color-accent)] px-2.5 py-1 font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
              >
                {recalcBusy ? "Comparando…" : "🔄 Recalcular sin esto"}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  );
}
