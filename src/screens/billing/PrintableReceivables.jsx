import React, { forwardRef } from "react";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { fmtCurrency } from "../../utils/format";
import { formatPeriodPretty, todayIso } from "./docs";
import { pCellH, pCell } from "./printStyles";
import { companyBreakdown, docTypeLabel, monthLabel, statusLabel } from "./receivablesLabels";

const num = { ...pCell, textAlign: "right", fontVariantNumeric: "tabular-nums" };

// Lo pendiente de la pestaña Pendientes para copiar, bajar en PNG o imprimir,
// sin controles y con las columnas de la pantalla: las facturas por cobrar
// por cliente y el IVA pendiente por cliente y por mes, con sus subtotales.
// Recibe la vista ya sin lo resuelto (`withoutResolved`).
export const PrintableReceivables = forwardRef(function PrintableReceivables(
  { view, scopeLabel, showCompany, companyLabel },
  ref,
) {
  const cols = showCompany ? 10 : 9;
  const docRow = (r) => {
    const d = r.doc;
    const paid = Number(d.amountPaid) || 0;
    return (
      <tr key={`${d.id}_${r.category}`}>
        <td style={{ ...pCell, fontVariantNumeric: "tabular-nums", whiteSpace: "nowrap" }}>{d.fechaEmision || "—"}</td>
        <td style={pCell}>{docTypeLabel(d)}</td>
        <td style={num}>{d.folio}</td>
        {showCompany && <td style={pCell}>{companyLabel(d.companyId)}</td>}
        <td style={num}>{fmtCurrency(d.neto)}</td>
        <td style={num}>{fmtCurrency(d.iva)}</td>
        <td style={{ ...num, fontWeight: 600 }}>{fmtCurrency(d.total)}</td>
        <td style={{ ...num, color: "#666" }}>{paid > 0 ? fmtCurrency(paid) : "—"}</td>
        <td style={{ ...num, fontWeight: 700 }}>{fmtCurrency(r.pending)}</td>
        <td style={{ ...pCell, textAlign: "center" }}>{statusLabel(d)}</td>
      </tr>
    );
  };
  const totalRow = (label, amount, { strong = false, note = "" } = {}) => (
    <tr style={{ background: strong ? "#dde9ff" : "#f2f2f2" }}>
      <td style={{ ...pCell, fontWeight: 700, textAlign: "right" }} colSpan={cols - 2}>
        {label}
        {note && <div style={{ fontWeight: 400, fontSize: 10, color: "#444" }}>{note}</div>}
      </td>
      <td style={{ ...num, fontWeight: 700 }}>{fmtCurrency(amount)}</td>
      <td style={pCell}></td>
    </tr>
  );
  const clientRow = (g) => (
    <tr style={{ background: "#fff2cc" }}>
      <td style={{ ...pCell, fontWeight: 700 }} colSpan={cols}>
        {g.razon || "—"}
        <span style={{ marginLeft: 8, fontWeight: 400, color: "#444" }}>
          {g.rut ? `${formatRutForDisplay(g.rut)} · ` : ""}{g.count} factura{g.count === 1 ? "" : "s"}
        </span>
      </td>
    </tr>
  );
  const head = (isVat) => (
    <tr style={{ background: "#92d050" }}>
      <th style={{ ...pCellH, width: 80 }}>FECHA</th>
      <th style={pCellH}>TIPO</th>
      <th style={{ ...pCellH, textAlign: "right", width: 60 }}>FOLIO</th>
      {showCompany && <th style={pCellH}>EMPRESA</th>}
      <th style={{ ...pCellH, textAlign: "right" }}>NETO</th>
      <th style={{ ...pCellH, textAlign: "right" }}>IVA</th>
      <th style={{ ...pCellH, textAlign: "right" }}>TOTAL</th>
      <th style={{ ...pCellH, textAlign: "right" }}>ABONOS</th>
      <th style={{ ...pCellH, textAlign: "right" }}>{isVat ? "IVA PENDIENTE" : "PENDIENTE"}</th>
      <th style={{ ...pCellH, textAlign: "center" }}>ESTADO</th>
    </tr>
  );
  const sectionTitle = (text) => (
    <div style={{ margin: "14px 0 4px", fontWeight: 700, fontSize: 13, textTransform: "uppercase" }}>{text}</div>
  );
  return (
    <div
      ref={ref}
      style={{ background: "#ffffff", color: "#000", padding: 16, fontFamily: "ui-sans-serif, system-ui, sans-serif", minWidth: 1000 }}
    >
      <div style={{ marginBottom: 6, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 15, textTransform: "uppercase" }}>PENDIENTES — {scopeLabel}</div>
        <div style={{ fontSize: 12, color: "#444" }}>{todayIso()}</div>
      </div>
      <div style={{
        marginBottom: 8, padding: "10px 14px", background: "#fff4ce", border: "2px solid #f4b400", borderRadius: 6,
        display: "flex", alignItems: "baseline", justifyContent: "space-between",
      }}>
        <div style={{ fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5 }}>
          TOTAL PENDIENTE · {view.visibleCount} factura{view.visibleCount === 1 ? "" : "s"}
        </div>
        <div style={{ fontSize: 22, fontWeight: 800, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(view.visibleTotal)}</div>
      </div>

      {view.invoices.length > 0 && (
        <>
          {sectionTitle("Facturas por cobrar")}
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>{head(false)}</thead>
            <tbody>
              {view.invoices.map((g) => (
                <React.Fragment key={g.key}>
                  {clientRow(g)}
                  {g.rows.map(docRow)}
                  {totalRow(`Total ${g.razon || ""}`, g.total, { strong: true, note: showCompany ? companyBreakdown(g.byCompany, companyLabel) : "" })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}

      {view.vat.length > 0 && (
        <>
          {sectionTitle("IVA pendiente")}
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>{head(true)}</thead>
            <tbody>
              {view.vat.map((g) => (
                <React.Fragment key={g.key}>
                  {clientRow(g)}
                  {g.months.map((m) => (
                    <React.Fragment key={m.periodo}>
                      <tr>
                        <td style={{ ...pCell, fontWeight: 700, fontSize: 11, color: "#444" }} colSpan={cols}>
                          {formatPeriodPretty(m.periodo).toUpperCase()}
                        </td>
                      </tr>
                      {m.rows.map(docRow)}
                      {totalRow(`IVA pendiente ${monthLabel(m.periodo)}`, m.total)}
                    </React.Fragment>
                  ))}
                  {totalRow(`IVA pendiente total ${g.razon || ""}`, g.total, { strong: true, note: showCompany ? companyBreakdown(g.byCompany, companyLabel) : "" })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </>
      )}
    </div>
  );
});
