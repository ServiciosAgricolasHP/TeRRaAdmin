// Resúmenes por grupo: se arma un grupo agregando trabajadores de a uno y se
// genera:
//   1. Una matriz tipo comprobante de pago en efectivo (filas = trabajadores,
//      columnas = ciclos activos + Anticipo + Bono + Total + Firma).
//   2. Un detalle por integrante (PrintableWorkerSummary), cada uno con sus
//      botones de copiar y bajar PNG.
//
// Los datos se cargan al pasar al resultado, con `loadWorkerSummaryData` (el
// mismo loader de WorkerSummaryModal) para cada trabajador. Los ciclos de la
// matriz son la unión de los ciclos con producción de cualquier integrante.

import { forwardRef, useEffect, useMemo, useRef, useState } from "react";
import { useCaptureActions } from "../hooks/useCaptureActions";
import Modal from "./Modal";
import { useCatalogs } from "../contexts/CatalogsContext";
import WorkerSearchPicker from "./WorkerSearchPicker";
import { loadWorkerSummaryData } from "../services/workerSummaryService";
import { PrintableWorkerSummary } from "./workerSummaryModal/PrintableWorkerSummary";
import { formatRutForDisplay } from "../utils/rutUtils";
import { localIsoDate } from "../utils/dates";
import { fmtCurrency } from "../utils/format";

// Mismos colores que el comprobante de pago en efectivo.
const LEADER_FILL = "#FFE699";
const ITEM_FILL = "#FFF2CC";


const cellH = {
  border: "1px solid #555",
  padding: "6px 8px",
  fontSize: 12,
  fontWeight: 700,
  textAlign: "left",
};
const cell = { border: "1px solid #999", padding: "5px 8px", fontSize: 12 };

export default function GroupSummaryModal({ open, onClose }) {
  const { catalogs } = useCatalogs();
  const [step, setStep] = useState("build"); // build | result
  const [selected, setSelected] = useState([]); // [worker]
  // workerData: { [rut]: { data, advances, grandTotal, netAdvanceBalance, advanceBalance, bonusBalance } }
  const [workerData, setWorkerData] = useState({});
  const [loading, setLoading] = useState(false);
  const { busy, copy, download } = useCaptureActions();
  const matrixRef = useRef(null);
  const individualRefs = useRef({}); // { rut: HTMLElement }

  // Reinicia el estado al abrir.
  useEffect(() => {
    if (!open) return;
    setStep("build");
    setSelected([]);
    setWorkerData({});
    individualRefs.current = {};
  }, [open]);

  const addWorker = (w) => {
    if (!w || selected.some((s) => s.id === w.id)) return;
    setSelected([...selected, w]);
  };

  const removeWorker = (id) => {
    setSelected(selected.filter((s) => s.id !== id));
  };

  const handleGenerate = async () => {
    if (selected.length === 0) return;
    setLoading(true);
    try {
      // En paralelo: cada trabajador hace sus propias consultas (jornadas,
      // ciclos y anticipos).
      const entries = await Promise.all(
        selected.map(async (w) => [w.id, await loadWorkerSummaryData(w, catalogs)]),
      );
      setWorkerData(Object.fromEntries(entries));
      setStep("result");
    } finally {
      setLoading(false);
    }
  };

  // Unión de ciclos con producción de algún integrante, por label alfabético.
  const activeCycles = useMemo(() => {
    const m = new Map();
    for (const w of selected) {
      const wd = workerData[w.id];
      if (!wd) continue;
      for (const d of wd.data || []) {
        if (!m.has(d.cycle.id)) m.set(d.cycle.id, d.cycle);
      }
    }
    return [...m.values()].sort((a, b) => (a.label || "").localeCompare(b.label || ""));
  }, [selected, workerData]);

  // Filas de la matriz: { worker, byCycle, advance, bonus, total, neto, index }
  const matrixRows = useMemo(() => {
    return selected.map((w, i) => {
      const wd = workerData[w.id] || {};
      const byCycle = {};
      let total = 0;
      for (const d of wd.data || []) {
        const amt = (d.totals.amount || 0) + (d.totals.floor || 0);
        byCycle[d.cycle.id] = amt;
        total += amt;
      }
      // Sin `advanceBalance`, usa `netAdvanceBalance` y todo el saldo cuenta como
      // anticipo.
      const advance = wd.advanceBalance != null ? wd.advanceBalance : (wd.netAdvanceBalance || 0);
      const bonus = wd.bonusBalance || 0;
      const neto = total - advance + bonus;
      return { worker: w, byCycle, advance, bonus, total, neto, index: i + 1 };
    });
  }, [selected, workerData]);

  const hasAdvances = matrixRows.some((r) => r.advance > 0);
  const hasBonuses = matrixRows.some((r) => r.bonus > 0);
  const showCycleCols = activeCycles.length > 1;

  // Totales por columna y generales.
  const totals = useMemo(() => {
    const cycleTotals = {};
    let advanceTotal = 0,
      bonusTotal = 0,
      totalTotal = 0,
      netoTotal = 0;
    for (const r of matrixRows) {
      for (const cid in r.byCycle) {
        cycleTotals[cid] = (cycleTotals[cid] || 0) + r.byCycle[cid];
      }
      advanceTotal += r.advance;
      bonusTotal += r.bonus;
      totalTotal += r.total;
      netoTotal += r.neto;
    }
    return { cycleTotals, advanceTotal, bonusTotal, totalTotal, netoTotal };
  }, [matrixRows]);

  const captureMatrix = (action) =>
    action === "copy"
      ? copy(matrixRef.current)
      : download(matrixRef.current, `grupo_matriz_${localIsoDate()}.png`);

  const captureIndividual = (rut, action = "download") => {
    const node = individualRefs.current[rut];
    const key = `${action}_${rut}`;
    if (action === "copy") return copy(node, { key });
    const worker = selected.find((s) => s.id === rut);
    return download(node, `resumen_${(worker?.name || "trabajador").replace(/\s+/g, "_")}.png`, { key });
  };

  // Captura todos los detalles individuales en una sola imagen; la matriz no
  // entra, tiene sus propios botones.
  const everythingRef = useRef(null);
  const captureEverything = (action = "copy") =>
    action === "copy"
      ? copy(everythingRef.current, { key: "all_copy", success: "Imagen completa copiada al portapapeles" })
      : download(everythingRef.current, `grupo_completo_${localIsoDate()}.png`, { key: "all_download" });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="📊 Resúmenes por grupo"
      size="full"
      footer={
        <>
          <button
            onClick={onClose}
            className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm"
          >
            Cerrar
          </button>
          {step === "result" && (
            <button
              onClick={() => {
                setStep("build");
                setWorkerData({});
              }}
              className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)]"
            >
              ← Editar grupo
            </button>
          )}
          {step === "build" && (
            <button
              onClick={handleGenerate}
              disabled={selected.length === 0 || loading}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-sm font-medium text-[var(--color-accent-fg)] disabled:opacity-50"
            >
              {loading ? "Generando..." : `Generar resumen (${selected.length})`}
            </button>
          )}
        </>
      }
    >
      {step === "build" ? (
        <BuilderUI
          selected={selected}
          addWorker={addWorker}
          removeWorker={removeWorker}
        />
      ) : (
        <ResultUI
          catalogs={catalogs}
          selected={selected}
          workerData={workerData}
          activeCycles={activeCycles}
          matrixRows={matrixRows}
          totals={totals}
          hasAdvances={hasAdvances}
          hasBonuses={hasBonuses}
          showCycleCols={showCycleCols}
          matrixRef={matrixRef}
          individualRefs={individualRefs}
          everythingRef={everythingRef}
          captureMatrix={captureMatrix}
          captureIndividual={captureIndividual}
          captureEverything={captureEverything}
          busy={busy}
        />
      )}
    </Modal>
  );
}

function BuilderUI({ selected, addWorker, removeWorker }) {
  return (
    <div className="space-y-3">
      <div className="text-sm text-[var(--color-muted)]">
        Agrega trabajadores uno por uno. Al terminar toca <b>Generar resumen</b> abajo.
      </div>

      {/* Integrantes elegidos */}
      {selected.length > 0 && (
        <div className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2">
          <div className="mb-1.5 text-[10px] uppercase tracking-wider text-[var(--color-muted)]">
            Grupo ({selected.length})
          </div>
          <div className="flex flex-wrap gap-1.5">
            {selected.map((w) => (
              <div
                key={w.id}
                className="flex items-center gap-1.5 rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-1 text-xs"
              >
                <span className="font-medium">{w.name}</span>
                <span className="font-mono text-[10px] text-[var(--color-muted)]">
                  {formatRutForDisplay(w.rut || w.id)}
                </span>
                <button
                  onClick={() => removeWorker(w.id)}
                  className="text-[var(--color-muted)] hover:text-red-600"
                  title="Quitar del grupo"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Búsqueda */}
      <div className="space-y-2">
        <div className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Agregar trabajador
        </div>
        <WorkerSearchPicker
          autoFocus
          actionLabel="+ Agregar"
          pickedIds={new Set(selected.map((w) => w.id))}
          onPick={addWorker}
        />
      </div>
    </div>
  );
}

function ResultUI({
  selected,
  workerData,
  activeCycles,
  matrixRows,
  totals,
  hasAdvances,
  hasBonuses,
  showCycleCols,
  matrixRef,
  individualRefs,
  everythingRef,
  captureMatrix,
  captureIndividual,
  captureEverything,
  busy,
  catalogs,
}) {
  return (
    <div>
      <div className="space-y-6">
      {/* Matriz */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Matriz grupal</h3>
          <div className="flex gap-1">
            <button
              onClick={() => captureMatrix("copy")}
              disabled={busy === "copy"}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              title="Copiar imagen al portapapeles"
            >
              {busy === "copy" ? "..." : "📋"}
            </button>
            <button
              onClick={() => captureMatrix("download")}
              disabled={busy === "download"}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              title="Descargar PNG"
            >
              {busy === "download" ? "..." : "📥"}
            </button>
          </div>
        </div>
        <div style={{ overflowX: "auto", maxWidth: "100%" }}>
          <MatrixTable
            ref={matrixRef}
            rows={matrixRows}
            cycles={activeCycles}
            totals={totals}
            hasAdvances={hasAdvances}
            hasBonuses={hasBonuses}
            showCycleCols={showCycleCols}
          />
        </div>
      </section>

      {/* Detalle por integrante. "Copiar todos" y "Todos" capturan solo estos
          detalles, sin la matriz. */}
      <section>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold">Detalle individual</h3>
          <div className="flex gap-1">
            <button
              onClick={() => captureEverything("copy")}
              disabled={busy === "all_copy"}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              title="Copiar todos los detalles individuales en una sola imagen"
            >
              {busy === "all_copy" ? "Copiando..." : "📋 Copiar todos"}
            </button>
            <button
              onClick={() => captureEverything("download")}
              disabled={busy === "all_download"}
              className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
              title="Descargar PNG con todos los detalles individuales"
            >
              {busy === "all_download" ? "..." : "📥 Todos"}
            </button>
          </div>
        </div>
        <div ref={everythingRef} className="space-y-4 bg-[var(--color-surface)] p-2">
          {selected.map((w) => {
            const wd = workerData[w.id] || {};
            const copyTag = `copy_${w.id}`;
            const dlTag = `download_${w.id}`;
            return (
              <div
                key={w.id}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-2"
              >
                <div className="mb-1 flex items-center justify-between">
                  <div className="text-xs font-medium">
                    {w.name}{" "}
                    <span className="font-mono text-[10px] text-[var(--color-muted)]">
                      {formatRutForDisplay(w.rut || w.id)}
                    </span>
                  </div>
                  <div className="flex gap-1">
                    <button
                      onClick={() => captureIndividual(w.id, "copy")}
                      disabled={busy === copyTag}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
                      title="Copiar imagen de este integrante al portapapeles"
                    >
                      {busy === copyTag ? "..." : "📋"}
                    </button>
                    <button
                      onClick={() => captureIndividual(w.id, "download")}
                      disabled={busy === dlTag}
                      className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)] disabled:opacity-60"
                      title="Bajar PNG de este integrante"
                    >
                      {busy === dlTag ? "..." : "📥"}
                    </button>
                  </div>
                </div>
                {(wd.data || []).length === 0 && (wd.advances || []).length === 0 ? (
                  <div className="rounded-md border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] py-4 text-center text-xs text-[var(--color-muted)]">
                    Sin actividad en ciclos activos ni anticipos pendientes.
                  </div>
                ) : (
                  <PrintableWorkerSummary
                    ref={(el) => {
                      if (el) individualRefs.current[w.id] = el;
                      else delete individualRefs.current[w.id];
                    }}
                    worker={w}
                    data={wd.data || []}
                    grandTotal={wd.grandTotal || 0}
                    advances={wd.advances || []}
                    netAdvanceBalance={wd.netAdvanceBalance || 0}
                    advanceBalance={wd.advanceBalance || 0}
                    bonusBalance={wd.bonusBalance || 0}
                    titles={{ main: "DETALLE DE JORNADA", subtitle: w.name || "" }}
                    catalogs={catalogs}
                  />
                )}
              </div>
            );
          })}
        </div>
      </section>
      </div>
    </div>
  );
}

// Matriz tipo comprobante de pago en efectivo para el grupo armado a mano:
// # · Nombre · RUT · {ciclos} · Anticipo · Bono · Total · Firma. Las columnas
// por ciclo se ocultan con un solo ciclo activo (el total ya lo cubre), y
// Anticipo y Bono, si nadie del grupo tiene saldo de ese tipo.
const MatrixTable = forwardRef(function MatrixTable(
  { rows, cycles, totals, hasAdvances, hasBonuses, showCycleCols },
  ref,
) {
    const today = new Date().toLocaleDateString("es-CL");
    return (
      <div
        ref={ref}
        style={{
          background: "#ffffff",
          color: "#000",
          padding: 16,
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          width: "max-content",
          minWidth: "100%",
        }}
      >
        <div style={{ textAlign: "center", marginBottom: 10 }}>
          <div style={{ fontWeight: 700, fontSize: 16 }}>RESUMEN POR GRUPO</div>
          <div style={{ fontSize: 11, color: "#555" }}>
            {rows.length} trabajador{rows.length === 1 ? "" : "es"} · {today}
          </div>
        </div>
        <table style={{ borderCollapse: "collapse", width: "100%" }}>
          <thead>
            <tr style={{ background: LEADER_FILL }}>
              <th style={{ ...cellH, width: 30, textAlign: "center" }}>#</th>
              <th style={cellH}>Nombre</th>
              <th style={cellH}>RUT</th>
              {showCycleCols &&
                cycles.map((c) => (
                  <th key={c.id} style={{ ...cellH, textAlign: "right" }}>
                    {/* La etiqueta del ciclo se parte en líneas (también en cada
                        "/"), así una matriz con varios ciclos cabe a lo ancho. */}
                    <div style={{ maxWidth: 130, marginLeft: "auto", whiteSpace: "normal" }}>
                      {String(c.label || "").replaceAll("/", "/\u200b")}
                    </div>
                  </th>
                ))}
              {hasAdvances && (
                <th style={{ ...cellH, textAlign: "right", width: 110 }}>Anticipo</th>
              )}
              {hasBonuses && (
                <th style={{ ...cellH, textAlign: "right", width: 110 }}>Bono</th>
              )}
              <th style={{ ...cellH, textAlign: "right", width: 120 }}>Total</th>
              <th style={{ ...cellH, width: 140 }}>Firma</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.worker.id} style={{ background: ITEM_FILL }}>
                <td style={{ ...cell, textAlign: "center" }}>{r.index}</td>
                <td style={cell}>{r.worker.name}</td>
                <td style={{ ...cell, fontFamily: "ui-monospace, monospace" }}>
                  {formatRutForDisplay(r.worker.rut || r.worker.id)}
                </td>
                {showCycleCols &&
                  cycles.map((c) => (
                    <td
                      key={c.id}
                      style={{ ...cell, textAlign: "right", fontVariantNumeric: "tabular-nums" }}
                    >
                      {r.byCycle[c.id] ? fmtCurrency(r.byCycle[c.id]) : ""}
                    </td>
                  ))}
                {hasAdvances && (
                  <td
                    style={{ ...cell, textAlign: "right", color: "#b45309", fontVariantNumeric: "tabular-nums" }}
                  >
                    {r.advance > 0 ? `− ${fmtCurrency(r.advance)}` : "—"}
                  </td>
                )}
                {hasBonuses && (
                  <td
                    style={{ ...cell, textAlign: "right", color: "#166534", fontVariantNumeric: "tabular-nums" }}
                  >
                    {r.bonus > 0 ? `+ ${fmtCurrency(r.bonus)}` : "—"}
                  </td>
                )}
                <td
                  style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                >
                  {fmtCurrency(r.neto)}
                </td>
                <td style={cell}></td>
              </tr>
            ))}
            {/* Fila de subtotal */}
            <tr style={{ background: LEADER_FILL }}>
              <td style={{ ...cell, fontWeight: 700, textAlign: "right" }} colSpan={3}>
                Subtotal grupo
              </td>
              {showCycleCols &&
                cycles.map((c) => (
                  <td
                    key={c.id}
                    style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
                  >
                    {fmtCurrency(totals.cycleTotals[c.id] || 0)}
                  </td>
                ))}
              {hasAdvances && (
                <td
                  style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#b45309", fontVariantNumeric: "tabular-nums" }}
                >
                  {totals.advanceTotal > 0 ? `− ${fmtCurrency(totals.advanceTotal)}` : "—"}
                </td>
              )}
              {hasBonuses && (
                <td
                  style={{ ...cell, textAlign: "right", fontWeight: 700, color: "#166534", fontVariantNumeric: "tabular-nums" }}
                >
                  {totals.bonusTotal > 0 ? `+ ${fmtCurrency(totals.bonusTotal)}` : "—"}
                </td>
              )}
              <td
                style={{ ...cell, textAlign: "right", fontWeight: 700, fontVariantNumeric: "tabular-nums" }}
              >
                {fmtCurrency(totals.netoTotal)}
              </td>
              <td style={cell}></td>
            </tr>
          </tbody>
        </table>
      </div>
    );
});
