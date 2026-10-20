import { HDR_GREEN, ROW_TOTAL_DARK, cell, cellH } from "./tableStyles";
import { fmtCLP } from "./helpers";
import { isSupervisionCol, isWorkdayCol } from "../../../utils/combinedSummary";

// Tabla para ajustar la ganancia (los % o lo que paga el cliente en labores
// de jornada), que alimenta GANANCIAS y TOTAL GENERAL. Va fuera de lo que se
// copia o imprime. En el teléfono, una tarjeta por labor.
export function ProfitSettingsPanel({ dataByColumn, grandTotal, isMobile, profit, totalProfit }) {
  "use no memo";
  const { effectivePct, generalPct, handleGeneralPctChange, paidToUs, profitFor, setPaidToUs, setPctOverrides, setVatEnabled, setWorkersPaid, vatEnabled, workersPaid } = profit;
  return (
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
  );
}
