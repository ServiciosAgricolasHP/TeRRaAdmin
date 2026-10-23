import { fmtCurrency } from "../../../utils/format";
import { fmtDayShortEs } from "../helpers";

// La tabla del resumen, por subfaena o por labor, con el selector de efectivo
// pendiente de otras nóminas y sus acciones de copiar, descargar e imprimir.
export function SummaryTable({ bonusAdvanceSummary, payroll, table }) {
  "use no memo";
  const { activeSummary, deferredCash, grandTotals, handleCopySummaryImage, handleDownloadSummaryXlsx, handlePrintSummary, labelColumns, laborSummaryLoading, pendingMode, pendingSummaryRows, summaryBusy, summaryCaptureRef, setSummaryPending, setSummaryShowLabor, summaryDisplayRows, summaryPending, summaryShowLabor } = table;
  const labelSpan = labelColumns.length;
  return (
    <div className="mt-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
          <button
            type="button"
            onClick={() => setSummaryShowLabor(false)}
            className={`px-2.5 py-1.5 ${!summaryShowLabor ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
          >
            Sin labores
          </button>
          <button
            type="button"
            onClick={() => setSummaryShowLabor(true)}
            className={`border-l border-[var(--color-border)] px-2.5 py-1.5 ${summaryShowLabor ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)]" : "bg-[var(--color-surface)] hover:bg-[var(--color-accent-soft)]"}`}
          >
            Con labores
          </button>
        </div>
        {pendingSummaryRows.length > 0 && (
          <div
            className="inline-flex overflow-hidden rounded-md border border-[var(--color-warning)] text-xs"
            title="Efectivo que quedó debiendo de nóminas anteriores. Se entrega aparte, con su propio sobre."
          >
            {[
              { v: "none", l: "Esta nómina", t: "Solo esta nómina, como siempre." },
              { v: "with", l: "Con efectivo pendiente", t: "Esta nómina más el efectivo que se debe de antes." },
              { v: "onlyPending", l: "Solo efectivo pendiente", t: "De todo el efectivo, hoy sale solo el pendiente: las transferencias de esta nómina más el efectivo que se debía de antes. El efectivo de esta nómina queda para la vuelta siguiente." },
            ].map((o, i) => (
              <button
                key={o.v}
                type="button"
                onClick={() => setSummaryPending(o.v)}
                title={o.t}
                className={`px-2.5 py-1.5 ${i > 0 ? "border-l border-[var(--color-warning)]" : ""} ${
                  summaryPending === o.v
                    ? "bg-[var(--color-warning)] text-white"
                    : "bg-[var(--color-surface)] hover:bg-[var(--color-warning-soft)]"
                }`}
              >
                {o.l}
              </button>
            ))}
          </div>
        )}
        <div className="flex gap-1">
          <button
            onClick={handleCopySummaryImage}
            disabled={summaryBusy === "image" || !activeSummary}
            title="Copiar como imagen"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {summaryBusy === "image" ? "..." : "📋 Copiar"}
          </button>
          <button
            onClick={handleDownloadSummaryXlsx}
            disabled={summaryBusy === "xlsx" || !activeSummary}
            title="Descargar como Excel"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {summaryBusy === "xlsx" ? "..." : "📥 Descargar"}
          </button>
          <button
            onClick={handlePrintSummary}
            disabled={!activeSummary}
            title="Imprimir"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            🖨 Imprimir
          </button>
        </div>
      </div>

      {summaryShowLabor && laborSummaryLoading ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] px-3 py-4 text-center text-xs text-[var(--color-muted)]">
          Cargando desglose por labor…
        </div>
      ) : (
        <div ref={summaryCaptureRef} className="rounded-md border border-[var(--color-border)]" style={{ background: "#fff" }}>
        <div className="px-3 pt-2.5" style={{ color: "#222" }}>
          <div className="text-sm font-semibold">{payroll.name}</div>
          <div className="text-[11px]" style={{ color: "#666" }}>
            Resumen {summaryShowLabor ? "por labor" : "por subfaena"}
            {pendingMode === "with" && " · incluye efectivo pendiente de nóminas anteriores"}
            {pendingMode === "onlyPending" && " · transferencias + solo el efectivo pendiente de antes"}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs" style={{ color: "#222", borderCollapse: "collapse" }}>
            <thead style={{ background: "#B7DEE8" }}>
              <tr>
                {labelColumns.map((c) => (
                  <th key={c.key} className="px-2 py-1.5 text-left">{c.label}</th>
                ))}
                <th className="px-2 py-1.5 text-right">Transferencia</th>
                <th className="px-2 py-1.5 text-right">Efectivo</th>
                <th className="px-2 py-1.5 text-right">TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {summaryDisplayRows.map((entry, i) => {
                if (entry.subtotal) {
                  return (
                    <tr key={`sub_${i}`} style={{ background: "#F2F2F2", fontStyle: "italic", fontWeight: 700 }}>
                      <td className="px-2 py-1 text-right" colSpan={labelSpan} style={{ border: "1px solid #999" }}>Sub total por faena</td>
                      <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(entry.subtotal.bank)}</td>
                      <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(entry.subtotal.cash)}</td>
                      <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(entry.subtotal.total)}</td>
                    </tr>
                  );
                }
                const r = entry.row;
                return (
                  <tr key={`row_${i}`}>
                    {entry.labels.map((text, k) => (
                      <td
                        key={labelColumns[k].key}
                        className="px-2 py-1"
                        style={labelColumns[k].key === "period" ? { border: "1px solid #999", fontSize: 11, color: "#444" } : { border: "1px solid #999" }}
                      >
                        {text}
                      </td>
                    ))}
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(r.bank)}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(r.cash)}</td>
                    <td className="px-2 py-1 text-right font-semibold tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(r.total)}</td>
                  </tr>
                );
              })}
              {pendingMode !== "none" && pendingSummaryRows.map((r) => (
                <tr key={`pend_${r.pendingId}`} style={{ background: "#FFF4E5" }}>
                  <td className="px-2 py-1" style={{ border: "1px solid #999" }}>—</td>
                  <td
                    className="px-2 py-1"
                    colSpan={labelSpan - 2}
                    style={{ border: "1px solid #999" }}
                  >
                    💵 Efectivo pendiente — {r.name}
                    <span style={{ color: "#666", fontSize: 11 }}> · {r.count} pers.</span>
                  </td>
                  <td className="px-2 py-1" style={{ border: "1px solid #999", fontSize: 11, color: "#444" }}>
                    {r.period ? `${fmtDayShortEs(r.period.first)} → ${fmtDayShortEs(r.period.last)}` : "—"}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(0)}</td>
                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(r.cash)}</td>
                  <td className="px-2 py-1 text-right font-semibold tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(r.total)}</td>
                </tr>
              ))}
            </tbody>
            {activeSummary && (
              <tfoot>
                {bonusAdvanceSummary.bonus.total > 0 && (
                  <tr style={{ background: "#EAF3FA" }}>
                    <td colSpan={labelSpan} className="px-2 py-1 text-right" style={{ border: "1px solid #999" }}>Bonos</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(bonusAdvanceSummary.bonus.bank)}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(bonusAdvanceSummary.bonus.cash)}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(bonusAdvanceSummary.bonus.total)}</td>
                  </tr>
                )}
                {bonusAdvanceSummary.advance.total > 0 && (
                  <tr style={{ background: "#EAF3FA" }}>
                    <td colSpan={labelSpan} className="px-2 py-1 text-right" style={{ border: "1px solid #999" }}>Anticipos</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>− {fmtCurrency(bonusAdvanceSummary.advance.bank)}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>− {fmtCurrency(bonusAdvanceSummary.advance.cash)}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>− {fmtCurrency(bonusAdvanceSummary.advance.total)}</td>
                  </tr>
                )}
                {deferredCash > 0 && (
                  <tr style={{ background: "#EAF3FA" }}>
                    <td colSpan={labelSpan} className="px-2 py-1 text-right" style={{ border: "1px solid #999" }}>
                      Efectivo que queda pendiente
                    </td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(0)}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>− {fmtCurrency(deferredCash)}</td>
                    <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>− {fmtCurrency(deferredCash)}</td>
                  </tr>
                )}
                <tr style={{ background: "#FFE699", fontWeight: 700 }}>
                  <td colSpan={labelSpan} className="px-2 py-1" style={{ border: "1px solid #999" }}>
                    {pendingMode === "onlyPending" ? "TOTAL A PAGAR" : "TOTAL"}
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(grandTotals.bank)}</td>
                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(grandTotals.cash)}</td>
                  <td className="px-2 py-1 text-right tabular-nums" style={{ border: "1px solid #999" }}>{fmtCurrency(grandTotals.total)}</td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
        </div>
      )}
    </div>
  );
}
