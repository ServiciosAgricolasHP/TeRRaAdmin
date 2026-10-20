import { describe, expect, it } from "vitest";
import { activeCyclesByJob, chosenCyclesOf, cycleStatsOf, exportCyclesOf, laborScopeOf } from "./payrollCycles";

const cycles = [
  { id: "C1", faenaId: "F1", labors: [{ id: "L1", type: "main" }, { id: "L2", type: "trato" }] },
  { id: "C2", faenaId: "F2", labors: [{ id: "L3", type: "main" }] },
  { id: "C3", faenaId: "F1", status: "closed", labors: [{ id: "L4", type: "main" }] },
];

describe("cycleStatsOf", () => {
  const workers = [
    { id: "A", bankDetails: ["A", "1", 3, "012"] },
    { id: "B", bankDetails: ["B", "", 3, "EFE"] },
    { id: "C", bankDetails: [] },
  ];
  const workdays = [
    { cycleId: "C1", laborId: "L1", workerRut: "A", date: "2026-10-02", amount: 1000 },
    { cycleId: "C1", laborId: "L1", workerRut: "B", date: "2026-10-01", amount: 500 },
    { cycleId: "C1", laborId: "L2", workerRut: "C", date: "2026-10-03", amount: 99, tiers: { t0: { qty: 1, amount: 300 }, t1: { qty: 1, amount: 200 } } },
    { cycleId: "C1", laborId: "L1", workerRut: "Z", date: "2026-10-04", amount: 700 },
    { cycleId: "C1", laborId: "L1", workerRut: "A", date: "2026-09-30", amount: 400, payrollId: "P1" },
    { cycleId: "C1", laborId: "L1", workerRut: "B", date: "2026-10-01", amount: 100, payrollId: "P2" },
    { cycleId: "C3", laborId: "L4", workerRut: "A", date: "2026-10-01", amount: 5000 },
  ];
  const stats = cycleStatsOf(cycles, workers, workdays);

  it("solo los ciclos activos, con total, pendiente y lo que entró a cada nómina", () => {
    expect(Object.keys(stats)).toEqual(["C1", "C2"]);
    const s = stats.C1;
    expect([s.total, s.unpaid, s.taken]).toEqual([3200, 2700, 500]);
    expect(s.takenByPayroll).toEqual({ P1: 400, P2: 100 });
    expect([s.firstDay, s.lastDay]).toEqual(["2026-09-30", "2026-10-04"]);
  });

  it("separa lo pendiente por medio de pago y por labor; el trato suma sus tiers", () => {
    const s = stats.C1;
    expect([s.unpaidBank, s.unpaidCash, s.unpaidUnknown]).toEqual([1000, 500, 1200]);
    expect(s.unpaidByLabor.L2).toEqual({ unpaid: 500, bank: 0, cash: 0, unknown: 500, ruts: new Set(["C"]) });
    expect([...s.unpaidByLabor.L1.ruts]).toEqual(["A", "B", "Z"]);
  });

  it("un ciclo activo sin jornadas queda en cero", () => {
    expect(stats.C2.total).toBe(0);
    expect(stats.C2.firstDay).toBe("");
  });
});

describe("activeCyclesByJob", () => {
  it("agrupa los abiertos por faena, en el orden de las faenas, sin faenas vacías", () => {
    const groups = activeCyclesByJob([{ id: "F2" }, { id: "F1" }, { id: "F9" }], cycles);
    expect(groups.map((g) => [g.faena.id, g.cycles.map((c) => c.id)])).toEqual([["F2", ["C2"]], ["F1", ["C1"]]]);
  });
});

describe("laborScopeOf y chosenCyclesOf", () => {
  it("todas las labores = sin lista; algunas = esas; ninguna elegida = []", () => {
    expect(laborScopeOf(cycles[0], new Map())).toBeUndefined();
    expect(laborScopeOf(cycles[0], new Map([["C1", new Set(["L1", "L2"])]]))).toBeUndefined();
    expect(laborScopeOf(cycles[0], new Map([["C1", new Set(["L2"])]]))).toEqual(["L2"]);
    expect(laborScopeOf(cycles[0], new Map([["C1", new Set()]]))).toEqual([]);
  });

  it("solo los elegidos que siguen abiertos", () => {
    const chosen = chosenCyclesOf(cycles, new Set(["C1", "C3", "C9"]), new Map([["C1", new Set(["L1"])]]));
    expect([...chosen]).toEqual([["C1", ["L1"]]]);
  });
});

describe("exportCyclesOf", () => {
  it("usa los nombres editados y el período guardado, o el del ciclo en memoria", () => {
    const p = {
      cycleLabelOverrides: { C1: "Corto" },
      cycleDetails: [
        { id: "C1", label: "Largo", faenaId: "F1", faenaName: "Fundo", subfaenaId: "S1", subfaenaName: "Sector", firstDay: "2026-10-01", lastDay: "2026-10-03" },
        { id: "C2", label: "Otro" },
        { id: "C9", label: "Borrado" },
      ],
    };
    const live = [{ id: "C2", days: ["2026-10-05", "2026-10-02"] }];
    expect(exportCyclesOf(p, live).map((c) => [c.id, c.label, c.firstDay, c.lastDay])).toEqual([
      ["C1", "Corto", "2026-10-01", "2026-10-03"],
      ["C2", "Otro", "2026-10-02", "2026-10-05"],
      ["C9", "Borrado", "", ""],
    ]);
  });

  it("sin cycleDetails, arma los ciclos desde cycleIds", () => {
    expect(exportCyclesOf({ cycleIds: ["C1", "C2"], cycleLabelOverrides: { C2: "Dos" } }, [])).toEqual([
      { id: "C1", label: "C1" },
      { id: "C2", label: "Dos" },
    ]);
  });
});
