import { describe, it, expect } from "vitest";
import { planLaborClear, workdaysOfGrid } from "./laborClear";

// Un ciclo con una cosecha (L1) y una supervisión (L2), con datos inventados.
const cycle = {
  id: "C1",
  days: ["2026-03-02", "2026-03-03", "2026-03-04", "2026-03-05"],
  labors: [
    {
      id: "L1",
      type: "cosecha",
      workers: [
        { id: "1-9", rut: "1-9", name: "Ana" },
        { id: "2-7", rut: "2-7", name: "Beto" },
        { id: "3-5", rut: "3-5", name: "Carla" },
        { id: "TEMP-1", rut: "TEMP-1", name: "Temporal", isTemp: true },
      ],
    },
    { id: "L2", type: "supervision", workers: [{ id: "9-9", rut: "9-9", name: "Supervisor" }] },
  ],
};
const wd = (id, laborId, workerRut, date, extra = {}) => ({ id, laborId, workerRut, workerId: workerRut, date, ...extra });

describe("limpiar una labor", () => {
  const workdays = [
    wd("a", "L1", "1-9", "2026-03-02"),
    wd("b", "L1", "1-9", "2026-03-03"),
    wd("c", "L1", "2-7", "2026-03-03", { pisoOnly: true }),
    wd("d", "L1", "3-5", "2026-03-04", { payrollId: "N1" }),
    wd("e", "L1", "2-7", "2026-03-05"),
    wd("f", "L2", "9-9", "2026-03-03"),
  ];

  it("borra las jornadas de la labor que no están en una nómina", () => {
    const p = planLaborClear({ cycle, laborId: "L1", workdays, trips: [] });
    expect(p.deletes.map((w) => w.id)).toEqual(["a", "b", "c", "e"]);
    expect(p.kept.map((w) => w.id)).toEqual(["d"]);
  });

  it("deja en la labor solo a quien tiene jornadas en una nómina", () => {
    const p = planLaborClear({ cycle, laborId: "L1", workdays, trips: [] });
    expect(p.workers.map((w) => w.id)).toEqual(["3-5"]);
    expect(p.workersRemoved).toBe(3);
  });

  it("quita los días que quedan vacíos; no los de otra labor ni los de una nómina", () => {
    const p = planLaborClear({ cycle, laborId: "L1", workdays, trips: [] });
    // El 03 lo usa la supervisión y el 04 tiene una jornada en una nómina.
    expect(p.daysRemoved).toEqual(["2026-03-02", "2026-03-05"]);
    expect(p.days).toEqual(["2026-03-03", "2026-03-04"]);
  });

  it("un día vacío con vueltas de transporte queda, y avisa las vueltas sin pagar", () => {
    const trips = [
      { id: "t1", date: "2026-03-02", status: "pending" },
      { id: "t2", date: "2026-03-03", status: "paid" },
      { id: "t3", date: "2026-03-10", status: "pending" },
    ];
    const p = planLaborClear({ cycle, laborId: "L1", workdays, trips });
    expect(p.daysRemoved).toEqual(["2026-03-05"]);
    expect(p.tripDays).toEqual(["2026-03-02"]);
    expect(p.trips.map((t) => t.id)).toEqual(["t1", "t2"]);
    expect(p.pendingTrips.map((t) => t.id)).toEqual(["t1"]);
  });

  it("no quita un día que la labor no usaba, aunque esté vacío", () => {
    const p = planLaborClear({ cycle: { ...cycle, days: [...cycle.days, "2026-03-06"] }, laborId: "L1", workdays, trips: [] });
    expect(p.days).toContain("2026-03-06");
  });

  it("una jornada sin labor es de la primera labor, como en la grilla", () => {
    const p = planLaborClear({ cycle, laborId: "L1", workdays: [{ id: "x", workerRut: "1-9", date: "2026-03-02" }], trips: [] });
    expect(p.deletes.map((w) => w.id)).toEqual(["x"]);
    expect(planLaborClear({ cycle, laborId: "L2", workdays: [{ id: "x", workerRut: "1-9", date: "2026-03-02" }], trips: [] }).deletes).toEqual([]);
  });

  it("toma las jornadas del mapa de la grilla con su labor", () => {
    const grid = { L1: { k1: wd("a", undefined, "1-9", "2026-03-02"), k2: null }, L2: { k3: wd("f", undefined, "9-9", "2026-03-03") } };
    expect(workdaysOfGrid(grid).map((w) => [w.id, w.laborId])).toEqual([["a", "L1"], ["f", "L2"]]);
  });
});
