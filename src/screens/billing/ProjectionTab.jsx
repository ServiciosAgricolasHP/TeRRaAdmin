import { useMemo, useState } from "react";
import { projectionYearsOf } from "../../utils/billingDocs";
import { formatPeriod, groupByCounterparty, projectCashFlow } from "../../utils/cashFlowProjection";
import { writeProjectionXlsx } from "./writeProjectionXlsx";
import { MONTH_NAMES_ES, currentPeriod } from "./docs";
import { SummaryCard } from "./SummaryCard";
import { fmtCurrency } from "../../utils/format";

// Pestaña "Proyección" (solo admin): la temporada que viene, mes a mes, desde
// las ventas de los 12 meses anteriores por un porcentaje, con los meses ya
// facturados en su valor real. El mes de inicio y el porcentaje los guarda la
// pantalla, así se conservan al cambiar de pestaña.
export function ProjectionTab({ docs, projectionPercent, projectionStart, selectedCompany, selectedCompanyId, setProjectionPercent, setProjectionStart, toast }) {
  "use no memo";
  const [projectionBusy, setProjectionBusy] = useState("");

  const projectionYears = useMemo(() => projectionYearsOf(docs, selectedCompanyId, new Date().getFullYear()), [docs, selectedCompanyId]);

  const projection = useMemo(
    () => projectCashFlow(docs, {
      companyId: selectedCompanyId,
      startPeriod: projectionStart,
      percent: Number(projectionPercent) || 0,
    }),
    [docs, selectedCompanyId, projectionStart, projectionPercent],
  );

  const projectionByClient = useMemo(() => groupByCounterparty(projection.detail), [projection.detail]);

  const projectionFileBase = useMemo(() => {
    const alias = (selectedCompany?.alias || selectedCompany?.razonSocial || "empresa").replace(/[^\w-]+/g, "_");
    return `Proyeccion_${alias}_${(projection.targetLabel || projectionStart).replace(/[^\w-]+/g, "_")}`;
  }, [selectedCompany, projection.targetLabel, projectionStart]);

  // ===== Export de la Proyección =====
  // Dos hojas: la base con el detalle que la sostiene, y la proyección aparte.
  // El porcentaje va en UNA celda y las filas la referencian (`$C$4`): quien
  // recibe el archivo cambia el supuesto en Excel y la temporada entera se
  // recalcula.
  const handleProjectionXlsx = async () => {
    setProjectionBusy("xlsx");
    try {
      await writeProjectionXlsx({ projection, projectionByClient, projectionFileBase, selectedCompany });
    } catch (err) {
      toast.error("Error al generar XLSX: " + (err.message || err));
    } finally {
      setProjectionBusy("");
    }
  };

  const emptyBase = projection.baseCount === 0;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-xs text-[var(--color-muted)]">Proyectar desde</label>
        <select
          value={projectionStart.slice(5, 7)}
          onChange={(e) => setProjectionStart(`${projectionStart.slice(0, 4)}-${e.target.value}`)}
          className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
        >
          {MONTH_NAMES_ES.map((m, i) => (
            <option key={m} value={String(i + 1).padStart(2, "0")}>{m}</option>
          ))}
        </select>
        <select
          value={projectionStart.slice(0, 4)}
          onChange={(e) => setProjectionStart(`${e.target.value}-${projectionStart.slice(5, 7)}`)}
          className="min-h-[32px] rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm"
        >
          {projectionYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
        <label className="ml-2 text-xs text-[var(--color-muted)]">% sobre el período anterior</label>
        <input
          type="number"
          min="0"
          step="1"
          value={projectionPercent}
          onChange={(e) => setProjectionPercent(e.target.value)}
          className="min-h-[32px] w-20 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-right text-sm tabular-nums"
        />
        <div className="ml-auto">
          <button
            onClick={handleProjectionXlsx}
            disabled={projectionBusy === "xlsx" || emptyBase}
            title={emptyBase ? "No hay ventas en el período base" : "Descargar el reporte en Excel"}
            className="min-h-[32px] rounded-md bg-[var(--color-accent)] px-3 py-1 text-sm font-medium text-[var(--color-accent-fg)] hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
          >
            {projectionBusy === "xlsx" ? "Generando..." : "📊 Descargar Excel"}
          </button>
        </div>
      </div>

      <p className="text-xs text-[var(--color-muted)]">
        Proyección <strong>{projection.targetLabel}</strong> — cada mes se estima desde el mismo mes de{" "}
        <strong>{projection.baseLabel}</strong> multiplicado por el porcentaje, <strong>salvo los meses
        que ya tienen ventas cargadas</strong>, que valen su dato real. Solo entran las{" "}
        <strong>ventas</strong> (las compras son salidas y quedan fuera); las notas de crédito restan.
        Una <strong>factura de compra entra solo por su neto</strong> —el IVA lo retiene el cliente y
        nunca se cobra—; el resto entra con IVA incluido.
      </p>

      {projection.rows.some((r) => r.esReal && r.periodo === currentPeriod()) && (
        <p className="rounded-md border border-[var(--color-warning)] bg-[var(--color-warning-soft)] px-3 py-2 text-xs text-[var(--color-warning)]">
          ⚠ {formatPeriod(currentPeriod())} es el mes en curso: su dato real puede estar incompleto y
          arrastrar el total para abajo.
        </p>
      )}

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <SummaryCard label={`Ingresos ${projection.baseLabel}`} value={fmtCurrency(projection.baseTotal)} subtle />
        <SummaryCard
          label={`Real · ${projection.mesesReales} ${projection.mesesReales === 1 ? "mes" : "meses"}`}
          value={fmtCurrency(projection.totalReal)}
        />
        <SummaryCard
          label={`Estimado · ${projection.mesesEstimados} ${projection.mesesEstimados === 1 ? "mes" : "meses"} al ${projection.percent}%`}
          value={fmtCurrency(projection.totalProyectado)}
        />
        <SummaryCard label={`Total ${projection.targetLabel}`} value={fmtCurrency(projection.total)} highlight />
      </div>

      {emptyBase && projection.mesesReales === 0 ? (
        <div className="flex h-40 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-[var(--color-border)] px-4 text-center text-sm text-[var(--color-muted)]">
          <div>No hay ventas importadas en {projection.baseLabel}.</div>
          <div className="text-xs">
            La proyección se calcula sobre esos 12 meses — sin ellos no hay nada que escalar.
          </div>
        </div>
      ) : (
        <div className="overflow-auto rounded-md border border-[var(--color-border)]">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-surface-2)] text-xs uppercase tracking-wide text-[var(--color-muted)]">
              <tr>
                <th className="px-2 py-2 text-left">Mes</th>
                <th className="px-2 py-2 text-left">Origen</th>
                <th className="px-2 py-2 text-right">Ingreso base</th>
                <th className="px-2 py-2 text-right">Monto</th>
              </tr>
            </thead>
            <tbody>
              {projection.rows.map((row) => (
                <tr
                  key={row.periodo}
                  className={`border-t border-[var(--color-border)] ${
                    !row.esReal && row.baseCount === 0 ? "text-[var(--color-muted)]" : ""
                  }`}
                >
                  <td className="px-2 py-1.5">{formatPeriod(row.periodo)}</td>
                  <td className="px-2 py-1.5 text-xs">
                    {row.esReal ? (
                      <span className="rounded-full bg-[var(--color-success-soft)] px-1.5 py-0.5 font-semibold text-[var(--color-success)]">
                        ✓ real · {row.realCount} doc.
                      </span>
                    ) : (
                      <span className="text-[var(--color-muted)]">
                        {row.basePeriodo} × {projection.percent}%
                      </span>
                    )}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">
                    {row.esReal ? <span className="text-[var(--color-muted)]">—</span> : fmtCurrency(row.baseMonto)}
                  </td>
                  <td className={`px-2 py-1.5 text-right font-semibold tabular-nums ${row.esReal ? "text-[var(--color-success)]" : ""}`}>
                    {fmtCurrency(row.monto)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface-2)] font-semibold">
                <td className="px-2 py-2" colSpan={3}>TOTAL {projection.targetLabel}</td>
                <td className="px-2 py-2 text-right tabular-nums">{fmtCurrency(projection.total)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
