import { forwardRef } from "react";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { pCellH, pCell } from "./printStyles";

// Printable de una sola contraparte (resumen individual). Se renderiza uno por
// grupo, fuera de pantalla, para copiar, descargar o imprimir cada uno por
// separado.
export const PrintableRetencionesGroup = forwardRef(function PrintableRetencionesGroup(
  { group, company, periodo },
  ref,
) {
  const periodLabel = periodo || "Todos los períodos";
  const docs = [...(group.docs || [])].sort(
    (a, b) => String(a.fechaEmision || "").localeCompare(String(b.fechaEmision || "")),
  );
  return (
    <div
      ref={ref}
      style={{
        background: "#ffffff",
        color: "#000",
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        minWidth: 720,
      }}
    >
      <div style={{ marginBottom: 4, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14, textTransform: "uppercase" }}>
          RETENCIÓN — {(company?.alias || company?.razonSocial || "—").toString().toUpperCase()}
        </div>
        <div style={{ fontSize: 12, color: "#444" }}>{periodLabel}</div>
      </div>
      <div style={{ marginBottom: 8, fontSize: 12 }}>
        <b>{group.razon || "—"}</b>
        <span style={{ marginLeft: 8, color: "#555" }}>RUT {formatRutForDisplay(group.rut) || "—"}</span>
        <span style={{ marginLeft: 8, color: "#555" }}>· {group.count} factura{group.count === 1 ? "" : "s"}</span>
      </div>
      {/* Banner IVA retenido de la contraparte — destacado para que el dato
          clave (cuánto IVA retuvo este cliente en el período) salte a la vista. */}
      <div style={{
        marginBottom: 10, padding: "8px 12px", background: "#fff4ce",
        border: "2px solid #f4b400", borderRadius: 6,
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          IVA retenido · {periodLabel}
        </div>
        <div style={{ fontSize: 18, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {fmtCurrency(group.iva)}
        </div>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#92d050" }}>
            <th style={{ ...pCellH, width: 90 }}>FECHA</th>
            <th style={pCellH}>DOCUMENTO</th>
            <th style={{ ...pCellH, textAlign: "right", width: 80 }}>FOLIO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>NETO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>IVA RETENIDO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {docs.map((d) => (
            <tr key={d.id}>
              <td style={{ ...pCell, fontVariantNumeric: "tabular-nums" }}>{d.fechaEmision || "—"}</td>
              <td style={pCell}>{d.tipoLabel || dteTypeLabel(d.tipo)}</td>
              <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.folio}</td>
              <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(d.neto)}</td>
              <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{fmtCurrency(d.iva)}</td>
              <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(d.total)}</td>
            </tr>
          ))}
          <tr style={{ background: "#c6efce" }}>
            <td style={{ ...pCell, fontWeight: 700 }} colSpan={3}>TOTAL ({group.count})</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(group.neto)}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(group.iva)}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(group.total)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
});
