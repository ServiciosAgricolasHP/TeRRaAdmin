import Modal from "../../components/Modal";
import { WorkerPaidDetailTables } from "./WorkerPaidDetailTables";
import { WorkerPaySummaryCards } from "./WorkerPaySummaryCards";
import { usePayrollSnapshot } from "./payrollDetailModal/usePayrollSnapshot";

// Lo que un trabajador cobró en una nómina: el mismo contenido que la fila
// expandible de PayrollDetailModal (WorkerPaidDetailTables +
// WorkerPaySummaryCards), abierto desde su historial. `payment.payroll` ya
// está en memoria, así que solo se lee el snapshot de esa nómina (un doc).
export function WorkerPayrollDetailModal({ open, payment, worker, catalogs, onClose, onShowFullHistory }) {
  const payroll = payment?.payroll || null;
  const { snapshot, snapshotLoading } = usePayrollSnapshot({ payroll: open ? payroll : null });

  if (!payroll) return null;
  const item = (payroll.items || []).find((it) => (it.workerId || it.rut) === worker.workerId) || null;
  const cycleDetails = payroll.cycleDetails || [];
  const displayCycleLabel = (cycle) => payroll.cycleLabelOverrides?.[cycle.id] || cycle.label || cycle.id;

  return (
    <Modal open={open} onClose={onClose} title={`${worker.name} — ${payroll.name || "Nómina"}`} size="lg">
      {!item ? (
        <p className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          No se encontró el detalle de este trabajador en esta nómina.
        </p>
      ) : (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex flex-wrap items-center gap-2">
              {item.groupLeader && (
                <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px]">
                  👥 <b>{item.groupLeader}</b>
                </span>
              )}
              {item.email && (
                <span className="text-[10px] text-[var(--color-muted)]">✉ {item.email}</span>
              )}
            </div>
            <button
              type="button"
              onClick={onShowFullHistory}
              className="rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-accent)] hover:bg-[var(--color-accent)] hover:text-[var(--color-accent-fg)]"
              title="Abrir el historial completo del trabajador, a través de todas las nóminas"
            >
              📅 Ver historial completo
            </button>
          </div>

          <WorkerPaidDetailTables
            displayRut={worker.rut}
            item={item}
            snapshot={snapshot}
            snapshotLoading={snapshotLoading}
            cycleDetails={cycleDetails}
            displayCycleLabel={displayCycleLabel}
            catalogs={catalogs}
          />

          <WorkerPaySummaryCards item={item} />
        </div>
      )}
    </Modal>
  );
}
