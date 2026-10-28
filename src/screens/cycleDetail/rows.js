// Filas de la grilla del ciclo según el tipo de labor, y la forma en que se
// normaliza un ciclo al cargarlo.
import { workdayMapKey, PISO_COMBO_KEY } from "../../utils/cosechaCombos";

export const newId = () => (crypto?.randomUUID?.() || `id_${Date.now()}_${Math.random().toString(16).slice(2, 8)}`);

export const SINGLE_COMBO = "0_0";

export function normalizeCycle(c) {
  let days = Array.isArray(c.days) ? [...c.days] : null;
  let labors = c.labors;
  if (!labors || !labors.length) {
    labors = [{ id: newId(), name: "Principal", type: "main", workers: c.workers || [] }];
  }
  if (!days) {
    const union = new Set();
    for (const l of labors) for (const d of l.days || []) union.add(d);
    days = [...union].sort();
  }
  labors = labors.map((l) => {
    const rest = { ...l };
    delete rest.days;
    return rest;
  });
  return { ...c, days, labors };
}

export function buildRowsHarvest(workers, days, wdMap, dayCombosByDate) {
  return workers.map((w) => {
    const row = { rut: w.rut, name: w.name, _isTemp: !!w.isTemp, _isOrphan: !!w.isOrphan };
    let total = 0;
    for (const d of days) {
      const combos = dayCombosByDate[d] || [];
      let dayTotal = 0;
      let hasProduction = false;
      for (const c of combos) {
        const wd = wdMap[workdayMapKey(w.rut, d, c.key)];
        const qty = Number(wd?.qty) || 0;
        const amt = Number(wd?.amount) || 0;
        if (wd) hasProduction = true;
        row[`${d}__${c.key}`] = qty;
        row[`${d}__${c.key}__amt`] = amt;
        dayTotal += amt;
      }
      const pisoWd = wdMap[workdayMapKey(w.rut, d, PISO_COMBO_KEY)];
      const pisoAmt = pisoWd ? Number(pisoWd.amount) || 0 : 0;
      row[`${d}__piso`] = pisoAmt;
      row[`${d}__piso_has_wd`] = hasProduction;
      dayTotal += pisoAmt;
      row[`${d}__total`] = dayTotal;
      total += dayTotal;
    }
    row.total = total;
    return row;
  });
}

export function buildRowsOvertimeDay(workers, days, wdMap) {
  return workers.map((w) => {
    const row = { rut: w.rut, name: w.name, _isTemp: !!w.isTemp, _isOrphan: !!w.isOrphan, _monthly: !!w.monthly };
    let total = 0;
    for (const d of days) {
      const wd = wdMap[workdayMapKey(w.rut, d, SINGLE_COMBO)];
      // Marca si existe la jornada, para el ✓ de las celdas de sueldo mensual.
      row[`${d}__present`] = !!wd;
      const qty = Number(wd?.qty) || 0;
      const he = Number(wd?.overtimeHours) || 0;
      const m = !!wd?.hasManejo;
      const s = !!wd?.hasSupervision;
      const x = Number(wd?.extras) || 0;
      const amt = Number(wd?.amount) || 0;
      row[`${d}__qty`] = qty;
      row[`${d}__he`] = he;
      row[`${d}__m`] = m;
      row[`${d}__s`] = s;
      row[`${d}__x`] = x;
      row[`${d}__amt`] = amt;
      total += amt;
    }
    row.total = total;
    return row;
  });
}

export function buildRowsPiecework(workers, days, wdMap, dayTiersByDate) {
  return workers.map((w) => {
    const row = { rut: w.rut, name: w.name, _isTemp: !!w.isTemp, _isOrphan: !!w.isOrphan };
    let total = 0;
    for (const d of days) {
      const tiers = dayTiersByDate[d] || [];
      let dayTotal = 0;
      let hasProduction = false;
      for (const t of tiers) {
        const wd = wdMap[workdayMapKey(w.rut, d, t.key)];
        const qty = Number(wd?.qty) || 0;
        const amt = Number(wd?.amount) || 0;
        if (wd) hasProduction = true;
        row[`${d}__${t.key}`] = qty;
        row[`${d}__${t.key}__amt`] = amt;
        dayTotal += amt;
      }
      const pisoWd = wdMap[workdayMapKey(w.rut, d, PISO_COMBO_KEY)];
      const pisoAmt = pisoWd ? Number(pisoWd.amount) || 0 : 0;
      row[`${d}__piso`] = pisoAmt;
      row[`${d}__piso_has_wd`] = hasProduction;
      dayTotal += pisoAmt;
      row[`${d}__total`] = dayTotal;
      total += dayTotal;
    }
    row.total = total;
    return row;
  });
}

// Filas de la grilla para tratoEtapas. Las columnas por día son las etapas
// visibles ese día (las que tienen precio configurado o ya tienen producción),
// y la key del workday es el stageId. `row[${d}__${stageId}]` = qty, `__amt` =
// monto ya calculado (qty × precio del día).
export function buildRowsPieceworkStages(workers, days, wdMap, dayStagesByDate) {
  return workers.map((w) => {
    const row = { rut: w.rut, name: w.name, _isTemp: !!w.isTemp, _isOrphan: !!w.isOrphan };
    let total = 0;
    for (const d of days) {
      const stages = dayStagesByDate[d] || [];
      let dayTotal = 0;
      for (const st of stages) {
        const wd = wdMap[workdayMapKey(w.rut, d, st.id)];
        const qty = Number(wd?.qty) || 0;
        const amt = Number(wd?.amount) || 0;
        row[`${d}__${st.id}`] = qty;
        row[`${d}__${st.id}__amt`] = amt;
        dayTotal += amt;
      }
      row[`${d}__total`] = dayTotal;
      total += dayTotal;
    }
    row.total = total;
    return row;
  });
}

export function buildRowsNormal(workers, days, wdMap) {
  return workers.map((w) => {
    const row = { rut: w.rut, name: w.name, _isTemp: !!w.isTemp, _isOrphan: !!w.isOrphan, _monthly: !!w.monthly };
    let total = 0;
    for (const d of days) {
      const wd = wdMap[workdayMapKey(w.rut, d, SINGLE_COMBO)];
      const amount = Number(wd?.amount) || 0;
      row[d] = amount;
      // Marca si existe la jornada, para el ✓ de las celdas de sueldo mensual.
      row[`${d}__present`] = !!wd;
      total += amount;
    }
    row.total = total;
    return row;
  });
}
