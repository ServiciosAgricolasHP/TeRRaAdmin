// Excel del resumen anual: ventas y compras netas, IVA débito y crédito, e IVA
// a pagar mes a mes, con el total del año.
import { fmtCurrency } from "../../utils/format";
import { MONTH_NAMES_ES } from "./docs";

export async function writeAnnualSummaryXlsx({ selectedCompany, summaryData, summaryFileBase, summaryYear }) {
  const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const company = selectedCompany;
  const { months, total } = summaryData;
  const ws = wb.addWorksheet(`Resumen ${summaryYear}`);
  // Convención del proyecto: col A vacía (media), fila 1 vacía.
  ws.getColumn(1).width = 6;
  ws.getColumn(2).width = 14; // Mes
  ws.getColumn(3).width = 16; // Ventas Neto
  ws.getColumn(4).width = 16; // IVA Débito
  ws.getColumn(5).width = 16; // Compras Neto
  ws.getColumn(6).width = 16; // IVA Crédito
  ws.getColumn(7).width = 16; // IVA a pagar

  ws.getCell("B2").value = `RESUMEN ${summaryYear} — ${company?.alias || company?.razonSocial || ""}`;
  ws.getCell("B2").font = { bold: true, size: 14 };
  ws.mergeCells(`B2:G2`);
  const annualVat = total.vatDebit - total.vatCredit;
  ws.getCell("B3").value = `IVA Débito ${fmtCurrency(total.vatDebit)} · IVA Crédito ${fmtCurrency(total.vatCredit)} · IVA ${annualVat >= 0 ? "a pagar" : "a favor"} ${fmtCurrency(Math.abs(annualVat))}`;
  ws.getCell("B3").font = { italic: true, color: { argb: "FF555555" } };
  ws.mergeCells(`B3:G3`);

  const HR = 5;
  const headers = ["Mes", "Ventas Neto", "IVA Débito", "Compras Neto", "IVA Crédito", "IVA a pagar"];
  headers.forEach((h, i) => {
    const c = ws.getCell(HR, 2 + i);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
    c.alignment = { horizontal: i === 0 ? "left" : "right", vertical: "middle" };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
  });

  let r = HR + 1;
  months.forEach((m, idx) => {
    const monthVat = m.vatDebit - m.vatCredit;
    const cells = [MONTH_NAMES_ES[idx], m.salesNet, m.vatDebit, m.purchasesNet, m.vatCredit, monthVat];
    cells.forEach((v, j) => {
      const c = ws.getCell(r, 2 + j);
      c.value = v;
      c.alignment = { horizontal: j === 0 ? "left" : "right" };
      c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      if (j >= 1) c.numFmt = '"$"#,##0';
      if (j === 5) c.font = { bold: true, color: { argb: monthVat < 0 ? "FF1F7A1F" : "FF000000" } };
    });
    r++;
  });

  const totalRow = r;
  const annualVatValue = total.vatDebit - total.vatCredit;
  const tCells = ["TOTAL", total.salesNet, total.vatDebit, total.purchasesNet, total.vatCredit, annualVatValue];
  tCells.forEach((v, j) => {
    const c = ws.getCell(totalRow, 2 + j);
    c.value = v;
    c.font = { bold: true, ...(j === 5 ? { color: { argb: annualVatValue < 0 ? "FF1F7A1F" : "FF000000" } } : {}) };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
    c.alignment = { horizontal: j === 0 ? "left" : "right" };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
    if (j >= 1) c.numFmt = '"$"#,##0';
  });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${summaryFileBase}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}
