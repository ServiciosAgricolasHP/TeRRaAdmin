import { useState } from "react";
import { Link } from "react-router-dom";
import RowMenu from "../../components/RowMenu";
import ProductionSummaryModal from "./ProductionSummaryModal";

// Un ciclo en el detalle de la faena: Abrir y Cerrar (o Reabrir) a la vista;
// el resumen de producción, renombrar y eliminar, en el menú ⋯.
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
  const menuItems = [
    ...(hasProdLabor
      ? [{ icon: "📊", label: "Resumen de producción", hint: "Día por día, con precios, unidades y rendimiento", onClick: () => setResumenOpen(true) }]
      : []),
    ...(onEdit ? [{ icon: "✏", label: "Renombrar o editar", onClick: () => onEdit(cycle) }] : []),
    { divider: true },
    { icon: "🗑", label: "Eliminar ciclo", danger: true, onClick: () => onDelete(cycle) },
  ];
  return (
    <li className="flex items-center gap-2 px-3 py-2">
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2 text-sm font-medium [overflow-wrap:anywhere]">
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
      <div className="flex shrink-0 items-center gap-1.5">
        <Link
          to={`/cycles/${cycle.id}`}
          className="flex min-h-[32px] items-center rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
        >
          Abrir
        </Link>
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
        <RowMenu items={menuItems} triggerLabel="Más acciones del ciclo" />
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
