import { describe, it, expect } from "vitest";
import { pinKeyOf, receivablesView, pendingDocsOf, withoutResolved } from "./receivables";

// Datos inventados: dos empresas y dos clientes.
const ROBLE = { rutReceptor: "77111111-1", razonSocialReceptor: "Comercial El Roble SpA" };
const BRISAS = { rutReceptor: "78222222-2", razonSocialReceptor: "Exportadora Las Brisas SpA" };
const sale = (id, extra = {}) => ({
  id, companyId: "E1", companyAlias: "Agrícola Demo", kind: "venta", tipo: 33, folio: Number(id.replace(/\D/g, "")) || 1,
  ...ROBLE, fechaEmision: "2026-10-05", periodo: "2026-10", neto: 1000, iva: 190, total: 1190,
  paymentStatus: "unpaid", amountPaid: 0, ...extra,
});
const vat = (id, fecha, extra = {}) => sale(id, { paymentStatus: "net_only", amountPaid: 1000, fechaEmision: fecha, periodo: fecha.slice(0, 7), ...extra });

describe("receivablesView", () => {
  const docs = [
    sale("f1"),
    sale("f2", { amountPaid: 400 }),
    sale("f3", { ...BRISAS, companyId: "E2", companyAlias: "Transportes Demo", total: 5950, neto: 5000, iva: 950 }),
    vat("v1", "2026-10-20"),
    vat("v2", "2026-09-10"),
    vat("v3", "2026-09-25", { companyId: "E2", companyAlias: "Transportes Demo" }),
    vat("v4", "2026-09-12", BRISAS),
    sale("p1", { paymentStatus: "paid" }),
    sale("c1", { kind: "compra" }),
    sale("nc", { tipo: 61 }),
  ];

  it("junta las facturas por cobrar por cliente, de todas las empresas, la que más debe primero", () => {
    const view = receivablesView(docs);
    expect(view.invoices.map((g) => [g.razon, g.total, g.count])).toEqual([
      ["Exportadora Las Brisas SpA", 5950, 1],
      ["Comercial El Roble SpA", 1980, 2],
    ]);
    expect(view.invoices[1].rows.map((r) => [r.doc.id, r.category, r.pending])).toEqual([
      ["f1", "full", 1190],
      ["f2", "partial", 790],
    ]);
  });

  it("agrupa el IVA pendiente por cliente y por mes, del más viejo al más nuevo, con subtotales", () => {
    const roble = receivablesView(docs).vat.find((g) => g.razon === "Comercial El Roble SpA");
    expect(roble.total).toBe(570);
    expect(roble.months.map((m) => [m.periodo, m.total, m.rows.map((r) => r.doc.id)])).toEqual([
      ["2026-09", 380, ["v2", "v3"]],
      ["2026-10", 190, ["v1"]],
    ]);
  });

  it("desglosa el total de un cliente por empresa", () => {
    const roble = receivablesView(docs).vat.find((g) => g.razon === "Comercial El Roble SpA");
    expect(roble.byCompany).toEqual([
      { companyId: "E1", amount: 380 },
      { companyId: "E2", amount: 190 },
    ]);
  });

  it("filtra por empresa, por categoría y por búsqueda, con los totales de cada categoría", () => {
    const e1 = receivablesView(docs, { companyId: "E1" });
    expect(e1.totals).toEqual({ full: 1190, partial: 790, iva: 570, total: 2550, count: { full: 1, partial: 1, iva: 3, total: 5 } });

    const onlyVat = receivablesView(docs, { category: "iva" });
    expect(onlyVat.invoices).toEqual([]);
    expect(onlyVat.visibleTotal).toBe(760);
    expect(onlyVat.visibleCount).toBe(4);

    expect(receivablesView(docs, { search: "brisas" }).totals.count.total).toBe(2);
    expect(receivablesView(docs, { search: "78.222.222" }).totals.count.total).toBe(2);
    expect(receivablesView(docs, { search: "transportes" }).totals.count.total).toBe(2);
  });

  it("una factura resuelta en la visita sigue en su lugar, sin sumar, y no cambia el orden", () => {
    const paid = docs.map((d) => (d.id === "f3" ? { ...d, paymentStatus: "paid" } : d));
    const pinned = new Map([[pinKeyOf("f3", "full"), { category: "full", pending: 5950 }]]);
    const view = receivablesView(paid, { pinned });
    expect(view.invoices.map((g) => [g.razon, g.total])).toEqual([
      ["Exportadora Las Brisas SpA", 0],
      ["Comercial El Roble SpA", 1980],
    ]);
    expect(view.invoices[0].rows).toEqual([{ doc: paid[2], category: "full", pending: 5950, resolved: true }]);
    expect(view.totals.total).toBe(1980 + 760);
    expect(pendingDocsOf(view.invoices[0].rows)).toEqual([]);
  });

  it("una factura que pasa a solo neto queda resuelta entre las facturas y pendiente en el IVA", () => {
    const moved = docs.map((d) => (d.id === "f1" ? { ...d, paymentStatus: "net_only", amountPaid: 1000 } : d));
    const view = receivablesView(moved, { pinned: new Map([[pinKeyOf("f1", "full"), { category: "full", pending: 1190 }]]) });
    const roble = view.invoices.find((g) => g.razon === "Comercial El Roble SpA");
    expect(roble.rows.map((r) => [r.doc.id, r.resolved])).toEqual([["f1", true], ["f2", false]]);
    const vatOct = view.vat.find((g) => g.razon === "Comercial El Roble SpA").months.find((m) => m.periodo === "2026-10");
    expect(vatOct.rows.map((r) => r.doc.id)).toEqual(["f1", "v1"]);
  });

  it("una factura fijada en las dos secciones sigue en las dos al quedar pagada", () => {
    const paid = docs.map((d) => (d.id === "f1" ? { ...d, paymentStatus: "paid", amountPaid: 1190 } : d));
    const pinned = new Map([
      [pinKeyOf("f1", "full"), { category: "full", pending: 1190 }],
      [pinKeyOf("f1", "iva"), { category: "iva", pending: 190 }],
    ]);
    const view = receivablesView(paid, { pinned });
    const roble = view.invoices.find((g) => g.razon === "Comercial El Roble SpA");
    expect(roble.rows.map((r) => [r.doc.id, r.resolved])).toEqual([["f1", true], ["f2", false]]);
    const vatOct = view.vat.find((g) => g.razon === "Comercial El Roble SpA").months.find((m) => m.periodo === "2026-10");
    expect(vatOct.rows.map((r) => [r.doc.id, r.category, r.resolved])).toEqual([["f1", "iva", true], ["v1", "iva", false]]);
    expect(vatOct.total).toBe(190);
  });

  it("una factura que sigue pendiente en la misma sección se ve una sola vez", () => {
    const abonada = docs.map((d) => (d.id === "f1" ? { ...d, amountPaid: 400 } : d));
    const view = receivablesView(abonada, { pinned: new Map([[pinKeyOf("f1", "full"), { category: "full", pending: 1190 }]]) });
    const roble = view.invoices.find((g) => g.razon === "Comercial El Roble SpA");
    expect(roble.rows.map((r) => [r.doc.id, r.category, r.resolved])).toEqual([["f1", "partial", false], ["f2", "partial", false]]);
  });

  it("pendingDocsOf devuelve las facturas que siguen pendientes", () => {
    const roble = receivablesView(docs).invoices.find((g) => g.razon === "Comercial El Roble SpA");
    expect(pendingDocsOf(roble.rows).map((d) => d.id)).toEqual(["f1", "f2"]);
  });

  it("withoutResolved deja lo que sigue pendiente, sin meses ni clientes vacíos", () => {
    const paid = docs.map((d) => (["f3", "v4"].includes(d.id) ? { ...d, paymentStatus: "paid" } : d));
    const pinned = new Map([[pinKeyOf("f3", "full"), { category: "full", pending: 5950 }], [pinKeyOf("v4", "iva"), { category: "iva", pending: 190 }]]);
    const view = withoutResolved(receivablesView(paid, { pinned }));
    expect(view.invoices.map((g) => g.razon)).toEqual(["Comercial El Roble SpA"]);
    expect(view.vat.map((g) => [g.razon, g.months.map((m) => m.periodo)])).toEqual([["Comercial El Roble SpA", ["2026-09", "2026-10"]]]);
  });
});
