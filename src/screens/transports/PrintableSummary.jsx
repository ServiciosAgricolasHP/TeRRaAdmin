import { forwardRef } from "react";
import { titleCase } from "../../services/transportsService";
import { fmtCurrency } from "../../utils/format";
import { cellH, cell } from "./printStyles";

const MONTH_NAMES = ["ENERO", "FEBRERO", "MARZO", "ABRIL", "MAYO", "JUNIO", "JULIO", "AGOSTO", "SEPTIEMBRE", "OCTUBRE", "NOVIEMBRE", "DICIEMBRE"];

const DAY_NAMES = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];

function dateLabel(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}-${MONTH_NAMES[d.getMonth()].slice(0, 3).toLowerCase()}`;
}

function monthOfTrips(trips) {
  if (!trips.length) return "";
  const months = new Set(trips.map((t) => Number(t.date?.slice(5, 7))).filter((m) => !isNaN(m)));
  if (months.size === 1) return MONTH_NAMES[[...months][0] - 1];
  return "";
}

export const PrintableSummary = forwardRef(function PrintableSummary(
  { payment, abonos: abonosProp, carrier, trips, periodLabel, faenaById, subfaenaById, cycleById, editable = false, onEditTrip, onRemoveTrip, isTripLocked },
  ref,
) {
  // En modo edición, con callbacks por vuelta, agrega la columna "Acciones",
  // que también sale al imprimir o capturar. El "Valor" no se edita acá: el
  // lápiz abre TripEditModal y edita la vuelta completa (cantidad y tarifa),
  // así el monto sigue siendo N° vueltas × tarifa.
  const showActions = editable && (onEditTrip || onRemoveTrip);
  const month = monthOfTrips(trips);
  const total = trips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  // Abonos del resumen y lo que queda pendiente, al pie de la tabla: es lo que
  // ve el transportista. `abonosProp` llega del modal, que los edita en vivo;
  // si no, salen del resumen. El pendiente se calcula contra el total de las
  // vueltas, el mismo que muestra la tabla.
  const abonos = abonosProp || payment?.abonos || [];
  const abonado = abonos.reduce((s, a) => s + (Number(a.amount) || 0), 0);
  const isPaid = payment?.status === "paid";
  const pending = isPaid ? 0 : Math.max(0, total - abonado);
  const labelSpan = 6;
  const trailingCells = 1 + (showActions ? 1 : 0);

  return (
    <div ref={ref} style={{ background: "#ffffff", color: "#000", padding: 16, fontFamily: "ui-sans-serif, system-ui, sans-serif" }}>
      <div style={{ marginBottom: 8, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
        <div style={{ fontWeight: 700, fontSize: 14 }}>DETALLE TRANSPORTE</div>
        {month && (
          <div className="month-tag" style={{ background: "#e6c0e0", padding: "4px 12px", fontWeight: 700, fontSize: 14 }}>
            {month}
          </div>
        )}
        <div style={{ fontSize: 12, color: "#444" }}>{periodLabel}</div>
      </div>
      <div style={{ marginBottom: 6, fontSize: 13, fontWeight: 700, textTransform: "uppercase" }}>
        {(carrier?.name || carrier?.alias || "").toUpperCase()}
      </div>

      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr style={{ background: "#92d050" }}>
            <th style={cellH}>FECHA</th>
            <th style={cellH}>Vehículo</th>
            <th style={cellH}>N° vueltas</th>
            <th style={cellH}>LUGAR</th>
            <th style={cellH}>DESTINO</th>
            <th style={cellH}>Labor</th>
            <th style={{ ...cellH, textAlign: "right" }}>Valor</th>
            <th style={cellH}>Observación</th>
            {showActions && <th style={{ ...cellH, textAlign: "center", width: 80 }}>Acciones</th>}
          </tr>
        </thead>
        <tbody>
          {trips.map((t) => {
            const fa = faenaById?.get(t.faenaId);
            const sb = subfaenaById?.get(t.subfaenaId);
            const cy = cycleById?.get(t.cycleId);
            const labor = [fa?.name, sb?.name].filter(Boolean).join(" / ") || cy?.label || "—";
            const locked = isTripLocked ? isTripLocked(t) : false;
            return (
              <tr key={t.id}>
                <td style={cell}>{dateLabel(t.date)}</td>
                <td style={cell}>{t.vehicleAlias || "—"}</td>
                <td style={{ ...cell, textAlign: "center" }}>{t.qty}</td>
                <td style={cell}>{titleCase(t.lugar)}</td>
                <td style={cell}>{titleCase(t.destino)}</td>
                <td style={cell}>{labor}</td>
                <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", padding: "5px 8px" }}>
                  {fmtCurrency(t.amount)}
                </td>
                <td style={cell}>
                  {t.personCount != null ? `${t.personCount} PERS` : ""}
                  {t.kind === "approach" ? (t.personCount != null ? " · " : "") + "acercamiento" : ""}
                  {t.notes ? (t.personCount != null || t.kind === "approach" ? " · " : "") + t.notes : ""}
                </td>
                {showActions && (
                  <td style={{ ...cell, textAlign: "center", padding: 4 }}>
                    <div style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                      {onEditTrip && (
                        <button
                          type="button"
                          onClick={() => !locked && onEditTrip(t)}
                          disabled={locked}
                          title={locked ? "No se puede editar una vuelta pagada" : "Editar todos los detalles de esta vuelta"}
                          style={{
                            background: locked ? "#e5e7eb" : "#dbeafe",
                            color: locked ? "#9ca3af" : "#1d4ed8",
                            border: `1px solid ${locked ? "#d1d5db" : "#93c5fd"}`,
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontSize: 11,
                            cursor: locked ? "not-allowed" : "pointer",
                          }}
                        >
                          ✏️
                        </button>
                      )}
                      {onRemoveTrip && (
                        <button
                          type="button"
                          onClick={() => !locked && onRemoveTrip(t)}
                          disabled={locked}
                          title={locked ? "No se puede quitar una vuelta pagada" : "Quitar esta vuelta del resumen (no la borra)"}
                          style={{
                            background: locked ? "#e5e7eb" : "#fee2e2",
                            color: locked ? "#9ca3af" : "#b91c1c",
                            border: `1px solid ${locked ? "#d1d5db" : "#fca5a5"}`,
                            borderRadius: 4,
                            padding: "2px 6px",
                            fontSize: 11,
                            cursor: locked ? "not-allowed" : "pointer",
                          }}
                        >
                          ✕
                        </button>
                      )}
                    </div>
                  </td>
                )}
              </tr>
            );
          })}
          <tr style={{ background: "#c6efce" }}>
            <td style={{ ...cell, fontWeight: 700 }} colSpan={labelSpan}>{abonos.length > 0 ? "TOTAL" : ""}</td>
            <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{fmtCurrency(total)}</td>
            <td style={cell}></td>
            {showActions && <td style={cell}></td>}
          </tr>
          {abonos.map((a, i) => (
            <tr key={a.id || i}>
              <td style={{ ...cell, color: "#166534" }} colSpan={labelSpan}>
                Abono {dateLabel(a.date)}
              </td>
              <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums", color: "#166534" }}>
                − {fmtCurrency(a.amount)}
              </td>
              <td style={cell} colSpan={trailingCells}>{a.notes || ""}</td>
            </tr>
          ))}
          {abonos.length > 0 && (
            <tr style={{ background: pending > 0 ? "#fef3c7" : "#c6efce" }}>
              <td style={{ ...cell, fontWeight: 700 }} colSpan={labelSpan}>
                {isPaid ? "PAGADO" : "PENDIENTE"}
              </td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: pending > 0 ? "#a16207" : "#166534" }}>
                {fmtCurrency(pending)}
              </td>
              <td style={cell} colSpan={trailingCells}></td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
});
