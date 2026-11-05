import { describe, it, expect } from "vitest";
import { progressOf } from "./progressSteps";

const STEPS = {
  tag: { step: "Etiquetando las jornadas...", unit: "Jornadas", from: 20, to: 70 },
  snapshot: { step: "Guardando el JSON de la nómina...", from: 85, to: 85 },
};

describe("progressOf", () => {
  it("el paso que cuenta avanza dentro de su tramo y dice cuántas van", () => {
    expect(progressOf(STEPS, "tag", 50, 100)).toEqual({ step: "Etiquetando las jornadas...", detail: "Jornadas 50/100", percent: 45 });
    expect(progressOf(STEPS, "tag", 0, 0)).toMatchObject({ detail: "", percent: 20 });
  });

  it("un paso sin cuenta queda en su punto, y uno desconocido devuelve null", () => {
    expect(progressOf(STEPS, "snapshot")).toEqual({ step: "Guardando el JSON de la nómina...", detail: "", percent: 85 });
    expect(progressOf(STEPS, "otro", 1, 2)).toBeNull();
  });
});
