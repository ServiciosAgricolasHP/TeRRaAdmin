import { describe, it, expect } from "vitest";
import { payrollWorkdayIdsOf } from "../../src/utils/payroll";
import { payrollsService, tagWorkdaysWithPayroll, recalcPayrollAggregates, markBankPaid } from "../../src/services/payrollsService";
import { planPayrollRecalc } from "../../src/services/payrollRecalc";
import { removePayrollAdvances } from "../../src/services/payrollAdvanceRemoval";
import { applyAdvancesToPayroll } from "../../src/services/advancesService";
import { workdaysService } from "../../src/services";
import { aggregateWorkerAmounts } from "../../src/utils/payroll";
import { saveSnapshot } from "../../src/services/payrollSnapshots";
import { ANA, LABOR, seedCycle, seedWorker, seedWorkday, seedAdvance, get, all } from "./helpers/seed";

// Quitar de una nómina pendiente un anticipo o un bono que ya aplica. A Ana,
// con un bruto de 50.000, la nómina le descuenta la cuota de 80.000 que
// alcanza gracias a un bono de 30.000.

const CICLO = "ciclo-A";
const laborTypes = () => new Map([[LABOR, "cosecha"]]);

async function seedPayroll() {
  await seedCycle({ id: CICLO });
  await seedWorker(ANA);
  await seedWorkday({ cycleId: CICLO, rut: ANA.id, date: "2026-11-02", amount: 50000 });
  await seedAdvance("cuota", { rut: ANA.id, amount: 160000, date: "2026-10-01", installments: { count: 2, amount: 80000, cadence: "mensual" } });
  await seedAdvance("bono", { rut: ANA.id, amount: 30000, type: "bono", date: "2026-10-15" });

  const workdays = await workdaysService.list({ wheres: [["cycleId", "==", CICLO]] });
  const anticipos = [{ advanceId: "cuota", amount: 80000 }];
  const bonos = [{ advanceId: "bono", amount: 30000 }];
  const items = aggregateWorkerAmounts(workdays, laborTypes()).map((a) => ({
    rut: a.rut,
    workerId: a.workerId,
    name: ANA.name,
    bankCode: ANA.bankCode,
    grossAmount: Math.round(a.total),
    advance: 80000,
    bonus: 30000,
    anticiposTotal: 80000,
    bonosTotal: 30000,
    amount: 0,
    byCycle: { [CICLO]: Math.round(a.total) },
    workdayIds: a.workdayIds,
    anticipoApplications: anticipos,
    bonoApplications: bonos,
    advanceApplications: [...anticipos, ...bonos],
    advanceIds: ["cuota", "bono"],
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
  await applyAdvancesToPayroll([...anticipos, ...bonos], payroll.id);
  await saveSnapshot(payroll.id, { payroll: { id: payroll.id, total: aggregates.total }, workers: items, workdays: [], advances: [], cycles: [] });
  return payroll.id;
}

const recalcPlan = async (id) =>
  planPayrollRecalc(await get("payrolls", id), {
    cycles: await all("cycles"),
    faenas: await all("faenas"),
    subfaenas: await all("subfaenas"),
    workers: await all("worker"),
    today: "2026-11-26",
  });

describe("quitar un anticipo o un bono de la nómina", () => {
  it("quitar la cuota le devuelve el descuento y el anticipo vuelve a quedar pendiente", async () => {
    const id = await seedPayroll();
    const plan = await removePayrollAdvances(id, { entries: [{ rut: ANA.id, advanceId: "cuota" }] });
    expect(plan.people[0]).toMatchObject({ oldNet: 0, newNet: 80000 });

    const payroll = await get("payrolls", id);
    expect(payroll.items[0]).toMatchObject({ advance: 0, bonus: 30000, amount: 80000, advanceIds: ["bono"] });
    expect(payroll).toMatchObject({ total: 80000, advanceTotal: 0, advanceIds: ["bono"], skippedAdvanceIds: ["cuota"] });
    expect(await get("advances", "cuota")).toMatchObject({ status: "pending", amountPaid: 0, payments: [] });
    expect(await get("advances", "bono")).toMatchObject({ status: "applied", amountPaid: 30000 });
    expect((await get("payrollSnapshots", id)).workers[0].amount).toBe(80000);

    // Al recalcular, la cuota aparece sin marcar y no se aplica.
    const again = await recalcPlan(id);
    expect(again.advanceChoices).toMatchObject([{ advanceId: "cuota", reason: "skipped", chosen: false }]);
    expect(again.newAdvanceApplications).toEqual([]);
  });

  it("quitar el bono achica la cuota a lo que cabe en el bruto", async () => {
    const id = await seedPayroll();
    const plan = await removePayrollAdvances(id, { entries: [{ rut: ANA.id, advanceId: "bono" }] });
    expect(plan.people[0]).toMatchObject({ returned: 30000, oldNet: 0, newNet: 0 });

    const payroll = await get("payrolls", id);
    expect(payroll.items[0]).toMatchObject({ advance: 50000, bonus: 0, amount: 0, advanceIds: ["cuota"] });
    expect(await get("advances", "bono")).toMatchObject({ status: "pending", amountPaid: 0 });
    expect(await get("advances", "cuota")).toMatchObject({ status: "partial", amountPaid: 50000 });
  });

  it("con las transferencias pagadas no se puede", async () => {
    const id = await seedPayroll();
    await markBankPaid(id);
    await expect(removePayrollAdvances(id, { entries: [{ rut: ANA.id, advanceId: "cuota" }] })).rejects.toThrow(/transferencias/);
  });

  it("lo que ya no está en la nómina avisa", async () => {
    const id = await seedPayroll();
    await removePayrollAdvances(id, { entries: [{ rut: ANA.id, advanceId: "cuota" }] });
    await expect(removePayrollAdvances(id, { entries: [{ rut: ANA.id, advanceId: "cuota" }] })).rejects.toThrow(/ya no están/);
  });
});
