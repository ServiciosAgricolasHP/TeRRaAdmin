import { describe, it, expect } from "vitest";
import {
  payrollsService,
  tagWorkdaysWithPayroll,
  recalcPayrollAggregates,
  removeWorkerFromPayroll,
  markBankPaid,
} from "../../src/services/payrollsService";
import { planPayrollRecalc, applyPayrollRecalc } from "../../src/services/payrollRecalc";
import { deliverAdvances, removeAdvancePayouts } from "../../src/services/payrollPayouts";
import { applyAdvancesToPayroll, listPendingForWorkers, removeAdvance, updateAdvance } from "../../src/services/advancesService";
import { workdaysService } from "../../src/services";
import { aggregateWorkerAmounts } from "../../src/utils/payroll";
import { saveSnapshot } from "../../src/services/payrollSnapshots";
import { ANA, BETO, LABOR, seedCycle, seedWorker, seedWorkday, seedAdvance, set, get, all } from "./helpers/seed";

// Entregar anticipos en una nómina pendiente: la nómina le paga a la persona
// un anticipo que ya existe, que sigue pendiente para que lo descuente otra
// nómina. Ana trabajó en el ciclo A, que la nómina paga; Beto, en el ciclo B,
// que no está en la nómina.

const CICLO_A = "ciclo-A";
const CICLO_B = "ciclo-B";
const laborTypes = () => new Map([[LABOR, "cosecha"]]);

async function seedPayroll() {
  await seedCycle({ id: CICLO_A });
  await seedCycle({ id: CICLO_B });
  await seedWorker(ANA);
  await seedWorker(BETO, { groupLeader: "GRUPO B" });
  await seedWorkday({ cycleId: CICLO_A, rut: ANA.id, date: "2026-03-02", amount: 300000 });
  await seedWorkday({ cycleId: CICLO_B, rut: BETO.id, date: "2026-03-02", amount: 150000 });

  const workdays = await workdaysService.list({ wheres: [["cycleId", "==", CICLO_A]] });
  const items = aggregateWorkerAmounts(workdays, laborTypes()).map((a) => ({
    rut: a.rut,
    workerId: a.workerId,
    name: ANA.name,
    bankCode: ANA.bankCode,
    grossAmount: Math.round(a.total),
    advance: 0,
    bonus: 0,
    amount: Math.round(a.total),
    byCycle: { [CICLO_A]: Math.round(a.total) },
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
    cycleIds: [CICLO_A],
    cycleLabels: [CICLO_A],
    cycleDetails: [{ id: CICLO_A, label: CICLO_A }],
    ...aggregates,
  });
  await tagWorkdaysWithPayroll(aggregates.workdayIds, payroll.id);
  await saveSnapshot(payroll.id, { payroll: { id: payroll.id, total: aggregates.total }, workers: items, workdays: [], advances: [], cycles: [] });

  // Los anticipos se crean después de armar la nómina: ninguna los descuenta.
  await seedAdvance("ant-ana", { rut: ANA.id, amount: 40000, date: "2026-03-05", note: "Semana 1" });
  await seedAdvance("ant-beto", { rut: BETO.id, amount: 60000, date: "2026-03-05" });
  return payroll.id;
}

async function recalc(payrollId) {
  const payroll = await get("payrolls", payrollId);
  const plan = await planPayrollRecalc(payroll, {
    cycles: await all("cycles"),
    faenas: await all("faenas"),
    subfaenas: await all("subfaenas"),
    workers: await all("worker"),
  });
  await applyPayrollRecalc(payrollId, plan);
  return plan;
}

const itemOf = (payroll, rut) => (payroll.items || []).find((it) => it.rut === rut);

describe("entregar anticipos en una nómina", () => {
  it("suma lo entregado a quien ya está y hace entrar a quien no, con los datos de su ficha", async () => {
    const id = await seedPayroll();
    const plan = await deliverAdvances(id, { advanceIds: ["ant-ana", "ant-beto"], cycleId: CICLO_B });
    expect(plan.total).toBe(100000);

    const p = await get("payrolls", id);
    const ana = itemOf(p, ANA.id);
    expect(ana.amount).toBe(340000);
    expect(ana.grossAmount).toBe(300000);
    expect(ana.advance).toBe(0);
    expect(ana.payoutTotal).toBe(40000);
    expect(ana.payoutApplications).toEqual([
      { advanceId: "ant-ana", amount: 40000, cycleId: CICLO_B, date: "2026-03-05", note: "Semana 1" },
    ]);
    const beto = itemOf(p, BETO.id);
    expect(beto).toMatchObject({
      name: BETO.name,
      bankCode: "EFE",
      groupLeader: "GRUPO B",
      grossAmount: 0,
      amount: 60000,
      payoutTotal: 60000,
      workdayIds: [],
    });
    expect(p.total).toBe(400000);
    expect(p.bankTotal).toBe(340000);
    expect(p.cashTotal).toBe(60000);
    expect(p.payoutTotal).toBe(100000);
    expect(p.workerCount).toBe(2);
    expect(p.payoutCycleDetails).toEqual([
      { id: CICLO_B, label: `Faena Uno/Sub Uno/${CICLO_B}`, faenaId: "faena-1", faenaName: "Faena Uno", subfaenaId: "sub-1", subfaenaName: "Sub Uno" },
    ]);

    // El anticipo sigue pendiente, marcado con la nómina y el ciclo.
    const adv = await get("advances", "ant-beto");
    expect(adv.status).toBe("pending");
    expect(adv.amountPaid).toBe(0);
    expect(adv.payoutPayrollId).toBe(id);
    expect(adv.payoutCycleId).toBe(CICLO_B);
    expect(adv.payoutAt).toBeTruthy();

    const snap = await get("payrollSnapshots", id);
    expect(snap.workers).toHaveLength(2);
    expect(snap.payroll.total).toBe(400000);
    expect(snap.payroll.payoutTotal).toBe(100000);
  });

  it("no entrega un anticipo ya entregado, ya descontado, ni con las transferencias pagadas", async () => {
    const id = await seedPayroll();
    await deliverAdvances(id, { advanceIds: ["ant-ana"], cycleId: CICLO_B });
    await expect(deliverAdvances(id, { advanceIds: ["ant-ana"], cycleId: CICLO_B })).rejects.toThrow(/ya se entrega/i);

    await seedAdvance("ant-parcial", { rut: BETO.id, amount: 50000, status: "partial", amountPaid: 10000 });
    await expect(deliverAdvances(id, { advanceIds: ["ant-parcial"], cycleId: CICLO_B })).rejects.toThrow(/descontó/i);

    await markBankPaid(id);
    await expect(deliverAdvances(id, { advanceIds: ["ant-beto"], cycleId: CICLO_B })).rejects.toThrow(/transferencias/i);
    expect((await get("advances", "ant-beto")).payoutPayrollId).toBeUndefined();
  });

  it("Recalcular no le descuenta a la nómina lo que ella entrega, ni saca a quien entró solo por su anticipo", async () => {
    const id = await seedPayroll();
    await deliverAdvances(id, { advanceIds: ["ant-ana", "ant-beto"], cycleId: CICLO_B });

    const plan = await recalc(id);
    expect(plan.leavingWorkers || []).toEqual([]);
    let p = await get("payrolls", id);
    expect(itemOf(p, ANA.id).advance).toBe(0);
    expect(itemOf(p, ANA.id).amount).toBe(340000);
    expect(itemOf(p, BETO.id).amount).toBe(60000);
    expect((await get("advances", "ant-ana")).amountPaid).toBe(0);

    // Si baja la producción de Ana, su líquido conserva lo entregado.
    const wd = (await all("workdays")).find((w) => w.workerRut === ANA.id);
    const { id: workdayId, ...data } = wd;
    await set("workdays", workdayId, { ...data, amount: 200000 });
    await recalc(id);
    p = await get("payrolls", id);
    expect(itemOf(p, ANA.id).grossAmount).toBe(200000);
    expect(itemOf(p, ANA.id).amount).toBe(240000);
    expect(p.payoutTotal).toBe(100000);
    expect(p.total).toBe(300000);
  });

  it("otra nómina descuenta el anticipo entregado como cualquier pendiente", async () => {
    const id = await seedPayroll();
    await deliverAdvances(id, { advanceIds: ["ant-beto"], cycleId: CICLO_B });

    const pending = await listPendingForWorkers([BETO.id]);
    expect(pending.map((a) => a.id)).toEqual(["ant-beto"]);
    await applyAdvancesToPayroll([{ advanceId: "ant-beto", amount: 60000 }], "nomina-2");
    const adv = await get("advances", "ant-beto");
    expect(adv.status).toBe("applied");
    expect(adv.payoutPayrollId).toBe(id);
  });

  it("quita varias entregas en un solo paso; quien estaba solo por la suya sale", async () => {
    const id = await seedPayroll();
    await seedAdvance("ant-ana-2", { rut: ANA.id, amount: 10000, date: "2026-03-06" });
    await deliverAdvances(id, { advanceIds: ["ant-ana", "ant-ana-2", "ant-beto"], cycleId: CICLO_B });

    const plan = await removeAdvancePayouts(id, {
      entries: [
        { rut: BETO.id, advanceId: "ant-beto" },
        { rut: ANA.id, advanceId: "ant-ana" },
      ],
    });
    expect(plan.removed).toHaveLength(2);
    expect(plan.removedTotal).toBe(100000);
    expect(plan.leaving).toEqual([BETO.name]);

    let p = await get("payrolls", id);
    expect(itemOf(p, BETO.id)).toBeUndefined();
    expect(itemOf(p, ANA.id).amount).toBe(310000);
    expect(itemOf(p, ANA.id).payoutTotal).toBe(10000);
    expect(p.total).toBe(310000);
    expect(p.payoutTotal).toBe(10000);
    expect((await get("advances", "ant-beto")).payoutPayrollId).toBeNull();
    expect((await get("advances", "ant-ana")).payoutPayrollId).toBeNull();
    expect((await get("advances", "ant-ana-2")).payoutPayrollId).toBe(id);
    expect((await get("payrollSnapshots", id)).workers).toHaveLength(1);

    await removeAdvancePayouts(id, { entries: [{ rut: ANA.id, advanceId: "ant-ana-2" }] });
    p = await get("payrolls", id);
    expect(itemOf(p, ANA.id).amount).toBe(300000);
    expect(p.payoutTotal).toBe(0);
    expect(p.payoutCycleDetails).toEqual([]);

    await expect(removeAdvancePayouts(id, { entries: [{ rut: ANA.id, advanceId: "ant-ana" }] })).rejects.toThrow(/ya no están/i);
  });

  it("sacar a la persona de la nómina suelta lo que se le entregaba", async () => {
    const id = await seedPayroll();
    await deliverAdvances(id, { advanceIds: ["ant-ana"], cycleId: CICLO_B });
    await removeWorkerFromPayroll(id, ANA.id);
    expect((await get("advances", "ant-ana")).payoutPayrollId).toBeNull();
    expect((await get("payrolls", id)).payoutTotal).toBe(0);
  });

  it("un anticipo entregado no se elimina ni cambia de monto desde Anticipos, pero sí su nota", async () => {
    const id = await seedPayroll();
    await deliverAdvances(id, { advanceIds: ["ant-ana"], cycleId: CICLO_B });
    const shown = await get("advances", "ant-ana");
    await expect(removeAdvance(shown)).rejects.toThrow(/nómina entrega/i);
    await expect(updateAdvance(shown, { amount: 90000 })).rejects.toThrow(/nómina entrega/i);
    await updateAdvance(shown, { amount: 40000, note: "Semana 1 corregida" });
    expect((await get("advances", "ant-ana")).note).toBe("Semana 1 corregida");
  });
});
