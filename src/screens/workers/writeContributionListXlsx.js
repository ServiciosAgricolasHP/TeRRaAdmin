import { contributionsByFaena, contributionTotals, monthTitle } from "../../utils/contributionLists";
import { rutParts } from "../../utils/feeLists";
import { CONTRIBUTION_REQUESTS, END_REASONS } from "../../utils/employment";

const fmt = (iso) => (iso ? iso.split("-").reverse().join("-") : "");

// La lista de imposiciones en Excel, una sección por faena (el centro de
// costo) como la planilla: RUT, dígito, nombre, centro de costo, días,
// solicitud, fecha de término y motivo. Sueldo y bono quedan en blanco para el
// contador. Convención del proyecto: columna A vacía de ancho 6 y fila 1 vacía.
export async function writeContributionListXlsx(list) {
  const ExcelJS = (await import("exceljs")).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet("Imposiciones");
  ws.getColumn(1).width = 6;
  [12, 5, 34, 22, 7, 12, 12, 24, 14, 22].forEach((w, i) => {
    ws.getColumn(i + 2).width = w;
  });
  const put = (r, values, style = {}) => {
    const row = ws.getRow(r);
    values.forEach((v, i) => {
      const cell = row.getCell(i + 2);
      cell.value = v;
      if (style.font) cell.font = style.font;
      if (style.fill) cell.fill = style.fill;
    });
  };
  const head = { font: { bold: true, color: { argb: "FFFFFFFF" } }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FF374151" } } };
  const total = { font: { bold: true }, fill: { type: "pattern", pattern: "solid", fgColor: { argb: "FFF3F4F6" } } };

  ws.getCell("B2").value = `Imposiciones ${monthTitle(list.month)} — ${list.employerName || ""}`;
  ws.getCell("B2").font = { bold: true, size: 14 };
  const t = contributionTotals(list.items || []);
  ws.getCell("B3").value = `${t.people} persona${t.people === 1 ? "" : "s"} · ${t.days} días${t.settlements ? ` · ${t.settlements} con finiquito` : ""}`;
  ws.getCell("B3").font = { color: { argb: "FF4B5563" } };

  let r = 5;
  for (const g of contributionsByFaena(list.items || [])) {
    put(r++, [g.faenaName], { font: { bold: true, size: 12 } });
    put(r++, ["RUT", "DIG.", "NOMBRE", "CENTRO COSTO", "DÍAS", "SUELDO", "BONO", "SOLICITUD", "FECHA TÉRMINO", "MOTIVO"], head);
    for (const it of g.items) {
      const [body, dv] = rutParts(it.rut);
      put(r++, [
        body,
        dv,
        it.name,
        it.faenaName || "",
        it.days,
        "",
        "",
        CONTRIBUTION_REQUESTS[it.request] || "",
        fmt(it.endDate),
        it.endReason ? END_REASONS[it.endReason] : "",
      ]);
    }
    put(r++, ["", "", `Total ${g.faenaName}`, "", g.totals.days], total);
    r++;
  }
  put(r, ["", "", "TOTAL", "", t.days], { ...total, font: { bold: true, size: 12 } });

  const buf = await wb.xlsx.writeBuffer();
  const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `Imposiciones_${String(list.employerName || "").replace(/[^\w-]+/g, "_")}_${list.month}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}
