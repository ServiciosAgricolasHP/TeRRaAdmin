import React, { forwardRef } from "react";
import { dteTypeLabel } from "../../utils/siiCsvParser";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { CREDIT_NOTE_TYPES } from "../../utils/cashFlowProjection";
import { fmtCurrency } from "../../utils/format";
import { formatPeriodPretty, kindTitleLabel, groupDocsByCostCenter, NC_STATE, PAYMENT_STATUSES } from "./docs";
import { pCell, pCellH } from "./printStyles";

// Printable plano del listado de Facturas o Compras. Respeta los filtros y el
// orden que ya trae `docs` (el llamador pasa `sortedFiltered`). Las NC van en
// rojo y con signo "−" en los montos, como en el listado en pantalla.
export const PrintableDocList = forwardRef(function PrintableDocList(
  { kind, docs, company, periodo, totals, groupByCostCenter = false, costCentersById = new Map(), showEstado = true },
  ref,
) {
  const periodLabel = formatPeriodPretty(periodo);
  const kindTitle = kindTitleLabel(kind).toUpperCase();
  const contraLabel = kind === "venta" ? "Cliente" : "Proveedor";
  const groups = groupByCostCenter ? groupDocsByCostCenter(docs, kind, costCentersById) : null;

  // Columnas: Estado solo va en ventas (en compras no hay control de pago);
  // los colSpan dependen de eso.
  const colCount = showEstado ? 10 : 9;

  // Fila de un doc, compartida por la vista plana y la agrupada.
  const renderDocRow = (d) => {
    const isNC = CREDIT_NOTE_TYPES.has(Number(d.tipo));
    const sign = isNC ? "−" : "";
    const razon = d.kind === "venta" ? d.razonSocialReceptor : d.razonSocialEmisor;
    const rut = d.kind === "venta" ? d.rutReceptor : d.rutEmisor;
    const paid = Number(d.amountPaid) || 0;
    const estadoLabel = isNC
      ? NC_STATE.label
      : (PAYMENT_STATUSES[d.paymentStatus || "unpaid"]?.label || "—");
    const ncColor = isNC ? { color: "#cc0000" } : null;
    return (
      <tr key={d.id}>
        <td style={{ ...pCell, fontVariantNumeric: "tabular-nums" }}>{d.fechaEmision || "—"}</td>
        <td style={{ ...pCell, ...(ncColor || {}) }}>{d.tipoLabel || dteTypeLabel(d.tipo)}</td>
        <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{d.folio}</td>
        <td style={pCell}>{razon || "—"}</td>
        <td style={{ ...pCell, fontVariantNumeric: "tabular-nums" }}>{formatRutForDisplay(rut) || "—"}</td>
        <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", ...(ncColor || {}) }}>{sign}{fmtCurrency(d.neto)}</td>
        <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", ...(ncColor || {}) }}>{sign}{fmtCurrency(d.iva)}</td>
        <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", fontWeight: 600, ...(ncColor || {}) }}>{sign}{fmtCurrency(d.total)}</td>
        <td style={{ ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: paid > 0 ? "#000" : "#999" }}>{paid > 0 ? fmtCurrency(paid) : "—"}</td>
        {showEstado && (
          <td style={{ ...pCell, textAlign: "center", fontSize: 11, ...(isNC ? { color: "#cc0000", fontWeight: 600 } : {}) }}>
            {estadoLabel}
          </td>
        )}
      </tr>
    );
  };

  return (
    <div
      ref={ref}
      style={{
        background: "#ffffff",
        color: "#000",
        padding: 16,
        fontFamily: "ui-sans-serif, system-ui, sans-serif",
        minWidth: 1100,
      }}
    >
      <div style={{ marginBottom: 6, fontWeight: 700, fontSize: 16, textTransform: "uppercase" }}>
        {kindTitle} — {(company?.alias || company?.razonSocial || "—").toString().toUpperCase()} — {periodLabel.toUpperCase()}
      </div>
      <div style={{ marginBottom: 8, fontSize: 11, color: "#444" }}>
        {docs.length} documento{docs.length === 1 ? "" : "s"}
        {totals?.ncCount > 0 && (
          <span style={{ marginLeft: 8, color: "#cc0000" }}>
            · NC: {totals.ncCount} (−{fmtCurrency(totals.ncTotal)})
          </span>
        )}
        {groupByCostCenter && (
          <span style={{ marginLeft: 8 }}>· Agrupado por centro de costo</span>
        )}
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#92d050" }}>
            <th style={{ ...pCellH, width: 80 }}>FECHA</th>
            <th style={pCellH}>DOCUMENTO</th>
            <th style={{ ...pCellH, textAlign: "right", width: 60 }}>FOLIO</th>
            <th style={pCellH}>{contraLabel.toUpperCase()}</th>
            <th style={pCellH}>RUT</th>
            <th style={{ ...pCellH, textAlign: "right" }}>NETO</th>
            <th style={{ ...pCellH, textAlign: "right" }}>IVA</th>
            <th style={{ ...pCellH, textAlign: "right" }}>TOTAL</th>
            <th style={{ ...pCellH, textAlign: "right" }}>PAGADO</th>
            {showEstado && <th style={{ ...pCellH, textAlign: "center" }}>ESTADO</th>}
          </tr>
        </thead>
        <tbody>
          {docs.length === 0 && (
            <tr>
              <td style={pCell} colSpan={colCount}>(sin documentos para mostrar)</td>
            </tr>
          )}
          {/* Vista plana */}
          {docs.length > 0 && !groupByCostCenter && docs.map(renderDocRow)}
          {/* Vista agrupada por centro de costo */}
          {docs.length > 0 && groupByCostCenter && groups.map((g) => (
            <React.Fragment key={`g_${g.key}`}>
              <tr style={{ background: g.isFuel ? "#fde2cc" : g.isManual ? "#dce6f1" : "#e2efda" }}>
                <td style={{ ...pCell, fontWeight: 700 }} colSpan={colCount}>
                  {g.isFuel ? "⛽ COMBUSTIBLES" : g.razon}
                  {!g.isFuel && g.rut && (
                    <span style={{ marginLeft: 8, fontWeight: 400, color: "#555" }}>
                      · {formatRutForDisplay(g.rut)}
                    </span>
                  )}
                  <span style={{ marginLeft: 8, fontWeight: 400, color: "#555" }}>
                    · {g.docs.length} documento{g.docs.length === 1 ? "" : "s"}
                  </span>
                </td>
              </tr>
              {g.docs.map(renderDocRow)}
              <tr style={{ background: "#f2f2f2" }}>
                <td style={{ ...pCell, fontWeight: 700 }} colSpan={5}>Subtotal</td>
                <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(g.neto)}</td>
                <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(g.iva)}</td>
                <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(g.total)}</td>
                <td style={pCell} colSpan={showEstado ? 2 : 1}></td>
              </tr>
            </React.Fragment>
          ))}
          {docs.length > 0 && (
            <tr style={{ background: "#c6efce" }}>
              <td style={{ ...pCell, fontWeight: 700 }} colSpan={5}>TOTAL ({docs.length})</td>
              <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totals?.neto || 0)}</td>
              <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totals?.iva || 0)}</td>
              <td style={{ ...pCell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(totals?.total || 0)}</td>
              <td style={pCell} colSpan={showEstado ? 2 : 1}></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
