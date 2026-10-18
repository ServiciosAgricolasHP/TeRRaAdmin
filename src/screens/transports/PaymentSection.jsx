import { useMemo, useState } from "react";
import { fmtCurrency } from "../../utils/format";
import { UnifiedSummaryModal } from "./UnifiedSummaryModal";

export function PaymentSection({ title, payments, carrierById, transportPayrollById, faenaById, subfaenaById, cycleById, onView, empty, dim = false, carriers = [], onChanged }) {
  // Resúmenes agrupados por transportista. Cada grupo se puede colapsar y
  // arranca expandido.
  const groups = useMemo(() => {
    const map = new Map();
    for (const p of payments) {
      const cid = p.carrierId || "__none__";
      if (!map.has(cid)) {
        const c = carrierById.get(p.carrierId);
        map.set(cid, {
          carrierId: cid,
          alias: c?.alias || (cid === "__none__" ? "Sin transportista" : "—"),
          name: c?.name || "",
          items: [],
          total: 0,
        });
      }
      const g = map.get(cid);
      g.items.push(p);
      g.total += Number(p.total) || 0;
    }
    return [...map.values()].sort((a, b) => a.alias.localeCompare(b.alias, "es"));
  }, [payments, carrierById]);

  const [collapsedCarriers, setCollapsedCarriers] = useState(() => new Set());
  const toggleCarrier = (cid) => setCollapsedCarriers((prev) => {
    const next = new Set(prev);
    if (next.has(cid)) next.delete(cid);
    else next.add(cid);
    return next;
  });

  // Vista unificada: junta las vueltas de TODOS los resúmenes de un
  // transportista (p. ej. las dos quincenas de un mes) en una sola tabla
  // filtrable por día.
  const [unifiedGroup, setUnifiedGroup] = useState(null);

  const fmtDate = (d) => {
    if (!d || typeof d !== "string") return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}/${m[1].slice(2)}` : d;
  };

  const renderPaymentCard = (p) => {
    const c = carrierById.get(p.carrierId);
    const from = fmtDate(p.periodFrom);
    const to = fmtDate(p.periodTo);
    const period = from && to && from !== to
      ? `${from} → ${to}`
      : (from || to || "");
    return (
      <button
        key={p.id}
        onClick={() => onView(p)}
        className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-left text-sm hover:border-[var(--color-accent)]"
      >
        {paymentCardContent(p, c, period, transportPayrollById)}
      </button>
    );
  };

  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-[var(--color-muted)]">{title}</h3>
      {payments.length === 0 ? (
        <p className="rounded-md border border-dashed border-[var(--color-border)] py-4 text-center text-xs text-[var(--color-muted)]">
          {empty}
        </p>
      ) : (
        <div className={`space-y-2 ${dim ? "opacity-90" : ""}`}>
          {groups.map((g) => {
            const collapsed = collapsedCarriers.has(g.carrierId);
            return (
              <div key={g.carrierId} className="rounded-md border border-[var(--color-border)]">
                <div className="flex w-full flex-wrap items-center gap-2 bg-[var(--color-surface-2)] px-3 py-2 text-sm">
                  <button
                    type="button"
                    onClick={() => toggleCarrier(g.carrierId)}
                    className="flex items-center gap-2 text-left hover:text-[var(--color-accent)]"
                  >
                    <span className="text-[var(--color-muted)]">{collapsed ? "▸" : "▾"}</span>
                    <span className="font-semibold">{g.alias}</span>
                    {g.name && <span className="text-xs text-[var(--color-muted)]">· {g.name}</span>}
                    <span className="text-[10px] text-[var(--color-muted)]">
                      · {g.items.length} resumen{g.items.length === 1 ? "" : "es"}
                    </span>
                  </button>
                  {g.items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setUnifiedGroup(g)}
                      title="Ver todas las vueltas de estos resúmenes juntas en una sola tabla, filtrable por día"
                      className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)]"
                    >
                      🔗 Vista unificada
                    </button>
                  )}
                  <span className="ml-auto font-semibold tabular-nums">
                    {fmtCurrency(g.total)}
                  </span>
                </div>
                {!collapsed && (
                  <div className="grid gap-2 p-2">
                    {g.items.map(renderPaymentCard)}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <UnifiedSummaryModal
        open={!!unifiedGroup}
        onClose={() => setUnifiedGroup(null)}
        group={unifiedGroup}
        faenaById={faenaById}
        subfaenaById={subfaenaById}
        cycleById={cycleById}
        carriers={carriers}
        onChanged={onChanged}
      />
    </div>
  );
}

// Contenido de la tarjeta de un resumen: período, quincena, cantidad de
// vueltas, total y estado.
function paymentCardContent(p, c, period, transportPayrollById) {
  return (
    <>
      <div className="min-w-0 flex-1">
        <div className="font-medium">{c?.alias || p.carrierId} <span className="text-[var(--color-muted)]">— {c?.name}</span></div>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
          {period ? (
            <span className="inline-flex items-center gap-1 rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 font-medium tabular-nums text-[var(--color-accent)]">
              📅 {period}
            </span>
          ) : (
            <span className="text-[var(--color-muted)] italic">sin período</span>
          )}
          {(() => {
            const tp = p.payrollId && transportPayrollById?.get(p.payrollId);
            if (tp) {
              const isPaid = tp.status === "paid";
              return (
                <span
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 font-medium ${
                    isPaid
                      ? "bg-[var(--color-success-soft)] text-[var(--color-success)]"
                      : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300"
                  }`}
                  title={`Quincena: ${tp.name}${isPaid ? " (pagada)" : " (pendiente)"}`}
                >
                  🧾 {tp.name}{isPaid && " ✓"}
                </span>
              );
            }
            if (p.payrollId) {
              return (
                <span className="inline-flex items-center gap-1 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[var(--color-muted)]" title="Quincena no cargada">
                  🧾 quincena #{String(p.payrollId).slice(-4)}
                </span>
              );
            }
            return (
              <span className="inline-flex items-center gap-1 rounded border border-dashed border-[var(--color-border)] px-1.5 py-0.5 text-[var(--color-muted)]" title="Este resumen no está asignado a ninguna quincena">
                🧾 sin quincena
              </span>
            );
          })()}
          <span className="text-[var(--color-muted)]">· {(p.tripIds || []).length} vuelta{(p.tripIds || []).length === 1 ? "" : "s"}</span>
          {p.groupBy && (
            <span className="text-[var(--color-muted)]">· agrupado por {p.groupBy === "day" ? "día" : "faena"}</span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className="font-semibold tabular-nums">{fmtCurrency(p.total)}</div>
        {(() => {
          // Resumen pendiente con abonos: muestra el saldo (total − abonos)
          // bajo el total.
          const abonado = (p.abonos || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
          if (p.status !== "paid" && abonado > 0) {
            const pending = Math.max(0, (Number(p.total) || 0) - abonado);
            return (
              <div className="text-[10px] tabular-nums text-[var(--color-warning)]">
                pend: {fmtCurrency(pending)}
              </div>
            );
          }
          return null;
        })()}
        <div
          className={`text-[10px] ${
            p.status === "paid"
              ? "text-[var(--color-success)]"
              : "text-[var(--color-warning)]"
          }`}
        >
          {p.status === "paid" ? "pagado" : "pendiente"}
        </div>
      </div>
    </>
  );
}
