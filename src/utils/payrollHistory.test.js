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
    expect([entry.title, entry.truncated, entry.lines[0].text]).toEqual(["Editó la nómina", true, "El detalle no cupo en el registro. Cambió: personas, total."]);
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

describe("el JSON de la nómina en el historial", () => {
  const at = "2026-11-18T10:22:00Z";
  const payrollLog = { id: "n1", entity: "payroll", action: "update", uid: "u1", userName: "Bruno", timestamp: ts(at),
    changes: summarizeChanges("payroll", { items: { from: [ana], to: [{ ...ana, amount: 90000, advance: 10000 }] }, total: { from: 100000, to: 90000 } }) };
  const snapshotLog = (id, iso, extra = {}) => ({
    id, entity: "payrollSnapshot", action: "update", uid: "u1", userName: "Bruno", timestamp: ts(iso),
    changes: summarizeChanges("payrollSnapshot", {
      workers: { from: [ana], to: [{ ...ana, amount: 90000, advance: 10000 }] },
      workdays: { from: [{ id: "d1" }, { id: "d2" }], to: [{ id: "d1" }, { id: "d2" }, { id: "d5" }] },
      cycles: { from: [{ id: "c1" }], to: [{ id: "c1" }] },
      payroll: { from: { total: 100000 }, to: { total: 90000 } },
      ...extra,
    }),
  });

  it("al generarlo cuenta las jornadas de `meta`, porque la cabecera no las trae", () => {
    const created = { id: "s0", entity: "payrollSnapshot", action: "create", uid: "u1", userName: "Bruno", timestamp: ts(at), after: { workers: [ana, beto] }, meta: { workdays: 3000, workdayParts: 3 } };
    const old = { ...created, id: "s00", after: { workers: [ana], workdays: [{ id: "d1" }, { id: "d2" }] }, meta: null };
    expect(payrollHistoryOf([created])[0].lines[0].text).toBe("2 personas · 3.000 jornadas");
    expect(payrollHistoryOf([old])[0].lines[0].text).toBe("1 personas · 2 jornadas");
  });

  it("solo, dice qué cambió en el JSON, con los nombres en español", () => {
    const [entry] = payrollHistoryOf([snapshotLog("s1", at, { version: { from: 1, to: 2 } })]);
    expect(entry.title).toBe("Puso al día el JSON de la nómina");
    expect(entry.lines.map((l) => l.text)).toEqual([
      "Ana Rojas: $100.000 → $90.000 (anticipo $0 → $10.000)",
      "Jornadas: 2 → 3 (+1)",
      "Ciclos: 1, al día",
      "Total: $100.000 → $90.000",
      "También cambió: versión",
    ]);
  });

  it("junto al cambio de la nómina, no va solo: suma una línea a esa entrada", () => {
    const entries = payrollHistoryOf([payrollLog, snapshotLog("s1", "2026-11-18T10:22:01Z")]);
    expect(entries.map((e) => e.id)).toEqual(["n1"]);
    expect(entries[0].lines.at(-1).text).toBe("JSON de la nómina al día · Jornadas: 2 → 3 (+1) · Ciclos: 1, al día");
  });

  it("de otra persona o más de un minuto después, va aparte", () => {
    const other = { ...snapshotLog("s2", "2026-11-18T10:22:01Z"), uid: "u2", userName: "María" };
    const later = snapshotLog("s3", "2026-11-18T10:30:00Z");
    expect(payrollHistoryOf([payrollLog, other, later]).map((e) => e.id)).toEqual(["s3", "s2", "n1"]);
  });

  it("los campos que no tienen su propia línea van en español", () => {
    const [entry] = payrollHistoryOf([{ id: "f1", action: "update", timestamp: ts(at), userName: "Bruno", changes: { format: { from: "bchile", to: "pagoFacilBchile" } } }]);
    expect(entry.lines.map((l) => l.text)).toEqual(["También cambió: formato del banco"]);
  });
});

describe("el grupo y las alertas revisadas en el historial", () => {
  const log = (id, changes) => ({ id, action: "update", timestamp: ts("2026-11-17T10:00:00Z"), userName: "María", changes });

  it("asignar grupos lo nombra, con el grupo de cada persona", () => {
    const changes = summarizeChanges("payroll", { items: { from: [ana, beto], to: [{ ...ana, groupLeader: "NORTE" }, beto] } });
    const [entry] = payrollHistoryOf([log("g1", changes)], []);
    expect(entry.title).toBe("Asignó grupos");
    expect(entry.lines.map((l) => l.text)).toEqual(["Ana Rojas: mismo líquido (grupo sin grupo → NORTE)"]);
  });

  it("un recálculo que además cambia el grupo sigue siendo Recalculó", () => {
    const changes = summarizeChanges("payroll", { items: { from: [ana], to: [{ ...ana, groupLeader: "NORTE", amount: 90000, advance: 10000 }] } });
    const [entry] = payrollHistoryOf([log("g2", changes)], []);
    expect(entry.title).toBe("Recalculó");
    expect(entry.lines[0].text).toContain("grupo sin grupo → NORTE");
  });

  it("marcar alertas revisadas dice cuáles y de quién", () => {
    const to = [{ keys: ["missingGroup|W1", "sharedAccount|W1", "sharedAccount|W2"], at: "t1" }];
    const [entry] = payrollHistoryOf([log("r1", { reviewedChecks: { from: [], to } })], [ana, beto]);
    expect(entry.title).toBe("Marcó alertas revisadas");
    expect(entry.lines.map((l) => l.text)).toEqual(["✓ Sin grupo: Ana Rojas", "✓ Cuenta compartida: Ana Rojas, Beto Soto"]);
  });

  it("desmarcar también lo dice, y el buscador encuentra a la persona", () => {
    const from = [{ keys: ["missingGroup|W1", "sharedAccount|W2"], at: "t1" }];
    const to = [{ keys: ["missingGroup|W1"], at: "t1" }, { keys: ["firstPayment|W1"], at: "t2" }];
    const entries = payrollHistoryOf([log("r2", { reviewedChecks: { from, to } })], [ana, beto]);
    expect(entries[0].title).toBe("Marcó y desmarcó alertas revisadas");
    expect(entries[0].lines.map((l) => l.text)).toEqual(["✓ Primera vez: Ana Rojas", "✗ desmarcó Cuenta compartida: Beto Soto"]);
    expect(filterPayrollHistory(entries, { query: "beto" })[0].lines.map((l) => l.text)).toEqual(["✗ desmarcó Cuenta compartida: Beto Soto"]);
  });
});

describe("los adjuntos en el historial", () => {
  const log = (id, changes) => ({ id, action: "update", timestamp: ts("2026-11-18T10:00:00Z"), userName: "María", changes });
  const cartola = { id: "a1", name: "cartola.pdf" };
  const comprobante = { id: "a2", name: "comprobante.jpg" };

  it("adjuntar nombra los archivos", () => {
    const [entry] = payrollHistoryOf([log("f1", { attachments: { from: [], to: [cartola, comprobante] } })], []);
    expect(entry.title).toBe("Adjuntó 2 archivos");
    expect(entry.lines.map((l) => l.text)).toEqual(["+ cartola.pdf", "+ comprobante.jpg"]);
  });

  it("quitar uno también, sin decir que cambió algo más", () => {
    const [entry] = payrollHistoryOf([log("f2", { attachments: { from: [cartola, comprobante], to: [comprobante] } })], []);
    expect(entry.title).toBe("Quitó un adjunto");
    expect(entry.lines.map((l) => l.text)).toEqual(["− cartola.pdf"]);
  });
});
