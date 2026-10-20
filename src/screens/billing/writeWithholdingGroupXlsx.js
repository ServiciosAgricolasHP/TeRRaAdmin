// Excel de la retención de una sola contraparte: el IVA retenido del período
// destacado arriba y sus facturas con el total.
import { formatRutForDisplay } from "../../utils/rutUtils";
import { dteTypeLabel } from "../../utils/siiCsvParser";

export async function writeWithholdingGroupXlsx({ g, groupFileBase, periodFilter, selectedCompany }) {
  const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const company = selectedCompany;
  const period = periodFilter || "Todos los períodos";
  const ws = wb.addWorksheet("Retención");
  ws.getColumn(1).width = 6;  // col A vacía de medio ancho (convención)
  ws.getColumn(2).width = 12; // Fecha
  ws.getColumn(3).width = 28; // Documento
  ws.getColumn(4).width = 10; // Folio
  ws.getColumn(5).width = 16; // Neto
  ws.getColumn(6).width = 16; // IVA Retenido
  ws.getColumn(7).width = 16; // Total

  ws.getCell("B2").value = `RETENCIÓN — ${company?.alias || company?.razonSocial || ""} · ${period}`;
  ws.getCell("B2").font = { bold: true, size: 14 };
  ws.mergeCells("B2:G2");
  ws.getCell("B3").value = `${g.razon || "—"} · RUT ${formatRutForDisplay(g.rut) || "—"} · ${g.count} factura${g.count === 1 ? "" : "s"}`;
  ws.getCell("B3").font = { italic: true, color: { argb: "FF555555" } };
  ws.mergeCells("B3:G3");

  // Banner explícito de IVA retenido del período — fila 4 destacada.
  ws.getCell("B4").value = `IVA RETENIDO · ${period}`;
  ws.getCell("B4").font = { bold: true, size: 11 };
  ws.getCell("B4").alignment = { horizontal: "left", vertical: "middle" };
  ws.getCell("B4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CE" } };
  ws.mergeCells("B4:E4");
  ws.getCell("F4").value = Number(g.iva) || 0;
  ws.getCell("F4").font = { bold: true, size: 14 };
  ws.getCell("F4").alignment = { horizontal: "right", vertical: "middle" };
  ws.getCell("F4").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4CE" } };
  ws.getCell("F4").numFmt = '"$"#,##0';
  ws.mergeCells("F4:G4");

  const HR = 6;
  const headers = ["Fecha", "Documento", "Folio", "Neto", "IVA Retenido", "Total"];
  headers.forEach((h, i) => {
    const c = ws.getCell(HR, 2 + i);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
    c.alignment = { horizontal: i <= 2 ? "left" : "right", vertical: "middle" };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
  });

  const dataStart = HR + 1;
  let r = dataStart;
  const sortedDocs = [...g.docs].sort(
    (a, b) => String(a.fechaEmision || "").localeCompare(String(b.fechaEmision || "")),
  );
  for (const d of sortedDocs) {
    const cells = [
      d.fechaEmision || "",
      d.tipoLabel || dteTypeLabel(d.tipo),
      d.folio,
      Number(d.neto) || 0,
      Number(d.iva) || 0,
      Number(d.total) || 0,
    ];
    cells.forEach((v, j) => {
      const c = ws.getCell(r, 2 + j);
      c.value = v;
      c.alignment = { horizontal: j <= 2 ? "left" : "right" };
      c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      if (j === 4) c.font = { bold: true }; // IVA en negrita
      if (j >= 3) c.numFmt = '"$"#,##0';
    });
    r++;
  }
  const lastDataRow = r - 1;
  const totalRow = r;
  ws.getCell(totalRow, 2).value = "TOTAL";
  ws.mergeCells(totalRow, 2, totalRow, 4);
  for (let col = 2; col <= 7; col++) {
    const c = ws.getCell(totalRow, col);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
    c.font = { bold: true };
  }
  if (lastDataRow >= dataStart) {
    ws.getCell(totalRow, 5).value = { formula: `SUM(E${dataStart}:E${lastDataRow})`, result: g.neto };
    ws.getCell(totalRow, 6).value = { formula: `SUM(F${dataStart}:F${lastDataRow})`, result: g.iva };
    ws.getCell(totalRow, 7).value = { formula: `SUM(G${dataStart}:G${lastDataRow})`, result: g.total };
  }
  ws.getCell(totalRow, 5).alignment = { horizontal: "right" };
  ws.getCell(totalRow, 6).alignment = { horizontal: "right" };
  ws.getCell(totalRow, 7).alignment = { horizontal: "right" };
  ws.getCell(totalRow, 5).numFmt = '"$"#,##0';
  ws.getCell(totalRow, 6).numFmt = '"$"#,##0';
  ws.getCell(totalRow, 7).numFmt = '"$"#,##0';

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${groupFileBase(g)}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}
