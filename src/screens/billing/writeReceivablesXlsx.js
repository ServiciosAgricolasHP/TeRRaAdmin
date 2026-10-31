import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { RECEIVABLE_CATEGORIES } from "../../utils/billingDocs";
import { todayIso } from "./docs";

// Excel de las facturas de venta pendientes, con la convención del proyecto
// (col A vacía de ancho 6, fila 1 vacía, datos desde B2): un bloque por
// categoría (factura completa, abono parcial, IVA pendiente) con su subtotal, y
// el total pendiente al final.
export async function writeReceivablesXlsx({ items, totals, company, byCategory, fileBase }) {
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
}
