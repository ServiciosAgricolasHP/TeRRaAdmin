import { describe, expect, it } from "vitest";
import {
  annualSummary,
  cancellingNcsByDoc,
  counterpartyOptions,
  docTotals,
  filterDocs,
  findCancellingNcs,
  pendingFor,
  periodOptionsOf,
  projectionYearsOf,
  receivablesOf,
  receivablesTotalsOf,
  sortDocs,
  summaryYearsOf,
  typeOptionsOf,
  withholdingsByCounterpartyOf,
} from "./billingDocs";

const sale = (id, extra = {}) => ({
  id, companyId: "CO1", kind: "venta", tipo: 33, folio: Number(id.replace(/\D/g, "")) || 1,
  rutReceptor: "77111111-1", razonSocialReceptor: "Cliente Uno", rutEmisor: "76123456-7", razonSocialEmisor: "Empresa",
  fechaEmision: "2026-10-05", periodo: "2026-10", neto: 100, iva: 19, total: 119, paymentStatus: "unpaid", amountPaid: 0, ...extra,
});
const purchase = (id, extra = {}) => sale(id, {
  kind: "compra", rutEmisor: "78444444-4", razonSocialEmisor: "Ferretería", rutReceptor: "76123456-7", razonSocialReceptor: "Empresa", ...extra,
});
const filterBase = { kindTab: "venta", isWithholdingsView: false, selectedCompanyId: "CO1", periodFilter: "2026-10", typeFilter: "", paymentFilter: "", search: "" };

describe("pendingFor", () => {
  it("impaga sin abonos debe el total; con abonos, el saldo", () => {
    expect(pendingFor(sale("a"))).toEqual({ category: "full", amount: 119 });
    expect(pendingFor(sale("a", { amountPaid: 50 }))).toEqual({ category: "partial", amount: 69 });
    expect(pendingFor(sale("a", { amountPaid: 118.6 }))).toBeNull();
  });

  it("solo neto debe el IVA menos lo pagado por encima del neto", () => {
    expect(pendingFor(sale("a", { paymentStatus: "net_only", amountPaid: 100 }))).toEqual({ category: "iva", amount: 19 });
    expect(pendingFor(sale("a", { paymentStatus: "net_only", amountPaid: 110 }))).toEqual({ category: "iva", amount: 9 });
    expect(pendingFor(sale("a", { paymentStatus: "net_only", amountPaid: 119 }))).toBeNull();
  });

  it("pagada, cedida, anulada y las NC no deben nada", () => {
    for (const paymentStatus of ["paid", "factored", "cancelled"]) expect(pendingFor(sale("a", { paymentStatus }))).toBeNull();
    expect(pendingFor(sale("a", { tipo: 61 }))).toBeNull();
  });
});

describe("findCancellingNcs y cancellingNcsByDoc", () => {
  const inv = sale("i1", { total: 357, fechaEmision: "2026-10-03" });
  const nc = sale("n1", { tipo: 61, total: 357, fechaEmision: "2026-10-10" });
  it("la NC de la misma contraparte y total, emitida después, calza", () => {
    expect(findCancellingNcs(inv, [inv, nc]).map((d) => d.id)).toEqual(["n1"]);
  });

  it("otra empresa, otro tipo de documento, otro RUT, otro total o una NC anterior no calzan", () => {
    const docs = [
      { ...nc, id: "x1", companyId: "CO2" },
      { ...nc, id: "x2", kind: "compra" },
      { ...nc, id: "x3", rutReceptor: "77999999-9" },
      { ...nc, id: "x4", total: 356 },
      { ...nc, id: "x5", fechaEmision: "2026-10-01" },
    ];
    expect(findCancellingNcs(inv, docs)).toEqual([]);
    expect(findCancellingNcs(nc, [inv, nc])).toEqual([]);
  });

  it("el mapa deja fuera las NC y las facturas ya anuladas", () => {
    const cancelled = { ...inv, id: "i2", paymentStatus: "cancelled" };
    const map = cancellingNcsByDoc([inv, nc, cancelled]);
    expect([...map.keys()]).toEqual(["i1"]);
  });
});

describe("filterDocs", () => {
  const docs = [
    sale("v1"),
    sale("v2", { periodo: "2026-09", fechaEmision: "2026-09-02", razonSocialReceptor: "Exportadora Cinco", rutReceptor: "77555555-5", folio: 300 }),
    sale("v3", { paymentStatus: "net_only", tipo: 34 }),
    sale("v4", { companyId: "CO2" }),
    purchase("c1", { paymentStatus: "net_only" }),
    purchase("c2", { paymentStatus: "paid" }),
  ];
  const ids = (arr) => arr.map((d) => d.id);

  it("por pestaña, empresa y período", () => {
    expect(ids(filterDocs({ docs, ...filterBase }))).toEqual(["v1", "v3"]);
    expect(ids(filterDocs({ docs, ...filterBase, kindTab: "compra" }))).toEqual(["c1", "c2"]);
    expect(ids(filterDocs({ docs, ...filterBase, periodFilter: "" }))).toEqual(["v1", "v2", "v3"]);
    expect(ids(filterDocs({ docs, ...filterBase, selectedCompanyId: "" }))).toEqual(["v1", "v3", "v4"]);
  });

  it("retenciones: todo lo que está en solo neto, venta o compra", () => {
    expect(ids(filterDocs({ docs, ...filterBase, kindTab: "retenciones", isWithholdingsView: true }))).toEqual(["v3", "c1"]);
  });

  it("el estado de pago solo filtra en ventas", () => {
    expect(ids(filterDocs({ docs, ...filterBase, paymentFilter: "net_only" }))).toEqual(["v3"]);
    expect(ids(filterDocs({ docs, ...filterBase, kindTab: "compra", paymentFilter: "net_only" }))).toEqual(["c1", "c2"]);
  });

  it("por tipo de documento", () => {
    expect(ids(filterDocs({ docs, ...filterBase, typeFilter: "34" }))).toEqual(["v3"]);
  });

  it("buscar ignora el período: por razón social, RUT o folio", () => {
    expect(ids(filterDocs({ docs, ...filterBase, search: "exportadora" }))).toEqual(["v2"]);
    expect(ids(filterDocs({ docs, ...filterBase, search: "77555555" }))).toEqual(["v2"]);
    expect(ids(filterDocs({ docs, ...filterBase, search: "300" }))).toEqual(["v2"]);
  });
});

describe("sortDocs", () => {
  const docs = [
    sale("a", { folio: 3, total: 500, paymentStatus: "paid", fechaEmision: "2026-10-02" }),
    sale("b", { folio: 1, total: 900, paymentStatus: "unpaid", fechaEmision: "2026-10-03", tipo: 61 }),
    sale("c", { folio: 2, total: 100, paymentStatus: "net_only", fechaEmision: "2026-10-01", amountPaid: 50 }),
  ];
  const ids = (arr) => arr.map((d) => d.id);

  it("números como números y texto como texto, en las dos direcciones", () => {
    expect(ids(sortDocs(docs, { key: "folio", dir: "asc" }, "venta"))).toEqual(["b", "c", "a"]);
    expect(ids(sortDocs(docs, { key: "total", dir: "desc" }, "venta"))).toEqual(["b", "a", "c"]);
    expect(ids(sortDocs(docs, { key: "fechaEmision", dir: "desc" }, "venta"))).toEqual(["b", "a", "c"]);
    expect(ids(sortDocs(docs, { key: "saldo", dir: "asc" }, "venta"))).toEqual(["c", "a", "b"]);
  });

  it("por estado, las NC quedan al final en orden ascendente", () => {
    expect(ids(sortDocs(docs, { key: "estado", dir: "asc" }, "venta"))).toEqual(["c", "a", "b"]);
  });

  it("no cambia el arreglo recibido", () => {
    const before = ids(docs);
    sortDocs(docs, { key: "folio", dir: "asc" }, "venta");
    expect(ids(docs)).toEqual(before);
  });
});

describe("opciones de los selectores", () => {
  const docs = [
    sale("v1", { razonSocialReceptor: "Beta" }),
    sale("v2", { razonSocialReceptor: "Alfa", periodo: "2026-08", tipo: 61 }),
    sale("v3", { companyId: "CO2", razonSocialReceptor: "Gamma", periodo: "2025-12" }),
    purchase("c1", { razonSocialEmisor: "Proveedor", periodo: "2026-07", paymentStatus: "net_only", tipo: 46 }),
  ];

  it("contrapartes de la pestaña y la empresa, sin repetir y ordenadas", () => {
    expect(counterpartyOptions({ docs, kindTab: "venta", isWithholdingsView: false, selectedCompanyId: "CO1" })).toEqual(["Alfa", "Beta"]);
    expect(counterpartyOptions({ docs, kindTab: "retenciones", isWithholdingsView: true, selectedCompanyId: "CO1" })).toEqual(["Alfa", "Beta", "Proveedor"]);
  });

  it("períodos con documentos, más el actual, del más nuevo al más viejo", () => {
    expect(periodOptionsOf({ docs, kindTab: "venta", isWithholdingsView: false, selectedCompanyId: "CO1", current: "2026-10" })).toEqual(["2026-10", "2026-08"]);
    expect(periodOptionsOf({ docs, kindTab: "retenciones", isWithholdingsView: true, selectedCompanyId: "CO1", current: "2026-10" })).toEqual(["2026-10", "2026-07"]);
  });

  it("tipos de documento de la pestaña, en orden numérico", () => {
    expect(typeOptionsOf({ docs, kindTab: "venta", selectedCompanyId: "CO1" })).toEqual([33, 61]);
    expect(typeOptionsOf({ docs, kindTab: "venta", selectedCompanyId: "" })).toEqual([33, 61]);
  });

  it("años del resumen y de la proyección", () => {
    expect(summaryYearsOf(docs, "CO1", 2026)).toEqual(["2026"]);
    expect(summaryYearsOf(docs, "", 2026)).toEqual(["2026", "2025"]);
    expect(projectionYearsOf(docs, "CO2", 2026)).toEqual(["2028", "2027", "2026", "2025"]);
  });
});

describe("docTotals", () => {
  it("las NC restan y se cuentan aparte; los estados suman solo facturas", () => {
    const t = docTotals([
      sale("a"),
      sale("b", { paymentStatus: "net_only", neto: 200, iva: 38, total: 238 }),
      sale("c", { paymentStatus: "factored", total: 50, neto: 42, iva: 8 }),
      sale("d", { tipo: 61, neto: 10, iva: 2, total: 12 }),
    ]);
    expect(t).toEqual({
      neto: 332, iva: 63, total: 395, count: 4, ncTotal: 12, ncCount: 1,
      unpaidTotal: 119, netOnlyTotal: 238, netOnlyIva: 38, factoredTotal: 50,
    });
  });
});

describe("withholdingsByCounterpartyOf", () => {
  it("agrupa por RUT de la contraparte y ordena por IVA retenido", () => {
    const groups = withholdingsByCounterpartyOf([
      sale("a", { iva: 10 }),
      sale("b", { iva: 15, rutReceptor: "77222222-2", razonSocialReceptor: "Dos" }),
      sale("c", { iva: 10 }),
      purchase("d", { iva: 5 }),
    ], true);
    expect(groups.map((g) => [g.rut, g.count, g.iva])).toEqual([["77111111-1", 2, 20], ["77222222-2", 1, 15], ["78444444-4", 1, 5]]);
  });

  it("fuera de la pestaña de retenciones no agrupa", () => {
    expect(withholdingsByCounterpartyOf([sale("a")], false)).toEqual([]);
  });
});

describe("receivablesOf y receivablesTotalsOf", () => {
  const docs = [
    sale("a", { paymentStatus: "net_only", amountPaid: 100, fechaEmision: "2026-09-01" }),
    sale("b", { amountPaid: 50, fechaEmision: "2026-10-09" }),
    sale("c", { fechaEmision: "2026-10-08" }),
    sale("d", { fechaEmision: "2026-10-01" }),
    sale("e", { companyId: "CO2" }),
    purchase("f"),
  ];

  it("solo ventas de la empresa, por categoría y después por fecha", () => {
    const list = receivablesOf(docs, "CO1");
    expect(list.map((d) => [d.id, d._category, d._pending])).toEqual([["d", "full", 119], ["c", "full", 119], ["b", "partial", 69], ["a", "iva", 19]]);
    expect(receivablesTotalsOf(list)).toEqual({ full: 238, partial: 69, iva: 19, total: 326, count: { full: 2, partial: 1, iva: 1 } });
  });
});

describe("annualSummary", () => {
  it("ventas al débito y compras al crédito, mes a mes, con las NC restando", () => {
    const { months, total } = annualSummary([
      sale("a", { periodo: "2026-03", neto: 1000, iva: 190, total: 1190 }),
      sale("b", { periodo: "2026-03", tipo: 61, neto: 100, iva: 19, total: 119 }),
      purchase("c", { periodo: "2026-03", neto: 400, iva: 76, total: 476 }),
      purchase("d", { periodo: "2026-12", neto: 50, iva: 9, total: 59 }),
      sale("e", { periodo: "2025-03", neto: 9999 }),
      sale("f", { periodo: "2026-03", companyId: "CO2", neto: 9999 }),
    ], "CO1", "2026");
    expect(months[2]).toEqual({ salesNet: 900, vatDebit: 171, salesTotal: 1071, salesCount: 2, purchasesNet: 400, vatCredit: 76, purchasesTotal: 476, purchasesCount: 1 });
    expect(months[11].vatCredit).toBe(9);
    expect(total).toEqual({ salesNet: 900, vatDebit: 171, salesTotal: 1071, salesCount: 2, purchasesNet: 450, vatCredit: 85, purchasesTotal: 535, purchasesCount: 2 });
  });
});
