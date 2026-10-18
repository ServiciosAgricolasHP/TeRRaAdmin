import { forwardRef } from "react";
import { fmtCurrency } from "../../utils/format";
import { MONTH_NAMES_ES } from "./docs";
import { pCellH, pCell } from "./printStyles";

// Printable del Resumen anual (fuera de pantalla, fondo blanco). Misma tabla
// mensual que la vista en pantalla, con el balance de IVA arriba como
// métricas explícitas. El IVA a pagar = débito − crédito.
export const PrintableResumen = forwardRef(function PrintableResumen(
  { data, year, company },
  ref,
) {
  const { months, total } = data;
  const ivaAnual = total.ivaDebito - total.ivaCredito;
  const metric = (label, value, opts = {}) => (
    <div style={{ border: "1px solid #999", borderRadius: 6, padding: "8px 10px", background: opts.bg || "#f7f7f7", minWidth: 150 }}>
      <div style={{ fontSize: 11, color: "#555" }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 700, color: opts.color || "#000" }}>{value}</div>
    </div>
  );
  return (
    <div
      ref={ref}
      style={{
        background: "#ffffff",
        color: "#000",
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        minWidth: 1000,
      }}
    >
      <div style={{ marginBottom: 6, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>
        Resumen {year} — {(company?.alias || company?.razonSocial || "—").toString().toUpperCase()}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
        {metric("IVA Débito (ventas)", fmtCurrency(total.ivaDebito))}
        {metric("IVA Crédito (compras)", fmtCurrency(total.ivaCredito))}
        {metric(
          ivaAnual >= 0 ? "IVA a pagar (año)" : "IVA a favor (remanente)",
          fmtCurrency(Math.abs(ivaAnual)),
          { bg: "#fff4ce", color: ivaAnual < 0 ? "#1f7a1f" : "#000" },
        )}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#92d050" }}>
            <th style={pCellH}>MES</th>
            <th style={{ ...pCellH, textAlign: "right" }}>VENTAS NETO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>IVA DÉBITO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>COMPRAS NETO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>IVA CRÉDITO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>IVA A PAGAR</th>
          </tr>
        </thead>
        <tbody>
          {months.map((m, idx) => {
            const ivaMes = m.ivaDebito - m.ivaCredito;
            const numCell = { ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" };
            return (
              <tr key={idx}>
                <td style={pCell}>{MONTH_NAMES_ES[idx]}</td>
                <td style={numCell}>{fmtCurrency(m.ventasNeto)}</td>
                <td style={numCell}>{fmtCurrency(m.ivaDebito)}</td>
                <td style={numCell}>{fmtCurrency(m.comprasNeto)}</td>
                <td style={numCell}>{fmtCurrency(m.ivaCredito)}</td>
                <td style={{ ...numCell, fontWeight: 700, color: ivaMes < 0 ? "#1f7a1f" : "#000" }}>{fmtCurrency(ivaMes)}</td>
              </tr>
            );
          })}
          <tr style={{ background: "#c6efce" }}>
            <td style={{ ...pCell, fontWeight: 700 }}>TOTAL {year}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(total.ventasNeto)}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(total.ivaDebito)}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(total.comprasNeto)}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(total.ivaCredito)}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: ivaAnual < 0 ? "#1f7a1f" : "#000" }}>{fmtCurrency(ivaAnual)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});
