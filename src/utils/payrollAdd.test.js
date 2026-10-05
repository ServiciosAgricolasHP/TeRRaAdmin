import { describe, it, expect, vi } from "vitest";

// Mismo motivo que `payrollItem.test.js`: el módulo importa helpers puros de
// `advancesService`, que arrastra `../firebase`.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const {
  cycleDetailOf,
  payrollLaborScope,
  inRecalcScope,
  mergeCycleDetails,
  planAddWorkdays,
  workerDayRows,
  asPayrollWorker,
} = await import("./payrollItem");

const tipos = new Map([
  ["L1", "cosecha"],
  ["L2", "main"],
  ["LT", "trato"],
]);

// Una jornada con lo mínimo que miran estas funciones.
const wd = (id, { rut = "ANA", cycleId = "A", laborId = "L1", date = "2026-03-02", amount = 10000, ...resto } = {}) => ({
  id,
  workerRut: rut,
  workerId: rut,
  cycleId,
  laborId,
  date,
  amount,
  ...resto,
});

// Anticipos y bonos pendientes, como los devuelve `listPendingForWorkers`.
const anticipo = (id, rut, amount, extra = {}) => ({
  id, workerRut: rut, workerId: rut, type: "anticipo", amount, amountPaid: 0, status: "pending", date: "2026-01-01", ...extra,
});
const bono = (id, rut, amount) => ({
  id, workerRut: rut, workerId: rut, type: "bono", amount, amountPaid: 0, status: "pending", date: "2026-01-01",
});

// Un item como lo deja "Generar y guardar".
function item({ rut = "ANA", gross, byCycle = {}, workdayIds = [], anticipos = [], bonos = [] }) {
  const advance = anticipos.reduce((s, a) => s + a.amount, 0);
  const bonus = bonos.reduce((s, a) => s + a.amount, 0);
  const apps = [...anticipos, ...bonos];
  return {
    rut, workerId: rut, name: rut, bankCode: "012",
    grossAmount: gross, advance, bonus, anticiposTotal: advance, bonosTotal: bonus,
    amount: gross - advance + bonus,
    byCycle, workdayIds,
    anticipoApplications: anticipos, bonoApplications: bonos,
    advanceApplications: apps, advanceIds: apps.map((x) => x.advanceId),
  };
}

describe("cycleDetailOf", () => {
  it("arma lo que la nómina guarda del ciclo, con el período ordenado", () => {
    const cd = cycleDetailOf(
      { id: "A", label: "F/S/1", faenaId: "f", subfaenaId: "s", days: ["2026-03-05", "2026-03-01", "2026-03-03"] },
      { faenas: [{ id: "f", name: "Faena" }], subfaenas: [{ id: "s", name: "Sub" }] },
    );
    expect(cd).toEqual({
      id: "A", label: "F/S/1",
      faenaId: "f", faenaName: "Faena", subfaenaId: "s", subfaenaName: "Sub",
      firstDay: "2026-03-01", lastDay: "2026-03-05",
    });
  });
});

describe("qué trae Recalcular (alcance por labor)", () => {
  const scope = payrollLaborScope([
    { id: "A", laborIds: ["L1"] },
    { id: "B", laborIds: [] },
    { id: "C" },
  ]);

  it("lo ya etiquetado con esta nómina entra siempre, aunque sea de una labor fuera del alcance", () => {
    expect(inRecalcScope(wd("x", { cycleId: "A", laborId: "L2", payrollId: "N1" }), "N1", scope)).toBe(true);
    expect(inRecalcScope(wd("y", { cycleId: "B", payrollId: "N1" }), "N1", scope)).toBe(true);
  });

  it("lo etiquetado con otra nómina no entra nunca", () => {
    expect(inRecalcScope(wd("x", { cycleId: "C", payrollId: "N2" }), "N1", scope)).toBe(false);
  });

  it("lo pendiente entra solo si es de una labor que la nómina abarca", () => {
    expect(inRecalcScope(wd("x", { cycleId: "A", laborId: "L1" }), "N1", scope)).toBe(true);
    expect(inRecalcScope(wd("x", { cycleId: "A", laborId: "L2" }), "N1", scope)).toBe(false);
  });

  it("un ciclo que está solo por días puntuales no trae nada pendiente", () => {
    expect(inRecalcScope(wd("x", { cycleId: "B", laborId: "L1" }), "N1", scope)).toBe(false);
  });

  it("un ciclo sin `laborIds` (nóminas viejas) se trae entero, como antes", () => {
    expect(inRecalcScope(wd("x", { cycleId: "C", laborId: "L2" }), "N1", scope)).toBe(true);
    expect(inRecalcScope(wd("x", { cycleId: "C", laborId: "L1" }), "N1", new Map())).toBe(true);
  });

  it("los trabajadores temporales no entran", () => {
    expect(inRecalcScope(wd("x", { cycleId: "C", rut: "TEMP-1" }), "N1", scope)).toBe(false);
  });
});

describe("mergeCycleDetails", () => {
  it("un ciclo nuevo se agrega; si viene entero, sin `laborIds` (Firestore no acepta undefined)", () => {
    const out = mergeCycleDetails([{ id: "A" }], [{ id: "B", label: "b", laborIds: undefined }]);
    expect(out).toEqual([{ id: "A" }, { id: "B", label: "b" }]);
    expect("laborIds" in out[1]).toBe(false);
  });

  it("un ciclo que ya estaba no se repite: se le suman las labores", () => {
    const out = mergeCycleDetails([{ id: "A", label: "a", laborIds: ["L1"] }], [{ id: "A", label: "otro", laborIds: ["L2", "L1"] }]);
    expect(out).toEqual([{ id: "A", label: "a", laborIds: ["L1", "L2"] }]);
  });

  it("si cualquiera de los dos lo trae entero, queda entero", () => {
    expect(mergeCycleDetails([{ id: "A" }], [{ id: "A", laborIds: ["L1"] }])).toEqual([{ id: "A" }]);
    expect(mergeCycleDetails([{ id: "A", laborIds: ["L1"] }], [{ id: "A" }])).toEqual([{ id: "A" }]);
  });

  it("agregar días puntuales (`[]`) a un ciclo que ya estaba no le cambia el alcance", () => {
    expect(mergeCycleDetails([{ id: "A", laborIds: ["L1"] }], [{ id: "A", laborIds: [] }])).toEqual([
      { id: "A", laborIds: ["L1"] },
    ]);
    expect(mergeCycleDetails([{ id: "B", laborIds: [] }], [{ id: "B", laborIds: ["L2"] }])).toEqual([
      { id: "B", laborIds: ["L2"] },
    ]);
  });
});

describe("planAddWorkdays", () => {
  it("quien ya está suma bruto, jornadas y su `byCycle` — sumado, no pisado", () => {
    const items = [item({ gross: 100000, byCycle: { A: 100000 }, workdayIds: ["a1"] })];
    const plan = planAddWorkdays({
      items,
      workdays: [wd("a2", { laborId: "L2", amount: 30000 }), wd("b1", { cycleId: "B", amount: 20000 })],
      laborTypeById: tipos,
    });
    const it = plan.items[0];
    expect(it.grossAmount).toBe(150000);
    expect(it.byCycle).toEqual({ A: 130000, B: 20000 });
    expect(it.workdayIds).toEqual(["a1", "a2", "b1"]);
    expect(it.amount).toBe(150000);
    expect(plan.workdayIds.sort()).toEqual(["a2", "b1"]);
    expect(plan.newAdvanceApplications).toEqual([]);
  });

  it("a quien ya está se le aplica un anticipo pendiente que esta nómina no tocaba", () => {
    const items = [item({ gross: 100000, workdayIds: ["a1"], anticipos: [{ advanceId: "viejo", amount: 40000 }] })];
    const plan = planAddWorkdays({
      items,
      workdays: [wd("a2", { amount: 50000 })],
      laborTypeById: tipos,
      pendingAdvances: [anticipo("nuevo", "ANA", 200000)],
    });
    const it = plan.items[0];
    // Base: 150.000 de bruto − 40.000 ya descontados = 110.000 para el nuevo.
    expect(plan.newAdvanceApplications).toEqual([{ advanceId: "nuevo", amount: 110000 }]);
    expect(it.advance).toBe(150000);
    expect(it.amount).toBe(0);
    expect(it.advanceIds).toEqual(["viejo", "nuevo"]);
    expect(it.anticipoApplications).toEqual([
      { advanceId: "viejo", amount: 40000 },
      { advanceId: "nuevo", amount: 110000 },
    ]);
  });

  it("un anticipo que esta nómina ya descuenta en parte no crece", () => {
    const items = [item({ gross: 100000, workdayIds: ["a1"], anticipos: [{ advanceId: "ant", amount: 100000 }] })];
    const plan = planAddWorkdays({
      items,
      workdays: [wd("a2", { amount: 50000 })],
      laborTypeById: tipos,
      pendingAdvances: [anticipo("ant", "ANA", 300000, { amountPaid: 100000, status: "partial" })],
    });
    expect(plan.newAdvanceApplications).toEqual([]);
    expect(plan.items[0].advance).toBe(100000);
    expect(plan.items[0].amount).toBe(50000);
  });

  it("quien no está entra con el reparto completo: bonos primero, anticipos topeados", () => {
    const plan = planAddWorkdays({
      items: [],
      workdays: [wd("b1", { rut: "BETO", amount: 50000 })],
      laborTypeById: tipos,
      pendingAdvances: [anticipo("ant", "BETO", 80000), bono("bon", "BETO", 10000)],
      profileFor: () => ({ name: "Beto", paymentRut: "PAGO", bankCode: "EFE", accountNumber: "", accountType: 3, groupLeader: "GRUPO B" }),
    });
    const [nuevo] = plan.items;
    expect(nuevo).toMatchObject({
      rut: "BETO", workerId: "BETO", name: "Beto", paymentRut: "PAGO", bankCode: "EFE", groupLeader: "GRUPO B",
      grossAmount: 50000, bonus: 10000, advance: 60000, amount: 0,
      byCycle: { A: 50000 }, workdayIds: ["b1"],
    });
    expect(plan.newAdvanceApplications).toEqual([
      { advanceId: "ant", amount: 60000 },
      { advanceId: "bon", amount: 10000 },
    ]);
    expect(plan.added).toMatchObject([{ key: "BETO", isNew: true, gross: 50000, anticipos: 60000, bonos: 10000, newNet: 0 }]);
  });

  it("quien no está y solo trae días en $0 no entra, y esos días no se etiquetan", () => {
    const plan = planAddWorkdays({ items: [], workdays: [wd("c1", { rut: "CARO", amount: 0 })], laborTypeById: tipos });
    expect(plan.items).toEqual([]);
    expect(plan.workdayIds).toEqual([]);
    expect(plan.sinBruto).toEqual([{ key: "CARO", rut: "CARO", workdayIds: ["c1"] }]);
  });

  it("a quien ya está sí se le etiquetan los días en $0", () => {
    const items = [item({ gross: 100000, workdayIds: ["a1"] })];
    const plan = planAddWorkdays({ items, workdays: [wd("a2", { amount: 0 })], laborTypeById: tipos });
    expect(plan.items[0].grossAmount).toBe(100000);
    expect(plan.items[0].workdayIds).toEqual(["a1", "a2"]);
    expect(plan.workdayIds).toEqual(["a2"]);
  });

  it("una persona con jornadas bajo dos ruts (el viejo y el vigente) queda en un solo item", () => {
    const plan = planAddWorkdays({
      items: [],
      workdays: [
        wd("v1", { rut: "RUT-VIEJO", workerId: "W1", amount: 10000 }),
        wd("n1", { rut: "RUT-NUEVO", workerId: "W1", amount: 15000 }),
      ],
      laborTypeById: tipos,
    });
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ workerId: "W1", grossAmount: 25000, workdayIds: ["v1", "n1"] });
  });
});

describe("workerDayRows", () => {
  it("una fila por labor y día, separada por estado", () => {
    const filas = workerDayRows(
      [
        wd("a", { date: "2026-03-02", amount: 1000, combo: "1_1" }),
        wd("b", { date: "2026-03-02", amount: 2000, combo: "1_2" }),
        wd("c", { date: "2026-03-02", laborId: "L2", amount: 500, payrollId: "N1" }),
        wd("d", { date: "2026-03-01", amount: 700, payrollId: "OTRA" }),
      ],
      { laborTypeById: tipos, payrollId: "N1" },
    );
    expect(filas.map((f) => [f.date, f.laborId, f.status, f.amount, f.workdayIds])).toEqual([
      ["2026-03-01", "L1", "other", 700, ["d"]],
      ["2026-03-02", "L1", "pending", 3000, ["a", "b"]],
      ["2026-03-02", "L2", "here", 500, ["c"]],
    ]);
    expect(filas[0].payrollId).toBe("OTRA");
  });

  it("el monto de trato sale de sus tiers, igual que en la nómina", () => {
    const [fila] = workerDayRows(
      [wd("t", { laborId: "LT", amount: 0, tiers: { t0: { qty: 2, amount: 3000 }, t1: { qty: 1, amount: 1500 } } })],
      { laborTypeById: tipos },
    );
    expect(fila.amount).toBe(4500);
  });
});

describe("asPayrollWorker", () => {
  const jornadas = [
    wd("v1", { rut: "RUT-VIEJO", workerId: "RUT-VIEJO", amount: 10000 }),
    wd("n1", { rut: "RUT-NUEVO", workerId: "W1", amount: 15000 }),
  ];
  const anticipos = [anticipo("ant", "RUT-VIEJO", 5000)];

  it("si ya está en la nómina, todo queda bajo la clave de su item", () => {
    const items = [item({ rut: "RUT-NUEVO", gross: 1000 })];
    items[0].workerId = "W1";
    const p = asPayrollWorker({
      items, keys: ["W1", "RUT-NUEVO", "RUT-VIEJO"], fallbackKey: "W1", rut: "RUT-NUEVO", workdays: jornadas, advances: anticipos,
    });
    expect(p.key).toBe("W1");
    expect(p.existing).toBe(items[0]);
    expect(p.workdays.map((x) => [x.workerId, x.workerRut])).toEqual([["W1", "RUT-NUEVO"], ["W1", "RUT-NUEVO"]]);
    expect(p.advances[0].workerId).toBe("W1");
    // Los originales no se tocan: de ahí sale lo que se etiqueta.
    expect(jornadas[0].workerRut).toBe("RUT-VIEJO");
  });

  it("si no está, toma la clave de su ficha, y entra en un solo item con su anticipo", () => {
    const p = asPayrollWorker({
      items: [], keys: ["W1", "RUT-NUEVO", "RUT-VIEJO"], fallbackKey: "W1", rut: "RUT-NUEVO", workdays: jornadas, advances: anticipos,
    });
    expect(p.key).toBe("W1");
    expect(p.existing).toBe(null);
    const plan = planAddWorkdays({ items: [], workdays: p.workdays, laborTypeById: tipos, pendingAdvances: p.advances });
    expect(plan.items).toHaveLength(1);
    expect(plan.items[0]).toMatchObject({ workerId: "W1", rut: "RUT-NUEVO", grossAmount: 25000, advance: 5000, amount: 20000 });
  });
});
