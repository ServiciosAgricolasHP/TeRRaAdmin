import { useState } from "react";
import { CycleRow } from "./CycleRow";

// Lista de subfaenas: las visibles primero y las ocultas (`hidden`) en un
// grupo plegable al final.
export function SubfaenaListBody({
  subs,
  cyclesBySub,
  collapsedSubs,
  onToggleSubCollapse,
  allCollapsed,
  onExpandAllSubs,
  onCollapseAllSubs,
  onEditSub,
  onDeleteSub,
  onToggleHideSub,
  onCreateCycle,
  onEditCycle,
  onOpenCloseFlow,
  onReopenCycle,
  onDeleteCycle,
  showClosedInSub,
  onToggleShowClosed,
}) {
  const visibleSubs = subs.filter((s) => !s.hidden);
  const hiddenSubs = subs.filter((s) => s.hidden);
  // El grupo de ocultas arranca plegado cada vez que se monta.
  const [hiddenGroupOpen, setHiddenGroupOpen] = useState(false);

  const renderSubCard = (s) => {
    const subCycles = cyclesBySub[s.id] || [];
    const openCycles = subCycles.filter((c) => c.status !== "closed");
    const closedCycles = subCycles.filter((c) => c.status === "closed");
    const isCollapsed = !!collapsedSubs?.has(s.id);
    const closedHiddenByDefault = openCycles.length > 0;
    const showClosed = !closedHiddenByDefault || !!showClosedInSub?.has(s.id);
    return (
      <div key={s.id} className="rounded-md border border-[var(--color-border)]">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2">
          <button
            onClick={() => onToggleSubCollapse(s.id)}
            aria-label={isCollapsed ? "Expandir" : "Colapsar"}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
          >
            {isCollapsed ? "▸" : "▾"}
          </button>
          <div
            className="min-w-0 flex-1 cursor-pointer"
            onClick={() => onToggleSubCollapse(s.id)}
          >
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={`truncate text-sm font-medium ${s.hidden ? "text-[var(--color-muted)]" : ""}`}>
                {s.name}
              </span>
              {s.hidden && (
                <span
                  className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] italic text-[var(--color-muted)]"
                  title="Subfaena marcada como oculta — agrupada al final, arranca colapsada cada sesión"
                >
                  oculta
                </span>
              )}
              <span className="rounded bg-[var(--color-surface)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">
                {openCycles.length > 0 && <span className="text-[var(--color-accent)]">{openCycles.length} abierto{openCycles.length === 1 ? "" : "s"}</span>}
                {openCycles.length > 0 && closedCycles.length > 0 && " · "}
                {closedCycles.length > 0 && <span>{closedCycles.length} cerrado{closedCycles.length === 1 ? "" : "s"}</span>}
                {subCycles.length === 0 && "sin ciclos"}
              </span>
            </div>
            {s.notes && !isCollapsed && (
              <div className="truncate text-xs text-[var(--color-muted)]">{s.notes}</div>
            )}
          </div>
          <div className="flex w-full shrink-0 flex-wrap gap-1.5 md:w-auto md:ml-auto">
            {/* Ocultar aparece solo si la subfaena tiene ciclos y están todos
                cerrados; Mostrar, si ya está oculta. */}
            {onToggleHideSub && (s.hidden || (openCycles.length === 0 && subCycles.length > 0)) && (
              <button
                onClick={() => onToggleHideSub(s)}
                title={s.hidden
                  ? "Desmarcar como oculta (volverá a aparecer expandida arriba)"
                  : "Marcar como oculta (se mueve al grupo Ocultas al final)"}
                className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
              >
                {s.hidden ? "Mostrar" : "Ocultar"}
              </button>
            )}
            <button
              onClick={() => onCreateCycle(s.id)}
              className="min-h-[32px] rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
            >
              + Ciclo
            </button>
            <button
              onClick={() => onEditSub(s)}
              className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
            >
              Editar
            </button>
            <button
              onClick={() => onDeleteSub(s)}
              className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
            >
              Eliminar
            </button>
          </div>
        </div>
        {!isCollapsed && (
          subCycles.length === 0 ? (
            <div className="px-3 py-2 text-xs text-[var(--color-muted)]">Sin ciclos.</div>
          ) : (
            <>
              <ul className="divide-y divide-[var(--color-border)]">
                {openCycles.map((c) => (
                  <CycleRow
                    key={c.id}
                    cycle={c}
                    onEdit={onEditCycle}
                    onOpenCloseFlow={onOpenCloseFlow}
                    onReopen={onReopenCycle}
                    onDelete={onDeleteCycle}
                  />
                ))}
                {showClosed && closedCycles.map((c) => (
                  <CycleRow
                    key={c.id}
                    cycle={c}
                    onEdit={onEditCycle}
                    onOpenCloseFlow={onOpenCloseFlow}
                    onReopen={onReopenCycle}
                    onDelete={onDeleteCycle}
                  />
                ))}
              </ul>
              {closedHiddenByDefault && closedCycles.length > 0 && (
                <button
                  onClick={() => onToggleShowClosed(s.id)}
                  className="w-full border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/50 px-3 py-1.5 text-left text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
                >
                  {showClosed
                    ? `▴ Ocultar ${closedCycles.length} ciclo${closedCycles.length === 1 ? "" : "s"} cerrado${closedCycles.length === 1 ? "" : "s"}`
                    : `▾ Ver ${closedCycles.length} ciclo${closedCycles.length === 1 ? "" : "s"} cerrado${closedCycles.length === 1 ? "" : "s"}`}
                </button>
              )}
            </>
          )
        )}
      </div>
    );
  };

  return (
    <div className="space-y-3 px-5 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs uppercase tracking-wider text-[var(--color-muted)]">
        <span>
          Subfaenas ({visibleSubs.length}
          {hiddenSubs.length > 0 && (
            <span className="normal-case tracking-normal text-[var(--color-muted)]">
              {" · "}{hiddenSubs.length} oculta{hiddenSubs.length === 1 ? "" : "s"}
            </span>
          )}
          )
        </span>
        <div className="flex flex-wrap gap-1">
          <button
            onClick={allCollapsed ? onExpandAllSubs : onCollapseAllSubs}
            title={allCollapsed ? "Expandir todas las subfaenas" : "Colapsar todas las subfaenas"}
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] normal-case tracking-normal hover:bg-[var(--color-accent-soft)]"
          >
            {allCollapsed ? "▾ Expandir todo" : "▸ Colapsar todo"}
          </button>
        </div>
      </div>

      {visibleSubs.map(renderSubCard)}

      {/* Grupo plegable de subfaenas ocultas, plegado por defecto. Adentro,
          cada subfaena conserva su propio plegado y llega plegada por el
          plegado automático de processedHiddenRef. */}
      {hiddenSubs.length > 0 && (
        <div className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)]/30">
          <button
            type="button"
            onClick={() => setHiddenGroupOpen((v) => !v)}
            className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)] hover:text-[var(--color-accent)]"
          >
            <span>{hiddenGroupOpen ? "▾" : "▸"}</span>
            <span className="font-medium uppercase tracking-wider">
              Subfaenas ocultas ({hiddenSubs.length})
            </span>
            <span className="normal-case opacity-70">
              {hiddenGroupOpen ? "click para ocultar" : "click para ver"}
            </span>
          </button>
          {hiddenGroupOpen && (
            <div className="space-y-3 border-t border-dashed border-[var(--color-border)] p-3">
              {hiddenSubs.map(renderSubCard)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
