import { describe, expect, it } from "vitest";
import {
  columnsData,
  firstColumnByCycle,
  laborGroupTotals,
  laborGroupsByIdOf,
  orderCycles,
  summaryColumns,
  summaryDays,
  transportByCycleOf,
  transportTotalOf,
} from "./productionSummary";

const allTypes = { cosecha: true, trato: true, tratoEtapas: true, main: true, supervision: true };

describe("orderCycles", () => {
  it("agrupa por subfaena y ordena por el primer día, los grupos por su ciclo más antiguo", () => {
    const cycles = [
      { id: "b2", subfaenaId: "B", days: ["2026-10-05", "2026-10-01"] },
      { id: "a1", subfaenaId: "A", days: ["2026-10-03"] },
      { id: "b1", subfaenaId: "B", days: ["2026-09-01"] },
      { id: "a0", subfaenaId: "A", startDate: "2026-08-15" },
    ];
    expect(orderCycles(cycles).map((c) => c.id)).toEqual(["a0", "a1", "b1", "b2"]);
  });
});

describe("summaryColumns", () => {
  const cycles = [
    { id: "C1", label: "Ciclo 1", labors: [{ id: "L1", type: "main" }, { id: "L2", type: "tratoHE" }, { id: "L3", type: "cosecha" }], dayPrices: { L3: {} } },
    { id: "C2", labors: [{ id: "L1", type: "supervision" }], status: "closed" },
  ];

  it("una por ciclo prendido y labor de los tipos del resumen", () => {
    const cols = summaryColumns(cycles, new Set(["C1", "C2"]), allTypes);
    expect(cols.map((c) => [c.key, c.cycleLabel, c.cycleStatus])).toEqual([
      ["C1__L1", "Ciclo 1", "open"], ["C1__L3", "Ciclo 1", "open"], ["C2__L1", "C2", "closed"],
    ]);
    expect(cols[1].dayPrices).toEqual({ L3: {} });
  });

  it("sin los ciclos apagados ni los tipos destildados", () => {
    expect(summaryColumns(cycles, new Set(["C1"]), { ...allTypes, main: false }).map((c) => c.key)).toEqual(["C1__L3"]);
  });
});

describe("summaryDays", () => {
  it("las fechas con jornadas de los ciclos prendidos, ordenadas", () => {
    const wd = { C1: [{ date: "2026-10-03" }, { date: "2026-10-01" }, {}], C2: [{ date: "2026-09-01" }] };
    expect(summaryDays([{ id: "C1" }, { id: "C2" }], new Set(["C1"]), wd)).toEqual(["2026-10-01", "2026-10-03"]);
  });
});

describe("columnsData", () => {
  const col = (laborId, type, extra = {}) => ({ key: `C1__${laborId}`, cycleId: "C1", labor: { id: laborId, type, ...extra } });
  const cells = new Map([
    ["2026-10-01__C1__L1", { qty: 2, amount: 60000, unit: "jornadas" }],
    ["2026-10-02__C1__L1", { qty: 1, amount: 30000, unit: "jornadas" }],
    ["2026-10-01__C1__L2", { qty: 40, amount: 20000, unit: "saco" }],
    ["2026-10-02__C1__L2", { qty: 10, amount: 5000, unit: "caja" }],
  ]);
  const wd = {
    C1: [
      { laborId: "L1", workerRut: "1", amount: 30000 },
      { laborId: "L1", workerRut: "2", amount: 30000 },
      { laborId: "L1", workerRut: "1", amount: 30000 },
      { laborId: "L1", workerRut: "3", amount: 5000, pisoOnly: true },
      { laborId: "L2", workerRut: "1", qty: 40 },
      { laborId: "L2", workerRut: "2", qty: 0 },
      { laborId: "L3", workerRut: "1", qty: 5, stageId: "s1" },
      { laborId: "L3", workerRut: "2", qty: 5, stageId: "s2" },
      { laborId: "L4", workerRut: "4", tiers: { t0: { qty: 3, amount: 900 } } },
    ],
  };

  it("filas por día, totales, unidades juntas y personas distintas con producción", () => {
    const data = columnsData([col("L1", "main"), col("L2", "cosecha")], ["2026-10-01", "2026-10-02"], cells, wd);
    expect(data.map((d) => [d.col.key, d.rows.length, d.totalQty, d.totalAmount, d.unit, d.persons])).toEqual([
      ["C1__L1", 2, 3, 90000, "jornadas", 2],
      ["C1__L2", 2, 50, 25000, "saco/caja", 1],
    ]);
  });

  it("por etapas cuenta solo a quien aportó en una etapa que cuenta; sin filas no hay columna", () => {
    const stages = [{ id: "s1", name: "Uno", counts: true }, { id: "s2", name: "Dos", counts: false }];
    const etapas = col("L3", "tratoEtapas", { stages });
    const withCells = new Map([["2026-10-01__C1__L3", { qty: 5, amount: 100 }]]);
    expect(columnsData([etapas], ["2026-10-01"], withCells, wd)[0].persons).toBe(1);
    expect(columnsData([col("L4", "trato")], ["2026-10-01"], new Map(), wd)).toEqual([]);
  });
});

describe("transporte", () => {
  const trips = { C1: [{ amount: 20000 }, { amount: "5000" }], C2: [{ amount: 0 }] };
  const byCycle = transportByCycleOf([{ id: "C1" }, { id: "C2" }, { id: "C3" }], trips);

  it("total por ciclo y si tiene vueltas aunque sumen cero", () => {
    expect([...byCycle]).toEqual([["C1", { total: 25000, hasTrips: true }], ["C2", { total: 0, hasTrips: true }], ["C3", { total: 0, hasTrips: false }]]);
  });

  it("una vez por ciclo con columnas, en su primera columna", () => {
    const data = [{ col: { key: "C1__A", cycleId: "C1" } }, { col: { key: "C1__B", cycleId: "C1" } }, { col: { key: "C3__A", cycleId: "C3" } }];
    expect([...firstColumnByCycle(data)]).toEqual([["C1", "C1__A"], ["C3", "C3__A"]]);
    expect(transportTotalOf(data, byCycle)).toBe(25000);
  });
});

describe("totales por grupo de labor", () => {
  it("suman el monto de las columnas del grupo, de mayor a menor; sin grupo no entran", () => {
    const byId = laborGroupsByIdOf({ S1: [{ id: "G1", name: "Riego" }], S2: [{ id: "G2", name: "Cosecha" }] });
    const data = [
      { col: { cycleId: "C1", labor: { laborGroupId: "G1" } }, totalAmount: 100 },
      { col: { cycleId: "C2", labor: { laborGroupId: "G1" } }, totalAmount: 50 },
      { col: { cycleId: "C1", labor: { laborGroupId: "G2" } }, totalAmount: 300 },
      { col: { cycleId: "C1", labor: { laborGroupId: "GX" } }, totalAmount: 10 },
      { col: { cycleId: "C1", labor: {} }, totalAmount: 999 },
    ];
    expect(laborGroupTotals(data, byId).map((g) => [g.id, g.name, g.amount, [...g.cycleIds]])).toEqual([
      ["G2", "Cosecha", 300, ["C1"]],
      ["G1", "Riego", 150, ["C1", "C2"]],
      ["GX", "(grupo eliminado)", 10, ["C1"]],
    ]);
  });
});
