import React, { forwardRef } from "react";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { pCellH, pCell } from "./printStyles";

// Printable de Retenciones para captura (html-to-image, impresión, PNG), sin
// selects ni controles interactivos. Muestra el IVA retenido del período y dos
// secciones: (1) resumen por contraparte y (2) detalle de cada factura
// agrupada por contraparte con subtotales. Estilo tipo Excel (verde #92d050
// en el encabezado, verde claro #c6efce en totales, verde muy claro #e2efda
// en el encabezado de cada grupo).
export const PrintableRetenciones = forwardRef(function PrintableRetenciones(
  { groups, company, periodo, totals },
  ref,
) {
  const periodLabel = periodo || "Todos los períodos";
  const totalCount = groups.reduce((s, g) => s + g.count, 0);
  const totalNeto = groups.reduce((s, g) => s + (Number(g.neto) || 0), 0);
  const totalIva = totals?.netOnlyIva ?? groups.reduce((s, g) => s + (Number(g.iva) || 0), 0);
  const totalTotal = totals?.netOnlyTotal ?? groups.reduce((s, g) => s + (Number(g.total) || 0), 0);
  // Ordena los docs de cada grupo por fecha ascendente.
  const groupsSorted = groups.map((g) => ({
    ...g,
    docs: [...g.docs].sort((a, b) => String(a.fechaEmision || "").localeCompare(String(b.fechaEmision || ""))),
  }));
  return (
    <div
      ref={ref}
      style={{
        background: "#ffffff",
        color: "#000",
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        minWidth: 820,
      }}
    >
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, textTransform: "uppercase" }}>
          RETENCIONES — {(company?.alias || company?.razonSocial || "—").toString().toUpperCase()}
        </div>
        <div style={{ fontSize: 12, color: "#444" }}>{periodLabel}</div>
      </div>
      <div style={{ marginBottom: 8, fontSize: 11, color: "#444" }}>
        Facturas con estado <b>"Solo neto"</b> agrupadas por contraparte (cliente que retuvo el IVA).
      </div>

      {/* Banner explícito con el IVA retenido del período — el dato más
          importante de la vista, destacado para no perderse entre las tablas. */}
      <div style={{
        marginBottom: 12, padding: "10px 14px", background: "#fff4ce",
        border: "2px solid #f4b400", borderRadius: 6,
        display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 16,
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          IVA retenido en el período {periodLabel}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>
          {fmtCurrency(totalIva)}
        </div>
      </div>

      {/* ===== Sección 1: Resumen por contraparte ===== */}
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#92d050" }}>
            <th style={{ ...pCellH, width: 32, textAlign: "center" }}>#</th>
            <th style={pCellH}>EMPRESA</th>
            <th style={pCellH}>RUT</th>
            <th style={{ ...pCellH, textAlign: "right" }}>N° FAC.</th>
            <th style={{ ...pCellH, textAlign: "right" }}>NETO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>IVA RETENIDO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>TOTAL</th>
          </tr>
        </thead>
        <tbody>
          {groupsSorted.length === 0 ? (
            <tr>
              <td style={pCell} colSpan={7}>(sin retenciones para mostrar)</td>
            </tr>
          ) : (
            groupsSorted.map((g, i) => (
              <tr key={g.rut || `i${i}`}>
                <td style={{ ...pCell, textAlign: "center" }}>{i + 1}</td>
                <td style={pCell}>{g.razon || "—"}</td>
                <td style={pCell}>{formatRutForDisplay(g.rut) || "—"}</td>
                <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{g.count}</td>
                <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(g.neto)}</td>
                <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{fmtCurrency(g.iva)}</td>
                <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(g.total)}</td>
              </tr>
            ))
          )}
          <tr style={{ background: "#c6efce" }}>
            <td style={{ ...pCell, fontWeight: 700 }} colSpan={3}>TOTAL</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{totalCount}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totalNeto)}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totalIva)}</td>
            <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totalTotal)}</td>
          </tr>
        </tbody>
      </table>

      {/* ===== Sección 2: Detalle de cada factura por contraparte ===== */}
      {groupsSorted.length > 0 && (
        <>
          <div style={{ marginTop: 18, marginBottom: 6, fontWeight: 700, fontSize: 13, textTransform: "uppercase" }}>
            Detalle de facturas
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
              {groupsSorted.map((g, gi) => (
                <React.Fragment key={`d_${g.rut || gi}`}>
                  <tr style={{ background: "#e2efda" }}>
                    <td style={{ ...pCell, fontWeight: 700 }} colSpan={6}>
                      {gi + 1}. {g.razon || "—"}
                      <span style={{ marginLeft: 8, fontWeight: 400, color: "#555" }}>
                        · {formatRutForDisplay(g.rut) || "—"}
                      </span>
                      <span style={{ marginLeft: 8, fontWeight: 400, color: "#555" }}>
                        · {g.count} factura{g.count === 1 ? "" : "s"}
                      </span>
                    </td>
                  </tr>
                  {g.docs.map((d) => (
                    <tr key={d.id}>
                      <td style={{ ...pCell, fontVariantNumeric: "tabular-nums" }}>{d.fechaEmision || "—"}</td>
                      <td style={pCell}>{d.tipoLabel || dteTypeLabel(d.tipo)}</td>
                      <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.folio}</td>
                      <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(d.neto)}</td>
                      <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 800 }}>{fmtCurrency(d.iva)}</td>
                      <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(d.total)}</td>
                    </tr>
                  ))}
                  <tr style={{ background: "#f2f2f2" }}>
                    <td style={{ ...pCell, fontWeight: 700 }} colSpan={3}>Subtotal</td>
                    <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(g.neto)}</td>
                    <td style={{ ...pCell, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(g.iva)}</td>
                    <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(g.total)}</td>
                  </tr>
                </React.Fragment>
              ))}
              <tr style={{ background: "#c6efce" }}>
                <td style={{ ...pCell, fontWeight: 700 }} colSpan={3}>TOTAL GENERAL</td>
                <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totalNeto)}</td>
                <td style={{ ...pCell, textAlign: "right", fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totalIva)}</td>
                <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totalTotal)}</td>
              </tr>
            </tbody>
          </table>
        </>
      )}
    </div>
  );
});
