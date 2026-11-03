import { describe, expect, it } from "vitest";
import {
  activeCyclesByJob, additionSummaryOf, chosenCyclesOf, cycleEditDiff, cycleChecklistOf, cycleStatsOf, editableCyclesOf, exportCyclesOf, laborScopeOf,
  pendingOfChosenLabors,
} from "./payrollCycles";

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

describe("pendingOfChosenLabors", () => {
  const stat = {
    unpaid: 900, unpaidBank: 600, unpaidCash: 200, unpaidUnknown: 100,
    unpaidByLabor: {
      L1: { unpaid: 700, bank: 600, cash: 100, unknown: 0 },
      L2: { unpaid: 200, bank: 0, cash: 100, unknown: 100 },
    },
  };
  it("sin elección o con todas las labores, es lo pendiente del ciclo entero", () => {
    expect(pendingOfChosenLabors(cycles[0], stat, new Map())).toEqual({ unpaid: 900, bank: 600, cash: 200, unknown: 100 });
    expect(pendingOfChosenLabors(cycles[0], stat, new Map([["C1", new Set(["L1", "L2"])]])).unpaid).toBe(900);
  });
  it("con algunas labores, suma solo las elegidas; sin ninguna, cero", () => {
    expect(pendingOfChosenLabors(cycles[0], stat, new Map([["C1", new Set(["L2"])]]))).toEqual({ unpaid: 200, bank: 0, cash: 100, unknown: 100 });
    expect(pendingOfChosenLabors(cycles[0], stat, new Map([["C1", new Set()]])).unpaid).toBe(0);
  });
});

describe("cycleChecklistOf", () => {
  const F1 = { id: "F1", name: "Fundo Uno" };
  const F2 = { id: "F2", name: "Fundo Dos" };
  const A = { id: "A", label: "Poda", subfaenaId: "S1", labors: [{ id: "L1" }, { id: "L2" }] };
  const B = { id: "B", label: "Raleo", subfaenaId: "S2", labors: [{ id: "L3" }] };
  const C = { id: "C", label: "Cosecha", subfaenaId: "S1", labors: [{ id: "L4" }] };
  const groups = [{ faena: F1, cycles: [A, B] }, { faena: F2, cycles: [C] }];
  const cycleStats = {
    A: {
      unpaid: 900, unpaidBank: 600, unpaidCash: 200, unpaidUnknown: 100,
      unpaidByLabor: { L1: { unpaid: 700, bank: 600, cash: 100, unknown: 0 }, L2: { unpaid: 200, bank: 0, cash: 100, unknown: 100 } },
    },
    B: { unpaid: 0, unpaidBank: 0, unpaidCash: 0, unpaidUnknown: 0, unpaidByLabor: {} },
    C: { unpaid: 50, unpaidBank: 0, unpaidCash: 50, unpaidUnknown: 0, unpaidByLabor: { L4: { unpaid: 50, bank: 0, cash: 50, unknown: 0 } } },
  };
  const subfaenaName = (id) => ({ S1: "Sector Norte", S2: "Sector Sur" })[id] || "";
  const base = { groups, cycleStats, selected: new Set(), selectedLaborsByCycle: new Map(), search: "", showEmpty: false, subfaenaName };
  const ids = (r) => r.visibleGroups.map((g) => [g.faena.id, g.rows.map((x) => x.cycle.id)]);

  it("esconde los ciclos sin pendiente salvo con \"Sin pendientes\" o si están marcados", () => {
    expect(ids(cycleChecklistOf(base))).toEqual([["F1", ["A"]], ["F2", ["C"]]]);
    expect(ids(cycleChecklistOf({ ...base, showEmpty: true }))).toEqual([["F1", ["A", "B"]], ["F2", ["C"]]]);
    expect(ids(cycleChecklistOf({ ...base, selected: new Set(["B"]) }))).toEqual([["F1", ["A", "B"]], ["F2", ["C"]]]);
  });

  it("totaliza lo pendiente por faena y en general, y cuenta los ciclos sin pendiente", () => {
    const r = cycleChecklistOf(base);
    expect([r.totalPending, r.pendingCount, r.emptyCount]).toEqual([950, 2, 1]);
    expect([r.pendingBank, r.pendingCash, r.pendingUnknown]).toEqual([600, 250, 100]);
    expect(r.visibleGroups.map((g) => [g.groupPending, g.groupBank, g.groupCash])).toEqual([[900, 600, 200], [50, 0, 50]]);
  });

  it("lo elegido respeta las labores destildadas", () => {
    const r = cycleChecklistOf({ ...base, selected: new Set(["A", "C"]), selectedLaborsByCycle: new Map([["A", new Set(["L2"])]]) });
    expect([r.selectedTotal, r.selectedBank, r.selectedCash, r.selectedUnknown]).toEqual([250, 0, 150, 100]);
  });

  it("busca por ciclo, subfaena o faena, en cualquier orden y sin tildes", () => {
    expect(ids(cycleChecklistOf({ ...base, search: "norte poda" }))).toEqual([["F1", ["A"]]]);
    expect(ids(cycleChecklistOf({ ...base, search: "fundo dos" }))).toEqual([["F2", ["C"]]]);
  });
});

describe("editableCyclesOf", () => {
  const jobs = [{ id: "F1" }, { id: "F2" }];
  const labors = (...ids) => ids.map((id) => ({ id, name: `Labor ${id}` }));
  const all = [
    { id: "A", faenaId: "F1", labors: labors("L1", "L2", "L3") },
    { id: "B", faenaId: "F1", labors: labors("L4") },
    { id: "C", faenaId: "F2", labors: labors("L5", "L6") },
    { id: "D", faenaId: "F2", labors: labors("L7") },
    { id: "E", faenaId: "F2", status: "closed", labors: labors("L8") },
    { id: "G", faenaId: "F9", labors: labors("L9") },
    { id: "H", faenaId: "F1", labors: labors("L10") },
    { id: "K", faenaId: "F1", status: "closed", labors: labors("L11") },
  ];
  const cycleStats = { A: { unpaid: 600 } };
  const payroll = {
    // A con L1, B entero en cycleDetails, C solo por días agregados a mano en
    // L6, H entero sin detalle (nómina antigua) y K cerrado pero en la nómina.
    cycleIds: ["A", "B", "C", "H", "K"],
    cycleDetails: [{ id: "A", laborIds: ["L1"] }, { id: "B" }, { id: "C", laborIds: [] }, { id: "K" }],
  };
  const lab = (id, jornadas, amount) => ({ id, jornadas, people: jornadas ? 1 : 0, amount, inScope: true });
  const cycleBreakdown = [
    { id: "A", amount: 100, labors: [lab("L1", 2, 100)] },
    { id: "B", amount: 50, labors: [lab("L4", 1, 50)] },
    { id: "C", amount: 30, labors: [{ ...lab("L6", 1, 30), inScope: false }] },
  ];
  const r = editableCyclesOf({ jobs, cycles: all, cycleStats, payroll, cycleBreakdown });

  it("muestra los abiertos y los de la nómina aunque estén cerrados, sin los de faenas que no están", () => {
    expect(r.groups.map((g) => [g.faena.id, g.cycles.map((c) => c.id)])).toEqual([["F1", ["A", "B", "H", "K"]], ["F2", ["C", "D"]]]);
    expect(r.groups[0].cycles[0]).toBe(all[0]);
    expect(r.stats).toBe(cycleStats);
  });

  it("parte con lo que la nómina paga: su alcance y las labores con días agregados a mano", () => {
    expect([...r.initial].map(([id, set]) => [id, [...set]])).toEqual([
      ["A", ["L1"]],
      ["B", ["L4"]],
      ["C", ["L6"]],
      ["H", ["L10"]],
      ["K", ["L11"]],
    ]);
  });

  it("guarda lo que la nómina paga de cada ciclo y de cada labor", () => {
    expect(r.part.get("A").amount).toBe(100);
    expect(r.part.get("C").labors.get("L6")).toMatchObject({ amount: 30, inScope: false });
    expect(r.part.get("H")).toEqual({ amount: 0, labors: new Map() });
    expect(r.part.has("D")).toBe(false);
  });

  it("los ciclos de la nómina se ven aunque no tengan pendiente, y no cuentan como sin pendientes", () => {
    const list = cycleChecklistOf({
      groups: r.groups, cycleStats: r.stats, selected: new Set(), selectedLaborsByCycle: new Map(),
      search: "", showEmpty: false, subfaenaName: () => "", keep: r.part,
    });
    expect(list.visibleGroups.map((g) => [g.faena.id, g.rows.map((row) => row.cycle.id)])).toEqual([["F1", ["A", "B", "H", "K"]], ["F2", ["C"]]]);
    expect(list.emptyCount).toBe(1);
  });
});

describe("cycleEditDiff", () => {
  const initial = new Map([
    ["A", new Set(["L1", "L2"])],
    ["B", new Set(["L4"])],
    ["C", new Set()],
  ]);
  const sel = (entries) => new Map(entries.map(([id, labs]) => [id, new Set(labs)]));
  const plain = ({ removed, added }) => ({
    removed: [...removed].map(([id, r]) => [id, r === true ? true : [...r]]),
    added: [...added].map(([id, set]) => [id, [...set]]),
  });

  it("sin cambios no saca ni agrega nada", () => {
    expect(plain(cycleEditDiff(initial, sel([["A", ["L1", "L2"]], ["B", ["L4"]], ["C", []]])))).toEqual({ removed: [], added: [] });
  });

  it("un ciclo desmarcado, o que queda sin labores, sale entero", () => {
    expect(plain(cycleEditDiff(initial, sel([["A", []], ["C", []]])))).toEqual({ removed: [["A", true], ["B", true]], added: [] });
  });

  it("saca las labores desmarcadas y agrega las nuevas, también en el mismo ciclo", () => {
    const diff = cycleEditDiff(initial, sel([["A", ["L2", "L3"]], ["B", ["L4"]], ["C", ["L5"]], ["D", ["L7"]]]));
    expect(plain(diff)).toEqual({
      removed: [["A", ["L1"]]],
      added: [["A", ["L3"]], ["C", ["L5"]], ["D", ["L7"]]],
    });
  });

  it("cambiar todas las labores de un ciclo por otras no lo saca entero", () => {
    expect(plain(cycleEditDiff(initial, sel([["A", ["L3"]], ["B", ["L4"]], ["C", []]])))).toEqual({
      removed: [["A", ["L1", "L2"]]],
      added: [["A", ["L3"]]],
    });
  });
});

describe("additionSummaryOf", () => {
  const cycles = [
    { id: "A", label: "Ciclo A", labors: [{ id: "L1", name: "Poda" }, { id: "L2", name: "Riego" }] },
    { id: "D", label: "Ciclo D", labors: [{ id: "L7", name: "Cosecha" }] },
    { id: "E", label: "Ciclo E", labors: [{ id: "L8", name: "Poda" }, { id: "L9", name: "Amarre" }] },
  ];
  const pl = (unpaid) => ({ unpaid });
  const stats = { A: { unpaidByLabor: { L2: pl(40) } }, D: { unpaidByLabor: { L7: pl(100) } }, E: { unpaidByLabor: { L8: pl(5), L9: pl(7) } } };
  const initial = new Map([["A", new Set(["L1"])]]);

  it("cuenta ciclos nuevos y labores sumadas, con lo pendiente de lo que entra", () => {
    const added = new Map([["A", new Set(["L2"])], ["D", new Set(["L7"])], ["E", new Set(["L9"])]]);
    expect(additionSummaryOf(added, { cycles, stats, initial })).toEqual({
      cyclesIn: 2,
      laborsIn: 1,
      amount: 147,
      lines: ["Ciclo A: Riego", "Ciclo D (ciclo entero)", "Ciclo E: Amarre"],
    });
  });

  it("sin nada que entre queda en cero", () => {
    expect(additionSummaryOf(new Map(), { cycles, stats, initial })).toEqual({ cyclesIn: 0, laborsIn: 0, amount: 0, lines: [] });
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
