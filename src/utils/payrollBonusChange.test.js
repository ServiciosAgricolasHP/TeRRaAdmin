import { describe, it, expect, vi } from "vitest";

vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const { bonusChangeError, bonusLockReason, bonusPaidElsewhere, planBonusChange } = await import("./payrollBonusChange");

const item = (over = {}) => ({
  rut: "11111111-1",
  name: "Ana Rojas",
  grossAmount: 100000,
  advance: 0,
  bonus: 20000,
  amount: 120000,
  anticipoApplications: [],
  bonoApplications: [{ advanceId: "b1", amount: 20000 }],
  advanceIds: ["b1"],
  ...over,
});

describe("planBonusChange", () => {
  it("un bono que sube solo suma al líquido", () => {
    const plan = planBonusChange({ item: item(), bonusId: "b1", newAmount: 35000 });
    expect(plan.bonusBefore).toBe(20000);
    expect(plan.bonusAfter).toBe(35000);
    expect(plan.newNet).toBe(135000);
    expect(plan.item.bonus).toBe(35000);
    expect(plan.item.bonoApplications).toEqual([{ advanceId: "b1", amount: 35000 }]);
    expect(plan.advanceTargets).toEqual([]);
  });

  it("al subir no crece un anticipo que el bruto limitaba", () => {
    const it0 = item({
      grossAmount: 50000,
      advance: 70000,
      amount: 0,
      anticipoApplications: [{ advanceId: "a1", amount: 70000 }],
      advanceIds: ["b1", "a1"],
    });
    const applied = new Map([
      ["b1", { kind: "bono", amount: 20000, date: "2026-11-01" }],
      ["a1", { kind: "anticipo", amount: 70000, date: "2026-10-01" }],
    ]);
    const plan = planBonusChange({ item: it0, appliedByAdvance: applied, bonusId: "b1", newAmount: 40000 });
    expect(plan.item.advance).toBe(70000);
    expect(plan.newNet).toBe(20000);
    expect(plan.advanceTargets).toEqual([]);
  });

  it("al bajar, un anticipo que ya no cabe se descuenta hasta donde alcanza y el resto vuelve", () => {
    const it0 = item({
      grossAmount: 100000,
      advance: 120000,
      amount: 0,
      anticipoApplications: [{ advanceId: "a1", amount: 120000 }],
      advanceIds: ["b1", "a1"],
    });
    const applied = new Map([
      ["b1", { kind: "bono", amount: 20000 }],
      ["a1", { kind: "anticipo", amount: 120000 }],
    ]);
    const plan = planBonusChange({ item: it0, appliedByAdvance: applied, bonusId: "b1", newAmount: 5000 });
    expect(plan.item.advance).toBe(105000);
    expect(plan.newNet).toBe(0);
    expect(plan.returned).toBe(15000);
    expect(plan.advanceChanges).toEqual([{ advanceId: "a1", before: 120000, after: 105000 }]);
    expect(plan.advanceTargets).toEqual([{ advanceId: "a1", amount: 105000 }]);
  });

  it("al bajar, un anticipo que cabe no se toca", () => {
    const it0 = item({
      advance: 30000,
      amount: 90000,
      anticipoApplications: [{ advanceId: "a1", amount: 30000 }],
      advanceIds: ["b1", "a1"],
    });
    const plan = planBonusChange({ item: it0, bonusId: "b1", newAmount: 10000 });
    expect(plan.newNet).toBe(80000);
    expect(plan.advanceTargets).toEqual([]);
  });

  it("lo que pagaron otras nóminas se descuenta de lo que paga esta", () => {
    const plan = planBonusChange({ item: item(), bonusId: "b1", newAmount: 50000, paidElsewhere: 10000 });
    expect(plan.bonusAfter).toBe(40000);
    expect(plan.newNet).toBe(140000);
  });

  it("un anticipo cuyo documento ya no existe no se escribe", () => {
    const it0 = item({
      advance: 120000,
      amount: 0,
      anticipoApplications: [{ advanceId: "a1", amount: 120000 }],
      advanceIds: ["b1", "a1"],
    });
    const plan = planBonusChange({ item: it0, bonusId: "b1", newAmount: 5000 });
    expect(plan.item.advance).toBe(105000);
    expect(plan.advanceTargets).toEqual([]);
  });

  it("un bono que no está en la persona no tiene plan", () => {
    expect(planBonusChange({ item: item(), bonusId: "otro", newAmount: 1000 })).toBeNull();
  });
});

describe("bonusPaidElsewhere y bonusChangeError", () => {
  it("suma lo que pagaron las otras nóminas", () => {
    const bonus = { payments: [{ payrollId: "p1", amount: 10000 }, { payrollId: "p2", amount: 5000 }] };
    expect(bonusPaidElsewhere(bonus, "p2")).toBe(10000);
    expect(bonusPaidElsewhere({}, "p2")).toBe(0);
  });

  it("pide un monto en pesos, mayor que lo pagado en otras nóminas, y que cambie el monto o la nota", () => {
    expect(bonusChangeError(30000, { current: 20000 })).toBe("");
    expect(bonusChangeError("", { current: 20000 })).toBe("Escribe el monto del bono, en pesos.");
    expect(bonusChangeError(0)).toBe("Escribe el monto del bono, en pesos.");
    expect(bonusChangeError(10000, { paidElsewhere: 10000 })).toMatch(/Otras nóminas ya pagaron/);
    expect(bonusChangeError(20000, { current: 20000 })).toBe("No cambiaste ni el monto ni la nota.");
    expect(bonusChangeError(20000, { current: 20000, noteChanged: true })).toBe("");
  });
});

describe("bonusLockReason", () => {
  it("con las transferencias pagadas, solo se cambia el bono de quien cobra en efectivo", () => {
    expect(bonusLockReason({ status: "pending" }, { bankCode: "012" })).toBe("");
    expect(bonusLockReason({ status: "paid" }, { bankCode: "EFE" })).toMatch(/está pagada/);
    expect(bonusLockReason({ status: "pending", bankPaidAt: "2026-11-12" }, { bankCode: "012" })).toMatch(/transferencias/);
    expect(bonusLockReason({ status: "pending", bankPaidAt: "2026-11-12" }, { bankCode: "EFE" })).toBe("");
  });
});
