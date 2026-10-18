import { tratoUnitLabel } from "../../../utils/cosechaCombos";
import { dateLabel, fmtNumber, formatRowMetric, formatTotalsMetric } from "../../../utils/cycleSummary";
import { fmtCurrency } from "../../../utils/format";
import { cellH, cell, cobrarDateInputStyle, inputVal, cobrarInputStyle } from "./tableStyles";

export function LaborTable({
  laborId,
  displayName,
  unit,
  laborType,
  overtimeRate = 3500,
  rows,
  totals,
  mode,
  editMode = true,
  hiddenColumns = new Set(),
  chargeRate,
  catalogs,
  redDates,
  onEditRow,
  onAddRow,
  onRemoveRow,
}) {
  const isCobrar = mode === "cobrar";
  const editable = isCobrar && editMode;
  if (rows.length === 0 && !isCobrar) return null;
  const showPiso = (totals.pisoAmount || 0) > 0;
  const isHE = laborType === "tratoHE";
  const showCol = (key) => !hiddenColumns.has(key);

  // En cobrar las filas traen chargedQty, chargedOvertimeHours, chargedRate y
  // chargedAmount, con los overrides aplicados; en pagar se leen los campos de
  // la fila agregada.
  const rowQty = (r) => isCobrar ? r.chargedQty : r.qty;
  const rowHE = (r) => isCobrar ? r.chargedOvertimeHours : r.overtimeHours;
  // Columna "Valor": en tratoHE, el Total HE (horas × tarifa HE de la labor);
  // en el resto, el precio por unidad.
  const rowHeTotal = (r) => (Number(rowHE(r)) || 0) * overtimeRate;
  const rowRate = (r) => {
    if (isHE) return rowHeTotal(r);
    if (isCobrar) return r.chargedRate;
    return r.qty > 0 ? Math.round(r.amount / r.qty) : 0;
  };
  const rowValorTotal = (r) => isCobrar ? r.chargedAmount : r.amount;

  // En una tabla fusionada cada fila trae su labor de origen (`_laborId`,
  // `_laborType`, `_laborName`): las ediciones vuelven a esa labor.
  const laborOf = (r) => r._laborId || laborId;
  const typeOf = (r) => r._laborType || laborType;
  const handleField = (r, field, raw) => {
    if (!onEditRow) return;
    const value = raw === "" ? "" : Number(raw);
    onEditRow(laborOf(r), r, { [field]: value });
  };
  // Trato: badge junto a la fecha con la unidad del tier (Árbol, Metro…) o
  // "T1", "T2"… si no tiene unidad. La fila del primer tier lo lleva solo si
  // el día tiene más de una fila.
  const rowCountByDate = (() => {
    const m = new Map();
    for (const r of rows) {
      if (!r.date || r.isExtra || typeOf(r) !== "trato") continue;
      const k = `${laborOf(r)}|${r.date}`;
      m.set(k, (m.get(k) || 0) + 1);
    }
    return m;
  })();
  const tierBadgeFor = (r) => {
    if (typeOf(r) !== "trato" || r.isExtra) return null;
    const same = rowCountByDate.get(`${laborOf(r)}|${r.date}`) || 0;
    if (same < 2 && (r.tierIdx ?? 0) === 0) return null;
    const unitLbl = r.unit != null ? tratoUnitLabel(catalogs, r.unit) : null;
    if (unitLbl) return unitLbl;
    return `P${(r.tierIdx ?? 0) + 1}`;
  };
  const handleDateChange = (r, raw) => {
    if (!onEditRow) return;
    onEditRow(laborOf(r), r, { date: raw });
  };
  const handleAdd = () => { if (onAddRow) onAddRow(laborId); };
  const handleRemove = (r) => { if (onRemoveRow) onRemoveRow(laborOf(r), r.extraId); };

  return (
    <div style={{ marginBottom: 14 }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#9dc3e6" }}>
            <th style={cellH}>Detalle de jornada</th>
            <th style={cellH}>Fecha</th>
            {isHE ? (
              <>
                {showCol("qty") && <th style={{ ...cellH, textAlign: "right" }}>Base $</th>}
                {showCol("he") && <th style={{ ...cellH, textAlign: "right" }}>HE (hrs)</th>}
              </>
            ) : (
              showCol("qty") && (
                <th
                  style={{ ...cellH, textAlign: "right" }}
                  title="La cantidad que se paga en esta labor. En pago al día es una jornada por trabajador (coincide con Personas); en cosecha son kilos y en trato unidades (sacos, metros, árboles), que no tienen relación con cuánta gente trabajó."
                >
                  {unit}
                </th>
              )
            )}
            {showCol("rate") && <th style={{ ...cellH, textAlign: "right" }}>{isHE ? "Total HE" : "Valor"}</th>}
            {showCol("valorTotal") && <th style={{ ...cellH, textAlign: "right" }}>Valor total</th>}
            {showPiso && showCol("piso") && <th style={{ ...cellH, textAlign: "right" }}>Piso</th>}
            {showCol("transport") && <th style={{ ...cellH, textAlign: "right" }}>Transporte</th>}
            {showCol("total") && <th style={{ ...cellH, textAlign: "right" }}>Total</th>}
            {showCol("personas") && (
              <th
                style={{ ...cellH, textAlign: "right" }}
                title="Cuántos trabajadores distintos tuvieron jornada ese día. Es informativo: no entra en ningún cálculo de montos."
              >
                Personas
              </th>
            )}
            {isHE && showCol("bonos") && <th style={{ ...cellH, textAlign: "right" }}>Bonos</th>}
            {editable && <th style={{ ...cellH, width: 24 }}></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const piso = Number(r.pisoAmount) || 0;
            const qty = rowQty(r);
            const heHrs = rowHE(r);
            const rate = rowRate(r);
            const valorTotal = rowValorTotal(r);
            const transport = isCobrar ? Number(r.chargedTransport) || 0 : 0;
            const totalCol = isCobrar ? valorTotal + transport : valorTotal + piso;
            const dateIsRed = isHE && redDates && r.date && redDates.has(r.date);
            const dateCellStyle = dateIsRed ? { ...cell, color: "#c00", fontWeight: 700 } : cell;
            const rowKey = r._key || r.rowKey || r.date || `r${Math.random()}`;
            return (
              <tr key={rowKey}>
                <td style={cell}>
                  {r._laborName || displayName}
                  {r.isExtra && editable && (
                    <span style={{ color: "#888", marginLeft: 4, fontSize: 10 }}>
                      {r.sourceCycleLabel
                        ? `(de ${r.sourceCycleLabel}${r.sourceLaborName ? ` · ${r.sourceLaborName}` : ""})`
                        : "(ajuste)"}
                    </span>
                  )}
                </td>
                <td style={dateCellStyle}>
                  {editable && r.isExtra ? (
                    <input
                      type="date"
                      value={r.date || ""}
                      onChange={(e) => handleDateChange(r, e.target.value)}
                      style={cobrarDateInputStyle}
                    />
                  ) : (
                    <>
                      {dateLabel(r.date)}
                      {(() => {
                        const tb = tierBadgeFor(r);
                        if (!tb) return null;
                        return (
                          <span
                            style={{
                              marginLeft: 6,
                              padding: "1px 6px",
                              fontSize: 10,
                              fontWeight: 600,
                              background: "#e0e7ff",
                              color: "#3730a3",
                              borderRadius: 4,
                              verticalAlign: "middle",
                            }}
                            title="Precio del día (P1, P2…)"
                          >
                            {tb}
                          </span>
                        );
                      })()}
                    </>
                  )}
                </td>
                {isHE ? (
                  <>
                    {showCol("qty") && (
                      <td style={{ ...cell, textAlign: "right", padding: editable ? 3 : "5px 8px" }}>
                        {editable ? (
                          <input
                            type="number"
                            value={inputVal(qty)}
                            onChange={(e) => handleField(r, "qty", e.target.value)}
                            style={cobrarInputStyle}
                          />
                        ) : (qty > 0 ? fmtCurrency(qty) : "")}
                      </td>
                    )}
                    {showCol("he") && (
                      <td style={{ ...cell, textAlign: "right", padding: editable ? 3 : "5px 8px" }}>
                        {editable ? (
                          <input
                            type="number"
                            step="0.25"
                            value={inputVal(heHrs)}
                            onChange={(e) => handleField(r, "overtimeHours", e.target.value)}
                            style={cobrarInputStyle}
                          />
                        ) : (heHrs > 0 ? fmtNumber(heHrs) : "")}
                      </td>
                    )}
                  </>
                ) : (
                  showCol("qty") && (
                    <td style={{ ...cell, textAlign: "right", padding: editable ? 3 : "5px 8px" }}>
                      {editable ? (
                        <input
                          type="number"
                          value={inputVal(qty)}
                          onChange={(e) => handleField(r, "qty", e.target.value)}
                          style={cobrarInputStyle}
                        />
                      ) : (
                        // Se pasa el qty resuelto (chargedQty en cobrar, qty en pagar)
                        // para que la métrica refleje los overrides.
                        formatRowMetric({ ...r, qty, overtimeHours: heHrs }, typeOf(r), catalogs)
                      )}
                    </td>
                  )
                )}
                {showCol("rate") && (
                  <td style={{ ...cell, textAlign: "right", padding: (editable && !isHE) ? 3 : "5px 8px" }}>
                    {isHE ? (
                      rate > 0 ? fmtCurrency(rate) : ""
                    ) : editable ? (
                      <input
                        type="number"
                        value={inputVal(rate)}
                        onChange={(e) => handleField(r, "rate", e.target.value)}
                        style={cobrarInputStyle}
                      />
                    ) : (rate > 0 ? fmtCurrency(rate) : "")}
                  </td>
                )}
                {showCol("valorTotal") && (
                  <td style={{ ...cell, textAlign: "right", padding: editable ? 3 : "5px 8px" }}>
                    {editable ? (
                      <input
                        type="number"
                        value={inputVal(valorTotal)}
                        onChange={(e) => handleField(r, "amount", e.target.value)}
                        style={{ ...cobrarInputStyle, fontWeight: 600 }}
                        title="Reemplaza el cálculo cantidad × tarifa. Bórralo para volver al cálculo automático."
                      />
                    ) : fmtCurrency(valorTotal)}
                  </td>
                )}
                {showPiso && showCol("piso") && (
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: piso > 0 ? "#b45309" : "#999" }}>
                    {piso > 0 ? `${r.pisoCount > 1 ? `${r.pisoCount}× ` : ""}${fmtCurrency(piso)}` : "—"}
                  </td>
                )}
                {showCol("transport") && (
                  <td style={{ ...cell, textAlign: "right", padding: editable ? 3 : "5px 8px" }}>
                    {editable ? (
                      <input
                        type="number"
                        value={inputVal(transport)}
                        onChange={(e) => handleField(r, "transport", e.target.value)}
                        style={cobrarInputStyle}
                        title="Monto de transporte del día — SUMA al Total de la fila y al total a cobrar"
                      />
                    ) : transport > 0 ? (
                      fmtCurrency(transport)
                    ) : (
                      <span style={{ color: "#999" }}>$ -</span>
                    )}
                  </td>
                )}
                {showCol("total") && (
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtCurrency(totalCol)}</td>
                )}
                {showCol("personas") && (
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", padding: editable ? 3 : "5px 8px" }}>
                    {editable ? (
                      <input
                        type="number"
                        value={inputVal(isCobrar ? r.chargedWorkerCount : r.workerCount)}
                        onChange={(e) => handleField(r, "workerCount", e.target.value)}
                        style={cobrarInputStyle}
                        title="Cantidad de personas del día — informativo, no afecta montos"
                      />
                    ) : (() => {
                      const wc = isCobrar ? Number(r.chargedWorkerCount) || 0 : Number(r.workerCount) || 0;
                      return wc > 0 ? wc : (r.isExtra ? "—" : 0);
                    })()}
                  </td>
                )}
                {isHE && showCol("bonos") && (
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: (r.bonosTotal || 0) > 0 ? "#b45309" : "#999" }}>
                    {(r.bonosTotal || 0) > 0 ? fmtCurrency(r.bonosTotal) : "—"}
                  </td>
                )}
                {editable && (
                  <td style={{ ...cell, textAlign: "center", padding: 2 }}>
                    {r.isExtra && (
                      <button
                        type="button"
                        onClick={() => handleRemove(r)}
                        title="Eliminar fila"
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#b91c1c", fontSize: 14, padding: 0 }}
                      >
                        ✕
                      </button>
                    )}
                  </td>
                )}
              </tr>
            );
          })}
          {editable && onAddRow && (
            <tr>
              <td
                colSpan={
                  2
                  + (isHE ? (Number(showCol("qty")) + Number(showCol("he"))) : Number(showCol("qty")))
                  + Number(showCol("rate"))
                  + Number(showCol("valorTotal"))
                  + (showPiso ? Number(showCol("piso")) : 0)
                  + Number(showCol("transport"))
                  + Number(showCol("total"))
                  + Number(showCol("personas"))
                  + (isHE ? Number(showCol("bonos")) : 0)
                  + 1
                }
                style={{ ...cell, padding: 4, textAlign: "left", background: "#f9fafb" }}
              >
                <button
                  type="button"
                  onClick={handleAdd}
                  style={{ background: "transparent", border: "1px dashed #999", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 11 }}
                >
                  + Agregar día / ajuste manual
                </button>
              </td>
            </tr>
          )}
          <tr style={{ background: "#c6efce" }}>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>Subtotal {displayName}</td>
            {isHE ? (
              <>
                {showCol("qty") && (
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {totals.qty > 0 ? fmtCurrency(totals.qty) : ""}
                  </td>
                )}
                {showCol("he") && (
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {totals.overtimeHours > 0 ? fmtNumber(totals.overtimeHours) : ""}
                  </td>
                )}
              </>
            ) : (
              showCol("qty") && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {isCobrar
                    ? (totals.qty == null
                        // Tabla fusionada con medidas distintas: no se suman.
                        ? ""
                        : laborType === "tratoEtapas"
                        // Unidades deduplicadas (solo etapas que cuentan).
                        ? `${fmtNumber(totals.countedQty ?? totals.qty ?? 0)} unid.`
                        : fmtNumber(totals.qty || 0))
                    : formatTotalsMetric(totals, laborType, rows, catalogs)}
                </td>
              )
            )}
            {showCol("rate") && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {isHE && (totals.heTotal || 0) > 0 ? fmtCurrency(totals.heTotal) : ""}
              </td>
            )}
            {showCol("valorTotal") && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totals.amount)}</td>
            )}
            {showPiso && showCol("piso") && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#b45309" }}>
                {fmtCurrency(totals.pisoAmount || 0)}
              </td>
            )}
            {showCol("transport") && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {isCobrar && (totals.transport || 0) > 0 ? fmtCurrency(totals.transport) : ""}
              </td>
            )}
            {showCol("total") && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(isCobrar ? totals.amount + (totals.transport || 0) : totals.amount + (totals.pisoAmount || 0))}
              </td>
            )}
            {showCol("personas") && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {(totals.workerDays || 0) > 0 ? totals.workerDays : ""}
              </td>
            )}
            {isHE && showCol("bonos") && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#b45309" }}>
                {(totals.bonosTotal || 0) > 0 ? fmtCurrency(totals.bonosTotal) : "—"}
              </td>
            )}
            {editable && <td style={cell}></td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
