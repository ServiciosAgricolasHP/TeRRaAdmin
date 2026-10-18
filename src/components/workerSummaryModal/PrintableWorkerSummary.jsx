import { forwardRef } from "react";
import { tratoUnitLabel } from "../../utils/cosechaCombos";
import { advanceTypeMeta, advanceRemaining, advanceSign } from "../../services/advancesService";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { fmtCurrency } from "../../utils/format";
import { defaultCycleTitle, dateLabel, fmtNumber } from "./helpers";
import { LinearTable } from "./LinearTable";
import { StatusPill } from "./StatusPill";
import { cell, cellH, STATUS_STYLES } from "./styles";

const LOGO_URL = `${import.meta.env.BASE_URL}logo.png`;

const advanceTypeLabel = (type) => advanceTypeMeta(type).label;

const advanceTypeIcon = (type) => advanceTypeMeta(type).icon;

export const PrintableWorkerSummary = forwardRef(function PrintableWorkerSummary(
  { worker, data, grandTotal, advances = [], netAdvanceBalance = 0, advanceBalance, bonusBalance, titles, viewMode = "byCycle", catalogs = {}, onToggleHidden },
  ref,
) {
  // Si solo llega `netAdvanceBalance`, se toma como saldo de anticipos.
  const advanceAmount = advanceBalance != null ? advanceBalance : Math.max(0, netAdvanceBalance);
  const bonusAmount = bonusBalance != null ? bonusBalance : 0;
  const net = grandTotal - advanceAmount + bonusAmount;
  const isLinear = viewMode === "linear";
  // Cada vista tiene su propio título editable; el encabezado con el logo, el
  // nombre y el RUT es uno solo.
  const header = isLinear
    ? {
        main: titles?.linear?.main || "DETALLE DE JORNADA — CRONOLÓGICO",
        subtitle: titles?.linear?.subtitle ?? titles?.subtitle,
      }
    : { main: titles?.main || "DETALLE DE JORNADA", subtitle: titles?.subtitle };
  const isMobile = useIsMobile();
  return (
    <div ref={ref} style={{ background: "#ffffff", color: "#000", padding: 20, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 24, marginBottom: 16 }}>
        <img src={LOGO_URL} alt="logo" crossOrigin="anonymous" style={{ width: 90, height: 90, objectFit: "contain", flexShrink: 0 }} />
        <div style={{ textAlign: "center" }}>
          <div style={{ fontWeight: 700, fontSize: 18, letterSpacing: 1 }}>{header.main}</div>
          {header.subtitle && <div style={{ marginTop: 6, fontSize: 14 }}>{header.subtitle}</div>}
          {worker?.id && (
            <div style={{ marginTop: 2, fontSize: 12, color: "#444", fontFamily: "ui-monospace, monospace" }}>
              RUT {formatRutForDisplay(worker.rut || worker.id)}
            </div>
          )}
          <div style={{ marginTop: 4, fontSize: 11, color: "#666" }}>
            {data.some((d) => d.isClosed) ? "Ciclos activos + cerrados (filtrados)" : "Ciclos activos"}
          </div>
        </div>
        <div style={{ width: 90 }} />
      </div>

      {isLinear && (
        <LinearTable data={data} catalogs={catalogs} onToggleHidden={onToggleHidden} />
      )}
      {!isLinear && data.map(({ cycle, job, subjob, rows, totals, totalsByStatus, cols, pieceworkLabel, harvestLabel, isClosed }) => {
        // Fila de total con el valor en la columna `valueCol`
        // ("harvestQty" | "workdayCount" | "overtime" | "piecework" | "floor" | "amount"). Cierra
        // con las celdas vacías de Estado y, si está activa, de Filtrar.
        const trailingEmpty = (
          <>
            <td style={cell}></td>
            {onToggleHidden && <td data-export-hide style={cell}></td>}
          </>
        );
        const renderTotalRow = (label, value, valueCol, bg) => (
          <tr style={bg ? { background: bg } : undefined}>
            <td style={cell}></td>
            <td style={{ ...cell, fontWeight: 700 }}>{label}</td>
            {cols.harvestQty && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {valueCol === "harvestQty" ? value : ""}
              </td>
            )}
            {cols.workdayCount && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {valueCol === "workdayCount" ? value : ""}
              </td>
            )}
            {cols.overtime && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {valueCol === "overtime" ? value : ""}
              </td>
            )}
            {cols.piecework && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {valueCol === "piecework" ? value : ""}
              </td>
            )}
            {cols.floor && (
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#b45309" }}>
                {valueCol === "floor" ? value : ""}
              </td>
            )}
            <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
              {valueCol === "amount" ? value : ""}
            </td>
            {trailingEmpty}
          </tr>
        );
        const totalColSpan =
          2 + (cols.harvestQty ? 1 : 0) + (cols.workdayCount ? 1 : 0) + (cols.overtime ? 1 : 0) + (cols.piecework ? 1 : 0) + (cols.floor ? 1 : 0) + 1 + 1 + (onToggleHidden ? 1 : 0);
        // Desglose del subtotal por estado, solo si el ciclo mezcla estados:
        // con uno solo repetiría el subtotal.
        const statusesPresent = ["paid", "in_pending", "unpaid"].filter((s) => (totalsByStatus?.[s] || 0) > 0);
        const showStatusSplit = statusesPresent.length > 1;

        const cycleTitle =
          (titles?.cycles && titles.cycles[cycle.id]) ||
          defaultCycleTitle({ job, subjob, cycle });
        return (
          <div key={cycle.id} style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
              {cycleTitle}
              {isClosed && (
                <span style={{ marginLeft: 6, padding: "1px 6px", fontSize: 10, fontWeight: 600, color: "#666", background: "#e5e7eb", borderRadius: 4 }}>
                  cerrado
                </span>
              )}
            </div>
            <div style={{ overflowX: "auto" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: "#9dc3e6" }}>
                  <th style={cellH}>Detalle Jornada</th>
                  <th style={cellH}>Fecha</th>
                  {cols.harvestQty && <th style={{ ...cellH, textAlign: "right" }}>{harvestLabel}</th>}
                  {cols.workdayCount && <th style={{ ...cellH, textAlign: "right" }}>Jornadas</th>}
                  {cols.overtime && <th style={{ ...cellH, textAlign: "right" }}>HE</th>}
                  {cols.piecework && <th style={{ ...cellH, textAlign: "right" }}>{pieceworkLabel}</th>}
                  {cols.floor && <th style={{ ...cellH, textAlign: "right" }}>Piso</th>}
                  <th style={{ ...cellH, textAlign: "right" }}>Total</th>
                  <th style={{ ...cellH, textAlign: "center" }}>Estado</th>
                  {onToggleHidden && <th data-export-hide style={{ ...cellH, width: 44 }}>Filtrar</th>}
                </tr>
              </thead>
              <tbody>
                {rows.length === 0 ? (
                  <tr>
                    <td style={{ ...cell, color: "#666", textAlign: "center" }} colSpan={totalColSpan}>
                      Sin movimientos
                    </td>
                  </tr>
                ) : (
                  rows.map((r, i) => (
                    <tr key={i}>
                      <td style={cell}>{r.laborName}</td>
                      <td style={cell}>{dateLabel(r.date)}</td>
                      {cols.harvestQty && (
                        <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {r.harvestQty > 0 ? fmtNumber(r.harvestQty) : ""}
                        </td>
                      )}
                      {cols.workdayCount && (
                        <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {r.workdayCount > 0 ? fmtNumber(r.workdayCount) : ""}
                        </td>
                      )}
                      {cols.overtime && (
                        <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {r.overtimeHours > 0
                            ? `${fmtNumber(r.overtimeHours)}h · ${fmtCurrency(r.overtimeAmount)}`
                            : ""}
                        </td>
                      )}
                      {cols.piecework && (
                        <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                          {r.pieceworkQty > 0 ? (
                            <>
                              <div>{fmtNumber(r.pieceworkQty)}</div>
                              {/* Desglose por tier o por etapa, una línea por
                                  cada uno; con uno solo, una línea con el
                                  mismo formato. */}
                              {(() => {
                                const u = r.pieceworkUnit;
                                const defaultLbl = u != null ? tratoUnitLabel(catalogs, u) : null;
                                const items = (r.pieceworkBreakdown && r.pieceworkBreakdown.length > 0)
                                  ? r.pieceworkBreakdown.map((b) => {
                                      const bu = b.unit;
                                      const lbl = bu != null ? tratoUnitLabel(catalogs, bu) : defaultLbl;
                                      // `b.tag` lo trae el desglose por etapas, que ya viene
                                      // con el nombre de la etapa resuelto.
                                      const tag = b.tag || lbl || `T${(b.tierIdx || 0) + 1}`;
                                      const rate = b.qty > 0 ? Math.round(b.amount / b.qty) : 0;
                                      return { tag, qty: b.qty, rate, amount: b.amount };
                                    })
                                  : (r.amount > 0
                                      ? [{
                                          tag: defaultLbl || "trato",
                                          qty: r.pieceworkQty,
                                          rate: Math.round(r.amount / r.pieceworkQty),
                                          amount: r.amount,
                                        }]
                                      : []);
                                if (items.length === 0) return null;
                                return (
                                  <div style={{ fontSize: 10, color: "#888", fontWeight: 400, lineHeight: 1.35 }}>
                                    {items.map((it, j) => (
                                      <div key={j}>
                                        {it.tag}: {fmtNumber(it.qty)} × {fmtCurrency(it.rate)} = {fmtCurrency(it.amount)}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })()}
                            </>
                          ) : ""}
                        </td>
                      )}
                      {cols.floor && (
                        <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: (r.floor || 0) > 0 ? "#b45309" : "#999" }}>
                          {(r.floor || 0) > 0 ? fmtCurrency(r.floor) : ""}
                        </td>
                      )}
                      <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {fmtCurrency(r.amount + (r.floor || 0))}
                      </td>
                      <td style={{ ...cell, textAlign: "center" }}>
                        <StatusPill status={r.paymentStatus} payrollNames={r.payrollNames} />
                      </td>
                      {onToggleHidden && (
                        <td data-export-hide style={{ ...cell, textAlign: "center", padding: 2 }}>
                          <button
                            type="button"
                            onClick={() => onToggleHidden(r.rowKey)}
                            title="Sacar este día del resumen (solo visual, no toca los datos)"
                            style={{ background: "transparent", border: "none", cursor: "pointer", fontSize: 14, padding: 2, color: "#6b7280", lineHeight: 1 }}
                          >
                            👁
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
                {rows.length > 0 && (
                  <>
                    {cols.harvestQty && renderTotalRow(`Total ${harvestLabel}`, fmtNumber(totals.harvestQty), "harvestQty")}
                    {cols.workdayCount && renderTotalRow("Total Jornadas", fmtNumber(totals.workdayCount), "workdayCount")}
                    {cols.overtime &&
                      renderTotalRow(
                        "Total HE",
                        `${fmtNumber(totals.overtimeHours)}h · ${fmtCurrency(totals.overtimeAmount)}`,
                        "overtime",
                      )}
                    {cols.piecework && renderTotalRow(`Total ${pieceworkLabel}`, fmtNumber(totals.pieceworkQty), "piecework")}
                    {cols.floor && renderTotalRow("Total Pisos", fmtCurrency(totals.floor), "floor")}
                    {renderTotalRow("Subtotal ciclo", fmtCurrency(totals.amount + (totals.floor || 0)), "amount", "#c6efce")}
                    {showStatusSplit && (
                      <tr style={{ background: "#f9fafb" }}>
                        <td style={cell}></td>
                        <td style={{ ...cell, fontSize: 10, color: "#666" }} colSpan={totalColSpan - 1}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "flex-end" }}>
                            {statusesPresent.map((s) => (
                              <span key={s} style={{ color: STATUS_STYLES[s].color, fontWeight: 600 }}>
                                {STATUS_STYLES[s].label}: {fmtCurrency(totalsByStatus[s])}
                              </span>
                            ))}
                          </div>
                        </td>
                      </tr>
                    )}
                  </>
                )}
              </tbody>
            </table>
            </div>
          </div>
        );
      })}

      {advances.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>
            Anticipos y Bonos pendientes
          </div>
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {advances.map((a) => {
                const amount = Number(a.amount) || 0;
                const paid = Number(a.amountPaid) || 0;
                const remaining = advanceRemaining(a);
                const sign = advanceSign(a);
                const color = sign > 0 ? "#166534" : "#b45309";
                const signLabel = sign > 0 ? "+" : "−";
                return (
                  <div key={a.id} style={{ border: "1px solid #999", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontWeight: 700 }}>
                      <span>{advanceTypeIcon(a.type)} {advanceTypeLabel(a.type)}</span>
                      <span style={{ color }}>{signLabel} {fmtCurrency(remaining)}</span>
                    </div>
                    <div style={{ color: "#666", marginTop: 2 }}>{dateLabel(a.date)}</div>
                    <div style={{ marginTop: 2 }}>
                      Monto: <span style={{ color }}>{signLabel} {fmtCurrency(amount)}</span>
                      {paid > 0 && <> · Aplicado: {fmtCurrency(paid)}</>}
                    </div>
                    {a.note && <div style={{ fontSize: 11, color: "#444", marginTop: 2 }}>{a.note}</div>}
                  </div>
                );
              })}
              {advanceAmount > 0 && (
                <div style={{ background: "#fce4d6", borderRadius: 6, padding: "6px 8px", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12 }}>
                  <span>Saldo anticipos pendientes</span>
                  <span style={{ color: "#b45309" }}>− {fmtCurrency(advanceAmount)}</span>
                </div>
              )}
              {bonusAmount > 0 && (
                <div style={{ background: "#dcfce7", borderRadius: 6, padding: "6px 8px", display: "flex", justifyContent: "space-between", fontWeight: 700, fontSize: 12 }}>
                  <span>Saldo bonos pendientes</span>
                  <span style={{ color: "#166534" }}>+ {fmtCurrency(bonusAmount)}</span>
                </div>
              )}
            </div>
          ) : (
          <table style={{ borderCollapse: "collapse", width: "100%" }}>
            <thead>
              <tr style={{ background: "#f8cbad" }}>
                <th style={cellH}>Tipo</th>
                <th style={cellH}>Fecha</th>
                <th style={{ ...cellH, textAlign: "right" }}>Monto</th>
                <th style={{ ...cellH, textAlign: "right" }}>Aplicado</th>
                <th style={{ ...cellH, textAlign: "right" }}>Saldo</th>
                <th style={cellH}>Nota</th>
              </tr>
            </thead>
            <tbody>
              {advances.map((a) => {
                const amount = Number(a.amount) || 0;
                const paid = Number(a.amountPaid) || 0;
                const remaining = advanceRemaining(a);
                const sign = advanceSign(a);
                const color = sign > 0 ? "#166534" : "#b45309";
                const signLabel = sign > 0 ? "+" : "−";
                return (
                  <tr key={a.id}>
                    <td style={cell}>
                      {advanceTypeIcon(a.type)} {advanceTypeLabel(a.type)}
                    </td>
                    <td style={cell}>{dateLabel(a.date)}</td>
                    <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color }}>
                      {signLabel} {fmtCurrency(amount)}
                    </td>
                    <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: paid > 0 ? "#666" : "#999" }}>
                      {paid > 0 ? fmtCurrency(paid) : "—"}
                    </td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color }}>
                      {signLabel} {fmtCurrency(remaining)}
                    </td>
                    <td style={{ ...cell, fontSize: 11, color: "#444" }}>{a.note || ""}</td>
                  </tr>
                );
              })}
              {advanceAmount > 0 && (
                <tr style={{ background: "#fce4d6" }}>
                  <td style={{ ...cell, fontWeight: 700 }} colSpan={4}>
                    Saldo anticipos pendientes
                  </td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#b45309" }}>
                    − {fmtCurrency(advanceAmount)}
                  </td>
                  <td style={cell}></td>
                </tr>
              )}
              {bonusAmount > 0 && (
                <tr style={{ background: "#dcfce7" }}>
                  <td style={{ ...cell, fontWeight: 700 }} colSpan={4}>
                    Saldo bonos pendientes
                  </td>
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#166534" }}>
                    + {fmtCurrency(bonusAmount)}
                  </td>
                  <td style={cell}></td>
                </tr>
              )}
            </tbody>
          </table>
          )}
        </div>
      )}

      {(data.length > 1 || advances.length > 0) && (
        <table style={{ borderCollapse: "collapse", width: "100%", marginTop: 8 }}>
          <tbody>
            <tr style={{ background: "#dbe7c9" }}>
              <td style={{ ...cell, fontWeight: 700, fontSize: 12 }}>Total producción</td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(grandTotal)}
              </td>
            </tr>
            {advanceAmount > 0 && (
              <tr style={{ background: "#fce4d6" }}>
                <td style={{ ...cell, fontWeight: 700, fontSize: 12, color: "#b45309" }}>
                  Saldo anticipos pendientes
                </td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums", color: "#b45309" }}>
                  − {fmtCurrency(advanceAmount)}
                </td>
              </tr>
            )}
            {bonusAmount > 0 && (
              <tr style={{ background: "#dcfce7" }}>
                <td style={{ ...cell, fontWeight: 700, fontSize: 12, color: "#166534" }}>
                  Saldo bonos pendientes
                </td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontSize: 12, fontVariantNumeric: "tabular-nums", color: "#166534" }}>
                  + {fmtCurrency(bonusAmount)}
                </td>
              </tr>
            )}
            {(advanceAmount > 0 || bonusAmount > 0) && (
              <tr style={{ background: "#a9d08e" }}>
                <td style={{ ...cell, fontWeight: 700, fontSize: 13 }}>NETO ESTIMADO</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(net)}
                </td>
              </tr>
            )}
            {advanceAmount === 0 && bonusAmount === 0 && (
              <tr style={{ background: "#a9d08e" }}>
                <td style={{ ...cell, fontWeight: 700, fontSize: 13 }}>TOTAL GENERAL</td>
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontSize: 13, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(grandTotal)}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
});
