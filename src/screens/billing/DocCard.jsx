import { CREDIT_NOTE_TYPES } from "../../utils/cashFlowProjection";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { OtherTaxChip } from "./OtherTaxChip";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { CostCenterSelect } from "./CostCenterSelect";
import { CREDIT_NOTE_STATE } from "./docs";
import { PaymentStatusSelect } from "./PaymentStatusSelect";

// Un documento del listado en el teléfono: fecha, tipo, folio, contraparte y
// montos (las NC en negativo), sus abonos, el centro de costo y, en ventas, el
// estado de pago con el aviso de una NC que podría anularlo.
export function DocCard({ d, cancellingByDocId, costCenters, kindTab, saveDocCostCenter, setDetailDoc, setPaymentStatus }) {
  const counterpartyName = kindTab === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
  const rut = kindTab === "venta" ? d.rutReceptor : d.rutEmisor;
  const isNC = CREDIT_NOTE_TYPES.has(Number(d.tipo));
  const isFuel = d.otroImpuestoCategory === "combustible";
  const st = d.paymentStatus || "unpaid";
  const hasNotes = !!(d.notes && d.notes.trim());
  const pays = Array.isArray(d.payments) ? d.payments : [];
  const paid = Number(d.amountPaid) || pays.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const bal = (Number(d.total) || 0) - paid;
  const fullyPaid = bal <= 0.01;
  return (
    <div key={d.id} className="px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <span className="font-mono">{d.fechaEmision}</span>
            <span className={isNC ? "rounded px-1.5 py-0.5 bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : ""}>
              {d.tipoLabel || dteTypeLabel(d.tipo)}
            </span>
            <OtherTaxChip code={d.otroImpuestoCodigo} tasa={d.retencionTasa} />
            <span className="font-mono">· Folio {d.folio}</span>
          </div>
          <div className="mt-0.5 truncate text-sm font-medium">{counterpartyName || "—"}</div>
          <div className="font-mono text-[10px] text-[var(--color-muted)]">{formatRutForDisplay(rut)}</div>
        </div>
        <div className="shrink-0 text-right">
          <div className={`text-sm font-semibold tabular-nums ${isNC ? "text-[var(--color-danger)]" : ""}`}>
            {isNC ? "−" : ""}{fmtCurrency(d.total)}
          </div>
          <div className="text-[10px] tabular-nums text-[var(--color-muted)]">
            N {isNC ? "−" : ""}{fmtCurrency(d.neto)} · IVA {isNC ? "−" : ""}{fmtCurrency(d.iva)}
          </div>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {!isNC && paid > 0 && (
          <span className={`text-[10px] ${fullyPaid ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}`}>
            {fullyPaid ? `✓ Pagado (${pays.length})` : `Abono ${fmtCurrency(paid)} · Saldo ${fmtCurrency(bal)}`}
          </span>
        )}
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
        {kindTab === "venta" && (
          isNC ? (
            <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${CREDIT_NOTE_STATE.chip}`}>
              {CREDIT_NOTE_STATE.label}
            </span>
          ) : (
            <>
              <PaymentStatusSelect value={st} onChange={(next) => setPaymentStatus(d, next)} />
              {cancellingByDocId.has(d.id) && st !== "cancelled" && (
                <button
                  onClick={() => setDetailDoc(d)}
                  title={`Posible NC anula esta factura (${cancellingByDocId.get(d.id).length} candidata${cancellingByDocId.get(d.id).length === 1 ? "" : "s"}). Click para revisar.`}
                  className="rounded-full bg-[var(--color-danger-soft)] px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-danger)] hover:opacity-80"
                >
                  ⚠ NC?
                </button>
              )}
            </>
          )
        )}
        <button
          onClick={() => setDetailDoc(d)}
          title={hasNotes ? "Ver detalle (tiene notas)" : "Ver detalle / agregar notas"}
          className="ml-auto min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2.5 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
        >
          {hasNotes ? "📝 Detalle" : "ℹ Detalle"}
        </button>
      </div>
    </div>
  );
}
