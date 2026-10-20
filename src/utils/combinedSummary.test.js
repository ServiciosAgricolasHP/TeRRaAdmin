import { describe, expect, it } from "vitest";
import {
  activeDaysOf,
  cellsByLaborDay,
  closingTotals,
  columnPct,
  columnProfit,
  columnTotalGeneral,
  totalsByDayOf,
} from "./combinedSummary";

const col = (key, type) => ({ key, labor: { type, name: key }, cycleId: "C1", cycleLabel: "Ciclo 1" });
const base = { generalPct: 40, pctOverrides: {}, paidToUs: {}, workersPaid: {} };

describe("columnPct", () => {
  it("el propio si se editó, si no el general", () => {
    expect(columnPct("a", base)).toBe(40);
    expect(columnPct("a", { ...base, pctOverrides: { a: 55 } })).toBe(55);
    expect(columnPct("a", { ...base, pctOverrides: { a: 0 } })).toBe(0);
  });
});

describe("columnProfit y columnTotalGeneral", () => {
  it("cosecha, trato y por etapas: monto × %", () => {
    const c = col("cosecha", "cosecha");
    expect(columnProfit(c, 49000, { ...base, pctOverrides: { cosecha: 55 } })).toBe(26950);
    expect(columnTotalGeneral(c, 49000, { ...base, pctOverrides: { cosecha: 55 } })).toBe(75950);
    expect(columnProfit(col("t", "trato"), 31000, { ...base, generalPct: 30 })).toBe(9300);
  });

  it("pago al día: lo que paga el cliente menos el monto", () => {
    const c = col("main", "main");
    expect(columnProfit(c, 159000, { ...base, paidToUs: { main: "250000" } })).toBe(91000);
    expect(columnProfit(c, 85000, base)).toBe(-85000);
    expect(columnTotalGeneral(c, 159000, { ...base, paidToUs: { main: "250000" } })).toBe(250000);
  });

  it("pago al día ya pagado a los trabajadores: la ganancia y el total son lo que paga el cliente", () => {
    const c = col("main", "main");
    const s = { ...base, paidToUs: { main: 100000 }, workersPaid: { main: true } };
    expect(columnProfit(c, 28000, s)).toBe(100000);
    expect(columnTotalGeneral(c, 28000, s)).toBe(100000);
  });

  it("supervisión: descuenta su monto entero y su total general es $0", () => {
    const c = col("sup", "supervision");
    expect(columnProfit(c, 135000, base)).toBe(-135000);
    expect(columnTotalGeneral(c, 135000, base)).toBe(0);
  });
});

describe("días y celdas", () => {
  const dataByColumn = [
    { col: col("a", "main"), totalAmount: 30, rows: [{ day: "2026-10-05", cell: { amount: 10 } }, { day: "2026-10-03", cell: { amount: 20 } }] },
    { col: col("b", "cosecha"), totalAmount: 5, rows: [{ day: "2026-10-05", cell: { amount: 5 } }] },
  ];

  it("los días con algún dato, ordenados, y el total de cada día", () => {
    const days = activeDaysOf(dataByColumn);
    expect(days).toEqual(["2026-10-03", "2026-10-05"]);
    const byLaborDay = cellsByLaborDay(dataByColumn);
    expect(byLaborDay.get("b").get("2026-10-05")).toEqual({ amount: 5 });
    expect([...totalsByDayOf(days, dataByColumn, byLaborDay)]).toEqual([["2026-10-03", 20], ["2026-10-05", 15]]);
  });
});

describe("closingTotals", () => {
  const dataByColumn = [
    { col: col("main", "main"), totalAmount: 159000 },
    { col: col("cosecha", "cosecha"), totalAmount: 49000 },
    { col: col("sup", "supervision"), totalAmount: 135000 },
  ];
  const settings = { ...base, generalPct: 30, pctOverrides: { cosecha: 55 }, paidToUs: { main: "250000" } };

  it("ganancias sin supervisión, monto libre con ella y el total general sin supervisión", () => {
    expect(closingTotals(dataByColumn, settings)).toEqual({
      grandTotal: 343000,
      totalProfit: 91000 + 26950 - 135000,
      totalProfitBillable: 91000 + 26950,
      totalSupervisionDeduction: -135000,
      hasSupervisionCols: true,
      grandTotalGeneral: 250000 + 75950,
      grandTotalVat: (250000 + 75950) * 0.19,
      grandTotalGross: (250000 + 75950) * 1.19,
    });
  });

  it("sin columnas, todo en cero", () => {
    expect(closingTotals([], base)).toMatchObject({ grandTotal: 0, totalProfit: 0, hasSupervisionCols: false, grandTotalGeneral: 0 });
  });
});
