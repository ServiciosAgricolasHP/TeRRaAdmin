import { fmtCurrency } from "../../utils/format";
import { OtherTaxChip } from "./OtherTaxChip";
import { PaymentStatusSelect } from "./PaymentStatusSelect";
import { docTypeLabel } from "./receivablesLabels";

// Una factura pendiente en la tabla del escritorio, con las columnas del
// listado de Facturas, lo que falta (`row.pending`) y el estado, que se cambia
// en la misma fila. Una resuelta en esta visita va atenuada y con lo que
// debía tachado.
export function ReceivableRow({ row, ctx }) {
  const d = row.doc;
  const paid = Number(d.amountPaid) || 0;
  const hasNotes = !!(d.notes && d.notes.trim());
  const busy = ctx.actions.busyIds.has(d.id);
  const num = "whitespace-nowrap px-2 py-1.5 text-right tabular-nums";
  return (
    <tr className={`border-t border-[var(--color-border)] ${row.resolved ? "opacity-60" : "hover:bg-[var(--color-surface-2)]"}`}>
      <td className="whitespace-nowrap px-2 py-1.5 font-mono text-xs">{d.fechaEmision || "—"}</td>
      <td className="px-2 py-1.5 text-xs">
        {docTypeLabel(d)}
        <OtherTaxChip code={d.otroImpuestoCodigo} tasa={d.retencionTasa} />
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{d.folio}</td>
      {ctx.showCompany && <td className="whitespace-nowrap px-2 py-1.5 text-xs">{ctx.companyLabel(d.companyId)}</td>}
      <td className={num}>{fmtCurrency(d.neto)}</td>
      <td className={num}>{fmtCurrency(d.iva)}</td>
      <td className={`${num} font-semibold`}>{fmtCurrency(d.total)}</td>
      <td className={num}>{paid > 0 ? fmtCurrency(paid) : <span className="text-[var(--color-muted)]">—</span>}</td>
      <td className={`${num} font-semibold ${row.resolved ? "text-[var(--color-muted)] line-through" : "text-[var(--color-warning)]"}`}>
        {fmtCurrency(row.pending)}
      </td>
      <td className="px-2 py-1.5 text-center">
        <PaymentStatusSelect
          value={d.paymentStatus || "unpaid"}
          disabled={busy}
          onChange={(next) => ctx.actions.markStatus(row, next)}
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <button
          type="button"
          onClick={() => ctx.onOpen(d)}
          title={hasNotes ? "Ver detalle (tiene notas)" : "Ver detalle / agregar notas"}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
        >
          {hasNotes ? "📝" : "ℹ"}
        </button>
      </td>
    </tr>
  );
}
