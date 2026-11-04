import { describe, it, expect } from "vitest";
import { monthTitle, buildContributionItems, contributionItem, contributionTotals, contributionsByFaena } from "./contributionLists";

const workersById = new Map([
  ["w1", { id: "w1", rut: "11111111-1", name: "Ana Pérez" }],
  ["w2", { id: "w2", rut: "12345678-5", name: "Beto Soto" }],
]);
const faenaNameOf = (id) => ({ aguada: "La Aguada" })[id] || "";

describe("lista de imposiciones", () => {
  const items = buildContributionItems(
    [
      { workerId: "w2", faenaId: "", days: 0, dates: [], request: "payslip", endDate: "", endReason: null },
      { workerId: "w1", faenaId: "aguada", days: 2, dates: ["2026-09-03", "2026-09-02"], request: "payslipAndSettlement", endDate: "2026-09-20", endReason: "jobEnd" },
    ],
    { workersById, faenaNameOf, earned: new Map([["w1", new Map([["2026-09-02", 30000], ["2026-09-03", 25000]])]]), dailyBase: 17967 },
  );

  it("el mes se escribe completo", () => {
    expect(monthTitle("2026-09")).toBe("Septiembre 2026");
    expect(monthTitle("xx")).toBe("xx");
  });

  it("arma las filas con la persona, la faena y lo que se pide", () => {
    expect(items.map((it) => [it.name, it.rut, it.faenaName, it.days, it.request, it.endDate])).toEqual([
      ["Ana Pérez", "11111111-1", "La Aguada", 2, "payslipAndSettlement", "2026-09-20"],
      ["Beto Soto", "12345678-5", "", 0, "payslip", ""],
    ]);
  });

  it("lleva las fechas con lo ganado, y el sueldo y el bono", () => {
    expect(items[0]).toMatchObject({
      dates: [{ date: "2026-09-02", amount: 30000 }, { date: "2026-09-03", amount: 25000 }],
      earned: 55000,
      baseSalary: 35934,
      bonus: 19066,
    });
    expect(items[1]).toMatchObject({ dates: [], earned: 0, baseSalary: 0, bonus: 0 });
  });

  it("al cambiar los días recalcula el sueldo y el bono con lo mismo ganado", () => {
    expect(contributionItem({ ...items[0], days: 3 }, 17967)).toMatchObject({ earned: 55000, baseSalary: 53901, bonus: 1099 });
  });

  it("agrupa por faena y deja al final a quien no trabajó", () => {
    expect(contributionsByFaena(items).map((g) => [g.faenaName, g.items.length, g.totals.days])).toEqual([
      ["La Aguada", 1, 2],
      ["Sin días trabajados", 1, 0],
    ]);
    expect(contributionTotals(items)).toEqual({ people: 2, days: 2, count: 2, settlements: 1, earned: 55000, baseSalary: 35934, bonus: 19066 });
  });
});
