import { describe, it, expect, vi } from "vitest";

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const { payoutBlockReason, payoutCandidates, planPayouts, planPayoutRemoval, payoutsByCycle, payoutTotalOf } = await import(
  "./advancePayouts"
);
const { allocateAdvances, advanceTopUps, planRecalcExisting, recalcNeedsRefit, refitAppliedAdvances, planAddWorkdays } =
  await import("./payrollItem");

const advance = (over = {}) => ({
  id: "a1",
  type: "anticipo",
  workerRut: "11111111-1",
  workerName: "Ana Rojas",
  amount: 50000,
  amountPaid: 0,
  status: "pending",
  date: "2026-11-10",
  note: "Semana 2",
  ...over,
});

const item = (over = {}) => ({
  rut: "11111111-1",
  workerId: "11111111-1",
  name: "Ana Rojas",
  grossAmount: 100000,
  advance: 0,
  bonus: 0,
  amount: 100000,
  anticipoApplications: [],
  bonoApplications: [],
  advanceIds: [],
  workdayIds: ["w1"],
  byCycle: { c1: 100000 },
  ...over,
});

describe("payoutBlockReason", () => {
  it("deja entregar solo un anticipo pendiente, sin descuentos y sin entregar", () => {
    expect(payoutBlockReason(advance())).toBe("");
    expect(payoutBlockReason(null)).not.toBe("");
    expect(payoutBlockReason(advance({ type: "bono" }))).not.toBe("");
    expect(payoutBlockReason(advance({ payoutPayrollId: "p9" }))).not.toBe("");
    expect(payoutBlockReason(advance({ status: "partial", amountPaid: 10000 }))).not.toBe("");
    expect(payoutBlockReason(advance({ status: "applied", amountPaid: 50000 }))).not.toBe("");
  });
});

describe("payoutCandidates", () => {
  it("trae los anticipos entregables de quienes trabajaron en el ciclo", () => {
    const rows = payoutCandidates({
      advances: [
        advance(),
        advance({ id: "a2", workerRut: "22222222-2", workerName: "Beto Soto" }),
        advance({ id: "a3", workerRut: "33333333-3", workerName: "Otro Ciclo" }),
        advance({ id: "a4", status: "partial", amountPaid: 1000 }),
        advance({ id: "b1", type: "bono" }),
      ],
      workdays: [{ workerRut: "11111111-1" }, { workerId: "22222222-2", workerRut: "22222222-2" }],
      items: [item()],
    });
    expect(rows.map((r) => r.advanceId)).toEqual(["a1", "a2"]);
    expect(rows.map((r) => r.inPayroll)).toEqual([true, false]);
  });
});

describe("planPayouts", () => {
  it("a quien ya está le suma lo entregado al líquido, sin tocar bruto ni descuentos", () => {
    const { items, added } = planPayouts({ items: [item()], advances: [advance()], cycleId: "c9" });
    expect(items).toHaveLength(1);
    expect(items[0].amount).toBe(150000);
    expect(items[0].grossAmount).toBe(100000);
    expect(items[0].payoutTotal).toBe(50000);
    expect(items[0].payoutApplications).toEqual([
      { advanceId: "a1", amount: 50000, cycleId: "c9", date: "2026-11-10", note: "Semana 2" },
    ]);
    expect(added).toEqual([
      { key: "11111111-1", rut: "11111111-1", name: "Ana Rojas", isNew: false, amount: 50000, oldNet: 100000, newNet: 150000 },
    ]);
  });

  it("quien no está entra con bruto $0 y los datos de su ficha", () => {
    const adv = advance({ id: "a2", workerRut: "22222222-2", workerName: "Beto Soto", amount: 30000 });
    const { items, added } = planPayouts({
      items: [item()],
      advances: [adv],
      cycleId: "c9",
      profileFor: () => ({ workerId: "22222222-2", rut: "22222222-2", name: "Beto Soto", bankCode: "EFE", groupLeader: "Grupo A" }),
    });
    expect(items).toHaveLength(2);
    expect(items[1]).toMatchObject({
      rut: "22222222-2",
      workerId: "22222222-2",
      name: "Beto Soto",
      bankCode: "EFE",
      groupLeader: "Grupo A",
      grossAmount: 0,
      amount: 30000,
      payoutTotal: 30000,
      workdayIds: [],
    });
    expect(added[0]).toMatchObject({ isNew: true, oldNet: 0, newNet: 30000 });
  });

  it("junta dos anticipos de la misma persona y no repite uno ya entregado", () => {
    const first = planPayouts({ items: [item()], advances: [advance(), advance({ id: "a5", amount: 20000 })], cycleId: "c9" });
    expect(first.items[0].payoutTotal).toBe(70000);
    expect(first.added).toHaveLength(1);
    expect(first.added[0].amount).toBe(70000);
    const again = planPayouts({ items: first.items, advances: [advance()], cycleId: "c9" });
    expect(again.items[0].payoutTotal).toBe(70000);
    expect(again.added).toEqual([]);
  });
});

describe("planPayoutRemoval", () => {
  const withPayout = planPayouts({ items: [item()], advances: [advance()], cycleId: "c9" }).items;

  it("quita la entrega y baja el líquido; quien tiene jornadas se queda", () => {
    const plan = planPayoutRemoval({ items: withPayout, rut: "11111111-1", advanceIds: ["a1"] });
    expect(plan.leaves).toBe(false);
    expect(plan.items[0].amount).toBe(100000);
    expect(plan.items[0].payoutTotal).toBe(0);
    expect(plan.removedTotal).toBe(50000);
  });

  it("quien estaba solo por la entrega sale y suelta sus bonos", () => {
    const only = planPayouts({
      items: [],
      advances: [advance()],
      cycleId: "c9",
    }).items.map((it) => ({ ...it, bonus: 5000, amount: it.amount + 5000, advanceIds: ["b1"], bonoApplications: [{ advanceId: "b1", amount: 5000 }] }));
    const plan = planPayoutRemoval({ items: only, rut: "11111111-1", advanceIds: ["a1"] });
    expect(plan.leaves).toBe(true);
    expect(plan.items).toEqual([]);
    expect(plan.releasedAdvanceIds).toEqual(["b1"]);
  });

  it("sin esa entrega no hay nada que quitar", () => {
    expect(planPayoutRemoval({ items: withPayout, rut: "11111111-1", advanceIds: ["zz"] })).toBeNull();
    expect(planPayoutRemoval({ items: withPayout, rut: "99999999-9", advanceIds: ["a1"] })).toBeNull();
  });
});

describe("los totales de lo entregado", () => {
  it("suma por ciclo asociado y en total", () => {
    const a = planPayouts({ items: [item()], advances: [advance()], cycleId: "c9" }).items;
    const b = planPayouts({ items: a, advances: [advance({ id: "a6", amount: 10000 })], cycleId: "c8" }).items;
    expect(payoutsByCycle(b)).toEqual([
      { cycleId: "c9", amount: 50000, count: 1 },
      { cycleId: "c8", amount: 10000, count: 1 },
    ]);
    expect(payoutTotalOf(b)).toBe(60000);
  });
});

describe("lo entregado en el resto del cálculo de la nómina", () => {
  const paidOut = item({ payoutTotal: 50000, amount: 150000, payoutApplications: [{ advanceId: "a1", amount: 50000 }] });

  it("el reparto y el re-encaje lo suman al líquido sin engrosar la base", () => {
    const debt = advance({ id: "a7", amount: 400000 });
    const reparto = allocateAdvances({ gross: 100000, anticipos: [debt], payout: 50000 });
    expect(reparto.anticiposTotal).toBe(100000);
    expect(reparto.amount).toBe(50000);
    const refit = refitAppliedAdvances({
      gross: 60000,
      applied: [{ advanceId: "a7", kind: "anticipo", amount: 100000 }],
      payout: 50000,
    });
    expect(refit.anticiposTotal).toBe(60000);
    expect(refit.amount).toBe(50000);
  });

  it("un anticipo que el bruto limitaba crece aunque el líquido lleve lo entregado", () => {
    const limited = item({
      grossAmount: 100000,
      advance: 100000,
      amount: 50000,
      payoutTotal: 50000,
      anticipoApplications: [{ advanceId: "a7", amount: 100000 }],
      advanceIds: ["a7"],
    });
    const debt = advance({ id: "a7", amount: 400000, amountPaid: 100000, status: "partial", payments: [{ payrollId: "p1", amount: 100000 }] });
    const topUps = advanceTopUps({ item: limited, applied: limited.anticipoApplications, anticipos: [debt], payrollId: "p1" });
    expect(topUps).toEqual([{ advanceId: "a7", date: "2026-11-10", room: 300000 }]);
  });

  it("al recalcular, quien queda sin jornadas se queda si la nómina le entrega un anticipo", () => {
    expect(recalcNeedsRefit(paidOut, undefined)).toBe(true);
    const { patches, leaving } = planRecalcExisting({ items: [paidOut], freshByKey: new Map() });
    expect(leaving).toEqual([]);
    const patch = patches.get("11111111-1");
    expect(patch.grossAmount).toBe(0);
    expect(patch.workdayIds).toEqual([]);
    expect(patch.amount).toBe(50000);
    expect(patch.payoutTotal).toBe(50000);
    expect(recalcNeedsRefit(patch, undefined)).toBe(false);
  });

  it("al recalcular con jornadas, el líquido conserva lo entregado", () => {
    const fresh = { total: 80000, byCycle: { c1: 80000 }, workdayIds: ["w1"] };
    const { patches } = planRecalcExisting({ items: [paidOut], freshByKey: new Map([["11111111-1", fresh]]) });
    expect(patches.get("11111111-1").amount).toBe(130000);
  });

  it("agregarle días no le descuenta el anticipo que la misma nómina le entrega", () => {
    const delivered = advance({ payoutPayrollId: "p1" });
    const plan = planAddWorkdays({
      payrollId: "p1",
      items: [paidOut],
      workdays: [{ id: "w2", rut: "11111111-1", workerId: "11111111-1", cycleId: "c1", laborId: "l1", amount: 20000 }],
      laborTypeById: new Map([["l1", "trato"]]),
      pendingAdvances: [delivered],
    });
    expect(plan.items[0].advance).toBe(0);
    expect(plan.items[0].payoutTotal).toBe(50000);
    expect(plan.items[0].amount).toBe(plan.items[0].grossAmount + 50000);
  });
});
