import { describe, it, expect, vi } from "vitest";

// `payrollItem` importa helpers puros de `advancesService`, que importa
// `../firebase`.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const { planAdvanceRemoval } = await import("./payrollAdvanceRemoval");

// Un item como lo deja "Generar y guardar".
function item({ rut = "ANA", gross, anticipos = [], bonos = [], payoutTotal = 0 }) {
  const advance = anticipos.reduce((s, a) => s + a.amount, 0);
  const bonus = bonos.reduce((s, a) => s + a.amount, 0);
  const apps = [...anticipos, ...bonos];
  return {
    rut, workerId: rut, name: rut, bankCode: "012",
    grossAmount: gross, advance, bonus, anticiposTotal: advance, bonosTotal: bonus,
    amount: gross - advance + bonus + payoutTotal,
    payoutTotal,
    workdayIds: [`${rut}-1`],
    anticipoApplications: anticipos, bonoApplications: bonos,
    advanceApplications: apps, advanceIds: apps.map((x) => x.advanceId),
  };
}

// Lo que la nómina descuenta hoy de cada anticipo, como lo lee
// `readPayrollApplications`.
const applied = (list) =>
  new Map(list.map(([advanceId, kind, amount, date = "2026-01-01"]) => [advanceId, { advanceId, kind, amount, date }]));

describe("planAdvanceRemoval", () => {
  it("quitar un anticipo le devuelve a la persona lo descontado", () => {
    const items = [item({ gross: 300000, anticipos: [{ advanceId: "cuota", amount: 30000 }, { advanceId: "otro", amount: 20000 }] })];
    const plan = planAdvanceRemoval({
      items,
      entries: [{ rut: "ANA", advanceId: "cuota" }],
      appliedByAdvance: applied([["cuota", "anticipo", 30000], ["otro", "anticipo", 20000]]),
    });
    expect(plan.items[0]).toMatchObject({ advance: 20000, amount: 280000, advanceIds: ["otro"] });
    expect(plan.targets).toEqual([
      { advanceId: "cuota", amount: 0 },
      { advanceId: "otro", amount: 20000 },
    ]);
    expect(plan.people).toEqual([
      { rut: "ANA", name: "ANA", removed: [{ advanceId: "cuota", kind: "anticipo", amount: 30000 }], returned: 0, oldNet: 250000, newNet: 280000 },
    ]);
    expect(plan.removedIds).toEqual(["cuota"]);
  });

  it("quitar un bono baja el líquido, y el anticipo que ya no cabe se achica", () => {
    // Bruto 50.000 + bono 30.000 contra un anticipo de 80.000: neto 0. Sin el
    // bono, del anticipo caben 50.000 y 30.000 vuelven a quedar pendientes.
    const items = [item({ gross: 50000, anticipos: [{ advanceId: "ant", amount: 80000 }], bonos: [{ advanceId: "bono", amount: 30000 }] })];
    const plan = planAdvanceRemoval({
      items,
      entries: [{ rut: "ANA", advanceId: "bono" }],
      appliedByAdvance: applied([["ant", "anticipo", 80000], ["bono", "bono", 30000]]),
    });
    expect(plan.items[0]).toMatchObject({ advance: 50000, bonus: 0, amount: 0, advanceIds: ["ant"] });
    expect(plan.targets).toEqual([
      { advanceId: "bono", amount: 0 },
      { advanceId: "ant", amount: 50000 },
    ]);
    expect(plan.people[0]).toMatchObject({ returned: 30000, oldNet: 0, newNet: 0 });
  });

  it("lo entregado sigue en el líquido", () => {
    const items = [item({ gross: 100000, anticipos: [{ advanceId: "ant", amount: 40000 }], payoutTotal: 25000 })];
    const plan = planAdvanceRemoval({
      items,
      entries: [{ rut: "ANA", advanceId: "ant" }],
      appliedByAdvance: applied([["ant", "anticipo", 40000]]),
    });
    expect(plan.items[0].amount).toBe(125000);
  });

  it("quita de varias personas a la vez y deja a las demás como están", () => {
    const items = [
      item({ rut: "ANA", gross: 100000, anticipos: [{ advanceId: "a1", amount: 10000 }] }),
      item({ rut: "BEA", gross: 100000, bonos: [{ advanceId: "b1", amount: 5000 }] }),
      item({ rut: "CAR", gross: 100000, anticipos: [{ advanceId: "c1", amount: 7000 }] }),
    ];
    const plan = planAdvanceRemoval({
      items,
      entries: [{ rut: "ANA", advanceId: "a1" }, { rut: "BEA", advanceId: "b1" }],
      appliedByAdvance: applied([["a1", "anticipo", 10000], ["b1", "bono", 5000]]),
    });
    expect(plan.items.map((it) => it.amount)).toEqual([100000, 100000, 93000]);
    expect(plan.items[2]).toBe(items[2]);
    expect(plan.removedIds).toEqual(["a1", "b1"]);
  });

  it("un anticipo cuyo documento ya no existe se quita del item sin escribirlo", () => {
    const items = [item({ gross: 100000, anticipos: [{ advanceId: "borrado", amount: 10000 }] })];
    const plan = planAdvanceRemoval({ items, entries: [{ rut: "ANA", advanceId: "borrado" }] });
    expect(plan.items[0]).toMatchObject({ advance: 0, amount: 100000, advanceIds: [] });
    expect(plan.targets).toEqual([]);
  });

  it("sin nada que quitar devuelve null", () => {
    const items = [item({ gross: 100000 })];
    expect(planAdvanceRemoval({ items, entries: [{ rut: "ANA", advanceId: "x" }] })).toBe(null);
    expect(planAdvanceRemoval({ items, entries: [{ rut: "NADIE", advanceId: "x" }] })).toBe(null);
  });
});
