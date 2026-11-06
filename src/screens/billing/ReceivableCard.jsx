import { fmtCurrency } from "../../utils/format";
import { OtherTaxChip } from "./OtherTaxChip";
import { PaymentStatusSelect } from "./PaymentStatusSelect";
import { docTypeLabel } from "./receivablesLabels";

// Una factura pendiente en el teléfono: lo mismo que `ReceivableRow`, en una
// tarjeta como las del listado de Facturas, con el estado y el detalle abajo.
export function ReceivableCard({ row, ctx }) {
  const d = row.doc;
  const paid = Number(d.amountPaid) || 0;
  const hasNotes = !!(d.notes && d.notes.trim());
  const busy = ctx.actions.busyIds.has(d.id);
  return (
    <div className={`px-3 py-2.5 ${row.resolved ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <span className="font-mono">{d.fechaEmision}</span>
            <span>{docTypeLabel(d)}</span>
            <OtherTaxChip code={d.otroImpuestoCodigo} tasa={d.retencionTasa} />
            <span className="font-mono">· Folio {d.folio}</span>
          </div>
          {ctx.showCompany && <div className="mt-0.5 truncate text-xs">🏢 {ctx.companyLabel(d.companyId)}</div>}
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-sm font-semibold tabular-nums ${row.resolved ? "text-[var(--color-muted)] line-through" : "text-[var(--color-warning)]"}`}>
            {fmtCurrency(row.pending)}
          </div>
          <div className="text-[10px] tabular-nums text-[var(--color-muted)]">
            N {fmtCurrency(d.neto)} · IVA {fmtCurrency(d.iva)}
          </div>
          <div className="text-[10px] tabular-nums text-[var(--color-muted)]">Total {fmtCurrency(d.total)}</div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {paid > 0 && <span className="text-[10px] text-[var(--color-muted)]">Abonado {fmtCurrency(paid)}</span>}
        <PaymentStatusSelect
          value={d.paymentStatus || "unpaid"}
          disabled={busy}
          onChange={(next) => ctx.actions.markStatus(row, next)}
          className="min-h-[32px]"
        />
        <button
          type="button"
          onClick={() => ctx.onOpen(d)}
          title={hasNotes ? "Ver detalle (tiene notas)" : "Ver detalle / agregar notas"}
          className="ml-auto min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
        >
          {hasNotes ? "📝 Detalle" : "ℹ Detalle"}
        </button>
      </div>
    </div>
  );
}
