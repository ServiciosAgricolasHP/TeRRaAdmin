import { useState, useRef, useMemo } from "react";
import { useCaptureActions } from "../../../hooks/useCaptureActions";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { fmtNum } from "./helpers";
import { useProfitSettings } from "./useProfitSettings";
import { combinedSummaryText } from "./combinedSummaryText";
import {
  activeDaysOf,
  cellsByLaborDay,
  closingTotals,
  isSupervisionCol,
  isWorkdayCol,
  totalsByDayOf,
} from "../../../utils/combinedSummary";
import {
  HDR_GREEN,
  ROW_TOTAL_DARK,
  ROW_PROFIT,
  ROW_VAT,
  ROW_TOTAL_GENERAL,
  ROW_GROSS,
  cellH,
  ROW_HIGHLIGHT,
  cell,
} from "./tableStyles";
import { writeCombinedSummaryXlsx } from "./writeCombinedSummaryXlsx";
import { ProfitSettingsPanel } from "./ProfitSettingsPanel";
import { fmtCurrency } from "../../../utils/format";

// Tabla general: las labores seleccionadas como columnas y los días como
// filas; cada celda muestra cantidad (con unidad) y monto. Al final, la
// columna "Total día" y las filas de cierre (TOTAL A PAGAR, GANANCIAS,
// TRANSPORTE, MONTO LIBRE, TOTAL GENERAL, IVA y BRUTO).
export function CombinedSummaryCard({ dataByColumn, transportByCycle, firstColKeyForCycle, grandTotalTransport, includeTransport }) {
  "use no memo";
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const { busy, run, copy, print, copyText } = useCaptureActions();
  const captureRef = useRef(null);
  const profit = useProfitSettings();
  const {
    paidToUs,
    settings,
    vatEnabled,
    workersPaid,
    effectivePct,
    profitFor,
    totalGeneralFor,
  } = profit;

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

  const handleCopyText = () =>
    copyText(combinedSummaryText({
      activeDays, byLaborDay, dataByColumn, effectivePct, grandTotal,
      grandTotalGeneral, grandTotalGross, grandTotalTransport, grandTotalVat,
      hasSupervisionCols, includeTransport, paidToUs, profitFor, totalGeneralFor,
      totalProfit, totalProfitBillable, totalSupervisionDeduction, totalsByDay,
      transportByCycle, vatEnabled, workersPaid
    }));

  const handleCopyImage = () => copy(captureRef.current);

  const handleXlsx = () =>
    run("xlsx", () => writeCombinedSummaryXlsx({
      activeDays, byLaborDay, dataByColumn, firstColKeyForCycle, grandTotal,
      grandTotalGeneral, grandTotalGross, grandTotalTransport, grandTotalVat,
      hasSupervisionCols, includeTransport, profitFor, totalGeneralFor, totalProfit,
      totalProfitBillable, totalsByDay, transportByCycle, vatEnabled
    }), { error: "No se pudo generar el Excel" });

  const handlePrint = () =>
    print(captureRef.current, {
      title: "Tabla general",
      margin: "10mm",
      css: "th, td { border: 1px solid #888; padding: 6px 8px; font-size: 11px; }",
    });

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
          <div className="font-semibold tabular-nums text-[var(--color-accent)]">{fmtCurrency(grandTotal)}</div>
        </div>
        <div className="flex gap-1">
          <button onClick={handleCopyText} disabled={busy === "text"} title="Copiar como texto plano"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            {busy === "text" ? "..." : "📋 Texto"}
          </button>
          <button onClick={handleCopyImage} disabled={busy === "copy"} title="Copiar como imagen"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            {busy === "copy" ? "..." : "📋 Imagen"}
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
              {dataByColumn.length} labores · {activeDays.length} días · gran total {fmtCurrency(grandTotal)}
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
                            <div style={{ fontWeight: 600 }}>{fmtCurrency(c.amount)}</div>
                          </td>
                        );
                      })}
                      <td style={{ ...cell, textAlign: "right", fontWeight: 700, background: ROW_HIGHLIGHT }}>
                        {fmtCurrency(dayTotal)}
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
                      <div>{fmtCurrency(d.totalAmount)}</div>
                      {isWorkdayCol(d.col) && workersPaid[d.col.key] && (
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>✅ ya pagado</div>
                      )}
                      {isSupervisionCol(d.col) && (
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>➖NF</div>
                      )}
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e", fontSize: 13 }}>
                    {fmtCurrency(grandTotal)}
                  </td>
                </tr>
                <tr style={{ background: ROW_PROFIT, color: "#1a2e0f", fontWeight: 700 }}>
                  <td style={{ ...cell, borderColor: "#6aa84f" }}>GANANCIAS</td>
                  {dataByColumn.map((d) => (
                    <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#6aa84f" }}>
                      {isSupervisionCol(d.col) ? "—" : fmtCurrency(profitFor(d.col, d.totalAmount))}
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: "right", borderColor: "#6aa84f", fontSize: 13 }}>
                    {fmtCurrency(totalProfitBillable)}
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
                          {fmtCurrency(t.total)}
                          {t.total === 0 && (
                            <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>
                              {t.hasTrips ? "vueltas creadas" : "sin vueltas"}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e", fontSize: 13 }}>
                      {fmtCurrency(grandTotalTransport)}
                    </td>
                  </tr>
                )}
                {hasSupervisionCols && (
                  <tr style={{ background: ROW_VAT, color: "#274e13", fontWeight: 700 }}>
                    <td style={{ ...cell, borderColor: "#93c47d" }}>MONTO LIBRE</td>
                    {dataByColumn.map((d) => (
                      <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#93c47d" }}>
                        {isSupervisionCol(d.col) ? fmtCurrency(profitFor(d.col, d.totalAmount)) : "—"}
                      </td>
                    ))}
                    <td style={{ ...cell, textAlign: "right", borderColor: "#93c47d", fontSize: 13 }}>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>
                        {fmtCurrency(totalProfitBillable)} − {fmtCurrency(Math.abs(totalSupervisionDeduction))}
                      </div>
                      <div>{fmtCurrency(totalProfit)}</div>
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
                        {fmtCurrency(totalProfit)} − {fmtCurrency(grandTotalTransport)}
                      </div>
                      <div>{fmtCurrency(totalProfit - grandTotalTransport)}</div>
                    </td>
                  </tr>
                )}
                <tr style={{ background: ROW_TOTAL_GENERAL, color: "#fff", fontWeight: 700 }}>
                  <td style={{ ...cell, borderColor: "#274e13" }}>TOTAL GENERAL</td>
                  {dataByColumn.map((d) => (
                    <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#274e13" }}>
                      {fmtCurrency(totalGeneralFor(d.col, d.totalAmount))}
                      {isSupervisionCol(d.col) && (
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>➖NF</div>
                      )}
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: "right", borderColor: "#274e13", fontSize: 13 }}>
                    {fmtCurrency(grandTotalGeneral)}
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
                        {fmtCurrency(grandTotalVat)}
                      </td>
                    </tr>
                    <tr style={{ background: ROW_GROSS, color: "#fff", fontWeight: 700 }}>
                      <td style={{ ...cell, borderColor: "#16260a" }}>BRUTO</td>
                      {dataByColumn.map((d) => (
                        <td key={d.col.key} style={{ ...cell, borderColor: "#16260a" }}></td>
                      ))}
                      <td style={{ ...cell, textAlign: "right", borderColor: "#16260a", fontSize: 13 }}>
                        {fmtCurrency(grandTotalGross)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <ProfitSettingsPanel
          dataByColumn={dataByColumn}
          grandTotal={grandTotal}
          isMobile={isMobile}
          profit={profit}
          totalProfit={totalProfit}
        />
        </>
      )}
    </div>
  );
}
