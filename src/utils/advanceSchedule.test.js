import { describe, it, expect } from "vitest";
import { applyFromLabel, applyFromOf, autoAppliedOf, holdReasonOf, isDeferred, nextSkippedIds, skippedIdsOf } from "./advanceSchedule";

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
    expect(autoAppliedOf(list, { today: "2026-11-26", skipped: new Set(["nov"]) }).map((a) => a.id)).toEqual(["sin"]);
    expect(autoAppliedOf(null, { today: "2026-11-26" })).toEqual([]);
  });

  it("la etiqueta muestra el día y el mes", () => {
    expect(applyFromLabel({ applyFrom: "2026-12-01" })).toBe("Desde 01-dic");
  });
});

describe("lo que una nómina deja fuera", () => {
  it("skippedIdsOf lee la lista de la nómina, o ninguna", () => {
    expect([...skippedIdsOf({ skippedAdvanceIds: ["a", "b"] })]).toEqual(["a", "b"]);
    expect(skippedIdsOf({}).size).toBe(0);
    expect(skippedIdsOf(null).size).toBe(0);
  });

  it("holdReasonOf dice por qué no se aplica solo: primero si se dejó fuera, después la fecha", () => {
    const skipped = new Set(["fuera"]);
    const today = "2026-11-26";
    expect(holdReasonOf({ id: "fuera", applyFrom: "2026-12-01" }, { skipped, today })).toBe("skipped");
    expect(holdReasonOf({ id: "dic", applyFrom: "2026-12-01" }, { skipped, today })).toBe("deferred");
    expect(holdReasonOf({ id: "libre" }, { skipped, today })).toBe(null);
  });

  it("nextSkippedIds suma lo que se deja fuera y saca lo que se vuelve a aplicar", () => {
    expect(nextSkippedIds(["a", "b"], { add: ["c", "a"], remove: ["b"] })).toEqual(["a", "c"]);
    expect(nextSkippedIds(undefined, { add: ["x"] })).toEqual(["x"]);
    expect(nextSkippedIds(["a"], {})).toEqual(["a"]);
  });
});
