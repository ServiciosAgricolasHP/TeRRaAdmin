// Excel de la tabla general: cada labor ocupa 2 columnas (Cant./Monto) bajo
// un encabezado combinado con su nombre, como la tabla en pantalla.
// `writeTotalRow` escribe las filas de cierre (TOTAL A PAGAR, GANANCIAS,
// TRANSPORTE, etc.), que difieren en qué columnas llenan y con qué color.
import { fmtCLP, fmtNum } from "./helpers";
import { HDR_GREEN, ROW_GROSS, ROW_PROFIT, ROW_TOTAL_DARK, ROW_TOTAL_GENERAL, ROW_VAT, XLSX_BORDER, XLSX_MONEY_FMT, toArgbFill } from "./tableStyles";
import { isSupervisionCol } from "../../../utils/combinedSummary";

export async function writeCombinedSummaryXlsx({ activeDays, byLaborDay, dataByColumn, firstColKeyForCycle, grandTotal, grandTotalGeneral, grandTotalGross, grandTotalTransport, grandTotalVat, hasSupervisionCols, includeTransport, profitFor, totalGeneralFor, totalProfit, totalProfitBillable, totalsByDay, transportByCycle, vatEnabled }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Tabla general");
  ws.getColumn(1).width = 6; // restricción de layout: col A vacía

  const COL_DAY = 2;
  const COL_FIRST_LABOR = 3;
  const COL_TOTAL = COL_FIRST_LABOR + dataByColumn.length * 2;

  let r = 2; // fila 1 vacía
  ws.getCell(r, 2).value = "Tabla general — resumen consolidado";
  ws.getCell(r, 2).font = { bold: true, size: 13 };
  r++;
  ws.getCell(r, 2).value = `${dataByColumn.length} labores · ${activeDays.length} días · gran total ${fmtCLP(grandTotal)}`;
  ws.getCell(r, 2).font = { size: 10, color: { argb: "FF666666" } };
  r += 2;

  const headerRow1 = r;
  const headerRow2 = r + 1;
  ws.mergeCells(headerRow1, COL_DAY, headerRow2, COL_DAY);
  ws.getCell(headerRow1, COL_DAY).value = "Día";
  ws.mergeCells(headerRow1, COL_TOTAL, headerRow2, COL_TOTAL);
  ws.getCell(headerRow1, COL_TOTAL).value = "Total día";
  dataByColumn.forEach((d, i) => {
    const c0 = COL_FIRST_LABOR + i * 2;
    ws.mergeCells(headerRow1, c0, headerRow1, c0 + 1);
    ws.getCell(headerRow1, c0).value = `${d.col.labor.name} (${d.col.cycleLabel})`;
    ws.getCell(headerRow2, c0).value = "Cant.";
    ws.getCell(headerRow2, c0 + 1).value = "Monto";
  });
  for (let c = COL_DAY; c <= COL_TOTAL; c++) {
    for (const rr of [headerRow1, headerRow2]) {
      const cell = ws.getCell(rr, c);
      cell.font = { bold: true };
      cell.fill = toArgbFill(HDR_GREEN);
      cell.border = XLSX_BORDER;
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
    }
  }
  r += 2;

  for (const day of activeDays) {
    ws.getCell(r, COL_DAY).value = day;
    dataByColumn.forEach((d, i) => {
      const c0 = COL_FIRST_LABOR + i * 2;
      const cellData = byLaborDay.get(d.col.key)?.get(day);
      if (!cellData) return;
      ws.getCell(r, c0).value = `${fmtNum(cellData.qty)}${cellData.unit ? " " + cellData.unit : ""}`;
      ws.getCell(r, c0 + 1).value = cellData.amount;
      ws.getCell(r, c0 + 1).numFmt = XLSX_MONEY_FMT;
    });
    ws.getCell(r, COL_TOTAL).value = totalsByDay.get(day) || 0;
    ws.getCell(r, COL_TOTAL).numFmt = XLSX_MONEY_FMT;
    for (let c = COL_DAY; c <= COL_TOTAL; c++) ws.getCell(r, c).border = XLSX_BORDER;
    r++;
  }

  const writeTotalRow = (label, fill, fontArgb, amountForCol, totalValue, { qtyToo = false } = {}) => {
    ws.getCell(r, COL_DAY).value = label;
    dataByColumn.forEach((d, i) => {
      const c0 = COL_FIRST_LABOR + i * 2;
      if (qtyToo) ws.getCell(r, c0).value = `${fmtNum(d.totalQty)}${d.unit ? " " + d.unit : ""}`;
      const v = amountForCol(d);
      if (v != null) {
        ws.getCell(r, c0 + 1).value = v;
        ws.getCell(r, c0 + 1).numFmt = XLSX_MONEY_FMT;
      }
    });
    ws.getCell(r, COL_TOTAL).value = totalValue;
    ws.getCell(r, COL_TOTAL).numFmt = XLSX_MONEY_FMT;
    for (let c = COL_DAY; c <= COL_TOTAL; c++) {
      const cell = ws.getCell(r, c);
      cell.font = { bold: true, color: { argb: fontArgb } };
      cell.fill = toArgbFill(fill);
      cell.border = XLSX_BORDER;
    }
    r++;
  };

  writeTotalRow("TOTAL A PAGAR", ROW_TOTAL_DARK, "FFFFFFFF", (d) => d.totalAmount, grandTotal, { qtyToo: true });
  writeTotalRow(
    "GANANCIAS", ROW_PROFIT, "FF1A2E0F",
    (d) => (isSupervisionCol(d.col) ? null : profitFor(d.col, d.totalAmount)),
    totalProfitBillable,
  );
  if (includeTransport) {
    writeTotalRow(
      "TRANSPORTE", ROW_TOTAL_DARK, "FFFFFFFF",
      (d) => (firstColKeyForCycle.get(d.col.cycleId) === d.col.key ? (transportByCycle.get(d.col.cycleId)?.total || 0) : null),
      grandTotalTransport,
    );
  }
  if (hasSupervisionCols) {
    writeTotalRow(
      "MONTO LIBRE", ROW_VAT, "FF274E13",
      (d) => (isSupervisionCol(d.col) ? profitFor(d.col, d.totalAmount) : null),
      totalProfit,
    );
  }
  if (includeTransport && grandTotalTransport !== 0) {
    writeTotalRow("MONTO LIBRE NETO", ROW_VAT, "FF274E13", () => null, totalProfit - grandTotalTransport);
  }
  writeTotalRow(
    "TOTAL GENERAL", ROW_TOTAL_GENERAL, "FFFFFFFF",
    (d) => totalGeneralFor(d.col, d.totalAmount),
    grandTotalGeneral,
  );
  if (vatEnabled) {
    writeTotalRow("IVA (19%)", ROW_VAT, "FF274E13", () => null, grandTotalVat);
    writeTotalRow("BRUTO", ROW_GROSS, "FFFFFFFF", () => null, grandTotalGross);
  }

  ws.getColumn(COL_DAY).width = 12;
  for (let i = 0; i < dataByColumn.length; i++) {
    ws.getColumn(COL_FIRST_LABOR + i * 2).width = 14;
    ws.getColumn(COL_FIRST_LABOR + i * 2 + 1).width = 14;
  }
  ws.getColumn(COL_TOTAL).width = 16;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "tabla_general_produccion.xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
