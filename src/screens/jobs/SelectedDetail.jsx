import { useState } from "react";
import ProductionSummaryModal from "./ProductionSummaryModal";
import { SubjobListBody } from "./SubjobListBody";

// El detalle de una faena. Arriba va su tarjeta (`header`, `JobCardBody`),
// que con la faena abierta deja la grilla y pasa a ser su encabezado; debajo,
// las acciones de la faena y sus subfaenas con sus ciclos. `onClose` la cierra.
export function SelectedDetail({
  header,
  onClose,
  selected,
  cardColor,
  subjobs,
  cycles,
  onCreateSubjob,
  onEditSubjob,
  onDeleteSubjob,
  onToggleHideSubjob,
  onCreateCycle,
  onEditCycle,
  onOpenCloseFlow,
  onReopenCycle,
  onDeleteCycle,
  collapsedSubjobs,
  onToggleSubjobCollapse,
  onCollapseAllSubjobs,
  onExpandAllSubjobs,
  showClosedInSubjob,
  onToggleShowClosed,
}) {
  const cyclesBySubjob = (cycles || []).reduce((acc, c) => {
    if (!c.subfaenaId) return acc;
    if (!acc[c.subfaenaId]) acc[c.subfaenaId] = [];
    acc[c.subfaenaId].push(c);
    return acc;
  }, {});
  const orphanCycles = (cycles || []).filter((c) => !c.subfaenaId);

  const hasSubjobs = (subjobs || []).length > 0;
  const allCollapsed = hasSubjobs && (subjobs || []).every((s) => collapsedSubjobs?.has(s.id));

  // Resumen de producción de la faena: recibe todos los ciclos con labores
  // de cosecha, trato, trato por etapas o pago al día, abiertos y cerrados.
  // Adentro, unos chips eligen cuáles incluir; arrancan prendidos solo los
  // abiertos.
  const [resumenOpen, setResumenOpen] = useState(false);
  const cyclesWithProd = (cycles || []).filter((c) =>
    (c.labors || []).some((l) => l.type === "cosecha" || l.type === "trato" || l.type === "tratoEtapas" || l.type === "main"),
  );
  // Abiertos primero, después cerrados; dentro de cada grupo, el más reciente primero.
  const cyclesForResumen = [...cyclesWithProd].sort((a, b) => {
    if (a.status !== b.status) return a.status === "closed" ? 1 : -1;
    return (b.startDate || "").localeCompare(a.startDate || "");
  });
  const defaultEnabledIds = cyclesForResumen
    .filter((c) => c.status !== "closed")
    .map((c) => c.id);

  return (
    <div
      className="relative rounded-lg border border-[var(--color-accent)] shadow-md transition-opacity duration-200 starting:opacity-0"
      style={{
        backgroundColor: "var(--color-surface)",
        backgroundImage: cardColor
          ? `linear-gradient(135deg, ${cardColor}14, transparent 55%)`
          : undefined,
        boxShadow: cardColor
          ? `0 6px 24px ${cardColor}22, 0 1px 3px rgb(0 0 0 / 0.06)`
          : undefined,
      }}
    >
      <div className="group relative px-4 pt-5 pb-4">{header}</div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-y border-[var(--color-border)] bg-[var(--color-surface-2)] px-4 py-2">
        {cyclesForResumen.length > 0 && (
          <button
            onClick={() => setResumenOpen(true)}
            title="Resumen de producción de todos los ciclos de esta faena (filtros adentro)"
            className="min-h-8 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-accent-soft)]"
          >
            📊 Resumen producción
          </button>
        )}
        <button
          onClick={onCreateSubjob}
          className="min-h-8 rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] transition-colors hover:opacity-90"
          style={{ backgroundColor: cardColor || "var(--color-accent)" }}
        >
          + Subfaena
        </button>
        <button
          onClick={onClose}
          title="Cerrar el detalle de la faena"
          className="min-h-8 rounded-md px-2 py-1.5 text-xs text-[var(--color-muted)] hover:bg-[var(--color-surface)] hover:text-[var(--color-text)]"
        >
          ✕ Cerrar
        </button>
      </div>

      {resumenOpen && (
        <ProductionSummaryModal
          open
          onClose={() => setResumenOpen(false)}
          title={`Producción · ${selected.name}`}
          cycles={cyclesForResumen}
          initialEnabledCycleIds={defaultEnabledIds}
        />
      )}

      {!cycles || !subjobs ? (
        <div className="px-5 py-4 text-sm text-[var(--color-muted)]">Cargando...</div>
      ) : !hasSubjobs ? (
        <div className="px-5 py-6 text-center text-sm text-[var(--color-muted)]">
          <p>Esta faena no tiene subfaenas.</p>
          <p className="mt-1 text-xs">
            Los ciclos se crean dentro de una subfaena. Crea la primera para comenzar.
          </p>
          <button
            onClick={onCreateSubjob}
            className="mt-3 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
          >
            Crear subfaena
          </button>
          {orphanCycles.length > 0 && (
            <div className="mt-4 rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] p-3 text-left text-xs text-[var(--color-warning)]">
              <b>Atención:</b> esta faena tiene {orphanCycles.length} ciclo(s) antiguos sin subfaena.
              Bórralos desde la consola de Firebase o con el borrado en cascada al eliminar la faena.
            </div>
          )}
        </div>
      ) : (
        <SubjobListBody
          subjobs={subjobs}
          cyclesBySubjob={cyclesBySubjob}
          collapsedSubjobs={collapsedSubjobs}
          onToggleSubjobCollapse={onToggleSubjobCollapse}
          allCollapsed={allCollapsed}
          onExpandAllSubjobs={onExpandAllSubjobs}
          onCollapseAllSubjobs={onCollapseAllSubjobs}
          onEditSubjob={onEditSubjob}
          onDeleteSubjob={onDeleteSubjob}
          onToggleHideSubjob={onToggleHideSubjob}
          onCreateCycle={onCreateCycle}
          onEditCycle={onEditCycle}
          onOpenCloseFlow={onOpenCloseFlow}
          onReopenCycle={onReopenCycle}
          onDeleteCycle={onDeleteCycle}
          showClosedInSubjob={showClosedInSubjob}
          onToggleShowClosed={onToggleShowClosed}
        />
      )}
    </div>
  );
}
