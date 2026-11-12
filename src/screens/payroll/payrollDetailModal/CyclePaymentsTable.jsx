import { fmtCurrency } from "../../../utils/format";
import { formatRutForDisplay } from "../../../utils/rutUtils";
import { PAY_STATE_PILL } from "../payState";

const NUM = { textAlign: "right", whiteSpace: "nowrap" };
const BOLD = { fontWeight: 700 };

const netTitle = (r) => `Bruto ${fmtCurrency(r.gross)} − anticipos ${fmtCurrency(r.advance)} + bonos ${fmtCurrency(r.bonus)}. Clic: ver sus días en esta nómina.`;

// El líquido de la persona en la nómina, que abre su detalle de pago.
function NetButton({ row, onShowPay }) {
  if (row.net == null) return <span title="La nómina ya no trae a esta persona">—</span>;
  return (
    <button
      type="button"
      onClick={() => onShowPay(row)}
      title={netTitle(row)}
      className="min-h-8 rounded px-1 tabular-nums text-[var(--color-accent)] underline decoration-dotted underline-offset-2 hover:bg-[var(--color-accent-soft)]"
    >
      {fmtCurrency(row.net)}
    </button>
  );
}

// El estado de una nómina y, si es la del detalle abierto, su marca.
function PayrollTag({ payroll }) {
  const pill = PAY_STATE_PILL[payroll.state] || PAY_STATE_PILL.pending;
  return (
    <>
      <span className={`ml-1.5 inline-block whitespace-nowrap rounded-full px-1.5 py-0.5 text-[10px] font-normal ${pill.cls}`}>{pill.label}</span>
      {payroll.isCurrent && <span className="ml-1.5 whitespace-nowrap text-[10px] font-normal text-[var(--color-accent)]">● esta nómina</span>}
    </>
  );
}

// Los pagos de un ciclo como tabla: un bloque por persona con sus nóminas, o
// uno por nómina con sus personas, una columna por labor, lo del ciclo y lo
// que la persona recibe en la nómina entera. En el teléfono, en tarjetas.
// El líquido abre lo que la persona cobró en esa nómina (`onShowPay`).
export function CyclePaymentsTable({ report, isMobile, onShowPay }) {
  const { groups, labors, totals, view } = report;
  const byPayroll = view === "payroll";
  const columns = labors.length + 3;

  if (isMobile) {
    return (
      <div className="space-y-2">
        {groups.map((g) => (
          <div key={g.key} className="rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
            <div className="border-b border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2 text-sm font-semibold">
              {g.name}
              {byPayroll ? <PayrollTag payroll={g.payroll} /> : <span className="ml-1.5 text-xs font-normal text-[var(--color-muted)]">{formatRutForDisplay(g.rut)}</span>}
            </div>
            <ul className="divide-y divide-[var(--color-border)]">
              {g.rows.map((r) => (
                <li key={r.key} className="flex items-start gap-2 px-3 py-2 text-sm">
                  <div className="min-w-0 flex-1">
                    <div className="[overflow-wrap:anywhere]">
                      {byPayroll ? r.name : r.payroll.name}
                      {!byPayroll && <PayrollTag payroll={r.payroll} />}
                    </div>
                    <div className="mt-0.5 text-xs text-[var(--color-muted)]">
                      {labors.filter((l) => l.id in r.byLabor).map((l) => `${l.name} ${fmtCurrency(r.byLabor[l.id])}`).join(" · ")}
                    </div>
                  </div>
                  <div className="shrink-0 text-right tabular-nums">
                    <div className="font-semibold">{fmtCurrency(r.cycleAmount)}</div>
                    <div className="text-[11px] text-[var(--color-muted)]">
                      nómina: <NetButton row={r} onShowPay={onShowPay} />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
            {g.rows.length > 1 && (
              <div className="flex justify-between border-t border-[var(--color-border)] px-3 py-1.5 text-xs font-semibold tabular-nums">
                <span>{byPayroll ? "Total de la nómina en el ciclo" : "Total del ciclo"}</span>
                <span>{fmtCurrency(g.totals.cycleAmount)}</span>
              </div>
            )}
          </div>
        ))}
        <div className="flex justify-between rounded-lg bg-[var(--color-accent-soft)] px-3 py-2 text-sm font-semibold tabular-nums">
          <span>Total</span>
          <span>{fmtCurrency(totals.cycleAmount)}</span>
        </div>
      </div>
    );
  }

  return (
    <table className="w-full border-collapse text-sm" style={{ width: "100%", borderCollapse: "collapse" }}>
      <thead className="bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
        <tr>
          <th className="border border-[var(--color-border)] px-2 py-1.5 text-left" style={{ textAlign: "left" }}>
            {byPayroll ? "Nómina / Trabajador" : "Trabajador / Nómina"}
          </th>
          {labors.map((l) => (
            <th key={l.id} className="border border-[var(--color-border)] px-2 py-1.5" style={NUM}>{l.name}</th>
          ))}
          <th className="border border-[var(--color-border)] px-2 py-1.5" style={NUM}>Del ciclo</th>
          <th className="border border-[var(--color-border)] px-2 py-1.5" style={NUM} title="Lo que recibe en la nómina entera, con sus otros ciclos, anticipos y bonos">
            Líquido en la nómina
          </th>
        </tr>
      </thead>
      <tbody>
        {groups.map((g) => (
          <GroupRows key={g.key} group={g} labors={labors} byPayroll={byPayroll} columns={columns} onShowPay={onShowPay} />
        ))}
        <tr className="bg-[var(--color-accent-soft)]">
          <td className="border border-[var(--color-border)] px-2 py-1.5" style={BOLD}>Total</td>
          {labors.map((l) => (
            <td key={l.id} className="border border-[var(--color-border)] px-2 py-1.5 tabular-nums" style={{ ...NUM, ...BOLD }}>{fmtCurrency(totals.byLabor[l.id])}</td>
          ))}
          <td className="border border-[var(--color-border)] px-2 py-1.5 tabular-nums" style={{ ...NUM, ...BOLD }}>{fmtCurrency(totals.cycleAmount)}</td>
          <td className="border border-[var(--color-border)] px-2 py-1.5" style={NUM}></td>
        </tr>
      </tbody>
    </table>
  );
}

function GroupRows({ group, labors, byPayroll, columns, onShowPay }) {
  return (
    <>
      <tr className="bg-[var(--color-surface-2)]">
        <td colSpan={columns} className="border border-[var(--color-border)] px-2 py-1.5" style={BOLD}>
          {group.name}
          {byPayroll
            ? <PayrollTag payroll={group.payroll} />
            : <span className="ml-1.5 text-xs font-normal text-[var(--color-muted)]">{formatRutForDisplay(group.rut)}</span>}
        </td>
      </tr>
      {group.rows.map((r) => (
        <tr key={r.key}>
          <td className="border border-[var(--color-border)] py-1.5 pl-5 pr-2" style={{ paddingLeft: 20 }}>
            {byPayroll ? (
              <>
                {r.name}
                <span className="ml-1.5 text-xs text-[var(--color-muted)]">{formatRutForDisplay(r.rut)}</span>
              </>
            ) : (
              <>
                {r.payroll.name}
                <PayrollTag payroll={r.payroll} />
              </>
            )}
          </td>
          {labors.map((l) => (
            <td key={l.id} className="border border-[var(--color-border)] px-2 py-1.5 tabular-nums" style={NUM}>
              {l.id in r.byLabor ? fmtCurrency(r.byLabor[l.id]) : "—"}
            </td>
          ))}
          <td className="border border-[var(--color-border)] px-2 py-1.5 font-semibold tabular-nums" style={NUM}>{fmtCurrency(r.cycleAmount)}</td>
          <td className="border border-[var(--color-border)] px-2 py-0.5 tabular-nums" style={NUM}>
            <NetButton row={r} onShowPay={onShowPay} />
          </td>
        </tr>
      ))}
      {group.rows.length > 1 && (
        <tr>
          <td className="border border-[var(--color-border)] py-1.5 pl-5 pr-2 text-xs" style={{ paddingLeft: 20, fontStyle: "italic", fontWeight: 600 }}>
            {byPayroll ? "Subtotal de la nómina" : "Subtotal de la persona"}
          </td>
          {labors.map((l) => (
            <td key={l.id} className="border border-[var(--color-border)] px-2 py-1.5 text-xs tabular-nums" style={{ ...NUM, fontWeight: 600 }}>
              {l.id in group.totals.byLabor ? fmtCurrency(group.totals.byLabor[l.id]) : "—"}
            </td>
          ))}
          <td className="border border-[var(--color-border)] px-2 py-1.5 text-xs tabular-nums" style={{ ...NUM, fontWeight: 600 }}>{fmtCurrency(group.totals.cycleAmount)}</td>
          <td className="border border-[var(--color-border)] px-2 py-1.5 text-xs tabular-nums" style={{ ...NUM, fontWeight: 600 }}>{fmtCurrency(group.totals.net)}</td>
        </tr>
      )}
    </>
  );
}
