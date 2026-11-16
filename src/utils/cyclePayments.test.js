import { describe, it, expect } from "vitest";
import { cyclePaymentGroups, cyclePaymentsOf, PAYOUT_COLUMN_ID } from "./cyclePayments";
import { workerIdResolver } from "./workerRut";

const ANA = { id: "11111111-1", rut: "11111111-1", name: "Ana Rojas" };
const BETO = { id: "12345678-5", rut: "12345678-5", name: "Beto Soto" };
const workers = [ANA, BETO];
const labors = [
  { id: "poda", name: "Poda", type: "main" },
  { id: "amarre", name: "Amarre", type: "main" },
  { id: "riego", name: "Riego", type: "main" },
];
const wd = (worker, laborId, date, amount, payrollId) => ({ workerId: worker.id, workerRut: worker.rut, laborId, date, amount, payrollId });
const workdays = [
  wd(ANA, "poda", "2026-10-01", 30000, "N1"),
  wd(ANA, "poda", "2026-10-02", 30000, "N1"),
  wd(ANA, "poda", "2026-10-05", 20000, "N2"),
  wd(ANA, "amarre", "2026-10-05", 40000, "N2"),
  wd(BETO, "poda", "2026-10-01", 25000, "N1"),
  // Sin nómina: no cuenta.
  wd(BETO, "amarre", "2026-10-06", 15000, null),
];
const payrolls = [
  {
    id: "N2", name: "Nómina 10 nov", state: "pending", createdMs: 200,
    items: [{ workerId: ANA.id, rut: ANA.rut, grossAmount: 90000, advance: 10000, bonus: 5000, amount: 85000 }],
  },
  {
    id: "N1", name: "Nómina 27 oct", state: "paid", createdMs: 100,
    items: [
      { workerId: ANA.id, rut: ANA.rut, grossAmount: 60000, amount: 60000 },
      // Un item anterior a `workerId`: se encuentra por su rut.
      { rut: BETO.rut, amount: 70000 },
    ],
  },
];
const dataOf = (extra = {}) => cyclePaymentsOf({
  workdays,
  labors,
  payrolls,
  workerIdOf: workerIdResolver(workers),
  workerOf: (id) => workers.find((w) => w.id === id),
  currentPayrollId: "N2",
  ...extra,
});

describe("cyclePaymentsOf", () => {
  it("arma una fila por persona y nómina, con lo de cada labor y lo que recibe en la nómina entera", () => {
    const data = dataOf();
    expect(data.labors).toEqual([{ id: "poda", name: "Poda" }, { id: "amarre", name: "Amarre" }]);
    expect(data.payrolls.map((p) => [p.id, p.state, p.isCurrent])).toEqual([["N1", "paid", false], ["N2", "pending", true]]);
    const row = (person, payrollId) => data.rows.find((r) => r.personKey === person.id && r.payrollId === payrollId);
    expect(row(ANA, "N1")).toMatchObject({ name: "Ana Rojas", byLabor: { poda: 60000 }, cycleAmount: 60000, days: 2, gross: 60000, advance: 0, bonus: 0, net: 60000 });
    expect(row(ANA, "N2")).toMatchObject({ byLabor: { poda: 20000, amarre: 40000 }, cycleAmount: 60000, gross: 90000, advance: 10000, bonus: 5000, net: 85000, itemKey: ANA.id });
    expect(row(BETO, "N1")).toMatchObject({ byLabor: { poda: 25000 }, cycleAmount: 25000, gross: 70000, net: 70000 });
    expect(data.rows).toHaveLength(3);
  });

  it("una nómina o una labor que ya no existe queda con su rótulo, y la persona sin item va sin totales", () => {
    const data = dataOf({ workdays: [wd(ANA, "vieja", "2026-10-01", 1000, "NX"), wd(BETO, "poda", "2026-10-01", 2000, "N2")] });
    expect(data.labors).toEqual([{ id: "poda", name: "Poda" }, { id: "vieja", name: "(labor eliminada)" }]);
    expect(data.payrolls.find((p) => p.id === "NX")).toMatchObject({ name: "Nómina eliminada", state: "pending" });
    expect(data.rows.find((r) => r.payrollId === "N2")).toMatchObject({ net: null, gross: null });
  });
});

describe("los anticipos entregados asociados al ciclo", () => {
  const CARLA = { id: "13131313-1", rut: "13131313-1", name: "Carla Díaz" };
  const payout = (cycleId, amount, advanceId = `A-${cycleId}-${amount}`) => ({ advanceId, amount, cycleId, date: "2026-11-01", note: "" });
  const withPayouts = () => dataOf({
    cycleId: "C1",
    workerIdOf: workerIdResolver([...workers, CARLA]),
    workerOf: (id) => [...workers, CARLA].find((w) => w.id === id),
    payrolls: [
      {
        ...payrolls[0],
        items: [
          // Ana: jornadas del ciclo y un anticipo entregado en la misma nómina.
          { ...payrolls[0].items[0], payoutApplications: [payout("C1", 50000), payout("C2", 7000)], payoutTotal: 57000, amount: 142000 },
          // Carla: sin jornadas en el ciclo, solo el anticipo.
          { workerId: CARLA.id, rut: CARLA.rut, name: CARLA.name, grossAmount: 0, amount: 30000, payoutApplications: [payout("C1", 30000)], payoutTotal: 30000 },
        ],
      },
      payrolls[1],
      // Otra nómina con un anticipo de otro ciclo: no aparece.
      { id: "N3", name: "Nómina 24 nov", state: "pending", createdMs: 300, items: [{ workerId: BETO.id, rut: BETO.rut, amount: 9000, payoutApplications: [payout("C2", 9000)], payoutTotal: 9000 }] },
    ],
  });
  const row = (data, person, payrollId) => data.rows.find((r) => r.personKey === person.id && r.payrollId === payrollId);

  it("van en su columna, después de las labores, y suman en lo del ciclo", () => {
    const data = withPayouts();
    expect(data.labors.map((l) => l.id)).toEqual(["poda", "amarre", PAYOUT_COLUMN_ID]);
    expect(row(data, ANA, "N2")).toMatchObject({
      byLabor: { poda: 20000, amarre: 40000, [PAYOUT_COLUMN_ID]: 50000 }, cycleAmount: 110000, days: 2, payout: 57000, net: 142000,
    });
    expect(data.payrolls.map((p) => p.id)).toEqual(["N1", "N2"]);
  });

  it("quien solo recibió el anticipo tiene su fila, sin días", () => {
    const data = withPayouts();
    expect(row(data, CARLA, "N2")).toMatchObject({ name: "Carla Díaz", byLabor: { [PAYOUT_COLUMN_ID]: 30000 }, cycleAmount: 30000, days: 0, net: 30000 });
    const out = cyclePaymentGroups(data, { view: "payroll" });
    expect(out.groups.find((g) => g.key === "N2").totals).toMatchObject({ cycleAmount: 140000, byLabor: { [PAYOUT_COLUMN_ID]: 80000 } });
    expect(out.totals.cycleAmount).toBe(85000 + 140000);
    expect(out.people).toBe(3);
  });

  it("sin anticipos entregados, la columna no aparece", () => {
    expect(dataOf({ cycleId: "C1" }).labors.map((l) => l.id)).toEqual(["poda", "amarre"]);
    expect(cyclePaymentGroups(withPayouts(), { state: "paid" }).labors.map((l) => l.id)).toEqual(["poda"]);
  });
});

describe("lo que no está en ninguna nómina", () => {
  const unpaidWorkdays = [
    ...workdays,
    { workerId: "T-1", workerRut: "T-1", laborId: "poda", date: "2026-10-07", amount: 9000 },
    // Sin monto y sin ser de asistencia: no cuenta.
    wd(ANA, "riego", "2026-10-08", 0, null),
    { ...wd(ANA, "riego", "2026-10-09", 0, null), attendanceOnly: true },
  ];
  const withUnpaid = () => dataOf({
    workdays: unpaidWorkdays,
    includeUnpaid: true,
    labors: [{ ...labors[0], workers: [{ id: "T-1", rut: "T-1", name: "Temporal Uno" }] }, labors[1], labors[2]],
  });

  it("con `includeUnpaid` va como una nómina más, al final, sin totales de nómina", () => {
    const data = withUnpaid();
    expect(data.payrolls.map((p) => [p.id, p.name, p.state])).toEqual([
      ["N1", "Nómina 27 oct", "paid"], ["N2", "Nómina 10 nov", "pending"], ["", "Sin nómina", "none"],
    ]);
    const unpaid = data.rows.filter((r) => r.payrollId === "").map((r) => [r.name, r.byLabor, r.net]);
    expect(unpaid).toEqual([
      ["Beto Soto", { amarre: 15000 }, null],
      ["Temporal Uno", { poda: 9000 }, null],
      ["Ana Rojas", { riego: 0 }, null],
    ]);
  });

  it("se filtra aparte de las nóminas sin pagar, y no cuenta como nómina", () => {
    const none = cyclePaymentGroups(withUnpaid(), { state: "none" });
    expect(none.groups.map((g) => g.name)).toEqual(["Sin nómina"]);
    expect([none.payrolls, none.unpaidAmount, none.totals.cycleAmount]).toEqual([0, 24000, 24000]);
    expect(cyclePaymentGroups(withUnpaid(), { state: "unpaid" }).groups.map((g) => g.name)).toEqual(["Nómina 10 nov"]);
    expect(cyclePaymentGroups(withUnpaid()).payrolls).toBe(2);
  });
});

describe("cyclePaymentGroups", () => {
  it("por persona agrupa las nóminas de cada una, de la más vieja a la más nueva", () => {
    const out = cyclePaymentGroups(dataOf(), { view: "person" });
    expect(out.groups.map((g) => [g.name, g.rows.map((r) => r.payrollId)])).toEqual([
      ["Ana Rojas", ["N1", "N2"]],
      ["Beto Soto", ["N1"]],
    ]);
    expect(out.groups[0].totals).toMatchObject({ byLabor: { poda: 80000, amarre: 40000 }, cycleAmount: 120000, net: 145000 });
    expect(out.totals).toMatchObject({ byLabor: { poda: 105000, amarre: 40000 }, cycleAmount: 145000 });
    expect([out.people, out.payrolls]).toEqual([2, 2]);
  });

  it("por nómina agrupa a las personas de cada una, por nombre", () => {
    const out = cyclePaymentGroups(dataOf(), { view: "payroll" });
    expect(out.groups.map((g) => [g.name, g.payroll.state, g.rows.map((r) => r.name), g.totals.cycleAmount])).toEqual([
      ["Nómina 27 oct", "paid", ["Ana Rojas", "Beto Soto"], 85000],
      ["Nómina 10 nov", "pending", ["Ana Rojas"], 60000],
    ]);
  });

  it("filtra por estado y por nombre o RUT, y deja solo las labores con algo", () => {
    const paid = cyclePaymentGroups(dataOf(), { state: "paid" });
    expect(paid.labors.map((l) => l.id)).toEqual(["poda"]);
    expect(paid.totals.cycleAmount).toBe(85000);
    const unpaid = cyclePaymentGroups(dataOf(), { state: "unpaid" });
    expect(unpaid.groups.map((g) => g.name)).toEqual(["Nómina 10 nov"]);
    const names = (search) => cyclePaymentGroups(dataOf(), { view: "person", search }).groups.map((g) => g.name);
    expect(names("soto")).toEqual(["Beto Soto"]);
    expect(names("11111111")).toEqual(["Ana Rojas"]);
    expect(cyclePaymentGroups(dataOf(), { search: "nadie" }).groups).toEqual([]);
  });
});
