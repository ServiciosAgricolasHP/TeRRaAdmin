import { useState, useRef, useMemo } from "react";
import { captureFullWidthBlob } from "../../../utils/imageCapture";
import { useToast } from "../../../contexts/ToastContext";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { fmtCLP, fmtNum } from "./helpers";
import { useProfitSettings } from "./useProfitSettings";
import {
  activeDaysOf,
  cellsByLaborDay,
  closingTotals,
  isSupervisionCol,
  isWorkdayCol,
  totalsByDayOf,
} from "../../../utils/combinedSummary";
import {
  toArgbFill,
  HDR_GREEN,
  XLSX_BORDER,
  XLSX_MONEY_FMT,
  ROW_TOTAL_DARK,
  ROW_PROFIT,
  ROW_VAT,
  ROW_TOTAL_GENERAL,
  ROW_GROSS,
  cellH,
  ROW_HIGHLIGHT,
  cell,
} from "./tableStyles";

// Tabla general: las labores seleccionadas como columnas y los días como
// filas; cada celda muestra cantidad (con unidad) y monto. Al final, la
// columna "Total día" y las filas de cierre (TOTAL A PAGAR, GANANCIAS,
// TRANSPORTE, MONTO LIBRE, TOTAL GENERAL, IVA y BRUTO).
export function CombinedSummaryCard({ dataByColumn, days, transportByCycle, firstColKeyForCycle, grandTotalTransport, includeTransport }) {
  "use no memo";
  const toast = useToast();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState("");
  const captureRef = useRef(null);
  const {
    generalPct,
    handleGeneralPctChange,
    paidToUs,
    setPaidToUs,
    setPctOverrides,
    setVatEnabled,
    setWorkersPaid,
    settings,
    vatEnabled,
    workersPaid,
    effectivePct,
    profitFor,
    totalGeneralFor,
  } = useProfitSettings();

  const activeDays = useMemo(() => activeDaysOf(dataByColumn), [dataByColumn]);
  const byLaborDay = useMemo(() => cellsByLaborDay(dataByColumn), [dataByColumn]);
  const totalsByDay = useMemo(() => totalsByDayOf(activeDays, dataByColumn, byLaborDay), [activeDays, dataByColumn, byLaborDay]);
  const {
    grandTotal,
    totalProfit,
    totalProfitBillable,
    totalSupervisionDeduction,
    hasSupervisionCols,
    grandTotalGeneral,
    grandTotalVat,
    grandTotalGross,
  } = useMemo(() => closingTotals(dataByColumn, settings), [dataByColumn, settings]);

  const buildPlainText = () => {
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
  };

  const handleCopyText = async () => {
    setBusy("text");
    try {
      await navigator.clipboard.writeText(buildPlainText());
      toast.success("Texto copiado");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally { setBusy(""); }
  };

  const handleCopyImage = async () => {
    if (!captureRef.current) return;
    setBusy("image");
    try {
      const blob = await captureFullWidthBlob(captureRef.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally { setBusy(""); }
  };

  // XLSX de la tabla general: cada labor ocupa 2 columnas (Cant./Monto) bajo
  // un encabezado combinado con su nombre, como la tabla en pantalla.
  // `writeTotalRow` escribe las filas de cierre (TOTAL A PAGAR, GANANCIAS,
  // TRANSPORTE, etc.), que difieren en qué columnas llenan y con qué color.
  const handleXlsx = async () => {
    setBusy("xlsx");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Tabla general");
      ws.getColumn(1).width = 6; // restricción de layout: col A vacía

      const COL_DAY = 2;
      const COL_FIRST_LABOR = 3;
      const COL_TOTAL = COL_FIRST_LABOR + dataByColumn.length * 2;

      let r = 2; // fila 1 vacía
      ws.getCell(r, 2).value = "Tabla general — resumen consolidado";
      ws.getCell(r, 2).font = { bold: true, size: 13 };
      r++;
      ws.getCell(r, 2).value = `${dataByColumn.length} labores · ${activeDays.length} días · gran total ${fmtCLP(grandTotal)}`;
      ws.getCell(r, 2).font = { size: 10, color: { argb: "FF666666" } };
      r += 2;

      const headerRow1 = r;
      const headerRow2 = r + 1;
      ws.mergeCells(headerRow1, COL_DAY, headerRow2, COL_DAY);
      ws.getCell(headerRow1, COL_DAY).value = "Día";
      ws.mergeCells(headerRow1, COL_TOTAL, headerRow2, COL_TOTAL);
      ws.getCell(headerRow1, COL_TOTAL).value = "Total día";
      dataByColumn.forEach((d, i) => {
        const c0 = COL_FIRST_LABOR + i * 2;
        ws.mergeCells(headerRow1, c0, headerRow1, c0 + 1);
        ws.getCell(headerRow1, c0).value = `${d.col.labor.name} (${d.col.cycleLabel})`;
        ws.getCell(headerRow2, c0).value = "Cant.";
        ws.getCell(headerRow2, c0 + 1).value = "Monto";
      });
      for (let c = COL_DAY; c <= COL_TOTAL; c++) {
        for (const rr of [headerRow1, headerRow2]) {
          const cell = ws.getCell(rr, c);
          cell.font = { bold: true };
          cell.fill = toArgbFill(HDR_GREEN);
          cell.border = XLSX_BORDER;
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        }
      }
      r += 2;

      for (const day of activeDays) {
        ws.getCell(r, COL_DAY).value = day;
        dataByColumn.forEach((d, i) => {
          const c0 = COL_FIRST_LABOR + i * 2;
          const cellData = byLaborDay.get(d.col.key)?.get(day);
          if (!cellData) return;
          ws.getCell(r, c0).value = `${fmtNum(cellData.qty)}${cellData.unit ? " " + cellData.unit : ""}`;
          ws.getCell(r, c0 + 1).value = cellData.amount;
          ws.getCell(r, c0 + 1).numFmt = XLSX_MONEY_FMT;
        });
        ws.getCell(r, COL_TOTAL).value = totalsByDay.get(day) || 0;
        ws.getCell(r, COL_TOTAL).numFmt = XLSX_MONEY_FMT;
        for (let c = COL_DAY; c <= COL_TOTAL; c++) ws.getCell(r, c).border = XLSX_BORDER;
        r++;
      }

      const writeTotalRow = (label, fill, fontArgb, amountForCol, totalValue, { qtyToo = false } = {}) => {
        ws.getCell(r, COL_DAY).value = label;
        dataByColumn.forEach((d, i) => {
          const c0 = COL_FIRST_LABOR + i * 2;
          if (qtyToo) ws.getCell(r, c0).value = `${fmtNum(d.totalQty)}${d.unit ? " " + d.unit : ""}`;
          const v = amountForCol(d);
          if (v != null) {
            ws.getCell(r, c0 + 1).value = v;
            ws.getCell(r, c0 + 1).numFmt = XLSX_MONEY_FMT;
          }
        });
        ws.getCell(r, COL_TOTAL).value = totalValue;
        ws.getCell(r, COL_TOTAL).numFmt = XLSX_MONEY_FMT;
        for (let c = COL_DAY; c <= COL_TOTAL; c++) {
          const cell = ws.getCell(r, c);
          cell.font = { bold: true, color: { argb: fontArgb } };
          cell.fill = toArgbFill(fill);
          cell.border = XLSX_BORDER;
        }
        r++;
      };

      writeTotalRow("TOTAL A PAGAR", ROW_TOTAL_DARK, "FFFFFFFF", (d) => d.totalAmount, grandTotal, { qtyToo: true });
      writeTotalRow(
        "GANANCIAS", ROW_PROFIT, "FF1A2E0F",
        (d) => (isSupervisionCol(d.col) ? null : profitFor(d.col, d.totalAmount)),
        totalProfitBillable,
      );
      if (includeTransport) {
        writeTotalRow(
          "TRANSPORTE", ROW_TOTAL_DARK, "FFFFFFFF",
          (d) => (firstColKeyForCycle.get(d.col.cycleId) === d.col.key ? (transportByCycle.get(d.col.cycleId)?.total || 0) : null),
          grandTotalTransport,
        );
      }
      if (hasSupervisionCols) {
        writeTotalRow(
          "MONTO LIBRE", ROW_VAT, "FF274E13",
          (d) => (isSupervisionCol(d.col) ? profitFor(d.col, d.totalAmount) : null),
          totalProfit,
        );
      }
      if (includeTransport && grandTotalTransport !== 0) {
        writeTotalRow("MONTO LIBRE NETO", ROW_VAT, "FF274E13", () => null, totalProfit - grandTotalTransport);
      }
      writeTotalRow(
        "TOTAL GENERAL", ROW_TOTAL_GENERAL, "FFFFFFFF",
        (d) => totalGeneralFor(d.col, d.totalAmount),
        grandTotalGeneral,
      );
      if (vatEnabled) {
        writeTotalRow("IVA (19%)", ROW_VAT, "FF274E13", () => null, grandTotalVat);
        writeTotalRow("BRUTO", ROW_GROSS, "FFFFFFFF", () => null, grandTotalGross);
      }

      ws.getColumn(COL_DAY).width = 12;
      for (let i = 0; i < dataByColumn.length; i++) {
        ws.getColumn(COL_FIRST_LABOR + i * 2).width = 14;
        ws.getColumn(COL_FIRST_LABOR + i * 2 + 1).width = 14;
      }
      ws.getColumn(COL_TOTAL).width = 16;

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tabla_general_produccion.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Error al generar Excel: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handlePrint = () => {
    if (!captureRef.current) return;
    const html = captureRef.current.outerHTML;
    const win = window.open("", "_blank", "width=1100,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Tabla general</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #888; padding: 6px 8px; font-size: 11px; }
        @media print { @page { size: landscape; margin: 10mm; } }
      </style>
    </head><body>${html}<script>window.onload = () => { window.focus(); window.print(); };</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="rounded-md border-2 border-[var(--color-border)]">
      <div className="flex flex-wrap items-center gap-2 bg-[var(--color-surface-2)] px-3 py-2 text-sm">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left hover:text-[var(--color-accent)]"
        >
          <span className="text-[var(--color-muted)]">{collapsed ? "▸" : "▾"}</span>
          <div className="min-w-0">
            <div className="font-semibold">📊 Tabla general</div>
            <div className="text-[10px] text-[var(--color-muted)]">
              {dataByColumn.length} labor{dataByColumn.length === 1 ? "" : "es"} · {activeDays.length} día{activeDays.length === 1 ? "" : "s"}
            </div>
          </div>
        </button>
        <div className="text-right">
          <div className="text-[10px] text-[var(--color-muted)]">Gran total</div>
          <div className="font-semibold tabular-nums text-[var(--color-accent)]">{fmtCLP(grandTotal)}</div>
        </div>
        <div className="flex gap-1">
          <button onClick={handleCopyText} disabled={busy === "text"} title="Copiar como texto plano"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            {busy === "text" ? "..." : "📋 Texto"}
          </button>
          <button onClick={handleCopyImage} disabled={busy === "image"} title="Copiar como imagen"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            {busy === "image" ? "..." : "📋 Imagen"}
          </button>
          <button onClick={handleXlsx} disabled={busy === "xlsx"} title="Descargar como Excel"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            {busy === "xlsx" ? "..." : "📊 Excel"}
          </button>
          <button onClick={handlePrint} title="Imprimir"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)]">
            🖨
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
        <div ref={captureRef} style={{ background: "#fff", color: "#000", padding: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>📊 Tabla general — resumen consolidado</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              {dataByColumn.length} labores · {activeDays.length} días · gran total {fmtCLP(grandTotal)}
            </div>
          </div>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: HDR_GREEN }}>
                  <th style={cellH}>Día</th>
                  {dataByColumn.map((d) => (
                    <th key={d.col.key} style={{ ...cellH, textAlign: "right", minWidth: 110 }}>
                      <div>{d.col.labor.name}</div>
                      <div style={{ fontSize: 9, fontWeight: 500, color: "#333", marginTop: 1 }}>
                        {d.col.cycleLabel}
                      </div>
                    </th>
                  ))}
                  <th style={{ ...cellH, textAlign: "right", background: ROW_HIGHLIGHT }}>Total día</th>
                </tr>
              </thead>
              <tbody>
                {activeDays.map((day) => {
                  const dayTotal = totalsByDay.get(day) || 0;
                  return (
                    <tr key={day}>
                      <td style={{ ...cell, fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{day}</td>
                      {dataByColumn.map((d) => {
                        const c = byLaborDay.get(d.col.key)?.get(day);
                        if (!c) return <td key={d.col.key} style={{ ...cell, textAlign: "right", color: "#bbb" }}>—</td>;
                        return (
                          <td key={d.col.key} style={{ ...cell, textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "#444" }}>
                              {fmtNum(c.qty)}{c.unit ? ` ${c.unit}` : ""}
                            </div>
                            <div style={{ fontWeight: 600 }}>{fmtCLP(c.amount)}</div>
                          </td>
                        );
                      })}
                      <td style={{ ...cell, textAlign: "right", fontWeight: 700, background: ROW_HIGHLIGHT }}>
                        {fmtCLP(dayTotal)}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: ROW_TOTAL_DARK, color: "#fff", fontWeight: 700 }}>
                  <td style={{ ...cell, borderColor: "#3d6b2e" }}>TOTAL A PAGAR</td>
                  {dataByColumn.map((d) => (
                    <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e" }}>
                      <div style={{ fontSize: 10, opacity: 0.9 }}>
                        {fmtNum(d.totalQty)}{d.unit ? ` ${d.unit}` : ""}
                      </div>
                      <div>{fmtCLP(d.totalAmount)}</div>
                      {isWorkdayCol(d.col) && workersPaid[d.col.key] && (
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>✅ ya pagado</div>
                      )}
                      {isSupervisionCol(d.col) && (
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>➖NF</div>
                      )}
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e", fontSize: 13 }}>
                    {fmtCLP(grandTotal)}
                  </td>
                </tr>
                <tr style={{ background: ROW_PROFIT, color: "#1a2e0f", fontWeight: 700 }}>
                  <td style={{ ...cell, borderColor: "#6aa84f" }}>GANANCIAS</td>
                  {dataByColumn.map((d) => (
                    <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#6aa84f" }}>
                      {isSupervisionCol(d.col) ? "—" : fmtCLP(profitFor(d.col, d.totalAmount))}
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: "right", borderColor: "#6aa84f", fontSize: 13 }}>
                    {fmtCLP(totalProfitBillable)}
                  </td>
                </tr>
                {includeTransport && (
                  <tr style={{ background: ROW_TOTAL_DARK, color: "#fff", fontWeight: 700 }}>
                    <td style={{ ...cell, borderColor: "#3d6b2e" }}>TRANSPORTE</td>
                    {dataByColumn.map((d) => {
                      const isFirst = firstColKeyForCycle.get(d.col.cycleId) === d.col.key;
                      if (!isFirst) {
                        return (
                          <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e" }}>—</td>
                        );
                      }
                      const t = transportByCycle.get(d.col.cycleId) || { total: 0, hasTrips: false };
                      return (
                        <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e" }}>
                          {fmtCLP(t.total)}
                          {t.total === 0 && (
                            <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>
                              {t.hasTrips ? "vueltas creadas" : "sin vueltas"}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e", fontSize: 13 }}>
                      {fmtCLP(grandTotalTransport)}
                    </td>
                  </tr>
                )}
                {hasSupervisionCols && (
                  <tr style={{ background: ROW_VAT, color: "#274e13", fontWeight: 700 }}>
                    <td style={{ ...cell, borderColor: "#93c47d" }}>MONTO LIBRE</td>
                    {dataByColumn.map((d) => (
                      <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#93c47d" }}>
                        {isSupervisionCol(d.col) ? fmtCLP(profitFor(d.col, d.totalAmount)) : "—"}
                      </td>
                    ))}
                    <td style={{ ...cell, textAlign: "right", borderColor: "#93c47d", fontSize: 13 }}>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>
                        {fmtCLP(totalProfitBillable)} − {fmtCLP(Math.abs(totalSupervisionDeduction))}
                      </div>
                      <div>{fmtCLP(totalProfit)}</div>
                    </td>
                  </tr>
                )}
                {includeTransport && grandTotalTransport !== 0 && (
                  <tr style={{ background: ROW_VAT, color: "#274e13", fontWeight: 700 }}>
                    <td style={{ ...cell, borderColor: "#93c47d" }}>MONTO LIBRE NETO</td>
                    {dataByColumn.map((d) => (
                      <td key={d.col.key} style={{ ...cell, borderColor: "#93c47d" }}></td>
                    ))}
                    <td style={{ ...cell, textAlign: "right", borderColor: "#93c47d", fontSize: 13 }}>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>
                        {fmtCLP(totalProfit)} − {fmtCLP(grandTotalTransport)}
                      </div>
                      <div>{fmtCLP(totalProfit - grandTotalTransport)}</div>
                    </td>
                  </tr>
                )}
                <tr style={{ background: ROW_TOTAL_GENERAL, color: "#fff", fontWeight: 700 }}>
                  <td style={{ ...cell, borderColor: "#274e13" }}>TOTAL GENERAL</td>
                  {dataByColumn.map((d) => (
                    <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#274e13" }}>
                      {fmtCLP(totalGeneralFor(d.col, d.totalAmount))}
                      {isSupervisionCol(d.col) && (
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>➖NF</div>
                      )}
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: "right", borderColor: "#274e13", fontSize: 13 }}>
                    {fmtCLP(grandTotalGeneral)}
                  </td>
                </tr>
                {vatEnabled && (
                  <>
                    <tr style={{ background: ROW_VAT, color: "#274e13", fontWeight: 700 }}>
                      <td style={{ ...cell, borderColor: "#93c47d" }}>IVA (19%)</td>
                      {dataByColumn.map((d) => (
                        <td key={d.col.key} style={{ ...cell, borderColor: "#93c47d" }}></td>
                      ))}
                      <td style={{ ...cell, textAlign: "right", borderColor: "#93c47d", fontSize: 13 }}>
                        {fmtCLP(grandTotalVat)}
                      </td>
                    </tr>
                    <tr style={{ background: ROW_GROSS, color: "#fff", fontWeight: 700 }}>
                      <td style={{ ...cell, borderColor: "#16260a" }}>BRUTO</td>
                      {dataByColumn.map((d) => (
                        <td key={d.col.key} style={{ ...cell, borderColor: "#16260a" }}></td>
                      ))}
                      <td style={{ ...cell, textAlign: "right", borderColor: "#16260a", fontSize: 13 }}>
                        {fmtCLP(grandTotalGross)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabla para ajustar la ganancia (los % o lo que paga el cliente en
            labores de jornada), que alimenta GANANCIAS y TOTAL GENERAL. Va
            fuera de captureRef: no sale al copiar ni al imprimir. */}
        <div style={{ marginTop: 12, borderTop: "2px solid #ccc", paddingTop: 10, padding: "10px 12px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 13, fontWeight: 700 }}>
              <span>💰 Ajustar ganancia</span>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 400, color: "#444", marginLeft: 8 }}>
                % general:
                <input
                  type="number"
                  min="0"
                  value={generalPct}
                  onChange={(e) => handleGeneralPctChange(Math.max(0, Number(e.target.value) || 0))}
                  title="Al cambiarlo se aplica a todas las labores que no sean de jornada, pisando cualquier % propio editado abajo"
                  style={{ width: 56, padding: "2px 5px", border: "1px solid #999", borderRadius: 4, textAlign: "right" }}
                />
                %
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 400, color: "#444", marginLeft: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={vatEnabled}
                  onChange={(e) => setVatEnabled(e.target.checked)}
                />
                Resumen con IVA (19%)
              </label>
            </div>
            {isMobile ? (
              <div className="space-y-2">
                {dataByColumn.map((d) => (
                  <div key={d.col.key} style={{ border: "1px solid #999", borderRadius: 6, padding: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 700 }}>
                      {d.col.labor.name}
                      <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 400, color: "#888" }}>· {d.col.cycleLabel}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ color: "#666" }}>Monto</span>
                      <span>{fmtCLP(d.totalAmount)}</span>
                    </div>
                    {isWorkdayCol(d.col) && workersPaid[d.col.key] && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#2e7d32", marginTop: 2 }}>
                        ✅ ya pagado <span style={{ fontWeight: 400, color: "#666" }}>(solo informativo)</span>
                      </div>
                    )}
                    {isSupervisionCol(d.col) && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#b91c1c", marginTop: 2 }}>
                        ➖ descuento <span style={{ fontWeight: 400, color: "#666" }}>(cubierto por el % general)</span>
                      </div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      {isSupervisionCol(d.col) ? (
                        <span style={{ fontSize: 10, color: "#666", fontStyle: "italic" }}>
                          % / pagan: −100% (automático)
                        </span>
                      ) : isWorkdayCol(d.col) ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <span style={{ color: "#666" }}>Nos pagan</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                              $
                              <input
                                type="number"
                                min="0"
                                value={paidToUs[d.col.key] ?? ""}
                                onChange={(e) => setPaidToUs((p) => ({ ...p, [d.col.key]: e.target.value }))}
                                placeholder="0"
                                title="Lo que nos van a pagar por esta labor"
                                style={{ width: 90, padding: "3px 5px", border: "1px solid #999", borderRadius: 4, textAlign: "right" }}
                              />
                            </span>
                          </label>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "#444" }}>
                            <input
                              type="checkbox"
                              checked={!!workersPaid[d.col.key]}
                              onChange={(e) => setWorkersPaid((p) => ({ ...p, [d.col.key]: e.target.checked }))}
                            />
                            ya pagamos a los trabajadores
                          </label>
                        </div>
                      ) : (
                        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ color: "#666" }}>% ganancia</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <input
                              type="number"
                              min="0"
                              value={effectivePct(d.col.key)}
                              onChange={(e) => setPctOverrides((p) => ({ ...p, [d.col.key]: Math.max(0, Number(e.target.value) || 0) }))}
                              title="% propio de esta labor — edítalo para separarlo del % general"
                              style={{ width: 60, padding: "3px 5px", border: "1px solid #999", borderRadius: 4, textAlign: "right" }}
                            />
                            %
                          </span>
                        </label>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontWeight: 700, borderTop: "1px solid #ddd", paddingTop: 4 }}>
                      <span>Ganancia</span>
                      <span>{fmtCLP(profitFor(d.col, d.totalAmount))}</span>
                    </div>
                  </div>
                ))}
                <div style={{ background: ROW_TOTAL_DARK, color: "#fff", fontWeight: 700, borderRadius: 6, padding: 8, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>TOTAL — {fmtCLP(grandTotal)}</span>
                  <span>{fmtCLP(totalProfit)}</span>
                </div>
              </div>
            ) : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ background: HDR_GREEN }}>
                    <th style={cellH}>Labor</th>
                    <th style={{ ...cellH, textAlign: "right" }}>Monto</th>
                    <th style={{ ...cellH, textAlign: "right" }}>% / pagan</th>
                    <th style={{ ...cellH, textAlign: "right" }}>Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {dataByColumn.map((d) => (
                    <tr key={d.col.key}>
                      <td style={cell}>
                        {d.col.labor.name}
                        <span style={{ marginLeft: 4, fontSize: 9, color: "#888" }}>· {d.col.cycleLabel}</span>
                      </td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        {fmtCLP(d.totalAmount)}
                        {isWorkdayCol(d.col) && workersPaid[d.col.key] && (
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#2e7d32", marginTop: 1 }}>
                            ✅ ya pagado <span style={{ fontWeight: 400, color: "#666" }}>(solo informativo)</span>
                          </div>
                        )}
                        {isSupervisionCol(d.col) && (
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#b91c1c", marginTop: 1 }}>
                            ➖ descuento <span style={{ fontWeight: 400, color: "#666" }}>(cubierto por el % general)</span>
                          </div>
                        )}
                      </td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        {isSupervisionCol(d.col) ? (
                          <span style={{ fontSize: 10, color: "#666", fontStyle: "italic" }}>
                            −100% (automático)
                          </span>
                        ) : isWorkdayCol(d.col) ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                              $
                              <input
                                type="number"
                                min="0"
                                value={paidToUs[d.col.key] ?? ""}
                                onChange={(e) => setPaidToUs((p) => ({ ...p, [d.col.key]: e.target.value }))}
                                placeholder="0"
                                title="Lo que nos van a pagar por esta labor"
                                style={{ width: 80, padding: "2px 4px", border: "1px solid #999", borderRadius: 4, textAlign: "right" }}
                              />
                            </span>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, color: "#444", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={!!workersPaid[d.col.key]}
                                onChange={(e) => setWorkersPaid((p) => ({ ...p, [d.col.key]: e.target.checked }))}
                              />
                              ya pagamos a los trabajadores
                            </label>
                          </div>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <input
                              type="number"
                              min="0"
                              value={effectivePct(d.col.key)}
                              onChange={(e) => setPctOverrides((p) => ({ ...p, [d.col.key]: Math.max(0, Number(e.target.value) || 0) }))}
                              title="% propio de esta labor — edítalo para separarlo del % general"
                              style={{ width: 50, padding: "2px 4px", border: "1px solid #999", borderRadius: 4, textAlign: "right" }}
                            />
                            %
                          </span>
                        )}
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontWeight: 600 }}>
                        {fmtCLP(profitFor(d.col, d.totalAmount))}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: ROW_TOTAL_DARK, color: "#fff", fontWeight: 700 }}>
                    <td style={{ ...cell, borderColor: "#3d6b2e" }}>TOTAL</td>
                    <td style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e" }}>{fmtCLP(grandTotal)}</td>
                    <td style={{ ...cell, borderColor: "#3d6b2e" }}></td>
                    <td style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e", fontSize: 13 }}>
                      {fmtCLP(totalProfit)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
