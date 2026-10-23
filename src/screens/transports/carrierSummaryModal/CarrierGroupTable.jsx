import { titleCase } from "../../../services/transportsService";
import { fmtCurrency } from "../../../utils/format";
import { cellH, cell } from "../printStyles";
import { tripDateLabel, tripLaborLabel, tripObservation } from "../tripCells";
import { groupPeriodLabel } from "./labels";

const money = { textAlign: "right", fontVariantNumeric: "tabular-nums" };
const LABEL_SPAN = 6;

const CHIPS = {
  open: { label: "abierta", background: "#fef3c7", color: "#a16207" },
  paid: { label: "pagada", background: "#dcfce7", color: "#15803d" },
  missing: { label: "eliminada", background: "#e5e7eb", color: "#4b5563" },
};

// Si la quincena del grupo está abierta, pagada o ya no existe.
export function GroupStatusChip({ group }) {
  const chip = CHIPS[group.fortnightStatus];
  if (!chip) return null;
  return (
    <>
      {" "}
      <span style={{ marginLeft: 4, padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 600, background: chip.background, color: chip.color }}>
        {chip.label}
      </span>
    </>
  );
}

function summaryStatusText(s) {
  if (s.isPaid) return "pagado";
  if (s.paid > 0) return `abonado ${fmtCurrency(s.paid)} · falta ${fmtCurrency(s.pending)}`;
  return "pendiente";
}

function TripRow({ t, refs }) {
  return (
    <tr>
      <td style={cell}>{tripDateLabel(t.date)}</td>
      <td style={cell}>{t.vehicleAlias || "—"}</td>
      <td style={{ ...cell, textAlign: "center" }}>{t.qty}</td>
      <td style={cell}>{titleCase(t.lugar)}</td>
      <td style={cell}>{titleCase(t.destino)}</td>
      <td style={cell}>{tripLaborLabel(t, refs)}</td>
      <td style={{ ...cell, ...money }}>{fmtCurrency(t.amount)}</td>
      <td style={cell}>{tripObservation(t)}</td>
    </tr>
  );
}

// Las vueltas de un grupo del resumen del transportista (una quincena, los
// resúmenes sin quincena o las vueltas sin resumen), con su total y, si hay
// algo pagado, lo pagado y lo pendiente. Con más de un resumen, cada uno lleva
// una fila con su período, su total y su estado. Los abonos se listan en los
// resúmenes pendientes; en uno pagado ya no queda nada que explicar.
export function CarrierGroupTable({ group, refs }) {
  const several = group.summaries.length > 1;
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12, marginBottom: 4 }}>
        <div style={{ fontSize: 13, fontWeight: 700 }}>
          {group.title}
          <GroupStatusChip group={group} />
        </div>
        <div style={{ fontSize: 12, color: "#444" }}>{groupPeriodLabel(group)}</div>
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 720 }}>
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
            </tr>
          </thead>
          <tbody>
            {group.kind === "unlinked"
              ? group.trips.map((t) => <TripRow key={t.id} t={t} refs={refs} />)
              : group.summaries.map((s) => (
                <SummaryRows key={s.payment.id} s={s} refs={refs} withHeader={several} />
              ))}
            <tr style={{ background: "#c6efce" }}>
              <td style={{ ...cell, fontWeight: 700 }} colSpan={LABEL_SPAN}>TOTAL</td>
              <td style={{ ...cell, ...money, fontWeight: 700 }}>{fmtCurrency(group.total)}</td>
              <td style={cell}></td>
            </tr>
            {group.paid > 0 && group.pending > 0 && (
              <>
                <tr>
                  <td style={{ ...cell, color: "#166534" }} colSpan={LABEL_SPAN}>Pagado y abonado</td>
                  <td style={{ ...cell, ...money, color: "#166534" }}>{fmtCurrency(group.paid)}</td>
                  <td style={cell}></td>
                </tr>
                <tr style={{ background: "#fef3c7" }}>
                  <td style={{ ...cell, fontWeight: 700 }} colSpan={LABEL_SPAN}>PENDIENTE</td>
                  <td style={{ ...cell, ...money, fontWeight: 700, color: "#a16207" }}>{fmtCurrency(group.pending)}</td>
                  <td style={cell}></td>
                </tr>
              </>
            )}
            {group.paid > 0 && group.pending === 0 && (
              <tr style={{ background: "#c6efce" }}>
                <td style={{ ...cell, fontWeight: 700 }} colSpan={LABEL_SPAN}>PAGADO</td>
                <td style={{ ...cell, ...money, fontWeight: 700, color: "#166534" }}>{fmtCurrency(group.paid)}</td>
                <td style={cell}></td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryRows({ s, refs, withHeader }) {
  return (
    <>
      {withHeader && (
        <tr style={{ background: "#eef2f7" }}>
          <td style={{ ...cell, fontWeight: 700 }} colSpan={LABEL_SPAN}>
            Resumen {tripDateLabel(s.periodFrom)}{s.periodTo && s.periodTo !== s.periodFrom ? ` → ${tripDateLabel(s.periodTo)}` : ""}
          </td>
          <td style={{ ...cell, ...money, fontWeight: 700 }}>{fmtCurrency(s.total)}</td>
          <td style={{ ...cell, color: s.isPaid ? "#166534" : "#a16207" }}>{summaryStatusText(s)}</td>
        </tr>
      )}
      {s.trips.map((t) => <TripRow key={t.id} t={t} refs={refs} />)}
      {!s.isPaid && s.abonos.map((a, i) => (
        <tr key={a.id || i}>
          <td style={{ ...cell, color: "#166534" }} colSpan={LABEL_SPAN}>Abono {tripDateLabel(a.date)}</td>
          <td style={{ ...cell, ...money, color: "#166534" }}>− {fmtCurrency(a.amount)}</td>
          <td style={cell}>{a.notes || ""}</td>
        </tr>
      ))}
    </>
  );
}
