import { useState, useRef, useEffect, useMemo } from "react";
import { tripsService, paymentsService, fortnightsService } from "../../services/transportsService";
import { useCaptureActions } from "../../hooks/useCaptureActions";
import { PRINT_GRID_CSS } from "../../utils/printWindow";
import { fmtCurrency } from "../../utils/format";
import { cellH, cell } from "./printStyles";
import { attempt } from "../../utils/attempt";

// Balance general: cuánto se le debe a cada transportista, separado en vueltas
// sueltas, resúmenes sin quincena y quincenas, todo pendiente. El rango de
// fechas se aplica a la `date` de la vuelta y al cruce con el período
// (periodFrom/periodTo) del resumen o la quincena.
export function BalanceSummary({ carriers, reloadVersion }) {
  const [pendingTrips, setPendingTrips] = useState([]);
  const [pendingPayments, setPendingPayments] = useState([]);
  // Quincenas pendientes. Un resumen que está en una quincena se suma en la
  // columna de quincenas y no en la de resúmenes, para no contarlo dos veces.
  const [pendingFortnights, setPendingFortnights] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [expanded, setExpanded] = useState(true);
  const { busy, copy, download, print } = useCaptureActions();
  const printRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { error: err } = await attempt(async () => {
        const [trips, allPayments, allFortnights] = await Promise.all([
          tripsService.listPendingUnlinked(),
          paymentsService.listAll(),
          fortnightsService.listAll(),
        ]);
        if (cancelled) return;
        setPendingTrips(trips);
        setPendingPayments(allPayments.filter((p) => p.status === "pending"));
        setPendingFortnights(allFortnights.filter((p) => p.status === "pending"));
      });
      if (!cancelled) setLoading(false);
      if (err) throw err;
    })();
    return () => {
      cancelled = true;
    };
  }, [reloadVersion]);

  const tripsInRange = useMemo(
    () =>
      pendingTrips.filter(
        (t) => (!dateFrom || t.date >= dateFrom) && (!dateTo || t.date <= dateTo),
      ),
    [pendingTrips, dateFrom, dateTo],
  );

  const paymentsInRange = useMemo(
    () =>
      pendingPayments.filter((p) => {
        if (!dateFrom && !dateTo) return true;
        const pFrom = p.periodFrom || p.periodTo || "";
        const pTo = p.periodTo || p.periodFrom || "";
        if (!pFrom && !pTo) return true; // sin período → siempre incluir
        if (dateFrom && pTo && pTo < dateFrom) return false;
        if (dateTo && pFrom && pFrom > dateTo) return false;
        return true;
      }),
    [pendingPayments, dateFrom, dateTo],
  );

  // Mismo filtro que los resúmenes: cruce de períodos, y una quincena sin
  // período entra igual.
  const fortnightsInRange = useMemo(
    () =>
      pendingFortnights.filter((q) => {
        if (!dateFrom && !dateTo) return true;
        const qFrom = q.periodFrom || q.periodTo || "";
        const qTo = q.periodTo || q.periodFrom || "";
        if (!qFrom && !qTo) return true;
        if (dateFrom && qTo && qTo < dateFrom) return false;
        if (dateTo && qFrom && qFrom > dateTo) return false;
        return true;
      }),
    [pendingFortnights, dateFrom, dateTo],
  );

  // Resúmenes pendientes por id, para atribuir cada resumen de una quincena a
  // su transportista.
  const pendingPaymentsById = useMemo(
    () => new Map(pendingPayments.map((p) => [p.id, p])),
    [pendingPayments],
  );

  const rows = useMemo(() => {
    const map = new Map();
    const ensure = (carrierId) => {
      if (!map.has(carrierId)) {
        const carrier = carriers.find((c) => c.id === carrierId);
        map.set(carrierId, {
          carrierId,
          name: carrier?.name || "(transportista eliminado)",
          alias: carrier?.alias || "—",
          tripCount: 0,
          tripTotal: 0,
          paymentCount: 0,
          paymentTotal: 0,
          fortnightCount: 0,
          fortnightTotal: 0,
        });
      }
      return map.get(carrierId);
    };
    for (const t of tripsInRange) {
      const e = ensure(t.carrierId);
      e.tripCount += 1;
      e.tripTotal += Number(t.amount) || 0;
    }
    // Saldo del resumen: total menos abonos, sin bajar de 0. El balance
    // muestra lo que falta pagar, no el total.
    const pendingOf = (p) => {
      const total = Number(p?.total) || 0;
      const abonado = (p?.abonos || []).reduce((s, a) => s + (Number(a.amount) || 0), 0);
      return Math.max(0, total - abonado);
    };
    // Resúmenes sueltos (sin quincena). Los que están en una quincena se suman
    // abajo, en la columna de quincenas.
    for (const p of paymentsInRange) {
      if (p.payrollId) continue;
      const e = ensure(p.carrierId);
      e.paymentCount += 1;
      e.paymentTotal += pendingOf(p);
    }
    // Quincenas: el saldo de cada resumen se suma a su transportista, así una
    // quincena con varios transportistas se reparte entre ellos.
    for (const q of fortnightsInRange) {
      const totalsByCarrier = new Map();
      for (const pid of q.paymentIds || []) {
        const p = pendingPaymentsById.get(pid);
        if (!p) continue;
        totalsByCarrier.set(
          p.carrierId,
          (totalsByCarrier.get(p.carrierId) || 0) + pendingOf(p),
        );
      }
      for (const [cid, amt] of totalsByCarrier) {
        const e = ensure(cid);
        e.fortnightCount += 1;
        e.fortnightTotal += amt;
      }
    }
    return [...map.values()]
      .map((e) => ({ ...e, grandTotal: e.tripTotal + e.paymentTotal + e.fortnightTotal }))
      .filter((e) => e.tripCount + e.paymentCount + e.fortnightCount > 0)
      .sort((a, b) => b.grandTotal - a.grandTotal);
  }, [carriers, tripsInRange, paymentsInRange, fortnightsInRange, pendingPaymentsById]);

  const grandTotal = rows.reduce((s, r) => s + r.grandTotal, 0);
  const tripsTotal = rows.reduce((s, r) => s + r.tripTotal, 0);
  const paymentsTotal = rows.reduce((s, r) => s + r.paymentTotal, 0);
  const fortnightsTotal = rows.reduce((s, r) => s + r.fortnightTotal, 0);

  const handleCopyImage = () => copy(printRef.current);
  const handleDownload = () => download(printRef.current, "balance-transportes.png");
  const handlePrint = () => print(printRef.current, { title: "Balance de transportes", css: PRINT_GRID_CSS });

  const rangeLabel = (() => {
    if (!dateFrom && !dateTo) return "Todo lo pendiente";
    if (dateFrom && dateTo) return `${dateFrom} → ${dateTo}`;
    if (dateFrom) return `desde ${dateFrom}`;
    return `hasta ${dateTo}`;
  })();

  return (
    <div className="mb-5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]"
      >
        <span className="flex items-center gap-2">
          <span className="text-[var(--color-muted)]">{expanded ? "▾" : "▸"}</span>
          <span className="font-medium">Balance general de transportes</span>
          <span className="text-xs text-[var(--color-muted)]">· {rangeLabel}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-[var(--color-muted)]">
            {rows.length} transportista{rows.length === 1 ? "" : "s"}
          </span>
          <span className="font-semibold tabular-nums text-[var(--color-accent)]">
            {fmtCurrency(grandTotal)}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)] p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-xs">
              <span className="text-[var(--color-muted)]">Desde</span>
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
              />
            </label>
            <label className="flex items-center gap-1 text-xs">
              <span className="text-[var(--color-muted)]">Hasta</span>
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-sm"
              />
            </label>
            {(dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setDateFrom("");
                  setDateTo("");
                }}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
              >
                Limpiar
              </button>
            )}
            <div className="ml-auto flex gap-1">
              <button
                onClick={handleCopyImage}
                disabled={busy === "copy" || rows.length === 0}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                {busy === "copy" ? "..." : "📋 Copiar imagen"}
              </button>
              <button
                onClick={handleDownload}
                disabled={busy === "download" || rows.length === 0}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                {busy === "download" ? "..." : "📥 PNG"}
              </button>
              <button
                onClick={handlePrint}
                disabled={rows.length === 0}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                🖨 Imprimir
              </button>
            </div>
          </div>

          {loading ? (
            <div className="py-4 text-center text-xs text-[var(--color-muted)]">
              Cargando balance...
            </div>
          ) : rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] py-4 text-center text-xs text-[var(--color-muted)]">
              Sin saldos pendientes en este rango.
            </div>
          ) : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <div
              ref={printRef}
              style={{
                background: "#ffffff",
                color: "#000",
                padding: 16,
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
              }}
            >
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  Balance de transportes pendientes
                </div>
                <div style={{ fontSize: 11, color: "#555" }}>
                  Rango: {rangeLabel}
                  {" · "}Generado{" "}
                  {new Date().toLocaleDateString("es-CL", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })}
                </div>
              </div>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ background: "#9dc3e6" }}>
                    <th style={cellH}>Transportista</th>
                    <th style={{ ...cellH, textAlign: "right" }}>Vueltas sueltas</th>
                    <th style={{ ...cellH, textAlign: "right" }}>$ vueltas</th>
                    <th style={{ ...cellH, textAlign: "right" }}>Resúmenes</th>
                    <th style={{ ...cellH, textAlign: "right" }}>$ resúmenes</th>
                    <th style={{ ...cellH, textAlign: "right" }}>Quincenas</th>
                    <th style={{ ...cellH, textAlign: "right" }}>$ quincenas</th>
                    <th style={{ ...cellH, textAlign: "right" }}>Total a pagar</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.carrierId}>
                      <td style={cell}>
                        <span style={{ fontWeight: 600 }}>{r.alias}</span>
                        <span style={{ color: "#666", marginLeft: 6, fontSize: 11 }}>
                          {r.name}
                        </span>
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {r.tripCount || ""}
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {r.tripTotal > 0 ? fmtCurrency(r.tripTotal) : ""}
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {r.paymentCount || ""}
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {r.paymentTotal > 0 ? fmtCurrency(r.paymentTotal) : ""}
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {r.fortnightCount || ""}
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}>
                        {r.fortnightTotal > 0 ? fmtCurrency(r.fortnightTotal) : ""}
                      </td>
                      <td
                        style={{
                          ...cell,
                          textAlign: "right",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {fmtCurrency(r.grandTotal)}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "#c6efce" }}>
                    <td style={{ ...cell, fontWeight: 700 }}>TOTAL</td>
                    <td style={cell}></td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {tripsTotal > 0 ? fmtCurrency(tripsTotal) : ""}
                    </td>
                    <td style={cell}></td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {paymentsTotal > 0 ? fmtCurrency(paymentsTotal) : ""}
                    </td>
                    <td style={cell}></td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                      {fortnightsTotal > 0 ? fmtCurrency(fortnightsTotal) : ""}
                    </td>
                    <td
                      style={{
                        ...cell,
                        textAlign: "right",
                        fontWeight: 700,
                        fontSize: 13,
                        fontVariantNumeric: "tabular-nums",
                      }}
                    >
                      {fmtCurrency(grandTotal)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
