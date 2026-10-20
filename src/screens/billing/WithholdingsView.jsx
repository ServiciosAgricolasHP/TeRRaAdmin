import React, { useState } from "react";
import { formatRutForDisplay } from "../../utils/rutUtils";
import { useIsMobile } from "../../hooks/useIsMobile";
import { fmtCurrency } from "../../utils/format";
import { PaymentStatusSelect } from "./PaymentStatusSelect";

// Vista de Retenciones: agrupa facturas con estado `net_only` por contraparte.
// Cada grupo es expandible — muestra los docs individuales con su select de
// estado por si el usuario quiere revertir el "solo neto" a otro estado.
// Cada grupo tiene su propia toolbar de export (📋📥🖨📊) para que se pueda
// compartir el resumen de una sola contraparte sin armar uno general.
export function WithholdingsView({ groups, onSelectDoc, onSetStatus, onGroupExport, groupBusy = {}, groupKeyOf = (g) => g?.rut || "__sin_rut__" }) {
  const isMobile = useIsMobile();
  const [expanded, setExpanded] = useState(() => new Set());
  const toggle = (rut) => {
    setExpanded((prev) => {
      const n = new Set(prev);
      if (n.has(rut)) n.delete(rut); else n.add(rut);
      return n;
    });
  };
  if (groups.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-[var(--color-border)] text-sm text-[var(--color-muted)]">
        No hay facturas marcadas como "Solo neto" en este período.
      </div>
    );
  }
  if (isMobile) {
    return (
      <div className="divide-y divide-[var(--color-border)] rounded-md border border-[var(--color-border)]">
        {groups.map((g) => {
          const isOpen = expanded.has(g.rut);
          const gk = groupKeyOf(g);
          const busy = groupBusy[gk];
          const fireExport = (action) => onGroupExport && onGroupExport(action, g);
          return (
            <div key={g.rut || "_sinrut_"}>
              <div
                className="cursor-pointer px-3 py-2.5 hover:bg-[var(--color-surface-2)]"
                onClick={() => toggle(g.rut)}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5 text-sm font-medium">
                      <span className="shrink-0 text-[var(--color-muted)]">{isOpen ? "▾" : "▸"}</span>
                      <span className="truncate">{g.razon || "—"}</span>
                    </div>
                    <div className="pl-4 font-mono text-[10px] text-[var(--color-muted)]">
                      {formatRutForDisplay(g.rut)} · {g.count} factura{g.count === 1 ? "" : "s"}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <div className="text-sm font-semibold tabular-nums">{fmtCurrency(g.total)}</div>
                    <div className="text-[10px] tabular-nums text-[var(--color-muted)]">
                      Neto {fmtCurrency(g.neto)} · <span className="text-[var(--color-accent)]">IVA {fmtCurrency(g.iva)}</span>
                    </div>
                  </div>
                </div>
                {onGroupExport && (
                  <div onClick={(e) => e.stopPropagation()} className="mt-2 flex flex-wrap gap-1 pl-4">
                    <button
                      onClick={() => fireExport("copy")}
                      disabled={!!busy}
                      title="Copiar resumen de esta contraparte"
                      className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                    >
                      {busy === "copy" ? "…" : "📋 Copiar"}
                    </button>
                    <button
                      onClick={() => fireExport("png")}
                      disabled={!!busy}
                      title="Descargar PNG"
                      className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                    >
                      {busy === "png" ? "…" : "📥 PNG"}
                    </button>
                    <button
                      onClick={() => fireExport("print")}
                      disabled={!!busy}
                      title="Imprimir"
                      className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                    >
                      🖨 Imprimir
                    </button>
                    <button
                      onClick={() => fireExport("xlsx")}
                      disabled={!!busy}
                      title="Exportar XLSX"
                      className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                    >
                      {busy === "xlsx" ? "…" : "📊 XLSX"}
                    </button>
                  </div>
                )}
              </div>
              {isOpen && (
                <div className="divide-y divide-[var(--color-border)] bg-[var(--color-surface-2)]/40">
                  {g.docs.map((d) => (
                    <div key={d.id} className="px-3 py-2 pl-7 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="font-mono">{d.fechaEmision}</span>
                        <span className="rounded bg-[var(--color-surface-2)] px-1.5 py-0.5">{d.tipo}</span>
                        <span className="text-[var(--color-muted)]">{d.tipoLabel}</span>
                        <span className="font-mono tabular-nums">· Folio {d.folio}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                        <div className="tabular-nums">
                          Neto {fmtCurrency(d.neto)} · <span className="text-[var(--color-accent)]">IVA {fmtCurrency(d.iva)}</span> · <span className="font-semibold">{fmtCurrency(d.total)}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <PaymentStatusSelect value={d.paymentStatus || "unpaid"} onChange={(next) => onSetStatus(d, next)} />
                          <button
                            onClick={(e) => { e.stopPropagation(); onSelectDoc(d); }}
                            className="min-h-[32px] rounded-md border border-[var(--color-border)] px-1.5 py-1 text-[10px] hover:bg-[var(--color-accent-soft)]"
                          >
                            {d.notes ? "📝" : "ℹ"}
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="flex-1 overflow-auto rounded-md border border-[var(--color-border)]">
      <table className="w-full text-sm">
        <thead className="sticky top-0 bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
          <tr>
            <th className="px-2 py-2 text-left"></th>
            <th className="px-2 py-2 text-left">Empresa</th>
            <th className="px-2 py-2 text-left">RUT</th>
            <th className="px-2 py-2 text-right">N° Facturas</th>
            <th className="px-2 py-2 text-right">Neto</th>
            <th className="px-2 py-2 text-right">IVA retenido</th>
            <th className="px-2 py-2 text-right">Total</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => {
            const isOpen = expanded.has(g.rut);
            const gk = groupKeyOf(g);
            const busy = groupBusy[gk];
            const stop = (e) => e.stopPropagation();
            const fireExport = (action) => onGroupExport && onGroupExport(action, g);
            return (
              <React.Fragment key={g.rut || "_sinrut_"}>
                <tr
                  className="cursor-pointer border-t border-[var(--color-border)] hover:bg-[var(--color-surface-2)]"
                  onClick={() => toggle(g.rut)}
                >
                  <td className="px-2 py-2 w-6 text-center text-[var(--color-muted)]">{isOpen ? "▾" : "▸"}</td>
                  <td className="px-2 py-2 font-medium truncate max-w-[300px]">{g.razon || "—"}</td>
                  <td className="px-2 py-2 font-mono text-xs">{formatRutForDisplay(g.rut)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{g.count}</td>
                  <td className="px-2 py-2 text-right tabular-nums">{fmtCurrency(g.neto)}</td>
                  <td className="px-2 py-2 text-right font-semibold tabular-nums text-[var(--color-accent)]">{fmtCurrency(g.iva)}</td>
                  <td className="px-2 py-2 text-right tabular-nums">
                    <div className="flex items-center justify-end gap-1.5">
                      <span>{fmtCurrency(g.total)}</span>
                      {onGroupExport && (
                        <div onClick={stop} className="ml-2 flex gap-0.5">
                          <button
                            onClick={() => fireExport("copy")}
                            disabled={!!busy}
                            title="Copiar resumen de esta contraparte"
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                          >
                            {busy === "copy" ? "…" : "📋"}
                          </button>
                          <button
                            onClick={() => fireExport("png")}
                            disabled={!!busy}
                            title="Descargar PNG"
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                          >
                            {busy === "png" ? "…" : "📥"}
                          </button>
                          <button
                            onClick={() => fireExport("print")}
                            disabled={!!busy}
                            title="Imprimir"
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                          >
                            🖨
                          </button>
                          <button
                            onClick={() => fireExport("xlsx")}
                            disabled={!!busy}
                            title="Exportar XLSX"
                            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
                          >
                            {busy === "xlsx" ? "…" : "📊"}
                          </button>
                        </div>
                      )}
                    </div>
                  </td>
                </tr>
                {isOpen && g.docs.map((d) => (
                  <tr key={d.id} className="border-t border-[var(--color-border)] bg-[var(--color-surface-2)]/40">
                    <td></td>
                    <td colSpan={2} className="px-2 py-1.5 text-xs">
                      <span className="font-mono">{d.fechaEmision}</span>
                      <span className="ml-2 rounded bg-[var(--color-surface-2)] px-1.5 py-0.5">{d.tipo}</span>
                      <span className="ml-1 text-[var(--color-muted)]">{d.tipoLabel}</span>
                      <span className="ml-2 font-mono tabular-nums">Folio {d.folio}</span>
                    </td>
                    <td className="px-2 py-1.5 text-right">
                      <PaymentStatusSelect value={d.paymentStatus || "unpaid"} onChange={(next) => onSetStatus(d, next)} />
                    </td>
                    <td className="px-2 py-1.5 text-right tabular-nums">{fmtCurrency(d.neto)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums text-[var(--color-accent)]">{fmtCurrency(d.iva)}</td>
                    <td className="px-2 py-1.5 text-right tabular-nums">
                      {fmtCurrency(d.total)}
                      <button
                        onClick={(e) => { e.stopPropagation(); onSelectDoc(d); }}
                        className="ml-2 rounded-md border border-[var(--color-border)] px-1.5 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
                      >
                        {d.notes ? "📝" : "ℹ"}
                      </button>
                    </td>
                  </tr>
                ))}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
