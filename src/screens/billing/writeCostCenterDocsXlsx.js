// Excel de la vista de un centro de costo: sus documentos y gastos informales
// tal como están filtrados y ordenados, con el total fiscal y, aparte, el de
// los gastos informales.
import { fmtCurrency } from "../../utils/format";
import { CREDIT_NOTE_TYPES } from "../../utils/cashFlowProjection";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";

export async function writeCostCenterDocsXlsx({ companiesById, fileBase, filtered, filteredInformal, informalTotal, selectedLabel, sorted, totals }) {
  const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Centro de costo");
  ws.getColumn(1).width = 6;  // col A vacía de medio ancho (convención)
  ws.getColumn(2).width = 12; // Fecha
  ws.getColumn(3).width = 22; // Empresa
  ws.getColumn(4).width = 10; // Mov.
  ws.getColumn(5).width = 22; // Documento
  ws.getColumn(6).width = 10; // Folio
  ws.getColumn(7).width = 30; // Contraparte
  ws.getColumn(8).width = 16; // RUT
  ws.getColumn(9).width = 14; // Neto
  ws.getColumn(10).width = 14; // IVA
  ws.getColumn(11).width = 14; // Total

  ws.getCell("B2").value = `CENTRO DE COSTO — ${selectedLabel}`;
  ws.getCell("B2").font = { bold: true, size: 14 };
  ws.mergeCells("B2:K2");
  const summaryLine = `${filtered.length} documento${filtered.length === 1 ? "" : "s"} · Neto ${fmtCurrency(totals.neto)} · IVA ${fmtCurrency(totals.iva)} · Total ${fmtCurrency(totals.total)}`
    + (filteredInformal.length > 0
      ? ` · + ${filteredInformal.length} gasto${filteredInformal.length === 1 ? "" : "s"} informal${filteredInformal.length === 1 ? "" : "es"} ${fmtCurrency(informalTotal)} · Total combinado ${fmtCurrency(totals.total + informalTotal)}`
      : "");
  ws.getCell("B3").value = summaryLine;
  ws.getCell("B3").font = { italic: true, color: { argb: "FF555555" } };
  ws.mergeCells("B3:K3");

  const HR = 5;
  const headers = ["Fecha", "Empresa", "Mov.", "Documento", "Folio", "Contraparte", "RUT", "Neto", "IVA", "Total"];
  headers.forEach((h, i) => {
    const c = ws.getCell(HR, 2 + i);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
    c.alignment = { horizontal: i <= 6 ? "left" : "right", vertical: "middle" };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
  });

  let r = HR + 1;
  for (const d of sorted) {
    if (d.__informal) {
      const company = companiesById.get(d.companyId);
      const cells = [d.date || "", company?.alias || company?.razonSocial || "", "Informal", "", "", d.detail || "", "", "", "", Number(d.amount) || 0];
      cells.forEach((v, j) => {
        const c = ws.getCell(r, 2 + j);
        c.value = v;
        c.alignment = { horizontal: j <= 6 ? "left" : "right" };
        c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
        if (j === 9) c.numFmt = '"$"#,##0';
        if (j === 2) c.font = { color: { argb: "FFB8860B" } };
      });
      r++;
      continue;
    }
    const isNC = CREDIT_NOTE_TYPES.has(Number(d.tipo));
    const sign = isNC ? -1 : 1;
    const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
    const rut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
    const company = companiesById.get(d.companyId);
    const cells = [
      d.fechaEmision || "",
      company?.alias || company?.razonSocial || "",
      d.kind === "venta" ? "Venta" : "Compra",
      d.tipoLabel || dteTypeLabel(d.tipo),
      d.folio,
      razon || "",
      formatRutForDisplay(rut) || "",
      sign * (Number(d.neto) || 0),
      sign * (Number(d.iva) || 0),
      sign * (Number(d.total) || 0),
    ];
    cells.forEach((v, j) => {
      const c = ws.getCell(r, 2 + j);
      c.value = v;
      c.alignment = { horizontal: j <= 6 ? "left" : "right" };
      c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      if (j >= 7 && j <= 9) c.numFmt = '"$"#,##0';
      if (isNC && j >= 7 && j <= 9) c.font = { color: { argb: "FFCC0000" } };
    });
    r++;
  }

  ws.getCell(r, 2).value = `TOTAL (${filtered.length})`;
  ws.mergeCells(r, 2, r, 8);
  for (let col = 2; col <= 11; col++) {
    ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
    ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
    ws.getCell(r, col).font = { bold: true };
  }
  [totals.neto, totals.iva, totals.total].forEach((v, j) => {
    const c = ws.getCell(r, 9 + j);
    c.value = v;
    c.numFmt = '"$"#,##0';
    c.alignment = { horizontal: "right" };
  });
  r++;

  if (filteredInformal.length > 0) {
    ws.getCell(r, 2).value = `GASTOS INFORMALES (${filteredInformal.length})`;
    ws.mergeCells(r, 2, r, 8);
    for (let col = 2; col <= 11; col++) {
      ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFDE9C8" } };
      ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      ws.getCell(r, col).font = { bold: true };
    }
    ws.getCell(r, 11).value = informalTotal;
    ws.getCell(r, 11).numFmt = '"$"#,##0';
    ws.getCell(r, 11).alignment = { horizontal: "right" };
    r++;

    ws.getCell(r, 2).value = "TOTAL COMBINADO";
    ws.mergeCells(r, 2, r, 8);
    for (let col = 2; col <= 11; col++) {
      ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
      ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      ws.getCell(r, col).font = { bold: true };
    }
    ws.getCell(r, 11).value = totals.total + informalTotal;
    ws.getCell(r, 11).numFmt = '"$"#,##0';
    ws.getCell(r, 11).alignment = { horizontal: "right" };
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${fileBase}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}
