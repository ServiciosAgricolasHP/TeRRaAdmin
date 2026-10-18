import { useState, useRef, useEffect, useMemo } from "react";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../../utils/imageCapture";
import { useToast } from "../../contexts/ToastContext";
import { fmtCurrency } from "../../utils/format";
import { CarrierSummariesModal } from "./CarrierSummariesModal";
import { cellH, cell } from "./printStyles";
import { paymentSplit, compareFortnightPeriod, compactDate } from "./fortnights";

// Columnas fijas del balance de quincenas: el transportista y el total quedan
// quietos al desplazar el pivot. Se anclan al contenedor con `overflowX` que
// envuelve al printRef; en la captura y la impresión no hay scroll y se
// comportan como cualquier otra celda.
//
// Cada fila pasa su fondo (encabezado, cuerpo y pies usan uno distinto). Tiene
// que ser opaco, o se transparenta lo que pasa por debajo, y de color (en el
// cuerpo, `#eaf4fb` en las dos columnas), para que se lea como el marco de lo
// que se desplaza y no como un hueco. La línea de corte es una sombra de 2px #333,
// más marcada que el borde de la grilla (1px #999), y no un borde: con
// `border-collapse: collapse` el borde es compartido y se va con la celda que
// se mueve.
const stickyLeft = (background, zIndex = 1) => ({
  position: "sticky", left: 0, zIndex, background, boxShadow: "2px 0 0 #333",
});

const stickyRight = (background, zIndex = 1) => ({
  position: "sticky", right: 0, zIndex, background, boxShadow: "-2px 0 0 #333",
});

// Ancho de las columnas del balance de quincenas: entran **8 quincenas** sin
// desplazarse (8 × 92 + 150 del nombre + ~115 del total ≈ 1.000 px, con el
// sidebar abierto desde 1280 px de pantalla). Las demás quedan detrás del
// scroll, con las columnas de los extremos fijas.
const FORTNIGHT_COL_W = 92;

const CARRIER_COL_W = 150;

export function FortnightBalanceSummary({ carriers, fortnights, payments }) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(true);
  const [busy, setBusy] = useState("");
  const printRef = useRef(null);
  // Fila del transportista cuyo detalle se está mirando, o null.
  const [detalle, setDetalle] = useState(null);

  // Muestra también a quienes ya cobraron todo lo suyo en las quincenas
  // activas, para cuadrar una quincena antes de cerrarla. Se guarda en
  // localStorage.
  const [showAllSummaries, setShowAllSummaries] = useState(() => {
    try { return localStorage.getItem("transports.quincenasBalance.showAll") === "true"; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem("transports.quincenasBalance.showAll", String(showAllSummaries)); } catch { /* noop */ }
  }, [showAllSummaries]);

  // El título cambia con el modo y viaja al PNG y a la impresión: una imagen
  // rotulada "pendientes" no debe llevar filas ya pagadas, que podrían
  // terminar pagándose dos veces.
  const titulo = showAllSummaries
    ? "Balance de quincenas activas"
    : "Balance de quincenas pendientes";

  const paymentsById = useMemo(
    () => new Map(payments.map((p) => [p.id, p])),
    [payments],
  );

  // Pivot: filas = transportistas, columnas = quincenas, celda = pendiente y
  // pagado del transportista en esa quincena. Solo entran las quincenas que no
  // están pagadas (status "paid") y tienen al menos un resumen pendiente. La
  // celda muestra el pendiente y, si hay algo pagado, una segunda línea
  // "pagado: $X" en verde.
  const { pendingFortnights, rows } = useMemo(() => {
    const qList = [];
    const pendMap = new Map(); // carrierId → Map(quincenaId → amount)
    const paidMap = new Map(); // carrierId → Map(quincenaId → amount)
    for (const q of fortnights) {
      if (q.status === "paid") continue;
      const pendByCarrier = new Map();
      const paidByCarrier = new Map();
      for (const pid of q.paymentIds || []) {
        const p = paymentsById.get(pid);
        if (!p) continue;
        const cid = p.carrierId || "__none__";
        const { pending, paid } = paymentSplit(p);
        if (pending > 0) pendByCarrier.set(cid, (pendByCarrier.get(cid) || 0) + pending);
        if (paid > 0) paidByCarrier.set(cid, (paidByCarrier.get(cid) || 0) + paid);
      }
      // Sin ningún resumen pendiente, la quincena queda fuera aunque siga en
      // "pending" (p. ej. si sus resúmenes se pagaron uno por uno).
      if (pendByCarrier.size === 0) continue;
      qList.push(q);
      for (const [cid, amt] of pendByCarrier) {
        if (!pendMap.has(cid)) pendMap.set(cid, new Map());
        pendMap.get(cid).set(q.id, amt);
      }
      for (const [cid, amt] of paidByCarrier) {
        if (!paidMap.has(cid)) paidMap.set(cid, new Map());
        paidMap.get(cid).set(q.id, amt);
      }
    }
    qList.sort(compareFortnightPeriod);
    // Filas: por defecto, solo los transportistas con algo pendiente. Con
    // `showAllSummaries` entran también los que ya cobraron todo lo suyo en
    // estas quincenas (filas con $0 pendiente). Las columnas son las mismas en
    // los dos modos.
    const carrierIds = new Set([...pendMap.keys(), ...paidMap.keys()]);
    const carrierRows = [];
    for (const cid of carrierIds) {
      const pm = pendMap.get(cid) || new Map();
      const pd = paidMap.get(cid) || new Map();
      const pendingTotal = [...pm.values()].reduce((s, v) => s + v, 0);
      const paidTotal = [...pd.values()].reduce((s, v) => s + v, 0);
      // Sin pendiente ni pagado no hay fila en ningún modo: son resúmenes en $0
      // (vueltas sin costo de transporte propio).
      if (pendingTotal <= 0 && paidTotal <= 0) continue;
      if (pendingTotal <= 0 && !showAllSummaries) continue;
      const c = carriers.find((x) => x.id === cid);
      carrierRows.push({
        carrierId: cid,
        alias: c?.alias || (cid === "__none__" ? "Sin transportista" : "—"),
        name: c?.name || "",
        pending: pm,
        paid: pd,
        pendingTotal,
        paidTotal,
      });
    }
    // Mayor pendiente primero; a igual pendiente, mayor pagado.
    carrierRows.sort((a, b) => (b.pendingTotal - a.pendingTotal) || (b.paidTotal - a.paidTotal));
    return { pendingFortnights: qList, rows: carrierRows };
  }, [carriers, fortnights, paymentsById, showAllSummaries]);

  const grandPending = rows.reduce((s, r) => s + r.pendingTotal, 0);
  const grandPaid = rows.reduce((s, r) => s + r.paidTotal, 0);
  // Totales por columna para el pie: pendiente y pagado por separado.
  const colTotals = useMemo(() => {
    const map = new Map();
    for (const q of pendingFortnights) {
      let pend = 0;
      let paid = 0;
      for (const r of rows) {
        pend += r.pending.get(q.id) || 0;
        paid += r.paid.get(q.id) || 0;
      }
      map.set(q.id, { pending: pend, paid });
    }
    return map;
  }, [pendingFortnights, rows]);
  const fortnightCount = pendingFortnights.length;

  const handleCopyImage = async () => {
    if (!printRef.current) return;
    setBusy("copy");
    try {
      const blob = await captureFullWidthBlob(printRef.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada");
    } catch (err) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handleDownload = async () => {
    if (!printRef.current) return;
    setBusy("download");
    try {
      const dataUrl = await captureFullWidthDataUrl(printRef.current);
      const link = document.createElement("a");
      link.download = showAllSummaries
        ? "balance-quincenas-activas.png"
        : "balance-quincenas.png";
      link.href = dataUrl;
      link.click();
    } finally {
      setBusy("");
    }
  };

  // Imprime la MISMA captura que 📋 y 📥, no el HTML de la tabla: el navegador
  // no pagina de costado y un pivot más ancho que la hoja perdería las
  // quincenas de la derecha. `captureFullWidthDataUrl` clona fuera de pantalla
  // a `max-content`, así las tres salidas muestran lo mismo; a cambio, el PDF
  // no trae texto seleccionable.
  const handlePrint = async () => {
    if (!printRef.current) return;
    setBusy("print");
    try {
      const dataUrl = await captureFullWidthDataUrl(printRef.current);
      const win = window.open("", "_blank", "width=900,height=700");
      if (!win) {
        toast.warning("Permite las ventanas emergentes para imprimir.");
        return;
      }
      // `print()` va en el onload de la imagen: antes de que se decodifique el
      // dataUrl, la hoja sale en blanco.
      // Siempre una sola hoja: la imagen se escala al área de página
      // (`max-height: 100vh` en impresión, con `width/height: auto` para
      // mantener la proporción) en vez de partir el balance en dos.
      win.document.write(`<!DOCTYPE html><html><head><title>${titulo}</title>
        <style>
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
          /* Apaisado. Va al nivel superior y no adentro de @media print: la
             regla solo aplica a medios paginados igual, y anidada hay
             navegadores que la ignoran y salen en vertical. Sin tamaño de
             papel explícito para respetar el que tenga configurado (carta o
             A4) y solo cambiarle la orientación. */
          @page { size: landscape; margin: 8mm; }
          body { margin: 0; padding: 16px; background: #fff; }
          img { display: block; margin: 0 auto; max-width: 100%; height: auto; }
          @media print {
            html, body { height: 100%; }
            body { padding: 0; }
            img { max-width: 100%; max-height: 100vh; width: auto; height: auto; break-inside: avoid; page-break-inside: avoid; }
          }
        </style>
      </head><body><img alt="${titulo}" src="${dataUrl}" onload="window.focus(); window.print();"></body></html>`);
      win.document.close();
    } catch (err) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  return (
    <div className="mb-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)]">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-[var(--color-accent-soft)]"
      >
        <span className="flex items-center gap-2">
          <span className="text-[var(--color-muted)]">{expanded ? "▾" : "▸"}</span>
          <span className="font-medium">{titulo}</span>
        </span>
        <span className="flex items-baseline gap-2">
          <span className="text-xs text-[var(--color-muted)]">
            {fortnightCount} quincena{fortnightCount === 1 ? "" : "s"} · {rows.length} transportista{rows.length === 1 ? "" : "s"}
          </span>
          <span className="font-semibold tabular-nums text-[var(--color-accent)]">
            {fmtCurrency(grandPending)}
          </span>
        </span>
      </button>

      {expanded && (
        <div className="border-t border-[var(--color-border)] p-3">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              onClick={() => setShowAllSummaries((v) => !v)}
              role="switch"
              aria-checked={showAllSummaries}
              title="Mostrar también a los transportistas que ya cobraron todo lo suyo en estas quincenas"
              className="flex min-h-[32px] items-center gap-2 rounded px-1 text-xs hover:opacity-80"
            >
              <span
                className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                  showAllSummaries ? "bg-[var(--color-accent)]" : "bg-[var(--color-border)]"
                }`}
              >
                <span
                  className={`absolute h-4 w-4 rounded-full bg-white shadow transition-transform ${
                    showAllSummaries ? "translate-x-[18px]" : "translate-x-[2px]"
                  }`}
                />
              </span>
              <span className={showAllSummaries ? "font-medium text-[var(--color-accent)]" : ""}>
                Todos los resúmenes
              </span>
            </button>
            <div className="flex flex-wrap items-center gap-1">
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
                disabled={busy === "print" || rows.length === 0}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
              >
                {busy === "print" ? "Preparando..." : "🖨 Imprimir"}
              </button>
            </div>
          </div>

          {rows.length === 0 ? (
            <div className="rounded-md border border-dashed border-[var(--color-border)] py-4 text-center text-xs text-[var(--color-muted)]">
              Sin quincenas pendientes.
            </div>
          ) : (
            <>
            {/* Mobile: en vez del pivot (con el nombre y el total fijos, a
                412 px entra una sola columna de quincena), una lista ordenada
                por deuda. Cada tarjeta abre el mismo modal que el nombre en
                desktop, con el desglose por quincena. */}
            <div className="space-y-2 md:hidden">
              {rows.map((r) => (
                <button
                  key={r.carrierId}
                  type="button"
                  onClick={() => setDetalle(r)}
                  className="flex w-full items-center justify-between gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface-2)] px-3 py-2.5 text-left hover:bg-[var(--color-accent-soft)]"
                >
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-semibold">{r.alias}</span>
                    {r.name && (
                      <span className="truncate text-xs text-[var(--color-muted)]">{r.name}</span>
                    )}
                    <span className="mt-0.5 text-[10px] text-[var(--color-muted)]">
                      {r.pending.size} quincena{r.pending.size === 1 ? "" : "s"} con saldo
                    </span>
                  </span>
                  <span className="flex shrink-0 flex-col items-end">
                    <span className="text-sm font-bold tabular-nums text-[var(--color-accent)]">
                      {fmtCurrency(r.pendingTotal)}
                    </span>
                    {r.paidTotal > 0 && (
                      <span className="text-[10px] tabular-nums text-[var(--color-success)]">
                        pagado {fmtCurrency(r.paidTotal)}
                      </span>
                    )}
                    <span className="text-[10px] text-[var(--color-muted)]">ver ▸</span>
                  </span>
                </button>
              ))}
              <div className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-sm font-semibold">
                <span>Total pendiente</span>
                <span className="tabular-nums text-[var(--color-accent)]">{fmtCurrency(grandPending)}</span>
              </div>
            </div>

            {/* Desktop: el pivot. En mobile queda con `display: none` y las
                exportaciones igual funcionan: la captura clona el nodo de
                printRef en su propio contenedor, así que 📋/📥/🖨 sacan la
                tabla completa también desde el teléfono. */}
            <div className="hidden md:block">
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <div
              ref={printRef}
              style={{
                background: "#ffffff",
                color: "#000",
                padding: 16,
                fontFamily: "ui-sans-serif, system-ui, sans-serif",
                // El bloque blanco mide lo que la tabla y no lo que el
                // contenedor, así el fondo la cubre entera al desplazarse.
                minWidth: "max-content",
              }}
            >
              <div style={{ marginBottom: 10 }}>
                <div style={{ fontWeight: 700, fontSize: 15 }}>
                  {titulo}
                </div>
                <div style={{ fontSize: 11, color: "#555" }}>
                  {fortnightCount} quincena{fortnightCount === 1 ? "" : "s"} · {rows.length} transportista{rows.length === 1 ? "" : "s"}
                  {showAllSummaries && " · incluye a los que ya cobraron"}
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
                    <th style={{ ...cellH, minWidth: CARRIER_COL_W, ...stickyLeft("#9dc3e6", 3) }}>
                      Transportista
                    </th>
                    {pendingFortnights.map((q) => (
                      <th
                        key={q.id}
                        style={{ ...cellH, textAlign: "right", minWidth: FORTNIGHT_COL_W }}
                      >
                        <div style={{ overflowWrap: "break-word" }}>{q.name}</div>
                        {(q.periodFrom || q.periodTo) && (
                          <div
                            style={{
                              fontSize: 10,
                              fontWeight: 400,
                              color: "#333",
                              // Las fechas no se parten: envueltas quedan como
                              // "16-04-" / "26" y dejan de leerse como fecha.
                              whiteSpace: "nowrap",
                            }}
                          >
                            <div>{compactDate(q.periodFrom)}</div>
                            <div>→ {compactDate(q.periodTo)}</div>
                          </div>
                        )}
                      </th>
                    ))}
                    <th style={{ ...cellH, textAlign: "right", ...stickyRight("#7cb1d8", 3) }}>
                      Total
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.carrierId}>
                      <td style={{ ...cell, overflowWrap: "break-word", ...stickyLeft("#eaf4fb") }}>
                        {/* Botón con aspecto de texto, porque la celda viaja al
                            PNG y a la impresión. Solo se subraya al pasar el
                            mouse, y eso no sale en la captura. */}
                        <button
                          type="button"
                          onClick={() => setDetalle(r)}
                          title={`Ver todos los resúmenes de ${r.alias}`}
                          style={{
                            background: "none",
                            border: "none",
                            padding: 0,
                            font: "inherit",
                            color: "inherit",
                            textAlign: "left",
                            cursor: "pointer",
                          }}
                          className="hover:underline"
                        >
                          <span style={{ fontWeight: 600 }}>{r.alias}</span>
                          {r.name && (
                            <span style={{ color: "#666", marginLeft: 6, fontSize: 11 }}>
                              {r.name}
                            </span>
                          )}
                        </button>
                      </td>
                      {pendingFortnights.map((q) => {
                        const pend = r.pending.get(q.id) || 0;
                        const paid = r.paid.get(q.id) || 0;
                        return (
                          <td
                            key={q.id}
                            style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                          >
                            {pend > 0 && <div>{fmtCurrency(pend)}</div>}
                            {paid > 0 && (
                              <div style={{ color: "#16a34a", fontSize: 10, fontStyle: "italic" }}>
                                pagado: {fmtCurrency(paid)}
                              </div>
                            )}
                          </td>
                        );
                      })}
                      <td
                        style={{
                          ...cell,
                          textAlign: "right",
                          fontWeight: 700,
                          fontVariantNumeric: "tabular-nums",
                          ...stickyRight("#eaf4fb"),
                        }}
                      >
                        {fmtCurrency(r.pendingTotal)}
                        {r.paidTotal > 0 && (
                          <div style={{ color: "#16a34a", fontSize: 10, fontStyle: "italic", fontWeight: 600 }}>
                            pagado: {fmtCurrency(r.paidTotal)}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: "#c6efce" }}>
                    <td style={{ ...cell, fontWeight: 700, ...stickyLeft("#c6efce", 2) }}>Total pendiente</td>
                    {pendingFortnights.map((q) => (
                      <td
                        key={q.id}
                        style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                      >
                        {fmtCurrency(colTotals.get(q.id)?.pending || 0)}
                      </td>
                    ))}
                    <td
                      style={{
                        ...cell,
                        textAlign: "right",
                        fontWeight: 700,
                        fontSize: 13,
                        fontVariantNumeric: "tabular-nums",
                        ...stickyRight("#c6efce", 2),
                      }}
                    >
                      {fmtCurrency(grandPending)}
                    </td>
                  </tr>
                  <tr style={{ background: "#dcedc8" }}>
                    <td style={{ ...cell, fontWeight: 700, color: "#15803d", ...stickyLeft("#dcedc8", 2) }}>Total pagado</td>
                    {pendingFortnights.map((q) => {
                      const paid = colTotals.get(q.id)?.paid || 0;
                      return (
                        <td
                          key={q.id}
                          style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums", color: "#15803d" }}
                        >
                          {paid > 0 ? fmtCurrency(paid) : ""}
                        </td>
                      );
                    })}
                    <td
                      style={{
                        ...cell,
                        textAlign: "right",
                        fontWeight: 700,
                        fontSize: 13,
                        fontVariantNumeric: "tabular-nums",
                        color: "#15803d",
                        ...stickyRight("#dcedc8", 2),
                      }}
                    >
                      {fmtCurrency(grandPaid)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            </div>
            </div>
            </>
          )}
        </div>
      )}

      <CarrierSummariesModal
        open={!!detalle}
        onClose={() => setDetalle(null)}
        row={detalle}
        payments={payments}
        fortnights={fortnights}
      />
    </div>
  );
}
