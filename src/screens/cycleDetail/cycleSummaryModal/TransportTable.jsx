import { dateLabel } from "../../../utils/cycleSummary";
import { fmtCurrency } from "../../../utils/format";
import { cellH, cell, chargeDateInputStyle, inputVal, chargeInputStyle } from "./tableStyles";

export function TransportTable({
  carrierId,
  displayName,
  rows,
  totalCount,
  totalAmount,
  mode,
  editMode = true,
  hiddenColumns = new Set(),
  chargeRate,
  onEditRow,
  onAddRow,
  onRemoveRow,
}) {
  const isCharge = mode === "charge";
  const editable = isCharge && editMode;
  if (rows.length === 0 && !isCharge) return null;
  const showCol = (key) => !hiddenColumns.has(key);

  const rowCount = (r) => isCharge ? r.chargedCount : r.count;
  const rowRate = (r) => isCharge
    ? r.chargedRate
    : (r.count > 0 ? Math.round(r.amount / r.count) : 0);
  const rowTotal = (r) => isCharge ? r.chargedAmount : r.amount;

  const handleField = (r, field, raw) => {
    if (!onEditRow) return;
    const value = raw === "" ? "" : Number(raw);
    onEditRow(carrierId, r, { [field]: value });
  };
  const handleDateChange = (r, raw) => {
    if (!onEditRow) return;
    onEditRow(carrierId, r, { date: raw });
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#fbe5d6" }}>
            <th style={cellH}>🚐 Transporte</th>
            <th style={cellH}>Fecha</th>
            {showCol("qty") && <th style={{ ...cellH, textAlign: "right" }}>Vueltas</th>}
            {showCol("rate") && <th style={{ ...cellH, textAlign: "right" }}>Valor</th>}
            {showCol("total") && <th style={{ ...cellH, textAlign: "right" }}>Total</th>}
            {editable && <th style={{ ...cellH, width: 24 }}></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const count = rowCount(r);
            const rate = rowRate(r);
            const total = rowTotal(r);
            const rowKey = r.rowKey || r.date || `r${Math.random()}`;
            return (
              <tr key={rowKey}>
                <td style={cell}>
                  {displayName}
                  {r.isExtra && editable && (
                    <span style={{ color: "#888", marginLeft: 4, fontSize: 10 }}>
                      {r.sourceCycleLabel ? `(de ${r.sourceCycleLabel})` : "(ajuste)"}
                    </span>
                  )}
                </td>
                <td style={cell}>
                  {editable && r.isExtra ? (
                    <input
                      type="date"
                      value={r.date || ""}
                      onChange={(e) => handleDateChange(r, e.target.value)}
                      style={chargeDateInputStyle}
                    />
                  ) : (
                    dateLabel(r.date)
                  )}
                </td>
                {showCol("qty") && (
                  <td style={{ ...cell, textAlign: "right", padding: editable ? 3 : "5px 8px" }}>
                    {editable ? (
                      <input
                        type="number"
                        value={inputVal(count)}
                        onChange={(e) => handleField(r, "count", e.target.value)}
                        style={chargeInputStyle}
                      />
                    ) : count}
                  </td>
                )}
                {showCol("rate") && (
                  <td style={{ ...cell, textAlign: "right", padding: editable ? 3 : "5px 8px" }}>
                    {editable ? (
                      <input
                        type="number"
                        value={inputVal(rate)}
                        onChange={(e) => handleField(r, "rate", e.target.value)}
                        style={chargeInputStyle}
                      />
                    ) : (rate > 0 ? fmtCurrency(rate) : "")}
                  </td>
                )}
                {showCol("total") && (
                  <td style={{ ...cell, textAlign: "right", padding: editable ? 3 : "5px 8px" }}>
                    {editable ? (
                      <input
                        type="number"
                        value={inputVal(total)}
                        onChange={(e) => handleField(r, "amount", e.target.value)}
                        style={{ ...chargeInputStyle, fontWeight: 600 }}
                        title="Reemplaza el cálculo vueltas × valor. Bórralo para volver al cálculo automático."
                      />
                    ) : fmtCurrency(total)}
                  </td>
                )}
                {editable && (
                  <td style={{ ...cell, textAlign: "center", padding: 2 }}>
                    {r.isExtra && (
                      <button
                        type="button"
                        onClick={() => onRemoveRow && onRemoveRow(carrierId, r.extraId)}
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
                colSpan={2 + Number(showCol("qty")) + Number(showCol("rate")) + Number(showCol("total")) + 1}
                style={{ ...cell, padding: 4, textAlign: "left", background: "#f9fafb" }}
              >
                <button
                  type="button"
                  onClick={() => onAddRow(carrierId)}
                  style={{ background: "transparent", border: "1px dashed #999", borderRadius: 4, padding: "2px 8px", cursor: "pointer", fontSize: 11 }}
                >
                  + Agregar viaje / ajuste manual
                </button>
              </td>
            </tr>
          )}
          <tr style={{ background: "#c6efce" }}>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>Subtotal {displayName}</td>
            {showCol("qty") && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{totalCount}</td>
            )}
            {showCol("rate") && <td style={cell}></td>}
            {showCol("total") && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(totalAmount)}
              </td>
            )}
            {editable && <td style={cell}></td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
