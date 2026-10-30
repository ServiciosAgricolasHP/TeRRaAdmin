import { Fragment } from "react";
import { cellText, laborColumns } from "../../../utils/summaryTables";
import { cellH, cell, chargeDateInputStyle, inputVal, chargeInputStyle } from "./tableStyles";

// La tabla día a día de una labor (o de una tabla juntada) del resumen del
// ciclo. Las columnas y sus valores salen de `laborColumns`, las mismas que
// escribe el Excel; acá se dibujan, con los inputs del modo cobrar en edición.
// En cobrar, una tabla de horas extras lleva en edición el interruptor
// "Cobrar horas extras" de cada labor (`onToggleOvertime`).
export function LaborTable({
  section,
  mode,
  editMode = true,
  hiddenColumns = new Set(),
  catalogs,
  onEditRow,
  onAddRow,
  onRemoveRow,
  onToggleOvertime,
}) {
  const { laborId, laborType, displayName, rows, totals, redDates, overtimeToggles } = section;
  const isCharge = mode === "charge";
  const editable = isCharge && editMode;
  if (rows.length === 0 && !isCharge) return null;
  const isHE = laborType === "tratoHE";
  const columns = laborColumns(section, { mode, hiddenColumns, catalogs });
  const dataColumns = columns.filter((c) => c.key !== "detail" && c.key !== "date");
  const dateColumn = columns.find((c) => c.key === "date");

  // En una tabla fusionada cada fila trae su labor de origen (`_laborId`):
  // las ediciones vuelven a esa labor.
  const laborOf = (r) => r._laborId || laborId;
  const handleField = (r, field, raw) => {
    if (!onEditRow) return;
    const value = raw === "" ? "" : Number(raw);
    onEditRow(laborOf(r), r, { [field]: value });
  };
  const handleDateChange = (r, raw) => {
    if (!onEditRow) return;
    onEditRow(laborOf(r), r, { date: raw });
  };
  const handleAdd = () => { if (onAddRow) onAddRow(laborId); };
  const handleRemove = (r) => { if (onRemoveRow) onRemoveRow(laborOf(r), r.extraId); };

  const rowCellStyle = (col, v) => {
    if (col.key === "piso") return { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: v !== "—" ? "#b45309" : "#999" };
    if (col.key === "total") return { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 };
    if (col.key === "personas") return { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", padding: editable ? 3 : "5px 8px" };
    if (col.key === "bonos") return { ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: v !== "—" ? "#b45309" : "#999" };
    return { ...cell, textAlign: "right", whiteSpace: col.edits ? "nowrap" : undefined, padding: editable && (col.edit || col.edits) ? 3 : "5px 8px" };
  };
  const totalCellStyle = (col) => {
    const base = { ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" };
    if (col.key === "piso" || col.key === "bonos") return { ...base, color: "#b45309" };
    return base;
  };
  const renderCell = (col, r) => {
    const edits = editable && col.edits ? col.edits(r) : null;
    if (edits) {
      return (
        <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
          {edits.map((e) => (
            <Fragment key={e.field}>
              <input
                type="number"
                step={e.step}
                value={inputVal(e.raw)}
                onChange={(ev) => handleField(r, e.field, ev.target.value)}
                style={{ ...chargeInputStyle, width: e.width }}
                title={e.title}
              />
              {e.suffix && <span style={{ fontSize: 10, color: "#666" }}>{e.suffix}</span>}
            </Fragment>
          ))}
        </span>
      );
    }
    const edit = editable && col.edit ? col.edit(r) : null;
    if (edit) {
      return (
        <input
          type="number"
          step={edit.step}
          value={inputVal(edit.raw)}
          onChange={(e) => handleField(r, edit.field, e.target.value)}
          style={edit.bold ? { ...chargeInputStyle, fontWeight: 600 } : chargeInputStyle}
          title={edit.title}
        />
      );
    }
    const v = col.value(r);
    if (col.key === "transport" && typeof v === "string") return <span style={{ color: "#999" }}>{v}</span>;
    return cellText(col, v);
  };

  return (
    <div style={{ marginBottom: 14 }}>
      {editable && overtimeToggles && onToggleOvertime && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, marginBottom: 4, fontSize: 12 }}>
          {overtimeToggles.map((t) => (
            <label key={t.laborId} style={{ display: "inline-flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
              <input type="checkbox" checked={t.on} onChange={() => onToggleOvertime(t.laborId, !t.on)} />
              Cobrar horas extras{overtimeToggles.length > 1 ? ` · ${t.name}` : ""}
            </label>
          ))}
        </div>
      )}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#9dc3e6" }}>
            <th style={cellH}>Detalle de jornada</th>
            <th style={cellH}>Fecha</th>
            {dataColumns.map((col) => (
              <th key={col.key} style={{ ...cellH, textAlign: "right" }} title={col.title}>{col.label}</th>
            ))}
            {editable && <th style={{ ...cellH, width: 24 }}></th>}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const dateIsRed = isHE && redDates && r.date && redDates.has(r.date);
            const dateCellStyle = dateIsRed ? { ...cell, color: "#c00", fontWeight: 700 } : cell;
            const rowKey = r._key || r.rowKey || r.date || `r${Math.random()}`;
            const badge = dateColumn.badge(r);
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
                      style={chargeDateInputStyle}
                    />
                  ) : (
                    <>
                      {dateColumn.value(r)}
                      {badge && (
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
                          {badge}
                        </span>
                      )}
                    </>
                  )}
                </td>
                {dataColumns.map((col) => (
                  <td key={col.key} style={rowCellStyle(col, col.value(r))}>{renderCell(col, r)}</td>
                ))}
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
              <td colSpan={columns.length + 1} style={{ ...cell, padding: 4, textAlign: "left", background: "#f9fafb" }}>
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
            {dataColumns.map((col) => (
              <td key={col.key} style={totalCellStyle(col)}>{cellText(col, col.total(totals))}</td>
            ))}
            {editable && <td style={cell}></td>}
          </tr>
        </tbody>
      </table>
    </div>
  );
}
