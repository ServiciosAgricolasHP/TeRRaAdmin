import { forwardRef } from "react";
import { fmtCurrency } from "../../../utils/format";
import { summarySections } from "../../../utils/summaryTables";
import { DayNotesTable } from "./DayNotesTable";
import { LaborTable } from "./LaborTable";
import { cell, chargeDateInputStyle, chargeInputStyle } from "./tableStyles";
import { TransportTable } from "./TransportTable";

const LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;

// ============================================================
// Imprimible
// ============================================================

// Lo que se usa cuando no se pasa la prop: siempre el mismo objeto.
const NO_HIDDEN_COLUMNS = new Set();

export const PrintableSummary = forwardRef(function PrintableSummary(
  {
    mode,
    editMode = true,
    withIva = true,
    hiddenColumns = NO_HIDDEN_COLUMNS,
    titles,
    labors,
    carriers,
    carrierById,
    grandTotal,
    subtotal = null,
    discount = 0,
    discountNote = "",
    onChangeDiscount,
    pendingBalance = 0,
    pendingBalanceNote = "",
    onChangePendingBalance,
    catalogs,
    dayPrices = {},
    dayNotes = [],
    editLaborRow,
    addLaborRow,
    removeLaborRow,
    toggleLaborOvertime,
    editCarrierRow,
    addCarrierRow,
    removeCarrierRow,
  },
  ref,
) {
  return (
    <div ref={ref} style={{ background: "#ffffff", color: "#000", padding: 20, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      {/* Encabezado */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 16 }}>
        <img src={LOGO_URL} alt="logo" crossOrigin="anonymous" style={{ width: 90, height: 90, objectFit: "contain", flexShrink: 0 }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>{titles.main || "DETALLE DE JORNADA"}</div>
          {titles.subtitle && <div style={{ marginTop: 6, fontSize: 14 }}>{titles.subtitle}</div>}
        </div>
        <div style={{ width: 90 }} />
      </div>

      {/* Tablas día a día por labor y por transportista. En cobrar, las
          labores fusionadas (`mergeInto`) van dentro de la tabla de su destino
          (utils/summaryTables.js). */}
      {summarySections({ mode, labors, carriers, titles, carrierById, dayPrices }).map((section) =>
        section.kind === "labor" ? (
          <LaborTable
            key={section.key}
            section={section}
            mode={mode}
            editMode={editMode}
            hiddenColumns={hiddenColumns}
            catalogs={catalogs}
            onEditRow={editLaborRow}
            onAddRow={addLaborRow}
            onRemoveRow={removeLaborRow}
            onToggleOvertime={toggleLaborOvertime}
          />
        ) : (
          <TransportTable
            key={section.key}
            section={section}
            mode={mode}
            editMode={editMode}
            hiddenColumns={hiddenColumns}
            onEditRow={editCarrierRow}
            onAddRow={addCarrierRow}
            onRemoveRow={removeCarrierRow}
          />
        ),
      )}

      {/* Total general. En cobrar suma, cuando corresponde, las filas de
          Subtotal, Descuento, IVA (19%) y saldo pendiente. */}
      <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 12 }}>
        <tbody>
          {/* Subtotal antes del descuento: en cobrar, con descuento o saldo
              pendiente, o en edición. */}
          {mode === "charge" && (discount > 0 || pendingBalance > 0 || editMode) && subtotal != null && (
            <tr style={{ background: "#fff" }}>
              <td style={{ ...cell, fontWeight: 600 }}>Subtotal</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(subtotal)}
              </td>
            </tr>
          )}
          {/* Descuento — visible cuando hay valor o cuando se está editando.
              En editMode pone inputs (monto + motivo). Fuera de editMode lo
              muestra como texto con signo negativo. */}
          {mode === "charge" && (discount > 0 || editMode) && (
            <tr style={{ background: "#fffbeb" }}>
              <td style={{ ...cell, fontWeight: 600 }}>
                Descuento
                {editMode ? (
                  <input
                    type="text"
                    placeholder="motivo (opcional)"
                    value={discountNote || ""}
                    onChange={(e) => onChangeDiscount && onChangeDiscount({ note: e.target.value })}
                    style={{ ...chargeDateInputStyle, marginLeft: 8, width: 220 }}
                  />
                ) : (
                  discountNote ? <span style={{ marginLeft: 8, fontWeight: 400, color: "#666" }}>· {discountNote}</span> : null
                )}
              </td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#b00" }}>
                {editMode ? (
                  <input
                    type="number"
                    value={discount > 0 ? discount : ""}
                    placeholder="0"
                    onChange={(e) => onChangeDiscount && onChangeDiscount({ amount: e.target.value })}
                    style={{ ...chargeInputStyle, width: 120 }}
                  />
                ) : (
                  `− ${fmtCurrency(discount)}`
                )}
              </td>
            </tr>
          )}
          <tr style={{ background: "#a9d08e" }}>
            <td style={{ ...cell, fontWeight: 700, fontSize: 14 }}>
              {mode === "charge"
                ? (withIva ? "TOTAL A FACTURAR" : "TOTAL A COBRAR (sin IVA)")
                : "TOTAL GENERAL"}
            </td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
              {fmtCurrency(grandTotal)}
            </td>
          </tr>
          {mode === "charge" && withIva && (
            <>
              <tr style={{ background: "#fff" }}>
                <td style={{ ...cell, fontWeight: 600 }}>Valor IVA (19%)</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(Math.round((Number(grandTotal) || 0) * 0.19))}
                </td>
              </tr>
              <tr style={{ background: "#c6efce" }}>
                <td style={{ ...cell, fontWeight: 700, fontSize: 14 }}>IVA incluido</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(Math.round((Number(grandTotal) || 0) * 1.19))}
                </td>
              </tr>
            </>
          )}
          {/* Saldo pendiente — se aplica DESPUÉS del IVA, así que sale debajo
              del "IVA incluido" (o del total neto si no hay IVA). */}
          {mode === "charge" && (pendingBalance > 0 || editMode) && (() => {
            const postIvaTotal = withIva
              ? Math.round((Number(grandTotal) || 0) * 1.19)
              : (Number(grandTotal) || 0);
            const finalTotal = postIvaTotal + (Number(pendingBalance) || 0);
            return (
              <>
                <tr style={{ background: "#ecfdf5" }}>
                  <td style={{ ...cell, fontWeight: 600 }}>
                    Saldo pendiente
                    {editMode ? (
                      <input
                        type="text"
                        placeholder="motivo (opcional)"
                        value={pendingBalanceNote || ""}
                        onChange={(e) => onChangePendingBalance && onChangePendingBalance({ note: e.target.value })}
                        style={{ ...chargeDateInputStyle, marginLeft: 8, width: 220 }}
                      />
                    ) : (
                      pendingBalanceNote ? <span style={{ marginLeft: 8, fontWeight: 400, color: "#666" }}>· {pendingBalanceNote}</span> : null
                    )}
                  </td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: 600, fontVariantNumeric: "tabular-nums", color: "#0a7d3b" }}>
                    {editMode ? (
                      <input
                        type="number"
                        value={pendingBalance > 0 ? pendingBalance : ""}
                        placeholder="0"
                        onChange={(e) => onChangePendingBalance && onChangePendingBalance({ amount: e.target.value })}
                        style={{ ...chargeInputStyle, width: 120 }}
                      />
                    ) : (
                      `+ ${fmtCurrency(pendingBalance)}`
                    )}
                  </td>
                </tr>
                {pendingBalance > 0 && (
                  <tr style={{ background: "#6aa84f" }}>
                    <td style={{ ...cell, fontWeight: 700, fontSize: 14, color: "#fff" }}>TOTAL FINAL</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontSize: 14, fontVariantNumeric: "tabular-nums", color: "#fff" }}>
                      {fmtCurrency(finalTotal)}
                    </td>
                  </tr>
                )}
              </>
            );
          })()}
        </tbody>
      </table>

      {/* Observaciones por día — anexo, después del total: es contexto de la
          jornada, no parte del cálculo. Solo en pagar: son apuntes internos y
          el resumen de cobrar es el que se manda al cliente. */}
      {mode === "pay" && dayNotes.length > 0 && (
        <DayNotesTable notes={dayNotes} showLaborNames={labors.length > 1} />
      )}
    </div>
  );
});
