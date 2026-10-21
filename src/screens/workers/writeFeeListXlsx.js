import { itemsByFaena, feeListTotals, rutParts } from "../../utils/feeLists";

const MONEY = '"$"#,##0';
const fmt = (iso) => (iso ? iso.split("-").reverse().join("-") : "");
const pct = (rate) => `${(Number(rate) * 100).toLocaleString("es-CL", { maximumFractionDigits: 2 })}%`;

// La lista de honorarios en Excel, una sección por faena como la planilla:
// RUT, dígito, nombre, días, bruto, retención, líquido, dirección, comuna y
// folio, con el total de cada faena y el general. Convención del proyecto:
// columna A vacía de ancho 6 y fila 1 vacía.
export async function writeFeeListXlsx(list) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Honorarios");
  ws.getColumn(1).width = 6;
  [12, 5, 34, 7, 13, 13, 13, 34, 18, 10].forEach((w, i) => {
    ws.getColumn(i + 2).width = w;
  });
  const put = (r, values, style = {}) => {
    const row = ws.getRow(r);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 2);
      cell.value = v;
      if (style.font) cell.font = style.font;
      if (style.fill) cell.fill = style.fill;
      if ([4, 5, 6].includes(i) && typeof v === "number") cell.numFmt = MONEY;
    });
    return row;
  };
  const head = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } } };
  const total = { font: { bold: true }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } } };

  ws.getCell("B2").value = `Boletas de honorarios — ${list.employerName || ""}`;
  ws.getCell("B2").font = { bold: true, size: 14 };
  ws.getCell("B3").value = `Del ${fmt(list.from)} al ${fmt(list.to)} · $${Number(list.dailyNet).toLocaleString("es-CL")} líquido por día · retención ${pct(list.withholdingRate)}`;
  ws.getCell("B3").font = { color: { argb: "FF4B5563" } };

  let r = 5;
  for (const g of itemsByFaena(list.items || [])) {
    put(r++, [g.faenaName], { font: { bold: true, size: 12 } });
    put(r++, ["RUT", "DIG.", "NOMBRE", "DÍAS", "BRUTO", "RETENCIÓN", "LÍQUIDO", "DIRECCIÓN", "COMUNA", "FOLIO"], head);
    for (const it of g.items) {
      const [body, dv] = rutParts(it.rut);
      put(r++, [body, dv, it.name, it.days, it.gross, it.withholding, it.net, it.address || "", it.commune || "", it.folio || ""]);
    }
    put(r++, ["", "", `Total ${g.faenaName}`, g.totals.days, g.totals.gross, g.totals.withholding, g.totals.net], total);
    r++;
  }
  const t = feeListTotals(list.items || []);
  put(r, ["", "", "TOTAL", t.days, t.gross, t.withholding, t.net], { ...total, font: { bold: true, size: 12 } });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Honorarios_${String(list.employerName || "").replace(/[^\w-]+/g, "_")}_${list.from}_${list.to}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
