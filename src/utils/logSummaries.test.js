import { describe, it, expect } from "vitest";
import { LOG_SIZE_LIMIT, fitLog, listChange, payrollItemsChange, summarizeChanges } from "./logSummaries";

const ana = { workerId: "W1", rut: "11111111-1", name: "Ana Rojas", grossAmount: 100000, advance: 0, bonus: 0, amount: 100000, workdayIds: ["d1", "d2"] };
const beto = { rut: "12345678-5", name: "Beto Soto", amount: 50000, workdayIds: ["d3"] };
const caro = { workerId: "W3", rut: "12345670-K", name: "Caro Díaz", grossAmount: 30000, amount: 30000, workdayIds: ["d4"] };

describe("payrollItemsChange", () => {
  it("dice quién entró, quién salió y a quién le cambiaron las cifras", () => {
    const anaLater = { ...ana, advance: 20000, amount: 80000 };
    const change = payrollItemsChange([ana, beto], [anaLater, caro]);
    expect(change.count).toEqual({ from: 2, to: 2 });
    expect(change.added.map((p) => [p.key, p.name, p.amount, p.days])).toEqual([["W3", "Caro Díaz", 30000, 1]]);
    // Sin `workerId`, la clave es el RUT; sin `grossAmount`, el bruto es el líquido.
    expect(change.removed.map((p) => [p.key, p.gross])).toEqual([["12345678-5", 50000]]);
    expect(change.changed).toEqual([{
      key: "W1", rut: "11111111-1", name: "Ana Rojas",
      from: { gross: 100000, advance: 0, bonus: 0, amount: 100000, days: 2 },
      to: { gross: 100000, advance: 20000, bonus: 0, amount: 80000, days: 2 },
    }]);
  });

  it("una persona igual no aparece", () => {
    expect(payrollItemsChange([ana], [{ ...ana }]).changed).toEqual([]);
  });
});

describe("listChange", () => {
  it("cuenta lo que había, lo que hay y lo que entró y salió", () => {
    expect(listChange(["a", "b", "c"], ["b", "c", "d", "e"])).toEqual({ summary: "list", from: 3, to: 4, added: 2, removed: 1 });
    expect(listChange([{ id: "x" }], [{ id: "x" }, { id: "y" }])).toMatchObject({ added: 1, removed: 0 });
  });
});

describe("summarizeChanges", () => {
  it("en la nómina resume las personas y las listas de ids, y deja el resto tal cual", () => {
    const out = summarizeChanges("payroll", {
      items: { from: [ana], to: [ana, caro] },
      workdayIds: { from: ["d1", "d2"], to: ["d1", "d2", "d4"] },
      total: { from: 100000, to: 130000 },
    });
    expect(out.items.summary).toBe("items");
    expect(out.workdayIds).toMatchObject({ from: 2, to: 3, added: 1 });
    expect(out.total).toEqual({ from: 100000, to: 130000 });
  });

  it("otra entidad queda igual", () => {
    const changes = { labors: { from: [1], to: [2] } };
    expect(summarizeChanges("cycle", changes)).toBe(changes);
    expect(summarizeChanges("payroll", null)).toBe(null);
  });
});

describe("fitLog", () => {
  it("un registro que no cabe queda sin el detalle, con los campos que cambiaron", () => {
    const small = { action: "update", changes: { name: { from: "a", to: "b" } } };
    expect(fitLog(small)).toBe(small);
    const big = { action: "update", changes: { blob: { from: "x".repeat(LOG_SIZE_LIMIT), to: "y" } }, before: null, after: null };
    expect(fitLog(big)).toMatchObject({ action: "update", changes: null, changedFields: ["blob"], truncated: true });
  });
});
