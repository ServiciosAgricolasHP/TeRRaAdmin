import { useState } from "react";
import { otroImpuestoLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import Modal, { ModalCloseButton } from "../../components/Modal";
import { CREDIT_NOTE_TYPES } from "../../utils/cashFlowProjection";
import { fmtCurrency } from "../../utils/format";
import { CostCenterSelect } from "./CostCenterSelect";
import { NC_STATE } from "./docs";
import { OtroImpChip } from "./OtroImpChip";
import { PaymentsSection } from "./PaymentsSection";
import { PaymentStatusSelect } from "./PaymentStatusSelect";
import { SummaryCard } from "./SummaryCard";

function paymentsSummary(dteDoc) {
  const payments = Array.isArray(dteDoc?.payments) ? dteDoc.payments : [];
  const amountPaid = payments.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const balance = (Number(dteDoc?.total) || 0) - amountPaid;
  return { payments, amountPaid, balance };
}

// Modal de detalle de un DTE: muestra los campos disponibles y permite editar
// el estado, el centro de costo, los pagos y las notas (la "glosa" interna,
// porque el CSV del RCV no trae los ítems de la factura). Las NC no tienen
// pagos; en sus notas se anota la factura que anulan.
export function DocDetailModal({ dteDoc, candidateNcs = [], costCenters = [], onClose, onSaveNotes, onSetStatus, onSavePayments, onSetCostCenter }) {
  const [notes, setNotes] = useState(dteDoc.notes || "");
  const [dirty, setDirty] = useState(false);
  const isNC = CREDIT_NOTE_TYPES.has(Number(dteDoc.tipo));
  const isFuelDoc = dteDoc.otroImpuestoCategory === "combustible";
  const st = dteDoc.paymentStatus || "unpaid";
  const showNcSuggestion = !isNC && st !== "cancelled" && candidateNcs.length > 0;
  const { payments, amountPaid, balance } = paymentsSummary(dteDoc);

  const save = async () => {
    await onSaveNotes(notes);
    setDirty(false);
  };

  // Marca la factura como anulada y agrega una nota con la referencia a la(s)
  // NC candidata(s). La nota se concatena con lo que el usuario ya tenía.
  const acceptNcSuggestion = async () => {
    const ref = candidateNcs
      .map((nc) => `NC ${nc.tipo}-${nc.folio} (${nc.fechaEmision || "s/f"}, ${fmtCurrency(nc.total)})`)
      .join(", ");
    const prefix = notes && notes.trim() ? `${notes.trim()}\n` : "";
    const stamp = `[Anulada por ${ref}]`;
    const newNotes = `${prefix}${stamp}`;
    setNotes(newNotes);
    setDirty(false);
    await onSaveNotes(newNotes);
    onSetStatus("cancelled");
  };

  return (
    <Modal
      open
      onClose={onClose}
      dirty={dirty}
      size="lg"
      title={`${dteDoc.tipoLabel} N° ${dteDoc.folio}`}
      footer={
        <>
          <ModalCloseButton className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-1.5 text-sm">
            Cerrar
          </ModalCloseButton>
          <button
            onClick={save}
            disabled={!dirty}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
          >
            Guardar notas
          </button>
        </>
      }
    >
      <div className="space-y-3 text-sm">
        {showNcSuggestion && (
          <div className="rounded-md border border-[var(--color-danger)] bg-[var(--color-danger-soft)] px-3 py-2">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-xs font-semibold text-[var(--color-danger)]">
                ⚠ Posible NC que anula esta factura
              </div>
              <button
                onClick={acceptNcSuggestion}
                className="rounded-md bg-[var(--color-danger)] px-2 py-1 text-[11px] font-medium text-white hover:opacity-90"
              >
                Marcar como Anulada
              </button>
            </div>
            <div className="space-y-0.5 text-[11px] text-[var(--color-text)]">
              {candidateNcs.map((nc) => (
                <div key={nc.id} className="font-mono">
                  · {nc.tipoLabel} {nc.tipo}-{nc.folio} · {nc.fechaEmision || "s/f"} · {fmtCurrency(nc.total)}
                </div>
              ))}
            </div>
            <div className="mt-1 text-[10px] text-[var(--color-muted)]">
              Coincidencia por contraparte y total exacto. Verifica antes de aceptar — puede haber falso positivo.
            </div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Tipo</div>
            <div>
              <span className={`rounded px-1.5 py-0.5 ${isNC ? "bg-[var(--color-danger-soft)] text-[var(--color-danger)]" : "bg-[var(--color-surface-2)]"}`}>
                {dteDoc.tipo}
              </span>
              <span className="ml-1 text-[var(--color-muted)]">{dteDoc.tipoLabel}</span>
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Estado</div>
            {isNC ? (
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${NC_STATE.chip}`}>{NC_STATE.label}</span>
            ) : (
              <PaymentStatusSelect value={st} onChange={onSetStatus} />
            )}
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Fecha emisión</div>
            <div className="font-mono">{dteDoc.fechaEmision || "—"}</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Período</div>
            <div className="font-mono">{dteDoc.periodo || "—"}</div>
          </div>
          <div className="col-span-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Centro de costo</div>
            {isFuelDoc ? (
              <span className="text-xs text-[var(--color-muted)]">⛽ Combustible (agrupación automática, no editable acá)</span>
            ) : (
              <CostCenterSelect value={dteDoc.costCenterId || ""} costCenters={costCenters} onChange={onSetCostCenter} />
            )}
          </div>
          {dteDoc.otroImpuestoCodigo && (
            <div className="col-span-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Otro impuesto (SII)</div>
              <div className="flex items-center gap-2 text-sm">
                <span className="font-mono text-xs">Cód. {dteDoc.otroImpuestoCodigo}</span>
                <span>·</span>
                <span>{otroImpuestoLabel(dteDoc.otroImpuestoCodigo)}</span>
                <OtroImpChip code={dteDoc.otroImpuestoCodigo} tasa={dteDoc.retencionTasa} />
                {dteDoc.otrosImpuestos > 0 && (
                  <span className="ml-auto text-xs text-[var(--color-muted)]">
                    Valor: <span className="tabular-nums text-[var(--color-text)]">{fmtCurrency(dteDoc.otrosImpuestos)}</span>
                  </span>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Emisor</div>
            <div className="font-medium truncate">{dteDoc.razonSocialEmisor || "—"}</div>
            <div className="font-mono text-xs text-[var(--color-muted)]">{formatRutForDisplay(dteDoc.rutEmisor) || "—"}</div>
          </div>
          <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
            <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">Receptor</div>
            <div className="font-medium truncate">{dteDoc.razonSocialReceptor || "—"}</div>
            <div className="font-mono text-xs text-[var(--color-muted)]">{formatRutForDisplay(dteDoc.rutReceptor) || "—"}</div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <SummaryCard label="Neto" value={fmtCurrency(dteDoc.neto)} />
          <SummaryCard label="Exento" value={fmtCurrency(dteDoc.exento)} subtle />
          <SummaryCard label="IVA" value={fmtCurrency(dteDoc.iva)} />
          <SummaryCard label="Total" value={fmtCurrency(dteDoc.total)} highlight />
        </div>

        {!isNC && (
          <PaymentsSection
            dteDoc={dteDoc}
            payments={payments}
            amountPaid={amountPaid}
            balance={balance}
            onSavePayments={onSavePayments}
          />
        )}

        <div>
          <label className="mb-1 block text-xs font-medium text-[var(--color-muted)]">
            Notas / glosa (interno)
          </label>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            rows={3}
            placeholder={
              isNC
                ? 'Detalle libre. Ej: "Anula Factura 33-1234 por error en monto"'
                : 'Detalle libre. El SII no trae la glosa en el CSV — usa este campo para registrar ítems, condiciones, OC, etc.'
            }
            className="w-full rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm outline-none focus:border-[var(--color-accent)]"
          />
          <p className="mt-1 text-[10px] text-[var(--color-muted)]">
            Las notas persisten en Firestore y aparecen marcadas con 📝 en el listado.
          </p>
        </div>

        {dteDoc.sourceFile && (
          <div className="text-[10px] text-[var(--color-muted)]">
            Importado desde: <span className="font-mono">{dteDoc.sourceFile}</span>
          </div>
        )}
      </div>
    </Modal>
  );
}
