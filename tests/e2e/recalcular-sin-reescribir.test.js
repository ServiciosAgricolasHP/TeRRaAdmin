import { describe, it, expect } from "vitest";
import { payrollWorkdayIdsOf, aggregateWorkerAmounts } from "../../src/utils/payroll";
import { payrollsService, tagWorkdaysWithPayroll, recalcPayrollAggregates } from "../../src/services/payrollsService";
import { planPayrollRecalc, applyPayrollRecalc } from "../../src/services/payrollRecalc";
import { workdaysService } from "../../src/services";
import { saveSnapshot } from "../../src/services/payrollSnapshots";
import { millisOf } from "../../src/utils/syncedList";
import { ANA, CICLO, laborTypes, seedCycle, seedWorker, seedWorkday, get, all } from "./helpers/seed";

// Recalcular escribe solo las jornadas que cambian de nómina: las que ya
// tienen su etiqueta quedan como estaban.

async function seedPayroll() {
  await seedCycle({ id: CICLO });
  await seedWorker(ANA);
  const first = await seedWorkday({ rut: ANA.id, date: "2026-11-02", amount: 300000 });
  const workdays = await workdaysService.list({ wheres: [["cycleId", "==", CICLO]] });
  const items = aggregateWorkerAmounts(workdays, laborTypes()).map((a) => ({
    rut: a.rut,
    workerId: a.workerId,
    name: ANA.name,
    bankCode: ANA.bankCode,
    grossAmount: Math.round(a.total),
    advance: 0,
    bonus: 0,
    amount: Math.round(a.total),
    byCycle: { [CICLO]: Math.round(a.total) },
    workdayIds: a.workdayIds,
    anticipoApplications: [],
    bonoApplications: [],
    advanceApplications: [],
    advanceIds: [],
  }));
  const aggregates = recalcPayrollAggregates(items);
  const payroll = await payrollsService.create({
    name: "Nómina",
    status: "pending",
    cycleIds: [CICLO],
    cycleLabels: [CICLO],
    cycleDetails: [{ id: CICLO, label: CICLO }],
    ...aggregates,
  });
  await tagWorkdaysWithPayroll(payrollWorkdayIdsOf(aggregates), payroll.id);
  await saveSnapshot(payroll.id, { payroll: { id: payroll.id, total: aggregates.total }, workers: items, workdays: [], advances: [], cycles: [] });
  return { id: payroll.id, first };
}

async function recalc(payrollId) {
  const plan = await planPayrollRecalc(await get("payrolls", payrollId), {
    cycles: await all("cycles"),
    faenas: await all("faenas"),
    subfaenas: await all("subfaenas"),
    workers: await all("worker"),
  });
  await applyPayrollRecalc(payrollId, plan);
}

describe("recalcular sin reescribir lo que ya está en la nómina", () => {
  it("etiqueta la jornada nueva y deja intacta la que ya tenía la etiqueta", async () => {
    const { id, first } = await seedPayroll();
    const before = await get("workdays", first);
    const added = await seedWorkday({ rut: ANA.id, date: "2026-11-03", amount: 200000 });

    await recalc(id);

    const kept = await get("workdays", first);
    expect(kept.payrollId).toBe(id);
    expect(millisOf(kept.updatedAt)).toBe(millisOf(before.updatedAt));
    expect((await get("workdays", added)).payrollId).toBe(id);
    expect((await get("payrolls", id)).total).toBe(500000);
  });
});
