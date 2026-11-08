import { describe, it, expect } from "vitest";
import { applyCycleChanges, cyclesToDrop, groupByCycle } from "./workdayCycles";

const wd = (id, cycleId, qty = 1) => ({ id, cycleId, qty });

describe("applyCycleChanges", () => {
  const list = [wd("a", "C1"), wd("b", "C1")];

  it("reemplaza las que cambiaron y agrega las nuevas del ciclo", () => {
    const out = applyCycleChanges(list, [wd("b", "C1", 5), wd("c", "C1")], "C1");
    expect(out.map((d) => [d.id, d.qty])).toEqual([["a", 1], ["b", 5], ["c", 1]]);
  });

  it("saca una que pasó a otro ciclo", () => {
    expect(applyCycleChanges(list, [wd("a", "C2")], "C1").map((d) => d.id)).toEqual(["b"]);
  });

  it("si nada es del ciclo, devuelve la misma copia", () => {
    expect(applyCycleChanges(list, [wd("x", "C2")], "C1")).toBe(list);
  });

  it("no toca la lista original", () => {
    applyCycleChanges(list, [wd("c", "C1")], "C1");
    expect(list).toHaveLength(2);
  });
});

describe("groupByCycle", () => {
  it("reparte por ciclo, con una entrada vacía para el ciclo sin jornadas", () => {
    const out = groupByCycle([wd("a", "C1"), wd("b", "C2"), wd("c", "C1")], ["C1", "C2", "C3"]);
    expect([...out].map(([id, docs]) => [id, docs.map((d) => d.id)])).toEqual([
      ["C1", ["a", "c"]],
      ["C2", ["b"]],
      ["C3", []],
    ]);
  });
});

describe("cyclesToDrop", () => {
  it("suelta los que no se usan hace el plazo o más", () => {
    const cycles = { C1: { usedAt: 100 }, C2: { usedAt: 400 }, C3: {} };
    expect(cyclesToDrop(cycles, 500, 400)).toEqual(["C1", "C3"]);
  });
});
