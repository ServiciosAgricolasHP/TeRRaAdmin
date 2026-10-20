import { useMemo } from "react";
import { tratoUnitLabel } from "../../utils/cosechaCombos";
import { fmtCurrency } from "../../utils/format";
import { dateLabel, fmtNumber } from "./helpers";
import { StatusPill } from "./StatusPill";
import { cellH, cell, STATUS_STYLES } from "./styles";

// ============================================================
// LinearTable — vista lineal del resumen del trabajador
// ============================================================
// Aplana los días de todos los ciclos (abiertos, y cerrados dentro del rango
// si está activo) en una sola tabla cronológica con columna `Ciclo`.
//
// Una columna (kilos / jornadas / HE / trato / piso) se muestra si al menos
// una fila la tiene. Su rótulo de unidad es el del primer ciclo que tenga la
// columna: si los ciclos usan unidades distintas, la columna las mezcla bajo
// ese rótulo.
export function LinearTable({ data, catalogs, onToggleHidden }) {

  const flat = useMemo(() => {
    const out = [];
    for (const d of data) {
      const cycleLabel = d.cycle?.label || "";
      const cycleHeader = [d.job?.name, d.subjob?.name, cycleLabel].filter(Boolean).join(" · ");
      for (const r of d.rows) {
        out.push({ ...r, cycleId: d.cycle?.id, cycleLabel, cycleHeader, isClosed: d.isClosed });
      }
    }
    out.sort((a, b) => String(a.date || "").localeCompare(String(b.date || "")));
    return out;
  }, [data]);

  const cols = useMemo(() => ({
    harvestQty: flat.some((r) => (r.harvestQty || 0) > 0),
    workdayCount: flat.some((r) => (r.workdayCount || 0) > 0),
    overtime: flat.some((r) => (r.overtimeHours || 0) > 0),
    piecework: flat.some((r) => (r.pieceworkQty || 0) > 0),
    floor: flat.some((r) => (r.floor || 0) > 0),
  }), [flat]);

  const harvestLabel = useMemo(() => {
    const d = data.find((d) => d.cols?.harvestQty);
    return d?.harvestLabel || "Unid.";
  }, [data]);
  const pieceworkLabel = useMemo(() => {
    const d = data.find((d) => d.cols?.piecework);
    return d?.pieceworkLabel || "Trato";
  }, [data]);

  const totals = useMemo(() => flat.reduce(
    (acc, r) => ({
      harvestQty: acc.harvestQty + (r.harvestQty || 0),
      workdayCount: acc.workdayCount + (r.workdayCount || 0),
      overtimeHours: acc.overtimeHours + (r.overtimeHours || 0),
      overtimeAmount: acc.overtimeAmount + (r.overtimeAmount || 0),
      pieceworkQty: acc.pieceworkQty + (r.pieceworkQty || 0),
      floor: acc.floor + (r.floor || 0),
      amount: acc.amount + (r.amount || 0),
    }),
    { harvestQty: 0, workdayCount: 0, overtimeHours: 0, overtimeAmount: 0, pieceworkQty: 0, floor: 0, amount: 0 },
  ), [flat]);
  // Desglose por estado para el pie, con el mismo criterio que la vista por ciclo.
  const totalsByStatus = useMemo(() => {
    const acc = { paid: 0, in_pending: 0, unpaid: 0 };
    for (const r of flat) {
      const s = r.paymentStatus || "unpaid";
      acc[s] = (acc[s] || 0) + (r.amount || 0) + (r.floor || 0);
    }
    return acc;
  }, [flat]);
  const statusesPresent = ["paid", "in_pending", "unpaid"].filter((s) => (totalsByStatus[s] || 0) > 0);
  const showStatusSplit = statusesPresent.length > 1;

  if (flat.length === 0) return null;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ background: "#ffffff", padding: 12 }}>
        <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#9dc3e6" }}>
              <th style={cellH}>Fecha</th>
              <th style={cellH}>Ciclo</th>
              <th style={cellH}>Detalle Jornada</th>
              {cols.harvestQty && <th style={{ ...cellH, textAlign: "right" }}>{harvestLabel}</th>}
              {cols.workdayCount && <th style={{ ...cellH, textAlign: "right" }}>Jornadas</th>}
              {cols.overtime && <th style={{ ...cellH, textAlign: "right" }}>HE</th>}
              {cols.piecework && <th style={{ ...cellH, textAlign: "right" }}>{pieceworkLabel}</th>}
              {cols.floor && <th style={{ ...cellH, textAlign: "right" }}>Piso</th>}
              <th style={{ ...cellH, textAlign: "right" }}>Total</th>
              <th style={{ ...cellH, textAlign: "center" }}>Estado</th>
              {onToggleHidden && <th data-export-hide style={{ ...cellH, width: 44 }}>Filtrar</th>}
            </tr>
          </thead>
          <tbody>
            {flat.map((r, i) => (
              <tr key={i}>
                <td style={cell}>{dateLabel(r.date)}</td>
                <td style={{ ...cell, fontSize: 11, color: r.isClosed ? "#888" : "#000" }}>
                  {r.cycleLabel}
                  {r.isClosed && <span style={{ marginLeft: 4, fontSize: 9, color: "#888" }}>(cerrado)</span>}
                </td>
                <td style={cell}>{r.laborName}</td>
                {cols.harvestQty && (
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {(r.harvestQty || 0) > 0 ? fmtNumber(r.harvestQty) : ""}
                  </td>
                )}
                {cols.workdayCount && (
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {(r.workdayCount || 0) > 0 ? fmtNumber(r.workdayCount) : ""}
                  </td>
                )}
                {cols.overtime && (
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {(r.overtimeHours || 0) > 0
                      ? `${fmtNumber(r.overtimeHours)}h · ${fmtCurrency(r.overtimeAmount || 0)}`
                      : ""}
                  </td>
                )}
                {cols.piecework && (
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                    {(r.pieceworkQty || 0) > 0 ? (
                      <>
                        <div>{fmtNumber(r.pieceworkQty)}</div>
                        {(() => {
                          const u = r.pieceworkUnit;
                          const defaultLbl = u != null ? tratoUnitLabel(catalogs, u) : null;
                          const items = (r.pieceworkBreakdown && r.pieceworkBreakdown.length > 0)
                            ? r.pieceworkBreakdown.map((b) => {
                                const bu = b.unit;
                                const lbl = bu != null ? tratoUnitLabel(catalogs, bu) : defaultLbl;
                                const tag = b.tag || lbl || `T${(b.tierIdx || 0) + 1}`;
                                const rate = b.qty > 0 ? Math.round(b.amount / b.qty) : 0;
                                return { tag, qty: b.qty, rate, amount: b.amount };
                              })
                            : ((r.amount || 0) > 0
                                ? [{
                                    tag: defaultLbl || "trato",
                                    qty: r.pieceworkQty,
                                    rate: Math.round((r.amount || 0) / r.pieceworkQty),
                                    amount: r.amount || 0,
                                  }]
                                : []);
                          if (items.length === 0) return null;
                          return (
                            <div style={{ fontSize: 10, color: "#888", fontWeight: 400, lineHeight: 1.35 }}>
                              {items.map((it, j) => (
                                <div key={j}>
                                  {it.tag}: {fmtNumber(it.qty)} × {fmtCurrency(it.rate)} = {fmtCurrency(it.amount)}
                                </div>
                              ))}
                            </div>
                          );
                        })()}
                      </>
                    ) : ""}
                  </td>
                )}
                {cols.floor && (
                  <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: (r.floor || 0) > 0 ? "#b45309" : "#999" }}>
                    {(r.floor || 0) > 0 ? fmtCurrency(r.floor) : ""}
                  </td>
                )}
                <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency((r.amount || 0) + (r.floor || 0))}
                </td>
                <td style={{ ...cell, textAlign: "center" }}>
                  <StatusPill status={r.paymentStatus} payrollNames={r.payrollNames} />
                </td>
                {onToggleHidden && (
                  <td data-export-hide style={{ ...cell, textAlign: "center", padding: 2 }}>
                    <button
                      type="button"
                      onClick={() => onToggleHidden(r.rowKey)}
                      title="Sacar este día del resumen (solo visual, no toca los datos)"
                      style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, padding: 2, color: "#6b7280", lineHeight: 1 }}
                    >
                      👁
                    </button>
                  </td>
                )}
              </tr>
            ))}
            <tr style={{ background: "#c6efce" }}>
              <td style={cell}></td>
              <td style={cell}></td>
              <td style={{ ...cell, fontWeight: 700 }}>TOTAL</td>
              {cols.harvestQty && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtNumber(totals.harvestQty)}
                </td>
              )}
              {cols.workdayCount && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtNumber(totals.workdayCount)}
                </td>
              )}
              {cols.overtime && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtNumber(totals.overtimeHours)}h · {fmtCurrency(totals.overtimeAmount)}
                </td>
              )}
              {cols.piecework && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtNumber(totals.pieceworkQty)}
                </td>
              )}
              {cols.floor && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#b45309" }}>
                  {fmtCurrency(totals.floor)}
                </td>
              )}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(totals.amount + totals.floor)}
              </td>
              <td style={cell}></td>
              {onToggleHidden && <td data-export-hide style={cell}></td>}
            </tr>
            {showStatusSplit && (
              <tr style={{ background: "#f9fafb" }}>
                <td style={cell} colSpan={3 + (cols.harvestQty ? 1 : 0) + (cols.workdayCount ? 1 : 0) + (cols.overtime ? 1 : 0) + (cols.piecework ? 1 : 0) + (cols.floor ? 1 : 0) + 1 + 1 + (onToggleHidden ? 1 : 0)}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "flex-end", fontSize: 10 }}>
                    {statusesPresent.map((s) => (
                      <span key={s} style={{ color: STATUS_STYLES[s].color, fontWeight: 600 }}>
                        {STATUS_STYLES[s].label}: {fmtCurrency(totalsByStatus[s])}
                      </span>
                    ))}
                  </div>
                </td>
              </tr>
            )}
          </tbody>
        </table>
        </div>
      </div>
    </div>
  );
}
