import { carrierColumns, cellText } from "../../../utils/summaryTables";
import { cellH, cell, chargeDateInputStyle, inputVal, chargeInputStyle } from "./tableStyles";

// La tabla día a día de un transportista del resumen del ciclo. Las columnas
// salen de `carrierColumns`, las mismas que escribe el Excel.
export function TransportTable({
  section,
  mode,
  editMode = true,
  hiddenColumns = new Set(),
  onEditRow,
  onAddRow,
  onRemoveRow,
}) {
  const { carrierId, displayName, rows, totals } = section;
  const isCharge = mode === "charge";
  const editable = isCharge && editMode;
  if (rows.length === 0 && !isCharge) return null;
  const columns = carrierColumns(section, { mode, hiddenColumns });
  const dataColumns = columns.filter((c) => c.key !== "detail" && c.key !== "date");

  const handleField = (r, field, raw) => {
    if (!onEditRow) return;
    const value = raw === "" ? "" : Number(raw);
    onEditRow(carrierId, r, { [field]: value });
  };
  const handleDateChange = (r, raw) => {
    if (!onEditRow) return;
    onEditRow(carrierId, r, { date: raw });
  };
  const renderCell = (col, r) => {
    const edit = editable && col.edit ? col.edit(r) : null;
    if (edit) {
      return (
        <input
          type="number"
          value={inputVal(edit.raw)}
          onChange={(e) => handleField(r, edit.field, e.target.value)}
          style={edit.bold ? { ...chargeInputStyle, fontWeight: 600 } : chargeInputStyle}
          title={edit.title}
        />
      );
    }
    return cellText(col, col.value(r));
  };

  return (
    <div style={{ marginBottom: 14 }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#fbe5d6" }}>
            <th style={cellH}>🚐 Transporte</th>
            <th style={cellH}>Fecha</th>
            {dataColumns.map((col) => (
              <th key={col.key} style={{ ...cellH, textAlign: "right" }}>{col.label}</th>
            ))}
            {editable && <th style={{ ...cellH, width: 24 }}></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
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
                    columns[1].value(r)
                  )}
                </td>
                {dataColumns.map((col) => (
                  <td key={col.key} style={{ ...cell, textAlign: "right", padding: editable ? 3 : "5px 8px" }}>
                    {renderCell(col, r)}
                  </td>
                ))}
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
              <td colSpan={columns.length + 1} style={{ ...cell, padding: 4, textAlign: "left", background: "#f9fafb" }}>
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
            {dataColumns.map((col) =>
              col.key === "rate"
                ? <td key={col.key} style={cell}></td>
                : (
                  <td key={col.key} style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {cellText(col, col.total(totals))}
                  </td>
                ),
            )}
            {editable && <td style={cell}></td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
