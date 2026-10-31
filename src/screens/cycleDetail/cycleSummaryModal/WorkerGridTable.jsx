import { containerLabel, formatLaborDayPrice, qualityLabel } from "../../../utils/cosechaCombos";
import { dateLabel, fmtNumber } from "../../../utils/cycleSummary";
import { fmtCurrency } from "../../../utils/format";
import { cellH, cell } from "./tableStyles";

// Tabla imprimible trabajador × día de una labor, con los totales por día y
// el piso al pie. LaborWorkerGrid la dibuja en línea o dentro del Modal
// "Ampliar"; según `expanded` hay una sola instancia montada, así el ref
// apunta siempre a la activa.
export function WorkerGridTable({ anyPiso, catalogs, containers, dates, dayPrices, displayName, labor, redDates, titles, unit, workers }) {
  // Sumas por columna (día) — pie de tabla.
  const dayTotals = new Map();
  for (const d of dates) dayTotals.set(d, { qty: 0, amount: 0, jornadas: 0, overtimeHours: 0, pisoAmount: 0 });
  for (const w of workers) {
    for (const [d, c] of w.byDate.entries()) {
      const t = dayTotals.get(d);
      if (!t) continue;
      t.qty += c.qty;
      t.amount += c.amount;
      t.jornadas += c.jornadas;
      t.overtimeHours += c.overtimeHours || 0;
      t.pisoAmount += c.pisoAmount || 0;
    }
  }
  const grand = { qty: 0, amount: 0, jornadas: 0, overtimeHours: 0, pisoAmount: 0 };
  for (const w of workers) {
    grand.qty += w.totals.qty;
    grand.amount += w.totals.amount;
    grand.jornadas += w.totals.jornadas || 0;
    grand.overtimeHours += w.totals.overtimeHours || 0;
    grand.pisoAmount += w.totals.pisoAmount || 0;
  }

  const containerName = labor?.type === "cosecha" && containers.size === 1
    ? containerLabel(catalogs, [...containers][0])
    : null;

  // Contenido de una celda (trabajador, día). En cosecha y trato, la cantidad
  // arriba y el monto chico abajo; en el resto, el monto es la línea
  // principal. El piso va con 🪙. En tratoHE no se muestra la jornada (cada
  // día con trabajo es una) y el monto lleva "(X HE)" si hubo horas extras.
  const renderCell = (c) => {
    if (!c || (!c.qty && !c.amount && !c.pisoAmount)) return null;
    const lines = [];
    const t = labor?.type;
    if (c.pisoAmount > 0 && !c.qty && !c.jornadas) {
      lines.push(
        <div key="piso" style={{ color: "#b45309", fontSize: 10 }}>🪙 {fmtCurrency(c.pisoAmount)}</div>,
      );
    } else if (t === "cosecha") {
      const main = (
        <div key="kg" style={{ fontWeight: 600 }}>
          {fmtNumber(c.qty)}{containerName ? ` ${containerName.toLowerCase()}` : ""}
        </div>
      );
      lines.push(main);
      if (c.byCombo && c.byCombo.size > 1) {
        for (const [, b] of c.byCombo) {
          lines.push(
            <div key={`${b.qx}_${b.cy}`} style={{ fontSize: 9, color: "#666" }}>
              {qualityLabel(catalogs, b.qx)}: {fmtNumber(b.kilos)}
            </div>,
          );
        }
      }
    } else if (t === "trato") {
      lines.push(<div key="qty" style={{ fontWeight: 600 }}>{fmtNumber(c.qty)}</div>);
    } else if (t === "tratoHE") {
      // Sin línea de jornada: solo la del monto, más abajo.
    } else {
      // main, supervision, extra (y tratoEtapas): sin línea de cantidad; el
      // monto es la línea principal y la cantidad va en la columna Total.
    }
    if (c.pisoAmount > 0 && (c.qty || c.jornadas)) {
      lines.push(
        <div key="piso" style={{ color: "#b45309", fontSize: 9 }}>🪙 {fmtCurrency(c.pisoAmount)}</div>,
      );
    }
    if (c.amount) {
      const heSuffix = (t === "tratoHE" && c.overtimeHours > 0)
        ? ` (${fmtNumber(c.overtimeHours)} HE)`
        : "";
      // En cosecha y trato la cantidad va arriba y el monto abajo, chico y
      // gris; en el resto el monto es la línea principal, más grande y oscura.
      const isMainLine = t !== "cosecha" && t !== "trato";
      const fontSize = isMainLine ? 11 : 9;
      const fontWeight = isMainLine ? 600 : 400;
      lines.push(
        <div key="amt" style={{ fontSize, fontWeight, color: isMainLine ? "#000" : "#555" }}>
          {fmtCurrency(c.amount)}{heSuffix}
        </div>,
      );
    }
    return <>{lines}</>;
  };

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{titles?.main || "DETALLE DE JORNADA"}</div>
          {titles?.subtitle && <div style={{ fontSize: 12, color: "#555" }}>{titles.subtitle}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{displayName}</div>
          <div style={{ fontSize: 11, color: "#555" }}>
            {workers.length} trabajador{workers.length === 1 ? "" : "es"} · {dates.length} día{dates.length === 1 ? "" : "s"} · {unit}
          </div>
        </div>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#9dc3e6" }}>
              <th style={cellH}>Trabajador</th>
              {dates.map((d) => {
                const isRed = redDates.has(d);
                const cellStyle = {
                  ...cellH,
                  textAlign: "center",
                  minWidth: 70,
                  ...(isRed ? { background: "#ffc7ce", color: "#9c0006" } : {}),
                };
                return (
                  <th key={d} style={cellStyle}>
                    <div>{dateLabel(d)}</div>
                    {(() => {
                      // Precio + unidad configurado para ese día (ej. "$300/árbol",
                      // "$45/saco"). Vacío si no hay precio o si es tratoHE.
                      const priceLine = formatLaborDayPrice(labor, d, dayPrices, catalogs);
                      if (!priceLine) return null;
                      return (
                        <div style={{ fontSize: 9, fontWeight: 400, color: "#555", marginTop: 2 }}>
                          {priceLine}
                        </div>
                      );
                    })()}
                  </th>
                );
              })}
              <th style={{ ...cellH, textAlign: "right", background: "#7eb0d8", whiteSpace: "nowrap" }}>Total {unit}</th>
              {labor?.type === "tratoHE" && (
                <th style={{ ...cellH, textAlign: "right", background: "#7eb0d8", whiteSpace: "nowrap" }}>Total HE</th>
              )}
              <th style={{ ...cellH, textAlign: "right", background: "#7eb0d8", whiteSpace: "nowrap" }}>Total $</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.rut}>
                <td style={{ ...cell, fontWeight: 600 }}>
                  <div>{w.name}</div>
                  <div style={{ fontSize: 9, color: "#777", fontFamily: "ui-monospace, monospace" }}>{w.rut}</div>
                </td>
                {dates.map((d) => (
                  <td key={d} style={{ ...cell, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                    {renderCell(w.byDate.get(d))}
                  </td>
                ))}
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {labor?.type === "tratoHE"
                    ? fmtNumber(w.totals.jornadas)
                    : fmtNumber(w.totals.qty)}
                </td>
                {labor?.type === "tratoHE" && (
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {w.totals.overtimeHours > 0 ? `${fmtNumber(w.totals.overtimeHours)} HE` : ""}
                  </td>
                )}
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(w.totals.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#c6efce", fontWeight: 700 }}>
              <td style={{ ...cell, fontWeight: 700 }}>Total día</td>
              {dates.map((d) => {
                const t = dayTotals.get(d);
                const lt = labor?.type;
                const isHE = lt === "tratoHE";
                // Cosecha, trato y tratoEtapas muestran la cantidad arriba;
                // tratoHE, main, supervision y extra solo el monto (las
                // jornadas van en la columna Total de la derecha).
                const showQty = lt === "cosecha" || lt === "trato" || lt === "tratoEtapas";
                const amtLine = isHE && t.overtimeHours > 0
                  ? `${fmtCurrency(t.amount)} (${fmtNumber(t.overtimeHours)} HE)`
                  : fmtCurrency(t.amount);
                return (
                  <td key={d} style={{ ...cell, textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {showQty && <div>{fmtNumber(t.qty)}</div>}
                    <div style={{ fontSize: showQty ? 9 : 11, color: "#333" }}>{amtLine}</div>
                  </td>
                );
              })}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {labor?.type === "tratoHE"
                  ? fmtNumber(grand.jornadas)
                  : fmtNumber(grand.qty)}
              </td>
              {labor?.type === "tratoHE" && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {grand.overtimeHours > 0 ? `${fmtNumber(grand.overtimeHours)} HE` : ""}
                </td>
              )}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(grand.amount)}
              </td>
            </tr>
          {anyPiso && grand.pisoAmount > 0 && (
            <tr style={{ background: "#fce4d6" }}>
              <td style={{ ...cell, fontWeight: 700, color: "#b45309" }} colSpan={dates.length + 1}>
                🪙 Total pisos
              </td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" }}>—</td>
              {labor?.type === "tratoHE" && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" }}>—</td>
              )}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(grand.pisoAmount)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </>
  );
}
