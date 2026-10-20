import { useState } from "react";
import ProductionSummaryModal from "./ProductionSummaryModal";
import { SubjobListBody } from "./SubjobListBody";

export function SelectedDetail({
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
    (acc[c.subfaenaId] ||= []).push(c);
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
      className="relative mt-6 rounded-lg border border-[var(--color-border)] pt-6 shadow-sm"
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
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-1.5 rounded-t-lg"
        style={{ backgroundColor: cardColor || "var(--color-border)" }}
      />
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[var(--color-border)] px-5 py-3">
        <div className="flex items-center gap-3">
          {cardColor && (
            <span
              aria-hidden
              className="h-8 w-1 rounded-full"
              style={{ backgroundColor: cardColor }}
            />
          )}
          <div>
            <div className="text-xs uppercase tracking-wider text-[var(--color-muted)]">Detalle</div>
            <div
              className="text-2xl font-bold leading-tight"
              style={{ color: cardColor || "var(--color-accent)" }}
            >
              {selected.name}
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {cyclesForResumen.length > 0 && (
            <button
              onClick={() => setResumenOpen(true)}
              title="Resumen de producción de todos los ciclos de esta faena (filtros adentro)"
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-medium hover:bg-[var(--color-accent-soft)]"
            >
              📊 Resumen producción
            </button>
          )}
          <button
            onClick={onCreateSubjob}
            className="rounded-md px-3 py-1.5 text-xs font-medium text-[var(--color-accent-fg)] transition-colors hover:opacity-90"
            style={{ backgroundColor: cardColor || "var(--color-accent)" }}
          >
            + Subfaena
          </button>
        </div>
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
