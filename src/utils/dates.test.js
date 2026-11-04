import { describe, it, expect } from "vitest";
import { localIsoDate, monthCells } from "./dates";

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

describe("monthCells", () => {
  it("arma el mes con la semana desde el lunes y completa las semanas", () => {
    const oct = monthCells("2026-10");
    expect(oct.slice(0, 4)).toEqual([null, null, null, "2026-10-01"]);
    expect(oct.indexOf("2026-10-05") % 7).toBe(0);
    expect(oct.length % 7).toBe(0);
    expect(oct.filter(Boolean)).toHaveLength(31);
    expect(monthCells("2026-02").filter(Boolean)).toHaveLength(28);
    expect(monthCells("2026-06")[0]).toBe("2026-06-01");
  });
});
