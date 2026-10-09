import { useEffect, useMemo, useRef, useState } from "react";
import { captureFullWidthBlob } from "../utils/imageCapture";
import Modal from "./Modal";
import { listWorkdaysByCycle, laborGroupsService } from "../services";
import { tripsService } from "../services/transportsService";
import { useCatalogs } from "../contexts/CatalogsContext";
import { useToast } from "../contexts/ToastContext";
import {
  getDayCombos,
  getTratoTiers,
  getTratoTierTotals,
  tratoTypeLabel,
  tratoUnitLabel,
  cosechaUnit,
  qualityLabel,
  containerLabel,
} from "../utils/cosechaCombos";
import { countingStageIds, normalizeStages } from "../utils/tratoEtapas";
import { useIsMobile } from "../hooks/useIsMobile";

const fmtCLP = (v) =>
  new Intl.NumberFormat("es-CL", { style: "currency", currency: "CLP", minimumFractionDigits: 0 })
    .format(Number(v) || 0);
const fmtNum = (v) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 1 }).format(Number(v) || 0);
// "2026-07-24" → "24/07", para mostrar rangos de fecha compactos en tablas.
const shortDate = (iso) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || "");
  return m ? `${m[3]}/${m[2]}` : (iso || "");
};

// Las opciones del modal (filtros, % de ganancia, "pagan $", IVA, etc.) se
// guardan en localStorage. Las de cada labor (pctOverrides/paidToUs/
// workersPaid) van por colKey = cycleId__laborId, que es estable en el tiempo.
const LS_PREFIX = "productionSummary.";
const loadJSON = (key, fallback) => {
  try {
    const raw = localStorage.getItem(LS_PREFIX + key);
    return raw != null ? JSON.parse(raw) : fallback;
  } catch { return fallback; }
};
const saveJSON = (key, value) => {
  try { localStorage.setItem(LS_PREFIX + key, JSON.stringify(value)); } catch { /* noop */ }
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

// Paleta y estilos de las tablas de cobrar (CycleSummaryModal), inline porque
// las tablas tienen fondo blanco fijo: el modal se dibuja listo para imprimir
// y la imagen o la impresión salen igual que en pantalla.
const cellH = { border: "1px solid #555", padding: "6px 8px", fontSize: 12, fontWeight: 700, textAlign: "left" };
const cell = { border: "1px solid #999", padding: "5px 8px", fontSize: 12 };
const HDR_BLUE = "#9dc3e6";    // azul de encabezado — tablas por labor
const HDR_GREEN = "#a9d08e";   // verde de encabezado — tabla general
const ROW_TOTAL_LIGHT = "#c6efce"; // verde claro — fila total por labor
const ROW_TOTAL_DARK = "#6aa84f";  // verde oscuro — fila total general
const ROW_HIGHLIGHT = "#fffbeb";   // amarillo pálido — fila con el nombre de la labor en la tabla general
// Rampa de verdes para el bloque TOTAL/GANANCIAS/TOTAL GENERAL/IVA/BRUTO de
// la tabla general — mismo tono base que el resto, pero cada fila con un
// matiz distinto para que no se vea como un solo bloque sólido pegado.
const ROW_GANANCIAS = "#93c47d";      // verde más claro que TOTAL — fila GANANCIAS
const ROW_TOTAL_GENERAL = "#38761d";  // verde bosque — fila TOTAL GENERAL
const ROW_IVA = "#d9ead3";            // verde muy pálido — fila IVA (informativa, texto oscuro)
const ROW_BRUTO = "#274e13";          // verde más oscuro — fila BRUTO (el total final)

// Reusa la misma paleta hex de arriba como fill de ExcelJS, así el XLSX
// exportado queda visualmente alineado con la tabla en pantalla/impresión.
const toArgbFill = (hex) => ({ type: "pattern", pattern: "solid", fgColor: { argb: "FF" + hex.replace("#", "").toUpperCase() } });
const XLSX_BORDER = { top: { style: "thin" }, left: { style: "thin" }, bottom: { style: "thin" }, right: { style: "thin" } };
const XLSX_MONEY_FMT = '"$"#,##0';

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

// Totales por grupo de labor entre ciclos: una fila por laborGroupId con el
// monto bruto de producción de sus columnas (ciclo × labor). Aparece solo si
// al menos una labor tiene grupo.
function LaborGroupTotalsCard({ groupTotals }) {
  const isMobile = useIsMobile();
  return (
    <div className="overflow-hidden rounded-md border border-[var(--color-border)]">
      <div className="bg-[var(--color-surface-2)] px-3 py-1.5 text-xs font-semibold text-[var(--color-muted)]">
        Totales por grupo de labor (todos los ciclos)
      </div>
      {isMobile ? (
        <div className="divide-y divide-[var(--color-border)]">
          {groupTotals.map((g) => (
            <div key={g.id} className="flex items-center justify-between gap-2 px-3 py-1.5 text-sm">
              <div className="min-w-0">
                <div className="truncate font-medium">{g.name}</div>
                <div className="text-[10px] text-[var(--color-muted)]">{g.cycleIds.size} ciclo{g.cycleIds.size === 1 ? "" : "s"}</div>
              </div>
              <span className="shrink-0 font-semibold tabular-nums">{fmtCLP(g.amount)}</span>
            </div>
          ))}
        </div>
      ) : (
      <table className="w-full text-sm">
        <thead className="bg-[var(--color-surface-2)] text-left text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
          <tr>
            <th className="px-3 py-1.5">Grupo</th>
            <th className="px-3 py-1.5 text-right">Ciclos</th>
            <th className="px-3 py-1.5 text-right">Monto</th>
          </tr>
        </thead>
        <tbody>
          {groupTotals.map((g) => (
            <tr key={g.id} className="border-t border-[var(--color-border)]">
              <td className="px-3 py-1.5 font-medium">{g.name}</td>
              <td className="px-3 py-1.5 text-right tabular-nums text-[var(--color-muted)]">{g.cycleIds.size}</td>
              <td className="px-3 py-1.5 text-right font-semibold tabular-nums">{fmtCLP(g.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      )}
    </div>
  );
}

// Tabla general: las labores seleccionadas como columnas y los días como
// filas; cada celda muestra cantidad (con unidad) y monto. Al final, la
// columna "Total día" y las filas de cierre (TOTAL A PAGAR, GANANCIAS,
// TRANSPORTE, MONTO LIBRE, TOTAL GENERAL, IVA y BRUTO).
function CombinedSummaryCard({ dataByColumn, days, transportByCycle, firstColKeyForCycle, grandTotalTransport, includeTransport }) {
  const toast = useToast();
  const isMobile = useIsMobile();
  const [collapsed, setCollapsed] = useState(false);
  const [busy, setBusy] = useState("");
  const captureRef = useRef(null);
  // Ganancia por labor. Cosecha, trato y por etapas: monto × %, editable por
  // columna; `generalPct` es el control maestro y al cambiarlo vacía
  // pctOverrides para que todas las columnas lo sigan. Pago al día: sin %; se
  // ingresa lo que paga el cliente (paidToUs) y la ganancia es esa cifra menos
  // el monto, o la cifra entera si ya se pagó a los trabajadores (workersPaid).
  // Todo se guarda en localStorage por colKey (cycleId__laborId).
  const [generalPct, setGeneralPct] = useState(() => loadJSON("generalPct", 40));
  useEffect(() => { saveJSON("generalPct", generalPct); }, [generalPct]);
  const [pctOverrides, setPctOverrides] = useState(() => loadJSON("pctOverrides", {})); // colKey -> % (solo no-jornada)
  useEffect(() => { saveJSON("pctOverrides", pctOverrides); }, [pctOverrides]);
  const [paidToUs, setPaidToUs] = useState(() => loadJSON("paidToUs", {})); // colKey -> $ pagado a nosotros (solo jornada)
  useEffect(() => { saveJSON("paidToUs", paidToUs); }, [paidToUs]);
  const [workersPaid, setWorkersPaid] = useState(() => loadJSON("workersPaid", {})); // colKey -> bool (solo jornada)
  useEffect(() => { saveJSON("workersPaid", workersPaid); }, [workersPaid]);
  // Con IVA se agregan las filas IVA (19% del TOTAL GENERAL) y BRUTO, con
  // valor solo en la columna de total; las columnas por labor quedan en blanco.
  const [ivaEnabled, setIvaEnabled] = useState(() => loadJSON("ivaEnabled", false));
  useEffect(() => { saveJSON("ivaEnabled", ivaEnabled); }, [ivaEnabled]);

  const isJornadaCol = (col) => col.labor.type === "main";
  // Supervisión no se cobra aparte: su monto se descuenta entero de la
  // ganancia (ganancia negativa) y su total general es $0. Es un costo interno
  // que cubre el margen de las demás labores.
  const isSupervisionCol = (col) => col.labor.type === "supervision";
  const effectivePct = (colKey) => pctOverrides[colKey] ?? generalPct;
  const gananciaFor = (col, totalAmount) => {
    if (isJornadaCol(col)) {
      const paid = Number(paidToUs[col.key]) || 0;
      if (workersPaid[col.key]) return paid;
      return paid - totalAmount;
    }
    if (isSupervisionCol(col)) return -totalAmount;
    return (totalAmount * effectivePct(col.key)) / 100;
  };
  // Total general por columna: monto + ganancia. Pago al día ya pagado a los
  // trabajadores: solo lo que paga el cliente. Supervisión: siempre $0, para
  // que lo facturado no dependa del gasto en supervisión; ese costo aparece
  // solo como descuento informativo en la fila MONTO LIBRE.
  const totalGeneralFor = (col, totalAmount) => {
    if (isSupervisionCol(col)) return 0;
    if (isJornadaCol(col) && workersPaid[col.key]) {
      return Number(paidToUs[col.key]) || 0;
    }
    return totalAmount + gananciaFor(col, totalAmount);
  };
  const handleGeneralPctChange = (v) => {
    setGeneralPct(v);
    setPctOverrides({});
  };

  // Solo días que tengan al menos un dato en alguna labor visible.
  const activeDays = useMemo(() => {
    const set = new Set();
    for (const d of dataByColumn) for (const r of d.rows) set.add(r.day);
    return [...set].sort();
  }, [dataByColumn]);

  // Por labor: día → celda.
  const byLaborDay = useMemo(() => {
    const m = new Map();
    for (const d of dataByColumn) {
      const inner = new Map();
      for (const r of d.rows) inner.set(r.day, r.cell);
      m.set(d.col.key, inner);
    }
    return m;
  }, [dataByColumn]);

  const totalsByDay = useMemo(() => {
    const out = new Map();
    for (const day of activeDays) {
      let sum = 0;
      for (const d of dataByColumn) {
        const c = byLaborDay.get(d.col.key)?.get(day);
        if (c) sum += c.amount || 0;
      }
      out.set(day, sum);
    }
    return out;
  }, [activeDays, dataByColumn, byLaborDay]);

  const grandTotal = useMemo(
    () => dataByColumn.reduce((s, d) => s + (d.totalAmount || 0), 0),
    [dataByColumn],
  );

  const totalGanancia = useMemo(
    () => dataByColumn.reduce((s, d) => s + gananciaFor(d.col, d.totalAmount), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataByColumn, generalPct, pctOverrides, paidToUs, workersPaid],
  );
  // GANANCIAS muestra el margen de las labores facturables, sin el descuento
  // de supervisión. La fila MONTO LIBRE muestra ese descuento por columna y,
  // en el total, ganancia − supervisión con los dos montos de la resta.
  const totalGananciaBillable = useMemo(
    () => dataByColumn.reduce((s, d) => s + (isSupervisionCol(d.col) ? 0 : gananciaFor(d.col, d.totalAmount)), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataByColumn, generalPct, pctOverrides, paidToUs, workersPaid],
  );
  const totalSupervisionDeduction = useMemo(
    () => dataByColumn.reduce((s, d) => s + (isSupervisionCol(d.col) ? gananciaFor(d.col, d.totalAmount) : 0), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataByColumn, generalPct, pctOverrides, paidToUs, workersPaid],
  );
  const hasSupervisionCols = dataByColumn.some((d) => isSupervisionCol(d.col));
  const grandTotalGeneral = useMemo(
    () => dataByColumn.reduce((s, d) => s + totalGeneralFor(d.col, d.totalAmount), 0),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dataByColumn, generalPct, pctOverrides, paidToUs, workersPaid],
  );
  const grandTotalIva = grandTotalGeneral * 0.19;
  const grandTotalBruto = grandTotalGeneral + grandTotalIva;

  const buildPlainText = () => {
    const lines = [];
    lines.push("📊 TABLA GENERAL — todas las labores seleccionadas");
    lines.push(`Gran total: ${fmtCLP(grandTotal)} · ${dataByColumn.length} labor${dataByColumn.length === 1 ? "" : "es"} · ${activeDays.length} día${activeDays.length === 1 ? "" : "s"}`);
    lines.push("");
    const header = ["Día"];
    for (const d of dataByColumn) header.push(`${d.col.labor.name}`);
    header.push("Total día");
    lines.push(header.join(" | "));
    for (const day of activeDays) {
      const cols = [day];
      for (const d of dataByColumn) {
        const c = byLaborDay.get(d.col.key)?.get(day);
        if (!c) { cols.push("—"); continue; }
        cols.push(`${fmtNum(c.qty)}${c.unit ? " " + c.unit : ""} · ${fmtCLP(c.amount)}`);
      }
      cols.push(fmtCLP(totalsByDay.get(day) || 0));
      lines.push(cols.join(" | "));
    }
    const totalRow = ["TOTAL A PAGAR"];
    for (const d of dataByColumn) {
      const paidTag = isJornadaCol(d.col) && workersPaid[d.col.key] ? " [ya pagado]" : "";
      totalRow.push(`${fmtNum(d.totalQty)}${d.unit ? " " + d.unit : ""} · ${fmtCLP(d.totalAmount)}${paidTag}`);
    }
    totalRow.push(fmtCLP(grandTotal));
    lines.push(totalRow.join(" | "));
    lines.push("");
    lines.push("💰 GANANCIAS");
    for (const d of dataByColumn) {
      if (isSupervisionCol(d.col)) continue;
      const g = gananciaFor(d.col, d.totalAmount);
      const detail = isJornadaCol(d.col)
        ? (workersPaid[d.col.key] ? `pagan ${fmtCLP(Number(paidToUs[d.col.key]) || 0)}, ya pagado` : `pagan ${fmtCLP(Number(paidToUs[d.col.key]) || 0)}`)
        : `${effectivePct(d.col.key)}%`;
      lines.push(`${d.col.labor.name} (${d.col.cycleLabel}) [${detail}]: ${fmtCLP(g)}`);
    }
    lines.push(`TOTAL GANANCIAS: ${fmtCLP(totalGananciaBillable)}`);
    lines.push("");
    if (includeTransport) {
      lines.push("🚐 TRANSPORTE (por ciclo)");
      const seenCycles = new Set();
      for (const d of dataByColumn) {
        if (seenCycles.has(d.col.cycleId)) continue;
        seenCycles.add(d.col.cycleId);
        const t = transportByCycle.get(d.col.cycleId) || { total: 0, hasTrips: false };
        const tag = t.total === 0 ? (t.hasTrips ? " [vueltas creadas]" : " [sin vueltas]") : "";
        lines.push(`${d.col.cycleLabel}: ${fmtCLP(t.total)}${tag}`);
      }
      lines.push(`TOTAL TRANSPORTE: ${fmtCLP(grandTotalTransport)}`);
      lines.push("");
    }
    if (hasSupervisionCols) {
      lines.push("➖ MONTO LIBRE (descuento por supervisión, informativo, no afecta lo facturado)");
      for (const d of dataByColumn) {
        if (!isSupervisionCol(d.col)) continue;
        lines.push(`${d.col.labor.name} (${d.col.cycleLabel}): ${fmtCLP(gananciaFor(d.col, d.totalAmount))}`);
      }
      lines.push(`TOTAL SUPERVISIÓN: ${fmtCLP(totalSupervisionDeduction)}`);
      lines.push(`MONTO LIBRE (${fmtCLP(totalGananciaBillable)} − ${fmtCLP(Math.abs(totalSupervisionDeduction))}): ${fmtCLP(totalGanancia)}`);
      lines.push("");
    }
    if (includeTransport && grandTotalTransport !== 0) {
      lines.push(`MONTO LIBRE NETO (${fmtCLP(totalGanancia)} − ${fmtCLP(grandTotalTransport)}, descuenta también transporte): ${fmtCLP(totalGanancia - grandTotalTransport)}`);
      lines.push("");
    }
    const generalRow = ["TOTAL GENERAL"];
    for (const d of dataByColumn) generalRow.push(fmtCLP(totalGeneralFor(d.col, d.totalAmount)));
    generalRow.push(fmtCLP(grandTotalGeneral));
    lines.push(generalRow.join(" | "));
    if (ivaEnabled) {
      lines.push("");
      lines.push(`IVA (19%): ${fmtCLP(grandTotalIva)}`);
      lines.push(`BRUTO: ${fmtCLP(grandTotalBruto)}`);
    }
    return lines.join("\n");
  };

  const handleCopyText = async () => {
    setBusy("text");
    try {
      await navigator.clipboard.writeText(buildPlainText());
      toast.success("Texto copiado");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally { setBusy(""); }
  };

  const handleCopyImage = async () => {
    if (!captureRef.current) return;
    setBusy("image");
    try {
      const blob = await captureFullWidthBlob(captureRef.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally { setBusy(""); }
  };

  // XLSX de la tabla general: cada labor ocupa 2 columnas (Cant./Monto) bajo
  // un encabezado combinado con su nombre, como la tabla en pantalla.
  // `writeTotalRow` escribe las filas de cierre (TOTAL A PAGAR, GANANCIAS,
  // TRANSPORTE, etc.), que difieren en qué columnas llenan y con qué color.
  const handleXlsx = async () => {
    setBusy("xlsx");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet("Tabla general");
      ws.getColumn(1).width = 6; // restricción de layout: col A vacía

      const COL_DAY = 2;
      const COL_FIRST_LABOR = 3;
      const COL_TOTAL = COL_FIRST_LABOR + dataByColumn.length * 2;

      let r = 2; // fila 1 vacía
      ws.getCell(r, 2).value = "Tabla general — resumen consolidado";
      ws.getCell(r, 2).font = { bold: true, size: 13 };
      r++;
      ws.getCell(r, 2).value = `${dataByColumn.length} labores · ${activeDays.length} días · gran total ${fmtCLP(grandTotal)}`;
      ws.getCell(r, 2).font = { size: 10, color: { argb: "FF666666" } };
      r += 2;

      const headerRow1 = r;
      const headerRow2 = r + 1;
      ws.mergeCells(headerRow1, COL_DAY, headerRow2, COL_DAY);
      ws.getCell(headerRow1, COL_DAY).value = "Día";
      ws.mergeCells(headerRow1, COL_TOTAL, headerRow2, COL_TOTAL);
      ws.getCell(headerRow1, COL_TOTAL).value = "Total día";
      dataByColumn.forEach((d, i) => {
        const c0 = COL_FIRST_LABOR + i * 2;
        ws.mergeCells(headerRow1, c0, headerRow1, c0 + 1);
        ws.getCell(headerRow1, c0).value = `${d.col.labor.name} (${d.col.cycleLabel})`;
        ws.getCell(headerRow2, c0).value = "Cant.";
        ws.getCell(headerRow2, c0 + 1).value = "Monto";
      });
      for (let c = COL_DAY; c <= COL_TOTAL; c++) {
        for (const rr of [headerRow1, headerRow2]) {
          const cell = ws.getCell(rr, c);
          cell.font = { bold: true };
          cell.fill = toArgbFill(HDR_GREEN);
          cell.border = XLSX_BORDER;
          cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        }
      }
      r += 2;

      for (const day of activeDays) {
        ws.getCell(r, COL_DAY).value = day;
        dataByColumn.forEach((d, i) => {
          const c0 = COL_FIRST_LABOR + i * 2;
          const cellData = byLaborDay.get(d.col.key)?.get(day);
          if (!cellData) return;
          ws.getCell(r, c0).value = `${fmtNum(cellData.qty)}${cellData.unit ? " " + cellData.unit : ""}`;
          ws.getCell(r, c0 + 1).value = cellData.amount;
          ws.getCell(r, c0 + 1).numFmt = XLSX_MONEY_FMT;
        });
        ws.getCell(r, COL_TOTAL).value = totalsByDay.get(day) || 0;
        ws.getCell(r, COL_TOTAL).numFmt = XLSX_MONEY_FMT;
        for (let c = COL_DAY; c <= COL_TOTAL; c++) ws.getCell(r, c).border = XLSX_BORDER;
        r++;
      }

      const writeTotalRow = (label, fill, fontArgb, montoForCol, totalValue, { qtyToo = false } = {}) => {
        ws.getCell(r, COL_DAY).value = label;
        dataByColumn.forEach((d, i) => {
          const c0 = COL_FIRST_LABOR + i * 2;
          if (qtyToo) ws.getCell(r, c0).value = `${fmtNum(d.totalQty)}${d.unit ? " " + d.unit : ""}`;
          const v = montoForCol(d);
          if (v != null) {
            ws.getCell(r, c0 + 1).value = v;
            ws.getCell(r, c0 + 1).numFmt = XLSX_MONEY_FMT;
          }
        });
        ws.getCell(r, COL_TOTAL).value = totalValue;
        ws.getCell(r, COL_TOTAL).numFmt = XLSX_MONEY_FMT;
        for (let c = COL_DAY; c <= COL_TOTAL; c++) {
          const cell = ws.getCell(r, c);
          cell.font = { bold: true, color: { argb: fontArgb } };
          cell.fill = toArgbFill(fill);
          cell.border = XLSX_BORDER;
        }
        r++;
      };

      writeTotalRow("TOTAL A PAGAR", ROW_TOTAL_DARK, "FFFFFFFF", (d) => d.totalAmount, grandTotal, { qtyToo: true });
      writeTotalRow(
        "GANANCIAS", ROW_GANANCIAS, "FF1A2E0F",
        (d) => (isSupervisionCol(d.col) ? null : gananciaFor(d.col, d.totalAmount)),
        totalGananciaBillable,
      );
      if (includeTransport) {
        writeTotalRow(
          "TRANSPORTE", ROW_TOTAL_DARK, "FFFFFFFF",
          (d) => (firstColKeyForCycle.get(d.col.cycleId) === d.col.key ? (transportByCycle.get(d.col.cycleId)?.total || 0) : null),
          grandTotalTransport,
        );
      }
      if (hasSupervisionCols) {
        writeTotalRow(
          "MONTO LIBRE", ROW_IVA, "FF274E13",
          (d) => (isSupervisionCol(d.col) ? gananciaFor(d.col, d.totalAmount) : null),
          totalGanancia,
        );
      }
      if (includeTransport && grandTotalTransport !== 0) {
        writeTotalRow("MONTO LIBRE NETO", ROW_IVA, "FF274E13", () => null, totalGanancia - grandTotalTransport);
      }
      writeTotalRow(
        "TOTAL GENERAL", ROW_TOTAL_GENERAL, "FFFFFFFF",
        (d) => totalGeneralFor(d.col, d.totalAmount),
        grandTotalGeneral,
      );
      if (ivaEnabled) {
        writeTotalRow("IVA (19%)", ROW_IVA, "FF274E13", () => null, grandTotalIva);
        writeTotalRow("BRUTO", ROW_BRUTO, "FFFFFFFF", () => null, grandTotalBruto);
      }

      ws.getColumn(COL_DAY).width = 12;
      for (let i = 0; i < dataByColumn.length; i++) {
        ws.getColumn(COL_FIRST_LABOR + i * 2).width = 14;
        ws.getColumn(COL_FIRST_LABOR + i * 2 + 1).width = 14;
      }
      ws.getColumn(COL_TOTAL).width = 16;

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "tabla_general_produccion.xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Error al generar Excel: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handlePrint = () => {
    if (!captureRef.current) return;
    const html = captureRef.current.outerHTML;
    const win = window.open("", "_blank", "width=1100,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Tabla general</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #888; padding: 6px 8px; font-size: 11px; }
        @media print { @page { size: landscape; margin: 10mm; } }
      </style>
    </head><body>${html}<script>window.onload = () => { window.focus(); window.print(); };</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="rounded-md border-2 border-[var(--color-border)]">
      <div className="flex flex-wrap items-center gap-2 bg-[var(--color-surface-2)] px-3 py-2 text-sm">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left hover:text-[var(--color-accent)]"
        >
          <span className="text-[var(--color-muted)]">{collapsed ? "▸" : "▾"}</span>
          <div className="min-w-0">
            <div className="font-semibold">📊 Tabla general</div>
            <div className="text-[10px] text-[var(--color-muted)]">
              {dataByColumn.length} labor{dataByColumn.length === 1 ? "" : "es"} · {activeDays.length} día{activeDays.length === 1 ? "" : "s"}
            </div>
          </div>
        </button>
        <div className="text-right">
          <div className="text-[10px] text-[var(--color-muted)]">Gran total</div>
          <div className="font-semibold tabular-nums text-[var(--color-accent)]">{fmtCLP(grandTotal)}</div>
        </div>
        <div className="flex gap-1">
          <button onClick={handleCopyText} disabled={busy === "text"} title="Copiar como texto plano"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            {busy === "text" ? "..." : "📋 Texto"}
          </button>
          <button onClick={handleCopyImage} disabled={busy === "image"} title="Copiar como imagen"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            {busy === "image" ? "..." : "📋 Imagen"}
          </button>
          <button onClick={handleXlsx} disabled={busy === "xlsx"} title="Descargar como Excel"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50">
            {busy === "xlsx" ? "..." : "📊 Excel"}
          </button>
          <button onClick={handlePrint} title="Imprimir"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)]">
            🖨
          </button>
        </div>
      </div>
      {!collapsed && (
        <>
        <div ref={captureRef} style={{ background: "#fff", color: "#000", padding: 12 }}>
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>📊 Tabla general — resumen consolidado</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              {dataByColumn.length} labores · {activeDays.length} días · gran total {fmtCLP(grandTotal)}
            </div>
          </div>
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: HDR_GREEN }}>
                  <th style={cellH}>Día</th>
                  {dataByColumn.map((d) => (
                    <th key={d.col.key} style={{ ...cellH, textAlign: "right", minWidth: 110 }}>
                      <div>{d.col.labor.name}</div>
                      <div style={{ fontSize: 9, fontWeight: 500, color: "#333", marginTop: 1 }}>
                        {d.col.cycleLabel}
                      </div>
                    </th>
                  ))}
                  <th style={{ ...cellH, textAlign: "right", background: ROW_HIGHLIGHT }}>Total día</th>
                </tr>
              </thead>
              <tbody>
                {activeDays.map((day) => {
                  const dayTotal = totalsByDay.get(day) || 0;
                  return (
                    <tr key={day}>
                      <td style={{ ...cell, fontFamily: "ui-monospace, monospace", fontWeight: 600 }}>{day}</td>
                      {dataByColumn.map((d) => {
                        const c = byLaborDay.get(d.col.key)?.get(day);
                        if (!c) return <td key={d.col.key} style={{ ...cell, textAlign: "right", color: "#bbb" }}>—</td>;
                        return (
                          <td key={d.col.key} style={{ ...cell, textAlign: "right" }}>
                            <div style={{ fontSize: 11, color: "#444" }}>
                              {fmtNum(c.qty)}{c.unit ? ` ${c.unit}` : ""}
                            </div>
                            <div style={{ fontWeight: 600 }}>{fmtCLP(c.amount)}</div>
                          </td>
                        );
                      })}
                      <td style={{ ...cell, textAlign: "right", fontWeight: 700, background: ROW_HIGHLIGHT }}>
                        {fmtCLP(dayTotal)}
                      </td>
                    </tr>
                  );
                })}
                <tr style={{ background: ROW_TOTAL_DARK, color: "#fff", fontWeight: 700 }}>
                  <td style={{ ...cell, borderColor: "#3d6b2e" }}>TOTAL A PAGAR</td>
                  {dataByColumn.map((d) => (
                    <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e" }}>
                      <div style={{ fontSize: 10, opacity: 0.9 }}>
                        {fmtNum(d.totalQty)}{d.unit ? ` ${d.unit}` : ""}
                      </div>
                      <div>{fmtCLP(d.totalAmount)}</div>
                      {isJornadaCol(d.col) && workersPaid[d.col.key] && (
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>✅ ya pagado</div>
                      )}
                      {isSupervisionCol(d.col) && (
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>➖NF</div>
                      )}
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e", fontSize: 13 }}>
                    {fmtCLP(grandTotal)}
                  </td>
                </tr>
                <tr style={{ background: ROW_GANANCIAS, color: "#1a2e0f", fontWeight: 700 }}>
                  <td style={{ ...cell, borderColor: "#6aa84f" }}>GANANCIAS</td>
                  {dataByColumn.map((d) => (
                    <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#6aa84f" }}>
                      {isSupervisionCol(d.col) ? "—" : fmtCLP(gananciaFor(d.col, d.totalAmount))}
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: "right", borderColor: "#6aa84f", fontSize: 13 }}>
                    {fmtCLP(totalGananciaBillable)}
                  </td>
                </tr>
                {includeTransport && (
                  <tr style={{ background: ROW_TOTAL_DARK, color: "#fff", fontWeight: 700 }}>
                    <td style={{ ...cell, borderColor: "#3d6b2e" }}>TRANSPORTE</td>
                    {dataByColumn.map((d) => {
                      const isFirst = firstColKeyForCycle.get(d.col.cycleId) === d.col.key;
                      if (!isFirst) {
                        return (
                          <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e" }}>—</td>
                        );
                      }
                      const t = transportByCycle.get(d.col.cycleId) || { total: 0, hasTrips: false };
                      return (
                        <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e" }}>
                          {fmtCLP(t.total)}
                          {t.total === 0 && (
                            <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>
                              {t.hasTrips ? "vueltas creadas" : "sin vueltas"}
                            </div>
                          )}
                        </td>
                      );
                    })}
                    <td style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e", fontSize: 13 }}>
                      {fmtCLP(grandTotalTransport)}
                    </td>
                  </tr>
                )}
                {hasSupervisionCols && (
                  <tr style={{ background: ROW_IVA, color: "#274e13", fontWeight: 700 }}>
                    <td style={{ ...cell, borderColor: "#93c47d" }}>MONTO LIBRE</td>
                    {dataByColumn.map((d) => (
                      <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#93c47d" }}>
                        {isSupervisionCol(d.col) ? fmtCLP(gananciaFor(d.col, d.totalAmount)) : "—"}
                      </td>
                    ))}
                    <td style={{ ...cell, textAlign: "right", borderColor: "#93c47d", fontSize: 13 }}>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>
                        {fmtCLP(totalGananciaBillable)} − {fmtCLP(Math.abs(totalSupervisionDeduction))}
                      </div>
                      <div>{fmtCLP(totalGanancia)}</div>
                    </td>
                  </tr>
                )}
                {includeTransport && grandTotalTransport !== 0 && (
                  <tr style={{ background: ROW_IVA, color: "#274e13", fontWeight: 700 }}>
                    <td style={{ ...cell, borderColor: "#93c47d" }}>MONTO LIBRE NETO</td>
                    {dataByColumn.map((d) => (
                      <td key={d.col.key} style={{ ...cell, borderColor: "#93c47d" }}></td>
                    ))}
                    <td style={{ ...cell, textAlign: "right", borderColor: "#93c47d", fontSize: 13 }}>
                      <div style={{ fontSize: 9, fontWeight: 400 }}>
                        {fmtCLP(totalGanancia)} − {fmtCLP(grandTotalTransport)}
                      </div>
                      <div>{fmtCLP(totalGanancia - grandTotalTransport)}</div>
                    </td>
                  </tr>
                )}
                <tr style={{ background: ROW_TOTAL_GENERAL, color: "#fff", fontWeight: 700 }}>
                  <td style={{ ...cell, borderColor: "#274e13" }}>TOTAL GENERAL</td>
                  {dataByColumn.map((d) => (
                    <td key={d.col.key} style={{ ...cell, textAlign: "right", borderColor: "#274e13" }}>
                      {fmtCLP(totalGeneralFor(d.col, d.totalAmount))}
                      {isSupervisionCol(d.col) && (
                        <div style={{ fontSize: 9, fontWeight: 400, marginTop: 1, color: "#d4f5d4" }}>➖NF</div>
                      )}
                    </td>
                  ))}
                  <td style={{ ...cell, textAlign: "right", borderColor: "#274e13", fontSize: 13 }}>
                    {fmtCLP(grandTotalGeneral)}
                  </td>
                </tr>
                {ivaEnabled && (
                  <>
                    <tr style={{ background: ROW_IVA, color: "#274e13", fontWeight: 700 }}>
                      <td style={{ ...cell, borderColor: "#93c47d" }}>IVA (19%)</td>
                      {dataByColumn.map((d) => (
                        <td key={d.col.key} style={{ ...cell, borderColor: "#93c47d" }}></td>
                      ))}
                      <td style={{ ...cell, textAlign: "right", borderColor: "#93c47d", fontSize: 13 }}>
                        {fmtCLP(grandTotalIva)}
                      </td>
                    </tr>
                    <tr style={{ background: ROW_BRUTO, color: "#fff", fontWeight: 700 }}>
                      <td style={{ ...cell, borderColor: "#16260a" }}>BRUTO</td>
                      {dataByColumn.map((d) => (
                        <td key={d.col.key} style={{ ...cell, borderColor: "#16260a" }}></td>
                      ))}
                      <td style={{ ...cell, textAlign: "right", borderColor: "#16260a", fontSize: 13 }}>
                        {fmtCLP(grandTotalBruto)}
                      </td>
                    </tr>
                  </>
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Tabla para ajustar la ganancia (los % o lo que paga el cliente en
            labores de jornada), que alimenta GANANCIAS y TOTAL GENERAL. Va
            fuera de captureRef: no sale al copiar ni al imprimir. */}
        <div style={{ marginTop: 12, borderTop: "2px solid #ccc", paddingTop: 10, padding: "10px 12px 12px" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8, fontSize: 13, fontWeight: 700 }}>
              <span>💰 Ajustar ganancia</span>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 400, color: "#444", marginLeft: 8 }}>
                % general:
                <input
                  type="number"
                  min="0"
                  value={generalPct}
                  onChange={(e) => handleGeneralPctChange(Math.max(0, Number(e.target.value) || 0))}
                  title="Al cambiarlo se aplica a todas las labores que no sean de jornada, pisando cualquier % propio editado abajo"
                  style={{ width: 56, padding: "2px 5px", border: "1px solid #999", borderRadius: 4, textAlign: "right" }}
                />
                %
              </label>
              <label style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, fontWeight: 400, color: "#444", marginLeft: 8, cursor: "pointer" }}>
                <input
                  type="checkbox"
                  checked={ivaEnabled}
                  onChange={(e) => setIvaEnabled(e.target.checked)}
                />
                Resumen con IVA (19%)
              </label>
            </div>
            {isMobile ? (
              <div className="space-y-2">
                {dataByColumn.map((d) => (
                  <div key={d.col.key} style={{ border: "1px solid #999", borderRadius: 6, padding: 8, fontSize: 12 }}>
                    <div style={{ fontWeight: 700 }}>
                      {d.col.labor.name}
                      <span style={{ marginLeft: 4, fontSize: 9, fontWeight: 400, color: "#888" }}>· {d.col.cycleLabel}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
                      <span style={{ color: "#666" }}>Monto</span>
                      <span>{fmtCLP(d.totalAmount)}</span>
                    </div>
                    {isJornadaCol(d.col) && workersPaid[d.col.key] && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#2e7d32", marginTop: 2 }}>
                        ✅ ya pagado <span style={{ fontWeight: 400, color: "#666" }}>(solo informativo)</span>
                      </div>
                    )}
                    {isSupervisionCol(d.col) && (
                      <div style={{ fontSize: 9, fontWeight: 700, color: "#b91c1c", marginTop: 2 }}>
                        ➖ descuento <span style={{ fontWeight: 400, color: "#666" }}>(cubierto por el % general)</span>
                      </div>
                    )}
                    <div style={{ marginTop: 6 }}>
                      {isSupervisionCol(d.col) ? (
                        <span style={{ fontSize: 10, color: "#666", fontStyle: "italic" }}>
                          % / pagan: −100% (automático)
                        </span>
                      ) : isJornadaCol(d.col) ? (
                        <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                          <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <span style={{ color: "#666" }}>Nos pagan</span>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                              $
                              <input
                                type="number"
                                min="0"
                                value={paidToUs[d.col.key] ?? ""}
                                onChange={(e) => setPaidToUs((p) => ({ ...p, [d.col.key]: e.target.value }))}
                                placeholder="0"
                                title="Lo que nos van a pagar por esta labor"
                                style={{ width: 90, padding: "3px 5px", border: "1px solid #999", borderRadius: 4, textAlign: "right" }}
                              />
                            </span>
                          </label>
                          <label style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, color: "#444" }}>
                            <input
                              type="checkbox"
                              checked={!!workersPaid[d.col.key]}
                              onChange={(e) => setWorkersPaid((p) => ({ ...p, [d.col.key]: e.target.checked }))}
                            />
                            ya pagamos a los trabajadores
                          </label>
                        </div>
                      ) : (
                        <label style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                          <span style={{ color: "#666" }}>% ganancia</span>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <input
                              type="number"
                              min="0"
                              value={effectivePct(d.col.key)}
                              onChange={(e) => setPctOverrides((p) => ({ ...p, [d.col.key]: Math.max(0, Number(e.target.value) || 0) }))}
                              title="% propio de esta labor — edítalo para separarlo del % general"
                              style={{ width: 60, padding: "3px 5px", border: "1px solid #999", borderRadius: 4, textAlign: "right" }}
                            />
                            %
                          </span>
                        </label>
                      )}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, fontWeight: 700, borderTop: "1px solid #ddd", paddingTop: 4 }}>
                      <span>Ganancia</span>
                      <span>{fmtCLP(gananciaFor(d.col, d.totalAmount))}</span>
                    </div>
                  </div>
                ))}
                <div style={{ background: ROW_TOTAL_DARK, color: "#fff", fontWeight: 700, borderRadius: 6, padding: 8, display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                  <span>TOTAL — {fmtCLP(grandTotal)}</span>
                  <span>{fmtCLP(totalGanancia)}</span>
                </div>
              </div>
            ) : (
            <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr style={{ background: HDR_GREEN }}>
                    <th style={cellH}>Labor</th>
                    <th style={{ ...cellH, textAlign: "right" }}>Monto</th>
                    <th style={{ ...cellH, textAlign: "right" }}>% / pagan</th>
                    <th style={{ ...cellH, textAlign: "right" }}>Ganancia</th>
                  </tr>
                </thead>
                <tbody>
                  {dataByColumn.map((d) => (
                    <tr key={d.col.key}>
                      <td style={cell}>
                        {d.col.labor.name}
                        <span style={{ marginLeft: 4, fontSize: 9, color: "#888" }}>· {d.col.cycleLabel}</span>
                      </td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        {fmtCLP(d.totalAmount)}
                        {isJornadaCol(d.col) && workersPaid[d.col.key] && (
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#2e7d32", marginTop: 1 }}>
                            ✅ ya pagado <span style={{ fontWeight: 400, color: "#666" }}>(solo informativo)</span>
                          </div>
                        )}
                        {isSupervisionCol(d.col) && (
                          <div style={{ fontSize: 9, fontWeight: 700, color: "#b91c1c", marginTop: 1 }}>
                            ➖ descuento <span style={{ fontWeight: 400, color: "#666" }}>(cubierto por el % general)</span>
                          </div>
                        )}
                      </td>
                      <td style={{ ...cell, textAlign: "right" }}>
                        {isSupervisionCol(d.col) ? (
                          <span style={{ fontSize: 10, color: "#666", fontStyle: "italic" }}>
                            −100% (automático)
                          </span>
                        ) : isJornadaCol(d.col) ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 3 }}>
                            <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                              $
                              <input
                                type="number"
                                min="0"
                                value={paidToUs[d.col.key] ?? ""}
                                onChange={(e) => setPaidToUs((p) => ({ ...p, [d.col.key]: e.target.value }))}
                                placeholder="0"
                                title="Lo que nos van a pagar por esta labor"
                                style={{ width: 80, padding: "2px 4px", border: "1px solid #999", borderRadius: 4, textAlign: "right" }}
                              />
                            </span>
                            <label style={{ display: "inline-flex", alignItems: "center", gap: 3, fontSize: 9, color: "#444", cursor: "pointer" }}>
                              <input
                                type="checkbox"
                                checked={!!workersPaid[d.col.key]}
                                onChange={(e) => setWorkersPaid((p) => ({ ...p, [d.col.key]: e.target.checked }))}
                              />
                              ya pagamos a los trabajadores
                            </label>
                          </div>
                        ) : (
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 3 }}>
                            <input
                              type="number"
                              min="0"
                              value={effectivePct(d.col.key)}
                              onChange={(e) => setPctOverrides((p) => ({ ...p, [d.col.key]: Math.max(0, Number(e.target.value) || 0) }))}
                              title="% propio de esta labor — edítalo para separarlo del % general"
                              style={{ width: 50, padding: "2px 4px", border: "1px solid #999", borderRadius: 4, textAlign: "right" }}
                            />
                            %
                          </span>
                        )}
                      </td>
                      <td style={{ ...cell, textAlign: "right", fontWeight: 600 }}>
                        {fmtCLP(gananciaFor(d.col, d.totalAmount))}
                      </td>
                    </tr>
                  ))}
                  <tr style={{ background: ROW_TOTAL_DARK, color: "#fff", fontWeight: 700 }}>
                    <td style={{ ...cell, borderColor: "#3d6b2e" }}>TOTAL</td>
                    <td style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e" }}>{fmtCLP(grandTotal)}</td>
                    <td style={{ ...cell, borderColor: "#3d6b2e" }}></td>
                    <td style={{ ...cell, textAlign: "right", borderColor: "#3d6b2e", fontSize: 13 }}>
                      {fmtCLP(totalGanancia)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

// Tarjeta por labor: encabezado con título, total, flecha de plegado y
// botones de copiar e imprimir; cuerpo con la tabla día por día. Arranca
// plegada si el ciclo está cerrado.
function LaborSummaryCard({ data, catalogs, allClosedCollapsed }) {
  const toast = useToast();
  const isMobile = useIsMobile();
  const { col, rows, totalQty, totalAmount, unit, persons } = data;
  const isClosed = col.cycleStatus === "closed";
  const [collapsed, setCollapsed] = useState(isClosed);
  const [busy, setBusy] = useState("");
  const captureRef = useRef(null);

  // El control maestro del modal pliega o despliega a la vez las tarjetas de
  // ciclos cerrados (las de ciclos abiertos no cambian). Cada una se puede
  // plegar a mano; el siguiente cambio del control las vuelve a igualar.
  useEffect(() => {
    if (isClosed) setCollapsed(allClosedCollapsed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allClosedCollapsed]);

  const typeLabel = col.labor.type === "cosecha"
    ? "🌾 Cosecha"
    : col.labor.type === "tratoEtapas"
      ? "🏕 Por etapas"
      : col.labor.type === "main"
        ? "💰 Jornadas"
        : col.labor.type === "supervision"
          ? "🧑‍💼 Supervisión"
          : `🛠 ${tratoTypeLabel(catalogs, col.labor.tratoType ?? 0)}`;

  // Texto plano del desglose para pegar en un chat o una nota. Alinea las
  // columnas con padEnd sobre los textos finales: se ve bien en fuente
  // monoespaciada y aceptable en proporcional.
  const buildPlainText = () => {
    const lines = [];
    lines.push(`📊 ${col.labor.name} — ${col.cycleLabel} (${typeLabel})`);
    lines.push(
      `Total: ${fmtNum(totalQty)}${unit ? " " + unit : ""} · ${fmtCLP(totalAmount)} · ${persons} pers`,
    );
    lines.push("");
    lines.push("Día        | Producción            | Precio              | Monto       | Rendimiento");
    for (const { day, cell } of rows) {
      const prod = `${fmtNum(cell.qty)}${cell.unit ? " " + cell.unit : ""}`;
      const price = cell.priceLabel || "—";
      const amt = fmtCLP(cell.amount);
      const rend = cell.persons > 0 ? `${cell.persons} pers · prom ${fmtNum(cell.avg)}` : "—";
      lines.push(
        `${day.padEnd(10, " ")} | ${prod.padEnd(21, " ")} | ${price.padEnd(19, " ")} | ${amt.padEnd(11, " ")} | ${rend}`,
      );
    }
    return lines.join("\n");
  };

  const handleCopyText = async () => {
    setBusy("text");
    try {
      await navigator.clipboard.writeText(buildPlainText());
      toast.success("Texto copiado");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handleCopyImage = async () => {
    if (!captureRef.current) return;
    setBusy("image");
    try {
      const blob = await captureFullWidthBlob(captureRef.current);
      if (!blob) throw new Error("No se pudo generar la imagen");
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      toast.success("Imagen copiada");
    } catch (err) {
      toast.error("Error al copiar: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handleXlsx = async () => {
    setBusy("xlsx");
    try {
      const ExcelJS = (await import("exceljs")).default;
      const wb = new ExcelJS.Workbook();
      const ws = wb.addWorksheet((col.labor.name || "Resumen").slice(0, 31));
      ws.getColumn(1).width = 6; // restricción de layout: col A vacía

      let r = 2; // fila 1 vacía
      ws.getCell(r, 2).value = col.labor.name;
      ws.getCell(r, 2).font = { bold: true, size: 13 };
      r++;
      ws.getCell(r, 2).value = `${col.cycleLabel} · ${typeLabel}${col.cycleStatus === "closed" ? " · cerrado" : ""}`;
      ws.getCell(r, 2).font = { size: 10, color: { argb: "FF666666" } };
      r += 2;

      const headerRow = r;
      ["Día", "Producción", "Precio", "Monto", "Rendimiento"].forEach((h, i) => {
        const c = ws.getCell(headerRow, 2 + i);
        c.value = h;
        c.font = { bold: true };
        c.fill = toArgbFill(HDR_BLUE);
        c.border = XLSX_BORDER;
      });
      r++;

      for (const { day, cell: cd } of rows) {
        ws.getCell(r, 2).value = day;
        ws.getCell(r, 3).value = `${fmtNum(cd.qty)}${cd.unit ? " " + cd.unit : ""}`;
        ws.getCell(r, 4).value = cd.priceLabel || "—";
        ws.getCell(r, 5).value = cd.amount;
        ws.getCell(r, 5).numFmt = XLSX_MONEY_FMT;
        ws.getCell(r, 6).value = cd.persons > 0 ? `${cd.persons} pers · prom ${fmtNum(cd.avg)}` : "—";
        for (let c = 2; c <= 6; c++) ws.getCell(r, c).border = XLSX_BORDER;
        r++;
      }

      const totalRow = r;
      ws.getCell(totalRow, 2).value = "TOTAL";
      ws.getCell(totalRow, 3).value = `${fmtNum(totalQty)}${unit ? " " + unit : ""}`;
      ws.getCell(totalRow, 4).value = `${persons} personas únicas`;
      ws.getCell(totalRow, 5).value = totalAmount;
      ws.getCell(totalRow, 5).numFmt = XLSX_MONEY_FMT;
      for (let c = 2; c <= 6; c++) {
        const cell = ws.getCell(totalRow, c);
        cell.font = { bold: true };
        cell.fill = toArgbFill(ROW_TOTAL_LIGHT);
        cell.border = XLSX_BORDER;
      }

      [2, 3, 4, 5, 6].forEach((c) => { ws.getColumn(c).width = 18; });

      const buf = await wb.xlsx.writeBuffer();
      const blob = new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `resumen_${col.labor.name}_${col.cycleLabel}`.replace(/[/\s]+/g, "_") + ".xlsx";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      toast.error("Error al generar Excel: " + (err.message || err));
    } finally {
      setBusy("");
    }
  };

  const handlePrint = () => {
    if (!captureRef.current) return;
    const html = captureRef.current.outerHTML;
    const win = window.open("", "_blank", "width=900,height=700");
    if (!win) {
      toast.warning("Permite las ventanas emergentes para imprimir.");
      return;
    }
    win.document.write(`<!DOCTYPE html><html><head><title>Resumen ${col.labor.name}</title>
      <style>
        * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; box-sizing: border-box; }
        body { font-family: ui-sans-serif, system-ui, sans-serif; padding: 20px; color: #000; margin: 0; }
        table { border-collapse: collapse; width: 100%; }
        th, td { border: 1px solid #888; padding: 6px 8px; font-size: 12px; }
        @media print { @page { size: portrait; margin: 12mm; } }
      </style>
    </head><body>${html}<script>window.onload = () => { window.focus(); window.print(); };</script></body></html>`);
    win.document.close();
  };

  return (
    <div className="rounded-md border border-[var(--color-border)]">
      <div className="flex flex-wrap items-center gap-2 bg-[var(--color-surface-2)] px-3 py-2 text-sm">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex flex-1 items-center gap-2 text-left hover:text-[var(--color-accent)]"
        >
          <span className="text-[var(--color-muted)]">{collapsed ? "▸" : "▾"}</span>
          <div className="min-w-0">
            <div className="font-semibold truncate">{col.labor.name}</div>
            <div className="text-[10px] text-[var(--color-muted)]">
              {col.cycleLabel}
              {col.cycleStatus === "closed" && <span className="ml-1 opacity-70">·🔒 cerrado</span>}
              {" · "}{typeLabel}
            </div>
          </div>
        </button>
        <div className="text-right">
          {totalQty > 0 && (
            <div className="text-xs text-[var(--color-muted)] tabular-nums">
              {fmtNum(totalQty)}{unit ? " " + unit : ""} · {persons} pers
            </div>
          )}
          <div className="font-semibold tabular-nums text-[var(--color-accent)]">
            {fmtCLP(totalAmount)}
          </div>
        </div>
        <div className="flex gap-1">
          <button
            onClick={handleCopyText}
            disabled={busy === "text"}
            title="Copiar como texto plano"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "text" ? "..." : "📋 Texto"}
          </button>
          <button
            onClick={handleCopyImage}
            disabled={busy === "image"}
            title="Copiar como imagen"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "image" ? "..." : "📋 Imagen"}
          </button>
          <button
            onClick={handleXlsx}
            disabled={busy === "xlsx"}
            title="Descargar como Excel"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)] disabled:opacity-50"
          >
            {busy === "xlsx" ? "..." : "📊 Excel"}
          </button>
          <button
            onClick={handlePrint}
            title="Imprimir"
            className="rounded border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1 text-[10px] hover:bg-[var(--color-accent-soft)]"
          >
            🖨
          </button>
        </div>
      </div>
      {!collapsed && (
        <div ref={captureRef} style={{ background: "#fff", color: "#000", padding: 12 }}>
          {/* Encabezado repetido dentro de la zona capturada, para que la
              imagen y la impresión lleven el nombre de la labor. */}
          <div style={{ marginBottom: 8 }}>
            <div style={{ fontSize: 13, fontWeight: 700 }}>{col.labor.name}</div>
            <div style={{ fontSize: 11, color: "#666", marginTop: 2 }}>
              {col.cycleLabel} · {typeLabel}
              {col.cycleStatus === "closed" && " · 🔒 cerrado"}
            </div>
          </div>
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {rows.map(({ day, cell: c }) => (
                <div key={day} style={{ border: "1px solid #999", borderRadius: 6, padding: "6px 8px", fontSize: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between" }}>
                    <span style={{ fontFamily: "ui-monospace, monospace", fontWeight: 700 }}>{day}</span>
                    <span style={{ fontWeight: 600 }}>{fmtCLP(c.amount)}</span>
                  </div>
                  <div style={{ marginTop: 2 }}>
                    <span style={{ fontWeight: 600 }}>{fmtNum(c.qty)}</span>
                    {c.unit && <span style={{ marginLeft: 4, color: "#666" }}>{c.unit}</span>}
                    {c.priceLabel && <span style={{ marginLeft: 6, color: "#444" }}>· {c.priceLabel}</span>}
                  </div>
                  {c.persons > 0 && (
                    <div style={{ marginTop: 2, color: "#666", fontSize: 11 }}>
                      {c.persons} pers · prom {fmtNum(c.avg)}
                    </div>
                  )}
                </div>
              ))}
              <div style={{ background: ROW_TOTAL_LIGHT, fontWeight: 700, borderRadius: 6, padding: "6px 8px", fontSize: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between" }}>
                  <span>TOTAL</span>
                  <span>{fmtCLP(totalAmount)}</span>
                </div>
                <div style={{ marginTop: 2, fontWeight: 400 }}>
                  {fmtNum(totalQty)}{unit && ` ${unit}`} · {persons} personas únicas
                </div>
              </div>
            </div>
          ) : (
          <div style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" }}>
            <table style={{ borderCollapse: "collapse", width: "100%" }}>
              <thead>
                <tr style={{ background: HDR_BLUE }}>
                  <th style={cellH}>Día</th>
                  <th style={cellH}>Producción</th>
                  <th style={cellH}>Precio</th>
                  <th style={{ ...cellH, textAlign: "right" }}>Monto</th>
                  <th style={{ ...cellH, textAlign: "right" }}>Rendimiento</th>
                </tr>
              </thead>
              <tbody>
                {rows.map(({ day, cell: c }) => (
                  <tr key={day}>
                    <td style={{ ...cell, fontFamily: "ui-monospace, monospace" }}>{day}</td>
                    <td style={cell}>
                      <span style={{ fontWeight: 600 }}>{fmtNum(c.qty)}</span>
                      {c.unit && <span style={{ marginLeft: 4, color: "#666" }}>{c.unit}</span>}
                    </td>
                    <td style={{ ...cell, color: "#444" }}>{c.priceLabel || "—"}</td>
                    <td style={{ ...cell, textAlign: "right", fontWeight: 600 }}>{fmtCLP(c.amount)}</td>
                    <td style={{ ...cell, textAlign: "right", color: "#666" }}>
                      {c.persons > 0 ? `${c.persons} pers · prom ${fmtNum(c.avg)}` : "—"}
                    </td>
                  </tr>
                ))}
                <tr style={{ background: ROW_TOTAL_LIGHT, fontWeight: 700 }}>
                  <td style={cell}>TOTAL</td>
                  <td style={cell}>
                    {fmtNum(totalQty)}
                    {unit && <span style={{ marginLeft: 4, color: "#555" }}>{unit}</span>}
                  </td>
                  <td style={{ ...cell, fontSize: 10, color: "#555" }}>
                    {persons} personas únicas
                  </td>
                  <td style={{ ...cell, textAlign: "right" }}>{fmtCLP(totalAmount)}</td>
                  <td style={cell}></td>
                </tr>
              </tbody>
            </table>
          </div>
          )}
        </div>
      )}
    </div>
  );
}

// Datos de una celda a partir de las jornadas del día y la labor: cosecha
// (combos calidad/envase), trato (tiers), trato por etapas y pago al día o
// supervisión. Devuelve null si no hay producción.
function buildCell(labor, date, workdays, dayPrices, catalogs) {
  if (!workdays?.length) return null;
  if (labor.type === "cosecha") {
    let qty = 0;
    let amount = 0;
    const containerSet = new Set();
    const ruts = new Set();
    for (const wd of workdays) {
      if (wd.pisoOnly) continue;
      const kg = Number(wd.qty) || 0;
      const amt = Number(wd.amount) || 0;
      const cy = Number(wd.containerY) || 0;
      qty += kg;
      amount += amt;
      if (cy != null) containerSet.add(cy);
      if (kg > 0 && wd.workerRut) ruts.add(wd.workerRut);
    }
    if (qty === 0 && amount === 0) return null;
    const unit = cosechaUnit(catalogs, containerSet).toLowerCase();
    // Precio: con un solo combo con precio, ese precio; con varios, el precio
    // de cada calidad; sin precio configurado, el promedio por unidad.
    const combos = getDayCombos(dayPrices, labor.id, date);
    let priceLabel = "";
    const activeCombos = combos.filter((c) => c.price > 0);
    if (activeCombos.length === 1) {
      const c0 = activeCombos[0];
      priceLabel = c0.mode === "flat"
        ? `${fmtCLP(c0.price)}/día`
        : `${fmtCLP(c0.price)}/${containerLabel(catalogs, c0.y).toLowerCase()}`;
    } else if (activeCombos.length > 1) {
      priceLabel = activeCombos
        .map((c) => `${qualityLabel(catalogs, c.x)}: ${fmtCLP(c.price)}`)
        .join(" · ");
    } else if (qty > 0) {
      priceLabel = `~${fmtCLP(amount / qty)}/u`;
    }
    const persons = ruts.size;
    const avg = persons > 0 ? qty / persons : 0;
    return { qty, amount, unit, priceLabel, persons, avg };
  }
  if (labor.type === "trato") {
    let qty = 0;
    let amount = 0;
    const unitSet = new Set();
    const ruts = new Set();
    for (const wd of workdays) {
      if (wd.pisoOnly) continue;
      const t = getTratoTierTotals(wd);
      qty += t.qty;
      amount += t.amount;
      if (t.qty > 0 && wd.workerRut) ruts.add(wd.workerRut);
    }
    if (qty === 0 && amount === 0) return null;
    // Unidad y precio salen de los tiers configurados ese día.
    const tiers = getTratoTiers(dayPrices, labor.id, date);
    const activeTiers = tiers.filter((t) => t.price > 0);
    let priceLabel = "";
    if (activeTiers.length === 1) {
      const t0 = activeTiers[0];
      const unitLbl = t0.unit == null ? null : tratoUnitLabel(catalogs, t0.unit);
      if (unitLbl) unitSet.add(unitLbl.toLowerCase());
      priceLabel = t0.mode === "flat"
        ? `${fmtCLP(t0.price)}/día`
        : `${fmtCLP(t0.price)}/${unitLbl ? unitLbl.toLowerCase() : "unid"}`;
    } else if (activeTiers.length > 1) {
      for (const t of activeTiers) {
        const u = t.unit == null ? null : tratoUnitLabel(catalogs, t.unit);
        if (u) unitSet.add(u.toLowerCase());
      }
      priceLabel = activeTiers
        .map((t, i) => `P${i + 1}: ${fmtCLP(t.price)}`)
        .join(" · ");
    } else if (qty > 0) {
      priceLabel = `~${fmtCLP(amount / qty)}/u`;
    }
    // Sin unidad configurada, se muestra el tipo de trato.
    const unit = unitSet.size > 0
      ? [...unitSet].join("/")
      : tratoTypeLabel(catalogs, labor.tratoType ?? 0).toLowerCase();
    const persons = ruts.size;
    const avg = persons > 0 ? qty / persons : 0;
    return { qty, amount, unit, priceLabel, persons, avg };
  }
  if (labor.type === "tratoEtapas") {
    // Cantidad del día (qty): solo las etapas que cuentan; monto: todas. El
    // desglose por etapa (priceLabel) también lista solo las que cuentan.
    const counting = countingStageIds(labor);
    let qty = 0;
    let amount = 0;
    const ruts = new Set();
    const byStage = new Map(); // stageId → qty del día
    for (const wd of workdays) {
      if (wd.pisoOnly) continue;
      amount += Number(wd.amount) || 0;
      const q = Number(wd.qty) || 0;
      const sid = String(wd.stageId ?? "");
      byStage.set(sid, (byStage.get(sid) || 0) + q);
      if (counting.has(sid)) {
        qty += q;
        if (q > 0 && wd.workerRut) ruts.add(wd.workerRut);
      }
    }
    if (qty === 0 && amount === 0) return null;
    const stages = normalizeStages(labor.stages);
    const priceLabel = stages
      .filter((s) => s.counts && (byStage.get(String(s.id)) || 0) > 0)
      .map((s) => `${s.name} ${fmtNum(byStage.get(String(s.id)))}`)
      .join(" · ");
    const persons = ruts.size;
    const avg = persons > 0 ? qty / persons : 0;
    return { qty, amount, unit: "unid", priceLabel, persons, avg };
  }
  if (labor.type === "main" || labor.type === "supervision") {
    // Pago al día y supervisión: el monto viene directo en cada jornada. La
    // cantidad es el número de jornadas (trabajadores distintos pagados ese
    // día) y el precio, el promedio por jornada.
    let amount = 0;
    const ruts = new Set();
    for (const wd of workdays) {
      if (wd.pisoOnly) continue;
      const amt = Number(wd.amount) || 0;
      amount += amt;
      if (amt > 0 && wd.workerRut) ruts.add(wd.workerRut);
    }
    if (amount === 0) return null;
    const qty = ruts.size;
    const persons = ruts.size;
    const avg = qty > 0 ? amount / qty : 0;
    const priceLabel = qty > 0 ? `~${fmtCLP(avg)}/jornada` : "";
    return { qty, amount, unit: "jornadas", priceLabel, persons, avg };
  }
  return null;
}
