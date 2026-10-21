import React, { useRef, useState, useMemo } from "react";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../../utils/imageCapture";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import Modal from "../../components/Modal";
import { useToast } from "../../contexts/ToastContext";
import { fmtCurrency, fmtNumber } from "../../utils/format";
import { todayIso } from "./docs";
import { RECEIVABLE_CATEGORIES } from "../../utils/billingDocs";
import { PrintableReceivables } from "./PrintableReceivables";
import { SummaryCard } from "./SummaryCard";

// Modal con todas las facturas de venta pendientes (cualquier período) de la
// empresa seleccionada. Las separa en tres bloques (factura completa / abono
// parcial / IVA pendiente) con subtotales y un total general. Toolbar de
// export idéntica a la de Retenciones: Copiar / PNG / Imprimir / XLSX.
export function ReceivablesModal({ items, totals, company, onClose, onSelectDoc }) {
  const toast = useToast();
  const printRef = useRef(null);
  const [busy, setBusy] = useState("");

  const byCategory = useMemo(() => {
    const m = { full: [], partial: [], iva: [] };
    for (const d of items) m[d._category].push(d);
    return m;
  }, [items]);

  const fileBase = useMemo(() => {
    const alias = (company?.alias || company?.razonSocial || "empresa").replace(/[^\w-]+/g, "_");
    return `Pendientes_${alias}_${todayIso()}`;
  }, [company]);

  const handleCopy = async () => {
    if (!printRef.current) return;
    setBusy("copy");
    try {
      const blob = await captureFullWidthBlob(printRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handlePng = async () => {
    if (!printRef.current) return;
    setBusy("png");
    try {
      const dataUrl = await captureFullWidthDataUrl(printRef.current, { backgroundColor: "#ffffff", pixelRatio: 2 });
      const link = document.createElement("a");
      link.download = `${fileBase}.png`;
      link.href = dataUrl;
      link.click();
    } catch (err) {
      toast.error("Error PNG: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handlePrint = () => {
    if (!printRef.current) return;
    const html = printRef.current.outerHTML;
    const win = window.open("", "_blank", "width=1000,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Pendientes</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; color-adjust: exact !important; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #999; padding: 6px 8px; font-size: 12px; }
        thead th { background: #92d050 !important; text-align: left; }
        @media print { @page { size: landscape; margin: 12mm; } }
      </style>
    </head><body>${html}</body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 250);
  };

  const handleXlsx = async () => {
    setBusy("xlsx");
    try {
      const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Pendientes");
      ws.getColumn(1).width = 6;  // col A vacía de medio ancho (convención)
      ws.getColumn(2).width = 12; // Fecha
      ws.getColumn(3).width = 26; // Documento
      ws.getColumn(4).width = 10; // Folio
      ws.getColumn(5).width = 34; // Contraparte
      ws.getColumn(6).width = 16; // RUT
      ws.getColumn(7).width = 16; // Total
      ws.getColumn(8).width = 16; // Pagado
      ws.getColumn(9).width = 16; // Pendiente

      ws.getCell("B2").value = `PENDIENTES — ${company?.alias || company?.razonSocial || ""}`;
      ws.getCell("B2").font = { bold: true, size: 14 };
      ws.mergeCells("B2:I2");
      ws.getCell("B3").value = `Generado ${todayIso()} · ${items.length} factura${items.length === 1 ? "" : "s"} con saldo · Total pendiente ${fmtCurrency(totals.total)}`;
      ws.getCell("B3").font = { italic: true, color: { argb: "FF555555" } };
      ws.mergeCells("B3:I3");

      let r = 5;
      const writeHeaders = () => {
        const headers = ["Fecha", "Documento", "Folio", "Contraparte", "RUT", "Total", "Pagado", "Pendiente"];
        headers.forEach((h, i) => {
          const c = ws.getCell(r, 2 + i);
          c.value = h;
          c.font = { bold: true };
          c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
          c.alignment = { horizontal: i <= 4 ? "left" : "right" };
          c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
        });
        r++;
      };

      const catOrder = ["full", "partial", "iva"];
      for (const cat of catOrder) {
        const list = byCategory[cat];
        if (list.length === 0) continue;
        // Subencabezado por categoría
        const meta = RECEIVABLE_CATEGORIES[cat];
        const subHexClean = meta.hex.replace("#", "");
        const argb = `FF${subHexClean.toUpperCase()}`;
        ws.getCell(r, 2).value = `${meta.label} (${list.length})`;
        ws.getCell(r, 2).font = { bold: true };
        for (let col = 2; col <= 9; col++) {
          ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb } };
          ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
        }
        ws.mergeCells(r, 2, r, 9);
        r++;
        writeHeaders();
        const dataStart = r;
        for (const d of list) {
          const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
          const rut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
          const paid = Number(d.amountPaid) || 0;
          const cells = [
            d.fechaEmision || "",
            d.tipoLabel || dteTypeLabel(d.tipo),
            d.folio,
            razon || "",
            formatRutForDisplay(rut) || "",
            Number(d.total) || 0,
            paid,
            d._pending,
          ];
          cells.forEach((v, j) => {
            const c = ws.getCell(r, 2 + j);
            c.value = v;
            c.alignment = { horizontal: j <= 4 ? "left" : "right" };
            c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
            if (j === 7) c.font = { bold: true }; // Pendiente en negrita
            if (j >= 5) c.numFmt = '"$"#,##0';
          });
          r++;
        }
        // Subtotal de la categoría
        const lastDataRow = r - 1;
        ws.getCell(r, 2).value = "Subtotal";
        ws.getCell(r, 2).font = { bold: true };
        ws.mergeCells(r, 2, r, 8);
        for (let col = 2; col <= 9; col++) {
          ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
          ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
          ws.getCell(r, col).font = { bold: true };
        }
        ws.getCell(r, 9).value = { formula: `SUM(I${dataStart}:I${lastDataRow})`, result: totals[cat] };
        ws.getCell(r, 9).alignment = { horizontal: "right" };
        ws.getCell(r, 9).numFmt = '"$"#,##0';
        r++;
        r++; // fila en blanco
      }

      ws.getCell(r, 2).value = "TOTAL PENDIENTE";
      ws.mergeCells(r, 2, r, 8);
      for (let col = 2; col <= 9; col++) {
        ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
        ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
        ws.getCell(r, col).font = { bold: true };
      }
      ws.getCell(r, 9).value = totals.total;
      ws.getCell(r, 9).alignment = { horizontal: "right" };
      ws.getCell(r, 9).numFmt = '"$"#,##0';

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `${fileBase}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (err) {
      toast.error("Error XLSX: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

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
                {busy === "png" ? "..." : "📥 PNG"}
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
