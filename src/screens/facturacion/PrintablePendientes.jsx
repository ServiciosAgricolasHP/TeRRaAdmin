import React, { forwardRef } from "react";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { todayIso, PENDIENTE_CATS } from "./docs";
import { pCellH, pCell } from "./printStyles";

// Printable de pendientes, sin controles. Agrupa por categoría con un
// subencabezado de color y un subtotal por categoría, con el mismo estilo
// tipo Excel del resto de los exports del proyecto.
export const PrintablePendientes = forwardRef(function PrintablePendientes(
  { items, byCategory, totals, company },
  ref,
) {
  const today = todayIso();
  return (
    <div
      ref={ref}
      style={{
        background: "#ffffff",
        color: "#000",
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        minWidth: 900,
      }}
    >
      <div style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, textTransform: "uppercase" }}>
          PENDIENTES — {(company?.alias || company?.razonSocial || "—").toString().toUpperCase()}
        </div>
        <div style={{ fontSize: 12, color: "#444" }}>{today}</div>
      </div>
      <div style={{ marginBottom: 8, fontSize: 11, color: "#444" }}>
        {items.length} factura{items.length === 1 ? "" : "s"} con saldo pendiente. Desglose por tipo.
      </div>

      {/* Banner total pendiente */}
      <div style={{
        marginBottom: 12, padding: "10px 14px", background: "#fff4ce",
        border: "2px solid #f4b400", borderRadius: 6,
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          TOTAL PENDIENTE
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {fmtCurrency(totals.total)}
        </div>
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#92d050" }}>
            <th style={{ ...pCellH, width: 90 }}>FECHA</th>
            <th style={pCellH}>DOCUMENTO</th>
            <th style={{ ...pCellH, textAlign: "right", width: 70 }}>FOLIO</th>
            <th style={pCellH}>CONTRAPARTE</th>
            <th style={pCellH}>RUT</th>
            <th style={{ ...pCellH, textAlign: "right" }}>TOTAL</th>
            <th style={{ ...pCellH, textAlign: "right" }}>PAGADO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>PENDIENTE</th>
          </tr>
        </thead>
        <tbody>
          {["full", "partial", "iva"].map((cat) => {
            const list = byCategory[cat];
            if (list.length === 0) return null;
            const meta = PENDIENTE_CATS[cat];
            return (
              <React.Fragment key={`pcat_${cat}`}>
                <tr style={{ background: meta.hex }}>
                  <td style={{ ...pCell, fontWeight: 700 }} colSpan={8}>
                    {meta.label}
                    <span style={{ marginLeft: 8, fontWeight: 400, color: "#444" }}>
                      · {list.length} factura{list.length === 1 ? "" : "s"}
                    </span>
                  </td>
                </tr>
                {list.map((d) => {
                  const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
                  const rut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
                  const paid = Number(d.amountPaid) || 0;
                  return (
                    <tr key={`p_${d.id}`}>
                      <td style={{ ...pCell, fontVariantNumeric: "tabular-nums" }}>{d.fechaEmision || "—"}</td>
                      <td style={pCell}>{d.tipoLabel || dteTypeLabel(d.tipo)}</td>
                      <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.folio}</td>
                      <td style={pCell}>{razon || "—"}</td>
                      <td style={{ ...pCell, fontVariantNumeric: "tabular-nums" }}>{formatRutForDisplay(rut) || "—"}</td>
                      <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(d.total)}</td>
                      <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#666" }}>{paid > 0 ? fmtCurrency(paid) : "—"}</td>
                      <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>{fmtCurrency(d._pending)}</td>
                    </tr>
                  );
                })}
                <tr style={{ background: "#f2f2f2" }}>
                  <td style={{ ...pCell, fontWeight: 700 }} colSpan={7}>Subtotal {meta.label}</td>
                  <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totals[cat])}</td>
                </tr>
              </React.Fragment>
            );
          })}
          <tr style={{ background: "#c6efce" }}>
            <td style={{ ...pCell, fontWeight: 700 }} colSpan={7}>TOTAL PENDIENTE</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totals.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});
