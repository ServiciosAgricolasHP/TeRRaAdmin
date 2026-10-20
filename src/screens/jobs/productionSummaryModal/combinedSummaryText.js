// Texto de la tabla general para copiar: los días por labor, TOTAL A PAGAR,
// las ganancias de cada labor con su % o lo que paga el cliente, el
// transporte por ciclo, el monto libre, el TOTAL GENERAL y, con IVA, el IVA y
// el bruto.
import { fmtCLP, fmtNum } from "./helpers";
import { isSupervisionCol, isWorkdayCol } from "../../../utils/combinedSummary";

export function combinedSummaryText({ activeDays, byLaborDay, dataByColumn, effectivePct, grandTotal, grandTotalGeneral, grandTotalGross, grandTotalTransport, grandTotalVat, hasSupervisionCols, includeTransport, paidToUs, profitFor, totalGeneralFor, totalProfit, totalProfitBillable, totalSupervisionDeduction, totalsByDay, transportByCycle, vatEnabled, workersPaid }) {
  const lines = [];
  lines.push("📊 TABLA GENERAL — todas las labores seleccionadas");
  lines.push(`Gran total: ${fmtCLP(grandTotal)} · ${dataByColumn.length} labor${dataByColumn.length === 1 ? "" : "es"} · ${activeDays.length} día${activeDays.length === 1 ? "" : "s"}`);
  lines.push("");
  const header = ["Día"];
  for (const d of dataByColumn) header.push(`${d.col.labor.name}`);
  header.push("Total día");
  lines.push(header.join(" | "));
  for (const day of activeDays) {
    const cols = [day];
    for (const d of dataByColumn) {
      const c = byLaborDay.get(d.col.key)?.get(day);
      if (!c) { cols.push("—"); continue; }
      cols.push(`${fmtNum(c.qty)}${c.unit ? " " + c.unit : ""} · ${fmtCLP(c.amount)}`);
    }
    cols.push(fmtCLP(totalsByDay.get(day) || 0));
    lines.push(cols.join(" | "));
  }
  const totalRow = ["TOTAL A PAGAR"];
  for (const d of dataByColumn) {
    const paidTag = isWorkdayCol(d.col) && workersPaid[d.col.key] ? " [ya pagado]" : "";
    totalRow.push(`${fmtNum(d.totalQty)}${d.unit ? " " + d.unit : ""} · ${fmtCLP(d.totalAmount)}${paidTag}`);
  }
  totalRow.push(fmtCLP(grandTotal));
  lines.push(totalRow.join(" | "));
  lines.push("");
  lines.push("💰 GANANCIAS");
  for (const d of dataByColumn) {
    if (isSupervisionCol(d.col)) continue;
    const g = profitFor(d.col, d.totalAmount);
    const detail = isWorkdayCol(d.col)
      ? (workersPaid[d.col.key] ? `pagan ${fmtCLP(Number(paidToUs[d.col.key]) || 0)}, ya pagado` : `pagan ${fmtCLP(Number(paidToUs[d.col.key]) || 0)}`)
      : `${effectivePct(d.col.key)}%`;
    lines.push(`${d.col.labor.name} (${d.col.cycleLabel}) [${detail}]: ${fmtCLP(g)}`);
  }
  lines.push(`TOTAL GANANCIAS: ${fmtCLP(totalProfitBillable)}`);
  lines.push("");
  if (includeTransport) {
    lines.push("🚐 TRANSPORTE (por ciclo)");
    const seenCycles = new Set();
    for (const d of dataByColumn) {
      if (seenCycles.has(d.col.cycleId)) continue;
      seenCycles.add(d.col.cycleId);
      const t = transportByCycle.get(d.col.cycleId) || { total: 0, hasTrips: false };
      const tag = t.total === 0 ? (t.hasTrips ? " [vueltas creadas]" : " [sin vueltas]") : "";
      lines.push(`${d.col.cycleLabel}: ${fmtCLP(t.total)}${tag}`);
    }
    lines.push(`TOTAL TRANSPORTE: ${fmtCLP(grandTotalTransport)}`);
    lines.push("");
  }
  if (hasSupervisionCols) {
    lines.push("➖ MONTO LIBRE (descuento por supervisión, informativo, no afecta lo facturado)");
    for (const d of dataByColumn) {
      if (!isSupervisionCol(d.col)) continue;
      lines.push(`${d.col.labor.name} (${d.col.cycleLabel}): ${fmtCLP(profitFor(d.col, d.totalAmount))}`);
    }
    lines.push(`TOTAL SUPERVISIÓN: ${fmtCLP(totalSupervisionDeduction)}`);
    lines.push(`MONTO LIBRE (${fmtCLP(totalProfitBillable)} − ${fmtCLP(Math.abs(totalSupervisionDeduction))}): ${fmtCLP(totalProfit)}`);
    lines.push("");
  }
  if (includeTransport && grandTotalTransport !== 0) {
    lines.push(`MONTO LIBRE NETO (${fmtCLP(totalProfit)} − ${fmtCLP(grandTotalTransport)}, descuenta también transporte): ${fmtCLP(totalProfit - grandTotalTransport)}`);
    lines.push("");
  }
  const generalRow = ["TOTAL GENERAL"];
  for (const d of dataByColumn) generalRow.push(fmtCLP(totalGeneralFor(d.col, d.totalAmount)));
  generalRow.push(fmtCLP(grandTotalGeneral));
  lines.push(generalRow.join(" | "));
  if (vatEnabled) {
    lines.push("");
    lines.push(`IVA (19%): ${fmtCLP(grandTotalVat)}`);
    lines.push(`BRUTO: ${fmtCLP(grandTotalGross)}`);
  }
  return lines.join("\n");

}
