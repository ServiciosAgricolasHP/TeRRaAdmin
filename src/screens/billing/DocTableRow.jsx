import { CREDIT_NOTE_TYPES } from "../../utils/cashFlowProjection";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { OtherTaxChip } from "./OtherTaxChip";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { CostCenterSelect } from "./CostCenterSelect";
import { CREDIT_NOTE_STATE } from "./docs";
import { PaymentStatusSelect } from "./PaymentStatusSelect";

// Una fila de la tabla del listado en el escritorio: los mismos datos que
// `DocCard`, en columnas.
export function DocTableRow({ d, cancellingByDocId, costCenters, kindTab, saveDocCostCenter, setDetailDoc, setPaymentStatus }) {
  const counterpartyName = kindTab === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
  const rut = kindTab === "venta" ? d.rutReceptor : d.rutEmisor;
  const isNC = CREDIT_NOTE_TYPES.has(Number(d.tipo));
  const isFuel = d.otroImpuestoCategory === "combustible";
  const st = d.paymentStatus || "unpaid";
  const hasNotes = !!(d.notes && d.notes.trim());
  return (
    <tr key={d.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
      <td className="px-2 py-1.5 font-mono text-xs">{d.fechaEmision}</td>
      <td className="px-2 py-1.5 text-xs">
        <span className={isNC ? "rounded px-1.5 py-0.5 bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : ""}>
          {d.tipoLabel || dteTypeLabel(d.tipo)}
        </span>
        <OtherTaxChip code={d.otroImpuestoCodigo} tasa={d.retencionTasa} />
      </td>
      <td className="px-2 py-1.5 text-right font-mono tabular-nums">{d.folio}</td>
      <td className="px-2 py-1.5 truncate max-w-[260px]">{counterpartyName || "—"}</td>
      <td className="px-2 py-1.5 font-mono text-xs">{formatRutForDisplay(rut)}</td>
      <td className={`px-2 py-1.5 text-right tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>
        {isNC ? "−" : ""}{fmtCurrency(d.neto)}
      </td>
      <td className={`px-2 py-1.5 text-right tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>
        {isNC ? "−" : ""}{fmtCurrency(d.iva)}
      </td>
      <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>
        {isNC ? "−" : ""}{fmtCurrency(d.total)}
      </td>
      <td className="px-2 py-1.5 text-right tabular-nums">
        {(() => {
          if (isNC) return <span className="text-[var(--color-muted)]">—</span>;
          const pays = Array.isArray(d.payments) ? d.payments : [];
          const paid = Number(d.amountPaid) || pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
          if (paid <= 0) return <span className="text-[var(--color-muted)]">—</span>;
          const bal = (Number(d.total) || 0) - paid;
          const full = bal <= 0.01;
          return (
            <div className="flex flex-col items-end leading-tight">
              <span>{fmtCurrency(paid)}</span>
              <span className={`text-[10px] ${full ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
                {full ? `✓ ${pays.length} abono${pays.length === 1 ? "" : "s"}` : `Saldo ${fmtCurrency(bal)}`}
              </span>
            </div>
          );
        })()}
      </td>
      <td className="px-2 py-1.5">
        {isFuel ? (
          <span
            title="Agrupado automáticamente como Combustible (código SII de otro impuesto)"
            className="rounded-full bg-[var(--color-warning-soft)] px-2 py-0.5 text-[10px] font-medium text-[var(--color-warning)]"
          >
            ⛽ auto
          </span>
        ) : (
          <CostCenterSelect
            value={d.costCenterId || ""}
            costCenters={costCenters}
            onChange={(next) => saveDocCostCenter(d, next)}
          />
        )}
      </td>
      {kindTab === "venta" && (
        <td className="px-2 py-1.5 text-center">
          {isNC ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CREDIT_NOTE_STATE.chip}`}>
              {CREDIT_NOTE_STATE.label}
            </span>
          ) : (
            <div className="flex items-center justify-center gap-1">
              <PaymentStatusSelect
                value={st}
                onChange={(next) => setPaymentStatus(d, next)}
              />
              {cancellingByDocId.has(d.id) && st !== "cancelled" && (
                <button
                  onClick={() => setDetailDoc(d)}
                  title={`Posible NC anula esta factura (${cancellingByDocId.get(d.id).length} candidata${cancellingByDocId.get(d.id).length === 1 ? "" : "s"}). Click para revisar.`}
                  className="rounded-full bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-danger)] hover:opacity-80"
                >
                  ⚠ NC?
                </button>
              )}
            </div>
          )}
        </td>
      )}
      <td className="px-2 py-1.5 text-center">
        <button
          onClick={() => setDetailDoc(d)}
          title={hasNotes ? "Ver detalle (tiene notas)" : "Ver detalle / agregar notas"}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
        >
          {hasNotes ? "📝" : "ℹ"}
        </button>
      </td>
    </tr>
  );
}
