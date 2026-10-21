// Excel de la pestaña Retenciones, con la convención del proyecto (col A vacía
// de ancho 6, fila 1 vacía, datos desde B2). Dos hojas: "Resumen", con una fila
// por contraparte, y "Detalle", con cada factura.
import { formatRutForDisplay } from "../../utils/rutUtils";
import { dteTypeLabel } from "../../utils/siiCsvParser";

export async function writeWithholdingsXlsx({ companiesById, exportFileBase, periodFilter, selectedCompanyId, totals, withholdingsByCounterparty }) {
  const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const company = companiesById.get(selectedCompanyId);
  const period = periodFilter || "Todos los períodos";

  // ============ Hoja Resumen ============
  const ws = wb.addWorksheet("Resumen");
  ws.getColumn(1).width = 6; // col A vacía de medio ancho (convención)
  ws.getColumn(2).width = 6;  // #
  ws.getColumn(3).width = 40; // Empresa
  ws.getColumn(4).width = 16; // RUT
  ws.getColumn(5).width = 14; // N° Facturas
  ws.getColumn(6).width = 18; // Neto
  ws.getColumn(7).width = 18; // IVA Retenido
  ws.getColumn(8).width = 18; // Total

  // Título (B2): "Retenciones — empresa — período"
  ws.getCell("B2").value = `RETENCIONES — ${company?.alias || company?.razonSocial || ""} — ${period}`;
  ws.getCell("B2").font = { bold: true, size: 14 };
  ws.mergeCells("B2:H2");

  // Encabezados en la fila 4
  const HR = 4;
  const headers = ["#", "Empresa", "RUT", "N° Facturas", "Neto", "IVA Retenido", "Total"];
  headers.forEach((h, i) => {
    const c = ws.getCell(HR, 2 + i);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
    c.alignment = { horizontal: i === 0 ? "center" : i <= 2 ? "left" : "right", vertical: "middle" };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
  });

  const dataStart = HR + 1;
  let r = dataStart;
  for (let i = 0; i < withholdingsByCounterparty.length; i++) {
    const g = withholdingsByCounterparty[i];
    const row = [i + 1, g.razon || "—", formatRutForDisplay(g.rut) || "—", g.count, g.neto, g.iva, g.total];
    row.forEach((v, j) => {
      const c = ws.getCell(r, 2 + j);
      c.value = v;
      c.alignment = { horizontal: j === 0 ? "center" : j <= 2 ? "left" : "right" };
      c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      if (j >= 4) c.numFmt = '"$"#,##0';
    });
    r++;
  }
  const lastDataRow = r - 1;
  const totalRow = r;

  // Fila de totales con fórmulas vivas.
  const totalLabel = ws.getCell(totalRow, 2);
  totalLabel.value = "TOTAL";
  totalLabel.font = { bold: true };
  totalLabel.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
  totalLabel.alignment = { horizontal: "left" };
  // Combina B:D para la etiqueta
  ws.mergeCells(totalRow, 2, totalRow, 4);
  for (let col = 2; col <= 8; col++) {
    const c = ws.getCell(totalRow, col);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
    c.font = { bold: true };
  }
  // Conteo + sumas con fórmulas (referencia las celdas E/F/G/H del rango).
  if (withholdingsByCounterparty.length > 0) {
    ws.getCell(totalRow, 5).value = { formula: `SUM(E${dataStart}:E${lastDataRow})`, result: withholdingsByCounterparty.reduce((s, g) => s + g.count, 0) };
    ws.getCell(totalRow, 6).value = { formula: `SUM(F${dataStart}:F${lastDataRow})`, result: totals.netOnlyTotal - totals.netOnlyIva };
    ws.getCell(totalRow, 7).value = { formula: `SUM(G${dataStart}:G${lastDataRow})`, result: totals.netOnlyIva };
    ws.getCell(totalRow, 8).value = { formula: `SUM(H${dataStart}:H${lastDataRow})`, result: totals.netOnlyTotal };
  }
  ws.getCell(totalRow, 5).alignment = { horizontal: "right" };
  ws.getCell(totalRow, 6).alignment = { horizontal: "right" };
  ws.getCell(totalRow, 7).alignment = { horizontal: "right" };
  ws.getCell(totalRow, 8).alignment = { horizontal: "right" };
  ws.getCell(totalRow, 6).numFmt = '"$"#,##0';
  ws.getCell(totalRow, 7).numFmt = '"$"#,##0';
  ws.getCell(totalRow, 8).numFmt = '"$"#,##0';

  // ============ Hoja Detalle (todas las facturas individuales) ============
  // Sin columna "Tipo" numérica: "Documento" ya trae la etiqueta legible.
  const wsd = wb.addWorksheet("Detalle");
  wsd.getColumn(1).width = 6;
  wsd.getColumn(2).width = 12; // Fecha
  wsd.getColumn(3).width = 26; // Documento (etiqueta)
  wsd.getColumn(4).width = 10; // Folio
  wsd.getColumn(5).width = 36; // Contraparte
  wsd.getColumn(6).width = 16; // RUT
  wsd.getColumn(7).width = 16; // Neto
  wsd.getColumn(8).width = 16; // IVA Retenido
  wsd.getColumn(9).width = 16; // Total
  wsd.getCell("B2").value = `DETALLE — ${company?.alias || ""} — ${period}`;
  wsd.getCell("B2").font = { bold: true, size: 14 };
  wsd.mergeCells("B2:I2");
  const dHeaders = ["Fecha", "Documento", "Folio", "Contraparte", "RUT", "Neto", "IVA Retenido", "Total"];
  dHeaders.forEach((h, i) => {
    const c = wsd.getCell(4, 2 + i);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
    c.alignment = { horizontal: i <= 3 ? "left" : "right" };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
  });
  let dr = 5;
  for (const g of withholdingsByCounterparty) {
    for (const d of g.docs) {
      const cells = [
        d.fechaEmision || "",
        d.tipoLabel || dteTypeLabel(d.tipo),
        d.folio,
        g.razon || "",
        formatRutForDisplay(g.rut) || "",
        Number(d.neto) || 0,
        Number(d.iva) || 0,
        Number(d.total) || 0,
      ];
      cells.forEach((v, j) => {
        const c = wsd.getCell(dr, 2 + j);
        c.value = v;
        c.alignment = { horizontal: j <= 3 ? "left" : "right" };
        c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
        if (j === 6) c.font = { bold: true }; // IVA en negrita
        if (j >= 5) c.numFmt = '"$"#,##0';
      });
      dr++;
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${exportFileBase}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}
