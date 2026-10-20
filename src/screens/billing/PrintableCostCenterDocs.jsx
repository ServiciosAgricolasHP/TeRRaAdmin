import { forwardRef } from "react";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { CREDIT_NOTE_TYPES } from "../../utils/cashFlowProjection";
import { fmtCurrency } from "../../utils/format";
import { todayIso } from "./docs";
import { pCellH, pCell } from "./printStyles";

// Printable de la vista global de un centro de costo: sin controles, con el
// mismo estilo tipo Excel del resto de los exports del proyecto.
export const PrintableCostCenterDocs = forwardRef(function PrintableCostCenterDocs(
  { label, docs, totals, informalTotal = 0, informalCount = 0, companiesById },
  ref,
) {
  const today = todayIso();
  const realCount = docs.filter((d) => !d.__informal).length;
  return (
    <div ref={ref} style={{ background: "#fff", padding: 20, width: 1400, fontFamily: "ui-sans-serif, system-ui, sans-serif", color: "#000" }}>
      <div style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>CENTRO DE COSTO — {label}</div>
      <div style={{ fontSize: 12, color: "#555", marginBottom: 10 }}>
        Generado {today} · {realCount} documento{realCount === 1 ? "" : "s"} · Neto {fmtCurrency(totals.neto)} · IVA {fmtCurrency(totals.iva)} · Total {fmtCurrency(totals.total)}
        {informalCount > 0 && (
          <> · + {informalCount} gasto{informalCount === 1 ? "" : "s"} informal{informalCount === 1 ? "" : "es"} {fmtCurrency(informalTotal)} · Total combinado {fmtCurrency(totals.total + informalTotal)}</>
        )}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#92d050" }}>
            <th style={pCellH}>Fecha</th>
            <th style={pCellH}>Empresa</th>
            <th style={pCellH}>Mov.</th>
            <th style={pCellH}>Documento</th>
            <th style={{ ...pCellH, textAlign: "right" }}>Folio</th>
            <th style={pCellH}>Contraparte</th>
            <th style={pCellH}>RUT</th>
            <th style={{ ...pCellH, textAlign: "right" }}>Neto</th>
            <th style={{ ...pCellH, textAlign: "right" }}>IVA</th>
            <th style={{ ...pCellH, textAlign: "right" }}>Total</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => {
            if (d.__informal) {
              const company = companiesById.get(d.companyId);
              return (
                <tr key={`inf_${d.id}`} style={{ background: "#fdf3e2" }}>
                  <td style={{ ...pCell, fontVariantNumeric: "tabular-nums" }}>{d.date || "—"}</td>
                  <td style={pCell}>{company?.alias || company?.razonSocial || "—"}</td>
                  <td style={{ ...pCell, color: "#b8860b" }}>Informal</td>
                  <td style={pCell}>—</td>
                  <td style={{ ...pCell, textAlign: "right" }}>—</td>
                  <td style={pCell}>{d.detail || "—"}</td>
                  <td style={pCell}>—</td>
                  <td style={{ ...pCell, textAlign: "right" }}>—</td>
                  <td style={{ ...pCell, textAlign: "right" }}>—</td>
                  <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600 }}>{fmtCurrency(d.amount)}</td>
                </tr>
              );
            }
            const isNC = CREDIT_NOTE_TYPES.has(Number(d.tipo));
            const sign = isNC ? "−" : "";
            const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
            const rut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
            const company = companiesById.get(d.companyId);
            const ncColor = isNC ? { color: "#cc0000" } : null;
            return (
              <tr key={d.id}>
                <td style={{ ...pCell, fontVariantNumeric: "tabular-nums" }}>{d.fechaEmision || "—"}</td>
                <td style={pCell}>{company?.alias || company?.razonSocial || "—"}</td>
                <td style={pCell}>{d.kind === "venta" ? "Venta" : "Compra"}</td>
                <td style={{ ...pCell, ...(ncColor || {}) }}>{d.tipoLabel || dteTypeLabel(d.tipo)}</td>
                <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.folio}</td>
                <td style={pCell}>{razon || "—"}</td>
                <td style={{ ...pCell, fontVariantNumeric: "tabular-nums" }}>{formatRutForDisplay(rut) || "—"}</td>
                <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", ...(ncColor || {}) }}>{sign}{fmtCurrency(d.neto)}</td>
                <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", ...(ncColor || {}) }}>{sign}{fmtCurrency(d.iva)}</td>
                <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, ...(ncColor || {}) }}>{sign}{fmtCurrency(d.total)}</td>
              </tr>
            );
          })}
          <tr style={{ background: "#c6efce" }}>
            <td style={{ ...pCell, fontWeight: 700 }} colSpan={7}>TOTAL</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totals.neto)}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totals.iva)}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totals.total)}</td>
          </tr>
          {informalCount > 0 && (
            <>
              <tr style={{ background: "#fdf3e2" }}>
                <td style={{ ...pCell, fontWeight: 700 }} colSpan={9}>GASTOS INFORMALES ({informalCount})</td>
                <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(informalTotal)}</td>
              </tr>
              <tr style={{ background: "#c6efce" }}>
                <td style={{ ...pCell, fontWeight: 700 }} colSpan={9}>TOTAL COMBINADO</td>
                <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totals.total + informalTotal)}</td>
              </tr>
            </>
          )}
        </tbody>
      </table>
    </div>
  );
});
