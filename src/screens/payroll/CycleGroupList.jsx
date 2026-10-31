import { fmtCurrency } from "../../utils/format";
import { pendingOfChosenLabors } from "../../utils/payrollCycles";
import { PAY_SPLIT_HINT } from "./helpers";

// Los ciclos para elegir, por faena: lo pendiente de cada uno, lo pagado y lo
// que está en una nómina sin pagar y, al marcarlo, sus labores con lo
// pendiente de cada una. La usan Generar y "+ Agregar ciclo" del detalle de
// una nómina; `cycleNote` agrega una línea bajo un ciclo.
export function CycleGroupList({
  visibleGroups,
  emptyCount,
  search,
  onShowEmpty,
  toggle,
  selectedLaborsByCycle,
  toggleLaborInCycle,
  takenSplit = {},
  payrollNameOf = () => "",
  cycleNote = () => null,
}) {
  // "Todos / ninguno" por faena: solo opera sobre los ciclos que están a la
  // vista, así el botón nunca marca algo que el usuario no ve.
  const toggleGroup = (rows) => {
    const selectable = rows.filter((r) => r.hasPending || r.isSelected);
    const allOn = selectable.length > 0 && selectable.every((r) => r.isSelected);
    for (const r of selectable) {
      if (allOn === r.isSelected) toggle(r.cycle.id);
    }
  };

  return (
    <div className="flex-1 space-y-3 overflow-auto">
      {visibleGroups.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-muted)]">
          {search ? "Ningún ciclo coincide con la búsqueda." : "No hay ciclos con pendientes por pagar."}
          {!search && emptyCount > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={onShowEmpty}
                className="text-[var(--color-accent)] hover:underline"
              >
                Mostrar los {emptyCount} ciclo(s) sin pendientes
              </button>
            </div>
          )}
        </div>
      ) : (
        visibleGroups.map(({ faena, rows, groupPending, groupBank, groupCash }) => {
          const selectable = rows.filter((r) => r.hasPending || r.isSelected);
          const allOn = selectable.length > 0 && selectable.every((r) => r.isSelected);
          return (
            <div
              key={faena.id}
              className="overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm"
            >
              <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 sm:px-4">
                <span className="text-sm font-semibold">{faena.name}</span>
                <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">
                  {rows.length} ciclo{rows.length === 1 ? "" : "s"}
                </span>
                <div className="ml-auto flex flex-wrap items-center gap-2">
                  {groupPending > 0 && (
                    <span className="text-[11px] tabular-nums text-[var(--color-muted)]" title={PAY_SPLIT_HINT}>
                      🏦 {fmtCurrency(groupBank)} · 💵 {fmtCurrency(groupCash)}
                    </span>
                  )}
                  {groupPending > 0 && (
                    <span className="text-xs font-semibold tabular-nums text-[var(--color-warning)]">
                      {fmtCurrency(groupPending)}
                    </span>
                  )}
                  {selectable.length > 1 && (
                    <button
                      type="button"
                      onClick={() => toggleGroup(rows)}
                      className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                    >
                      {allOn ? "Ninguno" : "Todos"}
                    </button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {rows.map(({ cycle: c, stat, sub, isSelected, hasPending }) => {
                  const periodLabel = (stat.firstDay || stat.lastDay)
                    ? (stat.firstDay === stat.lastDay
                        ? stat.firstDay
                        : `${stat.firstDay || "?"} → ${stat.lastDay || "?"}`)
                    : "";
                  const labors = c.labors || [];
                  // Sin entrada = todas: un ciclo que quedó marcado de otra
                  // sesión (ver `toggleCycle`).
                  const selectedLabors = selectedLaborsByCycle?.get(c.id) ?? new Set(labors.map((l) => l.id));
                  const allLaborsOn = labors.length > 0 && labors.every((l) => selectedLabors.has(l.id));
                  const noneOn = isSelected && labors.length > 0 && selectedLabors.size === 0;
                  // Con labores destildadas, el monto del ciclo es lo de las elegidas.
                  const partialLabors = isSelected && labors.length > 1 && !allLaborsOn;
                  const splitTitle = hasPending
                    ? [
                        `Estimado — 🏦 Transferencia ${fmtCurrency(stat.unpaidBank || 0)} · 💵 Efectivo ${fmtCurrency(stat.unpaidCash || 0)}`,
                        (stat.unpaidUnknown || 0) > 0
                          ? `❓ Sin banco cargado ${fmtCurrency(stat.unpaidUnknown)}`
                          : "",
                        PAY_SPLIT_HINT,
                      ].filter(Boolean).join("\n")
                    : undefined;
                  // Estar en una nómina no es estar pagado: recién lo es cuando
                  // esa nómina se marca pagada.
                  const taken = takenSplit[c.id] || { paid: 0, inPayroll: 0, openPayrollIds: [] };
                  const note = cycleNote(c);
                  const inPayrollTitle = `En nómina${taken.openPayrollIds.length === 1 ? "" : "s"} que todavía no se marca${taken.openPayrollIds.length === 1 ? "" : "n"} pagada${taken.openPayrollIds.length === 1 ? "" : "s"}: ${taken.openPayrollIds.map((id) => payrollNameOf(id) || id).join(", ")}`;
                  return (
                    <div
                      key={c.id}
                      className={`relative ${isSelected ? "bg-[var(--color-accent-soft)]/40" : ""} ${
                        hasPending ? "" : "opacity-60"
                      }`}
                    >
                      {isSelected && (
                        <span className="pointer-events-none absolute inset-y-0 left-0 w-1 bg-[var(--color-accent)]" />
                      )}
                      <label className="flex cursor-pointer items-start gap-3 px-3 py-2.5 hover:bg-[var(--color-accent-soft)] sm:px-4">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggle(c.id)}
                          disabled={!hasPending && !isSelected}
                          className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                        />
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium">{c.label || c.id}</div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[var(--color-muted)]">
                            {sub && <span>{sub}</span>}
                            {periodLabel && (
                              <span className="tabular-nums" title="Primer y último día con producción del ciclo">
                                📅 {periodLabel}
                              </span>
                            )}
                            {taken.paid > 0 && (
                              <span className="tabular-nums" title="En nóminas ya marcadas como pagadas">
                                ✓ {fmtCurrency(taken.paid)} pagado
                              </span>
                            )}
                            {taken.inPayroll > 0 && (
                              <span className="tabular-nums text-[var(--color-accent)]" title={inPayrollTitle}>
                                🕓 {fmtCurrency(taken.inPayroll)} en nómina
                              </span>
                            )}
                          </div>
                          {note && <div className="mt-0.5 text-xs text-[var(--color-muted)]">{note}</div>}
                          {isSelected && labors.length > 0 && !allLaborsOn && (
                            <div className="mt-0.5 text-xs text-amber-700 dark:text-amber-400">
                              {noneOn
                                ? "⚠ Sin labores seleccionadas — no entra a la vista previa"
                                : `Pagar ${selectedLabors.size} de ${labors.length} labores`}
                            </div>
                          )}
                        </div>
                        <div className="shrink-0 text-right" title={splitTitle}>
                          {hasPending ? (
                            <>
                              <div className="text-sm font-semibold tabular-nums text-[var(--color-warning)]">
                                {fmtCurrency(partialLabors ? pendingOfChosenLabors(c, stat, selectedLaborsByCycle).unpaid : stat.unpaid)}
                              </div>
                              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                                {partialLabors ? `de ${fmtCurrency(stat.unpaid)}` : "pendiente"}
                              </div>
                            </>
                          ) : taken.inPayroll > 0 ? (
                            <span className="text-xs text-[var(--color-accent)]" title={inPayrollTitle}>En nómina</span>
                          ) : taken.paid > 0 ? (
                            <span className="text-xs text-[var(--color-muted)]">✓ Pagado</span>
                          ) : (
                            <span className="text-xs text-[var(--color-muted)]">Sin pendientes</span>
                          )}
                        </div>
                      </label>
                      {isSelected && labors.length > 1 && (
                        <div className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40 px-3 py-1.5 sm:px-4">
                          <div className="mb-0.5 text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                            Labores a pagar
                          </div>
                          <ul>
                            {labors.map((l) => {
                              const on = selectedLabors.has(l.id);
                              const pl = stat.unpaidByLabor?.[l.id];
                              return (
                                <li key={l.id}>
                                  <label className="flex min-h-8 cursor-pointer items-center gap-2 rounded px-1 text-xs hover:bg-[var(--color-accent-soft)]">
                                    <input
                                      type="checkbox"
                                      checked={on}
                                      onChange={() => toggleLaborInCycle(c.id, l.id)}
                                      className="h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                                    />
                                    <span className={`min-w-0 flex-1 truncate ${on ? "" : "text-[var(--color-muted)] line-through"}`}>
                                      {l.name}
                                    </span>
                                    {pl?.unpaid > 0 && (
                                      <span className="shrink-0 tabular-nums text-[var(--color-muted)]">
                                        {pl.ruts.size} pers.
                                      </span>
                                    )}
                                    <span
                                      className={`w-24 shrink-0 text-right tabular-nums ${
                                        pl?.unpaid > 0 && on ? "font-semibold" : "text-[var(--color-muted)]"
                                      }`}
                                    >
                                      {pl?.unpaid > 0 ? fmtCurrency(pl.unpaid) : "sin pendiente"}
                                    </span>
                                  </label>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
