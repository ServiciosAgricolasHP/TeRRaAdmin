import { Fragment } from "react";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { BulkPaidButton } from "./BulkPaidButton";
import { ReceivableRow } from "./ReceivableRow";
import { formatPeriodPretty } from "./docs";
import { clientBulkMessage, companyBreakdown, monthBulkMessage, monthLabel, monthName } from "./receivablesLabels";

// Una línea de subtotal o de total: la etiqueta, lo que se debe bajo la
// columna Pendiente y, si hay más de una factura, el botón para marcarlas.
function TotalRow({ cols, label, note, amount, strong, bulk }) {
  return (
    <tr className={`border-t border-[var(--color-border)] text-xs font-semibold ${strong ? "bg-[var(--color-accent-soft)]" : "bg-[var(--color-surface-2)]"}`}>
      <td colSpan={cols - 3} className="px-2 py-1.5 text-right">
        {label}
        {note && <div className="text-[10px] font-normal text-[var(--color-muted)]">{note}</div>}
      </td>
      <td className={`whitespace-nowrap px-2 py-1.5 text-right tabular-nums ${strong ? "text-sm" : ""}`}>{fmtCurrency(amount)}</td>
      <td colSpan={2} className="px-2 py-1 text-center">{bulk}</td>
    </tr>
  );
}

// Una sección de la pestaña Pendientes en el escritorio, con las columnas del
// listado de Facturas: las facturas por cobrar (`isVat` falso) o el IVA
// pendiente, por cliente. En el IVA, cada cliente va por mes, con el subtotal
// de cada mes y el total del cliente.
export function ReceivableSectionTable({ groups, isVat, ctx }) {
  const cols = ctx.showCompany ? 11 : 10;
  const { actions } = ctx;
  const bulkButton = (rows, count, label, message) =>
    count > 1 ? (
      <BulkPaidButton label={label} disabled={actions.bulkBusy} onClick={() => actions.askBulk(rows, "paid", message)} />
    ) : null;
  return (
    <div className="rounded-md border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
          <tr>
            <th className="px-2 py-2 text-left">Fecha</th>
            <th className="px-2 py-2 text-left">Tipo</th>
            <th className="px-2 py-2 text-right">Folio</th>
            {ctx.showCompany && <th className="px-2 py-2 text-left">Empresa</th>}
            <th className="px-2 py-2 text-right">Neto</th>
            <th className="px-2 py-2 text-right">IVA</th>
            <th className="px-2 py-2 text-right">Total</th>
            <th className="px-2 py-2 text-right">Abonos</th>
            <th className="px-2 py-2 text-right">{isVat ? "IVA pendiente" : "Pendiente"}</th>
            <th className="px-2 py-2 text-center">Estado</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <Fragment key={g.key}>
              <tr className="bg-[var(--color-accent-soft)]">
                <td colSpan={cols} className="px-2 py-1.5 text-xs font-semibold">
                  {g.razon || "—"}
                  {g.rut && <span className="ml-2 font-normal text-[var(--color-muted)]">· {formatRutForDisplay(g.rut)}</span>}
                  <span className="ml-2 font-normal text-[var(--color-muted)]">
                    · {g.count === 0 ? "nada pendiente" : `${g.count} factura${g.count === 1 ? "" : "s"}`}
                  </span>
                </td>
              </tr>
              {isVat
                ? g.months.map((m) => (
                    <Fragment key={m.periodo}>
                      <tr>
                        <td colSpan={cols} className="px-2 pb-0.5 pt-2 text-[11px] font-semibold uppercase tracking-wide text-[var(--color-muted)]">
                          {formatPeriodPretty(m.periodo)}
                        </td>
                      </tr>
                      {m.rows.map((r) => (
                        <ReceivableRow key={`${r.doc.id}_${r.category}`} row={r} ctx={ctx} />
                      ))}
                      <TotalRow
                        cols={cols}
                        label={`IVA pendiente ${monthLabel(m.periodo)}`}
                        amount={m.total}
                        bulk={bulkButton(m.rows, m.count, `✓ ${monthName(m.periodo)} pagado`, monthBulkMessage(g, m))}
                      />
                    </Fragment>
                  ))
                : g.rows.map((r) => <ReceivableRow key={`${r.doc.id}_${r.category}`} row={r} ctx={ctx} />)}
              <TotalRow
                cols={cols}
                strong
                label={isVat ? `IVA pendiente total ${g.razon || ""}` : `Total ${g.razon || ""}`}
                note={ctx.showCompany ? companyBreakdown(g.byCompany, ctx.companyLabel) : ""}
                amount={g.total}
                bulk={bulkButton(g.rows, g.count, isVat ? "✓ Todo el IVA pagado" : "✓ Todas pagadas", clientBulkMessage(g, isVat))}
              />
            </Fragment>
          ))}
        </tbody>
      </table>
    </div>
  );
}
