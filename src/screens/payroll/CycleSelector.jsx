import { useState, useMemo } from "react";
import { inChosenCycles } from "../../utils/payrollItem";
import { cycleChecklistOf } from "../../utils/payrollCycles";
import { fmtCurrency } from "../../utils/format";
import { CycleGroupList } from "./CycleGroupList";
import { PAY_SPLIT_HINT, PAY_UNKNOWN_HINT } from "./helpers";

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
  } = useMemo(
    () => cycleChecklistOf({ groups, cycleStats, selected, selectedLaborsByCycle, search, showEmpty, subfaenaName }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [groups, cycleStats, selected, selectedLaborsByCycle, search, showEmpty],
  );

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

      <CycleGroupList
        visibleGroups={visibleGroups}
        emptyCount={emptyCount}
        search={search}
        onShowEmpty={() => setShowEmpty(true)}
        toggle={toggle}
        selectedLaborsByCycle={selectedLaborsByCycle}
        toggleLaborInCycle={toggleLaborInCycle}
        takenSplit={takenSplit}
        payrollNameOf={payrollNameOf}
      />

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
