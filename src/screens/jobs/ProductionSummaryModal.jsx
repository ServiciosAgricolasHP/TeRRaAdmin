import { useState, useEffect, useMemo } from "react";
import Modal from "../../components/Modal";
import { useCatalogs } from "../../contexts/CatalogsContext";
import { useIsMobile } from "../../hooks/useIsMobile";
import { buildCell } from "./productionSummaryModal/buildCell";
import { CombinedSummaryCard } from "./productionSummaryModal/CombinedSummaryCard";
import { loadJSON, saveJSON } from "./productionSummaryModal/helpers";
import { LaborGroupTotalsCard } from "./productionSummaryModal/LaborGroupTotalsCard";
import { LaborSummaryCard } from "./productionSummaryModal/LaborSummaryCard";
import {
  columnsData,
  firstColumnByCycle,
  laborGroupTotals,
  laborGroupsByIdOf,
  orderCycles,
  summaryColumns,
  summaryDays,
  transportByCycleOf,
  transportTotalOf,
} from "../../utils/productionSummary";
import { useProductionData } from "./productionSummaryModal/useProductionData";
import { useValuesChanged } from "../../hooks/useValuesChanged";

// "2026-07-24" → "24/07", para mostrar rangos de fecha compactos en tablas.
const shortDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}` : (iso || "");
};

// Qué ciclos van tildados se recuerda por id en un mapa acumulativo de
// localStorage, así un ciclo destildado sigue así al reabrir el resumen,
// desde cualquier faena. Los ciclos que no están en el mapa usan
// `initialEnabledCycleIds` (todos, si no viene).
const computeEnabledCycles = (cyclesList, initialEnabledCycleIds) => {
  const map = loadJSON("enabledCyclesMap", {});
  const defaults = new Set(initialEnabledCycleIds || cyclesList.map((c) => c.id));
  const set = new Set();
  for (const c of cyclesList) {
    const v = map[c.id];
    if (v === true || (v === undefined && defaults.has(c.id))) set.add(c.id);
  }
  return set;
};

// Resumen de producción de uno o varios ciclos: una tarjeta por (ciclo, labor)
// de cosecha, trato, trato por etapas, pago al día o supervisión, con filas
// por día (cantidad, unidad, precio, monto y rendimiento: personas distintas y
// promedio por persona); con más de una labor, además una tabla general que
// las combina, y los totales por grupo de labor.
//
// `cycles` son docs de ciclo con `dayPrices` y `labors`. Las jornadas se leen
// por ciclo; si el llamador ya las tiene, puede pasarlas en `workdaysByCycle`.
export default function ProductionSummaryModal({
  open,
  onClose,
  title = "Resumen de producción",
  cycles = [],
  workdaysByCycle: workdaysByCycleProp,
  initialEnabledCycleIds,
}) {
  const { catalogs } = useCatalogs();
  const isMobile = useIsMobile();
  // Filtros: por tipo de labor y por ciclo. `initialEnabledCycleIds` decide
  // qué ciclos arrancan prendidos; los demás aparecen como chip apagado.
  const [typeFilter, setTypeFilter] = useState(
    () => loadJSON("typeFilter", { cosecha: true, trato: true, tratoEtapas: true, main: true, supervision: true }),
  );
  useEffect(() => { saveJSON("typeFilter", typeFilter); }, [typeFilter]);
  // Muestra u oculta la fila TRANSPORTE (y MONTO LIBRE NETO, que se deriva de
  // ella); el cálculo por ciclo se mantiene.
  const [includeTransport, setIncludeTransport] = useState(() => loadJSON("includeTransport", true));
  useEffect(() => { saveJSON("includeTransport", includeTransport); }, [includeTransport]);
  const [enabledCycles, setEnabledCyclesState] = useState(
    () => computeEnabledCycles(cycles, initialEnabledCycleIds),
  );
  // Envuelve el setter: además de actualizar el estado, guarda en el mapa
  // acumulativo de localStorage el estado de todos los ciclos de la lista.
  const setEnabledCycles = (updater) => {
    setEnabledCyclesState((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      const map = loadJSON("enabledCyclesMap", {});
      for (const c of cycles) map[c.id] = next.has(c.id);
      saveJSON("enabledCyclesMap", map);
      return next;
    });
  };
  // Oculta los ciclos cerrados del selector y pliega sus tarjetas, todos de una vez.
  const [allClosedCollapsed, setAllClosedCollapsed] = useState(() => loadJSON("allClosedCollapsed", true));
  useEffect(() => { saveJSON("allClosedCollapsed", allClosedCollapsed); }, [allClosedCollapsed]);

  const cycleIdsKey = cycles.map((c) => c.id).join(",");
  const initialIdsKey = (initialEnabledCycleIds || []).join(",");
  if (useValuesChanged([cycleIdsKey, initialIdsKey], { onMount: true })) {
    setEnabledCyclesState(computeEnabledCycles(cycles, initialEnabledCycleIds));
  }

  const { laborGroupsBySubjob, loading, tripsByCycle, wdByCycle } = useProductionData({ cycles, enabledCycles, open, workdaysByCycleProp });

  const laborGroupsById = useMemo(() => laborGroupsByIdOf(laborGroupsBySubjob), [laborGroupsBySubjob]);

  const orderedCycles = useMemo(() => orderCycles(cycles), [cycles]);

  const columns = useMemo(() => summaryColumns(orderedCycles, enabledCycles, typeFilter), [orderedCycles, enabledCycles, typeFilter]);

  const days = useMemo(() => summaryDays(cycles, enabledCycles, wdByCycle), [cycles, enabledCycles, wdByCycle]);

  // Por celda (día × columna): cantidad, monto, precios y personas, en un
  // solo pase sobre las jornadas.
  const cellsByKey = useMemo(() => {
    const out = new Map(); // `${day}__${colKey}` → cellData
    for (const col of columns) {
      const wds = (wdByCycle[col.cycleId] || []).filter(
        (w) => w.laborId === col.labor.id,
      );
      const byDay = new Map();
      for (const wd of wds) {
        if (!wd.date) continue;
        if (!byDay.has(wd.date)) byDay.set(wd.date, []);
        byDay.get(wd.date).push(wd);
      }
      for (const [day, list] of byDay) {
        const data = buildCell(col.labor, day, list, col.dayPrices, catalogs);
        if (data) out.set(`${day}__${col.key}`, data);
      }
    }
    return out;
  }, [columns, wdByCycle, catalogs]);

  const dataByColumn = useMemo(() => columnsData(columns, days, cellsByKey, wdByCycle), [columns, days, cellsByKey, wdByCycle]);

  const transportByCycle = useMemo(() => transportByCycleOf(cycles, tripsByCycle), [cycles, tripsByCycle]);

  const firstColKeyForCycle = useMemo(() => firstColumnByCycle(dataByColumn), [dataByColumn]);

  const grandTotalTransport = useMemo(() => transportTotalOf(dataByColumn, transportByCycle), [dataByColumn, transportByCycle]);

  const groupTotals = useMemo(() => laborGroupTotals(dataByColumn, laborGroupsById), [dataByColumn, laborGroupsById]);

  return (
    <Modal section="Resumen de producción" open={open} onClose={onClose} title={title} size="2xl">
      <div className="mb-3 flex flex-wrap items-center gap-3 text-xs">
        {/* Filtro de tipos */}
        <span className="text-[var(--color-muted)]">Tipo:</span>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={typeFilter.cosecha}
            onChange={(e) => setTypeFilter((p) => ({ ...p, cosecha: e.target.checked }))}
          />
          <span>🌾 Cosecha</span>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={typeFilter.trato}
            onChange={(e) => setTypeFilter((p) => ({ ...p, trato: e.target.checked }))}
          />
          <span>🛠 Trato</span>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={typeFilter.tratoEtapas}
            onChange={(e) => setTypeFilter((p) => ({ ...p, tratoEtapas: e.target.checked }))}
          />
          <span>🏕 Por etapas</span>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={typeFilter.main}
            onChange={(e) => setTypeFilter((p) => ({ ...p, main: e.target.checked }))}
          />
          <span>💰 Jornadas</span>
        </label>
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={typeFilter.supervision}
            onChange={(e) => setTypeFilter((p) => ({ ...p, supervision: e.target.checked }))}
          />
          <span>🧑‍💼 Supervisión</span>
        </label>
        <span className="mx-1 h-4 w-px bg-[var(--color-border)]" />
        <label className="flex items-center gap-1">
          <input
            type="checkbox"
            checked={includeTransport}
            onChange={(e) => setIncludeTransport(e.target.checked)}
          />
          <span>🚐 Transporte</span>
        </label>
      </div>

      {/* Selector de ciclos (tabla en escritorio, lista en móvil) con estado y
          días trabajados. Los cerrados van ocultos por defecto detrás de
          "+N cerrados". La selección se guarda por id de ciclo (ver
          `computeEnabledCycles`). */}
      {cycles.length > 1 && (
        <div className="mb-3 overflow-hidden rounded-md border border-[var(--color-border)]">
          <div className="flex items-center justify-between bg-[var(--color-surface-2)] px-2 py-1.5 text-xs">
            <span className="font-medium text-[var(--color-muted)]">Ciclos incluidos</span>
            <button
              type="button"
              onClick={() => setAllClosedCollapsed((v) => !v)}
              className="rounded-full border border-[var(--color-border)] bg-[var(--color-surface)] px-2.5 py-0.5 text-[11px] hover:bg-[var(--color-accent-soft)]"
              title="Colapsa o expande los ciclos cerrados de la tabla, para que no ocupen tanto espacio"
            >
              {allClosedCollapsed ? "▸ Expandir cerrados" : "▾ Colapsar cerrados"}
            </button>
          </div>
          <div className="max-h-60 overflow-y-auto">
            {isMobile ? (
              <div className="divide-y divide-[var(--color-border)]">
                {orderedCycles.map((c) => {
                  if (allClosedCollapsed && c.status === "closed") return null;
                  const on = enabledCycles.has(c.id);
                  const days = Array.isArray(c.days) ? c.days : [];
                  const dayCount = days.length;
                  const range = dayCount > 0
                    ? [...days].sort().reduce((r, d) => ({ from: r.from < d ? r.from : d, to: r.to > d ? r.to : d }), { from: days[0], to: days[0] })
                    : null;
                  return (
                    <div
                      key={c.id}
                      onClick={() => setEnabledCycles((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })}
                      className={`flex cursor-pointer items-center gap-2 px-2 py-2 text-xs ${on ? "bg-[var(--color-accent-soft)]" : ""}`}
                    >
                      <input type="checkbox" checked={on} readOnly className="pointer-events-none shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{c.label || c.id}</div>
                        <div className="text-[10px] text-[var(--color-muted)]">
                          {dayCount} día{dayCount === 1 ? "" : "s"}
                          {range && ` · ${shortDate(range.from)} → ${shortDate(range.to)}`}
                        </div>
                      </div>
                      {c.status === "closed" ? (
                        <span className="shrink-0 rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">🔒 cerrado</span>
                      ) : (
                        <span className="shrink-0 rounded-full bg-[var(--color-success-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-success)]">abierto</span>
                      )}
                    </div>
                  );
                })}
              </div>
            ) : (
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-[var(--color-surface)] text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                <tr>
                  <th className="w-7 px-2 py-1"></th>
                  <th className="px-2 py-1">Ciclo</th>
                  <th className="px-2 py-1 text-right">Días trabajados</th>
                  <th className="px-2 py-1">Estado</th>
                </tr>
              </thead>
              <tbody>
                {orderedCycles.map((c) => {
                  if (allClosedCollapsed && c.status === "closed") return null;
                  const on = enabledCycles.has(c.id);
                  const days = Array.isArray(c.days) ? c.days : [];
                  const dayCount = days.length;
                  const range = dayCount > 0
                    ? [...days].sort().reduce((r, d) => ({ from: r.from < d ? r.from : d, to: r.to > d ? r.to : d }), { from: days[0], to: days[0] })
                    : null;
                  return (
                    <tr
                      key={c.id}
                      onClick={() => setEnabledCycles((prev) => {
                        const next = new Set(prev);
                        if (next.has(c.id)) next.delete(c.id);
                        else next.add(c.id);
                        return next;
                      })}
                      title={range ? `${range.from} → ${range.to}` : "sin días trabajados"}
                      className={`cursor-pointer border-t border-[var(--color-border)] ${on ? "bg-[var(--color-accent-soft)]" : "hover:bg-[var(--color-surface-2)]"}`}
                    >
                      <td className="px-2 py-1">
                        <input type="checkbox" checked={on} readOnly className="pointer-events-none" />
                      </td>
                      <td className="px-2 py-1 font-medium">{c.label || c.id}</td>
                      <td className="px-2 py-1 text-right tabular-nums">
                        <div>{dayCount} día{dayCount === 1 ? "" : "s"}</div>
                        {range && (
                          <div className="text-[10px] font-normal text-[var(--color-muted)]">
                            {shortDate(range.from)} → {shortDate(range.to)}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-1">
                        {c.status === "closed" ? (
                          <span className="rounded-full bg-[var(--color-surface-2)] px-1.5 py-0.5 text-[10px] text-[var(--color-muted)]">🔒 cerrado</span>
                        ) : (
                          <span className="rounded-full bg-[var(--color-success-soft)] px-1.5 py-0.5 text-[10px] text-[var(--color-success)]">abierto</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            )}
          </div>
          {allClosedCollapsed && (() => {
            const closedCount = orderedCycles.filter((c) => c.status === "closed").length;
            if (closedCount === 0) return null;
            return (
              <button
                type="button"
                onClick={() => setAllClosedCollapsed(false)}
                className="w-full border-t border-dashed border-[var(--color-border)] bg-[var(--color-surface-2)] px-2 py-1 text-center text-[11px] text-[var(--color-muted)] hover:bg-[var(--color-accent-soft)]"
              >
                🔒 +{closedCount} cerrado{closedCount === 1 ? "" : "s"} — mostrar
              </button>
            );
          })()}
        </div>
      )}

      {loading && (
        <div className="py-2 text-center text-xs text-[var(--color-muted)]">Cargando jornadas…</div>
      )}

      {columns.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          No hay labores de trato o cosecha en los ciclos seleccionados.
        </div>
      ) : dataByColumn.length === 0 ? (
        <div className="rounded-md border border-dashed border-[var(--color-border)] py-8 text-center text-sm text-[var(--color-muted)]">
          Sin producción registrada en los ciclos seleccionados.
        </div>
      ) : (
        <div className="space-y-3">
          {/* Tabla general combinada (días × labores, con totales por día y
              por labor), solo con más de una labor; abajo, el detalle por labor. */}
          {dataByColumn.length > 1 && (
            <CombinedSummaryCard
              dataByColumn={dataByColumn}
              days={days}
              transportByCycle={transportByCycle}
              firstColKeyForCycle={firstColKeyForCycle}
              grandTotalTransport={grandTotalTransport}
              includeTransport={includeTransport}
            />
          )}
          {groupTotals.length > 0 && <LaborGroupTotalsCard groupTotals={groupTotals} />}
          {dataByColumn.map((d) => (
            <LaborSummaryCard key={d.col.key} data={d} catalogs={catalogs} allClosedCollapsed={allClosedCollapsed} />
          ))}
        </div>
      )}
    </Modal>
  );
}
