// Excel del historial de pagos de una persona en el rango elegido: una fila
// por nómina o diferencia, con el total al pie.
export async function writeWorkerPaymentsXlsx({ selectedWorker, dateFrom, dateTo, classification }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pagos");
  ws.addRow(["", ""]); // fila 1 vacía
  ws.getColumn(1).width = 4;
  ws.addRow(["", `Historial de pagos — ${selectedWorker.name} (${selectedWorker.rut})`]);
  ws.getRow(2).font = { bold: true, size: 13 };
  ws.addRow(["", `Rango: ${dateFrom} → ${dateTo} · ${classification === "all" ? "Nóminas + Diferencias" : classification === "nomina" ? "Solo nóminas" : "Solo diferencias"}`]);
  ws.addRow([]);
  const header = ["", "Fecha", "Nómina", "Tipo", "Líder", "Faenas", "Bruto", "Anticipos", "Bonos", "Neto"];
  const hdrRow = ws.addRow(header);
  hdrRow.eachCell((cell, col) => {
    if (col === 1) return;
    cell.font = { bold: true };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB7DEE8" } };
    cell.border = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  });
  for (const pay of selectedWorker.payments) {
    const r = ws.addRow([
      "",
      pay.payrollDateISO,
      pay.payrollName,
      pay.classification === "diferencia" ? "Diferencia" : "Nómina",
      pay.groupLeader || "—",
      pay.faenaNames.join(" / ") || "—",
      Math.round(pay.gross),
      Math.round(pay.advance),
      Math.round(pay.bonus),
      Math.round(pay.amount),
    ]);
    for (let c = 7; c <= 10; c++) r.getCell(c).numFmt = '"$"#,##0';
  }
  const totalRow = ws.addRow([
    "", "", "TOTAL", "", "", "",
    Math.round(selectedWorker.totalGross),
    Math.round(selectedWorker.totalAdvance),
    Math.round(selectedWorker.totalBonus),
    Math.round(selectedWorker.totalAmount),
  ]);
  totalRow.font = { bold: true };
  totalRow.eachCell((cell, col) => {
    if (col === 1) return;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
    if (col >= 7) cell.numFmt = '"$"#,##0';
  });
  ws.getColumn(2).width = 12;
  ws.getColumn(3).width = 30;
  ws.getColumn(4).width = 12;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 28;
  for (let c = 7; c <= 10; c++) ws.getColumn(c).width = 14;
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeName = (selectedWorker.name || selectedWorker.rut).replace(/[^a-z0-9_-]+/gi, "_");
  a.href = url;
  a.download = `historial_${safeName}.xlsx`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
