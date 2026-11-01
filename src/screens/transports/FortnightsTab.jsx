import { useMemo, useState, useEffect, useEffectEvent } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useCarriers } from "../../contexts/CarriersContext";
import { fortnightsService, paymentsService, tripsService } from "../../services/transportsService";
import { listCycles, listJobs, listSubjobs } from "../../services/jobLists";
import { useToast } from "../../contexts/ToastContext";
import { fmtCurrency } from "../../utils/format";
import { FortnightCreateModal } from "./FortnightCreateModal";
import { FortnightDetailModal } from "./FortnightDetailModal";
import { FortnightMetaEditModal } from "./FortnightMetaEditModal";
import { FortnightBalanceSummary } from "./FortnightBalanceSummary";
import { compareFortnightPeriod } from "./fortnights";
import { TypeToConfirmModal } from "./TypeToConfirmModal";
import ScreenLoader from "../../components/ScreenLoader";
import { attempt } from "../../utils/attempt";

// ============================================================
// PESTAÑA QUINCENAS
// ============================================================
//
// Una quincena (`transportPayrolls`) agrupa resúmenes (`transportPayments`)
// de varios transportistas, con nombre y un rango opcional que no tiene por
// qué ser de 15 días. Es la vista PRINCIPAL para pagar: cada resumen se marca
// pagado por separado o todos juntos con "Marcar quincena pagada". Marcar
// pagado y revertir piden escribir una palabra ("Pagada" o "Revertir").

export function FortnightsTab() {
  const toast = useToast();
  const { carriers } = useCarriers();
  const carriersById = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers]);

  const [fortnights, setFortnights] = useState([]);
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
    const { error: err } = await attempt(async () => {
      const [pr, py, fa, sub, cyc, pt] = await Promise.all([
        fortnightsService.listAll(),
        paymentsService.listAll(),
        listJobs(),
        listSubjobs(),
        listCycles(),
        tripsService.listPendingUnlinked(),
      ]);
      setFortnights(pr.sort(compareFortnightPeriod));
      setPayments(py);
      setFaenas(fa.filter((f) => !f.deleted));
      setSubfaenas(sub);
      setCycles(cyc);
      // Solo las vueltas no asignadas a ningún resumen — son las elegibles
      // para entrar a una quincena nueva.
      setPendingTrips(pt.filter((t) => !t.paymentId));
    });
    setLoading(false);
    if (err) throw err;
  };

  const loadOnMount = useEffectEvent(() => load());
  useEffect(() => { loadOnMount(); }, []);

  const paymentsById = useMemo(() => new Map(payments.map((p) => [p.id, p])), [payments]);
  const faenaById = useMemo(() => new Map(faenas.map((f) => [f.id, f])), [faenas]);
  const subfaenaById = useMemo(() => new Map(subfaenas.map((s) => [s.id, s])), [subfaenas]);
  const cycleById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);

  const looseSummaries = useMemo(
    () => payments.filter((p) => p.status !== "paid" && !p.payrollId),
    [payments],
  );

  const askMarkFortnightPaid = (fortnight) => {
    setConfirmPay({
      verb: "Pagada",
      label: `Marcar la quincena "${fortnight.name}" como PAGADA. Esto marca todos sus resúmenes (${(fortnight.paymentIds || []).length}) y sus vueltas como pagados.`,
      onConfirm: async () => {
        await fortnightsService.markPaid(fortnight.id);
        setConfirmPay(null);
        await load();
      },
    });
  };
  const askRevertFortnight = (fortnight) => {
    setConfirmPay({
      verb: "Revertir",
      label: `Revertir el pago de la quincena "${fortnight.name}". Esto vuelve a pendiente todos los resúmenes y vueltas.`,
      onConfirm: async () => {
        await fortnightsService.revertPaid(fortnight.id);
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

  const detail = detailId ? fortnights.find((p) => p.id === detailId) : null;

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

      {!loading && fortnights.length > 0 && (
        <FortnightBalanceSummary
          carriers={carriers}
          fortnights={fortnights}
          payments={payments}
        />
      )}

      {loading ? (
        <ScreenLoader />
      ) : fortnights.length === 0 ? (
        <div className="rounded-lg border border-dashed border-[var(--color-border)] py-10 text-center text-sm text-[var(--color-muted)]">
          Aún no hay quincenas. Crea la primera con + Nueva quincena.
        </div>
      ) : (
        <div className="space-y-2">
          {fortnights.map((p) => {
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
        <FortnightCreateModal
          carriers={carriers}
          carriersById={carriersById}
          faenas={faenas}
          pendingTrips={pendingTrips}
          looseSummaries={looseSummaries}
          onClose={() => setCreating(false)}
          onCreate={async ({ name, periodFrom, periodTo, notes, perCarrier, importSummaryIds }) => {
            const { error: err } = await attempt(async () => {
              // 1) Crea un resumen por transportista con sus vueltas sueltas filtradas.
              // 2) Suma los resúmenes existentes elegidos para importar.
              // 3) Crea la quincena con todos los paymentIds; fortnightsService.create
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
              await fortnightsService.create({
                name,
                periodFrom,
                periodTo,
                paymentIds: [...created, ...(importSummaryIds || [])],
                notes,
              });
              setCreating(false);
              await load();
            });
            if (err) toast.error(err?.message || "Error");
          }}
        />
      )}

      {detail && (
        <FortnightDetailModal
          fortnight={detail}
          items={(detail.paymentIds || []).map((pid) => paymentsById.get(pid)).filter(Boolean)}
          carriers={carriers}
          carriersById={carriersById}
          faenaById={faenaById}
          subfaenaById={subfaenaById}
          cycleById={cycleById}
          looseSummaries={looseSummaries}
          onClose={() => setDetailId(null)}
          onEditMeta={() => setEditingId(detail.id)}
          onDeleteFortnight={() => setConfirmDelete(detail)}
          onAddSummaries={async (ids) => { const { error: err } = await attempt(async () => { await fortnightsService.addPayments(detail.id, ids); await load(); }); if (err) toast.error(err?.message || "Error"); }}
          onRemoveSummary={async (pid) => { const { error: err } = await attempt(async () => { await fortnightsService.removePayments(detail.id, [pid]); await load(); }); if (err) toast.error(err?.message || "Error"); }}
          onMarkFortnightPaid={() => askMarkFortnightPaid(detail)}
          onRevertFortnight={() => askRevertFortnight(detail)}
          onMarkItemPaid={askMarkItemPaid}
          onRevertItem={askRevertItem}
          onItemChanged={async () => { await load(); }}
        />
      )}

      {editingId && (
        <FortnightMetaEditModal
          fortnight={fortnights.find((p) => p.id === editingId)}
          onClose={() => setEditingId(null)}
          onSave={async (patch) => {
            const { error: err } = await attempt(async () => { await fortnightsService.update(editingId, patch); setEditingId(null); await load(); });
            if (err) toast.error(err?.message || "Error");
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
          const { error: err } = await attempt(async () => { await fortnightsService.delete(confirmDelete.id); setDetailId(null); setConfirmDelete(null); await load(); });
          if (err) toast.error(err?.message || "Error");
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
