// Excel de los pagos de un ciclo, con los mismos grupos, filas, columnas y
// totales que la tabla en pantalla (`cyclePaymentGroups`).
import { sheetName } from "../../../utils/sheetNames";
import { formatRutForDisplay } from "../../../utils/rutUtils";
import { PAY_STATE_PILL } from "../payState";

const stateLabel = (payroll) => (PAY_STATE_PILL[payroll.state] || PAY_STATE_PILL.pending).label;

export async function writeCyclePaymentsXlsx({ cycleLabel, report, subtitle }) {
  const ExcelJS = (await import("exceljs")).default;
  const { groups, labors, totals, view } = report;
  const byPayroll = view === "payroll";
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetName("Pagos del ciclo"));
  ws.getColumn(1).width = 6; // restricción de layout: col A vacía

  const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB7DEE8" } };
  const GROUP_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
  const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE699" } };
  const thinBorder = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
  const moneyFmt = '"$"#,##0';

  // Columnas de texto: la persona y su RUT, la nómina y su estado; primero
  // las del grupo.
  const personCols = [{ label: "Trabajador", width: 32 }, { label: "RUT", width: 14 }];
  const payrollCols = [{ label: "Nómina", width: 30 }, { label: "Estado", width: 18 }];
  const textCols = byPayroll ? [...payrollCols, ...personCols] : [...personCols, ...payrollCols];
  const headers = [...textCols.map((c) => c.label), ...labors.map((l) => l.name), "Del ciclo", "Líquido en la nómina"];
  const firstMoney = 2 + textCols.length;
  const lastCol = 1 + headers.length;

  let r = 2; // fila 1 vacía
  ws.getCell(r, 2).value = `Pagos del ciclo ${cycleLabel}`;
  ws.getCell(r, 2).font = { bold: true, size: 13 };
  r++;
  ws.getCell(r, 2).value = subtitle;
  ws.getCell(r, 2).font = { size: 10, color: { argb: "FF666666" } };
  r += 2;

  headers.forEach((h, i) => {
    const c = ws.getCell(r, 2 + i);
    c.value = h;
    c.font = { bold: true };
    c.fill = HEADER_FILL;
    c.border = thinBorder;
  });
  r++;

  const writeRow = (texts, amounts, { fill = null, bold = false } = {}) => {
    [...texts, ...amounts].forEach((v, i) => {
      const c = ws.getCell(r, 2 + i);
      if (v != null) c.value = v;
      if (2 + i >= firstMoney) c.numFmt = moneyFmt;
      if (fill) c.fill = fill;
      if (bold) c.font = { bold: true };
      c.border = thinBorder;
    });
    r++;
  };
  const amountsOf = (byLabor, cycleAmount, net) => [...labors.map((l) => (l.id in byLabor ? byLabor[l.id] : null)), cycleAmount, net];

  for (const g of groups) {
    for (const row of g.rows) {
      const person = [row.name, formatRutForDisplay(row.rut)];
      const payroll = [row.payroll.name, stateLabel(row.payroll)];
      writeRow(byPayroll ? [...payroll, ...person] : [...person, ...payroll], amountsOf(row.byLabor, row.cycleAmount, row.net));
    }
    if (g.rows.length > 1) {
      writeRow([`Subtotal ${g.name}`, ...textCols.slice(1).map(() => null)], amountsOf(g.totals.byLabor, g.totals.cycleAmount, g.totals.net), { fill: GROUP_FILL, bold: true });
    }
  }
  writeRow(["Total", ...textCols.slice(1).map(() => null)], amountsOf(totals.byLabor, totals.cycleAmount, null), { fill: TOTAL_FILL, bold: true });

  textCols.forEach((c, i) => { ws.getColumn(2 + i).width = c.width; });
  for (let c = firstMoney; c <= lastCol; c++) ws.getColumn(c).width = 18;

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `pagos_ciclo_${cycleLabel}`.replace(/[/\\\s]+/g, "_") + ".xlsx";
  a.click();
  URL.revokeObjectURL(url);
}
