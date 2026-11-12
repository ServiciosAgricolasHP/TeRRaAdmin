import { describe, it, expect, vi } from "vitest";

// `dteImportService.js` importa `../firebase`; lo que se prueba acá es puro.
vi.mock("../firebase", () => ({ db: {}, auth: { currentUser: null } }));

const { importOrphans, manualDataOf } = await import("./dteImportService");

const doc = (id, extra = {}) => ({ id, companyId: "EMP", kind: "venta", periodo: "2026-03", ...extra });

describe("importOrphans", () => {
  it("los documentos de la empresa en los mismos períodos y kinds que no vienen en el archivo", () => {
    const docs = [
      doc("a"),
      doc("b"),
      doc("c", { periodo: "2026-02" }),
      doc("d", { kind: "compra" }),
      doc("e", { companyId: "OTRA" }),
    ];
    const records = [doc("a"), doc("x")];
    expect(importOrphans(docs, "EMP", records).map((d) => d.id)).toEqual(["b"]);
  });

  it("sin registros no elimina nada", () => {
    expect(importOrphans([doc("a")], "EMP", [])).toEqual([]);
  });
});

describe("manualDataOf", () => {
  it("lista lo que se le cargó a mano", () => {
    expect(manualDataOf(doc("a", { paymentStatus: "unpaid" }))).toEqual([]);
    expect(
      manualDataOf(doc("a", { paymentStatus: "paid", payments: [{ amount: 1 }], notes: "llamar", costCenterId: "cc1" })),
    ).toEqual(["estado de pago", "abonos", "notas", "centro de costo"]);
    expect(manualDataOf(doc("a", { notes: "   ", payments: [] }))).toEqual([]);
  });
});
