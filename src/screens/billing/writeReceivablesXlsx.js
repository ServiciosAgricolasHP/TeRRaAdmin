import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { formatPeriodPretty, todayIso } from "./docs";
import { companyBreakdown, docTypeLabel, monthLabel, statusLabel } from "./receivablesLabels";

const BORDER = { top: { style: "thin" }, left: { style: "thin" }, right: { style: "thin" }, bottom: { style: "thin" } };
const MONEY = '"$"#,##0';
const fill = (argb) => ({ type: "pattern", pattern: "solid", fgColor: { argb } });

// Excel de la pestaña Pendientes, con la convención del proyecto (col A vacía
// de ancho 6, fila 1 vacía, datos desde B2) y lo mismo que la pantalla: las
// columnas de la tabla, las facturas por cobrar por cliente y el IVA
// pendiente por cliente y por mes, con sus subtotales. Los subtotales van
// como valores, no como fórmulas: sumar una columna con subtotales
// intercalados los contaría dos veces. Recibe la vista ya sin lo resuelto
// (`withoutResolved`).
export async function writeReceivablesXlsx({ view, scopeLabel, showCompany, companyLabel, fileBase }) {
  const ExcelJS = (await import("exceljs")).default || (await import("exceljs"));
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Pendientes");
  const columns = [
    { width: 6 },
    { label: "Fecha", width: 12 },
    { label: "Tipo", width: 24 },
    { label: "Folio", width: 10, align: "right" },
    ...(showCompany ? [{ label: "Empresa", width: 22 }] : []),
    { label: "Neto", width: 14, money: true },
    { label: "IVA", width: 14, money: true },
    { label: "Total", width: 14, money: true },
    { label: "Abonos", width: 14, money: true },
    { label: "Pendiente", width: 16, money: true, pending: true },
    { label: "Estado", width: 14, align: "center" },
  ];
  columns.forEach((c, i) => { ws.getColumn(i + 1).width = c.width; });
  const last = columns.length;
  const pendingCol = columns.findIndex((c) => c.pending) + 1;

  ws.getCell("B2").value = `PENDIENTES — ${scopeLabel}`;
  ws.getCell("B2").font = { bold: true, size: 14 };
  ws.mergeCells(2, 2, 2, last);
  ws.getCell("B3").value = `Generado ${todayIso()} · ${view.visibleCount} factura${view.visibleCount === 1 ? "" : "s"} · Total pendiente ${fmtCurrency(view.visibleTotal)}`;
  ws.getCell("B3").font = { italic: true, color: { argb: "FF555555" } };
  ws.mergeCells(3, 2, 3, last);

  let r = 5;
  const band = (text, argb, { bold = true, italic = false } = {}) => {
    ws.getCell(r, 2).value = text;
    ws.getCell(r, 2).font = { bold, italic };
    for (let c = 2; c <= last; c++) {
      ws.getCell(r, c).fill = fill(argb);
      ws.getCell(r, c).border = BORDER;
    }
    ws.mergeCells(r, 2, r, last);
    r++;
  };
  const header = (pendingLabel) => {
    for (let i = 2; i <= last; i++) {
      const col = columns[i - 1];
      const c = ws.getCell(r, i);
      c.value = col.pending ? pendingLabel : col.label;
      c.font = { bold: true };
      c.fill = fill("FF92D050");
      c.border = BORDER;
      c.alignment = { horizontal: col.money ? "right" : col.align || "left" };
    }
    r++;
  };
  const row = (x) => {
    const d = x.doc;
    const values = [
      d.fechaEmision || "",
      docTypeLabel(d),
      Number(d.folio) || d.folio || "",
      ...(showCompany ? [companyLabel(d.companyId)] : []),
      Number(d.neto) || 0,
      Number(d.iva) || 0,
      Number(d.total) || 0,
      Number(d.amountPaid) || 0,
      x.pending,
      statusLabel(d),
    ];
    values.forEach((v, i) => {
      const col = columns[i + 1];
      const c = ws.getCell(r, i + 2);
      c.value = v;
      c.border = BORDER;
      if (col.money) {
        c.numFmt = MONEY;
        c.alignment = { horizontal: "right" };
      } else if (col.align) {
        c.alignment = { horizontal: col.align };
      }
      if (col.pending) c.font = { bold: true };
    });
    r++;
  };
  const total = (label, amount, { strong = false, note = "" } = {}) => {
    ws.getCell(r, 2).value = note ? `${label} (${note})` : label;
    ws.mergeCells(r, 2, r, pendingCol - 1);
    ws.getCell(r, 2).alignment = { horizontal: "right" };
    for (let c = 2; c <= last; c++) {
      ws.getCell(r, c).fill = fill(strong ? "FFDDE9FF" : "FFF2F2F2");
      ws.getCell(r, c).border = BORDER;
      ws.getCell(r, c).font = { bold: true };
    }
    ws.getCell(r, pendingCol).value = amount;
    ws.getCell(r, pendingCol).numFmt = MONEY;
    ws.getCell(r, pendingCol).alignment = { horizontal: "right" };
    r++;
  };
  const client = (g) => band(`${g.razon || "—"}${g.rut ? ` · ${formatRutForDisplay(g.rut)}` : ""} · ${g.count} factura${g.count === 1 ? "" : "s"}`, "FFFFF2CC");
  const breakdown = (g) => (showCompany ? companyBreakdown(g.byCompany, companyLabel) : "");

  if (view.invoices.length > 0) {
    band("FACTURAS POR COBRAR", "FFFFFFFF");
    header("Pendiente");
    for (const g of view.invoices) {
      client(g);
      for (const x of g.rows) row(x);
      total(`Total ${g.razon || ""}`, g.total, { strong: true, note: breakdown(g) });
    }
    r++;
  }

  if (view.vat.length > 0) {
    band("IVA PENDIENTE", "FFFFFFFF");
    header("IVA pendiente");
    for (const g of view.vat) {
      client(g);
      for (const m of g.months) {
        band(formatPeriodPretty(m.periodo), "FFFFFFFF", { italic: true });
        for (const x of m.rows) row(x);
        total(`IVA pendiente ${monthLabel(m.periodo)}`, m.total);
      }
      total(`IVA pendiente total ${g.razon || ""}`, g.total, { strong: true, note: breakdown(g) });
    }
    r++;
  }

  total("TOTAL PENDIENTE", view.visibleTotal, { strong: true });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${fileBase}.xlsx`;
  link.click();
  URL.revokeObjectURL(link.href);
}
