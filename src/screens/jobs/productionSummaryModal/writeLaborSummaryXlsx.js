import { fmtNum } from "./helpers";
import { toArgbFill, HDR_BLUE, XLSX_BORDER, XLSX_MONEY_FMT, ROW_TOTAL_LIGHT } from "./tableStyles";

// Excel de la tarjeta de una labor: un día por fila con su producción, precio,
// monto y rendimiento, y el total al pie.
export async function writeLaborSummaryXlsx({ col, typeLabel, rows, totalQty, unit, persons, totalAmount }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet((col.labor.name || "Resumen").slice(0, 31));
  ws.getColumn(1).width = 6; // restricción de layout: col A vacía

  let r = 2; // fila 1 vacía
  ws.getCell(r, 2).value = col.labor.name;
  ws.getCell(r, 2).font = { bold: true, size: 13 };
  r++;
  ws.getCell(r, 2).value = `${col.cycleLabel} · ${typeLabel}${col.cycleStatus === "closed" ? " · cerrado" : ""}`;
  ws.getCell(r, 2).font = { size: 10, color: { argb: "FF666666" } };
  r += 2;

  const headerRow = r;
  ["Día", "Producción", "Precio", "Monto", "Rendimiento"].forEach((h, i) => {
    const c = ws.getCell(headerRow, 2 + i);
    c.value = h;
    c.font = { bold: true };
    c.fill = toArgbFill(HDR_BLUE);
    c.border = XLSX_BORDER;
  });
  r++;

  for (const { day, cell: cd } of rows) {
    ws.getCell(r, 2).value = day;
    ws.getCell(r, 3).value = `${fmtNum(cd.qty)}${cd.unit ? " " + cd.unit : ""}`;
    ws.getCell(r, 4).value = cd.priceLabel || "—";
    ws.getCell(r, 5).value = cd.amount;
    ws.getCell(r, 5).numFmt = XLSX_MONEY_FMT;
    ws.getCell(r, 6).value = cd.persons > 0 ? `${cd.persons} pers · prom ${fmtNum(cd.avg)}` : "—";
    for (let c = 2; c <= 6; c++) ws.getCell(r, c).border = XLSX_BORDER;
    r++;
  }

  const totalRow = r;
  ws.getCell(totalRow, 2).value = "TOTAL";
  ws.getCell(totalRow, 3).value = `${fmtNum(totalQty)}${unit ? " " + unit : ""}`;
  ws.getCell(totalRow, 4).value = `${persons} personas únicas`;
  ws.getCell(totalRow, 5).value = totalAmount;
  ws.getCell(totalRow, 5).numFmt = XLSX_MONEY_FMT;
  for (let c = 2; c <= 6; c++) {
    const cell = ws.getCell(totalRow, c);
    cell.font = { bold: true };
    cell.fill = toArgbFill(ROW_TOTAL_LIGHT);
    cell.border = XLSX_BORDER;
  }

  [2, 3, 4, 5, 6].forEach((c) => { ws.getColumn(c).width = 18; });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resumen_${col.labor.name}_${col.cycleLabel}`.replace(/[/\s]+/g, "_") + ".xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
