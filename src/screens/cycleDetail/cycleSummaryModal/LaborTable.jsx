import { Fragment } from "react";
import { cellText, laborColumns } from "../../../utils/summaryTables";
import { cellH, cell, chargeDateInputStyle, inputVal, chargeInputStyle, NOT_CHARGED_ROW, NOT_CHARGED_TITLE } from "./tableStyles";

// Lo que se usa cuando no se pasa la prop: siempre el mismo objeto.
const NO_HIDDEN_COLUMNS = new Set();

// El interruptor "Cobrar horas extras" de una labor. En una labor al día
// (`rate` no es null), encendido pide el valor de la hora.
function OvertimeSwitch({ toggle, showName, onChange }) {
  const { laborId, name, on, rate } = toggle;
  const needsRate = on && rate != null;
  return (
    <div
      style={{
        display: "inline-flex", alignItems: "center", gap: 8, minHeight: 32, padding: "3px 10px 3px 4px",
        border: `1px solid ${on ? "#16a34a" : "#bbb"}`, borderRadius: 999, background: on ? "#f0fdf4" : "#f5f5f5", fontSize: 12,
      }}
    >
      <button
        type="button"
        role="switch"
        aria-checked={on}
        onClick={() => onChange(laborId, { chargeOvertime: !on })}
        title={on ? "Dejar de cobrar horas extras en esta labor" : "Cobrar horas extras en esta labor"}
        style={{ display: "inline-flex", alignItems: "center", gap: 8, minHeight: 26, background: "transparent", border: "none", padding: 0, cursor: "pointer", fontSize: 12, fontWeight: 600, color: "#222" }}
      >
        <span style={{ position: "relative", width: 38, height: 22, borderRadius: 999, background: on ? "#16a34a" : "#9ca3af", transition: "background 0.15s", flexShrink: 0 }}>
          <span style={{ position: "absolute", top: 2, left: on ? 18 : 2, width: 18, height: 18, borderRadius: "50%", background: "#fff", boxShadow: "0 1px 2px rgba(0,0,0,0.3)", transition: "left 0.15s" }} />
        </span>
        Cobrar horas extras{showName ? ` · ${name}` : ""}
      </button>
      {needsRate && (
        <label style={{ display: "inline-flex", alignItems: "center", gap: 4, color: "#444" }}>
          Valor hora $
          <input
            type="number"
            value={inputVal(rate)}
            onChange={(e) => onChange(laborId, { overtimeRate: e.target.value === "" ? "" : Number(e.target.value) })}
            placeholder="0"
            title="Lo que se cobra por cada hora extra de esta labor. Las horas de cada día se escriben en la tabla."
            style={{ ...chargeInputStyle, width: 84, borderColor: rate > 0 ? undefined : "#dc2626" }}
          />
        </label>
      )}
    </div>
  );
}

// La tabla día a día de una labor (o de una tabla juntada) del resumen del
// ciclo. Las columnas y sus valores salen de `laborColumns`, las mismas que
// escribe el Excel; acá se dibujan, con los inputs del modo cobrar en edición.
// En cobrar y en edición, una labor de horas extras o al día lleva el
// interruptor "Cobrar horas extras" (`onOvertimeChange`); la labor al día,
// además, el valor de la hora.
export function LaborTable({
  section,
  mode,
  editMode = true,
  hiddenColumns = NO_HIDDEN_COLUMNS,
  catalogs,
  onEditRow,
  onAddRow,
  onRemoveRow,
  onOvertimeChange,
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
      {editable && overtimeToggles && onOvertimeChange && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 6 }}>
          {overtimeToggles.map((t) => (
            <OvertimeSwitch key={t.laborId} toggle={t} showName={overtimeToggles.length > 1} onChange={onOvertimeChange} />
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
          {rows.map((r, i) => {
            const dateIsRed = isHE && redDates && r.date && redDates.has(r.date);
            const dateCellStyle = dateIsRed ? { ...cell, color: "#c00", fontWeight: 700 } : cell;
            const rowKey = r._key || r.rowKey || r.date || `r${i}`;
            const badge = dateColumn.badge(r);
            return (
              <tr key={rowKey} style={r.notCharged ? NOT_CHARGED_ROW : undefined} title={r.notCharged ? NOT_CHARGED_TITLE : undefined}>
                <td style={cell}>
                  {r._laborName || displayName}
                  {r.notCharged && (
                    <span style={{ color: "#888", marginLeft: 4, fontSize: 10 }}>(no se cobra)</span>
                  )}
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
