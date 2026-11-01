import { describe, it, expect } from "vitest";
import { applyMonthChanges, monthOfDate, monthsToDrop } from "./workdayMonths";

const wd = (id, date, qty = 1) => ({ id, date, qty });

describe("monthOfDate", () => {
  it("toma el año y el mes de una fecha", () => {
    expect(monthOfDate("2026-10-05")).toBe("2026-10");
    expect(monthOfDate(undefined)).toBe("");
  });
});

describe("applyMonthChanges", () => {
  const list = [wd("a", "2026-10-01"), wd("b", "2026-10-02")];

  it("reemplaza las que cambiaron y agrega las nuevas del mes", () => {
    const out = applyMonthChanges(list, [wd("b", "2026-10-02", 5), wd("c", "2026-10-09")], "2026-10");
    expect(out.map((d) => [d.id, d.qty])).toEqual([["a", 1], ["b", 5], ["c", 1]]);
  });

  it("ignora las de otro mes y saca una que ya no es del mes", () => {
    const out = applyMonthChanges(list, [wd("x", "2026-09-30"), wd("a", "2026-11-01")], "2026-10");
    expect(out.map((d) => d.id)).toEqual(["b"]);
  });

  it("no toca la lista original", () => {
    applyMonthChanges(list, [wd("c", "2026-10-09")], "2026-10");
    expect(list).toHaveLength(2);
  });
});

describe("monthsToDrop", () => {
  it("deja los más usados y suelta el resto", () => {
    const months = {
      "2026-07": { usedAt: 100 },
      "2026-08": { usedAt: 400 },
      "2026-09": { usedAt: 300 },
      "2026-10": { usedAt: 500 },
    };
    expect(monthsToDrop(months, 2)).toEqual(["2026-09", "2026-07"]);
    expect(monthsToDrop(months, 6)).toEqual([]);
  });
});
