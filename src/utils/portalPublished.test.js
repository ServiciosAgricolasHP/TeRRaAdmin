import { describe, expect, it } from "vitest";
import { publishedPayrollsOf } from "./portalPublished";

describe("publishedPayrollsOf", () => {
  it("sin cabecera no hay ninguna publicada", () => {
    expect(publishedPayrollsOf(null)).toEqual([]);
    expect(publishedPayrollsOf({})).toEqual([]);
    expect(publishedPayrollsOf({ version: 2, payrolls: [] })).toEqual([]);
  });

  it("devuelve la lista de publicadas en su orden", () => {
    const meta = {
      version: 2,
      payrolls: [
        { payrollId: "p2", name: "Semana 43" },
        { payrollId: "p1", name: "Semana 42" },
        { name: "sin id" },
      ],
    };
    expect(publishedPayrollsOf(meta).map((p) => p.payrollId)).toEqual(["p2", "p1"]);
  });

  it("con la forma de una sola nómina, devuelve esa", () => {
    const meta = {
      version: 1,
      payrollId: "p1",
      payroll: { name: "Semana 42", status: "paid" },
      generatedAt: "2026-10-15T13:00:00.000Z",
      workerCount: 12,
      publishedAt: "2026-10-16T10:00:00.000Z",
    };
    expect(publishedPayrollsOf(meta)).toEqual([
      {
        payrollId: "p1",
        name: "Semana 42",
        status: "paid",
        generatedAt: "2026-10-15T13:00:00.000Z",
        workerCount: 12,
        publishedAt: "2026-10-16T10:00:00.000Z",
      },
    ]);
  });
});
