// Piezas comunes de las impresiones de la nómina: las grillas de producción
// por ciclo, las jornadas de la nómina y los resúmenes por labor, anticipos y
// bonos.
import { cyclesService, workdaysService } from "../../services";
import { isCashBank } from "../../utils/banks";
import { getTratoTierTotals, getTratoTiers, formatLaborDayPrice, comboLabel } from "../../utils/cosechaCombos";
import { normalizeStages, describeStage, stageTag } from "../../utils/tratoEtapas";

// Arma la grilla de un grupo de trabajadores en un ciclo: una tabla por labor
// con producción, con filas = trabajadores y columnas = días. El contenido de
// cada celda depende del tipo de labor, como en la grilla de CycleDetail.
function buildGroupCycleSnapshot(groupRuts, cycle, workdays, nameByRut, catalogs = {}) {
  const rutSet = new Set(groupRuts);
  const wdsCycle = workdays.filter((w) => w.cycleId === cycle.id && rutSet.has(w.workerRut));
  if (wdsCycle.length === 0) return [];

  const dayPrices = cycle.dayPrices || {};
  const labors = cycle.labors || [];
  const out = [];

  for (const labor of labors) {
    const wdsLabor = wdsCycle.filter((w) => w.laborId === labor.id);
    if (wdsLabor.length === 0) continue;
    // tratoEtapas: orden de las etapas para el desglose de cada celda.
    const ordenEtapas = labor.type === "tratoEtapas"
      ? normalizeStages(labor.stages).map((st) => String(st.id))
      : null;

    // Acumula por (trabajador, día) el contenido de la celda: las jornadas del
    // mismo trabajador y día se suman (los tiers de trato vía
    // getTratoTierTotals, los combos calidad × envase de cosecha, etc.).
    const cellByWorkerDay = new Map(); // clave: rut + "|" + fecha
    const dates = new Set();
    const workersInLabor = new Set();
    const containers = new Set(); // envases vistos en cosecha — define la unidad
    const tratoUnits = new Set(); // unidades de los tiers del día, en trato (Árbol, Metro…)
    let anyPiso = false;
    for (const wd of wdsLabor) {
      const key = `${wd.workerRut}|${wd.date}`;
      dates.add(wd.date);
      workersInLabor.add(wd.workerRut);
      if (!cellByWorkerDay.has(key)) {
        cellByWorkerDay.set(key, {
          amount: 0,
          kilos: 0,
          jornadas: 0,
          overtimeHours: 0,
          extras: 0,
          piso: 0,
          hasManejo: false,
          hasSupervision: false,
          isHoliday: false,
          byCombo: {},
          byTier: {},
          byStage: {},
        });
      }
      const c = cellByWorkerDay.get(key);
      if (wd.pisoOnly) {
        const pa = Number(wd.amount) || 0;
        c.piso += pa;
        c.amount += pa;
        anyPiso = true;
        continue;
      }
      if (labor.type === "cosecha") {
        const x = Number(wd.qualityX) || 0;
        const y = Number(wd.containerY) || 0;
        // Clave estructural por combo (calidad_envase); el nombre visible lo
        // arma `comboLabel(catalogs, x, y)` al dibujar.
        const ck = `${x}_${y}`;
        const kg = Number(wd.qty) || 0;
        const amt = Number(wd.amount) || 0;
        c.kilos += kg;
        c.amount += amt;
        containers.add(y);
        if (!c.byCombo[ck]) c.byCombo[ck] = { x, y, kilos: 0, amount: 0 };
        c.byCombo[ck].kilos += kg;
        c.byCombo[ck].amount += amt;
      } else if (labor.type === "trato") {
        const t = getTratoTierTotals(wd);
        c.jornadas += t.qty;
        c.amount += t.amount;
        // Unidades configuradas en los tiers del día: van en la grilla para que
        // el comprobante muestre la unidad (Árbol, Metro…) en vez del tipo
        // (Poda) cuando la haya.
        const tiersForDay = getTratoTiers(dayPrices, labor.id, wd.date);
        for (const tier of tiersForDay) {
          if (tier.unit != null) tratoUnits.add(tier.unit);
        }
        // Desglose por tramo del comprobante. Cada doc de trato tiene un solo
        // tier (clave "0") y `t` ya viene conciliado (los campos de primer nivel
        // mandan sobre el espejo `tiers`): se usa `t` para que cuadre con el total.
        if (t.qty || t.amount) {
          const idx = "0";
          if (!c.byTier[idx]) c.byTier[idx] = { index: 0, jornadas: 0, amount: 0 };
          c.byTier[idx].jornadas += t.qty;
          c.byTier[idx].amount += t.amount;
        }
      } else if (labor.type === "tratoHE") {
        c.jornadas += Number(wd.qty) || 0;
        c.amount += Number(wd.amount) || 0;
        c.overtimeHours += Number(wd.overtimeHours) || 0;
        c.extras += Number(wd.extras) || 0;
        c.hasManejo = c.hasManejo || !!wd.hasManejo;
        c.hasSupervision = c.hasSupervision || !!wd.hasSupervision;
      } else if (labor.type === "tratoEtapas") {
        // Para el trabajador cuenta toda la producción: `counts` decide qué se
        // le factura al cliente, no qué hizo la persona. Cada etapa suma
        // cantidad y monto.
        const q = Number(wd.qty) || 0;
        const monto = Number(wd.amount) || 0;
        c.amount += monto;
        c.jornadas += q;
        const sid = String(wd.stageId ?? "");
        const acc = c.byStage[sid] || { ...describeStage(labor, sid, ordenEtapas), qty: 0, amount: 0 };
        acc.qty += q;
        acc.amount += monto;
        c.byStage[sid] = acc;
      } else {
        c.amount += Number(wd.amount) || 0;
        c.jornadas += 1;
      }
    }

    const sortedDates = [...dates].sort();
    const sortedRuts = [...workersInLabor].sort((a, b) =>
      (nameByRut.get(a) || a).localeCompare(nameByRut.get(b) || b),
    );

    const rows = sortedRuts.map((rut) => {
      let totalAmount = 0;
      let totalKilos = 0;
      let totalJornadas = 0;
      let totalPiso = 0;
      const cells = {};
      for (const d of sortedDates) {
        const c = cellByWorkerDay.get(`${rut}|${d}`);
        if (c) {
          cells[d] = c;
          totalAmount += c.amount;
          totalKilos += c.kilos;
          totalJornadas += c.jornadas;
          totalPiso += c.piso || 0;
        }
      }
      return {
        rut,
        name: nameByRut.get(rut) || "",
        cells,
        totalAmount,
        totalKilos,
        totalJornadas,
        totalPiso,
      };
    });

    // Totales por día, con kilos, jornadas, etc. por separado y no solo el monto.
    const dayTotals = {};
    let grandAmount = 0;
    let grandKilos = 0;
    let grandJornadas = 0;
    let grandOvertimeHours = 0;
    let grandExtras = 0;
    let grandPiso = 0;
    for (const d of sortedDates) {
      const agg = { amount: 0, kilos: 0, jornadas: 0, overtimeHours: 0, extras: 0, piso: 0, byCombo: {}, byTier: {}, byStage: {} };
      for (const r of rows) {
        const c = r.cells[d];
        if (!c) continue;
        agg.amount += c.amount || 0;
        agg.kilos += c.kilos || 0;
        agg.jornadas += c.jornadas || 0;
        agg.overtimeHours += c.overtimeHours || 0;
        agg.extras += c.extras || 0;
        agg.piso += c.piso || 0;
        for (const [ck, b] of Object.entries(c.byCombo || {})) {
          if (!agg.byCombo[ck]) agg.byCombo[ck] = { x: b.x, y: b.y, kilos: 0, amount: 0 };
          agg.byCombo[ck].kilos += b.kilos;
          agg.byCombo[ck].amount += b.amount;
        }
        for (const [tk, b] of Object.entries(c.byTier || {})) {
          if (!agg.byTier[tk]) agg.byTier[tk] = { index: b.index, jornadas: 0, amount: 0 };
          agg.byTier[tk].jornadas += b.jornadas;
          agg.byTier[tk].amount += b.amount;
        }
        for (const [sid, b] of Object.entries(c.byStage || {})) {
          if (!agg.byStage[sid]) agg.byStage[sid] = { stageId: sid, name: b.name, counts: b.counts, order: b.order, qty: 0, amount: 0 };
          agg.byStage[sid].qty += b.qty;
          agg.byStage[sid].amount += b.amount;
        }
      }
      dayTotals[d] = agg;
      grandAmount += agg.amount;
      grandKilos += agg.kilos;
      grandJornadas += agg.jornadas;
      grandOvertimeHours += agg.overtimeHours;
      grandExtras += agg.extras;
      grandPiso += agg.piso;
    }

    const priceByDate = {};
    for (const d of sortedDates) {
      priceByDate[d] = formatLaborDayPrice(labor, d, dayPrices, catalogs);
    }

    out.push({
      laborId: labor.id,
      laborName: labor.name,
      laborType: labor.type,
      tratoType: labor.tratoType ?? 0,
      cosechaContainers: [...containers],
      tratoUnits: [...tratoUnits],
      anyPiso,
      dates: sortedDates,
      rows,
      dayTotals,
      grandAmount,
      grandKilos,
      grandJornadas,
      grandOvertimeHours,
      grandExtras,
      grandPiso,
      priceByDate,
    });
  }

  return out;
}

function fmtMoneyShort(v) {
  return "$" + (Number(v) || 0).toLocaleString("es-CL");
}

export function fmtDateShort(dateStr) {
  if (!dateStr) return "";
  const d = new Date(dateStr + "T00:00:00");
  if (isNaN(d.getTime())) return dateStr;
  const m = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"][d.getMonth()];
  return `${String(d.getDate()).padStart(2, "0")}-${m}`;
}

export function renderProductionCell(cell, laborType, tratoLabel, kilosUnit, catalogs = {}) {
  if (!cell) return "";
  const fmtMoney = (v) => "$" + (Number(v) || 0).toLocaleString("es-CL");
  const num = (v) => (Number(v) || 0).toLocaleString("es-CL", { maximumFractionDigits: 2 });
  const pisoTag = (cell.piso || 0) > 0
    ? `<div class="muted" style="color:#b45309">🪙 Piso ${fmtMoney(cell.piso)}</div>`
    : "";
  if (laborType === "cosecha") {
    const unit = (kilosUnit || "kg").toLowerCase();
    const combos = Object.entries(cell.byCombo || {})
      .filter(([, b]) => b.kilos || b.amount)
      .sort(([, a], [, b]) => a.x - b.x || a.y - b.y);
    if (combos.length > 1) {
      // Cada combo se muestra con su nombre del catálogo (ej. "Premium / Saco").
      const lines = combos
        .map(([, b]) => {
          const lbl = comboLabel(catalogs, b.x, b.y);
          return `<div class="muted prod-breakdown">${lbl}: ${num(b.kilos)}</div>`;
        })
        .join("");
      return `${lines}<div>${num(cell.kilos)} ${unit}</div>${pisoTag}<div class="muted">${fmtMoney(cell.amount)}</div>`;
    }
    return `<div>${num(cell.kilos)} ${unit}</div>${pisoTag}<div class="muted">${fmtMoney(cell.amount)}</div>`;
  }
  if (laborType === "trato") {
    const unit = tratoLabel || "";
    const tiers = Object.entries(cell.byTier || {})
      .filter(([, b]) => b.jornadas || b.amount)
      .sort(([, a], [, b]) => a.index - b.index);
    if (tiers.length > 1) {
      const lines = tiers
        .map(([, b]) => `<div class="muted prod-breakdown">T${b.index + 1}: ${num(b.jornadas)}</div>`)
        .join("");
      return `${lines}<div>${num(cell.jornadas)}${unit ? ` ${unit}` : ""}</div>${pisoTag}<div class="muted">${fmtMoney(cell.amount)}</div>`;
    }
    return `<div>${num(cell.jornadas)}${unit ? ` ${unit}` : ""}</div>${pisoTag}<div class="muted">${fmtMoney(cell.amount)}</div>`;
  }
  if (laborType === "tratoHE") {
    const flags = [];
    if (cell.overtimeHours) flags.push(`HE:${num(cell.overtimeHours)}h`);
    if (cell.hasManejo) flags.push("M");
    if (cell.hasSupervision) flags.push("S");
    if (cell.extras) flags.push(`X:${fmtMoney(cell.extras)}`);
    const flagsHtml = flags.length ? `<div class="muted">${flags.join(" · ")}</div>` : "";
    // En tratoHE, `jornadas` suma el `qty` de las jornadas: el monto base del día.
    const baseHtml = cell.jornadas ? `<div>Base ${fmtMoney(cell.jornadas)}</div>` : "";
    return `${baseHtml}${flagsHtml}<div class="muted">${fmtMoney(cell.amount)}</div>`;
  }
  if (laborType === "tratoEtapas") {
    // jornadas = unidades producidas, de todas las etapas. El desglose dice
    // de qué etapa salió cada una, sin marcar cuáles cuentan para facturar:
    // esto lo lee el trabajador.
    const j = cell.jornadas || 0;
    const etapas = Object.values(cell.byStage || {})
      .filter((b) => b.qty || b.amount)
      .sort((a, b) => a.order - b.order);
    const breakdown = etapas.length > 1
      ? etapas.map((b) => `<div class="muted prod-breakdown">${stageTag(b)}: ${num(b.qty)}</div>`).join("")
      : "";
    const jHtml = j ? `<div>${num(j)} unid</div>` : "";
    return `${breakdown}${jHtml}${pisoTag}<div class="muted">${fmtMoney(cell.amount)}</div>`;
  }
  // main / supervision / extra
  return `<div>${fmtMoney(cell.amount)}</div>`;
}

// Como renderProductionCell, pero para filas y celdas de total: muestra los
// kilos o jornadas junto al monto.
export function renderProductionTotal(totals, laborType, tratoLabel, kilosUnit, catalogs = {}) {
  if (!totals) return "";
  const fmtMoney = (v) => "$" + (Number(v) || 0).toLocaleString("es-CL");
  const num = (v) => (Number(v) || 0).toLocaleString("es-CL", { maximumFractionDigits: 2 });
  const amount = totals.amount || 0;
  const piso = totals.piso || 0;
  const pisoTag = piso > 0
    ? `<div class="muted" style="color:#b45309">🪙 ${fmtMoney(piso)}</div>`
    : "";
  if (laborType === "cosecha") {
    const kilos = totals.kilos || 0;
    const unit = (kilosUnit || "kg").toLowerCase();
    const combos = Object.entries(totals.byCombo || {})
      .filter(([, b]) => b.kilos || b.amount)
      .sort(([, a], [, b]) => a.x - b.x || a.y - b.y);
    const breakdown = combos.length > 1
      ? combos.map(([, b]) => {
          const lbl = comboLabel(catalogs, b.x, b.y);
          return `<div class="muted prod-breakdown">${lbl}: ${num(b.kilos)}</div>`;
        }).join("")
      : "";
    const kHtml = kilos ? `<div>${num(kilos)} ${unit}</div>` : "";
    return `${breakdown}${kHtml}${pisoTag}<div><b>${fmtMoney(amount)}</b></div>`;
  }
  if (laborType === "trato") {
    const j = totals.jornadas || 0;
    const unit = tratoLabel || "jorn.";
    const tiers = Object.entries(totals.byTier || {})
      .filter(([, b]) => b.jornadas || b.amount)
      .sort(([, a], [, b]) => a.index - b.index);
    const breakdown = tiers.length > 1
      ? tiers.map(([, b]) => `<div class="muted prod-breakdown">T${b.index + 1}: ${num(b.jornadas)}</div>`).join("")
      : "";
    const jHtml = j ? `<div>${num(j)} ${unit}</div>` : "";
    return `${breakdown}${jHtml}${pisoTag}<div><b>${fmtMoney(amount)}</b></div>`;
  }
  if (laborType === "tratoHE") {
    const parts = [];
    if (totals.overtimeHours) parts.push(`HE:${num(totals.overtimeHours)}h`);
    if (totals.extras) parts.push(`X:${fmtMoney(totals.extras)}`);
    const sub = parts.length ? `<div class="muted">${parts.join(" · ")}</div>` : "";
    return `${sub}<div><b>${fmtMoney(amount)}</b></div>`;
  }
  if (laborType === "tratoEtapas") {
    const j = totals.jornadas || 0;
    const etapas = Object.values(totals.byStage || {})
      .filter((b) => b.qty || b.amount)
      .sort((a, b) => a.order - b.order);
    const breakdown = etapas.length > 1
      ? etapas.map((b) => `<div class="muted prod-breakdown">${stageTag(b)}: ${num(b.qty)}</div>`).join("")
      : "";
    const jHtml = j ? `<div>${num(j)} unid</div>` : "";
    return `${breakdown}${jHtml}${pisoTag}<div><b>${fmtMoney(amount)}</b></div>`;
  }
  return `<div><b>${fmtMoney(amount)}</b></div>`;
}

export const LABOR_TYPE_LABEL = {
  main: "Pago al día",
  supervision: "Supervisión",
  extra: "Adicional",
  cosecha: "Cosecha",
  trato: "A trato",
  tratoEtapas: "A trato por etapas",
  tratoHE: "Jornadas con HE",
};

// Ciclos y jornadas de una nómina: la parte cara. No depende de cómo se agrupe
// a la gente (`wdIdSet` sale de `payroll.items[].workdayIds`, la unión de todos
// los grupos), así que se pide una vez por nómina y la reusan el detalle de
// pago, los comprobantes de efectivo y la hoja de cada líder.
export async function fetchPayrollWorkdays(payroll) {
  const cycleIds = payroll.cycleIds || (payroll.cycleDetails || []).map((c) => c.id);
  const cycles = await Promise.all(cycleIds.map((id) => cyclesService.getById(id)));
  const cyclesById = {};
  for (const c of cycles) if (c) cyclesById[c.id] = c;

  const items = payroll.items || [];
  // Solo las jornadas de esta nómina: sus ciclos también tienen jornadas de
  // otras nóminas.
  const wdIdSet = new Set(items.flatMap((it) => it.workdayIds || []));
  const workdays = [];
  for (let i = 0; i < cycleIds.length; i += 10) {
    const chunk = cycleIds.slice(i, i + 10);
    if (chunk.length === 0) continue;
    const wds = await workdaysService.list({ wheres: [["cycleId", "in", chunk]] });
    for (const w of wds) if (wdIdSet.has(w.id)) workdays.push(w);
  }

  const nameByRut = new Map(items.map((it) => [it.rut, it.name]));
  return { cycleIds, cyclesById, workdays, nameByRut };
}

// Grillas por (grupo, ciclo), calculadas en memoria sobre lo que trajo
// `fetchPayrollWorkdays`. Cada llamador pasa sus grupos: todos para el detalle
// de pago, solo los de efectivo para los comprobantes, uno para la hoja de un
// líder. Los grupos de `allGroups` juntan banco y efectivo bajo el mismo líder,
// así que su resultado no sirve para la hoja firmable de efectivo.
//
// Las jornadas sí se comparten: `buildGroupCycleSnapshot` filtra por ciclo y
// por rut, así que recibir jornadas de más no cambia ninguna fila.
export function buildWorkdaysByGroup(groups, payrollData, catalogs = {}) {
  const { cycleIds, cyclesById, workdays, nameByRut } = payrollData;
  const workdaysByGroup = {};
  for (const g of groups) {
    const groupRuts = g.items.map((it) => it.rut);
    const byCycle = {};
    for (const cid of cycleIds) {
      const cycle = cyclesById[cid];
      if (!cycle) continue;
      byCycle[cid] = buildGroupCycleSnapshot(groupRuts, cycle, workdays, nameByRut, catalogs);
    }
    workdaysByGroup[g.leader] = byCycle;
  }
  return workdaysByGroup;
}

// Bonos y anticipos por medio de pago. Son un ajuste por trabajador, no por
// subfaena ni labor, así que van como filas de ajuste al pie de
// subfaenaSummary/laborSummary para que el TOTAL cuadre con lo que hay que
// pagar.
export function computeBonusAdvanceSummary(items) {
  let bankBonus = 0, cashBonus = 0, bankAdvance = 0, cashAdvance = 0;
  for (const it of items) {
    const isCash = isCashBank(it.bankCode);
    const bonus = Number(it.bonus) || 0;
    const advance = Number(it.advance) || 0;
    if (isCash) { cashBonus += bonus; cashAdvance += advance; }
    else { bankBonus += bonus; bankAdvance += advance; }
  }
  return {
    bonus: { bank: bankBonus, cash: cashBonus, total: bankBonus + cashBonus },
    advance: { bank: bankAdvance, cash: cashAdvance, total: bankAdvance + cashAdvance },
  };
}
