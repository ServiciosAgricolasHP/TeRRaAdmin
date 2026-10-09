import { describe, it, expect } from "vitest";
import { dayHasData } from "./cycleRowUtils";

const D = "2026-10-09";

describe("dayHasData", () => {
  it("cuenta el monto plano de una labor al día", () => {
    expect(dayHasData({ [D]: 25000 }, D)).toBe(true);
    expect(dayHasData({ [D]: 0 }, D)).toBe(false);
  });

  it("cuenta cualquier campo __amt del día", () => {
    expect(dayHasData({ [`${D}__amt`]: 30000 }, D)).toBe(true);
    expect(dayHasData({ [`${D}__t0__amt`]: 1200 }, D)).toBe(true);
    expect(dayHasData({ [`${D}__amt`]: 0 }, D)).toBe(false);
  });

  it("no mira otros días", () => {
    expect(dayHasData({ "2026-10-10": 25000, "2026-10-10__amt": 1 }, D)).toBe(false);
  });

  it("en una fila mensual cuenta la asistencia en $0", () => {
    expect(dayHasData({ _monthly: true, [D]: 0, [`${D}__present`]: true }, D)).toBe(true);
    expect(dayHasData({ _monthly: true, [`${D}__amt`]: 0, [`${D}__present`]: true }, D)).toBe(true);
    expect(dayHasData({ _monthly: true, [`${D}__present`]: false }, D)).toBe(false);
  });

  it("fuera de una fila mensual, una jornada en $0 no cuenta como dato", () => {
    expect(dayHasData({ [D]: 0, [`${D}__present`]: true }, D)).toBe(false);
  });
});
