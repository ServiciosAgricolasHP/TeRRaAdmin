import { describe, it, expect } from "vitest";
import { applyFromLabel, applyFromOf, autoAppliedOf, isDeferred } from "./advanceSchedule";

describe("fecha de inicio de un anticipo o bono", () => {
  it("sin fecha de inicio se aplica siempre", () => {
    expect(isDeferred({ id: "a" }, "2026-11-26")).toBe(false);
    expect(isDeferred({ id: "a", applyFrom: null }, "2026-11-26")).toBe(false);
    expect(applyFromOf({ id: "a" })).toBe("");
    expect(applyFromLabel({ id: "a" })).toBe("");
  });

  it("antes de la fecha queda en espera y desde ese día se aplica", () => {
    const adv = { id: "a", applyFrom: "2026-12-01" };
    expect(isDeferred(adv, "2026-11-30")).toBe(true);
    expect(isDeferred(adv, "2026-12-01")).toBe(false);
    expect(isDeferred(adv, "2026-12-15")).toBe(false);
  });

  it("autoAppliedOf deja solo los que ya llegaron a su fecha", () => {
    const list = [
      { id: "sin" },
      { id: "dic", applyFrom: "2026-12-01" },
      { id: "nov", applyFrom: "2026-11-01" },
    ];
    expect(autoAppliedOf(list, { today: "2026-11-26" }).map((a) => a.id)).toEqual(["sin", "nov"]);
    expect(autoAppliedOf(null, { today: "2026-11-26" })).toEqual([]);
  });

  it("la etiqueta muestra el día y el mes", () => {
    expect(applyFromLabel({ applyFrom: "2026-12-01" })).toBe("Desde 01-dic");
  });
});
