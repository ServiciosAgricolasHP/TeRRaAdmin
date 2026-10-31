import { cosechaUnit, getTratoTierTotals, getTratoTiers, tratoTypeLabel } from "./cosechaCombos";

// El detalle de un día del Calendario: los totales, las labores con su
// desglose por trabajador y por calidad, y las vueltas por transportista.

// Con `subjobId`, solo las jornadas o vueltas de esa subfaena, según el
// `subfaenaId` de su ciclo.
export function inSubjob(list, subjobId, cycleById) {
  if (!subjobId) return list;
  return list.filter((item) => cycleById.get(item.cycleId)?.subfaenaId === subjobId);
}

// Totales del día. Cada métrica suma solo su tipo de labor (kilos de
// cosecha, tratoQty de trato, etc.); las tarjetas en 0 no se muestran.
export function dayTotalsOf(workdays, trips, cycleById, catalogs) {
  const workers = new Set();
  let harvestQty = 0;
  let pieceworkQty = 0;
  let amount = 0;
  let workdayCount = 0;
  let overtimeHours = 0;
  let floorAmount = 0;
  let floorCount = 0;
  const pieceworkTypes = new Set();
  const harvestContainers = new Set();
  for (const wd of workdays) {
    workers.add(wd.workerId || wd.workerRut);
    amount += Number(wd.amount) || 0;
    if (wd.pisoOnly) {
      floorAmount += Number(wd.amount) || 0;
      floorCount += 1;
      continue; // el monto ya se sumó; el piso no aporta producción ni jornadas
    }
    const cycle = cycleById.get(wd.cycleId);
    const labor = cycle?.labors?.find((l) => l.id === wd.laborId);
    const t = labor?.type;
    if (t === "cosecha") {
      harvestQty += Number(wd.qty) || 0;
      harvestContainers.add(Number(wd.containerY) || 0);
    } else if (t === "trato") {
      pieceworkTypes.add(labor?.tratoType ?? 0);
      pieceworkQty += getTratoTierTotals(wd).qty;
    } else if (t === "tratoHE") {
      workdayCount += Number(wd.qty) || 0;
      overtimeHours += Number(wd.overtimeHours) || 0;
    } else {
      workdayCount += 1;
    }
  }
  const tripsTotal = trips.reduce((s, t) => s + (Number(t.amount) || 0), 0);
  const pieceworkLabel = pieceworkTypes.size === 1
    ? tratoTypeLabel(catalogs, [...pieceworkTypes][0])
    : "Trato";
  const harvestUnitLabel = cosechaUnit(catalogs, harvestContainers);
  return {
    workerCount: workers.size,
    harvestQty,
    harvestUnitLabel,
    pieceworkQty,
    pieceworkLabel,
    amount,
    workdayCount,
    overtimeHours,
    floorAmount,
    floorCount,
    tripsCount: trips.length,
    tripsTotal,
  };
}

// Agrupa los workdays por (cycleId, laborId), con solo las métricas que
// aplican a cada tipo de labor. Guarda además dos desgloses para la fila
// expandida:
//   - `workersMap`: producción por trabajador (kilos / tratoQty / jornadas /
//     monto / piso); sale como el array `workersBreakdown`.
//   - `qualityMap`: en cosecha, totales por combo (calidadX/envaseY); sale
//     como `qualityDist`.
export function dayByLaborOf(workdays, { cycleById, subjobById, jobById, workerById }) {
  const map = new Map();
  for (const wd of workdays) {
    const key = `${wd.cycleId}__${wd.laborId}`;
    if (!map.has(key)) {
      const cycle = cycleById.get(wd.cycleId);
      const labor = cycle?.labors?.find((l) => l.id === wd.laborId);
      const subjob = cycle ? subjobById.get(cycle.subfaenaId) : null;
      const job = subjob ? jobById.get(subjob.faenaId) : null;
      map.set(key, {
        key,
        cycleLabel: cycle?.label || wd.cycleId,
        laborName: labor?.name || wd.laborId,
        laborType: labor?.type || "main",
        tratoType: labor?.tratoType ?? 0,
        subjobName: subjob?.name || "",
        jobName: job?.name || "",
        workers: new Set(),
        containers: new Set(),
        harvestQty: 0,
        pieceworkQty: 0,
        pieceworkUnits: new Set(),
        workdayCount: 0,
        overtimeHours: 0,
        amount: 0,
        workersMap: new Map(),
        qualityMap: new Map(),
        _cycle: cycle,
      });
    }
    const e = map.get(key);
    // Agrupa por `workerId`, que no cambia: `workerRut` es el rut que tenía
    // el trabajador al crear cada workday y puede diferir entre ellos.
    const workerId = wd.workerId || wd.workerRut;
    e.workers.add(workerId);
    e.amount += Number(wd.amount) || 0;

    if (!e.workersMap.has(workerId)) {
      e.workersMap.set(workerId, {
        id: workerId,
        rut: wd.workerRut,
        harvestQty: 0,
        pieceworkQty: 0,
        workdayCount: 0,
        overtimeHours: 0,
        amount: 0,
        floorAmount: 0,
      });
    }
    const wEntry = e.workersMap.get(workerId);
    const wdAmount = Number(wd.amount) || 0;
    wEntry.amount += wdAmount;

    if (wd.pisoOnly) {
      e.floorAmount = (e.floorAmount || 0) + wdAmount;
      e.floorCount = (e.floorCount || 0) + 1;
      wEntry.floorAmount += wdAmount;
      continue;
    }
    const t = e.laborType;
    if (t === "cosecha") {
      const kg = Number(wd.qty) || 0;
      const qx = Number(wd.qualityX) || 0;
      const cy = Number(wd.containerY) || 0;
      e.harvestQty += kg;
      e.containers.add(cy);
      wEntry.harvestQty += kg;
      // Distribución por (calidad, envase): kilos + monto.
      const qk = `${qx}_${cy}`;
      if (!e.qualityMap.has(qk)) {
        e.qualityMap.set(qk, { qx, cy, harvestQty: 0, amount: 0 });
      }
      const q = e.qualityMap.get(qk);
      q.harvestQty += kg;
      q.amount += wdAmount;
    } else if (t === "trato") {
      const q = getTratoTierTotals(wd).qty;
      e.pieceworkQty += q;
      wEntry.pieceworkQty += q;
      // Unidades (plantas, metros…) de los tiers del workday, según el
      // dayPrices del ciclo para esa labor y fecha. Junta las de todos los
      // tiers de `wd.tiers`; sin ese campo, usa el tier 0.
      if (e._cycle?.dayPrices) {
        const tiers = getTratoTiers(e._cycle.dayPrices, wd.laborId, wd.date);
        const tierKeys = wd.tiers ? Object.keys(wd.tiers) : ["0"];
        for (const tk of tierKeys) {
          const tier = tiers[Number(tk)];
          if (tier?.unit != null) e.pieceworkUnits.add(tier.unit);
        }
      }
    } else if (t === "tratoHE") {
      const j = Number(wd.qty) || 0;
      const oh = Number(wd.overtimeHours) || 0;
      e.workdayCount += j;
      e.overtimeHours += oh;
      wEntry.workdayCount += j;
      wEntry.overtimeHours += oh;
    } else {
      e.workdayCount += 1;
      wEntry.workdayCount += 1;
    }
  }
  return [...map.values()]
    .map((e) => {
      const workersBreakdown = [...e.workersMap.values()]
        .map((w) => {
          const found = workerById?.get?.(w.id);
          return { ...w, rut: found?.rut || w.rut, name: found?.name || w.rut };
        })
        .sort((a, b) => b.amount - a.amount);
      const qualityDist = [...e.qualityMap.values()].sort(
        (a, b) => b.harvestQty - a.harvestQty || b.amount - a.amount,
      );
      const { workersMap: _wm, qualityMap: _qm, ...rest } = e;
      return { ...rest, workerCount: e.workers.size, workersBreakdown, qualityDist };
    })
    .sort((a, b) => b.amount - a.amount);
}

// Por transportista — el nombre viene del lookup de carriers, no del id.
export function dayByCarrierOf(trips, carrierById) {
  const map = new Map();
  for (const t of trips) {
    const key = t.carrierId || "(sin id)";
    if (!map.has(key)) {
      const carrier = carrierById?.get?.(key);
      map.set(key, {
        carrierId: key,
        alias: carrier?.alias || carrier?.name || "(transportista eliminado)",
        name: carrier?.name || "",
        tripCount: 0,
        total: 0,
      });
    }
    const e = map.get(key);
    e.tripCount += 1;
    e.total += Number(t.amount) || 0;
  }
  return [...map.values()].sort((a, b) => b.total - a.total);
}
