import { useMemo, useState, useEffect } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useCarriers } from "../../contexts/CarriersContext";
import { transportPayrollsService, paymentsService, tripsService } from "../../services/transportsService";
import { faenasService, subfaenasService, cyclesService } from "../../services";
import { useToast } from "../../contexts/ToastContext";
import { fmtCurrency } from "../../utils/format";
import { PayrollCreateModal } from "./PayrollCreateModal";
import { PayrollDetailModal } from "./PayrollDetailModal";
import { PayrollMetaEditModal } from "./PayrollMetaEditModal";
import { QuincenasBalanceSummary } from "./QuincenasBalanceSummary";
import { comparePayrollPeriod } from "./transportPayrolls";
import { TypeToConfirmModal } from "./TypeToConfirmModal";

// ============================================================
// PESTAÑA QUINCENAS
// ============================================================
//
// Una quincena (`transportPayrolls`) agrupa resúmenes (`transportPayments`)
// de varios transportistas, con nombre y un rango opcional que no tiene por
// qué ser de 15 días. Es la vista PRINCIPAL para pagar: cada resumen se marca
// pagado por separado o todos juntos con "Marcar quincena pagada". Marcar
// pagado y revertir piden escribir una palabra ("Pagada" o "Revertir").

export function PayrollsTab() {
  const toast = useToast();
  const { carriers } = useCarriers();
  const carriersById = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers]);

  const [payrolls, setPayrolls] = useState([]);
  const [payments, setPayments] = useState([]);
  // "+ Nueva quincena" usa las faenas (chips de filtro) y las vueltas sueltas
  // (pendientes y sin resumen). Subfaenas y ciclos alimentan la columna Labor
  // de los resúmenes al imprimir la quincena.
  const [faenas, setFaenas] = useState([]);
  const [subfaenas, setSubfaenas] = useState([]);
  const [cycles, setCycles] = useState([]);
  const [pendingTrips, setPendingTrips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [detailId, setDetailId] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);
  const [confirmPay, setConfirmPay] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [pr, py, fa, sub, cyc, pt] = await Promise.all([
        transportPayrollsService.listAll(),
        paymentsService.listAll(),
        faenasService.list({ cache: true, ttl: 60_000 }),
        subfaenasService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        cyclesService.list({ cache: true, persist: true, ttl: 5 * 60 * 1000 }),
        tripsService.listPendingUnlinked(),
      ]);
      setPayrolls(pr.sort(comparePayrollPeriod));
      setPayments(py);
      setFaenas(fa.filter((f) => !f.deleted));
      setSubfaenas(sub);
      setCycles(cyc);
      // Solo las vueltas no asignadas a ningún resumen — son las elegibles
      // para entrar a una quincena nueva.
      setPendingTrips(pt.filter((t) => !t.paymentId));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const paymentsById = useMemo(() => new Map(payments.map((p) => [p.id, p])), [payments]);
  const faenaById = useMemo(() => new Map(faenas.map((f) => [f.id, f])), [faenas]);
  const subfaenaById = useMemo(() => new Map(subfaenas.map((s) => [s.id, s])), [subfaenas]);
  const cycleById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);

  const looseSummaries = useMemo(
    () => payments.filter((p) => p.status !== "paid" && !p.payrollId),
    [payments],
  );

  const askMarkPayrollPaid = (payroll) => {
    setConfirmPay({
      verb: "Pagada",
      label: `Marcar la quincena "${payroll.name}" como PAGADA. Esto marca todos sus resúmenes (${(payroll.paymentIds || []).length}) y sus vueltas como pagados.`,
      onConfirm: async () => {
        await transportPayrollsService.markPaid(payroll.id);
        setConfirmPay(null);
        await load();
      },
    });
  };
  const askRevertPayroll = (payroll) => {
    setConfirmPay({
      verb: "Revertir",
      label: `Revertir el pago de la quincena "${payroll.name}". Esto vuelve a pendiente todos los resúmenes y vueltas.`,
      onConfirm: async () => {
        await transportPayrollsService.revertPaid(payroll.id);
        setConfirmPay(null);
        await load();
      },
    });
  };
  const askMarkItemPaid = (payment) => {
    setConfirmPay({
      verb: "Pagada",
      label: `Marcar el resumen "${carriersById.get(payment.carrierId)?.alias || payment.carrierId}" (${fmtCurrency(payment.total)}) como pagado.`,
      onConfirm: async () => {
        await paymentsService.markPaid(payment.id);
        setConfirmPay(null);
        await load();
      },
    });
  };
  const askRevertItem = (payment) => {
    setConfirmPay({
      verb: "Revertir",
      label: `Revertir el pago del resumen "${carriersById.get(payment.carrierId)?.alias || payment.carrierId}".`,
      onConfirm: async () => {
        await paymentsService.revertPaid(payment.id);
        setConfirmPay(null);
        await load();
      },
    });
  };

  const detail = detailId ? payrolls.find((p) => p.id === detailId) : null;

  return (
    <div>
      <div className="mb-3 flex items-center justify-between">
        <div className="text-sm text-[var(--color-muted)]">
          Quincenas — agrupan resúmenes de varios transportistas para pagar en bloque.
        </div>
        <button
          onClick={() => setCreating(true)}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          + Nueva quincena
        </button>
      </div>

      {!loading && payrolls.length > 0 && (
        <QuincenasBalanceSummary
          carriers={carriers}
          payrolls={payrolls}
          payments={payments}
        />
      )}

      {loading ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-muted)]">
          Cargando...
        </div>
      ) : payrolls.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-muted)]">
          Aún no hay quincenas. Crea la primera con + Nueva quincena.
        </div>
      ) : (
        <div className="space-y-2">
          {payrolls.map((p) => {
            const isPaid = p.status === "paid";
            const items = (p.paymentIds || []).map((pid) => paymentsById.get(pid)).filter(Boolean);
            const paidCount = items.filter((it) => it.status === "paid").length;
            const period = (p.periodFrom || p.periodTo) ? `${p.periodFrom || "?"} → ${p.periodTo || "?"}` : "—";
            return (
              <div
                key={p.id}
                onClick={() => setDetailId(p.id)}
                className="flex cursor-pointer items-center gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 hover:border-[var(--color-accent)]"
              >
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                  isPaid
                    ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                    : "bg-[var(--color-warning-soft)] text-[var(--color-warning)]"
                }`}>
                  {isPaid ? "Pagada" : "Pendiente"}
                </span>
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{p.name}</div>
                  <div className="text-xs text-[var(--color-muted)]">{period}</div>
                </div>
                <div className="text-right text-xs">
                  <div className="text-[var(--color-muted)]">
                    {items.length} resumen{items.length === 1 ? "" : "es"} · {paidCount} pagado{paidCount === 1 ? "" : "s"}
                  </div>
                  <div className="font-semibold tabular-nums">{fmtCurrency(p.total)}</div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {creating && (
        <PayrollCreateModal
          carriers={carriers}
          carriersById={carriersById}
          faenas={faenas}
          pendingTrips={pendingTrips}
          looseSummaries={looseSummaries}
          onClose={() => setCreating(false)}
          onCreate={async ({ name, periodFrom, periodTo, notes, perCarrier, importSummaryIds }) => {
            try {
              // 1) Crea un resumen por transportista con sus vueltas sueltas filtradas.
              // 2) Suma los resúmenes existentes elegidos para importar.
              // 3) Crea la quincena con todos los paymentIds; transportPayrollsService.create
              //    les pone el payrollId.
              const created = [];
              for (const it of perCarrier) {
                const datesSorted = it.trips.map((t) => t.date).filter(Boolean).sort();
                const summary = await paymentsService.createSummary({
                  carrierId: it.carrierId,
                  periodFrom: datesSorted[0] || periodFrom || null,
                  periodTo: datesSorted[datesSorted.length - 1] || periodTo || null,
                  groupBy: "day",
                  tripIds: it.trips.map((t) => t.id),
                  total: it.total,
                  notes: "",
                });
                created.push(summary.id);
              }
              await transportPayrollsService.create({
                name,
                periodFrom,
                periodTo,
                paymentIds: [...created, ...(importSummaryIds || [])],
                notes,
              });
              setCreating(false);
              await load();
            } catch (err) { toast.error(err?.message || "Error"); }
          }}
        />
      )}

      {detail && (
        <PayrollDetailModal
          payroll={detail}
          items={(detail.paymentIds || []).map((pid) => paymentsById.get(pid)).filter(Boolean)}
          carriers={carriers}
          carriersById={carriersById}
          faenaById={faenaById}
          subfaenaById={subfaenaById}
          cycleById={cycleById}
          looseSummaries={looseSummaries}
          onClose={() => setDetailId(null)}
          onEditMeta={() => setEditingId(detail.id)}
          onDeletePayroll={() => setConfirmDelete(detail)}
          onAddSummaries={async (ids) => { try { await transportPayrollsService.addPayments(detail.id, ids); await load(); } catch (err) { toast.error(err?.message || "Error"); } }}
          onRemoveSummary={async (pid) => { try { await transportPayrollsService.removePayments(detail.id, [pid]); await load(); } catch (err) { toast.error(err?.message || "Error"); } }}
          onMarkPayrollPaid={() => askMarkPayrollPaid(detail)}
          onRevertPayroll={() => askRevertPayroll(detail)}
          onMarkItemPaid={askMarkItemPaid}
          onRevertItem={askRevertItem}
          onItemChanged={async () => { await load(); }}
        />
      )}

      {editingId && (
        <PayrollMetaEditModal
          payroll={payrolls.find((p) => p.id === editingId)}
          onClose={() => setEditingId(null)}
          onSave={async (patch) => {
            try { await transportPayrollsService.update(editingId, patch); setEditingId(null); await load(); }
            catch (err) { toast.error(err?.message || "Error"); }
          }}
        />
      )}

      <ConfirmDialog
        open={!!confirmDelete}
        title="Eliminar quincena"
        message={confirmDelete ? `¿Eliminar la quincena "${confirmDelete.name}"? Los resúmenes vuelven a estar sueltos (no se borran).` : ""}
        confirmLabel="Eliminar"
        danger
        onCancel={() => setConfirmDelete(null)}
        onConfirm={async () => {
          try { await transportPayrollsService.delete(confirmDelete.id); setDetailId(null); setConfirmDelete(null); await load(); }
          catch (err) { toast.error(err?.message || "Error"); }
        }}
      />

      {confirmPay && (
        <TypeToConfirmModal
          word={confirmPay.verb}
          title={confirmPay.verb === "Revertir" ? "Revertir pago" : "Marcar como pagada"}
          message={confirmPay.label}
          confirmLabel={confirmPay.verb === "Revertir" ? "Revertir" : "Confirmar pago"}
          danger={confirmPay.verb === "Revertir"}
          onCancel={() => setConfirmPay(null)}
          onConfirm={confirmPay.onConfirm}
        />
      )}
    </div>
  );
}
