import { describe, it, expect, vi } from "vitest";

// `payrollItem` importa helpers puros de `advancesService`, que importa
// `../firebase`.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const { refitAppliedAdvances, appliedFromItem, planRecalcExisting, isOverApplied } =
  await import("./payrollItem");

// Lo que una nómina le aplica a un anticipo / bono, tal como lo devuelve
// `readPayrollApplications`.
const ant = (advanceId, amount, date = "2026-01-01") => ({ advanceId, kind: "anticipo", amount, date });
const bon = (advanceId, amount, date = "2026-01-01") => ({ advanceId, kind: "bono", amount, date });
const leidos = (...xs) => new Map(xs.map((x) => [x.advanceId, x]));

// Un item con la forma que deja "Generar y guardar". `byCycle` lleva una entrada
// por cada ciclo de la nómina, incluso en $0, igual que en la pantalla.
function item({ rut = "P", gross, byCycle, workdayIds, anticipos = [], bonos = [] }) {
  const advance = anticipos.reduce((s, a) => s + a.amount, 0);
  const bonus = bonos.reduce((s, b) => s + b.amount, 0);
  return {
    rut,
    name: `Persona ${rut}`,
    grossAmount: gross,
    advance,
    bonus,
    amount: Math.max(0, gross - advance + bonus),
    byCycle,
    workdayIds,
    anticipoApplications: anticipos.map(({ advanceId, amount }) => ({ advanceId, amount })),
    bonoApplications: bonos.map(({ advanceId, amount }) => ({ advanceId, amount })),
    advanceIds: [...anticipos, ...bonos].map((x) => x.advanceId),
  };
}

const wd = (ciclo, rut, dia) => `${ciclo}__labor__${rut}__2026-03-0${dia}`;

describe("refitAppliedAdvances — re-encajar lo aplicado en un bruto que bajó", () => {
  it("si el bruto nuevo alcanza, no cambia nada", () => {
    const r = refitAppliedAdvances({ gross: 200000, applied: [ant("a1", 100000)] });
    expect(r).toMatchObject({ anticiposTotal: 100000, devuelto: 0, amount: 100000 });
    expect(r.targets).toEqual([{ advanceId: "a1", amount: 100000, missing: false }]);
  });

  it("cobertura parcial: el anticipo se achica a lo que cabe y el resto vuelve", () => {
    // Bruto 50.000 contra un anticipo de 100.000 ya aplicado: se aplican 50.000
    // y los otros 50.000 vuelven a quedar pendientes.
    const r = refitAppliedAdvances({ gross: 50000, applied: [ant("a1", 100000)] });
    expect(r).toMatchObject({ anticiposTotal: 50000, devuelto: 50000, amount: 0 });
    expect(r.targets).toEqual([{ advanceId: "a1", amount: 50000, missing: false }]);
  });

  it("con bruto 0 suelta el anticipo entero", () => {
    const r = refitAppliedAdvances({ gross: 0, applied: [ant("a1", 100000)] });
    expect(r).toMatchObject({ anticiposTotal: 0, devuelto: 100000, amount: 0 });
    expect(r.anticipoApplications).toEqual([]);
    expect(r.targets).toEqual([{ advanceId: "a1", amount: 0, missing: false }]);
  });

  it("con varios anticipos se achica primero el más nuevo", () => {
    // Mismo orden que armar la nómina: se llenan del más viejo al más nuevo.
    const r = refitAppliedAdvances({
      gross: 70000,
      applied: [ant("nuevo", 40000, "2026-02-01"), ant("viejo", 50000, "2026-01-01")],
    });
    expect(r.anticipoApplications).toEqual([
      { advanceId: "viejo", amount: 50000 },
      { advanceId: "nuevo", amount: 20000 },
    ]);
    expect(r.devuelto).toBe(20000);
    expect(r.amount).toBe(0);
  });

  it("los bonos quedan enteros y engrosan la base contra la que se descuenta", () => {
    // Bruto 50.000 + bono 30.000 = base 80.000 contra un anticipo de 100.000.
    const r = refitAppliedAdvances({
      gross: 50000,
      applied: [ant("a1", 100000), bon("b1", 30000)],
    });
    expect(r.bonoApplications).toEqual([{ advanceId: "b1", amount: 30000 }]);
    expect(r.anticipoApplications).toEqual([{ advanceId: "a1", amount: 80000 }]);
    expect(r).toMatchObject({ devuelto: 20000, amount: 0 });
  });

  it("nunca agranda un monto ya aplicado", () => {
    // Una cuota de 30.000 sobre un bruto que sobra: sigue siendo 30.000. Subirla
    // pediría volver a mirar el saldo y el plan de cuotas del anticipo.
    const r = refitAppliedAdvances({ gross: 900000, applied: [ant("cuota", 30000)] });
    expect(r.anticipoApplications).toEqual([{ advanceId: "cuota", amount: 30000 }]);
  });

  it("el neto nunca da negativo y cuadra sin topes escondidos", () => {
    for (const gross of [0, 1, 49999, 50000, 50001, 250000]) {
      const r = refitAppliedAdvances({
        gross,
        applied: [ant("a1", 100000), ant("a2", 60000, "2026-02-01"), bon("b1", 15000)],
      });
      expect(r.amount).toBeGreaterThanOrEqual(0);
      expect(r.amount).toBe(gross - r.anticiposTotal + r.bonosTotal);
    }
  });
});

describe("appliedFromItem — de dónde sale lo aplicado", () => {
  it("el payments[] del anticipo manda sobre la copia del item", () => {
    const it = item({ gross: 100000, byCycle: {}, workdayIds: [], anticipos: [ant("a1", 40000)] });
    const r = appliedFromItem(it, leidos(ant("a1", 35000, "2026-01-05")));
    expect(r).toEqual([{ advanceId: "a1", kind: "anticipo", date: "2026-01-05", amount: 35000, order: 0 }]);
  });

  it("si el documento ya no existe, respeta el item y lo marca para no escribirlo", () => {
    const it = item({ gross: 100000, byCycle: {}, workdayIds: [], anticipos: [ant("borrado", 40000)] });
    const r = appliedFromItem(it, new Map());
    expect(r).toEqual([
      { advanceId: "borrado", kind: "anticipo", date: "", amount: 40000, order: 0, missing: true },
    ]);
  });
});

// Producción vigente de un trabajador, con la forma de `aggregateWorkerAmounts`.
const fresco = (rut, total, byCycle, workdayIds) => [rut, { rut, workerId: rut, total, byCycle, workdayIds }];

describe("planRecalcExisting — recalcular cuando la producción bajó", () => {
  it("si la producción no cambió, no toca a nadie", () => {
    const it = item({
      gross: 200000,
      byCycle: { A: 200000 },
      workdayIds: [wd("A", "P", 1)],
      anticipos: [ant("adv", 50000)],
    });
    const plan = planRecalcExisting({
      items: [it],
      freshByKey: new Map([fresco("P", 200000, { A: 200000 }, [wd("A", "P", 1)])]),
    });
    expect(plan.patches.size).toBe(0);
    expect(plan.advanceTargets).toEqual([]);
    expect(plan.amountChanges).toEqual([]);
  });

  it("si la producción baja y no alcanza, el anticipo se achica — sin crear uno nuevo", () => {
    // Producción de 200.000 a 100.000 con 150.000 aplicados: el anticipo baja a
    // 100.000 y los 50.000 restantes vuelven a quedar pendientes en el mismo.
    const it = item({
      gross: 200000,
      byCycle: { A: 200000 },
      workdayIds: [wd("A", "P", 1), wd("A", "P", 2)],
      anticipos: [ant("adv", 150000)],
    });
    const plan = planRecalcExisting({
      items: [it],
      freshByKey: new Map([fresco("P", 100000, { A: 100000 }, [wd("A", "P", 1)])]),
      appliedByAdvance: leidos(ant("adv", 150000)),
    });

    expect(plan.patches.get("P")).toMatchObject({
      grossAmount: 100000,
      advance: 100000,
      amount: 0,
      workdayIds: [wd("A", "P", 1)],
    });
    expect(plan.advanceTargets).toEqual([{ advanceId: "adv", amount: 100000 }]);
    expect(plan.amountChanges[0]).toMatchObject({ oldNet: 50000, newNet: 0, devuelto: 50000 });
  });

  it("quien se quedó sin producción sale de la nómina y suelta sus anticipos", () => {
    const it = item({
      gross: 120000,
      byCycle: { A: 120000 },
      workdayIds: [wd("A", "P", 1)],
      anticipos: [ant("adv", 40000)],
    });
    const plan = planRecalcExisting({
      items: [it],
      freshByKey: new Map(),
      appliedByAdvance: leidos(ant("adv", 40000)),
    });
    expect(plan.leavingKeys.has("P")).toBe(true);
    expect(plan.leaving).toEqual([{ key: "P", rut: "P", name: "Persona P", oldNet: 80000, liberado: 40000 }]);
    expect(plan.advanceTargets).toEqual([{ advanceId: "adv", amount: 0 }]);
  });

  it("[reparación] la nómina que dejó el bug viejo de sacar ciclo se arregla al recalcular", () => {
    // Bruto 0, sin jornadas y con el anticipo aplicado: isOverApplied lo detecta
    // aunque la producción no haya cambiado, y la persona sale.
    const roto = {
      ...item({ gross: 0, byCycle: { B: 0 }, workdayIds: [], anticipos: [ant("adv", 100000)] }),
      amount: 0,
    };
    expect(isOverApplied(roto)).toBe(true);
    const plan = planRecalcExisting({
      items: [roto],
      freshByKey: new Map(),
      appliedByAdvance: leidos(ant("adv", 100000)),
    });
    expect(plan.leavingKeys.has("P")).toBe(true);
    expect(plan.advanceTargets).toEqual([{ advanceId: "adv", amount: 0 }]);
  });

  it("[reparación] cobertura parcial que quedó sobre-aplicada se re-encaja aunque el bruto no cambie", () => {
    // Bruto 50.000 con un anticipo de 100.000 aplicado y neto 0: aunque la
    // producción no cambie, el recálculo devuelve los 50.000 que no se retuvieron.
    const roto = {
      ...item({
        gross: 50000,
        byCycle: { B: 50000 },
        workdayIds: [wd("B", "P", 1)],
        anticipos: [ant("adv", 100000)],
      }),
      amount: 0,
    };
    const plan = planRecalcExisting({
      items: [roto],
      freshByKey: new Map([fresco("P", 50000, { B: 50000 }, [wd("B", "P", 1)])]),
      appliedByAdvance: leidos(ant("adv", 100000)),
    });
    expect(plan.patches.get("P")).toMatchObject({ grossAmount: 50000, advance: 50000, amount: 0 });
    expect(plan.advanceTargets).toEqual([{ advanceId: "adv", amount: 50000 }]);
  });

  it("si la producción sube, lo ya aplicado no crece solo", () => {
    // Crecer pediría volver a mirar el saldo y la cuota del anticipo; lo que
    // haya pendiente lo aplica el resto del recálculo como anticipo nuevo.
    const it = item({
      gross: 100000,
      byCycle: { A: 100000 },
      workdayIds: [wd("A", "P", 1)],
      anticipos: [ant("adv", 30000)],
    });
    const plan = planRecalcExisting({
      items: [it],
      freshByKey: new Map([fresco("P", 300000, { A: 300000 }, [wd("A", "P", 1), wd("A", "P", 2)])]),
      appliedByAdvance: leidos(ant("adv", 30000)),
    });
    expect(plan.patches.get("P")).toMatchObject({ grossAmount: 300000, advance: 30000, amount: 270000 });
  });
});
