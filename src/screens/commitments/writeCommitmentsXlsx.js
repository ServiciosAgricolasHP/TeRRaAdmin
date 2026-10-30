import { kindMeta, statusLabel, partialPaidOf, extraOf, paidTotalOf } from "../../utils/commitments";
import { bankName } from "../../utils/banks";
import { fmtDate } from "./helpers";

// La lista de Cheques y pagos tal como está filtrada, con el total al pie.
// `companyName(c)` da el nombre de la empresa de cada documento.
export async function writeCommitmentsXlsx({ items, total, today, companyName }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Cheques y pagos");
  ws.getColumn(1).width = 6;
  const headers = ["Vencimiento", "Tipo", "Estado", "Banco", "N° cheque", "Contraparte", "Concepto", "Monto", "Abonado", "Interés / extra", "Total pagado", "Fecha de pago", "Empresa", "Observaciones"];
  const head = ws.getRow(2);
  headers.forEach((h, i) => {
    const cell = head.getCell(i + 2);
    cell.value = h;
    cell.font = { bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } };
  });
  items.forEach((c, idx) => {
    const row = ws.getRow(idx + 3);
    [
      fmtDate(c.dueDate),
      kindMeta(c.kind).label,
      statusLabel(c, today),
      c.bank ? bankName(c.bank) : "",
      c.chequeNumber || "",
      c.counterparty || "",
      c.concept || "",
      Number(c.amount) || 0,
      partialPaidOf(c) || "",
      extraOf(c) || "",
      c.status === "paid" ? paidTotalOf(c) : "",
      fmtDate(c.paidAt),
      companyName(c),
      c.notes || "",
    ].forEach((v, i) => {
      row.getCell(i + 2).value = v;
    });
    [9, 10, 11, 12].forEach((col) => {
      row.getCell(col).numFmt = '"$"#,##0';
    });
  });
  const totalRow = ws.getRow(items.length + 3);
  totalRow.getCell(8).value = "Total (sin anulados)";
  totalRow.getCell(9).value = total;
  totalRow.getCell(9).numFmt = '"$"#,##0';
  totalRow.font = { bold: true };
  [12, 18, 12, 22, 12, 28, 26, 14, 14, 14, 14, 12, 18, 40].forEach((w, i) => {
    ws.getColumn(i + 2).width = w;
  });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Cheques_y_pagos_${today}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
