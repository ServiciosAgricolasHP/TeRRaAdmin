import { useRef, useState, useMemo } from "react";
import { captureFullWidthBlob, captureFullWidthDataUrl } from "../../../utils/imageCapture";
import Modal from "../../../components/Modal";
import {
  getDaySingle,
  qualityLabel,
  containerLabel,
  formatLaborDayPrice,
} from "../../../utils/cosechaCombos";
import { isRedDay } from "../../../utils/tratoHE";
import { useToast } from "../../../contexts/ToastContext";
import { dateLabel, fmtNumber } from "../../../utils/cycleSummary";
import { fmtCurrency } from "../../../utils/format";
import { cellH, cell } from "./tableStyles";
import { writeLaborWorkerGridXlsx } from "./writeLaborWorkerGridXlsx";

// ============================================================
// LaborWorkerGrid: grilla imprimible trabajador × día, una por labor
// ============================================================
// Muestra lo mismo que la grilla de CycleDetail, de solo lectura y preparada
// para imprimir o capturar. Tiene su propio ref y sus botones (📋 / 📥 / 🖨).
// Al imprimir, `thead { display: table-header-group }` repite el encabezado
// en cada hoja cuando la tabla pasa de una página.
export function LaborWorkerGrid({
  labor,
  displayName,
  unit,
  catalogs,
  containers,
  workers: allWorkers,
  dates,
  anyPiso,
  titles,
  dayPrices = {},
}) {
  const toast = useToast();
  const ref = useRef(null);
  const [busy, setBusy] = useState("");
  // Vista ampliada: la grilla en un Modal aparte, para verla completa cuando
  // hay muchos días.
  const [expanded, setExpanded] = useState(false);

  // Filtro de trabajadores: RUTs ocultos (vacío = todos visibles). Vale para
  // la grilla, los totales y el XLSX.
  const [hiddenRuts, setHiddenRuts] = useState(() => new Set());
  const [filterOpen, setFilterOpen] = useState(false);
  const workers = useMemo(
    () => allWorkers.filter((w) => !hiddenRuts.has(w.rut)),
    [allWorkers, hiddenRuts],
  );

  // tratoHE: sábados, domingos y feriados del dayPrices en rojo, con el mismo
  // criterio que la grilla del ciclo. Para otras labores queda vacío.
  const redDates = useMemo(() => {
    if (labor?.type !== "tratoHE") return new Set();
    const out = new Set();
    for (const d of dates) {
      const cfg = getDaySingle(dayPrices, labor.id, d, "normal");
      if (isRedDay(d, cfg)) out.add(d);
    }
    return out;
  }, [labor?.type, labor?.id, dates, dayPrices]);

  const filename = `resumen_trabajadores_${(labor?.name || "labor").replace(/[/\s]+/g, "_")}.png`;
  const xlsxFilename = `resumen_${(labor?.name || "labor").replace(/[/\s]+/g, "_")}.xlsx`;

  // Con una grilla más ancha que la ventana, `html-to-image` puede cortar en
  // el `offsetWidth` del elemento; `width`/`height` salen de
  // `scrollWidth`/`scrollHeight` para que el PNG traiga la tabla completa.
  const fullCaptureOpts = () => ({
    backgroundColor: "#ffffff",
    pixelRatio: 2,
    width: ref.current?.scrollWidth || undefined,
    height: ref.current?.scrollHeight || undefined,
  });

  const handleCopy = async () => {
    if (!ref.current) return;
    setBusy("copy");
    try {
      const blob = await captureFullWidthBlob(ref.current, fullCaptureOpts());
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada al portapapeles");
    } catch (err) {
      toast.error("Error: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };
  const handleDownload = async () => {
    if (!ref.current) return;
    setBusy("download");
    try {
      const dataUrl = await captureFullWidthDataUrl(ref.current, fullCaptureOpts());
      const link = document.createElement("a");
      link.download = filename;
      link.href = dataUrl;
      link.click();
    } finally {
      setBusy("");
    }
  };
  const handleXlsx = async () => {
    setBusy("xlsx");
    try {
      await writeLaborWorkerGridXlsx({
        catalogs,
        dates,
        dayPrices,
        displayName,
        labor,
        redDates,
        unit,
        workers,
        xlsxFilename,
      });
    } catch (err) {
      toast.error("Error al exportar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handlePrint = () => {
    if (!ref.current) return;
    const html = ref.current.outerHTML;
    const win = window.open("", "_blank", "width=1100,height=800");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>${displayName} — trabajadores</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #888; padding: 5px 7px; font-size: 11px; }
        /* Hace que el thead se repita en cada hoja nueva (Chrome/Firefox). */
        thead { display: table-header-group; }
        tfoot { display: table-row-group; }
        tr { page-break-inside: avoid; }
        @media print { @page { size: landscape; margin: 10mm; } }
      </style>
    </head><body>${html}<script>window.onload = () => { window.focus(); window.print(); };</script></body></html>`);
    win.document.close();
  };

  if (allWorkers.length === 0 || dates.length === 0) return null;

  // Sumas por columna (día) — pie de tabla.
  const dayTotals = new Map();
  for (const d of dates) dayTotals.set(d, { qty: 0, amount: 0, jornadas: 0, overtimeHours: 0, pisoAmount: 0 });
  for (const w of workers) {
    for (const [d, c] of w.byDate.entries()) {
      const t = dayTotals.get(d);
      if (!t) continue;
      t.qty += c.qty;
      t.amount += c.amount;
      t.jornadas += c.jornadas;
      t.overtimeHours += c.overtimeHours || 0;
      t.pisoAmount += c.pisoAmount || 0;
    }
  }
  const grand = { qty: 0, amount: 0, jornadas: 0, overtimeHours: 0, pisoAmount: 0 };
  for (const w of workers) {
    grand.qty += w.totals.qty;
    grand.amount += w.totals.amount;
    grand.jornadas += w.totals.jornadas || 0;
    grand.overtimeHours += w.totals.overtimeHours || 0;
    grand.pisoAmount += w.totals.pisoAmount || 0;
  }

  const containerName = labor?.type === "cosecha" && containers.size === 1
    ? containerLabel(catalogs, [...containers][0])
    : null;

  // Contenido de una celda (trabajador, día). En cosecha y trato, la cantidad
  // arriba y el monto chico abajo; en el resto, el monto es la línea
  // principal. El piso va con 🪙. En tratoHE no se muestra la jornada (cada
  // día con trabajo es una) y el monto lleva "(X HE)" si hubo horas extras.
  const renderCell = (c) => {
    if (!c || (!c.qty && !c.amount && !c.pisoAmount)) return null;
    const lines = [];
    const t = labor?.type;
    if (c.pisoAmount > 0 && !c.qty && !c.jornadas) {
      lines.push(
        <div key="piso" style={{ color: "#b45309", fontSize: 10 }}>🪙 {fmtCurrency(c.pisoAmount)}</div>,
      );
    } else if (t === "cosecha") {
      const main = (
        <div key="kg" style={{ fontWeight: 600 }}>
          {fmtNumber(c.qty)}{containerName ? ` ${containerName.toLowerCase()}` : ""}
        </div>
      );
      lines.push(main);
      if (c.byCombo && c.byCombo.size > 1) {
        for (const [, b] of c.byCombo) {
          lines.push(
            <div key={`${b.qx}_${b.cy}`} style={{ fontSize: 9, color: "#666" }}>
              {qualityLabel(catalogs, b.qx)}: {fmtNumber(b.kilos)}
            </div>,
          );
        }
      }
    } else if (t === "trato") {
      lines.push(<div key="qty" style={{ fontWeight: 600 }}>{fmtNumber(c.qty)}</div>);
    } else if (t === "tratoHE") {
      // Sin línea de jornada: solo la del monto, más abajo.
    } else {
      // main, supervision, extra (y tratoEtapas): sin línea de cantidad; el
      // monto es la línea principal y la cantidad va en la columna Total.
    }
    if (c.pisoAmount > 0 && (c.qty || c.jornadas)) {
      lines.push(
        <div key="piso" style={{ color: "#b45309", fontSize: 9 }}>🪙 {fmtCurrency(c.pisoAmount)}</div>,
      );
    }
    if (c.amount) {
      const heSuffix = (t === "tratoHE" && c.overtimeHours > 0)
        ? ` (${fmtNumber(c.overtimeHours)} HE)`
        : "";
      // En cosecha y trato la cantidad va arriba y el monto abajo, chico y
      // gris; en el resto el monto es la línea principal, más grande y oscura.
      const isMainLine = t !== "cosecha" && t !== "trato";
      const fontSize = isMainLine ? 11 : 9;
      const fontWeight = isMainLine ? 600 : 400;
      lines.push(
        <div key="amt" style={{ fontSize, fontWeight, color: isMainLine ? "#000" : "#555" }}>
          {fmtCurrency(c.amount)}{heSuffix}
        </div>,
      );
    }
    return <>{lines}</>;
  };

  // Cuerpo de la grilla, que se dibuja en línea o dentro del Modal "Ampliar".
  // Según `expanded` hay una sola instancia montada, así el ref apunta
  // siempre a la activa.
  const gridBody = (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div>
          <div style={{ fontWeight: 700, fontSize: 14 }}>{titles?.main || "DETALLE DE JORNADA"}</div>
          {titles?.subtitle && <div style={{ fontSize: 12, color: "#555" }}>{titles.subtitle}</div>}
        </div>
        <div style={{ textAlign: "right" }}>
          <div style={{ fontWeight: 700, fontSize: 13 }}>{displayName}</div>
          <div style={{ fontSize: 11, color: "#555" }}>
            {workers.length} trabajador{workers.length === 1 ? "" : "es"} · {dates.length} día{dates.length === 1 ? "" : "s"} · {unit}
          </div>
        </div>
      </div>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: "#9dc3e6" }}>
              <th style={cellH}>Trabajador</th>
              {dates.map((d) => {
                const isRed = redDates.has(d);
                const cellStyle = {
                  ...cellH,
                  textAlign: "center",
                  minWidth: 70,
                  ...(isRed ? { background: "#ffc7ce", color: "#9c0006" } : {}),
                };
                return (
                  <th key={d} style={cellStyle}>
                    <div>{dateLabel(d)}</div>
                    {(() => {
                      // Precio + unidad configurado para ese día (ej. "$300/árbol",
                      // "$45/saco"). Vacío si no hay precio o si es tratoHE.
                      const priceLine = formatLaborDayPrice(labor, d, dayPrices, catalogs);
                      if (!priceLine) return null;
                      return (
                        <div style={{ fontSize: 9, fontWeight: 400, color: "#555", marginTop: 2 }}>
                          {priceLine}
                        </div>
                      );
                    })()}
                  </th>
                );
              })}
              <th style={{ ...cellH, textAlign: "right", background: "#7eb0d8", whiteSpace: "nowrap" }}>Total {unit}</th>
              {labor?.type === "tratoHE" && (
                <th style={{ ...cellH, textAlign: "right", background: "#7eb0d8", whiteSpace: "nowrap" }}>Total HE</th>
              )}
              <th style={{ ...cellH, textAlign: "right", background: "#7eb0d8", whiteSpace: "nowrap" }}>Total $</th>
            </tr>
          </thead>
          <tbody>
            {workers.map((w) => (
              <tr key={w.rut}>
                <td style={{ ...cell, fontWeight: 600 }}>
                  <div>{w.name}</div>
                  <div style={{ fontSize: 9, color: "#777", fontFamily: "ui-monospace, monospace" }}>{w.rut}</div>
                </td>
                {dates.map((d) => (
                  <td key={d} style={{ ...cell, textAlign: "center", fontVariantNumeric: "tabular-nums" }}>
                    {renderCell(w.byDate.get(d))}
                  </td>
                ))}
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {labor?.type === "tratoHE"
                    ? fmtNumber(w.totals.jornadas)
                    : fmtNumber(w.totals.qty)}
                </td>
                {labor?.type === "tratoHE" && (
                  <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                    {w.totals.overtimeHours > 0 ? `${fmtNumber(w.totals.overtimeHours)} HE` : ""}
                  </td>
                )}
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {fmtCurrency(w.totals.amount)}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr style={{ background: "#c6efce", fontWeight: 700 }}>
              <td style={{ ...cell, fontWeight: 700 }}>Total día</td>
              {dates.map((d) => {
                const t = dayTotals.get(d);
                const lt = labor?.type;
                const isHE = lt === "tratoHE";
                // Cosecha, trato y tratoEtapas muestran la cantidad arriba;
                // tratoHE, main, supervision y extra solo el monto (las
                // jornadas van en la columna Total de la derecha).
                const showQty = lt === "cosecha" || lt === "trato" || lt === "tratoEtapas";
                const amtLine = isHE && t.overtimeHours > 0
                  ? `${fmtCurrency(t.amount)} (${fmtNumber(t.overtimeHours)} HE)`
                  : fmtCurrency(t.amount);
                return (
                  <td key={d} style={{ ...cell, textAlign: "center", fontVariantNumeric: "tabular-nums", fontWeight: 700 }}>
                    {showQty && <div>{fmtNumber(t.qty)}</div>}
                    <div style={{ fontSize: showQty ? 9 : 11, color: "#333" }}>{amtLine}</div>
                  </td>
                );
              })}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {labor?.type === "tratoHE"
                  ? fmtNumber(grand.jornadas)
                  : fmtNumber(grand.qty)}
              </td>
              {labor?.type === "tratoHE" && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                  {grand.overtimeHours > 0 ? `${fmtNumber(grand.overtimeHours)} HE` : ""}
                </td>
              )}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(grand.amount)}
              </td>
            </tr>
          {anyPiso && grand.pisoAmount > 0 && (
            <tr style={{ background: "#fce4d6" }}>
              <td style={{ ...cell, fontWeight: 700, color: "#b45309" }} colSpan={dates.length + 1}>
                🪙 Total pisos
              </td>
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" }}>—</td>
              {labor?.type === "tratoHE" && (
                <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" }}>—</td>
              )}
              <td style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" }}>
                {fmtCurrency(grand.pisoAmount)}
              </td>
            </tr>
          )}
        </tfoot>
      </table>
    </>
  );

  // Estilo de la tarjeta, igual en línea y en el modal, con el padding y los
  // colores del impreso. `width: max-content` deja que cada columna conserve
  // su ancho natural aunque la tabla supere la ventana; el contenedor de
  // afuera hace el scroll.
  const cardStyles = {
    background: "#ffffff",
    color: "#000",
    padding: 14,
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    width: "max-content",
    minWidth: "100%",
  };

  return (
    <div style={{ marginTop: 20 }}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">
          Resumen por trabajador — <span className="text-[var(--color-muted)]">{displayName}</span>
          {hiddenRuts.size > 0 && (
            <span className="ml-2 rounded bg-[var(--color-warning-soft)] px-1.5 py-0.5 text-[10px] font-normal text-[var(--color-warning)]">
              {workers.length}/{allWorkers.length} visibles
            </span>
          )}
        </h3>
        <div className="flex gap-1">
          <button
            onClick={() => setFilterOpen((v) => !v)}
            className={`rounded-md border px-2 py-1 text-xs ${
              filterOpen || hiddenRuts.size > 0
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
            }`}
            title="Filtrar trabajadores visibles"
          >
            👥 Filtrar
          </button>
          <button
            onClick={() => setExpanded(true)}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
            title="Ver en grande (modal con scroll horizontal)"
          >
            🔍 Ampliar
          </button>
          <button
            onClick={handleXlsx}
            disabled={busy === "xlsx"}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            title="Exportar a Excel (columnas numéricas listas para sumar)"
          >
            {busy === "xlsx" ? "..." : "📊 XLSX"}
          </button>
          <button
            onClick={handleCopy}
            disabled={busy === "copy"}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            title="Copiar imagen al portapapeles"
          >
            {busy === "copy" ? "..." : "📋"}
          </button>
          <button
            onClick={handleDownload}
            disabled={busy === "download"}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
            title="Descargar PNG"
          >
            {busy === "download" ? "..." : "📥"}
          </button>
          <button
            onClick={handlePrint}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
            title="Imprimir"
          >
            🖨
          </button>
        </div>
      </div>

      {filterOpen && (
        <div className="mb-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <div className="text-[11px] text-[var(--color-muted)]">
              Click para ocultar/mostrar trabajadores. Las sumas y el XLSX reflejan solo los visibles.
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => setHiddenRuts(new Set())}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
              >
                Mostrar todos
              </button>
              <button
                onClick={() => setHiddenRuts(new Set(allWorkers.map((w) => w.rut)))}
                className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[10px] hover:bg-[var(--color-accent-soft)]"
              >
                Ocultar todos
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-1">
            {allWorkers.map((w) => {
              const hidden = hiddenRuts.has(w.rut);
              return (
                <button
                  key={w.rut}
                  onClick={() => setHiddenRuts((prev) => {
                    const next = new Set(prev);
                    if (next.has(w.rut)) next.delete(w.rut);
                    else next.add(w.rut);
                    return next;
                  })}
                  className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                    hidden
                      ? "border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-muted)] line-through opacity-60"
                      : "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                  }`}
                  title={hidden ? "Click para mostrar" : "Click para ocultar"}
                >
                  {hidden ? "👁‍🗨" : "👁"} {w.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
      {/* En línea: scroll horizontal dentro del modal padre. El PNG y la
          impresión toman el div interno, de ancho completo, sin el recorte
          del contenedor. */}
      {!expanded && (
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <div ref={ref} style={cardStyles}>
            {gridBody}
          </div>
        </div>
      )}
      {/* Modal "Ampliar": la misma grilla en un área más grande, con scroll.
          Con `expanded`, `ref` apunta al div de acá, así que los botones de
          exportar e imprimir siguen funcionando. */}
      {expanded && (
        <Modal
          open={expanded}
          onClose={() => setExpanded(false)}
          title={`📊 ${displayName} — Resumen por trabajador`}
          size="xl"
          footer={
            <>
              <button
                onClick={() => setExpanded(false)}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
              >
                Cerrar
              </button>
              <button
                onClick={handleCopy}
                disabled={busy === "copy"}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                {busy === "copy" ? "Copiando..." : "📋 Copiar imagen"}
              </button>
              <button
                onClick={handleDownload}
                disabled={busy === "download"}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              >
                {busy === "download" ? "Descargando..." : "📥 Descargar PNG"}
              </button>
              <button
                onClick={handlePrint}
                className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
              >
                🖨 Imprimir
              </button>
            </>
          }
        >
          <div style={{ overflow: "auto", maxHeight: "75vh" }}>
            <div ref={ref} style={cardStyles}>
              {gridBody}
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
