import { useState, useEffect, useMemo } from "react";
import Modal from "../../components/Modal";
import { listWorkdaysByCycle, laborGroupsService } from "../../services";
import { tripsService } from "../../services/transportsService";
import { useCatalogs } from "../../contexts/CatalogsContext";
import { getTratoTierTotals } from "../../utils/cosechaCombos";
import { countingStageIds } from "../../utils/tratoEtapas";
import { useIsMobile } from "../../hooks/useIsMobile";
import { buildCell } from "./productionSummaryModal/buildCell";
import { CombinedSummaryCard } from "./productionSummaryModal/CombinedSummaryCard";
import { loadJSON, saveJSON } from "./productionSummaryModal/helpers";
import { LaborGroupTotalsCard } from "./productionSummaryModal/LaborGroupTotalsCard";
import { LaborSummaryCard } from "./productionSummaryModal/LaborSummaryCard";

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
  const [wdByCycle, setWdByCycle] = useState(workdaysByCycleProp || {});
  const [tripsByCycle, setTripsByCycle] = useState({});
  const [loading, setLoading] = useState(false);
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

  useEffect(() => {
    setEnabledCyclesState(computeEnabledCycles(cycles, initialEnabledCycleIds));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cycles.map((c) => c.id).join(","), (initialEnabledCycleIds || []).join(",")]);

  // Lee las jornadas de los ciclos prendidos que no están en `wdByCycle` (el
  // llamador puede pasarlas en `workdaysByCycle`). La consulta filtra por
  // ciclo en el servidor y los ciclos apagados no se leen: al prender un chip,
  // el efecto trae el que falte.
  useEffect(() => {
    if (!open) return;
    const missing = cycles.filter((c) => enabledCycles.has(c.id) && !wdByCycle[c.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        // Una consulta por ciclo: la clave de caché queda estable y prender o
        // apagar un chip no vuelve a pagar. Usa el helper compartido con
        // Nómina, que pide lo mismo con las mismas opciones (misma clave y TTL).
        const fetched = await Promise.all(
          missing.map(async (c) => [c.id, await listWorkdaysByCycle(c.id)]),
        );
        if (cancelled) return;
        setWdByCycle((prev) => {
          const next = { ...prev };
          for (const [cid, list] of fetched) next[cid] = list;
          return next;
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cycles.map((c) => c.id).join(","), [...enabledCycles].sort().join(",")]);

  // Carga las vueltas de transporte de cada ciclo — usadas por la fila
  // TRANSPORTE de la tabla general (costo de transporte por ciclo).
  useEffect(() => {
    if (!open) return;
    const missing = cycles.filter((c) => !tripsByCycle[c.id]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const fetched = await Promise.all(
          missing.map(async (c) => [c.id, await tripsService.listByCycle(c.id)]),
        );
        if (cancelled) return;
        setTripsByCycle((prev) => {
          const next = { ...prev };
          for (const [cid, list] of fetched) next[cid] = list;
          return next;
        });
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cycles.map((c) => c.id).join(",")]);

  // Agrupaciones de labor (laborGroups) de las subfaenas involucradas, para
  // nombrar los grupos al totalizar por laborGroupId. Se leen por subfaena y
  // no por ciclo: varios ciclos comparten subfaena.
  const [laborGroupsBySubfaena, setLaborGroupsBySubfaena] = useState({});
  useEffect(() => {
    if (!open) return;
    const subIds = [...new Set(cycles.map((c) => c.subfaenaId).filter(Boolean))];
    const missing = subIds.filter((sid) => !laborGroupsBySubfaena[sid]);
    if (missing.length === 0) return;
    let cancelled = false;
    (async () => {
      try {
        const fetched = await Promise.all(
          missing.map(async (sid) => [sid, await laborGroupsService.list({ wheres: [["subfaenaId", "==", sid]] })]),
        );
        if (cancelled) return;
        setLaborGroupsBySubfaena((prev) => {
          const next = { ...prev };
          for (const [sid, list] of fetched) next[sid] = list;
          return next;
        });
      } catch { /* noop */ }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, cycles.map((c) => c.id).join(",")]);
  const laborGroupsById = useMemo(() => {
    const m = new Map();
    for (const list of Object.values(laborGroupsBySubfaena)) {
      for (const g of list) m.set(g.id, g);
    }
    return m;
  }, [laborGroupsBySubfaena]);

  // Orden de columnas y chips: agrupados por subfaena y, dentro de cada
  // grupo, del más viejo al más nuevo por el primer día de `days` (el mismo
  // criterio que la navegación anterior/siguiente de CycleDetail). Los grupos
  // se ordenan por su ciclo más antiguo.
  const orderedCycles = useMemo(() => {
    const sortKeyFor = (c) => {
      const days = c.days;
      if (Array.isArray(days) && days.length > 0) {
        return days.reduce((min, d) => (d < min ? d : min), days[0]);
      }
      return c.startDate || c.createdAt?.toDate?.()?.toISOString?.() || "";
    };
    const groups = new Map(); // subfaenaId (o "" para huérfanos) -> cycles[]
    for (const c of cycles) {
      const key = c.subfaenaId || "";
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(c);
    }
    const groupList = [...groups.values()].map((list) => {
      const sorted = [...list].sort((a, b) => sortKeyFor(a).localeCompare(sortKeyFor(b)));
      return { sorted, groupKey: sorted.length > 0 ? sortKeyFor(sorted[0]) : "" };
    });
    groupList.sort((a, b) => a.groupKey.localeCompare(b.groupKey));
    return groupList.flatMap((g) => g.sorted);
  }, [cycles]);

  // Columnas: una por (ciclo, labor) de tipo cosecha, trato, trato por
  // etapas, pago al día o supervisión. Labores con el mismo nombre en ciclos
  // distintos quedan en columnas separadas.
  const columns = useMemo(() => {
    const cols = [];
    for (const c of orderedCycles) {
      if (!enabledCycles.has(c.id)) continue;
      for (const l of c.labors || []) {
        if (l.type !== "cosecha" && l.type !== "trato" && l.type !== "tratoEtapas" && l.type !== "main" && l.type !== "supervision") continue;
        if (!typeFilter[l.type]) continue;
        cols.push({
          key: `${c.id}__${l.id}`,
          cycleId: c.id,
          cycleLabel: c.label || c.id,
          cycleStatus: c.status || "open",
          labor: l,
          dayPrices: c.dayPrices || {},
        });
      }
    }
    return cols;
  }, [orderedCycles, enabledCycles, typeFilter]);

  // Días: unión de las fechas con jornadas (de cualquier labor) de los ciclos
  // prendidos, en orden ascendente.
  const days = useMemo(() => {
    const set = new Set();
    for (const c of cycles) {
      if (!enabledCycles.has(c.id)) continue;
      const wds = wdByCycle[c.id] || [];
      for (const wd of wds) {
        if (wd.date) set.add(wd.date);
      }
    }
    return [...set].sort();
  }, [cycles, enabledCycles, wdByCycle]);

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

  // Por columna (labor): las filas por día con producción y sus totales.
  // Alimenta una tarjeta por labor, con su propia tabla y sus botones de
  // copiar e imprimir.
  const dataByColumn = useMemo(() => {
    return columns
      .map((col) => {
        const rows = days
          .map((d) => ({ day: d, cell: cellsByKey.get(`${d}__${col.key}`) }))
          .filter((r) => r.cell);
        const totalQty = rows.reduce((s, r) => s + (r.cell.qty || 0), 0);
        const totalAmount = rows.reduce((s, r) => s + (r.cell.amount || 0), 0);
        const unitSet = new Set();
        const personSet = new Set();
        rows.forEach((r) => {
          if (r.cell.unit) unitSet.add(r.cell.unit);
        });
        // Personas únicas en todos los días: se cuentan desde las jornadas
        // para no repetir a quien trabajó varios días.
        const wds = (wdByCycle[col.cycleId] || []).filter(
          (w) => w.laborId === col.labor.id && w.workerRut,
        );
        const countingForCol = col.labor.type === "tratoEtapas" ? countingStageIds(col.labor) : null;
        for (const wd of wds) {
          let hasProd;
          if (col.labor.type === "cosecha") {
            hasProd = Number(wd.qty) > 0 && !wd.pisoOnly;
          } else if (col.labor.type === "tratoEtapas") {
            // Solo cuenta como "persona con producción" si aportó en una etapa
            // que cuenta (misma regla que las unidades).
            hasProd = countingForCol.has(String(wd.stageId)) && Number(wd.qty) > 0 && !wd.pisoOnly;
          } else if (col.labor.type === "main" || col.labor.type === "supervision") {
            // Pago al día: el monto va directo en la jornada, sin tiers.
            hasProd = Number(wd.amount) > 0 && !wd.pisoOnly;
          } else {
            hasProd = Number(getTratoTierTotals(wd).qty) > 0 && !wd.pisoOnly;
          }
          if (hasProd) personSet.add(wd.workerRut);
        }
        const unitStr = [...unitSet].join("/");
        return {
          col,
          rows,
          totalQty,
          totalAmount,
          unit: unitStr,
          persons: personSet.size,
        };
      })
      .filter((d) => d.rows.length > 0);
  }, [columns, days, cellsByKey, wdByCycle]);

  // Costo de transporte por ciclo (uno por ciclo, aunque tenga varias
  // columnas de labor). `hasTrips` distingue $0 con vueltas sin monto
  // (revisar tarifas) de $0 sin ninguna vuelta cargada.
  const transportByCycle = useMemo(() => {
    const out = new Map();
    for (const c of cycles) {
      const trips = tripsByCycle[c.id] || [];
      out.set(c.id, {
        total: trips.reduce((s, t) => s + (Number(t.amount) || 0), 0),
        hasTrips: trips.length > 0,
      });
    }
    return out;
  }, [cycles, tripsByCycle]);

  // Primera columna visible de cada ciclo — ahí (y solo ahí) se muestra el
  // total de transporte de ese ciclo, para no duplicarlo cuando un ciclo
  // tiene varias labores/columnas y así no inflar el gran total.
  const firstColKeyForCycle = useMemo(() => {
    const seen = new Map();
    for (const d of dataByColumn) {
      if (!seen.has(d.col.cycleId)) seen.set(d.col.cycleId, d.col.key);
    }
    return seen;
  }, [dataByColumn]);

  const grandTotalTransport = useMemo(() => {
    const cycleIds = new Set(dataByColumn.map((d) => d.col.cycleId));
    let sum = 0;
    for (const cid of cycleIds) sum += transportByCycle.get(cid)?.total || 0;
    return sum;
  }, [dataByColumn, transportByCycle]);

  // Totales por grupo de labor: suma el monto de producción (bruto, sin % de
  // ganancia ni IVA, que viven en CombinedSummaryCard) de las columnas
  // (ciclo × labor) con el mismo laborGroupId. Las columnas sin grupo no
  // entran.
  const groupTotals = useMemo(() => {
    const m = new Map();
    for (const d of dataByColumn) {
      const gid = d.col.labor.laborGroupId;
      if (!gid) continue;
      if (!m.has(gid)) {
        const g = laborGroupsById.get(gid);
        m.set(gid, { id: gid, name: g?.name || "(grupo eliminado)", amount: 0, cycleIds: new Set() });
      }
      const entry = m.get(gid);
      entry.amount += d.totalAmount || 0;
      entry.cycleIds.add(d.col.cycleId);
    }
    return [...m.values()].sort((a, b) => b.amount - a.amount);
  }, [dataByColumn, laborGroupsById]);

  return (
    <Modal open={open} onClose={onClose} title={title} size="2xl">
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
