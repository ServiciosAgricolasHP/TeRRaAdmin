import { dateLabel } from "../../../utils/cycleSummary";
import { carrierColumns, laborColumns, sectionTotal, summarySections } from "../../../utils/summaryTables";

// XLSX del resumen del ciclo: lo mismo que se ve en pantalla. Una hoja por
// tabla (labor, tabla juntada o transportista) con sus mismas columnas, filas
// y subtotal, que salen de utils/summaryTables.js como en `LaborTable` y
// `TransportTable`; la hoja Total con el total de cada tabla y el bloque final
// (descuento, IVA y saldo pendiente); y en pagar, las observaciones por día.
// Cada hoja deja la columna A vacía (mitad de ancho) y la fila 1 vacía.

const MONEY_FMT = '"$"#,##0;[Red]-"$"#,##0';
const NUMBER_FMT = "#,##0.##";
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });
const HEADER_FILL = fill("FF9DC3E6");
const TRANSPORT_FILL = fill("FFFBE5D6");
const SUBTOTAL_FILL = fill("FFC6EFCE");
const TOTAL_FILL = fill("FFA9D08E");
const FINAL_FILL = fill("FF6AA84F");
const MUTED = "FF999999";
const AMBER = "FFB45309";

// Un texto que la pantalla muestra como número o monto ("1.234", "$5.000")
// va como número, así se puede sumar en Excel.
function parseShown(s) {
  const m = /^(\$)?(-?\d{1,3}(?:\.\d{3})*(?:,\d+)?|-?\d+(?:,\d+)?)$/.exec(String(s).trim());
  if (!m) return null;
  const n = Number(m[2].replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? { n, money: !!m[1] } : null;
}

// Escribe el valor de una celda como en pantalla: vacío, número con su
// formato o texto.
function writeValue(c, col, v) {
  if (v == null || v === "") return;
  if (typeof v === "number") {
    c.value = v;
    if (col.kind === "money") c.numFmt = MONEY_FMT;
    else if (col.kind === "number") c.numFmt = NUMBER_FMT;
    return;
  }
  const parsed = parseShown(v);
  if (parsed) {
    c.value = parsed.n;
    c.numFmt = parsed.money ? MONEY_FMT : NUMBER_FMT;
    return;
  }
  c.value = v;
}

const colLetter = (i) => String.fromCharCode(66 + i); // 0 → B

export function buildCycleSummaryWorkbook(ExcelJS, {
  carrierById,
  catalogs,
  charge = {},
  chargeCarriers,
  chargeLabors,
  dayNotes = [],
  dayPrices,
  grandTotalCharge,
  grandTotalPay,
  hiddenColumns = new Set(),
  laborsData,
  mode,
  subtotalCharge,
  titles,
  transportData,
}) {
  const isCharge = mode === "charge";
  const wb = new ExcelJS.Workbook();
  const usedNames = new Set();
  const safeName = (s) => {
    const base = String(s || "Hoja").substring(0, 28).replace(/[\\/?*[\]:]/g, "_");
    let name = base, i = 2;
    while (usedNames.has(name)) {
      name = `${base} ${i}`.substring(0, 31);
      i++;
    }
    usedNames.add(name);
    return name;
  };

  const sections = summarySections({
    mode,
    labors: isCharge ? chargeLabors : laborsData,
    carriers: isCharge ? chargeCarriers : transportData,
    titles,
    carrierById,
    dayPrices,
  });

  // ============ UNA HOJA POR TABLA ============
  for (const section of sections) {
    const isLabor = section.kind === "labor";
    const title = isLabor ? section.displayName : `🚐 ${section.displayName}`;
    const ws = wb.addWorksheet(safeName(title));
    ws.getColumn(1).width = 6;
    ws.getCell("B2").value = title;
    ws.getCell("B2").font = { bold: true, size: 14 };

    const columns = isLabor
      ? laborColumns(section, { mode, hiddenColumns, catalogs })
      : carrierColumns(section, { mode, hiddenColumns });
    const HEADER_ROW = 4;
    columns.forEach((col, i) => {
      const c = ws.getCell(`${colLetter(i)}${HEADER_ROW}`);
      c.value = col.label;
      c.font = { bold: true };
      c.fill = isLabor ? HEADER_FILL : TRANSPORT_FILL;
      c.alignment = { horizontal: i < 2 ? "left" : "right" };
    });

    let row = HEADER_ROW + 1;
    for (const r of section.rows) {
      columns.forEach((col, i) => {
        const c = ws.getCell(`${colLetter(i)}${row}`);
        if (col.key === "date") {
          const badge = col.badge ? col.badge(r) : null;
          c.value = badge ? `${col.value(r)} (${badge})` : col.value(r);
          // tratoHE: sábados, domingos y feriados en rojo.
          if (section.laborType === "tratoHE" && section.redDates?.has(r.date)) c.font = { bold: true, color: { argb: "FFCC0000" } };
          return;
        }
        const v = col.value(r);
        // Detalle: el nombre tal cual, aunque parezca un número.
        if (i < 2) {
          c.value = v;
          return;
        }
        writeValue(c, col, v);
        c.alignment = { horizontal: "right" };
        if (col.key === "total") c.font = { bold: true };
        else if (col.key === "heWorked") c.font = { color: { argb: "FF555555" } };
        else if (col.key === "piso" || col.key === "bonos") c.font = { color: { argb: v === "—" ? MUTED : AMBER } };
        else if (col.key === "transport" && typeof v === "string") c.font = { color: { argb: MUTED } };
      });
      row++;
    }

    // Subtotal, como el de la tabla: el rótulo ocupa Detalle y Fecha.
    ws.getCell(`B${row}`).value = `Subtotal ${section.displayName}`;
    ws.mergeCells(`B${row}:C${row}`);
    columns.forEach((col, i) => {
      const c = ws.getCell(`${colLetter(i)}${row}`);
      c.fill = SUBTOTAL_FILL;
      c.font = { bold: true };
      if (i < 2 || !col.total) return;
      writeValue(c, col, col.total(section.totals));
      c.alignment = { horizontal: "right" };
      if (col.key === "heWorked") c.font = { bold: true, color: { argb: "FF555555" } };
      if (col.key === "piso" || col.key === "bonos") c.font = { bold: true, color: { argb: AMBER } };
    });

    ws.getColumn(2).width = 28;
    ws.getColumn(3).width = 14;
    for (let i = 2; i < columns.length; i++) ws.getColumn(i + 2).width = 14;
    ws.views = [{ state: "frozen", ySplit: HEADER_ROW }];
  }

  // ============ HOJA TOTAL ============
  const wsTotal = wb.addWorksheet(safeName("Total"));
  wsTotal.getColumn(1).width = 6;
  wsTotal.getColumn(2).width = 40;
  wsTotal.getColumn(3).width = 16;
  wsTotal.getCell("B2").value = titles.main || "DETALLE DE JORNADA";
  wsTotal.getCell("B2").font = { bold: true, size: 14 };
  if (titles.subtitle) wsTotal.getCell("B3").value = titles.subtitle;

  const HR = 5;
  ["Concepto", "Total"].forEach((h, i) => {
    const c = wsTotal.getCell(`${colLetter(i)}${HR}`);
    c.value = h;
    c.font = { bold: true };
    c.fill = HEADER_FILL;
    c.alignment = { horizontal: i === 0 ? "left" : "right" };
  });
  let row = HR + 1;
  const line = (label, value, { font, labelFont, valueFill } = {}) => {
    wsTotal.getCell(`B${row}`).value = label;
    if (labelFont) wsTotal.getCell(`B${row}`).font = labelFont;
    const c = wsTotal.getCell(`C${row}`);
    c.value = value;
    c.numFmt = MONEY_FMT;
    c.alignment = { horizontal: "right" };
    if (font) c.font = font;
    if (valueFill) {
      wsTotal.getCell(`B${row}`).fill = valueFill;
      c.fill = valueFill;
    }
    row++;
  };
  for (const section of sections) {
    line(section.kind === "labor" ? section.displayName : `🚐 ${section.displayName}`, sectionTotal(section, mode));
  }
  row++;

  // El bloque final, como abajo del resumen.
  const discount = isCharge ? Math.max(0, Number(charge.discount) || 0) : 0;
  const pending = isCharge ? Math.max(0, Number(charge.pendingBalance) || 0) : 0;
  const withIva = isCharge && charge.withIva !== false;
  const grandTotal = isCharge ? grandTotalCharge : grandTotalPay;
  if (isCharge && (discount > 0 || pending > 0)) {
    line("Subtotal", subtotalCharge, { font: { bold: true }, labelFont: { bold: true } });
  }
  if (discount > 0) {
    const red = { bold: true, color: { argb: "FFBB0000" } };
    line(charge.discountNote ? `Descuento · ${charge.discountNote}` : "Descuento", -discount, { font: red, labelFont: red });
  }
  const bold14 = { bold: true, size: 14 };
  line(isCharge ? (withIva ? "TOTAL A FACTURAR" : "TOTAL A COBRAR (sin IVA)") : "TOTAL GENERAL", grandTotal, {
    font: bold14, labelFont: bold14, valueFill: TOTAL_FILL,
  });
  if (withIva) {
    line("Valor IVA (19%)", Math.round((Number(grandTotal) || 0) * 0.19), { font: { bold: true }, labelFont: { bold: true } });
    line("IVA incluido", Math.round((Number(grandTotal) || 0) * 1.19), { font: bold14, labelFont: bold14, valueFill: SUBTOTAL_FILL });
  }
  if (pending > 0) {
    const green = { bold: true, color: { argb: "FF0A7D3B" } };
    line(charge.pendingBalanceNote ? `Saldo pendiente · ${charge.pendingBalanceNote}` : "Saldo pendiente", pending, { font: green, labelFont: green });
    const postIva = withIva ? Math.round((Number(grandTotal) || 0) * 1.19) : Number(grandTotal) || 0;
    const white = { bold: true, size: 14, color: { argb: "FFFFFFFF" } };
    line("TOTAL FINAL", postIva + pending, { font: white, labelFont: white, valueFill: FINAL_FILL });
  }

  // ============ OBSERVACIONES (pagar) ============
  // Solo en pagar: son apuntes internos, igual que en pantalla.
  if (!isCharge && dayNotes.length > 0) {
    const ws = wb.addWorksheet(safeName("Observaciones"));
    ws.getColumn(1).width = 6;
    ws.getColumn(2).width = 12;
    ws.getColumn(3).width = 80;
    ws.getCell("B2").value = "OBSERVACIONES POR DÍA";
    ws.getCell("B2").font = { bold: true, size: 14 };
    ["Fecha", "Observación"].forEach((h, i) => {
      const c = ws.getCell(`${colLetter(i)}4`);
      c.value = h;
      c.font = { bold: true };
      c.fill = HEADER_FILL;
    });
    const showLaborNames = (laborsData || []).length > 1;
    let r = 5;
    for (const g of dayNotes) {
      const lines = g.shared ? [{ name: "Todas las labores", text: g.shared }] : [];
      for (const e of g.entries) lines.push({ name: e.name, text: e.text });
      ws.getCell(`B${r}`).value = dateLabel(g.date);
      ws.getCell(`B${r}`).font = { bold: true };
      ws.getCell(`B${r}`).alignment = { vertical: "top" };
      const c = ws.getCell(`C${r}`);
      c.value = lines.map((l) => `${showLaborNames ? `${l.name} — ` : ""}${l.text}`).join("\n");
      c.alignment = { wrapText: true, vertical: "top" };
      r++;
    }
  }
  return wb;
}

export async function writeCycleSummaryXlsx({ cycle, mode, ...args }) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = buildCycleSummaryWorkbook(ExcelJS, { mode, ...args });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `resumen_${mode}_${(cycle?.label || "ciclo").replace(/[/\s]+/g, "_")}.xlsx`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
