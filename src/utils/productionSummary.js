// Cálculo del resumen de producción de uno o varios ciclos: el orden de los
// ciclos, las columnas (ciclo × labor), los días con jornadas, las filas y
// totales de cada columna, el transporte por ciclo y los totales por grupo de
// labor. Las celdas de cada día las arma `buildCell`, en la pantalla, porque
// trae textos para mostrar.
import { getTratoTierTotals } from "./cosechaCombos";
import { countingStageIds } from "./tratoEtapas";
import { cycleSortDay } from "./cycleClosing";

export function laborGroupsByIdOf(laborGroupsBySubjob) {
  const m = new Map();
  for (const list of Object.values(laborGroupsBySubjob)) {
    for (const g of list) m.set(g.id, g);
  }
  return m;
}

// Orden de columnas y chips: agrupados por subfaena y, dentro de cada
// grupo, del más viejo al más nuevo por su primer día (`cycleSortDay`, el
// mismo criterio que la navegación anterior/siguiente de CycleDetail). Los grupos
// se ordenan por su ciclo más antiguo.
export function orderCycles(cycles) {
  const groups = new Map(); // subfaenaId (o "" para huérfanos) -> cycles[]
  for (const c of cycles) {
    const key = c.subfaenaId || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const groupList = [...groups.values()].map((list) => {
    const sorted = [...list].sort((a, b) => cycleSortDay(a).localeCompare(cycleSortDay(b)));
    return { sorted, groupKey: sorted.length > 0 ? cycleSortDay(sorted[0]) : "" };
  });
  groupList.sort((a, b) => a.groupKey.localeCompare(b.groupKey));
  return groupList.flatMap((g) => g.sorted);
}

// Columnas: una por (ciclo, labor) de tipo cosecha, trato, trato por
// etapas, pago al día o supervisión. Labores con el mismo nombre en ciclos
// distintos quedan en columnas separadas.
export function summaryColumns(orderedCycles, enabledCycles, typeFilter) {
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
}

// Días: unión de las fechas con jornadas (de cualquier labor) de los ciclos
// prendidos, en orden ascendente.
export function summaryDays(cycles, enabledCycles, wdByCycle) {
  const set = new Set();
  for (const c of cycles) {
    if (!enabledCycles.has(c.id)) continue;
    const wds = wdByCycle[c.id] || [];
    for (const wd of wds) {
      if (wd.date) set.add(wd.date);
    }
  }
  return [...set].sort();
}

// Por columna (labor): las filas por día con producción y sus totales.
// Alimenta una tarjeta por labor, con su propia tabla y sus botones de
// copiar e imprimir.
export function columnsData(columns, days, cellsByKey, wdByCycle) {
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
}

// Costo de transporte por ciclo (uno por ciclo, aunque tenga varias
// columnas de labor). `hasTrips` distingue $0 con vueltas sin monto
// (revisar tarifas) de $0 sin ninguna vuelta cargada.
export function transportByCycleOf(cycles, tripsByCycle) {
  const out = new Map();
  for (const c of cycles) {
    const trips = tripsByCycle[c.id] || [];
    out.set(c.id, {
      total: trips.reduce((s, t) => s + (Number(t.amount) || 0), 0),
      hasTrips: trips.length > 0,
    });
  }
  return out;
}

// Primera columna visible de cada ciclo — ahí (y solo ahí) se muestra el
// total de transporte de ese ciclo, para no duplicarlo cuando un ciclo
// tiene varias labores/columnas y así no inflar el gran total.
export function firstColumnByCycle(dataByColumn) {
  const seen = new Map();
  for (const d of dataByColumn) {
    if (!seen.has(d.col.cycleId)) seen.set(d.col.cycleId, d.col.key);
  }
  return seen;
}

export function transportTotalOf(dataByColumn, transportByCycle) {
  const cycleIds = new Set(dataByColumn.map((d) => d.col.cycleId));
  let sum = 0;
  for (const cid of cycleIds) sum += transportByCycle.get(cid)?.total || 0;
  return sum;
}

// Totales por grupo de labor: suma el monto de producción (bruto, sin % de
// ganancia ni IVA, que viven en CombinedSummaryCard) de las columnas
// (ciclo × labor) con el mismo laborGroupId. Las columnas sin grupo no
// entran.
export function laborGroupTotals(dataByColumn, laborGroupsById) {
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
}
