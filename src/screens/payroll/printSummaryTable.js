// Ventana de impresión de la tabla resumen del detalle de la nómina.
// Imprime solo la tabla de resumen, por subfaena o por labor según el toggle
// del Resumen en pantalla: las mismas tablas del "Detalle de pago", sin los
// comprobantes de cada grupo.
export function printSummaryTable(payroll, {
  showLabor, subfaenaSummary, laborSummary, bonusAdvanceSummary,
  pendingRows = [], pendingMode = "none",
}) {
  const fmt = (v) =>
    new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 }).format(Number(v) || 0);
  const fmtDayShort = (d) => {
    if (!d || typeof d !== "string") return "";
    const m = d.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    return m ? `${m[3]}/${m[2]}` : d;
  };
  const cycleDetails = payroll.cycleDetails || [];
  const cyclesPeriod = (cycleIds) => {
    let minFirst = null, maxLast = null;
    for (const cid of cycleIds) {
      const cd = cycleDetails.find((c) => c.id === cid);
      const first = cd?.firstDay || "";
      const last = cd?.lastDay || "";
      if (first && (!minFirst || first < minFirst)) minFirst = first;
      if (last && (!maxLast || last > maxLast)) maxLast = last;
    }
    const a = fmtDayShort(minFirst), b = fmtDayShort(maxLast);
    if (a && b && a !== b) return `${a} → ${b}`;
    return a || b || "—";
  };
  const buildAdjustmentRowsHtml = (labelColspan) => {
    const rows = [];
    if (bonusAdvanceSummary?.bonus.total > 0) {
      rows.push(`<tr class="adj-row"><td colspan="${labelColspan}" style="text-align:right">Bonos</td><td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.bank)}</td><td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.cash)}</td><td style="text-align:right">${fmt(bonusAdvanceSummary.bonus.total)}</td></tr>`);
    }
    if (bonusAdvanceSummary?.advance.total > 0) {
      rows.push(`<tr class="adj-row"><td colspan="${labelColspan}" style="text-align:right">Anticipos</td><td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.bank)}</td><td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.cash)}</td><td style="text-align:right">− ${fmt(bonusAdvanceSummary.advance.total)}</td></tr>`);
    }
    return rows.join("");
  };
  const adjustedTotals = (base) => ({
    bank: base.bank + (bonusAdvanceSummary?.bonus.bank || 0) - (bonusAdvanceSummary?.advance.bank || 0),
    cash: base.cash + (bonusAdvanceSummary?.bonus.cash || 0) - (bonusAdvanceSummary?.advance.cash || 0),
    total: base.total + (bonusAdvanceSummary?.bonus.total || 0) - (bonusAdvanceSummary?.advance.total || 0),
  });
  // Filas del efectivo adeudado de nóminas anteriores. `nameColspan` = cuántas
  // columnas ocupa el nombre (2 en la vista por labor, que tiene una columna
  // más antes del período).
  const pendingRowsHtml = (nameColspan) => (pendingMode === "none" ? "" : pendingRows.map((r) => `
    <tr class="pending-row">
      <td>—</td>
      <td colspan="${nameColspan}">💵 Efectivo pendiente — ${r.name} <span style="color:#666;font-size:11px">· ${r.count} pers.</span></td>
      <td style="font-size:11px;color:#444">${r.period ? `${fmtDayShort(r.period.first)} → ${fmtDayShort(r.period.last)}` : "—"}</td>
      <td style="text-align:right">${fmt(0)}</td>
      <td style="text-align:right">${fmt(r.cash)}</td>
      <td style="text-align:right"><b>${fmt(r.total)}</b></td>
    </tr>`).join(""));
  const pendingSum = pendingRows.reduce((s, r) => s + r.total, 0);
  // En "onlyPending" el efectivo de esta nómina no sale: se difiere a la vuelta
  // siguiente, así que se resta con una fila propia.
  const deferredOf = (base) => (pendingMode === "onlyPending" ? adjustedTotals(base).cash : 0);
  const deferRowHtml = (labelColspan, base) => {
    const d = deferredOf(base);
    if (d <= 0) return "";
    return `<tr class="adj-row"><td colspan="${labelColspan}" style="text-align:right">Efectivo que queda pendiente</td><td style="text-align:right">${fmt(0)}</td><td style="text-align:right">− ${fmt(d)}</td><td style="text-align:right">− ${fmt(d)}</td></tr>`;
  };
  const grand = (base) => {
    const b = adjustedTotals(base);
    const d = deferredOf(base);
    const add = pendingMode === "none" ? 0 : pendingSum;
    return { bank: b.bank, cash: b.cash - d + add, total: b.total - d + add };
  };

  const today = new Date().toLocaleDateString("es-CL");
  const cyclesLine = cycleDetails.map((c) => c.label).join(" · ");

  let bodyHtml;
  if (!showLabor) {
    let prevFaena = null;
    const rowsHtml = subfaenaSummary.rows.map((r, i, arr) => {
      const showFaena = r.faenaName !== prevFaena;
      prevFaena = r.faenaName;
      const row = `<tr><td>${showFaena ? r.faenaName : ""}</td><td>${r.subfaenaName}</td><td style="font-size:11px;color:#444">${cyclesPeriod([...r.cycleIds])}</td><td style="text-align:right">${fmt(r.bank)}</td><td style="text-align:right">${fmt(r.cash)}</td><td style="text-align:right"><b>${fmt(r.total)}</b></td></tr>`;
      const isLastOfFaena = i === arr.length - 1 || arr[i + 1].faenaName !== r.faenaName;
      if (!isLastOfFaena) return row;
      const faenaRows = arr.filter((x) => x.faenaName === r.faenaName);
      const subBank = faenaRows.reduce((s, x) => s + x.bank, 0);
      const subCash = faenaRows.reduce((s, x) => s + x.cash, 0);
      const subTotal = faenaRows.reduce((s, x) => s + x.total, 0);
      return `${row}<tr class="subtotal-faena"><td colspan="3" style="text-align:right"><b>Sub total por faena</b></td><td style="text-align:right"><b>${fmt(subBank)}</b></td><td style="text-align:right"><b>${fmt(subCash)}</b></td><td style="text-align:right"><b>${fmt(subTotal)}</b></td></tr>`;
    }).join("");
    bodyHtml = `<table class="subfaena-summary">
      <thead><tr><th>Faena</th><th>Subfaena</th><th style="width:130px">Período</th><th style="text-align:right">Transferencia</th><th style="text-align:right">Efectivo</th><th style="text-align:right">TOTAL</th></tr></thead>
      <tbody>${rowsHtml}${pendingRowsHtml(1)}</tbody>
      <tfoot>
        ${buildAdjustmentRowsHtml(3)}${deferRowHtml(3, subfaenaSummary.totals)}
        <tr class="summary-total"><td colspan="3"><b>${pendingMode === "onlyPending" ? "TOTAL A PAGAR" : "TOTAL"}</b></td><td style="text-align:right"><b>${fmt(grand(subfaenaSummary.totals).bank)}</b></td><td style="text-align:right"><b>${fmt(grand(subfaenaSummary.totals).cash)}</b></td><td style="text-align:right"><b>${fmt(grand(subfaenaSummary.totals).total)}</b></td></tr>
      </tfoot>
    </table>`;
  } else {
    let prevSubfaena = null;
    const rowsHtml = laborSummary.rows.map((r, i, arr) => {
      const showSubfaena = r.subfaenaName !== prevSubfaena;
      prevSubfaena = r.subfaenaName;
      const row = `<tr><td>${showSubfaena ? r.faenaName : ""}</td><td>${showSubfaena ? r.subfaenaName : ""}</td><td>${r.laborName}</td><td style="font-size:11px;color:#444">${cyclesPeriod([...r.cycleIds])}</td><td style="text-align:right">${fmt(r.bank)}</td><td style="text-align:right">${fmt(r.cash)}</td><td style="text-align:right"><b>${fmt(r.total)}</b></td></tr>`;
      const isLastOfFaena = i === arr.length - 1 || arr[i + 1].faenaName !== r.faenaName;
      if (!isLastOfFaena) return row;
      const faenaRows = arr.filter((x) => x.faenaName === r.faenaName);
      const subBank = faenaRows.reduce((s, x) => s + x.bank, 0);
      const subCash = faenaRows.reduce((s, x) => s + x.cash, 0);
      const subTotal = faenaRows.reduce((s, x) => s + x.total, 0);
      return `${row}<tr class="subtotal-faena"><td colspan="4" style="text-align:right"><b>Sub total por faena</b></td><td style="text-align:right"><b>${fmt(subBank)}</b></td><td style="text-align:right"><b>${fmt(subCash)}</b></td><td style="text-align:right"><b>${fmt(subTotal)}</b></td></tr>`;
    }).join("");
    bodyHtml = `<table class="subfaena-summary">
      <thead><tr><th>Faena</th><th>Subfaena</th><th>Labor</th><th style="width:130px">Período</th><th style="text-align:right">Transferencia</th><th style="text-align:right">Efectivo</th><th style="text-align:right">TOTAL</th></tr></thead>
      <tbody>${rowsHtml}${pendingRowsHtml(2)}</tbody>
      <tfoot>
        ${buildAdjustmentRowsHtml(4)}${deferRowHtml(4, laborSummary.totals)}
        <tr class="summary-total"><td colspan="4"><b>TOTAL</b></td><td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).bank)}</b></td><td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).cash)}</b></td><td style="text-align:right"><b>${fmt(adjustedTotals(laborSummary.totals).total)}</b></td></tr>
      </tfoot>
    </table>`;
  }

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
      <h1>Resumen ${showLabor ? "por labor" : "por subfaena"}</h1>
      <div class="sub">${payroll.name} · ${cyclesLine}</div>
    </div>
    <div class="meta"><div><b>Fecha:</b> ${today}</div></div>
  </div>
  ${bodyHtml}
<script>window.onload = () => { window.focus(); window.print(); };</script>
</body></html>`;
  const w = window.open("", "_blank", "width=900,height=700");
  if (!w) throw new Error("Permite las ventanas emergentes para imprimir.");
  w.document.open();
  w.document.write(html);
  w.document.close();
}
