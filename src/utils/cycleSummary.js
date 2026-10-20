// Cálculo del resumen de un ciclo: filas por día y por labor, totales,
// grilla trabajador × día y las etiquetas de unidad y métrica de cada tipo de
// labor. Sin React ni Firestore.
import {
  containerLabel,
  tratoTypeLabel,
  tratoUnitLabel,
  cosechaUnit,
  getTratoTiers,
  getTratoTierTotals,
} from "./cosechaCombos";
import { stageById } from "./tratoEtapas";

export const fmtNumber = (v) =>
  new Intl.NumberFormat("es-CL", { maximumFractionDigits: 2 }).format(Number(v) || 0);

const monthShort = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export const dateLabel = (dateStr) => {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  return `${String(d.getDate()).padStart(2, "0")}-${monthShort[d.getMonth()]}`;
};

// Mediana: sugiere la tarifa de cobro por día sin que un día atípico, como una
// jornada mensual, la distorsione.
export function medianOf(values) {
  if (!values || values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

// Etiqueta de lo que se cobra, para el editor de tarifas, armada con los
// catálogos: "Cosecha — Saco" (envase si todas las filas usan el mismo),
// "Trato — Poda × Árbol" (unidad si todas las filas usan la misma).
export function activityLabel(labor, catalogs, containers, tratoUnitsSet) {
  const type = labor?.type;
  if (type === "cosecha") {
    if (containers && containers.size === 1) {
      return `Cosecha — ${containerLabel(catalogs, [...containers][0])}`;
    }
    return "Cosecha";
  }
  if (type === "trato") {
    const tt = tratoTypeLabel(catalogs, labor?.tratoType ?? 0);
    if (tratoUnitsSet && tratoUnitsSet.size === 1) {
      const u = [...tratoUnitsSet][0];
      const ul = u == null ? null : tratoUnitLabel(catalogs, u);
      if (ul) return `Trato — ${tt} × ${ul}`;
    }
    return `Trato — ${tt}`;
  }
  if (type === "tratoEtapas") return "Por etapas";
  if (type === "tratoHE") return "Jornada + HE";
  if (type === "main") return "Jornada simple";
  if (type === "supervision") return "Supervisión";
  if (type === "extra") return "Extra";
  return type || "—";
}

// ============================================================
// Agregación día a día por labor
// ============================================================

// Unidad de la columna principal según el tipo de labor, tomada de los
// catálogos. En trato es la unidad configurada si todos los días usan la misma
// (Árbol, Metro, Polín…); si hay mezcla o ninguna, el tipo de trato (Poda,
// Amarre…).
export function laborQtyUnit(labor, catalogs, containers, tratoUnitsSet) {
  const type = labor?.type;
  if (type === "cosecha") return cosechaUnit(catalogs, containers);
  if (type === "trato") {
    if (tratoUnitsSet && tratoUnitsSet.size === 1) {
      const u = [...tratoUnitsSet][0];
      const label = u == null ? null : tratoUnitLabel(catalogs, u);
      if (label) return label;
    }
    return tratoTypeLabel(catalogs, labor?.tratoType ?? 0);
  }
  if (type === "tratoEtapas") return "Unidades";
  // En tratoHE la unidad principal son las jornadas; las horas extras se
  // muestran aparte.
  if (type === "tratoHE") return "Jornadas";
  return "Jornadas";
}

// Texto a mostrar en la celda de métrica según tipo de labor.
export function formatRowMetric(row, type, catalogs) {
  if (type === "cosecha") return fmtNumber(row.qty);
  if (type === "trato") {
    // La unidad sale de la configuración del día (`row.unit`); sin ella, solo
    // la cantidad.
    if (row.unit != null) {
      const label = tratoUnitLabel(catalogs, row.unit) || "";
      return `${fmtNumber(row.qty)} ${label}`.trim();
    }
    return fmtNumber(row.qty);
  }
  if (type === "tratoEtapas") {
    // Cada fila es una etapa: cantidad y nombre, con "(no cuenta)" si la etapa
    // no suma unidades.
    const name = row.stageName || "";
    const tag = row.stageCounts === false ? " (no cuenta)" : "";
    return `${fmtNumber(row.qty)}${name ? ` ${name}` : ""}${tag}`.trim();
  }
  if (type === "tratoHE") {
    const parts = [];
    if (row.qty > 0) parts.push(`${fmtNumber(row.qty)} jornadas`);
    if (row.overtimeHours > 0) parts.push(`${fmtNumber(row.overtimeHours)} HE`);
    return parts.join(" + ");
  }
  return fmtNumber(row.qty);
}

// Texto de la métrica en la fila de subtotal. En trato agrupa por unidad:
// "20 metros" si todas las filas comparten unidad, "12 metros + 8 polines" si
// hay mezcla, y la cantidad sola si ninguna tiene unidad.
export function formatTotalsMetric(totals, type, rows, catalogs) {
  if (type === "tratoEtapas") {
    // Unidades producidas = solo etapas que cuentan (countedQty).
    return `${fmtNumber(totals.countedQty ?? totals.qty)} unid.`;
  }
  if (type === "tratoHE") {
    const parts = [];
    if (totals.qty > 0) parts.push(`${fmtNumber(totals.qty)} jornadas`);
    if (totals.overtimeHours > 0) parts.push(`${fmtNumber(totals.overtimeHours)} HE`);
    return parts.join(" + ");
  }
  if (type === "trato" && rows) {
    const anyHasUnit = rows.some((r) => r.unit != null);
    if (anyHasUnit) {
      const byUnit = new Map();
      for (const r of rows) {
        const u = r.unit ?? null;
        byUnit.set(u, (byUnit.get(u) || 0) + (Number(r.qty) || 0));
      }
      return [...byUnit.entries()]
        .map(([u, q]) => {
          const label = u == null ? "" : tratoUnitLabel(catalogs, u) || "";
          return `${fmtNumber(q)}${label ? ` ${label}` : ""}`;
        })
        .join(" + ");
    }
  }
  return fmtNumber(totals.qty);
}

// Devuelve { rows, containers: Set<number> }: una fila por día, o por día y
// tier en trato y por día y etapa en tratoEtapas (ahí el piso queda en una
// fila propia del día). `amount` es solo producción: el piso va en
// `pisoAmount` y `pisoCount` cuenta las personas con piso. En trato,
// `row.unit` es la unidad del tier en `dayPrices` (índice del catálogo
// `tratoUnits`), que `tratoUnitLabel` convierte en texto.
export function buildDailyRows(labor, wdMap, dayPrices = {}) {
  const byKey = new Map();
  const containers = new Set();
  const isTrato = labor?.type === "trato";
  const isEtapas = labor?.type === "tratoEtapas";
  // Trato y tratoEtapas agrupan por (date, subKey): tierKey para trato,
  // stageId para etapas. El groupKey indexa `byKey`; el rowKey final que ve la
  // UI también incluye el sub-key para distinguir filas del mismo día.
  const isSub = isTrato || isEtapas;
  for (const k in wdMap) {
    const wd = wdMap[k];
    const d = wd.date;
    let tierKey = null;
    let tierIdx = 0;
    if (isSub && !wd.pisoOnly) {
      const parts = String(k).split("__");
      tierKey = parts[2] || (isTrato ? "t0" : "");
      tierIdx = tierKey.startsWith("t") ? Number(tierKey.slice(1)) || 0 : 0;
    }
    const groupKey = isSub && tierKey ? `${d}|${tierKey}` : d;
    if (!byKey.has(groupKey)) {
      const row = {
        date: d,
        qty: 0,
        overtimeHours: 0,
        amount: 0,
        pisoAmount: 0,
        pisoCount: 0,
        workersSet: new Set(),
        pisoWorkersSet: new Set(),
      };
      if (isTrato) {
        const tiers = getTratoTiers(dayPrices, labor.id, d);
        if (tierKey) {
          row.tierKey = tierKey;
          row.tierIdx = tierIdx;
          row.unit = tiers[tierIdx]?.unit ?? tiers[0]?.unit ?? null;
          // rowKey único por (fecha, tier): es la key de React y la clave de
          // rowOverrides en el modo cobrar.
          row.rowKey = `${d}__${tierKey}`;
        } else {
          // Piso (wd.pisoOnly): fila del día, sin tier.
          row.unit = tiers[0]?.unit ?? null;
        }
      } else if (isEtapas && tierKey) {
        // Cada fila es una etapa del día. Guarda el nombre y si cuenta, para
        // que el conteo de unidades sume solo las etapas que cuentan.
        const st = stageById(labor, tierKey);
        row.stageId = tierKey;
        row.stageName = st?.name || "";
        row.stageCounts = !!st?.counts;
        row.rowKey = `${d}__${tierKey}`;
      }
      byKey.set(groupKey, row);
    }
    const g = byKey.get(groupKey);
    if (wd.pisoOnly) {
      const pa = Number(wd.amount) || 0;
      g.pisoAmount += pa;
      if (wd.workerRut) g.pisoWorkersSet.add(wd.workerId || wd.workerRut);
    } else if (labor.type === "cosecha") {
      g.qty += Number(wd.qty) || 0;
      g.amount += Number(wd.amount) || 0;
      containers.add(Number(wd.containerY) || 0);
    } else if (labor.type === "trato") {
      const t = getTratoTierTotals(wd);
      g.qty += t.qty;
      g.amount += t.amount;
    } else if (labor.type === "tratoEtapas") {
      // Pago = amount de todas las etapas. El qty se guarda por fila; el
      // conteo de unidades filtra por `stageCounts` en laborTotals.
      g.qty += Number(wd.qty) || 0;
      g.amount += Number(wd.amount) || 0;
    } else if (labor.type === "tratoHE") {
      g.qty += Number(wd.qty) || 0;
      g.overtimeHours += Number(wd.overtimeHours) || 0;
      g.amount += Number(wd.amount) || 0;
    } else {
      // main/supervision/extra: 1 jornada por workday
      g.qty += 1;
      g.amount += Number(wd.amount) || 0;
    }
    if (wd.workerRut) g.workersSet.add(wd.workerId || wd.workerRut);
  }
  // Tarifa HE de la labor (3.500 si no tiene). Solo tratoHE la usa, para
  // `heTotal` y `bonosTotal`.
  const overtimeRate = labor?.type === "tratoHE"
    ? (Number(labor?.overtimeRate) > 0 ? Number(labor.overtimeRate) : 3500)
    : 0;
  const rows = [...byKey.values()]
    .map((g) => {
      // bonosTotal = amount − base − horas HE × tarifa (en tratoHE la base es
      // `qty`): manejo, supervisión y extras de todos los trabajadores del día,
      // derivados del monto real.
      const heTotal = (g.overtimeHours || 0) * overtimeRate;
      const bonosTotal = labor?.type === "tratoHE"
        ? Math.max(0, (g.amount || 0) - (g.qty || 0) - heTotal)
        : 0;
      return {
        ...g,
        workerCount: g.workersSet.size,
        pisoCount: g.pisoWorkersSet.size,
        heTotal,
        bonosTotal,
      };
    })
    // Orden por fecha y, dentro del día, por tier.
    .sort((a, b) => {
      if (a.date !== b.date) return a.date < b.date ? -1 : 1;
      return (a.tierIdx ?? 0) - (b.tierIdx ?? 0);
    });
  return { rows, containers };
}

export function laborTotals(rows) {
  let qty = 0, overtimeHours = 0, amount = 0, pisoAmount = 0, pisoCount = 0;
  let workerDays = 0, heTotal = 0, bonosTotal = 0, countedQty = 0;
  for (const r of rows) {
    qty += r.qty;
    // Unidades de producción: en tratoEtapas suman solo las etapas que
    // cuentan; en los demás tipos `stageCounts` es undefined y suma todo.
    if (r.stageCounts === undefined || r.stageCounts) countedQty += r.qty;
    overtimeHours += r.overtimeHours || 0;
    amount += r.amount;
    pisoAmount += r.pisoAmount || 0;
    pisoCount += r.pisoCount || 0;
    workerDays += r.workerCount || 0;
    heTotal += r.heTotal || 0;
    bonosTotal += r.bonosTotal || 0;
  }
  return { qty, countedQty, overtimeHours, amount, pisoAmount, pisoCount, workerDays, heTotal, bonosTotal };
}

// ============================================================
// Grilla trabajador × día por labor (segunda sección imprimible)
// ============================================================
// Cada celda trae la producción del trabajador ese día, según labor.type:
//   - cosecha: kilos (qty), monto y desglose por combo (calidad/envase)
//   - trato:   cantidad, monto y desglose por tier
//   - tratoHE: monto base, jornadas, horas extras, extras y monto
//   - tratoEtapas: cantidad de todas las etapas y monto
//   - main/supervision/extra: 1 jornada y monto
// El nombre sale de `labor.workers[].name`; si el trabajador ya no está en la
// labor, del `workerName` del workday o, si no hay, del RUT.
export function buildWorkerLaborGrid(labor, wdMap) {
  // Agrupa por `workerId`, que no cambia. `workerRut` queda fijo en cada
  // workday al crearse y puede variar si el RUT se corrigió a mitad de ciclo,
  // así que solo se usa para mostrar.
  const nameById = new Map();
  const rutById = new Map();
  for (const w of labor?.workers || []) {
    const wid = w?.id || w?.rut;
    if (!wid) continue;
    nameById.set(wid, w.name || w.rut || wid);
    rutById.set(wid, w.rut || wid);
  }

  const byWorker = new Map(); // workerId -> { rut, name, byDate, totals }
  const datesSet = new Set();
  const containers = new Set();
  let anyPiso = false;

  // Montos de los bonos de manejo y supervisión: los fija la labor y el
  // workday solo marca si aplican.
  const bonusManejoLabor = Number(labor?.bonusManejo) || 0;
  const bonusSupLabor = Number(labor?.bonusSupervision) || 0;

  for (const k in wdMap) {
    const wd = wdMap[k];
    if (!wd?.workerRut || !wd?.date) continue;
    datesSet.add(wd.date);
    const workerId = wd.workerId || wd.workerRut;

    if (!byWorker.has(workerId)) {
      byWorker.set(workerId, {
        rut: rutById.get(workerId) || wd.workerRut,
        name: nameById.get(workerId) || wd.workerName || wd.workerRut,
        byDate: new Map(),
        totals: { qty: 0, amount: 0, kilos: 0, jornadas: 0, overtimeHours: 0, pisoAmount: 0, base: 0, extras: 0 },
      });
    }
    const wEntry = byWorker.get(workerId);
    if (!wEntry.byDate.has(wd.date)) {
      wEntry.byDate.set(wd.date, {
        date: wd.date,
        qty: 0,
        amount: 0,
        kilos: 0,
        jornadas: 0,
        overtimeHours: 0,
        pisoAmount: 0,
        // tratoHE: base = $ del día (wd.qty), extras = manejo + supervisión + extras
        base: 0,
        extras: 0,
        byCombo: new Map(),
        byTier: new Map(),
      });
    }
    const c = wEntry.byDate.get(wd.date);
    const wdAmount = Number(wd.amount) || 0;
    c.amount += wdAmount;
    wEntry.totals.amount += wdAmount;

    if (wd.pisoOnly) {
      c.pisoAmount += wdAmount;
      wEntry.totals.pisoAmount += wdAmount;
      anyPiso = true;
      continue;
    }

    if (labor?.type === "cosecha") {
      const kg = Number(wd.qty) || 0;
      const qx = Number(wd.qualityX) || 0;
      const cy = Number(wd.containerY) || 0;
      containers.add(cy);
      c.kilos += kg;
      c.qty += kg;
      wEntry.totals.kilos += kg;
      wEntry.totals.qty += kg;
      const ck = `${qx}_${cy}`;
      if (!c.byCombo.has(ck)) c.byCombo.set(ck, { qx, cy, kilos: 0 });
      c.byCombo.get(ck).kilos += kg;
    } else if (labor?.type === "trato") {
      const t = getTratoTierTotals(wd);
      c.qty += t.qty;
      wEntry.totals.qty += t.qty;
      // El tierKey es la tercera parte de la clave `rut__date__ck` ("t0",
      // "t1"…): cada tier es un workday aparte.
      const parts = String(k).split("__");
      const tierKey = parts[2] || "t0";
      if (!c.byTier.has(tierKey)) c.byTier.set(tierKey, { qty: 0, amount: 0 });
      const tb = c.byTier.get(tierKey);
      tb.qty += t.qty;
      tb.amount += t.amount;
    } else if (labor?.type === "tratoHE") {
      // En tratoHE `wd.qty` es el monto base del día, no una cantidad de
      // jornadas: cada workday cuenta como una jornada.
      const q = Number(wd.qty) || 0;
      const oh = Number(wd.overtimeHours) || 0;
      const manejoAmt = wd.hasManejo ? bonusManejoLabor : 0;
      const supAmt = wd.hasSupervision ? bonusSupLabor : 0;
      const extrasNum = Number(wd.extras) || 0;
      const extrasTotal = manejoAmt + supAmt + extrasNum;
      c.qty += q;
      c.base += q;
      c.jornadas += 1;
      c.overtimeHours += oh;
      c.extras += extrasTotal;
      wEntry.totals.qty += q;
      wEntry.totals.base += q;
      wEntry.totals.jornadas += 1;
      wEntry.totals.overtimeHours += oh;
      wEntry.totals.extras += extrasTotal;
    } else if (labor?.type === "tratoEtapas") {
      // Toda la producción del trabajador, no solo la de las etapas que
      // cuentan: `counts` decide qué se le factura al cliente. Esta grilla es
      // del lado pagar, así que muestra lo que la persona hizo.
      const q = Number(wd.qty) || 0;
      c.qty += q;
      wEntry.totals.qty += q;
    } else {
      c.qty += 1;
      c.jornadas += 1;
      wEntry.totals.qty += 1;
      wEntry.totals.jornadas += 1;
    }
  }

  const dates = [...datesSet].sort();
  const workers = [...byWorker.values()].sort((a, b) =>
    (a.name || a.rut).localeCompare(b.name || b.rut, "es"),
  );
  return { workers, dates, containers, anyPiso };
}

// ============================================================
// Datos por labor
// ============================================================
export function laborsDataOf(labors, workdaysByLabor, dayPrices, catalogs) {
  if (!labors) return [];
  return labors.map((l) => {
    const wdMap = workdaysByLabor[l.id] || {};
    const { rows, containers } = buildDailyRows(l, wdMap, dayPrices);
    const totals = laborTotals(rows);
    // Unidades de trato usadas en la labor: si hay una sola, laborQtyUnit la
    // usa como encabezado de columna en vez del tipo de trato.
    const tratoUnitsSet =
      l.type === "trato"
        ? new Set(rows.map((r) => r.unit).filter((u) => u != null))
        : null;
    return {
      labor: l,
      rows,
      totals,
      unit: laborQtyUnit(l, catalogs, containers, tratoUnitsSet),
      containers,
      tratoUnitsSet,
    };
  });
}

// Grilla trabajador × día por labor (segunda sección imprimible). Cada
// labor tiene sus propios botones de copiar e imprimir.
export function laborWorkerGridsOf(labors, workdaysByLabor) {
  if (!labors) return [];
  return labors.map((l) => {
    const wdMap = workdaysByLabor[l.id] || {};
    const grid = buildWorkerLaborGrid(l, wdMap);
    return { labor: l, ...grid };
  });
}

// Transporte agrupado por transportista y fecha.
export function transportByCarrier(trips) {
  const byCarrier = new Map();
  for (const t of trips) {
    const cid = t.carrierId;
    if (!byCarrier.has(cid)) byCarrier.set(cid, { carrierId: cid, byDate: new Map(), totalCount: 0, totalAmount: 0 });
    const g = byCarrier.get(cid);
    if (!g.byDate.has(t.date)) g.byDate.set(t.date, { date: t.date, count: 0, amount: 0 });
    const d = g.byDate.get(t.date);
    d.count += Number(t.qty) || 1;
    d.amount += Number(t.amount) || 0;
    g.totalCount += Number(t.qty) || 1;
    g.totalAmount += Number(t.amount) || 0;
  }
  return [...byCarrier.values()].map((g) => ({
    ...g,
    rows: [...g.byDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1)),
  }));
}

export function payTotal(laborsData, transportData) {
  let sum = 0;
  for (const ld of laborsData) sum += ld.totals.amount + (ld.totals.pisoAmount || 0);
  for (const tg of transportData) sum += tg.totalAmount;
  return sum;
}

// Observaciones por día: las notas de cycle.dayNotesByLabor[laborId][date]
// y, para las labores sin nota propia ese día, la compartida de
// cycle.dayNotes[date] (ver CycleDetail). La compartida se emite una vez por
// día (`shared`), no una vez por labor.
//
// Solo en pagar: son apuntes internos, y el resumen de cobrar es el que se
// manda al cliente.
export function dayNotesSummaryOf(mode, laborsData, dayNotesByLabor, dayNotes, laborNames) {
  if (mode !== "pay") return [];
  const byLabor = dayNotesByLabor || {};
  const legacy = dayNotes || {};
  const byDate = new Map();
  const bucket = (date) => {
    if (!byDate.has(date)) byDate.set(date, { date, shared: "", entries: [] });
    return byDate.get(date);
  };
  for (const cl of laborsData) {
    const laborId = cl.labor.id;
    const name = laborNames?.[laborId] || cl.labor.name;
    const own = byLabor[laborId] || {};
    // Fechas con producción más las que solo tienen nota propia: un día sin
    // producción también puede llevar una observación.
    const dates = new Set(Object.keys(own));
    for (const r of cl.rows || []) if (r.date) dates.add(r.date);
    for (const date of dates) {
      const ownNote = String(own[date] || "").trim();
      if (ownNote) bucket(date).entries.push({ laborId, name, text: ownNote });
      else {
        const sharedNote = String(legacy[date] || "").trim();
        if (sharedNote) bucket(date).shared = sharedNote;
      }
    }
  }
  return [...byDate.values()]
    .filter((g) => g.shared || g.entries.length > 0)
    .sort((a, b) => a.date.localeCompare(b.date));
}
