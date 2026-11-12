import { describe, it, expect } from "vitest";
import { shortCycleName, switchableCycles } from "./cycleSwitch";

const subjobs = [{ id: "S1", name: "Poda" }, { id: "S2", name: "Amarre" }];
const cycle = (id, subfaenaId, name, day, extra = {}) => ({
  id, faenaId: "F1", subfaenaId, label: `Fundo/${subjobs.find((s) => s.id === subfaenaId)?.name || "X"}/${name}`, days: [day], ...extra,
});
const cycles = [
  cycle("c2", "S1", "Ciclo 2", "2026-10-10"),
  cycle("c1", "S1", "Ciclo 1", "2026-10-01", { status: "closed" }),
  cycle("c3", "S1", "Ciclo 3", "2026-10-20"),
  cycle("a1", "S2", "Ciclo 1", "2026-10-05"),
  cycle("a0", "S2", "Ciclo 0", "2026-09-01", { status: "closed" }),
  { id: "x1", faenaId: "F1", label: "Suelto", days: ["2026-10-02"] },
  { ...cycle("o1", "S1", "Ciclo 9", "2026-10-03"), faenaId: "F2" },
];
const shape = (groups) => groups.map((g) => [g.name, g.cycles.map((c) => `${c.name}${c.current ? "*" : ""}`)]);

describe("shortCycleName", () => {
  it("saca el prefijo de faena y subfaena de la etiqueta", () => {
    expect(shortCycleName({ label: "Fundo/Poda/Ciclo 6" })).toBe("Ciclo 6");
    expect(shortCycleName({ label: "Suelto" })).toBe("Suelto");
    expect(shortCycleName({ id: "c9" })).toBe("c9");
  });
});

describe("switchableCycles", () => {
  it("trae los ciclos activos de la faena, por subfaena y por su primer día", () => {
    expect(shape(switchableCycles({ cycles, subjobs, jobId: "F1", currentId: "c2" }))).toEqual([
      ["Amarre", ["Ciclo 1"]],
      ["Poda", ["Ciclo 2*", "Ciclo 3"]],
      ["Sin subfaena", ["Suelto"]],
    ]);
  });

  it("el ciclo abierto entra aunque esté cerrado", () => {
    expect(shape(switchableCycles({ cycles, subjobs, jobId: "F1", currentId: "c1" }))[1]).toEqual(["Poda", ["Ciclo 1*", "Ciclo 2", "Ciclo 3"]]);
  });

  it("busca por subfaena o por ciclo, y sin faena no trae nada", () => {
    expect(shape(switchableCycles({ cycles, subjobs, jobId: "F1", search: "amarre" }))).toEqual([["Amarre", ["Ciclo 1"]]]);
    expect(shape(switchableCycles({ cycles, subjobs, jobId: "F1", search: "ciclo 3" }))).toEqual([["Poda", ["Ciclo 3"]]]);
    expect(switchableCycles({ cycles, subjobs, jobId: "" })).toEqual([]);
  });
});
