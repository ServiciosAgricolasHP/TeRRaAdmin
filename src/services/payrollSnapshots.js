// Ciclo de vida del snapshot inmutable de una nómina. El snapshot es contrato
// externo, pensado para el portal público de trabajadores.
//
// Los `catch` silenciosos son deliberados y hay que conservarlos: el
// snapshot es un derivado, y que falle no puede tumbar la generación ni el
// borrado de la nómina, que son las operaciones que mueven la plata.
import { payrollSnapshotsService, cyclesService } from "./index";
import { withPaidPeriods } from "../utils/payrollItem";
import { cyclesMissingLabors, withLiveLabors, withMissingLabors, sameData } from "../utils/snapshotLabors";

// Devuelve `true` si quedó guardado. La nómina ya existe cuando esto corre,
// así que un fallo acá deja una nómina sin snapshot, no una nómina rota.
export async function saveSnapshot(payrollId, snapshot) {
  try {
    await payrollSnapshotsService.upsert(payrollId, snapshot);
    return true;
  } catch (err) {
    console.warn("No se pudo guardar el snapshot en payrollSnapshots:", err);
    return false;
  }
}

// Borrar una nómina que nunca llegó a tener snapshot tiene que funcionar
// igual, así que esto nunca tira.
export async function deleteSnapshot(payrollId) {
  try {
    await payrollSnapshotsService.remove(payrollId);
    return true;
  } catch {
    return false;
  }
}

// Lee el snapshot para volver a bajarlo. Si no está en `payrollSnapshots`, usa
// el campo `snapshot` embebido en la nómina. Devuelve `null` cuando no hay
// ninguno de los dos.
export async function readSnapshot(payroll) {
  if (!payroll?.id) return null;
  try {
    const doc = await payrollSnapshotsService.getById(payroll.id);
    if (doc) {
      // Sacar el `id` que inyecta Firestore: no es parte del contrato.
      const { id: _omit, ...rest } = doc;
      return rest;
    }
  } catch {
    /* se intenta con el campo embebido */
  }
  if (payroll.snapshot) return { ...payroll.snapshot, payrollId: payroll.id };
  return null;
}

// Las formas en que el snapshot guarda un ciclo, una jornada y un anticipo.
// Las usan todos los caminos que escriben el snapshot (generar, agregar
// ciclos, recalcular): al ser contrato externo, el JSON tiene que salir igual
// por cualquiera de ellos.
//
// `laborIds` es interno de la nómina (qué labores trae Recalcular) y no viaja:
// el portal de trabajadores no lo necesita.
export function snapshotCycleOf(detail, cycle) {
  const { laborIds: _interno, ...cd } = detail || {};
  return { ...cd, ...snapshotLaborsOf(cycle) };
}

// Las labores y los precios del día de un ciclo, con la forma del snapshot.
export function snapshotLaborsOf(cycle) {
  return {
    dayPrices: cycle?.dayPrices || {},
    labors: (cycle?.labors || []).map((l) => ({
      id: l.id, name: l.name, type: l.type,
      // Catálogo: tratoType (Poda/Amarre/...) y tratoUnit (Planta/
      // Metro/...) son índices del catálogo. Para cosecha la unidad
      // se deriva de containerY del workday → cosechaUnit(catalogs).
      tratoType: l.tratoType ?? null,
      tratoUnit: l.tratoUnit ?? null,
      cosechaMode: l.cosechaMode || null,
      cosechaPrices: l.cosechaPrices || null,
      tratoMode: l.tratoMode || null,
      tratoTiers: l.tratoTiers || null,
      tratoHEDailyAmount: l.tratoHEDailyAmount ?? null,
      tratoHEOvertimeRate: l.tratoHEOvertimeRate ?? null,
      tratoHEManejoAmount: l.tratoHEManejoAmount ?? null,
      tratoHESupervisionAmount: l.tratoHESupervisionAmount ?? null,
      normalDailyAmount: l.normalDailyAmount ?? null,
      // tratoEtapas: etapas de la labor (nombre + tarifa por día + counts).
      stages: l.stages ?? null,
    })),
  };
}

export function snapshotWorkdayOf(wd) {
  return {
    id: wd.id,
    cycleId: wd.cycleId, laborId: wd.laborId,
    workerRut: wd.workerRut, date: wd.date,
    qty: wd.qty ?? null, amount: wd.amount ?? 0,
    qualityX: wd.qualityX ?? null, containerY: wd.containerY ?? null,
    tierKey: wd.tierKey ?? null, tiers: wd.tiers ?? null,
    stageId: wd.stageId ?? null,
    overtimeHours: wd.overtimeHours ?? null,
    hasManejo: !!wd.hasManejo, hasSupervision: !!wd.hasSupervision,
    extras: wd.extras ?? null, isHoliday: !!wd.isHoliday,
  };
}

export function snapshotAdvanceOf(adv) {
  return {
    id: adv.id, workerRut: adv.workerRut,
    type: adv.type, amount: Number(adv.amount) || 0,
    amountPaid: Number(adv.amountPaid) || 0,
    date: adv.date || null, note: adv.note || "",
    status: adv.status || null,
  };
}

// La cabecera de totales del snapshot, al día con los items.
function headerTotals(header, aggregates, items) {
  return {
    ...header,
    total: aggregates.total,
    bankTotal: aggregates.bankTotal,
    cashTotal: aggregates.cashTotal,
    workerCount: aggregates.workerCount,
    bankCount: aggregates.bankCount,
    cashCount: aggregates.cashCount,
    advanceTotal: aggregates.advanceTotal,
    bonusTotal: (items || []).reduce((s, it) => s + (Number(it.bonus) || 0), 0),
    payoutTotal: aggregates.payoutTotal || 0,
  };
}

// Deja el snapshot alineado con una nómina a la que se le sacó un trabajador:
// saca a quien salió, sus jornadas y sus anticipos, y pone al día la cabecera
// de totales.
//
// Recibe lo que ya quedó guardado en la nómina: los items, los agregados y,
// cuando corresponde, los ciclos que siguen y las jornadas que se soltaron.
// Igual que el resto del módulo, nunca tira.
export async function pruneSnapshot(payrollId, { items, aggregates, cycleIds = null, releasedWorkdayIds = [] }) {
  try {
    const snap = await payrollSnapshotsService.getById(payrollId);
    if (!snap) return false;
    const soltadas = new Set(releasedWorkdayIds);
    const anticipos = new Set((items || []).flatMap((it) => it.advanceIds || []));
    const patch = { workers: items };
    if (Array.isArray(snap.workdays)) patch.workdays = snap.workdays.filter((w) => !soltadas.has(w.id));
    if (Array.isArray(snap.advances)) patch.advances = snap.advances.filter((a) => anticipos.has(a.id));
    if (cycleIds && Array.isArray(snap.cycles)) {
      const siguen = new Set(cycleIds);
      patch.cycles = snap.cycles.filter((c) => siguen.has(c.id));
    }
    if (snap.payroll && aggregates) patch.payroll = headerTotals(snap.payroll, aggregates, items);
    await payrollSnapshotsService.update(payrollId, patch);
    return true;
  } catch (err) {
    console.warn("No se pudo alinear el snapshot con la nómina:", err);
    return false;
  }
}

// Deja el snapshot al día con una nómina a la que solo le cambiaron montos
// (el bono de una persona): los trabajadores, la cabecera de totales y los
// anticipos y bonos de `advances`, ya con la forma del snapshot, que
// reemplazan a los del mismo id. Nunca tira.
export async function syncSnapshotAmounts(payrollId, { items, aggregates, advances = [] }) {
  try {
    const snap = await payrollSnapshotsService.getById(payrollId);
    if (!snap) return false;
    const byId = new Map(advances.map((a) => [a.id, a]));
    const patch = { workers: items };
    if (Array.isArray(snap.advances)) patch.advances = snap.advances.map((a) => byId.get(a.id) || a);
    if (snap.payroll && aggregates) patch.payroll = headerTotals(snap.payroll, aggregates, items);
    await payrollSnapshotsService.update(payrollId, patch);
    return true;
  } catch (err) {
    console.warn("No se pudo poner al día el snapshot:", err);
    return false;
  }
}

// Deja el snapshot igual a una nómina recalculada (`applyPayrollRecalc`): los
// trabajadores y sus jornadas, ya con la forma del snapshot, los anticipos que
// la nómina sigue tocando más los que se le aplicaron ahora, y la cabecera al
// día. Con `cycleIds` (cambiaron los ciclos), quedan solo esos, más los que
// entran (`addedCycles`, ya con la forma del snapshot). Con `cycleDetails`,
// cada ciclo toma de ahí sus nombres vigentes, y de `cycleLabors` (`{ id }`
// más `snapshotLaborsOf`) sus labores y precios del día vigentes
// (`withLiveLabors`); el período sale de las jornadas (`withPaidPeriods`).
// Nunca tira.
export async function syncSnapshotAfterRecalc(
  payrollId,
  { items, aggregates, workdays = [], newAdvances = [], cycleIds = null, cycleDetails = null, addedCycles = [], cycleLabors = [] },
) {
  try {
    const snap = await payrollSnapshotsService.getById(payrollId);
    if (!snap) return false;
    const referenciados = new Set((items || []).flatMap((it) => it.advanceIds || []));
    const siguen = (snap.advances || []).filter((a) => referenciados.has(a.id));
    const ya = new Set(siguen.map((a) => a.id));
    const patch = {
      workers: items,
      workdays,
      advances: [...siguen, ...newAdvances.filter((a) => !ya.has(a.id))],
    };
    if (Array.isArray(snap.cycles)) {
      const kept = cycleIds ? new Set(cycleIds) : null;
      const detailById = new Map((cycleDetails || []).map((cd) => [cd.id, cd]));
      const liveById = new Map(cycleLabors.map((c) => [c.id, c]));
      const keptCycles = (kept ? snap.cycles.filter((c) => kept.has(c.id)) : snap.cycles).map((c) => {
        const cd = detailById.get(c.id);
        const names = {};
        if (cd) for (const k of ["label", "faenaName", "subfaenaName"]) if (cd[k]) names[k] = cd[k];
        return withLiveLabors({ ...c, ...names }, liveById.get(c.id));
      });
      const ya = new Set(keptCycles.map((c) => c.id));
      patch.cycles = withPaidPeriods([...keptCycles, ...addedCycles.filter((c) => !ya.has(c.id))], workdays);
    }
    if (snap.payroll && aggregates) patch.payroll = headerTotals(snap.payroll, aggregates, items);
    await payrollSnapshotsService.update(payrollId, patch);
    return true;
  } catch (err) {
    console.warn("No se pudo actualizar el snapshot al recalcular:", err);
    return false;
  }
}

// Lo mismo para una nómina que creció (se le agregaron ciclos, labores o días
// de una persona): suma lo que no estaba —ciclos, jornadas y anticipos, ya con
// la forma del snapshot— y deja los trabajadores y la cabecera al día. El
// período de un ciclo que ya estaba crece con los días nuevos, y sus labores y
// precios del día quedan al día con `cycleLabors` (`withLiveLabors`). Nunca
// tira.
export async function extendSnapshot(payrollId, { items, aggregates, cycles = [], workdays = [], advances = [], cycleLabors = [] }) {
  try {
    const snap = await payrollSnapshotsService.getById(payrollId);
    if (!snap) return false;
    const sumar = (antes, nuevos) => {
      const ya = new Set((antes || []).map((x) => x.id));
      return [...(antes || []), ...nuevos.filter((x) => !ya.has(x.id))];
    };
    const patch = { workers: items };
    if (cycles.length || ((workdays.length || cycleLabors.length) && Array.isArray(snap.cycles))) {
      const liveById = new Map(cycleLabors.map((c) => [c.id, c]));
      const withLabors = sumar(snap.cycles, cycles).map((c) => withLiveLabors(c, liveById.get(c.id)));
      patch.cycles = withPaidPeriods(withLabors, workdays, { extend: true });
    }
    if (workdays.length) patch.workdays = sumar(snap.workdays, workdays);
    if (advances.length) patch.advances = sumar(snap.advances, advances);
    if (snap.payroll && aggregates) patch.payroll = headerTotals(snap.payroll, aggregates, items);
    await payrollSnapshotsService.update(payrollId, patch);
    return true;
  } catch (err) {
    console.warn("No se pudo extender el snapshot de la nómina:", err);
    return false;
  }
}

// Pone al día las labores y los precios del día de los ciclos del snapshot
// con `cycleLabors` (`withLiveLabors`), sin tocar lo demás: es lo que hace
// Recalcular cuando la nómina no tiene otros cambios. Escribe solo si algo
// cambió y devuelve si escribió. Nunca tira.
export async function refreshSnapshotLabors(payrollId, cycleLabors = []) {
  if (!cycleLabors.length) return false;
  try {
    const snap = await payrollSnapshotsService.getById(payrollId);
    if (!Array.isArray(snap?.cycles)) return false;
    const liveById = new Map(cycleLabors.map((c) => [c.id, c]));
    const cycles = snap.cycles.map((c) => withLiveLabors(c, liveById.get(c.id)));
    if (sameData(cycles, snap.cycles)) return false;
    await payrollSnapshotsService.update(payrollId, { cycles });
    return true;
  } catch (err) {
    console.warn("No se pudieron poner al día las labores del snapshot:", err);
    return false;
  }
}

// El snapshot como se muestra: si a uno de sus ciclos le falta la labor de
// alguna de sus jornadas, la toma del ciclo en Firestore (`withMissingLabors`),
// sin escribir. Sin faltantes no lee nada. Nunca tira: si la lectura falla,
// devuelve el snapshot como estaba.
export async function completeSnapshotLabors(snapshot) {
  const cycles = snapshot?.cycles;
  if (!Array.isArray(cycles)) return snapshot;
  const inSnapshot = new Set(cycles.map((c) => c.id));
  const ids = cyclesMissingLabors(cycles, snapshot.workdays).filter((id) => inSnapshot.has(id));
  if (!ids.length) return snapshot;
  try {
    const live = (await Promise.all(ids.map((id) => cyclesService.getById(id)))).filter(Boolean);
    const liveById = new Map(live.map((c) => [c.id, snapshotLaborsOf(c)]));
    return { ...snapshot, cycles: cycles.map((c) => withMissingLabors(c, liveById.get(c.id))) };
  } catch (err) {
    console.warn("No se pudieron leer las labores que faltan en el snapshot:", err);
    return snapshot;
  }
}
