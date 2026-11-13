import { describe, it, expect } from "vitest";
import { recalcPayrollAggregates, markBankPaid } from "../../src/services/payrollsService";
import { changePayrollBonus } from "../../src/services/payrollBonusChange";
import { ANA, BETO, set, get, seedAdvance } from "./helpers/seed";

// Cambiar el monto de un bono que una nómina pendiente ya aplica, sin sacar a
// la persona: la nómina, el bono, los anticipos y el JSON quedan como si el
// bono hubiera valido eso desde el principio.

const PAYROLL = "nomina-1";
const paid = (amount) => ({ payrollId: PAYROLL, amount, paidAt: "2026-11-01T12:00:00.000Z" });

// Ana (banco): bruto 100.000, bono de 20.000 y un anticipo de 150.000 del que
// se descuentan 120.000 (neto 0). Beto (efectivo): bruto 50.000 y un bono de
// 10.000.
async function seedPayroll() {
  await seedAdvance("bono-ana", { rut: ANA.id, type: "bono", amount: 20000, status: "applied", amountPaid: 20000, payments: [paid(20000)], appliedPayrollId: PAYROLL });
  await seedAdvance("ant-ana", { rut: ANA.id, amount: 150000, date: "2026-10-01", status: "partial", amountPaid: 120000, payments: [paid(120000)], appliedPayrollId: PAYROLL });
  await seedAdvance("bono-beto", { rut: BETO.id, type: "bono", amount: 10000, status: "applied", amountPaid: 10000, payments: [paid(10000)], appliedPayrollId: PAYROLL });
  const items = [
    {
      rut: ANA.id, workerId: ANA.id, name: ANA.name, bankCode: ANA.bankCode,
      grossAmount: 100000, advance: 120000, bonus: 20000, amount: 0,
      anticipoApplications: [{ advanceId: "ant-ana", amount: 120000 }],
      bonoApplications: [{ advanceId: "bono-ana", amount: 20000 }],
      advanceApplications: [{ advanceId: "ant-ana", amount: 120000 }, { advanceId: "bono-ana", amount: 20000 }],
      advanceIds: ["ant-ana", "bono-ana"],
      workdayIds: [],
    },
    {
      rut: BETO.id, workerId: BETO.id, name: BETO.name, bankCode: BETO.bankCode,
      grossAmount: 50000, advance: 0, bonus: 10000, amount: 60000,
      anticipoApplications: [],
      bonoApplications: [{ advanceId: "bono-beto", amount: 10000 }],
      advanceApplications: [{ advanceId: "bono-beto", amount: 10000 }],
      advanceIds: ["bono-beto"],
      workdayIds: [],
    },
  ];
  await set("payrolls", PAYROLL, { name: "Nómina", status: "pending", ...recalcPayrollAggregates(items) });
  await set("payrollSnapshots", PAYROLL, {
    payroll: { id: PAYROLL, total: 60000 },
    workers: items,
    advances: [
      { id: "bono-ana", type: "bono", amount: 20000, amountPaid: 20000 },
      { id: "ant-ana", type: "anticipo", amount: 150000, amountPaid: 120000 },
      { id: "bono-beto", type: "bono", amount: 10000, amountPaid: 10000 },
    ],
  });
}

describe("cambiar el bono de una persona en la nómina", () => {
  it("un bono que sube solo suma al líquido: el anticipo no crece", async () => {
    await seedPayroll();
    await changePayrollBonus(PAYROLL, { rut: ANA.id, bonusId: "bono-ana", newAmount: 35000 });

    const p = await get("payrolls", PAYROLL);
    const ana = p.items.find((it) => it.rut === ANA.id);
    expect(ana.bonus).toBe(35000);
    expect(ana.advance).toBe(120000);
    expect(ana.amount).toBe(15000);
    expect(p.total).toBe(75000);
    expect(p.bankTotal).toBe(15000);

    const bono = await get("advances", "bono-ana");
    expect(bono.amount).toBe(35000);
    expect(bono.amountPaid).toBe(35000);
    expect(bono.status).toBe("applied");
    expect(bono.payments).toEqual([paid(35000)]);
    expect((await get("advances", "ant-ana")).amountPaid).toBe(120000);

    const snap = await get("payrollSnapshots", PAYROLL);
    expect(snap.payroll.total).toBe(75000);
    expect(snap.advances.find((a) => a.id === "bono-ana").amount).toBe(35000);
    expect(snap.workers.find((w) => w.rut === ANA.id).amount).toBe(15000);
  });

  it("un bono que baja deja parcial el anticipo que ya no cabe", async () => {
    await seedPayroll();
    const plan = await changePayrollBonus(PAYROLL, { rut: ANA.id, bonusId: "bono-ana", newAmount: 5000 });
    expect(plan.returned).toBe(15000);

    const ana = (await get("payrolls", PAYROLL)).items.find((it) => it.rut === ANA.id);
    expect(ana.bonus).toBe(5000);
    expect(ana.advance).toBe(105000);
    expect(ana.amount).toBe(0);

    const anticipo = await get("advances", "ant-ana");
    expect(anticipo.amountPaid).toBe(105000);
    expect(anticipo.status).toBe("partial");
    expect(anticipo.payments).toEqual([paid(105000)]);
  });

  it("con las transferencias pagadas, cambia el de efectivo y no el de banco", async () => {
    await seedPayroll();
    await markBankPaid(PAYROLL);
    await expect(changePayrollBonus(PAYROLL, { rut: ANA.id, bonusId: "bono-ana", newAmount: 30000 })).rejects.toThrow(/transferencias/);

    await changePayrollBonus(PAYROLL, { rut: BETO.id, bonusId: "bono-beto", newAmount: 15000 });
    const p = await get("payrolls", PAYROLL);
    expect(p.cashTotal).toBe(65000);
    expect(p.bankTotal).toBe(0);
  });

  it("la nota se edita junto con el monto, o sola sin tocar la nómina", async () => {
    await seedPayroll();
    await changePayrollBonus(PAYROLL, { rut: BETO.id, bonusId: "bono-beto", newAmount: 12000, note: "BONO DE PRODUCCION" });
    let bono = await get("advances", "bono-beto");
    expect(bono.amount).toBe(12000);
    expect(bono.note).toBe("Bono de Produccion");

    const before = await get("payrolls", PAYROLL);
    const plan = await changePayrollBonus(PAYROLL, { rut: BETO.id, bonusId: "bono-beto", newAmount: 12000, note: "Bono por asistencia" });
    expect(plan.amountChanged).toBe(false);
    bono = await get("advances", "bono-beto");
    expect(bono.note).toBe("Bono por Asistencia");
    expect(bono.amount).toBe(12000);
    const after = await get("payrolls", PAYROLL);
    expect(after.updatedAt).toEqual(before.updatedAt);
    expect((await get("payrollSnapshots", PAYROLL)).advances.find((a) => a.id === "bono-beto").note).toBe("Bono por Asistencia");
  });

  it("el monto nuevo tiene que ser distinto y mayor que lo pagado en otras nóminas", async () => {
    await seedPayroll();
    await expect(changePayrollBonus(PAYROLL, { rut: ANA.id, bonusId: "bono-ana", newAmount: 20000 })).rejects.toThrow(/ni el monto ni la nota/);
    await expect(changePayrollBonus(PAYROLL, { rut: ANA.id, bonusId: "bono-ana", newAmount: 0 })).rejects.toThrow(/monto del bono/);
  });
});
