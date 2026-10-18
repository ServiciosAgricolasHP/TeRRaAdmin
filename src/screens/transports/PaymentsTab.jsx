import { useState, useEffect, useMemo } from "react";
import ConfirmDialog from "../../components/ConfirmDialog";
import { useCarriers } from "../../contexts/CarriersContext";
import { paymentsService, fortnightsService } from "../../services/transportsService";
import { faenasService, subfaenasService, cyclesService } from "../../services";
import { useToast } from "../../contexts/ToastContext";
import { BalanceSummary } from "./BalanceSummary";
import { GenerateSummaryModal } from "./GenerateSummaryModal";
import { isoDateNDaysAgo, DEFAULT_HISTORY_DAYS } from "./historyRange";
import { PaymentDetailModal } from "./PaymentDetailModal";
import { PaymentSection } from "./PaymentSection";
import { PrintMultipleModal } from "./PrintMultipleModal";

// ============================================================
// PESTAÑA RESÚMENES
// ============================================================

export function PaymentsTab() {
  const toast = useToast();
  const { activeCarriers, carriers } = useCarriers();
  const [payments, setPayments] = useState([]);
  const [faenas, setFaenas] = useState([]);
  const [subfaenas, setSubfaenas] = useState([]);
  const [cycles, setCycles] = useState([]);
  // Quincenas (transportPayrolls): muestran a cuál pertenece cada resumen y
  // alimentan el filtro por quincena.
  const [fortnights, setFortnights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [printingMany, setPrintingMany] = useState(false);
  const [viewing, setViewing] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null);
  const [showHistoricPaid, setShowHistoricPaid] = useState(false);
  // Se incrementa para que el balance vuelva a leer después de generar,
  // editar, pagar, revertir o eliminar un resumen.
  const [balanceVersion, setBalanceVersion] = useState(0);

  // Filtros y orden de la lista de resúmenes; solo el orden se guarda en
  // localStorage.
  const [search, setSearch] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");
  const [sortBy, setSortBy] = useState(() => {
    try { return localStorage.getItem("transports_payments_sort") || "period_desc"; }
    catch { return "period_desc"; }
  });
  useEffect(() => {
    try { localStorage.setItem("transports_payments_sort", sortBy); } catch { /* noop */ }
  }, [sortBy]);

  const reload = async () => {
    setLoading(true);
    try {
      const paymentsPromise = showHistoricPaid
        ? paymentsService.listAll()
        : paymentsService.listSince(isoDateNDaysAgo(DEFAULT_HISTORY_DAYS));
      const [list, fa, sub, cyc, tp] = await Promise.all([
        paymentsPromise,
        faenasService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        subfaenasService.list({ cache: true, persist: true, ttl: 10 * 60 * 1000 }),
        cyclesService.list({ cache: true, persist: true, ttl: 5 * 60 * 1000 }),
        fortnightsService.listAll(),
      ]);
      list.sort((a, b) => {
        const aT = a.createdAt?.seconds || 0;
        const bT = b.createdAt?.seconds || 0;
        return bT - aT;
      });
      setPayments(list);
      setFaenas(fa);
      setSubfaenas(sub);
      setCycles(cyc);
      setFortnights(tp);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showHistoricPaid]);

  // Recarga después de ediciones hechas fuera de PaymentDetailModal (p. ej.
  // editar o quitar vueltas desde la vista unificada). Igual que su
  // onChanged, pero sin refrescar `viewing`.
  const refreshAfterEdit = async () => {
    await reload();
    setBalanceVersion((v) => v + 1);
  };

  const carrierById = useMemo(() => new Map(carriers.map((c) => [c.id, c])), [carriers]);
  const faenaById = useMemo(() => new Map(faenas.map((f) => [f.id, f])), [faenas]);
  const subfaenaById = useMemo(() => new Map(subfaenas.map((s) => [s.id, s])), [subfaenas]);
  const cycleById = useMemo(() => new Map(cycles.map((c) => [c.id, c])), [cycles]);
  const fortnightById = useMemo(
    () => new Map(fortnights.map((tp) => [tp.id, tp])),
    [fortnights],
  );

  // Filtro por quincena: "all" (todas), "none" (sin quincena) o el id de una
  // quincena.
  const [fortnightFilter, setFortnightFilter] = useState("all");

  // Búsqueda (alias o nombre del transportista), rango de fechas (cruce con el
  // período del resumen), quincena y orden. Se aplica antes de separar por
  // estado, así pendientes y pagados usan el mismo filtro.
  const filteredSorted = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = payments.filter((p) => {
      if (q) {
        const c = carrierById.get(p.carrierId);
        const haystack = `${c?.alias || ""} ${c?.name || ""}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      if (filterFrom || filterTo) {
        const pFrom = p.periodFrom || p.periodTo || "";
        const pTo = p.periodTo || p.periodFrom || "";
        if (!pFrom && !pTo) return false; // con filtro de fechas, un resumen sin período queda fuera
        if (filterFrom && pTo && pTo < filterFrom) return false;
        if (filterTo && pFrom && pFrom > filterTo) return false;
      }
      if (fortnightFilter === "none" && p.payrollId) return false;
      if (fortnightFilter !== "all" && fortnightFilter !== "none" && p.payrollId !== fortnightFilter) return false;
      return true;
    });
    const cmpStr = (a, b) => String(a || "").localeCompare(String(b || ""), "es");
    const periodKey = (p) => p.periodFrom || p.periodTo || "";
    const lastPeriodKey = (p) => p.periodTo || p.periodFrom || "";
    const createdKey = (p) => p.createdAt?.seconds || 0;
    const carrierKey = (p) => carrierById.get(p.carrierId)?.alias || p.carrierId || "";
    filtered.sort((a, b) => {
      switch (sortBy) {
        case "period_asc":
          return cmpStr(periodKey(a), periodKey(b)) || createdKey(b) - createdKey(a);
        case "period_desc":
          return cmpStr(lastPeriodKey(b), lastPeriodKey(a)) || createdKey(b) - createdKey(a);
        case "amount_desc":
          return (Number(b.total) || 0) - (Number(a.total) || 0);
        case "amount_asc":
          return (Number(a.total) || 0) - (Number(b.total) || 0);
        case "carrier":
          return cmpStr(carrierKey(a), carrierKey(b)) || createdKey(b) - createdKey(a);
        case "created_desc":
        default:
          return createdKey(b) - createdKey(a);
      }
    });
    return filtered;
  }, [payments, carrierById, search, filterFrom, filterTo, sortBy, fortnightFilter]);

  const pending = filteredSorted.filter((p) => p.status === "pending");
  const paid = filteredSorted.filter((p) => p.status === "paid");
  const totalCount = filteredSorted.length;
  const totalAll = payments.length;
  const hasActiveFilter = !!(search || filterFrom || filterTo || fortnightFilter !== "all");
  const clearFilters = () => { setSearch(""); setFilterFrom(""); setFilterTo(""); setFortnightFilter("all"); };

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <label className="flex items-center gap-1 text-xs">
          <input
            type="checkbox"
            checked={showHistoricPaid}
            onChange={(e) => setShowHistoricPaid(e.target.checked)}
          />
          <span>ver histórico completo</span>
          {!showHistoricPaid && (
            <span className="ml-1 text-[var(--color-muted)]">
              (por defecto últimos {DEFAULT_HISTORY_DAYS} días)
            </span>
          )}
        </label>
        <button
          onClick={() => setPrintingMany(true)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
          title="Imprimir o exportar varios resúmenes a la vez"
        >
          🖨 Imprimir varios
        </button>
        <button
          onClick={() => setGenerating(true)}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)]"
        >
          + Generar resumen
        </button>
      </div>

      <BalanceSummary carriers={carriers} reloadVersion={balanceVersion} />

      <div className="mb-4 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="🔍 Buscar transportista…"
            className="min-w-[160px] flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1.5 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[var(--color-muted)]">Período</span>
            <input
              type="date"
              value={filterFrom}
              onChange={(e) => setFilterFrom(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
            />
            <span className="text-[var(--color-muted)]">→</span>
            <input
              type="date"
              value={filterTo}
              onChange={(e) => setFilterTo(e.target.value)}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-1.5 py-1 text-xs outline-none focus:border-[var(--color-accent)]"
            />
          </div>
          <select
            value={fortnightFilter}
            onChange={(e) => setFortnightFilter(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
            title="Filtrar por quincena"
          >
            <option value="all">Todas las quincenas</option>
            <option value="none">⚠️ Sin quincena</option>
            {fortnights
              .slice()
              .sort((a, b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0))
              .map((tp) => (
                <option key={tp.id} value={tp.id}>
                  🧾 {tp.name}{tp.status === "paid" ? " ✓" : ""}
                </option>
              ))}
          </select>
          <select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-xs outline-none focus:border-[var(--color-accent)]"
            title="Ordenar por"
          >
            <option value="period_desc">Período más reciente</option>
            <option value="period_asc">Período más antiguo</option>
            <option value="amount_desc">Monto mayor</option>
            <option value="amount_asc">Monto menor</option>
            <option value="carrier">Transportista (A→Z)</option>
            <option value="created_desc">Creación más reciente</option>
          </select>
          {hasActiveFilter && (
            <button
              onClick={clearFilters}
              className="rounded-md border border-[var(--color-border)] px-2 py-1 text-xs text-[var(--color-muted)] hover:text-[var(--color-danger)]"
              title="Limpiar filtros"
            >
              ✕ Limpiar
            </button>
          )}
          <span className="ml-auto text-[11px] text-[var(--color-muted)] tabular-nums">
            {hasActiveFilter ? `${totalCount}/${totalAll}` : `${totalAll}`} resumen{totalAll === 1 ? "" : "es"}
          </span>
        </div>
      </div>

      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">Cargando...</div>
      ) : (
        <>
          <PaymentSection
            title="Pendientes"
            payments={pending}
            carrierById={carrierById}
            fortnightById={fortnightById}
            faenaById={faenaById}
            subfaenaById={subfaenaById}
            cycleById={cycleById}
            onView={setViewing}
            empty={hasActiveFilter ? "Ningún pendiente coincide con el filtro" : "Sin resúmenes pendientes"}
            carriers={carriers}
            onChanged={refreshAfterEdit}
          />
          <div className="mt-6">
            <PaymentSection
              title="Pagados"
              payments={paid}
              carrierById={carrierById}
              fortnightById={fortnightById}
              faenaById={faenaById}
              subfaenaById={subfaenaById}
              cycleById={cycleById}
              onView={setViewing}
              empty={hasActiveFilter ? "Ningún pago coincide con el filtro" : "Sin pagos registrados"}
              dim
              carriers={carriers}
              onChanged={refreshAfterEdit}
            />
          </div>
        </>
      )}

      <GenerateSummaryModal
        open={generating}
        onClose={() => setGenerating(false)}
        carriers={activeCarriers}
        faenas={faenas}
        faenaById={faenaById}
        subfaenaById={subfaenaById}
        cycleById={cycleById}
        onGenerated={async () => {
          setGenerating(false);
          await reload();
          setBalanceVersion((v) => v + 1);
        }}
      />

      <PrintMultipleModal
        open={printingMany}
        onClose={() => setPrintingMany(false)}
        payments={payments}
        carriers={carriers}
        faenas={faenas}
        subfaenas={subfaenas}
        carrierById={carrierById}
        faenaById={faenaById}
        subfaenaById={subfaenaById}
        cycleById={cycleById}
      />

      <PaymentDetailModal
        open={!!viewing}
        onClose={() => setViewing(null)}
        payment={viewing}
        carrier={viewing ? carrierById.get(viewing.carrierId) : null}
        carriers={carriers}
        faenaById={faenaById}
        subfaenaById={subfaenaById}
        cycleById={cycleById}
        onPay={() => setConfirmAction({ type: "pay", payment: viewing })}
        onRevert={() => setConfirmAction({ type: "revert", payment: viewing })}
        onDelete={() => setConfirmAction({ type: "delete", payment: viewing })}
        onChanged={async () => {
          // Recarga la lista y el balance, y vuelve a leer el resumen abierto:
          // su total cambia al editar las vueltas.
          await reload();
          setBalanceVersion((v) => v + 1);
          if (viewing) {
            const updated = await paymentsService.getById(viewing.id);
            if (updated) setViewing(updated);
          }
        }}
      />

      <ConfirmDialog
        open={!!confirmAction}
        title={
          confirmAction?.type === "pay" ? "Marcar como pagado" :
          confirmAction?.type === "revert" ? "Revertir pago" :
          "Eliminar resumen"
        }
        message={
          confirmAction?.type === "pay"
            ? "Todas las vueltas de este resumen se marcarán como pagadas."
            : confirmAction?.type === "revert"
              ? "El resumen volverá a pendiente y las vueltas también."
              : "El resumen será eliminado. Las vueltas vinculadas vuelven a quedar pendientes."
        }
        danger={confirmAction?.type === "delete"}
        onCancel={() => setConfirmAction(null)}
        onConfirm={async () => {
          const a = confirmAction;
          setConfirmAction(null);
          try {
            if (a.type === "pay") await paymentsService.markPaid(a.payment.id);
            else if (a.type === "revert") await paymentsService.revertPaid(a.payment.id);
            else if (a.type === "delete") await paymentsService.deleteSummary(a.payment.id);
            setViewing(null);
            await reload();
            setBalanceVersion((v) => v + 1);
          } catch (err) {
            toast.error(err.message || "Error");
          }
        }}
      />
    </div>
  );
}
