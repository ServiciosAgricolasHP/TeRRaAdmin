import { forwardRef } from "react";
import { fmtCurrency } from "../../utils/format";
import { cellH, cell } from "./printStyles";
import { paymentSplit } from "./fortnights";

export const PrintableFortnightTable = forwardRef(function PrintableFortnightTable(
  { fortnight, items, carriersById },
  ref,
) {
  const tripsCount = items.reduce((s, it) => s + (it.tripIds || []).length, 0);
  const total = items.reduce((s, it) => s + (Number(it.total) || 0), 0);
  // Mismo reparto que el detalle de la quincena: los abonos cuentan como pagado,
  // y cada fila dice lo abonado y lo pendiente de su transportista.
  const totalPaid = items.reduce((s, it) => s + paymentSplit(it).paid, 0);
  const totalPending = items.reduce((s, it) => s + paymentSplit(it).pending, 0);
  const pendingCount = items.filter((it) => it.status !== "paid").length;
  const isPaid = fortnight.status === "paid";
  const period = (fortnight.periodFrom || fortnight.periodTo)
    ? `${fortnight.periodFrom || "?"} → ${fortnight.periodTo || "?"}`
    : "—";
  return (
    <div ref={ref} style={{ background: "#ffffff", color: "#000", padding: 16, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, textTransform: "uppercase" }}>
          DETALLE QUINCENA — {fortnight.name}
        </div>
        <div style={{ fontSize: 12, color: "#444" }}>{period}</div>
      </div>
      <div style={{ marginBottom: 8, display: "flex", gap: 12, fontSize: 12, color: "#000" }}>
        <span><strong>Total:</strong> {fmtCurrency(total)}</span>
        {!isPaid && totalPending > 0 && totalPaid > 0 && (
          <>
            <span style={{ color: "#a16207" }}>
              <strong>Pendiente ({pendingCount}):</strong> {fmtCurrency(totalPending)}
            </span>
            <span style={{ color: "#15803d" }}>
              <strong>Pagado y abonado:</strong> {fmtCurrency(totalPaid)}
            </span>
          </>
        )}
        {isPaid && <span style={{ color: "#15803d", fontWeight: 700 }}>QUINCENA PAGADA</span>}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#92d050" }}>
            <th style={{ ...cellH, width: 36, textAlign: "center" }}>#</th>
            <th style={cellH}>TRANSPORTISTA</th>
            <th style={{ ...cellH, textAlign: "center" }}>VUELTAS</th>
            <th style={cellH}>PERÍODO</th>
            <th style={cellH}>ESTADO</th>
            <th style={{ ...cellH, textAlign: "right" }}>TOTAL</th>
            <th style={{ ...cellH, textAlign: "right" }}>ABONADO</th>
            <th style={{ ...cellH, textAlign: "right" }}>PENDIENTE</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => {
            const carrier = carriersById.get(it.carrierId);
            const itemPeriod = (it.periodFrom || it.periodTo) ? `${it.periodFrom || "?"} → ${it.periodTo || "?"}` : "—";
            const itemPaid = it.status === "paid";
            const split = paymentSplit(it);
            const withAbonos = !itemPaid && split.paid > 0;
            return (
              <tr key={it.id} style={itemPaid ? { background: "#f3f4f6", color: "#6b7280" } : undefined}>
                <td style={{ ...cell, textAlign: "center" }}>{i + 1}</td>
                <td style={cell}>{carrier?.alias || it.carrierId}</td>
                <td style={{ ...cell, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{(it.tripIds || []).length}</td>
                <td style={cell}>{itemPeriod}</td>
                <td style={{ ...cell, fontWeight: itemPaid ? 700 : 400, color: itemPaid ? "#15803d" : "#a16207" }}>
                  {itemPaid ? "Pagado" : withAbonos ? "Con abonos" : "Pendiente"}
                </td>
                <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(it.total)}</td>
                <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(split.paid)}</td>
                <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: split.pending > 0 ? 700 : 400, color: split.pending > 0 ? "#a16207" : undefined }}>
                  {fmtCurrency(split.pending)}
                </td>
              </tr>
            );
          })}
          <tr style={{ background: "#c6efce" }}>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>TOTAL</td>
            <td style={{ ...cell, textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{tripsCount}</td>
            <td style={cell} colSpan={2}></td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(total)}</td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totalPaid)}</td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: totalPending > 0 ? "#a16207" : undefined }}>
              {fmtCurrency(totalPending)}
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});
