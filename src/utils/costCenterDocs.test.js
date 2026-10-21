import { describe, expect, it } from "vitest";
import {
  FUEL_VIEW_ID,
  centerDocTotals,
  centerDocsOf,
  centerInformalOf,
  companiesByName,
  filterCenterDocs,
  filterCenterInformal,
  informalTotalOf,
  sortCenterRows,
} from "./costCenterDocs";

const doc = (id, extra = {}) => ({
  id, companyId: "CO1", kind: "venta", tipo: 33, folio: 100, fechaEmision: "2026-10-05",
  rutReceptor: "77111111-1", razonSocialReceptor: "Cliente Uno", rutEmisor: "76123456-7", razonSocialEmisor: "Empresa",
  neto: 100, iva: 19, total: 119, costCenterId: "CC1", ...extra,
});
const exp = (id, extra = {}) => ({ id, costCenterId: "CC1", date: "2026-10-03", amount: 500, detail: "Peaje", companyId: "CO1", ...extra });
const filters = { kindFilter: "", companyFilterId: "", dateFrom: "", dateTo: "", search: "" };
const companiesById = new Map([["CO1", { id: "CO1", alias: "Prueba" }], ["CO2", { id: "CO2", razonSocial: "Agrícola Segunda" }]]);

describe("companiesByName", () => {
  it("ordena por alias o razón social", () => {
    expect(companiesByName(companiesById).map((c) => c.id)).toEqual(["CO2", "CO1"]);
  });
});

describe("centerDocsOf", () => {
  const docs = [doc("a"), doc("b", { costCenterId: "CC2" }), doc("c", { costCenterId: null, otroImpuestoCategory: "combustible" })];
  it("los del centro, o los de combustible en el centro automático", () => {
    expect(centerDocsOf(docs, "CC1").map((d) => d.id)).toEqual(["a"]);
    expect(centerDocsOf(docs, FUEL_VIEW_ID).map((d) => d.id)).toEqual(["c"]);
    expect(centerDocsOf(docs, "")).toEqual([]);
  });
});

describe("filterCenterDocs", () => {
  const baseDocs = [
    doc("a"),
    doc("b", { kind: "compra", rutEmisor: "78444444-4", razonSocialEmisor: "Ferretería", fechaEmision: "2026-09-30" }),
    doc("c", { companyId: "CO2", folio: 777 }),
  ];
  const ids = (o) => filterCenterDocs({ baseDocs, ...filters, ...o }).map((d) => d.id);

  it("por movimiento, empresa y fechas", () => {
    expect(ids({ kindFilter: "compra" })).toEqual(["b"]);
    expect(ids({ companyFilterId: "CO2" })).toEqual(["c"]);
    expect(ids({ dateFrom: "2026-10-01" })).toEqual(["a", "c"]);
    expect(ids({ dateTo: "2026-09-30" })).toEqual(["b"]);
  });

  it("busca por contraparte, RUT o folio", () => {
    expect(ids({ search: "ferre" })).toEqual(["b"]);
    expect(ids({ search: "78444444" })).toEqual(["b"]);
    expect(ids({ search: "777" })).toEqual(["c"]);
  });
});

describe("gastos informales", () => {
  const all = [exp("e1"), exp("e2", { costCenterId: "CC2" }), exp("e3", { companyId: "CO2", date: "2026-09-01", detail: "Flete" })];

  it("los del centro, marcados, y ninguno si se filtra por venta", () => {
    expect(centerInformalOf(all, "CC1", "").map((e) => [e.id, e.__informal])).toEqual([["e1", true], ["e3", true]]);
    expect(centerInformalOf(all, "CC1", "venta")).toEqual([]);
    expect(centerInformalOf(all, "", "")).toEqual([]);
  });

  it("se filtran por empresa, fechas y detalle, y suman aparte", () => {
    const baseInformal = centerInformalOf(all, "CC1", "");
    const ids = (o) => filterCenterInformal({ baseInformal, ...filters, ...o }).map((e) => e.id);
    expect(ids({ companyFilterId: "CO2" })).toEqual(["e3"]);
    expect(ids({ dateFrom: "2026-10-01" })).toEqual(["e1"]);
    expect(ids({ search: "flete" })).toEqual(["e3"]);
    expect(informalTotalOf(baseInformal)).toBe(1000);
  });
});

describe("centerDocTotals", () => {
  it("las NC restan", () => {
    expect(centerDocTotals([doc("a"), doc("b", { tipo: 61, neto: 10, iva: 2, total: 12 })])).toEqual({ neto: 90, iva: 17, total: 107 });
  });
});

describe("sortCenterRows", () => {
  const filtered = [doc("a", { fechaEmision: "2026-10-05", total: 300, folio: 5 }), doc("b", { fechaEmision: "2026-10-01", total: 100, folio: 9, companyId: "CO2" })];
  const informal = centerInformalOf([exp("e1", { date: "2026-10-03", amount: 200 })], "CC1", "");
  const ids = (sortBy) => sortCenterRows(filtered, informal, sortBy, companiesById).map((d) => d.id);

  it("junta documentos y gastos y los ordena por la columna elegida", () => {
    expect(ids({ key: "fechaEmision", dir: "asc" })).toEqual(["b", "e1", "a"]);
    expect(ids({ key: "total", dir: "desc" })).toEqual(["a", "e1", "b"]);
    expect(ids({ key: "folio", dir: "asc" })).toEqual(["e1", "a", "b"]);
    expect(ids({ key: "empresa", dir: "asc" })).toEqual(["b", "a", "e1"]);
  });
});
