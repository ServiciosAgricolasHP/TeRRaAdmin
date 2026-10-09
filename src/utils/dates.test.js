import { describe, it, expect } from "vitest";
import { localIsoDate } from "./dates";

describe("localIsoDate", () => {
  it("usa el día local, también de noche", () => {
    // 23:30 hora local: en UTC ya sería el día siguiente en Chile.
    expect(localIsoDate(new Date(2026, 9, 9, 23, 30))).toBe("2026-10-09");
    expect(localIsoDate(new Date(2026, 9, 9, 0, 5))).toBe("2026-10-09");
  });

  it("rellena mes y día con cero", () => {
    expect(localIsoDate(new Date(2026, 0, 5, 12))).toBe("2026-01-05");
  });

  it("acepta un timestamp", () => {
    expect(localIsoDate(new Date(2026, 11, 31, 22).getTime())).toBe("2026-12-31");
  });

  it("devuelve vacío con una fecha inválida", () => {
    expect(localIsoDate(new Date("no es fecha"))).toBe("");
  });
});
