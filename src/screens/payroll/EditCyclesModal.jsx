import { useState, useMemo } from "react";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { fmtCurrency } from "../../utils/format";
import { additionSummaryOf, cycleChecklistOf, cycleEditDiff, editableCyclesOf } from "../../utils/payrollCycles";
import { removalSummaryOf } from "../../utils/payrollDetail";
import { takenSplitOf } from "../../utils/cycleClosing";
import { CycleGroupList } from "./CycleGroupList";

// Los ciclos de una nómina pendiente, para cambiarlos en un solo paso, con la
// misma lista que Generar: los ciclos abiertos por faena con lo pendiente de
// cada uno y, al marcar uno, sus labores. Los de la nómina vienen marcados,
// con sus labores y lo que paga cada una. Se marca lo que entra y se desmarca
// lo que sale, y "Revisar cambios" muestra el recálculo (`startCycleEdit` de
// `usePayrollRecalc`) antes de guardar.
//
// Se monta solo mientras está abierto, así cada apertura arranca de lo que la
// nómina paga.
export function EditCyclesModal({ onClose, payroll, cycles, faenas, subfaenas, cycleStats = {}, allPayrolls = [], cycleBreakdown = [], onConfirm, busy }) {
  const editable = useMemo(
    () => editableCyclesOf({ jobs: faenas, cycles, cycleStats, payroll, cycleBreakdown }),
    [faenas, cycles, cycleStats, payroll, cycleBreakdown],
  );
  // cycleId → labores marcadas. Arranca con lo que la nómina paga hoy.
  const [selected, setSelected] = useState(() => new Map([...editable.initial].map(([id, set]) => [id, new Set(set)])));
  const [search, setSearch] = useState("");
  const [showEmpty, setShowEmpty] = useState(false);

  const subfaenaNameById = useMemo(() => new Map(subfaenas.map((s) => [s.id, s.name])), [subfaenas]);
  const subfaenaName = (id) => subfaenaNameById.get(id) || "";
  const takenSplit = useMemo(() => takenSplitOf(cycleStats, allPayrolls), [cycleStats, allPayrolls]);
  const payrollNameOf = (id) => allPayrolls.find((p) => p.id === id)?.name || "";

  const list = cycleChecklistOf({
    groups: editable.groups,
    cycleStats: editable.stats,
    selected: new Set(selected.keys()),
    selectedLaborsByCycle: selected,
    search,
    showEmpty,
    subfaenaName,
    keep: editable.part,
  });

  const { removed, added } = cycleEditDiff(editable.initial, selected);
  const removal = removalSummaryOf(cycleBreakdown, removed);
  const addition = additionSummaryOf(added, { cycles, stats: editable.stats, initial: editable.initial });
  const changeCount = removed.size + added.size;
  const leavesEmpty = removal.allOut && added.size === 0;

  const laborsOf = (cycleId) => cycles.find((c) => c.id === cycleId)?.labors || [];
  // Volver a marcar un ciclo de la nómina recupera sus labores de antes; uno
  // nuevo entra con todas.
  const toggleCycle = (cycleId) => setSelected((prev) => {
    const next = new Map(prev);
    if (next.has(cycleId)) next.delete(cycleId);
    else next.set(cycleId, new Set(editable.initial.get(cycleId) || laborsOf(cycleId).map((l) => l.id)));
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
  const undo = () => setSelected(new Map([...editable.initial].map(([id, set]) => [id, new Set(set)])));

  const cycleNote = (c) => {
    if (!editable.part.has(c.id)) return null;
    const r = removed.get(c.id);
    if (r === true) return "✕ Sale de la nómina";
    if (r instanceof Set) {
      const names = laborsOf(c.id).filter((l) => r.has(l.id)).map((l) => l.name);
      return `✕ Sale ${names.join(", ")}`;
    }
    return null;
  };

  const confirm = () =>
    onConfirm({ removed, added, removalLines: removal.lines, additionLines: addition.lines });

  return (
    <Modal
      open
      onClose={onClose}
      title="Ciclos de la nómina"
      size="xl"
      section="Editar ciclos de la nómina"
      dirty={changeCount > 0 && !busy}
      footer={
        <>
          <div className="w-full min-w-0 self-center text-xs sm:mr-auto sm:w-auto sm:text-sm">
            {changeCount === 0 ? (
              <span className="text-[var(--color-muted)]">Sin cambios: marca lo que entra y desmarca lo que sale.</span>
            ) : (
              <>
                {addition.lines.length > 0 && (
                  <div>
                    <span className="text-[var(--color-accent)]">+ Entra</span>{" "}
                    {[
                      addition.cyclesIn ? `${addition.cyclesIn} ciclo${addition.cyclesIn === 1 ? "" : "s"}` : "",
                      addition.laborsIn ? `${addition.laborsIn} labor${addition.laborsIn === 1 ? "" : "es"}` : "",
                    ].filter(Boolean).join(" y ")}
                    {addition.amount > 0 && (
                      <span className="tabular-nums"> · {fmtCurrency(addition.amount)} pendiente</span>
                    )}
                  </div>
                )}
                {removal.lines.length > 0 && (
                  <div>
                    <span className="text-[var(--color-danger)]">✕ Sale</span>{" "}
                    {[
                      removal.cyclesOut ? `${removal.cyclesOut} ciclo${removal.cyclesOut === 1 ? "" : "s"}` : "",
                      removal.laborsOut ? `${removal.laborsOut} labor${removal.laborsOut === 1 ? "" : "es"}` : "",
                    ].filter(Boolean).join(" y ")}
                    <span className="tabular-nums"> · {removal.unknown ? "más de " : ""}{fmtCurrency(removal.amount)} de bruto</span>
                  </div>
                )}
                {leavesEmpty && (
                  <div className="font-medium text-[var(--color-danger)]">Eso deja la nómina vacía: para sacar todo, elimina la nómina.</div>
                )}
              </>
            )}
          </div>
          <ModalCloseButton className="min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
            Cancelar
          </ModalCloseButton>
          {changeCount > 0 && (
            <button onClick={undo} disabled={busy} className="min-h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm disabled:opacity-50">
              Deshacer
            </button>
          )}
          <button
            onClick={confirm}
            disabled={changeCount === 0 || leavesEmpty || busy}
            className="min-h-9 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            {busy ? "Comparando…" : "Revisar cambios"}
          </button>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p className="text-xs text-[var(--color-muted)]">
          Lo marcado queda en la nómina: marca los ciclos o labores que entran y desmarca los que salen. Antes de
          guardar se ve cómo queda cada persona: quien se queda sin producción sale y sus anticipos vuelven a quedar
          pendientes, y a quien entra o suma se le descuentan sus anticipos pendientes.
        </p>
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
            title="Los ciclos sin plata pendiente que no están en la nómina se ocultan porque no hay nada que agregar de ellos."
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
          payrollPart={editable.part}
        />
      </div>
    </Modal>
  );
}
