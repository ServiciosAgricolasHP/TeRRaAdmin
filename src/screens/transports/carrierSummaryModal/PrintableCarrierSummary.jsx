import { forwardRef } from "react";
import { useIsMobile } from "../../../hooks/useIsMobile";
import { fmtCurrency } from "../../../utils/format";
import { cellH, cell } from "../printStyles";
import { CarrierGroupTable, GroupStatusChip } from "./CarrierGroupTable";
import { groupPeriodLabel } from "./labels";

const LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;
const money = { textAlign: "right", fontVariantNumeric: "tabular-nums" };

// Lo que se ve, se copia, se descarga y se imprime del resumen de un
// transportista: el encabezado, una fila por grupo (quincena, sin quincena y
// vueltas sin resumen) con sus totales y, debajo, las vueltas de los
// resúmenes sin quincena y de las vueltas sin resumen. Las de cada quincena
// van solo con `showFortnightTrips`.
export const PrintableCarrierSummary = forwardRef(function PrintableCarrierSummary(
  { carrier, title, subtitle, dateLine, scopeLabel, groups, totals, showFortnightTrips, refs },
  ref,
) {
  // En el teléfono el logo es más chico y sin el espacio que lo equilibra a la
  // derecha, para que el título no se parta en pedazos.
  const isMobile = useIsMobile();
  const logoSize = isMobile ? 60 : 90;
  return (
    <div ref={ref} style={{ background: "#ffffff", color: "#000", padding: isMobile ? 12 : 20, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: isMobile ? 12 : 24, marginBottom: 16 }}>
        <img src={LOGO_URL} alt="logo" crossOrigin="anonymous" style={{ width: logoSize, height: logoSize, objectFit: "contain", flexShrink: 0 }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>{title}</div>
          {subtitle && <div style={{ marginTop: 6, fontSize: 14 }}>{subtitle}</div>}
          <div style={{ marginTop: 2, fontSize: 12, color: "#444" }}>
            {carrier.alias && carrier.alias !== subtitle ? `${carrier.alias} · ` : ""}
            <span style={{ whiteSpace: "nowrap" }}>{dateLine}</span>
          </div>
          <div style={{ marginTop: 4, fontSize: 11, color: "#666" }}>{scopeLabel}</div>
        </div>
        {!isMobile && <div style={{ width: logoSize }} />}
      </div>

      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 560 }}>
          <thead>
            <tr style={{ background: "#92d050" }}>
              <th style={cellH}>QUINCENA</th>
              <th style={cellH}>PERÍODO</th>
              <th style={{ ...cellH, textAlign: "center" }}>N° vueltas</th>
              <th style={{ ...cellH, textAlign: "right" }}>TOTAL</th>
              <th style={{ ...cellH, textAlign: "right" }}>Pagado y abonado</th>
              <th style={{ ...cellH, textAlign: "right" }}>PENDIENTE</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr key={g.key}>
                <td style={cell}>
                  {g.title}
                  <GroupStatusChip group={g} />
                </td>
                <td style={cell}>{groupPeriodLabel(g)}</td>
                <td style={{ ...cell, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>{g.qty}</td>
                <td style={{ ...cell, ...money }}>{fmtCurrency(g.total)}</td>
                <td style={{ ...cell, ...money, color: "#166534" }}>{g.paid > 0 ? fmtCurrency(g.paid) : "—"}</td>
                <td style={{ ...cell, ...money, fontWeight: 700, color: g.pending > 0 ? "#a16207" : "#666" }}>
                  {g.pending > 0 ? fmtCurrency(g.pending) : "—"}
                </td>
              </tr>
            ))}
            <tr style={{ background: "#c6efce" }}>
              <td style={{ ...cell, fontWeight: 700 }} colSpan={2}>TOTAL</td>
              <td style={{ ...cell, textAlign: "center", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{totals.qty}</td>
              <td style={{ ...cell, ...money, fontWeight: 700 }}>{fmtCurrency(totals.total)}</td>
              <td style={{ ...cell, ...money, fontWeight: 700, color: "#166534" }}>{fmtCurrency(totals.paid)}</td>
              <td style={{ ...cell, ...money, fontWeight: 700, color: "#a16207", background: totals.pending > 0 ? "#fef3c7" : undefined }}>
                {fmtCurrency(totals.pending)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {groups
        .filter((g) => showFortnightTrips || g.kind !== "fortnight")
        .map((g) => <CarrierGroupTable key={g.key} group={g} refs={refs} />)}
    </div>
  );
});
