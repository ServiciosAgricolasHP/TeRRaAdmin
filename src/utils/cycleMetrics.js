// Cálculos de la grilla del ciclo: las métricas de cada labor y lo que se
// muestra en cada día. Trabajan sobre las jornadas en memoria de la pantalla,
// `workdaysByLabor[laborId][workdayMapKey]`.
import {
  workdayMapKey,
  getDayCombos,
  comboKey as makeComboKey,
  getTratoTiers,
  getTratoTierTotals,
  getDaySingle,
} from "./cosechaCombos";
import { isRedDay } from "./tratoHE";
import { getDayStages, getEtapasTotals, countingStageIds } from "./tratoEtapas";

// Personas con jornada por fecha en la labor activa, para las tarjetas de
// precios de las labores al día. Cuenta también la asistencia de los
// trabajadores mensuales.
export function peopleByDateOf(workdaysByLabor, shownLaborId) {
  const byDate = new Map();
  for (const wd of Object.values(workdaysByLabor[shownLaborId] || {})) {
    if (!wd?.date || !wd.workerRut) continue;
    if (!byDate.has(wd.date)) byDate.set(wd.date, new Set());
    byDate.get(wd.date).add(wd.workerRut);
  }
  return byDate;
}

// Días de la labor activa que muestran la columna "Piso": los que tienen
// piso configurado en `dayPrices` o algún workday pisoOnly.
export function daysWithFloorOf(activeLabor, isHarvestLabor, isPieceworkLabor, dayPrices, wdMap) {
  if (!activeLabor || (!isHarvestLabor && !isPieceworkLabor)) return new Set();
  const s = new Set();
  const dp = dayPrices[activeLabor.id] || {};
  for (const d in dp) {
    if ((Number(dp[d]?.piso) || 0) > 0) s.add(d);
  }
  for (const k in wdMap) {
    const wd = wdMap[k];
    if (wd?.pisoOnly && wd.date) s.add(wd.date);
  }
  return s;
}

export function dayCombosOf(isHarvestLabor, activeLabor, days, dayPrices, defaultMode, workdaysByLabor) {
  if (!isHarvestLabor || !activeLabor) return {};
  const wdMapForLabor = workdaysByLabor[activeLabor.id] || {};
  const out = {};
  for (const d of days) {
    const fromPrices = getDayCombos(dayPrices, activeLabor.id, d, defaultMode);
    const seen = new Set(fromPrices.map((c) => c.key));
    const result = [...fromPrices];
    for (const k in wdMapForLabor) {
      if (!k.includes(`__${d}__`)) continue;
      const wd = wdMapForLabor[k];
      const x = Number(wd.qualityX) || 0;
      const y = Number(wd.containerY) || 0;
      const ck = makeComboKey(x, y);
      if (!seen.has(ck) && (Number(wd.qty) || 0) > 0) {
        result.push({ key: ck, x, y, price: 0, mode: defaultMode });
        seen.add(ck);
      }
    }
    result.sort((a, b) => a.x - b.x || a.y - b.y);
    out[d] = result;
  }
  return out;
}

export function dayTiersOf(isPieceworkLabor, activeLabor, days, dayPrices, defaultMode, workdaysByLabor) {
  if (!isPieceworkLabor || !activeLabor) return {};
  const wdMapForLabor = workdaysByLabor[activeLabor.id] || {};
  const out = {};
  for (const d of days) {
    const fromPrices = getTratoTiers(dayPrices, activeLabor.id, d, defaultMode);
    const seen = new Set(fromPrices.map((t) => t.key));
    const result = [...fromPrices];
    for (const k in wdMapForLabor) {
      if (!k.includes(`__${d}__`)) continue;
      const wd = wdMapForLabor[k];
      if (!wd?.tiers) continue;
      for (const tk of Object.keys(wd.tiers)) {
        const tierKey = `t${tk}`;
        if (!seen.has(tierKey) && Number(wd.tiers[tk]?.qty) > 0) {
          const existing = dayPrices?.[activeLabor.id]?.[d]?.[tierKey] || {};
          result.push({ key: tierKey, index: Number(tk), price: Number(existing.price) || 0, mode: existing.mode || defaultMode });
          seen.add(tierKey);
        }
      }
    }
    result.sort((a, b) => a.index - b.index);
    out[d] = result;
  }
  return out;
}

// Etapas visibles por día en tratoEtapas: las etapas fijas de la labor que
// tienen precio ese día o producción, con el precio y el modo del día
// resueltos. Cada entrada: { id, name, counts, price, mode }.
export function dayStagesOf(isPieceworkStagesLabor, activeLabor, days, dayPrices, workdaysByLabor) {
  if (!isPieceworkStagesLabor || !activeLabor) return {};
  const wdMapForLabor = workdaysByLabor[activeLabor.id] || {};
  const out = {};
  for (const d of days) {
    // Etapas con producción ese día: se muestran aunque no tengan precio.
    const withData = new Set();
    for (const k in wdMapForLabor) {
      if (!k.includes(`__${d}__`)) continue;
      const wd = wdMapForLabor[k];
      if (wd?.stageId && (Number(wd.qty) || 0) > 0) withData.add(String(wd.stageId));
    }
    out[d] = getDayStages(activeLabor, dayPrices, d)
      .filter((s) => s.price > 0 || withData.has(String(s.id)));
  }
  return out;
}

// Trabajadores con workdays en esta labor que no están en labor.workers. Se
// suman a la grilla con `isOrphan` para que se vean y se puedan corregir:
// las métricas y la nómina los cuentan igual.
export function orphanWorkersOf(activeLabor, workers, wdMap, rutToName) {
  if (!activeLabor) return [];
  const inLabor = new Set((workers || []).map((w) => w.rut));
  const seen = new Set();
  const out = [];
  for (const k in wdMap) {
    const wd = wdMap[k];
    const rut = wd?.workerRut;
    if (!rut || inLabor.has(rut) || seen.has(rut)) continue;
    seen.add(rut);
    out.push({
      rut,
      name: rutToName.get(rut) || rut,
      isOrphan: true,
    });
  }
  return out;
}

export function laborAmountTotals(labors, workdaysByLabor) {
  const out = {};
  if (!labors) return out;
  for (const l of labors) {
    const m = workdaysByLabor[l.id] || {};
    let sum = 0;
    for (const k in m) {
      const wd = m[k];
      sum += l.type === "trato" ? getTratoTierTotals(wd).amount : (Number(wd.amount) || 0);
    }
    out[l.id] = sum;
  }
  return out;
}

export function harvestQtyByContainer(labors, workdaysByLabor) {
  const out = {};
  if (!labors) return out;
  for (const l of labors) {
    if (l.type !== "cosecha") continue;
    const m = workdaysByLabor[l.id] || {};
    const byContainer = {};
    for (const k in m) {
      const wd = m[k];
      const y = Number(wd.containerY) || 0;
      const qty = Number(wd.qty) || 0;
      byContainer[y] = (byContainer[y] || 0) + qty;
    }
    out[l.id] = byContainer;
  }
  return out;
}

export function laborQtyTotals(labors, workdaysByLabor) {
  const out = {};
  if (!labors) return out;
  for (const l of labors) {
    const m = workdaysByLabor[l.id] || {};
    if (l.type === "trato") {
      let sum = 0;
      for (const k in m) sum += getTratoTierTotals(m[k]).qty;
      out[l.id] = sum;
    } else if (l.type === "tratoEtapas") {
      // Conteo deduplicado: solo las etapas marcadas como que cuentan.
      out[l.id] = getEtapasTotals(l, Object.values(m)).unidades;
    }
  }
  return out;
}

// Resumen por día de la labor tratoEtapas activa, para la barra de precios:
// unidades de las etapas que cuentan, personas (ruts únicos con qty > 0 en
// cualquier etapa) y monto del día. { [date]: { counted, people, amount } }.
export function stagesDaySummaryOf(isPieceworkStagesLabor, activeLabor, workdaysByLabor) {
  if (!isPieceworkStagesLabor || !activeLabor) return {};
  const counting = countingStageIds(activeLabor);
  const m = workdaysByLabor[activeLabor.id] || {};
  const acc = {};
  for (const k in m) {
    const wd = m[k];
    const d = wd.date || k.split("__")[1];
    if (!d) continue;
    const qty = Number(wd.qty) || 0;
    if (!acc[d]) acc[d] = { counted: 0, amount: 0, people: new Set() };
    acc[d].amount += Number(wd.amount) || 0;
    if (counting.has(wd.stageId)) acc[d].counted += qty;
    const rut = wd.workerRut || k.split("__")[0];
    if (qty > 0 && rut) acc[d].people.add(rut);
  }
  const out = {};
  for (const d in acc) {
    out[d] = { counted: acc[d].counted, amount: acc[d].amount, people: acc[d].people.size };
  }
  return out;
}

// RUTs únicos con producción (qty > 0) por labor de trato, para el
// "N personas · prom X/persona" de la tarjeta de métricas. Si el doc no trae
// workerRut, el rut sale de la clave del mapa ("rut__date__ck").
export function pieceworkPeopleCounts(labors, workdaysByLabor) {
  const out = {};
  if (!labors) return out;
  for (const l of labors) {
    if (l.type !== "trato") continue;
    const m = workdaysByLabor[l.id] || {};
    const ruts = new Set();
    for (const k in m) {
      const wd = m[k];
      if (getTratoTierTotals(wd).qty <= 0) continue;
      const rut = wd?.workerRut || k.split("__")[0];
      if (rut) ruts.add(rut);
    }
    out[l.id] = ruts.size;
  }
  return out;
}

// Pisos por labor: cuenta y suma total de los workdays pisoOnly. Solo
// aplica a trato/cosecha; el resto siempre será 0.
export function floorMetricsOf(labors, workdaysByLabor) {
  const out = {};
  if (!labors) return out;
  for (const l of labors) {
    const m = workdaysByLabor[l.id] || {};
    let count = 0;
    let amount = 0;
    for (const k in m) {
      const wd = m[k];
      if (!wd?.pisoOnly) continue;
      count += 1;
      amount += Number(wd.amount) || 0;
    }
    out[l.id] = { count, amount };
  }
  return out;
}

// tratoHE: jornadas (qty) y horas extras separadas por feriado/normal
export function overtimeDayMetricsOf(labors, workdaysByLabor, dayPrices) {
  const out = {};
  if (!labors) return out;
  for (const l of labors) {
    if (l.type !== "tratoHE") continue;
    const m = workdaysByLabor[l.id] || {};
    let normalQty = 0, holidayQty = 0;
    let normalOvertimeHours = 0, holidayOvertimeHours = 0;
    let workersWithBonus = 0;
    const seenWorkers = new Set();
    for (const k in m) {
      const wd = m[k];
      const cfg = getDaySingle(dayPrices, l.id, wd.date, "normal");
      const red = isRedDay(wd.date, cfg);
      const qty = Number(wd.qty) || 0;
      const hours = Number(wd.overtimeHours) || 0;
      if (red) { holidayQty += qty; holidayOvertimeHours += hours; }
      else { normalQty += qty; normalOvertimeHours += hours; }
      if ((wd.hasManejo || wd.hasSupervision) && !seenWorkers.has(wd.workerRut)) {
        seenWorkers.add(wd.workerRut);
        workersWithBonus++;
      }
    }
    out[l.id] = { normalQty, holidayQty, normalOvertimeHours, holidayOvertimeHours, workersWithBonus };
  }
  return out;
}

export function harvestQtyByDayCombo(isHarvestLabor, activeLabor, workdaysByLabor, days, workers, dayCombosByDate) {
  if (!isHarvestLabor || !activeLabor) return {};
  const m = workdaysByLabor[activeLabor.id] || {};
  const out = {};
  for (const d of days) {
    out[d] = {};
    const combos = dayCombosByDate[d] || [];
    for (const c of combos) {
      let sum = 0;
      for (const w of workers) {
        sum += Number(m[workdayMapKey(w.rut, d, c.key)]?.qty) || 0;
      }
      out[d][c.key] = sum;
    }
  }
  return out;
}

// Métricas por tier de las labores de trato. Los workdays de trato guardan
// `tiers: { "0": ... }` aunque sean de t1/t2, así que el tier sale de la
// 3.ª parte de la clave del mapa (`rut__date__ck`).
export function pieceworkTierMetricsOf(labors, workdaysByLabor) {
  const out = {};
  if (!labors) return out;
  for (const l of labors) {
    if (l.type !== "trato") continue;
    const m = workdaysByLabor[l.id] || {};
    const tiers = {};
    for (const k in m) {
      const wd = m[k];
      if (!wd || wd.pisoOnly) continue;
      const parts = String(k).split("__");
      const tierKey = parts[2] || "t0";
      const idx = tierKey.startsWith("t") ? Number(tierKey.slice(1)) || 0 : 0;
      if (!tiers[idx]) tiers[idx] = { qty: 0, amount: 0, workerCount: new Set() };
      // getTratoTierTotals da el total del workday: prioriza qty/amount del
      // primer nivel sobre la copia en `tiers`.
      const t = getTratoTierTotals(wd);
      tiers[idx].qty += t.qty;
      tiers[idx].amount += t.amount;
      if (wd.workerRut) tiers[idx].workerCount.add(wd.workerRut);
    }
    for (const idx of Object.keys(tiers)) tiers[idx].workerCount = tiers[idx].workerCount.size;
    out[l.id] = tiers;
  }
  return out;
}
