// Los ciclos en Nómina: lo pendiente de cada ciclo activo, la lista para
// elegirlos, los ciclos abiertos por faena, cuáles se eligieron y con qué
// labores, y los ciclos de una nómina tal como van al Excel.
import { isCashBank } from "./banks";
import { getTratoTierTotals } from "./cosechaCombos";
import { matchesSearchQuery } from "./textSearch";

// Totales por ciclo activo: { [cycleId]: { unpaid, taken, total, firstDay,
// lastDay, unpaidBank, unpaidCash, unpaidUnknown, unpaidByLabor,
// takenByPayroll } }, con `unpaidByLabor[laborId]` = { unpaid, bank, cash,
// unknown, ruts }. `taken` es lo que ya entró a alguna nómina y
// `takenByPayroll[payrollId]`, lo que se llevó cada una: cuánto de eso está
// pagado de verdad depende del estado de la nómina (`splitTaken`).
// firstDay/lastDay son el período que muestra CycleSelector.
export function cycleStatsOf(cycles, workers, workdays) {
  const activeIds = cycles.filter((x) => x.status !== "closed").map((x) => x.id);
  // Medio de pago por rut, para estimar sin lecturas extra cuánto de lo
  // pendiente sale en efectivo y cuánto por transferencia. Es un estimado
  // en bruto: el monto real por medio de pago sale en la vista previa, con
  // anticipos, bonos y los cambios de medio que haga el usuario.
  const payKindByRut = new Map();
  for (const wk of workers) {
    const code = wk.bankDetails?.[3] || "";
    payKindByRut.set(wk.id, !code ? "unknown" : isCashBank(code) ? "cash" : "bank");
  }
  const stats = {};
  for (const id of activeIds) {
    stats[id] = {
      unpaid: 0, taken: 0, total: 0, firstDay: "", lastDay: "",
      unpaidBank: 0, unpaidCash: 0, unpaidUnknown: 0,
      unpaidByLabor: {}, takenByPayroll: {},
    };
  }
  const laborTypeMap = new Map();
  for (const cy of cycles) {
    for (const labor of cy.labors || []) laborTypeMap.set(labor.id, labor.type);
  }
  for (const wd of workdays) {
    const cid = wd.cycleId;
    if (!stats[cid]) continue;
    const type = laborTypeMap.get(wd.laborId);
    let amount = 0;
    if (type === "trato") {
      amount = getTratoTierTotals(wd).amount;
    } else {
      amount = Number(wd.amount) || 0;
    }
    stats[cid].total += amount;
    if (wd.payrollId) {
      stats[cid].taken += amount;
      stats[cid].takenByPayroll[wd.payrollId] = (stats[cid].takenByPayroll[wd.payrollId] || 0) + amount;
    } else {
      stats[cid].unpaid += amount;
      // Un rut sin ficha o sin banco cargado queda aparte como "por
      // definir", no como transferencia.
      const kind = payKindByRut.get(wd.workerRut) || "unknown";
      if (kind === "cash") stats[cid].unpaidCash += amount;
      else if (kind === "bank") stats[cid].unpaidBank += amount;
      else stats[cid].unpaidUnknown += amount;
      // Lo mismo por labor, para que el total de lo elegido respete las
      // labores destildadas.
      const byLabor = stats[cid].unpaidByLabor;
      if (!byLabor[wd.laborId]) byLabor[wd.laborId] = { unpaid: 0, bank: 0, cash: 0, unknown: 0, ruts: new Set() };
      const pl = byLabor[wd.laborId];
      pl.unpaid += amount;
      pl.ruts.add(wd.workerRut);
      if (kind === "cash") pl.cash += amount;
      else if (kind === "bank") pl.bank += amount;
      else pl.unknown += amount;
    }
    if (wd.date) {
      if (!stats[cid].firstDay || wd.date < stats[cid].firstDay) stats[cid].firstDay = wd.date;
      if (!stats[cid].lastDay || wd.date > stats[cid].lastDay) stats[cid].lastDay = wd.date;
    }
  }
  return stats;
}

// Lo pendiente de un ciclo marcado, contando solo las labores elegidas.
export function pendingOfChosenLabors(cycle, stat, selectedLaborsByCycle) {
  const elegidas = selectedLaborsByCycle?.get(cycle.id);
  const todas = (cycle.labors || []).map((l) => l.id);
  if (!elegidas || todas.every((id) => elegidas.has(id))) {
    return {
      unpaid: stat.unpaid,
      bank: stat.unpaidBank || 0,
      cash: stat.unpaidCash || 0,
      unknown: stat.unpaidUnknown || 0,
    };
  }
  const out = { unpaid: 0, bank: 0, cash: 0, unknown: 0 };
  for (const id of elegidas) {
    const pl = stat.unpaidByLabor?.[id];
    if (!pl) continue;
    out.unpaid += pl.unpaid;
    out.bank += pl.bank;
    out.cash += pl.cash;
    out.unknown += pl.unknown;
  }
  return out;
}

// La lista de ciclos para elegir, por faena: los que se ven con la búsqueda y
// con "Sin pendientes" (un ciclo marcado se ve siempre), lo pendiente de
// cada uno y de cada faena, y los totales de lo pendiente y de lo elegido.
export function cycleChecklistOf({ groups, cycleStats, selected, selectedLaborsByCycle, search, showEmpty, subfaenaName }) {
  const statOf = (id) =>
    cycleStats?.[id] || {
      unpaid: 0, taken: 0, total: 0, firstDay: "", lastDay: "",
      unpaidBank: 0, unpaidCash: 0, unpaidUnknown: 0,
    };
  let empty = 0;
  let pendingSum = 0;
  let withPending = 0;
  let bankSum = 0, cashSum = 0, unknownSum = 0;
  let selSum = 0, selBank = 0, selCash = 0, selUnknown = 0;
  const out = [];
  for (const { faena, cycles } of groups) {
    const rows = [];
    let groupPending = 0;
    let groupBank = 0;
    let groupCash = 0;
    for (const c of cycles) {
      const stat = statOf(c.id);
      const isSelected = selected.has(c.id);
      const hasPending = stat.unpaid > 0;
      if (hasPending) {
        withPending += 1;
        pendingSum += stat.unpaid;
        bankSum += stat.unpaidBank || 0;
        cashSum += stat.unpaidCash || 0;
        unknownSum += stat.unpaidUnknown || 0;
      } else {
        empty += 1;
      }
      if (isSelected) {
        const parte = pendingOfChosenLabors(c, stat, selectedLaborsByCycle);
        selSum += parte.unpaid;
        selBank += parte.bank;
        selCash += parte.cash;
        selUnknown += parte.unknown;
      }
      if (!hasPending && !showEmpty && !isSelected) continue;
      const sub = subfaenaName(c.subfaenaId);
      if (!matchesSearchQuery(`${c.label || c.id} ${sub} ${faena.name || ""}`, search)) continue;
      if (hasPending) {
        groupPending += stat.unpaid;
        groupBank += stat.unpaidBank || 0;
        groupCash += stat.unpaidCash || 0;
      }
      rows.push({ cycle: c, stat, sub, isSelected, hasPending });
    }
    if (rows.length > 0) out.push({ faena, rows, groupPending, groupBank, groupCash });
  }
  return {
    visibleGroups: out,
    emptyCount: empty,
    totalPending: pendingSum,
    pendingCount: withPending,
    pendingBank: bankSum,
    pendingCash: cashSum,
    pendingUnknown: unknownSum,
    selectedTotal: selSum,
    selectedBank: selBank,
    selectedCash: selCash,
    selectedUnknown: selUnknown,
  };
}

// Ciclos activos agrupados por faena.
export function activeCyclesByJob(jobs, cycles) {
  const groups = new Map();
  for (const f of jobs) groups.set(f.id, { faena: f, cycles: [] });
  for (const c of cycles) {
    if (c.status === "closed") continue;
    const g = groups.get(c.faenaId);
    if (g) g.cycles.push(c);
  }
  return [...groups.values()].filter((g) => g.cycles.length > 0);
}

// Qué labores de un ciclo entran a la nómina, para `cycleDetails[].laborIds`:
// `undefined` = todas (el ciclo entero), una lista = solo esas, `[]` =
// ninguna. Recalcular respeta esta elección.
export function laborScopeOf(cycle, selectedLaborsByCycle) {
  const chosen = selectedLaborsByCycle.get(cycle.id);
  if (!chosen) return undefined;
  const allLaborIds = (cycle.labors || []).map((l) => l.id);
  if (allLaborIds.every((id) => chosen.has(id))) return undefined;
  return allLaborIds.filter((id) => chosen.has(id));
}

// Los ciclos elegidos y qué labores de cada uno: Map(cycleId → laborIds),
// con la convención de `laborScopeOf`. Solo abiertos: la selección se guarda
// entre sesiones, y un ciclo que se cerró desde entonces ya no aparece en la
// lista para poder desmarcarlo.
export function chosenCyclesOf(cycles, selectedCycleIds, selectedLaborsByCycle) {
  return new Map(
    cycles
      .filter((c) => selectedCycleIds.has(c.id) && c.status !== "closed")
      .map((c) => [c.id, laborScopeOf(c, selectedLaborsByCycle)]),
  );
}

// Los ciclos de una nómina para el Excel, con los nombres de ciclo editados en
// "📝 Editar encabezados" (guardados en el doc), así el XLSX usa los nombres
// cortos.
export function exportCyclesOf(p, cycles) {
  const overrides = p.cycleLabelOverrides || {};
  const cyclesForExport = (p.cycleDetails || []).map((c) => {
    // Sin firstDay/lastDay guardados, toma el rango del ciclo en memoria; si
    // el ciclo ya no existe, queda vacío y el XLSX no incluye la fila Período.
    let firstDay = c.firstDay || "";
    let lastDay = c.lastDay || "";
    if (!firstDay && !lastDay) {
      const live = cycles.find((x) => x.id === c.id);
      if (live && Array.isArray(live.days) && live.days.length) {
        const sorted = [...live.days].sort();
        firstDay = sorted[0];
        lastDay = sorted[sorted.length - 1];
      }
    }
    return {
      id: c.id,
      label: overrides[c.id] || c.label,
      faenaId: c.faenaId,
      faenaName: c.faenaName,
      subfaenaId: c.subfaenaId,
      subfaenaName: c.subfaenaName,
      firstDay,
      lastDay,
    };
  });
  if (cyclesForExport.length === 0 && p.cycleIds) {
    for (const id of p.cycleIds) cyclesForExport.push({ id, label: overrides[id] || id });
  }
  return cyclesForExport;
}
