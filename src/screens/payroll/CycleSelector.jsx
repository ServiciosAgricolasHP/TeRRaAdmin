import { useState, useMemo } from "react";
import { inChosenCycles } from "../../utils/payrollItem";
import { matchesSearchQuery } from "../../utils/textSearch";
import { fmtCurrency } from "../../utils/format";

const PAY_SPLIT_HINT =
  "Estimado en bruto, según el banco que tiene cargado cada trabajador. El monto definitivo por medio de pago sale en la vista previa, después de anticipos/bonos y de los cambios que hagas ahí.";

const PAY_UNKNOWN_HINT =
  "Trabajadores sin banco cargado o que no están en el catálogo. Se define su medio de pago en la vista previa.";

// Paso 1 de "Generar": elegir los ciclos de la nómina y, además o en vez de
// eso, personas sueltas con sus días puntuales. Por defecto solo se listan los
// ciclos con plata pendiente; los demás quedan detrás del toggle "Sin
// pendientes", salvo los ya marcados, que siempre se ven.
export function CycleSelector({
  groups,
  selected,
  toggle,
  selectedLaborsByCycle,
  toggleLaborInCycle,
  subfaenaName,
  cycleStats,
  pendingCashPayrolls = [],
  chosen = new Map(),
  people = [],
  onAddPerson,
  onEditPerson,
  onRemovePerson,
  onNext,
  busy,
  takenSplit = {},
  payrollNameOf = () => "",
  closableCount = 0,
  onClosePaid,
}) {
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);
  const [showPendingCash, setShowPendingCash] = useState(false);

  // Efectivo que quedó debiéndose de nóminas anteriores. No entra a esta
  // nómina ni se suma a nada: se entrega aparte, con su propio sobre. Está acá
  // porque es plata que hay que ir a sacar al banco el mismo día.
  const owedCash = useMemo(() => {
    let total = 0;
    let people = 0;
    for (const p of pendingCashPayrolls) {
      total += p.amount;
      people += p.count;
    }
    return { total, people, rows: pendingCashPayrolls };
  }, [pendingCashPayrolls]);

  // Lo pendiente de un ciclo marcado, contando solo las labores elegidas.
  const pendingOfChosenLabors = (cycle, stat) => {
    const elegidas = selectedLaborsByCycle?.get(cycle.id);
    const todas = (cycle.labors || []).map((l) => l.id);
    if (!elegidas || todas.every((id) => elegidas.has(id))) {
      return {
        unpaid: stat.unpaid,
        bank: stat.unpaidBank || 0,
        cash: stat.unpaidCash || 0,
        unknown: stat.unpaidUnknown || 0,
      };
    }
    const out = { unpaid: 0, bank: 0, cash: 0, unknown: 0 };
    for (const id of elegidas) {
      const pl = stat.unpaidByLabor?.[id];
      if (!pl) continue;
      out.unpaid += pl.unpaid;
      out.bank += pl.bank;
      out.cash += pl.cash;
      out.unknown += pl.unknown;
    }
    return out;
  };

  // Lo que suma cada persona suelta, sin los días que ya entran por un ciclo
  // elegido: esos ya se cuentan en el ciclo.
  const peopleRows = people.map((p) => {
    const propias = p.filas.filter((f) => !inChosenCycles(f, chosen));
    return {
      worker: p.worker,
      dias: propias.length,
      monto: propias.reduce((s, f) => s + f.amount, 0),
      cubiertas: p.filas.length - propias.length,
    };
  });
  const peopleTotal = peopleRows.reduce((s, r) => s + r.monto, 0);

  const {
    visibleGroups, emptyCount, totalPending, pendingCount,
    pendingBank, pendingCash, pendingUnknown,
    selectedTotal, selectedBank, selectedCash, selectedUnknown,
  } = useMemo(() => {
    const statOf = (id) =>
      cycleStats?.[id] || {
        unpaid: 0, taken: 0, total: 0, firstDay: "", lastDay: "",
        unpaidBank: 0, unpaidCash: 0, unpaidUnknown: 0,
      };
    let empty = 0;
    let pendingSum = 0;
    let withPending = 0;
    let bankSum = 0, cashSum = 0, unknownSum = 0;
    let selSum = 0, selBank = 0, selCash = 0, selUnknown = 0;
    const out = [];
    for (const { faena, cycles } of groups) {
      const rows = [];
      let groupPending = 0;
      let groupBank = 0;
      let groupCash = 0;
      for (const c of cycles) {
        const stat = statOf(c.id);
        const isSelected = selected.has(c.id);
        const hasPending = stat.unpaid > 0;
        if (hasPending) {
          withPending += 1;
          pendingSum += stat.unpaid;
          bankSum += stat.unpaidBank || 0;
          cashSum += stat.unpaidCash || 0;
          unknownSum += stat.unpaidUnknown || 0;
        } else {
          empty += 1;
        }
        if (isSelected) {
          const parte = pendingOfChosenLabors(c, stat);
          selSum += parte.unpaid;
          selBank += parte.bank;
          selCash += parte.cash;
          selUnknown += parte.unknown;
        }
        if (!hasPending && !showEmpty && !isSelected) continue;
        const sub = subfaenaName(c.subfaenaId);
        if (!matchesSearchQuery(`${c.label || c.id} ${sub} ${faena.name || ""}`, search)) continue;
        if (hasPending) {
          groupPending += stat.unpaid;
          groupBank += stat.unpaidBank || 0;
          groupCash += stat.unpaidCash || 0;
        }
        rows.push({ cycle: c, stat, sub, isSelected, hasPending });
      }
      if (rows.length > 0) out.push({ faena, rows, groupPending, groupBank, groupCash });
    }
    return {
      visibleGroups: out,
      emptyCount: empty,
      totalPending: pendingSum,
      pendingCount: withPending,
      pendingBank: bankSum,
      pendingCash: cashSum,
      pendingUnknown: unknownSum,
      selectedTotal: selSum,
      selectedBank: selBank,
      selectedCash: selCash,
      selectedUnknown: selUnknown,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groups, cycleStats, selected, selectedLaborsByCycle, search, showEmpty]);

  // "Todos / ninguno" por faena: solo opera sobre los ciclos que están a la
  // vista, así el botón nunca marca algo que el usuario no ve.
  const toggleGroup = (rows) => {
    const selectable = rows.filter((r) => r.hasPending || r.isSelected);
    const allOn = selectable.length > 0 && selectable.every((r) => r.isSelected);
    for (const r of selectable) {
      if (allOn === r.isSelected) toggle(r.cycle.id);
    }
  };

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-[var(--color-border)] text-[var(--color-muted)]">
        No hay ciclos activos.
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar ciclo o faena..."
          className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] sm:w-56"
        />
        <button
          type="button"
          onClick={() => setShowEmpty((v) => !v)}
          disabled={emptyCount === 0}
          title="Los ciclos sin plata pendiente están ocultos porque no hay nada que pagar en ellos."
          className={`min-h-[32px] rounded-md border px-3 py-1 text-xs ${
            showEmpty
              ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
              : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
          } disabled:opacity-40 disabled:hover:bg-[var(--color-surface-2)]`}
        >
          {showEmpty ? "✓ " : ""}Sin pendientes ({emptyCount})
        </button>
        {closableCount > 0 && (
          <button
            type="button"
            onClick={onClosePaid}
            title="Ciclos abiertos que ya se pagaron por completo: cerrarlos de una vez."
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-xs hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
          >
            🔒 Cerrar pagados ({closableCount})
          </button>
        )}
        <button
          type="button"
          onClick={onAddPerson}
          title="Sumar los días puntuales de una persona, de cualquier ciclo abierto. Sirve para armar la nómina solo con personas, o junto con los ciclos."
          className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1 text-xs hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
        >
          + Agregar persona
        </button>
        <div className="ml-auto flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
          <span>
            <span className="text-[var(--color-muted)]">Ciclos con pendiente:</span>{" "}
            <span className="font-semibold tabular-nums">{pendingCount}</span>
          </span>
          <span>
            <span className="text-[var(--color-muted)]">Pendiente total:</span>{" "}
            <span className="font-semibold tabular-nums text-[var(--color-warning)]">{fmtCurrency(totalPending)}</span>
          </span>
          <span
            className="flex flex-wrap items-center gap-x-2 rounded-md border border-dashed border-[var(--color-border)] px-2 py-1"
            title={PAY_SPLIT_HINT}
          >
            <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Estimado</span>
            <span className="tabular-nums">🏦 {fmtCurrency(pendingBank)}</span>
            <span className="tabular-nums">💵 {fmtCurrency(pendingCash)}</span>
            {pendingUnknown > 0 && (
              <span className="tabular-nums text-[var(--color-muted)]" title={PAY_UNKNOWN_HINT}>
                ❓ {fmtCurrency(pendingUnknown)}
              </span>
            )}
          </span>
        </div>
      </div>

      {owedCash.total > 0 && (
        <div className="rounded-lg border border-[var(--color-warning)] bg-[var(--color-warning-soft)]/40 px-3 py-2">
          <button
            type="button"
            onClick={() => setShowPendingCash((v) => !v)}
            className="flex w-full flex-wrap items-center gap-x-2 gap-y-1 text-left text-xs"
          >
            <span className="text-[var(--color-muted)]">{showPendingCash ? "▾" : "▸"}</span>
            <span className="font-semibold">💵 Efectivo pendiente de antes:</span>
            <span className="font-semibold tabular-nums text-[var(--color-warning)]">
              {fmtCurrency(owedCash.total)}
            </span>
            <span className="text-[var(--color-muted)]">
              · {owedCash.rows.length} nómina{owedCash.rows.length === 1 ? "" : "s"} ·{" "}
              {owedCash.people} persona{owedCash.people === 1 ? "" : "s"}
            </span>
            <span className="ml-auto text-[10px] italic text-[var(--color-muted)]">
              se entrega aparte, con su propio sobre
            </span>
          </button>
          {showPendingCash && (
            <div className="mt-2 space-y-1 border-t border-[var(--color-warning)]/40 pt-2">
              {owedCash.rows.map((r) => (
                <div key={r.id} className="flex flex-wrap items-center gap-x-2 text-xs">
                  <span className="font-medium">{r.name}</span>
                  <span className="text-[var(--color-muted)]">· {r.count} pers.</span>
                  <span className="ml-auto font-semibold tabular-nums">{fmtCurrency(r.amount)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {peopleRows.length > 0 && (
        <div className="shrink-0 overflow-hidden rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] shadow-sm">
          <div className="flex flex-wrap items-center gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 sm:px-4">
            <span className="text-sm font-semibold">👤 Personas sueltas</span>
            <span className="rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11px] tabular-nums text-[var(--color-muted)]">
              {peopleRows.length}
            </span>
            <span className="ml-auto text-xs font-semibold tabular-nums text-[var(--color-warning)]">
              {fmtCurrency(peopleTotal)}
            </span>
          </div>
          <ul className="max-h-[30vh] divide-y divide-[var(--color-border)] overflow-auto">
            {peopleRows.map((r) => (
              <li key={r.worker.id} className="flex items-center gap-2 px-3 py-1 sm:px-4">
                <button
                  type="button"
                  onClick={() => onEditPerson(r.worker)}
                  title="Cambiar los días elegidos"
                  className="flex min-h-[40px] min-w-0 flex-1 flex-col items-start justify-center text-left"
                >
                  <span className="w-full truncate text-sm font-medium">{r.worker.name || "(sin nombre)"}</span>
                  <span className="text-xs tabular-nums text-[var(--color-muted)]">
                    {r.dias} día{r.dias === 1 ? "" : "s"} · {fmtCurrency(r.monto)}
                    {r.cubiertas > 0 &&
                      ` · ${r.cubiertas} ya entra${r.cubiertas === 1 ? "" : "n"} con un ciclo elegido`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => onRemovePerson(r.worker.id)}
                  title="Quitar a esta persona"
                  aria-label={`Quitar a ${r.worker.name || "esta persona"}`}
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-[var(--color-border)] text-xs text-[var(--color-muted)] hover:border-[var(--color-danger)] hover:text-[var(--color-danger)]"
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex-1 space-y-3 overflow-auto">
        {visibleGroups.length === 0 ? (
          <div className="rounded-lg border border-dashed border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-muted)]">
            {search ? "Ningún ciclo coincide con la búsqueda." : "No hay ciclos con pendientes por pagar."}
            {!search && emptyCount > 0 && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setShowEmpty(true)}
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
                                  {fmtCurrency(partialLabors ? pendingOfChosenLabors(c, stat).unpaid : stat.unpaid)}
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

      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 shadow-sm">
        <div className="text-sm">
          <span className="font-semibold tabular-nums">{chosen.size}</span>{" "}
          <span className="text-[var(--color-muted)]">
            ciclo{chosen.size === 1 ? "" : "s"} seleccionado{chosen.size === 1 ? "" : "s"}
          </span>
          {chosen.size > 0 && (
            <span className="ml-2 tabular-nums">
              · <span className="font-semibold text-[var(--color-warning)]">{fmtCurrency(selectedTotal)}</span>
            </span>
          )}
          {peopleRows.length > 0 && (
            <span className="ml-2 tabular-nums">
              + <span className="font-semibold">{peopleRows.length}</span>{" "}
              <span className="text-[var(--color-muted)]">persona{peopleRows.length === 1 ? "" : "s"}</span>{" "}
              · <span className="font-semibold text-[var(--color-warning)]">{fmtCurrency(peopleTotal)}</span>
            </span>
          )}
          {chosen.size > 0 && (
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-muted)]" title={PAY_SPLIT_HINT}>
              <span>Estimado:</span>
              <span className="tabular-nums">🏦 {fmtCurrency(selectedBank)}</span>
              <span className="tabular-nums">💵 {fmtCurrency(selectedCash)}</span>
              {selectedUnknown > 0 && (
                <span className="tabular-nums" title={PAY_UNKNOWN_HINT}>❓ {fmtCurrency(selectedUnknown)}</span>
              )}
            </div>
          )}
        </div>
        <button
          onClick={onNext}
          disabled={(chosen.size === 0 && peopleRows.length === 0) || busy}
          className="min-h-[36px] rounded-md bg-[var(--color-accent)] px-4 py-2 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
        >
          {busy ? "Calculando..." : "Continuar →"}
        </button>
      </div>
    </div>
  );
}
