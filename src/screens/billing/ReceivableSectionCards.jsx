import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { BulkPaidButton } from "./BulkPaidButton";
import { ReceivableCard } from "./ReceivableCard";
import { formatPeriodPretty } from "./docs";
import { clientBulkMessage, companyBreakdown, monthBulkMessage, monthLabel, monthName } from "./receivablesLabels";

// Una franja de subtotal o de total, con el botón para marcar lo de ese
// grupo si tiene más de una factura.
function TotalStrip({ label, note, amount, strong, bulk }) {
  return (
    <div className={`flex flex-wrap items-center justify-between gap-2 px-3 py-1.5 text-xs font-semibold ${strong ? "bg-[var(--color-accent-soft)]" : "bg-[var(--color-surface-2)]"}`}>
      <div className="min-w-0">
        <div>{label}</div>
        {note && <div className="text-[10px] font-normal text-[var(--color-muted)]">{note}</div>}
      </div>
      <div className="flex items-center gap-2">
        <span className={`tabular-nums ${strong ? "text-sm" : ""}`}>{fmtCurrency(amount)}</span>
        {bulk}
      </div>
    </div>
  );
}

// Una sección de la pestaña Pendientes en el teléfono: lo mismo que
// `ReceivableSectionTable`, en tarjetas, con los subtotales como franjas.
export function ReceivableSectionCards({ groups, isVat, ctx }) {
  const { actions } = ctx;
  const bulkButton = (rows, count, label, message) =>
    count > 1 ? (
      <BulkPaidButton label={label} disabled={actions.bulkBusy} onClick={() => actions.askBulk(rows, "paid", message)} />
    ) : null;
  return (
    <div className="divide-y divide-[var(--color-border)] overflow-hidden rounded-md border border-[var(--color-border)]">
      {groups.map((g) => (
        <div key={g.key}>
          <div className="bg-[var(--color-accent-soft)] px-3 py-1.5 text-xs font-semibold">
            {g.razon || "—"}
            {g.rut && <span className="ml-2 font-normal text-[var(--color-muted)]">· {formatRutForDisplay(g.rut)}</span>}
            <span className="ml-2 font-normal text-[var(--color-muted)]">
              · {g.count === 0 ? "nada pendiente" : `${g.count} factura${g.count === 1 ? "" : "s"}`}
            </span>
          </div>
          {isVat
            ? g.months.map((m) => (
                <div key={m.periodo}>
                  <div className="px-3 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                    {formatPeriodPretty(m.periodo)}
                  </div>
                  <div className="divide-y divide-[var(--color-border)]">
                    {m.rows.map((r) => (
                      <ReceivableCard key={`${r.doc.id}_${r.category}`} row={r} ctx={ctx} />
                    ))}
                  </div>
                  <TotalStrip
                    label={`IVA pendiente ${monthLabel(m.periodo)}`}
                    amount={m.total}
                    bulk={bulkButton(m.rows, m.count, `✓ ${monthName(m.periodo)} pagado`, monthBulkMessage(g, m))}
                  />
                </div>
              ))
            : (
                <div className="divide-y divide-[var(--color-border)]">
                  {g.rows.map((r) => (
                    <ReceivableCard key={`${r.doc.id}_${r.category}`} row={r} ctx={ctx} />
                  ))}
                </div>
              )}
          <TotalStrip
            strong
            label={isVat ? `IVA pendiente total ${g.razon || ""}` : `Total ${g.razon || ""}`}
            note={ctx.showCompany ? companyBreakdown(g.byCompany, ctx.companyLabel) : ""}
            amount={g.total}
            bulk={bulkButton(g.rows, g.count, isVat ? "✓ Todo el IVA pagado" : "✓ Todas pagadas", clientBulkMessage(g, isVat))}
          />
        </div>
      ))}
    </div>
  );
}
