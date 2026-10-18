import { describe, it, expect, vi } from "vitest";

// `payrollItem` importa helpers puros de `advancesService`, que importa
// `../firebase`.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const {
  cycleDetailOf,
  payrollLaborScope,
  inRecalcScope,
  mergeCycleDetails,
  withPaidPeriods,
  withLiveNames,
  cycleDetailChanges,
  planAddWorkdays,
  workerDayRows,
  asPayrollWorker,
  isRemovedFromPayroll,
  cycleScopeAfterRemoval,
  payrollCycleBreakdown,
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

describe("sacar ciclos o labores (lo destildado en el detalle)", () => {
  const removed = new Map([
    ["A", true],
    ["B", new Set(["L2"])],
  ]);

  it("una jornada de un ciclo sacado entero, o de una labor sacada, queda afuera", () => {
    expect(isRemovedFromPayroll(wd("x", { cycleId: "A", laborId: "L1" }), removed)).toBe(true);
    expect(isRemovedFromPayroll(wd("x", { cycleId: "B", laborId: "L2" }), removed)).toBe(true);
  });

  it("el resto de las labores del ciclo y los otros ciclos siguen", () => {
    expect(isRemovedFromPayroll(wd("x", { cycleId: "B", laborId: "L1" }), removed)).toBe(false);
    expect(isRemovedFromPayroll(wd("x", { cycleId: "C", laborId: "L2" }), removed)).toBe(false);
    expect(isRemovedFromPayroll(wd("x", { cycleId: "A" }), new Map())).toBe(false);
  });

  const laborIdsOf = (cid) => ({ A: ["L1", "L2"], B: ["L1", "L2", "LT"], C: ["L1"] })[cid] || [];
  const detalles = [
    { id: "A", label: "Ciclo A" },
    { id: "B", label: "Ciclo B" },
    { id: "C", label: "Ciclo C", laborIds: ["L1"] },
  ];

  it("un ciclo sacado entero sale de cycleIds, cycleLabels y cycleDetails", () => {
    const r = cycleScopeAfterRemoval({
      cycleDetails: detalles,
      cycleIds: ["A", "B", "C"],
      cycleLabels: ["Ciclo A", "Ciclo B", "Ciclo C"],
      removed: new Map([["A", true]]),
      laborIdsOf,
    });
    expect(r.cycleIds).toEqual(["B", "C"]);
    expect(r.cycleLabels).toEqual(["Ciclo B", "Ciclo C"]);
    expect(r.cycleDetails.map((c) => c.id)).toEqual(["B", "C"]);
    expect(r.removedCycleIds).toEqual(["A"]);
  });

  it("a un ciclo entero que pierde labores le queda la lista de las otras: Recalcular no las vuelve a traer", () => {
    const r = cycleScopeAfterRemoval({ cycleDetails: detalles, removed: new Map([["B", new Set(["L2"])]]), laborIdsOf });
    expect(r.cycleDetails.find((c) => c.id === "B").laborIds).toEqual(["L1", "LT"]);
    expect(r.cycleIds).toEqual(["A", "B", "C"]);
  });

  it("a un ciclo con lista de labores se le quitan las sacadas", () => {
    const r = cycleScopeAfterRemoval({
      cycleDetails: [{ id: "C", label: "Ciclo C", laborIds: ["L1", "L2"] }],
      removed: new Map([["C", new Set(["L1"])]]),
      laborIdsOf,
    });
    expect(r.cycleDetails[0].laborIds).toEqual(["L2"]);
  });

  it("sin nada sacado, todo queda igual", () => {
    const r = cycleScopeAfterRemoval({ cycleDetails: detalles, cycleIds: ["A", "B", "C"], cycleLabels: ["a", "b", "c"], laborIdsOf });
    expect(r.cycleDetails).toEqual(detalles);
    expect(r.cycleLabels).toEqual(["a", "b", "c"]);
  });
});

describe("payrollCycleBreakdown (lo que paga la nómina por ciclo y labor)", () => {
  const id = (cycleId, laborId, rut, date, ck = "") => [cycleId, laborId, rut, date, ck].filter(Boolean).join("__");
  const items = [
    item({
      rut: "ANA",
      gross: 70000,
      byCycle: { A: 70000 },
      workdayIds: [id("A", "L1", "ANA", "2026-03-02", "1_1"), id("A", "L1", "ANA", "2026-03-02", "1_2"), id("A", "L2", "ANA", "2026-03-03")],
    }),
    item({ rut: "BETO", gross: 20000, byCycle: { A: 20000 }, workdayIds: [id("A", "L1", "BETO", "2026-03-02", "1_1")] }),
  ];
  const labors = [
    { id: "L1", name: "Cosecha" },
    { id: "L2", name: "Supervisión" },
    { id: "L3", name: "Poda" },
  ];
  const montos = new Map([
    [id("A", "L1", "ANA", "2026-03-02", "1_1"), 30000],
    [id("A", "L1", "ANA", "2026-03-02", "1_2"), 10000],
    [id("A", "L2", "ANA", "2026-03-03"), 30000],
    [id("A", "L1", "BETO", "2026-03-02", "1_1"), 20000],
  ]);

  it("suma por labor desde las jornadas, con personas y jornadas (un día con varios combos cuenta una vez)", () => {
    const [ciclo] = payrollCycleBreakdown({
      cycleDetails: [{ id: "A", label: "Ciclo A", laborIds: ["L1", "L2"] }],
      items,
      laborsOf: () => labors,
      workdayAmounts: montos,
    });
    expect(ciclo.amount).toBe(90000);
    expect(ciclo.labors).toEqual([
      { id: "L1", name: "Cosecha", jornadas: 2, people: 2, amount: 60000, inScope: true },
      { id: "L2", name: "Supervisión", jornadas: 1, people: 1, amount: 30000, inScope: true },
    ]);
  });

  it("un ciclo entero muestra también sus labores sin jornadas en esta nómina", () => {
    const [ciclo] = payrollCycleBreakdown({ cycleDetails: [{ id: "A", label: "Ciclo A" }], items, laborsOf: () => labors, workdayAmounts: montos });
    expect(ciclo.labors.map((l) => [l.id, l.jornadas, l.amount])).toEqual([
      ["L1", 2, 60000],
      ["L2", 1, 30000],
      ["L3", 0, 0],
    ]);
  });

  it("una labor fuera del alcance con días agregados a mano aparece marcada", () => {
    const [ciclo] = payrollCycleBreakdown({
      cycleDetails: [{ id: "A", label: "Ciclo A", laborIds: [] }],
      items,
      laborsOf: () => labors,
      workdayAmounts: montos,
    });
    expect(ciclo.labors.map((l) => [l.id, l.inScope])).toEqual([
      ["L1", false],
      ["L2", false],
    ]);
  });

  it("sin el monto de alguna jornada, el de esa labor queda en null en vez de un total incompleto", () => {
    const [ciclo] = payrollCycleBreakdown({
      cycleDetails: [{ id: "A", label: "Ciclo A" }],
      items,
      laborsOf: () => labors,
      workdayAmounts: new Map([[id("A", "L2", "ANA", "2026-03-03"), 30000]]),
    });
    expect(ciclo.labors.find((l) => l.id === "L1").amount).toBe(null);
    expect(ciclo.labors.find((l) => l.id === "L2").amount).toBe(30000);
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

describe("withPaidPeriods", () => {
  const day = (cycleId, date) => ({ id: `${cycleId}-${date}`, cycleId, date });

  it("el período va del primer al último día que se paga, sin importar el orden", () => {
    const out = withPaidPeriods(
      [{ id: "A", firstDay: "2026-03-01", lastDay: "2026-03-15" }],
      [day("A", "2026-03-12"), day("A", "2026-03-10"), day("A", "2026-03-11")],
    );
    expect(out).toEqual([{ id: "A", firstDay: "2026-03-10", lastDay: "2026-03-12" }]);
  });

  it("un ciclo sin jornadas en la lista conserva su período, y el que no cambia es el mismo objeto", () => {
    const a = { id: "A", firstDay: "2026-03-02", lastDay: "2026-03-03" };
    const b = { id: "B", firstDay: "2026-03-01", lastDay: "2026-03-05" };
    const out = withPaidPeriods([a, b], [day("A", "2026-03-02"), day("A", "2026-03-03")]);
    expect(out[0]).toBe(a);
    expect(out[1]).toBe(b);
  });

  it("un ciclo sin período guardado lo toma de las jornadas", () => {
    expect(withPaidPeriods([{ id: "A", label: "a" }], [day("A", "2026-03-04")])).toEqual([
      { id: "A", label: "a", firstDay: "2026-03-04", lastDay: "2026-03-04" },
    ]);
  });

  it("con `extend`, el período solo crece", () => {
    const before = [{ id: "A", firstDay: "2026-03-02", lastDay: "2026-03-05" }];
    expect(withPaidPeriods(before, [day("A", "2026-03-06")], { extend: true })).toEqual([
      { id: "A", firstDay: "2026-03-02", lastDay: "2026-03-06" },
    ]);
    expect(withPaidPeriods(before, [day("A", "2026-03-03")], { extend: true })[0]).toBe(before[0]);
  });
});

describe("withLiveNames", () => {
  const stored = { id: "A", label: "F/Sub vieja/Ciclo 1", faenaId: "f", faenaName: "F", subfaenaId: "s", subfaenaName: "Sub vieja" };

  it("trae la etiqueta del ciclo y los nombres vigentes de su faena y subfaena", () => {
    const [cd] = withLiveNames([stored], {
      cycles: [{ id: "A", label: "F/Sub nueva/Ciclo 2", faenaId: "f", subfaenaId: "s" }],
      faenas: [{ id: "f", name: "F" }],
      subfaenas: [{ id: "s", name: "Sub nueva" }],
    });
    expect(cd).toEqual({ ...stored, label: "F/Sub nueva/Ciclo 2", subfaenaName: "Sub nueva" });
  });

  it("lo que ya no está en las listas conserva lo guardado, y sin cambios es el mismo objeto", () => {
    expect(withLiveNames([stored], {})[0]).toBe(stored);
    expect(withLiveNames([stored], { cycles: [{ id: "A", label: stored.label }], subfaenas: [{ id: "s", name: "Sub vieja" }] })[0]).toBe(stored);
  });
});

describe("cycleDetailChanges", () => {
  it("lista el nombre, la subfaena y el período que cambiaron, por ciclo", () => {
    const before = [
      { id: "A", label: "F/S/1", subfaenaName: "S", firstDay: "2026-03-02", lastDay: "2026-03-03" },
      { id: "B", label: "F/S/2" },
    ];
    const after = [{ ...before[0], label: "F/T/1", subfaenaName: "T", lastDay: "2026-03-04" }, before[1]];
    expect(cycleDetailChanges(before, after)).toEqual([
      {
        cycleId: "A",
        label: "F/T/1",
        fields: [
          { field: "label", label: "Ciclo", old: "F/S/1", new: "F/T/1" },
          { field: "subfaenaName", label: "Subfaena", old: "S", new: "T" },
          { field: "period", label: "Período", old: ["2026-03-02", "2026-03-03"], new: ["2026-03-02", "2026-03-04"] },
        ],
      },
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
