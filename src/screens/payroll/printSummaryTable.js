import { fmtCurrency } from "../../utils/format";
import { openPrintWindow } from "../../utils/printWindow";
import { cyclesNoteHtml } from "./printCommon";
// Ventana de impresión de la tabla resumen del detalle de la nómina.
// Imprime solo la tabla de resumen, como esté en pantalla (por subfaena o por
// labor, con los ciclos juntos o separados; `title` lo dice), con las mismas filas (`displayRows`, de
// `summaryDisplayRowsOf`) y columnas (`labelColumns`), sin los comprobantes
// de cada grupo. Los totales (`grandTotals`, `deferredCash`) son los mismos de
// la tabla en pantalla.
export function printSummaryTable(payroll, {
  title, labelColumns, displayRows, bonusAdvanceSummary,
  pendingRows = [], pendingMode = "none", grandTotals, deferredCash = 0,
}) {
  const fmtDayShort = (d) => {
    if (!d || typeof d !== "string") return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}` : d;
  };
  const cycleDetails = payroll.cycleDetails || [];
  const buildAdjustmentRowsHtml = (labelColspan) => {
    const rows = [];
    if (bonusAdvanceSummary?.bonus.total > 0) {
      rows.push(`<tr class="adj-row"><td colspan="${labelColspan}" style="text-align:right">Bonos</td><td style="text-align:right">${fmtCurrency(bonusAdvanceSummary.bonus.bank)}</td><td style="text-align:right">${fmtCurrency(bonusAdvanceSummary.bonus.cash)}</td><td style="text-align:right">${fmtCurrency(bonusAdvanceSummary.bonus.total)}</td></tr>`);
    }
    if (bonusAdvanceSummary?.advance.total > 0) {
      rows.push(`<tr class="adj-row"><td colspan="${labelColspan}" style="text-align:right">Anticipos</td><td style="text-align:right">− ${fmtCurrency(bonusAdvanceSummary.advance.bank)}</td><td style="text-align:right">− ${fmtCurrency(bonusAdvanceSummary.advance.cash)}</td><td style="text-align:right">− ${fmtCurrency(bonusAdvanceSummary.advance.total)}</td></tr>`);
    }
    return rows.join("");
  };
  // Filas del efectivo adeudado de nóminas anteriores. `nameColspan` = cuántas
  // columnas ocupa el nombre: las de texto, menos la faena y el período.
  const pendingRowsHtml = (nameColspan) => (pendingMode === "none" ? "" : pendingRows.map((r) => `
    <tr class="pending-row">
      <td>—</td>
      <td colspan="${nameColspan}">💵 Efectivo pendiente — ${r.name} <span style="color:#666;font-size:11px">· ${r.count} pers.</span></td>
      <td style="font-size:11px;color:#444">${r.period ? `${fmtDayShort(r.period.first)} → ${fmtDayShort(r.period.last)}` : "—"}</td>
      <td style="text-align:right">${fmtCurrency(0)}</td>
      <td style="text-align:right">${fmtCurrency(r.cash)}</td>
      <td style="text-align:right"><b>${fmtCurrency(r.total)}</b></td>
    </tr>`).join(""));
  // Pie de la tabla: bonos, anticipos, el efectivo de esta nómina que queda
  // para la vuelta siguiente (en "onlyPending") y el total.
  const footerHtml = (labelColspan) => {
    const deferRow = deferredCash > 0
      ? `<tr class="adj-row"><td colspan="${labelColspan}" style="text-align:right">Efectivo que queda pendiente</td><td style="text-align:right">${fmtCurrency(0)}</td><td style="text-align:right">− ${fmtCurrency(deferredCash)}</td><td style="text-align:right">− ${fmtCurrency(deferredCash)}</td></tr>`
      : "";
    return `${buildAdjustmentRowsHtml(labelColspan)}${deferRow}
        <tr class="summary-total"><td colspan="${labelColspan}"><b>${pendingMode === "onlyPending" ? "TOTAL A PAGAR" : "TOTAL"}</b></td><td style="text-align:right"><b>${fmtCurrency(grandTotals.bank)}</b></td><td style="text-align:right"><b>${fmtCurrency(grandTotals.cash)}</b></td><td style="text-align:right"><b>${fmtCurrency(grandTotals.total)}</b></td></tr>`;
  };

  const today = new Date().toLocaleDateString("es-CL");
  const cyclesLine = cycleDetails.map((c) => c.label).join(" · ");

  const labelSpan = labelColumns.length;
  const headHtml = labelColumns.map((c) => (c.key === "period" ? `<th style="width:130px">${c.label}</th>` : `<th>${c.label}</th>`)).join("");
  const rowsHtml = displayRows.map((entry) => {
    if (entry.subtotal) {
      const s = entry.subtotal;
      return `<tr class="subtotal-faena"><td colspan="${labelSpan}" style="text-align:right"><b>Sub total por faena</b></td><td style="text-align:right"><b>${fmtCurrency(s.bank)}</b></td><td style="text-align:right"><b>${fmtCurrency(s.cash)}</b></td><td style="text-align:right"><b>${fmtCurrency(s.total)}</b></td></tr>`;
    }
    const r = entry.row;
    const labelsHtml = entry.labels.map((t, k) => {
      if (labelColumns[k].key === "period") return `<td style="font-size:11px;color:#444">${t}</td>`;
      const note = entry.notes?.[labelColumns[k].key];
      return `<td>${t}${note ? cyclesNoteHtml(note, entry.noteTitle) : ""}</td>`;
    }).join("");
    return `<tr>${labelsHtml}<td style="text-align:right">${fmtCurrency(r.bank)}</td><td style="text-align:right">${fmtCurrency(r.cash)}</td><td style="text-align:right"><b>${fmtCurrency(r.total)}</b></td></tr>`;
  }).join("");
  const bodyHtml = `<table class="subfaena-summary">
      <thead><tr>${headHtml}<th style="text-align:right">Transferencia</th><th style="text-align:right">Efectivo</th><th style="text-align:right">TOTAL</th></tr></thead>
      <tbody>${rowsHtml}${pendingRowsHtml(labelSpan - 2)}</tbody>
      <tfoot>
        ${footerHtml(labelSpan)}
      </tfoot>
    </table>`;

  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${payroll.name} — Resumen</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
  body { font-family: -apple-system, "Segoe UI", Roboto, sans-serif; margin: 0; color: #222; padding: 22px 28px; }
  .hd { display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; border-bottom: 2px solid #555; padding-bottom: 10px; margin-bottom: 12px; }
  h1 { margin: 0 0 4px; font-size: 18px; }
  .sub { color: #666; font-size: 12px; }
  .meta { font-size: 12px; text-align: right; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th { background: #B7DEE8; }
  th, td { border: 1px solid #999; padding: 5px 7px; }
  table.subfaena-summary .summary-total td { background: #FFE699; }
  table.subfaena-summary .subtotal-faena td { background: #F2F2F2; font-style: italic; }
  table.subfaena-summary .adj-row td { background: #EAF3FA; }
  table.subfaena-summary .pending-row td { background: #FFF4E5; }
  @media print { @page { margin: 14mm landscape; } }
</style>
</head><body>
  <div class="hd">
    <div>
      <h1>Resumen ${title}</h1>
      <div class="sub">${payroll.name} · ${cyclesLine}</div>
    </div>
    <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
  </div>
  ${bodyHtml}
<script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;
  openPrintWindow(html);
}
