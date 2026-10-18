import { useMemo } from "react";
import Modal from "../../components/Modal";
import { fmtCurrency } from "../../utils/format";
import { paymentSplit, compareFortnightPeriod, compactDate } from "./fortnights";

// Todos los resúmenes de un transportista, agrupados por quincena, con lo
// pagado, lo pendiente y los abonos de cada uno: el desglose de las celdas del
// balance de quincenas. Incluye los resúmenes sueltos (sin quincena), que el
// balance no muestra. Se abre desde el balance: en desktop con el nombre del
// transportista, en mobile con su tarjeta.
export function CarrierSummariesModal({ open, onClose, row, payments, fortnights }) {
  const grupos = useMemo(() => {
    if (!row) return [];
    const mios = payments.filter((p) => (p.carrierId || "__none__") === row.carrierId);
    const byFortnight = new Map(); // payrollId | "__sueltos__" → resúmenes
    for (const p of mios) {
      const k = p.payrollId || "__sueltos__";
      if (!byFortnight.has(k)) byFortnight.set(k, []);
      byFortnight.get(k).push(p);
    }
    const byId = new Map(fortnights.map((q) => [q.id, q]));
    const out = [];
    for (const [k, items] of byFortnight) {
      const q = k === "__sueltos__" ? null : byId.get(k);
      items.sort((a, b) => String(b.periodFrom || "").localeCompare(String(a.periodFrom || "")));
      out.push({
        key: k,
        fortnight: q,
        // Un payrollId que apunta a una quincena que ya no existe se rotula
        // "Quincena eliminada", no "Sin quincena".
        titulo: q ? q.name : k === "__sueltos__" ? "Sin quincena" : "Quincena eliminada",
        activa: q ? q.status !== "paid" : false,
        items,
        pending: items.reduce((s, p) => s + paymentSplit(p).pending, 0),
        paid: items.reduce((s, p) => s + paymentSplit(p).paid, 0),
      });
    }
    // Mayor pendiente primero; a igual pendiente, la quincena más antigua arriba
    // (compareFortnightPeriod con los argumentos invertidos).
    out.sort((a, b) => (b.pending - a.pending) || (a.fortnight && b.fortnight ? compareFortnightPeriod(b.fortnight, a.fortnight) : 0));
    return out;
  }, [row, payments, fortnights]);

  const totalPend = grupos.reduce((s, g) => s + g.pending, 0);
  const totalPaid = grupos.reduce((s, g) => s + g.paid, 0);

  if (!row) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={row.alias + (row.name ? ` — ${row.name}` : "")}
    >
      <div className="mb-4 grid grid-cols-3 gap-2 text-center">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Pendiente</div>
          <div className="text-sm font-bold tabular-nums text-[var(--color-accent)]">{fmtCurrency(totalPend)}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Pagado</div>
          <div className="text-sm font-bold tabular-nums text-[var(--color-success)]">{fmtCurrency(totalPaid)}</div>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Resúmenes</div>
          <div className="text-sm font-bold tabular-nums">{grupos.reduce((s, g) => s + g.items.length, 0)}</div>
        </div>
      </div>

      {grupos.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-6 text-center text-xs text-[var(--color-muted)]">
          Este transportista no tiene resúmenes.
        </div>
      ) : (
        <div className="space-y-3">
          {grupos.map((g) => (
            <div key={g.key} className="overflow-hidden rounded-lg border border-[var(--color-border)]">
              <div className="flex flex-wrap items-center justify-between gap-2 bg-[var(--color-surface-2)] px-3 py-2">
                <span className="flex items-center gap-2 text-sm font-medium">
                  {g.titulo}
                  {g.activa && (
                    <span className="rounded bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-accent)]">
                      abierta
                    </span>
                  )}
                </span>
                <span className="text-xs tabular-nums">
                  {g.pending > 0 && (
                    <span className="font-semibold text-[var(--color-accent)]">{fmtCurrency(g.pending)}</span>
                  )}
                  {g.paid > 0 && (
                    <span className="ml-2 text-[var(--color-success)]">pagado {fmtCurrency(g.paid)}</span>
                  )}
                </span>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {g.items.map((p) => {
                  const { pending, paid, total } = paymentSplit(p);
                  const periodo = (p.periodFrom || p.periodTo)
                    ? `${compactDate(p.periodFrom)} → ${compactDate(p.periodTo)}`
                    : "sin período";
                  return (
                    <div key={p.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-xs">
                      <span className="flex flex-col">
                        <span className="tabular-nums">{periodo}</span>
                        <span className="text-[10px] text-[var(--color-muted)]">
                          {(p.tripIds || []).length} vuelta{(p.tripIds || []).length === 1 ? "" : "s"}
                        </span>
                      </span>
                      <span className="flex flex-col items-end tabular-nums">
                        <span className="font-semibold">{fmtCurrency(total)}</span>
                        {p.status === "paid" ? (
                          <span className="text-[10px] text-[var(--color-success)]">✓ pagado</span>
                        ) : paid > 0 ? (
                          <span className="text-[10px] text-[var(--color-warning)]">
                            abonado {fmtCurrency(paid)} · falta {fmtCurrency(pending)}
                          </span>
                        ) : (
                          <span className="text-[10px] text-[var(--color-muted)]">pendiente</span>
                        )}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
