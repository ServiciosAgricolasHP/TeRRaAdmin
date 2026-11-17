import { describe, expect, it } from "vitest";
import { PAYROLL_CHECKS, alertsByPerson, checkSummary, payrollChecksOf, reviewedIndex, withReviews } from "./payrollChecks";

const workers = [
  { id: "1-9", rut: "1-9", name: "ANA PÉREZ" },
  { id: "2-7", rut: "2-7", name: "LUIS SOTO" },
];
const cycles = [{ id: "c1", label: "Ciclo Uno", days: ["2026-11-03"], labors: [{ id: "poda", name: "Poda", type: "main" }] }];
const items = [
  { rut: "1-9", workerId: "1-9", name: "ANA PÉREZ", bankCode: "EFE", groupLeader: "", amount: 0, grossAmount: 0 },
  { rut: "2-7", workerId: "2-7", name: "LUIS SOTO", bankCode: "EFE", groupLeader: "NORTE", amount: 20000, grossAmount: 20000 },
];
const workdays = [
  { id: "w1", cycleId: "c1", laborId: "poda", workerRut: "1-9", date: "2026-11-03", amount: 0 },
  { id: "w2", cycleId: "c1", laborId: "poda", workerRut: "2-7", date: "2026-11-03", amount: 20000 },
];

describe("payrollChecksOf", () => {
  it("junta las alertas con su clave, de la más grave a la más leve", () => {
    const alerts = payrollChecksOf({ items, workdays, cycles, workers, today: "2026-11-17" });
    expect(alerts.map((a) => [a.key, a.severity])).toEqual([
      ["zeroAmount|1-9", "red"],
      ["missingGroup|1-9", "red"],
      ["firstPayment|1-9", "info"],
      ["firstPayment|2-7", "info"],
    ]);
    expect(alerts[0]).toMatchObject({ checkId: "zeroAmount", person: "1-9", rut: "1-9", name: "ANA PÉREZ" });
  });

  it("cada revisión tiene título y explicación, y sus ids no se repiten", () => {
    expect(new Set(PAYROLL_CHECKS.map((c) => c.id)).size).toBe(PAYROLL_CHECKS.length);
    for (const c of PAYROLL_CHECKS) expect(c.title && c.explanation && typeof c.run === "function").toBeTruthy();
  });

  it("una nómina sin datos no tiene alertas", () => {
    expect(payrollChecksOf({})).toEqual([]);
  });
});

describe("revisadas", () => {
  const alerts = payrollChecksOf({ items, workdays, cycles, workers, today: "2026-11-17" });
  const reviewedChecks = [
    { keys: ["missingGroup|1-9", "firstPayment|2-7"], by: "u1", byName: "Ana", at: "2026-11-17T10:00:00Z" },
    { keys: ["firstPayment|2-7"], by: "u2", byName: "Luis", at: "2026-11-17T11:00:00Z" },
  ];

  it("la última marca de una clave manda", () => {
    expect(reviewedIndex(reviewedChecks).get("firstPayment|2-7")).toEqual({ by: "u2", byName: "Luis", at: "2026-11-17T11:00:00Z" });
  });

  it("el resumen cuenta solo lo que falta revisar de cada nivel", () => {
    const reviewed = withReviews(alerts, reviewedChecks);
    expect(reviewed.find((a) => a.key === "missingGroup|1-9").review.byName).toBe("Ana");
    expect(checkSummary(reviewed)).toEqual({ red: 1, orange: 0, info: 1, reviewed: 2 });
  });

  it("agrupa las alertas por persona", () => {
    expect(alertsByPerson(alerts).get("1-9").map((a) => a.checkId)).toEqual(["zeroAmount", "missingGroup", "firstPayment"]);
  });
});
