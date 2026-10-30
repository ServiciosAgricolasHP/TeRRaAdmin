import React, { useRef, useMemo } from "react";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import Modal from "../../components/Modal";
import { useCaptureActions } from "../../hooks/useCaptureActions";
import { PRINT_SHEET_CSS } from "../../utils/printWindow";
import { fmtCurrency, fmtNumber } from "../../utils/format";
import { todayIso } from "./docs";
import { RECEIVABLE_CATEGORIES } from "../../utils/billingDocs";
import { PrintableReceivables } from "./PrintableReceivables";
import { SummaryCard } from "./SummaryCard";
import { writeReceivablesXlsx } from "./writeReceivablesXlsx";

// Modal con todas las facturas de venta pendientes (cualquier período) de la
// empresa seleccionada. Las separa en tres bloques (factura completa / abono
// parcial / IVA pendiente) con subtotales y un total general. Toolbar de
// export idéntica a la de Retenciones: Copiar / PNG / Imprimir / XLSX.
export function ReceivablesModal({ items, totals, company, onClose, onSelectDoc }) {
  const printRef = useRef(null);
  const { busy, run, copy, download, print } = useCaptureActions();

  const byCategory = useMemo(() => {
    const m = { full: [], partial: [], iva: [] };
    for (const d of items) m[d._category].push(d);
    return m;
  }, [items]);

  const fileBase = useMemo(() => {
    const alias = (company?.alias || company?.razonSocial || "empresa").replace(/[^\w-]+/g, "_");
    return `Pendientes_${alias}_${todayIso()}`;
  }, [company]);

  const handleCopy = () => copy(printRef.current);
  const handlePng = () => download(printRef.current, `${fileBase}.png`);
  const handlePrint = () => print(printRef.current, { title: "Pendientes", css: PRINT_SHEET_CSS });

  const handleXlsx = () =>
    run("xlsx", () => writeReceivablesXlsx({ items, totals, company, byCategory, fileBase }), { error: "No se pudo generar el Excel" });

  return (
    <Modal open onClose={onClose} size="3xl" title={`Pendientes — ${company?.alias || company?.razonSocial || "empresa"}`}>
      {items.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-muted)]">
          🎉 No hay facturas con saldo pendiente. Todo al día.
        </div>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-4">
              <SummaryCard label="Facturas pendientes" value={fmtNumber(items.length)} />
              <SummaryCard label="Factura completa" value={fmtCurrency(totals.full)} warning />
              <SummaryCard label="Abono parcial" value={fmtCurrency(totals.partial)} />
              <SummaryCard label="IVA pendiente" value={fmtCurrency(totals.iva)} />
            </div>
          </div>
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div className="text-sm">
              <span className="text-[var(--color-muted)]">Total pendiente: </span>
              <span className="font-semibold text-[var(--color-warning)] tabular-nums">{fmtCurrency(totals.total)}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              <button
                onClick={handleCopy}
                disabled={!!busy}
                className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
                title="Copiar como imagen"
              >
                {busy === "copy" ? "..." : "📋 Copiar"}
              </button>
              <button
                onClick={handlePng}
                disabled={!!busy}
                className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
                title="Descargar PNG"
              >
                {busy === "download" ? "..." : "📥 PNG"}
              </button>
              <button
                onClick={handlePrint}
                disabled={!!busy}
                className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
                title="Imprimir"
              >
                🖨 Imprimir
              </button>
              <button
                onClick={handleXlsx}
                disabled={!!busy}
                className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
                title="Exportar XLSX"
              >
                {busy === "xlsx" ? "..." : "📊 XLSX"}
              </button>
            </div>
          </div>

          {/* Tabla en pantalla — agrupada por categoría con subtotales. */}
          <div className="max-h-[60vh] overflow-auto rounded-md border border-[var(--color-border)]">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
                <tr>
                  <th className="px-2 py-2 text-left">Fecha</th>
                  <th className="px-2 py-2 text-left">Documento</th>
                  <th className="px-2 py-2 text-right">Folio</th>
                  <th className="px-2 py-2 text-left">Contraparte</th>
                  <th className="px-2 py-2 text-left">RUT</th>
                  <th className="px-2 py-2 text-right">Total</th>
                  <th className="px-2 py-2 text-right">Pagado</th>
                  <th className="px-2 py-2 text-right">Pendiente</th>
                  <th className="px-2 py-2"></th>
                </tr>
              </thead>
              <tbody>
                {["full", "partial", "iva"].map((cat) => {
                  const list = byCategory[cat];
                  if (list.length === 0) return null;
                  const meta = RECEIVABLE_CATEGORIES[cat];
                  return (
                    <React.Fragment key={cat}>
                      <tr style={{ background: meta.hex }}>
                        <td colSpan={9} className="px-2 py-1.5 text-xs font-semibold text-black">
                          {meta.label} <span className="font-normal">· {list.length} factura{list.length === 1 ? "" : "s"} · {fmtCurrency(totals[cat])}</span>
                        </td>
                      </tr>
                      {list.map((d) => {
                        const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
                        const rut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
                        const paid = Number(d.amountPaid) || 0;
                        return (
                          <tr key={d.id} className="border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]">
                            <td className="px-2 py-1.5 font-mono text-xs">{d.fechaEmision}</td>
                            <td className="px-2 py-1.5 text-xs">{d.tipoLabel || dteTypeLabel(d.tipo)}</td>
                            <td className="px-2 py-1.5 text-right font-mono tabular-nums">{d.folio}</td>
                            <td className="px-2 py-1.5 truncate max-w-[260px]">{razon || "—"}</td>
                            <td className="px-2 py-1.5 font-mono text-xs">{formatRutForDisplay(rut)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(d.total)}</td>
                            <td className="px-2 py-1.5 text-right tabular-nums text-[var(--color-muted)]">{paid > 0 ? fmtCurrency(paid) : "—"}</td>
                            <td className="px-2 py-1.5 text-right font-semibold tabular-nums text-[var(--color-warning)]">{fmtCurrency(d._pending)}</td>
                            <td className="px-2 py-1.5 text-center">
                              <button
                                onClick={() => onSelectDoc(d)}
                                title="Abrir detalle"
                                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
                              >
                                ℹ
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                      <tr className="bg-[var(--color-surface-2)]">
                        <td colSpan={7} className="px-2 py-1.5 text-right text-xs font-semibold">Subtotal {meta.label}</td>
                        <td className="px-2 py-1.5 text-right font-bold tabular-nums">{fmtCurrency(totals[cat])}</td>
                        <td></td>
                      </tr>
                    </React.Fragment>
                  );
                })}
                <tr className="border-t-2 border-[var(--color-accent)] bg-[var(--color-accent-soft)]">
                  <td colSpan={7} className="px-2 py-2 text-right text-sm font-bold">TOTAL PENDIENTE</td>
                  <td className="px-2 py-2 text-right text-base font-bold tabular-nums text-[var(--color-accent)]">{fmtCurrency(totals.total)}</td>
                  <td></td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Printable fuera de pantalla para html-to-image e impresión. */}
          <div style={{ position: "absolute", left: -99999, top: 0, pointerEvents: "none" }} aria-hidden>
            <PrintableReceivables
              ref={printRef}
              items={items}
              byCategory={byCategory}
              totals={totals}
              company={company}
            />
          </div>
        </>
      )}
    </Modal>
  );
}
