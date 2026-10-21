// Texto de la tabla general para copiar: los días por labor, TOTAL A PAGAR,
// las ganancias de cada labor con su % o lo que paga el cliente, el
// transporte por ciclo, el monto libre, el TOTAL GENERAL y, con IVA, el IVA y
// el bruto.
import { fmtNum } from "./helpers";
import { isSupervisionCol, isWorkdayCol } from "../../../utils/combinedSummary";
import { fmtCurrency } from "../../../utils/format";

export function combinedSummaryText({ activeDays, byLaborDay, dataByColumn, effectivePct, grandTotal, grandTotalGeneral, grandTotalGross, grandTotalTransport, grandTotalVat, hasSupervisionCols, includeTransport, paidToUs, profitFor, totalGeneralFor, totalProfit, totalProfitBillable, totalSupervisionDeduction, totalsByDay, transportByCycle, vatEnabled, workersPaid }) {
  const lines = [];
  lines.push("📊 TABLA GENERAL — todas las labores seleccionadas");
  lines.push(`Gran total: ${fmtCurrency(grandTotal)} · ${dataByColumn.length} labor${dataByColumn.length === 1 ? "" : "es"} · ${activeDays.length} día${activeDays.length === 1 ? "" : "s"}`);
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
      cols.push(`${fmtNum(c.qty)}${c.unit ? " " + c.unit : ""} · ${fmtCurrency(c.amount)}`);
    }
    cols.push(fmtCurrency(totalsByDay.get(day) || 0));
    lines.push(cols.join(" | "));
  }
  const totalRow = ["TOTAL A PAGAR"];
  for (const d of dataByColumn) {
    const paidTag = isWorkdayCol(d.col) && workersPaid[d.col.key] ? " [ya pagado]" : "";
    totalRow.push(`${fmtNum(d.totalQty)}${d.unit ? " " + d.unit : ""} · ${fmtCurrency(d.totalAmount)}${paidTag}`);
  }
  totalRow.push(fmtCurrency(grandTotal));
  lines.push(totalRow.join(" | "));
  lines.push("");
  lines.push("💰 GANANCIAS");
  for (const d of dataByColumn) {
    if (isSupervisionCol(d.col)) continue;
    const g = profitFor(d.col, d.totalAmount);
    const detail = isWorkdayCol(d.col)
      ? (workersPaid[d.col.key] ? `pagan ${fmtCurrency(Number(paidToUs[d.col.key]) || 0)}, ya pagado` : `pagan ${fmtCurrency(Number(paidToUs[d.col.key]) || 0)}`)
      : `${effectivePct(d.col.key)}%`;
    lines.push(`${d.col.labor.name} (${d.col.cycleLabel}) [${detail}]: ${fmtCurrency(g)}`);
  }
  lines.push(`TOTAL GANANCIAS: ${fmtCurrency(totalProfitBillable)}`);
  lines.push("");
  if (includeTransport) {
    lines.push("🚐 TRANSPORTE (por ciclo)");
    const seenCycles = new Set();
    for (const d of dataByColumn) {
      if (seenCycles.has(d.col.cycleId)) continue;
      seenCycles.add(d.col.cycleId);
      const t = transportByCycle.get(d.col.cycleId) || { total: 0, hasTrips: false };
      const tag = t.total === 0 ? (t.hasTrips ? " [vueltas creadas]" : " [sin vueltas]") : "";
      lines.push(`${d.col.cycleLabel}: ${fmtCurrency(t.total)}${tag}`);
    }
    lines.push(`TOTAL TRANSPORTE: ${fmtCurrency(grandTotalTransport)}`);
    lines.push("");
  }
  if (hasSupervisionCols) {
    lines.push("➖ MONTO LIBRE (descuento por supervisión, informativo, no afecta lo facturado)");
    for (const d of dataByColumn) {
      if (!isSupervisionCol(d.col)) continue;
      lines.push(`${d.col.labor.name} (${d.col.cycleLabel}): ${fmtCurrency(profitFor(d.col, d.totalAmount))}`);
    }
    lines.push(`TOTAL SUPERVISIÓN: ${fmtCurrency(totalSupervisionDeduction)}`);
    lines.push(`MONTO LIBRE (${fmtCurrency(totalProfitBillable)} − ${fmtCurrency(Math.abs(totalSupervisionDeduction))}): ${fmtCurrency(totalProfit)}`);
    lines.push("");
  }
  if (includeTransport && grandTotalTransport !== 0) {
    lines.push(`MONTO LIBRE NETO (${fmtCurrency(totalProfit)} − ${fmtCurrency(grandTotalTransport)}, descuenta también transporte): ${fmtCurrency(totalProfit - grandTotalTransport)}`);
    lines.push("");
  }
  const generalRow = ["TOTAL GENERAL"];
  for (const d of dataByColumn) generalRow.push(fmtCurrency(totalGeneralFor(d.col, d.totalAmount)));
  generalRow.push(fmtCurrency(grandTotalGeneral));
  lines.push(generalRow.join(" | "));
  if (vatEnabled) {
    lines.push("");
    lines.push(`IVA (19%): ${fmtCurrency(grandTotalVat)}`);
    lines.push(`BRUTO: ${fmtCurrency(grandTotalGross)}`);
  }
  return lines.join("\n");

}
