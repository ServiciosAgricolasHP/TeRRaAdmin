import { describe, expect, it } from "vitest";
import { rowFlag, worstOpenSeverity } from "./checkSeverity";

describe("worstOpenSeverity", () => {
  it("da el nivel más grave sin revisar", () => {
    const alerts = [{ severity: "info" }, { severity: "red", review: { byName: "Ana" } }, { severity: "orange" }];
    expect(worstOpenSeverity(alerts)).toBe("orange");
  });

  it("una persona sin alertas, con la lista en null o sin lista, no tiene nivel", () => {
    expect(worstOpenSeverity(null)).toBeNull();
    expect(worstOpenSeverity(undefined)).toBeNull();
    expect(worstOpenSeverity([])).toBeNull();
  });
});

describe("rowFlag", () => {
  it("marca la fila solo con rojas o naranjas sin revisar, y no se cae sin alertas", () => {
    expect(rowFlag([{ severity: "red" }])).toBe("red");
    expect(rowFlag([{ severity: "info" }])).toBeNull();
    expect(rowFlag(null)).toBeNull();
  });
});
