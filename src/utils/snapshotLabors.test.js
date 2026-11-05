import { describe, it, expect } from "vitest";
import { cyclesMissingLabors, withLiveLabors, withMissingLabors, sameData } from "./snapshotLabors";

const COSECHA = { id: "L1", name: "Cosecha", type: "cosecha" };
const PODA = { id: "L2", name: "Poda", type: "trato" };

describe("cyclesMissingLabors", () => {
  const cycles = [{ id: "A", labors: [COSECHA] }, { id: "B", labors: [COSECHA, PODA] }];

  it("devuelve los ciclos que no conocen la labor de alguna jornada", () => {
    const workdays = [
      { cycleId: "A", laborId: "L1" },
      { cycleId: "A", laborId: "L2" },
      { cycleId: "B", laborId: "L2" },
    ];
    expect(cyclesMissingLabors(cycles, workdays)).toEqual(["A"]);
  });

  it("cuenta también un ciclo que no está en la lista", () => {
    expect(cyclesMissingLabors(cycles, [{ cycleId: "C", laborId: "L1" }])).toEqual(["C"]);
  });

  it("sin faltantes, devuelve una lista vacía", () => {
    expect(cyclesMissingLabors(cycles, [{ cycleId: "B", laborId: "L2" }, { cycleId: "A" }])).toEqual([]);
    expect(cyclesMissingLabors(null, null)).toEqual([]);
  });
});

describe("withLiveLabors", () => {
  const snapCycle = {
    id: "A",
    label: "Ciclo A",
    labors: [{ id: "L0", name: "Borrada", type: "main" }, COSECHA],
    dayPrices: { L0: { "2026-03-02": 1 }, L1: { "2026-03-02": 10 } },
  };

  it("toma la versión vigente de cada labor, suma las nuevas y conserva las que ya no están", () => {
    const live = {
      labors: [{ ...COSECHA, name: "Cosecha Arándanos" }, PODA],
      dayPrices: { L1: { "2026-03-02": 12 }, L2: { "2026-03-03": 5 } },
    };
    expect(withLiveLabors(snapCycle, live)).toEqual({
      id: "A",
      label: "Ciclo A",
      labors: [{ id: "L0", name: "Borrada", type: "main" }, { ...COSECHA, name: "Cosecha Arándanos" }, PODA],
      dayPrices: { L0: { "2026-03-02": 1 }, L1: { "2026-03-02": 12 }, L2: { "2026-03-03": 5 } },
    });
  });

  it("sin datos vigentes, deja el ciclo igual", () => {
    expect(withLiveLabors(snapCycle, undefined)).toBe(snapCycle);
  });

  it("con las mismas labores, el resultado es igual al ciclo guardado", () => {
    const live = { labors: [COSECHA], dayPrices: { L1: { "2026-03-02": 10 } } };
    expect(sameData(withLiveLabors(snapCycle, live), snapCycle)).toBe(true);
  });
});

describe("withMissingLabors", () => {
  const snapCycle = { id: "A", labors: [COSECHA], dayPrices: { L1: { "2026-03-02": 10 } } };
  const live = {
    labors: [{ ...COSECHA, name: "Cosecha Arándanos" }, PODA],
    dayPrices: { L1: { "2026-03-02": 99 }, L2: { "2026-03-03": 5 } },
  };

  it("suma solo las labores que faltan, con sus precios del día", () => {
    expect(withMissingLabors(snapCycle, live)).toEqual({
      id: "A",
      labors: [COSECHA, PODA],
      dayPrices: { L1: { "2026-03-02": 10 }, L2: { "2026-03-03": 5 } },
    });
  });

  it("sin labores que falten, deja el ciclo igual", () => {
    expect(withMissingLabors(snapCycle, { labors: [COSECHA] })).toBe(snapCycle);
    expect(withMissingLabors(snapCycle, null)).toBe(snapCycle);
  });
});

describe("sameData", () => {
  it("compara objetos sin importar el orden de las claves", () => {
    expect(sameData({ a: 1, b: { c: [1, 2] } }, { b: { c: [1, 2] }, a: 1 })).toBe(true);
  });

  it("distingue valores, largos y tipos distintos", () => {
    expect(sameData({ a: 1 }, { a: 2 })).toBe(false);
    expect(sameData([1, 2], [2, 1])).toBe(false);
    expect(sameData({ a: 1 }, { a: 1, b: null })).toBe(false);
    expect(sameData([], {})).toBe(false);
    expect(sameData(null, {})).toBe(false);
  });
});
