import {
  advancesService,
  clearAdvancePayouts,
  markAdvancePayouts,
  restoreAdvancesFromPayroll,
} from "./advancesService";
import { listCycles, listJobs, listSubjobs } from "./jobLists";
import { liveProfileOf } from "./payrollRecalc";
import { assertEditable, payrollsService, recalcPayrollAggregates } from "./payrollsService";
import { pruneSnapshot, syncSnapshotAmounts } from "./payrollSnapshots";
import { listWorkers } from "./workersService";
import { payoutBlockReason, planPayoutRemoval, planPayouts } from "../utils/advancePayouts";
import { cycleDetailOf } from "../utils/payrollItem";

// Los ciclos a los que se asocian las entregas de una nómina, con `cycleId`:
// su nombre, su faena y su subfaena como están ahora, para el resumen.
async function payoutCyclesWith(existing = [], cycleId) {
  const list = Array.isArray(existing) ? existing : [];
  if (!cycleId || list.some((cd) => cd.id === cycleId)) return list;
  const [cycles, faenas, subfaenas] = await Promise.all([listCycles(), listJobs(), listSubjobs()]);
  const cycle = cycles.find((c) => c.id === cycleId);
  if (!cycle) return list;
  const { id, label, faenaId, faenaName, subfaenaId, subfaenaName } = cycleDetailOf(cycle, { faenas, subfaenas });
  return [...list, { id, label, faenaId, faenaName, subfaenaId, subfaenaName }];
}

// Entrega anticipos en una nómina pendiente: la nómina le paga a cada persona
// los anticipos `advanceIds`, asociados al ciclo `cycleId`, además de lo suyo
// (`planPayouts`). Quien no está en la nómina entra con bruto $0 y los datos
// de su ficha. Cada anticipo sigue pendiente, para que lo descuente otra
// nómina, y queda marcado con esta. Se revisa contra la nómina y los anticipos
// como están ahora.
//
// Mismo orden que "Generar": primero la nómina, después los anticipos y el
// JSON. `onProgress(paso)` avisa el paso en curso: "read", "payroll",
// "advances" y "snapshot".
export async function deliverAdvances(payrollId, { advanceIds = [], cycleId = "" }, onProgress) {
  onProgress?.("read");
  const payroll = await payrollsService.getById(payrollId);
  if (!payroll) throw new Error("Nómina no encontrada.");
  assertEditable(payroll, "entregar anticipos");
  const ids = [...new Set(advanceIds.filter(Boolean))];
  if (ids.length === 0) throw new Error("Elige al menos un anticipo.");

  const advances = await Promise.all(ids.map((id) => advancesService.getById(id)));
  advances.forEach((adv, i) => {
    const reason = payoutBlockReason(adv);
    if (reason) throw new Error(`${adv?.workerName || ids[i]}: ${reason} Vuelve a abrir la lista.`);
  });

  const workers = await listWorkers();
  const profileFor = (adv) => {
    const w =
      workers.find((x) => adv.workerId && x.id === adv.workerId) || workers.find((x) => x.rut && x.rut === adv.workerRut);
    return w ? { workerId: w.id, rut: w.rut || adv.workerRut, ...liveProfileOf(w) } : null;
  };
  const items = Array.isArray(payroll.items) ? payroll.items : [];
  const plan = planPayouts({ items, advances, cycleId, profileFor });
  const aggregates = recalcPayrollAggregates(plan.items);
  const payoutCycleDetails = await payoutCyclesWith(payroll.payoutCycleDetails, cycleId);

  onProgress?.("payroll");
  await payrollsService.update(payrollId, { ...aggregates, payoutCycleDetails });
  onProgress?.("advances");
  await markAdvancePayouts(ids, { payrollId, cycleId });
  onProgress?.("snapshot");
  await syncSnapshotAmounts(payrollId, { items: plan.items, aggregates });
  return { ...plan, total: plan.added.reduce((s, a) => s + a.amount, 0) };
}

// Quita de una nómina pendiente las entregas `entries` (`{ rut, advanceId }`,
// de una o varias personas) en un solo paso (`planPayoutRemoval` por
// persona): cada anticipo vuelve a quedar sin entregar. Quien estaba solo por
// lo entregado sale de la nómina y suelta los bonos que le pagaba. Las que ya
// no están se saltan; si no queda ninguna, tira. `onProgress(paso)`: "read",
// "payroll", "advances" y "snapshot".
export async function removeAdvancePayouts(payrollId, { entries = [] }, onProgress) {
  onProgress?.("read");
  const payroll = await payrollsService.getById(payrollId);
  if (!payroll) throw new Error("Nómina no encontrada.");
  assertEditable(payroll, "quitar un anticipo entregado");
  const byRut = new Map();
  for (const e of entries) byRut.set(e.rut, [...(byRut.get(e.rut) || []), e.advanceId]);
  const plan = { items: Array.isArray(payroll.items) ? payroll.items : [], removed: [], removedTotal: 0, releasedAdvanceIds: [], people: [], leaving: [] };
  for (const [rut, advanceIds] of byRut) {
    const one = planPayoutRemoval({ items: plan.items, rut, advanceIds });
    if (!one) continue;
    plan.items = one.items;
    plan.removed.push(...one.removed);
    plan.removedTotal += one.removedTotal;
    plan.releasedAdvanceIds.push(...one.releasedAdvanceIds);
    plan.people.push({ rut, name: one.name, leaves: one.leaves, oldNet: one.oldNet, newNet: one.newNet });
    if (one.leaves) plan.leaving.push(one.name);
  }
  if (plan.removed.length === 0) throw new Error("Esas entregas ya no están en esta nómina.");
  const aggregates = recalcPayrollAggregates(plan.items);
  const used = new Set(plan.items.flatMap((it) => (it.payoutApplications || []).map((p) => p.cycleId)));
  const payoutCycleDetails = (payroll.payoutCycleDetails || []).filter((cd) => used.has(cd.id));

  onProgress?.("payroll");
  await payrollsService.update(payrollId, { ...aggregates, payoutCycleDetails });
  onProgress?.("advances");
  if (plan.releasedAdvanceIds.length) await restoreAdvancesFromPayroll(plan.releasedAdvanceIds, payrollId);
  await clearAdvancePayouts(
    plan.removed.map((p) => p.advanceId),
    payrollId,
  );
  onProgress?.("snapshot");
  if (plan.leaving.length) await pruneSnapshot(payrollId, { items: plan.items, aggregates });
  else await syncSnapshotAmounts(payrollId, { items: plan.items, aggregates });
  return plan;
}
