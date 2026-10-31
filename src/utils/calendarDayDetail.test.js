import { describe, expect, it } from "vitest";
import { dayByCarrierOf, dayByLaborOf, dayTotalsOf, inSubjob } from "./calendarDayDetail";

const DATE = "2026-10-05";
const cycles = [
  {
    id: "C1",
    label: "Robles/Uno/Ciclo 1",
    subfaenaId: "S1",
    labors: [
      { id: "LC", name: "Cosecha", type: "cosecha" },
      { id: "LT", name: "Poda", type: "trato", tratoType: 2 },
      { id: "LH", name: "Riego", type: "tratoHE" },
      { id: "LM", name: "Principal", type: "main" },
    ],
    dayPrices: { LT: { [DATE]: { t0: { price: 100, mode: "unit", unit: 3 }, t1: { price: 150, mode: "unit", unit: 4 } } } },
  },
  { id: "C2", label: "Alamos/Dos/Ciclo 1", subfaenaId: "S2", labors: [{ id: "LM", name: "Principal", type: "main" }] },
];
const cycleById = new Map(cycles.map((c) => [c.id, c]));
const subjobById = new Map([["S1", { name: "Uno", faenaId: "F1" }], ["S2", { name: "Dos", faenaId: "F2" }]]);
const jobById = new Map([["F1", { name: "Robles" }], ["F2", { name: "Alamos" }]]);
const workerById = new Map([["W1", { rut: "11.111.111-1", name: "Ana" }], ["W2", { rut: "22.222.222-2", name: "Beto" }]]);
const catalogs = { containers: [{ value: 1, label: "Bandeja" }], tratoTypes: [{ value: 2, label: "Poda" }] };

const workdays = [
  { cycleId: "C1", laborId: "LC", workerId: "W1", workerRut: "111", qty: 40, qualityX: 0, containerY: 1, amount: 20000 },
  { cycleId: "C1", laborId: "LC", workerId: "W2", workerRut: "222", qty: 10, qualityX: 1, containerY: 1, amount: 4000 },
  { cycleId: "C1", laborId: "LC", workerId: "W2", workerRut: "222", pisoOnly: true, amount: 3000 },
  { cycleId: "C1", laborId: "LT", workerId: "W1", workerRut: "111", date: DATE, tiers: { 0: { qty: 5, amount: 500 }, 1: { qty: 2, amount: 300 } }, amount: 800 },
  { cycleId: "C1", laborId: "LH", workerId: "W2", workerRut: "222", qty: 1, overtimeHours: 2, amount: 30000 },
  { cycleId: "C2", laborId: "LM", workerId: "W3", workerRut: "333", amount: 25000 },
];
const trips = [
  { cycleId: "C1", carrierId: "K1", amount: 30000 },
  { cycleId: "C1", carrierId: "K1", amount: 10000 },
  { cycleId: "C2", carrierId: "K2", amount: 50000 },
  { cycleId: "C2", amount: 5000 },
];

describe("inSubjob", () => {
  it("sin subfaena devuelve la misma lista", () => {
    expect(inSubjob(trips, "", cycleById)).toBe(trips);
  });

  it("deja lo de los ciclos de esa subfaena", () => {
    expect(inSubjob(workdays, "S2", cycleById)).toHaveLength(1);
    expect(inSubjob(trips, "S1", cycleById).map((t) => t.amount)).toEqual([30000, 10000]);
  });
});

describe("dayTotalsOf", () => {
  it("cada métrica suma solo su tipo de labor y el piso va aparte", () => {
    const t = dayTotalsOf(workdays, trips, cycleById, catalogs);
    expect(t).toMatchObject({
      workerCount: 3,
      harvestQty: 50,
      harvestUnitLabel: "Bandeja",
      pieceworkQty: 7,
      pieceworkLabel: "Poda",
      amount: 82800,
      workdayCount: 2,
      overtimeHours: 2,
      floorAmount: 3000,
      floorCount: 1,
      tripsCount: 4,
      tripsTotal: 95000,
    });
  });

  it("con tratos de varios tipos el rótulo es genérico", () => {
    const mixed = [
      ...workdays,
      { cycleId: "C3", laborId: "LX", workerId: "W1", qty: 1, amount: 100 },
    ];
    const byId = new Map([...cycleById, ["C3", { id: "C3", labors: [{ id: "LX", type: "trato", tratoType: 7 }] }]]);
    expect(dayTotalsOf(mixed, [], byId, catalogs).pieceworkLabel).toBe("Trato");
  });
});

describe("dayByLaborOf", () => {
  const rows = dayByLaborOf(workdays, { cycleById, subjobById, jobById, workerById });
  const row = (laborId, cycleId = "C1") => rows.find((r) => r.key === `${cycleId}__${laborId}`);

  it("una fila por ciclo y labor, de mayor a menor monto", () => {
    expect(rows.map((r) => r.key)).toEqual(["C1__LH", "C1__LC", "C2__LM", "C1__LT"]);
    expect(row("LC")).toMatchObject({ cycleLabel: "Robles/Uno/Ciclo 1", laborName: "Cosecha", jobName: "Robles", subjobName: "Uno" });
  });

  it("cosecha: kilos, piso aparte y la distribución por calidad", () => {
    const c = row("LC");
    expect(c).toMatchObject({ harvestQty: 50, amount: 27000, floorAmount: 3000, floorCount: 1, workerCount: 2 });
    expect(c.qualityDist).toEqual([
      { qx: 0, cy: 1, harvestQty: 40, amount: 20000 },
      { qx: 1, cy: 1, harvestQty: 10, amount: 4000 },
    ]);
    expect(c.workersMap).toBeUndefined();
    expect(c.qualityMap).toBeUndefined();
  });

  it("el desglose por trabajador toma el nombre y el RUT vigentes de la ficha", () => {
    const [first, second] = row("LC").workersBreakdown;
    expect(first).toMatchObject({ id: "W1", name: "Ana", rut: "11.111.111-1", harvestQty: 40, amount: 20000 });
    expect(second).toMatchObject({ id: "W2", name: "Beto", floorAmount: 3000, amount: 7000 });
  });

  it("trato: suma los tiers y junta sus unidades", () => {
    const t = row("LT");
    expect(t.pieceworkQty).toBe(7);
    expect([...t.pieceworkUnits].sort()).toEqual([3, 4]);
  });

  it("jornadas con horas extras y labores al día cuentan jornadas", () => {
    expect(row("LH")).toMatchObject({ workdayCount: 1, overtimeHours: 2 });
    expect(row("LM", "C2")).toMatchObject({ workdayCount: 1, laborType: "main" });
  });

  it("un trabajador sin ficha sale con su RUT", () => {
    expect(row("LM", "C2").workersBreakdown[0]).toMatchObject({ id: "W3", rut: "333", name: "333" });
  });
});

describe("dayByCarrierOf", () => {
  it("agrupa por transportista, de mayor a menor total", () => {
    const carrierById = new Map([["K1", { alias: "Furgón", name: "Juan" }], ["K2", { name: "Buses Sur" }]]);
    expect(dayByCarrierOf(trips, carrierById)).toEqual([
      { carrierId: "K2", alias: "Buses Sur", name: "Buses Sur", tripCount: 1, total: 50000 },
      { carrierId: "K1", alias: "Furgón", name: "Juan", tripCount: 2, total: 40000 },
      { carrierId: "(sin id)", alias: "(transportista eliminado)", name: "", tripCount: 1, total: 5000 },
    ]);
  });
});
