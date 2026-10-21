import { describe, it, expect } from "vitest";
import { monthTitle, buildContributionItems, contributionTotals, contributionsByFaena } from "./contributionLists";

const workersById = new Map([
  ["w1", { id: "w1", rut: "11111111-1", name: "Ana Pérez" }],
  ["w2", { id: "w2", rut: "12345678-5", name: "Beto Soto" }],
]);
const faenaNameOf = (id) => ({ aguada: "La Aguada" })[id] || "";

describe("lista de imposiciones", () => {
  const items = buildContributionItems(
    [
      { workerId: "w2", faenaId: "", days: 0, request: "payslip", endDate: "", endReason: null },
      { workerId: "w1", faenaId: "aguada", days: 12, request: "payslipAndSettlement", endDate: "2026-09-20", endReason: "jobEnd" },
    ],
    { workersById, faenaNameOf },
  );

  it("el mes se escribe completo", () => {
    expect(monthTitle("2026-09")).toBe("Septiembre 2026");
    expect(monthTitle("xx")).toBe("xx");
  });

  it("arma las filas con la persona, la faena y lo que se pide", () => {
    expect(items.map((it) => [it.name, it.rut, it.faenaName, it.days, it.request, it.endDate])).toEqual([
      ["Ana Pérez", "11111111-1", "La Aguada", 12, "payslipAndSettlement", "2026-09-20"],
      ["Beto Soto", "12345678-5", "", 0, "payslip", ""],
    ]);
  });

  it("agrupa por faena y deja al final a quien no trabajó", () => {
    expect(contributionsByFaena(items).map((g) => [g.faenaName, g.items.length, g.totals.days])).toEqual([
      ["La Aguada", 1, 12],
      ["Sin días trabajados", 1, 0],
    ]);
    expect(contributionTotals(items)).toEqual({ people: 2, days: 12, count: 2, settlements: 1 });
  });
});
