import { describe, it, expect } from "vitest";
import { rowEndIndex } from "./gridRows";

describe("rowEndIndex", () => {
  it("da el último de la fila, o el último de la grilla en la fila incompleta", () => {
    expect(rowEndIndex(0, 10, 4)).toBe(3);
    expect(rowEndIndex(5, 10, 4)).toBe(7);
    expect(rowEndIndex(9, 10, 4)).toBe(9);
    expect(rowEndIndex(8, 10, 3)).toBe(8);
  });

  it("con una columna, es el mismo elemento", () => {
    expect(rowEndIndex(2, 5, 1)).toBe(2);
    expect(rowEndIndex(2, 5, 0)).toBe(2);
  });

  it("fuera de la grilla, -1", () => {
    expect(rowEndIndex(-1, 5, 3)).toBe(-1);
    expect(rowEndIndex(5, 5, 3)).toBe(-1);
  });
});
