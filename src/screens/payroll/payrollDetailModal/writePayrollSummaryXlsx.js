// Excel de la tabla del resumen del detalle de una nómina, por subfaena o por
// labor, con el efectivo pendiente de otras nóminas según el modo elegido, los
// ajustes (bonos, anticipos y efectivo que queda pendiente) y el total.
import { fmtDayShortEs } from "../helpers";

export async function writePayrollSummaryXlsx({ bonusAdvanceSummary, deferredCash, grandTotals, labelColumns, payroll, pendingMode, pendingSummaryRows, summaryDisplayRows, summaryShowLabor }) {
    const ExcelJS = (await import("exceljs")).default;
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet(summaryShowLabor ? "Resumen por labor" : "Resumen por subfaena");
    ws.getColumn(1).width = 6; // restricción de layout: col A vacía

    const HEADER_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFB7DEE8" } };
    const TOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFE699" } };
    const SUBTOTAL_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
    const ADJ_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEAF3FA" } };
    const PENDING_FILL = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E5" } };
    const thinBorder = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
    const moneyFmt = '"$"#,##0';
    const labelCols = labelColumns.length;
    const totalCols = labelCols + 3;

    let r = 2; // fila 1 vacía
    ws.getCell(r, 2).value = `Resumen ${summaryShowLabor ? "por labor" : "por subfaena"}`
      + (pendingMode === "with" ? " · incluye efectivo pendiente de nóminas anteriores" : "")
      + (pendingMode === "onlyPending" ? " · transferencias + solo el efectivo pendiente de antes" : "");
    ws.getCell(r, 2).font = { bold: true, size: 13 };
    r++;
    ws.getCell(r, 2).value = payroll.name;
    ws.getCell(r, 2).font = { size: 10, color: { argb: "FF666666" } };
    r += 2;

    const headers = [...labelColumns.map((c) => c.label), "Transferencia", "Efectivo", "TOTAL"];
    headers.forEach((h, i) => {
      const c = ws.getCell(r, 2 + i);
      c.value = h;
      c.font = { bold: true };
      c.fill = HEADER_FILL;
      c.border = thinBorder;
    });
    r++;

    for (const entry of summaryDisplayRows) {
      if (entry.subtotal) {
        ws.getCell(r, 2).value = "Sub total por faena";
        ws.mergeCells(r, 2, r, 1 + labelCols);
        ws.getCell(r, 2 + labelCols).value = entry.subtotal.bank;
        ws.getCell(r, 3 + labelCols).value = entry.subtotal.cash;
        ws.getCell(r, 4 + labelCols).value = entry.subtotal.total;
        for (let c = 2; c <= 1 + totalCols; c++) {
          const cell = ws.getCell(r, c);
          if (c > 1 + labelCols) cell.numFmt = moneyFmt;
          cell.fill = SUBTOTAL_FILL;
          cell.font = { italic: true, bold: true };
          cell.border = thinBorder;
        }
        r++;
        continue;
      }
      const row = entry.row;
      let col = 2;
      for (const text of entry.labels) ws.getCell(r, col++).value = text;
      ws.getCell(r, col).value = row.bank; ws.getCell(r, col++).numFmt = moneyFmt;
      ws.getCell(r, col).value = row.cash; ws.getCell(r, col++).numFmt = moneyFmt;
      ws.getCell(r, col).value = row.total; ws.getCell(r, col++).numFmt = moneyFmt;
      for (let c = 2; c <= 1 + totalCols; c++) ws.getCell(r, c).border = thinBorder;
      r++;
    }

    // Efectivo adeudado de nóminas anteriores: una fila por nómina, con el
    // monto neto. Va en el cuerpo, antes de los ajustes de esta nómina.
    if (pendingMode !== "none") {
      for (const pr of pendingSummaryRows) {
        const label = `💵 Efectivo pendiente — ${pr.name} · ${pr.count} pers.`;
        ws.getCell(r, 2).value = label;
        ws.mergeCells(r, 2, r, labelCols); // deja libre la columna de Período
        ws.getCell(r, 1 + labelCols).value = pr.period
          ? `${fmtDayShortEs(pr.period.first)} → ${fmtDayShortEs(pr.period.last)}`
          : "—";
        ws.getCell(r, 2 + labelCols).value = 0;
        ws.getCell(r, 3 + labelCols).value = pr.cash;
        ws.getCell(r, 4 + labelCols).value = pr.total;
        for (let c = 2; c <= 1 + totalCols; c++) {
          const cell = ws.getCell(r, c);
          if (c > 1 + labelCols) cell.numFmt = moneyFmt;
          cell.fill = PENDING_FILL;
          cell.border = thinBorder;
        }
        r++;
      }
    }

    const writeAdjRow = (label, values) => {
      ws.getCell(r, 2).value = label;
      ws.mergeCells(r, 2, r, 1 + labelCols);
      ws.getCell(r, 2 + labelCols).value = values.bank;
      ws.getCell(r, 3 + labelCols).value = values.cash;
      ws.getCell(r, 4 + labelCols).value = values.total;
      for (let c = 2; c <= 1 + totalCols; c++) {
        const cell = ws.getCell(r, c);
        if (c > 1 + labelCols) cell.numFmt = moneyFmt;
        cell.fill = ADJ_FILL;
        cell.border = thinBorder;
      }
      r++;
    };
    if (bonusAdvanceSummary.bonus.total > 0) writeAdjRow("Bonos", bonusAdvanceSummary.bonus);
    if (bonusAdvanceSummary.advance.total > 0) {
      writeAdjRow("Anticipos", {
        bank: -bonusAdvanceSummary.advance.bank,
        cash: -bonusAdvanceSummary.advance.cash,
        total: -bonusAdvanceSummary.advance.total,
      });
    }
    if (deferredCash > 0) {
      writeAdjRow("Efectivo que queda pendiente", { bank: 0, cash: -deferredCash, total: -deferredCash });
    }
    const at = grandTotals;
    ws.getCell(r, 2).value = pendingMode === "onlyPending" ? "TOTAL A PAGAR" : "TOTAL";
    ws.mergeCells(r, 2, r, 1 + labelCols);
    ws.getCell(r, 2 + labelCols).value = at.bank;
    ws.getCell(r, 3 + labelCols).value = at.cash;
    ws.getCell(r, 4 + labelCols).value = at.total;
    for (let c = 2; c <= 1 + totalCols; c++) {
      const cell = ws.getCell(r, c);
      if (c > 1 + labelCols) cell.numFmt = moneyFmt;
      cell.fill = TOTAL_FILL;
      cell.font = { bold: true };
      cell.border = thinBorder;
    }

    const LABEL_WIDTHS = { faena: 20, subfaena: 20, labor: 22, period: 14 };
    labelColumns.forEach((c, i) => { ws.getColumn(2 + i).width = LABEL_WIDTHS[c.key]; });
    ws.getColumn(2 + labelCols).width = 14; // Transferencia
    ws.getColumn(3 + labelCols).width = 16; // Efectivo
    ws.getColumn(4 + labelCols).width = 16; // TOTAL

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `resumen_${summaryShowLabor ? "por_labor" : "por_subfaena"}_${payroll.name}`.replace(/[/\s]+/g, "_") + ".xlsx";
    a.click();
    URL.revokeObjectURL(url);
}
