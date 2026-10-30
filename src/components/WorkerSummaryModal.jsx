import { useState, useRef, useEffect, useEffectEvent, useMemo } from "react";
import { useCaptureActions } from "../hooks/useCaptureActions";
import { PRINT_GRID_CSS } from "../utils/printWindow";
import Modal from "./Modal";
import { advanceRemaining, advanceSign } from "../services/advancesService";
import { useCatalogs } from "../contexts/CatalogsContext";
import { localIsoDate } from "../utils/dates";
import { loadWorkerSummaryData } from "../services/workerSummaryService";
import { fmtCurrency } from "../utils/format";
import { defaultCycleTitle } from "./workerSummaryModal/helpers";
import { PrintableWorkerSummary } from "./workerSummaryModal/PrintableWorkerSummary";
import { StatusFilterPill } from "./workerSummaryModal/StatusPill";
import { attempt } from "../utils/attempt";
import { useValuesChanged } from "../hooks/useValuesChanged";

const titlesKey = (rut) => `worker_summary_titles_${rut}`;

const loadTitles = (rut, defaultSubtitle) => {
  try {
    const raw = localStorage.getItem(titlesKey(rut));
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        main: "DETALLE DE JORNADA",
        subtitle: defaultSubtitle,
        ...parsed,
        cycles: parsed.cycles || {},
        linear: parsed.linear || { main: "DETALLE DE JORNADA — CRONOLÓGICO", subtitle: defaultSubtitle },
      };
    }
  } catch {
    /* noop */
  }
  return { main: "DETALLE DE JORNADA", subtitle: defaultSubtitle, cycles: {} };
};

const saveTitles = (rut, titles) => {
  try { localStorage.setItem(titlesKey(rut), JSON.stringify(titles)); } catch {
    /* noop */
  }
};

// Rango por defecto del toggle "incluir ciclos cerrados": el último mes
// (hoy - 1 mes → hoy).
const todayISO = () => localIsoDate();

const oneMonthAgoISO = () => {
  const d = new Date();
  d.setMonth(d.getMonth() - 1);
  return localIsoDate(d);
};

export default function WorkerSummaryModal({ open, onClose, worker }) {
  const { catalogs } = useCatalogs();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]); // [{ cycle, faena, subfaena, rows, totals, cols, tratoLabel, kilosLabel, isClosed }]
  const [advances, setAdvances] = useState([]); // anticipos y bonos pending/partial del trabajador
  const { busy, copy, download, print } = useCaptureActions();
  const [titles, setTitles] = useState({ main: "DETALLE DE JORNADA", subtitle: "" });
  const [showTitleEditor, setShowTitleEditor] = useState(false);
  // Incluir ciclos cerrados (apagado por defecto) dentro de un rango de
  // fechas (por defecto, el último mes). Cambiarlos vuelve a cargar los datos.
  const [includeClosed, setIncludeClosed] = useState(false);
  const [closedFrom, setClosedFrom] = useState(oneMonthAgoISO());
  const [closedTo, setClosedTo] = useState(todayISO());
  // Vista: "linear" (por defecto; una sola tabla cronológica con columna
  // Ciclo) o "byCycle" (una tabla por ciclo).
  const [viewMode, setViewMode] = useState("linear");
  // Filtro por estado de pago (pagado / en nómina / sin pagar); por defecto
  // muestra todos. Las filas ocultas no cuentan en los totales.
  const [statusFilter, setStatusFilter] = useState(() => new Set(["paid", "in_pending", "unpaid"]));
  const toggleStatus = (s) => setStatusFilter((prev) => {
    const next = new Set(prev);
    if (next.has(s)) next.delete(s); else next.add(s);
    return next;
  });
  // Filas sacadas a mano desde la columna "Filtrar". Viven solo en memoria
  // (no se persisten) y tampoco cuentan en los totales.
  const [hiddenRowKeys, setHiddenRowKeys] = useState(() => new Set());
  // La clave de una fila es ciclo + labor + día, sin la persona: al cambiar de
  // trabajador o volver a abrir el modal se vacían, para no ocultarle a otro
  // los mismos días.
  const hiddenScope = open ? worker?.id ?? null : null;
  const [hiddenFor, setHiddenFor] = useState(hiddenScope);
  if (hiddenFor !== hiddenScope) {
    setHiddenFor(hiddenScope);
    setHiddenRowKeys(new Set());
  }
  const toggleHidden = (rowKey) => setHiddenRowKeys((prev) => {
    const next = new Set(prev);
    if (next.has(rowKey)) next.delete(rowKey); else next.add(rowKey);
    return next;
  });
  const clearHidden = () => setHiddenRowKeys(new Set());
  // Muestra la columna "Filtrar"; arranca apagada. Apagarla conserva las
  // filas ya sacadas. Las exportaciones nunca la incluyen: sus celdas llevan
  // `data-export-hide` y `cloneForExport` las quita.
  const [showFilter, setShowFilter] = useState(false);
  const printRef = useRef(null);

  // Se recarga cuando cambia la persona (por su id), no cuando llega otra copia
  // del mismo objeto; `currentWorker` lee la de ahora.
  const workerId = worker?.id;
  if (useValuesChanged([open, workerId, catalogs, includeClosed, closedFrom, closedTo], { onMount: true })) {
    if (!open || !workerId) {
      setData([]);
      setAdvances([]);
    } else {
      setTitles(loadTitles(worker.id, worker.name || ""));
      setLoading(true);
    }
  }
  const currentWorker = useEffectEvent(() => worker);
  useEffect(() => {
    if (!open || !workerId) return;
    const w = currentWorker();
    (async () => {
      const { error: err } = await attempt(async () => {
        const opts = includeClosed
          ? { includeClosed: true, closedFrom, closedTo }
          : { includeClosed: false };
        const { data: result, advances: adv } = await loadWorkerSummaryData(w, catalogs, opts);
        setAdvances(adv);
        setData(result);
      });
      setLoading(false);
      if (err) throw err;
    })();
  }, [open, workerId, catalogs, includeClosed, closedFrom, closedTo]);

  // Aplica statusFilter y hiddenRowKeys y recalcula los totales por ciclo, así
  // los subtotales reflejan solo lo visible. `totalsByStatus` alimenta el
  // desglose "Pagado / En nómina / Sin pagar" bajo el subtotal cuando el ciclo
  // mezcla estados.
  const filteredData = useMemo(() => {
    return data.map((d) => {
      const filteredRows = d.rows.filter((r) => statusFilter.has(r.paymentStatus) && !hiddenRowKeys.has(r.rowKey));
      const totals = filteredRows.reduce(
        (acc, r) => ({
          harvestQty: acc.harvestQty + (r.harvestQty || 0),
          workdayCount: acc.workdayCount + (r.workdayCount || 0),
          pieceworkQty: acc.pieceworkQty + (r.pieceworkQty || 0),
          overtimeHours: acc.overtimeHours + (r.overtimeHours || 0),
          overtimeAmount: acc.overtimeAmount + (r.overtimeAmount || 0),
          amount: acc.amount + (r.amount || 0),
          floor: acc.floor + (r.floor || 0),
        }),
        { harvestQty: 0, workdayCount: 0, pieceworkQty: 0, overtimeHours: 0, overtimeAmount: 0, amount: 0, floor: 0 },
      );
      const totalsByStatus = { paid: 0, in_pending: 0, unpaid: 0 };
      for (const r of filteredRows) {
        const s = r.paymentStatus || "unpaid";
        totalsByStatus[s] = (totalsByStatus[s] || 0) + (r.amount || 0) + (r.floor || 0);
      }
      return { ...d, rows: filteredRows, totals, totalsByStatus };
    });
  }, [data, statusFilter, hiddenRowKeys]);

  const grandTotal = useMemo(
    () => filteredData.reduce((s, d) => s + (d.totals.amount || 0) + (d.totals.floor || 0), 0),
    [filteredData],
  );
  const { advanceBalance, bonusBalance, netAdvanceBalance } = useMemo(() => {
    let a = 0, b = 0;
    for (const adv of advances) {
      const rem = advanceRemaining(adv);
      if (advanceSign(adv) > 0) b += rem; else a += rem;
    }
    return { advanceBalance: a, bonusBalance: b, netAdvanceBalance: a - b };
  }, [advances]);

  const updateTitles = (patch) => {
    setTitles((prev) => {
      const next = { ...prev, ...patch };
      saveTitles(worker?.id, next);
      return next;
    });
  };

  // El encabezado (logo + título + nombre + RUT) es uno solo, pero cada vista
  // guarda su texto: por-ciclo en `titles`, cronológico en `titles.linear`.
  // Este par resuelve cuál se edita, así el panel "Personalizar títulos" sirve
  // para las dos. Vive fuera de `printRef` para que los controles no salgan en
  // la foto.
  const viewTitle =
    viewMode === "linear"
      ? {
          main: titles?.linear?.main || "DETALLE DE JORNADA — CRONOLÓGICO",
          subtitle: titles?.linear?.subtitle ?? titles?.subtitle ?? "",
        }
      : { main: titles.main || "", subtitle: titles.subtitle || "" };
  const updateViewTitle = (patch) => {
    if (viewMode !== "linear") return updateTitles(patch);
    updateTitles({ linear: { ...(titles?.linear || {}), ...viewTitle, ...patch } });
  };

  const handleDownload = () => download(printRef.current, `resumen_${(worker?.name || "trabajador").replace(/\s+/g, "_")}.png`);
  const handleCopy = () => copy(printRef.current);
  const handlePrint = () =>
    print(printRef.current, {
      title: `Resumen — ${worker?.name || ""}`,
      page: viewMode === "linear" ? "landscape" : "portrait",
      css: PRINT_GRID_CSS,
    });

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`📊 Resumen — ${worker?.name || ""}`}
      size="xl"
      footer={
        <>
          <button onClick={onClose} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm">
            Cerrar
          </button>
          {/* Sirven para las dos vistas: capturan `printRef`, que envuelve el
              encabezado (logo, título, nombre y RUT) y la tabla activa. */}
          <button onClick={handleCopy} disabled={busy === "copy" || loading} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            {busy === "copy" ? "Copiando..." : "📋 Copiar imagen"}
          </button>
          <button onClick={handleDownload} disabled={busy === "download" || loading} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            {busy === "download" ? "Descargando..." : "📥 Descargar PNG"}
          </button>
          <button onClick={handlePrint} disabled={loading} className="rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm hover:bg-[var(--color-accent-soft)] disabled:opacity-60">
            🖨 Imprimir
          </button>
        </>
      }
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="flex overflow-hidden rounded-md border border-[var(--color-border)] text-xs">
          <button
            onClick={() => setViewMode("byCycle")}
            className={`px-3 py-1.5 ${viewMode === "byCycle" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"}`}
          >
            📂 Por ciclo
          </button>
          <button
            onClick={() => setViewMode("linear")}
            className={`px-3 py-1.5 ${viewMode === "linear" ? "bg-[var(--color-accent)] text-[var(--color-accent-fg)] font-medium" : "bg-[var(--color-surface-2)] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"}`}
            title="Una sola tabla con los días en orden cronológico (columna Ciclo identifica el origen)"
          >
            📜 Cronológico
          </button>
        </div>
        <button
          onClick={() => setShowTitleEditor((v) => !v)}
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-xs hover:bg-[var(--color-accent-soft)]"
        >
          {showTitleEditor ? "▾" : "▸"} Personalizar títulos
        </button>
        <button
          onClick={() => setIncludeClosed((v) => !v)}
          className={`rounded-md border px-2 py-1 text-xs ${includeClosed ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)]" : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"}`}
          title="Suma al resumen las jornadas de ciclos cerrados (limitado al rango de fechas)"
        >
          {includeClosed ? "✓ " : ""}📂 Incluir ciclos cerrados
        </button>
        {includeClosed && (
          <div className="flex items-center gap-1 text-xs">
            <span className="text-[var(--color-muted)]">desde</span>
            <input
              type="date"
              value={closedFrom}
              onChange={(e) => setClosedFrom(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs outline-none focus:border-[var(--color-accent)]"
            />
            <span className="text-[var(--color-muted)]">hasta</span>
            <input
              type="date"
              value={closedTo}
              onChange={(e) => setClosedTo(e.target.value)}
              className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-1 py-0.5 text-xs outline-none focus:border-[var(--color-accent)]"
            />
          </div>
        )}
        {!loading && (data.length > 0 || advances.length > 0) && (
          <span className="ml-auto flex items-baseline gap-3 text-sm">
            <span>
              <span className="text-[var(--color-muted)]">Total general: </span>
              <span className="font-semibold tabular-nums">{fmtCurrency(grandTotal)}</span>
            </span>
            {advanceBalance > 0 && (
              <span>
                <span className="text-[var(--color-muted)]">Saldo anticipos: </span>
                <span className="font-semibold tabular-nums text-[#b45309]">
                  − {fmtCurrency(advanceBalance)}
                </span>
              </span>
            )}
            {bonusBalance > 0 && (
              <span>
                <span className="text-[var(--color-muted)]">Saldo bonos: </span>
                <span className="font-semibold tabular-nums text-[var(--color-success)]">
                  + {fmtCurrency(bonusBalance)}
                </span>
              </span>
            )}
          </span>
        )}
      </div>

      {/* Filtro por estado de pago e indicador de filas ocultas a mano. Las
          filas ocultas no cuentan en los totales. */}
      {!loading && data.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs">
          <span className="text-[var(--color-muted)]">Mostrar:</span>
          <StatusFilterPill status="paid" label="✓ Pagados" active={statusFilter.has("paid")} onToggle={() => toggleStatus("paid")} />
          <StatusFilterPill status="in_pending" label="⏳ En nómina" active={statusFilter.has("in_pending")} onToggle={() => toggleStatus("in_pending")} />
          <StatusFilterPill status="unpaid" label="○ Sin pagar" active={statusFilter.has("unpaid")} onToggle={() => toggleStatus("unpaid")} />
          <span className="ml-2 text-[var(--color-muted)]">·</span>
          <button
            onClick={() => setShowFilter((v) => !v)}
            className={`rounded-md border px-2 py-0.5 transition-colors ${
              showFilter
                ? "border-[var(--color-accent)] bg-[var(--color-accent-soft)] text-[var(--color-accent)]"
                : "border-[var(--color-border)] bg-[var(--color-surface-2)] hover:bg-[var(--color-accent-soft)]"
            }`}
            title="Muestra una columna para sacar días del resumen a mano. No sale en las fotos ni al imprimir."
          >
            {showFilter ? "✓ 👁 Filtrar: ON" : "👁 Filtrar"}
          </button>
          {hiddenRowKeys.size > 0 && (
            <>
              <span className="rounded-full bg-[var(--color-surface-2)] px-2 py-0.5 text-[var(--color-muted)]">
                {hiddenRowKeys.size} día{hiddenRowKeys.size === 1 ? "" : "s"} oculto{hiddenRowKeys.size === 1 ? "" : "s"}
              </span>
              <button
                onClick={clearHidden}
                className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-0.5 text-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]"
              >
                Mostrar todos
              </button>
            </>
          )}
        </div>
      )}

      {showTitleEditor && (
        <div className="mb-3 space-y-2 rounded-md border border-[var(--color-border)] bg-[var(--color-surface-2)] p-3">
          <div className="grid gap-2 md:grid-cols-2">
            <label className="block">
              <span className="block text-[10px] text-[var(--color-muted)]">Título principal</span>
              <input
                value={viewTitle.main}
                onChange={(e) => updateViewTitle({ main: e.target.value })}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
              />
            </label>
            <label className="block">
              <span className="block text-[10px] text-[var(--color-muted)]">Subtítulo (nombre formal)</span>
              <input
                value={viewTitle.subtitle}
                onChange={(e) => updateViewTitle({ subtitle: e.target.value })}
                className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
              />
            </label>
          </div>
          {data.length > 0 && viewMode !== "linear" && (
            <div className="space-y-1.5 border-t border-[var(--color-border)] pt-2">
              <div className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                Encabezado por ciclo
              </div>
              {data.map(({ cycle, job, subjob }) => {
                const fallback = defaultCycleTitle({ job, subjob, cycle });
                const current = titles.cycles?.[cycle.id] ?? "";
                return (
                  <label key={cycle.id} className="block">
                    <input
                      value={current}
                      placeholder={fallback}
                      onChange={(e) => {
                        const next = { ...(titles.cycles || {}) };
                        const v = e.target.value;
                        if (v) next[cycle.id] = v;
                        else delete next[cycle.id];
                        updateTitles({ cycles: next });
                      }}
                      className="w-full rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-sm outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                );
              })}
              <p className="text-[10px] text-[var(--color-muted)]">
                Dejar vacío para usar el encabezado por defecto (faena · subfaena · ciclo).
              </p>
            </div>
          )}
        </div>
      )}

      {loading ? (
        <div className="py-8 text-center text-sm text-[var(--color-muted)]">Cargando...</div>
      ) : data.length === 0 && advances.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          Sin actividad en ciclos activos ni anticipos pendientes
        </div>
      ) : null}
      <PrintableWorkerSummary
        ref={printRef}
        worker={worker}
        data={filteredData}
        grandTotal={grandTotal}
        advances={advances}
        netAdvanceBalance={netAdvanceBalance}
        advanceBalance={advanceBalance}
        bonusBalance={bonusBalance}
        titles={titles}
        viewMode={viewMode}
        onUpdateTitles={updateTitles}
        catalogs={catalogs}
        onToggleHidden={showFilter ? toggleHidden : undefined}
      />
    </Modal>
  );
}
