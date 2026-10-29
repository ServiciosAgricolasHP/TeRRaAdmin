import { useRef, useState, useMemo } from "react";
import Modal from "../../../components/Modal";
import {
  getDaySingle,
} from "../../../utils/cosechaCombos";
import { isRedDay } from "../../../utils/tratoHE";
import { useCaptureActions } from "../../../hooks/useCaptureActions";
import { writeLaborWorkerGridXlsx } from "./writeLaborWorkerGridXlsx";
import { WorkerGridTable } from "./WorkerGridTable";

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
  const ref = useRef(null);
  const { busy, run, copy, download, print } = useCaptureActions();
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
  }, [labor, dates, dayPrices]);

  const filename = `resumen_trabajadores_${(labor?.name || "labor").replace(/[/\s]+/g, "_")}.png`;
  const xlsxFilename = `resumen_${(labor?.name || "labor").replace(/[/\s]+/g, "_")}.xlsx`;

  const handleCopy = () => copy(ref.current);
  const handleDownload = () => download(ref.current, filename);
  const handleXlsx = () =>
    run("xlsx", () => writeLaborWorkerGridXlsx({
      catalogs,
      dates,
      dayPrices,
      displayName,
      labor,
      redDates,
      unit,
      workers,
      xlsxFilename,
    }), { error: "No se pudo exportar" });

  const handlePrint = () =>
    print(ref.current, {
      title: `${displayName} — trabajadores`,
      margin: "10mm",
      css: "th, td { border: 1px solid #888; padding: 5px 7px; font-size: 11px; }",
    });

  if (allWorkers.length === 0 || dates.length === 0) return null;

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
            <WorkerGridTable
              anyPiso={anyPiso}
              catalogs={catalogs}
              containers={containers}
              dates={dates}
              dayPrices={dayPrices}
              displayName={displayName}
              labor={labor}
              redDates={redDates}
              titles={titles}
              unit={unit}
              workers={workers}
            />
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
              <WorkerGridTable
              anyPiso={anyPiso}
              catalogs={catalogs}
              containers={containers}
              dates={dates}
              dayPrices={dayPrices}
              displayName={displayName}
              labor={labor}
              redDates={redDates}
              titles={titles}
              unit={unit}
              workers={workers}
            />
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
