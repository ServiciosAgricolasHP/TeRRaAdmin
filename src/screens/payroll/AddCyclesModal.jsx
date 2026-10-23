import { useState, useMemo } from "react";
import Modal from "../../components/Modal";
import { fmtCurrency } from "../../utils/format";
import { addableCyclesOf, cycleChecklistOf } from "../../utils/payrollCycles";
import { takenSplitOf } from "../../utils/cycleClosing";
import { CycleGroupList } from "./CycleGroupList";
import { PAY_SPLIT_HINT, PAY_UNKNOWN_HINT } from "./helpers";

// Agregar ciclos o labores a una nómina pendiente, con la misma lista que
// Generar: los ciclos abiertos por faena con lo pendiente de cada uno y, al
// marcar uno, sus labores con las personas y lo pendiente de cada una. Un
// ciclo que ya está en la nómina con algunas labores aparece con las que le
// faltan, y su pendiente cuenta solo esas; uno que está entero no aparece.
//
// Se monta solo mientras está abierto, así cada apertura arranca con el estado
// limpio.
export function AddCyclesModal({ onClose, payroll, cycles, faenas, subfaenas, cycleStats = {}, allPayrolls = [], onConfirm, busy }) {
  // cycleId → labores elegidas. Un ciclo marcado puede quedar sin labores, y
  // ese no se agrega.
  const [selected, setSelected] = useState(() => new Map());
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);

  const subfaenaNameById = useMemo(() => new Map(subfaenas.map((s) => [s.id, s.name])), [subfaenas]);
  const subfaenaName = (id) => subfaenaNameById.get(id) || "";
  const addable = useMemo(
    () => addableCyclesOf({ jobs: faenas, cycles, cycleStats, payroll }),
    [faenas, cycles, cycleStats, payroll],
  );
  const takenSplit = useMemo(() => takenSplitOf(cycleStats, allPayrolls), [cycleStats, allPayrolls]);
  const payrollNameOf = (id) => allPayrolls.find((p) => p.id === id)?.name || "";

  const list = cycleChecklistOf({
    groups: addable.groups,
    cycleStats: addable.stats,
    selected: new Set(selected.keys()),
    selectedLaborsByCycle: selected,
    search,
    showEmpty,
    subfaenaName,
  });

  const laborsOf = (cycleId) => addable.groups.flatMap((g) => g.cycles).find((c) => c.id === cycleId)?.labors || [];
  const toggleCycle = (cycleId) => setSelected((prev) => {
    const next = new Map(prev);
    if (next.has(cycleId)) next.delete(cycleId);
    else next.set(cycleId, new Set(laborsOf(cycleId).map((l) => l.id)));
    return next;
  });
  const toggleLabor = (cycleId, laborId) => setSelected((prev) => {
    const next = new Map(prev);
    const set = new Set(next.get(cycleId) || []);
    if (set.has(laborId)) set.delete(laborId);
    else set.add(laborId);
    next.set(cycleId, set);
    return next;
  });
  const seleccion = [...selected.entries()]
    .filter(([, set]) => set.size > 0)
    .map(([cycleId, set]) => ({ cycleId, laborIds: [...set] }));

  const cycleNote = (c) => {
    if (!addable.partial.has(c.id)) return null;
    return c.labors.length === 1
      ? `Ya está en la nómina; falta ${c.labors[0].name}`
      : `Ya está en la nómina; faltan ${c.labors.length} labores`;
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Agregar ciclos o labores a la nómina"
      size="xl"
      footer={
        <>
          <div className="mr-auto min-w-0 self-center text-sm">
            <span className="font-semibold tabular-nums">{seleccion.length}</span>{" "}
            <span className="text-[var(--color-muted)]">
              ciclo{seleccion.length === 1 ? "" : "s"} seleccionado{seleccion.length === 1 ? "" : "s"}
            </span>
            {seleccion.length > 0 && (
              <>
                <span className="ml-2 tabular-nums">
                  · <span className="font-semibold text-[var(--color-warning)]">{fmtCurrency(list.selectedTotal)}</span>
                </span>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-[var(--color-muted)]" title={PAY_SPLIT_HINT}>
                  <span>Estimado:</span>
                  <span className="tabular-nums">🏦 {fmtCurrency(list.selectedBank)}</span>
                  <span className="tabular-nums">💵 {fmtCurrency(list.selectedCash)}</span>
                  {list.selectedUnknown > 0 && (
                    <span className="tabular-nums" title={PAY_UNKNOWN_HINT}>❓ {fmtCurrency(list.selectedUnknown)}</span>
                  )}
                </div>
              </>
            )}
          </div>
          <button onClick={onClose} className="min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
            Cancelar
          </button>
          <button
            onClick={() => onConfirm(seleccion)}
            disabled={seleccion.length === 0 || busy}
            className="min-h-9 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy ? "Agregando..." : `Agregar (${seleccion.length})`}
          </button>
        </>
      }
    >
      {addable.groups.length === 0 ? (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">
          No hay ciclos abiertos ni labores para agregar (los cerrados no se muestran acá; lo demás ya está en esta nómina).
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar ciclo o faena..."
              className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-sm outline-none focus:border-[var(--color-accent)] sm:w-56"
            />
            <button
              type="button"
              onClick={() => setShowEmpty((v) => !v)}
              disabled={list.emptyCount === 0}
              title="Los ciclos sin plata pendiente están ocultos porque no hay nada que agregar de ellos."
              className={`min-h-[32px] rounded-md border px-3 py-1 text-xs ${
                showEmpty
                  ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  : "border-[var(--color-border)] bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
              } disabled:opacity-40 disabled:hover:bg-[var(--color-surface-2)]`}
            >
              {showEmpty ? "✓ " : ""}Sin pendientes ({list.emptyCount})
            </button>
            <span className="ml-auto text-xs">
              <span className="text-[var(--color-muted)]">Pendiente para agregar:</span>{" "}
              <span className="font-semibold tabular-nums text-[var(--color-warning)]">{fmtCurrency(list.totalPending)}</span>
            </span>
          </div>
          <CycleGroupList
            visibleGroups={list.visibleGroups}
            emptyCount={list.emptyCount}
            search={search}
            onShowEmpty={() => setShowEmpty(true)}
            toggle={toggleCycle}
            selectedLaborsByCycle={selected}
            toggleLaborInCycle={toggleLabor}
            takenSplit={takenSplit}
            payrollNameOf={payrollNameOf}
            cycleNote={cycleNote}
          />
        </div>
      )}
    </Modal>
  );
}
