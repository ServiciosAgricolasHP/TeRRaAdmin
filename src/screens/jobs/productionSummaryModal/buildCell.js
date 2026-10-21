import {
  cosechaUnit,
  getDayCombos,
  containerLabel,
  qualityLabel,
  getTratoTierTotals,
  getTratoTiers,
  tratoUnitLabel,
  tratoTypeLabel,
} from "../../../utils/cosechaCombos";
import { countingStageIds, normalizeStages } from "../../../utils/tratoEtapas";
import { fmtNum } from "./helpers";
import { fmtCurrency } from "../../../utils/format";

// Datos de una celda a partir de las jornadas del día y la labor: cosecha
// (combos calidad/envase), trato (tiers), trato por etapas y pago al día o
// supervisión. Devuelve null si no hay producción.
export function buildCell(labor, date, workdays, dayPrices, catalogs) {
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
        ? `${fmtCurrency(c0.price)}/día`
        : `${fmtCurrency(c0.price)}/${containerLabel(catalogs, c0.y).toLowerCase()}`;
    } else if (activeCombos.length > 1) {
      priceLabel = activeCombos
        .map((c) => `${qualityLabel(catalogs, c.x)}: ${fmtCurrency(c.price)}`)
        .join(" · ");
    } else if (qty > 0) {
      priceLabel = `~${fmtCurrency(amount / qty)}/u`;
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
        ? `${fmtCurrency(t0.price)}/día`
        : `${fmtCurrency(t0.price)}/${unitLbl ? unitLbl.toLowerCase() : "unid"}`;
    } else if (activeTiers.length > 1) {
      for (const t of activeTiers) {
        const u = t.unit == null ? null : tratoUnitLabel(catalogs, t.unit);
        if (u) unitSet.add(u.toLowerCase());
      }
      priceLabel = activeTiers
        .map((t, i) => `P${i + 1}: ${fmtCurrency(t.price)}`)
        .join(" · ");
    } else if (qty > 0) {
      priceLabel = `~${fmtCurrency(amount / qty)}/u`;
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
    const priceLabel = qty > 0 ? `~${fmtCurrency(avg)}/jornada` : "";
    return { qty, amount, unit: "jornadas", priceLabel, persons, avg };
  }
  return null;
}
