import { fmtDate } from "./helpers";

// El libro de precios en Excel: una fila por línea de precio, agrupado por
// faena como en pantalla.
export async function writePriceBookXlsx(groups) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Libro de precios");
  ws.addRow([
    "Faena", "Labor", "Unidad", "Detalle", "Precio pagado", "Precio cobrado", "Margen",
    "¿Horas extra?", "HE pagado", "HE cobrado", "Margen HE",
    "Transporte", "Dónde (transporte)", "Costo transporte", "Desde", "Hasta", "Período", "Notas",
  ]);
  ws.getRow(1).font = { bold: true };
  for (const g of groups) {
    for (const e of g.entries) {
      for (const p of e.prices || []) {
        ws.addRow([
          g.faenaLabel,
          e.labor,
          p.unit,
          p.label || "",
          Number(p.payPrice) || 0,
          Number(p.chargePrice) || 0,
          (Number(p.chargePrice) || 0) - (Number(p.payPrice) || 0),
          p.hasOvertime ? "Sí" : "No",
          p.hasOvertime ? Number(p.overtimePayPrice) || 0 : "",
          p.hasOvertime ? Number(p.overtimeChargePrice) || 0 : "",
          p.hasOvertime ? (Number(p.overtimeChargePrice) || 0) - (Number(p.overtimePayPrice) || 0) : "",
          e.transportIncluded ? "Incluido" : "No incluido",
          e.transportIncluded ? "" : e.transportWhere || "",
          e.transportIncluded ? "" : Number(e.transportCost) || 0,
          fmtDate(e.dateFrom),
          e.dateTo ? fmtDate(e.dateTo) : "Vigente",
          e.periodNote || "",
          e.notes || "",
        ]);
      }
    }
  }
  ws.columns.forEach((c) => { c.width = 20; });
  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "LibroDePrecios.xlsx";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
