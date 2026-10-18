import { useState } from "react";
import { Link } from "react-router-dom";
import ProductionSummaryModal from "../../components/ProductionSummaryModal";

export function CycleRow({ cycle, subjobName, onEdit, onOpenCloseFlow, onReopen, onDelete }) {
  // Cada CycleRow maneja su propio modal de resumen; el resumen de la faena
  // entera vive en SelectedDetail.
  const [resumenOpen, setResumenOpen] = useState(false);
  // El botón aparece si el ciclo tiene al menos una labor de cosecha, trato,
  // trato por etapas o pago al día (`main`); si no, el modal saldría vacío.
  // "Principal" es solo el nombre de la labor `main`, no otro tipo.
  const hasProdLabor = (cycle.labors || []).some(
    (l) => l.type === "cosecha" || l.type === "trato" || l.type === "tratoEtapas" || l.type === "main",
  );
  return (
    <li className="flex flex-col gap-2 px-3 py-2.5 md:flex-row md:flex-wrap md:items-center md:justify-between md:py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium">
          {cycle.label}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] ${
              cycle.status === "closed"
                ? "bg-[var(--color-surface-2)] text-[var(--color-muted)]"
                : "bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
            }`}
          >
            {cycle.status === "closed" ? "cerrado" : "abierto"}
          </span>
        </div>
        <div className="text-xs text-[var(--color-muted)]">
          {cycle.startDate || "—"}
          {cycle.endDate && ` → ${cycle.endDate}`}
          {subjobName && ` · ${subjobName}`}
          {` · ${(cycle.labors || []).length} labores`}
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5 md:ml-auto md:shrink-0">
        {hasProdLabor && (
          <button
            onClick={() => setResumenOpen(true)}
            title="Ver producción día por día con precios, unidades y rendimiento"
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
          >
            📊 Resumen
          </button>
        )}
        <Link
          to={`/cycles/${cycle.id}`}
          className="flex min-h-[32px] items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
        >
          Abrir
        </Link>
        {onEdit && (
          <button
            onClick={() => onEdit(cycle)}
            title="Renombrar / editar"
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
          >
            ✏ Renombrar
          </button>
        )}
        {cycle.status !== "closed" ? (
          <button
            onClick={() => onOpenCloseFlow(cycle)}
            className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
          >
            Cerrar
          </button>
        ) : (
          onReopen && (
            <button
              onClick={() => onReopen(cycle)}
              title="Reabrir ciclo cerrado"
              className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
            >
              ↻ Reabrir
            </button>
          )
        )}
        <button
          onClick={() => onDelete(cycle)}
          className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger-soft)]"
        >
          Eliminar
        </button>
      </div>
      {resumenOpen && (
        <ProductionSummaryModal
          open
          onClose={() => setResumenOpen(false)}
          title={`Producción · ${cycle.label}`}
          cycles={[cycle]}
        />
      )}
    </li>
  );
}
