import { describe, expect, it } from "vitest";
import {
  PAYROLL_CHECKS,
  alertSignature,
  alertsByPerson,
  applyReviewChange,
  checkSummary,
  payrollChecksOf,
  reviewDiff,
  reviewedByText,
  reviewedChecksFor,
  reviewedIndex,
  withReviews,
} from "./payrollChecks";

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

  it("la alerta de sin grupo trae el grupo sugerido", () => {
    const alerts = payrollChecksOf({ items, workdays, cycles, workers, today: "2026-11-17" });
    expect(alerts.find((a) => a.checkId === "missingGroup").suggestion).toEqual({ leader: "NORTE", reason: "el de sus compañeros de labor" });
    expect(alerts.find((a) => a.checkId === "zeroAmount")).not.toHaveProperty("suggestion");
  });

  it("la alerta de un grupo que no está en la lista trae ese grupo", () => {
    const alerts = payrollChecksOf({ items, workdays, cycles, workers, leaders: [{ name: "SUR", habilitado: true }], today: "2026-11-17" });
    expect(alerts.find((a) => a.checkId === "unknownGroup")).toMatchObject({ person: "2-7", missingLeader: "NORTE" });
    expect(alerts.find((a) => a.checkId === "zeroAmount")).not.toHaveProperty("missingLeader");
  });

  it("cada revisión tiene título y explicación, y sus ids no se repiten", () => {
    expect(new Set(PAYROLL_CHECKS.map((c) => c.id)).size).toBe(PAYROLL_CHECKS.length);
    for (const c of PAYROLL_CHECKS) expect(c.title && c.explanation && typeof c.run === "function").toBeTruthy();
  });

  it("una alerta de un prefijo QR no es de una persona", () => {
    const qrCycles = [{ id: "c1", label: "Ciclo Uno", days: ["2026-11-03"], labors: [{ id: "poda", name: "Poda", type: "main" }, { id: "cos", name: "Cosecha", type: "cosecha" }] }];
    const qrWorkdays = [{ id: "c1__cos__2-7__2026-11-03__1_1", cycleId: "c1", laborId: "cos", workerRut: "2-7", date: "2026-11-03", qty: 10, amount: 20000 }];
    const alerts = payrollChecksOf({ items: [{ ...items[1], workdayIds: [] }], workdays: qrWorkdays, cycles: qrCycles, workers, prefixes: [{ id: "HP", cycleId: "c1", laborId: "cos" }] });
    const qr = alerts.find((a) => a.checkId === "staleQrSync");
    expect(qr).toMatchObject({ key: "staleQrSync|HP", person: null, rut: "", name: "Prefijo QR HP", general: true, severity: "orange" });
    expect(alertsByPerson(alerts).has(null)).toBe(false);
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
    expect(reviewedIndex(reviewedChecks).get("firstPayment|2-7")).toEqual({ by: "u2", byName: "Luis", at: "2026-11-17T11:00:00Z", place: "", signature: "" });
  });

  it("el resumen cuenta solo lo que falta revisar de cada nivel", () => {
    const reviewed = withReviews(alerts, reviewedChecks);
    expect(reviewed.find((a) => a.key === "missingGroup|1-9").review.byName).toBe("Ana");
    expect(checkSummary(reviewed)).toEqual({ red: 1, orange: 0, info: 1, reviewed: 2 });
  });

  it("lo que se guarda lleva solo las claves de alertas vigentes", () => {
    const stale = [...reviewedChecks, { keys: ["sharedAccount|9-9"], by: "u3", byName: "Eva", at: "x" }];
    expect(reviewedChecksFor(stale, alerts)).toEqual([
      { keys: ["missingGroup|1-9", "firstPayment|2-7"], by: "u1", byName: "Ana", at: "2026-11-17T10:00:00Z" },
      { keys: ["firstPayment|2-7"], by: "u2", byName: "Luis", at: "2026-11-17T11:00:00Z" },
    ]);
  });

  it("una marca con huella vale mientras la alerta diga lo mismo", () => {
    const alert = alerts.find((a) => a.key === "missingGroup|1-9");
    const marked = [{ keys: [alert.key], by: "u1", byName: "Ana", at: "2026-11-17T10:00:00Z", place: "detail", signatures: { [alert.key]: alertSignature(alert) } }];
    expect(withReviews([alert], marked)[0].review).toMatchObject({ byName: "Ana", place: "detail" });
    const changed = withReviews([{ ...alert, lines: ["Otra cosa"] }], marked)[0];
    expect(changed.review).toBeNull();
    expect(changed.staleReview).toMatchObject({ byName: "Ana" });
  });

  it("la huella cambia con lo que dice la alerta", () => {
    expect(alertSignature({ lines: ["a", "b"] })).toBe(alertSignature({ lines: ["a", "b"] }));
    expect(alertSignature({ lines: ["a", "b"] })).not.toBe(alertSignature({ lines: ["a", "c"] }));
  });

  it("aplicar un cambio conserva lo que marcaron los demás", () => {
    const saved = [{ keys: ["a|1", "b|1"], by: "u1", byName: "Ana", at: "t1", place: "detail", signatures: { "a|1": "x", "b|1": "y" } }];
    const mark = { keys: ["c|2"], on: true, by: "u2", byName: "Luis", at: "t2", place: "detail", signatures: { "c|2": "z" } };
    expect(applyReviewChange(saved, mark)).toEqual([...saved, { keys: ["c|2"], by: "u2", byName: "Luis", at: "t2", place: "detail", signatures: { "c|2": "z" } }]);
    const unmark = { keys: ["a|1"], on: false, by: "u2", byName: "Luis", at: "t3", place: "detail", signatures: {} };
    expect(applyReviewChange(saved, unmark)).toEqual([{ keys: ["b|1"], by: "u1", byName: "Ana", at: "t1", place: "detail", signatures: { "b|1": "y" } }]);
  });

  it("dice qué se marcó y qué se desmarcó entre dos listas", () => {
    const from = [{ keys: ["a|1", "b|1"], at: "t1" }];
    const to = [{ keys: ["b|1"], at: "t1" }, { keys: ["c|2"], at: "t2" }];
    expect(reviewDiff(from, to)).toEqual({ marked: ["c|2"], unmarked: ["a|1"] });
  });

  it("nombra quién marcó, cuándo y dónde", () => {
    const at = new Date(2026, 10, 18, 7, 22).toISOString();
    expect(reviewedByText({ byName: "Bruno", at, place: "detail" })).toBe("Bruno, 18-nov 07:22, en el detalle");
    expect(reviewedByText({ byName: "Ana", place: "generate" })).toBe("Ana, en Generar");
  });

  it("agrupa las alertas por persona", () => {
    expect(alertsByPerson(alerts).get("1-9").map((a) => a.checkId)).toEqual(["zeroAmount", "missingGroup", "firstPayment"]);
  });
});
