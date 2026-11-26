import { describe, it, expect } from "vitest";
import { payrollWorkdayIdsOf } from "../../src/utils/payroll";
import { payrollsService, tagWorkdaysWithPayroll, recalcPayrollAggregates } from "../../src/services/payrollsService";
import { planPayrollRecalc, applyPayrollRecalc } from "../../src/services/payrollRecalc";
import { workdaysService } from "../../src/services";
import { aggregateWorkerAmounts } from "../../src/utils/payroll";
import { saveSnapshot } from "../../src/services/payrollSnapshots";
import { ANA, LABOR, seedCycle, seedWorker, seedWorkday, seedAdvance, get, all } from "./helpers/seed";

// Recalcular deja elegir qué anticipos y bonos pendientes se aplican. Ana está
// en una nómina que dejó fuera su cuota al generarla; después se le cargan un
// anticipo que se descuenta desde diciembre y otro sin fecha.

const CICLO = "ciclo-A";
const HOY = "2026-11-26";
const laborTypes = () => new Map([[LABOR, "cosecha"]]);

async function seedPayroll() {
  await seedCycle({ id: CICLO });
  await seedWorker(ANA);
  await seedWorkday({ cycleId: CICLO, rut: ANA.id, date: "2026-11-02", amount: 300000 });
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
    skippedAdvanceIds: ["cuota"],
    ...aggregates,
  });
  await tagWorkdaysWithPayroll(payrollWorkdayIdsOf(aggregates), payroll.id);
  await saveSnapshot(payroll.id, { payroll: { id: payroll.id, total: aggregates.total }, workers: items, workdays: [], advances: [], cycles: [] });

  await seedAdvance("cuota", {
    rut: ANA.id,
    amount: 90000,
    date: "2026-10-01",
    installments: { count: 3, amount: 30000, cadence: "mensual" },
  });
  await seedAdvance("diciembre", { rut: ANA.id, amount: 50000, date: "2026-11-20", applyFrom: "2026-12-01" });
  await seedAdvance("nuevo", { rut: ANA.id, amount: 20000, date: "2026-11-25" });
  return payroll.id;
}

async function plan(payrollId, extra = {}) {
  return planPayrollRecalc(await get("payrolls", payrollId), {
    cycles: await all("cycles"),
    faenas: await all("faenas"),
    subfaenas: await all("subfaenas"),
    workers: await all("worker"),
    today: HOY,
    ...extra,
  });
}

describe("elegir los anticipos y bonos al recalcular", () => {
  it("por defecto aplica solo lo que no se dejó fuera ni espera su fecha", async () => {
    const id = await seedPayroll();
    const p = await plan(id);
    expect(p.empty).toBe(false);
    expect(p.advanceChoices.map((c) => [c.advanceId, c.reason, c.chosen])).toEqual([
      ["cuota", "skipped", false],
      ["diciembre", "deferred", false],
      ["nuevo", null, true],
    ]);
    expect(p.advanceChoices.find((c) => c.advanceId === "cuota").amount).toBe(30000);

    await applyPayrollRecalc(id, p);
    const payroll = await get("payrolls", id);
    expect(payroll.items[0]).toMatchObject({ advance: 20000, amount: 280000, advanceIds: ["nuevo"] });
    // Lo que solo espera su fecha no queda como dejado fuera.
    expect(payroll.skippedAdvanceIds).toEqual(["cuota"]);
    expect((await get("advances", "cuota")).status).toBe("pending");
    expect((await get("advances", "diciembre")).status).toBe("pending");
    expect(await get("advances", "nuevo")).toMatchObject({ status: "applied", amountPaid: 20000 });
  });

  it("lo que se marca se aplica, aunque se hubiera dejado fuera o no llegue su fecha", async () => {
    const id = await seedPayroll();
    const p = await plan(id, { declined: [] });
    expect(p.advanceChoices.every((c) => c.chosen)).toBe(true);
    await applyPayrollRecalc(id, p);
    const payroll = await get("payrolls", id);
    expect(payroll.items[0].advance).toBe(30000 + 50000 + 20000);
    expect(payroll.skippedAdvanceIds).toEqual([]);
    expect(await get("advances", "cuota")).toMatchObject({ status: "partial", amountPaid: 30000 });
  });

  it("lo que se desmarca queda fuera y el recálculo siguiente no lo aplica solo", async () => {
    const id = await seedPayroll();
    await applyPayrollRecalc(id, await plan(id, { declined: ["cuota", "diciembre", "nuevo"] }));
    const payroll = await get("payrolls", id);
    expect(payroll.items[0]).toMatchObject({ advance: 0, amount: 300000 });
    expect(payroll.skippedAdvanceIds.sort()).toEqual(["cuota", "nuevo"]);

    const again = await plan(id);
    expect(again.advanceChoices.map((c) => [c.advanceId, c.reason, c.chosen])).toEqual([
      ["cuota", "skipped", false],
      ["diciembre", "deferred", false],
      ["nuevo", "skipped", false],
    ]);
    expect(again.newAdvanceApplications).toEqual([]);
  });

  it("desde la fecha de inicio, el anticipo viene marcado", async () => {
    const id = await seedPayroll();
    const p = await plan(id, { today: "2026-12-01" });
    expect(p.advanceChoices.find((c) => c.advanceId === "diciembre")).toMatchObject({ reason: null, chosen: true, applied: 50000 });
  });
});
