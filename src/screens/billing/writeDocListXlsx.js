// Excel del listado de Facturas o Compras tal como está filtrado y ordenado,
// plano o agrupado por centro de costo. Las NC restan y van en rojo.
import { CREDIT_NOTE_STATE, PAYMENT_STATUSES, formatPeriodPretty, groupDocsByCostCenter, kindTitleLabel } from "./docs";
import { fmtCurrency } from "../../utils/format";
import { CREDIT_NOTE_TYPES } from "../../utils/cashFlowProjection";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";

export async function writeDocListXlsx({ costCentersById, docListFileBase, groupByCostCenter, kindTab, periodFilter, selectedCompany, sortedFiltered, totals }) {
  const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const company = selectedCompany;
  const period = formatPeriodPretty(periodFilter);
  const kindLabel = kindTitleLabel(kindTab).toUpperCase();
  const contraLabel = kindTab === "venta" ? "Cliente" : "Proveedor";
  const showEstado = kindTab === "venta";
  const ws = wb.addWorksheet(kindTab === "venta" ? "Ventas-Facturas" : "Compras");
  ws.getColumn(1).width = 6;  // col A vacía de medio ancho (convención)
  ws.getColumn(2).width = 12; // Fecha
  ws.getColumn(3).width = 26; // Documento
  ws.getColumn(4).width = 10; // Folio
  ws.getColumn(5).width = 34; // Contraparte
  ws.getColumn(6).width = 16; // RUT
  ws.getColumn(7).width = 14; // Neto
  ws.getColumn(8).width = 14; // IVA
  ws.getColumn(9).width = 14; // Total
  ws.getColumn(10).width = 14; // Pagado
  if (showEstado) ws.getColumn(11).width = 16; // Estado

  const lastCol = showEstado ? 11 : 10;
  const lastColLetter = String.fromCharCode(64 + lastCol); // J o K

  ws.getCell("B2").value = `${kindLabel} — ${company?.alias || company?.razonSocial || ""} — ${period}`;
  ws.getCell("B2").font = { bold: true, size: 14 };
  ws.mergeCells(`B2:${lastColLetter}2`);
  ws.getCell("B3").value = `${sortedFiltered.length} documento${sortedFiltered.length === 1 ? "" : "s"} · Neto ${fmtCurrency(totals.neto)} · IVA ${fmtCurrency(totals.iva)} · Total ${fmtCurrency(totals.total)}${totals.ncCount > 0 ? ` · NC: -${fmtCurrency(totals.ncTotal)} (${totals.ncCount})` : ""}${groupByCostCenter ? " · Agrupado por centro de costo" : ""}`;
  ws.getCell("B3").font = { italic: true, color: { argb: "FF555555" } };
  ws.mergeCells(`B3:${lastColLetter}3`);

  const HR = 5;
  const headers = ["Fecha", "Documento", "Folio", contraLabel, "RUT", "Neto", "IVA", "Total", "Pagado"];
  if (showEstado) headers.push("Estado");
  headers.forEach((h, i) => {
    const c = ws.getCell(HR, 2 + i);
    c.value = h;
    c.font = { bold: true };
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
    c.alignment = { horizontal: i <= 4 ? "left" : i === 9 ? "center" : "right", vertical: "middle" };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
  });

  const writeDocRow = (r, d) => {
    const isNC = CREDIT_NOTE_TYPES.has(Number(d.tipo));
    const sign = isNC ? -1 : 1;
    const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
    const rut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
    const paid = Number(d.amountPaid) || 0;
    const estadoLabel = isNC
      ? CREDIT_NOTE_STATE.label
      : (PAYMENT_STATUSES[d.paymentStatus || "unpaid"]?.label || "—");
    const cells = [
      d.fechaEmision || "",
      d.tipoLabel || dteTypeLabel(d.tipo),
      d.folio,
      razon || "",
      formatRutForDisplay(rut) || "",
      sign * (Number(d.neto) || 0),
      sign * (Number(d.iva) || 0),
      sign * (Number(d.total) || 0),
      paid,
    ];
    if (showEstado) cells.push(estadoLabel);
    cells.forEach((v, j) => {
      const c = ws.getCell(r, 2 + j);
      c.value = v;
      c.alignment = { horizontal: j <= 3 ? "left" : j === 9 ? "center" : "right" };
      c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      if (j >= 5 && j <= 8) c.numFmt = '"$"#,##0';
      if (isNC && j >= 5 && j <= 7) c.font = { color: { argb: "FFCC0000" } };
    });
  };

  const writeGroupHeader = (r, label, count, isFuel, isManual) => {
    ws.getCell(r, 2).value = `${isFuel ? "⛽ COMBUSTIBLES" : label} · ${count} documento${count === 1 ? "" : "s"}`;
    ws.getCell(r, 2).font = { bold: true };
    ws.mergeCells(r, 2, r, lastCol);
    const fillColor = isFuel ? "FFFDE2CC" : isManual ? "FFDCE6F1" : "FFE2EFDA";
    for (let col = 2; col <= lastCol; col++) {
      ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: fillColor } };
      ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
    }
  };

  const writeSubtotalRow = (r, g) => {
    ws.getCell(r, 2).value = "Subtotal";
    ws.getCell(r, 2).font = { bold: true };
    ws.mergeCells(r, 2, r, 6);
    for (let col = 2; col <= lastCol; col++) {
      ws.getCell(r, col).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFF2F2F2" } };
      ws.getCell(r, col).border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
      ws.getCell(r, col).font = { bold: true };
    }
    const subs = [g.neto, g.iva, g.total];
    subs.forEach((v, j) => {
      const c = ws.getCell(r, 7 + j);
      c.value = v;
      c.numFmt = '"$"#,##0';
      c.alignment = { horizontal: "right" };
    });
  };

  const dataStart = HR + 1;
  let r = dataStart;
  if (groupByCostCenter) {
    const groups = groupDocsByCostCenter(sortedFiltered, kindTab, costCentersById);
    for (const g of groups) {
      writeGroupHeader(r, g.razon, g.docs.length, g.isFuel, g.isManual);
      r++;
      for (const d of g.docs) {
        writeDocRow(r, d);
        r++;
      }
      writeSubtotalRow(r, g);
      r++;
    }
  } else {
    for (const d of sortedFiltered) {
      writeDocRow(r, d);
      r++;
    }
  }
  const lastDataRow = r - 1;
  const totalRow = r;
  ws.getCell(totalRow, 2).value = `TOTAL (${sortedFiltered.length})`;
  ws.mergeCells(totalRow, 2, totalRow, 6);
  for (let col = 2; col <= lastCol; col++) {
    const c = ws.getCell(totalRow, col);
    c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6EFCE" } };
    c.border = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
    c.font = { bold: true };
  }
  // En la vista plana el total es un SUM sobre el rango; en la agrupada hay
  // filas intermedias (encabezados, subtotales), así que los totales van
  // como valores precalculados para no sumar dos veces.
  if (!groupByCostCenter && lastDataRow >= dataStart) {
    ws.getCell(totalRow, 7).value = { formula: `SUM(G${dataStart}:G${lastDataRow})`, result: totals.neto };
    ws.getCell(totalRow, 8).value = { formula: `SUM(H${dataStart}:H${lastDataRow})`, result: totals.iva };
    ws.getCell(totalRow, 9).value = { formula: `SUM(I${dataStart}:I${lastDataRow})`, result: totals.total };
    ws.getCell(totalRow, 10).value = { formula: `SUM(J${dataStart}:J${lastDataRow})`, result: 0 };
  } else {
    ws.getCell(totalRow, 7).value = Number(totals.neto) || 0;
    ws.getCell(totalRow, 8).value = Number(totals.iva) || 0;
    ws.getCell(totalRow, 9).value = Number(totals.total) || 0;
    ws.getCell(totalRow, 10).value = 0;
  }
  for (let col = 7; col <= 10; col++) {
    ws.getCell(totalRow, col).alignment = { horizontal: "right" };
    ws.getCell(totalRow, col).numFmt = '"$"#,##0';
  }

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${docListFileBase}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}
