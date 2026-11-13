import { describe, it, expect } from "vitest";
import { filterPayrollHistory, payrollHistoryOf } from "./payrollHistory";
import { summarizeChanges } from "./logSummaries";

const ts = (iso) => ({ seconds: Date.parse(iso) / 1000, nanoseconds: 0 });
const ana = { workerId: "W1", rut: "11111111-1", name: "Ana Rojas", grossAmount: 100000, advance: 0, bonus: 0, amount: 100000, workdayIds: ["d1", "d2"] };
const beto = { workerId: "W2", rut: "12345678-5", name: "Beto Soto", grossAmount: 50000, amount: 50000, workdayIds: ["d3"] };
const caro = { workerId: "W3", rut: "12345670-K", name: "Caro Díaz", grossAmount: 30000, amount: 30000, workdayIds: ["d4"] };

const created = { id: "l1", action: "create", timestamp: ts("2026-11-10T09:00:00Z"), email: "maria@ejemplo.cl", after: { items: [ana, beto], workdayIds: ["d1", "d2", "d3"], total: 150000 } };
// Un registro anterior: la lista de personas entera, antes y después.
const recalcOld = {
  id: "l2", action: "update", timestamp: ts("2026-11-11T10:00:00Z"), email: "bruno@ejemplo.cl",
  changes: {
    items: { from: [ana, beto], to: [{ ...ana, advance: 20000, amount: 80000 }, beto, caro] },
    total: { from: 150000, to: 160000 },
    updatedByName: { from: "María", to: "Bruno" },
    workerCount: { from: 2, to: 3 },
  },
};
// Uno nuevo: la lista resumida y quien firma.
const removed = {
  id: "l3", action: "update", timestamp: ts("2026-11-12T11:00:00Z"), userName: "María",
  changes: summarizeChanges("payroll", { items: { from: [ana, beto, caro], to: [ana, caro] } }),
};
const paid = {
  id: "l4", action: "update", timestamp: ts("2026-11-12T18:00:00Z"), userName: "Bruno",
  changes: { bankPaidAt: { from: null, to: "2026-11-12T18:00:00Z" }, cashPaidRuts: { from: [], to: ["12345678-5"] } },
};

describe("payrollHistoryOf", () => {
  const entries = payrollHistoryOf([created, recalcOld, removed, paid], [ana, caro]);

  it("ordena de lo más nuevo a lo más viejo, con quién y qué hizo", () => {
    expect(entries.map((e) => [e.id, e.who, e.title])).toEqual([
      ["l4", "Bruno", "Pagó las transferencias · Marcó quién cobró el efectivo"],
      ["l3", "María", "Sacó personas"],
      ["l2", "Bruno", "Recalculó"],
      ["l1", "maria", "Generó la nómina"],
    ]);
  });

  it("dice a quién le cambió algo, en registros anteriores y nuevos", () => {
    const byId = Object.fromEntries(entries.map((e) => [e.id, e.lines.map((l) => l.text)]));
    expect(byId.l1).toEqual(["2 personas · 3 jornadas · total $150.000"]);
    expect(byId.l2).toEqual([
      "+ entra Caro Díaz · 1 día · $30.000",
      "Ana Rojas: $100.000 → $80.000 (anticipo $0 → $20.000)",
      "Total: $150.000 → $160.000",
    ]);
    expect(byId.l3).toEqual(["− sale Beto Soto · tenía $50.000"]);
    // Quien cobró el efectivo se nombra aunque ya no esté en la nómina.
    expect(byId.l4).toEqual(["Cobró: Beto Soto"]);
  });

  it("un registro sin el detalle lo dice", () => {
    const [entry] = payrollHistoryOf([{ id: "t", action: "update", timestamp: ts("2026-11-12T12:00:00Z"), truncated: true, changedFields: ["items", "total"] }]);
    expect([entry.title, entry.truncated, entry.lines[0].text]).toEqual(["Editó la nómina", true, "El detalle no cupo en el registro. Cambió: items, total."]);
  });
});

describe("filterPayrollHistory", () => {
  const entries = payrollHistoryOf([created, recalcOld, removed, paid], [ana, caro]);

  it("por quién lo hizo", () => {
    expect(filterPayrollHistory(entries, { who: "María" }).map((e) => e.id)).toEqual(["l3"]);
  });

  it("por una persona, por nombre o RUT, con solo sus líneas", () => {
    const ana = filterPayrollHistory(entries, { query: "rojas" });
    expect(ana.map((e) => [e.id, e.lines.map((l) => l.text)])).toEqual([["l2", ["Ana Rojas: $100.000 → $80.000 (anticipo $0 → $20.000)"]]]);
    expect(filterPayrollHistory(entries, { query: "12345678" }).map((e) => e.id)).toEqual(["l3"]);
  });
});

describe("las entregas de anticipos en el historial", () => {
  const delivered = { ...ana, amount: 140000, payoutTotal: 40000 };
  const dana = { workerId: "W4", rut: "22222222-2", name: "Dana Ríos", grossAmount: 0, amount: 60000, payoutTotal: 60000, workdayIds: [] };
  const log = (id, from, to) => ({
    id, action: "update", timestamp: ts("2026-11-13T10:00:00Z"), userName: "María",
    changes: summarizeChanges("payroll", { items: { from, to } }),
  });

  it("nombra la entrega y el anticipo de cada persona", () => {
    const [entry] = payrollHistoryOf([log("p1", [ana, beto], [delivered, beto, dana])], []);
    expect(entry.title).toBe("Entregó anticipos");
    expect(entry.lines.map((l) => l.text)).toEqual([
      "+ entra Dana Ríos · 0 días · $60.000",
      "Ana Rojas: $100.000 → $140.000 (anticipo entregado $0 → $40.000)",
    ]);
  });

  it("nombra cuando se quitan, y sigue diciendo Recalculó si cambió algo más", () => {
    const [removal] = payrollHistoryOf([log("p2", [delivered, beto, dana], [ana, beto])], []);
    expect(removal.title).toBe("Quitó anticipos entregados");
    const [mixed] = payrollHistoryOf([log("p3", [ana, beto], [{ ...delivered, grossAmount: 90000, amount: 130000 }, beto])], []);
    expect(mixed.title).toBe("Recalculó");
  });
});
