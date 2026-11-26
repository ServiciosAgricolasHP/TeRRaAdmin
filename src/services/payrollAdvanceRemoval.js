import { readPayrollApplications, setPayrollAdvanceAmounts } from "./advancesService";
import { assertEditable, payrollsService, recalcPayrollAggregates } from "./payrollsService";
import { syncSnapshotAmounts } from "./payrollSnapshots";
import { planAdvanceRemoval } from "../utils/payrollAdvanceRemoval";
import { nextSkippedIds } from "../utils/advanceSchedule";

// Quita de una nómina pendiente los anticipos y bonos `entries`
// (`{ rut, advanceId }`, de una o varias personas) en un solo paso
// (`planAdvanceRemoval`). Cada uno vuelve a quedar pendiente con lo que
// descontaron otras nóminas, y queda entre los que la nómina deja fuera
// (`skippedAdvanceIds`): Recalcular lo muestra sin marcar y "+ Agregar
// persona" no lo aplica. Se revisa contra la nómina y los anticipos como
// están ahora; si ya no queda nada que quitar, tira.
//
// Mismo orden que "Generar": primero la nómina, después los anticipos y el
// JSON. `onProgress(paso)`: "read", "payroll", "advances" y "snapshot".
export async function removePayrollAdvances(payrollId, { entries = [] }, onProgress) {
  onProgress?.("read");
  const payroll = await payrollsService.getById(payrollId);
  if (!payroll) throw new Error("Nómina no encontrada.");
  assertEditable(payroll, "quitar un anticipo o un bono");
  const items = Array.isArray(payroll.items) ? payroll.items : [];
  const ruts = new Set(entries.map((e) => e.rut));
  const appliedByAdvance = await readPayrollApplications(
    payrollId,
    items.filter((it) => ruts.has(it.rut)).flatMap((it) => it.advanceIds || []),
  );
  const plan = planAdvanceRemoval({ items, entries, appliedByAdvance });
  if (!plan) throw new Error("Esos anticipos o bonos ya no están en esta nómina.");
  const aggregates = recalcPayrollAggregates(plan.items);

  onProgress?.("payroll");
  await payrollsService.update(payrollId, {
    ...aggregates,
    skippedAdvanceIds: nextSkippedIds(payroll.skippedAdvanceIds, { add: plan.removedIds }),
  });
  onProgress?.("advances");
  await setPayrollAdvanceAmounts(payrollId, plan.targets);
  onProgress?.("snapshot");
  await syncSnapshotAmounts(payrollId, { items: plan.items, aggregates });
  return plan;
}
